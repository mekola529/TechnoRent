import { logError } from "../lib/logger.js";
import { Router } from "express";
import { pool } from "../lib/db.js";
import { authMiddleware } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";

export const adminOrdersRouter = Router();

// Всі маршрути захищені
adminOrdersRouter.use(authMiddleware);

/** Helper: build order object with relations */
async function getOrdersWithRelations(where: string, params: any[]) {
  const { rows: orders } = await pool.query(
    `SELECT * FROM "Order" ${where} ORDER BY "createdAt" DESC`,
    params,
  );
  if (orders.length === 0) return [];

  const ids = orders.map((o: any) => o.id);

  const [eqRes, bpRes, roRes] = await Promise.all([
    pool.query(`SELECT "id", "name", "slug" FROM "Equipment" WHERE "id" = ANY($1)`,
      [orders.map((o: any) => o.equipmentId).filter(Boolean)]),
    pool.query(
      `SELECT bp.*, e."name" AS "equipmentName"
       FROM "BookedPeriod" bp
       LEFT JOIN "Equipment" e ON e."id" = bp."equipmentId"
       WHERE bp."orderId" = ANY($1)
       ORDER BY bp."from" ASC`,
      [ids]),
    pool.query(`SELECT "id", "sourceRequestId" FROM "RentOrder" WHERE "sourceRequestId" = ANY($1)`, [ids]),
  ]);

  const eqMap = new Map(eqRes.rows.map((e: any) => [e.id, { name: e.name, slug: e.slug }]));
  const bpMap = new Map<string, any[]>();
  for (const bp of bpRes.rows) {
    const arr = bpMap.get(bp.orderId) || [];
    arr.push({ ...bp, equipment: bp.equipmentName ? { name: bp.equipmentName } : null });
    bpMap.set(bp.orderId, arr);
  }
  const roMap = new Map<string, any[]>();
  for (const ro of roRes.rows) {
    const arr = roMap.get(ro.sourceRequestId) || [];
    arr.push({ id: ro.id });
    roMap.set(ro.sourceRequestId, arr);
  }

  return orders.map((o: any) => ({
    ...o,
    equipment: o.equipmentId ? eqMap.get(o.equipmentId) || null : null,
    bookedPeriods: bpMap.get(o.id) || [],
    rentOrders: roMap.get(o.id) || [],
  }));
}

/** Список замовлень */
adminOrdersRouter.get("/", async (req, res) => {
  try {
    const { status } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];
    if (status && status !== "all") {
      conditions.push(`"status" = $1`);
      params.push(status);
    }
    const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
    const orders = await getOrdersWithRelations(where, params);
    res.json(orders);
  } catch (e) {
    logError("GET /api/admin/orders error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

const statusSchema = z.object({
  status: z.enum(["NEW", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]),
});

/** Оновити статус замовлення */
adminOrdersRouter.patch("/:id/status", validate(statusSchema), async (req, res) => {
  try {
    const { status } = req.body;
    const id = req.params.id as string;

    await pool.query(
      `UPDATE "Order" SET "status" = $1, "updatedAt" = NOW() WHERE "id" = $2`,
      [status, id],
    );

    const orders = await getOrdersWithRelations(`WHERE "id" = $1`, [id]);
    res.json(orders[0]);
  } catch (e) {
    logError("PATCH /api/admin/orders/:id/status error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Видалити замовлення */
adminOrdersRouter.delete("/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM "Order" WHERE "id" = $1`, [req.params.id as string]);
    res.json({ success: true });
  } catch (e) {
    logError("DELETE /api/admin/orders/:id error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});
