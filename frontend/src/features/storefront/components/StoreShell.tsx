import { type ParentProps, onCleanup, onMount, Show } from "solid-js";
import { loadStorefrontBootstrap, refreshCart } from "../store";
import { BenefitsBar } from "./BenefitsBar";
import { CartDrawer } from "./CartDrawer";
import { MobileBottomNav } from "./MobileBottomNav";
import { ProductComparatorBar } from "./ProductComparatorBar";
import { PromoPopup } from "./PromoPopup";
import { StoreFooter } from "./StoreFooter";
import { StoreHeader } from "./StoreHeader";

export function StoreShell(props: ParentProps<{ promotions?: boolean }>) {
  onMount(() => {
    void loadStorefrontBootstrap();
    void refreshCart();

    if (typeof window !== "undefined" && "IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-revealed");
              observer.unobserve(entry.target);
            }
          }
        },
        { threshold: 0.05, rootMargin: "0px 0px -40px 0px" },
      );

      const observeElements = () => {
        const elements = document.querySelectorAll(
          ".mf-scroll-reveal:not(.is-revealed)",
        );
        for (const el of elements) {
          observer.observe(el);
        }
      };

      observeElements();

      const mutationObserver =
        typeof MutationObserver !== "undefined"
          ? new MutationObserver(() => observeElements())
          : null;

      const mainContent = document.getElementById("main-content");
      if (mainContent && mutationObserver) {
        mutationObserver.observe(mainContent, {
          childList: true,
          subtree: true,
        });
      }

      onCleanup(() => {
        mutationObserver?.disconnect();
        observer.disconnect();
      });
    }
  });

  return (
    <div class="flex min-h-screen flex-col overflow-x-clip bg-white text-zinc-900">
      <a
        href="#main-content"
        class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-zinc-900 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Ir para o conteúdo principal
      </a>
      <BenefitsBar />
      <StoreHeader />
      <div id="main-content" class="flex-1 pb-16 md:pb-0">
        {props.children}
      </div>
      <StoreFooter />
      <ProductComparatorBar />
      <CartDrawer />
      <Show when={props.promotions !== false}>
        <PromoPopup />
      </Show>
      <MobileBottomNav />
    </div>
  );
}
