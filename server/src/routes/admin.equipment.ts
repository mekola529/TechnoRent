import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";

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
    console.error("POST /api/admin/equipment error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Оновити техніку */
adminEquipmentRouter.put("/:id", async (req, res) => {
  try {
    const { specs, images, ...data } = req.body;
    const id = req.params.id;

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
    console.error("PUT /api/admin/equipment/:id error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Видалити техніку */
adminEquipmentRouter.delete("/:id", async (req, res) => {
  try {
    await prisma.equipment.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (e) {
    console.error("DELETE /api/admin/equipment/:id error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});
