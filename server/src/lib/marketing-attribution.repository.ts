import { createHash, randomBytes } from "crypto";
import type { PoolClient } from "pg";
import { pool } from "./db.js";
import {
  normalizeAttribution,
  resolveTrafficSource,
  type LeadAttributionInput,
  type NormalizedLeadAttribution,
  type NormalizedAttributionTouch,
} from "./attribution.js";

function makeId() {
  return randomBytes(16).toString("hex");
}

function parseTimestamp(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function normalizeTimestampOutput(value: unknown) {
  if (typeof value === "string") {
    return parseTimestamp(value) ?? value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return null;
}

function trimBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function getLandingSiteUrl() {
  return trimBaseUrl(
    process.env.SITE_URL?.trim() ||
    process.env.CLIENT_URL?.trim() ||
    "http://localhost:5173",
  );
}

function getTrackingEntryUrl() {
  const explicit = process.env.TRACKING_BASE_URL?.trim();
  if (explicit) {
    return trimBaseUrl(explicit);
  }

  const siteUrl = process.env.SITE_URL?.trim();
  if (siteUrl) {
    return trimBaseUrl(siteUrl);
  }

  const clientUrl = process.env.CLIENT_URL?.trim();
  if (clientUrl) {
    try {
      const url = new URL(clientUrl);
      const isLocalHost = ["localhost", "127.0.0.1"].includes(url.hostname);
      if (isLocalHost) {
        const backendPort = process.env.PORT?.trim() || "3001";
        return `${url.protocol}//${url.hostname}:${backendPort}`;
      }
      return trimBaseUrl(clientUrl);
    } catch {
      // fall through
    }
  }

  return "http://localhost:3001";
}

export function buildTrackingLinkUrl(code: string) {
  return `${getTrackingEntryUrl()}/go/${encodeURIComponent(code)}`;
}

export interface AttributionView {
  trafficSource: string | null;
  trackingCode: string | null;
  trackingLinkId: string | null;
  trackingLinkName: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  referrer: string | null;
  landingPage: string | null;
  formPage: string | null;
  createdAt: string | null;
  firstTouch: NormalizedAttributionTouch | null;
  lastTouch: NormalizedAttributionTouch | null;
}

export interface TrackingLinkListFilters {
  source?: string | null;
  isActive?: boolean | null;
  periodDays?: number | null;
}

export interface MarketingSummaryFilters {
  from?: string | null;
  to?: string | null;
  source?: string | null;
  periodDays?: number | null;
}

export interface MarketingSummaryRow {
  source: string;
  leads: number;
}

export interface MarketingCampaignSummaryRow {
  campaign: string;
  leads: number;
}

export interface MarketingSummary {
  clicks: number;
  trackedClicks: number;
  directVisits: number;
  leads: number;
  conversionRate: number;
  topSource: string | null;
  sources: MarketingSummaryRow[];
  campaigns: MarketingCampaignSummaryRow[];
}

export function buildRedirectDestination(row: {
  destinationPath: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  code: string;
}) {
  const base = getLandingSiteUrl();
  const url = new URL(row.destinationPath, `${base}/`);
  if (url.origin !== new URL(base).origin) {
    throw new Error("Invalid destination origin");
  }

  const params = url.searchParams;
  if (row.utmSource) params.set("utm_source", row.utmSource);
  if (row.utmMedium) params.set("utm_medium", row.utmMedium);
  if (row.utmCampaign) params.set("utm_campaign", row.utmCampaign);
  if (row.utmContent) params.set("utm_content", row.utmContent);
  if (row.utmTerm) params.set("utm_term", row.utmTerm);
  params.set("trid", row.code);
  return url.toString();
}

export async function createCustomerRequestAttribution(input: {
  customerRequestId?: string | null;
  legacyOrderId?: string | null;
  legacyServiceRequestId?: string | null;
  attribution?: LeadAttributionInput | null;
}) {
  const normalized = normalizeAttribution(input.attribution);
  if (!normalized) return null;

  const trackingCode =
    normalized.lastTouch?.trackingCode ??
    normalized.firstTouch?.trackingCode ??
    null;

  const trackingLinkRes = trackingCode
    ? await pool.query(
        `SELECT "id" FROM "MarketingTrackingLink"
         WHERE "code" = $1 AND "isActive" = true
         LIMIT 1`,
        [trackingCode],
      )
    : { rows: [] };

  const trackingLinkId = (trackingLinkRes.rows[0]?.id as string | undefined) ?? null;
  const trafficSource = resolveTrafficSource(normalized);

  await pool.query(
    `INSERT INTO "CustomerRequestAttribution" (
      "id",
      "customerRequestId",
      "legacyOrderId",
      "legacyServiceRequestId",
      "trafficSource",
      "trackingCode",
      "trackingLinkId",
      "firstUtmSource",
      "firstUtmMedium",
      "firstUtmCampaign",
      "firstUtmContent",
      "firstUtmTerm",
      "firstGclid",
      "firstFbclid",
      "firstTtclid",
      "firstReferrer",
      "firstLandingPage",
      "firstCapturedAt",
      "lastUtmSource",
      "lastUtmMedium",
      "lastUtmCampaign",
      "lastUtmContent",
      "lastUtmTerm",
      "lastGclid",
      "lastFbclid",
      "lastTtclid",
      "lastReferrer",
      "lastLandingPage",
      "lastCapturedAt",
      "formPage"
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
      $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30
    )`,
    [
      makeId(),
      input.customerRequestId ?? null,
      input.legacyOrderId ?? null,
      input.legacyServiceRequestId ?? null,
      trafficSource,
      trackingCode,
      trackingLinkId,
      normalized.firstTouch?.utmSource ?? null,
      normalized.firstTouch?.utmMedium ?? null,
      normalized.firstTouch?.utmCampaign ?? null,
      normalized.firstTouch?.utmContent ?? null,
      normalized.firstTouch?.utmTerm ?? null,
      normalized.firstTouch?.gclid ?? null,
      normalized.firstTouch?.fbclid ?? null,
      normalized.firstTouch?.ttclid ?? null,
      normalized.firstTouch?.referrer ?? null,
      normalized.firstTouch?.landingPage ?? null,
      parseTimestamp(normalized.firstTouch?.capturedAt ?? null),
      normalized.lastTouch?.utmSource ?? null,
      normalized.lastTouch?.utmMedium ?? null,
      normalized.lastTouch?.utmCampaign ?? null,
      normalized.lastTouch?.utmContent ?? null,
      normalized.lastTouch?.utmTerm ?? null,
      normalized.lastTouch?.gclid ?? null,
      normalized.lastTouch?.fbclid ?? null,
      normalized.lastTouch?.ttclid ?? null,
      normalized.lastTouch?.referrer ?? null,
      normalized.lastTouch?.landingPage ?? null,
      parseTimestamp(normalized.lastTouch?.capturedAt ?? null),
      normalized.formPage ?? null,
    ],
  );

  return { trafficSource, trackingCode, trackingLinkId };
}

export function buildAttributionViewFromRow(row: Record<string, unknown> | null | undefined): AttributionView | null {
  if (!row) return null;

  return {
    trafficSource: typeof row.trafficSource === "string" ? row.trafficSource : null,
    trackingCode: typeof row.trackingCode === "string" ? row.trackingCode : null,
    trackingLinkId: typeof row.trackingLinkId === "string" ? row.trackingLinkId : null,
    trackingLinkName: typeof row.trackingLinkName === "string" ? row.trackingLinkName : null,
    utmSource:
      typeof row.lastUtmSource === "string"
        ? row.lastUtmSource
        : typeof row.firstUtmSource === "string"
          ? row.firstUtmSource
          : null,
    utmMedium:
      typeof row.lastUtmMedium === "string"
        ? row.lastUtmMedium
        : typeof row.firstUtmMedium === "string"
          ? row.firstUtmMedium
          : null,
    utmCampaign:
      typeof row.lastUtmCampaign === "string"
        ? row.lastUtmCampaign
        : typeof row.firstUtmCampaign === "string"
          ? row.firstUtmCampaign
          : null,
    utmContent:
      typeof row.lastUtmContent === "string"
        ? row.lastUtmContent
        : typeof row.firstUtmContent === "string"
          ? row.firstUtmContent
          : null,
    utmTerm:
      typeof row.lastUtmTerm === "string"
        ? row.lastUtmTerm
        : typeof row.firstUtmTerm === "string"
          ? row.firstUtmTerm
          : null,
    referrer:
      typeof row.lastReferrer === "string"
        ? row.lastReferrer
        : typeof row.firstReferrer === "string"
          ? row.firstReferrer
          : null,
    landingPage:
      typeof row.lastLandingPage === "string"
        ? row.lastLandingPage
        : typeof row.firstLandingPage === "string"
          ? row.firstLandingPage
          : null,
    formPage: typeof row.formPage === "string" ? row.formPage : null,
    createdAt: normalizeTimestampOutput(row.createdAt),
    firstTouch: {
      utmSource: typeof row.firstUtmSource === "string" ? row.firstUtmSource : null,
      utmMedium: typeof row.firstUtmMedium === "string" ? row.firstUtmMedium : null,
      utmCampaign: typeof row.firstUtmCampaign === "string" ? row.firstUtmCampaign : null,
      utmContent: typeof row.firstUtmContent === "string" ? row.firstUtmContent : null,
      utmTerm: typeof row.firstUtmTerm === "string" ? row.firstUtmTerm : null,
      gclid: typeof row.firstGclid === "string" ? row.firstGclid : null,
      fbclid: typeof row.firstFbclid === "string" ? row.firstFbclid : null,
      ttclid: typeof row.firstTtclid === "string" ? row.firstTtclid : null,
      trackingCode: typeof row.trackingCode === "string" ? row.trackingCode : null,
      referrer: typeof row.firstReferrer === "string" ? row.firstReferrer : null,
      landingPage: typeof row.firstLandingPage === "string" ? row.firstLandingPage : null,
      capturedAt: normalizeTimestampOutput(row.firstCapturedAt),
    },
    lastTouch: {
      utmSource: typeof row.lastUtmSource === "string" ? row.lastUtmSource : null,
      utmMedium: typeof row.lastUtmMedium === "string" ? row.lastUtmMedium : null,
      utmCampaign: typeof row.lastUtmCampaign === "string" ? row.lastUtmCampaign : null,
      utmContent: typeof row.lastUtmContent === "string" ? row.lastUtmContent : null,
      utmTerm: typeof row.lastUtmTerm === "string" ? row.lastUtmTerm : null,
      gclid: typeof row.lastGclid === "string" ? row.lastGclid : null,
      fbclid: typeof row.lastFbclid === "string" ? row.lastFbclid : null,
      ttclid: typeof row.lastTtclid === "string" ? row.lastTtclid : null,
      trackingCode: typeof row.trackingCode === "string" ? row.trackingCode : null,
      referrer: typeof row.lastReferrer === "string" ? row.lastReferrer : null,
      landingPage: typeof row.lastLandingPage === "string" ? row.lastLandingPage : null,
      capturedAt: normalizeTimestampOutput(row.lastCapturedAt),
    },
  };
}

export function buildAttributionViewFromInput(input?: LeadAttributionInput | NormalizedLeadAttribution | null): AttributionView | null {
  const normalized = normalizeAttribution(input as LeadAttributionInput | null);
  if (!normalized) return null;

  return {
    trafficSource: resolveTrafficSource(normalized),
    trackingCode: normalized.lastTouch?.trackingCode ?? normalized.firstTouch?.trackingCode ?? null,
    trackingLinkId: null,
    trackingLinkName: null,
    utmSource: normalized.lastTouch?.utmSource ?? normalized.firstTouch?.utmSource ?? null,
    utmMedium: normalized.lastTouch?.utmMedium ?? normalized.firstTouch?.utmMedium ?? null,
    utmCampaign: normalized.lastTouch?.utmCampaign ?? normalized.firstTouch?.utmCampaign ?? null,
    utmContent: normalized.lastTouch?.utmContent ?? normalized.firstTouch?.utmContent ?? null,
    utmTerm: normalized.lastTouch?.utmTerm ?? normalized.firstTouch?.utmTerm ?? null,
    referrer: normalized.lastTouch?.referrer ?? normalized.firstTouch?.referrer ?? null,
    landingPage: normalized.lastTouch?.landingPage ?? normalized.firstTouch?.landingPage ?? null,
    formPage: normalized.formPage ?? null,
    createdAt: normalized.lastTouch?.capturedAt ?? normalized.firstTouch?.capturedAt ?? null,
    firstTouch: normalized.firstTouch,
    lastTouch: normalized.lastTouch,
  };
}

function sanitizeDestinationPath(value: string) {
  const trimmed = value.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.toLowerCase().startsWith("/javascript:")
  ) {
    throw new Error("Шлях повинен бути внутрішнім і починатися з /");
  }
  return trimmed.slice(0, 500);
}

function cleanValue(value: string | null | undefined, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function slugifyCodePart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9а-яіїєґ]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "link";
}

