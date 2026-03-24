import { logError } from "../lib/logger.js";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";

export const adminServiceRequestsRouter = Router();

adminServiceRequestsRouter.use(authMiddleware);

/** Список заявок на послуги */
adminServiceRequestsRouter.get("/", async (req, res) => {
  try {
    const { status, serviceType } = req.query;
    const where: Record<string, unknown> = {};
    if (status && status !== "all") where.status = status;
    if (serviceType && serviceType !== "all") where.serviceType = serviceType;

    const requests = await prisma.serviceRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    res.json(requests);
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

    const request = await prisma.serviceRequest.update({
      where: { id: req.params.id as string },
      data: { status },
    });

    res.json(request);
  } catch (e) {
    logError("PATCH /api/admin/service-requests/:id/status error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Видалити заявку */
adminServiceRequestsRouter.delete("/:id", async (req, res) => {
  try {
    await prisma.serviceRequest.delete({ where: { id: req.params.id as string } });
    res.json({ success: true });
  } catch (e) {
    logError("DELETE /api/admin/service-requests/:id error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});
