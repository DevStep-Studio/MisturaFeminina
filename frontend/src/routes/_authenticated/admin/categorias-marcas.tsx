import { createFileRoute } from "@tanstack/solid-router";
import { For, Show, createResource, createSignal } from "solid-js";
import { AdminLayout } from "../../../features/admin/AdminLayout";
import { AdminAttributesManager } from "../../../features/admin/AdminAttributesManager";
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

function AdminCategoriesBrandsPage() {
  const [editingCatId, setEditingCatId] = createSignal<number | null>(null);
  const [catName, setCatName] = createSignal("");
  const [catSlug, setCatSlug] = createSignal("");
  const [catParentId, setCatParentId] = createSignal("");
  const [catImage, setCatImage] = createSignal("");
  const [catDesc, setCatDesc] = createSignal("");
  const [catSeoTitle, setCatSeoTitle] = createSignal("");
  const [catSeoDesc, setCatSeoDesc] = createSignal("");

  const [editingBrandId, setEditingBrandId] = createSignal<number | null>(null);
  const [brandName, setBrandName] = createSignal("");
  const [brandSlug, setBrandSlug] = createSignal("");
  const [brandDesc, setBrandDesc] = createSignal("");
  const [brandSeoTitle, setBrandSeoTitle] = createSignal("");
  const [brandSeoDesc, setBrandSeoDesc] = createSignal("");
  const [brandLogo, setBrandLogo] = createSignal("");
  const [brandFeatured, setBrandFeatured] = createSignal(true);
  const [feedback, setFeedback] = createSignal<string | null>(null);

  const [categories, { refetch: refetchCats }] = createResource(async () => {
    const res = await api<{ data: AdminCategory[] }>("/admin/categories");
    return res.data ?? [];
  });

  const [brands, { refetch: refetchBrands }] = createResource(async () => {
    const res = await api<{ data: AdminBrand[] }>("/admin/brands");
    return res.data ?? [];
  });

  async function uploadAsset(file: File, setter: (path: string) => void) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("folder", "catalog");
    const res = await api<{ data: { path: string } }>("/admin/media/upload", {
      method: "POST",
      body: fd,
    });
    setter(res.data.path);
  }

  function resetCategoryForm() {
    setEditingCatId(null);
    setCatName("");
    setCatSlug("");
    setCatParentId("");
    setCatImage("");
    setCatDesc("");
    setCatSeoTitle("");
    setCatSeoDesc("");
  }

  function editCategory(cat: AdminCategory) {
    setEditingCatId(cat.id);
    setCatName(cat.name);
    setCatSlug(cat.slug);
    setCatParentId(cat.parent_id ? String(cat.parent_id) : "");
    setCatImage(cat.image_path || "");
    setCatDesc(cat.description || "");
    setCatSeoTitle(cat.seo_title || "");
    setCatSeoDesc(cat.seo_description || "");
  }

  async function saveCategory(e: Event) {
    e.preventDefault();
    setFeedback(null);
    try {
      const payload = {
        name: catName().trim(),
        slug: catSlug().trim() || undefined,
        parent_id: catParentId() ? Number(catParentId()) : null,
        description: catDesc().trim() || undefined,
        seo_title: catSeoTitle().trim() || undefined,
        seo_description: catSeoDesc().trim() || undefined,
        image_path: catImage().trim() || undefined,
        show_in_menu: true,
        is_active: true,
      };
      if (editingCatId()) {
        await api(`/admin/categories/${editingCatId()}`, {
          method: "PUT",
          body: payload,
        });
      } else {
        await api("/admin/categories", { method: "POST", body: payload });
      }
      resetCategoryForm();
      await refetchCats();
      setFeedback("Categoria salva com sucesso.");
    } catch (err) {
      setFeedback(
        err instanceof ApiError ? err.message : "Erro ao salvar categoria.",
      );
    }
  }

  async function deleteCategory(id: number) {
    await api(`/admin/categories/${id}`, { method: "DELETE" });
    await refetchCats();
  }

  function resetBrandForm() {
    setEditingBrandId(null);
    setBrandName("");
    setBrandSlug("");
    setBrandDesc("");
    setBrandSeoTitle("");
    setBrandSeoDesc("");
    setBrandLogo("");
    setBrandFeatured(true);
  }

  function editBrand(b: AdminBrand) {
    setEditingBrandId(b.id);
    setBrandName(b.name);
    setBrandSlug(b.slug);
    setBrandDesc(b.description || "");
    setBrandSeoTitle(b.seo_title || "");
    setBrandSeoDesc(b.seo_description || "");
    setBrandLogo(b.logo_path || "");
    setBrandFeatured(b.is_featured);
  }

  async function saveBrand(e: Event) {
    e.preventDefault();
    setFeedback(null);
    try {
      const payload = {
        name: brandName().trim(),
        slug: brandSlug().trim() || undefined,
        description: brandDesc().trim() || undefined,
        seo_title: brandSeoTitle().trim() || undefined,
        seo_description: brandSeoDesc().trim() || undefined,
        logo_path: brandLogo().trim() || undefined,
        is_featured: brandFeatured(),
        is_active: true,
      };
      if (editingBrandId()) {
        await api(`/admin/brands/${editingBrandId()}`, {
          method: "PUT",
          body: payload,
        });
      } else {
        await api("/admin/brands", { method: "POST", body: payload });
      }
      resetBrandForm();
      await refetchBrands();
      setFeedback("Marca salva com sucesso.");
    } catch (err) {
      setFeedback(
        err instanceof ApiError ? err.message : "Erro ao salvar marca.",
      );
    }
  }

  return (
    <AdminLayout
      title="Categorias e Marcas"
      subtitle="Estruture departamentos do menu e gerencie marcas parceiras"
      permission="catalog.view"
    >
      <Show when={feedback()}>
        <p
          role="status"
          class="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800"
        >
          {feedback()}
        </p>
      </Show>

      <div class="grid gap-6 lg:grid-cols-2">
        {/* Categories */}
        <section class="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
          <h2 class="text-base font-bold text-zinc-900">Categorias</h2>

          <form
            onSubmit={saveCategory}
            class="space-y-2.5 rounded-lg border border-zinc-200 bg-zinc-50 p-3.5 text-sm"
          >
            <div class="grid gap-2 sm:grid-cols-2">
              <input
                type="text"
                required
                placeholder="Nome da categoria *"
                value={catName()}
                onInput={(e) => setCatName(e.currentTarget.value)}
                class="h-9 w-full rounded-md border border-zinc-300 bg-white px-3"
              />
              <input
                type="text"
                placeholder="Slug da URL (opcional)"
                value={catSlug()}
                onInput={(e) => setCatSlug(e.currentTarget.value)}
                class="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-xs"
              />
            </div>
            <div class="grid gap-2 sm:grid-cols-2">
              <select
                value={catParentId()}
                onChange={(e) => setCatParentId(e.currentTarget.value)}
                class="h-9 rounded-md border border-zinc-300 bg-white px-2.5 text-xs"
              >
                <option value="">Categoria principal (raiz)</option>
                <For each={(categories() ?? []).filter((c) => !c.parent_id)}>
                  {(c) => (
                    <option value={c.id}>Subcategoria de: {c.name}</option>
                  )}
                </For>
              </select>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  if (file) void uploadAsset(file, setCatImage);
                }}
                class="text-xs"
              />
            </div>
            <textarea
              rows={2}
              placeholder="Descrição da categoria (aparece no topo da página e ajuda no SEO)"
              value={catDesc()}
              onInput={(e) => setCatDesc(e.currentTarget.value)}
              class="w-full rounded-md border border-zinc-300 bg-white p-2 text-xs"
            />
            <div class="grid gap-2 sm:grid-cols-2">
              <input
                type="text"
                placeholder={
                  catName() ? `${catName()} | Mistura Feminina` : "Título SEO"
                }
                value={catSeoTitle()}
                onInput={(e) => setCatSeoTitle(e.currentTarget.value)}
                class="h-9 rounded-md border border-zinc-300 bg-white px-2.5 text-xs"
              />
              <input
                type="text"
                placeholder="Meta description personalizada"
                value={catSeoDesc()}
                onInput={(e) => setCatSeoDesc(e.currentTarget.value)}
                class="h-9 rounded-md border border-zinc-300 bg-white px-2.5 text-xs"
              />
            </div>
            <div class="flex items-center gap-2">
              <button
                type="submit"
                class="h-9 rounded-md bg-[var(--mf-primary)] px-4 text-xs font-bold text-white"
              >
                {editingCatId() ? "Atualizar categoria" : "Adicionar categoria"}
              </button>
              <Show when={editingCatId()}>
                <button
                  type="button"
                  onClick={resetCategoryForm}
                  class="h-9 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700"
                >
                  Cancelar
                </button>
              </Show>
            </div>
          </form>

          <ul class="divide-y divide-zinc-100 text-sm">
            <For each={categories() ?? []}>
              {(cat) => (
                <li class="flex items-center justify-between py-2.5">
                  <div class="flex items-center gap-2.5">
                    <img
                      src={assetUrl(cat.image_path)}
                      alt={cat.name}
                      class="h-9 w-9 rounded-md border border-zinc-200 object-cover"
                    />
                    <div>
                      <p class="font-semibold text-zinc-900">{cat.name}</p>
                      <p class="text-xs text-zinc-500">/{cat.slug}</p>
                    </div>
                  </div>
                  <div class="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => editCategory(cat)}
                      class="text-xs font-semibold text-[var(--mf-primary)] hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteCategory(cat.id)}
                      class="text-xs font-semibold text-red-700 hover:underline"
                    >
                      Remover
                    </button>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </section>

        {/* Brands */}
        <section class="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
          <h2 class="text-base font-bold text-zinc-900">Marcas</h2>

          <form
            onSubmit={saveBrand}
            class="space-y-2.5 rounded-lg border border-zinc-200 bg-zinc-50 p-3.5 text-sm"
          >
            <div class="grid gap-2 sm:grid-cols-2">
              <input
                type="text"
                required
                placeholder="Nome da marca *"
                value={brandName()}
                onInput={(e) => setBrandName(e.currentTarget.value)}
                class="h-9 w-full rounded-md border border-zinc-300 bg-white px-3"
              />
              <input
                type="text"
                placeholder="Slug da URL (opcional)"
                value={brandSlug()}
                onInput={(e) => setBrandSlug(e.currentTarget.value)}
                class="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-xs"
              />
            </div>
            <textarea
              rows={2}
              placeholder="Descrição da marca (aparece na página da marca e ajuda no SEO)"
              value={brandDesc()}
              onInput={(e) => setBrandDesc(e.currentTarget.value)}
              class="w-full rounded-md border border-zinc-300 bg-white p-2 text-xs"
            />
            <div class="grid gap-2 sm:grid-cols-2">
              <input
                type="text"
                placeholder={
                  brandName()
                    ? `${brandName()} | Mistura Feminina`
                    : "Título SEO"
                }
                value={brandSeoTitle()}
                onInput={(e) => setBrandSeoTitle(e.currentTarget.value)}
                class="h-9 rounded-md border border-zinc-300 bg-white px-2.5 text-xs"
              />
              <input
                type="text"
                placeholder="Meta description personalizada"
                value={brandSeoDesc()}
                onInput={(e) => setBrandSeoDesc(e.currentTarget.value)}
                class="h-9 rounded-md border border-zinc-300 bg-white px-2.5 text-xs"
              />
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <label class="inline-flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={brandFeatured()}
                  onChange={(e) => setBrandFeatured(e.currentTarget.checked)}
                />
                Destaque na home
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  if (file) void uploadAsset(file, setBrandLogo);
                }}
                class="text-xs"
              />
            </div>
            <div class="flex items-center gap-2">
              <button
                type="submit"
                class="h-9 rounded-md bg-zinc-900 px-4 text-xs font-bold text-white"
              >
                {editingBrandId() ? "Atualizar marca" : "Adicionar marca"}
              </button>
              <Show when={editingBrandId()}>
                <button
                  type="button"
                  onClick={resetBrandForm}
                  class="h-9 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700"
                >
                  Cancelar
                </button>
              </Show>
            </div>
          </form>

          <ul class="divide-y divide-zinc-100 text-sm">
            <For each={brands() ?? []}>
              {(b) => (
                <li class="flex items-center justify-between py-2.5">
                  <div class="flex items-center gap-3">
                    <img
                      src={assetUrl(b.logo_path)}
                      alt={b.name}
                      class="h-8 w-16 rounded border border-zinc-200 bg-zinc-50 object-contain p-1"
                    />
                    <div>
                      <p class="font-semibold text-zinc-900">{b.name}</p>
                      <p class="text-xs text-zinc-500">/{b.slug}</p>
                    </div>
                  </div>
                  <div class="flex items-center gap-3">
                    <Show when={b.is_featured}>
                      <span class="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                        Destaque
                      </span>
                    </Show>
                    <button
                      type="button"
                      onClick={() => editBrand(b)}
                      class="text-xs font-semibold text-[var(--mf-primary)] hover:underline"
                    >
                      Editar
                    </button>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </section>
      </div>

      <AdminAttributesManager
        categories={categories() ?? []}
        onRefreshCategories={() => {
          void refetchCats();
        }}
      />
    </AdminLayout>
  );
}
