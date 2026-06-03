import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { pool } from "../lib/db.js";
import { logError } from "../lib/logger.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { syncCustomerRequestStatus } from "../lib/customer-requests.js";
import {
  buildAttributionViewFromInput,
  buildAttributionViewFromRow,
} from "../lib/marketing-attribution.repository.js";

export const adminRequestsRouter = Router();

adminRequestsRouter.use(authMiddleware);

const requestStatusSchema = z.object({
  status: z.string().trim().min(1),
});

type AttributionRow = Record<string, unknown> & {
  customerRequestId?: string | null;
  legacyOrderId?: string | null;
  legacyServiceRequestId?: string | null;
};

function getRequestAttributionKey(request: {
  id: string;
  legacyOrderId?: string | null;
  legacyServiceRequestId?: string | null;
}) {
  return [
    request.id,
    request.legacyOrderId ?? "",
    request.legacyServiceRequestId ?? "",
  ].join("|");
}

function getAttributionKeyFromRow(row: AttributionRow) {
  return [
    typeof row.customerRequestId === "string" ? row.customerRequestId : "",
    typeof row.legacyOrderId === "string" ? row.legacyOrderId : "",
    typeof row.legacyServiceRequestId === "string" ? row.legacyServiceRequestId : "",
  ].join("|");
}

async function loadAttributionMap(requests: Array<{
  id: string;
  legacyOrderId?: string | null;
  legacyServiceRequestId?: string | null;
  metadata?: Record<string, unknown> | null;
}>) {
  const requestIds = requests.map((row) => row.id);
  const legacyOrderIds = requests
    .map((row) => row.legacyOrderId)
    .filter((value): value is string => Boolean(value));
  const legacyServiceRequestIds = requests
    .map((row) => row.legacyServiceRequestId)
    .filter((value): value is string => Boolean(value));

  const rows =
    requestIds.length > 0 || legacyOrderIds.length > 0 || legacyServiceRequestIds.length > 0
      ? (
          await pool.query(
            `SELECT
               cra.*,
               mtl."name" AS "trackingLinkName"
             FROM "CustomerRequestAttribution" cra
             LEFT JOIN "MarketingTrackingLink" mtl ON mtl."id" = cra."trackingLinkId"
             WHERE ("customerRequestId" IS NOT NULL AND "customerRequestId" = ANY($1))
                OR ("legacyOrderId" IS NOT NULL AND "legacyOrderId" = ANY($2))
                OR ("legacyServiceRequestId" IS NOT NULL AND "legacyServiceRequestId" = ANY($3))
             ORDER BY cra."createdAt" DESC`,
            [
              requestIds.length > 0 ? requestIds : [""],
              legacyOrderIds.length > 0 ? legacyOrderIds : [""],
              legacyServiceRequestIds.length > 0 ? legacyServiceRequestIds : [""],
            ],
          )
        ).rows as AttributionRow[]
      : [];

  const map = new Map<string, ReturnType<typeof buildAttributionViewFromRow>>();
  for (const row of rows) {
    const key = getAttributionKeyFromRow(row);
    if (!key || map.has(key)) continue;
    map.set(key, buildAttributionViewFromRow(row));
  }

  for (const request of requests) {
    const key = getRequestAttributionKey(request);
    if (map.has(key)) continue;

    const metadataAttribution =
      request.metadata &&
      typeof request.metadata === "object" &&
      "attribution" in request.metadata
        ? request.metadata.attribution
        : null;

    map.set(key, buildAttributionViewFromInput(metadataAttribution as Record<string, unknown> | null));
  }

  return map;
}

