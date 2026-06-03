import { logError } from "../lib/logger.js";
import { Router } from "express";
import { pool } from "../lib/db.js";

export const equipmentRouter = Router();

/** Helper: attach specs, images, bookedPeriods to equipment rows */
async function attachRelations(items: any[]) {
  if (items.length === 0) return items;
  const ids = items.map((i) => i.id);

  const [specsRes, imagesRes, bpRes] = await Promise.all([
    pool.query(`SELECT * FROM "EquipmentSpec" WHERE "equipmentId" = ANY($1)`, [ids]),
    loadEquipmentImages(ids),
    pool.query(`SELECT * FROM "BookedPeriod" WHERE "equipmentId" = ANY($1)`, [ids]),
  ]);

  const specsMap = new Map<string, any[]>();
  for (const s of specsRes.rows) {
    if (!specsMap.has(s.equipmentId)) specsMap.set(s.equipmentId, []);
    specsMap.get(s.equipmentId)!.push(s);
  }
  const imagesMap = new Map<string, any[]>();
  for (const img of imagesRes.rows) {
    if (!imagesMap.has(img.equipmentId)) imagesMap.set(img.equipmentId, []);
    imagesMap.get(img.equipmentId)!.push(img);
  }
  const bpMap = new Map<string, any[]>();
  for (const bp of bpRes.rows) {
    if (!bpMap.has(bp.equipmentId)) bpMap.set(bp.equipmentId, []);
    bpMap.get(bp.equipmentId)!.push(bp);
  }

  return items.map((item) => ({
    ...item,
    specs: specsMap.get(item.id) || [],
    images: imagesMap.get(item.id) || [],
    bookedPeriods: bpMap.get(item.id) || [],
  }));
}

async function loadEquipmentImages(ids: string[]) {
  try {
    return await pool.query(
      `SELECT * FROM "EquipmentImage" WHERE "equipmentId" = ANY($1) ORDER BY "sortOrder" ASC, "id" ASC`,
      [ids],
    );
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42703") {
      return pool.query(
        `SELECT *, 0 AS "sortOrder" FROM "EquipmentImage" WHERE "equipmentId" = ANY($1) ORDER BY "id" ASC`,
        [ids],
      );
    }
    throw error;
  }
}

/** Отримати унікальні бренди (ПЕРЕД /:slug!) */
equipmentRouter.get("/meta/brands", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT "brand" FROM "Equipment" ORDER BY "brand" ASC`,
    );
    res.json(rows.map((b: { brand: string }) => b.brand));
  } catch (e) {
    logError("GET /api/equipment/meta/brands error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Отримати наявні типи техніки (ПЕРЕД /:slug!) */
equipmentRouter.get("/meta/types", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT "type" FROM "Equipment" ORDER BY "type" ASC`,
    );
    res.json(rows.map((t: { type: string }) => t.type));
  } catch (e) {
    logError("GET /api/equipment/meta/types error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Список техніки (з фільтрами) */
equipmentRouter.get("/", async (req, res) => {
  try {
    const { type, brand, popular, sort } = req.query;

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (type && type !== "all") {
      const types = (type as string).split(",").map((t) => t.trim()).filter(Boolean);
      if (types.length > 1) {
        conditions.push(`"type" = ANY($${idx})`);
        params.push(types);
        idx++;
      } else {
        conditions.push(`"type" = $${idx}`);
        params.push(types[0]);
        idx++;
      }
    }
    if (brand && brand !== "all") {
      conditions.push(`"brand" = $${idx}`);
      params.push(brand);
      idx++;
    }
    if (popular === "true") {
      conditions.push(`"isPopular" = true`);
    }

    let orderBy = `"createdAt" DESC`;
    if (sort === "price-asc") orderBy = `"pricePerHour" ASC`;
    else if (sort === "price-desc") orderBy = `"pricePerHour" DESC`;
    else if (sort === "name") orderBy = `"name" ASC`;

    const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
    const { rows } = await pool.query(
      `SELECT * FROM "Equipment" ${where} ORDER BY ${orderBy}`,
      params,
    );

    const items = await attachRelations(rows);
    res.json(items);
  } catch (e) {
    logError("GET /api/equipment error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Отримати одиницю техніки за slug */
equipmentRouter.get("/:slug", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM "Equipment" WHERE "slug" = $1`,
      [req.params.slug],
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Техніку не знайдено" });
      return;
    }

    const [item] = await attachRelations(rows);
    res.json(item);
  } catch (e) {
    logError("GET /api/equipment/:slug error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});
