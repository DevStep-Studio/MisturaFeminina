import { config } from "../app/config";
import { safeRoute } from "./sanitize";
import { createSignal } from "solid-js";

export type AnalyticsConsent = "unknown" | "granted" | "denied";
export const consentStorageKey = "devstep:analytics-consent:v1";
const gtmId = import.meta.env.VITE_GTM_ID?.trim() || "";
export const analyticsEnabled =
  config.analyticsEnabled &&
  /^GTM-[A-Z0-9]+$/.test(gtmId) &&
  (import.meta.env.PROD || import.meta.env.VITE_ANALYTICS_IN_DEV === "true");
const [consent, updateConsent] = createSignal<AnalyticsConsent>("unknown");
export const analyticsConsent = consent;
let initialized = false;
let currentPath = "/";
let lastTrackedPath: string | undefined;

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

function consentCommand(action: "default" | "update", granted: boolean) {
  // Google expects an arguments object for gtag commands in the data layer.
  function gtag(..._args: unknown[]) {
    // Google requires an arguments object for consent commands.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  }
  gtag("consent", action, {
    analytics_storage: granted ? "granted" : "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
}

function loadGtm() {
  if (!analyticsEnabled || consent() !== "granted") return;
  if (document.getElementById("devstep-gtm")) return;
  window.dataLayer ??= [];
  consentCommand("default", false);
  consentCommand("update", true);
  window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
  const script = document.createElement("script");
  script.id = "devstep-gtm";
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${gtmId}`;
  document.head.append(script);
}

export function initializeAnalytics() {
  if (initialized || !analyticsEnabled) return () => {};
  initialized = true;
  try {
    const stored = localStorage.getItem(consentStorageKey);
    if (stored === "granted" || stored === "denied") updateConsent(stored);
  } catch {
    /* Storage can be blocked; consent still works for this session. */
  }
  loadGtm();
  const onStorage = (event: StorageEvent) => {
    if (event.key === consentStorageKey || event.key === null) {
      applyConsent(event.newValue === "granted" ? "granted" : "denied", false);
    }
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

function applyConsent(
  value: Exclude<AnalyticsConsent, "unknown">,
  persist: boolean,
) {
  const wasGranted = consent() === "granted";
  updateConsent(value);
  if (persist) {
    try {
      localStorage.setItem(consentStorageKey, value);
    } catch {
      /* Session only. */
    }
  }
  if (value === "denied") {
    lastTrackedPath = undefined;
    if (wasGranted) {
      if (window.dataLayer) consentCommand("update", false);
      // Reload removes already-executing third-party tags. The saved denial prevents reloading GTM.
      // With blocked storage, a fresh load returns to unknown and is also blocked.
      window.location.reload();
    }
    return;
  }
  loadGtm();
  trackPageView(currentPath);
}

export function setAnalyticsConsent(
  value: Exclude<AnalyticsConsent, "unknown">,
) {
  applyConsent(value, true);
}

/** Send only explicit, non-personal product properties. Nothing is queued before consent. */
export function trackEvent(
  event: string,
  properties: Record<string, string | number | boolean> = {},
) {
  if (!analyticsEnabled || consent() !== "granted") return;
  loadGtm();
  window.dataLayer?.push({ ...properties, event });
}

export function trackPageView(pathname: string) {
  // Do not send queries, hashes or arbitrary unknown URLs that may contain personal data.
  const normalized = pathname.replace(/\/$/, "") || "/";
  currentPath = safeRoute(normalized);
  if (
    !analyticsEnabled ||
    consent() !== "granted" ||
    lastTrackedPath === currentPath
  )
    return;
  lastTrackedPath = currentPath;
  trackEvent("page_view", { page_path: currentPath });
}
