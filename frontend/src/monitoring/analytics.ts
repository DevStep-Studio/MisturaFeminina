import { createSignal } from "solid-js";
import { config } from "../app/config";
import { safeRoute } from "./sanitize";

export type AnalyticsConsent = "unknown" | "granted" | "denied";
export const consentStorageKey = "mf:analytics-consent:v1";
const AUTOMATION_CONSENT_KEY = "devstep:analytics-consent:v1";
const SESSION_ID_KEY = "mf:analytics-sid:v1";
const TRACKED_PURCHASES_KEY = "mf:tracked_purchases:v1";
const TRACKED_REFUNDS_KEY = "mf:tracked_refunds:v1";
const TRACKED_CHECKOUT_KEY = "mf:tracked_begin_checkout:v1";

const PLACEHOLDER_IDS = new Set([
  "G-XXXXXXXXXX",
  "G-0000000000",
  "G-MFEMININA01",
  "GTM-XXXXXXX",
  "GTM-0000000",
]);

const FORBIDDEN_PII_KEYS = new Set([
  "name",
  "customer_name",
  "recipient_name",
  "first_name",
  "last_name",
  "email",
  "customer_email",
  "phone",
  "customer_phone",
  "whatsapp",
  "cpf",
  "cnpj",
  "cpf_cnpj",
  "document",
  "address",
  "shipping_address",
  "street",
  "complement",
  "neighborhood",
  "cep",
  "zipcode",
]);

const FORWARDED_STOREFRONT_EVENTS = new Set([
  "page_view",
  "view_item",
  "add_to_cart",
  "remove_from_cart",
  "view_cart",
  "begin_checkout",
  "add_shipping_info",
  "add_payment_info",
  "purchase",
  "refund",
  "search",
  "contact_click",
  "wholesale_inquiry",
  "restock_alert",
]);

export function isValidGa4MeasurementId(raw?: string | null): boolean {
  const id = (raw ?? "").trim().toUpperCase();
  if (!id || PLACEHOLDER_IDS.has(id)) return false;
  if (/^G-X+$/i.test(id) || /^G-0+$/i.test(id)) return false;
  return /^G-[A-Z0-9]{4,20}$/.test(id);
}

export function isValidGtmId(raw?: string | null): boolean {
  const id = (raw ?? "").trim().toUpperCase();
  if (!id || PLACEHOLDER_IDS.has(id)) return false;
  if (/^GTM-X+$/i.test(id) || /^GTM-0+$/i.test(id)) return false;
  return /^GTM-[A-Z0-9]{4,20}$/.test(id);
}

const envGa4 = import.meta.env.VITE_GA4_MEASUREMENT_ID?.trim() || "";
const envGtm = import.meta.env.VITE_GTM_ID?.trim() || "";

let activeGa4Id = isValidGa4MeasurementId(envGa4) ? envGa4.toUpperCase() : "";
let activeGtmId = isValidGtmId(envGtm) ? envGtm.toUpperCase() : "";

const runtimeAllowed =
  config.analyticsEnabled &&
  (import.meta.env.PROD || import.meta.env.VITE_ANALYTICS_IN_DEV === "true");

const [hasTagSignal, setHasTagSignal] = createSignal<boolean>(
  Boolean(activeGa4Id || activeGtmId),
);
export const hasActiveAnalyticsTag = hasTagSignal;

export const analyticsEnabled = runtimeAllowed;

const [consent, updateConsent] = createSignal<AnalyticsConsent>("unknown");
export const analyticsConsent = consent;

let initialized = false;
let currentPath = "/";
let lastTrackedPath: string | undefined;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export interface Ga4Item {
  item_id: string;
  item_name: string;
  price?: number;
  item_brand?: string;
  item_category?: string;
  quantity?: number;
}

export function mapCartItemsToGa4(
  items: {
    sku: string;
    product_name: string;
    unit_price_cents: number;
    quantity: number;
  }[],
): Ga4Item[] {
  return items.map((it) => ({
    item_id: it.sku,
    item_name: it.product_name,
    price: it.unit_price_cents / 100,
    quantity: it.quantity,
  }));
}

/**
 * Recursively strips any customer PII before dispatching to GA4 / GTM / backend telemetry.
 */
export function sanitizeAnalyticsPayload<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeAnalyticsPayload(item)) as unknown as T;
  }
  if (input && typeof input === "object") {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (FORBIDDEN_PII_KEYS.has(k.toLowerCase())) {
        continue;
      }
      clean[k] = sanitizeAnalyticsPayload(v);
    }
    return clean as T;
  }
  return input;
}

