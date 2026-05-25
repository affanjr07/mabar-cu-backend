import { Router } from "express"
import { authMiddleware } from "../middlewares/auth.middleware"
import { roleMiddleware } from "../middlewares/role.middleware"
import {
  createCommunityChannel,
  getCommunityChannels,
  getCommunityMessages,
  sendCommunityMessage,
} from "../controllers/community.controller"

const router = Router()

router.get("/channels", authMiddleware, getCommunityChannels)

router.get(
  "/channels/:channelId/messages",
  authMiddleware,
  getCommunityMessages
)

router.post(
  "/channels/:channelId/messages",
  authMiddleware,
  sendCommunityMessage
)

router.post(
  "/channels",
  authMiddleware,
  roleMiddleware(["admin"]),
  createCommunityChannel
)

export default router