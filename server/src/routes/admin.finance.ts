import ExcelJS from "exceljs";
import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { pool } from "../lib/db.js";
import { logError } from "../lib/logger.js";
import {
  equipmentExpenseTypes,
  financePaymentMethods,
  getClientDebts,
  getEmployeeBalances,
  getFinanceByEquipment,
  getFinanceOrders,
  getFinanceByService,
  getFinanceSummary,
  listEquipmentExpenses,
  settlementDirections,
} from "../lib/finance.js";

export const adminFinanceRouter = Router();

adminFinanceRouter.use(authMiddleware);

const dateRangeQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const equipmentExpenseQuerySchema = dateRangeQuerySchema.extend({
  equipmentId: z.string().optional(),
  type: z.string().optional(),
});

const equipmentExpenseSchema = z.object({
  equipmentId: z.string().trim().min(1).optional().nullable(),
  type: z.enum(equipmentExpenseTypes),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.coerce.number().min(0).optional().nullable(),
  fuelLiters: z.coerce.number().min(0).optional().nullable(),
  fuelPricePerLiter: z.coerce.number().min(0).optional().nullable(),
  comment: z.string().trim().max(3000).optional().nullable(),
});

const employeeSettlementSchema = z.object({
  employeeId: z.string().trim().min(1).optional().nullable(),
  fromEmployeeId: z.string().trim().min(1).optional().nullable(),
  toEmployeeId: z.string().trim().min(1).optional().nullable(),
  amount: z.coerce.number().min(0.01),
  direction: z.enum(settlementDirections),
  method: z.enum(financePaymentMethods),
  settledAt: z.string().optional().nullable(),
  comment: z.string().trim().max(3000).optional().nullable(),
});

function parseRange(query: unknown) {
  return dateRangeQuerySchema.parse(query);
}

function parseEquipmentExpensesQuery(query: unknown) {
  return equipmentExpenseQuerySchema.parse(query);
}

function calculateEquipmentExpenseAmount(input: {
  amount?: number | null;
  fuelLiters?: number | null;
  fuelPricePerLiter?: number | null;
}) {
  if (input.amount !== null && input.amount !== undefined) return input.amount;
  if (input.fuelLiters != null && input.fuelPricePerLiter != null) {
    return Math.round((input.fuelLiters * input.fuelPricePerLiter + Number.EPSILON) * 100) / 100;
  }
  return 0;
}

const paymentStatusLabels: Record<string, string> = {
  UNPAID: "Не оплачено",
  PARTIALLY_PAID: "Частково оплачено",
  PAID: "Оплачено",
  OVERPAID: "Переплата",
};

const workerSettlementStatusLabels: Record<string, string> = {
  NOT_SETTLED: "Не розраховано",
  PARTIALLY_SETTLED: "Частково розраховано",
  SETTLED: "Розраховано",
  EMPLOYEE_OWES_COMPANY: "Працівник винен компанії",
  COMPANY_OWES_EMPLOYEE: "Компанія винна працівнику",
};

const equipmentExpenseTypeLabels: Record<string, string> = {
  fuel: "Пальне",
  materials: "Сипучі матеріали",
  maintenance: "Обслуговування",
  repair: "Ремонт",
  parts: "Запчастини",
  insurance: "Страхування",
  wash: "Мийка",
  other: "Інше",
};

function fmtMoney(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("uk-UA");
}

function styleWorksheetHeader(worksheet: ExcelJS.Worksheet) {
  const header = worksheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  header.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF4E7" },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFD9D9D9" } },
      left: { style: "thin", color: { argb: "FFD9D9D9" } },
      bottom: { style: "thin", color: { argb: "FFD9D9D9" } },
      right: { style: "thin", color: { argb: "FFD9D9D9" } },
    };
  });
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
}

function autosizeWorksheet(worksheet: ExcelJS.Worksheet) {
  worksheet.columns.forEach((column) => {
    let maxLength = 12;
    if (!column.eachCell) {
      column.width = maxLength;
      return;
    }
    column.eachCell({ includeEmpty: true }, (cell) => {
      const value = cell.value == null ? "" : String(cell.value);
      maxLength = Math.max(maxLength, value.length + 2);
    });
    column.width = Math.min(maxLength, 40);
  });
}

