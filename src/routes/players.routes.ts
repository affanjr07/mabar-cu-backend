import { Router } from "express"
import { searchPlayers } from "../controllers/players.controller"

const router = Router()

router.get("/search", searchPlayers)

export default router