export interface WholesaleTier {
  min_qty: number;
  discount_percent: number;
}

export function computeWholesaleUnitPrice(
  baseCents: number,
  effectiveQty: number,
  tiers: WholesaleTier[],
): { unitPriceCents: number; appliedDiscountPercent: number } {
  let best = baseCents;
  let applied = 0;
  for (const tier of tiers) {
    if (
      tier.min_qty > 0 &&
      effectiveQty >= tier.min_qty &&
      tier.discount_percent > 0 &&
      tier.discount_percent <= 80
    ) {
      const candidate = Math.max(
        100,
        Math.round(baseCents * (1 - tier.discount_percent / 100)),
      );
      if (candidate < best) {
        best = candidate;
        applied = tier.discount_percent;
      }
    }
  }
  return { unitPriceCents: best, appliedDiscountPercent: applied };
}
