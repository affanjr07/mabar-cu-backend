import { Request, Response } from "express"
import { supabase } from "../config/supabase"
import { io } from "../server"
import { moderateText } from "../services/moderation.service"

export async function createPrivateChat(req: Request, res: Response) {
  const userId = req.user.id
  const { targetUserId } = req.body

  if (!targetUserId) {
    return res.status(400).json({ message: "targetUserId wajib diisi" })
  }

  if (userId === targetUserId) {
    return res.status(400).json({ message: "Tidak bisa chat diri sendiri" })
  }

  const { data: follow } = await supabase
    .from("follows")
    .select("*")
    .eq("follower_id", userId)
    .eq("following_id", targetUserId)
    .maybeSingle()

  const { data: friend } = await supabase
    .from("friends")
    .select("*")
    .or(
      `and(user_one.eq.${userId},user_two.eq.${targetUserId}),and(user_one.eq.${targetUserId},user_two.eq.${userId})`
    )
    .maybeSingle()

  if (!follow && !friend) {
    return res.status(403).json({
      message: "Kamu harus follow player ini dulu untuk chat",
    })
  }

  const { data: existingParticipant } = await supabase
    .from("chat_participants")
    .select("chat_id")
    .eq("user_id", userId)

  if (existingParticipant && existingParticipant.length > 0) {
    for (const item of existingParticipant) {
      const { data: targetParticipant } = await supabase
        .from("chat_participants")
        .select("*")
        .eq("chat_id", item.chat_id)
        .eq("user_id", targetUserId)
        .maybeSingle()

      if (targetParticipant) {
        return res.json({
          message: "Private chat sudah ada",
          chat: {
            id: item.chat_id,
          },
        })
      }
    }
  }

  const { data: chat, error } = await supabase
    .from("chats")
    .insert({
      type: "private",
    })
    .select()
    .single()

  if (error) return res.status(400).json({ message: error.message })

  await supabase.from("chat_participants").insert([
    {
      chat_id: chat.id,
      user_id: userId,
    },
    {
      chat_id: chat.id,
      user_id: targetUserId,
    },
  ])

  return res.status(201).json({
    message: "Private chat berhasil dibuat",
    chat,
  })
}

export async function getChatMessages(req: Request, res: Response) {
  const { chatId } = req.params

  const { data, error } = await supabase
    .from("messages")
    .select(`
      id,
      chat_id,
      sender_id,
      content,
      image_url,
      sticker_url,
      message_type,
      is_read,
      is_flagged,
      moderation_status,
      created_at
    `)
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })

  if (error) {
    return res.status(400).json({ message: error.message })
  }

  return res.json(data)
}

export async function sendMessage(req: Request, res: Response) {
  const senderId = req.user.id
  const { chatId } = req.params
  const { content, image_url, sticker_url, message_type = "text" } = req.body

  if (!content && !image_url && !sticker_url) {
    return res.status(400).json({
      message: "Pesan tidak boleh kosong",
    })
  }

  let moderationStatus = "safe"
let isFlagged = false

if (content) {
  let moderation = {
  flagged: false,
  categories: {},
  category_scores: {},
}

try {
  moderation = await moderateText(content)
} catch (error) {
  console.log("OpenAI moderation failed:", error)
}

  isFlagged = moderation.flagged
  moderationStatus = moderation.flagged ? "flagged" : "safe"
}

const { data: message, error } = await supabase
  .from("messages")
  .insert({
    chat_id: chatId,
    sender_id: senderId,
    content,
    image_url,
    sticker_url,
    message_type,
    is_flagged: isFlagged,
    moderation_status: moderationStatus,
  })
  .select()
  .single()

  if (isFlagged) {
  await supabase.from("moderation_logs").insert({
    user_id: senderId,
    target_type: "chat",
    target_id: message.id,
    provider: "openai",
    status: "flagged",
    reason: "Chat message flagged by OpenAI Moderation",
  })
}

  if (error) return res.status(400).json({ message: error.message })

  io.to(chatId).emit("message_received", message)

  io.to(chatId).emit("notification_received", {
  type: "chat_message",
  title: "Pesan baru",
  message: content || "Mengirim media",
  data: {
    chatId,
    messageId: message.id,
  },
})

  return res.status(201).json({
    message: "Pesan terkirim",
    data: message,
  })
}

export async function markMessagesAsRead(req: Request, res: Response) {
  const { chatId } = req.params

  const { error } = await supabase
    .from("messages")
    .update({
      is_read: true,
    })
    .eq("chat_id", chatId)

  if (error) return res.status(400).json({ message: error.message })

  return res.json({
    message: "Pesan ditandai sudah dibaca",
  })
}
export async function getRoomChatMessages(req: Request, res: Response) {
  const userId = req.user.id
  const { roomId } = req.params

  const { data: member } = await supabase
    .from("party_members")
    .select("*")
    .eq("party_room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle()

  if (!member) {
    return res.status(403).json({
      message: "Kamu harus join room dulu untuk melihat chat",
    })
  }

  const { data: room, error: roomError } = await supabase
    .from("party_rooms")
    .select("chat_id")
    .eq("id", roomId)
    .single()

  if (roomError || !room?.chat_id) {
    return res.status(404).json({ message: "Chat room tidak ditemukan" })
  }

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("chat_id", room.chat_id)
    .order("created_at", { ascending: true })

  if (error) return res.status(400).json({ message: error.message })

  return res.json({
    chat_id: room.chat_id,
    messages: data,
  })
}

export async function sendRoomChatMessage(req: Request, res: Response) {
  const userId = req.user.id
  const { roomId } = req.params
  const { content } = req.body

  const { data: member } = await supabase
    .from("party_members")
    .select("*")
    .eq("party_room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle()

  if (!member) {
    return res.status(403).json({
      message: "Kamu harus join room dulu untuk chat",
    })
  }

  const { data: room } = await supabase
    .from("party_rooms")
    .select("chat_id")
    .eq("id", roomId)
    .single()

  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      chat_id: room?.chat_id,
      sender_id: userId,
      content,
      message_type: "text",
    })
    .select()
    .single()

  if (error) return res.status(400).json({ message: error.message })

  io.to(room?.chat_id).emit("message_received", message)

  return res.status(201).json({
    message: "Pesan room terkirim",
    data: message,
  })
}