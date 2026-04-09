import type { EquipmentType } from "./types";
import { apiFetch } from "../api/client";

// ─── Типи ─────────────────────────────────────────

export type PricingType = "fixed_from" | "hourly_from" | "calculator" | "custom";

export interface Service {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  fullDescription: string;
  image: string;
  priceInfo: string;
  pricingType: PricingType;
  relatedEquipmentTypes: EquipmentType[];
  features: string[];
  seoTitle: string;
  seoDescription: string;
  isActive: boolean;
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
  relatedEquipmentTypes: string[];
  features: string[];
  seoTitle: string;
  seoDescription: string;
  isActive: boolean;
  sortOrder: number;
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

function mapService(api: ApiService): Service {
  return {
    ...api,
    relatedEquipmentTypes: api.relatedEquipmentTypes.map(mapApiType),
  };
}

// ─── Public API helpers ───────────────────────────

/** Отримати всі активні послуги */
export async function getActiveServices(): Promise<Service[]> {
  const items = await apiFetch<ApiService[]>("/services");
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
