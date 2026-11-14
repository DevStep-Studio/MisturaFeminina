import { createFileRoute, Link } from "@tanstack/solid-router";
import Bell from "lucide-solid/icons/bell";
import ChevronDown from "lucide-solid/icons/chevron-down";
import ChevronRight from "lucide-solid/icons/chevron-right";
import ChevronUp from "lucide-solid/icons/chevron-up";
import CreditCard from "lucide-solid/icons/credit-card";
import Minus from "lucide-solid/icons/minus";
import Plus from "lucide-solid/icons/plus";
import Star from "lucide-solid/icons/star";
import {
  For,
  Show,
  createEffect,
  createMemo,
  createResource,
  createSignal,
} from "solid-js";
import { NewsletterSection } from "../../features/storefront/components/NewsletterSection";
import { ProductCard } from "../../features/storefront/components/ProductCard";
import { SectionHeading } from "../../features/storefront/components/SectionHeading";
import { ShippingQuoteWidget } from "../../features/storefront/components/ShippingQuoteWidget";
import { StoreShell } from "../../features/storefront/components/StoreShell";
import { addCartItem, storefrontStore } from "../../features/storefront/store";
import type {
  ProductDetailData,
  ProductVariantData,
} from "../../features/storefront/types";
import { ApiError, api } from "../../lib/api";
import { assetUrl, formatCents, whatsappUrl } from "../../lib/format";
import { seoHead } from "../../lib/seo";

const VIEWED_STORAGE_KEY = "mf_viewed_products";

interface ViewedProductSummary {
  slug: string;
  name: string;
  primary_image: string | null;
}

function readViewedProducts(): ViewedProductSummary[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(VIEWED_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ViewedProductSummary[]) : [];
  } catch {
    return [];
  }
}

function recordViewedProduct(
  item: ViewedProductSummary,
): ViewedProductSummary[] {
  const existing = readViewedProducts().filter((v) => v.slug !== item.slug);
  const next = [item, ...existing].slice(0, 4);
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(VIEWED_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors in private mode
    }
  }
  return next;
}

export const Route = createFileRoute("/produto/$slug")({
  head: ({ params }) =>
    seoHead({
      title: `${params.slug} — Mistura Feminina Cosméticos`,
      description:
        "Detalhes, opções, frete e avaliações do produto na Mistura Feminina Cosméticos.",
      path: `/produto/${params.slug}`,
    }),
  component: ProductDetailPage,
});

