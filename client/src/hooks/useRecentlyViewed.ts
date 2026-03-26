import { useState, useEffect } from "react";
import type { Equipment } from "../data/types";

const STORAGE_KEY = "recently_viewed";
const MAX_ITEMS = 6;

interface StoredItem {
  id: string;
  slug: string;
  name: string;
  brand: string;
  type: string;
  pricePerHour: number;
  imageUrl: string;
  imageAlt: string;
}

function readStorage(): StoredItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStorage(items: StoredItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // quota exceeded — silent fail
  }
}

function toStoredItem(eq: Equipment): StoredItem {
  return {
    id: eq.id,
    slug: eq.slug,
    name: eq.name,
    brand: eq.brand,
    type: eq.type,
    pricePerHour: eq.pricePerHour,
    imageUrl: eq.images[0]?.url ?? "",
    imageAlt: eq.images[0]?.alt ?? eq.name,
  };
}

/** Stored item → Equipment-like shape for EquipmentCard */
export function toEquipmentCard(s: StoredItem): Equipment {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    brand: s.brand,
    type: s.type as Equipment["type"],
    description: "",
    pricePerHour: s.pricePerHour,
    isPopular: false,
    specs: [],
    images: s.imageUrl ? [{ url: s.imageUrl, alt: s.imageAlt }] : [],
    bookedPeriods: [],
  };
}

/**
 * Hook for tracking recently viewed equipment.
 * Saves minimal data to localStorage, returns items excluding current.
 */
export function useRecentlyViewed(current: Equipment | undefined) {
  const [others, setOthers] = useState<Equipment[]>([]);

  useEffect(() => {
    if (!current) return;

    const stored = readStorage();

    // Remove current from list if exists, then prepend
    const filtered = stored.filter((s) => s.id !== current.id);
    const updated = [toStoredItem(current), ...filtered].slice(0, MAX_ITEMS);
    writeStorage(updated);

    // Return others (excluding current) as Equipment-like objects
    setOthers(filtered.slice(0, MAX_ITEMS).map(toEquipmentCard));
  }, [current]);

  return others;
}
