import type { AdminProductRow, AdminVariantRow } from "./types";

export interface VariationOptionValueDraft {
  uid: string;
  value_id?: number;
  value: string;
  slug: string;
  color_hex?: string | null;
  sort_order: number;
}

export interface VariationAttributeDraft {
  uid: string;
  attribute_id?: number;
  name: string;
  slug: string;
  display_type: "color_swatch" | "pill";
  sort_order: number;
  values: VariationOptionValueDraft[];
}

export interface VariantOptionPair {
  uid: string;
  value_id?: number;
  attribute_slug: string;
  attribute_name: string;
  value: string;
  value_slug: string;
  color_hex?: string | null;
}

export interface VariationRowDraft {
  row_key: string;
  id?: number;
  enabled: boolean;
  is_archived: boolean;
  archived_at?: string | null;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
  name: string;
  option_values: VariantOptionPair[];
  sku: string;
  gtin: string;
  supplier_code?: string;
  shade_code: string;
  color_family: string;
  color_hex: string;
  price_cents: number;
  inherits_price: boolean;
  promo_price_cents: number | null;
  inherits_promo_price: boolean;
  cost_cents: number | null;
  stock_qty: number;
  reserved_qty: number;
  weight_grams: number | null;
  inherits_weight: boolean;
  image_path: string;
  inherits_image: boolean;
  links?: {
    orders_count: number;
    movements_count: number;
    receipts_count?: number;
    can_delete: boolean;
  };
}

export interface VariationPresetTemplate {
  slug: string;
  name: string;
  display_type: "color_swatch" | "pill";
  placeholder: string;
}

export const STANDARD_VARIATION_PRESETS: VariationPresetTemplate[] = [
  { slug: "cor", name: "Cor", display_type: "color_swatch", placeholder: "Ex.: Nude, Rosé, Vermelho" },
  { slug: "tamanho", name: "Tamanho", display_type: "pill", placeholder: "Ex.: P, M, G" },
  { slug: "peso", name: "Peso", display_type: "pill", placeholder: "Ex.: 15g, 30g, 50g" },
  { slug: "volume", name: "Volume", display_type: "pill", placeholder: "Ex.: 8 ml, 15 ml" },
  { slug: "acabamento", name: "Acabamento", display_type: "pill", placeholder: "Ex.: Cremoso, Glitter" },
  { slug: "modelo", name: "Modelo", display_type: "pill", placeholder: "Ex.: Clássico, Slim" },
];

export function normalizeSlug(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function makeStableUid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function buildUidTupleKey(pairs: VariantOptionPair[]): string {
  return pairs
    .map((p) => `${p.attribute_slug}:${p.uid}`)
    .sort()
    .join("|");
}

export function buildSignatureKey(pairs: VariantOptionPair[]): string {
  return pairs
    .map((p) => `${normalizeSlug(p.attribute_slug)}=${normalizeSlug(p.value_slug || p.value)}`)
    .sort()
    .join("|");
}

/**
 * Parses individual or newline/list-pasted option values while removing duplicates case/accent-insensitively.
 */
export function parseAttributeValuesList(
  rawText: string,
  existingValues: VariationOptionValueDraft[],
): {
  nextValues: VariationOptionValueDraft[];
  addedCount: number;
  duplicatesRemoved: number;
} {
  const lines = rawText.includes("\n")
    ? rawText.split(/\r?\n/)
    : rawText.split(/[;\n]+/);

  const tokens: string[] = [];
  for (const segment of lines) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    // Allow pasting comma-separated values like "Nude, Rosé, Vermelho" without breaking "8,5 ml"
    if (trimmed.includes(",") && !/\d,\d/.test(trimmed)) {
      for (const piece of trimmed.split(",")) {
        const clean = piece.trim();
        if (clean) tokens.push(clean);
      }
    } else {
      tokens.push(trimmed);
    }
  }

  const next = [...existingValues];
  const seen = new Set(existingValues.map((v) => normalizeSlug(v.value)));
  let addedCount = 0;
  let duplicatesRemoved = 0;

  for (const label of tokens) {
    const slug = normalizeSlug(label);
    if (!slug) continue;
    if (seen.has(slug)) {
      duplicatesRemoved++;
      continue;
    }
    seen.add(slug);
    next.push({
      uid: makeStableUid("val"),
      value: label,
      slug,
      color_hex: null,
      sort_order: next.length + 1,
    });
    addedCount++;
  }

  return { nextValues: next, addedCount, duplicatesRemoved };
}

