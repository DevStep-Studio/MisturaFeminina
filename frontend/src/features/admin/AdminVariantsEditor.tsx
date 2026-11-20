import { For, Show } from "solid-js";
import { Plus, Trash2 } from "lucide-solid";

export interface AdminVariantDraft {
  id?: number;
  name: string;
  shade_code: string;
  color_family: string;
  color_hex: string;
  sku: string;
  price_cents: number;
  promo_price_cents: number | null;
  stock_qty: number;
  sort_order: number;
  is_default: boolean;
  is_active: boolean;
}

export function AdminVariantsEditor(props: {
  variants: AdminVariantDraft[];
  onChange: (next: AdminVariantDraft[]) => void;
}) {
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
      <div class="flex items-center justify-between">
        <div>
          <p class="text-xs font-bold text-zinc-900">
            Grade de Tonalidades / Variantes ({props.variants.length})
          </p>
          <p class="text-[11px] text-zinc-500">
            Configure código da cor, hex da amostra, preço e estoque por cor.
          </p>
        </div>
        <button
          type="button"
          onClick={addShade}
          class="inline-flex h-8 items-center gap-1 rounded-md bg-[#93509e] px-2.5 text-[11px] font-bold text-white hover:bg-[#7c3f87]"
        >
          <Plus class="h-3.5 w-3.5" />
          Adicionar cor
        </button>
      </div>

      <Show when={props.variants.length > 0}>
        <div class="max-h-72 space-y-2 overflow-y-auto pr-1">
          <For each={props.variants}>
            {(v, idx) => (
              <div class="grid gap-1.5 rounded-md border border-zinc-200 bg-white p-2 text-[11px] sm:grid-cols-6">
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
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
