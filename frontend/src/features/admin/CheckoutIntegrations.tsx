import { For, Show, createResource, createSignal } from "solid-js";
import { api, ApiError } from "../../lib/api";

interface Integration {
  provider: string;
  environment: string;
  is_active: boolean;
  public_config: Record<string, string>;
  has_credentials?: boolean;
  credential_keys: string[];
  last_healthcheck_at?: string | null;
  last_healthcheck_status?: string | null;
}

const definitions = [
  {
    provider: "mercadopago",
    title: "Mercado Pago",
    description: "Pagamento transparente com Pix Instantâneo, Cartão de Crédito e Boleto Bancário.",
    secrets: [
      ["access_token", "Access Token (produção ou teste)"],
      ["webhook_secret", "Segredo do Webhook (para validação de assinatura)"],
    ],
    publics: [["public_key", "Chave pública (Public Key)"]],
  },
  {
    provider: "plupag",
    title: "Plupag",
    description: "Pagamento transparente oficial com Pix Instantâneo e Cartão de Crédito até 12x.",
    secrets: [
      ["api_key", "API Key (cabeçalho x-api-key)"],
      ["api_secret", "API Secret (cabeçalho x-api-secret)"],
      ["webhook_secret", "Segredo do Webhook (cabeçalho x-webhook-token)"],
    ],
    publics: [["public_key", "Chave pública (Antifraude / SDK Plupag)"]],
  },
  {
    provider: "asaas",
    title: "Asaas",
    description: "Cobranças via Asaas com redirecionamento de fatura.",
    secrets: [
      ["api_key", "API Key (access_token)"],
      ["webhook_token", "Token do webhook"],
    ],
    publics: [],
  },
  {
    provider: "correios",
    title: "Correios · Preço e Prazo",
    description: "Cálculo de frete em tempo real com contratos SEDEX e PAC.",
    secrets: [
      ["username", "Usuário CWS"],
      ["password", "Código de acesso à API"],
      ["card", "Cartão de postagem"],
      ["contract", "Contrato"],
      ["regional", "Diretoria regional (DR)"],
    ],
    publics: [
      ["origin_zip", "CEP de origem"],
      ["services", "Serviços contratados (03220:SEDEX,03298:PAC)"],
    ],
  },
];

