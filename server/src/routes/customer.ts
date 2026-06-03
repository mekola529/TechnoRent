import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { pool } from "../lib/db.js";
import { logError } from "../lib/logger.js";
import {
  getPublicCustomerAccount,
  linkVerifiedCustomerRequests,
  normalizeEmail,
  normalizePhone,
} from "../lib/customer-auth.js";
import { customerAuthMiddleware, type CustomerAuthRequest } from "../middleware/customer-auth.js";
import { calculateOrderFinance } from "../lib/finance.js";
import { createMonobankInvoice, getMonobankConfig } from "../lib/monobank.js";
import { syncPendingMonobankInvoicesForOrder } from "../lib/monobank-invoices.js";

export const customerRouter = Router();

customerRouter.use(customerAuthMiddleware);

type PublicFinanceSnapshot = NonNullable<Awaited<ReturnType<typeof calculateOrderFinance>>>;
type PublicWorkerContact = {
  fullName: string;
  role: string | null;
  phone: string | null;
};

const profileUpdateSchema = z.object({
  fullName: z.string().trim().max(120).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(5).optional().or(z.literal("")),
}).refine((value) => {
  const email = value.email === undefined ? undefined : normalizeEmail(value.email);
  const phone = value.phone === undefined ? undefined : normalizePhone(value.phone);
  return email !== null || phone !== null || (value.email === undefined && value.phone === undefined);
}, "Вкажіть email або телефон");

function getCalculationStatus(row: Record<string, unknown>, finance?: PublicFinanceSnapshot | null) {
  if (!row.convertedOrderId && !row.rentOrderId) return "Заявка на розгляді";
  if (finance) {
    const hasCalculatedTotal = Number(finance.summary.calculatedTotal) > 0;
    const hasAgreedTotal =
      finance.summary.finalAgreedPrice !== null ||
      finance.summary.agreedTotal !== null ||
      hasCalculatedTotal;
    if (!hasAgreedTotal) return "Розрахунок готується";
    if (finance.summary.paymentStatus === "PAID") return "Оплачено";
    if (finance.summary.paymentStatus === "OVERPAID") return "Переплата";
    if (finance.summary.paymentStatus === "PARTIALLY_PAID") {
      return [
        "Частково оплачено",
        `Вже сплачено: ${Math.round(Math.max(finance.summary.clientPaid, 0)).toLocaleString("uk-UA")} грн`,
        `До сплати: ${Math.round(Math.max(finance.summary.clientDebt, 0)).toLocaleString("uk-UA")} грн`,
      ].join("\n");
    }
    return "Не оплачено";
  }
  if (row.agreedTotal !== null && row.agreedTotal !== undefined) return "Не оплачено";
  if (row.agreedPrice !== null && row.agreedPrice !== undefined) return "Не оплачено";
  return "Розрахунок готується";
}

function getStringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getExecutionAddressFrom(row: Record<string, unknown>) {
  return getStringValue(row.rentOrderAddressFrom) ?? getStringValue(row.addressFrom);
}

function getExecutionAddressTo(row: Record<string, unknown>) {
  return getStringValue(row.rentOrderAddressTo) ?? getStringValue(row.addressTo);
}

function getExecutionScheduledDate(row: Record<string, unknown>) {
  return row.rentOrderScheduledDate ?? row.scheduledDate ?? null;
}

function getExecutionScheduledTime(row: Record<string, unknown>) {
  const timeFrom = getStringValue(row.rentOrderScheduledTimeFrom);
  const timeTo = getStringValue(row.rentOrderScheduledTimeTo);
  if (timeFrom && timeTo) return `${timeFrom} - ${timeTo}`;
  if (timeFrom) return timeFrom;
  if (timeTo) return `до ${timeTo}`;
  return getStringValue(row.scheduledTime);
}

