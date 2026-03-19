import { PrismaClient, EquipmentType } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

/** Map frontend type → Prisma enum (dash → underscore) */
function mapType(t: string): EquipmentType {
  const map: Record<string, EquipmentType> = {
    excavator: "excavator",
    loader: "loader",
    bulldozer: "bulldozer",
    crane: "crane",
    roller: "roller",
    "dump-truck": "dump_truck",
    "concrete-mixer": "concrete_mixer",
    generator: "generator",
    other: "other",
  };
  return map[t] ?? "other";
}

const equipmentList = [
  {
    slug: "jcb-3cx",
    name: "JCB 3CX",
    brand: "JCB",
    type: "excavator",
    description:
      "Універсальний екскаватор-навантажувач JCB 3CX — ідеальний вибір для земляних робіт, риття траншей та навантажування матеріалів. Потужний двигун та маневреність роблять його незамінним на будмайданчику.",
    pricePerHour: 1200,
    isPopular: true,
    specs: [
      { label: "Потужність двигуна", value: "74 кВт (100 к.с.)" },
      { label: "Глибина копання", value: "5.46 м" },
      { label: "Об'єм ковша", value: "1.0 м³" },
      { label: "Маса", value: "8 200 кг" },
      { label: "Рік випуску", value: "2021" },
    ],
    images: [
      {
        url: "https://images.unsplash.com/photo-1652922660696-60c68ec51582?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=600",
        alt: "JCB 3CX — екскаватор-навантажувач",
      },
    ],
    bookedPeriods: [
      { from: "2026-03-20", to: "2026-03-25", note: "Будівництво на вул. Шевченка" },
      { from: "2026-04-01", to: "2026-04-05" },
    ],
  },
  {
    slug: "cat-938",
    name: "CAT 938",
    brand: "Caterpillar",
    type: "loader",
    description:
      "Фронтальний навантажувач Caterpillar 938 для переміщення сипучих матеріалів, піску, гравію та будівельного сміття. Висока продуктивність та надійність.",
    pricePerHour: 1450,
    isPopular: true,
    specs: [
      { label: "Потужність двигуна", value: "127 кВт (170 к.с.)" },
      { label: "Об'єм ковша", value: "2.5 м³" },
      { label: "Вантажопідйомність", value: "4 500 кг" },
      { label: "Маса", value: "13 500 кг" },
      { label: "Рік випуску", value: "2022" },
    ],
    images: [
      {
        url: "https://images.unsplash.com/photo-1758798347934-633347ee2812?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=600",
        alt: "CAT 938 — фронтальний навантажувач",
      },
    ],
    bookedPeriods: [{ from: "2026-03-18", to: "2026-03-22" }],
  },
  {
    slug: "volvo-ec220",
    name: "Volvo EC220",
    brand: "Volvo",
    type: "excavator",
    description:
      "Гусеничний екскаватор Volvo EC220 для масштабних земляних робіт, демонтажу та будівництва. Потужний, точний та економічний.",
    pricePerHour: 1600,
    isPopular: true,
    specs: [
      { label: "Потужність двигуна", value: "122 кВт (166 к.с.)" },
      { label: "Глибина копання", value: "6.7 м" },
      { label: "Об'єм ковша", value: "1.4 м³" },
      { label: "Маса", value: "22 200 кг" },
      { label: "Рік випуску", value: "2020" },
    ],
    images: [
      {
        url: "https://images.unsplash.com/photo-1647978403048-2e5099133ea3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=600",
        alt: "Volvo EC220 — гусеничний екскаватор",
      },
    ],
    bookedPeriods: [],
  },
  {
    slug: "cat-d6",
    name: "CAT D6",
    brand: "Caterpillar",
    type: "bulldozer",
    description:
      "Бульдозер Caterpillar D6 для планування ґрунту, розчистки територій та переміщення великих об'ємів матеріалів. Надійний та продуктивний.",
    pricePerHour: 1800,
    isPopular: false,
    specs: [
      { label: "Потужність двигуна", value: "158 кВт (215 к.с.)" },
      { label: "Ширина відвалу", value: "3.9 м" },
      { label: "Маса", value: "20 000 кг" },
      { label: "Рік випуску", value: "2023" },
    ],
    images: [
      {
        url: "https://images.unsplash.com/photo-1666247639803-f66e10cc0098?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=600",
        alt: "CAT D6 — бульдозер",
      },
    ],
    bookedPeriods: [
      { from: "2026-03-25", to: "2026-04-10", note: "Підготовка ділянки під забудову" },
    ],
  },
  {
    slug: "liebherr-ltm-1060",
    name: "Liebherr LTM 1060",
    brand: "Liebherr",
    type: "crane",
    description:
      "Автомобільний кран Liebherr LTM 1060 вантажопідйомністю 60 тонн. Для монтажних робіт, встановлення конструкцій та піднімання важких вантажів.",
    pricePerHour: 2500,
    isPopular: false,
    specs: [
      { label: "Вантажопідйомність", value: "60 т" },
      { label: "Довжина стріли", value: "48 м" },
      { label: "Потужність двигуна", value: "270 кВт (367 к.с.)" },
      { label: "Маса", value: "48 000 кг" },
      { label: "Рік випуску", value: "2019" },
    ],
    images: [
      {
        url: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=600",
        alt: "Liebherr LTM 1060 — автомобільний кран",
      },
    ],
    bookedPeriods: [],
  },
  {
    slug: "man-tgs-33400",
    name: "MAN TGS 33.400",
    brand: "MAN",
    type: "dump-truck",
    description:
      "Самоскид MAN TGS 33.400 для перевезення сипучих матеріалів, будівельного сміття та ґрунту. Велика вантажопідйомність та прохідність.",
    pricePerHour: 950,
    isPopular: false,
    specs: [
      { label: "Вантажопідйомність", value: "20 т" },
      { label: "Об'єм кузова", value: "16 м³" },
      { label: "Потужність двигуна", value: "294 кВт (400 к.с.)" },
      { label: "Рік випуску", value: "2021" },
    ],
    images: [
      {
        url: "https://images.unsplash.com/photo-1616455579100-2ceaa4eb2d37?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=600",
        alt: "MAN TGS 33.400 — самоскид",
      },
    ],
    bookedPeriods: [{ from: "2026-03-19", to: "2026-03-21" }],
  },
];

