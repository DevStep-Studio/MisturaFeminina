import { createFileRoute } from "@tanstack/solid-router";
import { Show, createResource, createSignal } from "solid-js";
import { AdminLayout } from "../../../features/admin/AdminLayout";
import { AdminBarChart } from "../../../features/admin/components/charts/AdminBarChart";
import { AdminDonutChart } from "../../../features/admin/components/charts/AdminDonutChart";
import { api } from "../../../lib/api";
import { formatCents } from "../../../lib/format";
import { seoHead } from "../../../lib/seo";

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
    sku_snapshot: string;
    product_name_snapshot: string;
    qty_sold: number;
    revenue_cents: number;
  }[];
  top_coupons: { coupon_code: string; uses: number; discount_cents: number }[];
}

function AdminReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const thirtyAgo = new Date(Date.now() - 30 * 86400 * 1000)
    .toISOString()
    .slice(0, 10);
  const [from, setFrom] = createSignal(thirtyAgo);
  const [to, setTo] = createSignal(today);

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
      <div class="mb-6 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4">
        <div class="flex flex-wrap gap-3 text-sm">
          <div>
            <label class="block text-xs font-semibold text-zinc-700">De</label>
            <input
              type="date"
              value={from()}
              onInput={(e) => setFrom(e.currentTarget.value)}
              class="mt-1 h-9 rounded-md border border-zinc-300 px-3 text-xs"
            />
          </div>
          <div>
            <label class="block text-xs font-semibold text-zinc-700">Até</label>
            <input
              type="date"
              value={to()}
              onInput={(e) => setTo(e.currentTarget.value)}
              class="mt-1 h-9 rounded-md border border-zinc-300 px-3 text-xs"
            />
          </div>
        </div>
        <a
          href={`${import.meta.env.VITE_API_URL}/admin/reports/export-csv?from=${from()}&to=${to()}`}
          target="_blank"
          rel="noopener noreferrer"
          class="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-bold text-white"
        >
          Exportar pedidos CSV
        </a>
      </div>

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

            <div class="grid gap-6 lg:grid-cols-2">
              <AdminDonutChart
                title="Distribuição por Meio de Pagamento"
                subtitle="Faturamento bruto e número de transações no período"
                segments={r().by_payment_method.map((m, idx) => ({
                  id: m.method,
                  label:
                    m.method === "pix"
                      ? "PIX"
                      : m.method === "credit_card"
                        ? "Cartão de Crédito"
                        : m.method === "boleto"
                          ? "Boleto"
                          : m.method.toUpperCase(),
                  value: m.count,
                  cents: m.gross_cents,
                  color: ["#10b981", "#93509e", "#3b82f6", "#f59e0b"][idx % 4],
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
                }))}
              />
            </div>
          </div>
        )}
      </Show>
    </AdminLayout>
  );
}
