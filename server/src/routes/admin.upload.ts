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

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB max input
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/avif"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Дозволені лише зображення (JPEG, PNG, WebP, AVIF)"));
    }
  },
});

export const adminUploadRouter = Router();
adminUploadRouter.use(authMiddleware);

/** Upload & compress image */
adminUploadRouter.post("/", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Файл не завантажено" });
      return;
    }

    const filename = `${crypto.randomUUID()}.webp`;
    const outputPath = path.join(UPLOADS_DIR, filename);

    // Compress & convert to WebP, max 1200px wide, quality 80
    await sharp(req.file.buffer)
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(outputPath);

    const url = `/uploads/${filename}`;
    res.json({ url, alt: req.file.originalname });
  } catch (e) {
    console.error("POST /api/admin/upload error:", e);
    res.status(500).json({ error: "Помилка завантаження" });
  }
});

/** Delete uploaded file */
adminUploadRouter.delete("/", async (req, res) => {
  try {
    const { url } = req.body as { url?: string };
    if (!url || !url.startsWith("/uploads/")) {
      res.status(400).json({ error: "Невірний URL" });
      return;
    }
    const filename = path.basename(url);
    // Only allow deleting .webp files from uploads dir
    if (!filename.endsWith(".webp")) {
      res.status(400).json({ error: "Невірний файл" });
      return;
    }
    const filePath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    res.json({ success: true });
  } catch (e) {
    console.error("DELETE /api/admin/upload error:", e);
    res.status(500).json({ error: "Помилка видалення файлу" });
  }
});

/** Helper: delete file by /uploads/... url */
export function deleteUploadedFile(url: string) {
  if (!url.startsWith("/uploads/")) return;
  const filename = path.basename(url);
  const filePath = path.join(UPLOADS_DIR, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
