import { pool } from "./db.js";

type DbClient = Pick<typeof pool, "query">;

const MONEY_EPSILON = 0.009;

export const orderPriceCalculationTypes = [
  "fixed",
  "per_km",
  "per_hour",
  "per_shift",
  "manual",
  "percent",
] as const;

export const orderPaymentStatuses = [
  "UNPAID",
  "PARTIALLY_PAID",
  "PAID",
  "OVERPAID",
] as const;

export const workerCompensationTypes = [
  "fixed",
  "hourly",
  "shift",
  "percent",
  "manual",
] as const;

export const workerSettlementStatuses = [
  "NOT_SETTLED",
  "PARTIALLY_SETTLED",
  "SETTLED",
  "EMPLOYEE_OWES_COMPANY",
  "COMPANY_OWES_EMPLOYEE",
] as const;

export const orderExpenseTypes = [
  "fuel",
  "fuel_purchase",
  "parking",
  "materials",
  "repair",
  "maintenance",
  "road_toll",
  "other",
] as const;

export const orderExpenseSources = [
  "manager",
  "employee",
  "system",
] as const;

export const settlementDirections = [
  "to_employee",
  "from_employee",
  "employee_to_employee",
] as const;

export const financePaymentMethods = [
  "cash",
  "card",
  "bank_transfer",
  "invoice",
  "other",
] as const;

export const paymentReceivedByTypes = [
  "employee",
  "manager",
  "company",
  "other",
] as const;

export const equipmentExpenseTypes = [
  "fuel",
  "materials",
  "maintenance",
  "repair",
  "parts",
  "insurance",
  "wash",
  "other",
] as const;

