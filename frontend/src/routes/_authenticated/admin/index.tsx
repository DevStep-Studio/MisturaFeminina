import { createFileRoute, Link } from "@tanstack/solid-router";
import AlertTriangle from "lucide-solid/icons/shield-exclamation-point";
import { For, Show, createResource } from "solid-js";
import { AdminLayout } from "../../../features/admin/AdminLayout";
import { api } from "../../../lib/api";
import { formatCents, orderStatusLabel } from "../../../lib/format";
import { seoHead } from "../../../lib/seo";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () =>
    seoHead({
      title: "Painel Administrativo — Mistura Feminina",
      description: "Visão executiva da operação.",
      path: "/admin",
      noindex: true,
    }),
  component: AdminDashboardPage,
});

interface DashboardSummary {
  kpis: {
    sales_today_cents: number;
    sales_7d_cents: number;
    sales_30d_cents: number;
    paid_orders_30d: number;
    avg_ticket_cents: number;
    pending_payment_count: number;
    to_pack_count: number;
    pending_reviews_count: number;
    pending_restock_count: number;
  };
  orders_by_status: Record<string, { count: number; total_cents: number }>;
  low_stock_variants: {
    id: number;
    sku: string;
    name: string;
    product_name: string | null;
    stock_qty: number;
    reserved_qty: number;
    available_stock: number;
  }[];
  recent_orders: {
    id: number;
    order_number: string;
    customer_name: string;
    total_cents: number;
    status: string;
    created_at: string;
  }[];
  funnel_30d: {
    page_view: number;
    add_to_cart: number;
    begin_checkout: number;
    purchase_created: number;
    purchase_paid: number;
  };
}

function AdminDashboardPage() {
  const [summary, { refetch }] = createResource(async () => {
    const res = await api<{ data: DashboardSummary }>("/admin/dashboard");
    return res.data;
  });

  return (
    <AdminLayout
      title="Visão Geral da Operação"
      subtitle="Indicadores em tempo real de vendas, estoque e expedição"
      permission="dashboard.view"
    >
      <Show when={summary.loading}>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <For each={[1, 2, 3, 4]}>
            {() => <div class="h-28 animate-pulse rounded-xl bg-white" />}
          </For>
        </div>
      </Show>

      <Show when={summary.error}>
        <div class="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
          Não foi possível carregar os indicadores.{" "}
          <button
            type="button"
            onClick={() => void refetch()}
            class="font-bold underline"
          >
            Tentar novamente
          </button>
        </div>
      </Show>

      <Show when={summary()}>
        {(d) => (
          <div class="space-y-6">
            <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div class="rounded-xl border border-zinc-200 bg-white p-5">
                <p class="text-xs font-semibold uppercase text-zinc-500">
                  Vendas Hoje
                </p>
                <p class="mt-2 text-2xl font-extrabold text-zinc-900">
                  {formatCents(d().kpis.sales_today_cents)}
                </p>
                <p class="mt-1 text-xs text-zinc-500">
                  7 dias: {formatCents(d().kpis.sales_7d_cents)}
                </p>
              </div>
              <div class="rounded-xl border border-zinc-200 bg-white p-5">
                <p class="text-xs font-semibold uppercase text-zinc-500">
                  Faturamento 30 dias
                </p>
                <p class="mt-2 text-2xl font-extrabold text-[var(--mf-primary)]">
                  {formatCents(d().kpis.sales_30d_cents)}
                </p>
                <p class="mt-1 text-xs text-zinc-500">
                  {d().kpis.paid_orders_30d} pedidos pagos
                </p>
              </div>
              <div class="rounded-xl border border-zinc-200 bg-white p-5">
                <p class="text-xs font-semibold uppercase text-zinc-500">
                  Ticket Médio (30d)
                </p>
                <p class="mt-2 text-2xl font-extrabold text-zinc-900">
                  {formatCents(d().kpis.avg_ticket_cents)}
                </p>
                <p class="mt-1 text-xs text-zinc-500">
                  {d().kpis.pending_payment_count} aguardando pagamento
                </p>
              </div>
              <div class="rounded-xl border border-zinc-200 bg-white p-5">
                <p class="text-xs font-semibold uppercase text-zinc-500">
                  Fila Operacional
                </p>
                <p class="mt-2 text-2xl font-extrabold text-zinc-900">
                  {d().kpis.to_pack_count} para separar
                </p>
                <p class="mt-1 text-xs text-zinc-500">
                  {d().kpis.pending_reviews_count} avaliações ·{" "}
                  {d().kpis.pending_restock_count} avisos estoque
                </p>
              </div>
            </section>

            <div class="grid gap-6 lg:grid-cols-12">
              <section class="rounded-xl border border-zinc-200 bg-white p-5 lg:col-span-7">
                <div class="mb-4 flex items-center justify-between">
                  <h2 class="text-base font-bold text-zinc-900">
                    Pedidos Recentes
                  </h2>
                  <Link
                    to="/admin/pedidos"
                    class="text-xs font-semibold text-[var(--mf-primary)] hover:underline"
                  >
                    Gerenciar pedidos
                  </Link>
                </div>
                <div class="overflow-x-auto">
                  <table class="w-full text-left text-sm">
                    <thead class="border-b border-zinc-200 text-xs uppercase text-zinc-500">
                      <tr>
                        <th class="py-2 pr-3">Pedido</th>
                        <th class="py-2 pr-3">Cliente</th>
                        <th class="py-2 pr-3">Status</th>
                        <th class="py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-zinc-100">
                      <For each={d().recent_orders}>
                        {(ord) => (
                          <tr>
                            <td class="py-2.5 pr-3 font-semibold text-zinc-900">
                              {ord.order_number}
                            </td>
                            <td class="py-2.5 pr-3 text-zinc-700">
                              {ord.customer_name}
                            </td>
                            <td class="py-2.5 pr-3">
                              <span class="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-800">
                                {orderStatusLabel(ord.status)}
                              </span>
                            </td>
                            <td class="py-2.5 text-right font-bold">
                              {formatCents(ord.total_cents)}
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </section>

              <section class="rounded-xl border border-zinc-200 bg-white p-5 lg:col-span-5">
                <div class="mb-4 flex items-center justify-between">
                  <h2 class="inline-flex items-center gap-1.5 text-base font-bold text-zinc-900">
                    <AlertTriangle class="h-4 w-4 text-amber-600" />
                    Alertas de Estoque Baixo
                  </h2>
                  <Link
                    to="/admin/produtos"
                    class="text-xs font-semibold text-[var(--mf-primary)] hover:underline"
                  >
                    Ajustar estoque
                  </Link>
                </div>
                <Show
                  when={d().low_stock_variants.length > 0}
                  fallback={
                    <p class="text-sm text-zinc-500">
                      Nenhuma variação abaixo do mínimo configurado.
                    </p>
                  }
                >
                  <ul class="divide-y divide-zinc-100 text-sm">
                    <For each={d().low_stock_variants}>
                      {(v) => (
                        <li class="flex items-center justify-between py-2.5">
                          <div class="min-w-0 pr-3">
                            <p class="truncate font-semibold text-zinc-900">
                              {v.product_name || v.name}
                            </p>
                            <p class="text-xs text-zinc-500">
                              SKU {v.sku} · {v.name}
                            </p>
                          </div>
                          <span class="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                            {v.available_stock} disp.
                          </span>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </section>
            </div>
          </div>
        )}
      </Show>
    </AdminLayout>
  );
}
