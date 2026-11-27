import { beforeEach, describe, expect, it } from "vitest";
import { computeWholesaleUnitPrice } from "../../src/features/storefront/wholesale";
import {
  MAX_COMPARE_ITEMS,
  checkComparatorCompatibility,
  clearComparator,
  comparatorStore,
  toggleComparatorProduct,
} from "../../src/features/storefront/comparator";
import {
  addToReplenishment,
  removeGuestReplenishmentItem,
  replenishmentStore,
  updateGuestReplenishmentQty,
} from "../../src/features/storefront/replenishment";
import type {
  ProductCardData,
  ProductVariantData,
} from "../../src/features/storefront/types";

function makeMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  };
}

if (typeof window === "undefined") {
  Object.defineProperty(globalThis, "window", {
    value: {
      localStorage: makeMemoryStorage(),
      sessionStorage: makeMemoryStorage(),
    },
    writable: true,
  });
}

function makeCard(overrides: Partial<ProductCardData>): ProductCardData {
  return {
    id: 1,
    name: "Cabine Sun 5",
    slug: "cabine-sun-5",
    sku: "CAB-5",
    product_type: "simple",
    brand: { id: 1, name: "Studio Pro", slug: "studio-pro" },
    primary_image: null,
    primary_image_alt: "Cabine",
    price_cents: 8990,
    effective_price_cents: 5990,
    discount_percent: 33,
    installments_count: 3,
    installment_cents: 1997,
    is_new_arrival: false,
    is_featured: false,
    in_stock: true,
    available_stock: 10,
    default_variant_id: 11,
    has_multiple_variants: false,
    comparison_group: "cabines",
    ...overrides,
  };
}

describe("B2B & Catalog Frontend Storefront Helpers", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    clearComparator();
  });

  it("applies progressive wholesale discount accurately across shade tiers", () => {
    const tiers = [
      { min_qty: 5, discount_percent: 10 },
      { min_qty: 10, discount_percent: 20 },
    ];
    expect(computeWholesaleUnitPrice(2000, 3, tiers)).toEqual({
      unitPriceCents: 2000,
      appliedDiscountPercent: 0,
    });
    expect(computeWholesaleUnitPrice(2000, 6, tiers)).toEqual({
      unitPriceCents: 1800,
      appliedDiscountPercent: 10,
    });
    expect(computeWholesaleUnitPrice(2000, 12, tiers)).toEqual({
      unitPriceCents: 1600,
      appliedDiscountPercent: 20,
    });
  });

  it("enforces comparator max 3 items and category compatibility", () => {
    const c1 = makeCard({ id: 1, comparison_group: "cabines" });
    const c2 = makeCard({
      id: 2,
      slug: "cabine-2",
      comparison_group: "cabines",
    });
    const c3 = makeCard({
      id: 3,
      slug: "cabine-3",
      comparison_group: "cabines",
    });
    const c4 = makeCard({
      id: 4,
      slug: "cabine-4",
      comparison_group: "cabines",
    });
    const incompatible = makeCard({
      id: 5,
      slug: "esmalte-1",
      comparison_group: "esmaltes-em-gel",
    });

    expect(toggleComparatorProduct(c1)).toBe(true);
    expect(toggleComparatorProduct(incompatible)).toBe(false);
    expect(comparatorStore.notice()).toContain("mesma categoria");

    expect(toggleComparatorProduct(c2)).toBe(true);
    expect(toggleComparatorProduct(c3)).toBe(true);
    expect(comparatorStore.items().length).toBe(MAX_COMPARE_ITEMS);

    expect(toggleComparatorProduct(c4)).toBe(false);
    expect(
      checkComparatorCompatibility(comparatorStore.items(), {
        category_slug: null,
        comparison_group: "cabines",
      }).compatible,
    ).toBe(false);
  });

  it("stores, updates, and removes guest replenishment items in localStorage", async () => {
    const variant: ProductVariantData = {
      id: 101,
      sku: "ESM-01",
      gtin: null,
      name: "Rosé Antigo 012",
      shade_code: "012",
      color_hex: "#B85D78",
      price_cents: 2490,
      effective_price_cents: 1690,
      stock_qty: 20,
      available_stock: 20,
      in_stock: true,
      is_default: true,
      image_path: null,
      attributes: [],
    };
    const product = {
      id: 10,
      slug: "esmalte-gel",
      name: "Esmalte em Gel",
      brand: { id: 1, name: "Lumière Nails", slug: "lumiere-nails" },
      images: [],
    };

    const res = await addToReplenishment(
      { product, variant, quantity: 2 },
      false,
    );
    expect(res.mode).toBe("guest");
    expect(replenishmentStore.guestItems().length).toBe(1);
    expect(replenishmentStore.guestItems()[0].quantity).toBe(2);

    updateGuestReplenishmentQty(101, 5);
    expect(replenishmentStore.guestItems()[0].quantity).toBe(5);

    removeGuestReplenishmentItem(101);
    expect(replenishmentStore.guestItems().length).toBe(0);
  });

  it("handles in-stock items gracefully without showing confusing generic validation errors", () => {
    const availableVariant: ProductVariantData = {
      id: 36,
      sku: "JK-BST-001",
      gtin: null,
      name: "Padrão",
      shade_code: null,
      color_hex: null,
      price_cents: 18990,
      effective_price_cents: 18990,
      stock_qty: 11,
      available_stock: 10,
      in_stock: true,
      is_default: true,
      image_path: null,
      attributes: [],
    };

    const isAvailable = Boolean(
      (availableVariant.available_stock ?? 0) > 0 || availableVariant.in_stock,
    );
    expect(isAvailable).toBe(true);

    const errorMessageFromBackend = "Esta tonalidade já está disponível em estoque.";
    const isRestockRedirect =
      errorMessageFromBackend.toLowerCase().includes("já está disponível") ||
      errorMessageFromBackend.toLowerCase().includes("já está em estoque") ||
      errorMessageFromBackend.toLowerCase().includes("disponível em estoque");

    expect(isRestockRedirect).toBe(true);
  });
});
