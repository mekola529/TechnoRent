import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { sendTelegramNotification } from "../lib/telegram.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";

export const ordersRouter = Router();

const createOrderSchema = z.object({
  customerName: z.string().min(1, "Ім'я обов'язкове"),
  phone: z.string().min(5, "Мобільний обов'язковий"),
  email: z.string().email().optional().or(z.literal("")),
  dateFrom: z.string().optional().or(z.literal("")),
  dateTo: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  comment: z.string().optional().or(z.literal("")),
  equipmentId: z.string().min(1).optional().or(z.literal("")),
});

/** Створити замовлення (публічний маршрут) */
ordersRouter.post("/", validate(createOrderSchema), async (req, res) => {
  try {
    const { customerName, phone, email, dateFrom, dateTo, address, comment, equipmentId } =
      req.body;

    // Перевірити чи техніка існує (якщо вказана)
    if (equipmentId) {
      const equipment = await prisma.equipment.findUnique({
        where: { id: equipmentId },
      });
      if (!equipment) {
        res.status(404).json({ error: "Техніку не знайдено" });
        return;
      }
    }

    const order = await prisma.order.create({
      data: {
        customerName,
        phone,
        email: email || null,
        dateFrom: dateFrom ? new Date(dateFrom) : null,
        dateTo: dateTo ? new Date(dateTo) : null,
        address: address || null,
        comment: comment || null,
        equipmentId: equipmentId || null,
      },
      include: { equipment: { select: { name: true, slug: true } } },
    });

    res.status(201).json(order);

    // Відправити сповіщення в Telegram (не блокує відповідь)
    sendTelegramNotification(order);
  } catch (e) {
    console.error("POST /api/orders error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});
