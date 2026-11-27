export interface BenefitItem {
  icon: string;
  title: string;
  subtitle: string;
}

export interface StoreSettings {
  payment_provider?: "mercadopago" | "asaas";
  store_name: string;
  tagline: string;
  logo_light_url: string;
  logo_dark_url: string;
  favicon_url: string;
  primary_color: string;
  primary_hover_color: string;
  secondary_color: string;
  accent_color: string;
  font_family: string;
  cnpj: string;
  company_legal_name: string;
  address: string;
  origin_cep: string;
  email: string;
  phone: string;
  whatsapp_number: string;
  whatsapp_default_message: string;
  social_instagram: string;
  social_tiktok: string;
  social_youtube: string;
  free_shipping_threshold_cents: number;
  max_installments: number;
  installment_min_value_cents: number;
  wholesale_enabled: boolean;
  maintenance_mode: boolean;
  benefits_ticker: string[];
  benefits_row: BenefitItem[];
  popup_enabled: boolean;
  popup_title: string;
  popup_subtitle: string;
  popup_coupon_code: string;
  seo_default_title: string;
  seo_default_description: string;
  ga4_measurement_id?: string | null;
  gtm_id?: string | null;
  payment_environment?: string;
  payment_sandbox_mode?: boolean;
}

export interface CategoryNode {
  id: number;
  name: string;
  slug: string;
  image_path: string | null;
  banner_desktop_path?: string | null;
  banner_mobile_path?: string | null;
  icon?: string | null;
  description?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  ancestors?: Array<{ id: number; name: string; slug: string }>;
  children?: CategoryNode[];
  featured_product?: ProductCardData | null;
}

export interface BrandItem {
  id: number;
  name: string;
  slug: string;
  logo_path: string | null;
  description?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  is_featured: boolean;
  products_count?: number;
}

export interface FooterPageLink {
  slug: string;
  title: string;
  footer_group: string;
}

export interface CouponSummary {
  code: string;
  name: string;
  type: "percent" | "fixed" | "free_shipping";
  value: number;
}

export interface WholesaleTierData {
  id?: number;
  min_quantity: number;
  max_quantity?: number | null;
  discount_type: "fixed_price" | "percent" | "fixed_discount";
  discount_value: number;
  unit_price_cents?: number;
  unit_price_formatted?: string;
  discount_cents?: number;
}

export interface WholesaleConditionData {
  has_wholesale: boolean;
  rule_id?: number | null;
  rule_name?: string | null;
  quantity_scope?: string;
  min_quantity?: number | null;
  starting_price_cents?: number | null;
  starting_price_formatted?: string | null;
  allows_shade_mixing?: boolean;
  stacking_policy?: string;
  tiers?: WholesaleTierData[];
}

export interface ProductCardData {
  id: number;
  name: string;
  slug: string;
  sku: string;
  product_type: "simple" | "variable" | "kit";
  brand: { id: number; name: string; slug: string } | null;
  primary_image: string | null;
  primary_image_alt: string;
  price_cents: number;
  effective_price_cents: number;
  discount_percent: number;
  installments_count: number;
  installment_cents: number;
  is_new_arrival: boolean;
  is_featured: boolean;
  in_stock: boolean;
  available_stock: number;
  default_variant_id: number | null;
  has_variants?: boolean;
  has_multiple_variants: boolean;
  category_slug?: string | null;
  comparison_group?: string;
  specs?: ProductSpecItem[];
  wholesale_condition?: WholesaleConditionData;
}

export interface ProductVariationAxis {
  slug: string;
  name: string;
  display_type: "color_swatch" | "pill" | string;
  values: {
    slug: string;
    value: string;
    color_hex?: string | null;
  }[];
}

