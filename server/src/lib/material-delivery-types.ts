export type MaterialDeliveryRequestMode = "urgent" | "scheduled";
export type MaterialDeliveryCalculationMode = "urgent_live" | "scheduled_base";

export interface MaterialRecord {
  id: string;
  name: string;
  slug: string;
  unit: string;
  isActive: boolean;
  minOrderQuantity: number | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SupplierPointRecord {
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
  createdAt: Date;
  updatedAt: Date;
}

export interface SupplierMaterialOfferRecord {
  id: string;
  supplierPointId: string;
  materialId: string;
  unitPrice: number;
  isAvailable: boolean;
  minOrderQuantity: number | null;
  lastPriceUpdatedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
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
  chosenOfferUnitPrice: number;
  alternativesSnapshot: Array<Record<string, unknown>>;
  calculatedAt: string;
}
