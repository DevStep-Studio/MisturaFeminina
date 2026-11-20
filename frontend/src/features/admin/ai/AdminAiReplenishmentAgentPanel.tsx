import AlertCircle from "lucide-solid/icons/circle-exclamation-point";
import Download from "lucide-solid/icons/download";
import PackagePlus from "lucide-solid/icons/package-plus";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import Sparkles from "lucide-solid/icons/sparkles";
import { For, Show, createResource, createSignal } from "solid-js";
import { ApiError, api, requestUrl } from "../../../lib/api";
import { formatCents } from "../../../lib/format";
import {
  type AiReplenishmentAnalysisDetail,
  aiPriorityBadge,
} from "./ai-types";

export function AdminAiReplenishmentAgentPanel(props: {
  onPlanSaved?: () => Promise<void> | void;
}) {
  const [period, setPeriod] = createSignal(30);
  const [supplierId, setSupplierId] = createSignal("");
  const [selectedIds, setSelectedIds] = createSignal<number[]>([]);
  const [adjustedMap, setAdjustedMap] = createSignal<Record<number, number>>(
    {},
  );
  const [explainText, setExplainText] = createSignal<{
    sku: string;
    text: string;
  } | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [feedback, setFeedback] = createSignal<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const [suppliers] = createResource(async () => {
    const res = await api<{ data: Array<{ id: number; name: string }> }>(
      "/admin/suppliers",
    );
    return res.data ?? [];
  });

  const [analysis, { refetch }] = createResource(async () => {
    const res = await api<{ data: AiReplenishmentAnalysisDetail | null }>(
      "/admin/ai/replenishment/latest",
    );
    return res.data;
  });

  async function runNewAnalysis() {
    setBusy(true);
    setFeedback(null);
    try {
      await api("/admin/ai/replenishment/analyze", {
        method: "POST",
        body: {
          analysis_period: period(),
          supplier_id: supplierId() ? Number(supplierId()) : null,
        },
        timeoutMs: 60000,
      });
      setSelectedIds([]);
      setAdjustedMap({});
      setFeedback({
        type: "ok",
        text: "Análise de reposição por SKU atualizada com dados reais de vendas, estoque e espera.",
      });
      await refetch();
    } catch (err) {
      setFeedback({
        type: "err",
        text:
          err instanceof ApiError
            ? err.message
            : "Erro ao executar análise de reposição.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function askWhyRestock(suggestionId: number, sku: string) {
    try {
      const res = await api<{ data: { explanation: string } }>(
        `/admin/ai/replenishment/suggestions/${suggestionId}/explain`,
      );
      setExplainText({ sku, text: res.data.explanation });
    } catch (err) {
      setFeedback({
        type: "err",
        text:
          err instanceof ApiError
            ? err.message
            : "Não foi possível carregar explicação.",
      });
    }
  }

  function toggleRow(id: number) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function savePlan(createReceiptDraft: boolean) {
    const a = analysis();
    if (!a || selectedIds().length === 0) return;

    setBusy(true);
    setFeedback(null);
    try {
      const items = selectedIds().map((sid) => {
        const s = a.suggestions.find((row) => row.id === sid);
        const qty = adjustedMap()[sid] ?? s?.suggested_quantity ?? 1;
        return { suggestion_id: sid, quantity: Math.max(1, qty) };
      });

      const res = await api<{
        data: { saved_count: number; draft_goods_receipt_number?: string };
      }>(`/admin/ai/replenishment/analyses/${a.id}/save-plan`, {
        method: "POST",
        body: {
          supplier_id: supplierId() ? Number(supplierId()) : null,
          create_goods_receipt_draft: createReceiptDraft,
          items,
        },
      });

      setFeedback({
        type: "ok",
        text: res.data.draft_goods_receipt_number
          ? `Planejamento salvo (${res.data.saved_count} SKUs) e rascunho ${res.data.draft_goods_receipt_number} criado sem envio automático.`
          : `Planejamento de compra salvo (${res.data.saved_count} SKUs).`,
      });
      await refetch();
      await props.onPlanSaved?.();
    } catch (err) {
      setFeedback({
        type: "err",
        text:
          err instanceof ApiError
            ? err.message
            : "Falha ao salvar planejamento de compra.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="space-y-5">
      <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4">
        <div>
          <h2 class="flex items-center gap-2 text-base font-bold text-zinc-900">
            <Sparkles class="size-4 text-[#93509e]" />
            Reposição Inteligente
          </h2>
          <p class="text-xs text-zinc-500">
            Descubra o que precisa ser reposto antes que falte, analisando cada
            tonalidade e SKU individualmente.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <select
            value={period()}
            onChange={(e) => setPeriod(Number(e.currentTarget.value))}
            class="h-9 rounded-lg border border-zinc-300 bg-white px-2.5 text-xs font-medium"
          >
            <option value={7}>Janela: 7 dias</option>
            <option value={30}>Janela: 30 dias</option>
            <option value={90}>Janela: 90 dias</option>
          </select>

          <select
            value={supplierId()}
            onChange={(e) => setSupplierId(e.currentTarget.value)}
            class="h-9 rounded-lg border border-zinc-300 bg-white px-2.5 text-xs font-medium"
          >
            <option value="">Prazo padrão do sistema</option>
            <For each={suppliers() ?? []}>
              {(s) => <option value={s.id}>{s.name}</option>}
            </For>
          </select>

          <button
            type="button"
            disabled={busy()}
            onClick={() => void runNewAnalysis()}
            class="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#93509e] px-4 text-xs font-bold text-white hover:bg-[#7c3f87] disabled:opacity-50"
          >
            <RefreshCw class="size-3.5" />
            {busy() ? "Analisando..." : "Analisar estoque agora"}
          </button>
        </div>
      </div>

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

      <Show when={explainText()}>
        {(ex) => (
          <div class="rounded-xl border border-[#DFC2E3] bg-[#FCF8FD] p-4 text-xs text-[#2E0C49]">
            <p class="font-bold">Por que repor ({ex().sku})?</p>
            <p class="mt-1">{ex().text}</p>
          </div>
        )}
      </Show>

      <Show
        when={analysis()}
        fallback={
          <div class="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center">
            <AlertCircle class="mx-auto mb-2 size-8 text-zinc-400" />
            <p class="text-sm font-semibold text-zinc-700">
              Nenhuma análise de reposição gerada ainda
            </p>
            <p class="mt-1 text-xs text-zinc-500">
              Clique em &quot;Analisar estoque agora&quot; para calcular
              cobertura e sugestões por SKU/tonalidade.
            </p>
          </div>
        }
      >
        {(a) => (
          <div class="space-y-4">
            {/* Resumo */}
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div class="rounded-xl border border-red-200 bg-white p-3.5">
                <p class="text-[11px] font-bold uppercase text-zinc-500">
                  Risco de ruptura
                </p>
                <p class="mt-1 text-2xl font-black text-red-700">
                  {a().summary_kpis?.rupture_risk_count ?? 0}
                </p>
              </div>
              <div class="rounded-xl border border-zinc-200 bg-white p-3.5">
                <p class="text-[11px] font-bold uppercase text-zinc-500">
                  SKUs esgotados
                </p>
                <p class="mt-1 text-2xl font-black text-zinc-900">
                  {a().summary_kpis?.out_of_stock_count ?? 0}
                </p>
              </div>
              <div class="rounded-xl border border-[#DFC2E3] bg-white p-3.5">
                <p class="text-[11px] font-bold uppercase text-zinc-500">
                  Demanda Avise-me
                </p>
                <p class="mt-1 text-2xl font-black text-[#93509e]">
                  {a().summary_kpis?.waitlist_demand_count ?? 0}
                </p>
              </div>
              <div class="rounded-xl border border-zinc-200 bg-white p-3.5">
                <p class="text-[11px] font-bold uppercase text-zinc-500">
                  SKUs com sugestão
                </p>
                <p class="mt-1 text-2xl font-black text-zinc-900">
                  {a().summary_kpis?.suggestions_count ?? 0}
                </p>
              </div>
              <div class="rounded-xl border border-zinc-200 bg-white p-3.5">
                <p class="text-[11px] font-bold uppercase text-zinc-500">
                  Investimento estimado
                </p>
                <p class="mt-1 text-xl font-black text-zinc-900">
                  {formatCents(a().summary_kpis?.estimated_total_cents ?? 0)}
                </p>
              </div>
            </div>

            {/* Barra de aprovacao / planejamento */}
            <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-xs">
              <span class="font-semibold text-zinc-700">
                {selectedIds().length} SKU(s) selecionado(s) para compra
              </span>
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy() || selectedIds().length === 0}
                  onClick={() => void savePlan(false)}
                  class="rounded-lg border border-[#93509e] px-3 py-1.5 font-bold text-[#93509e] hover:bg-[#FCF8FD] disabled:opacity-40"
                >
                  Salvar planejamento
                </button>
                <button
                  type="button"
                  disabled={busy() || selectedIds().length === 0}
                  onClick={() => void savePlan(true)}
                  class="inline-flex items-center gap-1 rounded-lg bg-[#93509e] px-3 py-1.5 font-bold text-white hover:bg-[#7c3f87] disabled:opacity-40"
                >
                  <PackagePlus class="size-3.5" />
                  Gerar rascunho de compra / recebimento
                </button>
                <a
                  href={requestUrl(
                    `/admin/ai/replenishment/analyses/${a().id}/export-csv`,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 font-bold text-zinc-700 hover:bg-zinc-100"
                >
                  <Download class="size-3.5" />
                  Exportar CSV
                </a>
              </div>
            </div>

            {/* Tabela principal */}
            <div class="overflow-hidden rounded-xl border border-zinc-200 bg-white">
              <div class="overflow-x-auto">
                <table class="w-full text-left text-xs">
                  <thead class="border-b border-zinc-200 bg-zinc-50 uppercase text-zinc-500">
                    <tr>
                      <th class="p-2.5">Sel.</th>
                      <th class="p-2.5">Produto / Tonalidade</th>
                      <th class="p-2.5">SKU</th>
                      <th class="p-2.5 text-right">Estoque</th>
                      <th class="p-2.5 text-right">Média/dia</th>
                      <th class="p-2.5 text-right">Cobertura</th>
                      <th class="p-2.5 text-right">Prazo</th>
                      <th class="p-2.5 text-right">Qtd. sugerida</th>
                      <th class="p-2.5">Prioridade</th>
                      <th class="p-2.5">Justificativa</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-zinc-100">
                    <For each={a().suggestions}>
                      {(row) => {
                        const badge = aiPriorityBadge(row.priority);
                        return (
                          <tr class="hover:bg-zinc-50/70">
                            <td class="p-2.5 align-top">
                              <input
                                type="checkbox"
                                checked={selectedIds().includes(row.id)}
                                onChange={() => toggleRow(row.id)}
                              />
                            </td>
                            <td class="p-2.5 align-top">
                              <p class="font-bold text-zinc-900">
                                {row.product_name_snapshot}
                              </p>
                              <p class="text-[11px] text-zinc-500">
                                {row.variant_name_snapshot}
                                <Show when={row.shade_code_snapshot}>
                                  {" "}
                                  (#{row.shade_code_snapshot})
                                </Show>
                                <Show when={row.restock_waitlist_count > 0}>
                                  {" "}
                                  · {row.restock_waitlist_count} no Avise-me
                                </Show>
                              </p>
                            </td>
                            <td class="p-2.5 align-top font-mono text-[11px]">
                              {row.sku_snapshot}
                            </td>
                            <td class="p-2.5 align-top text-right font-semibold">
                              {row.available_stock}
                              <Show when={row.pending_inbound_qty > 0}>
                                <span class="block text-[10px] text-emerald-700">
                                  +{row.pending_inbound_qty} entrando
                                </span>
                              </Show>
                            </td>
                            <td class="p-2.5 align-top text-right">
                              {Number(row.average_demand).toFixed(2)}
                            </td>
                            <td class="p-2.5 align-top text-right">
                              {row.coverage_days !== null
                                ? `${row.coverage_days} d`
                                : "N/D"}
                            </td>
                            <td class="p-2.5 align-top text-right">
                              {row.lead_time_days} d
                            </td>
                            <td class="p-2.5 align-top text-right">
                              <input
                                type="number"
                                min="0"
                                value={
                                  adjustedMap()[row.id] ??
                                  row.adjusted_quantity ??
                                  row.suggested_quantity
                                }
                                onInput={(e) => {
                                  const v = Math.max(
                                    0,
                                    Number(e.currentTarget.value),
                                  );
                                  setAdjustedMap((prev) => ({
                                    ...prev,
                                    [row.id]: v,
                                  }));
                                }}
                                class="w-16 rounded border border-zinc-300 px-1.5 py-0.5 text-right font-bold"
                              />
                            </td>
                            <td class="p-2.5 align-top">
                              <span
                                class={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}
                              >
                                {badge.label}
                              </span>
                            </td>
                            <td class="max-w-xs p-2.5 align-top text-[11px] text-zinc-600">
                              <p>{row.explanation}</p>
                              <button
                                type="button"
                                onClick={() =>
                                  void askWhyRestock(row.id, row.sku_snapshot)
                                }
                                class="mt-1 font-bold text-[#93509e] hover:underline"
                              >
                                Por que repor?
                              </button>
                            </td>
                          </tr>
                        );
                      }}
                    </For>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
