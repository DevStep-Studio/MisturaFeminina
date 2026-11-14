import { onCleanup, onMount, Show } from "solid-js";
import { Link } from "@tanstack/solid-router";
import CircleCheck from "lucide-solid/icons/circle-check";
import LayoutDashboard from "lucide-solid/icons/layout-dashboard";
import ShoppingBag from "lucide-solid/icons/shopping-bag";
import { hasPermission } from "../../../security/permissions";
import { session } from "../../../security/session";
import { LogoutButton } from "./logout-button";

export function SessionPage() {
  let card!: HTMLElement;
  onMount(() => {
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
            card,
            { y: 18, scale: 0.98 },
            {
              y: 0,
              scale: 1,
              duration: 0.65,
              ease: "power3.out",
              clearProps: "transform",
            },
          );
          gsap.fromTo(
            card.querySelectorAll("[data-session-reveal]"),
            { y: 10 },
            {
              y: 0,
              duration: 0.5,
              stagger: 0.07,
              ease: "power3.out",
              clearProps: "transform",
            },
          );
        }, card);
        revert = () => context.revert();
      })
      .catch(() => {});
  });
  return (
    <div class="grid min-h-svh place-items-center bg-zinc-50/60 px-5 py-10 sm:px-8">
      <section
        ref={card}
        class="w-full max-w-md rounded-3xl border border-zinc-200/80 bg-white p-7 shadow-xl shadow-zinc-900/[0.03] sm:p-10"
        aria-labelledby="session-heading"
      >
        <div
          data-session-reveal
          class="mb-8 flex items-center justify-between gap-4"
        >
          <div class="flex items-center gap-3">
            <img
              src="/logo-mf.png"
              alt="Mistura Feminina Cosméticos"
              class="h-10 w-auto object-contain"
            />
            <span class="grid size-10 place-items-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700">
              <CircleCheck size={20} strokeWidth={1.75} aria-hidden="true" />
            </span>
          </div>
          <span class="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600">
            <span
              class="size-1.5 rounded-full bg-emerald-600"
              aria-hidden="true"
            />
            Conectado
          </span>
        </div>
        <div data-session-reveal>
          <p class="mb-2 text-xs font-medium tracking-[0.14em] text-zinc-500 uppercase">
            Tudo pronto
          </p>
          <h1
            id="session-heading"
            class="text-2xl leading-tight font-semibold tracking-tight text-zinc-900 sm:text-3xl"
          >
            Sessão autenticada
          </h1>
          <p class="mt-3 text-sm leading-7 text-zinc-600">
            Sua aplicação começa aqui. Uma base simples, pronta para o próximo
            passo.
          </p>
        </div>
        <div
          data-session-reveal
          class="mt-7 flex items-center gap-3 rounded-xl bg-zinc-50 px-4 py-3.5"
        >
          <span
            class="grid size-9 shrink-0 place-items-center rounded-full border border-zinc-200 bg-white text-sm font-medium text-zinc-700"
            aria-hidden="true"
          >
            {session.user()?.name.slice(0, 1).toUpperCase()}
          </span>
          <div class="min-w-0">
            <p class="text-xs text-zinc-500">Você entrou como</p>
            <p class="truncate text-sm font-medium text-zinc-900">
              {session.user()?.name}
            </p>
          </div>
        </div>
        <div
          data-session-reveal
          class="mt-6 flex flex-col gap-2.5 border-t border-zinc-100 pt-6"
        >
          <Show
            when={
              session.user()?.roles?.includes("superadmin") ||
              hasPermission(session.user()?.permissions ?? [], "dashboard.view")
            }
          >
            <Link
              to="/admin"
              class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#93509e] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#7b3e85] focus:outline-none focus:ring-2 focus:ring-[#93509e] focus:ring-offset-2"
            >
              <LayoutDashboard class="size-4" aria-hidden="true" />
              <span>Painel Administrativo</span>
            </Link>
          </Show>
          <Link
            to="/"
            class="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 shadow-2xs transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2"
          >
            <ShoppingBag class="size-4" aria-hidden="true" />
            <span>Voltar para a Loja</span>
          </Link>
          <div class="pt-2 [&_button]:w-full">
            <LogoutButton />
          </div>
        </div>
      </section>
    </div>
  );
}
