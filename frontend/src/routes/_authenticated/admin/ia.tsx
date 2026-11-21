import { Link, createFileRoute } from "@tanstack/solid-router";
import AlertCircle from "lucide-solid/icons/circle-exclamation-point";
import Clock from "lucide-solid/icons/clock";
import FileSpreadsheet from "lucide-solid/icons/file-spreadsheet";
import MessageCircle from "lucide-solid/icons/message-circle";
import PackagePlus from "lucide-solid/icons/package-plus";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import Sparkles from "lucide-solid/icons/sparkles";
import TrendingUp from "lucide-solid/icons/trending-up";
import {
  For,
  Show,
  createEffect,
  createResource,
  createSignal,
} from "solid-js";
import { AdminLayout } from "../../../features/admin/AdminLayout";
import { AdminAiCatalogAgentPanel } from "../../../features/admin/ai/AdminAiCatalogAgentPanel";
import { AdminAiMarketingAgentPanel } from "../../../features/admin/ai/AdminAiMarketingAgentPanel";
import { AdminAiReplenishmentAgentPanel } from "../../../features/admin/ai/AdminAiReplenishmentAgentPanel";
import { AdminAiSettingsAndLogsPanel } from "../../../features/admin/ai/AdminAiSettingsAndLogsPanel";
import {
  type AiAgentSummary,
  type AiExecutionRow,
  type AiProviderStatus,
  aiExecutionStatusLabel,
} from "../../../features/admin/ai/ai-types";
import { api } from "../../../lib/api";
import { seoHead } from "../../../lib/seo";
import { hasPermission } from "../../../security/permissions";
import { session } from "../../../security/session";

export const Route = createFileRoute("/_authenticated/admin/ia")({
  validateSearch: (raw: Record<string, unknown>): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string" && v !== "") out[k] = v;
      else if (typeof v === "number") out[k] = String(v);
    }
    return out;
  },
  head: () =>
    seoHead({
      title: "Central de IA — Admin Mistura Feminina",
      description:
        "Central de Inteligência Artificial: atendimento contextual em pedidos, cadastro inteligente e reposição por tonalidade.",
      path: "/admin/ia",
      noindex: true,
    }),
  component: AdminAiCentralPage,
});

type AiHubTab =
  | "overview"
  | "marketing"
  | "cadastro"
  | "reposicao"
  | "execucoes"
  | "pendencias"
  | "configuracoes"
  | "logs";

interface OverviewPayload {
  provider: AiProviderStatus;
  agents: AiAgentSummary[];
  kpis: {
    catalog_imports_prepared: number;
    catalog_imports_awaiting_review: number;
    support_replies_prepared: number;
    replenishment_recommendations_generated: number;
    failed_executions: number;
    tokens_today: number;
    cost_today_usd: number;
  };
  recent_executions: AiExecutionRow[];
  pending_imports: Array<{
    id: number;
    source_type: string;
    total_records: number;
    grouped_products_count: number;
    duplicate_count: number;
    user_name: string;
    created_at: string | null;
  }>;
}

