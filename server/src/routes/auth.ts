import { logError } from "../lib/logger.js";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { compare } from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { validate } from "../middleware/validate.js";

export const authRouter = Router();

const _jwtSecret = process.env.JWT_SECRET;
if (!_jwtSecret) {
  throw new Error("JWT_SECRET environment variable is required");
}
const JWT_SECRET: string = _jwtSecret;

const loginSchema = z.object({
  email: z.string().min(1, "Логін обов'язковий"),
  password: z.string().min(1, "Пароль обов'язковий"),
});

/** Авторизація адміна */
authRouter.post("/login", validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await prisma.admin.findUnique({ where: { email } });
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
      JWT_SECRET,
      { expiresIn: "24h" }
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
authRouter.get("/me", async (req, res) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Не авторизовано" });
      return;
    }

    const payload = jwt.verify(header.slice(7), JWT_SECRET) as {
      id: string;
      role: string;
    };

    const admin = await prisma.admin.findUnique({
      where: { id: payload.id },
      select: { id: true, email: true, role: true },
    });

    if (!admin) {
      res.status(401).json({ error: "Адміна не знайдено" });
      return;
    }

    res.json(admin);
  } catch {
    res.status(401).json({ error: "Невалідний токен" });
  }
});
