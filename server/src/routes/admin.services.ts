import { logError } from "../lib/logger.js";
import { Router } from "express";
import { pool } from "../lib/db.js";
import { authMiddleware } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { normalizeEquipmentTypeValue } from "../lib/equipment-type.js";

export const adminServicesRouter = Router();

adminServicesRouter.use(authMiddleware);

const pricingTypes = [
  "fixed_from",
  "hourly_from",
  "calculator",
  "tow_calculator",
  "material_delivery_calculator",
  "custom",
] as const;

const calculatorPricingTypes = new Set<string>([
  "tow_calculator",
  "material_delivery_calculator",
]);

const serviceSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  shortDescription: z.string().min(1),
  fullDescription: z.string().min(1),
  image: z.string().min(1),
  priceInfo: z.string().min(1),
  pricingType: z.enum(pricingTypes),
  deliveryRatePerKm: z.coerce.number().positive().nullable().optional(),
  relatedEquipmentTypes: z.array(z.string().trim().min(1)),
  features: z.array(z.string()),
  seoTitle: z.string().optional().default(""),
  seoDescription: z.string().optional().default(""),
  isActive: z.boolean().optional().default(true),
  isPopular: z.boolean().optional().default(false),
  sortOrder: z.number().int().optional().default(0),
});

function isCalculatorPricingType(pricingType: unknown) {
  return typeof pricingType === "string" && calculatorPricingTypes.has(pricingType);
}

function hasOwn(data: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(data, key);
}

function prepareServicePayload(
  data: Record<string, any>,
  existing?: { pricingType?: string; deliveryRatePerKm?: number | null },
) {
  const pricingType = data.pricingType ?? existing?.pricingType;
  const isCalculator = isCalculatorPricingType(pricingType);
  const rateWasProvided = hasOwn(data, "deliveryRatePerKm");
  const effectiveRate = rateWasProvided ? data.deliveryRatePerKm : existing?.deliveryRatePerKm;

  if (isCalculator && !(typeof effectiveRate === "number" && effectiveRate > 0)) {
    return {
      error: "Для калькулятора потрібно вказати тариф доставки за 1 км",
      data: null,
    };
  }

  const prepared = { ...data };

  if (isCalculator) {
    if (rateWasProvided) {
      prepared.deliveryRatePerKm = data.deliveryRatePerKm;
    }
  } else if (rateWasProvided || hasOwn(data, "pricingType")) {
    prepared.deliveryRatePerKm = null;
  }

  return { error: null, data: prepared };
}

/** Список всіх послуг (включно з неактивними) */
adminServicesRouter.get("/", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM "Service" ORDER BY "sortOrder" ASC`,
    );
    res.json(rows);
  } catch (e) {
    logError("GET /api/admin/services error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Створити послугу */
adminServicesRouter.post("/", validate(serviceSchema), async (req, res) => {
  try {
    const d = {
      ...req.body,
      relatedEquipmentTypes: (req.body.relatedEquipmentTypes ?? []).map((value: string) =>
        normalizeEquipmentTypeValue(value),
      ),
    };
    const prepared = prepareServicePayload(d);
    if (prepared.error || !prepared.data) {
      res.status(400).json({ error: prepared.error });
      return;
    }
    const data = prepared.data;
    const { rows } = await pool.query(
      `INSERT INTO "Service" ("slug", "title", "shortDescription", "fullDescription", "image", "priceInfo", "pricingType", "deliveryRatePerKm", "relatedEquipmentTypes", "features", "seoTitle", "seoDescription", "isActive", "isPopular", "sortOrder", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, NOW()) RETURNING *`,
      [data.slug, data.title, data.shortDescription, data.fullDescription, data.image, data.priceInfo, data.pricingType, data.deliveryRatePerKm ?? null, data.relatedEquipmentTypes, data.features, data.seoTitle, data.seoDescription, data.isActive, data.isPopular, data.sortOrder],
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    logError("POST /api/admin/services error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Оновити послугу */
adminServicesRouter.put("/:id", validate(serviceSchema.partial()), async (req, res) => {
  try {
    const id = req.params.id as string;
    const existingRes = await pool.query(
      `SELECT "pricingType", "deliveryRatePerKm" FROM "Service" WHERE "id" = $1 LIMIT 1`,
      [id],
    );
    if (existingRes.rows.length === 0) {
      res.status(404).json({ error: "Послугу не знайдено" });
      return;
    }

    const data = {
      ...req.body,
      ...(req.body.relatedEquipmentTypes
        ? {
            relatedEquipmentTypes: req.body.relatedEquipmentTypes.map((value: string) =>
              normalizeEquipmentTypeValue(value),
            ),
          }
        : {}),
    };
    const prepared = prepareServicePayload(data, existingRes.rows[0]);
    if (prepared.error || !prepared.data) {
      res.status(400).json({ error: prepared.error });
      return;
    }

    const setClauses: string[] = [`"updatedAt" = NOW()`];
    const params: any[] = [];
    let idx = 1;
    for (const [key, value] of Object.entries(prepared.data)) {
      setClauses.push(`"${key}" = $${idx}`);
      params.push(value);
      idx++;
    }
    params.push(id);
    const { rows } = await pool.query(
      `UPDATE "Service" SET ${setClauses.join(", ")} WHERE "id" = $${idx} RETURNING *`,
      params,
    );
    res.json(rows[0]);
  } catch (e) {
    logError("PUT /api/admin/services/:id error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Видалити послугу */
adminServicesRouter.delete("/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM "Service" WHERE "id" = $1`, [req.params.id as string]);
    res.json({ success: true });
  } catch (e) {
    logError("DELETE /api/admin/services/:id error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Перемістити послугу на нову позицію (зсув інших) */
adminServicesRouter.put("/:id/reorder", async (req, res) => {
  try {
    const { newPosition } = req.body as { newPosition: number };
    if (typeof newPosition !== "number" || newPosition < 1) {
      return res.status(400).json({ error: "newPosition має бути числом >= 1" });
    }

    const { rows } = await pool.query(`SELECT * FROM "Service" WHERE "id" = $1`, [req.params.id as string]);
    if (rows.length === 0) return res.status(404).json({ error: "Послугу не знайдено" });
    const service = rows[0];

    const oldPos = service.sortOrder;
    if (oldPos === newPosition) {
      return res.json({ success: true });
    }

    if (newPosition < oldPos) {
      await pool.query(
        `UPDATE "Service" SET "sortOrder" = "sortOrder" + 1, "updatedAt" = NOW()
         WHERE "sortOrder" >= $1 AND "sortOrder" < $2`,
        [newPosition, oldPos],
      );
    } else {
      await pool.query(
        `UPDATE "Service" SET "sortOrder" = "sortOrder" - 1, "updatedAt" = NOW()
         WHERE "sortOrder" > $1 AND "sortOrder" <= $2`,
        [oldPos, newPosition],
      );
    }

    await pool.query(
      `UPDATE "Service" SET "sortOrder" = $1, "updatedAt" = NOW() WHERE "id" = $2`,
      [newPosition, req.params.id as string],
    );

    const { rows: items } = await pool.query(`SELECT * FROM "Service" ORDER BY "sortOrder" ASC`);
    res.json(items);
  } catch (e) {
    logError("PUT /api/admin/services/:id/reorder error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});
