import { createFileRoute } from "@tanstack/solid-router";
import { CatalogListingView } from "../features/storefront/components/CatalogListingView";
import { storefrontStore } from "../features/storefront/store";
import { buildBreadcrumbSchema, seoHead } from "../lib/seo";

export const Route = createFileRoute("/novidades")({
  head: () =>
    seoHead({
      title: "Lançamentos e Novidades | Mistura Feminina",
      description:
        "Descubra os lançamentos mais recentes em produtos de beleza, maquiagem e cuidados pessoais na Mistura Feminina.",
      path: "/novidades",
      jsonLd: buildBreadcrumbSchema([
        { name: "Início", path: "/" },
        { name: "Novidades", path: "/novidades" },
      ]),
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
