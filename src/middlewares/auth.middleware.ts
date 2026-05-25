import { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"

declare global {
  namespace Express {
    interface Request {
      user?: any
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization

  if (!authHeader) {
    return res.status(401).json({
      message: "Token tidak ditemukan",
    })
  }

  const token = authHeader.split(" ")[1]

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string)
    req.user = decoded
    next()
  } catch {
    return res.status(401).json({
      message: "Token tidak valid",
    })
  }
}