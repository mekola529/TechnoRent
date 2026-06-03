import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { pool } from "../lib/db.js";
import {
  calculateOrderFinance,
  calculateWorkerObligations,
  calculateWorkerSettlementStatusFromDebts,
  formatWorkerCompensationText,
  getFinanceSummary,
  recalculateOrderFinanceState,
} from "../lib/finance.js";
import { geocodeAddressForMaps, normalizeCoordinate } from "../lib/geocode-address.js";
import { logError } from "../lib/logger.js";
import { sendManagerDispatchNotification } from "../lib/telegram.js";
import { captureExecutionStartGps, enrichExecutionReportWithGps } from "../lib/work-execution-gps.js";

export const internalTelegramRouter = Router();

function requireInternalToken(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.TELEGRAM_INTERNAL_TOKEN;
  if (!expected) {
    res.status(503).json({ error: "Internal telegram integration is not configured" });
    return;
  }

  const provided = req.header("x-internal-token");
  if (!provided || provided !== expected) {
    res.status(401).json({ error: "Unauthorized internal request" });
    return;
  }

  next();
}

internalTelegramRouter.use(requireInternalToken);

const startSchema = z.object({
  telegramUserId: z.union([z.string(), z.number()]).transform(String),
  telegramChatId: z.union([z.string(), z.number()]).transform(String),
  username: z.string().optional().nullable(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  languageCode: z.string().optional().nullable(),
});

const assignmentRespondSchema = z.object({
  assignmentId: z.string().min(1),
  action: z.enum(["accept", "decline"]),
  responseComment: z.string().optional().nullable(),
});

const executionActionSchema = z.object({
  assignmentId: z.string().min(1),
});

const reportCallbackSchema = z.object({
  executionSessionId: z.string().min(1),
  action: z.enum([
    "cash_yes",
    "cash_no",
    "extra_yes",
    "extra_no",
    "expense_type_fuel",
    "expense_type_parking",
    "expense_type_materials",
    "expense_type_repair",
    "expense_type_other",
    "extra_expense_comment_skip",
    "problems_yes",
    "problems_no",
    "work_complete_yes",
    "work_complete_next_shift",
    "next_shift_comment_skip",
    "worker_comment_skip",
  ]),
});

const reportTextSchema = z.object({
  telegramChatId: z.union([z.string(), z.number()]).transform(String),
  text: z.string().trim().min(1),
});

const workerDashboardSchema = z.object({
  telegramChatId: z.union([z.string(), z.number()]).transform(String),
  telegramUserId: z.union([z.string(), z.number()]).transform(String).optional(),
});

const adminActionSchema = z.object({
  telegramChatId: z.union([z.string(), z.number()]).transform(String),
  telegramUserId: z.union([z.string(), z.number()]).transform(String).optional(),
  action: z.enum([
    "finance_summary",
    "expense_start",
    "expense_type_fuel",
    "expense_type_materials",
    "expense_type_maintenance",
    "expense_type_repair",
    "expense_type_parts",
    "expense_type_insurance",
    "expense_type_wash",
    "expense_type_other",
    "worker_statuses",
  ]),
});

const adminTextSchema = z.object({
  telegramChatId: z.union([z.string(), z.number()]).transform(String),
  telegramUserId: z.union([z.string(), z.number()]).transform(String).optional(),
  text: z.string().trim().min(1),
});

function formatDurationMinutes(value: number) {
  const minutesTotal = Math.round(Math.abs(value));
  if (minutesTotal >= 60) {
    const hours = Math.floor(minutesTotal / 60);
    const minutes = minutesTotal % 60;
    return minutes > 0 ? `${hours} год ${minutes} хв` : `${hours} год`;
  }
  return `${minutesTotal} хв`;
}

type ReportPrompt =
  | { kind: "buttons"; text: string; buttons: Array<{ text: string; callbackData: string }> }
  | { kind: "text"; text: string }
  | { kind: "done"; text: string };

function normalizeOptionalText(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized === "-" || normalized === "—") {
    return null;
  }
  return normalized;
}

function buildAdminPrompt(
  kind: "buttons" | "text" | "done",
  text: string,
  buttons?: Array<{ text: string; callbackData: string }>,
) {
  return { kind, text, buttons };
}

async function findTelegramAdmin(
  client: Pick<typeof pool, "query">,
  telegramChatId: string,
  telegramUserId?: string,
) {
  const { rows } = await client.query(
    `SELECT "id", "email", "role", "telegramUsername"
     FROM "Admin"
     WHERE "telegramChatId" = $1
        OR ($2::text IS NOT NULL AND "telegramUserId" = $2::text)
     LIMIT 1`,
    [telegramChatId, telegramUserId ?? null],
  );
  return rows[0] ?? null;
}

async function getAdminPendingAction(client: Pick<typeof pool, "query">, adminId: string) {
  const { rows } = await client.query(
    `SELECT "key", "value"
     FROM "SiteSetting"
     WHERE "key" = $1
     LIMIT 1`,
    [`telegram_admin_pending:${adminId}`],
  );
  return rows[0]?.value ?? null;
}

async function setAdminPendingAction(client: Pick<typeof pool, "query">, adminId: string, value: unknown) {
  await client.query(
    `INSERT INTO "SiteSetting" ("key", "value", "updatedAt")
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT ("key")
     DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = NOW()`,
    [`telegram_admin_pending:${adminId}`, JSON.stringify(value)],
  );
}

async function clearAdminPendingAction(client: Pick<typeof pool, "query">, adminId: string) {
  await client.query(`DELETE FROM "SiteSetting" WHERE "key" = $1`, [`telegram_admin_pending:${adminId}`]);
}

async function buildAdminFinanceSummaryText(client: Pick<typeof pool, "query">) {
  const range = currentMonthRange();
  const summary = await getFinanceSummary(range, client);
  return [
    "📊 <b>Фінансовий звіт</b>",
    `Період: ${range.from} — ${range.to}`,
    "",
    `• Дохід: <b>${summary.income} грн</b>`,
    `• Витрати: <b>${summary.expenses} грн</b>`,
    `• Прибуток: <b>${summary.profit} грн</b>`,
    `• Борг клієнтів: <b>${summary.clientDebt} грн</b>`,
    `• Баланс з працівниками: <b>${summary.workerBalance} грн</b>`,
    "",
    `• Закупівля пального: <b>${summary.fuelExpenses} грн</b>`,
    `• Закуплено пального: <b>${summary.fuelPurchasedLiters} л</b>`,
    `• Списано пального: <b>${summary.fuelConsumedLiters} л</b>`,
    `• Залишок пального: <b>${summary.fuelBalanceLiters} л</b>`,
    summary.isFuelBalanceLow ? "⚠️ Залишок пального нижче порогу." : null,
  ].filter(Boolean).join("\n");
}

const adminExpenseTypes = {
  expense_type_fuel: { type: "fuel", label: "Пальне" },
  expense_type_materials: { type: "materials", label: "Сипучі матеріали" },
  expense_type_maintenance: { type: "maintenance", label: "Обслуговування" },
  expense_type_repair: { type: "repair", label: "Ремонт" },
  expense_type_parts: { type: "parts", label: "Запчастини" },
  expense_type_insurance: { type: "insurance", label: "Страхування" },
  expense_type_wash: { type: "wash", label: "Мийка" },
  expense_type_other: { type: "other", label: "Інше" },
} as const;

function buildAdminExpenseTypePrompt() {
  return buildAdminPrompt("buttons", "🧾 Виберіть тип витрати:", [
    { text: "⛽ Пальне", callbackData: "admin_expense_type_fuel:expense" },
    { text: "🧱 Сипучі матеріали", callbackData: "admin_expense_type_materials:expense" },
    { text: "🛠 Обслуговування", callbackData: "admin_expense_type_maintenance:expense" },
    { text: "🔧 Ремонт", callbackData: "admin_expense_type_repair:expense" },
    { text: "⚙️ Запчастини", callbackData: "admin_expense_type_parts:expense" },
    { text: "🛡 Страхування", callbackData: "admin_expense_type_insurance:expense" },
    { text: "🧽 Мийка", callbackData: "admin_expense_type_wash:expense" },
    { text: "📦 Інше", callbackData: "admin_expense_type_other:expense" },
  ]);
}

function getAdminExpenseTypeFromAction(action: string) {
  return adminExpenseTypes[action as keyof typeof adminExpenseTypes] ?? null;
}

function formatPublicOrderNumber(orderNumber: unknown, orderId: unknown) {
  const value = orderNumber ?? orderId;
  return String(value ?? "").replace(/\D/g, "") || "0";
}

async function buildAdminWorkerStatusesText(client: Pick<typeof pool, "query">) {
  const { rows } = await client.query(
    `SELECT
       e."id",
       e."fullName",
       e."role",
       current_task."orderId" AS "currentOrderId",
       current_task."orderNumber" AS "currentOrderNumber",
       current_task."customerName" AS "currentCustomerName",
       current_task."equipmentName" AS "currentEquipmentName",
       current_task."startedAt" AS "currentStartedAt",
       next_task."orderId" AS "nextOrderId",
       next_task."orderNumber" AS "nextOrderNumber",
       next_task."customerName" AS "nextCustomerName",
       next_task."equipmentName" AS "nextEquipmentName",
       next_task."plannedAt" AS "nextPlannedAt"
     FROM "Employee" e
     LEFT JOIN LATERAL (
       SELECT
         wa."orderId",
         ro."orderNumber",
         ro."customerName",
         eq."name" AS "equipmentName",
         wes."startedAt"
       FROM "WorkAssignment" wa
       INNER JOIN "RentOrder" ro ON ro."id" = wa."orderId"
       LEFT JOIN "Equipment" eq ON eq."id" = wa."equipmentId"
       INNER JOIN LATERAL (
         SELECT "status", "startedAt"
         FROM "WorkExecutionSession"
         WHERE "assignmentId" = wa."id"
         ORDER BY "createdAt" DESC
         LIMIT 1
       ) wes ON TRUE
       WHERE wa."employeeId" = e."id"
         AND wa."status" = 'ACCEPTED'
         AND wes."status" = 'IN_PROGRESS'
       ORDER BY wes."startedAt" DESC NULLS LAST
       LIMIT 1
     ) current_task ON TRUE
     LEFT JOIN LATERAL (
       SELECT
         wa."orderId",
         ro."orderNumber",
         ro."customerName",
         eq."name" AS "equipmentName",
         COALESCE(roi."startDate", ro."scheduledDate", wa."plannedNextStartAt", wa."assignedAt") AS "plannedAt"
       FROM "WorkAssignment" wa
       INNER JOIN "RentOrder" ro ON ro."id" = wa."orderId"
       LEFT JOIN "Equipment" eq ON eq."id" = wa."equipmentId"
       LEFT JOIN LATERAL (
         SELECT "status"
         FROM "WorkExecutionSession"
         WHERE "assignmentId" = wa."id"
         ORDER BY "createdAt" DESC
         LIMIT 1
       ) wes ON TRUE
       LEFT JOIN LATERAL (
         SELECT "startDate"
         FROM "RentOrderItem"
         WHERE "rentOrderId" = wa."orderId"
           AND (wa."equipmentId" IS NULL OR "equipmentId" = wa."equipmentId")
         ORDER BY "startDate" ASC NULLS LAST, "id" ASC
         LIMIT 1
       ) roi ON TRUE
       WHERE wa."employeeId" = e."id"
         AND wa."status" = 'ACCEPTED'
         AND ro."status" NOT IN ('COMPLETED', 'CANCELLED')
         AND COALESCE(wa."completionStatus", 'PENDING') <> 'COMPLETED'
         AND COALESCE(wes."status", 'NOT_STARTED') <> 'IN_PROGRESS'
       ORDER BY COALESCE(roi."startDate", ro."scheduledDate", wa."plannedNextStartAt", wa."assignedAt") ASC NULLS LAST
       LIMIT 1
     ) next_task ON TRUE
     WHERE e."isActive" = TRUE
     ORDER BY e."fullName" ASC`,
  );

  if (rows.length === 0) {
    return "👷 <b>Статус працівників</b>\n\nАктивних працівників немає.";
  }

  const formatDate = (value: unknown) => {
    if (!value) return "час не вказано";
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("uk-UA");
  };

  return [
    "👷 <b>Статус працівників</b>",
    "",
    ...rows.map((row) => {
      const base = `• <b>${row.fullName}</b>${row.role ? ` (${row.role})` : ""}`;
      if (row.currentOrderId) {
        const currentNumber = formatPublicOrderNumber(row.currentOrderNumber, row.currentOrderId);
        return [
          base,
          `  🟢 Працює зараз: №${currentNumber}`,
          row.currentEquipmentName ? `  🚜 ${row.currentEquipmentName}` : null,
          row.currentCustomerName ? `  👤 ${row.currentCustomerName}` : null,
          `  🕒 Старт: ${formatDate(row.currentStartedAt)}`,
        ].filter(Boolean).join("\n");
      }
      if (row.nextOrderId) {
        const nextNumber = formatPublicOrderNumber(row.nextOrderNumber, row.nextOrderId);
        return [
          base,
          `  🟡 Найближче завдання: №${nextNumber}`,
          row.nextEquipmentName ? `  🚜 ${row.nextEquipmentName}` : null,
          row.nextCustomerName ? `  👤 ${row.nextCustomerName}` : null,
          `  ⏰ План: ${formatDate(row.nextPlannedAt)}`,
        ].filter(Boolean).join("\n");
      }
      return `${base}\n  ⚪ Вільний, найближчих прийнятих завдань немає`;
    }),
  ].join("\n");
}

function parseMoneyValue(value: string): number | null {
  const normalized = value.replace(/\s+/g, "").replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }
  return amount;
}

function parsePositiveNumber(value: string): number | null {
  const normalized = value.replace(/\s+/g, "").replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return amount;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthRange() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return {
    from: from.toISOString().slice(0, 10),
    to: todayIsoDate(),
  };
}

