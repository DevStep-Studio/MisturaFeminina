export type CostPresenceState = "uninformed" | "explicit_zero" | "informed";

export interface ParsedCostInput {
  valid: boolean;
  cents: number | null;
}

export interface UnitMarginEstimate {
  effectivePriceCents: number;
  activePriceType: "promo" | "regular";
  costState: CostPresenceState;
  costCents: number | null;
  profitCents: number | null;
  marginPct: number | null;
  isZeroPrice: boolean;
  isLoss: boolean;
}

export interface WholesaleTierEstimate {
  min_qty: number;
  discount_percent?: number;
  unit_price_cents: number;
  profit_cents: number | null;
  margin_pct: number | null;
  is_loss: boolean;
}

/**
 * Parses a Brazilian monetary input for product/variant acquisition cost.
 * Distinguishes three distinct states:
 * - Blank string -> `{ valid: true, cents: null }` ("Custo não informado")
 * - Explicit zero ("0", "0,00", "R$ 0,00") -> `{ valid: true, cents: 0 }` ("R$ 0,00 informado")
 * - Positive amount ("12,50") -> `{ valid: true, cents: 1250 }`
 */
export function parseBrlNullableCost(raw: string): ParsedCostInput {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { valid: true, cents: null };
  }
  const clean = trimmed
    .replace(/R\$/gi, "")
    .replace(/\s+/g, "")
    .replace(/[^0-9,.-]/g, "");
  if (!clean || clean.startsWith("-")) {
    return { valid: false, cents: null };
  }
  const normalized = clean.includes(",")
    ? clean.replace(/\./g, "").replace(",", ".")
    : clean;
  const num = Number(normalized);
  if (!Number.isFinite(num) || num < 0) {
    return { valid: false, cents: null };
  }
  return { valid: true, cents: Math.round(num * 100) };
}

export function formatNullableCostInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function formatBrlSigned(cents: number): string {
  const formatted = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Math.abs(cents) / 100);
  return cents < 0 ? `-${formatted}` : formatted;
}

export function formatMarginPercentage(
  pct: number | null | undefined,
  options: { compactWhole?: boolean } = {},
): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) {
    return "Indisponível";
  }
  if (options.compactWhole && Math.abs(pct - Math.round(pct)) < 0.005) {
    return `${Math.round(pct)}%`;
  }
  return `${pct.toFixed(2).replace(".", ",")}%`;
}

export function calculateUnitMarginPreview(input: {
  regularPriceCents: number;
  promoPriceCents?: number | null;
  costCents: number | null;
}): UnitMarginEstimate {
  const regular = Math.max(0, Math.round(input.regularPriceCents || 0));
  const hasActivePromo =
    typeof input.promoPriceCents === "number" &&
    input.promoPriceCents > 0 &&
    input.promoPriceCents < regular;
  const effectivePriceCents = hasActivePromo
    ? Math.round(input.promoPriceCents!)
    : regular;
  const isZeroPrice = effectivePriceCents <= 0;

  let costState: CostPresenceState = "uninformed";
  if (input.costCents !== null && input.costCents !== undefined) {
    costState = input.costCents === 0 ? "explicit_zero" : "informed";
  }

  if (input.costCents === null || input.costCents === undefined) {
    return {
      effectivePriceCents,
      activePriceType: hasActivePromo ? "promo" : "regular",
      costState,
      costCents: null,
      profitCents: null,
      marginPct: null,
      isZeroPrice,
      isLoss: false,
    };
  }

  const profitCents = effectivePriceCents - input.costCents;
  const marginPct =
    effectivePriceCents > 0
      ? Math.round((profitCents / effectivePriceCents) * 10000) / 100
      : null;

  return {
    effectivePriceCents,
    activePriceType: hasActivePromo ? "promo" : "regular",
    costState,
    costCents: input.costCents,
    profitCents,
    marginPct,
    isZeroPrice,
    isLoss: profitCents < 0,
  };
}

export function calculateWholesaleTierEstimates(
  tiers: Array<{
    min_qty?: number;
    min_quantity?: number;
    discount_percent?: number;
    unit_price_cents?: number;
    price_cents?: number;
  }>,
  basePriceCents: number,
  costCents: number | null,
): WholesaleTierEstimate[] {
  return tiers
    .map((tier): WholesaleTierEstimate | null => {
      const minQty = Number(tier.min_qty ?? tier.min_quantity ?? 0);
      if (!Number.isFinite(minQty) || minQty <= 0) return null;

      let unitPrice = 0;
      if (typeof tier.unit_price_cents === "number" && tier.unit_price_cents > 0) {
        unitPrice = Math.round(tier.unit_price_cents);
      } else if (typeof tier.price_cents === "number" && tier.price_cents > 0) {
        unitPrice = Math.round(tier.price_cents);
      } else if (typeof tier.discount_percent === "number" && tier.discount_percent > 0 && basePriceCents > 0) {
        unitPrice = Math.max(100, Math.round(basePriceCents * (1 - tier.discount_percent / 100)));
      }
      if (unitPrice <= 0) return null;

      const est = calculateUnitMarginPreview({
        regularPriceCents: unitPrice,
        costCents,
      });

      return {
        min_qty: minQty,
        discount_percent:
          typeof tier.discount_percent === "number"
            ? tier.discount_percent
            : basePriceCents > 0
              ? Math.round(((basePriceCents - unitPrice) / basePriceCents) * 100)
              : undefined,
        unit_price_cents: unitPrice,
        profit_cents: est.profitCents,
        margin_pct: est.marginPct,
        is_loss: est.isLoss,
      };
    })
    .filter((t): t is WholesaleTierEstimate => t !== null);
}
