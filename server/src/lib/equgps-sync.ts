import {
  hasTrackerMessage,
  persistTrackerDailyStat,
  persistTrackerMessage,
  replaceTrackerStopsForDay,
} from "./tracker.repository.js";
import { reverseGeocodePosition, normalizeAddress } from "./reverse-geocode.js";
import type { ParsedTrackerNotification } from "./tracker.js";
import {
  buildDerivedStopsFromMode1,
  createEquGpsPlatformSession,
  fetchPlatformDevices,
  fetchPlatformMode1Report,
  fetchPlatformPositions,
  normalizeCoordinate,
  parseEquGpsTimestamp,
} from "./equgps-platform.js";

const DEFAULT_TIME_ZONE = "Europe/Kiev";

type EquGpsSyncResult = {
  storedPositions: number;
  storedStops: number;
  storedDailyStats: number;
  syncedDates: string[];
};

let activeSyncPromise: Promise<EquGpsSyncResult> | null = null;

export async function runEquGpsSync(): Promise<EquGpsSyncResult> {
  if (activeSyncPromise) {
    return activeSyncPromise;
  }

  activeSyncPromise = syncInternal().finally(() => {
    activeSyncPromise = null;
  });

  return activeSyncPromise;
}

async function syncInternal(): Promise<EquGpsSyncResult> {
  const session = await createEquGpsPlatformSession();
  const [devices, positions] = await Promise.all([
    fetchPlatformDevices(session),
    fetchPlatformPositions(session),
  ]);

  const positionsById = new Map(positions.map((position) => [position.id, position]));
  let storedPositions = 0;
  let storedStops = 0;
  let storedDailyStats = 0;

  for (const device of devices) {
    if (!device.positionId) {
      continue;
    }

    const position = positionsById.get(device.positionId);
    if (!position) {
      continue;
    }

    const parsed = buildParsedNotification(device.name, device.status ?? null, position);
    if (!parsed) {
      continue;
    }

    const sourceChatId = `equgps:${device.id}`;
    const sourceMessageId = parsed.trackerTimestamp.toISOString();
    const alreadyProcessed = await hasTrackerMessage(sourceChatId, sourceMessageId);
    if (alreadyProcessed) {
      continue;
    }

    const latitude = normalizeCoordinate(position.latitudeGps ?? position.latitude);
    const longitude = normalizeCoordinate(position.longitudeGps ?? position.longitude);
    const resolvedAddress =
      normalizeAddress(position.address)
      ?? (await reverseGeocodePosition(latitude, longitude));

    await persistTrackerMessage({
      telegramChatId: sourceChatId,
      telegramMessageId: sourceMessageId,
      parsed,
      resolvedAddress,
      latitude,
      longitude,
    });

    storedPositions += 1;
  }

  const dates = getTodayAndPreviousIsoDates(DEFAULT_TIME_ZONE);

  for (const device of devices) {
    for (const date of dates) {
      const report = await fetchPlatformMode1Report(session, device.id, date);
      const trips = Array.isArray(report?.dataGo) ? report.dataGo : [];
      const totals = report?.dataPositions ?? null;

      const persistableStops = await Promise.all(
        buildDerivedStopsFromMode1(report ?? {}).map(async (stop) => ({
          source: "equgps",
          sourceDeviceId: String(device.id),
          deviceName: device.name.trim(),
          stopStart: stop.stopStart,
          stopEnd: stop.stopEnd,
          durationMs: stop.durationMs,
          latitude: stop.latitude,
          longitude: stop.longitude,
          address: stop.address ?? await reverseGeocodePosition(stop.latitude, stop.longitude),
          rawPayload: stop.rawPayload,
        })),
      );

      const stopsResult = await replaceTrackerStopsForDay({
        source: "equgps",
        sourceDeviceId: String(device.id),
        deviceName: device.name.trim(),
        statDate: date,
        timeZone: DEFAULT_TIME_ZONE,
        stops: persistableStops,
      });
      storedStops += stopsResult.storedCount;

      await persistTrackerDailyStat({
        source: "equgps",
        sourceDeviceId: String(device.id),
        deviceName: device.name.trim(),
        statDate: date,
        distanceKm: Number(((Number(totals?.distance ?? 0) || 0) / 1000).toFixed(3)),
        drivingDurationMs: Math.max(0, Math.round((Number(totals?.goTime ?? 0) || 0) * 1000)),
        engineHoursMs:
          typeof totals?.motoHours === "number" && Number.isFinite(totals.motoHours)
            ? Math.max(0, Math.round(totals.motoHours * 1000))
            : null,
        rawPayload: {
          source: "gps.equgps.com",
          period: {
            date,
            timeZone: DEFAULT_TIME_ZONE,
          },
          totals,
          dataGo: trips,
        },
      });
      storedDailyStats += 1;
    }
  }

  return { storedPositions, storedStops, storedDailyStats, syncedDates: dates };
}

function buildParsedNotification(
  deviceName: string,
  status: string | null,
  position: Awaited<ReturnType<typeof fetchPlatformPositions>>[number],
): ParsedTrackerNotification | null {
  const trackerTimestamp = parseEquGpsTimestamp(position.fixTime ?? position.serverTime ?? null);
  const latitude = normalizeCoordinate(position.latitudeGps ?? position.latitude);
  const longitude = normalizeCoordinate(position.longitudeGps ?? position.longitude);

  if (!trackerTimestamp || latitude === null || longitude === null) {
    return null;
  }

  return {
    eventText: status?.trim() ? `EquGPS: ${status.trim()}` : "EquGPS: position sync",
    trackerTimestamp,
    deviceName: deviceName.trim(),
    parsedAddress: normalizeAddress(position.address),
    rawText: JSON.stringify(
      {
        source: "equgps",
        device: {
          name: deviceName,
          status: status ?? null,
          positionId: position.id,
        },
        position: {
          id: position.id,
          deviceId: position.deviceId,
          fixTime: position.fixTime ?? null,
          serverTime: position.serverTime ?? null,
          latitude,
          longitude,
          address: normalizeAddress(position.address),
        },
      },
      null,
      0,
    ),
  };
}

function getTodayAndPreviousIsoDates(timeZone: string): string[] {
  const today = new Date(getIsoDate(new Date(), timeZone));
  const previous = new Date(today);
  previous.setUTCDate(previous.getUTCDate() - 1);

  return [
    today.toISOString().slice(0, 10),
    previous.toISOString().slice(0, 10),
  ];
}

function getIsoDate(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}
