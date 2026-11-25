export interface ProductVariantSummary {
  count: number;
  is_multi_variant: boolean;
  price_min_cents: number;
  price_max_cents: number;
  effective_min_cents: number;
  effective_max_cents: number;
  total_stock: number;
  total_reserved: number;
  total_available: number;
  out_of_stock_count: number;
  has_promo: boolean;
  missing_cost_count?: number;
  cost_min_cents?: number | null;
  cost_max_cents?: number | null;
}

export interface ProductLinksSummary {
  can_delete: boolean;
  can_archive: boolean;
  can_restore: boolean;
  orders_count: number;
  movements_count: number;
  receipts_count: number;
  assisted_count: number;
  reservations_count: number;
  impediment_reason: string | null;
}

export interface AdminVariantRow {
  id: number;
  sku: string;
  supplier_code?: string | null;
  gtin?: string | null;
  name: string;
  option_values?: Array<{
    uid?: string;
    value_id?: number;
    attribute_id?: number;
    attribute_slug: string;
    attribute_name: string;
    value: string;
    value_slug: string;
    color_hex?: string | null;
  }>;
  variant_signature?: string | null;
  shade_code?: string | null;
  color_family?: string | null;
  color_hex?: string | null;
  image_path?: string | null;
  effective_image_path?: string | null;
  price_cents: number;
  promo_price_cents?: number | null;
  inherits_price?: boolean;
  inherits_promo_price?: boolean;
  cost_cents?: number | null;
  effective_cost_cents?: number | null;
  weight_grams?: number | null;
  inherits_weight?: boolean;
  inherits_image?: boolean;
  stock_qty: number;
  reserved_qty: number;
  sort_order?: number;
  is_default?: boolean;
  is_active?: boolean;
  is_archived?: boolean;
  archived_at?: string | null;
  attribute_values?: Array<{
    id: number;
    attribute_id: number;
    value: string;
    slug?: string;
    color_hex?: string | null;
    attribute?: { id: number; name: string; slug: string; display_type?: string };
  }>;
  links?: {
    orders_count: number;
    movements_count: number;
    receipts_count?: number;
    can_delete: boolean;
  };
  updated_at?: string;
}

export interface AdminProductRow {
  id: number;
  name: string;
  slug: string;
  sku: string;
  gtin?: string | null;
  supplier_code?: string | null;
  power_watts?: number | null;
  unit_label?: string | null;
  manufacturer?: string | null;
  price_cents: number;
  promo_price_cents: number | null;
  cost_cents?: number | null;
  weight_grams: number;
  width_cm?: number;
  height_cm?: number;
  length_cm?: number;
  short_description: string | null;
  description: string | null;
  ingredients?: string | null;
  usage_instructions?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  brand_id: number | null;
  product_type?: "simple" | "variable" | "kit" | string;
  has_variants?: boolean;
  variation_attributes?: Array<{
    attribute_id?: number;
    name: string;
    slug: string;
    display_type?: string;
    sort_order?: number;
    values: Array<{
      value_id?: number;
      uid?: string;
      value: string;
      slug?: string;
      color_hex?: string | null;
      sort_order?: number;
    }>;
  }>;
  archived_variants_count?: number;
  is_active: boolean;
  is_archived?: boolean;
  is_featured: boolean;
  is_new_arrival: boolean;
  is_best_seller?: boolean;
  wholesale_enabled?: boolean;
  wholesale_group_variants?: boolean;
  wholesale_tiers?: Array<{ min_qty: number; discount_percent?: number; price_cents?: number }> | null;
  wholesale_condition?: {
    has_wholesale: boolean;
    rule_name?: string | null;
    min_quantity?: number | null;
    tiers?: Array<{
      min_quantity: number;
      discount_value?: number;
      unit_price_cents: number;
    }>;
  } | null;
  brand?: { id: number; name: string } | null;
  categories?: {
    id: number;
    name: string;
    slug?: string;
    pivot?: { is_primary?: boolean | number };
  }[];
  images?: {
    id: number;
    path: string;
    alt_text: string | null;
    is_primary?: boolean;
  }[];
  attribute_values?: { id: number; value: string }[];
  variants?: AdminVariantRow[];
  variants_summary?: ProductVariantSummary;
  links?: ProductLinksSummary;
  updated_at?: string;
  created_at?: string;
  deleted_at?: string | null;
}

