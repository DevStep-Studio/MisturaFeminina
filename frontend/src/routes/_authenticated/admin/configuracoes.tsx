import { createFileRoute } from "@tanstack/solid-router";
import {
  For,
  Show,
  createEffect,
  createResource,
  createSignal,
} from "solid-js";
import { AdminLayout } from "../../../features/admin/AdminLayout";
import { AdminImageUpload } from "../../../features/admin/ui";
import { loadStorefrontBootstrap } from "../../../features/storefront/store";
import type { StoreSettings } from "../../../features/storefront/types";
import { ApiError, api } from "../../../lib/api";
import { seoHead } from "../../../lib/seo";

export const Route = createFileRoute("/_authenticated/admin/configuracoes")({
  head: () =>
    seoHead({
      title: "Marca, Aparência e Integrações — Admin Mistura Feminina",
      description:
        "Personalização completa de logos, favicon, cores, textos e gateways.",
      path: "/admin/configuracoes",
      noindex: true,
    }),
  component: AdminSettingsPage,
});

interface IntegrationRow {
  provider: string;
  environment: "sandbox" | "production";
  public_config: Record<string, string>;
  is_active: boolean;
  has_credentials: boolean;
  credential_keys: string[];
  last_healthcheck_status: string | null;
}

function AdminSettingsPage() {
  const [form, setForm] = createSignal<Partial<StoreSettings>>({});
  const [tickerText, setTickerText] = createSignal("");
  const [feedback, setFeedback] = createSignal<string | null>(null);
  const [mpToken, setMpToken] = createSignal("");
  const [mpPubKey, setMpPubKey] = createSignal("");
  const [mpEnv, setMpEnv] = createSignal<"sandbox" | "production">("sandbox");
  const [meToken, setMeToken] = createSignal("");
  const [meEnv, setMeEnv] = createSignal<"sandbox" | "production">("sandbox");

  const [storeCfg, { refetch: refetchStore }] = createResource(async () => {
    const res = await api<{ data: StoreSettings }>("/admin/settings/store");
    return res.data;
  });

  const [integrations, { refetch: refetchIntegrations }] = createResource(
    async () => {
      const res = await api<{ data: IntegrationRow[] }>(
        "/admin/settings/integrations",
      );
      return res.data ?? [];
    },
  );

  createEffect(() => {
    const cfg = storeCfg();
    if (cfg) {
      setForm({ ...cfg });
      setTickerText((cfg.benefits_ticker ?? []).join("\n"));
    }
    const mp = integrations()?.find((i) => i.provider === "mercadopago");
    if (mp) {
      setMpEnv(mp.environment);
      setMpPubKey(String(mp.public_config?.public_key ?? ""));
    }
    const me = integrations()?.find((i) => i.provider === "melhorenvio");
    if (me) setMeEnv(me.environment);
  });

  async function saveStore(e: Event) {
    e.preventDefault();
    setFeedback(null);
    const payload: Record<string, unknown> = {
      ...form(),
      benefits_ticker: tickerText()
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    };
    delete payload.payment_environment;
    delete payload.payment_sandbox_mode;

    try {
      await api("/admin/settings/store", { method: "PUT", body: payload });
      await refetchStore();
      await loadStorefrontBootstrap(true);
      setFeedback(
        "Identidade visual e configurações da loja aplicadas em tempo real!",
      );
    } catch (err) {
      setFeedback(
        err instanceof ApiError ? err.message : "Erro ao salvar configurações.",
      );
    }
  }

  async function saveMercadoPago(e: Event) {
    e.preventDefault();
    setFeedback(null);
    try {
      await api("/admin/settings/integrations/mercadopago", {
        method: "PUT",
        body: {
          environment: mpEnv(),
          public_config: { public_key: mpPubKey().trim() },
          credentials: mpToken().trim()
            ? { access_token: mpToken().trim() }
            : {},
          is_active: true,
        },
      });
      setMpToken("");
      await refetchIntegrations();
      await loadStorefrontBootstrap(true);
      setFeedback("Credenciais Mercado Pago salvas de forma criptografada.");
    } catch (err) {
      setFeedback(
        err instanceof ApiError ? err.message : "Erro ao salvar Mercado Pago.",
      );
    }
  }

  async function saveMelhorEnvio(e: Event) {
    e.preventDefault();
    setFeedback(null);
    try {
      await api("/admin/settings/integrations/melhorenvio", {
        method: "PUT",
        body: {
          environment: meEnv(),
          credentials: meToken().trim() ? { token: meToken().trim() } : {},
          is_active: true,
        },
      });
      setMeToken("");
      await refetchIntegrations();
      setFeedback("Integração Melhor Envio salva.");
    } catch (err) {
      setFeedback(
        err instanceof ApiError ? err.message : "Erro ao salvar Melhor Envio.",
      );
    }
  }

  async function runHealthcheck(provider: string) {
    setFeedback(null);
    const res = await api<{ data: { status: string; message: string } }>(
      `/admin/settings/integrations/${provider}/healthcheck`,
      { method: "POST" },
    );
    await refetchIntegrations();
    setFeedback(`${provider}: ${res.data.status} — ${res.data.message}`);
  }

  return (
    <AdminLayout
      title="Identidade Visual, Loja e Integrações"
      subtitle="Edite logos, favicon, paleta de cores, CNPJ, WhatsApp, popup e chaves criptografadas sem alterar código"
      permission="settings.view"
    >
      <Show when={feedback()}>
        <p
          role="status"
          class="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800"
        >
          {feedback()}
        </p>
      </Show>

      <div class="grid gap-6 lg:grid-cols-12">
        <form
          onSubmit={saveStore}
          class="space-y-5 rounded-xl border border-zinc-200 bg-white p-6 lg:col-span-7"
        >
          <h2 class="text-base font-bold text-zinc-900">
            1. Marca, Logos, Favicon e Cores
          </h2>

          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="block text-xs font-semibold text-zinc-700">
                Nome da Loja
              </label>
              <input
                type="text"
                value={form().store_name ?? ""}
                onInput={(e) =>
                  setForm((p) => ({ ...p, store_name: e.currentTarget.value }))
                }
                class="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-zinc-700">
                Slogan / Tagline
              </label>
              <input
                type="text"
                value={form().tagline ?? ""}
                onInput={(e) =>
                  setForm((p) => ({ ...p, tagline: e.currentTarget.value }))
                }
                class="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm"
              />
            </div>
          </div>

          <div class="grid gap-4 rounded-[12px] border border-zinc-200 bg-zinc-50 p-4 sm:grid-cols-3">
            <AdminImageUpload
              label="Logo Fundo Claro"
              folder="branding"
              previewShape="wide"
              accept="image/*,.svg"
              value={form().logo_light_url || ""}
              onChange={(next) =>
                setForm((prev) => ({ ...prev, logo_light_url: next }))
              }
            />
            <AdminImageUpload
              label="Logo Fundo Escuro"
              folder="branding"
              previewShape="wide"
              accept="image/*,.svg"
              value={form().logo_dark_url || ""}
              onChange={(next) =>
                setForm((prev) => ({ ...prev, logo_dark_url: next }))
              }
            />
            <AdminImageUpload
              label="Favicon"
              folder="branding"
              accept="image/*,.svg,.ico"
              value={form().favicon_url || ""}
              onChange={(next) =>
                setForm((prev) => ({ ...prev, favicon_url: next }))
              }
            />
          </div>

          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <For
              each={
                [
                  ["primary_color", "Cor Principal"],
                  ["primary_hover_color", "Cor Hover"],
                  ["secondary_color", "Cor Secundária"],
                  ["accent_color", "Cor Destaque"],
                ] as const
              }
            >
              {([field, label]) => (
                <label class="block text-xs font-semibold text-zinc-700">
                  {label}
                  <div class="mt-1 flex items-center gap-2">
                    <input
                      type="color"
                      value={String(form()[field] ?? "#C22583")}
                      onInput={(e) =>
                        setForm((p) => ({
                          ...p,
                          [field]: e.currentTarget.value,
                        }))
                      }
                      class="h-9 w-12 cursor-pointer rounded border border-zinc-300"
                    />
                    <span class="font-mono text-[11px]">
                      {String(form()[field] ?? "")}
                    </span>
                  </div>
                </label>
              )}
            </For>
          </div>

          <h3 class="border-t border-zinc-200 pt-4 text-sm font-bold text-zinc-900">
            2. Contato, Empresa, Frete e Regras Comerciais
          </h3>
          <div class="grid gap-3 sm:grid-cols-2">
            <input
              type="text"
              placeholder="Razão social"
              value={form().company_legal_name ?? ""}
              onInput={(e) =>
                setForm((p) => ({
                  ...p,
                  company_legal_name: e.currentTarget.value,
                }))
              }
              class="h-9 rounded-md border border-zinc-300 px-3 text-sm"
            />
            <input
              type="text"
              placeholder="CNPJ"
              value={form().cnpj ?? ""}
              onInput={(e) =>
                setForm((p) => ({ ...p, cnpj: e.currentTarget.value }))
              }
              class="h-9 rounded-md border border-zinc-300 px-3 text-sm"
            />
            <input
              type="text"
              placeholder="WhatsApp (55119...)"
              value={form().whatsapp_number ?? ""}
              onInput={(e) =>
                setForm((p) => ({
                  ...p,
                  whatsapp_number: e.currentTarget.value,
                }))
              }
              class="h-9 rounded-md border border-zinc-300 px-3 text-sm"
            />
            <input
              type="email"
              placeholder="E-mail de atendimento"
              value={form().email ?? ""}
              onInput={(e) =>
                setForm((p) => ({ ...p, email: e.currentTarget.value }))
              }
              class="h-9 rounded-md border border-zinc-300 px-3 text-sm"
            />
            <input
              type="text"
              placeholder="CEP de origem"
              value={form().origin_cep ?? ""}
              onInput={(e) =>
                setForm((p) => ({ ...p, origin_cep: e.currentTarget.value }))
              }
              class="h-9 rounded-md border border-zinc-300 px-3 text-sm"
            />
            <input
              type="number"
              min="1"
              placeholder="Parcelas sem juros"
              value={form().max_installments ?? 6}
              onInput={(e) =>
                setForm((p) => ({
                  ...p,
                  max_installments: Number(e.currentTarget.value),
                }))
              }
              class="h-9 rounded-md border border-zinc-300 px-3 text-sm"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-zinc-700">
              Mensagens da faixa superior (1 por linha)
            </label>
            <textarea
              rows={3}
              value={tickerText()}
              onInput={(e) => setTickerText(e.currentTarget.value)}
              class="mt-1 w-full rounded-md border border-zinc-300 p-2.5 text-xs"
            />
          </div>

          <div class="flex flex-wrap gap-4 text-xs">
            <label class="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={Boolean(form().popup_enabled)}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    popup_enabled: e.currentTarget.checked,
                  }))
                }
              />
              Exibir Popup Promocional
            </label>
            <label class="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={Boolean(form().wholesale_enabled)}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    wholesale_enabled: e.currentTarget.checked,
                  }))
                }
              />
              Habilitar Desconto Atacado
            </label>
          </div>

          <button
            type="submit"
            class="h-11 rounded-lg bg-[var(--mf-primary)] px-6 text-sm font-bold text-white hover:bg-[var(--mf-primary-hover)]"
          >
            Salvar Identidade e Configurações
          </button>
        </form>

        {/* Encrypted Integrations */}
        <div class="space-y-6 lg:col-span-5">
          <form
            onSubmit={saveMercadoPago}
            class="space-y-3 rounded-xl border border-zinc-200 bg-white p-5"
          >
            <div class="flex items-center justify-between">
              <h2 class="text-base font-bold text-zinc-900">
                Mercado Pago (Pix e Cartão)
              </h2>
              <button
                type="button"
                onClick={() => void runHealthcheck("mercadopago")}
                class="rounded border border-zinc-300 px-2.5 py-1 text-xs font-semibold"
              >
                Testar conexão
              </button>
            </div>
            <select
              value={mpEnv()}
              onChange={(e) =>
                setMpEnv(e.currentTarget.value as "sandbox" | "production")
              }
              class="h-9 w-full rounded-md border border-zinc-300 bg-white px-2.5 text-sm"
            >
              <option value="sandbox">Sandbox (Testes)</option>
              <option value="production">Produção (Homologado)</option>
            </select>
            <input
              type="text"
              placeholder="Public Key"
              value={mpPubKey()}
              onInput={(e) => setMpPubKey(e.currentTarget.value)}
              class="h-9 w-full rounded-md border border-zinc-300 px-3 text-xs"
            />
            <input
              type="password"
              placeholder="Access Token (preencha apenas para atualizar)"
              value={mpToken()}
              onInput={(e) => setMpToken(e.currentTarget.value)}
              class="h-9 w-full rounded-md border border-zinc-300 px-3 text-xs"
            />
            <button
              type="submit"
              class="h-9 rounded-md bg-zinc-900 px-4 text-xs font-bold text-white"
            >
              Salvar Mercado Pago
            </button>
          </form>

          <form
            onSubmit={saveMelhorEnvio}
            class="space-y-3 rounded-xl border border-zinc-200 bg-white p-5"
          >
            <div class="flex items-center justify-between">
              <h2 class="text-base font-bold text-zinc-900">
                Melhor Envio (Cálculo de Frete)
              </h2>
              <button
                type="button"
                onClick={() => void runHealthcheck("melhorenvio")}
                class="rounded border border-zinc-300 px-2.5 py-1 text-xs font-semibold"
              >
                Testar conexão
              </button>
            </div>
            <select
              value={meEnv()}
              onChange={(e) =>
                setMeEnv(e.currentTarget.value as "sandbox" | "production")
              }
              class="h-9 w-full rounded-md border border-zinc-300 bg-white px-2.5 text-sm"
            >
              <option value="sandbox">Sandbox (Testes)</option>
              <option value="production">Produção</option>
            </select>
            <input
              type="password"
              placeholder="Bearer Token Melhor Envio"
              value={meToken()}
              onInput={(e) => setMeToken(e.currentTarget.value)}
              class="h-9 w-full rounded-md border border-zinc-300 px-3 text-xs"
            />
            <button
              type="submit"
              class="h-9 rounded-md bg-zinc-900 px-4 text-xs font-bold text-white"
            >
              Salvar Melhor Envio
            </button>
          </form>

          <section class="rounded-xl border border-zinc-200 bg-white p-5">
            <h3 class="mb-2 text-sm font-bold text-zinc-900">
              Status das Integrações
            </h3>
            <ul class="divide-y divide-zinc-100 text-xs">
              <For each={integrations() ?? []}>
                {(int) => (
                  <li class="flex items-center justify-between py-2">
                    <div>
                      <p class="font-bold uppercase text-zinc-900">
                        {int.provider}
                      </p>
                      <p class="text-zinc-500">
                        {int.environment} ·{" "}
                        {int.has_credentials
                          ? "Credencial configurada"
                          : "Sem credencial"}
                      </p>
                    </div>
                    <span class="rounded bg-zinc-100 px-2 py-0.5 font-semibold">
                      {int.last_healthcheck_status || "pendente"}
                    </span>
                  </li>
                )}
              </For>
            </ul>
          </section>
        </div>
      </div>
    </AdminLayout>
  );
}
