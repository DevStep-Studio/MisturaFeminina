import { describe, expect, it } from "vitest";
import {
  calculateUnitMarginPreview,
  calculateWholesaleTierEstimates,
  formatBrlSigned,
  formatMarginPercentage,
  formatNullableCostInput,
  parseBrlNullableCost,
} from "../../src/features/admin/profit-math";

describe("Admin Unit Cost, Gross Profit & Margin Helpers", () => {
  it("calculates example R$ 50,00 sale price with R$ 30,00 cost as R$ 20,00 profit and 40% margin", () => {
    const est = calculateUnitMarginPreview({
      regularPriceCents: 5000,
      promoPriceCents: null,
      costCents: 3000,
    });

    expect(est.effectivePriceCents).toBe(5000);
    expect(est.activePriceType).toBe("regular");
    expect(est.costState).toBe("informed");
    expect(est.profitCents).toBe(2000);
    expect(est.marginPct).toBe(40);
    expect(est.isLoss).toBe(false);
    expect(formatBrlSigned(est.profitCents ?? 0)).toContain("20,00");
    expect(formatMarginPercentage(est.marginPct, { compactWhole: true })).toBe(
      "40%",
    );
  });

  it("uses active promotional price instead of regular price for live preview", () => {
    const est = calculateUnitMarginPreview({
      regularPriceCents: 6000,
      promoPriceCents: 4000,
      costCents: 2500,
    });

    expect(est.activePriceType).toBe("promo");
    expect(est.effectivePriceCents).toBe(4000);
    expect(est.profitCents).toBe(1500);
    expect(est.marginPct).toBe(37.5);
    expect(formatMarginPercentage(est.marginPct)).toBe("37,50%");
  });

  it("distinguishes uninformed (null) cost from explicit zero (R$ 0,00) cost", () => {
    const blank = parseBrlNullableCost("   ");
    expect(blank).toEqual({ valid: true, cents: null });
    expect(formatNullableCostInput(null)).toBe("");

    const explicitZero = parseBrlNullableCost("0,00");
    expect(explicitZero).toEqual({ valid: true, cents: 0 });
    expect(parseBrlNullableCost("R$ 0")).toEqual({ valid: true, cents: 0 });
    expect(formatNullableCostInput(0)).toBe("0,00");

    const uninformedPreview = calculateUnitMarginPreview({
      regularPriceCents: 5000,
      costCents: blank.cents,
    });
    expect(uninformedPreview.costState).toBe("uninformed");
    expect(uninformedPreview.profitCents).toBeNull();
    expect(uninformedPreview.marginPct).toBeNull();

    const zeroCostPreview = calculateUnitMarginPreview({
      regularPriceCents: 5000,
      costCents: explicitZero.cents,
    });
    expect(zeroCostPreview.costState).toBe("explicit_zero");
    expect(zeroCostPreview.profitCents).toBe(5000);
    expect(zeroCostPreview.marginPct).toBe(100);
  });

  it("handles negative gross profit, zero sale price without division by zero, and BRL parsing", () => {
    const loss = calculateUnitMarginPreview({
      regularPriceCents: 1800,
      costCents: 2500,
    });
    expect(loss.isLoss).toBe(true);
    expect(loss.profitCents).toBe(-700);
    expect(formatBrlSigned(loss.profitCents ?? 0)).toMatch(/^-/);

    const zeroSale = calculateUnitMarginPreview({
      regularPriceCents: 0,
      costCents: 1500,
    });
    expect(zeroSale.isZeroPrice).toBe(true);
    expect(zeroSale.marginPct).toBeNull();
    expect(formatMarginPercentage(zeroSale.marginPct)).toBe("Indisponível");

    expect(parseBrlNullableCost("1.234,56")).toEqual({
      valid: true,
      cents: 123456,
    });
    expect(parseBrlNullableCost("-10,00").valid).toBe(false);
    expect(parseBrlNullableCost("abc").valid).toBe(false);
  });

  it("computes margin estimates per wholesale quantity tier", () => {
    const estimates = calculateWholesaleTierEstimates(
      [
        { min_qty: 5, discount_percent: 10 },
        { min_qty: 12, unit_price_cents: 1800 },
      ],
      2500,
      1500,
    );

    expect(estimates).toHaveLength(2);
    expect(estimates[0].unit_price_cents).toBe(2250);
    expect(estimates[0].profit_cents).toBe(750);
    expect(estimates[0].is_loss).toBe(false);
    expect(estimates[1].unit_price_cents).toBe(1800);
    expect(estimates[1].profit_cents).toBe(300);
  });
});
