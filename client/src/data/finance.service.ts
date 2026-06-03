import { apiFetch } from "../api/client";
import type {
  ClientDebtRow,
  EmployeeBalanceRow,
  EmployeeSettlementFinance,
  EquipmentExpense,
  FinanceByEquipmentRow,
  FinanceByServiceRow,
  FinanceSummary,
  MonobankInvoiceFinance,
  PriceItemTemplate,
  RentOrderFinance,
} from "./types";

export type FinanceSummaryPayload = {
  agreedTotal?: number | null;
  financeComment?: string | null;
};

export type OrderPriceItemPayload = {
  templateId?: string | null;
  equipmentId?: string | null;
  serviceId?: string | null;
  title: string;
  calculationType: string;
  quantity?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  total?: number | null;
  source?: "manual" | "request_calculation" | "template";
  comment?: string | null;
  sortOrder?: number;
};

export type OrderPaymentPayload = {
  executionSessionId?: string | null;
  amount: number;
  method: string;
  receivedByType: string;
  employeeId?: string | null;
  paidAt?: string | null;
  comment?: string | null;
};

export type OrderExpensePayload = {
  executionSessionId?: string | null;
  equipmentId?: string | null;
  employeeId?: string | null;
  type: string;
  amount: number;
  source?: "manager" | "employee" | "system";
  expenseAt?: string | null;
  comment?: string | null;
};

export type WorkerCompensationPayload = {
  assignmentId?: string | null;
  equipmentId?: string | null;
  employeeId?: string | null;
  type: string;
  rate?: number | null;
  quantity?: number | null;
  percent?: number | null;
  finalAmount?: number | null;
  status?: string;
  comment?: string | null;
};

export type EmployeeSettlementPayload = {
  employeeId?: string | null;
  amount: number;
  direction: "to_employee" | "from_employee" | "employee_to_employee";
  fromEmployeeId?: string | null;
  toEmployeeId?: string | null;
  method: string;
  settledAt?: string | null;
  comment?: string | null;
};

export type FinanceRange = {
  from: string;
  to: string;
};

export type EquipmentExpensePayload = {
  equipmentId?: string | null;
  type: string;
  expenseDate: string;
  amount?: number | null;
  fuelLiters?: number | null;
  fuelPricePerLiter?: number | null;
  comment?: string | null;
};

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("admin_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getRentOrderFinance(orderId: string) {
  return apiFetch<RentOrderFinance>(`/admin/rent-orders/${orderId}/finance`);
}

export function getPriceItemTemplates() {
  return apiFetch<PriceItemTemplate[]>("/admin/rent-orders/finance/price-item-templates");
}

