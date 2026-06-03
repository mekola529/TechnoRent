import { Router } from "express";
import { z } from "zod";
import { pool } from "../lib/db.js";
import { runEquGpsSync } from "../lib/equgps-sync.js";
import { logError } from "../lib/logger.js";
import { reverseGeocodePosition } from "../lib/reverse-geocode.js";
import { authMiddleware } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

export const adminGpsRouter = Router();
const GPS_TIME_ZONE = "Europe/Kiev";

adminGpsRouter.use(authMiddleware);

adminGpsRouter.post("/sync", async (_req, res) => {
  try {
    const result = await runEquGpsSync();
    return res.json({
      status: "completed",
      ...result,
    });
  } catch (error) {
    logError("POST /api/admin/gps/sync error:", error);
    return res.status(500).json({ error: "Не вдалося підтягнути GPS-дані" });
  }
});

adminGpsRouter.get("/", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         td."id",
         td."name",
         td."equipmentId",
         td."lastAddress",
         td."lastLatitude",
         td."lastLongitude",
         td."lastEventText",
         td."lastTrackerAt",
         td."lastTelegramChatId",
       td."lastTelegramMessageId",
       td."createdAt",
       td."updatedAt",
       COALESCE(
         (
           SELECT json_agg(
             json_build_object(
               'id', ts."id",
               'stopStart', ts."stopStart",
               'stopEnd', ts."stopEnd",
               'durationMs', ts."durationMs",
               'latitude', ts."latitude",
               'longitude', ts."longitude",
               'address', ts."address",
               'startOdometer', ts."startOdometer",
               'endOdometer', ts."endOdometer"
             )
             ORDER BY ts."stopStart" DESC
           )
           FROM (
             SELECT *
             FROM "TrackerStop"
             WHERE "trackerDeviceId" = td."id"
               AND "stopStart" >= NOW() - INTERVAL '7 days'
             ORDER BY "stopStart" DESC
             LIMIT 8
           ) ts
         ),
         '[]'::json
       ) AS "recentStops",
       CASE
         WHEN e."id" IS NOT NULL THEN json_build_object('id', e."id", 'name', e."name", 'slug', e."slug")
         ELSE NULL
         END AS "equipment"
       FROM "TrackerDevice" td
       LEFT JOIN "Equipment" e ON e."id" = td."equipmentId"
       ORDER BY COALESCE(td."lastTrackerAt", td."updatedAt") DESC, td."name" ASC`,
    );

    res.json(rows);
  } catch (e) {
    logError("GET /api/admin/gps error:", e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

const trackerDeviceSchema = z.object({
  name: z.string().trim().min(1, "Назва GPS-маячка обов'язкова"),
  equipmentId: z.string().trim().min(1).nullable().optional(),
  lastAddress: z.string().trim().nullable().optional(),
  lastLatitude: z.number().min(-90).max(90).nullable().optional(),
  lastLongitude: z.number().min(-180).max(180).nullable().optional(),
});

adminGpsRouter.patch("/:id", validate(trackerDeviceSchema), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT "id" FROM "TrackerDevice" WHERE "id" = $1 LIMIT 1`,
      [req.params.id],
    );

    if (!existing.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "GPS-пристрій не знайдено" });
      return;
    }

    if (req.body.equipmentId) {
      const equipment = await client.query(
        `SELECT "id" FROM "Equipment" WHERE "id" = $1 LIMIT 1`,
        [req.body.equipmentId],
      );

      if (!equipment.rows[0]) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Обрану техніку не знайдено" });
        return;
      }

      await client.query(
        `UPDATE "TrackerDevice"
         SET "equipmentId" = NULL,
             "updatedAt" = NOW()
         WHERE "equipmentId" = $1
           AND "id" <> $2`,
        [req.body.equipmentId, req.params.id],
      );
    }

    const { rows } = await client.query(
      `UPDATE "TrackerDevice"
       SET "name" = $1,
           "equipmentId" = $2,
           "lastAddress" = $3,
           "lastLatitude" = $4,
           "lastLongitude" = $5,
           "updatedAt" = NOW()
       WHERE "id" = $6
       RETURNING *`,
      [
        req.body.name,
        req.body.equipmentId || null,
        req.body.lastAddress || null,
        req.body.lastLatitude ?? null,
        req.body.lastLongitude ?? null,
        req.params.id,
      ],
    );

    await client.query("COMMIT");
    res.json(rows[0]);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    logError("PATCH /api/admin/gps/:id error:", error);
    if (error instanceof Error && error.message.includes("duplicate key")) {
      res.status(400).json({ error: "GPS-маячок з такою назвою вже існує" });
      return;
    }
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});

