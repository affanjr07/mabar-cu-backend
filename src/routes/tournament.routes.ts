import { Router } from "express"
import { authMiddleware } from "../middlewares/auth.middleware"
import { roleMiddleware } from "../middlewares/role.middleware"
import {
  createTournament,
  deleteTournament,
  getTournamentDetail,
  getTournamentParticipants,
  getTournaments,
  registerTournament,
  unregisterTournament,
  updateTournament,
} from "../controllers/tournament.controller"

const router = Router()

router.get("/", getTournaments)
router.get("/:tournamentId", getTournamentDetail)

router.post(
  "/",
  authMiddleware,
  roleMiddleware(["admin"]),
  createTournament
)

router.put(
  "/:tournamentId",
  authMiddleware,
  roleMiddleware(["admin"]),
  updateTournament
)

router.delete(
  "/:tournamentId",
  authMiddleware,
  roleMiddleware(["admin"]),
  deleteTournament
)

router.post(
  "/:tournamentId/register",
  authMiddleware,
  registerTournament
)

router.delete(
  "/:tournamentId/register",
  authMiddleware,
  unregisterTournament
)

router.get(
  "/:tournamentId/participants",
  authMiddleware,
  roleMiddleware(["admin"]),
  getTournamentParticipants
)

export default router