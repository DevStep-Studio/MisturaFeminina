import { createFileRoute, Link } from "@tanstack/solid-router";
import Boxes from "lucide-solid/icons/boxes";
import Check from "lucide-solid/icons/circle-check";
import Layers from "lucide-solid/icons/layers";
import MessageCircle from "lucide-solid/icons/message-circle";
import Minus from "lucide-solid/icons/minus";
import Plus from "lucide-solid/icons/plus";
import Search from "lucide-solid/icons/search";
import ShoppingBag from "lucide-solid/icons/shopping-bag";
import Sparkles from "lucide-solid/icons/sparkles";
import Trash2 from "lucide-solid/icons/trash";
import Truck from "lucide-solid/icons/truck";
import UserCheck from "lucide-solid/icons/user-check";
import X from "lucide-solid/icons/x";
import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { ProductImage } from "../features/storefront/components/ProductImage";
import { StoreShell } from "../features/storefront/components/StoreShell";
import { addCartItem, refreshCart, storefrontStore } from "../features/storefront/store";
import type { ProductCardData, ProductCardVariantData } from "../features/storefront/types";
import {
  type WholesaleSelectionItem,
  buildWholesaleWhatsAppMessage,
  computeWholesaleUnitPrice,
  formatBrlCurrency,
} from "../features/storefront/wholesale";
import { api } from "../lib/api";
import { formatCents, whatsappUrl } from "../lib/format";
import { buildBreadcrumbSchema, seoHead } from "../lib/seo";
import { trackContactClick, trackEvent } from "../monitoring/analytics";

export const Route = createFileRoute("/atacado")({
  head: () =>
    seoHead({
      title: "Atacado e Preços por Quantidade | Mistura Feminina Cosméticos",
      description:
        "Compre no atacado na Mistura Feminina: descontos progressivos por quantidade, liberdade para misturar cores e tonalidades na mesma linha e condições para revendedoras e salões.",
      path: "/atacado",
      jsonLd: buildBreadcrumbSchema([
        { name: "Início", path: "/" },
        { name: "Atacado", path: "/atacado" },
      ]),
    }),
  component: WholesaleStorefrontPage,
});

