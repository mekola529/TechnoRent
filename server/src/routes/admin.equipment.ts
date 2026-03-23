import { logError } from "../lib/logger.js";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { deleteUploadedFile } from "./admin.upload.js";

export const adminEquipmentRouter = Router();

// Всі маршрути захищені
adminEquipmentRouter.use(authMiddleware);

const equipmentSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  brand: z.string().min(1),
  type: z.enum([
    "excavator", "loader", "bulldozer", "crane", "roller",
    "dump_truck", "concrete_mixer", "generator", "other",
  ]),
  description: z.string().min(1),
  pricePerHour: z.number().positive(),
  isPopular: z.boolean().optional(),
  specs: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  images: z.array(z.object({ url: z.string(), alt: z.string() })).optional(),
});

/** Створити техніку */
adminEquipmentRouter.post("/", validate(equipmentSchema), async (req, res) => {
  try {
    const { specs, images, ...data } = req.body;

    const item = await prisma.equipment.create({
      data: {
        ...data,
        specs: specs ? { create: specs } : undefined,
        images: images ? { create: images } : undefined,
      },
      include: { specs: true, images: true, bookedPeriods: true },
    });

    res.status(201).json(item);
  } catch (e) {
    logError("POST /api/admin/equipment error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Оновити техніку */
adminEquipmentRouter.put("/:id", validate(equipmentSchema.partial()), async (req, res) => {
  try {
    const { specs, images, ...data } = req.body;
    const id = req.params.id as string;

    // Оновити основні дані
    const item = await prisma.equipment.update({
      where: { id },
      data,
      include: { specs: true, images: true, bookedPeriods: true },
    });

    // Оновити specs якщо передано
    if (specs) {
      await prisma.equipmentSpec.deleteMany({ where: { equipmentId: id } });
      await prisma.equipmentSpec.createMany({
        data: specs.map((s: { label: string; value: string }) => ({
          ...s,
          equipmentId: id,
        })),
      });
    }

    // Оновити images якщо передано
    if (images) {
      // Delete old image files that are no longer in the new list
      const oldImages = await prisma.equipmentImage.findMany({ where: { equipmentId: id } });
      const newUrls = new Set(images.map((img: { url: string }) => img.url));
      for (const old of oldImages) {
        if (!newUrls.has(old.url)) {
          deleteUploadedFile(old.url);
        }
      }
      await prisma.equipmentImage.deleteMany({ where: { equipmentId: id } });
      await prisma.equipmentImage.createMany({
        data: images.map((img: { url: string; alt: string }) => ({
          ...img,
          equipmentId: id,
        })),
      });
    }

    // Повернути оновлений запис
    const updated = await prisma.equipment.findUnique({
      where: { id },
      include: { specs: true, images: true, bookedPeriods: true },
    });

    res.json(updated);
  } catch (e) {
    logError("PUT /api/admin/equipment/:id error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Видалити техніку */
adminEquipmentRouter.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id as string;
    // Delete image files from disk before removing DB records
    const images = await prisma.equipmentImage.findMany({ where: { equipmentId: id } });
    for (const img of images) {
      deleteUploadedFile(img.url);
    }
    await prisma.equipment.delete({ where: { id } });
    res.json({ success: true });
  } catch (e) {
    logError("DELETE /api/admin/equipment/:id error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});