function readStoredConsent(): AnalyticsConsent {
  try {
    if (typeof localStorage === "undefined") return "unknown";
    if (localStorage.getItem(AUTOMATION_CONSENT_KEY) === "denied") {
      return "denied";
    }
    const stored = localStorage.getItem(consentStorageKey);
    if (stored === "granted" || stored === "denied") return stored;
  } catch {
    // ignore storage errors
  }
  return "unknown";
}

function getOrCreateAnonymousSessionId(): string {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      const existing = window.sessionStorage.getItem(SESSION_ID_KEY);
      if (existing) return existing;
      const generated =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `mf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      window.sessionStorage.setItem(SESSION_ID_KEY, generated);
      return generated;
    }
  } catch {
    // ignore storage limits
  }
  return `mf-ephemeral-${Date.now()}`;
}

function ensureGtagFunction() {
  if (typeof window === "undefined") return;
  window.dataLayer ??= [];
  if (!window.gtag) {
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
  }
}

function consentCommand(
  action: "default" | "update",
  settings: {
    analytics_storage: "granted" | "denied";
    ad_storage: "granted" | "denied";
    ad_user_data: "granted" | "denied";
    ad_personalization: "granted" | "denied";
  },
) {
  if (typeof window === "undefined") return;
  ensureGtagFunction();
  window.gtag?.("consent", action, settings);
}

function loadScripts() {
  if (
    typeof document === "undefined" ||
    !runtimeAllowed ||
    consent() === "denied" ||
    (!activeGa4Id && !activeGtmId)
  ) {
    return;
  }

  ensureGtagFunction();

  const isFullGranted = consent() === "granted";

  // Google Consent Mode v2:
  // - unknown (first visit): analytics granted under legitimate interest (aggregated metrics, no PII), ad storage denied.
  // - granted: full consent for analytics and ads.
  // - denied: loadScripts exits early above.
  consentCommand("default", {
    analytics_storage: "granted",
    ad_storage: isFullGranted ? "granted" : "denied",
    ad_user_data: isFullGranted ? "granted" : "denied",
    ad_personalization: isFullGranted ? "granted" : "denied",
  });

  if (activeGa4Id && !document.getElementById("mf-ga4")) {
    const script = document.createElement("script");
    script.id = "mf-ga4";
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${activeGa4Id}`;
    document.head.append(script);

    window.gtag?.("js", new Date());
    window.gtag?.("config", activeGa4Id, {
      send_page_view: false,
      allow_google_signals: false,
      restricted_data_processing: true,
    });
  }

  if (activeGtmId && !document.getElementById("mf-gtm")) {
    window.dataLayer!.push({ "gtm.start": Date.now(), event: "gtm.js" });
    const script = document.createElement("script");
    script.id = "mf-gtm";
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${activeGtmId}`;
    document.head.append(script);
  }
}

/**
 * Allows dynamic GA4 / GTM IDs configured in Admin ("Marketing e Google")
 * to activate on the storefront without requiring a new frontend build.
 */
export function configureDynamicAnalytics(opts: {
  ga4MeasurementId?: string | null;
  gtmId?: string | null;
}): void {
  if (isValidGa4MeasurementId(opts.ga4MeasurementId)) {
    activeGa4Id = opts.ga4MeasurementId!.trim().toUpperCase();
  }
  if (isValidGtmId(opts.gtmId)) {
    activeGtmId = opts.gtmId!.trim().toUpperCase();
  }

  const tagReady = Boolean(activeGa4Id || activeGtmId);
  setHasTagSignal(tagReady);

  if (!initialized && typeof window !== "undefined") {
    updateConsent(readStoredConsent());
  }

  if (tagReady && consent() !== "denied") {
    loadScripts();
    if (!lastTrackedPath) {
      trackPageView(currentPath);
    }
  }
}

export function initializeAnalytics() {
  if (typeof window === "undefined") return () => {};
  updateConsent(readStoredConsent());

  if (initialized) return () => {};
  initialized = true;

  if (consent() === "denied") {
    ensureGtagFunction();
    consentCommand("default", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  } else {
    loadScripts();
  }

  const onStorage = (event: StorageEvent) => {
    if (
      event.key === consentStorageKey ||
      event.key === AUTOMATION_CONSENT_KEY ||
      event.key === null
    ) {
      const next = readStoredConsent();
      if (next === "granted" || next === "denied") {
        applyConsent(next, false);
      }
    }
  };

  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

function applyConsent(
  value: Exclude<AnalyticsConsent, "unknown">,
  persist: boolean,
) {
  const wasDenied = consent() === "denied";
  updateConsent(value);

  if (persist) {
    try {
      localStorage.setItem(consentStorageKey, value);
    } catch {
      /* Session only */
    }
  }

  if (value === "denied") {
    lastTrackedPath = undefined;
    consentCommand("update", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    if (!wasDenied && typeof window !== "undefined") {
      window.location.reload();
    }
    return;
  }

  consentCommand("update", {
    analytics_storage: "granted",
    ad_storage: "granted",
    ad_user_data: "granted",
    ad_personalization: "granted",
  });
  loadScripts();
  trackPageView(currentPath);
}

export function setAnalyticsConsent(
  value: Exclude<AnalyticsConsent, "unknown">,
) {
  applyConsent(value, true);
}

function forwardConsentedStorefrontEvent(
  eventName: string,
  cleanProperties: Record<string, unknown>,
) {
  if (
    typeof window === "undefined" ||
    typeof fetch !== "function" ||
    !runtimeAllowed ||
    consent() === "denied" ||
    !FORWARDED_STOREFRONT_EVENTS.has(eventName)
  ) {
    return;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const body = {
      session_id: getOrCreateAnonymousSessionId(),
      event_name: eventName,
      path: safeRoute(window.location.pathname || currentPath),
      utm_source: params.get("utm_source") || undefined,
      utm_medium: params.get("utm_medium") || undefined,
      utm_campaign: params.get("utm_campaign") || undefined,
      payload: cleanProperties,
    };

    void fetch(`${config.apiUrl.replace(/\/$/, "")}/storefront/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Never disrupt UX on telemetry errors
  }
}

