import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { Link, createFileRoute } from "@tanstack/solid-router";
import AlertTriangle from "lucide-solid/icons/triangle-exclamation-point";
import BellRing from "lucide-solid/icons/bell-ring";
import CheckCircle2 from "lucide-solid/icons/circle-check";
import ClipboardList from "lucide-solid/icons/clipboard-list";
import Minus from "lucide-solid/icons/minus";
import Plus from "lucide-solid/icons/plus";
import ShoppingCart from "lucide-solid/icons/shopping-cart";
import Trash2 from "lucide-solid/icons/trash";
import { StoreShell } from "@/features/storefront/components/StoreShell";
import { VariantRestockModal } from "@/features/storefront/components/VariantRestockModal";
import { LoadingState } from "@/components/feedback/loading-state";
import { session } from "@/security/session";
import { ApiError } from "@/lib/api";
import { formatCents } from "@/lib/format";
import {
  addReplenishmentListToCart,
  createReplenishmentList,
  deleteReplenishmentList,
  fetchReplenishmentLists,
  removeGuestReplenishmentItem,
  removeReplenishmentItem,
  renameReplenishmentList,
  replenishmentStore,
  syncGuestReplenishmentAfterLogin,
  updateGuestReplenishmentQty,
  updateReplenishmentItemQty,
} from "@/features/storefront/replenishment";
import {
  addBulkCartItems,
  refreshCart,
  storefrontStore,
} from "@/features/storefront/store";
import type {
  ProductVariantData,
  ReplenishmentItemData,
} from "@/features/storefront/types";

export const Route = createFileRoute("/minha-reposicao")({
  component: MinhaReposicaoPage,
});

