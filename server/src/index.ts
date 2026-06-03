// Завантажуємо .env ПЕРШИМ — side-effect import виконується до решти
import "./env.js";

import path from "path";
import { fileURLToPath } from "url";
import { readFile } from "fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import express from "express";
import type { Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { pool } from "./lib/db.js";
import { initSchema } from "./lib/schema.js";
import { equipmentRouter } from "./routes/equipment.js";
import { ordersRouter } from "./routes/orders.js";
import { authRouter } from "./routes/auth.js";
import { customerAuthRouter } from "./routes/customer-auth.js";
import { customerRouter } from "./routes/customer.js";
import { adminEquipmentRouter } from "./routes/admin.equipment.js";
import { adminEmployeesRouter } from "./routes/admin.employees.js";
import { adminCustomersRouter } from "./routes/admin.customers.js";
import { adminOrdersRouter } from "./routes/admin.orders.js";
import { adminRequestsRouter } from "./routes/admin.requests.js";
import { adminOccupancyRouter } from "./routes/admin.occupancy.js";
import { adminUploadRouter } from "./routes/admin.upload.js";
import { adminRentOrdersRouter } from "./routes/admin.rent-orders.js";
import { serviceRequestsRouter } from "./routes/service-requests.js";
import { adminServiceRequestsRouter } from "./routes/admin.service-requests.js";
import { servicesRouter } from "./routes/services.js";
import { adminServicesRouter } from "./routes/admin.services.js";
import { settingsRouter } from "./routes/settings.js";
import { adminSettingsRouter } from "./routes/admin.settings.js";
import { adminGpsRouter } from "./routes/admin.gps.js";
import { adminSupplyRouter } from "./routes/admin.supply.js";
import { adminNotificationsRouter } from "./routes/admin.notifications.js";
import { adminFinanceRouter } from "./routes/admin.finance.js";
import { adminMarketingRouter } from "./routes/admin.marketing.js";
import { adminAdminsRouter } from "./routes/admin.admins.js";
import { adminAvailabilityRouter } from "./routes/admin.availability.js";
import { marketingRouter } from "./routes/marketing.js";
import { internalTelegramRouter } from "./routes/internal.telegram.js";
import { monobankPaymentsRouter } from "./routes/monobank.payments.js";
import { addressSearchRouter } from "./routes/address-search.js";
import { authMiddleware } from "./middleware/auth.js";

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === "production";
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || "256kb";

type SitemapEntry = {
  loc: string;
  changefreq: "weekly" | "monthly";
  priority: number;
  lastmod?: string;
};

function normalizeSiteUrl(value = "https://technorent.ua") {
  return value.replace(/\/+$/, "");
}

function htmlEscape(value: string) {
  return value.replace(/[<>&'"]/g, (char) => {
    switch (char) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&#39;";
      case '"':
        return "&quot;";
      default:
        return char;
    }
  });
}

function xmlEscape(value: string) {
  return value.replace(/[<>&'"]/g, (char) => {
    switch (char) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return char;
    }
  });
}

function toSitemapDate(value: unknown) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

