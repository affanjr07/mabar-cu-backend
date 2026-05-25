import { Request, Response } from "express"
import { supabase } from "../config/supabase"
import { io } from "../server"

export async function getMyNotifications(req: Request, res: Response) {
  const userId = req.user.id

  const { data, error } = await supabase
    .from("notifications")
    .select(`
      id,
      user_id,
      sender_id,
      type,
      title,
      message,
      data,
      is_read,
      created_at
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (error) {
    return res.status(400).json({ message: error.message })
  }

  return res.json(data)
}

export async function createNotification(req: Request, res: Response) {
  const senderId = req.user.id

  const {
    user_id,
    type,
    title,
    message,
    data = {},
  } = req.body

  if (!user_id || !type || !title) {
    return res.status(400).json({
      message: "user_id, type, dan title wajib diisi",
    })
  }

  const { data: notification, error } = await supabase
    .from("notifications")
    .insert({
      user_id,
      sender_id: senderId,
      type,
      title,
      message,
      data,
      is_read: false,
    })
    .select()
    .single()

  if (error) {
    return res.status(400).json({ message: error.message })
  }

  io.to(`user:${user_id}`).emit("notification_received", notification)

  return res.status(201).json({
    message: "Notification berhasil dibuat",
    notification,
  })
}

export async function markNotificationAsRead(req: Request, res: Response) {
  const userId = req.user.id
  const { notificationId } = req.params

  const { error } = await supabase
    .from("notifications")
    .update({
      is_read: true,
    })
    .eq("id", notificationId)
    .eq("user_id", userId)

  if (error) {
    return res.status(400).json({ message: error.message })
  }

  return res.json({
    message: "Notification ditandai sudah dibaca",
  })
}

export async function markAllNotificationsAsRead(req: Request, res: Response) {
  const userId = req.user.id

  const { error } = await supabase
    .from("notifications")
    .update({
      is_read: true,
    })
    .eq("user_id", userId)

  if (error) {
    return res.status(400).json({ message: error.message })
  }

  return res.json({
    message: "Semua notification sudah dibaca",
  })
}

export async function deleteNotification(req: Request, res: Response) {
  const userId = req.user.id
  const { notificationId } = req.params

  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", notificationId)
    .eq("user_id", userId)

  if (error) {
    return res.status(400).json({ message: error.message })
  }

  return res.json({
    message: "Notification berhasil dihapus",
  })
}