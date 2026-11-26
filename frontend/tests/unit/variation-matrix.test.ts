import { describe, expect, it } from "vitest";
import {
  type VariationAttributeDraft,
  buildVariationPersistencePayload,
  computeCartesianCombinationCount,
  generateOrMergeVariationRows,
  mapServerValidationErrorsToVariationRows,
  parseAttributeValuesList,
  reconstructInitialVariationState,
  validateVariationRows,
} from "../../src/features/admin/products/variation-matrix";
import {
  evaluateAxisOptionAvailability,
  getVariantOptionMap,
  resolveSelectedVariant,
} from "../../src/features/storefront/variant-selection";
import type { AdminProductRow } from "../../src/features/admin/products/types";
import type {
  ProductVariationAxis,
  ProductVariantData,
} from "../../src/features/storefront/types";

describe("Optional Variations Domain Matrix Helpers", () => {
  it("parses newline lists and removes accent/case duplicates without splitting decimals", () => {
    const first = parseAttributeValuesList("Nude\nRosé\nVermelho\nrose\nNUDE", []);
    expect(first.addedCount).toBe(3);
    expect(first.duplicatesRemoved).toBe(2);
    expect(first.nextValues.map((v) => v.value)).toEqual([
      "Nude",
      "Rosé",
      "Vermelho",
    ]);

    const second = parseAttributeValuesList("8 ml\n15 ml\n8,5 ml", []);
    expect(second.addedCount).toBe(3);
    expect(second.nextValues.map((v) => v.value)).toEqual([
      "8 ml",
      "15 ml",
      "8,5 ml",
    ]);
  });

  it("generates Cartesian combinations with stock 0 and merges safely on add/rename/reorder", () => {
    const initialAttrs: VariationAttributeDraft[] = [
      {
        uid: "attr_cor",
        name: "Cor",
        slug: "cor",
        display_type: "color_swatch",
        sort_order: 1,
        values: [
          { uid: "val_nude", value: "Nude", slug: "nude", sort_order: 1 },
          { uid: "val_rose", value: "Rosé", slug: "rose", sort_order: 2 },
          { uid: "val_verm", value: "Vermelho", slug: "vermelho", sort_order: 3 },
        ],
      },
      {
        uid: "attr_vol",
        name: "Volume",
        slug: "volume",
        display_type: "pill",
        sort_order: 2,
        values: [
          { uid: "val_8", value: "8 ml", slug: "8-ml", sort_order: 1 },
          { uid: "val_15", value: "15 ml", slug: "15-ml", sort_order: 2 },
        ],
      },
    ];

    expect(computeCartesianCombinationCount(initialAttrs)).toBe(6);

    const rows = generateOrMergeVariationRows({
      attributes: initialAttrs,
      existingRows: [],
      parentSku: "ESM",
      parentPriceCents: 2490,
      parentPromoPriceCents: null,
    });

    expect(rows).toHaveLength(6);
    // Stock must NEVER be multiplied automatically on new combinations
    expect(rows.every((r) => r.stock_qty === 0)).toBe(true);

    // Simulate saved IDs, custom SKUs, different costs & stock on kept 5 combinations, omitting Vermelho 15 ml
    const savedSubset = rows
      .filter((r) => r.name !== "Vermelho · 15 ml")
      .map((r, idx) => ({
        ...r,
        id: 100 + idx,
        sku: r.name === "Rosé · 15 ml" ? "ESM-ROSE-15-CUSTOM" : r.sku,
        stock_qty: 10 + idx,
        cost_cents: r.name === "Rosé · 15 ml" ? 1200 : 850,
        inherits_price: r.name !== "Rosé · 15 ml",
        price_cents: r.name === "Rosé · 15 ml" ? 3990 : 2490,
      }));

    // Scenario 4: add 4th color (Bordô), rename Rosé -> Rosé Gold, reorder Volume (15 ml first)
    const evolvedAttrs: VariationAttributeDraft[] = [
      {
        ...initialAttrs[0]!,
        values: [
          initialAttrs[0]!.values[0]!,
          { ...initialAttrs[0]!.values[1]!, value: "Rosé Gold", slug: "rose-gold" },
          initialAttrs[0]!.values[2]!,
          { uid: "val_bordo", value: "Bordô", slug: "bordo", sort_order: 4 },
        ],
      },
      {
        ...initialAttrs[1]!,
        values: [
          { ...initialAttrs[1]!.values[1]!, sort_order: 1 },
          { ...initialAttrs[1]!.values[0]!, sort_order: 2 },
        ],
      },
    ];

    const merged = generateOrMergeVariationRows({
      attributes: evolvedAttrs,
      existingRows: savedSubset,
      parentSku: "ESM",
      parentPriceCents: 2490,
      parentPromoPriceCents: null,
    });

    // 4 colors x 2 volumes = 8 combinations total
    expect(merged).toHaveLength(8);

    const preservedRose15 = merged.find((r) => r.sku === "ESM-ROSE-15-CUSTOM");
    expect(preservedRose15).toBeDefined();
    expect(preservedRose15?.id).toBe(103);
    expect(preservedRose15?.name).toBe("Rosé Gold · 15 ml");
    expect(preservedRose15?.stock_qty).toBe(13);
    expect(preservedRose15?.cost_cents).toBe(1200);
    expect(preservedRose15?.price_cents).toBe(3990);

    const newBordoRows = merged.filter((r) => r.name.startsWith("Bordô"));
    expect(newBordoRows).toHaveLength(2);
    expect(newBordoRows.every((r) => r.id === undefined && r.stock_qty === 0)).toBe(true);
  });

  it("validates duplicate SKUs/combinations locally and maps backend errors to exact row_key", () => {
    const attrs: VariationAttributeDraft[] = [
      {
        uid: "attr_cor",
        name: "Cor",
        slug: "cor",
        display_type: "color_swatch",
        sort_order: 1,
        values: [
          { uid: "v1", value: "A", slug: "a", sort_order: 1 },
          { uid: "v2", value: "B", slug: "b", sort_order: 2 },
          { uid: "v3", value: "C", slug: "c", sort_order: 3 },
        ],
      },
    ];
    const rows = generateOrMergeVariationRows({
      attributes: attrs,
      existingRows: [],
      parentSku: "DUP",
      parentPriceCents: 5000,
      parentPromoPriceCents: null,
    });

    // Disable middle row (index 1) and force duplicate SKU on rows 0 and 2
    rows[1]!.enabled = false;
    rows[2]!.sku = rows[0]!.sku;
    rows[2]!.inherits_promo_price = false;
    rows[2]!.promo_price_cents = 5500; // invalid >= price

    const validation = validateVariationRows(rows);
    expect(validation.valid).toBe(false);
    expect(validation.rowErrors[rows[2]!.row_key]?.sku).toContain("duplicado");
    expect(validation.rowErrors[rows[2]!.row_key]?.promo).toBeTruthy();

    // Backend indexes persisted rows [row0, row2] -> variant index 1 corresponds to rows[2]!
    const payload = buildVariationPersistencePayload({
      hasVariants: true,
      attributes: attrs,
      rows,
      parentPriceCents: 5000,
      parentPromoPriceCents: null,
      simpleStockQty: 0,
    });
    expect(payload.variants).toHaveLength(2);

    const mapped = mapServerValidationErrorsToVariationRows(
      { "variants.1.sku": ["O SKU DUP-A já está cadastrado em outro item da loja."] },
      rows,
    );
    expect(mapped.byRowKey[rows[2]!.row_key]?.[0]).toContain("outro item da loja");
  });

  it("reconstructs simple, variable, archived, and duplicated states accurately", () => {
    expect(reconstructInitialVariationState(null)).toEqual({
      hasVariants: false,
      attributes: [],
      rows: [],
      legacySimpleStock: 0,
    });

    const simpleProduct: AdminProductRow = {
      id: 10,
      name: "Cabine Sun 5",
      slug: "cabine-sun-5",
      sku: "CAB-01",
      price_cents: 12990,
      promo_price_cents: null,
      weight_grams: 550,
      short_description: null,
      description: null,
      brand_id: 1,
      product_type: "simple",
      has_variants: false,
      is_active: true,
      is_featured: false,
      is_new_arrival: true,
      variants: [
        {
          id: 50,
          sku: "CAB-01",
          name: "Padrão",
          price_cents: 12990,
          stock_qty: 20,
          reserved_qty: 0,
        },
      ],
    };

    const simpleInit = reconstructInitialVariationState(simpleProduct, false);
    expect(simpleInit.hasVariants).toBe(false);
    expect(simpleInit.legacySimpleStock).toBe(20);
    expect(simpleInit.rows).toEqual([]);

    const dupInit = reconstructInitialVariationState(
      {
        ...simpleProduct,
        has_variants: true,
        product_type: "variable",
        variants: [
          {
            id: 51,
            sku: "CAB-BIV",
            name: "Branco",
            price_cents: 12990,
            cost_cents: 6000,
            stock_qty: 12,
            reserved_qty: 0,
          },
        ],
      },
      true,
    );
    expect(dupInit.hasVariants).toBe(true);
    expect(dupInit.rows[0]?.id).toBeUndefined();
    expect(dupInit.rows[0]?.sku).toBe("");
    expect(dupInit.rows[0]?.stock_qty).toBe(0);
    expect(dupInit.rows[0]?.cost_cents).toBe(6000);
  });

  it("preserves variation photos, distinguishes custom vs inherited images and builds persistence payload accurately", () => {
    const rawProduct: AdminProductRow = {
      id: 200,
      name: "Gel Any Lovy",
      slug: "gel-any-lovy",
      sku: "GEL-ANY",
      price_cents: 4990,
      promo_price_cents: null,
      weight_grams: 100,
      short_description: null,
      description: null,
      brand_id: 1,
      is_featured: false,
      is_new_arrival: false,
      has_variants: true,
      product_type: "variable",
      is_active: true,
      variants: [
        {
          id: 301,
          sku: "GEL-ANY-NAT",
          name: "Natural",
          price_cents: 4990,
          stock_qty: 10,
          reserved_qty: 0,
          image_path: "/storage/products/gel-natural.webp",
          inherits_image: false,
        },
        {
          id: 302,
          sku: "GEL-ANY-COV",
          name: "Cover Nude",
          price_cents: 4990,
          stock_qty: 8,
          reserved_qty: 0,
          effective_image_path: "/storage/products/gel-cover.png",
          inherits_image: false,
        },
        {
          id: 303,
          sku: "GEL-ANY-BAS",
          name: "Base",
          price_cents: 4990,
          stock_qty: 5,
          reserved_qty: 0,
          image_path: null,
          inherits_image: true,
        },
      ],
    };

    const state = reconstructInitialVariationState(rawProduct, false);
    expect(state.hasVariants).toBe(true);
    expect(state.rows).toHaveLength(3);

    // Row 1: custom photo Natural
    expect(state.rows[0]?.image_path).toBe("/storage/products/gel-natural.webp");
    expect(state.rows[0]?.inherits_image).toBe(false);

    // Row 2: custom photo Cover Nude from effective_image_path
    expect(state.rows[1]?.image_path).toBe("/storage/products/gel-cover.png");
    expect(state.rows[1]?.inherits_image).toBe(false);

    // Row 3: inherits primary photo
    expect(state.rows[2]?.image_path).toBe("");
    expect(state.rows[2]?.inherits_image).toBe(true);

    // Build persistence payload
    const payload = buildVariationPersistencePayload({
      hasVariants: true,
      attributes: state.attributes,
      rows: state.rows,
      parentPriceCents: 4990,
      parentPromoPriceCents: null,
      simpleStockQty: 0,
    });

    expect(payload.variants).toBeDefined();
    expect(payload.variants).toHaveLength(3);

    // Variant 1 retains image_path
    expect(payload.variants![0]?.image_path).toBe("/storage/products/gel-natural.webp");
    expect(payload.variants![0]?.inherits_image).toBe(false);

    // Variant 3 sends image_path null and inherits_image true
    expect(payload.variants![2]?.image_path).toBeNull();
    expect(payload.variants![2]?.inherits_image).toBe(true);
  });
});

