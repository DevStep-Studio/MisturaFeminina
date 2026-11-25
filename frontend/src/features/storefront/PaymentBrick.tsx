import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { loadMercadoPago } from "./mercado-pago";
import type { BrickController, BrickForm } from "./mercado-pago";
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

export function PaymentBrick(props: {
  publicKey: string;
  order: Order;
  method: Method;
  onUpdated: () => Promise<PaymentOutcome | null>;
}) {
  const id = `payment-${crypto.randomUUID()}`;
  let key = crypto.randomUUID();
  let disposed = false;
  let controller: BrickController | undefined;
  let submission: Promise<void> | undefined;
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(true);
  const [submitting, setSubmitting] = createSignal(false);
  const [retryRequired, setRetryRequired] = createSignal(false);
  const [awaitingStatus, setAwaitingStatus] = createSignal(false);

  async function submit(formData: BrickForm) {
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
            payment_data: {
              card_token: formData.token,
              payment_method_id: formData.payment_method_id,
              issuer_id: formData.issuer_id
                ? String(formData.issuer_id)
                : undefined,
              installments: 1,
            },
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
      throw new Error("Pagamento não confirmado");
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

  async function mountBrick() {
    try {
      const MercadoPago = await loadMercadoPago();
      if (disposed) return;
      const mp = new MercadoPago(props.publicKey, { locale: "pt-BR" });
      const methods =
        props.method === "pix"
          ? { bankTransfer: ["pix"] }
          : props.method === "boleto"
            ? { ticket: ["bolbradesco"] }
            : { creditCard: "all", maxInstallments: 1, minInstallments: 1 };
      const instance = await mp.bricks().create("payment", id, {
        initialization: { amount: props.order.total_cents / 100 },
        customization: { paymentMethods: methods },
        callbacks: {
          onReady: () => {
            if (!disposed) setLoading(false);
          },
          onError: () => {
            if (!disposed) {
              setLoading(false);
              setError(
                (current) =>
                  current ||
                  "Não foi possível carregar o pagamento. Atualize a página ou consulte seu pedido.",
              );
            }
          },
          onSubmit: ({ formData }: { formData: BrickForm }) => {
            submission ??= submit(formData).finally(() => {
              submission = undefined;
            });
            return submission;
          },
        },
      });
      if (disposed) await instance.unmount();
      else controller = instance;
    } catch {
      if (!disposed) {
        setLoading(false);
        setError(
          (current) =>
            current ||
            "Formulário indisponível. Você pode atualizar a página e consultar o pedido.",
        );
      }
    }
  }

  async function retry() {
    if (submitting() || loading() || disposed) return;
    setLoading(true);
    try {
      await controller?.unmount();
      controller = undefined;
      if (disposed) return;
      key = crypto.randomUUID();
      setError("");
      setRetryRequired(false);
      await mountBrick();
    } catch {
      if (!disposed) {
        setLoading(false);
        setError(
          "Não foi possível reiniciar o formulário. Consulte o status do pedido.",
        );
      }
    }
  }

  onMount(() => {
    void mountBrick();
  });
  onCleanup(() => {
    disposed = true;
    void controller?.unmount();
  });
  return (
    <div aria-busy={submitting()}>
      <Show when={loading()}>
        <p role="status" class="py-4 text-sm text-zinc-600">
          Carregando formulário seguro…
        </p>
      </Show>
      <div
        id={id}
        hidden={retryRequired() || awaitingStatus()}
        inert={submitting()}
      />
      <Show when={submitting()}>
        <p role="status" class="mt-4 text-sm text-zinc-600">
          Confirmando pagamento…
        </p>
      </Show>
      <Show when={error()}>
        <p role="alert" class="mt-4 text-sm text-red-700">
          {error()}
        </p>
      </Show>
      <Show when={retryRequired()}>
        <button
          type="button"
          disabled={submitting() || loading()}
          onClick={() => void retry()}
          class="mt-4 rounded-lg bg-[var(--mf-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Tentar novamente
        </button>
      </Show>
    </div>
  );
}
