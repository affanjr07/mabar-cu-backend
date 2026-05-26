import http from "http"
import { Server } from "socket.io"
import dotenv from "dotenv"

import app from "./app"
import { supabase } from "./config/supabase"

import { startPartyRoomCleanupJob } from "./jobs/partyRoomCleanup.job"

dotenv.config()

const PORT = process.env.PORT || 5000

const server = http.createServer(app)

export const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    credentials: true,
  },
})

io.on("connection", (socket) => {
  console.log("User connected:", socket.id)

  socket.on("user_online", async (userId) => {
    if (!userId) return

    socket.data.userId = userId
    socket.join(`user:${userId}`)

    const now = new Date().toISOString()

    await supabase
      .from("profiles")
      .update({
        online_status: true,
        last_online: now,
      })
      .eq("id", userId)

    io.emit("online_status_changed", {
      userId,
      online: true,
      online_status: true,
      last_online: now,
    })
  })

  socket.on("user_offline", async (userId) => {
    if (!userId) return

    const now = new Date().toISOString()

    await supabase
      .from("profiles")
      .update({
        online_status: false,
        last_online: now,
      })
      .eq("id", userId)

    io.emit("online_status_changed", {
      userId,
      online: false,
      online_status: false,
      last_online: now,
    })
  })

  socket.on("join_community_channel", (channelId) => {
    socket.join(`community:${channelId}`)

    socket.emit("joined_community_channel", {
      channelId,
      message: "Berhasil join community channel",
    })
  })

  socket.on("leave_community_channel", (channelId) => {
    socket.leave(`community:${channelId}`)
  })

  socket.on("join_pro_chat", (chatId) => {
    socket.join(`pro_chat:${chatId}`)
  })

  socket.on("leave_pro_chat", (chatId) => {
    socket.leave(`pro_chat:${chatId}`)
  })

  socket.on("join_report", (reportId) => {
    socket.join(`report:${reportId}`)
  })

  socket.on("leave_report", (reportId) => {
    socket.leave(`report:${reportId}`)
  })

  socket.on("join_chat", (chatId) => {
    socket.join(chatId)

    socket.emit("joined_chat", {
      chatId,
      message: "Berhasil join chat room",
    })
  })

  socket.on("leave_chat", (chatId) => {
    socket.leave(chatId)
  })

  socket.on("typing_start", ({ chatId, userId }) => {
    socket.to(chatId).emit("user_typing", {
      chatId,
      userId,
      typing: true,
    })
  })

  socket.on("typing_stop", ({ chatId, userId }) => {
    socket.to(chatId).emit("user_typing", {
      chatId,
      userId,
      typing: false,
    })
  })

  socket.on("send_message_socket", (data) => {
    io.to(data.chatId).emit("message_received", data)
  })

  socket.on("send_notification", ({ userId, notification }) => {
    io.to(`user:${userId}`).emit("notification_received", notification)
  })

  socket.on("join_tournament", (tournamentId) => {
    socket.join(`tournament:${tournamentId}`)
  })

  socket.on("leave_tournament", (tournamentId) => {
    socket.leave(`tournament:${tournamentId}`)
  })

  socket.on("disconnect", async () => {
    console.log("User disconnected:", socket.id)

    const userId = socket.data.userId

    if (!userId) return

    const now = new Date().toISOString()

    await supabase
      .from("profiles")
      .update({
        online_status: false,
        last_online: now,
      })
      .eq("id", userId)

    io.emit("online_status_changed", {
      userId,
      online: false,
      online_status: false,
      last_online: now,
    })
  })
})

startPartyRoomCleanupJob()

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
})