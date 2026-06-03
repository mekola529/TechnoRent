import { useState, useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../api/client";
import { AdminTableRowsSkeleton } from "../components/Skeleton";
import {
  AdminAccordionSection,
  AdminPageHeader,
  AdminButton,
  AdminCard,
  AdminFilterBar,
  AdminSelect,
  AdminInput,
  AdminTextarea,
  StatusBadge,
  ConfirmModal,
} from "../components/admin";
import type { Status } from "../components/admin/StatusBadge";
import AddressAutocompleteInput from "../components/AddressAutocompleteInput";
import OrderFinancePanel from "../components/admin/order-finance/OrderFinancePanel";
import type { RentOrderFinance } from "../data/types";

/* ── Types ── */

interface EquipmentRef {
  id: string;
  name: string;
  slug: string;
  trackerDevice?: ExecutionTrackerRef | null;
}

interface SourceRequestRef {
  id: string;
  customerName: string;
  phone: string;
}

interface MaterialDeliverySnapshot {
  servicePricingType?: "material_delivery_calculator";
  calculationMode?: string | null;
  requestMode?: string | null;
  selectedMaterialName?: string | null;
  quantity?: number | null;
  unit?: string | null;
  deliveryRatePerKm?: number | null;
  materialCost?: number | null;
  deliveryCost?: number | null;
  totalEstimatedCost?: number | null;
  truckToPointKm?: number | null;
  pointToClientKm?: number | null;
  chosenSupplierPointName?: string | null;
  chosenSupplierPointAddress?: string | null;
  chosenSupplierPointCoordinates?: { lat?: number | null; lon?: number | null } | null;
  chosenOfferUnitPrice?: number | null;
  chosenEquipmentId?: string | null;
  chosenEquipmentName?: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  deliveryAddress?: string | null;
  deliveryCoordinates?: { lat?: number | null; lon?: number | null } | null;
  customerComment?: string | null;
}

interface TowCalculationSnapshot {
  selectedEquipmentId?: string | null;
  selectedTrackerId?: string | null;
  selectedEquipmentName?: string | null;
  selectedTrackerName?: string | null;
  destinationAddress?: string | null;
  towVehicleLabel?: string | null;
  truckCurrentPosition?: string | null;
  truckDispatchDistance?: string | null;
  truckDispatchEta?: string | null;
  clientRouteDistance?: string | null;
  clientRouteEta?: string | null;
  totalRouteDistance?: string | null;
  tariffLabel?: string | null;
  estimatedCost?: string | null;
  customerComment?: string | null;
}

interface AttributionTouchSnapshot {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  ttclid?: string | null;
  trackingCode?: string | null;
  referrer?: string | null;
  landingPage?: string | null;
  capturedAt?: string | null;
}

interface LeadAttributionSnapshot {
  firstTouch?: AttributionTouchSnapshot | null;
  lastTouch?: AttributionTouchSnapshot | null;
  formPage?: string | null;
}

interface AttributionSummary extends LeadAttributionSnapshot {
  trafficSource?: string | null;
  trackingCode?: string | null;
  trackingLinkId?: string | null;
  trackingLinkName?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  referrer?: string | null;
  landingPage?: string | null;
  createdAt?: string | null;
}

interface SourceCustomerRequestRef {
  id: string;
  customerName: string;
  phone: string;
  requestType: string;
  addressFrom: string | null;
  addressTo: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  comment: string | null;
  attribution?: AttributionSummary | null;
  metadata: {
    serviceName?: string | null;
    attribution?: LeadAttributionSnapshot | null;
    tow?: TowCalculationSnapshot | null;
    materialDelivery?: MaterialDeliverySnapshot | null;
  } | null;
}

interface AssignmentEmployeeRef {
  id: string;
  fullName: string;
  role: string | null;
  phone: string | null;
  telegramChatId: string | null;
  telegramUserId: string | null;
}

interface WorkAssignment {
  id: string;
  employeeId: string;
  orderId: string;
  equipmentId: string | null;
  status: string;
  completionStatus?: string | null;
  completedAt?: string | null;
  completionComment?: string | null;
  plannedNextStartAt?: string | null;
  plannedDurationMinutes?: number | null;
  assignedAt: string;
  respondedAt: string | null;
  responseComment: string | null;
  declineReason: string | null;
  telegramMessageId: string | null;
  employee: AssignmentEmployeeRef | null;
  equipment?: ExecutionEquipmentRef | null;
}

interface ExecutionEquipmentRef {
  id: string;
  name: string;
  slug: string;
  trackerDevice?: ExecutionTrackerRef | null;
}

interface ExecutionTrackerRef {
  id: string;
  name: string;
  lastAddress: string | null;
}

interface WorkExecutionSession {
  id: string;
  assignmentId: string | null;
  status: string;
  sequenceNumber?: number | null;
  shiftLabel?: string | null;
  isFinalSession?: boolean | null;
  sessionComment?: string | null;
  plannedDurationMinutes?: number | null;
  durationDeltaMinutes?: number | null;
  durationStatus?: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  startedVia: string | null;
  finishedVia: string | null;
  equipment: ExecutionEquipmentRef | null;
  trackerDevice: ExecutionTrackerRef | null;
}

interface WorkExecutionReport {
  id: string;
  executionSessionId: string;
  orderId?: string | null;
  assignmentId?: string | null;
  distanceKm: number | null;
  driveDurationMinutes: number | null;
  idleDurationMinutes: number | null;
  stopDurationMinutes: number | null;
  engineHours: number | null;
  cashCollected: boolean | null;
  cashAmount: number | null;
  extraExpensesAmount: number | null;
  extraExpensesComment: string | null;
  hadProblems: boolean | null;
  problemsComment: string | null;
  workerComment: string | null;
  workCompleted?: boolean | null;
  needsNextShift?: boolean | null;
  nextShiftComment?: string | null;
  questionnaireStep: string;
  questionnaireStatus: string;
  submittedAt: string | null;
  gpsSnapshotJson?: {
    source?: string | null;
    manualMetrics?: {
      distanceKm?: number | null;
      driveDurationMinutes?: number | null;
      stopDurationMinutes?: number | null;
      engineHours?: number | null;
      updatedAt?: string | null;
      updatedByAdminId?: string | null;
    } | null;
    equipmentMetrics?: Array<{
      equipmentId: string;
      equipmentName?: string | null;
      source?: string | null;
      trackerDeviceId?: string | null;
      distanceKm: number | null;
      driveDurationMinutes?: number | null;
      stopDurationMinutes?: number | null;
      engineHours: number | null;
      updatedAt?: string | null;
    }>;
    manualEquipmentMetrics?: Array<{
      equipmentId: string;
      distanceKm: number | null;
      driveDurationMinutes?: number | null;
      stopDurationMinutes?: number | null;
      engineHours: number | null;
      updatedAt?: string | null;
      updatedByAdminId?: string | null;
    }>;
  } | null;
}

interface OrderEventLog {
  id: string;
  eventType: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
  createdByAdmin: { email: string } | null;
  assignmentEmployeeName: string | null;
}

interface AdminRef {
  id: string;
  email: string;
  role: string;
}

interface RentOrderItem {
  id: string;
  equipmentId: string;
  equipment: EquipmentRef | null;
  startDate: string;
  endDate: string;
}

interface RentOrder {
  id: string;
  orderNumber: number | null;
  customerName: string;
  customerPhone: string;
  scheduledDate: string | null;
  scheduledDateTo: string | null;
  scheduledTimeFrom: string | null;
  scheduledTimeTo: string | null;
  agreedPrice: number | null;
  addressFrom: string | null;
  addressTo: string | null;
  items: RentOrderItem[];
  status: string;
  comment: string | null;
  finalAgreedPrice: number | null;
  finalCashCollected: number | null;
  finalExtraExpenses: number | null;
  managerCloseComment: string | null;
  managerClosedAt: string | null;
  managerClosedById?: string | null;
  managerClosedBy: AdminRef | null;
  showWorkerToCustomer: boolean;
  sourceType: string;
  sourceRequestId: string | null;
  sourceCustomerRequestId: string | null;
  sourceRequest: SourceRequestRef | null;
  sourceCustomerRequest: SourceCustomerRequestRef | null;
  assignments?: WorkAssignment[];
  latestAssignment: WorkAssignment | null;
  executionSessions?: WorkExecutionSession[];
  latestExecutionSession: WorkExecutionSession | null;
  executionMetricEquipment?: ExecutionEquipmentRef[];
  executionReports?: WorkExecutionReport[];
  latestExecutionReport: WorkExecutionReport | null;
  eventLogs?: OrderEventLog[];
  createdAt: string;
  updatedAt: string;
}

interface EquipmentOption {
  id: string;
  name: string;
  slug: string;
}

interface EmployeeOption {
  id: string;
  fullName: string;
  role: string | null;
  phone: string | null;
  telegramChatId: string | null;
  telegramUserId: string | null;
  isActive: boolean;
}

/* Form item — one equipment row */
interface FormItem {
  key: string; // unique key for React
  equipmentId: string;
  useCustomSchedule: boolean;
  scheduledDateFrom: string;
  scheduledDateTo: string;
  scheduledTimeFrom: string;
  scheduledTimeTo: string;
}

interface FormState {
  customerName: string;
  customerPhone: string;
  scheduledDate: string;
  scheduledDateTo: string;
  scheduledTimeFrom: string;
  scheduledTimeTo: string;
  agreedPrice: string;
  addressFrom: string;
  addressTo: string;
  items: FormItem[];
  status: string;
  comment: string;
  sourceType: string;
  sourceRequestId: string;
  sourceCustomerRequestId: string;
}

interface ItemError {
  equipmentId?: string;
  scheduledDateFrom?: string;
  scheduledDateTo?: string;
  scheduledTimeFrom?: string;
  scheduledTimeTo?: string;
}

interface FieldErrors {
  customerName?: string;
  customerPhone?: string;
  items?: Record<number, ItemError>;
  itemsGlobal?: string;
}

interface AvailabilityIssue {
  type: "equipment" | "employee" | "missing_time" | "missing_equipment" | string;
  severity?: "critical" | "warning" | string;
  periodIndex?: number;
  equipmentName?: string | null;
  employeeName?: string | null;
  orderNumber?: string | number | null;
  customerName?: string | null;
  status?: string | null;
  from?: string | null;
  to?: string | null;
  displayWithTime?: boolean;
  message: string;
}

interface AvailabilitySuggestion {
  type: "nearest_free_slot" | "alternative_equipment" | string;
  periodIndex?: number;
  equipmentId?: string | null;
  equipmentName?: string | null;
  equipmentType?: string | null;
  from?: string | null;
  to?: string | null;
  scheduledDate?: string | null;
  scheduledDateTo?: string | null;
  scheduledTimeFrom?: string | null;
  scheduledTimeTo?: string | null;
  displayWithTime?: boolean;
  message: string;
}

interface AvailabilityCheckResult {
  status: "available" | "warning" | "conflict" | "insufficient";
  checkedPeriods: Array<{
    periodIndex: number;
    equipmentId: string | null;
    from: string | null;
    to: string | null;
    source: "item" | "order";
  }>;
  conflicts: AvailabilityIssue[];
  warnings: AvailabilityIssue[];
  suggestions?: AvailabilitySuggestion[];
}

interface ManagerCloseFormState {
  finalAgreedPrice: string;
  finalCashCollected: string;
  finalExtraExpenses: string;
  managerCloseComment: string;
}

interface ManualExecutionMetricsFormState {
  distanceKm: string;
  driveDurationMinutes: string;
  stopDurationMinutes: string;
  engineHours: string;
  perEquipmentMetrics: Array<{
    equipmentId: string;
    equipmentName: string;
    distanceKm: string;
    driveDurationMinutes: string;
    stopDurationMinutes: string;
    engineHours: string;
  }>;
}

type WorkerCompensationType = "fixed" | "hourly" | "shift" | "percent" | "manual";

interface AssignmentCompensationFormState {
  type: WorkerCompensationType;
  rate: string;
  quantity: string;
  percent: string;
  finalAmount: string;
  comment: string;
}

interface NextShiftPlanningFormState {
  plannedNextStartAt: string;
  plannedDurationHours: string;
  completionComment: string;
}

/* ── Constants ── */

const statusMap: Record<string, { badge: Status; label: string }> = {
  NEW:       { badge: "new",       label: "Нове" },
  CONFIRMED: { badge: "confirmed", label: "Підтверджене" },
  ACTIVE:    { badge: "active",    label: "Активне" },
  WORKER_COMPLETED: { badge: "inactive", label: "Завершено робітником" },
  COMPLETED: { badge: "completed", label: "Завершене" },
  CANCELLED: { badge: "cancelled", label: "Скасоване" },
};

const allStatuses = ["NEW", "CONFIRMED", "ACTIVE", "WORKER_COMPLETED", "COMPLETED", "CANCELLED"];
const assignmentStatusLabels: Record<string, string> = {
  PENDING: "Очікує відповіді",
  ACCEPTED: "Прийнято",
  DECLINED: "Відхилено",
  CANCELLED: "Скасовано",
  REASSIGNED: "Перепризначено",
};

const assignmentCompletionStatusLabels: Record<string, string> = {
  PENDING: "Очікує старту",
  ACCEPTED: "Прийнято",
  IN_PROGRESS: "В роботі",
  AWAITING_NEXT_SHIFT: "Очікує наступну зміну",
  COMPLETED: "Завершено повністю",
  DECLINED: "Відхилено",
};

const executionStatusLabels: Record<string, string> = {
  NOT_STARTED: "Не розпочато",
  IN_PROGRESS: "Виконується",
  FINISHED: "Завершено робітником",
};

const workerCompensationTypeLabels: Record<WorkerCompensationType, string> = {
  fixed: "Фіксовано",
  hourly: "За годину",
  shift: "За зміну",
  percent: "Відсоток",
  manual: "Ручна сума",
};

let keyCounter = 0;
function newItemKey() {
  return `item_${++keyCounter}`;
}

function makeEmptyItem(): FormItem {
  return {
    key: newItemKey(),
    equipmentId: "",
    useCustomSchedule: false,
    scheduledDateFrom: "",
    scheduledDateTo: "",
    scheduledTimeFrom: "",
    scheduledTimeTo: "",
  };
}

const emptyForm: FormState = {
  customerName: "",
  customerPhone: "",
  scheduledDate: "",
  scheduledDateTo: "",
  scheduledTimeFrom: "",
  scheduledTimeTo: "",
  agreedPrice: "",
  addressFrom: "",
  addressTo: "",
  items: [makeEmptyItem()],
  status: "NEW",
  comment: "",
  sourceType: "manual",
  sourceRequestId: "",
  sourceCustomerRequestId: "",
};

const emptyManagerCloseForm: ManagerCloseFormState = {
  finalAgreedPrice: "",
  finalCashCollected: "",
  finalExtraExpenses: "",
  managerCloseComment: "",
};

const emptyManualExecutionMetricsForm: ManualExecutionMetricsFormState = {
  distanceKm: "",
  driveDurationMinutes: "",
  stopDurationMinutes: "",
  engineHours: "",
  perEquipmentMetrics: [],
};

const emptyAssignmentCompensationForm: AssignmentCompensationFormState = {
  type: "fixed",
  rate: "",
  quantity: "",
  percent: "",
  finalAmount: "",
  comment: "",
};

const emptyNextShiftPlanningForm: NextShiftPlanningFormState = {
  plannedNextStartAt: "",
  plannedDurationHours: "",
  completionComment: "",
};

function buildManualEquipmentMetricRows(order: RentOrder) {
  const snapshotMetrics = order.latestExecutionReport?.gpsSnapshotJson?.manualEquipmentMetrics ?? [];
  const metricByEquipment = new Map<string, {
    distanceKm: string;
    driveDurationMinutes: string;
    stopDurationMinutes: string;
    engineHours: string;
  }>(
    snapshotMetrics.map((metric) => [
      metric.equipmentId,
      {
        distanceKm: metric.distanceKm == null ? "" : String(metric.distanceKm),
        driveDurationMinutes: metric.driveDurationMinutes == null ? "" : String(metric.driveDurationMinutes),
        stopDurationMinutes: metric.stopDurationMinutes == null ? "" : String(metric.stopDurationMinutes),
        engineHours: metric.engineHours == null ? "" : String(metric.engineHours),
      },
    ]),
  );
  const primaryEquipmentId = order.latestExecutionSession?.equipment?.id ?? null;
  const equipmentList = (order.executionMetricEquipment ?? []).filter((item) => item.id !== primaryEquipmentId);

  return equipmentList.map((equipment) => ({
    equipmentId: equipment.id,
    equipmentName: equipment.name,
    distanceKm: metricByEquipment.get(equipment.id)?.distanceKm ?? "",
    driveDurationMinutes: metricByEquipment.get(equipment.id)?.driveDurationMinutes == null
      ? ""
      : String(metricByEquipment.get(equipment.id)?.driveDurationMinutes),
    stopDurationMinutes: metricByEquipment.get(equipment.id)?.stopDurationMinutes == null
      ? ""
      : String(metricByEquipment.get(equipment.id)?.stopDurationMinutes),
    engineHours: metricByEquipment.get(equipment.id)?.engineHours ?? "",
  }));
}

function buildExecutionEquipmentRows(order: RentOrder) {
  const report = order.latestExecutionReport;
  const gpsSnapshot = report?.gpsSnapshotJson ?? null;
  const manualEquipmentMetrics = gpsSnapshot?.manualEquipmentMetrics ?? [];
  const manualByEquipment = new Map(manualEquipmentMetrics.map((item) => [item.equipmentId, item]));
  const gpsEquipmentMetrics = gpsSnapshot?.equipmentMetrics ?? [];
  const gpsByEquipment = new Map(gpsEquipmentMetrics.map((item) => [item.equipmentId, item]));

  const rows = [] as Array<{
    equipmentId: string;
    equipmentName: string;
    sourceLabel: string;
    sourceTone: Status;
    distanceKm: number | null;
    driveDurationMinutes: number | null;
    stopDurationMinutes: number | null;
    engineHours: number | null;
    hasManualOverride: boolean;
  }>;

  const primaryEquipment = order.latestExecutionSession?.equipment;
  if (primaryEquipment) {
    const manualMetrics = gpsSnapshot?.manualMetrics ?? null;
    const hasManualOverride =
      manualMetrics != null &&
      (
        (manualMetrics.distanceKm ?? null) != null ||
        (manualMetrics.driveDurationMinutes ?? null) != null ||
        (manualMetrics.stopDurationMinutes ?? null) != null ||
        (manualMetrics.engineHours ?? null) != null
      );
    rows.push({
      equipmentId: primaryEquipment.id,
      equipmentName: primaryEquipment.name,
      sourceLabel: hasManualOverride ? "Вручну" : "GPS",
      sourceTone: hasManualOverride ? "confirmed" : "active",
      distanceKm: hasManualOverride ? manualMetrics?.distanceKm ?? null : report?.distanceKm ?? null,
      driveDurationMinutes: hasManualOverride
        ? manualMetrics?.driveDurationMinutes ?? report?.driveDurationMinutes ?? null
        : report?.driveDurationMinutes ?? null,
      stopDurationMinutes: hasManualOverride
        ? manualMetrics?.stopDurationMinutes ?? report?.stopDurationMinutes ?? null
        : report?.stopDurationMinutes ?? null,
      engineHours: hasManualOverride ? manualMetrics?.engineHours ?? null : report?.engineHours ?? null,
      hasManualOverride,
    });
  }

  for (const equipment of order.executionMetricEquipment ?? []) {
    if (equipment.id === primaryEquipment?.id) continue;
    const manualMetric = manualByEquipment.get(equipment.id);
    const gpsMetric = gpsByEquipment.get(equipment.id);
    const hasManualOverride =
      manualMetric != null &&
      (
        (manualMetric.distanceKm ?? null) != null ||
        (manualMetric.driveDurationMinutes ?? null) != null ||
        (manualMetric.stopDurationMinutes ?? null) != null ||
        (manualMetric.engineHours ?? null) != null
      );
    rows.push({
      equipmentId: equipment.id,
      equipmentName: equipment.name,
      sourceLabel: hasManualOverride ? "Вручну" : gpsMetric ? "GPS" : "Немає даних",
      sourceTone: hasManualOverride ? "confirmed" : gpsMetric ? "active" : "inactive",
      distanceKm: hasManualOverride ? manualMetric?.distanceKm ?? null : gpsMetric?.distanceKm ?? null,
      driveDurationMinutes: hasManualOverride
        ? manualMetric?.driveDurationMinutes ?? gpsMetric?.driveDurationMinutes ?? null
        : gpsMetric?.driveDurationMinutes ?? null,
      stopDurationMinutes: hasManualOverride
        ? manualMetric?.stopDurationMinutes ?? gpsMetric?.stopDurationMinutes ?? null
        : gpsMetric?.stopDurationMinutes ?? null,
      engineHours: hasManualOverride ? manualMetric?.engineHours ?? null : gpsMetric?.engineHours ?? null,
      hasManualOverride,
    });
  }

  return rows;
}

function getOrderEquipmentList(order: RentOrder) {
  const items = order.items.map((item) => ({
    id: item.equipmentId,
    name: item.equipment?.name ?? "—",
    trackerDevice: item.equipment?.trackerDevice ?? null,
  }));
  const extras = (order.executionMetricEquipment ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    trackerDevice: item.trackerDevice ?? null,
  }));

  const byId = new Map<string, { id: string; name: string; trackerDevice: ExecutionTrackerRef | null }>();
  [...items, ...extras].forEach((item) => {
    if (!item.id) return;
    if (!byId.has(item.id)) {
      byId.set(item.id, item);
      return;
    }

    const current = byId.get(item.id);
    if (current && !current.trackerDevice && item.trackerDevice) {
      byId.set(item.id, item);
    }
  });

  return Array.from(byId.values());
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("uk");
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("uk") +
    " " +
    d.toLocaleTimeString("uk", { hour: "2-digit", minute: "2-digit" })
  );
}

