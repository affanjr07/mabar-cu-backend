import { Router } from "express"
import { authMiddleware } from "../middlewares/auth.middleware"
import {
  searchPlayers,
  getFollowedPlayers,
} from "../controllers/players.controller"

const router = Router()

router.get("/search", authMiddleware, searchPlayers)
router.get("/followed", authMiddleware, getFollowedPlayers)

export default router