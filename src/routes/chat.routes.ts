import { Router } from "express"
import { authMiddleware } from "../middlewares/auth.middleware"
import {
  createPrivateChat,
  getChatMessages,
  markMessagesAsRead,
  sendMessage,
  getRoomChatMessages,
  sendRoomChatMessage
} from "../controllers/chat.controller"

const router = Router()

router.post("/private", authMiddleware, createPrivateChat)
router.get("/:chatId/messages", authMiddleware, getChatMessages)
router.post("/:chatId/messages", authMiddleware, sendMessage)
router.patch("/:chatId/read", authMiddleware, markMessagesAsRead)
router.get("/room/:roomId/messages", authMiddleware, getRoomChatMessages)
router.post("/room/:roomId/messages", authMiddleware, sendRoomChatMessage)

export default router