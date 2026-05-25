import { Router } from "express"
import { authMiddleware } from "../middlewares/auth.middleware"
import {
  createNotification,
  deleteNotification,
  getMyNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "../controllers/notification.controller"

const router = Router()

router.get("/", authMiddleware, getMyNotifications)
router.post("/", authMiddleware, createNotification)
router.patch("/read-all", authMiddleware, markAllNotificationsAsRead)
router.patch("/:notificationId/read", authMiddleware, markNotificationAsRead)
router.delete("/:notificationId", authMiddleware, deleteNotification)

export default router