export interface AdminProductsPagePayload {
  data: AdminProductRow[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

export interface BrandOption {
  id: number;
  name: string;
  slug?: string;
}

export interface CategoryOption {
  id: number;
  name: string;
  slug?: string;
  parent_id?: number | null;
  sort_order?: number;
  full_path?: string;
}

export interface CatalogFilters {
  search: string;
  brand_id: string;
  category_id: string;
  status: string;
  availability: string;
  sort: string;
  filter: string;
  page: number;
}

export interface BulkSelectionPayload {
  product_ids?: number[];
  variant_ids?: number[];
  select_all_matching?: boolean;
  excluded_ids?: number[];
  filters?: Record<string, string>;
}

export interface BulkRuleChangeEntry {
  field: string;
  label: string;
  old_display: string;
  new_display: string;
}

export interface BulkRulePreviewRow {
  row_key: string;
  level: "product" | "variant";
  product_id: number;
  product_name: string;
  variant_id: number | null;
  sku: string;
  variant_name: string | null;
  valid: boolean;
  errors: string[];
  impacts: string[];
  changes: BulkRuleChangeEntry[];
}

export interface BulkRulePreviewPayload {
  summary: {
    total_products: number;
    total_items: number;
    valid_count: number;
    invalid_count: number;
    impacted_wholesale_count: number;
    impacted_promo_count: number;
    requires_async: boolean;
    operation_label: string;
  };
  rows: BulkRulePreviewRow[];
  preview_snapshot: {
    selection_hash: string;
    items: Record<string, Record<string, unknown>>;
    generated_at: string;
  };
}

export interface BulkLifecyclePreviewPayload {
  action: "archive" | "restore" | "delete";
  scope_label: string;
  total_products: number;
  total_variants_affected: number;
  has_multi_variant_products: boolean;
  deletable_count: number;
  blocked_count: number;
  sample: Array<{
    id: number;
    name: string;
    sku: string;
    variants_count: number;
  }>;
  items: Array<{
    product_id: number;
    name: string;
    sku: string;
    is_active: boolean;
    is_archived: boolean;
    variants_count: number;
    links: ProductLinksSummary;
  }>;
}

export function formatBrlFromCents(cents: number | null | undefined): string {
  const safe = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(safe / 100);
}

export function parseBrlInputToCents(raw: string): number {
  const clean = raw
    .trim()
    .replace(/R\$/gi, "")
    .replace(/\s+/g, "")
    .replace(/[^0-9,.-]/g, "");
  if (!clean || clean.startsWith("-")) return -1;
  const normalized = clean.includes(",")
    ? clean.replace(/\./g, "").replace(",", ".")
    : clean;
  const num = Number(normalized);
  if (!Number.isFinite(num) || num <= 0) return -1;
  return Math.round(num * 100);
}

export function formatProductPriceRange(product: AdminProductRow): {
  primary: string;
  secondary: string | null;
} {
  const s = product.variants_summary;
  if (s && s.count > 1) {
    const effMin = s.effective_min_cents;
    const effMax = s.effective_max_cents;
    const primary =
      effMin === effMax
        ? formatBrlFromCents(effMin)
        : `${formatBrlFromCents(effMin)} – ${formatBrlFromCents(effMax)}`;
    return {
      primary,
      secondary: s.has_promo ? "Inclui promo em variações" : `${s.count} variações`,
    };
  }

  const v = product.variants?.[0];
  const basePrice = v ? v.price_cents : product.price_cents;
  const promoPrice = v ? v.promo_price_cents : product.promo_price_cents;
  if (promoPrice && promoPrice > 0 && promoPrice < basePrice) {
    return {
      primary: formatBrlFromCents(promoPrice),
      secondary: `De ${formatBrlFromCents(basePrice)}`,
    };
  }
  return { primary: formatBrlFromCents(basePrice), secondary: null };
}

export function countActiveCatalogFilters(filters: CatalogFilters): number {
  let count = 0;
  if (filters.brand_id) count++;
  if (filters.category_id) count++;
  if (filters.status && filters.status !== "all") count++;
  if (filters.availability && filters.availability !== "all") count++;
  if (filters.filter) count++;
  return count;
}

export function makeIdempotencyKey(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
