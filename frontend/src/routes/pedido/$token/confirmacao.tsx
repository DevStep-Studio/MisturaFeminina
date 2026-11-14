import { createFileRoute, Link } from "@tanstack/solid-router";
import Check from "lucide-solid/icons/check";
import CheckCircle2 from "lucide-solid/icons/circle-check";
import Clock from "lucide-solid/icons/clock";
import Copy from "lucide-solid/icons/copy";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import XCircle from "lucide-solid/icons/circle-x";
import {
  For,
  Show,
  createResource,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { StoreShell } from "../../../features/storefront/components/StoreShell";
import { storefrontStore } from "../../../features/storefront/store";
import { ApiError, api } from "../../../lib/api";
import {
  formatCents,
  orderStatusLabel,
  paymentStatusLabel,
} from "../../../lib/format";
import { seoHead } from "../../../lib/seo";

export const Route = createFileRoute("/pedido/$token/confirmacao")({
  head: ({ params }) =>
    seoHead({
      title: "Confirmação do Pedido — Mistura Feminina Cosméticos",
      description: "Acompanhe o pagamento e status do seu pedido.",
      path: `/pedido/${params.token}/confirmacao`,
      noindex: true,
    }),
  component: OrderConfirmationPage,
});

interface PublicOrderPayload {
  order: {
    order_number: string;
    public_token: string;
    status: string;
    customer_first_name: string;
    subtotal_cents: number;
    discount_cents: number;
    shipping_cents: number;
    total_cents: number;
    shipping_city: string | null;
    shipping_state: string | null;
    shipping_service: { service_name?: string; carrier?: string } | null;
    paid_at: string | null;
    created_at: string | null;
    items: {
      id: number;
      product_name: string;
      variant_name: string;
      sku: string;
      quantity: number;
      unit_price_cents: number;
      total_cents: number;
    }[];
  };
  payment: {
    id: number;
    provider: string;
    environment: string;
    method: string;
    installments: number;
    gross_amount_cents: number;
    status: string;
    pix_qr_code_base64: string | null;
    pix_copy_paste: string | null;
    pix_expires_at: string | null;
    card_last_four: string | null;
    card_brand: string | null;
    failure_reason: string | null;
    paid_at: string | null;
  } | null;
}

function pixQrSrc(raw: string): string {
  if (raw.startsWith("data:")) return raw;
  if (raw.startsWith("PHN2") || raw.startsWith("PD94")) {
    return `data:image/svg+xml;base64,${raw}`;
  }
  return `data:image/png;base64,${raw}`;
}

function OrderConfirmationPage() {
  const params = Route.useParams();
  const settings = () => storefrontStore.settings();
  const [copied, setCopied] = createSignal(false);
  const [actionBusy, setActionBusy] = createSignal(false);
  const [actionMsg, setActionMsg] = createSignal<string | null>(null);

  const [data, { refetch }] = createResource(
    () => params().token,
    async (token) => {
      const res = await api<{ data: PublicOrderPayload }>(
        `/orders/track/${token}`,
        {
          authenticated: false,
        },
      );
      return res.data;
    },
  );

  onMount(() => {
    const id = window.setInterval(() => {
      const current = data();
      if (
        current &&
        current.payment &&
        ["pending", "in_process"].includes(current.payment.status)
      ) {
        void refetch();
      }
    }, 5000);
    onCleanup(() => window.clearInterval(id));
  });

  async function copyPix(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function simulateSandbox(outcome: "approved" | "rejected" | "expired") {
    setActionBusy(true);
    setActionMsg(null);
    try {
      await api(`/sandbox/orders/${params().token}/simulate-payment`, {
        method: "POST",
        authenticated: false,
        body: { outcome },
      });
      await refetch();
      setActionMsg(`Simulação sandbox executada (${outcome}).`);
    } catch (err) {
      setActionMsg(
        err instanceof ApiError
          ? err.message
          : "Não foi possível simular em sandbox.",
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function retryAsPix() {
    setActionBusy(true);
    setActionMsg(null);
    try {
      await api(`/orders/${params().token}/retry-payment`, {
        method: "POST",
        authenticated: false,
        body: { payment_method: "pix" },
      });
      await refetch();
      setActionMsg("Novo pagamento Pix gerado para o seu pedido.");
    } catch (err) {
      setActionMsg(
        err instanceof ApiError
          ? err.message
          : "Não foi possível gerar nova tentativa.",
      );
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <StoreShell>
      <div class="mx-auto max-w-4xl px-4 py-8">
        <Show when={data.loading}>
          <div class="h-72 animate-pulse rounded-2xl bg-zinc-100" />
        </Show>

        <Show when={data.error}>
          <div class="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
            <h1 class="text-xl font-bold text-red-900">
              Pedido não encontrado
            </h1>
            <p class="mt-2 text-sm text-red-700">
              Verifique o link recebido ou consulte na página de rastreamento.
            </p>
            <Link
              to="/rastrear-pedido"
              class="mt-4 inline-block rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white"
            >
              Rastrear Pedido
            </Link>
          </div>
        </Show>

        <Show when={data()}>
          {(payload) => {
            const order = () => payload().order;
            const payment = () => payload().payment;
            const isApproved = () => payment()?.status === "approved";
            const isFailed = () =>
              ["rejected", "cancelled", "expired"].includes(
                payment()?.status || "",
              );

            return (
              <div class="space-y-6">
                <section class="rounded-2xl border border-zinc-200 bg-white p-6">
                  <div class="flex flex-wrap items-start justify-between gap-4">
                    <div class="flex items-start gap-3">
                      <Show
                        when={isApproved()}
                        fallback={
                          isFailed() ? (
                            <XCircle class="h-8 w-8 shrink-0 text-red-600" />
                          ) : (
                            <Clock class="h-8 w-8 shrink-0 text-amber-600" />
                          )
                        }
                      >
                        <CheckCircle2 class="h-8 w-8 shrink-0 text-emerald-600" />
                      </Show>
                      <div>
                        <p class="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Pedido {order().order_number}
                        </p>
                        <h1 class="text-2xl font-bold text-zinc-900">
                          {isApproved()
                            ? `Pagamento confirmado, ${order().customer_first_name}!`
                            : isFailed()
                              ? "Pagamento não aprovado"
                              : `Pedido registrado, ${order().customer_first_name}!`}
                        </h1>
                        <p class="mt-1 text-sm text-zinc-600">
                          Status do pedido:{" "}
                          <strong>{orderStatusLabel(order().status)}</strong>
                          <Show when={payment()}>
                            {" "}
                            · Pagamento:{" "}
                            <strong>
                              {paymentStatusLabel(payment()!.status)}
                            </strong>
                          </Show>
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void refetch()}
                      class="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                    >
                      <RefreshCw class="h-3.5 w-3.5" />
                      Atualizar status
                    </button>
                  </div>

                  {/* Pix QR & Copy/Paste */}
                  <Show
                    when={
                      payment()?.method === "pix" &&
                      !isApproved() &&
                      !isFailed() &&
                      payment()?.pix_copy_paste
                    }
                  >
                    <div class="mt-6 grid gap-6 rounded-xl border border-zinc-200 bg-zinc-50 p-5 md:grid-cols-[200px_1fr]">
                      <div class="flex items-center justify-center rounded-lg border border-zinc-200 bg-white p-3">
                        <Show
                          when={payment()?.pix_qr_code_base64}
                          fallback={
                            <span class="text-xs text-zinc-500">
                              QR Code Pix
                            </span>
                          }
                        >
                          <img
                            src={pixQrSrc(payment()!.pix_qr_code_base64!)}
                            alt="QR Code Pix para pagamento"
                            class="h-44 w-44 object-contain"
                          />
                        </Show>
                      </div>
                      <div class="space-y-3">
                        <h2 class="text-base font-bold text-zinc-900">
                          Pague com Pix usando QR Code ou Copia e Cola
                        </h2>
                        <p class="text-sm text-zinc-600">
                          Valor exato:{" "}
                          <strong>{formatCents(order().total_cents)}</strong>.
                          Esta página atualiza automaticamente após a
                          confirmação.
                        </p>
                        <div class="flex flex-col gap-2 sm:flex-row">
                          <input
                            type="text"
                            readOnly
                            value={payment()!.pix_copy_paste!}
                            aria-label="Código Pix copia e cola"
                            class="h-10 min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 font-mono text-xs text-zinc-800"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              void copyPix(payment()!.pix_copy_paste!)
                            }
                            class="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-md bg-[var(--mf-primary)] px-4 text-xs font-semibold text-white hover:bg-[var(--mf-primary-hover)]"
                          >
                            <Show
                              when={copied()}
                              fallback={<Copy class="h-3.5 w-3.5" />}
                            >
                              <Check class="h-3.5 w-3.5" />
                            </Show>
                            {copied() ? "Código copiado!" : "Copiar código Pix"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </Show>

                  {/* Retry failed payment */}
                  <Show when={isFailed()}>
                    <div class="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                      <p class="font-semibold">
                        Motivo:{" "}
                        {payment()?.failure_reason ||
                          "Pagamento recusado ou expirado."}
                      </p>
                      <button
                        type="button"
                        disabled={actionBusy()}
                        onClick={() => void retryAsPix()}
                        class="mt-3 rounded-lg bg-[var(--mf-primary)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--mf-primary-hover)]"
                      >
                        Tentar novamente com Pix
                      </button>
                    </div>
                  </Show>

                  {/* Sandbox Simulator Banner */}
                  <Show
                    when={
                      (settings().payment_sandbox_mode ||
                        payment()?.environment === "sandbox") &&
                      !isApproved()
                    }
                  >
                    <div class="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
                      <p class="text-xs font-bold uppercase tracking-wide text-amber-900">
                        Controles de Simulação Sandbox (
                        {payment()?.environment || "sandbox"})
                      </p>
                      <p class="mt-1 text-xs text-amber-800">
                        Use os botões abaixo para validar o webhook/confirmação
                        de pagamento, baixa definitiva do estoque e histórico do
                        pedido em ambiente de testes.
                      </p>
                      <div class="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={actionBusy()}
                          onClick={() => void simulateSandbox("approved")}
                          class="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                        >
                          Simular Pagamento Aprovado
                        </button>
                        <button
                          type="button"
                          disabled={actionBusy()}
                          onClick={() => void simulateSandbox("rejected")}
                          class="rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800"
                        >
                          Simular Recusa
                        </button>
                      </div>
                    </div>
                  </Show>

                  <Show when={actionMsg()}>
                    <p
                      role="status"
                      class="mt-3 text-xs font-semibold text-zinc-800"
                    >
                      {actionMsg()}
                    </p>
                  </Show>
                </section>

                {/* Order Items */}
                <section class="rounded-2xl border border-zinc-200 bg-white p-6">
                  <h2 class="text-base font-bold text-zinc-900">
                    Itens do pedido
                  </h2>
                  <ul class="mt-4 divide-y divide-zinc-200">
                    <For each={order().items}>
                      {(item) => (
                        <li class="flex items-center justify-between py-3 text-sm">
                          <div>
                            <p class="font-semibold text-zinc-900">
                              {item.quantity}x {item.product_name}
                            </p>
                            <p class="text-xs text-zinc-500">
                              {item.variant_name} · SKU {item.sku}
                            </p>
                          </div>
                          <span class="font-bold text-zinc-900">
                            {formatCents(item.total_cents)}
                          </span>
                        </li>
                      )}
                    </For>
                  </ul>

                  <dl class="mt-4 space-y-1.5 border-t border-zinc-200 pt-4 text-sm">
                    <div class="flex justify-between text-zinc-600">
                      <dt>Subtotal</dt>
                      <dd>{formatCents(order().subtotal_cents)}</dd>
                    </div>
                    <Show when={order().discount_cents > 0}>
                      <div class="flex justify-between text-emerald-700">
                        <dt>Desconto</dt>
                        <dd>-{formatCents(order().discount_cents)}</dd>
                      </div>
                    </Show>
                    <div class="flex justify-between text-zinc-600">
                      <dt>Frete</dt>
                      <dd>
                        {order().shipping_cents === 0
                          ? "Grátis"
                          : formatCents(order().shipping_cents)}
                      </dd>
                    </div>
                    <div class="flex justify-between pt-2 text-base font-extrabold text-zinc-900">
                      <dt>Total</dt>
                      <dd>{formatCents(order().total_cents)}</dd>
                    </div>
                  </dl>

                  <div class="mt-6 flex flex-wrap gap-3">
                    <Link
                      to="/rastrear-pedido"
                      class="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
                    >
                      Acompanhar rastreamento completo
                    </Link>
                    <Link
                      to="/"
                      class="rounded-lg bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-zinc-800"
                    >
                      Voltar à loja
                    </Link>
                  </div>
                </section>
              </div>
            );
          }}
        </Show>
      </div>
    </StoreShell>
  );
}
