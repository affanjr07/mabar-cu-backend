import { Request, Response } from "express"
import { supabase } from "../config/supabase"
import { io } from "../server"

function generateRoomCode() {
  return `MBAR-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
}

export async function searchPartyRooms(req: Request, res: Response) {
  const { gameId, rank, role, region, status = "open" } = req.query

  let query = supabase
    .from("party_rooms")
    .select(`
      id,
      owner_id,
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

  const { data, error } = await query.order("created_at", {
    ascending: false,
  })

  if (error) {
    console.log("SEARCH PARTY ROOMS ERROR:", error)

    return res.status(400).json({
      message: error.message,
      details: error,
    })
  }

  return res.json(data)
}

export async function createPartyRoom(req: Request, res: Response) {
  const ownerId = req.user.id

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

  const { error: memberError } = await supabase
    .from("party_members")
    .insert({
      party_room_id: room.id,
      user_id: ownerId,
      role_in_game: selected_role,
      is_owner: true,
      is_ready: false,
    })

  if (memberError) {
    return res.status(400).json({ message: memberError.message })
  }

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

  const { data: room, error: roomError } = await supabase
    .from("party_rooms")
    .select("*")
    .eq("id", roomId)
    .single()

  if (roomError || !room) {
    return res.status(404).json({ message: "Room tidak ditemukan" })
  }

  if (room.status === "closed") {
    return res.status(400).json({ message: "Room sudah ditutup" })
  }

  if (room.status !== "open" && room.status !== "cooldown") {
    return res.status(400).json({ message: "Room tidak terbuka" })
  }

  const { data: existingMember } = await supabase
    .from("party_members")
    .select("*")
    .eq("party_room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle()

  if (existingMember) {
    return res.status(400).json({ message: "Kamu sudah join room ini" })
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
  })

  if (error) return res.status(400).json({ message: error.message })

  const missingRoles = (room.missing_roles || []).filter(
    (role: string) => role !== role_in_game
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

  return res.json({
    message: "Berhasil join party",
  })
}

export async function joinPartyRoomByCode(req: Request, res: Response) {
  const userId = req.user.id
  const { room_code, role_in_game } = req.body

  if (!room_code) {
    return res.status(400).json({
      message: "Room code wajib diisi",
    })
  }

  const { data: room, error: roomError } = await supabase
    .from("party_rooms")
    .select("*")
    .eq("room_code", room_code.toUpperCase())
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

  const { data: existingMember } = await supabase
    .from("party_members")
    .select("*")
    .eq("party_room_id", room.id)
    .eq("user_id", userId)
    .maybeSingle()

  if (existingMember) {
    return res.status(400).json({
      message: "Kamu sudah join room ini",
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
  })

  if (error) return res.status(400).json({ message: error.message })

  const missingRoles = (room.missing_roles || []).filter(
    (role: string) => role !== role_in_game
  )

  await supabase
    .from("party_rooms")
    .update({
      missing_roles: missingRoles,
    })
    .eq("id", room.id)

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

  if (error) return res.status(400).json({ message: error.message })

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
      message: "Owner keluar. Room akan ditutup dalam 3 menit jika tidak ada owner baru.",
    })

    return res.json({
      message: "Owner keluar. Room masuk cooldown 3 menit.",
      cooldown_until: cooldownUntil,
    })
  }

  await supabase
    .from("party_rooms")
    .update({
      status: "open",
    })
    .eq("id", roomId)

  io.to(room?.chat_id).emit("party_member_left", {
    roomId,
    userId,
  })

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

  if (error) return res.status(400).json({ message: error.message })

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

  return res.json({
    message: "Expired cooldown rooms ditutup",
    closed: ids.length,
  })
}