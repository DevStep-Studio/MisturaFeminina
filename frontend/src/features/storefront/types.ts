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
  has_multiple_variants: boolean;
}

export interface ProductVariantData {
  id: number;
  sku: string;
  gtin: string | null;
  name: string;
  price_cents: number;
  effective_price_cents: number;
  stock_qty: number;
  available_stock: number;
  in_stock: boolean;
  is_default: boolean;
  image_path: string | null;
  attributes: {
    attribute_id: number;
    attribute_name: string;
    display_type: string;
    value_id: number;
    value: string;
    color_hex: string | null;
  }[];
}

export interface ProductDetailData extends ProductCardData {
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
    is_verified_purchase: boolean;
    created_at: string;
  }[];
  rating_avg: number;
  rating_count: number;
  seo_title: string;
  seo_description: string | null;
  related_products: ProductCardData[];
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
}

export interface CartSummary {
  token: string;
  items: CartItemData[];
  items_count: number;
  subtotal_cents: number;
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
}
