import { Request, Response } from "express"
import { supabase } from "../config/supabase"
import { moderateImageFile } from "../services/moderation.service"
import { uploadToSupabaseStorage } from "../services/upload.service"

export async function uploadAvatar(req: Request, res: Response) {
  try {
    const userId = req.user.id
    const file = req.file

    if (!file) {
      return res.status(400).json({
        message: "File avatar wajib diupload",
      })
    }

    const moderation = await moderateImageFile(
      file.buffer,
      file.originalname
    )

    if (moderation.unsafe) {
      await supabase.from("moderation_logs").insert({
        user_id: userId,
        target_type: "image",
        provider: "sightengine",
        status: "blocked",
        reason: "Avatar image rejected by Sightengine",
        raw_response: moderation.raw,
      })

      return res.status(400).json({
        message: "Foto profile ditolak karena tidak aman",
      })
    }

    const uploaded = await uploadToSupabaseStorage({
      bucket: "avatars",
      file,
      userId,
    })

    const { data, error } = await supabase
      .from("profiles")
      .update({
        avatar_url: uploaded.publicUrl,
        updated_at: new Date().toISOString(),
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
      message: "Avatar berhasil diupload",
      avatar_url: uploaded.publicUrl,
      profile: data,
    })
  } catch (error: any) {
    return res.status(500).json({
      message: "Upload avatar gagal",
      error: error.message,
    })
  }
}

export async function uploadBanner(req: Request, res: Response) {
  try {
    const userId = req.user.id
    const file = req.file

    if (!file) {
      return res.status(400).json({
        message: "File banner wajib diupload",
      })
    }

    const moderation = await moderateImageFile(
      file.buffer,
      file.originalname
    )

    if (moderation.unsafe) {
      await supabase.from("moderation_logs").insert({
        user_id: userId,
        target_type: "image",
        provider: "sightengine",
        status: "blocked",
        reason: "Banner image rejected by Sightengine",
        raw_response: moderation.raw,
      })

      return res.status(400).json({
        message: "Banner ditolak karena tidak aman",
      })
    }

    const uploaded = await uploadToSupabaseStorage({
      bucket: "banners",
      file,
      userId,
    })

    const { data, error } = await supabase
      .from("profiles")
      .update({
        banner_url: uploaded.publicUrl,
        updated_at: new Date().toISOString(),
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
      message: "Banner berhasil diupload",
      banner_url: uploaded.publicUrl,
      profile: data,
    })
  } catch (error: any) {
    return res.status(500).json({
      message: "Upload banner gagal",
      error: error.message,
    })
  }
}

export async function uploadChatImage(req: Request, res: Response) {
  try {
    const userId = req.user.id
    const file = req.file

    if (!file) {
      return res.status(400).json({
        message: "File chat image wajib diupload",
      })
    }

    const moderation = await moderateImageFile(
      file.buffer,
      file.originalname
    )

    if (moderation.unsafe) {
      await supabase.from("moderation_logs").insert({
        user_id: userId,
        target_type: "image",
        provider: "sightengine",
        status: "blocked",
        reason: "Chat image rejected by Sightengine",
        raw_response: moderation.raw,
      })

      return res.status(400).json({
        message: "Gambar chat ditolak karena tidak aman",
      })
    }

    const uploaded = await uploadToSupabaseStorage({
      bucket: "chat-images",
      file,
      userId,
    })

    return res.json({
      message: "Gambar chat berhasil diupload",
      image_url: uploaded.publicUrl,
    })
  } catch (error: any) {
    return res.status(500).json({
      message: "Upload gambar chat gagal",
      error: error.message,
    })
  }
}