import { Router } from "express";
import { pool } from "../lib/db.js";
import { logError } from "../lib/logger.js";

export const settingsRouter = Router();

settingsRouter.get("/homepage", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT "value" FROM "SiteSetting" WHERE "key" = 'homepage' LIMIT 1`,
    );
    const value = rows[0]?.value && typeof rows[0].value === "object" ? rows[0].value : {};
    res.json({
      heroImage: typeof value.heroImage === "string" && value.heroImage.trim()
        ? value.heroImage
        : "",
    });
  } catch (error) {
    logError("GET /api/settings/homepage error:", error);
    res.json({ heroImage: "" });
  }
});
