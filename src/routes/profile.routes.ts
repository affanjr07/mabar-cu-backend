import { Router } from "express"
import {
  followUser,
  getMyProfile,
  getPublicProfile,
  unfollowUser,
  updateMyProfile,
} from "../controllers/profile.controller"
import {
  authMiddleware,
  optionalAuthMiddleware,
} from "../middlewares/auth.middleware"

const router = Router()

router.get("/me", authMiddleware, getMyProfile)
router.put("/me", authMiddleware, updateMyProfile)

router.post("/:userId/follow", authMiddleware, followUser)
router.delete("/:userId/follow", authMiddleware, unfollowUser)

router.get("/public/:identifier", optionalAuthMiddleware, getPublicProfile)

export default router