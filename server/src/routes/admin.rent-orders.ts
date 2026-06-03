import { logError } from "../lib/logger.js";
import { Router } from "express";
import { randomUUID } from "crypto";
import { pool } from "../lib/db.js";
import { AuthRequest, authMiddleware } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { markCustomerRequestConverted } from "../lib/customer-requests.js";
import { BotInternalError, sendWorkerAssignmentToBot } from "../lib/telegram-bot.js";
import { sendOrderClosedManagerNotification } from "../lib/telegram.js";
import { geocodeAddressForMaps, normalizeCoordinate } from "../lib/geocode-address.js";
import { renderConfiguredNotification } from "../lib/notification-service.js";
import { safelyUpsertAutomaticFuelExpenseForExecution } from "../lib/execution-fuel-expense.js";
import { checkOrderAvailability } from "../lib/availability.js";
import {
  buildAttributionViewFromInput,
  buildAttributionViewFromRow,
} from "../lib/marketing-attribution.repository.js";
import {
  calculateOrderFinance,
  calculatePriceItemTotal,
  calculateWorkerCompensationAmount,
  financePaymentMethods,
  formatWorkerCompensationText,
  listPriceItemTemplates,
  orderExpenseSources,
  orderExpenseTypes,
  orderPriceCalculationTypes,
  paymentReceivedByTypes,
  recalculateOrderFinanceState,
  settlementDirections,
  workerCompensationTypes,
} from "../lib/finance.js";
import {
  createMonobankInvoice,
  getMonobankConfig,
  getMonobankInvoiceStatus,
} from "../lib/monobank.js";
import {
  processMonobankInvoiceUpdate,
  syncPendingMonobankInvoicesForOrder,
} from "../lib/monobank-invoices.js";

export const adminRentOrdersRouter = Router();

adminRentOrdersRouter.use(authMiddleware);

const rentOrderStatuses = [
  "NEW",
  "CONFIRMED",
  "ACTIVE",
  "WORKER_COMPLETED",
  "COMPLETED",
  "CANCELLED",
] as const;

function formatRentOrderNumber(order: { id?: unknown; orderNumber?: unknown } | null | undefined) {
  const orderNumber = order?.orderNumber;
  if (orderNumber !== null && orderNumber !== undefined && String(orderNumber).trim()) {
    return String(orderNumber).replace(/\D/g, "") || "0";
  }

  const fallbackDigits = String(order?.id ?? "").replace(/\D/g, "").slice(0, 8);
  return fallbackDigits || "0";
}

function clearsBookedPeriods(status: string) {
  return status === "CANCELLED" || status === "WORKER_COMPLETED" || status === "COMPLETED";
}

