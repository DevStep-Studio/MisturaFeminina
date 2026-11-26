import { createSignal } from "solid-js";
import { api } from "../../lib/api";
import { assetUrl } from "../../lib/format";
import { configureDynamicAnalytics } from "../../monitoring/analytics";
import type {
  BannerData,
  BootstrapPayload,
  BrandItem,
  CartSummary,
  CategoryNode,
  StoreSettings,
} from "./types";

const CART_TOKEN_KEY = "mf:cart-token:v1";

const DEFAULT_SETTINGS: StoreSettings = {
  store_name: "Mistura Feminina Cosméticos",
  tagline: "Beleza, autocuidado e alta performance",
  logo_light_url: "/storage/brand/logo-mf.png",
  logo_dark_url: "/storage/brand/logo-mf-dark.png",
  favicon_url: "/storage/brand/favicon.png",
  primary_color: "#93509E",
  primary_hover_color: "#7C3F87",
  secondary_color: "#62298D",
  accent_color: "#93509E",
  font_family: "system-ui",
  cnpj: "00.000.000/0001-00",
  company_legal_name: "Mistura Feminina Cosméticos Ltda.",
  address: "Endereço comercial a definir no backoffice",
  origin_cep: "01001000",
  email: "atendimento@misturafeminina.local",
  phone: "",
  whatsapp_number:
    (typeof import.meta !== "undefined" &&
      (import.meta.env?.VITE_WHATSAPP_NUMBER as string | undefined)) ||
    "",
  whatsapp_default_message:
    "Olá! Gostaria de atendimento sobre um produto da Mistura Feminina Cosméticos.",
  social_instagram: "",
  social_tiktok: "",
  social_youtube: "",
  free_shipping_threshold_cents: 29900,
  max_installments: 6,
  installment_min_value_cents: 2000,
  wholesale_enabled: false,
  maintenance_mode: false,
  benefits_ticker: [
    "Frete grátis acima de R$ 299,00*",
    "Melhores Preços do Mercado",
    "Parcelamento em 6x s/juros",
  ],
  benefits_row: [
    {
      icon: "credit-card",
      title: "Parcelamento",
      subtitle: "Em até 6x sem juros",
    },
    {
      icon: "truck",
      title: "Envios",
      subtitle: "Enviamos para todo Brasil",
    },
    {
      icon: "message-circle",
      title: "Atendimento",
      subtitle: "via WhatsApp",
    },
    {
      icon: "shield-check",
      title: "Site 100% Seguro",
      subtitle: "Selo de segurança",
    },
    {
      icon: "tag",
      title: "Desconto de 10%",
      subtitle: "cupom: PRIMEIRACOMPRA",
    },
  ],
  popup_enabled: true,
  popup_title: "Aproveite e Utilize o cupom ganhe 10% OFF!",
  popup_subtitle: "Confira nossas ofertas e utilize o cupom abaixo:",
  popup_coupon_code: "DESCONTO10",
  seo_default_title: "Mistura Feminina Cosméticos",
  seo_default_description:
    "Cosméticos, esmaltes, skincare, cabelos e acessórios.",
  payment_sandbox_mode: true,
};

export const DEFAULT_MENU_CATEGORIES: CategoryNode[] = [
  { id: 45, name: "Alongamento Unhas", slug: "alongamento-unhas", image_path: null, children: [] },
  { id: 80, name: "Esmalte em Gel", slug: "esmalte-em-gel", image_path: null, children: [] },
  { id: 79, name: "Esmalte", slug: "esmalte", image_path: null, children: [] },
  { id: 67, name: "Cuidados Unhas", slug: "cuidados-unhas", image_path: null, children: [] },
  { id: 6, name: "Maquinários", slug: "maquinarios", image_path: null, children: [] },
  { id: 72, name: "Decoração", slug: "decoracao", image_path: null, children: [] },
  { id: 1, name: "Acessórios", slug: "acessorios", image_path: null, children: [] },
  { id: 12, name: "Kits", slug: "kits", image_path: null, children: [] },
  { id: 95, name: "Cílios e Sobrancelhas", slug: "cilios-e-sobrancelhas", image_path: null, children: [] },
  { id: 104, name: "Depilação", slug: "depilacao", image_path: null, children: [] },
  { id: 112, name: "Descartáveis", slug: "descartaveis", image_path: null, children: [] },
  { id: 119, name: "Higiene e Esterilização", slug: "higiene-e-esterilizacao", image_path: null, children: [] },
];

