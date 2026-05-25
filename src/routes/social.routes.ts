import { Router } from "express"
import { authMiddleware } from "../middlewares/auth.middleware"
import {
  blockUser,
  followUser,
  getFollowers,
  getFollowing,
  getFriends,
  unfollowUser,
} from "../controllers/social.controller"

const router = Router()

router.post("/follow/:userId", authMiddleware, followUser)
router.delete("/unfollow/:userId", authMiddleware, unfollowUser)
router.post("/block/:userId", authMiddleware, blockUser)

router.get("/friends", authMiddleware, getFriends)
router.get("/followers", authMiddleware, getFollowers)
router.get("/following", authMiddleware, getFollowing)

export default router