export interface ProductVariantData {
  id: number;
  sku: string;
  gtin: string | null;
  name: string;
  option_values?: Array<{
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
  swatch_image_path?: string | null;
  sort_order?: number;
  price_cents: number;
  promo_price_cents?: number | null;
  effective_price_cents: number;
  weight_grams?: number | null;
  stock_qty: number;
  available_stock: number;
  in_stock: boolean;
  is_default: boolean;
  image_path: string | null;
  waiting_restock_count?: number;
  attributes: {
    attribute_id: number;
    attribute_slug?: string;
    attribute_name: string;
    display_type: string;
    value_id: number;
    value: string;
    value_slug?: string;
    color_hex: string | null;
  }[];
}

export interface ProductDetailData extends ProductCardData {
  variation_axes?: ProductVariationAxis[];
  gtin: string | null;
  manufacturer: string | null;
  short_description: string | null;
  description: string | null;
  ingredients: string | null;
  usage_instructions: string | null;
  unit_label: string | null;
  unit_quantity: number | null;
  weight_grams: number;
  video_url: string | null;
  tags: string[];
  wholesale_enabled: boolean;
  wholesale_tiers: { min_qty: number; discount_percent: number }[];
  categories: CategoryNode[];
  category_ancestors?: Array<{ id: number; name: string; slug: string }>;
  images: {
    id: number;
    path: string;
    alt_text: string | null;
    focal_point: string;
    is_primary: boolean;
  }[];
  variants: ProductVariantData[];
  kit_items: {
    id: number;
    quantity: number;
    component_product: { id: number; name: string; slug: string } | null;
    component_variant: {
      id: number;
      name: string;
      sku: string;
      stock_qty: number;
      reserved_qty: number;
    } | null;
  }[];
  reviews: {
    id: number;
    author_name: string;
    rating: number;
    title: string | null;
    body: string;
    photos?: string[] | null;
    is_verified_purchase: boolean;
    is_external?: boolean;
    source_name?: string | null;
    source_url?: string | null;
    variant_name?: string | null;
    created_at: string;
  }[];
  rating_avg: number;
  rating_count: number;
  seo_title: string;
  seo_description: string | null;
  wholesale_group_variants?: boolean;
  wholesale_condition?: WholesaleConditionData;
  comparison_group?: string;
  specs?: Array<{ slug: string; name: string; value: string }>;
  related_products: ProductCardData[];
}

export interface ProductSpecItem {
  slug: string;
  name: string;
  value: string;
}

export interface FacetAttributeValue {
  id: number;
  value: string;
  slug: string;
  color_hex: string | null;
  products_count: number;
}

export interface FacetAttribute {
  id: number;
  name: string;
  slug: string;
  display_type: string;
  unit: string | null;
  values: FacetAttributeValue[];
}

export interface ReplenishmentItemData {
  id: number;
  product_id: number;
  product_slug: string;
  product_name: string;
  brand_name: string | null;
  variant_id: number;
  variant_name: string;
  shade_code: string | null;
  color_hex: string | null;
  sku: string;
  image_url: string | null;
  unit_price_cents: number;
  original_price_cents: number;
  desired_quantity: number;
  available_stock: number;
  in_stock: boolean;
  stock_status: "ok" | "partial" | "out_of_stock" | "unavailable";
  line_subtotal_cents: number;
  last_purchased_at: string | null;
  updated_at: string | null;
}

export interface ReplenishmentListData {
  id: number;
  name: string;
  is_default: boolean;
  items_count: number;
  available_items_count: number;
  unavailable_items_count: number;
  estimated_total_cents: number;
  items: ReplenishmentItemData[];
}

export interface SharedCartItemData {
  product_id: number;
  product_name: string;
  product_slug: string;
  brand_name: string | null;
  variant_id: number;
  variant_name: string;
  shade_code: string | null;
  color_hex: string | null;
  sku: string;
  image_url: string | null;
  unit_price_cents: number;
  original_price_cents: number;
  desired_quantity: number;
  available_stock: number;
  purchasable_quantity: number;
  in_stock: boolean;
  subtotal_cents: number;
}

export interface SharedCartData {
  token: string;
  title: string | null;
  expires_at: string;
  created_at: string | null;
  items: SharedCartItemData[];
  available_items_count: number;
  unavailable_items_count: number;
  estimated_total_cents: number;
}

export interface CompareAttributeRow {
  slug: string;
  label: string;
  has_difference: boolean;
  values: Record<string, string | null>;
}

export interface CompareProductColumn {
  id: number;
  slug: string;
  name: string;
  sku: string;
  brand: string | null;
  price_cents: number;
  effective_price_cents: number;
  in_stock: boolean;
  available_stock: number;
  default_variant_id: number | null;
  primary_image: string | null;
}

export interface CompareResponseData {
  comparison_group: string;
  products: CompareProductColumn[];
  attributes: CompareAttributeRow[];
}

export interface BannerData {
  id: number;
  title: string;
  placement: string;
  desktop_image_path: string;
  mobile_image_path: string | null;
  alt_text: string;
  cta_label: string | null;
  cta_url: string | null;
}

export interface HomeSectionData {
  id: number;
  key: string;
  type: string;
  title: string | null;
  subtitle: string | null;
  config: Record<string, unknown>;
  data: unknown;
}

export interface ShippingOptionData {
  expires_at?: string;
  quote_id?: number;
  provider: string;
  service_code: string;
  service_name: string;
  carrier: string;
  price_cents: number;
  original_price_cents: number;
  estimated_days: number;
  is_fallback: boolean;
}

export interface WholesaleScopeSummary {
  full_scope_id: string;
  scope_key: string;
  scope_name: string;
  scope_type: string;
  rule_id: number;
  rule_name: string;
  current_quantity: number;
  current_tier_min_qty?: number | null;
  next_tier_min_qty?: number | null;
  units_to_next_tier: number;
  is_tier_unlocked: boolean;
  message: string;
}

export interface CartItemData {
  id: number;
  product_id: number;
  product_slug: string;
  product_name: string;
  variant_id: number;
  variant_name: string;
  sku: string;
  quantity: number;
  available_stock: number;
  in_stock: boolean;
  unit_price_cents: number;
  original_price_cents: number;
  line_total_cents: number;
  image_url: string | null;
  wholesale_applied?: boolean;
  wholesale_rule_id?: number | null;
  wholesale_rule_name?: string | null;
  wholesale_tier_min_qty?: number | null;
  wholesale_discount_cents?: number;
}

export interface CartSummary {
  token: string;
  items: CartItemData[];
  items_count: number;
  subtotal_cents: number;
  wholesale_discount_cents?: number;
  wholesale_scope_summaries?: WholesaleScopeSummary[];
  wholesale_stacking_notes?: string[];
  wholesale_is_active?: boolean;
  promotion_discount_cents: number;
  coupon_code: string | null;
  coupon_discount_cents: number;
  coupon_error: string | null;
  discount_cents: number;
  shipping_cep: string | null;
  shipping_cents: number;
  shipping_quote: ShippingOptionData | null;
  total_cents: number;
  total_weight_grams: number;
  free_shipping_threshold_cents: number;
  free_shipping_remaining_cents: number;
}

export interface BootstrapPayload {
  settings: StoreSettings;
  menu_categories: CategoryNode[];
  promo_products?: ProductCardData[];
  recommended_products?: ProductCardData[];
  brands: BrandItem[];
  footer_pages: FooterPageLink[];
  featured_coupon: CouponSummary | null;
  banners?: BannerData[];
}
