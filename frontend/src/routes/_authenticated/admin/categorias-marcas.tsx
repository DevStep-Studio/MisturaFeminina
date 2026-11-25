import { createFileRoute } from "@tanstack/solid-router";
import ChevronDown from "lucide-solid/icons/chevron-down";
import FolderTree from "lucide-solid/icons/folder-tree";
import Pencil from "lucide-solid/icons/pencil";
import Plus from "lucide-solid/icons/plus";
import Search from "lucide-solid/icons/search";
import Trash2 from "lucide-solid/icons/trash";
import {
  For,
  Show,
  createMemo,
  createResource,
  createSignal,
} from "solid-js";
import { AdminLayout } from "../../../features/admin/AdminLayout";
import { AdminAttributesManager } from "../../../features/admin/AdminAttributesManager";
import {
  AdminButton,
  AdminCard,
  AdminCombobox,
  AdminField,
  AdminImageUpload,
  AdminInput,
  AdminModal,
  AdminSideDrawer,
  AdminTextarea,
} from "../../../features/admin/ui";
import { ApiError, api } from "../../../lib/api";
import { assetUrl } from "../../../lib/format";
import { seoHead } from "../../../lib/seo";

export const Route = createFileRoute("/_authenticated/admin/categorias-marcas")(
  {
    head: () =>
      seoHead({
        title: "Categorias e Marcas — Admin Mistura Feminina",
        description: "Gestão de departamentos, subcategorias e marcas.",
        path: "/admin/categorias-marcas",
        noindex: true,
      }),
    component: AdminCategoriesBrandsPage,
  },
);

interface AdminCategory {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  parent_id: number | null;
  image_path: string | null;
  sort_order: number;
  show_in_menu: boolean;
  is_active: boolean;
}

interface AdminBrand {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  logo_path: string | null;
  is_featured: boolean;
  is_active: boolean;
}

function firstValidationError(
  errors: Record<string, string[]> | undefined,
  keys: string[],
): string | null {
  if (!errors) return null;
  for (const k of keys) {
    if (errors[k]?.[0]) return errors[k][0];
  }
  return null;
}