export async function generateUniqueTrackingCode(base: string) {
  const normalizedBase = slugifyCodePart(base);
  let candidate = normalizedBase;
  let suffix = 1;

  while (true) {
    const existing = await pool.query(
      `SELECT 1 FROM "MarketingTrackingLink" WHERE "code" = $1 LIMIT 1`,
      [candidate],
    );
    if (existing.rowCount === 0) {
      return candidate;
    }
    suffix += 1;
    candidate = `${normalizedBase}-${suffix}`;
  }
}

export async function createTrackingLink(input: {
  name: string;
  description?: string | null;
  destinationPath: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
}) {
  const name = cleanValue(input.name, 200);
  if (!name) throw new Error("Назва обов'язкова");
  const destinationPath = sanitizeDestinationPath(input.destinationPath);
  const code = await generateUniqueTrackingCode(
    [input.utmSource, input.utmCampaign, name].filter(Boolean).join("-"),
  );

  const { rows } = await pool.query(
    `INSERT INTO "MarketingTrackingLink" (
      "id","code","name","description","destinationPath","utmSource","utmMedium","utmCampaign","utmContent","utmTerm","isActive","createdAt","updatedAt"
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,NOW(),NOW())
    RETURNING *`,
    [
      makeId(),
      code,
      name,
      cleanValue(input.description, 500),
      destinationPath,
      cleanValue(input.utmSource, 120),
      cleanValue(input.utmMedium, 120),
      cleanValue(input.utmCampaign, 160),
      cleanValue(input.utmContent, 160),
      cleanValue(input.utmTerm, 160),
    ],
  );
  return rows[0];
}

