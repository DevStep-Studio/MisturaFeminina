import { For, Show } from "solid-js";
import { Link } from "@tanstack/solid-router";
import ShoppingBag from "lucide-solid/icons/shopping-bag";
import Trash2 from "lucide-solid/icons/trash";
import X from "lucide-solid/icons/x";
import Plus from "lucide-solid/icons/plus";
import Minus from "lucide-solid/icons/minus";
import { assetUrl, formatCents } from "../../../lib/format";
import { removeCartItem, storefrontStore, updateCartItemQty } from "../store";

export function CartDrawer() {
  const cart = () => storefrontStore.cart();
  const isOpen = () => storefrontStore.drawerOpen();
  const busy = () => storefrontStore.cartBusy();

  return (
    <Show when={isOpen()}>
      <div
        class="fixed inset-0 z-50 flex justify-end bg-black/50"
        role="dialog"
        aria-modal="true"
        aria-label="Sacola de compras"
      >
        <button
          type="button"
          class="flex-1"
          aria-label="Fechar sacola"
          onClick={() => storefrontStore.setDrawerOpen(false)}
        />
        <aside class="flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
          <div class="flex items-center justify-between border-b border-line px-5 py-4">
            <div class="flex items-center gap-2">
              <ShoppingBag class="size-5 text-brand-600" aria-hidden="true" />
              <h2 class="text-base font-bold text-ink">
                Minha Sacola ({cart()?.items_count ?? 0})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => storefrontStore.setDrawerOpen(false)}
              aria-label="Fechar sacola"
              class="inline-flex size-10 items-center justify-center rounded-lg text-ink hover:bg-zinc-100"
            >
              <X class="size-5" aria-hidden="true" />
            </button>
          </div>

          <Show when={(cart()?.free_shipping_threshold_cents ?? 0) > 0}>
            <div class="border-b border-line bg-[#FAF7F8] px-5 py-2.5 text-xs text-ink">
              <Show
                when={(cart()?.free_shipping_remaining_cents ?? 0) > 0}
                fallback={
                  <p class="font-semibold text-success">
                    Você atingiu o valor para Frete Grátis!
                  </p>
                }
              >
                <p>
                  Faltam{" "}
                  <strong>
                    {formatCents(cart()?.free_shipping_remaining_cents)}
                  </strong>{" "}
                  para ganhar Frete Grátis*.
                </p>
              </Show>
            </div>
          </Show>

          <div class="flex-1 overflow-y-auto p-5">
            <Show
              when={(cart()?.items.length ?? 0) > 0}
              fallback={
                <div class="flex h-full flex-col items-center justify-center text-center">
                  <ShoppingBag
                    class="mb-3 size-12 text-zinc-300"
                    aria-hidden="true"
                  />
                  <p class="text-sm font-semibold text-ink">
                    Sua sacola está vazia
                  </p>
                  <p class="mt-1 text-xs text-muted">
                    Explore o catálogo e adicione seus produtos favoritos.
                  </p>
                  <Link
                    to="/categorias"
                    onClick={() => storefrontStore.setDrawerOpen(false)}
                    class="mt-4 inline-flex min-h-11 items-center rounded-lg px-5 text-sm font-semibold text-white"
                    style={{ "background-color": "var(--mf-primary)" }}
                  >
                    Explorar Produtos
                  </Link>
                </div>
              }
            >
              <ul class="space-y-4">
                <For each={cart()?.items ?? []}>
                  {(item) => (
                    <li class="flex gap-3 border-b border-zinc-100 pb-4">
                      <img
                        src={assetUrl(item.image_url)}
                        alt={item.product_name}
                        class="size-16 shrink-0 rounded-lg border border-line bg-[#FAF7F8] object-contain p-1"
                      />
                      <div class="min-w-0 flex-1">
                        <Link
                          to="/produto/$slug"
                          params={{ slug: item.product_slug }}
                          onClick={() => storefrontStore.setDrawerOpen(false)}
                          class="line-clamp-2 text-xs font-semibold text-ink hover:text-brand-600"
                        >
                          {item.product_name}
                        </Link>
                        <p class="mt-0.5 text-[11px] text-muted">
                          {item.variant_name} • SKU {item.sku}
                        </p>
                        <div class="mt-2 flex items-center justify-between">
                          <div class="inline-flex items-center rounded-lg border border-line">
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
                              class="inline-flex size-8 items-center justify-center text-ink disabled:opacity-40"
                            >
                              <Minus class="size-3.5" aria-hidden="true" />
                            </button>
                            <span class="min-w-7 text-center text-xs font-semibold">
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
                              class="inline-flex size-8 items-center justify-center text-ink disabled:opacity-40"
                            >
                              <Plus class="size-3.5" aria-hidden="true" />
                            </button>
                          </div>

                          <div class="flex items-center gap-2">
                            <span class="text-sm font-bold text-ink">
                              {formatCents(item.line_total_cents)}
                            </span>
                            <button
                              type="button"
                              disabled={busy()}
                              onClick={() => void removeCartItem(item.id)}
                              aria-label={`Remover ${item.product_name}`}
                              class="inline-flex size-8 items-center justify-center rounded text-zinc-400 hover:text-danger"
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

          <Show when={(cart()?.items.length ?? 0) > 0}>
            <div class="border-t border-line bg-zinc-50 p-5">
              <div class="space-y-1.5 text-sm">
                <div class="flex justify-between text-muted">
                  <span>Subtotal</span>
                  <span>{formatCents(cart()?.subtotal_cents)}</span>
                </div>
                <Show when={(cart()?.discount_cents ?? 0) > 0}>
                  <div class="flex justify-between font-medium text-success">
                    <span>Descontos</span>
                    <span>-{formatCents(cart()?.discount_cents)}</span>
                  </div>
                </Show>
                <div class="flex justify-between border-t border-line pt-2 text-base font-bold text-ink">
                  <span>Total parcial</span>
                  <span>{formatCents(cart()?.total_cents)}</span>
                </div>
              </div>

              <div class="mt-4 grid grid-cols-2 gap-2.5">
                <Link
                  to="/carrinho"
                  onClick={() => storefrontStore.setDrawerOpen(false)}
                  class="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-zinc-100"
                >
                  Ver Carrinho
                </Link>
                <Link
                  to="/checkout"
                  onClick={() => storefrontStore.setDrawerOpen(false)}
                  class="inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold text-white"
                  style={{ "background-color": "var(--mf-primary)" }}
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
