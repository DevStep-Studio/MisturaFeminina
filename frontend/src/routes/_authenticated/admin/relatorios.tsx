import { createFileRoute } from "@tanstack/solid-router";
import { For, Show, createResource, createSignal } from "solid-js";
import {
  AdminIntelligentReportsTabs,
  type IntelligentReportTab,
} from "../../../features/admin/AdminIntelligentReportsTabs";
import { AdminLayout } from "../../../features/admin/AdminLayout";
import { AdminBarChart } from "../../../features/admin/components/charts/AdminBarChart";
import { AdminDonutChart } from "../../../features/admin/components/charts/AdminDonutChart";
import {
  formatBrlSigned,
  formatMarginPercentage,
} from "../../../features/admin/profit-math";
import { api } from "../../../lib/api";
import { formatCents } from "../../../lib/format";
import { seoHead } from "../../../lib/seo";
import { hasPermission } from "../../../security/permissions";
import { session } from "../../../security/session";

export const Route = createFileRoute("/_authenticated/admin/relatorios")({
  head: () =>
    seoHead({
      title: "Relatórios — Admin Mistura Feminina",
      description: "Relatórios financeiros, produtos mais vendidos e cupons.",
      path: "/admin/relatorios",
      noindex: true,
    }),
  component: AdminReportsPage,
});

interface ReportData {
  period: { from: string; to: string };
  summary: {
    total_orders: number;
    paid_orders: number;
    conversion_paid_rate: number;
    gross_revenue_cents: number;
    discount_total_cents: number;
    shipping_total_cents: number;
    avg_ticket_cents: number;
  };
  by_payment_method: {
    method: string;
    count: number;
    gross_cents: number;
    fee_cents: number;
    net_cents: number;
  }[];
  top_products: {
    product_id?: number | null;
    sku_snapshot: string;
    product_name_snapshot: string;
    qty_sold: number;
    revenue_cents: number;
    image_url?: string | null;
  }[];
  top_coupons: { coupon_code: string; uses: number; discount_cents: number }[];
  profit_summary?: {
    period: {
      from: string;
      to: string;
      sale_recognition_rule: string;
      adjustment_date_rule: string;
    };
    kpis: {
      products_revenue_cents: number;
      cmv_cents: number;
      gross_profit_cents: number;
      gross_margin_pct: number | null;
    };
    coverage: {
      is_partial: boolean;
      missing_cost_items_count: number;
      label: string;
    };
  };
  top_products_profit?: Array<{
    sku_snapshot: string;
    product_name_snapshot: string;
    variant_name_snapshot: string;
    qty_sold: number;
    revenue_cents: number;
    cmv_cents: number;
    gross_profit_cents: number;
    gross_margin_pct: number | null;
    has_missing_cost: boolean;
  }>;
  inventory_valuation?: {
    label: string;
    total_cost_cents: number;
    coverage_label: string;
  };
}

