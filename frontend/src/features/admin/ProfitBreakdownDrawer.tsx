import AlertTriangle from "lucide-solid/icons/triangle-exclamation-point";
import X from "lucide-solid/icons/x";
import { For, Show, createEffect, createResource, createSignal } from "solid-js";
import { api } from "../../lib/api";
import { formatCents } from "../../lib/format";
import { formatBrlSigned, formatMarginPercentage } from "./profit-math";

export interface ProfitBreakdownItemRow {
  entry_type: "sale" | "return_adjustment" | string;
  order_id: number;
  order_number: string;
  order_item_id: number;
  event_date: string;
  product_name: string;
  variant_name: string;
  sku: string;
  quantity: number;
  sold_qty: number;
  returned_qty: number;
  gross_item_total_cents: number;
  order_discount_allocated_cents: number;
  net_revenue_cents: number;
  unit_cost_cents_snapshot: number | null;
  has_cost: boolean;
  cost_source: string;
  cmv_cents: number | null;
  gross_profit_cents: number | null;
  margin_pct: number | null;
  note?: string | null;
}

export interface InventoryValuationPayload {
  label: string;
  is_historical_reference: boolean;
  as_of: string;
  note: string;
  total_cost_cents: number;
  total_units: number;
  valued_units: number;
  missing_cost_units: number;
  total_skus: number;
  valued_skus: number;
  missing_cost_skus_count: number;
  is_partial: boolean;
  coverage_label: string;
  missing_skus: Array<{
    product_id: number;
    variant_id: number;
    sku: string;
    product_name: string;
    variant_name: string;
    stock_qty: number;
  }>;
}

