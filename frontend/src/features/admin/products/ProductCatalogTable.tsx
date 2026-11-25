import Archive from "lucide-solid/icons/archive";
import Check from "lucide-solid/icons/check";
import ChevronDown from "lucide-solid/icons/chevron-down";
import ChevronRight from "lucide-solid/icons/chevron-right";
import Copy from "lucide-solid/icons/copy";
import CopyPlus from "lucide-solid/icons/copy-plus";
import MoreVertical from "lucide-solid/icons/ellipsis-vertical";
import PackagePlus from "lucide-solid/icons/package-plus";
import Pencil from "lucide-solid/icons/pencil";
import RotateCcw from "lucide-solid/icons/rotate-ccw";
import Trash2 from "lucide-solid/icons/trash";
import X from "lucide-solid/icons/x";
import { For, Show, createMemo, createSignal } from "solid-js";
import { ApiError, api } from "../../../lib/api";
import { assetUrl } from "../../../lib/format";
import {
  type AdminProductRow,
  type AdminVariantRow,
  formatBrlFromCents,
  formatProductPriceRange,
  parseBrlInputToCents,
} from "./types";

interface QuickPriceTarget {
  kind: "product" | "variant";
  id: number;
  name: string;
  sku: string;
  priceCents: number;
  promoPriceCents: number | null;
  updatedAt?: string;
}

interface QuickStockTarget {
  variantId: number;
  productName: string;
  variantName: string;
  sku: string;
  stockQty: number;
  reservedQty: number;
  updatedAt?: string;
}

