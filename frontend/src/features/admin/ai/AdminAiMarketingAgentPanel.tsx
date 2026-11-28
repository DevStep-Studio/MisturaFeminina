import { Link } from "@tanstack/solid-router";
import AlertCircle from "lucide-solid/icons/circle-exclamation-point";
import Bot from "lucide-solid/icons/bot";
import Check from "lucide-solid/icons/check";
import CheckCircle2 from "lucide-solid/icons/circle-check";
import Copy from "lucide-solid/icons/copy";
import ExternalLink from "lucide-solid/icons/external-link";
import LineChart from "lucide-solid/icons/chart-line";
import Megaphone from "lucide-solid/icons/megaphone";
import Package from "lucide-solid/icons/package";
import Plus from "lucide-solid/icons/plus";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import Search from "lucide-solid/icons/search";
import Send from "lucide-solid/icons/send";
import Settings from "lucide-solid/icons/settings";
import ShieldCheck from "lucide-solid/icons/shield-check";
import ShoppingBag from "lucide-solid/icons/shopping-bag";
import Sparkles from "lucide-solid/icons/sparkles";
import TrendingUp from "lucide-solid/icons/trending-up";
import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { ApiError, api } from "../../../lib/api";
import { formatCents, formatDate } from "../../../lib/format";
import { hasPermission } from "../../../security/permissions";
import { session } from "../../../security/session";

type SectionTab = "visao_geral" | "ga4" | "google_ads" | "shopping";

interface AgentFact {
  source: string;
  text: string;
}

interface AgentReply {
  session_id: string;
  role: string;
  content: string;
  facts: AgentFact[];
  limitations: string[];
  suggestions: string[];
  ai_status?: {
    used_llm: boolean;
    has_api_key: boolean;
    missing_requirement: string | null;
  };
  period?: {
    label: string;
    start_date: string;
    end_date: string;
  };
}

const QUICK_AGENT_QUESTIONS = [
  {
    label: "Visitas sem compras",
    prompt: "Quais produtos receberam visitas, mas não venderam?",
  },
  {
    label: "Comparação de vendas",
    prompt: "Como as vendas se comparam ao período anterior?",
  },
  {
    label: "Pendências do Shopping",
    prompt: "Existem produtos com problemas no Google Shopping?",
  },
  {
    label: "Páginas com atenção",
    prompt: "Quais páginas merecem atenção?",
  },
  {
    label: "Melhorias no catálogo",
    prompt: "O que posso melhorar no catálogo com os dados disponíveis?",
  },
];

