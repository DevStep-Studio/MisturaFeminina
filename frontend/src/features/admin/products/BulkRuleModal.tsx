import AlertTriangle from "lucide-solid/icons/triangle-exclamation-point";
import CheckCircle2 from "lucide-solid/icons/circle-check";
import Loader2 from "lucide-solid/icons/loader-circle";
import { For, Show, createSignal, onCleanup } from "solid-js";
import { ApiError, api } from "../../../lib/api";
import { AdminButton, AdminCombobox, AdminModal, AdminMultiCombobox } from "../ui";
import { buildCategoryHierarchyOptions } from "../categories/category-helpers";
import {
  type BrandOption,
  type BulkRulePreviewPayload,
  type BulkSelectionPayload,
  type CategoryOption,
  makeIdempotencyKey,
  parseBrlInputToCents,
} from "./types";

export function BulkRuleModal(props: {
  open: boolean;
  selectionLabel: string;
  selection: BulkSelectionPayload;
  brands: BrandOption[];
  categories: CategoryOption[];
  canPrice: boolean;
  canCostWrite?: boolean;
  canStock: boolean;
  canWrite: boolean;
  onClose: () => void;
  onCommitted: (message: string) => Promise<void> | void;
}) {
  const [priceOp, setPriceOp] = createSignal<"keep" | "set_fixed" | "adjust_percent">("keep");
  const [priceBrl, setPriceBrl] = createSignal("");
  const [percentVal, setPercentVal] = createSignal("10");

  const [promoOp, setPromoOp] = createSignal<"keep" | "set_fixed" | "remove">("keep");
  const [promoBrl, setPromoBrl] = createSignal("");

  const [costOp, setCostOp] = createSignal<"keep" | "set_fixed" | "adjust_percent" | "clear_to_null">("keep");
  const [costBrl, setCostBrl] = createSignal("");
  const [costPercentVal, setCostPercentVal] = createSignal("10");

  const [stockOp, setStockOp] = createSignal<"keep" | "set" | "add" | "subtract">("keep");
  const [stockQty, setStockQty] = createSignal("0");
  const [stockReason, setStockReason] = createSignal("Reajuste em massa no catálogo");
  const [applyStockToVariants, setApplyStockToVariants] = createSignal(false);

  const [brandOp, setBrandOp] = createSignal<"keep" | "set" | "clear">("keep");
  const [brandId, setBrandId] = createSignal("");

  const [categoryOp, setCategoryOp] = createSignal<"keep" | "add" | "remove" | "replace">("keep");
  const [selectedCategoryIds, setSelectedCategoryIds] = createSignal<number[]>([]);

  const [statusOp, setStatusOp] = createSignal<"keep" | "activate" | "deactivate" | "archive" | "restore">("keep");

  const [preview, setPreview] = createSignal<BulkRulePreviewPayload | null>(null);
  const [idempotencyKey, setIdempotencyKey] = createSignal(makeIdempotencyKey("bulk-rule"));
  const [busy, setBusy] = createSignal(false);
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null);
  const [conflicts, setConflicts] = createSignal<Array<{ sku: string; reason: string; current_stock_qty?: number }>>([]);
  const [batchResult, setBatchResult] = createSignal<{
    status: string;
    counts: { completed: number; skipped: number; pending: number };
    queued?: boolean;
    batch_id?: number;
  } | null>(null);

  let pollTimer: number | undefined;
  onCleanup(() => {
    if (pollTimer) window.clearTimeout(pollTimer);
  });

  function buildRulesPayload() {
    const pCents = parseBrlInputToCents(priceBrl());
    const prCents = parseBrlInputToCents(promoBrl());
    const cleanCost = costBrl().trim().replace(/R\$/gi, "").replace(/\./g, "").replace(",", ".");
    const parsedCostNum = Number(cleanCost);
    const fixedCostCents =
      cleanCost !== "" && Number.isFinite(parsedCostNum) && parsedCostNum >= 0
        ? Math.round(parsedCostNum * 100)
        : undefined;
    return {
      price_op: priceOp(),
      price_cents: priceOp() === "set_fixed" ? Math.max(0, pCents) : undefined,
      percent: priceOp() === "adjust_percent" ? Number.parseFloat(percentVal().replace(",", ".")) || 0 : undefined,
      promo_op: promoOp(),
      promo_price_cents: promoOp() === "set_fixed" ? Math.max(0, prCents) : undefined,
      cost_op: costOp(),
      cost_cents: costOp() === "set_fixed" ? fixedCostCents : undefined,
      cost_percent: costOp() === "adjust_percent" ? Number.parseFloat(costPercentVal().replace(",", ".")) || 0 : undefined,
      stock_op: stockOp(),
      stock_qty: stockOp() !== "keep" ? Math.max(0, Number.parseInt(stockQty(), 10) || 0) : undefined,
      stock_reason: stockReason().trim(),
      apply_stock_to_variants: applyStockToVariants(),
      brand_op: brandOp(),
      brand_id: brandOp() === "set" && brandId() ? Number(brandId()) : undefined,
      category_op: categoryOp(),
      category_ids: categoryOp() !== "keep" ? selectedCategoryIds() : undefined,
      status_op: statusOp(),
    };
  }

  async function generatePreview() {
    setBusy(true);
    setErrorMsg(null);
    setConflicts([]);
    setBatchResult(null);
    setIdempotencyKey(makeIdempotencyKey("bulk-rule"));
    try {
      const res = await api<{ data: BulkRulePreviewPayload }>(
        "/admin/products/bulk-rules/preview",
        {
          method: "POST",
          body: {
            selection: props.selection,
            rules: buildRulesPayload(),
          },
        },
      );
      setPreview(res.data);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Erro ao calcular prévia.");
    } finally {
      setBusy(false);
    }
  }

  async function pollBatch(batchId: number) {
    try {
      const res = await api<{
        data: {
          id: number;
          status: string;
          updated_count: number;
          created_count: number;
          skipped_count: number;
          pending_count: number;
          error_message?: string | null;
        };
      }>(`/admin/products/bulk-batches/${batchId}`);
      const b = res.data;
      if (b.status === "processing") {
        pollTimer = window.setTimeout(() => void pollBatch(batchId), 2000);
        return;
      }
      setBatchResult({
        status: b.status,
        queued: false,
        batch_id: b.id,
        counts: {
          completed: b.updated_count + b.created_count,
          skipped: b.skipped_count,
          pending: b.pending_count,
        },
      });
      if (b.status === "conflict" && b.error_message) {
        setErrorMsg(b.error_message);
      } else {
        await props.onCommitted(
          `Lote em segundo plano concluído: ${b.updated_count} atualizado(s), ${b.skipped_count} ignorado(s).`,
        );
      }
    } catch {
      // Keep last state
    }
  }

  async function commit(applyValidOnly = false, overwriteConflict = false) {
    const currentPreview = preview();
    if (!currentPreview) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await api<{
        data: {
          status: string;
          queued?: boolean;
          batch?: { id: number };
          idempotent_replay?: boolean;
          conflicts?: Array<{ sku: string; reason: string; current_stock_qty?: number }>;
          counts: { completed: number; skipped: number; pending: number };
        };
      }>("/admin/products/bulk-rules/commit", {
        method: "POST",
        body: {
          selection: props.selection,
          rules: buildRulesPayload(),
          idempotency_key: idempotencyKey(),
          preview_snapshot: currentPreview.preview_snapshot,
          apply_valid_only: applyValidOnly,
          conflict_resolution: overwriteConflict ? "overwrite" : "abort",
        },
      });

      const d = res.data;
      setBatchResult({
        status: d.status,
        queued: d.queued,
        batch_id: d.batch?.id,
        counts: d.counts,
      });

      if (d.queued && d.batch?.id) {
        pollTimer = window.setTimeout(() => void pollBatch(d.batch!.id), 2000);
        return;
      }

      await props.onCommitted(
        `${d.counts.completed} alterações aplicadas, ${d.counts.skipped} ignoradas, ${d.counts.pending} pendentes.`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const dataPayload = err.payload?.data as
          | {
              conflicts?: Array<{ sku: string; reason: string; current_stock_qty?: number }>;
            }
          | undefined;
        setErrorMsg(
          "Conflito de concorrência detectado após a prévia. Revise os saldos atuais abaixo.",
        );
        setConflicts(dataPayload?.conflicts ?? []);
        await generatePreview();
      } else {
        setErrorMsg(err instanceof ApiError ? err.message : "Erro ao aplicar regras em massa.");
      }
    } finally {
      setBusy(false);
    }
  }

  function toggleCategoryId(id: number) {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <AdminModal
      open={props.open}
      title="Editar em massa (regras)"
      subtitle={`Escopo atual: ${props.selectionLabel}`}
      maxWidthClass="max-w-4xl"
      closeLabel="Fechar regras em massa"
      onClose={() => props.onClose()}
      footer={
        <>
          <AdminButton variant="secondary" onClick={() => props.onClose()}>
            Fechar
          </AdminButton>
          <Show
            when={preview()}
            fallback={
              <AdminButton
                variant="primary"
                loading={busy()}
                loadingLabel="Calculando…"
                onClick={() => void generatePreview()}
              >
                Visualizar prévia
              </AdminButton>
            }
          >
            {(p) => (
              <>
                <Show when={conflicts().length > 0}>
                  <AdminButton
                    variant="secondary"
                    loading={busy()}
                    loadingLabel="Salvando…"
                    onClick={() => void commit(false, true)}
                    class="border-[#93509e] text-[#62298d]"
                  >
                    Aplicar com saldo atualizado
                  </AdminButton>
                </Show>
                <Show
                  when={
                    p().summary.invalid_count > 0 && p().summary.valid_count > 0
                  }
                >
                  <AdminButton
                    variant="primary"
                    loading={busy()}
                    loadingLabel="Salvando…"
                    onClick={() => void commit(true, false)}
                  >
                    Aplicar apenas os {p().summary.valid_count} válidos
                  </AdminButton>
                </Show>
                <Show when={p().summary.invalid_count === 0}>
                  <AdminButton
                    variant="primary"
                    loading={busy()}
                    loadingLabel="Salvando…"
                    onClick={() => void commit(false, false)}
                  >
                    Confirmar {p().summary.valid_count} alterações
                  </AdminButton>
                </Show>
              </>
            )}
          </Show>
        </>
      }
    >
      <div class="space-y-4">
        <Show when={errorMsg()}>
          <div
            role="alert"
            class="rounded-[8px] border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800"
          >
            <p class="font-semibold">{errorMsg()}</p>
            <Show when={conflicts().length > 0}>
              <ul class="mt-1 list-disc pl-4">
                <For each={conflicts()}>
                  {(c) => (
                    <li>
                      <strong>{c.sku}:</strong> {c.reason}
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>
        </Show>

        <Show when={batchResult()}>
          {(res) => (
            <div class="rounded-[8px] border border-[#e4c6ea] bg-[#f5ebf7] px-4 py-3 text-xs text-zinc-900">
              <Show
                when={!res().queued}
                fallback={
                  <p class="flex items-center gap-2 font-semibold text-[#62298d]">
                    <Loader2 class="h-4 w-4 animate-spin" />
                    Processando lote em segundo plano (#{res().batch_id}). Você
                    pode acompanhar em seguida.
                  </p>
                }
                  >
                    <p class="flex items-center gap-2 font-semibold text-zinc-900">
                      <CheckCircle2 class="h-4 w-4 text-[#93509e]" />
                      Resultado: {res().counts.completed} concluídos · {res().counts.skipped} ignorados · {res().counts.pending} pendentes.
                    </p>
                  </Show>
                </div>
              )}
            </Show>

            <Show
              when={preview()}
              fallback={
                <div class="grid gap-4 md:grid-cols-2">
                  {/* Preço de venda */}
                  <Show when={props.canPrice}>
                    <div class="space-y-2 rounded-lg border border-zinc-200 p-3.5 text-xs">
                      <p class="font-bold text-zinc-900">Preço de venda</p>
                      <select
                        value={priceOp()}
                        onChange={(e) => setPriceOp(e.currentTarget.value as "keep" | "set_fixed" | "adjust_percent")}
                        class="h-9 w-full rounded-md border border-zinc-300 bg-white px-2.5"
                      >
                        <option value="keep">Manter valores atuais</option>
                        <option value="set_fixed">Definir preço fixo (R$)</option>
                        <option value="adjust_percent">Reajustar por percentual (%)</option>
                      </select>
                      <Show when={priceOp() === "set_fixed"}>
                        <input
                          type="text"
                          placeholder="Ex.: 24,90"
                          value={priceBrl()}
                          onInput={(e) => setPriceBrl(e.currentTarget.value)}
                          class="h-9 w-full rounded-md border border-zinc-300 px-3"
                        />
                      </Show>
                      <Show when={priceOp() === "adjust_percent"}>
                        <input
                          type="text"
                          placeholder="Ex.: 10 para +10% ou -15 para desconto"
                          value={percentVal()}
                          onInput={(e) => setPercentVal(e.currentTarget.value)}
                          class="h-9 w-full rounded-md border border-zinc-300 px-3"
                        />
                      </Show>
                    </div>

                    {/* Preço promocional */}
                    <div class="space-y-2 rounded-lg border border-zinc-200 p-3.5 text-xs">
                      <p class="font-bold text-zinc-900">Preço promocional</p>
                      <select
                        value={promoOp()}
                        onChange={(e) => setPromoOp(e.currentTarget.value as "keep" | "set_fixed" | "remove")}
                        class="h-9 w-full rounded-md border border-zinc-300 bg-white px-2.5"
                      >
                        <option value="keep">Manter promoções atuais</option>
                        <option value="set_fixed">Definir valor promocional (R$)</option>
                        <option value="remove">Remover preço promocional</option>
                      </select>
                      <Show when={promoOp() === "set_fixed"}>
                        <input
                          type="text"
                          placeholder="Ex.: 19,90"
                          value={promoBrl()}
                          onInput={(e) => setPromoBrl(e.currentTarget.value)}
                          class="h-9 w-full rounded-md border border-zinc-300 px-3"
                        />
                      </Show>
                    </div>
                    {/* Custo unitário */}
                    <Show when={props.canCostWrite}>
                      <div class="space-y-2 rounded-lg border border-zinc-200 p-3.5 text-xs">
                        <p class="font-bold text-zinc-900">Custo unitário (R$)</p>
                        <select
                          value={costOp()}
                          onChange={(e) =>
                            setCostOp(
                              e.currentTarget.value as
                                | "keep"
                                | "set_fixed"
                                | "adjust_percent"
                                | "clear_to_null",
                            )
                          }
                          class="h-9 w-full rounded-md border border-zinc-300 bg-white px-2.5"
                        >
                          <option value="keep">Manter custos atuais</option>
                          <option value="set_fixed">Definir custo fixo (R$)</option>
                          <option value="adjust_percent">Reajustar por percentual (%)</option>
                          <option value="clear_to_null">Marcar como não informado</option>
                        </select>
                        <Show when={costOp() === "set_fixed"}>
                          <input
                            type="text"
                            placeholder="Ex.: 12,50 ou 0,00"
                            value={costBrl()}
                            onInput={(e) => setCostBrl(e.currentTarget.value)}
                            class="h-9 w-full rounded-md border border-zinc-300 px-3"
                          />
                        </Show>
                        <Show when={costOp() === "adjust_percent"}>
                          <input
                            type="text"
                            placeholder="Ex.: 8 para +8%"
                            value={costPercentVal()}
                            onInput={(e) => setCostPercentVal(e.currentTarget.value)}
                            class="h-9 w-full rounded-md border border-zinc-300 px-3"
                          />
                        </Show>
                      </div>
                    </Show>
                  </Show>

                  {/* Estoque */}
                  <Show when={props.canStock}>
                    <div class="space-y-2 rounded-lg border border-zinc-200 p-3.5 text-xs">
                      <p class="font-bold text-zinc-900">Estoque (registra movimentação)</p>
                      <select
                        value={stockOp()}
                        onChange={(e) => setStockOp(e.currentTarget.value as "keep" | "set" | "add" | "subtract")}
                        class="h-9 w-full rounded-md border border-zinc-300 bg-white px-2.5"
                      >
                        <option value="keep">Manter saldos atuais</option>
                        <option value="set">Definir saldo exato</option>
                        <option value="add">Adicionar unidades (+)</option>
                        <option value="subtract">Retirar unidades (-)</option>
                      </select>
                      <Show when={stockOp() !== "keep"}>
                        <input
                          type="number"
                          min="0"
                          value={stockQty()}
                          onInput={(e) => setStockQty(e.currentTarget.value)}
                          class="h-9 w-full rounded-md border border-zinc-300 px-3"
                        />
                        <input
                          type="text"
                          placeholder="Motivo da movimentação"
                          value={stockReason()}
                          onInput={(e) => setStockReason(e.currentTarget.value)}
                          class="h-9 w-full rounded-md border border-zinc-300 px-3"
                        />
                        <Show when={stockOp() === "set"}>
                          <label class="inline-flex items-center gap-2 text-zinc-700">
                            <input
                              type="checkbox"
                              checked={applyStockToVariants()}
                              onChange={(e) => setApplyStockToVariants(e.currentTarget.checked)}
                              class="accent-[#93509e]"
                            />
                            Aplicar este saldo em todas as variações se houver produto com cores
                          </label>
                        </Show>
                      </Show>
                    </div>
                  </Show>

                  {/* Marca & Situação */}
                  <Show when={props.canWrite}>
                    <div class="space-y-2 rounded-lg border border-zinc-200 p-3.5 text-xs">
                      <p class="font-bold text-zinc-900">Marca e Situação</p>
                      <select
                        value={brandOp()}
                        onChange={(e) => setBrandOp(e.currentTarget.value as "keep" | "set" | "clear")}
                        class="h-9 w-full rounded-md border border-zinc-300 bg-white px-2.5"
                      >
                        <option value="keep">Manter marca atual</option>
                        <option value="set">Alterar para marca específica</option>
                        <option value="clear">Remover vínculo de marca</option>
                      </select>
                      <Show when={brandOp() === "set"}>
                        <AdminCombobox
                          label="Nova marca"
                          placeholder="Selecione a marca..."
                          searchPlaceholder="Buscar marca..."
                          value={brandId()}
                          options={props.brands.map((b) => ({
                            value: String(b.id),
                            label: b.name,
                          }))}
                          onChange={(val) => setBrandId(val)}
                        />
                      </Show>

                      <select
                        value={statusOp()}
                        onChange={(e) => setStatusOp(e.currentTarget.value as "keep" | "activate" | "deactivate" | "archive" | "restore")}
                        class="h-9 w-full rounded-[8px] border border-zinc-300 bg-white px-2.5"
                      >
                        <option value="keep">Manter situação atual</option>
                        <option value="activate">Ativar na loja pública</option>
                        <option value="deactivate">Inativar na loja</option>
                        <option value="archive">Arquivar</option>
                        <option value="restore">Restaurar arquivados</option>
                      </select>
                    </div>

                    {/* Categorias */}
                    <div class="space-y-2 rounded-[10px] border border-zinc-200 p-3.5 text-xs md:col-span-2">
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <p class="font-bold text-zinc-900">Categorias múltiplas</p>
                        <select
                          value={categoryOp()}
                          onChange={(e) => setCategoryOp(e.currentTarget.value as "keep" | "add" | "remove" | "replace")}
                          class="h-8 rounded-[8px] border border-zinc-300 bg-white px-2.5"
                        >
                          <option value="keep">Manter categorias atuais</option>
                          <option value="add">Adicionar selecionadas</option>
                          <option value="remove">Remover selecionadas</option>
                          <option value="replace">Substituir pelas selecionadas</option>
                        </select>
                      </div>
                      <Show when={categoryOp() !== "keep"}>
                        <AdminMultiCombobox
                          label="Selecionar categorias"
                          selectedValues={selectedCategoryIds().map(String)}
                          options={buildCategoryHierarchyOptions(
                            props.categories.map((c) => ({
                              id: c.id,
                              name: c.name,
                              slug: c.slug ?? "",
                              parent_id: c.parent_id ?? null,
                              sort_order: c.sort_order,
                              full_path: c.full_path,
                            })),
                          )}
                          onToggleValue={(val) => toggleCategoryId(Number(val))}
                          onClearAll={() => setSelectedCategoryIds([])}
                        />
                      </Show>
                    </div>
                  </Show>
                </div>
              }
            >
              {(prev) => (
                <div class="space-y-3">
                  <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div class="flex flex-wrap gap-3">
                      <span>Produtos: <strong>{prev().summary.total_products}</strong></span>
                      <span>Válidos: <strong class="text-zinc-900">{prev().summary.valid_count}</strong></span>
                      <Show when={prev().summary.invalid_count > 0}>
                        <span class="font-semibold text-red-700">
                          Com impedimento: {prev().summary.invalid_count}
                        </span>
                      </Show>
                      <Show when={prev().summary.impacted_wholesale_count > 0}>
                        <span class="font-semibold text-[#62298d]">
                          Atacado impactado: {prev().summary.impacted_wholesale_count}
                        </span>
                      </Show>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPreview(null)}
                      class="font-semibold text-[#93509e] underline"
                    >
                      Ajustar regras
                    </button>
                  </div>

                  <div class="overflow-x-auto rounded-lg border border-zinc-200">
                    <table class="w-full min-w-[620px] border-collapse text-left text-xs">
                      <thead>
                        <tr class="border-b border-zinc-200 bg-zinc-50 text-[11px] text-zinc-600">
                          <th class="sticky left-0 z-10 bg-zinc-50 px-3 py-2">SKU / Item</th>
                          <th class="px-3 py-2">Campo</th>
                          <th class="px-3 py-2">Valor atual</th>
                          <th class="px-3 py-2">Novo valor</th>
                          <th class="px-3 py-2">Consequências / Alertas</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-zinc-100">
                        <For each={prev().rows}>
                          {(row) => (
                            <tr class={!row.valid ? "bg-red-50/50" : ""}>
                              <td class="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-zinc-900">
                                <span class="font-mono text-[11px]">{row.sku}</span>
                                <p class="max-w-[180px] truncate text-[11px] text-zinc-500">
                                  {row.product_name}
                                  {row.variant_name ? ` — ${row.variant_name}` : ""}
                                </p>
                              </td>
                              <td class="px-3 py-2">
                                <For each={row.changes}>
                                  {(ch) => <div class="py-0.5 text-zinc-700">{ch.label}</div>}
                                </For>
                              </td>
                              <td class="px-3 py-2 tabular-nums text-zinc-500">
                                <For each={row.changes}>
                                  {(ch) => <div class="py-0.5">{ch.old_display}</div>}
                                </For>
                              </td>
                              <td class="px-3 py-2 font-semibold tabular-nums text-zinc-900">
                                <For each={row.changes}>
                                  {(ch) => <div class="py-0.5">{ch.new_display}</div>}
                                </For>
                              </td>
                              <td class="px-3 py-2 text-[11px]">
                                <For each={row.errors}>
                                  {(er) => (
                                    <p class="flex items-start gap-1 font-semibold text-red-700">
                                      <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                      {er}
                                    </p>
                                  )}
                                </For>
                                <For each={row.impacts}>
                                  {(im) => <p class="text-[#62298d]">{im}</p>}
                                </For>
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
      </div>
    </AdminModal>
  );
}