function WholesaleStorefrontPage() {
  const [modalOpen, setModalOpen] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [addingToCart, setAddingToCart] = createSignal(false);
  const [cartSuccess, setCartSuccess] = createSignal(false);
  const [searchTerm, setSearchTerm] = createSignal("");
  const [selectedCategory, setSelectedCategory] = createSignal("all");
  const [quantities, setQuantities] = createSignal<Record<number, number>>({});

  const [feedback, setFeedback] = createSignal<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const [resellerForm, setResellerForm] = createSignal({
    name: "",
    email: "",
    phone: "",
    cnpj_cpf: "",
    company_name: "",
    trade_name: "",
    state_registration: "",
    notes: "",
  });

  // Carrega produtos do atacado
  const [catalog] = createResource(
    () => ({
      search: searchTerm(),
      category: selectedCategory(),
    }),
    async ({ search, category }) => {
      try {
        const params = new URLSearchParams();
        params.set("per_page", "60");
        if (search.trim()) params.set("search", search.trim());
        if (category && category !== "all") params.set("category", category);

        const res = await api<{
          data: {
            products: ProductCardData[];
            meta?: { total?: number };
          };
        }>(`/wholesale/catalog?${params.toString()}`, {
          authenticated: false,
        });
        return res.data?.products ?? [];
      } catch {
        return [];
      }
    },
  );

  const categories = createMemo(() => {
    const bootstrapCats = storefrontStore.bootstrap().menu_categories ?? [];
    return [
      { slug: "all", name: "Todas as categorias" },
      ...bootstrapCats.map((c) => ({ slug: c.slug, name: c.name })),
    ];
  });

  const getProductVariants = (product: ProductCardData): ProductCardVariantData[] => {
    if (product.variants && product.variants.length > 0) {
      return product.variants;
    }
    return [
      {
        id: product.default_variant_id ?? product.id,
        name: "Padrão",
        sku: product.sku,
        price_cents: product.price_cents,
        effective_price_cents: product.effective_price_cents,
        stock_qty: product.available_stock,
        available_stock: product.available_stock,
        in_stock: product.in_stock,
        is_default: true,
      },
    ];
  };

  const setVariantQuantity = (variantId: number, qty: number, maxStock: number) => {
    const clamped = Math.max(0, Math.min(qty, maxStock > 0 ? maxStock : 9999));
    setQuantities((prev) => {
      const next = { ...prev };
      if (clamped <= 0) {
        delete next[variantId];
      } else {
        next[variantId] = clamped;
      }
      return next;
    });
  };

  // Cálculo das seleções ativas com descontos progressivos de atacado
  const selectionSummary = createMemo(() => {
    const qMap = quantities();
    const prods = catalog() ?? [];
    const items: WholesaleSelectionItem[] = [];
    let totalQty = 0;
    let totalCents = 0;

    for (const p of prods) {
      const vars = getProductVariants(p);
      const productSelectedQty = vars.reduce(
        (sum, v) => sum + (qMap[v.id] || 0),
        0,
      );

      if (productSelectedQty <= 0) continue;

      const tiers = p.wholesale_condition?.tiers ?? [];

      for (const v of vars) {
        const qty = qMap[v.id] || 0;
        if (qty <= 0) continue;

        let unitPriceCents = v.effective_price_cents;
        if (tiers.length > 0) {
          const calc = computeWholesaleUnitPrice(
            v.effective_price_cents,
            productSelectedQty,
            tiers,
          );
          unitPriceCents = calc.unitPriceCents;
        }

        const lineTotal = unitPriceCents * qty;
        totalQty += qty;
        totalCents += lineTotal;

        items.push({
          productId: p.id,
          productName: p.name,
          productSku: p.sku,
          variantId: v.id,
          variantName: v.name,
          variantSku: v.sku,
          quantity: qty,
          unitPriceCents,
          lineTotalCents: lineTotal,
        });
      }
    }

    return {
      items,
      totalQty,
      totalCents,
    };
  });

  const handleClearSelection = () => {
    setQuantities({});
  };

  const handleAddToCart = async () => {
    const items = selectionSummary().items;
    if (items.length === 0 || addingToCart()) return;

    setAddingToCart(true);
    setCartSuccess(false);
    try {
      for (const item of items) {
        await addCartItem(item.variantId, item.quantity, false);
      }
      await refreshCart();
      setCartSuccess(true);
      setTimeout(() => setCartSuccess(false), 4500);
    } catch {
      // erro tratado pelo carrinho
    } finally {
      setAddingToCart(false);
    }
  };

  const handleSendWhatsApp = () => {
    const storeSettings = storefrontStore.settings();
    const storeName = storeSettings.store_name || "Mistura Feminina Cosméticos";
    const number = storeSettings.whatsapp_number;
    const summary = selectionSummary();

    const message = buildWholesaleWhatsAppMessage({
      storeName,
      items: summary.items,
      totalQty: summary.totalQty,
      totalCents: summary.totalCents,
    });

    const url = whatsappUrl(number, message);
    trackContactClick("whatsapp");
    trackEvent("wholesale_inquiry", {
      channel: "whatsapp",
      total_qty: summary.totalQty,
      total_cents: summary.totalCents,
      items_count: summary.items.length,
    });
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleResellerSubmit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);

    try {
      await api.post("/wholesale/reseller-request", resellerForm());
      trackContactClick("form");
      trackEvent("wholesale_inquiry", {
        type: "reseller_registration",
        has_cnpj: Boolean(resellerForm().cnpj_cpf),
      });
      setFeedback({
        type: "ok",
        text: "Solicitação enviada com sucesso! Nossa equipe entrará em contato para liberar suas condições exclusivas.",
      });
      setResellerForm({
        name: "",
        email: "",
        phone: "",
        cnpj_cpf: "",
        company_name: "",
        trade_name: "",
        state_registration: "",
        notes: "",
      });
      setTimeout(() => {
        setModalOpen(false);
        setFeedback(null);
      }, 4000);
    } catch {
      setFeedback({
        type: "err",
        text: "Ocorreu um erro ao enviar sua solicitação. Verifique os dados ou entre em contato pelo WhatsApp.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <StoreShell>
      <div class="mx-auto max-w-7xl px-4 py-8 pb-32">
        {/* Breadcrumb */}
        <nav class="mb-4 flex items-center gap-2 text-xs text-zinc-500">
          <Link to="/" class="hover:text-[var(--mf-primary)]">
            Início
          </Link>
          <span>/</span>
          <span class="font-semibold text-zinc-800">Atacado</span>
        </nav>

        {/* Hero Banner do Atacado */}
        <div class="rounded-2xl border border-[#DFC4E6] bg-gradient-to-r from-[#FAF3FC] to-[#F5EAF8] p-6 sm:p-8">
          <div class="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div class="max-w-3xl space-y-2">
              <span class="inline-flex items-center gap-1.5 rounded-full bg-[#93509e] px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-white">
                <Boxes class="size-3.5" />
                Catálogo de Atacado & Revenda
              </span>
              <h1 class="text-2xl font-extrabold text-[#2E0C49] sm:text-3xl">
                Preços de Atacado com Desconto Progressivo
              </h1>
              <p class="text-xs text-zinc-700 sm:text-sm">
                Selecione as quantidades por cor, tamanho ou variação na mesma linha. As faixas de desconto são calculadas em tempo real e você pode enviar seu pedido direto para a sacola ou para atendimento pelo WhatsApp oficial.
              </p>
              <div class="flex flex-wrap gap-3 pt-2 text-xs font-semibold text-[#66166E]">
                <div class="flex items-center gap-1.5">
                  <Sparkles class="size-3.5 text-[#93509e]" />
                  <span>Descontos progressivos automáticos</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <Layers class="size-3.5 text-[#93509e]" />
                  <span>Mistura de cores livre por linha</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <Truck class="size-3.5 text-[#93509e]" />
                  <span>Frete grátis por região elegível</span>
                </div>
              </div>
            </div>

            <div class="flex shrink-0 flex-col gap-2.5 sm:flex-row lg:flex-col">
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                class="inline-flex items-center justify-center gap-2 rounded-xl bg-[#93509e] px-5 py-3 text-xs font-extrabold uppercase tracking-wider text-white shadow-md transition hover:bg-[#7c3f87]"
              >
                <UserCheck class="size-4" />
                <span>Cadastro de Revendedora</span>
              </button>
            </div>
          </div>
        </div>

        {/* Barra de Filtros e Busca */}
        <div class="mt-8 space-y-4">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Input de Busca */}
            <div class="relative flex-1 sm:max-w-md">
              <Search class="absolute left-3.5 top-3 size-4 text-zinc-400" />
              <input
                type="text"
                value={searchTerm()}
                onInput={(e) => setSearchTerm(e.currentTarget.value)}
                placeholder="Buscar produto por nome, linha ou SKU..."
                class="h-10 w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-4 text-xs text-zinc-900 shadow-2xs focus:border-[#93509e] focus:outline-hidden"
              />
              <Show when={searchTerm()}>
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  class="absolute right-3 top-3 text-zinc-400 hover:text-zinc-600"
                >
                  <X class="size-4" />
                </button>
              </Show>
            </div>

            <div class="text-xs font-semibold text-zinc-600">
              {catalog()?.length ?? 0} produtos disponíveis
            </div>
          </div>

          {/* Chips de Categorias */}
          <div class="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <For each={categories()}>
              {(cat) => {
                const isActive = () => selectedCategory() === cat.slug;
                return (
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(cat.slug)}
                    class={`shrink-0 rounded-full px-3.5 py-1.5 font-bold transition ${
                      isActive()
                        ? "bg-[#93509e] text-white shadow-2xs"
                        : "border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                    }`}
                  >
                    {cat.name}
                  </button>
                );
              }}
            </For>
          </div>
        </div>

        {/* Feedback de Adicionado ao Carrinho */}
        <Show when={cartSuccess()}>
          <div class="mt-4 flex items-center justify-between rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-xs font-bold text-emerald-800">
            <div class="flex items-center gap-2">
              <Check class="size-4 text-emerald-600" />
              <span>Itens adicionados à sua sacola com sucesso!</span>
            </div>
            <Link
              to="/carrinho"
              class="rounded-lg bg-emerald-700 px-3 py-1.5 text-white hover:bg-emerald-800"
            >
              Ir para o Carrinho →
            </Link>
          </div>
        </Show>

        {/* Grid de Produtos */}
        <div class="mt-6 space-y-6">
          <Show
            when={!catalog.loading}
            fallback={
              <div class="flex flex-col items-center justify-center py-20 text-zinc-500">
                <Boxes class="size-10 animate-pulse text-[#93509e]" />
                <p class="mt-3 text-sm font-semibold">Carregando catálogo de atacado...</p>
              </div>
            }
          >
            <Show
              when={(catalog()?.length ?? 0) > 0}
              fallback={
                <div class="flex flex-col items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 p-12 text-center text-zinc-600">
                  <Boxes class="size-10 text-zinc-400" />
                  <p class="mt-2 text-sm font-bold text-zinc-900">
                    Nenhum produto encontrado
                  </p>
                  <p class="text-xs text-zinc-500">
                    Tente buscar por outro termo ou selecione todas as categorias.
                  </p>
                </div>
              }
            >
              <For each={catalog()}>
                {(product) => {
                  const variants = getProductVariants(product);
                  const pSelectedQty = () =>
                    variants.reduce(
                      (acc, v) => acc + (quantities()[v.id] || 0),
                      0,
                    );

                  const tiers = product.wholesale_condition?.tiers ?? [];
                  const activeCalc = () =>
                    tiers.length > 0 && pSelectedQty() > 0
                      ? computeWholesaleUnitPrice(
                          product.effective_price_cents,
                          pSelectedQty(),
                          tiers,
                        )
                      : null;

                  return (
                    <div class="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-2xs transition hover:border-[#93509e]/30">
                      {/* Topo do Produto */}
                      <div class="flex flex-col gap-4 border-b border-zinc-100 p-4 sm:flex-row sm:items-center sm:justify-between bg-zinc-50/50">
                        <div class="flex items-center gap-3.5">
                          <div class="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-white p-1">
                            <ProductImage
                              src={product.primary_image}
                              alt={product.name}
                              class="h-full w-full object-contain"
                            />
                          </div>
                          <div>
                            <div class="flex flex-wrap items-center gap-1.5">
                              <Show when={product.brand}>
                                <span class="rounded bg-[#FAF3FC] px-2 py-0.5 text-[10px] font-bold text-[#93509e]">
                                  {product.brand!.name}
                                </span>
                              </Show>
                              <span class="text-[11px] font-mono text-zinc-500">
                                SKU: {product.sku}
                              </span>
                            </div>
                            <h3 class="text-sm font-extrabold text-[#2E0C49]">
                              <Link
                                to="/produto/$slug"
                                params={{ slug: product.slug }}
                                class="hover:text-[#93509e]"
                              >
                                {product.name}
                              </Link>
                            </h3>
                            <p class="text-xs text-zinc-600">
                              Preço base:{" "}
                              <strong>
                                {formatCents(product.effective_price_cents)}
                              </strong>
                              {tiers.length > 0 && (
                                <span class="ml-2 font-semibold text-[#8E237C]">
                                  • Atacado a partir de {tiers[0].min_quantity} un.
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Status da seleção do produto */}
                        <div class="text-left sm:text-right">
                          <Show
                            when={pSelectedQty() > 0}
                            fallback={
                              <span class="rounded-lg bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">
                                Nenhuma unidade selecionada
                              </span>
                            }
                          >
                            <div class="inline-flex flex-col items-start sm:items-end">
                              <span class="text-xs font-extrabold text-[#2E0C49]">
                                {pSelectedQty()} {pSelectedQty() === 1 ? "unidade selecionada" : "unidades selecionadas"}
                              </span>
                              <Show when={activeCalc() && activeCalc()!.appliedDiscountPercent > 0}>
                                <span class="text-[11px] font-bold text-emerald-700">
                                  Faixa ativada: {activeCalc()!.appliedDiscountPercent}% OFF ({formatCents(activeCalc()!.unitPriceCents)}/un)
                                </span>
                              </Show>
                            </div>
                          </Show>
                        </div>
                      </div>

                      {/* Lista de Variações / Matriz de Quantidades */}
                      <div class="divide-y divide-zinc-100 p-2 sm:p-4">
                        <For each={variants}>
                          {(variant) => {
                            const qty = () => quantities()[variant.id] || 0;
                            const maxStock = variant.available_stock;
                            const isOutOfStock = maxStock <= 0;

                            const unitPrice = () => {
                              if (tiers.length > 0 && pSelectedQty() > 0) {
                                return computeWholesaleUnitPrice(
                                  variant.effective_price_cents,
                                  pSelectedQty(),
                                  tiers,
                                ).unitPriceCents;
                              }
                              return variant.effective_price_cents;
                            };

                            return (
                              <div class="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between px-2 rounded-lg transition hover:bg-zinc-50/70">
                                <div class="flex items-center gap-3">
                                  <div>
                                    <p class="text-xs font-bold text-zinc-900">
                                      {variant.name !== "Padrão" ? variant.name : product.name}
                                    </p>
                                    <div class="flex items-center gap-2 text-[11px] text-zinc-500">
                                      <span>SKU: {variant.sku}</span>
                                      <span>•</span>
                                      <Show
                                        when={!isOutOfStock}
                                        fallback={
                                          <span class="font-bold text-red-600">
                                            Esgotado
                                          </span>
                                        }
                                      >
                                        <span class="text-zinc-600">
                                          Estoque: {maxStock} un.
                                        </span>
                                      </Show>
                                    </div>
                                  </div>
                                </div>

                                <div class="flex items-center justify-between gap-4 sm:justify-end">
                                  {/* Preço Unitário */}
                                  <div class="text-left sm:text-right">
                                    <span class="text-xs font-extrabold text-[#2E0C49]">
                                      {formatCents(unitPrice())}
                                    </span>
                                    <span class="text-[10px] text-zinc-500"> /un</span>
                                  </div>

                                  {/* Seletor de Quantidade */}
                                  <div class="flex items-center rounded-lg border border-zinc-200 bg-white shadow-2xs">
                                    <button
                                      type="button"
                                      disabled={qty() <= 0}
                                      onClick={() =>
                                        setVariantQuantity(
                                          variant.id,
                                          qty() - 1,
                                          maxStock,
                                        )
                                      }
                                      class="flex h-8 w-8 items-center justify-center text-zinc-600 hover:bg-zinc-100 disabled:opacity-40"
                                      aria-label="Diminuir quantidade"
                                    >
                                      <Minus class="size-3.5" />
                                    </button>
                                    <input
                                      type="number"
                                      min="0"
                                      max={maxStock > 0 ? maxStock : undefined}
                                      value={qty()}
                                      disabled={isOutOfStock}
                                      onInput={(e) =>
                                        setVariantQuantity(
                                          variant.id,
                                          parseInt(e.currentTarget.value, 10) || 0,
                                          maxStock,
                                        )
                                      }
                                      class="h-8 w-12 text-center text-xs font-bold text-zinc-900 focus:outline-hidden disabled:bg-zinc-100"
                                    />
                                    <button
                                      type="button"
                                      disabled={isOutOfStock || (maxStock > 0 && qty() >= maxStock)}
                                      onClick={() =>
                                        setVariantQuantity(
                                          variant.id,
                                          qty() + 1,
                                          maxStock,
                                        )
                                      }
                                      class="flex h-8 w-8 items-center justify-center text-zinc-600 hover:bg-zinc-100 disabled:opacity-40"
                                      aria-label="Aumentar quantidade"
                                    >
                                      <Plus class="size-3.5" />
                                    </button>
                                  </div>

                                  {/* Subtotal da Linha */}
                                  <div class="w-20 text-right">
                                    <span class="text-xs font-extrabold text-[#8E237C]">
                                      {formatCents(unitPrice() * qty())}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          }}
                        </For>
                      </div>
                    </div>
                  );
                }}
              </For>
            </Show>
          </Show>
        </div>

        {/* Barra Flutuante Fixa de Conclusão do Pedido */}
        <Show when={selectionSummary().totalQty > 0}>
          <div class="fixed bottom-0 left-0 right-0 z-40 border-t border-[#DFC4E6] bg-white/95 px-4 py-3.5 shadow-2xl backdrop-blur-md">
            <div class="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {/* Resumo do Pedido */}
              <div class="flex items-center gap-4">
                <div class="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FAF3FC] text-[#93509e]">
                  <Boxes class="size-6" />
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-bold text-zinc-600">
                      Total Selecionado:
                    </span>
                    <span class="rounded bg-[#FAF3FC] px-2 py-0.5 text-xs font-extrabold text-[#93509e]">
                      {selectionSummary().totalQty} {selectionSummary().totalQty === 1 ? "peça" : "peças"}
                    </span>
                  </div>
                  <div class="flex items-baseline gap-2">
                    <span class="text-lg font-extrabold text-[#2E0C49]">
                      {formatBrlCurrency(selectionSummary().totalCents)}
                    </span>
                    <span class="text-xs text-zinc-500">subtotal atacado</span>
                  </div>
                </div>
              </div>

              {/* Botões de Ação */}
              <div class="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleClearSelection}
                  class="inline-flex h-11 items-center gap-1.5 rounded-xl border border-zinc-200 px-3.5 text-xs font-bold text-zinc-600 transition hover:bg-zinc-100"
                >
                  <Trash2 class="size-4" />
                  <span>Limpar</span>
                </button>

                <button
                  type="button"
                  disabled={addingToCart()}
                  onClick={() => void handleAddToCart()}
                  class="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#93509e] bg-white px-5 text-xs font-bold text-[#93509e] shadow-xs transition hover:bg-[#FAF3FC] disabled:opacity-60"
                >
                  <ShoppingBag class="size-4" />
                  <span>{addingToCart() ? "Adicionando..." : "Adicionar à Sacola"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSendWhatsApp}
                  class="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-xs font-extrabold text-white shadow-md transition hover:bg-emerald-700"
                >
                  <MessageCircle class="size-4" />
                  <span>Enviar Pedido pelo WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        </Show>

        {/* Modal de Cadastro de Revendedora */}
        <Show when={modalOpen()}>
          <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
            <div class="relative w-full max-w-lg rounded-2xl border border-[#E5C2EA] bg-white p-6 shadow-2xl">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Fechar"
                class="absolute right-4 top-4 text-zinc-400 hover:text-zinc-600"
              >
                <X class="size-5" />
              </button>

              <div class="flex items-center gap-2 text-[#2E0C49]">
                <Boxes class="size-6 text-[#93509e]" />
                <h3 class="text-lg font-bold">
                  Cadastro de Revendedora / Atacado
                </h3>
              </div>
              <p class="mt-1 text-xs text-[#5B486B]">
                Cadastre sua empresa ou salão para ter acesso a tabelas exclusivas, compras em grande volume e atendimento personalizado.
              </p>

              <Show when={feedback()}>
                {(fb) => (
                  <div
                    class={`mt-4 rounded-lg p-3 text-xs font-semibold ${
                      fb().type === "ok"
                        ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border border-red-200 bg-red-50 text-red-800"
                    }`}
                  >
                    {fb().text}
                  </div>
                )}
              </Show>

              <form onSubmit={handleResellerSubmit} class="mt-4 space-y-3">
                <div>
                  <label
                    for="reseller-name"
                    class="block text-xs font-bold text-[#3D1260]"
                  >
                    Nome do Responsável *
                  </label>
                  <input
                    id="reseller-name"
                    type="text"
                    required
                    value={resellerForm().name}
                    onInput={(e) =>
                      setResellerForm({ ...resellerForm(), name: e.currentTarget.value })
                    }
                    class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs focus:border-[#93509e] focus:outline-hidden"
                    placeholder="Seu nome completo"
                  />
                </div>

                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      for="reseller-email"
                      class="block text-xs font-bold text-[#3D1260]"
                    >
                      E-mail *
                    </label>
                    <input
                      id="reseller-email"
                      type="email"
                      required
                      value={resellerForm().email}
                      onInput={(e) =>
                        setResellerForm({ ...resellerForm(), email: e.currentTarget.value })
                      }
                      class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs focus:border-[#93509e] focus:outline-hidden"
                      placeholder="email@exemplo.com"
                    />
                  </div>
                  <div>
                    <label
                      for="reseller-phone"
                      class="block text-xs font-bold text-[#3D1260]"
                    >
                      WhatsApp / Telefone *
                    </label>
                    <input
                      id="reseller-phone"
                      type="tel"
                      required
                      value={resellerForm().phone}
                      onInput={(e) =>
                        setResellerForm({ ...resellerForm(), phone: e.currentTarget.value })
                      }
                      class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs focus:border-[#93509e] focus:outline-hidden"
                      placeholder="(11) 99999-9999"
                    />
                  </div>
                </div>

                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      for="reseller-doc"
                      class="block text-xs font-bold text-[#3D1260]"
                    >
                      CNPJ ou CPF *
                    </label>
                    <input
                      id="reseller-doc"
                      type="text"
                      required
                      value={resellerForm().cnpj_cpf}
                      onInput={(e) =>
                        setResellerForm({ ...resellerForm(), cnpj_cpf: e.currentTarget.value })
                      }
                      class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs focus:border-[#93509e] focus:outline-hidden"
                      placeholder="00.000.000/0001-00"
                    />
                  </div>
                  <div>
                    <label
                      for="reseller-company"
                      class="block text-xs font-bold text-[#3D1260]"
                    >
                      Razão Social / Salão
                    </label>
                    <input
                      id="reseller-company"
                      type="text"
                      value={resellerForm().company_name}
                      onInput={(e) =>
                        setResellerForm({
                          ...resellerForm(),
                          company_name: e.currentTarget.value,
                        })
                      }
                      class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs focus:border-[#93509e] focus:outline-hidden"
                      placeholder="Nome do seu negócio"
                    />
                  </div>
                </div>

                <div>
                  <label
                    for="reseller-notes"
                    class="block text-xs font-bold text-[#3D1260]"
                  >
                    Marcas de interesse ou Observações
                  </label>
                  <textarea
                    id="reseller-notes"
                    rows={2}
                    value={resellerForm().notes}
                    onInput={(e) =>
                      setResellerForm({ ...resellerForm(), notes: e.currentTarget.value })
                    }
                    class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs focus:border-[#93509e] focus:outline-hidden"
                    placeholder="Ex: Gostaria de revender esmaltes e géis..."
                  />
                </div>

                <div class="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    class="rounded-lg border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={busy()}
                    class="inline-flex items-center rounded-lg bg-[#93509e] px-5 py-2 text-xs font-bold text-white transition hover:bg-[#7c3f87] disabled:opacity-50"
                  >
                    <Show when={busy()} fallback={<span>Enviar Solicitação</span>}>
                      <span>Enviando...</span>
                    </Show>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Show>
      </div>
    </StoreShell>
  );
}
