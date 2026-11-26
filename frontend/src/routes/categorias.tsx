import { createFileRoute, Link } from "@tanstack/solid-router";
import Bath from "lucide-solid/icons/bath";
import Briefcase from "lucide-solid/icons/briefcase";
import ChevronRight from "lucide-solid/icons/chevron-right";
import Droplet from "lucide-solid/icons/droplet";
import Eye from "lucide-solid/icons/eye";
import Heart from "lucide-solid/icons/heart";
import Layers from "lucide-solid/icons/layers";
import Palette from "lucide-solid/icons/palette";
import Scissors from "lucide-solid/icons/scissors";
import Search from "lucide-solid/icons/search";
import Sparkles from "lucide-solid/icons/sparkles";
import X from "lucide-solid/icons/x";
import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { CatalogBanner } from "../features/storefront/components/CatalogListingView";
import { StoreShell } from "../features/storefront/components/StoreShell";
import { findStoreBanner } from "../features/storefront/store";
import type { CategoryNode } from "../features/storefront/types";
import { api } from "../lib/api";
import { buildBreadcrumbSchema, seoHead } from "../lib/seo";

export const Route = createFileRoute("/categorias")({
  head: () =>
    seoHead({
      title: "Todas as Categorias | Mistura Feminina Cosméticos",
      description:
        "Explore todos os departamentos e categorias da Mistura Feminina: unhas, maquiagens, cuidados faciais, cabelos, corpo e banho e acessórios profissionais.",
      path: "/categorias",
      jsonLd: buildBreadcrumbSchema([
        { name: "Início", path: "/" },
        { name: "Departamentos", path: "/categorias" },
      ]),
    }),
  component: CategoriesDirectoryPage,
});

function getCategoryIcon(cat: CategoryNode) {
  const slug = (cat.slug || cat.name || "").toLowerCase();
  if (slug.includes("unha") || slug.includes("esmalte")) return Sparkles;
  if (slug.includes("cilio") || slug.includes("lash") || slug.includes("olhar") || slug.includes("olho")) return Eye;
  if (slug.includes("maquiag") || slug.includes("make")) return Palette;
  if (slug.includes("facial") || slug.includes("skin") || slug.includes("rosto"))
    return Droplet;
  if (slug.includes("cabelo") || slug.includes("hair")) return Scissors;
  if (slug.includes("corpo") || slug.includes("banho") || slug.includes("body"))
    return Bath;
  if (slug.includes("acessorio") || slug.includes("pro")) return Briefcase;
  return Heart;
}