export function updateRentOrderFinanceSummary(orderId: string, payload: FinanceSummaryPayload) {
  return apiFetch<RentOrderFinance>(`/admin/rent-orders/${orderId}/finance-summary`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function createRentOrderPriceItem(orderId: string, payload: OrderPriceItemPayload) {
  return apiFetch<RentOrderFinance>(`/admin/rent-orders/${orderId}/price-items`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteRentOrderPriceItem(orderId: string, itemId: string) {
  return apiFetch<RentOrderFinance>(`/admin/rent-orders/${orderId}/price-items/${itemId}`, {
    method: "DELETE",
  });
}

export function createRentOrderPayment(orderId: string, payload: OrderPaymentPayload) {
  return apiFetch<RentOrderFinance>(`/admin/rent-orders/${orderId}/payments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteRentOrderPayment(orderId: string, paymentId: string) {
  return apiFetch<RentOrderFinance>(`/admin/rent-orders/${orderId}/payments/${paymentId}`, {
    method: "DELETE",
  });
}

export function listMonobankPaymentLinks(orderId: string) {
  return apiFetch<MonobankInvoiceFinance[]>(`/admin/rent-orders/${orderId}/payment-links/monobank`);
}

export function createMonobankPaymentLink(orderId: string, payload?: { amount?: number }) {
  return apiFetch<MonobankInvoiceFinance>(`/admin/rent-orders/${orderId}/payment-links/monobank`, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}

export function syncMonobankPaymentLink(orderId: string, invoiceId: string) {
  return apiFetch<{ result: unknown; finance: RentOrderFinance | null }>(
    `/admin/rent-orders/${orderId}/payment-links/monobank/${encodeURIComponent(invoiceId)}/sync`,
    {
      method: "POST",
    },
  );
}

export function deleteMonobankPaymentLink(orderId: string, invoiceId: string) {
  return apiFetch<{ success: true }>(
    `/admin/rent-orders/${orderId}/payment-links/monobank/${encodeURIComponent(invoiceId)}`,
    {
      method: "DELETE",
    },
  );
}

export function createRentOrderExpense(orderId: string, payload: OrderExpensePayload) {
  return apiFetch<RentOrderFinance>(`/admin/rent-orders/${orderId}/expenses`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteRentOrderExpense(orderId: string, expenseId: string) {
  return apiFetch<RentOrderFinance>(`/admin/rent-orders/${orderId}/expenses/${expenseId}`, {
    method: "DELETE",
  });
}

export function saveWorkerCompensation(orderId: string, payload: WorkerCompensationPayload) {
  return apiFetch<RentOrderFinance>(`/admin/rent-orders/${orderId}/worker-compensation`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function createEmployeeSettlement(orderId: string, payload: EmployeeSettlementPayload) {
  return apiFetch<RentOrderFinance>(`/admin/rent-orders/${orderId}/employee-settlements`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateEmployeeSettlement(orderId: string, settlementId: string, payload: EmployeeSettlementPayload) {
  return apiFetch<RentOrderFinance>(`/admin/rent-orders/${orderId}/employee-settlements/${settlementId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteEmployeeSettlement(orderId: string, settlementId: string) {
  return apiFetch<RentOrderFinance>(`/admin/rent-orders/${orderId}/employee-settlements/${settlementId}`, {
    method: "DELETE",
  });
}

export function createFinanceEmployeeSettlement(payload: EmployeeSettlementPayload) {
  return apiFetch<EmployeeSettlementFinance>("/admin/finance/employee-settlements", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

function buildRangeQuery(range: FinanceRange, extra?: Record<string, string | null | undefined>) {
  const params = new URLSearchParams({
    from: range.from,
    to: range.to,
  });
  Object.entries(extra ?? {}).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

export function getFinanceSummaryDashboard(range: FinanceRange) {
  return apiFetch<FinanceSummary>(`/admin/finance/summary?${buildRangeQuery(range)}`);
}

export function getFinanceByEquipmentDashboard(range: FinanceRange) {
  return apiFetch<FinanceByEquipmentRow[]>(`/admin/finance/by-equipment?${buildRangeQuery(range)}`);
}

export function getFinanceByServiceDashboard(range: FinanceRange) {
  return apiFetch<FinanceByServiceRow[]>(`/admin/finance/by-service?${buildRangeQuery(range)}`);
}

export function getClientDebtsDashboard(range: FinanceRange) {
  return apiFetch<ClientDebtRow[]>(`/admin/finance/client-debts?${buildRangeQuery(range)}`);
}

export function getEmployeeBalancesDashboard(range: FinanceRange) {
  return apiFetch<EmployeeBalanceRow[]>(`/admin/finance/employee-balances?${buildRangeQuery(range)}`);
}

export function getEquipmentExpenses(range: FinanceRange, filters?: { equipmentId?: string; type?: string }) {
  return apiFetch<EquipmentExpense[]>(
    `/admin/finance/equipment-expenses?${buildRangeQuery(range, {
      equipmentId: filters?.equipmentId,
      type: filters?.type,
    })}`,
  );
}

export function createEquipmentExpense(payload: EquipmentExpensePayload) {
  return apiFetch<EquipmentExpense>("/admin/finance/equipment-expenses", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateEquipmentExpense(expenseId: string, payload: EquipmentExpensePayload) {
  return apiFetch<EquipmentExpense>(`/admin/finance/equipment-expenses/${expenseId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteEquipmentExpense(expenseId: string) {
  return apiFetch<{ success: true }>(`/admin/finance/equipment-expenses/${expenseId}`, {
    method: "DELETE",
  });
}

export async function downloadFinanceExport(range: FinanceRange) {
  const response = await fetch(`/api/admin/finance/export.xlsx?${buildRangeQuery(range)}`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${response.status}`);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/i);

  return {
    blob,
    filename: match?.[1] ?? `finance-report-${range.from}_${range.to}.xlsx`,
  };
}
