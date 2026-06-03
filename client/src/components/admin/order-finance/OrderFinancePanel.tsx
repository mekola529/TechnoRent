import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AdminAccordionSection,
  AdminButton,
  AdminCard,
  AdminInput,
  AdminSelect,
  AdminTextarea,
} from "../index";
import {
  createMonobankPaymentLink,
  createRentOrderExpense,
  createRentOrderPayment,
  createRentOrderPriceItem,
  deleteRentOrderExpense,
  deleteRentOrderPayment,
  deleteRentOrderPriceItem,
  deleteMonobankPaymentLink,
  getPriceItemTemplates,
  getRentOrderFinance,
  listMonobankPaymentLinks,
  saveWorkerCompensation,
  syncMonobankPaymentLink,
  updateRentOrderFinanceSummary,
} from "../../../data/finance.service";
import type { MonobankInvoiceFinance, PriceItemTemplate, RentOrderFinance } from "../../../data/types";

type EmployeeOption = {
  id: string;
  fullName: string;
  role: string | null;
};

type EquipmentOption = {
  id: string;
  name: string;
};

type AssignmentOption = {
  id: string;
  employeeId: string;
  employeeName: string;
  equipmentId: string | null;
  equipmentName: string | null;
  status: string;
};

type ExecutionSessionOption = {
  id: string;
  sequenceNumber: number | null;
  employeeName: string | null;
  equipmentName: string | null;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
};

type Props = {
  orderId: string;
  employees: EmployeeOption[];
  equipment: EquipmentOption[];
  assignments?: AssignmentOption[];
  executionSessions?: ExecutionSessionOption[];
  onChanged?: () => Promise<void> | void;
  onFinanceLoaded?: (finance: RentOrderFinance | null) => void;
  mode?: "default" | "order-detail";
  sections?: Array<"summary" | "priceItems" | "payments" | "expenses" | "worker">;
  workerAssignmentContent?: ReactNode;
  insertAfterWorkerContent?: ReactNode;
};

type PriceItemFormState = {
  templateId: string;
  title: string;
  calculationType: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  total: string;
  equipmentId: string;
  comment: string;
};

type PaymentFormState = {
  executionSessionId: string;
  amount: string;
  method: string;
  receivedByType: string;
  employeeId: string;
  paidAt: string;
  comment: string;
};

type ExpenseFormState = {
  executionSessionId: string;
  equipmentId: string;
  employeeId: string;
  type: string;
  amount: string;
  source: string;
  expenseAt: string;
  comment: string;
};

type CompensationFormState = {
  assignmentId: string;
  equipmentId: string;
  employeeId: string;
  type: string;
  rate: string;
  quantity: string;
  percent: string;
  finalAmount: string;
  status: string;
  comment: string;
};

const paymentStatusLabels: Record<string, string> = {
  UNPAID: "Не оплачено",
  PARTIALLY_PAID: "Частково оплачено",
  PAID: "Оплачено",
  OVERPAID: "Переплата",
};

const workerSettlementLabels: Record<string, string> = {
  NOT_SETTLED: "Не розраховано",
  PARTIALLY_SETTLED: "Частково розраховано",
  SETTLED: "Розраховано",
  EMPLOYEE_OWES_COMPANY: "Працівник винен компанії",
  COMPANY_OWES_EMPLOYEE: "Компанія винна працівнику",
};

const priceCalculationTypeLabels: Record<string, string> = {
  fixed: "Фіксована сума",
  per_km: "За кілометр",
  per_hour: "За годину",
  per_shift: "За зміну",
  manual: "Ручна сума",
  percent: "Відсоток",
};

const workerCompensationTypeLabels: Record<string, string> = {
  fixed: "Фіксовано",
  hourly: "За годину",
  shift: "За зміну",
  percent: "Відсоток",
  manual: "Ручна сума",
};

const expenseTypeLabels: Record<string, string> = {
  fuel: "Пальне",
  fuel_purchase: "Компенсація за пальне працівнику",
  parking: "Парковка",
  materials: "Матеріали",
  repair: "Ремонт",
  maintenance: "Обслуговування",
  road_toll: "Платна дорога",
  other: "Інше",
};

const paymentMethodLabels: Record<string, string> = {
  cash: "Готівка",
  card: "Картка",
  bank_transfer: "Переказ",
  invoice: "Рахунок",
  other: "Інше",
};

function isDerivedOrderExpense(expenseId: string | null | undefined) {
  return typeof expenseId === "string" && expenseId.startsWith("system-material-cost:");
}

const receivedByLabels: Record<string, string> = {
  employee: "Працівник",
  manager: "Менеджер",
  company: "Компанія",
  other: "Інше",
};

const monobankStatusLabels: Record<string, string> = {
  created: "Створено",
  processing: "В обробці",
  hold: "Холд",
  success: "Оплачено",
  failure: "Помилка",
  expired: "Прострочено",
  reversed: "Повернено",
};

function monobankStatusTone(status: string): "neutral" | "positive" | "warning" | "danger" {
  if (status === "success") return "positive";
  if (status === "failure" || status === "expired" || status === "reversed") return "danger";
  if (status === "processing" || status === "hold") return "warning";
  return "neutral";
}

function isPendingMonobankLink(link: MonobankInvoiceFinance) {
  return !link.orderPaymentId && ["created", "processing", "hold"].includes(link.status);
}

function fmtMoney(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(value)} грн`;
}

function fmtKop(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return fmtMoney(value / 100);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("uk-UA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function createEmptyPriceItemForm(): PriceItemFormState {
  return {
    templateId: "",
    title: "",
    calculationType: "manual",
    quantity: "1",
    unit: "",
    unitPrice: "",
    total: "",
    equipmentId: "",
    comment: "",
  };
}

function createEmptyPaymentForm(): PaymentFormState {
  return {
    executionSessionId: "",
    amount: "",
    method: "cash",
    receivedByType: "manager",
    employeeId: "",
    paidAt: "",
    comment: "",
  };
}

function createEmptyExpenseForm(): ExpenseFormState {
  return {
    executionSessionId: "",
    equipmentId: "",
    employeeId: "",
    type: "other",
    amount: "",
    source: "manager",
    expenseAt: "",
    comment: "",
  };
}

function createEmptyCompensationForm(): CompensationFormState {
  return {
    assignmentId: "",
    equipmentId: "",
    employeeId: "",
    type: "fixed",
    rate: "",
    quantity: "",
    percent: "",
    finalAmount: "",
    status: "draft",
    comment: "",
  };
}

function FinanceMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "warning" | "danger";
}) {
  const toneClass =
    tone === "positive"
      ? "border-emerald-200 bg-emerald-50"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50"
        : tone === "danger"
          ? "border-red-200 bg-red-50"
          : "border-gray-200 bg-gray-50";

  return (
    <div className={`rounded-lg border px-4 py-3 ${toneClass}`}>
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function InlineBadge({ children, tone = "neutral" }: { children: string; tone?: "neutral" | "positive" | "warning" | "danger" }) {
  const toneClass =
    tone === "positive"
      ? "bg-emerald-100 text-emerald-700"
      : tone === "warning"
        ? "bg-amber-100 text-amber-700"
        : tone === "danger"
          ? "bg-red-100 text-red-700"
          : "bg-gray-100 text-gray-700";
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${toneClass}`}>{children}</span>;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
      {text}
    </div>
  );
}