async function getOrderOperationalOverview(
  db: Pick<typeof pool, "query">,
  orderId: string,
) {
  const overviewRes = await db.query(
    `SELECT
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

  const overview = overviewRes.rows[0] ?? null;
  if (!overview) {
    return null;
  }

  const relevantAssignments = Number(overview.relevantAssignments ?? 0);
  const acceptedAssignments = Number(overview.acceptedAssignments ?? 0);
  const inProgressAssignments = Number(overview.inProgressAssignments ?? 0);
  const finishedAssignments = Number(overview.finishedAssignments ?? 0);
  const completedReports = Number(overview.completedReports ?? 0);
  const completedAssignments = Number(overview.completedAssignments ?? 0);
  const awaitingNextShiftAssignments = Number(overview.awaitingNextShiftAssignments ?? 0);

  return {
    relevantAssignments,
    acceptedAssignments,
    inProgressAssignments,
    finishedAssignments,
    completedReports,
    completedAssignments,
    awaitingNextShiftAssignments,
    readyToClose:
      relevantAssignments > 0 &&
      acceptedAssignments === relevantAssignments &&
      completedAssignments === acceptedAssignments,
  };
}

function buildWorkerRequestDetails(order: any, sourceCustomerRequest: any) {
  if (!sourceCustomerRequest) return [];

  const details: Array<{ label: string; value: string }> = [];
  const towMeta = sourceCustomerRequest.metadata?.tow ?? null;
  const materialDeliveryMeta = getMaterialDeliveryMeta(sourceCustomerRequest);

  if (sourceCustomerRequest.requestType === "tow" || towMeta) {
    if (towMeta?.truckDispatchDistance) {
      details.push({ label: "Подача евакуатора", value: String(towMeta.truckDispatchDistance) });
    }
    if (towMeta?.truckDispatchEta) {
      details.push({ label: "Час подачі", value: String(towMeta.truckDispatchEta) });
    }
    if (towMeta?.clientRouteDistance) {
      details.push({ label: "Маршрут клієнта", value: String(towMeta.clientRouteDistance) });
    }
    if (towMeta?.clientRouteEta) {
      details.push({ label: "Час евакуації", value: String(towMeta.clientRouteEta) });
    }
    if (towMeta?.totalRouteDistance) {
      details.push({ label: "Загальний маршрут", value: String(towMeta.totalRouteDistance) });
    }
    if (towMeta?.estimatedCost) {
      details.push({ label: "Орієнтовна вартість", value: String(towMeta.estimatedCost) });
    }
  } else if (materialDeliveryMeta) {
    if (materialDeliveryMeta.selectedMaterialName) {
      details.push({ label: "Матеріал", value: String(materialDeliveryMeta.selectedMaterialName) });
    }
    if (materialDeliveryMeta.quantity) {
      details.push({
        label: "Кількість",
        value: `${materialDeliveryMeta.quantity}${materialDeliveryMeta.unit ? ` ${materialDeliveryMeta.unit}` : ""}`,
      });
    }
    if (materialDeliveryMeta.chosenSupplierPointName) {
      details.push({ label: "Точка постачання", value: String(materialDeliveryMeta.chosenSupplierPointName) });
    }
  } else {
    // Address is sent as a clickable location block, not duplicated in details.
  }

  return details;
}

function formatWorkerItemsText(items: Array<{ title: string; startDate?: string | null; endDate?: string | null }>) {
  if (items.length === 0) return "—";
  return items.map((item, index) => `${index + 1}. ${escapeTelegramHtml(item.title)}`).join("\n");
}

function formatWorkerLocationsText(locations: Array<{
  label: string;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
}>) {
  if (locations.length === 0) return "—";
  return locations.map((location) => {
    const mapUrl = buildGoogleMapsPointLink(location.latitude, location.longitude);
    const address = escapeTelegramHtml(location.address);
    const value = mapUrl
      ? `<a href="${escapeTelegramHtml(mapUrl)}">${address}</a>`
      : address;
    return `• <b>${escapeTelegramHtml(location.label)}:</b> ${value}`;
  }).join("\n");
}

function formatWorkerDetailsText(details: Array<{ label: string; value: string }>) {
  if (details.length === 0) return "—";
  return details.map((detail) => `• ${escapeTelegramHtml(detail.label)}: ${escapeTelegramHtml(detail.value)}`).join("\n");
}

function ensureWorkerCompensationInMessage(
  messageText: string | null | undefined,
  workerCompensationText: string | null | undefined,
) {
  const compensation = workerCompensationText?.trim();
  if (!messageText?.trim() || !compensation || compensation === "Не вказано") {
    return messageText ?? null;
  }

  const normalizedMessage = messageText.toLowerCase();
  const normalizedCompensation = compensation.toLowerCase();
  if (
    normalizedMessage.includes(normalizedCompensation) ||
    normalizedMessage.includes("ваша оплата") ||
    normalizedMessage.includes("оплата працівника")
  ) {
    return messageText;
  }

  return `${messageText.trim()}\n\n💰 <b>Ваша оплата:</b>\n${escapeTelegramHtml(compensation)}`;
}

function escapeTelegramHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildGoogleMapsPointLink(latitude?: number | null, longitude?: number | null) {
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
}

function getTowMeta(sourceCustomerRequest: any): Record<string, unknown> | null {
  const tow = sourceCustomerRequest?.metadata?.tow;
  return tow && typeof tow === "object" ? tow as Record<string, unknown> : null;
}

function getMaterialDeliveryMeta(sourceCustomerRequest: any): Record<string, unknown> | null {
  const materialDelivery = sourceCustomerRequest?.metadata?.materialDelivery;
  return materialDelivery &&
    typeof materialDelivery === "object" &&
    (materialDelivery as Record<string, unknown>).servicePricingType === "material_delivery_calculator"
      ? materialDelivery as Record<string, unknown>
      : null;
}

function getNotificationServiceSlug(sourceCustomerRequest: any) {
  const metadataSlug = sourceCustomerRequest?.metadata?.serviceSlug;
  if (typeof metadataSlug === "string" && metadataSlug.trim()) return metadataSlug.trim();
  if (sourceCustomerRequest?.requestType === "tow" || getTowMeta(sourceCustomerRequest)) {
    return "poslugy-evakuatora";
  }
  if (getMaterialDeliveryMeta(sourceCustomerRequest)) {
    return "perevezennia-sypuchyh-materialiv";
  }
  const serviceName = getSourceCustomerRequestServiceName(sourceCustomerRequest).toLowerCase();
  if (serviceName.includes("евакуатор")) return "poslugy-evakuatora";
  if (serviceName.includes("сипуч") || serviceName.includes("матеріал")) return "perevezennia-sypuchyh-materialiv";
  if (serviceName.includes("сміт")) return "vyviz-budivelnogo-smittia";
  return null;
}

function getNotificationServiceTitle(sourceCustomerRequest: any) {
  const serviceName = getSourceCustomerRequestServiceName(sourceCustomerRequest);
  if (serviceName) return serviceName;
  if (sourceCustomerRequest?.requestType === "tow" || getTowMeta(sourceCustomerRequest)) return "Послуги евакуатора";
  if (getMaterialDeliveryMeta(sourceCustomerRequest)) return "Перевезення сипучих матеріалів";
  return "—";
}

function getSourceCustomerRequestServiceName(sourceCustomerRequest: any) {
  const directName = sourceCustomerRequest?.serviceName;
  if (typeof directName === "string" && directName.trim()) return directName.trim();
  const metadataServiceName = sourceCustomerRequest?.metadata?.serviceName;
  if (typeof metadataServiceName === "string" && metadataServiceName.trim()) return metadataServiceName.trim();
  const metadataServiceType = sourceCustomerRequest?.metadata?.serviceType;
  if (typeof metadataServiceType === "string" && metadataServiceType.trim()) return metadataServiceType.trim();
  return "";
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

async function buildWorkerLocations(order: any, sourceCustomerRequest: any) {
  const orderAddressFrom = typeof order?.addressFrom === "string" && order.addressFrom.trim()
    ? order.addressFrom.trim()
    : null;
  const orderAddressTo = typeof order?.addressTo === "string" && order.addressTo.trim()
    ? order.addressTo.trim()
    : null;
  if (!sourceCustomerRequest) {
    const manualLocations = [
      orderAddressFrom
        ? { label: "Адреса виконання", address: orderAddressFrom }
        : null,
      orderAddressTo
        ? { label: "Адреса доставки", address: orderAddressTo }
        : null,
    ].filter(Boolean) as Array<{ label: string; address: string }>;

    return Promise.all(
      manualLocations.map(async (location) => {
        const geocoded = await geocodeAddressForMaps(location.address);
        return {
          label: location.label,
          address: location.address,
          latitude: geocoded?.latitude ?? null,
          longitude: geocoded?.longitude ?? null,
        };
      }),
    );
  }

  const towMeta = getTowMeta(sourceCustomerRequest);
  const materialDeliveryMeta = getMaterialDeliveryMeta(sourceCustomerRequest);
  const isTow = sourceCustomerRequest.requestType === "tow" || Boolean(towMeta);
  const rawLocations = isTow
    ? [
        {
          label: "Звідки забрати",
          address: orderAddressFrom ?? sourceCustomerRequest.addressFrom,
          coordinates: readCoordinates(towMeta?.pickupCoordinates),
        },
        {
          label: "Куди доставити",
          address:
            orderAddressTo ??
            sourceCustomerRequest.addressTo ??
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
              orderAddressTo ??
              orderAddressFrom ??
              (typeof materialDeliveryMeta.deliveryAddress === "string" ? materialDeliveryMeta.deliveryAddress : null) ??
              sourceCustomerRequest.addressFrom,
            coordinates: readCoordinates(materialDeliveryMeta.deliveryCoordinates),
          },
        ]
    : [
        {
          label: "Адреса виконання",
          address: orderAddressFrom ?? sourceCustomerRequest.addressFrom,
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

function formatUkDate(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("uk-UA", {
    timeZone: "Europe/Kiev",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatOrderSchedule(order: any, sourceCustomerRequest: any) {
  if (sourceCustomerRequest?.scheduledDate) {
    const date = formatUkDate(sourceCustomerRequest.scheduledDate);
    if (!date) return null;
    return sourceCustomerRequest.scheduledTime
      ? `${date}, ${sourceCustomerRequest.scheduledTime}`
      : date;
  }

  const dateFrom = formatUkDate(order.scheduledDate);
  const dateTo = formatUkDate(order.scheduledDateTo);
  const dateLabel = dateFrom && dateTo && dateFrom !== dateTo
    ? `${dateFrom} — ${dateTo}`
    : dateFrom ?? (dateTo ? `до ${dateTo}` : null);

  const timeLabel = order.scheduledTimeFrom && order.scheduledTimeTo
    ? `${order.scheduledTimeFrom} — ${order.scheduledTimeTo}`
    : order.scheduledTimeFrom
      ? `від ${order.scheduledTimeFrom}`
      : order.scheduledTimeTo
        ? `до ${order.scheduledTimeTo}`
        : null;

  return [dateLabel, timeLabel].filter(Boolean).join(", ") || null;
}

function formatPlannedStart(order: any, sourceCustomerRequest: any) {
  if (sourceCustomerRequest?.scheduledDate) {
    const date = formatUkDate(sourceCustomerRequest.scheduledDate);
    if (!date) return null;
    return sourceCustomerRequest.scheduledTime
      ? `${date}, ${sourceCustomerRequest.scheduledTime}`
      : date;
  }

  const date = formatUkDate(order.scheduledDate);
  if (!date && !order.scheduledTimeFrom) return null;

  return [date, order.scheduledTimeFrom ? order.scheduledTimeFrom : null]
    .filter(Boolean)
    .join(", ");
}

const itemSchema = z.object({
  equipmentId: z.string().min(1),
  useCustomSchedule: z.boolean().optional(),
  scheduledDateFrom: z.string().optional().or(z.literal("")),
  scheduledDateTo: z.string().optional().or(z.literal("")),
  scheduledTimeFrom: z.string().optional().or(z.literal("")),
  scheduledTimeTo: z.string().optional().or(z.literal("")),
});

const rentOrderSchema = z.object({
  customerName: z.string().min(1),
  customerPhone: z.string().min(1),
  items: z.array(itemSchema).min(1, "Додайте хоча б одну техніку"),
  status: z.enum(rentOrderStatuses).optional(),
  comment: z.string().optional(),
  addressFrom: z.string().trim().max(1000).optional().or(z.literal("")),
  addressTo: z.string().trim().max(1000).optional().or(z.literal("")),
  scheduledDate: z.string().optional().or(z.literal("")),
  scheduledDateTo: z.string().optional().or(z.literal("")),
  scheduledTimeFrom: z.string().optional().or(z.literal("")),
  scheduledTimeTo: z.string().optional().or(z.literal("")),
  agreedPrice: z.coerce.number().min(0).nullable().optional(),
  sourceType: z.enum(["manual", "request"]).optional(),
  sourceRequestId: z.string().optional(),
  sourceCustomerRequestId: z.string().optional(),
});

const closeOrderSchema = z.object({
  finalAgreedPrice: z.coerce.number().min(0).nullable().optional(),
  finalCashCollected: z.coerce.number().min(0).nullable().optional(),
  finalExtraExpenses: z.coerce.number().min(0).nullable().optional(),
  managerCloseComment: z.string().trim().max(5000).optional(),
});

const executionMetricsSchema = z.object({
  distanceKm: z.coerce.number().min(0).nullable(),
  driveDurationMinutes: z.coerce.number().min(0).nullable().optional(),
  stopDurationMinutes: z.coerce.number().min(0).nullable().optional(),
  engineHours: z.coerce.number().min(0).nullable(),
  perEquipmentMetrics: z.array(
    z.object({
      equipmentId: z.string().trim().min(1),
      distanceKm: z.coerce.number().min(0).nullable(),
      driveDurationMinutes: z.coerce.number().min(0).nullable().optional(),
      stopDurationMinutes: z.coerce.number().min(0).nullable().optional(),
      engineHours: z.coerce.number().min(0).nullable(),
    }),
  ).optional().default([]),
});

const financeSummarySchema = z.object({
  agreedTotal: z.coerce.number().min(0).nullable().optional(),
  financeComment: z.string().trim().max(5000).nullable().optional(),
});

const priceItemSchema = z.object({
  templateId: z.string().trim().min(1).optional().nullable(),
  equipmentId: z.string().trim().min(1).optional().nullable(),
  serviceId: z.string().trim().min(1).optional().nullable(),
  title: z.string().trim().min(1).max(255),
  calculationType: z.enum(orderPriceCalculationTypes),
  quantity: z.coerce.number().min(0).optional().nullable(),
  unit: z.string().trim().max(50).optional().nullable(),
  unitPrice: z.coerce.number().min(0).optional().nullable(),
  total: z.coerce.number().min(0).optional().nullable(),
  source: z.enum(["manual", "request_calculation", "template"]).optional(),
  comment: z.string().trim().max(3000).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

const orderPaymentSchema = z.object({
  executionSessionId: z.string().trim().min(1).optional().nullable(),
  amount: z.coerce.number().positive(),
  method: z.enum(financePaymentMethods),
  receivedByType: z.enum(paymentReceivedByTypes),
  employeeId: z.string().trim().min(1).optional().nullable(),
  paidAt: z.string().trim().min(1).optional().nullable(),
  comment: z.string().trim().max(3000).optional().nullable(),
});

const monobankPaymentLinkSchema = z.object({
  amount: z.coerce.number().positive().max(10_000_000).optional(),
});

const orderExpenseSchema = z.object({
  executionSessionId: z.string().trim().min(1).optional().nullable(),
  equipmentId: z.string().trim().min(1).optional().nullable(),
  employeeId: z.string().trim().min(1).optional().nullable(),
  type: z.enum(orderExpenseTypes),
  amount: z.coerce.number().positive(),
  source: z.enum(orderExpenseSources).optional(),
  expenseAt: z.string().trim().min(1).optional().nullable(),
  comment: z.string().trim().max(3000).optional().nullable(),
});

const workerCompensationSchema = z.object({
  assignmentId: z.string().trim().min(1).optional().nullable(),
  equipmentId: z.string().trim().min(1).optional().nullable(),
  employeeId: z.string().trim().min(1).optional().nullable(),
  type: z.enum(workerCompensationTypes),
  rate: z.preprocess((value) => value === "" ? null : value, z.coerce.number().min(0).optional().nullable()),
  quantity: z.preprocess((value) => value === "" ? null : value, z.coerce.number().min(0).optional().nullable()),
  percent: z.preprocess((value) => value === "" ? null : value, z.coerce.number().min(0).max(100).optional().nullable()),
  finalAmount: z.preprocess((value) => value === "" ? null : value, z.coerce.number().min(0).optional().nullable()),
  status: z.string().trim().min(1).max(100).optional(),
  comment: z.string().trim().max(3000).optional().nullable(),
});

const assignmentCompensationSchema = workerCompensationSchema.omit({
  assignmentId: true,
  equipmentId: true,
  employeeId: true,
});

const assignmentNextShiftSchema = z.object({
  plannedNextStartAt: z.string().trim().min(1).nullable().optional(),
  plannedDurationMinutes: z.preprocess((value) => value === "" ? null : value, z.coerce.number().int().positive().nullable().optional()),
  completionComment: z.string().trim().max(3000).nullable().optional(),
});

const employeeSettlementSchema = z.object({
  employeeId: z.string().trim().min(1).optional().nullable(),
  amount: z.coerce.number().positive(),
  direction: z.enum(settlementDirections),
  fromEmployeeId: z.string().trim().min(1).optional().nullable(),
  toEmployeeId: z.string().trim().min(1).optional().nullable(),
  method: z.enum(financePaymentMethods),
  settledAt: z.string().trim().min(1).optional().nullable(),
  comment: z.string().trim().max(3000).optional().nullable(),
});

const customerWorkerVisibilitySchema = z.object({
  showWorkerToCustomer: z.boolean(),
});

function parseIsoDateTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function toLocalDateInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toLocalTimeInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function checkAssignmentScheduleAvailability(
  db: Pick<typeof pool, "query">,
  args: {
    orderId: string;
    employeeId: string;
    equipmentId: string | null;
    plannedStartAt: Date | null;
    plannedDurationMinutes?: number | null;
  },
) {
  if (!args.plannedStartAt) {
    return { ok: true as const };
  }

  const durationMinutes = args.plannedDurationMinutes && args.plannedDurationMinutes > 0
    ? args.plannedDurationMinutes
    : 8 * 60;
  const plannedEndAt = addMinutes(args.plannedStartAt, durationMinutes);
  const result = await checkOrderAvailability(db, {
    orderId: args.orderId,
    scheduledDate: toLocalDateInput(args.plannedStartAt),
    scheduledDateTo: toLocalDateInput(plannedEndAt),
    scheduledTimeFrom: toLocalTimeInput(args.plannedStartAt),
    scheduledTimeTo: toLocalTimeInput(plannedEndAt),
    employeeIds: [args.employeeId],
    items: [
      {
        equipmentId: args.equipmentId,
        useCustomSchedule: false,
      },
    ],
  });

  if (result.conflicts.length === 0) {
    return { ok: true as const, availability: result };
  }

  const conflictText = result.conflicts
    .map((conflict) => {
      const subject = conflict.type === "employee"
        ? `працівник ${String(conflict.employeeName ?? "—")}`
        : `техніка ${String(conflict.equipmentName ?? "—")}`;
      const orderNumber = conflict.orderNumber ? `, замовлення №${String(conflict.orderNumber)}` : "";
      const customerName = conflict.customerName ? `, ${String(conflict.customerName)}` : "";
      return `${subject}${orderNumber}${customerName}`;
    })
    .join("; ");

  return {
    ok: false as const,
    availability: result,
    error: `Є накладка на запланований час: ${conflictText}`,
  };
}

async function ensureRentOrderExists(
  db: Pick<typeof pool, "query">,
  rentOrderId: string,
) {
  const result = await db.query(
    `SELECT "id" FROM "RentOrder" WHERE "id" = $1 LIMIT 1`,
    [rentOrderId],
  );
  return result.rows[0] ?? null;
}

async function resolveAssignedEmployeeId(
  db: Pick<typeof pool, "query">,
  rentOrderId: string,
) {
  const result = await db.query(
    `SELECT "employeeId"
     FROM "WorkAssignment"
     WHERE "orderId" = $1
     ORDER BY "assignedAt" DESC, "createdAt" DESC
     LIMIT 1`,
    [rentOrderId],
  );
  return result.rows[0]?.employeeId ?? null;
}

async function ensureEquipmentExists(
  db: Pick<typeof pool, "query">,
  equipmentId: string,
) {
  const result = await db.query(
    `SELECT "id", "name" FROM "Equipment" WHERE "id" = $1 LIMIT 1`,
    [equipmentId],
  );
  return result.rows[0] ?? null;
}

async function resolveEmployeeSettlementParticipants(
  db: Pick<typeof pool, "query">,
  orderId: string,
  payload: z.infer<typeof employeeSettlementSchema>,
) {
  const legacyEmployeeId = payload.employeeId || null;
  let fromEmployeeId = payload.fromEmployeeId || null;
  let toEmployeeId = payload.toEmployeeId || null;

  if (payload.direction === "to_employee") {
    toEmployeeId = toEmployeeId || legacyEmployeeId || await resolveAssignedEmployeeId(db, orderId);
    if (!toEmployeeId) {
      return { ok: false as const, status: 400, error: "Вкажіть працівника, який отримує кошти" };
    }
  } else if (payload.direction === "from_employee") {
    fromEmployeeId = fromEmployeeId || legacyEmployeeId || await resolveAssignedEmployeeId(db, orderId);
    if (!fromEmployeeId) {
      return { ok: false as const, status: 400, error: "Вкажіть працівника, який передає кошти" };
    }
  } else if (payload.direction === "employee_to_employee") {
    fromEmployeeId = fromEmployeeId || legacyEmployeeId || null;
    if (!fromEmployeeId || !toEmployeeId) {
      return {
        ok: false as const,
        status: 400,
        error: "Вкажіть працівника, який передає, і працівника, який отримує кошти",
      };
    }
    if (fromEmployeeId === toEmployeeId) {
      return { ok: false as const, status: 400, error: "Працівники для передачі коштів мають відрізнятись" };
    }
  }

  const employeeIdsToValidate = [fromEmployeeId, toEmployeeId].filter((value): value is string => Boolean(value));
  if (employeeIdsToValidate.length > 0) {
    const existingEmployees = await db.query(
      `SELECT "id" FROM "Employee" WHERE "id" = ANY($1::text[])`,
      [employeeIdsToValidate],
    );
    const existingIds = new Set(existingEmployees.rows.map((row) => String(row.id)));
    const missingEmployeeId = employeeIdsToValidate.find((id) => !existingIds.has(id));
    if (missingEmployeeId) {
      return { ok: false as const, status: 404, error: "Працівника для розрахунку не знайдено" };
    }
  }

  return {
    ok: true as const,
    employeeId: toEmployeeId || fromEmployeeId,
    fromEmployeeId,
    toEmployeeId,
  };
}

async function upsertWorkerCompensationForOrder(
  db: Pick<typeof pool, "query">,
  input: {
    orderId: string;
    assignmentId?: string | null;
    employeeId?: string | null;
    equipmentId?: string | null;
    payload: z.infer<typeof workerCompensationSchema> | z.infer<typeof assignmentCompensationSchema>;
    adminId?: string | null;
  },
) {
  const currentFinance = await calculateOrderFinance(input.orderId, db);
  if (!currentFinance) {
    return { ok: false as const, status: 404, error: "Замовлення не знайдено" };
  }

  const assignmentId = input.assignmentId || null;
  let employeeId = input.employeeId || null;
  let equipmentId = input.equipmentId || null;

  if (assignmentId) {
    const assignmentRes = await db.query(
      `SELECT "employeeId", "equipmentId"
       FROM "WorkAssignment"
       WHERE "id" = $1 AND "orderId" = $2
       LIMIT 1`,
      [assignmentId, input.orderId],
    );
    const assignment = assignmentRes.rows[0];
    if (!assignment) {
      return { ok: false as const, status: 404, error: "Призначення не знайдено" };
    }
    employeeId = employeeId || assignment.employeeId || null;
    equipmentId = equipmentId || assignment.equipmentId || null;
  }

  if (!employeeId) {
    employeeId = await resolveAssignedEmployeeId(db, input.orderId);
  }
  if (!employeeId) {
    return {
      ok: false as const,
      status: 400,
      error: "Спершу призначте працівника або вкажіть employeeId",
    };
  }

  if (equipmentId) {
    const equipment = await ensureEquipmentExists(db, equipmentId);
    if (!equipment) {
      return { ok: false as const, status: 404, error: "Техніку не знайдено" };
    }
  }

  const calculatedAmount = calculateWorkerCompensationAmount({
    type: input.payload.type,
    rate: input.payload.rate ?? null,
    quantity: input.payload.quantity ?? null,
    percent: input.payload.percent ?? null,
    finalAmount: input.payload.finalAmount ?? null,
    orderTotal: currentFinance.summary.orderTotal,
  });
  const finalAmount =
    input.payload.finalAmount ??
    (input.payload.type === "hourly" && input.payload.quantity == null ? null : calculatedAmount);

  const existingCompensation = await db.query(
    `SELECT "id"
     FROM "WorkerCompensation"
     WHERE "rentOrderId" = $1
       AND (
         ($2::text IS NOT NULL AND "assignmentId" = $2)
         OR ($2::text IS NULL AND "employeeId" = $3 AND COALESCE("equipmentId",'') = COALESCE($4::text,''))
       )
     ORDER BY "updatedAt" DESC, "createdAt" DESC
     LIMIT 1`,
    [input.orderId, assignmentId, employeeId, equipmentId],
  );

  if (existingCompensation.rows[0]) {
    await db.query(
      `UPDATE "WorkerCompensation"
       SET "assignmentId" = $1,
           "equipmentId" = $2,
           "employeeId" = $3,
           "type" = $4,
           "rate" = $5,
           "quantity" = $6,
           "percent" = $7,
           "calculatedAmount" = $8,
           "finalAmount" = $9,
           "status" = $10,
           "comment" = $11,
           "updatedAt" = NOW()
       WHERE "id" = $12`,
      [
        assignmentId,
        equipmentId,
        employeeId,
        input.payload.type,
        input.payload.rate ?? null,
        input.payload.quantity ?? null,
        input.payload.percent ?? null,
        calculatedAmount,
        finalAmount,
        input.payload.status || "draft",
        input.payload.comment || null,
        existingCompensation.rows[0].id,
      ],
    );
  } else {
    await db.query(
      `INSERT INTO "WorkerCompensation" (
         "rentOrderId",
         "assignmentId",
         "equipmentId",
         "employeeId",
         "type",
         "rate",
         "quantity",
         "percent",
         "calculatedAmount",
         "finalAmount",
         "status",
         "comment",
         "updatedAt"
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())`,
      [
        input.orderId,
        assignmentId,
        equipmentId,
        employeeId,
        input.payload.type,
        input.payload.rate ?? null,
        input.payload.quantity ?? null,
        input.payload.percent ?? null,
        calculatedAmount,
        finalAmount,
        input.payload.status || "draft",
        input.payload.comment || null,
      ],
    );
  }

  const finance = await recalculateOrderFinanceState(input.orderId, db);

  await db.query(
    `INSERT INTO "OrderEventLog" ("orderId", "assignmentId", "eventType", "payload", "createdByAdminId")
     VALUES ($1, $2, 'finance_worker_compensation_saved', $3, $4)`,
    [
      input.orderId,
      assignmentId,
      JSON.stringify({
        employeeId,
        assignmentId,
        equipmentId,
        type: input.payload.type,
        calculatedAmount,
        finalAmount,
      }),
      input.adminId ?? null,
    ],
  );

  return {
    ok: true as const,
    finance,
    assignmentId,
    employeeId,
    equipmentId,
    calculatedAmount,
    finalAmount,
  };
}

/** Helper: fetch rent order with relations */
async function getRentOrderWithRelations(id: string) {
  const { rows } = await pool.query(`SELECT * FROM "RentOrder" WHERE "id" = $1`, [id]);
  if (rows.length === 0) return null;
  const order = rows[0];

  const [
    itemsRes,
    srcRes,
    sourceCustomerRequestRes,
    sourceCustomerRequestAttributionRes,
    assignmentsRes,
    executionSessionsRes,
    executionReportsRes,
    executionMetricEquipmentRes,
    eventLogsRes,
    closingAdminRes,
  ] = await Promise.all([
    pool.query(
      `SELECT
         roi.*,
         json_build_object(
           'id', e."id",
           'name', e."name",
           'slug', e."slug",
           'trackerDevice',
             CASE WHEN td."id" IS NULL THEN NULL ELSE json_build_object(
               'id', td."id",
               'name', td."name",
               'lastAddress', td."lastAddress",
               'lastTrackerAt', td."lastTrackerAt"
             ) END
         ) AS equipment
       FROM "RentOrderItem" roi
       LEFT JOIN "Equipment" e ON e."id" = roi."equipmentId"
       LEFT JOIN "TrackerDevice" td ON td."equipmentId" = e."id"
       WHERE roi."rentOrderId" = $1
       ORDER BY roi."startDate" ASC`,
      [id],
    ),
    order.sourceRequestId
      ? pool.query(
          `SELECT "id", "customerName", "phone" FROM "Order" WHERE "id" = $1`,
          [order.sourceRequestId],
        )
      : Promise.resolve({ rows: [] }),
    order.sourceCustomerRequestId
      ? pool.query(
          `SELECT
             "id",
             "customerName",
             "phone",
             "requestType",
             "addressFrom",
             "addressTo",
             "scheduledDate",
             "scheduledTime",
             "comment",
             "metadata"
           FROM "CustomerRequest"
           WHERE "id" = $1`,
          [order.sourceCustomerRequestId],
        )
      : Promise.resolve({ rows: [] }),
    order.sourceCustomerRequestId || order.sourceRequestId
      ? pool.query(
          `SELECT
             cra.*,
             mtl."name" AS "trackingLinkName"
           FROM "CustomerRequestAttribution" cra
           LEFT JOIN "MarketingTrackingLink" mtl ON mtl."id" = cra."trackingLinkId"
           WHERE ("customerRequestId" IS NOT NULL AND cra."customerRequestId" = $1)
              OR ("legacyOrderId" IS NOT NULL AND cra."legacyOrderId" = $2)
           ORDER BY cra."createdAt" DESC
           LIMIT 1`,
          [order.sourceCustomerRequestId ?? null, order.sourceRequestId ?? null],
        )
      : Promise.resolve({ rows: [] }),
    pool.query(
      `SELECT
         wa.*,
         json_build_object(
           'id', eq."id",
           'name', eq."name",
           'slug', eq."slug",
           'trackerDevice',
             CASE WHEN etd."id" IS NULL THEN NULL ELSE json_build_object(
               'id', etd."id",
               'name', etd."name",
               'lastAddress', etd."lastAddress",
               'lastTrackerAt', etd."lastTrackerAt"
             ) END
         ) AS equipment,
         json_build_object(
           'id', e."id",
           'fullName', e."fullName",
           'role', e."role",
           'phone', e."phone",
           'telegramChatId', e."telegramChatId",
           'telegramUserId', e."telegramUserId"
         ) AS employee
       FROM "WorkAssignment" wa
       INNER JOIN "Employee" e ON e."id" = wa."employeeId"
       LEFT JOIN "Equipment" eq ON eq."id" = wa."equipmentId"
       LEFT JOIN "TrackerDevice" etd ON etd."equipmentId" = eq."id"
       WHERE wa."orderId" = $1
       ORDER BY wa."assignedAt" DESC, wa."createdAt" DESC`,
      [id],
    ),
    pool.query(
      `SELECT
         wes.*,
         json_build_object('id', e."id", 'name', e."name", 'slug', e."slug") AS equipment,
         json_build_object('id', td."id", 'name', td."name", 'lastAddress', td."lastAddress") AS trackerDevice
       FROM "WorkExecutionSession" wes
       LEFT JOIN "Equipment" e ON e."id" = wes."equipmentId"
       LEFT JOIN "TrackerDevice" td ON td."id" = wes."trackerDeviceId"
      WHERE wes."orderId" = $1
      ORDER BY wes."sequenceNumber" DESC, wes."createdAt" DESC`,
      [id],
    ),
    pool.query(
      `SELECT
         wer.*,
         wes."orderId",
         wes."assignmentId"
       FROM "WorkExecutionReport" wer
       INNER JOIN "WorkExecutionSession" wes ON wes."id" = wer."executionSessionId"
      WHERE wes."orderId" = $1
      ORDER BY wer."updatedAt" DESC`,
      [id],
    ),
    pool.query(
      `SELECT DISTINCT ON (e."id")
         e."id",
         e."name",
         e."slug",
         CASE
           WHEN td."id" IS NULL THEN NULL
           ELSE json_build_object(
             'id', td."id",
             'name', td."name",
             'lastAddress', td."lastAddress"
           )
         END AS "trackerDevice"
       FROM "Equipment" e
       LEFT JOIN "TrackerDevice" td ON td."equipmentId" = e."id"
       WHERE e."id" IN (
         SELECT roi."equipmentId"
         FROM "RentOrderItem" roi
         WHERE roi."rentOrderId" = $1
         UNION
         SELECT opi."equipmentId"
         FROM "OrderPriceItem" opi
         WHERE opi."rentOrderId" = $1
           AND opi."equipmentId" IS NOT NULL
       )
       ORDER BY e."id", e."name" ASC`,
      [id],
    ),
    pool.query(
      `SELECT
         oel.*,
         a."email" AS "createdByAdminEmail",
         e."fullName" AS "assignmentEmployeeName"
       FROM "OrderEventLog" oel
       LEFT JOIN "Admin" a ON a."id" = oel."createdByAdminId"
       LEFT JOIN "WorkAssignment" wa ON wa."id" = oel."assignmentId"
       LEFT JOIN "Employee" e ON e."id" = wa."employeeId"
       WHERE oel."orderId" = $1
       ORDER BY oel."createdAt" DESC`,
      [id],
    ),
    order.managerClosedById
      ? pool.query(
          `SELECT "id", "email", "role" FROM "Admin" WHERE "id" = $1 LIMIT 1`,
          [order.managerClosedById],
        )
      : Promise.resolve({ rows: [] }),
  ]);

  const sourceCustomerRequestRow = sourceCustomerRequestRes.rows[0] || null;
  const metadataAttribution =
    sourceCustomerRequestRow?.metadata &&
    typeof sourceCustomerRequestRow.metadata === "object" &&
    "attribution" in sourceCustomerRequestRow.metadata
      ? sourceCustomerRequestRow.metadata.attribution
      : null;
  const sourceCustomerRequestAttribution =
    buildAttributionViewFromRow(sourceCustomerRequestAttributionRes.rows[0] || null) ??
    buildAttributionViewFromInput(metadataAttribution as Record<string, unknown> | null);

  return {
    ...order,
    items: itemsRes.rows,
    sourceRequest: srcRes.rows[0] || null,
    sourceCustomerRequest: sourceCustomerRequestRow
      ? {
          ...sourceCustomerRequestRow,
          attribution: sourceCustomerRequestAttribution,
        }
      : null,
    assignments: assignmentsRes.rows.map((row) => ({
      ...row,
      employee: row.employee?.id ? row.employee : null,
      equipment: row.equipment?.id ? row.equipment : null,
    })),
    latestAssignment: assignmentsRes.rows[0]
      ? {
          ...assignmentsRes.rows[0],
          employee: assignmentsRes.rows[0].employee?.id ? assignmentsRes.rows[0].employee : null,
          equipment: assignmentsRes.rows[0].equipment?.id ? assignmentsRes.rows[0].equipment : null,
        }
      : null,
    executionSessions: executionSessionsRes.rows.map((row) => ({
      ...row,
      equipment: row.equipment?.id ? row.equipment : null,
      trackerDevice: row.trackerDevice?.id ? row.trackerDevice : null,
    })),
    latestExecutionSession: executionSessionsRes.rows[0]
      ? {
          ...executionSessionsRes.rows[0],
          equipment: executionSessionsRes.rows[0].equipment?.id ? executionSessionsRes.rows[0].equipment : null,
          trackerDevice: executionSessionsRes.rows[0].trackerDevice?.id ? executionSessionsRes.rows[0].trackerDevice : null,
        }
      : null,
    executionMetricEquipment: executionMetricEquipmentRes.rows,
    executionReports: executionReportsRes.rows,
    latestExecutionReport: executionReportsRes.rows[0] ?? null,
    eventLogs: eventLogsRes.rows.map((row) => ({
      ...row,
      createdByAdmin: row.createdByAdminEmail ? { email: row.createdByAdminEmail } : null,
      assignmentEmployeeName: row.assignmentEmployeeName ?? null,
    })),
    managerClosedBy: closingAdminRes.rows[0] ?? null,
  };
}

/** Create BookedPeriod rows for each item in a rent order */
async function syncBookedPeriods(
  db: Pick<typeof pool, "query">,
  rentOrderId: string,
  customerName: string,
  items: { equipmentId: string; startDate: string | Date; endDate: string | Date }[],
) {
  await db.query(`DELETE FROM "BookedPeriod" WHERE "rentOrderId" = $1`, [rentOrderId]);
  for (const it of items) {
    await db.query(
      `INSERT INTO "BookedPeriod" ("equipmentId", "from", "to", "note", "rentOrderId")
       VALUES ($1, $2, $3, $4, $5)`,
      [it.equipmentId, new Date(it.startDate), new Date(it.endDate), `[Оренда] Клієнт: ${customerName}`, rentOrderId],
    );
  }
}

function parseScheduledDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateInputValue(value: unknown): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return undefined;
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function isValidTimeValue(value: string | undefined) {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

function buildItemDateRange(
  scheduledDateFrom: string | undefined,
  scheduledDateTo: string | undefined,
  scheduledTimeFrom: string | undefined,
  scheduledTimeTo: string | undefined,
) {
  const startDatePart = parseScheduledDate(scheduledDateFrom);
  if (!startDatePart) {
    return null;
  }

  const endDatePart = parseScheduledDate(scheduledDateTo) ?? startDatePart;
  const isoStartDay = scheduledDateFrom as string;
  const isoEndDay = scheduledDateTo || scheduledDateFrom;
  const startTime = isValidTimeValue(scheduledTimeFrom) ? scheduledTimeFrom : "00:00";
  const endTime = isValidTimeValue(scheduledTimeTo)
    ? scheduledTimeTo
    : "23:59";

  const startDate = new Date(`${isoStartDay}T${startTime}:00`);
  const endDate = new Date(`${isoEndDay}T${endTime}:59`);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null;
  }

  return {
    startDate,
    endDate: endDate.getTime() >= startDate.getTime() ? endDate : startDate,
  };
}

function resolveScheduleForItem(
  item: {
    useCustomSchedule?: boolean;
    scheduledDateFrom?: string;
    scheduledDateTo?: string;
    scheduledTimeFrom?: string;
    scheduledTimeTo?: string;
  },
  orderSchedule: {
    scheduledDate?: string;
    scheduledDateTo?: string;
    scheduledTimeFrom?: string;
    scheduledTimeTo?: string;
  },
) {
  if (item.useCustomSchedule) {
    return buildItemDateRange(
      item.scheduledDateFrom || undefined,
      item.scheduledDateTo || undefined,
      item.scheduledTimeFrom || undefined,
      item.scheduledTimeTo || undefined,
    );
  }

  return buildItemDateRange(
    orderSchedule.scheduledDate || undefined,
    orderSchedule.scheduledDateTo || undefined,
    orderSchedule.scheduledTimeFrom || undefined,
    orderSchedule.scheduledTimeTo || undefined,
  );
}

function readStringField(source: Record<string, unknown> | null | undefined, key: string) {
  const value = source?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseFlexibleNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const normalized = value
    .replace(/\s+/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function resolveUnitPrice(quantity: number | null, unitPrice: number | null, total: number | null) {
  if (unitPrice != null) return unitPrice;
  if (quantity != null && quantity > 0 && total != null) {
    return roundCurrency(total / quantity);
  }
  return 0;
}

async function resolveTowEquipmentId(
  db: Pick<typeof pool, "query">,
  towMeta: Record<string, unknown>,
  fallbackEquipmentId: string | null,
) {
  const directEquipmentId = readStringField(towMeta, "selectedEquipmentId");
  if (directEquipmentId) return directEquipmentId;

  const trackerId = readStringField(towMeta, "selectedTrackerId");
  if (trackerId) {
    const byTrackerId = await db.query(
      `SELECT "equipmentId" FROM "TrackerDevice" WHERE "id" = $1 LIMIT 1`,
      [trackerId],
    );
    if (byTrackerId.rows[0]?.equipmentId) return byTrackerId.rows[0].equipmentId as string;
  }

  const trackerName = readStringField(towMeta, "selectedTrackerName");
  if (trackerName) {
    const byTrackerName = await db.query(
      `SELECT "equipmentId" FROM "TrackerDevice" WHERE LOWER("name") = LOWER($1) LIMIT 1`,
      [trackerName],
    );
    if (byTrackerName.rows[0]?.equipmentId) return byTrackerName.rows[0].equipmentId as string;
  }

  const equipmentName = readStringField(towMeta, "selectedEquipmentName");
  if (equipmentName) {
    const byEquipmentName = await db.query(
      `SELECT "id" FROM "Equipment" WHERE LOWER("name") = LOWER($1) LIMIT 1`,
      [equipmentName],
    );
    if (byEquipmentName.rows[0]?.id) return byEquipmentName.rows[0].id as string;
  }

  return fallbackEquipmentId;
}

async function insertAutoPriceItem(
  db: Pick<typeof pool, "query">,
  input: {
    rentOrderId: string;
    equipmentId?: string | null;
    title: string;
    calculationType: "fixed" | "per_km" | "per_hour" | "manual";
    quantity?: number | null;
    unit?: string | null;
    unitPrice?: number | null;
    total?: number | null;
    comment?: string | null;
    sortOrder: number;
  },
) {
  const quantity = input.quantity ?? (input.calculationType === "manual" ? 1 : 1);
  const total = calculatePriceItemTotal({
    calculationType: input.calculationType,
    quantity,
    unitPrice: input.unitPrice ?? null,
    total: input.total ?? null,
  });

  await db.query(
    `INSERT INTO "OrderPriceItem" (
       "rentOrderId",
       "equipmentId",
       "title",
       "calculationType",
       "quantity",
       "unit",
       "unitPrice",
       "total",
       "source",
       "comment",
       "sortOrder",
       "updatedAt"
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'request_calculation', $9, $10, NOW())`,
    [
      input.rentOrderId,
      input.equipmentId ?? null,
      input.title,
      input.calculationType,
      quantity,
      input.unit ?? null,
      input.unitPrice ?? 0,
      total,
      input.comment ?? null,
      input.sortOrder,
    ],
  );

  return total;
}

async function insertAutoPriceItemsFromCustomerRequest(
  db: Pick<typeof pool, "query">,
  rentOrderId: string,
  sourceCustomerRequest: Record<string, any> | null,
  fallbackEquipmentId: string | null,
) {
  if (!sourceCustomerRequest?.metadata || typeof sourceCustomerRequest.metadata !== "object") {
    return { count: 0, total: 0 };
  }

  const towMeta = getTowMeta(sourceCustomerRequest);
  const materialDeliveryMeta = getMaterialDeliveryMeta(sourceCustomerRequest);
  let count = 0;
  let total = 0;

  if (towMeta) {
    const equipmentId = await resolveTowEquipmentId(db, towMeta, fallbackEquipmentId);
    const routeKm =
      parseFlexibleNumber(towMeta.totalRouteDistance) ??
      parseFlexibleNumber(towMeta.clientRouteDistance);
    const estimatedCost = parseFlexibleNumber(towMeta.estimatedCost);
    const tariffPerKm = resolveUnitPrice(
      routeKm,
      parseFlexibleNumber(towMeta.tariffLabel),
      estimatedCost,
    );

    if (routeKm != null || estimatedCost != null) {
      total += await insertAutoPriceItem(db, {
        rentOrderId,
        equipmentId,
        title: "Евакуація за розрахунком",
        calculationType: routeKm != null ? "per_km" : "manual",
        quantity: routeKm ?? 1,
        unit: routeKm != null ? "км" : null,
        unitPrice: routeKm != null ? tariffPerKm : 0,
        total: estimatedCost,
        comment: [
          towMeta.truckDispatchDistance ? `Подача евакуатора: ${towMeta.truckDispatchDistance}` : null,
          towMeta.clientRouteDistance ? `Відстань евакуації: ${towMeta.clientRouteDistance}` : null,
          towMeta.truckDispatchEta ? `Час подачі: ${towMeta.truckDispatchEta}` : null,
          towMeta.clientRouteEta ? `Час евакуації: ${towMeta.clientRouteEta}` : null,
        ].filter(Boolean).join("\n") || null,
        sortOrder: count,
      });
      count += 1;
    }
  }

  if (materialDeliveryMeta) {
    const equipmentId = readStringField(materialDeliveryMeta, "chosenEquipmentId") ?? fallbackEquipmentId;
    const materialQuantity = parseFlexibleNumber(materialDeliveryMeta.quantity);
    const materialCost = parseFlexibleNumber(materialDeliveryMeta.materialCost);
    const materialUnitPrice = resolveUnitPrice(
      materialQuantity,
      parseFlexibleNumber(materialDeliveryMeta.chosenOfferUnitPrice),
      materialCost,
    );

    if (materialCost != null || materialQuantity != null) {
      total += await insertAutoPriceItem(db, {
        rentOrderId,
        equipmentId,
        title: readStringField(materialDeliveryMeta, "selectedMaterialName") ?? "Матеріал",
        calculationType: "fixed",
        quantity: materialQuantity ?? 1,
        unit: readStringField(materialDeliveryMeta, "unit"),
        unitPrice: materialUnitPrice,
        total: materialCost,
        comment: readStringField(materialDeliveryMeta, "chosenSupplierPointName")
          ? `Точка постачання: ${readStringField(materialDeliveryMeta, "chosenSupplierPointName")}`
          : null,
        sortOrder: count,
      });
      count += 1;
    }

    const deliveryKm = parseFlexibleNumber(materialDeliveryMeta.pointToClientKm);
    const deliveryCost = parseFlexibleNumber(materialDeliveryMeta.deliveryCost);
    const deliveryRate = resolveUnitPrice(
      deliveryKm,
      parseFlexibleNumber(materialDeliveryMeta.deliveryRatePerKm),
      deliveryCost,
    );

    if (deliveryKm != null || deliveryCost != null) {
      total += await insertAutoPriceItem(db, {
        rentOrderId,
        equipmentId,
        title: "Доставка матеріалу",
        calculationType: deliveryKm != null ? "per_km" : "manual",
        quantity: deliveryKm ?? 1,
        unit: deliveryKm != null ? "км" : null,
        unitPrice: deliveryKm != null ? deliveryRate : 0,
        total: deliveryCost,
        comment: readStringField(materialDeliveryMeta, "deliveryAddress")
          ? `Адреса доставки: ${readStringField(materialDeliveryMeta, "deliveryAddress")}`
          : null,
        sortOrder: count,
      });
      count += 1;
    }
  }

  return { count, total: roundCurrency(total) };
}

/** Список замовлень */
adminRentOrdersRouter.get("/", async (req, res) => {
  try {
    const { status } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];
    if (status && status !== "all") {
      conditions.push(`"status" = $1`);
      params.push(status);
    }
    const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
    const { rows: orders } = await pool.query(
      `SELECT * FROM "RentOrder" ${where} ORDER BY "createdAt" DESC`,
      params,
    );

    const result = [];
    for (const o of orders) {
      const full = await getRentOrderWithRelations(o.id);
      result.push(full);
    }

    res.json(result);
  } catch (e) {
    logError("GET /api/admin/rent-orders error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Отримати замовлення за публічним номером з URL */
adminRentOrdersRouter.get("/by-key/:orderKey", async (req, res) => {
  try {
    const orderKey = decodeURIComponent(String(req.params.orderKey ?? "")).trim();
    if (!orderKey) {
      res.status(400).json({ error: "Номер замовлення не вказано" });
      return;
    }

    const lookup = /^\d+$/.test(orderKey)
      ? await pool.query(
          `SELECT "id" FROM "RentOrder" WHERE "orderNumber" = $1 LIMIT 1`,
          [Number(orderKey)],
        )
      : await pool.query(
          `SELECT "id" FROM "RentOrder" WHERE "id" = $1 LIMIT 1`,
          [orderKey],
        );

    const orderId = lookup.rows[0]?.id;
    if (!orderId) {
      res.status(404).json({ error: "Замовлення не знайдено" });
      return;
    }

    const order = await getRentOrderWithRelations(orderId);
    if (!order) {
      res.status(404).json({ error: "Замовлення не знайдено" });
      return;
    }

    res.json(order);
  } catch (e) {
    logError("GET /api/admin/rent-orders/by-key/:orderKey error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

/** Отримати одне замовлення */
adminRentOrdersRouter.get("/:id", async (req, res) => {
  try {
    const order = await getRentOrderWithRelations(req.params.id as string);
    if (!order) {
      res.status(404).json({ error: "Замовлення не знайдено" });
      return;
    }
    res.json(order);
  } catch (e) {
    logError("GET /api/admin/rent-orders/:id error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

adminRentOrdersRouter.get("/finance/price-item-templates", async (_req, res) => {
  try {
    const templates = await listPriceItemTemplates();
    res.json(templates);
  } catch (e) {
    logError("GET /api/admin/rent-orders/finance/price-item-templates error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

adminRentOrdersRouter.get("/:id/finance", async (req, res) => {
  try {
    const orderId = req.params.id as string;
    try {
      await syncPendingMonobankInvoicesForOrder(orderId);
    } catch (syncError) {
      logError("Sync pending monobank invoices before finance error:", syncError);
    }

    const finance = await calculateOrderFinance(orderId);
    if (!finance) {
      res.status(404).json({ error: "Замовлення не знайдено" });
      return;
    }
    res.json(finance);
  } catch (e) {
    logError("GET /api/admin/rent-orders/:id/finance error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

adminRentOrdersRouter.get("/:id/payment-links/monobank", async (req, res) => {
  try {
    const orderId = req.params.id as string;
    try {
      await syncPendingMonobankInvoicesForOrder(orderId);
    } catch (syncError) {
      logError("Sync pending monobank invoices before list error:", syncError);
    }

    const linksRes = await pool.query(
      `SELECT
         "id",
         "rentOrderId",
         "invoiceId",
         "reference",
         "status",
         "amountKop",
         "ccy",
         "pageUrl",
         "destination",
         "finalAmountKop",
         "failureReason",
         "orderPaymentId",
         "paidAt",
         "monoCreatedDate",
         "monoModifiedDate",
         "createdAt",
         "updatedAt"
       FROM "MonobankInvoice"
       WHERE "rentOrderId" = $1
       ORDER BY "createdAt" DESC`,
      [orderId],
    );
    res.json(linksRes.rows);
  } catch (e) {
    logError("GET /api/admin/rent-orders/:id/payment-links/monobank error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

adminRentOrdersRouter.post(
  "/:id/payment-links/monobank",
  validate(monobankPaymentLinkSchema),
  async (req: AuthRequest, res) => {
    try {
      const orderId = req.params.id as string;
      const orderRes = await pool.query(
        `SELECT "id", "orderNumber", "customerName"
         FROM "RentOrder"
         WHERE "id" = $1
         LIMIT 1`,
        [orderId],
      );
      const order = orderRes.rows[0];
      if (!order) {
        res.status(404).json({ error: "Замовлення не знайдено" });
        return;
      }

      const finance = await calculateOrderFinance(orderId);
      if (!finance) {
        res.status(404).json({ error: "Замовлення не знайдено" });
        return;
      }

      const requestedAmount = typeof req.body.amount === "number" ? req.body.amount : null;
      const amountUah = requestedAmount ?? (finance.summary.clientDebt > 0 ? finance.summary.clientDebt : finance.summary.orderTotal);
      const amountKop = Math.round(amountUah * 100);
      if (!Number.isFinite(amountKop) || amountKop <= 0) {
        res.status(400).json({ error: "Немає суми для створення посилання на оплату" });
        return;
      }

      const orderNumber = formatRentOrderNumber(order);
      const reference = `technorent-${orderNumber}-${randomUUID()}`;
      const destination = `Оплата замовлення TechnoRent №${orderNumber}`;
      const config = getMonobankConfig();
      const invoice = await createMonobankInvoice({
        amountKop,
        reference,
        destination,
      });

      const savedRes = await pool.query(
        `INSERT INTO "MonobankInvoice" (
           "rentOrderId",
           "invoiceId",
           "reference",
           "status",
           "amountKop",
           "ccy",
           "pageUrl",
           "destination",
           "webHookUrl",
           "redirectUrl",
           "createdByAdminId",
           "updatedAt"
         )
         VALUES ($1, $2, $3, 'created', $4, 980, $5, $6, $7, $8, $9, NOW())
         RETURNING
           "id",
           "rentOrderId",
           "invoiceId",
           "reference",
           "status",
           "amountKop",
           "ccy",
           "pageUrl",
           "destination",
           "finalAmountKop",
           "failureReason",
           "orderPaymentId",
           "paidAt",
           "monoCreatedDate",
           "monoModifiedDate",
           "createdAt",
           "updatedAt"`,
        [
          orderId,
          invoice.invoiceId,
          reference,
          amountKop,
          invoice.pageUrl,
          destination,
          config.webhookUrl,
          config.redirectUrl,
          req.adminId ?? null,
        ],
      );

      await pool.query(
        `INSERT INTO "OrderEventLog" ("orderId", "eventType", "payload", "createdByAdminId")
         VALUES ($1, 'finance_monobank_invoice_created', $2, $3)`,
        [
          orderId,
          JSON.stringify({ invoiceId: invoice.invoiceId, reference, amountKop }),
          req.adminId ?? null,
        ],
      );

      res.status(201).json(savedRes.rows[0]);
    } catch (e) {
      logError("POST /api/admin/rent-orders/:id/payment-links/monobank error:", e);
      const message = e instanceof Error ? e.message : "";
      if (message.includes("MONOBANK_")) {
        res.status(400).json({ error: "Не налаштовано monobank API на сервері" });
        return;
      }
      res.status(500).json({ error: "Помилка сервера" });
    }
  },
);

adminRentOrdersRouter.post("/:id/payment-links/monobank/:invoiceId/sync", async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    const orderId = req.params.id as string;
    const invoiceId = req.params.invoiceId as string;
    const statusPayload = await getMonobankInvoiceStatus(invoiceId);

    await client.query("BEGIN");
    const result = await processMonobankInvoiceUpdate(client, statusPayload, "manual_sync");
    if (!result.handled || result.rentOrderId !== orderId) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Рахунок monobank не знайдено для цього замовлення" });
      return;
    }
    await client.query(
      `INSERT INTO "OrderEventLog" ("orderId", "eventType", "payload", "createdByAdminId")
       VALUES ($1, 'finance_monobank_invoice_synced', $2, $3)`,
      [
        orderId,
        JSON.stringify({ invoiceId, status: result.status, orderPaymentId: result.orderPaymentId }),
        req.adminId ?? null,
      ],
    );
    await client.query("COMMIT");

    const finance = await calculateOrderFinance(orderId);
    res.json({ result, finance });
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    logError("POST /api/admin/rent-orders/:id/payment-links/monobank/:invoiceId/sync error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});

adminRentOrdersRouter.delete("/:id/payment-links/monobank/:invoiceId", async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    const orderId = req.params.id as string;
    const invoiceId = req.params.invoiceId as string;

    await client.query("BEGIN");
    const invoiceRes = await client.query(
      `SELECT "id", "status", "orderPaymentId"
       FROM "MonobankInvoice"
       WHERE "rentOrderId" = $1 AND "invoiceId" = $2
       FOR UPDATE`,
      [orderId, invoiceId],
    );
    const invoice = invoiceRes.rows[0] as { id: string; status: string; orderPaymentId: string | null } | undefined;
    if (!invoice) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Посилання monobank не знайдено" });
      return;
    }
    if (invoice.orderPaymentId || invoice.status === "success") {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Оплачене посилання не можна видалити" });
      return;
    }

    await client.query(
      `DELETE FROM "MonobankInvoice"
       WHERE "id" = $1`,
      [invoice.id],
    );
    await client.query(
      `INSERT INTO "OrderEventLog" ("orderId", "eventType", "payload", "createdByAdminId")
       VALUES ($1, 'finance_monobank_invoice_deleted', $2, $3)`,
      [
        orderId,
        JSON.stringify({ invoiceId, status: invoice.status }),
        req.adminId ?? null,
      ],
    );
    await client.query("COMMIT");

    res.json({ success: true });
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    logError("DELETE /api/admin/rent-orders/:id/payment-links/monobank/:invoiceId error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});

adminRentOrdersRouter.put(
  "/:id/finance-summary",
  validate(financeSummarySchema),
  async (req: AuthRequest, res) => {
    const client = await pool.connect();
    try {
      const orderId = req.params.id as string;
      await client.query("BEGIN");

      const orderExists = await ensureRentOrderExists(client, orderId);
      if (!orderExists) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Замовлення не знайдено" });
        return;
      }

      await client.query(
        `UPDATE "RentOrder"
         SET "agreedTotal" = $1,
             "financeComment" = $2,
             "updatedAt" = NOW()
         WHERE "id" = $3`,
        [
          req.body.agreedTotal ?? null,
          req.body.financeComment ?? null,
          orderId,
        ],
      );

      const finance = await recalculateOrderFinanceState(orderId, client);

      await client.query(
        `INSERT INTO "OrderEventLog" ("orderId", "eventType", "payload", "createdByAdminId")
         VALUES ($1, 'finance_summary_updated', $2, $3)`,
        [
          orderId,
          JSON.stringify({
            agreedTotal: req.body.agreedTotal ?? null,
            financeComment: req.body.financeComment ?? null,
          }),
          req.adminId ?? null,
        ],
      );

      await client.query("COMMIT");
      res.json(finance);
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback error
      }
      logError("PUT /api/admin/rent-orders/:id/finance-summary error:", e);
      res.status(500).json({ error: "Помилка сервера" });
    } finally {
      client.release();
    }
  },
);

adminRentOrdersRouter.post(
  "/:id/price-items",
  validate(priceItemSchema),
  async (req: AuthRequest, res) => {
    const client = await pool.connect();
    try {
      const orderId = req.params.id as string;
      await client.query("BEGIN");

      const orderExists = await ensureRentOrderExists(client, orderId);
      if (!orderExists) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Замовлення не знайдено" });
        return;
      }

      const total = calculatePriceItemTotal({
        calculationType: req.body.calculationType,
        quantity: req.body.quantity ?? null,
        unitPrice: req.body.unitPrice ?? null,
        total: req.body.total ?? null,
      });

      await client.query(
        `INSERT INTO "OrderPriceItem" (
           "rentOrderId",
           "templateId",
           "equipmentId",
           "serviceId",
           "title",
           "calculationType",
           "quantity",
           "unit",
           "unitPrice",
           "total",
           "source",
           "comment",
           "sortOrder",
           "updatedAt"
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
        [
          orderId,
          req.body.templateId || null,
          req.body.equipmentId || null,
          req.body.serviceId || null,
          req.body.title,
          req.body.calculationType,
          req.body.quantity ?? 1,
          req.body.unit || null,
          req.body.unitPrice ?? 0,
          total,
          req.body.source || "manual",
          req.body.comment || null,
          req.body.sortOrder ?? 0,
        ],
      );

      const finance = await recalculateOrderFinanceState(orderId, client);

      await client.query(
        `INSERT INTO "OrderEventLog" ("orderId", "eventType", "payload", "createdByAdminId")
         VALUES ($1, 'finance_price_item_created', $2, $3)`,
        [
          orderId,
          JSON.stringify({
            title: req.body.title,
            calculationType: req.body.calculationType,
            total,
          }),
          req.adminId ?? null,
        ],
      );

      await client.query("COMMIT");
      res.status(201).json(finance);
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback error
      }
      logError("POST /api/admin/rent-orders/:id/price-items error:", e);
      res.status(500).json({ error: "Помилка сервера" });
    } finally {
      client.release();
    }
  },
);

