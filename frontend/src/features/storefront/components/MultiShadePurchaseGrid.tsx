import { For, Show, createMemo, createSignal } from "solid-js";
import BellRing from "lucide-solid/icons/bell-ring";
import Check from "lucide-solid/icons/check";
import Minus from "lucide-solid/icons/minus";
import Plus from "lucide-solid/icons/plus";
import Search from "lucide-solid/icons/search";
import ShoppingCart from "lucide-solid/icons/shopping-cart";
import { formatCents } from "@/lib/format";
import { computeWholesaleUnitPrice, type WholesaleTier } from "../wholesale";
import type { ProductVariantData } from "../types";

export { computeWholesaleUnitPrice, type WholesaleTier };

export interface MultiShadePurchaseGridProps {
  variants: ProductVariantData[];
  fallbackImage: string;
  wholesaleEnabled: boolean;
  wholesaleGroupVariants: boolean;
  wholesaleTiers: WholesaleTier[];
  busy?: boolean;
  onAddBulk: (
    items: Array<{ variant_id: number; quantity: number }>,
  ) => Promise<void> | void;
  onSelectRestock: (variant: ProductVariantData) => void;
  onHoverImage?: (url: string) => void;
}

export function MultiShadePurchaseGrid(props: MultiShadePurchaseGridProps) {
  const [quantities, setQuantities] = createSignal<Record<number, number>>({});
  const [searchTerm, setSearchTerm] = createSignal("");
  const [familyFilter, setFamilyFilter] = createSignal<string>("all");
  const [stockFilter, setStockFilter] = createSignal<"all" | "in_stock">("all");
  const [feedback, setFeedback] = createSignal<string | null>(null);

  const isColorProduct = createMemo(() =>
    props.variants.some(
      (v) => Boolean(v.color_hex || v.shade_code || v.color_family),
    ),
  );

  const colorFamilies = createMemo(() => {
    const set = new Set<string>();
    for (const v of props.variants) {
      if (v.color_family && v.color_family.trim() !== "") {
        set.add(v.color_family.trim());
      }
    }
    return Array.from(set);
  });

  const filteredVariants = createMemo(() => {
    const q = searchTerm().trim().toLowerCase();
    const fam = familyFilter();
    const onlyInStock = stockFilter() === "in_stock";

    return props.variants.filter((v) => {
      if (onlyInStock && !v.in_stock) return false;
      if (fam !== "all" && (v.color_family || "").trim() !== fam) return false;
      if (q !== "") {
        const hay =
          `${v.name} ${v.shade_code ?? ""} ${v.sku} ${v.color_family ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  });

  const selectedEntries = createMemo(() => {
    const map = quantities();
    const list: Array<{ variant: ProductVariantData; quantity: number }> = [];
    for (const v of props.variants) {
      const qty = map[v.id] ?? 0;
      if (qty > 0 && v.in_stock) {
        list.push({ variant: v, quantity: qty });
      }
    }
    return list;
  });

  const totalUnits = createMemo(() =>
    selectedEntries().reduce((sum, entry) => sum + entry.quantity, 0),
  );

  const selectedShadesCount = createMemo(() => selectedEntries().length);

  const nextWholesaleHint = createMemo(() => {
    if (!props.wholesaleEnabled || !props.wholesaleGroupVariants) return null;
    const sorted = [...props.wholesaleTiers].sort(
      (a, b) =>
        (a.min_qty ?? a.min_quantity ?? 0) - (b.min_qty ?? b.min_quantity ?? 0),
    );
    const units = totalUnits();
    for (const t of sorted) {
      const minQ = t.min_qty ?? t.min_quantity ?? 0;
      if (units < minQ) {
        return {
          remaining: minQ - units,
          min_qty: minQ,
          discount_percent:
            t.discount_percent ??
            (t.discount_type === "percent" ? t.discount_value : 0),
          target_price_formatted:
            (t as any).unit_price_formatted ??
            (t.discount_type === "fixed_price" && t.discount_value
              ? `R$ ${Number(t.discount_value).toFixed(2).replace(".", ",")}`
              : null),
        };
      }
    }
    return null;
  });

  const estimatedTotalCents = createMemo(() => {
    const units = totalUnits();
    const tiers = props.wholesaleTiers;
    const wholesaleOn = props.wholesaleEnabled;
    const grouped = props.wholesaleGroupVariants;
    const useGroupedWholesale = wholesaleOn && grouped && tiers.length > 0;
    return selectedEntries().reduce((sum, entry) => {
      const qtyForTier = useGroupedWholesale ? units : entry.quantity;
      const pricing =
        wholesaleOn && tiers.length > 0
          ? computeWholesaleUnitPrice(
              entry.variant.effective_price_cents,
              qtyForTier,
              tiers,
            )
          : {
              unitPriceCents: entry.variant.effective_price_cents,
              appliedDiscountPercent: 0,
            };
      return sum + pricing.unitPriceCents * entry.quantity;
    }, 0);
  });

  const retailTotalCents = createMemo(() =>
    selectedEntries().reduce(
      (sum, entry) =>
        sum + entry.variant.effective_price_cents * entry.quantity,
      0,
    ),
  );

  function setVariantQty(variant: ProductVariantData, nextQty: number) {
    const capped = Math.max(0, Math.min(variant.available_stock, nextQty));
    setQuantities((prev) => ({
      ...prev,
      [variant.id]: capped,
    }));
    setFeedback(null);
  }

  function clearSelection() {
    setQuantities({});
    setFeedback(null);
  }

  async function handleBulkAdd() {
    const entries = selectedEntries();
    if (entries.length === 0) return;
    await props.onAddBulk(
      entries.map((e) => ({
        variant_id: e.variant.id,
        quantity: e.quantity,
      })),
    );
    setQuantities({});
    setFeedback(
      `${entries.length} ${
        entries.length === 1
          ? isColorProduct()
            ? "cor adicionada"
            : "opção adicionada"
          : isColorProduct()
            ? "cores adicionadas"
            : "opções adicionadas"
      } (${totalUnits()} un.) ao carrinho!`,
    );
  }

  return (
    <section
      id="multi-shade-grid"
      aria-label="Compra de várias opções em uma tela"
      class="rounded-2xl border border-[#E5CFE8] bg-[#FCF8FD] p-4 sm:p-5"
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-base font-extrabold text-[#2E0C49]">
            {isColorProduct()
              ? `Escolha suas cores (${props.variants.length} tonalidades)`
              : `Comprar várias opções (${props.variants.length} opções disponíveis)`}
          </h2>
          <p class="mt-0.5 text-xs text-[#5B486B]">
            {isColorProduct()
              ? "Defina a quantidade por cor abaixo para adicionar todas ao carrinho de uma só vez."
              : "Defina a quantidade de cada opção abaixo para adicionar todas ao carrinho de uma só vez."}
          </p>
        </div>

        <Show when={totalUnits() > 0}>
          <button
            type="button"
            onClick={clearSelection}
            class="text-xs font-semibold text-zinc-500 underline hover:text-[#93509e]"
          >
            Zerar seleção
          </button>
        </Show>
      </div>

      <Show
        when={
          props.wholesaleEnabled &&
          props.wholesaleGroupVariants &&
          props.wholesaleTiers.length > 0
        }
      >
        <div class="mt-3 rounded-xl border border-[#DFC2E3] bg-white px-3 py-2 text-xs text-[#3D1260]">
          <Show
            when={nextWholesaleHint()}
            fallback={
              <span class="font-bold text-emerald-700">
                Desconto progressivo de atacado ativo somando suas cores
                selecionadas!
              </span>
            }
          >
            {(hint) => (
              <span>
                Adicione mais{" "}
                <strong class="text-[#93509e]">
                  {hint().remaining}{" "}
                  {hint().remaining === 1 ? "unidade" : "unidades"}
                </strong>{" "}
                entre cores variadas para liberar{" "}
                <strong class="text-[#93509e]">
                  {hint().target_price_formatted
                    ? `${hint().target_price_formatted} cada`
                    : `${hint().discount_percent}% OFF`}
                </strong>{" "}
                no atacado.
              </span>
            )}
          </Show>
        </div>
      </Show>

      {/* Barra de busca e filtros para produtos com muitas opções */}
      <Show when={props.variants.length > 6}>
        <div class="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div class="relative flex-1">
            <Search
              class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchTerm()}
              onInput={(e) => setSearchTerm(e.currentTarget.value)}
              placeholder="Buscar por nome, número ou SKU..."
              aria-label="Buscar opção por nome, código ou SKU"
              class="h-9 w-full rounded-lg border border-[#DFC2E3] bg-white pl-8 pr-3 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-[#93509e] focus:outline-none"
            />
          </div>

          <div class="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                setStockFilter(stockFilter() === "all" ? "in_stock" : "all")
              }
              class={`h-8 rounded-lg border px-2.5 text-[11px] font-bold transition-colors ${
                stockFilter() === "in_stock"
                  ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-[#93509e]"
              }`}
            >
              Disponíveis
            </button>

            <Show when={colorFamilies().length > 0}>
              <button
                type="button"
                onClick={() => setFamilyFilter("all")}
                class={`h-8 rounded-lg border px-2.5 text-[11px] font-bold transition-colors ${
                  familyFilter() === "all"
                    ? "border-[#93509e] bg-[#93509e] text-white"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-[#93509e]"
                }`}
              >
                Todas
              </button>
              <For each={colorFamilies()}>
                {(family) => (
                  <button
                    type="button"
                    onClick={() =>
                      setFamilyFilter(familyFilter() === family ? "all" : family)
                    }
                    class={`h-8 rounded-lg border px-2.5 text-[11px] font-bold transition-colors ${
                      familyFilter() === family
                        ? "border-[#93509e] bg-[#93509e] text-white"
                        : "border-zinc-200 bg-white text-zinc-600 hover:border-[#93509e]"
                    }`}
                  >
                    {family}
                  </button>
                )}
              </For>
            </Show>
          </div>
        </div>
      </Show>

      {/* Grade arejada e espaçosa (1 coluna com folga total para texto e controles) */}
      <div class="mt-3.5 space-y-2.5">
        <For each={filteredVariants()}>
          {(variant) => {
            const qty = () => quantities()[variant.id] ?? 0;
            const lowStock = () =>
              variant.in_stock && variant.available_stock <= 5;
            const thumb = () =>
              variant.swatch_image_path ||
              variant.image_path ||
              props.fallbackImage;

            return (
              <div
                onMouseEnter={() => {
                  if (variant.image_path && props.onHoverImage) {
                    props.onHoverImage(variant.image_path);
                  }
                }}
                class={`flex items-center justify-between gap-3 rounded-xl border p-3 sm:p-3.5 transition-all ${
                  !variant.in_stock
                    ? "border-zinc-200 bg-zinc-50/90 opacity-80"
                    : qty() > 0
                      ? "border-[#93509e] bg-[#FAF5FB] ring-1 ring-[#93509e]/30 shadow-xs"
                      : "border-[#E5DAE9] bg-white hover:border-[#93509e]/60 hover:shadow-2xs"
                }`}
              >
                <div class="flex min-w-0 flex-1 items-center gap-3">
                  {/* Miniatura do produto / variação */}
                  <div class="relative size-12 sm:size-14 shrink-0 overflow-hidden rounded-lg border border-zinc-200/80 bg-white p-0.5 shadow-2xs">
                    <Show
                      when={variant.color_hex}
                      fallback={
                        <img
                          src={thumb()}
                          alt={variant.name}
                          class="h-full w-full object-contain"
                          loading="lazy"
                        />
                      }
                    >
                      <div class="flex h-full w-full flex-col">
                        <span
                          class="flex-1 w-full rounded-xs"
                          style={{ "background-color": variant.color_hex! }}
                        />
                        <Show when={variant.shade_code}>
                          <span class="bg-white/95 py-0.5 text-center text-[9px] font-extrabold leading-none text-zinc-800">
                            {variant.shade_code}
                          </span>
                        </Show>
                      </div>
                    </Show>
                  </div>

                  {/* Textos com folga e sem quebras estranhas */}
                  <div class="min-w-0 flex-1 pl-1">
                    <p class="truncate text-xs sm:text-sm font-bold text-[#2E0C49]">
                      {variant.name}
                    </p>

                    <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span class="text-xs sm:text-sm font-extrabold text-[#93509e]">
                        {formatCents(variant.effective_price_cents)}
                      </span>
                      <span aria-hidden="true" class="text-zinc-300">•</span>
                      <span
                        class={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] sm:text-[11px] font-semibold ${
                          !variant.in_stock
                            ? "bg-red-50 text-red-600"
                            : lowStock()
                              ? "bg-amber-50 text-amber-700"
                              : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        <span
                          class={`size-1.5 rounded-full ${
                            !variant.in_stock
                              ? "bg-red-500"
                              : lowStock()
                                ? "bg-amber-500"
                                : "bg-emerald-500"
                          }`}
                        />
                        {!variant.in_stock
                          ? "Esgotada"
                          : lowStock()
                            ? `Restam ${variant.available_stock} un.`
                            : `${variant.available_stock} un. disponíveis`}
                      </span>
                    </div>

                    <Show when={variant.sku}>
                      <p class="mt-0.5 truncate text-[10px] font-mono text-zinc-400">
                        SKU: {variant.sku}
                      </p>
                    </Show>
                  </div>
                </div>

                {/* Seletor de quantidade com botões espaçosos */}
                <div class="shrink-0 pl-1">
                  <Show
                    when={variant.in_stock}
                    fallback={
                      <button
                        type="button"
                        onClick={() => props.onSelectRestock(variant)}
                        class="inline-flex h-9 items-center gap-1 rounded-lg border border-[#93509e] bg-white px-2.5 text-[11px] font-bold text-[#93509e] transition-colors hover:bg-[#93509e] hover:text-white"
                      >
                        <BellRing class="h-3 w-3" />
                        Avise-me
                      </button>
                    }
                  >
                    <div
                      class={`inline-flex h-9 items-center rounded-lg border bg-white shadow-2xs transition-colors ${
                        qty() > 0
                          ? "border-[#93509e]/60 ring-1 ring-[#93509e]/20"
                          : "border-zinc-200"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setVariantQty(variant, qty() - 1)}
                        disabled={qty() <= 0}
                        aria-label={`Diminuir quantidade de ${variant.name}`}
                        class="flex h-full w-8 items-center justify-center text-zinc-600 hover:bg-[#FAF5FB] hover:text-[#93509e] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                      >
                        <Minus class="h-3.5 w-3.5" />
                      </button>
                      <input
                        type="number"
                        min={0}
                        max={variant.available_stock}
                        value={qty()}
                        onInput={(e) => {
                          const val = Number.parseInt(
                            e.currentTarget.value || "0",
                            10,
                          );
                          setVariantQty(variant, Number.isNaN(val) ? 0 : val);
                        }}
                        aria-label={`Quantidade de ${variant.name}`}
                        class="h-full w-10 border-x border-zinc-100 bg-zinc-50/50 text-center text-xs font-bold text-[#2E0C49] focus:bg-white focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setVariantQty(variant, qty() + 1)}
                        disabled={qty() >= variant.available_stock}
                        aria-label={`Aumentar quantidade de ${variant.name}`}
                        class="flex h-full w-8 items-center justify-center text-zinc-600 hover:bg-[#FAF5FB] hover:text-[#93509e] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                      >
                        <Plus class="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </Show>
                </div>
              </div>
            );
          }}
        </For>
      </div>

      <Show when={filteredVariants().length === 0}>
        <p class="py-6 text-center text-xs text-zinc-500">
          Nenhuma opção encontrada para este filtro.
        </p>
      </Show>

      {/* Resumo e Botão de Ação em Lote */}
      <div class="mt-4 flex flex-col gap-3 rounded-xl border border-[#DFC2E3] bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="text-xs font-bold text-[#2E0C49]">
            {selectedShadesCount()}{" "}
            {selectedShadesCount() === 1
              ? isColorProduct()
                ? "cor selecionada"
                : "opção selecionada"
              : isColorProduct()
                ? "cores selecionadas"
                : "opções selecionadas"}{" "}
            • {totalUnits()}{" "}
            {totalUnits() === 1 ? "unidade" : "unidades"}
          </p>
          <p class="mt-0.5 text-sm font-extrabold text-[#93509e]">
            Subtotal: {formatCents(estimatedTotalCents())}
            <Show when={estimatedTotalCents() < retailTotalCents()}>
              <span class="ml-2 text-xs font-semibold text-emerald-700">
                (Economia atacado de{" "}
                {formatCents(retailTotalCents() - estimatedTotalCents())})
              </span>
            </Show>
          </p>
        </div>

        <button
          type="button"
          disabled={totalUnits() === 0 || props.busy}
          onClick={() => void handleBulkAdd()}
          class="inline-flex h-11 w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-[#93509e] px-5 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition-colors hover:bg-[#7c3f87] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ShoppingCart class="h-4 w-4" />
          <span>
            {props.busy
              ? "Adicionando..."
              : isColorProduct()
                ? "Adicionar cores selecionadas"
                : "Adicionar opções selecionadas"}
          </span>
        </button>
      </div>

      <Show when={feedback()}>
        <p class="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
          <Check class="h-4 w-4" />
          {feedback()}
        </p>
      </Show>
    </section>
  );
}
