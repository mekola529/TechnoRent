import type { PoolClient } from "pg";
import { extractStructuredTowOrderMeta } from "./order-comment.js";
import { normalizeEmail, normalizePhone } from "./customer-auth.js";

type RequestEventPayload = Record<string, unknown> | null | undefined;

interface EquipmentRequestInput {
  legacyOrderId: string;
  customerName: string;
  phone: string;
  email?: string | null;
  addressFrom?: string | null;
  addressTo?: string | null;
  comment?: string | null;
  equipmentId?: string | null;
  equipmentName?: string | null;
  requestType?: string | null;
  serviceName?: string | null;
  metadata?: Record<string, unknown> | null;
  attribution?: Record<string, unknown> | null;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  status?: string;
}

interface ServiceRequestInput {
  legacyServiceRequestId: string;
  customerName: string;
  phone: string;
  addressFrom: string;
  comment?: string | null;
  serviceType: string;
  serviceTitle?: string | null;
  attribution?: Record<string, unknown> | null;
  scheduledDate: Date;
  scheduledTime: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  status?: string;
}

function getMaterialDeliveryMeta(metadata?: Record<string, unknown> | null) {
  const materialDelivery = metadata?.materialDelivery;
  return materialDelivery && typeof materialDelivery === "object"
    ? materialDelivery as Record<string, unknown>
    : null;
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function normalizeTimestamp(value?: Date | string | null): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

async function logRequestEvent(
  client: PoolClient,
  requestId: string,
  eventType: string,
  payload?: RequestEventPayload,
) {
  await client.query(
    `INSERT INTO "OrderEventLog" ("requestId", "eventType", "payload")
     VALUES ($1, $2, $3)`,
    [requestId, eventType, payload ?? null],
  );
}

export async function ensureCustomerRequestForEquipmentOrder(
  client: PoolClient,
  input: EquipmentRequestInput,
) {
  const createdAt = normalizeTimestamp(input.createdAt) ?? new Date();
  const updatedAt = normalizeTimestamp(input.updatedAt) ?? createdAt;
  const parsedTowMeta = extractStructuredTowOrderMeta(input.comment);
  const explicitTowMeta =
    input.metadata && typeof input.metadata === "object" && input.metadata.tow && typeof input.metadata.tow === "object"
      ? (input.metadata.tow as Record<string, unknown>)
      : null;
  const serviceName = input.serviceName ?? parsedTowMeta.serviceName;
  const requestType = input.requestType ?? (parsedTowMeta.isTowRequest ? "tow" : "equipment_rental");
  const addressTo = input.addressTo ?? parsedTowMeta.destinationAddress;
  const materialDeliveryMeta = getMaterialDeliveryMeta(input.metadata);
  const structuredComment =
    (explicitTowMeta?.customerComment as string | undefined) ??
    getString(materialDeliveryMeta?.customerComment) ??
    parsedTowMeta.customerComment ??
    input.comment ??
    null;
  const metadata = {
    equipmentId: input.equipmentId ?? null,
    dateFrom: input.dateFrom ?? null,
    dateTo: input.dateTo ?? null,
    serviceName,
    attribution: input.attribution ?? null,
    tow: requestType === "tow"
      ? {
          selectedEquipmentId:
            (explicitTowMeta?.selectedEquipmentId as string | undefined) ??
            null,
          selectedTrackerId:
            (explicitTowMeta?.selectedTrackerId as string | undefined) ??
            null,
          selectedEquipmentName:
            (explicitTowMeta?.selectedEquipmentName as string | undefined) ??
            null,
          selectedTrackerName:
            (explicitTowMeta?.selectedTrackerName as string | undefined) ??
            null,
          destinationAddress:
            (explicitTowMeta?.destinationAddress as string | undefined) ??
            addressTo ??
            null,
          towVehicleLabel:
            (explicitTowMeta?.towVehicleLabel as string | undefined) ??
            parsedTowMeta.towVehicleLabel ??
            null,
          pickupCoordinates:
            typeof explicitTowMeta?.pickupCoordinates === "object"
              ? explicitTowMeta.pickupCoordinates
              : null,
          destinationCoordinates:
            typeof explicitTowMeta?.destinationCoordinates === "object"
              ? explicitTowMeta.destinationCoordinates
              : null,
          truckCurrentPosition:
            (explicitTowMeta?.truckCurrentPosition as string | undefined) ??
            parsedTowMeta.truckCurrentPosition ??
            null,
          truckDispatchDistance:
            (explicitTowMeta?.truckDispatchDistance as string | undefined) ??
            parsedTowMeta.truckDispatchDistance ??
            null,
          truckDispatchEta:
            (explicitTowMeta?.truckDispatchEta as string | undefined) ??
            parsedTowMeta.truckDispatchEta ??
            null,
          clientRouteDistance:
            (explicitTowMeta?.clientRouteDistance as string | undefined) ??
            parsedTowMeta.clientRouteDistance ??
            null,
          clientRouteEta:
            (explicitTowMeta?.clientRouteEta as string | undefined) ??
            parsedTowMeta.clientRouteEta ??
            null,
          totalRouteDistance:
            (explicitTowMeta?.totalRouteDistance as string | undefined) ??
            parsedTowMeta.totalRouteDistance ??
            null,
          tariffLabel:
            (explicitTowMeta?.tariffLabel as string | undefined) ??
            parsedTowMeta.tariffLabel ??
            null,
          estimatedCost:
            (explicitTowMeta?.estimatedCost as string | undefined) ??
            parsedTowMeta.estimatedCost ??
            null,
          calculationMode:
            (explicitTowMeta?.calculationMode as string | undefined) ??
            null,
          requestMode:
            (explicitTowMeta?.requestMode as string | undefined) ??
            null,
          scheduledDate:
            (explicitTowMeta?.scheduledDate as string | undefined) ??
            null,
          scheduledTime:
            (explicitTowMeta?.scheduledTime as string | undefined) ??
            null,
          customerComment: structuredComment,
        }
      : null,
      rawComment: input.comment ?? null,
      ...Object.fromEntries(
        Object.entries(input.metadata ?? {}).filter(([key]) => key !== "tow" && key !== "attribution"),
      ),
  };

  const { rows } = await client.query(
    `INSERT INTO "CustomerRequest" (
       "source",
       "requestType",
       "status",
       "customerName",
       "phone",
       "email",
       "phoneNormalized",
       "emailNormalized",
       "addressFrom",
       "addressTo",
       "scheduledDate",
       "scheduledTime",
       "comment",
       "legacyOrderId",
       "createdAt",
       "updatedAt",
       "metadata"
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     ON CONFLICT ("legacyOrderId") WHERE "legacyOrderId" IS NOT NULL
     DO UPDATE SET
       "customerName" = EXCLUDED."customerName",
       "phone" = EXCLUDED."phone",
       "email" = EXCLUDED."email",
       "phoneNormalized" = EXCLUDED."phoneNormalized",
       "emailNormalized" = EXCLUDED."emailNormalized",
       "addressFrom" = EXCLUDED."addressFrom",
       "addressTo" = EXCLUDED."addressTo",
       "scheduledDate" = EXCLUDED."scheduledDate",
       "scheduledTime" = EXCLUDED."scheduledTime",
       "comment" = EXCLUDED."comment",
       "requestType" = EXCLUDED."requestType",
       "status" = EXCLUDED."status",
       "updatedAt" = EXCLUDED."updatedAt",
       "metadata" = EXCLUDED."metadata"
     RETURNING "id"`,
    [
      "site",
      requestType,
      input.status ?? "NEW",
      input.customerName,
      input.phone,
      input.email ?? null,
      normalizePhone(input.phone),
      normalizeEmail(input.email),
      input.addressFrom ?? null,
      addressTo ?? null,
      input.dateFrom ?? null,
      getString(materialDeliveryMeta?.scheduledTime) ?? getString(explicitTowMeta?.scheduledTime),
      structuredComment,
      input.legacyOrderId,
      createdAt,
      updatedAt,
      JSON.stringify(metadata),
    ],
  );

  const requestId = rows[0]?.id as string;

  await client.query(`DELETE FROM "CustomerRequestItem" WHERE "requestId" = $1`, [requestId]);

  if (requestType === "equipment_rental" && (input.equipmentId || input.equipmentName)) {
    await client.query(
      `INSERT INTO "CustomerRequestItem" (
         "requestId",
         "itemType",
         "refId",
         "titleSnapshot",
         "quantity",
         "unit"
       )
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        requestId,
        "equipment",
        input.equipmentId ?? null,
        input.equipmentName ?? "Оренда техніки",
        1,
        "шт",
      ],
    );
  }

  if (serviceName && (requestType === "tow" || requestType === "service")) {
    const materialName = getString(materialDeliveryMeta?.selectedMaterialName);
    const materialQuantity = getNumber(materialDeliveryMeta?.quantity);
    const materialUnit = getString(materialDeliveryMeta?.unit);
    const totalEstimatedCost = getNumber(materialDeliveryMeta?.totalEstimatedCost);
    const chosenSupplierPointName = getString(materialDeliveryMeta?.chosenSupplierPointName);
    const serviceNotes = materialDeliveryMeta
      ? [
          materialName ? `Матеріал: ${materialName}` : null,
          totalEstimatedCost !== null ? `Орієнтовно: ${Math.round(totalEstimatedCost)} грн` : null,
          chosenSupplierPointName ? `Точка: ${chosenSupplierPointName}` : null,
        ].filter(Boolean).join(" • ")
      : metadata.tow?.totalRouteDistance
        ? `Орієнтовний маршрут: ${metadata.tow.totalRouteDistance}`
        : null;

    await client.query(
      `INSERT INTO "CustomerRequestItem" (
         "requestId",
         "itemType",
         "refId",
         "titleSnapshot",
         "quantity",
         "unit",
         "notes"
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        requestId,
        "service",
        requestType === "tow" ? "tow_service" : serviceName,
        serviceName,
        materialDeliveryMeta ? materialQuantity ?? 1 : 1,
        materialDeliveryMeta ? materialUnit ?? "послуга" : "послуга",
        serviceNotes,
      ],
    );
  }

  await logRequestEvent(client, requestId, "request_created", {
    source: "site",
    requestType,
    legacyOrderId: input.legacyOrderId,
    serviceName,
  });

  return requestId;
}

export async function ensureCustomerRequestForServiceRequest(
  client: PoolClient,
  input: ServiceRequestInput,
) {
  const createdAt = normalizeTimestamp(input.createdAt) ?? new Date();
  const updatedAt = normalizeTimestamp(input.updatedAt) ?? createdAt;

  const { rows } = await client.query(
    `INSERT INTO "CustomerRequest" (
       "source",
       "requestType",
       "status",
       "customerName",
       "phone",
       "phoneNormalized",
       "addressFrom",
       "scheduledDate",
       "scheduledTime",
       "comment",
       "legacyServiceRequestId",
       "createdAt",
       "updatedAt",
       "metadata"
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT ("legacyServiceRequestId") WHERE "legacyServiceRequestId" IS NOT NULL
     DO UPDATE SET
       "customerName" = EXCLUDED."customerName",
       "phone" = EXCLUDED."phone",
       "phoneNormalized" = EXCLUDED."phoneNormalized",
       "addressFrom" = EXCLUDED."addressFrom",
       "scheduledDate" = EXCLUDED."scheduledDate",
       "scheduledTime" = EXCLUDED."scheduledTime",
       "comment" = EXCLUDED."comment",
       "status" = EXCLUDED."status",
       "updatedAt" = EXCLUDED."updatedAt",
       "metadata" = EXCLUDED."metadata"
     RETURNING "id"`,
    [
      "site",
      "service",
      input.status ?? "NEW",
      input.customerName,
      input.phone,
      normalizePhone(input.phone),
      input.addressFrom,
      input.scheduledDate,
      input.scheduledTime,
      input.comment ?? null,
      input.legacyServiceRequestId,
      createdAt,
      updatedAt,
      JSON.stringify({
        serviceType: input.serviceType,
        attribution: input.attribution ?? null,
      }),
    ],
  );

  const requestId = rows[0]?.id as string;

  await client.query(`DELETE FROM "CustomerRequestItem" WHERE "requestId" = $1`, [requestId]);
  await client.query(
    `INSERT INTO "CustomerRequestItem" (
       "requestId",
       "itemType",
       "refId",
       "titleSnapshot",
       "quantity",
       "unit"
     )
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      requestId,
      "service",
      input.serviceType,
      input.serviceTitle ?? input.serviceType,
      1,
      "послуга",
    ],
  );

  await logRequestEvent(client, requestId, "request_created", {
    source: "site",
    requestType: "service",
    legacyServiceRequestId: input.legacyServiceRequestId,
    serviceType: input.serviceType,
  });

  return requestId;
}

export async function syncCustomerRequestStatus(
  client: PoolClient,
  customerRequestId: string,
  status: string,
) {
  const { rows } = await client.query(
    `UPDATE "CustomerRequest"
     SET "status" = $1, "updatedAt" = NOW()
     WHERE "id" = $2
     RETURNING "id", "legacyOrderId", "legacyServiceRequestId"`,
    [status, customerRequestId],
  );

  const request = rows[0];
  if (!request) {
    return null;
  }

  const legacyStatus = status === "CONVERTED" ? "COMPLETED" : status;

  if (request.legacyOrderId) {
    await client.query(
      `UPDATE "Order" SET "status" = $1, "updatedAt" = NOW() WHERE "id" = $2`,
      [legacyStatus, request.legacyOrderId],
    );
  }

  if (request.legacyServiceRequestId) {
    await client.query(
      `UPDATE "ServiceRequest" SET "status" = $1, "updatedAt" = NOW() WHERE "id" = $2`,
      [legacyStatus, request.legacyServiceRequestId],
    );
  }

  await logRequestEvent(client, customerRequestId, "request_status_changed", { status });

  return request;
}

export async function markCustomerRequestConverted(
  client: PoolClient,
  customerRequestId: string,
  rentOrderId: string,
) {
  const request = await syncCustomerRequestStatus(client, customerRequestId, "CONVERTED");
  await client.query(
    `UPDATE "CustomerRequest"
     SET "convertedOrderId" = $1, "updatedAt" = NOW()
     WHERE "id" = $2`,
    [rentOrderId, customerRequestId],
  );
  await logRequestEvent(client, customerRequestId, "request_converted_to_order", {
    rentOrderId,
  });
  return request;
}
