import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Завантажуємо .env (для локальної розробки)
config({ path: path.resolve(__dirname, "../../.env") });

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { prisma } from "./lib/prisma.js";
import { equipmentRouter } from "./routes/equipment.js";
import { ordersRouter } from "./routes/orders.js";
import { authRouter } from "./routes/auth.js";
import { adminEquipmentRouter } from "./routes/admin.equipment.js";
import { adminOrdersRouter } from "./routes/admin.orders.js";
import { adminOccupancyRouter } from "./routes/admin.occupancy.js";
import { adminUploadRouter } from "./routes/admin.upload.js";

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
app.use(express.json());

// Serve uploaded images
app.use("/uploads", express.static(path.resolve(__dirname, "../../uploads")));

// Rate limiting for auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: "Забагато спроб. Спробуйте пізніше." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Dynamic Sitemap ──────────────────────────────
app.get("/api/sitemap.xml", async (_req, res) => {
  try {
    const equipment = await prisma.equipment.findMany({ select: { slug: true, updatedAt: true } });
    const base = process.env.SITE_URL || "https://technorent.ua";

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    xml += `  <url><loc>${base}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n`;
    xml += `  <url><loc>${base}/catalog</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>\n`;

    for (const eq of equipment) {
      const lastmod = eq.updatedAt.toISOString().split("T")[0];
      xml += `  <url><loc>${base}/catalog/${eq.slug}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>\n`;
    }

    xml += `</urlset>`;
    res.setHeader("Content-Type", "application/xml");
    res.send(xml);
  } catch {
    res.status(500).send("Error generating sitemap");
  }
});

// Rate limiting for orders (anti-spam)
const ordersLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: "Забагато заявок. Спробуйте пізніше." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Public API ───────────────────────────────────
app.use("/api/equipment", equipmentRouter);
app.use("/api/orders", ordersLimiter, ordersRouter);
app.use("/api/auth", authLimiter, authRouter);

// ─── Admin API (protected) ────────────────────────
app.use("/api/admin/equipment", adminEquipmentRouter);
app.use("/api/admin/orders", adminOrdersRouter);
app.use("/api/admin/occupancy", adminOccupancyRouter);
app.use("/api/admin/upload", adminUploadRouter);

// ─── Serve frontend in production ─────────────────
if (process.env.NODE_ENV === "production") {
  const clientDist = path.join(__dirname, "../../client/dist");
  app.use(express.static(clientDist));
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// ─── Start ────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
