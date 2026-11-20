import AlertCircle from "lucide-solid/icons/circle-exclamation-point";
import Download from "lucide-solid/icons/download";
import PackagePlus from "lucide-solid/icons/package-plus";
import Plus from "lucide-solid/icons/plus";
import Search from "lucide-solid/icons/search";
import Sparkles from "lucide-solid/icons/sparkles";
import Trash2 from "lucide-solid/icons/trash";
import { For, Show, createResource, createSignal } from "solid-js";
import { Link } from "@tanstack/solid-router";
import { ApiError, api, requestUrl } from "../../lib/api";
import { assetUrl, formatCents } from "../../lib/format";

export type IntelligentReportTab =
  "zero_results" | "demanded_shades" | "bought_together";

interface ZeroResultItem {
  normalized_term: string;
  sample_term: string;
  occurrences: number;
  last_searched_at: string;
  category_slug: string | null;
  synonym: { id: number; synonyms: string[] } | null;
  similar_products: Array<{ id: number; name: string; slug: string }>;
}

interface SearchSynonymRow {
  id: number;
  term: string;
  synonyms: string[];
  is_active: boolean;
}

interface DemandedShadeRow {
  product_id: number;
  product_name: string;
  product_slug: string;
  product_variant_id: number | null;
  variant_name: string;
  shade_code: string | null;
  sku: string;
  brand_name: string | null;
  available_stock: number;
  pending_count: number;
  total_historical_count: number;
  last_requested_at: string;
}

interface BoughtTogetherPair {
  product_a: {
    id: number;
    name: string;
    slug: string;
    sku: string;
    image_url: string | null;
  };
  product_b: {
    id: number;
    name: string;
    slug: string;
    sku: string;
    image_url: string | null;
  };
  joint_orders_count: number;
  pct_of_a_orders: number;
  pct_of_b_orders: number;
  associated_revenue_cents: number;
  suggestion: string;
}

