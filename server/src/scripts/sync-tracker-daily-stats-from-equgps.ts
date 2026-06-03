import "../env.js";

import { initSchema } from "../lib/schema.js";
import { logError } from "../lib/logger.js";
import { persistTrackerDailyStat, replaceTrackerStopsForDay } from "../lib/tracker.repository.js";
import {
  buildDerivedStopsFromMode1,
  createEquGpsPlatformSession,
  fetchPlatformDevices,
  fetchPlatformMode1Report,
} from "../lib/equgps-platform.js";
import { reverseGeocodePosition, normalizeAddress } from "../lib/reverse-geocode.js";

const DEFAULT_TIME_ZONE = "Europe/Kiev";

async function main() {
  await initSchema();

  const statDate = resolveTargetStatDate();
  const session = await createEquGpsPlatformSession();
  const devices = await fetchPlatformDevices(session);

  if (devices.length === 0) {
    console.log("No EquGPS devices found.");
    return;
  }

  for (const device of devices) {
    const report = await fetchPlatformMode1Report(session, device.id, statDate);
    const trips = Array.isArray(report?.dataGo) ? report.dataGo : [];
    const totals = report?.dataPositions ?? null;

    const persistableStops = await Promise.all(
      buildDerivedStopsFromMode1(report ?? {}).map(async (stop) => ({
        source: "equgps",
        sourceDeviceId: String(device.id),
        deviceName: device.name,
        stopStart: stop.stopStart,
        stopEnd: stop.stopEnd,
        durationMs: stop.durationMs,
        latitude: stop.latitude,
        longitude: stop.longitude,
        address: normalizeAddress(stop.address)
          ?? await reverseGeocodePosition(stop.latitude, stop.longitude),
        rawPayload: stop.rawPayload,
      })),
    );

    await replaceTrackerStopsForDay({
      source: "equgps",
      sourceDeviceId: String(device.id),
      deviceName: device.name,
      statDate,
      timeZone: DEFAULT_TIME_ZONE,
      stops: persistableStops,
    });

    const dailyStat = {
      source: "equgps",
      sourceDeviceId: String(device.id),
      deviceName: device.name,
      statDate,
      distanceKm: Number(((Number(totals?.distance ?? 0) || 0) / 1000).toFixed(3)),
      drivingDurationMs: Math.max(0, Math.round((Number(totals?.goTime ?? 0) || 0) * 1000)),
      engineHoursMs:
        typeof totals?.motoHours === "number" && Number.isFinite(totals.motoHours)
          ? Math.max(0, Math.round(totals.motoHours * 1000))
          : null,
      rawPayload: {
        source: "gps.equgps.com",
        period: {
          date: statDate,
          timeZone: DEFAULT_TIME_ZONE,
        },
        totals,
        dataGo: trips,
      },
    };

    const stored = await persistTrackerDailyStat(dailyStat);

    console.log(
      JSON.stringify(
        {
          status: "stored",
          source: dailyStat.source,
          statDate,
          device: device.name,
          sourceDeviceId: String(device.id),
          distanceKm: stored.distanceKm,
          drivingDurationMs: stored.drivingDurationMs,
          drivingDurationMinutes: Number((stored.drivingDurationMs / 60000).toFixed(2)),
          trips: trips.length,
          stops: persistableStops.length,
        },
        null,
        2,
      ),
    );
  }
}

function resolveTargetStatDate(): string {
  const cliValue = process.argv[2]?.trim();
  if (isIsoDate(cliValue)) {
    return cliValue;
  }

  const envValue = process.env.TRACKER_DAILY_STATS_DATE?.trim();
  if (isIsoDate(envValue)) {
    return envValue;
  }

  const today = new Date(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: DEFAULT_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
  );
  today.setUTCDate(today.getUTCDate() - 1);

  return today.toISOString().slice(0, 10);
}

function isIsoDate(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

main().catch((error) => {
  logError("EquGPS daily stats sync failed:", error);
  process.exitCode = 1;
});
