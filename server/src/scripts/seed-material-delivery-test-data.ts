import "../env.js";

import { pool } from "../lib/db.js";
import { initSchema } from "../lib/schema.js";

const materials = [
  {
    name: "Пісок річковий",
    slug: "pisok-richkovyi",
    unit: "т",
    minOrderQuantity: 5,
    sortOrder: 10,
  },
  {
    name: "Щебінь 20-40",
    slug: "shchebin-20-40",
    unit: "т",
    minOrderQuantity: 5,
    sortOrder: 20,
  },
  {
    name: "Чорнозем",
    slug: "chornozem",
    unit: "м3",
    minOrderQuantity: 3,
    sortOrder: 30,
  },
] as const;

const supplierPoints = [
  {
    name: "Тестовий склад Сокільники",
    address: "Сокільники, Львівський район, Львівська область, Україна",
    latitude: 49.7785,
    longitude: 23.9528,
    contactName: "Іван",
    contactPhone: "+380671110001",
    workHours: "Пн-Сб 08:00-18:00",
    notes: "Тестова точка для калькулятора доставки матеріалів.",
  },
  {
    name: "Тестовий кар'єр Пустомити",
    address: "Пустомити, Львівський район, Львівська область, Україна",
    latitude: 49.7161,
    longitude: 23.9124,
    contactName: "Петро",
    contactPhone: "+380671110002",
    workHours: "Пн-Пт 08:00-17:00",
    notes: "Тестовий кар'єр з піском та щебенем.",
  },
  {
    name: "Тестова база Рясне",
    address: "Рясне, Львів, Львівська область, Україна",
    latitude: 49.8708,
    longitude: 23.9126,
    contactName: "Олег",
    contactPhone: "+380671110003",
    workHours: "Щодня 09:00-19:00",
    notes: "Тестова точка на північному заході Львова.",
  },
] as const;

const offerMatrix: Record<string, Record<string, number>> = {
  "Тестовий склад Сокільники": {
    "pisok-richkovyi": 620,
    "shchebin-20-40": 850,
    chornozem: 540,
  },
  "Тестовий кар'єр Пустомити": {
    "pisok-richkovyi": 580,
    "shchebin-20-40": 790,
  },
  "Тестова база Рясне": {
    "shchebin-20-40": 910,
    chornozem: 500,
  },
};

async function upsertMaterial(material: typeof materials[number]) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO "Material" (
       "name", "slug", "unit", "isActive", "minOrderQuantity", "sortOrder", "updatedAt"
     )
     VALUES ($1, $2, $3, true, $4, $5, NOW())
     ON CONFLICT ("slug")
     DO UPDATE SET
       "name" = EXCLUDED."name",
       "unit" = EXCLUDED."unit",
       "isActive" = true,
       "minOrderQuantity" = EXCLUDED."minOrderQuantity",
       "sortOrder" = EXCLUDED."sortOrder",
       "updatedAt" = NOW()
     RETURNING "id"`,
    [material.name, material.slug, material.unit, material.minOrderQuantity, material.sortOrder],
  );
  return rows[0].id;
}

async function upsertSupplierPoint(point: typeof supplierPoints[number]) {
  const existing = await pool.query<{ id: string }>(
    `SELECT "id" FROM "SupplierPoint" WHERE "name" = $1 LIMIT 1`,
    [point.name],
  );

  if (existing.rows[0]) {
    const { rows } = await pool.query<{ id: string }>(
      `UPDATE "SupplierPoint"
       SET
         "address" = $2,
         "latitude" = $3,
         "longitude" = $4,
         "isActive" = true,
         "contactName" = $5,
         "contactPhone" = $6,
         "workHours" = $7,
         "notes" = $8,
         "updatedAt" = NOW()
       WHERE "id" = $1
       RETURNING "id"`,
      [
        existing.rows[0].id,
        point.address,
        point.latitude,
        point.longitude,
        point.contactName,
        point.contactPhone,
        point.workHours,
        point.notes,
      ],
    );
    return rows[0].id;
  }

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO "SupplierPoint" (
       "name", "address", "latitude", "longitude", "isActive",
       "contactName", "contactPhone", "workHours", "notes", "updatedAt"
     )
     VALUES ($1, $2, $3, $4, true, $5, $6, $7, $8, NOW())
     RETURNING "id"`,
    [
      point.name,
      point.address,
      point.latitude,
      point.longitude,
      point.contactName,
      point.contactPhone,
      point.workHours,
      point.notes,
    ],
  );
  return rows[0].id;
}

