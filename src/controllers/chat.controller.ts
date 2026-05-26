import { Request, Response } from "express"
import { supabase } from "../config/supabase"
import { io } from "../server"
import { moderateText } from "../services/moderation.service"

async function hydrateMessages(messages: any[]) {
  const senderIds = [...new Set(messages.map((m) => m.sender_id).filter(Boolean))]

  if (senderIds.length === 0) return messages

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, online_status")
    .in("id", senderIds)

  const { data: equippedItems } = await supabase
    .from("user_inventory")
    .select(`
      user_id,
      is_equipped,
      shop_items (
        id,
        name,
        type,
        image_url,
        rarity,
        css_class,
        metadata
      )
    `)
    .in("user_id", senderIds)
    .eq("is_equipped", true)

  return messages.map((message) => {
    const profile = profiles?.find((p) => p.id === message.sender_id)

    const userEquipped =
      equippedItems?.filter((item: any) => item.user_id === message.sender_id) ||
      []

    const equippedAvatarBorder =
      userEquipped.find(
        (item: any) => item.shop_items?.type === "avatar_border"
      )?.shop_items || null

    const equippedBadges =
      userEquipped
        .filter((item: any) => item.shop_items?.type === "badge")
        .map((item: any) => item.shop_items) || []

    return {
      ...message,
      profiles: profile
        ? {
            ...profile,
            equipped_avatar_border: equippedAvatarBorder,
            equipped_badges: equippedBadges,
          }
        : null,
    }
  })
}

async function runModeration(content?: string) {
  let moderationStatus = "safe"
  let isFlagged = false

  if (!content) {
    return { moderationStatus, isFlagged }
  }

  try {
    const moderation = await moderateText(content)
    isFlagged = moderation.flagged
    moderationStatus = moderation.flagged ? "flagged" : "safe"
  } catch (error) {
    console.log("OpenAI moderation failed:", error)
  }

  return { moderationStatus, isFlagged }
}

export async function createPrivateChat(req: Request, res: Response) {
  const userId = req.user.id
  const { targetUserId } = req.body

  if (!targetUserId) {
    return res.status(400).json({ message: "targetUserId wajib diisi" })
  }

  if (userId === targetUserId) {
    return res.status(400).json({ message: "Tidak bisa chat diri sendiri" })
  }

  const { data: targetUser } = await supabase
    .from("users")
    .select("id")
    .eq("id", targetUserId)
    .maybeSingle()

  if (!targetUser) {
    return res.status(404).json({ message: "Target user tidak ditemukan" })
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

  const { data: myParticipants } = await supabase
    .from("chat_participants")
    .select("chat_id")
    .eq("user_id", userId)

  if (myParticipants && myParticipants.length > 0) {
    for (const item of myParticipants) {
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

  const { error: participantError } = await supabase
    .from("chat_participants")
    .insert([
      {
        chat_id: chat.id,
        user_id: userId,
      },
      {
        chat_id: chat.id,
        user_id: targetUserId,
      },
    ])

  if (participantError) {
    return res.status(400).json({ message: participantError.message })
  }

  return res.status(201).json({
    message: "Private chat berhasil dibuat",
    chat,
  })
}

export async function getChatMessages(req: Request, res: Response) {
  const userId = req.user.id
  const { chatId } = req.params

  const { data: participant } = await supabase
    .from("chat_participants")
    .select("*")
    .eq("chat_id", chatId)
    .eq("user_id", userId)
    .maybeSingle()

  if (!participant) {
    return res.status(403).json({
      message: "Kamu tidak punya akses ke chat ini",
    })
  }

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

  const hydrated = await hydrateMessages(data || [])
  return res.json(hydrated)
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

  const { data: participant } = await supabase
    .from("chat_participants")
    .select("*")
    .eq("chat_id", chatId)
    .eq("user_id", senderId)
    .maybeSingle()

  if (!participant) {
    return res.status(403).json({
      message: "Kamu tidak punya akses ke chat ini",
    })
  }

  const { moderationStatus, isFlagged } = await runModeration(content)

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

  if (error) return res.status(400).json({ message: error.message })

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

  const [hydratedMessage] = await hydrateMessages([message])

  io.to(chatId).emit("message_received", hydratedMessage)

  return res.status(201).json({
    message: "Pesan terkirim",
    data: hydratedMessage,
  })
}

export async function markMessagesAsRead(req: Request, res: Response) {
  const userId = req.user.id
  const { chatId } = req.params

  const { data: participant } = await supabase
    .from("chat_participants")
    .select("*")
    .eq("chat_id", chatId)
    .eq("user_id", userId)
    .maybeSingle()

  if (!participant) {
    return res.status(403).json({
      message: "Kamu tidak punya akses ke chat ini",
    })
  }

  const { error } = await supabase
    .from("messages")
    .update({
      is_read: true,
    })
    .eq("chat_id", chatId)
    .neq("sender_id", userId)

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
    .select("id, chat_id, status")
    .eq("id", roomId)
    .single()

  if (roomError || !room?.chat_id) {
    return res.status(404).json({ message: "Chat room tidak ditemukan" })
  }

  if (room.status === "closed") {
    return res.status(400).json({
      message: "Room sudah ditutup",
    })
  }

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
    .eq("chat_id", room.chat_id)
    .order("created_at", { ascending: true })

  if (error) return res.status(400).json({ message: error.message })

  const hydrated = await hydrateMessages(data || [])

  return res.json({
    chat_id: room.chat_id,
    messages: hydrated,
  })
}

export async function sendRoomChatMessage(req: Request, res: Response) {
  const userId = req.user.id
  const { roomId } = req.params
  const { content } = req.body

  if (!content?.trim()) {
    return res.status(400).json({
      message: "Pesan tidak boleh kosong",
    })
  }

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

  const { data: room, error: roomError } = await supabase
    .from("party_rooms")
    .select("chat_id, status")
    .eq("id", roomId)
    .single()

  if (roomError || !room?.chat_id) {
    return res.status(404).json({
      message: "Chat room tidak ditemukan",
    })
  }

  if (room.status === "closed") {
    return res.status(400).json({
      message: "Room sudah ditutup",
    })
  }

  const { moderationStatus, isFlagged } = await runModeration(content)

  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      chat_id: room.chat_id,
      sender_id: userId,
      content,
      message_type: "text",
      is_flagged: isFlagged,
      moderation_status: moderationStatus,
    })
    .select()
    .single()

  if (error) return res.status(400).json({ message: error.message })

  if (isFlagged) {
    await supabase.from("moderation_logs").insert({
      user_id: userId,
      target_type: "room_chat",
      target_id: message.id,
      provider: "openai",
      status: "flagged",
      reason: "Room chat message flagged by OpenAI Moderation",
    })
  }

  const [hydratedMessage] = await hydrateMessages([message])

  io.to(room.chat_id).emit("message_received", hydratedMessage)

  return res.status(201).json({
    message: "Pesan room terkirim",
    data: hydratedMessage,
  })
}