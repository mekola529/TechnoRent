export interface ParsedTrackerNotification {
  eventText: string;
  trackerTimestamp: Date;
  deviceName: string;
  parsedAddress: string | null;
  rawText: string;
}

export interface TrackerDeviceRow {
  id: string;
  name: string;
  lastAddress: string | null;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastEventText: string | null;
  lastTrackerAt: Date | null;
  lastTelegramChatId: string | null;
  lastTelegramMessageId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TrackerMessageRow {
  id: string;
  deviceId: string;
  telegramChatId: string;
  telegramMessageId: string;
  rawText: string;
  eventText: string;
  parsedAddress: string | null;
  effectiveAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  trackerTimestamp: Date | null;
  createdAt: Date;
}

export interface TrackerStopRow {
  id: string;
  trackerDeviceId: string | null;
  source: string;
  sourceDeviceId: string;
  deviceName: string;
  stopStart: Date;
  stopEnd: Date | null;
  durationMs: string;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  startOdometer: number | null;
  endOdometer: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const TIMESTAMP_RE = /^(.*)\s+(\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}:\d{2})$/;
const DEVICE_RE = /^Пристрій\s+(.+)$/i;
const ADDRESS_RE = /^Адреса:\s*(.*)$/i;

export function parseTrackerNotification(rawText: string): ParsedTrackerNotification | null {
  const normalized = rawText
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (normalized.length < 3) return null;

  const firstLine = normalized[0];
  const deviceLine = normalized[1];
  const addressLine = normalized[2];

  const firstMatch = TIMESTAMP_RE.exec(firstLine);
  const deviceMatch = DEVICE_RE.exec(deviceLine);
  const addressMatch = ADDRESS_RE.exec(addressLine);

  if (!firstMatch || !deviceMatch || !addressMatch) {
    return null;
  }

  const trackerTimestamp = parseTrackerTimestamp(firstMatch[2]);
  if (!trackerTimestamp) {
    return null;
  }

  const eventText = firstMatch[1].trim();
  const deviceName = deviceMatch[1].trim();
  const parsedAddress = normalizeAddress(addressMatch[1]);

  if (!eventText || !deviceName) {
    return null;
  }

  return {
    eventText,
    trackerTimestamp,
    deviceName,
    parsedAddress,
    rawText,
  };
}

export function resolveEffectiveAddress(
  parsedAddress: string | null,
  previousAddress: string | null,
): string | null {
  return parsedAddress ?? previousAddress ?? null;
}

export function hasAddressChanged(
  previousAddress: string | null,
  nextAddress: string | null,
): boolean {
  return normalizeAddress(previousAddress) !== normalizeAddress(nextAddress);
}

function parseTrackerTimestamp(value: string): Date | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const [, day, month, year, hour, minute, second] = match;
  const parsed = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