adminRentOrdersRouter.put(
  "/:id/price-items/:itemId",
  validate(priceItemSchema),
  async (req: AuthRequest, res) => {
    const client = await pool.connect();
    try {
      const orderId = req.params.id as string;
      const itemId = req.params.itemId as string;
      await client.query("BEGIN");

      const existingItem = await client.query(
        `SELECT "id" FROM "OrderPriceItem" WHERE "id" = $1 AND "rentOrderId" = $2 LIMIT 1`,
        [itemId, orderId],
      );
      if (!existingItem.rows[0]) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Позицію не знайдено" });
        return;
      }

      const total = calculatePriceItemTotal({
        calculationType: req.body.calculationType,
        quantity: req.body.quantity ?? null,
        unitPrice: req.body.unitPrice ?? null,
        total: req.body.total ?? null,
      });

      await client.query(
        `UPDATE "OrderPriceItem"
         SET "templateId" = $1,
             "equipmentId" = $2,
             "serviceId" = $3,
             "title" = $4,
             "calculationType" = $5,
             "quantity" = $6,
             "unit" = $7,
             "unitPrice" = $8,
             "total" = $9,
             "source" = $10,
             "comment" = $11,
             "sortOrder" = $12,
             "updatedAt" = NOW()
         WHERE "id" = $13 AND "rentOrderId" = $14`,
        [
          req.body.templateId || null,
          req.body.equipmentId || null,
          req.body.serviceId || null,
          req.body.title,
          req.body.calculationType,
          req.body.quantity ?? 1,
          req.body.unit || null,
          req.body.unitPrice ?? 0,
          total,
          req.body.source || "manual",
          req.body.comment || null,
          req.body.sortOrder ?? 0,
          itemId,
          orderId,
        ],
      );

      const finance = await recalculateOrderFinanceState(orderId, client);

      await client.query(
        `INSERT INTO "OrderEventLog" ("orderId", "eventType", "payload", "createdByAdminId")
         VALUES ($1, 'finance_price_item_updated', $2, $3)`,
        [
          orderId,
          JSON.stringify({
            itemId,
            title: req.body.title,
            calculationType: req.body.calculationType,
            total,
          }),
          req.adminId ?? null,
        ],
      );

      await client.query("COMMIT");
      res.json(finance);
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback error
      }
      logError("PUT /api/admin/rent-orders/:id/price-items/:itemId error:", e);
      res.status(500).json({ error: "Помилка сервера" });
    } finally {
      client.release();
    }
  },
);

