import { For, Show } from "solid-js";
import { Link } from "@tanstack/solid-router";
import { GitCompareArrows, ShoppingBag, Trash2, X } from "lucide-solid";
import { formatCents } from "@/lib/format";
import { addCartItem } from "../store";
import {
  clearComparator,
  clearComparatorNotice,
  closeComparatorModal,
  comparatorStore,
  openComparatorModal,
  removeComparatorProduct,
} from "../comparator";

export function ProductComparatorBar() {
  const count = () => comparatorStore.items().length;

  async function addSingleFromComparator(variantId: number | null) {
    if (!variantId) return;
    await addCartItem(variantId, 1, true);
  }

  return (
    <>
      <Show when={comparatorStore.notice()}>
        {(msg) => (
          <div
            role="status"
            class="fixed bottom-24 right-4 z-50 flex max-w-sm items-center gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-900 shadow-lg lg:bottom-6"
          >
            <span>{msg()}</span>
            <button
              type="button"
              onClick={clearComparatorNotice}
              aria-label="Fechar aviso do comparador"
              class="rounded p-0.5 text-amber-800 hover:bg-amber-100"
            >
              <X class="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </Show>

      <Show when={count() > 0}>
        <div
          aria-label="Barra de comparação de produtos"
          class="fixed bottom-[64px] left-0 right-0 z-40 border-t border-[#DFC2E3] bg-white/95 px-3 py-2.5 shadow-[0_-8px_24px_rgba(46,12,73,0.12)] backdrop-blur sm:px-6 lg:bottom-0"
        >
          <div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
            <div class="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-0.5">
              <span class="hidden shrink-0 items-center gap-1.5 text-xs font-extrabold text-[#2E0C49] sm:inline-flex">
                <GitCompareArrows class="h-4 w-4 text-[#93509e]" />
                Comparar ({count()}/3)
              </span>
              <For each={comparatorStore.items()}>
                {(item) => (
                  <div class="flex shrink-0 items-center gap-2 rounded-lg border border-[#EADBED] bg-[#FAF7FC] py-1 pl-1.5 pr-2">
                    <Show when={item.image_url}>
                      <img
                        src={item.image_url!}
                        alt={item.name}
                        class="h-7 w-7 rounded object-contain bg-white"
                      />
                    </Show>
                    <span class="max-w-[130px] truncate text-[11px] font-semibold text-[#2E0C49]">
                      {item.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeComparatorProduct(item.id)}
                      aria-label={`Remover ${item.name} da comparação`}
                      class="rounded p-0.5 text-zinc-400 hover:text-red-600"
                    >
                      <X class="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </For>
            </div>

            <div class="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={clearComparator}
                class="inline-flex h-9 items-center gap-1 rounded-lg border border-zinc-200 px-2.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
              >
                <Trash2 class="h-3.5 w-3.5" />
                <span class="hidden sm:inline">Limpar</span>
              </button>
              <button
                type="button"
                disabled={count() < 2 || comparatorStore.loading()}
                onClick={() => void openComparatorModal()}
                class="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#93509e] px-4 text-xs font-bold text-white transition-colors hover:bg-[#7c3f87] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <GitCompareArrows class="h-3.5 w-3.5" />
                <span>
                  {comparatorStore.loading()
                    ? "Carregando..."
                    : count() < 2
                      ? "Selecione +1"
                      : `Comparar (${count()})`}
                </span>
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={comparatorStore.modalOpen()}>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="comparator-modal-title"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 sm:p-5"
        >
          <div class="relative max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-[#DFC2E3] bg-white shadow-2xl flex flex-col">
            <div class="flex items-center justify-between border-b border-zinc-200 px-4 py-3.5 sm:px-6">
              <div>
                <h2
                  id="comparator-modal-title"
                  class="flex items-center gap-2 text-base font-extrabold text-[#2E0C49] sm:text-lg"
                >
                  <GitCompareArrows class="h-5 w-5 text-[#93509e]" />
                  Comparador Técnico de Produtos
                </h2>
                <p class="text-xs text-zinc-500">
                  Diferenças técnicas entre os itens selecionados ficam
                  destacadas.
                </p>
              </div>
              <button
                type="button"
                onClick={closeComparatorModal}
                aria-label="Fechar comparador"
                class="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
              >
                <X class="h-5 w-5" />
              </button>
            </div>

            <div class="flex-1 overflow-auto p-4 sm:p-6">
              <Show
                when={!comparatorStore.loading() && comparatorStore.matrix()}
                fallback={
                  <div class="py-12 text-center text-sm font-medium text-zinc-500">
                    Carregando comparativo técnico...
                  </div>
                }
              >
                {(matrix) => (
                  <div class="overflow-x-auto">
                    <table class="w-full min-w-[600px] border-collapse text-left text-xs">
                      <thead>
                        <tr>
                          <th class="w-40 border-b border-zinc-200 pb-4 pr-3 align-bottom text-xs font-bold uppercase tracking-wider text-zinc-500">
                            Especificação
                          </th>
                          <For each={matrix().products}>
                            {(col) => (
                              <th class="border-b border-zinc-200 px-3 pb-4 align-top">
                                <div class="flex flex-col gap-2">
                                  <div class="flex items-start justify-between gap-2">
                                    <Link
                                      to="/produto/$slug"
                                      params={{ slug: col.slug }}
                                      onClick={closeComparatorModal}
                                      class="block h-24 w-24 overflow-hidden rounded-xl border border-zinc-100 bg-white p-1"
                                    >
                                      <img
                                        src={
                                          col.primary_image ||
                                          "/placeholder-product.svg"
                                        }
                                        alt={col.name}
                                        class="h-full w-full object-contain"
                                      />
                                    </Link>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        removeComparatorProduct(col.id)
                                      }
                                      class="text-[11px] font-medium text-zinc-400 hover:text-red-600"
                                    >
                                      Remover
                                    </button>
                                  </div>
                                  <Link
                                    to="/produto/$slug"
                                    params={{ slug: col.slug }}
                                    onClick={closeComparatorModal}
                                    class="line-clamp-2 text-xs font-bold text-[#2E0C49] hover:text-[#93509e]"
                                  >
                                    {col.name}
                                  </Link>
                                  <p class="text-sm font-extrabold text-[#93509e]">
                                    {formatCents(col.effective_price_cents)}
                                  </p>
                                  <button
                                    type="button"
                                    disabled={
                                      !col.in_stock || !col.default_variant_id
                                    }
                                    onClick={() =>
                                      void addSingleFromComparator(
                                        col.default_variant_id,
                                      )
                                    }
                                    class="inline-flex h-8 items-center justify-center gap-1 rounded-lg bg-[#93509e] px-3 text-[11px] font-bold text-white hover:bg-[#7c3f87] disabled:bg-zinc-200 disabled:text-zinc-500"
                                  >
                                    <ShoppingBag class="h-3 w-3" />
                                    {col.in_stock ? "Comprar" : "Esgotado"}
                                  </button>
                                </div>
                              </th>
                            )}
                          </For>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-zinc-100">
                        <tr>
                          <td class="py-3 pr-3 font-bold text-zinc-700">
                            Marca
                          </td>
                          <For each={matrix().products}>
                            {(col) => (
                              <td class="px-3 py-3 text-zinc-700">
                                {col.brand || "Mistura Feminina"}
                              </td>
                            )}
                          </For>
                        </tr>
                        <tr>
                          <td class="py-3 pr-3 font-bold text-zinc-700">
                            Disponibilidade
                          </td>
                          <For each={matrix().products}>
                            {(col) => (
                              <td class="px-3 py-3">
                                <span
                                  class={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                    col.in_stock
                                      ? "bg-emerald-50 text-emerald-700"
                                      : "bg-red-50 text-red-600"
                                  }`}
                                >
                                  {col.in_stock
                                    ? `Em estoque (${col.available_stock})`
                                    : "Indisponível"}
                                </span>
                              </td>
                            )}
                          </For>
                        </tr>
                        <For each={matrix().attributes}>
                          {(attr) => (
                            <tr
                              class={
                                attr.has_difference ? "bg-[#FDF6FE]" : undefined
                              }
                            >
                              <td class="py-3 pr-3 font-bold text-[#2E0C49]">
                                <span>{attr.label}</span>
                                <Show when={attr.has_difference}>
                                  <span class="ml-1.5 inline-block rounded bg-[#93509e] px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                                    Diferença
                                  </span>
                                </Show>
                              </td>
                              <For each={matrix().products}>
                                {(col) => (
                                  <td
                                    class={`px-3 py-3 ${
                                      attr.has_difference
                                        ? "font-bold text-[#3D1260]"
                                        : "text-zinc-700"
                                    }`}
                                  >
                                    {attr.values[String(col.id)] || "—"}
                                  </td>
                                )}
                              </For>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </div>
                )}
              </Show>
            </div>
          </div>
        </div>
      </Show>
    </>
  );
}
