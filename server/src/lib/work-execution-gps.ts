import { pool } from "./db.js";
import {
  createEquGpsPlatformSession,
  fetchPlatformDevices,
  fetchPlatformMode1Report,
  fetchPlatformPositions,
  normalizeCoordinate,
  normalizeEpochSeconds,
  normalizeText,
  type EquGpsPlatformMode1Report,
  type EquGpsPlatformPosition,
  type EquGpsPlatformTrip,
} from "./equgps-platform.js";
import { runEquGpsSync } from "./equgps-sync.js";
import { safelyUpsertAutomaticFuelExpenseForExecution } from "./execution-fuel-expense.js";
import { logError } from "./logger.js";
import { reverseGeocodePosition } from "./reverse-geocode.js";

interface StopRow {
  id: string;
  stopStart: Date;
  stopEnd: Date | null;
  durationMs: number;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  startOdometer: number | null;
  endOdometer: number | null;
}

interface DailyStatRow {
  statDate: string;
  distanceKm: number;
  drivingDurationMs: number;
  engineHoursMs: number | null;
}

interface SessionRow {
  id: string;
  orderId: string;
  equipmentId: string | null;
  trackerDeviceId: string | null;
  trackerDeviceName: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  gpsSnapshotJson?: Record<string, unknown> | null;
}

type ExecutionGpsResult =
  | {
      status: "ok";
      source: "equgps_direct" | "local_tracker_cache";
      distanceKm: number;
      driveDurationMinutes: number;
      stopDurationMinutes: number;
      engineHours: number | null;
      warning?: string;
    }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

type DirectTrip = {
  id: string;
  tripStart: Date;
  tripEnd: Date;
  durationMs: number;
  distanceKm: number | null;
  startPoint: GpsPoint;
  endPoint: GpsPoint;
  rawPayload: EquGpsPlatformTrip;
};

type GpsPoint = {
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  at: string | null;
};

const DEFAULT_TIME_ZONE = "Europe/Kiev";

function overlapMs(startA: Date, endA: Date, startB: Date, endB: Date) {
  const start = Math.max(startA.getTime(), startB.getTime());
  const end = Math.min(endA.getTime(), endB.getTime());
  return Math.max(0, end - start);
}

