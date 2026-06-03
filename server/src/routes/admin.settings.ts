import { Router } from "express";
import { z } from "zod";
import { pool } from "../lib/db.js";
import { logError } from "../lib/logger.js";
import { authMiddleware } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const DEFAULT_HERO_IMAGE =
  "https://images.unsplash.com/photo-1695795692564-586c6ab80a69?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920";

const homepageSettingsSchema = z.object({
  heroImage: z.string().trim().min(1),
});

export const adminSettingsRouter = Router();
adminSettingsRouter.use(authMiddleware);

adminSettingsRouter.get("/homepage", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT "value" FROM "SiteSetting" WHERE "key" = 'homepage' LIMIT 1`,
    );
    const value = rows[0]?.value && typeof rows[0].value === "object" ? rows[0].value : {};
    res.json({
      heroImage: typeof value.heroImage === "string" && value.heroImage.trim()
        ? value.heroImage
        : DEFAULT_HERO_IMAGE,
    });
  } catch (error) {
    logError("GET /api/admin/settings/homepage error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

adminSettingsRouter.put("/homepage", validate(homepageSettingsSchema), async (req, res) => {
  try {
    const value = { heroImage: req.body.heroImage };
    const { rows } = await pool.query(
      `INSERT INTO "SiteSetting" ("key", "value", "updatedAt")
       VALUES ('homepage', $1, NOW())
       ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = NOW()
       RETURNING "value"`,
      [JSON.stringify(value)],
    );
    res.json(rows[0].value);
  } catch (error) {
    logError("PUT /api/admin/settings/homepage error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});
