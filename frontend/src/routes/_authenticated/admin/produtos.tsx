import { createFileRoute } from "@tanstack/solid-router";
import { For, Show, createResource, createSignal } from "solid-js";
import { AdminLayout } from "../../../features/admin/AdminLayout";
import { ApiError, api } from "../../../lib/api";
import { assetUrl, formatCents } from "../../../lib/format";
import { seoHead } from "../../../lib/seo";

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
  brand_id: number | null;
  is_active: boolean;
  is_featured: boolean;
  is_new_arrival: boolean;
  brand?: { id: number; name: string } | null;
  categories?: { id: number; name: string }[];
  images?: { id: number; path: string; alt_text: string | null }[];
  variants?: {
    id: number;
    sku: string;
    name: string;
    price_cents: number;
    stock_qty: number;
    reserved_qty: number;
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

interface RestockRow {
  id: number;
  email: string;
  name: string | null;
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
  const [sku, setSku] = createSignal("");
  const [brandId, setBrandId] = createSignal("");
  const [selectedCats, setSelectedCats] = createSignal<number[]>([]);
  const [priceBrl, setPriceBrl] = createSignal("29.90");
  const [promoBrl, setPromoBrl] = createSignal("");
  const [stockQty, setStockQty] = createSignal(20);
  const [weightGrams, setWeightGrams] = createSignal(200);
  const [imagePath, setImagePath] = createSignal("");
  const [shortDesc, setShortDesc] = createSignal("");
  const [fullDesc, setFullDesc] = createSignal("");
  const [isActive, setIsActive] = createSignal(true);
  const [isFeatured, setIsFeatured] = createSignal(false);
  const [isNew, setIsNew] = createSignal(true);
  const [csvContent, setCsvContent] = createSignal("");
  const [csvPreview, setCsvPreview] = createSignal<string | null>(null);
  const [feedback, setFeedback] = createSignal<string | null>(null);

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

  const [restocks] = createResource(async () => {
    const res = await api<{ data: RestockRow[] }>("/admin/restock-requests");
    return res.data ?? [];
  });

  function loadProductIntoForm(p: AdminProductRow) {
    setEditingId(p.id);
    setName(p.name);
    setSku(p.sku);
    setBrandId(p.brand_id ? String(p.brand_id) : "");
    setSelectedCats((p.categories ?? []).map((c) => c.id));
    setPriceBrl((p.price_cents / 100).toFixed(2));
    setPromoBrl(
      p.promo_price_cents ? (p.promo_price_cents / 100).toFixed(2) : "",
    );
    setStockQty(p.variants?.[0]?.stock_qty ?? 0);
    setWeightGrams(p.weight_grams || 200);
    setImagePath(p.images?.[0]?.path || "");
    setShortDesc(p.short_description || "");
    setFullDesc(p.description || "");
    setIsActive(p.is_active);
    setIsFeatured(p.is_featured);
    setIsNew(p.is_new_arrival);
  }

  function resetForm() {
    setEditingId(null);
    setName("");
    setSku("");
    setBrandId("");
    setSelectedCats([]);
    setPriceBrl("29.90");
    setPromoBrl("");
    setStockQty(20);
    setWeightGrams(200);
    setImagePath("");
    setShortDesc("");
    setFullDesc("");
    setIsActive(true);
    setIsFeatured(false);
    setIsNew(true);
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
      sku: sku().trim().toUpperCase(),
      brand_id: brandId() ? Number(brandId()) : null,
      category_ids: selectedCats(),
      price_cents: priceCents,
      promo_price_cents: promoCents,
      weight_grams: Number(weightGrams()) || 200,
      short_description: shortDesc().trim() || undefined,
      description: fullDesc().trim() || undefined,
      is_active: isActive(),
      is_featured: isFeatured(),
      is_new_arrival: isNew(),
      images: imagePath().trim()
        ? [
            {
              path: imagePath().trim(),
              alt_text: name().trim(),
              is_primary: true,
            },
          ]
        : undefined,
      variants: [
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
                Imagem do produto
              </label>
              <div class="mt-1 flex items-center gap-2">
                <input
                  type="text"
                  placeholder="/storage/products/..."
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
            <div class="mb-4 flex items-center justify-between gap-3">
              <input
                type="search"
                placeholder="Buscar produto ou SKU..."
                value={search()}
                onInput={(e) => setSearch(e.currentTarget.value)}
                class="h-9 flex-1 rounded-md border border-zinc-300 px-3 text-sm"
              />
            </div>

            <div class="space-y-2.5">
              <For each={products() ?? []}>
                {(p) => (
                  <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 p-3 text-sm">
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
                          <Show when={!p.is_active}> · Inativo</Show>
                        </p>
                      </div>
                    </div>

                    <div class="flex items-center gap-2 text-xs">
                      <Show when={p.variants?.[0]}>
                        {(v) => (
                          <div class="flex items-center gap-1 rounded border border-zinc-200 bg-zinc-50 px-2 py-1">
                            <span>
                              Est.:{" "}
                              <strong>
                                {v().stock_qty - v().reserved_qty}
                              </strong>
                            </span>
                            <button
                              type="button"
                              onClick={() => void adjustVariantStock(v().id, 5)}
                              class="rounded bg-emerald-700 px-1.5 py-0.5 font-bold text-white"
                            >
                              +5
                            </button>
                          </div>
                        )}
                      </Show>
                      <button
                        type="button"
                        onClick={() => loadProductIntoForm(p)}
                        class="rounded border border-zinc-300 px-2.5 py-1 font-semibold hover:bg-zinc-50"
                      >
                        Editar
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
                      {rev.author_name} ({rev.rating}/5 ★) — {rev.product?.name}
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
        <section class="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 class="mb-4 text-base font-bold text-zinc-900">
            Solicitações de Avise-me quando chegar
          </h2>
          <ul class="divide-y divide-zinc-200 text-sm">
            <For each={restocks() ?? []}>
              {(r) => (
                <li class="flex items-center justify-between py-2.5">
                  <div>
                    <p class="font-semibold text-zinc-900">{r.email}</p>
                    <p class="text-xs text-zinc-500">
                      {r.product?.name || "Produto"}
                    </p>
                  </div>
                  <span class="rounded bg-zinc-100 px-2 py-0.5 text-xs">
                    {r.status}
                  </span>
                </li>
              )}
            </For>
          </ul>
        </section>
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