export async function updateTrackingLink(id: string, input: {
  name: string;
  description?: string | null;
  destinationPath: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
}) {
  const name = cleanValue(input.name, 200);
  if (!name) throw new Error("Назва обов'язкова");
  const destinationPath = sanitizeDestinationPath(input.destinationPath);

  const { rows } = await pool.query(
    `UPDATE "MarketingTrackingLink"
     SET "name" = $2,
         "description" = $3,
         "destinationPath" = $4,
         "utmSource" = $5,
         "utmMedium" = $6,
         "utmCampaign" = $7,
         "utmContent" = $8,
         "utmTerm" = $9,
         "updatedAt" = NOW()
     WHERE "id" = $1
     RETURNING *`,
    [
      id,
      name,
      cleanValue(input.description, 500),
      destinationPath,
      cleanValue(input.utmSource, 120),
      cleanValue(input.utmMedium, 120),
      cleanValue(input.utmCampaign, 160),
      cleanValue(input.utmContent, 160),
      cleanValue(input.utmTerm, 160),
    ],
  );
  return rows[0] ?? null;
}

export async function setTrackingLinkStatus(id: string, isActive: boolean) {
  const { rows } = await pool.query(
    `UPDATE "MarketingTrackingLink"
     SET "isActive" = $2, "updatedAt" = NOW()
     WHERE "id" = $1
     RETURNING *`,
    [id, isActive],
  );
  return rows[0] ?? null;
}