export const DEFAULT_BRANDS: BrandItem[] = [
  { id: 13, name: "Bella Rosa", slug: "bella-rosa", logo_path: null, is_featured: false },
  { id: 11, name: "Depil Bella", slug: "depil-bella", logo_path: null, is_featured: false },
  { id: 14, name: "Depimiel", slug: "depimiel", logo_path: null, is_featured: false },
  { id: 15, name: "Inoven", slug: "inoven", logo_path: null, is_featured: false },
  { id: 16, name: "Lá Benig", slug: "la-benig", logo_path: null, is_featured: false },
  { id: 19, name: "Lutex", slug: "lutex", logo_path: null, is_featured: false },
  { id: 17, name: "Makiaj", slug: "makiaj", logo_path: null, is_featured: false },
  { id: 18, name: "Q Bella", slug: "q-bella", logo_path: null, is_featured: false },
  { id: 12, name: "Radar", slug: "radar", logo_path: null, is_featured: false },
  { id: 10, name: "Stork", slug: "stork", logo_path: null, is_featured: false },
];

export function readCartToken(): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(CART_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function writeCartToken(token: string | undefined): void {
  if (!token) return;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(CART_TOKEN_KEY, token);
    }
  } catch {
    // ignore storage limits
  }
}

export function cartHeaders(
  extra: Record<string, string> = {},
): Record<string, string> {
  const token = readCartToken();
  return token ? { "X-Cart-Token": token, ...extra } : extra;
}

const [bootstrapData, setBootstrapData] = createSignal<BootstrapPayload>({
  settings: DEFAULT_SETTINGS,
  menu_categories: DEFAULT_MENU_CATEGORIES,
  promo_products: [],
  recommended_products: [],
  brands: DEFAULT_BRANDS,
  footer_pages: [],
  featured_coupon: null,
  banners: [],
});

const [cartData, setCartData] = createSignal<CartSummary | null>(null);
const [cartDrawerOpen, setCartDrawerOpen] = createSignal(false);
const [cartBusy, setCartBusy] = createSignal(false);
const [storefrontLoaded, setStorefrontLoaded] = createSignal(false);

export function applyThemeFromSettings(settings: StoreSettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const legacyPrimary = new Set(["#c22583", "#5949e5", "#ef4eeb"]);
  const primary = settings.primary_color?.trim();
  root.style.setProperty(
    "--mf-primary",
    !primary || legacyPrimary.has(primary.toLowerCase()) ? "#93509E" : primary,
  );
  const primaryHover = settings.primary_hover_color?.trim();
  root.style.setProperty(
    "--mf-primary-hover",
    !primaryHover || primaryHover.toLowerCase() === "#9e1a69"
      ? "#7C3F87"
      : primaryHover,
  );
  if (settings.secondary_color) {
    root.style.setProperty("--mf-secondary", settings.secondary_color);
  }
  const accent = settings.accent_color?.trim();
  root.style.setProperty(
    "--mf-accent",
    !accent || legacyPrimary.has(accent.toLowerCase()) ? "#93509E" : accent,
  );
  if (settings.favicon_url) {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link) {
      link.href = assetUrl(settings.favicon_url);
    }
  }
}

