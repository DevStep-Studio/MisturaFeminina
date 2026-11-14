import { Link } from "@tanstack/solid-router";
import ChevronRight from "lucide-solid/icons/chevron-right";
import SlidersHorizontal from "lucide-solid/icons/sliders-horizontal";
import { For, Show, createEffect, createSignal, on } from "solid-js";
import { api } from "../../../lib/api";
import type { BrandItem, ProductCardData } from "../types";
import { ProductCard } from "./ProductCard";
import { StoreShell } from "./StoreShell";

export interface CatalogListingProps {
  title: string;
  subtitle?: string | null;
  breadcrumbs?: { label: string; to?: string }[];
  endpoint: string;
  fixedParams?: Record<string, string | number | undefined>;
  brands?: BrandItem[];
  showFilters?: boolean;
  emptyMessage?: string;
}

interface FacetItem {
  id: number;
  name: string;
  slug: string;
}

interface CatalogPaginatedResponse {
  data: {
    items?: ProductCardData[];
    products?:
      | ProductCardData[]
      | {
          data: ProductCardData[];
          current_page: number;
          last_page: number;
          total: number;
        };
    meta?: {
      current_page: number;
      last_page: number;
      total: number;
    };
    facets?: {
      brands?: FacetItem[];
      categories?: FacetItem[];
    };
    current_page?: number;
    last_page?: number;
    total?: number;
  };
  redirect_to?: string;
}

function toggleSlug(list: string[], slug: string): string[] {
  return list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug];
}

