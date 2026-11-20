import { createSignal } from "solid-js";
import { ApiError, api } from "../../lib/api";
import type {
  CartSummary,
  ProductDetailData,
  ProductVariantData,
  ReplenishmentListData,
} from "./types";

const GUEST_STORAGE_KEY = "mf_guest_replenishment_items";

export interface GuestReplenishmentItem {
  variant_id: number;
  product_id: number;
  product_slug: string;
  product_name: string;
  brand_name: string | null;
  variant_name: string;
  shade_code: string | null;
  color_hex: string | null;
  sku: string;
  image_url: string | null;
  unit_price_cents: number;
  original_price_cents: number;
  available_stock: number;
  in_stock: boolean;
  quantity: number;
  added_at: string;
}

export interface AddListToCartFeedback {
  added_items: Array<{
    item_id: number;
    product_name: string;
    variant_name: string;
    added_quantity: number;
  }>;
  partial_items: Array<{
    item_id: number;
    product_name: string;
    variant_name: string;
    desired_quantity: number;
    added_quantity: number;
    available_stock: number;
  }>;
  unavailable_items: Array<{
    item_id: number;
    product_id?: number;
    product_slug?: string;
    variant_id?: number;
    product_name: string;
    variant_name: string;
    sku: string;
    desired_quantity: number;
    reason: string;
  }>;
  added_units_total: number;
  cart: CartSummary;
}

function readGuestItems(): GuestReplenishmentItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(GUEST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeGuestItems(items: GuestReplenishmentItem[]) {
  if (typeof window === "undefined") return;
  try {
    if (items.length === 0) {
      window.localStorage.removeItem(GUEST_STORAGE_KEY);
    } else {
      window.localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(items));
    }
  } catch {
    // ignore storage errors
  }
}

const [lists, setLists] = createSignal<ReplenishmentListData[]>([]);
const [guestItems, setGuestItems] =
  createSignal<GuestReplenishmentItem[]>(readGuestItems());
const [loading, setLoading] = createSignal(false);
const [busy, setBusy] = createSignal(false);

export const replenishmentStore = {
  lists,
  guestItems,
  loading,
  busy,
};

export function totalReplenishmentCount(isLoggedIn: boolean): number {
  if (isLoggedIn) {
    return lists().reduce((acc, list) => acc + list.items.length, 0);
  }
  return guestItems().length;
}

export async function fetchReplenishmentLists(): Promise<
  ReplenishmentListData[]
> {
  setLoading(true);
  try {
    const res = await api<{ data: ReplenishmentListData[] }>(
      "/account/replenishment-lists",
    );
    setLists(res.data || []);
    return res.data || [];
  } finally {
    setLoading(false);
  }
}

export async function syncGuestReplenishmentAfterLogin(): Promise<void> {
  const pending = readGuestItems();
  if (pending.length === 0) {
    await fetchReplenishmentLists().catch(() => []);
    return;
  }
  setBusy(true);
  try {
    await api("/account/replenishment-lists/sync", {
      method: "POST",
      body: {
        items: pending.map((i) => ({
          variant_id: i.variant_id,
          quantity: i.quantity,
        })),
      },
    });
    writeGuestItems([]);
    setGuestItems([]);
    await fetchReplenishmentLists();
  } catch {
    // keep guest copy if sync failed so nothing is lost
  } finally {
    setBusy(false);
  }
}

export async function createReplenishmentList(
  name: string,
  isDefault = false,
): Promise<ReplenishmentListData> {
  setBusy(true);
  try {
    const res = await api<{ data: ReplenishmentListData }>(
      "/account/replenishment-lists",
      {
        method: "POST",
        body: { name, is_default: isDefault },
      },
    );
    await fetchReplenishmentLists();
    return res.data;
  } finally {
    setBusy(false);
  }
}

export async function renameReplenishmentList(
  listId: number,
  payload: { name?: string; is_default?: boolean },
): Promise<void> {
  setBusy(true);
  try {
    await api(`/account/replenishment-lists/${listId}`, {
      method: "PUT",
      body: payload,
    });
    await fetchReplenishmentLists();
  } finally {
    setBusy(false);
  }
}

export async function deleteReplenishmentList(listId: number): Promise<void> {
  setBusy(true);
  try {
    await api(`/account/replenishment-lists/${listId}`, {
      method: "DELETE",
    });
    await fetchReplenishmentLists();
  } finally {
    setBusy(false);
  }
}