export async function loadStorefrontBootstrap(
  force = false,
): Promise<BootstrapPayload> {
  if (storefrontLoaded() && !force) return bootstrapData();
  try {
    const res = await api<{ data: BootstrapPayload }>("/storefront/bootstrap", {
      authenticated: false,
    });
    if (res?.data) {
      if (res.data.settings) {
        const s = res.data.settings;
        const envWhatsapp = (
          typeof import.meta !== "undefined" &&
          (import.meta.env?.VITE_WHATSAPP_NUMBER as string | undefined)
        ) || "";
        if (s.whatsapp_number === "5511900000000" || s.whatsapp_number === "11900000000") {
          s.whatsapp_number = envWhatsapp;
        } else if (!s.whatsapp_number && envWhatsapp) {
          s.whatsapp_number = envWhatsapp;
        }
        if (s.phone === "(11) 0000-0000") {
          s.phone = "";
        }
      }
      setBootstrapData(res.data);
      applyThemeFromSettings(res.data.settings);
      configureDynamicAnalytics({
        ga4MeasurementId: res.data.settings.ga4_measurement_id,
        gtmId: res.data.settings.gtm_id,
      });
      setStorefrontLoaded(true);
    }
    return bootstrapData();
  } catch {
    return bootstrapData();
  }
}

export async function refreshCart(): Promise<CartSummary | null> {
  try {
    const res = await api<{ data: CartSummary }>("/cart", {
      authenticated: false,
      headers: cartHeaders(),
    });
    if (res?.data) {
      writeCartToken(res.data.token);
      setCartData(res.data);
    }
    return res?.data ?? null;
  } catch {
    return cartData();
  }
}

export async function addCartItem(
  variantId: number,
  quantity = 1,
  openDrawer = true,
): Promise<CartSummary> {
  setCartBusy(true);
  try {
    const res = await api<{ data: CartSummary }>("/cart/items", {
      method: "POST",
      authenticated: false,
      headers: cartHeaders(),
      body: { variant_id: variantId, quantity },
    });
    writeCartToken(res.data.token);
    setCartData(res.data);
    if (openDrawer) setCartDrawerOpen(true);
    return res.data;
  } finally {
    setCartBusy(false);
  }
}

export async function updateCartItemQty(
  itemId: number,
  quantity: number,
): Promise<CartSummary> {
  setCartBusy(true);
  try {
    const res = await api<{ data: CartSummary }>(`/cart/items/${itemId}`, {
      method: "PATCH",
      authenticated: false,
      headers: cartHeaders(),
      body: { quantity },
    });
    writeCartToken(res.data.token);
    setCartData(res.data);
    return res.data;
  } finally {
    setCartBusy(false);
  }
}

export async function removeCartItem(itemId: number): Promise<CartSummary> {
  setCartBusy(true);
  try {
    const res = await api<{ data: CartSummary }>(`/cart/items/${itemId}`, {
      method: "DELETE",
      authenticated: false,
      headers: cartHeaders(),
    });
    writeCartToken(res.data.token);
    setCartData(res.data);
    return res.data;
  } finally {
    setCartBusy(false);
  }
}

export async function applyCartCoupon(code: string): Promise<CartSummary> {
  setCartBusy(true);
  try {
    const res = await api<{ data: CartSummary }>("/cart/coupon", {
      method: "POST",
      authenticated: false,
      headers: cartHeaders(),
      body: { code },
    });
    writeCartToken(res.data.token);
    setCartData(res.data);
    return res.data;
  } finally {
    setCartBusy(false);
  }
}

export async function removeCartCoupon(): Promise<CartSummary> {
  setCartBusy(true);
  try {
    const res = await api<{ data: CartSummary }>("/cart/coupon", {
      method: "DELETE",
      authenticated: false,
      headers: cartHeaders(),
    });
    writeCartToken(res.data.token);
    setCartData(res.data);
    return res.data;
  } finally {
    setCartBusy(false);
  }
}

export async function selectCartShipping(
  quoteId: number,
): Promise<CartSummary> {
  setCartBusy(true);
  try {
    const res = await api<{ data: CartSummary }>("/cart/shipping/select", {
      method: "POST",
      authenticated: false,
      headers: cartHeaders(),
      body: { quote_id: quoteId },
    });
    writeCartToken(res.data.token);
    setCartData(res.data);
    return res.data;
  } finally {
    setCartBusy(false);
  }
}