async function getRequestWithRelations(id: string) {
  const { rows } = await pool.query(
    `SELECT cr.*
     FROM "CustomerRequest" cr
     WHERE cr."id" = $1
     LIMIT 1`,
    [id],
  );

  const request = rows[0];
  if (!request) {
    return null;
  }

  const [itemsRes, convertedRes] = await Promise.all([
    pool.query(
      `SELECT
         "id",
         "itemType",
         "refId",
         "titleSnapshot",
         "quantity",
         "unit",
         "notes"
       FROM "CustomerRequestItem"
       WHERE "requestId" = $1
       ORDER BY "createdAt" ASC`,
      [id],
    ),
    pool.query(
      `SELECT "id", "sourceCustomerRequestId", "sourceRequestId"
       FROM "RentOrder"
       WHERE "sourceCustomerRequestId" = $1
          OR ("sourceRequestId" IS NOT NULL AND "sourceRequestId" = $2)
       ORDER BY "createdAt" DESC`,
      [id, request.legacyOrderId ?? null],
    ),
  ]);

  const attributionMap = await loadAttributionMap([request]);
  const requestAttribution = attributionMap.get(getRequestAttributionKey(request)) ?? null;

  return {
    ...request,
    items: itemsRes.rows,
    attribution: requestAttribution,
    convertedOrderId: request.convertedOrderId ?? convertedRes.rows[0]?.id ?? null,
    convertedOrders: convertedRes.rows.map((row) => ({ id: row.id })),
  };
}

