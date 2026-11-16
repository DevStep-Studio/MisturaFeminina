import { config } from "../app/config";
import { safeRoute } from "./sanitize";
import { createSignal } from "solid-js";

export type AnalyticsConsent = "unknown" | "granted" | "denied";
export const consentStorageKey = "mf:analytics-consent:v1";
const TRACKED_PURCHASES_KEY = "mf:tracked_purchases:v1";

const ga4Id = import.meta.env.VITE_GA4_MEASUREMENT_ID?.trim() || "";
const gtmId = import.meta.env.VITE_GTM_ID?.trim() || "";

const hasGa4 = /^G-[A-Z0-9]+$/i.test(ga4Id);
const hasGtm = /^GTM-[A-Z0-9]+$/i.test(gtmId);

export const analyticsEnabled =
  config.analyticsEnabled &&
  (hasGa4 || hasGtm) &&
  (import.meta.env.PROD || import.meta.env.VITE_ANALYTICS_IN_DEV === "true");

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

function ensureGtagFunction() {
  window.dataLayer ??= [];
  if (!window.gtag) {
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
  }
}

function consentCommand(action: "default" | "update", granted: boolean) {
  ensureGtagFunction();
  window.gtag!("consent", action, {
    analytics_storage: granted ? "granted" : "denied",
    ad_storage: granted ? "granted" : "denied",
    ad_user_data: granted ? "granted" : "denied",
    ad_personalization: granted ? "granted" : "denied",
  });
}

function loadScripts() {
  if (!analyticsEnabled || consent() !== "granted") return;

  ensureGtagFunction();
  consentCommand("default", false);
  consentCommand("update", true);

  // Load GA4 direct gtag if configured
  if (hasGa4 && !document.getElementById("mf-ga4")) {
    const script = document.createElement("script");
    script.id = "mf-ga4";
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${ga4Id}`;
    document.head.append(script);

    window.gtag!("js", new Date());
    window.gtag!("config", ga4Id, {
      send_page_view: false, // Explicitly tracked on SPA navigation
    });
  }

  // Load GTM if configured
  if (hasGtm && !document.getElementById("mf-gtm")) {
    window.dataLayer!.push({ "gtm.start": Date.now(), event: "gtm.js" });
    const script = document.createElement("script");
    script.id = "mf-gtm";
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${gtmId}`;
    document.head.append(script);
  }
}

export function initializeAnalytics() {
  if (initialized || !analyticsEnabled) return () => {};
  initialized = true;

  try {
    const stored = localStorage.getItem(consentStorageKey);
    if (stored === "granted" || stored === "denied") updateConsent(stored);
  } catch {
    /* Storage can be blocked; consent still works for session */
  }

  loadScripts();

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
      /* Session only */
    }
  }

  if (value === "denied") {
    lastTrackedPath = undefined;
    if (wasGranted) {
      if (window.dataLayer) consentCommand("update", false);
      window.location.reload();
    }
    return;
  }

  loadScripts();
  trackPageView(currentPath);
}

export function setAnalyticsConsent(
  value: Exclude<AnalyticsConsent, "unknown">,
) {
  applyConsent(value, true);
}

export function trackEvent(
  event: string,
  properties: Record<string, unknown> = {},
) {
  if (!analyticsEnabled || consent() !== "granted") return;
  loadScripts();

  if (window.gtag) {
    window.gtag("event", event, properties);
  } else if (window.dataLayer) {
    window.dataLayer.push({ ...properties, event });
  }
}

export function trackPageView(pathname: string) {
  const normalized = pathname.replace(/\/$/, "") || "/";
  currentPath = safeRoute(normalized);

  if (
    !analyticsEnabled ||
    consent() !== "granted" ||
    lastTrackedPath === currentPath
  ) {
    return;
  }

  lastTrackedPath = currentPath;

  if (hasGa4 && window.gtag) {
    window.gtag("event", "page_view", {
      page_path: currentPath,
      page_location: window.location.href,
      page_title: document.title,
    });
  } else {
    trackEvent("page_view", { page_path: currentPath });
  }
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

/** E-commerce GA4: Início do fluxo de checkout */
export function trackBeginCheckout(params: {
  currency?: string;
  value?: number;
  items: Ga4Item[];
}) {
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
  try {
    if (typeof window !== "undefined") {
      const raw = window.sessionStorage.getItem(TRACKED_PURCHASES_KEY) || "[]";
      const tracked: string[] = JSON.parse(raw);
      if (tracked.includes(params.transaction_id)) {
        return; // Already tracked for this session (prevents refresh duplication)
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
