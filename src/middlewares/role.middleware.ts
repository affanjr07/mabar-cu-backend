import { Request, Response, NextFunction } from "express"

export function roleMiddleware(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        message: "Unauthorized",
      })
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Akses ditolak. Role tidak sesuai.",
      })
    }

    next()
  }
}