import { Request, Response } from "express"
import { supabase } from "../config/supabase"
import { io } from "../server"

export async function createReport(req: Request, res: Response) {
  const userId = req.user.id
  const { title, description } = req.body

  if (!title) {
    return res.status(400).json({
      message: "Judul laporan wajib diisi",
    })
  }

  const { data: existingReport } = await supabase
    .from("support_reports")
    .select("*")
    .eq("reporter_id", userId)
    .in("status", ["open", "in_progress"])
    .maybeSingle()

  if (existingReport) {
    return res.status(400).json({
      message:
        "Kamu masih punya report aktif. Tunggu admin membalas atau menutup report dulu.",
      report: existingReport,
    })
  }

  const { data: report, error } = await supabase
    .from("support_reports")
    .insert({
      reporter_id: userId,
      title,
      description,
      status: "open",
    })
    .select()
    .single()

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  if (description) {
    await supabase.from("support_report_messages").insert({
      report_id: report.id,
      sender_id: userId,
      sender_role: "user",
      message: description,
    })
  }

  io.emit("admin_report_created", report)

  return res.status(201).json({
    message: "Report berhasil dibuat",
    report,
  })
}

export async function getMyActiveReport(req: Request, res: Response) {
  const userId = req.user.id

  const { data, error } = await supabase
    .from("support_reports")
    .select("*")
    .eq("reporter_id", userId)
    .in("status", ["open", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  return res.json(data)
}

export async function getReportMessages(req: Request, res: Response) {
  const userId = req.user.id
  const { reportId } = req.params

  const { data: report, error: reportError } = await supabase
    .from("support_reports")
    .select("*")
    .eq("id", reportId)
    .single()

  if (reportError || !report) {
    return res.status(404).json({
      message: "Report tidak ditemukan",
    })
  }

  const isOwner = report.reporter_id === userId
  const isAdmin = req.user.role === "admin"

  if (!isOwner && !isAdmin) {
    return res.status(403).json({
      message: "Tidak punya akses ke report ini",
    })
  }

  const { data, error } = await supabase
    .from("support_report_messages")
    .select("*")
    .eq("report_id", reportId)
    .order("created_at", { ascending: true })

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  return res.json(data)
}

export async function sendReportMessage(req: Request, res: Response) {
  const userId = req.user.id
  const { reportId } = req.params
  const { message } = req.body

  if (!message) {
    return res.status(400).json({
      message: "Pesan tidak boleh kosong",
    })
  }

  const { data: report, error: reportError } = await supabase
    .from("support_reports")
    .select("*")
    .eq("id", reportId)
    .single()

  if (reportError || !report) {
    return res.status(404).json({
      message: "Report tidak ditemukan",
    })
  }

  const isOwner = report.reporter_id === userId
  const isAdmin = req.user.role === "admin"

  if (!isOwner && !isAdmin) {
    return res.status(403).json({
      message: "Tidak punya akses ke report ini",
    })
  }

  if (report.status === "closed") {
    return res.status(400).json({
      message: "Report sudah ditutup",
    })
  }

  const senderRole = isAdmin ? "admin" : "user"

  const { data: createdMessage, error } = await supabase
    .from("support_report_messages")
    .insert({
      report_id: reportId,
      sender_id: userId,
      sender_role: senderRole,
      message,
    })
    .select()
    .single()

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  if (isAdmin && report.status === "open") {
    await supabase
      .from("support_reports")
      .update({
        status: "in_progress",
        assigned_admin_id: userId,
      })
      .eq("id", reportId)
  }

  io.to(`report:${reportId}`).emit("report_message_received", createdMessage)

  return res.status(201).json({
    message: "Pesan report terkirim",
    data: createdMessage,
  })
}

export async function closeReport(req: Request, res: Response) {
  const userId = req.user.id
  const { reportId } = req.params

  if (req.user.role !== "admin") {
    return res.status(403).json({
      message: "Hanya admin yang bisa menutup report",
    })
  }

  const { data: report, error: reportError } = await supabase
    .from("support_reports")
    .select("*")
    .eq("id", reportId)
    .single()

  if (reportError || !report) {
    return res.status(404).json({
      message: "Report tidak ditemukan",
    })
  }

  const { data, error } = await supabase
    .from("support_reports")
    .update({
      status: "closed",
      closed_at: new Date().toISOString(),
      assigned_admin_id: userId,
    })
    .eq("id", reportId)
    .select()
    .single()

  if (error) {
    return res.status(400).json({
      message: error.message,
    })
  }

  io.to(`report:${reportId}`).emit("report_closed", data)

  return res.json({
    message: "Report berhasil ditutup",
    report: data,
  })
}