import { Router } from "express"
import {
  getMyProfile,
  getPublicProfile,
  updateMyProfile,
} from "../controllers/profile.controller"
import { authMiddleware } from "../middlewares/auth.middleware"

const router = Router()

router.get("/me", authMiddleware, getMyProfile)
router.put("/me", authMiddleware, updateMyProfile)
router.get("/public/:identifier", getPublicProfile)

export default router