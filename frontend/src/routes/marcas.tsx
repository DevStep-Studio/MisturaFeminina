import { createFileRoute, Link } from "@tanstack/solid-router";
import { For, Show, createResource } from "solid-js";
import { StoreShell } from "../features/storefront/components/StoreShell";
import type { BrandItem } from "../features/storefront/types";
import { api } from "../lib/api";
import { assetUrl } from "../lib/format";
import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/marcas")({
  head: () =>
    seoHead({
      title: "Marcas Parceiras — Mistura Feminina Cosméticos",
      description:
        "Conheça todas as marcas disponíveis na Mistura Feminina Cosméticos.",
      path: "/marcas",
    }),
  component: BrandsDirectoryPage,
});

function BrandsDirectoryPage() {
  const [brands] = createResource(async () => {
    const res = await api<{ data: BrandItem[] }>("/catalog/brands", {
      authenticated: false,
    });
    return res.data ?? [];
  });

  return (
    <StoreShell>
      <div class="mx-auto max-w-7xl px-4 py-8">
        <h1 class="text-2xl font-bold text-zinc-900 sm:text-3xl">
          Marcas Parceiras
        </h1>
        <p class="mt-1 text-sm text-zinc-600">
          Selecione uma marca para visualizar os produtos disponíveis.
        </p>

        <Show
          when={!brands.loading}
          fallback={
            <div class="mt-6 h-48 animate-pulse rounded-xl bg-zinc-100" />
          }
        >
          <div class="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <For each={brands() ?? []}>
              {(brand) => (
                <Link
                  to="/marca/$slug"
                  params={{ slug: brand.slug }}
                  class="flex flex-col items-center justify-between rounded-xl border border-zinc-200 bg-white p-5 text-center transition hover:border-[var(--mf-primary)]"
                >
                  <img
                    src={assetUrl(brand.logo_path)}
                    alt={brand.name}
                    class="h-16 w-auto max-w-[160px] object-contain"
                  />
                  <div class="mt-4">
                    <h2 class="text-sm font-bold text-zinc-900">
                      {brand.name}
                    </h2>
                    <Show when={brand.products_count !== undefined}>
                      <p class="text-xs text-zinc-500">
                        {brand.products_count} produtos
                      </p>
                    </Show>
                  </div>
                </Link>
              )}
            </For>
          </div>
        </Show>
      </div>
    </StoreShell>
  );
}
