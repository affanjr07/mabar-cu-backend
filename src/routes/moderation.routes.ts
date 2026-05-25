import { Router } from "express"
import { authMiddleware } from "../middlewares/auth.middleware"
import {
  checkImageModeration,
  checkTextModeration,
} from "../controllers/moderation.controller"

const router = Router()

router.post("/text", authMiddleware, checkTextModeration)
router.post("/image", authMiddleware, checkImageModeration)

export default router