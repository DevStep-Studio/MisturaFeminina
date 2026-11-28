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
      <div class="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs sm:p-8 lg:p-10">
        <div class="relative flex flex-col items-center justify-between gap-8 lg:flex-row lg:items-center">
          {/* Lado Esquerdo: Textos & Botão Principal */}
          <div class="max-w-xl text-center lg:text-left">
            <div class="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">
              <span class="flex size-2">
                <span class="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              <span>Central de Atendimento 24h</span>
            </div>

            <h2 class="mt-4 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
              Dúvidas sobre pedidos, entrega ou produtos?
            </h2>

            <p class="mt-3 text-sm text-zinc-600 sm:text-base leading-relaxed">
              Consulte nosso autoatendimento para encontrar respostas imediatas sobre prazos de entrega, frete por região, rastreamento, formas de pagamento e trocas sem fila de espera.
            </p>

            <div class="mt-6 flex flex-wrap items-center justify-center gap-4 lg:justify-start">
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
                class="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 py-3.5 text-sm font-semibold text-[#2E0C49] shadow-2xs transition-colors hover:border-[#93509e] hover:bg-[#FAF5FB] hover:text-[#93509e] cursor-pointer"
              >
                <PackageCheck class="size-4 shrink-0 text-[#93509e]" aria-hidden="true" />
                <span>Rastrear Pedido</span>
              </button>
            </div>
          </div>

          {/* Lado Direito: Atalhos Rápidos com 1 clique */}
          <div class="grid w-full max-w-lg grid-cols-2 gap-3 sm:gap-4">
            {/* 1. Rastrear Pedido */}
            <button
              type="button"
              onClick={() => selfServiceStore.open("pedidos-rastreio")}
              class="group flex flex-col items-start rounded-2xl border border-zinc-200/80 bg-white p-4 text-left shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[#93509e] hover:shadow-md cursor-pointer"
            >
              <div class="mb-2.5 flex size-10 items-center justify-center rounded-xl bg-[#FAF2FC] text-[#93509e] transition-colors group-hover:bg-[#93509e] group-hover:text-white">
                <PackageCheck class="size-5" aria-hidden="true" />
              </div>
              <p class="text-xs sm:text-sm font-bold text-[#2E0C49] leading-tight">
                Rastrear Pedido
              </p>
              <p class="mt-1 text-[11px] text-zinc-500 leading-snug">
                Status e código de rastreio
              </p>
            </button>

            {/* 2. Frete & Prazos */}
            <button
              type="button"
              onClick={() => selfServiceStore.open("entrega-frete")}
              class="group flex flex-col items-start rounded-2xl border border-zinc-200/80 bg-white p-4 text-left shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[#93509e] hover:shadow-md cursor-pointer"
            >
              <div class="mb-2.5 flex size-10 items-center justify-center rounded-xl bg-[#FAF2FC] text-[#93509e] transition-colors group-hover:bg-[#93509e] group-hover:text-white">
                <MapPin class="size-5" aria-hidden="true" />
              </div>
              <p class="text-xs sm:text-sm font-bold text-[#2E0C49] leading-tight">
                Frete & Prazos
              </p>
              <p class="mt-1 text-[11px] text-zinc-500 leading-snug">
                Regras de frete grátis
              </p>
            </button>

            {/* 3. Pagamentos */}
            <button
              type="button"
              onClick={() => selfServiceStore.open("pagamentos")}
              class="group flex flex-col items-start rounded-2xl border border-zinc-200/80 bg-white p-4 text-left shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[#93509e] hover:shadow-md cursor-pointer"
            >
              <div class="mb-2.5 flex size-10 items-center justify-center rounded-xl bg-[#FAF2FC] text-[#93509e] transition-colors group-hover:bg-[#93509e] group-hover:text-white">
                <CreditCard class="size-5" aria-hidden="true" />
              </div>
              <p class="text-xs sm:text-sm font-bold text-[#2E0C49] leading-tight">
                Pagamentos
              </p>
              <p class="mt-1 text-[11px] text-zinc-500 leading-snug">
                Pix, cartão e até 6x
              </p>
            </button>

            {/* 4. Trocas e Devoluções */}
            <button
              type="button"
              onClick={() => selfServiceStore.open("trocas-devolucoes")}
              class="group flex flex-col items-start rounded-2xl border border-zinc-200/80 bg-white p-4 text-left shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[#93509e] hover:shadow-md cursor-pointer"
            >
              <div class="mb-2.5 flex size-10 items-center justify-center rounded-xl bg-[#FAF2FC] text-[#93509e] transition-colors group-hover:bg-[#93509e] group-hover:text-white">
                <RefreshCw class="size-5" aria-hidden="true" />
              </div>
              <p class="text-xs sm:text-sm font-bold text-[#2E0C49] leading-tight">
                Trocas & Devolução
              </p>
              <p class="mt-1 text-[11px] text-zinc-500 leading-snug">
                Como solicitar em até 7 dias
              </p>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
