import {
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import {
  loadMercadoPago,
  type CardFormController,
  type TokenizedCard,
} from "./mercado-pago";

export function CardPaymentFields(props: {
  formId: string;
  publicKey: string;
  amountCents: number;
  customerName?: string;
  customerEmail?: string;
  customerDocument?: string;
  onReady: (ready: boolean) => void;
  onSubmit: (data: TokenizedCard) => Promise<unknown>;
}) {
  const id = `card-${crypto.randomUUID()}`;
  const [error, setError] = createSignal("");
  const [ready, setReady] = createSignal(false);
  const configuration = createMemo(
    () => `${props.publicKey}|${props.amountCents}`,
  );
  let documentType: HTMLSelectElement | undefined;
  const inputClass =
    "h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus:border-[var(--mf-primary)] focus:outline-none";
  const fieldClass =
    "h-11 w-full overflow-hidden rounded-lg border border-zinc-300 bg-white px-3 py-3";
  const setDocumentType = () => {
    if (documentType)
      documentType.value =
        (props.customerDocument?.replace(/\D/g, "").length ?? 0) > 11
          ? "CNPJ"
          : "CPF";
  };
  createEffect(() => {
    void props.customerDocument;
    setDocumentType();
  });

  onMount(() => {
    createEffect(
      on(configuration, () => {
        const publicKey = props.publicKey;
        const amount = props.amountCents;
        let disposed = false;
        let controller: CardFormController | undefined;
        let inFlight: Promise<unknown> | undefined;
        setReady(false);
        props.onReady(false);
        setError("");
        void (async () => {
          try {
            const MercadoPago = await loadMercadoPago();
            if (disposed) return;
            const mp = new MercadoPago(publicKey, { locale: "pt-BR" });
            controller = mp.cardForm({
              amount: (amount / 100).toFixed(2),
              iframe: true,
              form: {
                id: props.formId,
                cardNumber: {
                  id: `${id}-number`,
                  placeholder: "Número do cartão",
                },
                expirationDate: { id: `${id}-expiry`, placeholder: "MM/AA" },
                securityCode: { id: `${id}-cvv`, placeholder: "CVV" },
                cardholderName: {
                  id: `${id}-name`,
                  placeholder: "Nome como está no cartão",
                },
                cardholderEmail: { id: `${id}-email` },
                issuer: { id: `${id}-issuer`, placeholder: "Banco emissor" },
                installments: { id: `${id}-installments` },
                identificationType: { id: `${id}-document-type` },
                identificationNumber: { id: `${id}-document` },
              },
              callbacks: {
                onReady: () => {
                  if (disposed) return;
                  setDocumentType();
                  setReady(true);
                  props.onReady(true);
                },
                onFormMounted: (reason?: unknown) => {
                  if (reason && !disposed)
                    setError(
                      "Não foi possível carregar os campos seguros do cartão. Atualize a página ou escolha outro meio de pagamento.",
                    );
                },
                onError: () => {
                  if (!disposed)
                    setError(
                      "Confira os dados do cartão, o nome do titular e o CPF ou CNPJ informado.",
                    );
                },
                onSubmit: (event: Event) => {
                  event.preventDefault();
                  if (disposed || !controller || inFlight) return;
                  const data = controller.getCardFormData();
                  if (!data.token || !data.paymentMethodId) {
                    setError(
                      "Preencha e confira os campos do cartão antes de continuar.",
                    );
                    return;
                  }
                  setError("");
                  inFlight = props
                    .onSubmit({
                      card_token: data.token,
                      payment_method_id: data.paymentMethodId,
                      issuer_id: data.issuerId
                        ? String(data.issuerId)
                        : undefined,
                      installments: 1,
                    })
                    .catch(() => {
                      // The owner displays the payment result; keep SDK validation separate.
                    })
                    .finally(() => {
                      inFlight = undefined;
                    });
                },
              },
            });
          } catch {
            if (!disposed)
              setError(
                "Formulário de cartão indisponível. Atualize a página ou escolha outro meio de pagamento.",
              );
          }
        })();
        onCleanup(() => {
          disposed = true;
          props.onReady(false);
          void controller?.unmount();
        });
      }),
    );
  });

  return (
    <div
      class="mt-5 space-y-4"
      aria-label="Dados do cartão"
      aria-busy={!ready()}
    >
      <Show when={!ready() && !error()}>
        <p role="status" class="text-sm text-zinc-600">
          Carregando campos seguros do cartão…
        </p>
      </Show>
      <div>
        <label
          for={`${id}-name`}
          class="mb-1 block text-xs font-semibold text-zinc-700"
        >
          Nome no cartão
        </label>
        <input
          id={`${id}-name`}
          class={inputClass}
          value={props.customerName ?? ""}
          autocomplete="cc-name"
          required
        />
      </div>
      <div>
        <span
          id={`${id}-number-label`}
          class="mb-1 block text-xs font-semibold text-zinc-700"
        >
          Número do cartão
        </span>
        <div
          id={`${id}-number`}
          aria-labelledby={`${id}-number-label`}
          class={fieldClass}
        />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <span
            id={`${id}-expiry-label`}
            class="mb-1 block text-xs font-semibold text-zinc-700"
          >
            Validade
          </span>
          <div
            id={`${id}-expiry`}
            aria-labelledby={`${id}-expiry-label`}
            class={fieldClass}
          />
        </div>
        <div>
          <span
            id={`${id}-cvv-label`}
            class="mb-1 block text-xs font-semibold text-zinc-700"
          >
            Código de segurança
          </span>
          <div
            id={`${id}-cvv`}
            aria-labelledby={`${id}-cvv-label`}
            class={fieldClass}
          />
        </div>
      </div>
      <div>
        <label
          for={`${id}-issuer`}
          class="mb-1 block text-xs font-semibold text-zinc-700"
        >
          Banco emissor
        </label>
        <select id={`${id}-issuer`} class={inputClass} />
      </div>
      <input
        id={`${id}-email`}
        type="hidden"
        value={props.customerEmail ?? ""}
      />
      <input
        id={`${id}-document`}
        type="hidden"
        value={props.customerDocument?.replace(/\D/g, "") ?? ""}
      />
      <select
        id={`${id}-document-type`}
        ref={documentType}
        hidden
        aria-hidden="true"
      />
      <select id={`${id}-installments`} hidden aria-hidden="true" />
      <p class="text-xs text-zinc-600">
        Pagamento à vista. O número do cartão, a validade e o código de
        segurança são protegidos pelo Mercado Pago.
      </p>
      <Show when={error()}>
        <p role="alert" class="text-sm text-red-700">
          {error()}
        </p>
      </Show>
    </div>
  );
}
