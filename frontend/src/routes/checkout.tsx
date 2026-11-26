import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import Barcode from "lucide-solid/icons/barcode";
import {
  invoiceUrl,
  paymentConfig,
} from "../features/storefront/payment-config";
import CreditCard from "lucide-solid/icons/credit-card";
import Lock from "lucide-solid/icons/lock";
import QrCode from "lucide-solid/icons/qr-code";
import {
  For,
  Show,
  createResource,
  createSignal,
  onMount,
  createEffect,
  on,
} from "solid-js";
import { ShippingQuoteWidget } from "../features/storefront/components/ShippingQuoteWidget";
import { StoreShell } from "../features/storefront/components/StoreShell";
import {
  cartHeaders,
  refreshCart,
  selectCartShipping,
  storefrontStore,
} from "../features/storefront/store";
import { ApiError, api } from "../lib/api";
import {
  formatCep,
  formatCents,
  formatCpfCnpj,
  formatPhone,
} from "../lib/format";
import { seoHead } from "../lib/seo";
import {
  mapCartItemsToGa4,
  trackAddPaymentInfo,
  trackAddShippingInfo,
  trackBeginCheckout,
} from "../monitoring/analytics";
import { session } from "../security/session";
import { CardPaymentFields } from "../features/storefront/CardPaymentFields";
import type { TokenizedCard } from "../features/storefront/mercado-pago";

export const Route = createFileRoute("/checkout")({
  head: () =>
    seoHead({
      title: "Finalizar Compra — Mistura Feminina Cosméticos",
      description: "Checkout seguro com Pix e cartão de crédito.",
      path: "/checkout",
      noindex: true,
    }),
  component: CheckoutPage,
});

interface SavedAddress {
  id: number;
  label: string;
  recipient_name: string;
  cep: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
}

