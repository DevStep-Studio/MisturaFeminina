import { createFileRoute, Link } from "@tanstack/solid-router";
import Check from "lucide-solid/icons/check";
import ChevronLeft from "lucide-solid/icons/chevron-left";
import ChevronRight from "lucide-solid/icons/chevron-right";
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
import { SectionHeading } from "../features/storefront/components/SectionHeading";
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

const BENEFIT_ICON_PATHS: Record<string, string> = {
  truck: "/icons/stripe-new-brasil.png",
  "message-circle": "/icons/stripe-new-phone.png",
  "shield-check": "/icons/stripe-new-security.png",
  tag: "/icons/stripe-new-discount.png",
  "credit-card": "/icons/stripe-new-card.png",
};

function renderBenefitIcon(name: string) {
  const src = BENEFIT_ICON_PATHS[name] ?? BENEFIT_ICON_PATHS["credit-card"];
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      class="h-8 w-8 select-none object-contain sm:h-[34px] sm:w-[34px]"
    />
  );
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
        class="relative overflow-hidden bg-[#7c3f87]"
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
                  class={
                    banner().mobile_image_path
                      ? "block aspect-[3/4] max-h-[520px] w-full object-cover object-center md:aspect-[1920/650] md:max-h-none"
                      : "block aspect-[3/1] max-h-[620px] w-full object-cover object-center"
                  }
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
                    class="absolute left-3 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-lg border border-[#93509e] bg-white/95 text-[#93509e] shadow transition-colors hover:bg-[#93509e] hover:text-white sm:left-4 sm:size-11"
                  >
                    <ChevronLeft class="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setIndex((i) => (i + 1) % props.banners.length)
                    }
                    aria-label="Próximo banner"
                    class="absolute right-3 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-lg border border-[#93509e] bg-white/95 text-[#93509e] shadow transition-colors hover:bg-[#93509e] hover:text-white sm:right-4 sm:size-11"
                  >
                    <ChevronRight class="h-5 w-5" />
                  </button>

                  <div class="absolute bottom-2.5 left-1/2 flex -translate-x-1/2 gap-2">
                    <For each={props.banners}>
                      {(_, idx) => (
                        <button
                          type="button"
                          onClick={() => setIndex(idx())}
                          aria-label={`Ir para banner ${idx() + 1}`}
                          class={`h-2.5 w-6 rounded-sm transition ${
                            index() === idx()
                              ? "bg-[#93509e] ring-1 ring-white"
                              : "bg-white/80 hover:bg-white"
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

function renderCouponSubtitle(
  subtitle: string | null | undefined,
  code: string,
) {
  if (!subtitle) {
    return (
      <>
        Na sua primeira compra, use o cupom{" "}
        <strong class="font-bold">{code}</strong> e ganhe 10% OFF!
      </>
    );
  }
  const idx = subtitle.toUpperCase().indexOf(code.toUpperCase());
  if (idx === -1) {
    return subtitle;
  }
  const before = subtitle.slice(0, idx);
  const match = subtitle.slice(idx, idx + code.length);
  const after = subtitle.slice(idx + code.length);
  return (
    <>
      {before}
      <strong class="font-bold">{match}</strong>
      {after}
    </>
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
        <section class="bg-white py-3.5 sm:py-4">
          <div class="mx-auto flex max-w-7xl flex-col items-center justify-center gap-3 px-4 text-center sm:flex-row sm:gap-5">
            <p class="text-[13px] font-normal leading-snug text-[#5E2889] sm:text-[15px]">
              <strong class="font-bold">
                {props.section.title || "Aproveite um Desconto Especial!"}
              </strong>{" "}
              {renderCouponSubtitle(props.section.subtitle, coupon().code)}
            </p>
            <div class="inline-flex h-[36px] shrink-0 items-stretch sm:h-[38px]">
              <span class="inline-flex items-center justify-center rounded-l-lg border-[1.5px] border-r-0 border-dashed border-[#93509e] bg-white px-6 text-[13px] font-bold tracking-normal text-[#93509e] sm:px-7 sm:text-[14px]">
                {coupon().code}
              </span>
              <button
                type="button"
                onClick={() => void copy(coupon().code)}
                class="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-r-lg bg-[#93509e] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#7c3f87] sm:px-6 sm:text-[14px]"
              >
                <Show when={copied()}>
                  <Check class="h-3.5 w-3.5" aria-hidden="true" />
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
      <section class="mf-scroll-reveal bg-white pt-6 pb-8 sm:pt-8 sm:pb-10">
        <div class="mx-auto w-[96%] max-w-[1520px]">
          <SectionHeading
            title={props.section.title || "Navegue por Categorias"}
            subtitle={props.section.subtitle}
          />

          <div class="relative">
            <div class="grid grid-cols-3 gap-5 sm:grid-cols-4 sm:gap-7 lg:grid-cols-6 lg:gap-10 xl:gap-12">
              <For each={visibleCategories().slice(0, 6)}>
                {(cat) => (
                  <Link
                    to="/categoria/$slug"
                    params={{ slug: cat.slug }}
                    class="group flex flex-col items-center text-center focus-visible:outline-none"
                  >
                    <div class="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-full border border-[#EAE4F2] bg-white shadow-[0_2px_10px_rgba(43,10,80,0.04)] transition-all duration-300 ease-out group-hover:-translate-y-1.5 group-hover:border-[#93509e]/50 group-hover:shadow-[0_14px_28px_-6px_rgba(147,80,158,0.22)] group-hover:ring-4 group-hover:ring-[#93509e]/10 group-focus-visible:ring-2 group-focus-visible:ring-[#93509e]">
                      <img
                        src={assetUrl(cat.image_path)}
                        alt={cat.name}
                        class="aspect-square h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.08]"
                        loading="lazy"
                      />
                    </div>
                    <span class="mt-3 inline-flex items-center justify-center rounded-lg px-3.5 py-1 text-[13px] font-bold leading-normal text-[#93509e] transition-all duration-300 ease-out group-hover:bg-[#93509e] group-hover:text-white sm:text-[14px]">
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
                class="absolute left-0 top-[calc(50%-18px)] z-10 inline-flex h-[44px] w-[44px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg border border-[#93509e] bg-white text-[#93509e] shadow-sm transition-all duration-200 hover:bg-[#93509e] hover:text-white active:scale-95"
              >
                <ChevronLeft class="h-5 w-5 stroke-[2.2]" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setOffset((o) => o + 1)}
                aria-label="Próximas categorias"
                class="absolute right-0 top-[calc(50%-18px)] z-10 inline-flex h-[44px] w-[44px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg border border-[#93509e] bg-white text-[#93509e] shadow-sm transition-all duration-200 hover:bg-[#93509e] hover:text-white active:scale-95"
              >
                <ChevronRight class="h-5 w-5 stroke-[2.2]" aria-hidden="true" />
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
  const isCountdownOffers = () =>
    filter() === "offers" ||
    Boolean(props.section.config?.show_view_all) ||
    props.section.key === "offers_week";
  const isBorderless = () =>
    isCountdownOffers() || Boolean(props.section.config?.borderless);
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
      <section
        class={`mf-scroll-reveal ${
          isCountdownOffers()
            ? "bg-[#F3F3F3] pb-[24px] pt-[30px]"
            : "bg-white py-8 sm:py-10"
        }`}
      >
        <div class="mx-auto w-[96%] max-w-[1520px]">
          <Show
            when={isCountdownOffers()}
            fallback={
              <SectionHeading
                title={props.section.title || "Destaques"}
                subtitle={props.section.subtitle}
              />
            }
          >
            <SectionHeading
              align="left"
              title={props.section.title || "Confira nossas ofertas da semana"}
              subtitle={
                props.section.subtitle ||
                "Produtos com os melhores preços do mercado, confira já!"
              }
              action={
                <Link
                  to={viewAllHref()}
                  class="group inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#93509e] bg-white px-5 py-2 text-[13px] font-semibold text-[#93509e] shadow-2xs transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-[#93509e] hover:text-white hover:shadow-[0_6px_16px_rgba(147,80,158,0.18)]"
                >
                  <span>Ver tudo</span>
                  <ChevronRight
                    class="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              }
            />
          </Show>

          <div class="relative">
            <div class="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
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
                class="absolute left-1 top-[42%] inline-flex h-[44px] w-[43px] -translate-y-1/2 items-center justify-center rounded-lg border border-[#93509e] bg-white text-[#93509e] shadow-sm transition hover:bg-[#93509e] hover:text-white sm:left-1.5"
              >
                <ChevronLeft class="h-5 w-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setOffset((o) => o + 1)}
                aria-label={`Próximos produtos em ${props.section.title || "vitrine"}`}
                class="absolute right-1 top-[42%] inline-flex h-[44px] w-[43px] -translate-y-1/2 items-center justify-center rounded-lg border border-[#93509e] bg-white text-[#93509e] shadow-sm transition hover:bg-[#93509e] hover:text-white sm:right-1.5"
              >
                <ChevronRight class="h-5 w-5" aria-hidden="true" />
              </button>
            </Show>
          </div>
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
        class="mf-scroll-reveal mx-auto max-w-7xl bg-white px-4 py-8 sm:py-10"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusIn={() => setPaused(true)}
        onFocusOut={() => setPaused(false)}
      >
        <SectionHeading
          title={props.section.title || "As melhores marcas"}
          subtitle={props.section.subtitle}
          action={
            <Show when={showViewAll()}>
              <Link
                to="/marcas"
                class="group inline-flex items-center gap-1 rounded-lg border border-[#93509e] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#93509e] transition-all duration-300 hover:bg-[#93509e] hover:text-white"
              >
                <span>Todas as marcas</span>
                <ChevronRight
                  class="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </Show>
          }
        />

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
              class="absolute left-0 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-lg border border-[#93509e] bg-white text-[#93509e] shadow-sm transition hover:bg-[#93509e] hover:text-white sm:size-9"
            >
              <ChevronLeft class="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setOffset((o) => o + 1)}
              aria-label={`Próximas marcas em ${props.section.title || "As melhores marcas"}`}
              class="absolute right-0 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-lg border border-[#93509e] bg-white text-[#93509e] shadow-sm transition hover:bg-[#93509e] hover:text-white sm:size-9"
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
      <section class="mf-scroll-reveal mx-auto max-w-7xl bg-white px-4 py-8 sm:py-10">
        <SectionHeading
          title={props.section.title || "Quem compra indica!"}
          subtitle={props.section.subtitle}
        />

        <div class="relative px-4 sm:px-6">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <For each={visibleReviews().slice(0, 4)}>
              {(rev, idx) => (
                <article
                  class={`relative min-h-[176px] flex-col justify-between overflow-hidden rounded-lg border border-[#E5D2EA] bg-[#F6EBF8] p-4 shadow-xs ${
                    idx() === 0
                      ? "flex"
                      : idx() === 1
                        ? "hidden sm:flex"
                        : "hidden lg:flex"
                  }`}
                >
                  <div>
                    <div class="mb-2 flex items-center gap-2 text-[11px] font-medium text-[#5B2168]">
                      <span class="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-[#93509e] text-[10px] font-bold text-white shadow-xs">
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
                    <img
                      src="/logo-mf.png"
                      alt=""
                      class="h-7 w-auto object-contain opacity-90"
                    />
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
              class="absolute left-0 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-lg border border-[#93509e] bg-white text-[#93509e] shadow-sm transition hover:bg-[#93509e] hover:text-white sm:size-9"
            >
              <ChevronLeft class="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setOffset((o) => o + 1)}
              aria-label={`Próximos depoimentos em ${props.section.title || "Quem compra indica!"}`}
              class="absolute right-0 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-lg border border-[#93509e] bg-white text-[#93509e] shadow-sm transition hover:bg-[#93509e] hover:text-white sm:size-9"
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
                class="mf-scroll-reveal bg-white py-7 sm:py-8"
              >
                <div class="mx-auto grid max-w-[1440px] grid-cols-2 gap-x-4 gap-y-5 px-4 sm:grid-cols-3 lg:grid-cols-5">
                  <For each={settings().benefits_row}>
                    {(item) => (
                      <div class="flex flex-col items-center text-center last:col-span-2 sm:last:col-span-1">
                        <div class="mb-2 flex items-center justify-center">
                          {renderBenefitIcon(item.icon)}
                        </div>
                        <p class="text-[13.5px] font-extrabold leading-snug text-[#2F0572]">
                          {item.title}
                        </p>
                        <p class="mt-0.5 text-[12.5px] font-normal leading-snug text-[#2F0572]">
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
                  class="mf-scroll-reveal mx-auto max-w-7xl px-4 py-6"
                >
                  <Show when={section.title}>
                    <SectionHeading
                      title={section.title!}
                      subtitle={section.subtitle}
                    />
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
                            class="aspect-[5/2] w-full object-cover"
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
