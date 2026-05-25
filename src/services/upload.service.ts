import { supabase } from "../config/supabase"

export async function uploadToSupabaseStorage({
  bucket,
  file,
  userId,
}: {
  bucket: string
  file: Express.Multer.File
  userId: string
}) {
  const fileExt = file.originalname.split(".").pop()
  const fileName = `${userId}-${Date.now()}.${fileExt}`
  const filePath = `${userId}/${fileName}`

  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: true,
    })

  if (error) {
    throw new Error(error.message)
  }

  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(filePath)

  return {
    path: filePath,
    publicUrl: data.publicUrl,
  }
}