import { Show, createSignal } from "solid-js";
import { Link } from "@tanstack/solid-router";
import CreditCard from "lucide-solid/icons/credit-card";
import MessageCircle from "lucide-solid/icons/message-circle";
import { assetUrl, formatCents, whatsappUrl } from "../../../lib/format";
import { addCartItem, storefrontStore } from "../store";
import type { ProductCardData } from "../types";

export function ProductCard(props: {
  product: ProductCardData;
  borderless?: boolean;
}) {
  const [adding, setAdding] = createSignal(false);
  const [feedback, setFeedback] = createSignal("");
  const settings = () => storefrontStore.settings();

  const handleQuickBuy = async () => {
    if (!props.product.default_variant_id || !props.product.in_stock) return;
    setAdding(true);
    setFeedback("");
    try {
      await addCartItem(props.product.default_variant_id, 1, true);
    } catch {
      setFeedback("Indisponível");
    } finally {
      setAdding(false);
    }
  };

  return (
    <article
      class={`flex h-full flex-col rounded-xl border bg-white p-3.5 transition-shadow ${
        props.borderless
          ? "border-transparent shadow-none hover:shadow-sm"
          : "border-zinc-200/80 shadow-[0_2px_10px_rgba(0,0,0,0.03)] hover:shadow-md"
      }`}
    >
      <div class="relative aspect-square overflow-hidden rounded-lg bg-white">
        <Link
          to="/produto/$slug"
          params={{ slug: props.product.slug }}
          class="block h-full w-full"
        >
          <img
            src={assetUrl(props.product.primary_image)}
            alt={props.product.primary_image_alt}
            loading="lazy"
            class="h-full w-full object-contain p-2"
          />
        </Link>

        {/* Top-left Status Badges */}
        <div class="pointer-events-none absolute left-1 top-1 flex flex-col gap-1">
          <Show when={props.product.in_stock && props.product.is_new_arrival}>
            <span class="rounded-full bg-[#C22583] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white sm:px-2.5 sm:text-[10px]">
              Lançamento
            </span>
          </Show>
        </div>

        {/* Top-right Discount or Out-of-Stock Badge */}
        <Show
          when={props.product.in_stock}
          fallback={
            <span class="pointer-events-none absolute right-1 top-1 rounded-full bg-red-600 px-3 py-1 text-[10px] font-bold text-white">
              Esgotado
            </span>
          }
        >
          <Show when={props.product.discount_percent > 0}>
            <span class="pointer-events-none absolute right-1 top-1 flex size-10 flex-col items-center justify-center rounded-full bg-[#3D1260] text-[9px] font-extrabold leading-tight text-white sm:size-11 sm:text-[10px]">
              <span>-{props.product.discount_percent}%</span>
              <span>OFF</span>
            </span>
          </Show>
        </Show>
      </div>

      <div class="mt-2.5 flex flex-1 flex-col text-center">
        <Link
          to="/produto/$slug"
          params={{ slug: props.product.slug }}
          class="line-clamp-2 min-h-[2.4rem] text-[13px] font-bold leading-snug text-[#3D1260] transition-colors hover:text-[#C22583]"
        >
          {props.product.name}
        </Link>

        <Show
          when={props.product.in_stock}
          fallback={
            <div class="mt-4 flex flex-1 flex-col items-center justify-center pb-4">
              <p class="text-base font-bold text-[#3D1260]">Esgotado :(</p>
              <Link
                to="/produto/$slug"
                params={{ slug: props.product.slug }}
                class="mt-1.5 inline-flex items-center justify-center text-xs font-bold text-[#3D1260] transition-colors hover:text-[#C22583] hover:underline"
              >
                Avise-me quando chegar ›
              </Link>
            </div>
          }
        >
          <div class="mt-2.5 flex-1">
            <div class="flex items-baseline justify-center gap-1.5">
              <Show
                when={
                  props.product.effective_price_cents <
                  props.product.price_cents
                }
              >
                <span class="text-xs text-zinc-500 line-through">
                  {formatCents(props.product.price_cents)}
                </span>
              </Show>
              <span class="text-[17px] font-extrabold text-[#C22583]">
                {formatCents(props.product.effective_price_cents)}
              </span>
            </div>

            <Show when={props.product.installments_count > 1}>
              <p class="mt-1 flex items-center justify-center gap-1 text-[11px] text-[#3D1260]">
                <CreditCard class="size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  ou{" "}
                  <strong class="font-bold text-[#C22583]">
                    {props.product.installments_count}x
                  </strong>{" "}
                  de{" "}
                  <strong class="font-bold text-[#C22583]">
                    {formatCents(props.product.installment_cents)}
                  </strong>{" "}
                  Sem juros
                </span>
              </p>
            </Show>
          </div>

          <Show when={feedback()}>
            <p class="mt-1 text-xs font-medium text-danger">{feedback()}</p>
          </Show>

          <div class="mt-3 space-y-2">
            <Show
              when={!props.product.has_multiple_variants}
              fallback={
                <Link
                  to="/produto/$slug"
                  params={{ slug: props.product.slug }}
                  class="inline-flex min-h-9 w-full items-center justify-center rounded-full bg-[#62298D] px-3 py-1.5 text-center text-xs font-bold leading-tight text-white transition-colors hover:bg-[#4C1D70] sm:px-4"
                >
                  Escolher opção
                </Link>
              }
            >
              <button
                type="button"
                disabled={adding()}
                onClick={() => void handleQuickBuy()}
                class="inline-flex min-h-9 w-full items-center justify-center rounded-full bg-[#62298D] px-3 py-1.5 text-xs font-bold leading-tight text-white transition-colors hover:bg-[#4C1D70] disabled:opacity-60 sm:px-4"
              >
                {adding() ? "Adicionando…" : "Comprar"}
              </button>
            </Show>

            <a
              href={whatsappUrl(
                settings().whatsapp_number,
                `Olá! Tenho interesse no produto: ${props.product.name} (SKU ${props.product.sku})`,
              )}
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex min-h-8 w-full items-center justify-center gap-1 rounded-full border border-emerald-500 bg-white px-2 py-1 text-[10.5px] font-semibold leading-tight text-emerald-700 transition-colors hover:bg-emerald-50 sm:gap-1.5 sm:px-3 sm:text-[11px]"
            >
              <MessageCircle
                class="size-3 shrink-0 sm:size-3.5"
                aria-hidden="true"
              />
              <span class="whitespace-nowrap">Comprar pelo Whats</span>
            </a>
          </div>
        </Show>
      </div>
    </article>
  );
}
