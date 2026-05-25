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

  const pricePerHour = settings?.price_per_hour || 1000
  const totalPrice = pricePerHour * Number(duration_hours)
  const durationMinutes = Number(duration_hours) * 60

  const insertPayload: any = {
    requester_id: requesterId,
    pro_player_id,
    duration_hours: Number(duration_hours),
    duration_minutes: durationMinutes,
    scheduled_at,
    session_date: scheduled_at,
    note: note || null,
    notes: note || null,
    price: totalPrice,
    payment_status: "pending_demo",
    status: "pending_payment",
  }

  if (game_id) {
    insertPayload.game_id = game_id
  }

  if (game) {
    insertPayload.game = game
  }

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
    return res.status(404).json({
      message: "Booking tidak ditemukan",
    })
  }

  if (booking.requester_id !== userId) {
    return res.status(403).json({
      message: "Kamu tidak punya akses ke booking ini",
    })
  }

  if (booking.payment_status === "paid_demo") {
    return res.status(400).json({
      message: "Booking ini sudah dibayar demo",
    })
  }

  const { data: updated, error } = await supabase
    .from("pro_player_bookings")
    .update({
      payment_status: "paid_demo",
      status: "pending",
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
      user_id: booking.pro_player_id,
      sender_id: userId,
      type: "pro_booking_paid_demo",
      title: "Booking VIP baru",
      message:
        "Ada booking VIP yang sudah dibayar demo. Terima atau tolak sekarang.",
      data: {
        bookingId,
      },
    })
    .select()
    .single()

  if (notification) {
    io.to(`user:${booking.pro_player_id}`).emit(
      "notification_received",
      notification
    )
  }

  return res.json({
    message: "Pembayaran demo berhasil. Menunggu respon pro player.",
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
    return res.status(404).json({
      message: "Booking tidak ditemukan",
    })
  }

  if (booking.pro_player_id !== proPlayerId && req.user.role !== "admin") {
    return res.status(403).json({
      message: "Hanya pro player terkait yang bisa menerima booking",
    })
  }

  if (booking.payment_status !== "paid_demo") {
    return res.status(400).json({
      message: "Booking belum dibayar demo",
    })
  }

  const { data: updated, error } = await supabase
    .from("pro_player_bookings")
    .update({
      status: "accepted",
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
      type: "pro_booking_accepted",
      title: "Booking VIP diterima",
      message: "Pro player menerima booking VIP kamu.",
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
    message: "Booking berhasil diterima",
    booking: updated,
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

  const rejectNote = reason || "Ditolak oleh pro player"

  const { data: updated, error } = await supabase
    .from("pro_player_bookings")
    .update({
      status: "rejected",
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
      message: rejectNote,
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
    message: "Booking berhasil ditolak",
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