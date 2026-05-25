import { Router } from "express"
import { authMiddleware } from "../middlewares/auth.middleware"
import {
  buyShopItem,
  equipItem,
  giftPoints,
  getMyInventory,
  getMyWallet,
  getShopItems,
  topUpDemo,
} from "../controllers/economy.controller"

const router = Router()

router.get("/wallet/me", authMiddleware, getMyWallet)
router.post("/wallet/topup-demo", authMiddleware, topUpDemo)
router.post("/wallet/gift", authMiddleware, giftPoints)

router.get("/shop/items", authMiddleware, getShopItems)
router.post("/shop/buy", authMiddleware, buyShopItem)

router.get("/inventory/me", authMiddleware, getMyInventory)
router.patch("/inventory/:inventoryId/equip", authMiddleware, equipItem)

export default router