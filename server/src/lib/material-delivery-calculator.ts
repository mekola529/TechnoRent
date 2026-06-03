import { pool } from "./db.js";
import { geocodeAddressForMaps, normalizeCoordinate } from "./geocode-address.js";
import { logError } from "./logger.js";
import type { MaterialDeliveryCalculationMode, MaterialDeliveryRequestMode } from "./material-delivery-types.js";

interface Coordinates {
  lat: number;
  lon: number;
}

interface CalculationInput {
  serviceSlug: string;
  materialId: string;
  quantity: number;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  requestMode: MaterialDeliveryRequestMode;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
}

interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
}

const routeCache = new Map<string, RouteResult>();

export async function getMaterialDeliveryOptions(serviceSlug: string) {
  const service = await getMaterialDeliveryService(serviceSlug);
  if (!service) {
    return null;
  }

  const { rows } = await pool.query(
    `SELECT DISTINCT
       m."id",
       m."name",
       m."slug",
       m."unit",
       m."minOrderQuantity",
       m."sortOrder"
     FROM "Material" m
     INNER JOIN "SupplierMaterialOffer" smo ON smo."materialId" = m."id"
     INNER JOIN "SupplierPoint" sp ON sp."id" = smo."supplierPointId"
     WHERE m."isActive" = true
       AND smo."isAvailable" = true
       AND sp."isActive" = true
     ORDER BY m."sortOrder" ASC, m."name" ASC`,
  );

  return {
    available: rows.length > 0,
    service: {
      slug: service.slug,
      title: service.title,
      priceInfo: service.priceInfo,
      deliveryRatePerKm: service.deliveryRatePerKm,
    },
    materials: rows,
    message: rows.length > 0 ? null : "Немає доступних матеріалів для розрахунку.",
  };
}