export function CatalogListingView(props: CatalogListingProps) {
  const [sort, setSort] = createSignal("relevance");
  const [selectedBrands, setSelectedBrands] = createSignal<string[]>([]);
  const [selectedCategories, setSelectedCategories] = createSignal<string[]>(
    [],
  );
  const [inStockOnly, setInStockOnly] = createSignal(false);
  const [minPrice, setMinPrice] = createSignal("");
  const [maxPrice, setMaxPrice] = createSignal("");
  const [appliedPriceRange, setAppliedPriceRange] = createSignal<
    [string, string]
  >(["", ""]);
  const [page, setPage] = createSignal(1);
  const [mobileFiltersOpen, setMobileFiltersOpen] = createSignal(false);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [items, setItems] = createSignal<ProductCardData[]>([]);
  const [facetBrands, setFacetBrands] = createSignal<FacetItem[]>([]);
  const [facetCategories, setFacetCategories] = createSignal<FacetItem[]>([]);
  const [total, setTotal] = createSignal(0);
  const [lastPage, setLastPage] = createSignal(1);

  const availableBrands = () =>
    facetBrands().length > 0 ? facetBrands() : (props.brands ?? []);

  const hasActiveFilters = () =>
    selectedBrands().length > 0 ||
    selectedCategories().length > 0 ||
    inStockOnly() ||
    appliedPriceRange()[0] !== "" ||
    appliedPriceRange()[1] !== "" ||
    sort() !== "relevance";

  async function fetchProducts() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (props.fixedParams) {
        for (const [k, v] of Object.entries(props.fixedParams)) {
          if (v !== undefined && v !== "") qs.set(k, String(v));
        }
      }
      if (sort() !== "relevance") qs.set("sort", sort());
      if (selectedBrands().length > 0)
        qs.set("brand", selectedBrands().join(","));
      if (selectedCategories().length > 0)
        qs.set("category", selectedCategories().join(","));
      if (inStockOnly()) qs.set("in_stock", "1");
      const [pMin, pMax] = appliedPriceRange();
      if (pMin) qs.set("min_price", String(Number(pMin)));
      if (pMax) qs.set("max_price", String(Number(pMax)));
      qs.set("page", String(page()));
      qs.set("per_page", "24");

      const sep = props.endpoint.includes("?") ? "&" : "?";
      const res = await api<CatalogPaginatedResponse>(
        `${props.endpoint}${sep}${qs.toString()}`,
        { authenticated: false },
      );

      const d = res?.data ?? {};
      if (d.facets?.brands) setFacetBrands(d.facets.brands);
      if (d.facets?.categories) setFacetCategories(d.facets.categories);

      if (Array.isArray(d.products)) {
        setItems(d.products);
        setTotal(d.meta?.total ?? d.total ?? d.products.length);
        setLastPage(d.meta?.last_page ?? d.last_page ?? 1);
      } else if (Array.isArray(d.items)) {
        setItems(d.items);
        setTotal(d.total ?? d.items.length);
        setLastPage(d.last_page ?? 1);
      } else if (d.products && !Array.isArray(d.products) && d.products.data) {
        setItems(d.products.data);
        setTotal(d.products.total ?? d.products.data.length);
        setLastPage(d.products.last_page ?? 1);
      } else {
        setItems([]);
        setTotal(0);
        setLastPage(1);
      }
    } catch {
      setError("Não foi possível carregar os produtos desta seção.");
    } finally {
      setLoading(false);
    }
  }

  createEffect(
    on(
      () => props.endpoint,
      () => {
        setSelectedBrands([]);
        setSelectedCategories([]);
        setPage(1);
      },
      { defer: true },
    ),
  );

  createEffect(() => {
    void props.endpoint;
    void props.fixedParams;
    void sort();
    void selectedBrands();
    void selectedCategories();
    void inStockOnly();
    void appliedPriceRange();
    void page();
    void fetchProducts();
  });

  function applyPriceFilter(e: Event) {
    e.preventDefault();
    setAppliedPriceRange([minPrice().trim(), maxPrice().trim()]);
    setPage(1);
  }

  function resetFilters() {
    setSelectedBrands([]);
    setSelectedCategories([]);
    setInStockOnly(false);
    setMinPrice("");
    setMaxPrice("");
    setAppliedPriceRange(["", ""]);
    setSort("relevance");
    setPage(1);
  }

  return (
    <StoreShell>
      <div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <Show when={props.breadcrumbs && props.breadcrumbs.length > 0}>
          <nav
            aria-label="Navegação estrutural"
            class="mb-4 flex flex-wrap items-center gap-1.5 text-xs font-medium text-[#5B486B]"
          >
            <Link to="/" class="hover:text-[#C22583]">
              Home
            </Link>
            <For each={props.breadcrumbs}>
              {(crumb) => (
                <>
                  <ChevronRight class="h-3.5 w-3.5" aria-hidden="true" />
                  <Show
                    when={crumb.to}
                    fallback={
                      <span class="font-semibold text-[#3D1260]">
                        {crumb.label}
                      </span>
                    }
                  >
                    <Link to={crumb.to!} class="hover:text-[#C22583]">
                      {crumb.label}
                    </Link>
                  </Show>
                </>
              )}
            </For>
          </nav>
        </Show>

        <header class="mb-6 flex flex-col gap-4 border-b border-[#EFE3F2] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 class="text-[22px] font-bold leading-tight tracking-[-0.02em] text-[#26093D] sm:text-[26px]">
              {props.title}
            </h1>
            <div class="mt-2 flex items-center gap-2" aria-hidden="true">
              <span class="h-[3px] w-7 rounded-full bg-gradient-to-r from-[#3D1260] via-[#7E22CE] to-[#C22583]" />
              <span class="h-px w-12 bg-gradient-to-r from-[#DFC5EC] to-transparent" />
            </div>
            <Show when={props.subtitle}>
              <p class="mt-2 max-w-2xl text-sm text-[#5B486B]">
                {props.subtitle}
              </p>
            </Show>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <Show when={props.showFilters !== false}>
              <button
                type="button"
                aria-expanded={mobileFiltersOpen()}
                onClick={() => setMobileFiltersOpen(!mobileFiltersOpen())}
                class="inline-flex h-10 items-center gap-1.5 rounded-full border border-[#E5DAE9] bg-[#F5F2F7] px-4 text-xs font-bold text-[#3D1260] lg:hidden"
              >
                <SlidersHorizontal class="size-3.5 text-[#C22583]" />
                <span>Filtros</span>
              </button>
            </Show>

            <span class="text-xs font-semibold text-[#5B486B]">
              {total()} {total() === 1 ? "produto" : "produtos"}
            </span>

            <div class="flex items-center gap-2">
              <label
                for="catalog-sort"
                class="text-xs font-bold text-[#3D1260]"
              >
                Ordenar por:
              </label>
              <select
                id="catalog-sort"
                value={sort()}
                onChange={(e) => {
                  setSort(e.currentTarget.value);
                  setPage(1);
                }}
                class="h-10 rounded-full border border-[#E5DAE9] bg-[#F5F2F7] px-4 text-sm font-bold text-[#3D1260] focus:border-[#C22583] focus:outline-none"
              >
                <option value="relevance">Relevância</option>
                <option value="newest">Lançamentos</option>
                <option value="best_sellers">Mais vendidos</option>
                <option value="price_asc">Menor preço</option>
                <option value="price_desc">Maior preço</option>
                <option value="discount">Maiores descontos</option>
              </select>
            </div>
          </div>
        </header>

        <div
          class={`grid gap-7 ${props.showFilters !== false ? "lg:grid-cols-[235px_1fr]" : ""}`}
        >
          <Show when={props.showFilters !== false}>
            <aside
              aria-label="Filtros do catálogo"
              class={`${
                mobileFiltersOpen() ? "block" : "hidden"
              } space-y-6 rounded-xl border border-[#EFE3F2] bg-white p-5 lg:block lg:self-start lg:border-0 lg:bg-transparent lg:p-0`}
            >
              <Show when={hasActiveFilters()}>
                <div class="flex items-center justify-between border-b border-zinc-100 pb-3">
                  <span class="text-xs font-bold uppercase tracking-wide text-[#5B486B]">
                    Filtros ativos
                  </span>
                  <button
                    type="button"
                    onClick={resetFilters}
                    class="text-xs font-bold text-[#C22583] hover:underline"
                  >
                    Limpar tudo
                  </button>
                </div>
              </Show>

              {/* Marcas */}
              <Show when={availableBrands().length > 0}>
                <fieldset class="space-y-2.5 border-b border-zinc-200/80 pb-5">
                  <legend class="text-base font-extrabold text-[#2E1049]">
                    Marcas
                  </legend>
                  <div class="max-h-56 space-y-2 overflow-y-auto pr-1 pt-1">
                    <For each={availableBrands()}>
                      {(b) => (
                        <label class="flex cursor-pointer items-center gap-2.5 text-[13px] font-medium text-[#3D1260] hover:text-[#C22583]">
                          <input
                            type="checkbox"
                            checked={selectedBrands().includes(b.slug)}
                            onChange={() => {
                              setSelectedBrands((prev) =>
                                toggleSlug(prev, b.slug),
                              );
                              setPage(1);
                            }}
                            class="size-4 rounded border-[#D8C5DF] accent-[#C22583]"
                          />
                          <span>{b.name}</span>
                        </label>
                      )}
                    </For>
                  </div>
                </fieldset>
              </Show>

              {/* Categorias */}
              <Show when={facetCategories().length > 0}>
                <fieldset class="space-y-2.5 border-b border-zinc-200/80 pb-5">
                  <legend class="text-base font-extrabold text-[#2E1049]">
                    Categorias
                  </legend>
                  <div class="max-h-56 space-y-2 overflow-y-auto pr-1 pt-1">
                    <For each={facetCategories()}>
                      {(c) => (
                        <label class="flex cursor-pointer items-center gap-2.5 text-[13px] font-medium text-[#3D1260] hover:text-[#C22583]">
                          <input
                            type="checkbox"
                            checked={selectedCategories().includes(c.slug)}
                            onChange={() => {
                              setSelectedCategories((prev) =>
                                toggleSlug(prev, c.slug),
                              );
                              setPage(1);
                            }}
                            class="size-4 rounded border-[#D8C5DF] accent-[#C22583]"
                          />
                          <span>{c.name}</span>
                        </label>
                      )}
                    </For>
                  </div>
                </fieldset>
              </Show>

              {/* Disponibilidade */}
              <div class="space-y-2.5 border-b border-zinc-200/80 pb-5">
                <p class="text-base font-extrabold text-[#2E1049]">
                  Disponibilidade
                </p>
                <label class="flex cursor-pointer items-center gap-2.5 text-[13px] font-medium text-[#3D1260] hover:text-[#C22583]">
                  <input
                    type="checkbox"
                    checked={inStockOnly()}
                    onChange={(e) => {
                      setInStockOnly(e.currentTarget.checked);
                      setPage(1);
                    }}
                    class="size-4 rounded border-[#D8C5DF] accent-[#C22583]"
                  />
                  <span>Somente em estoque</span>
                </label>
              </div>

              {/* Faixa de preço */}
              <form onSubmit={applyPriceFilter} class="space-y-3">
                <p class="text-base font-extrabold text-[#2E1049]">
                  Faixa de preço (R$)
                </p>
                <div class="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Mín."
                    value={minPrice()}
                    onInput={(e) => setMinPrice(e.currentTarget.value)}
                    aria-label="Preço mínimo"
                    class="h-9 w-full rounded-full border border-[#E5DAE9] bg-[#FBF9FC] px-3 text-sm text-[#3D1260] placeholder:text-[#5B486B] focus:border-[#C22583] focus:outline-none"
                  />
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Máx."
                    value={maxPrice()}
                    onInput={(e) => setMaxPrice(e.currentTarget.value)}
                    aria-label="Preço máximo"
                    class="h-9 w-full rounded-full border border-[#E5DAE9] bg-[#FBF9FC] px-3 text-sm text-[#3D1260] placeholder:text-[#5B486B] focus:border-[#C22583] focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  class="h-9 w-full rounded-full bg-[#3D1260] text-xs font-bold text-white transition-colors hover:bg-[#C22583]"
                >
                  Aplicar preço
                </button>
              </form>
            </aside>
          </Show>

          <div>
            <Show when={error()}>
              <div
                role="alert"
                class="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-800"
              >
                <p>{error()}</p>
                <button
                  type="button"
                  onClick={() => void fetchProducts()}
                  class="mt-3 rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white"
                >
                  Tentar novamente
                </button>
              </div>
            </Show>

            <Show when={loading()}>
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <For each={[1, 2, 3, 4, 5, 6, 7, 8]}>
                  {() => (
                    <div class="h-80 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100" />
                  )}
                </For>
              </div>
            </Show>

            <Show when={!loading() && !error() && items().length === 0}>
              <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-10 text-center">
                <p class="text-base font-semibold text-zinc-900">
                  {props.emptyMessage ||
                    "Nenhum produto encontrado para estes filtros."}
                </p>
                <p class="mt-1 text-sm text-zinc-600">
                  Experimente limpar os filtros ou buscar por outro termo.
                </p>
                <button
                  type="button"
                  onClick={resetFilters}
                  class="mt-4 rounded-lg bg-[var(--mf-primary)] px-5 py-2.5 text-sm font-semibold text-white"
                >
                  Ver todos os itens
                </button>
              </div>
            </Show>

            <Show when={!loading() && !error() && items().length > 0}>
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                <For each={items()}>
                  {(product) => <ProductCard product={product} />}
                </For>
              </div>

              <Show when={lastPage() > 1}>
                <nav
                  aria-label="Paginação"
                  class="mt-8 flex items-center justify-center gap-2"
                >
                  <button
                    type="button"
                    disabled={page() <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    class="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <span class="px-3 text-sm text-zinc-600">
                    Página {page()} de {lastPage()}
                  </span>
                  <button
                    type="button"
                    disabled={page() >= lastPage()}
                    onClick={() => setPage((p) => Math.min(lastPage(), p + 1))}
                    class="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-40"
                  >
                    Próxima
                  </button>
                </nav>
              </Show>
            </Show>
          </div>
        </div>
      </div>
    </StoreShell>
  );
}
