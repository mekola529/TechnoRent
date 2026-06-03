import { logError } from "../lib/logger.js";
import { Router } from "express";
import { pool } from "../lib/db.js";
import { z } from "zod";
import {
  calculateMaterialDelivery,
  getMaterialDeliveryOptions,
} from "../lib/material-delivery-calculator.js";

export const servicesRouter = Router();

const materialDeliveryCalculationSchema = z.object({
  materialId: z.string().trim().min(1),
  quantity: z.coerce.number().positive(),
  unit: z.string().trim().optional(),
  address: z.string().trim().min(1),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  requestMode: z.enum(["urgent", "scheduled"]).default("urgent"),
  scheduledDate: z.string().optional().or(z.literal("")),
  scheduledTime: z.string().optional().or(z.literal("")),
});

/** Дані для калькулятора евакуатора (публічний) */
servicesRouter.get("/:slug/tow-calculator", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM "Service" WHERE "slug" = $1 AND "isActive" = true LIMIT 1`,
      [req.params.slug],
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Послугу не знайдено" });
      return;
    }

    const service = rows[0];
    if (service.pricingType !== "tow_calculator") {
      res.status(400).json({ error: "Для цієї послуги калькулятор недоступний" });
      return;
    }

    const { rows: trackerRows } = await pool.query(
      `SELECT
         td."id",
         td."name",
         td."lastAddress",
         td."lastLatitude",
         td."lastLongitude",
         td."lastTrackerAt",
         e."id" AS "equipmentId",
         e."name" AS "equipmentName",
         e."slug" AS "equipmentSlug",
         e."baseAddress",
         e."baseLatitude",
         e."baseLongitude"
       FROM "TrackerDevice" td
       JOIN "Equipment" e ON e."id" = td."equipmentId"
       WHERE e."type" = ANY($1)
       ORDER BY COALESCE(td."lastTrackerAt", td."updatedAt") DESC, e."isPopular" DESC, e."createdAt" DESC`,
      [service.relatedEquipmentTypes],
    );

    if (trackerRows.length === 0) {
      res.json({
        available: false,
        priceInfo: service.priceInfo,
        deliveryRatePerKm: service.deliveryRatePerKm,
        message: "Для цієї послуги ще не прив'язаний GPS-маячок до техніки.",
      });
      return;
    }
    const trackers = trackerRows
      .map((tracker) => {
        const hasCoordinates =
          typeof tracker.lastLatitude === "number" && typeof tracker.lastLongitude === "number";
        const hasBaseCoordinates =
          typeof tracker.baseLatitude === "number" && typeof tracker.baseLongitude === "number";
        const available = Boolean(tracker.lastAddress || hasCoordinates || hasBaseCoordinates);

        return {
          available,
          trackerDevice: {
            id: tracker.id,
            name: tracker.name,
            lastAddress: tracker.lastAddress,
            lastLatitude: tracker.lastLatitude,
            lastLongitude: tracker.lastLongitude,
            lastTrackerAt: tracker.lastTrackerAt,
          },
          equipment: {
            id: tracker.equipmentId,
            name: tracker.equipmentName,
            slug: tracker.equipmentSlug,
            baseAddress: tracker.baseAddress,
            baseLatitude: tracker.baseLatitude,
            baseLongitude: tracker.baseLongitude,
          },
        };
      })
      .filter((tracker) => tracker.available);

    res.json({
      available: trackers.length > 0,
      priceInfo: service.priceInfo,
      deliveryRatePerKm: service.deliveryRatePerKm,
      trackers,
      message: trackers.length > 0 ? null : "GPS-маячки не передали актуальну позицію евакуатора.",
    });
  } catch (e) {
    logError("GET /api/services/:slug/tow-calculator error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Доступні матеріали для калькулятора доставки (публічний) */
servicesRouter.get("/:slug/material-delivery-options", async (req, res) => {
  try {
    const result = await getMaterialDeliveryOptions(req.params.slug as string);
    if (!result) {
      res.status(404).json({ error: "Послугу доставки матеріалів не знайдено" });
      return;
    }

    res.json(result);
  } catch (e) {
    logError("GET /api/services/:slug/material-delivery-options error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Розрахунок доставки матеріалів (публічний) */
servicesRouter.post("/:slug/material-delivery-calculate", async (req, res) => {
  try {
    const parsed = materialDeliveryCalculationSchema.parse(req.body);
    const result = await calculateMaterialDelivery({
      serviceSlug: req.params.slug as string,
      materialId: parsed.materialId,
      quantity: parsed.quantity,
      address: parsed.address,
      latitude: parsed.latitude ?? null,
      longitude: parsed.longitude ?? null,
      requestMode: parsed.requestMode,
      scheduledDate: parsed.scheduledDate || null,
      scheduledTime: parsed.scheduledTime || null,
    });

    res.json(result);
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: "Помилка валідації", details: e.flatten().fieldErrors });
      return;
    }
    logError("POST /api/services/:slug/material-delivery-calculate error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Отримати послуги за типом техніки (публічний) */
servicesRouter.get("/by-equipment-type/:type", async (req, res) => {
  try {
    const type = req.params.type as string;
    const { rows } = await pool.query(
      `SELECT * FROM "Service" WHERE "isActive" = true AND $1 = ANY("relatedEquipmentTypes") ORDER BY "sortOrder" ASC`,
      [type],
    );
    res.json(rows);
  } catch (e) {
    logError("GET /api/services/by-equipment-type/:type error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Список активних послуг (публічний) */
servicesRouter.get("/", async (req, res) => {
  try {
    const conditions = [`"isActive" = true`];
    if (req.query.popular === "true") {
      conditions.push(`"isPopular" = true`);
    }
    const { rows } = await pool.query(
      `SELECT * FROM "Service" WHERE ${conditions.join(" AND ")} ORDER BY "sortOrder" ASC`,
    );
    res.json(rows);
  } catch (e) {
    logError("GET /api/services error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Отримати послугу за slug (публічний) */
servicesRouter.get("/:slug", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM "Service" WHERE "slug" = $1 AND "isActive" = true LIMIT 1`,
      [req.params.slug],
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "Послугу не знайдено" });
      return;
    }
    res.json(rows[0]);
  } catch (e) {
    logError("GET /api/services/:slug error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});