async function ensureEquipmentExists(equipmentId: string) {
  const result = await pool.query(`SELECT "id" FROM "Equipment" WHERE "id" = $1 LIMIT 1`, [equipmentId]);
  return result.rows[0] ?? null;
}

async function ensureEmployeeExists(employeeId: string) {
  const result = await pool.query(`SELECT "id" FROM "Employee" WHERE "id" = $1 LIMIT 1`, [employeeId]);
  return result.rows[0] ?? null;
}

adminFinanceRouter.get("/summary", async (req, res) => {
  try {
    const range = parseRange(req.query);
    res.json(await getFinanceSummary(range));
  } catch (e) {
    logError("GET /api/admin/finance/summary error:", e);
    res.status(500).json({ error: e instanceof Error ? e.message : "Помилка сервера" });
  }
});

adminFinanceRouter.get("/by-equipment", async (req, res) => {
  try {
    const range = parseRange(req.query);
    res.json(await getFinanceByEquipment(range));
  } catch (e) {
    logError("GET /api/admin/finance/by-equipment error:", e);
    res.status(500).json({ error: e instanceof Error ? e.message : "Помилка сервера" });
  }
});

adminFinanceRouter.get("/by-service", async (req, res) => {
  try {
    const range = parseRange(req.query);
    res.json(await getFinanceByService(range));
  } catch (e) {
    logError("GET /api/admin/finance/by-service error:", e);
    res.status(500).json({ error: e instanceof Error ? e.message : "Помилка сервера" });
  }
});

adminFinanceRouter.get("/client-debts", async (req, res) => {
  try {
    const range = parseRange(req.query);
    res.json(await getClientDebts(range));
  } catch (e) {
    logError("GET /api/admin/finance/client-debts error:", e);
    res.status(500).json({ error: e instanceof Error ? e.message : "Помилка сервера" });
  }
});

adminFinanceRouter.get("/employee-balances", async (req, res) => {
  try {
    const range = parseRange(req.query);
    res.json(await getEmployeeBalances(range));
  } catch (e) {
    logError("GET /api/admin/finance/employee-balances error:", e);
    res.status(500).json({ error: e instanceof Error ? e.message : "Помилка сервера" });
  }
});

adminFinanceRouter.post("/employee-settlements", validate(employeeSettlementSchema), async (req, res) => {
  try {
    const payload = req.body as z.infer<typeof employeeSettlementSchema>;
    const fromEmployeeId =
      payload.direction === "from_employee" || payload.direction === "employee_to_employee"
        ? payload.fromEmployeeId || payload.employeeId || null
        : null;
    const toEmployeeId =
      payload.direction === "to_employee" || payload.direction === "employee_to_employee"
        ? payload.toEmployeeId || payload.employeeId || null
        : null;

    if ((payload.direction === "from_employee" || payload.direction === "employee_to_employee") && !fromEmployeeId) {
      res.status(400).json({ error: "Потрібно вказати працівника, який передає кошти" });
      return;
    }
    if ((payload.direction === "to_employee" || payload.direction === "employee_to_employee") && !toEmployeeId) {
      res.status(400).json({ error: "Потрібно вказати працівника, який отримує кошти" });
      return;
    }
    if (payload.direction === "employee_to_employee" && fromEmployeeId === toEmployeeId) {
      res.status(400).json({ error: "Працівник не може передати кошти сам собі" });
      return;
    }

    const employeeIds = [fromEmployeeId, toEmployeeId, payload.employeeId ?? null].filter(
      (value, index, values): value is string => Boolean(value) && values.indexOf(value) === index,
    );
    for (const employeeId of employeeIds) {
      const employee = await ensureEmployeeExists(employeeId);
      if (!employee) {
        res.status(404).json({ error: "Працівника не знайдено" });
        return;
      }
    }

    const result = await pool.query(
      `INSERT INTO "EmployeeSettlement" (
         "employeeId",
         "rentOrderId",
         "amount",
         "direction",
         "fromEmployeeId",
         "toEmployeeId",
         "method",
         "settledAt",
         "comment",
         "updatedAt"
       )
       VALUES ($1, NULL, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()), $8, NOW())
       RETURNING *`,
      [
        payload.employeeId || toEmployeeId || fromEmployeeId,
        payload.amount,
        payload.direction,
        fromEmployeeId,
        toEmployeeId,
        payload.method,
        payload.settledAt || null,
        payload.comment ?? null,
      ],
    );

    res.status(201).json(result.rows[0]);
  } catch (e) {
    logError("POST /api/admin/finance/employee-settlements error:", e);
    res.status(500).json({ error: e instanceof Error ? e.message : "Помилка сервера" });
  }
});

