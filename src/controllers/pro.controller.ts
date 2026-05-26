import { Request, Response } from "express"
import { supabase } from "../config/supabase"
import { io } from "../server"

export async function getProPlayers(req: Request, res: Response) {
  const { data, error } = await supabase
    .from("users")
    .select(`
      id,
      email,
      role,
      profiles (
        username,
        display_name,
        avatar_url,
        banner_url,
        bio,
        favorite_game,
        game_rank,
        preferred_role,
        region,
        average_rating
      ),
      pro_player_settings (
        price_per_hour,
        available_games,
        description,
        is_accepting_booking
      )
    `)
    .eq("role", "pro_player")

  if (error) {
    return res.status(400).json({ message: error.message })
  }

  return res.json(data)
}

export async function upsertProSettings(req: Request, res: Response) {
  const userId = req.user.id

  const {
    price_per_hour = 1000,
    available_games = [],
    description = "",
    is_accepting_booking = true,
  } = req.body

  if (req.user.role !== "pro_player" && req.user.role !== "admin") {
    return res.status(403).json({
      message: "Hanya pro player yang bisa mengatur layanan VIP",
    })
  }

  const { data, error } = await supabase
    .from("pro_player_settings")
    .upsert(
      {
        user_id: userId,
        price_per_hour,
        available_games,
        description,
        is_accepting_booking,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id",
      }
    )
    .select()
    .single()

  if (error) {
    return res.status(400).json({ message: error.message })
  }

  return res.json({
    message: "Setting pro player berhasil disimpan",
    settings: data,
  })
}

export async function getMyProSettings(req: Request, res: Response) {
  const userId = req.user.id

  const { data, error } = await supabase
    .from("pro_player_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    return res.status(400).json({ message: error.message })
  }

  return res.json(data)
}

export async function createProBooking(req: Request, res: Response) {
  const requesterId = req.user.id

  const {
    pro_player_id,
    game,
    game_id,
    duration_hours = 1,
    scheduled_at,
    note,
  } = req.body

  if (!pro_player_id || !scheduled_at) {
    return res.status(400).json({
      message: "pro_player_id dan scheduled_at wajib diisi",
    })
  }

  if (!game && !game_id) {
    return res.status(400).json({
      message: "game atau game_id wajib diisi",
    })
  }

  if (requesterId === pro_player_id) {
    return res.status(400).json({
      message: "Tidak bisa booking diri sendiri",
    })
  }

  const duration = Number(duration_hours)

  if (!duration || duration <= 0) {
    return res.status(400).json({
      message: "Durasi booking tidak valid",
    })
  }

  const startAt = new Date(scheduled_at)
  const endAt = new Date(startAt.getTime() + duration * 60 * 60 * 1000)

  if (startAt.getTime() < Date.now()) {
    return res.status(400).json({
      message: "Jadwal booking tidak boleh di masa lalu",
    })
  }

  const { data: activeUserBooking } = await supabase
    .from("pro_player_bookings")
    .select("id, status")
    .eq("requester_id", requesterId)
    .eq("pro_player_id", pro_player_id)
    .in("status", ["pending_payment", "pending", "accepted"])
    .maybeSingle()

  if (activeUserBooking) {
    return res.status(400).json({
      message:
        "Kamu masih punya booking aktif dengan pro player ini. Selesaikan dulu sebelum booking lagi.",
    })
  }

  const { data: conflictBooking } = await supabase
    .from("pro_player_bookings")
    .select("id, scheduled_at, session_end_at, status")
    .eq("pro_player_id", pro_player_id)
    .in("status", ["pending", "accepted"])
    .lt("scheduled_at", endAt.toISOString())
    .gt("session_end_at", startAt.toISOString())
    .maybeSingle()

  if (conflictBooking) {
    return res.status(400).json({
      message:
        "Jadwal pro player bentrok dengan booking lain. Pilih jam lain.",
    })
  }

  const { data: proUser, error: proUserError } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", pro_player_id)
    .single()

  if (proUserError || !proUser || proUser.role !== "pro_player") {
    return res.status(404).json({
      message: "Pro player tidak ditemukan",
    })
  }

  const { data: settings } = await supabase
    .from("pro_player_settings")
    .select("*")
    .eq("user_id", pro_player_id)
    .maybeSingle()

  if (settings && !settings.is_accepting_booking) {
    return res.status(400).json({
      message: "Pro player sedang tidak menerima booking",
    })
  }

  const pricePerHour = Number(settings?.price_per_hour || 1000)
  const totalPrice = pricePerHour * duration
  const durationMinutes = duration * 60

  const insertPayload: any = {
    requester_id: requesterId,
    pro_player_id,
    duration_hours: duration,
    duration_minutes: durationMinutes,
    scheduled_at: startAt.toISOString(),
    session_date: startAt.toISOString(),
    session_end_at: endAt.toISOString(),
    note: note || null,
    notes: note || null,
    price: totalPrice,
    payment_status: "unpaid",
    status: "pending_payment",
  }

  if (game_id) insertPayload.game_id = game_id
  if (game) insertPayload.game = game

  const { data: booking, error } = await supabase
    .from("pro_player_bookings")
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    return res.status(400).json({
      message: error.message,
      details: error,
    })
  }

  const { data: notification } = await supabase
    .from("notifications")
    .insert({
      user_id: requesterId,
      sender_id: pro_player_id,
      type: "pro_booking_created",
      title: "Booking VIP dibuat",
      message: "Booking berhasil dibuat. Silakan lakukan pembayaran demo.",
      data: {
        bookingId: booking.id,
      },
    })
    .select()
    .single()

  if (notification) {
    io.to(`user:${requesterId}`).emit("notification_received", notification)
  }

  return res.status(201).json({
    message: "Booking berhasil dibuat",
    booking,
  })
}

