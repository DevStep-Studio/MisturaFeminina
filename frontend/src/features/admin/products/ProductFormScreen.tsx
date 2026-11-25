import ArrowLeft from "lucide-solid/icons/arrow-left";
import CopyPlus from "lucide-solid/icons/copy-plus";
import Plus from "lucide-solid/icons/plus";
import Sparkles from "lucide-solid/icons/sparkles";
import X from "lucide-solid/icons/x";
import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { ApiError, api } from "../../../lib/api";
import { assetUrl } from "../../../lib/format";
import {
  AdminVariantsEditor,
  type AdminVariantDraft,
} from "../AdminVariantsEditor";
import type {
  AdminProductRow,
  BrandOption,
  CategoryOption,
} from "./types";

export interface AttributeOption {
  id: number;
  name: string;
  values: Array<{ id: number; value: string }>;
}

export function ProductFormScreen(props: {
  mode: "create" | "edit";
  product: AdminProductRow | null;
  duplicateFrom?: AdminProductRow | null;
  brands: BrandOption[];
  categories: CategoryOption[];
  attributes: AttributeOption[];
  canWrite: boolean;
  onCancel: () => void;
  onSaved: (message: string, stayAndReset?: boolean) => Promise<void> | void;
  onDuplicateRequest?: (product: AdminProductRow) => void;
  onArchiveOrDelete?: (
    productId: number,
    action: "archive" | "restore" | "delete",
  ) => void;
}) {
  const [name, setName] = createSignal("");
  const [slug, setSlug] = createSignal("");
  const [sku, setSku] = createSignal("");
  const [gtin, setGtin] = createSignal("");
  const [supplierCode, setSupplierCode] = createSignal("");
  const [powerWatts, setPowerWatts] = createSignal("");
  const [brandId, setBrandId] = createSignal("");
  const [selectedCats, setSelectedCats] = createSignal<number[]>([]);
  const [catQuery, setCatQuery] = createSignal("");
  const [priceBrl, setPriceBrl] = createSignal("29,90");
  const [promoBrl, setPromoBrl] = createSignal("");
  const [costBrl, setCostBrl] = createSignal("");
  const [stockQty, setStockQty] = createSignal(0);
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
  const [wholesaleGroupVariants, setWholesaleGroupVariants] =
    createSignal(true);
  const [selectedAttrValueIds, setSelectedAttrValueIds] = createSignal<
    number[]
  >([]);
  const [variantsDraft, setVariantsDraft] = createSignal<AdminVariantDraft[]>(
    [],
  );

  const [busy, setBusy] = createSignal(false);
  const [uploading, setUploading] = createSignal(false);
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null);
  const [aiBusy, setAiBusy] = createSignal(false);
  const [aiAssist, setAiAssist] = createSignal<{
    issues: string[];
    possible_duplicates: Array<{ id: number; name: string; sku: string }>;
    proposed: {
      short_description: string;
      description: string;
      seo_title: string;
      seo_description: string;
    };
  } | null>(null);

  createEffect(() => {
    const src = props.product ?? props.duplicateFrom;
    const isDuplicate = !props.product && !!props.duplicateFrom;

    if (!src || typeof src !== "object" || !("id" in src) || !src.id) {
      resetBlankForm();
      return;
    }

    setName(isDuplicate ? `${src.name ?? ""} (Cópia)` : (src.name ?? ""));
    setSlug(isDuplicate ? "" : (src.slug ?? ""));
    setSku(isDuplicate ? "" : (src.sku ?? ""));
    setGtin(isDuplicate ? "" : (src.gtin ?? ""));
    setSupplierCode(src.supplier_code ?? "");
    setPowerWatts(src.power_watts ? String(src.power_watts) : "");
    setBrandId(src.brand_id ? String(src.brand_id) : "");
    setSelectedCats((src.categories ?? []).map((c) => c.id));
    setPriceBrl(
      typeof src.price_cents === "number"
        ? (src.price_cents / 100).toFixed(2).replace(".", ",")
        : "29,90",
    );
    setPromoBrl(
      src.promo_price_cents
        ? (src.promo_price_cents / 100).toFixed(2).replace(".", ",")
        : "",
    );
    setCostBrl(
      src.cost_cents
        ? (src.cost_cents / 100).toFixed(2).replace(".", ",")
        : "",
    );
    setStockQty(isDuplicate ? 0 : (src.variants?.[0]?.stock_qty ?? 0));
    setWeightGrams(src.weight_grams || 200);
    const primaryImg = src.images?.find((i) => i.is_primary) ?? src.images?.[0];
    setImagePath(primaryImg?.path || "");
    setImageAlt(primaryImg?.alt_text || "");
    setShortDesc(src.short_description || "");
    setFullDesc(src.description || "");
    setSeoTitle(src.seo_title || "");
    setSeoDesc(src.seo_description || "");
    setIsActive(src.is_active);
    setIsFeatured(src.is_featured);
    setIsNew(src.is_new_arrival);
    setWholesaleGroupVariants(src.wholesale_group_variants ?? true);
    setSelectedAttrValueIds((src.attribute_values ?? []).map((av) => av.id));
    setVariantsDraft(
      (src.variants ?? []).map((v, idx) => ({
        id: isDuplicate ? undefined : v.id,
        name: v.name || `Tonalidade ${idx + 1}`,
        shade_code: v.shade_code || "",
        color_family: v.color_family || "",
        color_hex: v.color_hex || "#93509e",
        sku: isDuplicate ? "" : v.sku || `${src.sku}-${idx + 1}`,
        price_cents: v.price_cents ?? src.price_cents,
        promo_price_cents: v.promo_price_cents ?? null,
        stock_qty: isDuplicate ? 0 : (v.stock_qty ?? 0),
        sort_order: v.sort_order ?? idx,
        is_default: v.is_default ?? idx === 0,
        is_active: v.is_active ?? true,
      })),
    );
    setAiAssist(null);
    setErrorMsg(null);
  });

  function resetBlankForm() {
    setName("");
    setSlug("");
    setSku("");
    setGtin("");
    setSupplierCode("");
    setPowerWatts("");
    setBrandId("");
    setSelectedCats([]);
    setCatQuery("");
    setPriceBrl("29,90");
    setPromoBrl("");
    setCostBrl("");
    setStockQty(0);
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
    setAiAssist(null);
    setErrorMsg(null);
  }

  function parseBrl(raw: string): number {
    const clean = raw
      .trim()
      .replace(/R\$/gi, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const num = Number(clean);
    return Number.isFinite(num) && num > 0 ? Math.round(num * 100) : 0;
  }

  const discountPreview = createMemo(() => {
    const regular = parseBrl(priceBrl());
    const promo = parseBrl(promoBrl());
    if (!regular || !promo || promo >= regular) return null;
    const pct = Math.round(((regular - promo) / regular) * 100);
    return { pct, diff: ((regular - promo) / 100).toFixed(2).replace(".", ",") };
  });

  const filteredCategories = createMemo(() => {
    const q = catQuery().trim().toLowerCase();
    if (!q) return props.categories;
    return props.categories.filter((c) => c.name.toLowerCase().includes(q));
  });

  function toggleCategory(id: number) {
    setSelectedCats((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleAttr(id: number) {
    setSelectedAttrValueIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function uploadImage(file: File) {
    setUploading(true);
    setErrorMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "products");
      const res = await api<{ data: { path: string } }>("/admin/media/upload", {
        method: "POST",
        body: fd,
      });
      setImagePath(res.data.path);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Erro ao enviar imagem.");
    } finally {
      setUploading(false);
    }
  }

  async function runAiAssist(
    action: "improve_description" | "audit_catalog" | "check_duplicates",
  ) {
    if (!props.product?.id) return;
    setAiBusy(true);
    try {
      const res = await api<{
        data: {
          issues: string[];
          possible_duplicates: Array<{ id: number; name: string; sku: string }>;
          proposed: {
            short_description: string;
            description: string;
            seo_title: string;
            seo_description: string;
          };
        };
      }>(`/admin/ai/catalog/products/${props.product.id}/assist`, {
        method: "POST",
        body: { action },
      });
      setAiAssist(res.data);
    } finally {
      setAiBusy(false);
    }
  }

  async function submitForm(stayAndNext = false) {
    setErrorMsg(null);
    const priceCents = parseBrl(priceBrl());
    if (!name().trim() || !sku().trim() || priceCents <= 0) {
      setErrorMsg("Preencha Nome, SKU principal e Preço de venda válido (> R$ 0,00).");
      return;
    }

    const promoCents = promoBrl().trim() ? parseBrl(promoBrl()) : null;
    if (promoCents !== null && (promoCents <= 0 || promoCents >= priceCents)) {
      setErrorMsg("O preço promocional deve ser maior que zero e menor que o preço de venda.");
      return;
    }

    const costCents = costBrl().trim() ? parseBrl(costBrl()) : 0;
    const firstVariantId = props.product?.variants?.[0]?.id;

    const payload = {
      name: name().trim(),
      slug: slug().trim() || undefined,
      sku: sku().trim().toUpperCase(),
      gtin: gtin().trim() || null,
      supplier_code: supplierCode().trim() || null,
      power_watts: powerWatts().trim() ? Number.parseInt(powerWatts().trim(), 10) || null : null,
      brand_id: brandId() ? Number(brandId()) : null,
      category_ids: selectedCats(),
      price_cents: priceCents,
      promo_price_cents: promoCents,
      cost_cents: costCents,
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
                id: props.mode === "edit" ? firstVariantId : undefined,
                sku: sku().trim().toUpperCase(),
                name: props.product?.variants?.[0]?.name || "Padrão",
                price_cents: priceCents,
                promo_price_cents: promoCents,
                stock_qty: Math.max(0, Number(stockQty()) || 0),
                is_default: true,
                is_active: true,
              },
            ],
    };

    setBusy(true);
    try {
      if (props.mode === "edit" && props.product) {
        await api(`/admin/products/${props.product.id}`, {
          method: "PUT",
          body: payload,
        });
        await props.onSaved(`Produto "${name().trim()}" atualizado com sucesso.`, stayAndNext);
      } else {
        await api("/admin/products", { method: "POST", body: payload });
        if (stayAndNext) {
          resetBlankForm();
        }
        await props.onSaved(`Produto "${name().trim()}" cadastrado com sucesso.`, stayAndNext);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : "Não foi possível salvar o produto.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submitForm(false);
      }}
      class="mx-auto max-w-4xl space-y-6 pb-20"
    >
      {/* Header bar */}
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-4">
        <div class="flex items-center gap-3">
          <button
            type="button"
            onClick={() => props.onCancel()}
            class="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            <ArrowLeft class="h-3.5 w-3.5" />
            Voltar ao catálogo
          </button>
          <div>
            <h2 class="text-lg font-bold text-zinc-900">
              {props.mode === "edit" && props.product
                ? `Editar produto — ${props.product.sku}`
                : props.duplicateFrom
                  ? "Duplicar como novo produto"
                  : "Novo produto"}
            </h2>
          </div>
        </div>

        <Show when={props.mode === "edit" && props.product}>
          {(p) => (
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => props.onDuplicateRequest?.(p())}
                class="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                <CopyPlus class="h-3.5 w-3.5" />
                Duplicar como novo
              </button>
              <Show when={props.canWrite}>
                <button
                  type="button"
                  onClick={() =>
                    props.onArchiveOrDelete?.(
                      p().id,
                      p().is_archived ? "restore" : "archive",
                    )
                  }
                  class="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  {p().is_archived ? "Restaurar" : "Arquivar"}
                </button>
                <button
                  type="button"
                  onClick={() => props.onArchiveOrDelete?.(p().id, "delete")}
                  class="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                >
                  Excluir
                </button>
              </Show>
            </div>
          )}
        </Show>
      </div>

      <Show when={errorMsg()}>
        <div class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-800">
          {errorMsg()}
        </div>
      </Show>

      <Show when={props.mode === "edit" && props.product?.links && !props.product.links.can_delete}>
        <div class="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-xs text-zinc-700">
          <strong>Histórico protegido:</strong> {props.product?.links?.impediment_reason}
        </div>
      </Show>

      {/* Section 1: Identification */}
      <section class="space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
        <h3 class="text-sm font-bold text-zinc-900">1. Identificação e Categorias</h3>
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <label class="block text-xs font-semibold text-zinc-700">Nome comercial *</label>
            <input
              type="text"
              required
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-sm focus:border-[#93509e] focus:outline-none"
            />
          </div>
          <div>
            <label class="block text-xs font-semibold text-zinc-700">SKU principal *</label>
            <input
              type="text"
              required
              value={sku()}
              onInput={(e) => setSku(e.currentTarget.value.toUpperCase())}
              class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 font-mono text-sm uppercase focus:border-[#93509e] focus:outline-none"
            />
          </div>
          <div>
            <label class="block text-xs font-semibold text-zinc-700">Marca</label>
            <select
              value={brandId()}
              onChange={(e) => setBrandId(e.currentTarget.value)}
              class="mt-1 h-9 w-full rounded-md border border-zinc-300 bg-white px-2.5 text-sm focus:border-[#93509e] focus:outline-none"
            >
              <option value="">Sem marca vinculada</option>
              <For each={props.brands}>
                {(b) => <option value={b.id}>{b.name}</option>}
              </For>
            </select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-zinc-700">
              Código de barras (GTIN/EAN)
            </label>
            <input
              type="text"
              value={gtin()}
              onInput={(e) => setGtin(e.currentTarget.value)}
              placeholder="Zeros à esquerda são preservados"
              class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 font-mono text-sm focus:border-[#93509e] focus:outline-none"
            />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-xs font-semibold text-zinc-700">Cód. fornecedor</label>
              <input
                type="text"
                value={supplierCode()}
                onInput={(e) => setSupplierCode(e.currentTarget.value)}
                class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-2.5 text-sm focus:border-[#93509e] focus:outline-none"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-zinc-700">Potência (W)</label>
              <input
                type="number"
                min="1"
                placeholder="Ex.: 48"
                value={powerWatts()}
                onInput={(e) => setPowerWatts(e.currentTarget.value)}
                class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-2.5 text-sm focus:border-[#93509e] focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Multi-category searchable selector + chips */}
        <div class="space-y-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <label class="text-xs font-semibold text-zinc-700">
              Categorias ({selectedCats().length} selecionadas)
            </label>
            <input
              type="search"
              placeholder="Filtrar categorias..."
              value={catQuery()}
              onInput={(e) => setCatQuery(e.currentTarget.value)}
              class="h-8 w-full rounded-md border border-zinc-300 px-2.5 text-xs sm:w-56 focus:border-[#93509e] focus:outline-none"
            />
          </div>
          <Show when={selectedCats().length > 0}>
            <div class="flex flex-wrap gap-1.5">
              <For each={props.categories.filter((c) => selectedCats().includes(c.id))}>
                {(c) => (
                  <button
                    type="button"
                    onClick={() => toggleCategory(c.id)}
                    class="inline-flex items-center gap-1 rounded-md border border-[#93509e] bg-purple-50 px-2 py-0.5 text-xs font-medium text-[#62298d]"
                  >
                    {c.name}
                    <X class="h-3 w-3" />
                  </button>
                )}
              </For>
            </div>
          </Show>
          <div class="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-md border border-zinc-200 p-2.5">
            <For each={filteredCategories()}>
              {(cat) => (
                <label class="inline-flex cursor-pointer items-center gap-1.5 rounded border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-50">
                  <input
                    type="checkbox"
                    checked={selectedCats().includes(cat.id)}
                    onChange={() => toggleCategory(cat.id)}
                    class="accent-[#93509e]"
                  />
                  {cat.name}
                </label>
              )}
            </For>
          </div>
        </div>
      </section>

      {/* Section 2: Pricing & Stock */}
      <section class="space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
        <h3 class="text-sm font-bold text-zinc-900">2. Preço, Estoque e Envio</h3>
        <div class="grid gap-3 sm:grid-cols-4">
          <div>
            <label class="block text-xs font-semibold text-zinc-700">Preço de venda (R$) *</label>
            <input
              type="text"
              inputMode="decimal"
              required
              value={priceBrl()}
              onInput={(e) => setPriceBrl(e.currentTarget.value)}
              class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-right font-semibold tabular-nums focus:border-[#93509e] focus:outline-none"
            />
          </div>
          <div>
            <label class="block text-xs font-semibold text-zinc-700">Promocional (R$)</label>
            <input
              type="text"
              inputMode="decimal"
              value={promoBrl()}
              onInput={(e) => setPromoBrl(e.currentTarget.value)}
              placeholder="Opcional"
              class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-right tabular-nums focus:border-[#93509e] focus:outline-none"
            />
          </div>
          <div>
            <label class="block text-xs font-semibold text-zinc-700">Custo (R$)</label>
            <input
              type="text"
              inputMode="decimal"
              value={costBrl()}
              onInput={(e) => setCostBrl(e.currentTarget.value)}
              placeholder="Interno"
              class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-right tabular-nums focus:border-[#93509e] focus:outline-none"
            />
          </div>
          <div>
            <label class="block text-xs font-semibold text-zinc-700">Peso envio (g)</label>
            <input
              type="number"
              min="1"
              value={weightGrams()}
              onInput={(e) => setWeightGrams(Number(e.currentTarget.value))}
              class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-right tabular-nums focus:border-[#93509e] focus:outline-none"
            />
          </div>
        </div>
        <Show when={discountPreview()}>
          {(d) => (
            <p class="text-xs font-medium text-[#62298d]">
              Desconto exibido na vitrine: <strong>-{d().pct}% OFF</strong> (economia de R$ {d().diff}).
            </p>
          )}
        </Show>
        <Show when={variantsDraft().length <= 1}>
          <div class="max-w-xs">
            <label class="block text-xs font-semibold text-zinc-700">
              Saldo físico em estoque
            </label>
            <input
              type="number"
              min="0"
              value={stockQty()}
              onInput={(e) => setStockQty(Number(e.currentTarget.value))}
              class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-right tabular-nums focus:border-[#93509e] focus:outline-none"
            />
          </div>
        </Show>
      </section>

      {/* Section 3: Media & Variations */}
      <section class="space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
        <h3 class="text-sm font-bold text-zinc-900">3. Imagem e Variações</h3>
        <div class="grid gap-3 sm:grid-cols-12">
          <div class="sm:col-span-8">
            <label class="block text-xs font-semibold text-zinc-700">Caminho ou URL da imagem</label>
            <input
              type="text"
              placeholder="/storage/products/..."
              value={imagePath()}
              onInput={(e) => setImagePath(e.currentTarget.value)}
              class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-xs focus:border-[#93509e] focus:outline-none"
            />
          </div>
          <div class="sm:col-span-4 flex items-end">
            <label class="inline-flex h-9 w-full cursor-pointer items-center justify-center rounded-md border border-zinc-300 bg-zinc-50 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100">
              {uploading() ? "Enviando..." : "Enviar arquivo de foto"}
              <input
                type="file"
                accept="image/*"
                class="hidden"
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  if (file) void uploadImage(file);
                }}
              />
            </label>
          </div>
        </div>
        <Show when={imagePath().trim()}>
          <div class="flex items-center gap-3 rounded-md border border-zinc-200 p-2.5 text-xs">
            <img
              src={assetUrl(imagePath())}
              alt={imageAlt() || name() || "Preview"}
              class="h-12 w-12 rounded border border-zinc-200 object-contain"
            />
            <span class="min-w-0 flex-1 truncate text-zinc-700">{imagePath()}</span>
            <button
              type="button"
              onClick={() => setImagePath("")}
              class="text-red-700 hover:underline"
            >
              Remover
            </button>
          </div>
        </Show>

        <div class="flex items-center justify-between pt-2 text-xs">
          <label class="inline-flex items-center gap-2 font-medium text-zinc-800">
            <input
              type="checkbox"
              checked={wholesaleGroupVariants()}
              onChange={(e) => setWholesaleGroupVariants(e.currentTarget.checked)}
              class="accent-[#93509e]"
            />
            Somar quantidades entre variações para atingir faixa de atacado
          </label>
        </div>

        <AdminVariantsEditor variants={variantsDraft()} onChange={setVariantsDraft} />

        <Show when={props.attributes.length > 0}>
          <div class="space-y-1.5 rounded-md border border-zinc-200 p-3 text-xs">
            <p class="font-semibold text-zinc-700">Especificações de filtro</p>
            <div class="flex flex-wrap gap-3">
              <For each={props.attributes}>
                {(attr) => (
                  <div>
                    <span class="text-[11px] font-bold text-zinc-500">{attr.name}: </span>
                    <For each={attr.values}>
                      {(val) => (
                        <label class="mr-2 inline-flex cursor-pointer items-center gap-1">
                          <input
                            type="checkbox"
                            checked={selectedAttrValueIds().includes(val.id)}
                            onChange={() => toggleAttr(val.id)}
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
      </section>

      {/* Section 4: Descriptions, SEO & Visibility */}
      <section class="space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-bold text-zinc-900">4. Descrição, SEO e Situação</h3>
          <Show when={props.mode === "edit" && props.product}>
            <div class="flex flex-wrap gap-1.5 text-xs">
              <button
                type="button"
                disabled={aiBusy()}
                onClick={() => void runAiAssist("improve_description")}
                class="inline-flex items-center gap-1 rounded border border-purple-200 px-2.5 py-1 font-semibold text-[#93509e] hover:bg-purple-50"
              >
                <Sparkles class="h-3.5 w-3.5" />
                Sugerir descrição com IA
              </button>
              <button
                type="button"
                disabled={aiBusy()}
                onClick={() => void runAiAssist("check_duplicates")}
                class="rounded border border-zinc-300 px-2.5 py-1 font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Verificar duplicidades
              </button>
            </div>
          </Show>
        </div>

        <Show when={aiAssist()}>
          {(res) => (
            <div class="space-y-2 rounded-lg border border-purple-200 bg-purple-50/60 p-3 text-xs">
              <Show when={res().issues.length > 0}>
                <p class="font-medium text-amber-800">{res().issues.join(" · ")}</p>
              </Show>
              <Show when={res().possible_duplicates.length > 0}>
                <p class="font-medium text-zinc-700">
                  Possíveis semelhantes: {res().possible_duplicates.map((d) => `${d.name} (${d.sku})`).join(", ")}
                </p>
              </Show>
              <p class="text-zinc-700">{res().proposed.description}</p>
              <button
                type="button"
                onClick={() => {
                  setShortDesc(res().proposed.short_description);
                  setFullDesc(res().proposed.description);
                  setSeoTitle(res().proposed.seo_title);
                  setSeoDesc(res().proposed.seo_description);
                  setAiAssist(null);
                }}
                class="rounded bg-[#93509e] px-3 py-1 font-bold text-white"
              >
                Aplicar sugestão ao cadastro
              </button>
            </div>
          )}
        </Show>

        <div class="grid gap-3">
          <div>
            <label class="block text-xs font-semibold text-zinc-700">Descrição curta</label>
            <input
              type="text"
              value={shortDesc()}
              onInput={(e) => setShortDesc(e.currentTarget.value)}
              class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-xs focus:border-[#93509e] focus:outline-none"
            />
          </div>
          <div>
            <label class="block text-xs font-semibold text-zinc-700">Descrição completa</label>
            <textarea
              rows={4}
              value={fullDesc()}
              onInput={(e) => setFullDesc(e.currentTarget.value)}
              class="mt-1 w-full rounded-md border border-zinc-300 p-3 text-xs focus:border-[#93509e] focus:outline-none"
            />
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="block text-xs font-semibold text-zinc-700">Slug URL</label>
              <input
                type="text"
                value={slug()}
                onInput={(e) => setSlug(e.currentTarget.value)}
                placeholder="Gerado automaticamente"
                class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-xs focus:border-[#93509e] focus:outline-none"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-zinc-700">Título SEO</label>
              <input
                type="text"
                value={seoTitle()}
                onInput={(e) => setSeoTitle(e.currentTarget.value)}
                class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-xs focus:border-[#93509e] focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label class="block text-xs font-semibold text-zinc-700">Meta description SEO</label>
            <input
              type="text"
              value={seoDesc()}
              onInput={(e) => setSeoDesc(e.currentTarget.value)}
              class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-xs focus:border-[#93509e] focus:outline-none"
            />
          </div>
        </div>

        <div class="flex flex-wrap gap-4 border-t border-zinc-100 pt-3 text-xs font-medium text-zinc-800">
          <label class="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={isActive()}
              onChange={(e) => setIsActive(e.currentTarget.checked)}
              class="accent-[#93509e]"
            />
            Ativo na vitrine
          </label>
          <label class="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={isFeatured()}
              onChange={(e) => setIsFeatured(e.currentTarget.checked)}
              class="accent-[#93509e]"
            />
            Destaque
          </label>
          <label class="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={isNew()}
              onChange={(e) => setIsNew(e.currentTarget.checked)}
              class="accent-[#93509e]"
            />
            Novidade
          </label>
        </div>
      </section>

      {/* Sticky Save bar */}
      <div class="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-sm">
        <button
          type="button"
          onClick={() => props.onCancel()}
          class="rounded-md border border-zinc-300 px-3.5 py-2 text-xs font-semibold text-zinc-700"
        >
          Cancelar
        </button>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy()}
            onClick={() => void submitForm(true)}
            class="inline-flex items-center gap-1 rounded-md border border-[#93509e] px-3.5 py-2 text-xs font-bold text-[#93509e] hover:bg-purple-50 disabled:opacity-60"
          >
            <Plus class="h-3.5 w-3.5" />
            Salvar e cadastrar próximo
          </button>
          <button
            type="submit"
            disabled={busy()}
            class="rounded-md bg-[#93509e] px-5 py-2 text-xs font-bold text-white hover:bg-[#7c3f87] disabled:opacity-60"
          >
            {busy() ? "Salvando..." : "Salvar produto"}
          </button>
        </div>
      </div>
    </form>
  );
}
