import { createFileRoute, Link } from "@tanstack/solid-router";
import Check from "lucide-solid/icons/check";
import ChevronLeft from "lucide-solid/icons/chevron-left";
import ChevronRight from "lucide-solid/icons/chevron-right";
import CreditCard from "lucide-solid/icons/credit-card";
import MessageCircle from "lucide-solid/icons/message-circle";
import ShieldCheck from "lucide-solid/icons/shield-check";
import Tag from "lucide-solid/icons/tag";
import Truck from "lucide-solid/icons/truck";
import {
  For,
  Show,
  createResource,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { NewsletterSection } from "../features/storefront/components/NewsletterSection";
import { ProductCard } from "../features/storefront/components/ProductCard";
import { StoreShell } from "../features/storefront/components/StoreShell";
import { storefrontStore } from "../features/storefront/store";
import type {
  BannerData,
  BrandItem,
  CategoryNode,
  CouponSummary,
  HomeSectionData,
  ProductCardData,
} from "../features/storefront/types";
import { api } from "../lib/api";
import { assetUrl } from "../lib/format";
import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/")({
  head: () =>
    seoHead({
      title: "Mistura Feminina Cosméticos — Loja Online",
      description:
        "Cosméticos, alongamento de unhas, esmaltes em gel, skincare, cabelos e acessórios profissionais com envio para todo o Brasil.",
      path: "/",
    }),
  component: StorefrontHomePage,
});

interface HomeReview {
  id: number;
  author_name: string;
  rating: number;
  title: string | null;
  body: string;
  product?: { id: number; name: string; slug: string } | null;
}

function renderBenefitIcon(name: string) {
  switch (name) {
    case "truck":
      return (
        <Truck
          class="h-7 w-7 text-zinc-700"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      );
    case "message-circle":
      return (
        <MessageCircle
          class="h-7 w-7 text-zinc-700"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      );
    case "shield-check":
      return (
        <ShieldCheck
          class="h-7 w-7 text-zinc-700"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      );
    case "tag":
      return (
        <Tag
          class="h-7 w-7 text-zinc-700"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      );
    default:
      return (
        <CreditCard
          class="h-7 w-7 text-zinc-700"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      );
  }
}

function HeroCarouselBlock(props: { banners: BannerData[] }) {
  const [index, setIndex] = createSignal(0);

  onMount(() => {
    if (props.banners.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % props.banners.length);
    }, 6000);
    onCleanup(() => window.clearInterval(id));
  });

  const current = () => props.banners[index()] ?? props.banners[0];

  return (
    <Show when={props.banners.length > 0}>
      <section
        aria-label="Destaques principais"
        class="relative overflow-hidden bg-zinc-900"
      >
        <Show when={current()}>
          {(banner) => {
            const img = (
              <picture class="block w-full">
                <Show when={banner().mobile_image_path}>
                  <source
                    media="(max-width: 767px)"
                    srcset={assetUrl(banner().mobile_image_path)}
                  />
                </Show>
                <img
                  src={assetUrl(banner().desktop_image_path)}
                  alt={banner().alt_text || banner().title}
                  class="block h-[220px] w-full object-cover object-center sm:h-[340px] lg:h-[430px]"
                />
              </picture>
            );

            return (
              <div class="relative mx-auto max-w-[1920px]">
                <Show when={banner().cta_url} fallback={img}>
                  <a href={banner().cta_url!} class="block">
                    {img}
                  </a>
                </Show>

                <Show when={props.banners.length > 1}>
                  <button
                    type="button"
                    onClick={() =>
                      setIndex(
                        (i) =>
                          (i - 1 + props.banners.length) % props.banners.length,
                      )
                    }
                    aria-label="Banner anterior"
                    class="absolute left-2 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-[#D4D4D8] text-[#3F3F46] shadow transition-colors hover:bg-white sm:left-4 sm:size-9"
                  >
                    <ChevronLeft class="h-4 w-4 sm:h-5 sm:w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setIndex((i) => (i + 1) % props.banners.length)
                    }
                    aria-label="Próximo banner"
                    class="absolute right-2 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-[#D4D4D8] text-[#3F3F46] shadow transition-colors hover:bg-white sm:right-4 sm:size-9"
                  >
                    <ChevronRight class="h-4 w-4 sm:h-5 sm:w-5" />
                  </button>

                  <div class="absolute bottom-2.5 left-1/2 flex -translate-x-1/2 gap-2">
                    <For each={props.banners}>
                      {(_, idx) => (
                        <button
                          type="button"
                          onClick={() => setIndex(idx())}
                          aria-label={`Ir para banner ${idx() + 1}`}
                          class={`h-2.5 w-2.5 rounded-full transition ${
                            index() === idx()
                              ? "bg-white"
                              : "bg-zinc-400 hover:bg-zinc-200"
                          }`}
                        />
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            );
          }}
        </Show>
      </section>
    </Show>
  );
}