function CheckoutPage() {
  const navigate = useNavigate();
  const [payments] = createResource(paymentConfig);
  const cart = () => storefrontStore.cart();

  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [phone, setPhone] = createSignal("");
  const [cpf, setCpf] = createSignal("");
  const [cep, setCep] = createSignal("");
  const [street, setStreet] = createSignal("");
  const [number, setNumber] = createSignal("");
  const [complement, setComplement] = createSignal("");
  const [neighborhood, setNeighborhood] = createSignal("");
  const [city, setCity] = createSignal("");
  const [stateUf, setStateUf] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [savedAddresses, setSavedAddresses] = createSignal<SavedAddress[]>([]);

  const [method, setMethod] = createSignal<"pix" | "credit_card" | "boleto">(
    "pix",
  );
  const [cepLoading, setCepLoading] = createSignal(false);
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [cardReady, setCardReady] = createSignal(false);
  const [checkoutUncertain, setCheckoutUncertain] = createSignal(false);
  const usesCardForm = () =>
    payments()?.provider === "mercadopago" && method() === "credit_card";
  const [assistedToken, setAssistedToken] = createSignal<string | null>(null);
  const [idempotencyKey] = createSignal(
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `mf-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  onMount(() => {
    try {
      const raw =
        typeof sessionStorage !== "undefined"
          ? sessionStorage.getItem("mf_assisted_checkout")
          : null;
      if (raw) {
        const parsed = JSON.parse(raw) as {
          token?: string;
          customer_name?: string | null;
          customer_email?: string | null;
          customer_phone?: string | null;
        };
        if (parsed.token) {
          setAssistedToken(parsed.token);
          if (parsed.customer_name && !name().trim()) {
            setName(parsed.customer_name);
          }
          if (parsed.customer_email && !email().trim()) {
            setEmail(parsed.customer_email);
          }
          if (parsed.customer_phone && !phone().trim()) {
            setPhone(formatPhone(parsed.customer_phone));
          }
        }
      }
    } catch {
      // ignore invalid sessionStorage payload
    }

    void refreshCart().then((c) => {
      if (c?.shipping_cep) setCep(formatCep(c.shipping_cep));
      if (c && c.items.length > 0) {
        trackBeginCheckout({
          currency: "BRL",
          value: c.total_cents / 100,
          items: mapCartItemsToGa4(c.items),
        });
      }
    });
  });

  createEffect(
    on(
      () => (session.status() === "authenticated" ? session.user()?.id : null),
      (userId) => {
        const u = session.user();
        if (userId == null || !u) return;
        if (!name().trim()) setName(u.name || "");
        if (!email().trim()) setEmail(u.email || "");
        void api<{ data: SavedAddress[] }>("/account/addresses")
          .then((res) => {
            if (
              session.status() !== "authenticated" ||
              session.user()?.id !== userId
            )
              return;
            const list = res.data ?? [];
            setSavedAddresses(list);
            if (list[0] && !street().trim() && !number().trim())
              applyAddress(list[0]);
          })
          .catch(() => {});
      },
    ),
  );

  function applyAddress(addr: SavedAddress) {
    setCep(formatCep(addr.cep));
    setStreet(addr.street);
    setNumber(addr.number);
    setComplement(addr.complement || "");
    setNeighborhood(addr.neighborhood);
    setCity(addr.city);
    setStateUf(addr.state);
  }

  async function lookupCep(raw: string) {
    const digits = raw.replace(/\D/g, "");
    setCep(formatCep(digits));
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const [resp] = await Promise.all([
        fetch(`https://viacep.com.br/ws/${digits}/json/`).catch(() => null),
      ]);
      if (resp && resp.ok) {
        const data = (await resp.json()) as {
          erro?: boolean;
          logradouro?: string;
          bairro?: string;
          localidade?: string;
          uf?: string;
        };
        if (!data.erro) {
          if (data.logradouro) setStreet(data.logradouro);
          if (data.bairro) setNeighborhood(data.bairro);
          if (data.localidade) setCity(data.localidade);
          if (data.uf) setStateUf(data.uf);
        }
      }
    } catch {
      // keep manual input editable on external lookup failure
    } finally {
      setCepLoading(false);
    }
  }

  async function submitCheckout(paymentData?: TokenizedCard) {
    if (submitting() || checkoutUncertain()) return;
    setError(null);
    const c = cart();
    if (!c || c.items.length === 0) {
      setError("Seu carrinho está vazio.");
      return;
    }

    const cleanCep = cep().replace(/\D/g, "");
    if (cleanCep.length !== 8) {
      setError("Informe um CEP válido com 8 dígitos.");
      return;
    }

    setSubmitting(true);
    let requestSent = false;
    try {
      if (!payments()?.enabled) throw new Error("Pagamentos indisponíveis.");
      if (usesCardForm() && !paymentData?.card_token) {
        setError("Preencha os dados do cartão para continuar.");
        return;
      }
      if (
        !c.shipping_quote?.quote_id ||
        c.shipping_cep !== cleanCep ||
        (c.shipping_quote.expires_at &&
          Date.parse(c.shipping_quote.expires_at) <= Date.now())
      ) {
        setError(
          "Calcule e selecione uma entrega válida para o CEP informado.",
        );
        return;
      }
      trackAddPaymentInfo({
        currency: "BRL",
        value: c.total_cents / 100,
        payment_type: method(),
        items: mapCartItemsToGa4(c.items),
      });
      requestSent = true;
      const res = await api<{
        data: {
          order: { public_token: string };
          payment: { checkout_url?: string | null } | null;
        };
      }>("/checkout", {
        method: "POST",
        authenticated: false,
        timeoutMs: 90000,
        headers: cartHeaders({ "X-Idempotency-Key": idempotencyKey() }),
        body: {
          customer_name: name().trim(),
          customer_email: email().trim(),
          customer_phone: phone().trim(),
          customer_cpf_cnpj: cpf().trim() || undefined,
          shipping_quote_id: c.shipping_quote.quote_id,
          shipping_address: {
            recipient_name: name().trim(),
            cep: cleanCep,
            street: street().trim(),
            number: number().trim(),
            complement: complement().trim() || undefined,
            neighborhood: neighborhood().trim(),
            city: city().trim(),
            state: stateUf().trim().toUpperCase(),
          },
          payment_method: method(),
          defer_payment: false,
          payment_data: paymentData,
          notes_customer: notes().trim() || undefined,
          assisted_order_token: assistedToken() || undefined,
        },
      });

      try {
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.removeItem("mf_assisted_checkout");
        }
      } catch {
        // ignore storage error
      }

      await refreshCart().catch(() => null);
      const handoff = invoiceUrl(res.data.payment?.checkout_url);
      if (payments()?.provider === "asaas" && handoff) {
        window.location.assign(handoff);
        return;
      }
      await navigate({
        to: "/pedido/$token/confirmacao",
        params: { token: res.data.order.public_token },
      });
    } catch (err) {
      if (
        requestSent &&
        (!(err instanceof ApiError) ||
          ![400, 401, 403, 419, 422].includes(err.status))
      ) {
        setCheckoutUncertain(true);
        setError(
          "Não foi possível obter a confirmação do pedido. Consulte o resultado antes de tentar novamente.",
        );
        return;
      }
      if (err instanceof ApiError) {
        const firstValidation = Object.values(err.validation).flat()[0];
        setError(firstValidation || err.message);
      } else {
        setError(
          "Não foi possível concluir seu pedido. Confira os dados e tente novamente.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <StoreShell promotions={false}>
      <div class="mx-auto max-w-7xl px-4 py-8">
        <div class="mb-6 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-4">
          <div>
            <h1 class="text-2xl font-bold text-zinc-900 sm:text-3xl">
              Finalizar Compra
            </h1>
            <p class="text-sm text-zinc-600">
              Preencha seus dados, endereço de entrega e selecione o pagamento.
            </p>
          </div>
          <span class="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
            <Lock class="h-3.5 w-3.5" />
            Ambiente protegido ·{" "}
            {payments()?.environment === "sandbox"
              ? "Ambiente de teste"
              : "Pagamento seguro"}
          </span>
        </div>

        <Show
          when={cart() && cart()!.items.length > 0 ? cart() : null}
          fallback={
            <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-10 text-center">
              <p class="text-base font-bold text-zinc-900">
                Não há itens no seu carrinho.
              </p>
              <Link
                to="/buscar"
                class="mt-4 inline-block rounded-lg bg-[var(--mf-primary)] px-5 py-2.5 text-sm font-semibold text-white"
              >
                Voltar à loja
              </Link>
            </div>
          }
        >
          {(c) => (
            <form
              id="store-checkout"
              onSubmit={(event) => {
                event.preventDefault();
                if (!usesCardForm()) void submitCheckout();
              }}
              class="grid grid-cols-1 gap-8 lg:grid-cols-12"
            >
              <div class="min-w-0 space-y-6 lg:col-span-8">
                {/* 1. Identification */}
                <section class="rounded-xl border border-zinc-200 bg-white p-5">
                  <div class="mb-4 flex items-center justify-between">
                    <h2 class="text-base font-bold text-zinc-900">
                      1. Dados de contato
                    </h2>
                    <Show when={session.status() !== "authenticated"}>
                      <Link
                        to="/entrar"
                        search={{ redirect: "/checkout" }}
                        class="text-xs font-semibold text-[var(--mf-primary)] hover:underline"
                      >
                        Já tenho conta
                      </Link>
                    </Show>
                  </div>

                  <div class="grid gap-4 sm:grid-cols-2">
                    <div class="sm:col-span-2">
                      <label
                        for="co-name"
                        class="block text-xs font-semibold text-zinc-700"
                      >
                        Nome completo *
                      </label>
                      <input
                        id="co-name"
                        type="text"
                        required
                        value={name()}
                        onInput={(e) => setName(e.currentTarget.value)}
                        class="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm"
                      />
                    </div>
                    <div>
                      <label
                        for="co-email"
                        class="block text-xs font-semibold text-zinc-700"
                      >
                        E-mail *
                      </label>
                      <input
                        id="co-email"
                        type="email"
                        required
                        value={email()}
                        onInput={(e) => setEmail(e.currentTarget.value)}
                        class="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm"
                      />
                    </div>
                    <div>
                      <label
                        for="co-phone"
                        class="block text-xs font-semibold text-zinc-700"
                      >
                        WhatsApp / Telefone *
                      </label>
                      <input
                        id="co-phone"
                        type="tel"
                        required
                        value={phone()}
                        onInput={(e) =>
                          setPhone(formatPhone(e.currentTarget.value))
                        }
                        placeholder="(11) 99999-9999"
                        class="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm"
                      />
                    </div>
                    <div>
                      <label
                        for="co-cpf"
                        class="block text-xs font-semibold text-zinc-700"
                      >
                        CPF ou CNPJ (para nota fiscal / Pix)
                      </label>
                      <input
                        id="co-cpf"
                        type="text"
                        required
                        value={cpf()}
                        onInput={(e) =>
                          setCpf(formatCpfCnpj(e.currentTarget.value))
                        }
                        placeholder="000.000.000-00"
                        class="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm"
                      />
                    </div>
                  </div>
                </section>

                {/* 2. Delivery address */}
                <section class="rounded-xl border border-zinc-200 bg-white p-5">
                  <h2 class="mb-4 text-base font-bold text-zinc-900">
                    2. Endereço e frete
                  </h2>

                  <Show when={savedAddresses().length > 0}>
                    <div class="mb-4 flex flex-wrap gap-2">
                      <For each={savedAddresses()}>
                        {(addr) => (
                          <button
                            type="button"
                            onClick={() => applyAddress(addr)}
                            class="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:border-[var(--mf-primary)]"
                          >
                            {addr.label} ({addr.street}, {addr.number})
                          </button>
                        )}
                      </For>
                    </div>
                  </Show>

                  <div class="grid gap-4 sm:grid-cols-6">
                    <div class="sm:col-span-2">
                      <label
                        for="co-cep"
                        class="block text-xs font-semibold text-zinc-700"
                      >
                        CEP *
                      </label>
                      <input
                        id="co-cep"
                        type="text"
                        required
                        maxLength={9}
                        value={cep()}
                        onInput={(e) => void lookupCep(e.currentTarget.value)}
                        placeholder="00000-000"
                        class="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm"
                      />
                      <Show when={cepLoading()}>
                        <p class="mt-1 text-[11px] text-zinc-500">
                          Consultando CEP...
                        </p>
                      </Show>
                    </div>

                    <div class="sm:col-span-3">
                      <label
                        for="co-street"
                        class="block text-xs font-semibold text-zinc-700"
                      >
                        Rua / Avenida *
                      </label>
                      <input
                        id="co-street"
                        type="text"
                        required
                        value={street()}
                        onInput={(e) => setStreet(e.currentTarget.value)}
                        class="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm"
                      />
                    </div>

                    <div class="sm:col-span-1">
                      <label
                        for="co-number"
                        class="block text-xs font-semibold text-zinc-700"
                      >
                        Número *
                      </label>
                      <input
                        id="co-number"
                        type="text"
                        required
                        value={number()}
                        onInput={(e) => setNumber(e.currentTarget.value)}
                        class="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm"
                      />
                    </div>

                    <div class="sm:col-span-2">
                      <label
                        for="co-complement"
                        class="block text-xs font-semibold text-zinc-700"
                      >
                        Complemento
                      </label>
                      <input
                        id="co-complement"
                        type="text"
                        value={complement()}
                        onInput={(e) => setComplement(e.currentTarget.value)}
                        placeholder="Apto, bloco..."
                        class="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm"
                      />
                    </div>

                    <div class="sm:col-span-2">
                      <label
                        for="co-neigh"
                        class="block text-xs font-semibold text-zinc-700"
                      >
                        Bairro *
                      </label>
                      <input
                        id="co-neigh"
                        type="text"
                        required
                        value={neighborhood()}
                        onInput={(e) => setNeighborhood(e.currentTarget.value)}
                        class="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm"
                      />
                    </div>

                    <div class="sm:col-span-1">
                      <label
                        for="co-city"
                        class="block text-xs font-semibold text-zinc-700"
                      >
                        Cidade *
                      </label>
                      <input
                        id="co-city"
                        type="text"
                        required
                        value={city()}
                        onInput={(e) => setCity(e.currentTarget.value)}
                        class="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm"
                      />
                    </div>

                    <div class="sm:col-span-1">
                      <label
                        for="co-uf"
                        class="block text-xs font-semibold text-zinc-700"
                      >
                        UF *
                      </label>
                      <input
                        id="co-uf"
                        type="text"
                        required
                        maxLength={2}
                        value={stateUf()}
                        onInput={(e) =>
                          setStateUf(e.currentTarget.value.toUpperCase())
                        }
                        placeholder="SP"
                        class="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm uppercase"
                      />
                    </div>
                  </div>

                  <div class="mt-4">
                    <ShippingQuoteWidget
                      mode="cart"
                      initialCep={cep()}
                      selectedQuoteId={c().shipping_quote?.quote_id ?? null}
                      onSelectQuote={(q) => {
                        if (q.quote_id) {
                          void selectCartShipping(q.quote_id);
                          trackAddShippingInfo({
                            currency: "BRL",
                            value: c().total_cents / 100,
                            shipping_tier: q.service_name,
                            items: mapCartItemsToGa4(c().items),
                          });
                        }
                      }}
                    />
                  </div>
                </section>

                {/* 3. Payment method */}
                <section class="rounded-xl border border-zinc-200 bg-white p-5">
                  <h2 class="mb-4 text-base font-bold text-zinc-900">
                    3. Pagamento ·{" "}
                    {payments()?.provider === "asaas"
                      ? "Asaas"
                      : "Mercado Pago"}
                  </h2>

                  <div class="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setMethod("pix")}
                      class={`flex items-center gap-3 rounded-xl border p-4 text-left transition ${
                        method() === "pix"
                          ? "border-[var(--mf-primary)] bg-zinc-50 ring-2 ring-[var(--mf-primary)]"
                          : "border-zinc-200 bg-white hover:border-zinc-400"
                      }`}
                    >
                      <QrCode class="h-6 w-6 text-[var(--mf-primary)]" />
                      <div>
                        <p class="text-sm font-bold text-zinc-900">
                          Pix Instantâneo
                        </p>
                        <p class="text-xs text-zinc-600">
                          QR Code + Copia e Cola · Aprovação rápida
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setMethod("credit_card")}
                      class={`flex items-center gap-3 rounded-xl border p-4 text-left transition ${
                        method() === "credit_card"
                          ? "border-[var(--mf-primary)] bg-zinc-50 ring-2 ring-[var(--mf-primary)]"
                          : "border-zinc-200 bg-white hover:border-zinc-400"
                      }`}
                    >
                      <CreditCard class="h-6 w-6 text-[var(--mf-primary)]" />
                      <div>
                        <p class="text-sm font-bold text-zinc-900">
                          Cartão de Crédito
                        </p>
                        <p class="text-xs text-zinc-600">
                          Pagamento à vista no ambiente seguro
                        </p>
                      </div>
                    </button>
                  </div>

                  <button
                    type="button"
                    aria-pressed={method() === "boleto"}
                    onClick={() => setMethod("boleto")}
                    class={`mt-3 flex w-full items-center gap-3 rounded-xl border p-4 text-left ${method() === "boleto" ? "border-[var(--mf-primary)] bg-zinc-50 ring-2 ring-[var(--mf-primary)]" : "border-zinc-200"}`}
                  >
                    <Barcode class="h-6 w-6 text-[var(--mf-primary)]" />
                    <span class="text-sm font-bold">Boleto bancário</span>
                  </button>
                  <Show
                    when={
                      usesCardForm() &&
                      payments()?.enabled &&
                      payments()?.public_key
                    }
                  >
                    <CardPaymentFields
                      formId="store-checkout"
                      publicKey={payments()!.public_key!}
                      amountCents={c().total_cents}
                      customerName={name()}
                      customerEmail={email()}
                      customerDocument={cpf()}
                      onReady={setCardReady}
                      onSubmit={submitCheckout}
                    />
                  </Show>
                  <p class="mt-4 text-xs text-zinc-600">
                    {payments()?.provider === "asaas"
                      ? "Após confirmar o pedido, você será direcionada à fatura oficial do Asaas."
                      : method() === "credit_card"
                        ? "Confira seus dados e confirme o pagamento abaixo."
                        : method() === "pix"
                          ? "O código Pix será exibido assim que você confirmar o pedido."
                          : "O boleto será gerado após a confirmação do pedido."}
                  </p>
                  <Show when={!payments.loading && !payments()?.enabled}>
                    <p role="alert" class="mt-3 text-sm text-red-700">
                      Pagamentos indisponíveis no momento. Tente novamente mais
                      tarde.
                    </p>
                  </Show>
                </section>

                <section class="rounded-xl border border-zinc-200 bg-white p-5">
                  <label
                    for="co-notes"
                    class="block text-xs font-semibold text-zinc-700"
                  >
                    Observações do pedido (opcional)
                  </label>
                  <textarea
                    id="co-notes"
                    rows={2}
                    value={notes()}
                    onInput={(e) => setNotes(e.currentTarget.value)}
                    placeholder="Instruções de entrega ou recado para nossa equipe..."
                    class="mt-1 w-full rounded-lg border border-zinc-300 p-3 text-sm"
                  />
                </section>
              </div>

              {/* Order summary sidebar */}
              <aside class="min-w-0 space-y-4 lg:col-span-4">
                <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-5">
                  <h2 class="text-base font-bold text-zinc-900">
                    Resumo do Pedido
                  </h2>
                  <ul class="mt-4 space-y-3 border-b border-zinc-200 pb-4">
                    <For each={c().items}>
                      {(item) => (
                        <li class="flex justify-between gap-2 text-xs">
                          <span class="text-zinc-700">
                            {item.quantity}x {item.product_name} (
                            {item.variant_name})
                          </span>
                          <span class="shrink-0 font-semibold text-zinc-900">
                            {formatCents(item.line_total_cents)}
                          </span>
                        </li>
                      )}
                    </For>
                  </ul>

                  <dl class="mt-4 space-y-2 text-sm">
                    <div class="flex justify-between text-zinc-700">
                      <dt>Subtotal</dt>
                      <dd>{formatCents(c().subtotal_cents)}</dd>
                    </div>
                    <Show when={c().discount_cents > 0}>
                      <div class="flex justify-between text-emerald-700">
                        <dt>Desconto</dt>
                        <dd>-{formatCents(c().discount_cents)}</dd>
                      </div>
                    </Show>
                    <div class="flex justify-between text-zinc-700">
                      <dt>
                        Frete ({c().shipping_quote?.service_name || "Padrão"})
                      </dt>
                      <dd>
                        {c().shipping_cents === 0
                          ? "Grátis"
                          : formatCents(c().shipping_cents)}
                      </dd>
                    </div>
                    <div class="flex justify-between border-t border-zinc-200 pt-3 text-lg font-extrabold text-zinc-900">
                      <dt>Total</dt>
                      <dd>{formatCents(c().total_cents)}</dd>
                    </div>
                  </dl>

                  <Show when={error()}>
                    <p
                      role="alert"
                      class="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-800"
                    >
                      {error()}
                    </p>
                  </Show>
                  <Show when={checkoutUncertain()}>
                    <p role="alert" class="mt-3 text-sm text-amber-900">
                      A confirmação do pedido está pendente. Consulte seus
                      pedidos antes de enviar outra compra.
                    </p>
                    <Link
                      to="/rastrear-pedido"
                      class="mt-2 block text-sm font-semibold text-[var(--mf-primary)] underline"
                    >
                      Consultar pedido
                    </Link>
                  </Show>

                  <button
                    type="submit"
                    disabled={
                      submitting() ||
                      checkoutUncertain() ||
                      !payments()?.enabled ||
                      (usesCardForm() && !cardReady())
                    }
                    class="mt-5 flex h-12 w-full items-center justify-center rounded-lg bg-[var(--mf-primary)] px-5 text-sm font-bold text-white transition hover:bg-[var(--mf-primary-hover)] disabled:opacity-60"
                  >
                    {submitting()
                      ? "Processando pedido..."
                      : usesCardForm()
                        ? "Confirmar e pagar"
                        : "Confirmar pedido"}
                  </button>
                </div>
              </aside>
            </form>
          )}
        </Show>
      </div>
    </StoreShell>
  );
}
