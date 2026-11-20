import { For, Show, createResource, createSignal } from "solid-js";
import { Link, createFileRoute, useNavigate } from "@tanstack/solid-router";
import AlertTriangle from "lucide-solid/icons/triangle-exclamation-point";
import CheckCircle2 from "lucide-solid/icons/circle-check";
import Clock from "lucide-solid/icons/clock";
import Share2 from "lucide-solid/icons/share-2";
import ShoppingCart from "lucide-solid/icons/shopping-cart";
import { StoreShell } from "@/features/storefront/components/StoreShell";
import { LoadingState } from "@/components/feedback/loading-state";
import { ApiError, api } from "@/lib/api";
import { formatCents } from "@/lib/format";
import { importSharedCart, storefrontStore } from "@/features/storefront/store";
import type { SharedCartData } from "@/features/storefront/types";

export const Route = createFileRoute("/carrinho/compartilhado/$token")({
  component: SharedCartPage,
});

function SharedCartPage() {
  const params = Route.useParams();
  const navigate = useNavigate();
  const [importing, setImporting] = createSignal(false);
  const [feedback, setFeedback] = createSignal<string | null>(null);
  const [importError, setImportError] = createSignal<string | null>(null);

  const [sharedCart] = createResource(
    () => params().token,
    async (token) => {
      const res = await api<{ data: SharedCartData }>(
        `/cart/shared/${encodeURIComponent(token)}`,
        { authenticated: false },
      );
      return res.data;
    },
  );

  async function handleImport(goToCart: boolean) {
    setImporting(true);
    setFeedback(null);
    setImportError(null);
    try {
      const res = await importSharedCart(params().token);
      if (goToCart) {
        await navigate({ to: "/carrinho" });
        return;
      }
      storefrontStore.setDrawerOpen(true);
      const count = res.added_items.length + res.partial_items.length;
      const skipped = res.unavailable_items.length;
      setFeedback(
        skipped > 0
          ? `${count} item(ns) adicionado(s) ao seu carrinho (${skipped} indisponível(is) ignorado(s)).`
          : `${count} item(ns) adicionado(s) ao seu carrinho com sucesso!`,
      );
    } catch (err) {
      setImportError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível importar este carrinho.",
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <StoreShell>
      <div class="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Show when={sharedCart.loading}>
          <LoadingState message="Validando disponibilidade e preços atualizados..." />
        </Show>

        <Show when={sharedCart.error}>
          <div class="rounded-2xl border border-zinc-200 bg-zinc-50 p-10 text-center">
            <AlertTriangle class="mx-auto h-10 w-10 text-amber-600" />
            <h1 class="mt-3 text-xl font-extrabold text-[#2E0C49]">
              Link compartilhado indisponível ou expirado
            </h1>
            <p class="mt-1.5 text-sm text-zinc-600">
              Este link de carrinho não existe ou passou da validade de 30 dias.
            </p>
            <Link
              to="/categorias"
              class="mt-5 inline-flex h-10 items-center rounded-lg bg-[#93509e] px-5 text-xs font-bold text-white hover:bg-[#7c3f87]"
            >
              Explorar produtos
            </Link>
          </div>
        </Show>

        <Show when={!sharedCart.loading && !sharedCart.error && sharedCart()}>
          {(data) => (
            <div class="space-y-6">
              <div class="rounded-2xl border border-[#DFC2E3] bg-[#FCF8FD] p-5 sm:p-6">
                <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <span class="inline-flex items-center gap-1.5 rounded-full bg-[#F3E2F6] px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#93509e]">
                      <Share2 class="h-3 w-3" />
                      Carrinho Compartilhado
                    </span>
                    <h1 class="mt-2 text-xl font-extrabold text-[#2E0C49] sm:text-2xl">
                      {data().title || "Seleção pronta para seu pedido"}
                    </h1>
                    <p class="mt-1 flex items-center gap-1.5 text-xs text-[#5B486B]">
                      <Clock class="h-3.5 w-3.5" />
                      Preços e estoque conferidos em tempo real • Válido até{" "}
                      {new Date(data().expires_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <div class="text-left sm:text-right">
                    <p class="text-xs text-zinc-500">Total estimado atual</p>
                    <p class="text-2xl font-black text-[#93509e]">
                      {formatCents(data().estimated_total_cents)}
                    </p>
                  </div>
                </div>

                <div class="mt-5 flex flex-col gap-2.5 sm:flex-row">
                  <button
                    type="button"
                    disabled={data().available_items_count === 0 || importing()}
                    onClick={() => void handleImport(false)}
                    class="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#93509e] px-5 text-xs font-bold uppercase tracking-wide text-white hover:bg-[#7c3f87] disabled:opacity-50"
                  >
                    <ShoppingCart class="h-4 w-4" />
                    {importing()
                      ? "Adicionando..."
                      : "Adicionar seleção ao meu carrinho"}
                  </button>
                  <button
                    type="button"
                    disabled={data().available_items_count === 0 || importing()}
                    onClick={() => void handleImport(true)}
                    class="inline-flex h-11 items-center justify-center rounded-xl border border-[#93509e] bg-white px-5 text-xs font-bold text-[#93509e] hover:bg-[#FCF8FD] disabled:opacity-50"
                  >
                    Adicionar e ir ao carrinho
                  </button>
                </div>

                <Show when={feedback()}>
                  <p
                    role="status"
                    class="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900"
                  >
                    <CheckCircle2 class="h-4 w-4 shrink-0" />
                    {feedback()}
                  </p>
                </Show>

                <Show when={importError()}>
                  <p
                    role="alert"
                    class="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800"
                  >
                    {importError()}
                  </p>
                </Show>
              </div>

              <div class="space-y-3">
                <For each={data().items}>
                  {(item) => (
                    <div class="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-4">
                      <div class="flex min-w-0 flex-1 items-center gap-3">
                        <img
                          src={item.image_url || "/placeholder-product.svg"}
                          alt={item.product_name}
                          class="h-16 w-16 shrink-0 rounded-lg border border-zinc-100 object-contain p-1"
                        />
                        <div class="min-w-0">
                          <Link
                            to="/produto/$slug"
                            params={{ slug: item.product_slug }}
                            class="line-clamp-1 text-sm font-bold text-[#2E0C49] hover:text-[#93509e]"
                          >
                            {item.product_name}
                          </Link>
                          <div class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-600">
                            <Show when={item.color_hex}>
                              <span
                                class="inline-block h-3 w-3 rounded-full border border-black/15"
                                style={{ "background-color": item.color_hex! }}
                              />
                            </Show>
                            <span>{item.variant_name}</span>
                            <span class="text-zinc-400">• SKU {item.sku}</span>
                          </div>
                          <p class="mt-1 text-xs">
                            <Show
                              when={item.in_stock}
                              fallback={
                                <span class="font-bold text-red-600">
                                  Esgotado no momento
                                </span>
                              }
                            >
                              <span class="font-semibold text-emerald-700">
                                Qtd desejada: {item.desired_quantity}{" "}
                                (Disponível: {item.available_stock})
                              </span>
                            </Show>
                          </p>
                        </div>
                      </div>

                      <div class="text-right">
                        <p class="text-xs text-zinc-500">
                          Unit. {formatCents(item.unit_price_cents)}
                        </p>
                        <p class="text-sm font-extrabold text-[#2E0C49]">
                          {formatCents(item.subtotal_cents)}
                        </p>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>
          )}
        </Show>
      </div>
    </StoreShell>
  );
}
