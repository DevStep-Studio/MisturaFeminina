import { For, Show, createSignal } from "solid-js";
import Plus from "lucide-solid/icons/plus";
import Trash2 from "lucide-solid/icons/trash";
import {
  calculateUnitMarginPreview,
  formatBrlSigned,
  formatMarginPercentage,
  formatNullableCostInput,
  parseBrlNullableCost,
} from "./profit-math";

export interface AdminVariantDraft {
  id?: number;
  name: string;
  shade_code: string;
  color_family: string;
  color_hex: string;
  sku: string;
  price_cents: number;
  promo_price_cents: number | null;
  cost_cents: number | null;
  stock_qty: number;
  sort_order: number;
  is_default: boolean;
  is_active: boolean;
}

export function AdminVariantsEditor(props: {
  variants: AdminVariantDraft[];
  onChange: (next: AdminVariantDraft[]) => void;
  canCostView?: boolean;
  canCostWrite?: boolean;
  parentCostCents?: number | null;
}) {
  const canViewCost = () => props.canCostView ?? true;
  const canWriteCost = () => props.canCostWrite ?? true;
  const [applyPreviewOpen, setApplyPreviewOpen] = createSignal(false);

  function addShade() {
    const idx = props.variants.length + 1;
    props.onChange([
      ...props.variants,
      {
        name: `Tonalidade ${idx}`,
        shade_code: String(idx).padStart(3, "0"),
        color_family: "",
        color_hex: "#93509e",
        sku: "",
        price_cents: props.variants[0]?.price_cents ?? 1990,
        promo_price_cents: null,
        cost_cents: null,
        stock_qty: 10,
        sort_order: idx,
        is_default: props.variants.length === 0,
        is_active: true,
      },
    ]);
  }

  function updateField<K extends keyof AdminVariantDraft>(
    index: number,
    key: K,
    value: AdminVariantDraft[K],
  ) {
    const next = props.variants.map((item, idx) =>
      idx === index ? { ...item, [key]: value } : item,
    );
    props.onChange(next);
  }

  function removeShade(index: number) {
    const next = props.variants.filter((_, idx) => idx !== index);
    props.onChange(next);
  }

  return (
    <div class="space-y-2.5 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p class="text-xs font-bold text-zinc-900">
            Grade de Tonalidades / Variantes ({props.variants.length})
          </p>
          <p class="text-[11px] text-zinc-500">
            Configure código da cor, hex da amostra, preço, custo por SKU e estoque por cor.
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          <Show
            when={
              canWriteCost() &&
              props.variants.length > 1 &&
              props.parentCostCents !== undefined
            }
          >
            <button
              type="button"
              onClick={() => setApplyPreviewOpen((prev) => !prev)}
              class="inline-flex h-8 items-center rounded-md border border-[#93509e] bg-white px-2.5 text-[11px] font-semibold text-[#93509e] hover:bg-purple-50"
            >
              Aplicar custo a todas as variações
            </button>
          </Show>
          <button
            type="button"
            onClick={addShade}
            class="inline-flex h-8 items-center gap-1 rounded-md bg-[#93509e] px-2.5 text-[11px] font-bold text-white hover:bg-[#7c3f87]"
          >
            <Plus class="h-3.5 w-3.5" />
            Adicionar cor
          </button>
        </div>
      </div>

      <Show when={applyPreviewOpen() && canWriteCost()}>
        <div class="space-y-2 rounded-md border border-purple-200 bg-white p-3 text-[11px]">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="font-bold text-zinc-900">
              Prévia: aplicar custo base (
              {props.parentCostCents !== null &&
              props.parentCostCents !== undefined
                ? formatBrlSigned(props.parentCostCents)
                : "Não informado"}
              ) em {props.variants.length} variações
            </p>
            <div class="flex gap-1.5">
              <button
                type="button"
                onClick={() => setApplyPreviewOpen(false)}
                class="rounded border border-zinc-300 px-2 py-1 font-semibold text-zinc-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = props.parentCostCents ?? null;
                  props.onChange(
                    props.variants.map((item) => ({ ...item, cost_cents: target })),
                  );
                  setApplyPreviewOpen(false);
                }}
                class="rounded bg-[#93509e] px-2.5 py-1 font-bold text-white hover:bg-[#7c3f87]"
              >
                Confirmar aplicação
              </button>
            </div>
          </div>
          <ul class="max-h-32 space-y-1 overflow-y-auto text-zinc-700">
            <For each={props.variants}>
              {(item) => (
                <li class="flex items-center justify-between border-b border-zinc-100 pb-0.5">
                  <span class="truncate pr-2">
                    <span class="font-mono font-semibold">{item.sku || "SEM-SKU"}</span>{" "}
                    · {item.name}
                  </span>
                  <span class="shrink-0 tabular-nums">
                    {item.cost_cents !== null && item.cost_cents !== undefined
                      ? formatBrlSigned(item.cost_cents)
                      : "Herdado/Não informado"}{" "}
                    →{" "}
                    <strong class="text-[#93509e]">
                      {props.parentCostCents !== null &&
                      props.parentCostCents !== undefined
                        ? formatBrlSigned(props.parentCostCents)
                        : "Não informado"}
                    </strong>
                  </span>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>

      <Show when={props.variants.length > 0}>
        <div class="max-h-80 space-y-2 overflow-y-auto pr-1">
          <For each={props.variants}>
            {(v, idx) => {
              const effCost = () =>
                v.cost_cents !== null && v.cost_cents !== undefined
                  ? v.cost_cents
                  : (props.parentCostCents ?? null);
              const est = () =>
                calculateUnitMarginPreview({
                  regularPriceCents: v.price_cents,
                  promoPriceCents: v.promo_price_cents,
                  costCents: effCost(),
                });

              return (
                <div class="space-y-1.5 rounded-md border border-zinc-200 bg-white p-2 text-[11px]">
                  <div class="grid gap-1.5 sm:grid-cols-6">
                    <input
                      type="text"
                      placeholder="Nome da cor *"
                      value={v.name}
                      onInput={(e) =>
                        updateField(idx(), "name", e.currentTarget.value)
                      }
                      class="h-8 rounded border border-zinc-300 px-2 sm:col-span-2"
                    />
                    <input
                      type="text"
                      placeholder="Cód. (ex. 012)"
                      value={v.shade_code}
                      onInput={(e) =>
                        updateField(idx(), "shade_code", e.currentTarget.value)
                      }
                      class="h-8 rounded border border-zinc-300 px-2"
                    />
                    <input
                      type="text"
                      placeholder="Família (Rosa)"
                      value={v.color_family}
                      onInput={(e) =>
                        updateField(idx(), "color_family", e.currentTarget.value)
                      }
                      class="h-8 rounded border border-zinc-300 px-2"
                    />
                    <div class="flex items-center gap-1">
                      <input
                        type="color"
                        value={v.color_hex || "#93509e"}
                        onInput={(e) =>
                          updateField(idx(), "color_hex", e.currentTarget.value)
                        }
                        class="h-8 w-8 cursor-pointer rounded border border-zinc-300"
                        title="Cor visual da tonalidade"
                      />
                      <input
                        type="text"
                        placeholder="SKU"
                        value={v.sku}
                        onInput={(e) =>
                          updateField(idx(), "sku", e.currentTarget.value)
                        }
                        class="h-8 min-w-0 flex-1 rounded border border-zinc-300 px-2"
                      />
                    </div>
                    <div class="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        placeholder="Est."
                        title="Estoque"
                        value={v.stock_qty}
                        onInput={(e) =>
                          updateField(
                            idx(),
                            "stock_qty",
                            Number(e.currentTarget.value || 0),
                          )
                        }
                        class="h-8 w-14 rounded border border-zinc-300 px-1.5 text-center"
                      />
                      <input
                        type="number"
                        min={100}
                        placeholder="Centavos"
                        title="Preço em centavos"
                        value={v.price_cents}
                        onInput={(e) =>
                          updateField(
                            idx(),
                            "price_cents",
                            Number(e.currentTarget.value || 0),
                          )
                        }
                        class="h-8 min-w-0 flex-1 rounded border border-zinc-300 px-1.5"
                      />
                      <button
                        type="button"
                        onClick={() => removeShade(idx())}
                        aria-label="Remover variante"
                        class="rounded p-1 text-zinc-400 hover:text-red-600"
                      >
                        <Trash2 class="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <Show when={canViewCost()}>
                    <div class="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-1.5 text-[11px]">
                      <div class="flex items-center gap-2">
                        <label class="font-semibold text-zinc-600">
                          Custo SKU (R$):
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          disabled={!canWriteCost()}
                          value={formatNullableCostInput(v.cost_cents)}
                          placeholder="Herdar produto"
                          onBlur={(e) => {
                            const parsed = parseBrlNullableCost(
                              e.currentTarget.value,
                            );
                            if (parsed.valid) {
                              updateField(idx(), "cost_cents", parsed.cents);
                            }
                          }}
                          class="h-7 w-28 rounded border border-zinc-300 px-2 text-right tabular-nums focus:border-[#93509e] focus:outline-none disabled:bg-zinc-100"
                        />
                      </div>
                      <Show
                        when={est().profitCents !== null}
                        fallback={
                          <span class="text-zinc-500">Custo não informado</span>
                        }
                      >
                        <span
                          class={`tabular-nums font-semibold ${
                            est().isLoss ? "text-red-700" : "text-zinc-700"
                          }`}
                        >
                          Lucro est.: {formatBrlSigned(est().profitCents!)} ·{" "}
                          {formatMarginPercentage(est().marginPct, {
                            compactWhole: true,
                          })}
                        </span>
                      </Show>
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}
