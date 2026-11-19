import { siteSettings } from "./site";

export const site = siteSettings(import.meta.env, import.meta.env.DEV);

export interface BreadcrumbItem {
  name: string;
  path?: string;
}

export interface SeoProductReview {
  author_name: string;
  rating: number;
  body: string;
  created_at?: string;
}

export interface SeoProductOptions {
  name: string;
  description?: string | null;
  sku: string;
  gtin?: string | null;
  category?: string | null;
  image?: string | null;
  images?: string[];
  brand?: string | null;
  priceCents: number;
  promoPriceCents?: number | null;
  inStock: boolean;
  slug: string;
  ratingValue?: number;
  reviewCount?: number;
  reviews?: SeoProductReview[];
}

/** Strips HTML tags and normalizes whitespace for clean meta/JSON-LD descriptions. */
export function stripHtml(input?: string | null): string {
  if (!input) return "";
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface SeoOptions {
  title: string;
  description: string;
  path: string;
  image?: string;
  type?: "website" | "product" | "article";
  price?: string;
  currency?: string;
  noindex?: boolean;
  googleSiteVerification?: string;
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
}

export function buildOrganizationSchema(overrides?: {
  name?: string;
  url?: string;
  logo?: string;
  phone?: string;
  email?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": ["Organization", "OnlineStore"],
    name: overrides?.name || site.name,
    url: overrides?.url || site.url,
    logo: new URL(overrides?.logo || "/logo-mf.png", site.url).href,
    description:
      "Loja online oficial da Mistura Feminina Cosméticos. Beleza, maquiagem, esmaltes em gel, skincare e produtos profissionais.",
    address: {
      "@type": "PostalAddress",
      addressCountry: "BR",
    },
    contactPoint: overrides?.phone
      ? [
          {
            "@type": "ContactPoint",
            telephone: overrides.phone,
            contactType: "customer service",
            availableLanguage: ["Portuguese"],
          },
        ]
      : undefined,
    sameAs: [],
  };
}

export function buildWebSiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.name,
    url: site.url,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${site.url}/buscar?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function buildBreadcrumbSchema(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      ...(item.path ? { item: new URL(item.path, site.url).href } : {}),
    })),
  };
}

export function buildProductSchema(product: SeoProductOptions) {
  const effectivePrice = (
    (product.promoPriceCents && product.promoPriceCents < product.priceCents
      ? product.promoPriceCents
      : product.priceCents) / 100
  ).toFixed(2);

  const productUrl = new URL(`/produto/${product.slug}`, site.url).href;
  const rawImages = [
    ...(product.image ? [product.image] : []),
    ...(product.images ?? []),
  ].filter((img): img is string => Boolean(img && img.trim()));
  const uniqueImages = Array.from(
    new Set(rawImages.map((img) => new URL(img, site.url).href)),
  );
  const imageList =
    uniqueImages.length > 0
      ? uniqueImages
      : [new URL("/placeholder-product.svg", site.url).href];

  const cleanDescription = stripHtml(product.description) || product.name;
  const cleanGtin = product.gtin?.trim();
  const hasValidGtin = Boolean(cleanGtin && /^\d{8,14}$/.test(cleanGtin));
  const cleanCategory = product.category?.trim();

  const validUntil = new Date(new Date().getFullYear() + 1, 11, 31)
    .toISOString()
    .split("T")[0];

  const validReviews = (product.reviews ?? [])
    .filter((r) => r.author_name && r.rating >= 1 && r.rating <= 5)
    .slice(0, 5)
    .map((r) => ({
      "@type": "Review",
      author: {
        "@type": "Person",
        name: r.author_name,
      },
      reviewRating: {
        "@type": "Rating",
        ratingValue: r.rating,
        bestRating: 5,
        worstRating: 1,
      },
      ...(r.body ? { reviewBody: stripHtml(r.body) } : {}),
      ...(r.created_at ? { datePublished: r.created_at.split("T")[0] } : {}),
    }));

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: cleanDescription,
    sku: product.sku,
    ...(hasValidGtin ? { gtin: cleanGtin } : {}),
    ...(cleanCategory ? { category: cleanCategory } : {}),
    image: imageList,
    ...(product.brand
      ? {
          brand: {
            "@type": "Brand",
            name: product.brand,
          },
        }
      : {}),
    offers: {
      "@type": "Offer",
      url: productUrl,
      priceCurrency: "BRL",
      price: effectivePrice,
      priceValidUntil: validUntil,
      availability: product.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: {
        "@type": "Organization",
        name: site.name,
      },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "BR",
        returnPolicyCategory:
          "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: 7,
        returnMethod: "https://schema.org/ReturnByMail",
        returnFees: "https://schema.org/FreeReturn",
        url: new URL("/trocas-e-devolucoes", site.url).href,
      },
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: {
          "@type": "MonetaryAmount",
          value: "0.00",
          currency: "BRL",
        },
        shippingDestination: {
          "@type": "DefinedRegion",
          addressCountry: "BR",
        },
        deliveryTime: {
          "@type": "ShippingDeliveryTime",
          handlingTime: {
            "@type": "QuantitativeValue",
            minValue: 1,
            maxValue: 2,
            unitCode: "d",
          },
          transitTime: {
            "@type": "QuantitativeValue",
            minValue: 2,
            maxValue: 7,
            unitCode: "d",
          },
        },
      },
    },
    ...(product.ratingValue && product.reviewCount && product.reviewCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: product.ratingValue.toFixed(1),
            reviewCount: product.reviewCount,
            bestRating: "5",
            worstRating: "1",
          },
        }
      : {}),
    ...(validReviews.length > 0 ? { review: validReviews } : {}),
  };
}

export function seoHead(options: SeoOptions) {
  const brandName = "Mistura Feminina";
  const title = options.title.toLowerCase().includes("mistura feminina")
    ? options.title
    : `${options.title} | ${brandName}`;
  const cleanDescription = stripHtml(options.description);
  const canonical = new URL(options.path.split("?")[0], site.url).href;
  const image = new URL(options.image || "/og-cover.png", site.url).href;
  const verification =
    options.googleSiteVerification ||
    import.meta.env.VITE_GOOGLE_SITE_VERIFICATION?.trim() ||
    "";

  const schemas = options.jsonLd
    ? Array.isArray(options.jsonLd)
      ? options.jsonLd
      : [options.jsonLd]
    : [];

  return {
    meta: [
      { title },
      { name: "description", content: cleanDescription },
      {
        name: "robots",
        content:
          options.noindex || !site.indexable
            ? "noindex, nofollow"
            : "index, follow",
      },
      ...(verification
        ? [{ name: "google-site-verification", content: verification }]
        : []),
      { property: "og:type", content: options.type || "website" },
      { property: "og:locale", content: "pt_BR" },
      { property: "og:site_name", content: site.name },
      { property: "og:title", content: title },
      { property: "og:description", content: cleanDescription },
      { property: "og:url", content: canonical },
      { property: "og:image", content: image },
      { property: "og:image:alt", content: site.name },
      ...(options.price
        ? [
            { property: "product:price:amount", content: options.price },
            {
              property: "product:price:currency",
              content: options.currency || "BRL",
            },
          ]
        : []),
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: cleanDescription },
      { name: "twitter:image", content: image },
    ],
    links: [{ rel: "canonical", href: canonical }],
    scripts: schemas.map((schema) => ({
      type: "application/ld+json",
      children: JSON.stringify(schema),
    })),
  };
}