function ProductDetailPage() {
  const params = Route.useParams();
  const settings = () => storefrontStore.settings();

  const [product, { refetch }] = createResource(
    () => params().slug,
    async (slug) => {
      const res = await api<{ data: ProductDetailData }>(
        `/catalog/products/${slug}`,
        {
          authenticated: false,
        },
      );
      return res.data;
    },
  );

  const [selectedVariantId, setSelectedVariantId] = createSignal<number | null>(
    null,
  );
  const [activeImage, setActiveImage] = createSignal<string | null>(null);
  const [qty, setQty] = createSignal(1);
  const [adding, setAdding] = createSignal(false);
  const [feedback, setFeedback] = createSignal<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  // Restock alert state
  const [restockName, setRestockName] = createSignal("");
  const [restockEmail, setRestockEmail] = createSignal("");
  const [restockBusy, setRestockBusy] = createSignal(false);
  const [restockMsg, setRestockMsg] = createSignal<string | null>(null);

  // Review state
  const [revName, setRevName] = createSignal("");
  const [revEmail, setRevEmail] = createSignal("");
  const [revRating, setRevRating] = createSignal(5);
  const [revTitle, setRevTitle] = createSignal("");
  const [revBody, setRevBody] = createSignal("");
  const [revBusy, setRevBusy] = createSignal(false);
  const [revMsg, setRevMsg] = createSignal<string | null>(null);
  const [openAccordion, setOpenAccordion] = createSignal<
    "descricao" | "pagamento" | "avaliacoes" | null
  >(null);
  const [viewedProducts, setViewedProducts] = createSignal<
    ViewedProductSummary[]
  >([]);

  createEffect(() => {
    const p = product();
    if (!p) return;
    const def =
      p.variants.find((v) => v.is_default && v.in_stock) ??
      p.variants.find((v) => v.in_stock) ??
      p.variants[0];
    setSelectedVariantId(def?.id ?? null);
    setActiveImage(
      def?.image_path || p.images[0]?.path || p.primary_image || null,
    );
    setQty(1);
    setFeedback(null);
    setOpenAccordion(null);
    setViewedProducts(
      recordViewedProduct({
        slug: p.slug,
        name: p.name,
        primary_image: p.images[0]?.path || p.primary_image || null,
      }),
    );
    if (typeof document !== "undefined" && p.seo_title) {
      document.title = p.seo_title;
    }
  });

  const activeVariant = createMemo<ProductVariantData | null>(() => {
    const p = product();
    if (!p || p.variants.length === 0) return null;
    return (
      p.variants.find((v) => v.id === selectedVariantId()) ??
      p.variants[0] ??
      null
    );
  });

  const currentPriceCents = () =>
    activeVariant()?.effective_price_cents ??
    product()?.effective_price_cents ??
    0;

  const originalPriceCents = () =>
    activeVariant()?.price_cents ?? product()?.price_cents ?? 0;

  const discountPct = () => {
    const orig = originalPriceCents();
    const cur = currentPriceCents();
    if (orig > 0 && cur < orig) {
      return Math.round(((orig - cur) / orig) * 100);
    }
    return product()?.discount_percent ?? 0;
  };

  const inStock = () =>
    activeVariant()?.in_stock ?? product()?.in_stock ?? false;
  const maxQty = () =>
    Math.max(
      1,
      activeVariant()?.available_stock ?? product()?.available_stock ?? 1,
    );

  function chooseVariant(v: ProductVariantData) {
    setSelectedVariantId(v.id);
    if (v.image_path) {
      setActiveImage(v.image_path);
    }
    setQty(1);
  }

  async function handleAddToCart() {
    const v = activeVariant();
    if (!v || !inStock()) return;
    setAdding(true);
    setFeedback(null);
    try {
      await addCartItem(v.id, qty(), true);
      setFeedback({ type: "ok", text: "Produto adicionado ao carrinho." });
    } catch (err) {
      setFeedback({
        type: "err",
        text:
          err instanceof ApiError
            ? err.message
            : "Não foi possível adicionar ao carrinho.",
      });
    } finally {
      setAdding(false);
    }
  }

  async function submitRestock(e: Event) {
    e.preventDefault();
    const p = product();
    if (!p || !restockEmail().trim()) return;
    setRestockBusy(true);
    setRestockMsg(null);
    try {
      const res = await api<{ message: string }>(
        `/catalog/products/${p.slug}/restock-alert`,
        {
          method: "POST",
          authenticated: false,
          body: {
            variant_id: activeVariant()?.id,
            email: restockEmail().trim(),
            name: restockName().trim() || undefined,
          },
        },
      );
      setRestockMsg(
        res.message ||
          "Você será avisada assim que este item voltar ao estoque.",
      );
      setRestockEmail("");
      setRestockName("");
    } catch (err) {
      setRestockMsg(
        err instanceof ApiError
          ? err.message
          : "Não foi possível registrar seu aviso.",
      );
    } finally {
      setRestockBusy(false);
    }
  }

  async function submitReview(e: Event) {
    e.preventDefault();
    const p = product();
    if (!p) return;
    setRevBusy(true);
    setRevMsg(null);
    try {
      const res = await api<{ message: string }>(
        `/catalog/products/${p.slug}/reviews`,
        {
          method: "POST",
          authenticated: false,
          body: {
            author_name: revName().trim(),
            author_email: revEmail().trim() || undefined,
            rating: revRating(),
            title: revTitle().trim() || undefined,
            body: revBody().trim(),
          },
        },
      );
      setRevMsg(res.message || "Avaliação enviada para moderação.");
      setRevName("");
      setRevEmail("");
      setRevTitle("");
      setRevBody("");
    } catch (err) {
      setRevMsg(
        err instanceof ApiError
          ? err.message
          : "Verifique os campos da avaliação.",
      );
    } finally {
      setRevBusy(false);
    }
  }

  return (
    <StoreShell>
      <Show when={product.loading}>
        <div class="mx-auto max-w-7xl px-4 py-8">
          <div class="grid gap-8 lg:grid-cols-12">
            <div class="aspect-square animate-pulse rounded-2xl bg-zinc-100 lg:col-span-7" />
            <div class="space-y-4 lg:col-span-5">
              <div class="h-8 w-2/3 animate-pulse rounded bg-zinc-100" />
              <div class="h-24 animate-pulse rounded bg-zinc-100" />
              <div class="h-12 animate-pulse rounded bg-zinc-100" />
            </div>
          </div>
        </div>
      </Show>

      <Show when={product.error}>
        <div class="mx-auto max-w-7xl px-4 py-8">
          <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-10 text-center">
            <h1 class="text-xl font-bold text-zinc-900">
              Produto não encontrado
            </h1>
            <p class="mt-2 text-sm text-zinc-600">
              Este item pode ter sido desativado ou o endereço mudou.
            </p>
            <div class="mt-5 flex justify-center gap-3">
              <Link
                to="/buscar"
                class="rounded-lg bg-[var(--mf-primary)] px-5 py-2.5 text-sm font-semibold text-white"
              >
                Explorar catálogo
              </Link>
              <button
                type="button"
                onClick={() => void refetch()}
                class="rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-800"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={product()}>
        {(p) => {
          const installments = () => 3;
          const installmentValue = () =>
            Math.ceil(currentPriceCents() / installments());
          const galleryImages = () => {
            if (p().images.length > 0) return p().images;
            if (p().primary_image) {
              return [
                {
                  id: 0,
                  path: p().primary_image!,
                  alt_text: p().primary_image_alt || p().name,
                  is_primary: true,
                  sort_order: 0,
                },
              ];
            }
            return [];
          };
          const stepGalleryImage = (delta: number) => {
            const imgs = galleryImages();
            if (imgs.length <= 1) return;
            const currentIdx = Math.max(
              0,
              imgs.findIndex((i) => i.path === activeImage()),
            );
            const nextIdx = (currentIdx + delta + imgs.length) % imgs.length;
            setActiveImage(imgs[nextIdx]!.path);
          };
          const toggleAccordion = (
            panel: "descricao" | "pagamento" | "avaliacoes",
          ) => {
            setOpenAccordion((cur) => (cur === panel ? null : panel));
          };
          const openReviewsAccordion = (e: Event) => {
            e.preventDefault();
            setOpenAccordion("avaliacoes");
            if (typeof document !== "undefined") {
              document
                .getElementById("avaliacoes")
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          };

          const productJsonLd = () =>
            JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Product",
              name: p().name,
              sku: activeVariant()?.sku ?? p().sku,
              description: p().short_description || p().description || p().name,
              brand: p().brand
                ? { "@type": "Brand", name: p().brand!.name }
                : undefined,
              offers: {
                "@type": "Offer",
                priceCurrency: "BRL",
                price: (currentPriceCents() / 100).toFixed(2),
                availability: inStock()
                  ? "https://schema.org/InStock"
                  : "https://schema.org/OutOfStock",
              },
            });

          const variantGroupLabel = () =>
            p().name.split(" ").slice(0, 2).join(" ");

          return (
            <>
              <script type="application/ld+json">{productJsonLd()}</script>

              <div class="mx-auto max-w-7xl px-4 pb-14 pt-4 sm:pt-6">
                <nav
                  aria-label="Navegação estrutural"
                  class="mb-6 flex flex-wrap items-center justify-center gap-2 text-xs text-[#2E0C49]"
                >
                  <Link to="/" class="hover:underline">
                    Home
                  </Link>
                  <Show when={p().categories[0]}>
                    {(cat) => (
                      <>
                        <span aria-hidden="true" class="text-[#2E0C49]/50">
                          /
                        </span>
                        <Link
                          to="/categoria/$slug"
                          params={{ slug: cat().slug }}
                          class="hover:underline"
                        >
                          {cat().name}
                        </Link>
                      </>
                    )}
                  </Show>
                  <span aria-hidden="true" class="text-[#2E0C49]/50">
                    /
                  </span>
                  <span class="font-medium text-[#2E0C49]">{p().name}</span>
                </nav>

                <div class="grid gap-8 lg:grid-cols-12 lg:items-start">
                  {/* Gallery: vertical thumbnails left + large main image right */}
                  <div class="lg:col-span-7">
                    <div class="flex flex-col-reverse gap-3 sm:flex-row sm:gap-4">
                      <Show when={galleryImages().length > 0}>
                        <div class="flex flex-row items-center gap-2 overflow-x-auto sm:flex-col sm:overflow-visible">
                          <button
                            type="button"
                            onClick={() => stepGalleryImage(-1)}
                            aria-label="Imagem anterior"
                            class="hidden size-6 shrink-0 items-center justify-center rounded-full bg-[#FAF0FC] text-[#3D1260] transition hover:bg-[#F3DDF9] sm:inline-flex"
                          >
                            <ChevronUp class="h-3.5 w-3.5" aria-hidden="true" />
                          </button>

                          <div class="flex flex-row gap-2 sm:flex-col">
                            <For each={galleryImages().slice(0, 5)}>
                              {(img) => (
                                <button
                                  type="button"
                                  onClick={() => setActiveImage(img.path)}
                                  aria-label={img.alt_text || p().name}
                                  class={`h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-white p-1 transition sm:h-20 sm:w-20 ${
                                    activeImage() === img.path
                                      ? "border-[#2E0C49] ring-1 ring-[#2E0C49]"
                                      : "border-zinc-200 hover:border-zinc-400"
                                  }`}
                                >
                                  <img
                                    src={assetUrl(img.path)}
                                    alt={img.alt_text || p().name}
                                    class="h-full w-full object-contain"
                                  />
                                </button>
                              )}
                            </For>
                          </div>

                          <button
                            type="button"
                            onClick={() => stepGalleryImage(1)}
                            aria-label="Próxima imagem"
                            class="hidden size-6 shrink-0 items-center justify-center rounded-full bg-[#FAF0FC] text-[#3D1260] transition hover:bg-[#F3DDF9] sm:inline-flex"
                          >
                            <ChevronDown
                              class="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                          </button>
                        </div>
                      </Show>

                      <div class="relative aspect-square flex-1 overflow-hidden rounded-xl bg-white">
                        <img
                          src={assetUrl(activeImage() || p().primary_image)}
                          alt={p().primary_image_alt || p().name}
                          class="h-full w-full object-contain p-2 sm:p-4"
                        />
                        <Show when={discountPct() > 0}>
                          <span class="sr-only">-{discountPct()}% OFF</span>
                        </Show>
                      </div>
                    </div>
                  </div>

                  {/* Buy Box */}
                  <div class="space-y-4 lg:col-span-5">
                    <div>
                      <h1 class="text-xl font-extrabold text-[#2E0C49] sm:text-[22px]">
                        {p().name}
                      </h1>
                      <p class="mt-1 text-xs text-[#2E0C49]/80">
                        Referência: {p().name}
                      </p>
                    </div>

                    <div>
                      <div
                        role="img"
                        class="flex items-center gap-0.5 text-amber-400"
                        aria-label={
                          p().rating_count > 0
                            ? `${p().rating_avg.toFixed(1)} de 5 estrelas`
                            : "Sem avaliações ainda"
                        }
                      >
                        <For each={[1, 2, 3, 4, 5]}>
                          {(n) => (
                            <Star
                              class={`h-3.5 w-3.5 ${
                                p().rating_count > 0 &&
                                n <= Math.round(p().rating_avg)
                                  ? "fill-current text-amber-400"
                                  : "text-amber-300"
                              }`}
                              aria-hidden="true"
                            />
                          )}
                        </For>
                      </div>
                      <a
                        href="#avaliacoes"
                        onClick={openReviewsAccordion}
                        class="mt-1 inline-block text-xs font-medium text-[#2E0C49] underline hover:text-[#62298D]"
                      >
                        {p().rating_count > 0
                          ? `Ver avaliações (${p().rating_count})`
                          : "Seja o primeiro a opinar"}
                      </a>
                    </div>

                    <div class="flex items-center gap-2 pt-0.5 text-xs text-[#2E0C49]">
                      <span
                        class="inline-block size-2.5 rounded-full bg-[#F87171] ring-4 ring-[#FEE2E2]"
                        aria-hidden="true"
                      />
                      <span>
                        <strong class="font-extrabold">
                          {11 + (p().id % 7)}
                        </strong>{" "}
                        Pessoas estão vendo este produto agora
                      </span>
                    </div>

                    <Show when={p().variants.length > 0}>
                      <div class="space-y-1.5 pt-1">
                        <label
                          for="pdp-variant-select"
                          class="block text-xs font-bold text-[#2E0C49]"
                        >
                          {variantGroupLabel()}:
                        </label>
                        <div class="relative inline-block">
                          <select
                            id="pdp-variant-select"
                            value={activeVariant()?.id ?? ""}
                            onChange={(e) => {
                              const selected = p().variants.find(
                                (item) =>
                                  item.id === Number(e.currentTarget.value),
                              );
                              if (selected) chooseVariant(selected);
                            }}
                            class="h-10 min-w-[165px] appearance-none rounded-full bg-[#FDF2FA] pl-4 pr-9 text-xs font-medium text-[#2E0C49] focus:outline-none focus:ring-2 focus:ring-[#62298D]"
                          >
                            <option value="" disabled>
                              Selecione
                            </option>
                            <For each={p().variants}>
                              {(v) => (
                                <option value={v.id}>
                                  {v.name}
                                  {v.in_stock ? "" : " (Esgotado)"}
                                </option>
                              )}
                            </For>
                          </select>
                          <ChevronDown
                            class="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#2E0C49]"
                            aria-hidden="true"
                          />
                        </div>
                      </div>
                    </Show>

                    {/* Price & installment */}
                    <div class="pt-1">
                      <Show
                        when={
                          discountPct() > 0 &&
                          originalPriceCents() > currentPriceCents()
                        }
                      >
                        <p class="text-xs text-[#52436E] line-through">
                          {formatCents(originalPriceCents())}
                        </p>
                      </Show>
                      <div class="text-2xl font-extrabold text-[#C918BF]">
                        {formatCents(currentPriceCents())}
                      </div>
                      <p class="mt-1 flex items-center gap-1.5 text-xs text-[#2E0C49]">
                        <CreditCard
                          class="h-4 w-4 shrink-0 text-[#2E0C49]"
                          aria-hidden="true"
                        />
                        <span>
                          ou{" "}
                          <strong class="font-bold text-[#C918BF]">
                            {installments()}x
                          </strong>{" "}
                          de{" "}
                          <strong class="font-bold text-[#C918BF]">
                            {formatCents(installmentValue())}
                          </strong>{" "}
                          Sem juros
                        </span>
                      </p>
                    </div>

                    {/* Progressive discount / shipping benefits notice */}
                    <div class="rounded-md bg-[#F7F7F8] px-4 py-3.5 text-[#2E0C49]">
                      <p class="text-xs font-bold text-[#2E0C49]">
                        Produto com desconto progressivo
                      </p>
                      <p class="mt-1.5 text-[11px] text-[#2E0C49]">
                        Frete Grátis para pedidos acima de R$149,90 para todo o
                        RJ
                      </p>
                      <p class="mt-0.5 text-[11px] text-[#2E0C49]">
                        Frete grátis para pedidos no Sudeste acima de R$299,90
                      </p>
                      <Show
                        when={
                          p().wholesale_enabled &&
                          p().wholesale_tiers.length > 0
                        }
                      >
                        <div class="mt-2 flex flex-wrap gap-1.5">
                          <For each={p().wholesale_tiers}>
                            {(tier) => (
                              <span class="rounded bg-white px-2 py-0.5 text-[11px] font-medium text-[#2E0C49]">
                                {tier.min_qty}+ un.: -{tier.discount_percent}%
                              </span>
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>

                    {/* Quantity pill + COMPRAR CTA + WhatsApp CTA or Restock Alert */}
                    <Show
                      when={inStock()}
                      fallback={
                        <form
                          onSubmit={submitRestock}
                          class="space-y-4 rounded-2xl border border-[#E5D4F0] bg-[#FAF7FC] p-4 sm:p-5"
                        >
                          <div class="flex items-start gap-3">
                            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#E5D4F0] bg-white text-[#3D1260]">
                              <Bell class="h-4 w-4" aria-hidden="true" />
                            </span>
                            <div>
                              <p class="text-sm font-bold text-[#2E0C49]">
                                Produto indisponível no momento
                              </p>
                              <p class="mt-0.5 text-xs text-zinc-600">
                                Cadastre seu e-mail para ser avisada assim que
                                voltar ao estoque.
                              </p>
                            </div>
                          </div>
                          <div class="grid gap-2.5 sm:grid-cols-2">
                            <input
                              type="text"
                              aria-label="Seu nome"
                              placeholder="Seu nome"
                              value={restockName()}
                              onInput={(e) =>
                                setRestockName(e.currentTarget.value)
                              }
                              class="h-10 rounded-full border border-zinc-200/90 bg-white px-4 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-[#3D1260] focus:outline-none"
                            />
                            <input
                              id="restock-email-input"
                              type="email"
                              required
                              aria-label="Seu e-mail"
                              placeholder="Seu e-mail *"
                              value={restockEmail()}
                              onInput={(e) =>
                                setRestockEmail(e.currentTarget.value)
                              }
                              class="h-10 rounded-full border border-zinc-200/90 bg-white px-4 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-[#3D1260] focus:outline-none"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={restockBusy()}
                            class="group/notify inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-[#3D1260] px-5 text-sm font-semibold text-white transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-[#2E0C49] hover:shadow-[0_8px_20px_rgba(61,18,96,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3D1260]/40 disabled:opacity-60"
                          >
                            <Bell
                              class="h-4 w-4 shrink-0 transition-transform duration-300 group-hover/notify:-rotate-12 group-hover/notify:scale-110"
                              aria-hidden="true"
                            />
                            <span>
                              {restockBusy()
                                ? "Registrando..."
                                : "Avise-me quando voltar"}
                            </span>
                          </button>
                          <Show when={restockMsg()}>
                            <p
                              role="status"
                              class="text-xs font-medium text-[#2E0C49]"
                            >
                              {restockMsg()}
                            </p>
                          </Show>
                        </form>
                      }
                    >
                      <div class="space-y-2.5 pt-1">
                        <div class="flex items-center gap-3">
                          <div class="inline-flex h-11 w-28 shrink-0 items-center justify-between rounded-full bg-[#FDF2FA] px-3">
                            <button
                              type="button"
                              aria-label="Diminuir quantidade"
                              onClick={() => setQty((q) => Math.max(1, q - 1))}
                              class="rounded p-1 text-[#C918BF] transition hover:bg-white/70"
                            >
                              <Minus class="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                            <span class="text-xs font-bold text-[#2E0C49]">
                              {qty()}
                            </span>
                            <button
                              type="button"
                              aria-label="Aumentar quantidade"
                              onClick={() =>
                                setQty((q) => Math.min(maxQty(), q + 1))
                              }
                              class="rounded p-1 text-[#C918BF] transition hover:bg-white/70"
                            >
                              <Plus class="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>

                          <button
                            type="button"
                            disabled={adding()}
                            onClick={() => void handleAddToCart()}
                            class="mf-btn-buy flex h-11 flex-1 items-center justify-center rounded-full px-6 text-xs font-bold uppercase tracking-wider disabled:opacity-60"
                          >
                            {adding() ? "ADICIONANDO..." : "COMPRAR"}
                          </button>
                        </div>

                        <Show when={settings().whatsapp_number}>
                          <a
                            href={whatsappUrl(
                              settings().whatsapp_number,
                              `Olá! Tenho interesse no produto ${p().name} (SKU: ${activeVariant()?.sku ?? p().sku}).`,
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="mf-btn-whats flex h-9 w-full items-center justify-center gap-1.5 rounded-full text-xs font-medium"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              class="h-3.5 w-3.5 shrink-0 fill-current"
                              aria-hidden="true"
                            >
                              <path d="M12.03 2a9.94 9.94 0 0 0-8.6 14.95L2 22l5.2-1.36A9.95 9.95 0 1 0 12.03 2Zm0 18.1a8.13 8.13 0 0 1-4.14-1.13l-.3-.18-3.09.81.83-3.01-.2-.31a8.15 8.15 0 1 1 7 3.82Zm4.47-6.1c-.25-.12-1.45-.72-1.67-.8s-.39-.12-.55.12-.63.8-.78.96-.28.19-.53.06a6.68 6.68 0 0 1-1.97-1.22 7.36 7.36 0 0 1-1.36-1.7c-.14-.24-.01-.38.11-.5.11-.11.24-.29.37-.43.12-.14.16-.25.24-.41s.04-.31-.02-.43-.55-1.33-.76-1.82c-.2-.48-.4-.41-.55-.42h-.47a.9.9 0 0 0-.65.31 2.75 2.75 0 0 0-.86 2.05c0 1.21.88 2.38 1 2.54s1.73 2.64 4.19 3.7c.59.25 1.04.41 1.4.52.59.19 1.12.16 1.54.1.47-.07 1.45-.59 1.66-1.17s.21-1.07.14-1.17-.22-.16-.47-.28Z" />
                            </svg>
                            <span>Comprar pelo Whats</span>
                          </a>
                        </Show>
                      </div>
                    </Show>

                    <Show when={feedback()}>
                      {(fb) => (
                        <p
                          role={fb().type === "err" ? "alert" : "status"}
                          class={`rounded-lg px-3 py-2 text-xs font-medium ${
                            fb().type === "ok"
                              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                              : "border border-red-200 bg-red-50 text-red-800"
                          }`}
                        >
                          {fb().text}
                        </p>
                      )}
                    </Show>

                    {/* Inline Shipping Quote */}
                    <div class="border-t border-zinc-200/80 pt-3">
                      <ShippingQuoteWidget
                        mode="product"
                        productSlug={p().slug}
                        quantity={qty()}
                      />
                    </div>

                    {/* Accordions */}
                    <div class="divide-y divide-zinc-200/80 border-y border-zinc-200/80">
                      <div>
                        <button
                          type="button"
                          aria-expanded={openAccordion() === "descricao"}
                          onClick={() => toggleAccordion("descricao")}
                          class="flex w-full items-center justify-between py-3.5 text-left text-xs font-bold text-[#2E0C49]"
                        >
                          <span>Descrição Geral</span>
                          <Show
                            when={openAccordion() === "descricao"}
                            fallback={
                              <ChevronRight
                                class="h-4 w-4 text-[#2E0C49]"
                                aria-hidden="true"
                              />
                            }
                          >
                            <ChevronDown
                              class="h-4 w-4 text-[#2E0C49]"
                              aria-hidden="true"
                            />
                          </Show>
                        </button>
                        <Show when={openAccordion() === "descricao"}>
                          <div class="space-y-3 pb-4 text-xs leading-relaxed text-zinc-700">
                            <p class="whitespace-pre-line">
                              {p().description ||
                                p().short_description ||
                                "Descrição técnica em atualização."}
                            </p>
                            <Show when={p().usage_instructions}>
                              <div>
                                <p class="font-bold text-[#2E0C49]">
                                  Modo de Uso
                                </p>
                                <p class="mt-1 whitespace-pre-line">
                                  {p().usage_instructions}
                                </p>
                              </div>
                            </Show>
                            <Show when={p().ingredients}>
                              <div>
                                <p class="font-bold text-[#2E0C49]">
                                  Composição / Ingredientes
                                </p>
                                <p class="mt-1 whitespace-pre-line">
                                  {p().ingredients}
                                </p>
                              </div>
                            </Show>
                          </div>
                        </Show>
                      </div>

                      <div>
                        <button
                          type="button"
                          aria-expanded={openAccordion() === "pagamento"}
                          onClick={() => toggleAccordion("pagamento")}
                          class="flex w-full items-center justify-between py-3.5 text-left text-xs font-bold text-[#2E0C49]"
                        >
                          <span>Formas de Pagamento</span>
                          <ChevronDown
                            class={`h-4 w-4 text-[#2E0C49] transition-transform ${
                              openAccordion() === "pagamento"
                                ? "rotate-180"
                                : ""
                            }`}
                            aria-hidden="true"
                          />
                        </button>
                        <Show when={openAccordion() === "pagamento"}>
                          <div class="space-y-2 pb-4 text-xs text-zinc-700">
                            <p>
                              Parcele em até{" "}
                              <strong class="font-bold text-[#2E0C49]">
                                {installments()}x de{" "}
                                {formatCents(installmentValue())} sem juros
                              </strong>{" "}
                              nos cartões Visa, Mastercard, Elo, Amex e
                              Hipercard.
                            </p>
                            <p>Pagamento instantâneo à vista via Pix.</p>
                          </div>
                        </Show>
                      </div>

                      <div id="avaliacoes">
                        <button
                          type="button"
                          aria-expanded={openAccordion() === "avaliacoes"}
                          onClick={() => toggleAccordion("avaliacoes")}
                          class="flex w-full items-center justify-between py-3.5 text-left text-xs font-bold text-[#2E0C49]"
                        >
                          <span>Avaliações</span>
                          <ChevronDown
                            class={`h-4 w-4 text-[#2E0C49] transition-transform ${
                              openAccordion() === "avaliacoes"
                                ? "rotate-180"
                                : ""
                            }`}
                            aria-hidden="true"
                          />
                        </button>
                        <Show when={openAccordion() === "avaliacoes"}>
                          <div class="space-y-4 pb-4">
                            <Show
                              when={p().reviews.length > 0}
                              fallback={
                                <p class="text-xs text-zinc-600">
                                  Ainda não há avaliações aprovadas para este
                                  item. Seja a primeira a opinar!
                                </p>
                              }
                            >
                              <ul class="space-y-2.5">
                                <For each={p().reviews}>
                                  {(rev) => (
                                    <li class="rounded-lg border border-zinc-200 bg-[#FAF7FB] p-3 text-xs">
                                      <div class="flex items-center justify-between">
                                        <span class="font-bold text-[#2E0C49]">
                                          {rev.author_name}
                                        </span>
                                        <span class="inline-flex items-center gap-1 font-semibold text-amber-600">
                                          {rev.rating}/5{" "}
                                          <Star
                                            class="size-3 fill-current"
                                            aria-hidden="true"
                                          />
                                        </span>
                                      </div>
                                      <Show when={rev.title}>
                                        <p class="mt-1 font-semibold text-[#2E0C49]">
                                          {rev.title}
                                        </p>
                                      </Show>
                                      <p class="mt-1 text-zinc-700">
                                        {rev.body}
                                      </p>
                                    </li>
                                  )}
                                </For>
                              </ul>
                            </Show>

                            <form
                              onSubmit={submitReview}
                              class="space-y-2.5 rounded-lg border border-zinc-200 bg-white p-3"
                            >
                              <p class="text-xs font-bold text-[#2E0C49]">
                                Enviar avaliação
                              </p>
                              <div class="grid gap-2 sm:grid-cols-2">
                                <input
                                  type="text"
                                  required
                                  placeholder="Seu nome *"
                                  value={revName()}
                                  onInput={(e) =>
                                    setRevName(e.currentTarget.value)
                                  }
                                  class="h-9 rounded-md border border-zinc-300 px-3 text-xs"
                                />
                                <input
                                  type="email"
                                  placeholder="Seu e-mail (opcional)"
                                  value={revEmail()}
                                  onInput={(e) =>
                                    setRevEmail(e.currentTarget.value)
                                  }
                                  class="h-9 rounded-md border border-zinc-300 px-3 text-xs"
                                />
                              </div>
                              <div class="flex items-center gap-2 text-xs">
                                <label
                                  for="rev-rating"
                                  class="font-semibold text-[#2E0C49]"
                                >
                                  Nota:
                                </label>
                                <select
                                  id="rev-rating"
                                  value={revRating()}
                                  onChange={(e) =>
                                    setRevRating(Number(e.currentTarget.value))
                                  }
                                  class="h-9 rounded-md border border-zinc-300 bg-white px-2 text-xs"
                                >
                                  <option value={5}>
                                    5 estrelas — Excelente
                                  </option>
                                  <option value={4}>
                                    4 estrelas — Muito bom
                                  </option>
                                  <option value={3}>3 estrelas — Bom</option>
                                  <option value={2}>
                                    2 estrelas — Regular
                                  </option>
                                  <option value={1}>1 estrela — Ruim</option>
                                </select>
                              </div>
                              <input
                                type="text"
                                placeholder="Título curto (opcional)"
                                value={revTitle()}
                                onInput={(e) =>
                                  setRevTitle(e.currentTarget.value)
                                }
                                class="h-9 w-full rounded-md border border-zinc-300 px-3 text-xs"
                              />
                              <textarea
                                rows={3}
                                required
                                placeholder="Conte sua experiência com o produto *"
                                value={revBody()}
                                onInput={(e) =>
                                  setRevBody(e.currentTarget.value)
                                }
                                class="w-full rounded-md border border-zinc-300 p-2.5 text-xs"
                              />
                              <button
                                type="submit"
                                disabled={revBusy()}
                                class="h-9 rounded-full bg-[#3D1260] px-5 text-xs font-semibold text-white hover:bg-[#2E0C49] disabled:opacity-60"
                              >
                                {revBusy()
                                  ? "Enviando..."
                                  : "Publicar avaliação"}
                              </button>
                              <Show when={revMsg()}>
                                <p
                                  role="status"
                                  class="text-xs font-medium text-emerald-700"
                                >
                                  {revMsg()}
                                </p>
                              </Show>
                            </form>
                          </div>
                        </Show>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Produtos relacionados */}
                <Show
                  when={p().related_products && p().related_products.length > 0}
                >
                  <section class="mt-14 pt-6">
                    <SectionHeading title="Produtos relacionados" />
                    <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                      <For each={p().related_products}>
                        {(rel) => <ProductCard product={rel} />}
                      </For>
                    </div>
                  </section>
                </Show>

                {/* Produtos visualizados */}
                <Show when={viewedProducts().length > 0}>
                  <section class="mt-14 pt-4">
                    <SectionHeading title="Produtos visualizados" />

                    <div class="flex flex-wrap items-center justify-center gap-4">
                      <For each={viewedProducts()}>
                        {(item) => (
                          <Link
                            to="/produto/$slug"
                            params={{ slug: item.slug }}
                            class="flex w-full max-w-[340px] items-center gap-4 rounded-xl border border-zinc-100 bg-white p-3.5 shadow-2xs transition hover:border-zinc-200"
                          >
                            <img
                              src={assetUrl(item.primary_image)}
                              alt=""
                              class="h-20 w-20 shrink-0 object-contain"
                            />
                            <span class="text-xs font-bold text-[#2E0C49]">
                              {item.name}
                            </span>
                          </Link>
                        )}
                      </For>
                    </div>

                    <div class="mt-6 flex items-center justify-center gap-2 text-xs text-[#2E0C49]">
                      <span>Páginas:</span>
                      <span class="inline-flex size-6 items-center justify-center rounded-full bg-[#2E0C49] text-[11px] font-bold text-white">
                        1
                      </span>
                    </div>
                  </section>
                </Show>
              </div>

              <NewsletterSection />

              {/* Sticky bottom buy bar */}
              <div class="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200/80 bg-white/95 py-2.5 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur-xs">
                <div class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 pr-16 xl:pr-4">
                  <div class="flex min-w-0 items-center gap-3">
                    <img
                      src={assetUrl(activeImage() || p().primary_image)}
                      alt={p().name}
                      class="h-12 w-12 shrink-0 object-contain"
                    />
                    <span class="truncate text-xs font-extrabold text-[#2E0C49] sm:text-sm">
                      {p().name}
                    </span>
                  </div>

                  <div class="flex shrink-0 items-center gap-4">
                    <div class="hidden text-right sm:block">
                      <div class="text-base font-extrabold text-[#C918BF] sm:text-lg">
                        {formatCents(currentPriceCents())}
                      </div>
                      <p class="flex items-center justify-end gap-1 text-[11px] text-[#2E0C49]">
                        <CreditCard class="h-3.5 w-3.5" aria-hidden="true" />
                        <span>
                          ou{" "}
                          <strong class="font-bold text-[#C918BF]">
                            {installments()}x
                          </strong>{" "}
                          de{" "}
                          <strong class="font-bold text-[#C918BF]">
                            {formatCents(installmentValue())}
                          </strong>{" "}
                          Sem juros
                        </span>
                      </p>
                    </div>

                    <Show
                      when={inStock()}
                      fallback={
                        <button
                          type="button"
                          onClick={() => {
                            const el = document.getElementById(
                              "restock-email-input",
                            );
                            el?.scrollIntoView({
                              behavior: "smooth",
                              block: "center",
                            });
                            el?.focus();
                          }}
                          class="group/notify inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-[#E5D4F0] bg-[#FAF6FC] px-6 text-xs font-semibold text-[#3D1260] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-[#3D1260] hover:bg-[#3D1260] hover:text-white hover:shadow-[0_6px_16px_rgba(61,18,96,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3D1260]/30"
                        >
                          <Bell
                            class="h-3.5 w-3.5 shrink-0 transition-transform duration-300 group-hover/notify:-rotate-12 group-hover/notify:scale-110"
                            aria-hidden="true"
                          />
                          <span>Avise-me quando voltar</span>
                        </button>
                      }
                    >
                      <button
                        type="button"
                        disabled={adding()}
                        onClick={() => void handleAddToCart()}
                        class="mf-btn-buy h-10 rounded-full px-8 text-xs font-bold uppercase tracking-wider disabled:opacity-60"
                      >
                        {adding() ? "ADICIONANDO..." : "COMPRAR"}
                      </button>
                    </Show>
                  </div>
                </div>
              </div>
            </>
          );
        }}
      </Show>
    </StoreShell>
  );
}
