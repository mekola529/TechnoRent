import { createHash, randomBytes, randomInt } from "crypto";
import type { PoolClient } from "pg";
import { pool } from "./db.js";

export const CUSTOMER_SESSION_COOKIE = "customer_session";
export const CUSTOMER_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

export type VerificationChannel = "email" | "telegram" | "viber";

export function normalizeEmail(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized || null;
}

export function normalizePhone(value: string | null | undefined) {
  const raw = value?.trim() ?? "";
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("380") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `+38${digits}`;
  if (digits.length === 9) return `+380${digits}`;
  return raw.startsWith("+") ? `+${digits}` : digits;
}

export function isStrongCustomerPassword(password: string) {
  return password.length >= 8 && /[A-Za-zА-Яа-яІіЇїЄєҐґ]/.test(password) && /\d/.test(password);
}

export function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function generateOtpCode() {
  return String(randomInt(100000, 1000000));
}

export function generateSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function buildCustomerSessionCookie(token: string, expires: Date) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return [
    `${CUSTOMER_SESSION_COOKIE}=${token}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    secure.replace(/^; /, ""),
    `Expires=${expires.toUTCString()}`,
    `Max-Age=${Math.floor(CUSTOMER_SESSION_TTL_MS / 1000)}`,
  ].filter(Boolean).join("; ");
}

export function buildClearCustomerSessionCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${CUSTOMER_SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax${secure}; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0`;
}

export function readCookie(header: string | undefined, name: string) {
  if (!header) return null;
  const pairs = header.split(";").map((part) => part.trim());
  for (const pair of pairs) {
    const index = pair.indexOf("=");
    if (index === -1) continue;
    if (pair.slice(0, index) === name) return decodeURIComponent(pair.slice(index + 1));
  }
  return null;
}

export async function createCustomerSession(
  db: Pick<PoolClient, "query">,
  accountId: string,
  meta: { userAgent?: string; ip?: string },
) {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + CUSTOMER_SESSION_TTL_MS);
  await db.query(
    `INSERT INTO "CustomerSession" (
       "accountId", "sessionTokenHash", "expiresAt", "lastSeenAt", "userAgentHash", "ipHash"
     )
     VALUES ($1, $2, $3, NOW(), $4, $5)`,
    [
      accountId,
      hashSecret(token),
      expiresAt,
      meta.userAgent ? hashSecret(meta.userAgent) : null,
      meta.ip ? hashSecret(meta.ip) : null,
    ],
  );
  return { token, expiresAt };
}

export async function linkVerifiedCustomerRequests(
  db: Pick<PoolClient, "query">,
  accountId: string,
  matchedBy: "email" | "phone",
  verifiedContact: string,
) {
  const column = matchedBy === "email" ? `"emailNormalized"` : `"phoneNormalized"`;
  const { rowCount } = await db.query(
    `INSERT INTO "CustomerRequestAccountLink" (
       "accountId", "customerRequestId", "matchedBy", "verifiedContact"
     )
     SELECT $1, cr."id", $2, $3
     FROM "CustomerRequest" cr
     WHERE cr.${column} = $3
       AND NOT EXISTS (
         SELECT 1
         FROM "CustomerRequestAccountLink" existing
         WHERE existing."customerRequestId" = cr."id"
       )
     ON CONFLICT ("customerRequestId") DO NOTHING`,
    [accountId, matchedBy, verifiedContact],
  );
  return rowCount ?? 0;
}

export async function getCustomerAccountFromSessionCookie(
  db: Pick<PoolClient, "query">,
  cookieHeader: string | undefined,
) {
  const token = readCookie(cookieHeader, CUSTOMER_SESSION_COOKIE);
  if (!token) return null;

  const { rows } = await db.query(
    `SELECT
       s."id" AS "sessionId",
       a."id",
       a."emailNormalized",
       a."phoneNormalized"
     FROM "CustomerSession" s
     JOIN "CustomerAccount" a ON a."id" = s."accountId"
     WHERE s."sessionTokenHash" = $1
       AND s."revokedAt" IS NULL
       AND s."expiresAt" > NOW()
       AND a."isBlocked" = false
     LIMIT 1`,
    [hashSecret(token)],
  );

  const account = rows[0] as
    | {
        sessionId: string;
        id: string;
        emailNormalized: string | null;
        phoneNormalized: string | null;
      }
    | undefined;

  if (!account) return null;

  await db.query(`UPDATE "CustomerSession" SET "lastSeenAt" = NOW() WHERE "id" = $1`, [account.sessionId]);
  return {
    id: account.id,
    emailNormalized: account.emailNormalized,
    phoneNormalized: account.phoneNormalized,
  };
}

export async function linkCustomerRequestToAccountFromSession(
  db: Pick<PoolClient, "query">,
  input: {
    customerRequestId: string;
    cookieHeader: string | undefined;
  },
) {
  const account = await getCustomerAccountFromSessionCookie(db, input.cookieHeader);
  if (!account) return false;

  const matchedBy = account.phoneNormalized ? "phone" : "email";
  const verifiedContact = account.phoneNormalized ?? account.emailNormalized;
  if (!verifiedContact) return false;

  await db.query(
    `INSERT INTO "CustomerRequestAccountLink" (
       "accountId", "customerRequestId", "matchedBy", "verifiedContact"
     )
     VALUES ($1, $2, $3, $4)
     ON CONFLICT ("customerRequestId") DO NOTHING`,
    [account.id, input.customerRequestId, matchedBy, verifiedContact],
  );

  return true;
}

export async function getPublicCustomerAccount(accountId: string) {
  const { rows } = await pool.query(
    `SELECT
       "id",
       "fullName",
       "emailNormalized" AS "email",
       "phoneNormalized" AS "phone",
       "emailVerifiedAt",
       "phoneVerifiedAt",
       "createdAt",
       "lastLoginAt"
     FROM "CustomerAccount"
     WHERE "id" = $1 AND "isBlocked" = false
     LIMIT 1`,
    [accountId],
  );
  return rows[0] ?? null;
}

export async function sendVerificationCode(input: {
  channel: VerificationChannel;
  target: string;
  code: string;
}) {
  if (input.channel === "email") {
    if (process.env.NODE_ENV !== "production" && !process.env.SMTP_HOST) {
      return { delivered: false, debugCode: input.code };
    }
    if (!process.env.SMTP_HOST) {
      throw new Error("Email OTP не налаштовано");
    }
    // SMTP/provider integration is intentionally isolated here. Production must
    // wire this adapter to the approved mail provider before enabling email OTP.
    throw new Error("Email OTP provider не підключено");
  }

  if (input.channel === "telegram" && !process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error("Telegram OTP не налаштовано");
  }

  if (input.channel === "viber" && !process.env.VIBER_BOT_TOKEN) {
    throw new Error("Viber OTP не налаштовано");
  }

  throw new Error("OTP provider не підключено");
}
