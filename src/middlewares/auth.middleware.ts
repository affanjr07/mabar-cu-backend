import { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"
import { supabase } from "../config/supabase"

declare global {
  namespace Express {
    interface Request {
      user?: any
    }
  }
}

export async function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    req.user = null
    return next()
  }

  try {
    const token = authHeader.split(" ")[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any

    const { data: user } = await supabase
      .from("users")
      .select("id,email,role,status,is_muted")
      .eq("id", decoded.id)
      .maybeSingle()

    req.user = user || null
    return next()
  } catch {
    req.user = null
    return next()
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Token tidak ditemukan",
    })
  }

  const token = authHeader.split(" ")[1]

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as any

    const { data: user, error } = await supabase
      .from("users")
      .select(`
        id,
        email,
        role,
        status,
        banned_reason,
        banned_until,
        is_muted,
        muted_reason,
        muted_until
      `)
      .eq("id", decoded.id)
      .single()

    if (error || !user) {
      return res.status(401).json({
        message: "User tidak ditemukan",
      })
    }

    if (user.status === "banned") {
      const bannedUntil = user.banned_until
        ? new Date(user.banned_until)
        : null

      if (!bannedUntil || bannedUntil > new Date()) {
        return res.status(403).json({
          code: "USER_BANNED",
          message: "Akun kamu terkena ban",
          reason: user.banned_reason || "Melanggar aturan platform",
          banned_until: user.banned_until,
        })
      }

      await supabase
        .from("users")
        .update({
          status: "active",
          banned_reason: null,
          banned_until: null,
        })
        .eq("id", user.id)

      user.status = "active"
      user.banned_reason = null
      user.banned_until = null
    }

    req.user = user
    next()
  } catch {
    return res.status(401).json({
      message: "Token tidak valid",
    })
  }
}