export async function listTrackingLinks(filters: TrackingLinkListFilters = {}) {
  const whereClauses = ["1=1"];
  const params: Array<string | boolean> = [];
  let clickFilter = "TRUE";
  let leadFilter = "TRUE";

  if (filters.source) {
    params.push(filters.source);
    whereClauses.push(`COALESCE(l."utmSource",'') = $${params.length}`);
  }

  if (typeof filters.isActive === "boolean") {
    params.push(filters.isActive);
    whereClauses.push(`l."isActive" = $${params.length}`);
  }

  if (filters.periodDays && Number.isFinite(filters.periodDays) && filters.periodDays > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - filters.periodDays);
    params.push(cutoff.toISOString());
    clickFilter = `c."createdAt" >= $${params.length}`;
    leadFilter = `a."createdAt" >= $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT
       l.*,
       COUNT(DISTINCT c."id") FILTER (WHERE ${clickFilter})::int AS "clicksCount",
       COUNT(DISTINCT a."id") FILTER (WHERE ${leadFilter})::int AS "leadsCount"
     FROM "MarketingTrackingLink" l
     LEFT JOIN "MarketingTrackingClick" c ON c."trackingLinkId" = l."id"
     LEFT JOIN "CustomerRequestAttribution" a ON a."trackingLinkId" = l."id"
     WHERE ${whereClauses.join(" AND ")}
     GROUP BY l."id"
     ORDER BY l."createdAt" DESC`,
    params,
  );

  return rows.map((row) => ({
    ...row,
    fullUrl: buildTrackingLinkUrl(row.code),
    clicksCount: Number(row.clicksCount ?? 0),
    leadsCount: Number(row.leadsCount ?? 0),
    conversionRate:
      Number(row.clicksCount ?? 0) > 0
        ? Number((((Number(row.leadsCount ?? 0) / Number(row.clicksCount ?? 0)) * 100).toFixed(1)))
        : 0,
  }));
}

