import { describe, expect, it } from "vitest";
import { buildProductSchema, seoHead } from "../../src/lib/seo";
import { mapCartItemsToGa4 } from "../../src/monitoring/analytics";

describe("seoHead", () => {
  it("does not duplicate brand name when title already includes Mistura Feminina", () => {
    const head = seoHead({
      title: "Mistura Feminina | Cosméticos, Maquiagem e Beleza",
      description: "Descrição de teste",
      path: "/?utm_source=test",
    });

    const titleMeta = head.meta.find((m) => "title" in m);
    expect(titleMeta?.title).toBe(
      "Mistura Feminina | Cosméticos, Maquiagem e Beleza",
    );
    expect(head.links[0]?.href.endsWith("/")).toBe(true);
    expect(head.links[0]?.href).not.toContain("utm_source");
  });

  it("appends Mistura Feminina when absent and honors noindex", () => {
    const head = seoHead({
      title: "Meu Carrinho",
      description: "Carrinho",
      path: "/carrinho",
      noindex: true,
    });

    const titleMeta = head.meta.find((m) => "title" in m);
    const robotsMeta = head.meta.find(
      (m) => "name" in m && m.name === "robots",
    );
    expect(titleMeta?.title).toBe("Meu Carrinho | Mistura Feminina");
    expect(robotsMeta?.content).toBe("noindex, nofollow");
  });
});

describe("buildProductSchema", () => {
  it("builds valid BRL offer and includes aggregateRating only when reviews exist", () => {
    const withoutReviews = buildProductSchema({
      name: "Esmalte Gel",
      sku: "MF-001",
      priceCents: 2990,
      promoPriceCents: 1990,
      inStock: true,
      slug: "esmalte-gel",
    });

    expect(withoutReviews.offers.price).toBe("19.90");
    expect(withoutReviews.offers.priceCurrency).toBe("BRL");
    expect(withoutReviews.offers.availability).toBe(
      "https://schema.org/InStock",
    );
    expect("aggregateRating" in withoutReviews).toBe(false);

    const withReviews = buildProductSchema({
      name: "Esmalte Gel",
      sku: "MF-001",
      priceCents: 2990,
      inStock: false,
      slug: "esmalte-gel",
      ratingValue: 4.8,
      reviewCount: 5,
    });

    expect(withReviews.offers.availability).toBe(
      "https://schema.org/OutOfStock",
    );
    expect(withReviews.aggregateRating).toEqual({
      "@type": "AggregateRating",
      ratingValue: "4.8",
      reviewCount: 5,
      bestRating: "5",
      worstRating: "1",
    });
  });
});

describe("mapCartItemsToGa4", () => {
  it("maps cart items without PII", () => {
    expect(
      mapCartItemsToGa4([
        {
          sku: "SKU-1",
          product_name: "Sérum",
          unit_price_cents: 4590,
          quantity: 2,
        },
      ]),
    ).toEqual([
      {
        item_id: "SKU-1",
        item_name: "Sérum",
        price: 45.9,
        quantity: 2,
      },
    ]);
  });
});
