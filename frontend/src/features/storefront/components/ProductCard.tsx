import { Show, createSignal } from "solid-js";
import { Link } from "@tanstack/solid-router";
import CreditCard from "lucide-solid/icons/credit-card";
import { assetUrl, formatCents, whatsappUrl } from "../../../lib/format";
import { addCartItem, storefrontStore } from "../store";
import type { ProductCardData } from "../types";

export function ProductCard(props: {
  product: ProductCardData;
  borderless?: boolean;
  showFeaturedBadge?: boolean;
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
      class={`group relative flex h-full flex-col rounded-[4px] bg-white p-3 sm:p-4 transition-all ${
        props.borderless
          ? "border border-transparent"
          : "border border-zinc-200/70"
      }`}
    >
      <div class="relative aspect-square w-full overflow-hidden bg-white p-2">
        <Link
          to="/produto/$slug"
          params={{ slug: props.product.slug }}
          class="block h-full w-full"
        >
          <img
            src={assetUrl(props.product.primary_image)}
            alt={props.product.primary_image_alt}
            loading="lazy"
            class="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </Link>

        {/* Top-left Status Badges */}
        <div class="pointer-events-none absolute left-1 top-1 flex flex-col items-start gap-1.5">
          <Show when={props.product.in_stock && props.product.is_new_arrival}>
            <span class="rounded-full bg-[#C918BF] px-3 py-[3px] text-[9.5px] font-bold uppercase tracking-wide text-white">
              Lançamento
            </span>
          </Show>
          <Show
            when={
              props.product.in_stock &&
              props.showFeaturedBadge &&
              props.product.is_featured
            }
          >
            <span class="rounded-full bg-[#C918BF] px-3 py-[3px] text-[9.5px] font-bold uppercase tracking-wide text-white">
              Destaque
            </span>
          </Show>
        </div>

        {/* Top-right Discount or Out-of-Stock Badge */}
        <Show
          when={props.product.in_stock}
          fallback={
            <span class="pointer-events-none absolute right-1 top-1 rounded-full bg-[#EE0000] px-3.5 py-1 text-[10.5px] font-bold text-white">
              Esgotado
            </span>
          }
        >
          <Show when={props.product.discount_percent > 0}>
            <span class="pointer-events-none absolute right-1 top-1 flex size-10 flex-col items-center justify-center rounded-full bg-[#2F0572] text-[9.5px] font-extrabold leading-[1.05] text-white sm:size-11 sm:text-[10px]">
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
          class="line-clamp-2 min-h-[2.5rem] text-[13px] font-medium leading-snug text-[#2F0572] transition-colors hover:text-[#C918BF] sm:text-[13.5px]"
        >
          {props.product.name}
        </Link>

        <Show
          when={props.product.in_stock}
          fallback={
            <div class="mt-4 flex flex-1 flex-col items-center justify-center pb-3">
              <p class="text-[15px] font-bold text-[#2F0572]">Esgotado :(</p>
              <Link
                to="/produto/$slug"
                params={{ slug: props.product.slug }}
                class="mt-1 inline-flex items-center justify-center text-[11.5px] font-bold text-[#2F0572] transition-colors hover:text-[#C918BF] hover:underline"
              >
                Avise-me quando chegar ›
              </Link>
            </div>
          }
        >
          <div class="mt-2 flex flex-1 flex-col justify-center">
            <div class="flex items-baseline justify-center gap-1.5">
              <Show
                when={
                  props.product.effective_price_cents <
                  props.product.price_cents
                }
              >
                <span class="text-[12px] text-[#52436E] line-through">
                  {formatCents(props.product.price_cents)}
                </span>
              </Show>
              <span class="text-[16px] font-extrabold text-[#C918BF] sm:text-[17px]">
                {formatCents(props.product.effective_price_cents)}
              </span>
            </div>

            <Show when={props.product.installments_count > 1}>
              <p class="mt-1 flex items-center justify-center gap-1 text-[11.5px] text-[#2F0572]">
                <CreditCard
                  class="size-3.5 shrink-0 text-[#2F0572]"
                  aria-hidden="true"
                />
                <span>
                  ou{" "}
                  <strong class="font-bold text-[#C918BF]">
                    {props.product.installments_count}x
                  </strong>{" "}
                  de{" "}
                  <strong class="font-bold text-[#C918BF]">
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

          <div class="mt-3">
            <Show
              when={props.product.default_variant_id}
              fallback={
                <Link
                  to="/produto/$slug"
                  params={{ slug: props.product.slug }}
                  class="inline-flex h-[37px] w-full items-center justify-center rounded-full bg-[#5949E5] px-4 text-[13.5px] font-bold text-[#FFF3FF] transition hover:bg-[#4838D4]"
                >
                  Comprar
                </Link>
              }
            >
              <button
                type="button"
                disabled={adding()}
                onClick={() => void handleQuickBuy()}
                class="inline-flex h-[37px] w-full items-center justify-center rounded-full bg-[#5949E5] px-4 text-[13.5px] font-bold text-[#FFF3FF] transition hover:bg-[#4838D4] disabled:opacity-60"
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
              class="mt-2 flex h-[32px] w-full items-center justify-center gap-1.5 rounded-full border border-[#13B918] bg-[#F3FBF3] px-3 text-[11.5px] font-medium text-[#0D8211] transition hover:bg-[#13B918] hover:text-white"
            >
              <svg
                viewBox="0 0 24 24"
                class="size-3.5 shrink-0 fill-current"
                aria-hidden="true"
              >
                <path d="M12.03 2a9.94 9.94 0 0 0-8.6 14.95L2 22l5.2-1.36A9.95 9.95 0 1 0 12.03 2Zm0 18.1a8.13 8.13 0 0 1-4.14-1.13l-.3-.18-3.09.81.83-3.01-.2-.31a8.15 8.15 0 1 1 7 3.82Zm4.47-6.1c-.25-.12-1.45-.72-1.67-.8s-.39-.12-.55.12-.63.8-.78.96-.28.19-.53.06a6.68 6.68 0 0 1-1.97-1.22 7.36 7.36 0 0 1-1.36-1.7c-.14-.24-.01-.38.11-.5.11-.11.24-.29.37-.43.12-.14.16-.25.24-.41s.04-.31-.02-.43-.55-1.33-.76-1.82c-.2-.48-.4-.41-.55-.42h-.47a.9.9 0 0 0-.65.31 2.75 2.75 0 0 0-.86 2.05c0 1.21.88 2.38 1 2.54s1.73 2.64 4.19 3.7c.59.25 1.04.41 1.4.52.59.19 1.12.16 1.54.1.47-.07 1.45-.59 1.66-1.17s.21-1.07.14-1.17-.22-.16-.47-.28Z" />
              </svg>
              <span class="whitespace-nowrap">Comprar pelo Whats</span>
            </a>
          </div>
        </Show>
      </div>
    </article>
  );
}
