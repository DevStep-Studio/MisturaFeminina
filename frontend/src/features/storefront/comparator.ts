import { createSignal } from "solid-js";
import { ApiError, api } from "../../lib/api";
import type { CompareResponseData, ProductCardData } from "./types";

const STORAGE_KEY = "mf_comparator_items";
export const MAX_COMPARE_ITEMS = 3;

export interface ComparatorEntry {
  id: number;
  slug: string;
  name: string;
  image_url: string | null;
  effective_price_cents: number;
  category_slug: string | null;
  comparison_group: string | null;
  default_variant_id?: number | null;
}

function readStoredEntries(): ComparatorEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_COMPARE_ITEMS) : [];
  } catch {
    return [];
  }
}

function writeStoredEntries(items: ComparatorEntry[]) {
  if (typeof window === "undefined") return;
  try {
    if (items.length === 0) {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }
  } catch {
    // ignore storage quota errors
  }
}

const [items, setItems] = createSignal<ComparatorEntry[]>(readStoredEntries());
const [modalOpen, setModalOpen] = createSignal(false);
const [notice, setNotice] = createSignal<string | null>(null);
const [loading, setLoading] = createSignal(false);
const [matrix, setMatrix] = createSignal<CompareResponseData | null>(null);

export const comparatorStore = {
  items,
  modalOpen,
  notice,
  loading,
  matrix,
};

export function clearComparatorNotice() {
  setNotice(null);
}

export function isProductInComparator(productId: number): boolean {
  return items().some((item) => item.id === productId);
}

export function checkComparatorCompatibility(
  existing: ComparatorEntry[],
  candidate: Pick<ComparatorEntry, "category_slug" | "comparison_group">,
): { compatible: boolean; reason?: string } {
  if (existing.length === 0) return { compatible: true };
  if (existing.length >= MAX_COMPARE_ITEMS) {
    return {
      compatible: false,
      reason: `Você pode comparar até ${MAX_COMPARE_ITEMS} produtos por vez.`,
    };
  }
  const first = existing[0];
  const groupA = first.comparison_group || first.category_slug;
  const groupB = candidate.comparison_group || candidate.category_slug;
  if (groupA && groupB && groupA !== groupB) {
    return {
      compatible: false,
      reason:
        "Compare apenas produtos da mesma categoria ou tipo para uma análise precisa.",
    };
  }
  return { compatible: true };
}

export function toggleComparatorProduct(product: ProductCardData): boolean {
  const current = items();
  if (current.some((item) => item.id === product.id)) {
    const next = current.filter((item) => item.id !== product.id);
    setItems(next);
    writeStoredEntries(next);
    setNotice(null);
    return false;
  }

  const check = checkComparatorCompatibility(current, {
    category_slug: product.category_slug ?? null,
    comparison_group: product.comparison_group ?? null,
  });

  if (!check.compatible) {
    setNotice(check.reason ?? "Produtos incompatíveis para comparação.");
    return false;
  }

  const entry: ComparatorEntry = {
    id: product.id,
    slug: product.slug,
    name: product.name,
    image_url: product.primary_image,
    effective_price_cents: product.effective_price_cents,
    category_slug: product.category_slug ?? null,
    comparison_group: product.comparison_group ?? null,
    default_variant_id: product.default_variant_id ?? null,
  };
  const next = [...current, entry];
  setItems(next);
  writeStoredEntries(next);
  setNotice(null);
  return true;
}

export function removeComparatorProduct(productId: number) {
  const next = items().filter((i) => i.id !== productId);
  setItems(next);
  writeStoredEntries(next);
  setNotice(null);
  if (next.length < 2 && modalOpen()) {
    setModalOpen(false);
  }
}

export function clearComparator() {
  setItems([]);
  writeStoredEntries([]);
  setMatrix(null);
  setModalOpen(false);
  setNotice(null);
}

export async function openComparatorModal(): Promise<void> {
  const current = items();
  if (current.length < 2) {
    setNotice("Selecione ao menos 2 produtos para comparar.");
    return;
  }
  setModalOpen(true);
  setLoading(true);
  setNotice(null);
  try {
    const ids = current.map((i) => i.id).join(",");
    const res = await api<{ data: CompareResponseData }>(
      `/catalog/compare?ids=${encodeURIComponent(ids)}`,
      { authenticated: false },
    );
    setMatrix(res.data);
  } catch (err) {
    setNotice(
      err instanceof ApiError
        ? err.message
        : "Não foi possível carregar o comparativo técnico.",
    );
    setModalOpen(false);
  } finally {
    setLoading(false);
  }
}

export function closeComparatorModal() {
  setModalOpen(false);
}
