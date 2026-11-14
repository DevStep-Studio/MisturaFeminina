export function LoadingState(props: { message?: string }) {
  return (
    <section
      role="status"
      aria-live="polite"
      class="flex min-h-[360px] w-full flex-col items-center justify-center px-4 py-12 text-center"
    >
      <div class="relative flex flex-col items-center">
        {/* Outer ambient decorative ring */}
        <div class="relative flex size-28 items-center justify-center">
          {/* Subtle outer pulse border */}
          <span
            class="absolute inset-0 rounded-full border border-[#EACEEE] bg-[#FDF9FE] shadow-[0_4px_24px_rgba(147,80,158,0.12)] motion-safe:animate-pulse"
            aria-hidden="true"
          />

          {/* Orbiting dashed accent circle */}
          <span
            class="absolute inset-1.5 rounded-full border-2 border-dashed border-[#93509e]/40 motion-safe:animate-[spin_10s_linear_infinite]"
            aria-hidden="true"
          />

          {/* Active arc spinner */}
          <span
            class="absolute inset-0 rounded-full border-2 border-transparent border-t-[#93509e] border-r-[#93509e] motion-safe:animate-[spin_1.4s_cubic-bezier(0.4,0,0.2,1)_infinite]"
            aria-hidden="true"
          />

          {/* Rotating Brand Logo */}
          <div
            class="relative z-10 flex size-16 items-center justify-center rounded-full bg-white p-2.5 shadow-sm"
            aria-hidden="true"
          >
            <img
              src="/logo-mf.png"
              alt=""
              class="mf-logo-spin-3d h-10 w-auto max-w-[48px] object-contain"
            />
          </div>
        </div>

        {/* Text and status */}
        <div class="mt-5 max-w-sm">
          <h2 class="text-base font-extrabold tracking-tight text-[#2E0C49] sm:text-lg">
            {props.message || "Carregando..."}
          </h2>
          <p class="mt-1 text-xs text-[#5B486B] sm:text-[13px]">
            Preparando a melhor curadoria de cosméticos para você
          </p>

          {/* Modern animated dots bar */}
          <div
            class="mt-3.5 flex items-center justify-center gap-1.5"
            aria-hidden="true"
          >
            <span class="size-1.5 rounded-full bg-[#93509e] motion-safe:animate-bounce [animation-delay:-0.3s]" />
            <span class="size-1.5 rounded-full bg-[#93509e] motion-safe:animate-bounce [animation-delay:-0.15s]" />
            <span class="size-1.5 rounded-full bg-[#93509e] motion-safe:animate-bounce" />
          </div>
        </div>
      </div>
    </section>
  );
}
