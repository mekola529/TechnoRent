import { logError } from "../lib/logger.js";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";

export const adminRentOrdersRouter = Router();

adminRentOrdersRouter.use(authMiddleware);

const itemSchema = z.object({
  equipmentId: z.string().min(1),
  startDate: z.string().refine((s) => !isNaN(Date.parse(s)), "Invalid date"),
  endDate: z.string().refine((s) => !isNaN(Date.parse(s)), "Invalid date"),
});

const rentOrderSchema = z.object({
  customerName: z.string().min(1),
  customerPhone: z.string().min(1),
  items: z.array(itemSchema).min(1, "Додайте хоча б одну техніку"),
  status: z.enum(["NEW", "CONFIRMED", "ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
  comment: z.string().optional(),
  sourceType: z.enum(["manual", "request"]).optional(),
  sourceRequestId: z.string().optional(),
});

const includeRelations = {
  items: {
    include: { equipment: { select: { id: true, name: true, slug: true } } },
    orderBy: { startDate: "asc" as const },
  },
  sourceRequest: { select: { id: true, customerName: true, phone: true } },
};

/** Create BookedPeriod rows for each item in a rent order */
async function syncBookedPeriods(
  rentOrderId: string,
  customerName: string,
  items: { equipmentId: string; startDate: string | Date; endDate: string | Date }[],
) {
  // Remove existing periods for this order
  await prisma.bookedPeriod.deleteMany({ where: { rentOrderId } });
  // Create new ones
  if (items.length > 0) {
    await prisma.bookedPeriod.createMany({
      data: items.map((it) => ({
        equipmentId: it.equipmentId,
        from: new Date(it.startDate),
        to: new Date(it.endDate),
        note: `[Оренда] Клієнт: ${customerName}`,
        rentOrderId,
      })),
    });
  }
}

/** Список замовлень */
adminRentOrdersRouter.get("/", async (req, res) => {
  try {
    const { status } = req.query;
    const where: Record<string, unknown> = {};
    if (status && status !== "all") where.status = status;

    const orders = await prisma.rentOrder.findMany({
      where,
      include: includeRelations,
      orderBy: { createdAt: "desc" },
    });

    res.json(orders);
  } catch (e) {
    logError("GET /api/admin/rent-orders error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Отримати одне замовлення */
adminRentOrdersRouter.get("/:id", async (req, res) => {
  try {
    const order = await prisma.rentOrder.findUnique({
      where: { id: req.params.id as string },
      include: includeRelations,
    });

    if (!order) {
      res.status(404).json({ error: "Замовлення не знайдено" });
      return;
    }

    res.json(order);
  } catch (e) {
    logError("GET /api/admin/rent-orders/:id error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Створити замовлення */
adminRentOrdersRouter.post("/", validate(rentOrderSchema), async (req, res) => {
  try {
    const { items, comment, sourceRequestId, ...rest } = req.body;

    const order = await prisma.rentOrder.create({
      data: {
        customerName: rest.customerName,
        customerPhone: rest.customerPhone,
        status: rest.status || "NEW",
        sourceType: rest.sourceType || "manual",
        sourceRequestId: sourceRequestId || null,
        comment: comment || null,
        items: {
          create: items.map((it: { equipmentId: string; startDate: string; endDate: string }) => ({
            equipmentId: it.equipmentId,
            startDate: new Date(it.startDate),
            endDate: new Date(it.endDate),
          })),
        },
      },
      include: includeRelations,
    });

    // Auto-create booked periods for equipment (unless cancelled)
    if (order.status !== "CANCELLED") {
      await syncBookedPeriods(
        order.id,
        order.customerName,
        items.map((it: { equipmentId: string; startDate: string; endDate: string }) => it),
      );
    }

    // Auto-mark source request as COMPLETED
    if (sourceRequestId) {
      await prisma.order.update({
        where: { id: sourceRequestId },
        data: { status: "COMPLETED" },
      });
    }

    res.status(201).json(order);
  } catch (e) {
    logError("POST /api/admin/rent-orders error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Оновити замовлення */
adminRentOrdersRouter.put("/:id", validate(rentOrderSchema.partial()), async (req, res) => {
  try {
    const { items, comment, sourceRequestId, ...rest } = req.body;
    const data: Record<string, unknown> = {};

    if (rest.customerName) data.customerName = rest.customerName;
    if (rest.customerPhone) data.customerPhone = rest.customerPhone;
    if (rest.status) data.status = rest.status;
    if (rest.sourceType) data.sourceType = rest.sourceType;
    if (comment !== undefined) data.comment = comment || null;
    if (sourceRequestId !== undefined) data.sourceRequestId = sourceRequestId || null;

    // If items provided, replace all items
    if (items && Array.isArray(items)) {
      await prisma.rentOrderItem.deleteMany({
        where: { rentOrderId: req.params.id as string },
      });
      data.items = {
        create: items.map((it: { equipmentId: string; startDate: string; endDate: string }) => ({
          equipmentId: it.equipmentId,
          startDate: new Date(it.startDate),
          endDate: new Date(it.endDate),
        })),
      };
    }

    const order = await prisma.rentOrder.update({
      where: { id: req.params.id as string },
      data,
      include: includeRelations,
    });

    // Re-sync booked periods when items change
    if (items && Array.isArray(items)) {
      if (order.status === "CANCELLED") {
        await prisma.bookedPeriod.deleteMany({ where: { rentOrderId: order.id } });
      } else {
        await syncBookedPeriods(
          order.id,
          order.customerName,
          items.map((it: { equipmentId: string; startDate: string; endDate: string }) => it),
        );
      }
    }

    res.json(order);
  } catch (e) {
    logError("PUT /api/admin/rent-orders/:id error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Оновити статус */
adminRentOrdersRouter.patch("/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const orderId = req.params.id as string;

    const order = await prisma.rentOrder.update({
      where: { id: orderId },
      data: { status },
      include: includeRelations,
    });

    // Sync booked periods based on status
    if (status === "CANCELLED" || status === "COMPLETED") {
      await prisma.bookedPeriod.deleteMany({ where: { rentOrderId: orderId } });
    } else {
      // Re-create from current items (e.g. reactivating a cancelled order)
      const currentPeriods = await prisma.bookedPeriod.count({ where: { rentOrderId: orderId } });
      if (currentPeriods === 0 && order.items.length > 0) {
        await syncBookedPeriods(
          orderId,
          order.customerName,
          order.items.map((it) => ({
            equipmentId: it.equipmentId,
            startDate: it.startDate,
            endDate: it.endDate,
          })),
        );
      }
    }

    res.json(order);
  } catch (e) {
    logError("PATCH /api/admin/rent-orders/:id/status error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Видалити замовлення */
adminRentOrdersRouter.delete("/:id", async (req, res) => {
  try {
    const orderId = req.params.id as string;
    await prisma.bookedPeriod.deleteMany({ where: { rentOrderId: orderId } });
    await prisma.rentOrder.delete({ where: { id: orderId } });
    res.json({ success: true });
  } catch (e) {
    logError("DELETE /api/admin/rent-orders/:id error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});
