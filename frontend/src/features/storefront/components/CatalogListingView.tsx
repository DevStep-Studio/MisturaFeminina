import { Link } from "@tanstack/solid-router";
import ChevronRight from "lucide-solid/icons/chevron-right";
import SlidersHorizontal from "lucide-solid/icons/sliders-horizontal";
import { For, Show, createEffect, createSignal } from "solid-js";
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
    current_page?: number;
    last_page?: number;
    total?: number;
  };
  redirect_to?: string;
}

export function CatalogListingView(props: CatalogListingProps) {
  const [sort, setSort] = createSignal("relevance");
  const [brand, setBrand] = createSignal("");
  const [inStockOnly, setInStockOnly] = createSignal(false);
  const [minPrice, setMinPrice] = createSignal("");
  const [maxPrice, setMaxPrice] = createSignal("");
  const [page, setPage] = createSignal(1);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [items, setItems] = createSignal<ProductCardData[]>([]);
  const [total, setTotal] = createSignal(0);
  const [lastPage, setLastPage] = createSignal(1);

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
      if (brand()) qs.set("brand", brand());
      if (inStockOnly()) qs.set("in_stock", "1");
      if (minPrice()) qs.set("min_price", String(Number(minPrice())));
      if (maxPrice()) qs.set("max_price", String(Number(maxPrice())));
      qs.set("page", String(page()));
      qs.set("per_page", "24");

      const sep = props.endpoint.includes("?") ? "&" : "?";
      const res = await api<CatalogPaginatedResponse>(
        `${props.endpoint}${sep}${qs.toString()}`,
        { authenticated: false },
      );

      const d = res?.data ?? {};
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

  createEffect(() => {
    void props.endpoint;
    void props.fixedParams;
    void sort();
    void brand();
    void inStockOnly();
    void page();
    void fetchProducts();
  });

  function applyPriceFilter(e: Event) {
    e.preventDefault();
    setPage(1);
    void fetchProducts();
  }

  function resetFilters() {
    setBrand("");
    setInStockOnly(false);
    setMinPrice("");
    setMaxPrice("");
    setSort("relevance");
    setPage(1);
  }

  return (
    <StoreShell>
      <div class="mx-auto max-w-7xl px-4 py-6 sm:py-8">
        <Show when={props.breadcrumbs && props.breadcrumbs.length > 0}>
          <nav
            aria-label="Navegação estrutural"
            class="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500"
          >
            <Link to="/" class="hover:text-zinc-900">
              Início
            </Link>
            <For each={props.breadcrumbs}>
              {(crumb) => (
                <>
                  <ChevronRight class="h-3.5 w-3.5" aria-hidden="true" />
                  <Show
                    when={crumb.to}
                    fallback={
                      <span class="font-medium text-zinc-900">
                        {crumb.label}
                      </span>
                    }
                  >
                    <Link to={crumb.to!} class="hover:text-zinc-900">
                      {crumb.label}
                    </Link>
                  </Show>
                </>
              )}
            </For>
          </nav>
        </Show>

        <header class="mb-6 flex flex-col gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 class="text-2xl font-bold text-zinc-900 sm:text-3xl">
              {props.title}
            </h1>
            <Show when={props.subtitle}>
              <p class="mt-1 max-w-2xl text-sm text-zinc-600">
                {props.subtitle}
              </p>
            </Show>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <span class="text-xs font-medium text-zinc-600">
              {total()} {total() === 1 ? "produto" : "produtos"}
            </span>
            <label for="catalog-sort" class="sr-only">
              Ordenar por
            </label>
            <select
              id="catalog-sort"
              value={sort()}
              onChange={(e) => {
                setSort(e.currentTarget.value);
                setPage(1);
              }}
              class="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus:border-[var(--mf-primary)] focus:outline-none"
            >
              <option value="relevance">Mais relevantes</option>
              <option value="newest">Lançamentos</option>
              <option value="best_sellers">Mais vendidos</option>
              <option value="price_asc">Menor preço</option>
              <option value="price_desc">Maior preço</option>
              <option value="discount">Maiores descontos</option>
            </select>
          </div>
        </header>

        <div
          class={`grid gap-6 ${props.showFilters !== false ? "lg:grid-cols-[240px_1fr]" : ""}`}
        >
          <Show when={props.showFilters !== false}>
            <aside
              aria-label="Filtros do catálogo"
              class="space-y-5 rounded-xl border border-zinc-200 bg-zinc-50 p-4 lg:self-start"
            >
              <div class="flex items-center justify-between">
                <span class="inline-flex items-center gap-1.5 text-sm font-bold text-zinc-900">
                  <SlidersHorizontal class="h-4 w-4 text-[var(--mf-primary)]" />
                  Filtros
                </span>
                <button
                  type="button"
                  onClick={resetFilters}
                  class="text-xs font-medium text-[var(--mf-primary)] hover:underline"
                >
                  Limpar
                </button>
              </div>

              <label class="flex cursor-pointer items-center gap-2 text-sm text-zinc-800">
                <input
                  type="checkbox"
                  checked={inStockOnly()}
                  onChange={(e) => {
                    setInStockOnly(e.currentTarget.checked);
                    setPage(1);
                  }}
                  class="h-4 w-4 rounded border-zinc-300 accent-[var(--mf-primary)]"
                />
                <span>Somente em estoque</span>
              </label>

              <Show when={props.brands && props.brands.length > 0}>
                <div class="space-y-2 border-t border-zinc-200 pt-4">
                  <label
                    for="filter-brand"
                    class="block text-xs font-semibold uppercase tracking-wide text-zinc-600"
                  >
                    Marca
                  </label>
                  <select
                    id="filter-brand"
                    value={brand()}
                    onChange={(e) => {
                      setBrand(e.currentTarget.value);
                      setPage(1);
                    }}
                    class="h-9 w-full rounded-md border border-zinc-300 bg-white px-2.5 text-sm text-zinc-900"
                  >
                    <option value="">Todas as marcas</option>
                    <For each={props.brands}>
                      {(b) => <option value={b.slug}>{b.name}</option>}
                    </For>
                  </select>
                </div>
              </Show>

              <form
                onSubmit={applyPriceFilter}
                class="space-y-2 border-t border-zinc-200 pt-4"
              >
                <p class="text-xs font-semibold uppercase tracking-wide text-zinc-600">
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
                    class="h-9 w-full rounded-md border border-zinc-300 bg-white px-2.5 text-sm"
                  />
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Máx."
                    value={maxPrice()}
                    onInput={(e) => setMaxPrice(e.currentTarget.value)}
                    aria-label="Preço máximo"
                    class="h-9 w-full rounded-md border border-zinc-300 bg-white px-2.5 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  class="h-9 w-full rounded-md bg-zinc-900 text-xs font-semibold text-white hover:bg-zinc-800"
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