export function computeCartesianCombinationCount(
  attributes: VariationAttributeDraft[],
): number {
  const populated = attributes.filter((a) => a.values.length > 0);
  if (populated.length === 0) return 0;
  return populated.reduce((acc, a) => acc * a.values.length, 1);
}

function suggestCombinationSku(
  parentSku: string,
  pairs: VariantOptionPair[],
  usedSkus: Set<string>,
): string {
  const base = (parentSku || "PROD").trim().toUpperCase();
  const suffixParts = pairs.map((p) =>
    normalizeSlug(p.value)
      .replace(/-/g, "")
      .slice(0, 4)
      .toUpperCase(),
  );
  const candidateBase = suffixParts.filter(Boolean).length > 0
    ? `${base}-${suffixParts.filter(Boolean).join("-")}`
    : base;
  let candidate = candidateBase;
  let n = 2;
  while (usedSkus.has(candidate)) {
    candidate = `${candidateBase}-${n}`;
    n++;
  }
  usedSkus.add(candidate);
  return candidate;
}

export function generateOrMergeVariationRows(params: {
  attributes: VariationAttributeDraft[];
  existingRows: VariationRowDraft[];
  parentSku: string;
  parentPriceCents: number;
  parentPromoPriceCents: number | null;
}): VariationRowDraft[] {
  const activeAttrs = params.attributes.filter((a) => a.values.length > 0);
  if (activeAttrs.length === 0) {
    return params.existingRows.filter((r) => r.is_archived);
  }

  // Cartesian product respecting current attribute & value order
  let combos: VariantOptionPair[][] = [[]];
  for (const attr of activeAttrs) {
    const nextCombos: VariantOptionPair[][] = [];
    for (const prev of combos) {
      for (const val of attr.values) {
        nextCombos.push([
          ...prev,
          {
            uid: val.uid,
            value_id: val.value_id,
            attribute_slug: attr.slug,
            attribute_name: attr.name,
            value: val.value,
            value_slug: normalizeSlug(val.value) || val.slug,
            color_hex: val.color_hex ?? null,
          },
        ]);
      }
    }
    combos = nextCombos;
  }

  const archivedRows = params.existingRows.filter((r) => r.is_archived);
  const activeExisting = params.existingRows.filter((r) => !r.is_archived);

  const byUidKey = new Map<string, VariationRowDraft>();
  const bySigKey = new Map<string, VariationRowDraft>();
  const usedSkus = new Set<string>();

  for (const row of params.existingRows) {
    if (row.sku.trim()) usedSkus.add(row.sku.trim().toUpperCase());
    if (row.is_archived) continue;
    if (row.option_values.length > 0) {
      byUidKey.set(buildUidTupleKey(row.option_values), row);
      bySigKey.set(buildSignatureKey(row.option_values), row);
    }
  }

  const usedExistingKeys = new Set<string>();
  const merged: VariationRowDraft[] = [];

  combos.forEach((pairs, idx) => {
    const uidKey = buildUidTupleKey(pairs);
    const sigKey = buildSignatureKey(pairs);
    const matched = byUidKey.get(uidKey) ?? bySigKey.get(sigKey) ?? null;
    if (matched) usedExistingKeys.add(matched.row_key);

    const displayName = pairs.map((p) => p.value).join(" · ");
    const firstHex = pairs.find((p) => p.color_hex)?.color_hex ?? matched?.color_hex ?? "";

    if (matched) {
      merged.push({
        ...matched,
        name: displayName,
        option_values: pairs,
        color_hex: firstHex,
        sort_order: idx,
        price_cents: matched.inherits_price ? params.parentPriceCents : matched.price_cents,
        promo_price_cents: matched.inherits_promo_price
          ? params.parentPromoPriceCents
          : matched.promo_price_cents,
      });
    } else {
      const sku = suggestCombinationSku(params.parentSku, pairs, usedSkus);
      merged.push({
        row_key: makeStableUid("var"),
        enabled: true,
        is_archived: false,
        archived_at: null,
        is_active: true,
        is_default: idx === 0 && activeExisting.length === 0,
        sort_order: idx,
        name: displayName,
        option_values: pairs,
        sku,
        gtin: "",
        shade_code: "",
        color_family: "",
        color_hex: firstHex,
        price_cents: params.parentPriceCents,
        inherits_price: true,
        promo_price_cents: params.parentPromoPriceCents,
        inherits_promo_price: true,
        cost_cents: null,
        stock_qty: 0, // Never multiply parent stock
        reserved_qty: 0,
        weight_grams: null,
        inherits_weight: true,
        image_path: "",
        inherits_image: true,
      });
    }
  });

  // Preserve saved variants with order/movement history if temporarily omitted after axis change
  for (const leftover of activeExisting) {
    if (usedExistingKeys.has(leftover.row_key)) continue;
    if (leftover.id && (leftover.stock_qty > 0 || (leftover.links && !leftover.links.can_delete))) {
      merged.push({
        ...leftover,
        enabled: false,
        is_archived: true,
        is_active: false,
        sort_order: merged.length,
      });
    }
  }

  return [...merged, ...archivedRows];
}

