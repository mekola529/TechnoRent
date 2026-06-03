export type TouchAttribution = {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  ttclid?: string | null;
  trackingCode?: string | null;
  referrer?: string | null;
  landingPage?: string | null;
  capturedAt?: string | null;
};

export type LeadAttributionPayload = {
  firstTouch?: TouchAttribution | null;
  lastTouch?: TouchAttribution | null;
  formPage?: string | null;
};

const ATTRIBUTION_FIRST_KEY = "tr_attribution_first";
const ATTRIBUTION_LAST_KEY = "tr_attribution_last";
const MARKETING_VISIT_SESSION_KEY = "tr_marketing_visit_session";
const MARKETING_VISIT_SENT_KEY = "tr_marketing_visit_sent";
const ATTRIBUTION_TTL_DAYS = 30;

function safeStorageGet(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage errors
  }
}

function safeSessionGet(key: string) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // ignore storage errors
  }
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function isExpired(capturedAt?: string | null) {
  if (!capturedAt) {
    return true;
  }

  const timestamp = new Date(capturedAt).getTime();
  if (!Number.isFinite(timestamp)) {
    return true;
  }

  return Date.now() - timestamp > ATTRIBUTION_TTL_DAYS * 24 * 60 * 60 * 1000;
}

function getCurrentPage() {
  return `${window.location.pathname}${window.location.search}`;
}

function normalizeReferrer() {
  const referrer = document.referrer?.trim();
  if (!referrer) {
    return null;
  }

  try {
    const referrerUrl = new URL(referrer);
    if (referrerUrl.host === window.location.host) {
      return null;
    }
    return referrer;
  } catch {
    return referrer;
  }
}

function getTouchSignature(touch: TouchAttribution | null | undefined) {
  if (!touch) {
    return "";
  }

  return JSON.stringify({
    utmSource: touch.utmSource ?? null,
    utmMedium: touch.utmMedium ?? null,
    utmCampaign: touch.utmCampaign ?? null,
    utmContent: touch.utmContent ?? null,
    utmTerm: touch.utmTerm ?? null,
    gclid: touch.gclid ?? null,
    fbclid: touch.fbclid ?? null,
    ttclid: touch.ttclid ?? null,
    trackingCode: touch.trackingCode ?? null,
    referrer: touch.referrer ?? null,
  });
}

function getTouchFromLocation(): TouchAttribution {
  const params = new URLSearchParams(window.location.search);

  return {
    utmSource: params.get("utm_source"),
    utmMedium: params.get("utm_medium"),
    utmCampaign: params.get("utm_campaign"),
    utmContent: params.get("utm_content"),
    utmTerm: params.get("utm_term"),
    gclid: params.get("gclid"),
    fbclid: params.get("fbclid"),
    ttclid: params.get("ttclid"),
    trackingCode: params.get("trid") || params.get("tracking_link_id"),
    referrer: normalizeReferrer(),
    landingPage: getCurrentPage(),
    capturedAt: new Date().toISOString(),
  };
}

function hasCampaignSignal(touch: TouchAttribution) {
  return Boolean(
    touch.utmSource ||
    touch.utmMedium ||
    touch.utmCampaign ||
    touch.utmContent ||
    touch.utmTerm ||
    touch.gclid ||
    touch.fbclid ||
    touch.ttclid ||
    touch.trackingCode,
  );
}

export function captureAttribution() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const touch = getTouchFromLocation();
  const hasSignals = hasCampaignSignal(touch) || Boolean(touch.referrer);
  const existingFirst = safeJsonParse<TouchAttribution>(safeStorageGet(ATTRIBUTION_FIRST_KEY));
  const existingLast = safeJsonParse<TouchAttribution>(safeStorageGet(ATTRIBUTION_LAST_KEY));
  if (!hasSignals) {
    if (!existingFirst || isExpired(existingFirst.capturedAt)) {
      safeStorageSet(ATTRIBUTION_FIRST_KEY, JSON.stringify(touch));
    }
    if (!existingLast || isExpired(existingLast.capturedAt)) {
      safeStorageSet(ATTRIBUTION_LAST_KEY, JSON.stringify(touch));
    }
    return;
  }

  const nextSignature = getTouchSignature(touch);
  const lastSignature = getTouchSignature(existingLast);

  if (!existingFirst || isExpired(existingFirst.capturedAt)) {
    safeStorageSet(ATTRIBUTION_FIRST_KEY, JSON.stringify(touch));
  }

  if (hasCampaignSignal(touch) || nextSignature !== lastSignature) {
    safeStorageSet(ATTRIBUTION_LAST_KEY, JSON.stringify(touch));
  }
}

export function getLeadAttributionPayload(): LeadAttributionPayload {
  if (typeof window === "undefined") {
    return {};
  }

  return {
    firstTouch: safeJsonParse<TouchAttribution>(safeStorageGet(ATTRIBUTION_FIRST_KEY)),
    lastTouch: safeJsonParse<TouchAttribution>(safeStorageGet(ATTRIBUTION_LAST_KEY)),
    formPage: getCurrentPage(),
  };
}

function getOrCreateMarketingVisitSessionKey() {
  const existing = safeSessionGet(MARKETING_VISIT_SESSION_KEY);
  if (existing) {
    return existing;
  }

  const next =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `visit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  safeSessionSet(MARKETING_VISIT_SESSION_KEY, next);
  return next;
}

export function hasSentMarketingVisit() {
  return safeSessionGet(MARKETING_VISIT_SENT_KEY) === "1";
}

export function markMarketingVisitSent() {
  safeSessionSet(MARKETING_VISIT_SENT_KEY, "1");
}

export function getMarketingVisitPayload() {
  const attribution = getLeadAttributionPayload();
  const touch = attribution.lastTouch ?? attribution.firstTouch ?? getTouchFromLocation();
  const trackingCode = touch?.trackingCode ?? null;

  return {
    sessionKey: getOrCreateMarketingVisitSessionKey(),
    landingPage: touch?.landingPage ?? getCurrentPage(),
    trackingCode,
    attribution,
  };
}
