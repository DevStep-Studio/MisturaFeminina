import { createFileRoute } from "@tanstack/solid-router";
import { CatalogListingView } from "../features/storefront/components/CatalogListingView";
import { storefrontStore } from "../features/storefront/store";
import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/promocoes")({
  head: () =>
    seoHead({
      title: "Ofertas e Promoções — Mistura Feminina Cosméticos",
      description:
        "Aproveite cosméticos e acessórios com desconto na Mistura Feminina.",
      path: "/promocoes",
    }),
  component: PromotionsPage,
});

function PromotionsPage() {
  return (
    <CatalogListingView
      title="Ofertas e Promoções"
      subtitle="Produtos selecionados com preços especiais enquanto durarem os estoques."
      breadcrumbs={[{ label: "Promoções" }]}
      endpoint="/catalog/products"
      fixedParams={{ collection: "ofertas" }}
      brands={storefrontStore.bootstrap().brands}
    />
  );
}
