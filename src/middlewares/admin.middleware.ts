import { Request, Response, NextFunction } from "express"

export function adminMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return res.status(401).json({
      message: "Unauthorized",
    })
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({
      message: "Akses admin diperlukan",
    })
  }

  next()
}