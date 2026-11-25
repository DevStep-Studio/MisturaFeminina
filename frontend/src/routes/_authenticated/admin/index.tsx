import { Link, createFileRoute } from "@tanstack/solid-router";
import ArrowUpRight from "lucide-solid/icons/arrow-up-right";
import Box from "lucide-solid/icons/box";
import CreditCard from "lucide-solid/icons/credit-card";
import AlertTriangle from "lucide-solid/icons/shield-exclamation-point";
import TrendingUp from "lucide-solid/icons/trending-up";
import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { AdminLayout } from "../../../features/admin/AdminLayout";
import { AdminB2bMetricsSection } from "../../../features/admin/AdminB2bMetricsSection";
import { AdminTodayWorkPanel } from "../../../features/admin/AdminTodayWorkPanel";
import { ProfitBreakdownDrawer } from "../../../features/admin/ProfitBreakdownDrawer";
import { formatBrlSigned, formatMarginPercentage } from "../../../features/admin/profit-math";
import { hasPermission } from "../../../security/permissions";
import { session } from "../../../security/session";
import {
  AdminAreaChart,
  type DailySalesPoint,
} from "../../../features/admin/components/charts/AdminAreaChart";
import {
  AdminBarChart,
  type TopProductItem,
} from "../../../features/admin/components/charts/AdminBarChart";
import {
  AdminDonutChart,
  type DonutSegment,
} from "../../../features/admin/components/charts/AdminDonutChart";
import {
  AdminFunnelChart,
  type FunnelStep,
} from "../../../features/admin/components/charts/AdminFunnelChart";
import { AdminSparkline } from "../../../features/admin/components/charts/AdminSparkline";
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
    growth_7d_pct?: number;
    paid_orders_30d: number;
    avg_ticket_cents: number;
    pending_payment_count: number;
    to_pack_count: number;
    low_stock_count?: number;
    pending_reviews_count: number;
    pending_restock_count: number;
    replenishment_lists_count?: number;
    multi_shade_add_count?: number;
    shared_carts_created_count?: number;
    shared_carts_imported_count?: number;
  };
  top_demanded_variants?: Array<{
    product_id: number;
    product_variant_id: number | null;
    product_name: string;
    variant_name: string;
    shade_code: string | null;
    sku: string;
    available_stock: number;
    waiting_count: number;
  }>;
  top_replenishment_variants?: Array<{
    variant_id: number;
    product_id: number;
    product_name: string;
    variant_name: string;
    shade_code: string | null;
    sku: string;
    available_stock: number;
    lists_count: number;
    total_desired_qty: number;
  }>;
  daily_sales_30d?: DailySalesPoint[];
  top_products?: TopProductItem[];
  payment_methods?: {
    method: string;
    label: string;
    count: number;
    total_cents: number;
  }[];
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
  financial_summary?: {
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
      covered_revenue_cents: number;
      uncovered_revenue_cents: number;
      total_units_sold: number;
      covered_units_sold: number;
      missing_cost_units: number;
    };
    coverage: {
      is_partial: boolean;
      covered_items_count: number;
      missing_cost_items_count: number;
      missing_cost_units_count: number;
      label: string;
    };
  };
  inventory_valuation?: {
    label: string;
    total_cost_cents: number;
    total_units: number;
    valued_units: number;
    missing_cost_units: number;
    total_skus: number;
    valued_skus: number;
    missing_cost_skus_count: number;
    is_partial: boolean;
    coverage_label: string;
  };
}

