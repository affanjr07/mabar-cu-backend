import { Request, Response } from "express"
import { supabase } from "../config/supabase"
import { moderateText } from "../services/moderation.service"

function getParamValue(req: Request, key: string) {
  const value = req.params[key]

  if (!value || typeof value !== "string") {
    return null
  }

  return value
}

async function hydrateMessages(messages: any[]) {
  const senderIds = [
    ...new Set(messages.map((message) => message.sender_id).filter(Boolean)),
  ]

  if (senderIds.length === 0) return messages

  const { data: profiles } = await supabase
    .from("profiles")
    .select(`
      id,
      username,
      display_name,
      avatar_url,
      role,
      online_status,
      last_online
    `)
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
    const profile = profiles?.find(
      (profileItem: any) => profileItem.id === message.sender_id
    )

    const userEquippedItems =
      equippedItems?.filter((item: any) => item.user_id === message.sender_id) ||
      []

    const equippedAvatarBorder =
      userEquippedItems.find(
        (item: any) => item.shop_items?.type === "avatar_border"
      )?.shop_items || null

    const equippedBadges =
      userEquippedItems
        .filter((item: any) => item.shop_items?.type === "badge")
        .map((item: any) => item.shop_items) || []

    return {
      ...message,
      profiles: profile
        ? {
            ...profile,
            username: profile.username || profile.display_name || "Player",
            display_name: profile.display_name || profile.username || "Player",
            equipped_avatar_border: equippedAvatarBorder,
            equipped_badges: equippedBadges,
          }
        : {
            id: message.sender_id,
            username: "Player",
            display_name: "Player",
            avatar_url: null,
            role: "user",
            online_status: false,
            last_online: null,
            equipped_avatar_border: null,
            equipped_badges: [],
          },
    }
  })
}

async function runModeration(content?: string | null) {
  let moderationStatus = "safe"
  let isFlagged = false
  let moderationRaw: any = null

  if (!content) {
    return {
      moderationStatus,
      isFlagged,
      moderationRaw,
    }
  }

  try {
    const moderation: any = await moderateText(content)

    isFlagged = Boolean(moderation.flagged || moderation.isFlagged)
    moderationStatus = isFlagged ? "flagged" : "safe"
    moderationRaw = moderation.raw || moderation
  } catch (error: any) {
    console.log("OpenAI moderation failed:", error.message)
  }

  return {
    moderationStatus,
    isFlagged,
    moderationRaw,
  }
}

async function userCanAccessChat(chatId: string, userId: string) {
  const { data: participant } = await supabase
    .from("chat_participants")
    .select("id")
    .eq("chat_id", chatId)
    .eq("user_id", userId)
    .maybeSingle()

  return Boolean(participant)
}

export async function createPrivateChat(req: Request, res: Response) {
  const userId = req.user.id
  const { targetUserId } = req.body

  if (!targetUserId) {
    return res.status(400).json({
      message: "targetUserId wajib diisi",
    })
  }

  if (userId === targetUserId) {
    return res.status(400).json({
      message: "Tidak bisa chat diri sendiri",
    })
  }

  const { data: targetUser } = await supabase
    .from("users")
    .select("id")
    .eq("id", targetUserId)
    .maybeSingle()

  if (!targetUser) {
    return res.status(404).json({
      message: "Target user tidak ditemukan",
    })
  }

  const { data: blocked } = await supabase
    .from("blocked_users")
    .select("id")
    .or(
      `and(blocker_id.eq.${userId},blocked_id.eq.${targetUserId}),and(blocker_id.eq.${targetUserId},blocked_id.eq.${userId})`
    )
    .maybeSingle()

  if (blocked) {
    return res.status(403).json({
      message: "Chat tidak bisa dibuat karena salah satu user memblokir.",
    })
  }

  const { data: follow } = await supabase
    .from("follows")
    .select("id")
    .eq("follower_id", userId)
    .eq("following_id", targetUserId)
    .maybeSingle()

  const { data: friend } = await supabase
    .from("friends")
    .select("id")
    .or(
      `and(user_one.eq.${userId},user_two.eq.${targetUserId}),and(user_one.eq.${targetUserId},user_two.eq.${userId})`
    )
    .maybeSingle()

  if (!follow && !friend) {
    return res.status(403).json({
      message: "Kamu harus follow player ini dulu untuk chat",
    })
  }

  const { data: myParticipants, error: myParticipantsError } = await supabase
    .from("chat_participants")
    .select("chat_id")
    .eq("user_id", userId)

  if (myParticipantsError) {
    return res.status(400).json({
      message: myParticipantsError.message,
    })
  }

  if (myParticipants && myParticipants.length > 0) {
    for (const item of myParticipants) {
      const { data: targetParticipant } = await supabase
        .from("chat_participants")
        .select("id, chat_id, user_id")
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

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

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
    return res.status(400).json({
      message: participantError.message,
    })
  }

  return res.status(201).json({
    message: "Private chat berhasil dibuat",
    chat,
  })
}

export async function getChatMessages(req: Request, res: Response) {
  const userId = req.user.id
  const chatId = getParamValue(req, "chatId")

  if (!chatId) {
    return res.status(400).json({
      message: "chatId wajib diisi",
    })
  }

  const canAccess = await userCanAccessChat(chatId, userId)

  if (!canAccess) {
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
    .limit(150)

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  const hydrated = await hydrateMessages(data || [])

  return res.json(hydrated)
}

export async function sendMessage(req: Request, res: Response) {
  const senderId = req.user.id
  const chatId = getParamValue(req, "chatId")
  const { content, image_url, sticker_url, message_type = "text" } = req.body

  if (!chatId) {
    return res.status(400).json({
      message: "chatId wajib diisi",
    })
  }

  if (!content && !image_url && !sticker_url) {
    return res.status(400).json({
      message: "Pesan tidak boleh kosong",
    })
  }

  const canAccess = await userCanAccessChat(chatId, senderId)

  if (!canAccess) {
    return res.status(403).json({
      message: "Kamu tidak punya akses ke chat ini",
    })
  }

  const { moderationStatus, isFlagged, moderationRaw } = await runModeration(
    content
  )

  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      chat_id: chatId,
      sender_id: senderId,
      content: content?.trim() || null,
      image_url: image_url || null,
      sticker_url: sticker_url || null,
      message_type,
      is_flagged: isFlagged,
      moderation_status: moderationStatus,
    })
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
    .single()

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  if (isFlagged) {
    await supabase.from("moderation_logs").insert({
      user_id: senderId,
      target_type: "chat",
      target_id: message.id,
      provider: "openai",
      status: "flagged",
      reason: "Chat message flagged by OpenAI Moderation",
      raw_response: moderationRaw,
    })
  }

  const [hydratedMessage] = await hydrateMessages([message])

  return res.status(201).json({
    message: isFlagged
      ? "Pesan terkirim tapi ditandai untuk review moderation"
      : "Pesan terkirim",
    data: hydratedMessage,
  })
}

