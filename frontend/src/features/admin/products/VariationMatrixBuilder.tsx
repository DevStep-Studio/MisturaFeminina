import ArrowDown from "lucide-solid/icons/arrow-down";
import ArrowUp from "lucide-solid/icons/arrow-up";
import Archive from "lucide-solid/icons/archive";
import Check from "lucide-solid/icons/check";
import ChevronDown from "lucide-solid/icons/chevron-down";
import ChevronRight from "lucide-solid/icons/chevron-right";
import CopyPlus from "lucide-solid/icons/copy-plus";
import ImageIcon from "lucide-solid/icons/image";
import Layers from "lucide-solid/icons/layers";
import Plus from "lucide-solid/icons/plus";
import RotateCcw from "lucide-solid/icons/rotate-ccw";
import Trash2 from "lucide-solid/icons/trash";
import Upload from "lucide-solid/icons/upload";
import { For, Show, createMemo, createSignal } from "solid-js";
import { api } from "../../../lib/api";
import { assetUrl } from "../../../lib/format";
import { formatCentsToBrInput } from "../admin-helpers";
import {
  calculateUnitMarginPreview,
  formatBrlSigned,
  formatMarginPercentage,
  formatNullableCostInput,
  parseBrlNullableCost,
} from "../profit-math";
import {
  AdminButton,
  AdminInput,
} from "../ui";
import {
  type VariationAttributeDraft,
  type VariationRowDraft,
  type VariationRowErrorMap,
  STANDARD_VARIATION_PRESETS,
  computeCartesianCombinationCount,
  generateOrMergeVariationRows,
  makeStableUid,
  normalizeSlug,
  parseAttributeValuesList,
} from "./variation-matrix";

export interface CatalogAttrItem {
  id: number;
  name: string;
  slug?: string;
  display_type?: string;
  values: Array<{ id: number; value: string; slug?: string; color_hex?: string | null }>;
}

function parseBrToCentsNullable(raw: string): { valid: boolean; cents: number | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { valid: true, cents: null };
  const clean = trimmed
    .replace(/R\$/gi, "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const num = Number(clean);
  if (!Number.isFinite(num) || num <= 0) return { valid: false, cents: null };
  return { valid: true, cents: Math.round(num * 100) };
}

function VariationRowPhotoControl(props: {
  row: VariationRowDraft;
  parentImagePath?: string;
  onUpdate: (data: { image_path: string; inherits_image: boolean }) => void;
  compact?: boolean;
}) {
  let fileInputRef: HTMLInputElement | undefined;
  const [uploading, setUploading] = createSignal(false);
  const [uploadError, setUploadError] = createSignal<string | null>(null);
  const [showManualUrl, setShowManualUrl] = createSignal(false);

  const hasCustomPhoto = () =>
    !props.row.inherits_image && Boolean(props.row.image_path && props.row.image_path.trim());

  const displayedImage = () => {
    if (hasCustomPhoto()) {
      return props.row.image_path.trim();
    }
    return props.parentImagePath ? props.parentImagePath.trim() : null;
  };

  async function handleFileChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    setUploadError(null);

    // Validation
    const allowedExts = [".png", ".jpg", ".jpeg", ".webp"];
    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
    const lowerName = file.name.toLowerCase();
    const isExtValid = allowedExts.some((ext) => lowerName.endsWith(ext));
    const isMimeValid = allowedTypes.includes(file.type);

    if (!isExtValid && !isMimeValid) {
      setUploadError("Formato não suportado. Envie apenas imagens PNG, JPG ou WebP.");
      if (input) input.value = "";
      return;
    }

    const maxBytes = 5 * 1024 * 1024; // 5 MB
    if (file.size > maxBytes) {
      setUploadError("A imagem excede o tamanho máximo de 5 MB.");
      if (input) input.value = "";
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "products");

      const res = await api<{ data: { path: string } }>("/admin/media/upload", {
        method: "POST",
        body: fd,
      });

      props.onUpdate({
        image_path: res.data.path,
        inherits_image: false,
      });
    } catch (err) {
      setUploadError(
        err instanceof Error
          ? err.message
          : "Erro ao enviar imagem. Verifique a conexão e tente novamente.",
      );
    } finally {
      setUploading(false);
      if (input) input.value = "";
    }
  }

  function handleRemoveCustomPhoto() {
    props.onUpdate({
      image_path: "",
      inherits_image: true,
    });
    setUploadError(null);
  }

  return (
    <div class={`flex flex-col gap-1 ${props.compact ? "min-w-[195px]" : "w-full"}`}>
      <input
        type="file"
        ref={fileInputRef}
        accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
        class="hidden"
        onChange={handleFileChange}
      />

      <div class="flex items-center gap-1.5">
        {/* Thumbnail Preview */}
        <div
          class="relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded border border-zinc-200 bg-white shadow-xs hover:border-[#93509e]"
          onClick={() => fileInputRef?.click()}
          title={
            hasCustomPhoto()
              ? `Foto própria de ${props.row.name} (clique para substituir)`
              : `Usando foto principal do produto (clique para enviar foto própria)`
          }
        >
          <Show
            when={displayedImage()}
            fallback={<ImageIcon class="h-3.5 w-3.5 text-zinc-300" />}
          >
            <img
              src={assetUrl(displayedImage()!)}
              alt={props.row.name}
              class="h-full w-full object-contain"
            />
          </Show>

          <Show when={uploading()}>
            <div class="absolute inset-0 flex items-center justify-center bg-white/80">
              <span class="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[#93509e] border-t-transparent" />
            </div>
          </Show>
        </div>

        {/* Actions & Status */}
        <div class="flex flex-1 flex-wrap items-center gap-1 text-[10px]">
          <Show
            when={hasCustomPhoto()}
            fallback={
              <>
                <button
                  type="button"
                  disabled={uploading()}
                  onClick={() => fileInputRef?.click()}
                  class="inline-flex items-center gap-1 rounded border border-dashed border-zinc-300 bg-white px-2 py-0.5 font-semibold text-zinc-700 hover:border-[#93509e] hover:text-[#93509e] disabled:opacity-50"
                  title="Enviar foto exclusiva desta variação (PNG, JPG ou WebP)"
                >
                  <Upload class="h-2.5 w-2.5" />
                  + Foto
                </button>
                <span class="text-zinc-500 text-[10px]" title="Herdando foto principal do produto">
                  Herdar principal
                </span>
              </>
            }
          >
            <span class="inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-1 py-0.2 font-bold text-emerald-700 text-[9px]">
              Própria
            </span>
            <button
              type="button"
              disabled={uploading()}
              onClick={() => fileInputRef?.click()}
              class="rounded px-1 font-semibold text-[#93509e] hover:underline disabled:opacity-50"
              title="Substituir imagem"
            >
              Trocar
            </button>
            <button
              type="button"
              onClick={handleRemoveCustomPhoto}
              class="rounded p-0.5 text-zinc-400 hover:text-red-600"
              title="Remover foto própria e usar a foto principal do produto"
              aria-label={`Remover foto de ${props.row.name}`}
            >
              <Trash2 class="h-3 w-3" />
            </button>
          </Show>

          <button
            type="button"
            onClick={() => setShowManualUrl(!showManualUrl())}
            class="text-[9px] text-zinc-400 hover:text-zinc-600 ml-auto"
            title="Editar ou colar URL manual"
          >
            {showManualUrl() ? "Ocultar URL" : "URL"}
          </button>
        </div>
      </div>

      {/* Upload Error */}
      <Show when={uploadError()}>
        <span class="text-[10px] leading-tight text-red-600">{uploadError()}</span>
      </Show>

      {/* Manual URL Input */}
      <Show when={showManualUrl()}>
        <div class="flex items-center gap-1 pt-0.5">
          <input
            type="text"
            aria-label={`URL manual da foto de ${props.row.name}`}
            placeholder="/storage/products/..."
            value={props.row.inherits_image ? "" : props.row.image_path}
            onInput={(e) => {
              const v = e.currentTarget.value;
              props.onUpdate({
                image_path: v,
                inherits_image: v.trim() === "",
              });
            }}
            class="h-6 w-full rounded border border-zinc-200 bg-white px-1.5 text-[10px]"
          />
        </div>
      </Show>
    </div>
  );
}

