import AlertCircle from "lucide-solid/icons/circle-exclamation-point";
import ArrowDownRight from "lucide-solid/icons/arrow-down-right";
import ArrowUpRight from "lucide-solid/icons/arrow-up-right";
import Bot from "lucide-solid/icons/bot";
import Check from "lucide-solid/icons/check";
import CheckCircle2 from "lucide-solid/icons/circle-check";
import ChevronRight from "lucide-solid/icons/chevron-right";
import Download from "lucide-solid/icons/download";
import ExternalLink from "lucide-solid/icons/external-link";
import Eye from "lucide-solid/icons/eye";
import Globe from "lucide-solid/icons/globe";
import Layers from "lucide-solid/icons/layers";
import LineChart from "lucide-solid/icons/chart-line";
import Megaphone from "lucide-solid/icons/megaphone";
import MessageSquare from "lucide-solid/icons/message-square";
import Play from "lucide-solid/icons/play";
import Plus from "lucide-solid/icons/plus";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import Search from "lucide-solid/icons/search";
import Send from "lucide-solid/icons/send";
import Settings from "lucide-solid/icons/settings";
import ShieldCheck from "lucide-solid/icons/shield-check";
import Sparkles from "lucide-solid/icons/sparkles";
import Trash2 from "lucide-solid/icons/trash";
import TrendingUp from "lucide-solid/icons/trending-up";
import X from "lucide-solid/icons/x";
import Zap from "lucide-solid/icons/zap";
import { For, Show, createResource, createSignal } from "solid-js";
import { api } from "../../../lib/api";
import { formatCents } from "../../../lib/format";

type MarketingTab =
  | "visao_geral"
  | "seo"
  | "google_ads"
  | "ga4"
  | "meta_ads"
  | "oportunidades"
  | "recomendacoes"
  | "automacoes"
  | "relatorios"
  | "integracoes";

