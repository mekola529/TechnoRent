import { logError } from "../lib/logger.js";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";

export const adminServicesRouter = Router();

adminServicesRouter.use(authMiddleware);

const serviceSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  shortDescription: z.string().min(1),
  fullDescription: z.string().min(1),
  image: z.string().min(1),
  priceInfo: z.string().min(1),
  pricingType: z.enum(["fixed_from", "hourly_from", "calculator", "custom"]),
  relatedEquipmentTypes: z.array(
    z.enum([
      "excavator", "loader", "bulldozer", "crane", "roller",
      "dump_truck", "concrete_mixer", "generator", "other",
    ]),
  ),
  features: z.array(z.string()),
  seoTitle: z.string().optional().default(""),
  seoDescription: z.string().optional().default(""),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

/** Список всіх послуг (включно з неактивними) */
adminServicesRouter.get("/", async (_req, res) => {
  try {
    const items = await prisma.service.findMany({
      orderBy: { sortOrder: "asc" },
    });
    res.json(items);
  } catch (e) {
    logError("GET /api/admin/services error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Створити послугу */
adminServicesRouter.post("/", validate(serviceSchema), async (req, res) => {
  try {
    const item = await prisma.service.create({ data: req.body });
    res.status(201).json(item);
  } catch (e) {
    logError("POST /api/admin/services error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Оновити послугу */
adminServicesRouter.put("/:id", validate(serviceSchema.partial()), async (req, res) => {
  try {
    const item = await prisma.service.update({
      where: { id: req.params.id as string },
      data: req.body,
    });
    res.json(item);
  } catch (e) {
    logError("PUT /api/admin/services/:id error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Видалити послугу */
adminServicesRouter.delete("/:id", async (req, res) => {
  try {
    await prisma.service.delete({ where: { id: req.params.id as string } });
    res.json({ success: true });
  } catch (e) {
    logError("DELETE /api/admin/services/:id error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});
