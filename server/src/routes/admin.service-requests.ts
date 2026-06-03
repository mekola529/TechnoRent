import { logError } from "../lib/logger.js";
import { Router } from "express";
import { pool } from "../lib/db.js";
import { authMiddleware } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";

export const adminServiceRequestsRouter = Router();

adminServiceRequestsRouter.use(authMiddleware);

/** Список заявок на послуги */
adminServiceRequestsRouter.get("/", async (req, res) => {
  try {
    const { status, serviceType } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (status && status !== "all") {
      conditions.push(`"status" = $${idx}`);
      params.push(status);
      idx++;
    }
    if (serviceType && serviceType !== "all") {
      conditions.push(`"serviceType" = $${idx}`);
      params.push(serviceType);
      idx++;
    }
    const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
    const { rows } = await pool.query(
      `SELECT * FROM "ServiceRequest" ${where} ORDER BY "createdAt" DESC`,
      params,
    );
    res.json(rows);
  } catch (e) {
    logError("GET /api/admin/service-requests error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

const statusSchema = z.object({
  status: z.enum(["NEW", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]),
});

/** Оновити статус */
adminServiceRequestsRouter.patch("/:id/status", validate(statusSchema), async (req, res) => {
  try {
    const { status } = req.body;

    const { rows } = await pool.query(
      `UPDATE "ServiceRequest" SET "status" = $1, "updatedAt" = NOW() WHERE "id" = $2 RETURNING *`,
      [status, req.params.id as string],
    );

    res.json(rows[0]);
  } catch (e) {
    logError("PATCH /api/admin/service-requests/:id/status error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Видалити заявку */
adminServiceRequestsRouter.delete("/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM "ServiceRequest" WHERE "id" = $1`, [req.params.id as string]);
    res.json({ success: true });
  } catch (e) {
    logError("DELETE /api/admin/service-requests/:id error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});
