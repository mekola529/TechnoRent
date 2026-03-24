import { logError } from "../lib/logger.js";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { sendServiceRequestTelegram } from "../lib/telegram.js";

export const serviceRequestsRouter = Router();

const createSchema = z.object({
  serviceType: z.string().min(1),
  customerName: z.string().min(1, "Ім'я обов'язкове"),
  phone: z.string().min(5, "Телефон обов'язковий"),
  address: z.string().min(1, "Адреса обов'язкова"),
  date: z.string().refine((s) => !isNaN(Date.parse(s)), "Невірна дата"),
  time: z.string().min(1, "Час обов'язковий"),
  comment: z.string().optional().or(z.literal("")),
});

/** Створити заявку на послугу (публічний маршрут) */
serviceRequestsRouter.post("/", validate(createSchema), async (req, res) => {
  try {
    const { serviceType, customerName, phone, address, date, time, comment } = req.body;

    const request = await prisma.serviceRequest.create({
      data: {
        serviceType,
        customerName,
        phone,
        address,
        date: new Date(date),
        time,
        comment: comment || null,
      },
    });

    res.status(201).json(request);

    // Telegram notification (non-blocking)
    sendServiceRequestTelegram(request);
  } catch (e) {
    logError("POST /api/service-requests error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});
