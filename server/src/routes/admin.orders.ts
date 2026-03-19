import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";

export const adminOrdersRouter = Router();

// Всі маршрути захищені
adminOrdersRouter.use(authMiddleware);

/** Список замовлень */
adminOrdersRouter.get("/", async (req, res) => {
  try {
    const { status } = req.query;

    const where: Record<string, unknown> = {};
    if (status && status !== "all") where.status = status;

    const orders = await prisma.order.findMany({
      where,
      include: {
        equipment: { select: { name: true, slug: true } },
        bookedPeriods: {
          include: { equipment: { select: { name: true } } },
          orderBy: { from: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(orders);
  } catch (e) {
    console.error("GET /api/admin/orders error:", e);
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

    const order = await prisma.order.update({
      where: { id: req.params.id as string },
      data: { status },
      include: {
        equipment: { select: { name: true, slug: true } },
        bookedPeriods: {
          include: { equipment: { select: { name: true } } },
          orderBy: { from: "asc" },
        },
      },
    });

    res.json(order);
  } catch (e) {
    console.error("PATCH /api/admin/orders/:id/status error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Видалити замовлення */
adminOrdersRouter.delete("/:id", async (req, res) => {
  try {
    await prisma.order.delete({ where: { id: req.params.id as string } });
    res.json({ success: true });
  } catch (e) {
    console.error("DELETE /api/admin/orders/:id error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});
