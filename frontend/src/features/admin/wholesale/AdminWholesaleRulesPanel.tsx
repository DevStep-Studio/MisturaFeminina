import { For, Show, createSignal, onMount } from "solid-js";
import AlertCircle from "lucide-solid/icons/circle-exclamation-point";
import Edit from "lucide-solid/icons/square-pen";
import Pause from "lucide-solid/icons/pause";
import Play from "lucide-solid/icons/play";
import Plus from "lucide-solid/icons/plus";
import Trash2 from "lucide-solid/icons/trash";
import X from "lucide-solid/icons/x";
import { api } from "../../../lib/api";

export interface WholesaleRuleTierItem {
  id?: number;
  min_quantity: number;
  max_quantity?: number | null;
  discount_type: "fixed_price" | "percent" | "fixed_discount";
  discount_value: number;
}

export interface WholesaleRuleItem {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  status: "draft" | "scheduled" | "active" | "paused" | "ended";
  access_mode: "open" | "exclusive" | "mixed";
  quantity_scope:
    | "sku"
    | "product"
    | "commercial_line"
    | "wholesale_group"
    | "category"
    | "order";
  discount_policy: "tier_pricing" | "fixed_discount" | "percentage_discount";
  stacking_policy:
    "no_stacking" | "allow_coupons" | "allow_promotions" | "best_discount_only";
  min_quantity: number;
  priority: number;
  starts_at: string | null;
  ends_at: string | null;
  tiers: WholesaleRuleTierItem[];
}

interface RuleFormState {
  name: string;
  slug: string;
  description: string;
  status: WholesaleRuleItem["status"];
  access_mode: WholesaleRuleItem["access_mode"];
  quantity_scope: WholesaleRuleItem["quantity_scope"];
  discount_policy: WholesaleRuleItem["discount_policy"];
  stacking_policy: WholesaleRuleItem["stacking_policy"];
  min_quantity: number;
  priority: number;
  tiers: Array<{
    min_quantity: number;
    max_quantity: number | null;
    discount_type: WholesaleRuleTierItem["discount_type"];
    discount_value: number;
  }>;
}