function getPublicOrderStatus(row: Record<string, unknown>, finance?: PublicFinanceSnapshot | null) {
  const status = String(row.rentOrderStatus ?? row.status ?? "NEW");
  const paymentStatus = finance?.summary.paymentStatus ?? row.paymentStatus ?? null;
  const isPaid = paymentStatus === "PAID" || paymentStatus === "OVERPAID";
  const hasAmountToPay = finance
    ? Number(finance.summary.clientDebt) > 0
    : (row.agreedTotal !== null && row.agreedTotal !== undefined) ||
      (row.agreedPrice !== null && row.agreedPrice !== undefined);
  const workCompleted =
    status === "WORKER_COMPLETED" ||
    status === "COMPLETED" ||
    row.rentOrderManagerClosedAt !== null && row.rentOrderManagerClosedAt !== undefined;

  if (status === "CANCELLED") {
    return { code: "CANCELLED", label: "Скасовано" };
  }
  if (workCompleted && hasAmountToPay && !isPaid) {
    return { code: "AWAITING_PAYMENT", label: "Очікує оплати" };
  }
  if (workCompleted) {
    return { code: "COMPLETED", label: "Завершено" };
  }
  if (status === "ACTIVE" || status === "IN_PROGRESS") {
    return { code: "IN_PROGRESS", label: "Виконується" };
  }
  if (status === "CONFIRMED" || row.rentOrderId) {
    return { code: "CONFIRMED", label: "Підтверджено" };
  }
  return { code: "AWAITING_MANAGER_CONFIRMATION", label: "Очікує підтвердження менеджером" };
}

