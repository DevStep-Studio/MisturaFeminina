import { createFileRoute } from "@tanstack/solid-router";
import ExternalLink from "lucide-solid/icons/external-link";
import Percent from "lucide-solid/icons/percent";
import Star from "lucide-solid/icons/star";
import Trash2 from "lucide-solid/icons/trash";
import { For, Show, createResource, createSignal } from "solid-js";
import { AdminLayout } from "../../../features/admin/AdminLayout";
import { AdminRestockAnalyticsPanel } from "../../../features/admin/AdminRestockAnalyticsPanel";
import {
  AdminVariantsEditor,
  type AdminVariantDraft,
} from "../../../features/admin/AdminVariantsEditor";
import { ApiError, api } from "../../../lib/api";
import { assetUrl, formatCents } from "../../../lib/format";
import { seoHead, site } from "../../../lib/seo";

export const Route = createFileRoute("/_authenticated/admin/produtos")({
  head: () =>
    seoHead({
      title: "Produtos e Estoque — Admin Mistura Feminina",
      description:
        "Cadastro completo de produtos, variantes, estoque, CSV e avaliações.",
      path: "/admin/produtos",
      noindex: true,
    }),
  component: AdminProductsPage,
});

interface AdminProductRow {
  id: number;
  name: string;
  slug: string;
  sku: string;
  price_cents: number;
  promo_price_cents: number | null;
  weight_grams: number;
  short_description: string | null;
  description: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  brand_id: number | null;
  is_active: boolean;
  is_featured: boolean;
  is_new_arrival: boolean;
  brand?: { id: number; name: string } | null;
  categories?: { id: number; name: string }[];
  images?: {
    id: number;
    path: string;
    alt_text: string | null;
    is_primary?: boolean;
  }[];
  wholesale_group_variants?: boolean;
  attribute_values?: { id: number; value: string }[];
  variants?: {
    id: number;
    sku: string;
    name: string;
    shade_code?: string | null;
    color_family?: string | null;
    color_hex?: string | null;
    price_cents: number;
    promo_price_cents?: number | null;
    stock_qty: number;
    reserved_qty: number;
    sort_order?: number;
    is_default?: boolean;
    is_active?: boolean;
  }[];
}

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
  const [tab, setTab] = createSignal<
    "produtos" | "avaliacoes" | "avisos" | "csv"
  >("produtos");
  const [search, setSearch] = createSignal("");
  const [editingId, setEditingId] = createSignal<number | null>(null);
  const [name, setName] = createSignal("");
  const [slug, setSlug] = createSignal("");
  const [sku, setSku] = createSignal("");
  const [wholesaleGroupVariants, setWholesaleGroupVariants] =
    createSignal(true);
  const [selectedAttrValueIds, setSelectedAttrValueIds] = createSignal<
    number[]
  >([]);
  const [variantsDraft, setVariantsDraft] = createSignal<AdminVariantDraft[]>(
    [],
  );

  const [availableAttributes] = createResource(async () => {
    const res = await api<{
      data: Array<{
        id: number;
        name: string;
        values: Array<{ id: number; value: string }>;
      }>;
    }>("/admin/attributes");
    return res.data || [];
  });

  function toggleAttrValueId(valId: number) {
    setSelectedAttrValueIds((prev) =>
      prev.includes(valId)
        ? prev.filter((id) => id !== valId)
        : [...prev, valId],
    );
  }
  const [brandId, setBrandId] = createSignal("");
  const [selectedCats, setSelectedCats] = createSignal<number[]>([]);
  const [priceBrl, setPriceBrl] = createSignal("29.90");
  const [promoBrl, setPromoBrl] = createSignal("");
  const [stockQty, setStockQty] = createSignal(20);
  const [weightGrams, setWeightGrams] = createSignal(200);
  const [imagePath, setImagePath] = createSignal("");
  const [imageAlt, setImageAlt] = createSignal("");
  const [shortDesc, setShortDesc] = createSignal("");
  const [fullDesc, setFullDesc] = createSignal("");
  const [seoTitle, setSeoTitle] = createSignal("");
  const [seoDesc, setSeoDesc] = createSignal("");
  const [isActive, setIsActive] = createSignal(true);
  const [isFeatured, setIsFeatured] = createSignal(false);
  const [isNew, setIsNew] = createSignal(true);
  const [csvContent, setCsvContent] = createSignal("");
  const [csvPreview, setCsvPreview] = createSignal<string | null>(null);
  const [feedback, setFeedback] = createSignal<string | null>(null);
  const [stockFilter, setStockFilter] = createSignal<
    "all" | "active" | "low" | "out"
  >("all");

  const [products, { refetch: refetchProducts }] = createResource(
    search,
    async (s) => {
      const qs = s ? `?search=${encodeURIComponent(s)}` : "";
      const res = await api<{ data: AdminProductRow[] }>(
        `/admin/products${qs}`,
      );
      return res.data ?? [];
    },
  );

  const filteredProducts = () => {
    const list = products() ?? [];
    const f = stockFilter();
    if (f === "active") return list.filter((p) => p.is_active);
    if (f === "low") {
      return list.filter((p) => {
        const v = p.variants?.[0];
        const avail = (v?.stock_qty ?? 0) - (v?.reserved_qty ?? 0);
        return avail > 0 && avail <= 5;
      });
    }
    if (f === "out") {
      return list.filter((p) => {
        const v = p.variants?.[0];
        const avail = (v?.stock_qty ?? 0) - (v?.reserved_qty ?? 0);
        return avail <= 0;
      });
    }
    return list;
  };

  const [brands] = createResource(async () => {
    const res = await api<{ data: { id: number; name: string }[] }>(
      "/admin/brands",
    );
    return res.data ?? [];
  });

  const [categories] = createResource(async () => {
    const res = await api<{ data: { id: number; name: string }[] }>(
      "/admin/categories",
    );
    return res.data ?? [];
  });

  const [reviews, { refetch: refetchReviews }] = createResource(async () => {
    const res = await api<{ data: ReviewRow[] }>("/admin/reviews");
    return res.data ?? [];
  });

  function loadProductIntoForm(p: AdminProductRow) {
    setEditingId(p.id);
    setName(p.name);
    setSlug(p.slug);
    setSku(p.sku);
    setBrandId(p.brand_id ? String(p.brand_id) : "");
    setSelectedCats((p.categories ?? []).map((c) => c.id));
    setPriceBrl((p.price_cents / 100).toFixed(2));
    setPromoBrl(
      p.promo_price_cents ? (p.promo_price_cents / 100).toFixed(2) : "",
    );
    setStockQty(p.variants?.[0]?.stock_qty ?? 0);
    setWeightGrams(p.weight_grams || 200);
    const primaryImage =
      p.images?.find((image) => image.is_primary) ?? p.images?.[0];
    setImagePath(primaryImage?.path || "");
    setImageAlt(primaryImage?.alt_text || "");
    setShortDesc(p.short_description || "");
    setFullDesc(p.description || "");
    setSeoTitle(p.seo_title || "");
    setSeoDesc(p.seo_description || "");
    setIsActive(p.is_active);
    setIsFeatured(p.is_featured);
    setIsNew(p.is_new_arrival);
    setWholesaleGroupVariants(p.wholesale_group_variants ?? true);
    setSelectedAttrValueIds((p.attribute_values ?? []).map((av) => av.id));
    setVariantsDraft(
      (p.variants ?? []).map((v, idx) => ({
        id: v.id,
        name: v.name || `Tonalidade ${idx + 1}`,
        shade_code: v.shade_code || "",
        color_family: v.color_family || "",
        color_hex: v.color_hex || "#93509e",
        sku: v.sku || `${p.sku}-${idx + 1}`,
        price_cents: v.price_cents ?? p.price_cents,
        promo_price_cents: v.promo_price_cents ?? null,
        stock_qty: v.stock_qty ?? 0,
        sort_order: v.sort_order ?? idx,
        is_default: v.is_default ?? idx === 0,
        is_active: v.is_active ?? true,
      })),
    );
  }

  function resetForm() {
    setEditingId(null);
    setName("");
    setSlug("");
    setSku("");
    setBrandId("");
    setSelectedCats([]);
    setPriceBrl("29.90");
    setPromoBrl("");
    setStockQty(20);
    setWeightGrams(200);
    setImagePath("");
    setImageAlt("");
    setShortDesc("");
    setFullDesc("");
    setSeoTitle("");
    setSeoDesc("");
    setIsActive(true);
    setIsFeatured(false);
    setIsNew(true);
    setWholesaleGroupVariants(true);
    setSelectedAttrValueIds([]);
    setVariantsDraft([]);
  }

  async function uploadImage(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("folder", "products");
    const res = await api<{ data: { path: string } }>("/admin/media/upload", {
      method: "POST",
      body: fd,
    });
    setImagePath(res.data.path);
  }

  async function saveProduct(e: Event) {
    e.preventDefault();
    setFeedback(null);
    const priceCents = Math.round(Number(priceBrl()) * 100);
    const promoCents = promoBrl().trim()
      ? Math.round(Number(promoBrl()) * 100)
      : null;
    const existing = products()?.find((x) => x.id === editingId());
    const firstVariantId = existing?.variants?.[0]?.id;

    const payload = {
      name: name().trim(),
      slug: slug().trim() || undefined,
      sku: sku().trim().toUpperCase(),
      brand_id: brandId() ? Number(brandId()) : null,
      category_ids: selectedCats(),
      price_cents: priceCents,
      promo_price_cents: promoCents,
      weight_grams: Number(weightGrams()) || 200,
      short_description: shortDesc().trim() || undefined,
      description: fullDesc().trim() || undefined,
      seo_title: seoTitle().trim() || undefined,
      seo_description: seoDesc().trim() || undefined,
      is_active: isActive(),
      is_featured: isFeatured(),
      is_new_arrival: isNew(),
      wholesale_group_variants: wholesaleGroupVariants(),
      product_attribute_value_ids: selectedAttrValueIds(),
      images: imagePath().trim()
        ? [
            {
              path: imagePath().trim(),
              alt_text: imageAlt().trim() || name().trim(),
              is_primary: true,
            },
          ]
        : [],
      variants:
        variantsDraft().length > 0
          ? variantsDraft().map((v, idx) => ({
              id: v.id,
              sku:
                v.sku.trim().toUpperCase() ||
                `${sku().trim().toUpperCase()}-${idx + 1}`,
              name: v.name.trim() || `Tonalidade ${idx + 1}`,
              shade_code: v.shade_code.trim() || null,
              color_family: v.color_family.trim() || null,
              color_hex: v.color_hex.trim() || null,
              price_cents: v.price_cents || priceCents,
              promo_price_cents: v.promo_price_cents,
              stock_qty: v.stock_qty,
              sort_order: idx,
              is_default: idx === 0,
              is_active: v.is_active,
            }))
          : [
              {
                id: firstVariantId,
                sku: sku().trim().toUpperCase(),
                name: existing?.variants?.[0]?.name || "Padrão",
                price_cents: priceCents,
                promo_price_cents: promoCents,
                stock_qty: Number(stockQty()) || 0,
                is_default: true,
                is_active: true,
              },
            ],
    };

    try {
      if (editingId()) {
        await api(`/admin/products/${editingId()}`, {
          method: "PUT",
          body: payload,
        });
        setFeedback("Produto atualizado com sucesso.");
      } else {
        await api("/admin/products", { method: "POST", body: payload });
        setFeedback("Produto criado no catálogo.");
      }
      resetForm();
      await refetchProducts();
    } catch (err) {
      setFeedback(
        err instanceof ApiError ? err.message : "Erro ao salvar produto.",
      );
    }
  }

  async function adjustVariantStock(variantId: number, delta: number) {
    await api(`/admin/variants/${variantId}/stock`, {
      method: "POST",
      body: {
        qty_delta: delta,
        type: delta >= 0 ? "in" : "adjustment",
        reason: "Ajuste rápido via catálogo administrativo",
      },
    });
    await refetchProducts();
    setFeedback("Estoque ajustado com movimentação registrada.");
  }

  const discountInfo = () => {
    const regular = Number(priceBrl());
    const promo = Number(promoBrl());
    if (!regular || !promo || promo >= regular) return null;
    const pct = Math.round(((regular - promo) / regular) * 100);
    const diff = (regular - promo).toFixed(2);
    return { pct, diff };
  };

  async function deleteProduct(id: number, prodName: string) {
    if (
      !confirm(
        `Tem certeza que deseja remover o produto "${prodName}" do catálogo?`,
      )
    )
      return;
    setFeedback(null);
    try {
      await api(`/admin/products/${id}`, { method: "DELETE" });
      setFeedback(`Produto "${prodName}" arquivado com sucesso.`);
      if (editingId() === id) resetForm();
      await refetchProducts();
    } catch (err) {
      setFeedback(
        err instanceof ApiError ? err.message : "Erro ao remover produto.",
      );
    }
  }

  async function moderateReview(id: number, status: "approved" | "rejected") {
    await api(`/admin/reviews/${id}`, { method: "PATCH", body: { status } });
    await refetchReviews();
  }

  async function runCsvImport(dryRun: boolean) {
    setCsvPreview(null);
    try {
      const res = await api<{ data: Record<string, unknown> }>(
        "/admin/catalog/import-csv",
        {
          method: "POST",
          body: { csv_content: csvContent(), dry_run: dryRun },
        },
      );
      setCsvPreview(JSON.stringify(res.data, null, 2));
      if (!dryRun) await refetchProducts();
    } catch (err) {
      setCsvPreview(
        err instanceof ApiError ? err.message : "Falha na importação CSV.",
      );
    }
  }

  function toggleCat(id: number) {
    setSelectedCats((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <AdminLayout
      title="Produtos, Estoque e Avaliações"
      subtitle="Cadastre itens, ajuste saldo em estoque, importe CSV e modere reviews"
      permission="catalog.view"
    >
      <div class="mb-4 flex flex-wrap gap-2">
        <For
          each={
            [
              ["produtos", "Catálogo & Estoque"],
              ["avaliacoes", "Avaliações"],
              ["avisos", "Avisos de Reposição"],
              ["csv", "Importar / Exportar CSV"],
            ] as const
          }
        >
          {([key, label]) => (
            <button
              type="button"
              onClick={() => setTab(key)}
              class={`rounded-lg px-4 py-2 text-xs font-bold ${
                tab() === key
                  ? "bg-[var(--mf-primary)] text-white"
                  : "border border-zinc-300 bg-white text-zinc-800"
              }`}
            >
              {label}
            </button>
          )}
        </For>
      </div>

      <Show when={feedback()}>
        <p
          role="status"
          class="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800"
        >
          {feedback()}
        </p>
      </Show>

      <Show when={tab() === "produtos"}>
        <div class="grid gap-6 lg:grid-cols-12">
          {/* Form */}
          <form
            onSubmit={saveProduct}
            class="space-y-3 rounded-xl border border-zinc-200 bg-white p-5 lg:col-span-5"
          >
            <div class="flex items-center justify-between">
              <h2 class="text-base font-bold text-zinc-900">
                {editingId()
                  ? `Editando produto #${editingId()}`
                  : "Novo Produto"}
              </h2>
              <Show when={editingId()}>
                <button
                  type="button"
                  onClick={resetForm}
                  class="text-xs font-semibold text-zinc-600 hover:underline"
                >
                  Cancelar edição
                </button>
              </Show>
            </div>

            <div class="grid gap-2.5 sm:grid-cols-2">
              <div class="sm:col-span-2">
                <label class="block text-xs font-semibold text-zinc-700">
                  Nome *
                </label>
                <input
                  type="text"
                  required
                  value={name()}
                  onInput={(e) => setName(e.currentTarget.value)}
                  class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-sm"
                />
              </div>
              <div>
                <label class="block text-xs font-semibold text-zinc-700">
                  SKU *
                </label>
                <input
                  type="text"
                  required
                  value={sku()}
                  onInput={(e) => setSku(e.currentTarget.value.toUpperCase())}
                  class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-sm uppercase"
                />
              </div>
              <div>
                <label class="block text-xs font-semibold text-zinc-700">
                  Marca
                </label>
                <select
                  value={brandId()}
                  onChange={(e) => setBrandId(e.currentTarget.value)}
                  class="mt-1 h-9 w-full rounded-md border border-zinc-300 bg-white px-2.5 text-sm"
                >
                  <option value="">Sem marca</option>
                  <For each={brands() ?? []}>
                    {(b) => <option value={b.id}>{b.name}</option>}
                  </For>
                </select>
              </div>
              <div>
                <label class="block text-xs font-semibold text-zinc-700">
                  Preço (R$) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={priceBrl()}
                  onInput={(e) => setPriceBrl(e.currentTarget.value)}
                  class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-sm"
                />
              </div>
              <div>
                <label class="block text-xs font-semibold text-zinc-700">
                  Preço promocional (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={promoBrl()}
                  onInput={(e) => setPromoBrl(e.currentTarget.value)}
                  class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-sm"
                />
              </div>
              <Show when={discountInfo()}>
                {(info) => (
                  <div class="flex items-center gap-2 rounded-md border border-fuchsia-200 bg-fuchsia-50 p-2 text-xs text-fuchsia-900 sm:col-span-2">
                    <Percent
                      class="size-4 shrink-0 text-fuchsia-700"
                      aria-hidden="true"
                    />
                    <span>
                      Desconto ativo: <strong>-{info().pct}% OFF</strong>{" "}
                      (Economia de R$ {info().diff})
                    </span>
                  </div>
                )}
              </Show>
              <div>
                <label class="block text-xs font-semibold text-zinc-700">
                  Estoque inicial / atual
                </label>
                <input
                  type="number"
                  min="0"
                  value={stockQty()}
                  onInput={(e) => setStockQty(Number(e.currentTarget.value))}
                  class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-sm"
                />
              </div>
              <div>
                <label class="block text-xs font-semibold text-zinc-700">
                  Peso (gramas)
                </label>
                <input
                  type="number"
                  min="1"
                  value={weightGrams()}
                  onInput={(e) => setWeightGrams(Number(e.currentTarget.value))}
                  class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-sm"
                />
              </div>
            </div>

            <div>
              <p class="text-xs font-semibold text-zinc-700">Categorias</p>
              <div class="mt-1 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded-md border border-zinc-200 p-2">
                <For each={categories() ?? []}>
                  {(cat) => (
                    <label class="inline-flex cursor-pointer items-center gap-1 rounded bg-zinc-100 px-2 py-1 text-xs">
                      <input
                        type="checkbox"
                        checked={selectedCats().includes(cat.id)}
                        onChange={() => toggleCat(cat.id)}
                      />
                      {cat.name}
                    </label>
                  )}
                </For>
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-zinc-700">
                Imagem do produto (Upload ou URL)
              </label>
              <div class="mt-1 flex items-center gap-2">
                <input
                  type="text"
                  placeholder="/storage/products/... ou /products/..."
                  value={imagePath()}
                  onInput={(e) => setImagePath(e.currentTarget.value)}
                  class="h-9 flex-1 rounded-md border border-zinc-300 px-2.5 text-xs"
                />
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    if (file) void uploadImage(file);
                  }}
                  class="max-w-[170px] text-xs"
                />
              </div>
              <Show when={imagePath().trim()}>
                <div class="mt-2 flex items-center gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50 p-2">
                  <img
                    src={assetUrl(imagePath())}
                    alt={imageAlt() || name() || "Preview"}
                    class="size-10 rounded border border-zinc-200 bg-white object-contain"
                  />
                  <div class="min-w-0 flex-1 text-xs">
                    <p class="truncate font-medium text-zinc-800">
                      {imagePath()}
                    </p>
                    <p class="text-[11px] font-semibold text-emerald-700">
                      Imagem vinculada
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setImagePath("");
                      setImageAlt("");
                    }}
                    class="text-xs text-red-600 hover:underline"
                  >
                    Remover
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Texto alternativo (alt) da imagem para SEO e acessibilidade"
                  value={imageAlt()}
                  onInput={(e) => setImageAlt(e.currentTarget.value)}
                  class="mt-2 h-8 w-full rounded-md border border-zinc-300 bg-white px-2.5 text-xs"
                />
              </Show>
            </div>

            <input
              type="text"
              placeholder="Resumo curto"
              value={shortDesc()}
              onInput={(e) => setShortDesc(e.currentTarget.value)}
              class="h-9 w-full rounded-md border border-zinc-300 px-3 text-xs"
            />
            <textarea
              rows={3}
              placeholder="Descrição completa"
              value={fullDesc()}
              onInput={(e) => setFullDesc(e.currentTarget.value)}
              class="w-full rounded-md border border-zinc-300 p-2.5 text-xs"
            />

            {/* Atributos Técnicos, Atacado Multi-Cor & Tonalidades */}
            <div class="space-y-3 rounded-lg border border-[#E5CFE8] bg-[#FCF8FD] p-3.5 text-xs">
              <div class="flex items-center justify-between">
                <p class="font-bold text-[#2E0C49]">
                  Atacado Multi-Cor, Tonalidades &amp; Specs
                </p>
                <label class="inline-flex items-center gap-1.5 font-semibold text-zinc-700">
                  <input
                    type="checkbox"
                    checked={wholesaleGroupVariants()}
                    onChange={(e) =>
                      setWholesaleGroupVariants(e.currentTarget.checked)
                    }
                    class="accent-[#93509e]"
                  />
                  Somar unidades entre cores no atacado
                </label>
              </div>

              <Show when={(availableAttributes()?.length ?? 0) > 0}>
                <div>
                  <p class="mb-1 text-[11px] font-semibold text-zinc-700">
                    Especificações / Filtros (ex.: Acabamento, Potência, Tensão)
                  </p>
                  <div class="max-h-32 space-y-1.5 overflow-y-auto rounded border border-zinc-200 bg-white p-2">
                    <For each={availableAttributes() ?? []}>
                      {(attr) => (
                        <div>
                          <span class="text-[10px] font-bold uppercase text-zinc-400">
                            {attr.name}:{" "}
                          </span>
                          <For each={attr.values}>
                            {(val) => (
                              <label class="mr-2 inline-flex cursor-pointer items-center gap-1 text-[11px]">
                                <input
                                  type="checkbox"
                                  checked={selectedAttrValueIds().includes(
                                    val.id,
                                  )}
                                  onChange={() => toggleAttrValueId(val.id)}
                                  class="accent-[#93509e]"
                                />
                                {val.value}
                              </label>
                            )}
                          </For>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </Show>

              <AdminVariantsEditor
                variants={variantsDraft()}
                onChange={setVariantsDraft}
              />
            </div>

            {/* Otimização de SEO (Google / Buscadores) */}
            <div class="space-y-3 rounded-lg border border-purple-200 bg-purple-50/50 p-3.5 text-xs">
              <div class="flex items-center justify-between">
                <p class="font-bold text-[#3D1260]">
                  Otimização de SEO (Google & Buscadores)
                </p>
                <span class="text-[10px] text-zinc-500">
                  Opcional — fallback automático ativo
                </span>
              </div>

              <div>
                <div class="flex justify-between">
                  <label class="font-semibold text-zinc-700">
                    Slug da URL (opcional)
                  </label>
                  <span class="text-[10px] text-zinc-500">
                    Ao alterar em produto existente, cria redirect 301
                    automático
                  </span>
                </div>
                <input
                  type="text"
                  placeholder={
                    name()
                      ? name().toLowerCase().replace(/\s+/g, "-")
                      : "gerado-automaticamente"
                  }
                  value={slug()}
                  onInput={(e) => setSlug(e.currentTarget.value)}
                  class="mt-1 h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-xs"
                />
              </div>

              <div>
                <div class="flex justify-between">
                  <label class="font-semibold text-zinc-700">Título SEO</label>
                  <span class="text-[10px] text-zinc-500">
                    {seoTitle().length || (name() ? name().length + 19 : 0)} /
                    60 caracteres
                  </span>
                </div>
                <input
                  type="text"
                  placeholder={
                    name()
                      ? `${name()} | Mistura Feminina`
                      : "Título personalizado para o Google"
                  }
                  value={seoTitle()}
                  onInput={(e) => setSeoTitle(e.currentTarget.value)}
                  class="mt-1 h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-xs"
                />
              </div>

              <div>
                <div class="flex justify-between">
                  <label class="font-semibold text-zinc-700">
                    Meta Description
                  </label>
                  <span class="text-[10px] text-zinc-500">
                    {seoDesc().length || (shortDesc() ? shortDesc().length : 0)}{" "}
                    / 160 caracteres
                  </span>
                </div>
                <textarea
                  rows={2}
                  placeholder={
                    shortDesc() ||
                    `Conheça ${name() || "o produto"} na Mistura Feminina. Confira suas características, informações e disponibilidade para comprar online.`
                  }
                  value={seoDesc()}
                  onInput={(e) => setSeoDesc(e.currentTarget.value)}
                  class="mt-1 w-full rounded-md border border-zinc-300 bg-white p-2.5 text-xs"
                />
              </div>

              {/* Pré-visualização do Google */}
              <div class="rounded border border-zinc-200 bg-white p-2.5 shadow-2xs">
                <p class="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Pré-visualização no Google
                </p>
                <p class="mt-1 text-sm font-semibold text-[#1a0dab] line-clamp-1">
                  {seoTitle().trim() ||
                    (name()
                      ? `${name()} | Mistura Feminina`
                      : "Nome do Produto | Mistura Feminina")}
                </p>
                <p class="text-[11px] text-[#006621] truncate">
                  {site.url}/produto/
                  {slug().trim() ||
                    (name()
                      ? name().toLowerCase().replace(/\s+/g, "-")
                      : "slug-do-produto")}
                </p>
                <p class="mt-0.5 text-xs text-[#545454] line-clamp-2">
                  {seoDesc().trim() ||
                    shortDesc().trim() ||
                    `Conheça ${name() || "o produto"} na Mistura Feminina. Confira suas características, informações e disponibilidade para comprar online.`}
                </p>
              </div>
            </div>

            <div class="flex flex-wrap gap-4 text-xs">
              <label class="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={isActive()}
                  onChange={(e) => setIsActive(e.currentTarget.checked)}
                />
                Ativo
              </label>
              <label class="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={isFeatured()}
                  onChange={(e) => setIsFeatured(e.currentTarget.checked)}
                />
                Destaque
              </label>
              <label class="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={isNew()}
                  onChange={(e) => setIsNew(e.currentTarget.checked)}
                />
                Lançamento
              </label>
            </div>

            <button
              type="submit"
              class="h-10 w-full rounded-lg bg-[var(--mf-primary)] text-xs font-bold text-white hover:bg-[var(--mf-primary-hover)]"
            >
              {editingId()
                ? "Salvar alterações do produto"
                : "Cadastrar produto"}
            </button>
          </form>

          {/* Table */}
          <section class="rounded-xl border border-zinc-200 bg-white p-5 lg:col-span-7">
            {/* Quick stock status tabs */}
            <div class="mb-3 flex flex-wrap gap-1.5 border-b border-zinc-100 pb-3">
              <button
                type="button"
                onClick={() => setStockFilter("all")}
                class={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                  stockFilter() === "all"
                    ? "bg-[#93509e] text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                Todos ({products()?.length ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setStockFilter("active")}
                class={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                  stockFilter() === "active"
                    ? "bg-[#93509e] text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                Ativos
              </button>
              <button
                type="button"
                onClick={() => setStockFilter("low")}
                class={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                  stockFilter() === "low"
                    ? "bg-amber-600 text-white"
                    : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                }`}
              >
                Baixo Estoque (≤ 5)
              </button>
              <button
                type="button"
                onClick={() => setStockFilter("out")}
                class={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                  stockFilter() === "out"
                    ? "bg-red-600 text-white"
                    : "bg-red-50 text-red-700 hover:bg-red-100"
                }`}
              >
                Esgotados
              </button>
            </div>

            <div class="mb-4 flex items-center justify-between gap-3">
              <input
                type="search"
                placeholder="Buscar produto ou SKU..."
                value={search()}
                onInput={(e) => setSearch(e.currentTarget.value)}
                class="h-9 flex-1 rounded-md border border-zinc-300 px-3 text-sm focus:border-[#93509e] focus:outline-none"
              />
            </div>

            <div class="space-y-2.5">
              <For each={filteredProducts()}>
                {(p) => (
                  <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 p-3 text-sm transition-all hover:border-zinc-300 hover:shadow-2xs">
                    <div class="flex items-center gap-3 min-w-0">
                      <img
                        src={assetUrl(p.images?.[0]?.path)}
                        alt={p.name}
                        class="h-12 w-12 shrink-0 rounded border border-zinc-200 bg-zinc-50 object-contain"
                      />
                      <div class="min-w-0">
                        <p class="truncate font-bold text-zinc-900">{p.name}</p>
                        <p class="text-xs text-zinc-500">
                          SKU {p.sku} ·{" "}
                          {formatCents(p.promo_price_cents ?? p.price_cents)}
                          <Show when={!p.is_active}>
                            <span class="ml-1 rounded bg-zinc-100 px-1 text-[10px] text-zinc-600">
                              Inativo
                            </span>
                          </Show>
                        </p>
                      </div>
                    </div>

                    <div class="flex items-center gap-2 text-xs">
                      <Show when={p.variants?.[0]}>
                        {(v) => {
                          const avail = () => v().stock_qty - v().reserved_qty;
                          return (
                            <div class="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1">
                              <span
                                class={`text-[11px] font-bold ${
                                  avail() <= 0
                                    ? "text-red-600"
                                    : avail() <= 5
                                      ? "text-amber-600"
                                      : "text-zinc-800"
                                }`}
                              >
                                {avail() <= 0
                                  ? "Esgotado"
                                  : `Est.: ${avail()} un`}
                              </span>
                              <div class="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void adjustVariantStock(v().id, -1)
                                  }
                                  disabled={avail() <= 0}
                                  class="rounded bg-zinc-200 px-1.5 py-0.5 font-bold text-zinc-700 hover:bg-zinc-300 disabled:opacity-40"
                                  title="Diminuir 1"
                                >
                                  -1
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void adjustVariantStock(v().id, 1)
                                  }
                                  class="rounded bg-[#93509e] px-1.5 py-0.5 font-bold text-white hover:bg-[#7d3f86]"
                                  title="Adicionar 1"
                                >
                                  +1
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void adjustVariantStock(v().id, 5)
                                  }
                                  class="rounded bg-emerald-700 px-1.5 py-0.5 font-bold text-white hover:bg-emerald-800"
                                  title="Adicionar 5"
                                >
                                  +5
                                </button>
                              </div>
                            </div>
                          );
                        }}
                      </Show>
                      <a
                        href={`/produto/${p.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        class="rounded border border-zinc-200 p-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-[var(--mf-primary)]"
                        title="Ver produto na loja"
                      >
                        <ExternalLink class="size-3.5" aria-hidden="true" />
                      </a>
                      <button
                        type="button"
                        onClick={() => loadProductIntoForm(p)}
                        class="rounded border border-zinc-300 px-2.5 py-1 font-semibold hover:bg-zinc-50"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteProduct(p.id, p.name)}
                        class="rounded border border-red-200 p-1.5 text-red-700 hover:bg-red-50"
                        title="Remover produto do catálogo"
                      >
                        <Trash2 class="size-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </section>
        </div>
      </Show>

      <Show when={tab() === "avaliacoes"}>
        <section class="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 class="mb-4 text-base font-bold text-zinc-900">
            Moderação de Avaliações
          </h2>
          <ul class="divide-y divide-zinc-200 text-sm">
            <For each={reviews() ?? []}>
              {(rev) => (
                <li class="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p class="font-bold text-zinc-900">
                      {rev.author_name}{" "}
                      <span class="inline-flex items-center gap-0.5">
                        ({rev.rating}/5{" "}
                        <Star
                          class="size-3.5 fill-amber-500 text-amber-500"
                          aria-hidden="true"
                        />
                        )
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
                      class="rounded bg-emerald-700 px-3 py-1 font-semibold text-white"
                    >
                      Aprovar
                    </button>
                    <button
                      type="button"
                      onClick={() => void moderateReview(rev.id, "rejected")}
                      class="rounded bg-red-700 px-3 py-1 font-semibold text-white"
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

      <Show when={tab() === "avisos"}>
        <AdminRestockAnalyticsPanel />
      </Show>

      <Show when={tab() === "csv"}>
        <section class="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-base font-bold text-zinc-900">
              Importação e Exportação CSV
            </h2>
            <a
              href={`${import.meta.env.VITE_API_URL}/admin/catalog/export-csv`}
              target="_blank"
              rel="noopener noreferrer"
              class="rounded-md bg-zinc-900 px-4 py-2 text-xs font-semibold text-white"
            >
              Baixar CSV atual
            </a>
          </div>
          <textarea
            rows={6}
            placeholder="Cole aqui o conteúdo CSV (sku;name;price_cents;stock_qty;...) para pré-validar ou importar"
            value={csvContent()}
            onInput={(e) => setCsvContent(e.currentTarget.value)}
            class="w-full rounded-md border border-zinc-300 p-3 font-mono text-xs"
          />
          <div class="flex gap-2">
            <button
              type="button"
              onClick={() => void runCsvImport(true)}
              class="rounded-md border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold"
            >
              Pré-validar (Dry-Run)
            </button>
            <button
              type="button"
              onClick={() => void runCsvImport(false)}
              class="rounded-md bg-[var(--mf-primary)] px-4 py-2 text-xs font-semibold text-white"
            >
              Executar importação
            </button>
          </div>
          <Show when={csvPreview()}>
            <pre class="max-h-60 overflow-auto rounded-lg bg-zinc-900 p-4 text-xs text-zinc-100">
              {csvPreview()}
            </pre>
          </Show>
        </section>
      </Show>
    </AdminLayout>
  );
}
