import { createSignal } from "solid-js";
import { api } from "../../lib/api";
import { assetUrl } from "../../lib/format";
import type { BootstrapPayload, CartSummary, StoreSettings } from "./types";

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
  phone: "(11) 0000-0000",
  whatsapp_number: "5511900000000",
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
  menu_categories: [],
  promo_products: [],
  recommended_products: [],
  brands: [],
  footer_pages: [],
  featured_coupon: null,
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
      setBootstrapData(res.data);
      applyThemeFromSettings(res.data.settings);
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

export const storefrontStore = {
  bootstrap: bootstrapData,
  settings: () => bootstrapData().settings,
  cart: cartData,
  setCart: setCartData,
  drawerOpen: cartDrawerOpen,
  setDrawerOpen: setCartDrawerOpen,
  cartBusy,
};
