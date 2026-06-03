import { Router } from "express";
import { pool } from "../lib/db.js";
import { logError } from "../lib/logger.js";
import { authMiddleware, requireAdminRole, type AuthRequest } from "../middleware/auth.js";

export const adminCustomersRouter = Router();

adminCustomersRouter.use(authMiddleware);

function normalizeCustomerKey(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeName(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

function customerCte() {
  return `
    WITH request_contacts AS (
      SELECT
        COALESCE(link."accountId", ca_phone."id", ca_email."id") AS "accountId",
        NULLIF(BTRIM(cr."customerName"), '') AS "name",
        NULLIF(BTRIM(cr."phone"), '') AS "phone",
        NULLIF(BTRIM(cr."email"), '') AS "email",
        NULLIF(BTRIM(cr."phoneNormalized"), '') AS "phoneNormalized",
        NULLIF(BTRIM(cr."emailNormalized"), '') AS "emailNormalized",
        cr."createdAt"
      FROM "CustomerRequest" cr
      LEFT JOIN "CustomerRequestAccountLink" link ON link."customerRequestId" = cr."id"
      LEFT JOIN "CustomerAccount" ca_phone
        ON ca_phone."phoneNormalized" IS NOT NULL
       AND ca_phone."phoneNormalized" = cr."phoneNormalized"
      LEFT JOIN "CustomerAccount" ca_email
        ON ca_email."emailNormalized" IS NOT NULL
       AND ca_email."emailNormalized" = cr."emailNormalized"
    ),
    order_contacts AS (
      SELECT
        COALESCE(link."accountId", ca_phone."id", ca_email."id") AS "accountId",
        NULLIF(BTRIM(COALESCE(cr."customerName", ro."customerName")), '') AS "name",
        NULLIF(BTRIM(COALESCE(cr."phone", ro."customerPhone")), '') AS "phone",
        NULLIF(BTRIM(cr."email"), '') AS "email",
        NULLIF(BTRIM(COALESCE(cr."phoneNormalized", regexp_replace(COALESCE(ro."customerPhone", ''), '[^0-9+]', '', 'g'))), '') AS "phoneNormalized",
        NULLIF(BTRIM(cr."emailNormalized"), '') AS "emailNormalized",
        ro."createdAt"
      FROM "RentOrder" ro
      LEFT JOIN LATERAL (
        SELECT cr.*
        FROM "CustomerRequest" cr
        WHERE cr."id" = ro."sourceCustomerRequestId"
           OR cr."convertedOrderId" = ro."id"
           OR (ro."sourceRequestId" IS NOT NULL AND cr."legacyOrderId" = ro."sourceRequestId")
        ORDER BY
          CASE WHEN cr."id" = ro."sourceCustomerRequestId" THEN 0 ELSE 1 END,
          cr."createdAt" DESC
        LIMIT 1
      ) cr ON TRUE
      LEFT JOIN "CustomerRequestAccountLink" link ON link."customerRequestId" = cr."id"
      LEFT JOIN "CustomerAccount" ca_phone
        ON ca_phone."phoneNormalized" IS NOT NULL
       AND ca_phone."phoneNormalized" = COALESCE(cr."phoneNormalized", regexp_replace(COALESCE(ro."customerPhone", ''), '[^0-9+]', '', 'g'))
      LEFT JOIN "CustomerAccount" ca_email
        ON ca_email."emailNormalized" IS NOT NULL
       AND ca_email."emailNormalized" = cr."emailNormalized"
    ),
    account_contacts AS (
      SELECT
        ca."id" AS "accountId",
        NULLIF(BTRIM(ca."fullName"), '') AS "name",
        ca."phoneNormalized" AS "phone",
        ca."emailNormalized" AS "email",
        ca."phoneNormalized",
        ca."emailNormalized",
        ca."createdAt"
      FROM "CustomerAccount" ca
    ),
    raw_customers AS (
      SELECT * FROM request_contacts
      UNION ALL
      SELECT * FROM order_contacts
      UNION ALL
      SELECT * FROM account_contacts
    ),
    visible_raw_customers AS (
      SELECT raw_customers.*
      FROM raw_customers
      WHERE NOT EXISTS (
        SELECT 1
        FROM "DeletedCustomer" deleted
        WHERE raw_customers."createdAt" <= deleted."deletedAt"
          AND (
            (deleted."accountId" IS NOT NULL AND deleted."accountId" = raw_customers."accountId")
            OR (deleted."phoneNormalized" IS NOT NULL AND deleted."phoneNormalized" = raw_customers."phoneNormalized")
            OR (deleted."emailNormalized" IS NOT NULL AND deleted."emailNormalized" = raw_customers."emailNormalized")
            OR (
              deleted."accountId" IS NULL
              AND deleted."phoneNormalized" IS NULL
              AND deleted."emailNormalized" IS NULL
              AND deleted."nameNormalized" IS NOT NULL
              AND deleted."nameNormalized" = lower(raw_customers."name")
            )
          )
      )
    ),
    customers AS (
      SELECT
        COALESCE(
          'account:' || raw_customers."accountId",
          'phone:' || raw_customers."phoneNormalized",
          'email:' || raw_customers."emailNormalized",
          'name:' || lower(raw_customers."name")
        ) AS "id",
        MAX(raw_customers."accountId") AS "accountId",
        COALESCE(
          MAX(ca."fullName") FILTER (WHERE NULLIF(BTRIM(ca."fullName"), '') IS NOT NULL),
          MAX(raw_customers."name") FILTER (WHERE raw_customers."name" IS NOT NULL),
          MAX(raw_customers."phone") FILTER (WHERE raw_customers."phone" IS NOT NULL),
          MAX(raw_customers."email") FILTER (WHERE raw_customers."email" IS NOT NULL),
          'Без імені'
        ) AS "name",
        COALESCE(
          MAX(ca."phoneNormalized") FILTER (WHERE ca."phoneNormalized" IS NOT NULL),
          MAX(raw_customers."phone") FILTER (WHERE raw_customers."phone" IS NOT NULL)
        ) AS "phone",
        COALESCE(
          MAX(ca."phoneNormalized") FILTER (WHERE ca."phoneNormalized" IS NOT NULL),
          MAX(raw_customers."phoneNormalized") FILTER (WHERE raw_customers."phoneNormalized" IS NOT NULL)
        ) AS "phoneNormalized",
        COALESCE(
          MAX(ca."emailNormalized") FILTER (WHERE ca."emailNormalized" IS NOT NULL),
          MAX(raw_customers."email") FILTER (WHERE raw_customers."email" IS NOT NULL)
        ) AS "email",
        COALESCE(
          MAX(ca."emailNormalized") FILTER (WHERE ca."emailNormalized" IS NOT NULL),
          MAX(raw_customers."emailNormalized") FILTER (WHERE raw_customers."emailNormalized" IS NOT NULL)
        ) AS "emailNormalized",
        MAX(ca."createdAt") AS "registeredAt",
        MAX(ca."lastLoginAt") AS "lastLoginAt",
        BOOL_OR(ca."id" IS NOT NULL) AS "isRegistered",
        MIN(raw_customers."createdAt") AS "firstSeenAt",
        MAX(raw_customers."createdAt") AS "lastSeenAt"
      FROM visible_raw_customers raw_customers
      LEFT JOIN "CustomerAccount" ca ON ca."id" = raw_customers."accountId"
      WHERE COALESCE(raw_customers."accountId", raw_customers."phoneNormalized", raw_customers."emailNormalized", raw_customers."name") IS NOT NULL
      GROUP BY COALESCE(
        'account:' || raw_customers."accountId",
        'phone:' || raw_customers."phoneNormalized",
        'email:' || raw_customers."emailNormalized",
        'name:' || lower(raw_customers."name")
      )
    ),
    order_finance AS (
      SELECT
        ro."id",
        ro."orderNumber",
        ro."status",
        ro."paymentStatus",
        ro."customerName",
        ro."customerPhone",
        ro."scheduledDate",
        ro."createdAt",
        ro."sourceCustomerRequestId",
        COALESCE(
          ro."finalAgreedPrice",
          ro."agreedTotal"::double precision,
          ro."agreedPrice",
          price_items."priceTotal",
          0
        ) AS "orderTotal",
        COALESCE(payments."clientPaid", 0) AS "clientPaid",
        GREATEST(
          COALESCE(ro."finalAgreedPrice", ro."agreedTotal"::double precision, ro."agreedPrice", price_items."priceTotal", 0)
          - COALESCE(payments."clientPaid", 0),
          0
        ) AS "clientDebt",
        COALESCE(item_titles."title", cr."metadata"->>'serviceName', cr."requestType", 'Замовлення') AS "serviceTitle",
        COALESCE(
          'account:' || COALESCE(link."accountId", ca_phone."id", ca_email."id"),
          'phone:' || NULLIF(BTRIM(COALESCE(cr."phoneNormalized", regexp_replace(COALESCE(ro."customerPhone", ''), '[^0-9+]', '', 'g'))), ''),
          'email:' || NULLIF(BTRIM(cr."emailNormalized"), ''),
          'name:' || lower(NULLIF(BTRIM(COALESCE(cr."customerName", ro."customerName")), ''))
        ) AS "customerId"
      FROM "RentOrder" ro
      LEFT JOIN LATERAL (
        SELECT cr.*
        FROM "CustomerRequest" cr
        WHERE cr."id" = ro."sourceCustomerRequestId"
           OR cr."convertedOrderId" = ro."id"
           OR (ro."sourceRequestId" IS NOT NULL AND cr."legacyOrderId" = ro."sourceRequestId")
        ORDER BY
          CASE WHEN cr."id" = ro."sourceCustomerRequestId" THEN 0 ELSE 1 END,
          cr."createdAt" DESC
        LIMIT 1
      ) cr ON TRUE
      LEFT JOIN "CustomerRequestAccountLink" link ON link."customerRequestId" = cr."id"
      LEFT JOIN "CustomerAccount" ca_phone
        ON ca_phone."phoneNormalized" IS NOT NULL
       AND ca_phone."phoneNormalized" = COALESCE(cr."phoneNormalized", regexp_replace(COALESCE(ro."customerPhone", ''), '[^0-9+]', '', 'g'))
      LEFT JOIN "CustomerAccount" ca_email
        ON ca_email."emailNormalized" IS NOT NULL
       AND ca_email."emailNormalized" = cr."emailNormalized"
      LEFT JOIN LATERAL (
        SELECT SUM(opi."total")::double precision AS "priceTotal"
        FROM "OrderPriceItem" opi
        WHERE opi."rentOrderId" = ro."id"
      ) price_items ON TRUE
      LEFT JOIN LATERAL (
        SELECT SUM(op."amount")::double precision AS "clientPaid"
        FROM "OrderPayment" op
        WHERE op."rentOrderId" = ro."id"
      ) payments ON TRUE
      LEFT JOIN LATERAL (
        SELECT string_agg(DISTINCT cri."titleSnapshot", ', ') AS "title"
        FROM "CustomerRequestItem" cri
        WHERE cri."requestId" = cr."id"
      ) item_titles ON TRUE
      WHERE NOT EXISTS (
        SELECT 1
        FROM "DeletedCustomer" deleted
        WHERE ro."createdAt" <= deleted."deletedAt"
          AND (
            (deleted."accountId" IS NOT NULL AND deleted."accountId" = COALESCE(link."accountId", ca_phone."id", ca_email."id"))
            OR (
              deleted."phoneNormalized" IS NOT NULL
              AND deleted."phoneNormalized" = NULLIF(BTRIM(COALESCE(cr."phoneNormalized", regexp_replace(COALESCE(ro."customerPhone", ''), '[^0-9+]', '', 'g'))), '')
            )
            OR (deleted."emailNormalized" IS NOT NULL AND deleted."emailNormalized" = NULLIF(BTRIM(cr."emailNormalized"), ''))
            OR (
              deleted."accountId" IS NULL
              AND deleted."phoneNormalized" IS NULL
              AND deleted."emailNormalized" IS NULL
              AND deleted."nameNormalized" IS NOT NULL
              AND deleted."nameNormalized" = lower(NULLIF(BTRIM(COALESCE(cr."customerName", ro."customerName")), ''))
            )
          )
      )
    )
  `;
}

function mapPaymentStatus(status: string | null | undefined) {
  if (status === "paid") return "Оплачено";
  if (status === "partial") return "Частково оплачено";
  if (status === "debt") return "Є борг";
  if (status === "overpaid") return "Переплата";
  return "Немає замовлень";
}

adminCustomersRouter.get("/", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      ${customerCte()}
      SELECT
        c.*,
        COALESCE(COUNT(ofi."id"), 0)::int AS "ordersCount",
        COALESCE(COUNT(ofi."id") FILTER (WHERE ofi."status" NOT IN ('COMPLETED', 'WORKER_COMPLETED', 'CANCELLED')), 0)::int AS "activeOrdersCount",
        COALESCE(COUNT(ofi."id") FILTER (WHERE ofi."status" IN ('COMPLETED', 'WORKER_COMPLETED')), 0)::int AS "completedOrdersCount",
        COALESCE(SUM(ofi."orderTotal"), 0)::double precision AS "orderTotal",
        COALESCE(SUM(ofi."clientPaid"), 0)::double precision AS "clientPaid",
        COALESCE(SUM(ofi."clientDebt"), 0)::double precision AS "clientDebt",
        CASE
          WHEN COUNT(ofi."id") = 0 THEN 'none'
          WHEN COALESCE(SUM(ofi."clientDebt"), 0) > 0 AND COALESCE(SUM(ofi."clientPaid"), 0) > 0 THEN 'partial'
          WHEN COALESCE(SUM(ofi."clientDebt"), 0) > 0 THEN 'debt'
          WHEN BOOL_OR(ofi."paymentStatus" = 'OVERPAID') THEN 'overpaid'
          ELSE 'paid'
        END AS "paymentState"
      FROM customers c
      LEFT JOIN order_finance ofi ON ofi."customerId" = c."id"
      GROUP BY c."id", c."accountId", c."name", c."phone", c."phoneNormalized", c."email", c."emailNormalized", c."registeredAt", c."lastLoginAt", c."isRegistered", c."firstSeenAt", c."lastSeenAt"
      ORDER BY c."lastSeenAt" DESC NULLS LAST, c."name" ASC
    `);

    res.json(rows.map((row) => ({
      ...row,
      paymentStateLabel: mapPaymentStatus(row.paymentState),
    })));
  } catch (error) {
    logError("GET /api/admin/customers error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

adminCustomersRouter.get("/:id", async (req, res) => {
  try {
    const customerId = normalizeCustomerKey(req.params.id);
    if (!customerId) {
      res.status(400).json({ error: "Клієнта не вказано" });
      return;
    }

    const { rows } = await pool.query(`
      ${customerCte()}
      SELECT
        c.*,
        COALESCE(COUNT(ofi."id"), 0)::int AS "ordersCount",
        COALESCE(COUNT(ofi."id") FILTER (WHERE ofi."status" NOT IN ('COMPLETED', 'WORKER_COMPLETED', 'CANCELLED')), 0)::int AS "activeOrdersCount",
        COALESCE(COUNT(ofi."id") FILTER (WHERE ofi."status" IN ('COMPLETED', 'WORKER_COMPLETED')), 0)::int AS "completedOrdersCount",
        COALESCE(SUM(ofi."orderTotal"), 0)::double precision AS "orderTotal",
        COALESCE(SUM(ofi."clientPaid"), 0)::double precision AS "clientPaid",
        COALESCE(SUM(ofi."clientDebt"), 0)::double precision AS "clientDebt",
        CASE
          WHEN COUNT(ofi."id") = 0 THEN 'none'
          WHEN COALESCE(SUM(ofi."clientDebt"), 0) > 0 AND COALESCE(SUM(ofi."clientPaid"), 0) > 0 THEN 'partial'
          WHEN COALESCE(SUM(ofi."clientDebt"), 0) > 0 THEN 'debt'
          WHEN BOOL_OR(ofi."paymentStatus" = 'OVERPAID') THEN 'overpaid'
          ELSE 'paid'
        END AS "paymentState"
      FROM customers c
      LEFT JOIN order_finance ofi ON ofi."customerId" = c."id"
      WHERE c."id" = $1
      GROUP BY c."id", c."accountId", c."name", c."phone", c."phoneNormalized", c."email", c."emailNormalized", c."registeredAt", c."lastLoginAt", c."isRegistered", c."firstSeenAt", c."lastSeenAt"
      LIMIT 1
    `, [customerId]);

    const customer = rows[0];
    if (!customer) {
      res.status(404).json({ error: "Клієнта не знайдено" });
      return;
    }

    const ordersRes = await pool.query(`
      ${customerCte()}
      SELECT
        ofi."id",
        ofi."orderNumber",
        ofi."status",
        ofi."paymentStatus",
        ofi."serviceTitle",
        ofi."orderTotal",
        ofi."clientPaid",
        ofi."clientDebt",
        ofi."scheduledDate",
        ofi."createdAt"
      FROM order_finance ofi
      WHERE ofi."customerId" = $1
      ORDER BY ofi."createdAt" DESC
    `, [customerId]);

    res.json({
      customer: {
        ...customer,
        paymentStateLabel: mapPaymentStatus(customer.paymentState),
      },
      orders: ordersRes.rows,
    });
  } catch (error) {
    logError("GET /api/admin/customers/:id error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

adminCustomersRouter.delete("/:id", requireAdminRole, async (req: AuthRequest, res) => {
  const customerId = normalizeCustomerKey(req.params.id);
  if (!customerId) {
    res.status(400).json({ error: "Клієнта не вказано" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(`
      ${customerCte()}
      SELECT
        "id",
        "accountId",
        "name",
        "phoneNormalized",
        "emailNormalized"
      FROM customers
      WHERE "id" = $1
      LIMIT 1
    `, [customerId]);

    const customer = rows[0] as
      | {
          id: string;
          accountId: string | null;
          name: string | null;
          phoneNormalized: string | null;
          emailNormalized: string | null;
        }
      | undefined;

    if (!customer) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Клієнта не знайдено" });
      return;
    }

    const nameNormalized =
      !customer.accountId && !customer.phoneNormalized && !customer.emailNormalized
        ? normalizeName(customer.name)
        : null;

    await client.query(
      `INSERT INTO "DeletedCustomer" (
         "customerId",
         "accountId",
         "phoneNormalized",
         "emailNormalized",
         "nameNormalized",
         "deletedByAdminId",
         "deletedAt"
       )
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT ("customerId") DO UPDATE
       SET "accountId" = EXCLUDED."accountId",
           "phoneNormalized" = EXCLUDED."phoneNormalized",
           "emailNormalized" = EXCLUDED."emailNormalized",
           "nameNormalized" = EXCLUDED."nameNormalized",
           "deletedByAdminId" = EXCLUDED."deletedByAdminId",
           "deletedAt" = EXCLUDED."deletedAt"`,
      [
        customer.id,
        customer.accountId,
        customer.phoneNormalized,
        customer.emailNormalized,
        nameNormalized,
        req.adminId ?? null,
      ],
    );

    if (customer.accountId) {
      await client.query(`DELETE FROM "CustomerAccount" WHERE "id" = $1`, [customer.accountId]);
    }

    await client.query("COMMIT");
    res.json({ status: "ok" });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    logError("DELETE /api/admin/customers/:id error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});
