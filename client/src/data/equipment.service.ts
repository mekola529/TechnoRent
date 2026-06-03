import type { Equipment, EquipmentType } from "./types";
import { apiFetch } from "../api/client";
import type { LeadAttributionPayload } from "../lib/attribution";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

/** Resolve image URL — prefix relative /uploads/ paths with backend origin */
function resolveImageUrl(url: string): string {
  if (url.startsWith("http")) return url;
  // strip trailing /api to get backend origin (or empty string in dev)
  const base = API_BASE.replace(/\/api$/, "");
  return `${base}${url}`;
}

/**
 * Сервіс доступу до даних техніки.
 * Тепер працює через REST API замість локального масиву.
 */

// ─── Типи відповідей від API ──────────────────────

/** Тип з API (underscore замість dash у enum) */
interface ApiEquipment {
  id: string;
  slug: string;
  name: string;
  brand: string;
  type: string;
  description: string;
  pricingType?: string;
  pricePerHour: number;
  isPopular: boolean;
  baseAddress: string | null;
  baseLatitude: number | null;
  baseLongitude: number | null;
  specs: { id: string; label: string; value: string }[];
  images: { id: string; url: string; alt: string }[];
  bookedPeriods: { id: string; from: string; to: string; note: string | null }[];
}

/** Конвертує тип з API формату (underscore) у фронтенд формат (dash) */
function mapApiType(apiType: string): EquipmentType {
  const map: Record<string, EquipmentType> = {
    dump_truck: "dump-truck",
    concrete_mixer: "concrete-mixer",
  };
  return (map[apiType] ?? apiType) as EquipmentType;
}

/** Конвертує тип з фронтенд формату (dash) назад у API формат (underscore) */
function unmapType(frontendType: string): string {
  const map: Record<string, string> = {
    "dump-truck": "dump_truck",
    "concrete-mixer": "concrete_mixer",
  };
  return map[frontendType] ?? frontendType;
}

/** Конвертує API об'єкт у фронтенд модель */
function mapEquipment(api: ApiEquipment): Equipment {
  return {
    ...api,
    type: mapApiType(api.type),
    specs: api.specs.map((s) => ({ label: s.label, value: s.value })),
    images: api.images.map((i) => ({ url: resolveImageUrl(i.url), alt: i.alt })),
    bookedPeriods: api.bookedPeriods.map((bp) => ({
      from: bp.from.split("T")[0],
      to: bp.to.split("T")[0],
      note: bp.note ?? undefined,
    })),
  };
}

// ─── Public API ───────────────────────────────────

/** Отримати всю техніку */
export async function getAllEquipment(params?: {
  type?: string;
  brand?: string;
  sort?: string;
  popular?: boolean;
}): Promise<Equipment[]> {
  const query = new URLSearchParams();
  if (params?.type) query.set("type", unmapType(params.type));
  if (params?.brand) query.set("brand", params.brand);
  if (params?.sort) query.set("sort", params.sort);
  if (params?.popular) query.set("popular", "true");

  const qs = query.toString();
  const items = await apiFetch<ApiEquipment[]>(
    `/equipment${qs ? `?${qs}` : ""}`
  );
  return items.map(mapEquipment);
}

/** Отримати товар за slug */
export async function getEquipmentBySlug(
  slug: string
): Promise<Equipment | undefined> {
  try {
    const item = await apiFetch<ApiEquipment>(`/equipment/${slug}`);
    return mapEquipment(item);
  } catch {
    return undefined;
  }
}

/** Отримати лише популярну техніку */
export async function getPopularEquipment(): Promise<Equipment[]> {
  return getAllEquipment({ popular: true });
}

/** Отримати унікальні бренди */
export async function getUniqueBrands(): Promise<string[]> {
  return apiFetch<string[]>("/equipment/meta/brands");
}

/** Отримати доступні типи техніки (повертає у фронтенд-форматі) */
export async function getAvailableTypes(): Promise<EquipmentType[]> {
  const raw = await apiFetch<string[]>("/equipment/meta/types");
  return raw.map(mapApiType);
}

// ─── Client-side helpers (не змінились) ───────────

/** Отримати техніку за кількома типами (для сторінки послуги) */
export async function getEquipmentByTypes(
  types: EquipmentType[]
): Promise<Equipment[]> {
  if (types.length === 0) return [];
  const apiTypes = types.map(unmapType).join(",");
  const items = await apiFetch<ApiEquipment[]>(
    `/equipment?type=${encodeURIComponent(apiTypes)}`
  );
  return items.map(mapEquipment);
}

/** Перевірити чи техніка доступна на дату */
export function isAvailableOnDate(equipment: Equipment, date: string): boolean {
  const check = new Date(date).getTime();
  return !equipment.bookedPeriods.some((period) => {
    const from = new Date(period.from).getTime();
    const to = new Date(period.to).getTime();
    return check >= from && check <= to;
  });
}

/** Форматувати ціну */
export function formatPrice(pricePerHour: number, pricingType?: string): string {
  return formatEquipmentPrice(pricePerHour, pricingType ?? "hourly_from");
}

export function formatEquipmentPrice(price: number, pricingType?: string): string {
  const formatted = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(price);
  switch (pricingType) {
    case "fixed_from":
      return `від ${formatted} грн`;
    case "calculator":
      return "розрахунок у калькуляторі";
    case "tow_calculator":
    case "material_delivery_calculator":
      return `${formatted} грн/км`;
    case "custom":
      return "ціна розраховується індивідуально";
    case "hourly_from":
    default:
      return `від ${formatted} грн/год`;
  }
}

// ─── Orders API ───────────────────────────────────

export async function createOrder(data: {
  customerName: string;
  phone: string;
  email?: string;
  dateFrom?: string;
  dateTo?: string;
  address?: string;
  addressTo?: string;
  comment?: string;
  equipmentId?: string;
  requestType?: "equipment_rental" | "service" | "tow" | "callback";
  serviceName?: string;
  metadata?: Record<string, unknown>;
  attribution?: LeadAttributionPayload;
}): Promise<{ id: string }> {
  return apiFetch("/orders", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