export function AdminAiMarketingAgentPanel() {
  const [subTab, setSubTab] = createSignal<MarketingTab>("visao_geral");
  const [periodRange, setPeriodRange] = createSignal<string>("last_30_days");
  const [feedback, setFeedback] = createSignal<string | null>(null);

  // Modal states
  const [showCampaignModal, setShowCampaignModal] = createSignal(false);
  const [campaignTopic, setCampaignTopic] = createSignal("Esmaltes em Gel Top Lirio");
  const [campaignBudget, setCampaignBudget] = createSignal(40);
  const [isDrafting, setIsDrafting] = createSignal(false);

  const [showIntegrationModal, setShowIntegrationModal] = createSignal<any | null>(null);
  const [accountIdInput, setAccountIdInput] = createSignal("");
  const [accountNameInput, setAccountNameInput] = createSignal("");

  // Chat Copilot state
  const [chatOpen, setChatOpen] = createSignal(false);
  const [chatInput, setChatInput] = createSignal("");
  const [isSendingChat, setIsSendingChat] = createSignal(false);

  // 1. Overview Resource
  const [overview, { refetch: refetchOverview }] = createResource(
    () => periodRange(),
    async (range) => {
      const res = await api<{ data: any }>(`/admin/ai/marketing/overview?range=${range}`);
      return res.data;
    }
  );

  // 2. SEO Resource
  const [seoData, { refetch: refetchSeo }] = createResource(
    () => subTab() === "seo",
    async (active) => {
      if (!active) return null;
      const res = await api<{ data: any }>("/admin/ai/marketing/seo/audit");
      return res.data;
    }
  );

  // 3. Google Ads Resource
  const [googleAdsData, { refetch: refetchGoogleAds }] = createResource(
    () => subTab() === "google_ads",
    async (active) => {
      if (!active) return null;
      const res = await api<{ data: any }>("/admin/ai/marketing/google-ads/campaigns");
      return res.data;
    }
  );

  // 4. GA4 Resource
  const [ga4Data, { refetch: refetchGa4 }] = createResource(
    () => subTab() === "ga4",
    async (active) => {
      if (!active) return null;
      const res = await api<{ data: any }>("/admin/ai/marketing/ga4/insights");
      return res.data;
    }
  );

  // 5. Meta Ads Resource
  const [metaAdsData, { refetch: refetchMetaAds }] = createResource(
    () => subTab() === "meta_ads",
    async (active) => {
      if (!active) return null;
      const res = await api<{ data: any }>("/admin/ai/marketing/meta-ads/campaigns");
      return res.data;
    }
  );

  // 6. Opportunities Resource
  const [opportunities, { refetch: refetchOpportunities }] = createResource(
    () => subTab() === "oportunidades",
    async (active) => {
      if (!active) return null;
      const res = await api<{ data: any }>("/admin/ai/marketing/opportunities");
      return res.data;
    }
  );

  // 7. Recommendations Resource
  const [recommendations, { refetch: refetchRecommendations }] = createResource(
    () => subTab() === "recomendacoes",
    async (active) => {
      if (!active) return null;
      const res = await api<{ data: any }>("/admin/ai/marketing/recommendations");
      return res.data;
    }
  );

  // 8. Automations Resource
  const [automations, { refetch: refetchAutomations }] = createResource(
    () => subTab() === "automacoes",
    async (active) => {
      if (!active) return null;
      const res = await api<{ data: any }>("/admin/ai/marketing/automations");
      return res.data;
    }
  );

  // 9. Reports Resource
  const [reports, { refetch: refetchReports }] = createResource(
    () => subTab() === "relatorios",
    async (active) => {
      if (!active) return null;
      const res = await api<{ data: any }>("/admin/ai/marketing/reports");
      return res.data;
    }
  );

  // 10. Integrations Resource
  const [integrations, { refetch: refetchIntegrations }] = createResource(
    () => subTab() === "integracoes",
    async (active) => {
      if (!active) return null;
      const res = await api<{ data: any }>("/admin/ai/marketing/integrations");
      return res.data;
    }
  );

  // Chat History Resource
  const [chatHistory, { refetch: refetchChat }] = createResource(
    () => chatOpen(),
    async (open) => {
      if (!open) return [];
      const res = await api<{ data: any[] }>("/admin/ai/marketing/chat");
      return res.data ?? [];
    }
  );

  // Actions
  const handleOptimizeMetadata = async (id: number) => {
    try {
      await api("/admin/ai/marketing/seo/optimize-metadata", {
        method: "POST",
        body: JSON.stringify({ inspection_id: id }),
      });
      setFeedback("Metadados otimizados com sucesso pela IA!");
      void refetchSeo();
    } catch {
      setFeedback("Erro ao otimizar metadados.");
    }
  };

  const handleApplyMetadata = async (id: number) => {
    try {
      await api("/admin/ai/marketing/seo/apply-metadata", {
        method: "POST",
        body: JSON.stringify({ inspection_id: id }),
      });
      setFeedback("Metadados aplicados diretamente à loja virtual!");
      void refetchSeo();
    } catch {
      setFeedback("Erro ao aplicar metadados.");
    }
  };

  const handleAddNegativeKeyword = async (keyword: string) => {
    try {
      await api("/admin/ai/marketing/google-ads/negative-keyword", {
        method: "POST",
        body: JSON.stringify({ keyword }),
      });
      setFeedback(`Palavra-chave "${keyword}" adicionada à lista de negativas!`);
      void refetchGoogleAds();
    } catch {
      setFeedback("Erro ao adicionar palavra negativa.");
    }
  };

  const handleCreateCampaignDraft = async () => {
    setIsDrafting(true);
    try {
      await api("/admin/ai/marketing/google-ads/draft-campaign", {
        method: "POST",
        body: JSON.stringify({
          topic: campaignTopic(),
          daily_budget_brl: campaignBudget(),
        }),
      });
      setFeedback("Rascunho de campanha Google Ads criado pela IA com sucesso!");
      setShowCampaignModal(false);
      void refetchGoogleAds();
    } catch {
      setFeedback("Erro ao gerar rascunho de campanha.");
    } finally {
      setIsDrafting(false);
    }
  };

  const handleUpdateOpportunityStatus = async (id: number, status: string) => {
    try {
      await api(`/admin/ai/marketing/opportunities/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setFeedback("Status da oportunidade atualizado!");
      void refetchOpportunities();
    } catch {
      setFeedback("Erro ao atualizar oportunidade.");
    }
  };

  const handleApplyRecommendation = async (id: number) => {
    try {
      await api(`/admin/ai/marketing/recommendations/${id}/apply`, {
        method: "POST",
      });
      setFeedback("Recomendação aprovada e executada!");
      void refetchRecommendations();
    } catch {
      setFeedback("Erro ao aprovar recomendação.");
    }
  };

  const handleToggleAutomation = async (id: number) => {
    try {
      await api(`/admin/ai/marketing/automations/${id}/toggle`, {
        method: "PATCH",
      });
      void refetchAutomations();
    } catch {
      setFeedback("Erro ao alterar automação.");
    }
  };

  const handleRunAutomation = async (id: number) => {
    try {
      setFeedback("Executando rotina...");
      const res = await api<{ message: string }>(`/admin/ai/marketing/automations/${id}/run`, {
        method: "POST",
      });
      setFeedback(res.message || "Automação executada com sucesso!");
      void refetchAutomations();
    } catch {
      setFeedback("Erro ao executar rotina.");
    }
  };

  const handleTestIntegration = async (platform: string) => {
    try {
      setFeedback("Testando conexão...");
      const res = await api<{ message: string }>(`/admin/ai/marketing/integrations/test`, {
        method: "POST",
        body: JSON.stringify({ platform }),
      });
      setFeedback(res.message);
      void refetchIntegrations();
    } catch {
      setFeedback("Erro ao testar conexão externa.");
    }
  };

  const handleSendChat = async (prompt?: string) => {
    const text = prompt || chatInput();
    if (!text.trim() || isSendingChat()) return;
    setIsSendingChat(true);
    setChatInput("");
    try {
      await api("/admin/ai/marketing/chat", {
        method: "POST",
        body: JSON.stringify({ message: text }),
      });
      void refetchChat();
    } catch {
      setFeedback("Erro ao enviar mensagem ao Copilot.");
    } finally {
      setIsSendingChat(false);
    }
  };

  const tabsList: Array<[MarketingTab, string]> = [
    ["visao_geral", "1. Visão Geral"],
    ["seo", "2. SEO & Orgânico"],
    ["google_ads", "3. Google Ads"],
    ["ga4", "4. Google Analytics 4"],
    ["meta_ads", "5. Meta Ads & CAPI"],
    ["oportunidades", "6. Oportunidades"],
    ["recomendacoes", "7. Recomendações IA"],
    ["automacoes", "8. Automações"],
    ["relatorios", "9. Relatórios"],
    ["integracoes", "10. Conexões & APIs"],
  ];

  return (
    <div class="space-y-6">
      {/* Header with Sub-tabs and Period Selector */}
      <div class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xs">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div class="flex items-center gap-3">
            <div class="flex size-10 items-center justify-center rounded-xl bg-[#F3E2F6] text-[#93509e]">
              <TrendingUp class="size-5" />
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h2 class="text-base font-extrabold text-zinc-900">
                  Agente de Marketing & Growth
                </h2>
                <span class="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  IA Ativa
                </span>
              </div>
              <p class="text-xs text-zinc-500">
                SEO técnico, Google Ads, GA4, Meta Ads e inteligência de vendas com dados reais.
              </p>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            {/* Period Selector */}
            <select
              value={periodRange()}
              onChange={(e) => setPeriodRange(e.currentTarget.value)}
              class="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 focus:border-[#93509e] focus:outline-hidden"
            >
              <option value="today">Hoje</option>
              <option value="yesterday">Ontem</option>
              <option value="last_7_days">Últimos 7 dias</option>
              <option value="last_30_days">Últimos 30 dias</option>
              <option value="last_90_days">Últimos 90 dias</option>
            </select>

            {/* Chat with Agent CTA */}
            <button
              type="button"
              onClick={() => setChatOpen(!chatOpen())}
              class="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-zinc-800 transition-colors"
            >
              <Sparkles class="size-3.5 text-purple-300" />
              Copilot Marketing
            </button>
          </div>
        </div>

        {/* Feedback alert */}
        <Show when={feedback()}>
          <div class="mt-3 flex items-center justify-between rounded-xl bg-purple-50 px-3.5 py-2 text-xs font-semibold text-[#93509e] border border-purple-100">
            <span>{feedback()}</span>
            <button type="button" onClick={() => setFeedback(null)} class="text-zinc-400 hover:text-zinc-600">
              <X class="size-3.5" />
            </button>
          </div>
        </Show>

        {/* Horizontal Navigation Sub-tabs */}
        <div class="mt-4 flex flex-wrap gap-1 border-t border-zinc-100 pt-3">
          <For each={tabsList}>
            {([key, label]) => (
              <button
                type="button"
                onClick={() => setSubTab(key)}
                class={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  subTab() === key
                    ? "bg-[#93509e] text-white shadow-2xs"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                }`}
              >
                {label}
              </button>
            )}
          </For>
        </div>
      </div>

      {/* TAB 1: VISÃO GERAL */}
      <Show when={subTab() === "visao_geral" && overview()}>
        {(ov) => (
          <div class="space-y-6">
            {/* KPI Cards Grid */}
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* Card 1: Investimento Total */}
              <div class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xs">
                <span class="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                  Investimento em Anúncios
                </span>
                <p class="mt-1 text-xl font-extrabold text-zinc-900">
                  {formatCents(ov().kpis.total_spend_cents)}
                </p>
                <div class="mt-2 flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <span>Google Ads + Meta Ads</span>
                </div>
              </div>

              {/* Card 2: Faturamento Real da Loja */}
              <div class="rounded-2xl border border-[#DFC2E3] bg-[#FDF9FE] p-4 shadow-2xs">
                <span class="text-[11px] font-bold uppercase tracking-wider text-[#93509e]">
                  Faturamento Real da Loja
                </span>
                <p class="mt-1 text-xl font-extrabold text-zinc-900">
                  {formatCents(ov().kpis.store_revenue_cents)}
                </p>
                <div class="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
                  <CheckCircle2 class="size-3.5" />
                  <span>{ov().kpis.store_orders_count} pedidos faturados</span>
                </div>
              </div>

              {/* Card 3: ROAS Consolidado Real */}
              <div class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xs">
                <span class="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                  ROAS Real da Loja
                </span>
                <p class="mt-1 text-xl font-extrabold text-emerald-600">
                  {ov().kpis.blended_roas}x
                </p>
                <div class="mt-2 flex items-center gap-2 text-[11px] text-zinc-500">
                  <span>Google: {ov().kpis.google_ads_roas}x</span>
                  <span>•</span>
                  <span>Meta: {ov().kpis.meta_ads_roas}x</span>
                </div>
              </div>

              {/* Card 4: Taxa de Conversao & Ticket */}
              <div class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xs">
                <span class="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                  Taxa de Conversão & AOV
                </span>
                <p class="mt-1 text-xl font-extrabold text-zinc-900">
                  {ov().kpis.conversion_rate_pct}%
                </p>
                <div class="mt-2 flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <span>Ticket Médio: {formatCents(ov().kpis.ticket_medio_cents)}</span>
                </div>
              </div>
            </div>

            {/* AI Executive Period Analysis */}
            <div class="rounded-2xl border border-[#DFC2E3] bg-gradient-to-r from-purple-50/70 to-pink-50/50 p-5 shadow-2xs">
              <div class="flex items-center gap-2 text-xs font-bold text-[#93509e]">
                <Sparkles class="size-4" />
                <span>Análise Executiva da IA ({ov().period.label})</span>
              </div>
              <p class="mt-2 text-xs leading-relaxed text-zinc-700">
                {ov().ai_period_summary}
              </p>
            </div>

            {/* Attribution Transparency Notice */}
            <div class="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-xs text-amber-900">
              <div class="flex items-center gap-2 font-bold">
                <AlertCircle class="size-4 text-amber-600" />
                <span>Atenção à Atribuição de Receita Multi-Canal</span>
              </div>
              <p class="mt-1 text-[11px] leading-relaxed text-amber-800">
                {ov().attribution_transparency.note}
              </p>
            </div>

            {/* Daily Charts and Channel Performance */}
            <div class="grid gap-6 lg:grid-cols-3">
              {/* Daily Chart (2 cols) */}
              <div class="rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xs lg:col-span-2">
                <div class="flex items-center justify-between">
                  <h3 class="text-sm font-bold text-zinc-900">
                    Evolução Diária de Investimento vs Receita
                  </h3>
                  <div class="flex items-center gap-3 text-[11px]">
                    <span class="flex items-center gap-1 text-purple-700 font-bold">
                      <span class="size-2 rounded-full bg-[#93509e]" /> Faturamento Real
                    </span>
                    <span class="flex items-center gap-1 text-zinc-600 font-bold">
                      <span class="size-2 rounded-full bg-zinc-400" /> Investimento
                    </span>
                  </div>
                </div>

                <div class="mt-6 flex h-48 items-end gap-1 border-b border-zinc-100 pb-2">
                  <For each={ov().daily_chart.slice(-14)}>
                    {(day: any) => {
                      const maxVal = 200000;
                      const revHeight = Math.min(100, Math.max(15, (day.store_revenue_cents / maxVal) * 100));
                      const spendHeight = Math.min(100, Math.max(8, (day.total_spend_cents / maxVal) * 100));

                      return (
                        <div class="group relative flex flex-1 flex-col items-center justify-end h-full">
                          {/* Tooltip */}
                          <div class="absolute bottom-full mb-2 hidden -translate-x-1/2 left-1/2 flex-col rounded-lg bg-zinc-900 p-2 text-[10px] text-white shadow-xl z-20 group-hover:flex whitespace-nowrap">
                            <span class="font-bold text-zinc-200">{day.date}</span>
                            <span>Receita: {formatCents(day.store_revenue_cents)}</span>
                            <span>Gasto: {formatCents(day.total_spend_cents)}</span>
                            <span class="text-emerald-400">ROAS: {day.roas}x</span>
                          </div>

                          <div class="flex w-full items-end justify-center gap-0.5">
                            <div
                              style={{ height: `${revHeight}%` }}
                              class="w-full max-w-[12px] rounded-t-sm bg-[#93509e] transition-all group-hover:bg-[#7c3f87]"
                            />
                            <div
                              style={{ height: `${spendHeight}%` }}
                              class="w-full max-w-[12px] rounded-t-sm bg-zinc-300 transition-all group-hover:bg-zinc-400"
                            />
                          </div>
                          <span class="mt-2 text-[9px] text-zinc-400">{day.label}</span>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </div>

              {/* Traffic Sources (1 col) */}
              <div class="rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xs">
                <h3 class="text-sm font-bold text-zinc-900">
                  Tráfego por Origem
                </h3>
                <div class="mt-4 space-y-3">
                  <For each={ov().traffic_sources}>
                    {(src: any) => (
                      <div>
                        <div class="flex items-center justify-between text-xs">
                          <span class="font-medium text-zinc-700">{src.source}</span>
                          <span class="font-bold text-zinc-900">{src.percentage}%</span>
                        </div>
                        <div class="mt-1 h-2 w-full rounded-full bg-zinc-100">
                          <div
                            class="h-2 rounded-full"
                            style={{
                              width: `${src.percentage}%`,
                              "background-color": src.color,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </For>
                </div>

                <div class="mt-6 rounded-xl bg-zinc-50 p-3 text-[11px] text-zinc-600">
                  <p class="font-bold text-zinc-800">Sessões Totais:</p>
                  <p class="text-xs font-extrabold text-zinc-900">
                    {ov().kpis.total_sessions.toLocaleString("pt-BR")} visitas
                  </p>
                </div>
              </div>
            </div>

            {/* Sales by Channel Table */}
            <div class="rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xs">
              <h3 class="text-sm font-bold text-zinc-900">
                Desempenho Comercial por Canal
              </h3>
              <div class="mt-4 overflow-x-auto">
                <table class="w-full text-left text-xs">
                  <thead class="border-b border-zinc-100 text-[10px] font-bold uppercase text-zinc-400">
                    <tr>
                      <th class="py-2">Canal</th>
                      <th class="py-2">Pedidos</th>
                      <th class="py-2">Receita Gerada</th>
                      <th class="py-2">ROAS Reportado</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-zinc-100">
                    <For each={ov().sales_by_channel}>
                      {(row: any) => (
                        <tr class="hover:bg-zinc-50">
                          <td class="py-2.5 font-bold text-zinc-800">{row.channel}</td>
                          <td class="py-2.5 text-zinc-600">{row.orders} pedidos</td>
                          <td class="py-2.5 font-bold text-zinc-900">{formatCents(row.revenue_cents)}</td>
                          <td class="py-2.5">
                            <span class="rounded-full bg-purple-50 px-2 py-0.5 font-bold text-[#93509e]">
                              {row.roas !== null ? `${row.roas}x` : "Orgânico"}
                            </span>
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Show>

      {/* TAB 2: SEO & GOOGLE SEARCH CONSOLE */}
      <Show when={subTab() === "seo" && seoData()}>
        {(seo) => (
          <div class="space-y-6">
            {/* SEO Overview Cards */}
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xs">
                <span class="text-[11px] font-bold uppercase text-zinc-500">Nota SEO da Loja</span>
                <p class="mt-1 text-2xl font-black text-emerald-600">{seo().audit.overall_score}/100</p>
                <span class="text-[11px] text-zinc-500">Saúde técnica excelente</span>
              </div>

              <div class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xs">
                <span class="text-[11px] font-bold uppercase text-zinc-500">Cliques Orgânicos (GSC)</span>
                <p class="mt-1 text-2xl font-black text-zinc-900">{seo().gsc_performance.total_clicks}</p>
                <span class="text-[11px] text-zinc-500">{seo().gsc_performance.total_impressions} impressões</span>
              </div>

              <div class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xs">
                <span class="text-[11px] font-bold uppercase text-zinc-500">CTR Médio no Google</span>
                <p class="mt-1 text-2xl font-black text-[#93509e]">{seo().gsc_performance.avg_ctr}%</p>
                <span class="text-[11px] text-zinc-500">Posição média {seo().gsc_performance.avg_position}</span>
              </div>

              <div class="rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xs">
                <span class="text-[11px] font-bold uppercase text-zinc-500">Itens para Otimizar</span>
                <p class="mt-1 text-2xl font-black text-amber-600">{seo().stats.needs_review_count}</p>
                <button
                  type="button"
                  onClick={() => void refetchSeo()}
                  class="mt-1 text-[11px] font-bold text-[#93509e] hover:underline"
                >
                  Recalcular Auditoria
                </button>
              </div>
            </div>

            {/* Top Google Search Queries Table */}
            <div class="rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xs">
              <h3 class="text-sm font-bold text-zinc-900">
                Termos Reais com Maior Tráfego no Google Search Console
              </h3>
              <div class="mt-3 overflow-x-auto">
                <table class="w-full text-left text-xs">
                  <thead class="border-b border-zinc-100 text-[10px] font-bold uppercase text-zinc-400">
                    <tr>
                      <th class="py-2">Palavra-chave</th>
                      <th class="py-2">Cliques</th>
                      <th class="py-2">Impressões</th>
                      <th class="py-2">CTR</th>
                      <th class="py-2">Posição Média</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-zinc-100">
                    <For each={seo().gsc_performance.top_queries}>
                      {(q: any) => (
                        <tr class="hover:bg-zinc-50">
                          <td class="py-2.5 font-bold text-zinc-800">{q.query}</td>
                          <td class="py-2.5 text-zinc-600">{q.clicks}</td>
                          <td class="py-2.5 text-zinc-600">{q.impressions}</td>
                          <td class="py-2.5 font-bold text-emerald-600">{q.ctr}%</td>
                          <td class="py-2.5 text-zinc-700">#{q.position}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Metadata Inspection & Optimizer Table */}
            <div class="rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xs">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="text-sm font-bold text-zinc-900">
                    Otimizador de Metadados e SEO com IA
                  </h3>
                  <p class="text-xs text-zinc-500">
                    Revise títulos e descrições preparadas pela IA e aplique direto no banco de dados da loja.
                  </p>
                </div>
              </div>

              <div class="mt-4 space-y-4">
                <For each={seo().inspections}>
                  {(it: any) => (
                    <div class="rounded-xl border border-zinc-200 p-4 transition-all hover:border-[#93509e]">
                      <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <div class="flex items-center gap-2">
                            <span class="rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600 uppercase">
                              {it.entity_type}
                            </span>
                            <span class="text-xs font-bold text-zinc-900">{it.url}</span>
                            <span class={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              it.status === 'applied' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                            }`}>
                              {it.status === 'applied' ? 'Aplicado na Loja' : 'Pendente de Revisão'}
                            </span>
                          </div>

                          {/* Current vs Suggested */}
                          <div class="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                            <div class="rounded-lg bg-zinc-50 p-2.5">
                              <span class="text-[10px] font-bold text-zinc-400 uppercase">Título Atual:</span>
                              <p class="mt-0.5 font-semibold text-zinc-700">{it.title}</p>
                              <span class="mt-2 block text-[10px] font-bold text-zinc-400 uppercase">Meta Description Atual:</span>
                              <p class="mt-0.5 text-[11px] text-zinc-600">{it.meta_description}</p>
                            </div>

                            <div class="rounded-lg bg-purple-50/70 p-2.5 border border-purple-100">
                              <span class="text-[10px] font-bold text-[#93509e] uppercase flex items-center gap-1">
                                <Sparkles class="size-3" /> Título Sugerido pela IA:
                              </span>
                              <p class="mt-0.5 font-bold text-purple-950">{it.suggested_title || it.title}</p>
                              <span class="mt-2 block text-[10px] font-bold text-[#93509e] uppercase">Meta Description Otimizada:</span>
                              <p class="mt-0.5 text-[11px] text-purple-900">{it.suggested_description || it.meta_description}</p>
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div class="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOptimizeMetadata(it.id)}
                            class="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
                          >
                            Otimizar com IA
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApplyMetadata(it.id)}
                            class="rounded-lg bg-[#93509e] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#7c3f87]"
                          >
                            Aplicar Alteração
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </div>
        )}
      </Show>

      {/* TAB 3: GOOGLE ADS */}
      <Show when={subTab() === "google_ads" && googleAdsData()}>
        {(gAds) => (
          <div class="space-y-6">
            {/* Account Bar */}
            <div class="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xs">
              <div class="flex items-center gap-3">
                <div class="size-3 rounded-full bg-emerald-500" />
                <div>
                  <h3 class="text-xs font-bold text-zinc-900">
                    Conta Google Ads: {gAds().integration?.account_name || "Mistura Feminina Ads"}
                  </h3>
                  <p class="text-[11px] text-zinc-500">ID: {gAds().integration?.account_id || "482-910-3841"}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowCampaignModal(true)}
                class="inline-flex items-center gap-1.5 rounded-xl bg-[#93509e] px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-[#7c3f87]"
              >
                <Plus class="size-4" />
                Criar Campanha com IA
              </button>
            </div>

            {/* Campaigns Table */}
            <div class="rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xs">
              <h3 class="text-sm font-bold text-zinc-900">Campanhas no Google Ads</h3>
              <div class="mt-3 overflow-x-auto">
                <table class="w-full text-left text-xs">
                  <thead class="border-b border-zinc-100 text-[10px] font-bold uppercase text-zinc-400">
                    <tr>
                      <th class="py-2">Campanha</th>
                      <th class="py-2">Tipo</th>
                      <th class="py-2">Gasto</th>
                      <th class="py-2">Cliques</th>
                      <th class="py-2">CPC</th>
                      <th class="py-2">Conversões</th>
                      <th class="py-2">Receita</th>
                      <th class="py-2">ROAS</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-zinc-100">
                    <For each={gAds().campaigns}>
                      {(cmp: any) => (
                        <tr class="hover:bg-zinc-50">
                          <td class="py-3 font-bold text-zinc-800">{cmp.name}</td>
                          <td class="py-3">
                            <span class="rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600">
                              {cmp.type}
                            </span>
                          </td>
                          <td class="py-3 text-zinc-700">{formatCents(cmp.spend_cents)}</td>
                          <td class="py-3 text-zinc-600">{cmp.clicks}</td>
                          <td class="py-3 text-zinc-600">R$ {cmp.cpc}</td>
                          <td class="py-3 font-semibold text-zinc-800">{cmp.conversions}</td>
                          <td class="py-3 font-bold text-zinc-900">{formatCents(cmp.attributed_revenue_cents)}</td>
                          <td class="py-3 font-extrabold text-emerald-600">{cmp.roas}x</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Search Terms & Negative Keywords */}
            <div class="rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xs">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="text-sm font-bold text-zinc-900">
                    Relatório de Termos de Pesquisa & Exclusão de Negativas
                  </h3>
                  <p class="text-xs text-zinc-500">
                    Identifique pesquisas com gastos sem conversão e negative com 1 clique.
                  </p>
                </div>
              </div>

              <div class="mt-4 overflow-x-auto">
                <table class="w-full text-left text-xs">
                  <thead class="border-b border-zinc-100 text-[10px] font-bold uppercase text-zinc-400">
                    <tr>
                      <th class="py-2">Termo Pesquisado</th>
                      <th class="py-2">Cliques</th>
                      <th class="py-2">Gasto</th>
                      <th class="py-2">Conversões</th>
                      <th class="py-2">Status</th>
                      <th class="py-2 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-zinc-100">
                    <For each={gAds().search_terms}>
                      {(st: any) => (
                        <tr class="hover:bg-zinc-50">
                          <td class="py-2.5 font-bold text-zinc-800">{st.term}</td>
                          <td class="py-2.5 text-zinc-600">{st.clicks}</td>
                          <td class="py-2.5 text-zinc-700">{formatCents(st.spend_cents)}</td>
                          <td class="py-2.5 font-bold text-zinc-900">{st.conversions}</td>
                          <td class="py-2.5">
                            <span class={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              st.is_waste ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
                            }`}>
                              {st.is_waste ? 'Desperdício / Irrelevante' : 'Convertendo'}
                            </span>
                          </td>
                          <td class="py-2.5 text-right">
                            <Show when={st.is_waste}>
                              <button
                                type="button"
                                onClick={() => handleAddNegativeKeyword(st.term)}
                                class="rounded-lg bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700 hover:bg-red-100"
                              >
                                Negativar Termo
                              </button>
                            </Show>
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Show>

      {/* TAB 4: GA4 (GOOGLE ANALYTICS 4) */}
      <Show when={subTab() === "ga4" && ga4Data()}>
        {(ga) => (
          <div class="space-y-6">
            {/* Acquisition Channels */}
            <div class="rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xs">
              <h3 class="text-sm font-bold text-zinc-900">Canais de Aquisição (GA4)</h3>
              <div class="mt-3 overflow-x-auto">
                <table class="w-full text-left text-xs">
                  <thead class="border-b border-zinc-100 text-[10px] font-bold uppercase text-zinc-400">
                    <tr>
                      <th class="py-2">Canal</th>
                      <th class="py-2">Sessões</th>
                      <th class="py-2">Engajamento</th>
                      <th class="py-2">Taxa de Conversão</th>
                      <th class="py-2">Receita</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-zinc-100">
                    <For each={ga().acquisition_channels}>
                      {(ch: any) => (
                        <tr class="hover:bg-zinc-50">
                          <td class="py-2.5 font-bold text-zinc-800">{ch.channel}</td>
                          <td class="py-2.5 text-zinc-600">{ch.sessions}</td>
                          <td class="py-2.5 text-zinc-600">{ch.engaged_rate_pct}%</td>
                          <td class="py-2.5 font-bold text-[#93509e]">{ch.cvr_pct}%</td>
                          <td class="py-2.5 font-bold text-zinc-900">{formatCents(ch.revenue_cents)}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </div>

            {/* E-commerce 5-Step Funnel */}
            <div class="rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xs">
              <h3 class="text-sm font-bold text-zinc-900">
                Funil de E-commerce & Análise de Abandono
              </h3>
              <div class="mt-4 grid gap-3 sm:grid-cols-5">
                <For each={ga().funnel_steps}>
                  {(st: any) => (
                    <div class="rounded-xl border border-zinc-200 p-3.5 text-center">
                      <span class="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600">
                        Etapa {st.step_number}
                      </span>
                      <p class="mt-2 text-xs font-bold text-zinc-800">{st.name}</p>
                      <p class="mt-1 text-lg font-black text-zinc-900">{st.users_count}</p>
                      <Show when={st.step_number > 1}>
                        <p class="mt-1 text-[10px] font-bold text-red-600">
                          -{st.drop_off_pct}% abandono
                        </p>
                      </Show>
                    </div>
                  )}
                </For>
              </div>

              <div class="mt-4 rounded-xl bg-purple-50 p-4 border border-purple-100 text-xs text-zinc-700">
                <p class="font-bold text-[#93509e]">Diagnóstico da IA:</p>
                <p class="mt-1 text-[11px] leading-relaxed">{ga().funnel_summary.ai_diagnosis}</p>
              </div>
            </div>
          </div>
        )}
      </Show>

      {/* TAB 5: META ADS & CAPI */}
      <Show when={subTab() === "meta_ads" && metaAdsData()}>
        {(meta) => (
          <div class="space-y-6">
            {/* CAPI Server-side Status Card */}
            <div class="rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xs">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="flex size-10 items-center justify-center rounded-xl bg-pink-50 text-pink-600">
                    <ShieldCheck class="size-5" />
                  </div>
                  <div>
                    <h3 class="text-sm font-bold text-zinc-900">
                      Conversions API (CAPI) & Pixel Meta
                    </h3>
                    <p class="text-xs text-zinc-500">
                      Pixel ID: {meta().capi_audit.pixel_id} • Event Match Quality: {meta().capi_audit.event_match_quality}/10
                    </p>
                  </div>
                </div>

                <div class="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                  Desduplicação: {meta().capi_audit.deduplication_rate_pct}%
                </div>
              </div>

              <div class="mt-4 grid gap-3 sm:grid-cols-4">
                <For each={meta().capi_audit.server_events}>
                  {(ev: any) => (
                    <div class="rounded-xl border border-zinc-100 bg-zinc-50/70 p-3 text-xs">
                      <div class="flex items-center justify-between font-bold">
                        <span class="text-zinc-800">{ev.event}</span>
                        <span class="text-emerald-600 text-[10px]">Ativo</span>
                      </div>
                      <p class="mt-1 text-[11px] text-zinc-500">
                        {ev.server_count} eventos servidor
                      </p>
                    </div>
                  )}
                </For>
              </div>
            </div>

            {/* Creatives Fatigue Table */}
            <div class="rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xs">
              <h3 class="text-sm font-bold text-zinc-900">
                Criativos no Instagram & Detector de Fadiga
              </h3>
              <div class="mt-3 overflow-x-auto">
                <table class="w-full text-left text-xs">
                  <thead class="border-b border-zinc-100 text-[10px] font-bold uppercase text-zinc-400">
                    <tr>
                      <th class="py-2">Criativo</th>
                      <th class="py-2">Formato</th>
                      <th class="py-2">Frequência</th>
                      <th class="py-2">CTR</th>
                      <th class="py-2">Status</th>
                      <th class="py-2">Recomendação IA</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-zinc-100">
                    <For each={meta().creatives}>
                      {(crt: any) => (
                        <tr class="hover:bg-zinc-50">
                          <td class="py-3 font-bold text-zinc-800">{crt.name}</td>
                          <td class="py-3 text-zinc-600">{crt.format}</td>
                          <td class="py-3 font-semibold text-zinc-800">{crt.frequency}x</td>
                          <td class="py-3 font-bold text-emerald-600">{crt.ctr}%</td>
                          <td class="py-3">
                            <span class={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              crt.fatigue_status === 'fatigued' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
                            }`}>
                              {crt.fatigue_status === 'fatigued' ? 'Fadiga Detectada' : 'Saudável'}
                            </span>
                          </td>
                          <td class="py-3 text-[11px] text-zinc-600">{crt.recommendation}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Show>

      {/* TAB 6: OPORTUNIDADES PIPELINE */}
      <Show when={subTab() === "oportunidades" && opportunities()}>
        {(opps) => (
          <div class="space-y-6">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-base font-extrabold text-zinc-900">
                  Pipeline de Oportunidades de Crescimento
                </h3>
                <p class="text-xs text-zinc-500">
                  Cruzamento inteligente de estoque, margem de lucro e busca no Google.
                </p>
              </div>
            </div>

            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <For each={opps().items}>
                {(op: any) => (
                  <div class="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xs">
                    <div>
                      <div class="flex items-center justify-between">
                        <span class="rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600 uppercase">
                          {op.category}
                        </span>
                        <span class={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          op.priority === 'alta' ? 'bg-red-50 text-red-700' : 'bg-purple-50 text-[#93509e]'
                        }`}>
                          Prioridade {op.priority}
                        </span>
                      </div>

                      <h4 class="mt-3 text-xs font-bold text-zinc-900 leading-snug">{op.title}</h4>
                      <p class="mt-2 text-[11px] text-zinc-600 leading-relaxed">{op.impact_description}</p>
                      
                      <div class="mt-3 rounded-lg bg-emerald-50 p-2 text-[10px] font-bold text-emerald-800">
                        Ganho estimado: {op.estimated_lift}
                      </div>
                    </div>

                    <div class="mt-4 flex items-center gap-2 border-t border-zinc-100 pt-3">
                      <select
                        value={op.status}
                        onChange={(e) => handleUpdateOpportunityStatus(op.id, e.currentTarget.value)}
                        class="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-bold text-zinc-700"
                      >
                        <option value="nova">Nova</option>
                        <option value="em_analise">Em Análise</option>
                        <option value="aprovada">Aprovada</option>
                        <option value="implementada">Implementada</option>
                        <option value="descartada">Descartar</option>
                      </select>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        )}
      </Show>

      {/* TAB 7: RECOMENDAÇÕES DA IA (HUMAN-IN-THE-LOOP) */}
      <Show when={subTab() === "recomendacoes" && recommendations()}>
        {(recs) => (
          <div class="space-y-6">
            <div>
              <h3 class="text-base font-extrabold text-zinc-900">
                Recomendações da IA com Aprovação Human-in-the-Loop
              </h3>
              <p class="text-xs text-zinc-500">
                Nenhuma alteração é publicada sem sua aprovação comercial.
              </p>
            </div>

            <div class="space-y-4">
              <For each={recs()}>
                {(rc: any) => (
                  <div class="rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xs">
                    <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div class="flex items-center gap-2">
                          <span class="rounded-md bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-[#93509e] uppercase">
                            {rc.channel} • {rc.type}
                          </span>
                          <span class={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            rc.status === 'applied' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                          }`}>
                            {rc.status === 'applied' ? 'Aprovado & Aplicado' : 'Aguardando Aprovação'}
                          </span>
                        </div>
                        <h4 class="mt-2 text-sm font-bold text-zinc-900">{rc.title}</h4>
                        <p class="mt-1 text-xs text-zinc-600">{rc.description}</p>

                        {/* Before vs After */}
                        <div class="mt-4 grid gap-3 sm:grid-cols-2 text-xs">
                          <div class="rounded-xl bg-zinc-50 p-3 border border-zinc-200">
                            <span class="text-[10px] font-bold uppercase text-zinc-400">Antes:</span>
                            <pre class="mt-1 whitespace-pre-wrap font-mono text-[11px] text-zinc-700">
                              {JSON.stringify(rc.before_state, null, 2)}
                            </pre>
                          </div>
                          <div class="rounded-xl bg-purple-50/70 p-3 border border-purple-200">
                            <span class="text-[10px] font-bold uppercase text-[#93509e]">Depois da IA:</span>
                            <pre class="mt-1 whitespace-pre-wrap font-mono text-[11px] text-purple-950 font-bold">
                              {JSON.stringify(rc.after_state, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </div>

                      <Show when={rc.status !== 'applied'}>
                        <div class="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleApplyRecommendation(rc.id)}
                            class="rounded-xl bg-[#93509e] px-4 py-2 text-xs font-bold text-white hover:bg-[#7c3f87]"
                          >
                            Aprovar e Executar
                          </button>
                        </div>
                      </Show>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        )}
      </Show>

      {/* TAB 8: AUTOMAÇÕES */}
      <Show when={subTab() === "automacoes" && automations()}>
        {(autos) => (
          <div class="space-y-6">
            <div>
              <h3 class="text-base font-extrabold text-zinc-900">
                Rotinas Automáticas de Marketing & Guardrails
              </h3>
              <p class="text-xs text-zinc-500">
                Proteções automáticas de orçamento, SEO e monitoramento contínuo.
              </p>
            </div>

            <div class="space-y-3">
              <For each={autos()}>
                {(at: any) => (
                  <div class="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xs">
                    <div>
                      <div class="flex items-center gap-2">
                        <h4 class="text-xs font-bold text-zinc-900">{at.name}</h4>
                        <span class="rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600">
                          {at.schedule}
                        </span>
                      </div>
                      <p class="mt-1 text-[11px] text-zinc-500">
                        Última execução: {at.last_run_at ? new Date(at.last_run_at).toLocaleString("pt-BR") : "Pendente"}
                      </p>
                    </div>

                    <div class="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleRunAutomation(at.id)}
                        class="rounded-lg border border-zinc-200 bg-white px-3 py-1 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
                      >
                        Executar Agora
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleAutomation(at.id)}
                        class={`size-6 rounded-full transition-colors flex items-center justify-center ${
                          at.is_enabled ? 'bg-emerald-500 text-white' : 'bg-zinc-200 text-zinc-400'
                        }`}
                      >
                        <Check class="size-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        )}
      </Show>

      {/* TAB 9: RELATÓRIOS */}
      <Show when={subTab() === "relatorios" && reports()}>
        {(reps) => (
          <div class="space-y-6">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-base font-extrabold text-zinc-900">Relatórios Executivos de Marketing</h3>
                <p class="text-xs text-zinc-500">Exportação em CSV e visualização executiva consolidada.</p>
              </div>
            </div>

            <div class="space-y-4">
              <For each={reps()}>
                {(rp: any) => (
                  <div class="rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xs">
                    <div class="flex items-center justify-between">
                      <h4 class="text-sm font-bold text-zinc-900">{rp.title}</h4>
                      <a
                        href={`/api/v1/admin/ai/marketing/reports/${rp.id}/export`}
                        target="_blank"
                        rel="noreferrer"
                        class="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-100"
                      >
                        <Download class="size-3.5" />
                        Baixar CSV
                      </a>
                    </div>
                    <p class="mt-3 text-xs leading-relaxed text-zinc-600 bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                      {rp.summary_text}
                    </p>
                  </div>
                )}
              </For>
            </div>
          </div>
        )}
      </Show>

      {/* TAB 10: INTEGRAÇÕES & APIS */}
      <Show when={subTab() === "integracoes" && integrations()}>
        {(ints) => (
          <div class="space-y-6">
            <div>
              <h3 class="text-base font-extrabold text-zinc-900">
                Conexões com Plataformas de Marketing
              </h3>
              <p class="text-xs text-zinc-500">
                Status das APIs oficiais do Google, Meta e ferramentas de rastreamento.
              </p>
            </div>

            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <For each={ints()}>
                {(ig: any) => (
                  <div class="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xs">
                    <div>
                      <div class="flex items-center justify-between">
                        <span class="text-xs font-bold text-zinc-900">{ig.name}</span>
                        <span class={`size-2.5 rounded-full ${ig.status === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      </div>
                      <p class="mt-2 text-[11px] text-zinc-500">
                        Conta: {ig.account_name || ig.account_id || "Não configurado"}
                      </p>
                      <p class="mt-1 text-[10px] text-zinc-400">
                        {ig.last_healthcheck_message || "Aguardando teste de conexão"}
                      </p>
                    </div>

                    <div class="mt-4 flex items-center gap-2 border-t border-zinc-100 pt-3">
                      <button
                        type="button"
                        onClick={() => handleTestIntegration(ig.platform)}
                        class="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-100"
                      >
                        Testar Conexão
                      </button>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        )}
      </Show>

      {/* Modal: Criar Campanha Google Ads */}
      <Show when={showCampaignModal()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 class="text-sm font-bold text-zinc-900">Gerador de Campanhas com IA</h3>
            <p class="text-xs text-zinc-500 mt-1">
              A IA estruturará 5 títulos, 4 descrições e palavras-chave negativas.
            </p>

            <div class="mt-4 space-y-3">
              <div>
                <label class="text-[11px] font-bold text-zinc-600">Tema ou Produto:</label>
                <input
                  type="text"
                  value={campaignTopic()}
                  onInput={(e) => setCampaignTopic(e.currentTarget.value)}
                  class="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label class="text-[11px] font-bold text-zinc-600">Orçamento Diário (R$):</label>
                <input
                  type="number"
                  value={campaignBudget()}
                  onInput={(e) => setCampaignBudget(Number(e.currentTarget.value))}
                  class="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div class="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCampaignModal(false)}
                class="rounded-xl px-4 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateCampaignDraft}
                disabled={isDrafting()}
                class="rounded-xl bg-[#93509e] px-4 py-2 text-xs font-bold text-white hover:bg-[#7c3f87]"
              >
                {isDrafting() ? "Gerando..." : "Gerar Rascunho"}
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* Floating Marketing Copilot Drawer */}
      <Show when={chatOpen()}>
        <div class="fixed bottom-4 right-4 z-50 flex h-[500px] w-96 flex-col rounded-2xl border border-zinc-200 bg-white shadow-2xl overflow-hidden">
          {/* Chat Header */}
          <div class="flex items-center justify-between bg-zinc-900 px-4 py-3 text-white">
            <div class="flex items-center gap-2">
              <Bot class="size-4 text-purple-400" />
              <span class="text-xs font-bold">Copilot de Marketing & Growth</span>
            </div>
            <button type="button" onClick={() => setChatOpen(false)} class="text-zinc-400 hover:text-white">
              <X class="size-4" />
            </button>
          </div>

          {/* Messages Area */}
          <div class="flex-1 overflow-y-auto p-4 space-y-3 text-xs bg-zinc-50">
            <Show when={chatHistory() && chatHistory()!.length === 0}>
              <div class="text-center text-zinc-500 pt-8">
                <Sparkles class="size-6 text-[#93509e] mx-auto mb-2" />
                <p class="font-bold text-zinc-800">Olá! Sou seu assistente de marketing.</p>
                <p class="text-[11px] mt-1">Pergunte sobre ROAS, SEO, campanhas ou palavras-chave.</p>
                <div class="mt-4 flex flex-col gap-1.5 text-left">
                  <button
                    type="button"
                    onClick={() => handleSendChat("Qual é o nosso ROAS consolidado?")}
                    class="rounded-lg bg-white p-2 border border-zinc-200 text-[11px] hover:border-[#93509e]"
                  >
                    💡 Qual é o nosso ROAS consolidado?
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendChat("Como está o SEO e onde melhorar?")}
                    class="rounded-lg bg-white p-2 border border-zinc-200 text-[11px] hover:border-[#93509e]"
                  >
                    🔍 Como está o SEO e onde melhorar?
                  </button>
                </div>
              </div>
            </Show>

            <For each={chatHistory()}>
              {(msg: any) => (
                <div class={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div class={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed ${
                    msg.role === 'user' ? 'bg-[#93509e] text-white' : 'bg-white text-zinc-800 border border-zinc-200 shadow-2xs'
                  }`}>
                    <p class="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              )}
            </For>
          </div>

          {/* Chat Input */}
          <div class="border-t border-zinc-200 p-3 bg-white">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendChat();
              }}
              class="flex items-center gap-2"
            >
              <input
                type="text"
                placeholder="Pergunte sobre marketing e vendas..."
                value={chatInput()}
                onInput={(e) => setChatInput(e.currentTarget.value)}
                class="flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-xs focus:border-[#93509e] focus:outline-hidden"
              />
              <button
                type="submit"
                disabled={isSendingChat()}
                class="flex size-9 items-center justify-center rounded-xl bg-[#93509e] text-white hover:bg-[#7c3f87]"
              >
                <Send class="size-4" />
              </button>
            </form>
          </div>
        </div>
      </Show>
    </div>
  );
}
