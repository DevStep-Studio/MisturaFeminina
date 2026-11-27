import { createFileRoute } from "@tanstack/solid-router";
import { For, Show, createResource, createSignal } from "solid-js";
import { CheckoutIntegrations } from "../../../features/admin/CheckoutIntegrations";
import { AdminLayout } from "../../../features/admin/AdminLayout";
import { ApiError, api } from "../../../lib/api";
import { formatCents, paymentStatusLabel } from "../../../lib/format";
import { seoHead } from "../../../lib/seo";

export const Route = createFileRoute("/_authenticated/admin/frete-pagamentos")({
  head: () =>
    seoHead({
      title: "Frete e Pagamentos — Admin Mistura Feminina",
      description:
        "Regras de frete, cotações, transações e webhooks Mercado Pago.",
      path: "/admin/frete-pagamentos",
      noindex: true,
    }),
  component: AdminShippingPaymentsPage,
});

interface ShippingRuleRow {
  id: number;
  name: string;
  code: string;
  carrier: string;
  mode: string;
  base_price_cents: number;
  estimated_days: number;
  is_active: boolean;
}

interface RegionalFreeRuleItem {
  id: string;
  name: string;
  ufs: string[];
  min_subtotal_cents: number;
  is_active: boolean;
}

interface RegionalRulesResponse {
  rules: RegionalFreeRuleItem[];
  eligible_service_codes: string[];
  excluded_service_codes: string[];
  notes?: string;
}

interface AdminPaymentRow {
  id: number;
  provider: string;
  method: string;
  status: string;
  environment: string;
  gross_amount_cents: number;
  fee_cents: number;
  net_amount_cents: number;
  order?: { order_number: string; customer_name: string } | null;
}