adminRentOrdersRouter.delete("/:id/price-items/:itemId", async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    const orderId = req.params.id as string;
    const itemId = req.params.itemId as string;
    await client.query("BEGIN");

    const deleted = await client.query(
      `DELETE FROM "OrderPriceItem"
       WHERE "id" = $1 AND "rentOrderId" = $2
       RETURNING "id"`,
      [itemId, orderId],
    );
    if (!deleted.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Позицію не знайдено" });
      return;
    }

    const finance = await recalculateOrderFinanceState(orderId, client);

    await client.query(
      `INSERT INTO "OrderEventLog" ("orderId", "eventType", "payload", "createdByAdminId")
       VALUES ($1, 'finance_price_item_deleted', $2, $3)`,
      [
        orderId,
        JSON.stringify({ itemId }),
        req.adminId ?? null,
      ],
    );

    await client.query("COMMIT");
    res.json(finance);
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    logError("DELETE /api/admin/rent-orders/:id/price-items/:itemId error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});

adminRentOrdersRouter.post(
  "/:id/payments",
  validate(orderPaymentSchema),
  async (req: AuthRequest, res) => {
    const client = await pool.connect();
    try {
      const orderId = req.params.id as string;
      await client.query("BEGIN");

      const orderExists = await ensureRentOrderExists(client, orderId);
      if (!orderExists) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Замовлення не знайдено" });
        return;
      }

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
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          orderId,
          req.body.executionSessionId || null,
          req.body.employeeId || null,
          req.body.amount,
          req.body.method,
          req.body.receivedByType,
          parseIsoDateTime(req.body.paidAt) ?? new Date(),
          req.body.comment || null,
        ],
      );

      const finance = await recalculateOrderFinanceState(orderId, client);

      await client.query(
        `INSERT INTO "OrderEventLog" ("orderId", "eventType", "payload", "createdByAdminId")
         VALUES ($1, 'finance_payment_created', $2, $3)`,
        [
          orderId,
          JSON.stringify({
            executionSessionId: req.body.executionSessionId || null,
            amount: req.body.amount,
            method: req.body.method,
            receivedByType: req.body.receivedByType,
          }),
          req.adminId ?? null,
        ],
      );

      await client.query("COMMIT");
      res.status(201).json(finance);
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback error
      }
      logError("POST /api/admin/rent-orders/:id/payments error:", e);
      res.status(500).json({ error: "Помилка сервера" });
    } finally {
      client.release();
    }
  },
);

