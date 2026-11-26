import { createFileRoute } from "@tanstack/solid-router";
import { CatalogListingView } from "../features/storefront/components/CatalogListingView";
import { storefrontStore } from "../features/storefront/store";
import { buildBreadcrumbSchema, seoHead } from "../lib/seo";

export const Route = createFileRoute("/promocoes")({
  head: () =>
    seoHead({
      title: "Ofertas e Promoções | Mistura Feminina",
      description:
        "Confira as melhores ofertas e descontos imperdíveis em cosméticos, esmaltes e maquiagens na Mistura Feminina.",
      path: "/promocoes",
      jsonLd: buildBreadcrumbSchema([
        { name: "Início", path: "/" },
        { name: "Promoções", path: "/promocoes" },
      ]),
    }),
  component: PromotionsPage,
});

function PromotionsPage() {
  const promoBanner = () =>
    storefrontStore.findBanner("promocoes", "/promocoes") ||
    storefrontStore.findBanner("category_top");

  return (
    <CatalogListingView
      title="Ofertas e Promoções"
      subtitle="Produtos selecionados com preços especiais enquanto durarem os estoques."
      breadcrumbs={[{ label: "Promoções" }]}
      endpoint="/catalog/products"
      fixedParams={{ collection: "ofertas" }}
      brands={storefrontStore.bootstrap().brands}
      bannerImage={promoBanner()?.desktop_image_path}
      bannerMobileImage={promoBanner()?.mobile_image_path}
      bannerAlt={promoBanner()?.alt_text || "Ofertas e Promoções"}
      bannerHref={promoBanner()?.cta_url}
    />
  );
}
