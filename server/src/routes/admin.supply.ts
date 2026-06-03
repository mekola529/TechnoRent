import { Router } from "express";
import { z } from "zod";
import { pool } from "../lib/db.js";
import { logError } from "../lib/logger.js";
import { authMiddleware } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

export const adminSupplyRouter = Router();

adminSupplyRouter.use(authMiddleware);

const materialSchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  unit: z.string().trim().min(1),
  isActive: z.boolean().optional().default(true),
  minOrderQuantity: z.coerce.number().positive().nullable().optional(),
  sortOrder: z.coerce.number().int().optional().default(0),
});

const supplierPointSchema = z.object({
  name: z.string().trim().min(1),
  address: z.string().trim().min(1),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  isActive: z.boolean().optional().default(true),
  contactName: z.string().trim().nullable().optional(),
  contactPhone: z.string().trim().nullable().optional(),
  workHours: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

const supplierOfferSchema = z.object({
  supplierPointId: z.string().trim().min(1),
  materialId: z.string().trim().min(1),
  unitPrice: z.coerce.number().positive(),
  isAvailable: z.boolean().optional().default(true),
  minOrderQuantity: z.coerce.number().positive().nullable().optional(),
  lastPriceUpdatedAt: z.string().optional().or(z.literal("")),
  notes: z.string().trim().nullable().optional(),
});

adminSupplyRouter.get("/materials", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM "Material" ORDER BY "sortOrder" ASC, "name" ASC`,
    );
    res.json(rows);
  } catch (error) {
    logError("GET /api/admin/supply/materials error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

adminSupplyRouter.post("/materials", validate(materialSchema), async (req, res) => {
  try {
    const d = req.body;
    const { rows } = await pool.query(
      `INSERT INTO "Material" (
         "name", "slug", "unit", "isActive", "minOrderQuantity", "sortOrder", "updatedAt"
       )
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [
        d.name,
        d.slug,
        d.unit,
        d.isActive,
        d.minOrderQuantity ?? null,
        d.sortOrder,
      ],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    logError("POST /api/admin/supply/materials error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

adminSupplyRouter.put("/materials/:id", validate(materialSchema.partial()), async (req, res) => {
  try {
    const updated = await updateById("Material", req.params.id as string, req.body);
    if (!updated) {
      res.status(404).json({ error: "Матеріал не знайдено" });
      return;
    }
    res.json(updated);
  } catch (error) {
    logError("PUT /api/admin/supply/materials/:id error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

adminSupplyRouter.delete("/materials/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM "Material" WHERE "id" = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    logError("DELETE /api/admin/supply/materials/:id error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

adminSupplyRouter.get("/supplier-points", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         sp.*,
         COALESCE(
           json_agg(
             json_build_object(
               'id', smo."id",
               'materialId', m."id",
               'materialName', m."name",
               'unit', m."unit",
               'unitPrice', smo."unitPrice",
               'isAvailable', smo."isAvailable"
             )
             ORDER BY m."name" ASC
           ) FILTER (WHERE smo."id" IS NOT NULL),
           '[]'::json
         ) AS "offers"
       FROM "SupplierPoint" sp
       LEFT JOIN "SupplierMaterialOffer" smo ON smo."supplierPointId" = sp."id"
       LEFT JOIN "Material" m ON m."id" = smo."materialId"
       GROUP BY sp."id"
       ORDER BY sp."name" ASC`,
    );
    res.json(rows);
  } catch (error) {
    logError("GET /api/admin/supply/supplier-points error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

adminSupplyRouter.post("/supplier-points", validate(supplierPointSchema), async (req, res) => {
  try {
    const d = req.body;
    const { rows } = await pool.query(
      `INSERT INTO "SupplierPoint" (
         "name", "address", "latitude", "longitude", "isActive",
         "contactName", "contactPhone", "workHours", "notes", "updatedAt"
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING *`,
      [
        d.name,
        d.address,
        d.latitude,
        d.longitude,
        d.isActive,
        emptyToNull(d.contactName),
        emptyToNull(d.contactPhone),
        emptyToNull(d.workHours),
        emptyToNull(d.notes),
      ],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    logError("POST /api/admin/supply/supplier-points error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

adminSupplyRouter.put("/supplier-points/:id", validate(supplierPointSchema.partial()), async (req, res) => {
  try {
    const payload = normalizeNullableText(req.body, ["contactName", "contactPhone", "workHours", "notes"]);
    const updated = await updateById("SupplierPoint", req.params.id as string, payload);
    if (!updated) {
      res.status(404).json({ error: "Точку постачання не знайдено" });
      return;
    }
    res.json(updated);
  } catch (error) {
    logError("PUT /api/admin/supply/supplier-points/:id error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

adminSupplyRouter.delete("/supplier-points/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM "SupplierPoint" WHERE "id" = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    logError("DELETE /api/admin/supply/supplier-points/:id error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

adminSupplyRouter.get("/supplier-offers", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         smo.*,
         json_build_object(
           'id', sp."id",
           'name', sp."name",
           'address', sp."address",
           'latitude', sp."latitude",
           'longitude', sp."longitude",
           'isActive', sp."isActive"
         ) AS "supplierPoint",
         json_build_object(
           'id', m."id",
           'name', m."name",
           'slug', m."slug",
           'unit', m."unit",
           'isActive', m."isActive"
         ) AS "material"
       FROM "SupplierMaterialOffer" smo
       INNER JOIN "SupplierPoint" sp ON sp."id" = smo."supplierPointId"
       INNER JOIN "Material" m ON m."id" = smo."materialId"
       ORDER BY sp."name" ASC, m."name" ASC`,
    );
    res.json(rows);
  } catch (error) {
    logError("GET /api/admin/supply/supplier-offers error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

adminSupplyRouter.post("/supplier-offers", validate(supplierOfferSchema), async (req, res) => {
  try {
    const d = req.body;
    const { rows } = await pool.query(
      `INSERT INTO "SupplierMaterialOffer" (
         "supplierPointId", "materialId", "unitPrice", "isAvailable",
         "minOrderQuantity", "lastPriceUpdatedAt", "notes", "updatedAt"
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT ("supplierPointId", "materialId")
       DO UPDATE SET
         "unitPrice" = EXCLUDED."unitPrice",
         "isAvailable" = EXCLUDED."isAvailable",
         "minOrderQuantity" = EXCLUDED."minOrderQuantity",
         "lastPriceUpdatedAt" = EXCLUDED."lastPriceUpdatedAt",
         "notes" = EXCLUDED."notes",
         "updatedAt" = NOW()
       RETURNING *`,
      [
        d.supplierPointId,
        d.materialId,
        d.unitPrice,
        d.isAvailable,
        d.minOrderQuantity ?? null,
        d.lastPriceUpdatedAt ? new Date(d.lastPriceUpdatedAt) : null,
        emptyToNull(d.notes),
      ],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    logError("POST /api/admin/supply/supplier-offers error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

adminSupplyRouter.put("/supplier-offers/:id", validate(supplierOfferSchema.partial()), async (req, res) => {
  try {
    const payload = normalizeNullableText(req.body, ["notes"]);
    const rawLastPriceUpdatedAt = payload.lastPriceUpdatedAt;
    if (typeof rawLastPriceUpdatedAt === "string" && rawLastPriceUpdatedAt) {
      payload.lastPriceUpdatedAt = new Date(rawLastPriceUpdatedAt);
    } else if (Object.prototype.hasOwnProperty.call(payload, "lastPriceUpdatedAt")) {
      payload.lastPriceUpdatedAt = null;
    }

    const updated = await updateById("SupplierMaterialOffer", req.params.id as string, payload);
    if (!updated) {
      res.status(404).json({ error: "Пропозицію не знайдено" });
      return;
    }
    res.json(updated);
  } catch (error) {
    logError("PUT /api/admin/supply/supplier-offers/:id error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

adminSupplyRouter.delete("/supplier-offers/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM "SupplierMaterialOffer" WHERE "id" = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    logError("DELETE /api/admin/supply/supplier-offers/:id error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

function emptyToNull(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? null : value ?? null;
}

function normalizeNullableText(payload: Record<string, unknown>, keys: string[]) {
  const normalized = { ...payload };
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(normalized, key)) {
      normalized[key] = emptyToNull(normalized[key]);
    }
  }
  return normalized;
}

async function updateById(table: "Material" | "SupplierPoint" | "SupplierMaterialOffer", id: string, data: Record<string, unknown>) {
  const setClauses = [`"updatedAt" = NOW()`];
  const params: unknown[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(data)) {
    setClauses.push(`"${key}" = $${idx}`);
    params.push(value);
    idx += 1;
  }

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE "${table}" SET ${setClauses.join(", ")} WHERE "id" = $${idx} RETURNING *`,
    params,
  );
  return rows[0] ?? null;
}
