import { describe, expect, it } from "vitest";
import {
  buildArticleSchema,
  buildCollectionPageSchema,
  buildFaqSchema,
  buildProductSchema,
  seoHead,
  stripHtml,
} from "../../src/lib/seo";
import { getCategorySeoContent } from "../../src/features/storefront/data/categorySeoContent";
import {
  getNailGuideBySlug,
  NAIL_GUIDES,
} from "../../src/features/storefront/data/nailGuidesData";
import { publicPages } from "../../src/lib/site";
import { mapCartItemsToGa4 } from "../../src/monitoring/analytics";

describe("stripHtml", () => {
  it("strips HTML tags and collapses whitespace", () => {
    expect(
      stripHtml("<p>Sérum <strong>facial</strong>&nbsp;hidratante.</p>"),
    ).toBe("Sérum facial hidratante.");
  });
});

describe("seoHead", () => {
  it("does not duplicate brand name when title already includes Mistura Feminina", () => {
    const head = seoHead({
      title: "Mistura Feminina | Cosméticos, Maquiagem e Beleza",
      description: "<p>Descrição&nbsp;de <b>teste</b></p>",
      path: "/?utm_source=test",
    });

    const titleMeta = head.meta.find((m) => "title" in m);
    const descMeta = head.meta.find(
      (m) => "name" in m && m.name === "description",
    );
    expect(titleMeta?.title).toBe(
      "Mistura Feminina | Cosméticos, Maquiagem e Beleza",
    );
    expect(descMeta?.content).toBe("Descrição de teste");
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

    expect(withoutReviews.offers?.price).toBe("19.90");
    expect(withoutReviews.offers?.priceCurrency).toBe("BRL");
    expect(withoutReviews.offers?.availability).toBe(
      "https://schema.org/InStock",
    );
    expect("aggregateRating" in withoutReviews).toBe(false);
    expect("review" in withoutReviews).toBe(false);

    const withoutPrice = buildProductSchema({
      name: "Produto Sem Preco",
      sku: "MF-002",
      priceCents: 0,
      inStock: true,
      slug: "produto-sem-preco",
    });
    expect("offers" in withoutPrice).toBe(false);

    const withReviews = buildProductSchema({
      name: "Esmalte Gel",
      description: "<p>Esmalte em gel UV/LED de longa duração.</p>",
      sku: "MF-001",
      gtin: "7891234567890",
      category: "Unhas e Esmalteria",
      image: "/products/esmalte-1.jpg",
      images: ["/products/esmalte-1.jpg", "/products/esmalte-2.jpg"],
      priceCents: 2990,
      inStock: false,
      slug: "esmalte-gel",
      ratingValue: 4.8,
      reviewCount: 5,
      reviews: [
        {
          author_name: "Ana",
          rating: 5,
          body: "Excelente fixação!",
          created_at: "2026-10-01T10:00:00Z",
        },
      ],
    });

    expect(withReviews.description).toBe(
      "Esmalte em gel UV/LED de longa duração.",
    );
    expect(withReviews.gtin).toBe("7891234567890");
    expect(withReviews.category).toBe("Unhas e Esmalteria");
    expect(withReviews.image).toHaveLength(2);
    expect(withReviews.offers?.availability).toBe(
      "https://schema.org/OutOfStock",
    );
    expect(withReviews.aggregateRating).toEqual({
      "@type": "AggregateRating",
      ratingValue: "4.8",
      reviewCount: 5,
      bestRating: "5",
      worstRating: "1",
    });
    expect(withReviews.review).toHaveLength(1);
  });
});

describe("publicPages", () => {
  it("lists core indexable storefront routes without private paths", () => {
    const paths = Object.values(publicPages).map((p) => p.path);
    expect(paths).toContain("/");
    expect(paths).toContain("/categorias");
    expect(paths).toContain("/contato");
    expect(paths).not.toContain("/login");
    expect(paths).not.toContain("/app");
    expect(paths).not.toContain("/checkout");
  });
});

