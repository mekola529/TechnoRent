import { logError } from "../lib/logger.js";
import { Router } from "express";
import { pool } from "../lib/db.js";
import { compare } from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { authMiddleware, type AuthRequest } from "../middleware/auth.js";
import rateLimit from "express-rate-limit";

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: { error: "Забагато спроб. Спробуйте пізніше." },
  standardHeaders: true,
  legacyHeaders: false,
});

function getJwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET environment variable is required");
  return s;
}

const loginSchema = z.object({
  email: z.string().min(1, "Логін обов'язковий"),
  password: z.string().min(1, "Пароль обов'язковий"),
});

/** Авторизація адміна */
authRouter.post("/login", loginLimiter, validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    const { rows } = await pool.query(
      `SELECT "id", "email", "passwordHash", "role" FROM "Admin" WHERE "email" = $1`,
      [email],
    );
    const admin = rows[0];
    if (!admin) {
      res.status(401).json({ error: "Невірний логін або пароль" });
      return;
    }

    const valid = await compare(password, admin.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Невірний логін або пароль" });
      return;
    }

    const token = jwt.sign(
      { id: admin.id, role: admin.role },
      getJwtSecret(),
      { expiresIn: "24h", algorithm: "HS256" },
    );

    res.json({
      token,
      admin: { id: admin.id, email: admin.email, role: admin.role },
    });
  } catch (e) {
    logError("POST /api/auth/login error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Перевірка поточного токена */
authRouter.get("/me", authMiddleware, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.adminId) {
      res.status(401).json({ error: "Не авторизовано" });
      return;
    }

    const { rows } = await pool.query(
      `SELECT "id", "email", "role" FROM "Admin" WHERE "id" = $1`,
      [authReq.adminId],
    );
    const admin = rows[0];

    if (!admin) {
      res.status(401).json({ error: "Адміна не знайдено" });
      return;
    }

    res.json(admin);
  } catch {
    res.status(401).json({ error: "Невалідний токен" });
  }
});
