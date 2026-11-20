import { For, Show, createSignal, onMount } from "solid-js";
import Download from "lucide-solid/icons/download";
import FileText from "lucide-solid/icons/file-text";
import TrendingUp from "lucide-solid/icons/trending-up";
import { api } from "../../../lib/api";
import { formatCents } from "../../../lib/format";

interface TopProductRow {
  product_id: number;
  sku: string;
  name: string;
  total_units: number;
  total_revenue_cents: number;
  total_discounts_cents: number;
}

interface RulePerfRow {
  rule_id: number;
  rule_name: string;
  orders_count: number;
  units_count: number;
  revenue_cents: number;
  discounts_cents: number;
}

interface ReportsResponse {
  summary: {
    total_wholesale_revenue_cents: number;
    total_wholesale_discounts_cents: number;
    total_wholesale_units: number;
    distinct_wholesale_orders_count: number;
    average_wholesale_ticket_cents: number;
  };
  top_products: TopProductRow[];
  rule_performance: RulePerfRow[];
}

export function AdminWholesaleReportsPanel() {
  const [data, setData] = createSignal<ReportsResponse | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [exporting, setExporting] = createSignal(false);

  const loadReports = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: ReportsResponse }>(
        "/admin/wholesale/reports",
      );
      setData(res.data);
    } catch {
      //
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    void loadReports();
  });

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/v1/admin/wholesale/reports/export-csv", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          Accept: "text/csv",
        },
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio_atacado_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Erro ao exportar CSV.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div class="space-y-6">
      <div class="flex items-center justify-between border-b border-zinc-200 pb-4">
        <div>
          <h2 class="text-base font-bold text-[#2E0C49]">
            Relatórios & Desempenho de Atacado
          </h2>
          <p class="text-xs text-zinc-500">
            Acompanhe o volume de vendas por faixa de quantidade, produtos mais
            vendidos e impacto dos descontos.
          </p>
        </div>
        <button
          type="button"
          disabled={exporting()}
          onClick={() => void handleExportCsv()}
          class="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-xs font-bold text-zinc-700 shadow-xs transition hover:bg-zinc-50 disabled:opacity-50"
        >
          <Download class="size-4" />
          <span>
            {exporting() ? "Exportando..." : "Exportar Relatório CSV"}
          </span>
        </button>
      </div>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Top Products */}
        <div class="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs">
          <div class="flex items-center gap-2 border-b border-zinc-100 pb-3">
            <TrendingUp class="size-4 text-[#93509e]" />
            <h3 class="text-sm font-bold text-[#2E0C49]">
              Produtos Mais Vendidos no Atacado
            </h3>
          </div>

          <div class="mt-3 overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-zinc-50 font-bold text-zinc-600">
                <tr>
                  <th class="p-2.5">Produto</th>
                  <th class="p-2.5">SKU</th>
                  <th class="p-2.5">Unidades</th>
                  <th class="p-2.5">Faturamento</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-100">
                <Show
                  when={(data()?.top_products.length ?? 0) > 0}
                  fallback={
                    <tr>
                      <td colspan={4} class="p-6 text-center text-zinc-400">
                        {loading()
                          ? "Carregando produtos..."
                          : "Nenhuma venda de atacado registrada ainda."}
                      </td>
                    </tr>
                  }
                >
                  <For each={data()?.top_products}>
                    {(prod) => (
                      <tr class="hover:bg-zinc-50">
                        <td class="p-2.5 font-medium text-[#2E0C49]">
                          {prod.name}
                        </td>
                        <td class="p-2.5 font-mono text-[11px] text-zinc-500">
                          {prod.sku}
                        </td>
                        <td class="p-2.5 font-bold text-[#93509e]">
                          {prod.total_units} un.
                        </td>
                        <td class="p-2.5 font-semibold">
                          {formatCents(prod.total_revenue_cents)}
                        </td>
                      </tr>
                    )}
                  </For>
                </Show>
              </tbody>
            </table>
          </div>
        </div>

        {/* Rule Performance */}
        <div class="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs">
          <div class="flex items-center gap-2 border-b border-zinc-100 pb-3">
            <FileText class="size-4 text-emerald-600" />
            <h3 class="text-sm font-bold text-[#2E0C49]">
              Desempenho por Regra Comercial
            </h3>
          </div>

          <div class="mt-3 overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-zinc-50 font-bold text-zinc-600">
                <tr>
                  <th class="p-2.5">Regra</th>
                  <th class="p-2.5">Pedidos</th>
                  <th class="p-2.5">Unidades</th>
                  <th class="p-2.5">Desconto Total</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-100">
                <Show
                  when={(data()?.rule_performance.length ?? 0) > 0}
                  fallback={
                    <tr>
                      <td colspan={4} class="p-6 text-center text-zinc-400">
                        {loading()
                          ? "Carregando regras..."
                          : "Nenhum pedido com regra de atacado registrado ainda."}
                      </td>
                    </tr>
                  }
                >
                  <For each={data()?.rule_performance}>
                    {(rule) => (
                      <tr class="hover:bg-zinc-50">
                        <td class="p-2.5 font-medium text-[#2E0C49]">
                          {rule.rule_name}
                        </td>
                        <td class="p-2.5">{rule.orders_count}</td>
                        <td class="p-2.5">{rule.units_count} un.</td>
                        <td class="p-2.5 font-semibold text-emerald-700">
                          {formatCents(rule.discounts_cents)}
                        </td>
                      </tr>
                    )}
                  </For>
                </Show>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