export function trackEvent(
  event: string,
  properties: Record<string, unknown> = {},
) {
  if (!runtimeAllowed || consent() === "denied") return;

  const sanitized = sanitizeAnalyticsPayload(properties);
  loadScripts();

  if (typeof window !== "undefined") {
    if ((activeGa4Id || activeGtmId) && window.gtag) {
      window.gtag("event", event, sanitized);
    } else if (activeGtmId && window.dataLayer) {
      window.dataLayer.push({ ...sanitized, event });
    }
  }

  forwardConsentedStorefrontEvent(event, sanitized);
}

export function trackPageView(pathname: string) {
  const normalized = pathname.replace(/\/$/, "") || "/";
  currentPath = safeRoute(normalized);

  if (
    !runtimeAllowed ||
    consent() === "denied" ||
    lastTrackedPath === currentPath
  ) {
    return;
  }

  lastTrackedPath = currentPath;

  const props = {
    page_path: currentPath,
    page_location:
      typeof window !== "undefined"
        ? `${window.location.origin}${currentPath}`
        : currentPath,
    page_title: typeof document !== "undefined" ? document.title : undefined,
  };

  trackEvent("page_view", props);
}

/** E-commerce GA4: Visualização de detalhes do produto */
export function trackViewItem(params: {
  currency?: string;
  value?: number;
  items: Ga4Item[];
}) {
  trackEvent("view_item", {
    currency: params.currency || "BRL",
    value: params.value,
    items: params.items,
  });
}

/** E-commerce GA4: Adição de produto ao carrinho */
export function trackAddToCart(params: {
  currency?: string;
  value?: number;
  items: Ga4Item[];
}) {
  trackEvent("add_to_cart", {
    currency: params.currency || "BRL",
    value: params.value,
    items: params.items,
  });
}

/** E-commerce GA4: Início do fluxo de checkout (desduplicado por assinatura do carrinho) */
export function trackBeginCheckout(params: {
  currency?: string;
  value?: number;
  items: Ga4Item[];
}) {
  const signature = (params.items || [])
    .map((it) => `${it.item_id}:${it.quantity ?? 1}`)
    .sort()
    .join("|");

  try {
    if (typeof window !== "undefined" && signature) {
      const raw = window.sessionStorage.getItem(TRACKED_CHECKOUT_KEY);
      if (raw) {
        const prev = JSON.parse(raw) as { sig?: string; ts?: number };
        if (
          prev.sig === signature &&
          typeof prev.ts === "number" &&
          Date.now() - prev.ts < 60_000
        ) {
          return;
        }
      }
      window.sessionStorage.setItem(
        TRACKED_CHECKOUT_KEY,
        JSON.stringify({ sig: signature, ts: Date.now() }),
      );
    }
  } catch {
    // ignore storage limits
  }

  trackEvent("begin_checkout", {
    currency: params.currency || "BRL",
    value: params.value,
    items: params.items,
  });
}