function fmtMaybeNumber(value: number | null | undefined, suffix = "") {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return `${value}${suffix}`;
}

function fmtDurationMinutes(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  if (value >= 60) {
    const hours = Math.floor(value / 60);
    const minutes = Math.round(value % 60);
    return minutes > 0 ? `${hours} год ${minutes} хв` : `${hours} год`;
  }
  return `${Math.round(value)} хв`;
}

function formatDurationComparison(session: Pick<WorkExecutionSession, "durationStatus" | "durationDeltaMinutes">) {
  if (!session.durationStatus || session.durationDeltaMinutes == null) return "—";
  const diff = Math.abs(Number(session.durationDeltaMinutes));
  if (session.durationStatus === "faster") return `Швидше плану на ${fmtDurationMinutes(diff)}`;
  if (session.durationStatus === "slower") return `Пізніше плану на ${fmtDurationMinutes(diff)}`;
  return "У межах плану";
}

function getExecutionActualDurationMinutes(session: Pick<WorkExecutionSession, "startedAt" | "finishedAt">) {
  if (!session.startedAt || !session.finishedAt) return null;
  const startedAt = new Date(session.startedAt).getTime();
  const finishedAt = new Date(session.finishedAt).getTime();
  if (Number.isNaN(startedAt) || Number.isNaN(finishedAt) || finishedAt <= startedAt) return null;
  return Math.round((finishedAt - startedAt) / 60_000);
}

function getSignificantDurationDeviations(sessions: WorkExecutionSession[]) {
  return sessions.filter((session) => {
    if (session.durationDeltaMinutes == null) return false;
    return Math.abs(Number(session.durationDeltaMinutes)) > 60;
  });
}

function fmtMoney(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(value)} грн`;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function parseNullableNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function calculateAssignmentCompensationPreview(
  form: AssignmentCompensationFormState,
  orderTotal: number,
) {
  const finalAmount = parseNullableNumber(form.finalAmount);
  if (finalAmount != null) {
    return roundMoney(finalAmount);
  }

  if (form.type === "percent") {
    return roundMoney(orderTotal * ((parseNullableNumber(form.percent) ?? 0) / 100));
  }

  if (form.type === "hourly" && parseNullableNumber(form.quantity) == null) {
    return 0;
  }

  const rate = parseNullableNumber(form.rate) ?? 0;
  const quantity = parseNullableNumber(form.quantity) ?? 1;
  return roundMoney(rate * quantity);
}

function fmtKm(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 1 }).format(value)} км`;
}

function formatMaterialDeliveryMode(value: string | null | undefined) {
  if (value === "urgent_live") return "Чим швидше: від поточного GPS";
  if (value === "scheduled_base") return "Заплановано: від бази техніки";
  return value ?? "—";
}

function getExecutionSessionMap(order: RentOrder) {
  const map = new Map<string, WorkExecutionSession>();
  (order.executionSessions ?? []).forEach((session) => {
    if (!session.assignmentId || map.has(session.assignmentId)) return;
    map.set(session.assignmentId, session);
  });
  return map;
}

function getExecutionSessionsByAssignment(order: RentOrder) {
  const map = new Map<string, WorkExecutionSession[]>();
  (order.executionSessions ?? []).forEach((session) => {
    if (!session.assignmentId) return;
    const list = map.get(session.assignmentId) ?? [];
    list.push(session);
    map.set(session.assignmentId, list);
  });
  return map;
}

function getExecutionReportMap(order: RentOrder) {
  const map = new Map<string, WorkExecutionReport>();
  (order.executionReports ?? []).forEach((report) => {
    if (!report.assignmentId || map.has(report.assignmentId)) return;
    map.set(report.assignmentId, report);
  });
  return map;
}

function getExecutionReportsBySession(order: RentOrder) {
  const map = new Map<string, WorkExecutionReport[]>();
  (order.executionReports ?? []).forEach((report) => {
    const list = map.get(report.executionSessionId) ?? [];
    list.push(report);
    map.set(report.executionSessionId, list);
  });
  return map;
}

function getAssignmentExecutionSummary(
  assignmentId: string,
  sessions: WorkExecutionSession[],
  reportsBySession: Map<string, WorkExecutionReport[]>,
) {
  const summary = {
    totalSessions: sessions.length,
    finishedSessions: 0,
    reportsSubmitted: 0,
    totalDistanceKm: 0,
    totalDriveDurationMinutes: 0,
    totalStopDurationMinutes: 0,
    totalEngineHours: 0,
    hasDistance: false,
    hasDriveDuration: false,
    hasStopDuration: false,
    hasEngineHours: false,
    latestSubmittedAt: null as string | null,
    lastShiftResult: "—",
  };

  for (const session of sessions) {
    if (session.status === "FINISHED") {
      summary.finishedSessions += 1;
    }
    const report = (reportsBySession.get(session.id) ?? [])[0] ?? null;
    if (!report) continue;

    if (report.questionnaireStatus === "COMPLETED") {
      summary.reportsSubmitted += 1;
    }

    if (report.distanceKm != null && Number.isFinite(report.distanceKm)) {
      summary.totalDistanceKm += Number(report.distanceKm);
      summary.hasDistance = true;
    }
    if (report.driveDurationMinutes != null && Number.isFinite(report.driveDurationMinutes)) {
      summary.totalDriveDurationMinutes += Number(report.driveDurationMinutes);
      summary.hasDriveDuration = true;
    }
    if (report.stopDurationMinutes != null && Number.isFinite(report.stopDurationMinutes)) {
      summary.totalStopDurationMinutes += Number(report.stopDurationMinutes);
      summary.hasStopDuration = true;
    }
    if (report.engineHours != null && Number.isFinite(report.engineHours)) {
      summary.totalEngineHours += Number(report.engineHours);
      summary.hasEngineHours = true;
    }

    if (report.submittedAt && (!summary.latestSubmittedAt || report.submittedAt > summary.latestSubmittedAt)) {
      summary.latestSubmittedAt = report.submittedAt;
    }

    if (session.assignmentId === assignmentId) {
      if (report.needsNextShift) {
        summary.lastShiftResult = "Потрібен ще виїзд";
      } else if (report.workCompleted) {
        summary.lastShiftResult = "Завершено повністю";
      }
    }
  }

  return summary;
}

function getExecutionSessionFinanceSummary(
  executionSessionId: string,
  finance: RentOrderFinance | null,
) {
  const payments = (finance?.payments ?? []).filter((payment) => payment.executionSessionId === executionSessionId);
  const expenses = (finance?.expenses ?? []).filter((expense) => expense.executionSessionId === executionSessionId);
  const clientCash = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const systemFuelExpenses = expenses.filter((expense) => expense.type === "fuel" && expense.source === "system");
  const employeeExpenses = expenses.filter((expense) => expense.source === "employee" && expense.type !== "fuel_purchase");
  const fuelPurchaseCompensations = expenses.filter((expense) => expense.type === "fuel_purchase");

  return {
    payments,
    expenses,
    clientCash: roundMoney(clientCash),
    systemFuelAmount: roundMoney(systemFuelExpenses.reduce((sum, expense) => sum + expense.amount, 0)),
    systemFuelLiters: roundMoney(systemFuelExpenses.reduce((sum, expense) => sum + (expense.fuelLiters ?? 0), 0)),
    employeeExpensesAmount: roundMoney(employeeExpenses.reduce((sum, expense) => sum + expense.amount, 0)),
    fuelPurchaseCompensationAmount: roundMoney(
      fuelPurchaseCompensations.reduce((sum, expense) => sum + expense.amount, 0),
    ),
    totalExpenses: roundMoney(expenses.reduce((sum, expense) => sum + expense.amount, 0)),
  };
}

function getOrderOperationalOverview(order: RentOrder) {
  const relevantAssignments = (order.assignments ?? []).filter((assignment) => assignment.status !== "DECLINED");
  const acceptedAssignments = relevantAssignments.filter((assignment) => assignment.status === "ACCEPTED");
  const pendingAssignments = relevantAssignments.filter((assignment) => assignment.status === "PENDING");
  const executionByAssignment = getExecutionSessionMap(order);
  const reportsByAssignment = getExecutionReportMap(order);
  const completedAssignments = acceptedAssignments.filter(
    (assignment) => assignment.completionStatus === "COMPLETED",
  );
  const awaitingNextShiftAssignments = acceptedAssignments.filter(
    (assignment) => assignment.completionStatus === "AWAITING_NEXT_SHIFT",
  );

  const inProgressAssignments = acceptedAssignments.filter(
    (assignment) =>
      assignment.completionStatus === "IN_PROGRESS" ||
      executionByAssignment.get(assignment.id)?.status === "IN_PROGRESS",
  );
  const finishedAssignments = acceptedAssignments.filter(
    (assignment) => executionByAssignment.get(assignment.id)?.status === "FINISHED",
  );
  const completedReports = acceptedAssignments.filter(
    (assignment) => reportsByAssignment.get(assignment.id)?.questionnaireStatus === "COMPLETED",
  );

  const readyToClose =
    relevantAssignments.length > 0 &&
    acceptedAssignments.length === relevantAssignments.length &&
    completedAssignments.length === acceptedAssignments.length;

  return {
    relevantAssignments,
    acceptedAssignments,
    pendingAssignments,
    inProgressAssignments,
    finishedAssignments,
    completedReports,
    completedAssignments,
    awaitingNextShiftAssignments,
    readyToClose,
    executionByAssignment,
    reportsByAssignment,
    executionSessionsByAssignment: getExecutionSessionsByAssignment(order),
    executionReportsBySession: getExecutionReportsBySession(order),
  };
}

function canManagerCloseOrder(order: RentOrder) {
  return getOrderOperationalOverview(order).readyToClose;
}

function getFlowSteps(order: RentOrder) {
  const overview = getOrderOperationalOverview(order);
  const assignmentCount = overview.relevantAssignments.length;
  const acceptedCount = overview.acceptedAssignments.length;
  const pendingCount = overview.pendingAssignments.length;
  const inProgressCount = overview.inProgressAssignments.length;
  const finishedCount = overview.finishedAssignments.length;
  const completedReportCount = overview.completedReports.length;
  const completedAssignmentsCount = overview.completedAssignments.length;
  const awaitingNextShiftCount = overview.awaitingNextShiftAssignments.length;

  return [
    {
      label: "Призначення",
      state:
        assignmentCount === 0
          ? "waiting"
          : pendingCount > 0
            ? "active"
            : acceptedCount === assignmentCount
              ? "done"
              : "blocked",
      detail:
        assignmentCount === 0
          ? "Працівників ще не призначено"
          : `Усього ${assignmentCount} • прийнято ${acceptedCount}${pendingCount > 0 ? ` • очікує ${pendingCount}` : ""}`,
    },
    {
      label: "Виконання",
      state:
        acceptedCount === 0
          ? "blocked"
          : completedAssignmentsCount === acceptedCount && acceptedCount > 0
            ? "done"
            : inProgressCount > 0 || awaitingNextShiftCount > 0
              ? "active"
              : "waiting",
      detail:
        acceptedCount === 0
          ? "Очікує прийняття призначення"
          : `Завершено повністю ${completedAssignmentsCount} з ${acceptedCount}${inProgressCount > 0 ? ` • в роботі ${inProgressCount}` : ""}${awaitingNextShiftCount > 0 ? ` • чекає зміну ${awaitingNextShiftCount}` : ""}`,
    },
    {
      label: "Анкета",
      state:
        completedReportCount >= completedAssignmentsCount && completedAssignmentsCount === acceptedCount && acceptedCount > 0
          ? "done"
          : finishedCount > 0 || awaitingNextShiftCount > 0
            ? "active"
            : "waiting",
      detail:
        finishedCount === 0 && awaitingNextShiftCount === 0
          ? "З’явиться після завершення виконання"
          : `Заповнено ${completedReportCount} • завершено повністю ${completedAssignmentsCount} з ${acceptedCount}`,
    },
    {
      label: "Закриття",
      state: order.status === "COMPLETED" ? "done" : canManagerCloseOrder(order) ? "active" : "waiting",
      detail: order.status === "COMPLETED"
        ? `Закрито${order.managerClosedAt ? ` • ${fmtDateTime(order.managerClosedAt)}` : ""}`
        : canManagerCloseOrder(order)
          ? "Готове до фінального закриття менеджером"
          : "Недоступно до завершення анкети",
    },
  ] as const;
}

function formatEventType(eventType: string) {
  const map: Record<string, string> = {
    manager_created_order: "Менеджер створив замовлення",
    manager_updated_order: "Менеджер оновив замовлення",
    manager_status_changed: "Менеджер змінив статус",
    worker_assigned: "Працівника призначено",
    worker_assignment_notification_sent: "Завдання відправлено працівнику",
    worker_assignment_accepted: "Працівник прийняв завдання",
    worker_assignment_declined: "Працівник відхилив завдання",
    worker_execution_started: "Працівник розпочав виконання",
    worker_execution_finished: "Працівник завершив виконання",
    worker_report_submitted: "Працівник подав підсумковий звіт",
    manager_planned_next_shift: "Менеджер запланував наступну зміну",
    manager_closed_order: "Менеджер фінально закрив замовлення",
  };
  return map[eventType] ?? eventType;
}

