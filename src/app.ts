import express from "express"
import cors from "cors"
import helmet from "helmet"
import morgan from "morgan"
import cookieParser from "cookie-parser"
import rateLimit from "express-rate-limit"

import authRoutes from "./routes/auth.routes"
import profileRoutes from "./routes/profile.routes"
import adminRoutes from "./routes/admin.routes"

import reportRoutes from "./routes/report.routes"
import announcementRoutes from "./routes/announcement.routes"

import socialRoutes from "./routes/social.routes"
import playersRoutes from "./routes/players.routes"
import matchmakingRoutes from "./routes/matchmaking.routes"
import gameRoutes from "./routes/game.routes"

import notificationRoutes from "./routes/notification.routes"

import chatRoutes from "./routes/chat.routes"

import tournamentRoutes from "./routes/tournament.routes"

import moderationRoutes from "./routes/moderation.routes"

import uploadRoutes from "./routes/upload.routes"
import communityRoutes from "./routes/community.routes"
import proRoutes from "./routes/pro.routes"
import economyRoutes from "./routes/economy.routes"

const app = express()

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
)

app.use(helmet())
app.use(morgan("dev"))
app.use(express.json())
app.use(cookieParser())

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 100 : 10000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Terlalu banyak request. Coba lagi nanti.",
  },
})

app.use(limiter)

app.get("/", (req, res) => {
  res.json({
    message: "mabar.cu backend running",
  })
})

app.use("/api/auth", authRoutes)
app.use("/api/profile", profileRoutes)

app.use("/api/social", socialRoutes)
app.use("/api/players", playersRoutes)
app.use("/api/matchmaking", matchmakingRoutes)

app.use("/api/chats", chatRoutes)
app.use("/api/upload", uploadRoutes)
app.use("/api/notifications", notificationRoutes)

app.use("/api/tournaments", tournamentRoutes)
app.use("/api/admin", adminRoutes)

app.use("/api/moderation", moderationRoutes)

app.use("/api/games", gameRoutes)
app.use("/api/community", communityRoutes)
app.use("/api/pro", proRoutes)
app.use("/api/economy", economyRoutes)

app.use("/api/reports", reportRoutes)
app.use("/api/announcements", announcementRoutes)

export default app