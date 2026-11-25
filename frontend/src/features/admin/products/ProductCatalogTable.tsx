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
import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { ApiError, api } from "../../../lib/api";
import { assetUrl } from "../../../lib/format";
import { AdminButton, AdminField, AdminInput, AdminModal } from "../ui";
import {
  type AdminProductRow,
  type AdminVariantRow,
  formatBrlFromCents,
  formatProductPriceRange,
  parseBrlInputToCents,
} from "./types";

interface QuickPriceTarget {
  productId: number;
  kind: "product" | "variant";
  id: number;
  name: string;
  sku: string;
  priceCents: number;
  promoPriceCents: number | null;
  updatedAt?: string;
}

interface QuickStockTarget {
  productId: number;
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
  highlightedId?: number | null;
  onHighlightRow?: (productId: number) => void;
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
  const [expandedProductIds, setExpandedProductIds] = createSignal<number[]>(
    [],
  );
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

  // Close row action popover on Escape or outside click
  createEffect(() => {
    if (openMenuId() === null) return;
    const onOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest("[data-row-menu-root]")) {
        setOpenMenuId(null);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenuId(null);
    };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEsc);
    onCleanup(() => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEsc);
    });
  });

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
      productId: p.id,
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
      productId: p.id,
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
    if (!target || priceBusy()) return;
    const priceCents = parseBrlInputToCents(priceInput());
    if (priceCents <= 0) {
      setPriceError("Informe um preço de venda maior que zero.");
      return;
    }
    const promoCents = clearPromo()
      ? null
      : promoInput().trim()
        ? parseBrlInputToCents(promoInput())
        : null;
    if (promoCents !== null && (promoCents <= 0 || promoCents >= priceCents)) {
      setPriceError(
        "O preço promocional deve ser maior que zero e menor que o preço normal.",
      );
      return;
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
          promo_price_cents: promoCents,
          clear_promo: clearPromo(),
          expected_updated_at: target.updatedAt,
        },
      });
      setPriceTarget(null);
      props.onHighlightRow?.(target.productId);
      await props.onReload();
    } catch (err) {
      setPriceError(
        err instanceof ApiError ? err.message : "Erro ao atualizar preço.",
      );
    } finally {
      setPriceBusy(false);
    }
  }

  function openQuickStockForProduct(p: AdminProductRow) {
    const v = p.variants?.[0];
    if ((p.variants?.length ?? 0) > 1) {
      if (!isExpanded(p.id)) toggleExpand(p.id);
      return;
    }
    if (!v) return;
    openQuickStockForVariant(p, v);
  }

  function openQuickStockForVariant(p: AdminProductRow, v: AdminVariantRow) {
    setStockTarget({
      productId: p.id,
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
    if (!target || stockBusy()) return;
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
      props.onHighlightRow?.(target.productId);
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
        <span class="inline-flex items-center rounded-[6px] border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700">
          Arquivado
        </span>
      );
    }
    if (!p.is_active) {
      return (
        <span class="inline-flex items-center rounded-[6px] border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
          Inativo
        </span>
      );
    }
    return (
      <span class="inline-flex items-center rounded-[6px] border border-[#e4c6ea] bg-[#f5ebf7] px-2 py-0.5 text-[11px] font-medium text-[#62298d]">
        Ativo
      </span>
    );
  }

  return (
    <div class="space-y-3">
      {/* Page vs All Results selection banner */}
      <Show
        when={
          allPageChecked() &&
          props.totalResults > props.products.length &&
          !props.selectAllMatching
        }
      >
        <div class="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[#e4c6ea] bg-[#f5ebf7]/70 px-3.5 py-2 text-xs text-zinc-800">
          <span>
            Os <strong>{props.products.length}</strong> produtos desta página
            estão selecionados.
          </span>
          <button
            type="button"
            onClick={() => props.onSelectAllMatching()}
            class="font-semibold text-[#62298d] underline hover:text-[#93509e]"
          >
            Selecionar todos os {props.totalResults} resultados
          </button>
        </div>
      </Show>

      <Show when={props.selectAllMatching}>
        <div class="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[#93509e] bg-[#f5ebf7] px-3.5 py-2 text-xs text-zinc-900">
          <span>
            <strong>
              Todos os{" "}
              {Math.max(0, props.totalResults - props.excludedIds.length)}
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

      {/* Desktop compact table: Seleção | Produto e SKU | Preço | Estoque | Situação | Ações */}
      <div class="hidden overflow-x-auto rounded-[12px] border border-zinc-200/90 bg-white md:block">
        <table class="w-full border-collapse text-left text-sm">
          <thead>
            <tr class="border-b border-zinc-200 bg-zinc-50/80 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
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
              <th class="px-3 py-2.5">Produto e SKU</th>
              <th class="w-36 px-3 py-2.5 text-right">Preço</th>
              <th class="w-32 px-3 py-2.5 text-right">Estoque</th>
              <th class="w-28 px-3 py-2.5">Situação</th>
              <th class="w-16 px-3 py-2.5 text-right">Ações</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-100">
            <Show
              when={props.products.length > 0}
              fallback={
                <tr>
                  <td
                    colspan={6}
                    class="px-4 py-12 text-center text-sm text-zinc-500"
                  >
                    Nenhum produto corresponde aos filtros atuais.
                  </td>
                </tr>
              }
            >
              <For each={props.products}>
                {(p, rowIdx) => {
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
                    totalAvail() <= 0 ||
                    (summary()?.out_of_stock_count ?? 0) > 0;
                  const priceInfo = () => formatProductPriceRange(p);
                  const openUp = () =>
                    props.products.length >= 4 &&
                    rowIdx() >= props.products.length - 2;

                  return (
                    <>
                      <tr
                        class={`transition-colors hover:bg-zinc-50/80 ${
                          props.highlightedId === p.id
                            ? "adm-row-saved"
                            : isRowSelected(p.id)
                              ? "bg-[#f5ebf7]/50"
                              : ""
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

                        {/* Foto + Nome + SKU + Marca/Variações na mesma célula */}
                        <td class="px-3 py-2.5 align-middle">
                          <div class="flex min-w-0 items-center gap-3">
                            <img
                              src={assetUrl(p.images?.[0]?.path)}
                              alt={p.name}
                              class="h-10 w-10 shrink-0 rounded-[8px] border border-zinc-200 bg-zinc-50 object-contain"
                            />
                            <div class="min-w-0 flex-1">
                              <button
                                type="button"
                                onClick={() => props.onEditProduct(p.id)}
                                class="block max-w-full truncate text-left font-semibold text-zinc-900 hover:text-[#62298d] hover:underline"
                              >
                                {p.name}
                              </button>
                              <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-zinc-500">
                                <span class="inline-flex items-center gap-1 font-mono text-zinc-700">
                                  <span>{p.sku}</span>
                                  <button
                                    type="button"
                                    onClick={() => void copySku(p.sku)}
                                    aria-label={`Copiar SKU ${p.sku}`}
                                    class="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800"
                                  >
                                    <Show
                                      when={copiedSku() === p.sku}
                                      fallback={<Copy class="h-3 w-3" />}
                                    >
                                      <Check class="h-3 w-3 text-emerald-700" />
                                    </Show>
                                  </button>
                                </span>
                                <Show when={p.brand?.name}>
                                  <span>· {p.brand?.name}</span>
                                </Show>
                                <Show when={isMulti()}>
                                  <button
                                    type="button"
                                    onClick={() => toggleExpand(p.id)}
                                    class="inline-flex items-center gap-0.5 font-semibold text-[#62298d] hover:underline"
                                  >
                                    <Show
                                      when={isExpanded(p.id)}
                                      fallback={
                                        <ChevronRight class="h-3.5 w-3.5" />
                                      }
                                    >
                                      <ChevronDown class="h-3.5 w-3.5" />
                                    </Show>
                                    {p.variants?.length} variações
                                  </button>
                                </Show>
                                <Show when={p.power_watts}>
                                  <span>· {p.power_watts}W</span>
                                </Show>
                              </div>
                            </div>
                          </div>
                        </td>

                        <td class="adm-tabular px-3 py-2.5 text-right align-middle">
                          <button
                            type="button"
                            disabled={!props.canPrice || p.is_archived}
                            onClick={() => openQuickPriceForProduct(p)}
                            title={
                              isMulti()
                                ? "Expandir variações para editar preços individuais"
                                : "Edição rápida de preço"
                            }
                            class="inline-flex flex-col items-end rounded-[6px] px-2 py-1 text-right hover:bg-[#f5ebf7] hover:text-[#62298d] disabled:cursor-default disabled:hover:bg-transparent"
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

                        <td class="adm-tabular px-3 py-2.5 text-right align-middle">
                          <button
                            type="button"
                            disabled={!props.canStock || p.is_archived}
                            onClick={() => openQuickStockForProduct(p)}
                            title={
                              isMulti()
                                ? "Expandir variações para ajustar estoque por cor"
                                : `Ajustar estoque de ${p.name}`
                            }
                            class={`inline-flex flex-col items-end rounded-[6px] px-2 py-1 text-right font-medium ${
                              totalAvail() <= 0
                                ? "bg-red-50 font-semibold text-red-700"
                                : outOfStock()
                                  ? "bg-amber-50 font-semibold text-amber-800"
                                  : "text-zinc-900 hover:bg-[#f5ebf7] hover:text-[#62298d]"
                            }`}
                          >
                            <span>{totalAvail()} un.</span>
                            <Show
                              when={
                                isMulti() &&
                                (summary()?.out_of_stock_count ?? 0) > 0
                              }
                            >
                              <span class="text-[10px] font-medium text-red-700">
                                {summary()?.out_of_stock_count} esgotada(s)
                              </span>
                            </Show>
                          </button>
                        </td>

                        <td class="px-3 py-2.5 align-middle">
                          {renderStatusBadge(p)}
                        </td>

                        <td
                          data-row-menu-root
                          class="relative px-3 py-2.5 text-right align-middle"
                        >
                          <button
                            type="button"
                            aria-expanded={openMenuId() === p.id}
                            aria-label={`Mais ações para ${p.name}`}
                            onClick={() =>
                              setOpenMenuId(openMenuId() === p.id ? null : p.id)
                            }
                            class="adm-btn inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-transparent text-zinc-500 hover:border-zinc-200 hover:bg-zinc-100 hover:text-zinc-900"
                          >
                            <MoreVertical class="h-4 w-4" />
                          </button>

                          <Show when={openMenuId() === p.id}>
                            <div
                              role="menu"
                              style={{ "box-shadow": "var(--adm-shadow-popover)" }}
                              class={`absolute right-3 z-40 w-56 rounded-[10px] border border-zinc-200 bg-white py-1 text-left text-xs ${
                                openUp() ? "bottom-10" : "top-10"
                              }`}
                            >
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  props.onEditProduct(p.id);
                                }}
                                class="flex w-full items-center gap-2 px-3 py-2 text-zinc-800 hover:bg-zinc-50"
                              >
                                <Pencil class="h-3.5 w-3.5 text-zinc-500" />
                                Editar cadastro completo
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  props.onDuplicateProduct(p.id);
                                }}
                                class="flex w-full items-center gap-2 px-3 py-2 text-zinc-800 hover:bg-zinc-50"
                              >
                                <CopyPlus class="h-3.5 w-3.5 text-zinc-500" />
                                Duplicar como novo
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  props.onOpenBulkGridForProduct(p.id);
                                }}
                                class="flex w-full items-center gap-2 px-3 py-2 text-zinc-800 hover:bg-zinc-50"
                              >
                                <Pencil class="h-3.5 w-3.5 text-zinc-500" />
                                Editar variações na grade
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  props.onOpenReceipts();
                                }}
                                class="flex w-full items-center gap-2 px-3 py-2 text-zinc-800 hover:bg-zinc-50"
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
                                      role="menuitem"
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        props.onLifecycleAction(
                                          [p.id],
                                          "restore",
                                        );
                                      }}
                                      class="flex w-full items-center gap-2 px-3 py-2 text-[#62298d] hover:bg-[#f5ebf7]"
                                    >
                                      <RotateCcw class="h-3.5 w-3.5" />
                                      Restaurar produto
                                    </button>
                                  }
                                >
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      props.onLifecycleAction(
                                        [p.id],
                                        "archive",
                                      );
                                    }}
                                    class="flex w-full items-center gap-2 px-3 py-2 text-zinc-700 hover:bg-zinc-50"
                                  >
                                    <Archive class="h-3.5 w-3.5" />
                                    Arquivar produto
                                  </button>
                                </Show>
                                <button
                                  type="button"
                                  role="menuitem"
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
                                  <div class="flex flex-wrap items-center gap-2">
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
                                    <span class="inline-flex items-center gap-1 font-mono text-[11px] text-zinc-600">
                                      <span>· {v.sku}</span>
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
                                    </span>
                                  </div>
                                </td>
                                <td class="adm-tabular px-3 py-2 text-right">
                                  <button
                                    type="button"
                                    disabled={!props.canPrice || p.is_archived}
                                    onClick={() =>
                                      openQuickPriceForVariant(p, v)
                                    }
                                    class="rounded-[6px] px-2 py-0.5 font-medium text-zinc-900 hover:bg-[#f5ebf7] hover:text-[#62298d]"
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
                                <td class="adm-tabular px-3 py-2 text-right">
                                  <button
                                    type="button"
                                    disabled={!props.canStock || p.is_archived}
                                    onClick={() =>
                                      openQuickStockForVariant(p, v)
                                    }
                                    class={`rounded-[6px] px-2 py-0.5 ${
                                      vAvail() <= 0
                                        ? "bg-red-50 font-semibold text-red-700"
                                        : "hover:bg-[#f5ebf7] hover:text-[#62298d]"
                                    }`}
                                  >
                                    {vAvail()} un.
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
      <div class="divide-y divide-zinc-200 rounded-[12px] border border-zinc-200 bg-white md:hidden">
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
                <div
                  class={`px-3 py-2.5 ${
                    props.highlightedId === p.id ? "adm-row-saved" : ""
                  }`}
                >
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
                          class="text-left text-sm font-semibold leading-snug text-zinc-900 hover:text-[#62298d]"
                        >
                          {p.name}
                        </button>
                        <button
                          type="button"
                          aria-label={`Ações de ${p.name}`}
                          onClick={() =>
                            setOpenMenuId(openMenuId() === p.id ? null : p.id)
                          }
                          class="shrink-0 rounded-[8px] p-1 text-zinc-500 hover:bg-zinc-100"
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
                            class="font-semibold text-[#62298d]"
                          >
                            {p.variants?.length} cores
                          </button>
                        </Show>
                      </div>

                      <div class="adm-tabular mt-2 flex items-center justify-between gap-2 text-xs">
                        <button
                          type="button"
                          disabled={!props.canPrice || p.is_archived}
                          onClick={() => openQuickPriceForProduct(p)}
                          class="rounded-[8px] border border-zinc-200 px-2.5 py-1 font-semibold text-zinc-900 active:bg-[#f5ebf7]"
                        >
                          {priceInfo().primary}
                        </button>
                        <button
                          type="button"
                          disabled={!props.canStock || p.is_archived}
                          onClick={() => openQuickStockForProduct(p)}
                          class={`rounded-[8px] border px-2.5 py-1 font-semibold ${
                            avail() <= 0
                              ? "border-red-200 bg-red-50 text-red-700"
                              : "border-zinc-200 text-zinc-800 active:bg-[#f5ebf7]"
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
                            class="rounded-[8px] border border-zinc-200 px-2.5 py-1"
                          >
                            Duplicar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuId(null);
                              props.onOpenBulkGridForProduct(p.id);
                            }}
                            class="rounded-[8px] border border-zinc-200 px-2.5 py-1"
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
                              class="rounded-[8px] border border-zinc-200 px-2.5 py-1"
                            >
                              {p.is_archived ? "Restaurar" : "Arquivar"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                props.onLifecycleAction([p.id], "delete");
                              }}
                              class="rounded-[8px] border border-red-200 px-2.5 py-1 text-red-700"
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
                                <div class="adm-tabular flex shrink-0 items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openQuickPriceForVariant(p, v)
                                    }
                                    class="rounded-[6px] border border-zinc-200 px-2 py-0.5 text-[11px] font-medium"
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
                                    class="rounded-[6px] border border-zinc-200 px-2 py-0.5 text-[11px] font-medium"
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

      {/* Quick Price Accessible Modal */}
      <AdminModal
        open={Boolean(priceTarget())}
        title={`Ajustar preço — ${priceTarget()?.sku ?? ""}`}
        subtitle={priceTarget()?.name}
        maxWidthClass="max-w-md"
        closeLabel="Fechar janela de preço"
        onClose={() => setPriceTarget(null)}
        footer={
          <>
            <AdminButton
              variant="secondary"
              onClick={() => setPriceTarget(null)}
            >
              Cancelar
            </AdminButton>
            <AdminButton
              type="submit"
              form="adm-quick-price-form"
              variant="primary"
              loading={priceBusy()}
              loadingLabel="Salvando…"
            >
              Salvar preço
            </AdminButton>
          </>
        }
      >
        <form
          id="adm-quick-price-form"
          onSubmit={(e) => void saveQuickPrice(e)}
          class="space-y-3"
        >
          <Show when={priceError()}>
            <div
              role="alert"
              class="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
            >
              {priceError()}
            </div>
          </Show>
          <AdminField label="Preço de venda (R$)" forId="qp-sale-input">
            <AdminInput
              id="qp-sale-input"
              data-autofocus
              type="text"
              inputMode="decimal"
              value={priceInput()}
              onInput={(e) => setPriceInput(e.currentTarget.value)}
              class="adm-tabular text-right font-semibold"
            />
          </AdminField>

          <AdminField
            label="Preço promocional (R$) — opcional"
            forId="qp-promo-input"
          >
            <AdminInput
              id="qp-promo-input"
              type="text"
              inputMode="decimal"
              disabled={clearPromo()}
              value={clearPromo() ? "" : promoInput()}
              onInput={(e) => setPromoInput(e.currentTarget.value)}
              placeholder="Ex.: 19,90"
              class="adm-tabular text-right"
            />
          </AdminField>

          <label class="inline-flex items-center gap-2 text-xs text-zinc-700">
            <input
              type="checkbox"
              checked={clearPromo()}
              onChange={(e) => setClearPromo(e.currentTarget.checked)}
              class="accent-[#93509e]"
            />
            Remover preço promocional
          </label>
        </form>
      </AdminModal>

      {/* Quick Stock Adjustment Modal */}
      <AdminModal
        open={Boolean(stockTarget())}
        title={`Ajustar estoque de ${stockTarget()?.productName ?? ""}`}
        subtitle={
          stockTarget()
            ? `${stockTarget()!.variantName} · SKU ${stockTarget()!.sku}`
            : undefined
        }
        maxWidthClass="max-w-md"
        closeLabel="Fechar janela de estoque"
        onClose={() => setStockTarget(null)}
        footer={
          <>
            <AdminButton
              variant="secondary"
              onClick={() => setStockTarget(null)}
            >
              Cancelar
            </AdminButton>
            <AdminButton
              type="submit"
              form="adm-quick-stock-form"
              variant="primary"
              loading={stockBusy()}
              loadingLabel="Salvando…"
            >
              Confirmar ajuste
            </AdminButton>
          </>
        }
      >
        <form
          id="adm-quick-stock-form"
          onSubmit={(e) => void saveQuickStock(e)}
          class="space-y-3"
        >
          <Show when={stockError()}>
            <div
              role="alert"
              class="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
            >
              {stockError()}
              <Show when={stockConflict()}>
                {(c) => (
                  <p class="mt-1 font-semibold">
                    Saldo atualizado no servidor: {c().current_stock_qty} un.
                    físicos ({c().current_available_qty} disp.).
                  </p>
                )}
              </Show>
            </div>
          </Show>

          <div class="grid grid-cols-3 gap-1.5 rounded-[8px] border border-zinc-200 bg-zinc-50 p-1 text-xs">
            <button
              type="button"
              onClick={() => setStockOp("set")}
              class={`adm-btn rounded-[6px] px-2 py-1.5 font-semibold ${
                stockOp() === "set"
                  ? "bg-[#93509e] text-white"
                  : "text-zinc-700 hover:bg-zinc-100"
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
              class={`adm-btn rounded-[6px] px-2 py-1.5 font-semibold ${
                stockOp() === "add"
                  ? "bg-[#93509e] text-white"
                  : "text-zinc-700 hover:bg-zinc-100"
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
              class={`adm-btn rounded-[6px] px-2 py-1.5 font-semibold ${
                stockOp() === "subtract"
                  ? "bg-[#93509e] text-white"
                  : "text-zinc-700 hover:bg-zinc-100"
              }`}
            >
              Retirar (-)
            </button>
          </div>

          <AdminField
            label={
              stockOp() === "set"
                ? "Novo saldo físico total"
                : "Quantidade de unidades"
            }
            forId="qs-qty-input"
          >
            <AdminInput
              id="qs-qty-input"
              data-autofocus
              type="number"
              min="0"
              inputMode="numeric"
              value={stockQtyInput()}
              onInput={(e) => setStockQtyInput(e.currentTarget.value)}
              class="adm-tabular text-right font-semibold"
            />
          </AdminField>

          <div class="adm-tabular grid grid-cols-3 gap-2 rounded-[8px] border border-zinc-200 bg-zinc-50 p-2.5 text-center text-xs">
            <div>
              <p class="text-[11px] text-zinc-500">Saldo atual</p>
              <p class="font-bold text-zinc-900">
                {stockTarget()?.stockQty ?? 0} un.
              </p>
            </div>
            <div>
              <p class="text-[11px] text-zinc-500">Operação</p>
              <p class="font-semibold text-[#62298d]">
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
                  resultingStockQty() < (stockTarget()?.reservedQty ?? 0)
                    ? "text-red-700"
                    : "text-zinc-900"
                }`}
              >
                {resultingStockQty()} un.
              </p>
            </div>
          </div>

          <AdminField label="Motivo da movimentação" forId="qs-reason-input">
            <AdminInput
              id="qs-reason-input"
              type="text"
              required
              minLength={3}
              value={stockReason()}
              onInput={(e) => setStockReason(e.currentTarget.value)}
            />
          </AdminField>
        </form>
      </AdminModal>
    </div>
  );
}
