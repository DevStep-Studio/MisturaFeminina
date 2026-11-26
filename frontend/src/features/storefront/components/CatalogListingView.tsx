import { Link } from "@tanstack/solid-router";
import BookOpen from "lucide-solid/icons/book-open";
import ChevronDown from "lucide-solid/icons/chevron-down";
import ChevronRight from "lucide-solid/icons/chevron-right";
import CircleQuestionMark from "lucide-solid/icons/circle-question-mark";
import SlidersHorizontal from "lucide-solid/icons/sliders-horizontal";
import Sparkles from "lucide-solid/icons/sparkles";
import X from "lucide-solid/icons/x";
import { For, Show, createEffect, createSignal, on, type JSX } from "solid-js";
import { api } from "../../../lib/api";
import { trackViewItemList } from "../../../monitoring/analytics";
import { getCategorySeoContent } from "../data/categorySeoContent";
import { findStoreBanner } from "../store";
import type { BrandItem, FacetAttribute, ProductCardData } from "../types";
import { ProductCard } from "./ProductCard";
import { BannerImage } from "./BannerImage";
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
  bannerImage?: string | null;
  bannerMobileImage?: string | null;
  bannerAlt?: string;
  bannerHref?: string | null;
  subCategories?: Array<{ id: number; name: string; slug: string }>;
  headerAction?: JSX.Element;
  categorySlug?: string;
}

/** Full-width promotional banner displayed above catalog and category listings. */
export function CatalogBanner(props: {
  src?: string | null;
  mobileSrc?: string | null;
  alt: string;
  href?: string | null;
}) {
  const hasCustomBanner = () => Boolean(props.src?.trim());

  return (
    <Show when={hasCustomBanner()}>
      <section
        aria-label="Banner do catálogo"
        class="relative overflow-hidden bg-[#7c3f87]"
      >
        <div class="relative mx-auto max-w-[1600px]">
          <Show
            when={props.href}
            fallback={
              <BannerImage
                src={props.src}
                mobileSrc={props.mobileSrc}
                alt={props.alt}
                eager
                imageClass="mx-auto block h-auto max-h-[60svh] w-full object-contain sm:max-h-[420px]"
              />
            }
          >
            <a href={props.href!} class="block">
              <BannerImage
                src={props.src}
                mobileSrc={props.mobileSrc}
                alt={props.alt}
                eager
                imageClass="mx-auto block h-auto max-h-[60svh] w-full object-contain sm:max-h-[420px]"
              />
            </a>
          </Show>
        </div>
      </section>
    </Show>
  );
}

