import Check from "lucide-solid/icons/check";
import CheckCircle2 from "lucide-solid/icons/circle-check";
import AlertTriangle from "lucide-solid/icons/triangle-exclamation-point";
import FilePlus from "lucide-solid/icons/file-plus";
import FileSpreadsheet from "lucide-solid/icons/file-spreadsheet";
import Sparkles from "lucide-solid/icons/sparkles";
import Trash2 from "lucide-solid/icons/trash";
import { For, Show, createResource, createSignal } from "solid-js";
import { ApiError, api } from "../../../lib/api";
import { formatCents } from "../../../lib/format";
import {
  formatCentsToBrInput,
  parseBrazilianPriceToCents,
} from "../admin-helpers";
import {
  type AiProductImportDetail,
  type AiProductImportItemRow,
  aiActionTypeLabel,
  aiEvidenceOriginLabel,
} from "./ai-types";

export function AdminAiCatalogAgentPanel(props: {
  initialImportId?: number | null;
  onCommitted?: () => Promise<void> | void;
}) {
  const [instruction, setInstruction] = createSignal("");
  const [rawText, setRawText] = createSignal("");
  const [selectedFiles, setSelectedFiles] = createSignal<File[]>([]);
  const [activeImportId, setActiveImportId] = createSignal<number | null>(
    props.initialImportId ?? null,
  );
  const [selectedItemIds, setSelectedItemIds] = createSignal<number[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [feedback, setFeedback] = createSignal<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

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

  async function processWithAi(e: Event) {
    e.preventDefault();
    if (
      selectedFiles().length === 0 &&
      !instruction().trim() &&
      !rawText().trim()
    ) {
      setFeedback({
        type: "err",
        text: "Descreva os produtos, cole uma tabela ou anexe arquivos (.xlsx, .csv, .pdf, imagens).",
      });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const fd = new FormData();
      if (activeImportId()) {
        fd.append("import_id", String(activeImportId()));
      }
      if (instruction().trim()) {
        fd.append("instruction", instruction().trim());
      }
      if (rawText().trim()) {
        fd.append("raw_text", rawText().trim());
      }
      for (const file of selectedFiles()) {
        fd.append("files[]", file);
      }

      const res = await api<{ data: AiProductImportDetail }>(
        "/admin/ai/catalog/imports",
        {
          method: "POST",
          body: fd,
          timeoutMs: 60000,
        },
      );

      setActiveImportId(res.data.id);
      setInstruction("");
      setRawText("");
      setSelectedFiles([]);
      setSelectedItemIds([]);
      setFeedback({
        type: "ok",
        text: `Rascunho #${res.data.id} preparado com ${res.data.grouped_products_count} produto(s) e ${res.data.grouped_variants_count} variação(ões) para revisão.`,
      });
      await Promise.all([refetchList(), refetchDetail()]);
    } catch (err) {
      setFeedback({
        type: "err",
        text:
          err instanceof ApiError
            ? err.message
            : "Não foi possível processar o cadastro com IA.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function updateItemField(
    importId: number,
    item: AiProductImportItemRow,
    patch: Record<string, unknown>,
  ) {
    setBusy(true);
    try {
      await api(`/admin/ai/catalog/imports/${importId}/items/${item.id}`, {
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
            : "Falha ao atualizar item do rascunho.",
      });
    } finally {
      setBusy(false);
    }
  }

  function toggleSelection(itemId: number) {
    setSelectedItemIds((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId],
    );
  }

  async function approveImport(onlySelected: boolean) {
    const detail = importDetail();
    if (!detail) return;
    setBusy(true);
    setFeedback(null);
    try {
      const payload = onlySelected ? { item_ids: selectedItemIds() } : {};
      const res = await api<{
        data: {
          created_products: number;
          created_variants: number;
          updated_variants: number;
        };
      }>(`/admin/ai/catalog/imports/${detail.id}/approve`, {
        method: "POST",
        body: payload,
      });
      setFeedback({
        type: "ok",
        text: `Publicação concluída: ${res.data.created_products} produto(s) novo(s), ${res.data.created_variants} variação(ões) criada(s) e ${res.data.updated_variants} atualizada(s).`,
      });
      await Promise.all([refetchList(), refetchDetail()]);
      await props.onCommitted?.();
    } catch (err) {
      setFeedback({
        type: "err",
        text:
          err instanceof ApiError
            ? err.message
            : "Revise os itens com pendências de SKU ou preço antes de aprovar.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function discardImport() {
    const detail = importDetail();
    if (!detail) return;
    setBusy(true);
    try {
      await api(`/admin/ai/catalog/imports/${detail.id}/discard`, {
        method: "POST",
      });
      setFeedback({
        type: "ok",
        text: `Rascunho #${detail.id} descartado.`,
      });
      setActiveImportId(null);
      await refetchList();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="space-y-6">
      <Show when={feedback()}>
        {(f) => (
          <p
            role="status"
            class={`rounded-xl border px-4 py-2.5 text-sm font-medium ${
              f().type === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {f().text}
          </p>
        )}
      </Show>

      <div class="grid gap-6 lg:grid-cols-12">
        {/* Entrada Conversacional + Arquivos */}
        <form
          onSubmit={(e) => void processWithAi(e)}
          class="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 lg:col-span-5"
        >
          <div class="flex items-center justify-between">
            <div>
              <h2 class="flex items-center gap-2 text-base font-bold text-zinc-900">
                <Sparkles class="size-4 text-[#93509e]" />
                Agente de Cadastro Inteligente
              </h2>
              <p class="mt-0.5 text-xs text-zinc-500">
                Envie planilhas (.xlsx, .csv), fichas PDF, imagens ou descreva a
                coleção para gerar rascunhos revisáveis.
              </p>
            </div>
            <Show when={activeImportId()}>
              <button
                type="button"
                onClick={() => {
                  setActiveImportId(null);
                  setSelectedItemIds([]);
                }}
                class="rounded-md border border-zinc-300 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Novo lote
              </button>
            </Show>
          </div>

          <div>
            <label class="block text-xs font-semibold text-zinc-700">
              Descreva os produtos que deseja cadastrar (ou continue o rascunho)
            </label>
            <textarea
              rows={3}
              value={instruction()}
              onInput={(e) => setInstruction(e.currentTarget.value)}
              placeholder='Ex.: "Cadastre a linha de esmaltes em gel da marca X, 15 ml, nas cores Nude 017, Nude 018, Rosa 042 e Vermelho 005. Todos custam R$ 19,90 e possuem estoque inicial de 10 unidades."'
              class="mt-1 w-full rounded-lg border border-zinc-300 p-2.5 text-xs focus:border-[#93509e] focus:outline-none"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-zinc-700">
              Anexar arquivos do fornecedor (.xlsx, .csv, .pdf, .jpg, .png,
              .webp)
            </label>
            <label class="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[#DFC2E3] bg-[#FCF8FD] px-4 py-3 text-xs font-semibold text-[#93509e] hover:bg-[#F3E2F6]/60">
              <FilePlus class="size-4" />
              <span>
                {selectedFiles().length > 0
                  ? `${selectedFiles().length} arquivo(s) selecionado(s)`
                  : "Selecionar planilhas, fichas PDF ou fotos de embalagens"}
              </span>
              <input
                type="file"
                multiple
                accept=".xlsx,.csv,.tsv,.txt,.pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => {
                  const list = e.currentTarget.files;
                  setSelectedFiles(list ? Array.from(list) : []);
                }}
                class="hidden"
              />
            </label>
            <Show when={selectedFiles().length > 0}>
              <ul class="mt-1.5 space-y-1 text-[11px] text-zinc-600">
                <For each={selectedFiles()}>
                  {(file) => (
                    <li class="flex items-center gap-1.5">
                      <FileSpreadsheet class="size-3.5 text-[#93509e]" />
                      {file.name}
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>

          <div>
            <label class="block text-xs font-semibold text-zinc-700">
              Ou cole linhas de planilha / ficha técnica aqui
            </label>
            <textarea
              rows={4}
              value={rawText()}
              onInput={(e) => setRawText(e.currentTarget.value)}
              placeholder="Cole colunas copiadas do Excel, CSV ou especificação do fornecedor..."
              class="mt-1 w-full rounded-lg border border-zinc-300 p-2.5 font-mono text-[11px] focus:border-[#93509e] focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={busy()}
            class="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#93509e] px-4 text-xs font-bold text-white hover:bg-[#7c3f87] disabled:opacity-50"
          >
            <Sparkles class="size-4" />
            {busy()
              ? "Processando e validando catálogo..."
              : activeImportId()
                ? `Atualizar rascunho #${activeImportId()} com IA`
                : "Processar com IA e preparar revisão"}
          </button>

          {/* Rascunhos recentes para retomar */}
          <Show when={(importsList()?.length ?? 0) > 0}>
            <div class="border-t border-zinc-100 pt-3">
              <p class="mb-2 text-[11px] font-bold uppercase text-zinc-500">
                Lotes recentes / rascunhos
              </p>
              <div class="max-h-44 space-y-1.5 overflow-y-auto">
                <For each={importsList() ?? []}>
                  {(imp) => (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveImportId(imp.id);
                        setSelectedItemIds([]);
                      }}
                      class={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                        activeImportId() === imp.id
                          ? "border-[#93509e] bg-[#FCF8FD]"
                          : "border-zinc-200 hover:bg-zinc-50"
                      }`}
                    >
                      <div>
                        <p class="font-bold text-zinc-900">
                          Lote #{imp.id} ({imp.source_type.toUpperCase()})
                        </p>
                        <p class="text-[11px] text-zinc-500">
                          {imp.grouped_products_count} produto(s) ·{" "}
                          {imp.grouped_variants_count} variação(ões)
                        </p>
                      </div>
                      <span
                        class={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          imp.status === "awaiting_review"
                            ? "bg-amber-100 text-amber-800"
                            : imp.status === "approved"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {imp.status === "awaiting_review"
                          ? "Aguardando revisão"
                          : imp.status === "approved"
                            ? "Publicado"
                            : imp.status}
                      </span>
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </form>

        {/* Tela obrigatoria de revisao em lote */}
        <section class="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 lg:col-span-7">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-3">
            <div>
              <h2 class="text-base font-bold text-zinc-900">
                Revisar cadastros preparados pela IA
              </h2>
              <p class="text-xs text-zinc-500">
                Nenhuma alteração vai para a loja antes da sua revisão e
                aprovação comercial.
              </p>
            </div>
            <Show when={importDetail()}>
              {(d) => (
                <div class="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={busy() || selectedItemIds().length === 0}
                    onClick={() => void approveImport(true)}
                    class="inline-flex h-8 items-center gap-1 rounded-lg border border-[#93509e] px-3 text-xs font-bold text-[#93509e] hover:bg-[#FCF8FD] disabled:opacity-40"
                  >
                    <Check class="size-3.5" />
                    Aprovar selecionados ({selectedItemIds().length})
                  </button>
                  <button
                    type="button"
                    disabled={busy() || d().status === "approved"}
                    onClick={() => void approveImport(false)}
                    class="inline-flex h-8 items-center gap-1 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-40"
                  >
                    <CheckCircle2 class="size-3.5" />
                    Aprovar todos os válidos
                  </button>
                  <button
                    type="button"
                    disabled={busy() || d().status === "approved"}
                    onClick={() => void discardImport()}
                    class="inline-flex h-8 items-center gap-1 rounded-lg border border-red-200 px-2.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40"
                  >
                    <Trash2 class="size-3.5" />
                    Descartar
                  </button>
                </div>
              )}
            </Show>
          </div>

          <Show
            when={importDetail()}
            fallback={
              <div class="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/70 p-8 text-center">
                <FileSpreadsheet class="mx-auto mb-2 size-8 text-zinc-400" />
                <p class="text-sm font-semibold text-zinc-700">
                  Nenhum lote aberto para revisão
                </p>
                <p class="mt-1 text-xs text-zinc-500">
                  Envie uma planilha, ficha PDF ou instrução ao lado para o
                  Agente de Cadastro organizar produtos e variações.
                </p>
              </div>
            }
          >
            {(detail) => (
              <div class="space-y-4">
                {/* Resumo do processamento */}
                <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div class="rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 text-xs">
                    <span class="text-zinc-500">Produtos / Variações</span>
                    <p class="text-base font-black text-zinc-900">
                      {detail().grouped_products_count} /{" "}
                      {detail().grouped_variants_count}
                    </p>
                  </div>
                  <div class="rounded-lg border border-emerald-200 bg-emerald-50/60 p-2.5 text-xs">
                    <span class="text-emerald-700">Novos / Atualizações</span>
                    <p class="text-base font-black text-emerald-900">
                      {detail().new_count} / {detail().update_count}
                    </p>
                  </div>
                  <div class="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 text-xs">
                    <span class="text-amber-700">Duplicidades</span>
                    <p class="text-base font-black text-amber-900">
                      {detail().duplicate_count}
                    </p>
                  </div>
                  <div class="rounded-lg border border-red-200 bg-red-50/60 p-2.5 text-xs">
                    <span class="text-red-700">Incompletos / Erros</span>
                    <p class="text-base font-black text-red-900">
                      {detail().incomplete_count} / {detail().error_count}
                    </p>
                  </div>
                </div>

                {/* Historico conversacional quando houver */}
                <Show when={(detail().conversation_messages?.length ?? 0) > 0}>
                  <div class="space-y-1.5 rounded-lg border border-[#DFC2E3] bg-[#FCF8FD] p-3 text-xs">
                    <For each={detail().conversation_messages ?? []}>
                      {(msg) => (
                        <p class="text-zinc-700">
                          <strong
                            class={
                              msg.role === "assistant"
                                ? "text-[#93509e]"
                                : "text-zinc-900"
                            }
                          >
                            {msg.role === "assistant" ? "Agente IA:" : "Você:"}
                          </strong>{" "}
                          {msg.content}
                        </p>
                      )}
                    </For>
                  </div>
                </Show>

                {/* Grade editável */}
                <div class="overflow-x-auto rounded-lg border border-zinc-200">
                  <table class="w-full text-left text-xs">
                    <thead class="border-b border-zinc-200 bg-zinc-50 text-[11px] uppercase text-zinc-500">
                      <tr>
                        <th class="p-2">Sel.</th>
                        <th class="p-2">Produto / Marca / Categoria</th>
                        <th class="p-2">Variação</th>
                        <th class="p-2">SKU</th>
                        <th class="p-2">Preço (R$)</th>
                        <th class="p-2">Est.</th>
                        <th class="p-2">Situação &amp; Origem</th>
                        <th class="p-2">Ação</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-zinc-100">
                      <For each={detail().items}>
                        {(item) => (
                          <tr
                            class={
                              item.approval_status === "committed"
                                ? "bg-emerald-50/40"
                                : ""
                            }
                          >
                            <td class="p-2 align-top">
                              <input
                                type="checkbox"
                                disabled={item.approval_status === "committed"}
                                checked={selectedItemIds().includes(item.id)}
                                onChange={() => toggleSelection(item.id)}
                              />
                            </td>
                            <td class="min-w-[200px] p-2 align-top">
                              <input
                                type="text"
                                value={item.proposed_data.product_name}
                                onBlur={(e) => {
                                  const v = e.currentTarget.value.trim();
                                  if (
                                    v &&
                                    v !== item.proposed_data.product_name
                                  ) {
                                    void updateItemField(detail().id, item, {
                                      product_name: v,
                                    });
                                  }
                                }}
                                class="w-full rounded border border-zinc-200 px-2 py-1 text-xs font-bold"
                              />
                              <p class="mt-1 text-[10px] text-zinc-500">
                                Marca:{" "}
                                {item.proposed_data.brand_name ||
                                  "Não identificada"}{" "}
                                · Cat.:{" "}
                                {item.proposed_data.category_name || "Revisar"}
                              </p>
                            </td>
                            <td class="min-w-[120px] p-2 align-top">
                              <input
                                type="text"
                                value={item.proposed_data.variant_name}
                                onBlur={(e) => {
                                  const v = e.currentTarget.value.trim();
                                  if (
                                    v &&
                                    v !== item.proposed_data.variant_name
                                  ) {
                                    void updateItemField(detail().id, item, {
                                      variant_name: v,
                                    });
                                  }
                                }}
                                class="w-full rounded border border-zinc-200 px-2 py-1 text-xs"
                              />
                            </td>
                            <td class="min-w-[115px] p-2 align-top">
                              <input
                                type="text"
                                value={item.proposed_data.sku}
                                onBlur={(e) => {
                                  const v = e.currentTarget.value
                                    .trim()
                                    .toUpperCase();
                                  if (v && v !== item.proposed_data.sku) {
                                    void updateItemField(detail().id, item, {
                                      sku: v,
                                    });
                                  }
                                }}
                                class="w-full rounded border border-zinc-200 px-2 py-1 font-mono text-[11px]"
                              />
                            </td>
                            <td class="min-w-[90px] p-2 align-top">
                              <input
                                type="text"
                                value={formatCentsToBrInput(
                                  item.proposed_data.price_cents,
                                )}
                                onBlur={(e) => {
                                  const cents = parseBrazilianPriceToCents(
                                    e.currentTarget.value,
                                  );
                                  if (
                                    cents > 0 &&
                                    cents !== item.proposed_data.price_cents
                                  ) {
                                    void updateItemField(detail().id, item, {
                                      price_cents: cents,
                                    });
                                  }
                                }}
                                placeholder="0,00"
                                class="w-full rounded border border-zinc-200 px-2 py-1 text-xs"
                              />
                              <Show
                                when={item.proposed_data.suggested_price_cents}
                              >
                                <span class="text-[10px] text-[#93509e]">
                                  Sug. s/ custo
                                </span>
                              </Show>
                            </td>
                            <td class="w-16 p-2 align-top">
                              <input
                                type="number"
                                min="0"
                                value={item.proposed_data.stock_qty}
                                onBlur={(e) => {
                                  const qty = Number(e.currentTarget.value);
                                  if (
                                    Number.isFinite(qty) &&
                                    qty !== item.proposed_data.stock_qty
                                  ) {
                                    void updateItemField(detail().id, item, {
                                      stock_qty: qty,
                                    });
                                  }
                                }}
                                class="w-full rounded border border-zinc-200 px-2 py-1 text-xs"
                              />
                            </td>
                            <td class="min-w-[170px] p-2 align-top text-[11px]">
                              <span class="inline-block rounded bg-zinc-100 px-1.5 py-0.5 font-bold text-zinc-800">
                                {aiActionTypeLabel(item.action_type)}
                              </span>
                              <p class="mt-0.5 text-[10px] text-zinc-500">
                                Origem:{" "}
                                {item.source_evidence?.origin_file || "manual"}{" "}
                                ·{" "}
                                {aiEvidenceOriginLabel(
                                  item.source_evidence?.fields?.price,
                                )}
                              </p>
                              <Show when={item.duplicate_comparison}>
                                {(dup) => (
                                  <p class="mt-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800">
                                    Existente:{" "}
                                    <strong>
                                      {dup().existing.product_name}
                                    </strong>{" "}
                                    ({formatCents(dup().existing.price_cents)})
                                  </p>
                                )}
                              </Show>
                              <For each={item.validation_result?.errors ?? []}>
                                {(err) => (
                                  <p class="mt-0.5 flex items-center gap-1 font-semibold text-red-600">
                                    <AlertTriangle class="size-3 shrink-0" />
                                    {err}
                                  </p>
                                )}
                              </For>
                              <For
                                each={item.validation_result?.warnings ?? []}
                              >
                                {(w) => (
                                  <p class="mt-0.5 text-[10px] text-amber-700">
                                    {w}
                                  </p>
                                )}
                              </For>
                            </td>
                            <td class="p-2 align-top">
                              <select
                                disabled={item.approval_status === "committed"}
                                value={item.resolution_choice}
                                onChange={(e) =>
                                  void updateItemField(detail().id, item, {
                                    resolution_choice: e.currentTarget.value,
                                  })
                                }
                                class="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px]"
                              >
                                <option value="create_new">Criar novo</option>
                                <option value="update_existing">
                                  Atualizar existente
                                </option>
                                <option value="manual_review">
                                  Revisar manual
                                </option>
                                <option value="ignore">Ignorar linha</option>
                              </select>
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Show>
        </section>
      </div>
    </div>
  );
}
