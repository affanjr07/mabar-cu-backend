import axios from "axios"
import FormData from "form-data"
import { openai } from "../config/openai"

function checkImageUnsafe(data: any) {
  const sexualActivity = data?.nudity?.sexual_activity || 0
  const sexualDisplay = data?.nudity?.sexual_display || 0
  const erotica = data?.nudity?.erotica || 0
  const gore = data?.gore?.prob || 0
  const weapon = data?.weapon || 0
  const alcohol = data?.alcohol || 0
  const drugs = data?.drugs || 0
  const offensive = data?.offensive?.prob || 0

  return (
    sexualActivity > 0.6 ||
    sexualDisplay > 0.6 ||
    erotica > 0.7 ||
    gore > 0.6 ||
    weapon > 0.6 ||
    alcohol > 0.8 ||
    drugs > 0.8 ||
    offensive > 0.7
  )
}

export async function moderateText(text: string) {
  const result = await openai.moderations.create({
    model: "omni-moderation-latest",
    input: text,
  })

  const output = result.results[0]

  return {
    flagged: output.flagged,
    categories: output.categories,
    category_scores: output.category_scores,
    raw: result,
  }
}

export async function moderateImageByUrl(imageUrl: string) {
  const params = new URLSearchParams()

  params.append("url", imageUrl)
  params.append("models", "nudity-2.1,wad,offensive,gore-2.0")
  params.append("api_user", process.env.SIGHTENGINE_API_USER as string)
  params.append("api_secret", process.env.SIGHTENGINE_API_SECRET as string)

  const response = await axios.post(
    "https://api.sightengine.com/1.0/check.json",
    params,
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  )

  const data = response.data
  const unsafe = checkImageUnsafe(data)

  return {
    unsafe,
    raw: data,
  }
}

export async function moderateImageFile(
  fileBuffer: Buffer,
  filename: string
) {
  const form = new FormData()

  form.append("media", fileBuffer, filename)
  form.append("models", "nudity-2.1,wad,offensive,gore-2.0")
  form.append("api_user", process.env.SIGHTENGINE_API_USER as string)
  form.append("api_secret", process.env.SIGHTENGINE_API_SECRET as string)

  const response = await axios.post(
    "https://api.sightengine.com/1.0/check.json",
    form,
    {
      headers: form.getHeaders(),
    }
  )

  const data = response.data
  const unsafe = checkImageUnsafe(data)

  return {
    unsafe,
    raw: data,
  }
}