export function ProfitBreakdownDrawer(props: {
  mode: "sales" | "inventory" | null;
  from: string;
  to: string;
  initialFilter?: "all" | "missing_cost";
  onClose: () => void;
}) {
  const [filter, setFilter] = createSignal<"all" | "missing_cost">(
    props.initialFilter ?? "all",
  );
  const [stockAsOf, setStockAsOf] = createSignal("");

  createEffect(() => {
    if (props.initialFilter) {
      setFilter(props.initialFilter);
    }
  });

  const [salesData] = createResource(
    () =>
      props.mode === "sales"
        ? { from: props.from, to: props.to, filter: filter() }
        : null,
    async (params) => {
      if (!params) return null;
      const qs = new URLSearchParams({
        from: params.from,
        to: params.to,
        filter: params.filter,
      });
      const res = await api<{
        data: {
          period: { from: string; to: string };
          totals: {
            quantity: number;
            products_revenue_cents: number;
            covered_revenue_cents: number;
            cmv_cents: number;
            gross_profit_cents: number;
            gross_margin_pct: number | null;
          };
          items: ProfitBreakdownItemRow[];
        };
      }>(`/admin/profit/items?${qs.toString()}`);
      return res.data;
    },
  );

  const [inventoryData] = createResource(
    () => (props.mode === "inventory" ? { asOf: stockAsOf() } : null),
    async (params) => {
      if (!params) return null;
      const qs = params.asOf ? `?as_of=${encodeURIComponent(params.asOf)}` : "";
      const res = await api<{ data: InventoryValuationPayload }>(
        `/admin/inventory/valuation${qs}`,
      );
      return res.data;
    },
  );

  return (
    <Show when={props.mode !== null}>
      <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
        <div class="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-xl border border-zinc-200 bg-white sm:rounded-xl">
          <div class="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-3.5">
            <div>
              <h2 class="text-base font-bold text-zinc-900">
                {props.mode === "sales"
                  ? "Conferência de vendas, CMV e lucro bruto"
                  : "Valor do estoque a custo"}
              </h2>
              <p class="text-xs text-zinc-500">
                {props.mode === "sales"
                  ? `Período ${props.from} até ${props.to} · Vendas reconhecidas na confirmação do pagamento (paid_at) e estornos na data do evento.`
                  : "Avaliação unitária contada uma única vez por SKU físico."}
              </p>
            </div>
            <button
              type="button"
              aria-label="Fechar conferência"
              onClick={() => props.onClose()}
              class="rounded p-1.5 text-zinc-500 hover:bg-zinc-100"
            >
              <X class="h-4 w-4" />
            </button>
          </div>

          <div class="flex-1 space-y-4 overflow-y-auto p-5 text-xs">
            <Show when={props.mode === "sales"}>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="inline-flex rounded-md border border-zinc-200 bg-zinc-50 p-0.5">
                  <button
                    type="button"
                    onClick={() => setFilter("all")}
                    class={`rounded px-3 py-1.5 font-semibold ${
                      filter() === "all"
                        ? "bg-[#93509e] text-white"
                        : "text-zinc-700 hover:text-zinc-900"
                    }`}
                  >
                    Todos os itens reconhecidos
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter("missing_cost")}
                    class={`rounded px-3 py-1.5 font-semibold ${
                      filter() === "missing_cost"
                        ? "bg-[#93509e] text-white"
                        : "text-zinc-700 hover:text-zinc-900"
                    }`}
                  >
                    Sem custo informado
                  </button>
                </div>
              </div>

              <Show when={salesData()}>
                {(d) => (
                  <Show
                    when={d().items.length > 0}
                    fallback={
                      <p class="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-center text-zinc-600">
                        Nenhum item encontrado para este filtro no período.
                      </p>
                    }
                  >
                    {/* Desktop table */}
                    <div class="hidden overflow-x-auto rounded-lg border border-zinc-200 md:block">
                      <table class="w-full border-collapse text-left text-xs">
                        <thead>
                          <tr class="border-b border-zinc-200 bg-zinc-50 text-[11px] font-semibold uppercase text-zinc-600">
                            <th class="px-3 py-2">Pedido</th>
                            <th class="px-3 py-2">Data</th>
                            <th class="px-3 py-2">Produto / Variação</th>
                            <th class="px-3 py-2">SKU</th>
                            <th class="px-3 py-2 text-right">Qtd</th>
                            <th class="px-3 py-2 text-right">Receita pós-descontos</th>
                            <th class="px-3 py-2 text-right">Custo histórico</th>
                            <th class="px-3 py-2 text-right">Lucro bruto</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-zinc-100">
                          <For each={d().items}>
                            {(row) => (
                              <tr
                                class={
                                  !row.has_cost && row.quantity > 0
                                    ? "bg-amber-50/40"
                                    : row.entry_type === "return_adjustment"
                                      ? "bg-red-50/30"
                                      : ""
                                }
                              >
                                <td class="px-3 py-2 font-mono font-bold text-zinc-900">
                                  {row.order_number}
                                </td>
                                <td class="px-3 py-2 text-zinc-600">
                                  {new Date(row.event_date).toLocaleDateString("pt-BR")}
                                </td>
                                <td class="px-3 py-2">
                                  <p class="font-medium text-zinc-900">
                                    {row.product_name}
                                  </p>
                                  <p class="text-[11px] text-zinc-500">
                                    {row.variant_name}
                                    {row.note ? ` · ${row.note}` : ""}
                                  </p>
                                </td>
                                <td class="px-3 py-2 font-mono text-[11px] text-zinc-700">
                                  {row.sku}
                                </td>
                                <td class="px-3 py-2 text-right tabular-nums">
                                  {row.quantity}
                                </td>
                                <td class="px-3 py-2 text-right font-semibold tabular-nums">
                                  {formatBrlSigned(row.net_revenue_cents)}
                                </td>
                                <td class="px-3 py-2 text-right tabular-nums">
                                  <Show
                                    when={row.has_cost}
                                    fallback={
                                      <span class="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                                        Custo não informado
                                      </span>
                                    }
                                  >
                                    <div>
                                      <span class="font-semibold text-zinc-800">
                                        {formatBrlSigned(row.cmv_cents ?? 0)}
                                      </span>
                                      <p class="text-[10px] text-zinc-500">
                                        ({formatCents(row.unit_cost_cents_snapshot ?? 0)}/un.)
                                      </p>
                                    </div>
                                  </Show>
                                </td>
                                <td
                                  class={`px-3 py-2 text-right font-bold tabular-nums ${
                                    row.gross_profit_cents !== null &&
                                    row.gross_profit_cents < 0
                                      ? "text-red-700"
                                      : "text-zinc-900"
                                  }`}
                                >
                                  {row.gross_profit_cents !== null
                                    ? formatBrlSigned(row.gross_profit_cents)
                                    : "Pendente"}
                                </td>
                              </tr>
                            )}
                          </For>
                        </tbody>
                        <tfoot>
                          <tr class="border-t-2 border-zinc-200 bg-zinc-50 font-bold text-zinc-900">
                            <td colSpan={4} class="px-3 py-2.5">
                              Totais conferidos no período
                            </td>
                            <td class="px-3 py-2.5 text-right tabular-nums">
                              {d().totals?.quantity ?? d().items.length}
                            </td>
                            <td class="px-3 py-2.5 text-right tabular-nums">
                              {formatCents(d().totals?.products_revenue_cents ?? 0)}
                            </td>
                            <td class="px-3 py-2.5 text-right tabular-nums">
                              {formatCents(d().totals?.cmv_cents ?? 0)}
                            </td>
                            <td class="px-3 py-2.5 text-right tabular-nums text-[#62298d]">
                              {formatBrlSigned(d().totals?.gross_profit_cents ?? 0)} (
                              {formatMarginPercentage(d().totals?.gross_margin_pct)})
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Mobile compact list (360px / 390px) */}
                    <div class="space-y-2 md:hidden">
                      <For each={d().items}>
                        {(row) => (
                          <div class="space-y-1.5 rounded-lg border border-zinc-200 p-3">
                            <div class="flex items-start justify-between gap-2">
                              <div class="min-w-0">
                                <p class="truncate font-bold text-zinc-900">
                                  {row.product_name} ({row.variant_name})
                                </p>
                                <p class="font-mono text-[11px] text-zinc-500">
                                  {row.order_number} · {row.sku} ·{" "}
                                  {new Date(row.event_date).toLocaleDateString("pt-BR")}
                                </p>
                              </div>
                              <span class="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 font-semibold tabular-nums">
                                {row.quantity} un.
                              </span>
                            </div>
                            <div class="grid grid-cols-3 gap-2 border-t border-zinc-100 pt-1.5 tabular-nums">
                              <div>
                                <p class="text-[10px] text-zinc-500">Receita</p>
                                <p class="font-semibold">
                                  {formatBrlSigned(row.net_revenue_cents)}
                                </p>
                              </div>
                              <div>
                                <p class="text-[10px] text-zinc-500">CMV hist.</p>
                                <p class="font-semibold">
                                  {row.has_cost
                                    ? formatBrlSigned(row.cmv_cents ?? 0)
                                    : "Não informado"}
                                </p>
                              </div>
                              <div class="text-right">
                                <p class="text-[10px] text-zinc-500">Lucro bruto</p>
                                <p class="font-bold text-[#62298d]">
                                  {row.gross_profit_cents !== null
                                    ? formatBrlSigned(row.gross_profit_cents)
                                    : "Pendente"}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                )}
              </Show>
            </Show>

            <Show when={props.mode === "inventory"}>
              <div class="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <div>
                  <label class="block text-[11px] font-semibold text-zinc-700">
                    Consultar posição histórica por data de referência (opcional)
                  </label>
                  <input
                    type="date"
                    value={stockAsOf()}
                    onInput={(e) => setStockAsOf(e.currentTarget.value)}
                    class="mt-1 h-9 rounded border border-zinc-300 bg-white px-2.5 text-xs"
                  />
                </div>
                <Show when={stockAsOf()}>
                  <button
                    type="button"
                    onClick={() => setStockAsOf("")}
                    class="rounded border border-zinc-300 bg-white px-3 py-1.5 font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    Voltar para Posição atual
                  </button>
                </Show>
              </div>

              <Show when={inventoryData()}>
                {(inv) => (
                  <div class="space-y-4">
                    <div class="grid gap-3 sm:grid-cols-3">
                      <div class="rounded-lg border border-zinc-200 p-3">
                        <span class="inline-block rounded bg-purple-50 px-2 py-0.5 text-[10px] font-bold uppercase text-[#62298d]">
                          {inv().label}
                        </span>
                        <p class="mt-1 text-xl font-black tabular-nums text-zinc-900">
                          {formatCents(inv().total_cost_cents)}
                        </p>
                        <p class="mt-0.5 text-[11px] text-zinc-500">
                          {inv().note}
                        </p>
                      </div>
                      <div class="rounded-lg border border-zinc-200 p-3">
                        <p class="text-[11px] font-semibold text-zinc-500">
                          Unidades com custo informado
                        </p>
                        <p class="mt-1 text-lg font-bold tabular-nums text-zinc-900">
                          {inv().valued_units} de {inv().total_units} un.
                        </p>
                        <p class="text-[11px] text-zinc-500">
                          {inv().valued_skus} de {inv().total_skus} SKUs com saldo
                        </p>
                      </div>
                      <div class="rounded-lg border border-zinc-200 p-3">
                        <p class="text-[11px] font-semibold text-zinc-500">
                          Cobertura de custos
                        </p>
                        <p class="mt-1 text-sm font-bold text-zinc-900">
                          {inv().coverage_label}
                        </p>
                      </div>
                    </div>

                    <Show when={inv().missing_skus.length > 0}>
                      <div class="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                        <p class="flex items-center gap-1.5 font-bold text-amber-900">
                          <AlertTriangle class="h-4 w-4 text-amber-700" />
                          SKUs com saldo positivo e sem custo informado ({inv().missing_skus.length})
                        </p>
                        <div class="max-h-60 overflow-y-auto rounded border border-amber-200/80 bg-white">
                          <table class="w-full text-left text-xs">
                            <thead>
                              <tr class="border-b border-zinc-200 bg-zinc-50 text-[11px] text-zinc-600">
                                <th class="px-3 py-1.5">SKU</th>
                                <th class="px-3 py-1.5">Produto / Variação</th>
                                <th class="px-3 py-1.5 text-right">Saldo</th>
                              </tr>
                            </thead>
                            <tbody class="divide-y divide-zinc-100">
                              <For each={inv().missing_skus}>
                                {(skuRow) => (
                                  <tr>
                                    <td class="px-3 py-1.5 font-mono font-semibold">
                                      {skuRow.sku}
                                    </td>
                                    <td class="px-3 py-1.5">
                                      {skuRow.product_name} — {skuRow.variant_name}
                                    </td>
                                    <td class="px-3 py-1.5 text-right tabular-nums font-semibold">
                                      {skuRow.stock_qty} un.
                                    </td>
                                  </tr>
                                )}
                              </For>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </Show>
                  </div>
                )}
              </Show>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}