adminFinanceRouter.get("/export.xlsx", async (req, res) => {
  try {
    const range = parseRange(req.query);
    const [summary, byEquipment, byService, orders, equipmentExpenses, employeeBalances] = await Promise.all([
      getFinanceSummary(range),
      getFinanceByEquipment(range),
      getFinanceByService(range),
      getFinanceOrders(range),
      listEquipmentExpenses({ ...range, equipmentId: "all", type: "all" }),
      getEmployeeBalances(range),
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "TechnoRent CRM";
    workbook.created = new Date();
    workbook.modified = new Date();

    const summarySheet = workbook.addWorksheet("Підсумок");
    summarySheet.columns = [
      { header: "Показник", key: "label", width: 32 },
      { header: "Значення", key: "value", width: 18 },
    ];
    summarySheet.addRows([
      { label: "Період від", value: range.from },
      { label: "Період до", value: range.to },
      { label: "Дохід", value: fmtMoney(summary.income) },
      { label: "Витрати", value: fmtMoney(summary.expenses) },
      { label: "Прибуток", value: fmtMoney(summary.profit) },
      { label: "Закупівля пального", value: fmtMoney(summary.fuelExpenses) },
      { label: "Закуплено пального, л", value: fmtMoney(summary.fuelPurchasedLiters) },
      { label: "Списано пального, л", value: fmtMoney(summary.fuelConsumedLiters) },
      { label: "Залишок пального, л", value: fmtMoney(summary.fuelBalanceLiters) },
      { label: "Обслуговування / ремонт", value: fmtMoney(summary.maintenanceExpenses) },
      { label: "Оплата працівників", value: fmtMoney(summary.workerCompensation) },
      { label: "Борги клієнтів", value: fmtMoney(summary.clientDebt) },
      { label: "Баланс з працівниками", value: fmtMoney(summary.workerBalance) },
    ]);
    styleWorksheetHeader(summarySheet);

    const equipmentSheet = workbook.addWorksheet("Техніка");
    equipmentSheet.columns = [
      { header: "Техніка", key: "equipmentName" },
      { header: "Замовлень", key: "ordersCount" },
      { header: "Дохід", key: "income" },
      { header: "Пальне, л", key: "fuelLiters" },
      { header: "Пальне, грн", key: "fuelExpenses" },
      { header: "Обслуговування", key: "maintenanceExpenses" },
      { header: "Інші витрати замовлень", key: "orderExpenses" },
      { header: "Зарплата", key: "workerCompensation" },
      { header: "Всього витрат", key: "totalExpenses" },
      { header: "Прибуток", key: "profit" },
    ];
    equipmentSheet.addRows(byEquipment.map((row) => ({
      ...row,
      income: fmtMoney(row.income),
      fuelLiters: fmtMoney(row.fuelLiters),
      fuelExpenses: fmtMoney(row.fuelExpenses),
      maintenanceExpenses: fmtMoney(row.maintenanceExpenses),
      orderExpenses: fmtMoney(row.orderExpenses),
      workerCompensation: fmtMoney(row.workerCompensation),
      totalExpenses: fmtMoney(row.totalExpenses),
      profit: fmtMoney(row.profit),
    })));
    styleWorksheetHeader(equipmentSheet);

    const serviceSheet = workbook.addWorksheet("Послуги");
    serviceSheet.columns = [
      { header: "Послуга", key: "serviceTitle" },
      { header: "Замовлень", key: "ordersCount" },
      { header: "Дохід", key: "income" },
      { header: "Пальне, л", key: "fuelLiters" },
      { header: "Пальне, грн", key: "fuelExpenses" },
      { header: "Витрати", key: "expenses" },
      { header: "Прибуток", key: "profit" },
    ];
    serviceSheet.addRows(byService.map((row) => ({
      ...row,
      income: fmtMoney(row.income),
      fuelLiters: fmtMoney(row.fuelLiters),
      fuelExpenses: fmtMoney(row.fuelExpenses),
      expenses: fmtMoney(row.expenses),
      profit: fmtMoney(row.profit),
    })));
    styleWorksheetHeader(serviceSheet);

    const ordersSheet = workbook.addWorksheet("Замовлення");
    ordersSheet.columns = [
      { header: "Замовлення", key: "orderId" },
      { header: "Дата закриття", key: "closedAt" },
      { header: "Клієнт", key: "customerName" },
      { header: "Телефон", key: "customerPhone" },
      { header: "Послуга", key: "serviceTitle" },
      { header: "Техніка", key: "equipmentNames" },
      { header: "Сума", key: "orderTotal" },
      { header: "Оплачено", key: "clientPaid" },
      { header: "Борг", key: "clientDebt" },
      { header: "Витрати", key: "orderExpenses" },
      { header: "Оплата працівника", key: "workerSalary" },
      { header: "Баланс працівника", key: "workerBalance" },
      { header: "Прибуток", key: "profit" },
      { header: "Статус оплати", key: "paymentStatus" },
      { header: "Статус розрахунку", key: "workerSettlementStatus" },
    ];
    ordersSheet.addRows(orders.map((row) => ({
      ...row,
      closedAt: fmtDateTime(row.closedAt),
      equipmentNames: row.equipmentNames.join(", "),
      orderTotal: fmtMoney(row.orderTotal),
      clientPaid: fmtMoney(row.clientPaid),
      clientDebt: fmtMoney(row.clientDebt),
      orderExpenses: fmtMoney(row.orderExpenses),
      workerSalary: fmtMoney(row.workerSalary),
      workerBalance: fmtMoney(row.workerBalance),
      profit: fmtMoney(row.profit),
      paymentStatus: paymentStatusLabels[row.paymentStatus] ?? row.paymentStatus,
      workerSettlementStatus:
        workerSettlementStatusLabels[row.workerSettlementStatus] ?? row.workerSettlementStatus,
    })));
    styleWorksheetHeader(ordersSheet);

    const expensesSheet = workbook.addWorksheet("Витрати");
    expensesSheet.columns = [
      { header: "Дата", key: "expenseDate" },
      { header: "Техніка", key: "equipmentName" },
      { header: "Тип", key: "type" },
      { header: "Літри", key: "fuelLiters" },
      { header: "Ціна / л", key: "fuelPricePerLiter" },
      { header: "Сума", key: "amount" },
      { header: "Коментар", key: "comment" },
    ];
    expensesSheet.addRows(equipmentExpenses.map((row) => ({
      expenseDate: row.expenseDate,
      equipmentName: row.equipmentName ?? "—",
      type: equipmentExpenseTypeLabels[row.type] ?? row.type,
      fuelLiters: fmtMoney(row.fuelLiters),
      fuelPricePerLiter: fmtMoney(row.fuelPricePerLiter),
      amount: fmtMoney(row.amount),
      comment: row.comment ?? "—",
    })));
    styleWorksheetHeader(expensesSheet);

    const employeesSheet = workbook.addWorksheet("Працівники");
    employeesSheet.columns = [
      { header: "Працівник", key: "employeeName" },
      { header: "Замовлень", key: "ordersCount" },
      { header: "Заробив", key: "earned" },
      { header: "Отримав від клієнтів", key: "receivedFromClients" },
      { header: "Витрати подав", key: "reportedExpenses" },
      { header: "Компанія має виплатити", key: "companyOwesEmployee" },
      { header: "Працівник має передати", key: "employeeOwesCompany" },
      { header: "Чистий баланс", key: "balance" },
      { header: "Статус", key: "status" },
    ];
    employeesSheet.addRows(employeeBalances.map((row) => ({
      ...row,
      earned: fmtMoney(row.earned),
      receivedFromClients: fmtMoney(row.receivedFromClients),
      reportedExpenses: fmtMoney(row.reportedExpenses),
      companyOwesEmployee: fmtMoney(row.companyOwesEmployee),
      employeeOwesCompany: fmtMoney(row.employeeOwesCompany),
      balance: fmtMoney(row.balance),
      status: workerSettlementStatusLabels[row.status] ?? row.status,
    })));
    styleWorksheetHeader(employeesSheet);

    workbook.worksheets.forEach(autosizeWorksheet);

    const filename = `finance-report-${range.from}_${range.to}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const buffer = await workbook.xlsx.writeBuffer();
    res.send(Buffer.from(buffer));
  } catch (e) {
    logError("GET /api/admin/finance/export.xlsx error:", e);
    res.status(500).json({ error: e instanceof Error ? e.message : "Помилка сервера" });
  }
});

adminFinanceRouter.get("/equipment-expenses", async (req, res) => {
  try {
    const input = parseEquipmentExpensesQuery(req.query);
    res.json(await listEquipmentExpenses(input));
  } catch (e) {
    logError("GET /api/admin/finance/equipment-expenses error:", e);
    res.status(500).json({ error: e instanceof Error ? e.message : "Помилка сервера" });
  }
});

adminFinanceRouter.post("/equipment-expenses", validate(equipmentExpenseSchema), async (req, res) => {
  try {
    const payload = req.body as z.infer<typeof equipmentExpenseSchema>;
    if (!["fuel", "materials"].includes(payload.type) && !payload.equipmentId) {
      res.status(400).json({ error: "Для цієї витрати потрібно вибрати техніку" });
      return;
    }
    const equipment = payload.equipmentId ? await ensureEquipmentExists(payload.equipmentId) : null;
    if (payload.equipmentId && !equipment) {
      res.status(404).json({ error: "Техніку не знайдено" });
      return;
    }

    const amount = calculateEquipmentExpenseAmount(payload);
    const result = await pool.query(
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
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [
        payload.equipmentId || null,
        payload.type,
        payload.expenseDate,
        amount,
        payload.fuelLiters ?? null,
        payload.fuelPricePerLiter ?? null,
        payload.comment ?? null,
      ],
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    logError("POST /api/admin/finance/equipment-expenses error:", e);
    res.status(500).json({ error: e instanceof Error ? e.message : "Помилка сервера" });
  }
});

adminFinanceRouter.put("/equipment-expenses/:id", validate(equipmentExpenseSchema), async (req, res) => {
  try {
    const payload = req.body as z.infer<typeof equipmentExpenseSchema>;
    if (!["fuel", "materials"].includes(payload.type) && !payload.equipmentId) {
      res.status(400).json({ error: "Для цієї витрати потрібно вибрати техніку" });
      return;
    }
    const equipment = payload.equipmentId ? await ensureEquipmentExists(payload.equipmentId) : null;
    if (payload.equipmentId && !equipment) {
      res.status(404).json({ error: "Техніку не знайдено" });
      return;
    }

    const amount = calculateEquipmentExpenseAmount(payload);
    const result = await pool.query(
      `UPDATE "EquipmentExpense"
       SET "equipmentId" = $1,
           "type" = $2,
           "expenseDate" = $3,
           "amount" = $4,
           "fuelLiters" = $5,
           "fuelPricePerLiter" = $6,
           "comment" = $7,
           "updatedAt" = NOW()
       WHERE "id" = $8
       RETURNING *`,
      [
        payload.equipmentId || null,
        payload.type,
        payload.expenseDate,
        amount,
        payload.fuelLiters ?? null,
        payload.fuelPricePerLiter ?? null,
        payload.comment ?? null,
        req.params.id,
      ],
    );

    if (!result.rows[0]) {
      res.status(404).json({ error: "Витрату не знайдено" });
      return;
    }

    res.json(result.rows[0]);
  } catch (e) {
    logError("PUT /api/admin/finance/equipment-expenses/:id error:", e);
    res.status(500).json({ error: e instanceof Error ? e.message : "Помилка сервера" });
  }
});

adminFinanceRouter.delete("/equipment-expenses/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM "EquipmentExpense" WHERE "id" = $1 RETURNING "id"`,
      [req.params.id],
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: "Витрату не знайдено" });
      return;
    }
    res.json({ success: true });
  } catch (e) {
    logError("DELETE /api/admin/finance/equipment-expenses/:id error:", e);
    res.status(500).json({ error: e instanceof Error ? e.message : "Помилка сервера" });
  }
});
