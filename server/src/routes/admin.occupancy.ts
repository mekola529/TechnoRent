import { logError } from "../lib/logger.js";
import { Router } from "express";
import { pool } from "../lib/db.js";
import { authMiddleware } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";

export const adminOccupancyRouter = Router();

adminOccupancyRouter.use(authMiddleware);

const periodSchema = z.object({
  from: z.string().refine((s) => !isNaN(Date.parse(s)), "Invalid date"),
  to: z.string().refine((s) => !isNaN(Date.parse(s)), "Invalid date"),
  note: z.string().optional(),
  equipmentId: z.string().min(1),
  orderId: z.string().optional(),
});

/** Helper: fetch period with relations */
async function getPeriodWithRelations(id: string) {
  const { rows } = await pool.query(
    `SELECT bp.*,
       json_build_object('id', e."id", 'name', e."name", 'slug', e."slug") AS equipment,
       CASE WHEN o."id" IS NOT NULL THEN json_build_object('id', o."id", 'customerName', o."customerName", 'status', o."status") ELSE NULL END AS "order",
       CASE WHEN ro."id" IS NOT NULL THEN json_build_object('id', ro."id", 'customerName', ro."customerName", 'customerPhone', ro."customerPhone", 'status', ro."status") ELSE NULL END AS "rentOrder"
     FROM "BookedPeriod" bp
     LEFT JOIN "Equipment" e ON e."id" = bp."equipmentId"
     LEFT JOIN "Order" o ON o."id" = bp."orderId"
     LEFT JOIN "RentOrder" ro ON ro."id" = bp."rentOrderId"
     WHERE bp."id" = $1`,
    [id],
  );
  return rows[0] || null;
}

/** Список усіх періодів зайнятості (з техніка + замовлення) */
adminOccupancyRouter.get("/", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT bp.*,
         json_build_object('id', e."id", 'name', e."name", 'slug', e."slug") AS equipment,
         CASE WHEN o."id" IS NOT NULL THEN json_build_object('id', o."id", 'customerName', o."customerName", 'status', o."status") ELSE NULL END AS "order",
         CASE WHEN ro."id" IS NOT NULL THEN json_build_object('id', ro."id", 'customerName', ro."customerName", 'customerPhone', ro."customerPhone", 'status', ro."status") ELSE NULL END AS "rentOrder"
       FROM "BookedPeriod" bp
       LEFT JOIN "Equipment" e ON e."id" = bp."equipmentId"
       LEFT JOIN "Order" o ON o."id" = bp."orderId"
       LEFT JOIN "RentOrder" ro ON ro."id" = bp."rentOrderId"
       ORDER BY bp."from" ASC`,
    );
    res.json(rows);
  } catch (e) {
    logError("GET /api/admin/occupancy error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Поточні накладки по техніці на основі BookedPeriod */
adminOccupancyRouter.get("/conflicts", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         a."equipmentId",
         e."name" AS "equipmentName",
         a."id" AS "firstPeriodId",
         b."id" AS "secondPeriodId",
         ro_a."orderNumber" AS "firstOrderNumber",
         ro_b."orderNumber" AS "secondOrderNumber",
         ro_a."customerName" AS "firstCustomerName",
         ro_b."customerName" AS "secondCustomerName",
         GREATEST(a."from", b."from") AS "overlapFrom",
         LEAST(a."to", b."to") AS "overlapTo"
       FROM "BookedPeriod" a
       INNER JOIN "BookedPeriod" b
         ON b."equipmentId" = a."equipmentId"
        AND b."id" > a."id"
        AND a."from" < b."to"
        AND a."to" > b."from"
        AND (
          a."rentOrderId" IS DISTINCT FROM b."rentOrderId"
          OR a."rentOrderId" IS NULL
          OR b."rentOrderId" IS NULL
        )
       LEFT JOIN "Equipment" e ON e."id" = a."equipmentId"
       LEFT JOIN "RentOrder" ro_a ON ro_a."id" = a."rentOrderId"
       LEFT JOIN "RentOrder" ro_b ON ro_b."id" = b."rentOrderId"
       WHERE (ro_a."id" IS NULL OR ro_a."status" NOT IN ('COMPLETED', 'CANCELLED'))
         AND (ro_b."id" IS NULL OR ro_b."status" NOT IN ('COMPLETED', 'CANCELLED'))
       ORDER BY "overlapFrom" ASC`,
    );
    res.json(rows);
  } catch (e) {
    logError("GET /api/admin/occupancy/conflicts error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Створити період зайнятості */
adminOccupancyRouter.post("/", validate(periodSchema), async (req, res) => {
  try {
    const { from, to, note, equipmentId, orderId } = req.body;

    const { rows } = await pool.query(
      `INSERT INTO "BookedPeriod" ("from", "to", "note", "equipmentId", "orderId")
       VALUES ($1, $2, $3, $4, $5) RETURNING "id"`,
      [new Date(from), new Date(to), note || null, equipmentId, orderId || null],
    );

    const period = await getPeriodWithRelations(rows[0].id);
    res.status(201).json(period);
  } catch (e) {
    logError("POST /api/admin/occupancy error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Оновити період */
adminOccupancyRouter.put("/:id", validate(periodSchema.partial()), async (req, res) => {
  try {
    const { from, to, note, equipmentId, orderId } = req.body;
    const id = req.params.id as string;

    const setClauses: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (from) { setClauses.push(`"from" = $${idx}`); params.push(new Date(from)); idx++; }
    if (to) { setClauses.push(`"to" = $${idx}`); params.push(new Date(to)); idx++; }
    if (note !== undefined) { setClauses.push(`"note" = $${idx}`); params.push(note || null); idx++; }
    if (equipmentId) { setClauses.push(`"equipmentId" = $${idx}`); params.push(equipmentId); idx++; }
    if (orderId !== undefined) { setClauses.push(`"orderId" = $${idx}`); params.push(orderId || null); idx++; }

    if (setClauses.length > 0) {
      params.push(id);
      await pool.query(
        `UPDATE "BookedPeriod" SET ${setClauses.join(", ")} WHERE "id" = $${idx}`,
        params,
      );
    }

    const period = await getPeriodWithRelations(id);
    res.json(period);
  } catch (e) {
    logError("PUT /api/admin/occupancy/:id error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Видалити період */
adminOccupancyRouter.delete("/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM "BookedPeriod" WHERE "id" = $1`, [req.params.id as string]);
    res.json({ success: true });
  } catch (e) {
    logError("DELETE /api/admin/occupancy/:id error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});