function getSettlementSenderId(settlement: Record<string, unknown>) {
  if (typeof settlement.fromEmployeeId === "string" && settlement.fromEmployeeId.trim()) {
    return settlement.fromEmployeeId.trim();
  }
  if (settlement.direction === "from_employee" && typeof settlement.employeeId === "string" && settlement.employeeId.trim()) {
    return settlement.employeeId.trim();
  }
  return null;
}

function getSettlementReceiverId(settlement: Record<string, unknown>) {
  if (typeof settlement.toEmployeeId === "string" && settlement.toEmployeeId.trim()) {
    return settlement.toEmployeeId.trim();
  }
  if (settlement.direction === "to_employee" && typeof settlement.employeeId === "string" && settlement.employeeId.trim()) {
    return settlement.employeeId.trim();
  }
  return null;
}

function getWorkerSettlementStatus(balance: number, settlementNet: number, hasCompensation: boolean) {
  if (!hasCompensation) return "UNSET";
  if (Math.abs(balance) < 0.01) return "SETTLED";
  if (balance > 0) {
    return Math.abs(settlementNet) > 0.009 ? "PARTIALLY_SETTLED" : "COMPANY_OWES_EMPLOYEE";
  }
  return Math.abs(settlementNet) > 0.009 ? "PARTIALLY_SETTLED" : "EMPLOYEE_OWES_COMPANY";
}

async function calculateEmployeeBalanceSnapshot(
  employeeId: string,
  client: Pick<typeof pool, "query">,
) {
  const orderIdsRes = await client.query(
    `SELECT DISTINCT "orderId" FROM (
       SELECT wc."rentOrderId" AS "orderId"
       FROM "WorkerCompensation" wc
       WHERE wc."employeeId" = $1
       UNION
       SELECT op."rentOrderId" AS "orderId"
       FROM "OrderPayment" op
       WHERE op."receivedByType" = 'employee' AND op."employeeId" = $1
       UNION
       SELECT oe."rentOrderId" AS "orderId"
       FROM "OrderExpense" oe
       WHERE oe."source" = 'employee' AND oe."employeeId" = $1
       UNION
       SELECT es."rentOrderId" AS "orderId"
       FROM "EmployeeSettlement" es
       WHERE es."employeeId" = $1 OR es."fromEmployeeId" = $1 OR es."toEmployeeId" = $1
       UNION
       SELECT wa."orderId" AS "orderId"
       FROM "WorkAssignment" wa
       WHERE wa."employeeId" = $1
     ) AS "relatedOrders"
     WHERE "orderId" IS NOT NULL`,
    [employeeId],
  );

  let earned = 0;
  let receivedFromClients = 0;
  let reportedExpenses = 0;
  let receivedInSettlements = 0;
  let sentInSettlements = 0;
  let acceptedTasksCount = 0;
  let assignmentsWithoutCompensation = 0;

  for (const row of orderIdsRes.rows) {
    const orderId = String(row.orderId ?? "");
    if (!orderId) continue;
    const finance = await calculateOrderFinance(orderId, client);
    if (!finance) continue;

    const orderCompensations = finance.workerCompensations.filter(
      (item) => String(item.employeeId ?? "") === employeeId,
    );
    const orderPayments = finance.payments.filter(
      (item) => item.receivedByType === "employee" && String(item.employeeId ?? "") === employeeId,
    );
    const orderExpenses = finance.expenses.filter(
      (item) => item.source === "employee" && String(item.employeeId ?? "") === employeeId,
    );

    earned += orderCompensations.reduce(
      (sum, item) => sum + Number(item.finalAmount ?? item.calculatedAmount ?? 0),
      0,
    );
    receivedFromClients += orderPayments.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
    reportedExpenses += orderExpenses.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);

    for (const settlement of finance.settlements) {
      const senderId = getSettlementSenderId(settlement as unknown as Record<string, unknown>);
      const receiverId = getSettlementReceiverId(settlement as unknown as Record<string, unknown>);
      if (receiverId === employeeId) {
        receivedInSettlements += Number(settlement.amount ?? 0);
      }
      if (senderId === employeeId) {
        sentInSettlements += Number(settlement.amount ?? 0);
      }
    }
  }

  const assignmentSummaryRes = await client.query(
    `SELECT
       COUNT(*) FILTER (
         WHERE wa."status" = 'ACCEPTED' AND ro."status" NOT IN ('COMPLETED', 'CANCELLED')
       ) AS "acceptedTasksCount",
       COUNT(*) FILTER (
         WHERE wa."status" = 'ACCEPTED'
           AND ro."status" NOT IN ('COMPLETED', 'CANCELLED')
           AND wc."id" IS NULL
       ) AS "assignmentsWithoutCompensation"
     FROM "WorkAssignment" wa
     INNER JOIN "RentOrder" ro ON ro."id" = wa."orderId"
     LEFT JOIN LATERAL (
       SELECT wc."id"
       FROM "WorkerCompensation" wc
       WHERE wc."assignmentId" = wa."id"
          OR (
            wc."employeeId" = wa."employeeId"
            AND COALESCE(wc."equipmentId",'') = COALESCE(wa."equipmentId",'')
            AND wc."rentOrderId" = wa."orderId"
          )
       ORDER BY wc."updatedAt" DESC, wc."createdAt" DESC
       LIMIT 1
     ) wc ON TRUE
     WHERE wa."employeeId" = $1`,
    [employeeId],
  );

  acceptedTasksCount = Number(assignmentSummaryRes.rows[0]?.acceptedTasksCount ?? 0);
  assignmentsWithoutCompensation = Number(assignmentSummaryRes.rows[0]?.assignmentsWithoutCompensation ?? 0);

  const obligations = calculateWorkerObligations({
    workerSalary: earned,
    employeeCollectedCash: receivedFromClients,
    employeeReportedExpenses: reportedExpenses,
    paidByCompany: receivedInSettlements,
    returnedToCompany: sentInSettlements,
  });
  const settlementNet = receivedInSettlements - sentInSettlements;
  const balance = obligations.balance;

  return {
    earned,
    receivedFromClients,
    reportedExpenses,
    receivedInSettlements,
    sentInSettlements,
    settlementNet,
    companyOwesEmployee: obligations.companyOwesEmployee,
    employeeOwesCompany: obligations.employeeOwesCompany,
    balance,
    acceptedTasksCount,
    assignmentsWithoutCompensation,
    status: earned > 0
      ? calculateWorkerSettlementStatusFromDebts({
          companyOwesEmployee: obligations.companyOwesEmployee,
          employeeOwesCompany: obligations.employeeOwesCompany,
          hasSettlements: Math.abs(settlementNet) > 0.009,
        })
      : getWorkerSettlementStatus(balance, settlementNet, false),
  };
}

async function syncRentOrderOperationalStatus(
  client: Pick<typeof pool, "query">,
  orderId: string,
) {
  const overviewRes = await client.query(
    `SELECT
       ro."status" AS "currentStatus",
       COALESCE(stats."totalAssignments", 0) AS "totalAssignments",
       COALESCE(stats."relevantAssignments", 0) AS "relevantAssignments",
       COALESCE(stats."acceptedAssignments", 0) AS "acceptedAssignments",
       COALESCE(stats."inProgressAssignments", 0) AS "inProgressAssignments",
       COALESCE(stats."finishedAssignments", 0) AS "finishedAssignments",
       COALESCE(stats."completedReports", 0) AS "completedReports",
       COALESCE(stats."completedAssignments", 0) AS "completedAssignments",
       COALESCE(stats."awaitingNextShiftAssignments", 0) AS "awaitingNextShiftAssignments"
     FROM "RentOrder" ro
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*) AS "totalAssignments",
         COUNT(*) FILTER (WHERE wa."status" <> 'DECLINED') AS "relevantAssignments",
         COUNT(*) FILTER (WHERE wa."status" = 'ACCEPTED') AS "acceptedAssignments",
         COUNT(*) FILTER (
           WHERE wa."status" = 'ACCEPTED'
             AND (
               wa."completionStatus" = 'IN_PROGRESS'
               OR wes."status" = 'IN_PROGRESS'
             )
         ) AS "inProgressAssignments",
         COUNT(*) FILTER (
           WHERE wa."status" = 'ACCEPTED' AND wes."status" = 'FINISHED'
         ) AS "finishedAssignments",
         COUNT(*) FILTER (
           WHERE wa."status" = 'ACCEPTED' AND wer."questionnaireStatus" = 'COMPLETED'
         ) AS "completedReports",
         COUNT(*) FILTER (
           WHERE wa."status" = 'ACCEPTED' AND wa."completionStatus" = 'COMPLETED'
         ) AS "completedAssignments",
         COUNT(*) FILTER (
           WHERE wa."status" = 'ACCEPTED' AND wa."completionStatus" = 'AWAITING_NEXT_SHIFT'
         ) AS "awaitingNextShiftAssignments"
       FROM "WorkAssignment" wa
       LEFT JOIN LATERAL (
         SELECT wes.*
         FROM "WorkExecutionSession" wes
         WHERE wes."assignmentId" = wa."id"
         ORDER BY wes."sequenceNumber" DESC, wes."createdAt" DESC
         LIMIT 1
       ) wes ON TRUE
       LEFT JOIN LATERAL (
         SELECT wer.*
         FROM "WorkExecutionReport" wer
         WHERE wer."executionSessionId" = wes."id"
         LIMIT 1
       ) wer ON TRUE
       WHERE wa."orderId" = ro."id"
     ) stats ON TRUE
     WHERE ro."id" = $1
     LIMIT 1`,
    [orderId],
  );

  const overview = overviewRes.rows[0];
  if (!overview) {
    return null;
  }

  const currentStatus = String(overview.currentStatus ?? "");
  if (currentStatus === "COMPLETED" || currentStatus === "CANCELLED") {
    return overview;
  }

  const totalAssignments = Number(overview.totalAssignments ?? 0);
  const relevantAssignments = Number(overview.relevantAssignments ?? 0);
  const acceptedAssignments = Number(overview.acceptedAssignments ?? 0);
  const inProgressAssignments = Number(overview.inProgressAssignments ?? 0);
  const finishedAssignments = Number(overview.finishedAssignments ?? 0);
  const completedReports = Number(overview.completedReports ?? 0);
  const completedAssignments = Number(overview.completedAssignments ?? 0);
  const awaitingNextShiftAssignments = Number(overview.awaitingNextShiftAssignments ?? 0);

  let nextStatus = "NEW";
  if (
    relevantAssignments > 0 &&
    acceptedAssignments === relevantAssignments &&
    completedAssignments === acceptedAssignments
  ) {
    nextStatus = "WORKER_COMPLETED";
  } else if (inProgressAssignments > 0 || finishedAssignments > 0 || awaitingNextShiftAssignments > 0) {
    nextStatus = "ACTIVE";
  } else if (totalAssignments > 0) {
    nextStatus = "CONFIRMED";
  }

  if (nextStatus !== currentStatus) {
    await client.query(
      `UPDATE "RentOrder"
       SET "status" = $1,
           "updatedAt" = NOW()
       WHERE "id" = $2`,
      [nextStatus, orderId],
    );
  }

  return {
    ...overview,
    nextStatus,
  };
}

async function updateAssignmentCompletionState(
  client: Pick<typeof pool, "query">,
  assignmentId: string,
  state: "PENDING" | "ACCEPTED" | "IN_PROGRESS" | "AWAITING_NEXT_SHIFT" | "COMPLETED" | "DECLINED",
  options?: {
    completionComment?: string | null;
    plannedNextStartAt?: Date | null;
  },
) {
  const completionComment =
    options && Object.prototype.hasOwnProperty.call(options, "completionComment")
      ? options.completionComment ?? null
      : undefined;
  const plannedNextStartAt =
    options && Object.prototype.hasOwnProperty.call(options, "plannedNextStartAt")
      ? options.plannedNextStartAt ?? null
      : undefined;

  await client.query(
    `UPDATE "WorkAssignment"
     SET "completionStatus" = $1,
         "completedAt" = CASE WHEN $1 = 'COMPLETED' THEN COALESCE("completedAt", NOW()) ELSE NULL END,
         "completionComment" = CASE WHEN $2::boolean THEN $3 ELSE "completionComment" END,
         "plannedNextStartAt" = CASE WHEN $4::boolean THEN $5 ELSE "plannedNextStartAt" END,
         "updatedAt" = NOW()
     WHERE "id" = $6`,
    [
      state,
      completionComment !== undefined,
      completionComment ?? null,
      plannedNextStartAt !== undefined,
      plannedNextStartAt ?? null,
      assignmentId,
    ],
  );
}

async function getAcceptedAssignmentExecutionGroup(
  client: Pick<typeof pool, "query">,
  assignment: Record<string, any>,
) {
  const groupRes = await client.query(
    `SELECT
       wa.*,
       COALESCE(wa."equipmentId", roi."equipmentId") AS "resolvedEquipmentId",
       td."id" AS "trackerDeviceId"
     FROM "WorkAssignment" wa
     LEFT JOIN LATERAL (
       SELECT "equipmentId"
       FROM "RentOrderItem"
       WHERE "rentOrderId" = wa."orderId"
         AND ("equipmentId" = wa."equipmentId" OR wa."equipmentId" IS NULL)
       ORDER BY "startDate" ASC, "id" ASC
       LIMIT 1
     ) roi ON TRUE
     LEFT JOIN "TrackerDevice" td ON td."equipmentId" = COALESCE(wa."equipmentId", roi."equipmentId")
     WHERE wa."orderId" = $1
       AND wa."employeeId" = $2
       AND wa."status" = 'ACCEPTED'
       AND COALESCE(wa."completionStatus", 'ACCEPTED') <> 'COMPLETED'
       AND (
         wa."id" = $4
         OR ($3::text IS NOT NULL AND wa."telegramMessageId" = $3)
       )
     ORDER BY wa."assignedAt" ASC, wa."createdAt" ASC`,
    [
      assignment.orderId,
      assignment.employeeId,
      assignment.telegramMessageId ?? null,
      assignment.id,
    ],
  );

  if (groupRes.rows.length === 0) {
    return [assignment];
  }

  return groupRes.rows;
}

