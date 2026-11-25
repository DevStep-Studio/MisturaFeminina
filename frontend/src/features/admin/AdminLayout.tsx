import "../../styles/admin.css";
import { Link, useRouterState } from "@tanstack/solid-router";
import BarChart3 from "lucide-solid/icons/chart-column";
import Boxes from "lucide-solid/icons/boxes";
import ChevronUp from "lucide-solid/icons/chevron-up";
import ExternalLink from "lucide-solid/icons/external-link";
import FolderTree from "lucide-solid/icons/folder-tree";
import LayoutDashboard from "lucide-solid/icons/layout-dashboard";
import Megaphone from "lucide-solid/icons/megaphone";
import Menu from "lucide-solid/icons/menu";
import Package from "lucide-solid/icons/package";
import Palette from "lucide-solid/icons/palette";
import Settings from "lucide-solid/icons/settings";
import ShieldCheck from "lucide-solid/icons/shield-check";
import ShoppingCart from "lucide-solid/icons/shopping-cart";
import Sparkles from "lucide-solid/icons/sparkles";
import Truck from "lucide-solid/icons/truck";
import UserCircle from "lucide-solid/icons/user";
import X from "lucide-solid/icons/x";
import {
  For,
  type JSX,
  type ParentProps,
  Show,
  createEffect,
  createResource,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { StatusPage } from "../../components/errors/status-page";
import { LogoutButton } from "../auth/components/logout-button";
import { loadStorefrontBootstrap, storefrontStore } from "../storefront/store";
import { api } from "../../lib/api";
import { assetUrl } from "../../lib/format";
import { hasPermission } from "../../security/permissions";
import { session } from "../../security/session";

interface AdminNavItem {
  to: string;
  label: string;
  permission: string;
  icon:
    | "dashboard"
    | "orders"
    | "products"
    | "cats"
    | "appearance"
    | "marketing"
    | "shipping"
    | "reports"
    | "settings"
    | "system"
    | "ai"
    | "wholesale";
}

const NAV_ITEMS: AdminNavItem[] = [
  {
    to: "/admin",
    label: "Painel",
    permission: "dashboard.view",
    icon: "dashboard",
  },
  {
    to: "/admin/ia",
    label: "Central de IA",
    permission: "ai.view",
    icon: "ai",
  },
  {
    to: "/admin/pedidos",
    label: "Pedidos",
    permission: "orders.view",
    icon: "orders",
  },
  {
    to: "/admin/produtos",
    label: "Produtos & Estoque",
    permission: "catalog.view",
    icon: "products",
  },
  {
    to: "/admin/atacado",
    label: "Atacado",
    permission: "wholesale.view",
    icon: "wholesale",
  },
  {
    to: "/admin/categorias-marcas",
    label: "Categorias & Marcas",
    permission: "catalog.view",
    icon: "cats",
  },
  {
    to: "/admin/aparencia",
    label: "Banners, Home & Páginas",
    permission: "content.view",
    icon: "appearance",
  },
  {
    to: "/admin/marketing",
    label: "Cupons & Promoções",
    permission: "marketing.view",
    icon: "marketing",
  },
  {
    to: "/admin/frete-pagamentos",
    label: "Frete & Pagamentos",
    permission: "shipping.view",
    icon: "shipping",
  },
  {
    to: "/admin/relatorios",
    label: "Relatórios",
    permission: "reports.view",
    icon: "reports",
  },
  {
    to: "/admin/configuracoes",
    label: "Marca & Integrações",
    permission: "settings.view",
    icon: "settings",
  },
  {
    to: "/admin/equipe-sistema",
    label: "Clientes, Equipe & Saúde",
    permission: "customers.view",
    icon: "system",
  },
];

function renderNavIcon(kind: AdminNavItem["icon"]) {
  switch (kind) {
    case "dashboard":
      return <LayoutDashboard class="h-4 w-4 shrink-0" />;
    case "orders":
      return <ShoppingCart class="h-4 w-4 shrink-0" />;
    case "products":
      return <Package class="h-4 w-4 shrink-0" />;
    case "cats":
      return <FolderTree class="h-4 w-4 shrink-0" />;
    case "appearance":
      return <Palette class="h-4 w-4 shrink-0" />;
    case "marketing":
      return <Megaphone class="h-4 w-4 shrink-0" />;
    case "shipping":
      return <Truck class="h-4 w-4 shrink-0" />;
    case "reports":
      return <BarChart3 class="h-4 w-4 shrink-0" />;
    case "settings":
      return <Settings class="h-4 w-4 shrink-0" />;
    case "system":
      return <ShieldCheck class="h-4 w-4 shrink-0" />;
    case "ai":
      return <Sparkles class="h-4 w-4 shrink-0" />;
    case "wholesale":
      return <Boxes class="h-4 w-4 shrink-0" />;
  }
}

export function AdminLayout(
  props: ParentProps<{
    title: string;
    subtitle?: string;
    permission?: string;
    headerActions?: JSX.Element;
  }>,
) {
  const routerState = useRouterState();
  const [mobileOpen, setMobileOpen] = createSignal(false);
  const [accountMenuOpen, setAccountMenuOpen] = createSignal(false);
  const [logoFailed, setLogoFailed] = createSignal(false);
  let accountRef: HTMLDivElement | undefined;
  let mobileDrawerRef: HTMLElement | undefined;

  onMount(() => {
    void loadStorefrontBootstrap();
  });

  // Auto-close mobile navigation whenever route path transitions
  createEffect(() => {
    const _currentPath = routerState().location.pathname;
    if (_currentPath) {
      setMobileOpen(false);
      setAccountMenuOpen(false);
    }
  });

  createEffect(() => {
    if (!accountMenuOpen()) return;
    const onOutside = (e: MouseEvent) => {
      if (accountRef && !accountRef.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAccountMenuOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEsc);
    onCleanup(() => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEsc);
    });
  });

  createEffect(() => {
    if (!mobileOpen()) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onEsc);
    requestAnimationFrame(() => mobileDrawerRef?.focus());
    onCleanup(() => document.removeEventListener("keydown", onEsc));
  });

  const permissions = () => session.user()?.permissions ?? [];
  const allowed = () =>
    hasPermission(permissions(), props.permission || "dashboard.view");
  const visibleItems = () =>
    NAV_ITEMS.filter((i) => hasPermission(permissions(), i.permission));
  const currentPath = () => routerState().location.pathname;
  const settings = () => storefrontStore.settings();

  const [opCounts] = createResource(async () => {
    try {
      const res = await api<{
        data: {
          kpis: {
            to_pack_count: number;
            low_stock_count?: number;
          };
        };
      }>("/admin/dashboard");
      return res.data.kpis;
    } catch {
      return null;
    }
  });

  const getBadge = (to: string) => {
    const counts = opCounts();
    if (!counts) return null;
    if (to === "/admin/pedidos" && counts.to_pack_count > 0) {
      return {
        count: counts.to_pack_count,
        label: `${counts.to_pack_count} pedido(s) aguardando separação ou envio`,
        tone: "brand" as const,
      };
    }
    if (to === "/admin/produtos" && (counts.low_stock_count ?? 0) > 0) {
      return {
        count: counts.low_stock_count!,
        label: `${counts.low_stock_count} SKU(s) abaixo do estoque mínimo`,
        tone: "warning" as const,
      };
    }
    return null;
  };

  const renderBrandMark = () => (
    <Show
      when={!logoFailed()}
      fallback={
        <div class="flex items-center gap-2 rounded-[8px] bg-[#62298d] px-2.5 py-1.5 text-white">
          <img
            src={assetUrl(settings().logo_dark_url || "/logo-mf-dark.png")}
            alt={settings().store_name || "Mistura Feminina"}
            class="h-6 w-auto max-w-[110px] object-contain"
          />
        </div>
      }
    >
      <img
        src={assetUrl(settings().logo_light_url || "/logo-mf.png")}
        alt={settings().store_name || "Mistura Feminina"}
        onError={(e) => {
          if (!e.currentTarget.src.endsWith("/logo-mf.png")) {
            e.currentTarget.src = "/logo-mf.png";
          } else {
            setLogoFailed(true);
          }
        }}
        class="h-8 w-auto max-w-[144px] object-contain"
      />
    </Show>
  );

  const renderNavLinks = (onSelect?: () => void) => (
    <For each={visibleItems()}>
      {(item) => {
        const active = () =>
          item.to === "/admin"
            ? currentPath() === "/admin" || currentPath() === "/admin/"
            : currentPath().startsWith(item.to);
        const badge = () => getBadge(item.to);

        return (
          <Link
            to={item.to}
            onClick={() => onSelect?.()}
            aria-current={active() ? "page" : undefined}
            class={`adm-nav-item flex items-center justify-between gap-2 rounded-[8px] px-3 py-2 text-[13px] ${
              active()
                ? "bg-[#f5ebf7] font-semibold text-[#62298d]"
                : "font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            <span class="flex min-w-0 items-center gap-2.5">
              <span class={active() ? "text-[#93509e]" : "text-zinc-500"}>
                {renderNavIcon(item.icon)}
              </span>
              <span class="truncate">{item.label}</span>
            </span>
            <Show when={badge()}>
              {(b) => (
                <span
                  title={b().label}
                  aria-label={b().label}
                  class={`adm-tabular shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                    active()
                      ? "bg-white text-[#62298d]"
                      : b().tone === "warning"
                        ? "bg-amber-100 text-amber-900"
                        : "bg-zinc-100 text-zinc-700"
                  }`}
                >
                  {b().count}
                </span>
              )}
            </Show>
          </Link>
        );
      }}
    </For>
  );

  return (
    <Show when={allowed()} fallback={<StatusPage status={403} />}>
      <div class="mf-admin-shell flex min-h-screen bg-[#f6f7f9] text-zinc-900">
        {/* Desktop Light Sidebar */}
        <aside class="hidden w-60 shrink-0 flex-col border-r border-zinc-200 bg-white lg:flex">
          <div class="flex h-16 items-center justify-between gap-2 border-b border-zinc-200 px-4">
            <Link to="/admin" class="flex min-w-0 items-center gap-2">
              {renderBrandMark()}
            </Link>
            <span class="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Admin
            </span>
          </div>

          <nav
            aria-label="Menu administrativo"
            class="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3"
          >
            {renderNavLinks()}
          </nav>

          {/* Operator Account Popover & Logout */}
          <div
            ref={accountRef}
            class="relative border-t border-zinc-200 p-2.5"
          >
            <Show when={accountMenuOpen()}>
              <div
                role="dialog"
                aria-label="Menu da conta"
                style={{ "box-shadow": "var(--adm-shadow-popover)" }}
                class="absolute bottom-full left-2.5 right-2.5 z-40 mb-1.5 space-y-3 rounded-[12px] border border-zinc-200 bg-white p-3.5 text-xs"
              >
                <div class="space-y-0.5 border-b border-zinc-100 pb-2.5">
                  <p class="truncate font-semibold text-zinc-900">
                    {session.user()?.name}
                  </p>
                  <p class="truncate text-zinc-500">{session.user()?.email}</p>
                </div>
                <div class="[&_button]:h-9 [&_button]:w-full [&_button]:justify-center [&_button]:rounded-[8px] [&_button]:border [&_button]:border-zinc-300 [&_button]:bg-white [&_button]:text-xs [&_button]:font-semibold [&_button]:text-red-700 [&_button]:hover:bg-red-50">
                  <LogoutButton />
                </div>
              </div>
            </Show>

            <button
              type="button"
              aria-expanded={accountMenuOpen()}
              onClick={() => setAccountMenuOpen((v) => !v)}
              class="adm-btn flex w-full items-center justify-between gap-2 rounded-[8px] px-2.5 py-2 text-left text-xs hover:bg-zinc-100"
            >
              <span class="flex min-w-0 items-center gap-2">
                <UserCircle class="h-4 w-4 shrink-0 text-[#93509e]" />
                <span class="min-w-0">
                  <span class="block truncate font-semibold text-zinc-900">
                    {session.user()?.name}
                  </span>
                  <span class="block truncate text-[11px] text-zinc-500">
                    Conta & sair
                  </span>
                </span>
              </span>
              <ChevronUp
                class={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform ${
                  accountMenuOpen() ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>
        </aside>

        {/* Mobile Collapsible Light Drawer */}
        <Show when={mobileOpen()}>
          <div
            class="adm-overlay-backdrop fixed inset-0 z-50 flex lg:hidden"
            onClick={(e) => {
              if (e.target === e.currentTarget) setMobileOpen(false);
            }}
          >
            <div
              class="fixed inset-0 bg-zinc-950/45"
              onClick={() => setMobileOpen(false)}
            />
            <aside
              ref={mobileDrawerRef}
              role="dialog"
              aria-modal="true"
              aria-label="Menu de navegação"
              tabIndex={-1}
              class="adm-drawer-left relative z-10 flex w-72 max-w-[85vw] flex-col border-r border-zinc-200 bg-white text-zinc-900"
            >
              <div class="flex h-16 items-center justify-between gap-2 border-b border-zinc-200 px-4">
                <div class="min-w-0">
                  {renderBrandMark()}
                  <p class="truncate text-[11px] font-medium text-zinc-500">
                    Tela atual: {props.title}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Fechar menu"
                  class="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                >
                  <X class="h-5 w-5" />
                </button>
              </div>

              <nav
                aria-label="Menu administrativo móvel"
                class="flex-1 space-y-0.5 overflow-y-auto px-3 py-3"
              >
                {renderNavLinks(() => setMobileOpen(false))}
              </nav>

              <div class="space-y-3 border-t border-zinc-200 bg-zinc-50/70 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                <div class="text-xs">
                  <p class="truncate font-semibold text-zinc-900">
                    {session.user()?.name}
                  </p>
                  <p class="truncate text-zinc-500">{session.user()?.email}</p>
                </div>
                <div class="[&_button]:h-9 [&_button]:w-full [&_button]:justify-center [&_button]:rounded-[8px] [&_button]:border [&_button]:border-zinc-300 [&_button]:bg-white [&_button]:text-xs [&_button]:font-semibold [&_button]:text-red-700">
                  <LogoutButton />
                </div>
              </div>
            </aside>
          </div>
        </Show>

        {/* Main Workspace */}
        <div class="flex min-w-0 flex-1 flex-col">
          <header class="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-2.5 sm:px-6">
            <div class="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label="Abrir menu administrativo"
                class="adm-btn inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 lg:hidden"
              >
                <Menu class="h-5 w-5" />
              </button>
              <div class="min-w-0">
                <h1 class="truncate text-base font-bold tracking-tight text-zinc-900 sm:text-lg">
                  {props.title}
                </h1>
                <Show
                  when={
                    props.subtitle &&
                    props.subtitle.trim().toLowerCase() !==
                      props.title.trim().toLowerCase()
                  }
                >
                  <p class="hidden truncate text-xs text-zinc-500 sm:block">
                    {props.subtitle}
                  </p>
                </Show>
              </div>
            </div>

            <div class="flex min-w-0 max-w-full flex-wrap items-center gap-2.5">
              <Show when={props.headerActions}>
                {props.headerActions}
                <div class="hidden h-5 w-px bg-zinc-200 sm:block" aria-hidden="true" />
              </Show>
              <Link
                to="/"
                class="group inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-zinc-200/90 bg-white px-3.5 text-xs font-semibold text-zinc-700 shadow-2xs transition-all hover:border-[#93509e]/40 hover:bg-[#FAF5FB] hover:text-[#93509e]"
              >
                <ExternalLink class="h-3.5 w-3.5 text-zinc-400 transition-colors group-hover:text-[#93509e]" />
                <span class="whitespace-nowrap">Ver Loja</span>
              </Link>
            </div>
          </header>

          <main class="flex-1 p-4 sm:p-6">{props.children}</main>
        </div>
      </div>
    </Show>
  );
}