async function main() {
  console.log("🌱 Seeding database...");

  // Перевірити чи вже є дані
  const existingEquipment = await prisma.equipment.count();
  if (existingEquipment > 0) {
    console.log("  ℹ️ Database already seeded, skipping.");
    return;
  }

  // Створити адміна
  const adminEmail = process.env.ADMIN_EMAIL || "admin";
  const adminPassword = process.env.ADMIN_PASSWORD || "password";
  const passwordHash = await hash(adminPassword, 12);

  await prisma.admin.create({
    data: {
      email: adminEmail,
      passwordHash,
      role: "ADMIN",
    },
  });
  console.log(`  ✅ Admin created: ${adminEmail}`);

  // Створити техніку
  for (const item of equipmentList) {
    await prisma.equipment.create({
      data: {
        slug: item.slug,
        name: item.name,
        brand: item.brand,
        type: mapType(item.type),
        description: item.description,
        pricePerHour: item.pricePerHour,
        isPopular: item.isPopular,
        specs: {
          create: item.specs,
        },
        images: {
          create: item.images,
        },
        bookedPeriods: {
          create: item.bookedPeriods.map((bp) => ({
            from: new Date(bp.from),
            to: new Date(bp.to),
            note: bp.note ?? null,
          })),
        },
      },
    });
    console.log(`  ✅ ${item.name}`);
  }

  console.log("🎉 Seed complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
