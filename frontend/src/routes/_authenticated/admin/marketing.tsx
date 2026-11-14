import { createFileRoute } from "@tanstack/solid-router";
import { For, Show, createResource, createSignal } from "solid-js";
import { AdminLayout } from "../../../features/admin/AdminLayout";
import { ApiError, api } from "../../../lib/api";
import { seoHead } from "../../../lib/seo";

export const Route = createFileRoute("/_authenticated/admin/marketing")({
  head: () =>
    seoHead({
      title: "Cupons, Promoções e Newsletter — Admin Mistura Feminina",
      description: "Regras promocionais, cupons e assinantes.",
      path: "/admin/marketing",
      noindex: true,
    }),
  component: AdminMarketingPage,
});

interface AdminCoupon {
  id: number;
  code: string;
  name: string;
  type: "percent" | "fixed" | "free_shipping";
  value: number;
  used_count: number;
  is_active: boolean;
}

interface AdminPromotion {
  id: number;
  name: string;
  rule_type: string;
  discount_type: string;
  value: number;
  is_active: boolean;
}

interface Subscriber {
  id: number;
  email: string;
  name: string | null;
  confirmed_at: string | null;
}

function AdminMarketingPage() {
  const [cCode, setCCode] = createSignal("");
  const [cName, setCName] = createSignal("");
  const [cType, setCType] = createSignal<"percent" | "fixed" | "free_shipping">(
    "percent",
  );
  const [cVal, setCVal] = createSignal(10);
  const [cMinSubtotal, setCMinSubtotal] = createSignal(0);

  const [pName, setPName] = createSignal("");
  const [pRule, setPRule] = createSignal<
    "category_discount" | "brand_discount" | "cart_threshold" | "quantity_tier"
  >("cart_threshold");
  const [pType, setPType] = createSignal<"percent" | "fixed">("percent");
  const [pVal, setPVal] = createSignal(10);
  const [pMinSub, setPMinSub] = createSignal(200);
  const [feedback, setFeedback] = createSignal<string | null>(null);

  const [coupons, { refetch: refetchCoupons }] = createResource(async () => {
    const res = await api<{ data: AdminCoupon[] }>("/admin/coupons");
    return res.data ?? [];
  });

  const [promos, { refetch: refetchPromos }] = createResource(async () => {
    const res = await api<{ data: AdminPromotion[] }>("/admin/promotions");
    return res.data ?? [];
  });

  const [subscribers] = createResource(async () => {
    const res = await api<{ data: Subscriber[] }>("/admin/newsletter");
    return res.data ?? [];
  });

  async function saveCoupon(e: Event) {
    e.preventDefault();
    setFeedback(null);
    try {
      await api("/admin/coupons", {
        method: "POST",
        body: {
          code: cCode().trim().toUpperCase(),
          name: cName().trim(),
          type: cType(),
          value:
            cType() === "fixed" ? Math.round(cVal() * 100) : Math.round(cVal()),
          min_subtotal_cents: Math.round(cMinSubtotal() * 100),
          scope_type: "all",
          is_active: true,
        },
      });
      setCCode("");
      setCName("");
      await refetchCoupons();
      setFeedback("Cupom criado.");
    } catch (err) {
      setFeedback(
        err instanceof ApiError ? err.message : "Erro ao criar cupom.",
      );
    }
  }

  async function removeCoupon(id: number) {
    await api(`/admin/coupons/${id}`, { method: "DELETE" });
    await refetchCoupons();
  }

  async function savePromotion(e: Event) {
    e.preventDefault();
    setFeedback(null);
    try {
      await api("/admin/promotions", {
        method: "POST",
        body: {
          name: pName().trim(),
          rule_type: pRule(),
          discount_type: pType(),
          value:
            pType() === "fixed" ? Math.round(pVal() * 100) : Math.round(pVal()),
          scope_type: "all",
          min_subtotal_cents: Math.round(pMinSub() * 100),
          is_active: true,
        },
      });
      setPName("");
      await refetchPromos();
      setFeedback("Regra promocional criada.");
    } catch (err) {
      setFeedback(
        err instanceof ApiError ? err.message : "Erro ao salvar promoção.",
      );
    }
  }

  async function removePromo(id: number) {
    await api(`/admin/promotions/${id}`, { method: "DELETE" });
    await refetchPromos();
  }

  return (
    <AdminLayout
      title="Cupons, Promoções e Newsletter"
      subtitle="Campanhas comerciais sem editar código"
      permission="marketing.view"
    >
      <Show when={feedback()}>
        <p
          role="status"
          class="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800"
        >
          {feedback()}
        </p>
      </Show>

      <div class="grid gap-6 lg:grid-cols-2">
        {/* Coupons */}
        <section class="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
          <h2 class="text-base font-bold text-zinc-900">Cupons de Desconto</h2>
          <form
            onSubmit={saveCoupon}
            class="grid gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50 p-3.5 text-sm sm:grid-cols-2"
          >
            <input
              type="text"
              required
              placeholder="Código (ex.: MISTURA15)"
              value={cCode()}
              onInput={(e) => setCCode(e.currentTarget.value.toUpperCase())}
              class="h-9 rounded-md border border-zinc-300 bg-white px-3 uppercase"
            />
            <input
              type="text"
              required
              placeholder="Nome da campanha"
              value={cName()}
              onInput={(e) => setCName(e.currentTarget.value)}
              class="h-9 rounded-md border border-zinc-300 bg-white px-3"
            />
            <select
              value={cType()}
              onChange={(e) =>
                setCType(
                  e.currentTarget.value as
                    "percent" | "fixed" | "free_shipping",
                )
              }
              class="h-9 rounded-md border border-zinc-300 bg-white px-2.5 text-xs"
            >
              <option value="percent">Porcentagem (%)</option>
              <option value="fixed">Valor fixo (R$)</option>
              <option value="free_shipping">Frete Grátis</option>
            </select>
            <input
              type="number"
              min="0"
              placeholder="Valor (% ou R$)"
              value={cVal()}
              onInput={(e) => setCVal(Number(e.currentTarget.value))}
              class="h-9 rounded-md border border-zinc-300 bg-white px-3"
            />
            <input
              type="number"
              min="0"
              placeholder="Subtotal mínimo (R$)"
              value={cMinSubtotal()}
              onInput={(e) => setCMinSubtotal(Number(e.currentTarget.value))}
              class="h-9 rounded-md border border-zinc-300 bg-white px-3"
            />
            <button
              type="submit"
              class="h-9 rounded-md bg-[var(--mf-primary)] text-xs font-bold text-white"
            >
              Criar cupom
            </button>
          </form>

          <ul class="divide-y divide-zinc-100 text-sm">
            <For each={coupons() ?? []}>
              {(c) => (
                <li class="flex items-center justify-between py-2.5">
                  <div>
                    <p class="font-mono font-bold text-zinc-900">{c.code}</p>
                    <p class="text-xs text-zinc-500">
                      {c.name} · Usos: {c.used_count}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeCoupon(c.id)}
                    class="text-xs font-semibold text-red-700 hover:underline"
                  >
                    Excluir
                  </button>
                </li>
              )}
            </For>
          </ul>
        </section>

        {/* Promotions + Newsletter */}
        <div class="space-y-6">
          <section class="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
            <h2 class="text-base font-bold text-zinc-900">
              Promoções Automáticas
            </h2>
            <form
              onSubmit={savePromotion}
              class="grid gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50 p-3.5 text-sm sm:grid-cols-2"
            >
              <input
                type="text"
                required
                placeholder="Nome da promoção *"
                value={pName()}
                onInput={(e) => setPName(e.currentTarget.value)}
                class="sm:col-span-2 h-9 rounded-md border border-zinc-300 bg-white px-3"
              />
              <select
                value={pRule()}
                onChange={(e) =>
                  setPRule(
                    e.currentTarget.value as
                      | "category_discount"
                      | "brand_discount"
                      | "cart_threshold"
                      | "quantity_tier",
                  )
                }
                class="h-9 rounded-md border border-zinc-300 bg-white px-2.5 text-xs"
              >
                <option value="cart_threshold">Valor mínimo no carrinho</option>
                <option value="quantity_tier">Leve mais, pague menos</option>
                <option value="category_discount">Desconto na categoria</option>
                <option value="brand_discount">Desconto na marca</option>
              </select>
              <select
                value={pType()}
                onChange={(e) =>
                  setPType(e.currentTarget.value as "percent" | "fixed")
                }
                class="h-9 rounded-md border border-zinc-300 bg-white px-2.5 text-xs"
              >
                <option value="percent">Porcentagem (%)</option>
                <option value="fixed">Valor fixo (R$)</option>
              </select>
              <input
                type="number"
                min="1"
                placeholder="Valor"
                value={pVal()}
                onInput={(e) => setPVal(Number(e.currentTarget.value))}
                class="h-9 rounded-md border border-zinc-300 bg-white px-3"
              />
              <input
                type="number"
                min="0"
                placeholder="Subtotal mínimo (R$)"
                value={pMinSub()}
                onInput={(e) => setPMinSub(Number(e.currentTarget.value))}
                class="h-9 rounded-md border border-zinc-300 bg-white px-3"
              />
              <button
                type="submit"
                class="sm:col-span-2 h-9 rounded-md bg-zinc-900 text-xs font-bold text-white"
              >
                Criar regra promocional
              </button>
            </form>

            <ul class="divide-y divide-zinc-100 text-sm">
              <For each={promos() ?? []}>
                {(p) => (
                  <li class="flex items-center justify-between py-2.5">
                    <div>
                      <p class="font-semibold text-zinc-900">{p.name}</p>
                      <p class="text-xs text-zinc-500">
                        {p.rule_type} · {p.discount_type} ({p.value})
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void removePromo(p.id)}
                      class="text-xs font-semibold text-red-700 hover:underline"
                    >
                      Excluir
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </section>

          <section class="rounded-xl border border-zinc-200 bg-white p-5">
            <h2 class="text-base font-bold text-zinc-900">
              Assinantes Newsletter ({subscribers()?.length ?? 0})
            </h2>
            <ul class="mt-3 max-h-48 divide-y divide-zinc-100 overflow-y-auto text-xs">
              <For each={subscribers() ?? []}>
                {(s) => (
                  <li class="flex justify-between py-2">
                    <span class="font-medium text-zinc-900">{s.email}</span>
                    <span class="text-zinc-500">{s.name || "—"}</span>
                  </li>
                )}
              </For>
            </ul>
          </section>
        </div>
      </div>
    </AdminLayout>
  );
}
