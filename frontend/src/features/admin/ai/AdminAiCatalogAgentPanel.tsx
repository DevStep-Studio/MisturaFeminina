import { useNavigate } from "@tanstack/solid-router";
import AlertTriangle from "lucide-solid/icons/triangle-exclamation-point";
import CheckCircle2 from "lucide-solid/icons/circle-check";
import ClipboardText from "lucide-solid/icons/clipboard-list";
import FilePlus from "lucide-solid/icons/file-plus";
import FileSpreadsheet from "lucide-solid/icons/file-spreadsheet";
import ImageIcon from "lucide-solid/icons/image";
import Link2 from "lucide-solid/icons/link-2";
import Search from "lucide-solid/icons/search";
import Sparkles from "lucide-solid/icons/sparkles";
import Unlink from "lucide-solid/icons/unlink";
import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { ApiError, api } from "../../../lib/api";
import { assetUrl, formatCents } from "../../../lib/format";
import {
  formatCentsToBrInput,
  formatCostCentsToBrInput,
  parseBrazilianCostToCents,
  parseBrazilianPriceToCents,
} from "../admin-helpers";
import {
  type BrandOption,
  type CategoryOption,
  makeIdempotencyKey,
} from "../products/types";
import { buildCategoryHierarchyOptions } from "../categories/category-helpers";
import { AdminAiSingleProductLookup } from "./AdminAiSingleProductLookup";
import {
  type AiProductImportDetail,
  aiActionTypeLabel,
} from "./ai-types";

type PanelMode = "lookup" | "batch";
type EntryMode = "text" | "photo" | "spreadsheet";
type ReviewFilter = "all" | "ready" | "duplicates" | "review";

