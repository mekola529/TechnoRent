import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  createFinanceEmployeeSettlement,
  createEquipmentExpense,
  deleteEquipmentExpense,
  downloadFinanceExport,
  getClientDebtsDashboard,
  getEmployeeBalancesDashboard,
  getEquipmentExpenses,
  getFinanceByEquipmentDashboard,
  getFinanceByServiceDashboard,
  getFinanceSummaryDashboard,
  updateEquipmentExpense,
} from "../data/finance.service";
import type {
  ClientDebtRow,
  EmployeeBalanceRow,
  EquipmentExpense,
  FinanceByEquipmentRow,
  FinanceByServiceRow,
  FinanceSummary,
} from "../data/types";
import { apiFetch } from "../api/client";
import { AdminButton, AdminCard, AdminInput, AdminPageHeader, AdminSelect, AdminTextarea } from "../components/admin";

type EquipmentOption = {
  id: string;
  name: string;
};

type EmployeeOption = {
  id: string;
  fullName: string;
};

type EquipmentExpenseFormState = {
  equipmentId: string;
  type: string;
  expenseDate: string;
  fuelLiters: string;
  fuelPricePerLiter: string;
  amount: string;
  comment: string;
};

type EmployeeSettlementFormState = {
  direction: "to_employee" | "from_employee" | "employee_to_employee";
  fromEmployeeId: string;
  toEmployeeId: string;
  amount: string;
  method: string;
  settledAt: string;
  comment: string;
};

type FinanceTableTab = "expenses" | "equipment" | "services" | "debts" | "employees";

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

const workerStatusLabels: Record<string, string> = {
  NOT_SETTLED: "Не розраховано",
  PARTIALLY_SETTLED: "Частково розраховано",
  SETTLED: "Розраховано",
  EMPLOYEE_OWES_COMPANY: "Працівник винен компанії",
  COMPANY_OWES_EMPLOYEE: "Компанія винна працівнику",
};

const paymentStatusLabels: Record<string, string> = {
  UNPAID: "Не оплачено",
  PARTIALLY_PAID: "Частково оплачено",
  PAID: "Оплачено",
  OVERPAID: "Переплата",
};

const paymentMethodLabels: Record<string, string> = {
  cash: "Готівка",
  card: "Картка",
  bank_transfer: "Переказ",
  invoice: "Рахунок",
  other: "Інше",
};

function getMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${day}`,
  };
}

function fmtMoney(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(value)} грн`;
}

