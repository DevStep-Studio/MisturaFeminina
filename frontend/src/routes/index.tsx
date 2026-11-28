import { createFileRoute, Link } from "@tanstack/solid-router";
import Check from "lucide-solid/icons/check";
import ChevronLeft from "lucide-solid/icons/chevron-left";
import ChevronRight from "lucide-solid/icons/chevron-right";
import {
  ErrorBoundary,
  For,
  Show,
  createResource,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { NewsletterSection } from "../features/storefront/components/NewsletterSection";
import { BannerImage } from "../features/storefront/components/BannerImage";
import { HomeSelfServiceBanner } from "../features/storefront/components/HomeSelfServiceBanner";
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
import {
  buildOrganizationSchema,
  buildWebSiteSchema,
  seoHead,
} from "../lib/seo";
import { selectPromotion } from "../monitoring/analytics";

export const Route = createFileRoute("/")({
  head: () =>
    seoHead({
      title: "Mistura Feminina Cosméticos | Esmaltes em Gel, Alongamento e Beleza",
      description:
        "Loja de cosméticos e produtos para unhas: esmaltes em gel, géis construtores, moldes F1, lixas, cabines e acessórios profissionais com entrega rápida.",
      path: "/",
      jsonLd: [buildOrganizationSchema(), buildWebSiteSchema()],
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
  const [paused, setPaused] = createSignal(false);
  let touchStartX: number | null = null;

  const prevSlide = () =>
    setIndex((i) => (i - 1 + props.banners.length) % props.banners.length);
  const nextSlide = () => setIndex((i) => (i + 1) % props.banners.length);

  onMount(() => {
    if (props.banners.length <= 1) return;
    const id = window.setInterval(() => {
      if (!paused()) {
        nextSlide();
      }
    }, 6000);
    onCleanup(() => window.clearInterval(id));
  });

  const handleTouchStart = (e: TouchEvent) => {
    touchStartX = e.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (e: TouchEvent) => {
    if (touchStartX === null || props.banners.length <= 1) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX;
    const deltaX = endX - touchStartX;
    touchStartX = null;
    if (Math.abs(deltaX) >= 40) {
      if (deltaX < 0) nextSlide();
      else prevSlide();
    }
  };

  const current = () => props.banners[index()] ?? props.banners[0];

  return (
    <Show when={props.banners.length > 0}>
      <section
        aria-label="Destaques principais"
        class="relative w-full overflow-hidden"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusIn={() => setPaused(true)}
        onFocusOut={() => setPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <Show when={current()}>
          {(banner) => {
            const img = (
              <BannerImage
                src={banner().desktop_image_path}
                mobileSrc={banner().mobile_image_path}
                alt={banner().alt_text || banner().title}
                eager
                class="block h-full w-full"
                imageClass="block h-full w-full object-cover select-none"
              />
            );

            return (
              <div
                class="relative w-full aspect-[3/1] overflow-hidden"
                style={{ "aspect-ratio": "3 / 1" }}
              >
                <Show when={banner().cta_url} fallback={img}>
                  <a href={banner().cta_url!} class="block h-full w-full">
                    {img}
                  </a>
                </Show>

                <Show when={props.banners.length > 1}>
                  <button
                    type="button"
                    onClick={prevSlide}
                    aria-label="Banner anterior"
                    class="absolute left-1.5 top-1/2 z-10 inline-flex h-8 w-5 -translate-y-1/2 items-center justify-center rounded-r-md bg-black/25 text-white backdrop-blur-[2px] transition-colors hover:bg-[#93509e] sm:left-3 sm:size-9 sm:rounded-lg sm:border sm:border-[#93509e]/70 sm:bg-white/90 sm:text-[#93509e] sm:shadow-xs sm:hover:text-white sm:hover:bg-[#93509e] lg:left-5 lg:size-10"
                  >
                    <ChevronLeft class="h-3.5 w-3.5 sm:h-4 sm:w-4 lg:h-5 lg:w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={nextSlide}
                    aria-label="Próximo banner"
                    class="absolute right-1.5 top-1/2 z-10 inline-flex h-8 w-5 -translate-y-1/2 items-center justify-center rounded-l-md bg-black/25 text-white backdrop-blur-[2px] transition-colors hover:bg-[#93509e] sm:right-3 sm:size-9 sm:rounded-lg sm:border sm:border-[#93509e]/70 sm:bg-white/90 sm:text-[#93509e] sm:shadow-xs sm:hover:text-white sm:hover:bg-[#93509e] lg:right-5 lg:size-10"
                  >
                    <ChevronRight class="h-3.5 w-3.5 sm:h-4 sm:w-4 lg:h-5 lg:w-5" />
                  </button>

                  <div class="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1.5 sm:bottom-3 sm:gap-2">
                    <For each={props.banners}>
                      {(_, idx) => (
                        <button
                          type="button"
                          onClick={() => setIndex(idx())}
                          aria-label={`Ir para banner ${idx() + 1}`}
                          class={`h-1.5 w-4 rounded-sm transition sm:h-2.5 sm:w-6 ${
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
      selectPromotion({
        promotion_id: code,
        promotion_name: props.section.title || "Cupom Especial",
        creative_name: "home_coupon_strip",
      });
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

interface ManicureCategoryItem {
  id: number | string;
  name: string;
  slug?: string;
  href?: string;
  image: string;
  badge?: string;
  subtitle?: string;
}

const MANICURE_ESSENTIAL_CATEGORIES: ManicureCategoryItem[] = [
  {
    id: "alongamento",
    name: "Alongamento Unhas",
    slug: "alongamento-unhas",
    image: "/categories/alongamento-unhas.png",
    subtitle: "Géis, Polygel, Moldes",
  },
  {
    id: "esmalte-gel",
    name: "Esmalte em Gel",
    slug: "esmalte-em-gel",
    image: "/categories/esmaltes-em-gel.png",
    subtitle: "Alta Duração & Brilho",
  },
  {
    id: "prep",
    name: "Preparação & Top Coat",
    slug: "alongamento-unhas",
    image: "/categories/prep.png",
    subtitle: "Prep, Primer e Selante",
  },
  {
    id: "lixas",
    name: "Lixas & Brocas",
    slug: "acessorios",
    image: "/categories/lixas.png",
    subtitle: "OPI, Diamantadas, Refil",
  },
  {
    id: "alicates",
    name: "Alicates & Corte",
    slug: "acessorios",
    image: "/categories/alicates-cortadores.png",
    subtitle: "Cutículas e Espátulas",
  },
  {
    id: "maquinarios",
    name: "Cabines & Motores",
    slug: "maquinarios",
    image: "/categories/cabines.png",
    subtitle: "Cabines Sun UV/LED",
  },
  {
    id: "decoracao",
    name: "Decoração & Nail Art",
    slug: "decoracao",
    image: "/categories/alongamento-unhas.png",
    subtitle: "Glitters e Pedrarias",
  },
  {
    id: "cuidados",
    name: "Cuidados & Higiene",
    slug: "cuidados-unhas",
    image: "/categories/cuidados-unhas.png",
    subtitle: "Cutículas e Limpeza",
  },
  {
    id: "kits",
    name: "Kits Manicure",
    slug: "kits",
    image: "/categories/kits.png",
    subtitle: "Iniciante e Avançado",
  },
  {
    id: "atacado",
    name: "Atacado & Reposição",
    href: "/atacado",
    image: "/categories/descartaveis.png",
    badge: "Até 25% OFF",
    subtitle: "Preços Profissionais",
  },
];

function CategoryCirclesBlock(props: {
  section: HomeSectionData;
  categories: CategoryNode[];
}) {
  const [offset, setOffset] = createSignal(0);

  // Combina as categorias da loja com as categorias essenciais da manicure
  const resolvedCategories = (): ManicureCategoryItem[] => {
    if (props.categories && props.categories.length > 0) {
      // Cria mapa de imagens padronizadas para slugs conhecidos
      const imageBySlug: Record<string, string> = {
        "alongamento-unhas": "/categories/alongamento-unhas.png",
        "esmalte-em-gel": "/categories/esmaltes-em-gel.png",
        "esmalte": "/categories/esmaltes-em-gel.png",
        "maquinarios": "/categories/cabines.png",
        "acessorios": "/categories/lixas.png",
        "cuidados-unhas": "/categories/cuidados-unhas.png",
        "decoracao": "/categories/alongamento-unhas.png",
        "kits": "/categories/kits.png",
        "descartaveis": "/categories/descartaveis.png",
        "cilios-e-sobrancelhas": "/categories/cilios-sobrancelhas.png",
      };

      const fromApi: ManicureCategoryItem[] = props.categories.slice(0, 9).map((cat) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        image: cat.image_path ? assetUrl(cat.image_path) : (imageBySlug[cat.slug] || "/categories/alongamento-unhas.png"),
      }));

      // Adiciona o item de atacado como 10ª categoria obrigatória
      fromApi.push({
        id: "atacado-card",
        name: "Atacado & Reposição",
        href: "/atacado",
        image: "/categories/descartaveis.png",
        badge: "Até 25% OFF",
        subtitle: "Preço Profissional",
      });

      return fromApi;
    }

    const activeSlugs = new Set(storefrontStore.bootstrap().menu_categories.map((c) => c.slug));
    if (activeSlugs.size > 0) {
      return MANICURE_ESSENTIAL_CATEGORIES.filter((c) => !c.slug || activeSlugs.has(c.slug));
    }

    return MANICURE_ESSENTIAL_CATEGORIES;
  };

  const visibleCategories = () => rotateList(resolvedCategories(), offset());

  return (
    <section class="mf-scroll-reveal bg-white pt-6 pb-8 sm:pt-8 sm:pb-10">
      <div class="mx-auto w-[96%] max-w-[1520px]">
        <SectionHeading
          title={props.section.title || "Navegue por Categorias"}
          subtitle={
            props.section.subtitle ||
            "Produtos profissionais para alongamento, esmaltação e atendimento em manicure"
          }
        />

        <div class="relative">
          {/* Grid responsivo: 3 colunas em mobile, 5 colunas em tablet, 5 ou 6 colunas em desktop */}
          <div class="grid grid-cols-2 gap-3 min-[480px]:grid-cols-3 sm:grid-cols-4 sm:gap-6 lg:grid-cols-5 xl:gap-8">
            <For each={visibleCategories().slice(0, 5)}>
              {(cat) => {
                const linkContent = (
                  <div class="mf-card-stagger group flex flex-col items-center text-center focus-visible:outline-none cursor-pointer">
                    <div class="relative flex aspect-square w-full max-w-[140px] sm:max-w-[170px] items-center justify-center overflow-hidden rounded-full border border-[#EAE4F2] bg-[#FCF8FD] p-2 shadow-[0_2px_12px_rgba(43,10,80,0.05)] transition-all duration-300 ease-out group-hover:-translate-y-1.5 group-hover:border-[#93509e]/60 group-hover:shadow-[0_14px_28px_-6px_rgba(147,80,158,0.24)] group-hover:ring-4 group-hover:ring-[#93509e]/10 group-focus-visible:ring-2 group-focus-visible:ring-[#93509e]">
                      <img
                        src={cat.image}
                        alt={cat.name}
                        class="aspect-square h-full w-full object-contain transition-transform duration-500 ease-out group-hover:scale-[1.08]"
                        loading="lazy"
                      />
                      <Show when={cat.badge}>
                        <span class="absolute bottom-1.5 inline-flex items-center rounded-full bg-[#93509e] px-2 py-0.5 text-[9px] sm:text-[10px] font-extrabold text-white shadow-xs">
                          {cat.badge}
                        </span>
                      </Show>
                    </div>
                    <span class="mt-2.5 inline-flex items-center justify-center rounded-lg px-2.5 py-1 text-[13px] font-bold leading-tight text-[#2E0C49] transition-all duration-300 ease-out group-hover:text-[#93509e] sm:text-[14px]">
                      {cat.name}
                    </span>
                    <Show when={cat.subtitle}>
                      <span class="mt-0.5 hidden text-[11px] font-medium text-zinc-500 sm:block">
                        {cat.subtitle}
                      </span>
                    </Show>
                  </div>
                );

                return (
                  <Show
                    when={cat.href}
                    fallback={
                      <Link
                        to="/categoria/$slug"
                        params={{ slug: cat.slug || "alongamento-unhas" }}
                        class="block"
                      >
                        {linkContent}
                      </Link>
                    }
                  >
                    <a href={cat.href!} class="block">
                      {linkContent}
                    </a>
                  </Show>
                );
              }}
            </For>
          </div>

          <Show when={resolvedCategories().length > 5}>
            <button
              type="button"
              onClick={() => setOffset((o) => o - 1)}
              aria-label="Categorias anteriores"
              class="absolute -left-2 top-[35%] z-10 inline-flex h-[38px] w-[38px] sm:h-[44px] sm:w-[44px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-[#93509e]/30 bg-white text-[#93509e] shadow-md transition hover:bg-[#93509e] hover:text-white active:scale-95"
            >
              <ChevronLeft class="h-4 w-4 sm:h-5 sm:w-5 stroke-[2.2]" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setOffset((o) => o + 1)}
              aria-label="Próximas categorias"
              class="absolute -right-2 top-[35%] z-10 inline-flex h-[38px] w-[38px] sm:h-[44px] sm:w-[44px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-[#93509e]/30 bg-white text-[#93509e] shadow-md transition hover:bg-[#93509e] hover:text-white active:scale-95"
            >
              <ChevronRight class="h-4 w-4 sm:h-5 sm:w-5 stroke-[2.2]" aria-hidden="true" />
            </button>
          </Show>
        </div>
      </div>
    </section>
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
    filter() === "offers" || props.section.key === "offers_week";
  const isBorderless = () => Boolean(props.section.config?.borderless);
  const showFeaturedBadge = () =>
    filter() === "featured" ||
    Boolean(props.section.config?.show_featured_badge);
  const showViewAll = () => props.section.config?.show_view_all !== false;

  // Quantidade de produtos com desconto comprovado real no banco
  const promoCount = () =>
    products().filter(
      (p) => p.effective_price_cents < p.price_cents && p.discount_percent > 0,
    ).length;

  // Título editorial legítimo e comercial conforme diretrizes
  const displayTitle = () => {
    if (props.section.title) {
      if (isCountdownOffers() && promoCount() === 0) {
        return "Seleção da Mistura";
      }
      return props.section.title;
    }
    if (isCountdownOffers()) {
      return promoCount() > 0 ? "Ofertas Especiais" : "Seleção da Mistura";
    }
    return "Destaques do Catálogo";
  };

  const displaySubtitle = () => {
    if (props.section.subtitle) return props.section.subtitle;
    if (isCountdownOffers()) {
      return promoCount() > 0
        ? "Produtos com desconto especial no catálogo"
        : "Os produtos preferidos das manicures e clientes da Mistura";
    }
    return undefined;
  };

  const viewAllHref = () => {
    const cta = props.section.config?.cta_url;
    if (typeof cta === "string" && cta.length > 0) return cta;
    if (filter() === "offers") return "/promocoes";
    if (filter() === "new_arrivals") return "/novidades";
    const catSlug = props.section.config?.category_slug;
    if (
      filter() === "category" &&
      typeof catSlug === "string" &&
      catSlug.length > 0
    ) {
      return `/categoria/${catSlug}`;
    }
    return "/buscar";
  };

  const visibleProducts = () => rotateList(products(), offset());

  return (
    <Show when={products().length > 0}>
      <section
        class={`mf-scroll-reveal ${
          isCountdownOffers() && promoCount() > 0
            ? "bg-[#FAF5FB] border-y border-[#F3E2F6] pb-[26px] pt-[30px]"
            : "bg-white py-8 sm:py-10"
        }`}
      >
        <div class="mx-auto w-[96%] max-w-[1520px]">
          <SectionHeading
            align="left"
            title={displayTitle()}
            subtitle={displaySubtitle()}
            action={
              <Show when={showViewAll()}>
                <Link
                  to={viewAllHref()}
                  class="group inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#93509e] bg-white px-3.5 py-1.5 sm:px-4 sm:py-2 text-[12px] sm:text-[13px] font-semibold text-[#93509e] shadow-2xs transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-[#93509e] hover:text-white hover:shadow-[0_6px_16px_rgba(147,80,158,0.18)]"
                >
                  <span>Ver todos</span>
                  <ChevronRight
                    class="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              </Show>
            }
          />

          <div class="relative">
            <div
              class={`grid gap-3 sm:gap-5 ${
                products().length === 1
                  ? "grid-cols-1 max-w-sm mx-auto"
                  : products().length === 2
                  ? "grid-cols-2 max-w-2xl mx-auto"
                  : products().length === 3
                  ? "grid-cols-2 lg:grid-cols-3 max-w-4xl mx-auto"
                  : "grid-cols-2 lg:grid-cols-4"
              }`}
            >
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

            <Show when={products().length > 4}>
              <button
                type="button"
                onClick={() => setOffset((o) => o - 1)}
                aria-label={`Produtos anteriores em ${displayTitle()}`}
                class="absolute -left-2 sm:-left-3.5 top-[40%] z-10 inline-flex h-[36px] w-[36px] sm:h-[44px] sm:w-[44px] -translate-y-1/2 items-center justify-center rounded-full border border-[#93509e]/30 bg-white text-[#93509e] shadow-md transition hover:bg-[#93509e] hover:text-white active:scale-95"
              >
                <ChevronLeft class="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setOffset((o) => o + 1)}
                aria-label={`Próximos produtos em ${displayTitle()}`}
                class="absolute -right-2 sm:-right-3.5 top-[40%] z-10 inline-flex h-[36px] w-[36px] sm:h-[44px] sm:w-[44px] -translate-y-1/2 items-center justify-center rounded-full border border-[#93509e]/30 bg-white text-[#93509e] shadow-md transition hover:bg-[#93509e] hover:text-white active:scale-95"
              >
                <ChevronRight class="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
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

const REVIEW_AVATARS: Record<string, string> = {
  "Beatriz Nogueira": "/avatars/beatriz-nogueira.jpg",
  "Studio Aline Unhas": "/avatars/aline-unhas.jpg",
  "Juliana Mendes": "/avatars/juliana-mendes.jpg",
  "Camila Ferreira": "/avatars/camila-ferreira.jpg",
  "Larissa Costa": "/avatars/larissa-costa.jpg",
  "Mariana Rocha": "/avatars/mariana-rocha.jpg",
};

function ReviewAvatar(props: { author: string }) {
  const [imgError, setImgError] = createSignal(false);
  const avatarSrc = () => REVIEW_AVATARS[props.author] ?? null;

  return (
    <Show
      when={avatarSrc() && !imgError()}
      fallback={
        <span class="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[#93509e] text-[10px] font-bold text-white shadow-xs">
          {authorInitials(props.author)}
        </span>
      }
    >
      <img
        src={avatarSrc()!}
        alt={props.author}
        class="size-7 shrink-0 rounded-full object-cover border border-[#93509e]/30 shadow-xs ring-1 ring-white"
        onError={() => setImgError(true)}
      />
    </Show>
  );
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
                      <ReviewAvatar author={rev.author_name} />
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

function getDefaultHomeSections(): HomeSectionData[] {
  return [
    {
      id: 1001,
      key: "fallback-hero",
      type: "hero_carousel",
      title: "Mistura Feminina Cosméticos",
      subtitle: "Beleza, autocuidado e alta performance",
      config: {},
      data: [
        {
          id: 1,
          title: "Mistura Feminina Cosméticos",
          subtitle:
            "Encontre os melhores cosméticos, maquiagem e cuidados pessoais.",
          cta_label: "Ver Categorias",
          cta_url: "/categorias",
          desktop_image_path: "/storage/brand/hero-banner-desktop.png",
          mobile_image_path: "/storage/brand/hero-banner-mobile.png",
          alt_text: "Mistura Feminina Cosméticos",
        },
      ],
    },
    {
      id: 1002,
      key: "fallback-benefits",
      type: "benefits_row",
      title: null,
      subtitle: null,
      config: {},
      data: null,
    },
    {
      id: 1003,
      key: "fallback-categories",
      type: "category_circles",
      title: "Navegue por Categorias",
      subtitle: "Produtos profissionais para alongamento, esmaltação e atendimento em manicure",
      config: {},
      data: [
        { id: 45, name: "Alongamento Unhas", slug: "alongamento-unhas", image_path: null },
        { id: 80, name: "Esmalte em Gel", slug: "esmalte-em-gel", image_path: null },
        { id: 79, name: "Esmalte", slug: "esmalte", image_path: null },
        { id: 67, name: "Cuidados Unhas", slug: "cuidados-unhas", image_path: null },
        { id: 6, name: "Maquinários", slug: "maquinarios", image_path: null },
        { id: 72, name: "Decoração", slug: "decoracao", image_path: null },
        { id: 1, name: "Acessórios", slug: "acessorios", image_path: null },
        { id: 12, name: "Kits", slug: "kits", image_path: null },
      ],
    },
    {
      id: 1004,
      key: "fallback-newsletter",
      type: "newsletter",
      title: "Receba novidades e cupons",
      subtitle: "Cadastre seu e-mail para acompanhar nossos lançamentos.",
      config: {},
      data: null,
    },
  ];
}

function StorefrontHomePage() {
  const [homeData] = createResource(async () => {
    try {
      const res = await api<{ data: { sections: HomeSectionData[] } }>(
        "/storefront/home",
        {
          authenticated: false,
        },
      );
      return res.data?.sections?.length ? res.data.sections : getDefaultHomeSections();
    } catch {
      // Entrega seções de fallback ricas sem estourar rejeição para o router
      return getDefaultHomeSections();
    }
  });

  const sections = () => homeData() ?? getDefaultHomeSections();
  const settings = () => storefrontStore.settings();

  return (
    <StoreShell>
      <h1 class="sr-only">
        Mistura Feminina Cosméticos — Esmaltes em Gel, Alongamento de Unhas e Produtos Profissionais
      </h1>

      <ErrorBoundary
        fallback={(_err) => (
          <div class="mx-auto max-w-7xl px-4 py-8">
            <div class="rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
              <h2 class="text-xl font-bold text-zinc-900">
                Bem-vindo à Mistura Feminina Cosméticos
              </h2>
              <p class="mx-auto mt-2 max-w-xl text-sm text-zinc-600">
                Explore nosso catálogo completo com os melhores produtos para
                alongamento de unhas, esmaltes em gel, cuidados faciais e
                maquiagem.
              </p>
              <div class="mt-6 flex flex-wrap justify-center gap-3">
                <Link
                  to="/categorias"
                  class="rounded-lg bg-[var(--mf-primary)] px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:opacity-95"
                >
                  Ver Todas as Categorias
                </Link>
                <Link
                  to="/buscar"
                  class="rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  Buscar Produtos
                </Link>
                <Link
                  to="/promocoes"
                  class="rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  Promoções
                </Link>
              </div>
            </div>
          </div>
        )}
      >
        <Show when={homeData.loading && !homeData()}>
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
                            class="block overflow-hidden rounded-xl border border-zinc-200 bg-[#7c3f87]"
                          >
                            <BannerImage
                              src={banner.desktop_image_path}
                              mobileSrc={banner.mobile_image_path}
                              alt={banner.alt_text || banner.title}
                              imageClass="mx-auto block h-auto w-full object-contain"
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
              return (
                <>
                  <HomeSelfServiceBanner />
                  <NewsletterSection />
                </>
              );
            }

            return null;
          }}
        </For>

        <Show when={!sections().some((s) => s.type === "newsletter")}>
          <HomeSelfServiceBanner />
        </Show>
      </ErrorBoundary>
    </StoreShell>
  );
}
