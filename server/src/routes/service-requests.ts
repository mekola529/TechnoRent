import { logError } from "../lib/logger.js";
import { Router } from "express";
import { pool } from "../lib/db.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { sendServiceRequestTelegram } from "../lib/telegram.js";
import { ensureCustomerRequestForServiceRequest } from "../lib/customer-requests.js";
import { createCustomerRequestAttribution } from "../lib/marketing-attribution.repository.js";
import { linkCustomerRequestToAccountFromSession } from "../lib/customer-auth.js";

export const serviceRequestsRouter = Router();

const attributionTouchSchema = z.object({
  utmSource: z.string().max(120).nullable().optional(),
  utmMedium: z.string().max(120).nullable().optional(),
  utmCampaign: z.string().max(160).nullable().optional(),
  utmContent: z.string().max(160).nullable().optional(),
  utmTerm: z.string().max(160).nullable().optional(),
  gclid: z.string().max(255).nullable().optional(),
  fbclid: z.string().max(255).nullable().optional(),
  ttclid: z.string().max(255).nullable().optional(),
  trackingCode: z.string().max(80).nullable().optional(),
  referrer: z.string().max(1000).nullable().optional(),
  landingPage: z.string().max(1000).nullable().optional(),
  capturedAt: z.string().max(80).nullable().optional(),
});

const attributionSchema = z.object({
  firstTouch: attributionTouchSchema.nullable().optional(),
  lastTouch: attributionTouchSchema.nullable().optional(),
  formPage: z.string().max(1000).nullable().optional(),
});

const createSchema = z.object({
  serviceType: z.string().min(1),
  customerName: z.string().min(1, "Ім'я обов'язкове"),
  phone: z.string().min(5, "Телефон обов'язковий"),
  address: z.string().min(1, "Адреса обов'язкова"),
  date: z.string().refine((s) => !isNaN(Date.parse(s)), "Невірна дата"),
  time: z.string().min(1, "Час обов'язковий"),
  comment: z.string().optional().or(z.literal("")),
  attribution: attributionSchema.optional(),
});

/** Створити заявку на послугу (публічний маршрут) */
serviceRequestsRouter.post("/", validate(createSchema), async (req, res) => {
  const client = await pool.connect();
  try {
    const { serviceType, customerName, phone, address, date, time, comment, attribution } = req.body;

    await client.query("BEGIN");

    const { rows } = await client.query(
      `INSERT INTO "ServiceRequest" ("serviceType", "customerName", "phone", "address", "date", "time", "comment", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *`,
      [serviceType, customerName, phone, address, new Date(date), time, comment || null],
    );
    const request = rows[0];

    const serviceRes = await client.query(
      `SELECT "title" FROM "Service" WHERE "slug" = $1 LIMIT 1`,
      [serviceType],
    );

    let customerRequestId: string | null = null;
    await client.query("SAVEPOINT customer_request_sync");
    try {
      customerRequestId = await ensureCustomerRequestForServiceRequest(client, {
        legacyServiceRequestId: request.id,
        customerName: request.customerName,
        phone: request.phone,
        addressFrom: request.address,
        comment: request.comment,
        serviceType: request.serviceType,
        serviceTitle: serviceRes.rows[0]?.title ?? null,
        scheduledDate: request.date,
        scheduledTime: request.time,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
        status: request.status,
        attribution: attribution ?? undefined,
      });
      await linkCustomerRequestToAccountFromSession(client, {
        customerRequestId,
        cookieHeader: req.headers.cookie,
      });
      await client.query("RELEASE SAVEPOINT customer_request_sync");
    } catch (syncError) {
      await client.query("ROLLBACK TO SAVEPOINT customer_request_sync");
      logError("Customer request sync during /api/service-requests failed:", syncError);
      customerRequestId = null;
    }

    await client.query("COMMIT");

    res.status(201).json(request);

    if (attribution && customerRequestId) {
      void createCustomerRequestAttribution({
        customerRequestId,
        legacyServiceRequestId: request.id,
        attribution,
      }).catch((error) => {
        logError("createCustomerRequestAttribution(/api/service-requests) error:", error);
      });
    }

    // Telegram notification (non-blocking)
    sendServiceRequestTelegram(request);
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    logError("POST /api/service-requests error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});
