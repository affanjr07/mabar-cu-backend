import { Router } from "express"
import { authMiddleware } from "../middlewares/auth.middleware"
import { roleMiddleware } from "../middlewares/role.middleware"
import {
  banUser,
  createAnnouncement,
  deleteAnnouncement,
  getAdminAnalytics,
  getAdminReports,
  getAdminUsers,
  getAnnouncements,
  getModerationLogs,
  muteUser,
  unbanUser,
  unmuteUser,
} from "../controllers/admin.controller"

const router = Router()

router.use(authMiddleware)
router.use(roleMiddleware(["admin"]))

router.get("/analytics", getAdminAnalytics)

router.get("/users", getAdminUsers)
router.patch("/users/:userId/ban", banUser)
router.patch("/users/:userId/unban", unbanUser)
router.patch("/users/:userId/mute", muteUser)
router.patch("/users/:userId/unmute", unmuteUser)

router.get("/reports", getAdminReports)
router.get("/moderation-logs", getModerationLogs)

router.get("/announcements", getAnnouncements)
router.post("/announcements", createAnnouncement)
router.delete("/announcements/:announcementId", deleteAnnouncement)

export default router