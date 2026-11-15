import { siteSettings } from "./site";

export const site = siteSettings(import.meta.env, import.meta.env.DEV);

export interface BreadcrumbItem {
  name: string;
  path?: string;
}

export interface SeoProductOptions {
  name: string;
  description?: string | null;
  sku: string;
  image?: string | null;
  brand?: string | null;
  priceCents: number;
  promoPriceCents?: number | null;
  inStock: boolean;
  slug: string;
}

export interface SeoOptions {
  title: string;
  description: string;
  path: string;
  image?: string;
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
    "@type": "Organization",
    name: overrides?.name || site.name,
    url: overrides?.url || site.url,
    logo: new URL(overrides?.logo || "/logo-mf.png", site.url).href,
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
  const imageUrl = product.image
    ? new URL(product.image, site.url).href
    : new URL("/placeholder-product.svg", site.url).href;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description || product.name,
    sku: product.sku,
    image: [imageUrl],
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
      availability: product.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: {
        "@type": "Organization",
        name: site.name,
      },
    },
  };
}

export function seoHead(options: SeoOptions) {
  const title = `${options.title} | ${site.name}`;
  const canonical = new URL(options.path, site.url).href;
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
      { name: "description", content: options.description },
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
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "pt_BR" },
      { property: "og:site_name", content: site.name },
      { property: "og:title", content: title },
      { property: "og:description", content: options.description },
      { property: "og:url", content: canonical },
      { property: "og:image", content: image },
      { property: "og:image:alt", content: site.name },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: options.description },
      { name: "twitter:image", content: image },
    ],
    links: [{ rel: "canonical", href: canonical }],
    scripts: schemas.map((schema) => ({
      type: "application/ld+json",
      children: JSON.stringify(schema),
    })),
  };
}
