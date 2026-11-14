import { children, createEffect, onCleanup, Show } from "solid-js";
import type { ParentProps } from "solid-js";
import { config } from "../../../app/config";

export const inputClass =
  "min-h-12 w-full rounded-lg border border-zinc-200 bg-white px-3.5 py-3 text-base text-zinc-900 shadow-xs outline-none transition-colors placeholder:text-zinc-500 hover:border-zinc-300 focus:border-zinc-500 focus:ring-3 focus:ring-zinc-900/5 aria-invalid:border-red-600 disabled:opacity-60 motion-reduce:transition-none";
export const buttonClass =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none";
export const linkClass =
  "text-sm text-zinc-500 underline decoration-zinc-300 underline-offset-4 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none";

export function AuthFrame(
  props: ParentProps<{
    title: string;
    description?: string;
    presentation?: boolean;
  }>,
) {
  const content = children(() => props.children);
  let frame!: HTMLDivElement;
  createEffect(() => {
    if (!props.presentation) return;
    let disposed = false;
    let revert: (() => void) | undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => {
      if (reduced.matches) revert?.();
    };
    reduced.addEventListener("change", stop);
    onCleanup(() => {
      disposed = true;
      revert?.();
      reduced.removeEventListener("change", stop);
    });
    if (reduced.matches) return;
    void import("gsap")
      .then(({ gsap }) => {
        if (disposed || reduced.matches) return;
        const context = gsap.context(() => {
          gsap.fromTo(
            frame.querySelectorAll("[data-auth-reveal]"),
            { y: 16 },
            {
              y: 0,
              duration: 0.7,
              stagger: 0.06,
              ease: "power3.out",
              clearProps: "transform",
            },
          );
          gsap.fromTo(
            frame.querySelector("[data-auth-art]"),
            { scale: 0.94, rotation: -4 },
            {
              scale: 1,
              rotation: 0,
              duration: 1.1,
              ease: "power3.out",
              clearProps: "transform",
            },
          );
        }, frame);
        revert = () => context.revert();
      })
      .catch(() => {});
  });
  return (
    <Show
      when={props.presentation}
      fallback={
        <section class="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center px-6 py-12">
          <img
            src="/logo-mf.png"
            alt="Mistura Feminina Cosméticos"
            class="mb-6 h-11 w-fit object-contain"
          />
          <h1 class="text-2xl font-semibold tracking-tight text-zinc-900">
            {props.title}
          </h1>
          {props.description && (
            <p class="mt-2 text-sm leading-6 text-zinc-600">
              {props.description}
            </p>
          )}
          <div class="mt-7">{content()}</div>
        </section>
      }
    >
      <div ref={frame} class="grid min-h-svh bg-white lg:grid-cols-2">
        <div class="relative m-3 hidden min-h-[calc(100svh-1.5rem)] flex-col overflow-hidden rounded-2xl bg-zinc-950 p-10 text-white lg:flex xl:p-14">
          <div
            class="absolute inset-0 bg-[radial-gradient(ellipse_at_25%_45%,#422b24_0%,transparent_65%)]"
            aria-hidden="true"
          />
          <div
            data-auth-reveal
            class="relative z-10 flex items-center gap-3 text-sm font-medium tracking-tight"
          >
            <img
              src="/logo-mf-dark.png"
              alt=""
              aria-hidden="true"
              class="h-9 w-auto object-contain"
            />
            {config.name}
          </div>
          <div
            class="relative flex flex-1 items-center justify-center py-8"
            aria-hidden="true"
          >
            <svg
              data-auth-art
              viewBox="0 0 480 370"
              class="max-h-[34svh] w-full max-w-lg overflow-visible"
              fill="none"
            >
              <defs>
                <linearGradient
                  id="auth-art-line"
                  x1="100"
                  y1="0"
                  x2="420"
                  y2="370"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop stop-color="#fdba74" />
                  <stop offset="1" stop-color="#f97316" stop-opacity="0.2" />
                </linearGradient>
              </defs>
              <g stroke="url(#auth-art-line)" stroke-width="1.1">
                <path d="m240 28 166 96v132l-166 96-166-96V124Z" />
                <path d="m240 64 135 78v96l-135 78-135-78v-96Z" />
                <path d="m240 100 104 60v60l-104 60-104-60v-60Z" />
                <path d="m74 124 166 96 166-96M240 220v132M105 142l135 78 135-78M136 160l104 60 104-60" />
                <path d="m240 28 0 72" stroke-dasharray="3 6" />
              </g>
              <g fill="#fdba74">
                <circle cx="240" cy="28" r="3" />
                <circle cx="74" cy="256" r="3" />
                <circle cx="406" cy="124" r="3" />
              </g>
            </svg>
          </div>
          <div class="relative z-10 max-w-lg" data-auth-reveal>
            <p class="mb-4 flex items-center gap-2 text-xs font-medium tracking-[0.18em] text-orange-300 uppercase">
              <span class="size-1.5 rounded-full bg-orange-300" />
              Um novo começo
            </p>
            <p class="text-4xl leading-[1.12] font-medium tracking-tight xl:text-5xl">
              Uma boa base.
              <br />
              <span class="text-zinc-400">Infinitas possibilidades.</span>
            </p>
            <p class="mt-5 max-w-sm text-sm leading-7 text-zinc-400">
              Entre na sua conta e continue de onde parou. O próximo passo é
              seu.
            </p>
          </div>
          <p class="relative mt-10 text-xs text-zinc-400">
            © {new Date().getFullYear()} {config.name}
          </p>
        </div>
        <section class="relative flex min-h-svh flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
          <div class="mx-auto w-full max-w-sm">
            <div
              data-auth-reveal
              class="mb-12 flex items-center gap-2.5 text-sm font-medium text-zinc-900 lg:hidden"
            >
              <img
                src="/logo-mf.png"
                alt=""
                aria-hidden="true"
                class="h-8 w-auto object-contain"
              />
              {config.name}
            </div>
            <div data-auth-reveal>
              <p class="mb-3 text-xs font-medium tracking-[0.15em] text-zinc-500 uppercase">
                Acesso à sua conta
              </p>
              <h1 class="text-3xl font-semibold tracking-tight text-zinc-900">
                {props.title}
              </h1>
              {props.description && (
                <p class="mt-3 text-sm leading-6 text-zinc-500">
                  {props.description}
                </p>
              )}
            </div>
            <div data-auth-reveal class="mt-8">
              {content()}
            </div>
            <p
              data-auth-reveal
              class="mt-10 border-t border-zinc-100 pt-6 text-xs leading-5 text-zinc-500"
            >
              Seu espaço, suas ideias. Um passo de cada vez.
            </p>
          </div>
        </section>
      </div>
    </Show>
  );
}
