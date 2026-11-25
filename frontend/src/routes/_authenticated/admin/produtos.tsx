import { createFileRoute } from "@tanstack/solid-router";
import Archive from "lucide-solid/icons/archive";
import ChevronDown from "lucide-solid/icons/chevron-down";
import Download from "lucide-solid/icons/download";
import FileSpreadsheet from "lucide-solid/icons/file-spreadsheet";
import Grid from "lucide-solid/icons/grid-2x2";
import Plus from "lucide-solid/icons/plus";
import SlidersHorizontal from "lucide-solid/icons/sliders-horizontal";
import Sparkles from "lucide-solid/icons/sparkles";
import Star from "lucide-solid/icons/star";
import Trash2 from "lucide-solid/icons/trash";
import X from "lucide-solid/icons/x";
import {
  For,
  Show,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
} from "solid-js";
import { AdminBulkVariantsGrid } from "../../../features/admin/AdminBulkVariantsGrid";
import { AdminGoodsReceiptsPanel } from "../../../features/admin/AdminGoodsReceiptsPanel";
import { AdminLayout } from "../../../features/admin/AdminLayout";
import { AdminRestockAnalyticsPanel } from "../../../features/admin/AdminRestockAnalyticsPanel";
import { AdminAiCatalogAgentPanel } from "../../../features/admin/ai/AdminAiCatalogAgentPanel";
import { AdminButton, AdminCombobox, AdminSelect } from "../../../features/admin/ui";
import { BulkLifecycleModal } from "../../../features/admin/products/BulkLifecycleModal";
import { BulkRuleModal } from "../../../features/admin/products/BulkRuleModal";
import { CatalogSpreadsheetImportPanel } from "../../../features/admin/products/CatalogSpreadsheetImportPanel";
import { ProductCatalogTable } from "../../../features/admin/products/ProductCatalogTable";
import { buildCategoryHierarchyOptions } from "../../../features/admin/categories/category-helpers";
import {
  type AttributeOption,
  ProductFormScreen,
} from "../../../features/admin/products/ProductFormScreen";
import {
  type AdminProductRow,
  type AdminProductsPagePayload,
  type BrandOption,
  type BulkSelectionPayload,
  type CatalogFilters,
  type CategoryOption,
  countActiveCatalogFilters,
} from "../../../features/admin/products/types";
import { api } from "../../../lib/api";
import { seoHead } from "../../../lib/seo";
import { hasPermission } from "../../../security/permissions";
import { session } from "../../../security/session";

const SCROLL_STORAGE_KEY = "mf:admin-products:scrollY";

export const Route = createFileRoute("/_authenticated/admin/produtos")({
  validateSearch: (raw: Record<string, unknown>): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string" && v !== "") out[k] = v;
      else if (typeof v === "number") out[k] = String(v);
    }
    return out;
  },
  head: () =>
    seoHead({
      title: "Produtos — Admin Mistura Feminina",
      description:
        "Gerenciamento de catálogo, edição em massa, recebimentos e cadastro assistido com IA.",
      path: "/admin/produtos",
      noindex: true,
    }),
  component: AdminProductsPage,
});

type ModuleView =
  | "catalogo"
  | "novo"
  | "editar"
  | "massa"
  | "ia"
  | "recebimentos"
  | "avaliacoes"
  | "avisos"
  | "csv";

interface ReviewRow {
  id: number;
  author_name: string;
  rating: number;
  title: string | null;
  body: string;
  status: string;
  product?: { name: string } | null;
}