adminGpsRouter.delete("/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT "id" FROM "TrackerDevice" WHERE "id" = $1 LIMIT 1`,
      [req.params.id],
    );

    if (!existing.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "GPS-пристрій не знайдено" });
      return;
    }

    await client.query(`DELETE FROM "TrackerDevice" WHERE "id" = $1`, [req.params.id]);
    await client.query("COMMIT");
    res.json({ status: "ok" });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    logError("DELETE /api/admin/gps/:id error:", error);
    res.status(500).json({ error: "Помилка сервера" });
  } finally {
    client.release();
  }
});

adminGpsRouter.get("/:id/day", async (req, res) => {
  const trackerDeviceId = req.params.id;
  const date = normalizeIsoDate(req.query.date);

  if (!trackerDeviceId) {
    return res.status(400).json({ error: "Не вказано GPS-пристрій" });
  }

  try {
    const deviceResult = await pool.query(
      `SELECT
         td."id",
         td."name",
         td."equipmentId",
         td."lastAddress",
         td."lastLatitude",
         td."lastLongitude",
         td."lastEventText",
         td."lastTrackerAt",
         CASE
           WHEN e."id" IS NOT NULL THEN json_build_object('id', e."id", 'name', e."name", 'slug', e."slug")
           ELSE NULL
         END AS "equipment"
       FROM "TrackerDevice" td
       LEFT JOIN "Equipment" e ON e."id" = td."equipmentId"
       WHERE td."id" = $1
       LIMIT 1`,
      [trackerDeviceId],
    );

    const device = deviceResult.rows[0];
    if (!device) {
      return res.status(404).json({ error: "GPS-пристрій не знайдено" });
    }

    const stopsResult = await pool.query(
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
         AND ("stopStart" AT TIME ZONE '${GPS_TIME_ZONE}')::date = $2::date
       ORDER BY "stopStart" ASC`,
      [trackerDeviceId, date],
    );

    const dailyStatResult = await pool.query(
       `SELECT
         "distanceKm",
         "drivingDurationMs",
         "engineHoursMs",
         "rawPayload",
         "updatedAt"
       FROM "TrackerDailyStat"
       WHERE "trackerDeviceId" = $1
         AND "statDate" = $2::date
       ORDER BY "updatedAt" DESC
       LIMIT 1`,
      [trackerDeviceId, date],
    );

    const stops = await Promise.all(stopsResult.rows.map(mapStopRow).map(enrichStopAddress));
    const trips = await buildTrips(
      stops,
      dailyStatResult.rows[0]?.rawPayload as Record<string, unknown> | undefined,
    );
    const stopDurationMs = stops.reduce((total, stop) => total + stop.durationMs, 0);
    const tripDurationMs = trips.reduce((total, trip) => total + trip.durationMs, 0);
    const dailyStat = dailyStatResult.rows[0] ?? null;

    const derivedDistanceKm = trips.reduce((total, trip) => total + (trip.distanceKm ?? 0), 0);
    const totalDistanceKm = dailyStat
      ? Number(dailyStat.distanceKm ?? 0)
      : Number(derivedDistanceKm.toFixed(3));

    const timeline = buildTimeline(stops, trips);

    return res.json({
      date,
      device,
      summary: {
        totalDistanceKm: Number(totalDistanceKm.toFixed(3)),
        tripCount: trips.length,
        tripDurationMs: Number(dailyStat?.drivingDurationMs ?? tripDurationMs),
        stopCount: stops.length,
        stopDurationMs,
        engineHoursMs: dailyStat?.engineHoursMs ? Number(dailyStat.engineHoursMs) : null,
      },
      trips,
      stops,
      timeline,
    });
  } catch (error) {
    logError(`GET /api/admin/gps/${trackerDeviceId}/day error:`, error);
    return res.status(500).json({ error: "Помилка сервера" });
  }
});

function normalizeIsoDate(value: unknown): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: GPS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(now);
}

function mapStopRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    stopStart: new Date(String(row.stopStart)).toISOString(),
    stopEnd: row.stopEnd ? new Date(String(row.stopEnd)).toISOString() : null,
    durationMs: Number(row.durationMs ?? 0),
    latitude: typeof row.latitude === "number" ? row.latitude : null,
    longitude: typeof row.longitude === "number" ? row.longitude : null,
    address: typeof row.address === "string" ? row.address : null,
    startOdometer: typeof row.startOdometer === "number" ? row.startOdometer : null,
    endOdometer: typeof row.endOdometer === "number" ? row.endOdometer : null,
  };
}

async function enrichStopAddress(stop: ReturnType<typeof mapStopRow>) {
  if (stop.address) {
    return stop;
  }

  return {
    ...stop,
    address: await reverseGeocodePosition(stop.latitude, stop.longitude),
  };
}

function buildTripsFromStops(
  stops: ReturnType<typeof mapStopRow>[],
) {
  const trips: Array<{
    id: string;
    tripStart: string;
    tripEnd: string;
    durationMs: number;
    distanceKm: number | null;
    startPoint: {
      address: string | null;
      latitude: number | null;
      longitude: number | null;
      odometer: number | null;
    };
    endPoint: {
      address: string | null;
      latitude: number | null;
      longitude: number | null;
      odometer: number | null;
    };
  }> = [];

  for (let index = 0; index < stops.length - 1; index += 1) {
    const currentStop = stops[index];
    const nextStop = stops[index + 1];
    const currentStopEnd = currentStop.stopEnd ? new Date(currentStop.stopEnd) : null;
    const nextStopStart = new Date(nextStop.stopStart);

    if (!currentStopEnd) {
      continue;
    }

    const durationMs = nextStopStart.getTime() - currentStopEnd.getTime();
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      continue;
    }

    let distanceKm: number | null = null;
    if (typeof currentStop.endOdometer === "number" && typeof nextStop.startOdometer === "number") {
      distanceKm = Number(Math.max(0, nextStop.startOdometer - currentStop.endOdometer).toFixed(3)) / 1000;
      distanceKm = Number(distanceKm.toFixed(3));
    }

    trips.push({
      id: `${currentStop.id}:${nextStop.id}`,
      tripStart: currentStopEnd.toISOString(),
      tripEnd: nextStopStart.toISOString(),
      durationMs,
      distanceKm,
      startPoint: {
        address: currentStop.address,
        latitude: currentStop.latitude,
        longitude: currentStop.longitude,
        odometer: currentStop.endOdometer,
      },
      endPoint: {
        address: nextStop.address,
        latitude: nextStop.latitude,
        longitude: nextStop.longitude,
        odometer: nextStop.startOdometer,
      },
    });
  }

  return trips;
}

async function buildTrips(
  stops: ReturnType<typeof mapStopRow>[],
  rawPayload?: Record<string, unknown>,
) {
  const dataGo = Array.isArray(rawPayload?.dataGo) ? rawPayload.dataGo : null;
  if (!dataGo) {
    return buildTripsFromStops(stops);
  }

  const trips = await Promise.all(
    dataGo.map(async (trip, index) => {
      const startLatitude = getCoordinateValue(trip, "startC", 0);
      const startLongitude = getCoordinateValue(trip, "startC", 1);
      const endLatitude = getCoordinateValue(trip, "endC", 0);
      const endLongitude = getCoordinateValue(trip, "endC", 1);
      const tripStart = getEpochIso(trip.startTime);
      const tripEnd = getEpochIso(trip.endTime);

      if (!tripStart || !tripEnd) {
        return null;
      }

      const startAddress = normalizeAddressText(trip.startA)
        ?? await reverseGeocodePosition(startLatitude, startLongitude);
      const endAddress = normalizeAddressText(trip.endA)
        ?? await reverseGeocodePosition(endLatitude, endLongitude);

      return {
        id: `payload-trip-${index + 1}`,
        tripStart,
        tripEnd,
        durationMs: Math.max(0, new Date(tripEnd).getTime() - new Date(tripStart).getTime()),
        distanceKm: toRoundedKilometers(trip.distance),
        startPoint: {
          address: startAddress,
          latitude: startLatitude,
          longitude: startLongitude,
          odometer: null,
        },
        endPoint: {
          address: endAddress,
          latitude: endLatitude,
          longitude: endLongitude,
          odometer: null,
        },
      };
    }),
  );

  return trips.filter((trip): trip is NonNullable<typeof trip> => Boolean(trip));
}

function buildTimeline(
  stops: ReturnType<typeof mapStopRow>[],
  trips: ReturnType<typeof buildTripsFromStops>,
) {
  const items = [
    ...stops.map((stop) => ({
      type: "stop" as const,
      sortAt: new Date(stop.stopStart).getTime(),
      data: stop,
    })),
    ...trips.map((trip) => ({
      type: "trip" as const,
      sortAt: new Date(trip.tripStart).getTime(),
      data: trip,
    })),
  ];

  return items
    .sort((first, second) => first.sortAt - second.sortAt)
    .map((item) => ({
      type: item.type,
      ...item.data,
    }));
}

function getCoordinateValue(
  trip: Record<string, unknown>,
  field: "startC" | "endC",
  index: number,
): number | null {
  const coordinates = trip[field];
  if (!Array.isArray(coordinates)) {
    return null;
  }

  const value = coordinates[index];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getEpochIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return new Date(Math.round(value * 1000)).toISOString();
}

function normalizeAddressText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toRoundedKilometers(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Number((value / 1000).toFixed(3));
}