async function buildSitemapXml() {
  const { rows: equipment } = await pool.query<{ slug: string; updatedAt: Date }>(
    `SELECT "slug", "updatedAt" FROM "Equipment" ORDER BY "updatedAt" DESC`,
  );
  const { rows: services } = await pool.query<{ slug: string; updatedAt: Date }>(
    `SELECT "slug", "updatedAt" FROM "Service" WHERE "isActive" = true ORDER BY "updatedAt" DESC`,
  );
  const base = normalizeSiteUrl(process.env.SITE_URL || "https://technorent.ua");

  const entries: SitemapEntry[] = [
    { loc: `${base}/`, changefreq: "weekly", priority: 1 },
    { loc: `${base}/catalog`, changefreq: "weekly", priority: 0.9 },
    { loc: `${base}/services`, changefreq: "weekly", priority: 0.8 },
    { loc: `${base}/contacts`, changefreq: "monthly", priority: 0.7 },
    ...services.map((svc) => ({
      loc: `${base}/services/${svc.slug}`,
      lastmod: toSitemapDate(svc.updatedAt),
      changefreq: "monthly" as const,
      priority: 0.7,
    })),
    ...equipment.map((eq) => ({
      loc: `${base}/catalog/${eq.slug}`,
      lastmod: toSitemapDate(eq.updatedAt),
      changefreq: "weekly" as const,
      priority: 0.8,
    })),
  ];

  const urls = entries
    .map((entry) => {
      const lastmod = entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : "";
      return `  <url><loc>${xmlEscape(entry.loc)}</loc>${lastmod}<changefreq>${entry.changefreq}</changefreq><priority>${entry.priority.toFixed(1)}</priority></url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}

function sendSitemap(res: Response, xml: string) {
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(xml);
}

type PublicPageSeo = {
  title: string;
  description: string;
  canonical?: string;
  image?: string;
  status?: number;
  noindex?: boolean;
  ogType?: "website" | "product";
};

function getSeoSiteUrl() {
  // SEO_SITE_URL can be switched when the permanent public domain is approved.
  return normalizeSiteUrl(process.env.SEO_SITE_URL || "https://technorent.ua");
}

const defaultSeoImage =
  "https://images.unsplash.com/photo-1695795692564-586c6ab80a69?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1200";

function absoluteSeoImage(url: string | null | undefined) {
  if (!url) return defaultSeoImage;
  if (/^https?:\/\//.test(url)) return url;
  return `${getSeoSiteUrl()}${url.startsWith("/") ? url : `/${url}`}`;
}

async function resolvePublicPageSeo(pathname: string): Promise<PublicPageSeo> {
  const siteUrl = getSeoSiteUrl();
  const staticPages: Record<string, PublicPageSeo> = {
    "/": {
      title: "TechnoRent | Оренда спецтехніки у Львові: екскаватори, крани, навантажувачі",
      description:
        "Оренда спецтехніки у Львові та області. Екскаватори, навантажувачі, бульдозери й крани для робіт на ділянці та будмайданчику.",
      canonical: `${siteUrl}/`,
      image: defaultSeoImage,
    },
    "/catalog": {
      title: "Каталог спецтехніки у Львові: оренда машин для робіт | TechnoRent",
      description:
        "Каталог техніки в оренду у Львові та області. Перегляньте екскаватори, навантажувачі, самоскиди, крани та евакуатор.",
      canonical: `${siteUrl}/catalog`,
      image: defaultSeoImage,
    },
    "/services": {
      title: "Послуги TechnoRent | Спецтехніка у Львові та області",
      description:
        "Земляні роботи, демонтаж, вивіз сміття, перевезення матеріалів і евакуатор у Львові та області. Оберіть потрібну послугу.",
      canonical: `${siteUrl}/services`,
      image: defaultSeoImage,
    },
    "/contacts": {
      title: "Контакти TechnoRent | Оренда спецтехніки у Львові",
      description:
        "Телефон, email і графік роботи TechnoRent у Львові. Зв'яжіться з нами, щоб уточнити оренду техніки або послугу.",
      canonical: `${siteUrl}/contacts`,
      image: defaultSeoImage,
    },
    "/vyviz-smittia": {
      title: "Вивіз будівельного сміття | TechnoRent | Львів та область",
      description:
        "Вивіз будівельного сміття у Львові та області: погодження обсягу, підбір техніки, завантаження і вивезення з об'єкта.",
      canonical: `${siteUrl}/services/vyviz-budivelnogo-smittia`,
      image: defaultSeoImage,
    },
  };

  if (staticPages[pathname]) {
    return staticPages[pathname];
  }

  const serviceMatch = pathname.match(/^\/services\/([^/]+)$/);
  if (serviceMatch) {
    const { rows } = await pool.query<{
      slug: string;
      seoTitle: string;
      seoDescription: string;
      image: string | null;
    }>(
      `SELECT "slug", "seoTitle", "seoDescription", "image"
       FROM "Service"
       WHERE "slug" = $1 AND "isActive" = true
       LIMIT 1`,
      [decodeURIComponent(serviceMatch[1])],
    );
    const service = rows[0];
    if (service) {
      return {
        title: service.seoTitle,
        description: service.seoDescription,
        canonical: `${siteUrl}/services/${service.slug}`,
        image: absoluteSeoImage(service.image),
      };
    }
    return {
      title: "Послугу не знайдено | TechnoRent",
      description: "Запитану послугу не знайдено.",
      status: 404,
      noindex: true,
    };
  }

  const equipmentMatch = pathname.match(/^\/catalog\/([^/]+)$/);
  if (equipmentMatch) {
    const { rows } = await pool.query<{
      slug: string;
      name: string;
      brand: string;
      description: string;
      pricePerHour: number;
      image: string | null;
    }>(
      `SELECT
         e."slug",
         e."name",
         e."brand",
         e."description",
         e."pricePerHour",
         (SELECT ei."url" FROM "EquipmentImage" ei
          WHERE ei."equipmentId" = e."id"
          ORDER BY ei."sortOrder" ASC, ei."id" ASC LIMIT 1) AS "image"
       FROM "Equipment" e
       WHERE e."slug" = $1
       LIMIT 1`,
      [decodeURIComponent(equipmentMatch[1])],
    );
    const equipment = rows[0];
    if (equipment) {
      return {
        title: `${equipment.name} | Оренда ${equipment.brand} у Львові | TechnoRent`,
        description: `Оренда ${equipment.name} у Львові та області. ${equipment.description}`.slice(0, 160),
        canonical: `${siteUrl}/catalog/${equipment.slug}`,
        image: absoluteSeoImage(equipment.image),
        ogType: "product",
      };
    }
    return {
      title: "Техніку не знайдено | TechnoRent",
      description: "Запитану техніку не знайдено.",
      status: 404,
      noindex: true,
    };
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return {
      title: "Адмін-панель | TechnoRent",
      description: "",
      noindex: true,
    };
  }

  return {
    title: "Сторінку не знайдено | TechnoRent",
    description: "Запитану сторінку не знайдено.",
    status: 404,
    noindex: true,
  };
}

function injectInitialSeoHtml(html: string, seo: PublicPageSeo) {
  const canonicalTags = seo.canonical
    ? [
        `<link data-seo-shell="true" rel="canonical" href="${htmlEscape(seo.canonical)}" />`,
        `<meta data-seo-shell="true" property="og:url" content="${htmlEscape(seo.canonical)}" />`,
      ].join("\n    ")
    : "";
  const imageTags = seo.image
    ? [
        `<meta data-seo-shell="true" property="og:image" content="${htmlEscape(seo.image)}" />`,
        `<meta data-seo-shell="true" name="twitter:image" content="${htmlEscape(seo.image)}" />`,
      ].join("\n    ")
    : "";
  const tags = [
    `<meta data-seo-shell="true" name="description" content="${htmlEscape(seo.description)}" />`,
    `<meta data-seo-shell="true" name="robots" content="${seo.noindex ? "noindex, nofollow" : "index, follow"}" />`,
    `<meta data-seo-shell="true" property="og:type" content="${seo.ogType ?? "website"}" />`,
    `<meta data-seo-shell="true" property="og:title" content="${htmlEscape(seo.title)}" />`,
    `<meta data-seo-shell="true" property="og:description" content="${htmlEscape(seo.description)}" />`,
    canonicalTags,
    imageTags,
    `<meta data-seo-shell="true" name="twitter:card" content="${seo.image ? "summary_large_image" : "summary"}" />`,
    `<meta data-seo-shell="true" name="twitter:title" content="${htmlEscape(seo.title)}" />`,
    `<meta data-seo-shell="true" name="twitter:description" content="${htmlEscape(seo.description)}" />`,
  ].filter(Boolean).join("\n    ");

  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${htmlEscape(seo.title)}</title>`)
    .replace(/\s*<meta data-seo-shell="true"[^>]*\/?>/g, "")
    .replace("</head>", `    ${tags}\n  </head>`);
}

function normalizeOrigin(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed;
  }
}