adminRequestsRouter.get("/", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const trafficSource = typeof req.query.trafficSource === "string" ? req.query.trafficSource : undefined;
    const campaign = typeof req.query.campaign === "string" ? req.query.campaign.trim() : "";
    const params: unknown[] = [];
    const filters: string[] = [];

    if (status && status !== "all") {
      params.push(status);
      filters.push(`cr."status" = $${params.length}`);
    }

    if (trafficSource && trafficSource !== "all") {
      params.push(trafficSource);
      filters.push(`
        EXISTS (
          SELECT 1
          FROM "CustomerRequestAttribution" cra
          WHERE cra."customerRequestId" = cr."id"
            AND cra."trafficSource" = $${params.length}
        )
      `);
    }

    if (campaign) {
      params.push(`%${campaign}%`);
      filters.push(`
        EXISTS (
          SELECT 1
          FROM "CustomerRequestAttribution" cra
          WHERE cra."customerRequestId" = cr."id"
            AND (
              cra."lastUtmCampaign" ILIKE $${params.length}
              OR cra."firstUtmCampaign" ILIKE $${params.length}
            )
        )
      `);
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT cr.*
       FROM "CustomerRequest" cr
       ${where}
       ORDER BY cr."createdAt" DESC`,
      params,
    );

    const ids = rows.map((row) => row.id);
    const legacyOrderIds = rows
      .map((row) => row.legacyOrderId)
      .filter((value): value is string => Boolean(value));

    const [itemsRes, convertedRes, attributionMap] = await Promise.all([
      ids.length > 0
        ? pool.query(
            `SELECT
               "id",
               "requestId",
               "itemType",
               "refId",
               "titleSnapshot",
               "quantity",
               "unit",
               "notes"
             FROM "CustomerRequestItem"
             WHERE "requestId" = ANY($1)
             ORDER BY "createdAt" ASC`,
            [ids],
          )
        : Promise.resolve({ rows: [] }),
      ids.length > 0 || legacyOrderIds.length > 0
        ? pool.query(
            `SELECT "id", "sourceCustomerRequestId", "sourceRequestId"
             FROM "RentOrder"
             WHERE ("sourceCustomerRequestId" IS NOT NULL AND "sourceCustomerRequestId" = ANY($1))
                OR ("sourceRequestId" IS NOT NULL AND "sourceRequestId" = ANY($2))
             ORDER BY "createdAt" DESC`,
            [ids.length > 0 ? ids : [""], legacyOrderIds.length > 0 ? legacyOrderIds : [""]],
          )
        : Promise.resolve({ rows: [] }),
      loadAttributionMap(
        rows.map((row) => ({
          id: row.id as string,
          legacyOrderId: (row.legacyOrderId as string | null | undefined) ?? null,
          legacyServiceRequestId: (row.legacyServiceRequestId as string | null | undefined) ?? null,
          metadata: (row.metadata as Record<string, unknown> | null | undefined) ?? null,
        })),
      ),
    ]);

    const itemsMap = new Map<string, Array<Record<string, unknown>>>();
    for (const item of itemsRes.rows) {
      const current = itemsMap.get(item.requestId) ?? [];
      current.push({
        id: item.id,
        itemType: item.itemType,
        refId: item.refId,
        titleSnapshot: item.titleSnapshot,
        quantity: item.quantity,
        unit: item.unit,
        notes: item.notes,
      });
      itemsMap.set(item.requestId, current);
    }

    const convertedMap = new Map<string, Array<{ id: string }>>();
    for (const row of convertedRes.rows) {
      const key = row.sourceCustomerRequestId
        ? row.sourceCustomerRequestId
        : rows.find((request) => request.legacyOrderId === row.sourceRequestId)?.id;
      if (!key) continue;
      const current = convertedMap.get(key) ?? [];
      current.push({ id: row.id });
      convertedMap.set(key, current);
    }

    res.json(
      rows.map((row) => {
        const convertedOrders = convertedMap.get(row.id) ?? [];
        return {
          ...row,
          items: itemsMap.get(row.id) ?? [],
          attribution: attributionMap.get(getRequestAttributionKey({
            id: row.id as string,
            legacyOrderId: (row.legacyOrderId as string | null | undefined) ?? null,
            legacyServiceRequestId: (row.legacyServiceRequestId as string | null | undefined) ?? null,
          })) ?? null,
          convertedOrderId: row.convertedOrderId ?? convertedOrders[0]?.id ?? null,
          convertedOrders,
        };
      }),
    );
  } catch (error) {
    logError("GET /api/admin/requests error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

adminRequestsRouter.get("/:id", async (req, res) => {
  try {
    const request = await getRequestWithRelations(req.params.id as string);
    if (!request) {
      res.status(404).json({ error: "Заявку не знайдено" });
      return;
    }
    res.json(request);
  } catch (error) {
    logError("GET /api/admin/requests/:id error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

adminRequestsRouter.patch("/:id/status", validate(requestStatusSchema), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await syncCustomerRequestStatus(
      client,
      req.params.id as string,
      req.body.status as string,
    );

    if (!updated) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Заявку не знайдено" });
      return;
    }

    await client.query("COMMIT");

    const request = await getRequestWithRelations(req.params.id as string);
    res.json(request);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    logError("PATCH /api/admin/requests/:id/status error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});

adminRequestsRouter.delete("/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT
         "id",
         "legacyOrderId",
         "legacyServiceRequestId",
         "convertedOrderId",
         (
           SELECT COUNT(*)::int
           FROM "RentOrder" ro
           WHERE ro."sourceCustomerRequestId" = "CustomerRequest"."id"
              OR (ro."sourceRequestId" IS NOT NULL AND ro."sourceRequestId" = "CustomerRequest"."legacyOrderId")
         ) AS "linkedOrdersCount"
       FROM "CustomerRequest"
       WHERE "id" = $1
       LIMIT 1`,
      [req.params.id as string],
    );

    const request = rows[0];
    if (!request) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Заявку не знайдено" });
      return;
    }

    if (request.convertedOrderId || Number(request.linkedOrdersCount) > 0) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Спочатку видаліть або відв’яжіть пов’язане замовлення" });
      return;
    }

    if (request.legacyOrderId) {
      await client.query(`DELETE FROM "Order" WHERE "id" = $1`, [request.legacyOrderId]);
    }

    if (request.legacyServiceRequestId) {
      await client.query(`DELETE FROM "ServiceRequest" WHERE "id" = $1`, [request.legacyServiceRequestId]);
    }

    await client.query(`DELETE FROM "CustomerRequest" WHERE "id" = $1`, [request.id]);
    await client.query("COMMIT");

    res.json({ success: true });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    logError("DELETE /api/admin/requests/:id error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});