export function AdminWholesaleRulesPanel() {
  const [rules, setRules] = createSignal<WholesaleRuleItem[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editingRule, setEditingRule] = createSignal<WholesaleRuleItem | null>(
    null,
  );
  const [busy, setBusy] = createSignal(false);
  const [feedback, setFeedback] = createSignal<string | null>(null);

  // Form state
  const [form, setForm] = createSignal<RuleFormState>({
    name: "",
    slug: "",
    description: "",
    status: "active",
    access_mode: "open",
    quantity_scope: "commercial_line",
    discount_policy: "tier_pricing",
    stacking_policy: "no_stacking",
    min_quantity: 6,
    priority: 0,
    tiers: [
      {
        min_quantity: 6,
        max_quantity: 11,
        discount_type: "fixed_price",
        discount_value: 6.9,
      },
      {
        min_quantity: 12,
        max_quantity: 23,
        discount_type: "fixed_price",
        discount_value: 5.9,
      },
      {
        min_quantity: 24,
        max_quantity: null,
        discount_type: "fixed_price",
        discount_value: 4.9,
      },
    ],
  });

  const loadRules = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: WholesaleRuleItem[] }>(
        "/admin/wholesale/rules",
      );
      setRules(res.data);
    } catch {
      //
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    void loadRules();
  });

  const openCreateModal = () => {
    setEditingRule(null);
    setForm({
      name: "",
      slug: "",
      description: "",
      status: "active",
      access_mode: "open",
      quantity_scope: "commercial_line",
      discount_policy: "tier_pricing",
      stacking_policy: "no_stacking",
      min_quantity: 6,
      priority: 0,
      tiers: [
        {
          min_quantity: 6,
          max_quantity: 11,
          discount_type: "fixed_price",
          discount_value: 6.9,
        },
        {
          min_quantity: 12,
          max_quantity: 23,
          discount_type: "fixed_price",
          discount_value: 5.9,
        },
        {
          min_quantity: 24,
          max_quantity: null,
          discount_type: "fixed_price",
          discount_value: 4.9,
        },
      ],
    });
    setModalOpen(true);
    setFeedback(null);
  };

  const openEditModal = (rule: WholesaleRuleItem) => {
    setEditingRule(rule);
    setForm({
      name: rule.name,
      slug: rule.slug,
      description: rule.description ?? "",
      status: rule.status,
      access_mode: rule.access_mode,
      quantity_scope: rule.quantity_scope,
      discount_policy: rule.discount_policy,
      stacking_policy: rule.stacking_policy,
      min_quantity: rule.min_quantity,
      priority: rule.priority,
      tiers: rule.tiers.map((t) => ({
        min_quantity: t.min_quantity,
        max_quantity: t.max_quantity ?? null,
        discount_type: t.discount_type,
        discount_value: t.discount_value,
      })),
    });
    setModalOpen(true);
    setFeedback(null);
  };

  const handleSave = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);

    try {
      if (editingRule()) {
        await api.put(`/admin/wholesale/rules/${editingRule()!.id}`, form());
      } else {
        await api.post("/admin/wholesale/rules", form());
      }
      setModalOpen(false);
      void loadRules();
    } catch {
      setFeedback("Erro ao salvar regra. Verifique os campos.");
    } finally {
      setBusy(false);
    }
  };

  const handleToggleStatus = async (rule: WholesaleRuleItem) => {
    const nextStatus = rule.status === "active" ? "paused" : "active";
    try {
      await api.patch(`/admin/wholesale/rules/${rule.id}/status`, {
        status: nextStatus,
      });
      void loadRules();
    } catch {
      //
    }
  };

  const handleDelete = async (ruleId: number) => {
    if (!confirm("Deseja realmente excluir esta regra comercial?")) return;
    try {
      await api.delete(`/admin/wholesale/rules/${ruleId}`);
      void loadRules();
    } catch {
      //
    }
  };

  const addTierRow = () => {
    setForm((f) => ({
      ...f,
      tiers: [
        ...f.tiers,
        {
          min_quantity: (f.tiers[f.tiers.length - 1]?.min_quantity ?? 0) + 6,
          max_quantity: null,
          discount_type: "fixed_price",
          discount_value: 5.0,
        },
      ],
    }));
  };

  const removeTierRow = (index: number) => {
    setForm((f) => ({
      ...f,
      tiers: f.tiers.filter((_, i) => i !== index),
    }));
  };

  return (
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-base font-bold text-[#2E0C49]">
            Regras Comerciais & Condições de Atacado
          </h2>
          <p class="text-xs text-zinc-500">
            Configure faixas de quantidade, escopo de agrupamento de cores e
            políticas de acúmulo.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          class="inline-flex items-center gap-1.5 rounded-lg bg-[#93509e] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#7c3f87]"
        >
          <Plus class="size-4" />
          <span>Nova Regra</span>
        </button>
      </div>

      {/* Rules Table */}
      <div class="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs">
        <table class="w-full text-left text-xs">
          <thead class="border-b border-zinc-200 bg-zinc-50 font-bold text-[#5B486B]">
            <tr>
              <th class="p-3.5">Nome da Regra</th>
              <th class="p-3.5">Escopo de Agrupamento</th>
              <th class="p-3.5">Acesso</th>
              <th class="p-3.5">Faixas de Preço</th>
              <th class="p-3.5">Acúmulo</th>
              <th class="p-3.5">Status</th>
              <th class="p-3.5 text-right">Ações</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-100">
            <Show
              when={rules().length > 0}
              fallback={
                <tr>
                  <td colspan={7} class="p-8 text-center text-zinc-500">
                    {loading()
                      ? "Carregando regras..."
                      : "Nenhuma regra cadastrada. Clique em 'Nova Regra' para começar."}
                  </td>
                </tr>
              }
            >
              <For each={rules()}>
                {(rule) => (
                  <tr class="hover:bg-zinc-50/80">
                    <td class="p-3.5 font-bold text-[#2E0C49]">
                      {rule.name}
                      <span class="block text-[11px] font-normal text-zinc-400">
                        {rule.slug}
                      </span>
                    </td>
                    <td class="p-3.5">
                      <span class="rounded bg-purple-50 px-2 py-0.5 font-semibold text-[#7C2784]">
                        {rule.quantity_scope}
                      </span>
                    </td>
                    <td class="p-3.5 capitalize text-zinc-600">
                      {rule.access_mode === "open"
                        ? "Aberto a Todos"
                        : rule.access_mode === "exclusive"
                          ? "Exclusivo Revendedor"
                          : "Misto"}
                    </td>
                    <td class="p-3.5">
                      <div class="flex flex-wrap gap-1">
                        <For each={rule.tiers}>
                          {(tier) => (
                            <span class="rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10.5px] font-semibold text-zinc-700">
                              {tier.min_quantity}+ un:{" "}
                              {tier.discount_type === "percent"
                                ? `-${tier.discount_value}%`
                                : `R$ ${tier.discount_value.toFixed(2)}`}
                            </span>
                          )}
                        </For>
                      </div>
                    </td>
                    <td class="p-3.5 text-zinc-600">
                      {rule.stacking_policy === "no_stacking"
                        ? "Sem cupom"
                        : "Acumula cupom"}
                    </td>
                    <td class="p-3.5">
                      <span
                        class={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          rule.status === "active"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {rule.status === "active" ? "Ativa" : rule.status}
                      </span>
                    </td>
                    <td class="p-3.5 text-right">
                      <div class="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void handleToggleStatus(rule)}
                          title={rule.status === "active" ? "Pausar" : "Ativar"}
                          class="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                        >
                          <Show
                            when={rule.status === "active"}
                            fallback={
                              <Play class="size-3.5 text-emerald-600" />
                            }
                          >
                            <Pause class="size-3.5 text-amber-600" />
                          </Show>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(rule)}
                          title="Editar"
                          class="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-[#93509e]"
                        >
                          <Edit class="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(rule.id)}
                          title="Excluir"
                          class="rounded p-1 text-zinc-500 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 class="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </Show>
          </tbody>
        </table>
      </div>

      {/* Modal Create / Edit Rule */}
      <Show when={modalOpen()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div class="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              aria-label="Fechar"
              class="absolute right-4 top-4 text-zinc-400 hover:text-zinc-600"
            >
              <X class="size-5" />
            </button>

            <h3 class="text-base font-bold text-[#2E0C49]">
              {editingRule()
                ? "Editar Regra Comercial"
                : "Criar Nova Regra de Atacado"}
            </h3>

            <Show when={feedback()}>
              <div class="mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-700">
                <AlertCircle class="size-4 shrink-0" />
                <span>{feedback()}</span>
              </div>
            </Show>

            <form onSubmit={handleSave} class="mt-4 space-y-4 text-xs">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block font-semibold text-zinc-700">
                    Nome da Regra *
                  </label>
                  <input
                    type="text"
                    required
                    value={form().name}
                    onInput={(e) =>
                      setForm((f) => ({ ...f, name: e.currentTarget.value }))
                    }
                    class="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-xs focus:border-[#93509e] focus:outline-none"
                    placeholder="Ex: Atacado Esmaltes Linha Lírio"
                  />
                </div>
                <div>
                  <label class="block font-semibold text-zinc-700">
                    Status
                  </label>
                  <select
                    value={form().status}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        status: e.currentTarget
                          .value as WholesaleRuleItem["status"],
                      }))
                    }
                    class="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-xs focus:border-[#93509e] focus:outline-none"
                  >
                    <option value="active">Ativa</option>
                    <option value="draft">Rascunho</option>
                    <option value="paused">Pausada</option>
                    <option value="ended">Encerrada</option>
                  </select>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label class="block font-semibold text-zinc-700">
                    Escopo de Agrupamento
                  </label>
                  <select
                    value={form().quantity_scope}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        quantity_scope: e.currentTarget
                          .value as WholesaleRuleItem["quantity_scope"],
                      }))
                    }
                    class="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-xs focus:border-[#93509e] focus:outline-none"
                  >
                    <option value="commercial_line">
                      Linha Comercial / Marca
                    </option>
                    <option value="product">
                      Mesmo Produto (Mistura Cores)
                    </option>
                    <option value="wholesale_group">Grupo Comercial</option>
                    <option value="category">Mesma Categoria</option>
                    <option value="sku">SKU Único (Sem Mistura)</option>
                    <option value="order">Pedido Completo</option>
                  </select>
                </div>
                <div>
                  <label class="block font-semibold text-zinc-700">
                    Modo de Acesso
                  </label>
                  <select
                    value={form().access_mode}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        access_mode: e.currentTarget
                          .value as WholesaleRuleItem["access_mode"],
                      }))
                    }
                    class="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-xs focus:border-[#93509e] focus:outline-none"
                  >
                    <option value="open">Aberto (Qualquer Cliente)</option>
                    <option value="exclusive">
                      Exclusivo Revendedores Aprovados
                    </option>
                    <option value="mixed">Misto (Comum + Tiers VIP)</option>
                  </select>
                </div>
                <div>
                  <label class="block font-semibold text-zinc-700">
                    Acúmulo com Cupons
                  </label>
                  <select
                    value={form().stacking_policy}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        stacking_policy: e.currentTarget
                          .value as WholesaleRuleItem["stacking_policy"],
                      }))
                    }
                    class="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-xs focus:border-[#93509e] focus:outline-none"
                  >
                    <option value="no_stacking">Não acumula com cupom</option>
                    <option value="allow_coupons">
                      Permite cupom sobre atacado
                    </option>
                    <option value="best_discount_only">
                      Aplica o melhor desconto
                    </option>
                  </select>
                </div>
              </div>

              {/* Tiers Editor */}
              <div class="border-t border-zinc-200 pt-3">
                <div class="flex items-center justify-between">
                  <label class="block font-bold text-zinc-800">
                    Faixas de Quantidade & Preço Unitário
                  </label>
                  <button
                    type="button"
                    onClick={addTierRow}
                    class="inline-flex items-center gap-1 text-[11px] font-bold text-[#93509e] hover:underline"
                  >
                    <Plus class="size-3.5" />
                    <span>Adicionar Faixa</span>
                  </button>
                </div>

                <div class="mt-2 space-y-2">
                  <For each={form().tiers}>
                    {(tier, idx) => (
                      <div class="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2">
                        <div class="w-24">
                          <span class="text-[10px] text-zinc-500">
                            Mín. Unidades
                          </span>
                          <input
                            type="number"
                            min="1"
                            value={tier.min_quantity}
                            onInput={(e) => {
                              const val = Math.max(
                                1,
                                parseInt(e.currentTarget.value) || 1,
                              );
                              setForm((f) => {
                                const newT = [...f.tiers];
                                newT[idx()]!.min_quantity = val;
                                return { ...f, tiers: newT };
                              });
                            }}
                            class="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs"
                          />
                        </div>
                        <div class="w-24">
                          <span class="text-[10px] text-zinc-500">
                            Máx. Unidades
                          </span>
                          <input
                            type="number"
                            value={tier.max_quantity ?? ""}
                            onInput={(e) => {
                              const val = e.currentTarget.value
                                ? parseInt(e.currentTarget.value)
                                : null;
                              setForm((f) => {
                                const newT = [...f.tiers];
                                newT[idx()]!.max_quantity = val;
                                return { ...f, tiers: newT };
                              });
                            }}
                            placeholder="Sem limite"
                            class="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs"
                          />
                        </div>
                        <div class="w-32">
                          <span class="text-[10px] text-zinc-500">
                            Tipo Desconto
                          </span>
                          <select
                            value={tier.discount_type}
                            onChange={(e) => {
                              const val = e.currentTarget
                                .value as WholesaleRuleTierItem["discount_type"];
                              setForm((f) => {
                                const newT = [...f.tiers];
                                newT[idx()]!.discount_type = val;
                                return { ...f, tiers: newT };
                              });
                            }}
                            class="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs"
                          >
                            <option value="fixed_price">Preço Fixo (R$)</option>
                            <option value="percent">Porcentagem (%)</option>
                            <option value="fixed_discount">
                              Desconto Fixo (R$)
                            </option>
                          </select>
                        </div>
                        <div class="w-28">
                          <span class="text-[10px] text-zinc-500">Valor</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={tier.discount_value}
                            onInput={(e) => {
                              const val =
                                parseFloat(e.currentTarget.value) || 0;
                              setForm((f) => {
                                const newT = [...f.tiers];
                                newT[idx()]!.discount_value = val;
                                return { ...f, tiers: newT };
                              });
                            }}
                            class="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeTierRow(idx())}
                          disabled={form().tiers.length <= 1}
                          class="mt-4 rounded p-1 text-zinc-400 hover:text-red-600 disabled:opacity-30"
                        >
                          <Trash2 class="size-4" />
                        </button>
                      </div>
                    )}
                  </For>
                </div>
              </div>

              <div class="mt-6 flex justify-end gap-2 border-t border-zinc-200 pt-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  class="rounded-lg border border-zinc-300 px-4 py-2 font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={busy()}
                  class="rounded-lg bg-[#93509e] px-5 py-2 font-bold text-white transition hover:bg-[#7c3f87] disabled:opacity-60"
                >
                  {busy() ? "Salvando..." : "Salvar Regra"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Show>
    </div>
  );
}