function toIsoDateUtc(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getIsoDatesBetween(startedAt: Date, finishedAt: Date) {
  const dates: string[] = [];
  const cursor = new Date(Date.UTC(startedAt.getUTCFullYear(), startedAt.getUTCMonth(), startedAt.getUTCDate()));
  const end = new Date(Date.UTC(finishedAt.getUTCFullYear(), finishedAt.getUTCMonth(), finishedAt.getUTCDate()));

  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function roundDistance(value: number) {
  return Number(value.toFixed(3));
}

function roundMinutes(valueMs: number) {
  return Number((valueMs / 60000).toFixed(2));
}

function roundHours(valueMs: number) {
  return Number((valueMs / 3600000).toFixed(2));
}

function readCoordinates(coordinates: unknown): { latitude: number | null; longitude: number | null } {
  if (!Array.isArray(coordinates)) {
    return { latitude: null, longitude: null };
  }

  return {
    latitude: normalizeCoordinate(coordinates[0]),
    longitude: normalizeCoordinate(coordinates[1]),
  };
}

function toRoundedKilometers(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Number((value / 1000).toFixed(3));
}

function buildTripsFromStops(stops: StopRow[]) {
  const trips: Array<{
    id: string;
    tripStart: Date;
    tripEnd: Date;
    durationMs: number;
    distanceKm: number | null;
    startStopId: string;
    endStopId: string;
  }> = [];

  for (let index = 0; index < stops.length - 1; index += 1) {
    const currentStop = stops[index];
    const nextStop = stops[index + 1];
    if (!currentStop.stopEnd) {
      continue;
    }

    const tripStart = currentStop.stopEnd;
    const tripEnd = nextStop.stopStart;
    const durationMs = tripEnd.getTime() - tripStart.getTime();
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      continue;
    }

    let distanceKm: number | null = null;
    if (typeof currentStop.endOdometer === "number" && typeof nextStop.startOdometer === "number") {
      distanceKm = Number((Math.max(0, nextStop.startOdometer - currentStop.endOdometer) / 1000).toFixed(3));
    }

    trips.push({
      id: `${currentStop.id}:${nextStop.id}`,
      tripStart,
      tripEnd,
      durationMs,
      distanceKm,
      startStopId: currentStop.id,
      endStopId: nextStop.id,
    });
  }

  return trips;
}

function getStartSnapshot(existing: Record<string, unknown> | null | undefined) {
  const startSnapshot = existing?.startSnapshot;
  return startSnapshot && typeof startSnapshot === "object" ? startSnapshot : null;
}

async function loadSession(executionSessionId: string) {
  const sessionRes = await pool.query<SessionRow>(
    `SELECT
       wes."id",
       wes."orderId",
       wes."equipmentId",
       wes."trackerDeviceId",
       td."name" AS "trackerDeviceName",
       wes."startedAt",
       wes."finishedAt",
       wer."gpsSnapshotJson"
     FROM "WorkExecutionSession" wes
     LEFT JOIN "TrackerDevice" td ON td."id" = wes."trackerDeviceId"
     LEFT JOIN "WorkExecutionReport" wer ON wer."executionSessionId" = wes."id"
     WHERE wes."id" = $1
     LIMIT 1`,
    [executionSessionId],
  );

  return sessionRes.rows[0] ?? null;
}

async function resolvePoint(point: GpsPoint): Promise<GpsPoint> {
  if (point.address || point.latitude == null || point.longitude == null) {
    return point;
  }

  return {
    ...point,
    address: await reverseGeocodePosition(point.latitude, point.longitude),
  };
}

function buildPointFromPosition(position: EquGpsPlatformPosition): GpsPoint {
  const latitude = normalizeCoordinate(position.latitudeGps ?? position.latitude);
  const longitude = normalizeCoordinate(position.longitudeGps ?? position.longitude);
  return {
    address: normalizeText(position.address),
    latitude,
    longitude,
    at: position.fixTime ?? position.serverTime ?? position.deviceTime ?? null,
  };
}

async function findPlatformDeviceAndReports(session: SessionRow, startedAt: Date, finishedAt: Date) {
  if (!session.trackerDeviceName) {
    throw new Error("Execution session has no tracker device name.");
  }

  const platformSession = await createEquGpsPlatformSession();
  const devices = await fetchPlatformDevices(platformSession);
  const device = devices.find((item) => item.name.trim() === session.trackerDeviceName?.trim());
  if (!device) {
    throw new Error(`EquGPS device was not found by name: ${session.trackerDeviceName}`);
  }

  const dates = getIsoDatesBetween(startedAt, finishedAt);
  const reports = await Promise.all(
    dates.map(async (date) => ({
      date,
      report: await fetchPlatformMode1Report(platformSession, device.id, date),
    })),
  );

  return { device, reports };
}

function buildDirectTrips(reports: Array<{ date: string; report: EquGpsPlatformMode1Report | null }>) {
  return reports.flatMap(({ date, report }) => {
    const trips = Array.isArray(report?.dataGo) ? report.dataGo : [];
    return trips
      .map((trip, index): DirectTrip | null => {
        const tripStart = normalizeEpochSeconds(trip.startTime);
        const tripEnd = normalizeEpochSeconds(trip.endTime);
        if (!tripStart || !tripEnd || tripEnd <= tripStart) {
          return null;
        }

        const startCoordinates = readCoordinates(trip.startC);
        const endCoordinates = readCoordinates(trip.endC);
        return {
          id: `${date}:${index + 1}`,
          tripStart,
          tripEnd,
          durationMs: tripEnd.getTime() - tripStart.getTime(),
          distanceKm: toRoundedKilometers(trip.distance),
          startPoint: {
            address: normalizeText(trip.startA),
            latitude: startCoordinates.latitude,
            longitude: startCoordinates.longitude,
            at: tripStart.toISOString(),
          },
          endPoint: {
            address: normalizeText(trip.endA),
            latitude: endCoordinates.latitude,
            longitude: endCoordinates.longitude,
            at: tripEnd.toISOString(),
          },
          rawPayload: trip,
        };
      })
      .filter((trip): trip is DirectTrip => Boolean(trip));
  });
}

function buildDirectStops(trips: DirectTrip[]) {
  return trips
    .map((trip) => {
      const stopLongSeconds = Number(trip.rawPayload.stopLongSeconds ?? 0) || 0;
      const durationMs = Math.max(0, Math.round(stopLongSeconds * 1000));
      if (durationMs <= 0) {
        return null;
      }

      return {
        id: `${trip.id}:stop`,
        stopStart: trip.tripEnd,
        stopEnd: new Date(trip.tripEnd.getTime() + durationMs),
        durationMs,
        latitude: trip.endPoint.latitude,
        longitude: trip.endPoint.longitude,
        address: trip.endPoint.address,
      };
    })
    .filter((stop): stop is NonNullable<typeof stop> => Boolean(stop));
}

async function calculateFromDirectEquGps(session: SessionRow): Promise<ExecutionGpsResult> {
  if (!session.trackerDeviceId || !session.startedAt || !session.finishedAt) {
    return { status: "skipped", reason: "missing_session_context" };
  }

  const startedAt = new Date(session.startedAt);
  const finishedAt = new Date(session.finishedAt);
  const { device, reports } = await findPlatformDeviceAndReports(session, startedAt, finishedAt);
  const trips = buildDirectTrips(reports).sort((a, b) => a.tripStart.getTime() - b.tripStart.getTime());
  const stops = buildDirectStops(trips);

  const overlappingTrips = trips
    .map((trip) => {
      const overlapDurationMs = overlapMs(trip.tripStart, trip.tripEnd, startedAt, finishedAt);
      if (overlapDurationMs <= 0) {
        return null;
      }

      const ratio = trip.durationMs > 0 ? overlapDurationMs / trip.durationMs : 0;
      return {
        ...trip,
        overlapDurationMs,
        overlapDistanceKm: trip.distanceKm != null ? roundDistance(trip.distanceKm * ratio) : null,
      };
    })
    .filter((trip): trip is NonNullable<typeof trip> => Boolean(trip));

  const stopDurationMs = stops.reduce(
    (total, stop) => total + overlapMs(stop.stopStart, stop.stopEnd, startedAt, finishedAt),
    0,
  );
  const driveDurationMs = overlappingTrips.reduce((total, trip) => total + trip.overlapDurationMs, 0);
  const distanceKm = roundDistance(
    overlappingTrips.reduce((total, trip) => total + (trip.overlapDistanceKm ?? 0), 0),
  );

  const totalReportDrivingMs = reports.reduce(
    (total, item) => total + Math.max(0, Math.round((Number(item.report?.dataPositions?.goTime ?? 0) || 0) * 1000)),
    0,
  );
  const totalReportEngineMs = reports.reduce((total, item) => {
    const motoHours = item.report?.dataPositions?.motoHours;
    return total + (typeof motoHours === "number" && Number.isFinite(motoHours) ? Math.max(0, Math.round(motoHours * 1000)) : 0);
  }, 0);
  const engineHoursMs = totalReportDrivingMs > 0 && totalReportEngineMs > 0
    ? Math.round(totalReportEngineMs * Math.min(1, driveDurationMs / totalReportDrivingMs))
    : null;

  if (overlappingTrips.length === 0 && distanceKm <= 0 && driveDurationMs <= 0) {
    return { status: "failed", reason: "direct_equgps_interval_has_no_matching_trips" };
  }

  const firstTrip = overlappingTrips[0];
  const lastTrip = overlappingTrips[overlappingTrips.length - 1];
  const startPoint = firstTrip ? await resolvePoint(firstTrip.startPoint) : null;
  const endPoint = lastTrip ? await resolvePoint(lastTrip.endPoint) : null;

  const gpsSnapshotJson = {
    source: "gps.equgps.com",
    method: "direct_mode1_interval_report",
    trackerDeviceId: session.trackerDeviceId,
    sourceDeviceId: String(device.id),
    deviceName: device.name,
    startSnapshot: getStartSnapshot(session.gpsSnapshotJson),
    startPoint,
    endPoint,
    session: {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    },
    calculation: {
      distanceMethod: "equgps_mode1_trip_overlap",
      driveDurationMethod: "equgps_mode1_trip_overlap",
      stopDurationMethod: "equgps_mode1_stop_overlap",
      engineHoursMethod: engineHoursMs != null ? "equgps_mode1_daily_ratio" : "unavailable",
    },
    reports: reports.map((item) => ({
      date: item.date,
      hasReport: Boolean(item.report),
      totals: item.report?.dataPositions ?? null,
    })),
    derivedTrips: overlappingTrips.map((trip) => ({
      id: trip.id,
      tripStart: trip.tripStart.toISOString(),
      tripEnd: trip.tripEnd.toISOString(),
      overlapDurationMs: trip.overlapDurationMs,
      distanceKm: trip.overlapDistanceKm,
      startPoint: trip.startPoint,
      endPoint: trip.endPoint,
    })),
    derivedStops: stops.map((stop) => ({
      id: stop.id,
      stopStart: stop.stopStart.toISOString(),
      stopEnd: stop.stopEnd.toISOString(),
      overlapDurationMs: overlapMs(stop.stopStart, stop.stopEnd, startedAt, finishedAt),
      latitude: stop.latitude,
      longitude: stop.longitude,
      address: stop.address,
    })),
  };

  await updateExecutionReportMetrics(session.id, {
    distanceKm,
    driveDurationMs,
    stopDurationMs,
    engineHoursMs,
    gpsSnapshotJson,
  });
  await safelyUpsertAutomaticFuelExpenseForExecution(session.id);

  return {
    status: "ok",
    source: "equgps_direct",
    distanceKm,
    driveDurationMinutes: roundMinutes(driveDurationMs),
    stopDurationMinutes: roundMinutes(stopDurationMs),
    engineHours: engineHoursMs != null ? roundHours(engineHoursMs) : null,
  };
}

async function calculateFromLocalCache(session: SessionRow, warning?: string): Promise<ExecutionGpsResult> {
  if (!session.trackerDeviceId || !session.startedAt || !session.finishedAt) {
    return { status: "skipped", reason: "missing_session_context" };
  }

  try {
    await runEquGpsSync();
  } catch (error) {
    logError("enrichExecutionReportWithGps sync warning:", error);
  }

  const startedAt = new Date(session.startedAt);
  const finishedAt = new Date(session.finishedAt);
  const sessionDurationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());

  const [stopsRes, dailyStatsRes] = await Promise.all([
    pool.query<StopRow>(
      `SELECT
         "id",
         "stopStart",
         "stopEnd",
         "durationMs",
         "latitude",
         "longitude",
         "address",
         "startOdometer",
         "endOdometer"
       FROM "TrackerStop"
       WHERE "trackerDeviceId" = $1
         AND "stopStart" <= $3
         AND COALESCE("stopEnd", "stopStart") >= $2
       ORDER BY "stopStart" ASC`,
      [session.trackerDeviceId, startedAt, finishedAt],
    ),
    pool.query<DailyStatRow>(
      `SELECT
         "statDate"::text AS "statDate",
         "distanceKm",
         "drivingDurationMs",
         "engineHoursMs"
       FROM "TrackerDailyStat"
       WHERE "trackerDeviceId" = $1
         AND "statDate" BETWEEN $2::date AND $3::date
       ORDER BY "statDate" ASC`,
      [session.trackerDeviceId, toIsoDateUtc(startedAt), toIsoDateUtc(finishedAt)],
    ),
  ]);

  const stops = stopsRes.rows.map((row) => ({
    ...row,
    stopStart: new Date(row.stopStart),
    stopEnd: row.stopEnd ? new Date(row.stopEnd) : null,
  }));
  const trips = buildTripsFromStops(stops);

  const stopDurationMs = stops.reduce((total, stop) => {
    const stopEnd = stop.stopEnd ?? stop.stopStart;
    return total + overlapMs(stop.stopStart, stopEnd, startedAt, finishedAt);
  }, 0);

  const tripOverlap = trips.map((trip) => {
    const overlapDurationMs = overlapMs(trip.tripStart, trip.tripEnd, startedAt, finishedAt);
    if (overlapDurationMs <= 0) {
      return null;
    }

    const ratio = trip.durationMs > 0 ? overlapDurationMs / trip.durationMs : 0;
    const distanceKm = trip.distanceKm != null ? roundDistance(trip.distanceKm * ratio) : null;

    return {
      ...trip,
      overlapDurationMs,
      distanceKm,
    };
  }).filter((trip): trip is NonNullable<typeof trip> => Boolean(trip));

  const driveDurationMsFromTrips = tripOverlap.reduce((total, trip) => total + trip.overlapDurationMs, 0);
  const driveDurationMs = driveDurationMsFromTrips > 0
    ? driveDurationMsFromTrips
    : Math.max(0, sessionDurationMs - stopDurationMs);
  const distanceKm = roundDistance(
    tripOverlap.reduce((total, trip) => total + (trip.distanceKm ?? 0), 0),
  );

  let engineHoursMs: number | null = null;
  if (dailyStatsRes.rows.length === 1) {
    const dayStat = dailyStatsRes.rows[0];
    const dayDrivingMs = Number(dayStat.drivingDurationMs ?? 0);
    const dayEngineHoursMs = dayStat.engineHoursMs != null ? Number(dayStat.engineHoursMs) : null;
    if (dayEngineHoursMs != null && dayDrivingMs > 0) {
      const ratio = Math.min(1, driveDurationMs / dayDrivingMs);
      engineHoursMs = Math.round(dayEngineHoursMs * ratio);
    }
  }

  const gpsSnapshotJson = {
    source: "local_tracker_cache",
    method: "local_cache_after_equgps_sync",
    trackerDeviceId: session.trackerDeviceId,
    startSnapshot: getStartSnapshot(session.gpsSnapshotJson),
    warning: warning ?? null,
    session: {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: sessionDurationMs,
    },
    calculation: {
      distanceMethod: "tracker_stop_odometer_gap_overlap",
      driveDurationMethod: driveDurationMsFromTrips > 0 ? "tracker_stop_trip_overlap" : "session_minus_stop_overlap",
      stopDurationMethod: "tracker_stop_overlap",
      engineHoursMethod: engineHoursMs != null ? "daily_stat_proportional" : "unavailable",
    },
    matchedStops: stops.map((stop) => ({
      id: stop.id,
      stopStart: stop.stopStart.toISOString(),
      stopEnd: stop.stopEnd?.toISOString() ?? null,
      durationMs: stop.durationMs,
      latitude: stop.latitude,
      longitude: stop.longitude,
      address: stop.address,
      startOdometer: stop.startOdometer,
      endOdometer: stop.endOdometer,
    })),
    derivedTrips: tripOverlap.map((trip) => ({
      id: trip.id,
      tripStart: trip.tripStart.toISOString(),
      tripEnd: trip.tripEnd.toISOString(),
      overlapDurationMs: trip.overlapDurationMs,
      distanceKm: trip.distanceKm,
      startStopId: trip.startStopId,
      endStopId: trip.endStopId,
    })),
    dailyStats: dailyStatsRes.rows,
  };

  await updateExecutionReportMetrics(session.id, {
    distanceKm,
    driveDurationMs,
    stopDurationMs,
    engineHoursMs,
    gpsSnapshotJson,
  });
  await safelyUpsertAutomaticFuelExpenseForExecution(session.id);

  return {
    status: "ok",
    source: "local_tracker_cache",
    distanceKm,
    driveDurationMinutes: roundMinutes(driveDurationMs),
    stopDurationMinutes: roundMinutes(stopDurationMs),
    engineHours: engineHoursMs != null ? roundHours(engineHoursMs) : null,
    warning,
  };
}