export type OrderFinance = Awaited<ReturnType<typeof calculateOrderFinance>>;
export type FinanceDateRange = { from: string; to: string };

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = toNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundVolume(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function sumBy<T>(items: T[], pick: (item: T) => unknown) {
  return roundMoney(items.reduce((sum, item) => sum + toNumber(pick(item)), 0));
}

function hasMoneyValue(value: number) {
  return Math.abs(value) > MONEY_EPSILON;
}

function getFuelLowBalanceThresholdLiters() {
  const parsed = Number(process.env.FUEL_LOW_BALANCE_LITERS ?? 50);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 50;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getMaterialPassThroughCost(metadata: unknown) {
  if (!isRecord(metadata)) return 0;
  const materialDelivery = isRecord(metadata.materialDelivery) ? metadata.materialDelivery : null;
  if (!materialDelivery || materialDelivery.servicePricingType !== "material_delivery_calculator") {
    return 0;
  }

  const materialCost = nullableNumber(materialDelivery.materialCost);
  return materialCost != null && hasMoneyValue(materialCost) ? roundMoney(materialCost) : 0;
}

export function calculatePaymentStatus(total: number, paid: number) {
  if (!hasMoneyValue(paid)) return "UNPAID" as const;
  if (paid > total + MONEY_EPSILON) return "OVERPAID" as const;
  if (Math.abs(total - paid) <= MONEY_EPSILON) return "PAID" as const;
  return "PARTIALLY_PAID" as const;
}

export function calculateWorkerBalance(input: {
  workerSalary: number;
  employeeCollectedCash: number;
  employeeReportedExpenses: number;
  settlementNet: number;
}) {
  const grossBalance = roundMoney(
    input.workerSalary + input.employeeReportedExpenses - input.employeeCollectedCash,
  );
  return roundMoney(grossBalance - input.settlementNet);
}

export function calculateWorkerObligations(input: {
  workerSalary: number;
  employeeCollectedCash: number;
  employeeReportedExpenses: number;
  paidByCompany: number;
  returnedToCompany: number;
}) {
  const companyOwesEmployee = Math.max(
    0,
    roundMoney(input.workerSalary + input.employeeReportedExpenses - input.paidByCompany),
  );
  const employeeOwesCompany = Math.max(
    0,
    roundMoney(input.employeeCollectedCash - input.returnedToCompany),
  );

  return {
    companyOwesEmployee,
    employeeOwesCompany,
    balance: roundMoney(companyOwesEmployee - employeeOwesCompany),
  };
}

export function calculateWorkerSettlementStatus(balance: number, settlementNet = 0) {
  if (Math.abs(balance) <= MONEY_EPSILON) return "SETTLED" as const;
  if (balance > 0) {
    return hasMoneyValue(settlementNet) ? "PARTIALLY_SETTLED" as const : "COMPANY_OWES_EMPLOYEE" as const;
  }
  return hasMoneyValue(settlementNet) ? "PARTIALLY_SETTLED" as const : "EMPLOYEE_OWES_COMPANY" as const;
}

export function calculateWorkerSettlementStatusFromDebts(input: {
  companyOwesEmployee: number;
  employeeOwesCompany: number;
  hasSettlements?: boolean;
}) {
  const companyOwes = hasMoneyValue(input.companyOwesEmployee);
  const employeeOwes = hasMoneyValue(input.employeeOwesCompany);
  if (!companyOwes && !employeeOwes) return "SETTLED" as const;
  if (companyOwes && employeeOwes) return "PARTIALLY_SETTLED" as const;
  if (companyOwes) return input.hasSettlements ? "PARTIALLY_SETTLED" as const : "COMPANY_OWES_EMPLOYEE" as const;
  return input.hasSettlements ? "PARTIALLY_SETTLED" as const : "EMPLOYEE_OWES_COMPANY" as const;
}

export function calculatePriceItemTotal(input: {
  calculationType: string;
  quantity?: number | null;
  unitPrice?: number | null;
  total?: number | null;
}) {
  if (input.total !== null && input.total !== undefined) {
    return roundMoney(input.total);
  }
  const quantity = input.quantity ?? 1;
  const unitPrice = input.unitPrice ?? 0;
  if (input.calculationType === "manual") {
    return roundMoney(unitPrice);
  }
  return roundMoney(quantity * unitPrice);
}

export function calculateWorkerCompensationAmount(input: {
  type: string;
  rate?: number | null;
  quantity?: number | null;
  actualQuantity?: number | null;
  percent?: number | null;
  finalAmount?: number | null;
  orderTotal: number;
}) {
  if (input.type === "hourly" && input.actualQuantity !== null && input.actualQuantity !== undefined) {
    return roundMoney((input.rate ?? 0) * input.actualQuantity);
  }

  if (input.type === "hourly" && (input.quantity === null || input.quantity === undefined)) {
    return input.finalAmount !== null && input.finalAmount !== undefined
      ? roundMoney(input.finalAmount)
      : 0;
  }

  if (input.finalAmount !== null && input.finalAmount !== undefined) {
    return roundMoney(input.finalAmount);
  }

  if (input.type === "percent") {
    return roundMoney(input.orderTotal * ((input.percent ?? 0) / 100));
  }

  if (input.type === "manual") {
    return roundMoney(input.rate ?? 0);
  }

  const rate = input.rate ?? 0;
  const quantity = input.quantity ?? 1;
  return roundMoney(rate * quantity);
}

export function formatWorkerCompensationText(input: {
  type?: string | null;
  rate?: number | null;
  quantity?: number | null;
  actualQuantity?: number | null;
  percent?: number | null;
  finalAmount?: number | null;
  orderTotal: number;
}) {
  const type = input.type ?? "manual";
  const amount = calculateWorkerCompensationAmount({
    type,
    rate: input.rate ?? null,
    quantity: input.quantity ?? null,
    actualQuantity: input.actualQuantity ?? null,
    percent: input.percent ?? null,
    finalAmount: input.finalAmount ?? null,
    orderTotal: input.orderTotal,
  });

  const amountLabel = `${amount} грн`;
  if (type === "fixed") return `Фіксовано: ${amountLabel}`;
  if (type === "hourly") {
    const rate = input.rate ?? 0;
    if (input.actualQuantity == null && input.quantity == null) {
      return `${rate} грн/год`;
    }
    const quantity = input.actualQuantity ?? input.quantity ?? 1;
    const suffix = input.actualQuantity != null ? " фактичних год" : " год";
    return `${rate} грн/год × ${quantity}${suffix} = ${amountLabel}`;
  }
  if (type === "shift") {
    const rate = input.rate ?? amount;
    const quantity = input.quantity ?? 1;
    return `${rate} грн/зміна × ${quantity} = ${amountLabel}`;
  }
  if (type === "percent") {
    const percent = input.percent ?? 0;
    return `${percent}% від суми замовлення, орієнтовно ${amountLabel}`;
  }
  return `Ручна сума: ${amountLabel}`;
}

function mapPriceItem(row: Record<string, unknown>) {
  return {
    ...row,
    quantity: toNumber(row.quantity),
    unitPrice: toNumber(row.unitPrice),
    total: toNumber(row.total),
  } as Record<string, unknown> & {
    equipmentId?: string | null;
    quantity: number;
    unitPrice: number;
    total: number;
  };
}

function mapPayment(row: Record<string, unknown>) {
  return {
    ...row,
    amount: toNumber(row.amount),
  } as Record<string, unknown> & {
    amount: number;
    executionSessionId?: string | null;
    receivedByType?: string | null;
  };
}

function mapExpense(row: Record<string, unknown>) {
  return {
    ...row,
    amount: toNumber(row.amount),
    fuelLiters: nullableNumber(row.fuelLiters),
    fuelPricePerLiter: nullableNumber(row.fuelPricePerLiter),
  } as Record<string, unknown> & {
    amount: number;
    executionSessionId?: string | null;
    fuelLiters: number | null;
    fuelPricePerLiter: number | null;
    source?: string | null;
  };
}

function mapWorkerCompensation(row: Record<string, unknown>) {
  return {
    ...row,
    rate: nullableNumber(row.rate),
    quantity: nullableNumber(row.quantity),
    actualQuantity: nullableNumber(row.actualQuantity),
    percent: nullableNumber(row.percent),
    calculatedAmount: nullableNumber(row.calculatedAmount),
    finalAmount: nullableNumber(row.finalAmount),
  } as Record<string, unknown> & {
    assignmentId?: string | null;
    equipmentId?: string | null;
    equipmentName?: string | null;
    type?: string | null;
    rate: number | null;
    quantity: number | null;
    actualQuantity: number | null;
    percent: number | null;
    calculatedAmount: number | null;
    finalAmount: number | null;
  };
}

function mapSettlement(row: Record<string, unknown>) {
  return {
    ...row,
    amount: toNumber(row.amount),
  } as Record<string, unknown> & {
    amount: number;
    direction?: string | null;
    employeeId?: string | null;
    employeeName?: string | null;
    fromEmployeeId?: string | null;
    fromEmployeeName?: string | null;
    toEmployeeId?: string | null;
    toEmployeeName?: string | null;
  };
}

function settlementDirectionToSignedAmount(direction: unknown, amount: number) {
  if (direction === "employee_to_employee") return 0;
  return direction === "from_employee" ? -amount : amount;
}

function getServiceTitleFromRequest(row: {
  requestType?: unknown;
  metadata?: unknown;
  requestItemTitles?: unknown;
}) {
  const metadata = isRecord(row.metadata) ? row.metadata : null;
  const requestType = typeof row.requestType === "string" ? row.requestType : null;
  const materialDelivery = metadata && isRecord(metadata.materialDelivery) ? metadata.materialDelivery : null;
  const tow = metadata && isRecord(metadata.tow) ? metadata.tow : null;
  const metadataServiceName = metadata && typeof metadata.serviceName === "string" ? metadata.serviceName.trim() : "";
  const metadataServiceType = metadata && typeof metadata.serviceType === "string" ? metadata.serviceType.trim() : "";
  const requestItemTitles = Array.isArray(row.requestItemTitles)
    ? row.requestItemTitles.filter((item): item is string => typeof item === "string" && item.trim() !== "")
    : [];

  if (materialDelivery && materialDelivery.servicePricingType === "material_delivery_calculator") {
    return "Перевезення сипучих матеріалів";
  }
  if (requestType === "tow" || tow) return "Послуги евакуатора";
  if (metadataServiceName) return metadataServiceName;
  if (metadataServiceType) return metadataServiceType;
  if (requestItemTitles[0]) return requestItemTitles[0];
  if (requestType === "equipment_rental") return "Оренда техніки";
  if (requestType === "service") return "Послуга";
  if (requestType === "callback") return "Зворотний дзвінок";
  return "Без категорії";
}

function buildEquipmentIncomeMap(
  finance: NonNullable<OrderFinance>,
  equipmentRows: Array<{ equipmentId: string; equipmentName: string }>,
) {
  const result = new Map<string, number>();
  const uniqueEquipment = equipmentRows.filter(
    (row, index, self) => self.findIndex((entry) => entry.equipmentId === row.equipmentId) === index,
  );
  if (uniqueEquipment.length === 0) return result;

  const explicitItems = finance.priceItems.filter((item) => item.equipmentId);
  const explicitTotal = sumBy(explicitItems, (item) => item.total);
  for (const item of explicitItems) {
    const equipmentId = String(item.equipmentId);
    result.set(equipmentId, roundMoney((result.get(equipmentId) ?? 0) + toNumber(item.total)));
  }

  const remainder = roundMoney(finance.summary.orderTotal - explicitTotal);
  if (Math.abs(remainder) > MONEY_EPSILON) {
    const share = roundMoney(remainder / uniqueEquipment.length);
    uniqueEquipment.forEach((equipment, index) => {
      const current = result.get(equipment.equipmentId) ?? 0;
      const allocated = index === uniqueEquipment.length - 1
        ? roundMoney(remainder - share * (uniqueEquipment.length - 1))
        : share;
      result.set(equipment.equipmentId, roundMoney(current + allocated));
    });
  }

  return result;
}

function getSystemFuelExpenseTotals(finance: NonNullable<OrderFinance>) {
  const fuelExpenses = finance.expenses.filter(
    (expense) => expense.type === "fuel" && expense.source === "system",
  );

  return {
    amount: sumBy(fuelExpenses, (expense) => expense.amount),
    liters: roundVolume(sumBy(fuelExpenses, (expense) => expense.fuelLiters ?? 0)),
  };
}

function getSettlementSenderId(settlement: Record<string, unknown> & {
  employeeId?: string | null;
  fromEmployeeId?: string | null;
}) {
  if (typeof settlement.fromEmployeeId === "string" && settlement.fromEmployeeId.trim()) {
    return settlement.fromEmployeeId;
  }
  if (settlement.direction === "from_employee" && typeof settlement.employeeId === "string" && settlement.employeeId.trim()) {
    return settlement.employeeId;
  }
  return null;
}

function getSettlementReceiverId(settlement: Record<string, unknown> & {
  employeeId?: string | null;
  toEmployeeId?: string | null;
}) {
  if (typeof settlement.toEmployeeId === "string" && settlement.toEmployeeId.trim()) {
    return settlement.toEmployeeId;
  }
  if (settlement.direction === "to_employee" && typeof settlement.employeeId === "string" && settlement.employeeId.trim()) {
    return settlement.employeeId;
  }
  return null;
}

function buildEquipmentFuelUsageMap(
  finance: NonNullable<OrderFinance>,
  equipmentRows: Array<{ equipmentId: string; equipmentName: string }>,
) {
  const result = new Map<string, { amount: number; liters: number }>();
  const uniqueEquipment = equipmentRows.filter(
    (row, index, self) => self.findIndex((entry) => entry.equipmentId === row.equipmentId) === index,
  );
  if (uniqueEquipment.length === 0) return result;

  const fuelExpenses = finance.expenses.filter(
    (expense) => expense.type === "fuel" && expense.source === "system",
  );

  const explicitExpenses = fuelExpenses.filter((expense) => expense.equipmentId);
  for (const expense of explicitExpenses) {
    const equipmentId = String(expense.equipmentId);
    const current = result.get(equipmentId) ?? { amount: 0, liters: 0 };
    result.set(equipmentId, {
      amount: roundMoney(current.amount + expense.amount),
      liters: roundVolume(current.liters + toNumber(expense.fuelLiters)),
    });
  }

  const explicitAmount = sumBy(explicitExpenses, (expense) => expense.amount);
  const explicitLiters = roundVolume(sumBy(explicitExpenses, (expense) => expense.fuelLiters ?? 0));
  const totalFuel = getSystemFuelExpenseTotals(finance);
  const remainingAmount = roundMoney(totalFuel.amount - explicitAmount);
  const remainingLiters = roundVolume(totalFuel.liters - explicitLiters);

  const unassignedEquipment = uniqueEquipment.filter((equipment) => !result.has(equipment.equipmentId));
  if (unassignedEquipment.length === 0) return result;

  const amountShare = roundMoney(remainingAmount / unassignedEquipment.length);
  const litersShare = roundVolume(remainingLiters / unassignedEquipment.length);

  unassignedEquipment.forEach((equipment, index) => {
    result.set(equipment.equipmentId, {
      amount: index === unassignedEquipment.length - 1
        ? roundMoney(remainingAmount - amountShare * (unassignedEquipment.length - 1))
        : amountShare,
      liters: index === unassignedEquipment.length - 1
        ? roundVolume(remainingLiters - litersShare * (unassignedEquipment.length - 1))
        : litersShare,
    });
  });

  return result;
}

export async function listPriceItemTemplates(db: DbClient = pool) {
  const { rows } = await db.query(
    `SELECT *
     FROM "PriceItemTemplate"
     WHERE "isActive" = true
     ORDER BY "sortOrder" ASC, "title" ASC`,
  );

  return rows.map((row) => ({
    ...row,
    defaultUnitPrice: nullableNumber(row.defaultUnitPrice),
  }));
}

export async function calculateOrderFinance(rentOrderId: string, db: DbClient = pool) {
  const [
    orderRes,
    priceItemsRes,
    paymentsRes,
    expensesRes,
    workerCompensationRes,
    settlementsRes,
  ] = await Promise.all([
    db.query(
      `SELECT
         ro."id",
         ro."status",
         ro."customerName",
         ro."customerPhone",
         ro."agreedPrice",
         ro."agreedTotal",
         ro."financeComment",
         ro."paymentStatus",
         ro."workerSettlementStatus",
         ro."finalAgreedPrice",
         ro."finalCashCollected",
         ro."finalExtraExpenses",
         ro."managerClosedAt",
         ro."updatedAt",
         cr."metadata" AS "sourceRequestMetadata"
       FROM "RentOrder" ro
       LEFT JOIN "CustomerRequest" cr ON cr."id" = ro."sourceCustomerRequestId"
       WHERE ro."id" = $1
       LIMIT 1`,
      [rentOrderId],
    ),
    db.query(
      `SELECT *
       FROM "OrderPriceItem"
       WHERE "rentOrderId" = $1
       ORDER BY "sortOrder" ASC, "createdAt" ASC`,
      [rentOrderId],
    ),
    db.query(
      `SELECT
         op.*,
         e."fullName" AS "employeeName"
       FROM "OrderPayment" op
       LEFT JOIN "Employee" e ON e."id" = op."employeeId"
       WHERE op."rentOrderId" = $1
       ORDER BY op."paidAt" DESC, op."createdAt" DESC`,
      [rentOrderId],
    ),
    db.query(
      `SELECT
         oe.*,
         e."name" AS "equipmentName",
         emp."fullName" AS "employeeName"
       FROM "OrderExpense" oe
       LEFT JOIN "Equipment" e ON e."id" = oe."equipmentId"
       LEFT JOIN "Employee" emp ON emp."id" = oe."employeeId"
       WHERE oe."rentOrderId" = $1
       ORDER BY oe."expenseAt" DESC, oe."createdAt" DESC`,
      [rentOrderId],
    ),
    db.query(
      `SELECT
         wc.*,
         e."fullName" AS "employeeName",
         eq."name" AS "equipmentName",
         actual_time."actualQuantity"
       FROM "WorkerCompensation" wc
       LEFT JOIN "Employee" e ON e."id" = wc."employeeId"
       LEFT JOIN "Equipment" eq ON eq."id" = wc."equipmentId"
       LEFT JOIN LATERAL (
         SELECT
           ROUND(
             (SUM(EXTRACT(EPOCH FROM (wes."finishedAt" - wes."startedAt"))) / 3600.0)::numeric,
             2
           ) AS "actualQuantity"
         FROM "WorkExecutionSession" wes
         LEFT JOIN "WorkAssignment" wa ON wa."id" = wes."assignmentId"
         WHERE wes."orderId" = wc."rentOrderId"
           AND wes."status" = 'FINISHED'
           AND wes."startedAt" IS NOT NULL
           AND wes."finishedAt" IS NOT NULL
           AND (
             (wc."assignmentId" IS NOT NULL AND wes."assignmentId" = wc."assignmentId")
             OR (
               wc."assignmentId" IS NULL
               AND wa."employeeId" = wc."employeeId"
               AND COALESCE(wes."equipmentId",'') = COALESCE(wc."equipmentId",'')
             )
           )
       ) actual_time ON TRUE
       WHERE wc."rentOrderId" = $1
       ORDER BY wc."updatedAt" DESC, wc."createdAt" DESC`,
      [rentOrderId],
    ),
    db.query(
      `SELECT
         es.*,
         e."fullName" AS "employeeName",
         ef."fullName" AS "fromEmployeeName",
         et."fullName" AS "toEmployeeName"
       FROM "EmployeeSettlement" es
       LEFT JOIN "Employee" e ON e."id" = es."employeeId"
       LEFT JOIN "Employee" ef ON ef."id" = es."fromEmployeeId"
       LEFT JOIN "Employee" et ON et."id" = es."toEmployeeId"
       WHERE es."rentOrderId" = $1
       ORDER BY es."settledAt" DESC, es."createdAt" DESC`,
      [rentOrderId],
    ),
  ]);

  const order = orderRes.rows[0];
  if (!order) return null;

  const priceItems = priceItemsRes.rows.map(mapPriceItem);
  const payments = paymentsRes.rows.map(mapPayment);
  const baseExpenses = expensesRes.rows.map(mapExpense);
  const materialPassThroughCost = getMaterialPassThroughCost(order.sourceRequestMetadata);
  const materialPassThroughExpense = materialPassThroughCost > 0
    ? {
        id: `system-material-cost:${order.id}`,
        rentOrderId,
        equipmentId: null,
        equipmentName: null,
        employeeId: null,
        employeeName: null,
        type: "materials",
        amount: materialPassThroughCost,
        fuelLiters: null,
        fuelPricePerLiter: null,
        comment: "Собівартість матеріалу з калькулятора доставки",
        source: "system",
        expenseAt: String(order.updatedAt),
        createdAt: String(order.updatedAt),
        updatedAt: String(order.updatedAt),
      }
    : null;
  const expenses = materialPassThroughExpense ? [...baseExpenses, materialPassThroughExpense] : baseExpenses;
  const orderVisibleExpenses = expenses.filter((expense) => expense.type !== "fuel_purchase");
  let workerCompensations = workerCompensationRes.rows.map(mapWorkerCompensation);
  const settlements = settlementsRes.rows.map(mapSettlement);

  const calculatedTotal = sumBy(priceItems, (item) => item.total);
  const agreedPrice = nullableNumber(order.agreedPrice);
  const agreedTotal = nullableNumber(order.agreedTotal);
  const finalAgreedPrice = nullableNumber(order.finalAgreedPrice);
  const orderTotal = roundMoney(finalAgreedPrice ?? agreedTotal ?? agreedPrice ?? calculatedTotal);
  workerCompensations = workerCompensations.map((compensation) => {
    if (compensation.type !== "hourly" || compensation.actualQuantity == null) {
      return compensation;
    }
    const effectiveAmount = calculateWorkerCompensationAmount({
      type: String(compensation.type),
      rate: compensation.rate,
      quantity: compensation.quantity,
      actualQuantity: compensation.actualQuantity,
      percent: compensation.percent,
      finalAmount: compensation.finalAmount,
      orderTotal,
    });
    return {
      ...compensation,
      calculatedAmount: effectiveAmount,
      finalAmount: effectiveAmount,
    };
  });
  const latestWorkerCompensation = workerCompensations[0] ?? null;
  const clientPaid = sumBy(payments, (payment) => payment.amount);
  const clientDebt = roundMoney(orderTotal - clientPaid);
  const paymentStatus = calculatePaymentStatus(orderTotal, clientPaid);
  const orderExpenses = sumBy(orderVisibleExpenses, (expense) => expense.amount);
  const employeeCollectedCash = sumBy(
    payments.filter((payment) => payment.receivedByType === "employee"),
    (payment) => payment.amount,
  );
  const employeeReportedExpenses = sumBy(
    expenses.filter((expense) => expense.source === "employee"),
    (expense) => expense.amount,
  );
  const settlementNet = roundMoney(
    settlements.reduce(
      (sum, settlement) => sum + settlementDirectionToSignedAmount(settlement.direction, settlement.amount),
      0,
    ),
  );
  const paidByCompany = sumBy(
    settlements.filter((settlement) => settlement.direction === "to_employee"),
    (settlement) => settlement.amount,
  );
  const returnedToCompany = sumBy(
    settlements.filter((settlement) => settlement.direction === "from_employee"),
    (settlement) => settlement.amount,
  );
  const workerSalary = roundMoney(
    workerCompensations.reduce(
      (sum, compensation) =>
        sum +
        calculateWorkerCompensationAmount({
          type: String(compensation.type ?? "manual"),
          rate: compensation.rate,
          quantity: compensation.quantity,
          actualQuantity: compensation.type === "hourly" ? compensation.actualQuantity : null,
          percent: compensation.percent,
          finalAmount: compensation.finalAmount,
          orderTotal,
        }),
      0,
    ),
  );
  const workerObligations = calculateWorkerObligations({
    workerSalary,
    employeeCollectedCash,
    employeeReportedExpenses,
    paidByCompany,
    returnedToCompany,
  });
  const workerBalance = workerObligations.balance;
  const workerSettlementStatus = calculateWorkerSettlementStatusFromDebts({
    companyOwesEmployee: workerObligations.companyOwesEmployee,
    employeeOwesCompany: workerObligations.employeeOwesCompany,
    hasSettlements: hasMoneyValue(paidByCompany) || hasMoneyValue(returnedToCompany),
  });
  const orderProfit = roundMoney(orderTotal - orderExpenses - workerSalary);

  return {
    order: {
      id: String(order.id),
      status: String(order.status),
      customerName: String(order.customerName),
      customerPhone: String(order.customerPhone),
      agreedPrice,
      agreedTotal,
      financeComment: typeof order.financeComment === "string" ? order.financeComment : null,
      paymentStatus: String(order.paymentStatus),
      workerSettlementStatus: String(order.workerSettlementStatus),
      finalAgreedPrice,
      finalCashCollected: nullableNumber(order.finalCashCollected),
      finalExtraExpenses: nullableNumber(order.finalExtraExpenses),
      managerClosedAt: typeof order.managerClosedAt === "string" ? order.managerClosedAt : order.managerClosedAt ?? null,
      updatedAt: String(order.updatedAt),
    },
    priceItems,
    payments,
    expenses,
    workerCompensations,
    latestWorkerCompensation,
    settlements,
    summary: {
      calculatedTotal,
      agreedPrice,
      agreedTotal,
      finalAgreedPrice,
      orderTotal,
      clientPaid,
      clientDebt,
      paymentStatus,
      orderExpenses,
      employeeCollectedCash,
      employeeReportedExpenses,
      workerSalary,
      workerBalance,
      companyOwesEmployee: workerObligations.companyOwesEmployee,
      employeeOwesCompany: workerObligations.employeeOwesCompany,
      paidByCompany,
      returnedToCompany,
      settlementNet,
      workerSettlementStatus,
      orderProfit,
    },
  };
}

export async function recalculateOrderFinanceState(rentOrderId: string, db: DbClient = pool) {
  const finance = await calculateOrderFinance(rentOrderId, db);
  if (!finance) return null;

  await db.query(
    `UPDATE "RentOrder"
     SET "paymentStatus" = $1,
         "workerSettlementStatus" = $2,
         "updatedAt" = NOW()
     WHERE "id" = $3`,
    [
      finance.summary.paymentStatus,
      finance.summary.workerSettlementStatus,
      rentOrderId,
    ],
  );

  return finance;
}

async function getClosedOrderContexts(range: FinanceDateRange, db: DbClient = pool) {
  const { rows: orderRows } = await db.query(
    `SELECT
       ro."id",
       ro."customerName",
       ro."customerPhone",
       ro."managerClosedAt",
       cr."requestType",
       cr."metadata",
       ARRAY(
         SELECT cri."titleSnapshot"
         FROM "CustomerRequestItem" cri
         WHERE cri."requestId" = cr."id"
         ORDER BY cri."createdAt" ASC
       ) AS "requestItemTitles"
     FROM "RentOrder" ro
     LEFT JOIN "CustomerRequest" cr ON cr."id" = ro."sourceCustomerRequestId"
     WHERE ro."status" = 'COMPLETED'
       AND ro."managerClosedAt" IS NOT NULL
       AND (ro."managerClosedAt" AT TIME ZONE 'Europe/Kiev')::date BETWEEN $1::date AND $2::date
     ORDER BY ro."managerClosedAt" DESC`,
    [range.from, range.to],
  );

  const orderIds = orderRows.map((row) => String(row.id));
  if (orderIds.length === 0) return [];

  const { rows: equipmentRows } = await db.query(
    `SELECT
       source."rentOrderId",
       source."equipmentId",
       source."equipmentName"
     FROM (
       SELECT DISTINCT
         roi."rentOrderId",
         e."id" AS "equipmentId",
         e."name" AS "equipmentName"
       FROM "RentOrderItem" roi
       INNER JOIN "Equipment" e ON e."id" = roi."equipmentId"
       WHERE roi."rentOrderId" = ANY($1)

       UNION

       SELECT DISTINCT
         opi."rentOrderId",
         e."id" AS "equipmentId",
         e."name" AS "equipmentName"
       FROM "OrderPriceItem" opi
       INNER JOIN "Equipment" e ON e."id" = opi."equipmentId"
       WHERE opi."rentOrderId" = ANY($1)
         AND opi."equipmentId" IS NOT NULL
     ) AS source
     ORDER BY source."equipmentName" ASC`,
    [orderIds],
  );

  const equipmentByOrder = new Map<string, Array<{ equipmentId: string; equipmentName: string }>>();
  for (const row of equipmentRows) {
    const orderId = String(row.rentOrderId);
    const list = equipmentByOrder.get(orderId) ?? [];
    list.push({
      equipmentId: String(row.equipmentId),
      equipmentName: String(row.equipmentName),
    });
    equipmentByOrder.set(orderId, list);
  }

  const financeEntries = await Promise.all(
    orderRows.map(async (row) => {
      const finance = await calculateOrderFinance(String(row.id), db);
      if (!finance) return null;
      return {
        orderId: String(row.id),
        customerName: String(row.customerName),
        customerPhone: String(row.customerPhone),
        managerClosedAt: String(row.managerClosedAt),
        serviceTitle: getServiceTitleFromRequest(row),
        equipment: equipmentByOrder.get(String(row.id)) ?? [],
        finance,
      };
    }),
  );

  return financeEntries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
}

export async function getFinanceOrders(range: FinanceDateRange, db: DbClient = pool) {
  const contexts = await getClosedOrderContexts(range, db);

  return contexts.map((context) => ({
    orderId: context.orderId,
    customerName: context.customerName,
    customerPhone: context.customerPhone,
    serviceTitle: context.serviceTitle,
    equipmentNames: context.equipment.map((item) => item.equipmentName),
    closedAt: context.managerClosedAt,
    orderTotal: context.finance.summary.orderTotal,
    clientPaid: context.finance.summary.clientPaid,
    clientDebt: context.finance.summary.clientDebt,
    orderExpenses: context.finance.summary.orderExpenses,
    workerSalary: context.finance.summary.workerSalary,
    workerBalance: context.finance.summary.workerBalance,
    profit: context.finance.summary.orderProfit,
    paymentStatus: context.finance.summary.paymentStatus,
    workerSettlementStatus: context.finance.summary.workerSettlementStatus,
  }));
}

export async function listEquipmentExpenses(
  input: FinanceDateRange & { equipmentId?: string | null; type?: string | null },
  db: DbClient = pool,
) {
  const conditions = [`ee."expenseDate" BETWEEN $1::date AND $2::date`];
  const params: unknown[] = [input.from, input.to];

  if (input.equipmentId && input.equipmentId !== "all") {
    params.push(input.equipmentId);
    conditions.push(`ee."equipmentId" = $${params.length}`);
  }
  if (input.type && input.type !== "all") {
    params.push(input.type);
    conditions.push(`ee."type" = $${params.length}`);
  }

  const { rows } = await db.query(
    `SELECT
       ee.*,
       e."name" AS "equipmentName"
     FROM "EquipmentExpense" ee
     LEFT JOIN "Equipment" e ON e."id" = ee."equipmentId"
     WHERE ${conditions.join(" AND ")}
     ORDER BY ee."expenseDate" DESC, ee."createdAt" DESC`,
    params,
  );

  return rows.map((row) => ({
    ...row,
    amount: toNumber(row.amount),
    fuelLiters: nullableNumber(row.fuelLiters),
    fuelPricePerLiter: nullableNumber(row.fuelPricePerLiter),
  }));
}

export async function getFinanceSummary(range: FinanceDateRange, db: DbClient = pool) {
  const [contexts, equipmentExpenses, fuelBalance] = await Promise.all([
    getClosedOrderContexts(range, db),
    listEquipmentExpenses({ ...range, equipmentId: "all", type: "all" }, db),
    getFuelBalance(db),
  ]);

  const income = sumBy(contexts, (context) => context.finance.summary.orderTotal);
  const orderExpenses = sumBy(contexts, (context) => context.finance.summary.orderExpenses);
  const workerCompensation = sumBy(contexts, (context) => context.finance.summary.workerSalary);
  const fuelPurchaseExpenses = sumBy(
    equipmentExpenses.filter((expense) => expense.type === "fuel"),
    (expense) => expense.amount,
  );
  const totalEquipmentExpenses = sumBy(
    equipmentExpenses.filter((expense) => expense.type !== "fuel"),
    (expense) => expense.amount,
  );
  const maintenanceExpenses = sumBy(
    equipmentExpenses.filter((expense) => ["maintenance", "repair", "parts", "insurance", "wash"].includes(String(expense.type))),
    (expense) => expense.amount,
  );
  const clientDebt = roundMoney(
    contexts.reduce((sum, context) => sum + Math.max(context.finance.summary.clientDebt, 0), 0),
  );
  const workerBalance = sumBy(contexts, (context) => context.finance.summary.workerBalance);
  const expenses = roundMoney(orderExpenses + workerCompensation + totalEquipmentExpenses);
  const profit = roundMoney(income - expenses);

  return {
    income,
    expenses,
    profit,
    fuelExpenses: fuelPurchaseExpenses,
    maintenanceExpenses,
    workerCompensation,
    clientDebt,
    workerBalance,
    fuelPurchasedLiters: fuelBalance.purchasedLiters,
    fuelConsumedLiters: fuelBalance.consumedLiters,
    fuelBalanceLiters: fuelBalance.balanceLiters,
    fuelLowBalanceThresholdLiters: fuelBalance.lowBalanceThresholdLiters,
    isFuelBalanceLow: fuelBalance.isLow,
  };
}

export async function getFuelBalance(db: DbClient = pool) {
  const threshold = getFuelLowBalanceThresholdLiters();
  const [purchasedRes, consumedRes] = await Promise.all([
    db.query(
      `SELECT COALESCE(SUM("fuelLiters"), 0)::float AS "liters"
       FROM "EquipmentExpense"
       WHERE "type" = 'fuel'
         AND "fuelLiters" IS NOT NULL`,
    ),
    db.query(
      `SELECT COALESCE(SUM("fuelLiters"), 0)::float AS "liters"
       FROM "OrderExpense"
       WHERE "type" = 'fuel'
         AND "source" = 'system'
         AND "fuelLiters" IS NOT NULL`,
    ),
  ]);

  const purchasedLiters = roundVolume(toNumber(purchasedRes.rows[0]?.liters));
  const consumedLiters = roundVolume(toNumber(consumedRes.rows[0]?.liters));
  const balanceLiters = roundVolume(purchasedLiters - consumedLiters);

  return {
    purchasedLiters,
    consumedLiters,
    balanceLiters,
    lowBalanceThresholdLiters: threshold,
    isLow: balanceLiters <= threshold,
  };
}

export async function getFinanceByEquipment(range: FinanceDateRange, db: DbClient = pool) {
  const [contexts, equipmentExpenses, equipmentRows] = await Promise.all([
    getClosedOrderContexts(range, db),
    listEquipmentExpenses({ ...range, equipmentId: "all", type: "all" }, db),
    db.query(`SELECT "id", "name" FROM "Equipment" ORDER BY "name" ASC`),
  ]);

  const rows = new Map<string, {
    equipmentId: string;
    equipmentName: string;
    orderIds: Set<string>;
    income: number;
    fuelLiters: number;
    fuelExpenses: number;
    maintenanceExpenses: number;
    orderExpenses: number;
    workerCompensation: number;
  }>();

  for (const equipment of equipmentRows.rows) {
    rows.set(String(equipment.id), {
      equipmentId: String(equipment.id),
      equipmentName: String(equipment.name),
      orderIds: new Set<string>(),
      income: 0,
      fuelLiters: 0,
      fuelExpenses: 0,
      maintenanceExpenses: 0,
      orderExpenses: 0,
      workerCompensation: 0,
    });
  }

  for (const expense of equipmentExpenses) {
    const target = rows.get(String(expense.equipmentId));
    if (!target) continue;
    if (expense.type !== "fuel") {
      target.maintenanceExpenses = roundMoney(target.maintenanceExpenses + expense.amount);
    }
  }

  for (const context of contexts) {
    if (context.equipment.length === 0) continue;
    const equipmentCount = context.equipment.length;
    const incomeMap = buildEquipmentIncomeMap(context.finance, context.equipment);
    const fuelUsageMap = buildEquipmentFuelUsageMap(context.finance, context.equipment);
    const systemFuelTotals = getSystemFuelExpenseTotals(context.finance);
    const otherOrderExpensesTotal = roundMoney(context.finance.summary.orderExpenses - systemFuelTotals.amount);
    const splitOrderExpenses = roundMoney(otherOrderExpensesTotal / equipmentCount);
    const splitWorkerCompensation = roundMoney(context.finance.summary.workerSalary / equipmentCount);

    context.equipment.forEach((equipment, index) => {
      const row = rows.get(equipment.equipmentId);
      if (!row) return;
      row.orderIds.add(context.orderId);
      row.income = roundMoney(row.income + (incomeMap.get(equipment.equipmentId) ?? 0));
      const fuelUsage = fuelUsageMap.get(equipment.equipmentId);
      row.fuelExpenses = roundMoney(row.fuelExpenses + (fuelUsage?.amount ?? 0));
      row.fuelLiters = roundVolume(row.fuelLiters + (fuelUsage?.liters ?? 0));
      row.orderExpenses = roundMoney(
        row.orderExpenses +
          (index === equipmentCount - 1
            ? otherOrderExpensesTotal - splitOrderExpenses * (equipmentCount - 1)
            : splitOrderExpenses),
      );
      row.workerCompensation = roundMoney(
        row.workerCompensation +
          (index === equipmentCount - 1
            ? context.finance.summary.workerSalary - splitWorkerCompensation * (equipmentCount - 1)
            : splitWorkerCompensation),
      );
    });
  }

  return Array.from(rows.values())
    .map((row) => {
      const totalExpenses = roundMoney(
        row.fuelExpenses + row.maintenanceExpenses + row.orderExpenses + row.workerCompensation,
      );
      return {
        equipmentId: row.equipmentId,
        equipmentName: row.equipmentName,
        ordersCount: row.orderIds.size,
        income: roundMoney(row.income),
        fuelLiters: roundVolume(row.fuelLiters),
        fuelExpenses: roundMoney(row.fuelExpenses),
        maintenanceExpenses: roundMoney(row.maintenanceExpenses),
        orderExpenses: roundMoney(row.orderExpenses),
        workerCompensation: roundMoney(row.workerCompensation),
        totalExpenses,
        profit: roundMoney(row.income - totalExpenses),
      };
    })
    .filter((row) => row.ordersCount > 0 || row.totalExpenses > 0)
    .sort((a, b) => b.profit - a.profit);
}

export async function getFinanceByService(range: FinanceDateRange, db: DbClient = pool) {
  const contexts = await getClosedOrderContexts(range, db);
  const rows = new Map<string, {
    serviceTitle: string;
    ordersCount: number;
    income: number;
    fuelLiters: number;
    fuelExpenses: number;
    expenses: number;
  }>();

  for (const context of contexts) {
    const key = context.serviceTitle;
    const systemFuelTotals = getSystemFuelExpenseTotals(context.finance);
    const target = rows.get(key) ?? {
      serviceTitle: key,
      ordersCount: 0,
      income: 0,
      fuelLiters: 0,
      fuelExpenses: 0,
      expenses: 0,
    };
    target.ordersCount += 1;
    target.income = roundMoney(target.income + context.finance.summary.orderTotal);
    target.fuelLiters = roundVolume(target.fuelLiters + systemFuelTotals.liters);
    target.fuelExpenses = roundMoney(target.fuelExpenses + systemFuelTotals.amount);
    target.expenses = roundMoney(
      target.expenses +
        (context.finance.summary.orderExpenses - systemFuelTotals.amount) +
        context.finance.summary.workerSalary,
    );
    rows.set(key, target);
  }

  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      profit: roundMoney(row.income - row.expenses),
    }))
    .sort((a, b) => b.income - a.income);
}

