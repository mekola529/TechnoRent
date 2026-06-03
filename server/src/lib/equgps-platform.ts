const DEFAULT_PLATFORM_BASE_URL = "https://gps.equgps.com";

export interface EquGpsPlatformSession {
  token: string;
  cookie: string;
  baseUrl: string;
}

export interface EquGpsPlatformDevice {
  id: number;
  name: string;
  status?: string | null;
  lastUpdate?: string | null;
  positionId?: number | null;
  phone?: string | null;
  model?: string | null;
  disabled?: boolean;
}

export interface EquGpsPlatformPosition {
  id: number;
  deviceId: number;
  serverTime?: string | null;
  deviceTime?: string | null;
  fixTime?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  latitudeGps?: number | null;
  longitudeGps?: number | null;
  address?: string | null;
  speed?: number | null;
  outdated?: boolean;
  valid?: boolean;
  attributes?: {
    battery?: number | null;
    batteryLevel?: number | null;
    distance?: number | null;
    totalDistance?: number | null;
    motion?: boolean | null;
    hours?: number | null;
  } | null;
}

export interface EquGpsPlatformTrip {
  startTime?: number | null;
  endTime?: number | null;
  startC?: [string, string] | string[] | null;
  endC?: [string, string] | string[] | null;
  distance?: number | null;
  maxSpeed?: string | number | null;
  firstId?: number | null;
  lastId?: number | null;
  startTimeString?: string | null;
  endTimeString?: string | null;
  runTime?: string | null;
  stopTime?: string | null;
  stopLong?: string | null;
  stopLongSeconds?: number | null;
  startA?: string | null;
  endA?: string | null;
}

export interface EquGpsPlatformMode1Report {
  dataPositions?: {
    startC?: [string, string] | string[] | null;
    endC?: [string, string] | string[] | null;
    maxSpeed?: string | number | null;
    motoHours?: number | null;
    lastTime?: number | null;
    distance?: number | null;
    goTime?: number | null;
  } | null;
  dataGo?: EquGpsPlatformTrip[] | null;
  allPositions?: unknown[];
  tm_points?: unknown[];
  stateReportDate?: string | null;
}

export interface EquGpsDerivedStop {
  stopStart: Date;
  stopEnd: Date | null;
  durationMs: number;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  rawPayload: EquGpsPlatformTrip;
}

export async function createEquGpsPlatformSession(): Promise<EquGpsPlatformSession> {
  const baseUrl = (
    process.env.EQUGPS_PLATFORM_URL?.trim().replace(/^['"]|['"]$/g, "")
    || DEFAULT_PLATFORM_BASE_URL
  ).replace(/\/+$/g, "");
  const email = process.env.EQUGPS_EMAIL?.trim();
  const password = process.env.EQUGPS_PASSWORD?.trim();

  if (!email || !password) {
    throw new Error("EQUGPS_EMAIL and EQUGPS_PASSWORD are required.");
  }

  const body = new URLSearchParams({
    language: "Українська",
    email,
    password,
    undefined: "true",
  });

  const response = await fetch(`${baseUrl}/api-platform/session/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`EquGPS platform login failed with status ${response.status}.`);
  }

  const payload = await response.json() as { token?: string | null };
  if (!payload.token) {
    throw new Error("EquGPS platform login succeeded, but token was not returned.");
  }

  const cookieHeader = response.headers.get("set-cookie");
  const sessionCookie = cookieHeader
    ?.split(",")
    .map((part) => part.trim())
    .find((part) => part.startsWith("JSESSIONID="));

  if (!sessionCookie) {
    throw new Error("EquGPS platform login succeeded, but JSESSIONID cookie was not returned.");
  }

  return {
    token: payload.token,
    cookie: sessionCookie.split(";")[0],
    baseUrl,
  };
}

export async function fetchPlatformDevices(
  session: EquGpsPlatformSession,
): Promise<EquGpsPlatformDevice[]> {
  return fetchPlatformJson<EquGpsPlatformDevice[]>(session, "/api-platform/devices");
}

export async function fetchPlatformPositions(
  session: EquGpsPlatformSession,
): Promise<EquGpsPlatformPosition[]> {
  return fetchPlatformJson<EquGpsPlatformPosition[]>(session, "/api-platform/positions");
}

export async function fetchPlatformMode1Report(
  session: EquGpsPlatformSession,
  deviceId: number | string,
  date: string,
): Promise<EquGpsPlatformMode1Report | null> {
  const payload = await fetchApiJson<Array<{
    id?: number | null;
    infoReport?: {
      mode1?: EquGpsPlatformMode1Report | null;
    } | null;
  }>>(
    session,
    `/api/devices/info?token=${encodeURIComponent(session.token)}`,
    {
      method: "POST",
      body: new URLSearchParams({
        mode: "mode1",
        id: String(deviceId),
        date,
        correction: "false",
      }).toString(),
    },
  );

  const match = payload.find((item) => String(item?.id ?? "") === String(deviceId));
  return match?.infoReport?.mode1 ?? null;
}

export function parseEquGpsTimestamp(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2").replace(" ", "T");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function normalizeCoordinate(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function buildDerivedStopsFromMode1(report: EquGpsPlatformMode1Report): EquGpsDerivedStop[] {
  const trips = Array.isArray(report.dataGo) ? report.dataGo : [];

  return trips
    .map((trip) => {
      const stopStart = normalizeEpochSeconds(trip.endTime);
      if (!stopStart) {
        return null;
      }

      const stopDurationMs = Math.max(0, Math.round((Number(trip.stopLongSeconds ?? 0) || 0) * 1000));
      const stopEnd = stopDurationMs > 0 ? new Date(stopStart.getTime() + stopDurationMs) : null;
      const coordinates = Array.isArray(trip.endC) ? trip.endC : [];

      return {
        stopStart,
        stopEnd,
        durationMs: stopDurationMs,
        latitude: normalizeCoordinate(coordinates[0]),
        longitude: normalizeCoordinate(coordinates[1]),
        address: normalizeText(trip.endA),
        rawPayload: trip,
      };
    })
    .filter((stop): stop is EquGpsDerivedStop => Boolean(stop));
}

export function normalizeEpochSeconds(value: number | null | undefined): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return new Date(Math.round(value * 1000));
}

export function normalizeText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function fetchPlatformJson<T>(
  session: EquGpsPlatformSession,
  pathname: string,
): Promise<T> {
  const response = await fetch(`${session.baseUrl}${pathname}`, {
    headers: {
      Accept: "application/json",
      Cookie: session.cookie,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `EquGPS platform request failed (${response.status}) for ${pathname}: ${body.slice(0, 400)}`,
    );
  }

  return response.json() as Promise<T>;
}

async function fetchApiJson<T>(
  session: EquGpsPlatformSession,
  pathname: string,
  options: {
    method?: string;
    body?: string;
  } = {},
): Promise<T> {
  const response = await fetch(`${session.baseUrl}${pathname}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      Cookie: session.cookie,
      ...(options.body
        ? { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" }
        : {}),
    },
    body: options.body,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `EquGPS API request failed (${response.status}) for ${pathname}: ${body.slice(0, 400)}`,
    );
  }

  return response.json() as Promise<T>;
}
