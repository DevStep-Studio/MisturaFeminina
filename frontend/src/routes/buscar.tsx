import { createFileRoute } from "@tanstack/solid-router";
import { CatalogListingView } from "../features/storefront/components/CatalogListingView";
import { storefrontStore } from "../features/storefront/store";
import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/buscar")({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  head: () =>
    seoHead({
      title: "Buscar Produtos — Mistura Feminina Cosméticos",
      description:
        "Pesquise cosméticos, esmaltes, skincare, cabelos e acessórios na Mistura Feminina.",
      path: "/buscar",
    }),
  component: SearchPage,
});

function SearchPage() {
  const search = Route.useSearch();
  const query = () => (search().q ?? "").trim();

  return (
    <CatalogListingView
      title={query() ? `Resultados para "${query()}"` : "Catálogo completo"}
      subtitle={
        query()
          ? "Confira os produtos correspondentes à sua busca."
          : "Explore todos os itens disponíveis na Mistura Feminina Cosméticos."
      }
      breadcrumbs={[{ label: query() ? `Busca: ${query()}` : "Catálogo" }]}
      endpoint="/catalog/search"
      fixedParams={query() ? { q: query() } : undefined}
      brands={storefrontStore.bootstrap().brands}
      emptyMessage={
        query()
          ? `Não encontramos resultados para "${query()}".`
          : "Nenhum produto disponível com os filtros selecionados."
      }
    />
  );
}
