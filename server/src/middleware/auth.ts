import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const _jwtSecret = process.env.JWT_SECRET;
if (!_jwtSecret) {
  throw new Error("JWT_SECRET environment variable is required");
}
const JWT_SECRET: string = _jwtSecret;

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
