import type { WholesaleTierData } from "./types";

export interface WholesaleTier {
  min_qty?: number;
  discount_percent?: number;
  min_quantity?: number;
  max_quantity?: number | null;
  discount_type?: "percent" | "fixed_price" | "fixed_discount" | string;
  discount_value?: number;
  unit_price_cents?: number;
  unit_price_formatted?: string;
  discount_cents?: number;
}

export function computeWholesaleUnitPrice(
  baseCents: number,
  effectiveQty: number,
  tiers: WholesaleTier[] | WholesaleTierData[],
): { unitPriceCents: number; appliedDiscountPercent: number } {
  let best = baseCents;
  let appliedPercent = 0;

  for (const tier of tiers) {
    const minQ =
      (tier as { min_quantity?: number; min_qty?: number }).min_quantity ??
      (tier as { min_qty?: number }).min_qty ??
      0;
    if (minQ > 0 && effectiveQty >= minQ) {
      const type =
        (tier as { discount_type?: string }).discount_type ?? "percent";
      const val = Number(
        (tier as { discount_value?: number; discount_percent?: number })
          .discount_value ??
          (tier as { discount_percent?: number }).discount_percent ??
          0,
      );

      let candidate = baseCents;
      const explicitUnitPrice = (tier as { unit_price_cents?: number }).unit_price_cents;
      if (typeof explicitUnitPrice === "number" && explicitUnitPrice > 0 && explicitUnitPrice < baseCents) {
        candidate = explicitUnitPrice;
      } else if (type === "percent") {
        if (val > 0 && val <= 80) {
          candidate = Math.max(100, Math.round(baseCents * (1 - val / 100)));
        }
      } else if (type === "fixed_price") {
        const fixedCents = Math.round(val * 100);
        if (fixedCents > 0 && fixedCents < baseCents) {
          candidate = fixedCents;
        }
      } else if (type === "fixed_discount") {
        const discountCents = Math.round(val * 100);
        if (discountCents > 0) {
          candidate = Math.max(100, baseCents - discountCents);
        }
      }

      if (candidate < best) {
        best = candidate;
        appliedPercent =
          type === "percent"
            ? val
            : Math.round(((baseCents - candidate) / baseCents) * 100);
      }
    }
  }

  return {
    unitPriceCents: best,
    appliedDiscountPercent: appliedPercent,
  };
}

export function formatBrlCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function parseBrlCurrency(raw: string): number {
  const cleaned = raw.replace(/[^\d,.]/g, "").trim();
  if (!cleaned) return 0;
  if (cleaned.includes(",")) {
    const normalized = cleaned.replace(/\./g, "").replace(",", ".");
    return Math.round(parseFloat(normalized) * 100);
  }
  return Math.round(parseFloat(cleaned) * 100);
}

export function parseExcelClipboard(
  pastedText: string,
): Array<{ sku: string; priceCents: number; minQuantity: number }> {
  const lines = pastedText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const results: Array<{
    sku: string;
    priceCents: number;
    minQuantity: number;
  }> = [];

  for (const line of lines) {
    const delimiter = line.includes("\t")
      ? "\t"
      : line.includes(";")
        ? ";"
        : ",";
    const parts = line.split(delimiter).map((p) => p.trim());
    if (parts.length >= 2) {
      const sku = parts[0];
      if (/^(sku|codigo|código|produto)/i.test(sku)) continue;
      const priceCents = parseBrlCurrency(parts[1]);
      const minQty =
        parts.length >= 3 ? Math.max(1, parseInt(parts[2], 10) || 1) : 1;
      if (sku && priceCents > 0) {
        results.push({ sku, priceCents, minQuantity: minQty });
      }
    }
  }
  return results;
}
