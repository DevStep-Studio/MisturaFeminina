import { createFileRoute } from "@tanstack/solid-router";
import { createResource } from "solid-js";
import { CatalogListingView } from "../../features/storefront/components/CatalogListingView";
import type { BrandItem } from "../../features/storefront/types";
import { api } from "../../lib/api";
import { buildBreadcrumbSchema, seoHead } from "../../lib/seo";

export const Route = createFileRoute("/marca/$slug")({
  loader: async ({ params }) => {
    try {
      const res = await api<{ data: { brand?: BrandItem } }>(
        `/catalog/brands/${params.slug}?per_page=1`,
        { authenticated: false },
      );
      return res.data?.brand ?? null;
    } catch {
      return null;
    }
  },
  head: ({ loaderData, params }) => {
    const brand = loaderData;
    const name = brand?.name || params.slug;
    return seoHead({
      title: brand?.seo_title || `${name} — Mistura Feminina Cosméticos`,
      description:
        brand?.seo_description ||
        brand?.description ||
        `Encontre produtos oficiais da marca ${name} na Mistura Feminina Cosméticos.`,
      path: `/marca/${params.slug}`,
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
  const [brandMeta] = createResource(
    () => params().slug,
    async (slug) => {
      try {
        const res = await api<{ data: { brand?: BrandItem } }>(
          `/catalog/brands/${slug}?per_page=1`,
          { authenticated: false },
        );
        return res.data?.brand ?? null;
      } catch {
        return null;
      }
    },
  );

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
