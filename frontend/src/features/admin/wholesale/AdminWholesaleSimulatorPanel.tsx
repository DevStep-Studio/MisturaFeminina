import { For, Show, createSignal, onMount } from "solid-js";
import Calculator from "lucide-solid/icons/calculator";
import CheckCircle2 from "lucide-solid/icons/circle-check";
import Info from "lucide-solid/icons/info";
import Play from "lucide-solid/icons/play";
import Plus from "lucide-solid/icons/plus";
import Trash2 from "lucide-solid/icons/trash";
import { api } from "../../../lib/api";
import { formatCents } from "../../../lib/format";

interface SimulationResultItem {
  item_id: number;
  product_id: number;
  product_variant_id: number | null;
  quantity: number;
  original_unit_price_cents: number;
  wholesale_unit_price_cents: number;
  wholesale_discount_cents: number;
  line_total_cents: number;
  wholesale_rule_id: number | null;
  wholesale_rule_name: string | null;
  wholesale_tier_min_qty: number | null;
  is_wholesale_applied: boolean;
}

interface SimulationScopeSummary {
  full_scope_id: string;
  scope_name: string;
  current_quantity: number;
  is_tier_unlocked: boolean;
  message: string;
}

interface SimulationResponse {
  is_wholesale_active: boolean;
  total_original_cents: number;
  total_wholesale_discount_cents: number;
  total_cents: number;
  items: Record<string, SimulationResultItem>;
  scope_summaries: SimulationScopeSummary[];
  coupon_allowed: boolean;
  stacking_notes: string[];
}