function mergeWorkerDashboardTasks(tasks: Array<Record<string, any>>) {
  const groups = new Map<string, Array<Record<string, any>>>();

  for (const task of tasks) {
    const groupKey = task.telegramMessageId
      ? `${task.orderId}:tg:${task.telegramMessageId}`
      : `${task.orderId}:assignment:${task.assignmentId}`;
    const current = groups.get(groupKey) ?? [];
    current.push(task);
    groups.set(groupKey, current);
  }

  return Array.from(groups.values()).map((group) => {
    const primary =
      group.find((task) => task.executionStatus === "IN_PROGRESS") ??
      group.find((task) => task.executionStatus !== "FINISHED") ??
      group[0];

    const equipmentNames = Array.from(
      new Set(group.map((task) => task.equipmentName).filter(Boolean).map(String)),
    );
    const compensationTexts = Array.from(
      new Set(
        group
          .map((task) => {
            if (!task.workerCompensationText) return null;
            return task.equipmentName
              ? `${task.equipmentName}: ${task.workerCompensationText}`
              : task.workerCompensationText;
          })
          .filter(Boolean)
          .map(String),
      ),
    );
    const executionStatus = group.some((task) => task.executionStatus === "IN_PROGRESS")
      ? "IN_PROGRESS"
      : group.every((task) => task.executionStatus === "FINISHED")
        ? "FINISHED"
        : "NOT_STARTED";
    const completionStatus = group.some((task) => task.completionStatus === "AWAITING_NEXT_SHIFT")
      ? "AWAITING_NEXT_SHIFT"
      : group.every((task) => task.completionStatus === "COMPLETED")
        ? "COMPLETED"
        : primary.completionStatus;
    const plannedNextStartAt = group
      .map((task) => task.plannedNextStartAt)
      .filter(Boolean)
      .sort()[0] ?? primary.plannedNextStartAt ?? null;
    const completionComment =
      group.find((task) => task.completionComment)?.completionComment ?? primary.completionComment ?? null;
    const locationsSource = group.find((task) => Array.isArray(task.locations) && task.locations.length > 0) ?? primary;

    return {
      ...primary,
      groupedAssignmentIds: group.map((task) => task.assignmentId),
      equipmentName: equipmentNames.join(" + ") || primary.equipmentName,
      executionStatus,
      completionStatus,
      plannedNextStartAt,
      completionComment,
      locations: locationsSource.locations ?? [],
      workerCompensationText: compensationTexts.join("\n") || primary.workerCompensationText,
    };
  });
}

function getCashQuestion(executionSessionId: string): ReportPrompt {
  return {
    kind: "buttons",
    text: "💵 Чи брали готівку від клієнта?",
    buttons: [
      { text: "Так", callbackData: `report_cash_yes:${executionSessionId}` },
      { text: "Ні", callbackData: `report_cash_no:${executionSessionId}` },
    ],
  };
}

function getExtraExpensesQuestion(executionSessionId: string): ReportPrompt {
  return {
    kind: "buttons",
    text: "🧾 Чи були додаткові витрати під час виконання?",
    buttons: [
      { text: "Так", callbackData: `report_extra_yes:${executionSessionId}` },
      { text: "Ні", callbackData: `report_extra_no:${executionSessionId}` },
    ],
  };
}

function getProblemsQuestion(executionSessionId: string): ReportPrompt {
  return {
    kind: "buttons",
    text: "⚠️ Чи були проблеми або нестандартні ситуації?",
    buttons: [
      { text: "Так", callbackData: `report_problems_yes:${executionSessionId}` },
      { text: "Ні", callbackData: `report_problems_no:${executionSessionId}` },
    ],
  };
}

function getExpenseTypeQuestion(executionSessionId: string): ReportPrompt {
  return {
    kind: "buttons",
    text: "🏷️ Виберіть тип додаткових витрат:",
    buttons: [
      { text: "⛽ Пальне", callbackData: `report_expense_type_fuel:${executionSessionId}` },
      { text: "🅿️ Паркінг", callbackData: `report_expense_type_parking:${executionSessionId}` },
      { text: "🧱 Матеріали", callbackData: `report_expense_type_materials:${executionSessionId}` },
      { text: "🔧 Ремонт", callbackData: `report_expense_type_repair:${executionSessionId}` },
      { text: "📦 Інше", callbackData: `report_expense_type_other:${executionSessionId}` },
    ],
  };
}

function getWorkerCommentQuestion(executionSessionId: string): ReportPrompt {
  return {
    kind: "buttons",
    text: "💬 Додайте коментар по виконанню або натисніть кнопку нижче, якщо коментаря немає.",
    buttons: [
      { text: "Без коментарю", callbackData: `report_worker_comment_skip:${executionSessionId}` },
    ],
  };
}

function getWorkCompletionQuestion(executionSessionId: string): ReportPrompt {
  return {
    kind: "buttons",
    text: "🏁 Чи завершено роботу по цьому завданню повністю?",
    buttons: [
      { text: "✅ Так, завершено", callbackData: `report_work_done:${executionSessionId}` },
      { text: "🔁 Потрібен ще виїзд", callbackData: `report_work_next:${executionSessionId}` },
    ],
  };
}

function getExtraExpenseCommentQuestion(executionSessionId: string): ReportPrompt {
  return {
    kind: "buttons",
    text: "📝 Опишіть додаткові витрати або натисніть кнопку нижче, якщо коментар не потрібен.",
    buttons: [
      { text: "Без коментарю", callbackData: `report_xexp_skip:${executionSessionId}` },
    ],
  };
}

function getNextShiftCommentQuestion(executionSessionId: string): ReportPrompt {
  return {
    kind: "buttons",
    text: "📝 Опишіть, що залишилось зробити на наступному виїзді, або натисніть кнопку нижче.",
    buttons: [
      { text: "Без коментарю", callbackData: `report_nshift_skip:${executionSessionId}` },
    ],
  };
}

