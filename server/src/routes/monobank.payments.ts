import { Router } from "express";
import { pool } from "../lib/db.js";
import { logError } from "../lib/logger.js";
import { getMonobankConfig, verifyMonobankSignature, type MonobankInvoiceStatusPayload } from "../lib/monobank.js";
import { processMonobankInvoiceUpdate } from "../lib/monobank-invoices.js";

export const monobankPaymentsRouter = Router();

monobankPaymentsRouter.post(["/webhook", "/webhook/:secret"], async (req, res) => {
  const rawBody = (req as typeof req & { rawBody?: Buffer }).rawBody;
  const config = getMonobankConfig();

  try {
    if (config.webhookSecret && req.params.secret !== config.webhookSecret) {
      res.status(404).json({ ok: false });
      return;
    }

    if (!rawBody) {
      res.status(400).json({ ok: false });
      return;
    }

    const signature = req.header("X-Sign") ?? undefined;
    let signatureOk = false;
    try {
      signatureOk = await verifyMonobankSignature(rawBody, signature);
    } catch (error) {
      logError("Monobank webhook signature verification error:", error);
      signatureOk = false;
    }
    if (!signatureOk) {
      res.status(401).json({ ok: false });
      return;
    }

    const payload = req.body as MonobankInvoiceStatusPayload;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await processMonobankInvoiceUpdate(client, payload, "webhook");
      await client.query("COMMIT");
      res.json({ ok: true, ...result });
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
  } catch (error) {
    logError("POST /api/payments/monobank/webhook error:", error);
    res.status(500).json({ ok: false });
  }
});