export function ProductCatalogTable(props: {
  products: AdminProductRow[];
  totalResults: number;
  pageSelectedIds: number[];
  selectAllMatching: boolean;
  excludedIds: number[];
  onToggleOne: (id: number) => void;
  onTogglePage: () => void;
  onSelectAllMatching: () => void;
  onClearSelection: () => void;
  onEditProduct: (id: number) => void;
  onDuplicateProduct: (id: number) => void;
  onOpenBulkGridForProduct: (id: number) => void;
  onOpenReceipts: () => void;
  onLifecycleAction: (
    ids: number[],
    action: "archive" | "restore" | "delete",
  ) => void;
  onReload: () => Promise<void> | void;
  canWrite: boolean;
  canPrice: boolean;
  canStock: boolean;
}) {
  const [expandedProductIds, setExpandedProductIds] = createSignal<number[]>([]);
  const [copiedSku, setCopiedSku] = createSignal<string | null>(null);
  const [openMenuId, setOpenMenuId] = createSignal<number | null>(null);

  const [priceTarget, setPriceTarget] = createSignal<QuickPriceTarget | null>(
    null,
  );
  const [priceInput, setPriceInput] = createSignal("");
  const [promoInput, setPromoInput] = createSignal("");
  const [clearPromo, setClearPromo] = createSignal(false);
  const [priceBusy, setPriceBusy] = createSignal(false);
  const [priceError, setPriceError] = createSignal<string | null>(null);

  const [stockTarget, setStockTarget] = createSignal<QuickStockTarget | null>(
    null,
  );
  const [stockOp, setStockOp] = createSignal<"set" | "add" | "subtract">("set");
  const [stockQtyInput, setStockQtyInput] = createSignal("0");
  const [stockReason, setStockReason] = createSignal(
    "Ajuste administrativo rápido",
  );
  const [stockBusy, setStockBusy] = createSignal(false);
  const [stockError, setStockError] = createSignal<string | null>(null);
  const [stockConflict, setStockConflict] = createSignal<{
    current_stock_qty: number;
    current_reserved_qty: number;
    current_available_qty: number;
    updated_at?: string;
  } | null>(null);

  const allPageChecked = createMemo(() => {
    if (props.products.length === 0) return false;
    return props.products.every((p) => isRowSelected(p.id));
  });

  function isRowSelected(id: number): boolean {
    if (props.selectAllMatching) {
      return !props.excludedIds.includes(id);
    }
    return props.pageSelectedIds.includes(id);
  }

  function isExpanded(id: number): boolean {
    return expandedProductIds().includes(id);
  }

  function toggleExpand(id: number) {
    setExpandedProductIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function copySku(sku: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(sku);
      }
      setCopiedSku(sku);
      setTimeout(() => {
        if (copiedSku() === sku) setCopiedSku(null);
      }, 1500);
    } catch {
      // Ignore clipboard failures in restricted environments
    }
  }

  function openQuickPriceForProduct(p: AdminProductRow) {
    const v = p.variants?.[0];
    if ((p.variants?.length ?? 0) > 1) {
      if (!isExpanded(p.id)) toggleExpand(p.id);
      return;
    }
    const base = v ? v.price_cents : p.price_cents;
    const promo = v ? v.promo_price_cents : p.promo_price_cents;
    setPriceTarget({
      kind: v ? "variant" : "product",
      id: v ? v.id : p.id,
      name: p.name,
      sku: v ? v.sku : p.sku,
      priceCents: base,
      promoPriceCents: promo ?? null,
      updatedAt: v ? v.updated_at : p.updated_at,
    });
    setPriceInput((base / 100).toFixed(2).replace(".", ","));
    setPromoInput(promo ? (promo / 100).toFixed(2).replace(".", ",") : "");
    setClearPromo(false);
    setPriceError(null);
  }

  function openQuickPriceForVariant(p: AdminProductRow, v: AdminVariantRow) {
    setPriceTarget({
      kind: "variant",
      id: v.id,
      name: `${p.name} — ${v.name}`,
      sku: v.sku,
      priceCents: v.price_cents,
      promoPriceCents: v.promo_price_cents ?? null,
      updatedAt: v.updated_at,
    });
    setPriceInput((v.price_cents / 100).toFixed(2).replace(".", ","));
    setPromoInput(
      v.promo_price_cents
        ? (v.promo_price_cents / 100).toFixed(2).replace(".", ",")
        : "",
    );
    setClearPromo(false);
    setPriceError(null);
  }

  async function saveQuickPrice(e: Event) {
    e.preventDefault();
    const target = priceTarget();
    if (!target) return;
    const priceCents = parseBrlInputToCents(priceInput());
    if (priceCents <= 0) {
      setPriceError("Informe um preço de venda válido maior que zero.");
      return;
    }
    let promoCents: number | null = null;
    if (!clearPromo() && promoInput().trim() !== "") {
      promoCents = parseBrlInputToCents(promoInput());
      if (promoCents <= 0 || promoCents >= priceCents) {
        setPriceError(
          "Preço promocional inválido ou maior/igual ao preço de venda.",
        );
        return;
      }
    }

    setPriceBusy(true);
    setPriceError(null);
    try {
      const endpoint =
        target.kind === "variant"
          ? `/admin/variants/${target.id}/quick-price`
          : `/admin/products/${target.id}/quick-price`;
      await api(endpoint, {
        method: "PATCH",
        body: {
          price_cents: priceCents,
          promo_price_cents: clearPromo() ? null : promoCents,
          clear_promo: clearPromo(),
          expected_updated_at: target.updatedAt,
        },
      });
      setPriceTarget(null);
      await props.onReload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setPriceError(
          "Outro operador alterou este preço agora há pouco. Reabra para conferir o valor atual.",
        );
      } else {
        setPriceError(
          err instanceof ApiError ? err.message : "Falha ao atualizar preço.",
        );
      }
    } finally {
      setPriceBusy(false);
    }
  }

  function openQuickStockForProduct(p: AdminProductRow) {
    if ((p.variants?.length ?? 0) > 1) {
      if (!isExpanded(p.id)) toggleExpand(p.id);
      return;
    }
    const v = p.variants?.[0];
    if (!v) return;
    openQuickStockForVariant(p, v);
  }

  function openQuickStockForVariant(p: AdminProductRow, v: AdminVariantRow) {
    setStockTarget({
      variantId: v.id,
      productName: p.name,
      variantName: v.name,
      sku: v.sku,
      stockQty: v.stock_qty,
      reservedQty: v.reserved_qty,
      updatedAt: v.updated_at,
    });
    setStockOp("set");
    setStockQtyInput(String(v.stock_qty));
    setStockReason("Ajuste administrativo rápido");
    setStockError(null);
    setStockConflict(null);
  }

  const resultingStockQty = createMemo(() => {
    const t = stockTarget();
    if (!t) return 0;
    const q = Math.max(0, Number.parseInt(stockQtyInput() || "0", 10) || 0);
    if (stockOp() === "set") return q;
    if (stockOp() === "add") return t.stockQty + q;
    return t.stockQty - q;
  });

  async function saveQuickStock(e: Event) {
    e.preventDefault();
    const target = stockTarget();
    if (!target) return;
    const qtyVal = Number.parseInt(stockQtyInput() || "0", 10);
    if (!Number.isFinite(qtyVal) || qtyVal < 0) {
      setStockError("Informe uma quantidade válida (0 ou maior).");
      return;
    }
    if (resultingStockQty() < target.reservedQty) {
      setStockError(
        `O saldo resultante (${resultingStockQty()} un.) não pode ser menor que o reservado (${target.reservedQty} un.).`,
      );
      return;
    }

    setStockBusy(true);
    setStockError(null);
    setStockConflict(null);
    try {
      await api(`/admin/variants/${target.variantId}/stock`, {
        method: "POST",
        body: {
          operation: stockOp(),
          quantity: qtyVal,
          reason: stockReason().trim() || "Ajuste administrativo rápido",
          expected_stock_qty: target.stockQty,
        },
      });
      setStockTarget(null);
      await props.onReload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const conflict = err.payload?.conflict as
          | {
              current_stock_qty: number;
              current_reserved_qty: number;
              current_available_qty: number;
              updated_at?: string;
            }
          | undefined;
        setStockError(err.message);
        if (conflict) {
          setStockConflict(conflict);
          setStockTarget((prev) =>
            prev
              ? {
                  ...prev,
                  stockQty: conflict.current_stock_qty,
                  reservedQty: conflict.current_reserved_qty,
                  updatedAt: conflict.updated_at,
                }
              : null,
          );
        }
        await props.onReload();
      } else {
        setStockError(
          err instanceof ApiError ? err.message : "Falha ao ajustar estoque.",
        );
      }
    } finally {
      setStockBusy(false);
    }
  }

  function renderStatusBadge(p: AdminProductRow) {
    if (p.is_archived) {
      return (
        <span class="inline-flex items-center rounded border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700">
          Arquivado
        </span>
      );
    }
    if (!p.is_active) {
      return (
        <span class="inline-flex items-center rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
          Inativo
        </span>
      );
    }
    return (
      <span class="inline-flex items-center rounded border border-purple-200 bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-[#62298d]">
        Ativo
      </span>
    );
  }

  return (
    <div class="space-y-3">
      {/* Page vs All Results selection banner */}
      <Show when={allPageChecked() && props.totalResults > props.products.length && !props.selectAllMatching}>
        <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-purple-200 bg-purple-50/70 px-3.5 py-2 text-xs text-zinc-800">
          <span>
            Os <strong>{props.products.length}</strong> produtos desta página estão selecionados.
          </span>
          <button
            type="button"
            onClick={() => props.onSelectAllMatching()}
            class="font-bold text-[#93509e] underline hover:text-[#7c3f87]"
          >
            Selecionar todos os {props.totalResults} resultados
          </button>
        </div>
      </Show>

      <Show when={props.selectAllMatching}>
        <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#93509e] bg-purple-50 px-3.5 py-2 text-xs text-zinc-900">
          <span>
            <strong>
              Todos os {Math.max(0, props.totalResults - props.excludedIds.length)}
            </strong>{" "}
            resultados filtrados estão selecionados no servidor.
          </span>
          <button
            type="button"
            onClick={() => props.onClearSelection()}
            class="font-semibold text-zinc-700 underline hover:text-zinc-900"
          >
            Limpar seleção
          </button>
        </div>
      </Show>

      {/* Desktop compact table: Seleção | Foto e nome | SKU | Preço | Estoque | Situação | Ações */}
      <div class="hidden overflow-visible rounded-lg border border-zinc-200 bg-white md:block">
        <table class="w-full border-collapse text-left text-sm">
          <thead>
            <tr class="border-b border-zinc-200 bg-zinc-50 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
              <th class="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  aria-label={`Selecionar os ${props.products.length} desta página`}
                  title={`Selecionar os ${props.products.length} desta página`}
                  checked={allPageChecked()}
                  onChange={() => props.onTogglePage()}
                  class="h-4 w-4 accent-[#93509e]"
                />
              </th>
              <th class="px-3 py-2.5">Produto</th>
              <th class="w-36 px-3 py-2.5">SKU</th>
              <th class="w-40 px-3 py-2.5 text-right">Preço de venda</th>
              <th class="w-32 px-3 py-2.5 text-right">Estoque</th>
              <th class="w-28 px-3 py-2.5">Situação</th>
              <th class="w-20 px-3 py-2.5 text-right">Ações</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-100">
            <Show
              when={props.products.length > 0}
              fallback={
                <tr>
                  <td
                    colspan={7}
                    class="px-4 py-10 text-center text-sm text-zinc-500"
                  >
                    Nenhum produto corresponde aos filtros atuais.
                  </td>
                </tr>
              }
            >
              <For each={props.products}>
                {(p) => {
                  const summary = () => p.variants_summary;
                  const isMulti = () => (p.variants?.length ?? 0) > 1;
                  const totalAvail = () =>
                    summary()?.total_available ??
                    (p.variants?.[0]
                      ? Math.max(
                          0,
                          p.variants[0].stock_qty - p.variants[0].reserved_qty,
                        )
                      : 0);
                  const outOfStock = () =>
                    totalAvail() <= 0 || (summary()?.out_of_stock_count ?? 0) > 0;
                  const priceInfo = () => formatProductPriceRange(p);

                  return (
                    <>
                      <tr
                        class={`transition-colors hover:bg-zinc-50/70 ${
                          isRowSelected(p.id) ? "bg-purple-50/40" : ""
                        }`}
                      >
                        <td class="px-3 py-2.5 align-middle">
                          <input
                            type="checkbox"
                            aria-label={`Selecionar ${p.name}`}
                            checked={isRowSelected(p.id)}
                            onChange={() => props.onToggleOne(p.id)}
                            class="h-4 w-4 accent-[#93509e]"
                          />
                        </td>

                        <td class="px-3 py-2.5 align-middle">
                          <div class="flex items-center gap-3 min-w-0">
                            <img
                              src={assetUrl(p.images?.[0]?.path)}
                              alt={p.name}
                              class="h-10 w-10 shrink-0 rounded border border-zinc-200 bg-zinc-50 object-contain"
                            />
                            <div class="min-w-0 flex-1">
                              <button
                                type="button"
                                onClick={() => props.onEditProduct(p.id)}
                                class="block max-w-full truncate text-left font-semibold text-zinc-900 hover:text-[#93509e] hover:underline"
                              >
                                {p.name}
                              </button>
                              <div class="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                                <Show when={p.brand?.name}>
                                  <span>{p.brand?.name}</span>
                                </Show>
                                <Show when={isMulti()}>
                                  <button
                                    type="button"
                                    onClick={() => toggleExpand(p.id)}
                                    class="inline-flex items-center gap-0.5 font-semibold text-[#93509e] hover:underline"
                                  >
                                    <Show
                                      when={isExpanded(p.id)}
                                      fallback={<ChevronRight class="h-3.5 w-3.5" />}
                                    >
                                      <ChevronDown class="h-3.5 w-3.5" />
                                    </Show>
                                    {p.variants?.length} variações
                                  </button>
                                </Show>
                                <Show when={p.power_watts}>
                                  <span>{p.power_watts}W</span>
                                </Show>
                              </div>
                            </div>
                          </div>
                        </td>

                        <td class="px-3 py-2.5 align-middle font-mono text-xs text-zinc-700">
                          <div class="inline-flex items-center gap-1.5">
                            <span class="truncate max-w-[104px]" title={p.sku}>
                              {p.sku}
                            </span>
                            <button
                              type="button"
                              onClick={() => void copySku(p.sku)}
                              aria-label={`Copiar SKU ${p.sku}`}
                              class="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800"
                            >
                              <Show
                                when={copiedSku() === p.sku}
                                fallback={<Copy class="h-3.5 w-3.5" />}
                              >
                                <Check class="h-3.5 w-3.5 text-emerald-700" />
                              </Show>
                            </button>
                          </div>
                        </td>

                        <td class="px-3 py-2.5 text-right align-middle tabular-nums">
                          <button
                            type="button"
                            disabled={!props.canPrice || p.is_archived}
                            onClick={() => openQuickPriceForProduct(p)}
                            title={
                              isMulti()
                                ? "Expandir variações para editar preços individuais"
                                : "Edição rápida de preço"
                            }
                            class="inline-flex flex-col items-end rounded px-1.5 py-0.5 text-right hover:bg-purple-50 hover:text-[#93509e] disabled:cursor-default disabled:hover:bg-transparent"
                          >
                            <span class="font-semibold text-zinc-900">
                              {priceInfo().primary}
                            </span>
                            <Show when={priceInfo().secondary}>
                              <span class="text-[11px] text-zinc-500">
                                {priceInfo().secondary}
                              </span>
                            </Show>
                          </button>
                        </td>

                        <td class="px-3 py-2.5 text-right align-middle tabular-nums">
                          <button
                            type="button"
                            disabled={!props.canStock || p.is_archived}
                            onClick={() => openQuickStockForProduct(p)}
                            title={
                              isMulti()
                                ? "Expandir variações para ajustar estoque por cor"
                                : "Ajustar estoque registrando movimentação"
                            }
                            class={`inline-flex flex-col items-end rounded px-2 py-0.5 text-right ${
                              totalAvail() <= 0
                                ? "bg-red-50 text-red-700 font-semibold"
                                : outOfStock()
                                  ? "bg-amber-50 text-amber-800 font-semibold"
                                  : "text-zinc-900 hover:bg-purple-50 hover:text-[#93509e]"
                            }`}
                          >
                            <span>{totalAvail()} un.</span>
                            <Show when={isMulti() && (summary()?.out_of_stock_count ?? 0) > 0}>
                              <span class="text-[10px] font-medium text-red-700">
                                {summary()?.out_of_stock_count} cor(es) esgotada(s)
                              </span>
                            </Show>
                          </button>
                        </td>

                        <td class="px-3 py-2.5 align-middle">
                          {renderStatusBadge(p)}
                        </td>

                        <td class="relative px-3 py-2.5 text-right align-middle">
                          <button
                            type="button"
                            aria-label={`Mais ações para ${p.name}`}
                            onClick={() =>
                              setOpenMenuId(openMenuId() === p.id ? null : p.id)
                            }
                            class="inline-flex h-8 w-8 items-center justify-center rounded border border-transparent text-zinc-500 hover:border-zinc-200 hover:bg-zinc-100 hover:text-zinc-900"
                          >
                            <MoreVertical class="h-4 w-4" />
                          </button>
                          <Show when={openMenuId() === p.id}>
                            <div class="absolute right-3 top-10 z-30 w-52 rounded-lg border border-zinc-200 bg-white py-1 text-left text-xs shadow-md">
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  props.onEditProduct(p.id);
                                }}
                                class="flex w-full items-center gap-2 px-3 py-2 hover:bg-zinc-50"
                              >
                                <Pencil class="h-3.5 w-3.5 text-zinc-500" />
                                Editar cadastro completo
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  props.onDuplicateProduct(p.id);
                                }}
                                class="flex w-full items-center gap-2 px-3 py-2 hover:bg-zinc-50"
                              >
                                <CopyPlus class="h-3.5 w-3.5 text-zinc-500" />
                                Duplicar como novo
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  props.onOpenBulkGridForProduct(p.id);
                                }}
                                class="flex w-full items-center gap-2 px-3 py-2 hover:bg-zinc-50"
                              >
                                <Pencil class="h-3.5 w-3.5 text-zinc-500" />
                                Editar variações na grade
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  props.onOpenReceipts();
                                }}
                                class="flex w-full items-center gap-2 px-3 py-2 hover:bg-zinc-50"
                              >
                                <PackagePlus class="h-3.5 w-3.5 text-zinc-500" />
                                Recebimento de mercadorias
                              </button>
                              <Show when={props.canWrite}>
                                <div class="my-1 border-t border-zinc-100" />
                                <Show
                                  when={!p.is_archived}
                                  fallback={
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        props.onLifecycleAction([p.id], "restore");
                                      }}
                                      class="flex w-full items-center gap-2 px-3 py-2 text-[#93509e] hover:bg-purple-50"
                                    >
                                      <RotateCcw class="h-3.5 w-3.5" />
                                      Restaurar produto
                                    </button>
                                  }
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      props.onLifecycleAction([p.id], "archive");
                                    }}
                                    class="flex w-full items-center gap-2 px-3 py-2 text-zinc-700 hover:bg-zinc-50"
                                  >
                                    <Archive class="h-3.5 w-3.5" />
                                    Arquivar produto
                                  </button>
                                </Show>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    props.onLifecycleAction([p.id], "delete");
                                  }}
                                  class="flex w-full items-center gap-2 px-3 py-2 text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 class="h-3.5 w-3.5" />
                                  Excluir permanentemente
                                </button>
                              </Show>
                            </div>
                          </Show>
                        </td>
                      </tr>

                      {/* Expandable variation rows */}
                      <Show when={isMulti() && isExpanded(p.id)}>
                        <For each={p.variants ?? []}>
                          {(v) => {
                            const vAvail = () =>
                              Math.max(0, v.stock_qty - v.reserved_qty);
                            return (
                              <tr class="bg-zinc-50/70 text-xs text-zinc-700">
                                <td class="px-3 py-2" />
                                <td class="px-3 py-2 pl-9">
                                  <div class="flex items-center gap-2">
                                    <span
                                      class="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-zinc-300"
                                      style={{
                                        "background-color":
                                          v.color_hex || "#e4e4e7",
                                      }}
                                    />
                                    <span class="font-medium text-zinc-900">
                                      {v.name}
                                    </span>
                                    <Show when={v.shade_code}>
                                      <span class="text-zinc-500">
                                        ({v.shade_code})
                                      </span>
                                    </Show>
                                  </div>
                                </td>
                                <td class="px-3 py-2 font-mono text-[11px]">
                                  <div class="inline-flex items-center gap-1">
                                    <span>{v.sku}</span>
                                    <button
                                      type="button"
                                      onClick={() => void copySku(v.sku)}
                                      aria-label={`Copiar SKU ${v.sku}`}
                                      class="rounded p-0.5 text-zinc-400 hover:text-zinc-800"
                                    >
                                      <Show
                                        when={copiedSku() === v.sku}
                                        fallback={<Copy class="h-3 w-3" />}
                                      >
                                        <Check class="h-3 w-3 text-emerald-700" />
                                      </Show>
                                    </button>
                                  </div>
                                </td>
                                <td class="px-3 py-2 text-right tabular-nums">
                                  <button
                                    type="button"
                                    disabled={!props.canPrice || p.is_archived}
                                    onClick={() => openQuickPriceForVariant(p, v)}
                                    class="rounded px-1.5 py-0.5 font-medium text-zinc-900 hover:bg-purple-50 hover:text-[#93509e]"
                                  >
                                    <Show
                                      when={
                                        v.promo_price_cents &&
                                        v.promo_price_cents < v.price_cents
                                      }
                                      fallback={formatBrlFromCents(v.price_cents)}
                                    >
                                      <span>
                                        {formatBrlFromCents(v.promo_price_cents)}{" "}
                                        <span class="text-[10px] text-zinc-400 line-through">
                                          {formatBrlFromCents(v.price_cents)}
                                        </span>
                                      </span>
                                    </Show>
                                  </button>
                                </td>
                                <td class="px-3 py-2 text-right tabular-nums">
                                  <button
                                    type="button"
                                    disabled={!props.canStock || p.is_archived}
                                    onClick={() => openQuickStockForVariant(p, v)}
                                    class={`rounded px-1.5 py-0.5 ${
                                      vAvail() <= 0
                                        ? "bg-red-50 font-semibold text-red-700"
                                        : "hover:bg-purple-50 hover:text-[#93509e]"
                                    }`}
                                  >
                                    {vAvail()} un. disp.
                                    <Show when={v.reserved_qty > 0}>
                                      <span class="ml-1 text-[10px] text-zinc-500">
                                        ({v.reserved_qty} res.)
                                      </span>
                                    </Show>
                                  </button>
                                </td>
                                <td class="px-3 py-2 text-[11px] text-zinc-500">
                                  {v.is_active ? "Ativa" : "Inativa"}
                                </td>
                                <td class="px-3 py-2 text-right" />
                              </tr>
                            );
                          }}
                        </For>
                      </Show>
                    </>
                  );
                }}
              </For>
            </Show>
          </tbody>
        </table>
      </div>

      {/* Mobile compact list (360px / 390px) with zero horizontal scroll */}
      <div class="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white md:hidden">
        <Show
          when={props.products.length > 0}
          fallback={
            <p class="px-4 py-8 text-center text-sm text-zinc-500">
              Nenhum produto encontrado.
            </p>
          }
        >
          <div class="flex items-center justify-between bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
            <label class="inline-flex items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={allPageChecked()}
                onChange={() => props.onTogglePage()}
                class="h-4 w-4 accent-[#93509e]"
              />
              Selecionar {props.products.length} da página
            </label>
          </div>
          <For each={props.products}>
            {(p) => {
              const summary = () => p.variants_summary;
              const isMulti = () => (p.variants?.length ?? 0) > 1;
              const avail = () =>
                summary()?.total_available ??
                (p.variants?.[0]
                  ? Math.max(
                      0,
                      p.variants[0].stock_qty - p.variants[0].reserved_qty,
                    )
                  : 0);
              const priceInfo = () => formatProductPriceRange(p);

              return (
                <div class="px-3 py-2.5">
                  <div class="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${p.name}`}
                      checked={isRowSelected(p.id)}
                      onChange={() => props.onToggleOne(p.id)}
                      class="mt-1 h-4 w-4 shrink-0 accent-[#93509e]"
                    />
                    <div class="min-w-0 flex-1">
                      <div class="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => props.onEditProduct(p.id)}
                          class="text-left text-sm font-semibold leading-snug text-zinc-900 hover:text-[#93509e]"
                        >
                          {p.name}
                        </button>
                        <button
                          type="button"
                          aria-label={`Ações de ${p.name}`}
                          onClick={() =>
                            setOpenMenuId(openMenuId() === p.id ? null : p.id)
                          }
                          class="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-100"
                        >
                          <MoreVertical class="h-4 w-4" />
                        </button>
                      </div>

                      <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
                        <span class="font-mono text-[11px] text-zinc-700">
                          {p.sku}
                        </span>
                        <span>·</span>
                        {renderStatusBadge(p)}
                        <Show when={isMulti()}>
                          <button
                            type="button"
                            onClick={() => toggleExpand(p.id)}
                            class="font-semibold text-[#93509e]"
                          >
                            {p.variants?.length} cores
                          </button>
                        </Show>
                      </div>

                      <div class="mt-2 flex items-center justify-between gap-2 text-xs tabular-nums">
                        <button
                          type="button"
                          disabled={!props.canPrice || p.is_archived}
                          onClick={() => openQuickPriceForProduct(p)}
                          class="rounded border border-zinc-200 px-2.5 py-1 font-semibold text-zinc-900 active:bg-purple-50"
                        >
                          {priceInfo().primary}
                        </button>
                        <button
                          type="button"
                          disabled={!props.canStock || p.is_archived}
                          onClick={() => openQuickStockForProduct(p)}
                          class={`rounded border px-2.5 py-1 font-semibold ${
                            avail() <= 0
                              ? "border-red-200 bg-red-50 text-red-700"
                              : "border-zinc-200 text-zinc-800 active:bg-purple-50"
                          }`}
                        >
                          Saldo: {avail()} un.
                        </button>
                      </div>

                      <Show when={openMenuId() === p.id}>
                        <div class="mt-2 flex flex-wrap gap-1.5 border-t border-zinc-100 pt-2 text-xs">
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuId(null);
                              props.onDuplicateProduct(p.id);
                            }}
                            class="rounded border border-zinc-200 px-2 py-1"
                          >
                            Duplicar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuId(null);
                              props.onOpenBulkGridForProduct(p.id);
                            }}
                            class="rounded border border-zinc-200 px-2 py-1"
                          >
                            Grade
                          </button>
                          <Show when={props.canWrite}>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                props.onLifecycleAction(
                                  [p.id],
                                  p.is_archived ? "restore" : "archive",
                                );
                              }}
                              class="rounded border border-zinc-200 px-2 py-1"
                            >
                              {p.is_archived ? "Restaurar" : "Arquivar"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                props.onLifecycleAction([p.id], "delete");
                              }}
                              class="rounded border border-red-200 px-2 py-1 text-red-700"
                            >
                              Excluir
                            </button>
                          </Show>
                        </div>
                      </Show>

                      <Show when={isMulti() && isExpanded(p.id)}>
                        <div class="mt-2 space-y-1.5 border-t border-zinc-100 pt-2">
                          <For each={p.variants ?? []}>
                            {(v) => (
                              <div class="flex items-center justify-between gap-2 text-xs">
                                <div class="min-w-0">
                                  <p class="truncate font-medium text-zinc-800">
                                    {v.name}
                                  </p>
                                  <p class="font-mono text-[10px] text-zinc-500">
                                    {v.sku}
                                  </p>
                                </div>
                                <div class="flex shrink-0 items-center gap-1.5 tabular-nums">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openQuickPriceForVariant(p, v)
                                    }
                                    class="rounded border border-zinc-200 px-2 py-0.5 text-[11px] font-medium"
                                  >
                                    {formatBrlFromCents(
                                      v.promo_price_cents &&
                                        v.promo_price_cents < v.price_cents
                                        ? v.promo_price_cents
                                        : v.price_cents,
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openQuickStockForVariant(p, v)
                                    }
                                    class="rounded border border-zinc-200 px-2 py-0.5 text-[11px] font-medium"
                                  >
                                    {Math.max(0, v.stock_qty - v.reserved_qty)}{" "}
                                    un.
                                  </button>
                                </div>
                              </div>
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>
                  </div>
                </div>
              );
            }}
          </For>
        </Show>
      </div>

      {/* Quick Price Sheet / Modal */}
      <Show when={priceTarget()}>
        {(target) => (
          <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
            <form
              onSubmit={(e) => void saveQuickPrice(e)}
              class="w-full max-w-md rounded-t-xl border border-zinc-200 bg-white sm:rounded-xl"
            >
              <div class="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
                <div class="min-w-0">
                  <h3 class="truncate text-sm font-bold text-zinc-900">
                    Ajustar preço — {target().sku}
                  </h3>
                  <p class="truncate text-xs text-zinc-500">{target().name}</p>
                </div>
                <button
                  type="button"
                  aria-label="Fechar janela de preço"
                  onClick={() => setPriceTarget(null)}
                  class="rounded p-1 text-zinc-500 hover:bg-zinc-100"
                >
                  <X class="h-4 w-4" />
                </button>
              </div>
              <div class="space-y-3 p-4 text-sm">
                <Show when={priceError()}>
                  <div class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                    {priceError()}
                  </div>
                </Show>
                <div>
                  <label class="block text-xs font-semibold text-zinc-700">
                    Preço de venda (R$)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={priceInput()}
                    onInput={(e) => setPriceInput(e.currentTarget.value)}
                    class="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-right font-semibold tabular-nums focus:border-[#93509e] focus:outline-none"
                  />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-zinc-700">
                    Preço promocional (R$) — opcional
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    disabled={clearPromo()}
                    value={clearPromo() ? "" : promoInput()}
                    onInput={(e) => setPromoInput(e.currentTarget.value)}
                    placeholder="Ex.: 19,90"
                    class="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-right tabular-nums focus:border-[#93509e] focus:outline-none disabled:bg-zinc-100"
                  />
                  <label class="mt-2 inline-flex items-center gap-2 text-xs text-zinc-700">
                    <input
                      type="checkbox"
                      checked={clearPromo()}
                      onChange={(e) => setClearPromo(e.currentTarget.checked)}
                      class="accent-[#93509e]"
                    />
                    Remover preço promocional
                  </label>
                </div>
              </div>
              <div class="sticky bottom-0 flex justify-end gap-2 border-t border-zinc-200 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  onClick={() => setPriceTarget(null)}
                  class="rounded-md border border-zinc-300 px-3.5 py-2 text-xs font-semibold text-zinc-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={priceBusy()}
                  class="rounded-md bg-[#93509e] px-4 py-2 text-xs font-bold text-white hover:bg-[#7c3f87] disabled:opacity-60"
                >
                  {priceBusy() ? "Salvando..." : "Salvar preço"}
                </button>
              </div>
            </form>
          </div>
        )}
      </Show>

      {/* Quick Stock Adjustment Sheet / Modal showing Saldo Atual -> Operação -> Resultante */}
      <Show when={stockTarget()}>
        {(target) => (
          <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
            <form
              onSubmit={(e) => void saveQuickStock(e)}
              class="w-full max-w-md rounded-t-xl border border-zinc-200 bg-white sm:rounded-xl"
            >
              <div class="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
                <div class="min-w-0">
                  <h3 class="truncate text-sm font-bold text-zinc-900">
                    Ajustar estoque — {target().sku}
                  </h3>
                  <p class="truncate text-xs text-zinc-500">
                    {target().productName} ({target().variantName})
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Fechar janela de estoque"
                  onClick={() => setStockTarget(null)}
                  class="rounded p-1 text-zinc-500 hover:bg-zinc-100"
                >
                  <X class="h-4 w-4" />
                </button>
              </div>

              <div class="space-y-3 p-4 text-sm">
                <Show when={stockError()}>
                  <div class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                    {stockError()}
                    <Show when={stockConflict()}>
                      {(c) => (
                        <p class="mt-1 font-semibold">
                          Saldo atualizado no servidor: {c().current_stock_qty}{" "}
                          un. físicos ({c().current_available_qty} disp.).
                        </p>
                      )}
                    </Show>
                  </div>
                </Show>

                <div class="grid grid-cols-3 gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setStockOp("set")}
                    class={`rounded px-2 py-1.5 font-semibold ${
                      stockOp() === "set"
                        ? "bg-[#93509e] text-white"
                        : "text-zinc-700"
                    }`}
                  >
                    Definir saldo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStockOp("add");
                      setStockQtyInput("5");
                    }}
                    class={`rounded px-2 py-1.5 font-semibold ${
                      stockOp() === "add"
                        ? "bg-[#93509e] text-white"
                        : "text-zinc-700"
                    }`}
                  >
                    Adicionar (+)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStockOp("subtract");
                      setStockQtyInput("1");
                    }}
                    class={`rounded px-2 py-1.5 font-semibold ${
                      stockOp() === "subtract"
                        ? "bg-[#93509e] text-white"
                        : "text-zinc-700"
                    }`}
                  >
                    Retirar (-)
                  </button>
                </div>

                <div>
                  <label class="block text-xs font-semibold text-zinc-700">
                    {stockOp() === "set"
                      ? "Novo saldo físico total"
                      : "Quantidade de unidades"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={stockQtyInput()}
                    onInput={(e) => setStockQtyInput(e.currentTarget.value)}
                    class="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-right font-semibold tabular-nums focus:border-[#93509e] focus:outline-none"
                  />
                </div>

                <div class="grid grid-cols-3 gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 text-center text-xs tabular-nums">
                  <div>
                    <p class="text-[11px] text-zinc-500">Saldo atual</p>
                    <p class="font-bold text-zinc-900">{target().stockQty} un.</p>
                  </div>
                  <div>
                    <p class="text-[11px] text-zinc-500">Operação</p>
                    <p class="font-semibold text-[#93509e]">
                      {stockOp() === "set"
                        ? "Definir"
                        : stockOp() === "add"
                          ? `+${Number.parseInt(stockQtyInput() || "0", 10) || 0}`
                          : `-${Number.parseInt(stockQtyInput() || "0", 10) || 0}`}
                    </p>
                  </div>
                  <div>
                    <p class="text-[11px] text-zinc-500">Saldo resultante</p>
                    <p
                      class={`font-bold ${
                        resultingStockQty() < target().reservedQty
                          ? "text-red-700"
                          : "text-zinc-900"
                      }`}
                    >
                      {resultingStockQty()} un.
                    </p>
                  </div>
                </div>

                <div>
                  <label class="block text-xs font-semibold text-zinc-700">
                    Motivo da movimentação
                  </label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    value={stockReason()}
                    onInput={(e) => setStockReason(e.currentTarget.value)}
                    class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-xs focus:border-[#93509e] focus:outline-none"
                  />
                </div>
              </div>

              <div class="sticky bottom-0 flex justify-end gap-2 border-t border-zinc-200 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  onClick={() => setStockTarget(null)}
                  class="rounded-md border border-zinc-300 px-3.5 py-2 text-xs font-semibold text-zinc-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={stockBusy()}
                  class="rounded-md bg-[#93509e] px-4 py-2 text-xs font-bold text-white hover:bg-[#7c3f87] disabled:opacity-60"
                >
                  {stockBusy() ? "Registrando..." : "Confirmar ajuste"}
                </button>
              </div>
            </form>
          </div>
        )}
      </Show>
    </div>
  );
}
