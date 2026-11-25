import AlertTriangle from "lucide-solid/icons/triangle-exclamation-point";
import CheckCircle2 from "lucide-solid/icons/circle-check";
import ClipboardPaste from "lucide-solid/icons/clipboard-paste";
import Download from "lucide-solid/icons/download";
import History from "lucide-solid/icons/rotate-ccw-clock";
import Plus from "lucide-solid/icons/plus";
import Trash2 from "lucide-solid/icons/trash";
import { For, Index, Show, createResource, createSignal, onMount } from "solid-js";
import { ApiError, api } from "../../lib/api";
import {
  formatCentsToBrInput,
  parseBrazilianPriceToCents,
} from "./admin-helpers";
import { makeIdempotencyKey } from "./products/types";

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
  clear_promo?: boolean;
  stock_qty: number | null;
  sort_order: number;
  is_active: boolean;
  dirty?: boolean;
  action?: string;
  errors?: string[];
  impacts?: string[];
  provided_fields?: string[];
  expected_stock_qty?: number;
}

interface PreviewChange {
  field: string;
  label: string;
  old_display: string;
  new_display: string;
}

interface PreviewPayload {
  summary: {
    total_rows: number;
    new_count: number;
    update_count: number;
    invalid_count: number;
    duplicate_skus: string[];
    unknown_skus?: string[];
  };
  rows: Array<{
    row_index: number;
    variant_id: number | null;
    product_id: number | null;
    sku: string;
    product_name?: string;
    name: string;
    action: string;
    errors: string[];
    impacts?: string[];
    changes?: PreviewChange[];
  }>;
}

