import { Show } from "solid-js";
import { Link, useLocation } from "@tanstack/solid-router";
import House from "lucide-solid/icons/house";
import LayoutGrid from "lucide-solid/icons/layout-grid";
import Search from "lucide-solid/icons/search";
import ShoppingBag from "lucide-solid/icons/shopping-bag";
import UserIcon from "lucide-solid/icons/user";
import { session } from "../../../security/session";
import { storefrontStore } from "../store";

export function MobileBottomNav() {
  const location = useLocation();

  const cartCount = () => storefrontStore.cart()?.items_count ?? 0;
  const isAuth = () => Boolean(session.user);

  const pathname = () => location().pathname;

  return (
    <nav
      aria-label="Navegação móvel inferior"
      class="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-zinc-200/90 bg-white/95 px-2 py-1 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur-md md:hidden pb-[env(safe-area-inset-bottom)]"
    >
      {/* 1. Início */}
      <Link
        to="/"
        class="group relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 text-center transition-all duration-150 active:scale-95"
        activeProps={{ class: "text-[#93509E]" }}
        inactiveProps={{ class: "text-zinc-500 hover:text-zinc-800" }}
      >
        <House
          class="h-5 w-5 transition-transform duration-150 group-hover:scale-110"
          stroke-width={pathname() === "/" ? 2.3 : 1.9}
        />
        <span
          class={`text-[10.5px] font-medium tracking-tight ${
            pathname() === "/" ? "font-semibold text-[#93509E]" : ""
          }`}
        >
          Início
        </span>
        <Show when={pathname() === "/"}>
          <span class="absolute -bottom-0.5 h-1 w-5 rounded-full bg-[#93509E]" />
        </Show>
      </Link>

      {/* 2. Categorias */}
      <Link
        to="/categorias"
        class="group relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 text-center transition-all duration-150 active:scale-95"
        activeProps={{ class: "text-[#93509E]" }}
        inactiveProps={{ class: "text-zinc-500 hover:text-zinc-800" }}
      >
        <LayoutGrid
          class="h-5 w-5 transition-transform duration-150 group-hover:scale-110"
          stroke-width={pathname().startsWith("/categoria") ? 2.3 : 1.9}
        />
        <span
          class={`text-[10.5px] font-medium tracking-tight ${
            pathname().startsWith("/categoria")
              ? "font-semibold text-[#93509E]"
              : ""
          }`}
        >
          Categorias
        </span>
        <Show when={pathname().startsWith("/categoria")}>
          <span class="absolute -bottom-0.5 h-1 w-5 rounded-full bg-[#93509E]" />
        </Show>
      </Link>

      {/* 3. Buscar */}
      <Link
        to="/buscar"
        class="group relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 text-center transition-all duration-150 active:scale-95"
        activeProps={{ class: "text-[#93509E]" }}
        inactiveProps={{ class: "text-zinc-500 hover:text-zinc-800" }}
      >
        <Search
          class="h-5 w-5 transition-transform duration-150 group-hover:scale-110"
          stroke-width={pathname().startsWith("/buscar") ? 2.3 : 1.9}
        />
        <span
          class={`text-[10.5px] font-medium tracking-tight ${
            pathname().startsWith("/buscar")
              ? "font-semibold text-[#93509E]"
              : ""
          }`}
        >
          Buscar
        </span>
        <Show when={pathname().startsWith("/buscar")}>
          <span class="absolute -bottom-0.5 h-1 w-5 rounded-full bg-[#93509E]" />
        </Show>
      </Link>

      {/* 4. Carrinho */}
      <button
        type="button"
        onClick={() => storefrontStore.setDrawerOpen(true)}
        aria-label={`Carrinho com ${cartCount()} itens`}
        class="group relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 text-center text-zinc-500 transition-all duration-150 hover:text-[#93509E] active:scale-95"
      >
        <div class="relative">
          <ShoppingBag
            class="h-5 w-5 transition-transform duration-150 group-hover:scale-110"
            stroke-width={storefrontStore.drawerOpen() ? 2.3 : 1.9}
          />
          <Show when={cartCount() > 0}>
            <span class="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#93509E] px-1 text-[10px] font-bold leading-none text-white shadow-sm ring-2 ring-white animate-pulse">
              {cartCount() > 99 ? "99+" : cartCount()}
            </span>
          </Show>
        </div>
        <span
          class={`text-[10.5px] font-medium tracking-tight ${
            storefrontStore.drawerOpen() ? "font-semibold text-[#93509E]" : ""
          }`}
        >
          Carrinho
        </span>
        <Show when={storefrontStore.drawerOpen()}>
          <span class="absolute -bottom-0.5 h-1 w-5 rounded-full bg-[#93509E]" />
        </Show>
      </button>

      {/* 5. Conta / Perfil */}
      <Link
        to={isAuth() ? "/minha-conta" : "/entrar"}
        class="group relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 text-center transition-all duration-150 active:scale-95"
        activeProps={{ class: "text-[#93509E]" }}
        inactiveProps={{ class: "text-zinc-500 hover:text-zinc-800" }}
      >
        <UserIcon
          class="h-5 w-5 transition-transform duration-150 group-hover:scale-110"
          stroke-width={
            pathname().startsWith("/minha-conta") ||
            pathname().startsWith("/entrar")
              ? 2.3
              : 1.9
          }
        />
        <span
          class={`text-[10.5px] font-medium tracking-tight ${
            pathname().startsWith("/minha-conta") ||
            pathname().startsWith("/entrar")
              ? "font-semibold text-[#93509E]"
              : ""
          }`}
        >
          {isAuth() ? "Minha Conta" : "Entrar"}
        </span>
        <Show
          when={
            pathname().startsWith("/minha-conta") ||
            pathname().startsWith("/entrar")
          }
        >
          <span class="absolute -bottom-0.5 h-1 w-5 rounded-full bg-[#93509E]" />
        </Show>
      </Link>
    </nav>
  );
}
