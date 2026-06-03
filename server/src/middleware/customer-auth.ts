import type { NextFunction, Request, Response } from "express";
import { pool } from "../lib/db.js";
import {
  CUSTOMER_SESSION_COOKIE,
  hashSecret,
  readCookie,
} from "../lib/customer-auth.js";

export interface CustomerAuthRequest extends Request {
  customerAccountId?: string;
}

export async function customerAuthMiddleware(
  req: CustomerAuthRequest,
  res: Response,
  next: NextFunction,
) {
  const token = readCookie(req.headers.cookie, CUSTOMER_SESSION_COOKIE);
  if (!token) {
    res.status(401).json({ error: "Не авторизовано" });
    return;
  }

  try {
    const { rows } = await pool.query(
      `SELECT s."id", s."accountId"
       FROM "CustomerSession" s
       JOIN "CustomerAccount" a ON a."id" = s."accountId"
       WHERE s."sessionTokenHash" = $1
         AND s."revokedAt" IS NULL
         AND s."expiresAt" > NOW()
         AND a."isBlocked" = false
       LIMIT 1`,
      [hashSecret(token)],
    );

    const session = rows[0];
    if (!session) {
      res.status(401).json({ error: "Не авторизовано" });
      return;
    }

    req.customerAccountId = session.accountId;
    await pool.query(`UPDATE "CustomerSession" SET "lastSeenAt" = NOW() WHERE "id" = $1`, [session.id]);
    next();
  } catch {
    res.status(401).json({ error: "Не авторизовано" });
  }
}