async function calculateTrackerMetricsFromLocalCache(
  trackerDeviceId: string,
  startedAt: Date,
  finishedAt: Date,
) {
  const sessionDurationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());

  const [stopsRes, dailyStatsRes] = await Promise.all([
    pool.query<StopRow>(
      `SELECT
         "id",
         "stopStart",
         "stopEnd",
         "durationMs",
         "latitude",
         "longitude",
         "address",
         "startOdometer",
         "endOdometer"
       FROM "TrackerStop"
       WHERE "trackerDeviceId" = $1
         AND "stopStart" <= $3
         AND COALESCE("stopEnd", "stopStart") >= $2
       ORDER BY "stopStart" ASC`,
      [trackerDeviceId, startedAt, finishedAt],
    ),
    pool.query<DailyStatRow>(
      `SELECT
         "statDate"::text AS "statDate",
         "distanceKm",
         "drivingDurationMs",
         "engineHoursMs"
       FROM "TrackerDailyStat"
       WHERE "trackerDeviceId" = $1
         AND "statDate" BETWEEN $2::date AND $3::date
       ORDER BY "statDate" ASC`,
      [trackerDeviceId, toIsoDateUtc(startedAt), toIsoDateUtc(finishedAt)],
    ),
  ]);

  const stops = stopsRes.rows.map((row) => ({
    ...row,
    stopStart: new Date(row.stopStart),
    stopEnd: row.stopEnd ? new Date(row.stopEnd) : null,
  }));
  const trips = buildTripsFromStops(stops);

  const stopDurationMs = stops.reduce((total, stop) => {
    const stopEnd = stop.stopEnd ?? stop.stopStart;
    return total + overlapMs(stop.stopStart, stopEnd, startedAt, finishedAt);
  }, 0);

  const tripOverlap = trips
    .map((trip) => {
      const overlapDurationMs = overlapMs(trip.tripStart, trip.tripEnd, startedAt, finishedAt);
      if (overlapDurationMs <= 0) {
        return null;
      }

      const ratio = trip.durationMs > 0 ? overlapDurationMs / trip.durationMs : 0;
      const distanceKm = trip.distanceKm != null ? roundDistance(trip.distanceKm * ratio) : null;

      return {
        ...trip,
        overlapDurationMs,
        distanceKm,
      };
    })
    .filter((trip): trip is NonNullable<typeof trip> => Boolean(trip));

  const driveDurationMsFromTrips = tripOverlap.reduce((total, trip) => total + trip.overlapDurationMs, 0);
  const driveDurationMs = driveDurationMsFromTrips > 0
    ? driveDurationMsFromTrips
    : Math.max(0, sessionDurationMs - stopDurationMs);
  const distanceKm = roundDistance(
    tripOverlap.reduce((total, trip) => total + (trip.distanceKm ?? 0), 0),
  );

  let engineHoursMs: number | null = null;
  if (dailyStatsRes.rows.length === 1) {
    const dayStat = dailyStatsRes.rows[0];
    const dayDrivingMs = Number(dayStat.drivingDurationMs ?? 0);
    const dayEngineHoursMs = dayStat.engineHoursMs != null ? Number(dayStat.engineHoursMs) : null;
    if (dayEngineHoursMs != null && dayDrivingMs > 0) {
      const ratio = Math.min(1, driveDurationMs / dayDrivingMs);
      engineHoursMs = Math.round(dayEngineHoursMs * ratio);
    }
  }

  return {
    distanceKm,
    driveDurationMinutes: roundMinutes(driveDurationMs),
    stopDurationMinutes: roundMinutes(stopDurationMs),
    engineHours: engineHoursMs != null ? roundHours(engineHoursMs) : null,
    source: "local_tracker_cache" as const,
  };
}

