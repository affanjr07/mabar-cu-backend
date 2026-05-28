import { Router } from "express"
import { authMiddleware } from "../middlewares/auth.middleware"
import { roleMiddleware } from "../middlewares/role.middleware"
import { muteMiddleware } from "../middlewares/mute.middleware"
import {
  createCommunityChannel,
  getCommunityChannels,
  getCommunityMessages,
  sendCommunityMessage,
} from "../controllers/community.controller"

const router = Router()

// ─── Channel Routes ────────────────────────────────────────────────────────────

/** GET /channels — Ambil semua channel yang tersedia */
router.get("/channels", authMiddleware, getCommunityChannels)

/** POST /channels — Buat channel baru (khusus admin) */
router.post(
  "/channels",
  authMiddleware,
  roleMiddleware(["admin"]),
  createCommunityChannel
)

// ─── Message Routes ────────────────────────────────────────────────────────────

/** GET /channels/:channelId/messages — Ambil pesan di channel tertentu */
router.get(
  "/channels/:channelId/messages",
  authMiddleware,
  getCommunityMessages
)

/** POST /channels/:channelId/messages — Kirim pesan (cek mute sebelum kirim) */
router.post(
  "/channels/:channelId/messages",
  authMiddleware,
  muteMiddleware,
  sendCommunityMessage
)

export default router