import { pool } from "./db.js";
import { recalculateOrderFinanceState } from "./finance.js";
import { getMonobankInvoiceStatus, type MonobankInvoiceStatusPayload } from "./monobank.js";

type DbClient = Pick<typeof pool, "query">;

type ProcessResult = {
  handled: boolean;
  stale?: boolean;
  rentOrderId?: string;
  status?: string;
  orderPaymentId?: string | null;
};

function parseMonoDate(value: unknown): Date | null {
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 1_000_000_000_000 ? value : value * 1000;
    const parsed = new Date(millis);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function toIntegerOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return null;
  return Math.trunc(numberValue);
}

function amountKopToUah(amountKop: number) {
  return Math.round(amountKop) / 100;
}

export async function processMonobankInvoiceUpdate(
  db: DbClient,
  payload: MonobankInvoiceStatusPayload,
  source: "webhook" | "manual_sync",
): Promise<ProcessResult> {
  const invoiceId = String(payload.invoiceId ?? "").trim();
  if (!invoiceId) {
    throw new Error("Monobank webhook payload has no invoiceId");
  }

  const invoiceRes = await db.query(
    `SELECT *
     FROM "MonobankInvoice"
     WHERE "invoiceId" = $1
     FOR UPDATE`,
    [invoiceId],
  );
  const invoice = invoiceRes.rows[0] as
    | {
        id: string;
        rentOrderId: string;
        status: string;
        amountKop: number;
        orderPaymentId: string | null;
        monoModifiedDate: Date | string | null;
      }
    | undefined;

  if (!invoice) {
    return { handled: false };
  }

  const status = String(payload.status ?? invoice.status ?? "unknown");
  const createdDate = parseMonoDate(payload.createdDate);
  const modifiedDate = parseMonoDate(payload.modifiedDate) ?? new Date();
  const currentModifiedDate = parseMonoDate(invoice.monoModifiedDate);
  const finalAmountKop = toIntegerOrNull(payload.finalAmount);
  const webhookAmountKop = toIntegerOrNull(payload.amount);

  if (currentModifiedDate && modifiedDate < currentModifiedDate) {
    return {
      handled: true,
      stale: true,
      rentOrderId: invoice.rentOrderId,
      status: invoice.status,
      orderPaymentId: invoice.orderPaymentId,
    };
  }

  let orderPaymentId = invoice.orderPaymentId;
  let paidAt: Date | null = null;

  if (status === "success" && !orderPaymentId) {
    const paidAmountKop = finalAmountKop ?? webhookAmountKop ?? invoice.amountKop;
    if (!Number.isFinite(paidAmountKop) || paidAmountKop <= 0) {
      throw new Error(`Monobank invoice ${invoiceId} has invalid paid amount`);
    }
    paidAt = modifiedDate;

    const paymentRes = await db.query(
      `INSERT INTO "OrderPayment" (
         "rentOrderId",
         "amount",
         "method",
         "receivedByType",
         "paidAt",
         "comment",
         "updatedAt"
       )
       VALUES ($1, $2, 'invoice', 'company', $3, $4, NOW())
       RETURNING "id"`,
      [
        invoice.rentOrderId,
        amountKopToUah(paidAmountKop),
        paidAt,
        `Оплата через monobank, рахунок ${invoiceId}`,
      ],
    );
    orderPaymentId = String(paymentRes.rows[0].id);

    await recalculateOrderFinanceState(invoice.rentOrderId, db);
  }

  await db.query(
    `UPDATE "MonobankInvoice"
     SET "status" = $2,
         "finalAmountKop" = COALESCE($3, "finalAmountKop"),
         "failureReason" = $4,
         "monoCreatedDate" = COALESCE($5, "monoCreatedDate"),
         "monoModifiedDate" = $6,
         "payloadJson" = $7::jsonb,
         "orderPaymentId" = COALESCE($8, "orderPaymentId"),
         "paidAt" = COALESCE($9, "paidAt"),
         "updatedAt" = NOW()
     WHERE "id" = $1`,
    [
      invoice.id,
      status,
      finalAmountKop,
      payload.failureReason ?? null,
      createdDate,
      modifiedDate,
      JSON.stringify(payload),
      orderPaymentId,
      paidAt,
    ],
  );

  await db.query(
    `INSERT INTO "OrderEventLog" ("orderId", "eventType", "payload", "createdByAdminId")
     VALUES ($1, $2, $3, NULL)`,
    [
      invoice.rentOrderId,
      status === "success" ? "finance_monobank_payment_received" : "finance_monobank_invoice_updated",
      JSON.stringify({
        source,
        invoiceId,
        status,
        orderPaymentId,
        finalAmountKop,
      }),
    ],
  );

  return {
    handled: true,
    rentOrderId: invoice.rentOrderId,
    status,
    orderPaymentId,
  };
}

export async function syncPendingMonobankInvoicesForOrder(
  rentOrderId: string,
  options: { limit?: number } = {},
) {
  const limit = Math.max(1, Math.min(options.limit ?? 5, 20));
  const pendingRes = await pool.query(
    `SELECT "invoiceId"
     FROM "MonobankInvoice"
     WHERE "rentOrderId" = $1
       AND "orderPaymentId" IS NULL
       AND "status" IN ('created', 'processing', 'hold')
     ORDER BY "createdAt" DESC
     LIMIT $2`,
    [rentOrderId, limit],
  );

  const results: ProcessResult[] = [];
  for (const row of pendingRes.rows) {
    const invoiceId = String(row.invoiceId);
    const payload = await getMonobankInvoiceStatus(invoiceId);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await processMonobankInvoiceUpdate(client, payload, "manual_sync");
      await client.query("COMMIT");
      results.push(result);
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback error
      }
      throw error;
    } finally {
      client.release();
    }
  }

  return results;
}
