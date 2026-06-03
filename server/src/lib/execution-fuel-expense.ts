import { pool } from "./db.js";
import { recalculateOrderFinanceState } from "./finance.js";
import { logError } from "./logger.js";

type DbClient = Pick<typeof pool, "query">;

type FuelCalculationResult =
  | {
      status: "created" | "updated";
      amount: number;
      liters: number;
      pricePerLiter: number;
      method: "engine_hours" | "distance";
    }
  | { status: "skipped"; reason: string };

type ManualEquipmentMetric = {
  equipmentId: string;
  distanceKm: number | null;
  engineHours: number | null;
};

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseManualEquipmentMetrics(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.manualEquipmentMetrics)) {
    return [] as ManualEquipmentMetric[];
  }

  return value.manualEquipmentMetrics
    .map((item) => {
      if (!isRecord(item) || typeof item.equipmentId !== "string" || item.equipmentId.trim() === "") {
        return null;
      }

      return {
        equipmentId: item.equipmentId.trim(),
        distanceKm: toNumber(item.distanceKm),
        engineHours: toNumber(item.engineHours),
      } satisfies ManualEquipmentMetric;
    })
    .filter((item): item is ManualEquipmentMetric => Boolean(item));
}

function parseGpsEquipmentMetrics(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.equipmentMetrics)) {
    return [] as Array<{
      equipmentId: string;
      distanceKm: number | null;
      engineHours: number | null;
    }>;
  }

  return value.equipmentMetrics
    .map((item) => {
      if (!isRecord(item) || typeof item.equipmentId !== "string" || item.equipmentId.trim() === "") {
        return null;
      }
      return {
        equipmentId: item.equipmentId.trim(),
        distanceKm: toNumber(item.distanceKm),
        engineHours: toNumber(item.engineHours),
      };
    })
    .filter(
      (
        item,
      ): item is {
        equipmentId: string;
        distanceKm: number | null;
        engineHours: number | null;
      } => Boolean(item),
    );
}

function buildFuelCalculation(input: {
  distanceKm: number | null;
  engineHours: number | null;
  consumptionPer100Km: number | null;
  consumptionPerEngineHour: number | null;
}) {
  if (
    input.engineHours != null &&
    input.engineHours > 0 &&
    input.consumptionPerEngineHour != null &&
    input.consumptionPerEngineHour > 0
  ) {
    return {
      liters: round(input.engineHours * input.consumptionPerEngineHour),
      method: "engine_hours" as const,
      rate: input.consumptionPerEngineHour,
    };
  }

  if (
    input.distanceKm != null &&
    input.distanceKm > 0 &&
    input.consumptionPer100Km != null &&
    input.consumptionPer100Km > 0
  ) {
    return {
      liters: round((input.distanceKm * input.consumptionPer100Km) / 100),
      method: "distance" as const,
      rate: input.consumptionPer100Km,
    };
  }

  return null;
}