function getAllowedCorsOrigins() {
  const origins = new Set<string>();
  const rawOrigins = [
    process.env.CLIENT_URL,
    process.env.SITE_URL,
    process.env.CORS_ORIGINS,
    !isProduction ? "http://localhost:5173" : "",
  ];

  for (const raw of rawOrigins) {
    for (const item of String(raw || "").split(",")) {
      const origin = normalizeOrigin(item);
      if (origin) origins.add(origin);
    }
  }

  return origins;
}

const allowedCorsOrigins = getAllowedCorsOrigins();

// ─── Middleware ────────────────────────────────────
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:", "blob:", "https:"],
        "font-src": ["'self'", "data:"],
        "connect-src": ["'self'", "https:"],
        "frame-ancestors": ["'self'"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'", "https://pay.monobank.ua"],
        "upgrade-insecure-requests": isProduction ? [] : null,
      },
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  }),
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedCorsOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  }),
);
app.use(
  express.json({
    limit: JSON_BODY_LIMIT,
    verify: (req, _res, buf) => {
      (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
    },
  }),
);

// Serve uploaded images
const uploadsDir = path.resolve(__dirname, "../../uploads");
const publicUploadFilePattern = /^[a-f0-9-]{36}\.webp$/i;
app.use(
  "/uploads",
  (req, res, next) => {
    let requestedPath = req.path;
    try {
      requestedPath = decodeURIComponent(requestedPath);
    } catch {
      res.status(404).end();
      return;
    }

    const filename = path.basename(requestedPath);
    if (requestedPath !== `/${filename}` || !publicUploadFilePattern.test(filename)) {
      res.status(404).end();
      return;
    }

    next();
  },
  express.static(uploadsDir, {
    dotfiles: "deny",
    index: false,
    immutable: true,
    maxAge: "30d",
  }),
);

// ─── SEO Files ────────────────────────────────────
app.get(["/sitemap.xml", "/api/sitemap.xml"], async (_req, res) => {
  try {
    sendSitemap(res, await buildSitemapXml());
  } catch {
    res.status(500).send("Error generating sitemap");
  }
});

app.get("/robots.txt", (_req, res) => {
  const base = normalizeSiteUrl(process.env.SITE_URL || "https://technorent.ua");

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(
    [
      "User-agent: *",
      "Allow: /",
      "Disallow: /admin",
      "Disallow: /admin/",
      "Disallow: /admin/*",
      "Disallow: /api/admin/",
      "Disallow: /api/internal/",
      "",
      `Sitemap: ${base}/sitemap.xml`,
      "",
    ].join("\n"),
  );
});

// Rate limiting for orders (anti-spam)
const ordersLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: "Забагато заявок. Спробуйте пізніше." },
  standardHeaders: true,
  legacyHeaders: false,
});

const addressSearchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 180,
  message: { error: "Забагато запитів до пошуку адрес. Спробуйте трохи пізніше." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Public API ───────────────────────────────────
app.use("/api/equipment", equipmentRouter);
app.use("/api/orders", ordersLimiter, ordersRouter);
app.use("/api/service-requests", ordersLimiter, serviceRequestsRouter);
app.use("/api/services", servicesRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/address-search", addressSearchLimiter, addressSearchRouter);
app.use("/api/auth", authRouter);
app.use("/api/customer-auth", customerAuthRouter);
app.use("/api/customer", customerRouter);
app.use("/api/internal/telegram", internalTelegramRouter);
app.use("/api/payments/monobank", monobankPaymentsRouter);
app.use("/", marketingRouter);

// ─── Admin API (protected) ────────────────────────
app.use("/api/admin", authMiddleware);
app.use("/api/admin/equipment", adminEquipmentRouter);
app.use("/api/admin/employees", adminEmployeesRouter);
app.use("/api/admin/customers", adminCustomersRouter);
app.use("/api/admin/orders", adminOrdersRouter);
app.use("/api/admin/requests", adminRequestsRouter);
app.use("/api/admin/rent-orders", adminRentOrdersRouter);
app.use("/api/admin/occupancy", adminOccupancyRouter);
app.use("/api/admin/upload", adminUploadRouter);
app.use("/api/admin/service-requests", adminServiceRequestsRouter);
app.use("/api/admin/services", adminServicesRouter);
app.use("/api/admin/settings", adminSettingsRouter);
app.use("/api/admin/gps", adminGpsRouter);
app.use("/api/admin/supply", adminSupplyRouter);
app.use("/api/admin/notifications", adminNotificationsRouter);
app.use("/api/admin/finance", adminFinanceRouter);
app.use("/api/admin/marketing", adminMarketingRouter);
app.use("/api/admin/admins", adminAdminsRouter);
app.use("/api/admin/availability", adminAvailabilityRouter);

import { existsSync, appendFileSync } from "fs";
import { autoSeed } from "./lib/auto-seed.js";

// ─── Simple file logger for cPanel debugging ──────
function logToFile(msg: string) {
  try {
    const ts = new Date().toISOString();
    appendFileSync(path.resolve(__dirname, "../../server.log"), `[${ts}] ${msg}\n`);
  } catch { /* ignore */ }
}

async function runDbSetupWithLock(): Promise<"completed" | "skipped"> {
  const lockClient = await pool.connect();
  let locked = false;
  try {
    const lockResult = await lockClient.query(
      `SELECT pg_try_advisory_lock(hashtext($1)) AS locked`,
      ["technorent_schema_init"],
    );
    locked = lockResult.rows[0]?.locked === true;

    if (!locked) {
      logToFile("DB setup skipped: another process is already running setup");
      return "skipped";
    }

    await initSchema();
    await autoSeed();
    return "completed";
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";

    if (code === "40P01") {
      logToFile("DB setup deadlock detected, retrying once");
      await new Promise((resolve) => setTimeout(resolve, 500));
      await initSchema();
      await autoSeed();
      return "completed";
    }

    throw error;
  } finally {
    if (locked) {
      try {
        await lockClient.query(`SELECT pg_advisory_unlock(hashtext($1))`, ["technorent_schema_init"]);
      } catch {
        // ignore unlock errors; PostgreSQL also releases session locks on disconnect
      }
    }
    lockClient.release();
  }
}

// ─── Health check (always works, even without DB) ──
app.get("/api/health", async (_req, res) => {
  let databaseAvailable = true;
  try {
    await pool.query("SELECT 1");
  } catch {
    databaseAvailable = false;
  }

  if (isProduction) {
    res.status(databaseAvailable ? 200 : 503).json({ status: databaseAvailable ? "ok" : "unavailable" });
    return;
  }

  res.status(databaseAvailable ? 200 : 503).json({
    status: databaseAvailable ? "running" : "degraded",
    time: new Date().toISOString(),
    database: databaseAvailable ? "connected" : "unavailable",
  });
});

// ─── Serve frontend in production ─────────────────
if (process.env.NODE_ENV === "production") {
  // Try multiple possible client dist locations
  const candidates = [
    path.join(__dirname, "../../client/dist"),
    path.join(__dirname, "../../client_dist"),
  ];
  const clientDist = candidates.find((p) => existsSync(p));
  if (clientDist) {
    console.log("Serving static from:", clientDist);
    app.use(
      "/assets",
      express.static(path.join(clientDist, "assets"), {
        immutable: true,
        maxAge: "1y",
      }),
    );
    app.use(express.static(clientDist, { index: false }));
    app.get("/{*splat}", async (req, res) => {
      if (req.path.startsWith("/api/")) {
        res.status(404).json({ error: "Маршрут не знайдено" });
        return;
      }
      if (req.path === "/vyviz-smittia") {
        res.redirect(301, "/services/vyviz-budivelnogo-smittia");
        return;
      }

      try {
        const seo = await resolvePublicPageSeo(req.path);
        const html = await readFile(path.join(clientDist, "index.html"), "utf8");
        res
          .status(seo.status ?? 200)
          .type("html")
          .send(injectInitialSeoHtml(html, seo));
      } catch (error) {
        logToFile(`SEO HTML render failed: ${error instanceof Error ? error.message : String(error)}`);
        res.sendFile(path.join(clientDist, "index.html"));
      }
    });
  } else {
    console.warn("Client dist not found! Tried:", candidates);
  }
}

// Сервер стартує ЗАВЖДИ, навіть якщо БД недоступна
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  logToFile(`Server started on port ${PORT}`);
});

// DB setup runs AFTER server is already listening
runDbSetupWithLock()
  .then((status) => {
    if (status === "completed") {
      logToFile("DB setup & seed complete");
    }
  })
  .catch((e) => {
    const msg = `DB setup failed: ${e instanceof Error ? e.message : String(e)}`;
    console.error(msg);
    logToFile(msg);
  });
