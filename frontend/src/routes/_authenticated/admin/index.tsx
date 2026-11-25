import { Link, createFileRoute } from "@tanstack/solid-router";
import AlertTriangle from "lucide-solid/icons/shield-exclamation-point";
import ArrowRight from "lucide-solid/icons/arrow-right";
import Boxes from "lucide-solid/icons/boxes";
import Calendar from "lucide-solid/icons/calendar";
import Clock from "lucide-solid/icons/clock";
import ShoppingBag from "lucide-solid/icons/shopping-bag";
import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { AdminLayout } from "../../../features/admin/AdminLayout";
import { AdminB2bMetricsSection } from "../../../features/admin/AdminB2bMetricsSection";
import { AdminTodayWorkPanel } from "../../../features/admin/AdminTodayWorkPanel";
import { ProfitBreakdownDrawer } from "../../../features/admin/ProfitBreakdownDrawer";
import {
  AdminButton,
  AdminCard,
  AdminMetricCard,
} from "../../../features/admin/ui";
import {
  formatBrlSigned,
  formatMarginPercentage,
} from "../../../features/admin/profit-math";
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

interface ProfitComparison {
  previous_from: string;
  previous_to: string;
  has_prior_data: boolean;
  previous_products_revenue_cents: number;
  previous_cmv_cents: number;
  previous_gross_profit_cents: number;
  revenue_delta_pct: number | null;
  cmv_delta_pct: number | null;
  profit_delta_pct: number | null;
}

interface DashboardSummary {
  kpis: {
    sales_today_cents: number;
    sales_7d_cents: number;
    sales_30d_cents: number;
    growth_7d_pct?: number | null;
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
  daily_sales_period?: DailySalesPoint[];
  top_products?: TopProductItem[];
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
    comparison?: ProfitComparison | null;
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

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400 * 1000).toISOString().slice(0, 10);
}