describe("buildCollectionPageSchema", () => {
  it("generates valid CollectionPage schema with item list", () => {
    const schema = buildCollectionPageSchema({
      name: "Alongamento de Unhas",
      description: "<p>Produtos de <b>alongamento</b> de alta qualidade.</p>",
      path: "/categoria/alongamento-unhas",
      items: [
        { name: "Gel Any Lovy", path: "/produto/gel-any-lovy" },
        { name: "Molde F1 Kaisa", path: "/produto/molde-f1-kaisa" },
      ],
    });

    expect(schema["@type"]).toBe("CollectionPage");
    expect(schema.name).toBe("Alongamento de Unhas");
    expect(schema.description).toBe("Produtos de alongamento de alta qualidade.");
    expect(schema.url).toContain("/categoria/alongamento-unhas");
    expect(schema.mainEntity?.["@type"]).toBe("ItemList");
    expect(schema.mainEntity?.numberOfItems).toBe(2);
    expect(schema.mainEntity?.itemListElement[0]?.name).toBe("Gel Any Lovy");
  });
});

describe("buildFaqSchema", () => {
  it("builds valid FAQPage schema stripping HTML from answers", () => {
    const schema = buildFaqSchema([
      {
        question: "O gel precisa ir para a cabine?",
        answer: "Sim, o gel <strong>polimeriza</strong> na cabine LED/UV.",
      },
    ]);

    expect(schema["@type"]).toBe("FAQPage");
    expect(schema.mainEntity).toHaveLength(1);
    expect(schema.mainEntity[0]?.name).toBe("O gel precisa ir para a cabine?");
    expect(schema.mainEntity[0]?.acceptedAnswer.text).toBe(
      "Sim, o gel polimeriza na cabine LED/UV.",
    );
  });
});

describe("buildArticleSchema", () => {
  it("builds valid Article schema with author and publisher", () => {
    const schema = buildArticleSchema({
      title: "Guia de Alongamento",
      description: "Tudo sobre gel.",
      path: "/guia/alongamento-unhas-em-gel-guia-completo",
      datePublished: "2026-11-26",
      dateModified: "2026-11-26",
    });

    expect(schema["@type"]).toBe("Article");
    expect(schema.headline).toBe("Guia de Alongamento");
    expect(schema.datePublished).toBe("2026-11-26");
    expect(schema.author.name).toBe("Mistura Feminina Cosméticos");
  });
});

describe("categorySeoContent & nailGuidesData", () => {
  it("provides rich SEO content for priority categories", () => {
    const alongamento = getCategorySeoContent("alongamento-unhas");
    expect(alongamento).not.toBeNull();
    expect(alongamento?.heading).toContain("Alongamento de Unhas");
    expect(alongamento?.tips.length).toBeGreaterThan(0);
    expect(alongamento?.faqs.length).toBeGreaterThan(0);
    expect(alongamento?.relatedCategories.length).toBeGreaterThan(0);

    const esmalteGel = getCategorySeoContent("esmalte-em-gel");
    expect(esmalteGel).not.toBeNull();

    const alicates = getCategorySeoContent("alicates-e-cortadores");
    expect(alicates).not.toBeNull();
  });

  it("contains 4 comprehensive nail guides with complete metadata", () => {
    expect(NAIL_GUIDES.length).toBe(4);
    for (const guide of NAIL_GUIDES) {
      expect(guide.slug).toBeTruthy();
      expect(guide.title).toBeTruthy();
      expect(guide.contentHtml).toContain("<h2>");
      expect(guide.faqs.length).toBeGreaterThan(0);
      expect(guide.relatedProducts.length).toBeGreaterThan(0);
      expect(guide.relatedCategories.length).toBeGreaterThan(0);
      expect(getNailGuideBySlug(guide.slug)).toEqual(guide);
    }
  });
});