export interface VariationRowErrorMap {
  sku?: string;
  combination?: string;
  promo?: string;
  name?: string;
}

export function validateVariationRows(rows: VariationRowDraft[]): {
  valid: boolean;
  rowErrors: Record<string, VariationRowErrorMap>;
  summaryMessage: string | null;
} {
  const rowErrors: Record<string, VariationRowErrorMap> = {};
  const enabledRows = rows.filter((r) => r.enabled && !r.is_archived);
  const skuOwner = new Map<string, number>();
  const sigOwner = new Map<string, number>();

  enabledRows.forEach((row, idx) => {
    const errs: VariationRowErrorMap = {};
    const upperSku = row.sku.trim().toUpperCase();
    if (!upperSku) {
      errs.sku = "SKU obrigatório.";
    } else if (skuOwner.has(upperSku)) {
      const first = skuOwner.get(upperSku)!;
      errs.sku = `SKU ${upperSku} duplicado (já na linha #${first + 1}).`;
    } else {
      skuOwner.set(upperSku, idx);
    }

    if (!row.name.trim()) {
      errs.name = "Nome da combinação obrigatório.";
    }

    const sig =
      row.option_values.length > 0
        ? buildSignatureKey(row.option_values)
        : normalizeSlug(row.name);
    if (sig && sigOwner.has(sig)) {
      const first = sigOwner.get(sig)!;
      errs.combination = `Combinação repetida (linha #${first + 1}).`;
    } else if (sig) {
      sigOwner.set(sig, idx);
    }

    if (
      !row.inherits_promo_price &&
      row.promo_price_cents !== null &&
      row.promo_price_cents > 0 &&
      row.promo_price_cents >= row.price_cents
    ) {
      errs.promo = "Promocional deve ser menor que o preço de venda.";
    }

    if (Object.keys(errs).length > 0) {
      rowErrors[row.row_key] = errs;
    }
  });

  const errorCount = Object.keys(rowErrors).length;
  return {
    valid: errorCount === 0,
    rowErrors,
    summaryMessage:
      errorCount > 0
        ? `Revise ${errorCount} combinação(ões) destacada(s) na grade (SKU duplicado, combinação repetida ou campo inválido).`
        : null,
  };
}