function buildMapsSearchLink(address: string | null | undefined) {
  if (!address) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function readCoordinates(value: unknown) {
  if (!value || typeof value !== "object") {
    return { latitude: null, longitude: null };
  }

  const coordinates = value as Record<string, unknown>;
  return {
    latitude: normalizeCoordinate(coordinates.lat ?? coordinates.latitude),
    longitude: normalizeCoordinate(coordinates.lon ?? coordinates.lng ?? coordinates.longitude),
  };
}

function getMaterialDeliveryMeta(sourceRequest: any): Record<string, unknown> | null {
  const materialDelivery = sourceRequest?.metadata?.materialDelivery;
  return materialDelivery &&
    typeof materialDelivery === "object" &&
    (materialDelivery as Record<string, unknown>).servicePricingType === "material_delivery_calculator"
      ? materialDelivery as Record<string, unknown>
      : null;
}

async function buildAcceptanceLocations(sourceRequest: any) {
  if (!sourceRequest) return [];

  const towMeta =
    sourceRequest.metadata &&
    typeof sourceRequest.metadata === "object" &&
    sourceRequest.metadata.tow &&
    typeof sourceRequest.metadata.tow === "object"
      ? (sourceRequest.metadata.tow as Record<string, unknown>)
      : null;

  const isTow = sourceRequest.requestType === "tow" || Boolean(towMeta);
  const materialDeliveryMeta = getMaterialDeliveryMeta(sourceRequest);
  const rawLocations = isTow
    ? [
        {
          label: "Звідки забрати",
          address: sourceRequest.addressFrom,
          coordinates: readCoordinates(towMeta?.pickupCoordinates),
        },
        {
          label: "Куди доставити",
          address:
            sourceRequest.addressTo ??
            (typeof towMeta?.destinationAddress === "string" ? towMeta.destinationAddress : null),
          coordinates: readCoordinates(towMeta?.destinationCoordinates),
        },
      ]
    : materialDeliveryMeta
      ? [
          {
            label: "Звідки завантажити",
            address: typeof materialDeliveryMeta.chosenSupplierPointAddress === "string"
              ? materialDeliveryMeta.chosenSupplierPointAddress
              : null,
            coordinates: readCoordinates(materialDeliveryMeta.chosenSupplierPointCoordinates),
          },
          {
            label: "Куди доставити",
            address:
              (typeof materialDeliveryMeta.deliveryAddress === "string" ? materialDeliveryMeta.deliveryAddress : null) ??
              sourceRequest.addressFrom,
            coordinates: readCoordinates(materialDeliveryMeta.deliveryCoordinates),
          },
        ]
    : [
        {
          label: "Адреса виконання",
          address: sourceRequest.addressFrom,
          coordinates: { latitude: null, longitude: null },
        },
      ];

  const locations = await Promise.all(
    rawLocations.map(async (location) => {
      const address = typeof location.address === "string" ? location.address.trim() : "";
      if (!address) return null;

      const geocoded = location.coordinates.latitude !== null && location.coordinates.longitude !== null
        ? null
        : await geocodeAddressForMaps(address);

      return {
        label: location.label,
        address,
        latitude: location.coordinates.latitude ?? geocoded?.latitude ?? null,
        longitude: location.coordinates.longitude ?? geocoded?.longitude ?? null,
      };
    }),
  );

  return locations.filter((location): location is {
    label: string;
    address: string;
    latitude: number | null;
    longitude: number | null;
  } => Boolean(location));
}

function formatPlannedStart(sourceRequest: any, assignment: any) {
  if (sourceRequest?.scheduledDate) {
    const date = new Date(sourceRequest.scheduledDate);
    const dateLabel = date.toLocaleDateString("uk-UA");
    if (sourceRequest?.scheduledTime) {
      return `${dateLabel}, ${sourceRequest.scheduledTime}`;
    }
    return dateLabel;
  }

  if (assignment?.scheduledDate) {
    const from = new Date(assignment.scheduledDate).toLocaleDateString("uk-UA");
    const dateLabel = assignment?.scheduledDateTo
      ? `${from} — ${new Date(assignment.scheduledDateTo).toLocaleDateString("uk-UA")}`
      : `від ${from}`;

    if (assignment?.scheduledTimeFrom && assignment?.scheduledTimeTo) {
      return `${dateLabel}, ${assignment.scheduledTimeFrom} — ${assignment.scheduledTimeTo}`;
    }
    if (assignment?.scheduledTimeFrom) {
      return `${dateLabel}, від ${assignment.scheduledTimeFrom}`;
    }
    if (assignment?.scheduledTimeTo) {
      return `${dateLabel}, до ${assignment.scheduledTimeTo}`;
    }
    return dateLabel;
  }

  if (assignment?.plannedStartAt) {
    return new Date(assignment.plannedStartAt).toLocaleString("uk-UA");
  }

  return null;
}

function formatExecutionTimeLabel(sourceRequest: any, assignment: any) {
  if (sourceRequest?.scheduledDate) {
    const dateLabel = new Date(sourceRequest.scheduledDate).toLocaleDateString("uk-UA");
    return sourceRequest?.scheduledTime ? `${dateLabel}, ${sourceRequest.scheduledTime}` : dateLabel;
  }

  const dateFrom = assignment?.scheduledDate
    ? new Date(assignment.scheduledDate).toLocaleDateString("uk-UA")
    : null;
  const dateTo = assignment?.scheduledDateTo
    ? new Date(assignment.scheduledDateTo).toLocaleDateString("uk-UA")
    : null;
  const dateLabel = dateFrom && dateTo && dateFrom !== dateTo
    ? `${dateFrom} — ${dateTo}`
    : dateFrom ?? (dateTo ? `до ${dateTo}` : null);
  const timeLabel = assignment?.scheduledTimeFrom && assignment?.scheduledTimeTo
    ? `${assignment.scheduledTimeFrom} — ${assignment.scheduledTimeTo}`
    : assignment?.scheduledTimeFrom
      ? `від ${assignment.scheduledTimeFrom}`
      : assignment?.scheduledTimeTo
        ? `до ${assignment.scheduledTimeTo}`
        : null;

  return [dateLabel, timeLabel].filter(Boolean).join(", ") || null;
}

async function getReportPromptByState(
  client: Pick<typeof pool, "query">,
  executionSessionId: string,
): Promise<ReportPrompt | null> {
  const reportRes = await client.query(
    `SELECT * FROM "WorkExecutionReport" WHERE "executionSessionId" = $1 LIMIT 1`,
    [executionSessionId],
  );
  const report = reportRes.rows[0];
  if (!report) return null;

  if (report.questionnaireStatus === "COMPLETED") {
    return {
      kind: "done",
      text: "✅ Звіт збережено. Дякую, інформацію передано менеджеру.",
    };
  }

  if (report.awaitingTextField === "cashAmount") {
    return { kind: "text", text: "💵 Вкажіть суму готівки цифрою, наприклад `3500`." };
  }
  if (report.awaitingTextField === "extraExpensesAmount") {
    return { kind: "text", text: "🧾 Вкажіть суму додаткових витрат цифрою, наприклад `700`." };
  }
  if (report.awaitingTextField === "extraExpensesComment") {
    return getExtraExpenseCommentQuestion(executionSessionId);
  }
  if (report.awaitingTextField === "problemsComment") {
    return {
      kind: "text",
      text: "⚠️ Опишіть проблему або надішліть `-`, якщо достатньо лише факту проблеми.",
    };
  }
  if (report.awaitingTextField === "workerComment") {
    return getWorkerCommentQuestion(executionSessionId);
  }
  if (report.awaitingTextField === "nextShiftComment") {
    return getNextShiftCommentQuestion(executionSessionId);
  }

  if (report.questionnaireStep === "cash_collected") {
    return getCashQuestion(executionSessionId);
  }
  if (report.questionnaireStep === "extra_expenses") {
    return getExtraExpensesQuestion(executionSessionId);
  }
  if (report.questionnaireStep === "extra_expense_type") {
    return getExpenseTypeQuestion(executionSessionId);
  }
  if (report.questionnaireStep === "had_problems") {
    return getProblemsQuestion(executionSessionId);
  }
  if (report.questionnaireStep === "worker_comment") {
    return getWorkerCommentQuestion(executionSessionId);
  }
  if (report.questionnaireStep === "work_completion") {
    return getWorkCompletionQuestion(executionSessionId);
  }

  return null;
}

async function finalizeExecutionReportSubmission(
  client: Pick<typeof pool, "query">,
  executionSessionId: string,
  options: {
    reportSnapshot: Record<string, any>;
    workerComment?: string | null;
    workCompleted: boolean;
    needsNextShift: boolean;
    nextShiftComment?: string | null;
  },
) {
  await client.query(
    `UPDATE "WorkExecutionSession"
     SET "isFinalSession" = $2,
         "sessionComment" = $3,
         "updatedAt" = NOW()
     WHERE "id" = $1`,
    [
      executionSessionId,
      options.workCompleted,
      options.needsNextShift ? options.nextShiftComment ?? options.workerComment ?? null : options.workerComment ?? null,
    ],
  );

  await client.query(
    `INSERT INTO "OrderEventLog" ("orderId", "assignmentId", "eventType", "payload")
     SELECT wes."orderId", wes."assignmentId", 'worker_report_submitted', $1
     FROM "WorkExecutionSession" wes
     WHERE wes."id" = $2`,
    [
      JSON.stringify({
        submittedAt: new Date().toISOString(),
        cashCollected: options.reportSnapshot.cashCollected ?? null,
        cashAmount: options.reportSnapshot.cashAmount ?? null,
        extraExpensesAmount: options.reportSnapshot.extraExpensesAmount ?? null,
        extraExpensesType: options.reportSnapshot.extraExpensesType ?? null,
        workCompleted: options.workCompleted,
        needsNextShift: options.needsNextShift,
        nextShiftComment: options.nextShiftComment ?? null,
      }),
      executionSessionId,
    ],
  );

  const managerOrderRes = await client.query(
    `SELECT
       ro."id",
       ro."customerName",
       ro."customerPhone",
       wes."equipmentId",
       wa."id" AS "assignmentId",
       wa."employeeId",
       wa."telegramMessageId",
       e."fullName" AS "employeeName"
     FROM "WorkExecutionSession" wes
     INNER JOIN "RentOrder" ro ON ro."id" = wes."orderId"
     LEFT JOIN "WorkAssignment" wa ON wa."id" = wes."assignmentId"
     LEFT JOIN "Employee" e ON e."id" = wa."employeeId"
     WHERE wes."id" = $1
     LIMIT 1`,
    [executionSessionId],
  );

  const managerOrder = managerOrderRes.rows[0];
  if (!managerOrder) {
    return null;
  }

  if (managerOrder.assignmentId) {
    await updateAssignmentCompletionState(
      client,
      managerOrder.assignmentId,
      options.workCompleted ? "COMPLETED" : "AWAITING_NEXT_SHIFT",
      {
        completionComment: options.workCompleted
          ? options.workerComment ?? null
          : options.nextShiftComment ?? options.workerComment ?? null,
        plannedNextStartAt: null,
      },
    );
  }

  if (managerOrder.assignmentId && managerOrder.employeeId && managerOrder.telegramMessageId) {
    const groupedAssignmentsRes = await client.query(
      `SELECT
         wa."id" AS "assignmentId",
         wes."id" AS "executionSessionId"
       FROM "WorkAssignment" wa
       LEFT JOIN LATERAL (
         SELECT "id"
         FROM "WorkExecutionSession"
         WHERE "assignmentId" = wa."id"
         ORDER BY "sequenceNumber" DESC, "createdAt" DESC
         LIMIT 1
       ) wes ON TRUE
       WHERE wa."orderId" = $1
         AND wa."employeeId" = $2
         AND wa."telegramMessageId" = $3
         AND wa."id" <> $4
         AND wa."status" = 'ACCEPTED'`,
      [
        managerOrder.id,
        managerOrder.employeeId,
        managerOrder.telegramMessageId,
        managerOrder.assignmentId,
      ],
    );

    for (const groupedAssignment of groupedAssignmentsRes.rows) {
      await updateAssignmentCompletionState(
        client,
        groupedAssignment.assignmentId,
        options.workCompleted ? "COMPLETED" : "AWAITING_NEXT_SHIFT",
        {
          completionComment: options.workCompleted
            ? options.workerComment ?? null
            : options.nextShiftComment ?? options.workerComment ?? null,
          plannedNextStartAt: null,
        },
      );

      if (groupedAssignment.executionSessionId) {
        await client.query(
          `UPDATE "WorkExecutionSession"
           SET "isFinalSession" = $2,
               "sessionComment" = $3,
               "updatedAt" = NOW()
           WHERE "id" = $1`,
          [
            groupedAssignment.executionSessionId,
            options.workCompleted,
            options.needsNextShift ? options.nextShiftComment ?? options.workerComment ?? null : options.workerComment ?? null,
          ],
        );

        await client.query(
          `INSERT INTO "WorkExecutionReport" (
             "executionSessionId",
             "workCompleted",
             "needsNextShift",
             "nextShiftComment",
             "workerComment",
             "questionnaireStep",
             "questionnaireStatus",
             "awaitingTextField",
             "submittedAt",
             "updatedAt"
           )
           VALUES ($1, $2, $3, $4, $5, 'COMPLETED', 'COMPLETED', NULL, NOW(), NOW())
           ON CONFLICT ("executionSessionId")
           DO UPDATE SET
             "workCompleted" = EXCLUDED."workCompleted",
             "needsNextShift" = EXCLUDED."needsNextShift",
             "nextShiftComment" = EXCLUDED."nextShiftComment",
             "workerComment" = COALESCE("WorkExecutionReport"."workerComment", EXCLUDED."workerComment"),
             "questionnaireStep" = 'COMPLETED',
             "questionnaireStatus" = 'COMPLETED',
             "awaitingTextField" = NULL,
             "submittedAt" = COALESCE("WorkExecutionReport"."submittedAt", NOW()),
             "updatedAt" = NOW()`,
          [
            groupedAssignment.executionSessionId,
            options.workCompleted,
            options.needsNextShift,
            options.nextShiftComment ?? null,
            options.workerComment ?? null,
          ],
        );
      }

      await client.query(
        `INSERT INTO "OrderEventLog" ("orderId", "assignmentId", "eventType", "payload")
         VALUES ($1, $2, 'worker_report_submitted', $3)`,
        [
          managerOrder.id,
          groupedAssignment.assignmentId,
          JSON.stringify({
            submittedAt: new Date().toISOString(),
            copiedFromExecutionSessionId: executionSessionId,
            workCompleted: options.workCompleted,
            needsNextShift: options.needsNextShift,
            nextShiftComment: options.nextShiftComment ?? null,
          }),
        ],
      );
    }
  }

  if (
    options.reportSnapshot.cashCollected &&
    options.reportSnapshot.cashAmount &&
    Number(options.reportSnapshot.cashAmount) > 0
  ) {
    await client.query(
      `INSERT INTO "OrderPayment" (
         "rentOrderId",
         "executionSessionId",
         "employeeId",
         "amount",
         "method",
         "receivedByType",
       "paidAt",
        "comment",
        "updatedAt"
       )
       VALUES ($1, $2, $3, $4, 'cash', 'employee', NOW(), $5, NOW())`,
      [
        managerOrder.id,
        executionSessionId,
        managerOrder.employeeId ?? null,
        Number(options.reportSnapshot.cashAmount),
        "Автоматично з анкети працівника",
      ],
    );
  }

  if (
    options.reportSnapshot.extraExpensesType === "fuel" &&
    options.reportSnapshot.extraExpensesAmount &&
    Number(options.reportSnapshot.extraExpensesAmount) > 0
  ) {
    const latestFuelPriceRes = await client.query(
      `SELECT "fuelPricePerLiter"
       FROM "EquipmentExpense"
       WHERE "type" = 'fuel'
         AND "fuelPricePerLiter" IS NOT NULL
         AND "fuelPricePerLiter" > 0
       ORDER BY "expenseDate" DESC, "createdAt" DESC
       LIMIT 1`,
    );
    const latestFuelPrice = Number(latestFuelPriceRes.rows[0]?.fuelPricePerLiter ?? 0);
    const fuelLiters = Number.isFinite(latestFuelPrice) && latestFuelPrice > 0
      ? Math.round((Number(options.reportSnapshot.extraExpensesAmount) / latestFuelPrice + Number.EPSILON) * 100) / 100
      : null;

    await client.query(
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
       VALUES ($1, 'fuel', CURRENT_DATE, $2, $3, $4, $5, NOW())`,
      [
        null,
        Number(options.reportSnapshot.extraExpensesAmount),
        fuelLiters,
        latestFuelPrice > 0 ? latestFuelPrice : null,
        [
          "Закупівля пального з анкети працівника",
          `Замовлення: ${managerOrder.id}`,
          options.reportSnapshot.extraExpensesComment ?? null,
        ].filter(Boolean).join("\n"),
      ],
    );

    await client.query(
      `INSERT INTO "OrderExpense" (
         "rentOrderId",
         "executionSessionId",
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
       VALUES ($1, $2, $3, $4, 'fuel_purchase', $5, NULL, NULL, $6, 'employee', NOW(), NOW())`,
      [
        managerOrder.id,
        executionSessionId,
        managerOrder.equipmentId ?? null,
        managerOrder.employeeId ?? null,
        Number(options.reportSnapshot.extraExpensesAmount),
        options.reportSnapshot.extraExpensesComment ?? "Закупівля пального з анкети працівника",
      ],
    );
  } else if (
    options.reportSnapshot.extraExpensesAmount &&
    Number(options.reportSnapshot.extraExpensesAmount) > 0
  ) {
    await client.query(
      `INSERT INTO "OrderExpense" (
         "rentOrderId",
         "executionSessionId",
         "equipmentId",
         "employeeId",
         "type",
         "amount",
         "comment",
         "source",
         "expenseAt",
         "updatedAt"
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'employee', NOW(), NOW())`,
      [
        managerOrder.id,
        executionSessionId,
        managerOrder.equipmentId ?? null,
        managerOrder.employeeId ?? null,
        options.reportSnapshot.extraExpensesType ?? "other",
        Number(options.reportSnapshot.extraExpensesAmount),
        options.reportSnapshot.extraExpensesComment ?? "Автоматично з анкети працівника",
      ],
    );
  }

  await recalculateOrderFinanceState(managerOrder.id, client);
  await syncRentOrderOperationalStatus(client, managerOrder.id);

  return {
    orderId: managerOrder.id,
    employeeName: managerOrder.employeeName ?? "Працівник",
    customerName: managerOrder.customerName ?? "—",
    customerPhone: managerOrder.customerPhone ?? "—",
  };
}

internalTelegramRouter.post("/employee-candidates/start", async (req, res) => {
  try {
    const parsed = startSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid start candidate payload", details: parsed.error.flatten() });
      return;
    }

    const { rows } = await pool.query(
      `INSERT INTO "EmployeeTelegramCandidate" (
         "telegramUserId",
         "telegramChatId",
         "username",
         "firstName",
         "lastName",
         "languageCode",
         "status",
         "startedAt",
         "updatedAt"
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', NOW(), NOW())
       ON CONFLICT ("telegramUserId")
       DO UPDATE SET
         "telegramChatId" = EXCLUDED."telegramChatId",
         "username" = EXCLUDED."username",
         "firstName" = EXCLUDED."firstName",
         "lastName" = EXCLUDED."lastName",
         "languageCode" = EXCLUDED."languageCode",
         "updatedAt" = NOW(),
         "startedAt" = CASE
           WHEN "EmployeeTelegramCandidate"."status" = 'PENDING'
             THEN "EmployeeTelegramCandidate"."startedAt"
           ELSE NOW()
         END,
         "status" = CASE
           WHEN "EmployeeTelegramCandidate"."status" IN ('REJECTED')
             THEN 'PENDING'
           ELSE "EmployeeTelegramCandidate"."status"
         END
       RETURNING *`,
      [
        parsed.data.telegramUserId,
        parsed.data.telegramChatId,
        parsed.data.username ?? null,
        parsed.data.firstName ?? null,
        parsed.data.lastName ?? null,
        parsed.data.languageCode ?? null,
      ],
    );

    res.json({ status: "ok", candidate: rows[0] });
  } catch (error) {
    logError("POST /api/internal/telegram/employee-candidates/start error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

internalTelegramRouter.post("/worker/dashboard", async (req, res) => {
  const client = await pool.connect();
  try {
    const parsed = workerDashboardSchema.parse(req.body);
    const adminRes = await client.query(
      `SELECT "id", "email", "role", "telegramUsername"
       FROM "Admin"
       WHERE "telegramChatId" = $1
          OR ($2::text IS NOT NULL AND "telegramUserId" = $2::text)
       LIMIT 1`,
      [parsed.telegramChatId, parsed.telegramUserId ?? null],
    );
    const admin = adminRes.rows[0] ?? null;

    const adminDashboard = admin
      ? {
          newRequests: Number(
            (await client.query(
              `SELECT COUNT(*)::int AS count
               FROM "CustomerRequest"
               WHERE "status" = 'NEW'`,
            )).rows[0]?.count ?? 0,
          ),
          activeOrders: Number(
            (await client.query(
              `SELECT COUNT(*)::int AS count
               FROM "RentOrder"
               WHERE "status" NOT IN ('COMPLETED', 'CANCELLED')`,
            )).rows[0]?.count ?? 0,
          ),
          pendingCandidates: Number(
            (await client.query(
              `SELECT COUNT(*)::int AS count
               FROM "EmployeeTelegramCandidate"
               WHERE "status" = 'PENDING'`,
            )).rows[0]?.count ?? 0,
          ),
        }
      : null;

    const employeeRes = await client.query(
      `SELECT "id", "fullName", "role", "isActive"
       FROM "Employee"
       WHERE "telegramChatId" = $1
       LIMIT 1`,
      [parsed.telegramChatId],
    );
    const employee = employeeRes.rows[0] ?? null;

    if (!employee) {
      const candidateRes = await client.query(
        `SELECT "status"
         FROM "EmployeeTelegramCandidate"
         WHERE "telegramChatId" = $1
         ORDER BY "updatedAt" DESC
         LIMIT 1`,
        [parsed.telegramChatId],
      );
      res.json({
        status: candidateRes.rows[0] ? "pending" : "not_found",
        admin: admin
          ? {
              id: String(admin.id),
              email: String(admin.email),
              role: String(admin.role),
              telegramUsername: admin.telegramUsername ? String(admin.telegramUsername) : null,
            }
          : null,
        adminDashboard,
        employee: null,
        acceptedTasks: [],
        currentTask: null,
        balance: null,
      });
      return;
    }

    const assignmentsRes = await client.query(
      `SELECT
         wa."id" AS "assignmentId",
         wa."orderId",
         ro."orderNumber",
         wa."status" AS "assignmentStatus",
         wa."completionStatus",
         wa."assignedAt",
         wa."respondedAt",
         wa."telegramMessageId",
         wa."plannedNextStartAt",
         wa."completionComment",
         ro."customerName",
         ro."customerPhone",
         ro."status" AS "orderStatus",
         ro."agreedTotal",
         ro."agreedPrice",
         ro."finalAgreedPrice",
         ro."scheduledDate",
         ro."scheduledDateTo",
         ro."scheduledTimeFrom",
         ro."scheduledTimeTo",
         e."name" AS "equipmentName",
         wes."id" AS "executionSessionId",
         wes."status" AS "executionStatus",
         wes."startedAt",
         wes."finishedAt",
         wer."questionnaireStatus",
         cr."requestType",
         COALESCE(ro."addressFrom", cr."addressFrom") AS "addressFrom",
         COALESCE(ro."addressTo", cr."addressTo") AS "addressTo",
         cr."scheduledDate" AS "requestScheduledDate",
         cr."scheduledTime" AS "requestScheduledTime",
         cr."metadata",
         latestComp."type" AS "compensationType",
         latestComp."rate" AS "compensationRate",
         latestComp."quantity" AS "compensationQuantity",
         latestComp."percent" AS "compensationPercent",
         latestComp."finalAmount" AS "compensationFinalAmount",
         itemSchedule."plannedStartAt"
       FROM "WorkAssignment" wa
       INNER JOIN "RentOrder" ro ON ro."id" = wa."orderId"
       LEFT JOIN "Equipment" e ON e."id" = wa."equipmentId"
       LEFT JOIN LATERAL (
         SELECT wes.*
         FROM "WorkExecutionSession" wes
         WHERE wes."assignmentId" = wa."id"
         ORDER BY wes."sequenceNumber" DESC, wes."createdAt" DESC
         LIMIT 1
       ) wes ON TRUE
       LEFT JOIN LATERAL (
         SELECT wer.*
         FROM "WorkExecutionReport" wer
         WHERE wer."executionSessionId" = wes."id"
         LIMIT 1
       ) wer ON TRUE
       LEFT JOIN "CustomerRequest" cr ON cr."id" = ro."sourceCustomerRequestId"
       LEFT JOIN LATERAL (
         SELECT wc.*
         FROM "WorkerCompensation" wc
         WHERE wc."assignmentId" = wa."id"
            OR (
              wc."rentOrderId" = wa."orderId"
              AND wc."employeeId" = wa."employeeId"
              AND COALESCE(wc."equipmentId",'') = COALESCE(wa."equipmentId",'')
            )
         ORDER BY wc."updatedAt" DESC, wc."createdAt" DESC
         LIMIT 1
       ) latestComp ON TRUE
       LEFT JOIN LATERAL (
         SELECT roi."startDate" AS "plannedStartAt"
         FROM "RentOrderItem" roi
         WHERE roi."rentOrderId" = wa."orderId"
           AND (
             wa."equipmentId" IS NULL
             OR roi."equipmentId" = wa."equipmentId"
           )
         ORDER BY roi."startDate" ASC, roi."id" ASC
         LIMIT 1
       ) itemSchedule ON TRUE
       WHERE wa."employeeId" = $1
         AND wa."status" = 'ACCEPTED'
         AND ro."status" NOT IN ('COMPLETED', 'CANCELLED')
         AND COALESCE(wa."completionStatus", 'PENDING') <> 'COMPLETED'
       ORDER BY
         CASE WHEN wes."status" = 'IN_PROGRESS' THEN 0 ELSE 1 END,
         COALESCE(cr."scheduledDate", ro."scheduledDate", itemSchedule."plannedStartAt", wa."assignedAt") ASC NULLS LAST,
         wa."assignedAt" DESC`,
      [employee.id],
    );

    const acceptedTasks = await Promise.all(
      assignmentsRes.rows.map(async (assignment) => {
        const sourceRequest = assignment.requestType || assignment.addressFrom || assignment.addressTo || assignment.metadata
          ? {
              requestType: assignment.requestType,
              addressFrom: assignment.addressFrom,
              addressTo: assignment.addressTo,
              scheduledDate: assignment.requestScheduledDate,
              scheduledTime: assignment.requestScheduledTime,
              metadata: assignment.metadata,
            }
          : {
              requestType: null,
              addressFrom: null,
              addressTo: null,
              scheduledDate: null,
              scheduledTime: null,
              metadata: null,
            };
        const locations = await buildAcceptanceLocations(sourceRequest);
        const workerCompensationText = assignment.compensationType
          ? formatWorkerCompensationText({
              type: assignment.compensationType,
              rate: assignment.compensationRate == null ? null : Number(assignment.compensationRate),
              quantity: assignment.compensationQuantity == null ? null : Number(assignment.compensationQuantity),
              percent: assignment.compensationPercent == null ? null : Number(assignment.compensationPercent),
              finalAmount: assignment.compensationFinalAmount == null ? null : Number(assignment.compensationFinalAmount),
              orderTotal:
                Number(assignment.finalAgreedPrice ?? assignment.agreedTotal ?? assignment.agreedPrice ?? 0),
            })
          : null;

        return {
          assignmentId: String(assignment.assignmentId),
          orderId: String(assignment.orderId),
          orderNumber: assignment.orderNumber == null ? null : String(assignment.orderNumber),
          customerName: String(assignment.customerName ?? "—"),
          customerPhone: String(assignment.customerPhone ?? "—"),
          equipmentName: assignment.equipmentName ? String(assignment.equipmentName) : null,
          assignmentStatus: String(assignment.assignmentStatus ?? "ACCEPTED"),
          completionStatus: String(assignment.completionStatus ?? "PENDING"),
          orderStatus: String(assignment.orderStatus ?? "—"),
          executionSessionId: assignment.executionSessionId ? String(assignment.executionSessionId) : null,
          executionStatus: assignment.executionStatus ? String(assignment.executionStatus) : "NOT_STARTED",
          questionnaireStatus: assignment.questionnaireStatus ? String(assignment.questionnaireStatus) : null,
          telegramMessageId: assignment.telegramMessageId ? String(assignment.telegramMessageId) : null,
          startedAt: assignment.startedAt ?? null,
          finishedAt: assignment.finishedAt ?? null,
          plannedNextStartAt: assignment.plannedNextStartAt ?? null,
          completionComment: assignment.completionComment ?? null,
          plannedStartLabel: formatPlannedStart(sourceRequest, {
            scheduledDate: assignment.scheduledDate,
            scheduledDateTo: assignment.scheduledDateTo,
            scheduledTimeFrom: assignment.scheduledTimeFrom,
            scheduledTimeTo: assignment.scheduledTimeTo,
            plannedStartAt: assignment.plannedStartAt,
          }),
          locations,
          workerCompensationText,
        };
      }),
    );
    const groupedAcceptedTasks = mergeWorkerDashboardTasks(acceptedTasks);

    const balance = await calculateEmployeeBalanceSnapshot(String(employee.id), client);
    const currentTask =
      groupedAcceptedTasks.find((task) => task.executionStatus === "IN_PROGRESS") ??
      null;

    res.json({
      status: employee.isActive ? "active" : "inactive",
      admin: admin
        ? {
            id: String(admin.id),
            email: String(admin.email),
            role: String(admin.role),
            telegramUsername: admin.telegramUsername ? String(admin.telegramUsername) : null,
          }
        : null,
      adminDashboard,
      employee: {
        id: String(employee.id),
        fullName: String(employee.fullName ?? "—"),
        role: employee.role ? String(employee.role) : null,
      },
      acceptedTasks: groupedAcceptedTasks,
      currentTask,
      balance,
    });
  } catch (error) {
    logError("POST /api/internal/telegram/worker/dashboard error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});

internalTelegramRouter.post("/admin/action", async (req, res) => {
  const client = await pool.connect();
  try {
    const parsed = adminActionSchema.parse(req.body);
    const admin = await findTelegramAdmin(client, parsed.telegramChatId, parsed.telegramUserId);
    if (!admin) {
      res.status(403).json({ error: "Telegram admin account is not linked" });
      return;
    }

    if (parsed.action === "finance_summary") {
      res.json({
        status: "ok",
        prompt: buildAdminPrompt("done", await buildAdminFinanceSummaryText(client)),
      });
      return;
    }

    if (parsed.action === "worker_statuses") {
      res.json({
        status: "ok",
        prompt: buildAdminPrompt("done", await buildAdminWorkerStatusesText(client)),
      });
      return;
    }

    if (parsed.action === "expense_start") {
      await setAdminPendingAction(client, String(admin.id), {
        type: "expense",
        step: "type",
      });
      res.json({
        status: "ok",
        prompt: buildAdminExpenseTypePrompt(),
      });
      return;
    }

    const selectedExpenseType = getAdminExpenseTypeFromAction(parsed.action);
    if (selectedExpenseType) {
      await setAdminPendingAction(client, String(admin.id), {
        type: "expense",
        step: selectedExpenseType.type === "fuel" ? "liters" : "amount",
        expenseType: selectedExpenseType.type,
        expenseLabel: selectedExpenseType.label,
      });
      res.json({
        status: "ok",
        prompt: selectedExpenseType.type === "fuel"
          ? buildAdminPrompt("text", "⛽ Вкажіть кількість літрів пального.")
          : buildAdminPrompt("text", `🧾 ${selectedExpenseType.label}: вкажіть суму витрати у грн.`),
      });
      return;
    }

    await setAdminPendingAction(client, String(admin.id), {
      type: "expense",
      step: "type",
    });
    res.json({
      status: "ok",
      prompt: buildAdminExpenseTypePrompt(),
    });
  } catch (error) {
    logError("POST /api/internal/telegram/admin/action error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});

internalTelegramRouter.post("/admin/text", async (req, res) => {
  const client = await pool.connect();
  try {
    const parsed = adminTextSchema.parse(req.body);
    const admin = await findTelegramAdmin(client, parsed.telegramChatId, parsed.telegramUserId);
    if (!admin) {
      res.json({ status: "ignored" });
      return;
    }

    const pending = await getAdminPendingAction(client, String(admin.id));
    if (!pending?.type || !pending?.step) {
      res.json({ status: "ignored" });
      return;
    }

    if (pending.type === "expense") {
      const expenseType = typeof pending.expenseType === "string" ? pending.expenseType : null;
      const expenseLabel = typeof pending.expenseLabel === "string" ? pending.expenseLabel : "Витрата";

      if (pending.step === "type") {
        res.json({
          status: "ok",
          prompt: buildAdminExpenseTypePrompt(),
        });
        return;
      }

      if (expenseType === "fuel" && pending.step === "liters") {
        const liters = parsePositiveNumber(parsed.text);
        if (liters == null) {
          res.json({
            status: "ok",
            prompt: buildAdminPrompt("text", "Вкажіть кількість літрів числом, наприклад 120."),
          });
          return;
        }
        await setAdminPendingAction(client, String(admin.id), {
          ...pending,
          step: "price",
          liters,
        });
        res.json({
          status: "ok",
          prompt: buildAdminPrompt("text", "Вкажіть ціну за 1 літр у грн."),
        });
        return;
      }

      if (expenseType === "fuel" && pending.step === "price") {
        const price = parsePositiveNumber(parsed.text);
        if (price == null) {
          res.json({
            status: "ok",
            prompt: buildAdminPrompt("text", "Вкажіть ціну за літр числом, наприклад 55.5."),
          });
          return;
        }
        await setAdminPendingAction(client, String(admin.id), {
          ...pending,
          step: "comment",
          price,
        });
        res.json({
          status: "ok",
          prompt: buildAdminPrompt("buttons", "Додайте коментар до витрати або пропустіть.", [
            { text: "Без коментарю", callbackData: "admin_comment_skip:expense" },
          ]),
        });
        return;
      }

      if (expenseType !== "fuel" && pending.step === "amount") {
        const amount = parsePositiveNumber(parsed.text);
        if (amount == null) {
          res.json({
            status: "ok",
            prompt: buildAdminPrompt("text", "Вкажіть суму числом, наприклад 1500."),
          });
          return;
        }
        await setAdminPendingAction(client, String(admin.id), {
          ...pending,
          step: "comment",
          amount,
        });
        res.json({
          status: "ok",
          prompt: buildAdminPrompt("buttons", "Вкажіть коментар до витрати або пропустіть.", [
            { text: "Без коментарю", callbackData: "admin_comment_skip:expense" },
          ]),
        });
        return;
      }

      if (pending.step === "comment") {
        if (!expenseType) {
          await clearAdminPendingAction(client, String(admin.id));
          res.json({
            status: "ok",
            prompt: buildAdminPrompt("done", "Не вдалося зберегти витрату. Почніть ще раз."),
          });
          return;
        }

        if (expenseType === "fuel") {
          const liters = Number(pending.liters ?? 0);
          const price = Number(pending.price ?? 0);
          if (!Number.isFinite(liters) || liters <= 0 || !Number.isFinite(price) || price <= 0) {
            await clearAdminPendingAction(client, String(admin.id));
            res.json({
              status: "ok",
              prompt: buildAdminPrompt("done", "Не вдалося зберегти закупівлю пального. Почніть ще раз."),
            });
            return;
          }

          const amount = Math.round((liters * price + Number.EPSILON) * 100) / 100;
          await client.query(
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
             VALUES (NULL, 'fuel', $1, $2, $3, $4, $5, NOW())`,
            [
              todayIsoDate(),
              amount,
              liters,
              price,
              normalizeOptionalText(parsed.text) ?? `Закупівля пального через Telegram адміном ${admin.email}`,
            ],
          );
          await clearAdminPendingAction(client, String(admin.id));
          res.json({
            status: "ok",
            prompt: buildAdminPrompt(
              "done",
              `✅ Закупівлю пального збережено: ${liters} л × ${price} грн = ${amount} грн.`,
            ),
          });
          return;
        }

        const amount = Number(pending.amount ?? 0);
        if (!Number.isFinite(amount) || amount <= 0) {
          await clearAdminPendingAction(client, String(admin.id));
          res.json({
            status: "ok",
            prompt: buildAdminPrompt("done", "Не вдалося зберегти витрату. Почніть ще раз."),
          });
          return;
        }
        await client.query(
          `INSERT INTO "EquipmentExpense" (
             "equipmentId",
             "type",
             "expenseDate",
             "amount",
             "comment",
             "updatedAt"
           )
           VALUES (NULL, $1, $2, $3, $4, NOW())`,
          [
            expenseType,
            todayIsoDate(),
            amount,
            normalizeOptionalText(parsed.text) ?? `${expenseLabel} через Telegram адміном ${admin.email}`,
          ],
        );
        await clearAdminPendingAction(client, String(admin.id));
        res.json({
          status: "ok",
          prompt: buildAdminPrompt("done", `✅ Витрату "${expenseLabel}" збережено: ${amount} грн.`),
        });
        return;
      }
    }

    if (pending.type === "fuel_purchase") {
      if (pending.step === "liters") {
        const liters = parsePositiveNumber(parsed.text);
        if (liters == null) {
          res.json({
            status: "ok",
            prompt: buildAdminPrompt("text", "Вкажіть кількість літрів числом, наприклад 120."),
          });
          return;
        }
        await setAdminPendingAction(client, String(admin.id), {
          ...pending,
          step: "price",
          liters,
        });
        res.json({
          status: "ok",
          prompt: buildAdminPrompt("text", "Вкажіть ціну за 1 літр у грн."),
        });
        return;
      }

      if (pending.step === "price") {
        const price = parsePositiveNumber(parsed.text);
        if (price == null) {
          res.json({
            status: "ok",
            prompt: buildAdminPrompt("text", "Вкажіть ціну за літр числом, наприклад 55.5."),
          });
          return;
        }
        await setAdminPendingAction(client, String(admin.id), {
          ...pending,
          step: "comment",
          price,
        });
        res.json({
          status: "ok",
          prompt: buildAdminPrompt("buttons", "Додайте коментар до закупівлі або пропустіть.", [
            { text: "Без коментарю", callbackData: "admin_comment_skip:fuel_purchase" },
          ]),
        });
        return;
      }

      if (pending.step === "comment") {
        const liters = Number(pending.liters ?? 0);
        const price = Number(pending.price ?? 0);
        if (!Number.isFinite(liters) || liters <= 0 || !Number.isFinite(price) || price <= 0) {
          await clearAdminPendingAction(client, String(admin.id));
          res.json({
            status: "ok",
            prompt: buildAdminPrompt("done", "Не вдалося зберегти закупівлю. Почніть ще раз."),
          });
          return;
        }

        const amount = Math.round((liters * price + Number.EPSILON) * 100) / 100;
        await client.query(
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
           VALUES (NULL, 'fuel', $1, $2, $3, $4, $5, NOW())`,
          [
            todayIsoDate(),
            amount,
            liters,
            price,
            normalizeOptionalText(parsed.text) ?? `Закупівля пального через Telegram адміном ${admin.email}`,
          ],
        );
        await clearAdminPendingAction(client, String(admin.id));
        res.json({
          status: "ok",
          prompt: buildAdminPrompt(
            "done",
            `✅ Закупівлю пального збережено: ${liters} л × ${price} грн = ${amount} грн.`,
          ),
        });
        return;
      }
    }

    if (pending.type === "expense_other") {
      if (pending.step === "amount") {
        const amount = parsePositiveNumber(parsed.text);
        if (amount == null) {
          res.json({
            status: "ok",
            prompt: buildAdminPrompt("text", "Вкажіть суму числом, наприклад 1500."),
          });
          return;
        }
        await setAdminPendingAction(client, String(admin.id), {
          ...pending,
          step: "comment",
          amount,
        });
        res.json({
          status: "ok",
          prompt: buildAdminPrompt("buttons", "Вкажіть коментар до витрати або пропустіть.", [
            { text: "Без коментарю", callbackData: "admin_comment_skip:expense_other" },
          ]),
        });
        return;
      }

      if (pending.step === "comment") {
        const amount = Number(pending.amount ?? 0);
        if (!Number.isFinite(amount) || amount <= 0) {
          await clearAdminPendingAction(client, String(admin.id));
          res.json({
            status: "ok",
            prompt: buildAdminPrompt("done", "Не вдалося зберегти витрату. Почніть ще раз."),
          });
          return;
        }
        await client.query(
          `INSERT INTO "EquipmentExpense" (
             "equipmentId",
             "type",
             "expenseDate",
             "amount",
             "comment",
             "updatedAt"
           )
           VALUES (NULL, 'other', $1, $2, $3, NOW())`,
          [
            todayIsoDate(),
            amount,
            normalizeOptionalText(parsed.text) ?? `Витрата через Telegram адміном ${admin.email}`,
          ],
        );
        await clearAdminPendingAction(client, String(admin.id));
        res.json({
          status: "ok",
          prompt: buildAdminPrompt("done", `✅ Витрату збережено: ${amount} грн.`),
        });
        return;
      }
    }

    await clearAdminPendingAction(client, String(admin.id));
    res.json({ status: "ignored" });
  } catch (error) {
    logError("POST /api/internal/telegram/admin/text error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});

internalTelegramRouter.post("/assignments/respond", async (req, res) => {
  const client = await pool.connect();
  try {
    const parsed = assignmentRespondSchema.parse(req.body);

    await client.query("BEGIN");

    const assignmentRes = await client.query(
      `SELECT
         wa.*,
         ro."customerName",
         ro."customerPhone",
         ro."scheduledDate",
         ro."scheduledDateTo",
         ro."scheduledTimeFrom",
         ro."scheduledTimeTo",
         ro."agreedTotal",
         ro."agreedPrice",
         e."fullName" AS "employeeName",
         roi."plannedStartAt"
       FROM "WorkAssignment" wa
       INNER JOIN "RentOrder" ro ON ro."id" = wa."orderId"
       INNER JOIN "Employee" e ON e."id" = wa."employeeId"
       LEFT JOIN LATERAL (
         SELECT "startDate" AS "plannedStartAt"
         FROM "RentOrderItem"
         WHERE "rentOrderId" = wa."orderId"
           AND ("equipmentId" = wa."equipmentId" OR wa."equipmentId" IS NULL)
         ORDER BY "startDate" ASC, "id" ASC
         LIMIT 1
       ) roi ON TRUE
       WHERE wa."id" = $1
       LIMIT 1`,
      [parsed.assignmentId],
    );

    const assignment = assignmentRes.rows[0];
    if (!assignment) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Assignment not found" });
      return;
    }

    if (assignment.status === "ACCEPTED" || assignment.status === "DECLINED") {
      await client.query("ROLLBACK");
      res.json({ status: "ignored", assignmentStatus: assignment.status });
      return;
    }

    const nextStatus = parsed.action === "accept" ? "ACCEPTED" : "DECLINED";
    const groupedAssignmentsRes = await client.query(
      `SELECT "id"
       FROM "WorkAssignment"
       WHERE "orderId" = $1
         AND "employeeId" = $2
         AND "status" = 'PENDING'
         AND (
           $3::text IS NULL
           OR "telegramMessageId" = $3
           OR "id" = $4
         )
       ORDER BY "assignedAt" ASC, "createdAt" ASC`,
      [
        assignment.orderId,
        assignment.employeeId,
        assignment.telegramMessageId ?? null,
        parsed.assignmentId,
      ],
    );
    const groupedAssignmentIds = groupedAssignmentsRes.rows
      .map((row) => String(row.id))
      .filter(Boolean);
    const affectedAssignmentIds = groupedAssignmentIds.length > 0
      ? groupedAssignmentIds
      : [parsed.assignmentId];

    await client.query(
      `UPDATE "WorkAssignment"
       SET "status" = $1,
           "respondedAt" = NOW(),
           "responseComment" = $2,
           "declineReason" = CASE WHEN $1 = 'DECLINED' THEN $2 ELSE NULL END,
           "updatedAt" = NOW()
       WHERE "id" = ANY($3::text[])`,
      [nextStatus, parsed.responseComment ?? null, affectedAssignmentIds],
    );

    for (const assignmentId of affectedAssignmentIds) {
      await updateAssignmentCompletionState(
        client,
        assignmentId,
        parsed.action === "accept" ? "ACCEPTED" : "DECLINED",
        { completionComment: parsed.action === "decline" ? parsed.responseComment ?? null : null },
      );
    }

    for (const assignmentId of affectedAssignmentIds) {
      await client.query(
        `INSERT INTO "OrderEventLog" ("orderId", "assignmentId", "eventType", "payload")
         VALUES ($1, $2, $3, $4)`,
        [
          assignment.orderId,
          assignmentId,
          parsed.action === "accept" ? "worker_assignment_accepted" : "worker_assignment_declined",
          JSON.stringify({
            responseComment: parsed.responseComment ?? null,
            groupedAssignmentIds: affectedAssignmentIds,
          }),
        ],
      );
    }

    await syncRentOrderOperationalStatus(client, assignment.orderId);

    let workerAcceptanceSummary: {
      plannedStartLabel: string | null;
      executionTimeLabel: string | null;
      workerCompensationText: string | null;
      pickupAddress: string | null;
      destinationAddress: string | null;
      mapUrl: string | null;
      locations: Array<{
        label: string;
        address: string;
        latitude: number | null;
        longitude: number | null;
      }>;
    } | null = null;

    if (parsed.action === "accept") {
      const sourceRequestRes = await client.query(
        `SELECT
           COALESCE(ro."addressFrom", cr."addressFrom") AS "addressFrom",
           COALESCE(ro."addressTo", cr."addressTo") AS "addressTo",
           cr."requestType",
           cr."scheduledDate",
           cr."scheduledTime",
           cr."metadata"
         FROM "RentOrder" ro
         LEFT JOIN "CustomerRequest" cr ON cr."id" = ro."sourceCustomerRequestId"
         WHERE ro."id" = $1
         LIMIT 1`,
        [assignment.orderId],
      );
      const sourceRequest = sourceRequestRes.rows[0];
      const towMeta =
        sourceRequest?.metadata &&
        typeof sourceRequest.metadata === "object" &&
        sourceRequest.metadata.tow &&
        typeof sourceRequest.metadata.tow === "object"
          ? (sourceRequest.metadata.tow as Record<string, unknown>)
          : null;
      const pickupAddress = sourceRequest?.addressFrom ?? null;
      const destinationAddress =
        sourceRequest?.addressTo ??
        (towMeta?.destinationAddress as string | undefined) ??
        null;
      const locations = await buildAcceptanceLocations(sourceRequest);
      const workerCompensationRes = await client.query(
        `SELECT *
         FROM "WorkerCompensation"
         WHERE "rentOrderId" = $1
           AND (
             "assignmentId" = $2
             OR ("employeeId" = $3 AND COALESCE("equipmentId",'') = COALESCE($4::text,''))
           )
         ORDER BY "updatedAt" DESC, "createdAt" DESC
         LIMIT 1`,
        [
          assignment.orderId,
          assignment.id,
          assignment.employeeId ?? null,
          assignment.equipmentId ?? null,
        ],
      );
      const workerCompensation = workerCompensationRes.rows[0] ?? null;
      workerAcceptanceSummary = {
        plannedStartLabel: formatPlannedStart(sourceRequest, assignment),
        executionTimeLabel: formatExecutionTimeLabel(sourceRequest, assignment),
        workerCompensationText: workerCompensation
          ? formatWorkerCompensationText({
              type: workerCompensation.type,
              rate: workerCompensation.rate == null ? null : Number(workerCompensation.rate),
              quantity: workerCompensation.quantity == null ? null : Number(workerCompensation.quantity),
              percent: workerCompensation.percent == null ? null : Number(workerCompensation.percent),
              finalAmount: workerCompensation.finalAmount == null ? null : Number(workerCompensation.finalAmount),
              orderTotal: Number(assignment.agreedTotal ?? assignment.agreedPrice ?? 0),
            })
          : null,
        pickupAddress: locations[0]?.address ?? pickupAddress,
        destinationAddress: locations[1]?.address ?? destinationAddress,
        mapUrl: typeof locations[0]?.latitude === "number" && typeof locations[0]?.longitude === "number"
          ? buildMapsSearchLink(`${locations[0].latitude},${locations[0].longitude}`)
          : buildMapsSearchLink(pickupAddress),
        locations,
      };
    }

    await client.query("COMMIT");

    void sendManagerDispatchNotification({
      eventType: parsed.action === "accept" ? "assignment_accepted" : "assignment_declined",
      orderId: assignment.orderId,
      employeeName: assignment.employeeName ?? "Працівник",
      customerName: assignment.customerName ?? "—",
      customerPhone: assignment.customerPhone ?? "—",
      responseComment: parsed.responseComment ?? null,
    }).catch((error) => logError("sendManagerDispatchNotification assignment response error:", error));

    res.json({
      status: "ok",
      assignmentStatus: nextStatus,
      workerAcceptanceSummary,
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    logError("POST /api/internal/telegram/assignments/respond error:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid payload", details: error.flatten() });
      return;
    }
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});

internalTelegramRouter.post("/execution/start", async (req, res) => {
  const client = await pool.connect();
  try {
    const parsed = executionActionSchema.parse(req.body);
    await client.query("BEGIN");

    const assignmentRes = await client.query(
      `SELECT
         wa.*,
         ro."customerName",
         ro."customerPhone",
         e."fullName" AS "employeeName",
         COALESCE(wa."equipmentId", roi."equipmentId") AS "equipmentId",
         td."id" AS "trackerDeviceId"
       FROM "WorkAssignment" wa
       INNER JOIN "RentOrder" ro ON ro."id" = wa."orderId"
       INNER JOIN "Employee" e ON e."id" = wa."employeeId"
       LEFT JOIN LATERAL (
         SELECT "equipmentId"
         FROM "RentOrderItem"
         WHERE "rentOrderId" = wa."orderId"
           AND ("equipmentId" = wa."equipmentId" OR wa."equipmentId" IS NULL)
         ORDER BY "startDate" ASC, "id" ASC
         LIMIT 1
       ) roi ON TRUE
       LEFT JOIN "TrackerDevice" td ON td."equipmentId" = COALESCE(wa."equipmentId", roi."equipmentId")
       WHERE wa."id" = $1
       LIMIT 1`,
      [parsed.assignmentId],
    );

    const assignment = assignmentRes.rows[0];
    if (!assignment) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Assignment not found" });
      return;
    }

    if (assignment.status !== "ACCEPTED") {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Працівник ще не прийняв це завдання" });
      return;
    }

    if (assignment.completionStatus === "COMPLETED") {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Це призначення вже повністю завершене" });
      return;
    }

    const assignmentGroup = await getAcceptedAssignmentExecutionGroup(client, assignment);
    const startedSessionIds: string[] = [];
    let executionSessionId: string | undefined;
    let alreadyInProgress = true;

    for (const groupAssignment of assignmentGroup) {
      const sessionRes = await client.query(
        `SELECT *
         FROM "WorkExecutionSession"
         WHERE "assignmentId" = $1
         ORDER BY "sequenceNumber" DESC, "createdAt" DESC
         LIMIT 1`,
        [groupAssignment.id],
      );

      const currentSession = sessionRes.rows[0];
      if (currentSession?.status === "IN_PROGRESS") {
        startedSessionIds.push(String(currentSession.id));
        if (groupAssignment.id === parsed.assignmentId) {
          executionSessionId = String(currentSession.id);
        }
        continue;
      }

      alreadyInProgress = false;
      const nextSequenceNumber = Number(currentSession?.sequenceNumber ?? 0) + 1;
      const canReuseCurrentSession =
        currentSession &&
        currentSession.status === "NOT_STARTED" &&
        !currentSession.startedAt &&
        !currentSession.finishedAt;

      let currentExecutionSessionId: string | undefined;
      const resolvedEquipmentId = groupAssignment.resolvedEquipmentId ?? groupAssignment.equipmentId ?? null;
      if (canReuseCurrentSession) {
        currentExecutionSessionId = String(currentSession.id);
        await client.query(
          `UPDATE "WorkExecutionSession"
           SET "status" = 'IN_PROGRESS',
               "sequenceNumber" = COALESCE("sequenceNumber", 1),
               "startedAt" = COALESCE("startedAt", NOW()),
               "startedVia" = COALESCE("startedVia", 'telegram_button'),
               "trackerDeviceId" = COALESCE("trackerDeviceId", $1),
               "equipmentId" = COALESCE("equipmentId", $2),
               "plannedDurationMinutes" = COALESCE("plannedDurationMinutes", $4),
               "isFinalSession" = false,
               "updatedAt" = NOW()
           WHERE "id" = $3`,
          [
            groupAssignment.trackerDeviceId ?? null,
            resolvedEquipmentId,
            currentSession.id,
            groupAssignment.plannedDurationMinutes ?? null,
          ],
        );
      } else {
        const insertRes = await client.query(
          `INSERT INTO "WorkExecutionSession" (
             "orderId",
             "assignmentId",
             "status",
             "startedAt",
             "startedVia",
             "trackerDeviceId",
             "equipmentId",
             "sequenceNumber",
             "plannedDurationMinutes",
             "isFinalSession",
             "updatedAt"
           )
           VALUES ($1, $2, 'IN_PROGRESS', NOW(), 'telegram_button', $3, $4, $5, $6, false, NOW())
           RETURNING "id"`,
          [
            groupAssignment.orderId,
            groupAssignment.id,
            groupAssignment.trackerDeviceId ?? null,
            resolvedEquipmentId,
            nextSequenceNumber,
            groupAssignment.plannedDurationMinutes ?? null,
          ],
        );
        currentExecutionSessionId = insertRes.rows[0]?.id;
      }

      if (currentExecutionSessionId) {
        startedSessionIds.push(currentExecutionSessionId);
        if (groupAssignment.id === parsed.assignmentId || !executionSessionId) {
          executionSessionId = currentExecutionSessionId;
        }
      }

      await updateAssignmentCompletionState(client, groupAssignment.id, "IN_PROGRESS", {
        completionComment: null,
        plannedNextStartAt: null,
      });

      await client.query(
        `INSERT INTO "OrderEventLog" ("orderId", "assignmentId", "eventType", "payload")
         VALUES ($1, $2, 'worker_execution_started', $3)`,
        [
          groupAssignment.orderId,
          groupAssignment.id,
          JSON.stringify({
            executionSessionId: currentExecutionSessionId,
            groupedAssignmentIds: assignmentGroup.map((item) => item.id),
            startedVia: "telegram_button",
          }),
        ],
      );
    }

    if (alreadyInProgress && executionSessionId) {
      await client.query("ROLLBACK");
      res.json({ status: "ignored", executionStatus: "IN_PROGRESS", executionSessionId });
      return;
    }

    await syncRentOrderOperationalStatus(client, assignment.orderId);

    await client.query("COMMIT");

    void sendManagerDispatchNotification({
      eventType: "execution_started",
      orderId: assignment.orderId,
      employeeName: assignment.employeeName ?? "Працівник",
      customerName: assignment.customerName ?? "—",
      customerPhone: assignment.customerPhone ?? "—",
    }).catch((error) => logError("sendManagerDispatchNotification execution start error:", error));

    for (const sessionId of startedSessionIds) {
      void captureExecutionStartGps(sessionId).catch((gpsError) => {
        logError("execution start gps snapshot failed:", gpsError);
      });
    }

    res.json({ status: "ok", executionStatus: "IN_PROGRESS", executionSessionId, executionSessionIds: startedSessionIds });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    logError("POST /api/internal/telegram/execution/start error:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid payload", details: error.flatten() });
      return;
    }
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});

internalTelegramRouter.post("/execution/finish", async (req, res) => {
  const client = await pool.connect();
  try {
    const parsed = executionActionSchema.parse(req.body);
    await client.query("BEGIN");

    const assignmentRes = await client.query(
      `SELECT
         wa.*,
         ro."customerName",
         ro."customerPhone",
         e."fullName" AS "employeeName"
       FROM "WorkAssignment" wa
       INNER JOIN "RentOrder" ro ON ro."id" = wa."orderId"
       INNER JOIN "Employee" e ON e."id" = wa."employeeId"
       WHERE wa."id" = $1
       LIMIT 1`,
      [parsed.assignmentId],
    );

    const assignment = assignmentRes.rows[0];
    if (!assignment) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Assignment not found" });
      return;
    }

    const assignmentGroup = await getAcceptedAssignmentExecutionGroup(client, assignment);
    const groupSessionRows: Array<{ assignment: Record<string, any>; session: Record<string, any> }> = [];
    for (const groupAssignment of assignmentGroup) {
      const sessionRes = await client.query(
        `SELECT *
         FROM "WorkExecutionSession"
         WHERE "assignmentId" = $1
         ORDER BY "sequenceNumber" DESC, "createdAt" DESC
         LIMIT 1`,
        [groupAssignment.id],
      );
      if (sessionRes.rows[0]) {
        groupSessionRows.push({ assignment: groupAssignment, session: sessionRes.rows[0] });
      }
    }

    const primarySession = groupSessionRows.find((row) => row.assignment.id === parsed.assignmentId)?.session
      ?? groupSessionRows[0]?.session
      ?? null;
    if (!primarySession) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Виконання ще не було розпочато" });
      return;
    }

    const sessionsToFinish = groupSessionRows.filter((row) => row.session.status !== "FINISHED");
    if (sessionsToFinish.length === 0) {
      await client.query("ROLLBACK");
      res.json({ status: "ignored", executionStatus: "FINISHED", executionSessionId: primarySession.id });
      return;
    }

    const finishedSessionIds: string[] = [];
    const durationNotifications: string[] = [];
    for (const item of sessionsToFinish) {
      const finishRes = await client.query(
        `UPDATE "WorkExecutionSession"
         SET "status" = 'FINISHED',
             "finishedAt" = NOW(),
             "finishedVia" = 'telegram_button',
             "plannedDurationMinutes" = COALESCE("plannedDurationMinutes", $2),
             "durationDeltaMinutes" = CASE
               WHEN COALESCE("plannedDurationMinutes", $2) IS NULL OR "startedAt" IS NULL THEN NULL
               ELSE ROUND(EXTRACT(EPOCH FROM (NOW() - "startedAt")) / 60)::int - COALESCE("plannedDurationMinutes", $2)
             END,
             "durationStatus" = CASE
               WHEN COALESCE("plannedDurationMinutes", $2) IS NULL OR "startedAt" IS NULL THEN NULL
               WHEN ABS(ROUND(EXTRACT(EPOCH FROM (NOW() - "startedAt")) / 60)::int - COALESCE("plannedDurationMinutes", $2)) <= 5 THEN 'on_time'
               WHEN ROUND(EXTRACT(EPOCH FROM (NOW() - "startedAt")) / 60)::int < COALESCE("plannedDurationMinutes", $2) THEN 'faster'
             ELSE 'slower'
             END,
             "updatedAt" = NOW()
         WHERE "id" = $1
         RETURNING "plannedDurationMinutes", "durationDeltaMinutes", "durationStatus"`,
        [item.session.id, item.assignment.plannedDurationMinutes ?? null],
      );
      const finishedSession = finishRes.rows[0];
      if (finishedSession?.durationStatus === "faster" || finishedSession?.durationStatus === "slower") {
        const delta = Math.abs(Number(finishedSession.durationDeltaMinutes ?? 0));
        const equipmentName = item.assignment.equipmentName ? ` (${item.assignment.equipmentName})` : "";
        durationNotifications.push(
          `${finishedSession.durationStatus === "faster" ? "швидше" : "пізніше"} плану на ${formatDurationMinutes(delta)}${equipmentName}`,
        );
      }

      await client.query(
        `INSERT INTO "WorkExecutionReport" (
           "executionSessionId",
           "workCompleted",
           "needsNextShift",
           "nextShiftComment",
           "updatedAt"
         )
         VALUES ($1, true, false, NULL, NOW())
         ON CONFLICT ("executionSessionId")
         DO UPDATE SET
           "workCompleted" = true,
           "needsNextShift" = false,
           "nextShiftComment" = NULL,
           "questionnaireStep" = 'cash_collected',
           "questionnaireStatus" = 'PENDING',
           "awaitingTextField" = NULL,
           "submittedAt" = NULL,
           "updatedAt" = NOW()`,
        [item.session.id],
      );

      await client.query(
        `UPDATE "WorkExecutionReport"
         SET "questionnaireStep" = 'cash_collected',
             "questionnaireStatus" = 'PENDING',
             "awaitingTextField" = NULL,
             "workCompleted" = true,
             "needsNextShift" = false,
             "nextShiftComment" = NULL,
             "submittedAt" = NULL,
             "updatedAt" = NOW()
         WHERE "executionSessionId" = $1`,
        [item.session.id],
      );

      await client.query(
        `INSERT INTO "OrderEventLog" ("orderId", "assignmentId", "eventType", "payload")
         VALUES ($1, $2, 'worker_execution_finished', $3)`,
        [
          assignment.orderId,
          item.assignment.id,
          JSON.stringify({
            executionSessionId: item.session.id,
            groupedAssignmentIds: assignmentGroup.map((groupAssignment) => groupAssignment.id),
            finishedVia: "telegram_button",
            plannedDurationMinutes: finishedSession?.plannedDurationMinutes ?? item.assignment.plannedDurationMinutes ?? null,
            durationDeltaMinutes: finishedSession?.durationDeltaMinutes ?? null,
            durationStatus: finishedSession?.durationStatus ?? null,
          }),
        ],
      );

      finishedSessionIds.push(String(item.session.id));
    }

    await syncRentOrderOperationalStatus(client, assignment.orderId);

    await client.query("COMMIT");

    void sendManagerDispatchNotification({
      eventType: "execution_finished",
      orderId: assignment.orderId,
      employeeName: assignment.employeeName ?? "Працівник",
      customerName: assignment.customerName ?? "—",
      customerPhone: assignment.customerPhone ?? "—",
    }).catch((error) => logError("sendManagerDispatchNotification execution finish error:", error));

    for (const sessionId of finishedSessionIds) {
      void enrichExecutionReportWithGps(sessionId).catch((gpsError) => {
        logError("execution gps enrichment failed:", gpsError);
      });
    }

    res.json({
      status: "ok",
      executionStatus: "FINISHED",
      executionSessionId: primarySession.id,
      executionSessionIds: finishedSessionIds,
      durationNotifications,
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    logError("POST /api/internal/telegram/execution/finish error:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid payload", details: error.flatten() });
      return;
    }
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});

internalTelegramRouter.post("/execution/report/callback", async (req, res) => {
  const client = await pool.connect();
  try {
    const parsed = reportCallbackSchema.parse(req.body);
    await client.query("BEGIN");

    const reportRes = await client.query(
      `SELECT * FROM "WorkExecutionReport" WHERE "executionSessionId" = $1 LIMIT 1`,
      [parsed.executionSessionId],
    );
    const report = reportRes.rows[0];

    if (!report) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Execution report not found" });
      return;
    }

    let nextPrompt: ReportPrompt | null = null;
    let managerNotificationPayload:
      | {
          orderId: string;
          employeeName: string;
          customerName: string;
          customerPhone: string;
        }
      | null = null;

    if (parsed.action === "cash_yes") {
      await client.query(
        `UPDATE "WorkExecutionReport"
         SET "cashCollected" = true,
             "questionnaireStatus" = 'AWAITING_TEXT',
             "awaitingTextField" = 'cashAmount',
             "updatedAt" = NOW()
         WHERE "executionSessionId" = $1`,
        [parsed.executionSessionId],
      );
      nextPrompt = { kind: "text", text: "💵 Вкажіть суму готівки цифрою, наприклад `3500`." };
    }

    if (parsed.action === "cash_no") {
      await client.query(
        `UPDATE "WorkExecutionReport"
         SET "cashCollected" = false,
             "cashAmount" = NULL,
             "questionnaireStep" = 'extra_expenses',
             "questionnaireStatus" = 'PENDING',
             "awaitingTextField" = NULL,
             "updatedAt" = NOW()
         WHERE "executionSessionId" = $1`,
        [parsed.executionSessionId],
      );
      nextPrompt = getExtraExpensesQuestion(parsed.executionSessionId);
    }

    if (parsed.action === "extra_yes") {
      await client.query(
        `UPDATE "WorkExecutionReport"
         SET "questionnaireStep" = 'extra_expense_type',
             "questionnaireStatus" = 'PENDING',
             "awaitingTextField" = NULL,
             "updatedAt" = NOW()
         WHERE "executionSessionId" = $1`,
        [parsed.executionSessionId],
      );
      nextPrompt = getExpenseTypeQuestion(parsed.executionSessionId);
    }

    if (parsed.action === "extra_no") {
      await client.query(
        `UPDATE "WorkExecutionReport"
         SET "extraExpensesAmount" = NULL,
             "extraExpensesType" = NULL,
             "extraExpensesComment" = NULL,
             "questionnaireStep" = 'had_problems',
             "questionnaireStatus" = 'PENDING',
             "awaitingTextField" = NULL,
             "updatedAt" = NOW()
         WHERE "executionSessionId" = $1`,
        [parsed.executionSessionId],
      );
      nextPrompt = getProblemsQuestion(parsed.executionSessionId);
    }

    if (
      parsed.action === "expense_type_fuel" ||
      parsed.action === "expense_type_parking" ||
      parsed.action === "expense_type_materials" ||
      parsed.action === "expense_type_repair" ||
      parsed.action === "expense_type_other"
    ) {
      const expenseType =
        parsed.action === "expense_type_fuel"
          ? "fuel"
          : parsed.action === "expense_type_parking"
            ? "parking"
            : parsed.action === "expense_type_materials"
              ? "materials"
              : parsed.action === "expense_type_repair"
                ? "repair"
                : "other";

      await client.query(
        `UPDATE "WorkExecutionReport"
         SET "extraExpensesType" = $1,
             "questionnaireStatus" = 'AWAITING_TEXT',
             "awaitingTextField" = 'extraExpensesAmount',
             "updatedAt" = NOW()
         WHERE "executionSessionId" = $2`,
        [expenseType, parsed.executionSessionId],
      );
      nextPrompt = {
        kind: "text",
        text: "🧾 Вкажіть суму додаткових витрат цифрою, наприклад `700`.",
      };
    }

    if (parsed.action === "extra_expense_comment_skip") {
      await client.query(
        `UPDATE "WorkExecutionReport"
         SET "extraExpensesComment" = NULL,
             "questionnaireStep" = 'had_problems',
             "questionnaireStatus" = 'PENDING',
             "awaitingTextField" = NULL,
             "updatedAt" = NOW()
         WHERE "executionSessionId" = $1`,
        [parsed.executionSessionId],
      );
      nextPrompt = getProblemsQuestion(parsed.executionSessionId);
    }

    if (parsed.action === "problems_yes") {
      await client.query(
        `UPDATE "WorkExecutionReport"
         SET "hadProblems" = true,
             "questionnaireStatus" = 'AWAITING_TEXT',
             "awaitingTextField" = 'problemsComment',
             "updatedAt" = NOW()
         WHERE "executionSessionId" = $1`,
        [parsed.executionSessionId],
      );
      nextPrompt = {
        kind: "text",
        text: "⚠️ Опишіть проблему або надішліть `-`, якщо достатньо лише відмітки про її наявність.",
      };
    }

    if (parsed.action === "problems_no") {
      await client.query(
        `UPDATE "WorkExecutionReport"
         SET "hadProblems" = false,
             "problemsComment" = NULL,
             "questionnaireStep" = 'worker_comment',
             "questionnaireStatus" = 'AWAITING_TEXT',
             "awaitingTextField" = 'workerComment',
             "updatedAt" = NOW()
         WHERE "executionSessionId" = $1`,
        [parsed.executionSessionId],
      );
      nextPrompt = getWorkerCommentQuestion(parsed.executionSessionId);
    }

    if (parsed.action === "worker_comment_skip") {
      await client.query(
        `UPDATE "WorkExecutionReport"
         SET "workerComment" = NULL,
             "questionnaireStep" = 'work_completion',
             "questionnaireStatus" = 'PENDING',
             "awaitingTextField" = NULL,
             "updatedAt" = NOW()
         WHERE "executionSessionId" = $1`,
        [parsed.executionSessionId],
      );
      nextPrompt = getWorkCompletionQuestion(parsed.executionSessionId);
    }

    if (parsed.action === "work_complete_yes") {
      await client.query(
        `UPDATE "WorkExecutionReport"
         SET "questionnaireStep" = 'COMPLETED',
             "questionnaireStatus" = 'COMPLETED',
             "awaitingTextField" = NULL,
             "submittedAt" = NOW(),
             "workCompleted" = true,
             "needsNextShift" = false,
             "nextShiftComment" = NULL,
             "updatedAt" = NOW()
         WHERE "executionSessionId" = $1`,
        [parsed.executionSessionId],
      );

      managerNotificationPayload = await finalizeExecutionReportSubmission(client, parsed.executionSessionId, {
        reportSnapshot: report,
        workerComment: report.workerComment ?? null,
        workCompleted: true,
        needsNextShift: false,
        nextShiftComment: null,
      });

      nextPrompt = {
        kind: "done",
        text: "✅ Зміну та звіт збережено. Завдання позначене як повністю виконане.",
      };
    }

    if (parsed.action === "work_complete_next_shift") {
      await client.query(
        `UPDATE "WorkExecutionReport"
         SET "questionnaireStatus" = 'AWAITING_TEXT',
             "awaitingTextField" = 'nextShiftComment',
             "workCompleted" = false,
             "needsNextShift" = true,
             "updatedAt" = NOW()
         WHERE "executionSessionId" = $1`,
        [parsed.executionSessionId],
      );
      nextPrompt = getNextShiftCommentQuestion(parsed.executionSessionId);
    }

    if (parsed.action === "next_shift_comment_skip") {
      await client.query(
        `UPDATE "WorkExecutionReport"
         SET "questionnaireStep" = 'COMPLETED',
             "questionnaireStatus" = 'COMPLETED',
             "awaitingTextField" = NULL,
             "submittedAt" = NOW(),
             "workCompleted" = false,
             "needsNextShift" = true,
             "nextShiftComment" = NULL,
             "updatedAt" = NOW()
         WHERE "executionSessionId" = $1`,
        [parsed.executionSessionId],
      );

      managerNotificationPayload = await finalizeExecutionReportSubmission(client, parsed.executionSessionId, {
        reportSnapshot: report,
        workerComment: report.workerComment ?? null,
        workCompleted: false,
        needsNextShift: true,
        nextShiftComment: null,
      });

      nextPrompt = {
        kind: "done",
        text: "✅ Зміну завершено. Завдання залишилось активним і чекатиме наступного виїзду.",
      };
    }

    await client.query("COMMIT");

    if (managerNotificationPayload) {
      void sendManagerDispatchNotification({
        eventType: "worker_report_submitted",
        ...managerNotificationPayload,
      }).catch((error) => logError("sendManagerDispatchNotification worker report error:", error));
    }

    res.json({ status: "ok", prompt: nextPrompt });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    logError("POST /api/internal/telegram/execution/report/callback error:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid payload", details: error.flatten() });
      return;
    }
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});

internalTelegramRouter.post("/execution/report/text", async (req, res) => {
  const client = await pool.connect();
  try {
    const parsed = reportTextSchema.parse(req.body);
    await client.query("BEGIN");
    let managerNotificationPayload:
      | {
          orderId: string;
          employeeName: string;
          customerName: string;
          customerPhone: string;
        }
      | null = null;

    const reportRes = await client.query(
      `SELECT
         wer.*,
         wes."id" AS "executionSessionId"
       FROM "WorkExecutionReport" wer
       INNER JOIN "WorkExecutionSession" wes ON wes."id" = wer."executionSessionId"
       INNER JOIN "WorkAssignment" wa ON wa."id" = wes."assignmentId"
       INNER JOIN "Employee" e ON e."id" = wa."employeeId"
       WHERE e."telegramChatId" = $1
         AND wer."questionnaireStatus" IN ('AWAITING_TEXT', 'PENDING')
       ORDER BY wer."updatedAt" DESC
       LIMIT 1`,
      [parsed.telegramChatId],
    );

    const report = reportRes.rows[0];
    if (!report) {
      await client.query("ROLLBACK");
      res.json({ status: "ignored" });
      return;
    }

    let nextPrompt: ReportPrompt | null = null;

    if (report.awaitingTextField === "cashAmount") {
      const amount = parseMoneyValue(parsed.text);
      if (amount === null) {
        await client.query("ROLLBACK");
        res.json({
          status: "retry",
          prompt: { kind: "text", text: "💵 Не вдалося розпізнати суму. Надішліть число, наприклад `3500`." },
        });
        return;
      }

      await client.query(
        `UPDATE "WorkExecutionReport"
         SET "cashAmount" = $1,
             "questionnaireStep" = 'extra_expenses',
             "questionnaireStatus" = 'PENDING',
             "awaitingTextField" = NULL,
             "updatedAt" = NOW()
         WHERE "executionSessionId" = $2`,
        [amount, report.executionSessionId],
      );
      nextPrompt = getExtraExpensesQuestion(report.executionSessionId);
    } else if (report.awaitingTextField === "extraExpensesAmount") {
      const amount = parseMoneyValue(parsed.text);
      if (amount === null) {
        await client.query("ROLLBACK");
        res.json({
          status: "retry",
          prompt: { kind: "text", text: "🧾 Не вдалося розпізнати суму. Надішліть число, наприклад `700`." },
        });
        return;
      }

      await client.query(
        `UPDATE "WorkExecutionReport"
         SET "extraExpensesAmount" = $1,
             "questionnaireStatus" = 'AWAITING_TEXT',
             "awaitingTextField" = 'extraExpensesComment',
             "updatedAt" = NOW()
         WHERE "executionSessionId" = $2`,
        [amount, report.executionSessionId],
      );
      nextPrompt = getExtraExpenseCommentQuestion(report.executionSessionId);
    } else if (report.awaitingTextField === "extraExpensesComment") {
      await client.query(
        `UPDATE "WorkExecutionReport"
         SET "extraExpensesComment" = $1,
             "questionnaireStep" = 'had_problems',
             "questionnaireStatus" = 'PENDING',
             "awaitingTextField" = NULL,
             "updatedAt" = NOW()
         WHERE "executionSessionId" = $2`,
        [normalizeOptionalText(parsed.text), report.executionSessionId],
      );
      nextPrompt = getProblemsQuestion(report.executionSessionId);
    } else if (report.awaitingTextField === "problemsComment") {
      await client.query(
        `UPDATE "WorkExecutionReport"
         SET "problemsComment" = $1,
             "questionnaireStep" = 'worker_comment',
             "questionnaireStatus" = 'AWAITING_TEXT',
             "awaitingTextField" = 'workerComment',
             "updatedAt" = NOW()
         WHERE "executionSessionId" = $2`,
        [normalizeOptionalText(parsed.text), report.executionSessionId],
      );
      nextPrompt = getWorkerCommentQuestion(report.executionSessionId);
    } else if (report.awaitingTextField === "workerComment") {
      const workerComment = normalizeOptionalText(parsed.text);

      await client.query(
        `UPDATE "WorkExecutionReport"
         SET "workerComment" = $1,
             "questionnaireStep" = 'work_completion',
             "questionnaireStatus" = 'PENDING',
             "awaitingTextField" = NULL,
             "updatedAt" = NOW()
         WHERE "executionSessionId" = $2`,
        [workerComment, report.executionSessionId],
      );
      nextPrompt = getWorkCompletionQuestion(report.executionSessionId);
    } else if (report.awaitingTextField === "nextShiftComment") {
      const nextShiftComment = normalizeOptionalText(parsed.text);

      await client.query(
        `UPDATE "WorkExecutionReport"
         SET "questionnaireStep" = 'COMPLETED',
             "questionnaireStatus" = 'COMPLETED',
             "awaitingTextField" = NULL,
             "submittedAt" = NOW(),
             "workCompleted" = false,
             "needsNextShift" = true,
             "nextShiftComment" = $1,
             "updatedAt" = NOW()
         WHERE "executionSessionId" = $2`,
        [nextShiftComment, report.executionSessionId],
      );

      managerNotificationPayload = await finalizeExecutionReportSubmission(client, report.executionSessionId, {
        reportSnapshot: report,
        workerComment: report.workerComment ?? null,
        workCompleted: false,
        needsNextShift: true,
        nextShiftComment,
      });

      nextPrompt = {
        kind: "done",
        text: "✅ Зміну завершено. Завдання залишилось активним і чекатиме наступного виїзду.",
      };
    } else {
      const prompt = await getReportPromptByState(client, report.executionSessionId);
      await client.query("ROLLBACK");
      res.json({ status: "retry", prompt });
      return;
    }

    await client.query("COMMIT");

    if (managerNotificationPayload) {
      void sendManagerDispatchNotification({
        eventType: "worker_report_submitted",
        ...managerNotificationPayload,
      }).catch((error) => logError("sendManagerDispatchNotification worker report error:", error));
    }

    res.json({ status: "ok", prompt: nextPrompt });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    logError("POST /api/internal/telegram/execution/report/text error:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid payload", details: error.flatten() });
      return;
    }
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});
