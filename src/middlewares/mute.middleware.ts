import { Request, Response, NextFunction } from "express"
import { supabase } from "../config/supabase"

export async function muteMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const user = req.user

  if (!user) {
    return res.status(401).json({
      message: "Unauthorized",
    })
  }

  if (user.is_muted) {
    const mutedUntil = user.muted_until ? new Date(user.muted_until) : null

    if (!mutedUntil || mutedUntil > new Date()) {
      return res.status(403).json({
        code: "USER_MUTED",
        message: "Kamu sedang terkena mute dan tidak bisa mengirim chat",
        reason: user.muted_reason || "Melanggar aturan chat",
        muted_until: user.muted_until,
      })
    }

    await supabase
      .from("users")
      .update({
        is_muted: false,
        muted_reason: null,
        muted_until: null,
      })
      .eq("id", user.id)

    req.user.is_muted = false
    req.user.muted_reason = null
    req.user.muted_until = null
  }

  next()
}