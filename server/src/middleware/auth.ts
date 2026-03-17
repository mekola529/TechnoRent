import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret";

export interface AuthRequest extends Request {
  adminId?: string;
  adminRole?: string;
}

export function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Не авторизовано" });
    return;
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as {
      id: string;
      role: string;
    };
    req.adminId = payload.id;
    req.adminRole = payload.role;
    next();
  } catch {
    res.status(401).json({ error: "Невалідний токен" });
  }
}
