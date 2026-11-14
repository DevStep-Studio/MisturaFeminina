import { Show, createSignal } from "solid-js";
import { Link } from "@tanstack/solid-router";
import MessageCircle from "lucide-solid/icons/message-circle";
import ShoppingBag from "lucide-solid/icons/shopping-bag";
import { assetUrl, formatCents, whatsappUrl } from "../../../lib/format";
import { addCartItem, storefrontStore } from "../store";
import type { ProductCardData } from "../types";

export function ProductCard(props: { product: ProductCardData }) {
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
    <article class="flex h-full flex-col rounded-xl border border-line bg-white p-3 transition-shadow hover:shadow-md">
      <div class="relative aspect-square overflow-hidden rounded-lg bg-[#FAF7F8]">
        <Link
          to="/produto/$slug"
          params={{ slug: props.product.slug }}
          class="block h-full w-full"
        >
          <img
            src={assetUrl(props.product.primary_image)}
            alt={props.product.primary_image_alt}
            loading="lazy"
            class="h-full w-full object-contain p-3"
          />
        </Link>

        {/* Top-left Status Badges */}
        <div class="pointer-events-none absolute left-2 top-2 flex flex-col gap-1">
          <Show when={!props.product.in_stock}>
            <span class="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-zinc-900 text-white">
              Esgotado
            </span>
          </Show>
          <Show when={props.product.in_stock && props.product.is_new_arrival}>
            <span
              class="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
              style={{ "background-color": "var(--mf-accent)" }}
            >
              Lançamento
            </span>
          </Show>
        </div>

        {/* Top-right Discount Badge */}
        <Show when={props.product.discount_percent > 0}>
          <span
            class="pointer-events-none absolute right-2 top-2 flex size-10 flex-col items-center justify-center rounded-full text-[10px] font-extrabold leading-tight text-white"
            style={{ "background-color": "var(--mf-secondary)" }}
          >
            <span>-{props.product.discount_percent}%</span>
            <span>OFF</span>
          </span>
        </Show>
      </div>

      <div class="mt-3 flex flex-1 flex-col">
        <Show when={props.product.brand}>
          <span class="text-[11px] font-medium uppercase tracking-wider text-muted">
            {props.product.brand?.name}
          </span>
        </Show>

        <Link
          to="/produto/$slug"
          params={{ slug: props.product.slug }}
          class="mt-1 line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-ink hover:text-brand-600"
        >
          {props.product.name}
        </Link>

        <div class="mt-2 flex-1">
          <Show
            when={
              props.product.effective_price_cents < props.product.price_cents
            }
          >
            <p class="text-xs text-zinc-600 line-through">
              {formatCents(props.product.price_cents)}
            </p>
          </Show>
          <p class="text-lg font-extrabold text-brand-600">
            {formatCents(props.product.effective_price_cents)}
          </p>
          <Show when={props.product.installments_count > 1}>
            <p class="text-[11px] text-muted">
              ou{" "}
              <strong class="text-ink">
                {props.product.installments_count}x de{" "}
                {formatCents(props.product.installment_cents)}
              </strong>{" "}
              sem juros
            </p>
          </Show>
        </div>

        <Show when={feedback()}>
          <p class="mt-1 text-xs font-medium text-danger">{feedback()}</p>
        </Show>

        <div class="mt-3 space-y-1.5">
          <Show
            when={props.product.in_stock}
            fallback={
              <Link
                to="/produto/$slug"
                params={{ slug: props.product.slug }}
                class="inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-zinc-900 bg-white px-3 text-xs font-bold text-zinc-900 hover:bg-zinc-100"
              >
                Avise-me quando chegar
              </Link>
            }
          >
            <Show
              when={!props.product.has_multiple_variants}
              fallback={
                <Link
                  to="/produto/$slug"
                  params={{ slug: props.product.slug }}
                  class="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-bold text-white"
                  style={{ "background-color": "var(--mf-primary)" }}
                >
                  <ShoppingBag class="size-3.5" aria-hidden="true" />
                  <span>Escolher opção</span>
                </Link>
              }
            >
              <button
                type="button"
                disabled={adding()}
                onClick={() => void handleQuickBuy()}
                class="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-bold text-white disabled:opacity-60"
                style={{ "background-color": "var(--mf-primary)" }}
              >
                <ShoppingBag class="size-3.5" aria-hidden="true" />
                <span>{adding() ? "Adicionando…" : "Comprar"}</span>
              </button>
            </Show>
          </Show>

          <a
            href={whatsappUrl(
              settings().whatsapp_number,
              `Olá! Tenho interesse no produto: ${props.product.name} (SKU ${props.product.sku})`,
            )}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-600 bg-white px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            <MessageCircle class="size-3.5" aria-hidden="true" />
            <span>Comprar pelo WhatsApp</span>
          </a>
        </div>
      </div>
    </article>
  );
}