export function AdminBulkVariantsGrid(props: {
  products: Array<{ id: number; name: string; sku: string }>;
  initialProductId?: number | null;
  initialProductIds?: number[];
  onCommitted?: () => Promise<void> | void;
}) {
  const [selectedProductId, setSelectedProductId] = createSignal<number | "">(
    props.initialProductId ?? "",
  );
  const [search, setSearch] = createSignal("");
  const [rows, setRows] = createSignal<BulkRow[]>([]);
  const [pasteModalOpen, setPasteModalOpen] = createSignal(false);
  const [rawPaste, setRawPaste] = createSignal("");
  const [preview, setPreview] = createSignal<PreviewPayload | null>(null);
  const [showBatches, setShowBatches] = createSignal(false);
  const [sourceType, setSourceType] = createSignal<"grid" | "paste" | "csv">(
    "grid",
  );
  const [idempotencyKey, setIdempotencyKey] = createSignal(
    makeIdempotencyKey("bulk-grid"),
  );
  const [busy, setBusy] = createSignal(false);
  const [feedback, setFeedback] = createSignal<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const [snapshotValues, setSnapshotValues] = createSignal<Map<string, string>>(
    new Map(),
  );

  onMount(() => {
    if (props.initialProductId || (props.initialProductIds?.length ?? 0) > 0) {
      void loadVariants();
    }
  });

  const [batches, { refetch: refetchBatches }] = createResource(
    showBatches,
    async (open) => {
      if (!open) return [];
      const res = await api<{
        data: Array<{
          id: number;
          batch_code: string;
          operation_type?: string | null;
          source: string;
          total_rows: number;
          created_count: number;
          updated_count: number;
          skipped_count?: number;
          pending_count?: number;
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
    setPreview(null);
    setIdempotencyKey(makeIdempotencyKey("bulk-grid"));
    try {
      const qs = new URLSearchParams();
      if (selectedProductId()) {
        qs.set("product_id", String(selectedProductId()));
      } else if ((props.initialProductIds?.length ?? 0) > 0) {
        qs.set("product_ids", props.initialProductIds!.join(","));
      }
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

      const loaded: BulkRow[] = (res.data ?? []).map((v) => ({
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
        clear_promo: false,
        stock_qty: v.stock_qty,
        expected_stock_qty: v.stock_qty,
        sort_order: v.sort_order,
        is_active: v.is_active,
        dirty: false,
        errors: [],
      }));

      setRows(loaded);
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
        price_brl: "",
        promo_price_brl: "",
        clear_promo: false,
        stock_qty: null,
        sort_order: prev.length,
        is_active: true,
        dirty: true,
      },
    ]);
    setPreview(null);
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
    setPreview(null);
  }

  function removeUnsavedRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
    setPreview(null);
  }

  function handleCellFocus(rowIndex: number, colName: string, currentValue: string) {
    const map = new Map(snapshotValues());
    map.set(`${rowIndex}:${colName}`, currentValue);
    setSnapshotValues(map);
  }

  function handleGridKeyDown(
    e: KeyboardEvent,
    rowIndex: number,
    colName: keyof BulkRow,
  ) {
    const inputEl = e.currentTarget as HTMLInputElement;
    if (e.key === "Escape") {
      e.preventDefault();
      const prevVal = snapshotValues().get(`${rowIndex}:${String(colName)}`);
      if (prevVal !== undefined) {
        if (colName === "stock_qty") {
          updateCell(
            rowIndex,
            "stock_qty",
            prevVal === "" ? null : Number(prevVal),
          );
        } else {
          updateCell(rowIndex, colName, prevVal as never);
        }
        inputEl.value = prevVal;
      }
      inputEl.blur();
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const next = document.querySelector<HTMLInputElement>(
        `[data-grid-cell="${rowIndex + 1}:${String(colName)}"]`,
      );
      next?.focus();
    }
  }

  function serializeRowsForApi() {
    return rows().map((r, idx) => {
      const pCents =
        r.price_brl.trim() !== "" ? parseBrazilianPriceToCents(r.price_brl) : null;
      const prCents = r.clear_promo
        ? null
        : r.promo_price_brl.trim() !== ""
          ? parseBrazilianPriceToCents(r.promo_price_brl)
          : null;

      return {
        row_index: idx,
        variant_id: r.variant_id,
        product_id:
          r.product_id ||
          (selectedProductId() ? Number(selectedProductId()) : null),
        name: r.name.trim() || null,
        shade_code: r.shade_code.trim() || null,
        color_family: r.color_family.trim() || null,
        color_hex: r.color_hex.trim() || null,
        sku: r.sku.trim().toUpperCase(),
        price_cents: pCents,
        promo_price_cents: prCents,
        clear_promo: Boolean(r.clear_promo),
        stock_qty: r.stock_qty,
        expected_stock_qty: r.expected_stock_qty,
        sort_order: idx,
        is_active: r.is_active,
        provided_fields: r.provided_fields,
      };
    });
  }

  async function handleParsePaste() {
    if (!rawPaste().trim()) return;
    setBusy(true);
    setFeedback(null);
    setIdempotencyKey(makeIdempotencyKey("bulk-paste"));
    try {
      const existingPayload = rows().map((r, idx) => ({
        row_index: idx,
        variant_id: r.variant_id,
        product_id: r.product_id,
        product_name: r.product_name,
        name: r.name,
        shade_code: r.shade_code,
        color_family: r.color_family,
        color_hex: r.color_hex,
        sku: r.sku,
        price_cents:
          r.price_brl.trim() !== "" ? parseBrazilianPriceToCents(r.price_brl) : 0,
        price_brl: r.price_brl,
        promo_price_cents: r.promo_price_brl.trim()
          ? parseBrazilianPriceToCents(r.promo_price_brl)
          : null,
        promo_price_brl: r.promo_price_brl,
        stock_qty: r.stock_qty,
        sort_order: r.sort_order,
        is_active: r.is_active,
      }));

      const res = await api<{ data: PreviewPayload }>("/admin/variants/bulk-parse", {
        method: "POST",
        body: {
          raw_text: rawPaste(),
          default_product_id: selectedProductId()
            ? Number(selectedProductId())
            : null,
          existing_rows: existingPayload,
        },
      });

      const prodNameMap = new Map(props.products.map((p) => [p.id, p.name]));
      const merged: BulkRow[] = res.data.rows.map((r) => {
        const rawR = r as unknown as Record<string, unknown>;
        return {
          variant_id: r.variant_id,
          product_id: r.product_id,
          product_name:
            r.product_name ||
            (r.product_id ? prodNameMap.get(r.product_id) : "") ||
            "Produto",
          name: r.name || "",
          shade_code: (rawR.shade_code as string) || "",
          color_family: (rawR.color_family as string) || "",
          color_hex: (rawR.color_hex as string) || "#93509e",
          sku: r.sku,
          price_brl:
            typeof rawR.price_cents === "number" && (rawR.price_cents as number) > 0
              ? formatCentsToBrInput(rawR.price_cents as number)
              : "",
          promo_price_brl:
            typeof rawR.promo_price_cents === "number" &&
            (rawR.promo_price_cents as number) > 0
              ? formatCentsToBrInput(rawR.promo_price_cents as number)
              : "",
          clear_promo: Boolean(rawR.clear_promo),
          stock_qty:
            typeof rawR.stock_qty === "number" ? (rawR.stock_qty as number) : null,
          expected_stock_qty:
            typeof rawR.existing_stock_qty === "number"
              ? (rawR.existing_stock_qty as number)
              : undefined,
          sort_order: r.row_index,
          is_active: true,
          dirty: true,
          action: r.action,
          errors: r.errors,
          impacts: r.impacts,
        };
      });

      setRows(merged);
      setPreview(res.data);
      setSourceType("paste");
      setPasteModalOpen(false);
      setRawPaste("");
    } catch (err) {
      setFeedback({
        type: "err",
        text:
          err instanceof ApiError ? err.message : "Erro ao interpretar planilha.",
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
      "Nome da Variante;SKU;Preço;Estoque;Código Cor;Preço Promocional",
      "Nude 017;GEL-017;19,90;12;017;",
      "Vermelho Rubi 005;GEL-005;21,50;15;005;18,90",
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "modelo-grade-edicao-em-massa.csv";
    a.click();
  }

  async function runPreview(): Promise<boolean> {
    if (rows().length === 0) return false;
    setBusy(true);
    setFeedback(null);
    setIdempotencyKey(makeIdempotencyKey("bulk-grid"));
    try {
      const res = await api<{ data: PreviewPayload }>("/admin/variants/bulk-preview", {
        method: "POST",
        body: {
          rows: serializeRowsForApi(),
          default_product_id: selectedProductId()
            ? Number(selectedProductId())
            : null,
        },
      });
      setPreview(res.data);
      const errMap = new Map(
        res.data.rows.map((r) => [
          r.row_index,
          { errors: r.errors, action: r.action, impacts: r.impacts },
        ]),
      );
      setRows((prev) =>
        prev.map((r, i) => ({
          ...r,
          action: errMap.get(i)?.action,
          errors: errMap.get(i)?.errors ?? [],
          impacts: errMap.get(i)?.impacts ?? [],
        })),
      );
      return res.data.summary.invalid_count === 0;
    } catch (err) {
      setFeedback({
        type: "err",
        text: err instanceof ApiError ? err.message : "Erro ao gerar prévia.",
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function commitBatch(applyValidOnly = false) {
    if (rows().length === 0) return;
    if (!preview()) {
      const clean = await runPreview();
      if (!clean && !applyValidOnly) return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const res = await api<{
        data: {
          status: string;
          counts: { completed: number; skipped: number; pending: number };
          pending_rows?: BulkRow[];
          batch: {
            batch_code: string;
            created_count: number;
            updated_count: number;
          };
        };
      }>("/admin/variants/bulk-commit", {
        method: "POST",
        body: {
          rows: serializeRowsForApi(),
          idempotency_key: idempotencyKey(),
          source: sourceType(),
          default_product_id: selectedProductId()
            ? Number(selectedProductId())
            : null,
          apply_valid_only: applyValidOnly,
          check_concurrency: true,
        },
      });

      const d = res.data;
      setFeedback({
        type: "ok",
        text: `Lote ${d.batch.batch_code}: ${d.counts.completed} gravado(s), ${d.counts.skipped} ignorado(s), ${d.counts.pending} pendente(s) para correção.`,
      });
      if (d.pending_rows && d.pending_rows.length > 0) {
        setRows(
          d.pending_rows.map((pr, idx) => ({
            ...pr,
            price_brl: pr.price_brl ?? "",
            promo_price_brl: pr.promo_price_brl ?? "",
            sort_order: idx,
          })),
        );
        setPreview(null);
      } else {
        setPreview(null);
        await loadVariants();
      }
      await refetchBatches();
      await props.onCommitted?.();
    } catch (err) {
      setFeedback({
        type: "err",
        text:
          err instanceof ApiError
            ? err.message
            : "Erro ao gravar lote em massa.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="space-y-4 pb-16">
      <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white p-4">
        <div class="min-w-0">
          <h2 class="text-base font-bold text-zinc-900">
            Edição individual em grade
          </h2>
          <p class="text-xs text-zinc-500">
            Use Tab para avançar, Enter para próxima linha, Esc para cancelar a edição da célula. Células em branco mantêm o valor atual do catálogo.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={downloadTemplate}
            class="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            <Download class="h-3.5 w-3.5" />
            Modelo CSV
          </button>
          <button
            type="button"
            onClick={() => setPasteModalOpen(true)}
            class="inline-flex items-center gap-1 rounded-md bg-[#93509e] px-3 py-1.5 font-bold text-white hover:bg-[#7c3f87]"
          >
            <ClipboardPaste class="h-3.5 w-3.5" />
            Colar Excel / Google Sheets
          </button>
          <label class="inline-flex cursor-pointer items-center gap-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 font-semibold text-zinc-700 hover:bg-zinc-50">
            Importar arquivo
            <input
              type="file"
              accept=".csv,.txt"
              class="hidden"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) handleCsvFile(file);
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => setShowBatches(!showBatches())}
            class="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            <History class="h-3.5 w-3.5" />
            Histórico
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div class="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white p-3 text-xs">
        <select
          value={selectedProductId()}
          onChange={(e) =>
            setSelectedProductId(
              e.currentTarget.value ? Number(e.currentTarget.value) : "",
            )
          }
          class="h-9 min-w-[200px] flex-1 rounded-md border border-zinc-300 bg-white px-2.5"
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
        <input
          type="search"
          placeholder="Buscar por SKU ou variação..."
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
          class="h-9 min-w-[180px] flex-1 rounded-md border border-zinc-300 px-3"
        />
        <button
          type="button"
          onClick={() => void loadVariants()}
          disabled={busy()}
          class="h-9 rounded-md bg-zinc-900 px-4 font-semibold text-white hover:bg-zinc-800"
        >
          Carregar grade
        </button>
        <button
          type="button"
          onClick={addEmptyRow}
          class="inline-flex h-9 items-center gap-1 rounded-md border border-zinc-300 bg-white px-3 font-semibold text-zinc-800 hover:bg-zinc-50"
        >
          <Plus class="h-3.5 w-3.5" />
          Nova variação
        </button>
      </div>

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

      {/* Diff Preview Summary */}
      <Show when={preview()}>
        {(prev) => (
          <div class="space-y-3 rounded-lg border border-purple-200 bg-purple-50/40 p-4 text-xs">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex flex-wrap gap-3 font-medium">
                <span>Linhas: <strong>{prev().summary.total_rows}</strong></span>
                <span>Atualizações: <strong>{prev().summary.update_count}</strong></span>
                <span>Novas: <strong>{prev().summary.new_count}</strong></span>
                <Show when={(prev().summary.unknown_skus?.length ?? 0) > 0}>
                  <span class="font-bold text-red-700">
                    SKUs desconhecidos: {prev().summary.unknown_skus?.join(", ")}
                  </span>
                </Show>
                <Show when={prev().summary.duplicate_skus.length > 0}>
                  <span class="font-bold text-red-700">
                    SKUs repetidos: {prev().summary.duplicate_skus.join(", ")}
                  </span>
                </Show>
              </div>
              <Show when={prev().summary.invalid_count > 0 && prev().rows.some((r) => r.errors.length === 0)}>
                <button
                  type="button"
                  disabled={busy()}
                  onClick={() => void commitBatch(true)}
                  class="rounded-md bg-[#93509e] px-3 py-1.5 font-bold text-white hover:bg-[#7c3f87]"
                >
                  Aplicar apenas as {prev().summary.total_rows - prev().summary.invalid_count} válidas
                </button>
              </Show>
            </div>

            <Show when={prev().rows.some((r) => (r.changes?.length ?? 0) > 0 || (r.impacts?.length ?? 0) > 0)}>
              <div class="max-h-52 overflow-auto rounded border border-zinc-200 bg-white">
                <table class="w-full min-w-[540px] border-collapse text-left text-[11px]">
                  <thead>
                    <tr class="border-b border-zinc-200 bg-zinc-50 text-zinc-600">
                      <th class="sticky left-0 bg-zinc-50 px-2.5 py-1.5">SKU</th>
                      <th class="px-2.5 py-1.5">Campo</th>
                      <th class="px-2.5 py-1.5">Atual</th>
                      <th class="px-2.5 py-1.5">Novo</th>
                      <th class="px-2.5 py-1.5">Regras / Alertas</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-zinc-100">
                    <For each={prev().rows.filter((r) => (r.changes?.length ?? 0) > 0 || r.errors.length > 0 || (r.impacts?.length ?? 0) > 0)}>
                      {(r) => (
                        <tr>
                          <td class="sticky left-0 bg-white px-2.5 py-1.5 font-mono font-semibold">{r.sku}</td>
                          <td class="px-2.5 py-1.5">
                            <For each={r.changes ?? []}>{(c) => <div>{c.label}</div>}</For>
                          </td>
                          <td class="px-2.5 py-1.5 tabular-nums text-zinc-500">
                            <For each={r.changes ?? []}>{(c) => <div>{c.old_display}</div>}</For>
                          </td>
                          <td class="px-2.5 py-1.5 font-semibold tabular-nums text-zinc-900">
                            <For each={r.changes ?? []}>{(c) => <div>{c.new_display}</div>}</For>
                          </td>
                          <td class="px-2.5 py-1.5">
                            <For each={r.errors}>{(e) => <p class="text-red-700 font-semibold">{e}</p>}</For>
                            <For each={r.impacts ?? []}>{(im) => <p class="text-[#62298d]">{im}</p>}</For>
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>
          </div>
        )}
      </Show>

      {/* Main Editable Grid with Sticky SKU/Product column on horizontal scroll */}
      <Show when={rows().length > 0}>
        <div class="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table class="w-full min-w-[780px] border-collapse text-left text-xs">
            <thead>
              <tr class="border-b border-zinc-200 bg-zinc-50 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
                <th class="sticky left-0 z-10 min-w-[180px] bg-zinc-50 px-2.5 py-2.5">
                  SKU / Produto
                </th>
                <th class="px-2 py-2.5">Nome / Tonalidade</th>
                <th class="w-24 px-2 py-2.5">Cód. Cor</th>
                <th class="w-28 px-2 py-2.5 text-right">Preço (R$)</th>
                <th class="w-36 px-2 py-2.5 text-right">Promoção (R$)</th>
                <th class="w-24 px-2 py-2.5 text-right">Estoque</th>
                <th class="w-28 px-2 py-2.5">Situação</th>
                <th class="w-10 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-100">
              <Index each={rows()}>
                {(r, idx) => (
                  <tr class={r().errors && r().errors!.length > 0 ? "bg-red-50/50" : ""}>
                    <td class="sticky left-0 z-10 bg-white px-2.5 py-2">
                      <input
                        type="text"
                        data-grid-cell={`${idx}:sku`}
                        value={r().sku}
                        onFocus={() => handleCellFocus(idx, "sku", r().sku)}
                        onInput={(e) =>
                          updateCell(idx, "sku", e.currentTarget.value.toUpperCase())
                        }
                        onKeyDown={(e) => handleGridKeyDown(e, idx, "sku")}
                        placeholder="SKU"
                        class="h-8 w-full rounded border border-zinc-300 px-2 font-mono text-[11px] uppercase focus:border-[#93509e] focus:outline-none"
                      />
                      <p class="mt-0.5 truncate max-w-[170px] text-[10px] text-zinc-500">
                        {r().product_name}
                      </p>
                      <Show when={r().errors && r().errors!.length > 0}>
                        <p class="mt-0.5 text-[10px] font-semibold text-red-700">
                          {r().errors?.join(" ")}
                        </p>
                      </Show>
                    </td>
                    <td class="px-2 py-2">
                      <input
                        type="text"
                        data-grid-cell={`${idx}:name`}
                        value={r().name}
                        onFocus={() => handleCellFocus(idx, "name", r().name)}
                        onInput={(e) => updateCell(idx, "name", e.currentTarget.value)}
                        onKeyDown={(e) => handleGridKeyDown(e, idx, "name")}
                        placeholder="Manter atual"
                        class="h-8 w-full rounded border border-zinc-300 px-2 focus:border-[#93509e] focus:outline-none"
                      />
                    </td>
                    <td class="px-2 py-2">
                      <input
                        type="text"
                        data-grid-cell={`${idx}:shade_code`}
                        value={r().shade_code}
                        onFocus={() => handleCellFocus(idx, "shade_code", r().shade_code)}
                        onInput={(e) => updateCell(idx, "shade_code", e.currentTarget.value)}
                        onKeyDown={(e) => handleGridKeyDown(e, idx, "shade_code")}
                        class="h-8 w-full rounded border border-zinc-300 px-2 focus:border-[#93509e] focus:outline-none"
                      />
                    </td>
                    <td class="px-2 py-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        data-grid-cell={`${idx}:price_brl`}
                        value={r().price_brl}
                        onFocus={() => handleCellFocus(idx, "price_brl", r().price_brl)}
                        onInput={(e) => updateCell(idx, "price_brl", e.currentTarget.value)}
                        onKeyDown={(e) => handleGridKeyDown(e, idx, "price_brl")}
                        placeholder="Manter"
                        class="h-8 w-full rounded border border-zinc-300 px-2 text-right tabular-nums focus:border-[#93509e] focus:outline-none"
                      />
                    </td>
                    <td class="px-2 py-2">
                      <div class="flex items-center gap-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          disabled={Boolean(r().clear_promo)}
                          data-grid-cell={`${idx}:promo_price_brl`}
                          value={r().clear_promo ? "" : r().promo_price_brl}
                          onFocus={() =>
                            handleCellFocus(idx, "promo_price_brl", r().promo_price_brl)
                          }
                          onInput={(e) =>
                            updateCell(idx, "promo_price_brl", e.currentTarget.value)
                          }
                          onKeyDown={(e) => handleGridKeyDown(e, idx, "promo_price_brl")}
                          placeholder={r().clear_promo ? "Remover" : "Manter"}
                          class="h-8 w-full rounded border border-zinc-300 px-2 text-right tabular-nums focus:border-[#93509e] focus:outline-none disabled:bg-zinc-100"
                        />
                        <button
                          type="button"
                          title="Limpar promoção explicitamente"
                          onClick={() => updateCell(idx, "clear_promo", !r().clear_promo)}
                          class={`h-8 shrink-0 rounded border px-1.5 text-[10px] font-semibold ${
                            r().clear_promo
                              ? "border-[#93509e] bg-purple-50 text-[#62298d]"
                              : "border-zinc-200 text-zinc-500"
                          }`}
                        >
                          Limpar
                        </button>
                      </div>
                    </td>
                    <td class="px-2 py-2">
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        data-grid-cell={`${idx}:stock_qty`}
                        value={r().stock_qty ?? ""}
                        onFocus={() =>
                          handleCellFocus(
                            idx,
                            "stock_qty",
                            r().stock_qty === null ? "" : String(r().stock_qty),
                          )
                        }
                        onInput={(e) =>
                          updateCell(
                            idx,
                            "stock_qty",
                            e.currentTarget.value === ""
                              ? null
                              : Number(e.currentTarget.value),
                          )
                        }
                        onKeyDown={(e) => handleGridKeyDown(e, idx, "stock_qty")}
                        placeholder="Manter"
                        class="h-8 w-full rounded border border-zinc-300 px-2 text-right tabular-nums focus:border-[#93509e] focus:outline-none"
                      />
                    </td>
                    <td class="px-2 py-2 text-[11px] font-medium text-zinc-600">
                      {r().action === "update"
                        ? "Atualizar"
                        : r().action === "create"
                          ? "Criar"
                          : r().action === "unknown_sku"
                            ? "SKU não existe"
                            : "Editando"}
                    </td>
                    <td class="px-2 py-2 text-right">
                      <Show when={!r().variant_id}>
                        <button
                          type="button"
                          aria-label={`Remover linha ${r().sku || idx}`}
                          onClick={() => removeUnsavedRow(idx)}
                          class="rounded p-1 text-red-700 hover:bg-red-50"
                        >
                          <Trash2 class="h-3.5 w-3.5" />
                        </button>
                      </Show>
                    </td>
                  </tr>
                )}
              </Index>
            </tbody>
          </table>
        </div>

        {/* Sticky action bar visible above mobile keyboard */}
        <div class="sticky bottom-0 z-20 flex flex-wrap items-center justify-end gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-sm">
          <button
            type="button"
            disabled={busy()}
            onClick={() => void runPreview()}
            class="rounded-md border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
          >
            Pré-visualizar alterações
          </button>
          <button
            type="button"
            disabled={busy()}
            onClick={() => void commitBatch(false)}
            class="rounded-md bg-[#93509e] px-5 py-2 text-xs font-bold text-white hover:bg-[#7c3f87] disabled:opacity-60"
          >
            {busy() ? "Gravando..." : "Aplicar alterações"}
          </button>
        </div>
      </Show>

      {/* Paste Excel / Google Sheets Modal */}
      <Show when={pasteModalOpen()}>
        <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4">
          <div class="w-full max-w-2xl space-y-3 rounded-t-xl border border-zinc-200 bg-white p-5 sm:rounded-xl">
            <h3 class="text-sm font-bold text-zinc-900">
              Colar planilha (Excel / Google Sheets)
            </h3>
            <p class="text-xs text-zinc-600">
              Quando houver coluna <strong>SKU</strong>, os dados são casados pelo código mesmo fora de ordem. Células vazias mantêm o catálogo atual; digite <code>[LIMPAR]</code> em Preço Promo para remover a promoção.
            </p>
            <textarea
              rows={8}
              value={rawPaste()}
              onInput={(e) => setRawPaste(e.currentTarget.value)}
              placeholder={"SKU\tPreço\tEstoque\nMF-ESM-001-ROS\t24,90\t30\nMF-ESM-001-RUB\t\t15"}
              class="w-full rounded-md border border-zinc-300 p-3 font-mono text-xs focus:border-[#93509e] focus:outline-none"
            />
            <div class="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPasteModalOpen(false)}
                class="rounded-md border border-zinc-300 px-3.5 py-2 text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy() || !rawPaste().trim()}
                onClick={() => void handleParsePaste()}
                class="rounded-md bg-[#93509e] px-4 py-2 text-xs font-bold text-white hover:bg-[#7c3f87] disabled:opacity-60"
              >
                Processar planilha
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* Historical Batches Panel */}
      <Show when={showBatches()}>
        <div class="rounded-lg border border-zinc-200 bg-white p-4 text-xs">
          <h3 class="mb-2 font-bold text-zinc-900">
            Histórico de operações em massa
          </h3>
          <ul class="divide-y divide-zinc-100">
            <For each={batches() ?? []}>
              {(b) => (
                <li class="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <span class="font-mono font-bold text-zinc-900">
                      {b.batch_code}
                    </span>{" "}
                    <span class="text-zinc-500">
                      ({b.operation_type || b.source}) · por {b.user?.name ?? "Operador"}
                    </span>
                  </div>
                  <div class="text-zinc-700">
                    +{b.created_count} / {b.updated_count} atualizados
                    <Show when={(b.skipped_count ?? 0) > 0}>
                      {" "}· {b.skipped_count} ignorados
                    </Show>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
    </div>
  );
}