async function updateAdditionalEquipmentGpsMetrics(session: SessionRow) {
  if (!session.orderId || !session.startedAt || !session.finishedAt) {
    return;
  }

  try {
    await runEquGpsSync();
  } catch (error) {
    logError("updateAdditionalEquipmentGpsMetrics sync warning:", error);
  }

  const additionalEquipmentRes = await pool.query<{
    equipmentId: string;
    equipmentName: string;
    trackerDeviceId: string | null;
  }>(
    `SELECT DISTINCT
       e."id" AS "equipmentId",
       e."name" AS "equipmentName",
       td."id" AS "trackerDeviceId"
     FROM "Equipment" e
     LEFT JOIN "TrackerDevice" td ON td."equipmentId" = e."id"
     WHERE e."id" IN (
       SELECT roi."equipmentId"
       FROM "RentOrderItem" roi
       WHERE roi."rentOrderId" = $1
       UNION
       SELECT opi."equipmentId"
       FROM "OrderPriceItem" opi
       WHERE opi."rentOrderId" = $1
         AND opi."equipmentId" IS NOT NULL
     )
       AND e."id" <> $2`,
    [session.orderId, session.equipmentId ?? ""],
  );

  const metrics = [] as Array<{
    equipmentId: string;
    equipmentName: string;
    source: "gps";
    trackerDeviceId: string;
    distanceKm: number | null;
    driveDurationMinutes: number | null;
    stopDurationMinutes: number | null;
    engineHours: number | null;
    updatedAt: string;
  }>;

  for (const equipment of additionalEquipmentRes.rows) {
    if (!equipment.trackerDeviceId) {
      continue;
    }

    const metric = await calculateTrackerMetricsFromLocalCache(
      equipment.trackerDeviceId,
      new Date(session.startedAt),
      new Date(session.finishedAt),
    );

    metrics.push({
      equipmentId: String(equipment.equipmentId),
      equipmentName: String(equipment.equipmentName),
      source: "gps",
      trackerDeviceId: String(equipment.trackerDeviceId),
      distanceKm: metric.distanceKm,
      driveDurationMinutes: metric.driveDurationMinutes,
      stopDurationMinutes: metric.stopDurationMinutes,
      engineHours: metric.engineHours,
      updatedAt: new Date().toISOString(),
    });
  }

  await pool.query(
    `UPDATE "WorkExecutionReport"
     SET "gpsSnapshotJson" = COALESCE("gpsSnapshotJson", '{}'::jsonb) || $2::jsonb,
         "updatedAt" = NOW()
     WHERE "executionSessionId" = $1`,
    [
      session.id,
      JSON.stringify({
        equipmentMetrics: metrics,
      }),
    ],
  );
}

