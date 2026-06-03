import { Router } from "express";
import { z } from "zod";
import { logError } from "../lib/logger.js";

export const addressSearchRouter = Router();

interface AddressSuggestion {
  label: string;
  lat: number;
  lon: number;
}

interface NominatimSearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

interface PhotonFeature {
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    district?: string;
    county?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    postcode?: string;
  };
  geometry?: {
    coordinates?: [number, number];
  };
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const geocodeCache = new Map<string, { expiresAt: number; value: AddressSuggestion }>();
const suggestionsCache = new Map<string, { expiresAt: number; value: AddressSuggestion[] }>();
const routeCache = new Map<string, { expiresAt: number; value: { distanceMeters: number; durationSeconds: number } }>();

const suggestSchema = z.object({
  q: z.string().trim().min(3).max(200),
  limit: z.coerce.number().int().min(1).max(10).optional(),
});

const geocodeSchema = z.object({
  q: z.string().trim().min(1).max(200),
});

const routeSchema = z.object({
  fromLat: z.coerce.number().min(-90).max(90),
  fromLon: z.coerce.number().min(-180).max(180),
  toLat: z.coerce.number().min(-90).max(90),
  toLon: z.coerce.number().min(-180).max(180),
});

function normalizeQuery(value: string) {
  return value.trim().replace(/\s+/g, " ");
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

function toSuggestion(item: NominatimSearchResult): AddressSuggestion {
  return {
    label: item.display_name,
    lat: Number(item.lat),
    lon: Number(item.lon),
  };
}

function getCachedValue<T>(cache: Map<string, { expiresAt: number; value: T }>, key: string): T | null {
  const cached = cache.get(key);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return cached.value;
}

function setCachedValue<T>(cache: Map<string, { expiresAt: number; value: T }>, key: string, value: T) {
  cache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value,
  });
}

async function fetchNominatim(query: string, limit: number) {
  const params = new URLSearchParams({
    format: "jsonv2",
    limit: String(limit),
    countrycodes: "ua",
    "accept-language": "uk",
    addressdetails: "1",
    q: query,
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "TechnoRent/1.0 (contact: admin@technorent.local)",
    },
  });

  if (!response.ok) {
    throw new Error(response.status === 429
      ? "Сервіс пошуку адрес перевантажений. Спробуйте ще раз за кілька секунд."
      : "Сервіс пошуку адрес тимчасово недоступний.");
  }

  return response.json() as Promise<NominatimSearchResult[]>;
}

function formatPhotonLabel(feature: PhotonFeature) {
  const props = feature.properties ?? {};
  const mainStreet = [props.street, props.housenumber].filter(Boolean).join(" ").trim();
  const locality = [
    props.name,
    props.city,
    props.district,
    props.county,
    props.state,
    props.postcode,
    props.country,
  ]
    .filter(Boolean)
    .join(", ");

  return [mainStreet, locality].filter(Boolean).join(", ");
}

async function fetchPhoton(query: string, limit: number): Promise<AddressSuggestion[]> {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
  });

  const response = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "TechnoRent/1.0 (contact: admin@technorent.local)",
    },
  });

  if (!response.ok) {
    throw new Error("Сервіс пошуку адрес тимчасово недоступний.");
  }

  const data = await response.json() as { features?: PhotonFeature[] };
  const features = data.features ?? [];

  return features
    .map((feature) => {
      const coordinates = feature.geometry?.coordinates;
      const label = formatPhotonLabel(feature);
      if (!coordinates || coordinates.length < 2 || !label) {
        return null;
      }

      return {
        label,
        lat: Number(coordinates[1]),
        lon: Number(coordinates[0]),
      } satisfies AddressSuggestion;
    })
    .filter((item): item is AddressSuggestion => Boolean(item));
}

addressSearchRouter.get("/suggest", async (req, res) => {
  try {
    const parsed = suggestSchema.parse(req.query);
    const normalized = normalizeQuery(parsed.q);
    const limit = parsed.limit ?? 5;
    const cacheKey = `${normalized.toLowerCase()}::${limit}`;
    const cached = getCachedValue(suggestionsCache, cacheKey);

    if (cached) {
      res.json({ suggestions: cached });
      return;
    }

    let suggestions: AddressSuggestion[];
    try {
      const results = await fetchNominatim(normalized, Math.max(limit * 3, 10));
      suggestions = sortByRegionalPriority(results).slice(0, limit).map(toSuggestion);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("перевантажений")) {
        throw error;
      }
      suggestions = await fetchPhoton(normalized, limit);
    }
    setCachedValue(suggestionsCache, cacheKey, suggestions);

    res.json({ suggestions });
  } catch (error) {
    logError("GET /api/address-search/suggest error:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Некоректний пошуковий запит адреси" });
      return;
    }
    res.status(503).json({ error: error instanceof Error ? error.message : "Помилка сервера" });
  }
});

addressSearchRouter.get("/geocode", async (req, res) => {
  try {
    const parsed = geocodeSchema.parse(req.query);
    const normalized = normalizeQuery(parsed.q);
    const cacheKey = normalized.toLowerCase();
    const cached = getCachedValue(geocodeCache, cacheKey);

    if (cached) {
      res.json(cached);
      return;
    }

    let suggestion: AddressSuggestion | undefined;
    try {
      const results = await fetchNominatim(normalized, 5);
      const prioritized = sortByRegionalPriority(results);
      if (prioritized[0]) {
        suggestion = toSuggestion(prioritized[0]);
      }
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("перевантажений")) {
        throw error;
      }
      suggestion = (await fetchPhoton(normalized, 1))[0];
    }

    if (!suggestion) {
      res.status(404).json({ error: "Не вдалося знайти одну з адрес. Уточніть формулювання." });
      return;
    }

    setCachedValue(geocodeCache, cacheKey, suggestion);
    res.json(suggestion);
  } catch (error) {
    logError("GET /api/address-search/geocode error:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Некоректна адреса" });
      return;
    }
    res.status(503).json({ error: error instanceof Error ? error.message : "Помилка сервера" });
  }
});

addressSearchRouter.get("/route", async (req, res) => {
  try {
    const parsed = routeSchema.parse(req.query);
    const cacheKey = [
      parsed.fromLat.toFixed(6),
      parsed.fromLon.toFixed(6),
      parsed.toLat.toFixed(6),
      parsed.toLon.toFixed(6),
    ].join(":");
    const cached = getCachedValue(routeCache, cacheKey);

    if (cached) {
      res.json(cached);
      return;
    }

    const url = new URL(
      `https://router.project-osrm.org/route/v1/driving/${parsed.fromLon},${parsed.fromLat};${parsed.toLon},${parsed.toLat}`,
    );
    url.searchParams.set("overview", "false");

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "TechnoRent/1.0 (contact: admin@technorent.local)",
      },
    });

    if (!response.ok) {
      throw new Error("Сервіс розрахунку маршруту тимчасово недоступний.");
    }

    const data = await response.json() as {
      routes?: Array<{ distance: number; duration: number }>;
    };
    const route = data.routes?.[0];

    if (!route) {
      res.status(404).json({ error: "Не вдалося побудувати маршрут між вказаними адресами." });
      return;
    }

    const value = {
      distanceMeters: route.distance,
      durationSeconds: route.duration,
    };
    setCachedValue(routeCache, cacheKey, value);

    res.json(value);
  } catch (error) {
    logError("GET /api/address-search/route error:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Некоректні координати маршруту" });
      return;
    }
    res.status(503).json({ error: error instanceof Error ? error.message : "Помилка сервера" });
  }
});
