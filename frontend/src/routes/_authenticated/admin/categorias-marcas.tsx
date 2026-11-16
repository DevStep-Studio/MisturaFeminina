import { createFileRoute } from "@tanstack/solid-router";
import { For, Show, createResource, createSignal } from "solid-js";
import { AdminLayout } from "../../../features/admin/AdminLayout";
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
  logo_path: string | null;
  is_featured: boolean;
  is_active: boolean;
}

function AdminCategoriesBrandsPage() {
  const [catName, setCatName] = createSignal("");
  const [catParentId, setCatParentId] = createSignal("");
  const [catImage, setCatImage] = createSignal("");
  const [catDesc, setCatDesc] = createSignal("");
  const [catSeoTitle, setCatSeoTitle] = createSignal("");
  const [catSeoDesc, setCatSeoDesc] = createSignal("");
  const [brandName, setBrandName] = createSignal("");
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

  async function createCategory(e: Event) {
    e.preventDefault();
    setFeedback(null);
    try {
      await api("/admin/categories", {
        method: "POST",
        body: {
          name: catName().trim(),
          parent_id: catParentId() ? Number(catParentId()) : null,
          description: catDesc().trim() || undefined,
          seo_title: catSeoTitle().trim() || undefined,
          seo_description: catSeoDesc().trim() || undefined,
          image_path: catImage().trim() || undefined,
          show_in_menu: true,
          is_active: true,
        },
      });
      setCatName("");
      setCatImage("");
      setCatDesc("");
      setCatSeoTitle("");
      setCatSeoDesc("");
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

  async function createBrand(e: Event) {
    e.preventDefault();
    setFeedback(null);
    try {
      await api("/admin/brands", {
        method: "POST",
        body: {
          name: brandName().trim(),
          logo_path: brandLogo().trim() || undefined,
          is_featured: brandFeatured(),
          is_active: true,
        },
      });
      setBrandName("");
      setBrandLogo("");
      await refetchBrands();
      setFeedback("Marca cadastrada com sucesso.");
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
            onSubmit={createCategory}
            class="space-y-2.5 rounded-lg border border-zinc-200 bg-zinc-50 p-3.5 text-sm"
          >
            <input
              type="text"
              required
              placeholder="Nome da categoria *"
              value={catName()}
              onInput={(e) => setCatName(e.currentTarget.value)}
              class="h-9 w-full rounded-md border border-zinc-300 bg-white px-3"
            />
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
                placeholder={catName() ? `${catName()} | Mistura Feminina` : "Título SEO"}
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
            <button
              type="submit"
              class="h-9 rounded-md bg-[var(--mf-primary)] px-4 text-xs font-bold text-white"
            >
              Adicionar categoria
            </button>
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
                  <button
                    type="button"
                    onClick={() => void deleteCategory(cat.id)}
                    class="text-xs font-semibold text-red-700 hover:underline"
                  >
                    Remover
                  </button>
                </li>
              )}
            </For>
          </ul>
        </section>

        {/* Brands */}
        <section class="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
          <h2 class="text-base font-bold text-zinc-900">Marcas</h2>

          <form
            onSubmit={createBrand}
            class="space-y-2.5 rounded-lg border border-zinc-200 bg-zinc-50 p-3.5 text-sm"
          >
            <input
              type="text"
              required
              placeholder="Nome da marca *"
              value={brandName()}
              onInput={(e) => setBrandName(e.currentTarget.value)}
              class="h-9 w-full rounded-md border border-zinc-300 bg-white px-3"
            />
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
            <button
              type="submit"
              class="h-9 rounded-md bg-zinc-900 px-4 text-xs font-bold text-white"
            >
              Adicionar marca
            </button>
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
                  <Show when={b.is_featured}>
                    <span class="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                      Destaque
                    </span>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </section>
      </div>
    </AdminLayout>
  );
}
