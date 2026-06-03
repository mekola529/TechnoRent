import { Router } from "express";
import { z } from "zod";
import { pool } from "../lib/db.js";
import { logError } from "../lib/logger.js";
import { checkOrderAvailability } from "../lib/availability.js";

export const adminAvailabilityRouter = Router();

const availabilitySchema = z.object({
  orderId: z.string().optional().nullable(),
  scheduledDate: z.string().optional().nullable(),
  scheduledDateTo: z.string().optional().nullable(),
  scheduledTimeFrom: z.string().optional().nullable(),
  scheduledTimeTo: z.string().optional().nullable(),
  employeeIds: z.array(z.string()).optional(),
  items: z
    .array(
      z.object({
        equipmentId: z.string().optional().nullable(),
        useCustomSchedule: z.boolean().optional(),
        scheduledDateFrom: z.string().optional().nullable(),
        scheduledDateTo: z.string().optional().nullable(),
        scheduledTimeFrom: z.string().optional().nullable(),
        scheduledTimeTo: z.string().optional().nullable(),
      }),
    )
    .optional(),
});

adminAvailabilityRouter.post("/check", async (req, res) => {
  try {
    const parsed = availabilitySchema.parse(req.body);
    const result = await checkOrderAvailability(pool, parsed);
    res.json(result);
  } catch (error) {
    logError("POST /api/admin/availability/check error:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Некоректні дані для перевірки доступності", details: error.flatten() });
      return;
    }
    res.status(500).json({ error: "Помилка сервера під час перевірки доступності" });
  }
});
