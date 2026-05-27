import { Request, Response } from "express"
import { supabase } from "../config/supabase"
import { io } from "../server"
import { moderateText } from "../services/moderation.service"

function createSlug(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

async function syncCommunityChannelsFromGames() {
  const { data: games, error: gamesError } = await supabase
    .from("games")
    .select("id, name, genre")
    .order("name", { ascending: true })

  if (gamesError || !games) return

  const { data: channels } = await supabase
    .from("community_channels")
    .select("game_id")

  const existingGameIds = new Set(
    (channels || []).map((channel: any) => channel.game_id)
  )

  const missingChannels = games
    .filter((game: any) => !existingGameIds.has(game.id))
    .map((game: any) => ({
      game_id: game.id,
      name: `${game.name} Community`,
      slug: createSlug(game.name),
      description: `Community chat untuk player ${game.name}`,
      is_active: true,
    }))

  if (missingChannels.length > 0) {
    await supabase.from("community_channels").insert(missingChannels)
  }
}

async function hydrateCommunityMessages(messages: any[]) {
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
      online_status
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
      equippedItems?.filter(
        (item: any) => item.user_id === message.sender_id
      ) || []

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
            equipped_avatar_border: equippedAvatarBorder,
            equipped_badges: equippedBadges,
          }
        : null,
    }
  })
}

async function moderateCommunityText(content: string) {
  let isFlagged = false
  let moderationStatus = "safe"
  let moderationRaw: any = null

  try {
    const moderation: any = await moderateText(content)

    isFlagged = Boolean(moderation.flagged || moderation.isFlagged)
    moderationStatus = isFlagged ? "flagged" : "safe"
    moderationRaw = moderation.raw || moderation
  } catch (error: any) {
    console.log("Community moderation failed:", error.message)
  }

  return {
    isFlagged,
    moderationStatus,
    moderationRaw,
  }
}

export async function getCommunityChannels(req: Request, res: Response) {
  const { gameId } = req.query

  await syncCommunityChannelsFromGames()

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
        genre,
        max_party_size,
        roles,
        ranks
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

  return res.json(data || [])
}

export async function getCommunityMessages(req: Request, res: Response) {
  const { channelId } = req.params

  const { data: channel, error: channelError } = await supabase
    .from("community_channels")
    .select("id, is_active")
    .eq("id", channelId)
    .eq("is_active", true)
    .maybeSingle()

  if (channelError) {
    return res.status(400).json({
      message: channelError.message,
    })
  }

  if (!channel) {
    return res.status(404).json({
      message: "Community channel tidak ditemukan",
    })
  }

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

  const hydrated = await hydrateCommunityMessages(data || [])

  return res.json(hydrated)
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
    .select("id, is_active")
    .eq("id", channelId)
    .eq("is_active", true)
    .maybeSingle()

  if (channelError) {
    return res.status(400).json({
      message: channelError.message,
    })
  }

  if (!channel) {
    return res.status(404).json({
      message: "Community channel tidak ditemukan",
    })
  }

  const { isFlagged, moderationStatus, moderationRaw } =
    await moderateCommunityText(content)

  const { data: message, error } = await supabase
    .from("community_messages")
    .insert({
      channel_id: channelId,
      sender_id: userId,
      content: content.trim(),
      is_flagged: isFlagged,
      moderation_status: moderationStatus,
    })
    .select(`
      id,
      channel_id,
      sender_id,
      content,
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
      target_type: "community_chat",
      target_id: message.id,
      provider: "openai",
      status: "flagged",
      reason: "Community chat message flagged by moderation",
      raw_response: moderationRaw,
    })
  }

  const [hydratedMessage] = await hydrateCommunityMessages([message])

  io.to(`community:${channelId}`).emit(
    "community_message_received",
    hydratedMessage
  )

  return res.status(201).json({
    message: isFlagged
      ? "Pesan terkirim tapi ditandai untuk review moderation"
      : "Pesan terkirim",
    data: hydratedMessage,
  })
}

export async function createCommunityChannel(req: Request, res: Response) {
  const { game_id, name, slug, description } = req.body

  if (!game_id || !name) {
    return res.status(400).json({
      message: "game_id dan name wajib diisi",
    })
  }

  const finalSlug = slug || createSlug(name)

  const { data: existing } = await supabase
    .from("community_channels")
    .select("id")
    .eq("game_id", game_id)
    .maybeSingle()

  if (existing) {
    return res.status(400).json({
      message: "Channel untuk game ini sudah ada",
    })
  }

  const { data, error } = await supabase
    .from("community_channels")
    .insert({
      game_id,
      name,
      slug: finalSlug,
      description,
      is_active: true,
    })
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
        genre,
        max_party_size,
        roles,
        ranks
      )
    `)
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