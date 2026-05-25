import { Router } from "express"
import { authMiddleware } from "../middlewares/auth.middleware"
import { uploadImage } from "../middlewares/upload.middleware"
import {
  uploadAvatar,
  uploadBanner,
  uploadChatImage,
} from "../controllers/upload.controller"

const router = Router()

router.post(
  "/avatar",
  authMiddleware,
  uploadImage.single("image"),
  uploadAvatar
)

router.post(
  "/banner",
  authMiddleware,
  uploadImage.single("image"),
  uploadBanner
)

router.post(
  "/chat-image",
  authMiddleware,
  uploadImage.single("image"),
  uploadChatImage
)

export default router