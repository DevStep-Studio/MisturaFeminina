import { createFileRoute } from "@tanstack/solid-router";
import { CatalogListingView } from "../features/storefront/components/CatalogListingView";
import { storefrontStore } from "../features/storefront/store";
import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/novidades")({
  head: () =>
    seoHead({
      title: "Novidades e Lançamentos — Mistura Feminina Cosméticos",
      description:
        "Confira os últimos lançamentos em cosméticos, unhas e skincare.",
      path: "/novidades",
    }),
  component: NewArrivalsPage,
});

function NewArrivalsPage() {
  return (
    <CatalogListingView
      title="Novidades e Lançamentos"
      subtitle="As últimas novidades recém-chegadas ao nosso estoque."
      breadcrumbs={[{ label: "Novidades" }]}
      endpoint="/catalog/products"
      fixedParams={{ collection: "novidades" }}
      brands={storefrontStore.bootstrap().brands}
    />
  );
}
