import { pool } from "./db.js";
import type {
  ParsedTrackerNotification,
  TrackerDeviceRow,
  TrackerMessageRow,
  TrackerStopRow,
} from "./tracker.js";
import { hasAddressChanged, resolveEffectiveAddress } from "./tracker.js";

interface PersistTrackerMessageInput {
  telegramChatId: string;
  telegramMessageId: string;
  parsed: ParsedTrackerNotification;
  resolvedAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface PersistTrackerDailyStatInput {
  source: string;
  sourceDeviceId: string;
  deviceName: string;
  statDate: string;
  distanceKm: number;
  drivingDurationMs: number;
  engineHoursMs?: number | null;
  rawPayload?: unknown;
}

interface PersistTrackerStopInput {
  source: string;
  sourceDeviceId: string;
  deviceName: string;
  stopStart: Date;
  stopEnd?: Date | null;
  durationMs?: number;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  startOdometer?: number | null;
  endOdometer?: number | null;
  rawPayload?: unknown;
}

export async function findTrackerDeviceByName(name: string): Promise<TrackerDeviceRow | null> {
  const { rows } = await pool.query<TrackerDeviceRow>(
    `SELECT * FROM "TrackerDevice" WHERE "name" = $1 LIMIT 1`,
    [name],
  );
  return rows[0] ?? null;
}

export async function hasTrackerMessage(
  telegramChatId: string,
  telegramMessageId: string,
): Promise<boolean> {
  const { rows } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS(
      SELECT 1
      FROM "TrackerMessage"
      WHERE "telegramChatId" = $1 AND "telegramMessageId" = $2
    ) AS "exists"`,
    [telegramChatId, telegramMessageId],
  );
  return rows[0]?.exists ?? false;
}

export async function persistTrackerMessage(
  input: PersistTrackerMessageInput,
): Promise<{
  device: TrackerDeviceRow;
  message: TrackerMessageRow;
  effectiveAddress: string | null;
  addressChanged: boolean;
}> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const {
      parsed,
      telegramChatId,
      telegramMessageId,
      resolvedAddress,
      latitude = null,
      longitude = null,
    } = input;
    const existingDevice = await findTrackerDeviceForUpdate(client, parsed.deviceName);
    const effectiveAddress = resolveEffectiveAddress(
      resolvedAddress ?? parsed.parsedAddress,
      existingDevice?.lastAddress ?? null,
    );

    let device: TrackerDeviceRow;

    if (existingDevice) {
      const addressChanged = hasAddressChanged(existingDevice.lastAddress, effectiveAddress);
      const updateResult = await client.query<TrackerDeviceRow>(
        `UPDATE "TrackerDevice"
         SET "lastAddress" = $1,
             "lastLatitude" = $2,
             "lastLongitude" = $3,
             "lastEventText" = $4,
             "lastTrackerAt" = $5,
             "lastTelegramChatId" = $6,
             "lastTelegramMessageId" = $7,
             "updatedAt" = NOW()
         WHERE "id" = $8
         RETURNING *`,
        [
          addressChanged ? effectiveAddress : existingDevice.lastAddress,
          latitude,
          longitude,
          parsed.eventText,
          parsed.trackerTimestamp,
          telegramChatId,
          telegramMessageId,
          existingDevice.id,
        ],
      );
      device = updateResult.rows[0];
    } else {
      const insertResult = await client.query<TrackerDeviceRow>(
        `INSERT INTO "TrackerDevice"
          ("name", "lastAddress", "lastLatitude", "lastLongitude", "lastEventText", "lastTrackerAt", "lastTelegramChatId", "lastTelegramMessageId", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         RETURNING *`,
        [
          parsed.deviceName,
          effectiveAddress,
          latitude,
          longitude,
          parsed.eventText,
          parsed.trackerTimestamp,
          telegramChatId,
          telegramMessageId,
        ],
      );
      device = insertResult.rows[0];
    }

    const messageResult = await client.query<TrackerMessageRow>(
      `INSERT INTO "TrackerMessage"
        ("deviceId", "telegramChatId", "telegramMessageId", "rawText", "eventText", "parsedAddress", "effectiveAddress", "latitude", "longitude", "trackerTimestamp")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT ("telegramChatId", "telegramMessageId")
       DO UPDATE SET
         "deviceId" = EXCLUDED."deviceId",
         "rawText" = EXCLUDED."rawText",
         "eventText" = EXCLUDED."eventText",
         "parsedAddress" = EXCLUDED."parsedAddress",
         "effectiveAddress" = EXCLUDED."effectiveAddress",
         "latitude" = EXCLUDED."latitude",
         "longitude" = EXCLUDED."longitude",
         "trackerTimestamp" = EXCLUDED."trackerTimestamp"
       RETURNING *`,
      [
        device.id,
        telegramChatId,
        telegramMessageId,
        parsed.rawText,
        parsed.eventText,
        parsed.parsedAddress,
        effectiveAddress,
        latitude,
        longitude,
        parsed.trackerTimestamp,
      ],
    );

    await client.query("COMMIT");

    return {
      device,
      message: messageResult.rows[0],
      effectiveAddress,
      addressChanged: hasAddressChanged(existingDevice?.lastAddress ?? null, effectiveAddress),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function persistTrackerDailyStat(
  input: PersistTrackerDailyStatInput,
): Promise<{
  trackerDeviceId: string;
  statDate: string;
  distanceKm: number;
  drivingDurationMs: number;
}> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const trackerDeviceResult = await client.query<{ id: string }>(
      `INSERT INTO "TrackerDevice" ("name", "updatedAt")
       VALUES ($1, NOW())
       ON CONFLICT ("name")
       DO UPDATE SET "updatedAt" = NOW()
       RETURNING "id"`,
      [input.deviceName],
    );

    const trackerDeviceId = trackerDeviceResult.rows[0].id;

    const statResult = await client.query<{
      trackerDeviceId: string;
      statDate: string;
      distanceKm: number;
      drivingDurationMs: number;
    }>(
      `INSERT INTO "TrackerDailyStat"
        ("trackerDeviceId", "source", "sourceDeviceId", "deviceName", "statDate", "distanceKm", "drivingDurationMs", "engineHoursMs", "rawPayload", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, NOW())
       ON CONFLICT ("source", "sourceDeviceId", "statDate")
       DO UPDATE
       SET "trackerDeviceId" = EXCLUDED."trackerDeviceId",
           "deviceName" = EXCLUDED."deviceName",
           "distanceKm" = EXCLUDED."distanceKm",
           "drivingDurationMs" = EXCLUDED."drivingDurationMs",
           "engineHoursMs" = EXCLUDED."engineHoursMs",
           "rawPayload" = EXCLUDED."rawPayload",
           "updatedAt" = NOW()
       RETURNING "trackerDeviceId", "statDate", "distanceKm", "drivingDurationMs"`,
      [
        trackerDeviceId,
        input.source,
        input.sourceDeviceId,
        input.deviceName,
        input.statDate,
        input.distanceKm,
        Math.max(0, Math.round(input.drivingDurationMs)),
        input.engineHoursMs ?? null,
        JSON.stringify(input.rawPayload ?? null),
      ],
    );

    await client.query("COMMIT");

    return statResult.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function persistTrackerStops(inputs: PersistTrackerStopInput[]): Promise<{
  storedCount: number;
}> {
  if (inputs.length === 0) {
    return { storedCount: 0 };
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let storedCount = 0;

    for (const input of inputs) {
      const trackerDeviceResult = await client.query<{ id: string }>(
        `INSERT INTO "TrackerDevice" ("name", "updatedAt")
         VALUES ($1, NOW())
         ON CONFLICT ("name")
         DO UPDATE SET "updatedAt" = NOW()
         RETURNING "id"`,
        [input.deviceName],
      );

      const trackerDeviceId = trackerDeviceResult.rows[0].id;

      await client.query<TrackerStopRow>(
        `INSERT INTO "TrackerStop"
          ("trackerDeviceId", "source", "sourceDeviceId", "deviceName", "stopStart", "stopEnd", "durationMs", "latitude", "longitude", "address", "startOdometer", "endOdometer", "rawPayload", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, NOW())
         ON CONFLICT ("source", "sourceDeviceId", "stopStart")
         DO UPDATE
         SET "trackerDeviceId" = EXCLUDED."trackerDeviceId",
             "deviceName" = EXCLUDED."deviceName",
             "stopEnd" = EXCLUDED."stopEnd",
             "durationMs" = EXCLUDED."durationMs",
             "latitude" = EXCLUDED."latitude",
             "longitude" = EXCLUDED."longitude",
             "address" = EXCLUDED."address",
             "startOdometer" = EXCLUDED."startOdometer",
             "endOdometer" = EXCLUDED."endOdometer",
             "rawPayload" = EXCLUDED."rawPayload",
             "updatedAt" = NOW()`,
        [
          trackerDeviceId,
          input.source,
          input.sourceDeviceId,
          input.deviceName,
          input.stopStart,
          input.stopEnd ?? null,
          Math.max(0, Math.round(input.durationMs ?? 0)),
          input.latitude ?? null,
          input.longitude ?? null,
          input.address ?? null,
          input.startOdometer ?? null,
          input.endOdometer ?? null,
          JSON.stringify(input.rawPayload ?? null),
        ],
      );

      storedCount += 1;
    }

    await client.query("COMMIT");

    return { storedCount };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function replaceTrackerStopsForDay(
  input: {
    source: string;
    sourceDeviceId: string;
    deviceName: string;
    statDate: string;
    timeZone: string;
    stops: PersistTrackerStopInput[];
  },
): Promise<{
  storedCount: number;
  deletedCount: number;
}> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const trackerDeviceResult = await client.query<{ id: string }>(
      `INSERT INTO "TrackerDevice" ("name", "updatedAt")
       VALUES ($1, NOW())
       ON CONFLICT ("name")
       DO UPDATE SET "updatedAt" = NOW()
       RETURNING "id"`,
      [input.deviceName],
    );

    const trackerDeviceId = trackerDeviceResult.rows[0].id;

    const deleteResult = await client.query(
      `DELETE FROM "TrackerStop"
       WHERE "source" = $1
         AND "sourceDeviceId" = $2
         AND ("stopStart" AT TIME ZONE $3)::date = $4::date`,
      [input.source, input.sourceDeviceId, input.timeZone, input.statDate],
    );

    let storedCount = 0;
    for (const stop of input.stops) {
      await client.query<TrackerStopRow>(
        `INSERT INTO "TrackerStop"
          ("trackerDeviceId", "source", "sourceDeviceId", "deviceName", "stopStart", "stopEnd", "durationMs", "latitude", "longitude", "address", "startOdometer", "endOdometer", "rawPayload", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, NOW())`,
        [
          trackerDeviceId,
          stop.source,
          stop.sourceDeviceId,
          stop.deviceName,
          stop.stopStart,
          stop.stopEnd ?? null,
          Math.max(0, Math.round(stop.durationMs ?? 0)),
          stop.latitude ?? null,
          stop.longitude ?? null,
          stop.address ?? null,
          stop.startOdometer ?? null,
          stop.endOdometer ?? null,
          JSON.stringify(stop.rawPayload ?? null),
        ],
      );

      storedCount += 1;
    }

    await client.query("COMMIT");

    return {
      storedCount,
      deletedCount: deleteResult.rowCount ?? 0,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function findTrackerDeviceForUpdate(
  client: { query: typeof pool.query },
  name: string,
): Promise<TrackerDeviceRow | null> {
  const { rows } = await client.query<TrackerDeviceRow>(
    `SELECT *
     FROM "TrackerDevice"
     WHERE "name" = $1
     LIMIT 1
     FOR UPDATE`,
    [name],
  );

  return rows[0] ?? null;
}