function AdminAiCentralPage() {
  const routeSearch = Route.useSearch();
  const [tab, setTab] = createSignal<AiHubTab>("overview");
  const [selectedImportId, setSelectedImportId] = createSignal<number | null>(
    null,
  );

  const permissions = () => session.user()?.permissions ?? [];

  createEffect(() => {
    const s = routeSearch();
    if (
      s.tab === "overview" ||
      s.tab === "marketing" ||
      s.tab === "cadastro" ||
      s.tab === "reposicao" ||
      s.tab === "execucoes" ||
      s.tab === "pendencias" ||
      s.tab === "configuracoes" ||
      s.tab === "logs"
    ) {
      setTab(s.tab);
    }
    if (s.import_id && Number.isFinite(Number(s.import_id))) {
      setSelectedImportId(Number(s.import_id));
      setTab("cadastro");
    }
  });

  const [overview, { refetch }] = createResource(async () => {
    const res = await api<{ data: OverviewPayload }>("/admin/ai/overview");
    return res.data;
  });

  const [executionsList] = createResource(
    () => (tab() === "execucoes" ? true : false),
    async (active) => {
      if (!active) return [];
      const res = await api<{ data: AiExecutionRow[] }>("/admin/ai/executions");
      return res.data ?? [];
    },
  );

  const visibleTabs = () => {
    const base: Array<readonly [AiHubTab, string]> = [
      ["overview", "Visão geral"],
      ["marketing", "Marketing & Growth"],
      ["cadastro", "Agente de Cadastro"],
      ["reposicao", "Reposição Inteligente"],
      ["execucoes", "Execuções"],
      ["pendencias", "Pendências"],
    ];
    if (hasPermission(permissions(), "ai.settings")) {
      base.push(["configuracoes", "Configurações"]);
    }
    if (hasPermission(permissions(), "ai.logs")) {
      base.push(["logs", "Logs"]);
    }
    return base;
  };

  return (
    <AdminLayout
      title="Central de Inteligência Artificial"
      subtitle="Automatize tarefas, agilize cadastros e tome decisões com mais informação."
      permission="ai.view"
    >
      {/* Navigation Tabs */}
      <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap gap-1.5 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-2xs">
          <For each={visibleTabs()}>
            {([key, label]) => (
              <button
                type="button"
                onClick={() => setTab(key)}
                class={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-colors ${
                  tab() === key
                    ? "bg-[#93509e] text-white"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                }`}
              >
                {label}
              </button>
            )}
          </For>
        </div>

        <Show when={overview()?.provider}>
          {(p) => (
            <div class="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs">
              <span
                class={`size-2 rounded-full ${
                  p().status === "connected"
                    ? "bg-emerald-500"
                    : p().has_api_key
                      ? "bg-amber-500"
                      : "bg-zinc-400"
                }`}
              />
              <span class="font-semibold text-zinc-700">
                Provedor: {p().label}
              </span>
              <button
                type="button"
                onClick={() => void refetch()}
                class="text-zinc-400 hover:text-[#93509e]"
                title="Atualizar dados da Central de IA"
              >
                <RefreshCw class="size-3.5" />
              </button>
            </div>
          )}
        </Show>
      </div>

      {/* Tab 1: Visao Geral */}
      <Show when={tab() === "overview" && overview()}>
        {(ov) => (
          <div class="space-y-6">
            {/* 4 Cards Principais */}
            <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Card 1: Agente de Atendimento */}
              <div class="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-5 shadow-2xs">
                <div>
                  <div class="flex items-center justify-between">
                    <span class="inline-flex items-center gap-2 text-sm font-extrabold text-zinc-900">
                      <MessageCircle class="size-4 text-[#93509e]" />
                      Agente de Atendimento
                    </span>
                    <span class="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[10px] font-bold text-zinc-700">
                      {ov().agents.find((a) => a.slug === "customer_support")
                        ?.integration_label ?? ov().provider.label}
                    </span>
                  </div>
                  <p class="mt-2 text-xs text-zinc-600">
                    Prepare respostas personalizadas utilizando os dados reais
                    dos pedidos.
                  </p>
                  <div class="mt-3 space-y-1 text-[11px] text-zinc-500">
                    <p>
                      Tarefas processadas:{" "}
                      <strong class="text-zinc-800">
                        {ov().agents.find((a) => a.slug === "customer_support")
                          ?.executions_count ?? 0}
                      </strong>
                    </p>
                    <p>
                      Última execução:{" "}
                      {ov().agents.find((a) => a.slug === "customer_support")
                        ?.last_executed_at
                        ? new Date(
                            ov().agents.find(
                              (a) => a.slug === "customer_support",
                            )!.last_executed_at!,
                          ).toLocaleString("pt-BR")
                        : "Nenhuma execução ainda"}
                    </p>
                  </div>
                </div>
                <Link
                  to="/admin/pedidos"
                  class="mt-4 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#93509e] px-4 text-xs font-bold text-white hover:bg-[#7c3f87]"
                >
                  Abrir agente
                </Link>
              </div>

              {/* Card 2: Agente de Cadastro */}
              <div class="flex flex-col justify-between rounded-xl border border-[#DFC2E3] bg-white p-5 shadow-2xs">
                <div>
                  <div class="flex items-center justify-between">
                    <span class="inline-flex items-center gap-2 text-sm font-extrabold text-zinc-900">
                      <FileSpreadsheet class="size-4 text-[#93509e]" />
                      Agente de Cadastro
                    </span>
                    <span class="rounded-full bg-[#F3E2F6] px-2.5 py-0.5 text-[10px] font-bold text-[#93509e]">
                      {ov().agents.find((a) => a.slug === "product_catalog")
                        ?.integration_label ?? ov().provider.label}
                    </span>
                  </div>
                  <p class="mt-2 text-xs text-zinc-600">
                    Transforme planilhas, fichas e documentos em produtos
                    prontos para revisão.
                  </p>
                  <div class="mt-3 space-y-1 text-[11px] text-zinc-500">
                    <p>
                      Tarefas processadas:{" "}
                      <strong class="text-zinc-800">
                        {ov().agents.find((a) => a.slug === "product_catalog")
                          ?.executions_count ?? 0}
                      </strong>
                    </p>
                    <p>
                      Última execução:{" "}
                      {ov().agents.find((a) => a.slug === "product_catalog")
                        ?.last_executed_at
                        ? new Date(
                            ov().agents.find(
                              (a) => a.slug === "product_catalog",
                            )!.last_executed_at!,
                          ).toLocaleString("pt-BR")
                        : "Nenhuma execução ainda"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTab("cadastro")}
                  class="mt-4 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#93509e] px-4 text-xs font-bold text-white hover:bg-[#7c3f87]"
                >
                  Cadastrar com IA
                </button>
              </div>

              {/* Card 3: Agente de Reposicao */}
              <div class="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-5 shadow-2xs">
                <div>
                  <div class="flex items-center justify-between">
                    <span class="inline-flex items-center gap-2 text-sm font-extrabold text-zinc-900">
                      <PackagePlus class="size-4 text-[#93509e]" />
                      Agente de Reposição
                    </span>
                    <span class="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[10px] font-bold text-zinc-700">
                      {ov().agents.find(
                        (a) => a.slug === "inventory_replenishment",
                      )?.integration_label ?? ov().provider.label}
                    </span>
                  </div>
                  <p class="mt-2 text-xs text-zinc-600">
                    Analise vendas e estoques para descobrir o que precisa ser
                    reposto.
                  </p>
                  <div class="mt-3 space-y-1 text-[11px] text-zinc-500">
                    <p>
                      Tarefas processadas:{" "}
                      <strong class="text-zinc-800">
                        {ov().agents.find(
                          (a) => a.slug === "inventory_replenishment",
                        )?.executions_count ?? 0}
                      </strong>
                    </p>
                    <p>
                      Última execução:{" "}
                      {ov().agents.find(
                        (a) => a.slug === "inventory_replenishment",
                      )?.last_executed_at
                        ? new Date(
                            ov().agents.find(
                              (a) => a.slug === "inventory_replenishment",
                            )!.last_executed_at!,
                          ).toLocaleString("pt-BR")
                        : "Nenhuma execução ainda"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTab("reposicao")}
                  class="mt-4 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#93509e] px-4 text-xs font-bold text-white hover:bg-[#7c3f87]"
                >
                  Analisar estoque
                </button>
              </div>

              {/* Card 4: Marketing & Growth */}
              <div class="flex flex-col justify-between rounded-xl border border-[#DFC2E3] bg-white p-5 shadow-2xs">
                <div>
                  <div class="flex items-center justify-between">
                    <span class="inline-flex items-center gap-2 text-sm font-extrabold text-zinc-900">
                      <TrendingUp class="size-4 text-[#93509e]" />
                      Marketing & Growth
                    </span>
                    <span class="rounded-full bg-[#F3E2F6] px-2.5 py-0.5 text-[10px] font-bold text-[#93509e]">
                      {ov().agents.find((a) => a.slug === "marketing_growth")
                        ?.integration_label ?? ov().provider.label}
                    </span>
                  </div>
                  <p class="mt-2 text-xs text-zinc-600">
                    Analise o desempenho da loja, melhore seu SEO e otimize campanhas do Google e das redes sociais.
                  </p>
                  <div class="mt-3 space-y-1 text-[11px] text-zinc-500">
                    <p>
                      Canais:{" "}
                      <strong class="text-zinc-800">
                        Google Ads, Meta Ads, GA4 & SEO
                      </strong>
                    </p>
                    <p>
                      Status:{" "}
                      <strong class="text-emerald-700">
                        Ativo e integrado
                      </strong>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTab("marketing")}
                  class="mt-4 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#93509e] px-4 text-xs font-bold text-white hover:bg-[#7c3f87]"
                >
                  Abrir agente
                </button>
              </div>
            </section>

            {/* Indicadores Reais */}
            <section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div class="rounded-xl border border-zinc-200 bg-white p-4">
                <p class="text-[11px] font-bold uppercase text-zinc-500">
                  Cadastros preparados
                </p>
                <p class="mt-1 text-2xl font-black text-zinc-900">
                  {ov().kpis.catalog_imports_prepared}
                </p>
              </div>
              <div class="rounded-xl border border-amber-200 bg-white p-4">
                <p class="text-[11px] font-bold uppercase text-zinc-500">
                  Aguardando revisão
                </p>
                <p class="mt-1 text-2xl font-black text-amber-700">
                  {ov().kpis.catalog_imports_awaiting_review}
                </p>
              </div>
              <div class="rounded-xl border border-zinc-200 bg-white p-4">
                <p class="text-[11px] font-bold uppercase text-zinc-500">
                  Respostas preparadas
                </p>
                <p class="mt-1 text-2xl font-black text-[#93509e]">
                  {ov().kpis.support_replies_prepared}
                </p>
              </div>
              <div class="rounded-xl border border-zinc-200 bg-white p-4">
                <p class="text-[11px] font-bold uppercase text-zinc-500">
                  Sugestões de reposição
                </p>
                <p class="mt-1 text-2xl font-black text-zinc-900">
                  {ov().kpis.replenishment_recommendations_generated}
                </p>
              </div>
              <div class="rounded-xl border border-zinc-200 bg-white p-4">
                <p class="text-[11px] font-bold uppercase text-zinc-500">
                  Execuções com falha
                </p>
                <p class="mt-1 text-2xl font-black text-red-700">
                  {ov().kpis.failed_executions}
                </p>
              </div>
            </section>
          </div>
        )}
      </Show>

      <Show when={tab() === "marketing"}>
        <AdminAiMarketingAgentPanel />
      </Show>

      <Show when={tab() === "cadastro"}>
        <AdminAiCatalogAgentPanel
          initialImportId={selectedImportId()}
          onCommitted={() => void refetch()}
        />
      </Show>

      <Show when={tab() === "reposicao"}>
        <AdminAiReplenishmentAgentPanel onPlanSaved={() => void refetch()} />
      </Show>

      <Show when={tab() === "execucoes"}>
        <section class="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 class="mb-3 flex items-center gap-2 text-base font-bold text-zinc-900">
            <Clock class="size-4 text-[#93509e]" />
            Histórico de Execuções dos Agentes
          </h2>
          <Show
            when={(executionsList()?.length ?? 0) > 0}
            fallback={
              <p class="text-xs text-zinc-500">
                Nenhuma execução registrada até o momento.
              </p>
            }
          >
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="border-b border-zinc-200 bg-zinc-50 uppercase text-zinc-500">
                  <tr>
                    <th class="p-2.5">#</th>
                    <th class="p-2.5">Agente</th>
                    <th class="p-2.5">Referência</th>
                    <th class="p-2.5">Modo</th>
                    <th class="p-2.5">Status</th>
                    <th class="p-2.5 text-right">Tokens</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-zinc-100">
                  <For each={executionsList() ?? []}>
                    {(ex) => (
                      <tr>
                        <td class="p-2.5 font-mono">#{ex.id}</td>
                        <td class="p-2.5 font-bold">{ex.agent_name}</td>
                        <td class="p-2.5">
                          {ex.input_reference || "—"} →{" "}
                          {ex.result_reference || "—"}
                        </td>
                        <td class="p-2.5 font-mono text-[11px]">
                          {ex.execution_mode}
                        </td>
                        <td class="p-2.5">
                          <span class="rounded bg-zinc-100 px-2 py-0.5 text-[10px] font-bold">
                            {aiExecutionStatusLabel(ex.status)}
                          </span>
                        </td>
                        <td class="p-2.5 text-right font-mono">
                          {ex.total_tokens}
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </section>
      </Show>

      <Show when={tab() === "pendencias" && overview()}>
        {(ov) => (
          <section class="rounded-xl border border-zinc-200 bg-white p-5">
            <h2 class="mb-3 flex items-center gap-2 text-base font-bold text-zinc-900">
              <AlertCircle class="size-4 text-amber-600" />
              Pendências Aguardando Revisão e Aprovação
            </h2>
            <Show
              when={ov().pending_imports.length > 0}
              fallback={
                <div class="rounded-lg border border-dashed border-zinc-200 p-6 text-center text-xs text-zinc-500">
                  <Sparkles class="mx-auto mb-1.5 size-6 text-zinc-400" />
                  Nenhum lote pendente de aprovação comercial no momento.
                </div>
              }
            >
              <ul class="divide-y divide-zinc-100 text-xs">
                <For each={ov().pending_imports}>
                  {(imp) => (
                    <li class="flex flex-wrap items-center justify-between gap-2 py-3">
                      <div>
                        <p class="font-bold text-zinc-900">
                          Lote #{imp.id} ({imp.source_type.toUpperCase()})
                        </p>
                        <p class="text-zinc-500">
                          {imp.grouped_products_count} produto(s) ·{" "}
                          {imp.duplicate_count} duplicidade(s) · Enviado por{" "}
                          {imp.user_name}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedImportId(imp.id);
                          setTab("cadastro");
                        }}
                        class="rounded-lg bg-[#93509e] px-3 py-1.5 font-bold text-white hover:bg-[#7c3f87]"
                      >
                        Revisar e aprovar
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </section>
        )}
      </Show>

      <Show when={tab() === "configuracoes"}>
        <AdminAiSettingsAndLogsPanel mode="settings" />
      </Show>

      <Show when={tab() === "logs"}>
        <AdminAiSettingsAndLogsPanel mode="logs" />
      </Show>
    </AdminLayout>
  );
}
