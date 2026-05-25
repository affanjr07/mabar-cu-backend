import { Request, Response } from "express"
import { supabase } from "../config/supabase"

export async function getGames(req: Request, res: Response) {
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .order("name", { ascending: true })

  if (error) return res.status(400).json({ message: error.message })

  return res.json(data)
}