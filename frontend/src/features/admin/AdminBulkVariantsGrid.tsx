import AlertTriangle from "lucide-solid/icons/triangle-exclamation-point";
import CheckCircle2 from "lucide-solid/icons/circle-check";
import ClipboardPaste from "lucide-solid/icons/clipboard-paste";
import Download from "lucide-solid/icons/download";
import History from "lucide-solid/icons/rotate-ccw-clock";
import Plus from "lucide-solid/icons/plus";
import Trash2 from "lucide-solid/icons/trash";
import { For, Show, createResource, createSignal } from "solid-js";
import { ApiError, api } from "../../lib/api";
import {
  formatCentsToBrInput,
  parseBrazilianPriceToCents,
} from "./admin-helpers";

interface BulkRow {
  variant_id: number | null;
  product_id: number | null;
  product_name: string;
  name: string;
  shade_code: string;
  color_family: string;
  color_hex: string;
  sku: string;
  price_brl: string;
  promo_price_brl: string;
  stock_qty: number;
  sort_order: number;
  is_active: boolean;
  dirty?: boolean;
  action?: string;
  errors?: string[];
}

interface PreviewSummary {
  total_rows: number;
  new_count: number;
  update_count: number;
  invalid_count: number;
  duplicate_skus: string[];
}

export function AdminBulkVariantsGrid(props: {
  products: Array<{ id: number; name: string; sku: string }>;
  initialProductId?: number | null;
  onCommitted?: () => Promise<void> | void;
}) {
  const [selectedProductId, setSelectedProductId] = createSignal<number | "">(
    props.initialProductId ?? "",
  );
  const [search, setSearch] = createSignal("");
  const [rows, setRows] = createSignal<BulkRow[]>([]);
  const [pasteModalOpen, setPasteModalOpen] = createSignal(false);
  const [rawPaste, setRawPaste] = createSignal("");
  const [previewSummary, setPreviewSummary] =
    createSignal<PreviewSummary | null>(null);
  const [showBatches, setShowBatches] = createSignal(false);
  const [sourceType, setSourceType] = createSignal<"grid" | "paste" | "csv">(
    "grid",
  );
  const [busy, setBusy] = createSignal(false);
  const [feedback, setFeedback] = createSignal<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const [batches, { refetch: refetchBatches }] = createResource(
    showBatches,
    async (open) => {
      if (!open) return [];
      const res = await api<{
        data: Array<{
          id: number;
          batch_code: string;
          source: string;
          total_rows: number;
          created_count: number;
          updated_count: number;
          user: { name: string } | null;
          created_at: string;
        }>;
      }>("/admin/variants/bulk-batches");
      return res.data ?? [];
    },
  );

  async function loadVariants() {
    setBusy(true);
    setFeedback(null);
    setPreviewSummary(null);
    try {
      const qs = new URLSearchParams();
      if (selectedProductId())
        qs.set("product_id", String(selectedProductId()));
      if (search().trim()) qs.set("search", search().trim());
      const res = await api<{
        data: Array<{
          variant_id: number;
          product_id: number;
          product_name: string;
          name: string;
          shade_code: string | null;
          color_family: string | null;
          color_hex: string | null;
          sku: string;
          price_cents: number;
          promo_price_cents: number | null;
          stock_qty: number;
          sort_order: number;
          is_active: boolean;
        }>;
      }>(`/admin/variants/bulk?${qs.toString()}`);

      setRows(
        (res.data ?? []).map((v) => ({
          variant_id: v.variant_id,
          product_id: v.product_id,
          product_name: v.product_name,
          name: v.name,
          shade_code: v.shade_code || "",
          color_family: v.color_family || "",
          color_hex: v.color_hex || "#93509e",
          sku: v.sku,
          price_brl: formatCentsToBrInput(v.price_cents),
          promo_price_brl: formatCentsToBrInput(v.promo_price_cents),
          stock_qty: v.stock_qty,
          sort_order: v.sort_order,
          is_active: v.is_active,
          dirty: false,
          errors: [],
        })),
      );
      setSourceType("grid");
    } finally {
      setBusy(false);
    }
  }

  function addEmptyRow() {
    const prodId = selectedProductId() ? Number(selectedProductId()) : null;
    const prodName =
      props.products.find((p) => p.id === prodId)?.name ?? "Selecione produto";
    setRows((prev) => [
      ...prev,
      {
        variant_id: null,
        product_id: prodId,
        product_name: prodName,
        name: "",
        shade_code: "",
        color_family: "",
        color_hex: "#93509e",
        sku: "",
        price_brl: "19,90",
        promo_price_brl: "",
        stock_qty: 10,
        sort_order: prev.length,
        is_active: true,
        dirty: true,
      },
    ]);
    setPreviewSummary(null);
  }

  function updateCell<K extends keyof BulkRow>(
    index: number,
    key: K,
    val: BulkRow[K],
  ) {
    setRows((prev) =>
      prev.map((r, i) =>
        i === index ? { ...r, [key]: val, dirty: true, errors: [] } : r,
      ),
    );
    setPreviewSummary(null);
  }

  function removeUnsavedRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
    setPreviewSummary(null);
  }

  async function handleParsePaste() {
    if (!rawPaste().trim()) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await api<{
        data: {
          summary: PreviewSummary;
          rows: Array<{
            variant_id: number | null;
            product_id: number | null;
            name: string;
            shade_code: string | null;
            color_family: string | null;
            color_hex: string | null;
            sku: string;
            price_cents: number;
            promo_price_cents: number | null;
            stock_qty: number;
            sort_order: number;
            is_active: boolean;
            action: string;
            errors: string[];
          }>;
        };
      }>("/admin/variants/bulk-parse", {
        method: "POST",
        body: {
          raw_text: rawPaste(),
          default_product_id: selectedProductId()
            ? Number(selectedProductId())
            : null,
        },
      });

      const prodNameMap = new Map(props.products.map((p) => [p.id, p.name]));
      setRows(
        res.data.rows.map((r) => ({
          variant_id: r.variant_id,
          product_id: r.product_id,
          product_name:
            (r.product_id ? prodNameMap.get(r.product_id) : "") ?? "Produto",
          name: r.name,
          shade_code: r.shade_code || "",
          color_family: r.color_family || "",
          color_hex: r.color_hex || "#93509e",
          sku: r.sku,
          price_brl: formatCentsToBrInput(r.price_cents),
          promo_price_brl: formatCentsToBrInput(r.promo_price_cents),
          stock_qty: r.stock_qty,
          sort_order: r.sort_order,
          is_active: r.is_active,
          dirty: true,
          action: r.action,
          errors: r.errors,
        })),
      );
      setPreviewSummary(res.data.summary);
      setSourceType("paste");
      setPasteModalOpen(false);
      setRawPaste("");
    } catch (err) {
      setFeedback({
        type: "err",
        text:
          err instanceof ApiError ? err.message : "Erro ao interpretar dados.",
      });
    } finally {
      setBusy(false);
    }
  }

  function handleCsvFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setRawPaste(reader.result);
        setSourceType("csv");
        setPasteModalOpen(true);
      }
    };
    reader.readAsText(file, "UTF-8");
  }

  function downloadTemplate() {
    const csv = [
      "Nome da Variante;SKU;Preço;Estoque;Número da Cor;Preço Promocional",
      "Nude 017;GEL-017;19,90;12;017;",
      "Vermelho Rubi 005;GEL-005;19,90;15;005;16,90",
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "modelo-edicao-em-massa-variacoes.csv";
    a.click();
  }

  async function runPreview(): Promise<boolean> {
    if (rows().length === 0) return false;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await api<{
        data: {
          summary: PreviewSummary;
          rows: Array<{
            row_index: number;
            variant_id: number | null;
            product_id: number | null;
            action: string;
            errors: string[];
          }>;
        };
      }>("/admin/variants/bulk-preview", {
        method: "POST",
        body: {
          default_product_id: selectedProductId()
            ? Number(selectedProductId())
            : null,
          rows: rows().map((r) => ({
            variant_id: r.variant_id,
            product_id: r.product_id,
            name: r.name,
            shade_code: r.shade_code || null,
            color_family: r.color_family || null,
            color_hex: r.color_hex || null,
            sku: r.sku.trim().toUpperCase(),
            price_cents: parseBrazilianPriceToCents(r.price_brl),
            promo_price_cents: r.promo_price_brl.trim()
              ? parseBrazilianPriceToCents(r.promo_price_brl)
              : null,
            stock_qty: Number(r.stock_qty),
            sort_order: r.sort_order,
            is_active: r.is_active,
          })),
        },
      });

      setPreviewSummary(res.data.summary);
      setRows((prev) =>
        prev.map((row, idx) => ({
          ...row,
          variant_id: res.data.rows[idx]?.variant_id ?? row.variant_id,
          product_id: res.data.rows[idx]?.product_id ?? row.product_id,
          action: res.data.rows[idx]?.action,
          errors: res.data.rows[idx]?.errors ?? [],
        })),
      );
      return res.data.summary.invalid_count === 0;
    } catch (err) {
      setFeedback({
        type: "err",
        text:
          err instanceof ApiError ? err.message : "Erro ao pré-validar lote.",
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    const valid = await runPreview();
    if (!valid) {
      setFeedback({
        type: "err",
        text: "Corrija as linhas destacadas em vermelho antes de confirmar.",
      });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const idempotencyKey =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `bulk-${Date.now()}`;

      const res = await api<{
        data: {
          batch: {
            batch_code: string;
            created_count: number;
            updated_count: number;
          };
        };
      }>("/admin/variants/bulk-commit", {
        method: "POST",
        body: {
          idempotency_key: idempotencyKey,
          source: sourceType(),
          default_product_id: selectedProductId()
            ? Number(selectedProductId())
            : null,
          rows: rows().map((r) => ({
            variant_id: r.variant_id,
            product_id: r.product_id,
            name: r.name,
            shade_code: r.shade_code || null,
            color_family: r.color_family || null,
            color_hex: r.color_hex || null,
            sku: r.sku.trim().toUpperCase(),
            price_cents: parseBrazilianPriceToCents(r.price_brl),
            promo_price_cents: r.promo_price_brl.trim()
              ? parseBrazilianPriceToCents(r.promo_price_brl)
              : null,
            stock_qty: Number(r.stock_qty),
            sort_order: r.sort_order,
            is_active: r.is_active,
          })),
        },
      });

      setFeedback({
        type: "ok",
        text: `Lote ${res.data.batch.batch_code} confirmado! ${res.data.batch.created_count} criada(s), ${res.data.batch.updated_count} atualizada(s).`,
      });
      setPreviewSummary(null);
      await loadVariants();
      if (props.onCommitted) await props.onCommitted();
      if (showBatches()) await refetchBatches();
    } catch (err) {
      setFeedback({
        type: "err",
        text:
          err instanceof ApiError
            ? err.message
            : "Erro ao salvar alterações em massa.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="space-y-4">
      {/* Toolbar */}
      <div class="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4">
        <div class="flex flex-wrap items-end gap-2.5">
          <div>
            <label class="block text-[11px] font-bold text-zinc-600">
              Produto destino
            </label>
            <select
              value={selectedProductId()}
              onChange={(e) =>
                setSelectedProductId(
                  e.currentTarget.value ? Number(e.currentTarget.value) : "",
                )
              }
              class="mt-1 h-9 rounded-lg border border-zinc-300 bg-white px-2.5 text-xs"
            >
              <option value="">Todos os produtos</option>
              <For each={props.products}>
                {(p) => (
                  <option value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                )}
              </For>
            </select>
          </div>
          <div>
            <label class="block text-[11px] font-bold text-zinc-600">
              Buscar SKU ou cor
            </label>
            <input
              type="search"
              placeholder="SKU, cor..."
              value={search()}
              onInput={(e) => setSearch(e.currentTarget.value)}
              class="mt-1 h-9 rounded-lg border border-zinc-300 px-3 text-xs"
            />
          </div>
          <button
            type="button"
            disabled={busy()}
            onClick={() => void loadVariants()}
            class="h-9 rounded-lg bg-[#93509e] px-4 text-xs font-bold text-white hover:bg-[#7c3f87]"
          >
            Carregar grade
          </button>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPasteModalOpen(true)}
            class="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#93509e] bg-[#FCF8FD] px-3 text-xs font-bold text-[#93509e] hover:bg-[#93509e] hover:text-white"
          >
            <ClipboardPaste class="size-3.5" />
            Colar do Excel / Sheets
          </button>
          <label class="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
            Importar CSV
            <input
              type="file"
              accept=".csv,.txt"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) handleCsvFile(file);
              }}
              class="hidden"
            />
          </label>
          <button
            type="button"
            onClick={downloadTemplate}
            class="inline-flex h-9 items-center gap-1 rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
          >
            <Download class="size-3.5" />
            Modelo
          </button>
          <button
            type="button"
            onClick={() => setShowBatches((v) => !v)}
            class="inline-flex h-9 items-center gap-1 rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            <History class="size-3.5" />
            Histórico
          </button>
        </div>
      </div>

      {/* Paste Modal */}
      <Show when={pasteModalOpen()}>
        <div class="rounded-xl border border-[#DFC2E3] bg-[#FCF8FD] p-4 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-extrabold text-[#2E0C49]">
              Colar linhas do Excel ou Google Sheets
            </h3>
            <button
              type="button"
              onClick={() => setPasteModalOpen(false)}
              class="text-xs font-semibold text-zinc-500 hover:underline"
            >
              Fechar
            </button>
          </div>
          <p class="text-xs text-[#5B486B]">
            Cole com colunas separadas por tabulação ou ponto-e-vírgula (ex.:{" "}
            <code>Cor | SKU | Preço | Estoque</code>). Valores brasileiros como{" "}
            <code>19,90</code> ou <code>R$ 19,90</code> são reconhecidos
            automaticamente.
          </p>
          <textarea
            rows={7}
            value={rawPaste()}
            onInput={(e) => setRawPaste(e.currentTarget.value)}
            placeholder={
              "Cor\tSKU\tPreço\tEstoque\nNude 017\tGEL-017\t19,90\t12\nNude 018\tGEL-018\t19,90\t8"
            }
            class="w-full rounded-lg border border-zinc-300 bg-white p-3 font-mono text-xs"
          />
          <div class="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPasteModalOpen(false)}
              class="h-9 rounded-lg border border-zinc-300 bg-white px-4 text-xs font-semibold"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy()}
              onClick={() => void handleParsePaste()}
              class="h-9 rounded-lg bg-[#93509e] px-5 text-xs font-bold text-white hover:bg-[#7c3f87]"
            >
              Interpretar e pré-visualizar
            </button>
          </div>
        </div>
      </Show>

      {/* Mandatory Preview Summary */}
      <Show when={previewSummary()}>
        {(s) => (
          <div
            class={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5 text-xs ${
              s().invalid_count > 0
                ? "border-red-200 bg-red-50 text-red-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
          >
            <div class="flex flex-wrap items-center gap-3 font-bold">
              <Show
                when={s().invalid_count === 0}
                fallback={<AlertTriangle class="size-4 text-red-600" />}
              >
                <CheckCircle2 class="size-4 text-emerald-700" />
              </Show>
              <span>Total: {s().total_rows} linha(s)</span>
              <span>• Novas: {s().new_count}</span>
              <span>• Atualizações: {s().update_count}</span>
              <span>• Inválidas: {s().invalid_count}</span>
              <Show when={s().duplicate_skus.length > 0}>
                <span>• SKUs duplicados: {s().duplicate_skus.join(", ")}</span>
              </Show>
            </div>
          </div>
        )}
      </Show>

      <Show when={feedback()}>
        {(fb) => (
          <p
            role="status"
            class={`rounded-xl px-4 py-2.5 text-xs font-bold ${
              fb().type === "ok"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {fb().text}
          </p>
        )}
      </Show>

      {/* Editable Grid */}
      <div class="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <button
              type="button"
              onClick={addEmptyRow}
              class="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-300 px-3 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
            >
              <Plus class="size-3.5" />
              Adicionar linha
            </button>
            <Show when={rows().length > 0}>
              <button
                type="button"
                onClick={() => {
                  setRows([]);
                  setPreviewSummary(null);
                }}
                class="h-8 rounded-md px-2.5 text-xs font-semibold text-zinc-500 hover:text-zinc-900"
              >
                Descartar grade
              </button>
            </Show>
          </div>

          <Show when={rows().length > 0}>
            <div class="flex items-center gap-2">
              <button
                type="button"
                disabled={busy()}
                onClick={() => void runPreview()}
                class="h-9 rounded-lg border border-[#93509e] bg-white px-4 text-xs font-bold text-[#93509e] hover:bg-[#FCF8FD]"
              >
                Pré-validar lote
              </button>
              <button
                type="button"
                disabled={busy()}
                onClick={() => void handleCommit()}
                class="h-9 rounded-lg bg-[#93509e] px-5 text-xs font-bold text-white hover:bg-[#7c3f87] disabled:opacity-50"
              >
                {busy() ? "Salvando..." : "Confirmar alterações"}
              </button>
            </div>
          </Show>
        </div>

        <Show
          when={rows().length > 0}
          fallback={
            <p class="py-8 text-center text-xs text-zinc-500">
              Clique em &quot;Carregar grade&quot;, &quot;Adicionar linha&quot;
              ou cole uma tabela do Excel para iniciar.
            </p>
          }
        >
          <div class="overflow-x-auto">
            <table class="w-full min-w-[780px] text-left text-xs">
              <thead class="border-b border-zinc-200 bg-zinc-50 text-[11px] uppercase text-zinc-500">
                <tr>
                  <th class="p-2">Produto</th>
                  <th class="p-2">Cor / Variante *</th>
                  <th class="p-2">Cód.</th>
                  <th class="p-2">SKU *</th>
                  <th class="p-2">Preço (R$) *</th>
                  <th class="p-2">Promo (R$)</th>
                  <th class="p-2">Estoque *</th>
                  <th class="p-2">Ativo</th>
                  <th class="p-2">Validação</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-100">
                <For each={rows()}>
                  {(row, idx) => (
                    <tr
                      class={
                        (row.errors?.length ?? 0) > 0
                          ? "bg-red-50/70"
                          : row.dirty
                            ? "bg-amber-50/30"
                            : undefined
                      }
                    >
                      <td class="p-1.5 max-w-[160px] truncate text-[11px] text-zinc-600">
                        {row.product_name}
                      </td>
                      <td class="p-1.5">
                        <input
                          type="text"
                          value={row.name}
                          onInput={(e) =>
                            updateCell(idx(), "name", e.currentTarget.value)
                          }
                          class="h-8 w-full rounded border border-zinc-300 px-2"
                        />
                      </td>
                      <td class="p-1.5 w-20">
                        <input
                          type="text"
                          value={row.shade_code}
                          onInput={(e) =>
                            updateCell(
                              idx(),
                              "shade_code",
                              e.currentTarget.value,
                            )
                          }
                          class="h-8 w-full rounded border border-zinc-300 px-1.5"
                        />
                      </td>
                      <td class="p-1.5 w-32">
                        <input
                          type="text"
                          value={row.sku}
                          onInput={(e) =>
                            updateCell(
                              idx(),
                              "sku",
                              e.currentTarget.value.toUpperCase(),
                            )
                          }
                          class="h-8 w-full rounded border border-zinc-300 px-2 font-mono uppercase"
                        />
                      </td>
                      <td class="p-1.5 w-24">
                        <input
                          type="text"
                          value={row.price_brl}
                          onInput={(e) =>
                            updateCell(
                              idx(),
                              "price_brl",
                              e.currentTarget.value,
                            )
                          }
                          class="h-8 w-full rounded border border-zinc-300 px-2 text-right"
                        />
                      </td>
                      <td class="p-1.5 w-24">
                        <input
                          type="text"
                          value={row.promo_price_brl}
                          onInput={(e) =>
                            updateCell(
                              idx(),
                              "promo_price_brl",
                              e.currentTarget.value,
                            )
                          }
                          class="h-8 w-full rounded border border-zinc-300 px-2 text-right"
                        />
                      </td>
                      <td class="p-1.5 w-20">
                        <input
                          type="number"
                          min={0}
                          value={row.stock_qty}
                          onInput={(e) =>
                            updateCell(
                              idx(),
                              "stock_qty",
                              Number(e.currentTarget.value || 0),
                            )
                          }
                          class="h-8 w-full rounded border border-zinc-300 px-1.5 text-center"
                        />
                      </td>
                      <td class="p-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={row.is_active}
                          onChange={(e) =>
                            updateCell(
                              idx(),
                              "is_active",
                              e.currentTarget.checked,
                            )
                          }
                          class="accent-[#93509e]"
                        />
                      </td>
                      <td class="p-1.5">
                        <Show
                          when={(row.errors?.length ?? 0) > 0}
                          fallback={
                            <div class="flex items-center justify-between gap-1">
                              <span class="text-[10px] font-semibold text-zinc-500">
                                {row.action === "create"
                                  ? "Nova"
                                  : row.action === "update"
                                    ? "Atualizar"
                                    : row.dirty
                                      ? "Editada"
                                      : "Ok"}
                              </span>
                              <Show when={!row.variant_id}>
                                <button
                                  type="button"
                                  onClick={() => removeUnsavedRow(idx())}
                                  aria-label="Remover linha"
                                  class="text-zinc-400 hover:text-red-600"
                                >
                                  <Trash2 class="size-3.5" />
                                </button>
                              </Show>
                            </div>
                          }
                        >
                          <p class="text-[10px] font-bold text-red-700">
                            {row.errors!.join(" ")}
                          </p>
                        </Show>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </div>

      {/* Historico de lotes */}
      <Show when={showBatches()}>
        <div class="rounded-xl border border-zinc-200 bg-white p-4">
          <h3 class="mb-2 text-xs font-extrabold uppercase text-zinc-700">
            Histórico de Alterações em Massa
          </h3>
          <ul class="divide-y divide-zinc-100 text-xs">
            <For each={batches() ?? []}>
              {(b) => (
                <li class="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <span class="font-bold text-zinc-900">{b.batch_code}</span>{" "}
                    <span class="text-zinc-500">({b.source})</span>
                  </div>
                  <span class="text-zinc-600">
                    Por {b.user?.name || "Equipe"} • +{b.created_count}{" "}
                    criada(s), {b.updated_count} atualizada(s)
                  </span>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
    </div>
  );
}