function MinhaReposicaoPage() {
  const isLoggedIn = () => session.status() === "authenticated";
  const [selectedListId, setSelectedListId] = createSignal<number | null>(null);
  const [newListName, setNewListName] = createSignal("");
  const [feedback, setFeedback] = createSignal<{
    type: "ok" | "warn" | "err";
    text: string;
  } | null>(null);
  const [restockTarget, setRestockTarget] = createSignal<{
    slug: string;
    name: string;
    variant: ProductVariantData;
  } | null>(null);

  createEffect(() => {
    if (isLoggedIn()) {
      void syncGuestReplenishmentAfterLogin();
    }
  });

  const lists = () => replenishmentStore.lists();

  const activeList = createMemo(() => {
    const all = lists();
    if (all.length === 0) return null;
    const chosenId = selectedListId();
    return (
      all.find((l) => l.id === chosenId) ??
      all.find((l) => l.is_default) ??
      all[0]
    );
  });

  async function handleCreateList(e: Event) {
    e.preventDefault();
    const name = newListName().trim();
    if (name.length < 2) return;
    setFeedback(null);
    try {
      const created = await createReplenishmentList(name, lists().length === 0);
      setNewListName("");
      setSelectedListId(created.id);
      setFeedback({ type: "ok", text: `Lista "${created.name}" criada!` });
    } catch (err) {
      setFeedback({
        type: "err",
        text:
          err instanceof ApiError
            ? err.message
            : "Não foi possível criar a lista.",
      });
    }
  }

  async function handleAddAllToCart(listId: number) {
    setFeedback(null);
    try {
      const result = await addReplenishmentListToCart(listId);
      await refreshCart();
      storefrontStore.setDrawerOpen(true);

      const parts: string[] = [];
      if (result.added_units_total > 0) {
        parts.push(`${result.added_units_total} un. adicionada(s) ao carrinho`);
      }
      if (result.partial_items.length > 0) {
        parts.push(
          `${result.partial_items.length} item(ns) ajustado(s) ao estoque disponível`,
        );
      }
      if (result.unavailable_items.length > 0) {
        parts.push(
          `${result.unavailable_items.length} item(ns) esgotado(s) ignorado(s)`,
        );
      }

      setFeedback({
        type:
          result.unavailable_items.length > 0 || result.partial_items.length > 0
            ? "warn"
            : "ok",
        text: parts.join(" • ") || "Itens disponíveis adicionados ao carrinho.",
      });
    } catch (err) {
      setFeedback({
        type: "err",
        text:
          err instanceof ApiError
            ? err.message
            : "Não foi possível adicionar a lista ao carrinho.",
      });
    }
  }

  async function handleGuestAddAllToCart() {
    const available = replenishmentStore
      .guestItems()
      .filter((i) => i.in_stock && i.available_stock > 0);
    if (available.length === 0) {
      setFeedback({
        type: "warn",
        text: "Nenhum item com estoque disponível para adicionar.",
      });
      return;
    }
    setFeedback(null);
    try {
      const res = await addBulkCartItems(
        available.map((i) => ({
          variant_id: i.variant_id,
          quantity: Math.min(i.quantity, i.available_stock),
        })),
        true,
      );
      setFeedback({
        type: res.rejected.length > 0 ? "warn" : "ok",
        text: `${res.added.length} produto(s) adicionado(s) ao carrinho.`,
      });
    } catch (err) {
      setFeedback({
        type: "err",
        text:
          err instanceof ApiError
            ? err.message
            : "Não foi possível adicionar itens ao carrinho.",
      });
    }
  }

  function openRestockForItem(item: ReplenishmentItemData) {
    setRestockTarget({
      slug: item.product_slug,
      name: item.product_name,
      variant: {
        id: item.variant_id,
        sku: item.sku,
        gtin: null,
        name: item.variant_name,
        shade_code: item.shade_code,
        color_hex: item.color_hex,
        price_cents: item.original_price_cents,
        effective_price_cents: item.unit_price_cents,
        stock_qty: 0,
        available_stock: item.available_stock,
        in_stock: false,
        is_default: false,
        image_path: item.image_url,
        attributes: [],
      },
    });
  }

  return (
    <StoreShell>
      <div class="mx-auto max-w-7xl px-4 py-7 sm:px-6">
        <div class="mb-6 flex flex-col gap-3 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span class="inline-flex items-center gap-1.5 rounded-full bg-[#F3E2F6] px-3 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-[#93509e]">
              <ClipboardList class="h-3.5 w-3.5" />
              Reposição Profissional
            </span>
            <h1 class="mt-2 text-2xl font-extrabold text-[#2E0C49]">
              Minha Lista de Reposição
            </h1>
            <p class="mt-1 text-sm text-[#5B486B]">
              Salve os insumos recorrentes do seu salão com atualização
              automática de preços e estoque para recomprar em 1 clique.
            </p>
          </div>
          <Show when={isLoggedIn()}>
            <button
              type="button"
              onClick={() => void fetchReplenishmentLists()}
              disabled={replenishmentStore.loading()}
              class="h-10 rounded-lg border border-[#DFC2E3] bg-white px-4 text-xs font-bold text-[#93509e] hover:bg-[#FCF8FD]"
            >
              Atualizar preços e estoque
            </button>
          </Show>
        </div>

        <Show when={feedback()}>
          {(fb) => (
            <div
              role={fb().type === "err" ? "alert" : "status"}
              class={`mb-5 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium ${
                fb().type === "ok"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : fb().type === "warn"
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-red-200 bg-red-50 text-red-800"
              }`}
            >
              <Show
                when={fb().type === "ok"}
                fallback={<AlertTriangle class="h-4 w-4 shrink-0" />}
              >
                <CheckCircle2 class="h-4 w-4 shrink-0" />
              </Show>
              <span>{fb().text}</span>
            </div>
          )}
        </Show>

        {/* Guest banner + local list */}
        <Show
          when={isLoggedIn()}
          fallback={
            <div class="space-y-5">
              <div class="flex flex-col gap-3 rounded-2xl border border-[#DFC2E3] bg-[#FCF8FD] p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 class="text-sm font-extrabold text-[#2E0C49]">
                    Salve sua lista permanentemente na sua conta
                  </h2>
                  <p class="mt-0.5 text-xs text-[#5B486B]">
                    Seus itens salvos neste navegador serão sincronizados
                    automaticamente assim que você entrar ou criar sua conta.
                  </p>
                </div>
                <Link
                  to="/entrar"
                  search={{ redirect: "/minha-reposicao" }}
                  class="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-[#93509e] px-5 text-xs font-bold text-white hover:bg-[#7c3f87]"
                >
                  Entrar e sincronizar
                </Link>
              </div>

              <Show
                when={replenishmentStore.guestItems().length > 0}
                fallback={
                  <div class="rounded-2xl border border-zinc-200 bg-zinc-50 p-10 text-center">
                    <ClipboardList class="mx-auto h-10 w-10 text-[#93509e]" />
                    <p class="mt-3 text-base font-bold text-zinc-900">
                      Sua lista de reposição está vazia
                    </p>
                    <p class="mt-1 text-sm text-zinc-600">
                      Nos produtos desejados, clique em &quot;Adicionar à lista
                      de reposição&quot; para montar seu pedido recorrente.
                    </p>
                    <Link
                      to="/categorias"
                      class="mt-5 inline-flex h-10 items-center rounded-lg bg-[#93509e] px-5 text-xs font-bold text-white hover:bg-[#7c3f87]"
                    >
                      Explorar catálogo
                    </Link>
                  </div>
                }
              >
                <div class="space-y-3">
                  <div class="flex justify-end">
                    <button
                      type="button"
                      disabled={storefrontStore.cartBusy()}
                      onClick={() => void handleGuestAddAllToCart()}
                      class="inline-flex h-10 items-center gap-2 rounded-lg bg-[#93509e] px-5 text-xs font-bold text-white hover:bg-[#7c3f87]"
                    >
                      <ShoppingCart class="h-4 w-4" />
                      Adicionar disponíveis ao carrinho
                    </button>
                  </div>
                  <For each={replenishmentStore.guestItems()}>
                    {(item) => (
                      <div class="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-4">
                        <div class="flex min-w-0 flex-1 items-center gap-3">
                          <img
                            src={item.image_url || "/placeholder-product.svg"}
                            alt={item.product_name}
                            class="h-16 w-16 shrink-0 rounded-lg border border-zinc-100 object-contain p-1"
                          />
                          <div class="min-w-0">
                            <Link
                              to="/produto/$slug"
                              params={{ slug: item.product_slug }}
                              class="line-clamp-1 text-sm font-bold text-[#2E0C49] hover:text-[#93509e]"
                            >
                              {item.product_name}
                            </Link>
                            <p class="text-xs text-zinc-600">
                              {item.variant_name} • SKU {item.sku}
                            </p>
                            <p class="mt-0.5 text-sm font-extrabold text-[#93509e]">
                              {formatCents(item.unit_price_cents)}
                            </p>
                          </div>
                        </div>

                        <div class="flex items-center gap-3">
                          <div class="inline-flex h-9 items-center rounded-lg border border-zinc-200 bg-zinc-50">
                            <button
                              type="button"
                              onClick={() =>
                                updateGuestReplenishmentQty(
                                  item.variant_id,
                                  item.quantity - 1,
                                )
                              }
                              aria-label="Diminuir quantidade"
                              class="flex h-full w-8 items-center justify-center text-zinc-700 hover:bg-zinc-200/70"
                            >
                              <Minus class="h-3.5 w-3.5" />
                            </button>
                            <span class="w-9 text-center text-xs font-bold">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                updateGuestReplenishmentQty(
                                  item.variant_id,
                                  item.quantity + 1,
                                )
                              }
                              aria-label="Aumentar quantidade"
                              class="flex h-full w-8 items-center justify-center text-zinc-700 hover:bg-zinc-200/70"
                            >
                              <Plus class="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              removeGuestReplenishmentItem(item.variant_id)
                            }
                            aria-label={`Remover ${item.product_name}`}
                            class="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 class="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          }
        >
          {/* Authenticated view with multiple lists */}
          <Show
            when={!replenishmentStore.loading() || lists().length > 0}
            fallback={
              <LoadingState message="Carregando listas de reposição..." />
            }
          >
            <div class="grid gap-6 lg:grid-cols-[280px_1fr]">
              <aside class="space-y-4">
                <div class="rounded-2xl border border-zinc-200 bg-white p-4">
                  <h2 class="text-xs font-extrabold uppercase tracking-wider text-zinc-500">
                    Suas listas
                  </h2>
                  <div class="mt-3 space-y-1.5">
                    <For each={lists()}>
                      {(list) => (
                        <button
                          type="button"
                          onClick={() => setSelectedListId(list.id)}
                          class={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-colors ${
                            activeList()?.id === list.id
                              ? "bg-[#93509e] text-white"
                              : "bg-zinc-50 text-[#2E0C49] hover:bg-[#FCF8FD]"
                          }`}
                        >
                          <span class="truncate">{list.name}</span>
                          <span
                            class={`ml-2 rounded-full px-2 py-0.5 text-[10px] ${
                              activeList()?.id === list.id
                                ? "bg-white/20 text-white"
                                : "bg-zinc-200 text-zinc-700"
                            }`}
                          >
                            {list.items_count}
                          </span>
                        </button>
                      )}
                    </For>
                  </div>

                  <form
                    onSubmit={(e) => void handleCreateList(e)}
                    class="mt-4 space-y-2 border-t border-zinc-100 pt-4"
                  >
                    <label
                      for="new-repl-list-name"
                      class="block text-[11px] font-bold text-zinc-600"
                    >
                      Criar nova lista (ex.: Salão / Esmaltes)
                    </label>
                    <input
                      id="new-repl-list-name"
                      type="text"
                      required
                      minLength={2}
                      value={newListName()}
                      onInput={(e) => setNewListName(e.currentTarget.value)}
                      placeholder="Nome da lista..."
                      class="h-9 w-full rounded-lg border border-zinc-300 px-3 text-xs focus:border-[#93509e] focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={replenishmentStore.busy()}
                      class="h-9 w-full rounded-lg bg-[#93509e] text-xs font-bold text-white hover:bg-[#7c3f87]"
                    >
                      + Criar lista
                    </button>
                  </form>
                </div>
              </aside>

              <section class="min-w-0">
                <Show
                  when={activeList()}
                  fallback={
                    <div class="rounded-2xl border border-zinc-200 bg-zinc-50 p-10 text-center">
                      <p class="text-sm font-semibold text-zinc-700">
                        Nenhuma lista criada ainda. Crie sua primeira lista ao
                        lado ou adicione produtos direto do catálogo.
                      </p>
                    </div>
                  }
                >
                  {(list) => (
                    <div class="space-y-4">
                      <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#DFC2E3] bg-[#FCF8FD] p-4 sm:p-5">
                        <div>
                          <div class="flex items-center gap-2">
                            <h2 class="text-lg font-extrabold text-[#2E0C49]">
                              {list().name}
                            </h2>
                            <Show when={list().is_default}>
                              <span class="rounded-full bg-[#F3E2F6] px-2.5 py-0.5 text-[10px] font-bold text-[#93509e]">
                                Padrão
                              </span>
                            </Show>
                          </div>
                          <p class="mt-0.5 text-xs text-[#5B486B]">
                            {list().available_items_count} disponível(is) •{" "}
                            {list().unavailable_items_count} indisponível(is) •
                            Total estimado:{" "}
                            <strong class="text-[#93509e]">
                              {formatCents(list().estimated_total_cents)}
                            </strong>
                          </p>
                        </div>

                        <div class="flex flex-wrap items-center gap-2">
                          <Show when={!list().is_default}>
                            <button
                              type="button"
                              onClick={() =>
                                void renameReplenishmentList(list().id, {
                                  is_default: true,
                                })
                              }
                              class="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                            >
                              Definir padrão
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void deleteReplenishmentList(list().id);
                                setSelectedListId(null);
                              }}
                              class="h-9 rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 hover:bg-red-50"
                            >
                              Excluir lista
                            </button>
                          </Show>
                          <button
                            type="button"
                            disabled={
                              list().available_items_count === 0 ||
                              replenishmentStore.busy()
                            }
                            onClick={() => void handleAddAllToCart(list().id)}
                            class="inline-flex h-10 items-center gap-2 rounded-lg bg-[#93509e] px-5 text-xs font-bold text-white hover:bg-[#7c3f87] disabled:opacity-50"
                          >
                            <ShoppingCart class="h-4 w-4" />
                            Adicionar disponíveis ao carrinho
                          </button>
                        </div>
                      </div>

                      <Show
                        when={list().items.length > 0}
                        fallback={
                          <div class="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-600">
                            Esta lista ainda não possui itens.
                          </div>
                        }
                      >
                        <div class="space-y-3">
                          <For each={list().items}>
                            {(item) => (
                              <div class="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                                <div class="flex min-w-0 flex-1 items-center gap-3">
                                  <img
                                    src={
                                      item.image_url ||
                                      "/placeholder-product.svg"
                                    }
                                    alt={item.product_name}
                                    class="h-16 w-16 shrink-0 rounded-lg border border-zinc-100 object-contain p-1"
                                  />
                                  <div class="min-w-0">
                                    <Link
                                      to="/produto/$slug"
                                      params={{ slug: item.product_slug }}
                                      class="line-clamp-1 text-sm font-bold text-[#2E0C49] hover:text-[#93509e]"
                                    >
                                      {item.product_name}
                                    </Link>
                                    <div class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-600">
                                      <Show when={item.color_hex}>
                                        <span
                                          class="inline-block h-3 w-3 rounded-full border border-black/15"
                                          style={{
                                            "background-color": item.color_hex!,
                                          }}
                                        />
                                      </Show>
                                      <span>{item.variant_name}</span>
                                      <span class="text-zinc-400">
                                        • SKU {item.sku}
                                      </span>
                                    </div>
                                    <div class="mt-1 flex flex-wrap items-center gap-2 text-xs">
                                      <span class="font-extrabold text-[#93509e]">
                                        {formatCents(item.unit_price_cents)}
                                      </span>
                                      <span
                                        class={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                          item.stock_status === "ok"
                                            ? "bg-emerald-50 text-emerald-700"
                                            : item.stock_status === "partial"
                                              ? "bg-amber-50 text-amber-800"
                                              : "bg-red-50 text-red-700"
                                        }`}
                                      >
                                        {item.stock_status === "ok"
                                          ? `Disponível (${item.available_stock} un.)`
                                          : item.stock_status === "partial"
                                            ? `Estoque parcial: só ${item.available_stock} un.`
                                            : "Esgotado no momento"}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div class="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                                  <Show when={!item.in_stock}>
                                    <button
                                      type="button"
                                      onClick={() => openRestockForItem(item)}
                                      class="inline-flex h-8 items-center gap-1 rounded-lg border border-[#93509e] px-3 text-[11px] font-bold text-[#93509e] hover:bg-[#93509e] hover:text-white"
                                    >
                                      <BellRing class="h-3.5 w-3.5" />
                                      Avise-me
                                    </button>
                                  </Show>

                                  <div class="inline-flex h-9 items-center rounded-lg border border-zinc-200 bg-zinc-50">
                                    <button
                                      type="button"
                                      disabled={replenishmentStore.busy()}
                                      onClick={() =>
                                        void updateReplenishmentItemQty(
                                          list().id,
                                          item.id,
                                          item.desired_quantity - 1,
                                        )
                                      }
                                      aria-label="Diminuir quantidade"
                                      class="flex h-full w-8 items-center justify-center text-zinc-700 hover:bg-zinc-200/70"
                                    >
                                      <Minus class="h-3.5 w-3.5" />
                                    </button>
                                    <span class="w-9 text-center text-xs font-bold">
                                      {item.desired_quantity}
                                    </span>
                                    <button
                                      type="button"
                                      disabled={replenishmentStore.busy()}
                                      onClick={() =>
                                        void updateReplenishmentItemQty(
                                          list().id,
                                          item.id,
                                          item.desired_quantity + 1,
                                        )
                                      }
                                      aria-label="Aumentar quantidade"
                                      class="flex h-full w-8 items-center justify-center text-zinc-700 hover:bg-zinc-200/70"
                                    >
                                      <Plus class="h-3.5 w-3.5" />
                                    </button>
                                  </div>

                                  <button
                                    type="button"
                                    disabled={replenishmentStore.busy()}
                                    onClick={() =>
                                      void removeReplenishmentItem(
                                        list().id,
                                        item.id,
                                      )
                                    }
                                    aria-label={`Remover ${item.product_name}`}
                                    class="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                                  >
                                    <Trash2 class="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>
                  )}
                </Show>
              </section>
            </div>
          </Show>
        </Show>
      </div>

      <VariantRestockModal
        open={Boolean(restockTarget())}
        productSlug={restockTarget()?.slug ?? ""}
        productName={restockTarget()?.name ?? ""}
        variant={restockTarget()?.variant ?? null}
        whatsappEnabled={false}
        onClose={() => setRestockTarget(null)}
      />
    </StoreShell>
  );
}
