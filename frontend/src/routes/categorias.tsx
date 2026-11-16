import { createFileRoute, Link } from "@tanstack/solid-router";
import { For, Show, createResource } from "solid-js";
import { CatalogBanner } from "../features/storefront/components/CatalogListingView";
import { SectionHeading } from "../features/storefront/components/SectionHeading";
import { StoreShell } from "../features/storefront/components/StoreShell";
import type { CategoryNode } from "../features/storefront/types";
import { api } from "../lib/api";
import { assetUrl } from "../lib/format";
import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/categorias")({
  head: () =>
    seoHead({
      title: "Todas as Categorias | Mistura Feminina",
      description:
        "Explore todas as categorias de produtos de beleza, maquiagem, cabelos e unhas da Mistura Feminina.",
      path: "/categorias",
    }),
  component: CategoriesDirectoryPage,
});

function CategoriesDirectoryPage() {
  const [categories] = createResource(async () => {
    const res = await api<{ data: CategoryNode[] }>("/catalog/categories", {
      authenticated: false,
    });
    return res.data ?? [];
  });

  return (
    <StoreShell>
      <CatalogBanner
        src="/storage/seed/hero-3-desktop.jpg"
        alt="Frete Grátis para todo Brasil — Envios para todo o país"
      />
      <div class="mx-auto max-w-7xl px-4 py-8">
        <SectionHeading
          as="h1"
          align="left"
          title="Todas as Categorias"
          subtitle="Escolha um departamento para navegar pelos nossos cosméticos e acessórios."
        />

        <Show
          when={!categories.loading}
          fallback={
            <div class="mt-6 h-48 animate-pulse rounded-xl bg-zinc-100" />
          }
        >
          <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <For each={categories() ?? []}>
              {(cat) => (
                <section class="rounded-xl border border-zinc-200 bg-white p-5">
                  <Link
                    to="/categoria/$slug"
                    params={{ slug: cat.slug }}
                    class="flex items-center gap-3 hover:text-[var(--mf-primary)]"
                  >
                    <img
                      src={assetUrl(cat.image_path)}
                      alt={cat.name}
                      class="h-14 w-14 rounded-lg border border-zinc-200 bg-zinc-50 object-cover"
                    />
                    <div>
                      <h2 class="text-base font-bold text-[#93509e]">
                        {cat.name}
                      </h2>
                      <Show when={cat.description}>
                        <p class="line-clamp-2 text-xs text-zinc-600">
                          {cat.description}
                        </p>
                      </Show>
                    </div>
                  </Link>

                  <Show when={cat.children && cat.children.length > 0}>
                    <ul class="mt-4 flex flex-wrap gap-1.5 border-t border-zinc-100 pt-3">
                      <For each={cat.children}>
                        {(child) => (
                          <li>
                            <Link
                              to="/categoria/$slug"
                              params={{ slug: child.slug }}
                              class="inline-block rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:border-[var(--mf-primary)] hover:text-[var(--mf-primary)]"
                            >
                              {child.name}
                            </Link>
                          </li>
                        )}
                      </For>
                    </ul>
                  </Show>
                </section>
              )}
            </For>
          </div>
        </Show>
      </div>
    </StoreShell>
  );
}