async function updateExecutionReportMetrics(
  executionSessionId: string,
  input: {
    distanceKm: number;
    driveDurationMs: number;
    stopDurationMs: number;
    engineHoursMs: number | null;
    gpsSnapshotJson: unknown;
  },
) {
  await pool.query(
    `INSERT INTO "WorkExecutionReport" (
       "executionSessionId",
       "distanceKm",
       "driveDurationMinutes",
       "idleDurationMinutes",
       "stopDurationMinutes",
       "engineHours",
       "gpsSnapshotJson",
       "updatedAt"
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
     ON CONFLICT ("executionSessionId")
     DO UPDATE SET
       "distanceKm" = EXCLUDED."distanceKm",
       "driveDurationMinutes" = EXCLUDED."driveDurationMinutes",
       "idleDurationMinutes" = EXCLUDED."idleDurationMinutes",
       "stopDurationMinutes" = EXCLUDED."stopDurationMinutes",
     "engineHours" = EXCLUDED."engineHours",
       "gpsSnapshotJson" = COALESCE("WorkExecutionReport"."gpsSnapshotJson", '{}'::jsonb) || EXCLUDED."gpsSnapshotJson",
       "updatedAt" = NOW()`,
    [
      executionSessionId,
      input.distanceKm,
      roundMinutes(input.driveDurationMs),
      roundMinutes(input.stopDurationMs),
      roundMinutes(input.stopDurationMs),
      input.engineHoursMs != null ? roundHours(input.engineHoursMs) : null,
      JSON.stringify(input.gpsSnapshotJson),
    ],
  );
}