export async function addBulkCartItems(
  items: Array<{ variant_id: number; quantity: number }>,
  openDrawer = true,
): Promise<{
  cart: CartSummary;
  added: Array<{
    variant_id: number;
    sku: string;
    variant_name: string;
    added_quantity: number;
    cart_quantity: number;
  }>;
  rejected: Array<{
    variant_id: number;
    sku: string;
    variant_name: string;
    requested_quantity: number;
    available_stock: number;
    reason: string;
  }>;
}> {
  setCartBusy(true);
  try {
    const res = await api<{
      data: CartSummary;
      added: Array<{
        variant_id: number;
        sku: string;
        variant_name: string;
        added_quantity: number;
        cart_quantity: number;
      }>;
      rejected: Array<{
        variant_id: number;
        sku: string;
        variant_name: string;
        requested_quantity: number;
        available_stock: number;
        reason: string;
      }>;
    }>("/cart/items/bulk", {
      method: "POST",
      authenticated: false,
      headers: cartHeaders(),
      body: { items },
    });
    writeCartToken(res.data.token);
    setCartData(res.data);
    if (openDrawer && (res.added?.length ?? 0) > 0) {
      setCartDrawerOpen(true);
    }
    return {
      cart: res.data,
      added: res.added || [],
      rejected: res.rejected || [],
    };
  } finally {
    setCartBusy(false);
  }
}

export async function shareCurrentCart(title?: string): Promise<{
  token: string;
  url: string;
  expires_at: string;
}> {
  const res = await api<{
    data: { token: string; url: string; expires_at: string };
  }>("/cart/share", {
    method: "POST",
    authenticated: false,
    headers: cartHeaders(),
    body: title ? { title } : {},
  });
  return res.data;
}

export async function importSharedCart(token: string): Promise<{
  cart: CartSummary;
  added_items: Array<Record<string, unknown>>;
  partial_items: Array<Record<string, unknown>>;
  unavailable_items: Array<Record<string, unknown>>;
}> {
  setCartBusy(true);
  try {
    const res = await api<{
      data: CartSummary;
      added_items: Array<Record<string, unknown>>;
      partial_items: Array<Record<string, unknown>>;
      unavailable_items: Array<Record<string, unknown>>;
    }>(`/cart/shared/${encodeURIComponent(token)}/import`, {
      method: "POST",
      authenticated: false,
      headers: cartHeaders(),
    });
    writeCartToken(res.data.token);
    setCartData(res.data);
    return {
      cart: res.data,
      added_items: res.added_items || [],
      partial_items: res.partial_items || [],
      unavailable_items: res.unavailable_items || [],
    };
  } finally {
    setCartBusy(false);
  }
}

export function findStoreBanner(
  placement: string,
  targetUrl?: string,
): BannerData | null {
  const banners = bootstrapData().banners ?? [];
  if (!banners.length) return null;

  // 1. Prioridade máxima: correspondência exata de targetUrl (ex.: cta_url === '/promocoes' ou '/categorias')
  if (targetUrl) {
    const cleanTarget = targetUrl.split("?")[0].replace(/\/+$/, "") || "/";
    const exactMatch = banners.find(
      (b) =>
        b.cta_url &&
        b.cta_url.split("?")[0].replace(/\/+$/, "") === cleanTarget &&
        (b.placement === placement || b.placement === "category_top"),
    );
    if (exactMatch) return exactMatch;
  }

  // 2. Correspondência por placement específico (ex.: 'category_top', 'promocoes', 'novidades')
  const placementMatch = banners.find((b) => b.placement === placement);
  if (placementMatch) return placementMatch;

  // 3. Fallback para 'category_top' se estiver procurando banner de catálogo/listagem
  if (
    placement.startsWith("category_") ||
    placement === "catalog" ||
    placement === "promocoes"
  ) {
    const catTop = banners.find((b) => b.placement === "category_top");
    if (catTop) return catTop;
  }

  return null;
}

export const storefrontStore = {
  bootstrap: bootstrapData,
  settings: () => bootstrapData().settings,
  cart: cartData,
  setCart: setCartData,
  drawerOpen: cartDrawerOpen,
  setDrawerOpen: setCartDrawerOpen,
  cartBusy,
  findBanner: findStoreBanner,
};
