import { Router } from "express"
import { authMiddleware } from "../middlewares/auth.middleware"
import { getActiveAnnouncements } from "../controllers/admin.controller"

const router = Router()

router.get("/active", authMiddleware, getActiveAnnouncements)

export default router