export function AdminWholesaleSimulatorPanel() {
  const [customerGroups, setCustomerGroups] = createSignal<
    Array<{ id: number; name: string }>
  >([]);
  const [selectedGroupId, setSelectedGroupId] = createSignal<number | null>(
    null,
  );
  const [couponCode, setCouponCode] = createSignal("");
  const [simItems, setSimItems] = createSignal<
    Array<{
      product_id: number;
      product_variant_id: number | null;
      quantity: number;
      unit_price_cents: number;
      name: string;
    }>
  >([
    {
      product_id: 1,
      product_variant_id: null,
      quantity: 4,
      unit_price_cents: 890,
      name: "Esmalte Linha Lírio Nude 01",
    },
    {
      product_id: 1,
      product_variant_id: null,
      quantity: 2,
      unit_price_cents: 890,
      name: "Esmalte Linha Lírio Nude 02",
    },
  ]);

  const [busy, setBusy] = createSignal(false);
  const [result, setResult] = createSignal<SimulationResponse | null>(null);

  onMount(async () => {
    try {
      const res = await api.get<{ data: Array<{ id: number; name: string }> }>(
        "/admin/wholesale/customer-groups",
      );
      setCustomerGroups(res.data);
    } catch {
      //
    }
  });

  const addItemRow = () => {
    setSimItems((prev) => [
      ...prev,
      {
        product_id: prev.length + 1,
        product_variant_id: null,
        quantity: 1,
        unit_price_cents: 890,
        name: `Produto Simulado ${prev.length + 1}`,
      },
    ]);
  };

  const removeItemRow = (idx: number) => {
    setSimItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const runSimulation = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ data: SimulationResponse }>(
        "/admin/wholesale/simulate",
        {
          items: simItems().map((it) => ({
            product_id: it.product_id,
            product_variant_id: it.product_variant_id,
            quantity: it.quantity,
            unit_price_cents: it.unit_price_cents,
          })),
          customer_group_id: selectedGroupId(),
          coupon_code: couponCode() || undefined,
        },
      );
      setResult(res.data);
    } catch {
      //
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="space-y-6">
      <div class="flex items-start justify-between border-b border-zinc-200 pb-4">
        <div>
          <h2 class="text-base font-bold text-[#2E0C49]">
            Simulador de Preços & Condições de Atacado
          </h2>
          <p class="text-xs text-zinc-500">
            Teste exatamente como o motor de atacado calculará preços, agregará
            cores e validará regras para qualquer carrinho.
          </p>
        </div>
        <div class="inline-flex items-center gap-1.5 rounded-lg bg-purple-50 px-3 py-1.5 text-xs font-semibold text-[#7C2784]">
          <Info class="size-4 shrink-0" />
          <span>100% em memória, zero efeitos colaterais</span>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Setup Form */}
        <div class="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-xs lg:col-span-5">
          <h3 class="text-xs font-bold uppercase tracking-wider text-[#5B486B]">
            Configuração da Simulação
          </h3>

          <div>
            <label class="block text-xs font-semibold text-zinc-700">
              Tipo de Cliente / Grupo
            </label>
            <select
              value={selectedGroupId() ?? ""}
              onChange={(e) =>
                setSelectedGroupId(
                  e.currentTarget.value
                    ? parseInt(e.currentTarget.value)
                    : null,
                )
              }
              class="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-xs focus:border-[#93509e] focus:outline-none"
            >
              <option value="">Cliente Padrão (Atacado Aberto)</option>
              <For each={customerGroups()}>
                {(g) => <option value={g.id}>{g.name} (Exclusivo)</option>}
              </For>
            </select>
          </div>

          <div>
            <label class="block text-xs font-semibold text-zinc-700">
              Cupom de Desconto Teste (Opcional)
            </label>
            <input
              type="text"
              value={couponCode()}
              onInput={(e) =>
                setCouponCode(e.currentTarget.value.toUpperCase())
              }
              placeholder="Ex: PRIMEIRACOMPRA ou ATACADO10"
              class="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-xs uppercase focus:border-[#93509e] focus:outline-none"
            />
          </div>

          <div class="border-t border-zinc-100 pt-3">
            <div class="flex items-center justify-between mb-2">
              <label class="block text-xs font-bold text-zinc-800">
                Itens no Carrinho
              </label>
              <button
                type="button"
                onClick={addItemRow}
                class="inline-flex items-center gap-1 text-[11px] font-bold text-[#93509e] hover:underline"
              >
                <Plus class="size-3.5" />
                <span>Adicionar Item</span>
              </button>
            </div>

            <div class="space-y-2">
              <For each={simItems()}>
                {(item, idx) => (
                  <div class="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-xs">
                    <div class="flex-1">
                      <span class="block text-[10px] text-zinc-400">
                        ID / Nome
                      </span>
                      <input
                        type="text"
                        value={item.name}
                        onInput={(e) => {
                          const val = e.currentTarget.value;
                          setSimItems((prev) => {
                            const copy = [...prev];
                            copy[idx()]!.name = val;
                            return copy;
                          });
                        }}
                        class="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs"
                      />
                    </div>
                    <div class="w-16">
                      <span class="block text-[10px] text-zinc-400">Qtd</span>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onInput={(e) => {
                          const val = Math.max(
                            1,
                            parseInt(e.currentTarget.value) || 1,
                          );
                          setSimItems((prev) => {
                            const copy = [...prev];
                            copy[idx()]!.quantity = val;
                            return copy;
                          });
                        }}
                        class="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs"
                      />
                    </div>
                    <div class="w-20">
                      <span class="block text-[10px] text-zinc-400">
                        Preço (un)
                      </span>
                      <input
                        type="number"
                        min="1"
                        value={item.unit_price_cents}
                        onInput={(e) => {
                          const val = Math.max(
                            1,
                            parseInt(e.currentTarget.value) || 1,
                          );
                          setSimItems((prev) => {
                            const copy = [...prev];
                            copy[idx()]!.unit_price_cents = val;
                            return copy;
                          });
                        }}
                        class="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItemRow(idx())}
                      disabled={simItems().length <= 1}
                      class="mt-3.5 rounded p-1 text-zinc-400 hover:text-red-600 disabled:opacity-30"
                    >
                      <Trash2 class="size-4" />
                    </button>
                  </div>
                )}
              </For>
            </div>
          </div>

          <button
            type="button"
            disabled={busy()}
            onClick={() => void runSimulation()}
            class="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#93509e] py-2.5 text-xs font-bold text-white transition hover:bg-[#7c3f87] disabled:opacity-50"
          >
            <Play class="size-4" />
            <span>
              {busy() ? "Calculando..." : "Executar Simulação de Preço"}
            </span>
          </button>
        </div>

        {/* Simulation Output */}
        <div class="space-y-4 lg:col-span-7">
          <Show
            when={result()}
            fallback={
              <div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-center text-zinc-400">
                <Calculator class="size-10 text-zinc-300" />
                <p class="mt-2 text-xs font-semibold">
                  Configure os itens e clique em 'Executar Simulação'.
                </p>
              </div>
            }
          >
            <div class="space-y-4">
              {/* Totals Banner */}
              <div class="grid grid-cols-3 gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-xs">
                <div>
                  <span class="text-[11px] font-semibold text-zinc-500">
                    Subtotal Original
                  </span>
                  <p class="text-base font-bold text-zinc-700">
                    {formatCents(result()!.total_original_cents)}
                  </p>
                </div>
                <div>
                  <span class="text-[11px] font-semibold text-emerald-700">
                    Desconto Atacado
                  </span>
                  <p class="text-base font-black text-emerald-700">
                    -{formatCents(result()!.total_wholesale_discount_cents)}
                  </p>
                </div>
                <div>
                  <span class="text-[11px] font-semibold text-[#2E0C49]">
                    Total Final
                  </span>
                  <p class="text-lg font-black text-[#93509e]">
                    {formatCents(result()!.total_cents)}
                  </p>
                </div>
              </div>

              {/* Dynamic Scope Summaries */}
              <Show when={result()!.scope_summaries.length > 0}>
                <div class="rounded-xl border border-purple-200 bg-[#FCF8FD] p-4 space-y-2">
                  <h4 class="text-xs font-bold text-[#66166E]">
                    Agrupamentos & Faixas Atingidas
                  </h4>
                  <For each={result()!.scope_summaries}>
                    {(summary) => (
                      <div class="flex items-center gap-2 text-xs text-[#2E0C49]">
                        <CheckCircle2 class="size-4 text-emerald-600 shrink-0" />
                        <span>{summary.message}</span>
                      </div>
                    )}
                  </For>
                </div>
              </Show>

              {/* Stacking policy note */}
              <Show when={result()!.stacking_notes.length > 0}>
                <div class="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <For each={result()!.stacking_notes}>
                    {(note) => <p>• {note}</p>}
                  </For>
                </div>
              </Show>

              {/* Line items result */}
              <div class="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs">
                <table class="w-full text-left text-xs">
                  <thead class="border-b border-zinc-200 bg-zinc-50 font-bold text-[#5B486B]">
                    <tr>
                      <th class="p-3">Item</th>
                      <th class="p-3">Qtd</th>
                      <th class="p-3">Preço Original</th>
                      <th class="p-3">Preço Atacado</th>
                      <th class="p-3">Desconto Unit.</th>
                      <th class="p-3">Total Linha</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-zinc-100">
                    <For each={Object.values(result()!.items)}>
                      {(line) => (
                        <tr class="hover:bg-zinc-50/80">
                          <td class="p-3 font-semibold text-[#2E0C49]">
                            Produto #{line.product_id}
                            <Show when={line.wholesale_rule_name}>
                              <span class="block text-[10px] text-[#93509e]">
                                Regra: {line.wholesale_rule_name} (
                                {line.wholesale_tier_min_qty}+ un.)
                              </span>
                            </Show>
                          </td>
                          <td class="p-3">{line.quantity}</td>
                          <td class="p-3 text-zinc-500">
                            {formatCents(line.original_unit_price_cents)}
                          </td>
                          <td class="p-3 font-bold text-emerald-700">
                            {formatCents(line.wholesale_unit_price_cents)}
                          </td>
                          <td class="p-3 text-emerald-600">
                            -{formatCents(line.wholesale_discount_cents)}
                          </td>
                          <td class="p-3 font-bold text-zinc-900">
                            {formatCents(line.line_total_cents)}
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
