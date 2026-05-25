import { Router } from "express"
import { authMiddleware } from "../middlewares/auth.middleware"
import {
  closeReport,
  createReport,
  getMyActiveReport,
  getReportMessages,
  sendReportMessage,
} from "../controllers/report.controller"

const router = Router()

router.post("/", authMiddleware, createReport)
router.get("/me/active", authMiddleware, getMyActiveReport)
router.get("/:reportId/messages", authMiddleware, getReportMessages)
router.post("/:reportId/messages", authMiddleware, sendReportMessage)
router.patch("/:reportId/close", authMiddleware, closeReport)

export default router