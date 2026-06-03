import { logError } from "../lib/logger.js";
import { Router } from "express";
import type { PoolClient } from "pg";
import { pool } from "../lib/db.js";
import { authMiddleware } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { deleteUploadedFile } from "./admin.upload.js";
import { normalizeEquipmentTypeValue } from "../lib/equipment-type.js";

export const adminEquipmentRouter = Router();

// Всі маршрути захищені
adminEquipmentRouter.use(authMiddleware);

const pricingTypes = [
  "fixed_from",
  "hourly_from",
  "calculator",
  "tow_calculator",
  "material_delivery_calculator",
  "custom",
] as const;

const equipmentSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  brand: z.string().min(1),
  type: z.string().trim().min(1),
  description: z.string().min(1),
  pricingType: z.enum(pricingTypes).optional().default("hourly_from"),
  pricePerHour: z.number().positive(),
  fuelConsumptionPer100Km: z.number().min(0).nullable().optional(),
  fuelConsumptionPerEngineHour: z.number().min(0).nullable().optional(),
  isPopular: z.boolean().optional(),
  baseAddress: z.string().nullable().optional(),
  baseLatitude: z.number().nullable().optional(),
  baseLongitude: z.number().nullable().optional(),
  trackerDeviceId: z.string().nullable().optional(),
  specs: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  images: z.array(z.object({ url: z.string(), alt: z.string() })).optional(),
});

/** Helper: fetch equipment with relations */
async function getEquipmentWithRelations(id: string) {
  const { rows } = await pool.query(`SELECT * FROM "Equipment" WHERE "id" = $1`, [id]);
  if (rows.length === 0) return null;
  const eq = rows[0];
  const [specsRes, imagesRes, bpRes, trackerRes] = await Promise.all([
    pool.query(`SELECT * FROM "EquipmentSpec" WHERE "equipmentId" = $1`, [id]),
    loadEquipmentImages(id),
    pool.query(`SELECT * FROM "BookedPeriod" WHERE "equipmentId" = $1`, [id]),
    pool.query(`SELECT "id", "name", "lastAddress", "lastTrackerAt" FROM "TrackerDevice" WHERE "equipmentId" = $1 LIMIT 1`, [id]),
  ]);
  return {
    ...eq,
    specs: specsRes.rows,
    images: imagesRes.rows,
    bookedPeriods: bpRes.rows,
    trackerDevice: trackerRes.rows[0] ?? null,
  };
}

