import { Request, Response } from "express"
import { supabase } from "../config/supabase"

function getLastOnlineText(onlineStatus: boolean, lastOnline?: string) {
  if (onlineStatus) return "Online"
  if (!lastOnline) return "Tidak diketahui"

  const diffMs = Date.now() - new Date(lastOnline).getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMinutes < 1) return "Baru saja"
  if (diffMinutes < 60) return `${diffMinutes} menit lalu`
  if (diffHours < 24) return `${diffHours} jam lalu`

  return diffDays >= 7 ? "Last seen 7 days ago" : `Last seen ${diffDays} days ago`
}

async function attachEquippedItems(profile: any) {
  if (!profile?.id) return profile

  const { data: equippedItems } = await supabase
    .from("user_inventory")
    .select(`
      id,
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
    .eq("user_id", profile.id)
    .eq("is_equipped", true)

  const equippedAvatarBorder =
    equippedItems?.find(
      (item: any) => item.shop_items?.type === "avatar_border"
    )?.shop_items || null

  const equippedBadges =
    equippedItems
      ?.filter((item: any) => item.shop_items?.type === "badge")
      .map((item: any) => item.shop_items) || []

  return {
    ...profile,
    equipped_avatar_border: equippedAvatarBorder,
    equipped_badges: equippedBadges,
  }
}

export async function getMyProfile(req: Request, res: Response) {
  const userId = req.user.id

  const { data: profile, error } = await supabase
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
      badges,
      created_at,
      updated_at
    `)
    .eq("id", userId)
    .single()

  if (error || !profile) {
    return res.status(404).json({
      message: "Profile tidak ditemukan",
    })
  }

  const formatted = {
    ...profile,
    last_online_text: getLastOnlineText(
      profile.online_status,
      profile.last_online
    ),
    is_following: false,
  }

  const withItems = await attachEquippedItems(formatted)

  return res.json(withItems)
}

export async function getPublicProfile(req: Request, res: Response) {
  const { identifier } = req.params
  const viewerId = req.user?.id || null

  const { data: profile, error } = await supabase
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
      badges,
      created_at,
      updated_at
    `)
    .or(`id.eq.${identifier},username.eq.${identifier}`)
    .maybeSingle()

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  if (!profile) {
    return res.status(404).json({
      message: "Profile tidak ditemukan",
    })
  }

  let isFollowing = false

  if (viewerId && viewerId !== profile.id) {
    const { data: follow } = await supabase
      .from("follows")
      .select("id")
      .eq("follower_id", viewerId)
      .eq("following_id", profile.id)
      .maybeSingle()

    isFollowing = Boolean(follow)
  }

  const formatted = {
    ...profile,
    last_online_text: getLastOnlineText(
      profile.online_status,
      profile.last_online
    ),
    is_following: isFollowing,
    is_own_profile: viewerId === profile.id,
  }

  const withItems = await attachEquippedItems(formatted)

  return res.json(withItems)
}

export async function updateMyProfile(req: Request, res: Response) {
  const userId = req.user.id

  const {
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
  } = req.body

  const payload: any = {
    updated_at: new Date().toISOString(),
  }

  if (username !== undefined) payload.username = username
  if (display_name !== undefined) payload.display_name = display_name
  if (avatar_url !== undefined) payload.avatar_url = avatar_url
  if (banner_url !== undefined) payload.banner_url = banner_url
  if (bio !== undefined) payload.bio = bio
  if (gender !== undefined) payload.gender = gender
  if (favorite_game !== undefined) payload.favorite_game = favorite_game
  if (game_rank !== undefined) payload.game_rank = game_rank
  if (preferred_role !== undefined) payload.preferred_role = preferred_role
  if (region !== undefined) payload.region = region

  const { data, error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", userId)
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
      badges,
      created_at,
      updated_at
    `)
    .single()

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  const withItems = await attachEquippedItems({
    ...data,
    last_online_text: getLastOnlineText(data.online_status, data.last_online),
    is_following: false,
    is_own_profile: true,
  })

  return res.json({
    message: "Profile berhasil diperbarui",
    profile: withItems,
  })
}

export async function followUser(req: Request, res: Response) {
  const followerId = req.user.id
  const { userId } = req.params

  if (followerId === userId) {
    return res.status(400).json({
      message: "Tidak bisa follow diri sendiri",
    })
  }

  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("id, followers_count")
    .eq("id", userId)
    .maybeSingle()

  if (!targetProfile) {
    return res.status(404).json({
      message: "User target tidak ditemukan",
    })
  }

  const { data: existing } = await supabase
    .from("follows")
    .select("id")
    .eq("follower_id", followerId)
    .eq("following_id", userId)
    .maybeSingle()

  if (existing) {
    return res.json({
      message: "Sudah follow user ini",
      is_following: true,
    })
  }

  const { error } = await supabase.from("follows").insert({
    follower_id: followerId,
    following_id: userId,
  })

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("following_count")
    .eq("id", followerId)
    .maybeSingle()

  const newFollowersCount = (targetProfile.followers_count || 0) + 1
  const newFollowingCount = (myProfile?.following_count || 0) + 1

  await supabase
    .from("profiles")
    .update({
      followers_count: newFollowersCount,
    })
    .eq("id", userId)

  await supabase
    .from("profiles")
    .update({
      following_count: newFollowingCount,
    })
    .eq("id", followerId)

  return res.status(201).json({
    message: "Berhasil follow user",
    is_following: true,
    followers_count: newFollowersCount,
  })
}

export async function unfollowUser(req: Request, res: Response) {
  const followerId = req.user.id
  const { userId } = req.params

  if (followerId === userId) {
    return res.status(400).json({
      message: "Tidak bisa unfollow diri sendiri",
    })
  }

  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("id, followers_count")
    .eq("id", userId)
    .maybeSingle()

  if (!targetProfile) {
    return res.status(404).json({
      message: "User target tidak ditemukan",
    })
  }

  const { data: existing } = await supabase
    .from("follows")
    .select("id")
    .eq("follower_id", followerId)
    .eq("following_id", userId)
    .maybeSingle()

  if (!existing) {
    return res.json({
      message: "Kamu belum follow user ini",
      is_following: false,
    })
  }

  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", followerId)
    .eq("following_id", userId)

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("following_count")
    .eq("id", followerId)
    .maybeSingle()

  const newFollowersCount = Math.max((targetProfile.followers_count || 1) - 1, 0)
  const newFollowingCount = Math.max((myProfile?.following_count || 1) - 1, 0)

  await supabase
    .from("profiles")
    .update({
      followers_count: newFollowersCount,
    })
    .eq("id", userId)

  await supabase
    .from("profiles")
    .update({
      following_count: newFollowingCount,
    })
    .eq("id", followerId)

  return res.json({
    message: "Berhasil unfollow user",
    is_following: false,
    followers_count: newFollowersCount,
  })
}