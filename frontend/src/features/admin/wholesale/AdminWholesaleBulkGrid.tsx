import { For, Show, createSignal, onMount } from "solid-js";
import AlertTriangle from "lucide-solid/icons/triangle-exclamation-point";
import CheckCircle from "lucide-solid/icons/circle-check";
import Clipboard from "lucide-solid/icons/clipboard";
import FileSpreadsheet from "lucide-solid/icons/file-spreadsheet";
import Search from "lucide-solid/icons/search";
import X from "lucide-solid/icons/x";
import { api } from "../../../lib/api";
import { formatCents } from "../../../lib/format";

interface BulkGridRow {
  type: "product" | "variant";
  id: string | number;
  product_id: number;
  variant_id: number | null;
  name: string;
  sku: string;
  brand_name: string | null;
  retail_price_cents: number;
  has_wholesale: boolean;
  wholesale_rule_id: number | null;
  wholesale_rule_name: string | null;
  min_quantity: number;
  wholesale_price_cents: number | null;
  wholesale_group_id: number | null;
  wholesale_group_name: string | null;
  variants_count: number;
}

interface PreviewItem {
  sku: string;
  product_id: number;
  product_variant_id: number | null;
  name: string;
  current_retail_cents: number;
  new_wholesale_cents: number;
  min_quantity: number;
  discount_cents: number;
  discount_percent: number;
}

interface BulkPreviewResult {
  valid_count: number;
  error_count: number;
  items: PreviewItem[];
  errors: Array<{ row: number; sku: string; error: string }>;
}

