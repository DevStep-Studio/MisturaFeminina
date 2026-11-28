import { Show } from "solid-js";
import Headset from "lucide-solid/icons/headset";
import { selfServiceStore } from "../selfServiceSupport";

export function SelfServiceFloatingTrigger() {
  const isOpen = () => selfServiceStore.isOpen();

  return (
    <Show when={!isOpen()}>
      <div class="fixed bottom-20 right-4 z-40 md:bottom-6 md:right-6">
        <button
          type="button"
          onClick={() => selfServiceStore.open()}
          aria-label="Abrir Central de Autoatendimento e Dúvidas"
          title="Central de Autoatendimento"
          class="group flex size-12 items-center justify-center rounded-full bg-[#93509e] text-white shadow-lg transition-all duration-200 hover:scale-105 hover:bg-[#7d3f87] hover:shadow-xl active:scale-95 sm:size-14 cursor-pointer"
        >
          <Headset
            class="size-6 transition-transform duration-200 group-hover:scale-110 sm:size-7"
            aria-hidden="true"
          />
        </button>
      </div>
    </Show>
  );
}
