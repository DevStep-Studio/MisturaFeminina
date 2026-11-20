import { Link, useRouterState } from "@tanstack/solid-router";
import BarChart3 from "lucide-solid/icons/chart-column";
import Boxes from "lucide-solid/icons/boxes";
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
import X from "lucide-solid/icons/x";
import {
  For,
  type ParentProps,
  Show,
  createResource,
  createSignal,
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
      return <LayoutDashboard class="h-4 w-4" />;
    case "orders":
      return <ShoppingCart class="h-4 w-4" />;
    case "products":
      return <Package class="h-4 w-4" />;
    case "cats":
      return <FolderTree class="h-4 w-4" />;
    case "appearance":
      return <Palette class="h-4 w-4" />;
    case "marketing":
      return <Megaphone class="h-4 w-4" />;
    case "shipping":
      return <Truck class="h-4 w-4" />;
    case "reports":
      return <BarChart3 class="h-4 w-4" />;
    case "settings":
      return <Settings class="h-4 w-4" />;
    case "system":
      return <ShieldCheck class="h-4 w-4" />;
    case "ai":
      return <Sparkles class="h-4 w-4" />;
    case "wholesale":
      return <Boxes class="h-4 w-4" />;
  }
}

export function AdminLayout(
  props: ParentProps<{ title: string; subtitle?: string; permission?: string }>,
) {
  const routerState = useRouterState();
  const [mobileOpen, setMobileOpen] = createSignal(false);

  onMount(() => {
    void loadStorefrontBootstrap();
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
      return { count: counts.to_pack_count, variant: "amber" as const };
    }
    if (to === "/admin/produtos" && (counts.low_stock_count ?? 0) > 0) {
      return { count: counts.low_stock_count!, variant: "red" as const };
    }
    return null;
  };

  return (
    <Show when={allowed()} fallback={<StatusPage status={403} />}>
      <div class="flex min-h-screen bg-zinc-100 text-zinc-900">
        {/* Desktop Sidebar */}
        <aside class="hidden w-64 shrink-0 flex-col border-r border-zinc-200 bg-zinc-900 text-zinc-100 lg:flex">
          <div class="flex h-16 items-center gap-3 border-b border-zinc-800 px-4">
            <img
              src={assetUrl(
                settings().logo_dark_url || settings().logo_light_url,
              )}
              alt={settings().store_name}
              onError={(e) => {
                e.currentTarget.src = "/logo-mf-dark.png";
              }}
              class="h-9 w-auto max-w-[140px] object-contain"
            />
            <span class="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-300">
              Admin
            </span>
          </div>

          <nav
            aria-label="Menu administrativo"
            class="flex-1 space-y-1 overflow-y-auto p-3"
          >
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
                    class={`flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition ${
                      active()
                        ? "bg-[#93509e] text-white shadow-xs"
                        : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
                    }`}
                  >
                    <div class="flex items-center gap-2.5 min-w-0">
                      {renderNavIcon(item.icon)}
                      <span class="truncate">{item.label}</span>
                    </div>
                    <Show when={badge()}>
                      {(b) => (
                        <span
                          class={`rounded-full px-1.5 py-0.2 text-[10px] font-extrabold ${
                            active()
                              ? "bg-white/20 text-white"
                              : b().variant === "amber"
                                ? "bg-amber-500/20 text-amber-300"
                                : "bg-red-500/20 text-red-300"
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
          </nav>

          <div class="border-t border-zinc-800 p-3 text-xs text-zinc-400">
            <p class="truncate font-semibold text-white">
              {session.user()?.name}
            </p>
            <p class="truncate">{session.user()?.email}</p>
          </div>
        </aside>

        {/* Mobile drawer */}
        <Show when={mobileOpen()}>
          <div class="fixed inset-0 z-50 flex lg:hidden">
            <div
              class="fixed inset-0 bg-zinc-950/60"
              onClick={() => setMobileOpen(false)}
            />
            <aside class="relative z-10 flex w-72 flex-col bg-zinc-900 p-4 text-zinc-100">
              <div class="mb-4 flex items-center justify-between border-b border-zinc-800 pb-3">
                <span class="text-sm font-bold">
                  Backoffice Mistura Feminina
                </span>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Fechar menu"
                >
                  <X class="h-5 w-5" />
                </button>
              </div>
              <nav class="space-y-1 overflow-y-auto">
                <For each={visibleItems()}>
                  {(item) => {
                    const badge = () => getBadge(item.to);
                    return (
                      <Link
                        to={item.to}
                        onClick={() => setMobileOpen(false)}
                        class="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
                      >
                        <div class="flex items-center gap-2.5">
                          {renderNavIcon(item.icon)}
                          <span>{item.label}</span>
                        </div>
                        <Show when={badge()}>
                          {(b) => (
                            <span class="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                              {b().count}
                            </span>
                          )}
                        </Show>
                      </Link>
                    );
                  }}
                </For>
              </nav>
            </aside>
          </div>
        </Show>

        {/* Main Workspace */}
        <div class="flex min-w-0 flex-1 flex-col">
          <header class="flex h-16 items-center justify-between gap-4 border-b border-zinc-200 bg-white px-4 sm:px-6">
            <div class="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label="Abrir menu administrativo"
                class="rounded-md border border-zinc-300 p-2 text-zinc-700 lg:hidden"
              >
                <Menu class="h-5 w-5" />
              </button>
              <div class="min-w-0">
                <h1 class="truncate text-lg font-bold text-zinc-900 sm:text-xl">
                  {props.title}
                </h1>
                <Show when={props.subtitle}>
                  <p class="truncate text-xs text-zinc-500">{props.subtitle}</p>
                </Show>
              </div>
            </div>

            <div class="flex items-center gap-2 shrink-0">
              <Link
                to="/"
                class="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
              >
                <ExternalLink class="h-3.5 w-3.5" />
                Ver Loja
              </Link>
              <LogoutButton />
            </div>
          </header>

          <div class="flex-1 p-4 sm:p-6">{props.children}</div>
        </div>
      </div>
    </Show>
  );
}