function formatDeltaLabel(delta: number | null | undefined): string | null {
  if (delta === null || delta === undefined || !Number.isFinite(delta)) {
    return null;
  }
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1).replace(".", ",")}%`;
}

function AdminDashboardPage() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [preset, setPreset] = createSignal<"today" | "7d" | "30d" | "custom">(
    "30d",
  );
  const [profitFrom, setProfitFrom] = createSignal(isoDaysAgo(29));
  const [profitTo, setProfitTo] = createSignal(todayStr);
  const [drillMode, setDrillMode] = createSignal<"sales" | "inventory" | null>(
    null,
  );
  const [drillFilter, setDrillFilter] = createSignal<"all" | "missing_cost">(
    "all",
  );
  const [opsTab, setOpsTab] = createSignal<"orders" | "today" | "b2b">(
    "orders",
  );

  const canViewProfit = () =>
    hasPermission(session.user()?.permissions ?? [], "reports.profit.view");

  function applyPreset(next: "today" | "7d" | "30d") {
    setPreset(next);
    setProfitTo(todayStr);
    if (next === "today") {
      setProfitFrom(todayStr);
    } else if (next === "7d") {
      setProfitFrom(isoDaysAgo(6));
    } else {
      setProfitFrom(isoDaysAgo(29));
    }
  }

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

  const periodFilterControls = (
    <div class="flex flex-wrap items-center gap-2 text-xs">
      {/* Segmented Period Shortcuts */}
      <div
        role="group"
        aria-label="Atalhos de período"
        class="inline-flex h-9 shrink-0 items-center rounded-xl border border-zinc-200/90 bg-zinc-100/70 p-1 shadow-2xs"
      >
        <button
          type="button"
          onClick={() => applyPreset("today")}
          class={`h-7 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition-all duration-150 ${
            preset() === "today"
              ? "bg-white font-bold text-[#93509e] shadow-2xs"
              : "text-zinc-500 hover:text-zinc-900"
          }`}
        >
          Hoje
        </button>
        <button
          type="button"
          onClick={() => applyPreset("7d")}
          class={`h-7 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition-all duration-150 ${
            preset() === "7d"
              ? "bg-white font-bold text-[#93509e] shadow-2xs"
              : "text-zinc-500 hover:text-zinc-900"
          }`}
        >
          7 dias
        </button>
        <button
          type="button"
          onClick={() => applyPreset("30d")}
          class={`h-7 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition-all duration-150 ${
            preset() === "30d"
              ? "bg-white font-bold text-[#93509e] shadow-2xs"
              : "text-zinc-500 hover:text-zinc-900"
          }`}
        >
          30 dias
        </button>
      </div>

      {/* Unified Date Range Selector */}
      <div class="inline-flex h-9 shrink-0 items-center rounded-xl border border-zinc-200/90 bg-white px-3 shadow-2xs transition-all focus-within:border-[#93509e] focus-within:ring-2 focus-within:ring-[#93509e]/15 hover:border-zinc-300">
        <Calendar class="mr-2 h-3.5 w-3.5 shrink-0 text-[#93509e]" aria-hidden="true" />
        <input
          type="date"
          aria-label="Data inicial de vendas"
          value={profitFrom()}
          onInput={(e) => {
            setPreset("custom");
            setProfitFrom(e.currentTarget.value);
          }}
          class="h-full bg-transparent text-xs font-semibold text-zinc-800 focus:outline-none cursor-pointer"
        />
        <span class="px-2 text-xs font-normal text-zinc-400">até</span>
        <input
          type="date"
          aria-label="Data final de vendas"
          value={profitTo()}
          onInput={(e) => {
            setPreset("custom");
            setProfitTo(e.currentTarget.value);
          }}
          class="h-full bg-transparent text-xs font-semibold text-zinc-800 focus:outline-none cursor-pointer"
        />
      </div>
    </div>
  );

  const realPendencies = createMemo(() => {
    const d = summary();
    if (!d) return [];
    const items: Array<{
      id: string;
      label: string;
      detail: string;
      count: number;
      to: "/admin/pedidos" | "/admin/produtos";
      search: Record<string, string>;
      tone: "warning" | "danger" | "brand";
    }> = [];

    if (d.kpis.to_pack_count > 0) {
      items.push({
        id: "pack",
        label: "Pedidos pagos aguardando envio",
        detail: "Ir para expedição",
        count: d.kpis.to_pack_count,
        to: "/admin/pedidos",
        search: { filter: "ship_today" },
        tone: "brand",
      });
    }
    if ((d.low_stock_variants?.length ?? 0) > 0) {
      items.push({
        id: "low_stock",
        label: "SKUs com estoque baixo ou esgotado",
        detail: "Ajustar no catálogo",
        count: d.low_stock_variants.length,
        to: "/admin/produtos",
        search: { availability: "low_stock" },
        tone: "danger",
      });
    }
    if (d.kpis.pending_payment_count > 0) {
      items.push({
        id: "pending_pay",
        label: "Pedidos aguardando pagamento",
        detail: "Acompanhar cobrança",
        count: d.kpis.pending_payment_count,
        to: "/admin/pedidos",
        search: { status: "pending_payment" },
        tone: "warning",
      });
    }
    if (d.kpis.pending_restock_count > 0) {
      items.push({
        id: "restock",
        label: "Avisos de cliente aguardando reposição",
        detail: "Ver solicitações",
        count: d.kpis.pending_restock_count,
        to: "/admin/produtos",
        search: { view: "avisos" },
        tone: "brand",
      });
    }
    if (d.kpis.pending_reviews_count > 0) {
      items.push({
        id: "reviews",
        label: "Avaliações aguardando moderação",
        detail: "Revisar comentários",
        count: d.kpis.pending_reviews_count,
        to: "/admin/produtos",
        search: { view: "avaliacoes" },
        tone: "warning",
      });
    }
    return items;
  });

  return (
    <AdminLayout
      title="Visão Geral da Operação"
      permission="dashboard.view"
      headerActions={periodFilterControls}
    >
      <Show when={summary.loading && !summary()}>
        <div class="space-y-4">
          <div class="grid gap-4 md:grid-cols-3">
            <For each={[1, 2, 3]}>
              {() => <div class="h-28 animate-pulse rounded-[12px] bg-white" />}
            </For>
          </div>
          <div class="h-64 animate-pulse rounded-[12px] bg-white" />
        </div>
      </Show>

      <Show when={summary.error}>
        <AdminCard>
          <div class="flex flex-wrap items-center justify-between gap-3 text-sm text-red-800">
            <span>Não foi possível carregar os indicadores deste período.</span>
            <AdminButton variant="secondary" size="sm" onClick={() => void refetch()}>
              Tentar novamente
            </AdminButton>
          </div>
        </AdminCard>
      </Show>

      <Show when={summary()}>
        {(d) => {
          const chartPoints = () =>
            d().daily_sales_period?.length
              ? d().daily_sales_period!
              : d().daily_sales_30d || [];

          return (
            <div class="space-y-6">
              {/* FIRST FOLD: Financial Performance (3 aligned cards) + Current Inventory Valuation ("Posição atual") */}
              <Show
                when={canViewProfit() && d().financial_summary}
                fallback={
                  <section
                    aria-label="Indicadores operacionais"
                    class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
                  >
                    <AdminMetricCard
                      label="Vendas hoje"
                      value={formatCents(d().kpis.sales_today_cents)}
                      footer={`Últimos 7 dias: ${formatCents(d().kpis.sales_7d_cents)}`}
                    />
                    <AdminMetricCard
                      label="Faturamento 30 dias"
                      value={formatCents(d().kpis.sales_30d_cents)}
                      badge={
                        <Show when={formatDeltaLabel(d().kpis.growth_7d_pct)}>
                          {(lbl) => (
                            <span class="adm-tabular rounded-[6px] bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700">
                              {lbl()} vs 7d ant.
                            </span>
                          )}
                        </Show>
                      }
                      footer={`${d().kpis.paid_orders_30d} pedidos pagos`}
                    />
                    <AdminMetricCard
                      label="Ticket médio"
                      value={
                        d().kpis.paid_orders_30d > 0
                          ? formatCents(d().kpis.avg_ticket_cents)
                          : "Sem dados no período"
                      }
                      footer={`${d().kpis.pending_payment_count} aguardando pagamento`}
                    />
                    <AdminMetricCard
                      label="Para separar e enviar"
                      value={`${d().kpis.to_pack_count} pedido(s)`}
                      highlightTone={d().kpis.to_pack_count > 0 ? "brand" : "default"}
                      footer={`${d().low_stock_variants.length} SKUs em alerta`}
                    />
                  </section>
                }
              >
                {(fs) => {
                  const hasPeriodSales = () =>
                    fs().kpis.total_units_sold > 0 ||
                    fs().kpis.products_revenue_cents !== 0;
                  const cmp = () => fs().comparison;
                  const revDelta = () => formatDeltaLabel(cmp()?.revenue_delta_pct);
                  const cmvDelta = () => formatDeltaLabel(cmp()?.cmv_delta_pct);
                  const profitDelta = () => formatDeltaLabel(cmp()?.profit_delta_pct);

                  return (
                    <section
                      aria-label="Resultado de vendas e custo"
                      class="space-y-4"
                    >
                      {/* Three primary aligned financial cards */}
                      <div class="grid gap-4 md:grid-cols-3">
                        <AdminMetricCard
                          label="Receita de produtos"
                          value={
                            hasPeriodSales()
                              ? formatCents(fs().kpis.products_revenue_cents)
                              : "Sem dados no período"
                          }
                          badge={
                            <Show when={cmp()?.has_prior_data && revDelta()}>
                              {(lbl) => (
                                <span class="adm-tabular rounded-[6px] bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700">
                                  {lbl()} vs ant.
                                </span>
                              )}
                            </Show>
                          }
                          onClick={() => {
                            setDrillFilter("all");
                            setDrillMode("sales");
                          }}
                          actionLabel="Ver itens"
                          footer={
                            hasPeriodSales()
                              ? "Sem frete · após cupons e devoluções"
                              : `${fs().period.from} até ${fs().period.to}`
                          }
                        />

                        <AdminMetricCard
                          label="Custo da mercadoria vendida"
                          value={
                            hasPeriodSales()
                              ? formatCents(fs().kpis.cmv_cents)
                              : "Sem dados no período"
                          }
                          badge={
                            <Show when={cmp()?.has_prior_data && cmvDelta()}>
                              {(lbl) => (
                                <span class="adm-tabular rounded-[6px] bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700">
                                  {lbl()} vs ant.
                                </span>
                              )}
                            </Show>
                          }
                          onClick={() => {
                            setDrillFilter("all");
                            setDrillMode("sales");
                          }}
                          actionLabel="Conferir CMV"
                          footer={
                            hasPeriodSales()
                              ? `${fs().kpis.covered_units_sold} un. com custo histórico`
                              : "Custo reconhecido no pagamento"
                          }
                        />

                        <div class="adm-card-interactive flex flex-col justify-between rounded-[12px] border border-zinc-200/90 bg-white p-4 hover:border-[#e4c6ea] hover:bg-[#fcfafd] sm:p-5">
                          <button
                            type="button"
                            onClick={() => {
                              setDrillFilter("all");
                              setDrillMode("sales");
                            }}
                            class="w-full text-left"
                          >
                            <div class="flex items-start justify-between gap-2">
                              <p class="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                                Lucro bruto
                              </p>
                              <span class="adm-tabular rounded-[6px] bg-[#f5ebf7] px-2 py-0.5 text-[11px] font-semibold text-[#62298d]">
                                Margem: {formatMarginPercentage(fs().kpis.gross_margin_pct)}
                              </span>
                            </div>

                            <div class="mt-2 flex items-baseline justify-between gap-2">
                              <p
                                class={`adm-tabular text-2xl font-bold tracking-tight ${
                                  !hasPeriodSales()
                                    ? "text-zinc-900"
                                    : fs().kpis.gross_profit_cents < 0
                                      ? "text-red-700"
                                      : "text-[#62298d]"
                                }`}
                              >
                                {hasPeriodSales()
                                  ? formatBrlSigned(fs().kpis.gross_profit_cents)
                                  : "Sem dados no período"}
                              </p>
                              <Show when={cmp()?.has_prior_data && profitDelta()}>
                                {(lbl) => (
                                  <span class="adm-tabular text-xs font-semibold text-zinc-600">
                                    {lbl()} vs ant.
                                  </span>
                                )}
                              </Show>
                            </div>
                          </button>

                          <div class="mt-2.5 flex items-center justify-between gap-2 border-t border-zinc-100 pt-2 text-xs">
                            <Show
                              when={fs().coverage.is_partial}
                              fallback={
                                <span class="text-zinc-500">
                                  {fs().coverage.label}
                                </span>
                              }
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setDrillFilter("missing_cost");
                                  setDrillMode("sales");
                                }}
                                class="font-semibold text-amber-800 underline hover:text-amber-950"
                              >
                                {fs().coverage.label}
                              </button>
                            </Show>
                          </div>
                        </div>
                      </div>

                      {/* Separate Temporal Block: Inventory Cost Valuation ("Posição atual") */}
                      <Show when={d().inventory_valuation}>
                        {(inv) => (
                          <div class="flex flex-wrap items-center justify-between gap-4 rounded-[12px] border border-zinc-200/90 bg-white px-4 py-3.5 sm:px-5">
                            <div class="flex min-w-0 flex-wrap items-center gap-3">
                              <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-[#f5ebf7] text-[#62298d]">
                                <Boxes class="h-4 w-4" />
                              </div>
                              <div class="min-w-0">
                                <div class="flex flex-wrap items-center gap-2">
                                  <h2 class="text-xs font-semibold uppercase tracking-wide text-zinc-600">
                                    Valor do estoque a custo
                                  </h2>
                                  <span class="rounded-[6px] border border-[#e4c6ea] bg-[#f5ebf7] px-2 py-0.5 text-[10px] font-semibold text-[#62298d]">
                                    {inv().label}
                                  </span>
                                </div>
                                <p class="mt-0.5 text-xs text-zinc-500">
                                  {inv().is_partial
                                    ? inv().coverage_label
                                    : `${inv().valued_units} un. avaliadas em estoque atual`}
                                </p>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => setDrillMode("inventory")}
                              class="adm-btn flex w-full items-center justify-between gap-3 rounded-[8px] px-0 py-1 text-right hover:bg-zinc-50 sm:w-auto sm:justify-end sm:px-2.5 sm:py-1.5"
                            >
                              <span class="adm-tabular text-xl font-bold text-zinc-900">
                                {formatCents(inv().total_cost_cents)}
                              </span>
                              <span class="inline-flex items-center gap-1 text-xs font-semibold text-[#62298d]">
                                Conferir
                                <ArrowRight class="h-3.5 w-3.5" />
                              </span>
                            </button>
                          </div>
                        )}
                      </Show>
                    </section>
                  );
                }}
              </Show>

              <ProfitBreakdownDrawer
                mode={drillMode()}
                from={profitFrom()}
                to={profitTo()}
                initialFilter={drillFilter()}
                onClose={() => setDrillMode(null)}
              />

              {/* SECOND FOLD: On mobile renders Pendencies FIRST, then Evolution Chart */}
              <div class="grid gap-4 lg:grid-cols-12">
                {/* Operational Pendencies (order-1 on mobile, right column 5 cols on desktop) */}
                <div class="order-1 lg:order-2 lg:col-span-5">
                  <AdminCard class="h-full">
                    <div class="mb-3 flex items-center justify-between gap-2">
                      <h2 class="text-sm font-bold text-zinc-900">
                        Pendências da operação
                      </h2>
                      <span class="adm-tabular text-xs font-medium text-zinc-500">
                        {realPendencies().length} fila(s)
                      </span>
                    </div>

                    <Show
                      when={realPendencies().length > 0}
                      fallback={
                        <div class="rounded-[8px] border border-zinc-100 bg-zinc-50 p-4 text-center text-xs text-zinc-500">
                          Nenhuma pendência operacional aberta no momento.
                        </div>
                      }
                    >
                      <ul class="divide-y divide-zinc-100">
                        <For each={realPendencies()}>
                          {(item) => (
                            <li>
                              <Link
                                to={item.to}
                                search={item.search}
                                class="flex items-center justify-between gap-3 py-2.5 text-xs transition-colors hover:bg-zinc-50"
                              >
                                <span class="flex min-w-0 items-center gap-2.5">
                                  <span
                                    class={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] ${
                                      item.tone === "danger"
                                        ? "bg-red-50 text-red-700"
                                        : item.tone === "warning"
                                          ? "bg-amber-50 text-amber-800"
                                          : "bg-[#f5ebf7] text-[#62298d]"
                                    }`}
                                  >
                                    {item.tone === "danger" ? (
                                      <AlertTriangle class="h-3.5 w-3.5" />
                                    ) : item.tone === "warning" ? (
                                      <Clock class="h-3.5 w-3.5" />
                                    ) : (
                                      <ShoppingBag class="h-3.5 w-3.5" />
                                    )}
                                  </span>
                                  <span class="min-w-0">
                                    <span class="block truncate font-semibold text-zinc-900">
                                      {item.label}
                                    </span>
                                    <span class="block text-[11px] text-[#62298d]">
                                      {item.detail} →
                                    </span>
                                  </span>
                                </span>
                                <span
                                  class={`adm-tabular shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
                                    item.tone === "danger"
                                      ? "bg-red-100 text-red-800"
                                      : item.tone === "warning"
                                        ? "bg-amber-100 text-amber-900"
                                        : "bg-[#f5ebf7] text-[#62298d]"
                                  }`}
                                >
                                  {item.count}
                                </span>
                              </Link>
                            </li>
                          )}
                        </For>
                      </ul>
                    </Show>

                    <Show when={d().low_stock_variants.length > 0}>
                      <div class="mt-3 border-t border-zinc-100 pt-3">
                        <div class="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                          <span>SKUs em atenção</span>
                          <Link
                            to="/admin/produtos"
                            search={{ availability: "low_stock" }}
                            class="text-[#62298d] hover:underline"
                          >
                            Ver todos
                          </Link>
                        </div>
                        <ul class="space-y-1.5 text-xs">
                          <For each={d().low_stock_variants.slice(0, 3)}>
                            {(v) => (
                              <li class="flex items-center justify-between gap-2">
                                <span class="min-w-0 truncate text-zinc-700">
                                  <span class="font-mono text-[11px] text-zinc-500">
                                    {v.sku}
                                  </span>{" "}
                                  · {v.product_name || v.name}
                                </span>
                                <span class="adm-tabular shrink-0 font-semibold text-red-700">
                                  {v.available_stock} un.
                                </span>
                              </li>
                            )}
                          </For>
                        </ul>
                      </div>
                    </Show>
                  </AdminCard>
                </div>

                {/* Evolution Chart (order-2 on mobile, left 7 cols on desktop) */}
                <div class="order-2 lg:order-1 lg:col-span-7">
                  <AdminAreaChart
                    data={chartPoints()}
                    title="Evolução de faturamento no período"
                    subtitle="Pedidos confirmados agrupados por dia"
                  />
                </div>
              </div>

              {/* THIRD FOLD: Tabbed Operational Details (avoids stacked walls of cards) */}
              <div class="space-y-3">
                <div
                  role="tablist"
                  aria-label="Detalhamento operacional"
                  class="flex flex-wrap gap-1 border-b border-zinc-200 pb-2 text-xs"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={opsTab() === "orders"}
                    onClick={() => setOpsTab("orders")}
                    class={`adm-btn rounded-[8px] px-3 py-1.5 font-semibold ${
                      opsTab() === "orders"
                        ? "bg-[#f5ebf7] text-[#62298d]"
                        : "text-zinc-600 hover:bg-white hover:text-zinc-900"
                    }`}
                  >
                    Pedidos recentes & Produtos
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={opsTab() === "today"}
                    onClick={() => setOpsTab("today")}
                    class={`adm-btn rounded-[8px] px-3 py-1.5 font-semibold ${
                      opsTab() === "today"
                        ? "bg-[#f5ebf7] text-[#62298d]"
                        : "text-zinc-600 hover:bg-white hover:text-zinc-900"
                    }`}
                  >
                    Tarefas de Hoje
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={opsTab() === "b2b"}
                    onClick={() => setOpsTab("b2b")}
                    class={`adm-btn rounded-[8px] px-3 py-1.5 font-semibold ${
                      opsTab() === "b2b"
                        ? "bg-[#f5ebf7] text-[#62298d]"
                        : "text-zinc-600 hover:bg-white hover:text-zinc-900"
                    }`}
                  >
                    Atacado & Demanda de Cores
                  </button>
                </div>

                <Show when={opsTab() === "orders"}>
                  <div class="grid gap-4 lg:grid-cols-12">
                    <div class="lg:col-span-5">
                      <AdminBarChart
                        title="Produtos mais vendidos (30d)"
                        subtitle="Soma do valor bruto dos itens pagos"
                        items={d().top_products || []}
                      />
                    </div>
                    <AdminCard class="lg:col-span-7">
                      <div class="mb-3 flex items-center justify-between gap-2">
                        <h3 class="text-sm font-bold text-zinc-900">
                          Últimos pedidos
                        </h3>
                        <Link
                          to="/admin/pedidos"
                          class="text-xs font-semibold text-[#62298d] hover:underline"
                        >
                          Gerenciar pedidos →
                        </Link>
                      </div>
                      <Show
                        when={d().recent_orders.length > 0}
                        fallback={
                          <p class="py-6 text-center text-xs text-zinc-500">
                            Sem pedidos registrados ainda.
                          </p>
                        }
                      >
                        <div class="overflow-x-auto">
                          <table class="w-full text-left text-xs">
                            <thead class="border-b border-zinc-200 text-[11px] font-semibold uppercase text-zinc-500">
                              <tr>
                                <th class="py-2 pr-3">Pedido</th>
                                <th class="py-2 pr-3">Cliente</th>
                                <th class="py-2 pr-3">Situação</th>
                                <th class="py-2 text-right">Valor</th>
                              </tr>
                            </thead>
                            <tbody class="divide-y divide-zinc-100">
                              <For each={d().recent_orders}>
                                {(ord) => (
                                  <tr class="hover:bg-zinc-50">
                                    <td class="py-2.5 pr-3 font-semibold text-zinc-900">
                                      <Link
                                        to="/admin/pedidos"
                                        search={{ order: String(ord.id) }}
                                        class="hover:text-[#93509e] hover:underline"
                                      >
                                        {ord.order_number}
                                      </Link>
                                    </td>
                                    <td class="py-2.5 pr-3 text-zinc-700">
                                      {ord.customer_name}
                                    </td>
                                    <td class="py-2.5 pr-3 text-zinc-600">
                                      {orderStatusLabel(ord.status)}
                                    </td>
                                    <td class="adm-tabular py-2.5 text-right font-semibold text-zinc-900">
                                      {formatCents(ord.total_cents)}
                                    </td>
                                  </tr>
                                )}
                              </For>
                            </tbody>
                          </table>
                        </div>
                      </Show>
                    </AdminCard>
                  </div>
                </Show>

                <Show when={opsTab() === "today"}>
                  <AdminTodayWorkPanel onDataChanged={() => void refetch()} />
                </Show>

                <Show when={opsTab() === "b2b"}>
                  <AdminB2bMetricsSection
                    kpis={d().kpis}
                    topDemandedVariants={d().top_demanded_variants}
                    topReplenishmentVariants={d().top_replenishment_variants}
                  />
                </Show>
              </div>
            </div>
          );
        }}
      </Show>
    </AdminLayout>
  );
}