function CouponStripBlock(props: {
  section: HomeSectionData;
  coupon: CouponSummary | null;
}) {
  const [copied, setCopied] = createSignal(false);

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Show when={props.coupon}>
      {(coupon) => (
        <section class="border-b border-zinc-200 bg-white py-3.5 sm:py-4">
          <div class="mx-auto flex max-w-7xl flex-col items-center justify-center gap-2.5 px-4 text-center sm:flex-row sm:gap-4">
            <p class="text-xs text-[#3D1260] sm:text-[13px]">
              <strong class="font-bold">
                {props.section.title || "Aproveite um Desconto Especial!"}
              </strong>{" "}
              {props.section.subtitle ||
                `Na sua primeira compra, use o cupom ${coupon().code} e ganhe 10% OFF!`}
            </p>
            <div class="inline-flex shrink-0 items-stretch">
              <span class="inline-flex items-center rounded-l-full border border-r-0 border-dashed border-[#62298D] bg-white px-5 py-1.5 font-mono text-xs font-bold tracking-wide text-[#2E1049] sm:text-[13px]">
                {coupon().code}
              </span>
              <button
                type="button"
                onClick={() => void copy(coupon().code)}
                class="inline-flex items-center gap-1.5 rounded-r-full border border-[#62298D] bg-[#62298D] px-5 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[#4C1D70] sm:text-[13px]"
              >
                <Show when={copied()}>
                  <Check class="h-3.5 w-3.5" />
                </Show>
                {copied() ? "Copiado!" : "Copiar"}
              </button>
            </div>
          </div>
        </section>
      )}
    </Show>
  );
}

function rotateList<T>(list: T[], offset: number): T[] {
  if (list.length <= 1) return list;
  const shift = ((offset % list.length) + list.length) % list.length;
  return [...list.slice(shift), ...list.slice(0, shift)];
}

function CategoryCirclesBlock(props: {
  section: HomeSectionData;
  categories: CategoryNode[];
}) {
  const [offset, setOffset] = createSignal(0);

  const visibleCategories = () => rotateList(props.categories, offset());

  return (
    <Show when={props.categories.length > 0}>
      <section class="bg-white py-8 sm:py-10">
        <div class="mx-auto max-w-7xl px-4">
          <div class="mb-8 text-center">
            <h2 class="text-xl font-bold text-[#3D1260] sm:text-2xl">
              {props.section.title || "Navegue por Categorias"}
            </h2>
            <div class="mx-auto mt-2.5 h-[3px] w-7 rounded-full bg-[#3D1260]" />
          </div>

          <div class="relative px-7 sm:px-6">
            <div class="grid grid-cols-3 gap-x-2.5 gap-y-5 sm:grid-cols-4 sm:gap-4 md:grid-cols-6">
              <For each={visibleCategories().slice(0, 6)}>
                {(cat) => (
                  <Link
                    to="/categoria/$slug"
                    params={{ slug: cat.slug }}
                    class="group flex flex-col items-center text-center"
                  >
                    <div class="flex aspect-square w-full max-w-[164px] items-center justify-center overflow-hidden rounded-full border border-zinc-200/90 bg-white p-2.5 shadow-[0_2px_10px_rgba(0,0,0,0.03)] transition group-hover:border-[#C22583] group-hover:shadow-md sm:p-3.5">
                      <img
                        src={assetUrl(cat.image_path)}
                        alt={cat.name}
                        class="h-full w-full object-contain"
                        loading="lazy"
                      />
                    </div>
                    <span class="mt-2.5 text-[11px] font-bold leading-snug text-[#3D1260] transition-colors group-hover:text-[#C22583] sm:mt-3 sm:text-[13px]">
                      {cat.name}
                    </span>
                  </Link>
                )}
              </For>
            </div>

            <Show when={props.categories.length > 1}>
              <button
                type="button"
                onClick={() => setOffset((o) => o - 1)}
                aria-label="Categorias anteriores"
                class="absolute left-0 top-[46px] inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-100 text-[#EC1B9B] shadow-sm transition hover:bg-zinc-200 md:top-[42%] md:size-9"
              >
                <ChevronLeft class="h-4 w-4 md:h-5 md:w-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setOffset((o) => o + 1)}
                aria-label="Próximas categorias"
                class="absolute right-0 top-[46px] inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-100 text-[#EC1B9B] shadow-sm transition hover:bg-zinc-200 md:top-[42%] md:size-9"
              >
                <ChevronRight
                  class="h-4 w-4 md:h-5 md:w-5"
                  aria-hidden="true"
                />
              </button>
            </Show>
          </div>
        </div>
      </section>
    </Show>
  );
}

