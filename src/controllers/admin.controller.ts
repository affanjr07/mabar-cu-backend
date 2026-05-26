import { Request, Response } from "express"
import { supabase } from "../config/supabase"
import { io } from "../server"

export async function getAdminAnalytics(req: Request, res: Response) {
  try {
    const [
      usersResult,
      onlineUsersResult,
      roomsResult,
      reportsResult,
      messagesResult,
    ] = await Promise.all([
      supabase.from("users").select("id", { count: "exact", head: true }),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("online_status", true),
      supabase
        .from("party_rooms")
        .select("id", { count: "exact", head: true })
        .neq("status", "closed"),
      supabase
        .from("support_reports")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "in_progress"]),
      supabase
        .from("community_messages")
        .select("id", { count: "exact", head: true })
        .gte(
          "created_at",
          new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
        ),
    ])

    return res.json({
      totalUsers: usersResult.count || 0,
      onlineUsers: onlineUsersResult.count || 0,
      activeRooms: roomsResult.count || 0,
      reportsCount: reportsResult.count || 0,
      messagesToday: messagesResult.count || 0,
      serverStatus: "OPERATIONAL",
    })
  } catch (error: any) {
    return res.status(500).json({
      message: error.message || "Gagal mengambil analytics admin",
    })
  }
}

export async function getAdminUsers(req: Request, res: Response) {
  const { data, error } = await supabase
    .from("users")
    .select(`
      id,
      email,
      role,
      status,
      is_muted,
      muted_reason,
      banned_reason,
      created_at,
      profiles (
        username,
        display_name,
        avatar_url,
        online_status,
        last_online
      )
    `)
    .order("created_at", { ascending: false })

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  return res.json(data)
}

export async function banUser(req: Request, res: Response) {
  const { userId } = req.params
  const { reason, banned_until } = req.body

  const { data, error } = await supabase
    .from("users")
    .update({
      status: "banned",
      banned_reason: reason || "Melanggar aturan platform",
      banned_until: banned_until || null,
    })
    .eq("id", userId)
    .select()
    .single()

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  await supabase
    .from("profiles")
    .update({
      online_status: false,
      last_online: new Date().toISOString(),
    })
    .eq("id", userId)

  io.to(`user:${userId}`).emit("force_logout", {
    message: "Akun kamu terkena ban",
    reason: data.banned_reason,
    banned_until: data.banned_until,
  })

  return res.json({
    message: "User berhasil diban",
    user: data,
  })
}

export async function unbanUser(req: Request, res: Response) {
  const { userId } = req.params

  const { data, error } = await supabase
    .from("users")
    .update({
      status: "active",
      banned_reason: null,
      banned_until: null,
    })
    .eq("id", userId)
    .select()
    .single()

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  return res.json({
    message: "User berhasil di-unban",
    user: data,
  })
}

export async function muteUser(req: Request, res: Response) {
  const { userId } = req.params
  const { reason, muted_until } = req.body

  const { data, error } = await supabase
    .from("users")
    .update({
      is_muted: true,
      muted_reason: reason || "Toxic chat",
      muted_until: muted_until || null,
    })
    .eq("id", userId)
    .select()
    .single()

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  io.to(`user:${userId}`).emit("user_muted", {
    message: "Kamu terkena mute",
    reason: data.muted_reason,
    muted_until: data.muted_until,
  })

  return res.json({
    message: "User berhasil dimute",
    user: data,
  })
}

export async function unmuteUser(req: Request, res: Response) {
  const { userId } = req.params

  const { data, error } = await supabase
    .from("users")
    .update({
      is_muted: false,
      muted_reason: null,
      muted_until: null,
    })
    .eq("id", userId)
    .select()
    .single()

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  return res.json({
    message: "User berhasil di-unmute",
    user: data,
  })
}

export async function getAdminReports(req: Request, res: Response) {
  const { data, error } = await supabase
    .from("support_reports")
    .select(`
      id,
      reporter_id,
      title,
      description,
      status,
      priority,
      assigned_admin_id,
      closed_at,
      created_at
    `)
    .order("created_at", { ascending: false })

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  return res.json(data)
}

export async function getModerationLogs(req: Request, res: Response) {
  const { data, error } = await supabase
    .from("moderation_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  return res.json(data)
}

export async function createAnnouncement(req: Request, res: Response) {
  const adminId = req.user.id
  const { title, message, starts_at, ends_at } = req.body

  if (!title || !message) {
    return res.status(400).json({
      message: "title dan message wajib diisi",
    })
  }

  const startsAt = starts_at ? new Date(starts_at).toISOString() : null
  const endsAt = ends_at ? new Date(ends_at).toISOString() : null

  const { data, error } = await supabase
    .from("announcements")
    .insert({
      title,
      message,
      starts_at: startsAt,
      ends_at: endsAt,
      is_active: true,
      created_by: adminId,
    })
    .select()
    .single()

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  io.emit("announcement_received", data)

  return res.status(201).json({
    message: "Announcement berhasil dibuat",
    announcement: data,
  })
}

export async function getAnnouncements(req: Request, res: Response) {
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  return res.json(data)
}

export async function deleteAnnouncement(req: Request, res: Response) {
  const { announcementId } = req.params

  const { data, error } = await supabase
    .from("announcements")
    .update({
      is_active: false,
    })
    .eq("id", announcementId)
    .select()
    .single()

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  io.emit("announcement_deleted", {
    id: announcementId,
  })

  return res.json({
    message: "Announcement berhasil dinonaktifkan",
    announcement: data,
  })
}

export async function getActiveAnnouncements(req: Request, res: Response) {
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .eq("is_active", true)
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .order("created_at", { ascending: false })

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  return res.json(data)
}