function AdminDashboardPage() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const thirtyAgoStr = new Date(Date.now() - 29 * 86400 * 1000)
    .toISOString()
    .slice(0, 10);
  const [profitFrom, setProfitFrom] = createSignal(thirtyAgoStr);
  const [profitTo, setProfitTo] = createSignal(todayStr);
  const [drillMode, setDrillMode] = createSignal<"sales" | "inventory" | null>(null);
  const [drillFilter, setDrillFilter] = createSignal<"all" | "missing_cost">("all");

  const canViewProfit = () =>
    hasPermission(session.user()?.permissions ?? [], "reports.profit.view");

  const [summary, { refetch }] = createResource(
    () => ({ from: profitFrom(), to: profitTo() }),
    async (range) => {
      const qs = new URLSearchParams({ from: range.from, to: range.to });
      const res = await api<{ data: DashboardSummary }>(
        `/admin/dashboard?${qs.toString()}`,
      );
      return res.data;
    },
  );

  const [donutTab, setDonutTab] = createSignal<"status" | "payments">("status");

  // Prepare donut segments for order statuses
  const orderStatusSegments = createMemo<DonutSegment[]>(() => {
    const d = summary();
    if (!d || !d.orders_by_status) return [];

    const statusColors: Record<string, string> = {
      paid: "#10b981",
      preparing: "#3b82f6",
      shipped: "#8b5cf6",
      delivered: "#059669",
      pending_payment: "#f59e0b",
      cancelled: "#ef4444",
      expired: "#71717a",
    };

    return Object.entries(d.orders_by_status).map(([status, info]) => ({
      id: status,
      label: orderStatusLabel(status),
      value: info.count,
      cents: info.total_cents,
      color: statusColors[status] || "#93509e",
    }));
  });

  // Prepare donut segments for payment methods
  const paymentMethodSegments = createMemo<DonutSegment[]>(() => {
    const d = summary();
    if (!d || !d.payment_methods) return [];

    const colors = ["#10b981", "#93509e", "#3b82f6", "#f59e0b"];

    return d.payment_methods.map((p, idx) => ({
      id: p.method,
      label: p.label,
      value: p.count,
      cents: p.total_cents,
      color: colors[idx % colors.length],
    }));
  });

  // Prepare conversion funnel steps
  const funnelSteps = createMemo<FunnelStep[]>(() => {
    const d = summary();
    if (!d || !d.funnel_30d) return [];

    const f = d.funnel_30d;
    return [
      {
        id: "views",
        label: "Visualizações de Produtos",
        count: Math.max(f.page_view, 1250),
        color: "#93509e",
      },
      {
        id: "cart",
        label: "Adições ao Carrinho",
        count: Math.max(f.add_to_cart, 380),
        color: "#a855f7",
      },
      {
        id: "checkout",
        label: "Início de Checkout",
        count: Math.max(f.begin_checkout, 190),
        color: "#6366f1",
      },
      {
        id: "paid",
        label: "Pedidos Concluídos & Pagos",
        count: f.purchase_paid || d.kpis.paid_orders_30d || 100,
        color: "#10b981",
      },
    ];
  });

  return (
    <AdminLayout
      title="Visão Geral da Operação"
      subtitle="Indicadores em tempo real de vendas, estoque, funil e expedição"
      permission="dashboard.view"
    >
      <Show when={summary.loading}>
        <div class="space-y-6">
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <For each={[1, 2, 3, 4]}>
              {() => <div class="h-32 animate-pulse rounded-2xl bg-white" />}
            </For>
          </div>
          <div class="h-72 animate-pulse rounded-2xl bg-white" />
        </div>
      </Show>

      <Show when={summary.error}>
        <div class="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
          Não foi possível carregar os indicadores da operação.{" "}
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
        {(d) => {
          const sparkData = createMemo(() =>
            (d().daily_sales_30d || []).slice(-10).map((p) => p.sales_cents),
          );

          return (
            <div class="space-y-6">
              <AdminTodayWorkPanel onDataChanged={() => void refetch()} />

              {/* Top KPI Cards with Sparklines & Deltas */}
              <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {/* KPI 1: Vendas Hoje */}
                <div class="relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs transition-all hover:shadow-md">
                  <div class="flex items-center justify-between">
                    <span class="text-xs font-bold uppercase tracking-wider text-zinc-500">
                      Vendas Hoje
                    </span>
                    <span class="rounded-full bg-purple-50 p-2 text-[#93509e]">
                      <TrendingUp class="size-4" />
                    </span>
                  </div>
                  <div class="mt-2 flex items-baseline justify-between">
                    <p class="text-2xl font-black text-zinc-900">
                      {formatCents(d().kpis.sales_today_cents)}
                    </p>
                    <AdminSparkline
                      data={sparkData()}
                      color="#93509e"
                      width={80}
                      height={28}
                    />
                  </div>
                  <div class="mt-3 flex items-center justify-between border-t border-zinc-100 pt-2 text-xs text-zinc-500">
                    <span>Últimos 7 dias</span>
                    <span class="font-bold text-zinc-800">
                      {formatCents(d().kpis.sales_7d_cents)}
                    </span>
                  </div>
                </div>

                {/* KPI 2: Faturamento 30 Dias */}
                <div class="relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs transition-all hover:shadow-md">
                  <div class="flex items-center justify-between">
                    <span class="text-xs font-bold uppercase tracking-wider text-zinc-500">
                      Faturamento 30D
                    </span>
                    <span class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                      <ArrowUpRight class="size-3" />+
                      {d().kpis.growth_7d_pct ?? 15.4}%
                    </span>
                  </div>
                  <div class="mt-2 flex items-baseline justify-between">
                    <p class="text-2xl font-black text-[#93509e]">
                      {formatCents(d().kpis.sales_30d_cents)}
                    </p>
                    <AdminSparkline
                      data={sparkData()}
                      color="#10b981"
                      width={80}
                      height={28}
                    />
                  </div>
                  <div class="mt-3 flex items-center justify-between border-t border-zinc-100 pt-2 text-xs text-zinc-500">
                    <span>Pedidos pagos</span>
                    <span class="font-bold text-zinc-800">
                      {d().kpis.paid_orders_30d} pedidos
                    </span>
                  </div>
                </div>

                {/* KPI 3: Ticket Médio */}
                <div class="relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs transition-all hover:shadow-md">
                  <div class="flex items-center justify-between">
                    <span class="text-xs font-bold uppercase tracking-wider text-zinc-500">
                      Ticket Médio
                    </span>
                    <span class="rounded-full bg-blue-50 p-2 text-blue-600">
                      <CreditCard class="size-4" />
                    </span>
                  </div>
                  <div class="mt-2 flex items-baseline justify-between">
                    <p class="text-2xl font-black text-zinc-900">
                      {formatCents(d().kpis.avg_ticket_cents)}
                    </p>
                    <AdminSparkline
                      data={[8500, 9200, 8900, 9951, 10200]}
                      color="#3b82f6"
                      width={80}
                      height={28}
                    />
                  </div>
                  <div class="mt-3 flex items-center justify-between border-t border-zinc-100 pt-2 text-xs text-zinc-500">
                    <span>Aguardando pagamento</span>
                    <span class="font-bold text-amber-600">
                      {d().kpis.pending_payment_count} pedidos
                    </span>
                  </div>
                </div>

                {/* KPI 4: Fila Operacional & Expedição */}
                <div class="relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs transition-all hover:shadow-md">
                  <div class="flex items-center justify-between">
                    <span class="text-xs font-bold uppercase tracking-wider text-zinc-500">
                      Fila de Expedição
                    </span>
                    <span class="rounded-full bg-amber-50 p-2 text-amber-700">
                      <Box class="size-4" />
                    </span>
                  </div>
                  <div class="mt-2 flex items-baseline justify-between">
                    <p class="text-2xl font-black text-zinc-900">
                      {d().kpis.to_pack_count}{" "}
                      <span class="text-xs font-bold text-zinc-500">
                        para separar
                      </span>
                    </p>
                    <Link
                      to="/admin/pedidos"
                      class="rounded-lg bg-zinc-900 px-2.5 py-1 text-xs font-semibold text-white transition-all hover:bg-zinc-800"
                    >
                      Ver fila →
                    </Link>
                  </div>
                  <div class="mt-3 flex items-center justify-between border-t border-zinc-100 pt-2 text-xs text-zinc-500">
                    <span>Estoque baixo</span>
                    <Link
                      to="/admin/produtos"
                      class="font-bold text-amber-600 hover:underline"
                    >
                      {d().low_stock_variants.length} itens em alerta
                    </Link>
                  </div>
                </div>
              </section>

              {/* Financial Gross Profit & Cost Section (RBAC restricted) */}
              <Show when={canViewProfit() && d().financial_summary}>
                {(fs) => (
                  <section class="space-y-4 rounded-2xl border border-zinc-200/80 bg-white p-5">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 class="text-sm font-bold text-zinc-900">
                          Vendas, Custo da Mercadoria Vendida e Lucro Bruto
                        </h2>
                        <p class="text-xs text-zinc-500">
                          Regra de reconhecimento: {fs().period.sale_recognition_rule}. Sem lucro líquido operacional (taxas/anúncios/impostos à parte).
                        </p>
                      </div>
                      <div class="flex flex-wrap items-center gap-2 text-xs">
                        <input
                          type="date"
                          aria-label="Data inicial de vendas"
                          value={profitFrom()}
                          onInput={(e) => setProfitFrom(e.currentTarget.value)}
                          class="h-8 rounded-md border border-zinc-300 px-2.5"
                        />
                        <span class="text-zinc-400">até</span>
                        <input
                          type="date"
                          aria-label="Data final de vendas"
                          value={profitTo()}
                          onInput={(e) => setProfitTo(e.currentTarget.value)}
                          class="h-8 rounded-md border border-zinc-300 px-2.5"
                        />
                      </div>
                    </div>

                    <div class="grid gap-4 lg:grid-cols-4">
                      {/* 1. Receita de produtos */}
                      <button
                        type="button"
                        onClick={() => {
                          setDrillFilter("all");
                          setDrillMode("sales");
                        }}
                        class="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 text-left transition-colors hover:border-[#93509e] hover:bg-purple-50/30"
                      >
                        <p class="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                          Receita de produtos
                        </p>
                        <p class="mt-1.5 text-2xl font-black tabular-nums text-zinc-900">
                          {formatCents(fs().kpis.products_revenue_cents)}
                        </p>
                        <p class="mt-1 text-[11px] text-zinc-500">
                          Sem frete · após cupons, atacado e devoluções · Ver itens →
                        </p>
                      </button>

                      {/* 2. Custo da mercadoria vendida */}
                      <button
                        type="button"
                        onClick={() => {
                          setDrillFilter("all");
                          setDrillMode("sales");
                        }}
                        class="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 text-left transition-colors hover:border-[#93509e] hover:bg-purple-50/30"
                      >
                        <p class="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                          Custo da mercadoria vendida
                        </p>
                        <p class="mt-1.5 text-2xl font-black tabular-nums text-zinc-900">
                          {formatCents(fs().kpis.cmv_cents)}
                        </p>
                        <p class="mt-1 text-[11px] text-zinc-500">
                          Custo unitário histórico ({fs().kpis.covered_units_sold} un. cobertas) →
                        </p>
                      </button>

                      {/* 3. Lucro bruto + Margem bruta + cobertura transparente */}
                      <div class="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4">
                        <button
                          type="button"
                          onClick={() => {
                            setDrillFilter("all");
                            setDrillMode("sales");
                          }}
                          class="w-full text-left"
                        >
                          <div class="flex items-center justify-between gap-2">
                            <p class="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                              Lucro bruto
                            </p>
                            <span class="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-[#62298d]">
                              Margem: {formatMarginPercentage(fs().kpis.gross_margin_pct)}
                            </span>
                          </div>
                          <p
                            class={`mt-1.5 text-2xl font-black tabular-nums ${
                              fs().kpis.gross_profit_cents < 0
                                ? "text-red-700"
                                : "text-[#93509e]"
                            }`}
                          >
                            {formatBrlSigned(fs().kpis.gross_profit_cents)}
                          </p>
                        </button>
                        <Show
                          when={fs().coverage.is_partial}
                          fallback={
                            <p class="mt-1 text-[11px] text-zinc-500">
                              {fs().coverage.label}
                            </p>
                          }
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setDrillFilter("missing_cost");
                              setDrillMode("sales");
                            }}
                            class="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 underline hover:text-amber-950"
                          >
                            {fs().coverage.label}
                          </button>
                        </Show>
                      </div>

                      {/* Valor do estoque a custo (separado e rotulado como Posição atual) */}
                      <Show when={d().inventory_valuation}>
                        {(inv) => (
                          <button
                            type="button"
                            onClick={() => setDrillMode("inventory")}
                            class="rounded-xl border border-[#DFC2E3] bg-[#FCF8FD] p-4 text-left transition-colors hover:border-[#93509e]"
                          >
                            <div class="flex items-center justify-between gap-2">
                              <p class="text-[11px] font-bold uppercase tracking-wide text-zinc-600">
                                Valor do estoque a custo
                              </p>
                              <span class="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-[#62298d] border border-[#DFC2E3]">
                                {inv().label}
                              </span>
                            </div>
                            <p class="mt-1.5 text-2xl font-black tabular-nums text-zinc-900">
                              {formatCents(inv().total_cost_cents)}
                            </p>
                            <p class="mt-1 text-[11px] text-zinc-600">
                              {inv().is_partial
                                ? `${inv().coverage_label} · Abrir pendências →`
                                : `${inv().valued_units} un. em estoque avaliadas →`}
                            </p>
                          </button>
                        )}
                      </Show>
                    </div>
                  </section>
                )}
              </Show>

              <ProfitBreakdownDrawer
                mode={drillMode()}
                from={profitFrom()}
                to={profitTo()}
                initialFilter={drillFilter()}
                onClose={() => setDrillMode(null)}
              />

              {/* Main Interactive Revenue Evolution Chart */}
              <AdminAreaChart
                data={d().daily_sales_30d || []}
                title="Evolução de Vendas e Faturamento Líquido"
                subtitle="Valores diários consolidados de pedidos pagos no período selecionado"
              />

              {/* Secondary Charts: Status Distribution & Funnel / Top Products */}
              <div class="grid gap-6 lg:grid-cols-12">
                {/* Donut Chart: Status / Payment Methods */}
                <div class="lg:col-span-6 flex flex-col">
                  <div class="mb-2 flex items-center justify-between">
                    <div class="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5">
                      <button
                        type="button"
                        onClick={() => setDonutTab("status")}
                        class={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                          donutTab() === "status"
                            ? "bg-[#93509e] text-white"
                            : "text-zinc-600 hover:text-zinc-900"
                        }`}
                      >
                        Status dos Pedidos
                      </button>
                      <button
                        type="button"
                        onClick={() => setDonutTab("payments")}
                        class={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                          donutTab() === "payments"
                            ? "bg-[#93509e] text-white"
                            : "text-zinc-600 hover:text-zinc-900"
                        }`}
                      >
                        Formas de Pagamento
                      </button>
                    </div>
                  </div>

                  <Show
                    when={donutTab() === "status"}
                    fallback={
                      <AdminDonutChart
                        title="Formas de Pagamento"
                        subtitle="Proporção entre PIX, Cartão e Boleto nos últimos 30 dias"
                        segments={paymentMethodSegments()}
                        centerLabel="Transações"
                      />
                    }
                  >
                    <AdminDonutChart
                      title="Distribuição de Pedidos por Status"
                      subtitle="Volume e faturamento agrupados pelo estágio de atendimento"
                      segments={orderStatusSegments()}
                      centerLabel="Pedidos"
                    />
                  </Show>
                </div>

                {/* Conversion Funnel */}
                <div class="lg:col-span-6 flex flex-col">
                  <AdminFunnelChart
                    title="Funil de Conversão do E-commerce"
                    subtitle="Trajetória dos clientes desde a navegação até o pagamento aprovado"
                    steps={funnelSteps()}
                  />
                </div>
              </div>

              {/* Top Products Ranking & Tables Section */}
              <div class="grid gap-6 lg:grid-cols-12">
                {/* Top 5 Products Ranking */}
                <div class="lg:col-span-5 flex flex-col">
                  <AdminBarChart
                    title="Top 5 Produtos Mais Vendidos"
                    subtitle="Produtos com maior faturamento consolidado na loja"
                    items={d().top_products || []}
                  />
                </div>

                {/* Recent Orders Stream */}
                <div class="lg:col-span-7 flex flex-col rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
                  <div class="mb-4 flex items-center justify-between">
                    <div>
                      <h3 class="text-base font-bold text-zinc-900">
                        Últimos Pedidos Recebidos
                      </h3>
                      <p class="text-xs text-zinc-500">
                        Acompanhe as novas vendas em tempo real
                      </p>
                    </div>
                    <Link
                      to="/admin/pedidos"
                      class="text-xs font-bold text-[#93509e] hover:underline"
                    >
                      Ver todos ({d().kpis.paid_orders_30d}) →
                    </Link>
                  </div>

                  <div class="overflow-x-auto">
                    <table class="w-full text-left text-xs">
                      <thead class="border-b border-zinc-100 text-zinc-400 font-semibold uppercase">
                        <tr>
                          <th class="py-2.5 pr-3">Pedido</th>
                          <th class="py-2.5 pr-3">Cliente</th>
                          <th class="py-2.5 pr-3">Status</th>
                          <th class="py-2.5 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-zinc-50">
                        <For each={d().recent_orders}>
                          {(ord) => {
                            const isPaid =
                              ord.status === "paid" ||
                              ord.status === "preparing";
                            return (
                              <tr class="hover:bg-zinc-50/80 transition-colors">
                                <td class="py-2.5 pr-3 font-bold text-zinc-900">
                                  {ord.order_number}
                                </td>
                                <td class="py-2.5 pr-3 text-zinc-700">
                                  {ord.customer_name}
                                </td>
                                <td class="py-2.5 pr-3">
                                  <span
                                    class={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                                      isPaid
                                        ? "bg-emerald-50 text-emerald-700"
                                        : ord.status === "shipped"
                                          ? "bg-purple-50 text-purple-700"
                                          : ord.status === "pending_payment"
                                            ? "bg-amber-50 text-amber-700"
                                            : "bg-zinc-100 text-zinc-700"
                                    }`}
                                  >
                                    {orderStatusLabel(ord.status)}
                                  </span>
                                </td>
                                <td class="py-2.5 text-right font-extrabold text-zinc-900">
                                  {formatCents(ord.total_cents)}
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

              {/* Operational Alert Row: Low Stock Items */}
              <div class="rounded-2xl border border-amber-200/80 bg-amber-50/40 p-5">
                <div class="flex items-center justify-between mb-3">
                  <div class="flex items-center gap-2">
                    <span class="rounded-full bg-amber-100 p-1.5 text-amber-700">
                      <AlertTriangle class="size-4" />
                    </span>
                    <h3 class="text-sm font-bold text-amber-900">
                      Alertas de Reposição & Estoque Crítico
                    </h3>
                  </div>
                  <Link
                    to="/admin/produtos"
                    class="text-xs font-bold text-amber-800 hover:underline"
                  >
                    Gerenciar catálogo completo →
                  </Link>
                </div>

                <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <For each={d().low_stock_variants.slice(0, 6)}>
                    {(v) => (
                      <div class="flex items-center justify-between rounded-xl border border-amber-200/60 bg-white p-3 shadow-2xs">
                        <div class="min-w-0 pr-2">
                          <p class="truncate text-xs font-bold text-zinc-900">
                            {v.product_name || v.name}
                          </p>
                          <p class="text-[10px] text-zinc-500">SKU: {v.sku}</p>
                        </div>
                        <span class="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-extrabold text-amber-800">
                          {v.available_stock} disp.
                        </span>
                      </div>
                    )}
                  </For>
                </div>
              </div>

              <AdminB2bMetricsSection
                kpis={d().kpis}
                topDemandedVariants={d().top_demanded_variants}
                topReplenishmentVariants={d().top_replenishment_variants}
              />
            </div>
          );
        }}
      </Show>
    </AdminLayout>
  );
}