function FinanceTable({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

export default function OrderFinancePanel({
  orderId,
  employees,
  equipment,
  assignments = [],
  executionSessions = [],
  onChanged,
  onFinanceLoaded,
  mode = "default",
  sections,
  workerAssignmentContent,
  insertAfterWorkerContent,
}: Props) {
  const [finance, setFinance] = useState<RentOrderFinance | null>(null);
  const [templates, setTemplates] = useState<PriceItemTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paymentLinks, setPaymentLinks] = useState<MonobankInvoiceFinance[]>([]);
  const [paymentLinkBusy, setPaymentLinkBusy] = useState(false);
  const [paymentLinkError, setPaymentLinkError] = useState("");
  const [paymentLinkNotice, setPaymentLinkNotice] = useState("");

  const [summaryForm, setSummaryForm] = useState({
    agreedTotal: "",
    financeComment: "",
  });
  const [priceItemForm, setPriceItemForm] = useState<PriceItemFormState>(createEmptyPriceItemForm);
  const [paymentForm, setPaymentForm] = useState<PaymentFormState>(createEmptyPaymentForm);
  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>(createEmptyExpenseForm);
  const [compensationForm, setCompensationForm] = useState<CompensationFormState>(createEmptyCompensationForm);

  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [showPriceItemForm, setShowPriceItemForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showCompensationForm, setShowCompensationForm] = useState(false);

  async function refreshFinance() {
    setLoading(true);
    setError("");
    try {
      const [financeData, templateData, paymentLinkData] = await Promise.all([
        getRentOrderFinance(orderId),
        getPriceItemTemplates(),
        listMonobankPaymentLinks(orderId),
      ]);
      setFinance(financeData);
      setTemplates(templateData);
      setPaymentLinks(paymentLinkData);
      onFinanceLoaded?.(financeData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося завантажити фінанси");
      onFinanceLoaded?.(null);
    } finally {
      setLoading(false);
    }
  }

  async function refreshPaymentLinks() {
    try {
      setPaymentLinkError("");
      const next = await listMonobankPaymentLinks(orderId);
      setPaymentLinks(next);
    } catch (err) {
      setPaymentLinkError(err instanceof Error ? err.message : "Не вдалося оновити посилання monobank");
    }
  }

  useEffect(() => {
    void refreshFinance();
  }, [orderId]);

  useEffect(() => {
    if (!paymentLinks.some(isPendingMonobankLink)) return;

    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const previousPaidIds = new Set(
            paymentLinks
              .filter((link) => link.status === "success" || link.orderPaymentId)
              .map((link) => link.invoiceId),
          );
          const nextLinks = await listMonobankPaymentLinks(orderId);
          setPaymentLinks(nextLinks);

          const nextFinance = await getRentOrderFinance(orderId);
          setFinance(nextFinance);
          onFinanceLoaded?.(nextFinance);

          const hasNewPaidLink = nextLinks.some(
            (link) => (link.status === "success" || link.orderPaymentId) && !previousPaidIds.has(link.invoiceId),
          );
          if (hasNewPaidLink) {
            await onChanged?.();
          }
        } catch (err) {
          setPaymentLinkError(err instanceof Error ? err.message : "Не вдалося оновити статус monobank");
        }
      })();
    }, 8000);

    return () => window.clearInterval(timer);
  }, [orderId, paymentLinks, onChanged, onFinanceLoaded]);

  useEffect(() => {
    if (!finance) return;
    setSummaryForm({
      agreedTotal: finance.order.agreedTotal == null ? "" : String(finance.order.agreedTotal),
      financeComment: finance.order.financeComment ?? "",
    });
    setCompensationForm({
      assignmentId: finance.latestWorkerCompensation?.assignmentId ?? "",
      equipmentId: finance.latestWorkerCompensation?.equipmentId ?? "",
      employeeId: finance.latestWorkerCompensation?.employeeId ?? "",
      type: finance.latestWorkerCompensation?.type ?? "fixed",
      rate: finance.latestWorkerCompensation?.rate == null ? "" : String(finance.latestWorkerCompensation.rate),
      quantity: finance.latestWorkerCompensation?.quantity == null ? "" : String(finance.latestWorkerCompensation.quantity),
      percent: finance.latestWorkerCompensation?.percent == null ? "" : String(finance.latestWorkerCompensation.percent),
      finalAmount: finance.latestWorkerCompensation?.finalAmount == null ? "" : String(finance.latestWorkerCompensation.finalAmount),
      status: finance.latestWorkerCompensation?.status ?? "draft",
      comment: finance.latestWorkerCompensation?.comment ?? "",
    });
  }, [finance]);

  const employeeChoices = useMemo(
    () => employees.map((employee) => ({ value: employee.id, label: employee.fullName })),
    [employees],
  );
  const assignmentChoices = useMemo(
    () =>
      assignments.map((assignment) => ({
        value: assignment.id,
        label: `${assignment.employeeName} • ${assignment.equipmentName ?? "Без техніки"}`,
      })),
    [assignments],
  );
  const executionSessionChoices = useMemo(
    () =>
      executionSessions.map((session) => ({
        value: session.id,
        label: [
          `Зміна #${session.sequenceNumber ?? "—"}`,
          session.employeeName ?? null,
          session.equipmentName ?? null,
          session.startedAt ? fmtDateTime(session.startedAt) : null,
        ].filter(Boolean).join(" • "),
      })),
    [executionSessions],
  );
  const executionSessionLabelMap = useMemo(
    () =>
      new Map(
        executionSessions.map((session) => [
          session.id,
          [
            `Зміна #${session.sequenceNumber ?? "—"}`,
            session.employeeName ?? null,
            session.equipmentName ?? null,
          ].filter(Boolean).join(" • "),
        ]),
      ),
    [executionSessions],
  );

  const calculationMode = priceItemForm.calculationType;
  const showPriceQuantity = calculationMode !== "manual";
  const showPriceRate = calculationMode !== "manual";
  const priceRateLabel = calculationMode === "manual" ? "Сума" : "Ціна";

  const showReceivedEmployee = paymentForm.receivedByType === "employee";
  const showExpenseEmployee = expenseForm.source === "employee";

  const compensationPreview = useMemo(() => {
    const orderBase = finance?.summary.orderTotal ?? 0;
    const rate = compensationForm.rate.trim() === "" ? 0 : Number(compensationForm.rate);
    const quantity = compensationForm.quantity.trim() === "" ? 0 : Number(compensationForm.quantity);
    const percent = compensationForm.percent.trim() === "" ? 0 : Number(compensationForm.percent);
    const finalAmount = compensationForm.finalAmount.trim() === "" ? 0 : Number(compensationForm.finalAmount);

    if (compensationForm.type === "hourly" && compensationForm.quantity.trim() === "") {
      return null;
    }
    if (compensationForm.type === "hourly" || compensationForm.type === "shift") {
      return Number.isFinite(rate * quantity) ? rate * quantity : 0;
    }
    if (compensationForm.type === "percent") {
      return Number.isFinite(orderBase * (percent / 100)) ? orderBase * (percent / 100) : 0;
    }
    return finalAmount;
  }, [compensationForm, finance]);

  const perWorkerBalances = useMemo(() => {
    if (!finance) return [];

    const byEmployee = new Map<string, {
      employeeId: string;
      employeeName: string;
      equipmentNames: Set<string>;
      earned: number;
      receivedFromClients: number;
      reportedExpenses: number;
      paidByCompany: number;
      returnedToCompany: number;
      companyOwesEmployee: number;
      employeeOwesCompany: number;
      hasCompensation: boolean;
    }>();

    const ensureEmployee = (employeeId: string, employeeName?: string | null, equipmentName?: string | null) => {
      const existing = byEmployee.get(employeeId);
      if (existing) {
        if (employeeName && (!existing.employeeName || existing.employeeName === "Не вказано")) {
          existing.employeeName = employeeName;
        }
        if (equipmentName) existing.equipmentNames.add(equipmentName);
        return existing;
      }

      const assignment = assignments.find((item) => item.employeeId === employeeId);
      const row = {
        employeeId,
        employeeName: employeeName || assignment?.employeeName || "Не вказано",
        equipmentNames: new Set<string>([
          ...(equipmentName ? [equipmentName] : []),
          ...(assignment?.equipmentName ? [assignment.equipmentName] : []),
        ]),
        earned: 0,
        receivedFromClients: 0,
        reportedExpenses: 0,
        paidByCompany: 0,
        returnedToCompany: 0,
        companyOwesEmployee: 0,
        employeeOwesCompany: 0,
        hasCompensation: false,
      };
      byEmployee.set(employeeId, row);
      return row;
    };

    assignments.forEach((assignment) => {
      ensureEmployee(assignment.employeeId, assignment.employeeName, assignment.equipmentName ?? null);
    });

    finance.workerCompensations.forEach((item) => {
      if (!item.employeeId) return;
      const target = ensureEmployee(item.employeeId, item.employeeName ?? null, item.equipmentName ?? null);
      target.hasCompensation = true;
      target.earned += item.finalAmount ?? item.calculatedAmount ?? 0;
    });

    finance.payments.forEach((payment) => {
      if (payment.receivedByType !== "employee" || !payment.employeeId) return;
      const target = ensureEmployee(payment.employeeId, payment.employeeName ?? null, null);
      target.receivedFromClients += payment.amount;
    });

    finance.expenses.forEach((expense) => {
      if (expense.source !== "employee" || !expense.employeeId) return;
      const target = ensureEmployee(expense.employeeId, expense.employeeName ?? null, expense.equipmentName ?? null);
      target.reportedExpenses += expense.amount;
    });

    finance.settlements.forEach((settlement) => {
      const senderId =
        settlement.fromEmployeeId ||
        (settlement.direction === "from_employee" ? settlement.employeeId : null);
      const receiverId =
        settlement.toEmployeeId ||
        (settlement.direction === "to_employee" ? settlement.employeeId : null);

      if (receiverId) {
        const target = ensureEmployee(
          receiverId,
          settlement.toEmployeeName ?? settlement.employeeName ?? null,
          null,
        );
        target.paidByCompany += settlement.amount;
      }
      if (senderId) {
        const target = ensureEmployee(
          senderId,
          settlement.fromEmployeeName ?? settlement.employeeName ?? null,
          null,
        );
        target.returnedToCompany += settlement.amount;
      }
    });

    return Array.from(byEmployee.values())
      .map((row) => {
        const companyOwesEmployee = Math.max(
          0,
          roundMoney(row.earned + row.reportedExpenses - row.paidByCompany),
        );
        const employeeOwesCompany = Math.max(
          0,
          roundMoney(row.receivedFromClients - row.returnedToCompany),
        );
        const balance = roundMoney(companyOwesEmployee - employeeOwesCompany);
        const hasSettlements = Math.abs(row.paidByCompany) > 0.009 || Math.abs(row.returnedToCompany) > 0.009;
        const settlementStatus = !row.hasCompensation
          ? "UNSET"
          : Math.abs(companyOwesEmployee) < 0.01 && Math.abs(employeeOwesCompany) < 0.01
            ? "SETTLED"
            : Math.abs(companyOwesEmployee) >= 0.01 && Math.abs(employeeOwesCompany) >= 0.01
              ? "PARTIALLY_SETTLED"
              : companyOwesEmployee > 0
                ? (hasSettlements ? "PARTIALLY_SETTLED" : "COMPANY_OWES_EMPLOYEE")
                : (hasSettlements ? "PARTIALLY_SETTLED" : "EMPLOYEE_OWES_COMPANY");

        return {
          employeeId: row.employeeId,
          employeeName: row.employeeName,
          equipmentNames: Array.from(row.equipmentNames).filter(Boolean),
          earned: roundMoney(row.earned),
          receivedFromClients: roundMoney(row.receivedFromClients),
          reportedExpenses: roundMoney(row.reportedExpenses),
          paidByCompany: roundMoney(row.paidByCompany),
          returnedToCompany: roundMoney(row.returnedToCompany),
          companyOwesEmployee,
          employeeOwesCompany,
          balance,
          settlementStatus,
          hasCompensation: row.hasCompensation,
        };
      })
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName, "uk"));
  }, [assignments, finance]);

  async function runMutation(action: () => Promise<RentOrderFinance>) {
    setBusy(true);
    setError("");
    try {
      const next = await action();
      setFinance(next);
      onFinanceLoaded?.(next);
      await onChanged?.();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося зберегти зміни");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function applyTemplate(templateId: string) {
    const template = templates.find((item) => item.id === templateId) ?? null;
    setPriceItemForm((prev) => ({
      ...prev,
      templateId,
      title: template?.title ?? prev.title,
      calculationType: template?.calculationType ?? prev.calculationType,
      unit: template?.defaultUnit ?? prev.unit,
      unitPrice: template?.defaultUnitPrice == null ? prev.unitPrice : String(template.defaultUnitPrice),
      quantity: template?.calculationType === "fixed" ? "1" : prev.quantity,
    }));
  }

  function handlePriceCalculationTypeChange(value: string) {
    setPriceItemForm((prev) => ({
      ...prev,
      calculationType: value,
      quantity: value === "fixed" ? "1" : prev.quantity,
      total: value === "manual" ? prev.total : prev.total,
    }));
  }

  async function handleSaveSummary() {
    const ok = await runMutation(() =>
      updateRentOrderFinanceSummary(orderId, {
        agreedTotal: summaryForm.agreedTotal.trim() === "" ? null : Number(summaryForm.agreedTotal),
        financeComment: summaryForm.financeComment.trim() || null,
      }),
    );
    if (ok) {
      setIsEditingSummary(false);
    }
  }

  async function handleAddPriceItem() {
    const ok = await runMutation(() =>
      createRentOrderPriceItem(orderId, {
        templateId: priceItemForm.templateId || null,
        equipmentId: priceItemForm.equipmentId || null,
        title: priceItemForm.title.trim(),
        calculationType: priceItemForm.calculationType,
        quantity: showPriceQuantity && priceItemForm.quantity.trim() !== "" ? Number(priceItemForm.quantity) : 1,
        unit: priceItemForm.unit.trim() || null,
        unitPrice: showPriceRate && priceItemForm.unitPrice.trim() !== "" ? Number(priceItemForm.unitPrice) : null,
        total: priceItemForm.total.trim() === "" ? null : Number(priceItemForm.total),
        source: priceItemForm.templateId ? "template" : "manual",
        comment: priceItemForm.comment.trim() || null,
        sortOrder: finance?.priceItems.length ?? 0,
      }),
    );
    if (ok) {
      setPriceItemForm(createEmptyPriceItemForm());
      setShowPriceItemForm(false);
    }
  }

  async function handleAddPayment() {
    const ok = await runMutation(() =>
      createRentOrderPayment(orderId, {
        executionSessionId: paymentForm.executionSessionId || null,
        amount: Number(paymentForm.amount),
        method: paymentForm.method,
        receivedByType: paymentForm.receivedByType,
        employeeId: showReceivedEmployee ? paymentForm.employeeId || null : null,
        paidAt: paymentForm.paidAt || null,
        comment: paymentForm.comment.trim() || null,
      }),
    );
    if (ok) {
      setPaymentForm(createEmptyPaymentForm());
      setShowPaymentForm(false);
    }
  }

  async function handleCreateMonobankLink() {
    setPaymentLinkBusy(true);
    setPaymentLinkError("");
    setPaymentLinkNotice("");
    try {
      const created = await createMonobankPaymentLink(orderId);
      setPaymentLinks((prev) => [created, ...prev]);
      setPaymentLinkNotice("Посилання створено. Його можна скопіювати й надіслати клієнту.");
      if (created.pageUrl && navigator.clipboard) {
        await navigator.clipboard.writeText(created.pageUrl).catch(() => undefined);
      }
    } catch (err) {
      setPaymentLinkError(err instanceof Error ? err.message : "Не вдалося створити посилання monobank");
    } finally {
      setPaymentLinkBusy(false);
    }
  }

  async function handleSyncMonobankLink(invoiceId: string) {
    setPaymentLinkBusy(true);
    setPaymentLinkError("");
    setPaymentLinkNotice("");
    try {
      const result = await syncMonobankPaymentLink(orderId, invoiceId);
      if (result.finance) {
        setFinance(result.finance);
        onFinanceLoaded?.(result.finance);
      }
      await refreshPaymentLinks();
      await onChanged?.();
      setPaymentLinkNotice("Статус рахунку оновлено.");
    } catch (err) {
      setPaymentLinkError(err instanceof Error ? err.message : "Не вдалося оновити статус monobank");
    } finally {
      setPaymentLinkBusy(false);
    }
  }

  async function handleCopyPaymentLink(url: string) {
    setPaymentLinkNotice("");
    setPaymentLinkError("");
    try {
      await navigator.clipboard.writeText(url);
      setPaymentLinkNotice("Посилання скопійовано.");
    } catch {
      setPaymentLinkError("Не вдалося скопіювати посилання автоматично.");
    }
  }

  async function handleDeleteMonobankLink(invoiceId: string) {
    if (!window.confirm("Видалити це посилання на оплату? Якщо клієнт уже отримав його, краще створити нове посилання після видалення.")) {
      return;
    }

    setPaymentLinkBusy(true);
    setPaymentLinkError("");
    setPaymentLinkNotice("");
    try {
      await deleteMonobankPaymentLink(orderId, invoiceId);
      setPaymentLinks((prev) => prev.filter((link) => link.invoiceId !== invoiceId));
      setPaymentLinkNotice("Посилання видалено.");
      await onChanged?.();
    } catch (err) {
      setPaymentLinkError(err instanceof Error ? err.message : "Не вдалося видалити посилання monobank");
    } finally {
      setPaymentLinkBusy(false);
    }
  }

  async function handleAddExpense() {
    const ok = await runMutation(() =>
      createRentOrderExpense(orderId, {
        executionSessionId: expenseForm.executionSessionId || null,
        equipmentId: expenseForm.equipmentId || null,
        employeeId: showExpenseEmployee ? expenseForm.employeeId || null : null,
        type: expenseForm.type,
        amount: Number(expenseForm.amount),
        source: expenseForm.source as "manager" | "employee" | "system",
        expenseAt: expenseForm.expenseAt || null,
        comment: expenseForm.comment.trim() || null,
      }),
    );
    if (ok) {
      setExpenseForm(createEmptyExpenseForm());
      setShowExpenseForm(false);
    }
  }

  async function handleSaveCompensation() {
    const ok = await runMutation(() =>
      saveWorkerCompensation(orderId, {
        assignmentId: compensationForm.assignmentId || null,
        equipmentId: compensationForm.equipmentId || null,
        employeeId: compensationForm.employeeId || null,
        type: compensationForm.type,
        rate:
          compensationForm.type === "hourly" || compensationForm.type === "shift"
            ? compensationForm.rate.trim() === ""
              ? null
              : Number(compensationForm.rate)
            : null,
        quantity:
          compensationForm.type === "hourly" || compensationForm.type === "shift"
            ? compensationForm.quantity.trim() === ""
              ? null
              : Number(compensationForm.quantity)
            : null,
        percent:
          compensationForm.type === "percent"
            ? compensationForm.percent.trim() === ""
              ? null
              : Number(compensationForm.percent)
            : null,
        finalAmount:
          compensationForm.type === "fixed" || compensationForm.type === "manual"
            ? compensationForm.finalAmount.trim() === ""
              ? null
              : Number(compensationForm.finalAmount)
            : null,
        status: compensationForm.status,
        comment: compensationForm.comment.trim() || null,
      }),
    );
    if (ok) {
      setShowCompensationForm(false);
    }
  }

  if (loading) {
    return (
      <AdminCard>
        <p className="text-sm text-gray-500">Завантаження фінансів…</p>
      </AdminCard>
    );
  }

  if (!finance) {
    return (
      <AdminCard>
        <p className="text-sm text-red-600">{error || "Фінансові дані недоступні"}</p>
      </AdminCard>
    );
  }

  const financeData = finance;
  const clientDebtTone = finance.summary.clientDebt > 0 ? "danger" : "positive";
  const paymentTone =
    finance.summary.paymentStatus === "PAID" || finance.summary.paymentStatus === "OVERPAID"
      ? "positive"
      : finance.summary.clientPaid > 0
        ? "warning"
        : "neutral";
  const workerBalanceTone =
    finance.summary.workerSettlementStatus === "SETTLED"
      ? "positive"
      : finance.summary.workerSettlementStatus === "PARTIALLY_SETTLED"
        ? "warning"
        : "danger";
  const profitTone = finance.summary.orderProfit < 0 ? "danger" : "positive";
  const orderVisibleExpenses = finance.expenses.filter((expense) => expense.type !== "fuel_purchase");
  const expenseTypeOptions = Object.entries(expenseTypeLabels).filter(([value]) => value !== "fuel_purchase");
  const visibleSections = new Set(sections ?? ["summary", "priceItems", "payments", "expenses", "worker"]);
  const showEmbeddedPayments = mode === "order-detail" && visibleSections.has("payments");

  function renderPaymentsContent() {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-3">
          <FinanceMetric label="Оплачено клієнтом" value={fmtMoney(financeData.summary.clientPaid)} tone={paymentTone} />
          <FinanceMetric label="Борг клієнта" value={fmtMoney(financeData.summary.clientDebt)} tone={clientDebtTone} />
          <FinanceMetric
            label="Статус оплати"
            value={paymentStatusLabels[financeData.summary.paymentStatus] ?? financeData.summary.paymentStatus}
            tone={paymentTone}
          />
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">Посилання на оплату monobank</h4>
              <p className="mt-1 text-xs text-gray-500">
                Створює рахунок на поточний борг клієнта. Після успішної оплати webhook автоматично додасть оплату в замовлення.
              </p>
            </div>
            <AdminButton
              size="sm"
              disabled={paymentLinkBusy || financeData.summary.orderTotal <= 0}
              onClick={() => void handleCreateMonobankLink()}
            >
              {paymentLinkBusy ? "Створення…" : "Створити посилання"}
            </AdminButton>
          </div>

          {paymentLinkError ? <p className="mt-3 text-xs font-medium text-red-600">{paymentLinkError}</p> : null}
          {paymentLinkNotice ? <p className="mt-3 text-xs font-medium text-emerald-700">{paymentLinkNotice}</p> : null}

          {paymentLinks.length > 0 ? (
            <div className="mt-4 flex flex-col gap-2">
              {paymentLinks.slice(0, 5).map((link) => (
                <div key={link.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <InlineBadge tone={monobankStatusTone(link.status)}>
                        {monobankStatusLabels[link.status] ?? link.status}
                      </InlineBadge>
                      <span className="text-sm font-semibold text-gray-900">{fmtKop(link.finalAmountKop ?? link.amountKop)}</span>
                      <span className="text-xs text-gray-400">{fmtDateTime(link.createdAt)}</span>
                    </div>
                    {link.pageUrl ? (
                      <a
                        href={link.pageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block truncate text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        {link.pageUrl}
                      </a>
                    ) : null}
                    {link.failureReason ? <p className="mt-1 text-xs text-red-600">{link.failureReason}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {link.pageUrl ? (
                      <AdminButton
                        variant="secondary"
                        size="sm"
                        disabled={paymentLinkBusy}
                        onClick={() => void handleCopyPaymentLink(link.pageUrl as string)}
                      >
                        Скопіювати
                      </AdminButton>
                    ) : null}
                    {link.status !== "success" ? (
                      <AdminButton
                        variant="ghost"
                        size="sm"
                        disabled={paymentLinkBusy}
                        onClick={() => void handleSyncMonobankLink(link.invoiceId)}
                      >
                        Оновити
                      </AdminButton>
                    ) : null}
                    {!link.orderPaymentId && link.status !== "success" ? (
                      <AdminButton
                        variant="danger"
                        size="sm"
                        disabled={paymentLinkBusy}
                        onClick={() => void handleDeleteMonobankLink(link.invoiceId)}
                      >
                        Видалити
                      </AdminButton>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end">
          <AdminButton
            variant={showPaymentForm ? "secondary" : "primary"}
            size="sm"
            onClick={() => {
              if (showPaymentForm) {
                setPaymentForm(createEmptyPaymentForm());
              }
              setShowPaymentForm((prev) => !prev);
            }}
          >
            {showPaymentForm ? "Скасувати" : "+ Додати оплату"}
          </AdminButton>
        </div>

        {showPaymentForm ? (
          <div className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-2 xl:grid-cols-3">
            <AdminInput
              label="Сума"
              type="number"
              min="0"
              step="0.01"
              value={paymentForm.amount}
              onChange={(e) => setPaymentForm((prev) => ({ ...prev, amount: e.target.value }))}
            />
            <AdminSelect
              label="Зміна / виїзд"
              value={paymentForm.executionSessionId}
              onChange={(e) => setPaymentForm((prev) => ({ ...prev, executionSessionId: e.target.value }))}
            >
              <option value="">— Не прив’язувати —</option>
              {executionSessionChoices.map((session) => (
                <option key={session.value} value={session.value}>{session.label}</option>
              ))}
            </AdminSelect>
            <AdminSelect
              label="Метод оплати"
              value={paymentForm.method}
              onChange={(e) => setPaymentForm((prev) => ({ ...prev, method: e.target.value }))}
            >
              {Object.entries(paymentMethodLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </AdminSelect>
            <AdminSelect
              label="Хто отримав"
              value={paymentForm.receivedByType}
              onChange={(e) => setPaymentForm((prev) => ({ ...prev, receivedByType: e.target.value }))}
            >
              {Object.entries(receivedByLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </AdminSelect>
            {showReceivedEmployee ? (
              <AdminSelect
                label="Працівник"
                value={paymentForm.employeeId}
                onChange={(e) => setPaymentForm((prev) => ({ ...prev, employeeId: e.target.value }))}
              >
                <option value="">— Не вибрано —</option>
                {employeeChoices.map((employee) => (
                  <option key={employee.value} value={employee.value}>{employee.label}</option>
                ))}
              </AdminSelect>
            ) : null}
            <AdminInput
              label="Дата і час"
              type="datetime-local"
              value={paymentForm.paidAt}
              onChange={(e) => setPaymentForm((prev) => ({ ...prev, paidAt: e.target.value }))}
            />
            <div className="md:col-span-2 xl:col-span-3">
              <AdminTextarea
                label="Коментар"
                rows={2}
                value={paymentForm.comment}
                onChange={(e) => setPaymentForm((prev) => ({ ...prev, comment: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2 xl:col-span-3 flex justify-end gap-2">
              <AdminButton
                variant="secondary"
                onClick={() => {
                  setPaymentForm(createEmptyPaymentForm());
                  setShowPaymentForm(false);
                }}
                disabled={busy}
              >
                Скасувати
              </AdminButton>
              <AdminButton disabled={busy || paymentForm.amount.trim() === ""} onClick={() => void handleAddPayment()}>
                Зберегти оплату
              </AdminButton>
            </div>
          </div>
        ) : null}

        {financeData.payments.length === 0 ? (
          <EmptyState text="Платежів ще немає." />
        ) : (
          <FinanceTable>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="px-3 py-2">Дата</th>
                  <th className="px-3 py-2">Зміна</th>
                  <th className="px-3 py-2">Сума</th>
                  <th className="px-3 py-2">Метод</th>
                  <th className="px-3 py-2">Хто отримав</th>
                  <th className="px-3 py-2">Коментар</th>
                  <th className="px-3 py-2">Дії</th>
                </tr>
              </thead>
              <tbody>
                {financeData.payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-gray-100 align-top">
                    <td className="px-3 py-2 text-gray-700">{fmtDateTime(payment.paidAt)}</td>
                    <td className="px-3 py-2 text-gray-700">
                      {payment.executionSessionId ? executionSessionLabelMap.get(payment.executionSessionId) ?? "—" : "—"}
                    </td>
                    <td className="px-3 py-2 font-semibold text-gray-900">{fmtMoney(payment.amount)}</td>
                    <td className="px-3 py-2 text-gray-700">{paymentMethodLabels[payment.method] ?? payment.method}</td>
                    <td className="px-3 py-2 text-gray-700">
                      {receivedByLabels[payment.receivedByType] ?? payment.receivedByType}
                      {payment.employeeName ? ` • ${payment.employeeName}` : ""}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{payment.comment ?? "—"}</td>
                    <td className="px-3 py-2">
                      <AdminButton
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => void runMutation(() => deleteRentOrderPayment(orderId, payment.id))}
                      >
                        Видалити
                      </AdminButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </FinanceTable>
        )}
      </div>
    );
  }

  function renderWorkerSection() {
    return (
      <AdminCard className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-gray-400">Працівник</h3>
            <p className="mt-1 text-sm text-gray-500">Призначення і нарахування оплати. Взаєморозрахунки ведуться на вкладці фінансів.</p>
          </div>
          <InlineBadge tone={workerBalanceTone}>
            {workerSettlementLabels[financeData.summary.workerSettlementStatus] ?? financeData.summary.workerSettlementStatus}
          </InlineBadge>
        </div>

        {workerAssignmentContent ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            {workerAssignmentContent}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <FinanceMetric label="Нараховано працівникам" value={fmtMoney(financeData.summary.workerSalary)} />
          <FinanceMetric label="Компанія має виплатити" value={fmtMoney(financeData.summary.companyOwesEmployee)} tone={financeData.summary.companyOwesEmployee > 0 ? "warning" : "positive"} />
          <FinanceMetric label="Готівка до передачі" value={fmtMoney(financeData.summary.employeeOwesCompany)} tone={financeData.summary.employeeOwesCompany > 0 ? "danger" : "positive"} />
          <FinanceMetric label="Отримано від клієнта працівниками" value={fmtMoney(financeData.summary.employeeCollectedCash)} />
          <FinanceMetric
            label="Статус розрахунку"
            value={workerSettlementLabels[financeData.summary.workerSettlementStatus] ?? financeData.summary.workerSettlementStatus}
            tone={workerBalanceTone}
          />
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          Якщо працівник отримав готівку від замовника, він має передати компанії всю суму. Зарплата і компенсації
          працівника рахуються окремо та закриваються на вкладці фінансів.
        </div>

        {perWorkerBalances.length > 0 ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-gray-900">Нарахування і борги по працівниках</div>
              {perWorkerBalances.some((item) => item.settlementStatus === "UNSET" || Math.abs(item.balance) >= 0.01) ? (
                <div className="text-xs font-medium text-amber-700">
                  {perWorkerBalances
                    .filter((item) => item.settlementStatus === "UNSET" || Math.abs(item.balance) >= 0.01)
                    .map((item) =>
                      item.settlementStatus === "UNSET"
                        ? `${item.employeeName}: оплату ще не задано`
                        : [
                            item.companyOwesEmployee > 0 ? `${item.employeeName}: не оплачено ${fmtMoney(item.companyOwesEmployee)}` : null,
                            item.employeeOwesCompany > 0 ? `${item.employeeName}: має передати ${fmtMoney(item.employeeOwesCompany)}` : null,
                          ].filter(Boolean).join(", ")
                    )
                    .join(" • ")}
                </div>
              ) : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {perWorkerBalances.map((item) => (
                <div key={item.employeeId} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{item.employeeName}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        {item.equipmentNames.length > 0 ? item.equipmentNames.join(" • ") : "Техніка не прив’язана"}
                      </div>
                    </div>
                    <InlineBadge
                      tone={
                        item.settlementStatus === "SETTLED"
                          ? "positive"
                          : item.settlementStatus === "PARTIALLY_SETTLED"
                            ? "warning"
                            : item.settlementStatus === "UNSET"
                              ? "danger"
                              : "danger"
                      }
                    >
                      {item.settlementStatus === "UNSET"
                        ? "Оплату не задано"
                        : workerSettlementLabels[item.settlementStatus] ?? item.settlementStatus}
                    </InlineBadge>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <FinanceMetric label="Нараховано" value={fmtMoney(item.earned)} />
                    <FinanceMetric label="Отримав від клієнта" value={fmtMoney(item.receivedFromClients)} />
                    <FinanceMetric label="Витрати працівника" value={fmtMoney(item.reportedExpenses)} />
                    <FinanceMetric label="Компанія має виплатити" value={fmtMoney(item.companyOwesEmployee)} tone={item.companyOwesEmployee > 0 ? "warning" : "positive"} />
                    <FinanceMetric label="Має передати компанії" value={fmtMoney(item.employeeOwesCompany)} tone={item.employeeOwesCompany > 0 ? "danger" : "positive"} />
                    <FinanceMetric
                      label="Чистий баланс"
                      value={fmtMoney(item.balance)}
                      tone={
                        item.settlementStatus === "SETTLED"
                          ? "positive"
                          : item.settlementStatus === "PARTIALLY_SETTLED"
                            ? "warning"
                            : "danger"
                      }
                    />
                  </div>
                  <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                    {item.settlementStatus === "UNSET"
                      ? "Для цього працівника ще не задано оплату."
                      : item.companyOwesEmployee > 0 || item.employeeOwesCompany > 0
                        ? [
                            item.companyOwesEmployee > 0
                              ? `Компанія має виплатити ${item.employeeName} ${fmtMoney(item.companyOwesEmployee)}.`
                              : null,
                            item.employeeOwesCompany > 0
                              ? `${item.employeeName} має передати компанії всю отриману готівку: ${fmtMoney(item.employeeOwesCompany)}.`
                              : null,
                          ].filter(Boolean).join(" ")
                        : `${item.employeeName} повністю розрахований.`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-2">
              <div className="text-sm font-semibold text-gray-900">
                {financeData.workerCompensations.length > 0
                  ? `Нарахувань: ${financeData.workerCompensations.length} • ${fmtMoney(financeData.summary.workerSalary)}`
                  : "Оплату працівника ще не задано"}
              </div>
              <div className="text-sm text-gray-500">
                {financeData.workerCompensations.length > 0
                  ? "Кожне нарахування можна прив’язати до окремого працівника і техніки"
                  : "Працівника не вибрано"}
              </div>
            </div>
            <AdminButton
              variant={showCompensationForm ? "secondary" : "primary"}
              size="sm"
              onClick={() => setShowCompensationForm((prev) => !prev)}
            >
              {showCompensationForm ? "Скасувати" : "Редагувати оплату"}
            </AdminButton>
          </div>

          {financeData.workerCompensations.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
                    <th className="px-3 py-2">Працівник</th>
                    <th className="px-3 py-2">Техніка</th>
                    <th className="px-3 py-2">Тип</th>
                    <th className="px-3 py-2">Сума</th>
                    <th className="px-3 py-2">Коментар</th>
                  </tr>
                </thead>
                <tbody>
                  {financeData.workerCompensations.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100 align-top">
                      <td className="px-3 py-2 text-gray-700">{item.employeeName ?? "—"}</td>
                      <td className="px-3 py-2 text-gray-700">{item.equipmentName ?? "—"}</td>
                      <td className="px-3 py-2 text-gray-700">{workerCompensationTypeLabels[item.type] ?? item.type}</td>
                      <td className="px-3 py-2 font-semibold text-gray-900">
                        <div>{fmtMoney(item.finalAmount ?? item.calculatedAmount)}</div>
                        {item.type === "hourly" ? (
                          <div className="mt-1 text-xs font-normal text-gray-500">
                            {item.actualQuantity != null
                              ? `Фактично: ${item.actualQuantity} год`
                              : "Буде перераховано після завершення виконання"}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{item.comment ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {showCompensationForm ? (
            <div className="mt-4 grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-2 xl:grid-cols-3">
              <AdminSelect
                label="Призначення"
                value={compensationForm.assignmentId}
                onChange={(e) => {
                  const assignmentId = e.target.value;
                  const assignment = assignments.find((item) => item.id === assignmentId);
                  setCompensationForm((prev) => ({
                    ...prev,
                    assignmentId,
                    employeeId: assignment?.employeeId ?? prev.employeeId,
                    equipmentId: assignment?.equipmentId ?? "",
                  }));
                }}
              >
                <option value="">— Без прив’язки —</option>
                {assignmentChoices.map((assignment) => (
                  <option key={assignment.value} value={assignment.value}>{assignment.label}</option>
                ))}
              </AdminSelect>
              <AdminSelect
                label="Працівник"
                value={compensationForm.employeeId}
                onChange={(e) => setCompensationForm((prev) => ({ ...prev, employeeId: e.target.value }))}
              >
                <option value="">— Не вибрано —</option>
                {employeeChoices.map((employee) => (
                  <option key={employee.value} value={employee.value}>{employee.label}</option>
                ))}
              </AdminSelect>
              <AdminSelect
                label="Техніка"
                value={compensationForm.equipmentId}
                onChange={(e) => setCompensationForm((prev) => ({ ...prev, equipmentId: e.target.value }))}
              >
                <option value="">— Не вибрано —</option>
                {equipment.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </AdminSelect>
              <AdminSelect
                label="Тип оплати"
                value={compensationForm.type}
                onChange={(e) => setCompensationForm((prev) => ({ ...prev, type: e.target.value }))}
              >
                {Object.entries(workerCompensationTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </AdminSelect>

              {(compensationForm.type === "fixed" || compensationForm.type === "manual") ? (
                <AdminInput
                  label="Сума"
                  type="number"
                  min="0"
                  step="0.01"
                  value={compensationForm.finalAmount}
                  onChange={(e) => setCompensationForm((prev) => ({ ...prev, finalAmount: e.target.value }))}
                />
              ) : null}

              {(compensationForm.type === "hourly" || compensationForm.type === "shift") ? (
                <>
                  <AdminInput
                    label={compensationForm.type === "hourly" ? "Ставка за годину" : "Ставка за зміну"}
                    type="number"
                    min="0"
                    step="0.01"
                    value={compensationForm.rate}
                    onChange={(e) => setCompensationForm((prev) => ({ ...prev, rate: e.target.value }))}
                  />
                  <AdminInput
                    label={compensationForm.type === "hourly" ? "Планові години (необов’язково)" : "Кількість змін"}
                    type="number"
                    min="0"
                    step="0.01"
                    value={compensationForm.quantity}
                    onChange={(e) => setCompensationForm((prev) => ({ ...prev, quantity: e.target.value }))}
                  />
                  <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                    <div className="text-xs font-medium text-gray-500">
                      {compensationForm.type === "hourly" ? "Попередній розрахунок" : "Фінальна сума"}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">
                      {compensationForm.type === "hourly" && compensationPreview == null
                        ? "Після завершення за фактичним часом"
                        : fmtMoney(compensationPreview)}
                    </div>
                  </div>
                </>
              ) : null}

              {compensationForm.type === "percent" ? (
                <>
                  <AdminInput
                    label="Відсоток"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={compensationForm.percent}
                    onChange={(e) => setCompensationForm((prev) => ({ ...prev, percent: e.target.value }))}
                  />
                  <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                    <div className="text-xs font-medium text-gray-500">База розрахунку</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">{fmtMoney(financeData.summary.orderTotal)}</div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                    <div className="text-xs font-medium text-gray-500">Орієнтовна сума</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">{fmtMoney(compensationPreview)}</div>
                  </div>
                </>
              ) : null}

              <div className="md:col-span-2 xl:col-span-3">
                <AdminTextarea
                  label="Коментар"
                  rows={2}
                  value={compensationForm.comment}
                  onChange={(e) => setCompensationForm((prev) => ({ ...prev, comment: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2 xl:col-span-3 flex justify-end gap-2">
                <AdminButton variant="secondary" onClick={() => setShowCompensationForm(false)} disabled={busy}>
                  Скасувати
                </AdminButton>
                <AdminButton disabled={busy} onClick={() => void handleSaveCompensation()}>
                  Зберегти оплату працівника
                </AdminButton>
              </div>
            </div>
          ) : null}
        </div>

      </AdminCard>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {visibleSections.has("summary") ? (
        <AdminCard className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wide text-gray-400">Фінанси замовлення</h3>
              <p className="mt-1 text-sm text-gray-500">Головні цифри і статуси по цьому замовленню.</p>
            </div>
            <div className="flex gap-2">
              <AdminButton
                variant="secondary"
                size="sm"
                onClick={() => setIsEditingSummary((prev) => !prev)}
                disabled={busy}
              >
                {isEditingSummary ? "Сховати редагування" : "Редагувати фінансові дані"}
              </AdminButton>
              <AdminButton variant="secondary" size="sm" onClick={() => void refreshFinance()} disabled={busy}>
                Оновити
              </AdminButton>
            </div>
          </div>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <FinanceMetric label="Розраховано" value={fmtMoney(finance.summary.calculatedTotal)} />
            <FinanceMetric label="Погоджено з клієнтом" value={fmtMoney(finance.summary.orderTotal)} />
            <FinanceMetric label="Оплачено" value={fmtMoney(finance.summary.clientPaid)} tone={paymentTone} />
            <FinanceMetric label="Борг клієнта" value={fmtMoney(finance.summary.clientDebt)} tone={clientDebtTone} />
            <FinanceMetric label="Витрати замовлення" value={fmtMoney(finance.summary.orderExpenses)} />
            <FinanceMetric label="Оплата працівника" value={fmtMoney(finance.summary.workerSalary)} />
            <FinanceMetric label="Компанія має виплатити" value={fmtMoney(finance.summary.companyOwesEmployee)} tone={finance.summary.companyOwesEmployee > 0 ? "warning" : "positive"} />
            <FinanceMetric label="Готівка до передачі" value={fmtMoney(finance.summary.employeeOwesCompany)} tone={finance.summary.employeeOwesCompany > 0 ? "danger" : "positive"} />
            <FinanceMetric label="Прибуток" value={fmtMoney(finance.summary.orderProfit)} tone={profitTone} />
          </div>

          <div className="flex flex-wrap gap-2">
            <InlineBadge
              tone={finance.summary.paymentStatus === "PAID" || finance.summary.paymentStatus === "OVERPAID" ? "positive" : finance.summary.clientPaid > 0 ? "warning" : "neutral"}
            >
              {paymentStatusLabels[finance.summary.paymentStatus] ?? finance.summary.paymentStatus}
            </InlineBadge>
            <InlineBadge tone={workerBalanceTone}>
              {workerSettlementLabels[finance.summary.workerSettlementStatus] ?? finance.summary.workerSettlementStatus}
            </InlineBadge>
          </div>

          {isEditingSummary ? (
            <div className="grid gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-[180px_1fr]">
              <AdminInput
                label="Погоджена сума, грн"
                type="number"
                min="0"
                value={summaryForm.agreedTotal}
                onChange={(e) => setSummaryForm((prev) => ({ ...prev, agreedTotal: e.target.value }))}
              />
              <AdminTextarea
                label="Фінансовий коментар"
                rows={3}
                value={summaryForm.financeComment}
                onChange={(e) => setSummaryForm((prev) => ({ ...prev, financeComment: e.target.value }))}
                placeholder="Що погоджено з клієнтом, умови оплати, важливі домовленості…"
              />
              <div className="md:col-span-2 flex justify-end gap-2">
                <AdminButton variant="secondary" onClick={() => setIsEditingSummary(false)} disabled={busy}>
                  Скасувати
                </AdminButton>
                <AdminButton onClick={() => void handleSaveSummary()} disabled={busy}>
                  Зберегти
                </AdminButton>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="text-xs font-medium text-gray-500">Погоджена сума</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">{fmtMoney(finance.order.agreedTotal)}</div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="text-xs font-medium text-gray-500">Фінансовий коментар</div>
                <div className="mt-1 text-sm text-gray-700">{finance.order.financeComment || "—"}</div>
              </div>
            </div>
          )}

          {showEmbeddedPayments ? (
            <div className="border-t border-gray-200 pt-4">
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-gray-900">Оплати клієнта</h4>
                <p className="mt-1 text-sm text-gray-500">Оплати, які вже зафіксовані по цьому замовленню.</p>
              </div>
              {renderPaymentsContent()}
            </div>
          ) : null}
        </AdminCard>
      ) : null}

      {visibleSections.has("priceItems") ? (
      <AdminAccordionSection
        title="Розрахунок для клієнта"
        subtitle="Позиції, з яких формується вартість замовлення."
        badge={`${finance.priceItems.length}`}
        defaultOpen
      >
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
            <AdminButton
              variant={showPriceItemForm ? "secondary" : "primary"}
              size="sm"
              onClick={() => {
                if (showPriceItemForm) {
                  setPriceItemForm(createEmptyPriceItemForm());
                }
                setShowPriceItemForm((prev) => !prev);
              }}
            >
              {showPriceItemForm ? "Скасувати" : "+ Додати позицію"}
            </AdminButton>
          </div>

          {showPriceItemForm ? (
            <div className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-2 xl:grid-cols-3">
              <AdminSelect
                label="Шаблон"
                value={priceItemForm.templateId}
                onChange={(e) => applyTemplate(e.target.value)}
              >
                <option value="">— Без шаблону —</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.title}</option>
                ))}
              </AdminSelect>
              <AdminInput
                label="Назва"
                value={priceItemForm.title}
                onChange={(e) => setPriceItemForm((prev) => ({ ...prev, title: e.target.value }))}
              />
              <AdminSelect
                label="Тип розрахунку"
                value={priceItemForm.calculationType}
                onChange={(e) => handlePriceCalculationTypeChange(e.target.value)}
              >
                {Object.entries(priceCalculationTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </AdminSelect>
              {showPriceQuantity ? (
                <AdminInput
                  label="Кількість"
                  type="number"
                  min="0"
                  step="0.01"
                  value={priceItemForm.quantity}
                  onChange={(e) => setPriceItemForm((prev) => ({ ...prev, quantity: e.target.value }))}
                />
              ) : null}
              <AdminInput
                label="Одиниця"
                value={priceItemForm.unit}
                onChange={(e) => setPriceItemForm((prev) => ({ ...prev, unit: e.target.value }))}
              />
              {showPriceRate ? (
                <AdminInput
                  label={priceRateLabel}
                  type="number"
                  min="0"
                  step="0.01"
                  value={priceItemForm.unitPrice}
                  onChange={(e) => setPriceItemForm((prev) => ({ ...prev, unitPrice: e.target.value }))}
                />
              ) : null}
              <AdminInput
                label="Ручна сума"
                type="number"
                min="0"
                step="0.01"
                value={priceItemForm.total}
                onChange={(e) => setPriceItemForm((prev) => ({ ...prev, total: e.target.value }))}
              />
              <AdminSelect
                label="Техніка"
                value={priceItemForm.equipmentId}
                onChange={(e) => setPriceItemForm((prev) => ({ ...prev, equipmentId: e.target.value }))}
              >
                <option value="">— Не прив’язано —</option>
                {equipment.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </AdminSelect>
              <div className="md:col-span-2 xl:col-span-3">
                <AdminTextarea
                  label="Коментар"
                  rows={2}
                  value={priceItemForm.comment}
                  onChange={(e) => setPriceItemForm((prev) => ({ ...prev, comment: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2 xl:col-span-3 flex justify-end gap-2">
                <AdminButton
                  variant="secondary"
                  onClick={() => {
                    setPriceItemForm(createEmptyPriceItemForm());
                    setShowPriceItemForm(false);
                  }}
                  disabled={busy}
                >
                  Скасувати
                </AdminButton>
                <AdminButton
                  disabled={busy || !priceItemForm.title.trim()}
                  onClick={() => void handleAddPriceItem()}
                >
                  Зберегти позицію
                </AdminButton>
              </div>
            </div>
          ) : null}

          {finance.priceItems.length === 0 ? (
            <EmptyState text="Позицій ще немає." />
          ) : (
            <FinanceTable>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
                    <th className="px-3 py-2">Назва</th>
                    <th className="px-3 py-2">Кількість</th>
                    <th className="px-3 py-2">Ціна</th>
                    <th className="px-3 py-2">Сума</th>
                    <th className="px-3 py-2">Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {finance.priceItems.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100 align-top">
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900">{item.title}</div>
                        <div className="text-xs text-gray-500">
                          {priceCalculationTypeLabels[item.calculationType] ?? item.calculationType}
                          {item.comment ? ` • ${item.comment}` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {item.quantity} {item.unit ?? ""}
                      </td>
                      <td className="px-3 py-2 text-gray-700">{fmtMoney(item.unitPrice)}</td>
                      <td className="px-3 py-2 font-semibold text-gray-900">{fmtMoney(item.total)}</td>
                      <td className="px-3 py-2">
                        <AdminButton
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => void runMutation(() => deleteRentOrderPriceItem(orderId, item.id))}
                        >
                          Видалити
                        </AdminButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </FinanceTable>
          )}
        </div>
      </AdminAccordionSection>
      ) : null}

      {visibleSections.has("payments") && !showEmbeddedPayments ? (
      <AdminAccordionSection
        title="Оплати клієнта"
        subtitle="Оплати, які вже зафіксовані по цьому замовленню."
        badge={paymentStatusLabels[finance.summary.paymentStatus] ?? finance.summary.paymentStatus}
      >
        {renderPaymentsContent()}
      </AdminAccordionSection>
      ) : null}

      {visibleSections.has("expenses") ? (
      <AdminAccordionSection
        title="Витрати замовлення"
        subtitle="Додаткові витрати по виконанню, техніці або працівнику."
        badge={fmtMoney(finance.summary.orderExpenses)}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <FinanceMetric label="Загальна сума витрат замовлення" value={fmtMoney(finance.summary.orderExpenses)} />
            <AdminButton
              variant={showExpenseForm ? "secondary" : "primary"}
              size="sm"
              onClick={() => {
                if (showExpenseForm) {
                  setExpenseForm(createEmptyExpenseForm());
                }
                setShowExpenseForm((prev) => !prev);
              }}
            >
              {showExpenseForm ? "Скасувати" : "+ Додати витрату"}
            </AdminButton>
          </div>

          {showExpenseForm ? (
            <div className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-2 xl:grid-cols-3">
            <AdminSelect
              label="Зміна / виїзд"
              value={expenseForm.executionSessionId}
              onChange={(e) => setExpenseForm((prev) => ({ ...prev, executionSessionId: e.target.value }))}
            >
              <option value="">— Не прив’язувати —</option>
              {executionSessionChoices.map((session) => (
                <option key={session.value} value={session.value}>{session.label}</option>
              ))}
            </AdminSelect>
            <AdminSelect
              label="Тип витрати"
              value={expenseForm.type}
              onChange={(e) => setExpenseForm((prev) => ({ ...prev, type: e.target.value }))}
              >
                {expenseTypeOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </AdminSelect>
              <AdminInput
                label="Сума"
                type="number"
                min="0"
                step="0.01"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm((prev) => ({ ...prev, amount: e.target.value }))}
              />
              <AdminSelect
                label="Джерело"
                value={expenseForm.source}
                onChange={(e) => setExpenseForm((prev) => ({ ...prev, source: e.target.value }))}
              >
                <option value="manager">Менеджер</option>
                <option value="employee">Працівник</option>
                <option value="system">Система</option>
              </AdminSelect>
              {showExpenseEmployee ? (
                <AdminSelect
                  label="Працівник"
                  value={expenseForm.employeeId}
                  onChange={(e) => setExpenseForm((prev) => ({ ...prev, employeeId: e.target.value }))}
                >
                  <option value="">— Не вибрано —</option>
                  {employeeChoices.map((employee) => (
                    <option key={employee.value} value={employee.value}>{employee.label}</option>
                  ))}
                </AdminSelect>
              ) : null}
              <AdminSelect
                label="Техніка"
                value={expenseForm.equipmentId}
                onChange={(e) => setExpenseForm((prev) => ({ ...prev, equipmentId: e.target.value }))}
              >
                <option value="">— Не вибрано —</option>
                {equipment.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </AdminSelect>
              <AdminInput
                label="Дата і час"
                type="datetime-local"
                value={expenseForm.expenseAt}
                onChange={(e) => setExpenseForm((prev) => ({ ...prev, expenseAt: e.target.value }))}
              />
              <div className="md:col-span-2 xl:col-span-3">
                <AdminTextarea
                  label="Коментар"
                  rows={2}
                  value={expenseForm.comment}
                  onChange={(e) => setExpenseForm((prev) => ({ ...prev, comment: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2 xl:col-span-3 flex justify-end gap-2">
                <AdminButton
                  variant="secondary"
                  onClick={() => {
                    setExpenseForm(createEmptyExpenseForm());
                    setShowExpenseForm(false);
                  }}
                  disabled={busy}
                >
                  Скасувати
                </AdminButton>
                <AdminButton disabled={busy || expenseForm.amount.trim() === ""} onClick={() => void handleAddExpense()}>
                  Зберегти витрату
                </AdminButton>
              </div>
            </div>
          ) : null}

          {orderVisibleExpenses.length === 0 ? (
            <EmptyState text="Витрат ще немає." />
          ) : (
            <FinanceTable>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="px-3 py-2">Дата</th>
                  <th className="px-3 py-2">Зміна</th>
                  <th className="px-3 py-2">Тип</th>
                    <th className="px-3 py-2">Сума</th>
                    <th className="px-3 py-2">Техніка</th>
                    <th className="px-3 py-2">Працівник</th>
                    <th className="px-3 py-2">Джерело</th>
                    <th className="px-3 py-2">Коментар</th>
                    <th className="px-3 py-2">Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {orderVisibleExpenses.map((expense) => (
                    <tr key={expense.id} className="border-b border-gray-100 align-top">
                    <td className="px-3 py-2 text-gray-700">{fmtDateTime(expense.expenseAt)}</td>
                    <td className="px-3 py-2 text-gray-700">
                      {expense.executionSessionId ? executionSessionLabelMap.get(expense.executionSessionId) ?? "—" : "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-700">{expenseTypeLabels[expense.type] ?? expense.type}</td>
                      <td className="px-3 py-2 font-semibold text-gray-900">{fmtMoney(expense.amount)}</td>
                      <td className="px-3 py-2 text-gray-700">{expense.equipmentName ?? "—"}</td>
                      <td className="px-3 py-2 text-gray-700">{expense.employeeName ?? "—"}</td>
                      <td className="px-3 py-2 text-gray-700">
                        {expense.source === "employee" ? "Працівник" : expense.source === "manager" ? "Менеджер" : "Система"}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{expense.comment ?? "—"}</td>
                      <td className="px-3 py-2">
                        {isDerivedOrderExpense(expense.id) ? (
                          <span className="text-xs font-medium text-gray-400">Авто</span>
                        ) : (
                          <AdminButton
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => void runMutation(() => deleteRentOrderExpense(orderId, expense.id))}
                          >
                            Видалити
                          </AdminButton>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </FinanceTable>
          )}
        </div>
      </AdminAccordionSection>
      ) : null}

      {visibleSections.has("worker") ? renderWorkerSection() : null}

      {mode === "order-detail" && insertAfterWorkerContent ? insertAfterWorkerContent : null}
    </div>
  );
}