export async function calculateMaterialDelivery(input: CalculationInput) {
  const service = await getMaterialDeliveryService(input.serviceSlug);
  if (!service) {
    return unavailable("Послугу доставки матеріалів не знайдено або вона неактивна.");
  }

  const deliveryRatePerKm = normalizeCoordinate(service.deliveryRatePerKm);
  if (!deliveryRatePerKm || deliveryRatePerKm <= 0) {
    return unavailable("Для послуги не вказано тариф доставки за 1 км.");
  }

  const destination = await resolveDestination(input);
  if (!destination) {
    return unavailable("Не вдалося визначити координати адреси доставки.");
  }

  const materialResult = await pool.query(
    `SELECT "id", "name", "unit", "minOrderQuantity"
     FROM "Material"
     WHERE "id" = $1 AND "isActive" = true
     LIMIT 1`,
    [input.materialId],
  );
  const material = materialResult.rows[0];
  if (!material) {
    return unavailable("Матеріал не знайдено або він неактивний.");
  }

  const materialMinQuantity = normalizeCoordinate(material.minOrderQuantity);
  if (materialMinQuantity && input.quantity < materialMinQuantity) {
    return unavailable(`Мінімальна кількість для матеріалу ${material.name}: ${materialMinQuantity} ${material.unit}.`);
  }

  const offers = await getAvailableOffers(input.materialId);
  if (offers.length === 0) {
    return unavailable("Для цього матеріалу немає активних точок постачання.");
  }

  const startCandidates = await getStartCandidates(service.relatedEquipmentTypes, input.requestMode);
  if (startCandidates.length === 0) {
    return unavailable(input.requestMode === "scheduled"
      ? "Для запланованого розрахунку немає техніки з базовою локацією."
      : "Для термінового розрахунку немає техніки з актуальним GPS.");
  }

  const alternatives = [];
  const calculationMode: MaterialDeliveryCalculationMode =
    input.requestMode === "scheduled" ? "scheduled_base" : "urgent_live";
  let lastRoutingError: Error | null = null;

  for (const offer of offers) {
    const offerMinQuantity = normalizeCoordinate(offer.minOrderQuantity);
    if (offerMinQuantity && input.quantity < offerMinQuantity) {
      continue;
    }

    for (const candidate of startCandidates) {
      try {
        const truckToPoint = await fetchRoute(candidate.position, offer.supplierPoint.position);
        const pointToClient = await fetchRoute(offer.supplierPoint.position, destination.position);
        const truckToPointKm = truckToPoint.distanceMeters / 1000;
        const pointToClientKm = pointToClient.distanceMeters / 1000;
        const materialCost = offer.unitPrice * input.quantity;
        const deliveryCost = deliveryRatePerKm * (truckToPointKm + pointToClientKm);
        const totalCost = materialCost + deliveryCost;

        alternatives.push({
          supplierPoint: offer.supplierPoint,
          material: {
            id: material.id,
            name: material.name,
            unit: material.unit,
          },
          equipment: candidate.equipment,
          trackerDevice: candidate.trackerDevice,
          calculationMode,
          startSource: candidate.source,
          unitPrice: offer.unitPrice,
          quantity: input.quantity,
          materialCost: roundMoney(materialCost),
          deliveryCost: roundMoney(deliveryCost),
          totalCost: roundMoney(totalCost),
          truckToPointKm: roundKm(truckToPointKm),
          pointToClientKm: roundKm(pointToClientKm),
          truckToPointDurationSeconds: Math.round(truckToPoint.durationSeconds),
          pointToClientDurationSeconds: Math.round(pointToClient.durationSeconds),
        });
      } catch (error) {
        lastRoutingError = error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  if (alternatives.length === 0) {
    if (lastRoutingError) {
      logError("material-delivery route calculation failed:", {
        address: input.address,
        requestMode: input.requestMode,
        destination,
        startCandidates: startCandidates.length,
        offers: offers.length,
        error: lastRoutingError.message,
      });
    }
    return unavailable("Не вдалося побудувати маршрут для доступних точок постачання.");
  }

  alternatives.sort((a, b) => a.totalCost - b.totalCost);
  const chosen = alternatives[0];

  return {
    available: true,
    deliveryCost: chosen.deliveryCost,
    materialCost: chosen.materialCost,
    totalCost: chosen.totalCost,
    calculationMode,
    message: null,
    chosenSupplierPoint: chosen.supplierPoint,
    chosenEquipment: chosen.equipment,
    chosenTrackerDevice: chosen.trackerDevice,
    alternatives,
    truckToPointKm: chosen.truckToPointKm,
    pointToClientKm: chosen.pointToClientKm,
    pricingDetails: {
      deliveryRatePerKm,
      unitPrice: chosen.unitPrice,
      quantity: input.quantity,
      unit: material.unit,
      scheduledDate: input.scheduledDate ?? null,
      scheduledTime: input.scheduledTime ?? null,
      destinationAddress: destination.address,
      destinationCoordinates: destination.position,
    },
  };
}

async function getMaterialDeliveryService(slug: string) {
  const { rows } = await pool.query(
    `SELECT
       "id",
       "slug",
       "title",
       "priceInfo",
       "pricingType",
       "deliveryRatePerKm",
       "relatedEquipmentTypes"
     FROM "Service"
     WHERE "slug" = $1
       AND "isActive" = true
       AND "pricingType" = 'material_delivery_calculator'
     LIMIT 1`,
    [slug],
  );
  return rows[0] ?? null;
}

async function resolveDestination(input: CalculationInput) {
  const latitude = normalizeCoordinate(input.latitude);
  const longitude = normalizeCoordinate(input.longitude);
  if (latitude !== null && longitude !== null) {
    return {
      address: input.address,
      position: { lat: latitude, lon: longitude },
    };
  }

  const geocoded = await geocodeAddressForMaps(input.address);
  if (!geocoded) return null;

  return {
    address: geocoded.label,
    position: { lat: geocoded.latitude, lon: geocoded.longitude },
  };
}

async function getAvailableOffers(materialId: string) {
  const { rows } = await pool.query(
    `SELECT
       smo."id",
       smo."unitPrice",
       smo."minOrderQuantity",
       sp."id" AS "supplierPointId",
       sp."name" AS "supplierPointName",
       sp."address" AS "supplierPointAddress",
       sp."latitude",
       sp."longitude"
     FROM "SupplierMaterialOffer" smo
     INNER JOIN "SupplierPoint" sp ON sp."id" = smo."supplierPointId"
     WHERE smo."materialId" = $1
       AND smo."isAvailable" = true
       AND sp."isActive" = true
       AND sp."latitude" IS NOT NULL
       AND sp."longitude" IS NOT NULL`,
    [materialId],
  );

  return rows.map((row) => ({
    id: row.id as string,
    unitPrice: Number(row.unitPrice),
    minOrderQuantity: normalizeCoordinate(row.minOrderQuantity),
    supplierPoint: {
      id: row.supplierPointId as string,
      name: row.supplierPointName as string,
      address: row.supplierPointAddress as string,
      position: {
        lat: Number(row.latitude),
        lon: Number(row.longitude),
      },
    },
  }));
}

async function getStartCandidates(equipmentTypes: string[], requestMode: MaterialDeliveryRequestMode) {
  if (!Array.isArray(equipmentTypes) || equipmentTypes.length === 0) {
    return [];
  }

  if (requestMode === "scheduled") {
    const { rows } = await pool.query(
      `SELECT
         "id",
         "name",
         "slug",
         "baseAddress",
         "baseLatitude",
         "baseLongitude"
       FROM "Equipment"
       WHERE "type" = ANY($1)
         AND "baseLatitude" IS NOT NULL
         AND "baseLongitude" IS NOT NULL
       ORDER BY "isPopular" DESC, "createdAt" DESC`,
      [equipmentTypes],
    );

    return rows.map((row) => ({
      source: "equipment_base" as const,
      equipment: {
        id: row.id as string,
        name: row.name as string,
        slug: row.slug as string,
        baseAddress: row.baseAddress as string | null,
      },
      trackerDevice: null,
      position: {
        lat: Number(row.baseLatitude),
        lon: Number(row.baseLongitude),
      },
    }));
  }

  const { rows } = await pool.query(
    `SELECT
       e."id",
       e."name",
       e."slug",
       td."id" AS "trackerDeviceId",
       td."name" AS "trackerDeviceName",
       td."lastAddress",
       td."lastLatitude",
       td."lastLongitude",
       td."lastTrackerAt"
     FROM "Equipment" e
     INNER JOIN "TrackerDevice" td ON td."equipmentId" = e."id"
     WHERE e."type" = ANY($1)
       AND td."lastLatitude" IS NOT NULL
       AND td."lastLongitude" IS NOT NULL
     ORDER BY COALESCE(td."lastTrackerAt", td."updatedAt") DESC, e."isPopular" DESC, e."createdAt" DESC`,
    [equipmentTypes],
  );

  return rows.map((row) => ({
    source: "live_gps" as const,
    equipment: {
      id: row.id as string,
      name: row.name as string,
      slug: row.slug as string,
    },
    trackerDevice: {
      id: row.trackerDeviceId as string,
      name: row.trackerDeviceName as string,
      lastAddress: row.lastAddress as string | null,
      lastTrackerAt: row.lastTrackerAt as Date | null,
    },
    position: {
      lat: Number(row.lastLatitude),
      lon: Number(row.lastLongitude),
    },
  }));
}

async function fetchRoute(from: Coordinates, to: Coordinates): Promise<RouteResult> {
  const cacheKey = [
    from.lat.toFixed(6),
    from.lon.toFixed(6),
    to.lat.toFixed(6),
    to.lon.toFixed(6),
  ].join(":");
  const cached = routeCache.get(cacheKey);
  if (cached) return cached;

  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}`);
  url.searchParams.set("overview", "false");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "TechnoRent/1.0 (contact: admin@technorent.local)",
    },
  });

  if (!response.ok) {
    throw new Error("Route service unavailable");
  }

  const data = await response.json() as { routes?: Array<{ distance: number; duration: number }> };
  const route = data.routes?.[0];
  if (!route) {
    throw new Error("Route not found");
  }

  const value = {
    distanceMeters: route.distance,
    durationSeconds: route.duration,
  };
  routeCache.set(cacheKey, value);
  return value;
}

function unavailable(message: string) {
  return {
    available: false,
    deliveryCost: null,
    materialCost: null,
    totalCost: null,
    calculationMode: null,
    message,
    chosenSupplierPoint: null,
    chosenEquipment: null,
    chosenTrackerDevice: null,
    alternatives: [],
    truckToPointKm: null,
    pointToClientKm: null,
    pricingDetails: null,
  };
}

function roundMoney(value: number) {
  return Math.round(value);
}

function roundKm(value: number) {
  return Math.round(value * 10) / 10;
}