export async function upsertAutomaticFuelExpenseForExecution(
  executionSessionId: string,
  db: DbClient = pool,
): Promise<FuelCalculationResult> {
  const contextRes = await db.query(
    `SELECT
       wes."id" AS "executionSessionId",
       wes."orderId",
       wes."equipmentId",
       wer."distanceKm",
       wer."engineHours",
       wer."gpsSnapshotJson",
       e."name" AS "equipmentName",
       e."fuelConsumptionPer100Km",
       e."fuelConsumptionPerEngineHour"
     FROM "WorkExecutionSession" wes
     INNER JOIN "WorkExecutionReport" wer ON wer."executionSessionId" = wes."id"
     LEFT JOIN "Equipment" e ON e."id" = wes."equipmentId"
     WHERE wes."id" = $1
     LIMIT 1`,
    [executionSessionId],
  );

  const context = contextRes.rows[0];
  if (!context?.orderId || !context.equipmentId) {
    return { status: "skipped", reason: "missing_order_or_equipment" };
  }

  const latestFuelPurchaseRes = await db.query(
    `SELECT
       "fuelPricePerLiter",
       "expenseDate",
       "equipmentId"
     FROM "EquipmentExpense"
     WHERE "type" = 'fuel'
       AND "fuelPricePerLiter" IS NOT NULL
       AND "fuelPricePerLiter" > 0
     ORDER BY "expenseDate" DESC, "createdAt" DESC
     LIMIT 1`,
  );
  const latestFuelPurchase = latestFuelPurchaseRes.rows[0];
  const pricePerLiter = toNumber(latestFuelPurchase?.fuelPricePerLiter);
  if (!pricePerLiter || pricePerLiter <= 0) {
    return { status: "skipped", reason: "missing_latest_fuel_purchase_price" };
  }

  const manualExtraMetrics = parseManualEquipmentMetrics(context.gpsSnapshotJson).filter(
    (metric) => metric.equipmentId !== context.equipmentId,
  );
  const gpsExtraMetrics = parseGpsEquipmentMetrics(context.gpsSnapshotJson).filter(
    (metric) => metric.equipmentId !== context.equipmentId,
  );
  const manualByEquipmentId = new Map(manualExtraMetrics.map((metric) => [metric.equipmentId, metric]));
  const mergedExtraMetrics = [
    ...manualExtraMetrics,
    ...gpsExtraMetrics.filter((metric) => !manualByEquipmentId.has(metric.equipmentId)),
  ];

  const extraEquipmentIds = Array.from(new Set(mergedExtraMetrics.map((metric) => metric.equipmentId)));
  const extraEquipmentRes = extraEquipmentIds.length > 0
    ? await db.query(
        `SELECT
           "id",
           "name",
           "fuelConsumptionPer100Km",
           "fuelConsumptionPerEngineHour"
         FROM "Equipment"
         WHERE "id" = ANY($1)`,
        [extraEquipmentIds],
      )
    : { rows: [] };
  const extraEquipmentMap = new Map(
    extraEquipmentRes.rows.map((row) => [
      String(row.id),
      {
        equipmentId: String(row.id),
        equipmentName: typeof row.name === "string" ? row.name : String(row.id),
        consumptionPer100Km: toNumber(row.fuelConsumptionPer100Km),
        consumptionPerEngineHour: toNumber(row.fuelConsumptionPerEngineHour),
      },
    ]),
  );

  const desiredExpenses = [] as Array<{
    marker: string;
    equipmentId: string;
    equipmentName: string;
    distanceKm: number | null;
    engineHours: number | null;
    liters: number;
    amount: number;
    method: "engine_hours" | "distance";
    rate: number;
  }>;

  const mainCalculation = buildFuelCalculation({
    distanceKm: toNumber(context.distanceKm),
    engineHours: toNumber(context.engineHours),
    consumptionPer100Km: toNumber(context.fuelConsumptionPer100Km),
    consumptionPerEngineHour: toNumber(context.fuelConsumptionPerEngineHour),
  });
  if (mainCalculation && mainCalculation.liters > 0) {
    desiredExpenses.push({
      marker: `execution:${executionSessionId}`,
      equipmentId: String(context.equipmentId),
      equipmentName: typeof context.equipmentName === "string" ? context.equipmentName : String(context.equipmentId),
      distanceKm: toNumber(context.distanceKm),
      engineHours: toNumber(context.engineHours),
      liters: mainCalculation.liters,
      amount: round(mainCalculation.liters * pricePerLiter),
      method: mainCalculation.method,
      rate: mainCalculation.rate,
    });
  }

  for (const metric of mergedExtraMetrics) {
    const equipment = extraEquipmentMap.get(metric.equipmentId);
    if (!equipment) continue;
    const calculation = buildFuelCalculation({
      distanceKm: metric.distanceKm,
      engineHours: metric.engineHours,
      consumptionPer100Km: equipment.consumptionPer100Km,
      consumptionPerEngineHour: equipment.consumptionPerEngineHour,
    });
    if (!calculation || calculation.liters <= 0) continue;

    desiredExpenses.push({
      marker: `execution-extra:${executionSessionId}:${metric.equipmentId}`,
      equipmentId: metric.equipmentId,
      equipmentName: equipment.equipmentName,
      distanceKm: metric.distanceKm,
      engineHours: metric.engineHours,
      liters: calculation.liters,
      amount: round(calculation.liters * pricePerLiter),
      method: calculation.method,
      rate: calculation.rate,
    });
  }

  const existingRes = await db.query(
    `SELECT "id", "comment"
     FROM "OrderExpense"
     WHERE "rentOrderId" = $1
       AND "type" = 'fuel'
       AND "source" = 'system'
       AND (
         "comment" LIKE $2
         OR "comment" LIKE $3
       )`,
    [context.orderId, `%execution:${executionSessionId}%`, `%execution-extra:${executionSessionId}:%`],
  );

  const existingByMarker = new Map<string, string>();
  for (const row of existingRes.rows) {
    const comment = typeof row.comment === "string" ? row.comment : "";
    const markerLine = comment
      .split("\n")
      .find((line: string) => line.startsWith("execution:") || line.startsWith("execution-extra:"));
    if (markerLine) {
      existingByMarker.set(markerLine, String(row.id));
    }
  }

  const desiredMarkers = new Set(desiredExpenses.map((entry) => entry.marker));
  for (const [marker, expenseId] of existingByMarker.entries()) {
    if (!desiredMarkers.has(marker)) {
      await db.query(`DELETE FROM "OrderExpense" WHERE "id" = $1`, [expenseId]);
    }
  }

  let hasUpdatedExisting = false;
  let totalAmount = 0;
  let totalLiters = 0;
  let primaryMethod: "engine_hours" | "distance" | null = null;

  for (const entry of desiredExpenses) {
    totalAmount = round(totalAmount + entry.amount);
    totalLiters = round(totalLiters + entry.liters);
    if (!primaryMethod) primaryMethod = entry.method;

    const comment = [
      "Автоматичний розрахунок пального",
      entry.marker,
      `Техніка: ${entry.equipmentName}`,
      entry.method === "engine_hours"
        ? `Метод: ${entry.engineHours} м/г × ${entry.rate} л/м/г`
        : `Метод: ${entry.distanceKm} км × ${entry.rate} л/100км`,
      `Літри: ${entry.liters}`,
      `Ціна: ${pricePerLiter} грн/л`,
    ].join("\n");

    const existingId = existingByMarker.get(entry.marker);
    if (existingId) {
      hasUpdatedExisting = true;
      await db.query(
        `UPDATE "OrderExpense"
         SET "equipmentId" = $1,
             "executionSessionId" = $2,
             "amount" = $3,
             "fuelLiters" = $4,
             "fuelPricePerLiter" = $5,
             "comment" = $6,
             "expenseAt" = NOW(),
             "updatedAt" = NOW()
         WHERE "id" = $7`,
        [entry.equipmentId, executionSessionId, entry.amount, entry.liters, pricePerLiter, comment, existingId],
      );
    } else {
      await db.query(
        `INSERT INTO "OrderExpense" (
           "rentOrderId",
           "executionSessionId",
           "equipmentId",
           "type",
           "amount",
           "fuelLiters",
           "fuelPricePerLiter",
           "comment",
           "source",
           "expenseAt",
           "updatedAt"
         )
         VALUES ($1, $2, $3, 'fuel', $4, $5, $6, $7, 'system', NOW(), NOW())`,
        [context.orderId, executionSessionId, entry.equipmentId, entry.amount, entry.liters, pricePerLiter, comment],
      );
    }
  }

  if (desiredExpenses.length === 0) {
    await recalculateOrderFinanceState(context.orderId, db);
    return { status: "skipped", reason: "missing_consumption_rate_or_metric" };
  }

  await db.query(
    `INSERT INTO "OrderEventLog" ("orderId", "eventType", "payload")
     VALUES ($1, 'system_fuel_expense_calculated', $2)`,
    [
      context.orderId,
      JSON.stringify({
        executionSessionId,
        equipmentIds: desiredExpenses.map((entry) => entry.equipmentId),
        liters: totalLiters,
        pricePerLiter,
        amount: totalAmount,
        entries: desiredExpenses.map((entry) => ({
          equipmentId: entry.equipmentId,
          liters: entry.liters,
          amount: entry.amount,
          method: entry.method,
        })),
      }),
    ],
  );

  await recalculateOrderFinanceState(context.orderId, db);

  return {
    status: hasUpdatedExisting ? "updated" : "created",
    amount: totalAmount,
    liters: totalLiters,
    pricePerLiter,
    method: primaryMethod ?? "distance",
  };
}

export async function safelyUpsertAutomaticFuelExpenseForExecution(executionSessionId: string) {
  try {
    return await upsertAutomaticFuelExpenseForExecution(executionSessionId);
  } catch (error) {
    logError("automatic fuel expense calculation failed:", error);
    return {
      status: "skipped" as const,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
