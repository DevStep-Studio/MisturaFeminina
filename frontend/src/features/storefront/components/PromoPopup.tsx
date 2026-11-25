import { ProductImage } from "./ProductImage";
import { Link } from "@tanstack/solid-router";
import Check from "lucide-solid/icons/check";
import ChevronLeft from "lucide-solid/icons/chevron-left";
import ChevronRight from "lucide-solid/icons/chevron-right";
import CreditCard from "lucide-solid/icons/credit-card";
import X from "lucide-solid/icons/x";
import {
  For,
  Show,
  createEffect,
  createResource,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { api } from "../../../lib/api";
import { formatCents, whatsappUrl } from "../../../lib/format";
import {
  selectPromotion,
  trackAddToCart,
  trackViewPromotion,
} from "../../../monitoring/analytics";
import { addCartItem, storefrontStore } from "../store";
import type { ProductCardData } from "../types";

const POPUP_DISMISSED_KEY = "mf:promo-popup-dismissed:v2";

function getResponsivePageSize(): number {
  if (typeof window === "undefined") return 3;
  if (window.matchMedia("(min-width: 768px)").matches) return 3;
  if (window.matchMedia("(min-width: 640px)").matches) return 2;
  return 1;
}

export function PromoPopup() {
  const settings = () => storefrontStore.settings();
  const [open, setOpen] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
  const [addingId, setAddingId] = createSignal<number | null>(null);
  const [page, setPage] = createSignal(0);
  const [pageSize, setPageSize] = createSignal(getResponsivePageSize());

  let touchStartX: number | null = null;
  let touchStartY: number | null = null;

  // Fetch offers/promotional products for the modal showcase
  const [productsData] = createResource(async () => {
    try {
      const res = await api<{ data: { products: ProductCardData[] } }>(
        "/catalog/products?collection=ofertas&per_page=9",
        { authenticated: false },
      );
      if (res.data?.products && res.data.products.length > 0) {
        return res.data.products;
      }
    } catch {
      // fallback
    }

    try {
      const fallback = await api<{ data: { products: ProductCardData[] } }>(
        "/catalog/products?per_page=9",
        { authenticated: false },
      );
      return fallback.data?.products ?? [];
    } catch {
      return [];
    }
  });

  const products = () => productsData() ?? [];
  const totalPages = () =>
    Math.max(1, Math.ceil(products().length / pageSize()));
  const activePage = () => page() % totalPages();

  const visibleProducts = () => {
    const list = products();
    if (list.length === 0) return [];
    const size = pageSize();
    const count = Math.min(size, list.length);
    const start = activePage() * size;
    return Array.from(
      { length: count },
      (_, idx) => list[(start + idx) % list.length],
    );
  };

  createEffect(() => {
    const pages = totalPages();
    setPage((current) => (current >= pages ? 0 : current));
  });

  createEffect(() => {
    if (!open() || typeof document === "undefined") return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    onCleanup(() => {
      document.body.style.overflow = prevOverflow;
    });
  });

  createEffect(() => {
    // Check if dismissed in this session
    try {
      if (
        typeof sessionStorage !== "undefined" &&
        sessionStorage.getItem(POPUP_DISMISSED_KEY)
      ) {
        setOpen(false);
        return;
      }
    } catch {
      // storage unavailable
    }

    // Open with a brief gentle delay on initial visit
    const timer = setTimeout(() => {
      setOpen(true);
      trackViewPromotion({
        promotion_id: couponCode(),
        promotion_name: settings().popup_title || "Cupom 10% OFF",
        creative_name: "promo_popup_modal",
      });
    }, 700);

    onCleanup(() => clearTimeout(timer));
  });

  function close() {
    setOpen(false);
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(POPUP_DISMISSED_KEY, "1");
      }
    } catch {
      // ignore
    }
  }

  // Handle ESC key press and responsive viewport breakpoints
  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open()) {
        close();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    const mdQuery = window.matchMedia("(min-width: 768px)");
    const smQuery = window.matchMedia("(min-width: 640px)");
    const updatePageSize = () => {
      if (mdQuery.matches) {
        setPageSize(3);
      } else if (smQuery.matches) {
        setPageSize(2);
      } else {
        setPageSize(1);
      }
    };

    updatePageSize();
    mdQuery.addEventListener("change", updatePageSize);
    smQuery.addEventListener("change", updatePageSize);

    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown);
      mdQuery.removeEventListener("change", updatePageSize);
      smQuery.removeEventListener("change", updatePageSize);
    });
  });

  const couponCode = () => settings().popup_coupon_code || "DESCONTO10";

  async function copyCoupon() {
    const code = couponCode();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      selectPromotion({
        promotion_id: code,
        promotion_name: settings().popup_title || "Cupom 10% OFF",
        creative_name: "promo_popup_copy",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function handleBuy(product: ProductCardData) {
    if (!product.default_variant_id || !product.in_stock) return;
    setAddingId(product.id);
    try {
      await addCartItem(product.default_variant_id, 1, true);
      trackAddToCart({
        currency: "BRL",
        value: product.effective_price_cents / 100,
        items: [
          {
            item_id: product.sku,
            item_name: product.name,
            price: product.effective_price_cents / 100,
            item_brand: product.brand?.name,
            quantity: 1,
          },
        ],
      });
      close();
    } catch {
      // ignore
    } finally {
      setAddingId(null);
    }
  }

  function nextPage() {
    setPage((p) => (p + 1) % totalPages());
  }

  function prevPage() {
    setPage((p) => (p - 1 + totalPages()) % totalPages());
  }

  function handleTouchStart(e: TouchEvent) {
    if (e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }

  function handleTouchEnd(e: TouchEvent) {
    if (
      touchStartX === null ||
      touchStartY === null ||
      e.changedTouches.length === 0
    ) {
      touchStartX = null;
      touchStartY = null;
      return;
    }

    const deltaX = e.changedTouches[0].clientX - touchStartX;
    const deltaY = e.changedTouches[0].clientY - touchStartY;
    touchStartX = null;
    touchStartY = null;

    if (totalPages() <= 1) return;
    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX < 0) {
        nextPage();
      } else {
        prevPage();
      }
    }
  }

  return (
    <Show when={open()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="promo-popup-heading"
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/65 p-3 backdrop-blur-xs sm:p-5"
      >
        <div class="relative my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl transition-all sm:max-h-[calc(100dvh-2.5rem)] sm:max-w-2xl md:max-w-4xl">
          {/* Floating White Circular Close Button */}
          <button
            type="button"
            onClick={close}
            aria-label="Fechar"
            class="absolute right-2.5 top-2.5 z-30 inline-flex size-8 cursor-pointer items-center justify-center rounded-full bg-white text-zinc-800 shadow-md ring-1 ring-black/10 transition-transform duration-200 hover:scale-110 hover:bg-zinc-100 active:scale-95 sm:-right-3 sm:-top-3 sm:size-10"
          >
            <X class="size-4 stroke-[2.4] sm:size-5" />
          </button>

          {/* Top Purple Header Banner */}
          <div class="flex shrink-0 flex-col items-center justify-between gap-2.5 rounded-t-2xl bg-[#4a0e78] px-11 py-3 text-white sm:flex-row sm:gap-3 sm:px-6 sm:py-3.5">
            <h2
              id="promo-popup-heading"
              class="text-center text-sm font-bold leading-snug tracking-tight sm:text-left sm:text-base md:text-lg"
            >
              {settings().popup_title ||
                "Aproveite e Utilize o cupom ganhe 10% OFF!"}
            </h2>

            <div class="inline-flex shrink-0 items-center rounded-full border border-dashed border-white/90 bg-white/10 p-0.5 pl-3 shadow-2xs sm:pl-4">
              <span class="mr-2.5 font-mono text-xs font-black tracking-wider text-white uppercase sm:text-sm">
                {couponCode()}
              </span>
              <button
                type="button"
                onClick={copyCoupon}
                class="inline-flex cursor-pointer items-center gap-1 rounded-full bg-white px-3.5 py-1 text-xs font-bold text-[#4a0e78] transition-colors hover:bg-zinc-100 active:scale-95 sm:text-sm"
              >
                <Show when={copied()} fallback={<span>Copiar</span>}>
                  <Check class="size-3.5 text-emerald-600" />
                  <span>Copiado!</span>
                </Show>
              </button>
            </div>
          </div>

          {/* Modal Body / Products Showcase */}
          <div class="relative overflow-y-auto rounded-b-2xl bg-white px-3 py-3.5 sm:p-6">
            <Show
              when={!productsData.loading}
              fallback={
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 sm:gap-5">
                  <For each={Array.from({ length: pageSize() }, (_, i) => i)}>
                    {() => (
                      <div class="h-72 animate-pulse rounded-xl bg-zinc-100" />
                    )}
                  </For>
                </div>
              }
            >
              <div
                class="relative px-4 sm:px-0"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
              >
                {/* Responsive Products Grid */}
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 sm:gap-5">
                  <For each={visibleProducts()}>
                    {(product) => (
                      <article class="group relative flex flex-col items-center rounded-xl border border-zinc-100 bg-white p-3 text-center shadow-xs transition hover:shadow-md">
                        {/* Product Image + Discount Badge */}
                        <div class="relative aspect-square w-full max-w-[155px] overflow-hidden rounded-lg bg-white p-1 sm:max-w-[180px] md:max-w-[200px]">
                          <Link
                            to="/produto/$slug"
                            params={{ slug: product.slug }}
                            onClick={close}
                            class="block size-full"
                          >
                            <ProductImage
                              src={product.primary_image}
                              alt={product.primary_image_alt || product.name}
                              class="size-full object-contain transition-transform duration-300 group-hover:scale-105"
                            />
                          </Link>

                          <Show when={product.discount_percent > 0}>
                            <span class="pointer-events-none absolute right-1.5 top-1.5 inline-flex items-center justify-center rounded-full bg-[#230638] px-2 py-0.5 text-[10.5px] font-extrabold tracking-tight text-white shadow-xs">
                              -{product.discount_percent}% OFF
                            </span>
                          </Show>
                        </div>

                        {/* Title */}
                        <Link
                          to="/produto/$slug"
                          params={{ slug: product.slug }}
                          onClick={close}
                          class="mt-2 line-clamp-2 min-h-[2.25rem] text-[13px] font-semibold leading-snug text-[#2F0572] transition-colors hover:text-[#C918BF] sm:mt-2.5 sm:min-h-[2.5rem]"
                        >
                          {product.name}
                        </Link>

                        {/* Prices */}
                        <div class="mt-1.5 flex items-baseline justify-center gap-1.5 sm:mt-2">
                          <Show
                            when={
                              product.effective_price_cents <
                              product.price_cents
                            }
                          >
                            <span class="text-[12px] font-medium text-zinc-400 line-through">
                              {formatCents(product.price_cents)}
                            </span>
                          </Show>
                          <span class="text-[16px] font-black text-[#C918BF] sm:text-[17px]">
                            {formatCents(product.effective_price_cents)}
                          </span>
                        </div>

                        {/* Installments */}
                        <Show when={product.installments_count > 1}>
                          <p class="mt-0.5 flex items-center justify-center gap-1 text-[11px] text-[#2F0572]">
                            <CreditCard
                              class="size-3.5 shrink-0 text-[#2F0572]"
                              aria-hidden="true"
                            />
                            <span>
                              ou{" "}
                              <strong class="font-bold text-[#C918BF]">
                                {product.installments_count}x
                              </strong>{" "}
                              de{" "}
                              <strong class="font-bold text-[#C918BF]">
                                {formatCents(product.installment_cents)}
                              </strong>{" "}
                              Sem juros
                            </span>
                          </p>
                        </Show>

                        {/* Actions */}
                        <div class="mt-auto flex w-full flex-col gap-2 pt-3 sm:pt-3.5">
                          <Show
                            when={
                              product.default_variant_id && product.in_stock
                            }
                            fallback={
                              <Link
                                to="/produto/$slug"
                                params={{ slug: product.slug }}
                                onClick={close}
                                class="mf-btn-buy inline-flex h-[36px] w-full items-center justify-center rounded-lg text-[13px] font-bold shadow-xs"
                              >
                                Comprar
                              </Link>
                            }
                          >
                            <button
                              type="button"
                              disabled={addingId() === product.id}
                              onClick={() => void handleBuy(product)}
                              class="mf-btn-buy inline-flex h-[36px] w-full items-center justify-center rounded-lg text-[13px] font-bold shadow-xs disabled:opacity-60"
                            >
                              {addingId() === product.id
                                ? "Adicionando…"
                                : "Comprar"}
                            </button>
                          </Show>

                          <a
                            href={whatsappUrl(
                              settings().whatsapp_number,
                              `Olá! Tenho interesse no produto: ${product.name} (SKU ${product.sku}) com o cupom ${couponCode()}!`,
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="mf-btn-whats inline-flex h-[32px] w-full items-center justify-center gap-1.5 rounded-lg text-[11.5px] font-medium shadow-2xs"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              class="size-3.5 shrink-0 fill-current"
                              aria-hidden="true"
                            >
                              <path d="M12.03 2a9.94 9.94 0 0 0-8.6 14.95L2 22l5.2-1.36A9.95 9.95 0 1 0 12.03 2Zm0 18.1a8.13 8.13 0 0 1-4.14-1.13l-.3-.18-3.09.81.83-3.01-.2-.31a8.15 8.15 0 1 1 7 3.82Zm4.47-6.1c-.25-.12-1.45-.72-1.67-.8s-.39-.12-.55.12-.63.8-.78.96-.28.19-.53.06a6.68 6.68 0 0 1-1.97-1.22 7.36 7.36 0 0 1-1.36-1.7c-.14-.24-.01-.38.11-.5.11-.11.24-.29.37-.43.12-.14.16-.25.24-.41s.04-.31-.02-.43-.55-1.33-.76-1.82c-.2-.48-.4-.41-.55-.42h-.47a.9.9 0 0 0-.65.31 2.75 2.75 0 0 0-.86 2.05c0 1.21.88 2.38 1 2.54s1.73 2.64 4.19 3.7c.59.25 1.04.41 1.4.52.59.19 1.12.16 1.54.1.47-.07 1.45-.59 1.66-1.17s.21-1.07.14-1.17-.22-.16-.47-.28Z" />
                            </svg>
                            <span class="whitespace-nowrap">
                              <span class="hidden sm:inline">Comprar pelo </span>
                              <span>WhatsApp</span>
                            </span>
                          </a>
                        </div>
                      </article>
                    )}
                  </For>
                </div>

                {/* Left and Right Carousel Navigation Arrows */}
                <Show when={totalPages() > 1}>
                  <button
                    type="button"
                    onClick={prevPage}
                    aria-label="Produtos anteriores"
                    class="absolute -left-1.5 top-1/2 z-10 inline-flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-purple-200 bg-white text-[#93509e] shadow-md transition hover:bg-[#93509e] hover:text-white active:scale-95 sm:-left-4 sm:size-10"
                  >
                    <ChevronLeft class="size-4 sm:size-5" />
                  </button>
                  <button
                    type="button"
                    onClick={nextPage}
                    aria-label="Próximos produtos"
                    class="absolute -right-1.5 top-1/2 z-10 inline-flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-purple-200 bg-white text-[#93509e] shadow-md transition hover:bg-[#93509e] hover:text-white active:scale-95 sm:-right-4 sm:size-10"
                  >
                    <ChevronRight class="size-4 sm:size-5" />
                  </button>
                </Show>
              </div>

              {/* Pagination Dots */}
              <Show when={totalPages() > 1}>
                <div
                  class="mt-3 flex items-center justify-center gap-1.5 sm:mt-4"
                  role="group"
                  aria-label="Paginação de produtos"
                >
                  <For each={Array.from({ length: totalPages() }, (_, i) => i)}>
                    {(pageIndex) => (
                      <button
                        type="button"
                        onClick={() => setPage(pageIndex)}
                        aria-label={`Ir para página ${pageIndex + 1} de ${totalPages()}`}
                        aria-current={
                          activePage() === pageIndex ? "true" : undefined
                        }
                        class={`h-2 cursor-pointer rounded-full transition-all ${
                          activePage() === pageIndex
                            ? "w-5 bg-[#93509e]"
                            : "w-2 bg-purple-200 hover:bg-purple-300"
                        }`}
                      />
                    )}
                  </For>
                </div>
              </Show>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}
