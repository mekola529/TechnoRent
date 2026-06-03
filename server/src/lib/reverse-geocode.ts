import { logError } from "./logger.js";

const reverseGeocodeCache = new Map<string, string | null>();

export async function reverseGeocodePosition(
  latitude: number | null,
  longitude: number | null,
): Promise<string | null> {
  if (latitude === null || longitude === null) {
    return null;
  }

  const cacheKey = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
  if (reverseGeocodeCache.has(cacheKey)) {
    return reverseGeocodeCache.get(cacheKey) ?? null;
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", "uk");

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": buildReverseGeocodeUserAgent(),
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`Reverse geocoding failed with status ${response.status}.`);
    }

    const data = (await response.json()) as { display_name?: unknown };
    const resolvedAddress = normalizeAddress(
      typeof data.display_name === "string" ? data.display_name : null,
    );
    reverseGeocodeCache.set(cacheKey, resolvedAddress);
    return resolvedAddress;
  } catch (error) {
    logError("Reverse geocoding error:", error);
    reverseGeocodeCache.set(cacheKey, null);
    return null;
  }
}

export function normalizeAddress(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildReverseGeocodeUserAgent(): string {
  const siteUrl = process.env.SITE_URL?.trim();
  if (siteUrl) {
    return `TechnoRent/1.0 (${siteUrl})`;
  }

  return "TechnoRent/1.0";
}
