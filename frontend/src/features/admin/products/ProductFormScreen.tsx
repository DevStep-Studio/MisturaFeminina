import ArrowLeft from "lucide-solid/icons/arrow-left";
import CopyPlus from "lucide-solid/icons/copy-plus";
import Plus from "lucide-solid/icons/plus";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import Sparkles from "lucide-solid/icons/sparkles";
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from "solid-js";
import { ApiError, api } from "../../../lib/api";
import {
  calculateUnitMarginPreview,
  calculateWholesaleTierEstimates,
  formatBrlSigned,
  formatMarginPercentage,
  formatNullableCostInput,
  parseBrlNullableCost,
} from "../profit-math";
import {
  AdminButton,
  AdminCombobox,
  AdminField,
  AdminImageUpload,
  AdminInput,
  AdminModal,
  AdminMultiCombobox,
} from "../ui";
import { buildCategoryHierarchyOptions } from "../categories/category-helpers";
import {
  VariationMatrixBuilder,
  type CatalogAttrItem,
} from "./VariationMatrixBuilder";
import {
  type VariationAttributeDraft,
  type VariationRowDraft,
  type VariationRowErrorMap,
  buildVariationPersistencePayload,
  mapServerValidationErrorsToVariationRows,
  reconstructInitialVariationState,
  validateVariationRows,
} from "./variation-matrix";
import {
  type AdminProductRow,
  type BrandOption,
  type CategoryOption,
  formatBrlFromCents,
} from "./types";

export interface AttributeOption {
  id: number;
  name: string;
  slug?: string;
  display_type?: string;
  values: Array<{
    id: number;
    value: string;
    slug?: string;
    color_hex?: string | null;
  }>;
}