/** E-commerce GA4: Compra finalizada com prevenção de duplicidade */
export function trackPurchase(params: {
  transaction_id: string;
  value: number;
  currency?: string;
  tax?: number;
  shipping?: number;
  items: Ga4Item[];
}) {
  if (!params.transaction_id?.trim()) return;

  try {
    if (typeof window !== "undefined") {
      const raw = window.sessionStorage.getItem(TRACKED_PURCHASES_KEY) || "[]";
      const tracked: string[] = JSON.parse(raw);
      if (tracked.includes(params.transaction_id)) {
        return;
      }
      tracked.push(params.transaction_id);
      window.sessionStorage.setItem(
        TRACKED_PURCHASES_KEY,
        JSON.stringify(tracked),
      );
    }
  } catch {
    // ignore storage limitations
  }

  trackEvent("purchase", {
    transaction_id: params.transaction_id,
    value: params.value,
    currency: params.currency || "BRL",
    tax: params.tax || 0,
    shipping: params.shipping || 0,
    items: params.items,
  });
}

/** E-commerce GA4: Reembolso / estorno confirmado com prevenção de duplicidade */
export function trackRefund(params: {
  transaction_id: string;
  value: number;
  currency?: string;
  items?: Ga4Item[];
}) {
  if (!params.transaction_id?.trim()) return;
  const dedupKey = `${params.transaction_id}:${params.value.toFixed(2)}`;

  try {
    if (typeof window !== "undefined") {
      const raw = window.sessionStorage.getItem(TRACKED_REFUNDS_KEY) || "[]";
      const tracked: string[] = JSON.parse(raw);
      if (tracked.includes(dedupKey)) {
        return;
      }
      tracked.push(dedupKey);
      window.sessionStorage.setItem(
        TRACKED_REFUNDS_KEY,
        JSON.stringify(tracked),
      );
    }
  } catch {
    // ignore storage limits
  }

  trackEvent("refund", {
    transaction_id: params.transaction_id,
    value: params.value,
    currency: params.currency || "BRL",
    ...(params.items && params.items.length > 0 ? { items: params.items } : {}),
  });
}

/** E-commerce GA4: Busca interna */
export function trackSearch(search_term: string) {
  if (!search_term.trim()) return;
  trackEvent("search", {
    search_term: search_term.trim(),
  });
}

/** E-commerce GA4: Visualização de lista de itens */
export function trackViewItemList(params: {
  item_list_id?: string;
  item_list_name?: string;
  items: Ga4Item[];
}) {
  trackEvent("view_item_list", {
    item_list_id: params.item_list_id || "catalog",
    item_list_name: params.item_list_name || "Catálogo",
    items: params.items,
  });
}

/** E-commerce GA4: Seleção/clique de item na lista */
export function trackSelectItem(params: {
  item_list_id?: string;
  item_list_name?: string;
  items: Ga4Item[];
}) {
  trackEvent("select_item", {
    item_list_id: params.item_list_id || "catalog",
    item_list_name: params.item_list_name || "Catálogo",
    items: params.items,
  });
}

/** E-commerce GA4: Visualização do carrinho */
export function trackViewCart(params: {
  currency?: string;
  value?: number;
  items: Ga4Item[];
}) {
  trackEvent("view_cart", {
    currency: params.currency || "BRL",
    value: params.value,
    items: params.items,
  });
}

/** E-commerce GA4: Remoção de produto do carrinho */
export function trackRemoveFromCart(params: {
  currency?: string;
  value?: number;
  items: Ga4Item[];
}) {
  trackEvent("remove_from_cart", {
    currency: params.currency || "BRL",
    value: params.value,
    items: params.items,
  });
}

/** E-commerce GA4: Adição de informações de frete */
export function trackAddShippingInfo(params: {
  currency?: string;
  value?: number;
  shipping_tier?: string;
  items: Ga4Item[];
}) {
  trackEvent("add_shipping_info", {
    currency: params.currency || "BRL",
    value: params.value,
    shipping_tier: params.shipping_tier,
    items: params.items,
  });
}

/** E-commerce GA4: Adição de informações de pagamento */
export function trackAddPaymentInfo(params: {
  currency?: string;
  value?: number;
  payment_type?: string;
  items: Ga4Item[];
}) {
  trackEvent("add_payment_info", {
    currency: params.currency || "BRL",
    value: params.value,
    payment_type: params.payment_type,
    items: params.items,
  });
}

/** E-commerce GA4: Visualização de promoção / banner / cupom */
export function trackViewPromotion(params: {
  promotion_id?: string;
  promotion_name?: string;
  creative_name?: string;
}) {
  trackEvent("view_promotion", params);
}

/** E-commerce GA4: Seleção / clique de promoção */
export function selectPromotion(params: {
  promotion_id?: string;
  promotion_name?: string;
  creative_name?: string;
}) {
  trackEvent("select_promotion", params);
}

/** GA4: Cliques em contato / WhatsApp */
export function trackContactClick(channel: "whatsapp" | "email" | "form") {
  trackEvent("contact_click", {
    channel,
  });
}