function AdminReportsPage() {
  const canViewProfit = () =>
    hasPermission(session.user()?.permissions ?? [], "reports.profit.view");
  const canExportProfit = () =>
    hasPermission(session.user()?.permissions ?? [], "reports.profit.export");
  const today = new Date().toISOString().slice(0, 10);
  const thirtyAgo = new Date(Date.now() - 30 * 86400 * 1000)
    .toISOString()
    .slice(0, 10);
  const [from, setFrom] = createSignal(thirtyAgo);
  const [to, setTo] = createSignal(today);
  const [activeTab, setActiveTab] = createSignal<
    "financeiro" | IntelligentReportTab
  >("financeiro");

  const [report] = createResource(
    () => ({ from: from(), to: to() }),
    async (p) => {
      const res = await api<{ data: ReportData }>(
        `/admin/reports?from=${p.from}&to=${p.to}`,
      );
      return res.data;
    },
  );

  return (
    <AdminLayout
      title="Relatórios Financeiros e Comerciais"
      subtitle="Faturamento bruto, taxas de pagamento, produtos mais vendidos e cupons"
      permission="reports.view"
    >
      <div class="mb-4 flex flex-wrap gap-2">
        <For
          each={
            [
              ["financeiro", "Financeiro & Vendas"],
              ["zero_results", "Buscas sem Resultado"],
              ["demanded_shades", "Cores Mais Solicitadas"],
              ["bought_together", "Produtos Comprados Juntos"],
            ] as const
          }
        >
          {([key, label]) => (
            <button
              type="button"
              onClick={() => setActiveTab(key)}
              class={`rounded-lg px-4 py-2 text-xs font-bold transition-colors ${
                activeTab() === key
                  ? "bg-[var(--mf-primary)] text-white"
                  : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50"
              }`}
            >
              {label}
            </button>
          )}
        </For>
      </div>

      <div class="mb-6 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4">
        <div class="flex flex-wrap gap-3 text-sm">
          <div>
            <label class="block text-xs font-semibold text-zinc-700">De</label>
            <input
              type="date"
              value={from()}
              onInput={(e) => setFrom(e.currentTarget.value)}
              class="mt-1 h-9 rounded-xl border border-zinc-300/90 bg-white px-3 text-xs font-semibold text-zinc-800 shadow-2xs transition focus:border-[#93509e] focus:outline-none focus:ring-2 focus:ring-[#93509e]/15"
            />
          </div>
          <div>
            <label class="block text-xs font-semibold text-zinc-700">Até</label>
            <input
              type="date"
              value={to()}
              onInput={(e) => setTo(e.currentTarget.value)}
              class="mt-1 h-9 rounded-xl border border-zinc-300/90 bg-white px-3 text-xs font-semibold text-zinc-800 shadow-2xs transition focus:border-[#93509e] focus:outline-none focus:ring-2 focus:ring-[#93509e]/15"
            />
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <Show when={canExportProfit()}>
            <a
              href={`${import.meta.env.VITE_API_URL}/admin/reports/profit-export-csv?from=${from()}&to=${to()}`}
              target="_blank"
              rel="noopener noreferrer"
              class="rounded-lg border border-[#93509e] bg-white px-4 py-2 text-xs font-bold text-[#93509e] hover:bg-purple-50"
            >
              Exportar Lucro Bruto CSV
            </a>
          </Show>
          <a
            href={`${import.meta.env.VITE_API_URL}/admin/reports/export-csv?from=${from()}&to=${to()}`}
            target="_blank"
            rel="noopener noreferrer"
            class="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-bold text-white"
          >
            Exportar pedidos CSV
          </a>
        </div>
      </div>

      <Show when={activeTab() === "financeiro"}>
        <Show when={report()}>
          {(r) => (
            <div class="space-y-6">
              <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div class="rounded-xl border border-zinc-200 bg-white p-4">
                  <p class="text-xs font-semibold uppercase text-zinc-500">
                    Receita Bruta Paga
                  </p>
                  <p class="mt-1 text-2xl font-extrabold text-[var(--mf-primary)]">
                    {formatCents(r().summary.gross_revenue_cents)}
                  </p>
                </div>
                <div class="rounded-xl border border-zinc-200 bg-white p-4">
                  <p class="text-xs font-semibold uppercase text-zinc-500">
                    Pedidos Pagos / Total
                  </p>
                  <p class="mt-1 text-2xl font-extrabold text-zinc-900">
                    {r().summary.paid_orders} / {r().summary.total_orders}
                  </p>
                  <p class="text-xs text-zinc-500">
                    Taxa: {r().summary.conversion_paid_rate}%
                  </p>
                </div>
                <div class="rounded-xl border border-zinc-200 bg-white p-4">
                  <p class="text-xs font-semibold uppercase text-zinc-500">
                    Ticket Médio
                  </p>
                  <p class="mt-1 text-2xl font-extrabold text-zinc-900">
                    {formatCents(r().summary.avg_ticket_cents)}
                  </p>
                </div>
                <div class="rounded-xl border border-zinc-200 bg-white p-4">
                  <p class="text-xs font-semibold uppercase text-zinc-500">
                    Descontos Concedidos
                  </p>
                  <p class="mt-1 text-2xl font-extrabold text-zinc-900">
                    {formatCents(r().summary.discount_total_cents)}
                  </p>
                </div>
              </div>

              <div class="grid gap-6 lg:grid-cols-2 lg:items-start">
                <AdminDonutChart
                  title="Distribuição por Meio de Pagamento"
                  subtitle="Faturamento bruto e número de transações no período"
                  segments={r()
                    .by_payment_method.slice()
                    .sort((a, b) => b.count - a.count)
                    .map((m, idx) => ({
                    id: m.method,
                    label:
                      m.method === "pix"
                        ? "PIX"
                        : m.method === "credit_card"
                          ? "Cartão de Crédito"
                          : m.method === "boleto"
                            ? "Boleto Bancário"
                            : m.method.toUpperCase(),
                    value: m.count,
                    cents: m.gross_cents,
                    feeCents: m.fee_cents,
                    netCents: m.net_cents,
                    color:
                      m.method === "pix"
                        ? "#10b981"
                        : m.method === "credit_card"
                          ? "#93509e"
                          : m.method === "boleto"
                            ? "#f59e0b"
                            : ["#10b981", "#93509e", "#f59e0b", "#3b82f6"][idx % 4],
                  }))}
                  centerLabel="Pagamentos"
                />

                <AdminBarChart
                  title="Top Produtos por Receita"
                  subtitle="Produtos com maior volume financeiro no período filtrado"
                  items={r().top_products.map((p) => ({
                    name: p.product_name_snapshot,
                    total_qty: p.qty_sold,
                    total_cents: p.revenue_cents,
                    image_url: p.image_url,
                    product_id: p.product_id,
                  }))}
                />
              </div>

              <Show when={canViewProfit() && r().profit_summary}>
                {(ps) => (
                  <div class="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 class="text-sm font-bold text-zinc-900">
                          Apuração de CMV e Lucro Bruto
                        </h3>
                        <p class="text-xs text-zinc-500">
                          {ps().period.sale_recognition_rule} · {ps().coverage.label}
                        </p>
                      </div>
                      <Show when={r().inventory_valuation}>
                        {(inv) => (
                          <span class="rounded-md border border-[#DFC2E3] bg-[#FCF8FD] px-3 py-1 text-xs font-semibold text-[#62298d]">
                            Estoque ({inv().label}):{" "}
                            {formatCents(inv().total_cost_cents)}
                          </span>
                        )}
                      </Show>
                    </div>

                    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div class="rounded-lg border border-zinc-200 p-3">
                        <p class="text-xs font-semibold uppercase text-zinc-500">
                          Receita de produtos
                        </p>
                        <p class="mt-1 text-xl font-extrabold tabular-nums text-zinc-900">
                          {formatCents(ps().kpis.products_revenue_cents)}
                        </p>
                      </div>
                      <div class="rounded-lg border border-zinc-200 p-3">
                        <p class="text-xs font-semibold uppercase text-zinc-500">
                          CMV histórico
                        </p>
                        <p class="mt-1 text-xl font-extrabold tabular-nums text-zinc-900">
                          {formatCents(ps().kpis.cmv_cents)}
                        </p>
                      </div>
                      <div class="rounded-lg border border-zinc-200 p-3">
                        <p class="text-xs font-semibold uppercase text-zinc-500">
                          Lucro bruto
                        </p>
                        <p class="mt-1 text-xl font-extrabold tabular-nums text-[#93509e]">
                          {formatBrlSigned(ps().kpis.gross_profit_cents)}
                        </p>
                      </div>
                      <div class="rounded-lg border border-zinc-200 p-3">
                        <p class="text-xs font-semibold uppercase text-zinc-500">
                          Margem bruta
                        </p>
                        <p class="mt-1 text-xl font-extrabold tabular-nums text-zinc-900">
                          {formatMarginPercentage(ps().kpis.gross_margin_pct)}
                        </p>
                      </div>
                    </div>

                    <Show when={(r().top_products_profit?.length ?? 0) > 0}>
                      <div class="overflow-x-auto rounded-lg border border-zinc-200">
                        <table class="w-full min-w-[600px] text-left text-xs">
                          <thead>
                            <tr class="border-b border-zinc-200 bg-zinc-50 text-[11px] font-semibold uppercase text-zinc-600">
                              <th class="px-3 py-2">Produto / SKU</th>
                              <th class="px-3 py-2 text-right">Qtd</th>
                              <th class="px-3 py-2 text-right">Receita líq.</th>
                              <th class="px-3 py-2 text-right">CMV</th>
                              <th class="px-3 py-2 text-right">Lucro bruto</th>
                              <th class="px-3 py-2 text-right">Margem</th>
                            </tr>
                          </thead>
                          <tbody class="divide-y divide-zinc-100">
                            <For each={r().top_products_profit ?? []}>
                              {(item) => (
                                <tr>
                                  <td class="px-3 py-2">
                                    <p class="font-semibold text-zinc-900">
                                      {item.product_name_snapshot} ({item.variant_name_snapshot})
                                    </p>
                                    <p class="font-mono text-[11px] text-zinc-500">
                                      {item.sku_snapshot}
                                      {item.has_missing_cost ? " · contém item sem custo" : ""}
                                    </p>
                                  </td>
                                  <td class="px-3 py-2 text-right tabular-nums">
                                    {item.qty_sold}
                                  </td>
                                  <td class="px-3 py-2 text-right font-semibold tabular-nums">
                                    {formatCents(item.revenue_cents)}
                                  </td>
                                  <td class="px-3 py-2 text-right tabular-nums">
                                    {formatCents(item.cmv_cents)}
                                  </td>
                                  <td class="px-3 py-2 text-right font-bold tabular-nums text-[#62298d]">
                                    {formatBrlSigned(item.gross_profit_cents)}
                                  </td>
                                  <td class="px-3 py-2 text-right tabular-nums">
                                    {formatMarginPercentage(item.gross_margin_pct)}
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
            </div>
          )}
        </Show>
      </Show>

      <Show when={activeTab() !== "financeiro"}>
        <AdminIntelligentReportsTabs
          activeTab={activeTab() as IntelligentReportTab}
          from={from()}
          to={to()}
        />
      </Show>
    </AdminLayout>
  );
}
