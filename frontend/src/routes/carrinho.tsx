import { ProductImage } from "../features/storefront/components/ProductImage";
import { createFileRoute, Link } from "@tanstack/solid-router";
import ArrowRight from "lucide-solid/icons/arrow-right";
import Minus from "lucide-solid/icons/minus";
import Plus from "lucide-solid/icons/plus";
import ShoppingBag from "lucide-solid/icons/shopping-bag";
import Tag from "lucide-solid/icons/tag";
import Trash2 from "lucide-solid/icons/trash";
import { For, Show, createSignal, onMount } from "solid-js";
import { ShippingQuoteWidget } from "../features/storefront/components/ShippingQuoteWidget";
import { CartShareWidget } from "../features/storefront/components/CartShareWidget";
import { StoreShell } from "../features/storefront/components/StoreShell";
import {
  applyCartCoupon,
  refreshCart,
  removeCartCoupon,
  removeCartItem,
  selectCartShipping,
  storefrontStore,
  updateCartItemQty,
} from "../features/storefront/store";
import { ApiError } from "../lib/api";
import { formatCents } from "../lib/format";
import { seoHead } from "../lib/seo";
import {
  mapCartItemsToGa4,
  trackAddShippingInfo,
  trackBeginCheckout,
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
            <div class="mt-8 flex flex-col items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-16 text-center">
              <ShoppingBag class="h-12 w-12 text-zinc-400" />
              <h2 class="mt-4 text-lg font-bold text-zinc-900">
                Seu carrinho está vazio
              </h2>
              <p class="mt-1 max-w-sm text-sm text-zinc-600">
                Adicione cosméticos, esmaltes, cuidados faciais ou acessórios
                para continuar.
              </p>
              <Link
                to="/promocoes"
                class="mt-6 rounded-lg bg-[var(--mf-primary)] px-6 py-3 text-sm font-semibold text-white hover:bg-[var(--mf-primary-hover)]"
              >
                Ver promoções da loja
              </Link>
            </div>
          }
        >
          {(c) => (
            <div class="mt-6 grid gap-8 lg:grid-cols-12">
              {/* Items column */}
              <div class="space-y-4 lg:col-span-8">
                <Show when={c().free_shipping_threshold_cents > 0}>
                  <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
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
                            <span class="mt-1 inline-flex items-center gap-1 rounded bg-[#F8EFFC] px-2 py-0.5 text-[11px] font-bold text-[#7C2784]">
                              Preço de Atacado ({item.wholesale_tier_min_qty}+
                              un.)
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
                    onClick={() =>
                      trackBeginCheckout({
                        currency: "BRL",
                        value: c().total_cents / 100,
                        items: mapCartItemsToGa4(c().items),
                      })
                    }
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
