import { logError } from "../lib/logger.js";
import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { authMiddleware } from "../middleware/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.resolve(__dirname, "../../../uploads");
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_INPUT_PIXELS = 25_000_000;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_IMAGE_FORMATS = new Set(["jpeg", "png", "webp"]);
const GENERATED_WEBP_FILENAME = /^[a-f0-9-]{36}\.webp$/i;

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Дозволені лише JPG, PNG або WEBP-зображення"));
    }
  },
});

export const adminUploadRouter = Router();
adminUploadRouter.use(authMiddleware);

function sanitizeAltText(originalName: string) {
  return path
    .basename(originalName)
    .replace(/[\x00-\x1F\x7F<>"]/g, "")
    .trim()
    .slice(0, 120) || "Зображення";
}

function resolveUploadedWebpPath(url: string) {
  if (!url.startsWith("/uploads/")) return null;

  const filename = path.basename(url);
  if (!GENERATED_WEBP_FILENAME.test(filename)) return null;

  const filePath = path.resolve(UPLOADS_DIR, filename);
  if (!filePath.startsWith(`${UPLOADS_DIR}${path.sep}`)) return null;

  return filePath;
}

/** Upload & compress image */
adminUploadRouter.post("/", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Файл не завантажено" });
      return;
    }

    const metadata = await sharp(req.file.buffer, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: "error",
    }).metadata();

    if (!metadata.format || !ALLOWED_IMAGE_FORMATS.has(metadata.format)) {
      res.status(400).json({ error: "Непідтримуваний формат зображення" });
      return;
    }

    const filename = `${crypto.randomUUID()}.webp`;
    const outputPath = path.join(UPLOADS_DIR, filename);

    // Compress & convert to WebP, max 1200px wide, quality 80
    await sharp(req.file.buffer, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: "error",
    })
      .rotate()
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(outputPath);

    const url = `/uploads/${filename}`;
    res.json({ url, alt: sanitizeAltText(req.file.originalname) });
  } catch (e) {
    if (e instanceof multer.MulterError) {
      res.status(400).json({ error: "Файл завеликий або має некоректний формат" });
      return;
    }
    if (e instanceof Error && /image|input file|unsupported|corrupt|pixels/i.test(e.message)) {
      res.status(400).json({ error: "Не вдалося обробити зображення" });
      return;
    }
    logError("POST /api/admin/upload error:", e);
    res.status(500).json({ error: "Помилка завантаження" });
  }
});

/** Delete uploaded file */
adminUploadRouter.delete("/", async (req, res) => {
  try {
    const { url } = req.body as { url?: string };
    if (!url) {
      res.status(400).json({ error: "Невірний URL" });
      return;
    }

    const filePath = resolveUploadedWebpPath(url);
    if (!filePath) {
      res.status(400).json({ error: "Невірний файл" });
      return;
    }

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    res.json({ success: true });
  } catch (e) {
    logError("DELETE /api/admin/upload error:", e);
    res.status(500).json({ error: "Помилка видалення файлу" });
  }
});

/** Helper: delete file by /uploads/... url */
export function deleteUploadedFile(url: string) {
  const filePath = resolveUploadedWebpPath(url);
  if (!filePath) return;
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