function CategoriesDirectoryPage() {
  const [searchQuery, setSearchQuery] = createSignal("");

  const [categories] = createResource(async () => {
    const res = await api<{ data: CategoryNode[] }>("/catalog/categories", {
      authenticated: false,
    });
    return res.data ?? [];
  });

  const filteredCategories = createMemo(() => {
    const all = categories() ?? [];
    const q = searchQuery().trim().toLowerCase();
    if (!q) return all;

    return all.filter((cat) => {
      const matchName = cat.name.toLowerCase().includes(q);
      const matchDesc = cat.description?.toLowerCase().includes(q);
      const matchChild = cat.children?.some(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.children?.some((gc) => gc.name.toLowerCase().includes(q)),
      );
      return matchName || matchDesc || matchChild;
    });
  });

  const catBanner = () => findStoreBanner("category_top", "/categorias");

  return (
    <StoreShell>
      <Show when={catBanner()}>
        {(b) => (
          <CatalogBanner
            src={b().desktop_image_path}
            mobileSrc={b().mobile_image_path}
            alt={b().alt_text || b().title}
            href={b().cta_url}
          />
        )}
      </Show>
      <div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {/* Breadcrumb Navigation */}
        <nav aria-label="Navegação estrutural" class="mb-4">
          <ol class="flex items-center gap-1.5 text-xs font-semibold text-[#5B486B]">
            <li>
              <Link to="/" class="transition-colors hover:text-[#93509e]">
                Início
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRight class="size-3.5 text-zinc-400" />
            </li>
            <li class="font-bold text-[#2E0C49]">Departamentos</li>
          </ol>
        </nav>

        {/* Header with Title and Search Filter */}
        <header class="mb-8 flex flex-col gap-4 border-b border-[#F0E4F2] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div class="inline-flex items-center gap-2.5">
              <span
                class="h-6 w-1 shrink-0 rounded-xs bg-[#93509e] sm:h-7"
                aria-hidden="true"
              />
              <h1 class="text-[23px] font-extrabold leading-tight tracking-[-0.02em] text-[#2E0C49] sm:text-[28px]">
                Todas as Categorias
              </h1>
            </div>
            <p class="mt-2 max-w-2xl text-sm font-medium text-[#5B486B]">
              Navegue pelos departamentos oficiais da Mistura Feminina e
              encontre produtos para cada etapa da sua rotina de beleza.
            </p>
          </div>

          {/* Quick Search Filter */}
          <div class="relative w-full sm:w-80">
            <Search
              class="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#8C559A]"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
              placeholder="Buscar departamento ou produto..."
              class="w-full rounded-xl border border-[#E9D6EC] bg-[#FAF8FB] py-2.5 pl-10 pr-9 text-xs font-medium text-[#2E0C49] placeholder-[#8A7599] transition-all focus:border-[#93509e] focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#93509e]/15"
            />
            <Show when={searchQuery()}>
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Limpar busca"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                <X class="size-3.5" />
              </button>
            </Show>
          </div>
        </header>

        {/* Loading Skeleton */}
        <Show when={categories.loading}>
          <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <For each={[1, 2, 3, 4, 5, 6]}>
              {() => (
                <div class="flex h-64 flex-col justify-between rounded-2xl border border-zinc-100 bg-white p-6 shadow-xs">
                  <div class="flex items-center gap-3">
                    <div class="size-14 animate-pulse rounded-2xl bg-[#F6EEF8]" />
                    <div class="flex-1 space-y-2">
                      <div class="h-4 w-3/4 animate-pulse rounded-md bg-[#F6EEF8]" />
                      <div class="h-3 w-1/2 animate-pulse rounded-md bg-[#FAF4FA]" />
                    </div>
                  </div>
                  <div class="space-y-2 pt-4">
                    <div class="h-3 w-full animate-pulse rounded-md bg-[#FAF4FA]" />
                    <div class="h-3 w-5/6 animate-pulse rounded-md bg-[#FAF4FA]" />
                  </div>
                  <div class="h-4 w-1/3 animate-pulse rounded-md bg-[#F6EEF8] pt-2" />
                </div>
              )}
            </For>
          </div>
        </Show>

        {/* Category Cards Grid */}
        <Show when={!categories.loading}>
          <Show
            when={filteredCategories().length > 0}
            fallback={
              <div class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#E5CCE8] bg-[#FAF8FB] px-6 py-16 text-center">
                <Layers class="size-10 text-[#93509e]/40" aria-hidden="true" />
                <h3 class="mt-4 text-base font-bold text-[#2E0C49]">
                  Nenhum departamento encontrado
                </h3>
                <p class="mt-1 text-xs text-[#5B486B]">
                  Não encontramos categorias que correspondam a "
                  {searchQuery()}".
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  class="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#93509e] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#7c3f87]"
                >
                  <span>Limpar busca</span>
                </button>
              </div>
            }
          >
            <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <For each={filteredCategories()}>
                {(cat) => {
                  const IconComponent = getCategoryIcon(cat);
                  const childList = () => cat.children ?? [];

                  return (
                    <section class="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-[#EFE5F2] bg-white p-6 shadow-[0_2px_12px_rgba(46,12,73,0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-[#93509e]/50 hover:shadow-[0_16px_36px_-8px_rgba(147,80,158,0.18)]">
                      {/* Decorative soft glow */}
                      <div
                        class="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-gradient-to-br from-[#FCE7F6]/50 to-[#F3E8FF]/30 blur-xl transition-all duration-300 group-hover:scale-125 group-hover:from-[#FCE7F6]/80"
                        aria-hidden="true"
                      />

                      <div>
                        {/* Department Header */}
                        <Link
                          to="/categoria/$slug"
                          params={{ slug: cat.slug }}
                          class="flex items-center gap-3.5 focus-visible:outline-hidden"
                        >
                          <div class="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#E8D4EE] bg-gradient-to-br from-[#FAF5FC] to-[#F3E7F7] shadow-2xs transition-transform duration-300 group-hover:scale-105 group-hover:border-[#93509e]">
                            <IconComponent class="size-6 text-[#93509e] transition-transform duration-300 group-hover:scale-110" />
                          </div>

                          <div class="min-w-0 flex-1">
                            <h2 class="truncate text-[17px] font-extrabold tracking-[-0.01em] text-[#2E0C49] transition-colors group-hover:text-[#93509e]">
                              {cat.name}
                            </h2>
                            <span class="mt-1 inline-flex items-center gap-1 rounded-full border border-[#ECD8EE] bg-[#FAF5FC] px-2.5 py-0.5 text-[11px] font-bold text-[#7C3F87]">
                              {childList().length}{" "}
                              {childList().length === 1
                                ? "subcategoria"
                                : "subcategorias"}
                            </span>
                          </div>
                        </Link>

                        <Show when={cat.description}>
                          <p class="mt-3 line-clamp-2 text-xs font-medium text-[#5B486B]">
                            {cat.description}
                          </p>
                        </Show>

                        {/* Subcategories Chips */}
                        <Show when={childList().length > 0}>
                          <div class="mt-5 border-t border-[#F5EDF7] pt-4">
                            <p class="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-[#8C559A]">
                              Subcategorias
                            </p>
                            <ul class="flex flex-wrap gap-1.5">
                              <For each={childList()}>
                                {(child) => (
                                  <li class="flex flex-wrap items-center gap-1">
                                    <Link
                                      to="/categoria/$slug"
                                      params={{ slug: child.slug }}
                                      class="inline-flex items-center gap-1 rounded-lg border border-[#EDE3F1] bg-[#FAF8FB] px-2.5 py-1 text-xs font-semibold text-[#4A2D5E] transition-all hover:border-[#93509e] hover:bg-[#93509e] hover:text-white hover:shadow-2xs"
                                    >
                                      <span>{child.name}</span>
                                    </Link>
                                    <For each={child.children ?? []}>
                                      {(grandChild) => (
                                        <Link
                                          to="/categoria/$slug"
                                          params={{ slug: grandChild.slug }}
                                          class="inline-flex items-center rounded-md border border-dashed border-[#DFCBE6] bg-white px-2 py-0.5 text-[11px] font-medium text-[#6B4A7D] transition-colors hover:border-[#93509e] hover:text-[#93509e]"
                                        >
                                          ↳ {grandChild.name}
                                        </Link>
                                      )}
                                    </For>
                                  </li>
                                )}
                              </For>
                            </ul>
                          </div>
                        </Show>
                      </div>

                      {/* Card Footer Call to Action */}
                      <Link
                        to="/categoria/$slug"
                        params={{ slug: cat.slug }}
                        class="mt-6 flex items-center justify-between border-t border-[#F5EDF7] pt-4 text-xs font-bold text-[#93509e] transition-colors group-hover:text-[#7C3F87]"
                      >
                        <span>Acessar departamento completo</span>
                        <ChevronRight
                          class="size-4 transition-transform duration-300 group-hover:translate-x-1"
                          aria-hidden="true"
                        />
                      </Link>
                    </section>
                  );
                }}
              </For>
            </div>
          </Show>
        </Show>
      </div>
    </StoreShell>
  );
}