async function hasEquipmentImageSortOrder(db: Pick<PoolClient, "query">) {
  const { rows } = await db.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'EquipmentImage'
       AND column_name = 'sortOrder'
     LIMIT 1`,
  );
  return rows.length > 0;
}

async function loadEquipmentImages(equipmentId: string) {
  try {
    return await pool.query(
      `SELECT * FROM "EquipmentImage" WHERE "equipmentId" = $1 ORDER BY "sortOrder" ASC, "id" ASC`,
      [equipmentId],
    );
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42703") {
      return pool.query(
        `SELECT *, 0 AS "sortOrder" FROM "EquipmentImage" WHERE "equipmentId" = $1 ORDER BY "id" ASC`,
        [equipmentId],
      );
    }
    throw error;
  }
}

async function insertEquipmentImage(
  db: Pick<PoolClient, "query">,
  input: { url: string; alt: string; sortOrder: number; equipmentId: string },
) {
  if (await hasEquipmentImageSortOrder(db)) {
    await db.query(
      `INSERT INTO "EquipmentImage" ("url", "alt", "sortOrder", "equipmentId") VALUES ($1, $2, $3, $4)`,
      [input.url, input.alt, input.sortOrder, input.equipmentId],
    );
    return;
  }

  await db.query(
    `INSERT INTO "EquipmentImage" ("url", "alt", "equipmentId") VALUES ($1, $2, $3)`,
    [input.url, input.alt, input.equipmentId],
  );
}

async function syncTrackerDeviceLink(
  db: Pick<PoolClient, "query">,
  equipmentId: string,
  trackerDeviceId?: string | null,
) {
  await db.query(`UPDATE "TrackerDevice" SET "equipmentId" = NULL WHERE "equipmentId" = $1`, [equipmentId]);

  if (!trackerDeviceId) return;

  await db.query(`UPDATE "TrackerDevice" SET "equipmentId" = NULL WHERE "id" = $1`, [trackerDeviceId]);
  await db.query(`UPDATE "TrackerDevice" SET "equipmentId" = $1 WHERE "id" = $2`, [equipmentId, trackerDeviceId]);
}

async function ensureEquipmentTypeExists(db: Pick<PoolClient, "query">, type: string) {
  const normalized = normalizeEquipmentTypeValue(type);
  if (!normalized) return;

  await db.query(
    `INSERT INTO "EquipmentTypeCatalog" ("value") VALUES ($1) ON CONFLICT ("value") DO NOTHING`,
    [normalized],
  );
}

adminEquipmentRouter.get("/types", async (_req, res) => {
  try {
    const { rows } = await pool.query<{ value: string }>(
      `SELECT "value" FROM "EquipmentTypeCatalog" ORDER BY "value" ASC`,
    );
    res.json(rows.map((row) => row.value));
  } catch (e) {
    logError("GET /api/admin/equipment/types error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

adminEquipmentRouter.get("/", async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT "id" FROM "Equipment" ORDER BY "createdAt" DESC`);
    const items = await Promise.all(rows.map((row: { id: string }) => getEquipmentWithRelations(row.id)));
    res.json(items.filter(Boolean));
  } catch (e) {
    logError("GET /api/admin/equipment error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Створити техніку */
adminEquipmentRouter.post("/", validate(equipmentSchema), async (req, res) => {
  const client = await pool.connect();
  try {
    const { specs, images, trackerDeviceId, ...data } = req.body;
    const normalizedType = normalizeEquipmentTypeValue(data.type);

    await client.query("BEGIN");

    const { rows } = await client.query(
      `INSERT INTO "Equipment" (
         "slug",
         "name",
         "brand",
         "type",
         "description",
         "pricingType",
         "pricePerHour",
         "fuelConsumptionPer100Km",
         "fuelConsumptionPerEngineHour",
         "isPopular",
         "baseAddress",
         "baseLatitude",
         "baseLongitude",
         "updatedAt"
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW()) RETURNING *`,
      [
        data.slug,
        data.name,
        data.brand,
        normalizedType,
        data.description,
        data.pricingType ?? "hourly_from",
        data.pricePerHour,
        data.fuelConsumptionPer100Km ?? null,
        data.fuelConsumptionPerEngineHour ?? null,
        data.isPopular ?? false,
        data.baseAddress ?? null,
        data.baseLatitude ?? null,
        data.baseLongitude ?? null,
      ],
    );
    const eqId = rows[0].id;
    await ensureEquipmentTypeExists(client, normalizedType);

    if (specs && specs.length > 0) {
      for (const s of specs) {
        await client.query(
          `INSERT INTO "EquipmentSpec" ("label", "value", "equipmentId") VALUES ($1, $2, $3)`,
          [s.label, s.value, eqId],
        );
      }
    }
    if (images && images.length > 0) {
      for (const [index, img] of images.entries()) {
        await insertEquipmentImage(client, {
          url: img.url,
          alt: img.alt,
          sortOrder: index,
          equipmentId: eqId,
        });
      }
    }

    await syncTrackerDeviceLink(client, eqId, trackerDeviceId);
    await client.query("COMMIT");

    const item = await getEquipmentWithRelations(eqId);
    res.status(201).json(item);
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    logError("POST /api/admin/equipment error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});

/** Оновити техніку */
adminEquipmentRouter.put("/:id", validate(equipmentSchema.partial()), async (req, res) => {
  const client = await pool.connect();
  const filesToDeleteAfterCommit: string[] = [];
  try {
    const { specs, images, trackerDeviceId, ...data } = req.body;
    const id = req.params.id as string;
    const normalizedData = {
      ...data,
      ...(data.type ? { type: normalizeEquipmentTypeValue(data.type) } : {}),
    };

    await client.query("BEGIN");

    // Build dynamic UPDATE
    const setClauses: string[] = [`"updatedAt" = NOW()`];
    const params: any[] = [];
    let idx = 1;
    for (const [key, value] of Object.entries(normalizedData)) {
      setClauses.push(`"${key}" = $${idx}`);
      params.push(value);
      idx++;
    }
    params.push(id);
    const updatedEquipmentRes = await client.query(
      `UPDATE "Equipment" SET ${setClauses.join(", ")} WHERE "id" = $${idx}`,
      params,
    );
    if (updatedEquipmentRes.rowCount === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Техніку не знайдено" });
      return;
    }
    if (normalizedData.type) {
      await ensureEquipmentTypeExists(client, normalizedData.type);
    }

    // Оновити specs якщо передано
    if (specs) {
      await client.query(`DELETE FROM "EquipmentSpec" WHERE "equipmentId" = $1`, [id]);
      for (const s of specs) {
        await client.query(
          `INSERT INTO "EquipmentSpec" ("label", "value", "equipmentId") VALUES ($1, $2, $3)`,
          [s.label, s.value, id],
        );
      }
    }

    // Оновити images якщо передано
    if (images) {
      const oldImages = await client.query(`SELECT "url" FROM "EquipmentImage" WHERE "equipmentId" = $1`, [id]);
      const newUrls = new Set(images.map((img: { url: string }) => img.url));
      for (const old of oldImages.rows) {
        if (!newUrls.has(old.url)) {
          filesToDeleteAfterCommit.push(old.url);
        }
      }
      await client.query(`DELETE FROM "EquipmentImage" WHERE "equipmentId" = $1`, [id]);
      for (const [index, img] of images.entries()) {
        await insertEquipmentImage(client, {
          url: img.url,
          alt: img.alt,
          sortOrder: index,
          equipmentId: id,
        });
      }
    }

    if (trackerDeviceId !== undefined) {
      await syncTrackerDeviceLink(client, id, trackerDeviceId);
    }

    await client.query("COMMIT");

    for (const url of filesToDeleteAfterCommit) {
      deleteUploadedFile(url);
    }

    const updated = await getEquipmentWithRelations(id);
    res.json(updated);
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    logError("PUT /api/admin/equipment/:id error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});

/** Видалити техніку */
adminEquipmentRouter.delete("/:id", async (req, res) => {
  const client = await pool.connect();
  const filesToDeleteAfterCommit: string[] = [];
  try {
    const id = req.params.id as string;
    // Delete image files from disk before removing DB records
    await client.query("BEGIN");
    const { rows: images } = await client.query(`SELECT "url" FROM "EquipmentImage" WHERE "equipmentId" = $1`, [id]);
    for (const img of images) {
      filesToDeleteAfterCommit.push(img.url);
    }
    await client.query(`UPDATE "TrackerDevice" SET "equipmentId" = NULL WHERE "equipmentId" = $1`, [id]);
    await client.query(`DELETE FROM "Equipment" WHERE "id" = $1`, [id]);
    await client.query("COMMIT");

    for (const url of filesToDeleteAfterCommit) {
      deleteUploadedFile(url);
    }

    res.json({ success: true });
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    logError("DELETE /api/admin/equipment/:id error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});
