import { ProductImage } from "../features/storefront/components/ProductImage";
import { createFileRoute, Link } from "@tanstack/solid-router";
import ArrowRight from "lucide-solid/icons/arrow-right";
import Minus from "lucide-solid/icons/minus";
import Plus from "lucide-solid/icons/plus";
import ShoppingBag from "lucide-solid/icons/shopping-bag";
import Sparkles from "lucide-solid/icons/sparkles";
import Tag from "lucide-solid/icons/tag";
import Trash2 from "lucide-solid/icons/trash";
import { For, Show, createResource, createSignal, onMount } from "solid-js";
import { ShippingQuoteWidget } from "../features/storefront/components/ShippingQuoteWidget";
import { CartShareWidget } from "../features/storefront/components/CartShareWidget";
import { StoreShell } from "../features/storefront/components/StoreShell";
import {
  addCartItem,
  applyCartCoupon,
  refreshCart,
  removeCartCoupon,
  removeCartItem,
  selectCartShipping,
  storefrontStore,
  updateCartItemQty,
} from "../features/storefront/store";
import type { ProductCardData } from "../features/storefront/types";
import { ApiError, api } from "../lib/api";
import { formatCents } from "../lib/format";
import { seoHead } from "../lib/seo";
import {
  mapCartItemsToGa4,
  trackAddShippingInfo,
  trackAddToCart,
  trackRemoveFromCart,
  trackViewCart,
} from "../monitoring/analytics";

export const Route = createFileRoute("/carrinho")({
  head: () =>
    seoHead({
      title: "Meu Carrinho — Mistura Feminina Cosméticos",
      description:
        "Revise os produtos do carrinho, aplique cupons e calcule o frete.",
      path: "/carrinho",
      noindex: true,
    }),
  component: CartPage,
});