function buildSummaryRange(filters: MarketingSummaryFilters) {
  let fromIso: string | null = null;
  let toIsoExclusive: string | null = null;

  if (filters.from) {
    const fromDate = new Date(filters.from);
    if (Number.isFinite(fromDate.getTime())) {
      fromDate.setHours(0, 0, 0, 0);
      fromIso = fromDate.toISOString();
    }
  }

  if (filters.to) {
    const toDate = new Date(filters.to);
    if (Number.isFinite(toDate.getTime())) {
      toDate.setHours(0, 0, 0, 0);
      toDate.setDate(toDate.getDate() + 1);
      toIsoExclusive = toDate.toISOString();
    }
  }

  if (!fromIso && !toIsoExclusive && filters.periodDays && Number.isFinite(filters.periodDays) && filters.periodDays > 0) {
    const now = new Date();
    const fromDate = new Date(now);
    fromDate.setDate(fromDate.getDate() - filters.periodDays);
    fromIso = fromDate.toISOString();
    toIsoExclusive = now.toISOString();
  }

  return { fromIso, toIsoExclusive };
}

export async function getMarketingSummary(filters: MarketingSummaryFilters = {}): Promise<MarketingSummary> {
  const { fromIso, toIsoExclusive } = buildSummaryRange(filters);

  const clickConditions: string[] = ["1=1"];
  const visitConditions: string[] = ["1=1"];
  const leadConditions: string[] = ["1=1"];
  const clickParams: Array<string> = [];
  const visitParams: Array<string> = [];
  const leadParams: Array<string> = [];

  if (filters.source) {
    clickParams.push(filters.source);
    clickConditions.push(`COALESCE(l."utmSource", '') = $${clickParams.length}`);

    visitParams.push(filters.source);
    visitConditions.push(`COALESCE(v."trafficSource", 'unknown') = $${visitParams.length}`);

    leadParams.push(filters.source);
    leadConditions.push(`COALESCE(NULLIF(a."trafficSource", ''), 'unknown') = $${leadParams.length}`);
  }

  if (fromIso) {
    clickParams.push(fromIso);
    clickConditions.push(`c."createdAt" >= $${clickParams.length}`);

    visitParams.push(fromIso);
    visitConditions.push(`v."createdAt" >= $${visitParams.length}`);

    leadParams.push(fromIso);
    leadConditions.push(`a."createdAt" >= $${leadParams.length}`);
  }

  if (toIsoExclusive) {
    clickParams.push(toIsoExclusive);
    clickConditions.push(`c."createdAt" < $${clickParams.length}`);

    visitParams.push(toIsoExclusive);
    visitConditions.push(`v."createdAt" < $${visitParams.length}`);

    leadParams.push(toIsoExclusive);
    leadConditions.push(`a."createdAt" < $${leadParams.length}`);
  }

  const [clicksRes, visitsRes, directVisitsRes, leadsRes, sourcesRes, campaignsRes] = await Promise.all([
    pool.query(
      `SELECT COUNT(c."id")::int AS "count"
       FROM "MarketingTrackingClick" c
       LEFT JOIN "MarketingTrackingLink" l ON l."id" = c."trackingLinkId"
       WHERE ${clickConditions.join(" AND ")}`,
      clickParams,
    ),
    pool.query(
      `SELECT COUNT(v."id")::int AS "count"
       FROM "MarketingVisit" v
       WHERE ${visitConditions.join(" AND ")}`,
      visitParams,
    ),
    pool.query(
      `SELECT COUNT(v."id")::int AS "count"
       FROM "MarketingVisit" v
       WHERE ${visitConditions.join(" AND ")}
         AND COALESCE(v."trafficSource", 'unknown') = 'direct'`,
      visitParams,
    ),
    pool.query(
      `SELECT COUNT(a."id")::int AS "count"
       FROM "CustomerRequestAttribution" a
       WHERE ${leadConditions.join(" AND ")}`,
      leadParams,
    ),
    pool.query(
      `SELECT
         COALESCE(NULLIF(a."trafficSource", ''), 'unknown') AS "source",
         COUNT(*)::int AS "leads"
       FROM "CustomerRequestAttribution" a
       WHERE ${leadConditions.join(" AND ")}
       GROUP BY COALESCE(NULLIF(a."trafficSource", ''), 'unknown')
       ORDER BY "leads" DESC, "source" ASC
       LIMIT 8`,
      leadParams,
    ),
    pool.query(
      `SELECT
         COALESCE(NULLIF(a."lastUtmCampaign", ''), NULLIF(a."firstUtmCampaign", ''), 'unknown') AS "campaign",
         COUNT(*)::int AS "leads"
       FROM "CustomerRequestAttribution" a
       WHERE ${leadConditions.join(" AND ")}
       GROUP BY COALESCE(NULLIF(a."lastUtmCampaign", ''), NULLIF(a."firstUtmCampaign", ''), 'unknown')
       ORDER BY "leads" DESC, "campaign" ASC
       LIMIT 8`,
      leadParams,
    ),
  ]);

  const trackedClicks = Number(clicksRes.rows[0]?.count ?? 0);
  const visits = Number(visitsRes.rows[0]?.count ?? 0);
  const clicks = trackedClicks + visits;
  const directVisits = Number(directVisitsRes.rows[0]?.count ?? 0);
  const leads = Number(leadsRes.rows[0]?.count ?? 0);
  const sources = sourcesRes.rows.map((row) => ({
    source: typeof row.source === "string" ? row.source : "unknown",
    leads: Number(row.leads ?? 0),
  }));
  const campaigns = campaignsRes.rows.map((row) => ({
    campaign: typeof row.campaign === "string" ? row.campaign : "unknown",
    leads: Number(row.leads ?? 0),
  }));

  return {
    clicks,
    trackedClicks,
    directVisits,
    leads,
    conversionRate: clicks > 0 ? Number(((leads / clicks) * 100).toFixed(1)) : 0,
    topSource: sources[0]?.source ?? null,
    sources,
    campaigns,
  };
}