export function reconstructInitialVariationState(product: AdminProductRow | null, isDuplicate = false): {
  hasVariants: boolean;
  attributes: VariationAttributeDraft[];
  rows: VariationRowDraft[];
  legacySimpleStock: number;
} {
  if (!product) {
    return {
      hasVariants: false,
      attributes: [],
      rows: [],
      legacySimpleStock: 0,
    };
  }

  const allVars: AdminVariantRow[] = product.variants ?? [];
  const activeVars = allVars.filter((v) => !v.is_archived && !v.archived_at);
  const firstActive = activeVars[0] ?? allVars[0];
  const looksSimple =
    product.has_variants === false &&
    product.product_type !== "variable" &&
    activeVars.length <= 1 &&
    (!firstActive ||
      (firstActive.name === "Padrão" &&
        (!firstActive.option_values || firstActive.option_values.length === 0) &&
        (!firstActive.attribute_values || firstActive.attribute_values.length === 0)));

  const hasVariantsExplicit =
    Boolean(product.has_variants) ||
    product.product_type === "variable" ||
    activeVars.length > 1 ||
    (activeVars.length === 1 &&
      ((activeVars[0].option_values?.length ?? 0) > 0 ||
        (activeVars[0].attribute_values?.length ?? 0) > 0 ||
        (activeVars[0].name !== "" && activeVars[0].name !== "Padrão")));

  if (looksSimple || !hasVariantsExplicit) {
    return {
      hasVariants: false,
      attributes: [],
      rows: [],
      legacySimpleStock: isDuplicate ? 0 : (firstActive?.stock_qty ?? 0),
    };
  }

  // Reconstruct attributes from stored variation_attributes or variant option_values / legacy shades
  const attrMap = new Map<string, VariationAttributeDraft>();
  const storedAttrs = product.variation_attributes ?? [];

  for (const [aIdx, a] of storedAttrs.entries()) {
    const slug = a.slug || normalizeSlug(a.name);
    attrMap.set(slug, {
      uid: makeStableUid("attr"),
      attribute_id: a.attribute_id,
      name: a.name,
      slug,
      display_type: (a.display_type as "color_swatch" | "pill") || (slug === "cor" ? "color_swatch" : "pill"),
      sort_order: a.sort_order ?? aIdx + 1,
      values: (a.values ?? []).map((v, vIdx) => ({
        uid: v.uid || makeStableUid("val"),
        value_id: v.value_id,
        value: v.value,
        slug: v.slug || normalizeSlug(v.value),
        color_hex: v.color_hex ?? null,
        sort_order: v.sort_order ?? vIdx + 1,
      })),
    });
  }

  const rows: VariationRowDraft[] = [];

  allVars.forEach((v, idx) => {
    const isArchived = Boolean(v.is_archived || v.archived_at);
    let pairs: VariantOptionPair[] = [];

    if (v.option_values && v.option_values.length > 0) {
      pairs = v.option_values.map((ov) => {
        const aSlug = ov.attribute_slug || normalizeSlug(ov.attribute_name);
        if (!attrMap.has(aSlug)) {
          attrMap.set(aSlug, {
            uid: makeStableUid("attr"),
            attribute_id: ov.attribute_id,
            name: ov.attribute_name,
            slug: aSlug,
            display_type: aSlug === "cor" ? "color_swatch" : "pill",
            sort_order: attrMap.size + 1,
            values: [],
          });
        }
        const attrEntry = attrMap.get(aSlug)!;
        const vSlug = ov.value_slug || normalizeSlug(ov.value);
        let valEntry = attrEntry.values.find(
          (val) => (ov.uid && val.uid === ov.uid) || val.slug === vSlug,
        );
        if (!valEntry) {
          valEntry = {
            uid: ov.uid || makeStableUid("val"),
            value_id: ov.value_id,
            value: ov.value,
            slug: vSlug,
            color_hex: ov.color_hex ?? null,
            sort_order: attrEntry.values.length + 1,
          };
          attrEntry.values.push(valEntry);
        }
        return {
          uid: valEntry.uid,
          value_id: valEntry.value_id,
          attribute_slug: attrEntry.slug,
          attribute_name: attrEntry.name,
          value: valEntry.value,
          value_slug: valEntry.slug,
          color_hex: valEntry.color_hex,
        };
      });
    } else if (v.attribute_values && v.attribute_values.length > 0) {
      pairs = v.attribute_values.map((av) => {
        const aName = av.attribute?.name || "Opção";
        const aSlug = av.attribute?.slug || normalizeSlug(aName);
        if (!attrMap.has(aSlug)) {
          attrMap.set(aSlug, {
            uid: makeStableUid("attr"),
            attribute_id: av.attribute_id,
            name: aName,
            slug: aSlug,
            display_type:
              (av.attribute?.display_type as "color_swatch" | "pill") ||
              (aSlug === "cor" ? "color_swatch" : "pill"),
            sort_order: attrMap.size + 1,
            values: [],
          });
        }
        const attrEntry = attrMap.get(aSlug)!;
        const vSlug = av.slug || normalizeSlug(av.value);
        let valEntry = attrEntry.values.find((val) => val.slug === vSlug);
        if (!valEntry) {
          valEntry = {
            uid: makeStableUid("val"),
            value_id: av.id,
            value: av.value,
            slug: vSlug,
            color_hex: av.color_hex ?? v.color_hex ?? null,
            sort_order: attrEntry.values.length + 1,
          };
          attrEntry.values.push(valEntry);
        }
        return {
          uid: valEntry.uid,
          value_id: valEntry.value_id,
          attribute_slug: attrEntry.slug,
          attribute_name: attrEntry.name,
          value: valEntry.value,
          value_slug: valEntry.slug,
          color_hex: valEntry.color_hex,
        };
      });
    } else if (v.name && v.name !== "Padrão") {
      // Legacy product whose variants were stored purely as shade rows without option_values
      const aSlug = "cor";
      if (!attrMap.has(aSlug)) {
        attrMap.set(aSlug, {
          uid: makeStableUid("attr"),
          name: "Cor",
          slug: aSlug,
          display_type: "color_swatch",
          sort_order: 1,
          values: [],
        });
      }
      const attrEntry = attrMap.get(aSlug)!;
      const vSlug = normalizeSlug(v.name) || String(v.id);
      let valEntry = attrEntry.values.find((val) => val.slug === vSlug);
      if (!valEntry) {
        valEntry = {
          uid: makeStableUid("val"),
          value: v.name,
          slug: vSlug,
          color_hex: v.color_hex ?? null,
          sort_order: attrEntry.values.length + 1,
        };
        attrEntry.values.push(valEntry);
      }
      pairs = [
        {
          uid: valEntry.uid,
          attribute_slug: aSlug,
          attribute_name: "Cor",
          value: valEntry.value,
          value_slug: vSlug,
          color_hex: valEntry.color_hex,
        },
      ];
    }

    rows.push({
      row_key: makeStableUid("var"),
      id: isDuplicate ? undefined : v.id,
      enabled: !isArchived,
      is_archived: isDuplicate ? false : isArchived,
      archived_at: isDuplicate ? null : (v.archived_at ?? null),
      is_active: v.is_active ?? true,
      is_default: v.is_default ?? idx === 0,
      sort_order: v.sort_order ?? idx,
      name: v.name || `Variação ${idx + 1}`,
      option_values: pairs,
      sku: isDuplicate ? "" : (v.sku || ""),
      gtin: isDuplicate ? "" : (v.gtin || ""),
      supplier_code: v.supplier_code || "",
      shade_code: v.shade_code || "",
      color_family: v.color_family || "",
      color_hex: v.color_hex || "",
      price_cents: v.price_cents ?? product.price_cents,
      inherits_price: v.inherits_price ?? v.price_cents === product.price_cents,
      promo_price_cents: v.promo_price_cents ?? null,
      inherits_promo_price:
        v.inherits_promo_price ?? (v.promo_price_cents ?? null) === (product.promo_price_cents ?? null),
      cost_cents: v.cost_cents ?? null,
      stock_qty: isDuplicate ? 0 : (v.stock_qty ?? 0),
      reserved_qty: isDuplicate ? 0 : (v.reserved_qty ?? 0),
      weight_grams: v.weight_grams ?? null,
      inherits_weight: v.inherits_weight ?? (v.weight_grams === null || v.weight_grams === undefined),
      image_path: v.effective_image_path || v.image_path || "",
      inherits_image:
        v.inherits_image ?? !(v.effective_image_path || v.image_path),
      links: isDuplicate ? undefined : v.links,
    });
  });

  return {
    hasVariants: true,
    attributes: Array.from(attrMap.values()),
    rows,
    legacySimpleStock: 0,
  };
}