interface FacetItem {
  id: number;
  name: string;
  slug: string;
  products_count?: number;
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
      attributes?: FacetAttribute[];
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

function FilterOptionCheckbox(props: {
  label: string;
  count?: number;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label class="group flex min-h-[38px] cursor-pointer items-center gap-3 select-none">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
        class="peer sr-only"
      />
      <span
        aria-hidden="true"
        class={`size-5 shrink-0 rounded-[5px] border flex items-center justify-center transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[#93509e]/40 ${
          props.checked
            ? "border-[#93509e] bg-[#93509e] text-white"
            : "border-zinc-300 bg-white group-hover:border-[#93509e]"
        }`}
      >
        <Show when={props.checked}>
          <svg
            class="h-3.5 w-3.5 stroke-current"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="3"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M4.5 12.75l6 6 9-13.5"
            />
          </svg>
        </Show>
      </span>
      <span class="text-sm font-medium text-zinc-800 transition-colors group-hover:text-[#93509e]">
        {props.label}
        <Show when={props.count !== undefined}>
          {" "}
          <span class="text-xs font-normal text-zinc-500">({props.count})</span>
        </Show>
      </span>
    </label>
  );
}

export function CatalogListingView(props: CatalogListingProps) {
  const [sort, setSort] = createSignal("relevance");
  const [openFaq, setOpenFaq] = createSignal<number | null>(null);
  const seoContent = () => (props.categorySlug ? getCategorySeoContent(props.categorySlug) : null);
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
  const [facetAttributes, setFacetAttributes] = createSignal<FacetAttribute[]>(
    [],
  );
  const [selectedAttributes, setSelectedAttributes] = createSignal<
    Record<string, string[]>
  >(
    (() => {
      if (typeof window === "undefined") return {};
      const initial: Record<string, string[]> = {};
      const params = new URLSearchParams(window.location.search);
      params.forEach((val, key) => {
        if (key.startsWith("attr_") && val.trim() !== "") {
          const attrSlug = key.slice(5);
          const list = val
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          if (list.length > 0) initial[attrSlug] = list;
        }
      });
      return initial;
    })(),
  );

  function toggleAttributeValue(attrSlug: string, valueSlug: string) {
    setSelectedAttributes((prev) => {
      const existing = prev[attrSlug] ?? [];
      const next = existing.includes(valueSlug)
        ? existing.filter((s) => s !== valueSlug)
        : [...existing, valueSlug];
      if (next.length === 0) {
        const { [attrSlug]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [attrSlug]: next };
    });
  }
  const [facetCategories, setFacetCategories] = createSignal<FacetItem[]>([]);
  const [total, setTotal] = createSignal(0);
  const [lastPage, setLastPage] = createSignal(1);

  const availableBrands = () =>
    facetBrands().length > 0 ? facetBrands() : (props.brands ?? []);

  const hasActiveFilters = () =>
    selectedBrands().length > 0 ||
    selectedCategories().length > 0 ||
    Object.keys(selectedAttributes()).length > 0 ||
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
      for (const [attrSlug, valSlugs] of Object.entries(selectedAttributes())) {
        if (valSlugs.length > 0) {
          qs.set(`attr_${attrSlug}`, valSlugs.join(","));
        }
      }
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
      if (d.facets?.attributes) setFacetAttributes(d.facets.attributes);

      let loadedItems: ProductCardData[] = [];
      if (Array.isArray(d.products)) {
        loadedItems = d.products;
        setItems(loadedItems);
        setTotal(d.meta?.total ?? d.total ?? loadedItems.length);
        setLastPage(d.meta?.last_page ?? d.last_page ?? 1);
      } else if (Array.isArray(d.items)) {
        loadedItems = d.items;
        setItems(loadedItems);
        setTotal(d.total ?? loadedItems.length);
        setLastPage(d.last_page ?? 1);
      } else if (d.products && !Array.isArray(d.products) && d.products.data) {
        loadedItems = d.products.data;
        setItems(loadedItems);
        setTotal(d.products.total ?? loadedItems.length);
        setLastPage(d.products.last_page ?? 1);
      } else {
        setItems([]);
        setTotal(0);
        setLastPage(1);
      }

      if (loadedItems.length > 0) {
        trackViewItemList({
          item_list_name: props.title,
          items: loadedItems.slice(0, 12).map((p) => ({
            item_id: p.sku,
            item_name: p.name,
            price: p.effective_price_cents / 100,
            item_brand: p.brand?.name,
          })),
        });
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
        setSelectedAttributes({});
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
    void selectedAttributes();
    void inStockOnly();
    void appliedPriceRange();
    void page();
    if (typeof window !== "undefined") {
      const nextUrl = new URL(window.location.href);
      for (const key of Array.from(nextUrl.searchParams.keys())) {
        if (key.startsWith("attr_")) nextUrl.searchParams.delete(key);
      }
      for (const [slug, vals] of Object.entries(selectedAttributes())) {
        if (vals.length > 0) {
          nextUrl.searchParams.set(`attr_${slug}`, vals.join(","));
        }
      }
      const targetSearch = nextUrl.search;
      if (window.location.search !== targetSearch) {
        window.history.replaceState(
          window.history.state,
          "",
          nextUrl.pathname + targetSearch,
        );
      }
    }
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
    setSelectedAttributes({});
    setInStockOnly(false);
    setMinPrice("");
    setMaxPrice("");
    setAppliedPriceRange(["", ""]);
    setSort("relevance");
    setPage(1);
  }

  const FilterContent = () => (
    <div class="space-y-6">
      <Show when={hasActiveFilters()}>
        <div class="flex items-center justify-between border-b border-zinc-200 pb-4">
          <span class="text-xs font-bold uppercase tracking-wide text-zinc-500">
            Filtros ativos
          </span>
          <button
            type="button"
            onClick={resetFilters}
            class="text-xs font-bold text-[#93509e] hover:underline"
          >
            Limpar tudo
          </button>
        </div>
      </Show>

      {/* Marcas */}
      <Show when={availableBrands().length > 0}>
        <fieldset class="space-y-4 border-b border-zinc-200 pb-6">
          <legend class="text-base font-bold text-zinc-900">Marcas</legend>
          <div class="max-h-60 space-y-2.5 overflow-y-auto pr-1 pt-1">
            <For each={availableBrands()}>
              {(b) => (
                <FilterOptionCheckbox
                  label={b.name}
                  count={b.products_count}
                  checked={selectedBrands().includes(b.slug)}
                  onChange={() => {
                    setSelectedBrands((prev) => toggleSlug(prev, b.slug));
                    setPage(1);
                  }}
                />
              )}
            </For>
          </div>
        </fieldset>
      </Show>

      {/* Categorias */}
      <Show when={facetCategories().length > 0}>
        <fieldset class="space-y-4 border-b border-zinc-200 pb-6">
          <legend class="text-base font-bold text-zinc-900">Categorias</legend>
          <div class="max-h-60 space-y-2.5 overflow-y-auto pr-1 pt-1">
            <For each={facetCategories()}>
              {(c) => (
                <FilterOptionCheckbox
                  label={c.name}
                  count={c.products_count}
                  checked={selectedCategories().includes(c.slug)}
                  onChange={() => {
                    setSelectedCategories((prev) => toggleSlug(prev, c.slug));
                    setPage(1);
                  }}
                />
              )}
            </For>
          </div>
        </fieldset>
      </Show>

      {/* Disponibilidade */}
      <div class="space-y-3 border-b border-zinc-200 pb-6">
        <p class="text-base font-bold text-zinc-900">Disponibilidade</p>
        <div class="pt-1">
          <FilterOptionCheckbox
            label="Somente em estoque"
            checked={inStockOnly()}
            onChange={(checked) => {
              setInStockOnly(checked);
              setPage(1);
            }}
          />
        </div>
      </div>

      {/* Atributos Técnicos Contextuais da Categoria */}
      <For each={facetAttributes()}>
        {(attr) => (
          <fieldset class="space-y-3 border-b border-zinc-200 pb-6">
            <legend class="text-base font-bold text-zinc-900">
              {attr.name}
            </legend>
            <div class="max-h-56 space-y-2 overflow-y-auto pr-1 pt-1">
              <For each={attr.values}>
                {(val) => (
                  <div class="flex items-center gap-2">
                    <Show when={val.color_hex}>
                      <span
                        class="h-3.5 w-3.5 shrink-0 rounded-full border border-black/20"
                        style={{ "background-color": val.color_hex! }}
                        aria-hidden="true"
                      />
                    </Show>
                    <div class="min-w-0 flex-1">
                      <FilterOptionCheckbox
                        label={val.value}
                        count={val.products_count}
                        checked={(
                          selectedAttributes()[attr.slug] ?? []
                        ).includes(val.slug)}
                        onChange={() => {
                          toggleAttributeValue(attr.slug, val.slug);
                          setPage(1);
                        }}
                      />
                    </div>
                  </div>
                )}
              </For>
            </div>
          </fieldset>
        )}
      </For>

      {/* Faixa de preço */}
      <form onSubmit={applyPriceFilter} class="space-y-3">
        <p class="text-base font-bold text-zinc-900">Faixa de preço (R$)</p>
        <div class="grid grid-cols-2 gap-2">
          <input
            type="number"
            min="0"
            step="1"
            placeholder="Mín."
            value={minPrice()}
            onInput={(e) => setMinPrice(e.currentTarget.value)}
            aria-label="Preço mínimo"
            class="h-9 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#93509e] focus:outline-none"
          />
          <input
            type="number"
            min="0"
            step="1"
            placeholder="Máx."
            value={maxPrice()}
            onInput={(e) => setMaxPrice(e.currentTarget.value)}
            aria-label="Preço máximo"
            class="h-9 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#93509e] focus:outline-none"
          />
        </div>
        <button
          type="submit"
          class="h-9 w-full rounded-lg bg-[#93509e] text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#7c3f87]"
        >
          Aplicar preço
        </button>
      </form>
    </div>
  );

  const resolvedBanner = () => {
    if (props.bannerImage?.trim()) {
      return {
        src: props.bannerImage,
        mobileSrc: props.bannerMobileImage,
        alt: props.bannerAlt ?? props.title,
        href: props.bannerHref,
      };
    }
    // Tenta encontrar um banner cadastrado pelo lojista no admin
    const targetUrl = props.categorySlug
      ? `/categoria/${props.categorySlug}`
      : undefined;
    const storeBanner = findStoreBanner("category_top", targetUrl);
    if (storeBanner) {
      return {
        src: storeBanner.desktop_image_path,
        mobileSrc: storeBanner.mobile_image_path,
        alt: storeBanner.alt_text || storeBanner.title,
        href: storeBanner.cta_url,
      };
    }
    return {
      src: null,
      mobileSrc: null,
      alt: props.title,
      href: null,
    };
  };

  return (
    <StoreShell>
      <CatalogBanner
        src={resolvedBanner().src}
        mobileSrc={resolvedBanner().mobileSrc}
        alt={resolvedBanner().alt}
        href={resolvedBanner().href}
      />
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

        {/* Page Title & Action Header */}
        <header class="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div class="max-w-3xl">
            <div class="inline-flex items-center gap-2.5">
              <span
                class="h-6 w-1 shrink-0 rounded-xs bg-[#93509e] sm:h-7"
                aria-hidden="true"
              />
              <h1 class="text-[23px] font-extrabold leading-tight tracking-[-0.02em] text-[#2E0C49] sm:text-[28px]">
                {props.title}
              </h1>
            </div>
            <Show when={props.subtitle}>
              <p class="mt-2 text-sm font-medium leading-relaxed text-[#5B486B]">
                {props.subtitle}
              </p>
            </Show>
          </div>

          <Show when={props.headerAction}>
            <div class="shrink-0 sm:pt-0.5">
              {props.headerAction}
            </div>
          </Show>
        </header>

        <Show when={(props.subCategories?.length ?? 0) > 0}>
          <nav
            aria-label="Subcategorias"
            class="mb-5 flex flex-wrap items-center gap-2"
          >
            <For each={props.subCategories ?? []}>
              {(sub) => (
                <Link
                  to="/categoria/$slug"
                  params={{ slug: sub.slug }}
                  class="inline-flex items-center gap-1.5 rounded-full border border-[#E5D4EC] bg-[#FAF6FC] px-3.5 py-1.5 text-xs font-semibold text-[#3D1260] transition hover:border-[#93509e] hover:bg-[#93509e] hover:text-white"
                >
                  <span>{sub.name}</span>
                  <ChevronRight class="size-3.5 opacity-75" aria-hidden="true" />
                </Link>
              )}
            </For>
          </nav>
        </Show>

        {/* Toolbar: Counter, Mobile Filter Trigger & Sort Dropdown */}
        <div class="mb-6 flex flex-wrap items-center justify-between gap-3 border-y border-[#F3EAF5] py-3">
          <div class="flex items-center gap-3">
            <Show when={props.showFilters !== false}>
              <button
                type="button"
                aria-expanded={mobileFiltersOpen()}
                onClick={() => setMobileFiltersOpen(!mobileFiltersOpen())}
                class="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#93509e] bg-white px-3.5 text-xs font-bold text-[#93509e] shadow-2xs transition-colors hover:bg-[#93509e] hover:text-white lg:hidden"
              >
                <SlidersHorizontal class="size-3.5" />
                <span>Filtros</span>
              </button>
            </Show>

            <span class="text-xs font-semibold text-[#5B486B]">
              <span class="font-bold text-[#2E0C49]">{total()}</span>{" "}
              {total() === 1 ? "produto encontrado" : "produtos encontrados"}
            </span>
          </div>

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
              class="h-9 rounded-lg border border-[#E5DAE9] bg-white px-3 text-xs font-bold text-[#3D1260] shadow-2xs transition focus:border-[#93509e] focus:outline-hidden"
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

        {/* Mobile Filter Slide-over Drawer */}
        <Show when={props.showFilters !== false && mobileFiltersOpen()}>
          <div
            class="fixed inset-0 z-50 lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Filtros do catálogo"
          >
            <div
              class="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity duration-200"
              onClick={() => setMobileFiltersOpen(false)}
              aria-hidden="true"
            />
            <div class="fixed inset-y-0 right-0 flex w-full max-w-xs flex-col bg-white shadow-2xl">
              <div class="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
                <div class="flex items-center gap-2">
                  <SlidersHorizontal class="h-4 w-4 text-[#93509e]" />
                  <h3 class="text-base font-bold text-zinc-900">Filtros</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen(false)}
                  class="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                  aria-label="Fechar filtros"
                >
                  <X class="h-5 w-5" />
                </button>
              </div>

              <div class="flex-1 overflow-y-auto px-5 py-4 pb-20">
                <FilterContent />
              </div>

              <div class="border-t border-zinc-200 bg-zinc-50 p-4 flex items-center gap-2">
                <Show when={hasActiveFilters()}>
                  <button
                    type="button"
                    onClick={resetFilters}
                    class="h-11 px-3 text-xs font-semibold text-zinc-600 hover:text-zinc-900"
                  >
                    Limpar
                  </button>
                </Show>
                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen(false)}
                  class="flex-1 h-11 rounded-lg bg-[#93509e] text-center text-xs font-bold uppercase tracking-wider text-white shadow-sm hover:bg-[#7c3f87]"
                >
                  Ver {total()} {total() === 1 ? "produto" : "produtos"}
                </button>
              </div>
            </div>
          </div>
        </Show>

        <div
          class={`grid gap-7 ${props.showFilters !== false ? "lg:grid-cols-[260px_1fr]" : ""}`}
        >
          <Show when={props.showFilters !== false}>
            <aside
              aria-label="Filtros do catálogo"
              class="hidden lg:block lg:self-start space-y-6 rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-[0_2px_12px_rgba(46,12,73,0.03)]"
            >
              <FilterContent />
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
                  class="mt-4 rounded-lg bg-[#93509e] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#7c3f87]"
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
                    class="rounded-lg border border-[#93509e] bg-white px-4 py-2 text-sm font-medium text-[#93509e] transition-colors hover:bg-[#93509e] hover:text-white disabled:opacity-40"
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
                    class="rounded-lg border border-[#93509e] bg-white px-4 py-2 text-sm font-medium text-[#93509e] transition-colors hover:bg-[#93509e] hover:text-white disabled:opacity-40"
                  >
                    Próxima
                  </button>
                </nav>
              </Show>
            </Show>
          </div>
        </div>

        {/* Guia de Compra, Conteúdo Educativo e FAQ da Categoria */}
        <Show when={seoContent()}>
          {(seo) => (
            <section
              aria-label="Informações e Guia da Categoria"
              class="mt-14 border-t border-[#F0E4F2] pt-10"
            >
              <div class="rounded-2xl border border-[#E5D4EC] bg-[#FAF6FC] p-6 sm:p-8">
                <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#7C3F87]">
                  <BookOpen class="size-4" />
                  Guia da Categoria & Dicas Técnicas
                </div>
                <h2 class="mt-2 text-xl font-extrabold text-[#2E0C49] sm:text-2xl">
                  {seo().heading}
                </h2>
                <p class="mt-3 text-sm leading-relaxed text-[#5B486B]">
                  {seo().description}
                </p>

                {/* Dicas de Aplicação */}
                <Show when={seo().tips.length > 0}>
                  <div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                    <For each={seo().tips}>
                      {(tip) => (
                        <div class="rounded-xl border border-[#E5D4EC] bg-white p-4 shadow-2xs">
                          <h3 class="flex items-center gap-1.5 text-sm font-bold text-[#2E0C49]">
                            <Sparkles class="size-3.5 text-[#93509e]" />
                            {tip.title}
                          </h3>
                          <p class="mt-1.5 text-xs leading-relaxed text-[#5B486B]">
                            {tip.description}
                          </p>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>

                {/* Guia Completo Relacionado */}
                <Show when={seo().relatedGuide}>
                  {(guide) => (
                    <div class="mt-6 flex flex-col items-start justify-between gap-4 rounded-xl border border-[#93509e]/30 bg-white p-4 sm:flex-row sm:items-center">
                      <div>
                        <span class="inline-block rounded-md bg-[#FAF4FB] px-2 py-0.5 text-[10px] font-bold text-[#7C3F87]">
                          Artigo Educativo Relacionado
                        </span>
                        <h4 class="mt-1 text-sm font-bold text-[#2E0C49]">
                          {guide().title}
                        </h4>
                        <p class="mt-0.5 text-xs text-[#5B486B]">
                          {guide().summary}
                        </p>
                      </div>
                      <Link
                        to="/guia/$slug"
                        params={{ slug: guide().slug }}
                        class="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#93509e] px-3.5 py-2 text-xs font-bold text-white transition hover:bg-[#7C3F87]"
                      >
                        <span>Ler guia completo</span>
                        <ChevronRight class="size-3.5" />
                      </Link>
                    </div>
                  )}
                </Show>

                {/* Perguntas Frequentes (FAQ) da Categoria */}
                <Show when={seo().faqs.length > 0}>
                  <div class="mt-8 border-t border-[#E5D4EC] pt-6">
                    <h3 class="flex items-center gap-2 text-base font-bold text-[#2E0C49]">
                      <CircleQuestionMark class="size-4 text-[#93509e]" />
                      Dúvidas Frequentes sobre {props.title}
                    </h3>
                    <div class="mt-4 space-y-2.5">
                      <For each={seo().faqs}>
                        {(faq, idx) => {
                          const isOpen = () => openFaq() === idx();
                          return (
                            <div class="rounded-xl border border-[#E5D4EC] bg-white transition hover:border-[#93509e]">
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenFaq((prev) =>
                                    prev === idx() ? null : idx(),
                                  )
                                }
                                class="flex w-full items-center justify-between gap-3 p-3.5 text-left text-sm font-semibold text-[#2E0C49]"
                                aria-expanded={isOpen()}
                              >
                                <span>{faq.question}</span>
                                <ChevronDown
                                  class="size-4 shrink-0 text-[#93509e] transition-transform duration-200"
                                  classList={{ "rotate-180": isOpen() }}
                                />
                              </button>
                              <Show when={isOpen()}>
                                <div class="border-t border-[#FAF4FB] px-3.5 pb-3.5 pt-1 text-xs leading-relaxed text-[#5B486B]">
                                  {faq.answer}
                                </div>
                              </Show>
                            </div>
                          );
                        }}
                      </For>
                    </div>
                  </div>
                </Show>

                {/* Categorias e Departamentos Relacionados */}
                <Show when={seo().relatedCategories.length > 0}>
                  <div class="mt-6 flex flex-wrap items-center gap-2 text-xs text-[#5B486B]">
                    <span class="font-bold text-[#2E0C49]">
                      Departamentos complementares:
                    </span>
                    <For each={seo().relatedCategories}>
                      {(rel) => (
                        <Link
                          to={rel.path}
                          class="rounded-full border border-[#E5D4EC] bg-white px-3 py-1 font-semibold text-[#7C3F87] transition hover:border-[#93509e] hover:bg-[#93509e] hover:text-white"
                        >
                          {rel.label}
                        </Link>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            </section>
          )}
        </Show>
      </div>
    </StoreShell>
  );
}
