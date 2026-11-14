import { createFileRoute } from "@tanstack/solid-router";
import PackageSearch from "lucide-solid/icons/package-search";
import Truck from "lucide-solid/icons/truck";
import { For, Show, createSignal } from "solid-js";
import { StoreShell } from "../features/storefront/components/StoreShell";
import { ApiError, api } from "../lib/api";
import { formatCents, orderStatusLabel } from "../lib/format";
import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/rastrear-pedido")({
  validateSearch: (search: Record<string, unknown>): { codigo?: string } => ({
    codigo: typeof search.codigo === "string" ? search.codigo : undefined,
  }),
  head: () =>
    seoHead({
      title: "Rastrear Pedido — Mistura Feminina Cosméticos",
      description:
        "Consulte o status, pagamento e código de rastreio do seu pedido.",
      path: "/rastrear-pedido",
    }),
  component: TrackOrderPage,
});

interface TrackOrderResult {
  order: {
    order_number: string;
    public_token: string;
    status: string;
    customer_first_name: string;
    total_cents: number;
    created_at: string | null;
    status_histories: {
      to_status: string;
      note: string | null;
      created_at: string | null;
    }[];
    shipment: {
      carrier: string | null;
      service_name: string | null;
      tracking_code: string | null;
      tracking_url: string | null;
      tracking_events: {
        occurred_at: string | null;
        status: string;
        location: string | null;
        description: string;
      }[];
    } | null;
  };
}

function TrackOrderPage() {
  const search = Route.useSearch();
  const [orderNumber, setOrderNumber] = createSignal(
    (search().codigo ?? "").trim().toUpperCase(),
  );
  const [identifier, setIdentifier] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [result, setResult] = createSignal<TrackOrderResult | null>(null);

  async function submitLookup(e: Event) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await api<{ data: TrackOrderResult }>(
        "/orders/track-lookup",
        {
          method: "POST",
          authenticated: false,
          body: {
            order_number: orderNumber().trim().toUpperCase(),
            identifier: identifier().trim(),
          },
        },
      );
      setResult(res.data);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Pedido não encontrado ou dados não conferem.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <StoreShell>
      <div class="mx-auto max-w-3xl px-4 py-10">
        <div class="flex items-center gap-3">
          <PackageSearch class="h-7 w-7 text-[var(--mf-primary)]" />
          <div>
            <h1 class="text-2xl font-bold text-zinc-900">Rastrear Pedido</h1>
            <p class="text-sm text-zinc-600">
              Informe o número do pedido (ex.: MF-2026-00001) e o e-mail ou CPF
              cadastrado.
            </p>
          </div>
        </div>

        <form
          onSubmit={submitLookup}
          class="mt-6 grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-5 sm:grid-cols-3"
        >
          <div>
            <label
              for="tr-order"
              class="block text-xs font-semibold text-zinc-700"
            >
              Número do pedido *
            </label>
            <input
              id="tr-order"
              type="text"
              required
              placeholder="MF-2026-00001"
              value={orderNumber()}
              onInput={(e) => setOrderNumber(e.currentTarget.value)}
              class="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm uppercase"
            />
          </div>
          <div>
            <label
              for="tr-id"
              class="block text-xs font-semibold text-zinc-700"
            >
              E-mail ou CPF *
            </label>
            <input
              id="tr-id"
              type="text"
              required
              placeholder="cliente@email.com"
              value={identifier()}
              onInput={(e) => setIdentifier(e.currentTarget.value)}
              class="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
            />
          </div>
          <div class="flex items-end">
            <button
              type="submit"
              disabled={loading()}
              class="h-10 w-full rounded-md bg-[var(--mf-primary)] text-sm font-semibold text-white hover:bg-[var(--mf-primary-hover)] disabled:opacity-60"
            >
              {loading() ? "Buscando..." : "Consultar"}
            </button>
          </div>
        </form>

        <Show when={error()}>
          <p
            role="alert"
            class="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800"
          >
            {error()}
          </p>
        </Show>

        <Show when={result()}>
          {(res) => (
            <section class="mt-6 space-y-5 rounded-xl border border-zinc-200 bg-white p-6">
              <div class="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-4">
                <div>
                  <p class="text-xs font-semibold uppercase text-zinc-500">
                    Pedido {res().order.order_number}
                  </p>
                  <h2 class="text-lg font-bold text-zinc-900">
                    Status atual: {orderStatusLabel(res().order.status)}
                  </h2>
                </div>
                <span class="text-sm font-bold text-zinc-900">
                  Total: {formatCents(res().order.total_cents)}
                </span>
              </div>

              <Show when={res().order.shipment?.tracking_code}>
                <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm">
                  <div class="flex items-center gap-2">
                    <Truck class="h-5 w-5 text-[var(--mf-primary)]" />
                    <div>
                      <p class="font-bold text-zinc-900">
                        Código de rastreio:{" "}
                        {res().order.shipment!.tracking_code}
                      </p>
                      <p class="text-xs text-zinc-600">
                        {res().order.shipment!.carrier} ·{" "}
                        {res().order.shipment!.service_name}
                      </p>
                    </div>
                  </div>
                  <Show when={res().order.shipment!.tracking_url}>
                    <a
                      href={res().order.shipment!.tracking_url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Abrir rastreio na transportadora
                    </a>
                  </Show>
                </div>
              </Show>

              <div>
                <h3 class="text-sm font-bold text-zinc-900">
                  Histórico de andamento
                </h3>
                <ul class="mt-3 space-y-2 border-l-2 border-zinc-200 pl-4 text-sm">
                  <For each={res().order.status_histories}>
                    {(h) => (
                      <li class="space-y-0.5">
                        <p class="font-semibold text-zinc-900">
                          {orderStatusLabel(h.to_status)}
                        </p>
                        <Show when={h.note}>
                          <p class="text-xs text-zinc-600">{h.note}</p>
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            </section>
          )}
        </Show>
      </div>
    </StoreShell>
  );
}
