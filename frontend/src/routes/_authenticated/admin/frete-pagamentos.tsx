import { createFileRoute } from "@tanstack/solid-router";
import { For, Show, createResource, createSignal } from "solid-js";
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

interface AdminPaymentRow {
  id: number;
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
                      {pay.method.toUpperCase()}
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
