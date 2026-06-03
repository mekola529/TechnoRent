import { Router } from "express";
import rateLimit from "express-rate-limit";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import type { PoolClient } from "pg";
import { pool } from "../lib/db.js";
import { validate } from "../middleware/validate.js";
import { logError } from "../lib/logger.js";
import {
  buildClearCustomerSessionCookie,
  buildCustomerSessionCookie,
  createCustomerSession,
  generateOtpCode,
  getPublicCustomerAccount,
  hashSecret,
  isStrongCustomerPassword,
  linkVerifiedCustomerRequests,
  normalizeEmail,
  normalizePhone,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MS,
  readCookie,
  sendVerificationCode,
  CUSTOMER_SESSION_COOKIE,
  type VerificationChannel,
} from "../lib/customer-auth.js";
import { customerAuthMiddleware, type CustomerAuthRequest } from "../middleware/customer-auth.js";

export const customerAuthRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Забагато спроб. Спробуйте пізніше." },
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Забагато запитів коду. Спробуйте пізніше." },
});

const registerSchema = z.object({
  fullName: z.string().trim().max(120).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(5).optional().or(z.literal("")),
  password: z.string().refine(isStrongCustomerPassword, "Пароль має містити мінімум 8 символів, літери й цифри"),
  channel: z.enum(["email", "telegram", "viber"]).optional(),
});

const verifySchema = z.object({
  channel: z.enum(["email", "telegram", "viber"]),
  target: z.string().min(3),
  code: z.string().regex(/^\d{6}$/, "Вкажіть 6-значний код"),
});

const loginSchema = z.object({
  login: z.string().min(3),
  password: z.string().min(1),
});

function getRequestIp(req: CustomerAuthRequest) {
  return req.ip || req.socket.remoteAddress || "";
}

function resolveRegisterContact(input: z.infer<typeof registerSchema>) {
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  const channel: VerificationChannel = input.channel ?? (email ? "email" : "telegram");
  const target = channel === "email" ? email : phone;
  const matchedBy = channel === "email" ? "email" : "phone";
  return { email, phone, channel, target, matchedBy } as const;
}

async function createVerification(
  db: Pick<PoolClient, "query">,
  accountId: string,
  channel: VerificationChannel,
  target: string,
) {
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  await db.query(
    `INSERT INTO "CustomerContactVerification" (
       "accountId", "channel", "targetNormalized", "codeHash", "expiresAt"
     )
     VALUES ($1, $2, $3, $4, $5)`,
    [accountId, channel, target, hashSecret(code), expiresAt],
  );
  const delivery = await sendVerificationCode({ channel, target, code });
  return delivery;
}

