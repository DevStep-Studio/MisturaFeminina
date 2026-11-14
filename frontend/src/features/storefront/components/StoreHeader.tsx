import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { Link, useNavigate } from "@tanstack/solid-router";
import BadgePercent from "lucide-solid/icons/badge-percent";
import ChevronDown from "lucide-solid/icons/chevron-down";
import Headset from "lucide-solid/icons/headset";
import Menu from "lucide-solid/icons/menu";
import Search from "lucide-solid/icons/search";
import Shield from "lucide-solid/icons/shield";
import ShoppingBag from "lucide-solid/icons/shopping-bag";
import UserIcon from "lucide-solid/icons/user";
import X from "lucide-solid/icons/x";
import { api } from "../../../lib/api";
import { assetUrl, formatCents, whatsappUrl } from "../../../lib/format";
import { hasPermission } from "../../../security/permissions";
import { session } from "../../../security/session";
import {
  loadStorefrontBootstrap,
  refreshCart,
  storefrontStore,
} from "../store";
import type { CategoryNode, ProductCardData } from "../types";

export function StoreHeader() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = createSignal("");
  const [suggestions, setSuggestions] = createSignal<ProductCardData[]>([]);
  const [showDropdown, setShowDropdown] = createSignal(false);
  const [mobileMenuOpen, setMobileMenuOpen] = createSignal(false);
  const [allCatsOpen, setAllCatsOpen] = createSignal(false);

  const settings = () => storefrontStore.settings();
  const categories = () => storefrontStore.bootstrap().menu_categories;
  const cartCount = () => storefrontStore.cart()?.items_count ?? 0;
  const isStaff = () => {
    const user = session.user();
    return Boolean(user && hasPermission(user.permissions, "dashboard.view"));
  };

  createEffect(() => {
    void loadStorefrontBootstrap();
    void refreshCart();
  });

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let searchController: AbortController | undefined;

  onCleanup(() => {
    clearTimeout(debounceTimer);
    searchController?.abort();
  });

  const handleSearchInput = (value: string) => {
    setSearchQuery(value);
    clearTimeout(debounceTimer);
    searchController?.abort();
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    debounceTimer = setTimeout(async () => {
      searchController = new AbortController();
      try {
        const res = await api<{
          data: { suggestions: ProductCardData[] };
        }>(`/catalog/search?q=${encodeURIComponent(trimmed)}&autocomplete=1`, {
          authenticated: false,
          signal: searchController.signal,
        });
        setSuggestions(res.data.suggestions || []);
        setShowDropdown(true);
      } catch {
        // ignore abort or transient failure
      }
    }, 240);
  };

  const submitSearch = (e: Event) => {
    e.preventDefault();
    const q = searchQuery().trim();
    setShowDropdown(false);
    setMobileMenuOpen(false);
    void navigate({ to: "/buscar", search: { q } });
  };

  return (
    <header class="sticky top-0 z-40 border-b border-[#EBD4EC] bg-[#FFF3FF]">
      <div class="border-b border-[#F9A2F6]">
        <div class="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:grid lg:h-[74px] lg:grid-cols-[1fr_auto_1fr] lg:py-0">
          <div class="flex items-center gap-2 lg:hidden">
            <button
              type="button"
              class="inline-flex size-10 items-center justify-center rounded-lg text-[#2E1049] hover:bg-[#FCE7F6]"
              aria-label="Abrir menu de categorias"
              aria-expanded={mobileMenuOpen()}
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu class="size-5" aria-hidden="true" />
            </button>
          </div>

          {/* Desktop Search Left (clean underline-less search with pink magnifier matching reference) */}
          <div class="relative hidden max-w-[300px] lg:block">
            <form onSubmit={submitSearch} class="relative flex items-center">
              <label for="header-search-desktop" class="sr-only">
                Buscar produtos
              </label>
              <input
                id="header-search-desktop"
                type="search"
                value={searchQuery()}
                onInput={(e) => handleSearchInput(e.currentTarget.value)}
                onFocus={() => {
                  if (suggestions().length > 0) setShowDropdown(true);
                }}
                onBlur={() => setTimeout(() => setShowDropdown(false), 180)}
                placeholder="O que deseja procurar?"
                class="h-10 w-full rounded-md bg-transparent pl-1 pr-10 text-sm font-medium text-[#2E1049] placeholder:text-[#4E3B63] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[var(--mf-accent)]"
              />
              <button
                type="submit"
                aria-label="Buscar"
                class="absolute right-0.5 inline-flex size-9 items-center justify-center rounded-full text-[var(--mf-accent)] hover:bg-[#FCE7F6]"
              >
                <Search class="size-5 stroke-[2]" aria-hidden="true" />
              </button>
            </form>
            <Show when={showDropdown() && suggestions().length > 0}>
              <div class="absolute left-0 right-0 top-11 z-50 w-80 rounded-xl border border-line bg-white p-2 shadow-lg">
                <For each={suggestions()}>
                  {(item) => (
                    <Link
                      to="/produto/$slug"
                      params={{ slug: item.slug }}
                      onClick={() => setShowDropdown(false)}
                      class="flex items-center gap-3 rounded-lg p-2 hover:bg-[#FFF3FF]"
                    >
                      <img
                        src={assetUrl(item.primary_image)}
                        alt={item.primary_image_alt}
                        class="size-10 shrink-0 rounded bg-[#FAF7F8] object-contain"
                      />
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-xs font-medium text-ink">
                          {item.name}
                        </p>
                        <p class="text-xs font-bold text-brand-600">
                          {formatCents(item.effective_price_cents)}
                        </p>
                      </div>
                    </Link>
                  )}
                </For>
                <button
                  type="button"
                  onClick={submitSearch}
                  class="mt-1 w-full rounded-lg bg-[#FCE7F6] py-2 text-center text-xs font-semibold text-[#2E1049] hover:bg-[#F7D1EE]"
                >
                  Ver todos os resultados para “{searchQuery()}”
                </button>
              </div>
            </Show>
          </div>

          {/* Brand Logo Centered */}
          <Link
            to="/"
            class="flex shrink-0 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            aria-label={settings().store_name}
          >
            <img
              src={assetUrl(settings().logo_light_url)}
              alt={settings().store_name}
              onError={(e) => {
                e.currentTarget.src = "/logo-mf.png";
              }}
              class="h-11 w-auto max-w-[200px] object-contain sm:h-13"
            />
          </Link>

          {/* Actions Right: Atendimento, Minha Conta, Sacola */}
          <div class="flex items-center justify-end gap-3 sm:gap-5">
            <a
              href={whatsappUrl(
                settings().whatsapp_number,
                settings().whatsapp_default_message,
              )}
              target="_blank"
              rel="noopener noreferrer"
              class="hidden items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-[13px] font-bold text-[#2E1049] hover:text-[var(--mf-primary)] md:inline-flex"
            >
              <Headset
                class="size-6 shrink-0 stroke-[1.75] text-[var(--mf-accent)]"
                aria-hidden="true"
              />
              <span>Atendimento</span>
            </a>

            <Show when={isStaff()}>
              <Link
                to="/admin"
                class="hidden items-center gap-1 rounded-full border border-[var(--mf-primary)] px-2.5 py-1 text-xs font-bold text-[var(--mf-primary)] hover:bg-white md:inline-flex"
              >
                <Shield class="size-3.5" aria-hidden="true" />
                <span>Painel</span>
              </Link>
            </Show>

            <Link
              to={
                session.status() === "authenticated"
                  ? "/minha-conta"
                  : "/entrar"
              }
              class="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-[13px] font-bold text-[#2E1049] hover:text-[var(--mf-primary)]"
            >
              <UserIcon
                class="size-6 shrink-0 stroke-[1.75] text-[var(--mf-accent)]"
                aria-hidden="true"
              />
              <span class="hidden sm:inline">
                {session.user()
                  ? session.user()!.name.split(" ")[0]
                  : "Minha Conta"}
              </span>
            </Link>

            <button
              type="button"
              onClick={() => storefrontStore.setDrawerOpen(true)}
              aria-label={`Abrir carrinho com ${cartCount()} itens`}
              class="relative inline-flex size-10 items-center justify-center rounded-lg text-[#2E1049] hover:bg-[#FCE7F6]"
            >
              <ShoppingBag
                class="size-6 stroke-[1.75] text-[var(--mf-accent)]"
                aria-hidden="true"
              />
              <span class="absolute right-0 top-0 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#2E1049] px-1 text-[10px] font-bold text-white">
                {cartCount()}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Search Bar */}
      <div class="border-b border-[#F2D4F0] bg-[#FFF3FF] px-4 py-2 lg:hidden">
        <form onSubmit={submitSearch} class="relative flex items-center">
          <label for="header-search-mobile" class="sr-only">
            Buscar produtos
          </label>
          <input
            id="header-search-mobile"
            type="search"
            value={searchQuery()}
            onInput={(e) => handleSearchInput(e.currentTarget.value)}
            placeholder="O que deseja procurar?"
            class="h-10 w-full rounded-lg border border-[#EBD4EC] bg-white pl-3.5 pr-10 text-sm text-[#2E1049] placeholder:text-[#5B486B] focus:border-[var(--mf-accent)] focus:outline-none"
          />
          <button
            type="submit"
            aria-label="Buscar"
            class="absolute right-1 inline-flex size-8 items-center justify-center text-[var(--mf-accent)]"
          >
            <Search class="size-4" aria-hidden="true" />
          </button>
        </form>
      </div>

      {/* Desktop Category Navigation Bar */}
      <nav
        aria-label="Departamentos da loja"
        class="hidden bg-[#FFF3FF] lg:block"
      >
        <div class="mx-auto flex max-w-7xl items-center justify-between gap-3 px-6 py-2">
          <div class="flex items-center gap-4 text-[13px] font-bold text-[#2E1049] xl:gap-5">
            <div
              class="relative shrink-0"
              onMouseEnter={() => setAllCatsOpen(true)}
              onMouseLeave={() => setAllCatsOpen(false)}
            >
              <button
                type="button"
                aria-expanded={allCatsOpen()}
                onClick={() => setAllCatsOpen(!allCatsOpen())}
                class="inline-flex items-center gap-1.5 whitespace-nowrap py-1.5 font-bold text-[#2E1049] hover:text-[var(--mf-primary)]"
              >
                <Menu class="size-4 stroke-[2.25]" aria-hidden="true" />
                <span>Todas Categorias</span>
              </button>
              <Show when={allCatsOpen()}>
                <div class="absolute left-0 top-full z-50 grid w-[620px] grid-cols-2 gap-4 rounded-xl border border-line bg-white p-5 shadow-xl">
                  <For each={categories()}>
                    {(cat) => (
                      <CategoryMegaColumn
                        category={cat}
                        onSelect={() => setAllCatsOpen(false)}
                      />
                    )}
                  </For>
                </div>
              </Show>
            </div>

            <For each={categories().slice(0, 7)}>
              {(cat) => (
                <div class="group relative shrink-0">
                  <Link
                    to="/categoria/$slug"
                    params={{ slug: cat.slug }}
                    class="inline-flex items-center gap-1 whitespace-nowrap py-1.5 text-[#2E1049] hover:text-[var(--mf-primary)]"
                  >
                    <span>{cat.name}</span>
                    <Show when={(cat.children?.length ?? 0) > 0}>
                      <ChevronDown
                        class="size-3.5 text-[#4E3B63]"
                        aria-hidden="true"
                      />
                    </Show>
                  </Link>
                  <Show when={(cat.children?.length ?? 0) > 0}>
                    <div class="invisible absolute left-0 top-full z-50 min-w-52 rounded-xl border border-line bg-white p-2 shadow-lg group-hover:visible">
                      <For each={cat.children}>
                        {(child) => (
                          <Link
                            to="/categoria/$slug"
                            params={{ slug: child.slug }}
                            class="block rounded-lg px-3 py-2 text-xs font-medium text-[#2E1049] hover:bg-[#FFF3FF] hover:text-[var(--mf-primary)]"
                          >
                            {child.name}
                          </Link>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </div>

          <Link
            to="/promocoes"
            class="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-[13px] font-bold text-white transition-colors hover:opacity-95"
            style={{ "background-color": "var(--mf-secondary)" }}
          >
            <BadgePercent class="size-4 shrink-0" aria-hidden="true" />
            <span>Promoções</span>
          </Link>
        </div>
      </nav>

      {/* Mobile Drawer */}
      <Show when={mobileMenuOpen()}>
        <div
          class="fixed inset-0 z-50 flex bg-black/50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu principal"
        >
          <div class="flex h-full w-80 max-w-[85vw] flex-col bg-white shadow-xl">
            <div class="flex items-center justify-between border-b border-line px-4 py-3">
              <span class="text-sm font-bold text-ink">Departamentos</span>
              <button
                type="button"
                aria-label="Fechar menu"
                class="inline-flex size-10 items-center justify-center rounded-lg text-ink hover:bg-zinc-100"
                onClick={() => setMobileMenuOpen(false)}
              >
                <X class="size-5" aria-hidden="true" />
              </button>
            </div>
            <div class="flex-1 overflow-y-auto p-4">
              <div class="space-y-3">
                <For each={categories()}>
                  {(cat) => (
                    <div class="border-b border-zinc-100 pb-3">
                      <Link
                        to="/categoria/$slug"
                        params={{ slug: cat.slug }}
                        onClick={() => setMobileMenuOpen(false)}
                        class="block py-1 text-sm font-semibold text-ink"
                      >
                        {cat.name}
                      </Link>
                      <Show when={(cat.children?.length ?? 0) > 0}>
                        <div class="mt-1 space-y-1 pl-3">
                          <For each={cat.children}>
                            {(child) => (
                              <Link
                                to="/categoria/$slug"
                                params={{ slug: child.slug }}
                                onClick={() => setMobileMenuOpen(false)}
                                class="block py-1 text-xs text-muted hover:text-brand-600"
                              >
                                {child.name}
                              </Link>
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>
                  )}
                </For>

                <div class="space-y-2 pt-2">
                  <Link
                    to="/promocoes"
                    onClick={() => setMobileMenuOpen(false)}
                    class="block rounded-lg px-3 py-2.5 text-center text-sm font-bold text-white"
                    style={{ "background-color": "var(--mf-primary)" }}
                  >
                    Ver Promoções
                  </Link>
                  <Link
                    to="/novidades"
                    onClick={() => setMobileMenuOpen(false)}
                    class="block rounded-lg border border-line px-3 py-2.5 text-center text-sm font-medium text-ink"
                  >
                    Novidades
                  </Link>
                  <Link
                    to="/rastrear-pedido"
                    onClick={() => setMobileMenuOpen(false)}
                    class="block rounded-lg border border-line px-3 py-2.5 text-center text-sm font-medium text-ink"
                  >
                    Rastrear Pedido
                  </Link>
                  <Link
                    to={
                      session.status() === "authenticated"
                        ? "/minha-conta"
                        : "/entrar"
                    }
                    onClick={() => setMobileMenuOpen(false)}
                    class="block rounded-lg border border-line px-3 py-2.5 text-center text-sm font-medium text-ink"
                  >
                    Minha Conta
                  </Link>
                </div>
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Fechar menu ao clicar fora"
            class="flex-1"
            onClick={() => setMobileMenuOpen(false)}
          />
        </div>
      </Show>
    </header>
  );
}

function CategoryMegaColumn(props: {
  category: CategoryNode;
  onSelect: () => void;
}) {
  return (
    <div>
      <Link
        to="/categoria/$slug"
        params={{ slug: props.category.slug }}
        onClick={props.onSelect}
        class="text-sm font-bold text-brand-600 hover:underline"
      >
        {props.category.name}
      </Link>
      <Show when={(props.category.children?.length ?? 0) > 0}>
        <ul class="mt-1.5 space-y-1">
          <For each={props.category.children}>
            {(child) => (
              <li>
                <Link
                  to="/categoria/$slug"
                  params={{ slug: child.slug }}
                  onClick={props.onSelect}
                  class="text-xs text-muted hover:text-brand-600"
                >
                  {child.name}
                </Link>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
