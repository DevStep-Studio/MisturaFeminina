import { ProductImage } from "./ProductImage";
import { For, Show, createSignal } from "solid-js";
import { Link } from "@tanstack/solid-router";
import Bell from "lucide-solid/icons/bell";
import Boxes from "lucide-solid/icons/boxes";
import CreditCard from "lucide-solid/icons/credit-card";
import GitCompareArrows from "lucide-solid/icons/git-compare-arrows";
import { formatCents, whatsappUrl } from "../../../lib/format";
import { trackAddToCart, trackSelectItem } from "../../../monitoring/analytics";
import { isProductInComparator, toggleComparatorProduct } from "../comparator";
import { addCartItem, storefrontStore } from "../store";
import { computeWholesaleUnitPrice } from "../wholesale";
import type { ProductCardData } from "../types";

export function ProductCard(props: {
  product: ProductCardData;
  borderless?: boolean;
  showFeaturedBadge?: boolean;
  defaultWholesale?: boolean;
}) {
  const [adding, setAdding] = createSignal(false);
  const [feedback, setFeedback] = createSignal("");
  const settings = () => storefrontStore.settings();

  const hasWholesale = () =>
    Boolean(props.product.wholesale_condition?.has_wholesale);
  const minWholesaleQty = () =>
    props.product.wholesale_condition?.min_quantity ?? 6;
  const wholesaleTiers = () => props.product.wholesale_condition?.tiers ?? [];

  const isWholesaleRoute = () =>
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/atacado");

  const [isWholesaleSelected, setIsWholesaleSelected] = createSignal(
    Boolean(hasWholesale() && (props.defaultWholesale || isWholesaleRoute())),
  );

  const wholesaleStartingPriceCents = () =>
    props.product.wholesale_condition?.starting_price_cents ??
    props.product.effective_price_cents;

  const wholesaleUnitPriceCents = () => {
    if (!hasWholesale()) return props.product.effective_price_cents;
    const tiers = wholesaleTiers();
    if (tiers.length === 0) {
      return wholesaleStartingPriceCents();
    }
    const pricing = computeWholesaleUnitPrice(
      props.product.effective_price_cents,
      minWholesaleQty(),
      tiers,
    );
    return pricing.unitPriceCents;
  };

  const currentUnitPriceCents = () => {
    if (isWholesaleSelected()) {
      return wholesaleUnitPriceCents();
    }
    return props.product.effective_price_cents;
  };

  const buyQty = () => (isWholesaleSelected() ? minWholesaleQty() : 1);
  const totalWholesalePackCents = () =>
    wholesaleUnitPriceCents() * minWholesaleQty();

  const handleQuickBuy = async () => {
    if (!props.product.default_variant_id || !props.product.in_stock) return;
    const qtyToBuy = buyQty();
    const unitPrice = currentUnitPriceCents();
    setAdding(true);
    setFeedback("");
    try {
      await addCartItem(props.product.default_variant_id, qtyToBuy, true);
      trackAddToCart({
        currency: "BRL",
        value: (unitPrice * qtyToBuy) / 100,
        items: [
          {
            item_id: props.product.sku,
            item_name: props.product.name,
            price: unitPrice / 100,
            item_brand: props.product.brand?.name,
            quantity: qtyToBuy,
          },
        ],
      });
    } catch {
      setFeedback("Indisponível");
    } finally {
      setAdding(false);
    }
  };

  return (
    <article
      class={`mf-card-stagger group relative flex h-full flex-col rounded-[6px] bg-white px-2.5 py-3 sm:p-4 transition-all ${
        props.borderless
          ? "border border-transparent"
          : "border border-zinc-200/80 hover:border-[#93509e]/40 hover:shadow-[0_4px_16px_rgba(147,80,158,0.08)]"
      }`}
    >
      <div class="relative aspect-square w-full overflow-hidden bg-white p-2">
        <Link
          to="/produto/$slug"
          params={{ slug: props.product.slug }}
          onClick={() =>
            trackSelectItem({
              items: [
                {
                  item_id: props.product.sku,
                  item_name: props.product.name,
                  price: props.product.effective_price_cents / 100,
                  item_brand: props.product.brand?.name,
                },
              ],
            })
          }
          class="block h-full w-full"
        >
          <ProductImage
            src={props.product.primary_image}
            alt={props.product.primary_image_alt || props.product.name}
            width="300"
            height="300"
            loading="lazy"
            decoding="async"
            class="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </Link>

        {/* Top-left Status Badges */}
        <div class="pointer-events-none absolute left-1.5 top-1.5 flex flex-col items-start gap-1">
          <Show when={props.product.in_stock && props.product.is_new_arrival}>
            <span class="inline-flex items-center rounded-md border border-[#E5D4F0] bg-[#FAF5FD]/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#3D1260] shadow-2xs backdrop-blur-xs">
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
            <span class="inline-flex items-center rounded-md border border-[#F2D0E6] bg-[#FDF4F9]/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8A145C] shadow-2xs backdrop-blur-xs">
              Destaque
            </span>
          </Show>
        </div>

        {/* Top-right Discount or Out-of-Stock Badge */}
        <Show
          when={props.product.in_stock}
          fallback={
            <span class="pointer-events-none absolute right-1.5 top-1.5 inline-flex items-center rounded-md border border-zinc-200 bg-zinc-100/95 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-700 shadow-2xs backdrop-blur-xs">
              Esgotado
            </span>
          }
        >
          <Show when={props.product.discount_percent > 0}>
            <span class="pointer-events-none absolute right-1.5 top-1.5 inline-flex items-center rounded-md bg-[#2E0C49] px-2 py-0.5 text-[10px] font-bold tracking-[0.06em] text-white shadow-2xs">
              -{props.product.discount_percent}% OFF
            </span>
          </Show>
        </Show>
      </div>

      <div class="mt-2.5 flex flex-1 flex-col text-center">
        <Link
          to="/produto/$slug"
          params={{ slug: props.product.slug }}
          class="line-clamp-2 h-[2.6rem] text-[13px] font-medium leading-snug text-[#2F0572] transition-colors hover:text-[#C918BF] sm:text-[13.5px]"
          title={props.product.name}
        >
          {props.product.name}
        </Link>

        <Show
          when={props.product.in_stock}
          fallback={
            <div class="mt-auto flex flex-col items-center justify-end pt-4 pb-1">
              <div class="flex flex-col items-center text-center">
                <span class="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold tracking-tight text-zinc-700 sm:text-[12px]">
                  <span
                    class="h-1.5 w-1.5 rounded-full bg-zinc-400"
                    aria-hidden="true"
                  />
                  Indisponível no momento
                </span>
                <p class="mt-0.5 text-[9.5px] font-medium leading-tight text-zinc-500 sm:text-[10.5px]">
                  Receba um alerta assim que voltar
                </p>
              </div>
              <Link
                to="/produto/$slug"
                params={{ slug: props.product.slug }}
                class="group/notify mt-3 inline-flex h-[34px] w-full items-center justify-center gap-1.5 rounded-lg border border-[#93509e] bg-white px-2 text-[11px] font-semibold whitespace-nowrap tracking-tight text-[#93509e] transition-all duration-300 ease-out hover:bg-[#93509e] hover:text-white"
              >
                <Bell
                  class="h-3.5 w-3.5 shrink-0 transition-transform duration-300 group-hover/notify:-rotate-12 group-hover/notify:scale-110"
                  aria-hidden="true"
                />
                <span class="whitespace-nowrap">Avise-me quando chegar</span>
              </Link>
            </div>
          }
        >
          {/* Bloco de Preços Consistente */}
          <div class="mt-2 flex min-h-[46px] flex-col items-center justify-center">
            <Show
              when={isWholesaleSelected()}
              fallback={
                <>
                  <div class="flex items-baseline justify-center gap-1.5">
                    <Show
                      when={
                        props.product.effective_price_cents <
                        props.product.price_cents
                      }
                    >
                      <span class="text-[12px] font-normal text-zinc-400 line-through">
                        {formatCents(props.product.price_cents)}
                      </span>
                    </Show>
                    <span class="text-[17px] font-black tracking-tight text-[#8E237C] sm:text-[18px]">
                      {formatCents(props.product.effective_price_cents)}
                    </span>
                  </div>

                  <div class="mt-0.5 flex h-[18px] items-center justify-center text-[11px] text-zinc-500">
                    <Show
                      when={props.product.installments_count > 1}
                      fallback={
                        <span class="text-[10.5px] text-zinc-400">
                          À vista no Pix ou Boleto
                        </span>
                      }
                    >
                      <span class="inline-flex items-center gap-1">
                        <CreditCard
                          class="size-3 text-zinc-400"
                          aria-hidden="true"
                        />
                        <span>
                          ou{" "}
                          <strong class="font-semibold text-zinc-700">
                            {props.product.installments_count}x
                          </strong>{" "}
                          de{" "}
                          <strong class="font-semibold text-zinc-700">
                            {formatCents(props.product.installment_cents)}
                          </strong>{" "}
                          s/ juros
                        </span>
                      </span>
                    </Show>
                  </div>
                </>
              }
            >
              <div class="flex items-baseline justify-center gap-1.5">
                <span class="text-[12px] font-normal text-zinc-400 line-through">
                  {formatCents(props.product.effective_price_cents)}
                </span>
                <span class="text-[18px] font-black tracking-tight text-[#93509e] sm:text-[19px]">
                  {formatCents(wholesaleUnitPriceCents())}
                </span>
                <span class="text-[11px] font-bold text-[#93509e]">/un.</span>
              </div>
              <div class="mt-0.5 flex h-[18px] items-center justify-center gap-1 text-[11px] font-medium text-emerald-700">
                <span>
                  Total pacote:{" "}
                  <strong class="font-bold">
                    {formatCents(totalWholesalePackCents())}
                  </strong>{" "}
                  ({minWholesaleQty()} un.)
                </span>
              </div>
            </Show>
          </div>

          {/* Exibição Elegante do Atacado (Slot de Altura Fixa 34px para Alinhamento Perfeito) */}
          <div class="mt-2 flex h-[34px] items-center justify-center">
            <Show
              when={hasWholesale()}
              fallback={<div class="h-[34px]" aria-hidden="true" />}
            >
              <button
                type="button"
                onClick={() => setIsWholesaleSelected((prev) => !prev)}
                class={`group/wholesale inline-flex h-[30px] max-w-full items-center justify-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-all duration-200 whitespace-nowrap ${
                  isWholesaleSelected()
                    ? "border-[#93509e] bg-[#FAF3FC] text-[#7C2784] ring-1 ring-[#93509e]/40 shadow-xs"
                    : "border-[#ECD4EF] bg-[#FDF8FD] text-[#6E2E78] hover:border-[#93509e] hover:bg-[#FAF3FC]"
                }`}
                title={
                  isWholesaleSelected()
                    ? "Preço de atacado ativo. Clique para voltar ao varejo."
                    : "Clique para ativar a faixa de atacado"
                }
              >
                <Boxes
                  class="size-3.5 shrink-0 text-[#93509e]"
                  aria-hidden="true"
                />
                <Show
                  when={isWholesaleSelected()}
                  fallback={
                    <span class="whitespace-nowrap">
                      Atacado: a partir de{" "}
                      <strong class="font-bold text-[#93509e]">
                        {formatCents(wholesaleStartingPriceCents())}
                      </strong>
                      {" "}({minWholesaleQty()}+ un.)
                    </span>
                  }
                >
                  <span class="font-bold text-emerald-700 whitespace-nowrap">
                    ✓ Atacado Ativo ({minWholesaleQty()} un.)
                  </span>
                </Show>
              </button>
            </Show>
          </div>

          <Show when={(props.product.specs?.length ?? 0) > 0}>
            <div class="mt-1.5 flex min-h-[20px] flex-wrap items-center justify-center gap-1">
              <For each={(props.product.specs ?? []).slice(0, 2)}>
                {(spec) => (
                  <span class="rounded bg-[#FAF6FC] px-1.5 py-0.5 text-[10px] font-semibold text-[#5B486B]">
                    {spec.value}
                  </span>
                )}
              </For>
            </div>
          </Show>

          <Show when={feedback()}>
            <p class="mt-1 text-xs font-medium text-danger">{feedback()}</p>
          </Show>

          {/* Botões de Ação Ancorados na Base (Alinhamento Horizontal Perfeito) */}
          <div class="mt-auto pt-3">
            <Show
              when={props.product.default_variant_id}
              fallback={
                <Link
                  to="/produto/$slug"
                  params={{ slug: props.product.slug }}
                  class="mf-btn-buy inline-flex h-[37px] w-full items-center justify-center rounded-lg px-4 text-[13px] font-bold whitespace-nowrap"
                >
                  {isWholesaleSelected()
                    ? "Ver Opções de Atacado"
                    : "Ver Opções"}
                </Link>
              }
            >
              <button
                type="button"
                disabled={adding()}
                onClick={() => void handleQuickBuy()}
                class="mf-btn-buy inline-flex h-[37px] w-full items-center justify-center rounded-lg px-3 text-[13px] font-bold disabled:opacity-60 whitespace-nowrap"
              >
                {adding()
                  ? "Adicionando…"
                  : isWholesaleSelected()
                  ? "Comprar no Atacado"
                  : "Comprar"}
              </button>
            </Show>

            <a
              href={whatsappUrl(
                settings().whatsapp_number,
                `Olá! Tenho interesse no produto: ${props.product.name} (SKU ${props.product.sku})`,
              )}
              target="_blank"
              rel="noopener noreferrer"
              class="mf-btn-whats mt-2 flex h-[32px] w-full items-center justify-center gap-1.5 rounded-lg px-3 text-[11.5px] font-medium"
            >
              <svg
                viewBox="0 0 24 24"
                class="size-3.5 shrink-0 fill-current"
                aria-hidden="true"
              >
                <path d="M12.03 2a9.94 9.94 0 0 0-8.6 14.95L2 22l5.2-1.36A9.95 9.95 0 1 0 12.03 2Zm0 18.1a8.13 8.13 0 0 1-4.14-1.13l-.3-.18-3.09.81.83-3.01-.2-.31a8.15 8.15 0 1 1 7 3.82Zm4.47-6.1c-.25-.12-1.45-.72-1.67-.8s-.39-.12-.55.12-.63.8-.78.96-.28.19-.53.06a6.68 6.68 0 0 1-1.97-1.22 7.36 7.36 0 0 1-1.36-1.7c-.14-.24-.01-.38.11-.5.11-.11.24-.29.37-.43.12-.14.16-.25.24-.41s.04-.31-.02-.43-.55-1.33-.76-1.82c-.2-.48-.4-.41-.55-.42h-.47a.9.9 0 0 0-.65.31 2.75 2.75 0 0 0-.86 2.05c0 1.21.88 2.38 1 2.54s1.73 2.64 4.19 3.7c.59.25 1.04.41 1.4.52.59.19 1.12.16 1.54.1.47-.07 1.45-.59 1.66-1.17s.21-1.07.14-1.17-.22-.16-.47-.28Z" />
              </svg>
              <span class="whitespace-nowrap">Comprar pelo WhatsApp</span>
            </a>

            <button
              type="button"
              onClick={() => toggleComparatorProduct(props.product)}
              aria-pressed={isProductInComparator(props.product.id)}
              class={`mt-1.5 flex h-[30px] w-full items-center justify-center gap-1.5 rounded-lg border px-2 text-[11px] font-semibold transition-colors ${
                isProductInComparator(props.product.id)
                  ? "border-[#93509e] bg-[#F5ECF7] text-[#93509e]"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-[#93509e] hover:text-[#93509e]"
              }`}
            >
              <GitCompareArrows class="size-3.5 shrink-0" aria-hidden="true" />
              <span>
                {isProductInComparator(props.product.id)
                  ? "Na comparação"
                  : "Comparar"}
              </span>
            </button>
          </div>
        </Show>
      </div>
    </article>
  );
}
