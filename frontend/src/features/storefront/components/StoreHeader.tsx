import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { Link, useNavigate } from "@tanstack/solid-router";
import BadgePercent from "lucide-solid/icons/badge-percent";
import ChevronDown from "lucide-solid/icons/chevron-down";
import ChevronLeft from "lucide-solid/icons/chevron-left";
import ChevronRight from "lucide-solid/icons/chevron-right";
import LogIn from "lucide-solid/icons/log-in";
import Mail from "lucide-solid/icons/mail";
import Menu from "lucide-solid/icons/menu";
import MessageCircle from "lucide-solid/icons/message-circle";
import Search from "lucide-solid/icons/search";
import Shield from "lucide-solid/icons/shield";
import ShoppingBag from "lucide-solid/icons/shopping-bag";
import Truck from "lucide-solid/icons/truck";
import UserIcon from "lucide-solid/icons/user";
import X from "lucide-solid/icons/x";
import { api } from "../../../lib/api";
import { assetUrl, formatCents, whatsappUrl } from "../../../lib/format";
import { logout } from "../../../security/auth";
import { hasPermission } from "../../../security/permissions";
import { session } from "../../../security/session";
import {
  loadStorefrontBootstrap,
  refreshCart,
  storefrontStore,
} from "../store";
import type { CategoryNode, ProductCardData } from "../types";
import { ProductCard } from "./ProductCard";

type HeaderPopoverKey =
  "support" | "account" | "all" | "promo" | `cat:${number}` | null;

