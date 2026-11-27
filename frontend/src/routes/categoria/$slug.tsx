import { Link, createFileRoute, redirect } from "@tanstack/solid-router";
import ChevronRight from "lucide-solid/icons/chevron-right";
import Search from "lucide-solid/icons/search";
import { CatalogListingView } from "../../features/storefront/components/CatalogListingView";
import { StoreShell } from "../../features/storefront/components/StoreShell";
import {
  LEGACY_CATEGORY_REDIRECTS,
  getLegacyCategoryRedirect,
} from "../../features/storefront/data/categoryRedirects";
import { getCategorySeoContent } from "../../features/storefront/data/categorySeoContent";
import { storefrontStore } from "../../features/storefront/store";
import type { CategoryNode } from "../../features/storefront/types";
import { ApiError, api } from "../../lib/api";
import {
  buildBreadcrumbSchema,
  buildCollectionPageSchema,
  buildFaqSchema,
  seoHead,
} from "../../lib/seo";

export { LEGACY_CATEGORY_REDIRECTS };

export const Route = createFileRoute("/categoria/$slug")({
  loader: async ({ params }) => {
    const slug = (params.slug || "").toLowerCase().trim();
    const clientRedirect = getLegacyCategoryRedirect(slug);
    if (clientRedirect) {
      throw redirect({ to: clientRedirect, replace: true });
    }

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
    const ancestors = cat?.ancestors ?? [];
    const seoData = getCategorySeoContent(params.slug);

    const schemaItems = [
      { name: "Início", path: "/" },
      { name: "Categorias", path: "/categorias" },
      ...(ancestors.length > 0
        ? ancestors.map((a) => ({ name: a.name, path: `/categoria/${a.slug}` }))
        : [{ name, path: `/categoria/${params.slug}` }]),
    ];

    const title =
      cat?.seo_title ||
      (seoData ? `${seoData.heading} | Mistura Feminina` : `${name} | Mistura Feminina`);
    const description =
      cat?.seo_description ||
      seoData?.intro ||
      cat?.description ||
      `Confira nossa seleção de ${name} na Mistura Feminina. Conheça os produtos disponíveis e encontre opções para sua rotina de beleza.`;

    const schemas: Array<Record<string, unknown>> = [
      buildBreadcrumbSchema(schemaItems),
      buildCollectionPageSchema({
        name: title,
        description,
        path: `/categoria/${params.slug}`,
      }),
    ];

    if (seoData && seoData.faqs.length > 0) {
      schemas.push(buildFaqSchema(seoData.faqs));
    }

    return seoHead({
      title,
      description,
      path: `/categoria/${params.slug}`,
      noindex: !cat,
      jsonLd: schemas,
    });
  },
  component: CategoryPage,
});

function CategoryPage() {
  const params = Route.useParams();
  const catMeta = Route.useLoaderData();

  if (!catMeta()) {
    return (
      <StoreShell>
        <div class="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6 lg:py-24">
          <nav aria-label="Navegação estrutural" class="mb-8 flex items-center justify-center gap-1.5 text-xs text-zinc-500">
            <Link to="/" class="hover:text-[#93509e]">Início</Link>
            <ChevronRight class="size-3 text-zinc-400" />
            <Link to="/categorias" class="hover:text-[#93509e]">Categorias</Link>
            <ChevronRight class="size-3 text-zinc-400" />
            <span class="font-medium text-zinc-700">Categoria não encontrada</span>
          </nav>

          <div class="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-[#FCE7F6] text-[#93509e]">
            <Search class="size-7" aria-hidden="true" />
          </div>
          <h1 class="text-2xl font-bold tracking-tight text-[#2E1049] sm:text-3xl">
            Categoria não encontrada
          </h1>
          <p class="mx-auto mt-3 max-w-md text-sm text-zinc-600 sm:text-base">
            O departamento que você tentou acessar não foi encontrado ou teve seu endereço atualizado.
          </p>
          <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/categorias"
              class="inline-flex items-center justify-center rounded-lg bg-[#93509e] px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-[#7c3f87]"
            >
              Ver todas as categorias
            </Link>
            <Link
              to="/"
              class="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-5 py-2.5 text-sm font-medium text-zinc-700 shadow-xs transition-colors hover:bg-zinc-50"
            >
              Voltar ao início
            </Link>
          </div>
        </div>
      </StoreShell>
    );
  }

  const breadcrumbs = () => {
    const crumbs: Array<{ label: string; to?: string }> = [
      { label: "Categorias", to: "/categorias" },
    ];
    const ancestors = catMeta()?.ancestors ?? [];
    if (ancestors.length > 0) {
      ancestors.forEach((anc, idx) => {
        const isLast = idx === ancestors.length - 1;
        crumbs.push({
          label: anc.name,
          to: isLast ? undefined : `/categoria/${anc.slug}`,
        });
      });
    } else {
      crumbs.push({ label: catMeta()?.name || params().slug });
    }
    return crumbs;
  };

  return (
    <CatalogListingView
      title={catMeta()?.name || `Departamento: ${params().slug}`}
      subtitle={catMeta()?.description}
      bannerImage={catMeta()?.banner_desktop_path}
      bannerMobileImage={catMeta()?.banner_mobile_path}
      bannerAlt={catMeta()?.name}
      breadcrumbs={breadcrumbs()}
      subCategories={(catMeta()?.children ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
      }))}
      endpoint={`/catalog/categories/${params().slug}`}
      brands={storefrontStore.bootstrap().brands}
      categorySlug={params().slug}
    />
  );
}
