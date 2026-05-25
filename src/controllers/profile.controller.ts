import { Request, Response } from "express"
import { supabase } from "../config/supabase"
import { moderateImageByUrl } from "../services/moderation.service"

export async function getMyProfile(req: Request, res: Response) {
  const userId = req.user.id

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single()

  if (error) {
    return res.status(404).json({
      message: "Profile tidak ditemukan",
    })
  }

  return res.json(data)
}

export async function updateMyProfile(req: Request, res: Response) {
  const userId = req.user.id

  const {
    username,
    display_name,
    bio,
    gender,
    favorite_game,
    game_rank,
    preferred_role,
    region,
    avatar_url,
    banner_url,
  } = req.body

  if (avatar_url) {
    const avatarModeration = await moderateImageByUrl(avatar_url)

    if (avatarModeration.unsafe) {
      await supabase.from("moderation_logs").insert({
        user_id: userId,
        target_type: "image",
        provider: "sightengine",
        status: "blocked",
        reason: "Avatar image rejected by Sightengine",
        raw_response: avatarModeration.raw,
      })

      return res.status(400).json({
        message: "Foto profile ditolak karena tidak aman",
      })
    }
  }

  if (banner_url) {
    const bannerModeration = await moderateImageByUrl(banner_url)

    if (bannerModeration.unsafe) {
      await supabase.from("moderation_logs").insert({
        user_id: userId,
        target_type: "image",
        provider: "sightengine",
        status: "blocked",
        reason: "Banner image rejected by Sightengine",
        raw_response: bannerModeration.raw,
      })

      return res.status(400).json({
        message: "Banner ditolak karena tidak aman",
      })
    }
  }

  const updatePayload: Record<string, any> = {
    username,
    display_name,
    bio,
    gender,
    favorite_game,
    game_rank,
    preferred_role,
    region,
    updated_at: new Date().toISOString(),
  }

  if (avatar_url !== undefined) {
    updatePayload.avatar_url = avatar_url
  }

  if (banner_url !== undefined) {
    updatePayload.banner_url = banner_url
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(updatePayload)
    .eq("id", userId)
    .select()
    .single()

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  return res.json({
    message: "Profile berhasil diperbarui",
    profile: data,
  })
}

export async function getPublicProfile(req: Request, res: Response) {
  const { identifier } = req.params

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      identifier
    )

  let query = supabase
    .from("profiles")
    .select(`
      id,
      username,
      display_name,
      avatar_url,
      banner_url,
      bio,
      gender,
      favorite_game,
      game_rank,
      preferred_role,
      region,
      online_status,
      last_online,
      followers_count,
      following_count,
      average_rating,
      total_ratings,
      badges
    `)

  query = isUuid
    ? query.eq("id", identifier)
    : query.eq("username", identifier)

  const { data, error } = await query.single()

  if (error || !data) {
    return res.status(404).json({
      message: "Profile tidak ditemukan",
    })
  }

  let lastOnlineText = "Tidak diketahui"

  if (data.online_status) {
    lastOnlineText = "Online"
  } else if (data.last_online) {
    const lastOnlineDate = new Date(data.last_online)
    const diffMs = Date.now() - lastOnlineDate.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    lastOnlineText =
      diffDays > 7 ? "7 days ago" : `${diffDays} days ago`
  }

  return res.json({
    ...data,
    last_online_text: lastOnlineText,
  })
}