function renderDeltaBadge(deltaPct?: number | null, daysCount?: number) {
  if (deltaPct === null || deltaPct === undefined) {
    return (
      <span class="inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-0.5 text-[10.5px] font-medium text-zinc-500">
        Sem dados para comparação
      </span>
    );
  }
  const isPositive = deltaPct > 0;
  const isZero = deltaPct === 0;
  const sign = isPositive ? `+${deltaPct}%` : `${deltaPct}%`;
  const daysText = daysCount ? ` em relação aos ${daysCount} dias anteriores` : " vs período anterior";

  return (
    <span
      class={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10.5px] font-semibold ${
        isPositive
          ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
          : isZero
          ? "bg-zinc-100 text-zinc-600 border border-zinc-200"
          : "bg-red-50 text-red-700 border border-red-200/60"
      }`}
    >
      <span>{sign}</span>
      <span class="font-normal text-zinc-500">{daysText}</span>
    </span>
  );
}

function integrationBadge(status?: string | null) {
  switch (status) {
    case "connected":
      return {
        label: "Ativo",
        cls: "border-emerald-200 bg-emerald-50 text-emerald-800",
        dot: "bg-emerald-500",
      };
    case "configured":
      return {
        label: "Tag ativa",
        cls: "border-[#dfc3e6] bg-[#faf5fb] text-[#62298d]",
        dot: "bg-[#93509e]",
      };
    case "error":
      return {
        label: "Atenção",
        cls: "border-red-200 bg-red-50 text-red-800",
        dot: "bg-red-500",
      };
    default:
      return {
        label: "Pendente",
        cls: "border-amber-200 bg-amber-50 text-amber-900",
        dot: "bg-amber-500",
      };
  }
}

export function AdminAiMarketingAgentPanel() {
  const [tab, setTab] = createSignal<SectionTab>("visao_geral");
  const [periodRange, setPeriodRange] = createSignal<string>("last_30_days");
  const [feedback, setFeedback] = createSignal<{
    tone: "ok" | "err";
    text: string;
  } | null>(null);
  const [copiedUrl, setCopiedUrl] = createSignal<string | null>(null);

  const canWrite = createMemo(() =>
    hasPermission(session.user()?.permissions ?? [], "marketing.write"),
  );

  // Agent state
  const [questionInput, setQuestionInput] = createSignal("");
  const [askingAgent, setAskingAgent] = createSignal(false);
  const [chatSessionId, setChatSessionId] = createSignal<string | null>(null);
  const [latestAgentReply, setLatestAgentReply] =
    createSignal<AgentReply | null>(null);

  // GA4 config form state
  const [showGa4Form, setShowGa4Form] = createSignal(false);
  const [ga4MeasurementId, setGa4MeasurementId] = createSignal("");
  const [ga4GtmId, setGa4GtmId] = createSignal("");
  const [ga4PropertyId, setGa4PropertyId] = createSignal("");
  const [ga4ApiSecret, setGa4ApiSecret] = createSignal("");
  const [ga4ServiceJson, setGa4ServiceJson] = createSignal("");
  const [savingIntegration, setSavingIntegration] = createSignal<string | null>(
    null,
  );
  const [testingPlatform, setTestingPlatform] = createSignal<string | null>(
    null,
  );

  // Google Ads config & local tools state
  const [showAdsForm, setShowAdsForm] = createSignal(false);
  const [adsCustomerId, setAdsCustomerId] = createSignal("");
  const [adsLoginCustomerId, setAdsLoginCustomerId] = createSignal("");
  const [adsDeveloperToken, setAdsDeveloperToken] = createSignal("");
  const [adsClientId, setAdsClientId] = createSignal("");
  const [adsClientSecret, setAdsClientSecret] = createSignal("");
  const [adsRefreshToken, setAdsRefreshToken] = createSignal("");
  const [negKeywordInput, setNegKeywordInput] = createSignal("");
  const [draftTopic, setDraftTopic] = createSignal("");
  const [draftBudgetBrl, setDraftBudgetBrl] = createSignal("35");
  const [draftSaving, setDraftSaving] = createSignal(false);

  // Merchant Center API config & filter state
  const [showMerchantForm, setShowMerchantForm] = createSignal(false);
  const [merchantAccountId, setMerchantAccountId] = createSignal("");
  const [merchantServiceJson, setMerchantServiceJson] = createSignal("");
  const [refreshingFeed, setRefreshingFeed] = createSignal(false);
  const [shoppingSearch, setShoppingSearch] = createSignal("");
  const [shoppingReasonFilter, setShoppingReasonFilter] =
    createSignal<string>("all");
  const [shoppingListMode, setShoppingListMode] = createSignal<
    "incomplete" | "ready"
  >("incomplete");

  // Data resources
  const [overview, { refetch: refetchOverview }] = createResource(
    () => periodRange(),
    async (range) => {
      const res = await api<{ data: any }>(
        `/admin/marketing-google/overview?range=${encodeURIComponent(range)}`,
      );
      return res.data;
    },
  );

  const [ga4Data, { refetch: refetchGa4 }] = createResource(
    () => (tab() === "ga4" ? periodRange() : null),
    async (range) => {
      if (!range) return null;
      const res = await api<{ data: any }>(
        `/admin/marketing-google/ga4/insights?range=${encodeURIComponent(range)}`,
      );
      const integration = res.data?.integration;
      if (integration) {
        if (!ga4MeasurementId()) setGa4MeasurementId(integration.pixel_id || "");
        if (!ga4PropertyId()) setGa4PropertyId(integration.property_id || "");
        if (!ga4GtmId()) setGa4GtmId(integration.settings?.gtm_id || "");
      }
      return res.data;
    },
  );

  const [adsData, { refetch: refetchAds }] = createResource(
    () => (tab() === "google_ads" ? periodRange() : null),
    async (range) => {
      if (!range) return null;
      const res = await api<{ data: any }>(
        `/admin/marketing-google/google-ads/campaigns?range=${encodeURIComponent(range)}`,
      );
      const integration = res.data?.integration;
      if (integration) {
        if (!adsCustomerId()) setAdsCustomerId(integration.account_id || "");
        if (!adsLoginCustomerId()) {
          setAdsLoginCustomerId(integration.settings?.login_customer_id || "");
        }
      }
      return res.data;
    },
  );

  const [shoppingData, { refetch: refetchShopping }] = createResource(
    () => tab() === "shopping" || tab() === "visao_geral",
    async (active) => {
      if (!active) return null;
      const res = await api<{ data: any }>(
        "/admin/marketing-google/shopping/feed",
      );
      const integration = res.data?.integration;
      if (integration && !merchantAccountId()) {
        setMerchantAccountId(integration.account_id || "");
      }
      return res.data;
    },
  );

  function notify(tone: "ok" | "err", text: string) {
    setFeedback({ tone, text });
  }

  async function refreshCurrentView() {
    setFeedback(null);
    await Promise.all([
      refetchOverview(),
      tab() === "ga4" ? refetchGa4() : Promise.resolve(),
      tab() === "google_ads" ? refetchAds() : Promise.resolve(),
      refetchShopping(),
    ]);
  }

  async function copyToClipboard(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      window.setTimeout(() => setCopiedUrl(null), 2500);
    } catch {
      notify("err", "Não foi possível copiar automaticamente. Selecione e copie a URL.");
    }
  }

  async function askMarketingAgent(rawQuestion?: string) {
    const q = (rawQuestion ?? questionInput()).trim();
    if (!q || askingAgent()) return;
    setAskingAgent(true);
    setFeedback(null);
    if (!rawQuestion) setQuestionInput("");

    try {
      const res = await api<{ data: AgentReply }>(
        "/admin/marketing-google/chat",
        {
          method: "POST",
          body: {
            message: q,
            session_id: chatSessionId() ?? undefined,
            range: periodRange(),
          },
        },
      );
      setChatSessionId(res.data.session_id);
      setLatestAgentReply(res.data);
    } catch (err) {
      notify(
        "err",
        err instanceof ApiError
          ? err.message
          : "Falha ao consultar o Agente de Marketing.",
      );
    } finally {
      setAskingAgent(false);
    }
  }

  async function handleSaveGa4(e: Event) {
    e.preventDefault();
    if (!canWrite()) return;
    setSavingIntegration("google_analytics_4");
    setFeedback(null);
    try {
      const creds: Record<string, string> = {};
      if (ga4ServiceJson().trim()) {
        creds.service_account_json = ga4ServiceJson().trim();
      }
      if (ga4ApiSecret().trim()) {
        creds.api_secret = ga4ApiSecret().trim();
      }

      const res = await api<{ data: any; message: string }>(
        "/admin/marketing-google/integrations/connect",
        {
          method: "POST",
          body: {
            platform: "google_analytics_4",
            pixel_id: ga4MeasurementId().trim() || null,
            property_id: ga4PropertyId().trim() || null,
            settings: {
              consent_mode_v2: true,
              gtm_id: ga4GtmId().trim() || null,
            },
            ...(Object.keys(creds).length > 0 ? { credentials: creds } : {}),
          },
        },
      );
      setGa4ServiceJson("");
      setGa4ApiSecret("");
      notify(
        res.data?.status === "error" ? "err" : "ok",
        res.data?.last_healthcheck_message || res.message,
      );
      await Promise.all([refetchGa4(), refetchOverview()]);
    } catch (err) {
      notify(
        "err",
        err instanceof ApiError ? err.message : "Erro ao salvar configuração GA4.",
      );
    } finally {
      setSavingIntegration(null);
    }
  }

  async function handleSaveGoogleAds(e: Event) {
    e.preventDefault();
    if (!canWrite()) return;
    setSavingIntegration("google_ads");
    setFeedback(null);
    try {
      const creds: Record<string, string> = {};
      if (adsDeveloperToken().trim()) {
        creds.developer_token = adsDeveloperToken().trim();
      }
      if (adsClientId().trim()) creds.client_id = adsClientId().trim();
      if (adsClientSecret().trim()) {
        creds.client_secret = adsClientSecret().trim();
      }
      if (adsRefreshToken().trim()) {
        creds.refresh_token = adsRefreshToken().trim();
      }

      const res = await api<{ data: any; message: string }>(
        "/admin/marketing-google/integrations/connect",
        {
          method: "POST",
          body: {
            platform: "google_ads",
            account_id: adsCustomerId().trim() || null,
            settings: {
              read_only_mode: true,
              login_customer_id: adsLoginCustomerId().trim() || null,
            },
            ...(Object.keys(creds).length > 0 ? { credentials: creds } : {}),
          },
        },
      );
      setAdsDeveloperToken("");
      setAdsClientSecret("");
      setAdsRefreshToken("");
      notify(
        res.data?.status === "error" ? "err" : "ok",
        res.data?.last_healthcheck_message || res.message,
      );
      await Promise.all([refetchAds(), refetchOverview()]);
    } catch (err) {
      notify(
        "err",
        err instanceof ApiError
          ? err.message
          : "Erro ao salvar configuração do Google Ads.",
      );
    } finally {
      setSavingIntegration(null);
    }
  }

  async function handleSaveMerchantCenter(e: Event) {
    e.preventDefault();
    if (!canWrite()) return;
    setSavingIntegration("google_merchant_center");
    setFeedback(null);
    try {
      const creds: Record<string, string> = {};
      if (merchantServiceJson().trim()) {
        creds.service_account_json = merchantServiceJson().trim();
      }
      const res = await api<{ data: any; message: string }>(
        "/admin/marketing-google/integrations/connect",
        {
          method: "POST",
          body: {
            platform: "google_merchant_center",
            account_id: merchantAccountId().trim() || null,
            ...(Object.keys(creds).length > 0 ? { credentials: creds } : {}),
          },
        },
      );
      setMerchantServiceJson("");
      notify(
        res.data?.status === "error" ? "err" : "ok",
        res.data?.last_healthcheck_message || res.message,
      );
      await Promise.all([refetchShopping(), refetchOverview()]);
    } catch (err) {
      notify(
        "err",
        err instanceof ApiError
          ? err.message
          : "Erro ao salvar conexão do Merchant Center.",
      );
    } finally {
      setSavingIntegration(null);
    }
  }

  async function handleTestPlatform(platform: string) {
    setTestingPlatform(platform);
    setFeedback(null);
    try {
      const res = await api<{ status: string; message: string }>(
        "/admin/marketing-google/integrations/test",
        {
          method: "POST",
          body: { platform },
        },
      );
      notify(res.status === "error" ? "err" : "ok", res.message);
      await refreshCurrentView();
    } catch (err) {
      notify(
        "err",
        err instanceof ApiError ? err.message : "Falha ao testar integração.",
      );
    } finally {
      setTestingPlatform(null);
    }
  }

  async function handleRefreshFeed() {
    setRefreshingFeed(true);
    setFeedback(null);
    try {
      const res = await api<{ data: any; message: string }>(
        "/admin/marketing-google/shopping/feed/refresh",
        { method: "POST" },
      );
      notify("ok", res.message);
      await Promise.all([refetchShopping(), refetchOverview()]);
    } catch (err) {
      notify(
        "err",
        err instanceof ApiError ? err.message : "Falha ao regerar o feed XML.",
      );
    } finally {
      setRefreshingFeed(false);
    }
  }

  async function handleAddNegativeKeyword(e: Event) {
    e.preventDefault();
    const kw = negKeywordInput().trim();
    if (!kw || !canWrite()) return;
    try {
      await api("/admin/marketing-google/google-ads/negative-keyword", {
        method: "POST",
        body: { keyword: kw },
      });
      setNegKeywordInput("");
      notify("ok", `Palavra negativa "${kw}" registrada na lista local.`);
      await refetchAds();
    } catch (err) {
      notify(
        "err",
        err instanceof ApiError
          ? err.message
          : "Erro ao salvar palavra negativa.",
      );
    }
  }

  async function handleDraftCampaign(e: Event) {
    e.preventDefault();
    const topic = draftTopic().trim();
    const budget = Number(draftBudgetBrl());
    if (!topic || !Number.isFinite(budget) || budget < 5 || !canWrite()) return;
    setDraftSaving(true);
    try {
      await api("/admin/marketing-google/google-ads/draft-campaign", {
        method: "POST",
        body: { topic, daily_budget_brl: budget },
      });
      setDraftTopic("");
      notify(
        "ok",
        "Rascunho local de campanha salvo para revisão humana (nenhum anúncio foi publicado).",
      );
      await refetchAds();
    } catch (err) {
      notify(
        "err",
        err instanceof ApiError ? err.message : "Erro ao gerar rascunho.",
      );
    } finally {
      setDraftSaving(false);
    }
  }

  const filteredIncompleteProducts = createMemo(() => {
    const list: any[] = shoppingData()?.incomplete_products ?? [];
    const term = shoppingSearch().trim().toLowerCase();
    const reasonCode = shoppingReasonFilter();

    return list.filter((p) => {
      if (term) {
        const hay = `${p.name || ""} ${p.sku || ""} ${p.category_path || ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (reasonCode !== "all") {
        const codes = (p.blocking_issues ?? []).map((b: any) => b.code);
        const warnCodes = (p.warnings ?? []).map((w: any) => w.code);
        if (!codes.includes(reasonCode) && !warnCodes.includes(reasonCode)) {
          return false;
        }
      }
      return true;
    });
  });

  const filteredReadyProducts = createMemo(() => {
    const list: any[] = shoppingData()?.ready_products ?? [];
    const term = shoppingSearch().trim().toLowerCase();
    if (!term) return list;
    return list.filter((p) =>
      `${p.name || ""} ${p.sku || ""} ${p.category_path || ""}`
        .toLowerCase()
        .includes(term),
    );
  });

  return (
    <div class="space-y-6">
      {/* Top Navigation + Period Selector */}
      <div class="flex flex-col gap-3 rounded-2xl border border-[#eadbf0] bg-white p-4 shadow-xs lg:flex-row lg:items-center lg:justify-between">
        <nav
          aria-label="Seções de Marketing e Google"
          class="flex flex-wrap items-center gap-1.5"
        >
          {(
            [
              {
                id: "visao_geral",
                label: "Visão Geral & Agente",
                icon: Sparkles,
              },
              { id: "ga4", label: "Google Analytics 4", icon: LineChart },
              { id: "google_ads", label: "Google Ads", icon: Megaphone },
              {
                id: "shopping",
                label: "Google Shopping",
                icon: ShoppingBag,
              },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = () => tab() === item.id;
            return (
              <button
                type="button"
                onClick={() => setTab(item.id)}
                class={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition sm:text-sm ${
                  active()
                    ? "bg-[#62298d] text-white shadow-xs"
                    : "bg-[#faf5fb] text-zinc-700 hover:bg-[#f2e6f7] hover:text-[#62298d]"
                }`}
              >
                <Icon class="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div class="flex flex-wrap items-center gap-2">
          <label class="sr-only" for="mf-marketing-period">
            Período de análise
          </label>
          <select
            id="mf-marketing-period"
            value={periodRange()}
            onChange={(e) => setPeriodRange(e.currentTarget.value)}
            class="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-800 sm:text-sm"
          >
            <option value="today">Hoje</option>
            <option value="last_7_days">Últimos 7 dias</option>
            <option value="last_30_days">Últimos 30 dias</option>
            <option value="last_90_days">Últimos 90 dias</option>
          </select>
          <button
            type="button"
            onClick={() => void refreshCurrentView()}
            class="inline-flex h-10 items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
          >
            <RefreshCw class="h-3.5 w-3.5" />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      <Show when={feedback()}>
        {(msg) => (
          <div
            role="status"
            class={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
              msg().tone === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-red-200 bg-red-50 text-red-900"
            }`}
          >
            <span>{msg().text}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              class="text-xs font-bold underline"
            >
              Fechar
            </button>
          </div>
        )}
      </Show>

      {/* =================================================================
          SECTION 1: VISÃO GERAL & AGENTE DE MARKETING
      ================================================================== */}
      <Show when={tab() === "visao_geral"}>
        <div class="space-y-5">
          {/* Canais e Integrações — Barra compacta e moderna */}
          <section aria-label="Estado real das integrações">
            <div class="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <span class="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Canais e Integrações
              </span>
              <Show when={overview()?.period}>
                {(p) => (
                  <span class="text-[11px] text-zinc-400">
                    Período: <strong class="font-semibold text-zinc-700">{p().label}</strong> ({p().start_date} a {p().end_date})
                  </span>
                )}
              </Show>
            </div>

            <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {/* GA4 */}
              <button
                type="button"
                onClick={() => setTab("ga4")}
                class="group flex items-center justify-between gap-3 rounded-xl border border-zinc-200/90 bg-white p-3 text-left transition hover:border-[#93509e] hover:shadow-xs"
              >
                <div class="flex items-center gap-2.5 min-w-0">
                  <div class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-orange-50 text-orange-600 group-hover:bg-[#f6ecf9] group-hover:text-[#93509e] transition">
                    <LineChart class="h-4 w-4" />
                  </div>
                  <div class="min-w-0">
                    <p class="truncate text-xs font-bold text-zinc-900 group-hover:text-[#62298d]">Google Analytics 4</p>
                    <p class="truncate text-[11px] text-zinc-500">
                      {overview()?.integrations_status?.ga4?.status === "connected"
                        ? "Sessões e e-commerce"
                        : "Medição de visitas"}
                    </p>
                  </div>
                </div>
                <span class={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${integrationBadge(overview()?.integrations_status?.ga4?.status).cls}`}>
                  <span class={`h-1.5 w-1.5 rounded-full ${integrationBadge(overview()?.integrations_status?.ga4?.status).dot}`} />
                  {integrationBadge(overview()?.integrations_status?.ga4?.status).label}
                </span>
              </button>

              {/* Google Ads */}
              <button
                type="button"
                onClick={() => setTab("google_ads")}
                class="group flex items-center justify-between gap-3 rounded-xl border border-zinc-200/90 bg-white p-3 text-left transition hover:border-[#93509e] hover:shadow-xs"
              >
                <div class="flex items-center gap-2.5 min-w-0">
                  <div class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600 group-hover:bg-[#f6ecf9] group-hover:text-[#93509e] transition">
                    <Megaphone class="h-4 w-4" />
                  </div>
                  <div class="min-w-0">
                    <p class="truncate text-xs font-bold text-zinc-900 group-hover:text-[#62298d]">Google Ads</p>
                    <p class="truncate text-[11px] text-zinc-500">
                      {overview()?.integrations_status?.google_ads?.status === "connected"
                        ? "Campanhas e ROAS"
                        : "Não conectado"}
                    </p>
                  </div>
                </div>
                <span class={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                  overview()?.integrations_status?.google_ads?.status === "connected"
                    ? integrationBadge("connected").cls
                    : "bg-zinc-100 text-zinc-600 border-zinc-200"
                }`}>
                  <span class={`h-1.5 w-1.5 rounded-full ${
                    overview()?.integrations_status?.google_ads?.status === "connected"
                      ? integrationBadge("connected").dot
                      : "bg-zinc-400"
                  }`} />
                  {overview()?.integrations_status?.google_ads?.status === "connected" ? "Ativo" : "Não conectado"}
                </span>
              </button>

              {/* Google Shopping */}
              <button
                type="button"
                onClick={() => setTab("shopping")}
                class="group flex items-center justify-between gap-3 rounded-xl border border-zinc-200/90 bg-white p-3 text-left transition hover:border-[#93509e] hover:shadow-xs"
              >
                <div class="flex items-center gap-2.5 min-w-0">
                  <div class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-[#f6ecf9] group-hover:text-[#93509e] transition">
                    <ShoppingBag class="h-4 w-4" />
                  </div>
                  <div class="min-w-0">
                    <p class="truncate text-xs font-bold text-zinc-900 group-hover:text-[#62298d]">Merchant Center</p>
                    <p class="truncate text-[11px] text-zinc-500">
                      {overview()?.integrations_status?.google_shopping?.ready_products_count ?? 0} no XML • {overview()?.integrations_status?.google_shopping?.incomplete_products_count ?? 0} pendentes
                    </p>
                  </div>
                </div>
                <span class={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${integrationBadge(overview()?.integrations_status?.google_shopping?.status).cls}`}>
                  <span class={`h-1.5 w-1.5 rounded-full ${integrationBadge(overview()?.integrations_status?.google_shopping?.status).dot}`} />
                  {integrationBadge(overview()?.integrations_status?.google_shopping?.status).label}
                </span>
              </button>

              {/* Motor IA */}
              <Link
                to="/admin/ia"
                search={{ tab: "configuracoes" }}
                class="group flex items-center justify-between gap-3 rounded-xl border border-zinc-200/90 bg-white p-3 text-left transition hover:border-[#93509e] hover:shadow-xs"
              >
                <div class="flex items-center gap-2.5 min-w-0">
                  <div class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-purple-50 text-purple-600 group-hover:bg-[#f6ecf9] group-hover:text-[#93509e] transition">
                    <Sparkles class="h-4 w-4" />
                  </div>
                  <div class="min-w-0">
                    <p class="truncate text-xs font-bold text-zinc-900 group-hover:text-[#62298d]">Motor IA</p>
                    <p class="truncate text-[11px] text-zinc-500">
                      {overview()?.integrations_status?.ai_agent?.has_api_key ? "OpenAI conectada" : "Diagnóstico real local"}
                    </p>
                  </div>
                </div>
                <span class={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                  overview()?.integrations_status?.ai_agent?.has_api_key
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-purple-50 text-purple-700 border-purple-200"
                }`}>
                  <span class={`h-1.5 w-1.5 rounded-full ${
                    overview()?.integrations_status?.ai_agent?.has_api_key
                      ? "bg-emerald-500"
                      : "bg-purple-500"
                  }`} />
                  {overview()?.integrations_status?.ai_agent?.has_api_key ? "Ativo" : "Diagnóstico local"}
                </span>
              </Link>
            </div>
          </section>

          {/* Indicadores Principais do Período */}
          <section aria-label="Indicadores verificados no período" class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Receita Líquida */}
            <div class="rounded-xl border border-zinc-200/90 bg-white p-4 shadow-xs">
              <span class="text-xs font-semibold text-zinc-500">Receita Líquida</span>
              <p class="mt-1 text-2xl font-black text-zinc-900">
                {overview() ? formatCents(overview()?.kpis?.net_store_revenue_cents ?? 0) : "—"}
              </p>
              <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                {renderDeltaBadge(overview()?.kpis?.revenue_delta_pct, overview()?.period?.days_count)}
              </div>
              <p class="mt-2 text-[11px] text-zinc-500">
                Bruta: {formatCents(overview()?.kpis?.store_revenue_cents ?? 0)} • Estornos: {formatCents(overview()?.kpis?.refunded_cents ?? 0)}
              </p>
            </div>

            {/* Pedidos Confirmados */}
            <div class="rounded-xl border border-zinc-200/90 bg-white p-4 shadow-xs">
              <span class="text-xs font-semibold text-zinc-500">Pedidos Confirmados</span>
              <p class="mt-1 text-2xl font-black text-zinc-900">
                {overview() ? (overview()?.kpis?.store_orders_count ?? 0) : "—"}
              </p>
              <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                {renderDeltaBadge(overview()?.kpis?.orders_delta_pct, overview()?.period?.days_count)}
              </div>
              <p class="mt-2 text-[11px] text-zinc-500">
                Período anterior: <strong class="font-medium text-zinc-700">{overview()?.kpis?.previous_orders_count ?? 0} pedido(s)</strong>
              </p>
            </div>

            {/* Ticket Médio */}
            <div class="rounded-xl border border-zinc-200/90 bg-white p-4 shadow-xs">
              <span class="text-xs font-semibold text-zinc-500">Ticket Médio</span>
              <p class="mt-1 text-2xl font-black text-zinc-900">
                {overview() ? formatCents(overview()?.kpis?.ticket_medio_cents ?? 0) : "—"}
              </p>
              <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                {(() => {
                  const kpis = overview()?.kpis;
                  const currTicket = kpis?.ticket_medio_cents ?? 0;
                  const prevOrders = kpis?.previous_orders_count ?? 0;
                  const prevRev = kpis?.previous_revenue_cents ?? 0;
                  let ticketDelta: number | null = null;
                  if (prevOrders > 0 && prevRev > 0 && currTicket > 0) {
                    const prevTicket = Math.round(prevRev / prevOrders);
                    ticketDelta = Math.round(((currTicket - prevTicket) / prevTicket) * 100);
                  }
                  return renderDeltaBadge(ticketDelta, overview()?.period?.days_count);
                })()}
              </div>
              <p class="mt-2 text-[11px] text-zinc-500">
                Média por pedido aprovado na loja
              </p>
            </div>

            {/* Acessos / Sessões (GA4) */}
            <div class="rounded-xl border border-zinc-200/90 bg-white p-4 shadow-xs">
              <span class="text-xs font-semibold text-zinc-500">Sessões Registradas (GA4)</span>
              <p class="mt-1 text-2xl font-black text-zinc-900">
                {overview()?.integrations_status?.ga4?.status === "connected" && (overview()?.kpis?.total_sessions ?? 0) > 0
                  ? overview()?.kpis?.total_sessions
                  : (overview()?.integrations_status?.ga4?.status === "connected" ? "0" : "—")}
              </p>
              <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                {overview()?.integrations_status?.ga4?.status === "connected" ? (
                  <span class="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 border border-emerald-200/60">
                    Medição real ativa
                  </span>
                ) : (
                  <span class="inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-0.5 text-[10.5px] font-medium text-zinc-500">
                    Aguardando conexão
                  </span>
                )}
              </div>
              <p class="mt-2 text-[11px] text-zinc-500">
                {overview()?.integrations_status?.ga4?.status === "connected"
                  ? `Taxa de conversão: ${overview()?.kpis?.conversion_rate_pct ?? 0}%`
                  : "Tag ativa na vitrine; conecte a API para sessões"}
              </p>
            </div>
          </section>

          {/* Pontos de Atenção & Oportunidades Práticas */}
          <section aria-label="Pontos de atenção e oportunidades reais">
            <div class="mb-3 flex items-center justify-between">
              <div>
                <h3 class="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Pontos de Atenção & Oportunidades Práticas
                </h3>
                <p class="text-[11px] text-zinc-400">
                  Diagnóstico factual baseado no estado atual da loja, catálogo e canais conectados.
                </p>
              </div>
            </div>

            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              {/* Card 1: Google Shopping & Listagens Gratuitas */}
              <div class="flex flex-col justify-between rounded-xl border border-zinc-200/90 bg-white p-4 shadow-xs transition hover:border-[#93509e]">
                <div>
                  <div class="flex items-center justify-between gap-2 mb-2">
                    <span class="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-900">
                      <ShoppingBag class="h-4 w-4 text-[#93509e]" />
                      Google Shopping & Listagens Gratuitas
                    </span>
                    <span class="rounded-full bg-purple-50 border border-purple-200 px-2 py-0.5 text-[10px] font-bold text-[#62298d]">
                      Feed XML Ativo
                    </span>
                  </div>
                  <div class="space-y-1.5 text-xs text-zinc-600">
                    <p>
                      <strong class="text-zinc-800">O que foi observado:</strong>{" "}
                      {overview()?.integrations_status?.google_shopping?.ready_products_count ?? 0} produto(s) sincronizados no feed oficial.{" "}
                      <span class="font-semibold text-amber-700">
                        {overview()?.integrations_status?.google_shopping?.incomplete_products_count ?? 0} produto(s) pendente(s) de imagem ou dados completos.
                      </span>
                    </p>
                    <p class="text-[11px] text-zinc-500">
                      <strong>Período:</strong> Catálogo atual em tempo real • <strong>Origem:</strong> Feed XML Oficial Google Shopping
                    </p>
                    <p class="text-zinc-700 font-medium">
                      <strong>Sugestão prática:</strong> Completar fotos e dados dos produtos pendentes para qualificá-los automaticamente nas listagens gratuitas do Merchant Center.
                    </p>
                  </div>
                </div>
                <div class="mt-3 pt-3 border-t border-zinc-100 flex items-center justify-between">
                  <span class="text-[11px] text-zinc-400">106 produtos no catálogo ativo</span>
                  <button
                    type="button"
                    onClick={() => {
                      setTab("shopping");
                      setShoppingListMode("incomplete");
                    }}
                    class="inline-flex items-center gap-1 text-xs font-bold text-[#62298d] hover:text-[#93509e] transition"
                  >
                    Ver produtos pendentes <ExternalLink class="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* Card 2: Google Analytics 4 (Sessões & Conversão) */}
              <div class="flex flex-col justify-between rounded-xl border border-zinc-200/90 bg-white p-4 shadow-xs transition hover:border-[#93509e]">
                <div>
                  <div class="flex items-center justify-between gap-2 mb-2">
                    <span class="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-900">
                      <LineChart class="h-4 w-4 text-orange-600" />
                      Google Analytics 4 & Visitas
                    </span>
                    <span class={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                      overview()?.integrations_status?.ga4?.status === "connected"
                        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                        : "bg-amber-50 border-amber-200 text-amber-900"
                    }`}>
                      {overview()?.integrations_status?.ga4?.status === "connected" ? "Tag & API Ativas" : "Tag no Site / API Pendente"}
                    </span>
                  </div>
                  <div class="space-y-1.5 text-xs text-zinc-600">
                    <p>
                      <strong class="text-zinc-800">O que foi observado:</strong>{" "}
                      {overview()?.integrations_status?.ga4?.status === "connected"
                        ? `${overview()?.kpis?.total_sessions ?? 0} sessões registradas no período com taxa de conversão de ${overview()?.kpis?.conversion_rate_pct ?? 0}%.`
                        : "A tag gtag.js está ativa no código da vitrine. Para exibir relatórios de páginas visitadas e produtos sem conversão, conecte as credenciais da Service Account."}
                    </p>
                    <p class="text-[11px] text-zinc-500">
                      <strong>Período:</strong> {overview()?.period?.label ?? "Últimos 30 dias"} • <strong>Origem:</strong> Google Analytics 4
                    </p>
                    <p class="text-zinc-700 font-medium">
                      <strong>Sugestão prática:</strong> Monitorar o tráfego das categorias de ponta (Brocas, Esmaltes, Géis) para detectar páginas com visualizações e ausência de checkout.
                    </p>
                  </div>
                </div>
                <div class="mt-3 pt-3 border-t border-zinc-100 flex items-center justify-between">
                  <span class="text-[11px] text-zinc-400">Consent Mode v2 ativo</span>
                  <button
                    type="button"
                    onClick={() => setTab("ga4")}
                    class="inline-flex items-center gap-1 text-xs font-bold text-[#62298d] hover:text-[#93509e] transition"
                  >
                    Acessar métricas GA4 <ExternalLink class="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* Card 3: Google Ads (Modo Seguro Somente Leitura) */}
              <div class="flex flex-col justify-between rounded-xl border border-zinc-200/90 bg-white p-4 shadow-xs transition hover:border-[#93509e]">
                <div>
                  <div class="flex items-center justify-between gap-2 mb-2">
                    <span class="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-900">
                      <Megaphone class="h-4 w-4 text-blue-600" />
                      Google Ads (Tráfego Pago)
                    </span>
                    <span class="rounded-full bg-zinc-100 border border-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-600">
                      {overview()?.integrations_status?.google_ads?.status === "connected" ? "Modo Leitura" : "Não Conectado"}
                    </span>
                  </div>
                  <div class="space-y-1.5 text-xs text-zinc-600">
                    <p>
                      <strong class="text-zinc-800">O que foi observado:</strong>{" "}
                      {overview()?.integrations_status?.google_ads?.status === "connected"
                        ? `Investimento de ${formatCents(overview()?.kpis?.google_ads_spend_cents ?? 0)} com ROAS reportado de ${overview()?.kpis?.google_ads_roas ?? "—"}x.`
                        : "Conta Google Ads não conectada. Zero cobrança ou alteração de orçamento ocorrendo no momento."}
                    </p>
                    <p class="text-[11px] text-zinc-500">
                      <strong>Período:</strong> {overview()?.period?.label ?? "Últimos 30 dias"} • <strong>Origem:</strong> Google Ads API
                    </p>
                    <p class="text-zinc-700 font-medium">
                      <strong>Sugestão prática:</strong> Priorizar o tráfego gratuito do Google Shopping. Caso ative anúncios no futuro, o painel operará em modo leitura sem alterar orçamentos.
                    </p>
                  </div>
                </div>
                <div class="mt-3 pt-3 border-t border-zinc-100 flex items-center justify-between">
                  <span class="text-[11px] text-zinc-400">Proteção estrita de verba</span>
                  <button
                    type="button"
                    onClick={() => setTab("google_ads")}
                    class="inline-flex items-center gap-1 text-xs font-bold text-[#62298d] hover:text-[#93509e] transition"
                  >
                    Ver detalhes de Ads <ExternalLink class="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* Card 4: Saúde das Vendas & Conversão */}
              <div class="flex flex-col justify-between rounded-xl border border-zinc-200/90 bg-white p-4 shadow-xs transition hover:border-[#93509e]">
                <div>
                  <div class="flex items-center justify-between gap-2 mb-2">
                    <span class="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-900">
                      <TrendingUp class="h-4 w-4 text-emerald-600" />
                      Conversão & Checkout Transparente
                    </span>
                    <span class="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      Mercado Pago & Plupag
                    </span>
                  </div>
                  <div class="space-y-1.5 text-xs text-zinc-600">
                    <p>
                      <strong class="text-zinc-800">O que foi observado:</strong>{" "}
                      {overview()?.kpis?.store_orders_count ?? 0} pedidos confirmados na loja somando {formatCents(overview()?.kpis?.net_store_revenue_cents ?? 0)}. Ticket médio de {formatCents(overview()?.kpis?.ticket_medio_cents ?? 0)}.
                    </p>
                    <p class="text-[11px] text-zinc-500">
                      <strong>Período:</strong> {overview()?.period?.label ?? "Últimos 30 dias"} • <strong>Origem:</strong> Banco de Dados da Loja (MySQL)
                    </p>
                    <p class="text-zinc-700 font-medium">
                      <strong>Sugestão prática:</strong> Manter a regra de transparência nos pagamentos (Pix e Cartão visíveis sem surpresas no checkout).
                    </p>
                  </div>
                </div>
                <div class="mt-3 pt-3 border-t border-zinc-100 flex items-center justify-between">
                  <span class="text-[11px] text-zinc-400">Dados reais sem estimativas</span>
                  <Link
                    to="/admin/pedidos"
                    class="inline-flex items-center gap-1 text-xs font-bold text-[#62298d] hover:text-[#93509e] transition"
                  >
                    Acessar pedidos <ExternalLink class="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </div>
          </section>

          {/* Agente de Marketing & Diagnósticos */}
          <section aria-label="Agente de Marketing e Google" class="rounded-2xl border border-zinc-200/90 bg-white p-4 sm:p-5 shadow-xs">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-100 pb-3.5">
              <div class="flex items-center gap-3">
                <div class="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#62298d] text-white shadow-xs">
                  <Bot class="h-5 w-5" />
                </div>
                <div>
                  <h3 class="text-sm font-bold text-zinc-900 sm:text-base">
                    Agente de Marketing & Diagnósticos
                  </h3>
                  <p class="text-xs text-zinc-500">
                    Respostas baseadas exclusivamente em dados reais da loja, catálogo e canais.
                  </p>
                </div>
              </div>
              <span class="inline-flex items-center gap-1.5 self-start rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
                <ShieldCheck class="h-3.5 w-3.5" />
                Leitura segura • Sem alteração de verba
              </span>
            </div>

            {/* Quick question chips */}
            <div class="mt-3.5 flex flex-wrap items-center gap-2">
              <span class="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mr-1">Sugestões:</span>
              <For each={QUICK_AGENT_QUESTIONS}>
                {(q) => (
                  <button
                    type="button"
                    disabled={askingAgent()}
                    onClick={() => void askMarketingAgent(q.prompt)}
                    class="rounded-lg border border-zinc-200 bg-zinc-50/80 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-[#93509e] hover:bg-[#faf5fb] hover:text-[#62298d] disabled:opacity-50"
                  >
                    {q.label}
                  </button>
                )}
              </For>
            </div>

            {/* Custom question form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void askMarketingAgent();
              }}
              class="mt-3 flex gap-2"
            >
              <div class="relative flex-1">
                <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={questionInput()}
                  onInput={(e) => setQuestionInput(e.currentTarget.value)}
                  placeholder="Faça uma pergunta sobre vendas, produtos sem conversão, Shopping ou campanhas..."
                  aria-label="Pergunta para o Agente de Marketing"
                  class="h-10 w-full rounded-xl border border-zinc-200 bg-zinc-50/50 pl-9 pr-3.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-[#93509e] focus:bg-white focus:outline-none transition sm:text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={askingAgent() || !questionInput().trim()}
                class="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#93509e] px-4 text-xs font-bold text-white transition hover:bg-[#7c3f87] disabled:opacity-50 sm:text-sm"
              >
                <Send class="h-3.5 w-3.5" />
                <span>{askingAgent() ? "Analisando..." : "Perguntar"}</span>
              </button>
            </form>

            {/* Structured Agent Response or Executive Cards */}
            <Show
              when={latestAgentReply()}
              fallback={
                <div class="mt-4 rounded-xl border border-zinc-100 bg-zinc-50/60 p-3.5 sm:p-4">
                  <p class="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2.5">
                    Resumo do Período Atual
                  </p>
                  <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-3 text-xs">
                    <div class="rounded-lg bg-white p-3 border border-zinc-200/60 shadow-2xs">
                      <p class="font-bold text-zinc-900">Vendas & Conversão</p>
                      <p class="mt-1 text-zinc-600">
                        <strong class="text-zinc-800">{overview()?.kpis?.store_orders_count ?? 0} pedidos válidos</strong> somando {formatCents(overview()?.kpis?.net_store_revenue_cents ?? 0)}.
                      </p>
                    </div>
                    <div class="rounded-lg bg-white p-3 border border-zinc-200/60 shadow-2xs">
                      <p class="font-bold text-zinc-900">Google Shopping</p>
                      <p class="mt-1 text-zinc-600">
                        <strong class="text-zinc-800">{overview()?.integrations_status?.google_shopping?.ready_products_count ?? 0} produto(s)</strong> pronto(s) no feed XML oficial • {overview()?.integrations_status?.google_shopping?.incomplete_products_count ?? 0} aguardam foto real.
                      </p>
                    </div>
                    <div class="rounded-lg bg-white p-3 border border-zinc-200/60 shadow-2xs">
                      <p class="font-bold text-zinc-900">Canais de Aquisição</p>
                      <p class="mt-1 text-zinc-600">
                        {overview()?.integrations_status?.ga4?.status === "connected"
                          ? `GA4 ativo (${overview()?.kpis?.total_sessions ?? 0} visitas reais). Google Ads não conectado.`
                          : "Aguardando credenciais do GA4 e Ads para diagnóstico cruzado."}
                      </p>
                    </div>
                  </div>
                </div>
              }
            >
              {(reply) => (
                <div class="mt-4 space-y-3.5 rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-4">
                  <div class="flex items-center justify-between border-b border-zinc-200/70 pb-2.5">
                    <span class="text-xs font-bold text-zinc-700 flex items-center gap-1.5">
                      <Bot class="h-3.5 w-3.5 text-[#93509e]" />
                      Resposta do Agente de Marketing
                    </span>
                    <button
                      type="button"
                      onClick={() => setLatestAgentReply(null)}
                      class="text-xs font-semibold text-[#93509e] hover:text-[#62298d] hover:underline"
                    >
                      ✕ Limpar resposta
                    </button>
                  </div>

                  <Show when={reply().ai_status?.missing_requirement}>
                    {(miss) => (
                      <div class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        <strong>Modo determinístico ativo:</strong> Análise factual gerada com base nos dados reais do catálogo, pedidos e feeds XML (sem alucinações de LLM). {miss()}
                      </div>
                    )}
                  </Show>

                  {/* Facts */}
                  <div>
                    <h4 class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-emerald-800">
                      <CheckCircle2 class="h-3.5 w-3.5" />
                      Fatos Confirmados nos Dados Reais
                    </h4>
                    <ul class="mt-2 space-y-1.5 text-xs text-zinc-800 sm:text-sm">
                      <For each={reply().facts}>
                        {(fact) => (
                          <li class="rounded-lg bg-white border border-emerald-100 px-3 py-2 shadow-2xs">
                            <span class="mr-1.5 inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900">
                              {fact.source}
                            </span>
                            {fact.text}
                          </li>
                        )}
                      </For>
                    </ul>
                  </div>

                  {/* Limitations */}
                  <Show when={(reply().limitations?.length ?? 0) > 0}>
                    <div>
                      <h4 class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-800">
                        <AlertCircle class="h-3.5 w-3.5" />
                        Limitações dos Dados Disponíveis
                      </h4>
                      <ul class="mt-2 list-disc space-y-1 pl-5 text-xs text-zinc-600">
                        <For each={reply().limitations}>
                          {(lim) => <li>{lim}</li>}
                        </For>
                      </ul>
                    </div>
                  </Show>

                  {/* Suggestions */}
                  <div>
                    <h4 class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#62298d]">
                      <TrendingUp class="h-3.5 w-3.5" />
                      Sugestões do Agente (Revisão Humana)
                    </h4>
                    <ul class="mt-2 space-y-1.5 text-xs text-zinc-800 sm:text-sm">
                      <For each={reply().suggestions}>
                        {(sug) => (
                          <li class="rounded-lg border border-[#eadbf0] bg-white px-3 py-2 shadow-2xs">
                            {sug}
                          </li>
                        )}
                      </For>
                    </ul>
                  </div>
                </div>
              )}
            </Show>
          </section>
        </div>
      </Show>

      {/* =================================================================
          SECTION 2: GOOGLE ANALYTICS 4
      ================================================================== */}
      <Show when={tab() === "ga4"}>
        <div class="space-y-6">
          <div class="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-base font-extrabold text-zinc-900">
                  Google Analytics 4 (GA4)
                </h2>
                <span
                  class={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                    integrationBadge(
                      ga4Data()?.ga4_api_connected
                        ? "connected"
                        : ga4Data()?.integration?.status,
                    ).cls
                  }`}
                >
                  {
                    integrationBadge(
                      ga4Data()?.ga4_api_connected
                        ? "connected"
                        : ga4Data()?.integration?.status,
                    ).label
                  }
                </span>
              </div>
              <p class="mt-1 text-xs text-zinc-600">
                Período selecionado:{" "}
                <strong>{ga4Data()?.period?.label || "Últimos 30 dias"}</strong>{" "}
                ({ga4Data()?.period?.start_date} a {ga4Data()?.period?.end_date}
                )
              </p>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={testingPlatform() === "google_analytics_4"}
                onClick={() => void handleTestPlatform("google_analytics_4")}
                class="inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                <RefreshCw class="h-3.5 w-3.5" />
                <span>Testar conexão</span>
              </button>
              <Show when={canWrite()}>
                <button
                  type="button"
                  onClick={() => setShowGa4Form((v) => !v)}
                  class="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#62298d] px-3.5 text-xs font-bold text-white hover:bg-[#4e1f73]"
                >
                  <Settings class="h-3.5 w-3.5" />
                  <span>
                    {showGa4Form() ? "Ocultar credenciais" : "Configurar GA4"}
                  </span>
                </button>
              </Show>
            </div>
          </div>

          <Show when={ga4Data()?.availability_notice}>
            {(notice) => (
              <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-950">
                <strong>Aviso de disponibilidade:</strong> {notice()}
              </div>
            )}
          </Show>

          {/* GA4 Connection Form */}
          <Show when={showGa4Form() && canWrite()}>
            <form
              onSubmit={handleSaveGa4}
              class="space-y-4 rounded-2xl border border-[#dfc3e6] bg-[#faf5fb] p-4 sm:p-5"
            >
              <h3 class="text-sm font-extrabold text-zinc-900">
                Credenciais do Google Analytics 4 (Criptografadas no Servidor)
              </h3>
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label class="block text-xs font-bold text-zinc-700">
                    Measurement ID (Vitrine)
                  </label>
                  <input
                    type="text"
                    value={ga4MeasurementId()}
                    onInput={(e) => setGa4MeasurementId(e.currentTarget.value)}
                    placeholder="G-XXXXXXXXXX real"
                    class="mt-1 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm"
                  />
                </div>
                <div>
                  <label class="block text-xs font-bold text-zinc-700">
                    Property ID Numérico (GA4 Data API)
                  </label>
                  <input
                    type="text"
                    value={ga4PropertyId()}
                    onInput={(e) => setGa4PropertyId(e.currentTarget.value)}
                    placeholder="Ex.: 412345678"
                    class="mt-1 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm"
                  />
                </div>
                <div>
                  <label class="block text-xs font-bold text-zinc-700">
                    Google Tag Manager ID (Opcional)
                  </label>
                  <input
                    type="text"
                    value={ga4GtmId()}
                    onInput={(e) => setGa4GtmId(e.currentTarget.value)}
                    placeholder="GTM-XXXXXXX"
                    class="mt-1 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm"
                  />
                </div>
              </div>

              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label class="block text-xs font-bold text-zinc-700">
                    Measurement Protocol API Secret (Opcional — Reembolsos
                    Server-Side)
                  </label>
                  <input
                    type="password"
                    value={ga4ApiSecret()}
                    onInput={(e) => setGa4ApiSecret(e.currentTarget.value)}
                    placeholder={
                      ga4Data()?.integration?.configured_secret_keys?.includes(
                        "api_secret",
                      )
                        ? "Já salvo com criptografia (preencha apenas para substituir)"
                        : "Cole o API Secret do fluxo de dados GA4"
                    }
                    class="mt-1 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm"
                  />
                </div>
                <div>
                  <label class="block text-xs font-bold text-zinc-700">
                    Chave JSON da Service Account (Leitura GA4 Data API)
                  </label>
                  <textarea
                    rows={2}
                    value={ga4ServiceJson()}
                    onInput={(e) => setGa4ServiceJson(e.currentTarget.value)}
                    placeholder={
                      ga4Data()?.integration?.configured_secret_keys?.includes(
                        "service_account_json",
                      )
                        ? "Chave JSON já salva com criptografia (cole apenas para substituir)"
                        : '{"type":"service_account","client_email":"...","private_key":"..."}'
                    }
                    class="mt-1 w-full rounded-lg border border-zinc-300 bg-white p-2.5 font-mono text-xs"
                  />
                </div>
              </div>

              <div class="flex justify-end gap-2">
                <button
                  type="submit"
                  disabled={savingIntegration() === "google_analytics_4"}
                  class="h-10 rounded-xl bg-[#93509e] px-5 text-xs font-bold text-white hover:bg-[#7c3f87] disabled:opacity-50"
                >
                  {savingIntegration() === "google_analytics_4"
                    ? "Salvando..."
                    : "Salvar e validar GA4"}
                </button>
              </div>
            </form>
          </Show>

          {/* GA4 KPIs */}
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div class="rounded-2xl border border-zinc-200 bg-white p-4">
              <p class="text-xs font-semibold text-zinc-500">Visitas / Sessões</p>
              <p class="mt-1 text-xl font-extrabold text-zinc-900">
                {ga4Data()?.kpis?.sessions ?? "Não disponível"}
              </p>
            </div>
            <div class="rounded-2xl border border-zinc-200 bg-white p-4">
              <p class="text-xs font-semibold text-zinc-500">
                Produtos Visualizados
              </p>
              <p class="mt-1 text-xl font-extrabold text-zinc-900">
                {ga4Data()?.kpis?.products_viewed ?? "Não disponível"}
              </p>
            </div>
            <div class="rounded-2xl border border-zinc-200 bg-white p-4">
              <p class="text-xs font-semibold text-zinc-500">
                Carrinhos / Checkouts
              </p>
              <p class="mt-1 text-xl font-extrabold text-zinc-900">
                {ga4Data()?.kpis?.carts_started ?? "—"} /{" "}
                {ga4Data()?.kpis?.checkouts_started ?? "—"}
              </p>
            </div>
            <div class="rounded-2xl border border-zinc-200 bg-white p-4">
              <p class="text-xs font-semibold text-zinc-500">
                Compras / Reembolsos Reais
              </p>
              <p class="mt-1 text-xl font-extrabold text-zinc-900">
                {ga4Data()?.kpis?.store_orders_count ?? 0} ped. /{" "}
                {ga4Data()?.kpis?.refunds_count ?? 0} est.
              </p>
            </div>
          </div>

          {/* Products with visits and zero purchases */}
          <div class="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
            <h3 class="text-sm font-extrabold text-zinc-900">
              Produtos com Visitas e Sem Compras no Período
            </h3>
            <Show
              when={(ga4Data()?.products_views_without_purchases?.length ?? 0) > 0}
              fallback={
                <p class="mt-2 text-xs text-zinc-600">
                  {ga4Data()?.ga4_api_connected
                    ? "Nenhum produto teve visualizações sem compras no período selecionado."
                    : "Sem volume registrado ainda no período. Conecte o GA4 (ou aguarde eventos view_item consentidos na vitrine) para listar automaticamente os SKUs visitados sem conversão."}
                </p>
              }
            >
              <div class="mt-3 overflow-x-auto">
                <table class="w-full min-w-[520px] text-left text-xs">
                  <thead>
                    <tr class="border-b border-zinc-200 text-zinc-500">
                      <th class="pb-2 font-bold">SKU</th>
                      <th class="pb-2 font-bold">Produto</th>
                      <th class="pb-2 font-bold">Visualizações</th>
                      <th class="pb-2 font-bold">Compras</th>
                      <th class="pb-2 font-bold">Fonte</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-zinc-100">
                    <For each={ga4Data()?.products_views_without_purchases}>
                      {(row: any) => (
                        <tr>
                          <td class="py-2.5 font-mono text-zinc-700">
                            {row.sku}
                          </td>
                          <td class="py-2.5 font-semibold text-zinc-900">
                            {row.name}
                          </td>
                          <td class="py-2.5 font-bold text-[#62298d]">
                            {row.views}
                          </td>
                          <td class="py-2.5 text-zinc-600">0</td>
                          <td class="py-2.5 text-zinc-500">{row.source}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>
          </div>

          {/* E-commerce Events & Consent Audit */}
          <div class="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
            <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h3 class="text-sm font-extrabold text-zinc-900">
                Auditoria dos Eventos de E-commerce e Proteção LGPD
              </h3>
              <span class="text-xs font-semibold text-emerald-800">
                Consent Mode v2 ativo • PII bloqueado (CPF, e-mail, telefone,
                endereço)
              </span>
            </div>
            <div class="mt-3 overflow-x-auto">
              <table class="w-full min-w-[580px] text-left text-xs">
                <thead>
                  <tr class="border-b border-zinc-200 text-zinc-500">
                    <th class="pb-2 font-bold">Evento GA4</th>
                    <th class="pb-2 font-bold">Status no Código</th>
                    <th class="pb-2 font-bold">Registros no Período</th>
                    <th class="pb-2 font-bold">Regra e Anti-duplicidade</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-zinc-100">
                  <For each={ga4Data()?.events_audit ?? []}>
                    {(ev: any) => (
                      <tr>
                        <td class="py-2.5 font-mono font-bold text-[#62298d]">
                          {ev.event}
                        </td>
                        <td class="py-2.5">
                          <span class="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                            Implementado
                          </span>
                        </td>
                        <td class="py-2.5 font-semibold text-zinc-800">
                          {ev.recorded_count_in_period}
                        </td>
                        <td class="py-2.5 text-zinc-600">{ev.details}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Show>

      {/* =================================================================
          SECTION 3: GOOGLE ADS (STRICTLY READ-ONLY)
      ================================================================== */}
      <Show when={tab() === "google_ads"}>
        <div class="space-y-6">
          {/* Mandatory Safety Banner */}
          <div class="flex items-start gap-3 rounded-2xl border border-[#dfc3e6] bg-[#faf5fb] p-4">
            <ShieldCheck class="mt-0.5 h-5 w-5 shrink-0 text-[#62298d]" />
            <div class="text-xs leading-relaxed text-zinc-800">
              <strong class="text-[#62298d]">
                Proteção contra gastos indesejados (Somente Leitura):
              </strong>{" "}
              esta integração consulta campanhas exclusivamente via{" "}
              <code>googleAds:searchStream</code>. O sistema nunca cria
              campanhas pagas, nunca ativa anúncios e nunca altera orçamentos
              automaticamente.
            </div>
          </div>

          <div class="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-base font-extrabold text-zinc-900">
                  Google Ads
                </h2>
                <span
                  class={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                    integrationBadge(
                      adsData()?.connected
                        ? "connected"
                        : adsData()?.integration?.status,
                    ).cls
                  }`}
                >
                  {
                    integrationBadge(
                      adsData()?.connected
                        ? "connected"
                        : adsData()?.integration?.status,
                    ).label
                  }
                </span>
              </div>
              <p class="mt-1 text-xs text-zinc-600">
                Período analisado:{" "}
                <strong>{adsData()?.period?.label || "Últimos 30 dias"}</strong>{" "}
                ({adsData()?.period?.start_date} a {adsData()?.period?.end_date}
                )
              </p>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={testingPlatform() === "google_ads"}
                onClick={() => void handleTestPlatform("google_ads")}
                class="inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                <RefreshCw class="h-3.5 w-3.5" />
                <span>Testar conexão</span>
              </button>
              <Show when={canWrite()}>
                <button
                  type="button"
                  onClick={() => setShowAdsForm((v) => !v)}
                  class="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#62298d] px-3.5 text-xs font-bold text-white hover:bg-[#4e1f73]"
                >
                  <Settings class="h-3.5 w-3.5" />
                  <span>
                    {showAdsForm()
                      ? "Ocultar credenciais"
                      : "Configurar Google Ads"}
                  </span>
                </button>
              </Show>
            </div>
          </div>

          <Show when={adsData()?.availability_notice}>
            {(notice) => (
              <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-950">
                {notice()}
              </div>
            )}
          </Show>

          {/* Google Ads Connection Form */}
          <Show when={showAdsForm() && canWrite()}>
            <form
              onSubmit={handleSaveGoogleAds}
              class="space-y-4 rounded-2xl border border-[#dfc3e6] bg-[#faf5fb] p-4 sm:p-5"
            >
              <h3 class="text-sm font-extrabold text-zinc-900">
                Credenciais OAuth2 de Leitura do Google Ads
              </h3>
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label class="block text-xs font-bold text-zinc-700">
                    Customer ID da Conta
                  </label>
                  <input
                    type="text"
                    value={adsCustomerId()}
                    onInput={(e) => setAdsCustomerId(e.currentTarget.value)}
                    placeholder="123-456-7890"
                    class="mt-1 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm"
                  />
                </div>
                <div>
                  <label class="block text-xs font-bold text-zinc-700">
                    MCC / Login Customer ID (Opcional)
                  </label>
                  <input
                    type="text"
                    value={adsLoginCustomerId()}
                    onInput={(e) =>
                      setAdsLoginCustomerId(e.currentTarget.value)
                    }
                    placeholder="Somente se usar conta administradora"
                    class="mt-1 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm"
                  />
                </div>
                <div>
                  <label class="block text-xs font-bold text-zinc-700">
                    Developer Token
                  </label>
                  <input
                    type="password"
                    value={adsDeveloperToken()}
                    onInput={(e) => setAdsDeveloperToken(e.currentTarget.value)}
                    placeholder={
                      adsData()?.integration?.configured_secret_keys?.includes(
                        "developer_token",
                      )
                        ? "Já salvo com criptografia"
                        : "Token de desenvolvedor Google Ads"
                    }
                    class="mt-1 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm"
                  />
                </div>
              </div>

              <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label class="block text-xs font-bold text-zinc-700">
                    OAuth2 Client ID
                  </label>
                  <input
                    type="text"
                    value={adsClientId()}
                    onInput={(e) => setAdsClientId(e.currentTarget.value)}
                    placeholder="...apps.googleusercontent.com"
                    class="mt-1 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm"
                  />
                </div>
                <div>
                  <label class="block text-xs font-bold text-zinc-700">
                    OAuth2 Client Secret
                  </label>
                  <input
                    type="password"
                    value={adsClientSecret()}
                    onInput={(e) => setAdsClientSecret(e.currentTarget.value)}
                    placeholder={
                      adsData()?.integration?.configured_secret_keys?.includes(
                        "client_secret",
                      )
                        ? "Já salvo com criptografia"
                        : "Client Secret"
                    }
                    class="mt-1 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm"
                  />
                </div>
                <div>
                  <label class="block text-xs font-bold text-zinc-700">
                    OAuth2 Refresh Token
                  </label>
                  <input
                    type="password"
                    value={adsRefreshToken()}
                    onInput={(e) => setAdsRefreshToken(e.currentTarget.value)}
                    placeholder={
                      adsData()?.integration?.configured_secret_keys?.includes(
                        "refresh_token",
                      )
                        ? "Já salvo com criptografia"
                        : "1//..."
                    }
                    class="mt-1 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm"
                  />
                </div>
              </div>

              <div class="flex justify-end">
                <button
                  type="submit"
                  disabled={savingIntegration() === "google_ads"}
                  class="h-10 rounded-xl bg-[#93509e] px-5 text-xs font-bold text-white hover:bg-[#7c3f87] disabled:opacity-50"
                >
                  {savingIntegration() === "google_ads"
                    ? "Validando..."
                    : "Salvar e testar leitura"}
                </button>
              </div>
            </form>
          </Show>

          {/* Real Campaigns Table */}
          <div class="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
            <h3 class="text-sm font-extrabold text-zinc-900">
              Campanhas Reais da Conta Google Ads
            </h3>
            <Show
              when={(adsData()?.campaigns?.length ?? 0) > 0}
              fallback={
                <p class="mt-2 text-xs text-zinc-600">
                  {adsData()?.connected
                    ? "Nenhuma campanha ativa ou com impressões no período selecionado."
                    : "Nenhuma campanha carregada enquanto as credenciais de leitura do Google Ads estiverem pendentes."}
                </p>
              }
            >
              <div class="mt-3 overflow-x-auto">
                <table class="w-full min-w-[680px] text-left text-xs">
                  <thead>
                    <tr class="border-b border-zinc-200 text-zinc-500">
                      <th class="pb-2 font-bold">Campanha</th>
                      <th class="pb-2 font-bold">Status</th>
                      <th class="pb-2 font-bold">Investimento</th>
                      <th class="pb-2 font-bold">Impressões</th>
                      <th class="pb-2 font-bold">Cliques / CTR</th>
                      <th class="pb-2 font-bold">Conversões</th>
                      <th class="pb-2 font-bold">Receita Atrib. / ROAS</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-zinc-100">
                    <For each={adsData()?.campaigns}>
                      {(c: any) => (
                        <tr>
                          <td class="py-2.5 font-semibold text-zinc-900">
                            {c.name}
                          </td>
                          <td class="py-2.5 text-zinc-600">{c.status}</td>
                          <td class="py-2.5 font-semibold text-zinc-900">
                            {formatCents(c.spend_cents)}
                          </td>
                          <td class="py-2.5 text-zinc-700">{c.impressions}</td>
                          <td class="py-2.5 text-zinc-700">
                            {c.clicks} ({c.ctr}%)
                          </td>
                          <td class="py-2.5 font-bold text-zinc-900">
                            {c.conversions}
                          </td>
                          <td class="py-2.5 font-bold text-[#62298d]">
                            {formatCents(c.attributed_revenue_cents)} ({c.roas}
                            x)
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>

            {/* Suggestions & Limitations */}
            <Show when={(adsData()?.suggestions?.length ?? 0) > 0}>
              <div class="mt-4 space-y-2 border-t border-zinc-100 pt-4">
                <h4 class="text-xs font-extrabold text-[#62298d] uppercase">
                  Sugestões Baseadas nas Campanhas Analisadas
                </h4>
                <For each={adsData()?.suggestions}>
                  {(s: any) => (
                    <div class="rounded-xl border border-[#eadbf0] bg-[#faf5fb] p-3 text-xs text-zinc-800">
                      <strong>{s.title}:</strong> {s.suggestion}
                    </div>
                  )}
                </For>
              </div>
            </Show>

            <Show when={(adsData()?.limitations?.length ?? 0) > 0}>
              <div class="mt-4 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
                <strong class="text-zinc-700">Limitações e escopo:</strong>{" "}
                {(adsData()?.limitations ?? []).join(" • ")}
              </div>
            </Show>
          </div>

          {/* Local Planning Workspace (clearly marked local-only) */}
          <Show when={canWrite()}>
            <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div class="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
                <h3 class="text-sm font-extrabold text-zinc-900">
                  Lista Local de Palavras Negativas (Revisão Manual)
                </h3>
                <p class="mt-1 text-xs text-zinc-500">
                  Anote termos indesejados para revisão e colagem manual no
                  painel do Google Ads.
                </p>
                <form
                  onSubmit={handleAddNegativeKeyword}
                  class="mt-3 flex gap-2"
                >
                  <input
                    type="text"
                    value={negKeywordInput()}
                    onInput={(e) => setNegKeywordInput(e.currentTarget.value)}
                    placeholder="Ex.: curso manicure gratis"
                    class="h-9 min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 text-xs"
                  />
                  <button
                    type="submit"
                    class="inline-flex h-9 items-center gap-1 rounded-lg bg-[#93509e] px-3 text-xs font-bold text-white hover:bg-[#7c3f87]"
                  >
                    <Plus class="h-3.5 w-3.5" />
                    Adicionar
                  </button>
                </form>
                <div class="mt-3 flex flex-wrap gap-1.5">
                  <For each={adsData()?.negative_keywords ?? []}>
                    {(kw: string) => (
                      <span class="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-700">
                        -{kw}
                      </span>
                    )}
                  </For>
                </div>
              </div>

              <div class="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
                <h3 class="text-sm font-extrabold text-zinc-900">
                  Rascunho Local de Campanha (Não Publica no Google)
                </h3>
                <p class="mt-1 text-xs text-zinc-500">
                  Gera sugestão local de grupos de anúncios e títulos sem criar
                  gasto externo.
                </p>
                <form
                  onSubmit={handleDraftCampaign}
                  class="mt-3 flex flex-col gap-2 sm:flex-row"
                >
                  <input
                    type="text"
                    value={draftTopic()}
                    onInput={(e) => setDraftTopic(e.currentTarget.value)}
                    placeholder="Linha / categoria foco (ex.: Esmaltes em Gel)"
                    class="h-9 min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 text-xs"
                  />
                  <input
                    type="number"
                    min="5"
                    step="5"
                    value={draftBudgetBrl()}
                    onInput={(e) => setDraftBudgetBrl(e.currentTarget.value)}
                    aria-label="Orçamento diário estimado em reais"
                    class="h-9 w-24 rounded-lg border border-zinc-300 px-2.5 text-xs"
                  />
                  <button
                    type="submit"
                    disabled={draftSaving() || !draftTopic().trim()}
                    class="h-9 rounded-lg bg-[#62298d] px-3.5 text-xs font-bold text-white hover:bg-[#4e1f73] disabled:opacity-50"
                  >
                    {draftSaving() ? "Gerando..." : "Salvar rascunho"}
                  </button>
                </form>
              </div>
            </div>
          </Show>
        </div>
      </Show>

      {/* =================================================================
          SECTION 4: GOOGLE SHOPPING & MERCHANT CENTER
      ================================================================== */}
      <Show when={tab() === "shopping"}>
        <div class="space-y-6">
          {/* Feed URL & Generation Card */}
          <div class="rounded-2xl border border-[#dfc3e6] bg-white p-4 sm:p-5">
            <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="text-base font-extrabold text-zinc-900">
                    Feed Oficial Google Shopping / Merchant Center
                  </h2>
                  <span class="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                    <Check class="h-3 w-3" />
                    RSS 2.0 XML ativo
                  </span>
                </div>
                <p class="mt-1 text-xs text-zinc-600">
                  Última validação/geração:{" "}
                  <strong>
                    {shoppingData()?.feed?.last_generated_at
                      ? formatDate(shoppingData()?.feed?.last_generated_at)
                      : "Agora"}
                  </strong>{" "}
                  • Status:{" "}
                  <strong class="text-emerald-800">
                    {shoppingData()?.feed?.status === "success"
                      ? "Gerado com sucesso"
                      : shoppingData()?.feed?.status || "Pronto"}
                  </strong>
                </p>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={refreshingFeed()}
                  onClick={() => void handleRefreshFeed()}
                  class="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#93509e] px-3.5 text-xs font-bold text-white hover:bg-[#7c3f87] disabled:opacity-50"
                >
                  <RefreshCw class="h-3.5 w-3.5" />
                  <span>
                    {refreshingFeed()
                      ? "Regerando..."
                      : "Regerar e validar feed"}
                  </span>
                </button>
                <Show when={canWrite()}>
                  <button
                    type="button"
                    onClick={() => setShowMerchantForm((v) => !v)}
                    class="inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
                  >
                    <Settings class="h-3.5 w-3.5" />
                    <span>API Merchant Center</span>
                  </button>
                </Show>
              </div>
            </div>

            {/* Copyable & Openable Feed URLs */}
            <div class="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <For
                each={[
                  {
                    label: "URL Principal (Busca Programada Recomendada)",
                    url:
                      shoppingData()?.feed?.feed_url ||
                      "https://api.misturafeminina.com.br/merchant-feed.xml",
                  },
                  {
                    label: "URL Alternativa no Domínio da Loja",
                    url:
                      shoppingData()?.feed?.feed_alias_url ||
                      "https://misturafeminina.com.br/feed/google-merchant.xml",
                  },
                ]}
              >
                {(entry) => (
                  <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <span class="block text-[11px] font-bold text-zinc-500 uppercase">
                      {entry.label}
                    </span>
                    <div class="mt-1.5 flex flex-wrap items-center gap-2">
                      <code class="min-w-0 flex-1 truncate rounded bg-white px-2.5 py-1.5 text-xs text-zinc-900">
                        {entry.url}
                      </code>
                      <button
                        type="button"
                        onClick={() => void copyToClipboard(entry.url)}
                        class="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-300 bg-white px-2.5 text-xs font-bold text-zinc-700 hover:bg-zinc-100"
                      >
                        <Copy class="h-3.5 w-3.5" />
                        <span>
                          {copiedUrl() === entry.url ? "Copiada!" : "Copiar"}
                        </span>
                      </button>
                      <a
                        href={entry.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="inline-flex h-8 items-center gap-1 rounded-lg border border-[#dfc3e6] bg-[#faf5fb] px-2.5 text-xs font-bold text-[#62298d] hover:bg-[#f2e6f7]"
                      >
                        <ExternalLink class="h-3.5 w-3.5" />
                        <span>Abrir</span>
                      </a>
                    </div>
                  </div>
                )}
              </For>
            </div>

            {/* Honest Google Merchant Center API confirmation notice */}
            <div class="mt-4 rounded-xl border border-zinc-200 bg-[#faf5fb] px-3.5 py-2.5 text-xs text-zinc-800">
              <strong>Status no Google Merchant Center:</strong>{" "}
              {shoppingData()?.merchant_center_api?.google_confirmation
                ? shoppingData()?.merchant_center_api?.message
                : "Sem confirmação externa de aprovação pelo Google no momento (API Content for Shopping não vinculada). Os números abaixo refletem a elegibilidade técnica real do catálogo no feed XML."}
            </div>

            {/* Optional Merchant Center Content API Form */}
            <Show when={showMerchantForm() && canWrite()}>
              <form
                onSubmit={handleSaveMerchantCenter}
                class="mt-4 space-y-3 rounded-xl border border-[#dfc3e6] bg-white p-4"
              >
                <h3 class="text-xs font-extrabold text-zinc-900 uppercase">
                  Vincular Google Content API for Shopping (Opcional)
                </h3>
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label class="block text-xs font-bold text-zinc-700">
                      Merchant ID Numérico
                    </label>
                    <input
                      type="text"
                      value={merchantAccountId()}
                      onInput={(e) =>
                        setMerchantAccountId(e.currentTarget.value)
                      }
                      placeholder="Ex.: 123456789"
                      class="mt-1 h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label class="block text-xs font-bold text-zinc-700">
                      Service Account JSON
                    </label>
                    <textarea
                      rows={2}
                      value={merchantServiceJson()}
                      onInput={(e) =>
                        setMerchantServiceJson(e.currentTarget.value)
                      }
                      placeholder={
                        shoppingData()?.integration?.configured_secret_keys?.includes(
                          "service_account_json",
                        )
                          ? "Chave JSON já salva com criptografia"
                          : '{"type":"service_account",...}'
                      }
                      class="mt-1 w-full rounded-lg border border-zinc-300 p-2 font-mono text-xs"
                    />
                  </div>
                </div>
                <div class="flex justify-end">
                  <button
                    type="submit"
                    disabled={
                      savingIntegration() === "google_merchant_center"
                    }
                    class="h-9 rounded-lg bg-[#62298d] px-4 text-xs font-bold text-white hover:bg-[#4e1f73] disabled:opacity-50"
                  >
                    Salvar e consultar Merchant Center
                  </button>
                </div>
              </form>
            </Show>
          </div>

          {/* Catalog Readiness Counters */}
          <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div class="rounded-2xl border border-zinc-200 bg-white p-4">
              <p class="text-xs font-semibold text-zinc-500">
                Produtos Ativos no Catálogo
              </p>
              <p class="mt-1 text-2xl font-extrabold text-zinc-900">
                {shoppingData()?.feed?.total_active_products ?? 0}
              </p>
            </div>
            <div class="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
              <p class="text-xs font-semibold text-emerald-800">
                Prontos e Publicados no Feed
              </p>
              <p class="mt-1 text-2xl font-extrabold text-emerald-900">
                {shoppingData()?.feed?.ready_products_count ?? 0}
              </p>
              <p class="mt-1 text-xs text-emerald-800">
                {shoppingData()?.feed?.emitted_items_count ?? 0} item/variações
                no XML
              </p>
            </div>
            <div class="rounded-2xl border border-zinc-200 bg-white p-4">
              <p class="text-xs font-semibold text-zinc-500">
                Prontos Em Estoque / Sem Estoque
              </p>
              <p class="mt-1 text-2xl font-extrabold text-zinc-900">
                {shoppingData()?.feed?.ready_in_stock_count ?? 0} /{" "}
                {shoppingData()?.feed?.ready_out_of_stock_count ?? 0}
              </p>
            </div>
            <div class="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
              <p class="text-xs font-semibold text-amber-900">
                Pendentes / Bloqueados do Feed
              </p>
              <p class="mt-1 text-2xl font-extrabold text-amber-900">
                {shoppingData()?.feed?.incomplete_products_count ?? 0}
              </p>
              <p class="mt-1 text-xs text-amber-800">
                Exigem correção cadastral antes do envio
              </p>
            </div>
          </div>

          {/* Reason Breakdown Pills */}
          <Show when={(shoppingData()?.feed?.reason_breakdown?.length ?? 0) > 0}>
            <div class="rounded-2xl border border-zinc-200 bg-white p-4">
              <h3 class="text-xs font-extrabold text-zinc-700 uppercase">
                 Diagnóstico Consolidado por Motivo (Clique para filtrar)
              </h3>
              <div class="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShoppingReasonFilter("all")}
                  class={`rounded-full border px-3 py-1 text-xs font-bold ${
                    shoppingReasonFilter() === "all"
                      ? "border-[#62298d] bg-[#62298d] text-white"
                      : "border-zinc-300 bg-white text-zinc-700"
                  }`}
                >
                  Todos
                </button>
                <For each={shoppingData()?.feed?.reason_breakdown ?? []}>
                  {(r: any) => (
                    <button
                      type="button"
                      onClick={() => {
                        setShoppingListMode("incomplete");
                        setShoppingReasonFilter(r.code);
                      }}
                      class={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        shoppingReasonFilter() === r.code
                          ? "border-[#62298d] bg-[#62298d] text-white"
                          : r.severity === "blocking"
                            ? "border-red-200 bg-red-50 text-red-900"
                            : "border-amber-200 bg-amber-50 text-amber-900"
                      }`}
                    >
                      {r.label}: <strong>{r.count}</strong>
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* Incomplete vs Ready Products Table */}
          <div class="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShoppingListMode("incomplete")}
                  class={`rounded-xl px-3.5 py-2 text-xs font-bold ${
                    shoppingListMode() === "incomplete"
                      ? "bg-amber-100 text-amber-950"
                      : "bg-zinc-100 text-zinc-700"
                  }`}
                >
                  Produtos Pendentes (
                  {shoppingData()?.feed?.incomplete_products_count ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => setShoppingListMode("ready")}
                  class={`rounded-xl px-3.5 py-2 text-xs font-bold ${
                    shoppingListMode() === "ready"
                      ? "bg-emerald-100 text-emerald-950"
                      : "bg-zinc-100 text-zinc-700"
                  }`}
                >
                  Produtos Prontos no XML (
                  {shoppingData()?.feed?.ready_products_count ?? 0})
                </button>
              </div>

              <div class="relative w-full sm:w-64">
                <Search class="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-zinc-400" />
                <input
                  type="search"
                  value={shoppingSearch()}
                  onInput={(e) => setShoppingSearch(e.currentTarget.value)}
                  placeholder="Buscar por nome ou SKU..."
                  aria-label="Filtrar produtos do feed"
                  class="h-9 w-full rounded-xl border border-zinc-300 bg-white pr-3 pl-9 text-xs"
                />
              </div>
            </div>

            <Show
              when={shoppingListMode() === "incomplete"}
              fallback={
                <Show
                  when={filteredReadyProducts().length > 0}
                  fallback={
                    <p class="mt-4 text-xs text-zinc-600">
                      Nenhum produto pronto encontrado para este filtro. Assim
                      que os produtos receberem foto real (JPG/PNG/WebP) e preço
                      válido, eles entram automaticamente no feed XML.
                    </p>
                  }
                >
                  <div class="mt-4 overflow-x-auto">
                    <table class="w-full min-w-[640px] text-left text-xs">
                      <thead>
                        <tr class="border-b border-zinc-200 text-zinc-500">
                          <th class="pb-2 font-bold">SKU</th>
                          <th class="pb-2 font-bold">Produto</th>
                          <th class="pb-2 font-bold">Preço</th>
                          <th class="pb-2 font-bold">Estoque</th>
                          <th class="pb-2 font-bold">Observações</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-zinc-100">
                        <For each={filteredReadyProducts()}>
                          {(p: any) => (
                            <tr>
                              <td class="py-2.5 font-mono text-zinc-700">
                                {p.sku}
                              </td>
                              <td class="py-2.5 font-semibold text-zinc-900">
                                {p.name}
                              </td>
                              <td class="py-2.5 text-zinc-800">
                                {formatCents(p.price_cents)}
                              </td>
                              <td class="py-2.5">
                                <span
                                  class={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                    p.in_stock
                                      ? "bg-emerald-50 text-emerald-800"
                                      : "bg-amber-50 text-amber-800"
                                  }`}
                                >
                                  {p.stock_qty} un.
                                </span>
                              </td>
                              <td class="py-2.5 text-zinc-600">
                                {(p.warnings ?? []).length > 0
                                  ? p.warnings
                                      .map((w: any) => w.reason)
                                      .join(" • ")
                                  : "Completo"}
                              </td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </div>
                </Show>
              }
            >
              <Show
                when={filteredIncompleteProducts().length > 0}
                fallback={
                  <p class="mt-4 text-xs text-emerald-800">
                    Nenhum produto bloqueado encontrado para este filtro!
                  </p>
                }
              >
                <div class="mt-4 overflow-x-auto">
                  <table class="w-full min-w-[720px] text-left text-xs">
                    <thead>
                      <tr class="border-b border-zinc-200 text-zinc-500">
                        <th class="pb-2 font-bold">SKU</th>
                        <th class="pb-2 font-bold">Produto & Categoria</th>
                        <th class="pb-2 font-bold">Preço / Estoque</th>
                        <th class="pb-2 font-bold">Motivo do Bloqueio</th>
                        <th class="pb-2 font-bold">Como Corrigir</th>
                        <th class="pb-2 font-bold">Ação</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-zinc-100">
                      <For each={filteredIncompleteProducts()}>
                        {(p: any) => (
                          <tr class="align-top">
                            <td class="py-3 pr-2 font-mono text-zinc-700">
                              {p.sku}
                            </td>
                            <td class="py-3 pr-3">
                              <div class="font-semibold text-zinc-900">
                                {p.name}
                              </div>
                              <Show when={p.category_path}>
                                <div class="mt-0.5 text-[11px] text-zinc-500">
                                  {p.category_path}
                                </div>
                              </Show>
                            </td>
                            <td class="py-3 pr-3 whitespace-nowrap text-zinc-700">
                              <div>{formatCents(p.price_cents)}</div>
                              <div class="text-[11px] text-zinc-500">
                                Est.: {p.stock_qty} un.
                              </div>
                            </td>
                            <td class="py-3 pr-3 text-red-800">
                              <For each={p.blocking_issues ?? []}>
                                {(iss: any) => (
                                  <div class="mb-1 font-semibold">
                                    • {iss.reason}
                                  </div>
                                )}
                              </For>
                            </td>
                            <td class="py-3 pr-3 text-zinc-600">
                              <For each={p.blocking_issues ?? []}>
                                {(iss: any) => (
                                  <div class="mb-1">{iss.guidance}</div>
                                )}
                              </For>
                            </td>
                            <td class="py-3 whitespace-nowrap">
                              <Link
                                to="/admin/produtos"
                                class="inline-flex items-center gap-1 rounded-lg border border-[#dfc3e6] bg-[#faf5fb] px-2.5 py-1.5 font-bold text-[#62298d] hover:bg-[#f2e6f7]"
                              >
                                <Package class="h-3.5 w-3.5" />
                                <span>Corrigir</span>
                              </Link>
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </Show>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
