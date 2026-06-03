import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { pushAnalyticsEvent, trackMarketingVisit } from "../lib/analytics";
import {
  captureAttribution,
  getMarketingVisitPayload,
  hasSentMarketingVisit,
  markMarketingVisitSent,
} from "../lib/attribution";

let lastTrackedPath = "";
let lastTrackedAt = 0;

export default function AnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname.startsWith("/admin")) {
      return;
    }

    captureAttribution();

    if (!hasSentMarketingVisit()) {
      const visitPayload = getMarketingVisitPayload();
      if (!visitPayload.trackingCode) {
        void trackMarketingVisit({
          sessionKey: visitPayload.sessionKey,
          landingPage: visitPayload.landingPage,
          attribution: visitPayload.attribution,
        }).finally(() => {
          markMarketingVisitSent();
        });
      } else {
        markMarketingVisitSent();
      }
    }

    const fullPath = `${location.pathname}${location.search}`;
    const now = Date.now();
    if (lastTrackedPath === fullPath && now - lastTrackedAt < 1000) {
      return;
    }

    lastTrackedPath = fullPath;
    lastTrackedAt = now;

    const frameId = window.requestAnimationFrame(() => {
      pushAnalyticsEvent("page_view", {
        page_path: location.pathname,
        page_location: window.location.href,
        page_title: document.title,
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [location.pathname, location.search]);

  return null;
}