function AdminShippingPaymentsPage() {
  const [rName, setRName] = createSignal("");
  const [rCode, setRCode] = createSignal("");
  const [rCarrier, setRCarrier] = createSignal("Correios");
  const [rPriceBrl, setRPriceBrl] = createSignal("19.90");
  const [rDays, setRDays] = createSignal(5);
  const [feedback, setFeedback] = createSignal<string | null>(null);

  const [rules, { refetch: refetchRules }] = createResource(async () => {
    const res = await api<{ data: ShippingRuleRow[] }>("/admin/shipping/rules");
    return res.data ?? [];
  });

  const [payments, { refetch: refetchPayments }] = createResource(async () => {
    const res = await api<{ data: AdminPaymentRow[] }>("/admin/payments");
    return res.data ?? [];
  });

  const [regionalRulesState, setRegionalRulesState] = createSignal<RegionalFreeRuleItem[]>([]);
  const [regionalSaving, setRegionalSaving] = createSignal(false);

  const [, { refetch: refetchRegionalRules }] = createResource(async () => {
    try {
      const res = await api<{ data: RegionalRulesResponse }>("/admin/shipping/regional-free-rules");
      const list = res.data?.rules ?? [];
      setRegionalRulesState(list);
      return res.data;
    } catch {
      return null;
    }
  });

  async function saveRegionalRules(e: Event) {
    e.preventDefault();
    setFeedback(null);
    setRegionalSaving(true);
    try {
      await api("/admin/shipping/regional-free-rules", {
        method: "PUT",
        body: {
          rules: regionalRulesState(),
        },
      });
      await refetchRegionalRules();
      setFeedback("Regras de frete grátis regional atualizadas com sucesso!");
    } catch (err) {
      setFeedback(err instanceof ApiError ? err.message : "Erro ao atualizar regras regionais.");
    } finally {
      setRegionalSaving(false);
    }
  }

  function updateRegionMinPrice(id: string, brlValue: string) {
    const cents = Math.max(0, Math.round((parseFloat(brlValue.replace(",", ".")) || 0) * 100));
    setRegionalRulesState((prev) =>
      prev.map((r) => (r.id === id ? { ...r, min_subtotal_cents: cents } : r))
    );
  }

  function toggleRegionActive(id: string, active: boolean) {
    setRegionalRulesState((prev) =>
      prev.map((r) => (r.id === id ? { ...r, is_active: active } : r))
    );
  }

  async function createRule(e: Event) {
    e.preventDefault();
    setFeedback(null);
    try {
      await api("/admin/shipping/rules", {
        method: "POST",
        body: {
          name: rName().trim(),
          code: rCode().trim().toUpperCase(),
          carrier: rCarrier().trim(),
          mode: "table",
          base_price_cents: Math.round(Number(rPriceBrl()) * 100),
          estimated_days: Number(rDays()) || 5,
          is_active: true,
        },
      });
      setRName("");
      setRCode("");
      await refetchRules();
      setFeedback("Regra de frete criada.");
    } catch (err) {
      setFeedback(
        err instanceof ApiError ? err.message : "Erro ao salvar regra.",
      );
    }
  }

  async function deleteRule(id: number) {
    await api(`/admin/shipping/rules/${id}`, { method: "DELETE" });
    await refetchRules();
  }

  async function reconcile(id: number) {
    setFeedback(null);
    const res = await api<{ message?: string }>(
      `/admin/payments/${id}/reconcile`,
      {
        method: "POST",
      },
    );
    await refetchPayments();
    setFeedback(res.message || "Conciliação executada.");
  }

  return (
    <AdminLayout
      title="Frete e Pagamentos"
      subtitle="Tabelas próprias de entrega, cotações e conciliação de transações"
      permission="shipping.view"
    >
      <Show when={feedback()}>
        <p
          role="status"
          class="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800"
        >
          {feedback()}
        </p>
      </Show>

      <CheckoutIntegrations />

      <section class="mb-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-xs">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 class="text-base font-bold text-zinc-900">
              Frete Grátis Automático por Região
            </h2>
            <p class="text-xs text-zinc-500 max-w-2xl">
              Regras progressivas por estado. O <strong>Rio de Janeiro (RJ)</strong> é processado com prioridade máxima antes dos demais estados do Sudeste.
              O benefício aplica-se exclusivamente a modalidades elegíveis (PAC), preservando prazo e valor padrão de Sedex.
            </p>
          </div>
          <button
            type="button"
            disabled={regionalSaving()}
            onClick={(e) => void saveRegionalRules(e)}
            class="h-9 shrink-0 rounded-lg bg-[var(--mf-primary)] px-4 text-xs font-bold text-white transition hover:bg-[#7c3f87] disabled:opacity-50"
          >
            {regionalSaving() ? "Salvando..." : "Salvar Regras Regionais"}
          </button>
        </div>

        <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <For each={regionalRulesState()}>
            {(rule) => (
              <div class="flex flex-col justify-between rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5">
                <div>
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-xs font-extrabold text-[#2E0C49]">
                      {rule.name}
                    </span>
                    <label class="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={rule.is_active}
                        onChange={(e) =>
                          toggleRegionActive(rule.id, e.currentTarget.checked)
                        }
                        class="peer sr-only"
                      />
                      <div class="peer h-5 w-9 rounded-full bg-zinc-300 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-600 peer-checked:after:translate-x-full peer-focus:outline-hidden" />
                    </label>
                  </div>
                  <div class="mt-2 flex flex-wrap gap-1">
                    <For each={rule.ufs}>
                      {(uf) => (
                        <span class="rounded bg-white px-1.5 py-0.5 text-[10px] font-mono font-bold text-zinc-700 border border-zinc-200">
                          {uf}
                        </span>
                      )}
                    </For>
                  </div>
                </div>

                <div class="mt-4 border-t border-zinc-200/60 pt-3">
                  <label class="block text-[11px] font-semibold text-zinc-600 mb-1">
                    Valor Mínimo (R$):
                  </label>
                  <div class="relative">
                    <span class="absolute left-2.5 top-2 text-xs text-zinc-500 font-medium">
                      R$
                    </span>
                    <input
                      type="number"
                      step="0.10"
                      min="0"
                      value={(rule.min_subtotal_cents / 100).toFixed(2)}
                      onInput={(e) =>
                        updateRegionMinPrice(rule.id, e.currentTarget.value)
                      }
                      class="h-8 w-full rounded-md border border-zinc-300 bg-white pl-8 pr-2 text-xs font-bold text-zinc-900 focus:border-[var(--mf-primary)] focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>
            )}
          </For>
        </div>
      </section>
      <div class="grid gap-6 lg:grid-cols-2">
        <section class="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
          <h2 class="text-base font-bold text-zinc-900">
            Regras de Frete / Contingência
          </h2>
          <form
            onSubmit={createRule}
            class="grid gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50 p-3.5 text-sm sm:grid-cols-2"
          >
            <input
              type="text"
              required
              placeholder="Nome (ex.: Motoboy Capital)"
              value={rName()}
              onInput={(e) => setRName(e.currentTarget.value)}
              class="h-9 rounded-md border border-zinc-300 bg-white px-3"
            />
            <input
              type="text"
              required
              placeholder="Código (ex.: MOTOBOY_SP)"
              value={rCode()}
              onInput={(e) => setRCode(e.currentTarget.value.toUpperCase())}
              class="h-9 rounded-md border border-zinc-300 bg-white px-3 uppercase"
            />
            <input
              type="text"
              required
              placeholder="Transportadora"
              value={rCarrier()}
              onInput={(e) => setRCarrier(e.currentTarget.value)}
              class="h-9 rounded-md border border-zinc-300 bg-white px-3"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Valor base R$"
              value={rPriceBrl()}
              onInput={(e) => setRPriceBrl(e.currentTarget.value)}
              class="h-9 rounded-md border border-zinc-300 bg-white px-3"
            />
            <input
              type="number"
              min="0"
              placeholder="Prazo (dias úteis)"
              value={rDays()}
              onInput={(e) => setRDays(Number(e.currentTarget.value))}
              class="h-9 rounded-md border border-zinc-300 bg-white px-3"
            />
            <button
              type="submit"
              class="h-9 rounded-md bg-[var(--mf-primary)] text-xs font-bold text-white"
            >
              Adicionar regra
            </button>
          </form>

          <ul class="divide-y divide-zinc-100 text-sm">
            <For each={rules() ?? []}>
              {(r) => (
                <li class="flex items-center justify-between py-2.5">
                  <div>
                    <p class="font-bold text-zinc-900">
                      {r.name} ({r.code})
                    </p>
                    <p class="text-xs text-zinc-500">
                      {r.carrier} · Base {formatCents(r.base_price_cents)} ·{" "}
                      {r.estimated_days} dias úteis
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void deleteRule(r.id)}
                    class="text-xs font-semibold text-red-700 hover:underline"
                  >
                    Remover
                  </button>
                </li>
              )}
            </For>
          </ul>
        </section>

        <section class="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 class="mb-3 text-base font-bold text-zinc-900">
            Pagamentos e Conciliação
          </h2>
          <div class="space-y-2.5 text-sm">
            <For each={payments() ?? []}>
              {(pay) => (
                <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 p-3">
                  <div>
                    <p class="font-bold text-zinc-900">
                      {pay.order?.order_number || `Pagamento #${pay.id}`} ·{" "}
                      {pay.provider} · {pay.method.toUpperCase()}
                    </p>
                    <p class="text-xs text-zinc-500">
                      {paymentStatusLabel(pay.status)} ({pay.environment}) ·
                      Bruto {formatCents(pay.gross_amount_cents)} · Líquido{" "}
                      {formatCents(pay.net_amount_cents)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void reconcile(pay.id)}
                    class="rounded border border-zinc-300 px-3 py-1 text-xs font-semibold hover:bg-zinc-50"
                  >
                    Conciliar
                  </button>
                </div>
              )}
            </For>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