function ProductShowcaseBlock(props: { section: HomeSectionData }) {
  const [offset, setOffset] = createSignal(0);

  const products = () =>
    Array.isArray(props.section.data)
      ? (props.section.data as ProductCardData[])
      : [];
  const filter = () => String(props.section.config?.filter ?? "featured");
  const isBorderless = () => Boolean(props.section.config?.borderless);
  const showViewAll = () => props.section.config?.show_view_all !== false;
  const showFeaturedBadge = () =>
    filter() === "featured" ||
    Boolean(props.section.config?.show_featured_badge);
  const viewAllHref = () => {
    const cta = props.section.config?.cta_url;
    if (typeof cta === "string" && cta.length > 0) return cta;
    if (filter() === "offers") return "/promocoes";
    if (filter() === "new_arrivals") return "/novidades";
    return "/buscar";
  };

  const visibleProducts = () => rotateList(products(), offset());

  return (
    <Show when={products().length > 0}>
      <section class="mx-auto max-w-7xl px-4 py-8 sm:py-10">
        <div class="mb-6 text-center">
          <h2 class="text-xl font-bold text-[#3D1260] sm:text-2xl">
            {props.section.title || "Confira nossas ofertas da semana"}
          </h2>
          <div class="mx-auto mt-2.5 h-[3px] w-7 rounded-full bg-[#3D1260]" />
        </div>

        <div class="relative sm:px-4">
          <Show when={showViewAll()}>
            <div class="mb-4 flex justify-start">
              <Link
                to={viewAllHref()}
                class="inline-flex items-center justify-center rounded-full bg-[#62298D] px-6 py-2 text-xs font-bold text-white transition-colors hover:bg-[#4C1D70]"
              >
                Ver tudo
              </Link>
            </div>
          </Show>

          <div class="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <For each={visibleProducts().slice(0, 4)}>
              {(product) => (
                <ProductCard
                  product={product}
                  borderless={isBorderless()}
                  showFeaturedBadge={showFeaturedBadge()}
                />
              )}
            </For>
          </div>

          <Show when={products().length > 1}>
            <button
              type="button"
              onClick={() => setOffset((o) => o - 1)}
              aria-label={`Produtos anteriores em ${props.section.title || "vitrine"}`}
              class={`absolute -left-1 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-100 text-[#EC1B9B] shadow-sm transition hover:bg-zinc-200 sm:left-0 sm:size-9 ${
                showViewAll()
                  ? "top-[148px] sm:top-[52%]"
                  : "top-[110px] sm:top-[44%]"
              }`}
            >
              <ChevronLeft class="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setOffset((o) => o + 1)}
              aria-label={`Próximos produtos em ${props.section.title || "vitrine"}`}
              class={`absolute -right-1 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-100 text-[#EC1B9B] shadow-sm transition hover:bg-zinc-200 sm:right-0 sm:size-9 ${
                showViewAll()
                  ? "top-[148px] sm:top-[52%]"
                  : "top-[110px] sm:top-[44%]"
              }`}
            >
              <ChevronRight class="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
            </button>
          </Show>
        </div>
      </section>
    </Show>
  );
}

