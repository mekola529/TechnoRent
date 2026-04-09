import { logError } from "../lib/logger.js";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const servicesRouter = Router();

/** Список активних послуг (публічний) */
servicesRouter.get("/", async (_req, res) => {
  try {
    const items = await prisma.service.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    res.json(items);
  } catch (e) {
    logError("GET /api/services error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Отримати послугу за slug (публічний) */
servicesRouter.get("/:slug", async (req, res) => {
  try {
    const item = await prisma.service.findFirst({
      where: { slug: req.params.slug as string, isActive: true },
    });
    if (!item) {
      res.status(404).json({ error: "Послугу не знайдено" });
      return;
    }
    res.json(item);
  } catch (e) {
    logError("GET /api/services/:slug error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Отримати послуги за типом техніки (публічний) */
servicesRouter.get("/by-equipment-type/:type", async (req, res) => {
  try {
    const type = req.params.type as string;
    const items = await prisma.service.findMany({
      where: {
        isActive: true,
        relatedEquipmentTypes: { has: type as any },
      },
      orderBy: { sortOrder: "asc" },
    });
    res.json(items);
  } catch (e) {
    logError("GET /api/services/by-equipment-type/:type error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});
