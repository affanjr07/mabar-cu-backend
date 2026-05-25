import { Request, Response } from "express"
import { supabase } from "../config/supabase"
import { io } from "../server"

export async function getTournaments(req: Request, res: Response) {
  const { status, gameId } = req.query

  let query = supabase
    .from("tournaments")
    .select(`
      id,
      title,
      description,
      banner_url,
      date,
      prize,
      max_players,
      status,
      registration_count,
      created_at,
      games (
        id,
        name,
        genre
      )
    `)
    .order("date", { ascending: true })

  if (status) query = query.eq("status", status)
  if (gameId) query = query.eq("game_id", gameId)

  const { data, error } = await query

  if (error) return res.status(400).json({ message: error.message })

  return res.json(data)
}

export async function getTournamentDetail(req: Request, res: Response) {
  const { tournamentId } = req.params

  const { data, error } = await supabase
    .from("tournaments")
    .select(`
      id,
      title,
      description,
      banner_url,
      date,
      prize,
      max_players,
      status,
      registration_count,
      created_at,
      games (
        id,
        name,
        genre
      )
    `)
    .eq("id", tournamentId)
    .single()

  if (error) {
    return res.status(404).json({
      message: "Tournament tidak ditemukan",
    })
  }

  return res.json(data)
}

export async function createTournament(req: Request, res: Response) {
  const adminId = req.user.id

  const {
    title,
    description,
    banner_url,
    game_id,
    date,
    prize,
    max_players,
  } = req.body

  if (!title || !game_id || !date) {
    return res.status(400).json({
      message: "title, game_id, dan date wajib diisi",
    })
  }

  const { data, error } = await supabase
    .from("tournaments")
    .insert({
      created_by: adminId,
      title,
      description,
      banner_url,
      game_id,
      date,
      prize,
      max_players,
      status: "upcoming",
    })
    .select()
    .single()

  if (error) return res.status(400).json({ message: error.message })

  io.emit("tournament_created", data)

  return res.status(201).json({
    message: "Tournament berhasil dibuat",
    tournament: data,
  })
}

export async function updateTournament(req: Request, res: Response) {
  const { tournamentId } = req.params

  const {
    title,
    description,
    banner_url,
    game_id,
    date,
    prize,
    max_players,
    status,
  } = req.body

  const { data, error } = await supabase
    .from("tournaments")
    .update({
      title,
      description,
      banner_url,
      game_id,
      date,
      prize,
      max_players,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tournamentId)
    .select()
    .single()

  if (error) return res.status(400).json({ message: error.message })

  io.emit("tournament_updated", data)

  return res.json({
    message: "Tournament berhasil diupdate",
    tournament: data,
  })
}

export async function deleteTournament(req: Request, res: Response) {
  const { tournamentId } = req.params

  const { error } = await supabase
    .from("tournaments")
    .delete()
    .eq("id", tournamentId)

  if (error) return res.status(400).json({ message: error.message })

  io.emit("tournament_deleted", {
    tournamentId,
  })

  return res.json({
    message: "Tournament berhasil dihapus",
  })
}

export async function registerTournament(req: Request, res: Response) {
  const userId = req.user.id
  const { tournamentId } = req.params
  const { team_name } = req.body

  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", tournamentId)
    .single()

  if (tournamentError || !tournament) {
    return res.status(404).json({
      message: "Tournament tidak ditemukan",
    })
  }

  if (tournament.status !== "upcoming") {
    return res.status(400).json({
      message: "Pendaftaran tournament sudah ditutup",
    })
  }

  if (
    tournament.max_players &&
    tournament.registration_count >= tournament.max_players
  ) {
    return res.status(400).json({
      message: "Slot tournament sudah penuh",
    })
  }

  const { data, error } = await supabase
    .from("tournament_participants")
    .insert({
      tournament_id: tournamentId,
      user_id: userId,
      team_name,
    })
    .select()
    .single()

  if (error) return res.status(400).json({ message: error.message })

  const { data: notification } = await supabase
    .from("notifications")
    .insert({
      user_id: userId,
      sender_id: userId,
      type: "tournament_registration",
      title: "Pendaftaran Tournament Berhasil",
      message: `Kamu berhasil daftar ke ${tournament.title}`,
      data: {
        tournamentId,
      },
    })
    .select()
    .single()

  if (notification) {
    io.to(`user:${userId}`).emit("notification_received", notification)
  }

  io.emit("tournament_registration_updated", {
    tournamentId,
  })

  return res.status(201).json({
    message: "Berhasil daftar tournament",
    participant: data,
  })
}

export async function unregisterTournament(req: Request, res: Response) {
  const userId = req.user.id
  const { tournamentId } = req.params

  const { error } = await supabase
    .from("tournament_participants")
    .delete()
    .eq("tournament_id", tournamentId)
    .eq("user_id", userId)

  if (error) return res.status(400).json({ message: error.message })

  io.emit("tournament_registration_updated", {
    tournamentId,
  })

  return res.json({
    message: "Berhasil batal daftar tournament",
  })
}

export async function getTournamentParticipants(req: Request, res: Response) {
  const { tournamentId } = req.params

  const { data, error } = await supabase
    .from("tournament_participants")
    .select(`
      id,
      team_name,
      registered_at,
      user_id,
      profiles:user_id (
        username,
        display_name,
        avatar_url,
        game_rank,
        preferred_role,
        region
      )
    `)
    .eq("tournament_id", tournamentId)
    .order("registered_at", { ascending: false })

  if (error) return res.status(400).json({ message: error.message })

  return res.json(data)
}