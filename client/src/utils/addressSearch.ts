export interface AddressSuggestion {
  label: string;
  lat: number;
  lon: number;
}

const geocodeCache = new Map<string, { lat: number; lon: number }>();
const suggestionsCache = new Map<string, AddressSuggestion[]>();

function normalizeQuery(value: string) {
  return value.trim().replace(/\s+/g, " ");
}


export async function geocodeAddress(
  query: string,
  options?: { signal?: AbortSignal },
): Promise<{ lat: number; lon: number }> {
  const normalized = normalizeQuery(query);
  if (!normalized) {
    throw new Error("Адреса не вказана.");
  }

  const cached = geocodeCache.get(normalized.toLowerCase());
  if (cached) {
    return cached;
  }

  const params = new URLSearchParams({ q: normalized });
  const res = await fetch(`/api/address-search/geocode?${params.toString()}`, {
    signal: options?.signal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Сервіс пошуку адрес тимчасово недоступний.");
  }

  const result = await res.json() as AddressSuggestion;
  geocodeCache.set(normalized.toLowerCase(), result);
  return result;
}

export async function searchAddressSuggestions(
  query: string,
  options?: { limit?: number; signal?: AbortSignal },
): Promise<AddressSuggestion[]> {
  const normalized = normalizeQuery(query);
  if (normalized.length < 3) {
    return [];
  }

  const cacheKey = `${normalized.toLowerCase()}::${options?.limit ?? 5}`;
  const cached = suggestionsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const params = new URLSearchParams({
    q: normalized,
    limit: String(options?.limit ?? 5),
  });
  const res = await fetch(`/api/address-search/suggest?${params.toString()}`, {
    signal: options?.signal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Сервіс пошуку адрес тимчасово недоступний.");
  }

  const data = await res.json() as { suggestions: AddressSuggestion[] };
  const suggestions = data.suggestions ?? [];

  suggestionsCache.set(cacheKey, suggestions);
  return suggestions;
}
