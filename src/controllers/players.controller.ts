import { Request, Response } from "express"
import { supabase } from "../config/supabase"

export async function searchPlayers(req: Request, res: Response) {
  const {
    q,
    game,
    rank,
    role,
    region,
    online,
  } = req.query

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

  if (q) {
    query = query.or(
      `username.ilike.%${q}%,display_name.ilike.%${q}%`
    )
  }

  if (game) query = query.eq("favorite_game", game)
  if (rank) query = query.eq("game_rank", rank)
  if (role) query = query.eq("preferred_role", role)
  if (region) query = query.eq("region", region)

  if (online === "true") {
    query = query.eq("online_status", true)
  }

  const { data, error } = await query.limit(50)

  if (error) return res.status(400).json({ message: error.message })

  const formatted = data.map((player) => {
    const lastOnlineDate = player.last_online
      ? new Date(player.last_online)
      : null

    let lastOnlineText = "Tidak diketahui"

    if (player.online_status) {
      lastOnlineText = "Online"
    } else if (lastOnlineDate) {
      const diffMs = Date.now() - lastOnlineDate.getTime()
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

      lastOnlineText =
        diffDays > 7
          ? "7 days ago"
          : `${diffDays} days ago`
    }

    return {
      ...player,
      last_online_text: lastOnlineText,
    }
  })

  return res.json(formatted)
}