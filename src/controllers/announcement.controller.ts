import { Request, Response } from "express"
import { supabase } from "../config/supabase"

export async function createAnnouncement(req: Request, res: Response) {
  const adminId = req.user.id
  const { title, message, starts_at, ends_at, type = "info" } = req.body

  if (!title || !message) {
    return res.status(400).json({
      message: "title dan message wajib diisi",
    })
  }

  const { data, error } = await supabase
    .from("announcements")
    .insert({
      title,
      message,
      type,
      starts_at: starts_at || null,
      ends_at: ends_at || null,
      created_by: adminId,
      is_active: true,
    })
    .select()
    .single()

  if (error) {
    return res.status(400).json({ message: error.message })
  }

  return res.status(201).json({
    message: "Announcement berhasil dibuat",
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
    return res.status(400).json({ message: error.message })
  }

  return res.json(data || [])
}

export async function getAdminAnnouncements(req: Request, res: Response) {
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    return res.status(400).json({ message: error.message })
  }

  return res.json(data || [])
}

export async function deleteAnnouncement(req: Request, res: Response) {
  const { announcementId } = req.params

  const { error } = await supabase
    .from("announcements")
    .update({ is_active: false })
    .eq("id", announcementId)

  if (error) {
    return res.status(400).json({ message: error.message })
  }

  return res.json({
    message: "Announcement dinonaktifkan",
  })
}