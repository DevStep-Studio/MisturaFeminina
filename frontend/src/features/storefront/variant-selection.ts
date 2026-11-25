import type { ProductVariationAxis, ProductVariantData } from "./types";

export type AxisValueAvailability = "in_stock" | "out_of_stock" | "not_sold";

export interface VariantMatchResolution {
  state: "matched_in_stock" | "matched_out_of_stock" | "not_sold" | "simple";
  variant: ProductVariantData | null;
}

export function normalizeOptionSlug(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Extracts map { attribute_slug => value_slug } from a serialized storefront variant.
 */
export function getVariantOptionMap(
  variant: ProductVariantData,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (variant.option_values && variant.option_values.length > 0) {
    for (const ov of variant.option_values) {
      const aSlug = normalizeOptionSlug(ov.attribute_slug || ov.attribute_name);
      const vSlug = normalizeOptionSlug(ov.value_slug || ov.value);
      if (aSlug && vSlug) out[aSlug] = vSlug;
    }
    return out;
  }
  if (variant.attributes && variant.attributes.length > 0) {
    for (const attr of variant.attributes) {
      const aSlug = normalizeOptionSlug(attr.attribute_slug || attr.attribute_name);
      const vSlug = normalizeOptionSlug(attr.value_slug || attr.value);
      if (aSlug && vSlug) out[aSlug] = vSlug;
    }
    return out;
  }
  if (variant.name && variant.name !== "Padrão") {
    out.opcao = normalizeOptionSlug(variant.name);
  }
  return out;
}

/**
 * Resolves exact selected variant matching the user's current choice on all axes.
 * Explicitly returns "not_sold" when the chosen combination has no catalog SKU
 * (e.g. Vermelho + 15 ml never sold) vs "matched_out_of_stock" when an SKU exists with 0 stock.
 */
export function resolveSelectedVariant(
  axes: ProductVariationAxis[],
  selectedByAxis: Record<string, string>,
  variants: ProductVariantData[],
): VariantMatchResolution {
  if (axes.length === 0 || variants.length === 0) {
    const def = variants.find((v) => v.is_default) ?? variants[0] ?? null;
    if (!def) return { state: "not_sold", variant: null };
    return {
      state: def.in_stock ? "matched_in_stock" : "matched_out_of_stock",
      variant: def,
    };
  }

  for (const v of variants) {
    const optMap = getVariantOptionMap(v);
    const matchesAll = axes.every((axis) => {
      const chosen = selectedByAxis[axis.slug];
      return chosen && optMap[axis.slug] === chosen;
    });
    if (matchesAll) {
      return {
        state: v.in_stock ? "matched_in_stock" : "matched_out_of_stock",
        variant: v,
      };
    }
  }

  return { state: "not_sold", variant: null };
}

/**
 * Computes the availability state for a candidate button on one axis given the user's other axis selections.
 */
export function evaluateAxisOptionAvailability(
  axes: ProductVariationAxis[],
  selectedByAxis: Record<string, string>,
  targetAxisSlug: string,
  targetValueSlug: string,
  variants: ProductVariantData[],
): AxisValueAvailability {
  const otherAxes = axes.filter((a) => a.slug !== targetAxisSlug);
  const exactMatches = variants.filter((v) => {
    const map = getVariantOptionMap(v);
    if (map[targetAxisSlug] !== targetValueSlug) return false;
    return otherAxes.every((axis) => {
      const chosen = selectedByAxis[axis.slug];
      return !chosen || map[axis.slug] === chosen;
    });
  });

  if (exactMatches.length === 0) {
    return "not_sold";
  }

  return exactMatches.some((v) => v.in_stock) ? "in_stock" : "out_of_stock";
}
