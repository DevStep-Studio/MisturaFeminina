import { For, Show, createResource, createSignal } from "solid-js";
import { api, ApiError } from "../../lib/api";
interface Integration {
  provider: string;
  environment: string;
  is_active: boolean;
  public_config: Record<string, string>;
  credential_keys: string[];
}
const definitions = [
  {
    provider: "mercadopago",
    title: "Mercado Pago",
    secrets: [
      ["access_token", "Access token"],
      ["webhook_secret", "Segredo do webhook"],
    ],
    publics: [["public_key", "Chave pública"]],
  },
  {
    provider: "asaas",
    title: "Asaas",
    secrets: [
      ["api_key", "API Key"],
      ["webhook_token", "Token do webhook"],
    ],
    publics: [],
  },
  {
    provider: "correios",
    title: "Correios · Preço e Prazo",
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
    try {
      await api("/admin/settings/store", {
        method: "PUT",
        body: { payment_provider: selected() },
      });
      setMessage("Provedor padrão atualizado para as novas compras.");
    } catch (e) {
      setMessage(
        e instanceof ApiError ? e.message : "Não foi possível salvar.",
      );
    }
  }
  return (
    <section class="mb-6 space-y-5 rounded-xl border border-zinc-200 bg-white p-5">
      <h2 class="text-lg font-bold text-zinc-900">
        Checkout e integrações reais
      </h2>
      <p class="text-sm text-zinc-600">
        Configure aqui ou no .env do backend. A configuração salva no painel tem
        prioridade. Chaves secretas são criptografadas e nunca retornam ao
        navegador.
      </p>
      <form onSubmit={choose} class="flex flex-wrap items-end gap-3">
        <label class="text-sm font-semibold">
          Provedor das novas compras
          <select
            aria-label="Provedor das novas compras"
            class="mt-1 block rounded-lg border border-zinc-300 px-3 py-2"
            value={selected()}
            onChange={(e) => setSelected(e.currentTarget.value)}
          >
            <option value="mercadopago">Mercado Pago</option>
            <option value="asaas">Asaas</option>
          </select>
        </label>
        <button class="rounded-lg bg-[var(--mf-primary)] px-4 py-2 text-sm font-bold text-white">
          Salvar provedor
        </button>
      </form>
      <Show when={rows.error}>
        <p role="alert" class="text-sm text-red-700">
          Não foi possível carregar as integrações. Verifique suas permissões e
          tente novamente.
        </p>
      </Show>
      <Show when={rows()} keyed>
        {(loaded) => (
          <div class="grid gap-4 xl:grid-cols-3">
            <For each={definitions}>
              {(def) => {
                const row = loaded.find((i) => i.provider === def.provider);
                const [env, setEnv] = createSignal(
                  row?.environment ?? "sandbox",
                );
                const [active, setActive] = createSignal(
                  row?.is_active ?? false,
                );
                const [publics, setPublics] = createSignal<
                  Record<string, string>
                >(row?.public_config ?? {});
                const [secrets, setSecrets] = createSignal<
                  Record<string, string>
                >({});
                const [busy, setBusy] = createSignal(false);
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
                    setMessage(`${def.title}: configuração salva.`);
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
                return (
                  <form
                    onSubmit={save}
                    class="space-y-3 rounded-xl border border-zinc-200 p-4"
                  >
                    <h3 class="font-bold">{def.title}</h3>
                    <label class="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={active()}
                        onChange={(e) => setActive(e.currentTarget.checked)}
                      />
                      Integração ativa
                    </label>
                    <label class="block text-xs font-semibold">
                      Ambiente
                      <select
                        class="mt-1 block w-full rounded-lg border border-zinc-300 p-2 text-sm"
                        value={env()}
                        onChange={(e) => setEnv(e.currentTarget.value)}
                      >
                        <option value="sandbox">Homologação / Sandbox</option>
                        <option value="production">Produção</option>
                      </select>
                    </label>
                    <For each={def.publics}>
                      {([key, label]) => (
                        <label class="block text-xs font-semibold">
                          {label}
                          <input
                            class="mt-1 w-full rounded-lg border border-zinc-300 p-2 text-sm"
                            value={publics()[key] ?? ""}
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
                    <For each={def.secrets}>
                      {([key, label]) => (
                        <label class="block text-xs font-semibold">
                          {label}
                          <input
                            type="password"
                            autocomplete="new-password"
                            class="mt-1 w-full rounded-lg border border-zinc-300 p-2 text-sm"
                            placeholder={
                              row?.credential_keys?.includes(key)
                                ? "Configurado · deixe vazio para manter"
                                : "Não configurado"
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
                    <p class="break-all text-xs text-zinc-500">
                      {def.provider === "correios"
                        ? "Requer APIs Preço e Prazo autorizadas no contrato. Dimensões e peso vêm dos produtos/variações."
                        : `Webhook: /api/v1/webhooks/${def.provider}`}
                    </p>
                    <button
                      disabled={busy()}
                      class="w-full rounded-lg bg-[var(--mf-primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {busy() ? "Salvando…" : "Salvar integração"}
                    </button>
                  </form>
                );
              }}
            </For>
          </div>
        )}
      </Show>
      <Show when={message()}>
        <p role="status" class="rounded-lg bg-zinc-50 p-3 text-sm">
          {message()}
        </p>
      </Show>
    </section>
  );
}
