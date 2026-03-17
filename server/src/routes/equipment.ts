import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const equipmentRouter = Router();

/** Отримати унікальні бренди (ПЕРЕД /:slug!) */
equipmentRouter.get("/meta/brands", async (_req, res) => {
  try {
    const brands = await prisma.equipment.findMany({
      select: { brand: true },
      distinct: ["brand"],
      orderBy: { brand: "asc" },
    });
    res.json(brands.map((b: { brand: string }) => b.brand));
  } catch (e) {
    console.error("GET /api/equipment/meta/brands error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Отримати наявні типи техніки (ПЕРЕД /:slug!) */
equipmentRouter.get("/meta/types", async (_req, res) => {
  try {
    const types = await prisma.equipment.findMany({
      select: { type: true },
      distinct: ["type"],
      orderBy: { type: "asc" },
    });
    res.json(types.map((t: { type: string }) => t.type));
  } catch (e) {
    console.error("GET /api/equipment/meta/types error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Список техніки (з фільтрами) */
equipmentRouter.get("/", async (req, res) => {
  try {
    const { type, brand, popular, sort } = req.query;

    const where: Record<string, unknown> = {};
    if (type && type !== "all") where.type = type;
    if (brand && brand !== "all") where.brand = brand;
    if (popular === "true") where.isPopular = true;

    const orderBy: Record<string, string> = {};
    if (sort === "price-asc") orderBy.pricePerHour = "asc";
    else if (sort === "price-desc") orderBy.pricePerHour = "desc";
    else if (sort === "name") orderBy.name = "asc";
    else orderBy.createdAt = "desc";

    const items = await prisma.equipment.findMany({
      where,
      orderBy,
      include: {
        images: true,
        specs: true,
        bookedPeriods: true,
      },
    });

    res.json(items);
  } catch (e) {
    console.error("GET /api/equipment error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Отримати одиницю техніки за slug */
equipmentRouter.get("/:slug", async (req, res) => {
  try {
    const item = await prisma.equipment.findUnique({
      where: { slug: req.params.slug },
      include: {
        images: true,
        specs: true,
        bookedPeriods: true,
      },
    });

    if (!item) {
      res.status(404).json({ error: "Техніку не знайдено" });
      return;
    }

    res.json(item);
  } catch (e) {
    console.error("GET /api/equipment/:slug error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});
