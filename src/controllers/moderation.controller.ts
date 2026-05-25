import { Request, Response } from "express"
import { supabase } from "../config/supabase"
import {
  moderateImageByUrl,
  moderateText,
} from "../services/moderation.service"

export async function checkTextModeration(req: Request, res: Response) {
  try {
    const userId = req.user.id
    const { text, target_id, target_type = "text" } = req.body

    if (!text) {
      return res.status(400).json({
        message: "Text wajib diisi",
      })
    }

    const result = await moderateText(text)

    const status = result.flagged ? "flagged" : "safe"

    await supabase.from("moderation_logs").insert({
      user_id: userId,
      target_type,
      target_id,
      provider: "openai",
      status,
      reason: result.flagged ? "Text terdeteksi berisiko" : "Text aman",
      score: result.category_scores,
      raw_response: result.raw,
    })

    return res.json({
      status,
      flagged: result.flagged,
      categories: result.categories,
      category_scores: result.category_scores,
    })
  } catch (error: any) {
    return res.status(500).json({
      message: "Gagal melakukan text moderation",
      error: error.message,
    })
  }
}

export async function checkImageModeration(req: Request, res: Response) {
  try {
    const userId = req.user.id
    const { image_url, target_id, target_type = "image" } = req.body

    if (!image_url) {
      return res.status(400).json({
        message: "image_url wajib diisi",
      })
    }

    const result = await moderateImageByUrl(image_url)

    const status = result.unsafe ? "blocked" : "safe"

    await supabase.from("moderation_logs").insert({
      user_id: userId,
      target_type,
      target_id,
      provider: "sightengine",
      status,
      reason: result.unsafe ? "Image tidak aman" : "Image aman",
      score: result.raw,
      raw_response: result.raw,
    })

    return res.json({
      status,
      unsafe: result.unsafe,
      result: result.raw,
    })
  } catch (error: any) {
    return res.status(500).json({
      message: "Gagal melakukan image moderation",
      error: error.message,
    })
  }
}