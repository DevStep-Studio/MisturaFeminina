import Truck from "lucide-solid/icons/truck";
import { For, Show, createEffect, createSignal } from "solid-js";
import { ApiError, api } from "../../../lib/api";
import { formatCep, formatCents } from "../../../lib/format";
import { cartHeaders } from "../store";
import type { ShippingOptionData } from "../types";

interface ShippingQuoteWidgetProps {
  mode: "product" | "cart";
  productSlug?: string;
  quantity?: number;
  selectedQuoteId?: number | null;
  onSelectQuote?: (quote: ShippingOptionData) => void;
  initialCep?: string | null;
}

export function ShippingQuoteWidget(props: ShippingQuoteWidgetProps) {
  const [cep, setCep] = createSignal(formatCep(props.initialCep ?? ""));
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [quotes, setQuotes] = createSignal<ShippingOptionData[]>([]);
  const [queriedCep, setQueriedCep] = createSignal<string | null>(null);
  const [notice, setNotice] = createSignal<string | null>(null);

  createEffect(() => {
    const value = props.initialCep;
    if (value !== undefined) {
      setCep(formatCep(value ?? ""));
      setQuotes([]);
    }
  });

  async function calculate(e: Event) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const digits = cep().replace(/\D/g, "");
    if (digits.length !== 8) {
      setError("Informe um CEP válido com 8 dígitos.");
      return;
    }

    setLoading(true);
    try {
      const endpoint =
        props.mode === "product" && props.productSlug
          ? `/catalog/products/${props.productSlug}/shipping-quote`
          : "/cart/shipping/quote";

      const res = await api<{
        data: {
          cep: string;
          notice?: string | null;
          options: ShippingOptionData[];
        };
      }>(endpoint, {
        method: "POST",
        authenticated: false,
        timeoutMs: 90000,
        headers: props.mode === "cart" ? cartHeaders() : {},
        body:
          props.mode === "product"
            ? { cep: digits, quantity: props.quantity ?? 1 }
            : { cep: digits },
      });

      if (cep().replace(/\D/g, "") !== digits) return;
      setQuotes(res.data.options ?? []);
      setQueriedCep(res.data.cep ?? digits);
      setNotice(res.data.notice ?? null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível consultar o frete no momento.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Show
      when={props.mode === "product"}
      fallback={
        <div class="rounded-lg border border-zinc-200 bg-zinc-50 p-3.5">
          <div class="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <Truck class="h-4 w-4 text-[var(--mf-primary)]" />
            <span>Calcular frete e prazo</span>
          </div>

          <div class="flex gap-2">
            <label for={`cep-${props.mode}`} class="sr-only">
              CEP de entrega
            </label>
            <input
              id={`cep-${props.mode}`}
              type="text"
              inputMode="numeric"
              maxLength={9}
              value={cep()}
              onInput={(e) => {
                setCep(formatCep(e.currentTarget.value));
                setQuotes([]);
              }}
              placeholder="00000-000"
              class="h-10 min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus:border-[var(--mf-primary)] focus:outline-none"
            />
            <button
              type="button"
              onClick={(e) => void calculate(e)}
              disabled={loading()}
              class="h-10 shrink-0 rounded-lg bg-[#93509e] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#7c3f87] disabled:opacity-60"
            >
              {loading() ? "Calculando..." : "Calcular"}
            </button>
          </div>

          <div class="mt-1.5 flex items-center justify-between text-xs text-zinc-500">
            <a
              href="https://buscacepinter.correios.com.br/app/endereco/index.php"
              target="_blank"
              rel="noopener noreferrer"
              class="underline hover:text-zinc-800"
            >
              Não sei meu CEP
            </a>
            <Show when={queriedCep()}>
              <span>CEP: {formatCep(queriedCep() || "")}</span>
            </Show>
          </div>

          <Show when={error()}>
            <p role="alert" class="mt-2 text-xs font-medium text-red-700">
              {error()}
            </p>
          </Show>

          <Show when={notice()}>
            <p class="mt-2 text-[11px] text-zinc-600">{notice()}</p>
          </Show>

          <Show when={quotes().length > 0}>
            <ul class="mt-3 space-y-2">
              <For each={quotes()}>
                {(q) => {
                  const selectable = Boolean(props.onSelectQuote && q.quote_id);
                  const selected =
                    props.selectedQuoteId != null &&
                    q.quote_id === props.selectedQuoteId;

                  return (
                    <li>
                      <button
                        type="button"
                        disabled={!selectable}
                        onClick={() => props.onSelectQuote?.(q)}
                        class={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-xs transition ${
                          selected
                            ? "border-[var(--mf-primary)] bg-white ring-1 ring-[var(--mf-primary)]"
                            : "border-zinc-200 bg-white hover:border-zinc-400"
                        } ${!selectable ? "cursor-default" : "cursor-pointer"}`}
                      >
                        <div>
                          <div class="font-semibold text-zinc-900">
                            {q.service_name}
                            <Show when={q.is_fallback}>
                              <span class="ml-1.5 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                                Tabela da loja
                              </span>
                            </Show>
                          </div>
                          <p class="text-zinc-600">
                            {q.carrier} · até {q.estimated_days}{" "}
                            {q.estimated_days === 1 ? "dia útil" : "dias úteis"}
                          </p>
                        </div>
                        <div class="text-right">
                          <Show
                            when={q.price_cents > 0}
                            fallback={
                              <span class="font-bold text-emerald-700">
                                Grátis
                              </span>
                            }
                          >
                            <span class="font-bold text-zinc-900">
                              {formatCents(q.price_cents)}
                            </span>
                          </Show>
                        </div>
                      </button>
                    </li>
                  );
                }}
              </For>
            </ul>
          </Show>
        </div>
      }
    >
      <div class="pt-2">
        <div class="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex items-center gap-2 text-xs font-bold text-[#2E0C49]">
            <Truck
              class="h-4 w-4 shrink-0 text-[#2E0C49]"
              stroke-width={1.8}
              aria-hidden="true"
            />
            <span>Frete e prazo de entrega</span>
          </div>

          <div class="flex h-10 flex-1 items-center rounded-lg border border-zinc-200/70 bg-[#FAF7FB] pl-4 pr-1.5 sm:max-w-[300px]">
            <label for={`cep-${props.mode}`} class="sr-only">
              CEP de entrega
            </label>
            <input
              id={`cep-${props.mode}`}
              type="text"
              inputMode="numeric"
              maxLength={9}
              value={cep()}
              onInput={(e) => {
                setCep(formatCep(e.currentTarget.value));
                setQuotes([]);
              }}
              placeholder="Informe seu cep"
              class="min-w-0 flex-1 bg-transparent text-xs text-[#2E0C49] placeholder:text-zinc-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={(e) => void calculate(e)}
              disabled={loading()}
              class="shrink-0 rounded-md bg-[#93509e] px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-white transition hover:bg-[#7c3f87] disabled:opacity-60"
            >
              {loading() ? "..." : "CALCULAR"}
            </button>
          </div>
        </div>

        <Show when={error()}>
          <p role="alert" class="mt-2 text-xs font-medium text-red-700">
            {error()}
          </p>
        </Show>

        <Show when={notice()}>
          <p class="mt-2 text-[11px] text-zinc-600">{notice()}</p>
        </Show>

        <Show when={quotes().length > 0}>
          <ul class="mt-3 space-y-2">
            <For each={quotes()}>
              {(q) => (
                <li class="flex items-center justify-between rounded-lg border border-zinc-200/80 bg-[#FAF7FB] px-3 py-2 text-xs">
                  <div>
                    <div class="font-semibold text-[#2E0C49]">
                      {q.service_name}
                      <Show when={q.is_fallback}>
                        <span class="ml-1.5 rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                          Tabela da loja
                        </span>
                      </Show>
                    </div>
                    <p class="text-zinc-600">
                      {q.carrier} · até {q.estimated_days}{" "}
                      {q.estimated_days === 1 ? "dia útil" : "dias úteis"}
                    </p>
                  </div>
                  <div class="text-right">
                    <Show
                      when={q.price_cents > 0}
                      fallback={
                        <span class="font-bold text-emerald-700">Grátis</span>
                      }
                    >
                      <span class="font-bold text-[#2E0C49]">
                        {formatCents(q.price_cents)}
                      </span>
                    </Show>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>
    </Show>
  );
}
