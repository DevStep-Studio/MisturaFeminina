import type { Plugin } from "vite";
import { publicPages, siteSettings } from "../src/lib/site.ts";

const xmlEscape = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );

export function seoAssets(
  env: Record<string, string>,
  development: boolean,
): Plugin {
  const site = siteSettings(env, development);
  const assets = {
    "health.json": JSON.stringify({
      status: "ok",
      version: env.VITE_APP_VERSION || "0.1.0",
    }),
    "robots.txt": `User-agent: *\n${site.indexable ? "Allow: /" : "Disallow: /"}\n\nSitemap: ${site.url}/sitemap.xml\n`,
    "sitemap.xml": `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
      site.indexable
        ? Object.values(publicPages)
            .map(
              (page) =>
                `  <url><loc>${xmlEscape(new URL(page.path, site.url).href)}</loc></url>`,
            )
            .join("\n")
        : ""
    }\n</urlset>\n`,
  };
  return {
    name: "devstep-seo-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.split("?")[0]?.slice(1);
        if (
          name !== "robots.txt" &&
          name !== "sitemap.xml" &&
          name !== "health.json"
        )
          return next();
        res.setHeader(
          "Content-Type",
          name.endsWith(".json")
            ? "application/json; charset=utf-8"
            : name.endsWith(".xml")
              ? "application/xml; charset=utf-8"
              : "text/plain; charset=utf-8",
        );
        res.end(assets[name]);
      });
    },
    generateBundle() {
      for (const [fileName, source] of Object.entries(assets))
        this.emitFile({ type: "asset", fileName, source });
    },
  };
}