export function ProductFormScreen(props: {
  mode: "create" | "edit";
  product: AdminProductRow | null;
  duplicateFrom?: AdminProductRow | null;
  brands: BrandOption[];
  categories: CategoryOption[];
  attributes: AttributeOption[];
  canWrite: boolean;
  canCostView?: boolean;
  canCostWrite?: boolean;
  onCancel: () => void;
  onSaved: (
    message: string,
    stayAndReset?: boolean,
    savedId?: number,
  ) => Promise<void> | void;
  onDuplicateRequest?: (product: AdminProductRow) => void;
  onArchiveOrDelete?: (
    productId: number,
    action: "archive" | "restore" | "delete",
  ) => void;
  onCategoryCreated?: () => Promise<unknown> | void;
}) {
  const [name, setName] = createSignal("");
  const [slug, setSlug] = createSignal("");
  const [sku, setSku] = createSignal("");
  const [gtin, setGtin] = createSignal("");
  const [supplierCode, setSupplierCode] = createSignal("");
  const [powerWatts, setPowerWatts] = createSignal("");
  const [brandId, setBrandId] = createSignal("");
  const [primaryCategoryId, setPrimaryCategoryId] = createSignal("");
  const [selectedCats, setSelectedCats] = createSignal<number[]>([]);
  const [localAddedCategories, setLocalAddedCategories] = createSignal<CategoryOption[]>([]);
  const [quickCatOpen, setQuickCatOpen] = createSignal(false);
  const [quickCatName, setQuickCatName] = createSignal("");
  const [quickCatParentId, setQuickCatParentId] = createSignal("");
  const [quickCatBusy, setQuickCatBusy] = createSignal(false);
  const [quickCatErr, setQuickCatErr] = createSignal<string | null>(null);

  const mergedCategories = createMemo<CategoryOption[]>(() => {
    const map = new Map<number, CategoryOption>();
    for (const c of props.categories ?? []) map.set(c.id, c);
    for (const c of localAddedCategories()) map.set(c.id, c);
    return Array.from(map.values());
  });

  const categoryHierarchyOptions = createMemo(() =>
    buildCategoryHierarchyOptions(
      mergedCategories().map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug ?? "",
        parent_id: c.parent_id ?? null,
        sort_order: c.sort_order,
        full_path: c.full_path,
      })),
    ),
  );
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
  const [unitLabel, setUnitLabel] = createSignal("");
  const [selectedAttrValueIds, setSelectedAttrValueIds] = createSignal<
    number[]
  >([]);
  const [hasVariants, setHasVariants] = createSignal(false);
  const [variationAttributes, setVariationAttributes] = createSignal<
    VariationAttributeDraft[]
  >([]);
  const [variationRows, setVariationRows] = createSignal<VariationRowDraft[]>(
    [],
  );
  const [legacySimpleStock, setLegacySimpleStock] = createSignal(0);
  const [confirmDisableImpact, setConfirmDisableImpact] = createSignal(false);
  const [variationRowErrors, setVariationRowErrors] = createSignal<
    Record<string, VariationRowErrorMap>
  >({});
  const [serverVariantErrors, setServerVariantErrors] = createSignal<
    Record<string, string[]>
  >({});
  const [variationSectionError, setVariationSectionError] = createSignal<
    string | null
  >(null);
  const [createdCatalogAttrs, setCreatedCatalogAttrs] = createSignal<
    CatalogAttrItem[]
  >([]);

  const mergedCatalogAttributes = createMemo<CatalogAttrItem[]>(() => {
    const map = new Map<string, CatalogAttrItem>();
    for (const a of props.attributes ?? []) {
      map.set(a.slug || a.name.toLowerCase(), a);
    }
    for (const a of createdCatalogAttrs()) {
      map.set(a.slug || a.name.toLowerCase(), a);
    }
    return Array.from(map.values());
  });

  const [busy, setBusy] = createSignal(false);
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null);
  const [fieldErrors, setFieldErrors] = createSignal<Record<string, string[]>>(
    {},
  );
  const [aiBusy, setAiBusy] = createSignal(false);
  const [descEditedByUser, setDescEditedByUser] = createSignal(false);
  const [autoGeneratedBanner, setAutoGeneratedBanner] = createSignal<string | null>(null);
  const [aiErrorOrNotice, setAiErrorOrNotice] = createSignal<string | null>(null);
  const [lastAutoSignature, setLastAutoSignature] = createSignal("");
  const [aiAssist, setAiAssist] = createSignal<{
    issues: string[];
    ai_used?: boolean;
    ai_notice?: string | null;
    possible_duplicates: Array<{ id: number; name: string; sku: string }>;
    proposed: {
      short_description: string;
      description: string;
      seo_title: string;
      seo_description: string;
    };
  } | null>(null);

  const canViewCost = () => props.canCostView ?? true;
  const canWriteCost = () => props.canCostWrite ?? true;
  const [wholesaleTiersDraft, setWholesaleTiersDraft] = createSignal<
    Array<{ min_qty: number; discount_percent?: number; price_cents?: number }>
  >([]);
  const [reusedCostNotice, setReusedCostNotice] = createSignal(false);
  const [applyAllVariantsConfirm, setApplyAllVariantsConfirm] = createSignal(false);

  createEffect(() => {
    const src = props.product ?? props.duplicateFrom;
    const isDuplicate = !props.product && !!props.duplicateFrom;

    if (!src || typeof src !== "object" || !("id" in src) || !src.id) {
      resetBlankForm();
      return;
    }

    const initVar = reconstructInitialVariationState(src, isDuplicate);

    setName(isDuplicate ? `${src.name ?? ""} (Cópia)` : (src.name ?? ""));
    setSlug(isDuplicate ? "" : (src.slug ?? ""));
    setSku(isDuplicate ? "" : (src.sku ?? ""));
    setGtin(isDuplicate ? "" : (src.gtin ?? ""));
    setSupplierCode(src.supplier_code ?? "");
    setPowerWatts(src.power_watts ? String(src.power_watts) : "");
    setUnitLabel(src.unit_label ?? "");
    setBrandId(src.brand_id ? String(src.brand_id) : "");
    const catsArr = src.categories ?? [];
    const primaryCat =
      catsArr.find((c) => Boolean(c.pivot?.is_primary)) ?? catsArr[0];
    setPrimaryCategoryId(primaryCat ? String(primaryCat.id) : "");
    setSelectedCats(catsArr.map((c) => c.id));
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
    setCostBrl(formatNullableCostInput(src.cost_cents));
    const hasReusedCost =
      isDuplicate &&
      ((src.cost_cents !== null && src.cost_cents !== undefined) ||
        (src.variants ?? []).some(
          (v) => v.cost_cents !== null && v.cost_cents !== undefined,
        ));
    setReusedCostNotice(hasReusedCost);
    setWholesaleTiersDraft(
      (src.wholesale_tiers ?? []).map((t) => ({ ...t })),
    );
    setStockQty(isDuplicate ? 0 : initVar.legacySimpleStock);
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
    setHasVariants(initVar.hasVariants);
    setVariationAttributes(initVar.attributes);
    setVariationRows(initVar.rows);
    setLegacySimpleStock(isDuplicate ? 0 : initVar.legacySimpleStock);
    setConfirmDisableImpact(false);
    setVariationRowErrors({});
    setServerVariantErrors({});
    setVariationSectionError(null);
    setApplyAllVariantsConfirm(false);
    setDescEditedByUser(Boolean(src.description || src.short_description));
    setAutoGeneratedBanner(null);
    setAiErrorOrNotice(null);
    setLastAutoSignature("");
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
    setUnitLabel("");
    setBrandId("");
    setPrimaryCategoryId("");
    setSelectedCats([]);
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
    setHasVariants(false);
    setVariationAttributes([]);
    setVariationRows([]);
    setLegacySimpleStock(0);
    setConfirmDisableImpact(false);
    setVariationRowErrors({});
    setServerVariantErrors({});
    setVariationSectionError(null);
    setWholesaleTiersDraft([]);
    setReusedCostNotice(false);
    setApplyAllVariantsConfirm(false);
    setDescEditedByUser(false);
    setAutoGeneratedBanner(null);
    setAiErrorOrNotice(null);
    setLastAutoSignature("");
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

  const parsedCost = createMemo(() => parseBrlNullableCost(costBrl()));

  const marginEstimate = createMemo(() => {
    const regular = parseBrl(priceBrl());
    const promo = promoBrl().trim() ? parseBrl(promoBrl()) : null;
    const costVal = parsedCost();
    return calculateUnitMarginPreview({
      regularPriceCents: regular,
      promoPriceCents: promo,
      costCents: costVal.valid ? costVal.cents : null,
    });
  });

  const wholesaleTierEstimates = createMemo(() => {
    const est = marginEstimate();
    const tiersSource =
      wholesaleTiersDraft().length > 0
        ? wholesaleTiersDraft()
        : (props.product?.wholesale_condition?.tiers ?? []);
    return calculateWholesaleTierEstimates(
      tiersSource,
      est.effectivePriceCents,
      est.costCents,
    );
  });

  const discountPreview = createMemo(() => {
    const regular = parseBrl(priceBrl());
    const promo = parseBrl(promoBrl());
    if (!regular || !promo || promo >= regular) return null;
    const pct = Math.round(((regular - promo) / regular) * 100);
    return { pct, diff: ((regular - promo) / 100).toFixed(2).replace(".", ",") };
  });

  function toggleCategory(id: number) {
    setSelectedCats((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const primaryCategoryPath = createMemo(() => {
    const val = primaryCategoryId();
    if (!val) return "";
    return (
      categoryHierarchyOptions().find((opt) => opt.value === val)?.label ?? ""
    );
  });

  async function handleQuickCreateCategory(e: Event) {
    e.preventDefault();
    const trimmed = quickCatName().trim();
    if (!trimmed) {
      setQuickCatErr("Informe o nome da nova categoria.");
      return;
    }
    setQuickCatBusy(true);
    setQuickCatErr(null);
    try {
      const res = await api<{ data: CategoryOption }>("/admin/categories", {
        method: "POST",
        body: {
          name: trimmed,
          parent_id: quickCatParentId() ? Number(quickCatParentId()) : null,
          is_active: true,
          show_in_menu: true,
        },
      });
      const created = res.data;
      setLocalAddedCategories((prev) => [...prev, created]);
      if (!primaryCategoryId()) {
        setPrimaryCategoryId(String(created.id));
      }
      setSelectedCats((prev) =>
        prev.includes(created.id) ? prev : [...prev, created.id],
      );
      setQuickCatName("");
      setQuickCatParentId("");
      setQuickCatOpen(false);
      await props.onCategoryCreated?.();
    } catch (err) {
      setQuickCatErr(
        err instanceof ApiError
          ? err.message
          : "Não foi possível criar a categoria.",
      );
    } finally {
      setQuickCatBusy(false);
    }
  }

  function toggleAttr(id: number) {
    setSelectedAttrValueIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const selectedBrandName = createMemo(() => {
    const id = brandId();
    if (!id) return "";
    return props.brands.find((b) => String(b.id) === id)?.name ?? "";
  });

  const selectedSpecLabels = createMemo(() => {
    const ids = new Set(selectedAttrValueIds());
    const out: string[] = [];
    for (const attr of mergedCatalogAttributes()) {
      for (const v of attr.values) {
        if (ids.has(v.id)) out.push(`${attr.name}: ${v.value}`);
      }
    }
    return out;
  });

  async function generateDescriptionFromCurrentForm(opts?: {
    autoApplyWhenUntouched?: boolean;
  }) {
    const prodName = name().trim();
    if (prodName.length < 3 || aiBusy()) return;

    setAiBusy(true);
    setAiErrorOrNotice(null);
    try {
      const res = await api<{
        data: {
          ai_used: boolean;
          ai_status: string;
          ai_notice: string | null;
          possible_duplicates: Array<{ id: number; name: string; sku: string }>;
          proposed: {
            short_description: string;
            description: string;
            seo_title: string;
            seo_description: string;
          };
        };
      }>("/admin/products/generate-description", {
        method: "POST",
        body: {
          product_id: props.product?.id ?? null,
          name: prodName,
          sku: sku().trim() || null,
          gtin: gtin().trim() || null,
          brand_name: selectedBrandName() || null,
          category_path: primaryCategoryPath() || null,
          unit_label: unitLabel().trim() || null,
          weight_grams: Number(weightGrams()) || null,
          power_watts: powerWatts().trim()
            ? Number.parseInt(powerWatts().trim(), 10) || null
            : null,
          specs: selectedSpecLabels(),
          variants: variationRows()
            .filter((r) => r.enabled && !r.is_archived && r.name.trim())
            .map((r) => r.name.trim()),
        },
      });

      const d = res.data;
      const hasExistingContent =
        Boolean(shortDesc().trim() || fullDesc().trim()) || descEditedByUser();

      if (opts?.autoApplyWhenUntouched && !hasExistingContent) {
        setShortDesc(d.proposed.short_description);
        setFullDesc(d.proposed.description);
        if (!seoTitle().trim()) setSeoTitle(d.proposed.seo_title);
        if (!seoDesc().trim()) setSeoDesc(d.proposed.seo_description);
        setAutoGeneratedBanner(
          d.ai_used
            ? "Sugestão gerada automaticamente com IA a partir dos dados informados. Revise e edite livremente antes de salvar."
            : d.ai_notice ||
                "Sugestão preenchida com os dados confirmados do cadastro. Revise antes de salvar.",
        );
        if (d.possible_duplicates?.length > 0) {
          setAiAssist({
            issues: [],
            ai_used: d.ai_used,
            ai_notice: d.ai_notice,
            possible_duplicates: d.possible_duplicates,
            proposed: d.proposed,
          });
        }
      } else {
        // Never overwrite existing or edited descriptions silently!
        setAiAssist({
          issues: [],
          ai_used: d.ai_used,
          ai_notice: d.ai_notice,
          possible_duplicates: d.possible_duplicates ?? [],
          proposed: d.proposed,
        });
      }
    } catch (err) {
      setAiErrorOrNotice(
        err instanceof ApiError
          ? `Não foi possível gerar a descrição automática (${err.message}). Você pode preencher manualmente e salvar o produto normalmente.`
          : "Serviço de geração de descrição indisponível no momento. Você pode preencher manualmente e salvar o produto normalmente.",
      );
    } finally {
      setAiBusy(false);
    }
  }

  // Auto-generate initial reviewable suggestion when adding a new product with sufficient context
  let autoDescTimer: number | undefined;
  onCleanup(() => {
    if (autoDescTimer) window.clearTimeout(autoDescTimer);
  });

  createEffect(() => {
    if (props.mode !== "create" || props.duplicateFrom) return;
    const prodName = name().trim();
    const cat = primaryCategoryPath();
    const brand = selectedBrandName();
    const unit = unitLabel().trim();
    const hasEnoughInfo =
      prodName.length >= 5 && Boolean(cat || brand || unit || prodName.split(/\s+/).length >= 3);

    if (!hasEnoughInfo || descEditedByUser() || shortDesc().trim() || fullDesc().trim()) {
      return;
    }

    const sig = `${prodName}|${brand}|${cat}|${unit}`;
    if (sig === lastAutoSignature()) return;

    if (autoDescTimer) window.clearTimeout(autoDescTimer);
    autoDescTimer = window.setTimeout(() => {
      setLastAutoSignature(sig);
      void generateDescriptionFromCurrentForm({ autoApplyWhenUntouched: true });
    }, 950);
  });

  async function runAiAssist(
    action: "improve_description" | "audit_catalog" | "check_duplicates",
  ) {
    if (action === "improve_description") {
      await generateDescriptionFromCurrentForm({ autoApplyWhenUntouched: false });
      return;
    }
    if (!props.product?.id) return;
    setAiBusy(true);
    setAiErrorOrNotice(null);
    try {
      const res = await api<{
        data: {
          issues: string[];
          ai_used?: boolean;
          ai_notice?: string | null;
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
    } catch (err) {
      setAiErrorOrNotice(
        err instanceof ApiError
          ? `Não foi possível consultar o assistente (${err.message}). O salvamento do produto permanece liberado.`
          : "Assistente temporariamente indisponível. O salvamento do produto permanece liberado.",
      );
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

    const costParsed = parseBrlNullableCost(costBrl());
    if (canWriteCost() && !costParsed.valid) {
      setErrorMsg("Informe um custo unitário válido (>= R$ 0,00) ou deixe em branco.");
      return;
    }

    setVariationRowErrors({});
    setServerVariantErrors({});
    setVariationSectionError(null);

    if (hasVariants()) {
      const enabledCount = variationRows().filter(
        (r) => r.enabled && !r.is_archived,
      ).length;
      if (enabledCount === 0) {
        const msg =
          'Adicione e habilite ao menos uma combinação vendável ou desative "Este produto tem variações".';
        setVariationSectionError(msg);
        setErrorMsg(msg);
        return;
      }
      const varValidation = validateVariationRows(variationRows());
      if (!varValidation.valid) {
        setVariationRowErrors(varValidation.rowErrors);
        setVariationSectionError(varValidation.summaryMessage);
        setErrorMsg(
          varValidation.summaryMessage ||
            "Revise os campos destacados na grade de variações.",
        );
        return;
      }
    }

    const variationPayload = buildVariationPersistencePayload({
      hasVariants: hasVariants(),
      attributes: variationAttributes(),
      rows: variationRows(),
      parentPriceCents: priceCents,
      parentPromoPriceCents: promoCents,
      simpleStockQty: Number(stockQty()) || 0,
      confirmDisableImpact: confirmDisableImpact(),
    });

    const sanitizedVariants = variationPayload.variants?.map((v) =>
      canWriteCost()
        ? v
        : {
            ...v,
            cost_cents: undefined,
          },
    );

    const payload = {
      name: name().trim(),
      slug: slug().trim() || undefined,
      sku: sku().trim().toUpperCase(),
      gtin: gtin().trim() || null,
      supplier_code: supplierCode().trim() || null,
      power_watts: powerWatts().trim() ? Number.parseInt(powerWatts().trim(), 10) || null : null,
      unit_label: unitLabel().trim() || null,
      brand_id: brandId() ? Number(brandId()) : null,
      primary_category_id: primaryCategoryId()
        ? Number(primaryCategoryId())
        : null,
      category_ids: (() => {
        const primary = primaryCategoryId()
          ? Number(primaryCategoryId())
          : null;
        const base = selectedCats();
        if (primary && !base.includes(primary)) return [primary, ...base];
        return base;
      })(),
      price_cents: priceCents,
      promo_price_cents: promoCents,
      ...(canWriteCost() ? { cost_cents: costParsed.cents } : {}),
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
      has_variants: variationPayload.has_variants,
      product_type: variationPayload.product_type,
      confirm_disable_variations: variationPayload.confirm_disable_variations,
      variation_attributes: variationPayload.variation_attributes,
      ...(variationPayload.stock_qty !== undefined
        ? { stock_qty: variationPayload.stock_qty }
        : {}),
      ...(sanitizedVariants !== undefined ? { variants: sanitizedVariants } : {}),
      images: imagePath().trim()
        ? [
            {
              path: imagePath().trim(),
              alt_text: imageAlt().trim() || name().trim(),
              is_primary: true,
            },
          ]
        : [],
    };

    setFieldErrors({});
    setBusy(true);
    try {
      if (props.mode === "edit" && props.product) {
        await api(`/admin/products/${props.product.id}`, {
          method: "PUT",
          body: payload,
        });
        await props.onSaved(
          `Produto "${name().trim()}" atualizado com sucesso.`,
          stayAndNext,
          props.product.id,
        );
      } else {
        const res = await api<{ data?: { id?: number } }>("/admin/products", {
          method: "POST",
          body: payload,
        });
        if (stayAndNext) {
          resetBlankForm();
        }
        await props.onSaved(
          `Produto "${name().trim()}" cadastrado com sucesso.`,
          stayAndNext,
          res.data?.id,
        );
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.validation ?? {});
        const mappedServer = mapServerValidationErrorsToVariationRows(
          err.validation,
          variationRows(),
        );
        setServerVariantErrors(mappedServer.byRowKey);
        setVariationSectionError(mappedServer.sectionError);
        setErrorMsg(err.message);
      } else {
        setErrorMsg("Não foi possível salvar o produto.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleArchiveSavedVariant(variantId: number) {
    if (!props.product) return;
    try {
      const res = await api<{ data?: AdminProductRow }>(
        `/admin/products/${props.product.id}/variants/${variantId}/archive`,
        { method: "POST" },
      );
      if (res.data) {
        const refreshed = reconstructInitialVariationState(res.data, false);
        setVariationAttributes(refreshed.attributes);
        setVariationRows(refreshed.rows);
      } else {
        setVariationRows((prev) =>
          prev.map((r) =>
            r.id === variantId
              ? { ...r, enabled: false, is_archived: true, is_active: false }
              : r,
          ),
        );
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setVariationSectionError(err.message);
      }
    }
  }

  async function handleRestoreSavedVariant(variantId: number) {
    if (!props.product) return;
    try {
      const res = await api<{ data?: AdminProductRow }>(
        `/admin/products/${props.product.id}/variants/${variantId}/restore`,
        { method: "POST" },
      );
      if (res.data) {
        const refreshed = reconstructInitialVariationState(res.data, false);
        setVariationAttributes(refreshed.attributes);
        setVariationRows(refreshed.rows);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setVariationSectionError(err.message);
      }
    }
  }

  return (
    <>
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submitForm(false);
      }}
      class="mx-auto max-w-6xl space-y-6 pb-24"
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
      <section class="space-y-4 rounded-[12px] border border-zinc-200/90 bg-white p-5">
        <h3 class="text-sm font-bold text-zinc-900">1. Identificação e Categorias</h3>
        <div class="grid gap-3 sm:grid-cols-2">
          <AdminField
            label="Nome comercial"
            forId="pf-name-input"
            required
            error={fieldErrors().name?.[0]}
            class="sm:col-span-2"
          >
            <AdminInput
              id="pf-name-input"
              type="text"
              required
              value={name()}
              hasError={Boolean(fieldErrors().name?.[0])}
              onInput={(e) => setName(e.currentTarget.value)}
            />
          </AdminField>

          <AdminField
            label="SKU principal"
            forId="pf-sku-input"
            required
            error={fieldErrors().sku?.[0]}
          >
            <AdminInput
              id="pf-sku-input"
              type="text"
              mono
              required
              value={sku()}
              hasError={Boolean(fieldErrors().sku?.[0])}
              onInput={(e) => setSku(e.currentTarget.value.toUpperCase())}
              class="uppercase"
            />
          </AdminField>

          <AdminCombobox
            label="Marca"
            placeholder="Sem marca vinculada"
            searchPlaceholder="Buscar marca pelo nome..."
            value={brandId()}
            options={props.brands.map((b) => ({
              value: String(b.id),
              label: b.name,
            }))}
            onChange={(val) => setBrandId(val)}
            error={fieldErrors().brand_id?.[0]}
          />

          <AdminField
            label="Código de barras (GTIN/EAN)"
            forId="pf-gtin-input"
            error={fieldErrors().gtin?.[0]}
          >
            <AdminInput
              id="pf-gtin-input"
              type="text"
              mono
              value={gtin()}
              placeholder="Zeros à esquerda são preservados"
              onInput={(e) => setGtin(e.currentTarget.value)}
            />
          </AdminField>

          <div class="grid grid-cols-2 gap-2">
            <AdminField label="Cód. fornecedor" forId="pf-sup-input">
              <AdminInput
                id="pf-sup-input"
                type="text"
                value={supplierCode()}
                onInput={(e) => setSupplierCode(e.currentTarget.value)}
              />
            </AdminField>
            <AdminField label="Potência (W)" forId="pf-watts-input">
              <AdminInput
                id="pf-watts-input"
                type="number"
                min="1"
                placeholder="Ex.: 48"
                value={powerWatts()}
                onInput={(e) => setPowerWatts(e.currentTarget.value)}
              />
            </AdminField>
          </div>
        </div>

        {/* Hierarchical Categories Selection */}
        <div class="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/70 p-3.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span class="block text-xs font-bold text-zinc-900">
                Categorias (até 3+ níveis)
              </span>
              <Show
                when={primaryCategoryPath()}
                fallback={
                  <span class="text-[11px] text-zinc-500">
                    Selecione a categoria principal e, se precisar, categorias complementares.
                  </span>
                }
              >
                {(path) => (
                  <span class="text-[11px] font-medium text-[#62298d]">
                    Caminho principal: {path()}
                  </span>
                )}
              </Show>
            </div>
            <Show when={props.canWrite}>
              <AdminButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setQuickCatErr(null);
                  setQuickCatParentId(primaryCategoryId());
                  setQuickCatOpen(true);
                }}
              >
                <Plus class="h-3.5 w-3.5" />
                Nova categoria
              </AdminButton>
            </Show>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <AdminCombobox
              label="Categoria principal"
              placeholder="Selecionar categoria principal..."
              searchPlaceholder="Buscar categoria (Ex.: Brocas Diamantadas)..."
              value={primaryCategoryId()}
              options={categoryHierarchyOptions()}
              onChange={(val) => {
                setPrimaryCategoryId(val);
                const idNum = Number(val);
                if (idNum && !selectedCats().includes(idNum)) {
                  setSelectedCats((prev) => [idNum, ...prev]);
                }
              }}
            />

            <AdminMultiCombobox
              label="Categorias (principal + complementares)"
              placeholder="Pesquisar e selecionar categorias por teclado..."
              selectedValues={selectedCats().map(String)}
              options={categoryHierarchyOptions()}
              onToggleValue={(val) => {
                const idNum = Number(val);
                toggleCategory(idNum);
                if (Number(primaryCategoryId()) === idNum && selectedCats().includes(idNum)) {
                  const next = selectedCats().filter((x) => x !== idNum);
                  setPrimaryCategoryId(next[0] ? String(next[0]) : "");
                } else if (!primaryCategoryId() && !selectedCats().includes(idNum)) {
                  setPrimaryCategoryId(String(idNum));
                }
              }}
              onClearAll={() => {
                setSelectedCats([]);
                setPrimaryCategoryId("");
              }}
            />
          </div>
        </div>
      </section>

      {/* Section 2: Preços e custos */}
      <section class="space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-bold text-zinc-900">2. Preços e custos</h3>
          <Show when={reusedCostNotice()}>
            <span class="rounded border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900">
              Valores reaproveitados da duplicação — revise preço e custo unitário antes de salvar.
            </span>
          </Show>
        </div>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

          <Show when={canViewCost()}>
            <div>
              <div class="flex items-center justify-between gap-2">
                <label class="block text-xs font-semibold text-zinc-700">
                  Custo unitário da mercadoria (R$)
                </label>
                <span class="text-[11px] font-medium text-zinc-500">
                  {parsedCost().valid
                    ? parsedCost().cents === null
                      ? "Custo não informado"
                      : parsedCost().cents === 0
                        ? "R$ 0,00 informado"
                        : "Informado"
                    : "Valor inválido"}
                </span>
              </div>
              <input
                type="text"
                inputMode="decimal"
                disabled={!canWriteCost()}
                value={costBrl()}
                onInput={(e) => setCostBrl(e.currentTarget.value)}
                placeholder="Vazio = não informado (ex.: 30,00)"
                class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-right tabular-nums focus:border-[#93509e] focus:outline-none disabled:bg-zinc-100"
              />
              <p class="mt-1 text-[11px] text-zinc-500">
                Quanto a loja pagou por uma unidade deste produto. Deixe vazio se ainda não souber; digite 0,00 apenas se o custo real for zero.
              </p>
            </div>
          </Show>
        </div>

        {/* Live Gross Profit & Margin Preview */}
        <Show when={canViewCost()}>
          <div
            class={`rounded-md border p-3 text-xs ${
              marginEstimate().isLoss
                ? "border-red-200 bg-red-50/70"
                : "border-zinc-200 bg-zinc-50"
            }`}
          >
            <Show
              when={marginEstimate().activePriceType === "promo"}
            >
              <p class="mb-2 text-[11px] font-semibold text-[#62298d]">
                Prévia calculada sobre o preço promocional ativo ({formatBrlFromCents(marginEstimate().effectivePriceCents)}) em vez do preço normal.
              </p>
            </Show>
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Lucro bruto estimado por unidade
                </p>
                <p
                  class={`mt-0.5 text-base font-bold tabular-nums ${
                    marginEstimate().isLoss
                      ? "text-red-700"
                      : marginEstimate().profitCents !== null
                        ? "text-zinc-900"
                        : "text-zinc-500"
                  }`}
                >
                  {marginEstimate().profitCents !== null
                    ? formatBrlSigned(marginEstimate().profitCents!)
                    : "Custo não informado"}
                  <Show when={marginEstimate().isLoss}>
                    <span class="ml-1.5 text-xs font-semibold">(abaixo do custo)</span>
                  </Show>
                </p>
              </div>
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Margem bruta estimada
                </p>
                <p
                  class={`mt-0.5 text-base font-bold tabular-nums ${
                    marginEstimate().isLoss ? "text-red-700" : "text-[#62298d]"
                  }`}
                >
                  {marginEstimate().costState === "uninformed"
                    ? "Indisponível"
                    : formatMarginPercentage(marginEstimate().marginPct, {
                        compactWhole: true,
                      })}
                </p>
              </div>
            </div>
          </div>
        </Show>

        <div class="grid gap-3 sm:grid-cols-3">
          <div>
            <label class="block text-xs font-semibold text-zinc-700">Preço promocional (R$)</label>
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
            <label class="block text-xs font-semibold text-zinc-700">Peso envio (g)</label>
            <input
              type="number"
              min="1"
              value={weightGrams()}
              onInput={(e) => setWeightGrams(Number(e.currentTarget.value))}
              class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-right tabular-nums focus:border-[#93509e] focus:outline-none"
            />
          </div>
          <Show when={!hasVariants()}>
            <div>
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
        </div>

        <Show when={discountPreview()}>
          {(d) => (
            <p class="text-xs font-medium text-[#62298d]">
              Desconto exibido na vitrine: <strong>-{d().pct}% OFF</strong> (economia de R$ {d().diff}).
            </p>
          )}
        </Show>

        <Show
          when={
            canWriteCost() &&
            hasVariants() &&
            variationRows().filter((r) => r.enabled && !r.is_archived).length > 1
          }
        >
          <div class="space-y-2 border-t border-zinc-100 pt-3 text-xs">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="text-zinc-600">
                Este produto possui{" "}
                {variationRows().filter((r) => r.enabled && !r.is_archived).length}{" "}
                variações ativas com edição individual de custo abaixo.
              </span>
              <button
                type="button"
                onClick={() => setApplyAllVariantsConfirm((v) => !v)}
                class="rounded-md border border-[#93509e] bg-white px-3 py-1.5 font-semibold text-[#93509e] hover:bg-purple-50"
              >
                Aplicar custo a todas as variações
              </button>
            </div>
            <Show when={applyAllVariantsConfirm()}>
              <div class="space-y-2 rounded-md border border-purple-200 bg-purple-50/40 p-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span class="font-semibold text-zinc-900">
                    Confirmar aplicação de{" "}
                    {parsedCost().valid && parsedCost().cents !== null
                      ? formatBrlFromCents(parsedCost().cents)
                      : "Não informado"}{" "}
                    para{" "}
                    {variationRows().filter((r) => r.enabled && !r.is_archived).length}{" "}
                    SKU(s)
                  </span>
                  <div class="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setApplyAllVariantsConfirm(false)}
                      class="rounded border border-zinc-300 bg-white px-2.5 py-1 font-semibold"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const targetCents = parsedCost().valid ? parsedCost().cents : null;
                        setVariationRows((prev) =>
                          prev.map((item) =>
                            item.enabled && !item.is_archived
                              ? { ...item, cost_cents: targetCents }
                              : item,
                          ),
                        );
                        setApplyAllVariantsConfirm(false);
                      }}
                      class="rounded bg-[#93509e] px-3 py-1 font-bold text-white hover:bg-[#7c3f87]"
                    >
                      Confirmar para todas
                    </button>
                  </div>
                </div>
                <div class="max-h-28 overflow-y-auto text-[11px] text-zinc-700">
                  <For each={variationRows().filter((r) => r.enabled && !r.is_archived)}>
                    {(vr) => (
                      <div class="flex justify-between border-b border-purple-100 py-0.5">
                        <span class="font-mono">{vr.sku || vr.name}</span>
                        <span class="tabular-nums">
                          {vr.cost_cents !== null && vr.cost_cents !== undefined
                            ? formatBrlFromCents(vr.cost_cents)
                            : "Não informado"}{" "}
                          →{" "}
                          {parsedCost().valid && parsedCost().cents !== null
                            ? formatBrlFromCents(parsedCost().cents)
                            : "Não informado"}
                        </span>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </div>
        </Show>
      </section>

      {/* Section 3: Media & Variations */}
      <section class="space-y-4 rounded-[12px] border border-zinc-200/90 bg-white p-5">
        <h3 class="text-sm font-bold text-zinc-900">3. Imagem e Variações</h3>
        <div class="grid gap-3 sm:grid-cols-12">
          <div class="sm:col-span-6">
            <AdminImageUpload
              label="Foto principal do produto"
              folder="products"
              value={imagePath()}
              altText={imageAlt() || name() || "Prévia do produto"}
              onChange={(next) => setImagePath(next)}
            />
          </div>
          <AdminField
            label="Caminho manual ou URL externa (opcional)"
            forId="pf-img-path"
            class="sm:col-span-6"
          >
            <AdminInput
              id="pf-img-path"
              type="text"
              placeholder="/storage/products/..."
              value={imagePath()}
              onInput={(e) => setImagePath(e.currentTarget.value)}
              class="text-xs"
            />
          </AdminField>
        </div>

        <div class="space-y-2 pt-2 text-xs">
          <label class="inline-flex items-center gap-2 font-medium text-zinc-800">
            <input
              type="checkbox"
              checked={wholesaleGroupVariants()}
              onChange={(e) => setWholesaleGroupVariants(e.currentTarget.checked)}
              class="accent-[#93509e]"
            />
            Somar quantidades entre variações para atingir faixa de atacado
          </label>
          <Show when={canViewCost() && wholesaleTierEstimates().length > 0}>
            <div class="rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <p class="mb-1.5 font-bold text-zinc-800">
                Atacado — margem estimada por faixa
              </p>
              <div class="grid gap-1.5 sm:grid-cols-2">
                <For each={wholesaleTierEstimates()}>
                  {(tier) => (
                    <div class="flex items-center justify-between rounded border border-zinc-200 bg-white px-2.5 py-1.5 tabular-nums">
                      <span>
                        <strong>{tier.min_qty}+ un.</strong> ·{" "}
                        {formatBrlFromCents(tier.unit_price_cents)}
                      </span>
                      <span
                        class={`font-semibold ${
                          tier.is_loss ? "text-red-700" : "text-zinc-700"
                        }`}
                      >
                        {tier.profit_cents !== null
                          ? `${formatBrlSigned(tier.profit_cents)} (${formatMarginPercentage(tier.margin_pct, { compactWhole: true })})`
                          : "Sem custo"}
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </div>

        <VariationMatrixBuilder
          hasVariants={hasVariants()}
          onToggleHasVariants={(next) => {
            setHasVariants(next);
            if (!next) {
              setVariationRowErrors({});
              setServerVariantErrors({});
              setVariationSectionError(null);
            }
          }}
          attributes={variationAttributes()}
          onAttributesChange={setVariationAttributes}
          rows={variationRows()}
          onRowsChange={setVariationRows}
          catalogAttributes={mergedCatalogAttributes()}
          onCatalogAttributeCreated={(attr) =>
            setCreatedCatalogAttrs((prev) => [...prev, attr])
          }
          parentSku={sku().trim().toUpperCase()}
          parentPriceCents={parseBrl(priceBrl()) || 0}
          parentPromoPriceCents={
            promoBrl().trim() ? parseBrl(promoBrl()) || null : null
          }
          parentCostCents={parsedCost().valid ? parsedCost().cents : null}
          parentWeightGrams={Number(weightGrams()) || 200}
          parentImagePath={imagePath().trim()}
          canCostView={canViewCost()}
          canCostWrite={canWriteCost()}
          isEditMode={props.mode === "edit"}
          legacySimpleStock={legacySimpleStock()}
          disableImpactConfirmed={confirmDisableImpact()}
          onConfirmDisableImpact={setConfirmDisableImpact}
          onArchiveSavedVariant={handleArchiveSavedVariant}
          onRestoreSavedVariant={handleRestoreSavedVariant}
          rowErrors={variationRowErrors()}
          serverVariantErrors={serverVariantErrors()}
          sectionError={variationSectionError()}
        />

        {/* Fixed product characteristics (not purchasable option axes) */}
        <div class="space-y-3 rounded-[10px] border border-zinc-200 bg-white p-3.5 text-xs">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="font-bold text-zinc-800">
                Ficha técnica fixa do produto (não gera opções de compra)
              </p>
              <p class="text-[11px] text-zinc-500">
                Use para características comuns a todas as unidades (ex.: esmalte vendido exclusivamente em{" "}
                <strong>8 ml</strong> com variação só de cor).
              </p>
            </div>
            <div class="w-40">
              <label
                for="pf-unit-label-input"
                class="block text-[11px] font-semibold text-zinc-700"
              >
                Apresentação fixa (ex.: 8 ml)
              </label>
              <input
                id="pf-unit-label-input"
                type="text"
                placeholder="Ex.: 8 ml, 15g, Bivolt"
                value={unitLabel()}
                onInput={(e) => setUnitLabel(e.currentTarget.value)}
                class="mt-0.5 h-8 w-full rounded-[6px] border border-zinc-300 px-2.5 text-xs focus:border-[#93509e] focus:outline-none"
              />
            </div>
          </div>

          <Show when={mergedCatalogAttributes().length > 0}>
            <div class="border-t border-zinc-100 pt-2.5">
              <p class="mb-1.5 text-[11px] font-semibold text-zinc-600">
                Especificações fixas para filtros da loja
              </p>
              <div class="flex flex-wrap gap-3">
                <For each={mergedCatalogAttributes()}>
                  {(attr) => (
                    <Show when={attr.values.length > 0}>
                      <div>
                        <span class="text-[11px] font-bold text-zinc-500">
                          {attr.name}:{" "}
                        </span>
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
                    </Show>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </div>
      </section>

      {/* Section 4: Descriptions, SEO & Visibility */}
      <section class="space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-bold text-zinc-900">4. Descrição, SEO e Situação</h3>
          <Show when={props.canWrite}>
            <div class="flex flex-wrap gap-1.5 text-xs">
              <button
                type="button"
                disabled={aiBusy() || name().trim().length < 3}
                onClick={() =>
                  void generateDescriptionFromCurrentForm({
                    autoApplyWhenUntouched: false,
                  })
                }
                title={
                  name().trim().length < 3
                    ? "Preencha primeiro o nome do produto"
                    : "Gera uma nova sugestão para revisão sem apagar o texto atual"
                }
                class="inline-flex items-center gap-1 rounded border border-purple-200 px-2.5 py-1 font-semibold text-[#93509e] hover:bg-purple-50 disabled:opacity-50"
              >
                <Show
                  when={shortDesc().trim() || fullDesc().trim()}
                  fallback={<Sparkles class="h-3.5 w-3.5" />}
                >
                  <RefreshCw class="h-3.5 w-3.5" />
                </Show>
                <span>
                  {aiBusy()
                    ? "Gerando..."
                    : shortDesc().trim() || fullDesc().trim()
                      ? "Gerar novamente com IA"
                      : "Gerar descrição com IA"}
                </span>
              </button>
              <Show when={props.mode === "edit" && props.product}>
                <button
                  type="button"
                  disabled={aiBusy()}
                  onClick={() => void runAiAssist("check_duplicates")}
                  class="rounded border border-zinc-300 px-2.5 py-1 font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Verificar duplicidades
                </button>
              </Show>
            </div>
          </Show>
        </div>

        <Show when={autoGeneratedBanner()}>
          {(banner) => (
            <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#dfc3e6] bg-[#faf5fb] px-3 py-2 text-xs text-[#62298d]">
              <span>{banner()}</span>
              <button
                type="button"
                onClick={() => setAutoGeneratedBanner(null)}
                class="font-bold underline"
              >
                Entendi
              </button>
            </div>
          )}
        </Show>

        <Show when={aiErrorOrNotice()}>
          {(notice) => (
            <div class="flex items-start justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <span>{notice()}</span>
              <button
                type="button"
                onClick={() => setAiErrorOrNotice(null)}
                class="shrink-0 font-bold underline"
              >
                Fechar
              </button>
            </div>
          )}
        </Show>

        <Show when={aiAssist()}>
          {(res) => (
            <div class="space-y-2.5 rounded-lg border border-purple-200 bg-purple-50/60 p-3.5 text-xs">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <strong class="text-[#62298d]">
                  Nova sugestão pronta para revisão (sua descrição atual foi preservada)
                </strong>
                <button
                  type="button"
                  onClick={() => setAiAssist(null)}
                  class="font-semibold text-zinc-600 hover:text-zinc-900"
                >
                  Manter texto atual
                </button>
              </div>
              <Show when={res().ai_notice}>
                {(n) => (
                  <p class="rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-amber-900">
                    {n()}
                  </p>
                )}
              </Show>
              <Show when={res().issues.length > 0}>
                <p class="font-medium text-amber-800">{res().issues.join(" · ")}</p>
              </Show>
              <Show when={res().possible_duplicates.length > 0}>
                <p class="font-medium text-amber-900">
                  Atenção — possíveis itens já cadastrados:{" "}
                  {res()
                    .possible_duplicates.map((d) => `${d.name} (${d.sku})`)
                    .join(", ")}
                </p>
              </Show>
              <div class="space-y-1.5 rounded border border-purple-100 bg-white p-2.5 text-zinc-800">
                <p>
                  <strong class="text-zinc-600">Curta:</strong>{" "}
                  {res().proposed.short_description}
                </p>
                <p class="whitespace-pre-line">
                  <strong class="text-zinc-600">Completa:</strong>{" "}
                  {res().proposed.description}
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShortDesc(res().proposed.short_description);
                    setFullDesc(res().proposed.description);
                    setSeoTitle(res().proposed.seo_title);
                    setSeoDesc(res().proposed.seo_description);
                    setDescEditedByUser(true);
                    setAiAssist(null);
                  }}
                  class="rounded bg-[#93509e] px-3 py-1.5 font-bold text-white hover:bg-[#7c3f87]"
                >
                  Aplicar sugestão ao cadastro
                </button>
                <button
                  type="button"
                  onClick={() => setAiAssist(null)}
                  class="rounded border border-zinc-300 bg-white px-3 py-1.5 font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  Descartar sugestão
                </button>
              </div>
            </div>
          )}
        </Show>

        <div class="grid gap-3">
          <div>
            <label class="block text-xs font-semibold text-zinc-700">Descrição curta</label>
            <input
              type="text"
              value={shortDesc()}
              onInput={(e) => {
                setDescEditedByUser(true);
                setShortDesc(e.currentTarget.value);
              }}
              class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-xs focus:border-[#93509e] focus:outline-none"
            />
          </div>
          <div>
            <label class="block text-xs font-semibold text-zinc-700">Descrição completa</label>
            <textarea
              rows={4}
              value={fullDesc()}
              onInput={(e) => {
                setDescEditedByUser(true);
                setFullDesc(e.currentTarget.value);
              }}
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
      <div class="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-zinc-200 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <AdminButton variant="secondary" onClick={() => props.onCancel()}>
          Cancelar
        </AdminButton>
        <div class="flex flex-wrap gap-2">
          <AdminButton
            variant="secondary"
            loading={busy()}
            loadingLabel="Salvando…"
            onClick={() => void submitForm(true)}
            class="border-[#93509e] text-[#62298d]"
          >
            <Plus class="h-3.5 w-3.5" />
            Salvar e cadastrar próximo
          </AdminButton>
          <AdminButton
            type="submit"
            variant="primary"
            loading={busy()}
            loadingLabel="Salvando…"
          >
            Salvar produto
          </AdminButton>
        </div>
      </div>
    </form>

    <AdminModal
      open={quickCatOpen()}
      onClose={() => setQuickCatOpen(false)}
      title="Nova categoria rápida"
      subtitle="Crie uma categoria ou subcategoria sem sair do cadastro do produto."
    >
      <form
        onSubmit={(e) => void handleQuickCreateCategory(e)}
        class="space-y-4 p-5"
      >
        <Show when={quickCatErr()}>
          {(err) => (
            <p class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {err()}
            </p>
          )}
        </Show>

        <AdminField label="Nome da categoria *" forId="pf-quick-cat-name">
          <AdminInput
            id="pf-quick-cat-name"
            type="text"
            placeholder="Ex.: Broca de Tungstênio"
            value={quickCatName()}
            onInput={(e) => setQuickCatName(e.currentTarget.value)}
            required
          />
        </AdminField>

        <AdminCombobox
          label="Categoria pai (opcional)"
          placeholder="Raiz (categoria principal)"
          searchPlaceholder="Buscar categoria pai..."
          value={quickCatParentId()}
          options={[
            { value: "", label: "Raiz (nível principal)" },
            ...categoryHierarchyOptions(),
          ]}
          onChange={(val) => setQuickCatParentId(val)}
        />

        <div class="flex justify-end gap-2 pt-2">
          <AdminButton
            type="button"
            variant="secondary"
            onClick={() => setQuickCatOpen(false)}
          >
            Cancelar
          </AdminButton>
          <AdminButton
            type="submit"
            variant="primary"
            loading={quickCatBusy()}
            loadingLabel="Criando…"
          >
            Criar e vincular
          </AdminButton>
        </div>
      </form>
    </AdminModal>
    </>
  );
}