adminRentOrdersRouter.put(
  "/:id/payments/:paymentId",
  validate(orderPaymentSchema),
  async (req: AuthRequest, res) => {
    const client = await pool.connect();
    try {
      const orderId = req.params.id as string;
      const paymentId = req.params.paymentId as string;
      await client.query("BEGIN");

      const updated = await client.query(
        `UPDATE "OrderPayment"
         SET "executionSessionId" = $1,
             "employeeId" = $2,
             "amount" = $3,
             "method" = $4,
             "receivedByType" = $5,
             "paidAt" = $6,
             "comment" = $7,
             "updatedAt" = NOW()
         WHERE "id" = $8 AND "rentOrderId" = $9
         RETURNING "id"`,
        [
          req.body.executionSessionId || null,
          req.body.employeeId || null,
          req.body.amount,
          req.body.method,
          req.body.receivedByType,
          parseIsoDateTime(req.body.paidAt) ?? new Date(),
          req.body.comment || null,
          paymentId,
          orderId,
        ],
      );
      if (!updated.rows[0]) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Платіж не знайдено" });
        return;
      }

      const finance = await recalculateOrderFinanceState(orderId, client);

      await client.query(
        `INSERT INTO "OrderEventLog" ("orderId", "eventType", "payload", "createdByAdminId")
         VALUES ($1, 'finance_payment_updated', $2, $3)`,
        [
          orderId,
          JSON.stringify({
            paymentId,
            executionSessionId: req.body.executionSessionId || null,
            amount: req.body.amount,
            method: req.body.method,
            receivedByType: req.body.receivedByType,
          }),
          req.adminId ?? null,
        ],
      );

      await client.query("COMMIT");
      res.json(finance);
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback error
      }
      logError("PUT /api/admin/rent-orders/:id/payments/:paymentId error:", e);
      res.status(500).json({ error: "Помилка сервера" });
    } finally {
      client.release();
    }
  },
);

adminRentOrdersRouter.delete("/:id/payments/:paymentId", async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    const orderId = req.params.id as string;
    const paymentId = req.params.paymentId as string;
    await client.query("BEGIN");

    const deleted = await client.query(
      `DELETE FROM "OrderPayment"
       WHERE "id" = $1 AND "rentOrderId" = $2
       RETURNING "id"`,
      [paymentId, orderId],
    );
    if (!deleted.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Платіж не знайдено" });
      return;
    }

    const finance = await recalculateOrderFinanceState(orderId, client);

    await client.query(
      `INSERT INTO "OrderEventLog" ("orderId", "eventType", "payload", "createdByAdminId")
       VALUES ($1, 'finance_payment_deleted', $2, $3)`,
      [
        orderId,
        JSON.stringify({ paymentId }),
        req.adminId ?? null,
      ],
    );

    await client.query("COMMIT");
    res.json(finance);
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    logError("DELETE /api/admin/rent-orders/:id/payments/:paymentId error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});

adminRentOrdersRouter.post(
  "/:id/expenses",
  validate(orderExpenseSchema),
  async (req: AuthRequest, res) => {
    const client = await pool.connect();
    try {
      const orderId = req.params.id as string;
      await client.query("BEGIN");

      const orderExists = await ensureRentOrderExists(client, orderId);
      if (!orderExists) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Замовлення не знайдено" });
        return;
      }

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
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [
          orderId,
          req.body.executionSessionId || null,
          req.body.equipmentId || null,
          req.body.employeeId || null,
          req.body.type,
          req.body.amount,
          req.body.comment || null,
          req.body.source || "manager",
          parseIsoDateTime(req.body.expenseAt) ?? new Date(),
        ],
      );

      const finance = await recalculateOrderFinanceState(orderId, client);

      await client.query(
        `INSERT INTO "OrderEventLog" ("orderId", "eventType", "payload", "createdByAdminId")
         VALUES ($1, 'finance_expense_created', $2, $3)`,
        [
          orderId,
          JSON.stringify({
            executionSessionId: req.body.executionSessionId || null,
            type: req.body.type,
            amount: req.body.amount,
            source: req.body.source || "manager",
          }),
          req.adminId ?? null,
        ],
      );

      await client.query("COMMIT");
      res.status(201).json(finance);
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback error
      }
      logError("POST /api/admin/rent-orders/:id/expenses error:", e);
      res.status(500).json({ error: "Помилка сервера" });
    } finally {
      client.release();
    }
  },
);

adminRentOrdersRouter.put(
  "/:id/expenses/:expenseId",
  validate(orderExpenseSchema),
  async (req: AuthRequest, res) => {
    const client = await pool.connect();
    try {
      const orderId = req.params.id as string;
      const expenseId = req.params.expenseId as string;
      await client.query("BEGIN");

      const updated = await client.query(
        `UPDATE "OrderExpense"
         SET "executionSessionId" = $1,
             "equipmentId" = $2,
             "employeeId" = $3,
             "type" = $4,
             "amount" = $5,
             "comment" = $6,
             "source" = $7,
             "expenseAt" = $8,
             "updatedAt" = NOW()
         WHERE "id" = $9 AND "rentOrderId" = $10
         RETURNING "id"`,
        [
          req.body.executionSessionId || null,
          req.body.equipmentId || null,
          req.body.employeeId || null,
          req.body.type,
          req.body.amount,
          req.body.comment || null,
          req.body.source || "manager",
          parseIsoDateTime(req.body.expenseAt) ?? new Date(),
          expenseId,
          orderId,
        ],
      );
      if (!updated.rows[0]) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Витрату не знайдено" });
        return;
      }

      const finance = await recalculateOrderFinanceState(orderId, client);

      await client.query(
        `INSERT INTO "OrderEventLog" ("orderId", "eventType", "payload", "createdByAdminId")
         VALUES ($1, 'finance_expense_updated', $2, $3)`,
        [
          orderId,
          JSON.stringify({
            expenseId,
            executionSessionId: req.body.executionSessionId || null,
            type: req.body.type,
            amount: req.body.amount,
            source: req.body.source || "manager",
          }),
          req.adminId ?? null,
        ],
      );

      await client.query("COMMIT");
      res.json(finance);
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback error
      }
      logError("PUT /api/admin/rent-orders/:id/expenses/:expenseId error:", e);
      res.status(500).json({ error: "Помилка сервера" });
    } finally {
      client.release();
    }
  },
);

adminRentOrdersRouter.delete("/:id/expenses/:expenseId", async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    const orderId = req.params.id as string;
    const expenseId = req.params.expenseId as string;
    await client.query("BEGIN");

    const deleted = await client.query(
      `DELETE FROM "OrderExpense"
       WHERE "id" = $1 AND "rentOrderId" = $2
       RETURNING "id"`,
      [expenseId, orderId],
    );
    if (!deleted.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Витрату не знайдено" });
      return;
    }

    const finance = await recalculateOrderFinanceState(orderId, client);

    await client.query(
      `INSERT INTO "OrderEventLog" ("orderId", "eventType", "payload", "createdByAdminId")
       VALUES ($1, 'finance_expense_deleted', $2, $3)`,
      [
        orderId,
        JSON.stringify({ expenseId }),
        req.adminId ?? null,
      ],
    );

    await client.query("COMMIT");
    res.json(finance);
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    logError("DELETE /api/admin/rent-orders/:id/expenses/:expenseId error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});

adminRentOrdersRouter.put(
  "/:id/worker-compensation",
  validate(workerCompensationSchema),
  async (req: AuthRequest, res) => {
    const client = await pool.connect();
    try {
      const orderId = req.params.id as string;
      await client.query("BEGIN");

      const orderExists = await ensureRentOrderExists(client, orderId);
      if (!orderExists) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Замовлення не знайдено" });
        return;
      }
      const compensationResult = await upsertWorkerCompensationForOrder(client, {
        orderId,
        assignmentId: req.body.assignmentId || null,
        employeeId: req.body.employeeId || null,
        equipmentId: req.body.equipmentId || null,
        payload: req.body,
        adminId: req.adminId ?? null,
      });
      if (!compensationResult.ok) {
        await client.query("ROLLBACK");
        res.status(compensationResult.status).json({ error: compensationResult.error });
        return;
      }

      await client.query("COMMIT");
      res.json(compensationResult.finance);
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback error
      }
      logError("PUT /api/admin/rent-orders/:id/worker-compensation error:", e);
      res.status(500).json({ error: "Помилка сервера" });
    } finally {
      client.release();
    }
  },
);

