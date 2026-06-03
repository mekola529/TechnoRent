type NullableString = string | null | undefined;

export interface AttributionTouchInput {
  utmSource?: NullableString;
  utmMedium?: NullableString;
  utmCampaign?: NullableString;
  utmContent?: NullableString;
  utmTerm?: NullableString;
  gclid?: NullableString;
  fbclid?: NullableString;
  ttclid?: NullableString;
  trackingCode?: NullableString;
  referrer?: NullableString;
  landingPage?: NullableString;
  capturedAt?: NullableString;
}

export interface LeadAttributionInput {
  firstTouch?: AttributionTouchInput | null;
  lastTouch?: AttributionTouchInput | null;
  formPage?: NullableString;
}

export interface NormalizedAttributionTouch {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  gclid: string | null;
  fbclid: string | null;
  ttclid: string | null;
  trackingCode: string | null;
  referrer: string | null;
  landingPage: string | null;
  capturedAt: string | null;
}

export interface NormalizedLeadAttribution {
  firstTouch: NormalizedAttributionTouch | null;
  lastTouch: NormalizedAttributionTouch | null;
  formPage: string | null;
}

export type TrafficSource =
  | "google_ads"
  | "google_organic"
  | "facebook"
  | "instagram"
  | "telegram"
  | "email"
  | "sms"
  | "qr"
  | "referral"
  | "direct"
  | "unknown";

function cleanString(value: NullableString, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function normalizeTouch(input?: AttributionTouchInput | null): NormalizedAttributionTouch | null {
  if (!input || typeof input !== "object") return null;

  const normalized: NormalizedAttributionTouch = {
    utmSource: cleanString(input.utmSource, 120),
    utmMedium: cleanString(input.utmMedium, 120),
    utmCampaign: cleanString(input.utmCampaign, 160),
    utmContent: cleanString(input.utmContent, 160),
    utmTerm: cleanString(input.utmTerm, 160),
    gclid: cleanString(input.gclid, 255),
    fbclid: cleanString(input.fbclid, 255),
    ttclid: cleanString(input.ttclid, 255),
    trackingCode: cleanString(input.trackingCode, 80),
    referrer: cleanString(input.referrer, 1000),
    landingPage: cleanString(input.landingPage, 1000),
    capturedAt: cleanString(input.capturedAt, 80),
  };

  const hasAnyValue = Object.values(normalized).some(Boolean);
  return hasAnyValue ? normalized : null;
}

export function normalizeAttribution(input?: LeadAttributionInput | null): NormalizedLeadAttribution | null {
  if (!input || typeof input !== "object") return null;

  const normalized: NormalizedLeadAttribution = {
    firstTouch: normalizeTouch(input.firstTouch),
    lastTouch: normalizeTouch(input.lastTouch),
    formPage: cleanString(input.formPage, 1000),
  };

  if (!normalized.firstTouch && !normalized.lastTouch && !normalized.formPage) {
    return null;
  }

  return normalized;
}

function includesReferrer(referrer: string | null, needle: string) {
  return Boolean(referrer && referrer.toLowerCase().includes(needle));
}

export function resolveTrafficSource(attribution?: NormalizedLeadAttribution | null): TrafficSource {
  const touch = attribution?.lastTouch ?? attribution?.firstTouch;
  if (!touch) return "direct";

  const source = (touch.utmSource ?? "").toLowerCase();
  const medium = (touch.utmMedium ?? "").toLowerCase();
  const referrer = touch.referrer ?? null;

  if (touch.gclid || (source === "google" && medium === "cpc")) return "google_ads";
  if (source === "google" && medium === "organic") return "google_organic";
  if (source === "instagram" || source === "ig") return "instagram";
  if (source === "facebook" || source === "fb") return "facebook";
  if (source === "telegram" || includesReferrer(referrer, "t.me")) return "telegram";
  if (medium === "email") return "email";
  if (medium === "sms") return "sms";
  if (medium === "qr") return "qr";
  if (referrer) return "referral";
  if (
    source ||
    medium ||
    touch.utmCampaign ||
    touch.fbclid ||
    touch.ttclid ||
    touch.trackingCode
  ) {
    return "unknown";
  }
  return "direct";
}