export function AdminIntelligentReportsTabs(props: {
  activeTab: IntelligentReportTab;
  from: string;
  to: string;
}) {
  const [zeroSearch, setZeroSearch] = createSignal("");
  const [synTerm, setSynTerm] = createSignal("");
  const [synList, setSynList] = createSignal("");
  const [synBusy, setSynBusy] = createSignal(false);
  const [synFeedback, setSynFeedback] = createSignal<string | null>(null);

  const [availabilityFilter, setAvailabilityFilter] = createSignal<
    "all" | "out_of_stock" | "in_stock"
  >("all");
  const [brandIdFilter, setBrandIdFilter] = createSignal("");
  const [categoryIdFilter, setCategoryIdFilter] = createSignal("");

  const [zeroResults, { refetch: refetchZero }] = createResource(
    () =>
      props.activeTab === "zero_results"
        ? { from: props.from, to: props.to, search: zeroSearch().trim() }
        : null,
    async (f) => {
      if (!f) return null;
      const qs = new URLSearchParams({ from: f.from, to: f.to });
      if (f.search) qs.set("search", f.search);
      const res = await api<{
        data: {
          total_unique_terms: number;
          total_searches: number;
          items: ZeroResultItem[];
        };
      }>(`/admin/reports/zero-result-searches?${qs.toString()}`);
      return res.data;
    },
  );

  const [synonyms, { refetch: refetchSynonyms }] = createResource(
    () => (props.activeTab === "zero_results" ? true : false),
    async (active) => {
      if (!active) return [];
      const res = await api<{ data: SearchSynonymRow[] }>(
        "/admin/search-synonyms",
      );
      return res.data ?? [];
    },
  );

  const [brands] = createResource(async () => {
    const res = await api<{ data: Array<{ id: number; name: string }> }>(
      "/admin/brands",
    );
    return res.data ?? [];
  });

  const [categories] = createResource(async () => {
    const res = await api<{ data: Array<{ id: number; name: string }> }>(
      "/admin/categories",
    );
    return res.data ?? [];
  });

  const [demandedShades] = createResource(
    () =>
      props.activeTab === "demanded_shades"
        ? {
            from: props.from,
            to: props.to,
            availability: availabilityFilter(),
            brand_id: brandIdFilter(),
            category_id: categoryIdFilter(),
          }
        : null,
    async (f) => {
      if (!f) return null;
      const qs = new URLSearchParams({ from: f.from, to: f.to });
      if (f.availability !== "all") qs.set("availability", f.availability);
      if (f.brand_id) qs.set("brand_id", f.brand_id);
      if (f.category_id) qs.set("category_id", f.category_id);
      const res = await api<{
        data: {
          items: DemandedShadeRow[];
          kpis?: Record<string, number | string | null>;
        };
      }>(`/admin/reports/demanded-shades?${qs.toString()}`);
      return res.data;
    },
  );

  const [boughtTogether] = createResource(
    () =>
      props.activeTab === "bought_together"
        ? { from: props.from, to: props.to }
        : null,
    async (f) => {
      if (!f) return null;
      const qs = new URLSearchParams({ from: f.from, to: f.to });
      const res = await api<{
        data: { pairs: BoughtTogetherPair[] };
      }>(`/admin/reports/bought-together?${qs.toString()}`);
      return res.data;
    },
  );

  function buildCsvExportUrl(type: IntelligentReportTab): string {
    const qs = new URLSearchParams({
      type,
      from: props.from,
      to: props.to,
    });
    if (type === "zero_results" && zeroSearch().trim()) {
      qs.set("search", zeroSearch().trim());
    }
    if (type === "demanded_shades") {
      if (availabilityFilter() !== "all") {
        qs.set("availability", availabilityFilter());
      }
      if (brandIdFilter()) qs.set("brand_id", brandIdFilter());
      if (categoryIdFilter()) qs.set("category_id", categoryIdFilter());
    }
    return requestUrl(`/admin/reports/export-intelligent-csv?${qs.toString()}`);
  }

  async function saveSynonym(e: Event) {
    e.preventDefault();
    const list = synList()
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length >= 2);
    if (!synTerm().trim() || list.length === 0) return;

    setSynBusy(true);
    setSynFeedback(null);
    try {
      await api("/admin/search-synonyms", {
        method: "POST",
        body: { term: synTerm().trim(), synonyms: list },
      });
      setSynTerm("");
      setSynList("");
      setSynFeedback("Sinônimo cadastrado e ativo nas buscas da loja.");
      await Promise.all([refetchZero(), refetchSynonyms()]);
    } catch (err) {
      setSynFeedback(
        err instanceof ApiError ? err.message : "Erro ao salvar sinônimo.",
      );
    } finally {
      setSynBusy(false);
    }
  }

  async function deleteSynonym(id: number) {
    setSynBusy(true);
    setSynFeedback(null);
    try {
      await api(`/admin/search-synonyms/${id}`, { method: "DELETE" });
      await Promise.all([refetchZero(), refetchSynonyms()]);
    } finally {
      setSynBusy(false);
    }
  }

  return (
    <div class="space-y-5">
      {/* Tab 1: Buscas sem resultado */}
      <Show when={props.activeTab === "zero_results"}>
        <section class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4">
            <div class="relative flex-1 min-w-[220px]">
              <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
              <input
                type="search"
                value={zeroSearch()}
                onInput={(e) => setZeroSearch(e.currentTarget.value)}
                placeholder="Filtrar termo buscado sem resultado..."
                class="h-9 w-full rounded-lg border border-zinc-300 pl-9 pr-3 text-sm focus:border-[#93509e] focus:outline-none"
              />
            </div>
            <a
              href={buildCsvExportUrl("zero_results")}
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#DFC2E3] bg-[#FCF8FD] px-3.5 text-xs font-bold text-[#93509e] hover:bg-[#F3E2F6]"
            >
              <Download class="size-3.5" />
              Exportar CSV
            </a>
          </div>

          <Show when={zeroResults()}>
            {(zr) => (
              <>
                <div class="grid gap-3 sm:grid-cols-3">
                  <div class="rounded-xl border border-zinc-200 bg-white p-4">
                    <p class="text-[11px] font-bold uppercase text-zinc-500">
                      Termos únicos sem resultado
                    </p>
                    <p class="mt-1 text-2xl font-black text-zinc-900">
                      {zr().total_unique_terms}
                    </p>
                  </div>
                  <div class="rounded-xl border border-zinc-200 bg-white p-4">
                    <p class="text-[11px] font-bold uppercase text-zinc-500">
                      Buscas perdidas no período
                    </p>
                    <p class="mt-1 text-2xl font-black text-amber-700">
                      {zr().total_searches}
                    </p>
                  </div>
                  <div class="rounded-xl border border-zinc-200 bg-white p-4">
                    <p class="text-[11px] font-bold uppercase text-zinc-500">
                      Sinônimos configurados
                    </p>
                    <p class="mt-1 text-2xl font-black text-[#93509e]">
                      {synonyms()?.length ?? 0}
                    </p>
                  </div>
                </div>

                <div class="overflow-hidden rounded-xl border border-zinc-200 bg-white">
                  <div class="overflow-x-auto">
                    <table class="w-full text-left text-xs">
                      <thead class="border-b border-zinc-200 bg-zinc-50 uppercase text-zinc-500">
                        <tr>
                          <th class="p-3">Termo buscado</th>
                          <th class="p-3 text-right">Ocorrências</th>
                          <th class="p-3">Última busca</th>
                          <th class="p-3">Produtos parecidos</th>
                          <th class="p-3 text-right">Sinônimo / Ação</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-zinc-100">
                        <Show
                          when={zr().items.length > 0}
                          fallback={
                            <tr>
                              <td
                                colspan="5"
                                class="p-6 text-center text-zinc-500"
                              >
                                Nenhuma busca sem resultado registrada neste
                                período.
                              </td>
                            </tr>
                          }
                        >
                          <For each={zr().items}>
                            {(item) => (
                              <tr class="hover:bg-zinc-50/80">
                                <td class="p-3">
                                  <p class="font-bold text-zinc-900">
                                    {item.sample_term}
                                  </p>
                                  <p class="text-[11px] text-zinc-400">
                                    Normalizado: {item.normalized_term}
                                    <Show when={item.category_slug}>
                                      {" "}
                                      · Categoria: {item.category_slug}
                                    </Show>
                                  </p>
                                </td>
                                <td class="p-3 text-right">
                                  <span class="rounded-full bg-amber-100 px-2.5 py-0.5 font-bold text-amber-800">
                                    {item.occurrences}x
                                  </span>
                                </td>
                                <td class="p-3 text-zinc-600">
                                  {new Date(
                                    item.last_searched_at,
                                  ).toLocaleString("pt-BR")}
                                </td>
                                <td class="p-3">
                                  <Show
                                    when={item.similar_products.length > 0}
                                    fallback={
                                      <span class="text-zinc-400">—</span>
                                    }
                                  >
                                    <div class="flex flex-wrap gap-1">
                                      <For each={item.similar_products}>
                                        {(prod) => (
                                          <a
                                            href={`/produto/${prod.slug}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            class="rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-700 hover:border-[#93509e] hover:text-[#93509e]"
                                          >
                                            {prod.name}
                                          </a>
                                        )}
                                      </For>
                                    </div>
                                  </Show>
                                </td>
                                <td class="p-3 text-right">
                                  <Show
                                    when={item.synonym}
                                    fallback={
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setSynTerm(item.sample_term)
                                        }
                                        class="inline-flex items-center gap-1 rounded-md border border-[#DFC2E3] bg-[#FCF8FD] px-2.5 py-1 text-[11px] font-bold text-[#93509e] hover:bg-[#F3E2F6]"
                                      >
                                        <Plus class="size-3" />
                                        Criar sinônimo
                                      </button>
                                    }
                                  >
                                    {(syn) => (
                                      <span class="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                                        Mapeado: {syn().synonyms.join(", ")}
                                      </span>
                                    )}
                                  </Show>
                                </td>
                              </tr>
                            )}
                          </For>
                        </Show>
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </Show>

          {/* Cadastro e listagem de sinonimos */}
          <div class="grid gap-4 lg:grid-cols-12">
            <form
              onSubmit={(e) => void saveSynonym(e)}
              class="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 lg:col-span-5"
            >
              <h3 class="text-sm font-bold text-zinc-900">
                Cadastrar Sinônimo de Busca
              </h3>
              <p class="text-xs text-zinc-500">
                Quando a cliente buscar o termo digitado, a loja também exibirá
                produtos que contenham os sinônimos configurados.
              </p>
              <Show when={synFeedback()}>
                <p class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                  {synFeedback()}
                </p>
              </Show>
              <div>
                <label class="block text-xs font-semibold text-zinc-700">
                  Termo digitado pela cliente
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex.: esmalte em gel uva"
                  value={synTerm()}
                  onInput={(e) => setSynTerm(e.currentTarget.value)}
                  class="mt-1 h-9 w-full rounded-lg border border-zinc-300 px-3 text-sm"
                />
              </div>
              <div>
                <label class="block text-xs font-semibold text-zinc-700">
                  Sinônimos no catálogo (separados por vírgula)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex.: ameixa, roxo escuro, vinho"
                  value={synList()}
                  onInput={(e) => setSynList(e.currentTarget.value)}
                  class="mt-1 h-9 w-full rounded-lg border border-zinc-300 px-3 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={synBusy()}
                class="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#93509e] px-4 text-xs font-bold text-white hover:bg-[#7c3f87] disabled:opacity-50"
              >
                <Plus class="size-3.5" />
                Salvar sinônimo
              </button>
            </form>

            <div class="rounded-xl border border-zinc-200 bg-white p-4 lg:col-span-7">
              <h3 class="mb-3 text-sm font-bold text-zinc-900">
                Sinônimos Ativos na Loja
              </h3>
              <Show
                when={(synonyms()?.length ?? 0) > 0}
                fallback={
                  <p class="text-xs text-zinc-500">
                    Nenhum sinônimo cadastrado ainda.
                  </p>
                }
              >
                <ul class="divide-y divide-zinc-100 text-xs">
                  <For each={synonyms() ?? []}>
                    {(syn) => (
                      <li class="flex items-center justify-between gap-2 py-2.5">
                        <div>
                          <span class="font-bold text-zinc-900">
                            "{syn.term}"
                          </span>{" "}
                          <span class="text-zinc-400">→</span>{" "}
                          <span class="text-[#93509e] font-semibold">
                            {syn.synonyms.join(", ")}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => void deleteSynonym(syn.id)}
                          disabled={synBusy()}
                          class="rounded p-1 text-red-600 hover:bg-red-50"
                          title="Remover sinônimo"
                        >
                          <Trash2 class="size-3.5" />
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </div>
          </div>
        </section>
      </Show>

      {/* Tab 2: Cores Mais Solicitadas (Avise-me) */}
      <Show when={props.activeTab === "demanded_shades"}>
        <section class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4">
            <div class="flex flex-wrap items-center gap-2 text-xs">
              <select
                value={availabilityFilter()}
                onChange={(e) =>
                  setAvailabilityFilter(
                    e.currentTarget.value as
                      "all" | "out_of_stock" | "in_stock",
                  )
                }
                class="h-9 rounded-lg border border-zinc-300 bg-white px-2.5 text-xs font-medium"
              >
                <option value="all">Qualquer estoque</option>
                <option value="out_of_stock">Apenas esgotadas (0 un)</option>
                <option value="in_stock">Já com estoque</option>
              </select>

              <select
                value={brandIdFilter()}
                onChange={(e) => setBrandIdFilter(e.currentTarget.value)}
                class="h-9 rounded-lg border border-zinc-300 bg-white px-2.5 text-xs font-medium"
              >
                <option value="">Todas as marcas</option>
                <For each={brands() ?? []}>
                  {(b) => <option value={b.id}>{b.name}</option>}
                </For>
              </select>

              <select
                value={categoryIdFilter()}
                onChange={(e) => setCategoryIdFilter(e.currentTarget.value)}
                class="h-9 rounded-lg border border-zinc-300 bg-white px-2.5 text-xs font-medium"
              >
                <option value="">Todas as categorias</option>
                <For each={categories() ?? []}>
                  {(c) => <option value={c.id}>{c.name}</option>}
                </For>
              </select>
            </div>

            <a
              href={buildCsvExportUrl("demanded_shades")}
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#DFC2E3] bg-[#FCF8FD] px-3.5 text-xs font-bold text-[#93509e] hover:bg-[#F3E2F6]"
            >
              <Download class="size-3.5" />
              Exportar CSV
            </a>
          </div>

          <Show when={demandedShades()}>
            {(ds) => (
              <div class="overflow-hidden rounded-xl border border-zinc-200 bg-white">
                <div class="overflow-x-auto">
                  <table class="w-full text-left text-xs">
                    <thead class="border-b border-zinc-200 bg-zinc-50 uppercase text-zinc-500">
                      <tr>
                        <th class="p-3">Produto / Tonalidade</th>
                        <th class="p-3">SKU</th>
                        <th class="p-3 text-right">Estoque atual</th>
                        <th class="p-3 text-right">Aguardando aviso</th>
                        <th class="p-3 text-right">Histórico total</th>
                        <th class="p-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-zinc-100">
                      <Show
                        when={ds().items.length > 0}
                        fallback={
                          <tr>
                            <td
                              colspan="6"
                              class="p-6 text-center text-zinc-500"
                            >
                              Nenhuma solicitação de Avise-me encontrada para
                              estes filtros.
                            </td>
                          </tr>
                        }
                      >
                        <For each={ds().items}>
                          {(row) => (
                            <tr class="hover:bg-zinc-50/80">
                              <td class="p-3">
                                <p class="font-bold text-zinc-900">
                                  {row.product_name}
                                </p>
                                <p class="text-[11px] text-zinc-500">
                                  {row.variant_name}
                                  <Show when={row.shade_code}>
                                    {" "}
                                    · Cód. {row.shade_code}
                                  </Show>
                                  <Show when={row.brand_name}>
                                    {" "}
                                    · {row.brand_name}
                                  </Show>
                                </p>
                              </td>
                              <td class="p-3 font-mono text-[11px] text-zinc-700">
                                {row.sku}
                              </td>
                              <td class="p-3 text-right">
                                <span
                                  class={`rounded-full px-2 py-0.5 font-bold ${
                                    row.available_stock <= 0
                                      ? "bg-red-100 text-red-700"
                                      : "bg-emerald-100 text-emerald-700"
                                  }`}
                                >
                                  {row.available_stock <= 0
                                    ? "Esgotado"
                                    : `${row.available_stock} un`}
                                </span>
                              </td>
                              <td class="p-3 text-right">
                                <span class="rounded-full bg-[#F3E2F6] px-2.5 py-0.5 font-bold text-[#93509e]">
                                  {row.pending_count} cliente(s)
                                </span>
                              </td>
                              <td class="p-3 text-right font-semibold text-zinc-700">
                                {row.total_historical_count}
                              </td>
                              <td class="p-3 text-right">
                                <div class="inline-flex items-center gap-1.5">
                                  <Link
                                    to="/admin/produtos"
                                    search={
                                      {
                                        tab: "produtos",
                                        search: row.sku,
                                      } as Record<string, string>
                                    }
                                    class="rounded border border-zinc-300 px-2 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                                  >
                                    Ver produto
                                  </Link>
                                  <Link
                                    to="/admin/produtos"
                                    search={
                                      {
                                        tab: "recebimentos",
                                        sku: row.sku,
                                      } as Record<string, string>
                                    }
                                    class="inline-flex items-center gap-1 rounded bg-[#93509e] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#7c3f87]"
                                  >
                                    <PackagePlus class="size-3" />
                                    Registrar recebimento
                                  </Link>
                                </div>
                              </td>
                            </tr>
                          )}
                        </For>
                      </Show>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Show>
        </section>
      </Show>

      {/* Tab 3: Produtos Comprados Juntos */}
      <Show when={props.activeTab === "bought_together"}>
        <section class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4">
            <div class="flex items-center gap-2 text-xs text-zinc-600">
              <Sparkles class="size-4 text-[#93509e]" />
              <span>
                Afinidade real apurada exclusivamente sobre{" "}
                <strong>pedidos pagos/concluídos</strong> no período, sem
                duplicação de pares (A+B).
              </span>
            </div>
            <a
              href={buildCsvExportUrl("bought_together")}
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#DFC2E3] bg-[#FCF8FD] px-3.5 text-xs font-bold text-[#93509e] hover:bg-[#F3E2F6]"
            >
              <Download class="size-3.5" />
              Exportar CSV
            </a>
          </div>

          <Show when={boughtTogether()}>
            {(bt) => (
              <div class="overflow-hidden rounded-xl border border-zinc-200 bg-white">
                <div class="overflow-x-auto">
                  <table class="w-full text-left text-xs">
                    <thead class="border-b border-zinc-200 bg-zinc-50 uppercase text-zinc-500">
                      <tr>
                        <th class="p-3">Combinação (Produto A + Produto B)</th>
                        <th class="p-3 text-right">Pedidos juntos</th>
                        <th class="p-3 text-right">Afinidade</th>
                        <th class="p-3 text-right">Receita associada</th>
                        <th class="p-3">Sugestão comercial</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-zinc-100">
                      <Show
                        when={bt().pairs.length > 0}
                        fallback={
                          <tr>
                            <td
                              colspan="5"
                              class="p-6 text-center text-zinc-500"
                            >
                              Ainda não há combinações recorrentes de múltiplos
                              produtos em pedidos pagos neste período.
                            </td>
                          </tr>
                        }
                      >
                        <For each={bt().pairs}>
                          {(pair) => (
                            <tr class="hover:bg-zinc-50/80">
                              <td class="p-3">
                                <div class="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                                  <div class="flex items-center gap-2">
                                    <img
                                      src={assetUrl(pair.product_a.image_url)}
                                      alt={pair.product_a.name}
                                      class="size-8 rounded border border-zinc-200 object-contain"
                                    />
                                    <div>
                                      <p class="font-bold text-zinc-900">
                                        {pair.product_a.name}
                                      </p>
                                      <p class="font-mono text-[10px] text-zinc-400">
                                        {pair.product_a.sku}
                                      </p>
                                    </div>
                                  </div>
                                  <span class="font-black text-[#93509e]">
                                    +
                                  </span>
                                  <div class="flex items-center gap-2">
                                    <img
                                      src={assetUrl(pair.product_b.image_url)}
                                      alt={pair.product_b.name}
                                      class="size-8 rounded border border-zinc-200 object-contain"
                                    />
                                    <div>
                                      <p class="font-bold text-zinc-900">
                                        {pair.product_b.name}
                                      </p>
                                      <p class="font-mono text-[10px] text-zinc-400">
                                        {pair.product_b.sku}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td class="p-3 text-right">
                                <span class="rounded-full bg-[#F3E2F6] px-2.5 py-0.5 font-bold text-[#93509e]">
                                  {pair.joint_orders_count} pedido(s)
                                </span>
                              </td>
                              <td class="p-3 text-right text-zinc-600">
                                <div>A→B: {pair.pct_of_a_orders}%</div>
                                <div>B→A: {pair.pct_of_b_orders}%</div>
                              </td>
                              <td class="p-3 text-right font-bold text-zinc-900">
                                {formatCents(pair.associated_revenue_cents)}
                              </td>
                              <td class="p-3">
                                <span
                                  class={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                                    pair.suggestion.includes("Kit")
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-zinc-100 text-zinc-700"
                                  }`}
                                >
                                  <AlertCircle class="size-3" />
                                  {pair.suggestion}
                                </span>
                              </td>
                            </tr>
                          )}
                        </For>
                      </Show>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Show>
        </section>
      </Show>
    </div>
  );
}
