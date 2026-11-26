import { createSignal, onCleanup, Show, untrack } from "solid-js";
import { CardPaymentFields } from "./CardPaymentFields";
import type { TokenizedCard } from "./mercado-pago";
import { api, ApiError } from "../../lib/api";

type Method = "pix" | "credit_card" | "boleto";
interface Order {
  public_token: string;
  total_cents: number;
}
export interface PaymentOutcome {
  status: string;
  failure_reason?: string | null;
}
const CONFIRMING =
  "Estamos confirmando o pagamento com o provedor. Atualize o status antes de tentar novamente.";
const isTerminalFailure = (payment: PaymentOutcome | null) =>
  !!payment && ["failed", "rejected"].includes(payment.status);

export function PaymentForm(props: {
  publicKey: string;
  order: Order;
  method: Method;
  failureReason?: string | null;
  onUpdated: () => Promise<PaymentOutcome | null>;
}) {
  const id = `payment-${crypto.randomUUID()}`;
  let key = crypto.randomUUID();
  let disposed = false;
  let submission: Promise<void> | undefined;
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(
    untrack(() => props.method === "credit_card"),
  );
  const [generation, setGeneration] = createSignal(1);
  const [email, setEmail] = createSignal("");
  const [document, setDocument] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
  const [retryRequired, setRetryRequired] = createSignal(false);
  const [awaitingStatus, setAwaitingStatus] = createSignal(false);

  async function submit(paymentData?: TokenizedCard) {
    if (retryRequired() || awaitingStatus() || disposed) return;
    setSubmitting(true);
    setError("");
    let payment: PaymentOutcome | null;
    try {
      const response = await api<{ data: { payment: PaymentOutcome | null } }>(
        `/orders/${props.order.public_token}/retry-payment`,
        {
          method: "POST",
          authenticated: false,
          timeoutMs: 90000,
          headers: { "X-Idempotency-Key": key },
          body: {
            payment_method: props.method,
            payment_data: paymentData,
          },
        },
      );
      payment = response.data.payment;
    } catch (reason) {
      // Reconcile before offering another attempt after an interrupted request.
      const current = await props.onUpdated().catch(() => null);
      const definitive =
        reason instanceof ApiError && [400, 419, 422].includes(reason.status);
      if (!disposed) {
        if (definitive && (!current || isTerminalFailure(current))) {
          setRetryRequired(true);
          setError(reason.message);
        } else {
          setAwaitingStatus(true);
          setError(CONFIRMING);
        }
        setSubmitting(false);
      }
      throw new Error("Pagamento não confirmado", { cause: reason });
    }
    if (!disposed) {
      if (isTerminalFailure(payment)) {
        setRetryRequired(true);
        setError(
          payment?.failure_reason ||
            "Pagamento não autorizado. Confira os dados ou use outro meio de pagamento.",
        );
      } else if (
        !payment ||
        ["unknown", "processing", "pending"].includes(payment.status)
      ) {
        setAwaitingStatus(true);
        setError(CONFIRMING);
      }
    }
    // A failed status refresh must never turn an accepted charge into a new attempt.
    await props.onUpdated().catch(() => {
      if (!disposed && !isTerminalFailure(payment)) {
        setAwaitingStatus(true);
        setError(CONFIRMING);
      }
    });
    if (!disposed) setSubmitting(false);
    if (isTerminalFailure(payment) || !payment)
      throw new Error("Pagamento não confirmado");
  }

  function retry() {
    if (submitting() || loading() || disposed) return;
    key = crypto.randomUUID();
    setError("");
    setRetryRequired(false);
    setLoading(props.method === "credit_card");
    setGeneration((current) => current + 1);
  }
  const send = (data?: TokenizedCard) => {
    submission ??= submit(data).finally(() => {
      submission = undefined;
    });
    return submission;
  };
  onCleanup(() => {
    disposed = true;
  });
  return (
    <div aria-busy={submitting()}>
      <Show when={loading()}>
        <p role="status" class="py-4 text-sm text-zinc-600">
          Carregando formulário seguro…
        </p>
      </Show>
      <form
        id={id}
        hidden={retryRequired() || awaitingStatus()}
        inert={submitting()}
        onSubmit={(event) => {
          event.preventDefault();
          if (props.method !== "credit_card") void send().catch(() => {});
        }}
      >
        <Show when={props.method === "credit_card"}>
          <div class="mt-3 grid gap-3 sm:grid-cols-2">
            <label class="text-xs font-semibold text-zinc-700">
              E-mail do pagador
              <input
                type="email"
                required
                value={email()}
                onInput={(event) => setEmail(event.currentTarget.value)}
                class="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm"
              />
            </label>
            <label class="text-xs font-semibold text-zinc-700">
              CPF ou CNPJ do pagador
              <input
                required
                inputmode="numeric"
                value={document()}
                onInput={(event) => setDocument(event.currentTarget.value)}
                class="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm"
              />
            </label>
          </div>
          <Show when={generation()} keyed>
            {(_generation) => (
              <CardPaymentFields
                formId={id}
                publicKey={props.publicKey}
                amountCents={props.order.total_cents}
                customerEmail={email()}
                customerDocument={document()}
                onReady={(ready) => setLoading(!ready)}
                onSubmit={send}
              />
            )}
          </Show>
        </Show>
        <button
          type="submit"
          disabled={submitting() || loading()}
          class="mt-5 rounded-lg bg-[var(--mf-primary)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {props.method === "credit_card"
            ? "Pagar com cartão"
            : props.method === "pix"
              ? "Gerar Pix"
              : "Gerar boleto"}
        </button>
      </form>
      <Show when={submitting()}>
        <p role="status" class="mt-4 text-sm text-zinc-600">
          Confirmando pagamento…
        </p>
      </Show>
      <Show when={error() && error() !== props.failureReason}>
        <p role="alert" class="mt-4 text-sm text-red-700">
          {error()}
        </p>
      </Show>
      <Show when={retryRequired()}>
        <button
          type="button"
          disabled={submitting() || loading()}
          onClick={retry}
          class="mt-4 rounded-lg bg-[var(--mf-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Tentar novamente
        </button>
      </Show>
    </div>
  );
}
