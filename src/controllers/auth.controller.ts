import { Request, Response } from "express"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { supabase } from "../config/supabase"

export async function register(req: Request, res: Response) {
  try {
    const { email, password, username } = req.body

    if (!email || !password || !username) {
      return res.status(400).json({
        message: "Email, password, dan username wajib diisi",
      })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const { data: user, error: userError } = await supabase
      .from("users")
      .insert({
        email,
        password: hashedPassword,
        role: "user",
      })
      .select()
      .single()

    if (userError) {
      return res.status(400).json({
        message: userError.message,
      })
    }

    const { error: profileError } = await supabase.from("profiles").insert({
      id: user.id,
      username,
      display_name: username,
      online_status: false,
    })

    if (profileError) {
      return res.status(400).json({
        message: profileError.message,
      })
    }

    return res.status(201).json({
      message: "Register berhasil",
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    })
  } catch {
    return res.status(500).json({
      message: "Server error",
    })
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single()

    if (error || !user) {
      return res.status(401).json({
        message: "Email atau password salah",
      })
    }

    if (user.is_banned) {
      return res.status(403).json({
        message: "Akun kamu sedang dibanned",
      })
    }

    const validPassword = await bcrypt.compare(password, user.password)

    if (!validPassword) {
      return res.status(401).json({
        message: "Email atau password salah",
      })
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
      },
      process.env.JWT_SECRET as string,
      {
        expiresIn: "7d",
      }
    )

    await supabase
      .from("profiles")
      .update({
        online_status: true,
        last_online: new Date().toISOString(),
      })
      .eq("id", user.id)

    return res.json({
      message: "Login berhasil",
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    })
  } catch {
    return res.status(500).json({
      message: "Server error",
    })
  }
}

export async function me(req: Request, res: Response) {
  const userId = req.user.id

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single()

  if (error) {
    return res.status(404).json({
      message: "Profile tidak ditemukan",
    })
  }

  return res.json({
    user: req.user,
    profile: data,
  })
}