function summarizeEvent(event: OrderEventLog) {
  const payload = event.payload ?? {};
  if (event.eventType === "worker_assigned") {
    return payload.employeeName ? `Виконавець: ${String(payload.employeeName)}` : "Працівника призначено";
  }
  if (event.eventType === "worker_assignment_notification_sent") {
    const count = Array.isArray(payload.assignmentIds) ? payload.assignmentIds.length : null;
    return `Telegram: ${payload.employeeName ? String(payload.employeeName) : "працівник"}${
      count ? ` • робіт: ${count}` : ""
    }`;
  }
  if (event.eventType === "worker_assignment_declined") {
    return payload.responseComment ? `Коментар: ${String(payload.responseComment)}` : "Працівник відхилив призначення";
  }
  if (event.eventType === "worker_assignment_accepted") {
    return payload.responseComment ? `Коментар: ${String(payload.responseComment)}` : "Працівник підтвердив призначення";
  }
  if (event.eventType === "worker_execution_finished") {
    const status = payload.durationStatus ? String(payload.durationStatus) : "";
    const diff = payload.durationDeltaMinutes == null ? null : Math.abs(Number(payload.durationDeltaMinutes));
    if (status === "faster" && diff != null) return `Виконано швидше плану на ${fmtDurationMinutes(diff)}`;
    if (status === "slower" && diff != null) return `Виконано пізніше плану на ${fmtDurationMinutes(diff)}`;
    if (status === "on_time") return "Виконано в межах планового часу";
    return "Працівник завершив виконання";
  }
  if (event.eventType === "manager_closed_order") {
    const parts = [
      payload.finalAgreedPrice != null ? `Ціна: ${payload.finalAgreedPrice} грн` : null,
      payload.finalCashCollected != null ? `Готівка: ${payload.finalCashCollected} грн` : null,
      payload.finalExtraExpenses != null ? `Витрати: ${payload.finalExtraExpenses} грн` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" • ") : "Замовлення закрито менеджером";
  }
  if (event.eventType === "manager_created_order") {
    return payload.itemCount != null ? `Позицій: ${String(payload.itemCount)}` : "Замовлення створено";
  }
  if (event.eventType === "manager_updated_order") {
    return payload.itemsReplaced ? "Оновлено дані та позиції замовлення" : "Оновлено дані замовлення";
  }
  if (event.eventType === "manager_status_changed") {
    return payload.from && payload.to ? `${String(payload.from)} → ${String(payload.to)}` : "Статус змінено";
  }
  if (event.eventType === "manager_planned_next_shift") {
    const parts = [
      payload.previousCompletionStatus ? `Було: ${String(payload.previousCompletionStatus)}` : null,
      payload.plannedNextStartAt ? `Наступна зміна: ${fmtDateTime(String(payload.plannedNextStartAt))}` : null,
      payload.plannedDurationMinutes != null ? `План: ${fmtDurationMinutes(Number(payload.plannedDurationMinutes))}` : null,
      payload.completionComment ? `Коментар: ${String(payload.completionComment)}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" • ") : "Заплановано наступну зміну";
  }
  return event.assignmentEmployeeName
    ? `Працівник: ${event.assignmentEmployeeName}`
    : event.createdByAdmin?.email
      ? `Менеджер: ${event.createdByAdmin.email}`
      : "Подія зафіксована";
}

function getTowDetailsFromSourceRequest(source: SourceCustomerRequestRef | null) {
  const tow = source?.metadata?.tow;
  if (!tow) return null;

  return [
    source?.addressFrom ? { label: "Звідки забрати", value: source.addressFrom } : null,
    (tow.destinationAddress ?? source?.addressTo)
      ? { label: "Куди доставити", value: tow.destinationAddress ?? source?.addressTo ?? "" }
      : null,
    tow.towVehicleLabel ? { label: "Евакуатор", value: tow.towVehicleLabel } : null,
    tow.truckDispatchDistance ? { label: "Подача евакуатора", value: tow.truckDispatchDistance } : null,
    tow.truckDispatchEta ? { label: "Час подачі", value: tow.truckDispatchEta } : null,
    tow.clientRouteDistance ? { label: "Маршрут клієнта", value: tow.clientRouteDistance } : null,
    tow.clientRouteEta ? { label: "Час евакуації", value: tow.clientRouteEta } : null,
    tow.totalRouteDistance ? { label: "Загальний маршрут", value: tow.totalRouteDistance } : null,
    tow.tariffLabel ? { label: "Тариф", value: tow.tariffLabel } : null,
    tow.estimatedCost ? { label: "Орієнтовна вартість", value: tow.estimatedCost } : null,
    tow.customerComment ? { label: "Коментар клієнта", value: tow.customerComment } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;
}

function getMaterialDeliveryDetailsFromSourceRequest(source: SourceCustomerRequestRef | null) {
  const materialDelivery = source?.metadata?.materialDelivery;
  if (!materialDelivery || materialDelivery.servicePricingType !== "material_delivery_calculator") return null;

  const quantity = [
    materialDelivery.quantity != null
      ? new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(materialDelivery.quantity)
      : null,
    materialDelivery.unit ?? null,
  ].filter(Boolean).join(" ");

  return [
    materialDelivery.selectedMaterialName ? { label: "Матеріал", value: materialDelivery.selectedMaterialName } : null,
    quantity ? { label: "Кількість", value: quantity } : null,
    materialDelivery.deliveryAddress ?? source?.addressFrom
      ? { label: "Адреса доставки", value: materialDelivery.deliveryAddress ?? source?.addressFrom ?? "" }
      : null,
    { label: "Режим", value: formatMaterialDeliveryMode(materialDelivery.calculationMode ?? materialDelivery.requestMode) },
    materialDelivery.chosenEquipmentName ? { label: "Техніка", value: materialDelivery.chosenEquipmentName } : null,
    materialDelivery.chosenSupplierPointName ? { label: "Точка постачання", value: materialDelivery.chosenSupplierPointName } : null,
    materialDelivery.chosenSupplierPointAddress ? { label: "Адреса точки", value: materialDelivery.chosenSupplierPointAddress } : null,
    { label: "Матеріал", value: fmtMoney(materialDelivery.materialCost) },
    { label: "Доставка", value: fmtMoney(materialDelivery.deliveryCost) },
    { label: "Разом", value: fmtMoney(materialDelivery.totalEstimatedCost) },
    { label: "Техніка → точка", value: fmtKm(materialDelivery.truckToPointKm) },
    { label: "Точка → клієнт", value: fmtKm(materialDelivery.pointToClientKm) },
  ].filter(Boolean) as Array<{ label: string; value: string }>;
}

function formatAttributionChannel(touch: AttributionTouchSnapshot | null | undefined) {
  if (!touch) return "—";
  const parts = [touch.utmSource, touch.utmMedium, touch.utmCampaign].filter(Boolean);
  if (parts.length > 0) return parts.join(" / ");
  if (touch.trackingCode) return `tracking: ${touch.trackingCode}`;
  if (touch.referrer) return touch.referrer;
  return "—";
}

function getTrafficSourceLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    google_ads: "Google Ads",
    google_organic: "Google Organic",
    facebook: "Facebook",
    instagram: "Instagram",
    telegram: "Telegram",
    email: "Email",
    sms: "SMS",
    qr: "QR",
    referral: "Referral",
    direct: "Direct",
    unknown: "Unknown",
  };
  if (!value) return "—";
  return labels[value] ?? value;
}

function getAttributionDetailsFromSourceRequest(source: SourceCustomerRequestRef | null) {
  const attribution = source?.attribution ?? source?.metadata?.attribution;
  if (!attribution) return null;

  const first = attribution.firstTouch;
  const last = attribution.lastTouch;
  const trafficSource =
    "trafficSource" in attribution && typeof attribution.trafficSource === "string"
      ? attribution.trafficSource
      : null;
  const trackingLinkName =
    "trackingLinkName" in attribution && typeof attribution.trackingLinkName === "string"
      ? attribution.trackingLinkName
      : null;
  const trackingCode =
    "trackingCode" in attribution && typeof attribution.trackingCode === "string"
      ? attribution.trackingCode
      : last?.trackingCode ?? null;
  const landingPage =
    "landingPage" in attribution && typeof attribution.landingPage === "string"
      ? attribution.landingPage
      : last?.landingPage ?? null;
  const createdAt =
    "createdAt" in attribution && typeof attribution.createdAt === "string"
      ? attribution.createdAt
      : last?.capturedAt ?? null;

  return [
    trafficSource
      ? { label: "Тип джерела", value: getTrafficSourceLabel(trafficSource) }
      : null,
    trackingLinkName
      ? { label: "Tracking-посилання", value: trackingLinkName }
      : null,
    first ? { label: "First touch", value: formatAttributionChannel(first) } : null,
    last ? { label: "Last touch", value: formatAttributionChannel(last) } : null,
    trackingCode ? { label: "Tracking code", value: trackingCode } : null,
    landingPage ? { label: "Landing page", value: landingPage } : null,
    attribution.formPage ? { label: "Сторінка форми", value: attribution.formPage } : null,
    last?.utmContent ? { label: "UTM content", value: last.utmContent } : null,
    last?.utmTerm ? { label: "UTM term", value: last.utmTerm } : null,
    last?.gclid ? { label: "gclid", value: last.gclid } : null,
    last?.fbclid ? { label: "fbclid", value: last.fbclid } : null,
    last?.ttclid ? { label: "ttclid", value: last.ttclid } : null,
    last?.referrer ? { label: "Referrer", value: last.referrer } : null,
    createdAt
      ? { label: "Зафіксовано", value: new Date(createdAt).toLocaleString("uk-UA") }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;
}

function toInputDate(iso: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toInputDateTime(iso: string | null | undefined) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toInputTime(iso: string | null | undefined) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** Summarise equipment names for the list row */
function equipmentSummary(
  items: Array<{ name: string }>,
): string {
  if (items.length === 0) return "—";
  const first = items[0].name ?? "—";
  if (items.length === 1) return first;
  return `${first} +${items.length - 1}`;
}

function formatOrderNumber(order: Pick<RentOrder, "id" | "orderNumber">) {
  if (order.orderNumber !== null && order.orderNumber !== undefined) {
    return String(order.orderNumber);
  }
  return order.id.replace(/\D/g, "").slice(0, 8) || "0";
}

const RENT_ORDERS_BASE_PATH = "/admin/rent-orders";

function getOrderRouteKey(order: Pick<RentOrder, "id" | "orderNumber">) {
  return order.orderNumber !== null && order.orderNumber !== undefined
    ? String(order.orderNumber)
    : order.id;
}

function getOrderDetailPath(order: Pick<RentOrder, "id" | "orderNumber">) {
  return `${RENT_ORDERS_BASE_PATH}/${encodeURIComponent(getOrderRouteKey(order))}`;
}

/** Earliest start / latest end across items */
function periodSummary(items: RentOrderItem[]): string {
  if (items.length === 0) return "—";
  const starts = items.map((i) => new Date(i.startDate).getTime());
  const ends = items.map((i) => new Date(i.endDate).getTime());
  return `${fmtDate(new Date(Math.min(...starts)).toISOString())} — ${fmtDate(new Date(Math.max(...ends)).toISOString())}`;
}

function orderScheduleSummary(order: Pick<RentOrder, "scheduledDate" | "scheduledDateTo" | "scheduledTimeFrom" | "scheduledTimeTo" | "items">) {
  if (order.scheduledDate) {
    const dateFrom = new Date(order.scheduledDate).toLocaleDateString("uk-UA");
    const dateLabel = order.scheduledDateTo
      ? `${dateFrom} — ${new Date(order.scheduledDateTo).toLocaleDateString("uk-UA")}`
      : `від ${dateFrom}`;
    const parts = [dateLabel];
    if (order.scheduledTimeFrom && order.scheduledTimeTo) {
      parts.push(`${order.scheduledTimeFrom} — ${order.scheduledTimeTo}`);
    } else if (order.scheduledTimeFrom) {
      parts.push(`від ${order.scheduledTimeFrom}`);
    } else if (order.scheduledTimeTo) {
      parts.push(`до ${order.scheduledTimeTo}`);
    }
    return parts.join(" • ");
  }

  return periodSummary(order.items);
}

function buildAvailabilityItemPayload(order: RentOrder, item: RentOrderItem) {
  const orderDateFrom = order.scheduledDate ? toInputDate(order.scheduledDate) : "";
  const orderDateTo = order.scheduledDateTo ? toInputDate(order.scheduledDateTo) : orderDateFrom;
  const itemDateFrom = toInputDate(item.startDate);
  const itemDateTo = toInputDate(item.endDate);
  const itemTimeFrom = toInputTime(item.startDate);
  const itemTimeTo = toInputTime(item.endDate);
  const orderTimeFrom = order.scheduledTimeFrom ?? "";
  const orderTimeTo = order.scheduledTimeTo ?? "";

  const hasInheritedDate = Boolean(orderDateFrom) && itemDateFrom === orderDateFrom && itemDateTo === orderDateTo;
  const hasInheritedStartTime = orderTimeFrom ? itemTimeFrom === orderTimeFrom : itemTimeFrom === "00:00";
  const hasInheritedEndTime = orderTimeTo ? itemTimeTo === orderTimeTo : itemTimeTo === "23:59";

  if (hasInheritedDate && hasInheritedStartTime && hasInheritedEndTime) {
    return {
      equipmentId: item.equipmentId,
      useCustomSchedule: false,
    };
  }

  return {
    equipmentId: item.equipmentId,
    useCustomSchedule: true,
    scheduledDateFrom: itemDateFrom,
    scheduledDateTo: itemDateTo,
    scheduledTimeFrom: itemTimeFrom,
    scheduledTimeTo: itemTimeTo,
  };
}

function formatAvailabilityDateTime(value: string | null | undefined, withTime = true) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return withTime ? date.toLocaleString("uk-UA") : date.toLocaleDateString("uk-UA");
}

function formatAvailabilitySuggestionPeriod(suggestion: AvailabilitySuggestion) {
  if (suggestion.scheduledDate) {
    const from = new Date(`${suggestion.scheduledDate}T00:00:00`);
    const to = suggestion.scheduledDateTo ? new Date(`${suggestion.scheduledDateTo}T00:00:00`) : null;
    const dateLabel = Number.isNaN(from.getTime())
      ? suggestion.scheduledDate
      : from.toLocaleDateString("uk-UA");
    const dateToLabel = to && !Number.isNaN(to.getTime()) ? to.toLocaleDateString("uk-UA") : "";
    const timeLabel = suggestion.scheduledTimeFrom && suggestion.scheduledTimeTo
      ? `${suggestion.scheduledTimeFrom} — ${suggestion.scheduledTimeTo}`
      : suggestion.scheduledTimeFrom
        ? `від ${suggestion.scheduledTimeFrom}`
        : suggestion.scheduledTimeTo
          ? `до ${suggestion.scheduledTimeTo}`
          : "";
    return [dateToLabel ? `${dateLabel} — ${dateToLabel}` : dateLabel, timeLabel].filter(Boolean).join(" • ");
  }

  const withTime = suggestion.displayWithTime !== false;
  return [
    suggestion.from ? formatAvailabilityDateTime(suggestion.from, withTime) : "—",
    suggestion.to ? formatAvailabilityDateTime(suggestion.to, withTime) : "",
  ].filter(Boolean).join(" — ");
}

function availabilityStatusView(status: AvailabilityCheckResult["status"]): { label: string; badge: Status; text: string } {
  if (status === "conflict") {
    return { label: "Є конфлікт", badge: "cancelled", text: "Знайдено накладання з іншим замовленням." };
  }
  if (status === "warning") {
    return { label: "Є попередження", badge: "busy", text: "Є потенційні ризики по працівнику або неповні дані." };
  }
  if (status === "insufficient") {
    return { label: "Недостатньо даних", badge: "inactive", text: "Для повної перевірки потрібна техніка і дата виконання." };
  }
  return { label: "Вільно", badge: "available", text: "Накладань із поточними замовленнями не знайдено." };
}

function AvailabilityCheckPanel({
  result,
  loading,
  error,
  onApplySuggestion,
}: {
  result: AvailabilityCheckResult | null;
  loading: boolean;
  error: string;
  onApplySuggestion?: (suggestion: AvailabilitySuggestion) => void;
}) {
  if (!result && !loading && !error) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
        Обери техніку і дату, щоб перевірити накладання з іншими замовленнями.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
        Перевіряю доступність техніки та працівників…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
        {error}
      </div>
    );
  }

  if (!result) return null;

  const status = availabilityStatusView(result.status);
  const issues = [...result.conflicts, ...result.warnings];
  const suggestions = result.suggestions ?? [];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Доступність</h3>
          <p className="text-xs text-gray-500">{status.text}</p>
        </div>
        <StatusBadge status={status.badge} label={status.label} />
      </div>

      {issues.length > 0 ? (
        <div className="flex flex-col gap-2">
          {issues.map((issue, index) => (
            <div
              key={`${issue.type}-${issue.periodIndex ?? "x"}-${index}`}
              className={`rounded-lg border px-3 py-2 text-sm ${
                issue.severity === "critical"
                  ? "border-red-100 bg-red-50 text-red-800"
                  : "border-amber-100 bg-amber-50 text-amber-800"
              }`}
            >
              <div className="font-semibold">{issue.message}</div>
              {issue.orderNumber || issue.customerName || issue.from ? (
                <div className="mt-1 text-xs opacity-80">
                  {issue.orderNumber ? `Замовлення №${issue.orderNumber}` : ""}
                  {issue.customerName ? ` • ${issue.customerName}` : ""}
                  {issue.from ? ` • ${formatAvailabilityDateTime(issue.from, issue.displayWithTime !== false)}` : ""}
                  {issue.to ? ` — ${formatAvailabilityDateTime(issue.to, issue.displayWithTime !== false)}` : ""}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {suggestions.length > 0 ? (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-3">
          <div className="text-sm font-bold text-emerald-900">Рекомендації</div>
          <div className="mt-2 flex flex-col gap-2">
            {suggestions.map((suggestion, index) => (
              <div key={`${suggestion.type}-${suggestion.periodIndex ?? "x"}-${index}`} className="text-sm text-emerald-800">
                <span className="font-semibold">{suggestion.message}</span>
                {suggestion.from || suggestion.to ? (
                  <span className="block text-xs text-emerald-700">
                    {formatAvailabilitySuggestionPeriod(suggestion)}
                  </span>
                ) : null}
                {suggestion.type === "nearest_free_slot" && onApplySuggestion ? (
                  <AdminButton
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="mt-2 bg-white/80 text-emerald-800 hover:bg-white"
                    onClick={() => onApplySuggestion(suggestion)}
                  >
                    Змінити на цей період
                  </AdminButton>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ── Component ── */

export default function AdminRentOrdersPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { orderNumber } = useParams<{ orderNumber?: string }>();
  const routeOrderKey = orderNumber ? decodeURIComponent(orderNumber).trim() : "";

  const [items, setItems] = useState<RentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  /* View modes: "list" | "detail" | "form" */
  const [viewMode, setViewMode] = useState<"list" | "detail" | "form">("list");
  const [detailOrder, setDetailOrder] = useState<RentOrder | null>(null);
  const [detailFinance, setDetailFinance] = useState<RentOrderFinance | null>(null);
  const [routeOrderLoading, setRouteOrderLoading] = useState(() => Boolean(routeOrderKey));
  const [routeOrderError, setRouteOrderError] = useState("");

  const [editingItem, setEditingItem] = useState<RentOrder | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);
  const [availability, setAvailability] = useState<AvailabilityCheckResult | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [assignmentAvailability, setAssignmentAvailability] = useState<AvailabilityCheckResult | null>(null);
  const [assignmentAvailabilityLoading, setAssignmentAvailabilityLoading] = useState(false);
  const [assignmentAvailabilityError, setAssignmentAvailabilityError] = useState("");
  const [detailAvailability, setDetailAvailability] = useState<AvailabilityCheckResult | null>(null);
  const [detailAvailabilityLoading, setDetailAvailabilityLoading] = useState(false);
  const [detailAvailabilityError, setDetailAvailabilityError] = useState("");

  const [equipmentList, setEquipmentList] = useState<EquipmentOption[]>([]);
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [discardModalOpen, setDiscardModalOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [selectedAssignmentEquipmentId, setSelectedAssignmentEquipmentId] = useState("");
  const [workerManagerComment, setWorkerManagerComment] = useState("");
  const [assignmentPlannedDurationHours, setAssignmentPlannedDurationHours] = useState("");
  const [assignmentCompensationForm, setAssignmentCompensationForm] =
    useState<AssignmentCompensationFormState>(emptyAssignmentCompensationForm);
  const [assigning, setAssigning] = useState(false);
  const [notifyingEmployeeId, setNotifyingEmployeeId] = useState<string | null>(null);
  const [recalculatingCompensationAssignmentId, setRecalculatingCompensationAssignmentId] = useState<string | null>(null);
  const [managerCloseForm, setManagerCloseForm] = useState<ManagerCloseFormState>(emptyManagerCloseForm);
  const [closingOrder, setClosingOrder] = useState(false);
  const [manualExecutionMetricsForm, setManualExecutionMetricsForm] =
    useState<ManualExecutionMetricsFormState>(emptyManualExecutionMetricsForm);
  const [savingManualExecutionMetrics, setSavingManualExecutionMetrics] = useState(false);
  const [financePanelVersion, setFinancePanelVersion] = useState(0);
  const [nextShiftPlans, setNextShiftPlans] = useState<Record<string, NextShiftPlanningFormState>>({});
  const [savingNextShiftAssignmentId, setSavingNextShiftAssignmentId] = useState<string | null>(null);
  const [editingAddress, setEditingAddress] = useState(false);
  const [addressForm, setAddressForm] = useState({ addressFrom: "", addressTo: "" });
  const [savingAddress, setSavingAddress] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    scheduledDate: "",
    scheduledDateTo: "",
    scheduledTimeFrom: "",
    scheduledTimeTo: "",
  });
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [savingWorkerVisibility, setSavingWorkerVisibility] = useState(false);

  const formMode: "create" | "edit" = editingItem?.id ? "edit" : "create";

  /* ── Data loading ── */

  async function loadItems() {
    setLoading(true);
    try {
      const qs = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const data = await apiFetch<RentOrder[]>(`/admin/rent-orders${qs}`);
      setItems(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  async function loadEquipment() {
    try {
      const data = await apiFetch<EquipmentOption[]>("/equipment");
      setEquipmentList(data);
    } catch {
      /* */
    }
  }

  async function loadEmployees() {
    try {
      const data = await apiFetch<{ employees: EmployeeOption[] }>("/admin/employees");
      setEmployeeOptions(data.employees.filter((employee) => employee.isActive));
    } catch {
      /* */
    }
  }

  async function refreshOrderDetail(orderId: string) {
    try {
      const data = await apiFetch<RentOrder>(`/admin/rent-orders/${orderId}`);
      setDetailOrder(data);
      setItems((prev) => prev.map((item) => (item.id === orderId ? data : item)));
    } catch {
      // ignore refresh error
    }
  }

  useEffect(() => {
    loadItems();
  }, [statusFilter]);

  useEffect(() => {
    loadEquipment();
    loadEmployees();
  }, []);

  useEffect(() => {
    if (viewMode === "form") return;

    if (!routeOrderKey) {
      setRouteOrderLoading(false);
      setRouteOrderError("");
      if (viewMode === "detail" || detailOrder) {
        setDetailOrder(null);
        setDetailFinance(null);
        setEditingSchedule(false);
        setViewMode("list");
      }
      return;
    }

    if (
      viewMode === "detail" &&
      detailOrder &&
      getOrderRouteKey(detailOrder) === routeOrderKey
    ) {
      setRouteOrderLoading(false);
      setRouteOrderError("");
      return;
    }

    let cancelled = false;
    setRouteOrderLoading(true);
    setRouteOrderError("");

    apiFetch<RentOrder>(`/admin/rent-orders/by-key/${encodeURIComponent(routeOrderKey)}`)
      .then((order) => {
        if (cancelled) return;
        setDetailOrder(order);
        setItems((prev) => {
          const exists = prev.some((item) => item.id === order.id);
          return exists
            ? prev.map((item) => (item.id === order.id ? order : item))
            : [order, ...prev];
        });
        setViewMode("detail");
      })
      .catch((error) => {
        if (cancelled) return;
        setDetailOrder(null);
        setViewMode("list");
        setRouteOrderError(error instanceof Error ? error.message : "Замовлення не знайдено");
      })
      .finally(() => {
        if (!cancelled) setRouteOrderLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [routeOrderKey, viewMode, detailOrder]);

  useEffect(() => {
    if (viewMode !== "form") {
      setAvailability(null);
      setAvailabilityLoading(false);
      setAvailabilityError("");
      return;
    }

    const hasAnyPlanningData =
      Boolean(form.scheduledDate) ||
      form.items.some((item) => Boolean(item.equipmentId || item.scheduledDateFrom));

    if (!hasAnyPlanningData) {
      setAvailability(null);
      setAvailabilityLoading(false);
      setAvailabilityError("");
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setAvailabilityLoading(true);
      setAvailabilityError("");
      try {
        const result = await apiFetch<AvailabilityCheckResult>("/admin/availability/check", {
          method: "POST",
          body: JSON.stringify({
            orderId: editingItem?.id ?? null,
            scheduledDate: form.scheduledDate || null,
            scheduledDateTo: form.scheduledDateTo || null,
            scheduledTimeFrom: form.scheduledTimeFrom || null,
            scheduledTimeTo: form.scheduledTimeTo || null,
            items: form.items.map((item) => ({
              equipmentId: item.equipmentId || null,
              useCustomSchedule: item.useCustomSchedule,
              scheduledDateFrom: item.scheduledDateFrom || null,
              scheduledDateTo: item.scheduledDateTo || null,
              scheduledTimeFrom: item.scheduledTimeFrom || null,
              scheduledTimeTo: item.scheduledTimeTo || null,
            })),
          }),
        });
        if (!cancelled) setAvailability(result);
      } catch (error) {
        if (!cancelled) {
          setAvailability(null);
          setAvailabilityError(error instanceof Error ? error.message : "Не вдалося перевірити доступність");
        }
      } finally {
        if (!cancelled) setAvailabilityLoading(false);
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    viewMode,
    editingItem?.id,
    form.scheduledDate,
    form.scheduledDateTo,
    form.scheduledTimeFrom,
    form.scheduledTimeTo,
    form.items,
  ]);

  useEffect(() => {
    if (
      viewMode !== "detail" ||
      !detailOrder ||
      !selectedEmployeeId ||
      !selectedAssignmentEquipmentId
    ) {
      setAssignmentAvailability(null);
      setAssignmentAvailabilityLoading(false);
      setAssignmentAvailabilityError("");
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setAssignmentAvailabilityLoading(true);
      setAssignmentAvailabilityError("");
      try {
        const selectedItem = detailOrder.items.find((item) => item.equipmentId === selectedAssignmentEquipmentId);
        const result = await apiFetch<AvailabilityCheckResult>("/admin/availability/check", {
          method: "POST",
          body: JSON.stringify({
            orderId: detailOrder.id,
            scheduledDate: detailOrder.scheduledDate ? toInputDate(detailOrder.scheduledDate) : null,
            scheduledDateTo: detailOrder.scheduledDateTo ? toInputDate(detailOrder.scheduledDateTo) : null,
            scheduledTimeFrom: detailOrder.scheduledTimeFrom || null,
            scheduledTimeTo: detailOrder.scheduledTimeTo || null,
            employeeIds: [selectedEmployeeId],
            items: [
              selectedItem
                ? buildAvailabilityItemPayload(detailOrder, selectedItem)
                : {
                    equipmentId: selectedAssignmentEquipmentId,
                    useCustomSchedule: false,
                  },
            ],
          }),
        });
        if (!cancelled) setAssignmentAvailability(result);
      } catch (error) {
        if (!cancelled) {
          setAssignmentAvailability(null);
          setAssignmentAvailabilityError(error instanceof Error ? error.message : "Не вдалося перевірити доступність працівника");
        }
      } finally {
        if (!cancelled) setAssignmentAvailabilityLoading(false);
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [viewMode, detailOrder, selectedEmployeeId, selectedAssignmentEquipmentId]);

  useEffect(() => {
    if (viewMode !== "detail" || !detailOrder) {
      setDetailAvailability(null);
      setDetailAvailabilityLoading(false);
      setDetailAvailabilityError("");
      return;
    }

    const order = detailOrder;
    const hasData = order.items.length > 0 && (Boolean(order.scheduledDate) || order.items.some((item) => item.startDate));
    if (!hasData) {
      setDetailAvailability(null);
      setDetailAvailabilityLoading(false);
      setDetailAvailabilityError("");
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setDetailAvailabilityLoading(true);
      setDetailAvailabilityError("");
      try {
        const employeeIds = Array.from(
          new Set(
            (order.assignments ?? [])
              .filter((assignment) => assignment.status !== "DECLINED")
              .map((assignment) => assignment.employeeId)
              .filter(Boolean),
          ),
        );
        const result = await apiFetch<AvailabilityCheckResult>("/admin/availability/check", {
          method: "POST",
          body: JSON.stringify({
            orderId: order.id,
            scheduledDate: order.scheduledDate ? toInputDate(order.scheduledDate) : null,
            scheduledDateTo: order.scheduledDateTo ? toInputDate(order.scheduledDateTo) : null,
            scheduledTimeFrom: order.scheduledTimeFrom || null,
            scheduledTimeTo: order.scheduledTimeTo || null,
            employeeIds,
            items: order.items.map((item) => buildAvailabilityItemPayload(order, item)),
          }),
        });
        if (!cancelled) setDetailAvailability(result);
      } catch (error) {
        if (!cancelled) {
          setDetailAvailability(null);
          setDetailAvailabilityError(error instanceof Error ? error.message : "Не вдалося перевірити доступність замовлення");
        }
      } finally {
        if (!cancelled) setDetailAvailabilityLoading(false);
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [viewMode, detailOrder]);

  /* ── Handle "from request" navigation ── */
  useEffect(() => {
    const openOrderId = (location.state as { openOrderId?: string } | null)?.openOrderId;
    if (!openOrderId || items.length === 0) return;

    const existing = items.find((item) => item.id === openOrderId);
    if (!existing) return;

    setDetailOrder(existing);
    setViewMode("detail");
    navigate(getOrderDetailPath(existing), { replace: true, state: {} });
  }, [location.state, items, navigate]);

  useEffect(() => {
    if (!detailOrder) {
      setManagerCloseForm(emptyManagerCloseForm);
      setManualExecutionMetricsForm(emptyManualExecutionMetricsForm);
      setDetailFinance(null);
      setNextShiftPlans({});
      setEditingAddress(false);
      setAddressForm({ addressFrom: "", addressTo: "" });
      setEditingSchedule(false);
      setScheduleForm({
        scheduledDate: "",
        scheduledDateTo: "",
        scheduledTimeFrom: "",
        scheduledTimeTo: "",
      });
      return;
    }
    setManagerCloseForm({
      finalAgreedPrice:
        detailOrder.finalAgreedPrice == null ? "" : String(detailOrder.finalAgreedPrice),
      finalCashCollected:
        detailOrder.finalCashCollected == null ? "" : String(detailOrder.finalCashCollected),
      finalExtraExpenses:
        detailOrder.finalExtraExpenses == null ? "" : String(detailOrder.finalExtraExpenses),
      managerCloseComment: detailOrder.managerCloseComment ?? "",
    });
    setManualExecutionMetricsForm({
      distanceKm:
        detailOrder.latestExecutionReport?.gpsSnapshotJson?.manualMetrics?.distanceKm == null
          ? ""
          : String(detailOrder.latestExecutionReport.gpsSnapshotJson.manualMetrics.distanceKm),
      driveDurationMinutes:
        detailOrder.latestExecutionReport?.gpsSnapshotJson?.manualMetrics?.driveDurationMinutes == null
          ? ""
          : String(detailOrder.latestExecutionReport.gpsSnapshotJson.manualMetrics.driveDurationMinutes),
      stopDurationMinutes:
        detailOrder.latestExecutionReport?.gpsSnapshotJson?.manualMetrics?.stopDurationMinutes == null
          ? ""
          : String(detailOrder.latestExecutionReport.gpsSnapshotJson.manualMetrics.stopDurationMinutes),
      engineHours:
        detailOrder.latestExecutionReport?.gpsSnapshotJson?.manualMetrics?.engineHours == null
          ? ""
          : String(detailOrder.latestExecutionReport.gpsSnapshotJson.manualMetrics.engineHours),
      perEquipmentMetrics: buildManualEquipmentMetricRows(detailOrder),
    });
    setNextShiftPlans(
      Object.fromEntries(
        (detailOrder.assignments ?? []).map((assignment) => [
          assignment.id,
          {
            plannedNextStartAt: toInputDateTime(assignment.plannedNextStartAt),
            plannedDurationHours: assignment.plannedDurationMinutes == null
              ? ""
              : String(Math.round((Number(assignment.plannedDurationMinutes) / 60) * 100) / 100),
            completionComment: assignment.completionComment ?? "",
          },
        ]),
      ),
    );
    setAddressForm({
      addressFrom: detailOrder.addressFrom ?? "",
      addressTo: detailOrder.addressTo ?? "",
    });
    setScheduleForm({
      scheduledDate: detailOrder.scheduledDate ? toInputDate(detailOrder.scheduledDate) : "",
      scheduledDateTo: detailOrder.scheduledDateTo ? toInputDate(detailOrder.scheduledDateTo) : "",
      scheduledTimeFrom: detailOrder.scheduledTimeFrom ?? "",
      scheduledTimeTo: detailOrder.scheduledTimeTo ?? "",
    });
  }, [detailOrder]);

  useEffect(() => {
    const fromRequest = (location.state as { fromRequest?: Record<string, unknown> } | null)?.fromRequest;
    if (!fromRequest) return;

    const req = fromRequest as {
      id?: string;
      legacyOrderId?: string | null;
      requestType?: string;
      customerName?: string;
      phone?: string;
      equipmentId?: string;
      itemTitle?: string;
      addressFrom?: string | null;
      addressTo?: string | null;
      scheduledDate?: string | null;
      scheduledTime?: string | null;
      comment?: string | null;
      dateFrom?: string | null;
      dateTo?: string | null;
      agreedPrice?: number | null;
      materialDelivery?: MaterialDeliverySnapshot | null;
      tow?: TowCalculationSnapshot | null;
    };

    // Check duplicate
    const existingOrder = items.find(
      (o) =>
        (req.id && o.sourceCustomerRequestId === req.id) ||
        (!!req.legacyOrderId && o.sourceRequestId === req.legacyOrderId),
    );
    if (existingOrder) {
      setDetailOrder(existingOrder);
      setViewMode("detail");
      navigate(getOrderDetailPath(existingOrder), { replace: true, state: {} });
      return;
    }

    const isMaterialDeliveryRequest =
      req.materialDelivery?.servicePricingType === "material_delivery_calculator";
    const prefilledCommentParts = isMaterialDeliveryRequest
      ? [
          req.materialDelivery?.selectedMaterialName ? `Матеріал: ${req.materialDelivery.selectedMaterialName}` : "",
          req.materialDelivery?.quantity
            ? `Кількість: ${req.materialDelivery.quantity}${req.materialDelivery.unit ? ` ${req.materialDelivery.unit}` : ""}`
            : "",
          req.materialDelivery?.deliveryAddress ?? req.addressFrom
            ? `Адреса доставки: ${req.materialDelivery?.deliveryAddress ?? req.addressFrom}`
            : "",
          req.materialDelivery?.chosenSupplierPointName ? `Точка постачання: ${req.materialDelivery.chosenSupplierPointName}` : "",
          req.comment ? `Коментар клієнта: ${req.comment}` : "",
        ].filter(Boolean)
      : [
          req.itemTitle ? `Позиція: ${req.itemTitle}` : "",
          req.addressFrom ? `Адреса: ${req.addressFrom}` : "",
          req.scheduledDate ? `Дата: ${new Date(req.scheduledDate).toLocaleDateString("uk")}` : "",
          req.scheduledTime ? `Час: ${req.scheduledTime}` : "",
          req.comment ? `Коментар клієнта: ${req.comment}` : "",
        ].filter(Boolean);

    const firstItem: FormItem = {
      key: newItemKey(),
      equipmentId: req.equipmentId ?? req.materialDelivery?.chosenEquipmentId ?? req.tow?.selectedEquipmentId ?? "",
      useCustomSchedule: false,
      scheduledDateFrom: "",
      scheduledDateTo: "",
      scheduledTimeFrom: "",
      scheduledTimeTo: "",
    };

    const prefilled: FormState = {
      customerName: req.customerName ?? "",
      customerPhone: req.phone ?? "",
      scheduledDate: req.scheduledDate
        ? toInputDate(req.scheduledDate)
        : req.materialDelivery?.scheduledDate
          ? toInputDate(req.materialDelivery.scheduledDate)
          : req.dateFrom
            ? toInputDate(req.dateFrom)
            : "",
      scheduledDateTo: req.dateTo ? toInputDate(req.dateTo) : "",
      scheduledTimeFrom: req.scheduledTime ?? req.materialDelivery?.scheduledTime ?? "",
      scheduledTimeTo: "",
      agreedPrice: req.agreedPrice == null ? "" : String(Math.round(req.agreedPrice)),
      addressFrom:
        req.materialDelivery?.deliveryAddress ??
        req.addressFrom ??
        "",
      addressTo:
        req.tow?.destinationAddress ??
        req.addressTo ??
        "",
      items: [firstItem],
      status: "NEW",
      comment: prefilledCommentParts.join("\n"),
      sourceType: "request",
      sourceRequestId: req.legacyOrderId ?? "",
      sourceCustomerRequestId: req.id ?? "",
    };

    setEditingItem(null);
    setFieldErrors({});
    setSubmitError("");
    setAvailability(null);
    setAvailabilityError("");
    setForm(prefilled);
    setViewMode("form");

    navigate(RENT_ORDERS_BASE_PATH, { replace: true, state: {} });
  }, [location.state, items.length]);

  /* ── Form helpers ── */

  function startCreate() {
    setEditingItem(null);
    setFieldErrors({});
    setSubmitError("");
    setAvailability(null);
    setAvailabilityError("");
    setForm({ ...emptyForm, items: [makeEmptyItem()] });
    setViewMode("form");
    navigate(RENT_ORDERS_BASE_PATH);
  }

  function startEdit(order: RentOrder) {
    const formItems: FormItem[] = order.items.map((it) => ({
      key: newItemKey(),
      equipmentId: it.equipmentId,
      useCustomSchedule: false,
      scheduledDateFrom: "",
      scheduledDateTo: "",
      scheduledTimeFrom: "",
      scheduledTimeTo: "",
    }));
    if (formItems.length === 0) formItems.push(makeEmptyItem());

    const nextForm: FormState = {
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      scheduledDate: order.scheduledDate
        ? toInputDate(order.scheduledDate)
        : order.items[0]?.startDate
          ? toInputDate(order.items[0].startDate)
          : "",
      scheduledDateTo: order.scheduledDateTo
        ? toInputDate(order.scheduledDateTo)
        : "",
      scheduledTimeFrom: order.scheduledTimeFrom ?? "",
      scheduledTimeTo: order.scheduledTimeTo ?? "",
      agreedPrice: order.agreedPrice == null ? "" : String(order.agreedPrice),
      addressFrom: order.addressFrom ?? order.sourceCustomerRequest?.addressFrom ?? "",
      addressTo: order.addressTo ?? order.sourceCustomerRequest?.addressTo ?? "",
      items: formItems,
      status: order.status,
      comment: order.comment ?? "",
      sourceType: order.sourceType,
      sourceRequestId: order.sourceRequestId ?? "",
      sourceCustomerRequestId: order.sourceCustomerRequestId ?? "",
    };
    setEditingItem(order);
    setFieldErrors({});
    setSubmitError("");
    setAvailability(null);
    setAvailabilityError("");
    setForm(nextForm);
    setViewMode("form");
  }

  function requestCloseForm() {
    setDiscardModalOpen(true);
  }

  function closeFormImmediately() {
    const returnOrder = editingItem;
    if (returnOrder) {
      setDetailOrder(returnOrder);
      setViewMode("detail");
      navigate(getOrderDetailPath(returnOrder), { replace: true });
    } else {
      setDetailOrder(null);
      setDetailFinance(null);
      setViewMode("list");
      navigate(RENT_ORDERS_BASE_PATH);
    }
    setEditingItem(null);
    setFieldErrors({});
    setSubmitError("");
    setAvailability(null);
    setAvailabilityError("");
    setDiscardModalOpen(false);
  }

  function backToList() {
    setDetailOrder(null);
    setDetailFinance(null);
    setEditingSchedule(false);
    setViewMode("list");
    navigate(RENT_ORDERS_BASE_PATH, { replace: true });
  }

  /* Item management */
  function updateItem(index: number, patch: Partial<FormItem>) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => (i === index ? { ...it, ...patch } : it)),
    }));
  }

  function addItem() {
    setForm((prev) => ({ ...prev, items: [...prev.items, makeEmptyItem()] }));
  }

  function removeItem(index: number) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  }

  function validate(): boolean {
    const errors: FieldErrors = {};
    if (!form.customerName.trim()) errors.customerName = "Обов'язкове поле";
    if (!form.customerPhone.trim()) errors.customerPhone = "Обов'язкове поле";

    if (form.items.length === 0) {
      errors.itemsGlobal = "Додайте хоча б одну техніку";
    } else {
      const itemErrors: Record<number, ItemError> = {};
      form.items.forEach((it, i) => {
        const ie: ItemError = {};
        if (!it.equipmentId) ie.equipmentId = "Оберіть техніку";
        if (it.useCustomSchedule) {
          if (!it.scheduledDateFrom) ie.scheduledDateFrom = "Вкажіть дату від";
          if (
            it.scheduledDateFrom &&
            it.scheduledDateTo &&
            it.scheduledDateFrom > it.scheduledDateTo
          ) {
            ie.scheduledDateTo = "Дата до раніше дати від";
          }
        }
        if (Object.keys(ie).length > 0) itemErrors[i] = ie;
      });
      if (Object.keys(itemErrors).length > 0) errors.items = itemErrors;
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    setSubmitError("");
    try {
      const body = {
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim(),
        scheduledDate: form.scheduledDate || undefined,
        scheduledDateTo: form.scheduledDateTo || undefined,
        scheduledTimeFrom: form.scheduledTimeFrom || undefined,
        scheduledTimeTo: form.scheduledTimeTo || undefined,
        agreedPrice: form.agreedPrice.trim() === "" ? null : Number(form.agreedPrice),
        addressFrom: form.addressFrom.trim(),
        addressTo: form.addressTo.trim(),
        items: form.items.map((it) => ({
          equipmentId: it.equipmentId,
          useCustomSchedule: it.useCustomSchedule,
          scheduledDateFrom: it.scheduledDateFrom || undefined,
          scheduledDateTo: it.scheduledDateTo || undefined,
          scheduledTimeFrom: it.scheduledTimeFrom || undefined,
          scheduledTimeTo: it.scheduledTimeTo || undefined,
        })),
        status: form.status,
        comment: form.comment.trim() || undefined,
        sourceType: form.sourceType,
        sourceRequestId: form.sourceRequestId || undefined,
        sourceCustomerRequestId: form.sourceCustomerRequestId || undefined,
      };

      const saved =
        formMode === "edit" && editingItem
          ? await apiFetch<RentOrder>(`/admin/rent-orders/${editingItem.id}`, {
              method: "PUT",
              body: JSON.stringify(body),
            })
          : await apiFetch<RentOrder>("/admin/rent-orders", {
              method: "POST",
              body: JSON.stringify(body),
            });

      await loadItems();
      setEditingItem(null);
      setFieldErrors({});
      setSubmitError("");
      setAvailability(null);
      setAvailabilityError("");
      setDiscardModalOpen(false);
      setDetailOrder(saved);
      setViewMode("detail");
      navigate(getOrderDetailPath(saved), { replace: formMode === "edit" });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Помилка збереження");
    } finally {
      setSaving(false);
    }
  }

  /* ── Actions ── */

  async function markStatus(id: string, status: string) {
    try {
      const updated = await apiFetch<RentOrder>(`/admin/rent-orders/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadItems();
      if (detailOrder?.id === id) setDetailOrder(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Помилка");
    }
  }

  async function updateWorkerCustomerVisibility(orderId: string, showWorkerToCustomer: boolean) {
    setSavingWorkerVisibility(true);
    try {
      const updated = await apiFetch<RentOrder>(`/admin/rent-orders/${orderId}/customer-worker-visibility`, {
        method: "PATCH",
        body: JSON.stringify({ showWorkerToCustomer }),
      });
      await loadItems();
      if (detailOrder?.id === orderId) setDetailOrder(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Помилка оновлення видимості працівника");
    } finally {
      setSavingWorkerVisibility(false);
    }
  }

  function startAddressEdit(order: RentOrder) {
    setAddressForm({
      addressFrom: order.addressFrom ?? "",
      addressTo: order.addressTo ?? "",
    });
    setEditingAddress(true);
  }

  function startScheduleEdit(order: RentOrder) {
    setScheduleForm({
      scheduledDate: order.scheduledDate ? toInputDate(order.scheduledDate) : "",
      scheduledDateTo: order.scheduledDateTo ? toInputDate(order.scheduledDateTo) : "",
      scheduledTimeFrom: order.scheduledTimeFrom ?? "",
      scheduledTimeTo: order.scheduledTimeTo ?? "",
    });
    setEditingSchedule(true);
  }

  function applyNearestScheduleSuggestion(suggestion: AvailabilitySuggestion) {
    if (!suggestion.from || !suggestion.to) return;
    setScheduleForm({
      scheduledDate: "scheduledDate" in suggestion ? suggestion.scheduledDate ?? "" : toInputDate(suggestion.from),
      scheduledDateTo: "scheduledDateTo" in suggestion ? suggestion.scheduledDateTo ?? "" : toInputDate(suggestion.to),
      scheduledTimeFrom: "scheduledTimeFrom" in suggestion ? suggestion.scheduledTimeFrom ?? "" : toInputTime(suggestion.from),
      scheduledTimeTo: "scheduledTimeTo" in suggestion ? suggestion.scheduledTimeTo ?? "" : toInputTime(suggestion.to),
    });
    setEditingSchedule(true);
  }

  async function saveOrderAddress(orderId: string) {
    setSavingAddress(true);
    try {
      const updated = await apiFetch<RentOrder>(`/admin/rent-orders/${orderId}`, {
        method: "PUT",
        body: JSON.stringify({
          addressFrom: addressForm.addressFrom.trim(),
          addressTo: addressForm.addressTo.trim(),
        }),
      });
      await loadItems();
      setDetailOrder(updated);
      setEditingAddress(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Помилка збереження адреси");
    } finally {
      setSavingAddress(false);
    }
  }

  async function saveOrderSchedule(orderId: string) {
    if (scheduleForm.scheduledDateTo && !scheduleForm.scheduledDate) {
      alert("Якщо вказана дата до, потрібно вказати дату від");
      return;
    }
    if (
      scheduleForm.scheduledDate &&
      scheduleForm.scheduledDateTo &&
      scheduleForm.scheduledDateTo < scheduleForm.scheduledDate
    ) {
      alert("Дата до не може бути раніше дати від");
      return;
    }

    setSavingSchedule(true);
    setDetailAvailability(null);
    setDetailAvailabilityLoading(true);
    setDetailAvailabilityError("");
    try {
      const updated = await apiFetch<RentOrder>(`/admin/rent-orders/${orderId}`, {
        method: "PUT",
        body: JSON.stringify({
          scheduledDate: scheduleForm.scheduledDate,
          scheduledDateTo: scheduleForm.scheduledDateTo,
          scheduledTimeFrom: scheduleForm.scheduledTimeFrom,
          scheduledTimeTo: scheduleForm.scheduledTimeTo,
        }),
      });
      await loadItems();
      setDetailOrder(updated);
      setEditingSchedule(false);
    } catch (err) {
      setDetailAvailabilityLoading(false);
      alert(err instanceof Error ? err.message : "Помилка збереження дати");
    } finally {
      setSavingSchedule(false);
    }
  }

  async function assignWorker(orderId: string) {
    if (!selectedEmployeeId) {
      alert("Оберіть працівника");
      return;
    }
    if (!selectedAssignmentEquipmentId) {
      alert("Оберіть техніку");
      return;
    }

    if (
      (assignmentCompensationForm.type === "fixed" || assignmentCompensationForm.type === "manual") &&
      parseNullableNumber(assignmentCompensationForm.finalAmount) == null
    ) {
      alert("Вкажіть суму оплати працівнику");
      return;
    }

    if (
      assignmentCompensationForm.type === "hourly" &&
      parseNullableNumber(assignmentCompensationForm.rate) == null
    ) {
      alert("Вкажіть ставку за годину для оплати працівнику");
      return;
    }

    if (
      assignmentCompensationForm.type === "shift" &&
      (parseNullableNumber(assignmentCompensationForm.rate) == null ||
        parseNullableNumber(assignmentCompensationForm.quantity) == null)
    ) {
      alert("Вкажіть ставку і кількість змін для оплати працівнику");
      return;
    }

    if (
      assignmentCompensationForm.type === "percent" &&
      parseNullableNumber(assignmentCompensationForm.percent) == null
    ) {
      alert("Вкажіть відсоток оплати працівнику");
      return;
    }

    setAssigning(true);
    try {
      const updated = await apiFetch<RentOrder>(`/admin/rent-orders/${orderId}/assign`, {
        method: "POST",
        body: JSON.stringify({
          employeeId: selectedEmployeeId,
          equipmentId: selectedAssignmentEquipmentId,
          managerComment: workerManagerComment.trim() || undefined,
          plannedDurationMinutes: parseNullableNumber(assignmentPlannedDurationHours) == null
            ? undefined
            : Math.round(Number(parseNullableNumber(assignmentPlannedDurationHours)) * 60),
          notify: false,
          compensation: {
            type: assignmentCompensationForm.type,
            rate:
              assignmentCompensationForm.type === "hourly" || assignmentCompensationForm.type === "shift"
                ? parseNullableNumber(assignmentCompensationForm.rate)
                : undefined,
            quantity:
              assignmentCompensationForm.type === "hourly" || assignmentCompensationForm.type === "shift"
                ? parseNullableNumber(assignmentCompensationForm.quantity)
                : undefined,
            percent:
              assignmentCompensationForm.type === "percent"
                ? parseNullableNumber(assignmentCompensationForm.percent)
                : undefined,
            finalAmount:
              assignmentCompensationForm.type === "fixed" || assignmentCompensationForm.type === "manual"
                ? parseNullableNumber(assignmentCompensationForm.finalAmount)
                : undefined,
            status: "approved",
            comment: assignmentCompensationForm.comment.trim() || undefined,
          },
        }),
      });
      await loadItems();
      setDetailOrder(updated);
      setSelectedAssignmentEquipmentId("");
      setAssignmentPlannedDurationHours("");
      setAssignmentCompensationForm(emptyAssignmentCompensationForm);
      setFinancePanelVersion((prev) => prev + 1);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Помилка");
    } finally {
      setAssigning(false);
    }
  }

  async function notifyWorkerAssignments(orderId: string) {
    if (!selectedEmployeeId) {
      alert("Оберіть працівника, якому потрібно надіслати завдання");
      return;
    }

    setNotifyingEmployeeId(selectedEmployeeId);
    try {
      const updated = await apiFetch<RentOrder>(`/admin/rent-orders/${orderId}/assignments/notify-worker`, {
        method: "POST",
        body: JSON.stringify({
          employeeId: selectedEmployeeId,
          managerComment: workerManagerComment.trim() || undefined,
        }),
      });
      await loadItems();
      setDetailOrder(updated);
      setSelectedEmployeeId("");
      setSelectedAssignmentEquipmentId("");
      setWorkerManagerComment("");
      setAssignmentCompensationForm(emptyAssignmentCompensationForm);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Помилка відправки завдання працівнику");
    } finally {
      setNotifyingEmployeeId(null);
    }
  }

  async function closeOrder(orderId: string) {
    setClosingOrder(true);
    try {
      const updated = await apiFetch<RentOrder>(`/admin/rent-orders/${orderId}/close`, {
        method: "POST",
        body: JSON.stringify({
          finalAgreedPrice:
            managerCloseForm.finalAgreedPrice.trim() === ""
              ? null
              : Number(managerCloseForm.finalAgreedPrice),
          finalCashCollected:
            managerCloseForm.finalCashCollected.trim() === ""
              ? null
              : Number(managerCloseForm.finalCashCollected),
          finalExtraExpenses:
            managerCloseForm.finalExtraExpenses.trim() === ""
              ? null
              : Number(managerCloseForm.finalExtraExpenses),
          managerCloseComment: managerCloseForm.managerCloseComment.trim() || "",
        }),
      });
      await loadItems();
      setDetailOrder(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Помилка");
    } finally {
      setClosingOrder(false);
    }
  }

  async function saveManualExecutionMetrics(orderId: string) {
    const parseMetric = (value: string) => {
      const normalized = value.trim().replace(",", ".");
      return normalized === "" ? null : Number(normalized);
    };
    const distanceKm = parseMetric(manualExecutionMetricsForm.distanceKm);
    const driveDurationMinutes = parseMetric(manualExecutionMetricsForm.driveDurationMinutes);
    const stopDurationMinutes = parseMetric(manualExecutionMetricsForm.stopDurationMinutes);
    const engineHours = parseMetric(manualExecutionMetricsForm.engineHours);
    const perEquipmentMetrics = manualExecutionMetricsForm.perEquipmentMetrics.map((item) => ({
      equipmentId: item.equipmentId,
      distanceKm: parseMetric(item.distanceKm),
      driveDurationMinutes: parseMetric(item.driveDurationMinutes),
      stopDurationMinutes: parseMetric(item.stopDurationMinutes),
      engineHours: parseMetric(item.engineHours),
    }));

    if (
      (distanceKm != null && !Number.isFinite(distanceKm)) ||
      (driveDurationMinutes != null && !Number.isFinite(driveDurationMinutes)) ||
      (stopDurationMinutes != null && !Number.isFinite(stopDurationMinutes)) ||
      (engineHours != null && !Number.isFinite(engineHours)) ||
      perEquipmentMetrics.some(
        (item) =>
          (item.distanceKm != null && !Number.isFinite(item.distanceKm)) ||
          (item.driveDurationMinutes != null && !Number.isFinite(item.driveDurationMinutes)) ||
          (item.stopDurationMinutes != null && !Number.isFinite(item.stopDurationMinutes)) ||
          (item.engineHours != null && !Number.isFinite(item.engineHours)),
      )
    ) {
      alert("Вкажіть коректні GPS-показники");
      return;
    }

    setSavingManualExecutionMetrics(true);
    try {
      const updated = await apiFetch<RentOrder>(`/admin/rent-orders/${orderId}/execution-report/metrics`, {
        method: "PUT",
        body: JSON.stringify({
          distanceKm,
          driveDurationMinutes,
          stopDurationMinutes,
          engineHours,
          perEquipmentMetrics,
        }),
      });
      await loadItems();
      setDetailOrder(updated);
      setFinancePanelVersion((prev) => prev + 1);
      await refreshOrderDetail(orderId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Помилка");
    } finally {
      setSavingManualExecutionMetrics(false);
    }
  }

  async function saveNextShiftPlan(orderId: string, assignmentId: string) {
    const plan = nextShiftPlans[assignmentId] ?? emptyNextShiftPlanningForm;
    setSavingNextShiftAssignmentId(assignmentId);
    try {
      const updated = await apiFetch<RentOrder>(`/admin/rent-orders/${orderId}/assignments/${assignmentId}/next-shift`, {
        method: "PATCH",
        body: JSON.stringify({
          plannedNextStartAt: plan.plannedNextStartAt || null,
          plannedDurationMinutes: parseNullableNumber(plan.plannedDurationHours) == null
            ? undefined
            : Math.round(Number(parseNullableNumber(plan.plannedDurationHours)) * 60),
          completionComment: plan.completionComment.trim() || null,
        }),
      });
      await loadItems();
      setDetailOrder(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Помилка");
    } finally {
      setSavingNextShiftAssignmentId(null);
    }
  }

  async function recalculateWorkerCompensationFromActualTime(
    order: RentOrder,
    assignment: WorkAssignment,
    sessions: WorkExecutionSession[],
  ) {
    const compensation = (detailFinance?.workerCompensations ?? []).find((item) =>
      item.assignmentId === assignment.id ||
      (
        !item.assignmentId &&
        item.employeeId === assignment.employeeId &&
        (item.equipmentId ?? "") === (assignment.equipmentId ?? "")
      ),
    );

    if (!compensation || compensation.type !== "hourly" || compensation.rate == null) {
      alert("Для перерахунку потрібна погодинна оплата зі ставкою за годину.");
      return;
    }

    const actualMinutes = sessions.reduce((sum, session) => {
      const minutes = getExecutionActualDurationMinutes(session);
      return minutes == null ? sum : sum + minutes;
    }, 0);
    if (actualMinutes <= 0) {
      alert("Немає фактичного часу виконання для перерахунку.");
      return;
    }

    const actualHours = Math.round((actualMinutes / 60) * 100) / 100;
    setRecalculatingCompensationAssignmentId(assignment.id);
    try {
      await apiFetch<RentOrderFinance>(`/admin/rent-orders/${order.id}/worker-compensation`, {
        method: "PUT",
        body: JSON.stringify({
          assignmentId: assignment.id,
          employeeId: assignment.employeeId,
          equipmentId: assignment.equipmentId,
          type: "hourly",
          rate: compensation.rate,
          quantity: actualHours,
          status: compensation.status || "approved",
          comment: [
            compensation.comment,
            `Перераховано за фактичним часом: ${fmtDurationMinutes(actualMinutes)}.`,
          ].filter(Boolean).join("\n"),
        }),
      });
      setFinancePanelVersion((prev) => prev + 1);
      await refreshOrderDetail(order.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Помилка перерахунку оплати працівника");
    } finally {
      setRecalculatingCompensationAssignmentId(null);
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiFetch(`/admin/rent-orders/${id}`, { method: "DELETE" });
      if (detailOrder?.id === id) backToList();
      await loadItems();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Помилка");
    }
    setDeleteTarget(null);
  }

  /* ── Counts & filter ── */

  const newCount = items.filter((o) => o.status === "NEW").length;
  const filtered = items.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      o.customerName.toLowerCase().includes(q) ||
      o.customerPhone.includes(q) ||
      formatOrderNumber(o).includes(q) ||
      (o.addressFrom ?? "").toLowerCase().includes(q) ||
      (o.addressTo ?? "").toLowerCase().includes(q) ||
      o.items.some((it) => it.equipment?.name.toLowerCase().includes(q))
    );
  });

  /* ═══════════════════ FORM VIEW ═══════════════════ */

  if (routeOrderKey && viewMode !== "form" && (routeOrderLoading || routeOrderError)) {
    return (
      <div className="flex h-full flex-col gap-4 font-sans">
        <AdminPageHeader title="Замовлення" subtitle={`№${routeOrderKey}`}>
          <AdminButton variant="secondary" size="sm" onClick={backToList}>
            До списку
          </AdminButton>
        </AdminPageHeader>
        <AdminCard className="p-6">
          {routeOrderLoading ? (
            <p className="text-sm font-medium text-gray-500">Завантаження замовлення…</p>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold text-red-600">
                {routeOrderError || "Замовлення не знайдено"}
              </p>
              <p className="text-sm text-gray-500">
                Перевірте номер у посиланні або поверніться до загального списку.
              </p>
            </div>
          )}
        </AdminCard>
      </div>
    );
  }

  if (viewMode === "form") {
    return (
      <div className="flex h-full flex-col font-sans">
        <form onSubmit={handleSubmit} noValidate className="flex h-full flex-col">
          {/* Header bar */}
          <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={requestCloseForm}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
              </button>
              <h1 className="text-lg font-bold text-gray-900">
                {formMode === "edit" ? "Редагування замовлення" : "Нове замовлення"}
              </h1>
              {submitError && (
                <span className="ml-3 text-sm font-medium text-red-600">{submitError}</span>
              )}
            </div>
            <AdminButton type="submit" disabled={saving}>
              {saving ? "Збереження…" : "Зберегти"}
            </AdminButton>
          </div>

          {/* Form body */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="mx-auto flex max-w-2xl flex-col gap-8">

              {/* Source badge */}
              {form.sourceType === "request" && form.sourceRequestId && (
                <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2.5">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4 text-blue-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.87-3.566a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364l1.757 1.757" />
                  </svg>
                  <span className="text-sm font-medium text-blue-700">Створено із заявки</span>
                </div>
              )}
              {form.sourceType === "request" && !form.sourceRequestId && form.sourceCustomerRequestId && (
                <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2.5">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4 text-blue-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.87-3.566a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364l1.757 1.757" />
                  </svg>
                  <span className="text-sm font-medium text-blue-700">Створено із CRM-заявки</span>
                </div>
              )}

              {/* Section: Availability */}
              <section className="flex flex-col gap-4">
                <h2 className="text-sm font-bold uppercase tracking-wide text-gray-400">
                  Перевірка доступності
                </h2>
                <AvailabilityCheckPanel
                  result={availability}
                  loading={availabilityLoading}
                  error={availabilityError}
                />
              </section>

              {/* Section: Client */}
              <section className="flex flex-col gap-4">
                <h2 className="text-sm font-bold uppercase tracking-wide text-gray-400">Клієнт</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <AdminInput
                      label="Ім'я клієнта"
                      value={form.customerName}
                      onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                      placeholder="Введіть ім'я"
                    />
                    {fieldErrors.customerName && (
                      <span className="text-xs text-red-500">{fieldErrors.customerName}</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <AdminInput
                      label="Телефон"
                      value={form.customerPhone}
                      onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                      placeholder="+380…"
                    />
                    {fieldErrors.customerPhone && (
                      <span className="text-xs text-red-500">{fieldErrors.customerPhone}</span>
                    )}
                  </div>
                </div>
              </section>

              {/* Section: Address */}
              <section className="flex flex-col gap-4">
                <h2 className="text-sm font-bold uppercase tracking-wide text-gray-400">Адреса замовлення</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
                    Адреса виконання / звідки
                    <AddressAutocompleteInput
                      value={form.addressFrom}
                      onChange={(value) => setForm({ ...form, addressFrom: value })}
                      placeholder="Почніть вводити адресу"
                      inputClassName="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
                    Адреса доставки / куди
                    <AddressAutocompleteInput
                      value={form.addressTo}
                      onChange={(value) => setForm({ ...form, addressTo: value })}
                      placeholder="Необов’язково"
                      inputClassName="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                  </label>
                </div>
                <p className="text-xs text-gray-500">
                  Ця адреса використовується в замовленні та повідомленні працівнику. Оригінальна адреса із заявки нижче лишається для історії.
                </p>
              </section>

              {/* Section: Planning */}
              <section className="flex flex-col gap-4">
                <h2 className="text-sm font-bold uppercase tracking-wide text-gray-400">
                  Планування
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <AdminInput
                    label="Дата від"
                    type="date"
                    value={form.scheduledDate}
                    onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })}
                  />
                  <AdminInput
                    label="Дата до"
                    type="date"
                    value={form.scheduledDateTo}
                    onChange={(e) => setForm({ ...form, scheduledDateTo: e.target.value })}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <AdminInput
                    label="Вартість, грн"
                    type="number"
                    min="0"
                    step="1"
                    value={form.agreedPrice}
                    onChange={(e) => setForm({ ...form, agreedPrice: e.target.value })}
                    placeholder="Не вказано"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <AdminInput
                    label="Час від"
                    type="time"
                    value={form.scheduledTimeFrom}
                    onChange={(e) => setForm({ ...form, scheduledTimeFrom: e.target.value })}
                  />
                  <AdminInput
                    label="Час до"
                    type="time"
                    value={form.scheduledTimeTo}
                    onChange={(e) => setForm({ ...form, scheduledTimeTo: e.target.value })}
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Можна вказати лише дату від, дату від–до, тільки час “від”, час “від–до”, або залишити все порожнім.
                </p>
              </section>

              {/* Section: Equipment items */}
              <section className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-gray-400">
                    Техніка ({form.items.length})
                  </h2>
                  <AdminButton type="button" variant="secondary" size="sm" onClick={addItem}>
                    + Додати техніку
                  </AdminButton>
                </div>

                {fieldErrors.itemsGlobal && (
                  <span className="text-xs text-red-500">{fieldErrors.itemsGlobal}</span>
                )}

                <div className="flex flex-col gap-4">
                  {form.items.map((formItem, idx) => {
                    const ie = fieldErrors.items?.[idx];
                    return (
                      <div
                        key={formItem.key}
                        className="relative rounded-xl border border-gray-200 bg-gray-50/50 p-4"
                      >
                        {/* Remove button (only if > 1 item) */}
                        {form.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="absolute top-3 right-3 rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}

                        <div className="mb-1 text-xs font-semibold text-gray-400">
                          Техніка {idx + 1}
                        </div>

                        <div className="flex flex-col gap-3">
                          <div className="flex flex-col gap-1.5">
                            <AdminSelect
                              label="Обладнання"
                              value={formItem.equipmentId}
                              onChange={(e) => updateItem(idx, { equipmentId: e.target.value })}
                            >
                              <option value="">— Оберіть техніку —</option>
                              {equipmentList.map((eq) => (
                                <option key={eq.id} value={eq.id}>{eq.name}</option>
                              ))}
                            </AdminSelect>
                            {ie?.equipmentId && (
                              <span className="text-xs text-red-500">{ie.equipmentId}</span>
                            )}
                          </div>
                          <label className="flex items-center gap-2 text-sm text-gray-600">
                            <input
                              type="checkbox"
                              checked={formItem.useCustomSchedule}
                              onChange={(e) =>
                                updateItem(idx, {
                                  useCustomSchedule: e.target.checked,
                                })
                              }
                              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            Окремі дата і час для цієї техніки
                          </label>
                          {formItem.useCustomSchedule && (
                            <div className="grid gap-3 rounded-lg border border-gray-200 bg-white p-3 sm:grid-cols-2">
                              <div className="flex flex-col gap-1.5">
                                <AdminInput
                                  label="Дата від"
                                  type="date"
                                  value={formItem.scheduledDateFrom}
                                  onChange={(e) => updateItem(idx, { scheduledDateFrom: e.target.value })}
                                />
                                {ie?.scheduledDateFrom && (
                                  <span className="text-xs text-red-500">{ie.scheduledDateFrom}</span>
                                )}
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <AdminInput
                                  label="Дата до"
                                  type="date"
                                  value={formItem.scheduledDateTo}
                                  onChange={(e) => updateItem(idx, { scheduledDateTo: e.target.value })}
                                />
                                {ie?.scheduledDateTo && (
                                  <span className="text-xs text-red-500">{ie.scheduledDateTo}</span>
                                )}
                              </div>
                              <AdminInput
                                label="Час від"
                                type="time"
                                value={formItem.scheduledTimeFrom}
                                onChange={(e) => updateItem(idx, { scheduledTimeFrom: e.target.value })}
                              />
                              <AdminInput
                                label="Час до"
                                type="time"
                                value={formItem.scheduledTimeTo}
                                onChange={(e) => updateItem(idx, { scheduledTimeTo: e.target.value })}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Section: Status & Comment */}
              <section className="flex flex-col gap-4">
                <h2 className="text-sm font-bold uppercase tracking-wide text-gray-400">
                  Статус і коментар
                </h2>
                <AdminSelect
                  label="Статус"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {allStatuses.map((s) => (
                    <option key={s} value={s} disabled={s === "COMPLETED" && form.status !== "COMPLETED"}>
                      {statusMap[s]?.label ?? s}
                    </option>
                  ))}
                </AdminSelect>
                <AdminTextarea
                  label="Коментар"
                  value={form.comment}
                  onChange={(e) => setForm({ ...form, comment: e.target.value })}
                  placeholder="Додатковий коментар…"
                  rows={3}
                />
              </section>
            </div>
          </div>
        </form>

        <ConfirmModal
          open={discardModalOpen}
          title="Скасувати зміни?"
          message="Незбережені зміни буде втрачено."
          confirmLabel="Так, скасувати"
          onConfirm={closeFormImmediately}
          onCancel={() => setDiscardModalOpen(false)}
        />
      </div>
    );
  }

  /* ═══════════════════ DETAIL VIEW ═══════════════════ */

  if (viewMode === "detail" && detailOrder) {
    const order = detailOrder;
    const towDetails = getTowDetailsFromSourceRequest(order.sourceCustomerRequest);
    const materialDeliveryDetails = getMaterialDeliveryDetailsFromSourceRequest(order.sourceCustomerRequest);
    const attributionDetails = getAttributionDetailsFromSourceRequest(order.sourceCustomerRequest);
    const flowSteps = getFlowSteps(order);
    const operationalOverview = getOrderOperationalOverview(order);
    const assignmentCompensationPreview = calculateAssignmentCompensationPreview(
      assignmentCompensationForm,
      detailFinance?.summary.orderTotal ?? order.finalAgreedPrice ?? order.agreedPrice ?? 0,
    );
    const selectedEmployeePendingAssignments = (order.assignments ?? []).filter(
      (assignment) =>
        assignment.employeeId === selectedEmployeeId &&
        assignment.status === "PENDING" &&
        !assignment.telegramMessageId,
    );
    return (
      <div className="flex h-full flex-col font-sans">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={backToList}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            </button>
            <h1 className="text-lg font-bold text-gray-900">Замовлення №{formatOrderNumber(order)}</h1>
            <StatusBadge
              status={statusMap[order.status]?.badge ?? "new"}
              label={statusMap[order.status]?.label}
            />
          </div>
          <div className="flex gap-2">
            <AdminButton variant="secondary" size="sm" onClick={() => startEdit(order)}>
              Редагувати
            </AdminButton>
            <AdminButton
              variant="danger"
              size="sm"
              onClick={() => setDeleteTarget(order.id)}
            >
              Видалити
            </AdminButton>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-6">

            <AvailabilityCheckPanel
              result={detailAvailability}
              loading={detailAvailabilityLoading}
              error={detailAvailabilityError}
              onApplySuggestion={applyNearestScheduleSuggestion}
            />

            {/* Client & Status row */}
            <div className="grid gap-6 sm:grid-cols-2">
              <AdminCard className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-gray-400">Клієнт</h3>
                  {!editingAddress ? (
                    <AdminButton type="button" variant="secondary" size="sm" onClick={() => startAddressEdit(order)}>
                      Редагувати адресу
                    </AdminButton>
                  ) : null}
                </div>
                <DetailField label="№ замовлення" value={formatOrderNumber(order)} />
                <DetailField label="Ім'я" value={order.customerName} />
                <DetailField label="Телефон" value={order.customerPhone} />
                {editingAddress ? (
                  <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
                      Адреса виконання / звідки
                      <AddressAutocompleteInput
                        value={addressForm.addressFrom}
                        onChange={(value) => setAddressForm((prev) => ({ ...prev, addressFrom: value }))}
                        placeholder="Почніть вводити адресу"
                        inputClassName="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
                      Адреса доставки / куди
                      <AddressAutocompleteInput
                        value={addressForm.addressTo}
                        onChange={(value) => setAddressForm((prev) => ({ ...prev, addressTo: value }))}
                        placeholder="Необов’язково"
                        inputClassName="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <AdminButton
                        type="button"
                        size="sm"
                        onClick={() => saveOrderAddress(order.id)}
                        disabled={savingAddress}
                      >
                        {savingAddress ? "Збереження…" : "Зберегти адресу"}
                      </AdminButton>
                      <AdminButton
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setAddressForm({
                            addressFrom: order.addressFrom ?? "",
                            addressTo: order.addressTo ?? "",
                          });
                          setEditingAddress(false);
                        }}
                        disabled={savingAddress}
                      >
                        Скасувати
                      </AdminButton>
                    </div>
                  </div>
                ) : (
                  <>
                    <DetailField label="Адреса виконання" value={order.addressFrom ?? "—"} />
                    <DetailField label="Адреса доставки" value={order.addressTo ?? "—"} />
                  </>
                )}
              </AdminCard>

              <AdminCard className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-gray-400">Інформація</h3>
                  {!editingSchedule && (
                    <AdminButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => startScheduleEdit(order)}
                    >
                      Редагувати дату
                    </AdminButton>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-500">Статус</span>
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      status={statusMap[order.status]?.badge ?? "new"}
                      label={statusMap[order.status]?.label}
                    />
                    <select
                      value={order.status}
                      onChange={(e) => markStatus(order.id, e.target.value)}
                      className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 outline-none focus:border-primary"
                    >
                      {allStatuses.map((s) => (
                        <option key={s} value={s} disabled={s === "COMPLETED" && order.status !== "COMPLETED"}>
                          {statusMap[s]?.label ?? s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <DetailField label="Створено" value={fmtDateTime(order.createdAt)} />
                {editingSchedule ? (
                  <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <AdminInput
                        label="Дата від"
                        type="date"
                        value={scheduleForm.scheduledDate}
                        onChange={(e) => setScheduleForm((prev) => ({ ...prev, scheduledDate: e.target.value }))}
                      />
                      <AdminInput
                        label="Дата до"
                        type="date"
                        value={scheduleForm.scheduledDateTo}
                        onChange={(e) => setScheduleForm((prev) => ({ ...prev, scheduledDateTo: e.target.value }))}
                      />
                      <AdminInput
                        label="Час від"
                        type="time"
                        value={scheduleForm.scheduledTimeFrom}
                        onChange={(e) => setScheduleForm((prev) => ({ ...prev, scheduledTimeFrom: e.target.value }))}
                      />
                      <AdminInput
                        label="Час до"
                        type="time"
                        value={scheduleForm.scheduledTimeTo}
                        onChange={(e) => setScheduleForm((prev) => ({ ...prev, scheduledTimeTo: e.target.value }))}
                      />
                    </div>
                    <p className="text-xs text-amber-800">
                      Після збереження зайнятість техніки буде перерахована автоматично.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <AdminButton
                        type="button"
                        size="sm"
                        onClick={() => saveOrderSchedule(order.id)}
                        disabled={savingSchedule}
                      >
                        {savingSchedule ? "Збереження..." : "Зберегти дату"}
                      </AdminButton>
                      <AdminButton
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setScheduleForm({
                            scheduledDate: order.scheduledDate ? toInputDate(order.scheduledDate) : "",
                            scheduledDateTo: order.scheduledDateTo ? toInputDate(order.scheduledDateTo) : "",
                            scheduledTimeFrom: order.scheduledTimeFrom ?? "",
                            scheduledTimeTo: order.scheduledTimeTo ?? "",
                          });
                          setEditingSchedule(false);
                        }}
                        disabled={savingSchedule}
                      >
                        Скасувати
                      </AdminButton>
                    </div>
                  </div>
                ) : (
                  <>
                    <DetailField
                      label="Дата"
                      value={
                        order.scheduledDate
                          ? order.scheduledDateTo
                            ? `${new Date(order.scheduledDate).toLocaleDateString("uk-UA")} — ${new Date(order.scheduledDateTo).toLocaleDateString("uk-UA")}`
                            : `від ${new Date(order.scheduledDate).toLocaleDateString("uk-UA")}`
                          : "—"
                      }
                    />
                    <DetailField
                      label="Час"
                      value={
                        order.scheduledTimeFrom && order.scheduledTimeTo
                          ? `${order.scheduledTimeFrom} — ${order.scheduledTimeTo}`
                          : order.scheduledTimeFrom
                            ? `від ${order.scheduledTimeFrom}`
                            : order.scheduledTimeTo
                              ? `до ${order.scheduledTimeTo}`
                              : "—"
                      }
                    />
                  </>
                )}
                <DetailField label="Вартість" value={order.agreedPrice != null ? `${order.agreedPrice} грн` : "—"} />
                {order.sourceType === "request" && (
                  <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2">
                    <span className="text-xs font-medium text-blue-700">
                      Із заявки: {order.sourceCustomerRequest?.customerName ?? order.sourceRequest?.customerName ?? order.sourceCustomerRequestId ?? order.sourceRequestId}
                    </span>
                  </div>
                )}
              </AdminCard>
            </div>

            <AdminCard className="flex flex-col gap-4">
              <h3 className="text-sm font-bold uppercase tracking-wide text-gray-400">Операційний стан</h3>
              <div className="grid gap-3 sm:grid-cols-4">
                {flowSteps.map((step) => (
                  <div
                    key={step.label}
                    className={`rounded-xl border px-3 py-3 ${
                      step.state === "done"
                        ? "border-emerald-200 bg-emerald-50"
                        : step.state === "active"
                          ? "border-amber-200 bg-amber-50"
                          : step.state === "blocked"
                            ? "border-red-200 bg-red-50"
                            : "border-gray-200 bg-gray-50"
                    }`}
                  >
                    <div className={`text-xs font-bold uppercase tracking-wide ${
                      step.state === "done"
                        ? "text-emerald-700"
                        : step.state === "active"
                          ? "text-amber-700"
                          : step.state === "blocked"
                            ? "text-red-700"
                            : "text-gray-500"
                    }`}>
                      {step.label}
                    </div>
                    <div className="mt-2 text-sm font-medium leading-snug text-gray-900">{step.detail}</div>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={Boolean(order.showWorkerToCustomer)}
                    disabled={savingWorkerVisibility}
                    onChange={(e) => updateWorkerCustomerVisibility(order.id, e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="flex flex-col gap-1">
                    <span className="text-sm font-bold text-gray-900">
                      Показувати працівника клієнту в кабінеті
                    </span>
                    <span className="text-xs font-medium text-gray-500">
                      {order.latestAssignment?.employee?.fullName
                        ? `Клієнт побачить: ${order.latestAssignment.employee.fullName}${order.latestAssignment.employee.phone ? `, ${order.latestAssignment.employee.phone}` : ""}.`
                        : "Контакт з'явиться після призначення працівника."}
                    </span>
                  </span>
                </label>
              </div>
            </AdminCard>

            {/* Equipment items */}
            <AdminCard className="flex flex-col gap-4">
              <h3 className="text-sm font-bold uppercase tracking-wide text-gray-400">
                Техніка ({getOrderEquipmentList(order).length})
              </h3>
              {getOrderEquipmentList(order).length === 0 ? (
                <p className="text-sm text-gray-400">Немає техніки</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {getOrderEquipmentList(order).map((it, idx) => (
                    <div
                      key={it.id}
                      className="flex items-center gap-4 rounded-lg border border-gray-100 bg-gray-50 p-3"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                        {idx + 1}
                      </div>
                      <div className="flex flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-4">
                        <span className="text-sm font-semibold text-gray-900">
                          {it.name ?? "—"}
                        </span>
                        <span className="text-xs text-gray-500">
                          GPS: {it.trackerDevice?.name ?? "не прив’язано"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </AdminCard>

            {order.sourceCustomerRequest && (
              <AdminCard className="flex flex-col gap-4">
                <h3 className="text-sm font-bold uppercase tracking-wide text-gray-400">Деталі заявки</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailField label="Тип заявки" value={order.sourceCustomerRequest.requestType} />
                  <DetailField label="Клієнт" value={order.sourceCustomerRequest.customerName} />
                  <DetailField label="Телефон" value={order.sourceCustomerRequest.phone} />
                  <DetailField label="Адреса від" value={order.sourceCustomerRequest.addressFrom ?? "—"} />
                  <DetailField label="Адреса до" value={order.sourceCustomerRequest.addressTo ?? "—"} />
                  <DetailField
                    label="Дата"
                    value={
                      order.sourceCustomerRequest.scheduledDate
                        ? new Date(order.sourceCustomerRequest.scheduledDate).toLocaleDateString("uk-UA")
                        : "—"
                    }
                  />
                  <DetailField label="Час" value={order.sourceCustomerRequest.scheduledTime ?? "—"} />
                  <DetailField label="Коментар клієнта" value={order.sourceCustomerRequest.comment ?? "—"} />
                </div>
                {towDetails && towDetails.length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {towDetails.map((field) => (
                      <DetailField
                        key={`${field.label}-${field.value}`}
                        label={field.label}
                        value={field.value}
                      />
                    ))}
                  </div>
                )}
                {materialDeliveryDetails && materialDeliveryDetails.length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {materialDeliveryDetails.map((field) => (
                      <DetailField
                        key={`${field.label}-${field.value}`}
                        label={field.label}
                        value={field.value}
                      />
                    ))}
                  </div>
                )}
                {attributionDetails && attributionDetails.length > 0 && (
                  <div className="rounded-xl border border-sky-100 bg-sky-50 p-3">
                    <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-sky-700">
                      Маркетинг / Attribution
                    </h4>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {attributionDetails.map((field) => (
                        <DetailField
                          key={`${field.label}-${field.value}`}
                          label={field.label}
                          value={field.value}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </AdminCard>
            )}
            <OrderFinancePanel
              key={`${order.id}:${financePanelVersion}`}
              orderId={order.id}
              mode="order-detail"
              sections={["summary", "payments", "priceItems", "worker", "expenses"]}
              employees={employeeOptions.map((employee) => ({
                id: employee.id,
                fullName: employee.fullName,
                role: employee.role,
              }))}
              assignments={(order.assignments ?? []).map((assignment) => ({
                id: assignment.id,
                employeeId: assignment.employeeId,
                employeeName: assignment.employee?.fullName ?? "—",
                equipmentId: assignment.equipmentId ?? null,
                equipmentName: assignment.equipment?.name ?? null,
                status: assignment.status,
              }))}
              executionSessions={(order.executionSessions ?? []).map((session) => {
                const assignment = session.assignmentId
                  ? (order.assignments ?? []).find((item) => item.id === session.assignmentId) ?? null
                  : null;
                return {
                  id: session.id,
                  sequenceNumber: session.sequenceNumber ?? null,
                  employeeName: assignment?.employee?.fullName ?? null,
                  equipmentName: session.equipment?.name ?? assignment?.equipment?.name ?? null,
                  status: session.status,
                  startedAt: session.startedAt ?? null,
                  finishedAt: session.finishedAt ?? null,
                };
              })}
              equipment={equipmentList.map((item) => ({
                id: item.id,
                name: item.name,
              }))}
              workerAssignmentContent={
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-gray-900">Призначення працівників</div>
                  </div>

                  {(order.assignments ?? []).length > 0 ? (
                    <div className="flex flex-col gap-3">
                      {(order.assignments ?? []).map((assignment) => {
                        const execution = operationalOverview.executionByAssignment.get(assignment.id) ?? null;
                        const assignmentSessions = operationalOverview.executionSessionsByAssignment.get(assignment.id) ?? [];
                        const completionStatus = assignment.completionStatus ?? "PENDING";
                        const assignmentSummary = getAssignmentExecutionSummary(
                          assignment.id,
                          assignmentSessions,
                          operationalOverview.executionReportsBySession,
                        );
                        const significantDurationDeviations = getSignificantDurationDeviations(assignmentSessions);
                        const canRecalculateHourlyCompensation = (detailFinance?.workerCompensations ?? []).some((item) =>
                          item.type === "hourly" &&
                          item.rate != null &&
                          (
                            item.assignmentId === assignment.id ||
                            (
                              !item.assignmentId &&
                              item.employeeId === assignment.employeeId &&
                              (item.equipmentId ?? "") === (assignment.equipmentId ?? "")
                            )
                          ),
                        );
                        return (
                          <div key={assignment.id} className="rounded-xl border border-gray-200 bg-white p-3">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                              <div className="text-sm font-semibold text-gray-900">
                                {assignment.employee?.fullName ?? "—"} • {assignment.equipment?.name ?? "Техніка не вказана"}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <StatusBadge
                                  status={
                                    assignment.status === "ACCEPTED"
                                      ? "confirmed"
                                      : assignment.status === "DECLINED"
                                        ? "cancelled"
                                        : assignment.status === "PENDING"
                                          ? "new"
                                          : "inactive"
                                  }
                                  label={assignmentStatusLabels[assignment.status] ?? assignment.status}
                                />
                                <StatusBadge
                                  status={
                                    completionStatus === "COMPLETED"
                                      ? "completed"
                                      : completionStatus === "AWAITING_NEXT_SHIFT"
                                        ? "active"
                                        : completionStatus === "IN_PROGRESS"
                                          ? "active"
                                          : completionStatus === "ACCEPTED"
                                            ? "confirmed"
                                            : completionStatus === "DECLINED"
                                              ? "cancelled"
                                              : "inactive"
                                  }
                                  label={assignmentCompletionStatusLabels[completionStatus] ?? completionStatus}
                                />
                                {execution ? (
                                  <StatusBadge
                                    status={
                                      execution.status === "FINISHED"
                                        ? "completed"
                                        : execution.status === "IN_PROGRESS"
                                          ? "active"
                                          : "inactive"
                                    }
                                    label={executionStatusLabels[execution.status] ?? execution.status}
                                  />
                                ) : null}
                                {assignment.status === "PENDING" ? (
                                  <StatusBadge
                                    status={assignment.telegramMessageId ? "confirmed" : "inactive"}
                                    label={assignment.telegramMessageId ? "надіслано в Telegram" : "ще не надіслано"}
                                  />
                                ) : null}
                              </div>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <DetailField label="Призначено" value={fmtDateTime(assignment.assignedAt)} />
                              <DetailField
                                label="Відповідь"
                                value={assignment.respondedAt ? fmtDateTime(assignment.respondedAt) : "Ще не відповів"}
                              />
                              <DetailField label="Роль" value={assignment.employee?.role ?? "—"} />
                              <DetailField label="GPS" value={assignment.equipment?.trackerDevice?.name ?? "не прив’язано"} />
                              <DetailField
                                label="Планова тривалість"
                                value={fmtDurationMinutes(assignment.plannedDurationMinutes)}
                              />
                              <DetailField
                                label="Завершено"
                                value={assignment.completedAt ? fmtDateTime(assignment.completedAt) : "Ще ні"}
                              />
                              <DetailField
                                label="Коментар завершення"
                                value={assignment.completionComment ?? "—"}
                              />
                              <DetailField
                                label="Наступна зміна"
                                value={assignment.plannedNextStartAt ? fmtDateTime(assignment.plannedNextStartAt) : "Не заплановано"}
                              />
                            </div>
                            {assignmentSessions.length > 0 ? (
                              <div className="mt-4 rounded-xl border border-gray-200 bg-slate-50 p-3">
                                <div className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-400">
                                  Підсумок по призначенню
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                  <DetailField
                                    label="Змін / виїздів"
                                    value={`${assignmentSummary.totalSessions} (${assignmentSummary.finishedSessions} завершено)`}
                                  />
                                  <DetailField
                                    label="Подано звітів"
                                    value={`${assignmentSummary.reportsSubmitted}/${assignmentSummary.totalSessions}`}
                                  />
                                  <DetailField
                                    label="Останній результат"
                                    value={assignmentSummary.lastShiftResult}
                                  />
                                  <DetailField
                                    label="Останній звіт"
                                    value={assignmentSummary.latestSubmittedAt ? fmtDateTime(assignmentSummary.latestSubmittedAt) : "—"}
                                  />
                                  <DetailField
                                    label="Сумарний пробіг"
                                    value={assignmentSummary.hasDistance ? fmtKm(assignmentSummary.totalDistanceKm) : "—"}
                                  />
                                  <DetailField
                                    label="Сумарний час руху"
                                    value={assignmentSummary.hasDriveDuration ? fmtDurationMinutes(assignmentSummary.totalDriveDurationMinutes) : "—"}
                                  />
                                  <DetailField
                                    label="Сумарний час стоянок"
                                    value={assignmentSummary.hasStopDuration ? fmtDurationMinutes(assignmentSummary.totalStopDurationMinutes) : "—"}
                                  />
                                  <DetailField
                                    label="Сумарні мотогодини"
                                    value={assignmentSummary.hasEngineHours ? fmtMaybeNumber(Math.round(assignmentSummary.totalEngineHours * 100) / 100, " год") : "—"}
                                  />
                                </div>
                              </div>
                            ) : null}
                            {significantDurationDeviations.length > 0 ? (
                              <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-950">
                                <div className="font-semibold">Є відхилення від планового часу більше ніж на 1 годину</div>
                                <div className="mt-2 flex flex-col gap-1">
                                  {significantDurationDeviations.map((session) => (
                                    <div key={session.id}>
                                      Зміна #{session.sequenceNumber ?? "—"}: {formatDurationComparison(session)}
                                    </div>
                                  ))}
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  <AdminButton
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => recalculateWorkerCompensationFromActualTime(order, assignment, assignmentSessions)}
                                    disabled={
                                      !canRecalculateHourlyCompensation ||
                                      recalculatingCompensationAssignmentId === assignment.id
                                    }
                                  >
                                    {recalculatingCompensationAssignmentId === assignment.id
                                      ? "Перерахунок..."
                                      : "Перерахувати оплату за фактичним часом"}
                                  </AdminButton>
                                  {!canRecalculateHourlyCompensation ? (
                                    <span className="text-xs text-orange-800">
                                      Перерахунок доступний тільки для погодинної оплати зі ставкою.
                                    </span>
                                  ) : (
                                    <span className="text-xs text-orange-800">
                                      Перерахунок використає сумарний фактичний час усіх завершених змін цього працівника.
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : null}
                            {assignmentSessions.length > 0 ? (
                              <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
                                <div className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-400">
                                  Історія виїздів / змін
                                </div>
                                <div className="flex flex-col gap-3">
                                  {assignmentSessions.map((session) => {
                                    const sessionReport = (operationalOverview.executionReportsBySession.get(session.id) ?? [])[0] ?? null;
                                    const sessionFinance = getExecutionSessionFinanceSummary(session.id, detailFinance);
                                    return (
                                      <div key={session.id} className="rounded-lg border border-gray-200 bg-white p-3">
                                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                          <div className="text-sm font-semibold text-gray-900">
                                            Зміна #{session.sequenceNumber ?? "—"}
                                          </div>
                                          <div className="flex flex-wrap gap-2">
                                            <StatusBadge
                                              status={
                                                session.status === "FINISHED"
                                                  ? "completed"
                                                  : session.status === "IN_PROGRESS"
                                                    ? "active"
                                                    : "inactive"
                                              }
                                              label={executionStatusLabels[session.status] ?? session.status}
                                            />
                                            {sessionReport ? (
                                              <StatusBadge
                                                status={sessionReport.questionnaireStatus === "COMPLETED" ? "completed" : "new"}
                                                label={sessionReport.questionnaireStatus === "COMPLETED" ? "Звіт подано" : "Звіт в процесі"}
                                              />
                                            ) : null}
                                          </div>
                                        </div>
                                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                          <DetailField label="Початок" value={session.startedAt ? fmtDateTime(session.startedAt) : "—"} />
                                          <DetailField label="Завершення" value={session.finishedAt ? fmtDateTime(session.finishedAt) : "—"} />
                                          <DetailField label="Зміна" value={`#${session.sequenceNumber ?? "—"}`} />
                                          <DetailField label="Планова тривалість" value={fmtDurationMinutes(session.plannedDurationMinutes)} />
                                          <DetailField label="План / факт" value={formatDurationComparison(session)} />
                                          <DetailField
                                            label="Підсумок зміни"
                                            value={
                                              sessionReport?.needsNextShift
                                                ? "Потрібен ще виїзд"
                                                : sessionReport?.workCompleted
                                                  ? "Завершено повністю"
                                                  : session.isFinalSession
                                                    ? "Фінальна зміна"
                                                    : "—"
                                            }
                                          />
                                          <DetailField
                                            label="Коментар по зміні"
                                            value={sessionReport?.nextShiftComment ?? session.sessionComment ?? "—"}
                                          />
                                        </div>
                                        {(sessionFinance.payments.length > 0 || sessionFinance.expenses.length > 0) ? (
                                          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                                            <div className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-400">
                                              Фінанси зміни
                                            </div>
                                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                              <DetailField
                                                label="Отримано від клієнта"
                                                value={sessionFinance.clientCash > 0 ? fmtMoney(sessionFinance.clientCash) : "—"}
                                              />
                                              <DetailField
                                                label="Автосписання пального"
                                                value={
                                                  sessionFinance.systemFuelAmount > 0
                                                    ? `${fmtMoney(sessionFinance.systemFuelAmount)}${sessionFinance.systemFuelLiters > 0 ? ` • ${fmtMaybeNumber(sessionFinance.systemFuelLiters, " л")}` : ""}`
                                                    : "—"
                                                }
                                              />
                                              <DetailField
                                                label="Витрати працівника"
                                                value={sessionFinance.employeeExpensesAmount > 0 ? fmtMoney(sessionFinance.employeeExpensesAmount) : "—"}
                                              />
                                              <DetailField
                                                label="Компенсація за пальне"
                                                value={
                                                  sessionFinance.fuelPurchaseCompensationAmount > 0
                                                    ? fmtMoney(sessionFinance.fuelPurchaseCompensationAmount)
                                                    : "—"
                                                }
                                              />
                                            </div>
                                            <div className="mt-3 flex flex-col gap-2 text-xs text-gray-600">
                                              {sessionFinance.payments.map((payment) => (
                                                <div key={payment.id}>
                                                  💵 Платіж: {fmtMoney(payment.amount)} • {fmtDateTime(payment.paidAt)}{payment.comment ? ` • ${payment.comment}` : ""}
                                                </div>
                                              ))}
                                              {sessionFinance.expenses.map((expense) => (
                                                <div key={expense.id}>
                                                  🧾 {expense.type === "fuel" && expense.source === "system"
                                                    ? "Автосписання пального"
                                                    : expense.type === "fuel_purchase"
                                                      ? "Компенсація за пальне працівнику"
                                                      : `Витрата: ${expense.type}`
                                                  }: {fmtMoney(expense.amount)}
                                                  {expense.fuelLiters ? ` • ${fmtMaybeNumber(expense.fuelLiters, " л")}` : ""}
                                                  {expense.comment ? ` • ${expense.comment}` : ""}
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        ) : null}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : null}
                            {(completionStatus === "AWAITING_NEXT_SHIFT" || completionStatus === "COMPLETED") ? (
                              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                                <div className="font-semibold">
                                  {completionStatus === "COMPLETED"
                                    ? "Призначення вже завершене, але менеджер може відкрити ще одну зміну."
                                    : "По цьому призначенню потрібен ще один виїзд."}
                                </div>
                                <div className="mt-1">
                                  {completionStatus === "COMPLETED"
                                    ? "Після збереження плану працівник знову побачить це завдання як активне."
                                    : "Завдання лишається активним до повного завершення."}
                                </div>
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                  <AdminInput
                                    label={completionStatus === "COMPLETED" ? "Відкрити ще одну зміну на час" : "Запланувати наступну зміну"}
                                    type="datetime-local"
                                    value={nextShiftPlans[assignment.id]?.plannedNextStartAt ?? ""}
                                    onChange={(event) =>
                                      setNextShiftPlans((prev) => ({
                                        ...prev,
                                        [assignment.id]: {
                                          ...(prev[assignment.id] ?? emptyNextShiftPlanningForm),
                                          plannedNextStartAt: event.target.value,
                                        },
                                      }))
                                    }
                                  />
                                  <AdminInput
                                    label="Приблизний час зміни, год"
                                    type="number"
                                    min="0"
                                    step="0.25"
                                    value={nextShiftPlans[assignment.id]?.plannedDurationHours ?? ""}
                                    onChange={(event) =>
                                      setNextShiftPlans((prev) => ({
                                        ...prev,
                                        [assignment.id]: {
                                          ...(prev[assignment.id] ?? emptyNextShiftPlanningForm),
                                          plannedDurationHours: event.target.value,
                                        },
                                      }))
                                    }
                                    placeholder="Наприклад: 8"
                                  />
                                  <div className="md:col-span-2">
                                    <AdminTextarea
                                      label={completionStatus === "COMPLETED" ? "Коментар менеджера до нової зміни" : "Коментар менеджера до наступної зміни"}
                                      value={nextShiftPlans[assignment.id]?.completionComment ?? ""}
                                      onChange={(event) =>
                                        setNextShiftPlans((prev) => ({
                                          ...prev,
                                          [assignment.id]: {
                                            ...(prev[assignment.id] ?? emptyNextShiftPlanningForm),
                                            completionComment: event.target.value,
                                          },
                                        }))
                                      }
                                      rows={2}
                                      placeholder="Що треба доробити, коли їхати, що взяти із собою..."
                                    />
                                  </div>
                                  <div className="md:col-span-2">
                                    <AdminButton
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => saveNextShiftPlan(order.id, assignment.id)}
                                      disabled={savingNextShiftAssignmentId === assignment.id}
                                    >
                                      {savingNextShiftAssignmentId === assignment.id
                                        ? "Збереження…"
                                        : completionStatus === "COMPLETED"
                                          ? "Відкрити ще одну зміну"
                                          : "Зберегти план наступної зміни"}
                                    </AdminButton>
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">Працівників ще не призначено.</p>
                  )}

                  <div className="grid gap-3 md:grid-cols-2">
                    <AdminSelect
                      label="Оберіть працівника"
                      value={selectedEmployeeId}
                      onChange={(e) => setSelectedEmployeeId(e.target.value)}
                    >
                      <option value="">— Оберіть працівника —</option>
                      {employeeOptions.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.fullName}{employee.role ? ` • ${employee.role}` : ""}
                        </option>
                        ))}
                    </AdminSelect>
                    <AdminSelect
                      label="Оберіть техніку"
                      value={selectedAssignmentEquipmentId}
                      onChange={(e) => setSelectedAssignmentEquipmentId(e.target.value)}
                    >
                      <option value="">— Оберіть техніку —</option>
                      {getOrderEquipmentList(order).map((equipment) => (
                        <option key={equipment.id} value={equipment.id}>
                          {equipment.name}
                        </option>
                      ))}
                    </AdminSelect>
                    <AdminInput
                      label="Приблизний час виконання, год"
                      type="number"
                      min="0"
                      step="0.25"
                      value={assignmentPlannedDurationHours}
                      onChange={(e) => setAssignmentPlannedDurationHours(e.target.value)}
                      placeholder="Наприклад: 8"
                    />
                    <AdminSelect
                      label="Тип оплати працівнику"
                      value={assignmentCompensationForm.type}
                      onChange={(e) =>
                        setAssignmentCompensationForm((prev) => {
                          const nextType = e.target.value as WorkerCompensationType;
                          if (nextType === "hourly" || nextType === "shift") {
                            return {
                              ...prev,
                              type: nextType,
                              finalAmount: "",
                              percent: "",
                              quantity: nextType === "hourly" ? "" : prev.quantity || "1",
                            };
                          }
                          if (nextType === "percent") {
                            return {
                              ...prev,
                              type: nextType,
                              rate: "",
                              quantity: "1",
                              finalAmount: "",
                            };
                          }
                          return {
                            ...prev,
                            type: nextType,
                            rate: "",
                            quantity: "1",
                            percent: "",
                          };
                        })
                      }
                    >
                      {Object.entries(workerCompensationTypeLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </AdminSelect>

                    {(assignmentCompensationForm.type === "fixed" || assignmentCompensationForm.type === "manual") ? (
                      <AdminInput
                        label="Сума оплати"
                        type="number"
                        min="0"
                        step="0.01"
                        value={assignmentCompensationForm.finalAmount}
                        onChange={(e) =>
                          setAssignmentCompensationForm((prev) => ({ ...prev, finalAmount: e.target.value }))
                        }
                      />
                    ) : null}

                    {(assignmentCompensationForm.type === "hourly" || assignmentCompensationForm.type === "shift") ? (
                      <>
                        <AdminInput
                          label={assignmentCompensationForm.type === "hourly" ? "Ставка за годину" : "Ставка за зміну"}
                          type="number"
                          min="0"
                          step="0.01"
                          value={assignmentCompensationForm.rate}
                          onChange={(e) =>
                            setAssignmentCompensationForm((prev) => ({ ...prev, rate: e.target.value }))
                          }
                        />
                        <AdminInput
                          label={assignmentCompensationForm.type === "hourly" ? "Планові години (необов’язково)" : "Кількість змін"}
                          type="number"
                          min="0"
                          step="0.01"
                          value={assignmentCompensationForm.quantity}
                          onChange={(e) =>
                            setAssignmentCompensationForm((prev) => ({ ...prev, quantity: e.target.value }))
                          }
                        />
                      </>
                    ) : null}

                    {assignmentCompensationForm.type === "percent" ? (
                      <>
                        <AdminInput
                          label="Відсоток"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={assignmentCompensationForm.percent}
                          onChange={(e) =>
                            setAssignmentCompensationForm((prev) => ({ ...prev, percent: e.target.value }))
                          }
                        />
                        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                          <div className="text-xs font-medium uppercase tracking-wide text-gray-400">База розрахунку</div>
                          <div className="mt-1 text-sm font-semibold text-gray-900">
                            {fmtMoney(detailFinance?.summary.orderTotal ?? order.finalAgreedPrice ?? order.agreedPrice ?? 0)}
                          </div>
                        </div>
                      </>
                    ) : null}

                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-amber-700">Орієнтовна зарплата</div>
                      <div className="mt-1 text-sm font-semibold text-amber-950">
                        {assignmentCompensationForm.type === "hourly" && parseNullableNumber(assignmentCompensationForm.quantity) == null
                          ? `${parseNullableNumber(assignmentCompensationForm.rate) ?? 0} грн/год, фінальна сума після завершення`
                          : fmtMoney(assignmentCompensationPreview)}
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <AdminTextarea
                        label="Коментар до оплати"
                        value={assignmentCompensationForm.comment}
                        onChange={(e) =>
                          setAssignmentCompensationForm((prev) => ({ ...prev, comment: e.target.value }))
                        }
                        rows={2}
                        placeholder="Наприклад: 2 години мінімум, остаточне коригування після виконання..."
                      />
                    </div>
                    <div className="md:col-span-2">
                      <AdminTextarea
                        label="Коментар менеджера для працівника"
                        value={workerManagerComment}
                        onChange={(e) => setWorkerManagerComment(e.target.value)}
                        rows={3}
                        placeholder="Наприклад: зателефонувати клієнту за 15 хв до виїзду, потрібні ремені, авто не заводиться..."
                      />
                    </div>
                    <div className="md:col-span-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                      Спочатку додайте всю роботу для працівника у список. Після цього натисніть
                      “Надіслати працівнику в Telegram”, щоб він отримав одне повідомлення з повним переліком задач.
                    </div>
                    <div className="md:col-span-2">
                      <AvailabilityCheckPanel
                        result={assignmentAvailability}
                        loading={assignmentAvailabilityLoading}
                        error={assignmentAvailabilityError}
                      />
                    </div>
                    <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                      <AdminButton onClick={() => assignWorker(order.id)} disabled={assigning}>
                        {assigning ? "Додавання…" : "Додати роботу до списку"}
                      </AdminButton>
                      <AdminButton
                        variant="secondary"
                        onClick={() => notifyWorkerAssignments(order.id)}
                        disabled={
                          !selectedEmployeeId ||
                          selectedEmployeePendingAssignments.length === 0 ||
                          notifyingEmployeeId === selectedEmployeeId
                        }
                      >
                        {notifyingEmployeeId === selectedEmployeeId
                          ? "Відправлення…"
                          : `Надіслати працівнику в Telegram${
                              selectedEmployeePendingAssignments.length > 0
                                ? ` (${selectedEmployeePendingAssignments.length})`
                                : ""
                            }`}
                      </AdminButton>
                      {selectedEmployeeId && selectedEmployeePendingAssignments.length === 0 ? (
                        <span className="text-sm text-gray-500">
                          Для вибраного працівника немає нових робіт, які ще не відправлені.
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              }
              insertAfterWorkerContent={
                <>
                  <AdminCard className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-400">Звіти працівників</h3>
                      {(order.executionReports ?? []).length > 0 ? (
                        <StatusBadge
                          status={
                            operationalOverview.completedAssignments.length === operationalOverview.acceptedAssignments.length &&
                            operationalOverview.acceptedAssignments.length > 0
                              ? "completed"
                              : "new"
                          }
                          label={`${operationalOverview.completedReports.length} звітів • ${operationalOverview.completedAssignments.length}/${Math.max(
                            operationalOverview.acceptedAssignments.length,
                            1,
                          )} завершено`}
                        />
                      ) : null}
                    </div>

                    {(order.executionReports ?? []).length > 0 ? (
                      <div className="flex flex-col gap-4">
                        {operationalOverview.awaitingNextShiftAssignments.length > 0 ? (
                          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                            Є призначення, які вже завершили поточну зміну, але ще чекають наступний виїзд.
                          </div>
                        ) : null}
                        {operationalOverview.finishedAssignments.length > 0 && !canManagerCloseOrder(order) ? (
                          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                            Не всі призначення завершені повністю. Фінальне закриття стане доступним після завершення всіх етапів і звітів.
                          </div>
                        ) : null}
                        {canManagerCloseOrder(order) ? (
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                            Усі звіти працівників заповнені. Замовлення готове до фінального закриття менеджером.
                          </div>
                        ) : null}
                        <div className="flex flex-col gap-3">
                          {(order.executionReports ?? []).map((report) => {
                            const assignment = report.assignmentId
                              ? (order.assignments ?? []).find((item) => item.id === report.assignmentId) ?? null
                              : null;
                            const session = (order.executionSessions ?? []).find((item) => item.id === report.executionSessionId) ?? null;

                            return (
                              <div key={report.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                  <div className="text-sm font-semibold text-gray-900">
                                    {assignment?.employee?.fullName ?? "Працівник"} • {assignment?.equipment?.name ?? session?.equipment?.name ?? "Техніка"} • зміна #{session?.sequenceNumber ?? "—"}
                                  </div>
                                  <StatusBadge
                                    status={report.questionnaireStatus === "COMPLETED" ? "completed" : "new"}
                                    label={report.questionnaireStatus === "COMPLETED" ? "Заповнено" : "В процесі"}
                                  />
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                  <DetailField
                                    label="Готівка"
                                    value={
                                      report.cashCollected == null
                                        ? "—"
                                        : report.cashCollected
                                          ? `Так${report.cashAmount ? ` • ${report.cashAmount} грн` : ""}`
                                          : "Ні"
                                    }
                                  />
                                  <DetailField
                                    label="Додаткові витрати"
                                    value={report.extraExpensesAmount != null ? `${report.extraExpensesAmount} грн` : "Немає"}
                                  />
                                  <DetailField label="Коментар по витратах" value={report.extraExpensesComment ?? "—"} />
                                  <DetailField
                                    label="Проблеми"
                                    value={report.hadProblems == null ? "—" : report.hadProblems ? "Так" : "Ні"}
                                  />
                                  <DetailField label="Коментар по проблемах" value={report.problemsComment ?? "—"} />
                                  <DetailField label="Коментар працівника" value={report.workerComment ?? "—"} />
                                  <DetailField
                                    label="Результат зміни"
                                    value={
                                      report.needsNextShift
                                        ? "Потрібен ще один виїзд"
                                        : report.workCompleted
                                          ? "Роботу завершено повністю"
                                          : "—"
                                    }
                                  />
                                  <DetailField label="План / коментар до наступної зміни" value={report.nextShiftComment ?? "—"} />
                                  <DetailField label="Статус анкети" value={report.questionnaireStatus} />
                                  <DetailField
                                    label="Надіслано"
                                    value={report.submittedAt ? fmtDateTime(report.submittedAt) : "Ще не завершено"}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">Звіти працівників ще не створені.</p>
                    )}
                  </AdminCard>

                  {order.latestExecutionReport ? (
                    <AdminCard className="flex flex-col gap-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold uppercase tracking-wide text-gray-400">GPS та паливо по техніці</h3>
                          <p className="mt-1 text-xs text-gray-500">
                            Ручні дані мають пріоритет. Якщо їх немає, використовується GPS за період виконання замовлення.
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3">
                        {buildExecutionEquipmentRows(order).map((equipmentRow) => (
                          <div key={equipmentRow.equipmentId} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                              <div className="text-sm font-semibold text-gray-900">{equipmentRow.equipmentName}</div>
                              <StatusBadge status={equipmentRow.sourceTone} label={equipmentRow.sourceLabel} />
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                              <DetailField label="Пробіг" value={fmtMaybeNumber(equipmentRow.distanceKm, " км")} />
                              <DetailField label="Час руху" value={fmtMaybeNumber(equipmentRow.driveDurationMinutes, " хв")} />
                              <DetailField label="Час стоянок" value={fmtMaybeNumber(equipmentRow.stopDurationMinutes, " хв")} />
                              <DetailField label="Мотогодини" value={fmtMaybeNumber(equipmentRow.engineHours, " год")} />
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                        <div className="mb-3">
                          <h4 className="text-sm font-bold text-gray-900">Ручне введення показників</h4>
                          <p className="text-xs text-gray-500">
                            Використовуйте, якщо GPS не передав коректні дані. Вручну введені значення мають пріоритет у розрахунках.
                          </p>
                        </div>

                        <div className="rounded-xl border border-gray-200 bg-white p-3">
                          <div className="mb-3 text-sm font-semibold text-gray-900">
                            {order.latestExecutionSession?.equipment?.name ?? "Основна техніка"}
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <AdminInput
                              label="Пробіг, км"
                              type="number"
                              min="0"
                              step="0.01"
                              value={manualExecutionMetricsForm.distanceKm}
                              onChange={(event) =>
                                setManualExecutionMetricsForm((prev) => ({
                                  ...prev,
                                  distanceKm: event.target.value,
                                }))
                              }
                            />
                            <AdminInput
                              label="Час руху, хв"
                              type="number"
                              min="0"
                              step="0.01"
                              value={manualExecutionMetricsForm.driveDurationMinutes}
                              onChange={(event) =>
                                setManualExecutionMetricsForm((prev) => ({
                                  ...prev,
                                  driveDurationMinutes: event.target.value,
                                }))
                              }
                            />
                            <AdminInput
                              label="Час стоянок, хв"
                              type="number"
                              min="0"
                              step="0.01"
                              value={manualExecutionMetricsForm.stopDurationMinutes}
                              onChange={(event) =>
                                setManualExecutionMetricsForm((prev) => ({
                                  ...prev,
                                  stopDurationMinutes: event.target.value,
                                }))
                              }
                            />
                            <AdminInput
                              label="Мотогодини"
                              type="number"
                              min="0"
                              step="0.01"
                              value={manualExecutionMetricsForm.engineHours}
                              onChange={(event) =>
                                setManualExecutionMetricsForm((prev) => ({
                                  ...prev,
                                  engineHours: event.target.value,
                                }))
                              }
                            />
                          </div>
                        </div>

                        {manualExecutionMetricsForm.perEquipmentMetrics.length > 0 ? (
                          <div className="mt-4 border-t border-gray-200 pt-4">
                            <div className="mb-3">
                              <h5 className="text-sm font-semibold text-gray-900">Додаткова техніка в замовленні</h5>
                              <p className="text-xs text-gray-500">
                                Для кожної одиниці техніки можна окремо вказати ручні значення, якщо GPS їх не дав або вони некоректні.
                              </p>
                            </div>
                            <div className="flex flex-col gap-3">
                              {manualExecutionMetricsForm.perEquipmentMetrics.map((item, index) => (
                                <div key={item.equipmentId} className="rounded-xl border border-gray-200 bg-white p-3">
                                  <div className="mb-3 text-sm font-semibold text-gray-900">{item.equipmentName}</div>
                                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                    <AdminInput
                                      label="Пробіг, км"
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={item.distanceKm}
                                      onChange={(event) =>
                                        setManualExecutionMetricsForm((prev) => ({
                                          ...prev,
                                          perEquipmentMetrics: prev.perEquipmentMetrics.map((metric, metricIndex) =>
                                            metricIndex === index
                                              ? { ...metric, distanceKm: event.target.value }
                                              : metric,
                                          ),
                                        }))
                                      }
                                    />
                                    <AdminInput
                                      label="Час руху, хв"
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={item.driveDurationMinutes}
                                      onChange={(event) =>
                                        setManualExecutionMetricsForm((prev) => ({
                                          ...prev,
                                          perEquipmentMetrics: prev.perEquipmentMetrics.map((metric, metricIndex) =>
                                            metricIndex === index
                                              ? { ...metric, driveDurationMinutes: event.target.value }
                                              : metric,
                                          ),
                                        }))
                                      }
                                    />
                                    <AdminInput
                                      label="Час стоянок, хв"
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={item.stopDurationMinutes}
                                      onChange={(event) =>
                                        setManualExecutionMetricsForm((prev) => ({
                                          ...prev,
                                          perEquipmentMetrics: prev.perEquipmentMetrics.map((metric, metricIndex) =>
                                            metricIndex === index
                                              ? { ...metric, stopDurationMinutes: event.target.value }
                                              : metric,
                                          ),
                                        }))
                                      }
                                    />
                                    <AdminInput
                                      label="Мотогодини"
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={item.engineHours}
                                      onChange={(event) =>
                                        setManualExecutionMetricsForm((prev) => ({
                                          ...prev,
                                          perEquipmentMetrics: prev.perEquipmentMetrics.map((metric, metricIndex) =>
                                            metricIndex === index
                                              ? { ...metric, engineHours: event.target.value }
                                              : metric,
                                          ),
                                        }))
                                      }
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-3 flex justify-end">
                          <AdminButton
                            size="sm"
                            disabled={savingManualExecutionMetrics}
                            onClick={() => void saveManualExecutionMetrics(order.id)}
                          >
                            {savingManualExecutionMetrics ? "Збереження..." : "Зберегти і перерахувати пальне"}
                          </AdminButton>
                        </div>
                      </div>
                    </AdminCard>
                  ) : null}
                </>
              }
              onChanged={() => refreshOrderDetail(order.id)}
              onFinanceLoaded={setDetailFinance}
            />

            <AdminAccordionSection
              title="Фінальне закриття"
              subtitle="Остаточна перевірка замовлення і фінальне закриття менеджером."
              badge={
                order.managerClosedAt
                  ? "Закрито"
                  : canManagerCloseOrder(order)
                    ? "Готове"
                    : "Недоступно"
              }
            >
              {order.managerClosedAt ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailField
                    label="Фінальна ціна"
                    value={fmtMaybeNumber(order.finalAgreedPrice, " грн")}
                  />
                  <DetailField
                    label="Отримано готівки"
                    value={fmtMaybeNumber(order.finalCashCollected, " грн")}
                  />
                  <DetailField
                    label="Фінальні витрати"
                    value={fmtMaybeNumber(order.finalExtraExpenses, " грн")}
                  />
                  <DetailField
                    label="Закрив менеджер"
                    value={order.managerClosedBy?.email ?? "—"}
                  />
                  <DetailField
                    label="Закрито"
                    value={order.managerClosedAt ? fmtDateTime(order.managerClosedAt) : "—"}
                  />
                  <DetailField
                    label="Коментар менеджера"
                    value={order.managerCloseComment ?? "—"}
                  />
                </div>
              ) : canManagerCloseOrder(order) ? (
                <div className="flex flex-col gap-4">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    <DetailField
                      label="Погоджено"
                      value={detailFinance ? fmtMoney(detailFinance.summary.orderTotal) : "—"}
                    />
                    <DetailField
                      label="Оплачено"
                      value={detailFinance ? fmtMoney(detailFinance.summary.clientPaid) : "—"}
                    />
                    <DetailField
                      label="Борг клієнта"
                      value={detailFinance ? fmtMoney(detailFinance.summary.clientDebt) : "—"}
                    />
                    <DetailField
                      label="Компанія має виплатити"
                      value={detailFinance ? fmtMoney(detailFinance.summary.companyOwesEmployee) : "—"}
                    />
                    <DetailField
                      label="Готівка до передачі"
                      value={detailFinance ? fmtMoney(detailFinance.summary.employeeOwesCompany) : "—"}
                    />
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                      Перевір GPS, фінансові дані і звіт працівника. Після цього можна закрити замовлення фінально.
                    </div>
                    {detailFinance && detailFinance.summary.clientDebt > 0 ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        Увага: клієнт ще має борг {fmtMoney(detailFinance.summary.clientDebt)}.
                      </div>
                    ) : null}
                    {detailFinance && detailFinance.summary.workerSettlementStatus !== "SETTLED" ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        Увага: розрахунок з працівником ще не закритий.
                      </div>
                    ) : null}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <AdminInput
                      label="Фінальна погоджена ціна, грн"
                      type="number"
                      min="0"
                      value={managerCloseForm.finalAgreedPrice}
                      onChange={(e) =>
                        setManagerCloseForm((prev) => ({
                          ...prev,
                          finalAgreedPrice: e.target.value,
                        }))
                      }
                    />
                    <AdminInput
                      label="Фактично отримано готівки, грн"
                      type="number"
                      min="0"
                      value={managerCloseForm.finalCashCollected}
                      onChange={(e) =>
                        setManagerCloseForm((prev) => ({
                          ...prev,
                          finalCashCollected: e.target.value,
                        }))
                      }
                    />
                    <AdminInput
                      label="Підтверджені додаткові витрати, грн"
                      type="number"
                      min="0"
                      value={managerCloseForm.finalExtraExpenses}
                      onChange={(e) =>
                        setManagerCloseForm((prev) => ({
                          ...prev,
                          finalExtraExpenses: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <AdminTextarea
                    label="Коментар менеджера"
                    rows={3}
                    value={managerCloseForm.managerCloseComment}
                    onChange={(e) =>
                      setManagerCloseForm((prev) => ({
                        ...prev,
                        managerCloseComment: e.target.value,
                      }))
                    }
                    placeholder="Що перевірено, які уточнення були, що важливо зберегти в історії…"
                  />
                  <div className="flex justify-end">
                    <AdminButton
                      size="sm"
                      disabled={!canManagerCloseOrder(order) || closingOrder}
                      onClick={() => closeOrder(order.id)}
                    >
                      {closingOrder ? "Закриття…" : "Закрити замовлення"}
                    </AdminButton>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  Фінальне закриття стане доступним після завершення роботи працівником і заповнення підсумкового звіту.
                </p>
              )}
            </AdminAccordionSection>

            <AdminAccordionSection
              title="Журнал подій"
              subtitle="Хронологія ключових змін по замовленню."
              badge={String(order.eventLogs?.length ?? 0)}
            >
              {order.eventLogs && order.eventLogs.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {order.eventLogs.map((event) => (
                    <div key={event.id} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm font-semibold text-gray-900">
                          {formatEventType(event.eventType)}
                        </div>
                        <div className="text-xs text-gray-500">{fmtDateTime(event.createdAt)}</div>
                      </div>
                      <div className="mt-1 text-sm text-gray-600">{summarizeEvent(event)}</div>
                      {(event.createdByAdmin?.email || event.assignmentEmployeeName) && (
                        <div className="mt-2 text-xs text-gray-500">
                          {event.createdByAdmin?.email
                            ? `Менеджер: ${event.createdByAdmin.email}`
                            : `Працівник: ${event.assignmentEmployeeName}`}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Подій для цього замовлення поки немає.</p>
              )}
            </AdminAccordionSection>

            {/* Quick status actions */}
            <div className="flex flex-wrap gap-2">
              {order.status !== "CONFIRMED" && (
                <AdminButton size="sm" onClick={() => markStatus(order.id, "CONFIRMED")}>
                  Підтвердити
                </AdminButton>
              )}
              {order.status !== "ACTIVE" && (
                <AdminButton variant="secondary" size="sm" onClick={() => markStatus(order.id, "ACTIVE")}>
                  Активувати
                </AdminButton>
              )}
              {order.status !== "CANCELLED" && (
                <AdminButton variant="ghost" size="sm" onClick={() => markStatus(order.id, "CANCELLED")}>
                  Скасувати
                </AdminButton>
              )}
            </div>
          </div>
        </div>

        <ConfirmModal
          open={!!deleteTarget}
          title="Видалення замовлення"
          message="Ви впевнені, що хочете видалити це замовлення? Цю дію неможливо скасувати."
          confirmLabel="Видалити"
          onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      </div>
    );
  }

  /* ═══════════════════ LIST VIEW ═══════════════════ */

  return (
    <div className="flex h-full flex-col gap-4 font-sans">
      {/* Header */}
      <AdminPageHeader
        title="Замовлення"
        subtitle={`${items.length} замовлень${newCount > 0 ? ` • ${newCount} нових` : ""}`}
      >
        <div className="flex gap-2">
          <AdminButton variant="secondary" size="sm" onClick={loadItems}>
            Оновити
          </AdminButton>
          <AdminButton size="sm" onClick={startCreate}>
            + Нове замовлення
          </AdminButton>
        </div>
      </AdminPageHeader>

      {/* Filters */}
      <AdminFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Пошук за ім'ям, телефоном або технікою…"
      >
        <div className="w-full sm:w-44">
          <AdminSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">Всі статуси</option>
            {allStatuses.map((s) => (
              <option key={s} value={s}>{statusMap[s]?.label ?? s}</option>
            ))}
          </AdminSelect>
        </div>
        {newCount > 0 && (
          <AdminButton
            variant={statusFilter === "NEW" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setStatusFilter(statusFilter === "NEW" ? "all" : "NEW")}
          >
            Лише нові ({newCount})
          </AdminButton>
        )}
      </AdminFilterBar>

      {/* Table */}
      <AdminCard className="flex flex-1 flex-col overflow-hidden p-0">
        {/* Header row */}
        <div className="hidden gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2.5 lg:flex">
          <span className="w-[90px] shrink-0 text-xs font-semibold text-gray-500">№</span>
          <span className="w-[160px] shrink-0 text-xs font-semibold text-gray-500">Клієнт</span>
          <span className="w-[120px] shrink-0 text-xs font-semibold text-gray-500">Телефон</span>
          <span className="w-[180px] shrink-0 text-xs font-semibold text-gray-500">Техніка</span>
          <span className="w-[170px] shrink-0 text-xs font-semibold text-gray-500">Період</span>
          <span className="w-[100px] shrink-0 text-xs font-semibold text-gray-500">Статус</span>
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <AdminTableRowsSkeleton rows={6} cols={5} />
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-400">Замовлень не знайдено</p>
          ) : (
            filtered.map((order) => {
              const isNew = order.status === "NEW";
              return (
                <div
                  key={order.id}
                  onClick={() => {
                    setDetailOrder(order);
                    setViewMode("detail");
                    navigate(getOrderDetailPath(order));
                  }}
                  className={`flex cursor-pointer flex-col gap-1 border-b border-gray-100 px-4 py-3 transition-colors last:border-b-0 hover:bg-gray-50/60 lg:flex-row lg:items-center lg:gap-2 ${
                    isNew ? "bg-blue-50/40" : ""
                  }`}
                >
                  <div className="flex items-center justify-between lg:contents">
                    <span className="text-xs font-bold text-gray-500 lg:w-[90px] lg:shrink-0 lg:text-sm lg:text-gray-700">
                      №{formatOrderNumber(order)}
                    </span>
                    <span className={`truncate text-sm lg:w-[160px] lg:shrink-0 ${isNew ? "font-bold text-gray-900" : "font-medium text-gray-700"}`}>
                      {order.customerName}
                    </span>
                    <span className="lg:order-5 lg:w-[100px] lg:shrink-0">
                      <StatusBadge
                        status={statusMap[order.status]?.badge ?? "new"}
                        label={statusMap[order.status]?.label}
                      />
                    </span>
                  </div>
                  <div className="flex items-center justify-between lg:contents">
                    <span className="text-sm text-gray-600 lg:w-[120px] lg:shrink-0">
                      {order.customerPhone}
                    </span>
                    <span className="truncate text-sm text-gray-600 lg:w-[180px] lg:shrink-0">
                      {equipmentSummary(getOrderEquipmentList(order))}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400 lg:w-[170px] lg:shrink-0">
                    {orderScheduleSummary(order)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </AdminCard>

      <ConfirmModal
        open={!!deleteTarget}
        title="Видалення замовлення"
        message="Ви впевнені, що хочете видалити це замовлення? Цю дію неможливо скасувати."
        confirmLabel="Видалити"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

/* ── Detail field ── */

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  );
}
