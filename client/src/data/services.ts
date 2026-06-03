import type { EquipmentType } from "./types";
import { apiFetch } from "../api/client";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

// ─── Типи ─────────────────────────────────────────

export type PricingType =
  | "fixed_from"
  | "hourly_from"
  | "calculator"
  | "tow_calculator"
  | "material_delivery_calculator"
  | "custom";

export interface TowCalculatorState {
  available: boolean;
  priceInfo: string;
  deliveryRatePerKm: number | null;
  trackers?: Array<{
    trackerDevice: {
      id: string;
      name: string;
      lastAddress: string | null;
      lastLatitude: number | null;
      lastLongitude: number | null;
      lastTrackerAt: string | null;
    };
    equipment: {
      id: string;
      name: string;
      slug: string;
      baseAddress: string | null;
      baseLatitude: number | null;
      baseLongitude: number | null;
    };
  }>;
  message?: string | null;
}

export interface Service {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  fullDescription: string;
  image: string;
  priceInfo: string;
  pricingType: PricingType;
  deliveryRatePerKm: number | null;
  relatedEquipmentTypes: EquipmentType[];
  features: string[];
  seoTitle: string;
  seoDescription: string;
  isActive: boolean;
  isPopular: boolean;
  sortOrder: number;
}

// ─── Маппінг типів (DB underscore → frontend dash) ─

interface ApiService {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  fullDescription: string;
  image: string;
  priceInfo: string;
  pricingType: PricingType;
  deliveryRatePerKm: number | null;
  relatedEquipmentTypes: string[];
  features: string[];
  seoTitle: string;
  seoDescription: string;
  isActive: boolean;
  isPopular: boolean;
  sortOrder: number;
}

interface ApiTowCalculatorState {
  available: boolean;
  priceInfo: string;
  deliveryRatePerKm: number | null;
  trackers?: Array<{
    trackerDevice: {
      id: string;
      name: string;
      lastAddress: string | null;
      lastLatitude: number | null;
      lastLongitude: number | null;
      lastTrackerAt: string | null;
    };
    equipment: {
      id: string;
      name: string;
      slug: string;
      baseAddress: string | null;
      baseLatitude: number | null;
      baseLongitude: number | null;
    };
  }>;
  message?: string | null;
}

function mapApiType(apiType: string): EquipmentType {
  const map: Record<string, EquipmentType> = {
    dump_truck: "dump-truck",
    concrete_mixer: "concrete-mixer",
  };
  return (map[apiType] ?? apiType) as EquipmentType;
}

export function unmapType(frontendType: string): string {
  const map: Record<string, string> = {
    "dump-truck": "dump_truck",
    "concrete-mixer": "concrete_mixer",
  };
  return map[frontendType] ?? frontendType;
}

function resolveImageUrl(url: string): string {
  if (url.startsWith("http")) return url;
  const base = API_BASE.replace(/\/api$/, "");
  return `${base}${url}`;
}

function mapService(api: ApiService): Service {
  return {
    ...api,
    image: resolveImageUrl(api.image),
    relatedEquipmentTypes: api.relatedEquipmentTypes.map(mapApiType),
  };
}

// ─── Public API helpers ───────────────────────────

/** Отримати всі активні послуги */
export async function getActiveServices(): Promise<Service[]> {
  const items = await apiFetch<ApiService[]>("/services");
  return items.map(mapService);
}

/** Отримати лише популярні активні послуги */
export async function getPopularServices(): Promise<Service[]> {
  const items = await apiFetch<ApiService[]>("/services?popular=true");
  return items.map(mapService);
}

/** Отримати послугу за slug */
export async function getServiceBySlug(slug: string): Promise<Service | undefined> {
  try {
    const item = await apiFetch<ApiService>(`/services/${encodeURIComponent(slug)}`);
    return mapService(item);
  } catch {
    return undefined;
  }
}

export async function getTowCalculatorState(slug: string): Promise<TowCalculatorState | undefined> {
  try {
    const item = await apiFetch<ApiTowCalculatorState>(`/services/${encodeURIComponent(slug)}/tow-calculator`);
    return item;
  } catch {
    return undefined;
  }
}

/** Отримати послуги, пов'язані з типом техніки */
export async function getServicesByEquipmentType(type: EquipmentType): Promise<Service[]> {
  try {
    const dbType = unmapType(type);
    const items = await apiFetch<ApiService[]>(`/services/by-equipment-type/${encodeURIComponent(dbType)}`);
    return items.map(mapService);
  } catch {
    return [];
  }
}
