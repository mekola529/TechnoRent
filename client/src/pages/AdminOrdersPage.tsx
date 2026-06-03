import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import { parseOrderComment } from "../utils/orderComment";
import { AdminTableRowsSkeleton } from "../components/Skeleton";
import {
  AdminButton,
  AdminCard,
  AdminFilterBar,
  AdminInput,
  AdminPageHeader,
  AdminSelect,
  ConfirmModal,
  StatusBadge,
} from "../components/admin";
import type { Status } from "../components/admin/StatusBadge";

interface CustomerRequestItem {
  id: string;
  itemType: string;
  refId: string | null;
  titleSnapshot: string;
  quantity: number;
  unit: string | null;
  notes: string | null;
}

interface MaterialDeliverySnapshot {
  servicePricingType?: "material_delivery_calculator";
  calculationMode?: string | null;
  requestMode?: string | null;
  selectedMaterialId?: string | null;
  selectedMaterialName?: string | null;
  quantity?: number | null;
  unit?: string | null;
  deliveryRatePerKm?: number | null;
  materialCost?: number | null;
  deliveryCost?: number | null;
  totalEstimatedCost?: number | null;
  truckToPointKm?: number | null;
  pointToClientKm?: number | null;
  chosenSupplierPointId?: string | null;
  chosenSupplierPointName?: string | null;
  chosenSupplierPointAddress?: string | null;
  chosenSupplierPointCoordinates?: { lat?: number | null; lon?: number | null } | null;
  chosenOfferUnitPrice?: number | null;
  chosenEquipmentId?: string | null;
  chosenEquipmentName?: string | null;
  alternativesSnapshot?: Array<Record<string, unknown>>;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  deliveryAddress?: string | null;
  deliveryCoordinates?: { lat?: number | null; lon?: number | null } | null;
  customerComment?: string | null;
  calculatedAt?: string | null;
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

interface AdminRequest {
  id: string;
  source: string;
  requestType: string;
  status: string;
  customerName: string;
  phone: string;
  email: string | null;
  addressFrom: string | null;
  addressTo: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  comment: string | null;
  metadata: {
    equipmentId?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    serviceType?: string | null;
    serviceName?: string | null;
    attribution?: LeadAttributionSnapshot | null;
    tow?: {
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
    } | null;
    materialDelivery?: MaterialDeliverySnapshot | null;
  } | null;
  convertedOrderId: string | null;
  convertedOrders?: Array<{ id: string }>;
  legacyOrderId: string | null;
  legacyServiceRequestId: string | null;
  createdAt: string;
  updatedAt: string;
  items: CustomerRequestItem[];
  attribution?: AttributionSummary | null;
}

const statusMap: Record<string, { badge: Status; label: string }> = {
  NEW: { badge: "new", label: "Нова" },
  CONFIRMED: { badge: "confirmed", label: "Підтверджена" },
  IN_PROGRESS: { badge: "in_progress", label: "В обробці" },
  CONVERTED: { badge: "rent", label: "Переведена в замовлення" },
  COMPLETED: { badge: "completed", label: "Завершена" },
  CANCELLED: { badge: "cancelled", label: "Скасована" },
};

const allStatuses = ["NEW", "CONFIRMED", "IN_PROGRESS", "CONVERTED", "COMPLETED", "CANCELLED"];

const requestTypeLabels: Record<string, string> = {
  equipment_rental: "Оренда техніки",
  service: "Послуга",
  tow: "Евакуатор",
  callback: "Зворотний дзвінок",
};

const sourceLabels: Record<string, string> = {
  site: "Сайт",
  telegram: "Telegram",
  phone: "Телефон",
  manual: "Вручну",
};

const trafficSourceLabels: Record<string, string> = {
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

function fmtDateTime(iso: string) {
  const date = new Date(iso);
  return (
    date.toLocaleDateString("uk") +
    " " +
    date.toLocaleTimeString("uk", { hour: "2-digit", minute: "2-digit" })
  );
}

function getRequestTypeLabel(value: string) {
  return requestTypeLabels[value] ?? value;
}

function getSourceLabel(value: string) {
  return sourceLabels[value] ?? value;
}

function getTrafficSourceLabel(value: string | null | undefined) {
  if (!value) return "—";
  return trafficSourceLabels[value] ?? value;
}

function getPrimaryItem(request: AdminRequest) {
  return request.items[0]?.titleSnapshot ?? getRequestTypeLabel(request.requestType);
}

function getItemsSummary(request: AdminRequest) {
  if (request.items.length === 0) {
    return getRequestTypeLabel(request.requestType);
  }

  const first = request.items[0]?.titleSnapshot ?? "—";
  if (request.items.length === 1) return first;
  return `${first} +${request.items.length - 1}`;
}

function parseDisplayNumber(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value
    .replace(/\s+/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildOrderPrefill(request: AdminRequest) {
  const equipmentItem = request.items.find((item) => item.itemType === "equipment");
  const materialDelivery = getMaterialDeliveryMetaFromRequest(request);
  const towMeta = request.metadata?.tow;
  return {
    id: request.id,
    legacyOrderId: request.legacyOrderId,
    requestType: request.requestType,
    customerName: request.customerName,
    phone: request.phone,
    equipmentId:
      equipmentItem?.refId ??
      materialDelivery?.chosenEquipmentId ??
      towMeta?.selectedEquipmentId ??
      request.metadata?.equipmentId ??
      "",
    itemTitle: getPrimaryItem(request),
    addressFrom: request.addressFrom,
    scheduledDate: request.scheduledDate,
    scheduledTime: request.scheduledTime,
    comment: request.comment,
    dateFrom: request.metadata?.dateFrom ?? materialDelivery?.scheduledDate ?? null,
    dateTo: request.metadata?.dateTo ?? null,
    agreedPrice: materialDelivery?.totalEstimatedCost ?? parseDisplayNumber(towMeta?.estimatedCost),
    materialDelivery,
    tow: towMeta ?? null,
  };
}

function formatMoney(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(value)} грн`;
}

function formatKm(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 1 }).format(value)} км`;
}

function formatMaterialMode(value: string | null | undefined) {
  if (value === "urgent_live") return "Чим швидше: від поточного GPS";
  if (value === "scheduled_base") return "Заплановано: від бази техніки";
  if (value === "urgent") return "Чим швидше";
  if (value === "scheduled") return "На запланований час";
  return value ?? "—";
}

function getMaterialDeliveryMetaFromRequest(request: AdminRequest | null) {
  const materialDelivery = request?.metadata?.materialDelivery;
  return materialDelivery?.servicePricingType === "material_delivery_calculator"
    ? materialDelivery
    : null;
}

function getMaterialDeliveryFields(request: AdminRequest | null) {
  const materialDelivery = getMaterialDeliveryMetaFromRequest(request);
  if (!materialDelivery) return null;

  const quantityLabel = [
    materialDelivery.quantity != null
      ? new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(materialDelivery.quantity)
      : null,
    materialDelivery.unit ?? null,
  ].filter(Boolean).join(" ");

  const mainFields = [
    materialDelivery.selectedMaterialName ? { label: "Матеріал", value: materialDelivery.selectedMaterialName } : null,
    quantityLabel ? { label: "Кількість", value: quantityLabel } : null,
    materialDelivery.deliveryAddress ?? request?.addressFrom
      ? { label: "Адреса доставки", value: materialDelivery.deliveryAddress ?? request?.addressFrom ?? "" }
      : null,
    { label: "Режим", value: formatMaterialMode(materialDelivery.calculationMode ?? materialDelivery.requestMode) },
    materialDelivery.scheduledDate
      ? {
          label: "Планова дата",
          value: `${new Date(materialDelivery.scheduledDate).toLocaleDateString("uk-UA")}${materialDelivery.scheduledTime ? `, ${materialDelivery.scheduledTime}` : ""}`,
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  const costFields = [
    { label: "Матеріал", value: formatMoney(materialDelivery.materialCost) },
    { label: "Доставка", value: formatMoney(materialDelivery.deliveryCost) },
    { label: "Разом", value: formatMoney(materialDelivery.totalEstimatedCost) },
    materialDelivery.deliveryRatePerKm != null
      ? { label: "Тариф доставки", value: `${formatMoney(materialDelivery.deliveryRatePerKm)} / км` }
      : null,
    materialDelivery.chosenOfferUnitPrice != null
      ? { label: "Ціна матеріалу", value: `${formatMoney(materialDelivery.chosenOfferUnitPrice)} / ${materialDelivery.unit ?? "од."}` }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  const logisticsFields = [
    materialDelivery.chosenEquipmentName ? { label: "Техніка", value: materialDelivery.chosenEquipmentName } : null,
    materialDelivery.chosenSupplierPointName ? { label: "Обрана точка", value: materialDelivery.chosenSupplierPointName } : null,
    materialDelivery.chosenSupplierPointAddress ? { label: "Адреса точки", value: materialDelivery.chosenSupplierPointAddress } : null,
    { label: "Техніка → точка", value: formatKm(materialDelivery.truckToPointKm) },
    { label: "Точка → клієнт", value: formatKm(materialDelivery.pointToClientKm) },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return {
    mainFields,
    costFields,
    logisticsFields,
    alternatives: materialDelivery.alternativesSnapshot ?? [],
  };
}

function getTowFields(comment: string | null) {
  if (!comment) {
    return {
      routeFields: [] as Array<{ label: string; value: string }>,
      extraFields: [] as Array<{ label: string; value: string }>,
      destination: null as string | null,
      note: null as string | null,
    };
  }

  const parsed = parseOrderComment(comment);
  const routeLabels = new Set([
    "Поточна позиція евакуатора",
    "Подача евакуатора",
    "Час подачі",
    "Маршрут клієнта",
    "Час евакуації",
    "Загальний маршрут",
    "Тариф",
    "Орієнтовна вартість",
  ]);

  const routeFields = parsed.fields.filter((field) => routeLabels.has(field.label));
  const extraFields = parsed.fields.filter(
    (field) =>
      field.label !== "Куди доставити" &&
      !routeFields.some((routeField) => routeField.label === field.label && routeField.value === field.value),
  );

  return {
    routeFields,
    extraFields,
    destination: parsed.fields.find((field) => field.label === "Куди доставити")?.value ?? null,
    note: parsed.note,
  };
}

function getTowMetaFromRequest(request: AdminRequest | null) {
  const tow = request?.metadata?.tow;
  if (!tow) {
    return null;
  }

  const routeFields = [
    tow.truckDispatchDistance ? { label: "Подача евакуатора", value: tow.truckDispatchDistance } : null,
    tow.truckDispatchEta ? { label: "Час подачі", value: tow.truckDispatchEta } : null,
    tow.clientRouteDistance ? { label: "Маршрут клієнта", value: tow.clientRouteDistance } : null,
    tow.clientRouteEta ? { label: "Час евакуації", value: tow.clientRouteEta } : null,
    tow.totalRouteDistance ? { label: "Загальний маршрут", value: tow.totalRouteDistance } : null,
    tow.tariffLabel ? { label: "Тариф", value: tow.tariffLabel } : null,
    tow.estimatedCost ? { label: "Орієнтовна вартість", value: tow.estimatedCost } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  const extraFields = [
    tow.towVehicleLabel ? { label: "Евакуатор", value: tow.towVehicleLabel } : null,
    tow.truckCurrentPosition ? { label: "Поточна позиція евакуатора", value: tow.truckCurrentPosition } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return {
    routeFields,
    extraFields,
    destination: tow.destinationAddress ?? request?.addressTo ?? null,
    note: tow.customerComment ?? request?.comment ?? null,
  };
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function summarizeMaterialAlternative(alternative: Record<string, unknown>, index: number) {
  const supplierPoint = readRecord(alternative.supplierPoint);
  const equipment = readRecord(alternative.equipment);
  const totalCost = readNumber(alternative.totalCost);
  const supplierName = readText(supplierPoint?.name) ?? "Точка постачання";
  const equipmentName = readText(equipment?.name);
  const totalLabel = totalCost !== null ? formatMoney(totalCost) : null;

  return [
    `${index + 1}. ${supplierName}`,
    equipmentName ? `техніка: ${equipmentName}` : null,
    totalLabel ? `разом: ${totalLabel}` : null,
  ].filter(Boolean).join(" • ");
}

function formatAttributionChannel(touch: AttributionTouchSnapshot | null | undefined) {
  if (!touch) return "—";
  const parts = [touch.utmSource, touch.utmMedium, touch.utmCampaign].filter(Boolean);
  if (parts.length > 0) return parts.join(" / ");
  if (touch.trackingCode) return `tracking: ${touch.trackingCode}`;
  if (touch.referrer) return touch.referrer;
  return "—";
}

function buildAttributionFields(attribution: AttributionSummary | LeadAttributionSnapshot | null | undefined) {
  if (!attribution) return [];

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

export default function AdminOrdersPage() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [trafficSourceFilter, setTrafficSourceFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AdminRequest | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  async function loadRequests() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (trafficSourceFilter !== "all") params.set("trafficSource", trafficSourceFilter);
      if (campaignFilter.trim()) params.set("campaign", campaignFilter.trim());
      const qs = params.toString();
      const data = await apiFetch<AdminRequest[]>(`/admin/requests${qs ? `?${qs}` : ""}`);
      setRequests(data);
      setSelected((prev) => data.find((item) => item.id === prev?.id) ?? data[0] ?? null);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRequests();
  }, [statusFilter, trafficSourceFilter, campaignFilter]);

  const newCount = requests.filter((request) => request.status === "NEW").length;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return requests;

    return requests.filter((request) => {
      const haystack = [
        request.customerName,
        request.phone,
        request.email ?? "",
        request.addressFrom ?? "",
        request.addressTo ?? "",
        getItemsSummary(request),
        getRequestTypeLabel(request.requestType),
        request.attribution?.trackingLinkName ?? "",
        request.attribution?.trackingCode ?? "",
        request.attribution?.utmCampaign ?? "",
        getTrafficSourceLabel(request.attribution?.trafficSource),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [requests, search]);

  async function markStatus(id: string, status: string) {
    try {
      const updated = await apiFetch<AdminRequest>(`/admin/requests/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });

      setRequests((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setSelected((prev) => (prev?.id === updated.id ? updated : prev));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Помилка");
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiFetch(`/admin/requests/${id}`, { method: "DELETE" });
      setRequests((prev) => prev.filter((item) => item.id !== id));
      setSelected((prev) => (prev?.id === id ? null : prev));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Помилка");
    }
    setDeleteTarget(null);
  }

  const towMeta = getTowMetaFromRequest(selected) ?? getTowFields(selected?.comment ?? null);
  const materialDeliveryDetails = getMaterialDeliveryFields(selected);
  const attributionFields = buildAttributionFields(selected?.attribution ?? selected?.metadata?.attribution);
  const detailStatusOptions =
    selected?.status === "CONVERTED"
      ? allStatuses
      : allStatuses.filter((status) => status !== "CONVERTED");

  return (
    <div className="flex h-full flex-col gap-4 font-sans">
      <AdminPageHeader
        title="Заявки"
        subtitle={`${requests.length} заявок${newCount > 0 ? ` • ${newCount} нових` : ""}`}
      >
        <AdminButton variant="secondary" size="sm" onClick={loadRequests}>
          Оновити
        </AdminButton>
      </AdminPageHeader>

      <AdminFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Пошук за клієнтом, телефоном, адресою або позицією…"
      >
        <div className="w-full sm:w-52">
          <AdminSelect value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">Всі статуси</option>
            {allStatuses.map((status) => (
              <option key={status} value={status}>
                {statusMap[status]?.label ?? status}
              </option>
            ))}
          </AdminSelect>
        </div>
        <div className="w-full sm:w-52">
          <AdminSelect value={trafficSourceFilter} onChange={(event) => setTrafficSourceFilter(event.target.value)}>
            <option value="all">Всі джерела</option>
            {Object.entries(trafficSourceLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </AdminSelect>
        </div>
        <div className="w-full sm:w-56">
          <AdminInput
            placeholder="Кампанія…"
            value={campaignFilter}
            onChange={(event) => setCampaignFilter(event.target.value)}
          />
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

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        <AdminCard className="flex flex-1 flex-col overflow-hidden p-0">
          <div className="hidden gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2.5 lg:flex">
            <span className="w-[170px] shrink-0 text-xs font-semibold text-gray-500">Клієнт</span>
            <span className="w-[120px] shrink-0 text-xs font-semibold text-gray-500">Телефон</span>
            <span className="w-[130px] shrink-0 text-xs font-semibold text-gray-500">Тип</span>
            <span className="w-[150px] shrink-0 text-xs font-semibold text-gray-500">Позиція</span>
            <span className="w-[140px] shrink-0 text-xs font-semibold text-gray-500">Джерело</span>
            <span className="w-[90px] shrink-0 text-xs font-semibold text-gray-500">Статус</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <AdminTableRowsSkeleton rows={6} cols={6} />
            ) : filtered.length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-400">Заявок не знайдено</p>
            ) : (
              filtered.map((request) => {
                const isSelected = selected?.id === request.id;
                const isNew = request.status === "NEW";

                return (
                  <div
                    key={request.id}
                    onClick={() => setSelected(request)}
                    className={`flex cursor-pointer flex-col gap-1 border-b border-gray-100 px-4 py-3 transition-colors last:border-b-0 hover:bg-gray-50/60 lg:flex-row lg:items-center lg:gap-2 ${
                      isSelected ? "bg-primary/5 ring-1 ring-inset ring-primary/20" : ""
                    } ${isNew && !isSelected ? "bg-blue-50/40" : ""}`}
                  >
                    <div className="flex items-center justify-between lg:contents">
                      <span className={`truncate text-sm lg:w-[170px] lg:shrink-0 ${isNew ? "font-bold text-gray-900" : "font-medium text-gray-700"}`}>
                        {request.customerName}
                      </span>
                      <span className="lg:order-5 lg:w-[90px] lg:shrink-0">
                        <StatusBadge
                          status={statusMap[request.status]?.badge ?? "new"}
                          label={statusMap[request.status]?.label ?? request.status}
                        />
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 lg:contents">
                      <span className="text-sm text-gray-600 lg:w-[120px] lg:shrink-0">{request.phone}</span>
                      <span className="truncate text-sm text-gray-600 lg:w-[130px] lg:shrink-0">
                        {getRequestTypeLabel(request.requestType)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 lg:contents">
                      <span className="truncate text-sm text-gray-600 lg:w-[150px] lg:shrink-0">
                        {getItemsSummary(request)}
                      </span>
                      <span className="truncate text-xs font-semibold text-sky-700 lg:w-[140px] lg:shrink-0">
                        {getTrafficSourceLabel(request.attribution?.trafficSource)}
                      </span>
                      <span className="text-xs text-gray-400">{new Date(request.createdAt).toLocaleDateString("uk")}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </AdminCard>

        {selected && (
          <AdminCard className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto lg:w-[380px]">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Деталі заявки</h2>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 lg:hidden"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-gray-500">Статус</span>
              <div className="flex items-center gap-2">
                <StatusBadge
                  status={statusMap[selected.status]?.badge ?? "new"}
                  label={statusMap[selected.status]?.label ?? selected.status}
                />
                <select
                  value={selected.status}
                  onChange={(event) => markStatus(selected.id, event.target.value)}
                  className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 outline-none focus:border-primary"
                >
                  {detailStatusOptions.map((status) => (
                    <option key={status} value={status}>
                      {statusMap[status]?.label ?? status}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <DetailField label="Тип заявки" value={getRequestTypeLabel(selected.requestType)} />
            <DetailField label="Джерело" value={getSourceLabel(selected.source)} />
            {selected.attribution?.trafficSource && (
              <DetailField label="Маркетингове джерело" value={getTrafficSourceLabel(selected.attribution.trafficSource)} />
            )}
            <DetailField label="Клієнт" value={selected.customerName} />
            <DetailField label="Телефон" value={selected.phone} />
            {selected.email && <DetailField label="Email" value={selected.email} />}
            {selected.addressFrom && <DetailField label="Адреса" value={selected.addressFrom} />}
            {selected.addressTo && <DetailField label="Куди" value={selected.addressTo} />}
            {selected.scheduledDate && (
              <DetailField
                label="Планова дата"
                value={new Date(selected.scheduledDate).toLocaleDateString("uk")}
              />
            )}
            {selected.scheduledTime && <DetailField label="Плановий час" value={selected.scheduledTime} />}
            <DetailField label="Створено" value={fmtDateTime(selected.createdAt)} />

            {selected.items.length > 0 && (
              <div className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-gray-50/80 p-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Позиції ({selected.items.length})
                </span>
                <div className="flex flex-col gap-2">
                  {selected.items.map((item) => (
                    <div key={item.id} className="rounded-lg border border-white bg-white px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-gray-800">{item.titleSnapshot}</span>
                        <span className="text-xs text-gray-500">
                          {item.quantity}
                          {item.unit ? ` ${item.unit}` : ""}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {item.itemType === "equipment" ? "Техніка" : item.itemType === "service" ? "Послуга" : item.itemType}
                      </div>
                      {item.notes && <p className="mt-1.5 text-xs text-gray-600">{item.notes}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {materialDeliveryDetails && (
              <div className="flex flex-col gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Доставка матеріалів
                </span>
                <div className="grid gap-3 sm:grid-cols-2">
                  {materialDeliveryDetails.mainFields.map((field) => (
                    <DetailField key={`${field.label}-${field.value}`} label={field.label} value={field.value} />
                  ))}
                </div>
                <div className="rounded-lg border border-emerald-100 bg-white/80 p-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    Розбивка вартості
                  </span>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {materialDeliveryDetails.costFields.map((field) => (
                      <DetailField key={`${field.label}-${field.value}`} label={field.label} value={field.value} />
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-emerald-100 bg-white/80 p-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    Логістика
                  </span>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {materialDeliveryDetails.logisticsFields.map((field) => (
                      <DetailField key={`${field.label}-${field.value}`} label={field.label} value={field.value} />
                    ))}
                  </div>
                </div>
                {materialDeliveryDetails.alternatives.length > 1 && (
                  <div className="rounded-lg border border-emerald-100 bg-white/80 p-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      Альтернативні варіанти
                    </span>
                    <div className="mt-2 flex flex-col gap-1.5">
                      {materialDeliveryDetails.alternatives.slice(0, 5).map((alternative, index) => (
                        <p key={index} className="text-xs leading-relaxed text-gray-700">
                          {summarizeMaterialAlternative(alternative, index)}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {(towMeta.routeFields.length > 0 || towMeta.destination || towMeta.extraFields.length > 0) && (
              <div className="flex flex-col gap-2 rounded-xl border border-amber-100 bg-amber-50 p-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  Дані калькулятора
                </span>
                {towMeta.destination && <DetailField label="Куди доставити" value={towMeta.destination} />}
                {towMeta.routeFields.map((field) => (
                  <DetailField key={`${field.label}-${field.value}`} label={field.label} value={field.value} />
                ))}
                {towMeta.extraFields.map((field) => (
                  <DetailField key={`${field.label}-${field.value}`} label={field.label} value={field.value} />
                ))}
              </div>
            )}

            {selected.comment && (
              <div className="flex flex-col gap-1.5 rounded-lg bg-amber-50 p-3">
                <span className="text-xs font-medium text-gray-500">Коментар</span>
                <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
                  {towMeta.note ?? selected.comment}
                </p>
              </div>
            )}

            {attributionFields.length > 0 && (
              <div className="flex flex-col gap-2 rounded-xl border border-sky-100 bg-sky-50 p-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                  Маркетинг / Attribution
                </span>
                <div className="grid gap-3 sm:grid-cols-2">
                  {attributionFields.map((field) => (
                    <DetailField key={`${field.label}-${field.value}`} label={field.label} value={field.value} />
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
              {selected.convertedOrderId ? (
                <AdminButton
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    navigate("/admin/rent-orders", {
                      state: { openOrderId: selected.convertedOrderId },
                    })
                  }
                >
                  Відкрити замовлення
                </AdminButton>
              ) : (
                <AdminButton
                  size="sm"
                  onClick={() =>
                    navigate("/admin/rent-orders", {
                      state: { fromRequest: buildOrderPrefill(selected) },
                    })
                  }
                >
                  Створити замовлення
                </AdminButton>
              )}
              {selected.status !== "CONFIRMED" && selected.status !== "CONVERTED" && (
                <AdminButton size="sm" onClick={() => markStatus(selected.id, "CONFIRMED")}>
                  Підтвердити
                </AdminButton>
              )}
              {selected.status !== "IN_PROGRESS" && selected.status !== "CONVERTED" && (
                <AdminButton variant="secondary" size="sm" onClick={() => markStatus(selected.id, "IN_PROGRESS")}>
                  В обробку
                </AdminButton>
              )}
              {selected.status !== "COMPLETED" && selected.status !== "CONVERTED" && (
                <AdminButton variant="secondary" size="sm" onClick={() => markStatus(selected.id, "COMPLETED")}>
                  Завершити
                </AdminButton>
              )}
              {selected.status !== "CANCELLED" && (
                <AdminButton variant="ghost" size="sm" onClick={() => markStatus(selected.id, "CANCELLED")}>
                  Скасувати
                </AdminButton>
              )}
              {!selected.convertedOrderId && (
                <AdminButton variant="danger" size="sm" onClick={() => setDeleteTarget(selected.id)}>
                  Видалити
                </AdminButton>
              )}
            </div>
          </AdminCard>
        )}
      </div>

      <ConfirmModal
        open={!!deleteTarget}
        title="Видалити заявку?"
        message="Після видалення її неможливо буде відновити."
        confirmLabel="Видалити"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <span className="text-sm text-gray-800 whitespace-pre-wrap break-words">{value}</span>
    </div>
  );
}
