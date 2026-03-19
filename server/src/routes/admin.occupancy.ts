import { Router } from "express";
import { prisma } from "../lib/prisma.js";
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

/** Список усіх періодів зайнятості (з техніка + замовлення) */
adminOccupancyRouter.get("/", async (_req, res) => {
  try {
    const periods = await prisma.bookedPeriod.findMany({
      include: {
        equipment: { select: { id: true, name: true, slug: true } },
        order: {
          select: {
            id: true,
            customerName: true,
            status: true,
          },
        },
      },
      orderBy: { from: "asc" },
    });
    res.json(periods);
  } catch (e) {
    console.error("GET /api/admin/occupancy error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Створити період зайнятості */
adminOccupancyRouter.post("/", validate(periodSchema), async (req, res) => {
  try {
    const { from, to, note, equipmentId, orderId } = req.body;

    const period = await prisma.bookedPeriod.create({
      data: {
        from: new Date(from),
        to: new Date(to),
        note: note || null,
        equipmentId,
        orderId: orderId || null,
      },
      include: {
        equipment: { select: { id: true, name: true, slug: true } },
        order: {
          select: { id: true, customerName: true, status: true },
        },
      },
    });

    res.status(201).json(period);
  } catch (e) {
    console.error("POST /api/admin/occupancy error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Оновити період */
adminOccupancyRouter.put("/:id", validate(periodSchema.partial()), async (req, res) => {
  try {
    const { from, to, note, equipmentId, orderId } = req.body;

    const period = await prisma.bookedPeriod.update({
      where: { id: req.params.id as string },
      data: {
        ...(from && { from: new Date(from) }),
        ...(to && { to: new Date(to) }),
        ...(note !== undefined && { note: note || null }),
        ...(equipmentId && { equipmentId }),
        ...(orderId !== undefined && { orderId: orderId || null }),
      },
      include: {
        equipment: { select: { id: true, name: true, slug: true } },
        order: {
          select: { id: true, customerName: true, status: true },
        },
      },
    });

    res.json(period);
  } catch (e) {
    console.error("PUT /api/admin/occupancy/:id error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Видалити період */
adminOccupancyRouter.delete("/:id", async (req, res) => {
  try {
    await prisma.bookedPeriod.delete({ where: { id: req.params.id as string } });
    res.json({ success: true });
  } catch (e) {
    console.error("DELETE /api/admin/occupancy/:id error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});