function formatRentOrderNumber(order: { id?: unknown; orderNumber?: unknown } | null | undefined) {
  const orderNumber = order?.orderNumber;
  if (orderNumber !== null && orderNumber !== undefined && String(orderNumber).trim()) {
    return String(orderNumber).replace(/\D/g, "") || "0";
  }

  const fallbackDigits = String(order?.id ?? "").replace(/\D/g, "").slice(0, 8);
  return fallbackDigits || "0";
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function buildCustomerPaymentRedirectUrl(requestId: string) {
  const baseUrl =
    process.env.CLIENT_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    getMonobankConfig().redirectUrl;

  if (!baseUrl) return null;

  try {
    return new URL(`/account/orders/${encodeURIComponent(requestId)}`, trimTrailingSlash(baseUrl)).toString();
  } catch {
    return null;
  }
}

function toPublicRequest(
  row: Record<string, unknown>,
  items: Array<Record<string, unknown>>,
  finance?: PublicFinanceSnapshot | null,
  workerContact?: PublicWorkerContact | null,
) {
  const financeHasPublicTotal = finance
    ? finance.summary.finalAgreedPrice !== null ||
      finance.summary.agreedTotal !== null ||
      (row.agreedPrice !== null && row.agreedPrice !== undefined) ||
      Number(finance.summary.calculatedTotal) > 0
    : false;
  const agreedTotal = finance
    ? financeHasPublicTotal ? Number(finance.summary.orderTotal) : null
    : row.agreedTotal !== null && row.agreedTotal !== undefined ? Number(row.agreedTotal) : null;
  const agreedPrice = row.agreedPrice !== null && row.agreedPrice !== undefined ? Number(row.agreedPrice) : null;
  const paymentStatus = finance?.summary.paymentStatus ?? row.paymentStatus ?? null;
  const clientPaid = finance ? Number(finance.summary.clientPaid) : 0;
  const clientDebt = finance ? Number(finance.summary.clientDebt) : null;
  const calculationStatus = getCalculationStatus(row, finance);
  const publicStatus = getPublicOrderStatus(row, finance);
  const executionAddressFrom = getExecutionAddressFrom(row);
  const executionAddressTo = getExecutionAddressTo(row);
  const executionScheduledDate = getExecutionScheduledDate(row);
  const executionScheduledTime = getExecutionScheduledTime(row);
  return {
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    requestType: row.requestType,
    status: publicStatus.code,
    statusLabel: publicStatus.label,
    rawStatus: row.rentOrderStatus ?? row.status,
    requestStatus: row.status,
    customerName: row.customerName,
    addressFrom: row.addressFrom,
    addressTo: row.addressTo,
    scheduledDate: row.scheduledDate,
    scheduledTime: row.scheduledTime,
    executionAddressFrom,
    executionAddressTo,
    executionScheduledDate,
    executionScheduledTime,
    comment: row.comment,
    items,
    convertedOrder: row.rentOrderId
      ? {
          id: row.rentOrderId,
          orderNumber: row.orderNumber,
          status: row.rentOrderStatus,
          addressFrom: row.rentOrderAddressFrom,
          addressTo: row.rentOrderAddressTo,
          scheduledDate: row.rentOrderScheduledDate,
          scheduledDateTo: row.rentOrderScheduledDateTo,
          scheduledTimeFrom: row.rentOrderScheduledTimeFrom,
          scheduledTimeTo: row.rentOrderScheduledTimeTo,
          agreedTotal,
          agreedPrice,
          paymentStatus,
          calculationStatus,
        }
      : null,
    workerContact: workerContact ?? null,
    finance: {
      agreedTotal,
      agreedPrice,
      paymentStatus,
      calculationStatus,
      clientPaid,
      clientDebt,
    },
  };
}

async function loadCustomerRequests(accountId: string, requestId?: string) {
  const params: unknown[] = [accountId];
  const requestFilter = requestId ? `AND cr."id" = $2` : "";
  if (requestId) params.push(requestId);

  const { rows } = await pool.query(
    `SELECT
       cr.*,
       ro."id" AS "rentOrderId",
       ro."orderNumber",
       ro."status" AS "rentOrderStatus",
       ro."addressFrom" AS "rentOrderAddressFrom",
       ro."addressTo" AS "rentOrderAddressTo",
       ro."scheduledDate" AS "rentOrderScheduledDate",
       ro."scheduledDateTo" AS "rentOrderScheduledDateTo",
       ro."scheduledTimeFrom" AS "rentOrderScheduledTimeFrom",
      ro."scheduledTimeTo" AS "rentOrderScheduledTimeTo",
       ro."managerClosedAt" AS "rentOrderManagerClosedAt",
       ro."agreedPrice",
       ro."agreedTotal",
       ro."paymentStatus"
     FROM "CustomerRequestAccountLink" link
     JOIN "CustomerRequest" cr ON cr."id" = link."customerRequestId"
     LEFT JOIN "RentOrder" ro ON ro."id" = cr."convertedOrderId"
        OR ro."sourceCustomerRequestId" = cr."id"
        OR (ro."sourceRequestId" IS NOT NULL AND ro."sourceRequestId" = cr."legacyOrderId")
     WHERE link."accountId" = $1
       ${requestFilter}
     ORDER BY cr."createdAt" DESC`,
    params,
  );

  const ids = rows.map((row) => row.id);
  const itemsRes = ids.length > 0
    ? await pool.query(
        `SELECT "id", "requestId", "itemType", "refId", "titleSnapshot", "quantity", "unit", "notes"
         FROM "CustomerRequestItem"
         WHERE "requestId" = ANY($1)
         ORDER BY "createdAt" ASC`,
        [ids],
      )
    : { rows: [] };

  const itemsByRequest = new Map<string, Array<Record<string, unknown>>>();
  for (const item of itemsRes.rows) {
    const current = itemsByRequest.get(item.requestId) ?? [];
    current.push({
      id: item.id,
      itemType: item.itemType,
      refId: item.refId,
      titleSnapshot: item.titleSnapshot,
      quantity: item.quantity,
      unit: item.unit,
      notes: item.notes,
    });
    itemsByRequest.set(item.requestId, current);
  }

  const rentOrderIds = Array.from(
    new Set(rows.map((row) => row.rentOrderId).filter((id): id is string => typeof id === "string" && id.length > 0)),
  );
  const financeByOrderId = new Map<string, PublicFinanceSnapshot>();
  const workerContactsByOrderId = new Map<string, PublicWorkerContact>();

  await Promise.all(
    rentOrderIds.map((rentOrderId) =>
      syncPendingMonobankInvoicesForOrder(rentOrderId).catch((syncError) => {
        logError("Sync pending monobank invoices before customer requests response error:", syncError);
      }),
    ),
  );

  await Promise.all(
    rentOrderIds.map(async (rentOrderId) => {
      const finance = await calculateOrderFinance(rentOrderId);
      if (finance) {
        financeByOrderId.set(rentOrderId, finance);
      }
    }),
  );

  if (rentOrderIds.length > 0) {
    const contactsRes = await pool.query(
      `SELECT DISTINCT ON (wa."orderId")
         wa."orderId",
         e."fullName",
         e."role",
         e."phone"
       FROM "WorkAssignment" wa
       INNER JOIN "Employee" e ON e."id" = wa."employeeId"
       INNER JOIN "RentOrder" ro ON ro."id" = wa."orderId"
       WHERE wa."orderId" = ANY($1::text[])
         AND ro."showWorkerToCustomer" = true
         AND wa."status" <> 'DECLINED'
       ORDER BY wa."orderId",
         CASE WHEN wa."status" = 'ACCEPTED' THEN 0 ELSE 1 END,
         wa."assignedAt" DESC,
         wa."createdAt" DESC`,
      [rentOrderIds],
    );

    for (const contact of contactsRes.rows) {
      if (typeof contact.fullName === "string" && contact.fullName.trim()) {
        workerContactsByOrderId.set(contact.orderId, {
          fullName: contact.fullName,
          role: typeof contact.role === "string" && contact.role.trim() ? contact.role : null,
          phone: typeof contact.phone === "string" && contact.phone.trim() ? contact.phone : null,
        });
      }
    }
  }

  return rows.map((row) => {
    const finance = typeof row.rentOrderId === "string" ? financeByOrderId.get(row.rentOrderId) ?? null : null;
    const workerContact = typeof row.rentOrderId === "string"
      ? workerContactsByOrderId.get(row.rentOrderId) ?? null
      : null;
    return toPublicRequest(row, itemsByRequest.get(row.id) ?? [], finance, workerContact);
  });
}

async function linkRequestsForCurrentAccountContacts(accountId: string) {
  const { rows } = await pool.query(
    `SELECT "emailNormalized", "phoneNormalized"
     FROM "CustomerAccount"
     WHERE "id" = $1 AND "isBlocked" = false
     LIMIT 1`,
    [accountId],
  );
  const account = rows[0] as { emailNormalized: string | null; phoneNormalized: string | null } | undefined;
  if (!account) return;

  if (account.emailNormalized) {
    await linkVerifiedCustomerRequests(pool, accountId, "email", account.emailNormalized);
  }
  if (account.phoneNormalized) {
    await linkVerifiedCustomerRequests(pool, accountId, "phone", account.phoneNormalized);
  }
}

customerRouter.get("/profile", async (req: CustomerAuthRequest, res) => {
  try {
    const customer = req.customerAccountId ? await getPublicCustomerAccount(req.customerAccountId) : null;
    if (!customer) {
      res.status(401).json({ error: "Не авторизовано" });
      return;
    }
    res.json(customer);
  } catch (error) {
    logError("GET /api/customer/profile error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

customerRouter.patch("/profile", async (req: CustomerAuthRequest, res) => {
  const client = await pool.connect();
  try {
    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Помилка валідації", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const accountId = req.customerAccountId as string;
    const fullName = parsed.data.fullName === undefined
      ? undefined
      : parsed.data.fullName.trim() || null;
    const email = parsed.data.email === undefined ? undefined : normalizeEmail(parsed.data.email);
    const phone = parsed.data.phone === undefined ? undefined : normalizePhone(parsed.data.phone);

    const currentRes = await client.query(
      `SELECT "id", "emailNormalized", "phoneNormalized"
       FROM "CustomerAccount"
       WHERE "id" = $1 AND "isBlocked" = false
       LIMIT 1`,
      [accountId],
    );
    const current = currentRes.rows[0] as { id: string; emailNormalized: string | null; phoneNormalized: string | null } | undefined;
    if (!current) {
      res.status(404).json({ error: "Акаунт не знайдено" });
      return;
    }

    const nextEmail = email === undefined ? current.emailNormalized : email;
    const nextPhone = phone === undefined ? current.phoneNormalized : phone;
    if (!nextEmail && !nextPhone) {
      res.status(400).json({ error: "В акаунті має бути телефон або email" });
      return;
    }

    await client.query("BEGIN");
    if (nextEmail) {
      const duplicateEmail = await client.query(
        `SELECT "id" FROM "CustomerAccount"
         WHERE "emailNormalized" = $1 AND "id" <> $2
         LIMIT 1`,
        [nextEmail, accountId],
      );
      if (duplicateEmail.rows[0]) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "Цей email вже використовується" });
        return;
      }
    }
    if (nextPhone) {
      const duplicatePhone = await client.query(
        `SELECT "id" FROM "CustomerAccount"
         WHERE "phoneNormalized" = $1 AND "id" <> $2
         LIMIT 1`,
        [nextPhone, accountId],
      );
      if (duplicatePhone.rows[0]) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "Цей телефон вже використовується" });
        return;
      }
    }

    await client.query(
      `UPDATE "CustomerAccount"
       SET "fullName" = COALESCE($2, "fullName"),
           "emailNormalized" = $3,
           "phoneNormalized" = $4,
           "emailVerifiedAt" = CASE
             WHEN $3::text IS NULL THEN NULL
             WHEN $3::text = "emailNormalized" THEN "emailVerifiedAt"
             ELSE NOW()
           END,
           "phoneVerifiedAt" = CASE
             WHEN $4::text IS NULL THEN NULL
             WHEN $4::text = "phoneNormalized" THEN "phoneVerifiedAt"
             ELSE NOW()
           END,
           "updatedAt" = NOW()
       WHERE "id" = $1`,
      [accountId, fullName, nextEmail, nextPhone],
    );

    if (nextEmail) {
      await linkVerifiedCustomerRequests(client, accountId, "email", nextEmail);
    }
    if (nextPhone) {
      await linkVerifiedCustomerRequests(client, accountId, "phone", nextPhone);
    }

    await client.query("COMMIT");
    res.json(await getPublicCustomerAccount(accountId));
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    logError("PATCH /api/customer/profile error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});

customerRouter.get("/requests", async (req: CustomerAuthRequest, res) => {
  try {
    const accountId = req.customerAccountId as string;
    await linkRequestsForCurrentAccountContacts(accountId);
    res.json(await loadCustomerRequests(accountId));
  } catch (error) {
    logError("GET /api/customer/requests error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

customerRouter.get("/requests/:id", async (req: CustomerAuthRequest, res) => {
  try {
    const accountId = req.customerAccountId as string;
    await linkRequestsForCurrentAccountContacts(accountId);
    const requests = await loadCustomerRequests(accountId, req.params.id as string);
    if (!requests[0]) {
      res.status(404).json({ error: "Заявку не знайдено" });
      return;
    }
    res.json(requests[0]);
  } catch (error) {
    logError("GET /api/customer/requests/:id error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

customerRouter.post("/requests/:id/pay/monobank", async (req: CustomerAuthRequest, res) => {
  try {
    const accountId = req.customerAccountId as string;
    const requestId = req.params.id as string;

    const orderRes = await pool.query(
      `SELECT
         cr."id" AS "requestId",
         ro."id",
         ro."orderNumber",
         ro."customerName",
         ro."paymentStatus"
       FROM "CustomerRequestAccountLink" link
       JOIN "CustomerRequest" cr ON cr."id" = link."customerRequestId"
       JOIN "RentOrder" ro ON ro."id" = cr."convertedOrderId"
          OR ro."sourceCustomerRequestId" = cr."id"
          OR (ro."sourceRequestId" IS NOT NULL AND ro."sourceRequestId" = cr."legacyOrderId")
       WHERE link."accountId" = $1
         AND cr."id" = $2
       ORDER BY ro."createdAt" DESC
       LIMIT 1`,
      [accountId, requestId],
    );
    const order = orderRes.rows[0] as
      | { id: string; orderNumber: number | null; customerName: string | null; paymentStatus: string | null }
      | undefined;

    if (!order) {
      res.status(404).json({ error: "Замовлення для оплати не знайдено" });
      return;
    }

    try {
      await syncPendingMonobankInvoicesForOrder(order.id);
    } catch (syncError) {
      logError("Sync pending monobank invoices before customer payment error:", syncError);
    }

    const finance = await calculateOrderFinance(order.id);
    if (!finance) {
      res.status(404).json({ error: "Замовлення не знайдено" });
      return;
    }

    const amountUah = finance.summary.clientDebt;
    const amountKop = Math.round(amountUah * 100);
    if (!Number.isFinite(amountKop) || amountKop <= 0 || finance.summary.paymentStatus === "PAID") {
      res.status(400).json({ error: "Це замовлення вже оплачене або не має суми до оплати" });
      return;
    }

    const orderNumber = formatRentOrderNumber(order);
    const reference = `technorent-customer-${orderNumber}-${randomUUID()}`;
    const destination = `Оплата замовлення TechnoRent №${orderNumber}`;
    const config = getMonobankConfig();
    const redirectUrl = buildCustomerPaymentRedirectUrl(requestId) ?? config.redirectUrl;
    const invoice = await createMonobankInvoice({
      amountKop,
      reference,
      destination,
      redirectUrl,
    });

    const savedRes = await pool.query(
      `INSERT INTO "MonobankInvoice" (
         "rentOrderId",
         "invoiceId",
         "reference",
         "status",
         "amountKop",
         "ccy",
         "pageUrl",
         "destination",
         "webHookUrl",
         "redirectUrl",
         "createdByAdminId",
         "updatedAt"
       )
       VALUES ($1, $2, $3, 'created', $4, 980, $5, $6, $7, $8, NULL, NOW())
       RETURNING
         "id",
         "rentOrderId",
         "invoiceId",
         "reference",
         "status",
         "amountKop",
         "ccy",
         "pageUrl",
         "destination",
         "createdAt",
         "updatedAt"`,
      [
        order.id,
        invoice.invoiceId,
        reference,
        amountKop,
        invoice.pageUrl,
        destination,
        config.webhookUrl,
        redirectUrl,
      ],
    );

    await pool.query(
      `INSERT INTO "OrderEventLog" ("orderId", "eventType", "payload", "createdByAdminId")
       VALUES ($1, 'finance_monobank_customer_invoice_created', $2, NULL)`,
      [
        order.id,
        JSON.stringify({
          invoiceId: invoice.invoiceId,
          reference,
          amountKop,
          customerRequestId: requestId,
          customerAccountId: accountId,
        }),
      ],
    );

    res.status(201).json({
      ...savedRes.rows[0],
      pageUrl: invoice.pageUrl,
    });
  } catch (error) {
    logError("POST /api/customer/requests/:id/pay/monobank error:", error);
    const message = error instanceof Error ? error.message : "";
    if (message.includes("MONOBANK_")) {
      res.status(400).json({ error: "Не налаштовано monobank API на сервері" });
      return;
    }
    res.status(500).json({ error: "Помилка сервера" });
  }
});
