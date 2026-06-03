import { apiFetch } from "../api/client";

export type MaterialDeliveryRequestMode = "urgent" | "scheduled";
export type MaterialDeliveryCalculationMode = "urgent_live" | "scheduled_base";

export interface Material {
  id: string;
  name: string;
  slug: string;
  unit: string;
  isActive: boolean;
  minOrderQuantity: number | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierPoint {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  isActive: boolean;
  contactName: string | null;
  contactPhone: string | null;
  workHours: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierMaterialOffer {
  id: string;
  supplierPointId: string;
  materialId: string;
  unitPrice: number;
  isAvailable: boolean;
  minOrderQuantity: number | null;
  lastPriceUpdatedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  supplierPoint?: SupplierPoint;
  material?: Material;
}

export interface MaterialDeliveryCalculationSnapshot {
  calculationMode: MaterialDeliveryCalculationMode;
  servicePricingType: "material_delivery_calculator";
  selectedMaterialId: string;
  selectedMaterialName: string;
  quantity: number;
  unit: string;
  deliveryRatePerKm: number;
  materialCost: number;
  deliveryCost: number;
  totalEstimatedCost: number;
  truckToPointKm: number;
  pointToClientKm: number;
  chosenSupplierPointId: string;
  chosenSupplierPointName: string;
  chosenSupplierPointCoordinates?: { lat: number | null; lon: number | null } | null;
  chosenOfferUnitPrice: number;
  alternativesSnapshot: Array<Record<string, unknown>>;
  calculatedAt: string;
}

export interface MaterialDeliveryOptions {
  available: boolean;
  service: {
    slug: string;
    title: string;
    priceInfo: string;
    deliveryRatePerKm: number | null;
  };
  materials: Material[];
  message: string | null;
}

export interface MaterialDeliveryCalculationInput {
  materialId: string;
  quantity: number;
  unit?: string;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  requestMode: MaterialDeliveryRequestMode;
  scheduledDate?: string;
  scheduledTime?: string;
}

export interface MaterialDeliveryCalculationResult {
  available: boolean;
  deliveryCost: number | null;
  materialCost: number | null;
  totalCost: number | null;
  calculationMode: MaterialDeliveryCalculationMode | null;
  message: string | null;
  chosenSupplierPoint: {
    id: string;
    name: string;
    address: string;
    position: { lat: number; lon: number };
  } | null;
  chosenEquipment: {
    id: string;
    name: string;
    slug: string;
  } | null;
  chosenTrackerDevice: {
    id: string;
    name: string;
    lastAddress: string | null;
    lastTrackerAt: string | null;
  } | null;
  alternatives: Array<Record<string, unknown>>;
  truckToPointKm: number | null;
  pointToClientKm: number | null;
  pricingDetails: Record<string, unknown> | null;
}

export async function getMaterialDeliveryOptions(slug: string) {
  return apiFetch<MaterialDeliveryOptions>(
    `/services/${encodeURIComponent(slug)}/material-delivery-options`,
    { redirectOnUnauthorized: false },
  );
}

export async function calculateMaterialDelivery(slug: string, input: MaterialDeliveryCalculationInput) {
  return apiFetch<MaterialDeliveryCalculationResult>(
    `/services/${encodeURIComponent(slug)}/material-delivery-calculate`,
    {
      method: "POST",
      body: JSON.stringify(input),
      redirectOnUnauthorized: false,
    },
  );
}