describe("Storefront Variation Axis Selection & Availability", () => {
  const axes: ProductVariationAxis[] = [
    {
      slug: "cor",
      name: "Cor",
      display_type: "color_swatch",
      values: [
        { slug: "nude", value: "Nude", color_hex: "#d9b3a0" },
        { slug: "rose", value: "Rosé", color_hex: "#c97b96" },
        { slug: "vermelho", value: "Vermelho", color_hex: "#b31b2c" },
      ],
    },
    {
      slug: "volume",
      name: "Volume",
      display_type: "pill",
      values: [
        { slug: "8-ml", value: "8 ml" },
        { slug: "15-ml", value: "15 ml" },
      ],
    },
  ];

  const makeVar = (
    id: number,
    cor: string,
    vol: string,
    stock: number,
  ): ProductVariantData => ({
    id,
    sku: `SKU-${id}`,
    gtin: null,
    name: `${cor} · ${vol}`,
    option_values: [
      {
        attribute_slug: "cor",
        attribute_name: "Cor",
        value: cor,
        value_slug: cor.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
      },
      {
        attribute_slug: "volume",
        attribute_name: "Volume",
        value: vol,
        value_slug: vol.toLowerCase().replace(/\s+/g, "-"),
      },
    ],
    price_cents: vol === "15 ml" ? 3990 : 2490,
    effective_price_cents: vol === "15 ml" ? 3990 : 2490,
    stock_qty: stock,
    available_stock: stock,
    in_stock: stock > 0,
    is_default: id === 1,
    image_path: null,
    attributes: [],
  });

  // 5 of 6 combinations sold: "Vermelho · 15 ml" is intentionally NOT sold; "Nude · 15 ml" exists with 0 stock
  const variants: ProductVariantData[] = [
    makeVar(1, "Nude", "8 ml", 10),
    makeVar(2, "Nude", "15 ml", 0),
    makeVar(3, "Rosé", "8 ml", 8),
    makeVar(4, "Rosé", "15 ml", 5),
    makeVar(5, "Vermelho", "8 ml", 6),
  ];

  it("distinguishes matched_in_stock, matched_out_of_stock, and not_sold combinations", () => {
    const rose15 = resolveSelectedVariant(
      axes,
      { cor: "rose", volume: "15-ml" },
      variants,
    );
    expect(rose15.state).toBe("matched_in_stock");
    expect(rose15.variant?.id).toBe(4);

    const nude15 = resolveSelectedVariant(
      axes,
      { cor: "nude", volume: "15-ml" },
      variants,
    );
    expect(nude15.state).toBe("matched_out_of_stock");
    expect(nude15.variant?.id).toBe(2);

    const vermelho15 = resolveSelectedVariant(
      axes,
      { cor: "vermelho", volume: "15-ml" },
      variants,
    );
    expect(vermelho15.state).toBe("not_sold");
    expect(vermelho15.variant).toBeNull();

    expect(
      evaluateAxisOptionAvailability(
        axes,
        { cor: "vermelho", volume: "8-ml" },
        "volume",
        "15-ml",
        variants,
      ),
    ).toBe("not_sold");

    expect(
      evaluateAxisOptionAvailability(
        axes,
        { cor: "nude", volume: "8-ml" },
        "volume",
        "15-ml",
        variants,
      ),
    ).toBe("out_of_stock");

    expect(getVariantOptionMap(variants[0]!)).toEqual({
      cor: "nude",
      volume: "8-ml",
    });
  });
});
