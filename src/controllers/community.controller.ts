import { Request, Response } from "express"
import { supabase } from "../config/supabase"
import { io } from "../server"
import { moderateText } from "../services/moderation.service"

export async function getCommunityChannels(req: Request, res: Response) {
  const { gameId } = req.query

  let query = supabase
    .from("community_channels")
    .select(`
      id,
      game_id,
      name,
      slug,
      description,
      is_active,
      created_at,
      games (
        id,
        name,
        genre
      )
    `)
    .eq("is_active", true)
    .order("name", { ascending: true })

  if (gameId) {
    query = query.eq("game_id", gameId)
  }

  const { data, error } = await query

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  return res.json(data)
}

export async function getCommunityMessages(req: Request, res: Response) {
  const { channelId } = req.params

  const { data, error } = await supabase
    .from("community_messages")
    .select(`
      id,
      channel_id,
      sender_id,
      content,
      is_flagged,
      moderation_status,
      created_at
    `)
    .eq("channel_id", channelId)
    .order("created_at", { ascending: true })
    .limit(100)

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  return res.json(data)
}

export async function sendCommunityMessage(req: Request, res: Response) {
  const userId = req.user.id
  const { channelId } = req.params
  const { content } = req.body

  if (!content || !content.trim()) {
    return res.status(400).json({
      message: "Pesan tidak boleh kosong",
    })
  }

  const { data: channel, error: channelError } = await supabase
    .from("community_channels")
    .select("*")
    .eq("id", channelId)
    .eq("is_active", true)
    .single()

  if (channelError || !channel) {
    return res.status(404).json({
      message: "Community channel tidak ditemukan",
    })
  }

  let isFlagged = false
  let moderationStatus = "safe"
  let moderationRaw: any = null

  try {
    const moderation = await moderateText(content)

    isFlagged = moderation.flagged
    moderationStatus = moderation.flagged ? "flagged" : "safe"
    moderationRaw = moderation.raw
  } catch (error: any) {
    console.log("OpenAI community moderation failed:", error.message)
  }

  const { data: message, error } = await supabase
    .from("community_messages")
    .insert({
      channel_id: channelId,
      sender_id: userId,
      content,
      is_flagged: isFlagged,
      moderation_status: moderationStatus,
    })
    .select()
    .single()

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  if (isFlagged) {
    await supabase.from("moderation_logs").insert({
      user_id: userId,
      target_type: "community_chat",
      target_id: message.id,
      provider: "openai",
      status: "flagged",
      reason: "Community chat message flagged by OpenAI Moderation",
      raw_response: moderationRaw,
    })
  }

  io.to(`community:${channelId}`).emit("community_message_received", message)

  return res.status(201).json({
    message: isFlagged
      ? "Pesan terkirim tapi ditandai untuk review moderation"
      : "Pesan terkirim",
    data: message,
  })
}

export async function createCommunityChannel(req: Request, res: Response) {
  const { game_id, name, slug, description } = req.body

  if (!game_id || !name || !slug) {
    return res.status(400).json({
      message: "game_id, name, dan slug wajib diisi",
    })
  }

  const { data, error } = await supabase
    .from("community_channels")
    .insert({
      game_id,
      name,
      slug,
      description,
      is_active: true,
    })
    .select()
    .single()

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  return res.status(201).json({
    message: "Community channel berhasil dibuat",
    channel: data,
  })
}