function AdminProductsPage() {
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();

  const permissions = () => session.user()?.permissions ?? [];
  const canWrite = () => hasPermission(permissions(), "catalog.write");
  const canPrice = () =>
    hasPermission(permissions(), "catalog.pricing") || canWrite();
  const canCostView = () => hasPermission(permissions(), "catalog.cost.view");
  const canCostWrite = () => hasPermission(permissions(), "catalog.cost.write");
  const canStock = () =>
    hasPermission(permissions(), "inventory.manage") || canWrite();
  const canBulkEdit = () =>
    hasPermission(permissions(), "catalog.bulk_edit") || canWrite();
  const canAiCatalog = () =>
    hasPermission(permissions(), "ai.catalog") || canWrite();

  const currentView = createMemo<ModuleView>(() => {
    const s = routeSearch();
    const raw = s.view || s.tab || "catalogo";
    if (raw === "produtos") return "catalogo";
    const allowed: ModuleView[] = [
      "catalogo",
      "novo",
      "editar",
      "massa",
      "ia",
      "recebimentos",
      "avaliacoes",
      "avisos",
      "csv",
    ];
    return allowed.includes(raw as ModuleView)
      ? (raw as ModuleView)
      : "catalogo";
  });

  const filters = createMemo<CatalogFilters>(() => {
    const s = routeSearch();
    return {
      search: s.search || "",
      brand_id: s.brand_id || "",
      category_id: s.category_id || "",
      status: s.status || "all",
      availability: s.availability || "all",
      sort: s.sort || "newest",
      filter: s.filter || "",
      page: Math.max(1, Number.parseInt(s.page || "1", 10) || 1),
    };
  });

  const [searchInput, setSearchInput] = createSignal(filters().search);
  const [mobileFiltersOpen, setMobileFiltersOpen] = createSignal(false);
  const [secondaryMenuOpen, setSecondaryMenuOpen] = createSignal(false);
  const [pageSelectedIds, setPageSelectedIds] = createSignal<number[]>([]);
  const [selectAllMatching, setSelectAllMatching] = createSignal(false);
  const [excludedIds, setExcludedIds] = createSignal<number[]>([]);
  const [selectionNotice, setSelectionNotice] = createSignal<string | null>(
    null,
  );
  const [feedback, setFeedback] = createSignal<string | null>(null);
  const [savedHighlightId, setSavedHighlightId] = createSignal<number | null>(
    null,
  );
  const [pendingScrollRestore, setPendingScrollRestore] = createSignal(false);

  const [ruleModalOpen, setRuleModalOpen] = createSignal(false);
  const [lifecycleModal, setLifecycleModal] = createSignal<{
    open: boolean;
    action: "archive" | "restore" | "delete";
    productIds?: number[];
  }>({ open: false, action: "archive" });

  createEffect(() => {
    setSearchInput(filters().search);
  });

  let searchDebounceTimer: number | undefined;
  onCleanup(() => {
    if (searchDebounceTimer) window.clearTimeout(searchDebounceTimer);
  });

  function updateQuery(
    patch: Record<string, string | undefined>,
    resetSelectionIfFilterChanged = false,
  ) {
    const prevSelectedCount =
      selectAllMatching() ? 1 : pageSelectedIds().length;
    if (resetSelectionIfFilterChanged && prevSelectedCount > 0) {
      setPageSelectedIds([]);
      setSelectAllMatching(false);
      setExcludedIds([]);
      setSelectionNotice(
        "Os filtros ou a busca foram alterados — a seleção anterior foi limpa.",
      );
    }

    const next: Record<string, string> = { ...routeSearch() };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "" || v === "all" && (k === "status" || k === "availability")) {
        delete next[k];
      } else {
        next[k] = v;
      }
    }
    delete next.tab;

    void navigate({ search: next, replace: true });
  }

  function handleSearchInput(val: string) {
    setSearchInput(val);
    if (searchDebounceTimer) window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = window.setTimeout(() => {
      updateQuery({ search: val.trim() || undefined, page: "1" }, true);
    }, 260);
  }

  const [productsPage, { refetch: refetchProducts }] = createResource(
    filters,
    async (f) => {
      const qs = new URLSearchParams();
      if (f.search) qs.set("search", f.search);
      if (f.brand_id) qs.set("brand_id", f.brand_id);
      if (f.category_id) qs.set("category_id", f.category_id);
      if (f.status && f.status !== "all") qs.set("status", f.status);
      if (f.availability && f.availability !== "all")
        qs.set("availability", f.availability);
      if (f.sort && f.sort !== "newest") qs.set("sort", f.sort);
      if (f.filter) qs.set("filter", f.filter);
      qs.set("page", String(f.page));
      qs.set("per_page", "25");

      return await api<AdminProductsPagePayload>(
        `/admin/products?${qs.toString()}`,
      );
    },
  );

  // Restore scroll position after returning from product form
  createEffect(() => {
    if (
      currentView() === "catalogo" &&
      pendingScrollRestore() &&
      !productsPage.loading
    ) {
      const saved = sessionStorage.getItem(SCROLL_STORAGE_KEY);
      if (saved) {
        const y = Number.parseInt(saved, 10) || 0;
        sessionStorage.removeItem(SCROLL_STORAGE_KEY);
        requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "auto" }));
      }
      setPendingScrollRestore(false);
    }
  });

  const [brands] = createResource(async () => {
    const res = await api<{ data: BrandOption[] }>("/admin/brands");
    return res.data ?? [];
  });

  const [categories, { refetch: refetchCategories }] = createResource(
    async () => {
      const res = await api<{ data: CategoryOption[] }>("/admin/categories");
      return res.data ?? [];
    },
  );
  const categoryHierarchyOptions = createMemo(() =>
    buildCategoryHierarchyOptions(
      (categories() ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug ?? "",
        parent_id: c.parent_id ?? null,
        sort_order: c.sort_order,
        full_path: c.full_path,
      })),
    ),
  );

  const [attributes] = createResource(async () => {
    const res = await api<{ data: AttributeOption[] }>("/admin/attributes");
    return res.data ?? [];
  });

  const editTargetId = createMemo(() => {
    const s = routeSearch();
    const id = Number(s.editId || 0);
    return currentView() === "editar" && id > 0 ? id : null;
  });

  const dupTargetId = createMemo(() => {
    const s = routeSearch();
    const id = Number(s.dupId || 0);
    return currentView() === "novo" && id > 0 ? id : null;
  });

  const [editingProduct] = createResource(editTargetId, async (id) => {
    const res = await api<{ data: AdminProductRow }>(`/admin/products/${id}`);
    return res.data;
  });

  const [duplicatingProduct] = createResource(dupTargetId, async (id) => {
    const res = await api<{ data: AdminProductRow }>(`/admin/products/${id}`);
    return res.data;
  });

  const [reviews, { refetch: refetchReviews }] = createResource(
    () => currentView() === "avaliacoes",
    async (load) => {
      if (!load) return [];
      const res = await api<{ data: ReviewRow[] }>("/admin/reviews");
      return res.data ?? [];
    },
  );

  const productList = () => productsPage()?.data ?? [];
  const totalResults = () => productsPage()?.total ?? 0;
  const activeFilterCount = () => countActiveCatalogFilters(filters());

  const selectedCount = createMemo(() => {
    if (selectAllMatching()) {
      return Math.max(0, totalResults() - excludedIds().length);
    }
    return pageSelectedIds().length;
  });

  function currentSelectionPayload(overrideIds?: number[]): BulkSelectionPayload {
    if (overrideIds && overrideIds.length > 0) {
      return { product_ids: overrideIds };
    }
    if (selectAllMatching()) {
      const f = filters();
      return {
        select_all_matching: true,
        excluded_ids: excludedIds(),
        filters: {
          ...(f.search ? { search: f.search } : {}),
          ...(f.brand_id ? { brand_id: f.brand_id } : {}),
          ...(f.category_id ? { category_id: f.category_id } : {}),
          ...(f.status !== "all" ? { status: f.status } : {}),
          ...(f.availability !== "all" ? { availability: f.availability } : {}),
          ...(f.filter ? { filter: f.filter } : {}),
        },
      };
    }
    return { product_ids: pageSelectedIds() };
  }

  function toggleOne(id: number) {
    setSelectionNotice(null);
    if (selectAllMatching()) {
      setExcludedIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      );
      return;
    }
    setPageSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function togglePage() {
    setSelectionNotice(null);
    const ids = productList().map((p) => p.id);
    if (ids.length === 0) return;

    if (selectAllMatching()) {
      setSelectAllMatching(false);
      setExcludedIds([]);
      setPageSelectedIds([]);
      return;
    }

    const allChecked = ids.every((id) => pageSelectedIds().includes(id));
    if (allChecked) {
      setPageSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      setPageSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
    }
  }

  function clearSelection() {
    setPageSelectedIds([]);
    setSelectAllMatching(false);
    setExcludedIds([]);
  }

  function flushPendingSearchPatch(): Record<string, string | undefined> {
    if (!searchDebounceTimer) return {};
    window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = undefined;
    return {
      search: searchInput().trim() || undefined,
      page: "1",
    };
  }

  function openEditProduct(id: number) {
    if (currentView() === "catalogo") {
      sessionStorage.setItem(SCROLL_STORAGE_KEY, String(window.scrollY));
    }
    updateQuery({
      ...flushPendingSearchPatch(),
      view: "editar",
      editId: String(id),
      dupId: undefined,
    });
  }

  function openNewProduct(duplicateFromId?: number) {
    if (currentView() === "catalogo") {
      sessionStorage.setItem(SCROLL_STORAGE_KEY, String(window.scrollY));
    }
    updateQuery({
      ...flushPendingSearchPatch(),
      view: "novo",
      editId: undefined,
      dupId: duplicateFromId ? String(duplicateFromId) : undefined,
    });
  }

  function returnToCatalog() {
    setPendingScrollRestore(true);
    updateQuery({ view: "catalogo", editId: undefined, dupId: undefined });
  }

  async function moderateReview(id: number, status: "approved" | "rejected") {
    await api(`/admin/reviews/${id}`, { method: "PATCH", body: { status } });
    await refetchReviews();
  }

  function triggerReloadCatalog() {
    void refetchProducts();
  }

  function highlightSavedRow(id?: number | null) {
    if (!id) return;
    setSavedHighlightId(id);
    window.setTimeout(() => {
      if (savedHighlightId() === id) setSavedHighlightId(null);
    }, 2200);
  }

  function handleFormSaved(
    msg: string,
    stayAndNext?: boolean,
    savedId?: number,
  ) {
    setFeedback(msg);
    void refetchProducts();
    if (!stayAndNext) {
      returnToCatalog();
      highlightSavedRow(savedId);
    }
  }

  function handleBulkRuleCommitted(msg: string) {
    setFeedback(msg);
    setRuleModalOpen(false);
    clearSelection();
    void refetchProducts();
  }

  function handleLifecycleCommitted(msg: string) {
    setFeedback(msg);
    clearSelection();
    void refetchProducts();
    if (currentView() === "editar") {
      returnToCatalog();
    }
  }

  const brandNameById = (id: string) =>
    brands()?.find((b) => String(b.id) === id)?.name ?? id;
  const catNameById = (id: string) =>
    categoryHierarchyOptions().find((c) => c.value === id)?.label ??
    categories()?.find((c) => String(c.id) === id)?.name ??
    id;

  const headerActions = (
    <div class="flex min-w-0 max-w-full flex-wrap items-center gap-2">
      <Show when={canAiCatalog()}>
        <AdminButton
          variant="secondary"
          onClick={() =>
            updateQuery({
              view: "ia",
              editId: undefined,
              dupId: undefined,
            })
          }
          class="border-[#e4c6ea] text-[#62298d] hover:bg-[#f5ebf7]"
        >
          <Sparkles class="h-3.5 w-3.5 text-[#93509e]" />
          Cadastrar com IA
        </AdminButton>
      </Show>

      <Show when={canWrite()}>
        <AdminButton variant="primary" onClick={() => openNewProduct()}>
          <Plus class="h-3.5 w-3.5" />
          Novo produto
        </AdminButton>
      </Show>

      <div class="relative">
        <AdminButton
          variant="secondary"
          aria-expanded={secondaryMenuOpen()}
          onClick={() => setSecondaryMenuOpen(!secondaryMenuOpen())}
        >
          Mais ferramentas
          <ChevronDown class="h-3.5 w-3.5" />
        </AdminButton>
        <Show when={secondaryMenuOpen()}>
          <div
            role="menu"
            style={{ "box-shadow": "var(--adm-shadow-popover)" }}
            class="absolute left-0 top-10 z-40 w-56 rounded-[10px] border border-zinc-200 bg-white py-1 text-xs sm:left-auto sm:right-0"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setSecondaryMenuOpen(false);
                updateQuery({ view: "massa" });
              }}
              class="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-800 hover:bg-zinc-50"
            >
              <Grid class="h-3.5 w-3.5 text-zinc-500" />
              Edição individual em grade
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setSecondaryMenuOpen(false);
                updateQuery({ view: "csv" });
              }}
              class="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-800 hover:bg-zinc-50"
            >
              <FileSpreadsheet class="h-3.5 w-3.5 text-zinc-500" />
              Importar / Exportar CSV
            </button>
            <a
              href={`${import.meta.env.VITE_API_URL}/admin/catalog/export-csv`}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={() => setSecondaryMenuOpen(false)}
              class="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-800 hover:bg-zinc-50"
            >
              <Download class="h-3.5 w-3.5 text-zinc-500" />
              Exportar CSV completo
            </a>
          </div>
        </Show>
      </div>
    </div>
  );

  return (
    <AdminLayout
      title="Produtos"
      permission="catalog.view"
      headerActions={headerActions}
    >
      {/* Single clean module navigation strip */}
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-2.5">
        <nav
          aria-label="Destinos de Produtos e Estoque"
          class="flex flex-wrap items-center gap-1 text-xs"
        >
          <For
            each={
              [
                ["catalogo", "Catálogo"],
                ["recebimentos", "Recebimentos"],
                ["avaliacoes", "Avaliações"],
                ["avisos", "Reposição"],
              ] as const
            }
          >
            {([v, label]) => (
              <button
                type="button"
                aria-current={currentView() === v ? "page" : undefined}
                onClick={() =>
                  updateQuery({
                    view: v,
                    editId: undefined,
                    dupId: undefined,
                  })
                }
                class={`adm-btn rounded-[8px] px-3 py-1.5 font-semibold ${
                  currentView() === v
                    ? "bg-[#f5ebf7] text-[#62298d]"
                    : "text-zinc-600 hover:bg-white hover:text-zinc-900"
                }`}
              >
                {label}
              </button>
            )}
          </For>
        </nav>

        <Show when={currentView() === "catalogo"}>
          <span class="adm-tabular text-xs font-medium text-zinc-500">
            {totalResults()} resultados
          </span>
        </Show>
      </div>

      <Show when={feedback()}>
        <div
          role="status"
          class="mb-4 flex items-center justify-between gap-2 rounded-lg border border-purple-200 bg-purple-50 px-4 py-2.5 text-xs font-medium text-zinc-900"
        >
          <span>{feedback()}</span>
          <button
            type="button"
            aria-label="Dispensar mensagem"
            onClick={() => setFeedback(null)}
            class="text-zinc-500 hover:text-zinc-900"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </div>
      </Show>

      <Show when={selectionNotice()}>
        <div class="mb-3 flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          <span>{selectionNotice()}</span>
          <button
            type="button"
            onClick={() => setSelectionNotice(null)}
            class="font-semibold underline"
          >
            Ok
          </button>
        </div>
      </Show>

      {/* VIEW: CATALOG */}
      <Show when={currentView() === "catalogo"}>
        <div class="space-y-3 pb-20">
          {/* Filter Strip */}
          <div class="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white p-3 text-xs">
            <input
              type="search"
              placeholder="Buscar por nome, SKU ou código de barras..."
              value={searchInput()}
              onInput={(e) => handleSearchInput(e.currentTarget.value)}
              class="h-9 min-w-[200px] flex-1 rounded-md border border-zinc-300 px-3 focus:border-[#93509e] focus:outline-none"
            />

            {/* Mobile filter drawer trigger */}
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(true)}
              class="inline-flex h-9 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 font-semibold text-zinc-800 md:hidden"
            >
              <SlidersHorizontal class="h-3.5 w-3.5" />
              Filtros
              <Show when={activeFilterCount() > 0}>
                <span class="rounded-full bg-[#93509e] px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {activeFilterCount()}
                </span>
              </Show>
            </button>

            {/* Desktop inline filters */}
            <div class="hidden flex-wrap items-end gap-2 md:flex">
              <AdminCombobox
                label="Marca"
                placeholder="Todas as marcas"
                searchPlaceholder="Buscar marca..."
                value={filters().brand_id}
                options={(brands() ?? []).map((b) => ({
                  value: String(b.id),
                  label: b.name,
                }))}
                onChange={(val) =>
                  updateQuery({ brand_id: val || undefined, page: "1" }, true)
                }
                class="w-44"
              />

              <AdminCombobox
                label="Categoria"
                placeholder="Todas categorias"
                searchPlaceholder="Buscar categoria..."
                value={filters().category_id}
                options={categoryHierarchyOptions()}
                onChange={(val) =>
                  updateQuery(
                    { category_id: val || undefined, page: "1" },
                    true,
                  )
                }
                class="w-44"
              />

              <AdminSelect
                label="Situação"
                value={filters().status}
                onChange={(val) =>
                  updateQuery({ status: val, page: "1" }, true)
                }
                options={[
                  { value: "all", label: "Todas situações" },
                  { value: "active", label: "Ativos" },
                  { value: "inactive", label: "Inativos" },
                  { value: "archived", label: "Arquivados" },
                ]}
              />

              <AdminSelect
                label="Disponibilidade"
                value={filters().availability}
                onChange={(val) =>
                  updateQuery({ availability: val, page: "1" }, true)
                }
                options={[
                  { value: "all", label: "Qualquer estoque" },
                  { value: "in_stock", label: "Disponível (> 0)" },
                  { value: "low_stock", label: "Estoque baixo (1–5)" },
                  { value: "out_of_stock", label: "Esgotado" },
                ]}
              />

              <AdminSelect
                label="Ordenar por"
                value={filters().sort}
                onChange={(val) =>
                  updateQuery({ sort: val, page: "1" }, false)
                }
                options={[
                  { value: "newest", label: "Mais recentes" },
                  { value: "name_asc", label: "Nome (A–Z)" },
                  { value: "name_desc", label: "Nome (Z–A)" },
                  { value: "price_asc", label: "Menor preço" },
                  { value: "price_desc", label: "Maior preço" },
                  { value: "stock_asc", label: "Menor estoque" },
                  { value: "stock_desc", label: "Maior estoque" },
                ]}
              />

              <Show when={canCostView()}>
                <button
                  type="button"
                  onClick={() =>
                    updateQuery(
                      {
                        filter:
                          filters().filter === "missing_cost"
                            ? undefined
                            : "missing_cost",
                        page: "1",
                      },
                      true,
                    )
                  }
                  class={`adm-btn h-9 rounded-[8px] border px-3 text-xs font-semibold ${
                    filters().filter === "missing_cost"
                      ? "border-[#93509e] bg-[#f5ebf7] text-[#62298d]"
                      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  Sem custo cadastrado
                </button>
              </Show>
            </div>
          </div>

          {/* Individual removable active filter chips */}
          <Show when={activeFilterCount() > 0 || filters().search}>
            <div class="flex flex-wrap items-center gap-1.5 text-xs">
              <Show when={filters().search}>
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput("");
                    updateQuery({ search: undefined, page: "1" }, true);
                  }}
                  class="inline-flex items-center gap-1 rounded border border-zinc-300 bg-white px-2 py-0.5 text-zinc-700 hover:bg-zinc-50"
                >
                  Busca: "{filters().search}"
                  <X class="h-3 w-3" />
                </button>
              </Show>
              <Show when={filters().brand_id}>
                <button
                  type="button"
                  onClick={() =>
                    updateQuery({ brand_id: undefined, page: "1" }, true)
                  }
                  class="inline-flex items-center gap-1 rounded border border-zinc-300 bg-white px-2 py-0.5 text-zinc-700 hover:bg-zinc-50"
                >
                  Marca: {brandNameById(filters().brand_id)}
                  <X class="h-3 w-3" />
                </button>
              </Show>
              <Show when={filters().category_id}>
                <button
                  type="button"
                  onClick={() =>
                    updateQuery({ category_id: undefined, page: "1" }, true)
                  }
                  class="inline-flex items-center gap-1 rounded border border-zinc-300 bg-white px-2 py-0.5 text-zinc-700 hover:bg-zinc-50"
                >
                  Categoria: {catNameById(filters().category_id)}
                  <X class="h-3 w-3" />
                </button>
              </Show>
              <Show when={filters().status !== "all"}>
                <button
                  type="button"
                  onClick={() => updateQuery({ status: "all", page: "1" }, true)}
                  class="inline-flex items-center gap-1 rounded border border-zinc-300 bg-white px-2 py-0.5 text-zinc-700 hover:bg-zinc-50"
                >
                  Situação: {filters().status}
                  <X class="h-3 w-3" />
                </button>
              </Show>
              <Show when={filters().availability !== "all"}>
                <button
                  type="button"
                  onClick={() =>
                    updateQuery({ availability: "all", page: "1" }, true)
                  }
                  class="inline-flex items-center gap-1 rounded border border-zinc-300 bg-white px-2 py-0.5 text-zinc-700 hover:bg-zinc-50"
                >
                  Estoque: {filters().availability}
                  <X class="h-3 w-3" />
                </button>
              </Show>
              <Show when={filters().filter}>
                <button
                  type="button"
                  onClick={() =>
                    updateQuery({ filter: undefined, page: "1" }, true)
                  }
                  class="inline-flex items-center gap-1 rounded border border-zinc-300 bg-white px-2 py-0.5 text-zinc-700 hover:bg-zinc-50"
                >
                  {filters().filter === "missing_cost"
                    ? "Sem custo cadastrado"
                    : `Painel: ${filters().filter}`}
                  <X class="h-3 w-3" />
                </button>
              </Show>
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  updateQuery(
                    {
                      search: undefined,
                      brand_id: undefined,
                      category_id: undefined,
                      status: undefined,
                      availability: undefined,
                      filter: undefined,
                      page: "1",
                    },
                    true,
                  );
                }}
                class="ml-1 font-semibold text-[#93509e] hover:underline"
              >
                Limpar filtros
              </button>
            </div>
          </Show>

          <div
            class={`min-h-[300px] transition-opacity ${
              productsPage.loading ? "opacity-65" : "opacity-100"
            }`}
          >
            <ProductCatalogTable
              products={productList()}
              totalResults={totalResults()}
              pageSelectedIds={pageSelectedIds()}
              selectAllMatching={selectAllMatching()}
              excludedIds={excludedIds()}
              highlightedId={savedHighlightId()}
              onHighlightRow={(id) => highlightSavedRow(id)}
              onToggleOne={toggleOne}
              onTogglePage={togglePage}
              onSelectAllMatching={() => {
                setSelectAllMatching(true);
                setExcludedIds([]);
              }}
              onClearSelection={clearSelection}
              onEditProduct={openEditProduct}
              onDuplicateProduct={(id) => openNewProduct(id)}
              onOpenBulkGridForProduct={(id) =>
                updateQuery({ view: "massa", product_id: String(id) })
              }
              onOpenReceipts={() => updateQuery({ view: "recebimentos" })}
              onLifecycleAction={(ids, action) =>
                setLifecycleModal({ open: true, action, productIds: ids })
              }
              onReload={() => triggerReloadCatalog()}
              canWrite={canWrite()}
              canPrice={canPrice()}
              canStock={canStock()}
            />
          </div>

          {/* Pagination */}
          <Show when={(productsPage()?.last_page ?? 1) > 1}>
            <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-xs">
              <span class="text-zinc-600">
                Página <strong>{productsPage()?.current_page}</strong> de{" "}
                <strong>{productsPage()?.last_page}</strong> ({totalResults()}{" "}
                itens)
              </span>
              <div class="flex gap-2">
                <button
                  type="button"
                  disabled={filters().page <= 1}
                  onClick={() =>
                    updateQuery({ page: String(filters().page - 1) }, false)
                  }
                  class="rounded border border-zinc-300 px-3 py-1 font-semibold disabled:opacity-40"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={filters().page >= (productsPage()?.last_page ?? 1)}
                  onClick={() =>
                    updateQuery({ page: String(filters().page + 1) }, false)
                  }
                  class="rounded border border-zinc-300 px-3 py-1 font-semibold disabled:opacity-40"
                >
                  Próxima
                </button>
              </div>
            </div>
          </Show>
        </div>

        {/* Sticky Contextual Bulk Bar */}
        <Show when={selectedCount() > 0}>
          <div
            style={{ "box-shadow": "var(--adm-shadow-overlay)" }}
            class="fixed inset-x-0 bottom-0 z-40 border-t border-[#e4c6ea] bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
          >
            <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 text-xs">
              <div class="flex items-center gap-2">
                <span class="adm-tabular rounded-[6px] bg-[#93509e] px-2.5 py-1 font-bold text-white">
                  {selectedCount()} selecionado(s)
                </span>
                <button
                  type="button"
                  onClick={clearSelection}
                  class="font-semibold text-zinc-600 underline hover:text-zinc-900"
                >
                  Limpar
                </button>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <Show when={canBulkEdit()}>
                  <AdminButton
                    size="sm"
                    variant="primary"
                    onClick={() => setRuleModalOpen(true)}
                  >
                    Editar em massa
                  </AdminButton>
                </Show>

                <Show when={!selectAllMatching() && pageSelectedIds().length > 0}>
                  <AdminButton
                    size="sm"
                    variant="secondary"
                    onClick={() => updateQuery({ view: "massa" })}
                  >
                    Editar na grade
                  </AdminButton>
                </Show>

                <Show when={canWrite()}>
                  <Show
                    when={filters().status === "archived"}
                    fallback={
                      <AdminButton
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setLifecycleModal({ open: true, action: "archive" })
                        }
                      >
                        <Archive class="h-3.5 w-3.5" />
                        Arquivar
                      </AdminButton>
                    }
                  >
                    <AdminButton
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setLifecycleModal({ open: true, action: "restore" })
                      }
                      class="border-[#93509e] text-[#62298d]"
                    >
                      Restaurar
                    </AdminButton>
                  </Show>
                  <AdminButton
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setLifecycleModal({ open: true, action: "delete" })
                    }
                    class="border border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                  >
                    <Trash2 class="h-3.5 w-3.5" />
                    Excluir
                  </AdminButton>
                </Show>
              </div>
            </div>
          </div>
        </Show>

        {/* Mobile Filters Slide-over Sheet */}
        <Show when={mobileFiltersOpen()}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Filtrar catálogo"
            class="fixed inset-0 z-50 flex items-end bg-black/45 md:hidden"
          >
            <div class="w-full space-y-3 rounded-t-xl border-t border-zinc-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <div class="flex items-center justify-between border-b border-zinc-100 pb-2">
                <h3 class="text-sm font-bold text-zinc-900">Filtrar catálogo</h3>
                <button
                  type="button"
                  aria-label="Fechar filtros"
                  onClick={() => setMobileFiltersOpen(false)}
                  class="rounded p-1 text-zinc-500"
                >
                  <X class="h-4 w-4" />
                </button>
              </div>

              <div class="grid gap-2.5 text-xs">
                <select
                  value={filters().brand_id}
                  onChange={(e) =>
                    updateQuery(
                      { brand_id: e.currentTarget.value || undefined, page: "1" },
                      true,
                    )
                  }
                  class="h-10 rounded-md border border-zinc-300 bg-white px-2.5"
                >
                  <option value="">Todas as marcas</option>
                  <For each={brands() ?? []}>
                    {(b) => <option value={b.id}>{b.name}</option>}
                  </For>
                </select>
                <select
                  value={filters().category_id}
                  onChange={(e) =>
                    updateQuery(
                      {
                        category_id: e.currentTarget.value || undefined,
                        page: "1",
                      },
                      true,
                    )
                  }
                  class="h-10 rounded-md border border-zinc-300 bg-white px-2.5"
                >
                  <option value="">Todas as categorias</option>
                  <For each={categories() ?? []}>
                    {(c) => <option value={c.id}>{c.name}</option>}
                  </For>
                </select>
                <select
                  value={filters().status}
                  onChange={(e) =>
                    updateQuery({ status: e.currentTarget.value, page: "1" }, true)
                  }
                  class="h-10 rounded-md border border-zinc-300 bg-white px-2.5"
                >
                  <option value="all">Todas as situações</option>
                  <option value="active">Ativos</option>
                  <option value="inactive">Inativos</option>
                  <option value="archived">Arquivados</option>
                </select>
                <select
                  value={filters().availability}
                  onChange={(e) =>
                    updateQuery(
                      { availability: e.currentTarget.value, page: "1" },
                      true,
                    )
                  }
                  class="h-10 rounded-md border border-zinc-300 bg-white px-2.5"
                >
                  <option value="all">Qualquer estoque</option>
                  <option value="in_stock">Disponível (&gt; 0)</option>
                  <option value="low_stock">Baixo estoque (1–5)</option>
                  <option value="out_of_stock">Esgotado</option>
                </select>
                <select
                  value={filters().sort}
                  onChange={(e) =>
                    updateQuery({ sort: e.currentTarget.value, page: "1" }, false)
                  }
                  class="h-10 rounded-md border border-zinc-300 bg-white px-2.5"
                >
                  <option value="newest">Mais recentes</option>
                  <option value="name_asc">Nome (A–Z)</option>
                  <option value="price_asc">Menor preço</option>
                  <option value="price_desc">Maior preço</option>
                  <option value="stock_asc">Menor estoque</option>
                </select>
                <Show when={canCostView()}>
                  <button
                    type="button"
                    onClick={() =>
                      updateQuery(
                        {
                          filter:
                            filters().filter === "missing_cost"
                              ? undefined
                              : "missing_cost",
                          page: "1",
                        },
                        true,
                      )
                    }
                    class={`h-10 rounded-md border px-3 text-left text-xs font-semibold ${filters().filter === "missing_cost"
                      ? "border-[#93509e] bg-purple-50 text-[#62298d]"
                      : "border-zinc-300 bg-white text-zinc-700"
                      }`}
                  >
                    Sem custo cadastrado
                  </button>
                </Show>
              </div>

              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                class="w-full rounded-md bg-[#93509e] py-2.5 text-xs font-bold text-white"
              >
                Ver {totalResults()} produtos
              </button>
            </div>
          </div>
        </Show>
      </Show>

      {/* VIEW: DEDICATED FORM (NEW / EDIT) */}
      <Show when={currentView() === "novo" || currentView() === "editar"}>
        <ProductFormScreen
          mode={currentView() === "editar" ? "edit" : "create"}
          product={currentView() === "editar" ? (editingProduct() ?? null) : null}
          duplicateFrom={
            currentView() === "novo" ? (duplicatingProduct() ?? null) : null
          }
          brands={brands() ?? []}
          categories={categories() ?? []}
          attributes={attributes() ?? []}
          canWrite={canWrite()}
          canCostView={canCostView()}
          canCostWrite={canCostWrite()}
          onCategoryCreated={() => {
            void refetchCategories();
          }}
          onCancel={returnToCatalog}
          onDuplicateRequest={(prod) => openNewProduct(prod.id)}
          onArchiveOrDelete={(prodId, action) =>
            setLifecycleModal({ open: true, action, productIds: [prodId] })
          }
          onSaved={(msg, stayAndNext, savedId) =>
            handleFormSaved(msg, stayAndNext, savedId)
          }
        />
      </Show>

      {/* VIEW: MODE B GRID */}
      <Show when={currentView() === "massa"}>
        <AdminBulkVariantsGrid
          products={productList().map((p) => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
          }))}
          initialProductId={
            routeSearch().product_id ? Number(routeSearch().product_id) : null
          }
          initialProductIds={!selectAllMatching() ? pageSelectedIds() : []}
          canCostView={canCostView()}
          canCostWrite={canCostWrite()}
          onCommitted={() => triggerReloadCatalog()}
        />
      </Show>

      {/* VIEW: UNIFIED AI REGISTRATION */}
      <Show when={currentView() === "ia"}>
        <AdminAiCatalogAgentPanel
          brands={brands() ?? []}
          categories={categories() ?? []}
          canCostWrite={canCostWrite()}
          onCommitted={() => triggerReloadCatalog()}
          onOpenExistingProduct={(id) => openEditProduct(id)}
          onProductSaved={(savedId, productName, stayForNext) => {
            void refetchProducts();
            if (!stayForNext) {
              setFeedback(`Produto "${productName}" cadastrado com sucesso.`);
              returnToCatalog();
              highlightSavedRow(savedId);
            }
          }}
        />
      </Show>

      {/* VIEW: GOODS RECEIPTS */}
      <Show when={currentView() === "recebimentos"}>
        <AdminGoodsReceiptsPanel
          initialSku={routeSearch().sku || ""}
          onConfirmed={() => triggerReloadCatalog()}
        />
      </Show>

      {/* VIEW: RESTOCK NOTIFICATIONS */}
      <Show when={currentView() === "avisos"}>
        <AdminRestockAnalyticsPanel />
      </Show>

      {/* VIEW: REVIEWS */}
      <Show when={currentView() === "avaliacoes"}>
        <section class="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 class="mb-3 text-base font-bold text-zinc-900">
            Moderação de avaliações
          </h2>
          <ul class="divide-y divide-zinc-200 text-sm">
            <For each={reviews() ?? []}>
              {(rev) => (
                <li class="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p class="font-bold text-zinc-900">
                      {rev.author_name}{" "}
                      <span class="inline-flex items-center gap-0.5 text-xs">
                        ({rev.rating}/5 <Star class="h-3.5 w-3.5 fill-amber-500 text-amber-500" />)
                      </span>{" "}
                      — {rev.product?.name}
                    </p>
                    <p class="text-xs text-zinc-600">{rev.body}</p>
                    <span class="text-[11px] uppercase text-zinc-500">
                      Status: {rev.status}
                    </span>
                  </div>
                  <div class="flex gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => void moderateReview(rev.id, "approved")}
                      class="rounded bg-[#93509e] px-3 py-1 font-semibold text-white"
                    >
                      Aprovar
                    </button>
                    <button
                      type="button"
                      onClick={() => void moderateReview(rev.id, "rejected")}
                      class="rounded border border-red-200 px-3 py-1 font-semibold text-red-700"
                    >
                      Rejeitar
                    </button>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>

      {/* VIEW: SPREADSHEET (XLSX / CSV) IMPORT/EXPORT */}
      <Show when={currentView() === "csv"}>
        <CatalogSpreadsheetImportPanel
          categories={categories() ?? []}
          onRefreshCategories={() => {
            void refetchCategories();
          }}
          onImported={() => {
            void refetchProducts();
          }}
        />
      </Show>

      {/* Modals: Mode A Bulk Rule & Lifecycle Archive/Restore/Delete */}
      <BulkRuleModal
        open={ruleModalOpen()}
        selectionLabel={
          selectAllMatching()
            ? `Todos os ${selectedCount()} resultados filtrados`
            : `${selectedCount()} produto(s) selecionado(s)`
        }
        selection={currentSelectionPayload()}
        brands={brands() ?? []}
        categories={categories() ?? []}
        canPrice={canPrice()}
        canCostWrite={canCostWrite()}
        canStock={canStock()}
        canWrite={canWrite()}
        onClose={() => setRuleModalOpen(false)}
        onCommitted={(msg) => handleBulkRuleCommitted(msg)}
      />

      <BulkLifecycleModal
        open={lifecycleModal().open}
        action={lifecycleModal().action}
        selection={currentSelectionPayload(lifecycleModal().productIds)}
        onClose={() => setLifecycleModal((prev) => ({ ...prev, open: false }))}
        onCommitted={(msg) => handleLifecycleCommitted(msg)}
      />
    </AdminLayout>
  );
}