export function StoreHeader() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = createSignal("");
  const [suggestions, setSuggestions] = createSignal<ProductCardData[]>([]);
  const [showDropdown, setShowDropdown] = createSignal(false);
  const [mobileMenuOpen, setMobileMenuOpen] = createSignal(false);
  const [activePopover, setActivePopover] =
    createSignal<HeaderPopoverKey>(null);
  const [trackCode, setTrackCode] = createSignal("");
  const [promoOffset, setPromoOffset] = createSignal(0);

  const settings = () => storefrontStore.settings();
  const categories = () => storefrontStore.bootstrap().menu_categories;
  const promoProducts = () => storefrontStore.bootstrap().promo_products ?? [];
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
  let popoverCloseTimer: ReturnType<typeof setTimeout> | undefined;
  let searchController: AbortController | undefined;
  let headerRef: HTMLElement | undefined;
  let hoverOpenedKey: HeaderPopoverKey = null;
  let hoverOpenedAt = 0;

  const openPopover = (key: HeaderPopoverKey) => {
    clearTimeout(popoverCloseTimer);
    if (activePopover() !== key) {
      hoverOpenedKey = key;
      hoverOpenedAt = Date.now();
    }
    setActivePopover(key);
  };

  const togglePopoverOnClick = (key: HeaderPopoverKey) => {
    clearTimeout(popoverCloseTimer);
    const justHoveredOpen =
      hoverOpenedKey === key && Date.now() - hoverOpenedAt < 400;
    hoverOpenedKey = null;
    if (activePopover() === key && !justHoveredOpen) {
      setActivePopover(null);
      return;
    }
    setActivePopover(key);
  };

  const scheduleClosePopover = () => {
    clearTimeout(popoverCloseTimer);
    popoverCloseTimer = setTimeout(() => {
      hoverOpenedKey = null;
      setActivePopover(null);
    }, 120);
  };

  const closeAllMenus = () => {
    clearTimeout(popoverCloseTimer);
    setActivePopover(null);
    setShowDropdown(false);
    setMobileMenuOpen(false);
  };

  createEffect(() => {
    const onDocClick = (ev: MouseEvent) => {
      if (headerRef && !headerRef.contains(ev.target as Node)) {
        setActivePopover(null);
      }
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setActivePopover(null);
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    onCleanup(() => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    });
  });

  onCleanup(() => {
    clearTimeout(debounceTimer);
    clearTimeout(popoverCloseTimer);
    searchController?.abort();
  });

  const submitQuickTrack = (e: Event) => {
    e.preventDefault();
    const codigo = trackCode().trim().toUpperCase();
    closeAllMenus();
    void navigate({
      to: "/rastrear-pedido",
      search: codigo ? { codigo } : {},
    });
  };

  const handleLogout = async () => {
    closeAllMenus();
    await logout();
    await refreshCart();
  };

  const promoSlideNext = () => {
    const len = promoProducts().length;
    if (len <= 4) return;
    setPromoOffset((prev) => (prev + 1) % Math.max(1, len - 3));
  };

  const promoSlidePrev = () => {
    const len = promoProducts().length;
    if (len <= 4) return;
    setPromoOffset((prev) => (prev <= 0 ? Math.max(0, len - 4) : prev - 1));
  };

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
    <header
      ref={headerRef}
      class="sticky top-0 z-40 border-b border-[#EBD4EC] bg-[#FFF3FF]"
    >
      <div class="border-b border-[#F9A2F6] bg-white">
        <div class="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:grid lg:h-[72px] lg:grid-cols-[1fr_auto_1fr] lg:py-0">
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

          {/* Desktop Search Left (wide clean search with pink magnifier matching reference) */}
          <div class="relative hidden max-w-[360px] lg:block">
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
                class="h-10 w-full rounded-md bg-transparent pl-1 pr-10 text-[14px] font-normal text-[#2E1049] placeholder:text-[#3D2C54] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[var(--mf-accent)]"
              />
              <button
                type="submit"
                aria-label="Buscar"
                class="absolute right-0.5 inline-flex size-9 items-center justify-center rounded-full text-[var(--mf-accent)] hover:bg-[#FCE7F6]"
              >
                <Search class="size-[22px] stroke-[2]" aria-hidden="true" />
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
            class="flex shrink-0 items-center justify-center gap-2 rounded-lg px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            <svg
              viewBox="0 0 42 36"
              class="h-8 w-9 shrink-0 -rotate-12 sm:h-9 sm:w-10"
              fill="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient
                  id="mf-header-butterfly-grad"
                  x1="0"
                  y1="0"
                  x2="40"
                  y2="36"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" stop-color="#FF33B8" />
                  <stop offset="55%" stop-color="#EC1B9B" />
                  <stop offset="100%" stop-color="#62298D" />
                </linearGradient>
              </defs>
              <path
                d="M21 15C16 4 3 1 2 10c-.6 5.5 6.5 9.5 14 9.5-5.5 2-9 6.5-6.5 11.2 2.4 4.5 9.2 2.3 11.5-5.7 2.3 8 9.1 10.2 11.5 5.7 2.5-4.7-1-9.2-6.5-11.2 7.5 0 14.6-4 14-9.5C39 1 26 4 21 15z"
                fill="url(#mf-header-butterfly-grad)"
              />
              <ellipse cx="21" cy="18.5" rx="1.6" ry="7.5" fill="#4C1D6E" />
            </svg>
            <span class="flex flex-col items-center leading-none">
              <span
                class="text-[28px] font-black tracking-tight text-[#3D1260] sm:text-[31px]"
                style={{ "font-family": 'Georgia, "Times New Roman", serif' }}
              >
                Mistura
              </span>{" "}
              <span class="mt-0.5 pl-[0.38em] text-[8.5px] font-semibold uppercase tracking-[0.38em] text-[#4E3B63] sm:text-[9px]">
                COSMÉTICOS
              </span>
            </span>
          </Link>

          {/* Actions Right: Atendimento, Minha Conta, Sacola */}
          <div class="flex items-center justify-end gap-4 sm:gap-6">
            {/* Atendimento Popover */}
            <div
              class="relative hidden md:block"
              onMouseEnter={() => openPopover("support")}
              onMouseLeave={scheduleClosePopover}
            >
              <button
                type="button"
                aria-expanded={activePopover() === "support"}
                aria-haspopup="true"
                onClick={() => togglePopoverOnClick("support")}
                class="inline-flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-[14px] font-bold text-[#2E1049] hover:text-[var(--mf-primary)]"
              >
                <svg
                  viewBox="0 0 28 28"
                  class="size-[30px] shrink-0 text-[var(--mf-accent)]"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5.5 13.5a8.5 8.5 0 0 1 17 0" />
                  <rect x="3" y="12.5" width="4" height="6.5" rx="2" />
                  <rect x="21" y="12.5" width="4" height="6.5" rx="2" />
                  <path d="M10.5 14v1.5M17.5 14v1.5" />
                  <path d="M23 19v1.2A3.8 3.8 0 0 1 19.2 24H15" />
                  <circle cx="14" cy="24" r="1.1" fill="currentColor" />
                </svg>
                <span>Atendimento</span>
              </button>

              <Show when={activePopover() === "support"}>
                <div
                  class="absolute right-0 top-full z-50 w-[295px] rounded-b-xl border-x border-b border-[#F2D4F0] border-t-[3px] border-t-[#DF2895] bg-white p-5 text-left shadow-2xl"
                  onMouseEnter={() => openPopover("support")}
                  onMouseLeave={scheduleClosePopover}
                >
                  <div class="border-b border-zinc-100 pb-3.5">
                    <p class="flex items-center gap-2 text-[13px] font-medium text-[#3D1260]">
                      <MessageCircle
                        class="size-4 shrink-0 text-[#C22583]"
                        aria-hidden="true"
                      />
                      <span>Whatsapp:</span>
                    </p>
                    <a
                      href={whatsappUrl(
                        settings().whatsapp_number,
                        settings().whatsapp_default_message,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={closeAllMenus}
                      class="mt-1 block text-sm font-bold text-[#3D1260] hover:text-[#C22583]"
                    >
                      {settings().phone}
                    </a>
                  </div>

                  <div class="border-b border-zinc-100 py-3.5">
                    <p class="flex items-center gap-2 text-[13px] font-medium text-[#3D1260]">
                      <Mail
                        class="size-4 shrink-0 text-[#C22583]"
                        aria-hidden="true"
                      />
                      <span>E-mail:</span>
                    </p>
                    <a
                      href={`mailto:${settings().email}`}
                      onClick={closeAllMenus}
                      class="mt-1 block break-words text-[13px] font-bold text-[#3D1260] hover:text-[#C22583]"
                    >
                      {settings().email}
                    </a>
                  </div>

                  <div class="pt-3.5">
                    <p class="flex items-center gap-2 text-[13px] font-medium text-[#3D1260]">
                      <Truck
                        class="size-4 shrink-0 text-[#C22583]"
                        aria-hidden="true"
                      />
                      <span>Rastreie o seu pedido:</span>
                    </p>
                    <form
                      onSubmit={submitQuickTrack}
                      class="mt-2 flex items-center rounded-full border border-[#EFE3F2] bg-[#FAF5FA] py-1.5 pl-4 pr-1.5 focus-within:border-[#C22583]"
                    >
                      <input
                        type="text"
                        value={trackCode()}
                        onInput={(e) => setTrackCode(e.currentTarget.value)}
                        placeholder="Código de rastreio"
                        aria-label="Código de rastreio do pedido"
                        class="min-w-0 flex-1 bg-transparent text-xs font-medium text-[#3D1260] placeholder:text-[#5B486B] focus:outline-none"
                      />
                      <button
                        type="submit"
                        aria-label="Consultar código de rastreio"
                        class="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[#C22583] transition-colors hover:bg-white"
                      >
                        <ChevronRight class="size-4" aria-hidden="true" />
                      </button>
                    </form>
                  </div>
                </div>
              </Show>
            </div>

            <Show when={isStaff()}>
              <Link
                to="/admin"
                class="hidden items-center gap-1 rounded-full border border-[var(--mf-primary)] px-2.5 py-1 text-xs font-bold text-[var(--mf-primary)] hover:bg-white md:inline-flex"
              >
                <Shield class="size-3.5" aria-hidden="true" />
                <span>Painel</span>
              </Link>
            </Show>

            {/* Minha Conta Popover */}
            <div
              class="relative"
              onMouseEnter={() => openPopover("account")}
              onMouseLeave={scheduleClosePopover}
            >
              <button
                type="button"
                aria-expanded={activePopover() === "account"}
                aria-haspopup="true"
                aria-label={
                  session.user()
                    ? `Conta de ${session.user()!.name.split(" ")[0]}`
                    : "Minha Conta"
                }
                onClick={() => togglePopoverOnClick("account")}
                class="inline-flex min-h-10 items-center gap-2 rounded-lg px-1.5 py-1.5 text-[14px] font-bold text-[#2E1049] hover:text-[var(--mf-primary)]"
              >
                <UserIcon
                  class="size-[30px] shrink-0 stroke-[1.6] text-[var(--mf-accent)]"
                  aria-hidden="true"
                />
                <span class="hidden sm:inline">
                  {session.user()
                    ? session.user()!.name.split(" ")[0]
                    : "Minha Conta"}
                </span>
              </button>

              <Show when={activePopover() === "account"}>
                <div
                  class="absolute right-0 top-full z-50 w-[250px] rounded-b-xl border-x border-b border-[#F2D4F0] border-t-[3px] border-t-[#DF2895] bg-white p-5 text-left shadow-2xl"
                  onMouseEnter={() => openPopover("account")}
                  onMouseLeave={scheduleClosePopover}
                >
                  <Show
                    when={session.status() === "authenticated"}
                    fallback={
                      <>
                        <Link
                          to="/entrar"
                          search={{ redirect: "" }}
                          onClick={closeAllMenus}
                          class="flex w-full items-center justify-center gap-2 rounded-full bg-[#C22583] py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#9E1A69]"
                        >
                          <LogIn class="size-4" aria-hidden="true" />
                          <span>Entrar</span>
                        </Link>
                        <div class="mt-4 space-y-2.5 text-[14px] font-medium text-[#3D1260]">
                          <Link
                            to="/entrar"
                            search={{ redirect: "/minha-conta" }}
                            onClick={closeAllMenus}
                            class="block hover:text-[#C22583]"
                          >
                            Meus pedidos
                          </Link>
                          <Link
                            to="/cadastro"
                            onClick={closeAllMenus}
                            class="block hover:text-[#C22583]"
                          >
                            Cadastrar
                          </Link>
                        </div>
                      </>
                    }
                  >
                    <p class="mb-3 truncate text-xs font-bold text-[#5B486B]">
                      Olá, {session.user()?.name}
                    </p>
                    <Link
                      to="/minha-conta"
                      onClick={closeAllMenus}
                      class="flex w-full items-center justify-center rounded-full bg-[#C22583] py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#9E1A69]"
                    >
                      Minha Conta
                    </Link>
                    <div class="mt-4 space-y-2 text-[14px] font-medium text-[#3D1260]">
                      <Link
                        to="/minha-conta"
                        onClick={closeAllMenus}
                        class="block hover:text-[#C22583]"
                      >
                        Meus pedidos
                      </Link>
                      <Show when={isStaff()}>
                        <Link
                          to="/admin"
                          onClick={closeAllMenus}
                          class="block hover:text-[#C22583]"
                        >
                          Painel Admin
                        </Link>
                      </Show>
                      <button
                        type="button"
                        onClick={() => void handleLogout()}
                        class="block w-full pt-1 text-left text-xs font-bold text-red-700 hover:underline"
                      >
                        Sair da conta
                      </button>
                    </div>
                  </Show>
                </div>
              </Show>
            </div>

            <button
              type="button"
              onClick={() => storefrontStore.setDrawerOpen(true)}
              aria-label={`Abrir carrinho com ${cartCount()} itens`}
              class="relative inline-flex size-11 items-center justify-center rounded-lg text-[#2E1049] hover:bg-[#FCE7F6]"
            >
              <ShoppingBag
                class="size-[30px] stroke-[1.6] text-[var(--mf-accent)]"
                aria-hidden="true"
              />
              <span class="absolute -right-0.5 top-0 inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-[#2E1049] px-1 text-[11px] font-bold text-white">
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
        <div class="relative mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-2 xl:px-6 2xl:gap-4">
          <div class="flex min-w-0 flex-1 items-center justify-between gap-1.5 pr-1 text-[12px] font-bold text-[#2E1049] xl:gap-2 xl:text-[13px] 2xl:gap-4 2xl:pr-4 2xl:text-[13.5px]">
            {/* Todas Categorias Mega-Menu */}
            <div
              class="shrink-0"
              onMouseEnter={() => openPopover("all")}
              onMouseLeave={scheduleClosePopover}
            >
              <button
                type="button"
                aria-expanded={activePopover() === "all"}
                aria-haspopup="true"
                onClick={() => togglePopoverOnClick("all")}
                class="inline-flex items-center gap-1.5 whitespace-nowrap py-1.5 font-bold text-[#2E1049] hover:text-[var(--mf-primary)]"
              >
                <Menu class="size-4 stroke-[2.25]" aria-hidden="true" />
                <span>Todas Categorias</span>
              </button>

              <Show when={activePopover() === "all"}>
                <div
                  class="absolute left-6 right-6 top-full z-50 rounded-b-xl border border-[#F2D4F0] bg-white p-7 shadow-2xl"
                  onMouseEnter={() => openPopover("all")}
                  onMouseLeave={scheduleClosePopover}
                >
                  <div class="grid grid-cols-3 gap-x-8 gap-y-6 xl:grid-cols-4">
                    <For each={categories()}>
                      {(cat) => (
                        <CategoryMegaColumn
                          category={cat}
                          onSelect={closeAllMenus}
                        />
                      )}
                    </For>
                  </div>
                </div>
              </Show>
            </div>

            {/* Top-level Categories with Rich 2-Col Mega Dropdown */}
            <For each={categories().slice(0, 8)}>
              {(cat, idx) => {
                const key = () => `cat:${cat.id}` as const;
                const alignRight = () => idx() >= 5;
                return (
                  <div
                    class="relative shrink-0"
                    onMouseEnter={() => openPopover(key())}
                    onMouseLeave={scheduleClosePopover}
                  >
                    <Link
                      to="/categoria/$slug"
                      params={{ slug: cat.slug }}
                      onClick={closeAllMenus}
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

                    <Show
                      when={
                        activePopover() === key() &&
                        (cat.children?.length ?? 0) > 0
                      }
                    >
                      <div
                        class={`absolute top-full z-50 rounded-b-xl border border-[#F2D4F0] bg-white p-6 shadow-2xl ${
                          alignRight() ? "right-0" : "left-0"
                        } ${cat.featured_product ? "w-[560px]" : "w-[300px]"}`}
                        onMouseEnter={() => openPopover(key())}
                        onMouseLeave={scheduleClosePopover}
                      >
                        <div class="flex gap-5">
                          <div
                            class={`min-w-0 flex-1 ${
                              cat.featured_product
                                ? "border-r border-zinc-100 pr-5"
                                : ""
                            }`}
                          >
                            <div class="flex items-center justify-between gap-2 border-b border-zinc-100 pb-3">
                              <span class="text-base font-extrabold text-[#3D1260]">
                                {cat.name}
                              </span>
                              <Link
                                to="/categoria/$slug"
                                params={{ slug: cat.slug }}
                                onClick={closeAllMenus}
                                class="inline-flex shrink-0 items-center rounded-full bg-[#C22583] px-3.5 py-1 text-xs font-bold text-white transition-colors hover:bg-[#9E1A69]"
                              >
                                + ver tudo
                              </Link>
                            </div>
                            <div class="mt-3 max-h-[340px] overflow-y-auto pr-1">
                              <CategorySubtreeList
                                nodes={cat.children ?? []}
                                boldTopLevel={true}
                                onSelect={closeAllMenus}
                              />
                            </div>
                          </div>

                          <Show when={cat.featured_product}>
                            {(featured) => (
                              <div class="w-[220px] shrink-0">
                                <ProductCard
                                  product={featured()}
                                  borderless={true}
                                />
                              </div>
                            )}
                          </Show>
                        </div>
                      </div>
                    </Show>
                  </div>
                );
              }}
            </For>
            <Show when={categories().length <= 6}>
              <Link
                to="/marca/$slug"
                params={{ slug: "mistura-lab" }}
                onClick={closeAllMenus}
                class="hidden whitespace-nowrap py-1.5 text-[#2E1049] hover:text-[var(--mf-primary)] xl:inline-flex"
              >
                Mistura Lab
              </Link>
              <Link
                to="/marca/$slug"
                params={{ slug: "lumiere-nails" }}
                onClick={closeAllMenus}
                class="hidden whitespace-nowrap py-1.5 text-[#2E1049] hover:text-[var(--mf-primary)] xl:inline-flex"
              >
                Lumière
              </Link>
            </Show>
          </div>

          {/* Promoções Pill & Mega-Panel */}
          <div
            class="shrink-0"
            onMouseEnter={() => openPopover("promo")}
            onMouseLeave={scheduleClosePopover}
          >
            <Link
              to="/promocoes"
              onClick={closeAllMenus}
              class="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-[13px] font-bold text-white transition-colors hover:opacity-95 2xl:gap-2 2xl:px-5 2xl:text-[13.5px]"
              style={{ "background-color": "var(--mf-secondary)" }}
            >
              <BadgePercent class="size-4 shrink-0" aria-hidden="true" />
              <span>Promoções</span>
            </Link>

            <Show when={activePopover() === "promo"}>
              <div
                class="absolute left-6 right-6 top-full z-50 overflow-hidden rounded-b-xl border border-[#F2D4F0] bg-white shadow-2xl"
                onMouseEnter={() => openPopover("promo")}
                onMouseLeave={scheduleClosePopover}
              >
                <div class="grid grid-cols-[1fr_270px] xl:grid-cols-[1fr_300px]">
                  <div class="relative bg-white p-5">
                    <div class="grid grid-cols-3 gap-3 xl:grid-cols-4">
                      <For
                        each={promoProducts().slice(
                          promoOffset(),
                          promoOffset() + 4,
                        )}
                      >
                        {(prod) => (
                          <ProductCard product={prod} borderless={true} />
                        )}
                      </For>
                    </div>
                    <Show when={promoProducts().length > 4}>
                      <button
                        type="button"
                        aria-label="Ofertas anteriores"
                        onClick={promoSlidePrev}
                        class="absolute left-2 top-1/2 -translate-y-1/2 inline-flex size-8 items-center justify-center rounded-full border border-[#F2D4F0] bg-white/95 text-[#3D1260] shadow hover:bg-[#FCE7F6]"
                      >
                        <ChevronLeft class="size-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label="Próximas ofertas"
                        onClick={promoSlideNext}
                        class="absolute right-2 top-1/2 -translate-y-1/2 inline-flex size-8 items-center justify-center rounded-full border border-[#F2D4F0] bg-white/95 text-[#3D1260] shadow hover:bg-[#FCE7F6]"
                      >
                        <ChevronRight class="size-4" aria-hidden="true" />
                      </button>
                    </Show>
                  </div>

                  <div class="flex flex-col items-center justify-center border-l border-zinc-100 bg-[#FCF9FC] px-6 py-8 text-center">
                    <p class="text-2xl font-black uppercase tracking-tight text-[#3D1260]">
                      OFERTAS ESPECIAIS
                    </p>
                    <p class="mt-1.5 text-sm font-medium text-[#3D1260]">
                      Aproveite descontos por tempo limitado!
                    </p>
                    <Link
                      to="/promocoes"
                      onClick={closeAllMenus}
                      class="mt-5 inline-flex items-center justify-center rounded-full bg-[#C22583] px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#9E1A69]"
                    >
                      Ver todos os produtos
                    </Link>
                  </div>
                </div>
              </div>
            </Show>
          </div>
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
        class="text-[13px] font-extrabold text-[#3D1260] hover:text-[#C22583]"
      >
        {props.category.name}
      </Link>
      <Show when={(props.category.children?.length ?? 0) > 0}>
        <div class="mt-2">
          <CategorySubtreeList
            nodes={props.category.children ?? []}
            boldTopLevel={false}
            onSelect={props.onSelect}
          />
        </div>
      </Show>
    </div>
  );
}

