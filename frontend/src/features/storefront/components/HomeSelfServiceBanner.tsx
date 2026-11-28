import ChevronRight from "lucide-solid/icons/chevron-right";
import CreditCard from "lucide-solid/icons/credit-card";
import Headset from "lucide-solid/icons/headset";
import MapPin from "lucide-solid/icons/map-pin";
import PackageCheck from "lucide-solid/icons/package-check";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import { selfServiceStore } from "../selfServiceSupport";

export function HomeSelfServiceBanner() {
  return (
    <section
      aria-label="Central de Autoatendimento e Dúvidas"
      class="mf-scroll-reveal mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
    >
      <div class="relative overflow-hidden rounded-2xl border border-[#EBD4EC] bg-[#FAF5FB]/70 p-6 shadow-xs sm:p-8 lg:p-10">
        <div class="relative flex flex-col items-center justify-between gap-8 lg:flex-row lg:items-center">
          {/* Lado Esquerdo: Textos & Botão Principal */}
          <div class="max-w-xl text-center lg:text-left">
            <h2 class="text-2xl font-bold tracking-tight text-[#2E1049] sm:text-3xl">
              Dúvidas sobre seu pedido, entrega ou produtos?
            </h2>

            <p class="mt-3 text-sm text-[#523B66] sm:text-base leading-relaxed">
              Consulte nosso autoatendimento para encontrar respostas imediatas sobre prazos de entrega, frete por região, rastreamento, formas de pagamento e trocas sem fila de espera.
            </p>

            <div class="mt-6 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              <button
                type="button"
                onClick={() => selfServiceStore.open()}
                aria-label="Abrir Central de Autoatendimento Mistura Feminina"
                class="inline-flex items-center justify-center gap-2.5 rounded-xl bg-[#93509e] px-6 py-3.5 text-sm sm:text-base font-bold text-white shadow-xs transition hover:bg-[#7d3f87] active:scale-98 cursor-pointer"
              >
                <Headset class="size-5 shrink-0" aria-hidden="true" />
                <span>Abrir Autoatendimento</span>
              </button>

              <button
                type="button"
                onClick={() => selfServiceStore.open("pedidos-rastreio")}
                class="inline-flex items-center justify-center gap-2 rounded-xl border border-[#D8BFDB] bg-white px-5 py-3.5 text-sm font-semibold text-[#2E1049] shadow-2xs transition-colors hover:border-[#93509e] hover:bg-white hover:text-[#93509e] cursor-pointer"
              >
                <PackageCheck class="size-4 shrink-0 text-[#93509e]" aria-hidden="true" />
                <span>Rastrear Pedido</span>
              </button>
            </div>
          </div>

          {/* Lado Direito: Atalhos Rápidos com 1 clique */}
          <div class="grid w-full max-w-lg grid-cols-1 gap-3 sm:grid-cols-2">
            {/* 1. Rastrear Pedido */}
            <button
              type="button"
              onClick={() => selfServiceStore.open("pedidos-rastreio")}
              class="group flex items-center justify-between gap-3 rounded-xl border border-[#E8D6EA] bg-white p-3.5 text-left shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[#93509e] hover:shadow-xs active:scale-[0.99] cursor-pointer"
            >
              <div class="flex items-center gap-3 min-w-0">
                <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#FAF2FC] text-[#93509e] transition-colors group-hover:bg-[#93509e] group-hover:text-white">
                  <PackageCheck class="size-5" aria-hidden="true" />
                </div>
                <div class="min-w-0">
                  <p class="text-sm font-bold text-[#2E1049] leading-tight truncate">
                    Rastrear Pedido
                  </p>
                  <p class="mt-0.5 text-xs text-zinc-500 leading-snug truncate">
                    Status e código de rastreio
                  </p>
                </div>
              </div>
              <ChevronRight class="size-4 shrink-0 text-zinc-400 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[#93509e]" aria-hidden="true" />
            </button>

            {/* 2. Frete & Prazos */}
            <button
              type="button"
              onClick={() => selfServiceStore.open("entrega-frete")}
              class="group flex items-center justify-between gap-3 rounded-xl border border-[#E8D6EA] bg-white p-3.5 text-left shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[#93509e] hover:shadow-xs active:scale-[0.99] cursor-pointer"
            >
              <div class="flex items-center gap-3 min-w-0">
                <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#FAF2FC] text-[#93509e] transition-colors group-hover:bg-[#93509e] group-hover:text-white">
                  <MapPin class="size-5" aria-hidden="true" />
                </div>
                <div class="min-w-0">
                  <p class="text-sm font-bold text-[#2E1049] leading-tight truncate">
                    Frete & Prazos
                  </p>
                  <p class="mt-0.5 text-xs text-zinc-500 leading-snug truncate">
                    Regras de frete grátis
                  </p>
                </div>
              </div>
              <ChevronRight class="size-4 shrink-0 text-zinc-400 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[#93509e]" aria-hidden="true" />
            </button>

            {/* 3. Pagamentos */}
            <button
              type="button"
              onClick={() => selfServiceStore.open("pagamentos")}
              class="group flex items-center justify-between gap-3 rounded-xl border border-[#E8D6EA] bg-white p-3.5 text-left shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[#93509e] hover:shadow-xs active:scale-[0.99] cursor-pointer"
            >
              <div class="flex items-center gap-3 min-w-0">
                <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#FAF2FC] text-[#93509e] transition-colors group-hover:bg-[#93509e] group-hover:text-white">
                  <CreditCard class="size-5" aria-hidden="true" />
                </div>
                <div class="min-w-0">
                  <p class="text-sm font-bold text-[#2E1049] leading-tight truncate">
                    Pagamentos
                  </p>
                  <p class="mt-0.5 text-xs text-zinc-500 leading-snug truncate">
                    Pix, cartão e até 6x
                  </p>
                </div>
              </div>
              <ChevronRight class="size-4 shrink-0 text-zinc-400 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[#93509e]" aria-hidden="true" />
            </button>

            {/* 4. Trocas e Devoluções */}
            <button
              type="button"
              onClick={() => selfServiceStore.open("trocas-devolucoes")}
              class="group flex items-center justify-between gap-3 rounded-xl border border-[#E8D6EA] bg-white p-3.5 text-left shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[#93509e] hover:shadow-xs active:scale-[0.99] cursor-pointer"
            >
              <div class="flex items-center gap-3 min-w-0">
                <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#FAF2FC] text-[#93509e] transition-colors group-hover:bg-[#93509e] group-hover:text-white">
                  <RefreshCw class="size-5" aria-hidden="true" />
                </div>
                <div class="min-w-0">
                  <p class="text-sm font-bold text-[#2E1049] leading-tight truncate">
                    Trocas & Devolução
                  </p>
                  <p class="mt-0.5 text-xs text-zinc-500 leading-snug truncate">
                    Como solicitar em até 7 dias
                  </p>
                </div>
              </div>
              <ChevronRight class="size-4 shrink-0 text-zinc-400 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[#93509e]" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