export async function getMarketingDestinationOptions() {
  const [servicesRes, equipmentRes] = await Promise.all([
    pool.query(
      `SELECT "slug", "title"
       FROM "Service"
       WHERE "isActive" = true
       ORDER BY "sortOrder" ASC, "title" ASC`,
    ),
    pool.query(
      `SELECT "slug", "name"
       FROM "Equipment"
       ORDER BY "name" ASC`,
    ),
  ]);

  const staticPaths = [
    { path: "/", label: "Головна" },
    { path: "/catalog", label: "Каталог техніки" },
    { path: "/services", label: "Послуги" },
    { path: "/vyviz-smittia", label: "Вивіз сміття" },
    { path: "/contacts", label: "Контакти" },
  ];

  const servicePaths = servicesRes.rows.map((row) => ({
    path: `/services/${row.slug}`,
    label: `Послуга: ${row.title}`,
  }));

  const equipmentPaths = equipmentRes.rows.map((row) => ({
    path: `/catalog/${row.slug}`,
    label: `Техніка: ${row.name}`,
  }));

  return [...staticPaths, ...servicePaths, ...equipmentPaths];
}

export async function getTrackingLinkByCode(code: string) {
  const { rows } = await pool.query(
    `SELECT * FROM "MarketingTrackingLink"
     WHERE "code" = $1 AND "isActive" = true
     LIMIT 1`,
    [code],
  );
  return rows[0] ?? null;
}

