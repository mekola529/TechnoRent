import { logError } from "../lib/logger.js";
import { Router } from "express";
import { pool } from "../lib/db.js";
import { sendTelegramNotification } from "../lib/telegram.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { ensureCustomerRequestForEquipmentOrder } from "../lib/customer-requests.js";
import { createCustomerRequestAttribution } from "../lib/marketing-attribution.repository.js";
import { linkCustomerRequestToAccountFromSession } from "../lib/customer-auth.js";

export const ordersRouter = Router();

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

const createOrderSchema = z.object({
  customerName: z.string().min(1, "Ім'я обов'язкове"),
  phone: z.string().min(5, "Мобільний обов'язковий"),
  email: z.string().email().optional().or(z.literal("")),
  dateFrom: z.string().optional().or(z.literal("")),
  dateTo: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  addressTo: z.string().optional().or(z.literal("")),
  comment: z.string().optional().or(z.literal("")),
  equipmentId: z.string().min(1).optional().or(z.literal("")),
  requestType: z.enum(["equipment_rental", "service", "tow", "callback"]).optional(),
  serviceName: z.string().optional().or(z.literal("")),
  metadata: z.record(z.string(), z.unknown()).optional(),
  attribution: attributionSchema.optional(),
});

/** Створити замовлення (публічний маршрут) */
ordersRouter.post("/", validate(createOrderSchema), async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      customerName,
      phone,
      email,
      dateFrom,
      dateTo,
      address,
      addressTo,
      comment,
      equipmentId,
      requestType,
      serviceName,
      metadata,
      attribution,
    } =
      req.body;

    // Перевірити чи техніка існує (якщо вказана)
    if (equipmentId) {
      const { rows } = await client.query(`SELECT "id" FROM "Equipment" WHERE "id" = $1`, [equipmentId]);
      if (rows.length === 0) {
        res.status(404).json({ error: "Техніку не знайдено" });
        return;
      }
    }

    await client.query("BEGIN");

    const { rows } = await client.query(
      `INSERT INTO "Order" ("customerName", "phone", "email", "dateFrom", "dateTo", "address", "comment", "equipmentId", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *`,
      [customerName, phone, email || null, dateFrom ? new Date(dateFrom) : null, dateTo ? new Date(dateTo) : null, address || null, comment || null, equipmentId || null],
    );
    const order = rows[0];

    // Attach equipment info
    let equipment: { name: string; slug: string } | null = null;
    if (order.equipmentId) {
      const eqRes = await client.query(
        `SELECT "name", "slug" FROM "Equipment" WHERE "id" = $1`,
        [order.equipmentId],
      );
      if (eqRes.rows.length > 0) equipment = eqRes.rows[0];
    }

    let customerRequestId: string | null = null;
    await client.query("SAVEPOINT customer_request_sync");
    try {
      customerRequestId = await ensureCustomerRequestForEquipmentOrder(client, {
        legacyOrderId: order.id,
        customerName: order.customerName,
        phone: order.phone,
        email: order.email,
        addressFrom: order.address,
        addressTo: addressTo || null,
        comment: order.comment,
        equipmentId: order.equipmentId,
        equipmentName: equipment?.name ?? null,
        dateFrom: order.dateFrom,
        dateTo: order.dateTo,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        status: order.status,
        requestType: requestType || undefined,
        serviceName: serviceName || undefined,
        metadata: metadata ?? undefined,
        attribution: attribution ?? undefined,
      });
      await linkCustomerRequestToAccountFromSession(client, {
        customerRequestId,
        cookieHeader: req.headers.cookie,
      });
      await client.query("RELEASE SAVEPOINT customer_request_sync");
    } catch (syncError) {
      await client.query("ROLLBACK TO SAVEPOINT customer_request_sync");
      logError("Customer request sync during /api/orders failed:", syncError);
      customerRequestId = null;
    }

    await client.query("COMMIT");

    const result = { ...order, equipment };
    res.status(201).json(result);

    if (attribution && customerRequestId) {
      void createCustomerRequestAttribution({
        customerRequestId,
        legacyOrderId: order.id,
        attribution,
      }).catch((error) => {
        logError("createCustomerRequestAttribution(/api/orders) error:", error);
      });
    }

    // Відправити сповіщення в Telegram (не блокує відповідь)
    sendTelegramNotification({
      ...order,
      equipment,
      requestMeta: {
        requestType: requestType || null,
        serviceName: serviceName || null,
        addressTo: addressTo || null,
        metadata: metadata ?? null,
      },
    });
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    logError("POST /api/orders error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});