export function VariationMatrixBuilder(props: {
  hasVariants: boolean;
  onToggleHasVariants: (next: boolean) => void;
  attributes: VariationAttributeDraft[];
  onAttributesChange: (next: VariationAttributeDraft[]) => void;
  rows: VariationRowDraft[];
  onRowsChange: (next: VariationRowDraft[]) => void;
  catalogAttributes: CatalogAttrItem[];
  onCatalogAttributeCreated?: (attr: CatalogAttrItem) => void;
  parentSku: string;
  parentPriceCents: number;
  parentPromoPriceCents: number | null;
  parentCostCents: number | null;
  parentWeightGrams: number;
  parentImagePath: string;
  canCostView: boolean;
  canCostWrite: boolean;
  isEditMode: boolean;
  legacySimpleStock?: number;
  disableImpactConfirmed?: boolean;
  onConfirmDisableImpact?: (confirmed: boolean) => void;
  onArchiveSavedVariant?: (variantId: number) => Promise<void> | void;
  onRestoreSavedVariant?: (variantId: number) => Promise<void> | void;
  rowErrors?: Record<string, VariationRowErrorMap>;
  serverVariantErrors?: Record<string, string[]>;
  sectionError?: string | null;
}) {
  const [customAttrOpen, setCustomAttrOpen] = createSignal(false);
  const [customAttrName, setCustomAttrName] = createSignal("");
  const [customAttrBusy, setCustomAttrBusy] = createSignal(false);

  const [singleValueInput, setSingleValueInput] = createSignal<Record<string, string>>({});
  const [pasteOpenFor, setPasteOpenFor] = createSignal<string | null>(null);
  const [pasteText, setPasteText] = createSignal("");
  const [pasteFeedback, setPasteFeedback] = createSignal<Record<string, string>>({});

  // Matrix selection & batch toolbar state
  const [selectedRowKeys, setSelectedRowKeys] = createSignal<string[]>([]);
  const [filterOptionValue, setFilterOptionValue] = createSignal<string>("all");
  const [bulkPriceInput, setBulkPriceInput] = createSignal("");
  const [bulkPromoInput, setBulkPromoInput] = createSignal("");
  const [bulkCostInput, setBulkCostInput] = createSignal("");
  const [bulkStockInput, setBulkStockInput] = createSignal("");
  const [bulkWeightInput, setBulkWeightInput] = createSignal("");

  // Mobile card expanded rows + archived drawer
  const [expandedMobileKeys, setExpandedMobileKeys] = createSignal<string[]>([]);
  const [archivedOpen, setArchivedOpen] = createSignal(false);
  const [disableImpactWarningOpen, setDisableImpactWarningOpen] = createSignal(false);

  const activeRows = createMemo(() => props.rows.filter((r) => !r.is_archived));
  const archivedRows = createMemo(() => props.rows.filter((r) => r.is_archived));
  const enabledRows = createMemo(() => activeRows().filter((r) => r.enabled));

  const visibleActiveRows = createMemo(() => {
    const f = filterOptionValue();
    if (!f || f === "all") return activeRows();
    return activeRows().filter((r) =>
      r.option_values.some((ov) => `${ov.attribute_slug}:${ov.value_slug}` === f),
    );
  });

  const cartesianCount = createMemo(() =>
    computeCartesianCombinationCount(props.attributes),
  );

  const cartesianFormulaText = createMemo(() => {
    const populated = props.attributes.filter((a) => a.values.length > 0);
    if (populated.length === 0) return "";
    const parts = populated.map((a) => `${a.values.length} ${a.name}`);
    return `${parts.join(" × ")} = ${cartesianCount()} combinação(ões) possível(is)`;
  });

  const totalDistributedStock = createMemo(() =>
    enabledRows().reduce((sum, r) => sum + Math.max(0, Number(r.stock_qty) || 0), 0),
  );

  const totalSavedStockAndOrders = createMemo(() => {
    let stock = 0;
    let orders = 0;
    for (const r of activeRows()) {
      stock += Math.max(0, Number(r.stock_qty) || 0);
      if (r.links) orders += r.links.orders_count;
    }
    return { stock, orders, count: activeRows().length };
  });

  const availableAttributeFilterOptions = createMemo(() => {
    const seen = new Map<string, string>();
    for (const attr of props.attributes) {
      for (const val of attr.values) {
        const key = `${attr.slug}:${normalizeSlug(val.value) || val.slug}`;
        seen.set(key, `${attr.name}: ${val.value}`);
      }
    }
    return Array.from(seen.entries());
  });

  function handleToggleSwitch(checked: boolean) {
    if (!checked && props.isEditMode) {
      const impact = totalSavedStockAndOrders();
      if (impact.count > 0 && (impact.stock > 0 || impact.orders > 0 || impact.count > 1)) {
        setDisableImpactWarningOpen(true);
        return;
      }
    }
    setDisableImpactWarningOpen(false);
    props.onConfirmDisableImpact?.(false);
    props.onToggleHasVariants(checked);
  }

  function addPresetAttribute(preset: {
    slug: string;
    name: string;
    display_type?: string;
    attribute_id?: number;
  }) {
    const slug = normalizeSlug(preset.slug || preset.name);
    if (props.attributes.some((a) => a.slug === slug)) return;
    const catMatch = props.catalogAttributes.find(
      (c) => normalizeSlug(c.slug || c.name) === slug || c.id === preset.attribute_id,
    );
    props.onAttributesChange([
      ...props.attributes,
      {
        uid: makeStableUid("attr"),
        attribute_id: catMatch?.id ?? preset.attribute_id,
        name: preset.name,
        slug,
        display_type:
          preset.display_type === "color_swatch" || slug === "cor"
            ? "color_swatch"
            : "pill",
        sort_order: props.attributes.length + 1,
        values: [],
      },
    ]);
  }

  async function createAndAddCustomAttribute() {
    const cleanName = customAttrName().trim();
    if (!cleanName || customAttrBusy()) return;
    const slug = normalizeSlug(cleanName);
    if (props.attributes.some((a) => a.slug === slug)) {
      setCustomAttrName("");
      setCustomAttrOpen(false);
      return;
    }

    setCustomAttrBusy(true);
    try {
      const existing = props.catalogAttributes.find(
        (c) => normalizeSlug(c.slug || c.name) === slug,
      );
      if (existing) {
        addPresetAttribute({
          slug: existing.slug || slug,
          name: existing.name,
          display_type: existing.display_type,
          attribute_id: existing.id,
        });
      } else {
        let createdAttr: CatalogAttrItem | null = null;
        try {
          const res = await api<{ data: CatalogAttrItem }>("/admin/attributes", {
            method: "POST",
            body: {
              name: cleanName,
              display_type: "pill",
              is_filterable: true,
              is_comparable: true,
            },
          });
          createdAttr = res.data ?? null;
          if (createdAttr) props.onCatalogAttributeCreated?.(createdAttr);
        } catch {
          // Offline / mock fallback: product save sync service creates the Attribute cleanly on submit
        }
        addPresetAttribute({
          slug,
          name: createdAttr?.name || cleanName,
          display_type: createdAttr?.display_type || "pill",
          attribute_id: createdAttr?.id,
        });
      }
      setCustomAttrName("");
      setCustomAttrOpen(false);
    } finally {
      setCustomAttrBusy(false);
    }
  }

  function removeAttribute(attrUid: string) {
    const nextAttrs = props.attributes.filter((a) => a.uid !== attrUid);
    props.onAttributesChange(nextAttrs);
    if (nextAttrs.some((a) => a.values.length > 0)) {
      props.onRowsChange(
        generateOrMergeVariationRows({
          attributes: nextAttrs,
          existingRows: props.rows,
          parentSku: props.parentSku,
          parentPriceCents: props.parentPriceCents,
          parentPromoPriceCents: props.parentPromoPriceCents,
        }),
      );
    } else {
      props.onRowsChange(props.rows.filter((r) => r.is_archived));
    }
  }

  function addValuesToAttribute(attrUid: string, rawText: string) {
    const attr = props.attributes.find((a) => a.uid === attrUid);
    if (!attr || !rawText.trim()) return;
    const parsed = parseAttributeValuesList(rawText, attr.values);
    if (parsed.duplicatesRemoved > 0 || parsed.addedCount > 0) {
      setPasteFeedback((prev) => ({
        ...prev,
        [attrUid]:
          parsed.duplicatesRemoved > 0
            ? `${parsed.addedCount} valor(es) adicionado(s), ${parsed.duplicatesRemoved} duplicado(s) removido(s).`
            : `${parsed.addedCount} valor(es) adicionado(s).`,
      }));
    }
    const nextAttrs = props.attributes.map((a) =>
      a.uid === attrUid ? { ...a, values: parsed.nextValues } : a,
    );
    props.onAttributesChange(nextAttrs);
  }

  function appendExistingCatalogValue(
    attrUid: string,
    valObj: { id: number; value: string; color_hex?: string | null },
  ) {
    const attr = props.attributes.find((a) => a.uid === attrUid);
    if (!attr) return;
    const slug = normalizeSlug(valObj.value);
    if (attr.values.some((v) => v.slug === slug)) return;
    const nextAttrs = props.attributes.map((a) =>
      a.uid === attrUid
        ? {
            ...a,
            values: [
              ...a.values,
              {
                uid: makeStableUid("val"),
                value_id: valObj.id,
                value: valObj.value,
                slug,
                color_hex: valObj.color_hex ?? null,
                sort_order: a.values.length + 1,
              },
            ],
          }
        : a,
    );
    props.onAttributesChange(nextAttrs);
  }

  function renameValue(attrUid: string, valUid: string, nextLabel: string) {
    const nextAttrs = props.attributes.map((a) =>
      a.uid === attrUid
        ? {
            ...a,
            values: a.values.map((v) =>
              v.uid === valUid
                ? { ...v, value: nextLabel, slug: normalizeSlug(nextLabel) || v.slug }
                : v,
            ),
          }
        : a,
    );
    props.onAttributesChange(nextAttrs);
    // Reflect renamed value directly in existing rows while preserving id, sku, stock, cost
    props.onRowsChange(
      props.rows.map((r) => {
        const hasVal = r.option_values.some((ov) => ov.uid === valUid);
        if (!hasVal) return r;
        const nextOpts = r.option_values.map((ov) =>
          ov.uid === valUid
            ? {
                ...ov,
                value: nextLabel,
                value_slug: normalizeSlug(nextLabel) || ov.value_slug,
              }
            : ov,
        );
        return {
          ...r,
          option_values: nextOpts,
          name: nextOpts.map((o) => o.value).filter(Boolean).join(" · "),
        };
      }),
    );
  }

  function updateValueColorHex(attrUid: string, valUid: string, hex: string) {
    const nextAttrs = props.attributes.map((a) =>
      a.uid === attrUid
        ? {
            ...a,
            values: a.values.map((v) =>
              v.uid === valUid ? { ...v, color_hex: hex } : v,
            ),
          }
        : a,
    );
    props.onAttributesChange(nextAttrs);
    props.onRowsChange(
      props.rows.map((r) =>
        r.option_values.some((ov) => ov.uid === valUid)
          ? {
              ...r,
              color_hex: hex,
              option_values: r.option_values.map((ov) =>
                ov.uid === valUid ? { ...ov, color_hex: hex } : ov,
              ),
            }
          : r,
      ),
    );
  }

  function moveValueOrder(attrUid: string, valIndex: number, delta: -1 | 1) {
    const attr = props.attributes.find((a) => a.uid === attrUid);
    if (!attr) return;
    const targetIdx = valIndex + delta;
    if (targetIdx < 0 || targetIdx >= attr.values.length) return;
    const copy = [...attr.values];
    const [moved] = copy.splice(valIndex, 1);
    copy.splice(targetIdx, 0, moved);
    const reordered = copy.map((v, i) => ({ ...v, sort_order: i + 1 }));
    const nextAttrs = props.attributes.map((a) =>
      a.uid === attrUid ? { ...a, values: reordered } : a,
    );
    props.onAttributesChange(nextAttrs);
    if (props.rows.length > 0) {
      props.onRowsChange(
        generateOrMergeVariationRows({
          attributes: nextAttrs,
          existingRows: props.rows,
          parentSku: props.parentSku,
          parentPriceCents: props.parentPriceCents,
          parentPromoPriceCents: props.parentPromoPriceCents,
        }),
      );
    }
  }

  function removeValueChip(attrUid: string, valUid: string) {
    const nextAttrs = props.attributes.map((a) =>
      a.uid === attrUid
        ? { ...a, values: a.values.filter((v) => v.uid !== valUid) }
        : a,
    );
    props.onAttributesChange(nextAttrs);
  }

  function generateMatrixFromAttributes() {
    const nextRows = generateOrMergeVariationRows({
      attributes: props.attributes,
      existingRows: props.rows,
      parentSku: props.parentSku,
      parentPriceCents: props.parentPriceCents,
      parentPromoPriceCents: props.parentPromoPriceCents,
    });
    props.onRowsChange(nextRows);
  }

  function updateRow(rowKey: string, patch: Partial<VariationRowDraft>) {
    props.onRowsChange(
      props.rows.map((r) => (r.row_key === rowKey ? { ...r, ...patch } : r)),
    );
  }

  function distributeSimpleStockEqually() {
    const targetTotal = Math.max(0, props.legacySimpleStock ?? 0);
    const targets = enabledRows();
    if (targets.length === 0 || targetTotal <= 0) return;
    const baseEach = Math.floor(targetTotal / targets.length);
    const remainder = targetTotal % targets.length;
    const qtyByKey = new Map<string, number>();
    targets.forEach((r, idx) => {
      qtyByKey.set(r.row_key, baseEach + (idx < remainder ? 1 : 0));
    });
    props.onRowsChange(
      props.rows.map((r) =>
        qtyByKey.has(r.row_key) ? { ...r, stock_qty: qtyByKey.get(r.row_key)! } : r,
      ),
    );
  }

  function toggleRowSelection(rowKey: string) {
    setSelectedRowKeys((prev) =>
      prev.includes(rowKey) ? prev.filter((k) => k !== rowKey) : [...prev, rowKey],
    );
  }

  function toggleAllVisibleSelection() {
    const visibleKeys = visibleActiveRows().map((r) => r.row_key);
    const allSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selectedRowKeys().includes(k));
    if (allSelected) {
      setSelectedRowKeys((prev) => prev.filter((k) => !visibleKeys.includes(k)));
    } else {
      setSelectedRowKeys((prev) => Array.from(new Set([...prev, ...visibleKeys])));
    }
  }

  function applyBulkToSelected() {
    const keys = new Set(selectedRowKeys());
    if (keys.size === 0) return;

    const priceParsed = parseBrToCentsNullable(bulkPriceInput());
    const promoParsed = parseBrToCentsNullable(bulkPromoInput());
    const costParsed = parseBrlNullableCost(bulkCostInput());
    const hasStockVal = bulkStockInput().trim() !== "";
    const parsedStock = Number.parseInt(bulkStockInput().trim(), 10);
    const hasWeightVal = bulkWeightInput().trim() !== "";
    const parsedWeight = Number.parseInt(bulkWeightInput().trim(), 10);

    props.onRowsChange(
      props.rows.map((r) => {
        if (!keys.has(r.row_key)) return r;
        const next = { ...r };
        if (bulkPriceInput().trim() !== "" && priceParsed.valid && priceParsed.cents !== null) {
          next.price_cents = priceParsed.cents;
          next.inherits_price = false;
        }
        if (bulkPromoInput().trim() !== "" && promoParsed.valid) {
          next.promo_price_cents = promoParsed.cents;
          next.inherits_promo_price = false;
        }
        if (bulkCostInput().trim() !== "" && costParsed.valid) {
          next.cost_cents = costParsed.cents;
        }
        if (hasStockVal && Number.isFinite(parsedStock) && parsedStock >= 0) {
          next.stock_qty = parsedStock;
        }
        if (hasWeightVal && Number.isFinite(parsedWeight) && parsedWeight >= 1) {
          next.weight_grams = parsedWeight;
          next.inherits_weight = false;
        }
        return next;
      }),
    );
  }

  function inheritImageOnSelected() {
    const keys = new Set(selectedRowKeys());
    if (keys.size === 0) return;
    props.onRowsChange(
      props.rows.map((r) =>
        keys.has(r.row_key) ? { ...r, image_path: "", inherits_image: true } : r,
      ),
    );
  }

  function handleCellKeyDown(e: KeyboardEvent, rowIdx: number, col: string) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter") return;
    if (e.key === "Enter") {
      e.preventDefault();
    }
    const delta = e.key === "ArrowUp" ? -1 : 1;
    const nextEl = document.querySelector<HTMLInputElement>(
      `[data-var-cell="${rowIdx + delta}:${col}"]`,
    );
    if (nextEl) {
      e.preventDefault();
      nextEl.focus();
      nextEl.select?.();
    }
  }

  function getServerErrorsForRow(index: number, rowKey?: string): string[] {
    const all = props.serverVariantErrors ?? {};
    const msgs: string[] = [];
    if (rowKey && all[rowKey]?.length) {
      msgs.push(...all[rowKey]);
    }
    for (const key of [
      `variants.${index}.sku`,
      `variants.${index}.combination`,
      `variants.${index}.promo_price_cents`,
      `variants.${index}.name`,
    ]) {
      if (all[key]?.length) msgs.push(...all[key]);
    }
    return Array.from(new Set(msgs));
  }

  return (
    <div class="space-y-4 rounded-[10px] border border-zinc-200 bg-zinc-50/70 p-3.5 sm:p-4">
      {/* Main Optional Toggle Header */}
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="space-y-0.5">
          <div class="flex items-center gap-2">
            <Layers class="h-4 w-4 text-[#93509e]" />
            <span class="text-xs font-bold text-zinc-900">
              Variações de venda (opcional)
            </span>
          </div>
          <p class="text-[11px] text-zinc-500">
            {props.hasVariants
              ? "Cada combinação vendável tem SKU, preço, custo, foto, peso para frete e saldo próprios."
              : "Desligado — este item é cadastrado como produto simples sem opções de escolha."}
          </p>
        </div>

        <label class="inline-flex cursor-pointer items-center gap-2.5 rounded-[8px] border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 select-none">
          <input
            type="checkbox"
            role="switch"
            aria-checked={props.hasVariants}
            checked={props.hasVariants}
            onChange={(e) => handleToggleSwitch(e.currentTarget.checked)}
            class="h-4 w-4 accent-[#93509e]"
          />
          <span>Este produto tem variações</span>
        </label>
      </div>

      {/* Disable Variations Impact Warning Dialog */}
      <Show when={disableImpactWarningOpen()}>
        <div
          role="alertdialog"
          aria-label="Confirmar desativação de variações"
          class="space-y-2.5 rounded-[8px] border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950"
        >
          <p class="font-bold">
            Desativar variações impacta o catálogo e histórico:
          </p>
          <p>
            Este produto possui{" "}
            <strong>{totalSavedStockAndOrders().count} variação(ões)</strong> com{" "}
            <strong>{totalSavedStockAndOrders().stock} un.</strong> em estoque e{" "}
            <strong>{totalSavedStockAndOrders().orders} pedido(s)</strong> vinculados. Ao confirmar, o histórico das combinações com pedidos ou movimentações será preservado como arquivado ao salvar.
          </p>
          <div class="flex flex-wrap gap-2">
            <AdminButton
              size="sm"
              variant="secondary"
              onClick={() => setDisableImpactWarningOpen(false)}
            >
              Manter variações
            </AdminButton>
            <AdminButton
              size="sm"
              variant="primary"
              onClick={() => {
                props.onConfirmDisableImpact?.(true);
                setDisableImpactWarningOpen(false);
                props.onToggleHasVariants(false);
              }}
            >
              Confirmar e converter para produto simples
            </AdminButton>
          </div>
        </div>
      </Show>

      <Show when={props.sectionError}>
        <div role="alert" class="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
          {props.sectionError}
        </div>
      </Show>

      {/* Collapsible Body (hidden when Simple Product) */}
      <Show when={props.hasVariants}>
        {/* Stock Distribution Helper when converting Simple with stock > 0 -> Variable */}
        <Show when={(props.legacySimpleStock ?? 0) > 0 && props.isEditMode}>
          <div class="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[#e4c6ea] bg-[#f5ebf7]/70 px-3.5 py-2.5 text-xs text-[#2e1049]">
            <div class="space-y-0.5">
              <p class="font-bold">
                Conversão de estoque simples ({props.legacySimpleStock} un. existentes)
              </p>
              <p>
                Total distribuído nas variações habilitadas:{" "}
                <strong class="adm-tabular">
                  {totalDistributedStock()} de {props.legacySimpleStock} un.
                </strong>
                {totalDistributedStock() === props.legacySimpleStock
                  ? " (equivalência exata mantida)"
                  : totalDistributedStock() < (props.legacySimpleStock ?? 0)
                    ? ` (faltam ${(props.legacySimpleStock ?? 0) - totalDistributedStock()} un.)`
                    : ` (+${totalDistributedStock() - (props.legacySimpleStock ?? 0)} un. acima do saldo anterior)`}
              </p>
            </div>
            <AdminButton
              size="sm"
              variant="secondary"
              onClick={distributeSimpleStockEqually}
              disabled={enabledRows().length === 0}
            >
              Dividir saldo igualmente
            </AdminButton>
          </div>
        </Show>

        {/* Step 1: Attribute Configurator ("Adicionar atributo") */}
        <div class="space-y-3 rounded-[8px] border border-zinc-200 bg-white p-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 class="text-xs font-bold text-zinc-900">
                1. Escolha os atributos de compra deste produto
              </h4>
              <p class="text-[11px] text-zinc-500">
                Ative apenas o que varia no momento da compra (ex.: Cor e Volume). Características fixas ficam fora das variações.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setCustomAttrOpen((v) => !v)}
              class="inline-flex h-8 items-center gap-1 rounded-[8px] border border-[#e4c6ea] bg-[#f5ebf7]/60 px-2.5 text-xs font-semibold text-[#62298d] hover:bg-[#f5ebf7]"
            >
              <Plus class="h-3.5 w-3.5" />
              Criar atributo
            </button>
          </div>

          <Show when={customAttrOpen()}>
            <div class="flex flex-wrap items-center gap-2 rounded-[8px] border border-zinc-200 bg-zinc-50 p-2.5 text-xs">
              <AdminInput
                type="text"
                aria-label="Nome do novo atributo"
                placeholder="Ex.: Fragrância, Tipo de plug, Curvatura..."
                value={customAttrName()}
                onInput={(e) => setCustomAttrName(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void createAndAddCustomAttribute();
                  }
                }}
                class="min-w-[200px] flex-1"
              />
              <AdminButton
                size="sm"
                variant="primary"
                loading={customAttrBusy()}
                onClick={() => void createAndAddCustomAttribute()}
              >
                Adicionar atributo
              </AdminButton>
            </div>
          </Show>

          {/* Standard & Catalog Attribute Buttons ("Adicionar atributo") */}
          <div class="space-y-1.5">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Adicionar atributo:
            </p>
            <div class="flex flex-wrap gap-1.5">
              <For each={STANDARD_VARIATION_PRESETS}>
                {(preset) => {
                  const alreadyAdded = () =>
                    props.attributes.some((a) => a.slug === preset.slug);
                  return (
                    <button
                      type="button"
                      disabled={alreadyAdded()}
                      onClick={() => addPresetAttribute(preset)}
                      class={`inline-flex h-7 items-center gap-1 rounded-[6px] border px-2.5 text-xs font-semibold transition ${
                        alreadyAdded()
                          ? "border-[#93509e] bg-[#f5ebf7] text-[#62298d] opacity-75"
                          : "border-zinc-300 bg-white text-zinc-700 hover:border-[#93509e] hover:text-[#62298d]"
                      }`}
                    >
                      <Show when={alreadyAdded()} fallback={<Plus class="h-3 w-3" />}>
                        <Check class="h-3 w-3" />
                      </Show>
                      {preset.name}
                    </button>
                  );
                }}
              </For>
              <For
                each={props.catalogAttributes.filter(
                  (ca) =>
                    !STANDARD_VARIATION_PRESETS.some(
                      (sp) => sp.slug === normalizeSlug(ca.slug || ca.name),
                    ),
                )}
              >
                {(catAttr) => {
                  const slug = normalizeSlug(catAttr.slug || catAttr.name);
                  const alreadyAdded = () =>
                    props.attributes.some((a) => a.slug === slug);
                  return (
                    <button
                      type="button"
                      disabled={alreadyAdded()}
                      onClick={() =>
                        addPresetAttribute({
                          slug,
                          name: catAttr.name,
                          display_type: catAttr.display_type,
                          attribute_id: catAttr.id,
                        })
                      }
                      class={`inline-flex h-7 items-center gap-1 rounded-[6px] border px-2.5 text-xs font-semibold transition ${
                        alreadyAdded()
                          ? "border-[#93509e] bg-[#f5ebf7] text-[#62298d] opacity-75"
                          : "border-zinc-300 bg-white text-zinc-700 hover:border-[#93509e]"
                      }`}
                    >
                      <Plus class="h-3 w-3" />
                      {catAttr.name}
                    </button>
                  );
                }}
              </For>
            </div>
          </div>

          {/* Active Attribute Value Panels */}
          <Show when={props.attributes.length > 0}>
            <div class="space-y-3 pt-1">
              <For each={props.attributes}>
                {(attr) => {
                  const catalogMatch = () =>
                    props.catalogAttributes.find(
                      (c) => normalizeSlug(c.slug || c.name) === attr.slug || c.id === attr.attribute_id,
                    );
                  const reusableValues = () =>
                    (catalogMatch()?.values ?? []).filter(
                      (cv) => !attr.values.some((av) => av.slug === normalizeSlug(cv.value)),
                    );

                  return (
                    <div class="space-y-2.5 rounded-[8px] border border-zinc-200 bg-zinc-50/70 p-3 text-xs">
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <span class="font-bold text-zinc-900">
                          {attr.name} ({attr.values.length} opção(ões))
                        </span>
                        <div class="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setPasteOpenFor(pasteOpenFor() === attr.uid ? null : attr.uid);
                              setPasteText("");
                            }}
                            class="font-semibold text-[#62298d] underline hover:text-[#93509e]"
                          >
                            {pasteOpenFor() === attr.uid ? "Fechar lista" : "Colar lista em linhas"}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeAttribute(attr.uid)}
                            class="font-semibold text-red-700 hover:underline"
                          >
                            Remover atributo
                          </button>
                        </div>
                      </div>

                      {/* Single value input + Reuse dropdown */}
                      <div class="flex flex-wrap items-center gap-2">
                        <div class="flex min-w-[200px] flex-1 gap-1.5">
                          <AdminInput
                            type="text"
                            aria-label={`Novo valor para ${attr.name}`}
                            placeholder={
                              STANDARD_VARIATION_PRESETS.find((p) => p.slug === attr.slug)
                                ?.placeholder ?? `Ex.: Nova opção de ${attr.name}`
                            }
                            value={singleValueInput()[attr.uid] ?? ""}
                            onInput={(e) =>
                              setSingleValueInput((prev) => ({
                                ...prev,
                                [attr.uid]: e.currentTarget.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addValuesToAttribute(attr.uid, singleValueInput()[attr.uid] ?? "");
                                setSingleValueInput((prev) => ({ ...prev, [attr.uid]: "" }));
                              }
                            }}
                            class="h-8 flex-1 text-xs"
                          />
                          <AdminButton
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              addValuesToAttribute(attr.uid, singleValueInput()[attr.uid] ?? "");
                              setSingleValueInput((prev) => ({ ...prev, [attr.uid]: "" }));
                            }}
                          >
                            Adicionar
                          </AdminButton>
                        </div>

                        <Show when={reusableValues().length > 0}>
                          <select
                            aria-label={`Reaproveitar valor de ${attr.name}`}
                            value=""
                            onChange={(e) => {
                              const pickedId = Number(e.currentTarget.value);
                              const found = reusableValues().find((rv) => rv.id === pickedId);
                              if (found) appendExistingCatalogValue(attr.uid, found);
                              e.currentTarget.value = "";
                            }}
                            class="h-8 rounded-[8px] border border-zinc-300 bg-white px-2 text-xs text-zinc-700"
                          >
                            <option value="">Reaproveitar valor…</option>
                            <For each={reusableValues()}>
                              {(rv) => <option value={rv.id}>{rv.value}</option>}
                            </For>
                          </select>
                        </Show>
                      </div>

                      {/* Multiline Paste Panel */}
                      <Show when={pasteOpenFor() === attr.uid}>
                        <div class="space-y-2 rounded-[8px] border border-purple-200 bg-white p-2.5">
                          <label class="block text-[11px] font-semibold text-zinc-700">
                            Cole uma opção por linha (duplicatas são removidas automaticamente):
                          </label>
                          <textarea
                            rows={3}
                            aria-label={`Lista de valores para ${attr.name}`}
                            placeholder={"Nude\nRosé\nVermelho"}
                            value={pasteText()}
                            onInput={(e) => setPasteText(e.currentTarget.value)}
                            class="w-full rounded-[6px] border border-zinc-300 p-2 text-xs focus:border-[#93509e] focus:outline-none"
                          />
                          <AdminButton
                            size="sm"
                            variant="primary"
                            onClick={() => {
                              addValuesToAttribute(attr.uid, pasteText());
                              setPasteText("");
                              setPasteOpenFor(null);
                            }}
                          >
                            Adicionar valores colados
                          </AdminButton>
                        </div>
                      </Show>

                      <Show when={pasteFeedback()[attr.uid]}>
                        <p class="text-[11px] font-medium text-emerald-700">
                          {pasteFeedback()[attr.uid]}
                        </p>
                      </Show>

                      {/* Reorderable / Renamable Value Chips */}
                      <Show when={attr.values.length > 0}>
                        <div class="flex flex-wrap gap-2 pt-1">
                          <For each={attr.values}>
                            {(val, vIdx) => (
                              <div class="inline-flex items-center gap-1 rounded-[8px] border border-zinc-300 bg-white px-2 py-1 shadow-2xs">
                                <Show when={attr.display_type === "color_swatch"}>
                                  <input
                                    type="color"
                                    aria-label={`Amostra opcional para ${val.value}`}
                                    title="Amostra de cor opcional"
                                    value={val.color_hex || "#d4a5b8"}
                                    onInput={(e) =>
                                      updateValueColorHex(attr.uid, val.uid, e.currentTarget.value)
                                    }
                                    class="h-5 w-5 cursor-pointer rounded border border-zinc-200 p-0"
                                  />
                                </Show>
                                <input
                                  type="text"
                                  aria-label={`Editar opção ${val.value}`}
                                  value={val.value}
                                  onInput={(e) =>
                                    renameValue(attr.uid, val.uid, e.currentTarget.value)
                                  }
                                  class="w-24 bg-transparent text-xs font-semibold text-zinc-900 focus:outline-none"
                                />
                                <button
                                  type="button"
                                  disabled={vIdx() === 0}
                                  onClick={() => moveValueOrder(attr.uid, vIdx(), -1)}
                                  aria-label={`Mover ${val.value} para cima`}
                                  class="rounded p-0.5 text-zinc-400 hover:text-zinc-800 disabled:opacity-30"
                                >
                                  <ArrowUp class="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  disabled={vIdx() === attr.values.length - 1}
                                  onClick={() => moveValueOrder(attr.uid, vIdx(), 1)}
                                  aria-label={`Mover ${val.value} para baixo`}
                                  class="rounded p-0.5 text-zinc-400 hover:text-zinc-800 disabled:opacity-30"
                                >
                                  <ArrowDown class="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeValueChip(attr.uid, val.uid)}
                                  aria-label={`Remover ${val.value}`}
                                  class="rounded p-0.5 text-zinc-400 hover:text-red-600"
                                >
                                  <Trash2 class="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>

          {/* Combination Preview Count BEFORE Building Grid */}
          <Show when={cartesianCount() > 0}>
            <div class="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[#e4c6ea] bg-[#f5ebf7]/60 px-3 py-2 text-xs">
              <div class="space-y-0.5">
                <p class="font-bold text-[#2e1049]">{cartesianFormulaText()}</p>
                <Show when={cartesianCount() >= 25}>
                  <p class="text-[11px] text-amber-800">
                    Grade grande: após gerar, desmarque as combinações que a loja não comercializa.
                  </p>
                </Show>
              </div>
              <AdminButton
                size="sm"
                variant="primary"
                onClick={generateMatrixFromAttributes}
              >
                <CopyPlus class="h-3.5 w-3.5" />
                {activeRows().length > 0 ? "Atualizar combinações na grade" : `Gerar grade (${cartesianCount()})`}
              </AdminButton>
            </div>
          </Show>
        </div>

        {/* Step 2: Variation Matrix (Compact Desktop Grid + Expandable 360px Mobile Cards) */}
        <Show when={activeRows().length > 0}>
          <div class="space-y-3 rounded-[8px] border border-zinc-200 bg-white p-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 class="text-xs font-bold text-zinc-900">
                  2. Grade de combinações ({enabledRows().length} habilitada(s) de {activeRows().length})
                </h4>
                <p class="text-[11px] text-zinc-500">
                  Desmarque qualquer combinação que não existe no catálogo (ex.: cor específica fora de linha). O saldo NUNCA é multiplicado automaticamente.
                </p>
              </div>

              <Show when={availableAttributeFilterOptions().length > 0}>
                <select
                  aria-label="Filtrar combinações por atributo"
                  value={filterOptionValue()}
                  onChange={(e) => setFilterOptionValue(e.currentTarget.value)}
                  class="h-8 rounded-[8px] border border-zinc-300 bg-white px-2.5 text-xs text-zinc-700"
                >
                  <option value="all">Todas as combinações ({activeRows().length})</option>
                  <For each={availableAttributeFilterOptions()}>
                    {([key, label]) => <option value={key}>{label}</option>}
                  </For>
                </select>
              </Show>
            </div>

            {/* Batch Toolbar: Aplicar aos selecionados */}
            <div class="space-y-2 rounded-[8px] border border-zinc-200 bg-zinc-50 p-2.5 text-xs">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleAllVisibleSelection}
                    class="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-100"
                  >
                    {visibleActiveRows().length > 0 &&
                    visibleActiveRows().every((r) => selectedRowKeys().includes(r.row_key))
                      ? "Desmarcar visíveis"
                      : `Selecionar visíveis (${visibleActiveRows().length})`}
                  </button>
                  <span class="font-semibold text-[#62298d]">
                    {selectedRowKeys().length} selecionada(s) para edição em lote
                  </span>
                </div>
                <Show when={selectedRowKeys().length > 0}>
                  <button
                    type="button"
                    onClick={inheritImageOnSelected}
                    class="text-[11px] font-semibold text-zinc-600 underline hover:text-[#62298d]"
                  >
                    Usar foto principal nas selecionadas
                  </button>
                </Show>
              </div>

              <Show when={selectedRowKeys().length > 0}>
                <div class="grid gap-2 sm:grid-cols-6">
                  <AdminInput
                    type="text"
                    inputMode="decimal"
                    placeholder="Preço (R$)"
                    aria-label="Aplicar preço aos selecionados"
                    value={bulkPriceInput()}
                    onInput={(e) => setBulkPriceInput(e.currentTarget.value)}
                    class="h-8 text-right text-xs"
                  />
                  <AdminInput
                    type="text"
                    inputMode="decimal"
                    placeholder="Promo (R$)"
                    aria-label="Aplicar promocional aos selecionados"
                    value={bulkPromoInput()}
                    onInput={(e) => setBulkPromoInput(e.currentTarget.value)}
                    class="h-8 text-right text-xs"
                  />
                  <Show when={props.canCostWrite}>
                    <AdminInput
                      type="text"
                      inputMode="decimal"
                      placeholder="Custo (R$)"
                      aria-label="Aplicar custo aos selecionados"
                      value={bulkCostInput()}
                      onInput={(e) => setBulkCostInput(e.currentTarget.value)}
                      class="h-8 text-right text-xs"
                    />
                  </Show>
                  <AdminInput
                    type="number"
                    min="0"
                    placeholder="Estoque (un.)"
                    aria-label="Aplicar estoque aos selecionados"
                    value={bulkStockInput()}
                    onInput={(e) => setBulkStockInput(e.currentTarget.value)}
                    class="h-8 text-right text-xs"
                  />
                  <AdminInput
                    type="number"
                    min="1"
                    placeholder="Peso frete (g)"
                    aria-label="Aplicar peso aos selecionados"
                    value={bulkWeightInput()}
                    onInput={(e) => setBulkWeightInput(e.currentTarget.value)}
                    class="h-8 text-right text-xs"
                  />
                  <AdminButton
                    size="sm"
                    variant="primary"
                    onClick={applyBulkToSelected}
                    class="h-8 w-full"
                  >
                    Aplicar aos selecionados
                  </AdminButton>
                </div>
              </Show>
            </div>

            {/* DESKTOP COMPACT MATRIX TABLE */}
            <div class="hidden overflow-x-auto md:block">
              <table class="w-full min-w-[920px] border-collapse text-left text-xs">
                <thead>
                  <tr class="border-b border-zinc-200 text-[11px] font-bold uppercase text-zinc-500">
                    <th class="w-8 px-1.5 py-2">Sel</th>
                    <th class="w-10 px-1.5 py-2">Venda</th>
                    <th class="px-2 py-2">Combinação</th>
                    <th class="px-2 py-2">SKU / EAN</th>
                    <th class="w-28 px-2 py-2 text-right">Preço (R$)</th>
                    <th class="w-24 px-2 py-2 text-right">Promo</th>
                    <Show when={props.canCostView}>
                      <th class="w-28 px-2 py-2 text-right">Custo (R$)</th>
                    </Show>
                    <th class="w-20 px-2 py-2 text-right">Saldo</th>
                    <th class="w-20 px-2 py-2 text-right">Frete (g)</th>
                    <th class="px-2 py-2">Foto</th>
                    <th class="w-20 px-1.5 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-zinc-100">
                  <For each={visibleActiveRows()}>
                    {(row, rIdx) => {
                      const rowErr = () => props.rowErrors?.[row.row_key];
                      const srvErrs = () => getServerErrorsForRow(rIdx(), row.row_key);
                      const hasError = () =>
                        Boolean(
                          rowErr()?.sku ||
                            rowErr()?.combination ||
                            rowErr()?.promo ||
                            srvErrs().length > 0,
                        );
                      const effCost = () =>
                        row.cost_cents !== null && row.cost_cents !== undefined
                          ? row.cost_cents
                          : props.parentCostCents;
                      const margin = () =>
                        calculateUnitMarginPreview({
                          regularPriceCents: row.inherits_price
                            ? props.parentPriceCents
                            : row.price_cents,
                          promoPriceCents: row.inherits_promo_price
                            ? props.parentPromoPriceCents
                            : row.promo_price_cents,
                          costCents: effCost(),
                        });

                      return (
                        <tr
                          class={`align-top ${
                            hasError()
                              ? "bg-red-50/70"
                              : !row.enabled
                                ? "bg-zinc-50/80 opacity-60"
                                : "hover:bg-zinc-50/60"
                          }`}
                        >
                          <td class="px-1.5 py-2">
                            <input
                              type="checkbox"
                              aria-label={`Selecionar ${row.name}`}
                              checked={selectedRowKeys().includes(row.row_key)}
                              onChange={() => toggleRowSelection(row.row_key)}
                              class="accent-[#93509e]"
                            />
                          </td>
                          <td class="px-1.5 py-2">
                            <input
                              type="checkbox"
                              aria-label={`Habilitar ${row.name} no catálogo`}
                              checked={row.enabled}
                              onChange={(e) =>
                                updateRow(row.row_key, {
                                  enabled: e.currentTarget.checked,
                                  is_active: e.currentTarget.checked,
                                })
                              }
                              class="accent-[#93509e]"
                            />
                          </td>
                          <td class="px-2 py-2">
                            <div class="flex items-center gap-1.5">
                              <Show when={row.color_hex}>
                                <span
                                  class="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-zinc-300"
                                  style={{ "background-color": row.color_hex }}
                                />
                              </Show>
                              <span class="font-bold text-zinc-900">{row.name}</span>
                            </div>
                            <Show when={rowErr()?.combination}>
                              <p class="mt-0.5 text-[11px] font-semibold text-red-700">
                                {rowErr()?.combination}
                              </p>
                            </Show>
                            <Show when={!row.enabled}>
                              <span class="text-[10px] font-medium text-zinc-500">
                                Fora do catálogo (não salva)
                              </span>
                            </Show>
                          </td>
                          <td class="px-2 py-2 space-y-1">
                            <input
                              type="text"
                              data-var-cell={`${rIdx()}:sku`}
                              aria-label={`SKU de ${row.name}`}
                              value={row.sku}
                              onInput={(e) =>
                                updateRow(row.row_key, {
                                  sku: e.currentTarget.value.toUpperCase(),
                                })
                              }
                              onKeyDown={(e) => handleCellKeyDown(e, rIdx(), "sku")}
                              class={`h-8 w-36 rounded border px-2 font-mono text-xs uppercase ${
                                rowErr()?.sku || srvErrs().length > 0
                                  ? "border-red-400 bg-white text-red-900"
                                  : "border-zinc-300 bg-white"
                              }`}
                            />
                            <input
                              type="text"
                              data-var-cell={`${rIdx()}:gtin`}
                              aria-label={`EAN de ${row.name}`}
                              placeholder="EAN opcional"
                              value={row.gtin}
                              onInput={(e) => updateRow(row.row_key, { gtin: e.currentTarget.value })}
                              onKeyDown={(e) => handleCellKeyDown(e, rIdx(), "gtin")}
                              class="block h-7 w-36 rounded border border-zinc-200 bg-white px-2 font-mono text-[11px]"
                            />
                            <Show when={rowErr()?.sku}>
                              <p class="text-[11px] font-semibold text-red-700">{rowErr()?.sku}</p>
                            </Show>
                            <For each={srvErrs()}>
                              {(msg) => <p class="text-[11px] font-semibold text-red-700">{msg}</p>}
                            </For>
                          </td>
                          <td class="px-2 py-2 text-right">
                            <input
                              type="text"
                              inputMode="decimal"
                              data-var-cell={`${rIdx()}:price`}
                              aria-label={`Preço de ${row.name}`}
                              value={
                                row.inherits_price
                                  ? formatCentsToBrInput(props.parentPriceCents)
                                  : formatCentsToBrInput(row.price_cents)
                              }
                              onBlur={(e) => {
                                const parsed = parseBrToCentsNullable(e.currentTarget.value);
                                if (parsed.valid && parsed.cents !== null) {
                                  updateRow(row.row_key, {
                                    price_cents: parsed.cents,
                                    inherits_price: parsed.cents === props.parentPriceCents,
                                  });
                                }
                              }}
                              onKeyDown={(e) => handleCellKeyDown(e, rIdx(), "price")}
                              class="h-8 w-24 rounded border border-zinc-300 bg-white px-2 text-right font-semibold tabular-nums"
                            />
                            <p class="mt-0.5 text-[10px] text-zinc-500">
                              {row.inherits_price ? "Herdado" : "Próprio"}
                            </p>
                          </td>
                          <td class="px-2 py-2 text-right">
                            <input
                              type="text"
                              inputMode="decimal"
                              data-var-cell={`${rIdx()}:promo`}
                              aria-label={`Promo de ${row.name}`}
                              placeholder={
                                props.parentPromoPriceCents
                                  ? formatCentsToBrInput(props.parentPromoPriceCents)
                                  : "Vazio"
                              }
                              value={
                                row.inherits_promo_price
                                  ? props.parentPromoPriceCents
                                    ? formatCentsToBrInput(props.parentPromoPriceCents)
                                    : ""
                                  : row.promo_price_cents
                                    ? formatCentsToBrInput(row.promo_price_cents)
                                    : ""
                              }
                              onBlur={(e) => {
                                const parsed = parseBrToCentsNullable(e.currentTarget.value);
                                if (parsed.valid) {
                                  updateRow(row.row_key, {
                                    promo_price_cents: parsed.cents,
                                    inherits_promo_price: false,
                                  });
                                }
                              }}
                              onKeyDown={(e) => handleCellKeyDown(e, rIdx(), "promo")}
                              class="h-8 w-22 rounded border border-zinc-300 bg-white px-2 text-right tabular-nums"
                            />
                            <Show when={rowErr()?.promo}>
                              <p class="mt-0.5 text-[10px] font-semibold text-red-700">
                                {rowErr()?.promo}
                              </p>
                            </Show>
                          </td>
                          <Show when={props.canCostView}>
                            <td class="px-2 py-2 text-right">
                              <input
                                type="text"
                                inputMode="decimal"
                                disabled={!props.canCostWrite}
                                data-var-cell={`${rIdx()}:cost`}
                                aria-label={`Custo de ${row.name}`}
                                placeholder={
                                  props.parentCostCents !== null
                                    ? `Herdar (${formatCentsToBrInput(props.parentCostCents)})`
                                    : "Vazio"
                                }
                                value={formatNullableCostInput(row.cost_cents)}
                                onBlur={(e) => {
                                  const parsed = parseBrlNullableCost(e.currentTarget.value);
                                  if (parsed.valid) {
                                    updateRow(row.row_key, { cost_cents: parsed.cents });
                                  }
                                }}
                                onKeyDown={(e) => handleCellKeyDown(e, rIdx(), "cost")}
                                class="h-8 w-24 rounded border border-zinc-300 bg-white px-2 text-right tabular-nums disabled:bg-zinc-100"
                              />
                              <p class="mt-0.5 text-[10px] text-zinc-500">
                                {row.cost_cents === null
                                  ? props.parentCostCents !== null
                                    ? "Herdado"
                                    : "Não inf."
                                  : row.cost_cents === 0
                                    ? "R$ 0,00"
                                    : margin().profitCents !== null
                                      ? `${formatBrlSigned(margin().profitCents!)} (${formatMarginPercentage(margin().marginPct, { compactWhole: true })})`
                                      : "Informado"}
                              </p>
                            </td>
                          </Show>
                          <td class="px-2 py-2 text-right">
                            <input
                              type="number"
                              min="0"
                              data-var-cell={`${rIdx()}:stock`}
                              aria-label={`Saldo de ${row.name}`}
                              value={row.stock_qty}
                              onInput={(e) =>
                                updateRow(row.row_key, {
                                  stock_qty: Math.max(0, Number.parseInt(e.currentTarget.value || "0", 10) || 0),
                                })
                              }
                              onKeyDown={(e) => handleCellKeyDown(e, rIdx(), "stock")}
                              class="h-8 w-16 rounded border border-zinc-300 bg-white px-1.5 text-right tabular-nums"
                            />
                          </td>
                          <td class="px-2 py-2 text-right">
                            <input
                              type="number"
                              min="1"
                              data-var-cell={`${rIdx()}:weight`}
                              aria-label={`Peso de ${row.name}`}
                              placeholder={`${props.parentWeightGrams}g`}
                              value={row.inherits_weight ? "" : (row.weight_grams ?? "")}
                              onInput={(e) => {
                                const val = e.currentTarget.value.trim();
                                updateRow(row.row_key, {
                                  weight_grams: val ? Math.max(1, Number.parseInt(val, 10) || props.parentWeightGrams) : null,
                                  inherits_weight: val === "",
                                });
                              }}
                              onKeyDown={(e) => handleCellKeyDown(e, rIdx(), "weight")}
                              class="h-8 w-16 rounded border border-zinc-300 bg-white px-1.5 text-right tabular-nums"
                            />
                          </td>
                          <td class="px-2 py-2">
                            <VariationRowPhotoControl
                              row={row}
                              parentImagePath={props.parentImagePath}
                              compact={true}
                              onUpdate={(patch) => updateRow(row.row_key, patch)}
                            />
                          </td>
                          <td class="px-1.5 py-2 text-right">
                            <Show
                              when={row.id}
                              fallback={
                                <button
                                  type="button"
                                  onClick={() => updateRow(row.row_key, { enabled: !row.enabled, is_active: !row.enabled })}
                                  class="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                                >
                                  {row.enabled ? "Omitir" : "Reativar"}
                                </button>
                              }
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  if (props.onArchiveSavedVariant && row.id) {
                                    void props.onArchiveSavedVariant(row.id);
                                  } else {
                                    updateRow(row.row_key, {
                                      is_archived: true,
                                      enabled: false,
                                      is_active: false,
                                    });
                                  }
                                }}
                                class="inline-flex items-center gap-1 rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-900"
                                title="Arquivar combinação (sai da vitrine e preserva histórico nos pedidos)"
                              >
                                <Archive class="h-3 w-3" />
                                Arquivar
                              </button>
                            </Show>
                          </td>
                        </tr>
                      );
                    }}
                  </For>
                </tbody>
              </table>
            </div>

            {/* MOBILE 360px COMPACT CARDS */}
            <div class="space-y-2 md:hidden">
              <For each={visibleActiveRows()}>
                {(row, rIdx) => {
                  const expanded = () => expandedMobileKeys().includes(row.row_key);
                  const toggleExpand = () =>
                    setExpandedMobileKeys((prev) =>
                      prev.includes(row.row_key)
                        ? prev.filter((k) => k !== row.row_key)
                        : [...prev, row.row_key],
                    );
                  const rowErr = () => props.rowErrors?.[row.row_key];
                  const srvErrs = () => getServerErrorsForRow(rIdx(), row.row_key);
                  const hasErr = () =>
                    Boolean(rowErr()?.sku || rowErr()?.combination || rowErr()?.promo || srvErrs().length > 0);
                  const effPrice = () =>
                    row.inherits_price ? props.parentPriceCents : row.price_cents;

                  return (
                    <div
                      class={`rounded-[8px] border p-2.5 text-xs ${
                        hasErr()
                          ? "border-red-300 bg-red-50/70"
                          : !row.enabled
                            ? "border-zinc-200 bg-zinc-50 opacity-70"
                            : "border-zinc-200 bg-white"
                      }`}
                    >
                      <div class="flex items-start justify-between gap-2">
                        <div class="flex min-w-0 items-start gap-2">
                          <input
                            type="checkbox"
                            aria-label={`Selecionar ${row.name}`}
                            checked={selectedRowKeys().includes(row.row_key)}
                            onChange={() => toggleRowSelection(row.row_key)}
                            class="mt-0.5 accent-[#93509e]"
                          />
                          <div class="min-w-0">
                            <p class="truncate font-bold text-zinc-900">{row.name}</p>
                            <p class="adm-tabular text-[11px] text-zinc-600">
                              <span class="font-mono">{row.sku || "SEM SKU"}</span> ·{" "}
                              <strong>R$ {formatCentsToBrInput(effPrice())}</strong> ·{" "}
                              {row.stock_qty} un.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={toggleExpand}
                          aria-expanded={expanded()}
                          class="inline-flex shrink-0 items-center gap-0.5 rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700"
                        >
                          <Show when={expanded()} fallback={<ChevronRight class="h-3 w-3" />}>
                            <ChevronDown class="h-3 w-3" />
                          </Show>
                          Detalhes
                        </button>
                      </div>

                      <Show when={hasErr()}>
                        <p class="mt-1.5 text-[11px] font-semibold text-red-700">
                          {[rowErr()?.sku, rowErr()?.combination, rowErr()?.promo, ...srvErrs()]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </Show>

                      <Show when={expanded() || hasErr()}>
                        <div class="mt-2.5 grid gap-2 border-t border-zinc-100 pt-2.5">
                          <label class="inline-flex items-center gap-2 text-[11px] font-semibold text-zinc-700">
                            <input
                              type="checkbox"
                              checked={row.enabled}
                              onChange={(e) =>
                                updateRow(row.row_key, {
                                  enabled: e.currentTarget.checked,
                                  is_active: e.currentTarget.checked,
                                })
                              }
                              class="accent-[#93509e]"
                            />
                            Habilitada na loja
                          </label>
                          <div class="grid grid-cols-2 gap-2">
                            <div>
                              <label class="block text-[10px] font-semibold text-zinc-500">SKU *</label>
                              <input
                                type="text"
                                aria-label={`SKU mobile de ${row.name}`}
                                value={row.sku}
                                onInput={(e) =>
                                  updateRow(row.row_key, {
                                    sku: e.currentTarget.value.toUpperCase(),
                                  })
                                }
                                class="mt-0.5 h-8 w-full rounded border border-zinc-300 px-2 font-mono text-xs uppercase"
                              />
                            </div>
                            <div>
                              <label class="block text-[10px] font-semibold text-zinc-500">EAN</label>
                              <input
                                type="text"
                                aria-label={`EAN mobile de ${row.name}`}
                                value={row.gtin}
                                onInput={(e) => updateRow(row.row_key, { gtin: e.currentTarget.value })}
                                class="mt-0.5 h-8 w-full rounded border border-zinc-300 px-2 font-mono text-xs"
                              />
                            </div>
                          </div>
                          <div class="grid grid-cols-3 gap-2">
                            <div>
                              <label class="block text-[10px] font-semibold text-zinc-500">Preço (R$)</label>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={
                                  row.inherits_price
                                    ? formatCentsToBrInput(props.parentPriceCents)
                                    : formatCentsToBrInput(row.price_cents)
                                }
                                onBlur={(e) => {
                                  const parsed = parseBrToCentsNullable(e.currentTarget.value);
                                  if (parsed.valid && parsed.cents !== null) {
                                    updateRow(row.row_key, {
                                      price_cents: parsed.cents,
                                      inherits_price: parsed.cents === props.parentPriceCents,
                                    });
                                  }
                                }}
                                class="mt-0.5 h-8 w-full rounded border border-zinc-300 px-2 text-right text-xs tabular-nums"
                              />
                            </div>
                            <div>
                              <label class="block text-[10px] font-semibold text-zinc-500">Saldo (un.)</label>
                              <input
                                type="number"
                                min="0"
                                aria-label={`Saldo mobile de ${row.name}`}
                                value={row.stock_qty}
                                onInput={(e) =>
                                  updateRow(row.row_key, {
                                    stock_qty: Math.max(0, Number.parseInt(e.currentTarget.value || "0", 10) || 0),
                                  })
                                }
                                class="mt-0.5 h-8 w-full rounded border border-zinc-300 px-2 text-right text-xs tabular-nums"
                              />
                            </div>
                            <div>
                              <label class="block text-[10px] font-semibold text-zinc-500">Frete (g)</label>
                              <input
                                type="number"
                                min="1"
                                placeholder={`${props.parentWeightGrams}g`}
                                value={row.inherits_weight ? "" : (row.weight_grams ?? "")}
                                onInput={(e) => {
                                  const val = e.currentTarget.value.trim();
                                  updateRow(row.row_key, {
                                    weight_grams: val ? Math.max(1, Number.parseInt(val, 10) || props.parentWeightGrams) : null,
                                    inherits_weight: val === "",
                                  });
                                }}
                                class="mt-0.5 h-8 w-full rounded border border-zinc-300 px-2 text-right text-xs tabular-nums"
                              />
                            </div>
                          </div>
                          <Show when={props.canCostView}>
                            <div class="grid grid-cols-2 gap-2">
                              <div>
                                <label class="block text-[10px] font-semibold text-zinc-500">Custo (R$)</label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  disabled={!props.canCostWrite}
                                  placeholder="Vazio"
                                  value={formatNullableCostInput(row.cost_cents)}
                                  onBlur={(e) => {
                                    const parsed = parseBrlNullableCost(e.currentTarget.value);
                                    if (parsed.valid) {
                                      updateRow(row.row_key, { cost_cents: parsed.cents });
                                    }
                                  }}
                                  class="mt-0.5 h-8 w-full rounded border border-zinc-300 px-2 text-right text-xs tabular-nums"
                                />
                              </div>
                              <div>
                                <label class="block text-[10px] font-semibold text-zinc-500 mb-1">Foto da variação</label>
                                <VariationRowPhotoControl
                                  row={row}
                                  parentImagePath={props.parentImagePath}
                                  compact={false}
                                  onUpdate={(patch) => updateRow(row.row_key, patch)}
                                />
                              </div>
                            </div>
                          </Show>
                        </div>
                      </Show>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>
        </Show>

        {/* Archived Variants Section (preserved for old orders & audit) */}
        <Show when={archivedRows().length > 0}>
          <div class="rounded-[8px] border border-zinc-200 bg-white p-3 text-xs">
            <button
              type="button"
              onClick={() => setArchivedOpen((v) => !v)}
              class="flex w-full items-center justify-between font-bold text-zinc-700"
            >
              <span>Combinações arquivadas ({archivedRows().length}) — fora de linha, preservadas nos pedidos</span>
              <Show when={archivedOpen()} fallback={<ChevronRight class="h-4 w-4" />}>
                <ChevronDown class="h-4 w-4" />
              </Show>
            </button>
            <Show when={archivedOpen()}>
              <ul class="mt-2.5 divide-y divide-zinc-100">
                <For each={archivedRows()}>
                  {(ar) => (
                    <li class="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div>
                        <span class="font-semibold text-zinc-800">{ar.name}</span>{" "}
                        <span class="font-mono text-[11px] text-zinc-500">({ar.sku})</span>
                        <span class="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600">
                          Arquivada · Não vendável
                        </span>
                      </div>
                      <Show when={ar.id && props.onRestoreSavedVariant}>
                        <button
                          type="button"
                          onClick={() => props.onRestoreSavedVariant?.(ar.id!)}
                          class="inline-flex items-center gap-1 rounded border border-zinc-300 px-2 py-1 text-[11px] font-semibold text-[#62298d] hover:bg-purple-50"
                        >
                          <RotateCcw class="h-3 w-3" />
                          Reativar
                        </button>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>
        </Show>
      </Show>
    </div>
  );
}