adminRentOrdersRouter.post(
  "/:id/employee-settlements",
  validate(employeeSettlementSchema),
  async (req: AuthRequest, res) => {
    const client = await pool.connect();
    try {
      const orderId = req.params.id as string;
      await client.query("BEGIN");

      const orderExists = await ensureRentOrderExists(client, orderId);
      if (!orderExists) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Замовлення не знайдено" });
        return;
      }

      const participantResult = await resolveEmployeeSettlementParticipants(client, orderId, req.body);
      if (!participantResult.ok) {
        await client.query("ROLLBACK");
        res.status(participantResult.status).json({ error: participantResult.error });
        return;
      }
      const { employeeId, fromEmployeeId, toEmployeeId } = participantResult;

      await client.query(
        `INSERT INTO "EmployeeSettlement" (
           "employeeId",
           "fromEmployeeId",
           "toEmployeeId",
           "rentOrderId",
           "amount",
           "direction",
           "method",
           "settledAt",
           "comment",
           "updatedAt"
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [
          employeeId,
          fromEmployeeId,
          toEmployeeId,
          orderId,
          req.body.amount,
          req.body.direction,
          req.body.method,
          parseIsoDateTime(req.body.settledAt) ?? new Date(),
          req.body.comment || null,
        ],
      );

      const finance = await recalculateOrderFinanceState(orderId, client);

      await client.query(
        `INSERT INTO "OrderEventLog" ("orderId", "eventType", "payload", "createdByAdminId")
         VALUES ($1, 'finance_employee_settlement_created', $2, $3)`,
        [
          orderId,
          JSON.stringify({
            employeeId,
            fromEmployeeId,
            toEmployeeId,
            amount: req.body.amount,
            direction: req.body.direction,
            method: req.body.method,
          }),
          req.adminId ?? null,
        ],
      );

      await client.query("COMMIT");
      res.status(201).json(finance);
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback error
      }
      logError("POST /api/admin/rent-orders/:id/employee-settlements error:", e);
      res.status(500).json({ error: "Помилка сервера" });
    } finally {
      client.release();
    }
  },
);

adminRentOrdersRouter.put(
  "/:id/employee-settlements/:settlementId",
  validate(employeeSettlementSchema),
  async (req: AuthRequest, res) => {
    const client = await pool.connect();
    try {
      const orderId = req.params.id as string;
      const settlementId = req.params.settlementId as string;
      await client.query("BEGIN");

      const orderExists = await ensureRentOrderExists(client, orderId);
      if (!orderExists) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Замовлення не знайдено" });
        return;
      }

      const existingSettlement = await client.query(
        `SELECT "id"
         FROM "EmployeeSettlement"
         WHERE "id" = $1 AND "rentOrderId" = $2
         LIMIT 1`,
        [settlementId, orderId],
      );
      if (!existingSettlement.rows[0]) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Розрахунок не знайдено" });
        return;
      }

      const participantResult = await resolveEmployeeSettlementParticipants(client, orderId, req.body);
      if (!participantResult.ok) {
        await client.query("ROLLBACK");
        res.status(participantResult.status).json({ error: participantResult.error });
        return;
      }
      const { employeeId, fromEmployeeId, toEmployeeId } = participantResult;

      await client.query(
        `UPDATE "EmployeeSettlement"
         SET "employeeId" = $1,
             "fromEmployeeId" = $2,
             "toEmployeeId" = $3,
             "amount" = $4,
             "direction" = $5,
             "method" = $6,
             "settledAt" = $7,
             "comment" = $8,
             "updatedAt" = NOW()
         WHERE "id" = $9 AND "rentOrderId" = $10`,
        [
          employeeId,
          fromEmployeeId,
          toEmployeeId,
          req.body.amount,
          req.body.direction,
          req.body.method,
          parseIsoDateTime(req.body.settledAt) ?? new Date(),
          req.body.comment || null,
          settlementId,
          orderId,
        ],
      );

      const finance = await recalculateOrderFinanceState(orderId, client);

      await client.query(
        `INSERT INTO "OrderEventLog" ("orderId", "eventType", "payload", "createdByAdminId")
         VALUES ($1, 'finance_employee_settlement_updated', $2, $3)`,
        [
          orderId,
          JSON.stringify({
            settlementId,
            employeeId,
            fromEmployeeId,
            toEmployeeId,
            amount: req.body.amount,
            direction: req.body.direction,
            method: req.body.method,
          }),
          req.adminId ?? null,
        ],
      );

      await client.query("COMMIT");
      res.json(finance);
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback error
      }
      logError("PUT /api/admin/rent-orders/:id/employee-settlements/:settlementId error:", e);
      res.status(500).json({ error: "Помилка сервера" });
    } finally {
      client.release();
    }
  },
);

adminRentOrdersRouter.delete("/:id/employee-settlements/:settlementId", async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    const orderId = req.params.id as string;
    const settlementId = req.params.settlementId as string;
    await client.query("BEGIN");

    const deleted = await client.query(
      `DELETE FROM "EmployeeSettlement"
       WHERE "id" = $1 AND "rentOrderId" = $2
       RETURNING "id"`,
      [settlementId, orderId],
    );
    if (!deleted.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Розрахунок не знайдено" });
      return;
    }

    const finance = await recalculateOrderFinanceState(orderId, client);

    await client.query(
      `INSERT INTO "OrderEventLog" ("orderId", "eventType", "payload", "createdByAdminId")
       VALUES ($1, 'finance_employee_settlement_deleted', $2, $3)`,
      [
        orderId,
        JSON.stringify({ settlementId }),
        req.adminId ?? null,
      ],
    );

    await client.query("COMMIT");
    res.json(finance);
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    logError("DELETE /api/admin/rent-orders/:id/employee-settlements/:settlementId error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});

/** Створити замовлення */
adminRentOrdersRouter.post("/", validate(rentOrderSchema), async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    const {
      items,
      comment,
      sourceRequestId,
      sourceCustomerRequestId,
      scheduledDate,
      scheduledDateTo,
      scheduledTimeFrom,
      scheduledTimeTo,
      agreedPrice,
      addressFrom,
      addressTo,
      ...rest
    } = req.body;

    await client.query("BEGIN");

    const { rows } = await client.query(
      `INSERT INTO "RentOrder" ("customerName", "customerPhone", "status", "sourceType", "sourceRequestId", "sourceCustomerRequestId", "comment", "addressFrom", "addressTo", "scheduledDate", "scheduledDateTo", "scheduledTimeFrom", "scheduledTimeTo", "agreedPrice", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW()) RETURNING *`,
      [
        rest.customerName,
        rest.customerPhone,
        rest.status || "NEW",
        rest.sourceType || "manual",
        sourceRequestId || null,
        sourceCustomerRequestId || null,
        comment || null,
        addressFrom || null,
        addressTo || null,
        scheduledDate ? new Date(`${scheduledDate}T00:00:00`) : null,
        scheduledDateTo ? new Date(`${scheduledDateTo}T00:00:00`) : null,
        scheduledTimeFrom || null,
        scheduledTimeTo || null,
        agreedPrice ?? null,
      ],
    );
    const orderId = rows[0].id;

    for (const it of items) {
      const itemDateRange = resolveScheduleForItem(it, {
        scheduledDate,
        scheduledDateTo,
        scheduledTimeFrom,
        scheduledTimeTo,
      });
      await client.query(
        `INSERT INTO "RentOrderItem" ("rentOrderId", "equipmentId", "startDate", "endDate")
         VALUES ($1, $2, $3, $4)`,
        [
          orderId,
          it.equipmentId,
          itemDateRange?.startDate ?? new Date(),
          itemDateRange?.endDate ?? new Date(),
        ],
      );
    }

    const sourceCustomerRequestRes = sourceCustomerRequestId
      ? await client.query(
          `SELECT *
           FROM "CustomerRequest"
           WHERE "id" = $1
           LIMIT 1`,
          [sourceCustomerRequestId],
        )
      : { rows: [] };
    const autoPriceItems = await insertAutoPriceItemsFromCustomerRequest(
      client,
      orderId,
      sourceCustomerRequestRes.rows[0] ?? null,
      items[0]?.equipmentId ?? null,
    );

    // Auto-create booked periods (unless cancelled)
    if ((rest.status || "NEW") !== "CANCELLED") {
      await syncBookedPeriods(
        client,
        orderId,
        rest.customerName,
        items
          .map((item: any) => {
            const range = resolveScheduleForItem(item, {
              scheduledDate,
              scheduledDateTo,
              scheduledTimeFrom,
              scheduledTimeTo,
            });
            if (!range) return null;
            return {
              equipmentId: item.equipmentId,
              startDate: range.startDate,
              endDate: range.endDate,
            };
          })
          .filter(
            (
              item: { equipmentId: string; startDate: Date; endDate: Date } | null,
            ): item is { equipmentId: string; startDate: Date; endDate: Date } => Boolean(item),
          ),
      );
    }

    // Auto-mark source request as COMPLETED
    if (sourceRequestId) {
      await client.query(
        `UPDATE "Order" SET "status" = 'COMPLETED', "updatedAt" = NOW() WHERE "id" = $1`,
        [sourceRequestId],
      );
    }

    if (sourceCustomerRequestId) {
      await markCustomerRequestConverted(client, sourceCustomerRequestId, orderId);
    }

    await client.query(
      `INSERT INTO "OrderEventLog" ("orderId", "eventType", "payload", "createdByAdminId")
       VALUES ($1, 'manager_created_order', $2, $3)`,
      [
        orderId,
        JSON.stringify({
          sourceType: rest.sourceType || "manual",
          sourceRequestId: sourceRequestId || null,
          sourceCustomerRequestId: sourceCustomerRequestId || null,
          itemCount: items.length,
          autoPriceItemCount: autoPriceItems.count,
          autoPriceItemsTotal: autoPriceItems.total,
          status: rest.status || "NEW",
          addressFrom: addressFrom || null,
          addressTo: addressTo || null,
        }),
        req.adminId ?? null,
      ],
    );

    await recalculateOrderFinanceState(orderId, client);

    await client.query("COMMIT");

    const order = await getRentOrderWithRelations(orderId);
    res.status(201).json(order);
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    logError("POST /api/admin/rent-orders error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});

/** Оновити замовлення */
adminRentOrdersRouter.put("/:id", validate(rentOrderSchema.partial()), async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    const {
      items,
      comment,
      sourceRequestId,
      sourceCustomerRequestId,
      scheduledDate,
      scheduledDateTo,
      scheduledTimeFrom,
      scheduledTimeTo,
      agreedPrice,
      addressFrom,
      addressTo,
      ...rest
    } = req.body;
    const id = req.params.id as string;

    await client.query("BEGIN");

    const existingRes = await client.query(
      `SELECT * FROM "RentOrder" WHERE "id" = $1 FOR UPDATE`,
      [id],
    );
    const existingOrder = existingRes.rows[0];
    if (!existingOrder) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Замовлення не знайдено" });
      return;
    }

    const effectiveSchedule = {
      scheduledDate: scheduledDate !== undefined ? scheduledDate : toDateInputValue(existingOrder.scheduledDate),
      scheduledDateTo: scheduledDateTo !== undefined ? scheduledDateTo : toDateInputValue(existingOrder.scheduledDateTo),
      scheduledTimeFrom: scheduledTimeFrom !== undefined ? scheduledTimeFrom : existingOrder.scheduledTimeFrom ?? undefined,
      scheduledTimeTo: scheduledTimeTo !== undefined ? scheduledTimeTo : existingOrder.scheduledTimeTo ?? undefined,
    };

    const setClauses: string[] = [`"updatedAt" = NOW()`];
    const params: any[] = [];
    let idx = 1;

    if (rest.customerName) { setClauses.push(`"customerName" = $${idx}`); params.push(rest.customerName); idx++; }
    if (rest.customerPhone) { setClauses.push(`"customerPhone" = $${idx}`); params.push(rest.customerPhone); idx++; }
    if (rest.status) { setClauses.push(`"status" = $${idx}`); params.push(rest.status); idx++; }
    if (rest.sourceType) { setClauses.push(`"sourceType" = $${idx}`); params.push(rest.sourceType); idx++; }
    if (comment !== undefined) { setClauses.push(`"comment" = $${idx}`); params.push(comment || null); idx++; }
    if (addressFrom !== undefined) { setClauses.push(`"addressFrom" = $${idx}`); params.push(addressFrom || null); idx++; }
    if (addressTo !== undefined) { setClauses.push(`"addressTo" = $${idx}`); params.push(addressTo || null); idx++; }
    if (scheduledDate !== undefined) { setClauses.push(`"scheduledDate" = $${idx}`); params.push(scheduledDate ? new Date(`${scheduledDate}T00:00:00`) : null); idx++; }
    if (scheduledDateTo !== undefined) { setClauses.push(`"scheduledDateTo" = $${idx}`); params.push(scheduledDateTo ? new Date(`${scheduledDateTo}T00:00:00`) : null); idx++; }
    if (scheduledTimeFrom !== undefined) { setClauses.push(`"scheduledTimeFrom" = $${idx}`); params.push(scheduledTimeFrom || null); idx++; }
    if (scheduledTimeTo !== undefined) { setClauses.push(`"scheduledTimeTo" = $${idx}`); params.push(scheduledTimeTo || null); idx++; }
    if (agreedPrice !== undefined) { setClauses.push(`"agreedPrice" = $${idx}`); params.push(agreedPrice ?? null); idx++; }
    if (sourceRequestId !== undefined) { setClauses.push(`"sourceRequestId" = $${idx}`); params.push(sourceRequestId || null); idx++; }
    if (sourceCustomerRequestId !== undefined) { setClauses.push(`"sourceCustomerRequestId" = $${idx}`); params.push(sourceCustomerRequestId || null); idx++; }

    params.push(id);
    await client.query(
      `UPDATE "RentOrder" SET ${setClauses.join(", ")} WHERE "id" = $${idx}`,
      params,
    );

    const insertedItems: Array<{ equipmentId: string; startDate: Date; endDate: Date }> = [];

    // If items provided, replace all items
    if (items && Array.isArray(items)) {
      await client.query(`DELETE FROM "RentOrderItem" WHERE "rentOrderId" = $1`, [id]);
      for (const it of items) {
        const itemDateRange = resolveScheduleForItem(it, effectiveSchedule);
        const startDate = itemDateRange?.startDate ?? new Date();
        const endDate = itemDateRange?.endDate ?? new Date();
        await client.query(
          `INSERT INTO "RentOrderItem" ("rentOrderId", "equipmentId", "startDate", "endDate")
           VALUES ($1, $2, $3, $4)`,
          [
            id,
            it.equipmentId,
            startDate,
            endDate,
          ],
        );
        if (itemDateRange) {
          insertedItems.push({
            equipmentId: it.equipmentId,
            startDate,
            endDate,
          });
        }
      }
    }

    const scheduleChanged =
      scheduledDate !== undefined ||
      scheduledDateTo !== undefined ||
      scheduledTimeFrom !== undefined ||
      scheduledTimeTo !== undefined;
    const shouldSyncBookedPeriods =
      (items && Array.isArray(items)) ||
      scheduleChanged ||
      rest.status !== undefined ||
      rest.customerName !== undefined;

    if (shouldSyncBookedPeriods) {
      const currentOrderRes = await client.query(
        `SELECT * FROM "RentOrder" WHERE "id" = $1 LIMIT 1`,
        [id],
      );
      const currentOrder = currentOrderRes.rows[0];
      let bookedItems = insertedItems;

      if (!(items && Array.isArray(items))) {
        const currentItemsRes = await client.query(
          `SELECT "equipmentId", "startDate", "endDate" FROM "RentOrderItem" WHERE "rentOrderId" = $1`,
          [id],
        );
        const sharedRange = scheduleChanged
          ? buildItemDateRange(
              effectiveSchedule.scheduledDate,
              effectiveSchedule.scheduledDateTo,
              effectiveSchedule.scheduledTimeFrom,
              effectiveSchedule.scheduledTimeTo,
            )
          : null;

        if (scheduleChanged && sharedRange) {
          await client.query(
            `UPDATE "RentOrderItem"
             SET "startDate" = $1, "endDate" = $2
             WHERE "rentOrderId" = $3`,
            [sharedRange.startDate, sharedRange.endDate, id],
          );
          bookedItems = currentItemsRes.rows.map((item) => ({
            equipmentId: item.equipmentId,
            startDate: sharedRange.startDate,
            endDate: sharedRange.endDate,
          }));
        } else if (scheduleChanged && !sharedRange) {
          bookedItems = [];
        } else {
          bookedItems = currentItemsRes.rows.map((item) => ({
            equipmentId: item.equipmentId,
            startDate: item.startDate,
            endDate: item.endDate,
          }));
        }
      }

      if (clearsBookedPeriods(currentOrder.status) || bookedItems.length === 0) {
        await client.query(`DELETE FROM "BookedPeriod" WHERE "rentOrderId" = $1`, [id]);
      } else {
        await syncBookedPeriods(
          client,
          id,
          currentOrder.customerName,
          bookedItems,
        );
      }
    }

    await client.query(
      `INSERT INTO "OrderEventLog" ("orderId", "eventType", "payload", "createdByAdminId")
       VALUES ($1, 'manager_updated_order', $2, $3)`,
      [
        id,
        JSON.stringify({
          updatedFields: Object.keys(req.body).filter((key) => key !== "items"),
          itemsReplaced: Boolean(items && Array.isArray(items)),
          itemCount: Array.isArray(items) ? items.length : undefined,
        }),
        req.adminId ?? null,
      ],
    );

    await client.query("COMMIT");

    const order = await getRentOrderWithRelations(id);
    res.json(order);
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    logError("PUT /api/admin/rent-orders/:id error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});

/** Дозвіл показу призначеного працівника клієнту */
adminRentOrdersRouter.patch(
  "/:id/customer-worker-visibility",
  validate(customerWorkerVisibilitySchema),
  async (req: AuthRequest, res) => {
    const client = await pool.connect();
    try {
      const orderId = req.params.id as string;

      await client.query("BEGIN");

      const existingRes = await client.query(
        `SELECT "id", "showWorkerToCustomer"
         FROM "RentOrder"
         WHERE "id" = $1
         FOR UPDATE`,
        [orderId],
      );
      if (!existingRes.rows[0]) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Замовлення не знайдено" });
        return;
      }

      await client.query(
        `UPDATE "RentOrder"
         SET "showWorkerToCustomer" = $1,
             "updatedAt" = NOW()
         WHERE "id" = $2`,
        [req.body.showWorkerToCustomer, orderId],
      );

      await client.query(
        `INSERT INTO "OrderEventLog" ("orderId", "eventType", "payload", "createdByAdminId")
         VALUES ($1, 'customer_worker_visibility_updated', $2, $3)`,
        [
          orderId,
          JSON.stringify({ showWorkerToCustomer: req.body.showWorkerToCustomer }),
          req.adminId ?? null,
        ],
      );

      await client.query("COMMIT");

      const order = await getRentOrderWithRelations(orderId);
      res.json(order);
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback error
      }
      logError("PATCH /api/admin/rent-orders/:id/customer-worker-visibility error:", e);
      res.status(500).json({ error: "Помилка сервера" });
    } finally {
      client.release();
    }
  },
);

/** Оновити статус */
adminRentOrdersRouter.patch("/:id/status", async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    const { status } = req.body;
    const orderId = req.params.id as string;

    if (!rentOrderStatuses.includes(status)) {
      res.status(400).json({ error: "Некоректний статус" });
      return;
    }

    await client.query("BEGIN");

    const existingRes = await client.query(
      `SELECT * FROM "RentOrder" WHERE "id" = $1 FOR UPDATE`,
      [orderId],
    );
    const existingOrder = existingRes.rows[0];
    if (!existingOrder) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Замовлення не знайдено" });
      return;
    }

    if (status === "COMPLETED" && existingOrder.status !== "COMPLETED") {
      await client.query("ROLLBACK");
      res.status(400).json({
        error: "Для фінального закриття використайте блок 'Фінальне закриття менеджером'",
      });
      return;
    }

    await client.query(
      `UPDATE "RentOrder" SET "status" = $1, "updatedAt" = NOW() WHERE "id" = $2`,
      [status, orderId],
    );

    const currentItemsRes = await client.query(
      `SELECT "equipmentId", "startDate", "endDate" FROM "RentOrderItem" WHERE "rentOrderId" = $1`,
      [orderId],
    );

    // Sync booked periods based on status
    if (clearsBookedPeriods(String(status))) {
      await client.query(`DELETE FROM "BookedPeriod" WHERE "rentOrderId" = $1`, [orderId]);
    } else if (currentItemsRes.rows.length > 0) {
      await syncBookedPeriods(
        client,
        orderId,
        existingOrder.customerName,
        currentItemsRes.rows.map((it: any) => ({
          equipmentId: it.equipmentId,
          startDate: it.startDate,
          endDate: it.endDate,
        })),
      );
    }

    if (existingOrder.status !== status) {
      await client.query(
        `INSERT INTO "OrderEventLog" ("orderId", "eventType", "payload", "createdByAdminId")
         VALUES ($1, 'manager_status_changed', $2, $3)`,
        [
          orderId,
          JSON.stringify({
            from: existingOrder.status,
            to: status,
          }),
          req.adminId ?? null,
        ],
      );
    }

    await client.query("COMMIT");

    const order = await getRentOrderWithRelations(orderId);
    res.json(order);
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    logError("PATCH /api/admin/rent-orders/:id/status error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});

adminRentOrdersRouter.put(
  "/:id/execution-report/metrics",
  validate(executionMetricsSchema),
  async (req: AuthRequest, res) => {
    const client = await pool.connect();
    try {
      const orderId = req.params.id as string;
      const distanceKm = req.body.distanceKm;
      const driveDurationMinutes = req.body.driveDurationMinutes ?? null;
      const stopDurationMinutes = req.body.stopDurationMinutes ?? null;
      const engineHours = req.body.engineHours;
      const perEquipmentMetrics = Array.isArray(req.body.perEquipmentMetrics)
        ? req.body.perEquipmentMetrics
            .filter(
              (item: {
                equipmentId?: string | null;
                distanceKm?: number | null;
                driveDurationMinutes?: number | null;
                stopDurationMinutes?: number | null;
                engineHours?: number | null;
              }) =>
                Boolean(item.equipmentId) &&
                (
                  item.distanceKm != null ||
                  item.driveDurationMinutes != null ||
                  item.stopDurationMinutes != null ||
                  item.engineHours != null
                ),
            )
            .map((item: {
              equipmentId: string;
              distanceKm?: number | null;
              driveDurationMinutes?: number | null;
              stopDurationMinutes?: number | null;
              engineHours?: number | null;
            }) => ({
              equipmentId: item.equipmentId,
              distanceKm: item.distanceKm ?? null,
              driveDurationMinutes: item.driveDurationMinutes ?? null,
              stopDurationMinutes: item.stopDurationMinutes ?? null,
              engineHours: item.engineHours ?? null,
              updatedAt: new Date().toISOString(),
              updatedByAdminId: req.adminId ?? null,
            }))
        : [];

      await client.query("BEGIN");

      const latestExecutionRes = await client.query(
        `SELECT "id", "equipmentId"
         FROM "WorkExecutionSession"
         WHERE "orderId" = $1
         ORDER BY "sequenceNumber" DESC, "createdAt" DESC
         LIMIT 1`,
        [orderId],
      );
      const latestExecution = latestExecutionRes.rows[0];
      if (!latestExecution) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Сесію виконання ще не створено" });
        return;
      }

      const manualSnapshot = {
        manualMetrics: {
          distanceKm,
          driveDurationMinutes,
          stopDurationMinutes,
          engineHours,
          updatedAt: new Date().toISOString(),
          updatedByAdminId: req.adminId ?? null,
        },
        manualEquipmentMetrics: perEquipmentMetrics.filter(
          (item: { equipmentId: string }) => item.equipmentId !== latestExecution.equipmentId,
        ),
      };

      await client.query(
        `INSERT INTO "WorkExecutionReport" (
           "executionSessionId",
           "distanceKm",
           "engineHours",
           "gpsSnapshotJson",
           "updatedAt"
         )
         VALUES ($1, $2, $3, $4::jsonb, NOW())
         ON CONFLICT ("executionSessionId")
         DO UPDATE SET
           "distanceKm" = $2,
           "engineHours" = $3,
           "gpsSnapshotJson" = COALESCE("WorkExecutionReport"."gpsSnapshotJson", '{}'::jsonb) || $4::jsonb,
           "updatedAt" = NOW()`,
        [
          latestExecution.id,
          distanceKm,
          engineHours,
          JSON.stringify(manualSnapshot),
        ],
      );

      await client.query(
        `INSERT INTO "OrderEventLog" ("orderId", "eventType", "payload", "createdByAdminId")
         VALUES ($1, 'execution_metrics_manual_updated', $2, $3)`,
        [
          orderId,
          JSON.stringify({
            executionSessionId: latestExecution.id,
            distanceKm,
            driveDurationMinutes,
            stopDurationMinutes,
            engineHours,
            perEquipmentMetrics,
          }),
          req.adminId ?? null,
        ],
      );

      await client.query("COMMIT");

      await safelyUpsertAutomaticFuelExpenseForExecution(latestExecution.id);

      const order = await getRentOrderWithRelations(orderId);
      res.json(order);
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback error
      }
      logError("PUT /api/admin/rent-orders/:id/execution-report/metrics error:", e);
      res.status(500).json({ error: "Помилка сервера" });
    } finally {
      client.release();
    }
  },
);

adminRentOrdersRouter.post(
  "/:id/close",
  validate(closeOrderSchema),
  async (req: AuthRequest, res) => {
    const client = await pool.connect();
    try {
      const orderId = req.params.id as string;
      await client.query("BEGIN");

      const orderRes = await client.query(
        `SELECT * FROM "RentOrder" WHERE "id" = $1 LIMIT 1`,
        [orderId],
      );
      const order = orderRes.rows[0];
      if (!order) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Замовлення не знайдено" });
        return;
      }

      const operationalOverview = await getOrderOperationalOverview(client, orderId);
      if (!operationalOverview?.readyToClose) {
        await client.query("ROLLBACK");
        if (!operationalOverview || operationalOverview.acceptedAssignments === 0) {
          res.status(400).json({ error: "Ще немає прийнятих призначень для закриття замовлення" });
          return;
        }
        if (operationalOverview.completedAssignments !== operationalOverview.acceptedAssignments) {
          res.status(400).json({ error: "Не всі призначені працівники завершили всі етапи виконання" });
          return;
        }
        if (operationalOverview.completedReports !== operationalOverview.acceptedAssignments) {
          res.status(400).json({ error: "Не всі працівники завершили підсумковий звіт" });
          return;
        }
        res.status(400).json({ error: "Замовлення ще не готове до фінального закриття" });
        return;
      }

      const finalAgreedPrice =
        req.body.finalAgreedPrice === undefined ? order.finalAgreedPrice : req.body.finalAgreedPrice;
      const finalCashCollected =
        req.body.finalCashCollected === undefined ? order.finalCashCollected : req.body.finalCashCollected;
      const finalExtraExpenses =
        req.body.finalExtraExpenses === undefined ? order.finalExtraExpenses : req.body.finalExtraExpenses;
      const managerCloseComment =
        req.body.managerCloseComment === undefined
          ? order.managerCloseComment
          : req.body.managerCloseComment || null;

      await client.query(
        `UPDATE "RentOrder"
         SET "status" = 'COMPLETED',
             "finalAgreedPrice" = $1,
             "finalCashCollected" = $2,
             "finalExtraExpenses" = $3,
             "managerCloseComment" = $4,
             "managerClosedAt" = NOW(),
             "managerClosedById" = $5,
             "updatedAt" = NOW()
         WHERE "id" = $6`,
        [
          finalAgreedPrice ?? null,
          finalCashCollected ?? null,
          finalExtraExpenses ?? null,
          managerCloseComment ?? null,
          req.adminId ?? null,
          orderId,
        ],
      );

      await client.query(
        `INSERT INTO "OrderEventLog" ("orderId", "eventType", "payload", "createdByAdminId")
         VALUES ($1, 'manager_closed_order', $2, $3)`,
        [
          orderId,
          JSON.stringify({
            finalAgreedPrice: finalAgreedPrice ?? null,
            finalCashCollected: finalCashCollected ?? null,
            finalExtraExpenses: finalExtraExpenses ?? null,
            managerCloseComment: managerCloseComment ?? null,
          }),
          req.adminId ?? null,
        ],
      );

      await client.query(`DELETE FROM "BookedPeriod" WHERE "rentOrderId" = $1`, [orderId]);
      await client.query("COMMIT");

      void sendOrderClosedManagerNotification({
        orderId,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        finalPrice: finalAgreedPrice ?? null,
      }).catch((error) => logError("sendOrderClosedManagerNotification error:", error));

      const fullOrder = await getRentOrderWithRelations(orderId);
      res.json(fullOrder);
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback error
      }
      logError("POST /api/admin/rent-orders/:id/close error:", e);
      res.status(500).json({ error: "Помилка сервера" });
    } finally {
      client.release();
    }
  },
);

const assignWorkerSchema = z.object({
  employeeId: z.string().min(1),
  equipmentId: z.string().min(1),
  managerComment: z.string().trim().max(3000).optional(),
  plannedDurationMinutes: z.preprocess((value) => value === "" ? null : value, z.coerce.number().int().positive().nullable().optional()),
  compensation: assignmentCompensationSchema.optional(),
  notify: z.boolean().optional(),
});

const notifyWorkerAssignmentsSchema = z.object({
  employeeId: z.string().min(1),
  managerComment: z.string().trim().max(3000).optional(),
});

async function sendWorkerAssignmentsDigestToTelegram(
  client: Pick<typeof pool, "query">,
  args: {
    orderId: string;
    employeeId: string;
    managerComment?: string | null;
    adminId?: string | null;
  },
) {
  const orderRes = await client.query(`SELECT * FROM "RentOrder" WHERE "id" = $1 LIMIT 1`, [args.orderId]);
  const order = orderRes.rows[0];
  if (!order) {
    return { ok: false as const, status: 404, error: "Замовлення не знайдено" };
  }

  const employeeRes = await client.query(`SELECT * FROM "Employee" WHERE "id" = $1 LIMIT 1`, [args.employeeId]);
  const employee = employeeRes.rows[0];
  if (!employee) {
    return { ok: false as const, status: 404, error: "Працівника не знайдено" };
  }
  if (!employee.telegramChatId) {
    return { ok: false as const, status: 400, error: "У працівника немає прив’язаного Telegram chat id" };
  }

  const pendingAssignmentsRes = await client.query(
    `SELECT wa.*, e."name" AS "equipmentName"
     FROM "WorkAssignment" wa
     LEFT JOIN "Equipment" e ON e."id" = wa."equipmentId"
     WHERE wa."orderId" = $1
       AND wa."employeeId" = $2
       AND wa."status" = 'PENDING'
     ORDER BY wa."assignedAt" ASC, wa."createdAt" ASC`,
    [args.orderId, args.employeeId],
  );
  const pendingAssignments = pendingAssignmentsRes.rows;
  const primaryAssignment = pendingAssignments[0];
  if (!primaryAssignment) {
    return { ok: false as const, status: 400, error: "Немає робіт, які очікують відправки працівнику" };
  }

  const itemsRes = await client.query(
    `SELECT
       roi."startDate",
       roi."endDate",
       e."name",
       wa."assignedAt"
     FROM "WorkAssignment" wa
     LEFT JOIN "Equipment" e ON e."id" = wa."equipmentId"
     LEFT JOIN "RentOrderItem" roi
       ON roi."rentOrderId" = wa."orderId"
      AND roi."equipmentId" = wa."equipmentId"
     WHERE wa."orderId" = $1
       AND wa."employeeId" = $2
       AND wa."status" <> 'DECLINED'
     ORDER BY
       COALESCE(roi."startDate", wa."assignedAt") ASC NULLS LAST,
       wa."assignedAt" ASC,
       e."name" ASC`,
    [args.orderId, args.employeeId],
  );

  const sourceCustomerRequestRes = order.sourceCustomerRequestId
    ? await client.query(
        `SELECT
           "id",
           "requestType",
           "addressFrom",
           "addressTo",
           "scheduledDate",
           "scheduledTime",
           "comment",
           "metadata"
         FROM "CustomerRequest"
         WHERE "id" = $1
         LIMIT 1`,
        [order.sourceCustomerRequestId],
      )
    : { rows: [] };
  const legacySourceRequestRes = !sourceCustomerRequestRes.rows[0] && order.sourceRequestId
    ? await client.query(
        `SELECT "address", "dateFrom", "comment"
         FROM "Order"
         WHERE "id" = $1
         LIMIT 1`,
        [order.sourceRequestId],
      )
    : { rows: [] };
  const legacySourceRequest = legacySourceRequestRes.rows[0];
  const sourceCustomerRequest = sourceCustomerRequestRes.rows[0]
    ?? (legacySourceRequest
      ? {
          requestType: "equipment_rental",
          addressFrom: legacySourceRequest.address ?? null,
          addressTo: null,
          scheduledDate: legacySourceRequest.dateFrom ?? null,
          scheduledTime: null,
          comment: legacySourceRequest.comment ?? null,
          metadata: null,
        }
      : null);

  const compensationRes = await client.query(
    `SELECT wc.*, e."name" AS "equipmentName"
     FROM "WorkerCompensation" wc
     LEFT JOIN "Equipment" e ON e."id" = wc."equipmentId"
     WHERE wc."rentOrderId" = $1
       AND wc."employeeId" = $2
     ORDER BY wc."createdAt" ASC, wc."updatedAt" ASC`,
    [args.orderId, args.employeeId],
  );
  const compensationTexts = compensationRes.rows
    .map((row) => {
      const text = formatWorkerCompensationText({
        type: row.type,
        rate: row.rate == null ? null : Number(row.rate),
        quantity: row.quantity == null ? null : Number(row.quantity),
        percent: row.percent == null ? null : Number(row.percent),
        finalAmount: row.finalAmount == null ? null : Number(row.finalAmount),
        orderTotal: Number(order.agreedTotal ?? order.agreedPrice ?? 0),
      });
      return row.equipmentName ? `${row.equipmentName}: ${text}` : text;
    })
    .filter(Boolean);
  const workerCompensationText = compensationTexts.length > 0 ? compensationTexts.join("\n") : null;

  const requestDetails = buildWorkerRequestDetails(order, sourceCustomerRequest);
  const locations = await buildWorkerLocations(order, sourceCustomerRequest);
  const notificationServiceSlug = getNotificationServiceSlug(sourceCustomerRequest);
  const plannedStartLabel = formatPlannedStart(order, sourceCustomerRequest);
  const executionTimeLabel = formatOrderSchedule(order, sourceCustomerRequest);
  const publicOrderNumber = formatRentOrderNumber(order);
  const assignmentItems = itemsRes.rows.map((row) => ({
    title: row.name ?? "Техніка",
    startDate: row.startDate ? new Date(row.startDate).toISOString() : null,
    endDate: row.endDate ? new Date(row.endDate).toISOString() : null,
  }));
  if (assignmentItems.length === 0) {
    assignmentItems.push(
      ...pendingAssignments.map((assignment) => ({
        title: assignment.equipmentName ?? "Техніка",
        startDate: null,
        endDate: null,
      })),
    );
  }

  const renderedAssignment = await renderConfiguredNotification("worker_assignment_sent", {
    order: {
      id: publicOrderNumber,
      status: order.status,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      plannedStart: plannedStartLabel || "—",
      executionTime: executionTimeLabel || "—",
      itemsText: formatWorkerItemsText(assignmentItems),
      locationsText: formatWorkerLocationsText(locations),
      detailsText: formatWorkerDetailsText(requestDetails),
      workerCompensationText: workerCompensationText || "Не вказано",
      managerComment: args.managerComment || "—",
    },
    service: {
      title: getNotificationServiceTitle(sourceCustomerRequest),
      slug: notificationServiceSlug || "—",
    },
    worker: {
      name: employee.fullName,
      phone: employee.phone ?? "—",
    },
  }, { serviceSlug: notificationServiceSlug });

  const botResponse = (await sendWorkerAssignmentToBot({
    assignmentId: primaryAssignment.id,
    orderId: args.orderId,
    orderNumber: publicOrderNumber,
    chatId: employee.telegramChatId,
    employeeName: employee.fullName,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    orderStatus: order.status,
    messageText: renderedAssignment?.enabled === false
      ? null
      : ensureWorkerCompensationInMessage(renderedAssignment?.text ?? null, workerCompensationText),
    plannedStartLabel,
    executionTimeLabel,
    workerCompensationText,
    comment: args.managerComment ?? null,
    sourceLabel: order.sourceCustomerRequestId || order.sourceRequestId ? "Із заявки" : "Створено вручну",
    requestDetails,
    locations,
    items: assignmentItems,
  })) as { messageId?: string | null } | null;

  if (!botResponse?.messageId) {
    throw new Error("Не вдалося відправити сповіщення працівнику в Telegram");
  }

  await client.query(
    `UPDATE "WorkAssignment"
     SET "telegramMessageId" = $1, "updatedAt" = NOW()
     WHERE "orderId" = $2
       AND "employeeId" = $3
       AND "status" = 'PENDING'`,
    [String(botResponse.messageId), args.orderId, args.employeeId],
  );

  await client.query(
    `INSERT INTO "OrderEventLog" ("orderId", "assignmentId", "eventType", "payload", "createdByAdminId")
     VALUES ($1, $2, 'worker_assignment_notification_sent', $3, $4)`,
    [
      args.orderId,
      primaryAssignment.id,
      JSON.stringify({
        employeeId: employee.id,
        employeeName: employee.fullName,
        assignmentIds: pendingAssignments.map((assignment) => assignment.id),
        managerComment: args.managerComment ?? null,
      }),
      args.adminId ?? null,
    ],
  );

  return { ok: true as const };
}

adminRentOrdersRouter.post(
  "/:id/assign",
  validate(assignWorkerSchema),
  async (req: AuthRequest, res) => {
    const client = await pool.connect();
    try {
      const orderId = req.params.id as string;
      const { employeeId, equipmentId, managerComment, plannedDurationMinutes, compensation, notify } = req.body;
      const workerManagerComment = managerComment?.trim() || null;
      const shouldNotifyWorker = notify !== false;

      await client.query("BEGIN");

      const orderRes = await client.query(
        `SELECT * FROM "RentOrder" WHERE "id" = $1 LIMIT 1`,
        [orderId],
      );
      const order = orderRes.rows[0];
      if (!order) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Замовлення не знайдено" });
        return;
      }

      const employeeRes = await client.query(
        `SELECT * FROM "Employee" WHERE "id" = $1 LIMIT 1`,
        [employeeId],
      );
      const employee = employeeRes.rows[0];
      if (!employee) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Працівника не знайдено" });
        return;
      }

      if (shouldNotifyWorker && !employee.telegramChatId) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "У працівника немає прив’язаного Telegram chat id" });
        return;
      }

      const equipment = await ensureEquipmentExists(client, equipmentId);
      if (!equipment) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Техніку не знайдено" });
        return;
      }

      const assignmentRes = await client.query(
        `INSERT INTO "WorkAssignment" (
           "orderId",
           "employeeId",
           "equipmentId",
           "status",
           "assignedAt",
           "plannedDurationMinutes",
           "assignedByManagerId",
           "updatedAt"
         )
         VALUES ($1, $2, $3, 'PENDING', NOW(), $4, $5, NOW())
         RETURNING *`,
        [orderId, employeeId, equipmentId, plannedDurationMinutes ?? null, req.adminId ?? null],
      );

      const assignment = assignmentRes.rows[0];

      if (compensation) {
        const compensationResult = await upsertWorkerCompensationForOrder(client, {
          orderId,
          assignmentId: assignment.id,
          employeeId,
          equipmentId,
          payload: compensation,
          adminId: req.adminId ?? null,
        });
        if (!compensationResult.ok) {
          await client.query("ROLLBACK");
          res.status(compensationResult.status).json({ error: compensationResult.error });
          return;
        }
      }

      if (!shouldNotifyWorker) {
        await client.query(
          `INSERT INTO "OrderEventLog" ("orderId", "assignmentId", "eventType", "payload", "createdByAdminId")
           VALUES ($1, $2, 'worker_assigned', $3, $4)`,
          [
            orderId,
            assignment.id,
            JSON.stringify({
              employeeId: employee.id,
              employeeName: employee.fullName,
              equipmentId: equipment.id,
              equipmentName: equipment.name,
              managerComment: workerManagerComment,
              plannedDurationMinutes: plannedDurationMinutes ?? null,
              telegramNotification: "deferred",
            }),
            req.adminId ?? null,
          ],
        );

        await client.query("COMMIT");

        const fullOrder = await getRentOrderWithRelations(orderId);
        res.json(fullOrder);
        return;
      }

      const itemsRes = await client.query(
        `SELECT
           roi."startDate",
           roi."endDate",
           e."name",
           wa."assignedAt"
         FROM "WorkAssignment" wa
         LEFT JOIN "Equipment" e ON e."id" = wa."equipmentId"
         LEFT JOIN "RentOrderItem" roi
           ON roi."rentOrderId" = wa."orderId"
          AND roi."equipmentId" = wa."equipmentId"
         WHERE wa."orderId" = $1
           AND wa."employeeId" = $2
           AND wa."status" <> 'DECLINED'
         ORDER BY
           COALESCE(roi."startDate", wa."assignedAt") ASC NULLS LAST,
           wa."assignedAt" ASC,
           e."name" ASC`,
        [orderId, employeeId],
      );

      const sourceCustomerRequestRes = order.sourceCustomerRequestId
        ? await client.query(
            `SELECT
               "id",
               "requestType",
               "addressFrom",
               "addressTo",
               "scheduledDate",
               "scheduledTime",
               "comment",
               "metadata"
             FROM "CustomerRequest"
             WHERE "id" = $1
             LIMIT 1`,
            [order.sourceCustomerRequestId],
          )
        : { rows: [] };
      const legacySourceRequestRes = !sourceCustomerRequestRes.rows[0] && order.sourceRequestId
        ? await client.query(
            `SELECT "address", "dateFrom", "comment"
             FROM "Order"
             WHERE "id" = $1
             LIMIT 1`,
            [order.sourceRequestId],
          )
        : { rows: [] };
      const legacySourceRequest = legacySourceRequestRes.rows[0];
      const sourceCustomerRequest = sourceCustomerRequestRes.rows[0]
        ?? (legacySourceRequest
          ? {
              requestType: "equipment_rental",
              addressFrom: legacySourceRequest.address ?? null,
              addressTo: null,
              scheduledDate: legacySourceRequest.dateFrom ?? null,
              scheduledTime: null,
              comment: legacySourceRequest.comment ?? null,
              metadata: null,
            }
          : null);
      const latestCompensationRes = await client.query(
        `SELECT *
         FROM "WorkerCompensation"
         WHERE "rentOrderId" = $1
           AND (
             "assignmentId" = $2
             OR ("employeeId" = $3 AND COALESCE("equipmentId",'') = COALESCE($4::text,''))
           )
         ORDER BY "updatedAt" DESC, "createdAt" DESC
         LIMIT 1`,
        [orderId, assignment.id, employeeId, equipmentId],
      );
      const latestCompensation = latestCompensationRes.rows[0] ?? null;
      const requestDetails = buildWorkerRequestDetails(order, sourceCustomerRequest);
      const locations = await buildWorkerLocations(order, sourceCustomerRequest);
      const notificationServiceSlug = getNotificationServiceSlug(sourceCustomerRequest);
      const plannedStartLabel = formatPlannedStart(order, sourceCustomerRequest);
      const executionTimeLabel = formatOrderSchedule(order, sourceCustomerRequest);
      const publicOrderNumber = formatRentOrderNumber(order);
      const workerCompensationText = latestCompensation
        ? formatWorkerCompensationText({
            type: latestCompensation.type,
            rate: latestCompensation.rate == null ? null : Number(latestCompensation.rate),
            quantity: latestCompensation.quantity == null ? null : Number(latestCompensation.quantity),
            percent: latestCompensation.percent == null ? null : Number(latestCompensation.percent),
            finalAmount: latestCompensation.finalAmount == null ? null : Number(latestCompensation.finalAmount),
            orderTotal: Number(order.agreedTotal ?? order.agreedPrice ?? 0),
          })
        : null;
      const assignmentItems = itemsRes.rows.map((row) => ({
        title: row.name ?? equipment.name ?? "Техніка",
        startDate: row.startDate ? new Date(row.startDate).toISOString() : null,
        endDate: row.endDate ? new Date(row.endDate).toISOString() : null,
      }));
      if (assignmentItems.length === 0) {
        assignmentItems.push({
          title: equipment.name ?? "Техніка",
          startDate: null,
          endDate: null,
        });
      }
      const renderedAssignment = await renderConfiguredNotification("worker_assignment_sent", {
        order: {
          id: publicOrderNumber,
          status: order.status,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          plannedStart: plannedStartLabel || "—",
          executionTime: executionTimeLabel || "—",
          itemsText: formatWorkerItemsText(assignmentItems),
          locationsText: formatWorkerLocationsText(locations),
          detailsText: formatWorkerDetailsText(requestDetails),
          workerCompensationText: workerCompensationText || "Не вказано",
          managerComment: workerManagerComment || "—",
        },
        service: {
          title: getNotificationServiceTitle(sourceCustomerRequest),
          slug: notificationServiceSlug || "—",
        },
        worker: {
          name: employee.fullName,
          phone: employee.phone ?? "—",
        },
      }, { serviceSlug: notificationServiceSlug });

      await client.query(
        `INSERT INTO "OrderEventLog" ("orderId", "assignmentId", "eventType", "payload", "createdByAdminId")
         VALUES ($1, $2, 'worker_assigned', $3, $4)`,
        [
          orderId,
          assignment.id,
          JSON.stringify({
            employeeId: employee.id,
            employeeName: employee.fullName,
            equipmentId: equipment.id,
            equipmentName: equipment.name,
            managerComment: workerManagerComment,
            plannedDurationMinutes: plannedDurationMinutes ?? null,
          }),
          req.adminId ?? null,
        ],
      );

      const botResponse = (await sendWorkerAssignmentToBot({
        assignmentId: assignment.id,
        orderId,
        orderNumber: publicOrderNumber,
        chatId: employee.telegramChatId,
        employeeName: employee.fullName,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        orderStatus: order.status,
        messageText: renderedAssignment?.enabled === false
          ? null
          : ensureWorkerCompensationInMessage(renderedAssignment?.text ?? null, workerCompensationText),
        plannedStartLabel,
        executionTimeLabel,
        workerCompensationText,
        comment: workerManagerComment,
        sourceLabel:
          order.sourceCustomerRequestId || order.sourceRequestId
            ? "Із заявки"
            : "Створено вручну",
        requestDetails,
        locations,
        items: assignmentItems,
      })) as { messageId?: string | null } | null;

      if (!botResponse?.messageId) {
        throw new Error("Не вдалося відправити сповіщення працівнику в Telegram");
      }

      await client.query(
        `UPDATE "WorkAssignment"
         SET "telegramMessageId" = $1, "updatedAt" = NOW()
         WHERE "id" = $2`,
        [String(botResponse.messageId), assignment.id],
      );

      await client.query("COMMIT");

      const fullOrder = await getRentOrderWithRelations(orderId);
      res.json(fullOrder);
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback error
      }
      logError("POST /api/admin/rent-orders/:id/assign error:", e);
      if (e instanceof BotInternalError) {
        res.status(e.statusCode).json({ error: e.message });
        return;
      }
      res.status(500).json({ error: "Помилка сервера під час призначення працівника" });
    } finally {
      client.release();
    }
  },
);

adminRentOrdersRouter.post(
  "/:id/assignments/notify-worker",
  validate(notifyWorkerAssignmentsSchema),
  async (req: AuthRequest, res) => {
    const client = await pool.connect();
    try {
      const orderId = req.params.id as string;
      const { employeeId, managerComment } = req.body;

      await client.query("BEGIN");
      const result = await sendWorkerAssignmentsDigestToTelegram(client, {
        orderId,
        employeeId,
        managerComment: managerComment?.trim() || null,
        adminId: req.adminId ?? null,
      });

      if (!result.ok) {
        await client.query("ROLLBACK");
        res.status(result.status).json({ error: result.error });
        return;
      }

      await client.query("COMMIT");

      const fullOrder = await getRentOrderWithRelations(orderId);
      res.json(fullOrder);
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback error
      }
      logError("POST /api/admin/rent-orders/:id/assignments/notify-worker error:", e);
      if (e instanceof BotInternalError) {
        res.status(e.statusCode).json({ error: e.message });
        return;
      }
      res.status(500).json({ error: "Помилка сервера під час відправки завдання працівнику" });
    } finally {
      client.release();
    }
  },
);

adminRentOrdersRouter.patch(
  "/:id/assignments/:assignmentId/next-shift",
  validate(assignmentNextShiftSchema),
  async (req: AuthRequest, res) => {
    const client = await pool.connect();
    try {
      const orderId = req.params.id as string;
      const assignmentId = req.params.assignmentId as string;
      const plannedNextStartAt = parseIsoDateTime(req.body.plannedNextStartAt ?? null);
      const plannedDurationMinutes = req.body.plannedDurationMinutes ?? null;
      const completionComment = req.body.completionComment?.trim() || null;

      await client.query("BEGIN");

      const orderRes = await client.query(
        `SELECT "id", "status"
         FROM "RentOrder"
         WHERE "id" = $1
         LIMIT 1`,
        [orderId],
      );
      const order = orderRes.rows[0];
      if (!order) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Замовлення не знайдено" });
        return;
      }

      const assignmentRes = await client.query(
        `SELECT *
         FROM "WorkAssignment"
         WHERE "id" = $1 AND "orderId" = $2
         LIMIT 1`,
        [assignmentId, orderId],
      );
      const assignment = assignmentRes.rows[0];
      if (!assignment) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Призначення не знайдено" });
        return;
      }

      if (assignment.status !== "ACCEPTED") {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Наступну зміну можна планувати лише для прийнятого призначення" });
        return;
      }

      if (["COMPLETED", "CANCELLED"].includes(String(order.status ?? ""))) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Для закритого або скасованого замовлення не можна планувати нову зміну" });
        return;
      }

      const availability = await checkAssignmentScheduleAvailability(client, {
        orderId,
        employeeId: assignment.employeeId,
        equipmentId: assignment.equipmentId ?? null,
        plannedStartAt: plannedNextStartAt,
        plannedDurationMinutes,
      });
      if (!availability.ok) {
        await client.query("ROLLBACK");
        res.status(409).json({
          error: availability.error,
          availability: availability.availability,
        });
        return;
      }

      await client.query(
        `UPDATE "WorkAssignment"
         SET "completionStatus" = 'AWAITING_NEXT_SHIFT',
             "completedAt" = NULL,
             "plannedNextStartAt" = $1,
             "plannedDurationMinutes" = $2,
             "completionComment" = $3,
             "updatedAt" = NOW()
         WHERE "id" = $4`,
        [plannedNextStartAt, plannedDurationMinutes, completionComment, assignmentId],
      );

      await client.query(
        `INSERT INTO "OrderEventLog" ("orderId", "assignmentId", "eventType", "payload", "createdByAdminId")
         VALUES ($1, $2, 'manager_planned_next_shift', $3, $4)`,
        [
          orderId,
          assignmentId,
          JSON.stringify({
            previousCompletionStatus: assignment.completionStatus ?? null,
            plannedNextStartAt: plannedNextStartAt?.toISOString() ?? null,
            plannedDurationMinutes: plannedDurationMinutes ?? null,
            completionComment,
          }),
          req.adminId ?? null,
        ],
      );

      await client.query("COMMIT");

      const fullOrder = await getRentOrderWithRelations(orderId);
      res.json(fullOrder);
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback error
      }
      logError("PATCH /api/admin/rent-orders/:id/assignments/:assignmentId/next-shift error:", e);
      res.status(500).json({ error: "Помилка сервера" });
    } finally {
      client.release();
    }
  },
);

/** Видалити замовлення */
adminRentOrdersRouter.delete("/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const orderId = req.params.id as string;
    await client.query("BEGIN");
    await client.query(`DELETE FROM "BookedPeriod" WHERE "rentOrderId" = $1`, [orderId]);
    await client.query(`DELETE FROM "RentOrder" WHERE "id" = $1`, [orderId]);
    await client.query("COMMIT");
    res.json({ success: true });
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    logError("DELETE /api/admin/rent-orders/:id error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});