export function getPersistedVariationRows(rows: VariationRowDraft[]): VariationRowDraft[] {
  return rows.filter((r) => (r.enabled && !r.is_archived) || (r.is_archived && Boolean(r.id)));
}

export interface PersistedVariationPayloadItem {
  id?: number;
  name: string;
  option_values: Array<{
    uid: string;
    value_id?: number;
    attribute_slug: string;
    attribute_name: string;
    value: string;
    value_slug: string;
    color_hex: string | null;
  }>;
  sku: string;
  gtin: string | null;
  supplier_code: string | null;
  shade_code: string | null;
  color_family: string | null;
  color_hex: string | null;
  price_cents: number;
  inherits_price: boolean;
  promo_price_cents: number | null;
  inherits_promo_price: boolean;
  cost_cents: number | null;
  stock_qty: number;
  weight_grams: number | null;
  inherits_weight: boolean;
  image_path: string | null;
  inherits_image: boolean;
  sort_order: number;
  is_default: boolean;
  is_active: boolean;
  is_archived: boolean;
}

export function buildVariationPersistencePayload(params: {
  hasVariants: boolean;
  attributes: VariationAttributeDraft[];
  rows: VariationRowDraft[];
  parentPriceCents: number;
  parentPromoPriceCents: number | null;
  simpleStockQty: number;
  confirmDisableImpact?: boolean;
}) {
  if (!params.hasVariants) {
    return {
      has_variants: false,
      product_type: "simple" as const,
      confirm_disable_variations: Boolean(params.confirmDisableImpact),
      variation_attributes: [],
      stock_qty: Math.max(0, Math.round(params.simpleStockQty || 0)),
      variants: undefined as PersistedVariationPayloadItem[] | undefined,
    };
  }

  const persistedRows = getPersistedVariationRows(params.rows);
  let hasDefault = false;
  const normalizedRows: PersistedVariationPayloadItem[] = persistedRows.map((row, idx) => {
    const canBeDefault = !row.is_archived && row.is_active && row.enabled;
    const isDefault = canBeDefault && row.is_default && !hasDefault;
    if (isDefault) hasDefault = true;

    return {
      id: row.id,
      name: row.name.trim(),
      option_values: row.option_values.map((ov) => ({
        uid: ov.uid,
        value_id: ov.value_id,
        attribute_slug: ov.attribute_slug,
        attribute_name: ov.attribute_name,
        value: ov.value,
        value_slug: ov.value_slug,
        color_hex: ov.color_hex ?? null,
      })),
      sku: row.sku.trim().toUpperCase(),
      gtin: row.gtin.trim() || null,
      supplier_code: row.supplier_code?.trim() || null,
      shade_code: row.shade_code.trim() || null,
      color_family: row.color_family.trim() || null,
      color_hex: row.color_hex.trim() || null,
      price_cents: row.inherits_price ? params.parentPriceCents : row.price_cents,
      inherits_price: row.inherits_price,
      promo_price_cents: row.inherits_promo_price ? params.parentPromoPriceCents : row.promo_price_cents,
      inherits_promo_price: row.inherits_promo_price,
      cost_cents: row.cost_cents,
      stock_qty: Math.max(0, Math.round(row.stock_qty || 0)),
      weight_grams: row.inherits_weight ? null : row.weight_grams,
      inherits_weight: row.inherits_weight,
      image_path: row.inherits_image ? null : (row.image_path.trim() || null),
      inherits_image: row.inherits_image,
      sort_order: idx,
      is_default: isDefault,
      is_active: !row.is_archived && row.is_active && row.enabled,
      is_archived: row.is_archived,
    };
  });

  if (!hasDefault) {
    const firstActive = normalizedRows.find((r) => !r.is_archived && r.is_active);
    if (firstActive) firstActive.is_default = true;
  }

  return {
    has_variants: true,
    product_type: "variable" as const,
    confirm_disable_variations: false,
    variation_attributes: params.attributes.map((a, aIdx) => ({
      attribute_id: a.attribute_id,
      name: a.name.trim(),
      slug: a.slug || normalizeSlug(a.name),
      display_type: a.display_type,
      sort_order: aIdx + 1,
      values: a.values.map((v, vIdx) => ({
        uid: v.uid,
        value_id: v.value_id,
        value: v.value.trim(),
        slug: v.slug || normalizeSlug(v.value),
        color_hex: v.color_hex ?? null,
        sort_order: vIdx + 1,
      })),
    })),
    stock_qty: undefined as number | undefined,
    variants: normalizedRows,
  };
}

