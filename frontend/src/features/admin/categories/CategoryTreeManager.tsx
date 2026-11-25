import ArrowDown from "lucide-solid/icons/arrow-down";
import ArrowUp from "lucide-solid/icons/arrow-up";
import ChevronDown from "lucide-solid/icons/chevron-down";
import ChevronRight from "lucide-solid/icons/chevron-right";
import Eye from "lucide-solid/icons/eye";
import EyeOff from "lucide-solid/icons/eye-off";
import FolderPlus from "lucide-solid/icons/folder-plus";
import FolderTree from "lucide-solid/icons/folder-tree";
import GripVertical from "lucide-solid/icons/grip-vertical";
import Pencil from "lucide-solid/icons/pencil";
import Plus from "lucide-solid/icons/plus";
import Search from "lucide-solid/icons/search";
import Trash2 from "lucide-solid/icons/trash";
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
} from "solid-js";
import { ApiError, api } from "../../../lib/api";
import { assetUrl } from "../../../lib/format";
import {
  AdminButton,
  AdminCard,
  AdminCombobox,
  AdminField,
  AdminImageUpload,
  AdminInput,
  AdminModal,
  AdminSelect,
  AdminSideDrawer,
  AdminTextarea,
} from "../ui";
import {
  type AdminCategoryNode,
  type CategoryTreeBranch,
  buildCategoryHierarchyOptions,
  buildCategoryTree,
  collectCategoryDescendantIds,
  normalizeCategoryText,
  slugifyCategoryName,
} from "./category-helpers";

interface CategoryDependenciesPayload {
  category_id: number;
  category_name: string;
  direct_products_count: number;
  subtree_products_count: number;
  children_count: number;
  children: Array<{ id: number; name: string; slug: string; is_active: boolean }>;
  can_delete_directly: boolean;
}

const ICON_OPTIONS = [
  { value: "", label: "Sem ícone específico" },
  { value: "sparkles", label: "Brilhos (Unhas / Esmaltes)" },
  { value: "scissors", label: "Tesoura / Alicate (Acessórios)" },
  { value: "droplet", label: "Gota (Cuidados / Séruns)" },
  { value: "palette", label: "Paleta (Decoração / Make)" },
  { value: "eye", label: "Olhar (Cílios / Sobrancelhas)" },
  { value: "briefcase", label: "Equipamento (Maquinários)" },
  { value: "package", label: "Kit / Combo (Kits)" },
  { value: "shield", label: "Proteção (Higiene / Descartáveis)" },
  { value: "heart", label: "Beleza / Cuidados" },
];

function firstError(
  errors: Record<string, string[]> | undefined,
  keys: string[],
): string | null {
  if (!errors) return null;
  for (const k of keys) {
    if (errors[k]?.[0]) return errors[k][0];
  }
  return null;
}

