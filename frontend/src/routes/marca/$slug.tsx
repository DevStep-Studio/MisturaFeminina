import { createFileRoute, redirect } from "@tanstack/solid-router";
import { CatalogListingView } from "../../features/storefront/components/CatalogListingView";
import type { BrandItem } from "../../features/storefront/types";
import { ApiError, api } from "../../lib/api";
import { buildBreadcrumbSchema, seoHead } from "../../lib/seo";

export const Route = createFileRoute("/marca/$slug")({
  loader: async ({ params }) => {
    try {
      const res = await api<{ data: { brand?: BrandItem } }>(
        `/catalog/brands/${params.slug}?per_page=1`,
        { authenticated: false },
      );
      return res.data?.brand ?? null;
    } catch (err) {
      if (err instanceof ApiError && err.status === 301 && err.redirectTo) {
        throw redirect({ to: err.redirectTo, replace: true });
      }
      return null;
    }
  },
  head: ({ loaderData, params }) => {
    const brand = loaderData;
    const name = brand?.name || params.slug;
    return seoHead({
      title: brand?.seo_title || `${name} | Mistura Feminina`,
      description:
        brand?.seo_description ||
        brand?.description ||
        `Confira a linha completa de produtos ${name} na Mistura Feminina. Conheça as opções e compre com envio para todo o Brasil.`,
      path: `/marca/${params.slug}`,
      noindex: !brand,
      jsonLd: buildBreadcrumbSchema([
        { name: "Início", path: "/" },
        { name: "Marcas", path: "/marcas" },
        { name, path: `/marca/${params.slug}` },
      ]),
    });
  },
  component: BrandPage,
});

function BrandPage() {
  const params = Route.useParams();
  const brandMeta = Route.useLoaderData();

  return (
    <CatalogListingView
      title={brandMeta()?.name || `Marca: ${params().slug}`}
      subtitle={brandMeta()?.description}
      breadcrumbs={[
        { label: "Marcas", to: "/marcas" },
        { label: brandMeta()?.name || params().slug },
      ]}
      endpoint={`/catalog/brands/${params().slug}`}
    />
  );
}
