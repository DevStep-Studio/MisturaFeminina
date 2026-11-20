import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import AlertTriangle from "lucide-solid/icons/triangle-exclamation-point";
import ArrowRight from "lucide-solid/icons/arrow-right";
import CheckCircle2 from "lucide-solid/icons/circle-check";
import ShoppingBag from "lucide-solid/icons/shopping-bag";
import Sparkles from "lucide-solid/icons/sparkles";
import { For, Show, createResource, createSignal } from "solid-js";
import { StoreShell } from "../features/storefront/components/StoreShell";
import {
  cartHeaders,
  refreshCart,
  writeCartToken,
} from "../features/storefront/store";
import { ApiError, api } from "../lib/api";
import { assetUrl, formatCents } from "../lib/format";
import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/checkout/assistido/$token")({
  head: () =>
    seoHead({
      title: "Seu Pedido Assistido — Mistura Feminina Cosméticos",
      description:
        "Confira os produtos selecionados pelo atendimento da Mistura Feminina e finalize com frete e pagamento oficial.",
      path: "/checkout/assistido",
      noindex: true,
    }),
  component: AssistedCheckoutHandoffPage,
});

interface AssistedOrderPublicPayload {
  id: number;
  order_code: string;
  token: string;
  status: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  coupon_code: string | null;
  notes: string | null;
  subtotal_cents: number;
  estimated_total_cents: number;
  expires_at: string | null;
  items: Array<{
    id: number;
    variant_id: number;
    product_name: string;
    variant_name: string;
    shade_code: string | null;
    color_hex: string | null;
    sku: string;
    image_url: string | null;
    quantity: number;
    unit_price_cents: number;
    line_total_cents: number;
    available_stock: number;
    in_stock: boolean;
  }>;
}

export const ASSISTED_CHECKOUT_STORAGE_KEY = "mf_assisted_checkout";

