import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { loadMercadoPago } from "./mercado-pago";
import type { BrickController, BrickForm } from "./mercado-pago";
import { api } from "../../lib/api";
type Method = "pix" | "credit_card" | "boleto";
interface Order {
  public_token: string;
  total_cents: number;
}
export function PaymentBrick(props: {
  publicKey: string;
  order: Order;
  method: Method;
  onUpdated: () => Promise<unknown>;
}) {
  const id = `payment-${crypto.randomUUID()}`;
  const key = crypto.randomUUID();
  let disposed = false;
  let controller: BrickController | undefined;
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(true);
  onMount(() => {
    void (async () => {
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
                  "Não foi possível carregar o pagamento. Atualize a página ou consulte seu pedido.",
                );
              }
            },
            onSubmit: async ({ formData }: { formData: BrickForm }) => {
              try {
                await api(`/orders/${props.order.public_token}/retry-payment`, {
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
                });
                await props.onUpdated();
              } catch {
                if (!disposed)
                  setError(
                    "Não foi possível confirmar o pagamento. Consulte o status do pedido antes de tentar novamente.",
                  );
                await props.onUpdated();
                throw new Error("Pagamento não confirmado");
              }
            },
          },
        });
        if (disposed) await instance.unmount();
        else controller = instance;
      } catch {
        if (!disposed) {
          setLoading(false);
          setError(
            "Formulário indisponível. Você pode atualizar a página e consultar o pedido.",
          );
        }
      }
    })();
  });
  onCleanup(() => {
    disposed = true;
    void controller?.unmount();
  });
  return (
    <div>
      <Show when={loading()}>
        <p role="status" class="py-4 text-sm text-zinc-600">
          Carregando formulário seguro…
        </p>
      </Show>
      <div id={id} />
      <Show when={error()}>
        <p role="alert" class="mt-4 text-sm text-red-700">
          {error()}
        </p>
      </Show>
    </div>
  );
}