function BrandCarouselBlock(props: {
  section: HomeSectionData;
  brands: BrandItem[];
}) {
  const [offset, setOffset] = createSignal(0);
  const [paused, setPaused] = createSignal(false);

  const autoplay = () => props.section.config?.autoplay !== false;
  const showViewAll = () => props.section.config?.show_view_all === true;

  onMount(() => {
    if (!autoplay() || props.brands.length <= 1) return;
    const id = window.setInterval(() => {
      if (!paused()) {
        setOffset((o) => o + 1);
      }
    }, 3000);
    onCleanup(() => window.clearInterval(id));
  });

  const visibleBrands = () => rotateList(props.brands, offset());

  return (
    <Show when={props.brands.length > 0}>
      <section
        class="mx-auto max-w-7xl bg-white px-4 py-8 sm:py-10"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusIn={() => setPaused(true)}
        onFocusOut={() => setPaused(false)}
      >
        <div class="relative mb-8 text-center">
          <h2 class="text-xl font-bold text-[#3D1260] sm:text-2xl">
            {props.section.title || "As melhores marcas"}
          </h2>
          <div class="mx-auto mt-2.5 h-[3px] w-7 rounded-full bg-[#3D1260]" />
          <Show when={showViewAll()}>
            <Link
              to="/marcas"
              class="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#62298D] hover:underline sm:absolute sm:right-0 sm:top-1 sm:mt-0 sm:text-sm"
            >
              Todas as marcas
              <ChevronRight class="h-4 w-4" aria-hidden="true" />
            </Link>
          </Show>
        </div>

        <div class="relative px-8 sm:px-10">
          <div class="grid grid-cols-2 items-center gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <For each={visibleBrands().slice(0, 6)}>
              {(brand) => (
                <Link
                  to="/marca/$slug"
                  params={{ slug: brand.slug }}
                  aria-label={brand.name}
                  class="group flex h-20 items-center justify-center bg-transparent px-2 transition-transform hover:scale-105"
                >
                  <Show
                    when={brand.logo_path}
                    fallback={
                      <span class="text-center font-serif text-base font-bold tracking-wide text-[#3D1260] group-hover:text-[#C22583]">
                        {brand.name}
                      </span>
                    }
                  >
                    <img
                      src={assetUrl(brand.logo_path)}
                      alt={brand.name}
                      class="h-14 w-auto max-w-[140px] object-contain opacity-95 transition-opacity group-hover:opacity-100"
                      loading="lazy"
                    />
                  </Show>
                </Link>
              )}
            </For>
          </div>

          <Show when={props.brands.length > 1}>
            <button
              type="button"
              onClick={() => setOffset((o) => o - 1)}
              aria-label={`Marcas anteriores em ${props.section.title || "As melhores marcas"}`}
              class="absolute left-0 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-100 text-[#EC1B9B] shadow-sm transition hover:bg-zinc-200 sm:size-9"
            >
              <ChevronLeft class="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setOffset((o) => o + 1)}
              aria-label={`Próximas marcas em ${props.section.title || "As melhores marcas"}`}
              class="absolute right-0 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-100 text-[#EC1B9B] shadow-sm transition hover:bg-zinc-200 sm:size-9"
            >
              <ChevronRight class="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
            </button>
          </Show>
        </div>
      </section>
    </Show>
  );
}

function authorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "MF";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function TestimonialsCarouselBlock(props: {
  section: HomeSectionData;
  reviews: HomeReview[];
}) {
  const [offset, setOffset] = createSignal(0);

  const visibleReviews = () => rotateList(props.reviews, offset());

  return (
    <Show when={props.reviews.length > 0}>
      <section class="mx-auto max-w-7xl bg-white px-4 py-8 sm:py-10">
        <div class="mb-7 text-center">
          <h2 class="text-xl font-bold text-[#3D1260] sm:text-2xl">
            {props.section.title || "Quem compra indica!"}
          </h2>
          <div class="mx-auto mt-2.5 h-[3px] w-7 rounded-full bg-[#3D1260]" />
        </div>

        <div class="relative px-4 sm:px-6">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <For each={visibleReviews().slice(0, 4)}>
              {(rev, idx) => (
                <article
                  class={`relative min-h-[176px] flex-col justify-between overflow-hidden rounded-lg bg-gradient-to-br from-[#FDE2FE] via-[#FACBFB] to-[#F5B4FA] p-4 shadow-xs ${
                    idx() === 0
                      ? "flex"
                      : idx() === 1
                        ? "hidden sm:flex"
                        : "hidden lg:flex"
                  }`}
                >
                  <div>
                    <div class="mb-2 flex items-center gap-2 text-[11px] font-medium text-[#5B2168]">
                      <span class="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[#62298D] text-[10px] font-bold text-white shadow-xs">
                        {authorInitials(rev.author_name)}
                      </span>
                      <span class="truncate font-semibold text-[#3D1260]">
                        {rev.author_name}
                      </span>
                      <span class="shrink-0 text-[10px] text-[#6B2F79]">
                        • {rev.rating}.0/5
                      </span>
                    </div>

                    <div class="space-y-1.5 pl-2 pr-3">
                      <p class="rounded-2xl bg-white px-3.5 py-2.5 text-[12px] leading-snug text-zinc-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                        {rev.body}
                      </p>

                      <Show when={rev.product}>
                        {(p) => (
                          <Link
                            to="/produto/$slug"
                            params={{ slug: p().slug }}
                            class="inline-block max-w-[85%] truncate rounded-2xl bg-white px-3 py-1.5 text-[11px] font-semibold text-[#3D1260] shadow-[0_1px_4px_rgba(0,0,0,0.06)] transition hover:text-[#C22583]"
                          >
                            {p().name}
                          </Link>
                        )}
                      </Show>
                    </div>
                  </div>

                  {/* Brand watermark in bottom-right corner */}
                  <div
                    class="pointer-events-none mt-2 flex select-none justify-end"
                    aria-hidden="true"
                  >
                    <svg
                      viewBox="0 0 64 34"
                      class="h-6 w-auto"
                      role="presentation"
                    >
                      <text
                        x="32"
                        y="24"
                        text-anchor="middle"
                        font-family="Georgia,serif"
                        font-size="22"
                        font-weight="700"
                        letter-spacing="1"
                        fill="#3D1260"
                      >
                        MF
                      </text>
                      <path
                        d="M10 18 Q32 28 54 11"
                        fill="none"
                        stroke="#C22583"
                        stroke-width="2.4"
                        stroke-linecap="round"
                      />
                    </svg>
                  </div>
                </article>
              )}
            </For>
          </div>

          <Show when={props.reviews.length > 1}>
            <button
              type="button"
              onClick={() => setOffset((o) => o - 1)}
              aria-label={`Depoimentos anteriores em ${props.section.title || "Quem compra indica!"}`}
              class="absolute left-0 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-100 text-[#EC1B9B] shadow-sm transition hover:bg-zinc-200 sm:size-9"
            >
              <ChevronLeft class="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setOffset((o) => o + 1)}
              aria-label={`Próximos depoimentos em ${props.section.title || "Quem compra indica!"}`}
              class="absolute right-0 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-100 text-[#EC1B9B] shadow-sm transition hover:bg-zinc-200 sm:size-9"
            >
              <ChevronRight class="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
            </button>
          </Show>
        </div>
      </section>
    </Show>
  );
}

