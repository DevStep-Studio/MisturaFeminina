import CheckCircle2 from "lucide-solid/icons/circle-check";
import Globe from "lucide-solid/icons/globe";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import Settings from "lucide-solid/icons/settings";
import ShieldCheck from "lucide-solid/icons/shield-check";
import { For, Show, createResource, createSignal } from "solid-js";
import { ApiError, api } from "../../../lib/api";
import {
  type AiAgentSummary,
  type AiProviderStatus,
  type AiSearchConnectionStatus,
} from "./ai-types";

export function AdminAiSettingsAndLogsPanel(props: {
  mode: "settings" | "logs";
}) {
  const [apiKeyInput, setApiKeyInput] = createSignal("");
  const [searchDriver, setSearchDriver] = createSignal<
    "serper" | "google_custom_search"
  >("serper");
  const [searchApiKeyInput, setSearchApiKeyInput] = createSignal("");
  const [searchEngineIdInput, setSearchEngineIdInput] = createSignal("");
  const [supportModel, setSupportModel] = createSignal("gpt-4o-mini");
  const [catalogModel, setCatalogModel] = createSignal("gpt-4o-mini");
  const [replModel, setReplModel] = createSignal("gpt-4o-mini");
  const [dailyLimit, setDailyLimit] = createSignal(500);
  const [dailyBudget, setDailyBudget] = createSignal(15);
  const [marginPct, setMarginPct] = createSignal(100);
  const [schedule, setSchedule] = createSignal("daily");
  const [agentStates, setAgentStates] = createSignal<Record<string, boolean>>(
    {},
  );
  const [busy, setBusy] = createSignal(false);
  const [feedback, setFeedback] = createSignal<string | null>(null);

  const [settingsData, { refetch: refetchSettings }] = createResource(
    () => (props.mode === "settings" ? true : false),
    async (active) => {
      if (!active) return null;
      const res = await api<{
        data: {
          config: Record<string, unknown>;
          connection: AiProviderStatus;
          search_connection?: AiSearchConnectionStatus;
          agents: AiAgentSummary[];
        };
      }>("/admin/ai/settings");
      const c = res.data.config;
      setSupportModel(String(c.support_model ?? "gpt-4o-mini"));
      setCatalogModel(String(c.catalog_model ?? "gpt-4o-mini"));
      setReplModel(String(c.replenishment_model ?? "gpt-4o-mini"));
      setDailyLimit(Number(c.daily_execution_limit ?? 500));
      setDailyBudget(Number(c.daily_budget_usd ?? 15));
      setMarginPct(Number(c.default_margin_pct ?? 100));
      setSchedule(String(c.auto_replenishment_schedule ?? "daily"));
      if (res.data.search_connection) {
        setSearchDriver(
          res.data.search_connection.driver === "google_custom_search"
            ? "google_custom_search"
            : "serper",
        );
        setSearchEngineIdInput(res.data.search_connection.engine_id ?? "");
      }
      const map: Record<string, boolean> = {};
      for (const a of res.data.agents) {
        map[a.slug] = a.enabled;
      }
      setAgentStates(map);
      return res.data;
    },
  );

  const [logsData, { refetch: refetchLogs }] = createResource(
    () => (props.mode === "logs" ? true : false),
    async (active) => {
      if (!active) return null;
      const res = await api<{
        data: {
          events: Array<{
            id: number;
            event_type: string;
            tool_name: string | null;
            message: string | null;
            created_at: string;
            execution?: {
              agent?: { name: string };
              user?: { name: string };
            };
          }>;
          recent_failures: Array<{
            id: number;
            error_message: string | null;
            created_at: string;
            agent?: { name: string };
          }>;
          usage_today: {
            executions_count: number;
            total_tokens: number;
            estimated_cost_usd: number;
          };
        };
      }>("/admin/ai/logs");
      return res.data;
    },
  );

  async function saveSettings(e: Event) {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      if (apiKeyInput().trim() !== "") {
        await api("/admin/settings/integrations/openai", {
          method: "PUT",
          body: {
            environment: "production",
            is_active: true,
            credentials: { api_key: apiKeyInput().trim() },
          },
        });
        setApiKeyInput("");
      }

      if (
        searchApiKeyInput().trim() !== "" ||
        searchEngineIdInput().trim() !== ""
      ) {
        const creds =
          searchApiKeyInput().trim() !== ""
            ? searchDriver() === "google_custom_search"
              ? { api_key: searchApiKeyInput().trim() }
              : { serper_api_key: searchApiKeyInput().trim() }
            : {};

        await api("/admin/settings/integrations/google_search", {
          method: "PUT",
          body: {
            environment: "production",
            is_active: true,
            public_config: {
              driver: searchDriver(),
              ...(searchEngineIdInput().trim() !== ""
                ? { engine_id: searchEngineIdInput().trim() }
                : {}),
            },
            credentials: creds,
          },
        });
        setSearchApiKeyInput("");
      }

      const agentsPayload = Object.entries(agentStates()).map(
        ([slug, enabled]) => ({ slug, enabled }),
      );

      await api("/admin/ai/settings", {
        method: "PUT",
        body: {
          config: {
            support_model: supportModel(),
            catalog_model: catalogModel(),
            replenishment_model: replModel(),
            daily_execution_limit: dailyLimit(),
            daily_budget_usd: dailyBudget(),
            default_margin_pct: marginPct(),
            auto_replenishment_schedule: schedule(),
          },
          agents: agentsPayload,
        },
      });
      setFeedback("Configurações de IA e busca salvas com segurança.");
      await refetchSettings();
    } catch (err) {
      setFeedback(
        err instanceof ApiError
          ? err.message
          : "Não foi possível salvar as configurações de IA.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await api<{
        data: { status: string; message: string; latency_ms: number };
      }>("/admin/ai/settings/test-connection", { method: "POST" });
      setFeedback(`${res.data.message} (${res.data.latency_ms} ms)`);
      await refetchSettings();
    } finally {
      setBusy(false);
    }
  }

  async function testSearchConnection() {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await api<{
        data: { status: string; message: string; latency_ms: number };
      }>("/admin/ai/settings/test-search-connection", { method: "POST" });
      setFeedback(`${res.data.message} (${res.data.latency_ms} ms)`);
      await refetchSettings();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="space-y-5">
      <Show when={feedback()}>
        <p
          role="status"
          class="rounded-xl border border-[#DFC2E3] bg-[#FCF8FD] px-4 py-2.5 text-sm font-medium text-[#2E0C49]"
        >
          {feedback()}
        </p>
      </Show>

      <Show when={props.mode === "settings" && settingsData()}>
        {(s) => (
          <form onSubmit={(e) => void saveSettings(e)} class="space-y-5">
            <section class="rounded-xl border border-zinc-200 bg-white p-5">
              <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-3">
                <div>
                  <h2 class="flex items-center gap-2 text-base font-bold text-zinc-900">
                    <Settings class="size-4 text-[#93509e]" />
                    Configurações de IA e Provedor
                  </h2>
                  <p class="text-xs text-zinc-500">
                    Chaves secretas são armazenadas criptografadas no backend e
                    nunca são expostas no navegador.
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <span
                    class={`rounded-full px-3 py-1 text-xs font-bold ${
                      s().connection.status === "connected"
                        ? "bg-emerald-100 text-emerald-700"
                        : s().connection.has_api_key
                          ? "bg-amber-100 text-amber-800"
                          : "bg-zinc-100 text-zinc-700"
                    }`}
                  >
                    {s().connection.label}
                  </span>
                  <button
                    type="button"
                    disabled={busy()}
                    onClick={() => void testConnection()}
                    class="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
                  >
                    Testar conexão
                  </button>
                </div>
              </div>

              <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-xs">
                <div>
                  <label class="block font-semibold text-zinc-700">
                    Chave API (OpenAI) — mascarada:{" "}
                    {s().connection.masked_key || "Nenhuma cadastrada"}
                  </label>
                  <input
                    type="password"
                    value={apiKeyInput()}
                    onInput={(e) => setApiKeyInput(e.currentTarget.value)}
                    placeholder="Preencha apenas para alterar a chave..."
                    class="mt-1 h-9 w-full rounded-lg border border-zinc-300 px-3"
                  />
                </div>
                <div>
                  <label class="block font-semibold text-zinc-700">
                    Modelo — Atendimento
                  </label>
                  <input
                    type="text"
                    value={supportModel()}
                    onInput={(e) => setSupportModel(e.currentTarget.value)}
                    class="mt-1 h-9 w-full rounded-lg border border-zinc-300 px-3"
                  />
                </div>
                <div>
                  <label class="block font-semibold text-zinc-700">
                    Modelo — Cadastro
                  </label>
                  <input
                    type="text"
                    value={catalogModel()}
                    onInput={(e) => setCatalogModel(e.currentTarget.value)}
                    class="mt-1 h-9 w-full rounded-lg border border-zinc-300 px-3"
                  />
                </div>
                <div>
                  <label class="block font-semibold text-zinc-700">
                    Modelo — Reposição
                  </label>
                  <input
                    type="text"
                    value={replModel()}
                    onInput={(e) => setReplModel(e.currentTarget.value)}
                    class="mt-1 h-9 w-full rounded-lg border border-zinc-300 px-3"
                  />
                </div>
                <div>
                  <label class="block font-semibold text-zinc-700">
                    Limite diário de execuções
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={dailyLimit()}
                    onInput={(e) =>
                      setDailyLimit(Number(e.currentTarget.value))
                    }
                    class="mt-1 h-9 w-full rounded-lg border border-zinc-300 px-3"
                  />
                </div>
                <div>
                  <label class="block font-semibold text-zinc-700">
                    Orçamento diário (USD)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={dailyBudget()}
                    onInput={(e) =>
                      setDailyBudget(Number(e.currentTarget.value))
                    }
                    class="mt-1 h-9 w-full rounded-lg border border-zinc-300 px-3"
                  />
                </div>
                <div>
                  <label class="block font-semibold text-zinc-700">
                    Margem sugerida s/ custo (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={marginPct()}
                    onInput={(e) => setMarginPct(Number(e.currentTarget.value))}
                    class="mt-1 h-9 w-full rounded-lg border border-zinc-300 px-3"
                  />
                </div>
                <div>
                  <label class="block font-semibold text-zinc-700">
                    Agendamento automático de reposição
                  </label>
                  <select
                    value={schedule()}
                    onChange={(e) => setSchedule(e.currentTarget.value)}
                    class="mt-1 h-9 w-full rounded-lg border border-zinc-300 bg-white px-2.5"
                  >
                    <option value="daily">Diariamente (06:00)</option>
                    <option value="weekly">Semanalmente</option>
                    <option value="manual">Somente manual</option>
                  </select>
                </div>
              </div>
            </section>

            {/* Google Web & Image Search Provider Section */}
            <section class="rounded-xl border border-zinc-200 bg-white p-5">
              <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-3">
                <div>
                  <h3 class="flex items-center gap-2 text-sm font-bold text-zinc-900">
                    <Globe class="size-4 text-[#93509e]" />
                    Busca Google Web e Imagens (Cadastro por Nome)
                  </h3>
                  <p class="text-xs text-zinc-500">
                    Integração oficial em servidor para localizar produtos e fotos reais sem raspar HTML do Google.
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <span
                    class={`rounded-full px-3 py-1 text-xs font-bold ${
                      s().search_connection?.status === "connected"
                        ? "bg-emerald-100 text-emerald-700"
                        : s().search_connection?.has_credentials
                          ? "bg-amber-100 text-amber-800"
                          : "bg-zinc-100 text-zinc-700"
                    }`}
                  >
                    {s().search_connection?.label ?? "Configuração necessária"}
                  </span>
                  <button
                    type="button"
                    disabled={busy()}
                    onClick={() => void testSearchConnection()}
                    class="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
                  >
                    Testar busca Google
                  </button>
                </div>
              </div>

              <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-xs">
                <div>
                  <label class="block font-semibold text-zinc-700">
                    Provedor de Busca Google
                  </label>
                  <select
                    value={searchDriver()}
                    onChange={(e) =>
                      setSearchDriver(
                        e.currentTarget.value === "google_custom_search"
                          ? "google_custom_search"
                          : "serper",
                      )
                    }
                    class="mt-1 h-9 w-full rounded-lg border border-zinc-300 bg-white px-2.5"
                  >
                    <option value="serper">
                      Serper — Google Web &amp; Imagens (recomendado)
                    </option>
                    <option value="google_custom_search">
                      Google Custom Search JSON API (projetos existentes com CX)
                    </option>
                  </select>
                </div>
                <div>
                  <label class="block font-semibold text-zinc-700">
                    {searchDriver() === "google_custom_search"
                      ? "GOOGLE_SEARCH_API_KEY"
                      : "SERPER_API_KEY"}{" "}
                    — mascarada:{" "}
                    {s().search_connection?.masked_key || "Nenhuma cadastrada"}
                  </label>
                  <input
                    type="password"
                    value={searchApiKeyInput()}
                    onInput={(e) => setSearchApiKeyInput(e.currentTarget.value)}
                    placeholder="Preencha apenas para alterar a chave..."
                    class="mt-1 h-9 w-full rounded-lg border border-zinc-300 px-3"
                  />
                </div>
                <Show when={searchDriver() === "google_custom_search"}>
                  <div>
                    <label class="block font-semibold text-zinc-700">
                      GOOGLE_SEARCH_ENGINE_ID (CX)
                    </label>
                    <input
                      type="text"
                      value={searchEngineIdInput()}
                      onInput={(e) =>
                        setSearchEngineIdInput(e.currentTarget.value)
                      }
                      placeholder="Ex.: a1b2c3d4e5f6..."
                      class="mt-1 h-9 w-full rounded-lg border border-zinc-300 px-3 font-mono"
                    />
                  </div>
                </Show>
              </div>
            </section>

            <section class="rounded-xl border border-zinc-200 bg-white p-5">
              <h3 class="mb-3 text-sm font-bold text-zinc-900">
                Ativar / Desativar Agentes
              </h3>
              <div class="grid gap-3 sm:grid-cols-3">
                <For each={s().agents}>
                  {(agent) => (
                    <label class="flex cursor-pointer items-center justify-between rounded-lg border border-zinc-200 p-3 text-xs">
                      <div>
                        <p class="font-bold text-zinc-900">{agent.name}</p>
                        <p class="text-[11px] text-zinc-500">
                          Versão {agent.version}
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={agentStates()[agent.slug] ?? agent.enabled}
                        onChange={(e) =>
                          setAgentStates((prev) => ({
                            ...prev,
                            [agent.slug]: e.currentTarget.checked,
                          }))
                        }
                      />
                    </label>
                  )}
                </For>
              </div>
              <div class="mt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={busy()}
                  class="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#93509e] px-5 text-xs font-bold text-white hover:bg-[#7c3f87] disabled:opacity-50"
                >
                  <CheckCircle2 class="size-3.5" />
                  Salvar configurações
                </button>
              </div>
            </section>
          </form>
        )}
      </Show>

      <Show when={props.mode === "logs" && logsData()}>
        {(logs) => (
          <section class="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-3">
              <div>
                <h2 class="flex items-center gap-2 text-base font-bold text-zinc-900">
                  <ShieldCheck class="size-4 text-[#93509e]" />
                  Logs Técnicos, Ferramentas e Consumo
                </h2>
                <p class="text-xs text-zinc-500">
                  Hoje: {logs().usage_today.executions_count} execuções ·{" "}
                  {logs().usage_today.total_tokens} tokens · US${" "}
                  {logs().usage_today.estimated_cost_usd.toFixed(4)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void refetchLogs()}
                class="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-bold"
              >
                <RefreshCw class="size-3.5" />
                Atualizar
              </button>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="border-b border-zinc-200 bg-zinc-50 uppercase text-zinc-500">
                  <tr>
                    <th class="p-2.5">Data</th>
                    <th class="p-2.5">Evento</th>
                    <th class="p-2.5">Ferramenta</th>
                    <th class="p-2.5">Mensagem</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-zinc-100">
                  <For each={logs().events}>
                    {(ev) => (
                      <tr>
                        <td class="whitespace-nowrap p-2.5 text-zinc-500">
                          {new Date(ev.created_at).toLocaleString("pt-BR")}
                        </td>
                        <td class="p-2.5 font-mono text-[11px]">
                          {ev.event_type}
                        </td>
                        <td class="p-2.5 font-mono text-[11px] text-[#93509e]">
                          {ev.tool_name || "—"}
                        </td>
                        <td class="p-2.5 text-zinc-700">{ev.message}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </section>
        )}
      </Show>
    </div>
  );
}
