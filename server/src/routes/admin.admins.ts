import { Router } from "express";
import { hash } from "bcryptjs";
import { z } from "zod";
import { pool } from "../lib/db.js";
import { logError } from "../lib/logger.js";
import { authMiddleware, requireAdminRole, type AuthRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

export const adminAdminsRouter = Router();

adminAdminsRouter.use(authMiddleware);

const adminRoleSchema = z.enum(["ADMIN", "MANAGER"]);

const createAdminSchema = z.object({
  email: z.string().trim().min(3, "Логін має містити мінімум 3 символи").max(120),
  password: z.string().min(8, "Пароль має містити мінімум 8 символів").max(200),
  role: adminRoleSchema.default("MANAGER"),
  telegramChatId: z.string().trim().optional(),
  telegramUserId: z.string().trim().optional(),
  telegramUsername: z.string().trim().optional(),
});

const updateAdminSchema = z.object({
  email: z.string().trim().min(3, "Логін має містити мінімум 3 символи").max(120),
  password: z.string().min(8, "Пароль має містити мінімум 8 символів").max(200).optional().or(z.literal("")),
  role: adminRoleSchema,
  telegramChatId: z.string().trim().optional(),
  telegramUserId: z.string().trim().optional(),
  telegramUsername: z.string().trim().optional(),
});

function emptyToNull(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

adminAdminsRouter.get("/", requireAdminRole, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         "id",
         "email",
         "role",
         "telegramChatId",
         "telegramUserId",
         "telegramUsername",
         "createdAt"
       FROM "Admin"
       ORDER BY "createdAt" DESC`,
    );

    res.json({ admins: rows });
  } catch (error) {
    logError("GET /api/admin/admins error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

adminAdminsRouter.post("/", requireAdminRole, validate(createAdminSchema), async (req, res) => {
  try {
    const email = String(req.body.email).trim();
    const role = req.body.role as "ADMIN" | "MANAGER";
    const passwordHash = await hash(req.body.password, 12);

    const { rows } = await pool.query(
      `INSERT INTO "Admin" (
         "email",
         "passwordHash",
         "role",
         "telegramChatId",
         "telegramUserId",
         "telegramUsername"
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING "id", "email", "role", "telegramChatId", "telegramUserId", "telegramUsername", "createdAt"`,
      [
        email,
        passwordHash,
        role,
        emptyToNull(req.body.telegramChatId),
        emptyToNull(req.body.telegramUserId),
        emptyToNull(req.body.telegramUsername),
      ],
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";

    if (code === "23505") {
      res.status(409).json({ error: "Адмін з таким логіном або Telegram ID вже існує" });
      return;
    }

    logError("POST /api/admin/admins error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

adminAdminsRouter.put("/:id", requireAdminRole, validate(updateAdminSchema), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const currentRes = await client.query(
      `SELECT "id", "role" FROM "Admin" WHERE "id" = $1 LIMIT 1`,
      [req.params.id],
    );
    const current = currentRes.rows[0] as { id: string; role: "ADMIN" | "MANAGER" } | undefined;
    if (!current) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Адміна не знайдено" });
      return;
    }

    if (current.role === "ADMIN" && req.body.role !== "ADMIN") {
      const adminsRes = await client.query(`SELECT COUNT(*)::int AS count FROM "Admin" WHERE "role" = 'ADMIN'`);
      if (Number(adminsRes.rows[0]?.count ?? 0) <= 1) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Не можна забрати роль ADMIN в останнього адміністратора" });
        return;
      }
    }

    const password = typeof req.body.password === "string" ? req.body.password : "";
    const passwordHash = password.trim() ? await hash(password, 12) : null;

    const { rows } = await client.query(
      `UPDATE "Admin"
       SET "email" = $1,
           "role" = $2,
           "telegramChatId" = $3,
           "telegramUserId" = $4,
           "telegramUsername" = $5,
           "passwordHash" = COALESCE($6, "passwordHash")
       WHERE "id" = $7
       RETURNING "id", "email", "role", "telegramChatId", "telegramUserId", "telegramUsername", "createdAt"`,
      [
        String(req.body.email).trim(),
        req.body.role,
        emptyToNull(req.body.telegramChatId),
        emptyToNull(req.body.telegramUserId),
        emptyToNull(req.body.telegramUsername),
        passwordHash,
        req.params.id,
      ],
    );

    await client.query("COMMIT");
    res.json(rows[0]);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }

    const code = typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";

    if (code === "23505") {
      res.status(409).json({ error: "Адмін з таким логіном або Telegram ID вже існує" });
      return;
    }

    logError("PUT /api/admin/admins/:id error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});

adminAdminsRouter.delete("/:id", requireAdminRole, async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    if (req.adminId === req.params.id) {
      res.status(400).json({ error: "Не можна видалити власний акаунт" });
      return;
    }

    await client.query("BEGIN");

    const currentRes = await client.query(
      `SELECT "id", "role" FROM "Admin" WHERE "id" = $1 LIMIT 1`,
      [req.params.id],
    );
    const current = currentRes.rows[0] as { id: string; role: "ADMIN" | "MANAGER" } | undefined;
    if (!current) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Адміна не знайдено" });
      return;
    }

    if (current.role === "ADMIN") {
      const adminsRes = await client.query(`SELECT COUNT(*)::int AS count FROM "Admin" WHERE "role" = 'ADMIN'`);
      if (Number(adminsRes.rows[0]?.count ?? 0) <= 1) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Не можна видалити останнього ADMIN" });
        return;
      }
    }

    await client.query(`DELETE FROM "Admin" WHERE "id" = $1`, [req.params.id]);
    await client.query("COMMIT");
    res.json({ status: "ok" });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    logError("DELETE /api/admin/admins/:id error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});
