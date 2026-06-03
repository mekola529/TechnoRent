interface GeocodeResult {
  label: string;
  latitude: number;
  longitude: number;
}

interface NominatimSearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

const geocodeCache = new Map<string, GeocodeResult | null>();

function normalizeAddress(value: string) {
  const normalized = value
    .trim()
    .replace(/\bвул\.?\b/giu, "вулиця")
    .replace(/\bпросп\.?\b/giu, "проспект")
    .replace(/\bпл\.?\b/giu, "площа")
    .replace(/\s+/g, " ");

  const lower = normalized.toLowerCase();
  if (
    (lower.includes("львів") || lower.includes("львов")) &&
    !lower.includes("львівська область")
  ) {
    return `${normalized}, Львівська область, Україна`;
  }

  return normalized;
}

function getLvivPriorityScore(label: string) {
  const normalized = label.toLowerCase();
  let score = 0;

  if (normalized.includes("львівська область")) score += 40;
  if (normalized.includes("львівський район")) score += 20;
  if (normalized.includes("львів")) score += 15;
  if (normalized.includes("львівська міська громада")) score += 10;
  if (normalized.includes("яворівський район")) score += 6;

  return score;
}

function sortByRegionalPriority<T extends NominatimSearchResult>(items: T[]) {
  return [...items].sort((a, b) => {
    const scoreDiff = getLvivPriorityScore(b.display_name) - getLvivPriorityScore(a.display_name);
    if (scoreDiff !== 0) return scoreDiff;
    return a.display_name.localeCompare(b.display_name, "uk");
  });
}

export function normalizeCoordinate(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export async function geocodeAddressForMaps(address: string | null | undefined): Promise<GeocodeResult | null> {
  if (!address) return null;

  const normalized = normalizeAddress(address);
  if (!normalized) return null;

  const cacheKey = normalized.toLowerCase();
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey) ?? null;
  }

  try {
    const params = new URLSearchParams({
      format: "jsonv2",
      limit: "5",
      countrycodes: "ua",
      "accept-language": "uk",
      q: normalized,
    });

    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      signal: AbortSignal.timeout(3500),
      headers: {
        Accept: "application/json",
        "User-Agent": "TechnoRent/1.0 (contact: admin@technorent.local)",
      },
    });

    if (!response.ok) {
      geocodeCache.set(cacheKey, null);
      return null;
    }

    const results = await response.json() as NominatimSearchResult[];
    const first = sortByRegionalPriority(results)[0];
    const latitude = normalizeCoordinate(first?.lat);
    const longitude = normalizeCoordinate(first?.lon);

    if (!first || latitude === null || longitude === null) {
      geocodeCache.set(cacheKey, null);
      return null;
    }

    const value = {
      label: first.display_name,
      latitude,
      longitude,
    };
    geocodeCache.set(cacheKey, value);
    return value;
  } catch {
    geocodeCache.set(cacheKey, null);
    return null;
  }
}
