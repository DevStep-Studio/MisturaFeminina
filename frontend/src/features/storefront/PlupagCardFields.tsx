import {
  createEffect,
  createResource,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { api } from "../../lib/api";

export interface PlupagCardData {
  card_holder: string;
  card_number: string;
  card_month: string;
  card_year: string;
  card_cvv: string;
  installments: number;
  session_id?: string;
  card_last_four: string;
}

export function PlupagCardFields(props: {
  amountCents: number;
  customerName?: string;
  publicKey?: string | null;
  onReady: (ready: boolean) => void;
  onChange: (data: PlupagCardData | null) => void;
}) {
  const [holder, setHolder] = createSignal(props.customerName ?? "");
  const [number, setNumber] = createSignal("");
  const [expiry, setExpiry] = createSignal("");
  const [cvv, setCvv] = createSignal("");
  const [installments, setInstallments] = createSignal(1);
  const [sessionId, setSessionId] = createSignal<string | undefined>();
  const [error, setError] = createSignal<string | null>(null);

  // Consulta de simulação de parcelamento na Plupag se o backend estiver disponível
  const [installmentOptions] = createResource(
    () => props.amountCents,
    async (cents) => {
      if (cents <= 0) return [];
      try {
        const res = await api<{
          data: {
            options: Array<{
              installmentCount: number;
              perInstallment: number;
              finalAmount: number;
              hasInterest: boolean;
              description: string;
            }>;
          };
        }>(`/checkout/plupag/installments?amount_cents=${cents}`, {
          authenticated: false,
        });
        return res.data?.options ?? [];
      } catch {
        // Fallback para parcelamento padrão até 12x
        const total = cents / 100;
        const opts = [];
        for (let i = 1; i <= 12; i++) {
          const per = (total / i).toFixed(2).replace(".", ",");
          opts.push({
            installmentCount: i,
            perInstallment: total / i,
            finalAmount: total,
            hasInterest: false,
            description:
              i === 1
                ? `1x de R$ ${(total).toFixed(2).replace(".", ",")} à vista`
                : `${i}x de R$ ${per} sem juros`,
          });
        }
        return opts;
      }
    },
  );

  // Inicialização opcional do SDK de antifraude da Plupag quando publicKey estiver disponível
  onMount(() => {
    if (props.publicKey && typeof window !== "undefined") {
      try {
        const scriptId = "plupag-antifraud-sdk";
        if (!document.getElementById(scriptId)) {
          const script = document.createElement("script");
          script.id = scriptId;
          script.src = "https://checkout.suafintech.com/assets/sdk/sdk-js.umd.js";
          script.async = true;
          script.onload = () => {
            try {
              // @ts-expect-error SDK global Plupag
              if (window.PlupagSDK && typeof window.PlupagSDK.init === "function") {
                // @ts-expect-error SDK global Plupag
                const instance = window.PlupagSDK.init({ publicKey: props.publicKey });
                if (instance?.sessionId) {
                  setSessionId(instance.sessionId);
                }
              }
            } catch {
              // Silencioso se o SDK não estiver acessível
            }
          };
          document.body.appendChild(script);
        }
      } catch {
        // Silencioso
      }
    }
  });

  const formatCardNumber = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
  };

  const formatExpiry = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 4);
    if (digits.length >= 3) {
      return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }
    return digits;
  };

  createEffect(() => {
    const cleanNum = number().replace(/\s/g, "");
    const cleanExp = expiry().replace(/\D/g, "");
    const cleanCvv = cvv().trim();
    const cleanHolder = holder().trim();

    if (cleanNum.length >= 13 && cleanExp.length === 4 && cleanCvv.length >= 3 && cleanHolder.length >= 3) {
      const month = cleanExp.slice(0, 2);
      const year = `20${cleanExp.slice(2)}`;
      const monthNum = parseInt(month, 10);
      if (monthNum < 1 || monthNum > 12) {
        setError("Mês de validade inválido.");
        props.onReady(false);
        props.onChange(null);
        return;
      }
      setError(null);
      props.onReady(true);
      props.onChange({
        card_holder: cleanHolder,
        card_number: cleanNum,
        card_month: month,
        card_year: year,
        card_cvv: cleanCvv,
        installments: installments(),
        session_id: sessionId(),
        card_last_four: cleanNum.slice(-4),
      });
    } else {
      props.onReady(false);
      props.onChange(null);
    }
  });

  const inputClass =
    "h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus:border-[#7a45e5] focus:ring-2 focus:ring-[#7a45e5]/20 focus:outline-none transition";

  return (
    <div class="mt-4 space-y-3.5 rounded-xl border border-zinc-200 bg-[#FAF7FD] p-4 sm:p-5">
      <div class="flex items-center justify-between border-b border-zinc-200 pb-3">
        <span class="text-xs font-bold uppercase tracking-wider text-[#7a45e5]">
          Plupag • Cartão de Crédito
        </span>
        <span class="text-[11px] font-semibold text-zinc-500">
          Ambiente Seguro 256-bit
        </span>
      </div>

      <div>
        <label for="plu-card-name" class="mb-1 block text-xs font-bold text-zinc-700">
          Nome impresso no cartão
        </label>
        <input
          id="plu-card-name"
          class={inputClass}
          value={holder()}
          onInput={(e) => setHolder(e.currentTarget.value.toUpperCase())}
          placeholder="Ex: MARIA S SILVA"
          autocomplete="cc-name"
          required
        />
      </div>

      <div>
        <label for="plu-card-number" class="mb-1 block text-xs font-bold text-zinc-700">
          Número do cartão
        </label>
        <input
          id="plu-card-number"
          class={inputClass}
          value={number()}
          onInput={(e) => setNumber(formatCardNumber(e.currentTarget.value))}
          placeholder="0000 0000 0000 0000"
          autocomplete="cc-number"
          maxlength="19"
          required
        />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label for="plu-card-expiry" class="mb-1 block text-xs font-bold text-zinc-700">
            Validade (MM/AA)
          </label>
          <input
            id="plu-card-expiry"
            class={inputClass}
            value={expiry()}
            onInput={(e) => setExpiry(formatExpiry(e.currentTarget.value))}
            placeholder="MM/AA"
            autocomplete="cc-exp"
            maxlength="5"
            required
          />
        </div>
        <div>
          <label for="plu-card-cvv" class="mb-1 block text-xs font-bold text-zinc-700">
            Código CVV
          </label>
          <input
            id="plu-card-cvv"
            type="password"
            class={inputClass}
            value={cvv()}
            onInput={(e) => setCvv(e.currentTarget.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="123"
            autocomplete="cc-csc"
            maxlength="4"
            required
          />
        </div>
      </div>

      <div>
        <label for="plu-card-installments" class="mb-1 block text-xs font-bold text-zinc-700">
          Opções de parcelamento
        </label>
        <select
          id="plu-card-installments"
          class={inputClass}
          value={installments()}
          onChange={(e) => setInstallments(parseInt(e.currentTarget.value, 10))}
        >
          <Show
            when={installmentOptions() && installmentOptions()!.length > 0}
            fallback={<option value={1}>1x de R$ {(props.amountCents / 100).toFixed(2).replace(".", ",")} à vista</option>}
          >
            <For each={installmentOptions()}>
              {(opt) => (
                <option value={opt.installmentCount}>
                  {opt.description}
                </option>
              )}
            </For>
          </Show>
        </select>
      </div>

      <Show when={error()}>
        <p role="alert" class="text-xs font-semibold text-red-600">
          {error()}
        </p>
      </Show>

      <p class="text-[11px] text-zinc-500">
        Seus dados de pagamento são criptografados e processados diretamente pela Plupag com verificação antifraude.
      </p>
    </div>
  );
}
