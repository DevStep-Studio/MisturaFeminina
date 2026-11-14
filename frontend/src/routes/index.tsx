import { createFileRoute, Link } from "@tanstack/solid-router";
import Check from "lucide-solid/icons/check";
import ChevronLeft from "lucide-solid/icons/chevron-left";
import ChevronRight from "lucide-solid/icons/chevron-right";
import CreditCard from "lucide-solid/icons/credit-card";
import MessageCircle from "lucide-solid/icons/message-circle";
import ShieldCheck from "lucide-solid/icons/shield-check";
import Star from "lucide-solid/icons/star";
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
      return <Truck class="h-5 w-5 text-[var(--mf-primary)]" />;
    case "message-circle":
      return <MessageCircle class="h-5 w-5 text-[var(--mf-primary)]" />;
    case "shield-check":
      return <ShieldCheck class="h-5 w-5 text-[var(--mf-primary)]" />;
    case "tag":
      return <Tag class="h-5 w-5 text-[var(--mf-primary)]" />;
    default:
      return <CreditCard class="h-5 w-5 text-[var(--mf-primary)]" />;
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

function ProductShowcaseBlock(props: { section: HomeSectionData }) {
  const products = () =>
    Array.isArray(props.section.data)
      ? (props.section.data as ProductCardData[])
      : [];
  const filter = () => String(props.section.config?.filter ?? "featured");
  const viewAllHref = () => {
    if (filter() === "offers") return "/promocoes";
    if (filter() === "new_arrivals") return "/novidades";
    return "/buscar";
  };

  return (
    <Show when={products().length > 0}>
      <section class="mx-auto max-w-7xl px-4 py-8 sm:py-10">
        <div class="mb-5 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 class="text-xl font-bold text-zinc-900 sm:text-2xl">
              {props.section.title || "Produtos em destaque"}
            </h2>
            <Show when={props.section.subtitle}>
              <p class="mt-0.5 text-sm text-zinc-600">
                {props.section.subtitle}
              </p>
            </Show>
          </div>
          <Link
            to={viewAllHref()}
            class="inline-flex items-center gap-1 text-sm font-semibold text-[var(--mf-primary)] hover:underline"
          >
            Ver todos
            <ChevronRight class="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <For each={products()}>
            {(product) => <ProductCard product={product} />}
          </For>
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
                class="border-b border-zinc-200 bg-white py-5"
              >
                <div class="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 sm:grid-cols-3 lg:grid-cols-5">
                  <For each={settings().benefits_row}>
                    {(item) => (
                      <div class="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
                        <div class="shrink-0">
                          {renderBenefitIcon(item.icon)}
                        </div>
                        <div class="min-w-0">
                          <p class="truncate text-xs font-bold text-zinc-900">
                            {item.title}
                          </p>
                          <p class="truncate text-[11px] text-zinc-600">
                            {item.subtitle}
                          </p>
                        </div>
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
              <Show when={categories.length > 0}>
                <section class="mx-auto max-w-7xl px-4 py-8">
                  <div class="mb-5 flex items-center justify-between">
                    <h2 class="text-xl font-bold text-zinc-900 sm:text-2xl">
                      {section.title || "Compre por categoria"}
                    </h2>
                    <Link
                      to="/categorias"
                      class="text-sm font-semibold text-[var(--mf-primary)] hover:underline"
                    >
                      Ver todas
                    </Link>
                  </div>
                  <div class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                    <For each={categories}>
                      {(cat) => (
                        <Link
                          to="/categoria/$slug"
                          params={{ slug: cat.slug }}
                          class="group flex flex-col items-center gap-2 rounded-xl border border-zinc-200 bg-white p-3 text-center transition hover:border-[var(--mf-primary)]"
                        >
                          <div class="h-16 w-16 overflow-hidden rounded-full border border-zinc-200 bg-zinc-50 sm:h-20 sm:w-20">
                            <img
                              src={assetUrl(cat.image_path)}
                              alt={cat.name}
                              class="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </div>
                          <span class="text-xs font-semibold text-zinc-900 group-hover:text-[var(--mf-primary)]">
                            {cat.name}
                          </span>
                        </Link>
                      )}
                    </For>
                  </div>
                </section>
              </Show>
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
            return (
              <Show when={brands.length > 0}>
                <section class="mx-auto max-w-7xl px-4 py-8">
                  <div class="mb-5 flex items-center justify-between">
                    <h2 class="text-xl font-bold text-zinc-900 sm:text-2xl">
                      {section.title || "Marcas Parceiras"}
                    </h2>
                    <Link
                      to="/marcas"
                      class="text-sm font-semibold text-[var(--mf-primary)] hover:underline"
                    >
                      Todas as marcas
                    </Link>
                  </div>
                  <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <For each={brands}>
                      {(brand) => (
                        <Link
                          to="/marca/$slug"
                          params={{ slug: brand.slug }}
                          class="flex items-center justify-center rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-[var(--mf-primary)]"
                        >
                          <img
                            src={assetUrl(brand.logo_path)}
                            alt={brand.name}
                            class="h-12 w-auto max-w-[140px] object-contain"
                            loading="lazy"
                          />
                        </Link>
                      )}
                    </For>
                  </div>
                </section>
              </Show>
            );
          }

          if (section.type === "testimonials") {
            const reviews = Array.isArray(section.data)
              ? (section.data as HomeReview[])
              : [];
            return (
              <Show when={reviews.length > 0}>
                <section class="mx-auto max-w-7xl px-4 py-8">
                  <h2 class="mb-5 text-xl font-bold text-zinc-900 sm:text-2xl">
                    {section.title || "Avaliações verificadas de clientes"}
                  </h2>
                  <div class="grid gap-4 md:grid-cols-3">
                    <For each={reviews}>
                      {(rev) => (
                        <article class="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                          <div class="mb-2 flex items-center gap-1 text-amber-500">
                            <For each={Array.from({ length: rev.rating })}>
                              {() => <Star class="h-4 w-4 fill-current" />}
                            </For>
                          </div>
                          <Show when={rev.title}>
                            <h3 class="text-sm font-bold text-zinc-900">
                              {rev.title}
                            </h3>
                          </Show>
                          <p class="mt-1 text-sm text-zinc-700">{rev.body}</p>
                          <div class="mt-3 flex items-center justify-between text-xs text-zinc-500">
                            <span class="font-semibold text-zinc-800">
                              {rev.author_name}
                            </span>
                            <Show when={rev.product}>
                              {(p) => (
                                <Link
                                  to="/produto/$slug"
                                  params={{ slug: p().slug }}
                                  class="text-[var(--mf-primary)] hover:underline"
                                >
                                  {p().name}
                                </Link>
                              )}
                            </Show>
                          </div>
                        </article>
                      )}
                    </For>
                  </div>
                </section>
              </Show>
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