export async function markMessagesAsRead(req: Request, res: Response) {
  const userId = req.user.id
  const chatId = getParamValue(req, "chatId")

  if (!chatId) {
    return res.status(400).json({
      message: "chatId wajib diisi",
    })
  }

  const canAccess = await userCanAccessChat(chatId, userId)

  if (!canAccess) {
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

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  return res.json({
    message: "Pesan ditandai sudah dibaca",
  })
}

export async function getRoomChatMessages(req: Request, res: Response) {
  const userId = req.user.id
  const roomId = getParamValue(req, "roomId")

  if (!roomId) {
    return res.status(400).json({
      message: "roomId wajib diisi",
    })
  }

  const { data: member, error: memberError } = await supabase
    .from("party_members")
    .select("id, party_room_id, user_id")
    .eq("party_room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle()

  if (memberError) {
    return res.status(400).json({
      message: memberError.message,
    })
  }

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
    return res.status(404).json({
      message: "Chat room tidak ditemukan",
    })
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
    .limit(150)

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  const hydrated = await hydrateMessages(data || [])

  return res.json({
    chat_id: room.chat_id,
    messages: hydrated,
  })
}

export async function sendRoomChatMessage(req: Request, res: Response) {
  const userId = req.user.id
  const roomId = getParamValue(req, "roomId")
  const { content } = req.body

  if (!roomId) {
    return res.status(400).json({
      message: "roomId wajib diisi",
    })
  }

  if (!content?.trim()) {
    return res.status(400).json({
      message: "Pesan tidak boleh kosong",
    })
  }

  const { data: member, error: memberError } = await supabase
    .from("party_members")
    .select("id, party_room_id, user_id")
    .eq("party_room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle()

  if (memberError) {
    return res.status(400).json({
      message: memberError.message,
    })
  }

  if (!member) {
    return res.status(403).json({
      message: "Kamu harus join room dulu untuk chat",
    })
  }

  const { data: room, error: roomError } = await supabase
    .from("party_rooms")
    .select("id, chat_id, status")
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

  const { moderationStatus, isFlagged, moderationRaw } = await runModeration(
    content
  )

  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      chat_id: room.chat_id,
      sender_id: userId,
      content: content.trim(),
      message_type: "text",
      is_flagged: isFlagged,
      moderation_status: moderationStatus,
    })
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
    .single()

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  if (isFlagged) {
    await supabase.from("moderation_logs").insert({
      user_id: userId,
      target_type: "room_chat",
      target_id: message.id,
      provider: "openai",
      status: "flagged",
      reason: "Room chat message flagged by OpenAI Moderation",
      raw_response: moderationRaw,
    })
  }

  const [hydratedMessage] = await hydrateMessages([message])

  return res.status(201).json({
    message: isFlagged
      ? "Pesan room terkirim tapi ditandai moderation"
      : "Pesan room terkirim",
    data: hydratedMessage,
  })
}