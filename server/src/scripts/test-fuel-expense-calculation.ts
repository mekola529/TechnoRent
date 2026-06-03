import { pool } from "../lib/db.js";
import { upsertAutomaticFuelExpenseForExecution } from "../lib/execution-fuel-expense.js";
import { getFuelBalance } from "../lib/finance.js";

const MARKER = "TEST_FUEL_AUTOCALC";

async function ensureFuelColumns() {
  await pool.query(`ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "fuelConsumptionPer100Km" DOUBLE PRECISION`);
  await pool.query(`ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "fuelConsumptionPerEngineHour" DOUBLE PRECISION`);
  await pool.query(`ALTER TABLE "EquipmentExpense" ALTER COLUMN "equipmentId" DROP NOT NULL`);
  await pool.query(`ALTER TABLE "OrderExpense" ADD COLUMN IF NOT EXISTS "fuelLiters" NUMERIC(12,2)`);
  await pool.query(`ALTER TABLE "OrderExpense" ADD COLUMN IF NOT EXISTS "fuelPricePerLiter" NUMERIC(12,2)`);
}

async function cleanup() {
  await pool.query(
    `DELETE FROM "RentOrder"
     WHERE "comment" LIKE $1`,
    [`%${MARKER}%`],
  );
  await pool.query(
    `DELETE FROM "EquipmentExpense"
     WHERE "comment" LIKE $1`,
    [`%${MARKER}%`],
  );
  await pool.query(
    `DELETE FROM "Equipment"
     WHERE "slug" = $1`,
    ["test-fuel-autocalc-equipment"],
  );
}

async function main() {
  await ensureFuelColumns();
  await cleanup();
  const balanceBefore = await getFuelBalance();

  const equipmentRes = await pool.query<{ id: string }>(
    `INSERT INTO "Equipment" (
       "slug",
       "name",
       "brand",
       "type",
       "description",
       "pricingType",
       "pricePerHour",
       "fuelConsumptionPer100Km",
       "fuelConsumptionPerEngineHour",
       "updatedAt"
     )
     VALUES ($1, $2, $3, $4, $5, 'hourly_from', 1000, 20, NULL, NOW())
     RETURNING "id"`,
    [
      "test-fuel-autocalc-equipment",
      "Тестова техніка для розрахунку пального",
      "Test",
      "Тест",
      MARKER,
    ],
  );
  const equipmentId = equipmentRes.rows[0].id;

  await pool.query(
    `INSERT INTO "EquipmentExpense" (
       "equipmentId",
       "type",
       "expenseDate",
       "amount",
       "fuelLiters",
       "fuelPricePerLiter",
       "comment",
       "updatedAt"
     )
     VALUES (NULL, 'fuel', CURRENT_DATE, 2750, 50, 55, $1, NOW())`,
    [`${MARKER}: загальна закупівля пального`],
  );

  const orderRes = await pool.query<{ id: string }>(
    `INSERT INTO "RentOrder" (
       "customerName",
       "customerPhone",
       "status",
       "comment",
       "updatedAt"
     )
     VALUES ('Тестовий клієнт', '+380000000000', 'WORKER_COMPLETED', $1, NOW())
     RETURNING "id"`,
    [`${MARKER}: тестове замовлення`],
  );
  const orderId = orderRes.rows[0].id;

  await pool.query(
    `INSERT INTO "RentOrderItem" ("rentOrderId", "equipmentId", "startDate", "endDate")
     VALUES ($1, $2, NOW() - INTERVAL '2 hours', NOW())`,
    [orderId, equipmentId],
  );

  const sessionRes = await pool.query<{ id: string }>(
    `INSERT INTO "WorkExecutionSession" (
       "orderId",
       "status",
       "startedAt",
       "finishedAt",
       "equipmentId",
       "updatedAt"
     )
     VALUES ($1, 'FINISHED', NOW() - INTERVAL '2 hours', NOW(), $2, NOW())
     RETURNING "id"`,
    [orderId, equipmentId],
  );
  const executionSessionId = sessionRes.rows[0].id;

  await pool.query(
    `INSERT INTO "WorkExecutionReport" (
       "executionSessionId",
       "distanceKm",
       "engineHours",
       "questionnaireStatus",
       "updatedAt"
     )
     VALUES ($1, 120, NULL, 'COMPLETED', NOW())`,
    [executionSessionId],
  );

  const result = await upsertAutomaticFuelExpenseForExecution(executionSessionId);
  const balanceAfterConsumption = await getFuelBalance();

  await pool.query(
    `INSERT INTO "EquipmentExpense" (
       "equipmentId",
       "type",
       "expenseDate",
       "amount",
       "fuelLiters",
       "fuelPricePerLiter",
       "comment",
       "updatedAt"
     )
     VALUES (NULL, 'fuel', CURRENT_DATE, 550, 10, 55, $1, NOW())`,
    [`${MARKER}: закупівля пального працівником на загальний баланс`],
  );
  await pool.query(
    `INSERT INTO "OrderExpense" (
       "rentOrderId",
       "equipmentId",
       "employeeId",
       "type",
       "amount",
       "fuelLiters",
       "fuelPricePerLiter",
       "comment",
       "source",
       "expenseAt",
       "updatedAt"
     )
     VALUES ($1, $2, NULL, 'fuel_purchase', 550, NULL, NULL, $3, 'employee', NOW(), NOW())`,
    [orderId, equipmentId, `${MARKER}: компенсація працівнику за куплене пальне`],
  );
  const balanceAfterWorkerPurchase = await getFuelBalance();

  const expenseRes = await pool.query(
    `SELECT
       "type",
       "amount",
       "fuelLiters",
       "source",
       "comment"
     FROM "OrderExpense"
     WHERE "rentOrderId" = $1
     ORDER BY "createdAt" DESC
     LIMIT 1`,
    [orderId],
  );

  console.log(JSON.stringify({
    test: MARKER,
    input: {
      distanceKm: 120,
      fuelConsumptionPer100Km: 20,
      latestFuelPricePerLiter: 55,
      expectedLiters: 24,
      expectedAmount: 1320,
    },
    result,
    balanceBefore,
    balanceAfterConsumption,
    balanceAfterWorkerPurchase,
    balanceDelta: {
      purchasedLiters: Number((balanceAfterWorkerPurchase.purchasedLiters - balanceBefore.purchasedLiters).toFixed(2)),
      consumedLiters: Number((balanceAfterConsumption.consumedLiters - balanceBefore.consumedLiters).toFixed(2)),
      balanceLiters: Number((balanceAfterWorkerPurchase.balanceLiters - balanceBefore.balanceLiters).toFixed(2)),
    },
    latestStoredExpense: expenseRes.rows[0] ?? null,
  }, null, 2));

  await cleanup();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
