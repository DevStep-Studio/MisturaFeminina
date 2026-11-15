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
    "robots.txt": `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /dashboard/\nDisallow: /checkout\nDisallow: /carrinho\nDisallow: /minha-conta\nDisallow: /login\nDisallow: /entrar\nDisallow: /cadastro\nDisallow: /forgot-password\nDisallow: /reset-password\nDisallow: /buscar\nDisallow: /api/\n\nSitemap: ${site.url}/sitemap.xml\n`,
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
      server.middlewares.use(async (req, res, next) => {
        const name = req.url?.split("?")[0]?.slice(1);
        if (
          name !== "robots.txt" &&
          name !== "sitemap.xml" &&
          name !== "health.json"
        )
          return next();

        if (name === "sitemap.xml" || name === "robots.txt") {
          try {
            const backendUrl = env.VITE_AUTH_URL || "http://localhost:8432";
            const resp = await fetch(`${backendUrl}/${name}`);
            if (resp.ok) {
              const text = await resp.text();
              res.setHeader(
                "Content-Type",
                name === "sitemap.xml"
                  ? "application/xml; charset=utf-8"
                  : "text/plain; charset=utf-8",
              );
              res.end(text);
              return;
            }
          } catch {
            // fallback to local assets
          }
        }

        res.setHeader(
          "Content-Type",
          name.endsWith(".json")
            ? "application/json; charset=utf-8"
            : name.endsWith(".xml")
              ? "application/xml; charset=utf-8"
              : "text/plain; charset=utf-8",
        );
        res.end(assets[name as keyof typeof assets]);
      });
    },
    generateBundle() {
      for (const [fileName, source] of Object.entries(assets))
        this.emitFile({ type: "asset", fileName, source });
    },
  };
}
