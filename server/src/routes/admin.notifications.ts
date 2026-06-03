import { Router } from "express";
import { z } from "zod";
import { logError } from "../lib/logger.js";
import {
  getNotificationDefinitionPayload,
  getNotificationTemplate,
  listNotificationTemplates,
  previewNotificationTemplate,
  resetNotificationTemplate,
  updateNotificationTemplate,
} from "../lib/notification-service.js";
import { authMiddleware, type AuthRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

export const adminNotificationsRouter = Router();

adminNotificationsRouter.use(authMiddleware);

const listSchema = z.object({
  channel: z.string().trim().optional(),
  category: z.string().trim().optional(),
  status: z.enum(["enabled", "disabled"]).optional(),
  search: z.string().trim().optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(1, "Назва шаблону обов'язкова"),
  isEnabled: z.boolean(),
  bodyTemplate: z.string().min(1, "Текст шаблону обов'язковий"),
  notes: z.string().trim().optional().nullable(),
});

const previewSchema = z.object({
  bodyTemplate: z.string().optional(),
});

const serviceSlugQuerySchema = z.object({
  serviceSlug: z.string().trim().optional(),
});

function readServiceSlug(query: unknown) {
  return serviceSlugQuerySchema.parse(query).serviceSlug || null;
}

adminNotificationsRouter.get("/templates", async (req, res) => {
  try {
    const parsed = listSchema.parse(req.query);
    const templates = await listNotificationTemplates(parsed);
    res.json(templates);
  } catch (error) {
    logError("GET /api/admin/notifications/templates error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

adminNotificationsRouter.get("/templates/:key", async (req, res) => {
  try {
    const template = await getNotificationTemplate(req.params.key, readServiceSlug(req.query));
    if (!template) {
      res.status(404).json({ error: "Шаблон не знайдено" });
      return;
    }
    res.json(template);
  } catch (error) {
    logError("GET /api/admin/notifications/templates/:key error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

adminNotificationsRouter.get("/templates/:key/variables", async (req, res) => {
  try {
    res.json(getNotificationDefinitionPayload(req.params.key).variables);
  } catch (error) {
    logError("GET /api/admin/notifications/templates/:key/variables error:", error);
    res.status(404).json({ error: "Шаблон не знайдено" });
  }
});

adminNotificationsRouter.put(
  "/templates/:key",
  validate(updateSchema),
  async (req: AuthRequest, res) => {
    try {
      const result = await updateNotificationTemplate(
        String(req.params.key),
        req.body,
        req.adminId ?? null,
        readServiceSlug(req.query),
      );
      if (result.error) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.json(result.template);
    } catch (error) {
      logError("PUT /api/admin/notifications/templates/:key error:", error);
      res.status(500).json({ error: "Помилка сервера" });
    }
  },
);

adminNotificationsRouter.post("/templates/:key/reset", async (req: AuthRequest, res) => {
  try {
    const template = await resetNotificationTemplate(String(req.params.key), req.adminId ?? null, readServiceSlug(req.query));
    res.json(template);
  } catch (error) {
    logError("POST /api/admin/notifications/templates/:key/reset error:", error);
    res.status(404).json({ error: "Шаблон не знайдено" });
  }
});

adminNotificationsRouter.post(
  "/templates/:key/preview",
  validate(previewSchema),
  async (req, res) => {
    try {
      const preview = await previewNotificationTemplate(
        String(req.params.key),
        req.body.bodyTemplate,
        readServiceSlug(req.query),
      );
      res.json(preview);
    } catch (error) {
      logError("POST /api/admin/notifications/templates/:key/preview error:", error);
      res.status(404).json({ error: "Шаблон не знайдено" });
    }
  },
);
