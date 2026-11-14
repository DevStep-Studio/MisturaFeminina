import { type ParentProps, onMount } from "solid-js";
import { loadStorefrontBootstrap, refreshCart } from "../store";
import { BenefitsBar } from "./BenefitsBar";
import { CartDrawer } from "./CartDrawer";
import { PromoPopup } from "./PromoPopup";
import { StoreFooter } from "./StoreFooter";
import { StoreHeader } from "./StoreHeader";

export function StoreShell(props: ParentProps) {
  onMount(() => {
    void loadStorefrontBootstrap();
    void refreshCart();
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
      <div id="main-content" class="flex-1">
        {props.children}
      </div>
      <StoreFooter />
      <CartDrawer />
      <PromoPopup />
    </div>
  );
}
