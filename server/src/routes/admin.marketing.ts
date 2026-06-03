import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { logError } from "../lib/logger.js";
import {
  createTrackingLink,
  getMarketingDestinationOptions,
  getMarketingSummary,
  listTrackingLinks,
  setTrackingLinkStatus,
  updateTrackingLink,
} from "../lib/marketing-attribution.repository.js";

export const adminMarketingRouter = Router();
adminMarketingRouter.use(authMiddleware);

const linkSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional().or(z.literal("")),
  destinationPath: z.string().trim().min(1),
  utmSource: z.string().optional().or(z.literal("")),
  utmMedium: z.string().optional().or(z.literal("")),
  utmCampaign: z.string().optional().or(z.literal("")),
  utmContent: z.string().optional().or(z.literal("")),
  utmTerm: z.string().optional().or(z.literal("")),
});

const statusSchema = z.object({
  isActive: z.boolean(),
});

adminMarketingRouter.get("/links", async (_req, res) => {
  try {
    const source = typeof _req.query.source === "string" ? _req.query.source.trim() : "";
    const status = typeof _req.query.status === "string" ? _req.query.status : "all";
    const period = typeof _req.query.period === "string" ? Number(_req.query.period) : NaN;
    const links = await listTrackingLinks({
      source: source || null,
      isActive: status === "active" ? true : status === "inactive" ? false : null,
      periodDays: Number.isFinite(period) && period > 0 ? period : null,
    });
    res.json(links);
  } catch (error) {
    logError("GET /api/admin/marketing/links error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

adminMarketingRouter.get("/summary", async (_req, res) => {
  try {
    const source = typeof _req.query.source === "string" ? _req.query.source.trim() : "";
    const from = typeof _req.query.from === "string" ? _req.query.from.trim() : "";
    const to = typeof _req.query.to === "string" ? _req.query.to.trim() : "";
    const period = typeof _req.query.period === "string" ? Number(_req.query.period) : NaN;
    const summary = await getMarketingSummary({
      source: source || null,
      from: from || null,
      to: to || null,
      periodDays: Number.isFinite(period) && period > 0 ? period : null,
    });
    res.json(summary);
  } catch (error) {
    logError("GET /api/admin/marketing/summary error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

adminMarketingRouter.get("/options", async (_req, res) => {
  try {
    const options = await getMarketingDestinationOptions();
    res.json(options);
  } catch (error) {
    logError("GET /api/admin/marketing/options error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

adminMarketingRouter.post("/links", validate(linkSchema), async (req, res) => {
  try {
    const link = await createTrackingLink(req.body);
    const links = await listTrackingLinks();
    const created = links.find((item) => item.id === link.id) ?? link;
    res.status(201).json(created);
  } catch (error) {
    logError("POST /api/admin/marketing/links error:", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Не вдалося створити посилання" });
  }
});

adminMarketingRouter.put("/links/:id", validate(linkSchema), async (req, res) => {
  try {
    const id = String(req.params.id ?? "");
    const link = await updateTrackingLink(id, req.body);
    if (!link) {
      res.status(404).json({ error: "Посилання не знайдено" });
      return;
    }
    const links = await listTrackingLinks();
    const updated = links.find((item) => item.id === link.id) ?? link;
    res.json(updated);
  } catch (error) {
    logError("PUT /api/admin/marketing/links/:id error:", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Не вдалося оновити посилання" });
  }
});

adminMarketingRouter.patch("/links/:id/status", validate(statusSchema), async (req, res) => {
  try {
    const id = String(req.params.id ?? "");
    const link = await setTrackingLinkStatus(id, req.body.isActive as boolean);
    if (!link) {
      res.status(404).json({ error: "Посилання не знайдено" });
      return;
    }
    const links = await listTrackingLinks();
    const updated = links.find((item) => item.id === link.id) ?? link;
    res.json(updated);
  } catch (error) {
    logError("PATCH /api/admin/marketing/links/:id/status error:", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Не вдалося змінити статус" });
  }
});