function StorefrontHomePage() {
  const [homeData] = createResource(async () => {
    const res = await api<{ data: { sections: HomeSectionData[] } }>(
      "/storefront/home",
      {
        authenticated: false,
      },
    );
    return res.data.sections ?? [];
  });

  const sections = () => homeData() ?? [];
  const settings = () => storefrontStore.settings();

  const jsonLd = () =>
    JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Store",
      name: settings().store_name,
      description: settings().seo_default_description,
      url: typeof window !== "undefined" ? window.location.origin : "",
    });

  return (
    <StoreShell>
      <script type="application/ld+json">{jsonLd()}</script>

      <h1 class="sr-only">
        {settings().store_name} — Cosméticos e Cuidados Pessoais
      </h1>

      <Show when={homeData.loading}>
        <div class="mx-auto max-w-7xl space-y-6 px-4 py-8">
          <div class="h-72 animate-pulse rounded-xl bg-zinc-100" />
          <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <For each={[1, 2, 3, 4]}>
              {() => <div class="h-72 animate-pulse rounded-xl bg-zinc-100" />}
            </For>
          </div>
        </div>
      </Show>

      <For each={sections()}>
        {(section) => {
          if (section.type === "hero_carousel") {
            const banners = Array.isArray(section.data)
              ? (section.data as BannerData[])
              : [];
            return <HeroCarouselBlock banners={banners} />;
          }

          if (section.type === "coupon_strip") {
            return (
              <CouponStripBlock
                section={section}
                coupon={(section.data as CouponSummary | null) ?? null}
              />
            );
          }

          if (section.type === "benefits_row") {
            return (
              <section
                aria-label="Diferenciais da loja"
                class="bg-white py-6 sm:py-7"
              >
                <div class="mx-auto grid max-w-7xl grid-cols-2 gap-x-4 gap-y-5 px-4 sm:grid-cols-3 lg:grid-cols-5">
                  <For each={settings().benefits_row}>
                    {(item) => (
                      <div class="flex flex-col items-center text-center last:col-span-2 sm:last:col-span-1">
                        <div class="mb-2 flex items-center justify-center text-zinc-700">
                          {renderBenefitIcon(item.icon)}
                        </div>
                        <p class="text-[13px] font-bold leading-snug text-[#3D1260]">
                          {item.title}
                        </p>
                        <p class="mt-0.5 text-xs leading-snug text-[#4C1D73]">
                          {item.subtitle}
                        </p>
                      </div>
                    )}
                  </For>
                </div>
              </section>
            );
          }

          if (section.type === "category_circles") {
            const categories = Array.isArray(section.data)
              ? (section.data as CategoryNode[])
              : [];
            return (
              <CategoryCirclesBlock section={section} categories={categories} />
            );
          }

          if (section.type === "product_showcase") {
            return <ProductShowcaseBlock section={section} />;
          }

          if (section.type === "banner_grid") {
            const banners = Array.isArray(section.data)
              ? (section.data as BannerData[])
              : [];
            return (
              <Show when={banners.length > 0}>
                <section
                  aria-label={section.title || "Destaques promocionais"}
                  class="mx-auto max-w-7xl px-4 py-6"
                >
                  <Show when={section.title}>
                    <h2 class="mb-4 text-xl font-bold text-zinc-900">
                      {section.title}
                    </h2>
                  </Show>
                  <div class="grid gap-4 md:grid-cols-2">
                    <For each={banners}>
                      {(banner) => (
                        <a
                          href={banner.cta_url || "/promocoes"}
                          class="block overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100"
                        >
                          <img
                            src={assetUrl(banner.desktop_image_path)}
                            alt={banner.alt_text || banner.title}
                            class="h-44 w-full object-cover sm:h-52"
                            loading="lazy"
                          />
                        </a>
                      )}
                    </For>
                  </div>
                </section>
              </Show>
            );
          }

          if (section.type === "brand_showcase") {
            const brands = Array.isArray(section.data)
              ? (section.data as BrandItem[])
              : [];
            return <BrandCarouselBlock section={section} brands={brands} />;
          }

          if (section.type === "testimonials") {
            const reviews = Array.isArray(section.data)
              ? (section.data as HomeReview[])
              : [];
            return (
              <TestimonialsCarouselBlock section={section} reviews={reviews} />
            );
          }

          if (section.type === "newsletter") {
            return <NewsletterSection />;
          }

          return null;
        }}
      </For>
    </StoreShell>
  );
}