/**
 * Translates Laravel validation error keys (`variants.2.sku`, `variants.0.combination`, etc.)
 * into both row_key-indexed errors (unaffected by matrix filters/omitted rows) and section messages.
 */
export function mapServerValidationErrorsToVariationRows(
  validationErrors: Record<string, string[]> | undefined,
  rows: VariationRowDraft[],
): {
  byRowKey: Record<string, string[]>;
  sectionError: string | null;
} {
  const byRowKey: Record<string, string[]> = {};
  const sectionMsgs: string[] = [];
  if (!validationErrors) return { byRowKey, sectionError: null };

  const persisted = getPersistedVariationRows(rows);

  for (const [key, msgs] of Object.entries(validationErrors)) {
    const m = /^variants\.(\d+)\.(.+)$/.exec(key);
    if (m) {
      const idx = Number(m[1]);
      const targetRow = persisted[idx];
      if (targetRow) {
        byRowKey[targetRow.row_key] = [
          ...(byRowKey[targetRow.row_key] ?? []),
          ...msgs,
        ];
        continue;
      }
    }
    if (key === "variants" || key === "has_variants") {
      sectionMsgs.push(...msgs);
    }
  }

  return {
    byRowKey,
    sectionError: sectionMsgs.length > 0 ? sectionMsgs.join(" ") : null,
  };
}
