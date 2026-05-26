import { Router } from "express"
import { authMiddleware } from "../middlewares/auth.middleware"
import {
  getProChatMessages,
  sendProChatMessage,
} from "../controllers/proChat.controller"

const router = Router()

router.get("/:chatId/messages", authMiddleware, getProChatMessages)
router.post("/:chatId/messages", authMiddleware, sendProChatMessage)

export default router