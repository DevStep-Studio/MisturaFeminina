import { Show } from "solid-js";
import Headset from "lucide-solid/icons/headset";
import MessageCircle from "lucide-solid/icons/message-circle";
import { selfServiceStore } from "../selfServiceSupport";

export function SelfServiceFloatingTrigger() {
  const isOpen = () => selfServiceStore.isOpen();

  return (
    <Show when={!isOpen()}>
      <div class="fixed bottom-20 right-3.5 z-40 md:bottom-6 md:right-6">
        <button
          type="button"
          onClick={() => selfServiceStore.open()}
          aria-label="Abrir Central de Autoatendimento e Dúvidas"
          class="group flex items-center gap-2 rounded-full border border-white/30 bg-gradient-to-r from-[#93509e] via-[#853491] to-[#6d1b7a] px-3.5 py-2.5 text-white shadow-[0_8px_26px_rgba(147,80,158,0.45)] transition-all duration-200 hover:scale-105 hover:shadow-[0_12px_32px_rgba(147,80,158,0.6)] active:scale-95 sm:px-4 sm:py-3 cursor-pointer"
        >
          <div class="relative flex size-6 items-center justify-center sm:size-7">
            <Headset
              class="size-5 transition-transform duration-200 group-hover:rotate-6 sm:size-6"
              aria-hidden="true"
            />
            {/* Ping indicator */}
            <span class="absolute -right-0.5 -top-0.5 flex size-2.5">
              <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span class="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
            </span>
          </div>

          <div class="text-left">
            <span class="block text-[11px] font-extrabold leading-tight tracking-wide uppercase sm:text-xs">
              Autoatendimento
            </span>
            <span class="block text-[9.5px] font-medium text-white/90 sm:text-[10.5px]">
              Dúvidas & Ajuda 24h
            </span>
          </div>
        </button>
      </div>
    </Show>
  );
}