export function CheckoutIntegrations() {
  const [message, setMessage] = createSignal("");
  const [selected, setSelected] = createSignal("mercadopago");
  const [savingStore, setSavingStore] = createSignal(false);

  const [rows, { refetch }] = createResource(async () => {
    const [integrations, store] = await Promise.all([
      api<{ data: Integration[] }>("/admin/settings/integrations"),
      api<{ data: { payment_provider: string } }>("/admin/settings/store"),
    ]);
    setSelected(store.data.payment_provider);
    return integrations.data;
  });

  async function choose(e: Event) {
    e.preventDefault();
    setSavingStore(true);
    setMessage("");
    try {
      await api("/admin/settings/store", {
        method: "PUT",
        body: { payment_provider: selected() },
      });
      setMessage("Provedor padrão atualizado para as novas compras.");
    } catch (e) {
      setMessage(
        e instanceof ApiError ? e.message : "Não foi possível salvar o provedor padrão.",
      );
    } finally {
      setSavingStore(false);
    }
  }

  return (
    <section class="mb-6 space-y-5 rounded-xl border border-zinc-200 bg-white p-5 shadow-xs">
      <div class="border-b border-zinc-100 pb-4">
        <h2 class="text-lg font-bold text-zinc-900">
          Checkout e integrações reais
        </h2>
        <p class="mt-1 text-sm text-zinc-600">
          Gerencie os provedores de pagamento (Mercado Pago, Plupag, Asaas) e cálculo de frete (Correios).
          As credenciais salvas no painel têm prioridade, são criptografadas no banco de dados e nunca retornam ao navegador.
        </p>
      </div>

      <form onSubmit={choose} class="flex flex-wrap items-end gap-3 rounded-xl bg-zinc-50 p-4 border border-zinc-200">
        <label class="text-sm font-semibold text-zinc-800">
          Provedor padrão das novas compras
          <select
            aria-label="Provedor das novas compras"
            class="mt-1.5 block w-64 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal text-zinc-900 shadow-2xs focus:border-[#93509e] focus:outline-hidden focus:ring-2 focus:ring-[#93509e]/20"
            value={selected()}
            onChange={(e) => setSelected(e.currentTarget.value)}
          >
            <option value="mercadopago">Mercado Pago</option>
            <option value="plupag">Plupag</option>
            <option value="asaas">Asaas</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={savingStore()}
          class="rounded-lg bg-[var(--mf-primary)] px-4 py-2 text-sm font-bold text-white shadow-2xs transition hover:bg-[var(--mf-primary-hover)] disabled:opacity-60 cursor-pointer"
        >
          {savingStore() ? "Salvando..." : "Definir padrão"}
        </button>
        <span class="text-xs text-zinc-500 self-center">
          * Quando múltiplos provedores estiverem ativos, o cliente poderá escolher entre eles no checkout.
        </span>
      </form>

      <Show when={rows.error}>
        <p role="alert" class="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          Não foi possível carregar as integrações. Verifique suas permissões e tente novamente.
        </p>
      </Show>

      <Show when={rows()} keyed>
        {(loaded) => (
          <div class="grid gap-5 lg:grid-cols-2 xl:grid-cols-2">
            <For each={definitions}>
              {(def) => {
                const row = loaded.find((i) => i.provider === def.provider);
                const [env, setEnv] = createSignal(row?.environment ?? "sandbox");
                const [active, setActive] = createSignal(row?.is_active ?? false);
                const [publics, setPublics] = createSignal<Record<string, string>>(row?.public_config ?? {});
                const [secrets, setSecrets] = createSignal<Record<string, string>>({});
                const [busy, setBusy] = createSignal(false);
                const [testing, setTesting] = createSignal(false);
                const [copied, setCopied] = createSignal(false);
                const [testFeedback, setTestFeedback] = createSignal<{
                  status: string;
                  message?: string;
                  checked_at?: string;
                } | null>(
                  row?.last_healthcheck_status
                    ? {
                        status: row.last_healthcheck_status,
                        checked_at: row.last_healthcheck_at ?? undefined,
                      }
                    : null
                );

                const hasCredentials = () => {
                  return Boolean(
                    row?.has_credentials ||
                    (row?.credential_keys && row.credential_keys.length > 0)
                  );
                };

                async function save(e: Event) {
                  e.preventDefault();
                  setBusy(true);
                  setMessage("");
                  try {
                    await api(`/admin/settings/integrations/${def.provider}`, {
                      method: "PUT",
                      body: {
                        environment: env(),
                        is_active: active(),
                        public_config: publics(),
                        credentials: secrets(),
                      },
                    });
                    setSecrets({});
                    await refetch();
                    setMessage(`${def.title}: configuração salva com sucesso.`);
                  } catch (e) {
                    setMessage(
                      e instanceof ApiError
                        ? e.message
                        : "Não foi possível salvar a integração.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }

                async function runTest() {
                  setTesting(true);
                  setTestFeedback(null);
                  try {
                    const res = await api<{
                      data: {
                        provider: string;
                        status: string;
                        message?: string;
                        checked_at?: string;
                      };
                    }>(`/admin/settings/integrations/${def.provider}/healthcheck`, {
                      method: "POST",
                    });
                    setTestFeedback(res.data);
                    await refetch();
                  } catch (err) {
                    setTestFeedback({
                      status: "error",
                      message:
                        err instanceof ApiError
                          ? err.message
                          : "Falha na comunicação ao testar conexão.",
                    });
                  } finally {
                    setTesting(false);
                  }
                }

                function copyWebhookUrl() {
                  const url = `https://api.misturafeminina.com.br/api/v1/webhooks/${def.provider}`;
                  if (typeof navigator !== "undefined" && navigator.clipboard) {
                    navigator.clipboard.writeText(url).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }).catch(() => {});
                  }
                }

                return (
                  <form
                    onSubmit={save}
                    class={`flex flex-col justify-between rounded-xl border p-5 shadow-xs transition-colors ${
                      active()
                        ? "border-zinc-300 bg-white"
                        : "border-zinc-200 bg-zinc-50/60 opacity-95"
                    }`}
                  >
                    <div class="space-y-4">
                      {/* Top Header with Badges */}
                      <div class="flex items-start justify-between gap-2 border-b border-zinc-100 pb-3">
                        <div>
                          <div class="flex items-center gap-2">
                            <h3 class="text-base font-bold text-zinc-900">{def.title}</h3>
                            <span
                              class={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border ${
                                active()
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-zinc-100 text-zinc-600 border-zinc-200"
                              }`}
                            >
                              {active() ? "Ativa" : "Inativa"}
                            </span>
                          </div>
                          <p class="mt-0.5 text-xs text-zinc-500">{def.description}</p>
                        </div>
                        <span
                          class={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                            hasCredentials()
                              ? "bg-sky-50 text-sky-700 border-sky-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          }`}
                        >
                          {hasCredentials() ? "Configurada" : "Pendente"}
                        </span>
                      </div>

                      {/* Ativação e Ambiente */}
                      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label class="flex items-center gap-2 text-sm font-medium text-zinc-800 self-center">
                          <input
                            type="checkbox"
                            checked={active()}
                            onChange={(e) => setActive(e.currentTarget.checked)}
                            class="size-4 rounded border-zinc-300 text-[#93509e] focus:ring-[#93509e]"
                          />
                          Habilitar no checkout
                        </label>
                        <label class="block text-xs font-semibold text-zinc-700">
                          Ambiente
                          <select
                            class="mt-1 block w-full rounded-lg border border-zinc-300 bg-white p-2 text-xs text-zinc-800 shadow-2xs focus:border-[#93509e] focus:outline-hidden focus:ring-1 focus:ring-[#93509e]"
                            value={env()}
                            onChange={(e) => setEnv(e.currentTarget.value)}
                          >
                            <option value="sandbox">Homologação / Sandbox</option>
                            <option value="production">Produção</option>
                          </select>
                        </label>
                      </div>

                      {/* Campos Públicos */}
                      <For each={def.publics}>
                        {([key, label]) => (
                          <label class="block text-xs font-semibold text-zinc-700">
                            {label}
                            <input
                              class="mt-1 w-full rounded-lg border border-zinc-300 bg-white p-2 text-xs text-zinc-900 shadow-2xs focus:border-[#93509e] focus:outline-hidden focus:ring-1 focus:ring-[#93509e]"
                              value={publics()[key] ?? ""}
                              placeholder="Ex: pub_live_..."
                              onInput={(e) =>
                                setPublics({
                                  ...publics(),
                                  [key]: e.currentTarget.value,
                                })
                              }
                            />
                          </label>
                        )}
                      </For>

                      {/* Campos Secretos */}
                      <For each={def.secrets}>
                        {([key, label]) => (
                          <label class="block text-xs font-semibold text-zinc-700">
                            {label}
                            <input
                              type="password"
                              autocomplete="new-password"
                              class="mt-1 w-full rounded-lg border border-zinc-300 bg-white p-2 text-xs font-mono text-zinc-900 shadow-2xs focus:border-[#93509e] focus:outline-hidden focus:ring-1 focus:ring-[#93509e]"
                              placeholder={
                                row?.credential_keys?.includes(key)
                                  ? "••••••••  (Configurado · deixe vazio para manter)"
                                  : "Não configurado · insira a chave"
                              }
                              value={secrets()[key] ?? ""}
                              onInput={(e) =>
                                setSecrets({
                                  ...secrets(),
                                  [key]: e.currentTarget.value,
                                })
                              }
                            />
                          </label>
                        )}
                      </For>

                      {/* Webhook URL & Copiar */}
                      <div class="rounded-lg border border-zinc-200 bg-zinc-50 p-2.5">
                        <div class="flex items-center justify-between text-xs font-medium text-zinc-700 mb-1">
                          <span>{def.provider === "correios" ? "Instruções de Frete" : "Endpoint de Webhook"}</span>
                          <Show when={def.provider !== "correios"}>
                            <button
                              type="button"
                              onClick={copyWebhookUrl}
                              class="text-[11px] font-semibold text-[#93509e] hover:underline cursor-pointer"
                            >
                              {copied() ? "✓ Copiado!" : "Copiar URL"}
                            </button>
                          </Show>
                        </div>
                        <p class="break-all font-mono text-[11px] text-zinc-600">
                          {def.provider === "correios"
                            ? "Requer APIs Preço e Prazo autorizadas no contrato CWS dos Correios."
                            : `https://api.misturafeminina.com.br/api/v1/webhooks/${def.provider}`}
                        </p>
                      </div>

                      {/* Caixa de Teste de Conexão */}
                      <div class="rounded-lg border border-zinc-200 bg-zinc-50 p-2.5">
                        <div class="flex items-center justify-between text-xs">
                          <span class="font-medium text-zinc-700">Diagnóstico de Conexão</span>
                          <button
                            type="button"
                            disabled={testing()}
                            onClick={runTest}
                            class="rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 shadow-2xs hover:bg-zinc-50 disabled:opacity-50 cursor-pointer"
                          >
                            {testing() ? "Verificando..." : "Testar conexão"}
                          </button>
                        </div>
                        <Show when={testFeedback()}>
                          {(res) => (
                            <div class="mt-2 text-[11px]">
                              {res().status === "connected" ? (
                                <p class="font-semibold text-emerald-700">
                                  ✓ Conectado com sucesso à API oficial ({def.title}).
                                </p>
                              ) : res().status === "configured" ? (
                                <p class="font-semibold text-sky-700">
                                  ✓ Integração configurada e pronta para uso.
                                </p>
                              ) : res().status === "not_configured" ? (
                                <p class="font-semibold text-amber-700">
                                  ⚠ Credenciais ausentes ou não configuradas no sistema.
                                </p>
                              ) : (
                                <p class="font-semibold text-red-600">
                                  ✕ Falha no teste: {res().message || res().status}
                                </p>
                              )}
                              <Show when={res().checked_at}>
                                <p class="text-[10px] text-zinc-400 mt-0.5">
                                  Última verificação: {new Date(res().checked_at!).toLocaleTimeString("pt-BR")}
                                </p>
                              </Show>
                            </div>
                          )}
                        </Show>
                      </div>
                    </div>

                    {/* Botão de Salvar */}
                    <div class="pt-4 mt-4 border-t border-zinc-100">
                      <button
                        type="submit"
                        disabled={busy()}
                        class="w-full rounded-lg bg-[var(--mf-primary)] px-4 py-2 text-sm font-bold text-white shadow-2xs transition hover:bg-[var(--mf-primary-hover)] disabled:opacity-50 cursor-pointer"
                      >
                        {busy() ? "Salvando integração..." : `Salvar ${def.title}`}
                      </button>
                    </div>
                  </form>
                );
              }}
            </For>
          </div>
        )}
      </Show>

      <Show when={message()}>
        <div role="status" class="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm font-medium text-emerald-800">
          {message()}
        </div>
      </Show>
    </section>
  );
}