function AssistedCheckoutHandoffPage() {
  const params = Route.useParams();
  const navigate = useNavigate();
  const [loadingCart, setLoadingCart] = createSignal(false);
  const [actionError, setActionError] = createSignal<string | null>(null);

  const [assisted] = createResource(
    () => params().token,
    async (token) => {
      const res = await api<{ data: AssistedOrderPublicPayload }>(
        `/checkout/assisted/${encodeURIComponent(token)}`,
        { authenticated: false },
      );
      return res.data;
    },
  );

  async function proceedToOfficialCheckout(order: AssistedOrderPublicPayload) {
    setLoadingCart(true);
    setActionError(null);
    try {
      const res = await api<{
        data: {
          cart: { token: string };
          stock_warnings?: string[];
        };
      }>(`/checkout/assisted/${encodeURIComponent(order.token)}/load-cart`, {
        method: "POST",
        authenticated: false,
        headers: cartHeaders(),
      });

      writeCartToken(res.data.cart.token);

      try {
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.setItem(
            ASSISTED_CHECKOUT_STORAGE_KEY,
            JSON.stringify({
              token: order.token,
              order_code: order.order_code,
              customer_name: order.customer_name,
              customer_email: order.customer_email,
              customer_phone: order.customer_phone,
              stock_warnings: res.data.stock_warnings ?? [],
            }),
          );
        }
      } catch {
        // ignore storage restriction
      }

      await refreshCart().catch(() => null);
      await navigate({ to: "/checkout" });
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível carregar os itens no carrinho. Tente novamente.",
      );
    } finally {
      setLoadingCart(false);
    }
  }

  return (
    <StoreShell>
      <div class="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:py-12">
        <Show when={assisted.loading}>
          <div class="rounded-2xl border border-[#DFC2E3] bg-white p-8 text-center">
            <div class="mx-auto mb-3 size-8 animate-spin rounded-full border-2 border-[#DFC2E3] border-t-[#93509e]" />
            <p class="text-sm font-semibold text-[#5B486B]">
              Carregando seleção preparada pelo nosso atendimento...
            </p>
          </div>
        </Show>

        <Show when={assisted.error}>
          <div class="rounded-2xl border border-red-200 bg-white p-6 text-center shadow-xs sm:p-8">
            <AlertTriangle class="mx-auto mb-3 size-10 text-red-500" />
            <h1 class="text-xl font-black text-zinc-900">
              Link indisponível ou expirado
            </h1>
            <p class="mt-2 text-sm text-zinc-600">
              {(assisted.error as Error)?.message ||
                "Este pedido assistido não foi encontrado, já foi finalizado ou expirou."}
            </p>
            <div class="mt-6 flex justify-center gap-3">
              <Link
                to="/"
                class="rounded-full bg-[#93509e] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#7c3f87]"
              >
                Ir para a loja
              </Link>
              <Link
                to="/checkout"
                class="rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
              >
                Ver meu carrinho
              </Link>
            </div>
          </div>
        </Show>

        <Show when={assisted()}>
          {(order) => {
            const hasOutOfStock = () =>
              order().items.some((i) => !i.in_stock || i.available_stock <= 0);
            const canCheckout = () =>
              order().items.some((i) => i.available_stock > 0);

            return (
              <div class="space-y-6">
                <header class="rounded-2xl border border-[#DFC2E3] bg-gradient-to-br from-[#FCF8FD] via-white to-[#F9F4FB] p-6 shadow-xs">
                  <span class="inline-flex items-center gap-1.5 rounded-full bg-[#F3E2F6] px-3 py-1 text-[11px] font-bold text-[#93509e]">
                    <Sparkles class="size-3.5" />
                    Atendimento Mistura Feminina · {order().order_code}
                  </span>
                  <h1 class="mt-3 text-2xl font-black tracking-tight text-[#2E0C49]">
                    {order().customer_name
                      ? `Olá, ${order().customer_name}! Preparamos sua seleção`
                      : "Confira os itens preparados para você"}
                  </h1>
                  <p class="mt-1 text-sm text-[#5B486B]">
                    Preços e estoque foram verificados em tempo real agora. Na
                    próxima etapa você escolhe o frete, endereço e forma de
                    pagamento oficial.
                  </p>
                  <Show when={order().notes}>
                    <p class="mt-3 rounded-xl border border-[#DFC2E3] bg-white px-3.5 py-2.5 text-xs text-[#2E0C49]">
                      <strong>Observação do atendimento:</strong>{" "}
                      {order().notes}
                    </p>
                  </Show>
                </header>

                <Show when={hasOutOfStock()}>
                  <div class="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                    <AlertTriangle class="mt-0.5 size-4 shrink-0 text-amber-600" />
                    <p>
                      Alguns itens tiveram alteração de disponibilidade desde a
                      montagem do link. Ao continuar, apenas as quantidades
                      disponíveis serão carregadas no seu carrinho.
                    </p>
                  </div>
                </Show>

                <Show when={actionError()}>
                  <div class="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-800">
                    {actionError()}
                  </div>
                </Show>

                <section class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xs">
                  <div class="border-b border-zinc-100 px-5 py-3.5">
                    <h2 class="flex items-center gap-2 text-sm font-extrabold text-zinc-900">
                      <ShoppingBag class="size-4 text-[#93509e]" />
                      Produtos selecionados ({order().items.length})
                    </h2>
                  </div>

                  <ul class="divide-y divide-zinc-100">
                    <For each={order().items}>
                      {(item) => (
                        <li class="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                          <div class="flex items-center gap-3 min-w-0">
                            <img
                              src={assetUrl(item.image_url)}
                              alt={item.product_name}
                              class="size-14 shrink-0 rounded-xl border border-zinc-200 bg-zinc-50 object-contain"
                            />
                            <div class="min-w-0">
                              <p class="font-bold text-zinc-900">
                                {item.product_name}
                              </p>
                              <div class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-600">
                                <Show when={item.color_hex}>
                                  <span
                                    class="inline-block size-3 rounded-full border border-black/15"
                                    style={{
                                      "background-color": item.color_hex!,
                                    }}
                                  />
                                </Show>
                                <span>{item.variant_name}</span>
                                <Show when={item.shade_code}>
                                  <span class="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold">
                                    #{item.shade_code}
                                  </span>
                                </Show>
                                <span class="font-mono text-[11px] text-zinc-400">
                                  SKU {item.sku}
                                </span>
                              </div>
                              <p class="mt-1 text-[11px]">
                                <Show
                                  when={item.in_stock}
                                  fallback={
                                    <span class="font-bold text-amber-700">
                                      Disponível agora: {item.available_stock}{" "}
                                      un. (solicitado {item.quantity})
                                    </span>
                                  }
                                >
                                  <span class="inline-flex items-center gap-1 font-semibold text-emerald-700">
                                    <CheckCircle2 class="size-3" />
                                    Em estoque · {item.quantity} un. x{" "}
                                    {formatCents(item.unit_price_cents)}
                                  </span>
                                </Show>
                              </p>
                            </div>
                          </div>

                          <div class="text-right">
                            <p class="text-sm font-black text-zinc-900">
                              {formatCents(item.line_total_cents)}
                            </p>
                          </div>
                        </li>
                      )}
                    </For>
                  </ul>

                  <div class="flex flex-wrap items-center justify-between gap-4 border-t border-zinc-100 bg-zinc-50/70 px-5 py-4">
                    <div>
                      <p class="text-xs text-zinc-500">
                        Subtotal estimado dos produtos
                      </p>
                      <p class="text-xl font-black text-[#2E0C49]">
                        {formatCents(order().subtotal_cents)}
                      </p>
                      <Show when={order().coupon_code}>
                        <p class="mt-0.5 text-[11px] font-semibold text-[#93509e]">
                          Cupom pré-aplicado: {order().coupon_code}
                        </p>
                      </Show>
                    </div>

                    <button
                      type="button"
                      disabled={loadingCart() || !canCheckout()}
                      onClick={() => void proceedToOfficialCheckout(order())}
                      class="inline-flex h-11 items-center gap-2 rounded-full bg-[#93509e] px-6 text-sm font-bold text-white shadow-sm hover:bg-[#7c3f87] disabled:opacity-50"
                    >
                      {loadingCart()
                        ? "Preparando seu checkout..."
                        : "Continuar para entrega e pagamento"}
                      <ArrowRight class="size-4" />
                    </button>
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
