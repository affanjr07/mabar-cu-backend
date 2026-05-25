import { Request, Response } from "express"
import { supabase } from "../config/supabase"
import { io } from "../server"

export async function followUser(req: Request, res: Response) {
  const followerId = req.user.id
  const { userId } = req.params

  if (followerId === userId) {
    return res.status(400).json({ message: "Tidak bisa follow diri sendiri" })
  }

  const { error } = await supabase.from("follows").insert({
    follower_id: followerId,
    following_id: userId,
  })

  if (error) return res.status(400).json({ message: error.message })

  const { data: notification, error: notificationError } = await supabase
    .from("notifications")
    .insert({
      user_id: userId,
      sender_id: followerId,
      type: "follow",
      title: "Follower baru",
      message: "Seseorang mulai mengikuti kamu",
    })
    .select()
    .single()

  if (notificationError) {
    console.log("Notification error:", notificationError.message)
  }

  if (notification) {
    io.to(`user:${userId}`).emit("notification_received", notification)
  }

  return res.json({ message: "Berhasil follow user" })
}

export async function unfollowUser(req: Request, res: Response) {
  const followerId = req.user.id
  const { userId } = req.params

  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", followerId)
    .eq("following_id", userId)

  if (error) return res.status(400).json({ message: error.message })

  return res.json({ message: "Berhasil unfollow user" })
}


export async function blockUser(req: Request, res: Response) {
  const blockerId = req.user.id
  const { userId } = req.params
  const { reason } = req.body

  if (blockerId === userId) {
    return res.status(400).json({ message: "Tidak bisa block diri sendiri" })
  }

  await supabase
    .from("follows")
    .delete()
    .or(`follower_id.eq.${blockerId},follower_id.eq.${userId}`)

  await supabase
    .from("friends")
    .delete()
    .or(`user_one.eq.${blockerId},user_two.eq.${blockerId}`)

  const { error } = await supabase.from("blocked_users").insert({
    blocker_id: blockerId,
    blocked_id: userId,
    reason,
  })

  if (error) return res.status(400).json({ message: error.message })

  return res.json({ message: "User berhasil diblock" })
}

export async function getFriends(req: Request, res: Response) {
  const userId = req.user.id

  const { data, error } = await supabase
    .from("friends")
    .select(`
      id,
      user_one,
      user_two,
      created_at
    `)
    .or(`user_one.eq.${userId},user_two.eq.${userId}`)

  if (error) return res.status(400).json({ message: error.message })

  return res.json(data)
}

export async function getFollowers(req: Request, res: Response) {
  const userId = req.user.id

  const { data, error } = await supabase
    .from("follows")
    .select("*")
    .eq("following_id", userId)

  if (error) return res.status(400).json({ message: error.message })

  return res.json(data)
}

export async function getFollowing(req: Request, res: Response) {
  const userId = req.user.id

  const { data, error } = await supabase
    .from("follows")
    .select("*")
    .eq("follower_id", userId)

  if (error) return res.status(400).json({ message: error.message })

  return res.json(data)
}

