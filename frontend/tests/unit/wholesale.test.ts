import { describe, expect, it } from "vitest";
import {
  computeWholesaleUnitPrice,
  formatBrlCurrency,
  parseBrlCurrency,
  parseExcelClipboard,
} from "../../src/features/storefront/wholesale";

describe("Wholesale Frontend Storefront & Admin Helpers", () => {
  it("calculates progressive discounts using legacy min_qty/discount_percent tiers", () => {
    const tiers = [
      { min_qty: 6, discount_percent: 15 },
      { min_qty: 12, discount_percent: 25 },
    ];

    const belowTier = computeWholesaleUnitPrice(1000, 3, tiers);
    expect(belowTier.unitPriceCents).toBe(1000);
    expect(belowTier.appliedDiscountPercent).toBe(0);

    const firstTier = computeWholesaleUnitPrice(1000, 6, tiers);
    expect(firstTier.unitPriceCents).toBe(850);
    expect(firstTier.appliedDiscountPercent).toBe(15);

    const secondTier = computeWholesaleUnitPrice(1000, 15, tiers);
    expect(secondTier.unitPriceCents).toBe(750);
    expect(secondTier.appliedDiscountPercent).toBe(25);
  });

  it("calculates wholesale unit prices with fixed_price tiers", () => {
    const tiers = [
      {
        min_quantity: 10,
        discount_type: "fixed_price" as const,
        discount_value: 6.9,
      },
      {
        min_quantity: 30,
        discount_type: "fixed_price" as const,
        discount_value: 5.5,
      },
    ];

    const underQty = computeWholesaleUnitPrice(1200, 5, tiers);
    expect(underQty.unitPriceCents).toBe(1200);

    const tier1 = computeWholesaleUnitPrice(1200, 12, tiers);
    expect(tier1.unitPriceCents).toBe(690);

    const tier2 = computeWholesaleUnitPrice(1200, 35, tiers);
    expect(tier2.unitPriceCents).toBe(550);
  });

  it("parses Brazilian currency strings reliably", () => {
    expect(parseBrlCurrency("R$ 14,90")).toBe(1490);
    expect(parseBrlCurrency("14,90")).toBe(1490);
    expect(parseBrlCurrency("14.90")).toBe(1490);
    expect(parseBrlCurrency("R$ 1.250,50")).toBe(125050);
    expect(parseBrlCurrency("")).toBe(0);
  });

  it("formats BRL currency to Brazilian Real format", () => {
    const formatted = formatBrlCurrency(1490);
    expect(formatted).toContain("14,90");
  });

  it("parses Excel clipboard text into structured SKU and pricing rows", () => {
    const clipboardTsv = `SKU\tPreco\tQtdMin
MF-ESM-001-ROS\tR$ 6,50\t6
MF-ESM-001-RUB\t6,50\t6
MF-CAB-007\t45.00\t2`;

    const parsed = parseExcelClipboard(clipboardTsv);
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toEqual({
      sku: "MF-ESM-001-ROS",
      priceCents: 650,
      minQuantity: 6,
    });
    expect(parsed[1]).toEqual({
      sku: "MF-ESM-001-RUB",
      priceCents: 650,
      minQuantity: 6,
    });
    expect(parsed[2]).toEqual({
      sku: "MF-CAB-007",
      priceCents: 4500,
      minQuantity: 2,
    });
  });
});
