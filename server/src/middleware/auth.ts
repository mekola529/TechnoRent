import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

function getJwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET environment variable is required");
  return s;
}

export interface AuthRequest extends Request {
  adminId?: string;
  adminRole?: string;
}

const allowedAdminRoles = new Set(["ADMIN", "MANAGER"]);
const adminOnlyRoles = new Set(["ADMIN"]);

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
    const payload = jwt.verify(token, getJwtSecret(), {
      algorithms: ["HS256"],
    }) as JwtPayload;

    if (
      typeof payload.id !== "string" ||
      typeof payload.role !== "string" ||
      !allowedAdminRoles.has(payload.role)
    ) {
      throw new Error("Invalid token payload");
    }

    req.adminId = payload.id;
    req.adminRole = payload.role;
    next();
  } catch {
    res.status(401).json({ error: "Невалідний токен" });
  }
}

export function requireAdminRole(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!req.adminRole || !adminOnlyRoles.has(req.adminRole)) {
    res.status(403).json({ error: "Недостатньо прав" });
    return;
  }

  next();
}
