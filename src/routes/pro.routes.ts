import { Router } from "express"
import { authMiddleware } from "../middlewares/auth.middleware"
import {
  acceptProBooking,
  createProBooking,
  getMyBookings,
  getMyProSettings,
  getProPlayers,
  payDemoBooking,
  rejectProBooking,
  upsertProSettings,
} from "../controllers/pro.controller"

const router = Router()

router.get("/players", authMiddleware, getProPlayers)

router.get("/settings/me", authMiddleware, getMyProSettings)
router.put("/settings/me", authMiddleware, upsertProSettings)

router.get("/bookings/me", authMiddleware, getMyBookings)
router.post("/bookings", authMiddleware, createProBooking)
router.patch("/bookings/:bookingId/pay-demo", authMiddleware, payDemoBooking)
router.patch("/bookings/:bookingId/accept", authMiddleware, acceptProBooking)
router.patch("/bookings/:bookingId/reject", authMiddleware, rejectProBooking)

export default router