export function AdminAiCatalogAgentPanel(props: {
  initialImportId?: number | null;
  brands?: BrandOption[];
  categories?: CategoryOption[];
  canCostWrite?: boolean;
  onCommitted?: () => Promise<void> | void;
  onOpenExistingProduct?: (productId: number) => void;
  onProductSaved?: (
    savedProductId: number,
    productName: string,
    stayForNext: boolean,
  ) => Promise<void> | void;
}) {
  const navigate = useNavigate();
  const [panelMode, setPanelMode] = createSignal<PanelMode>(
    props.initialImportId ? "batch" : "lookup",
  );
  const [entryMode, setEntryMode] = createSignal<EntryMode>("spreadsheet");
  const [instruction, setInstruction] = createSignal("");
  const [rawText, setRawText] = createSignal("");
  const [selectedFiles, setSelectedFiles] = createSignal<File[]>([]);
  const [activeImportId, setActiveImportId] = createSignal<number | null>(
    props.initialImportId ?? null,
  );
  const [reviewFilter, setReviewFilter] = createSignal<ReviewFilter>("all");
  const [selectedItemIds, setSelectedItemIds] = createSignal<number[]>([]);
  const [focusedItemId, setFocusedItemId] = createSignal<number | null>(null);
  const [bulkBrandId, setBulkBrandId] = createSignal("");
  const [bulkCategoryId, setBulkCategoryId] = createSignal("");
  const [commitKey, setCommitKey] = createSignal(makeIdempotencyKey("ai-commit"));
  const [busy, setBusy] = createSignal(false);
  const [feedback, setFeedback] = createSignal<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const [fetchedBrands] = createResource(
    () => !props.brands,
    async (needFetch) => {
      if (!needFetch) return [] as BrandOption[];
      const res = await api<{ data: BrandOption[] }>("/admin/brands");
      return res.data ?? [];
    },
  );

  const [fetchedCategories] = createResource(
    () => !props.categories,
    async (needFetch) => {
      if (!needFetch) return [] as CategoryOption[];
      const res = await api<{ data: CategoryOption[] }>("/admin/categories");
      return res.data ?? [];
    },
  );

  const brands = () => props.brands ?? fetchedBrands() ?? [];
  const categories = () => props.categories ?? fetchedCategories() ?? [];
  const categoryHierarchyOptions = createMemo(() =>
    buildCategoryHierarchyOptions(
      categories().map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug ?? "",
        parent_id: c.parent_id ?? null,
        sort_order: c.sort_order,
        full_path: c.full_path,
      })),
    ),
  );

  const [importsList, { refetch: refetchList }] = createResource(async () => {
    const res = await api<{ data: AiProductImportDetail[] }>(
      "/admin/ai/catalog/imports",
    );
    return res.data ?? [];
  });

  const [importDetail, { refetch: refetchDetail }] = createResource(
    activeImportId,
    async (id) => {
      const res = await api<{ data: AiProductImportDetail }>(
        `/admin/ai/catalog/imports/${id}`,
      );
      return res.data;
    },
  );

  const filteredItems = createMemo(() => {
    const items = importDetail()?.items ?? [];
    const f = reviewFilter();
    if (f === "ready") {
      return items.filter(
        (i) =>
          i.resolution_choice !== "ignore" &&
          Boolean(i.validation_result?.is_valid) &&
          i.action_type !== "possible_duplicate" &&
          i.approval_status !== "committed",
      );
    }
    if (f === "duplicates") {
      return items.filter(
        (i) =>
          i.action_type === "possible_duplicate" ||
          i.action_type === "update_variant",
      );
    }
    if (f === "review") {
      return items.filter(
        (i) =>
          !i.validation_result?.is_valid ||
          (i.validation_result?.errors?.length ?? 0) > 0 ||
          (i.validation_result?.warnings?.length ?? 0) > 0 ||
          i.resolution_choice === "manual_review",
      );
    }
    return items;
  });

  const focusedItem = createMemo(() => {
    const items = importDetail()?.items ?? [];
    return (
      items.find((i) => i.id === focusedItemId()) ??
      filteredItems()[0] ??
      items[0] ??
      null
    );
  });

  async function processWithAi(e: Event) {
    e.preventDefault();
    if (
      selectedFiles().length === 0 &&
      !instruction().trim() &&
      !rawText().trim()
    ) {
      setFeedback({
        type: "err",
        text: "Informe o texto da lista, selecione uma foto ou envie uma planilha para preparar o rascunho.",
      });
      return;
    }

    setBusy(true);
    setFeedback(null);
    setCommitKey(makeIdempotencyKey("ai-commit"));
    try {
      const fd = new FormData();
      if (activeImportId()) fd.append("import_id", String(activeImportId()));
      if (instruction().trim()) fd.append("instruction", instruction().trim());
      if (rawText().trim()) fd.append("raw_text", rawText().trim());
      for (const f of selectedFiles()) fd.append("files[]", f);

      const res = await api<{ data: AiProductImportDetail }>(
        "/admin/ai/catalog/imports",
        {
          method: "POST",
          body: fd,
          timeoutMs: 60000,
        },
      );
      setActiveImportId(res.data.id);
      setFocusedItemId(res.data.items?.[0]?.id ?? null);
      setSelectedFiles([]);
      setSelectedItemIds([]);
      setFeedback({
        type: "ok",
        text: `Rascunho #${res.data.id}: ${res.data.grouped_products_count} produto(s), ${res.data.grouped_variants_count} variação(ões) prontas para revisão.`,
      });
      await Promise.all([refetchList(), refetchDetail()]);
    } catch (err) {
      setFeedback({
        type: "err",
        text:
          err instanceof ApiError
            ? err.message
            : "Erro ao analisar documento com IA.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function updateItem(
    importId: number,
    itemId: number,
    patch: Record<string, unknown>,
  ) {
    setBusy(true);
    try {
      await api(`/admin/ai/catalog/imports/${importId}/items/${itemId}`, {
        method: "PATCH",
        body: patch,
      });
      await refetchDetail();
    } catch (err) {
      setFeedback({
        type: "err",
        text:
          err instanceof ApiError
            ? err.message
            : "Não foi possível salvar alteração do rascunho.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function applyBulkDraftAssignment(patch: Record<string, unknown>) {
    const detail = importDetail();
    if (!detail || selectedItemIds().length === 0) return;
    setBusy(true);
    try {
      await api(`/admin/ai/catalog/imports/${detail.id}/items/bulk`, {
        method: "PATCH",
        body: {
          item_ids: selectedItemIds(),
          ...patch,
        },
      });
      setFeedback({
        type: "ok",
        text: `${selectedItemIds().length} item(ns) do rascunho atualizados.`,
      });
      await refetchDetail();
    } catch (err) {
      setFeedback({
        type: "err",
        text:
          err instanceof ApiError
            ? err.message
            : "Falha ao atualizar itens selecionados.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function commitItems(onlySelected: boolean) {
    const detail = importDetail();
    if (!detail) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await api<{
        data: {
          created_products: number;
          created_variants: number;
          updated_variants: number;
          idempotent_replay?: boolean;
        };
      }>(`/admin/ai/catalog/imports/${detail.id}/approve`, {
        method: "POST",
        body: {
          item_ids: onlySelected ? selectedItemIds() : undefined,
          idempotency_key: commitKey(),
        },
      });
      const d = res.data;
      setFeedback({
        type: "ok",
        text: `Cadastro confirmado: ${d.created_products} produto(s) novo(s), ${d.created_variants} variação(ões) criada(s), ${d.updated_variants} atualizada(s).`,
      });
      setCommitKey(makeIdempotencyKey("ai-commit"));
      await Promise.all([refetchList(), refetchDetail()]);
      await props.onCommitted?.();
    } catch (err) {
      setFeedback({
        type: "err",
        text:
          err instanceof ApiError
            ? err.message
            : "Existem itens pendentes de revisão obrigatória antes de cadastrar.",
      });
    } finally {
      setBusy(false);
    }
  }

  function toggleSelect(id: number) {
    setSelectedItemIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <div class="space-y-5 pb-16">
      <Show when={feedback()}>
        {(fb) => (
          <p
            role="status"
            class={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-medium ${
              fb().type === "ok"
                ? "border-purple-200 bg-purple-50 text-zinc-900"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            <Show
              when={fb().type === "ok"}
              fallback={<AlertTriangle class="h-4 w-4 text-red-700" />}
            >
              <CheckCircle2 class="h-4 w-4 text-[#93509e]" />
            </Show>
            {fb().text}
          </p>
        )}
      </Show>

      {/* Single-Product Lookup (Default) & Batch Import Intake */}
      <Show when={!importDetail()}>
        <Show
          when={panelMode() === "lookup"}
          fallback={
            <form
              onSubmit={(e) => void processWithAi(e)}
              class="space-y-4 rounded-lg border border-zinc-200 bg-white p-5"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 class="flex items-center gap-2 text-base font-bold text-zinc-900">
                    <Sparkles class="h-4 w-4 text-[#93509e]" />
                    Importar em lote — escolha como começar
                  </h2>
                  <p class="text-xs text-zinc-500">
                    Todas as entradas levam à mesma grade de revisão. Especificações ilegíveis (como potência W) nunca são inventadas.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPanelMode("lookup")}
                  class="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  <Search class="h-3.5 w-3.5 text-[#93509e]" />
                  Voltar para busca por nome
                </button>
              </div>

          <div class="grid gap-2 sm:grid-cols-3 text-xs">
            <button
              type="button"
              onClick={() => setEntryMode("text")}
              class={`flex items-center gap-2 rounded-lg border p-3 text-left font-semibold ${
                entryMode() === "text"
                  ? "border-[#93509e] bg-purple-50 text-[#62298d]"
                  : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              <ClipboardText class="h-4 w-4 shrink-0" />
              <span>1. Colar texto ou lista de fornecedor</span>
            </button>
            <button
              type="button"
              onClick={() => setEntryMode("photo")}
              class={`flex items-center gap-2 rounded-lg border p-3 text-left font-semibold ${
                entryMode() === "photo"
                  ? "border-[#93509e] bg-purple-50 text-[#62298d]"
                  : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              <ImageIcon class="h-4 w-4 shrink-0" />
              <span>2. Foto da embalagem ou rótulo</span>
            </button>
            <button
              type="button"
              onClick={() => setEntryMode("spreadsheet")}
              class={`flex items-center gap-2 rounded-lg border p-3 text-left font-semibold ${
                entryMode() === "spreadsheet"
                  ? "border-[#93509e] bg-purple-50 text-[#62298d]"
                  : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              <FileSpreadsheet class="h-4 w-4 shrink-0" />
              <span>3. Planilha (.xlsx, .csv) ou ficha PDF</span>
            </button>
          </div>

          <Show when={entryMode() === "text"}>
            <div class="space-y-2">
              <label class="block text-xs font-semibold text-zinc-700">
                Cole a lista enviada pelo fornecedor ou descreva os itens
              </label>
              <textarea
                rows={5}
                value={instruction()}
                onInput={(e) => setInstruction(e.currentTarget.value)}
                placeholder={'Ex.: "Cadastre a linha de esmaltes em gel da marca X, 15 ml, nas cores Nude 017, Nude 018..." ou lista "- Gel 15 g - R$ 12,50"'}
                class="w-full rounded-md border border-zinc-300 p-3 text-xs focus:border-[#93509e] focus:outline-none"
              />
            </div>
          </Show>

          <Show when={entryMode() === "photo" || entryMode() === "spreadsheet"}>
            <div class="space-y-3">
              <label class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-xs font-semibold text-zinc-700 hover:border-[#93509e]">
                <FilePlus class="h-5 w-5 text-[#93509e]" />
                <span>
                  {selectedFiles().length > 0
                    ? `${selectedFiles().length} arquivo(s) selecionado(s)`
                    : entryMode() === "photo"
                      ? "Enviar foto JPG, PNG ou WEBP da embalagem / etiqueta"
                      : "Enviar planilha XLSX / CSV ou ficha técnica PDF"}
                </span>
                <input
                  type="file"
                  multiple
                  accept={
                    entryMode() === "photo"
                      ? ".jpg,.jpeg,.png,.webp"
                      : ".xlsx,.csv,.tsv,.txt,.pdf"
                  }
                  onChange={(e) => {
                    const list = e.currentTarget.files;
                    setSelectedFiles(list ? Array.from(list) : []);
                  }}
                  class="hidden"
                />
              </label>

              <Show when={entryMode() === "spreadsheet"}>
                <textarea
                  rows={3}
                  value={rawText()}
                  onInput={(e) => setRawText(e.currentTarget.value)}
                  placeholder="Ou cole linhas copiadas de uma planilha..."
                  class="w-full rounded-md border border-zinc-300 p-2.5 font-mono text-xs focus:border-[#93509e] focus:outline-none"
                />
              </Show>

              <input
                type="text"
                value={instruction()}
                onInput={(e) => setInstruction(e.currentTarget.value)}
                placeholder="Contexto opcional (ex.: Marca Y, estoque inicial 10 un.)"
                class="h-9 w-full rounded-md border border-zinc-300 px-3 text-xs focus:border-[#93509e] focus:outline-none"
              />
            </div>
          </Show>

          <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div class="flex flex-wrap gap-2 text-xs">
              <For each={(importsList() ?? []).slice(0, 4)}>
                {(imp) => (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveImportId(imp.id);
                      setFocusedItemId(null);
                    }}
                    class="rounded border border-zinc-200 px-2.5 py-1 text-zinc-700 hover:bg-zinc-50"
                  >
                    Retomar rascunho #{imp.id} ({imp.total_records} itens)
                  </button>
                )}
              </For>
            </div>
            <button
              type="submit"
              disabled={busy()}
              class="rounded-md bg-[#93509e] px-5 py-2 text-xs font-bold text-white hover:bg-[#7c3f87] disabled:opacity-60"
            >
              {busy() ? "Extraindo..." : "Preparar rascunho para revisão"}
            </button>
          </div>
            </form>
          }
        >
          <div class="space-y-4">
            <AdminAiSingleProductLookup
              brands={brands()}
              categories={categories()}
              canCostWrite={props.canCostWrite ?? true}
              onSwitchToBatch={() => setPanelMode("batch")}
              onOpenExistingProduct={(prodId) => {
                if (props.onOpenExistingProduct) {
                  props.onOpenExistingProduct(prodId);
                } else {
                  void navigate({
                    to: "/admin/produtos",
                    search: { view: "editar", editId: String(prodId) } as never,
                  });
                }
              }}
              onProductSaved={(savedId, productName, stayForNext) => {
                void (async () => {
                  await props.onCommitted?.();
                  if (props.onProductSaved) {
                    await props.onProductSaved(
                      savedId,
                      productName,
                      stayForNext,
                    );
                  } else if (!stayForNext) {
                    setFeedback({
                      type: "ok",
                      text: `Produto "${productName}" cadastrado no catálogo (#${savedId}).`,
                    });
                  }
                })();
              }}
            />

            <Show when={(importsList() ?? []).length > 0}>
              <div class="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-zinc-200 bg-white px-4 py-3 text-xs">
                <span class="font-medium text-zinc-600">
                  Rascunhos recentes em lote:
                </span>
                <div class="flex flex-wrap gap-2">
                  <For each={(importsList() ?? []).slice(0, 4)}>
                    {(imp) => (
                      <button
                        type="button"
                        onClick={() => {
                          setPanelMode("batch");
                          setActiveImportId(imp.id);
                          setFocusedItemId(null);
                        }}
                        class="rounded border border-zinc-200 px-2.5 py-1 font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        Retomar rascunho #{imp.id} ({imp.total_records} itens)
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </div>
        </Show>
      </Show>

      {/* Unified Review Stage */}
      <Show when={importDetail()}>
        {(detail) => (
          <div class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white p-4">
              <div>
                <h2 class="text-base font-bold text-zinc-900">
                  Revisão do Lote #{detail().id}
                </h2>
                <p class="text-xs text-zinc-500">
                  {detail().grouped_products_count} produto(s) · {detail().grouped_variants_count} item(ns) · Zeros à esquerda preservados em códigos.
                </p>
              </div>
              <div class="flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setActiveImportId(null);
                    setSelectedItemIds([]);
                  }}
                  class="rounded-md border border-zinc-300 px-3 py-1.5 font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  Nova importação
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await api(`/admin/ai/catalog/imports/${detail().id}/discard`, {
                      method: "POST",
                    });
                    setActiveImportId(null);
                    await refetchList();
                  }}
                  class="rounded-md border border-red-200 px-3 py-1.5 font-semibold text-red-700 hover:bg-red-50"
                >
                  Descartar lote
                </button>
              </div>
            </div>

            {/* Filter tabs: Todos | Prontos | Possíveis duplicados | Precisam de revisão */}
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex flex-wrap gap-1.5 text-xs">
                <For
                  each={
                    [
                      ["all", `Todos (${detail().items.length})`],
                      [
                        "ready",
                        `Prontos (${detail().items.filter((i) => i.resolution_choice !== "ignore" && i.validation_result?.is_valid && i.action_type !== "possible_duplicate").length})`,
                      ],
                      [
                        "duplicates",
                        `Possíveis duplicados (${detail().items.filter((i) => i.action_type === "possible_duplicate" || i.action_type === "update_variant").length})`,
                      ],
                      [
                        "review",
                        `Precisam de revisão (${detail().items.filter((i) => !i.validation_result?.is_valid || (i.validation_result?.warnings?.length ?? 0) > 0 || i.resolution_choice === "manual_review").length})`,
                      ],
                    ] as const
                  }
                >
                  {([key, label]) => (
                    <button
                      type="button"
                      onClick={() => setReviewFilter(key)}
                      class={`rounded-md px-3 py-1.5 font-semibold ${
                        reviewFilter() === key
                          ? "bg-[#93509e] text-white"
                          : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                      }`}
                    >
                      {label}
                    </button>
                  )}
                </For>
              </div>
            </div>

            {/* Bulk assignment bar for selected draft items */}
            <Show when={selectedItemIds().length > 0}>
              <div class="flex flex-wrap items-center gap-2 rounded-lg border border-[#93509e] bg-purple-50/70 p-3 text-xs">
                <span class="font-bold text-zinc-900">
                  {selectedItemIds().length} item(ns) selecionados:
                </span>
                <select
                  value={bulkBrandId()}
                  onChange={(e) => setBulkBrandId(e.currentTarget.value)}
                  class="h-8 rounded border border-zinc-300 bg-white px-2"
                >
                  <option value="">Definir marca...</option>
                  <For each={brands() ?? []}>
                    {(b) => <option value={b.id}>{b.name}</option>}
                  </For>
                </select>
                <button
                  type="button"
                  disabled={!bulkBrandId()}
                  onClick={() => {
                    const b = (brands() ?? []).find(
                      (x) => String(x.id) === bulkBrandId(),
                    );
                    if (b) {
                      void applyBulkDraftAssignment({
                        brand_id: b.id,
                        brand_name: b.name,
                      });
                    }
                  }}
                  class="rounded border border-zinc-300 bg-white px-2.5 py-1 font-semibold"
                >
                  Aplicar marca
                </button>
                <select
                  value={bulkCategoryId()}
                  onChange={(e) => setBulkCategoryId(e.currentTarget.value)}
                  class="h-8 rounded border border-zinc-300 bg-white px-2"
                >
                  <option value="">Definir categoria...</option>
                  <For each={categoryHierarchyOptions()}>
                    {(c) => <option value={c.value}>{c.label}</option>}
                  </For>
                </select>
                <button
                  type="button"
                  disabled={!bulkCategoryId()}
                  onClick={() => {
                    const c = categoryHierarchyOptions().find(
                      (x) => x.value === bulkCategoryId(),
                    );
                    if (c) {
                      void applyBulkDraftAssignment({
                        category_id: Number(c.value),
                        category_name: c.label,
                      });
                    }
                  }}
                  class="rounded border border-zinc-300 bg-white px-2.5 py-1 font-semibold"
                >
                  Aplicar categoria
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void applyBulkDraftAssignment({ resolution_choice: "ignore" })
                  }
                  class="rounded border border-zinc-300 bg-white px-2.5 py-1 font-semibold text-zinc-700"
                >
                  Ignorar selecionados
                </button>
              </div>
            </Show>

            <div class="grid gap-4 lg:grid-cols-12">
              {/* Review grid */}
              <div class="overflow-x-auto rounded-lg border border-zinc-200 bg-white lg:col-span-7">
                <table class="w-full min-w-[540px] border-collapse text-left text-xs">
                  <thead>
                    <tr class="border-b border-zinc-200 bg-zinc-50 text-[11px] font-semibold uppercase text-zinc-600">
                      <th class="w-8 px-2.5 py-2">
                        <input
                          type="checkbox"
                          aria-label="Selecionar todos desta aba"
                          checked={
                            filteredItems().length > 0 &&
                            filteredItems().every((i) =>
                              selectedItemIds().includes(i.id),
                            )
                          }
                          onChange={(e) =>
                            setSelectedItemIds(
                              e.currentTarget.checked
                                ? filteredItems().map((i) => i.id)
                                : [],
                            )
                          }
                          class="accent-[#93509e]"
                        />
                      </th>
                      <th class="sticky left-0 z-10 bg-zinc-50 px-2.5 py-2">
                        Item / SKU
                      </th>
                      <th class="px-2 py-2">Ação</th>
                      <th class="px-2 py-2 text-right">Preço (R$)</th>
                      <th class="px-2 py-2 text-right">Estoque</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-zinc-100">
                    <For each={filteredItems()}>
                      {(item) => {
                        const hasIssue = () =>
                          (item.validation_result?.errors?.length ?? 0) > 0 ||
                          !item.validation_result?.is_valid;
                        const active = () => focusedItem()?.id === item.id;
                        return (
                          <tr
                            onClick={() => setFocusedItemId(item.id)}
                            class={`cursor-pointer ${
                              active()
                                ? "bg-purple-50/70"
                                : hasIssue()
                                  ? "bg-red-50/40"
                                  : ""
                            }`}
                          >
                            <td
                              class="px-2.5 py-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={selectedItemIds().includes(item.id)}
                                onChange={() => toggleSelect(item.id)}
                                class="accent-[#93509e]"
                              />
                            </td>
                            <td class="sticky left-0 z-10 bg-white px-2.5 py-2">
                              <p class="max-w-[200px] truncate font-semibold text-zinc-900">
                                {item.proposed_data.product_name}
                              </p>
                              <p class="font-mono text-[11px] text-zinc-500">
                                {item.proposed_data.sku} ·{" "}
                                {item.proposed_data.variant_name}
                              </p>
                              <Show when={(item.validation_result?.errors?.length ?? 0) > 0}>
                                <p class="text-[10px] font-semibold text-red-700">
                                  {item.validation_result?.errors[0]}
                                </p>
                              </Show>
                            </td>
                            <td class="px-2 py-2 text-[11px]">
                              <span
                                class={`font-medium ${
                                  item.action_type === "possible_duplicate"
                                    ? "text-amber-800"
                                    : "text-zinc-700"
                                }`}
                              >
                                {aiActionTypeLabel(item.action_type)}
                              </span>
                            </td>
                            <td class="px-2 py-2 text-right font-semibold tabular-nums">
                              {item.proposed_data.price_cents > 0
                                ? formatCents(item.proposed_data.price_cents)
                                : "Pendente"}
                            </td>
                            <td class="px-2 py-2 text-right tabular-nums">
                              {item.proposed_data.stock_qty} un.
                            </td>
                          </tr>
                        );
                      }}
                    </For>
                  </tbody>
                </table>
              </div>

              {/* Side-by-side Evidence + Detail Editor */}
              <div class="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 text-xs lg:col-span-5">
                <Show
                  when={focusedItem()}
                  fallback={
                    <p class="text-zinc-500">
                      Selecione uma linha à esquerda para revisar a fonte original e editar os campos.
                    </p>
                  }
                >
                  {(item) => (
                    <div class="space-y-3">
                      <div class="flex items-start justify-between gap-2 border-b border-zinc-100 pb-2">
                        <div>
                          <h3 class="font-bold text-zinc-900">
                            {item().proposed_data.product_name}
                          </h3>
                          <p class="text-[11px] text-zinc-500">
                            Origem: {item().source_evidence?.origin_file} ({item().source_evidence?.origin_detail})
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            void updateItem(detail().id, item().id, {
                              ungroup: true,
                            })
                          }
                          class="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                        >
                          <Unlink class="h-3 w-3" />
                          Separar produto
                        </button>
                      </div>

                      {/* Photo or original text snippet side-by-side */}
                      <Show when={item().source_evidence?.image_url}>
                        {(url) => (
                          <div class="rounded-md border border-zinc-200 bg-zinc-50 p-2">
                            <p class="mb-1 text-[10px] font-semibold uppercase text-zinc-500">
                              Foto enviada pelo usuário
                            </p>
                            <img
                              src={assetUrl(url())}
                              alt={item().proposed_data.product_name}
                              class="max-h-44 w-full rounded object-contain bg-white"
                            />
                          </div>
                        )}
                      </Show>
                      <Show when={item().source_evidence?.raw_snippet}>
                        {(snip) => (
                          <div class="rounded-md border border-zinc-200 bg-zinc-50 p-2 text-[11px] font-mono text-zinc-700">
                            {snip()}
                          </div>
                        )}
                      </Show>

                      {/* Duplicate / Existing Catalog Side-by-side comparison */}
                      <Show when={item().duplicate_comparison}>
                        {(dup) => (
                          <div class="space-y-1.5 rounded-md border border-amber-200 bg-amber-50/70 p-2.5 text-[11px]">
                            <p class="font-bold text-amber-900">
                              Correspondência encontrada: {dup().reason}
                            </p>
                            <p class="text-zinc-800">
                              <strong>Atual no catálogo:</strong>{" "}
                              {dup().existing.product_name} (SKU {dup().existing.sku}) ·{" "}
                              {formatCents(dup().existing.price_cents)}
                            </p>
                            <div class="flex flex-wrap gap-1.5 pt-1">
                              <button
                                type="button"
                                onClick={() =>
                                  void updateItem(detail().id, item().id, {
                                    matched_product_id: dup().existing.product_id,
                                    resolution_choice: "update_existing",
                                  })
                                }
                                class="inline-flex items-center gap-1 rounded border border-[#93509e] bg-white px-2 py-0.5 font-semibold text-[#93509e]"
                              >
                                <Link2 class="h-3 w-3" />
                                Vincular a este produto
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void updateItem(detail().id, item().id, {
                                    matched_product_id: null,
                                    resolution_choice: "create_new",
                                    ungroup: true,
                                  })
                                }
                                class="rounded border border-zinc-300 bg-white px-2 py-0.5 font-semibold"
                              >
                                Cadastrar separado
                              </button>
                            </div>
                          </div>
                        )}
                      </Show>

                      {/* Ambiguous bare currency disambiguation & Pack unit conversion alerts */}
                      <Show when={(item().proposed_data.ambiguous_price_cents ?? 0) > 0}>
                        <div class="space-y-1.5 rounded-md border border-purple-200 bg-purple-50/70 p-2.5 text-[11px]">
                          <p class="font-bold text-[#62298d]">
                            Valor encontrado ({formatCents(item().proposed_data.ambiguous_price_cents ?? 0)}) sem classificação clara — indique o significado:
                          </p>
                          <div class="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                void updateItem(detail().id, item().id, {
                                  price_meaning: "cost",
                                })
                              }
                              class="rounded border border-[#93509e] bg-white px-2 py-1 font-semibold text-[#62298d] hover:bg-purple-50"
                            >
                              Custo de aquisição
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void updateItem(detail().id, item().id, {
                                  price_meaning: "supplier_suggested",
                                })
                              }
                              class="rounded border border-zinc-300 bg-white px-2 py-1 font-semibold text-zinc-700 hover:bg-zinc-50"
                            >
                              Preço sugerido pelo fornecedor
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void updateItem(detail().id, item().id, {
                                  price_meaning: "sale",
                                })
                              }
                              class="rounded border border-zinc-300 bg-white px-2 py-1 font-semibold text-zinc-700 hover:bg-zinc-50"
                            >
                              Preço de venda da loja
                            </button>
                          </div>
                        </div>
                      </Show>

                      <Show when={item().proposed_data.cost_conversion}>
                        {(conv) => (
                          <div class="space-y-1.5 rounded-md border border-zinc-200 bg-zinc-50 p-2.5 text-[11px]">
                            <div class="flex flex-wrap items-center justify-between gap-1">
                              <span class="font-bold text-zinc-900">
                                Conversão de embalagem ({conv().pack_label} c/ {conv().pack_qty} un.)
                              </span>
                              <span class="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-zinc-700 border border-zinc-200">
                                Unidade de venda: {conv().selling_unit}
                              </span>
                            </div>
                            <p class="font-mono text-zinc-800">{conv().formula}</p>
                            <Show when={!conv().applied}>
                              <button
                                type="button"
                                onClick={() =>
                                  void updateItem(detail().id, item().id, {
                                    apply_pack_conversion: true,
                                    selling_unit: "unidade",
                                  })
                                }
                                class="rounded bg-[#93509e] px-2.5 py-1 font-semibold text-white hover:bg-[#7c3f87]"
                              >
                                Confirmar venda por unidade e aplicar custo unitário ({formatCents(conv().proposed_unit_cost_cents)})
                              </button>
                            </Show>
                          </div>
                        )}
                      </Show>

                      {/* Errors & Warnings */}
                      <Show when={(item().validation_result?.errors?.length ?? 0) > 0}>
                        <div class="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] text-red-800">
                          <For each={item().validation_result?.errors ?? []}>
                            {(err) => <p class="font-semibold">{err}</p>}
                          </For>
                        </div>
                      </Show>
                      <Show when={(item().validation_result?.warnings?.length ?? 0) > 0}>
                        <div class="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
                          <For each={item().validation_result?.warnings ?? []}>
                            {(w) => <p>{w}</p>}
                          </For>
                        </div>
                      </Show>

                      {/* Structured Fields */}
                      <div class="grid gap-2 sm:grid-cols-2">
                        <div class="sm:col-span-2">
                          <label class="block text-[11px] font-semibold text-zinc-700">Nome comercial</label>
                          <input
                            type="text"
                            value={item().proposed_data.product_name}
                            onBlur={(e) => {
                              if (e.currentTarget.value !== item().proposed_data.product_name) {
                                void updateItem(detail().id, item().id, {
                                  product_name: e.currentTarget.value,
                                });
                              }
                            }}
                            class="mt-0.5 h-8 w-full rounded border border-zinc-300 px-2"
                          />
                        </div>
                        <div class="sm:col-span-2">
                          <label class="block text-[11px] font-semibold text-zinc-700">
                            Categoria (hierárquica)
                          </label>
                          <select
                            value={
                              item().proposed_data.category_id
                                ? String(item().proposed_data.category_id)
                                : ""
                            }
                            onChange={(e) => {
                              const val = e.currentTarget.value;
                              const cid = Number(val);
                              const chosen = categoryHierarchyOptions().find(
                                (c) => c.value === val,
                              );
                              void updateItem(detail().id, item().id, {
                                category_id: cid || null,
                                category_name: chosen?.label ?? null,
                              });
                            }}
                            class="mt-0.5 h-8 w-full rounded border border-zinc-300 bg-white px-2"
                          >
                            <option value="">Selecionar categoria...</option>
                            <For each={categoryHierarchyOptions()}>
                              {(c) => <option value={c.value}>{c.label}</option>}
                            </For>
                          </select>
                          <Show
                            when={
                              !item().proposed_data.category_id &&
                              (item().proposed_data.category_suggestions?.length ?? 0) > 0
                            }
                          >
                            <div class="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
                              <span class="font-semibold text-amber-800">
                                Sugestões para "{item().proposed_data.category_raw ?? item().proposed_data.category_name}":
                              </span>
                              <For each={item().proposed_data.category_suggestions ?? []}>
                                {(sug) => (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void updateItem(detail().id, item().id, {
                                        category_id: sug.id,
                                        category_name: sug.full_path,
                                      })
                                    }
                                    class="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-medium text-amber-900 hover:bg-amber-100"
                                  >
                                    {sug.full_path}
                                  </button>
                                )}
                              </For>
                            </div>
                          </Show>
                        </div>
                        <div>
                          <label class="block text-[11px] font-semibold text-zinc-700">SKU</label>
                          <input
                            type="text"
                            value={item().proposed_data.sku}
                            onBlur={(e) =>
                              void updateItem(detail().id, item().id, {
                                sku: e.currentTarget.value.toUpperCase(),
                              })
                            }
                            class="mt-0.5 h-8 w-full rounded border border-zinc-300 px-2 font-mono uppercase"
                          />
                        </div>
                        <div>
                          <label class="block text-[11px] font-semibold text-zinc-700">Código de barras (GTIN)</label>
                          <input
                            type="text"
                            value={item().proposed_data.gtin ?? ""}
                            onBlur={(e) =>
                              void updateItem(detail().id, item().id, {
                                gtin: e.currentTarget.value || null,
                              })
                            }
                            class="mt-0.5 h-8 w-full rounded border border-zinc-300 px-2 font-mono"
                          />
                        </div>
                        <div>
                          <label class="block text-[11px] font-semibold text-zinc-700">
                            Custo de aquisição unitário (R$)
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={formatCostCentsToBrInput(item().proposed_data.cost_price_cents)}
                            onBlur={(e) => {
                              const cents = parseBrazilianCostToCents(e.currentTarget.value);
                              if (cents === null || cents >= 0) {
                                void updateItem(detail().id, item().id, {
                                  cost_price_cents: cents,
                                });
                              }
                            }}
                            placeholder="Não informado"
                            class="mt-0.5 h-8 w-full rounded border border-zinc-300 px-2 text-right tabular-nums"
                          />
                        </div>
                        <div>
                          <label class="block text-[11px] font-semibold text-zinc-700">
                            Preço de venda da loja (R$)
                            <Show when={item().proposed_data.suggested_retail_price_cents}>
                              {(srp) => (
                                <span class="ml-1 text-[10px] font-normal text-amber-800">
                                  (Sugerido forn.: {formatCents(srp())})
                                </span>
                              )}
                            </Show>
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={formatCentsToBrInput(item().proposed_data.price_cents)}
                            onBlur={(e) => {
                              const cents = parseBrazilianPriceToCents(e.currentTarget.value);
                              if (cents >= 0) {
                                void updateItem(detail().id, item().id, {
                                  price_cents: cents,
                                });
                              }
                            }}
                            placeholder="Informar R$"
                            class="mt-0.5 h-8 w-full rounded border border-zinc-300 px-2 text-right font-semibold tabular-nums"
                          />
                        </div>
                        <div>
                          <label class="block text-[11px] font-semibold text-zinc-700">Estoque</label>
                          <input
                            type="number"
                            min="0"
                            value={item().proposed_data.stock_qty}
                            onBlur={(e) =>
                              void updateItem(detail().id, item().id, {
                                stock_qty: Number(e.currentTarget.value) || 0,
                              })
                            }
                            class="mt-0.5 h-8 w-full rounded border border-zinc-300 px-2 text-right tabular-nums"
                          />
                        </div>
                        <div>
                          <label class="block text-[11px] font-semibold text-zinc-700">Conteúdo / Volume</label>
                          <input
                            type="text"
                            value={item().proposed_data.volume ?? ""}
                            onBlur={(e) =>
                              void updateItem(detail().id, item().id, {
                                volume: e.currentTarget.value || null,
                              })
                            }
                            placeholder="Ex.: 15 ml, 15 g"
                            class="mt-0.5 h-8 w-full rounded border border-zinc-300 px-2"
                          />
                        </div>
                        <div>
                          <label class="block text-[11px] font-semibold text-zinc-700">Peso envio (g)</label>
                          <input
                            type="number"
                            min="1"
                            value={item().proposed_data.shipping_weight_grams ?? ""}
                            onBlur={(e) =>
                              void updateItem(detail().id, item().id, {
                                shipping_weight_grams: e.currentTarget.value
                                  ? Number(e.currentTarget.value)
                                  : null,
                              })
                            }
                            placeholder="Não inferido do rótulo"
                            class="mt-0.5 h-8 w-full rounded border border-zinc-300 px-2"
                          />
                        </div>
                        <Show when={item().proposed_data.is_equipment || item().proposed_data.power_watts}>
                          <div>
                            <label class="block text-[11px] font-semibold text-red-700">
                              Potência elétrica (W) *
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={item().proposed_data.power_watts ?? ""}
                              onBlur={(e) =>
                                void updateItem(detail().id, item().id, {
                                  power_watts: e.currentTarget.value
                                    ? Number(e.currentTarget.value)
                                    : null,
                                })
                              }
                              placeholder="Informe se legível"
                              class="mt-0.5 h-8 w-full rounded border border-red-300 px-2"
                            />
                          </div>
                        </Show>
                        <div>
                          <label class="block text-[11px] font-semibold text-zinc-700">Decisão</label>
                          <select
                            value={item().resolution_choice}
                            onChange={(e) =>
                              void updateItem(detail().id, item().id, {
                                resolution_choice: e.currentTarget.value,
                              })
                            }
                            class="mt-0.5 h-8 w-full rounded border border-zinc-300 bg-white px-2"
                          >
                            <option value="create_new">Cadastrar novo</option>
                            <option value="update_existing">Atualizar existente</option>
                            <option value="manual_review">Manter em revisão</option>
                            <option value="ignore">Ignorar item</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </Show>
              </div>
            </div>

            {/* Sticky Footer */}
            <div class="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-sm">
              <span class="text-xs text-zinc-600">
                Rascunho salvo automaticamente a cada edição de campo.
              </span>
              <div class="flex flex-wrap gap-2">
                <Show when={selectedItemIds().length > 0}>
                  <button
                    type="button"
                    disabled={busy()}
                    onClick={() => void commitItems(true)}
                    class="rounded-md bg-[#93509e] px-4 py-2 text-xs font-bold text-white hover:bg-[#7c3f87] disabled:opacity-60"
                  >
                    Cadastrar {selectedItemIds().length} selecionados
                  </button>
                </Show>
                <button
                  type="button"
                  disabled={busy()}
                  onClick={() => void commitItems(false)}
                  class="rounded-md bg-[#93509e] px-5 py-2 text-xs font-bold text-white hover:bg-[#7c3f87] disabled:opacity-60"
                >
                  {busy() ? "Gravando..." : "Aprovar e cadastrar lote"}
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
