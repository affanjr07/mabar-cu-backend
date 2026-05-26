import { Request, Response } from "express"
import { supabase } from "../config/supabase"
import { io } from "../server"

function generateRoomCode() {
  return `MBAR-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
}

async function getActiveUserRoom(userId: string) {
  const { data, error } = await supabase
    .from("party_members")
    .select(`
      id,
      party_room_id,
      party_rooms (
        id,
        title,
        status,
        room_type
      )
    `)
    .eq("user_id", userId)

  if (error) return null

  return (
    data?.find((member: any) => {
      return member.party_rooms && member.party_rooms.status !== "closed"
    }) || null
  )
}

function activeRoomResponse(res: Response) {
  return res.status(400).json({
    code: "ACTIVE_ROOM_EXISTS",
    message: "Kamu sudah berada di room lain. Keluar dulu untuk masuk room ini.",
  })
}

export async function searchPartyRooms(req: Request, res: Response) {
  const { gameId, rank, role, region, status } = req.query

  let query = supabase
    .from("party_rooms")
    .select(`
      id,
      owner_id,
      game_id,
      chat_id,
      title,
      description,
      room_type,
      room_code,
      game_mode,
      target_rank,
      region,
      max_players,
      status,
      missing_roles,
      average_rank,
      owner_left_at,
      cooldown_until,
      expires_at,
      created_at,
      games (
        id,
        name,
        genre,
        roles
      ),
      party_members (
        id,
        user_id,
        role_in_game,
        is_owner,
        is_ready
      )
    `)
    .neq("status", "closed")

  if (gameId) query = query.eq("game_id", gameId)
  if (rank) query = query.eq("target_rank", rank)
  if (region) query = query.eq("region", region)
  if (status) query = query.eq("status", status)
  if (role) query = query.contains("missing_roles", [role])

  const { data: rooms, error } = await query.order("created_at", {
    ascending: false,
  })

  if (error) {
    return res.status(400).json({
      message: error.message,
      details: error,
    })
  }

  const userIds = [
    ...new Set(
      (rooms || [])
        .flatMap((room: any) => room.party_members || [])
        .map((member: any) => member.user_id)
        .filter(Boolean)
    ),
  ]

  let profiles: any[] = []

  if (userIds.length > 0) {
const { data: profileData, error: profileError } = await supabase
  .from("profiles")
  .select(`
    id,
    username,
    display_name,
    avatar_url,
    online_status
  `)
      .in("id", userIds)

    if (profileError) {
      return res.status(400).json({
        message: profileError.message,
        details: profileError,
      })
    }

    profiles = profileData || []
  }

  const profilesMap = new Map(
    profiles.map((profile: any) => [profile.id, profile])
  )

  const finalRooms = (rooms || []).map((room: any) => ({
    ...room,
    party_members: (room.party_members || []).map((member: any) => ({
      ...member,
      profiles: profilesMap.get(member.user_id) || null,
    })),
  }))

  return res.json(finalRooms)
}

export async function createPartyRoom(req: Request, res: Response) {
  const ownerId = req.user.id

  const activeRoom = await getActiveUserRoom(ownerId)
  if (activeRoom) return activeRoomResponse(res)

  const {
    game_id,
    title,
    description,
    room_type = "public",
    game_mode,
    target_rank,
    region,
    max_players = 5,
    selected_role,
    required_roles = [],
  } = req.body

  if (!game_id || !title || !selected_role) {
    return res.status(400).json({
      message: "game_id, title, dan selected_role wajib diisi",
    })
  }

  const missingRoles = required_roles.filter(
    (role: string) => role !== selected_role
  )

  const { data: chat, error: chatError } = await supabase
    .from("chats")
    .insert({
      type: "room",
    })
    .select()
    .single()

  if (chatError) {
    return res.status(400).json({ message: chatError.message })
  }

  const roomCode = room_type === "private" ? generateRoomCode() : null
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const { data: room, error: roomError } = await supabase
    .from("party_rooms")
    .insert({
      owner_id: ownerId,
      game_id,
      chat_id: chat.id,
      title,
      description,
      room_type,
      room_code: roomCode,
      game_mode,
      target_rank,
      region,
      max_players,
      missing_roles: missingRoles,
      average_rank: target_rank,
      status: "open",
      expires_at: expiresAt,
    })
    .select()
    .single()

  if (roomError) {
    return res.status(400).json({ message: roomError.message })
  }

  await supabase
    .from("chats")
    .update({
      party_room_id: room.id,
    })
    .eq("id", chat.id)

  const { error: memberError } = await supabase.from("party_members").insert({
    party_room_id: room.id,
    user_id: ownerId,
    role_in_game: selected_role,
    is_owner: true,
    is_ready: false,
    expires_at: expiresAt,
  })

  if (memberError) {
    return res.status(400).json({ message: memberError.message })
  }

  io.emit("party_room_created", room)

  return res.status(201).json({
    message: "Party room berhasil dibuat",
    room,
    room_code: roomCode,
  })
}

export async function joinPartyRoom(req: Request, res: Response) {
  const userId = req.user.id
  const { roomId } = req.params
  const { role_in_game } = req.body

  const activeRoom = await getActiveUserRoom(userId)

  if (activeRoom) {
    const activeRoomId = (activeRoom as any).party_room_id

    if (activeRoomId === roomId) {
      return res.status(400).json({
        code: "ALREADY_IN_THIS_ROOM",
        message: "Kamu sudah join room ini.",
      })
    }

    return activeRoomResponse(res)
  }

  const { data: room, error: roomError } = await supabase
    .from("party_rooms")
    .select("*")
    .eq("id", roomId)
    .single()

  if (roomError || !room) {
    return res.status(404).json({ message: "Room tidak ditemukan" })
  }

  if (room.room_type === "private") {
    return res.status(400).json({
      message: "Room private wajib join menggunakan room code.",
    })
  }

  if (room.status === "closed") {
    return res.status(400).json({ message: "Room sudah ditutup" })
  }

  if (room.status !== "open" && room.status !== "cooldown") {
    return res.status(400).json({ message: "Room tidak terbuka" })
  }

  const { count } = await supabase
    .from("party_members")
    .select("*", { count: "exact", head: true })
    .eq("party_room_id", roomId)

  if ((count || 0) >= room.max_players) {
    return res.status(400).json({ message: "Party sudah penuh" })
  }

  const { error } = await supabase.from("party_members").insert({
    party_room_id: roomId,
    user_id: userId,
    role_in_game,
    is_owner: false,
    is_ready: false,
    expires_at:
      room.expires_at ||
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  })

  if (error) {
    return res.status(400).json({ message: error.message })
  }

  const missingRoles = (room.missing_roles || []).filter(
    (item: string) => item !== role_in_game
  )

  const newCount = (count || 0) + 1

  await supabase
    .from("party_rooms")
    .update({
      missing_roles: missingRoles,
      status: newCount >= room.max_players ? "full" : "open",
    })
    .eq("id", roomId)

  io.to(room.chat_id).emit("party_member_joined", {
    roomId,
    userId,
    role_in_game,
  })

  io.emit("party_rooms_updated")

  return res.json({
    message: "Berhasil join party",
  })
}

export async function joinPartyRoomByCode(req: Request, res: Response) {
  const userId = req.user.id
  const { room_code, role_in_game } = req.body

  const activeRoom = await getActiveUserRoom(userId)
  if (activeRoom) return activeRoomResponse(res)

  if (!room_code) {
    return res.status(400).json({
      message: "Room code wajib diisi",
    })
  }

  const { data: room, error: roomError } = await supabase
    .from("party_rooms")
    .select("*")
    .eq("room_code", String(room_code).toUpperCase())
    .single()

  if (roomError || !room) {
    return res.status(404).json({
      message: "Room code tidak valid",
    })
  }

  if (room.room_type !== "private") {
    return res.status(400).json({
      message: "Room ini bukan private room",
    })
  }

  if (room.status === "closed") {
    return res.status(400).json({
      message: "Room sudah ditutup",
    })
  }

  if (room.status !== "open" && room.status !== "cooldown") {
    return res.status(400).json({
      message: "Room tidak terbuka",
    })
  }

  const { count } = await supabase
    .from("party_members")
    .select("*", { count: "exact", head: true })
    .eq("party_room_id", room.id)

  if ((count || 0) >= room.max_players) {
    return res.status(400).json({
      message: "Party sudah penuh",
    })
  }

  const { error } = await supabase.from("party_members").insert({
    party_room_id: room.id,
    user_id: userId,
    role_in_game,
    is_owner: false,
    is_ready: false,
    expires_at:
      room.expires_at ||
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  })

  if (error) {
    return res.status(400).json({ message: error.message })
  }

  const missingRoles = (room.missing_roles || []).filter(
    (item: string) => item !== role_in_game
  )

  const newCount = (count || 0) + 1

  await supabase
    .from("party_rooms")
    .update({
      missing_roles: missingRoles,
      status: newCount >= room.max_players ? "full" : "open",
    })
    .eq("id", room.id)

  io.to(room.chat_id).emit("party_member_joined", {
    roomId: room.id,
    userId,
    role_in_game,
  })

  io.emit("party_rooms_updated")

  return res.json({
    message: "Berhasil join private room",
    room,
  })
}

export async function leavePartyRoom(req: Request, res: Response) {
  const userId = req.user.id
  const { roomId } = req.params

  const { data: member, error: memberError } = await supabase
    .from("party_members")
    .select("*")
    .eq("party_room_id", roomId)
    .eq("user_id", userId)
    .single()

  if (memberError || !member) {
    return res.status(404).json({
      message: "Kamu bukan member room ini",
    })
  }

  const { data: room } = await supabase
    .from("party_rooms")
    .select("*")
    .eq("id", roomId)
    .single()

  const { error } = await supabase
    .from("party_members")
    .delete()
    .eq("party_room_id", roomId)
    .eq("user_id", userId)

  if (error) {
    return res.status(400).json({ message: error.message })
  }

  const { count } = await supabase
    .from("party_members")
    .select("*", { count: "exact", head: true })
    .eq("party_room_id", roomId)

  if (member.is_owner) {
    const cooldownUntil = new Date(Date.now() + 3 * 60 * 1000).toISOString()

    await supabase
      .from("party_rooms")
      .update({
        status: "cooldown",
        owner_left_at: new Date().toISOString(),
        cooldown_until: cooldownUntil,
      })
      .eq("id", roomId)

    io.to(room?.chat_id).emit("room_owner_left", {
      roomId,
      cooldown_until: cooldownUntil,
      message:
        "Owner keluar. Room akan ditutup dalam 3 menit jika tidak ada owner baru.",
    })

    io.emit("party_rooms_updated")

    return res.json({
      message: "Owner keluar. Room masuk cooldown 3 menit.",
      cooldown_until: cooldownUntil,
    })
  }

  await supabase
    .from("party_rooms")
    .update({
      status: (count || 0) >= room?.max_players ? "full" : "open",
    })
    .eq("id", roomId)

  io.to(room?.chat_id).emit("party_member_left", {
    roomId,
    userId,
  })

  io.emit("party_rooms_updated")

  return res.json({
    message: "Berhasil keluar party",
  })
}

export async function transferRoomOwnership(req: Request, res: Response) {
  const ownerId = req.user.id
  const { roomId } = req.params
  const { new_owner_id } = req.body

  const { data: ownerMember } = await supabase
    .from("party_members")
    .select("*")
    .eq("party_room_id", roomId)
    .eq("user_id", ownerId)
    .eq("is_owner", true)
    .maybeSingle()

  if (!ownerMember) {
    return res.status(403).json({
      message: "Hanya owner yang bisa transfer ownership",
    })
  }

  const { data: targetMember } = await supabase
    .from("party_members")
    .select("*")
    .eq("party_room_id", roomId)
    .eq("user_id", new_owner_id)
    .maybeSingle()

  if (!targetMember) {
    return res.status(404).json({
      message: "Target bukan member room",
    })
  }

  await supabase
    .from("party_members")
    .update({ is_owner: false })
    .eq("party_room_id", roomId)

  await supabase
    .from("party_members")
    .update({ is_owner: true })
    .eq("party_room_id", roomId)
    .eq("user_id", new_owner_id)

  await supabase
    .from("party_rooms")
    .update({
      owner_id: new_owner_id,
      status: "open",
      owner_left_at: null,
      cooldown_until: null,
    })
    .eq("id", roomId)

  io.emit("party_rooms_updated")

  return res.json({
    message: "Ownership berhasil dipindahkan",
  })
}

export async function closeExpiredCooldownRooms(req: Request, res: Response) {
  const now = new Date().toISOString()

  const { data: rooms, error } = await supabase
    .from("party_rooms")
    .select("id")
    .eq("status", "cooldown")
    .lte("cooldown_until", now)

  if (error) {
    return res.status(400).json({ message: error.message })
  }

  const ids = rooms?.map((room) => room.id) || []

  if (ids.length === 0) {
    return res.json({
      message: "Tidak ada room cooldown expired",
      closed: 0,
    })
  }

  await supabase
    .from("party_rooms")
    .update({
      status: "closed",
      closed_at: now,
    })
    .in("id", ids)

  io.emit("party_rooms_updated")

  return res.json({
    message: "Expired cooldown rooms ditutup",
    closed: ids.length,
  })
}