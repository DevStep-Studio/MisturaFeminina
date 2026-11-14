import { siteSettings } from "./site";

export const site = siteSettings(import.meta.env, import.meta.env.DEV);

interface SeoOptions {
  title: string;
  description: string;
  path: string;
  image?: string;
  noindex?: boolean;
  jsonLd?: Record<string, unknown>;
}

export function seoHead(options: SeoOptions) {
  const title = `${options.title} | ${site.name}`;
  const canonical = new URL(options.path, site.url).href;
  const image = new URL(options.image || "/og-cover.png", site.url).href;
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
      ...(options.jsonLd ? [{ "script:ld+json": options.jsonLd }] : []),
    ],
    links: [{ rel: "canonical", href: canonical }],
  };
}