customerAuthRouter.post("/register", otpLimiter, validate(registerSchema), async (req, res) => {
  const client = await pool.connect();
  try {
    const { email, phone, channel, target, matchedBy } = resolveRegisterContact(req.body);
    const fullNameInput = typeof req.body.fullName === "string" && req.body.fullName.trim()
      ? req.body.fullName.trim()
      : null;
    if (!target) {
      res.status(400).json({ error: "Вкажіть email або телефон" });
      return;
    }

    const existing = await client.query(
      `SELECT "id" FROM "CustomerAccount"
       WHERE ($1::text IS NOT NULL AND "emailNormalized" = $1)
          OR ($2::text IS NOT NULL AND "phoneNormalized" = $2)
       LIMIT 1`,
      [email, phone],
    );

    if (existing.rows[0]) {
      res.status(202).json({ ok: true, message: "Якщо акаунт існує, використайте вхід або відновлення доступу." });
      return;
    }

    await client.query("BEGIN");
    const passwordHash = await hash(req.body.password, 12);
    const { rows } = await client.query(
      `INSERT INTO "CustomerAccount" (
         "fullName",
         "emailNormalized",
         "phoneNormalized",
         "passwordHash",
         "emailVerifiedAt",
         "phoneVerifiedAt",
         "updatedAt"
       )
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING "id"`,
      [
        fullNameInput,
        email,
        phone,
        passwordHash,
        email ? new Date() : null,
        phone ? new Date() : null,
      ],
    );
    const accountId = rows[0].id as string;
    const linkedCount = await linkVerifiedCustomerRequests(client, accountId, matchedBy, target);
    if (!fullNameInput) {
      await client.query(
        `UPDATE "CustomerAccount" account
         SET "fullName" = source."customerName",
             "updatedAt" = NOW()
         FROM (
           SELECT NULLIF(BTRIM(cr."customerName"), '') AS "customerName"
           FROM "CustomerRequestAccountLink" link
           JOIN "CustomerRequest" cr ON cr."id" = link."customerRequestId"
           WHERE link."accountId" = $1
             AND NULLIF(BTRIM(cr."customerName"), '') IS NOT NULL
           ORDER BY cr."createdAt" DESC
           LIMIT 1
         ) source
         WHERE account."id" = $1
           AND source."customerName" IS NOT NULL`,
        [accountId],
      );
    }
    const session = await createCustomerSession(client, accountId, {
      userAgent: req.headers["user-agent"],
      ip: getRequestIp(req),
    });
    await client.query(`UPDATE "CustomerAccount" SET "lastLoginAt" = NOW() WHERE "id" = $1`, [accountId]);
    await client.query("COMMIT");
    res.setHeader("Set-Cookie", buildCustomerSessionCookie(session.token, session.expiresAt));
    res.status(201).json({
      ok: true,
      channel,
      target,
      linkedCount,
      customer: await getPublicCustomerAccount(accountId),
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    logError("POST /api/customer-auth/register error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Помилка сервера" });
  } finally {
    client.release();
  }
});

customerAuthRouter.post("/verify", otpLimiter, validate(verifySchema), async (req, res) => {
  const client = await pool.connect();
  try {
    const channel = req.body.channel as VerificationChannel;
    const target = channel === "email" ? normalizeEmail(req.body.target) : normalizePhone(req.body.target);
    if (!target) {
      res.status(400).json({ error: "Некоректний контакт" });
      return;
    }

    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT *
       FROM "CustomerContactVerification"
       WHERE "channel" = $1
         AND "targetNormalized" = $2
         AND "consumedAt" IS NULL
       ORDER BY "createdAt" DESC
       LIMIT 1
       FOR UPDATE`,
      [channel, target],
    );
    const verification = rows[0];
    if (!verification) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Код недійсний або застарів" });
      return;
    }

    if (new Date(verification.expiresAt).getTime() < Date.now()) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Код недійсний або застарів" });
      return;
    }

    if (Number(verification.attemptCount) >= OTP_MAX_ATTEMPTS) {
      await client.query("ROLLBACK");
      res.status(429).json({ error: "Забагато спроб. Запросіть новий код." });
      return;
    }

    if (verification.codeHash !== hashSecret(req.body.code)) {
      await client.query(
        `UPDATE "CustomerContactVerification" SET "attemptCount" = "attemptCount" + 1 WHERE "id" = $1`,
        [verification.id],
      );
      await client.query("COMMIT");
      res.status(400).json({ error: "Код недійсний або застарів" });
      return;
    }

    const matchedBy = channel === "email" ? "email" : "phone";
    await client.query(
      `UPDATE "CustomerContactVerification" SET "consumedAt" = NOW() WHERE "id" = $1`,
      [verification.id],
    );
    await client.query(
      `UPDATE "CustomerAccount"
       SET "${matchedBy === "email" ? "emailVerifiedAt" : "phoneVerifiedAt"}" = NOW(),
           "updatedAt" = NOW()
       WHERE "id" = $1`,
      [verification.accountId],
    );
    const linkedCount = await linkVerifiedCustomerRequests(client, verification.accountId, matchedBy, target);
    await client.query("COMMIT");
    res.json({ ok: true, linkedCount });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    logError("POST /api/customer-auth/verify error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});

customerAuthRouter.post("/login", authLimiter, validate(loginSchema), async (req: CustomerAuthRequest, res) => {
  try {
    const email = normalizeEmail(req.body.login);
    const phone = normalizePhone(req.body.login);
    const { rows } = await pool.query(
      `SELECT *
       FROM "CustomerAccount"
       WHERE (($1::text IS NOT NULL AND "emailNormalized" = $1)
          OR ($2::text IS NOT NULL AND "phoneNormalized" = $2))
         AND "isBlocked" = false
       LIMIT 1`,
      [email, phone],
    );
    const account = rows[0];
    const valid = account ? await compare(req.body.password, account.passwordHash) : false;
    if (!valid) {
      res.status(401).json({ error: "Невірний логін або пароль" });
      return;
    }

    const session = await createCustomerSession(pool, account.id, {
      userAgent: req.headers["user-agent"],
      ip: getRequestIp(req),
    });
    await pool.query(`UPDATE "CustomerAccount" SET "lastLoginAt" = NOW() WHERE "id" = $1`, [account.id]);
    res.setHeader("Set-Cookie", buildCustomerSessionCookie(session.token, session.expiresAt));
    res.json({ ok: true, customer: await getPublicCustomerAccount(account.id) });
  } catch (error) {
    logError("POST /api/customer-auth/login error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

customerAuthRouter.post("/logout", async (req, res) => {
  const token = readCookie(req.headers.cookie, CUSTOMER_SESSION_COOKIE);
  if (token) {
    await pool.query(
      `UPDATE "CustomerSession" SET "revokedAt" = NOW() WHERE "sessionTokenHash" = $1`,
      [hashSecret(token)],
    ).catch((error) => logError("POST /api/customer-auth/logout revoke error:", error));
  }
  res.setHeader("Set-Cookie", buildClearCustomerSessionCookie());
  res.json({ ok: true });
});

customerAuthRouter.get("/me", customerAuthMiddleware, async (req: CustomerAuthRequest, res) => {
  const customer = req.customerAccountId ? await getPublicCustomerAccount(req.customerAccountId) : null;
  if (!customer) {
    res.status(401).json({ error: "Не авторизовано" });
    return;
  }
  res.json(customer);
});