export function CategoryTreeManager(props: {
  categories: AdminCategoryNode[];
  onRefresh: () => Promise<unknown> | void;
  onRegisterNewTrigger?: (fn: () => void) => void;
}) {
  const [search, setSearch] = createSignal("");
  const [statusFilter, setStatusFilter] = createSignal<
    "all" | "active" | "inactive" | "menu"
  >("all");
  const [expandedIds, setExpandedIds] = createSignal<Set<number>>(new Set());
  const [initializedExpand, setInitializedExpand] = createSignal(false);
  const [selectedIds, setSelectedIds] = createSignal<number[]>([]);
  const [feedback, setFeedback] = createSignal<string | null>(null);
  const [errorBanner, setErrorBanner] = createSignal<string | null>(null);
  const [savedHighlightId, setSavedHighlightId] = createSignal<number | null>(
    null,
  );
  const [busyId, setBusyId] = createSignal<number | null>(null);
  const [bulkBusy, setBulkBusy] = createSignal(false);

  // Drag-and-drop state
  const [draggedCatId, setDraggedCatId] = createSignal<number | null>(null);
  const [dropTarget, setDropTarget] = createSignal<{
    id: number;
    mode: "before" | "inside" | "after";
  } | null>(null);

  // Create/Edit Drawer State
  const [drawerOpen, setDrawerOpen] = createSignal(false);
  const [editingId, setEditingId] = createSignal<number | null>(null);
  const [formName, setFormName] = createSignal("");
  const [formSlug, setFormSlug] = createSignal("");
  const [slugTouched, setSlugTouched] = createSignal(false);
  const [formParentId, setFormParentId] = createSignal("");
  const [formDesc, setFormDesc] = createSignal("");
  const [formImage, setFormImage] = createSignal("");
  const [formIcon, setFormIcon] = createSignal("");
  const [formSortOrder, setFormSortOrder] = createSignal("1");
  const [formIsActive, setFormIsActive] = createSignal(true);
  const [formShowInMenu, setFormShowInMenu] = createSignal(true);
  const [formSeoTitle, setFormSeoTitle] = createSignal("");
  const [formSeoDesc, setFormSeoDesc] = createSignal("");
  const [seoOpen, setSeoOpen] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [fieldErrors, setFieldErrors] = createSignal<Record<string, string[]>>(
    {},
  );
  const [generalError, setGeneralError] = createSignal<string | null>(null);
  const [initialSnap, setInitialSnap] = createSignal("");

  // Safe Delete Modal State
  const [deleteTarget, setDeleteTarget] = createSignal<AdminCategoryNode | null>(
    null,
  );
  const [deleteDeps, setDeleteDeps] =
    createSignal<CategoryDependenciesPayload | null>(null);
  const [deleteDepsLoading, setDeleteDepsLoading] = createSignal(false);
  const [transferCatId, setTransferCatId] = createSignal("");
  const [subcatStrategy, setSubcatStrategy] = createSignal<
    "promote_to_parent" | "move_to_target"
  >("promote_to_parent");
  const [deleteBusy, setDeleteBusy] = createSignal(false);
  const [deleteErr, setDeleteErr] = createSignal<string | null>(null);

  // Bulk Move Parent Modal State
  const [bulkMoveOpen, setBulkMoveOpen] = createSignal(false);
  const [bulkMoveParentId, setBulkMoveParentId] = createSignal("");

  // Initialize root nodes expanded once categories load
  createEffect(() => {
    const cats = props.categories;
    if (!initializedExpand() && cats.length > 0) {
      const roots = cats.filter((c) => !c.parent_id).map((c) => c.id);
      setExpandedIds(new Set(roots));
      setInitializedExpand(true);
    }
  });

  createEffect(() => {
    props.onRegisterNewTrigger?.(() => openNewCategory(null));
  });

  const tree = createMemo(() => buildCategoryTree(props.categories));

  const parentOptions = createMemo(() =>
    buildCategoryHierarchyOptions(props.categories, editingId()),
  );

  const transferOptions = createMemo(() =>
    buildCategoryHierarchyOptions(props.categories, deleteTarget()?.id ?? null),
  );

  const bulkMoveOptions = createMemo(() =>
    buildCategoryHierarchyOptions(props.categories),
  );

  const filteredTree = createMemo(() => {
    const q = normalizeCategoryText(search());
    const st = statusFilter();

    function matchesNode(node: AdminCategoryNode): boolean {
      const statusOk =
        st === "all" ||
        (st === "active" && node.is_active) ||
        (st === "inactive" && !node.is_active) ||
        (st === "menu" && node.is_active && node.show_in_menu);

      if (!statusOk) return false;
      if (!q) return true;
      return (
        normalizeCategoryText(node.name).includes(q) ||
        normalizeCategoryText(node.slug).includes(q) ||
        normalizeCategoryText(node.full_path || "").includes(q)
      );
    }

    function filterBranch(branch: CategoryTreeBranch): CategoryTreeBranch | null {
      const filteredChildren = branch.children
        .map(filterBranch)
        .filter((b): b is CategoryTreeBranch => b !== null);

      if (matchesNode(branch.node) || filteredChildren.length > 0) {
        return {
          ...branch,
          children: filteredChildren,
        };
      }
      return null;
    }

    return tree()
      .map(filterBranch)
      .filter((b): b is CategoryTreeBranch => b !== null);
  });

  const isExpanded = (id: number) =>
    Boolean(search().trim()) || expandedIds().has(id);

  function toggleExpand(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpandedIds(new Set(props.categories.map((c) => c.id)));
  }

  function collapseAll() {
    setExpandedIds(new Set<number>());
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function triggerHighlight(id: number) {
    setSavedHighlightId(id);
    setTimeout(() => {
      if (savedHighlightId() === id) setSavedHighlightId(null);
    }, 2000);
  }

  const currentSnapshot = () =>
    JSON.stringify([
      formName(),
      formSlug(),
      formParentId(),
      formDesc(),
      formImage(),
      formIcon(),
      formSortOrder(),
      formIsActive(),
      formShowInMenu(),
      formSeoTitle(),
      formSeoDesc(),
    ]);

  const isDirty = () => drawerOpen() && currentSnapshot() !== initialSnap();

  function openNewCategory(parentId: number | null) {
    const siblingCount = props.categories.filter(
      (c) => (c.parent_id ?? null) === parentId,
    ).length;
    const defaultOrder = String(siblingCount + 1);
    const parentStr = parentId ? String(parentId) : "";

    setEditingId(null);
    setFormName("");
    setFormSlug("");
    setSlugTouched(false);
    setFormParentId(parentStr);
    setFormDesc("");
    setFormImage("");
    setFormIcon("");
    setFormSortOrder(defaultOrder);
    setFormIsActive(true);
    setFormShowInMenu(true);
    setFormSeoTitle("");
    setFormSeoDesc("");
    setSeoOpen(false);
    setFieldErrors({});
    setGeneralError(null);
    setInitialSnap(
      JSON.stringify([
        "",
        "",
        parentStr,
        "",
        "",
        "",
        defaultOrder,
        true,
        true,
        "",
        "",
      ]),
    );
    setDrawerOpen(true);
  }

  function openEditCategory(cat: AdminCategoryNode) {
    const parentStr = cat.parent_id ? String(cat.parent_id) : "";
    const orderStr = String(cat.sort_order ?? 0);

    setEditingId(cat.id);
    setFormName(cat.name);
    setFormSlug(cat.slug);
    setSlugTouched(true);
    setFormParentId(parentStr);
    setFormDesc(cat.description || "");
    setFormImage(cat.image_path || "");
    setFormIcon(cat.icon || "");
    setFormSortOrder(orderStr);
    setFormIsActive(Boolean(cat.is_active));
    setFormShowInMenu(Boolean(cat.show_in_menu));
    setFormSeoTitle(cat.seo_title || "");
    setFormSeoDesc(cat.seo_description || "");
    setSeoOpen(Boolean(cat.seo_title || cat.seo_description));
    setFieldErrors({});
    setGeneralError(null);
    setInitialSnap(
      JSON.stringify([
        cat.name,
        cat.slug,
        parentStr,
        cat.description || "",
        cat.image_path || "",
        cat.icon || "",
        orderStr,
        Boolean(cat.is_active),
        Boolean(cat.show_in_menu),
        cat.seo_title || "",
        cat.seo_description || "",
      ]),
    );
    setDrawerOpen(true);
  }

  async function saveCategory(e: Event) {
    e.preventDefault();
    if (saving()) return;
    setFeedback(null);
    setErrorBanner(null);
    setFieldErrors({});
    setGeneralError(null);

    if (!formName().trim()) {
      setFieldErrors({ name: ["Informe o nome da categoria."] });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formName().trim(),
        slug: formSlug().trim() || undefined,
        parent_id: formParentId() ? Number(formParentId()) : null,
        description: formDesc().trim() || null,
        image_path: formImage().trim() || null,
        icon: formIcon().trim() || null,
        sort_order: Math.max(0, Number.parseInt(formSortOrder(), 10) || 0),
        is_active: formIsActive(),
        show_in_menu: formShowInMenu(),
        seo_title: formSeoTitle().trim() || null,
        seo_description: formSeoDesc().trim() || null,
      };

      let savedId = editingId();
      if (savedId) {
        await api(`/admin/categories/${savedId}`, {
          method: "PUT",
          body: payload,
        });
      } else {
        const res = await api<{ data: AdminCategoryNode }>(
          "/admin/categories",
          {
            method: "POST",
            body: payload,
          },
        );
        savedId = res.data.id;
      }

      if (payload.parent_id) {
        setExpandedIds((prev) => {
          const next = new Set(prev);
          next.add(payload.parent_id!);
          return next;
        });
      }

      setDrawerOpen(false);
      await props.onRefresh();
      if (savedId) triggerHighlight(savedId);
      setFeedback("Categoria salva com sucesso.");
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.validation ?? {});
        setGeneralError(err.message);
        if (firstError(err.validation, ["slug", "seo_title", "seo_description"])) {
          setSeoOpen(true);
        }
      } else {
        setGeneralError("Não foi possível salvar a categoria.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function quickToggle(
    cat: AdminCategoryNode,
    patch: { is_active?: boolean; show_in_menu?: boolean },
  ) {
    if (busyId()) return;
    setBusyId(cat.id);
    setErrorBanner(null);
    try {
      await api(`/admin/categories/${cat.id}`, {
        method: "PUT",
        body: {
          name: cat.name,
          parent_id: cat.parent_id,
          sort_order: cat.sort_order,
          is_active: patch.is_active ?? cat.is_active,
          show_in_menu: patch.show_in_menu ?? cat.show_in_menu,
        },
      });
      await props.onRefresh();
      triggerHighlight(cat.id);
    } catch (err) {
      setErrorBanner(
        err instanceof ApiError
          ? err.message
          : "Não foi possível atualizar o status da categoria.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function moveSiblingOrder(cat: AdminCategoryNode, direction: -1 | 1) {
    if (busyId()) return;
    const siblings = props.categories
      .filter((c) => (c.parent_id ?? null) === (cat.parent_id ?? null))
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pt-BR"));
    const idx = siblings.findIndex((s) => s.id === cat.id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= siblings.length) return;

    const reordered = [...siblings];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(swapIdx, 0, moved);

    const items = reordered.map((item, i) => ({
      id: item.id,
      parent_id: item.parent_id ?? null,
      sort_order: i + 1,
    }));

    setBusyId(cat.id);
    setErrorBanner(null);
    try {
      await api("/admin/categories/reorder", {
        method: "POST",
        body: { items },
      });
      await props.onRefresh();
      triggerHighlight(cat.id);
    } catch (err) {
      setErrorBanner(
        err instanceof ApiError
          ? err.message
          : "Não foi possível reordenar a categoria.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleDropOnNode(
    target: AdminCategoryNode,
    mode: "before" | "inside" | "after",
  ) {
    const sourceId = draggedCatId();
    setDraggedCatId(null);
    setDropTarget(null);
    if (!sourceId || sourceId === target.id) return;

    const source = props.categories.find((c) => c.id === sourceId);
    if (!source) return;

    // Prevent dropping onto own descendant
    const descendants = collectCategoryDescendantIds(props.categories, sourceId);
    if (descendants.has(target.id)) {
      setErrorBanner(
        "Não é possível mover uma categoria para dentro de suas próprias subcategorias.",
      );
      return;
    }

    let items: Array<{ id: number; parent_id: number | null; sort_order: number }>;

    if (mode === "inside") {
      const targetChildren = props.categories
        .filter((c) => c.parent_id === target.id && c.id !== sourceId)
        .sort((a, b) => a.sort_order - b.sort_order);
      items = [
        ...targetChildren.map((c, idx) => ({
          id: c.id,
          parent_id: target.id,
          sort_order: idx + 1,
        })),
        {
          id: sourceId,
          parent_id: target.id,
          sort_order: targetChildren.length + 1,
        },
      ];
      setExpandedIds((prev) => new Set([...prev, target.id]));
    } else {
      const destParentId = target.parent_id ?? null;
      const siblings = props.categories
        .filter((c) => (c.parent_id ?? null) === destParentId && c.id !== sourceId)
        .sort((a, b) => a.sort_order - b.sort_order);
      const targetIdx = siblings.findIndex((s) => s.id === target.id);
      const insertAt = mode === "before" ? Math.max(0, targetIdx) : targetIdx + 1;
      const nextSiblings = [...siblings];
      nextSiblings.splice(insertAt, 0, source);
      items = nextSiblings.map((c, idx) => ({
        id: c.id,
        parent_id: destParentId,
        sort_order: idx + 1,
      }));
    }

    setErrorBanner(null);
    try {
      await api("/admin/categories/reorder", {
        method: "POST",
        body: { items },
      });
      await props.onRefresh();
      triggerHighlight(sourceId);
      setFeedback("Hierarquia e ordem atualizadas.");
    } catch (err) {
      setErrorBanner(
        err instanceof ApiError
          ? err.message
          : "Não foi possível mover a categoria.",
      );
    }
  }

  async function openDeleteModal(cat: AdminCategoryNode) {
    setDeleteTarget(cat);
    setDeleteDeps(null);
    setDeleteErr(null);
    setTransferCatId("");
    setSubcatStrategy("promote_to_parent");
    setDeleteDepsLoading(true);
    try {
      const res = await api<{ data: CategoryDependenciesPayload }>(
        `/admin/categories/${cat.id}/dependencies`,
      );
      setDeleteDeps(res.data);
    } catch {
      setDeleteDeps({
        category_id: cat.id,
        category_name: cat.name,
        direct_products_count: cat.direct_products_count ?? cat.products_count ?? 0,
        subtree_products_count: cat.subtree_products_count ?? 0,
        children_count: cat.children_count ?? 0,
        children: [],
        can_delete_directly: false,
      });
    } finally {
      setDeleteDepsLoading(false);
    }
  }

  async function executeDelete(strategy: "block" | "deactivate" | "transfer") {
    const target = deleteTarget();
    if (!target || deleteBusy()) return;
    setDeleteErr(null);

    if (
      strategy === "transfer" &&
      (deleteDeps()?.direct_products_count ?? 0) > 0 &&
      !transferCatId()
    ) {
      setDeleteErr(
        "Selecione uma categoria de destino para transferir os produtos vinculados.",
      );
      return;
    }

    setDeleteBusy(true);
    try {
      const res = await api<{ message: string }>(
        `/admin/categories/${target.id}`,
        {
          method: "DELETE",
          body: {
            strategy,
            transfer_category_id: transferCatId()
              ? Number(transferCatId())
              : undefined,
            subcategory_strategy: subcatStrategy(),
          },
        },
      );
      setDeleteTarget(null);
      setSelectedIds((prev) => prev.filter((id) => id !== target.id));
      await props.onRefresh();
      setFeedback(res.message || "Operação concluída.");
    } catch (err) {
      setDeleteErr(
        err instanceof ApiError
          ? err.message
          : "Não foi possível concluir a operação.",
      );
    } finally {
      setDeleteBusy(false);
    }
  }

  async function runBulkAction(
    action: "activate" | "deactivate" | "show_in_menu" | "hide_from_menu" | "move_parent" | "delete",
    parentIdOverride?: number | null,
  ) {
    if (selectedIds().length === 0 || bulkBusy()) return;
    setBulkBusy(true);
    setErrorBanner(null);
    setFeedback(null);
    try {
      const res = await api<{ message: string }>("/admin/categories/bulk", {
        method: "POST",
        body: {
          category_ids: selectedIds(),
          action,
          ...(action === "move_parent" ? { parent_id: parentIdOverride ?? null } : {}),
        },
      });
      setBulkMoveOpen(false);
      setSelectedIds([]);
      await props.onRefresh();
      setFeedback(res.message);
    } catch (err) {
      setErrorBanner(
        err instanceof ApiError
          ? err.message
          : "Não foi possível aplicar a ação em massa.",
      );
    } finally {
      setBulkBusy(false);
    }
  }

  const renderBranch = (
    branch: CategoryTreeBranch,
    siblingIndex: number,
    siblingsCount: number,
  ) => {
    const cat = () => branch.node;
    const hasChildren = () => branch.children.length > 0;
    const expanded = () => isExpanded(cat().id);
    const isSelected = () => selectedIds().includes(cat().id);
    const prodCount = () => cat().direct_products_count ?? cat().products_count ?? 0;

    return (
      <li>
        <div
          draggable={true}
          onDragStart={(e) => {
            setDraggedCatId(cat().id);
            e.dataTransfer?.setData("text/plain", String(cat().id));
          }}
          onDragEnd={() => {
            setDraggedCatId(null);
            setDropTarget(null);
          }}
          onDragOver={(e) => {
            if (!draggedCatId() || draggedCatId() === cat().id) return;
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            const relY = (e.clientY - rect.top) / rect.height;
            const mode = relY < 0.28 ? "before" : relY > 0.72 ? "after" : "inside";
            setDropTarget({ id: cat().id, mode });
          }}
          onDragLeave={() => {
            if (dropTarget()?.id === cat().id) setDropTarget(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            const target = dropTarget();
            if (target && target.id === cat().id) {
              void handleDropOnNode(cat(), target.mode);
            }
          }}
          class={`group flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2.5 transition-colors hover:bg-zinc-50/90 sm:flex-nowrap sm:px-4 ${
            savedHighlightId() === cat().id ? "adm-row-saved" : ""
          } ${
            dropTarget()?.id === cat().id
              ? dropTarget()?.mode === "inside"
                ? "bg-[#f5ebf7] ring-1 ring-inset ring-[#93509e]"
                : dropTarget()?.mode === "before"
                  ? "border-t-2 border-t-[#93509e]"
                  : "border-b-2 border-b-[#93509e]"
              : ""
          }`}
          style={{
            "padding-left": `${Math.min(branch.depth, 4) * 20 + 12}px`,
          }}
        >
          {/* Left: Checkbox, Drag handle, Expand/Collapse, Info */}
          <div class="flex min-w-0 flex-1 items-center gap-2">
            <input
              type="checkbox"
              checked={isSelected()}
              aria-label={`Selecionar categoria ${cat().name}`}
              onChange={() => toggleSelect(cat().id)}
              class="h-4 w-4 shrink-0 rounded border-zinc-300 accent-[#93509e]"
            />

            <span
              title="Arraste para reordenar ou mover de nível"
              class="hidden cursor-grab text-zinc-300 hover:text-zinc-500 active:cursor-grabbing sm:inline-flex"
            >
              <GripVertical class="h-4 w-4" />
            </span>

            <Show
              when={hasChildren()}
              fallback={<span class="inline-block w-5 shrink-0" />}
            >
              <button
                type="button"
                aria-label={expanded() ? `Recolher ${cat().name}` : `Expandir ${cat().name}`}
                onClick={() => toggleExpand(cat().id)}
                class="inline-flex h-6 w-5 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-900"
              >
                <Show
                  when={expanded()}
                  fallback={<ChevronRight class="h-4 w-4" />}
                >
                  <ChevronDown class="h-4 w-4" />
                </Show>
              </button>
            </Show>

            <Show when={cat().image_path}>
              <img
                src={assetUrl(cat().image_path)}
                alt=""
                class="h-8 w-8 shrink-0 rounded-[6px] border border-zinc-200 bg-zinc-50 object-cover"
              />
            </Show>

            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span
                  class={`truncate text-sm ${
                    branch.depth === 0
                      ? "font-bold text-zinc-900"
                      : branch.depth === 1
                        ? "font-semibold text-zinc-800"
                        : "font-medium text-zinc-700"
                  }`}
                >
                  {cat().name}
                </span>

                <Show when={!cat().is_active}>
                  <span class="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                    Inativa
                  </span>
                </Show>

                <Show when={cat().is_active && !cat().show_in_menu}>
                  <span class="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
                    Fora do menu
                  </span>
                </Show>
              </div>

              <div class="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                <span class="truncate font-mono">/{cat().slug}</span>
                <span>·</span>
                <span class="adm-tabular">
                  {prodCount()} {prodCount() === 1 ? "produto" : "produtos"}
                </span>
                <Show when={hasChildren()}>
                  <span>·</span>
                  <span class="adm-tabular">{branch.children.length} sub</span>
                </Show>
              </div>
            </div>
          </div>

          {/* Right: Clean inline actions (responsive for desktop & mobile) */}
          <div class="flex shrink-0 items-center gap-1 pl-7 sm:pl-0">
            <button
              type="button"
              title="Subir na ordem"
              aria-label={`Subir ${cat().name}`}
              disabled={siblingIndex === 0 || busyId() === cat().id}
              onClick={() => void moveSiblingOrder(cat(), -1)}
              class="inline-flex h-7 w-7 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-25"
            >
              <ArrowUp class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Descer na ordem"
              aria-label={`Descer ${cat().name}`}
              disabled={siblingIndex >= siblingsCount - 1 || busyId() === cat().id}
              onClick={() => void moveSiblingOrder(cat(), 1)}
              class="inline-flex h-7 w-7 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-25"
            >
              <ArrowDown class="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              title={cat().show_in_menu ? "Ocultar do menu principal" : "Exibir no menu principal"}
              aria-label={cat().show_in_menu ? `Ocultar ${cat().name} do menu` : `Exibir ${cat().name} no menu`}
              disabled={busyId() === cat().id}
              onClick={() =>
                void quickToggle(cat(), { show_in_menu: !cat().show_in_menu })
              }
              class={`inline-flex h-7 w-7 items-center justify-center rounded transition-colors ${
                cat().show_in_menu
                  ? "text-[#93509e] hover:bg-[#f5ebf7]"
                  : "text-zinc-400 hover:bg-zinc-100"
              }`}
            >
              <Show when={cat().show_in_menu} fallback={<EyeOff class="h-3.5 w-3.5" />}>
                <Eye class="h-3.5 w-3.5" />
              </Show>
            </button>

            <button
              type="button"
              onClick={() =>
                void quickToggle(cat(), { is_active: !cat().is_active })
              }
              disabled={busyId() === cat().id}
              class={`rounded px-2 py-1 text-[11px] font-semibold transition-colors ${
                cat().is_active
                  ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {cat().is_active ? "Ativa" : "Inativa"}
            </button>

            <AdminButton
              size="sm"
              variant="ghost"
              title={`Adicionar subcategoria em ${cat().name}`}
              aria-label={`Nova subcategoria em ${cat().name}`}
              onClick={() => openNewCategory(cat().id)}
              class="h-7 px-2 text-xs text-zinc-700 hover:bg-[#f5ebf7] hover:text-[#62298d]"
            >
              <FolderPlus class="h-3.5 w-3.5" />
              <span class="hidden md:inline">Sub</span>
            </AdminButton>

            <AdminButton
              size="sm"
              variant="secondary"
              onClick={() => openEditCategory(cat())}
              class="h-7 px-2.5 text-xs"
            >
              <Pencil class="h-3.5 w-3.5" />
              <span class="hidden sm:inline">Editar</span>
            </AdminButton>

            <AdminButton
              size="sm"
              variant="ghost"
              aria-label={`Excluir categoria ${cat().name}`}
              onClick={() => void openDeleteModal(cat())}
              class="h-7 px-2 text-red-700 hover:bg-red-50 hover:text-red-800"
            >
              <Trash2 class="h-3.5 w-3.5" />
            </AdminButton>
          </div>
        </div>

        <Show when={hasChildren() && expanded()}>
          <ul>
            <For each={branch.children}>
              {(child, idx) => renderBranch(child, idx(), branch.children.length)}
            </For>
          </ul>
        </Show>
      </li>
    );
  };

  return (
    <div class="space-y-3">
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

      <Show when={errorBanner()}>
        <div
          role="alert"
          class="flex items-center justify-between gap-2 rounded-[8px] border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-800"
        >
          <span>{errorBanner()}</span>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            class="font-semibold underline"
          >
            Dispensar
          </button>
        </div>
      </Show>

      <AdminCard padding="none">
        {/* Toolbar */}
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
          <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <div class="relative min-w-[200px] flex-1 max-w-sm">
              <Search class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <input
                type="search"
                placeholder="Pesquisar categoria ou subcategoria..."
                value={search()}
                onInput={(e) => setSearch(e.currentTarget.value)}
                class="h-9 w-full rounded-[8px] border border-zinc-300 bg-white pl-8 pr-3 text-xs focus:border-[#93509e] focus:outline-none"
              />
            </div>

            <select
              aria-label="Filtrar categorias por status"
              value={statusFilter()}
              onChange={(e) =>
                setStatusFilter(
                  e.currentTarget.value as "all" | "active" | "inactive" | "menu",
                )
              }
              class="h-9 rounded-[8px] border border-zinc-300 bg-white px-2.5 text-xs text-zinc-800 focus:border-[#93509e] focus:outline-none"
            >
              <option value="all">Todas</option>
              <option value="active">Somente ativas</option>
              <option value="inactive">Somente inativas</option>
              <option value="menu">Exibidas no menu</option>
            </select>
          </div>

          <div class="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              disabled={saving()}
              onClick={async () => {
                if (saving()) return;
                setSaving(true);
                setFeedback(null);
                setErrorBanner(null);
                try {
                  const res = await api<{
                    message?: string;
                    data?: { created?: number; reused?: number };
                  }>("/admin/categories/seed-official", { method: "POST" });
                  await props.onRefresh();
                  setFeedback(
                    res.message ??
                      `Estrutura oficial sincronizada (${res.data?.created ?? 0} criada(s), ${res.data?.reused ?? 0} preservada(s)).`,
                  );
                } catch (err) {
                  setErrorBanner(
                    err instanceof ApiError
                      ? err.message
                      : "Não foi possível sincronizar a estrutura oficial.",
                  );
                } finally {
                  setSaving(false);
                }
              }}
              class="rounded border border-[#e4c6ea] bg-[#f5ebf7] px-2.5 py-1 font-semibold text-[#62298d] hover:bg-[#ecdaf0] disabled:opacity-50"
            >
              Carregar estrutura oficial
            </button>
            <button
              type="button"
              onClick={expandAll}
              class="rounded px-2 py-1 font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            >
              Expandir tudo
            </button>
            <button
              type="button"
              onClick={collapseAll}
              class="rounded px-2 py-1 font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            >
              Recolher
            </button>
            <span class="adm-tabular text-zinc-500">
              {props.categories.length} categoria(s)
            </span>
          </div>
        </div>

        {/* Tree List */}
        <Show
          when={filteredTree().length > 0}
          fallback={
            <div class="flex flex-col items-center gap-2 px-6 py-12 text-center text-xs text-zinc-500">
              <FolderTree class="h-7 w-7 text-zinc-300" />
              <p>Nenhuma categoria encontrada para o filtro atual.</p>
              <div class="flex gap-2">
                <Show when={search() || statusFilter() !== "all"}>
                  <AdminButton
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setSearch("");
                      setStatusFilter("all");
                    }}
                  >
                    Limpar filtros
                  </AdminButton>
                </Show>
                <AdminButton
                  size="sm"
                  variant="primary"
                  onClick={() => openNewCategory(null)}
                >
                  <Plus class="h-3.5 w-3.5" />
                  Nova categoria
                </AdminButton>
              </div>
            </div>
          }
        >
          <ul>
            <For each={filteredTree()}>
              {(branch, idx) => renderBranch(branch, idx(), filteredTree().length)}
            </For>
          </ul>
        </Show>
      </AdminCard>

      {/* Sticky Bulk Action Bar */}
      <Show when={selectedIds().length > 0}>
        <div class="sticky bottom-3 z-30 flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[#e4c6ea] bg-white px-4 py-2.5 text-xs shadow-lg">
          <div class="flex items-center gap-2">
            <span class="rounded bg-[#93509e] px-2 py-0.5 font-bold text-white">
              {selectedIds().length} selecionada(s)
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              class="font-medium text-zinc-600 underline hover:text-zinc-900"
            >
              Limpar
            </button>
          </div>

          <div class="flex flex-wrap items-center gap-1.5">
            <AdminButton
              size="sm"
              variant="secondary"
              disabled={bulkBusy()}
              onClick={() => void runBulkAction("activate")}
            >
              Ativar
            </AdminButton>
            <AdminButton
              size="sm"
              variant="secondary"
              disabled={bulkBusy()}
              onClick={() => void runBulkAction("deactivate")}
            >
              Desativar
            </AdminButton>
            <AdminButton
              size="sm"
              variant="secondary"
              disabled={bulkBusy()}
              onClick={() => void runBulkAction("show_in_menu")}
            >
              Exibir no menu
            </AdminButton>
            <AdminButton
              size="sm"
              variant="secondary"
              disabled={bulkBusy()}
              onClick={() => void runBulkAction("hide_from_menu")}
            >
              Ocultar do menu
            </AdminButton>
            <AdminButton
              size="sm"
              variant="secondary"
              disabled={bulkBusy()}
              onClick={() => {
                setBulkMoveParentId("");
                setBulkMoveOpen(true);
              }}
            >
              Mover pai
            </AdminButton>
            <AdminButton
              size="sm"
              variant="ghost"
              disabled={bulkBusy()}
              onClick={() => void runBulkAction("delete")}
              class="border border-red-200 text-red-700 hover:bg-red-50"
            >
              Excluir sem vínculo
            </AdminButton>
          </div>
        </div>
      </Show>

      {/* Create / Edit Side Drawer */}
      <AdminSideDrawer
        open={drawerOpen()}
        title={editingId() ? "Editar categoria" : "Nova categoria"}
        subtitle={
          editingId()
            ? formName()
            : formParentId()
              ? "Nova subcategoria vinculada à hierarquia"
              : "Defina departamento ou subcategoria"
        }
        isDirty={isDirty()}
        onClose={() => setDrawerOpen(false)}
        footer={
          <>
            <AdminButton
              variant="secondary"
              onClick={() => setDrawerOpen(false)}
            >
              Cancelar
            </AdminButton>
            <AdminButton
              type="submit"
              form="adm-cat-form"
              variant="primary"
              loading={saving()}
              loadingLabel="Salvando…"
            >
              {editingId() ? "Atualizar categoria" : "Salvar categoria"}
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
          <Show when={generalError()}>
            <div
              role="alert"
              class="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800"
            >
              {generalError()}
            </div>
          </Show>

          <AdminField
            label="Nome da categoria"
            forId="cat-name-input"
            required
            error={firstError(fieldErrors(), ["name"])}
          >
            <AdminInput
              id="cat-name-input"
              data-autofocus
              type="text"
              required
              placeholder="Ex.: Brocas Diamantadas"
              value={formName()}
              hasError={Boolean(firstError(fieldErrors(), ["name"]))}
              onInput={(e) => {
                const v = e.currentTarget.value;
                setFormName(v);
                if (!editingId() && !slugTouched()) {
                  setFormSlug(slugifyCategoryName(v));
                }
              }}
            />
          </AdminField>

          <AdminCombobox
            label="Categoria pai (opcional)"
            placeholder="Categoria principal (nível raiz)"
            searchPlaceholder="Buscar categoria pai..."
            value={formParentId()}
            options={parentOptions()}
            onChange={(val) => setFormParentId(val)}
            error={firstError(fieldErrors(), ["parent_id"])}
          />

          <AdminField
            label="Slug amigável"
            forId="cat-slug-input"
            hint="Gerado automaticamente a partir do nome; pode ser editado."
            error={firstError(fieldErrors(), ["slug"])}
          >
            <AdminInput
              id="cat-slug-input"
              type="text"
              mono
              placeholder="brocas-diamantadas"
              value={formSlug()}
              hasError={Boolean(firstError(fieldErrors(), ["slug"]))}
              onInput={(e) => {
                setSlugTouched(true);
                setFormSlug(e.currentTarget.value);
              }}
            />
          </AdminField>

          <div class="grid grid-cols-2 gap-3">
            <AdminField
              label="Ordem de exibição"
              forId="cat-order-input"
              error={firstError(fieldErrors(), ["sort_order"])}
            >
              <AdminInput
                id="cat-order-input"
                type="number"
                min="0"
                value={formSortOrder()}
                onInput={(e) => setFormSortOrder(e.currentTarget.value)}
              />
            </AdminField>

            <AdminSelect
              label="Ícone (opcional)"
              value={formIcon()}
              onChange={(val) => setFormIcon(val)}
              options={ICON_OPTIONS}
            />
          </div>

          <div class="flex flex-wrap gap-4 rounded-[8px] border border-zinc-200 bg-zinc-50/70 px-3.5 py-2.5 text-xs">
            <label class="inline-flex items-center gap-2 font-medium text-zinc-800">
              <input
                type="checkbox"
                checked={formIsActive()}
                onChange={(e) => setFormIsActive(e.currentTarget.checked)}
                class="accent-[#93509e]"
              />
              Categoria ativa
            </label>
            <label class="inline-flex items-center gap-2 font-medium text-zinc-800">
              <input
                type="checkbox"
                checked={formShowInMenu()}
                onChange={(e) => setFormShowInMenu(e.currentTarget.checked)}
                class="accent-[#93509e]"
              />
              Exibir no menu principal
            </label>
          </div>

          <AdminField
            label="Descrição (opcional)"
            forId="cat-desc-input"
            error={firstError(fieldErrors(), ["description"])}
          >
            <AdminTextarea
              id="cat-desc-input"
              rows={2}
              placeholder="Breve descrição exibida na página da categoria..."
              value={formDesc()}
              onInput={(e) => setFormDesc(e.currentTarget.value)}
            />
          </AdminField>

          <AdminImageUpload
            label="Imagem representativa (opcional)"
            folder="catalog"
            value={formImage()}
            onChange={(next) => setFormImage(next)}
            error={firstError(fieldErrors(), ["image_path"])}
          />

          <div class="rounded-[8px] border border-zinc-200 bg-zinc-50/70">
            <button
              type="button"
              aria-expanded={seoOpen()}
              onClick={() => setSeoOpen((v) => !v)}
              class="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs font-semibold text-zinc-800"
            >
              <span>SEO (título e meta description)</span>
              <ChevronDown
                class={`h-4 w-4 text-zinc-500 transition-transform ${
                  seoOpen() ? "rotate-180" : ""
                }`}
              />
            </button>
            <Show when={seoOpen()}>
              <div class="space-y-3 border-t border-zinc-200 px-3.5 py-3">
                <AdminField
                  label="Título SEO"
                  forId="cat-seo-title"
                  error={firstError(fieldErrors(), ["seo_title"])}
                >
                  <AdminInput
                    id="cat-seo-title"
                    type="text"
                    placeholder={
                      formName() ? `${formName()} | Mistura Feminina` : "Título SEO"
                    }
                    value={formSeoTitle()}
                    onInput={(e) => setFormSeoTitle(e.currentTarget.value)}
                  />
                </AdminField>

                <AdminField
                  label="Meta description"
                  forId="cat-seo-desc"
                  error={firstError(fieldErrors(), ["seo_description"])}
                >
                  <AdminTextarea
                    id="cat-seo-desc"
                    rows={2}
                    placeholder="Resumo para mecanismos de busca..."
                    value={formSeoDesc()}
                    onInput={(e) => setFormSeoDesc(e.currentTarget.value)}
                  />
                </AdminField>
              </div>
            </Show>
          </div>
        </form>
      </AdminSideDrawer>

      {/* Safe Deletion Modal with Dependency Options */}
      <AdminModal
        open={Boolean(deleteTarget())}
        title={`Excluir "${deleteTarget()?.name ?? ""}"`}
        subtitle="Verificação de produtos e subcategorias vinculados"
        onClose={() => {
          setDeleteTarget(null);
          setDeleteErr(null);
        }}
        footer={
          <>
            <AdminButton
              variant="secondary"
              onClick={() => setDeleteTarget(null)}
            >
              Cancelar
            </AdminButton>
            <Show
              when={deleteDeps()?.can_delete_directly}
              fallback={
                <>
                  <AdminButton
                    variant="secondary"
                    loading={deleteBusy()}
                    onClick={() => void executeDelete("deactivate")}
                  >
                    Desativar em vez de excluir
                  </AdminButton>
                  <AdminButton
                    variant="danger"
                    loading={deleteBusy()}
                    onClick={() => void executeDelete("transfer")}
                  >
                    Transferir e excluir
                  </AdminButton>
                </>
              }
            >
              <AdminButton
                variant="danger"
                loading={deleteBusy()}
                onClick={() => void executeDelete("block")}
              >
                Excluir categoria
              </AdminButton>
            </Show>
          </>
        }
      >
        <div class="space-y-3 text-xs text-zinc-700">
          <Show when={deleteErr()}>
            <div
              role="alert"
              class="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 font-medium text-red-800"
            >
              {deleteErr()}
            </div>
          </Show>

          <Show when={deleteDepsLoading()}>
            <p class="py-3 text-zinc-500">Verificando dependências…</p>
          </Show>

          <Show when={!deleteDepsLoading() && deleteDeps()}>
            {(deps) => (
              <Show
                when={!deps().can_delete_directly}
                fallback={
                  <p>
                    Esta categoria não possui produtos nem subcategorias vinculados e pode ser excluída com segurança.
                  </p>
                }
              >
                <div class="space-y-3">
                  <div class="rounded-[8px] border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-amber-950">
                    <p class="font-semibold">Dependências encontradas</p>
                    <p class="mt-0.5">
                      • <strong>{deps().direct_products_count}</strong> produto(s) vinculado(s) diretamente
                    </p>
                    <p>
                      • <strong>{deps().children_count}</strong> subcategoria(s) filha(s)
                    </p>
                    <p class="mt-1 text-[11px] text-amber-800">
                      Nenhum produto será excluído. Escolha desativar a categoria ou transferir os vínculos antes de excluir.
                    </p>
                  </div>

                  <Show when={deps().direct_products_count > 0}>
                    <AdminCombobox
                      label="Transferir produtos para outra categoria"
                      placeholder="Selecione a categoria de destino..."
                      searchPlaceholder="Buscar categoria de destino..."
                      value={transferCatId()}
                      options={transferOptions()}
                      onChange={(val) => setTransferCatId(val)}
                    />
                  </Show>

                  <Show when={deps().children_count > 0}>
                    <AdminSelect
                      label="Destino das subcategorias"
                      value={subcatStrategy()}
                      onChange={(val) =>
                        setSubcatStrategy(
                          val as "promote_to_parent" | "move_to_target",
                        )
                      }
                      options={[
                        {
                          value: "promote_to_parent",
                          label: "Promover subcategorias para o nível superior",
                        },
                        ...(transferCatId()
                          ? [
                              {
                                value: "move_to_target",
                                label:
                                  "Mover subcategorias para a categoria de destino",
                              },
                            ]
                          : []),
                      ]}
                    />
                  </Show>
                </div>
              </Show>
            )}
          </Show>
        </div>
      </AdminModal>

      {/* Bulk Move Parent Modal */}
      <AdminModal
        open={bulkMoveOpen()}
        title="Alterar categoria pai em massa"
        subtitle={`${selectedIds().length} categoria(s) selecionada(s)`}
        onClose={() => setBulkMoveOpen(false)}
        footer={
          <>
            <AdminButton
              variant="secondary"
              onClick={() => setBulkMoveOpen(false)}
            >
              Cancelar
            </AdminButton>
            <AdminButton
              variant="primary"
              loading={bulkBusy()}
              onClick={() =>
                void runBulkAction(
                  "move_parent",
                  bulkMoveParentId() ? Number(bulkMoveParentId()) : null,
                )
              }
            >
              Confirmar movimentação
            </AdminButton>
          </>
        }
      >
        <AdminCombobox
          label="Nova categoria pai"
          placeholder="Nível raiz (categoria principal)"
          searchPlaceholder="Buscar categoria pai..."
          value={bulkMoveParentId()}
          options={bulkMoveOptions()}
          onChange={(val) => setBulkMoveParentId(val)}
        />
      </AdminModal>
    </div>
  );
}
