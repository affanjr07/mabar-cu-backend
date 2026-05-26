import { Request, Response } from "express"
import { supabase } from "../config/supabase"
import { io } from "../server"

export async function getProChatMessages(req: Request, res: Response) {
  const userId = req.user.id
  const { chatId } = req.params

  const { data: chat, error: chatError } = await supabase
    .from("pro_booking_chats")
    .select(`
      *,
      pro_player_bookings (
        id,
        status,
        scheduled_at,
        session_end_at,
        chat_closed_at
      )
    `)
    .eq("id", chatId)
    .single()

  if (chatError || !chat) {
    return res.status(404).json({
      message: "Chat tidak ditemukan",
    })
  }

  if (chat.user_id !== userId && chat.pro_player_id !== userId) {
    return res.status(403).json({
      message: "Tidak punya akses ke chat ini",
    })
  }

  if (chat.pro_player_bookings?.status !== "accepted") {
    return res.status(403).json({
      message: "Chat hanya terbuka setelah booking diterima pro player",
    })
  }

  const { data, error } = await supabase
    .from("pro_booking_messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  return res.json({
    chat,
    messages: data,
  })
}

export async function sendProChatMessage(req: Request, res: Response) {
  const userId = req.user.id
  const { chatId } = req.params
  const { message } = req.body

  if (!message?.trim()) {
    return res.status(400).json({
      message: "Pesan tidak boleh kosong",
    })
  }

  const { data: chat, error: chatError } = await supabase
    .from("pro_booking_chats")
    .select(`
      *,
      pro_player_bookings (
        id,
        status,
        scheduled_at,
        session_end_at,
        chat_closed_at
      )
    `)
    .eq("id", chatId)
    .single()

  if (chatError || !chat) {
    return res.status(404).json({
      message: "Chat tidak ditemukan",
    })
  }

  if (chat.user_id !== userId && chat.pro_player_id !== userId) {
    return res.status(403).json({
      message: "Tidak punya akses ke chat ini",
    })
  }

  if (chat.pro_player_bookings?.status !== "accepted") {
    return res.status(403).json({
      message: "Chat hanya bisa digunakan setelah booking diterima",
    })
  }

  if (chat.pro_player_bookings?.chat_closed_at) {
    return res.status(400).json({
      message: "Chat VIP sudah ditutup",
    })
  }

  const { data, error } = await supabase
    .from("pro_booking_messages")
    .insert({
      chat_id: chatId,
      sender_id: userId,
      message,
    })
    .select()
    .single()

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  io.to(`pro_chat:${chatId}`).emit("pro_chat_message_received", data)

  return res.status(201).json({
    message: "Pesan terkirim",
    data,
  })
}