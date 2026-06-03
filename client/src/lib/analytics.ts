declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
    __technorentGtmInitialized?: boolean;
  }
}

function getGtmId() {
  const value = import.meta.env.VITE_GTM_ID;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getApiBase() {
  const value = import.meta.env.VITE_API_URL;
  return typeof value === "string" && value.trim() ? value.trim() : "/api";
}

export function initGtm() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const gtmId = getGtmId();
  if (!gtmId || window.__technorentGtmInitialized) {
    return;
  }

  window.__technorentGtmInitialized = true;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    "gtm.start": Date.now(),
    event: "gtm.js",
  });

  if (!document.querySelector(`script[data-gtm-id="${gtmId}"]`)) {
    const script = document.createElement("script");
    script.async = true;
    script.dataset.gtmId = gtmId;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
    document.head.appendChild(script);
  }
}

export function pushAnalyticsEvent(
  event: string,
  params: Record<string, unknown> = {},
) {
  if (typeof window === "undefined") {
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event,
    ...params,
  });
}

export function trackPhoneClick(params: {
  placement?: string;
  contactTarget?: string;
}) {
  pushAnalyticsEvent("phone_click", {
    placement: params.placement ?? "unknown",
    contact_target: params.contactTarget ?? "main_phone",
    page_path: typeof window !== "undefined" ? window.location.pathname : "",
  });
}

export function trackMessengerClick(params: {
  messenger: "telegram" | "viber" | "whatsapp";
  placement?: string;
}) {
  pushAnalyticsEvent("messenger_click", {
    messenger: params.messenger,
    placement: params.placement ?? "unknown",
    page_path: typeof window !== "undefined" ? window.location.pathname : "",
  });
}

export async function trackMarketingVisit(payload: {
  sessionKey: string;
  landingPage: string;
  attribution: Record<string, unknown>;
}) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    await fetch(`${getApiBase()}/marketing/visit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // ignore transient marketing visit errors
  }
}