function CategorySubtreeList(props: {
  nodes: CategoryNode[];
  boldTopLevel: boolean;
  onSelect: () => void;
}) {
  return (
    <ul class="space-y-1.5">
      <For each={props.nodes}>
        {(child) => (
          <li>
            <Link
              to="/categoria/$slug"
              params={{ slug: child.slug }}
              onClick={props.onSelect}
              class={`flex items-start gap-2 text-[13px] text-[#3D1260] transition-colors hover:text-[#C22583] ${
                props.boldTopLevel ? "font-bold" : "font-medium"
              }`}
            >
              <span
                class="mt-1.5 size-1.5 shrink-0 bg-[#3D1260]"
                aria-hidden="true"
              />
              <span>{child.name}</span>
            </Link>
            <Show when={(child.children?.length ?? 0) > 0}>
              <ul class="mt-1 space-y-1 pl-4">
                <For each={child.children}>
                  {(grandChild) => (
                    <li>
                      <Link
                        to="/categoria/$slug"
                        params={{ slug: grandChild.slug }}
                        onClick={props.onSelect}
                        class="flex items-start gap-1.5 text-[12.5px] font-normal text-[#4E3B63] transition-colors hover:text-[#C22583]"
                      >
                        <span
                          class="mt-1.5 inline-flex shrink-0 items-center gap-0.5"
                          aria-hidden="true"
                        >
                          <span class="size-1 bg-[#3D1260]" />
                          <span class="size-1 bg-[#3D1260]" />
                        </span>
                        <span>{grandChild.name}</span>
                      </Link>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </li>
        )}
      </For>
    </ul>
  );
}
