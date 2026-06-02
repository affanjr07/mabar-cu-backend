import { Router } from "express"
import { authMiddleware } from "../middlewares/auth.middleware"
import { roleMiddleware } from "../middlewares/role.middleware"
import {
  createAnnouncement,
  deleteAnnouncement,
  getActiveAnnouncements,
  getAdminAnnouncements,
} from "../controllers/announcement.controller"

const router = Router()

router.get("/active", getActiveAnnouncements)

router.get(
  "/admin",
  authMiddleware,
  roleMiddleware(["admin"]),
  getAdminAnnouncements
)

router.post(
  "/",
  authMiddleware,
  roleMiddleware(["admin"]),
  createAnnouncement
)

router.delete(
  "/:announcementId",
  authMiddleware,
  roleMiddleware(["admin"]),
  deleteAnnouncement
)

export default router