import { ProductImage } from "./ProductImage";
import { For, Show, createEffect } from "solid-js";
import { Link } from "@tanstack/solid-router";
import ChevronLeft from "lucide-solid/icons/chevron-left";
import Plus from "lucide-solid/icons/plus";
import Minus from "lucide-solid/icons/minus";
import Sparkles from "lucide-solid/icons/sparkles";
import Trash2 from "lucide-solid/icons/trash";
import { formatCents } from "../../../lib/format";
import {
  mapCartItemsToGa4,
  trackAddToCart,
  trackBeginCheckout,
  trackRemoveFromCart,
  trackViewCart,
} from "../../../monitoring/analytics";
import {
  addCartItem,
  removeCartItem,
  storefrontStore,
  updateCartItemQty,
} from "../store";

export function CartDrawer() {
  const cart = () => storefrontStore.cart();
  const isOpen = () => storefrontStore.drawerOpen();
  const busy = () => storefrontStore.cartBusy();
  const settings = () => storefrontStore.settings();
  const recommended = () =>
    storefrontStore.bootstrap().recommended_products ?? [];

  const thresholdCents = () =>
    cart()?.free_shipping_threshold_cents ??
    settings().free_shipping_threshold_cents ??
    0;

  const remainingCents = () => {
    const t = thresholdCents();
    if (t <= 0) return 0;
    return cart()?.free_shipping_remaining_cents ?? t;
  };

  const progressPercent = () => {
    const t = thresholdCents();
    if (t <= 0) return 0;
    const subtotal = cart()?.subtotal_cents ?? 0;
    return Math.min(100, Math.max(0, Math.round((subtotal / t) * 100)));
  };

  const closeDrawer = () => storefrontStore.setDrawerOpen(false);

  createEffect(() => {
    const c = cart();
    if (isOpen() && c && c.items.length > 0) {
      trackViewCart({
        currency: "BRL",
        value: c.total_cents / 100,
        items: mapCartItemsToGa4(c.items),
      });
    }
  });

  return (
    <Show when={isOpen()}>
      <div
        class="fixed inset-0 z-50 flex justify-end bg-black/50"
        role="dialog"
        aria-modal="true"
        aria-label="Carrinho de Compras"
      >
        <button
          type="button"
          class="flex-1"
          aria-label="Fechar carrinho"
          onClick={closeDrawer}
        />
        <aside class="flex h-full w-full max-w-[410px] flex-col bg-white shadow-2xl">
          {/* Top Header: < Fechar (left) | Carrinho de Compras (right) */}
          <div class="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
            <button
              type="button"
              onClick={closeDrawer}
              class="inline-flex items-center gap-1.5 rounded-lg py-1 pr-2 text-sm font-medium text-[#3D1260] hover:text-[#C22583]"
            >
              <ChevronLeft class="size-4" aria-hidden="true" />
              <span>Fechar</span>
            </button>
            <h2 class="text-[15px] font-extrabold text-[#3D1260]">
              Carrinho de Compras
            </h2>
          </div>

          {/* Free Shipping Progress Bar */}
          <Show when={thresholdCents() > 0}>
            <div class="border-b border-zinc-200 px-5 py-3.5">
              <div class="h-3 w-full overflow-hidden rounded-md border border-[#93509e] bg-white">
                <div
                  class="h-full rounded-md bg-[#93509e] transition-all duration-300"
                  style={{ width: `${progressPercent()}%` }}
                />
              </div>
              <div class="mt-2 text-center text-xs text-[#3D1260]">
                <Show
                  when={remainingCents() > 0}
                  fallback={
                    <p class="font-bold text-emerald-700">
                      Você atingiu o valor para obter{" "}
                      <strong>frete grátis</strong>!
                    </p>
                  }
                >
                  <p>
                    Falta apenas{" "}
                    <strong class="font-bold">
                      {formatCents(remainingCents())}
                    </strong>{" "}
                    para obter <strong class="font-bold">frete grátis</strong>
                  </p>
                </Show>
              </div>
            </div>
          </Show>

          {/* Items or Empty Message */}
          <div class="flex-1 overflow-y-auto px-5 py-6">
            <Show
              when={(cart()?.items.length ?? 0) > 0}
              fallback={
                <div class="flex flex-col items-center pt-8 text-center">
                  <p class="text-lg font-medium text-[#3D1260]">
                    Seu carrinho está vazio.
                  </p>
                  <Link
                    to="/categorias"
                    onClick={closeDrawer}
                    class="mt-5 inline-flex min-h-10 items-center rounded-lg bg-[#93509e] px-6 text-sm font-bold text-white transition-colors hover:bg-[#7c3f87]"
                  >
                    Explorar Produtos
                  </Link>
                </div>
              }
            >
              <Show
                when={
                  cart()?.wholesale_scope_summaries &&
                  cart()!.wholesale_scope_summaries!.length > 0
                }
              >
                <div class="mb-4 rounded-lg border border-[#E5C2EA] bg-[#FCF8FD] p-3 space-y-1.5">
                  <For each={cart()!.wholesale_scope_summaries}>
                    {(summary) => (
                      <div class="flex items-center gap-2 text-xs font-semibold text-[#66166E]">
                        <span class="size-2 rounded-full bg-[#93509e] shrink-0" />
                        <span>{summary.message}</span>
                      </div>
                    )}
                  </For>
                </div>
              </Show>

              <ul class="space-y-4">
                <For each={cart()?.items ?? []}>
                  {(item) => (
                    <li class="flex gap-3 border-b border-zinc-100 pb-4">
                      <ProductImage
                        src={item.image_url}
                        alt={item.product_name}
                        class="size-16 shrink-0 rounded-lg border border-zinc-200 bg-[#FAF7F8] object-contain p-1"
                      />
                      <div class="min-w-0 flex-1">
                        <Link
                          to="/produto/$slug"
                          params={{ slug: item.product_slug }}
                          onClick={closeDrawer}
                          class="line-clamp-2 text-xs font-bold text-[#3D1260] hover:text-[#C22583]"
                        >
                          {item.product_name}
                        </Link>
                        <p class="mt-0.5 text-[11px] text-[#5B486B]">
                          {item.variant_name} • SKU {item.sku}
                        </p>
                        <Show when={item.wholesale_applied}>
                          <span class="mt-1 inline-flex items-center gap-1 rounded bg-[#F8EFFC] px-1.5 py-0.5 text-[10px] font-bold text-[#7C2784] whitespace-nowrap">
                            Preço de Atacado ({item.wholesale_tier_min_qty}+ un.)
                          </span>
                        </Show>
                        <div class="mt-2 flex items-center justify-between">
                          <div class="inline-flex items-center rounded-lg border border-zinc-200">
                            <button
                              type="button"
                              disabled={busy() || item.quantity <= 1}
                              onClick={() =>
                                void updateCartItemQty(
                                  item.id,
                                  item.quantity - 1,
                                )
                              }
                              aria-label="Diminuir quantidade"
                              class="inline-flex size-8 items-center justify-center text-[#3D1260] disabled:opacity-40"
                            >
                              <Minus class="size-3.5" aria-hidden="true" />
                            </button>
                            <span class="min-w-7 text-center text-xs font-semibold text-[#3D1260]">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              disabled={
                                busy() || item.quantity >= item.available_stock
                              }
                              onClick={() =>
                                void updateCartItemQty(
                                  item.id,
                                  item.quantity + 1,
                                )
                              }
                              aria-label="Aumentar quantidade"
                              class="inline-flex size-8 items-center justify-center text-[#3D1260] disabled:opacity-40"
                            >
                              <Plus class="size-3.5" aria-hidden="true" />
                            </button>
                          </div>

                          <div class="flex items-center gap-2">
                            <span class="text-sm font-bold text-[#C22583]">
                              {formatCents(item.line_total_cents)}
                            </span>
                            <button
                              type="button"
                              disabled={busy()}
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
                              aria-label={`Remover ${item.product_name}`}
                              class="inline-flex size-8 items-center justify-center rounded text-zinc-500 hover:text-red-700"
                            >
                              <Trash2 class="size-4" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>

          {/* Bottom Summary OR "Compre também" cross-sell block */}
          <Show
            when={(cart()?.items.length ?? 0) > 0}
            fallback={
              <div class="border-t border-zinc-200 bg-[#F7F6F8]">
                <div class="border-b border-zinc-200 py-3 text-center">
                  <h3 class="text-sm font-extrabold text-[#3D1260]">
                    Compre também
                  </h3>
                </div>
                <Show
                  when={recommended().length > 0}
                  fallback={
                    <p class="px-5 py-6 text-center text-sm text-[#3D1260]">
                      Adicione produtos ao carrinho e eles aparecerão aqui.
                    </p>
                  }
                >
                  <div class="space-y-2.5 bg-white px-4 py-3">
                    <For each={recommended().slice(0, 2)}>
                      {(prod) => (
                        <div class="flex items-center gap-3 rounded-lg border border-zinc-100 p-2 hover:border-[#EBD4EC]">
                          <Link
                            to="/produto/$slug"
                            params={{ slug: prod.slug }}
                            onClick={closeDrawer}
                            class="size-12 shrink-0 rounded bg-[#FAF7F8] p-1"
                          >
                            <ProductImage
                              src={prod.primary_image}
                              alt={prod.primary_image_alt}
                              class="h-full w-full object-contain"
                            />
                          </Link>
                          <div class="min-w-0 flex-1">
                            <Link
                              to="/produto/$slug"
                              params={{ slug: prod.slug }}
                              onClick={closeDrawer}
                              class="line-clamp-1 text-xs font-bold text-[#3D1260] hover:text-[#C22583]"
                            >
                              {prod.name}
                            </Link>
                            <p class="text-xs font-extrabold text-[#C22583]">
                              {formatCents(prod.effective_price_cents)}
                            </p>
                          </div>
                          <Show when={prod.default_variant_id && prod.in_stock}>
                            <button
                              type="button"
                              disabled={busy()}
                              onClick={() => {
                                void addCartItem(
                                  prod.default_variant_id!,
                                  1,
                                  true,
                                ).then(() => {
                                  trackAddToCart({
                                    currency: "BRL",
                                    value: prod.effective_price_cents / 100,
                                    items: [
                                      {
                                        item_id: prod.sku,
                                        item_name: prod.name,
                                        price: prod.effective_price_cents / 100,
                                        item_brand: prod.brand?.name,
                                        quantity: 1,
                                      },
                                    ],
                                  });
                                });
                              }}
                              class="shrink-0 rounded-lg bg-[#93509e] px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-[#7c3f87] disabled:opacity-50"
                            >
                              Comprar
                            </button>
                          </Show>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            }
          >
            <div class="border-t border-zinc-200 bg-[#FAF7F8] p-5">
              <div class="space-y-1.5 text-sm">
                <Show when={(cart()?.wholesale_discount_cents ?? 0) > 0}>
                  <div class="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 flex items-center justify-between text-xs font-semibold text-emerald-800">
                    <span class="flex items-center gap-1.5">
                      <Sparkles class="size-3.5 text-emerald-600 shrink-0" />
                      <span>Economia Atacado</span>
                    </span>
                    <span class="font-bold text-emerald-700">
                      -{formatCents(cart()?.wholesale_discount_cents)}
                    </span>
                  </div>
                </Show>
                <div class="flex justify-between text-[#5B486B]">
                  <span>Subtotal</span>
                  <span>{formatCents(cart()?.subtotal_cents)}</span>
                </div>
                <Show when={(cart()?.discount_cents ?? 0) > 0}>
                  <div class="flex justify-between font-medium text-emerald-700">
                    <span>Descontos</span>
                    <span>-{formatCents(cart()?.discount_cents)}</span>
                  </div>
                </Show>
                <div class="flex justify-between border-t border-zinc-200 pt-2 text-base font-extrabold text-[#3D1260]">
                  <span>Total parcial</span>
                  <span>{formatCents(cart()?.total_cents)}</span>
                </div>
              </div>

              <div class="mt-4 grid grid-cols-2 gap-2.5">
                <Link
                  to="/carrinho"
                  onClick={closeDrawer}
                  class="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#93509e] bg-white px-4 text-sm font-bold text-[#93509e] transition-colors hover:bg-[#93509e] hover:text-white"
                >
                  Ver Carrinho
                </Link>
                <Link
                  to="/checkout"
                  onClick={() => {
                    const c = cart();
                    if (c) {
                      trackBeginCheckout({
                        currency: "BRL",
                        value: c.total_cents / 100,
                        items: mapCartItemsToGa4(c.items),
                      });
                    }
                    closeDrawer();
                  }}
                  class="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#93509e] px-4 text-sm font-bold text-white transition-colors hover:bg-[#7c3f87]"
                >
                  Finalizar
                </Link>
              </div>
            </div>
          </Show>
        </aside>
      </div>
    </Show>
  );
}
