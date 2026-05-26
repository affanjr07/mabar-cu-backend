import { Request, Response } from "express"
import { supabase } from "../config/supabase"

function getLastOnlineText(onlineStatus: boolean, lastOnline?: string) {
  if (onlineStatus) return "Online"
  if (!lastOnline) return "Tidak diketahui"

  const diffMs = Date.now() - new Date(lastOnline).getTime()
  const minutes = Math.floor(diffMs / 60000)
  const hours = Math.floor(diffMs / 3600000)
  const days = Math.floor(diffMs / 86400000)

  if (minutes < 1) return "Baru saja"
  if (minutes < 60) return `${minutes} menit lalu`
  if (hours < 24) return `${hours} jam lalu`

  return days >= 7 ? "Last seen 7 days ago" : `Last seen ${days} days ago`
}

async function attachEquippedItems(players: any[]) {
  const ids = players.map((p) => p.id)
  if (ids.length === 0) return players

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
    .in("user_id", ids)
    .eq("is_equipped", true)

  return players.map((player) => {
    const items =
      equippedItems?.filter((item: any) => item.user_id === player.id) || []

    return {
      ...player,
      equipped_avatar_border:
        items.find((item: any) => item.shop_items?.type === "avatar_border")
          ?.shop_items || null,
      equipped_badges:
        items
          .filter((item: any) => item.shop_items?.type === "badge")
          .map((item: any) => item.shop_items) || [],
    }
  })
}

export async function searchPlayers(req: Request, res: Response) {
  const { q, game, rank, role, region, online } = req.query

  const limit = Math.min(Number(req.query.limit || 15), 50)
  const offset = Number(req.query.offset || 0)

  let query = supabase
    .from("profiles")
    .select(`
      id,
      username,
      display_name,
      avatar_url,
      bio,
      favorite_game,
      game_rank,
      preferred_role,
      region,
      online_status,
      last_online,
      followers_count,
      average_rating,
      badges
    `)
    .order("online_status", { ascending: false })
    .order("last_online", { ascending: false })
    .range(offset, offset + limit - 1)

  if (q) {
    query = query.or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
  }

  if (game) query = query.eq("favorite_game", game)
  if (rank) query = query.eq("game_rank", rank)
  if (role) query = query.eq("preferred_role", role)
  if (region) query = query.eq("region", region)
  if (online === "true") query = query.eq("online_status", true)

  const { data, error } = await query

  if (error) return res.status(400).json({ message: error.message })

  const formatted = (data || []).map((player) => ({
    ...player,
    last_online_text: getLastOnlineText(
      player.online_status,
      player.last_online
    ),
  }))

  return res.json(await attachEquippedItems(formatted))
}

export async function getFollowedPlayers(req: Request, res: Response) {
  const userId = req.user.id

  const limit = Math.min(Number(req.query.limit || 15), 50)
  const offset = Number(req.query.offset || 0)

  const { data: follows, error } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", userId)
    .range(offset, offset + limit - 1)

  if (error) return res.status(400).json({ message: error.message })

  const ids = follows?.map((f) => f.following_id) || []

  if (ids.length === 0) return res.json([])

  const { data, error: profileError } = await supabase
    .from("profiles")
    .select(`
      id,
      username,
      display_name,
      avatar_url,
      bio,
      favorite_game,
      game_rank,
      preferred_role,
      region,
      online_status,
      last_online,
      followers_count,
      average_rating,
      badges
    `)
    .in("id", ids)
    .order("online_status", { ascending: false })
    .order("last_online", { ascending: false })

  if (profileError) {
    return res.status(400).json({ message: profileError.message })
  }

  const formatted = (data || []).map((player) => ({
    ...player,
    last_online_text: getLastOnlineText(
      player.online_status,
      player.last_online
    ),
  }))

  return res.json(await attachEquippedItems(formatted))
}