async function main() {
  await initSchema();
  await ensureMaterialDeliveryService();
  await ensureDumpTruckBaseAndTracker();

  const materialIds = new Map<string, string>();
  for (const material of materials) {
    materialIds.set(material.slug, await upsertMaterial(material));
  }

  const pointIds = new Map<string, string>();
  for (const point of supplierPoints) {
    pointIds.set(point.name, await upsertSupplierPoint(point));
  }

  for (const [pointName, offers] of Object.entries(offerMatrix)) {
    const supplierPointId = pointIds.get(pointName);
    if (!supplierPointId) continue;

    for (const [materialSlug, unitPrice] of Object.entries(offers)) {
      const materialId = materialIds.get(materialSlug);
      if (!materialId) continue;

      await pool.query(
        `INSERT INTO "SupplierMaterialOffer" (
           "supplierPointId", "materialId", "unitPrice", "isAvailable",
           "minOrderQuantity", "lastPriceUpdatedAt", "notes", "updatedAt"
         )
         VALUES ($1, $2, $3, true, NULL, NOW(), $4, NOW())
         ON CONFLICT ("supplierPointId", "materialId")
         DO UPDATE SET
           "unitPrice" = EXCLUDED."unitPrice",
           "isAvailable" = true,
           "lastPriceUpdatedAt" = NOW(),
           "notes" = EXCLUDED."notes",
           "updatedAt" = NOW()`,
        [
          supplierPointId,
          materialId,
          unitPrice,
          "Тестова ціна для перевірки калькулятора доставки.",
        ],
      );
    }
  }

  const counts = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS count FROM "Material"`),
    pool.query(`SELECT COUNT(*)::int AS count FROM "SupplierPoint"`),
    pool.query(`SELECT COUNT(*)::int AS count FROM "SupplierMaterialOffer"`),
  ]);

  console.log("Material delivery test data seeded:");
  console.log({
    materials: counts[0].rows[0].count,
    supplierPoints: counts[1].rows[0].count,
    supplierOffers: counts[2].rows[0].count,
  });
}

async function ensureMaterialDeliveryService() {
  await pool.query(
    `INSERT INTO "Service" (
       "slug",
       "title",
       "shortDescription",
       "fullDescription",
       "image",
       "priceInfo",
       "pricingType",
       "deliveryRatePerKm",
       "relatedEquipmentTypes",
       "features",
       "seoTitle",
       "seoDescription",
       "isActive",
       "sortOrder",
       "updatedAt"
     )
     VALUES (
       'perevezennia-sypuchyh-materialiv',
       'Доставка сипучих матеріалів',
       'Пісок, щебінь, чорнозем та інші матеріали з доставкою самоскидом на вашу адресу.',
       'Оберіть матеріал, кількість і адресу доставки. Калькулятор покаже попередню суму за матеріал і перевезення.',
       'https://images.unsplash.com/photo-1616455579100-2ceaa4eb2d37?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920',
       'Попередній розрахунок за матеріалом, кількістю та адресою доставки',
       'material_delivery_calculator',
       45,
       ARRAY['Самоскид']::text[],
       ARRAY[
         'Вибір доступного матеріалу',
         'Розрахунок матеріалу й доставки',
         'Подача самоскида за підтвердженою заявкою'
       ]::text[],
       'Доставка сипучих матеріалів у Львові | TechnoRent',
       'Доставка піску, щебеню та чорнозему у Львові й області. Оберіть матеріал і адресу для попереднього розрахунку.',
       true,
       7,
       NOW()
     )
     ON CONFLICT ("slug")
     DO UPDATE SET
       "title" = EXCLUDED."title",
       "shortDescription" = EXCLUDED."shortDescription",
       "fullDescription" = EXCLUDED."fullDescription",
       "priceInfo" = EXCLUDED."priceInfo",
       "pricingType" = EXCLUDED."pricingType",
       "deliveryRatePerKm" = EXCLUDED."deliveryRatePerKm",
       "relatedEquipmentTypes" = EXCLUDED."relatedEquipmentTypes",
       "features" = EXCLUDED."features",
       "seoTitle" = EXCLUDED."seoTitle",
       "seoDescription" = EXCLUDED."seoDescription",
       "isActive" = true,
       "updatedAt" = NOW()`,
  );
}

async function ensureDumpTruckBaseAndTracker() {
  const base = {
    address: "вулиця Городоцька, Львів, Львівська область, Україна",
    latitude: 49.8293,
    longitude: 23.9346,
  };

  let equipmentResult = await pool.query<{ id: string }>(
    `SELECT "id" FROM "Equipment" WHERE "type" = 'Самоскид' ORDER BY "createdAt" ASC LIMIT 1`,
  );

  if (!equipmentResult.rows[0]) {
    equipmentResult = await pool.query<{ id: string }>(
      `INSERT INTO "Equipment" (
         "slug", "name", "brand", "type", "description", "pricePerHour",
         "isPopular", "baseAddress", "baseLatitude", "baseLongitude", "updatedAt"
       )
       VALUES (
         'testovyi-samoskyd-dostavka',
         'Тестовий самоскид доставка',
         'MAN',
         'Самоскид',
         'Тестова техніка для перевірки калькулятора доставки матеріалів.',
         950,
         false,
         $1,
         $2,
         $3,
         NOW()
       )
       ON CONFLICT ("slug")
       DO UPDATE SET
         "baseAddress" = EXCLUDED."baseAddress",
         "baseLatitude" = EXCLUDED."baseLatitude",
         "baseLongitude" = EXCLUDED."baseLongitude",
         "updatedAt" = NOW()
       RETURNING "id"`,
      [base.address, base.latitude, base.longitude],
    );
  }

  await pool.query(
    `UPDATE "Equipment"
     SET
       "baseAddress" = COALESCE("baseAddress", $1),
       "baseLatitude" = COALESCE("baseLatitude", $2),
       "baseLongitude" = COALESCE("baseLongitude", $3),
       "updatedAt" = NOW()
     WHERE "type" = 'Самоскид'`,
    [base.address, base.latitude, base.longitude],
  );

  const gpsResult = await pool.query(
    `SELECT td."id"
     FROM "TrackerDevice" td
     INNER JOIN "Equipment" e ON e."id" = td."equipmentId"
     WHERE e."type" = 'Самоскид'
       AND td."lastLatitude" IS NOT NULL
       AND td."lastLongitude" IS NOT NULL
     LIMIT 1`,
  );
  if (gpsResult.rows[0]) return;

  await pool.query(
    `INSERT INTO "TrackerDevice" (
       "name", "equipmentId", "lastAddress", "lastLatitude", "lastLongitude",
       "lastEventText", "lastTrackerAt", "updatedAt"
     )
     VALUES (
       'Тест GPS Самоскид доставка',
       $1,
       $2,
       $3,
       $4,
       'Тестова GPS-позиція для калькулятора доставки',
       NOW(),
       NOW()
     )
     ON CONFLICT ("name")
     DO UPDATE SET
       "equipmentId" = EXCLUDED."equipmentId",
       "lastAddress" = EXCLUDED."lastAddress",
       "lastLatitude" = EXCLUDED."lastLatitude",
       "lastLongitude" = EXCLUDED."lastLongitude",
       "lastEventText" = EXCLUDED."lastEventText",
       "lastTrackerAt" = NOW(),
       "updatedAt" = NOW()`,
    [
      equipmentResult.rows[0].id,
      "вулиця Зелена, Львів, Львівська область, Україна",
      49.8152,
      24.0589,
    ],
  );
}

main()
  .catch((error) => {
    console.error("Failed to seed material delivery test data:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
