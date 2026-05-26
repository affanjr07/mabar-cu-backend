import { Router } from "express"
import {
  closeExpiredCooldownRooms,
  createPartyRoom,
  joinPartyRoom,
  joinPartyRoomByCode,
  leavePartyRoom,
  searchPartyRooms,
  transferRoomOwnership,
} from "../controllers/matchmaking.controller"
import { authMiddleware } from "../middlewares/auth.middleware"

const router = Router()

router.get("/rooms", searchPartyRooms)

router.post("/rooms", authMiddleware, createPartyRoom)

router.post("/rooms/join-by-code", authMiddleware, joinPartyRoomByCode)

router.post("/rooms/:roomId/join", authMiddleware, joinPartyRoom)

router.delete("/rooms/:roomId/leave", authMiddleware, leavePartyRoom)

router.patch(
  "/rooms/:roomId/transfer-owner",
  authMiddleware,
  transferRoomOwnership
)

router.post(
  "/rooms/close-expired-cooldowns",
  authMiddleware,
  closeExpiredCooldownRooms
)

export default router