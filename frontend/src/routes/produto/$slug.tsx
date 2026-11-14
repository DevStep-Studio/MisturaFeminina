import { createFileRoute, Link } from "@tanstack/solid-router";
import Bell from "lucide-solid/icons/bell";
import ChevronRight from "lucide-solid/icons/chevron-right";
import Heart from "lucide-solid/icons/heart";
import MessageCircle from "lucide-solid/icons/message-circle";
import Minus from "lucide-solid/icons/minus";
import Package from "lucide-solid/icons/package";
import Plus from "lucide-solid/icons/plus";
import ShoppingBag from "lucide-solid/icons/shopping-bag";
import Star from "lucide-solid/icons/star";
import {
  For,
  Show,
  createEffect,
  createMemo,
  createResource,
  createSignal,
} from "solid-js";
import { ProductCard } from "../../features/storefront/components/ProductCard";
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
import { session } from "../../security/session";

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
  const [wishlisted, setWishlisted] = createSignal(false);

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

  async function toggleWishlist() {
    const p = product();
    if (!p) return;
    if (session.status() !== "authenticated") {
      setFeedback({
        type: "err",
        text: "Entre na sua conta para salvar favoritos.",
      });
      return;
    }
    try {
      const res = await api<{ data: { saved: boolean } }>(
        "/account/wishlist/toggle",
        {
          method: "POST",
          body: { product_id: p.id },
        },
      );
      setWishlisted(res.data.saved);
    } catch {
      setFeedback({
        type: "err",
        text: "Não foi possível atualizar favoritos.",
      });
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
      <div class="mx-auto max-w-7xl px-4 py-6 sm:py-8">
        <Show when={product.loading}>
          <div class="grid gap-8 lg:grid-cols-2">
            <div class="aspect-square animate-pulse rounded-2xl bg-zinc-100" />
            <div class="space-y-4">
              <div class="h-8 w-2/3 animate-pulse rounded bg-zinc-100" />
              <div class="h-24 animate-pulse rounded bg-zinc-100" />
              <div class="h-12 animate-pulse rounded bg-zinc-100" />
            </div>
          </div>
        </Show>

        <Show when={product.error}>
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
        </Show>

        <Show when={product()}>
          {(p) => {
            const installments = () =>
              Math.max(1, settings().max_installments || 6);
            const installmentValue = () =>
              Math.ceil(currentPriceCents() / installments());
            const productJsonLd = () =>
              JSON.stringify({
                "@context": "https://schema.org",
                "@type": "Product",
                name: p().name,
                sku: activeVariant()?.sku ?? p().sku,
                description:
                  p().short_description || p().description || p().name,
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

            return (
              <>
                <script type="application/ld+json">{productJsonLd()}</script>

                <nav
                  aria-label="Navegação estrutural"
                  class="mb-5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500"
                >
                  <Link to="/" class="hover:text-zinc-900">
                    Início
                  </Link>
                  <Show when={p().categories[0]}>
                    {(cat) => (
                      <>
                        <ChevronRight class="h-3.5 w-3.5" aria-hidden="true" />
                        <Link
                          to="/categoria/$slug"
                          params={{ slug: cat().slug }}
                          class="hover:text-zinc-900"
                        >
                          {cat().name}
                        </Link>
                      </>
                    )}
                  </Show>
                  <ChevronRight class="h-3.5 w-3.5" aria-hidden="true" />
                  <span class="font-medium text-zinc-900">{p().name}</span>
                </nav>

                <div class="grid gap-8 lg:grid-cols-12">
                  {/* Gallery */}
                  <div class="space-y-3 lg:col-span-6">
                    <div class="relative aspect-square overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50">
                      <img
                        src={assetUrl(activeImage() || p().primary_image)}
                        alt={p().primary_image_alt || p().name}
                        class="h-full w-full object-contain p-4"
                      />
                      <Show when={discountPct() > 0}>
                        <span class="absolute left-3 top-3 rounded-md bg-[var(--mf-primary)] px-2.5 py-1 text-xs font-bold text-white">
                          -{discountPct()}%
                        </span>
                      </Show>
                    </div>

                    <Show when={p().images.length > 1}>
                      <div class="flex gap-2 overflow-x-auto pb-1">
                        <For each={p().images}>
                          {(img) => (
                            <button
                              type="button"
                              onClick={() => setActiveImage(img.path)}
                              aria-label={img.alt_text || "Ver imagem"}
                              class={`h-20 w-20 shrink-0 overflow-hidden rounded-lg border bg-zinc-50 p-1 ${
                                activeImage() === img.path
                                  ? "border-[var(--mf-primary)] ring-2 ring-[var(--mf-primary)]"
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
                    </Show>
                  </div>

                  {/* Buy Box */}
                  <div class="space-y-5 lg:col-span-6">
                    <div class="flex items-start justify-between gap-3">
                      <div>
                        <Show when={p().brand}>
                          {(brand) => (
                            <Link
                              to="/marca/$slug"
                              params={{ slug: brand().slug }}
                              class="text-xs font-bold uppercase tracking-wider text-[var(--mf-primary)] hover:underline"
                            >
                              {brand().name}
                            </Link>
                          )}
                        </Show>
                        <h1 class="mt-1 text-2xl font-bold text-zinc-900 sm:text-3xl">
                          {p().name}
                        </h1>
                        <p class="mt-1 text-xs text-zinc-500">
                          SKU: {activeVariant()?.sku ?? p().sku}
                          <Show when={activeVariant()?.gtin || p().gtin}>
                            {" "}
                            · EAN: {activeVariant()?.gtin || p().gtin}
                          </Show>
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => void toggleWishlist()}
                        aria-label="Salvar nos favoritos"
                        class={`rounded-full border p-2.5 transition ${
                          wishlisted()
                            ? "border-[var(--mf-primary)] bg-zinc-100 text-[var(--mf-primary)]"
                            : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400"
                        }`}
                      >
                        <Heart
                          class={`h-5 w-5 ${wishlisted() ? "fill-current" : ""}`}
                        />
                      </button>
                    </div>

                    <Show when={p().rating_count > 0}>
                      <div class="flex items-center gap-2 text-sm">
                        <div class="flex items-center text-amber-500">
                          <For each={[1, 2, 3, 4, 5]}>
                            {(n) => (
                              <Star
                                class={`h-4 w-4 ${n <= Math.round(p().rating_avg) ? "fill-current" : "text-zinc-300"}`}
                              />
                            )}
                          </For>
                        </div>
                        <span class="font-semibold text-zinc-800">
                          {p().rating_avg.toFixed(1)}
                        </span>
                        <span class="text-xs text-zinc-500">
                          ({p().rating_count} avaliações)
                        </span>
                      </div>
                    </Show>

                    <Show when={p().short_description}>
                      <p class="text-sm leading-relaxed text-zinc-700">
                        {p().short_description}
                      </p>
                    </Show>

                    {/* Price block */}
                    <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                      <Show
                        when={
                          discountPct() > 0 &&
                          originalPriceCents() > currentPriceCents()
                        }
                      >
                        <p class="text-sm text-zinc-500 line-through">
                          {formatCents(originalPriceCents())}
                        </p>
                      </Show>
                      <div class="flex flex-wrap items-baseline gap-2">
                        <span class="text-3xl font-extrabold text-zinc-900">
                          {formatCents(currentPriceCents())}
                        </span>
                        <Show
                          when={inStock()}
                          fallback={
                            <span class="rounded bg-zinc-800 px-2 py-0.5 text-xs font-bold text-white">
                              Esgotado
                            </span>
                          }
                        >
                          <span class="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                            {activeVariant()?.available_stock ??
                              p().available_stock}{" "}
                            em estoque
                          </span>
                        </Show>
                      </div>
                      <p class="mt-1 text-sm text-zinc-700">
                        ou em até <strong>{installments()}x</strong> de{" "}
                        <strong>{formatCents(installmentValue())}</strong> sem
                        juros
                      </p>
                    </div>

                    {/* Variant selection */}
                    <Show when={p().variants.length > 1}>
                      <div class="space-y-2">
                        <p class="text-xs font-bold uppercase tracking-wide text-zinc-700">
                          Escolha a opção:{" "}
                          <span class="font-normal text-zinc-900">
                            {activeVariant()?.name}
                          </span>
                        </p>
                        <div class="flex flex-wrap gap-2">
                          <For each={p().variants}>
                            {(variant) => {
                              const isSelected = () =>
                                activeVariant()?.id === variant.id;
                              const colorAttr = variant.attributes.find(
                                (a) => a.color_hex,
                              );

                              return (
                                <button
                                  type="button"
                                  onClick={() => chooseVariant(variant)}
                                  class={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                                    isSelected()
                                      ? "border-[var(--mf-primary)] bg-zinc-900 text-white"
                                      : "border-zinc-300 bg-white text-zinc-800 hover:border-zinc-500"
                                  } ${!variant.in_stock ? "opacity-55" : ""}`}
                                >
                                  <Show when={colorAttr?.color_hex}>
                                    <span
                                      class="h-4 w-4 rounded-full border border-zinc-300"
                                      style={{
                                        "background-color":
                                          colorAttr!.color_hex!,
                                      }}
                                    />
                                  </Show>
                                  <span>{variant.name}</span>
                                </button>
                              );
                            }}
                          </For>
                        </div>
                      </div>
                    </Show>

                    {/* Kit items */}
                    <Show when={p().kit_items && p().kit_items.length > 0}>
                      <div class="rounded-xl border border-zinc-200 bg-white p-4">
                        <div class="mb-2 flex items-center gap-2 text-sm font-bold text-zinc-900">
                          <Package class="h-4 w-4 text-[var(--mf-primary)]" />
                          <span>Este kit inclui:</span>
                        </div>
                        <ul class="space-y-1.5 text-sm text-zinc-700">
                          <For each={p().kit_items}>
                            {(kit) => (
                              <li class="flex items-center justify-between border-b border-zinc-100 pb-1 last:border-0 last:pb-0">
                                <span>
                                  {kit.quantity}x{" "}
                                  {kit.component_product?.name ||
                                    kit.component_variant?.name}
                                </span>
                                <span class="text-xs text-zinc-500">
                                  SKU {kit.component_variant?.sku}
                                </span>
                              </li>
                            )}
                          </For>
                        </ul>
                      </div>
                    </Show>

                    {/* Wholesale tiers */}
                    <Show
                      when={
                        p().wholesale_enabled && p().wholesale_tiers.length > 0
                      }
                    >
                      <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 text-xs">
                        <p class="font-bold text-zinc-900">
                          Desconto progressivo no atacado
                        </p>
                        <div class="mt-2 flex flex-wrap gap-2">
                          <For each={p().wholesale_tiers}>
                            {(tier) => (
                              <span class="rounded border border-zinc-300 bg-white px-2.5 py-1 font-medium text-zinc-800">
                                A partir de {tier.min_qty} un.:{" "}
                                <strong>-{tier.discount_percent}%</strong>
                              </span>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>

                    {/* Purchase CTAs or Restock Alert */}
                    <Show
                      when={inStock()}
                      fallback={
                        <form
                          onSubmit={submitRestock}
                          class="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4"
                        >
                          <div class="flex items-center gap-2 text-sm font-bold text-amber-900">
                            <Bell class="h-4 w-4" />
                            <span>
                              Produto esgotado — Avise-me quando chegar
                            </span>
                          </div>
                          <div class="grid gap-2 sm:grid-cols-2">
                            <input
                              type="text"
                              placeholder="Seu nome"
                              value={restockName()}
                              onInput={(e) =>
                                setRestockName(e.currentTarget.value)
                              }
                              class="h-10 rounded-md border border-amber-300 bg-white px-3 text-sm"
                            />
                            <input
                              type="email"
                              required
                              placeholder="Seu e-mail *"
                              value={restockEmail()}
                              onInput={(e) =>
                                setRestockEmail(e.currentTarget.value)
                              }
                              class="h-10 rounded-md border border-amber-300 bg-white px-3 text-sm"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={restockBusy()}
                            class="h-10 w-full rounded-lg bg-zinc-900 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
                          >
                            {restockBusy()
                              ? "Registrando..."
                              : "Avise-me quando voltar"}
                          </button>
                          <Show when={restockMsg()}>
                            <p
                              role="status"
                              class="text-xs font-medium text-amber-900"
                            >
                              {restockMsg()}
                            </p>
                          </Show>
                        </form>
                      }
                    >
                      <div class="space-y-2.5">
                        <div class="flex flex-col gap-2.5 sm:flex-row">
                          <div class="inline-flex h-12 items-center justify-between rounded-lg border border-zinc-300 bg-white px-2 sm:w-32">
                            <button
                              type="button"
                              aria-label="Diminuir quantidade"
                              onClick={() => setQty((q) => Math.max(1, q - 1))}
                              class="rounded p-1.5 text-zinc-700 hover:bg-zinc-100"
                            >
                              <Minus class="h-4 w-4" />
                            </button>
                            <span class="text-sm font-bold text-zinc-900">
                              {qty()}
                            </span>
                            <button
                              type="button"
                              aria-label="Aumentar quantidade"
                              onClick={() =>
                                setQty((q) => Math.min(maxQty(), q + 1))
                              }
                              class="rounded p-1.5 text-zinc-700 hover:bg-zinc-100"
                            >
                              <Plus class="h-4 w-4" />
                            </button>
                          </div>

                          <button
                            type="button"
                            disabled={adding()}
                            onClick={() => void handleAddToCart()}
                            class="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--mf-primary)] px-6 text-sm font-bold text-white transition hover:bg-[var(--mf-primary-hover)] disabled:opacity-60"
                          >
                            <ShoppingBag class="h-5 w-5" />
                            <span>
                              {adding()
                                ? "Adicionando..."
                                : "Adicionar ao carrinho"}
                            </span>
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
                            class="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-emerald-600 bg-white text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                          >
                            <MessageCircle class="h-4 w-4" />
                            <span>Tirar dúvidas / Comprar pelo WhatsApp</span>
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

                    <ShippingQuoteWidget
                      mode="product"
                      productSlug={p().slug}
                      quantity={qty()}
                    />
                  </div>
                </div>

                {/* Details + Reviews */}
                <div class="mt-12 grid gap-8 border-t border-zinc-200 pt-10 lg:grid-cols-12">
                  <div class="space-y-6 lg:col-span-7">
                    <section>
                      <h2 class="text-lg font-bold text-zinc-900">
                        Descrição do Produto
                      </h2>
                      <div class="mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-700">
                        {p().description ||
                          p().short_description ||
                          "Descrição técnica em atualização."}
                      </div>
                    </section>

                    <Show when={p().usage_instructions}>
                      <section class="border-t border-zinc-200 pt-5">
                        <h3 class="text-base font-bold text-zinc-900">
                          Modo de Uso
                        </h3>
                        <p class="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-zinc-700">
                          {p().usage_instructions}
                        </p>
                      </section>
                    </Show>

                    <Show when={p().ingredients}>
                      <section class="border-t border-zinc-200 pt-5">
                        <h3 class="text-base font-bold text-zinc-900">
                          Composição / Ingredientes
                        </h3>
                        <p class="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-zinc-600">
                          {p().ingredients}
                        </p>
                      </section>
                    </Show>
                  </div>

                  {/* Reviews column */}
                  <section class="space-y-4 lg:col-span-5">
                    <h2 class="text-lg font-bold text-zinc-900">
                      Avaliações de Clientes
                    </h2>

                    <Show
                      when={p().reviews.length > 0}
                      fallback={
                        <p class="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                          Ainda não há avaliações aprovadas para este item. Seja
                          a primeira a avaliar!
                        </p>
                      }
                    >
                      <ul class="space-y-3">
                        <For each={p().reviews}>
                          {(rev) => (
                            <li class="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                              <div class="flex items-center justify-between">
                                <span class="text-sm font-bold text-zinc-900">
                                  {rev.author_name}
                                </span>
                                <span class="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
                                  {rev.rating}/5{" "}
                                  <Star
                                    class="size-3.5 fill-current"
                                    aria-hidden="true"
                                  />
                                </span>
                              </div>
                              <Show when={rev.is_verified_purchase}>
                                <span class="mt-0.5 inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                                  Compra verificada
                                </span>
                              </Show>
                              <Show when={rev.title}>
                                <p class="mt-2 text-sm font-semibold text-zinc-900">
                                  {rev.title}
                                </p>
                              </Show>
                              <p class="mt-1 text-sm text-zinc-700">
                                {rev.body}
                              </p>
                            </li>
                          )}
                        </For>
                      </ul>
                    </Show>

                    <form
                      onSubmit={submitReview}
                      class="space-y-3 rounded-xl border border-zinc-200 bg-white p-4"
                    >
                      <h3 class="text-sm font-bold text-zinc-900">
                        Enviar avaliação
                      </h3>
                      <div class="grid gap-2 sm:grid-cols-2">
                        <input
                          type="text"
                          required
                          placeholder="Seu nome *"
                          value={revName()}
                          onInput={(e) => setRevName(e.currentTarget.value)}
                          class="h-9 rounded-md border border-zinc-300 px-3 text-sm"
                        />
                        <input
                          type="email"
                          placeholder="Seu e-mail (opcional)"
                          value={revEmail()}
                          onInput={(e) => setRevEmail(e.currentTarget.value)}
                          class="h-9 rounded-md border border-zinc-300 px-3 text-sm"
                        />
                      </div>
                      <div class="flex items-center gap-2 text-xs">
                        <label
                          for="rev-rating"
                          class="font-semibold text-zinc-700"
                        >
                          Nota:
                        </label>
                        <select
                          id="rev-rating"
                          value={revRating()}
                          onChange={(e) =>
                            setRevRating(Number(e.currentTarget.value))
                          }
                          class="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm"
                        >
                          <option value={5}>5 estrelas — Excelente</option>
                          <option value={4}>4 estrelas — Muito bom</option>
                          <option value={3}>3 estrelas — Bom</option>
                          <option value={2}>2 estrelas — Regular</option>
                          <option value={1}>1 estrela — Ruim</option>
                        </select>
                      </div>
                      <input
                        type="text"
                        placeholder="Título curto (opcional)"
                        value={revTitle()}
                        onInput={(e) => setRevTitle(e.currentTarget.value)}
                        class="h-9 w-full rounded-md border border-zinc-300 px-3 text-sm"
                      />
                      <textarea
                        rows={3}
                        required
                        placeholder="Conte sua experiência com o produto *"
                        value={revBody()}
                        onInput={(e) => setRevBody(e.currentTarget.value)}
                        class="w-full rounded-md border border-zinc-300 p-2.5 text-sm"
                      />
                      <button
                        type="submit"
                        disabled={revBusy()}
                        class="h-9 rounded-md bg-zinc-900 px-4 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
                      >
                        {revBusy() ? "Enviando..." : "Publicar avaliação"}
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
                  </section>
                </div>

                {/* Related products */}
                <Show
                  when={p().related_products && p().related_products.length > 0}
                >
                  <section class="mt-12 border-t border-zinc-200 pt-10">
                    <h2 class="mb-5 text-xl font-bold text-zinc-900">
                      Produtos Relacionados
                    </h2>
                    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      <For each={p().related_products}>
                        {(rel) => <ProductCard product={rel} />}
                      </For>
                    </div>
                  </section>
                </Show>
              </>
            );
          }}
        </Show>
      </div>
    </StoreShell>
  );
}
