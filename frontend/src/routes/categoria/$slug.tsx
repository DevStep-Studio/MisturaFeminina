import { createFileRoute, redirect } from "@tanstack/solid-router";
import { CatalogListingView } from "../../features/storefront/components/CatalogListingView";
import { storefrontStore } from "../../features/storefront/store";
import type { CategoryNode } from "../../features/storefront/types";
import { ApiError, api } from "../../lib/api";
import { buildBreadcrumbSchema, seoHead } from "../../lib/seo";

export const Route = createFileRoute("/categoria/$slug")({
  loader: async ({ params }) => {
    try {
      const res = await api<{ data: { category?: CategoryNode } }>(
        `/catalog/categories/${params.slug}?per_page=1`,
        { authenticated: false },
      );
      return res.data?.category ?? null;
    } catch (err) {
      if (err instanceof ApiError && err.status === 301 && err.redirectTo) {
        throw redirect({ to: err.redirectTo, replace: true });
      }
      return null;
    }
  },
  head: ({ loaderData, params }) => {
    const cat = loaderData;
    const name = cat?.name || params.slug;
    return seoHead({
      title: cat?.seo_title || `${name} | Mistura Feminina`,
      description:
        cat?.seo_description ||
        cat?.description ||
        `Confira nossa seleção de ${name} na Mistura Feminina. Conheça os produtos disponíveis e encontre opções para sua rotina de beleza.`,
      path: `/categoria/${params.slug}`,
      noindex: !cat,
      jsonLd: buildBreadcrumbSchema([
        { name: "Início", path: "/" },
        { name: "Categorias", path: "/categorias" },
        { name, path: `/categoria/${params.slug}` },
      ]),
    });
  },
  component: CategoryPage,
});

function CategoryPage() {
  const params = Route.useParams();
  const catMeta = Route.useLoaderData();

  return (
    <CatalogListingView
      title={catMeta()?.name || `Departamento: ${params().slug}`}
      subtitle={catMeta()?.description}
      bannerImage={catMeta()?.banner_desktop_path}
      bannerAlt={catMeta()?.name}
      breadcrumbs={[
        { label: "Categorias", to: "/categorias" },
        { label: catMeta()?.name || params().slug },
      ]}
      endpoint={`/catalog/categories/${params().slug}`}
      brands={storefrontStore.bootstrap().brands}
    />
  );
}
