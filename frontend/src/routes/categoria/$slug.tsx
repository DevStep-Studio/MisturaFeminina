import { createFileRoute } from "@tanstack/solid-router";
import { createResource } from "solid-js";
import { CatalogListingView } from "../../features/storefront/components/CatalogListingView";
import { storefrontStore } from "../../features/storefront/store";
import type { CategoryNode } from "../../features/storefront/types";
import { api } from "../../lib/api";
import { seoHead } from "../../lib/seo";

export const Route = createFileRoute("/categoria/$slug")({
  head: ({ params }) =>
    seoHead({
      title: `Categoria ${params.slug} — Mistura Feminina Cosméticos`,
      description: `Produtos da categoria ${params.slug} na Mistura Feminina Cosméticos.`,
      path: `/categoria/${params.slug}`,
    }),
  component: CategoryPage,
});

function CategoryPage() {
  const params = Route.useParams();
  const [catMeta] = createResource(
    () => params().slug,
    async (slug) => {
      try {
        const res = await api<{ data: { category?: CategoryNode } }>(
          `/catalog/categories/${slug}?per_page=1`,
          { authenticated: false },
        );
        return res.data?.category ?? null;
      } catch {
        return null;
      }
    },
  );

  return (
    <CatalogListingView
      title={catMeta()?.name || `Departamento: ${params().slug}`}
      subtitle={catMeta()?.description}
      breadcrumbs={[
        { label: "Categorias", to: "/categorias" },
        { label: catMeta()?.name || params().slug },
      ]}
      endpoint={`/catalog/categories/${params().slug}`}
      brands={storefrontStore.bootstrap().brands}
    />
  );
}
