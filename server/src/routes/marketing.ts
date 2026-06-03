import { Router } from "express";
import { z } from "zod";
import { logError } from "../lib/logger.js";
import {
  buildRedirectDestination,
  getTrackingLinkByCode,
  recordMarketingVisit,
  recordTrackingClick,
} from "../lib/marketing-attribution.repository.js";

export const marketingRouter = Router();

const visitSchema = z.object({
  sessionKey: z.string().trim().min(1).max(120),
  attribution: z.object({
    firstTouch: z.record(z.any()).nullable().optional(),
    lastTouch: z.record(z.any()).nullable().optional(),
    formPage: z.string().nullable().optional(),
  }).nullable().optional(),
  landingPage: z.string().trim().min(1).max(1000).optional(),
});

marketingRouter.get("/go/:code", async (req, res) => {
  try {
    const code = String(req.params.code || "").trim();
    if (!code) {
      res.redirect(302, "/");
      return;
    }

    const link = await getTrackingLinkByCode(code);
    if (!link) {
      res.redirect(302, "/");
      return;
    }

    const destination = buildRedirectDestination(link);
    try {
      await recordTrackingClick({
        trackingLinkId: link.id,
        code: link.code,
        referrer: req.get("referer") ?? null,
        landingUrl: destination,
        userAgent: req.get("user-agent") ?? null,
        ip: req.ip,
      });
    } catch (error) {
      logError("recordTrackingClick error:", error);
    }

    res.redirect(302, destination);
  } catch (error) {
    logError("GET /go/:code error:", error);
    res.redirect(302, "/");
  }
});

marketingRouter.post("/api/marketing/visit", async (req, res) => {
  try {
    const parsed = visitSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Некоректні дані переходу" });
      return;
    }

    const trackingCode =
      parsed.data.attribution?.lastTouch?.trackingCode ??
      parsed.data.attribution?.firstTouch?.trackingCode ??
      null;

    if (trackingCode) {
      res.status(204).end();
      return;
    }

    await recordMarketingVisit({
      sessionKey: parsed.data.sessionKey,
      attribution: parsed.data.attribution ?? null,
      landingPage: parsed.data.landingPage ?? null,
      referrer: req.get("referer") ?? null,
      userAgent: req.get("user-agent") ?? null,
      ip: req.ip,
    });

    res.status(204).end();
  } catch (error) {
    logError("POST /api/marketing/visit error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});