export async function getClientDebts(range: FinanceDateRange, db: DbClient = pool) {
  const contexts = await getClosedOrderContexts(range, db);
  return contexts
    .filter((context) => context.finance.summary.clientDebt > MONEY_EPSILON)
    .map((context) => ({
      orderId: context.orderId,
      customerName: context.customerName,
      customerPhone: context.customerPhone,
      serviceTitle: context.serviceTitle,
      orderTotal: context.finance.summary.orderTotal,
      clientPaid: context.finance.summary.clientPaid,
      clientDebt: context.finance.summary.clientDebt,
      paymentStatus: context.finance.summary.paymentStatus,
      closedAt: context.managerClosedAt,
    }))
    .sort((a, b) => b.clientDebt - a.clientDebt);
}

export async function getEmployeeBalances(range: FinanceDateRange, db: DbClient = pool) {
  const contexts = await getClosedOrderContexts(range, db);
  const rows = new Map<string, {
    employeeId: string;
    employeeName: string;
    orderIds: Set<string>;
    earned: number;
    receivedFromClients: number;
    reportedExpenses: number;
    paidByCompany: number;
    returnedToCompany: number;
    companyOwesEmployee: number;
    employeeOwesCompany: number;
    balance: number;
  }>();

  for (const context of contexts) {
    const employeeIds = new Set<string>();

    context.finance.workerCompensations.forEach((compensation) => {
      if (compensation.employeeId) employeeIds.add(String(compensation.employeeId));
    });
    context.finance.payments.forEach((payment) => {
      if (payment.receivedByType === "employee" && payment.employeeId) {
        employeeIds.add(String(payment.employeeId));
      }
    });
    context.finance.expenses.forEach((expense) => {
      if (expense.source === "employee" && expense.employeeId) {
        employeeIds.add(String(expense.employeeId));
      }
    });
    context.finance.settlements.forEach((settlement) => {
      const senderId = getSettlementSenderId(settlement);
      const receiverId = getSettlementReceiverId(settlement);
      if (senderId) employeeIds.add(String(senderId));
      if (receiverId) employeeIds.add(String(receiverId));
    });

    for (const employeeId of employeeIds) {
      const compensationRows = context.finance.workerCompensations.filter(
        (compensation) => String(compensation.employeeId ?? "") === employeeId,
      );
      const paymentRows = context.finance.payments.filter(
        (payment) => payment.receivedByType === "employee" && String(payment.employeeId ?? "") === employeeId,
      );
      const expenseRows = context.finance.expenses.filter(
        (expense) => expense.source === "employee" && String(expense.employeeId ?? "") === employeeId,
      );

      let paidByCompany = 0;
      let returnedToCompany = 0;
      for (const settlement of context.finance.settlements) {
        const senderId = getSettlementSenderId(settlement);
        const receiverId = getSettlementReceiverId(settlement);
        if (receiverId === employeeId) {
          paidByCompany = roundMoney(paidByCompany + settlement.amount);
        }
        if (senderId === employeeId) {
          returnedToCompany = roundMoney(returnedToCompany + settlement.amount);
        }
      }

      const earned = roundMoney(
        compensationRows.reduce(
          (sum, compensation) =>
            sum +
            calculateWorkerCompensationAmount({
              type: String(compensation.type ?? "manual"),
              rate: compensation.rate,
              quantity: compensation.quantity,
              actualQuantity: compensation.type === "hourly" ? compensation.actualQuantity : null,
              percent: compensation.percent,
              finalAmount: compensation.finalAmount,
              orderTotal: context.finance.summary.orderTotal,
            }),
          0,
        ),
      );
      const receivedFromClients = sumBy(paymentRows, (payment) => payment.amount);
      const reportedExpenses = sumBy(expenseRows, (expense) => expense.amount);
      const obligations = calculateWorkerObligations({
        workerSalary: earned,
        employeeCollectedCash: receivedFromClients,
        employeeReportedExpenses: reportedExpenses,
        paidByCompany,
        returnedToCompany,
      });
      const balance = obligations.balance;

      const employeeName =
        compensationRows[0]?.employeeName ??
        paymentRows[0]?.employeeName ??
        expenseRows[0]?.employeeName ??
        context.finance.settlements.find(
          (settlement) =>
            String(getSettlementSenderId(settlement) ?? "") === employeeId ||
            String(getSettlementReceiverId(settlement) ?? "") === employeeId,
        )?.fromEmployeeName ??
        context.finance.settlements.find(
          (settlement) =>
            String(getSettlementSenderId(settlement) ?? "") === employeeId ||
            String(getSettlementReceiverId(settlement) ?? "") === employeeId,
        )?.toEmployeeName ??
        context.finance.settlements.find((settlement) => String(settlement.employeeId ?? "") === employeeId)?.employeeName ??
        "Не вказано";

      const target = rows.get(employeeId) ?? {
        employeeId,
        employeeName: String(employeeName),
        orderIds: new Set<string>(),
        earned: 0,
        receivedFromClients: 0,
        reportedExpenses: 0,
        paidByCompany: 0,
        returnedToCompany: 0,
        companyOwesEmployee: 0,
        employeeOwesCompany: 0,
        balance: 0,
      };

      target.orderIds.add(context.orderId);
      target.earned = roundMoney(target.earned + earned);
      target.receivedFromClients = roundMoney(target.receivedFromClients + receivedFromClients);
      target.reportedExpenses = roundMoney(target.reportedExpenses + reportedExpenses);
      target.paidByCompany = roundMoney(target.paidByCompany + paidByCompany);
      target.returnedToCompany = roundMoney(target.returnedToCompany + returnedToCompany);
      target.balance = roundMoney(target.balance + balance);
      if (!target.employeeName || target.employeeName === "Не вказано") {
        target.employeeName = String(employeeName);
      }

      rows.set(employeeId, target);
    }
  }

  const globalSettlementsRes = await db.query(
    `SELECT
       es.*,
       e."fullName" AS "employeeName",
       ef."fullName" AS "fromEmployeeName",
       et."fullName" AS "toEmployeeName"
     FROM "EmployeeSettlement" es
     LEFT JOIN "Employee" e ON e."id" = es."employeeId"
     LEFT JOIN "Employee" ef ON ef."id" = es."fromEmployeeId"
     LEFT JOIN "Employee" et ON et."id" = es."toEmployeeId"
     WHERE es."rentOrderId" IS NULL
       AND es."settledAt"::date BETWEEN $1::date AND $2::date`,
    [range.from, range.to],
  );

  for (const settlement of globalSettlementsRes.rows) {
    const senderId = getSettlementSenderId(settlement);
    const receiverId = getSettlementReceiverId(settlement);
    const amount = toNumber(settlement.amount);

    if (receiverId) {
      const target = rows.get(receiverId) ?? {
        employeeId: receiverId,
        employeeName: String(settlement.toEmployeeName ?? settlement.employeeName ?? "Не вказано"),
        orderIds: new Set<string>(),
        earned: 0,
        receivedFromClients: 0,
        reportedExpenses: 0,
        paidByCompany: 0,
        returnedToCompany: 0,
        companyOwesEmployee: 0,
        employeeOwesCompany: 0,
        balance: 0,
      };
      target.paidByCompany = roundMoney(target.paidByCompany + amount);
      if (!target.employeeName || target.employeeName === "Не вказано") {
        target.employeeName = String(settlement.toEmployeeName ?? settlement.employeeName ?? "Не вказано");
      }
      rows.set(receiverId, target);
    }

    if (senderId) {
      const target = rows.get(senderId) ?? {
        employeeId: senderId,
        employeeName: String(settlement.fromEmployeeName ?? settlement.employeeName ?? "Не вказано"),
        orderIds: new Set<string>(),
        earned: 0,
        receivedFromClients: 0,
        reportedExpenses: 0,
        paidByCompany: 0,
        returnedToCompany: 0,
        companyOwesEmployee: 0,
        employeeOwesCompany: 0,
        balance: 0,
      };
      target.returnedToCompany = roundMoney(target.returnedToCompany + amount);
      if (!target.employeeName || target.employeeName === "Не вказано") {
        target.employeeName = String(settlement.fromEmployeeName ?? settlement.employeeName ?? "Не вказано");
      }
      rows.set(senderId, target);
    }
  }

  return Array.from(rows.values())
    .map((row) => {
      const obligations = calculateWorkerObligations({
        workerSalary: row.earned,
        employeeCollectedCash: row.receivedFromClients,
        employeeReportedExpenses: row.reportedExpenses,
        paidByCompany: row.paidByCompany,
        returnedToCompany: row.returnedToCompany,
      });
      return {
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        ordersCount: row.orderIds.size,
        earned: row.earned,
        receivedFromClients: row.receivedFromClients,
        reportedExpenses: row.reportedExpenses,
        paidByCompany: row.paidByCompany,
        returnedToCompany: row.returnedToCompany,
        companyOwesEmployee: obligations.companyOwesEmployee,
        employeeOwesCompany: obligations.employeeOwesCompany,
        balance: obligations.balance,
        status: calculateWorkerSettlementStatusFromDebts({
          companyOwesEmployee: obligations.companyOwesEmployee,
          employeeOwesCompany: obligations.employeeOwesCompany,
          hasSettlements: hasMoneyValue(row.paidByCompany) || hasMoneyValue(row.returnedToCompany),
        }),
      };
    })
    .sort((a, b) => b.balance - a.balance);
}