export async function payDemoBooking(req: Request, res: Response) {
  const userId = req.user.id
  const { bookingId } = req.params

  const { data: booking, error: bookingError } = await supabase
    .from("pro_player_bookings")
    .select("*")
    .eq("id", bookingId)
    .single()

  if (bookingError || !booking) {
    return res.status(404).json({ message: "Booking tidak ditemukan" })
  }

  if (booking.requester_id !== userId) {
    return res.status(403).json({ message: "Kamu bukan pemilik booking ini" })
  }

  if (booking.payment_status === "paid_demo") {
    return res.status(400).json({ message: "Booking sudah dibayar" })
  }

  const price = Number(booking.price || 0)

  const { data: wallet, error: walletError } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", userId)
    .single()

  if (walletError || !wallet) {
    return res.status(404).json({ message: "Wallet tidak ditemukan" })
  }

  if (Number(wallet.balance) < price) {
    return res.status(400).json({ message: "Point tidak cukup" })
  }

  const { error: deductError } = await supabase
    .from("wallets")
    .update({
      balance: Number(wallet.balance) - price,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)

  if (deductError) {
    return res.status(400).json({ message: deductError.message })
  }

  const { data: updated, error } = await supabase
    .from("pro_player_bookings")
    .update({
      payment_status: "paid_demo",
      status: "pending",
      paid_at: new Date().toISOString(),
    })
    .eq("id", bookingId)
    .select()
    .single()

  if (error) {
    return res.status(400).json({ message: error.message })
  }

  await supabase.from("wallet_transactions").insert({
    user_id: userId,
    target_user_id: booking.pro_player_id,
    type: "pro_booking_payment",
    amount: price,
    status: "success",
    message: `Payment booking VIP ${bookingId}`,
  })

  return res.json({
    message: "Pembayaran berhasil. Menunggu pro player menerima booking.",
    booking: updated,
  })
}

export async function acceptProBooking(req: Request, res: Response) {
  const proPlayerId = req.user.id
  const { bookingId } = req.params

  const { data: booking, error: bookingError } = await supabase
    .from("pro_player_bookings")
    .select("*")
    .eq("id", bookingId)
    .single()

  if (bookingError || !booking) {
    return res.status(404).json({ message: "Booking tidak ditemukan" })
  }

  if (booking.pro_player_id !== proPlayerId && req.user.role !== "admin") {
    return res.status(403).json({
      message: "Hanya pro player terkait yang bisa menerima booking",
    })
  }

  if (booking.payment_status !== "paid_demo") {
    return res.status(400).json({ message: "Booking belum dibayar user" })
  }

  if (booking.status === "accepted") {
    return res.status(400).json({ message: "Booking sudah diterima" })
  }

  const price = Number(booking.price || 0)
  const platformFee = Math.floor(price * 0.2)
  const proEarning = price - platformFee

  const { data: proWallet } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", booking.pro_player_id)
    .maybeSingle()

  if (!proWallet) {
    await supabase.from("wallets").insert({
      user_id: booking.pro_player_id,
      balance: 0,
      total_topup: 0,
      total_gift_sent: 0,
      total_gift_received: 0,
    })
  }

  const { data: latestProWallet } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", booking.pro_player_id)
    .single()

  await supabase
    .from("wallets")
    .update({
      balance: Number(latestProWallet.balance || 0) + proEarning,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", booking.pro_player_id)

  const { data: chat, error: chatError } = await supabase
    .from("pro_booking_chats")
    .insert({
      booking_id: booking.id,
      user_id: booking.requester_id,
      pro_player_id: booking.pro_player_id,
    })
    .select()
    .single()

  if (chatError) {
    return res.status(400).json({ message: chatError.message })
  }

  const { data: updated, error } = await supabase
    .from("pro_player_bookings")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      platform_fee: platformFee,
      pro_earning: proEarning,
      chat_id: chat.id,
    })
    .eq("id", bookingId)
    .select()
    .single()

  if (error) {
    return res.status(400).json({ message: error.message })
  }

  await supabase.from("wallet_transactions").insert({
    user_id: booking.pro_player_id,
    target_user_id: booking.requester_id,
    type: "pro_booking_income",
    amount: proEarning,
    status: "success",
    message: `Income booking VIP ${bookingId}, fee platform ${platformFee}`,
  })

  return res.json({
    message: "Booking diterima. Chat VIP sudah dibuka.",
    booking: updated,
    chat,
  })
}

export async function rejectProBooking(req: Request, res: Response) {
  const proPlayerId = req.user.id
  const { bookingId } = req.params
  const { reason } = req.body

  const { data: booking, error: bookingError } = await supabase
    .from("pro_player_bookings")
    .select("*")
    .eq("id", bookingId)
    .single()

  if (bookingError || !booking) {
    return res.status(404).json({
      message: "Booking tidak ditemukan",
    })
  }

  if (booking.pro_player_id !== proPlayerId && req.user.role !== "admin") {
    return res.status(403).json({
      message: "Hanya pro player terkait yang bisa menolak booking",
    })
  }

  if (booking.status === "accepted") {
    return res.status(400).json({
      message: "Booking sudah diterima, tidak bisa ditolak",
    })
  }

  if (booking.status === "rejected") {
    return res.status(400).json({
      message: "Booking sudah ditolak",
    })
  }

  const price = Number(booking.price || 0)

  if (booking.payment_status === "paid_demo") {
    const { data: userWallet, error: walletError } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", booking.requester_id)
      .single()

    if (walletError || !userWallet) {
      return res.status(404).json({
        message: "Wallet user tidak ditemukan untuk refund",
      })
    }

    const { error: refundError } = await supabase
      .from("wallets")
      .update({
        balance: Number(userWallet.balance || 0) + price,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", booking.requester_id)

    if (refundError) {
      return res.status(400).json({
        message: refundError.message,
      })
    }

    await supabase.from("wallet_transactions").insert({
      user_id: booking.requester_id,
      target_user_id: booking.pro_player_id,
      type: "pro_booking_refund",
      amount: price,
      status: "success",
      message: `Refund booking VIP ${bookingId}`,
    })
  }

  const rejectNote = reason || "Ditolak oleh pro player"

  const { data: updated, error } = await supabase
    .from("pro_player_bookings")
    .update({
      status: "rejected",
      payment_status:
        booking.payment_status === "paid_demo" ? "refunded" : booking.payment_status,
      rejected_at: new Date().toISOString(),
      notes: rejectNote,
      note: rejectNote,
    })
    .eq("id", bookingId)
    .select()
    .single()

  if (error) {
    return res.status(400).json({ message: error.message })
  }

  const { data: notification } = await supabase
    .from("notifications")
    .insert({
      user_id: booking.requester_id,
      sender_id: proPlayerId,
      type: "pro_booking_rejected",
      title: "Booking VIP ditolak",
      message:
        booking.payment_status === "paid_demo"
          ? `${rejectNote}. Point sudah dikembalikan.`
          : rejectNote,
      data: {
        bookingId,
      },
    })
    .select()
    .single()

  if (notification) {
    io.to(`user:${booking.requester_id}`).emit(
      "notification_received",
      notification
    )
  }

  return res.json({
    message:
      booking.payment_status === "paid_demo"
        ? "Booking ditolak dan point user dikembalikan"
        : "Booking berhasil ditolak",
    booking: updated,
  })
}

export async function getMyBookings(req: Request, res: Response) {
  const userId = req.user.id

  const { data, error } = await supabase
    .from("pro_player_bookings")
    .select("*")
    .or(`requester_id.eq.${userId},pro_player_id.eq.${userId}`)
    .order("created_at", { ascending: false })

  if (error) {
    console.log("GET MY BOOKINGS ERROR:", error)

    return res.status(400).json({
      message: error.message,
      details: error,
    })
  }

  return res.json(data)
}