export async function recordTrackingClick(input: {
  trackingLinkId: string;
  code: string;
  referrer?: string | null;
  landingUrl?: string | null;
  userAgent?: string | null;
  ip?: string | null;
}, client?: PoolClient) {
  const executor = client ?? pool;
  const ipHash = input.ip
    ? createHash("sha256").update(input.ip).digest("hex")
    : null;

  await executor.query(
    `INSERT INTO "MarketingTrackingClick" (
      "id","trackingLinkId","code","referrer","landingUrl","userAgent","ipHash","createdAt"
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
    [
      makeId(),
      input.trackingLinkId,
      input.code,
      cleanValue(input.referrer, 1000),
      cleanValue(input.landingUrl, 1000),
      cleanValue(input.userAgent, 1000),
      ipHash,
    ],
  );
}

export async function recordMarketingVisit(input: {
  sessionKey: string;
  attribution?: LeadAttributionInput | null;
  referrer?: string | null;
  landingPage?: string | null;
  userAgent?: string | null;
  ip?: string | null;
}, client?: PoolClient) {
  const executor = client ?? pool;
  const sessionKey = cleanValue(input.sessionKey, 120);
  if (!sessionKey) {
    return;
  }
  const normalized = normalizeAttribution(input.attribution);
  const trackingCode =
    normalized?.lastTouch?.trackingCode ??
    normalized?.firstTouch?.trackingCode ??
    null;

  const trackingLinkRes = trackingCode
    ? await executor.query(
        `SELECT "id" FROM "MarketingTrackingLink"
         WHERE "code" = $1
         LIMIT 1`,
        [trackingCode],
      )
    : { rows: [] };

  const trackingLinkId = (trackingLinkRes.rows[0]?.id as string | undefined) ?? null;
  const trafficSource = resolveTrafficSource(normalized);
  const touch = normalized?.lastTouch ?? normalized?.firstTouch ?? null;
  const ipHash = input.ip
    ? createHash("sha256").update(input.ip).digest("hex")
    : null;

  await executor.query(
    `INSERT INTO "MarketingVisit" (
      "id","sessionKey","trafficSource","trackingCode","trackingLinkId","landingPage","referrer","userAgent","ipHash","createdAt"
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
    ON CONFLICT ("sessionKey", "landingPage") DO NOTHING`,
    [
      makeId(),
      sessionKey,
      trafficSource,
      cleanValue(trackingCode, 80),
      trackingLinkId,
      cleanValue(input.landingPage ?? touch?.landingPage ?? null, 1000),
      cleanValue(input.referrer ?? touch?.referrer ?? null, 1000),
      cleanValue(input.userAgent, 1000),
      ipHash,
    ],
  );
}
