export interface AiProviderStatus {
  provider: string;
  status: "connected" | "configured" | "not_configured" | string;
  label: string;
  has_api_key: boolean;
  masked_key: string | null;
  base_url: string;
  models: {
    support: string;
    catalog: string;
    replenishment: string;
  };
  last_healthcheck_at: string | null;
  last_healthcheck_status: string | null;
}

export interface AiAgentSummary {
  id: number;
  slug: string;
  name: string;
  type: string;
  description: string | null;
  enabled: boolean;
  model_name: string;
  version: number;
  executions_count: number;
  last_executed_at: string | null;
  integration_status: string;
  integration_label: string;
}

export interface AiExecutionRow {
  id: number;
  agent_slug: string;
  agent_name: string;
  user_name: string;
  status: string;
  execution_mode: string;
  model_name: string | null;
  input_reference: string | null;
  result_reference: string | null;
  total_tokens: number;
  estimated_cost_usd: number;
  duration_ms: number | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface AiProductImportItemRow {
  id: number;
  import_id: number;
  row_index: number;
  group_key: string;
  product_reference: string;
  sku: string | null;
  gtin: string | null;
  action_type: string;
  matched_product_id: number | null;
  matched_variant_id: number | null;
  resolution_choice:
    "create_new" | "update_existing" | "ignore" | "manual_review";
  approval_status: string;
  proposed_data: {
    product_name: string;
    product_line?: string | null;
    slug?: string;
    brand_id?: number | null;
    brand_name?: string | null;
    category_id?: number | null;
    category_name?: string | null;
    variant_name: string;
    shade_code?: string | null;
    color_family?: string | null;
    color_hex?: string | null;
    volume?: string | null;
    shipping_weight_grams?: number | null;
    power_watts?: number | null;
    is_equipment?: boolean;
    supplier_code?: string | null;
    sku: string;
    gtin?: string | null;
    cost_price_cents?: number | null;
    suggested_retail_price_cents?: number | null;
    ambiguous_price_cents?: number | null;
    price_meaning?: "cost" | "supplier_suggested" | "sale" | "ambiguous" | null;
    cost_conversion?: {
      pack_label: string;
      pack_qty: number;
      pack_total_cents: number;
      proposed_unit_cost_cents: number;
      selling_unit: string;
      requires_unit_confirmation: boolean;
      applied: boolean;
      formula: string;
    } | null;
    price_cents: number;
    suggested_price_cents?: number | null;
    promo_price_cents?: number | null;
    stock_qty: number;
    short_description?: string | null;
    description?: string | null;
    ingredients?: string | null;
    usage_instructions?: string | null;
    seo_title?: string | null;
    seo_description?: string | null;
  };
  source_evidence?: {
    origin_file?: string;
    origin_detail?: string;
    raw_snippet?: string | null;
    image_url?: string | null;
    image_path?: string | null;
    fields?: Record<string, string>;
  } | null;
  validation_result?: {
    is_valid: boolean;
    errors: string[];
    warnings: string[];
  } | null;
  duplicate_comparison?: {
    reason: string;
    existing: {
      product_id: number;
      product_name: string;
      variant_id?: number;
      variant_name?: string;
      sku: string;
      price_cents: number;
      stock_qty?: number;
    };
  } | null;
}

export interface AiProductImportDetail {
  id: number;
  source_type: string;
  status: string;
  original_filenames: string[] | null;
  conversation_messages: Array<{
    role: "user" | "assistant";
    content: string;
    at: string;
  }> | null;
  total_records: number;
  grouped_products_count: number;
  grouped_variants_count: number;
  new_count: number;
  update_count: number;
  duplicate_count: number;
  incomplete_count: number;
  error_count: number;
  created_at: string | null;
  items: AiProductImportItemRow[];
}

export interface AiReplenishmentSuggestionRow {
  id: number;
  product_id: number;
  variant_id: number;
  supplier_id: number | null;
  sku_snapshot: string;
  product_name_snapshot: string;
  variant_name_snapshot: string;
  shade_code_snapshot: string | null;
  available_stock: number;
  reserved_stock: number;
  pending_inbound_qty: number;
  sales_7d: number;
  sales_30d: number;
  sales_90d: number;
  average_demand: number;
  coverage_days: number | null;
  lead_time_days: number;
  safety_stock_qty: number;
  reorder_point_qty: number;
  target_stock_qty: number;
  suggested_quantity: number;
  adjusted_quantity: number | null;
  unit_cost_cents: number;
  estimated_total_cents: number;
  restock_waitlist_count: number;
  customer_lists_count: number;
  forecast_quality: string;
  priority: "critical" | "high" | "normal" | "low";
  explanation: string;
  ai_explanation: string | null;
  plan_status: string;
}

export interface AiReplenishmentAnalysisDetail {
  id: number;
  trigger_type: string;
  analysis_period: number;
  default_lead_time_days: number;
  safety_stock_days: number;
  target_coverage_days: number;
  status: string;
  created_at: string;
  summary_kpis: {
    analyzed_variants_count: number;
    rupture_risk_count: number;
    out_of_stock_count: number;
    waitlist_demand_count: number;
    suggestions_count: number;
    estimated_total_cents: number;
  } | null;
  suggestions: AiReplenishmentSuggestionRow[];
}

export function aiExecutionStatusLabel(status: string): string {
  const map: Record<string, string> = {
    queued: "Na fila",
    running: "Processando",
    awaiting_review: "Aguardando revisão",
    completed: "Concluído",
    partially_completed: "Concluído parcialmente",
    failed: "Falhou",
    cancelled: "Cancelado",
  };
  return map[status] ?? status;
}

export function aiPriorityBadge(priority: string): {
  label: string;
  cls: string;
} {
  switch (priority) {
    case "critical":
      return { label: "Crítica", cls: "bg-red-100 text-red-800" };
    case "high":
      return { label: "Alta", cls: "bg-amber-100 text-amber-800" };
    case "normal":
      return { label: "Normal", cls: "bg-[#F3E2F6] text-[#93509e]" };
    default:
      return { label: "Baixa", cls: "bg-zinc-100 text-zinc-700" };
  }
}

export function aiActionTypeLabel(actionType: string): string {
  const map: Record<string, string> = {
    new_product: "Novo produto",
    new_variant: "Nova variação",
    update_variant: "Atualização de variação",
    existing_product: "Produto existente",
    possible_duplicate: "Possível duplicidade",
    insufficient_info: "Informação insuficiente",
  };
  return map[actionType] ?? actionType;
}

export function aiEvidenceOriginLabel(origin: string | undefined): string {
  switch (origin) {
    case "provided":
    case "provided_context":
    case "provided_document":
    case "provided_text":
      return "Dado fornecido";
    case "existing":
      return "Existente no sistema";
    case "ai_suggestion":
    case "ai_suggestion_from_cost":
      return "Sugestão da IA";
    default:
      return "Dado ausente";
  }
}