function fmtNumber(value: number | null | undefined, suffix = "") {
  if (value == null || Number.isNaN(value)) return "—";
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(value)}${suffix}`;
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("uk-UA");
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <AdminCard className="flex flex-col gap-1 !p-4">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <span className="text-2xl font-bold text-gray-900">{value}</span>
    </AdminCard>
  );
}

function createEmptyExpenseForm(date: string): EquipmentExpenseFormState {
  return {
    equipmentId: "",
    type: "fuel",
    expenseDate: date,
    fuelLiters: "",
    fuelPricePerLiter: "",
    amount: "",
    comment: "",
  };
}

function createEmptySettlementForm(): EmployeeSettlementFormState {
  return {
    direction: "to_employee",
    fromEmployeeId: "",
    toEmployeeId: "",
    amount: "",
    method: "cash",
    settledAt: "",
    comment: "",
  };
}

export default function AdminFinancePage() {
  const [range, setRange] = useState(getMonthRange);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [byEquipment, setByEquipment] = useState<FinanceByEquipmentRow[]>([]);
  const [byService, setByService] = useState<FinanceByServiceRow[]>([]);
  const [clientDebts, setClientDebts] = useState<ClientDebtRow[]>([]);
  const [employeeBalances, setEmployeeBalances] = useState<EmployeeBalanceRow[]>([]);
  const [equipmentExpenses, setEquipmentExpenses] = useState<EquipmentExpense[]>([]);
  const [equipmentList, setEquipmentList] = useState<EquipmentOption[]>([]);
  const [employeeList, setEmployeeList] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showSettlementForm, setShowSettlementForm] = useState(false);
  const [activeTab, setActiveTab] = useState<FinanceTableTab>("expenses");
  const [expenseFilters, setExpenseFilters] = useState({
    equipmentId: "all",
    type: "all",
  });
  const [expenseForm, setExpenseForm] = useState<EquipmentExpenseFormState>(() =>
    createEmptyExpenseForm(getMonthRange().to),
  );
  const [settlementForm, setSettlementForm] = useState<EmployeeSettlementFormState>(createEmptySettlementForm);

  const showFuelFields = expenseForm.type === "fuel";
  const isGeneralExpenseType = expenseForm.type === "fuel" || expenseForm.type === "materials";

  async function loadEquipment() {
    try {
      const data = await apiFetch<EquipmentOption[]>("/equipment");
      setEquipmentList(data);
    } catch {
      // ignore
    }
  }

  async function loadEmployees() {
    try {
      const data = await apiFetch<{ employees: EmployeeOption[] }>("/admin/employees");
      setEmployeeList(data.employees);
    } catch {
      // ignore
    }
  }

  async function loadDashboard() {
    setLoading(true);
    setError("");
    try {
      const [summaryData, byEquipmentData, byServiceData, clientDebtData, employeeBalanceData, expenseData] =
        await Promise.all([
          getFinanceSummaryDashboard(range),
          getFinanceByEquipmentDashboard(range),
          getFinanceByServiceDashboard(range),
          getClientDebtsDashboard(range),
          getEmployeeBalancesDashboard(range),
          getEquipmentExpenses(range, expenseFilters),
        ]);

      setSummary(summaryData);
      setByEquipment(byEquipmentData);
      setByService(byServiceData);
      setClientDebts(clientDebtData);
      setEmployeeBalances(employeeBalanceData);
      setEquipmentExpenses(expenseData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося завантажити фінанси");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEquipment();
    void loadEmployees();
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [range.from, range.to, expenseFilters.equipmentId, expenseFilters.type]);

  const autoAmountPreview = useMemo(() => {
    if (!showFuelFields) return null;
    const liters = Number(expenseForm.fuelLiters);
    const price = Number(expenseForm.fuelPricePerLiter);
    if (!Number.isFinite(liters) || !Number.isFinite(price)) return null;
    return liters * price;
  }, [expenseForm.fuelLiters, expenseForm.fuelPricePerLiter, showFuelFields]);

  function resetExpenseForm() {
    setEditingExpenseId(null);
    setShowExpenseForm(false);
    setExpenseForm(createEmptyExpenseForm(range.to));
  }

  async function handleSaveExpense() {
    if (!expenseForm.expenseDate) {
      setError("Для витрати потрібно вказати дату");
      return;
    }

    if (!isGeneralExpenseType && !expenseForm.equipmentId) {
      setError("Для цієї витрати потрібно вибрати техніку");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        equipmentId: expenseForm.equipmentId || null,
        type: expenseForm.type,
        expenseDate: expenseForm.expenseDate,
        amount: expenseForm.amount.trim() === "" ? null : Number(expenseForm.amount),
        fuelLiters: expenseForm.fuelLiters.trim() === "" ? null : Number(expenseForm.fuelLiters),
        fuelPricePerLiter:
          expenseForm.fuelPricePerLiter.trim() === "" ? null : Number(expenseForm.fuelPricePerLiter),
        comment: expenseForm.comment.trim() || null,
      };

      if (editingExpenseId) {
        await updateEquipmentExpense(editingExpenseId, payload);
      } else {
        await createEquipmentExpense(payload);
      }

      resetExpenseForm();
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося зберегти витрату");
    } finally {
      setSaving(false);
    }
  }

  function handleEditExpense(expense: EquipmentExpense) {
    setEditingExpenseId(expense.id);
    setShowExpenseForm(true);
    setActiveTab("expenses");
    setExpenseForm({
      equipmentId: expense.equipmentId ?? "",
      type: expense.type,
      expenseDate: expense.expenseDate.slice(0, 10),
      fuelLiters: expense.fuelLiters == null ? "" : String(expense.fuelLiters),
      fuelPricePerLiter: expense.fuelPricePerLiter == null ? "" : String(expense.fuelPricePerLiter),
      amount: expense.amount == null ? "" : String(expense.amount),
      comment: expense.comment ?? "",
    });
  }

  async function handleDeleteExpense(expenseId: string) {
    setSaving(true);
    setError("");
    try {
      await deleteEquipmentExpense(expenseId);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося видалити витрату");
    } finally {
      setSaving(false);
    }
  }

  function resetSettlementForm() {
    setShowSettlementForm(false);
    setSettlementForm(createEmptySettlementForm());
  }

  async function handleSaveSettlement() {
    const fromEmployeeId =
      settlementForm.direction === "from_employee" || settlementForm.direction === "employee_to_employee"
        ? settlementForm.fromEmployeeId
        : "";
    const toEmployeeId =
      settlementForm.direction === "to_employee" || settlementForm.direction === "employee_to_employee"
        ? settlementForm.toEmployeeId
        : "";

    if (!settlementForm.amount.trim()) {
      setError("Вкажіть суму розрахунку");
      return;
    }
    if ((settlementForm.direction === "from_employee" || settlementForm.direction === "employee_to_employee") && !fromEmployeeId) {
      setError("Вкажіть працівника, який передає кошти");
      return;
    }
    if ((settlementForm.direction === "to_employee" || settlementForm.direction === "employee_to_employee") && !toEmployeeId) {
      setError("Вкажіть працівника, який отримує кошти");
      return;
    }
    if (settlementForm.direction === "employee_to_employee" && fromEmployeeId === toEmployeeId) {
      setError("Працівник не може передати кошти сам собі");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await createFinanceEmployeeSettlement({
        employeeId: toEmployeeId || fromEmployeeId,
        fromEmployeeId: fromEmployeeId || null,
        toEmployeeId: toEmployeeId || null,
        amount: Number(settlementForm.amount),
        direction: settlementForm.direction,
        method: settlementForm.method,
        settledAt: settlementForm.settledAt || null,
        comment: settlementForm.comment.trim() || null,
      });
      resetSettlementForm();
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося зберегти розрахунок з працівником");
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setError("");
    try {
      const { blob, filename } = await downloadFinanceExport(range);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося завантажити Excel");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <AdminPageHeader title="Фінанси" subtitle="Фінансовий стан за вибраний період">
        <div className="flex flex-wrap gap-2">
          <AdminButton variant="secondary" size="sm" onClick={() => setRange(getMonthRange())}>
            Поточний місяць
          </AdminButton>
          <AdminButton variant="secondary" size="sm" onClick={() => void loadDashboard()}>
            Оновити
          </AdminButton>
          <AdminButton variant="secondary" size="sm" onClick={() => void handleExport()} disabled={exporting}>
            {exporting ? "Формування Excel…" : "Експорт в Excel"}
          </AdminButton>
        </div>
      </AdminPageHeader>

      <AdminCard className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
        <AdminInput
          label="Від"
          type="date"
          value={range.from}
          onChange={(e) => setRange((prev) => ({ ...prev, from: e.target.value }))}
        />
        <AdminInput
          label="До"
          type="date"
          value={range.to}
          onChange={(e) => setRange((prev) => ({ ...prev, to: e.target.value }))}
        />
        <div className="flex items-end">
          <AdminButton onClick={() => void loadDashboard()} disabled={loading}>
            Застосувати
          </AdminButton>
        </div>
      </AdminCard>

      {error ? (
        <AdminCard className="border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </AdminCard>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Дохід" value={fmtMoney(summary?.income)} />
        <MetricCard label="Витрати" value={fmtMoney(summary?.expenses)} />
        <MetricCard label="Прибуток" value={fmtMoney(summary?.profit)} />
        <MetricCard label="Закупівля пального" value={fmtMoney(summary?.fuelExpenses)} />
        <MetricCard label="Залишок пального" value={fmtNumber(summary?.fuelBalanceLiters, " л")} />
        <MetricCard label="Списано пального" value={fmtNumber(summary?.fuelConsumedLiters, " л")} />
        <MetricCard label="Обслуговування / ремонт" value={fmtMoney(summary?.maintenanceExpenses)} />
        <MetricCard label="Оплата працівників" value={fmtMoney(summary?.workerCompensation)} />
        <MetricCard label="Борги клієнтів" value={fmtMoney(summary?.clientDebt)} />
        <MetricCard label="Баланс з працівниками" value={fmtMoney(summary?.workerBalance)} />
      </div>

      {summary?.isFuelBalanceLow ? (
        <AdminCard className="border-amber-200 bg-amber-50">
          <p className="text-sm font-semibold text-amber-900">
            Низький залишок пального: {fmtNumber(summary.fuelBalanceLiters, " л")}.
          </p>
          <p className="mt-1 text-sm text-amber-800">
            Поріг попередження: {fmtNumber(summary.fuelLowBalanceThresholdLiters, " л")}. Додайте закупівлю пального у витратах техніки.
          </p>
        </AdminCard>
      ) : null}

      <TableCard
        title="Фінансові таблиці"
        actions={
          <div className="flex flex-wrap gap-2">
            <TabButton label="Витрати техніки" active={activeTab === "expenses"} onClick={() => setActiveTab("expenses")} />
            <TabButton label="По техніці" active={activeTab === "equipment"} onClick={() => setActiveTab("equipment")} />
            <TabButton label="По послугах" active={activeTab === "services"} onClick={() => setActiveTab("services")} />
            <TabButton label="Борги клієнтів" active={activeTab === "debts"} onClick={() => setActiveTab("debts")} />
            <TabButton label="Працівники" active={activeTab === "employees"} onClick={() => setActiveTab("employees")} />
          </div>
        }
      >
        {activeTab === "expenses" ? (
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Витрати техніки</h3>
              <p className="mt-1 text-sm text-gray-500">
                Для закупівлі пального або сипучих матеріалів можна не вибирати конкретну техніку. Остання закупівля пального використовується як ціна за літр для автоматичного розрахунку витрат після виконання замовлення.
              </p>
            </div>

            <div className="grid gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 lg:grid-cols-[1fr_1fr_auto]">
              <AdminSelect
                label="Фільтр по техніці"
                value={expenseFilters.equipmentId}
                onChange={(e) => setExpenseFilters((prev) => ({ ...prev, equipmentId: e.target.value }))}
              >
                <option value="all">Уся техніка</option>
                {equipmentList.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </AdminSelect>
              <AdminSelect
                label="Фільтр по типу"
                value={expenseFilters.type}
                onChange={(e) => setExpenseFilters((prev) => ({ ...prev, type: e.target.value }))}
              >
                <option value="all">Усі типи</option>
                {Object.entries(equipmentExpenseTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </AdminSelect>
              <div className="flex items-end">
                <AdminButton
                  onClick={() => {
                    if (showExpenseForm) {
                      resetExpenseForm();
                    } else {
                      setShowExpenseForm(true);
                    }
                  }}
                  disabled={saving}
                >
                  {showExpenseForm ? "Скасувати" : "Додати витрату"}
                </AdminButton>
              </div>
            </div>

            {showExpenseForm ? (
              <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="grid gap-3 lg:grid-cols-3">
                  <AdminSelect
                    label="Техніка"
                    value={expenseForm.equipmentId}
                    onChange={(e) => setExpenseForm((prev) => ({ ...prev, equipmentId: e.target.value }))}
                  >
                    <option value="">
                      {expenseForm.type === "fuel"
                        ? "Загальна закупівля пального"
                        : expenseForm.type === "materials"
                          ? "Загальна закупівля матеріалів"
                          : "— Оберіть техніку —"}
                    </option>
                    {equipmentList.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </AdminSelect>
                  <AdminSelect
                    label="Тип витрати"
                    value={expenseForm.type}
                    onChange={(e) => setExpenseForm((prev) => ({ ...prev, type: e.target.value }))}
                  >
                    {Object.entries(equipmentExpenseTypeLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </AdminSelect>
                  <AdminInput
                    label="Дата"
                    type="date"
                    value={expenseForm.expenseDate}
                    onChange={(e) => setExpenseForm((prev) => ({ ...prev, expenseDate: e.target.value }))}
                  />
                </div>

                {showFuelFields ? (
                  <div className="grid gap-3 lg:grid-cols-3">
                    <AdminInput
                      label="Літри"
                      type="number"
                      min="0"
                      step="0.01"
                      value={expenseForm.fuelLiters}
                      onChange={(e) => setExpenseForm((prev) => ({ ...prev, fuelLiters: e.target.value }))}
                    />
                    <AdminInput
                      label="Ціна за літр"
                      type="number"
                      min="0"
                      step="0.01"
                      value={expenseForm.fuelPricePerLiter}
                      onChange={(e) => setExpenseForm((prev) => ({ ...prev, fuelPricePerLiter: e.target.value }))}
                    />
                    <AdminInput
                      label="Сума"
                      type="number"
                      min="0"
                      step="0.01"
                      value={expenseForm.amount}
                      onChange={(e) => setExpenseForm((prev) => ({ ...prev, amount: e.target.value }))}
                      placeholder={autoAmountPreview == null ? "Авто" : String(autoAmountPreview)}
                    />
                  </div>
                ) : (
                  <div className="grid gap-3 lg:grid-cols-2">
                    <AdminInput
                      label="Сума"
                      type="number"
                      min="0"
                      step="0.01"
                      value={expenseForm.amount}
                      onChange={(e) => setExpenseForm((prev) => ({ ...prev, amount: e.target.value }))}
                    />
                  </div>
                )}

                <AdminTextarea
                  label="Коментар"
                  rows={3}
                  value={expenseForm.comment}
                  onChange={(e) => setExpenseForm((prev) => ({ ...prev, comment: e.target.value }))}
                />

                <div className="flex justify-end gap-2">
                  <AdminButton variant="secondary" onClick={resetExpenseForm} disabled={saving}>
                    {editingExpenseId ? "Скасувати редагування" : "Скасувати"}
                  </AdminButton>
                  <AdminButton onClick={handleSaveExpense} disabled={saving}>
                    {saving ? "Збереження…" : editingExpenseId ? "Зберегти зміни" : "Зберегти витрату"}
                  </AdminButton>
                </div>
              </div>
            ) : null}

            <DataTable
              headers={["Дата", "Техніка", "Тип", "Літри", "Ціна / л", "Сума", "Коментар", "Дії"]}
              emptyText="За період витрат техніки немає."
              rows={equipmentExpenses.map((expense) => [
                fmtDate(expense.expenseDate),
                expense.equipmentName ?? (expense.type === "fuel"
                  ? "Загальна закупівля пального"
                  : expense.type === "materials"
                    ? "Загальна закупівля матеріалів"
                    : "—"),
                equipmentExpenseTypeLabels[expense.type] ?? expense.type,
                fmtNumber(expense.fuelLiters),
                fmtMoney(expense.fuelPricePerLiter),
                fmtMoney(expense.amount),
                expense.comment ?? "—",
                expense.id,
              ])}
              renderLastCell={(_, rowIndex) => {
                const expense = equipmentExpenses[rowIndex];
                return (
                  <div className="flex gap-2">
                    <AdminButton variant="ghost" size="sm" onClick={() => handleEditExpense(expense)} disabled={saving}>
                      Редагувати
                    </AdminButton>
                    <AdminButton variant="ghost" size="sm" onClick={() => void handleDeleteExpense(expense.id)} disabled={saving}>
                      Видалити
                    </AdminButton>
                  </div>
                );
              }}
            />
          </div>
        ) : null}

        {activeTab === "equipment" ? (
          <DataTable
            headers={[
              "Техніка",
              "Замовлень",
              "Дохід",
              "Пальне, л",
              "Пальне, грн",
              "Обслуговування",
              "Інші витрати замовлень",
              "Зарплата",
              "Всього витрат",
              "Прибуток",
            ]}
            rows={byEquipment.map((row) => [
              row.equipmentName,
              String(row.ordersCount),
              fmtMoney(row.income),
              fmtNumber(row.fuelLiters),
              fmtMoney(row.fuelExpenses),
              fmtMoney(row.maintenanceExpenses),
              fmtMoney(row.orderExpenses),
              fmtMoney(row.workerCompensation),
              fmtMoney(row.totalExpenses),
              fmtMoney(row.profit),
            ])}
          />
        ) : null}

        {activeTab === "services" ? (
          <DataTable
            headers={["Послуга", "Замовлень", "Дохід", "Пальне, л", "Пальне, грн", "Інші витрати", "Прибуток"]}
            rows={byService.map((row) => [
              row.serviceTitle,
              String(row.ordersCount),
              fmtMoney(row.income),
              fmtNumber(row.fuelLiters),
              fmtMoney(row.fuelExpenses),
              fmtMoney(row.expenses),
              fmtMoney(row.profit),
            ])}
          />
        ) : null}

        {activeTab === "debts" ? (
          <DataTable
            headers={["Замовлення", "Клієнт", "Телефон", "Послуга", "Сума", "Оплачено", "Борг", "Статус", "Дата"]}
            rows={clientDebts.map((row) => [
              row.orderId,
              row.customerName,
              row.customerPhone,
              row.serviceTitle,
              fmtMoney(row.orderTotal),
              fmtMoney(row.clientPaid),
              fmtMoney(row.clientDebt),
              paymentStatusLabels[row.paymentStatus] ?? row.paymentStatus,
              fmtDate(row.closedAt),
            ])}
            renderFirstCell={(value, rowIndex) => (
              <Link
                to="/admin/rent-orders"
                state={{ openOrderId: clientDebts[rowIndex]?.orderId }}
                className="font-medium text-primary hover:underline"
              >
                {value}
              </Link>
            )}
          />
        ) : null}

        {activeTab === "employees" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Розрахунки з працівниками</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Тут фіксуються виплати компанії, повернення готівки від працівників і передачі між працівниками.
                </p>
              </div>
              <AdminButton
                onClick={() => setShowSettlementForm((prev) => !prev)}
                disabled={saving}
              >
                {showSettlementForm ? "Скасувати" : "+ Додати розрахунок"}
              </AdminButton>
            </div>

            {showSettlementForm ? (
              <div className="grid gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 lg:grid-cols-3">
                <AdminSelect
                  label="Сценарій"
                  value={settlementForm.direction}
                  onChange={(e) =>
                    setSettlementForm((prev) => ({
                      ...prev,
                      direction: e.target.value as EmployeeSettlementFormState["direction"],
                      fromEmployeeId: "",
                      toEmployeeId: "",
                    }))
                  }
                >
                  <option value="to_employee">Компанія → працівнику</option>
                  <option value="from_employee">Працівник → компанії</option>
                  <option value="employee_to_employee">Працівник → працівнику</option>
                </AdminSelect>
                {settlementForm.direction === "from_employee" || settlementForm.direction === "employee_to_employee" ? (
                  <AdminSelect
                    label="Хто передає"
                    value={settlementForm.fromEmployeeId}
                    onChange={(e) => setSettlementForm((prev) => ({ ...prev, fromEmployeeId: e.target.value }))}
                  >
                    <option value="">— Оберіть працівника —</option>
                    {employeeList.map((employee) => (
                      <option key={employee.id} value={employee.id}>{employee.fullName}</option>
                    ))}
                  </AdminSelect>
                ) : (
                  <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                    <div className="text-xs font-medium text-gray-500">Хто передає</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">Компанія</div>
                  </div>
                )}
                {settlementForm.direction === "to_employee" || settlementForm.direction === "employee_to_employee" ? (
                  <AdminSelect
                    label="Хто отримує"
                    value={settlementForm.toEmployeeId}
                    onChange={(e) => setSettlementForm((prev) => ({ ...prev, toEmployeeId: e.target.value }))}
                  >
                    <option value="">— Оберіть працівника —</option>
                    {employeeList.map((employee) => (
                      <option key={employee.id} value={employee.id}>{employee.fullName}</option>
                    ))}
                  </AdminSelect>
                ) : (
                  <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                    <div className="text-xs font-medium text-gray-500">Хто отримує</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">Компанія</div>
                  </div>
                )}
                <AdminInput
                  label="Сума"
                  type="number"
                  min="0"
                  step="0.01"
                  value={settlementForm.amount}
                  onChange={(e) => setSettlementForm((prev) => ({ ...prev, amount: e.target.value }))}
                />
                <AdminSelect
                  label="Метод"
                  value={settlementForm.method}
                  onChange={(e) => setSettlementForm((prev) => ({ ...prev, method: e.target.value }))}
                >
                  {Object.entries(paymentMethodLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </AdminSelect>
                <AdminInput
                  label="Дата і час"
                  type="datetime-local"
                  value={settlementForm.settledAt}
                  onChange={(e) => setSettlementForm((prev) => ({ ...prev, settledAt: e.target.value }))}
                />
                <div className="lg:col-span-3">
                  <AdminTextarea
                    label="Коментар"
                    rows={2}
                    value={settlementForm.comment}
                    onChange={(e) => setSettlementForm((prev) => ({ ...prev, comment: e.target.value }))}
                  />
                </div>
                <div className="flex justify-end gap-2 lg:col-span-3">
                  <AdminButton variant="secondary" onClick={resetSettlementForm} disabled={saving}>
                    Скасувати
                  </AdminButton>
                  <AdminButton onClick={() => void handleSaveSettlement()} disabled={saving}>
                    {saving ? "Збереження…" : "Зберегти розрахунок"}
                  </AdminButton>
                </div>
              </div>
            ) : null}

            <DataTable
              headers={[
                "Працівник",
                "Замовлень",
                "Заробив",
                "Отримав від клієнтів",
                "Витрати подав",
                "Компанія має виплатити",
                "Працівник має передати",
                "Чистий баланс",
                "Статус",
              ]}
              rows={employeeBalances.map((row) => [
                row.employeeName,
                String(row.ordersCount),
                fmtMoney(row.earned),
                fmtMoney(row.receivedFromClients),
                fmtMoney(row.reportedExpenses),
                fmtMoney(row.companyOwesEmployee),
                fmtMoney(row.employeeOwesCompany),
                fmtMoney(row.balance),
                workerStatusLabels[row.status] ?? row.status,
              ])}
            />
          </div>
        ) : null}
      </TableCard>
    </div>
  );
}

function TableCard({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <AdminCard className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-400">{title}</h3>
        {actions}
      </div>
      {children}
    </AdminCard>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-2 text-sm font-medium transition ${
        active
          ? "border-primary bg-primary text-black"
          : "border-gray-200 bg-white text-gray-600 hover:border-primary/40 hover:text-gray-900"
      }`}
    >
      {label}
    </button>
  );
}

function DataTable({
  headers,
  rows,
  emptyText,
  renderFirstCell,
  renderLastCell,
}: {
  headers: string[];
  rows: string[][];
  emptyText?: string;
  renderFirstCell?: (value: string, rowIndex: number) => ReactNode;
  renderLastCell?: (value: string, rowIndex: number) => ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
            {headers.map((header) => (
              <th key={header} className="px-3 py-2">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-3 py-6 text-center text-gray-500">
                {emptyText ?? "Даних за цей період немає."}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr key={`${row[0]}-${rowIndex}`} className="border-b border-gray-100 align-top">
                {row.map((value, cellIndex) => {
                  const isFirst = cellIndex === 0;
                  const isLast = cellIndex === row.length - 1;
                  return (
                    <td key={`${cellIndex}-${value}`} className="px-3 py-2 text-gray-700">
                      {isFirst && renderFirstCell
                        ? renderFirstCell(value, rowIndex)
                        : isLast && renderLastCell
                          ? renderLastCell(value, rowIndex)
                          : value}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