export async function addToReplenishment(
  params: {
    product: Pick<
      ProductDetailData,
      "id" | "slug" | "name" | "brand" | "images"
    >;
    variant: ProductVariantData;
    quantity?: number;
    listId?: number;
  },
  isLoggedIn: boolean,
): Promise<{ mode: "account" | "guest" }> {
  const qty = Math.max(1, params.quantity ?? 1);
  if (isLoggedIn) {
    setBusy(true);
    try {
      await api("/account/replenishment-lists/items", {
        method: "POST",
        body: {
          variant_id: params.variant.id,
          quantity: qty,
          list_id: params.listId,
          increment: true,
        },
      });
      await fetchReplenishmentLists();
      return { mode: "account" };
    } finally {
      setBusy(false);
    }
  }

  const current = readGuestItems();
  const existingIdx = current.findIndex(
    (item) => item.variant_id === params.variant.id,
  );
  const primaryImage =
    params.variant.image_path ||
    params.product.images?.find((i) => i.is_primary)?.path ||
    params.product.images?.[0]?.path ||
    null;

  if (existingIdx >= 0) {
    const updated = [...current];
    updated[existingIdx] = {
      ...updated[existingIdx],
      quantity: Math.min(999, updated[existingIdx].quantity + qty),
      unit_price_cents: params.variant.effective_price_cents,
      original_price_cents: params.variant.price_cents,
      available_stock: params.variant.available_stock,
      in_stock: params.variant.in_stock,
    };
    writeGuestItems(updated);
    setGuestItems(updated);
  } else {
    const nextItem: GuestReplenishmentItem = {
      variant_id: params.variant.id,
      product_id: params.product.id,
      product_slug: params.product.slug,
      product_name: params.product.name,
      brand_name: params.product.brand?.name ?? null,
      variant_name: params.variant.name,
      shade_code: params.variant.shade_code ?? null,
      color_hex: params.variant.color_hex ?? null,
      sku: params.variant.sku,
      image_url: primaryImage,
      unit_price_cents: params.variant.effective_price_cents,
      original_price_cents: params.variant.price_cents,
      available_stock: params.variant.available_stock,
      in_stock: params.variant.in_stock,
      quantity: qty,
      added_at: new Date().toISOString(),
    };
    const updated = [nextItem, ...current];
    writeGuestItems(updated);
    setGuestItems(updated);
  }
  return { mode: "guest" };
}

export async function updateReplenishmentItemQty(
  listId: number,
  itemId: number,
  quantity: number,
): Promise<void> {
  setBusy(true);
  try {
    await api(`/account/replenishment-lists/${listId}/items/${itemId}`, {
      method: "PATCH",
      body: { quantity: Math.max(0, quantity) },
    });
    await fetchReplenishmentLists();
  } finally {
    setBusy(false);
  }
}

export async function removeReplenishmentItem(
  listId: number,
  itemId: number,
): Promise<void> {
  setBusy(true);
  try {
    await api(`/account/replenishment-lists/${listId}/items/${itemId}`, {
      method: "DELETE",
    });
    await fetchReplenishmentLists();
  } finally {
    setBusy(false);
  }
}

export function updateGuestReplenishmentQty(
  variantId: number,
  quantity: number,
): void {
  const next =
    quantity <= 0
      ? readGuestItems().filter((i) => i.variant_id !== variantId)
      : readGuestItems().map((i) =>
          i.variant_id === variantId
            ? { ...i, quantity: Math.min(999, quantity) }
            : i,
        );
  writeGuestItems(next);
  setGuestItems(next);
}

export function removeGuestReplenishmentItem(variantId: number): void {
  const next = readGuestItems().filter((i) => i.variant_id !== variantId);
  writeGuestItems(next);
  setGuestItems(next);
}

export async function addReplenishmentListToCart(
  listId: number,
): Promise<AddListToCartFeedback> {
  setBusy(true);
  try {
    const res = await api<{ data: AddListToCartFeedback }>(
      `/account/replenishment-lists/${listId}/add-to-cart`,
      { method: "POST" },
    );
    await fetchReplenishmentLists();
    return res.data;
  } finally {
    setBusy(false);
  }
}

export async function saveCartAsReplenishmentList(
  name?: string,
): Promise<ReplenishmentListData> {
  setBusy(true);
  try {
    const res = await api<{ data: ReplenishmentListData }>(
      "/account/replenishment-lists/from-cart",
      {
        method: "POST",
        body: name ? { name } : {},
      },
    );
    await fetchReplenishmentLists();
    return res.data;
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    throw new Error("Não foi possível salvar a lista de reposição.", {
      cause: err,
    });
  } finally {
    setBusy(false);
  }
}