export async function captureExecutionStartGps(executionSessionId: string) {
  const session = await loadSession(executionSessionId);
  if (!session?.trackerDeviceId || !session.trackerDeviceName || !session.startedAt) {
    return { status: "skipped", reason: "missing_session_context" as const };
  }

  try {
    const platformSession = await createEquGpsPlatformSession();
    const [devices, positions] = await Promise.all([
      fetchPlatformDevices(platformSession),
      fetchPlatformPositions(platformSession),
    ]);
    const device = devices.find((item) => item.name.trim() === session.trackerDeviceName?.trim());
    const position = device?.positionId
      ? positions.find((item) => String(item.id) === String(device.positionId))
      : null;

    if (!device || !position) {
      return { status: "skipped", reason: "equgps_device_position_not_found" as const };
    }

    const point = await resolvePoint(buildPointFromPosition(position));
    const gpsSnapshotJson = {
      ...(session.gpsSnapshotJson ?? {}),
      startSnapshot: {
        source: "gps.equgps.com",
        method: "direct_current_position_at_start",
        trackerDeviceId: session.trackerDeviceId,
        sourceDeviceId: String(device.id),
        deviceName: device.name,
        capturedAt: new Date().toISOString(),
        sessionStartedAt: new Date(session.startedAt).toISOString(),
        point,
        rawPosition: {
          id: position.id,
          fixTime: position.fixTime ?? null,
          serverTime: position.serverTime ?? null,
          valid: position.valid ?? null,
          outdated: position.outdated ?? null,
          speed: position.speed ?? null,
        },
      },
    };

    await pool.query(
      `INSERT INTO "WorkExecutionReport" ("executionSessionId", "gpsSnapshotJson", "updatedAt")
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT ("executionSessionId")
       DO UPDATE SET
         "gpsSnapshotJson" = COALESCE("WorkExecutionReport"."gpsSnapshotJson", '{}'::jsonb) || EXCLUDED."gpsSnapshotJson",
         "updatedAt" = NOW()`,
      [executionSessionId, JSON.stringify(gpsSnapshotJson)],
    );

    return { status: "ok" as const, point };
  } catch (error) {
    logError("captureExecutionStartGps error:", error);
    return {
      status: "failed" as const,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function enrichExecutionReportWithGps(executionSessionId: string): Promise<ExecutionGpsResult> {
  const session = await loadSession(executionSessionId);
  if (!session?.trackerDeviceId || !session.startedAt || !session.finishedAt) {
    return { status: "skipped", reason: "missing_session_context" };
  }

  try {
    const result = await calculateFromDirectEquGps(session);
    if (result.status === "ok") {
      await updateAdditionalEquipmentGpsMetrics(session);
      return result;
    }
    const fallbackResult = await calculateFromLocalCache(session, result.reason);
    if (fallbackResult.status === "ok") {
      await updateAdditionalEquipmentGpsMetrics(session);
    }
    return fallbackResult;
  } catch (error) {
    const warning = error instanceof Error ? error.message : String(error);
    logError("direct EquGPS execution report failed, using local fallback:", error);
    const fallbackResult = await calculateFromLocalCache(session, warning);
    if (fallbackResult.status === "ok") {
      await updateAdditionalEquipmentGpsMetrics(session);
    }
    return fallbackResult;
  }
}
