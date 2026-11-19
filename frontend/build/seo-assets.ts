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
    "robots.txt": `User-agent: *\nAllow: /\nAllow: /assets/\nAllow: /storage/\nAllow: /*.css$\nAllow: /*.js$\nAllow: /*.png$\nAllow: /*.jpg$\nAllow: /*.jpeg$\nAllow: /*.webp$\nAllow: /*.avif$\nAllow: /*.svg$\nAllow: /*.woff2$\nDisallow: /admin/\nDisallow: /dashboard/\nDisallow: /app\nDisallow: /checkout\nDisallow: /carrinho\nDisallow: /favoritos\nDisallow: /minha-conta\nDisallow: /pedido/\nDisallow: /login\nDisallow: /entrar\nDisallow: /cadastro\nDisallow: /forgot-password\nDisallow: /reset-password\nDisallow: /buscar\nDisallow: /api/\nDisallow: /*?*q=\nDisallow: /*?*collection=\nDisallow: /*?*sort=\nDisallow: /*?*min_price=\nDisallow: /*?*max_price=\nDisallow: /*?*brand=\nDisallow: /*?*brands=\nDisallow: /*?*category=\nDisallow: /*?*categories=\nDisallow: /*?*in_stock=\n\nSitemap: ${site.url}/sitemap.xml\n`,
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
    "llms.txt": `# Mistura Feminina Cosméticos\n\n> Loja online oficial de cosméticos, produtos de beleza, maquiagem, esmaltaria e cuidados pessoais no Brasil.\n\nA Mistura Feminina Cosméticos é um e-commerce brasileiro especializado em cosméticos, maquiagem, esmaltes em gel, produtos profissionais para unhas, cuidados faciais (skincare), cronograma capilar e acessórios de beleza. Oferece envio para todo o território nacional, parcelamento em até 6x sem juros e pagamento via Pix com desconto.\n\n## Catálogo e Seções Principais\n- [Página Inicial](${site.url}/): Vitrines, ofertas da semana, cupons de desconto e produtos em destaque.\n- [Todas as Categorias](${site.url}/categorias): Navegação completa pelas categorias de beleza e cosméticos.\n- [Marcas Oficiais](${site.url}/marcas): Catálogo de marcas parceiras e produtos originais certificados.\n- [Promoções e Ofertas](${site.url}/promocoes): Produtos com preços promocionais e descontos exclusivos.\n- [Lançamentos e Novidades](${site.url}/novidades): Os mais recentes lançamentos do mercado de estética e cosméticos.\n\n## Categorias em Destaque\n- [Unhas e Esmalteria](${site.url}/categoria/unhas-e-esmalteria): Esmaltes em gel, cabines LED/UV, géis de alongamento e preparadores.\n- [Maquiagem](${site.url}/categoria/maquiagem): Bases, batons, sombras, fixadores e maquiagem profissional.\n- [Cuidados Faciais (Skincare)](${site.url}/categoria/skincare): Séruns, hidratantes, sabonetes faciais e tratamentos.\n- [Cabelos](${site.url}/categoria/cabelos): Máscaras de tratamento, óleos reparadores e kits capilares.\n- [Corpo e Banho](${site.url}/categoria/corpo-e-banho): Hidratantes corporais, esfoliantes e autocuidado diário.\n- [Acessórios Profissionais](${site.url}/categoria/acessorios-pro): Pincéis, lixas elétricas, luminárias e organizadores.\n\n## Políticas Comerciais e Atendimento ao Cliente\n- [Política de Entrega e Frete](${site.url}/entrega): Prazos de envio, cálculo de CEP, rastreamento e frete grátis conforme valor mínimo.\n- [Trocas e Devoluções](${site.url}/trocas-e-devolucoes): Diretrizes de trocas, devoluções e garantia de 7 dias conforme o Código de Defesa do Consumidor.\n- [Formas de Pagamento](${site.url}/pagamento): Informações sobre Pix, cartões de crédito aceitos, parcelamento sem juros e segurança nas transações.\n- [Dúvidas Frequentes (FAQ)](${site.url}/duvidas): Esclarecimentos sobre pedidos, prazos de entrega, status e produtos.\n- [Fale Conosco e Atendimento](${site.url}/contato): Canais oficiais de suporte via WhatsApp e e-mail comercial.\n- [Política de Privacidade (LGPD)](${site.url}/privacidade): Tratamento seguro e transparente de dados pessoais dos clientes.\n- [Termos de Uso](${site.url}/termos): Condições gerais de compra, contratação e navegação na loja online.\n\n---\nInformações atualizadas a partir do catálogo oficial da Mistura Feminina Cosméticos.\n`,
  };
  return {
    name: "devstep-seo-assets",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const name = req.url?.split("?")[0]?.slice(1);
        if (
          name !== "robots.txt" &&
          name !== "sitemap.xml" &&
          name !== "health.json" &&
          name !== "llms.txt"
        )
          return next();

        if (
          name === "sitemap.xml" ||
          name === "robots.txt" ||
          name === "llms.txt"
        ) {
          try {
            const backendUrl = env.VITE_AUTH_URL || "http://localhost:8000";
            const resp = await fetch(`${backendUrl}/${name}`);
            if (resp.ok) {
              const text = await resp.text();
              res.setHeader(
                "Content-Type",
                name === "sitemap.xml"
                  ? "application/xml; charset=utf-8"
                  : name === "llms.txt"
                    ? "text/markdown; charset=utf-8"
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
              : name === "llms.txt"
                ? "text/markdown; charset=utf-8"
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