function AdminCategoriesBrandsPage() {
  const [activeTab, setActiveTab] = createSignal<
    "categories" | "brands" | "attributes"
  >("categories");
  const [catSearch, setCatSearch] = createSignal("");
  const [brandSearch, setBrandSearch] = createSignal("");
  const [feedback, setFeedback] = createSignal<string | null>(null);
  const [savedHighlightKey, setSavedHighlightKey] = createSignal<string | null>(
    null,
  );

  // Category Drawer State
  const [catDrawerOpen, setCatDrawerOpen] = createSignal(false);
  const [editingCatId, setEditingCatId] = createSignal<number | null>(null);
  const [catName, setCatName] = createSignal("");
  const [catSlug, setCatSlug] = createSignal("");
  const [catParentId, setCatParentId] = createSignal("");
  const [catImage, setCatImage] = createSignal("");
  const [catDesc, setCatDesc] = createSignal("");
  const [catSeoTitle, setCatSeoTitle] = createSignal("");
  const [catSeoDesc, setCatSeoDesc] = createSignal("");
  const [catShowInMenu, setCatShowInMenu] = createSignal(true);
  const [catIsActive, setCatIsActive] = createSignal(true);
  const [catSeoOpen, setCatSeoOpen] = createSignal(false);
  const [catSaving, setCatSaving] = createSignal(false);
  const [catFieldErrors, setCatFieldErrors] = createSignal<
    Record<string, string[]>
  >({});
  const [catGeneralError, setCatGeneralError] = createSignal<string | null>(
    null,
  );
  const [catInitialSnap, setCatInitialSnap] = createSignal("");

  // Brand Drawer State
  const [brandDrawerOpen, setBrandDrawerOpen] = createSignal(false);
  const [editingBrandId, setEditingBrandId] = createSignal<number | null>(null);
  const [brandName, setBrandName] = createSignal("");
  const [brandSlug, setBrandSlug] = createSignal("");
  const [brandDesc, setBrandDesc] = createSignal("");
  const [brandSeoTitle, setBrandSeoTitle] = createSignal("");
  const [brandSeoDesc, setBrandSeoDesc] = createSignal("");
  const [brandLogo, setBrandLogo] = createSignal("");
  const [brandFeatured, setBrandFeatured] = createSignal(true);
  const [brandIsActive, setBrandIsActive] = createSignal(true);
  const [brandSeoOpen, setBrandSeoOpen] = createSignal(false);
  const [brandSaving, setBrandSaving] = createSignal(false);
  const [brandFieldErrors, setBrandFieldErrors] = createSignal<
    Record<string, string[]>
  >({});
  const [brandGeneralError, setBrandGeneralError] = createSignal<string | null>(
    null,
  );
  const [brandInitialSnap, setBrandInitialSnap] = createSignal("");

  // Delete confirmation modal
  const [deleteCatTarget, setDeleteCatTarget] =
    createSignal<AdminCategory | null>(null);
  const [deleteBusy, setDeleteBusy] = createSignal(false);

  const [categories, { refetch: refetchCats }] = createResource(async () => {
    const res = await api<{ data: AdminCategory[] }>("/admin/categories");
    return res.data ?? [];
  });

  const [brands, { refetch: refetchBrands }] = createResource(async () => {
    const res = await api<{ data: AdminBrand[] }>("/admin/brands");
    return res.data ?? [];
  });

  const currentCatSnapshot = () =>
    JSON.stringify([
      catName(),
      catSlug(),
      catParentId(),
      catImage(),
      catDesc(),
      catSeoTitle(),
      catSeoDesc(),
      catShowInMenu(),
      catIsActive(),
    ]);

  const currentBrandSnapshot = () =>
    JSON.stringify([
      brandName(),
      brandSlug(),
      brandDesc(),
      brandSeoTitle(),
      brandSeoDesc(),
      brandLogo(),
      brandFeatured(),
      brandIsActive(),
    ]);

  const isCatDirty = () =>
    catDrawerOpen() && currentCatSnapshot() !== catInitialSnap();
  const isBrandDirty = () =>
    brandDrawerOpen() && currentBrandSnapshot() !== brandInitialSnap();

  function triggerRowHighlight(key: string) {
    setSavedHighlightKey(key);
    setTimeout(() => {
      if (savedHighlightKey() === key) setSavedHighlightKey(null);
    }, 2000);
  }

  function openNewCategory() {
    setEditingCatId(null);
    setCatName("");
    setCatSlug("");
    setCatParentId("");
    setCatImage("");
    setCatDesc("");
    setCatSeoTitle("");
    setCatSeoDesc("");
    setCatShowInMenu(true);
    setCatIsActive(true);
    setCatSeoOpen(false);
    setCatFieldErrors({});
    setCatGeneralError(null);
    setCatInitialSnap(
      JSON.stringify(["", "", "", "", "", "", "", true, true]),
    );
    setCatDrawerOpen(true);
  }

  function openEditCategory(cat: AdminCategory) {
    setEditingCatId(cat.id);
    setCatName(cat.name);
    setCatSlug(cat.slug);
    setCatParentId(cat.parent_id ? String(cat.parent_id) : "");
    setCatImage(cat.image_path || "");
    setCatDesc(cat.description || "");
    setCatSeoTitle(cat.seo_title || "");
    setCatSeoDesc(cat.seo_description || "");
    setCatShowInMenu(Boolean(cat.show_in_menu));
    setCatIsActive(Boolean(cat.is_active));
    setCatSeoOpen(Boolean(cat.seo_title || cat.seo_description));
    setCatFieldErrors({});
    setCatGeneralError(null);
    setCatInitialSnap(
      JSON.stringify([
        cat.name,
        cat.slug,
        cat.parent_id ? String(cat.parent_id) : "",
        cat.image_path || "",
        cat.description || "",
        cat.seo_title || "",
        cat.seo_description || "",
        Boolean(cat.show_in_menu),
        Boolean(cat.is_active),
      ]),
    );
    setCatDrawerOpen(true);
  }

  async function saveCategory(e: Event) {
    e.preventDefault();
    if (catSaving()) return;
    setFeedback(null);
    setCatFieldErrors({});
    setCatGeneralError(null);

    if (!catName().trim()) {
      setCatFieldErrors({
        name: ["Informe o nome da categoria."],
      });
      return;
    }

    setCatSaving(true);
    try {
      const payload = {
        name: catName().trim(),
        slug: catSlug().trim() || undefined,
        parent_id: catParentId() ? Number(catParentId()) : null,
        description: catDesc().trim() || undefined,
        seo_title: catSeoTitle().trim() || undefined,
        seo_description: catSeoDesc().trim() || undefined,
        image_path: catImage().trim() || undefined,
        show_in_menu: catShowInMenu(),
        is_active: catIsActive(),
      };
      let savedId = editingCatId();
      if (savedId) {
        await api(`/admin/categories/${savedId}`, {
          method: "PUT",
          body: payload,
        });
      } else {
        const res = await api<{ data: AdminCategory }>("/admin/categories", {
          method: "POST",
          body: payload,
        });
        savedId = res.data.id;
      }
      setCatDrawerOpen(false);
      await refetchCats();
      if (savedId) triggerRowHighlight(`cat:${savedId}`);
      setFeedback("Categoria salva com sucesso.");
    } catch (err) {
      if (err instanceof ApiError) {
        setCatFieldErrors(err.validation ?? {});
        setCatGeneralError(err.message);
        if (
          firstValidationError(err.validation, [
            "slug",
            "seo_title",
            "seo_description",
          ])
        ) {
          setCatSeoOpen(true);
        }
      } else {
        setCatGeneralError("Não foi possível salvar a categoria.");
      }
    } finally {
      setCatSaving(false);
    }
  }

  async function confirmDeleteCategory() {
    const target = deleteCatTarget();
    if (!target || deleteBusy()) return;
    setDeleteBusy(true);
    try {
      await api(`/admin/categories/${target.id}`, { method: "DELETE" });
      setDeleteCatTarget(null);
      await refetchCats();
      setFeedback(`Categoria "${target.name}" removida.`);
    } catch (err) {
      setFeedback(
        err instanceof ApiError
          ? err.message
          : "Não foi possível remover a categoria.",
      );
      setDeleteCatTarget(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  function openNewBrand() {
    setEditingBrandId(null);
    setBrandName("");
    setBrandSlug("");
    setBrandDesc("");
    setBrandSeoTitle("");
    setBrandSeoDesc("");
    setBrandLogo("");
    setBrandFeatured(true);
    setBrandIsActive(true);
    setBrandSeoOpen(false);
    setBrandFieldErrors({});
    setBrandGeneralError(null);
    setBrandInitialSnap(
      JSON.stringify(["", "", "", "", "", "", true, true]),
    );
    setBrandDrawerOpen(true);
  }

  function openEditBrand(b: AdminBrand) {
    setEditingBrandId(b.id);
    setBrandName(b.name);
    setBrandSlug(b.slug);
    setBrandDesc(b.description || "");
    setBrandSeoTitle(b.seo_title || "");
    setBrandSeoDesc(b.seo_description || "");
    setBrandLogo(b.logo_path || "");
    setBrandFeatured(b.is_featured);
    setBrandIsActive(Boolean(b.is_active));
    setBrandSeoOpen(Boolean(b.seo_title || b.seo_description));
    setBrandFieldErrors({});
    setBrandGeneralError(null);
    setBrandInitialSnap(
      JSON.stringify([
        b.name,
        b.slug,
        b.description || "",
        b.seo_title || "",
        b.seo_description || "",
        b.logo_path || "",
        b.is_featured,
        Boolean(b.is_active),
      ]),
    );
    setBrandDrawerOpen(true);
  }

  async function saveBrand(e: Event) {
    e.preventDefault();
    if (brandSaving()) return;
    setFeedback(null);
    setBrandFieldErrors({});
    setBrandGeneralError(null);

    if (!brandName().trim()) {
      setBrandFieldErrors({
        name: ["Informe o nome da marca."],
      });
      return;
    }

    setBrandSaving(true);
    try {
      const payload = {
        name: brandName().trim(),
        slug: brandSlug().trim() || undefined,
        description: brandDesc().trim() || undefined,
        seo_title: brandSeoTitle().trim() || undefined,
        seo_description: brandSeoDesc().trim() || undefined,
        logo_path: brandLogo().trim() || undefined,
        is_featured: brandFeatured(),
        is_active: brandIsActive(),
      };
      let savedId = editingBrandId();
      if (savedId) {
        await api(`/admin/brands/${savedId}`, {
          method: "PUT",
          body: payload,
        });
      } else {
        const res = await api<{ data: AdminBrand }>("/admin/brands", {
          method: "POST",
          body: payload,
        });
        savedId = res.data.id;
      }
      setBrandDrawerOpen(false);
      await refetchBrands();
      if (savedId) triggerRowHighlight(`brand:${savedId}`);
      setFeedback("Marca salva com sucesso.");
    } catch (err) {
      if (err instanceof ApiError) {
        setBrandFieldErrors(err.validation ?? {});
        setBrandGeneralError(err.message);
        if (
          firstValidationError(err.validation, [
            "slug",
            "seo_title",
            "seo_description",
          ])
        ) {
          setBrandSeoOpen(true);
        }
      } else {
        setBrandGeneralError("Não foi possível salvar a marca.");
      }
    } finally {
      setBrandSaving(false);
    }
  }

  const orderedCategories = createMemo(() => {
    const all = categories() ?? [];
    const byId = new Map(all.map((c) => [c.id, c]));
    const q = catSearch().trim().toLowerCase();

    const roots = all.filter((c) => !c.parent_id);
    const childrenByParent = new Map<number, AdminCategory[]>();
    for (const c of all) {
      if (c.parent_id) {
        const list = childrenByParent.get(c.parent_id) ?? [];
        list.push(c);
        childrenByParent.set(c.parent_id, list);
      }
    }

    const flattened: Array<{ cat: AdminCategory; parentName: string | null }> =
      [];
    for (const r of roots) {
      flattened.push({ cat: r, parentName: null });
      for (const ch of childrenByParent.get(r.id) ?? []) {
        flattened.push({ cat: ch, parentName: r.name });
      }
    }
    // Include orphan children if parent not in list
    for (const c of all) {
      if (c.parent_id && !byId.has(c.parent_id)) {
        flattened.push({ cat: c, parentName: null });
      }
    }

    if (!q) return flattened;
    return flattened.filter(
      ({ cat }) =>
        cat.name.toLowerCase().includes(q) ||
        cat.slug.toLowerCase().includes(q),
    );
  });

  const filteredBrands = createMemo(() => {
    const all = brands() ?? [];
    const q = brandSearch().trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (b) =>
        b.name.toLowerCase().includes(q) || b.slug.toLowerCase().includes(q),
    );
  });

  const parentOptions = createMemo(() =>
    (categories() ?? [])
      .filter((c) => !c.parent_id && c.id !== editingCatId())
      .map((c) => ({
        value: String(c.id),
        label: c.name,
        hint: `/${c.slug}`,
      })),
  );

  const primaryHeaderAction = () => {
    if (activeTab() === "categories") {
      return (
        <AdminButton variant="primary" onClick={() => openNewCategory()}>
          <Plus class="h-4 w-4" />
          Nova categoria
        </AdminButton>
      );
    }
    if (activeTab() === "brands") {
      return (
        <AdminButton variant="primary" onClick={() => openNewBrand()}>
          <Plus class="h-4 w-4" />
          Nova marca
        </AdminButton>
      );
    }
    return undefined;
  };

  return (
    <AdminLayout
      title="Categorias e Marcas"
      permission="catalog.view"
      headerActions={primaryHeaderAction()}
    >
      <div class="space-y-4">
        <Show when={feedback()}>
          <div
            role="status"
            class="flex items-center justify-between gap-2 rounded-[8px] border border-[#e4c6ea] bg-[#f5ebf7] px-4 py-2.5 text-xs font-medium text-[#62298d]"
          >
            <span>{feedback()}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              class="font-semibold underline"
            >
              Dispensar
            </button>
          </div>
        </Show>

        {/* Clean Module Tabs */}
        <div
          role="tablist"
          aria-label="Organização do catálogo"
          class="flex flex-wrap items-center gap-1 border-b border-zinc-200 pb-2 text-xs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab() === "categories"}
            onClick={() => setActiveTab("categories")}
            class={`adm-btn inline-flex h-9 items-center gap-2 rounded-[8px] px-3.5 font-semibold ${
              activeTab() === "categories"
                ? "bg-[#f5ebf7] text-[#62298d]"
                : "text-zinc-600 hover:bg-white hover:text-zinc-900"
            }`}
          >
            <span>Categorias</span>
            <span class="adm-tabular rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-zinc-700">
              {(categories() ?? []).length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab() === "brands"}
            onClick={() => setActiveTab("brands")}
            class={`adm-btn inline-flex h-9 items-center gap-2 rounded-[8px] px-3.5 font-semibold ${
              activeTab() === "brands"
                ? "bg-[#f5ebf7] text-[#62298d]"
                : "text-zinc-600 hover:bg-white hover:text-zinc-900"
            }`}
          >
            <span>Marcas</span>
            <span class="adm-tabular rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-zinc-700">
              {(brands() ?? []).length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab() === "attributes"}
            onClick={() => setActiveTab("attributes")}
            class={`adm-btn inline-flex h-9 items-center gap-2 rounded-[8px] px-3.5 font-semibold ${
              activeTab() === "attributes"
                ? "bg-[#f5ebf7] text-[#62298d]"
                : "text-zinc-600 hover:bg-white hover:text-zinc-900"
            }`}
          >
            Atributos & Filtros
          </button>
        </div>

        {/* TAB 1: CATEGORIES */}
        <Show when={activeTab() === "categories"}>
          <AdminCard padding="none">
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
              <div class="relative min-w-[220px] flex-1 max-w-md">
                <Search class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                <input
                  type="search"
                  placeholder="Buscar categorias por nome ou slug..."
                  value={catSearch()}
                  onInput={(e) => setCatSearch(e.currentTarget.value)}
                  class="h-9 w-full rounded-[8px] border border-zinc-300 bg-white pl-8 pr-3 text-xs focus:border-[#93509e] focus:outline-none"
                />
              </div>
              <span class="adm-tabular text-xs font-medium text-zinc-500">
                {orderedCategories().length} categoria(s)
              </span>
            </div>

            <Show
              when={orderedCategories().length > 0}
              fallback={
                <div class="flex flex-col items-center gap-2 px-6 py-12 text-center text-xs text-zinc-500">
                  <FolderTree class="h-7 w-7 text-zinc-300" />
                  <p>Nenhuma categoria encontrada para o filtro informado.</p>
                  <Show when={catSearch()}>
                    <AdminButton
                      size="sm"
                      variant="secondary"
                      onClick={() => setCatSearch("")}
                    >
                      Limpar busca
                    </AdminButton>
                  </Show>
                </div>
              }
            >
              <ul class="divide-y divide-zinc-100 text-sm">
                <For each={orderedCategories()}>
                  {({ cat, parentName }) => (
                    <li
                      class={`flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-zinc-50 ${
                        savedHighlightKey() === `cat:${cat.id}`
                          ? "adm-row-saved"
                          : ""
                      }`}
                    >
                      <div
                        class={`flex min-w-0 items-center gap-3 ${
                          parentName ? "pl-5 sm:pl-7" : ""
                        }`}
                      >
                        <img
                          src={assetUrl(cat.image_path)}
                          alt={cat.name}
                          class="h-10 w-10 shrink-0 rounded-[8px] border border-zinc-200 bg-zinc-50 object-cover"
                        />
                        <div class="min-w-0">
                          <div class="flex flex-wrap items-center gap-2">
                            <p class="truncate font-semibold text-zinc-900">
                              {cat.name}
                            </p>
                            <Show when={!cat.is_active}>
                              <span class="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                                Inativa
                              </span>
                            </Show>
                          </div>
                          <p class="truncate text-xs text-zinc-500">
                            /{cat.slug}
                            <Show when={parentName}>
                              {" "}
                              · Subcategoria de {parentName}
                            </Show>
                          </p>
                        </div>
                      </div>

                      <div class="flex shrink-0 items-center gap-1.5">
                        <AdminButton
                          size="sm"
                          variant="secondary"
                          onClick={() => openEditCategory(cat)}
                        >
                          <Pencil class="h-3.5 w-3.5" />
                          Editar
                        </AdminButton>
                        <AdminButton
                          size="sm"
                          variant="ghost"
                          aria-label={`Remover categoria ${cat.name}`}
                          onClick={() => setDeleteCatTarget(cat)}
                          class="text-red-700 hover:bg-red-50 hover:text-red-800"
                        >
                          <Trash2 class="h-3.5 w-3.5" />
                        </AdminButton>
                      </div>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </AdminCard>
        </Show>

        {/* TAB 2: BRANDS */}
        <Show when={activeTab() === "brands"}>
          <AdminCard padding="none">
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
              <div class="relative min-w-[220px] flex-1 max-w-md">
                <Search class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                <input
                  type="search"
                  placeholder="Buscar marcas por nome ou slug..."
                  value={brandSearch()}
                  onInput={(e) => setBrandSearch(e.currentTarget.value)}
                  class="h-9 w-full rounded-[8px] border border-zinc-300 bg-white pl-8 pr-3 text-xs focus:border-[#93509e] focus:outline-none"
                />
              </div>
              <span class="adm-tabular text-xs font-medium text-zinc-500">
                {filteredBrands().length} marca(s)
              </span>
            </div>

            <Show
              when={filteredBrands().length > 0}
              fallback={
                <div class="flex flex-col items-center gap-2 px-6 py-12 text-center text-xs text-zinc-500">
                  <p>Nenhuma marca encontrada.</p>
                  <Show when={brandSearch()}>
                    <AdminButton
                      size="sm"
                      variant="secondary"
                      onClick={() => setBrandSearch("")}
                    >
                      Limpar busca
                    </AdminButton>
                  </Show>
                </div>
              }
            >
              <ul class="divide-y divide-zinc-100 text-sm">
                <For each={filteredBrands()}>
                  {(b) => (
                    <li
                      class={`flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-zinc-50 ${
                        savedHighlightKey() === `brand:${b.id}`
                          ? "adm-row-saved"
                          : ""
                      }`}
                    >
                      <div class="flex min-w-0 items-center gap-3">
                        <img
                          src={assetUrl(b.logo_path)}
                          alt={b.name}
                          class="h-9 w-16 shrink-0 rounded-[8px] border border-zinc-200 bg-zinc-50 object-contain p-1"
                        />
                        <div class="min-w-0">
                          <div class="flex flex-wrap items-center gap-2">
                            <p class="truncate font-semibold text-zinc-900">
                              {b.name}
                            </p>
                            <Show when={b.is_featured}>
                              <span class="rounded bg-[#f5ebf7] px-2 py-0.5 text-[11px] font-medium text-[#62298d]">
                                Destaque na home
                              </span>
                            </Show>
                          </div>
                          <p class="truncate text-xs text-zinc-500">/{b.slug}</p>
                        </div>
                      </div>

                      <div class="flex shrink-0 items-center gap-2">
                        <AdminButton
                          size="sm"
                          variant="secondary"
                          onClick={() => openEditBrand(b)}
                        >
                          <Pencil class="h-3.5 w-3.5" />
                          Editar
                        </AdminButton>
                      </div>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </AdminCard>
        </Show>

        {/* TAB 3: ATTRIBUTES */}
        <Show when={activeTab() === "attributes"}>
          <AdminAttributesManager
            categories={categories() ?? []}
            onRefreshCategories={() => {
              void refetchCats();
            }}
          />
        </Show>
      </div>

      {/* Category Create / Edit Drawer */}
      <AdminSideDrawer
        open={catDrawerOpen()}
        title={editingCatId() ? `Editar categoria` : "Nova categoria"}
        subtitle={editingCatId() ? catName() : "Defina departamento ou subcategoria"}
        isDirty={isCatDirty()}
        onClose={() => setCatDrawerOpen(false)}
        footer={
          <>
            <AdminButton
              variant="secondary"
              onClick={() => setCatDrawerOpen(false)}
            >
              Cancelar
            </AdminButton>
            <AdminButton
              type="submit"
              form="adm-cat-form"
              variant="primary"
              loading={catSaving()}
              loadingLabel="Salvando…"
            >
              {editingCatId() ? "Atualizar categoria" : "Salvar categoria"}
            </AdminButton>
          </>
        }
      >
        <form
          id="adm-cat-form"
          onSubmit={(e) => void saveCategory(e)}
          class="space-y-4"
          noValidate
        >
          <Show when={catGeneralError()}>
            <div
              role="alert"
              class="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800"
            >
              {catGeneralError()}
            </div>
          </Show>

          <AdminField
            label="Nome da categoria"
            forId="cat-name-input"
            required
            error={firstValidationError(catFieldErrors(), ["name"])}
          >
            <AdminInput
              id="cat-name-input"
              data-autofocus
              type="text"
              required
              placeholder="Ex.: Esmaltes em Gel"
              value={catName()}
              hasError={Boolean(firstValidationError(catFieldErrors(), ["name"]))}
              onInput={(e) => setCatName(e.currentTarget.value)}
            />
          </AdminField>

          <AdminImageUpload
            label="Imagem da categoria"
            folder="catalog"
            value={catImage()}
            onChange={(next) => setCatImage(next)}
            error={firstValidationError(catFieldErrors(), ["image_path"])}
          />

          <AdminCombobox
            label="Hierarquia (categoria pai)"
            placeholder="Categoria principal (raiz)"
            searchPlaceholder="Buscar categoria pai..."
            value={catParentId()}
            options={parentOptions()}
            onChange={(val) => setCatParentId(val)}
            error={firstValidationError(catFieldErrors(), ["parent_id"])}
          />

          <AdminField
            label="Descrição"
            forId="cat-desc-input"
            hint="Exibida no cabeçalho da categoria na loja."
            error={firstValidationError(catFieldErrors(), ["description"])}
          >
            <AdminTextarea
              id="cat-desc-input"
              rows={3}
              placeholder="Descreva os produtos que fazem parte desta categoria..."
              value={catDesc()}
              hasError={Boolean(
                firstValidationError(catFieldErrors(), ["description"]),
              )}
              onInput={(e) => setCatDesc(e.currentTarget.value)}
            />
          </AdminField>

          {/* Collapsible SEO & Advanced Options */}
          <div class="rounded-[8px] border border-zinc-200 bg-zinc-50/70">
            <button
              type="button"
              aria-expanded={catSeoOpen()}
              onClick={() => setCatSeoOpen((v) => !v)}
              class="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs font-semibold text-zinc-800"
            >
              <span>SEO e opções avançadas</span>
              <ChevronDown
                class={`h-4 w-4 text-zinc-500 transition-transform ${
                  catSeoOpen() ? "rotate-180" : ""
                }`}
              />
            </button>

            <Show when={catSeoOpen()}>
              <div class="space-y-3 border-t border-zinc-200 px-3.5 py-3">
                <AdminField
                  label="Slug da URL"
                  forId="cat-slug-input"
                  hint="Gerado automaticamente a partir do nome se ficar em branco."
                  error={firstValidationError(catFieldErrors(), ["slug"])}
                >
                  <AdminInput
                    id="cat-slug-input"
                    type="text"
                    mono
                    placeholder="esmaltes-em-gel"
                    value={catSlug()}
                    hasError={Boolean(
                      firstValidationError(catFieldErrors(), ["slug"]),
                    )}
                    onInput={(e) => setCatSlug(e.currentTarget.value)}
                  />
                </AdminField>

                <AdminField
                  label="Título SEO"
                  forId="cat-seo-title"
                  error={firstValidationError(catFieldErrors(), ["seo_title"])}
                >
                  <AdminInput
                    id="cat-seo-title"
                    type="text"
                    placeholder={
                      catName() ? `${catName()} | Mistura Feminina` : "Título SEO"
                    }
                    value={catSeoTitle()}
                    hasError={Boolean(
                      firstValidationError(catFieldErrors(), ["seo_title"]),
                    )}
                    onInput={(e) => setCatSeoTitle(e.currentTarget.value)}
                  />
                </AdminField>

                <AdminField
                  label="Meta description"
                  forId="cat-seo-desc"
                  error={firstValidationError(catFieldErrors(), [
                    "seo_description",
                  ])}
                >
                  <AdminTextarea
                    id="cat-seo-desc"
                    rows={2}
                    placeholder="Descrição exibida nos resultados de busca..."
                    value={catSeoDesc()}
                    hasError={Boolean(
                      firstValidationError(catFieldErrors(), [
                        "seo_description",
                      ]),
                    )}
                    onInput={(e) => setCatSeoDesc(e.currentTarget.value)}
                  />
                </AdminField>

                <div class="flex flex-wrap gap-4 pt-1 text-xs">
                  <label class="inline-flex items-center gap-2 font-medium text-zinc-800">
                    <input
                      type="checkbox"
                      checked={catShowInMenu()}
                      onChange={(e) => setCatShowInMenu(e.currentTarget.checked)}
                      class="accent-[#93509e]"
                    />
                    Mostrar no menu principal
                  </label>
                  <label class="inline-flex items-center gap-2 font-medium text-zinc-800">
                    <input
                      type="checkbox"
                      checked={catIsActive()}
                      onChange={(e) => setCatIsActive(e.currentTarget.checked)}
                      class="accent-[#93509e]"
                    />
                    Categoria ativa
                  </label>
                </div>
              </div>
            </Show>
          </div>
        </form>
      </AdminSideDrawer>

      {/* Brand Create / Edit Drawer */}
      <AdminSideDrawer
        open={brandDrawerOpen()}
        title={editingBrandId() ? "Editar marca" : "Nova marca"}
        subtitle={editingBrandId() ? brandName() : "Cadastre fabricante ou linha parceira"}
        isDirty={isBrandDirty()}
        onClose={() => setBrandDrawerOpen(false)}
        footer={
          <>
            <AdminButton
              variant="secondary"
              onClick={() => setBrandDrawerOpen(false)}
            >
              Cancelar
            </AdminButton>
            <AdminButton
              type="submit"
              form="adm-brand-form"
              variant="primary"
              loading={brandSaving()}
              loadingLabel="Salvando…"
            >
              {editingBrandId() ? "Atualizar marca" : "Salvar marca"}
            </AdminButton>
          </>
        }
      >
        <form
          id="adm-brand-form"
          onSubmit={(e) => void saveBrand(e)}
          class="space-y-4"
          noValidate
        >
          <Show when={brandGeneralError()}>
            <div
              role="alert"
              class="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800"
            >
              {brandGeneralError()}
            </div>
          </Show>

          <AdminField
            label="Nome da marca"
            forId="brand-name-input"
            required
            error={firstValidationError(brandFieldErrors(), ["name"])}
          >
            <AdminInput
              id="brand-name-input"
              data-autofocus
              type="text"
              required
              placeholder="Ex.: Studio Gel"
              value={brandName()}
              hasError={Boolean(firstValidationError(brandFieldErrors(), ["name"]))}
              onInput={(e) => setBrandName(e.currentTarget.value)}
            />
          </AdminField>

          <AdminImageUpload
            label="Logo da marca"
            folder="catalog"
            previewShape="wide"
            value={brandLogo()}
            onChange={(next) => setBrandLogo(next)}
            error={firstValidationError(brandFieldErrors(), ["logo_path"])}
          />

          <label class="inline-flex items-center gap-2 text-xs font-medium text-zinc-800">
            <input
              type="checkbox"
              checked={brandFeatured()}
              onChange={(e) => setBrandFeatured(e.currentTarget.checked)}
              class="accent-[#93509e]"
            />
            Destaque na página inicial da loja
          </label>

          <AdminField
            label="Descrição"
            forId="brand-desc-input"
            error={firstValidationError(brandFieldErrors(), ["description"])}
          >
            <AdminTextarea
              id="brand-desc-input"
              rows={3}
              placeholder="Apresentação da marca na vitrine..."
              value={brandDesc()}
              hasError={Boolean(
                firstValidationError(brandFieldErrors(), ["description"]),
              )}
              onInput={(e) => setBrandDesc(e.currentTarget.value)}
            />
          </AdminField>

          {/* Collapsible SEO & Advanced Options */}
          <div class="rounded-[8px] border border-zinc-200 bg-zinc-50/70">
            <button
              type="button"
              aria-expanded={brandSeoOpen()}
              onClick={() => setBrandSeoOpen((v) => !v)}
              class="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs font-semibold text-zinc-800"
            >
              <span>SEO e opções avançadas</span>
              <ChevronDown
                class={`h-4 w-4 text-zinc-500 transition-transform ${
                  brandSeoOpen() ? "rotate-180" : ""
                }`}
              />
            </button>

            <Show when={brandSeoOpen()}>
              <div class="space-y-3 border-t border-zinc-200 px-3.5 py-3">
                <AdminField
                  label="Slug da URL"
                  forId="brand-slug-input"
                  hint="Deixe vazio para gerar automaticamente."
                  error={firstValidationError(brandFieldErrors(), ["slug"])}
                >
                  <AdminInput
                    id="brand-slug-input"
                    type="text"
                    mono
                    placeholder="studio-gel"
                    value={brandSlug()}
                    hasError={Boolean(
                      firstValidationError(brandFieldErrors(), ["slug"]),
                    )}
                    onInput={(e) => setBrandSlug(e.currentTarget.value)}
                  />
                </AdminField>

                <AdminField
                  label="Título SEO"
                  forId="brand-seo-title"
                  error={firstValidationError(brandFieldErrors(), [
                    "seo_title",
                  ])}
                >
                  <AdminInput
                    id="brand-seo-title"
                    type="text"
                    placeholder={
                      brandName()
                        ? `${brandName()} | Mistura Feminina`
                        : "Título SEO"
                    }
                    value={brandSeoTitle()}
                    hasError={Boolean(
                      firstValidationError(brandFieldErrors(), ["seo_title"]),
                    )}
                    onInput={(e) => setBrandSeoTitle(e.currentTarget.value)}
                  />
                </AdminField>

                <AdminField
                  label="Meta description"
                  forId="brand-seo-desc"
                  error={firstValidationError(brandFieldErrors(), [
                    "seo_description",
                  ])}
                >
                  <AdminTextarea
                    id="brand-seo-desc"
                    rows={2}
                    placeholder="Resumo para mecanismos de busca..."
                    value={brandSeoDesc()}
                    hasError={Boolean(
                      firstValidationError(brandFieldErrors(), [
                        "seo_description",
                      ]),
                    )}
                    onInput={(e) => setBrandSeoDesc(e.currentTarget.value)}
                  />
                </AdminField>

                <label class="inline-flex items-center gap-2 text-xs font-medium text-zinc-800">
                  <input
                    type="checkbox"
                    checked={brandIsActive()}
                    onChange={(e) => setBrandIsActive(e.currentTarget.checked)}
                    class="accent-[#93509e]"
                  />
                  Marca ativa na loja
                </label>
              </div>
            </Show>
          </div>
        </form>
      </AdminSideDrawer>

      {/* Delete Category Confirmation Modal */}
      <AdminModal
        open={Boolean(deleteCatTarget())}
        title={`Excluir categoria ${deleteCatTarget()?.name ?? ""}`}
        onClose={() => setDeleteCatTarget(null)}
        maxWidthClass="max-w-md"
        footer={
          <>
            <AdminButton
              variant="secondary"
              onClick={() => setDeleteCatTarget(null)}
            >
              Cancelar
            </AdminButton>
            <AdminButton
              variant="danger"
              loading={deleteBusy()}
              loadingLabel="Excluindo…"
              onClick={() => void confirmDeleteCategory()}
            >
              Excluir categoria
            </AdminButton>
          </>
        }
      >
        <p class="text-xs leading-relaxed text-zinc-600">
          Esta ação remove a categoria <strong>{deleteCatTarget()?.name}</strong>{" "}
          do catálogo administrativo e desvincula produtos associados. Deseja
          continuar?
        </p>
      </AdminModal>
    </AdminLayout>
  );
}
