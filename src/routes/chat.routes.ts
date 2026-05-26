import { Router } from "express"
import { authMiddleware } from "../middlewares/auth.middleware"
import { muteMiddleware } from "../middlewares/mute.middleware"
import {
  createPrivateChat,
  getChatMessages,
  markMessagesAsRead,
  sendMessage,
  getRoomChatMessages,
  sendRoomChatMessage,
} from "../controllers/chat.controller"

const router = Router()

router.post("/private", authMiddleware, createPrivateChat)

router.get("/room/:roomId/messages", authMiddleware, getRoomChatMessages)

router.post(
  "/room/:roomId/messages",
  authMiddleware,
  muteMiddleware,
  sendRoomChatMessage
)

router.get("/:chatId/messages", authMiddleware, getChatMessages)

router.post(
  "/:chatId/messages",
  authMiddleware,
  muteMiddleware,
  sendMessage
)

router.patch("/:chatId/read", authMiddleware, markMessagesAsRead)

export default router