import { ProductImage } from "./ProductImage";
import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { Link, useNavigate } from "@tanstack/solid-router";
import BadgePercent from "lucide-solid/icons/badge-percent";
import Boxes from "lucide-solid/icons/boxes";
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
import { trackSearch } from "../../../monitoring/analytics";
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
  const [isScrolled, setIsScrolled] = createSignal(false);
  const [scrollProgress, setScrollProgress] = createSignal(0);

  createEffect(() => {
    if (typeof window === "undefined") return;
    const updateScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop;
      setIsScrolled(y > 15);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(
        max > 0 ? Math.min(100, Math.max(0, (y / max) * 100)) : 0,
      );
    };
    window.addEventListener("scroll", updateScroll, { passive: true });
    updateScroll();
    onCleanup(() => window.removeEventListener("scroll", updateScroll));
  });

  const settings = () => storefrontStore.settings();
  const categories = () => {
    const raw = storefrontStore.bootstrap().menu_categories;
    if (!raw.length) return raw;
    // Prioriza a ordem da jornada da manicure
    const priorityOrder = [
      "alongamento-unhas",
      "esmalte-em-gel",
      "esmalte",
      "maquinarios",
      "acessorios",
      "cuidados-unhas",
      "decoracao",
      "kits",
      "descartaveis",
      "higiene-e-esterilizacao",
      "cilios-e-sobrancelhas",
      "depilacao",
    ];
    return [...raw].sort((a, b) => {
      const idxA = priorityOrder.indexOf(a.slug);
      const idxB = priorityOrder.indexOf(b.slug);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.name.localeCompare(b.name);
    });
  };
  const megaMenuColumns = () => {
    const cats = categories();
    if (!cats.length) return [];
    const bySlug = new Map(cats.map((c) => [c.slug, c]));

    const col1Slugs = ["alongamento-unhas"];
    const col2Slugs = ["esmalte-em-gel", "esmalte"];
    const col3Slugs = ["maquinarios", "acessorios"];
    const col4Slugs = [
      "cuidados-unhas",
      "decoracao",
      "kits",
      "descartaveis",
      "higiene-e-esterilizacao",
      "cilios-e-sobrancelhas",
    ];

    const used = new Set<string>();
    const getCats = (slugs: string[]) => {
      const res: CategoryNode[] = [];
      for (const s of slugs) {
        const found = bySlug.get(s);
        if (found) {
          res.push(found);
          used.add(s);
        }
      }
      return res;
    };

    const col1 = getCats(col1Slugs);
    const col2 = getCats(col2Slugs);
    const col3 = getCats(col3Slugs);
    const col4 = getCats(col4Slugs);

    for (const c of cats) {
      if (!used.has(c.slug)) {
        col4.push(c);
      }
    }

    return [col1, col2, col3, col4].filter((col) => col.length > 0);
  };
  const [mobileExpandedCats, setMobileExpandedCats] = createSignal<
    Record<number, boolean>
  >({});
  const toggleMobileCategory = (id: number) => {
    setMobileExpandedCats((prev) => ({ ...prev, [id]: !prev[id] }));
  };
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
    if (q) {
      trackSearch(q);
    }
    setShowDropdown(false);
    setMobileMenuOpen(false);
    void navigate({ to: "/buscar", search: { q } });
  };

  return (
    <header
      ref={headerRef}
      class={`sticky top-0 z-40 bg-[#FFF3FF] transition-all duration-300 ${
        isScrolled()
          ? "border-b border-[#DFC2E3] shadow-[0_6px_22px_rgba(46,12,73,0.08)]"
          : "border-b border-[#EBD4EC]"
      }`}
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

          {/* Desktop Search Left */}
          <div class="relative hidden w-full max-w-[380px] lg:block">
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
                class="h-11 w-full rounded-lg border border-[#D9B8E0] bg-[#FAF5FB] pl-4 pr-20 text-[14px] font-medium text-[#2E1049] placeholder:font-normal placeholder:text-[#6E5678] shadow-2xs transition-all [&::-webkit-search-cancel-button]:appearance-none hover:border-[#93509e]/70 hover:bg-white focus:border-[#93509e] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#93509e]/20"
              />
              <Show when={searchQuery().length > 0}>
                <button
                  type="button"
                  aria-label="Limpar busca"
                  onClick={() => {
                    setSearchQuery("");
                    setSuggestions([]);
                    setShowDropdown(false);
                  }}
                  class="absolute right-11 inline-flex size-7 items-center justify-center rounded-md text-[#6E5678] transition-colors hover:bg-[#F3E8F6] hover:text-[#2E1049]"
                >
                  <X class="size-3.5" aria-hidden="true" />
                </button>
              </Show>
              <button
                type="submit"
                aria-label="Buscar"
                class="absolute right-1.5 inline-flex size-8 items-center justify-center rounded-md bg-[#93509e] text-white shadow-2xs transition-colors hover:bg-[#7c3f87]"
              >
                <Search class="size-4 stroke-[2.2]" aria-hidden="true" />
              </button>
            </form>
            <Show when={showDropdown() && suggestions().length > 0}>
              <div class="absolute left-0 right-0 top-12 z-50 w-full min-w-[340px] rounded-xl border border-[#E5D4E8] bg-white p-2.5 shadow-[0_16px_36px_-12px_rgba(46,16,73,0.18)]">
                <For each={suggestions()}>
                  {(item) => (
                    <Link
                      to="/produto/$slug"
                      params={{ slug: item.slug }}
                      onClick={() => setShowDropdown(false)}
                      class="flex items-center gap-3 rounded-lg p-2 hover:bg-[#FFF3FF]"
                    >
                      <ProductImage
                        src={item.primary_image}
                        alt={item.primary_image_alt}
                        class="size-10 shrink-0 rounded bg-[#FAF7F8] object-contain"
                      />
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-xs font-medium text-ink">
                          {item.name}
                        </p>
                        <p class="text-xs font-bold text-[#93509e]">
                          {formatCents(item.effective_price_cents)}
                        </p>
                      </div>
                    </Link>
                  )}
                </For>
                <button
                  type="button"
                  onClick={submitSearch}
                  class="mt-1 w-full rounded-lg border border-[#93509e] bg-white py-2 text-center text-xs font-semibold text-[#93509e] transition-colors hover:bg-[#93509e] hover:text-white"
                >
                  Ver todos os resultados para “{searchQuery()}”
                </button>
              </div>
            </Show>
          </div>

          {/* Brand Logo Centered */}
          <Link
            to="/"
            class="flex shrink-0 items-center justify-center rounded-lg px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            <img
              src={assetUrl(settings().logo_light_url || "/logo-mf.png")}
              alt={settings().store_name || "Mistura Feminina Cosméticos"}
              width="160"
              height="48"
              fetchpriority="high"
              class="h-11 w-auto object-contain sm:h-12"
              onError={(e) => {
                if (!e.currentTarget.dataset.fallback) {
                  e.currentTarget.dataset.fallback = "1";
                  e.currentTarget.src = "/logo-mf.png";
                }
              }}
            />
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
                  class="absolute right-0 top-full z-50 mt-1 w-[295px] rounded-2xl border border-zinc-200/80 bg-white/98 p-5 text-left shadow-[0_16px_40px_-12px_rgba(46,16,73,0.14)] backdrop-blur-md"
                  onMouseEnter={() => openPopover("support")}
                  onMouseLeave={scheduleClosePopover}
                >
                  <Show when={settings().whatsapp_number}>
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
                        {settings().whatsapp_number}
                      </a>
                    </div>
                  </Show>

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
                      class="mt-2 flex items-center rounded-lg border border-[#EFE3F2] bg-[#FAF5FA] py-1.5 pl-3.5 pr-1.5 focus-within:border-[#93509e]"
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
                        class="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-[#93509e] text-white transition-colors hover:bg-[#7c3f87]"
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
                class="hidden items-center gap-1 rounded-lg border border-[#93509e] bg-white px-2.5 py-1 text-xs font-bold text-[#93509e] transition-colors hover:bg-[#93509e] hover:text-white md:inline-flex"
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
                  class="absolute right-0 top-full z-50 mt-1 w-[250px] rounded-2xl border border-zinc-200/80 bg-white/98 p-5 text-left shadow-[0_16px_40px_-12px_rgba(46,16,73,0.14)] backdrop-blur-md"
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
                          class="flex w-full items-center justify-center gap-2 rounded-lg bg-[#93509e] py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#7c3f87]"
                        >
                          <LogIn class="size-4" aria-hidden="true" />
                          <span>Entrar</span>
                        </Link>
                        <div class="mt-4 space-y-2.5 text-[14px] font-medium text-[#3D1260]">
                          <Link
                            to="/minha-reposicao"
                            onClick={closeAllMenus}
                            class="block hover:text-[#C22583]"
                          >
                            Minha Lista de Reposição
                          </Link>
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
                      class="flex w-full items-center justify-center rounded-lg bg-[#93509e] py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#7c3f87]"
                    >
                      Minha Conta
                    </Link>
                    <div class="mt-4 space-y-2 text-[14px] font-medium text-[#3D1260]">
                      <Link
                        to="/minha-reposicao"
                        onClick={closeAllMenus}
                        class="block hover:text-[#C22583]"
                      >
                        Minha Lista de Reposição
                      </Link>
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
              <span class="absolute -right-0.5 top-0 inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-md bg-[#93509e] px-1 text-[11px] font-bold text-white">
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
            class="h-10 w-full rounded-lg border border-[#D9B8E0] bg-white pl-3.5 pr-11 text-sm font-medium text-[#2E1049] placeholder:font-normal placeholder:text-[#6E5678] shadow-2xs transition-all [&::-webkit-search-cancel-button]:appearance-none focus:border-[#93509e] focus:outline-none focus:ring-2 focus:ring-[#93509e]/20"
          />
          <button
            type="submit"
            aria-label="Buscar"
            class="absolute right-1.5 inline-flex size-7 items-center justify-center rounded-md bg-[#93509e] text-white transition-colors hover:bg-[#7c3f87]"
          >
            <Search class="size-3.5 stroke-[2.2]" aria-hidden="true" />
          </button>
        </form>
      </div>

      {/* Desktop Category Navigation Bar */}
      <nav
        aria-label="Departamentos da loja"
        class="hidden bg-[#FFF3FF] lg:block"
      >
        <div class="relative mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-2 xl:px-6 2xl:gap-4">
          <div class="flex min-w-0 flex-1 items-center gap-2 pr-1 text-[12px] font-bold text-[#2E1049] xl:gap-3 xl:text-[13px] 2xl:gap-4 2xl:pr-4 2xl:text-[13.5px]">
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
                  class="absolute left-4 top-full z-50 mt-1 w-[980px] max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_20px_48px_-12px_rgba(46,16,73,0.18)] backdrop-blur-md"
                  onMouseEnter={() => openPopover("all")}
                  onMouseLeave={scheduleClosePopover}
                >
                  <div class="flex items-center justify-between border-b border-zinc-100 bg-[#FAF8FC] px-4 py-2.5">
                    <span class="text-[11.5px] font-bold uppercase tracking-[0.14em] text-[#2E0C49]">
                      Departamentos
                    </span>
                    <Link
                      to="/categorias"
                      onClick={closeAllMenus}
                      class="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#93509e] transition-colors hover:text-[#7c3f87]"
                    >
                      <span>Ver todas as categorias</span>
                      <ChevronRight class="size-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                  <div class="grid max-h-[min(480px,calc(100vh-140px))] grid-cols-4 gap-x-5 overflow-y-auto p-4">
                    <For each={megaMenuColumns()}>
                      {(columnCats) => (
                        <div class="space-y-4">
                          <For each={columnCats}>
                            {(cat) => (
                              <CategoryMegaColumn
                                category={cat}
                                onSelect={closeAllMenus}
                              />
                            )}
                          </For>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </Show>
            </div>

            {/* Top-level Categories with Rich Minimalist Dropdown */}
            <For each={categories().slice(0, 8)}>
              {(cat, idx) => {
                const key = () => `cat:${cat.id}` as const;
                const alignRight = () => idx() >= 5;
                return (
                  <div
                    class={`relative shrink-0 ${idx() >= 6 ? "hidden 2xl:block" : idx() >= 5 ? "hidden xl:block" : ""}`}
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
                        class={`absolute top-full z-50 mt-1 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/98 p-4 shadow-[0_16px_40px_-12px_rgba(46,16,73,0.14)] backdrop-blur-md ${
                          alignRight() ? "right-0" : "left-0"
                        } ${cat.featured_product ? "w-[470px]" : "w-[270px]"}`}
                        onMouseEnter={() => openPopover(key())}
                        onMouseLeave={scheduleClosePopover}
                      >
                        <div class="flex gap-4">
                          <div class="min-w-0 flex-1">
                            <div class="mb-2 flex items-center justify-between border-b border-zinc-100 px-2 pb-2.5">
                              <span class="text-[13.5px] font-bold uppercase tracking-[0.1em] text-[#2E0C49]">
                                {cat.name}
                              </span>
                              <Link
                                to="/categoria/$slug"
                                params={{ slug: cat.slug }}
                                onClick={closeAllMenus}
                                class="inline-flex shrink-0 items-center gap-0.5 text-[12.5px] font-semibold text-[#93509e] transition-colors hover:text-[#7c3f87]"
                              >
                                <span>Ver tudo</span>
                                <ChevronRight
                                  class="size-3.5"
                                  aria-hidden="true"
                                />
                              </Link>
                            </div>
                            <div class="max-h-[320px] overflow-y-auto pr-1">
                              <CategorySubtreeList
                                nodes={cat.children ?? []}
                                onSelect={closeAllMenus}
                              />
                            </div>
                          </div>

                          <Show when={cat.featured_product}>
                            {(featured) => (
                              <Link
                                to="/produto/$slug"
                                params={{ slug: featured().slug }}
                                onClick={closeAllMenus}
                                class="group flex w-[172px] shrink-0 flex-col justify-between rounded-xl border border-zinc-100 bg-[#FAF8FC] p-3 transition hover:border-[#E5D8EE]"
                              >
                                <span class="text-[10px] font-bold uppercase tracking-[0.14em] text-[#62298D]">
                                  Destaque
                                </span>
                                <div class="my-2 aspect-square w-full overflow-hidden rounded-lg bg-white p-2">
                                  <ProductImage
                                    src={featured().primary_image}
                                    alt={featured().name}
                                    class="h-full w-full object-contain transition-transform duration-200 group-hover:scale-105"
                                    loading="lazy"
                                  />
                                </div>
                                <div>
                                  <p class="line-clamp-2 text-xs font-medium leading-snug text-[#2E0C49]">
                                    {featured().name}
                                  </p>
                                  <div class="mt-2 flex items-center justify-between">
                                    <span class="text-xs font-extrabold text-[#3D1260]">
                                      {formatCents(
                                        featured().effective_price_cents,
                                      )}
                                    </span>
                                    <ChevronRight
                                      class="size-3.5 text-[#62298D] transition-transform group-hover:translate-x-0.5"
                                      aria-hidden="true"
                                    />
                                  </div>
                                </div>
                              </Link>
                            )}
                          </Show>
                        </div>
                      </div>
                    </Show>
                  </div>
                );
              }}
            </For>
          </div>

          {/* Right Action Buttons */}
          <div class="flex shrink-0 items-center gap-2">
            {/* Atacado Link */}
            <Link
              to="/atacado"
              onClick={closeAllMenus}
              class="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#93509e] bg-white px-3 py-1.5 text-[12.5px] font-bold text-[#93509e] transition-colors hover:bg-[#FCE7F6] xl:px-3.5 xl:text-[13px] 2xl:gap-2 2xl:px-4 2xl:text-[13.5px]"
            >
              <Boxes class="size-4 shrink-0 text-[#93509e]" aria-hidden="true" />
              <span>Atacado</span>
            </Link>

            {/* Reposição Rápida Link */}
            <Link
              to="/minha-reposicao"
              onClick={closeAllMenus}
              class="hidden sm:inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-dashed border-[#DFC4E6] bg-[#FAF3FC] px-2.5 py-1.5 text-[12px] font-bold text-[#7C2784] transition-colors hover:bg-[#F3E2F6]"
            >
              <span>Reposição</span>
            </Link>

            {/* Promoções Pill & Mega-Panel */}
            <div
              class="shrink-0"
              onMouseEnter={() => openPopover("promo")}
              onMouseLeave={scheduleClosePopover}
            >
              <Link
                to="/promocoes"
                onClick={closeAllMenus}
                class="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#93509e] px-3.5 py-1.5 text-[12.5px] font-bold text-white transition-colors hover:bg-[#7c3f87] xl:px-4 xl:text-[13px] 2xl:gap-2 2xl:px-5 2xl:text-[13.5px]"
              >
                <BadgePercent class="size-4 shrink-0" aria-hidden="true" />
                <span>Promoções</span>
              </Link>

            <Show when={activePopover() === "promo"}>
              <div
                class="absolute left-6 right-6 top-full z-50 mt-1 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/98 shadow-[0_20px_48px_-12px_rgba(46,16,73,0.14)] backdrop-blur-md"
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
                        class="absolute left-2 top-1/2 -translate-y-1/2 inline-flex size-8 items-center justify-center rounded-lg border border-[#93509e] bg-white text-[#93509e] shadow-xs transition-colors hover:bg-[#93509e] hover:text-white"
                      >
                        <ChevronLeft class="size-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label="Próximas ofertas"
                        onClick={promoSlideNext}
                        class="absolute right-2 top-1/2 -translate-y-1/2 inline-flex size-8 items-center justify-center rounded-lg border border-[#93509e] bg-white text-[#93509e] shadow-xs transition-colors hover:bg-[#93509e] hover:text-white"
                      >
                        <ChevronRight class="size-4" aria-hidden="true" />
                      </button>
                    </Show>
                  </div>

                  <div class="flex flex-col items-center justify-center border-l border-zinc-100 bg-[#FAF8FC] px-6 py-8 text-center">
                    <p class="text-2xl font-black uppercase tracking-tight text-[#3D1260]">
                      OFERTAS ESPECIAIS
                    </p>
                    <p class="mt-1.5 text-sm font-medium text-[#3D1260]">
                      Aproveite descontos por tempo limitado!
                    </p>
                    <Link
                      to="/promocoes"
                      onClick={closeAllMenus}
                      class="mt-5 inline-flex items-center justify-center rounded-lg bg-[#93509e] px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#7c3f87]"
                    >
                      Ver todos os produtos
                    </Link>
                  </div>
                </div>
              </div>
            </Show>
          </div>
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
              <div class="flex items-center gap-2.5">
                <img
                  src={assetUrl(settings().logo_light_url || "/logo-mf.png")}
                  alt=""
                  aria-hidden="true"
                  class="h-7 w-auto object-contain"
                  onError={(e) => {
                    if (!e.currentTarget.dataset.fallback) {
                      e.currentTarget.dataset.fallback = "1";
                      e.currentTarget.src = "/logo-mf.png";
                    }
                  }}
                />
                <span class="text-sm font-bold text-ink">Departamentos</span>
              </div>
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
                  {(cat) => {
                    const hasChildren = () => (cat.children?.length ?? 0) > 0;
                    const isExpanded = () => Boolean(mobileExpandedCats()[cat.id]);
                    return (
                      <div class="border-b border-zinc-100 pb-3">
                        <div class="flex items-center justify-between gap-2">
                          <Link
                            to="/categoria/$slug"
                            params={{ slug: cat.slug }}
                            onClick={() => setMobileMenuOpen(false)}
                            class="min-w-0 flex-1 py-1 text-[15px] font-semibold text-ink hover:text-[#93509e]"
                          >
                            {cat.name}
                          </Link>
                          <Show when={hasChildren()}>
                            <button
                              type="button"
                              aria-expanded={isExpanded()}
                              aria-label={`Expandir subcategorias de ${cat.name}`}
                              onClick={() => toggleMobileCategory(cat.id)}
                              class="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100"
                            >
                              <ChevronDown
                                class={`size-4 transition-transform ${isExpanded() ? "rotate-180 text-[#93509e]" : ""}`}
                                aria-hidden="true"
                              />
                            </button>
                          </Show>
                        </div>
                        <Show when={hasChildren() && isExpanded()}>
                          <div class="mt-1.5 space-y-1 pl-3">
                            <For each={cat.children}>
                              {(child) => (
                                <div>
                                  <Link
                                    to="/categoria/$slug"
                                    params={{ slug: child.slug }}
                                    onClick={() => setMobileMenuOpen(false)}
                                    class="flex items-center gap-2 py-1 text-[13.5px] font-medium text-muted hover:text-[#93509e]"
                                  >
                                    <span
                                      class="size-1.5 shrink-0 rounded-full bg-[#93509e]"
                                      aria-hidden="true"
                                    />
                                    <span>{child.name}</span>
                                  </Link>
                                  <Show when={(child.children?.length ?? 0) > 0}>
                                    <div class="ml-2 mt-0.5 space-y-0.5 border-l border-zinc-200 pl-3">
                                      <For each={child.children}>
                                        {(grandChild) => (
                                          <Link
                                            to="/categoria/$slug"
                                            params={{ slug: grandChild.slug }}
                                            onClick={() => setMobileMenuOpen(false)}
                                            class="block py-1 text-[12.5px] text-zinc-600 hover:text-[#93509e]"
                                          >
                                            {grandChild.name}
                                          </Link>
                                        )}
                                      </For>
                                    </div>
                                  </Show>
                                </div>
                              )}
                            </For>
                            <Link
                              to="/categoria/$slug"
                              params={{ slug: cat.slug }}
                              onClick={() => setMobileMenuOpen(false)}
                              class="inline-flex items-center gap-1 pt-1 text-xs font-bold text-[#93509e] hover:underline"
                            >
                              <span>Ver tudo em {cat.name}</span>
                              <ChevronRight class="size-3.5" aria-hidden="true" />
                            </Link>
                          </div>
                        </Show>
                      </div>
                    );
                  }}
                </For>

                <div class="space-y-2 pt-2">
                  <Link
                    to="/promocoes"
                    onClick={() => setMobileMenuOpen(false)}
                    class="block rounded-lg bg-[#93509e] px-3 py-2.5 text-center text-sm font-bold text-white transition-colors hover:bg-[#7c3f87]"
                  >
                    Ver Promoções
                  </Link>
                  <Link
                    to="/atacado"
                    onClick={() => setMobileMenuOpen(false)}
                    class="block rounded-lg border-2 border-[#93509e] bg-[#FFF3FF] px-3 py-2.5 text-center text-sm font-bold text-[#93509e] transition-colors hover:bg-[#93509e] hover:text-white"
                  >
                    Atacado (Preços por Quantidade)
                  </Link>
                  <Link
                    to="/novidades"
                    onClick={() => setMobileMenuOpen(false)}
                    class="block rounded-lg border border-[#93509e] bg-white px-3 py-2.5 text-center text-sm font-semibold text-[#93509e] transition-colors hover:bg-[#93509e] hover:text-white"
                  >
                    Novidades
                  </Link>
                  <Link
                    to="/minha-reposicao"
                    onClick={() => setMobileMenuOpen(false)}
                    class="block rounded-lg border border-[#93509e] bg-white px-3 py-2.5 text-center text-sm font-semibold text-[#93509e] transition-colors hover:bg-[#93509e] hover:text-white"
                  >
                    Minha Lista de Reposição
                  </Link>
                  <Link
                    to="/rastrear-pedido"
                    onClick={() => setMobileMenuOpen(false)}
                    class="block rounded-lg border border-[#93509e] bg-white px-3 py-2.5 text-center text-sm font-semibold text-[#93509e] transition-colors hover:bg-[#93509e] hover:text-white"
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
                    class="block rounded-lg border border-[#93509e] bg-white px-3 py-2.5 text-center text-sm font-semibold text-[#93509e] transition-colors hover:bg-[#93509e] hover:text-white"
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

      {/* Scroll Progress Indicator Bar */}
      <div
        class="absolute bottom-0 left-0 h-[2.5px] bg-[#93509e] transition-[width] duration-100 ease-out"
        style={{ width: `${scrollProgress()}%` }}
        aria-hidden="true"
      />
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
        class="mb-1.5 flex items-center justify-between gap-1.5 border-b border-zinc-100 pb-1 text-[12px] font-bold uppercase tracking-[0.05em] text-[#2E0C49] transition-colors hover:text-[#93509e]"
      >
        <span class="flex min-w-0 items-center gap-1.5">
          <span
            class="size-1.5 shrink-0 rounded-full bg-[#93509e]"
            aria-hidden="true"
          />
          <span class="truncate">{props.category.name}</span>
        </span>
        <ChevronRight
          class="size-3 shrink-0 text-zinc-400"
          aria-hidden="true"
        />
      </Link>
      <Show when={(props.category.children?.length ?? 0) > 0}>
        <CategorySubtreeList
          nodes={props.category.children ?? []}
          onSelect={props.onSelect}
        />
      </Show>
    </div>
  );
}

function CategorySubtreeList(props: {
  nodes: CategoryNode[];
  onSelect: () => void;
}) {
  return (
    <ul class="space-y-0.5">
      <For each={props.nodes}>
        {(child) => (
          <li>
            <Link
              to="/categoria/$slug"
              params={{ slug: child.slug }}
              onClick={props.onSelect}
              class="group flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[12px] font-medium leading-tight text-[#3D2352] transition-colors hover:bg-[#FAF6FC] hover:text-[#93509e]"
            >
              <span
                class="size-1 shrink-0 rounded-full bg-[#93509e]/70 transition-transform duration-200 group-hover:scale-125 group-hover:bg-[#93509e]"
                aria-hidden="true"
              />
              <span class="truncate">{child.name}</span>
            </Link>
            <Show when={(child.children?.length ?? 0) > 0}>
              <ul class="ml-2 mt-0.5 space-y-0.5 border-l border-zinc-200/70 pl-2">
                <For each={child.children}>
                  {(grandChild) => (
                    <li>
                      <Link
                        to="/categoria/$slug"
                        params={{ slug: grandChild.slug }}
                        onClick={props.onSelect}
                        class="group/sub flex items-center gap-1 rounded px-1 py-0.5 text-[11px] font-medium leading-tight text-zinc-500 transition-colors hover:bg-[#FAF6FC] hover:text-[#93509e]"
                      >
                        <span
                          class="size-1 shrink-0 rounded-full bg-[#93509e]/50 transition-colors group-hover/sub:bg-[#93509e]"
                          aria-hidden="true"
                        />
                        <span class="truncate">{grandChild.name}</span>
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