export function AdminWholesaleBulkGrid() {
  const [rows, setRows] = createSignal<BulkGridRow[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [searchTerm, setSearchTerm] = createSignal("");
  const [excelModalOpen, setExcelModalOpen] = createSignal(false);
  const [pastedText, setPastedText] = createSignal("");
  const [previewResult, setPreviewResult] =
    createSignal<BulkPreviewResult | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [statusMsg, setStatusMsg] = createSignal<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const loadGrid = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: BulkGridRow[] }>(
        "/admin/wholesale/bulk-grid",
        {
          search: searchTerm() || undefined,
        },
      );
      setRows(res.data);
    } catch {
      //
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    void loadGrid();
  });

  const handleSearch = (e: Event) => {
    e.preventDefault();
    void loadGrid();
  };

  const handleParseAndPreview = async () => {
    if (!pastedText().trim()) return;
    setBusy(true);
    setStatusMsg(null);
    try {
      // Parse clipboard lines
      const parseRes = await api.post<{
        data: Array<{
          sku: string;
          wholesale_price_cents: number;
          min_quantity: number;
        }>;
      }>("/admin/wholesale/bulk-parse", { pasted_text: pastedText() });

      if (parseRes.data.length === 0) {
        setStatusMsg({
          type: "err",
          text: "Nenhuma linha válida encontrada no texto colado.",
        });
        setBusy(false);
        return;
      }

      // Preview diff
      const previewRes = await api.post<{ data: BulkPreviewResult }>(
        "/admin/wholesale/bulk-preview",
        { items: parseRes.data },
      );
      setPreviewResult(previewRes.data);
    } catch {
      setStatusMsg({ type: "err", text: "Erro ao processar dados da tabela." });
    } finally {
      setBusy(false);
    }
  };

  const handleApplyCommit = async () => {
    if (!previewResult() || previewResult()!.items.length === 0) return;
    setBusy(true);
    try {
      const res = await api.post<{
        success: boolean;
        applied_count: number;
        message: string;
      }>("/admin/wholesale/bulk-apply", {
        items: previewResult()!.items.map((i) => ({
          sku: i.sku,
          wholesale_price_cents: i.new_wholesale_cents,
          min_quantity: i.min_quantity,
        })),
      });

      if (res.success) {
        setStatusMsg({ type: "ok", text: res.message });
        setExcelModalOpen(false);
        setPreviewResult(null);
        setPastedText("");
        void loadGrid();
      } else {
        setStatusMsg({ type: "err", text: res.message });
      }
    } catch {
      setStatusMsg({
        type: "err",
        text: "Erro ao aplicar atualização em massa.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="space-y-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 class="text-base font-bold text-[#2E0C49]">
            Edição em Massa de Preços de Atacado
          </h2>
          <p class="text-xs text-zinc-500">
            Visualize o catálogo ou cole dados diretamente do Excel / Google
            Sheets para atualizar preços e quantidades mínimas.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setExcelModalOpen(true);
              setPreviewResult(null);
              setStatusMsg(null);
            }}
            class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-800"
          >
            <FileSpreadsheet class="size-4" />
            <span>Colar do Excel / Sheets</span>
          </button>
        </div>
      </div>

      <Show when={statusMsg()}>
        {(msg) => (
          <div
            class={`rounded-lg p-3 text-xs font-semibold ${
              msg().type === "ok"
                ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {msg().text}
          </div>
        )}
      </Show>

      {/* Filter / Search Bar */}
      <form onSubmit={handleSearch} class="flex items-center gap-2">
        <div class="relative flex-1">
          <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={searchTerm()}
            onInput={(e) => setSearchTerm(e.currentTarget.value)}
            placeholder="Buscar por nome do produto ou SKU..."
            class="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-xs focus:border-[#93509e] focus:outline-none"
          />
        </div>
        <button
          type="submit"
          class="rounded-lg bg-[#93509e] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#7c3f87]"
        >
          Filtrar
        </button>
      </form>

      {/* Grid Table */}
      <div class="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs">
        <table class="w-full text-left text-xs">
          <thead class="border-b border-zinc-200 bg-zinc-50 font-bold text-[#5B486B]">
            <tr>
              <th class="p-3.5">Produto / Variação</th>
              <th class="p-3.5">SKU</th>
              <th class="p-3.5">Marca</th>
              <th class="p-3.5">Preço Varejo</th>
              <th class="p-3.5">Preço Atacado (A partir de)</th>
              <th class="p-3.5">Qtd. Mínima</th>
              <th class="p-3.5">Regra / Grupo</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-100">
            <Show
              when={rows().length > 0}
              fallback={
                <tr>
                  <td colspan={7} class="p-8 text-center text-zinc-500">
                    {loading()
                      ? "Carregando catálogo..."
                      : "Nenhum produto encontrado com os filtros informados."}
                  </td>
                </tr>
              }
            >
              <For each={rows()}>
                {(row) => (
                  <tr
                    class={`hover:bg-zinc-50/80 ${row.type === "variant" ? "bg-zinc-50/30 text-zinc-600" : "font-medium text-[#2E0C49]"}`}
                  >
                    <td class="p-3.5">
                      <span
                        class={
                          row.type === "variant"
                            ? "pl-3 text-zinc-600"
                            : "font-bold text-[#2E0C49]"
                        }
                      >
                        {row.name}
                      </span>
                    </td>
                    <td class="p-3.5 font-mono text-[11px] text-zinc-500">
                      {row.sku}
                    </td>
                    <td class="p-3.5">{row.brand_name || "-"}</td>
                    <td class="p-3.5 font-semibold">
                      {formatCents(row.retail_price_cents)}
                    </td>
                    <td class="p-3.5">
                      <Show
                        when={row.has_wholesale && row.wholesale_price_cents}
                        fallback={
                          <span class="text-zinc-400">Padrão varejo</span>
                        }
                      >
                        <span class="font-bold text-emerald-700">
                          {formatCents(row.wholesale_price_cents!)}
                        </span>
                      </Show>
                    </td>
                    <td class="p-3.5">
                      <Show when={row.has_wholesale}>
                        <span class="rounded bg-purple-50 px-2 py-0.5 font-bold text-[#7C2784]">
                          {row.min_quantity}+ un.
                        </span>
                      </Show>
                    </td>
                    <td class="p-3.5 text-[11px] text-zinc-500">
                      {row.wholesale_rule_name ||
                        row.wholesale_group_name ||
                        "-"}
                    </td>
                  </tr>
                )}
              </For>
            </Show>
          </tbody>
        </table>
      </div>

      {/* Excel Paste Modal */}
      <Show when={excelModalOpen()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div class="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setExcelModalOpen(false)}
              aria-label="Fechar"
              class="absolute right-4 top-4 text-zinc-400 hover:text-zinc-600"
            >
              <X class="size-5" />
            </button>

            <div class="flex items-center gap-2 text-emerald-800">
              <FileSpreadsheet class="size-6 text-emerald-600" />
              <h3 class="text-base font-bold text-[#2E0C49]">
                Colar Dados do Excel ou Google Sheets
              </h3>
            </div>
            <p class="mt-1 text-xs text-zinc-500">
              Copie as colunas da sua planilha e cole abaixo. Formato esperado:{" "}
              <strong class="text-zinc-800">
                SKU [TAB] Preço Atacado (R$) [TAB] Quantidade Mínima
              </strong>
              .
            </p>

            <div class="mt-4">
              <textarea
                rows={6}
                value={pastedText()}
                onInput={(e) => setPastedText(e.currentTarget.value)}
                placeholder={
                  "ESM-LIR-001\tR$ 5,90\t6\nESM-LIR-002\tR$ 5,90\t6\nCAB-SUN8-01\tR$ 49,90\t3"
                }
                class="w-full rounded-lg border border-zinc-300 p-3 font-mono text-xs focus:border-[#93509e] focus:outline-none"
              />
            </div>

            <div class="mt-3 flex items-center justify-between">
              <span class="text-[11px] text-zinc-400">
                Suporta formatos de moeda brasileira (R$ 5,90 ou 5.90) com
                separador de linha automático.
              </span>
              <button
                type="button"
                disabled={busy() || !pastedText().trim()}
                onClick={() => void handleParseAndPreview()}
                class="inline-flex items-center gap-1.5 rounded-lg bg-[#93509e] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#7c3f87] disabled:opacity-50"
              >
                <Clipboard class="size-4" />
                <span>
                  {busy() ? "Processando..." : "Pré-visualizar Alterações"}
                </span>
              </button>
            </div>

            {/* Preview Results Table */}
            <Show when={previewResult()}>
              <div class="mt-5 space-y-3 border-t border-zinc-200 pt-4">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3 text-xs">
                    <span class="inline-flex items-center gap-1 font-bold text-emerald-700">
                      <CheckCircle class="size-4" />
                      {previewResult()!.valid_count} itens válidos
                    </span>
                    <Show when={previewResult()!.error_count > 0}>
                      <span class="inline-flex items-center gap-1 font-bold text-amber-700">
                        <AlertTriangle class="size-4" />
                        {previewResult()!.error_count} erros / ignorados
                      </span>
                    </Show>
                  </div>
                  <button
                    type="button"
                    disabled={busy() || previewResult()!.valid_count === 0}
                    onClick={() => void handleApplyCommit()}
                    class="rounded-lg bg-emerald-700 px-5 py-2 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                  >
                    {busy() ? "Salvando..." : "Confirmar e Aplicar no Atacado"}
                  </button>
                </div>

                <div class="max-h-60 overflow-y-auto rounded-lg border border-zinc-200">
                  <table class="w-full text-left text-xs">
                    <thead class="bg-zinc-50 font-semibold text-zinc-600">
                      <tr>
                        <th class="p-2">SKU</th>
                        <th class="p-2">Produto</th>
                        <th class="p-2">Varejo Atual</th>
                        <th class="p-2">Novo Atacado</th>
                        <th class="p-2">Mín. Un.</th>
                        <th class="p-2">Desconto</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-zinc-100">
                      <For each={previewResult()!.items}>
                        {(item) => (
                          <tr class="hover:bg-zinc-50">
                            <td class="p-2 font-mono text-[11px] font-bold text-[#2E0C49]">
                              {item.sku}
                            </td>
                            <td class="p-2">{item.name}</td>
                            <td class="p-2 text-zinc-500">
                              {formatCents(item.current_retail_cents)}
                            </td>
                            <td class="p-2 font-bold text-emerald-700">
                              {formatCents(item.new_wholesale_cents)}
                            </td>
                            <td class="p-2">{item.min_quantity} un.</td>
                            <td class="p-2 font-semibold text-purple-700">
                              -{item.discount_percent}%
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>

                <Show when={previewResult()!.errors.length > 0}>
                  <div class="rounded-lg bg-red-50 p-3 text-xs text-red-700">
                    <p class="font-bold">Avisos e erros encontrados:</p>
                    <ul class="mt-1 list-disc pl-4 space-y-0.5">
                      <For each={previewResult()!.errors}>
                        {(err) => (
                          <li>
                            Linha {err.row} (SKU: {err.sku || "?"}): {err.error}
                          </li>
                        )}
                      </For>
                    </ul>
                  </div>
                </Show>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
