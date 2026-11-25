import { describe, expect, it } from "vitest";
import {
  type AdminProductRow,
  countActiveCatalogFilters,
  formatBrlFromCents,
  formatProductPriceRange,
  makeIdempotencyKey,
  parseBrlInputToCents,
} from "../../src/features/admin/products/types";

describe("catalog redesign helpers", () => {
  it("formata intervalos de preco para produtos simples e multi-variacoes", () => {
    const simple: AdminProductRow = {
      id: 1,
      name: "Top Coat",
      slug: "top-coat",
      sku: "TC-01",
      price_cents: 2990,
      promo_price_cents: 2490,
      weight_grams: 120,
      short_description: null,
      description: null,
      brand_id: null,
      is_active: true,
      is_featured: false,
      is_new_arrival: false,
    };
    expect(formatProductPriceRange(simple)).toEqual({
      primary: formatBrlFromCents(2490),
      secondary: `De ${formatBrlFromCents(2990)}`,
    });

    const multi: AdminProductRow = {
      ...simple,
      variants_summary: {
        count: 6,
        is_multi_variant: true,
        price_min_cents: 1990,
        price_max_cents: 2690,
        effective_min_cents: 1890,
        effective_max_cents: 2690,
        total_stock: 40,
        total_reserved: 2,
        total_available: 38,
        out_of_stock_count: 1,
        has_promo: true,
      },
    };
    expect(formatProductPriceRange(multi)).toEqual({
      primary: `${formatBrlFromCents(1890)} – ${formatBrlFromCents(2690)}`,
      secondary: "Inclui promo em variações",
    });
  });

  it("interpreta entrada monetaria brasileira e conta filtros ativos", () => {
    expect(parseBrlInputToCents("R$ 1.249,90")).toBe(124990);
    expect(parseBrlInputToCents("0")).toBe(-1);

    expect(
      countActiveCatalogFilters({
        search: "esmalte",
        brand_id: "3",
        category_id: "",
        status: "inactive",
        availability: "all",
        sort: "newest",
        filter: "",
        page: 1,
      }),
    ).toBe(2);

    const k1 = makeIdempotencyKey("bulk");
    const k2 = makeIdempotencyKey("bulk");
    expect(k1).not.toBe(k2);
  });
});