function CartQuickAddEssentials() {
  const [addingId, setAddingId] = createSignal<number | null>(null);
  const [addedIds, setAddedIds] = createSignal<number[]>([]);

  const [essentials] = createResource(async () => {
    try {
      const res = await api<{ data: { products: ProductCardData[] } }>(
        "/catalog/products?per_page=12",
        { authenticated: false },
      );
      const list = res.data?.products ?? [];
      // Produtos de reposição rápida e ticket acessível (até R$ 35) com estoque
      return list
        .filter((p) => p.in_stock && p.effective_price_cents <= 3500)
        .slice(0, 4);
    } catch {
      return [];
    }
  });

  const handleQuickAdd = async (p: ProductCardData) => {
    if (!p.default_variant_id) return;
    setAddingId(p.id);
    try {
      await addCartItem(p.default_variant_id, 1, true);
      setAddedIds((prev) => [...prev, p.id]);
      trackAddToCart({
        currency: "BRL",
        value: p.effective_price_cents / 100,
        items: [
          {
            item_id: p.sku,
            item_name: p.name,
            price: p.effective_price_cents / 100,
            quantity: 1,
          },
        ],
      });
    } finally {
      setAddingId(null);
    }
  };

  return (
    <Show when={essentials() && essentials()!.length > 0}>
      <div class="mt-6 rounded-2xl border border-[#ECD4EF] bg-[#FDF8FD] p-4 sm:p-5">
        <div class="flex items-center gap-2">
          <Sparkles class="size-4 text-[#93509e]" />
          <h3 class="text-sm font-extrabold text-[#2E0C49]">
            Aproveite o mesmo frete: itens essenciais de reposição rápida
          </h3>
        </div>
        <p class="mt-1 text-xs text-zinc-600">
          Lixas, óleos, palitos e preparadores indispensáveis no seu atendimento
        </p>

        <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <For each={essentials()}>
            {(p) => {
              const isAdded = () => addedIds().includes(p.id);
              const isAdding = () => addingId() === p.id;
              return (
                <div class="flex flex-col justify-between rounded-xl border border-zinc-200/80 bg-white p-2.5 shadow-2xs transition hover:border-[#93509e]/40">
                  <div>
                    <div class="aspect-square w-full overflow-hidden bg-white p-1">
                      <ProductImage
                        src={p.primary_image}
                        alt={p.name}
                        class="h-full w-full object-contain"
                      />
                    </div>
                    <p
                      class="mt-1.5 line-clamp-2 text-xs font-semibold text-[#2E0C49]"
                      title={p.name}
                    >
                      {p.name}
                    </p>
                  </div>
                  <div class="mt-2 flex items-center justify-between gap-1 border-t border-zinc-100 pt-2">
                    <span class="text-xs font-extrabold text-[#8E237C]">
                      {formatCents(p.effective_price_cents)}
                    </span>
                    <button
                      type="button"
                      disabled={isAdding() || isAdded() || !p.in_stock}
                      onClick={() => void handleQuickAdd(p)}
                      class={`h-7 rounded-md px-2 text-[11px] font-bold transition ${
                        isAdded()
                          ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "bg-[#93509e] text-white hover:bg-[#7c3f87]"
                      }`}
                    >
                      {isAdded()
                        ? "Adicionado"
                        : isAdding()
                        ? "..."
                        : "+ Adicionar"}
                    </button>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </div>
    </Show>
  );
}

function WholesaleAndReplenishmentBanner() {
  return (
    <div class="mt-6 rounded-2xl border border-[#DFC4E6] bg-[#FAF3FC] p-4 sm:p-5">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span class="inline-flex items-center gap-1 rounded bg-[#93509e] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
            Para Manicures & Atacado
          </span>
          <h4 class="mt-1.5 text-sm font-bold text-[#2E0C49]">
            Economize até 25% no Atacado ou monte sua Lista de Reposição
          </h4>
          <p class="mt-0.5 text-xs text-zinc-600">
            Compre em maior volume com desconto progressivo ou salve sua reposição para pedir em 1 clique.
          </p>
        </div>
        <div class="flex shrink-0 gap-2">
          <Link
            to="/atacado"
            class="inline-flex items-center justify-center rounded-lg border border-[#93509e] bg-white px-3 py-1.5 text-xs font-bold text-[#93509e] transition hover:bg-[#93509e] hover:text-white"
          >
            Ver Atacado
          </Link>
          <Link
            to="/minha-reposicao"
            class="inline-flex items-center justify-center rounded-lg bg-[#93509e] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#7c3f87]"
          >
            Lista de Reposição
          </Link>
        </div>
      </div>
    </div>
  );
}

function CartPage() {
  const [couponInput, setCouponInput] = createSignal("");
  const [couponMsg, setCouponMsg] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  onMount(() => {
    void refreshCart().then((c) => {
      if (c && c.items.length > 0) {
        trackViewCart({
          currency: "BRL",
          value: c.total_cents / 100,
          items: mapCartItemsToGa4(c.items),
        });
      }
    });
  });

  const cart = () => storefrontStore.cart();

  const freeProgress = () => {
    const c = cart();
    if (!c || c.free_shipping_threshold_cents <= 0) return 0;
    return Math.min(
      100,
      Math.round((c.subtotal_cents / c.free_shipping_threshold_cents) * 100),
    );
  };

  async function submitCoupon(e: Event) {
    e.preventDefault();
    setCouponMsg(null);
    setError(null);
    const code = couponInput().trim().toUpperCase();
    if (!code) return;
    try {
      const updated = await applyCartCoupon(code);
      if (updated.coupon_error) {
        setError(updated.coupon_error);
      } else {
        setCouponMsg(`Cupom ${updated.coupon_code} aplicado.`);
        setCouponInput("");
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Cupom inválido ou expirado.",
      );
    }
  }

  return (
    <StoreShell>
      <div class="mx-auto max-w-7xl px-4 py-8">
        <h1 class="text-2xl font-bold text-zinc-900 sm:text-3xl">
          Meu Carrinho
        </h1>

        <Show
          when={cart() && cart()!.items.length > 0 ? cart() : null}
          fallback={
            <div class="mt-8 space-y-6">
              <div class="flex flex-col items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-16 text-center">
                <ShoppingBag class="h-12 w-12 text-zinc-400" />
                <h2 class="mt-4 text-lg font-bold text-zinc-900">
                  Seu carrinho está vazio
                </h2>
                <p class="mt-1 max-w-sm text-sm text-zinc-600">
                  Adicione cosméticos, esmaltes, preparadores ou comece pelas reposições essenciais da sua bancada.
                </p>
                <div class="mt-6 flex flex-wrap justify-center gap-3">
                  <Link
                    to="/promocoes"
                    class="rounded-lg bg-[var(--mf-primary)] px-6 py-3 text-sm font-semibold text-white hover:bg-[var(--mf-primary-hover)]"
                  >
                    Ver promoções da loja
                  </Link>
                  <Link
                    to="/atacado"
                    class="rounded-lg border border-[var(--mf-primary)] bg-white px-6 py-3 text-sm font-semibold text-[var(--mf-primary)] hover:bg-[var(--mf-primary)]/5"
                  >
                    Comprar no Atacado
                  </Link>
                </div>
              </div>

              {/* Itens Essenciais de Reposição Rápida no Carrinho Vazio */}
              <CartQuickAddEssentials />

              {/* Banner de Atacado & Lista de Reposição */}
              <WholesaleAndReplenishmentBanner />
            </div>
          }
        >
          {(c) => (
            <div class="mt-6 grid gap-8 lg:grid-cols-12">
              {/* Items column */}
              <div class="space-y-4 lg:col-span-8">
                <Show when={c().free_shipping_threshold_cents > 0 || c().regional_free_shipping}>
                  <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                    <Show
                      when={c().regional_free_shipping}
                      fallback={
                        <>
                          <div class="flex items-center justify-between text-xs font-semibold text-zinc-800">
                            <Show
                              when={c().free_shipping_remaining_cents > 0}
                              fallback={
                                <span class="text-emerald-700">
                                  Parabéns! Você atingiu o frete grátis pela regra da
                                  loja.
                                </span>
                              }
                            >
                              <span>
                                Faltam{" "}
                                <strong>
                                  {formatCents(c().free_shipping_remaining_cents)}
                                </strong>{" "}
                                para frete grátis*
                              </span>
                            </Show>
                            <span>{freeProgress()}%</span>
                          </div>
                          <div class="mt-2 h-2 w-full overflow-hidden rounded-md bg-zinc-200">
                            <div
                              class="h-full bg-[var(--mf-primary)] transition-all"
                              style={{ width: `${freeProgress()}%` }}
                            />
                          </div>
                        </>
                      }
                    >
                      {(reg) => {
                        const isUnlocked = reg().is_unlocked;
                        const min = reg().min_subtotal_cents ?? 0;
                        const prog =
                          min > 0
                            ? Math.min(
                                100,
                                Math.round((c().subtotal_cents / min) * 100),
                              )
                            : isUnlocked
                            ? 100
                            : 0;
                        return (
                          <div>
                            <div class="flex items-center justify-between text-xs font-semibold">
                              <span
                                class={
                                  isUnlocked
                                    ? "text-emerald-700 font-bold"
                                    : "text-[#561B61]"
                                }
                              >
                                {reg().message}
                              </span>
                              <span class="text-zinc-600 font-mono text-[11px]">
                                {prog}%
                              </span>
                            </div>
                            <div class="mt-2 h-2 w-full overflow-hidden rounded-md bg-zinc-200">
                              <div
                                class={`h-full transition-all ${
                                  isUnlocked
                                    ? "bg-emerald-600"
                                    : "bg-[var(--mf-primary)]"
                                }`}
                                style={{ width: `${prog}%` }}
                              />
                            </div>
                          </div>
                        );
                      }}
                    </Show>
                  </div>
                </Show>

                <Show
                  when={
                    c().wholesale_scope_summaries &&
                    c().wholesale_scope_summaries!.length > 0
                  }
                >
                  <div class="rounded-xl border border-[#E5C2EA] bg-[#FCF8FD] p-4 space-y-2">
                    <For each={c().wholesale_scope_summaries}>
                      {(summary) => (
                        <div class="flex items-center gap-2.5 text-xs font-semibold text-[#66166E]">
                          <span class="size-2 rounded-full bg-[#93509e] shrink-0" />
                          <span>{summary.message}</span>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>

                <ul class="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
                  <For each={c().items}>
                    {(item) => (
                      <li class="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                        <Link
                          to="/produto/$slug"
                          params={{ slug: item.product_slug }}
                          class="h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50"
                        >
                          <ProductImage
                            src={item.image_url}
                            alt={item.product_name}
                            class="h-full w-full object-contain p-1"
                          />
                        </Link>

                        <div class="min-w-0 flex-1">
                          <Link
                            to="/produto/$slug"
                            params={{ slug: item.product_slug }}
                            class="text-sm font-bold text-zinc-900 hover:text-[var(--mf-primary)]"
                          >
                            {item.product_name}
                          </Link>
                          <p class="mt-0.5 text-xs text-zinc-500">
                            {item.variant_name} · SKU: {item.sku}
                          </p>
                          <p class="mt-1 text-sm font-semibold text-zinc-900">
                            {formatCents(item.unit_price_cents)} cada
                          </p>
                          <Show when={item.wholesale_applied}>
                            <span class="mt-1 inline-flex items-center gap-1 rounded bg-[#F8EFFC] px-2 py-0.5 text-[11px] font-bold text-[#7C2784] whitespace-nowrap">
                              Preço de Atacado ({item.wholesale_tier_min_qty}+ un.)
                            </span>
                          </Show>
                          <Show when={!item.in_stock}>
                            <p class="mt-1 text-xs font-semibold text-red-700">
                              Quantidade acima do estoque disponível (
                              {item.available_stock}).
                            </p>
                          </Show>
                        </div>

                        <div class="flex items-center justify-between gap-4 sm:justify-end">
                          <div class="inline-flex h-10 items-center rounded-lg border border-zinc-300 bg-white">
                            <button
                              type="button"
                              aria-label="Diminuir quantidade"
                              disabled={storefrontStore.cartBusy()}
                              onClick={() =>
                                void updateCartItemQty(
                                  item.id,
                                  item.quantity - 1,
                                )
                              }
                              class="px-2.5 py-2 text-zinc-700 hover:bg-zinc-100"
                            >
                              <Minus class="h-3.5 w-3.5" />
                            </button>
                            <span class="min-w-[2rem] text-center text-sm font-bold">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              aria-label="Aumentar quantidade"
                              disabled={
                                storefrontStore.cartBusy() ||
                                item.quantity >= item.available_stock
                              }
                              onClick={() =>
                                void updateCartItemQty(
                                  item.id,
                                  item.quantity + 1,
                                )
                              }
                              class="px-2.5 py-2 text-zinc-700 hover:bg-zinc-100 disabled:opacity-40"
                            >
                              <Plus class="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <div class="text-right">
                            <p class="text-sm font-bold text-zinc-900">
                              {formatCents(item.line_total_cents)}
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                trackRemoveFromCart({
                                  currency: "BRL",
                                  value: item.line_total_cents / 100,
                                  items: [
                                    {
                                      item_id: item.sku,
                                      item_name: item.product_name,
                                      price: item.unit_price_cents / 100,
                                      quantity: item.quantity,
                                    },
                                  ],
                                });
                                void removeCartItem(item.id);
                              }}
                              class="mt-1 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-red-700"
                            >
                              <Trash2 class="h-3.5 w-3.5" />
                              Remover
                            </button>
                          </div>
                        </div>
                      </li>
                    )}
                  </For>
                </ul>

                {/* Itens Essenciais de Reposição Rápida */}
                <CartQuickAddEssentials />

                {/* Banner de Atacado & Lista de Reposição */}
                <WholesaleAndReplenishmentBanner />
              </div>

              {/* Summary column */}
              <aside
                aria-label="Resumo do carrinho"
                class="space-y-4 lg:col-span-4"
              >
                <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <div class="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-900">
                    <Tag class="h-4 w-4 text-[var(--mf-primary)]" />
                    <span>Cupom de desconto</span>
                  </div>
                  <Show
                    when={c().coupon_code}
                    fallback={
                      <form onSubmit={submitCoupon} class="flex gap-2">
                        <input
                          type="text"
                          value={couponInput()}
                          onInput={(e) => setCouponInput(e.currentTarget.value)}
                          placeholder="Digite seu cupom"
                          aria-label="Código do cupom"
                          class="h-10 min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 text-sm uppercase"
                        />
                        <button
                          type="submit"
                          disabled={storefrontStore.cartBusy()}
                          class="h-10 rounded-lg bg-[#93509e] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#7c3f87]"
                        >
                          Aplicar
                        </button>
                      </form>
                    }
                  >
                    <div class="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
                      <span class="font-bold text-emerald-900">
                        Cupom: {c().coupon_code}
                      </span>
                      <button
                        type="button"
                        onClick={() => void removeCartCoupon()}
                        class="font-semibold text-red-700 hover:underline"
                      >
                        Remover
                      </button>
                    </div>
                  </Show>
                  <Show when={couponMsg()}>
                    <p class="mt-2 text-xs font-medium text-emerald-700">
                      {couponMsg()}
                    </p>
                  </Show>
                  <Show when={error() || c().coupon_error}>
                    <p
                      role="alert"
                      class="mt-2 text-xs font-medium text-red-700"
                    >
                      {error() || c().coupon_error}
                    </p>
                  </Show>
                </div>

                <CartShareWidget />

                <ShippingQuoteWidget
                  mode="cart"
                  initialCep={c().shipping_cep}
                  selectedQuoteId={c().shipping_quote?.quote_id ?? null}
                  onSelectQuote={(q) => {
                    if (q.quote_id) {
                      void selectCartShipping(q.quote_id);
                      trackAddShippingInfo({
                        currency: "BRL",
                        value: c().total_cents / 100,
                        shipping_tier: q.service_name,
                        items: mapCartItemsToGa4(c().items),
                      });
                    }
                  }}
                />

                <Show
                  when={
                    c().wholesale_discount_cents &&
                    c().wholesale_discount_cents! > 0
                  }
                >
                  <div class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-emerald-800">
                    <span>Economia Atacado aplicada</span>
                    <span>-{formatCents(c().wholesale_discount_cents!)}</span>
                  </div>
                </Show>

                <div class="space-y-3 rounded-xl border border-zinc-200 bg-white p-5">
                  <h2 class="text-base font-bold text-zinc-900">
                    Resumo do pedido
                  </h2>
                  <dl class="space-y-2 text-sm">
                    <div class="flex justify-between text-zinc-700">
                      <dt>Subtotal ({c().items_count} itens)</dt>
                      <dd class="font-medium">
                        {formatCents(c().subtotal_cents)}
                      </dd>
                    </div>
                    <Show when={c().discount_cents > 0}>
                      <div class="flex justify-between text-emerald-700">
                        <dt>Descontos</dt>
                        <dd class="font-semibold">
                          -{formatCents(c().discount_cents)}
                        </dd>
                      </div>
                    </Show>
                    <div class="flex justify-between text-zinc-700">
                      <dt>Frete</dt>
                      <dd class="font-medium">
                        {c().shipping_quote
                          ? c().shipping_cents === 0
                            ? "Grátis"
                            : formatCents(c().shipping_cents)
                          : "A calcular no checkout"}
                      </dd>
                    </div>
                    <div class="flex justify-between border-t border-zinc-200 pt-3 text-base font-extrabold text-zinc-900">
                      <dt>Total</dt>
                      <dd>{formatCents(c().total_cents)}</dd>
                    </div>
                  </dl>

                  <Link
                    to="/checkout"
                    class="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--mf-primary)] px-5 text-sm font-bold text-white transition hover:bg-[var(--mf-primary-hover)]"
                  >
                    <span>Continuar para o Checkout</span>
                    <ArrowRight class="h-4 w-4" />
                  </Link>
                  <Link
                    to="/buscar"
                    class="block text-center text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:underline"
                  >
                    Adicionar mais produtos
                  </Link>
                </div>
              </aside>
            </div>
          )}
        </Show>
      </div>
    </StoreShell>
  );
}
