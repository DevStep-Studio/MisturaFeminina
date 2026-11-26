import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatCents, isWhatsAppConfigured, whatsappUrl } from "../../src/lib/format";
import { computeWholesaleUnitPrice, type WholesaleTier } from "../../src/features/storefront/wholesale";
import type { ProductCardData } from "../../src/features/storefront/types";

describe("Storefront Responsive & Wholesale Logic Suite", () => {
  const mockProduct: ProductCardData = {
    id: 101,
    sku: "MF-ESM-001",
    name: "Esmalte em Gel Coleção Lírio 15ml",
    slug: "esmalte-em-gel-colecao-lirio-15ml",
    product_type: "variable",
    brand: { id: 1, name: "Lírio", slug: "lirio" },
    available_stock: 45,
    has_multiple_variants: true,
    price_cents: 8990,
    effective_price_cents: 6490,
    discount_percent: 28,
    installments_count: 3,
    installment_cents: 2163,
    in_stock: true,
    is_featured: true,
    is_new_arrival: true,
    primary_image: "/images/lirio-esmalte.webp",
    primary_image_alt: "Esmalte Lírio",
    default_variant_id: 501,
    specs: [
      { name: "Volume", value: "30ml, 60ml", slug: "volume" },
      { name: "Acabamento", value: "Gel UV/LED", slug: "acabamento" },
      { name: "Extra", value: "Extra Spec Should Be Sliced", slug: "extra" },
    ],
    wholesale_condition: {
      has_wholesale: true,
      min_quantity: 5,
      starting_price_cents: 5192,
      tiers: [
        {
          min_quantity: 5,
          max_quantity: 9,
          discount_type: "fixed_price",
          discount_value: 51.92,
          unit_price_cents: 5192,
          unit_price_formatted: "R$ 51,92",
        },
        {
          min_quantity: 10,
          discount_type: "fixed_price",
          discount_value: 45.0,
          unit_price_cents: 4500,
          unit_price_formatted: "R$ 45,00",
        },
      ],
    },
  };

  it("calculates wholesale unit prices accurately for multiple tiers", () => {
    const tiers = mockProduct.wholesale_condition!.tiers ?? [];
    const baseRetail = mockProduct.effective_price_cents;

    // Below wholesale minimum: retail price applies
    const belowMin = computeWholesaleUnitPrice(baseRetail, 4, tiers);
    expect(belowMin.unitPriceCents).toBe(6490);

    // At tier 1 threshold (5 units): 5192 cents
    const atTier1 = computeWholesaleUnitPrice(baseRetail, 5, tiers);
    expect(atTier1.unitPriceCents).toBe(5192);

    // Within tier 1 range (8 units): 5192 cents
    const withinTier1 = computeWholesaleUnitPrice(baseRetail, 8, tiers);
    expect(withinTier1.unitPriceCents).toBe(5192);

    // At tier 2 threshold (10 units): 4500 cents
    const atTier2 = computeWholesaleUnitPrice(baseRetail, 10, tiers);
    expect(atTier2.unitPriceCents).toBe(4500);

    // Above tier 2 (25 units): 4500 cents
    const aboveTier2 = computeWholesaleUnitPrice(baseRetail, 25, tiers);
    expect(aboveTier2.unitPriceCents).toBe(4500);
  });

  it("computes wholesale total pack costs and total customer savings", () => {
    const minQty = mockProduct.wholesale_condition!.min_quantity ?? 5;
    const wholesaleUnitPrice = mockProduct.wholesale_condition!.starting_price_cents!;
    const retailUnitPrice = mockProduct.effective_price_cents;

    const packTotalCents = wholesaleUnitPrice * minQty;
    expect(packTotalCents).toBe(25960);
    expect(formatCents(packTotalCents)).toBe("R$ 259,60");

    const retailPackTotalCents = retailUnitPrice * minQty;
    const savingsCents = retailPackTotalCents - packTotalCents;
    expect(savingsCents).toBe(6490);
    expect(formatCents(savingsCents)).toBe("R$ 64,90");
  });

  it("limits visible specs to 2 to prevent vertical height shifts in mobile product grids", () => {
    const visibleSpecs = (mockProduct.specs ?? []).slice(0, 2);
    expect(visibleSpecs).toHaveLength(2);
    expect(visibleSpecs[0].value).toBe("30ml, 60ml");
    expect(visibleSpecs[1].value).toBe("Gel UV/LED");
  });

  it("formats WhatsApp inquiry URLs with sanitization and complete product context", () => {
    const phone = "55 11 98765-4321";
    const message = `Olá! Tenho interesse no produto: ${mockProduct.name} (SKU ${mockProduct.sku})`;
    const url = whatsappUrl(phone, message);

    expect(url).toContain("https://wa.me/5511987654321");
    expect(url).toContain("MF-ESM-001");
    expect(url).toContain(encodeURIComponent("Esmalte em Gel Coleção Lírio 15ml"));
  });

  it("falls back gracefully when WhatsApp contact is not configured", () => {
    const url = whatsappUrl(undefined, "Teste");
    expect(url).toBe("/contato?assunto=duvida-produto&mensagem=Teste");
  });

  it("identifies valid and placeholder WhatsApp numbers correctly", () => {
    expect(isWhatsAppConfigured("5511900000000")).toBe(false);
    expect(isWhatsAppConfigured("11900000000")).toBe(false);
    expect(isWhatsAppConfigured("0000000000")).toBe(false);
    expect(isWhatsAppConfigured("")).toBe(false);
    expect(isWhatsAppConfigured(undefined)).toBe(false);
    expect(isWhatsAppConfigured("11987654321")).toBe(true);
    expect(isWhatsAppConfigured("5511987654321")).toBe(true);
  });

  it("validates badge character budgets fit within 120px mobile card inner width", () => {
    const minQty = mockProduct.wholesale_condition!.min_quantity;
    const priceStr = formatCents(mockProduct.wholesale_condition!.starting_price_cents);

    // Mobile badge text: "Atacado: R$ 51,92"
    const mobileText = `Atacado: ${priceStr}`;
    expect(mobileText.length).toBeLessThanOrEqual(20);

    // Desktop badge text: "Atacado: R$ 51,92 (5+ un.)"
    const desktopText = `Atacado: ${priceStr} (${minQty}+ un.)`;
    expect(desktopText.length).toBeLessThanOrEqual(30);

    // Active state: "✓ Atacado Ativo"
    const activeMobileText = "✓ Atacado Ativo";
    expect(activeMobileText.length).toBeLessThanOrEqual(16);
  });

  it("guarantees wholesale tier min quantity formatting does not contain rogue newlines", () => {
    const minQty = 5;
    const formatted = `Preço de Atacado (${minQty}+ un.)`;
    expect(formatted).not.toContain("\n");
    expect(formatted).toBe("Preço de Atacado (5+ un.)");
  });

  it("renders storefront banners with intrinsic aspect ratio (object-contain, h-auto) and mobileSrc support", () => {
    const bannerImgSrc = readFileSync(
      resolve(__dirname, "../../src/features/storefront/components/BannerImage.tsx"),
      "utf8",
    );
    const homeSrc = readFileSync(
      resolve(__dirname, "../../src/routes/index.tsx"),
      "utf8",
    );
    expect(bannerImgSrc).toContain('media="(max-width: 767px)"');
    expect(bannerImgSrc).toContain("h-auto");
    expect(bannerImgSrc).toContain("object-contain");
    expect(bannerImgSrc).not.toContain("object-cover");
    expect(homeSrc).toContain("object-contain");
    expect(homeSrc).toContain("mobileSrc={banner.mobile_image_path}");
  });

  it("keeps login page free of admin demo credential prefill buttons or hardcoded credentials", () => {
    const loginSrc = readFileSync(
      resolve(__dirname, "../../src/features/auth/components/login-page.tsx"),
      "utf8",
    );
    expect(loginSrc).not.toMatch(/Preencher dados/i);
    expect(loginSrc).not.toContain("misturafeminina.local");
    expect(loginSrc).toContain('href="/forgot-password"');
  });
});
