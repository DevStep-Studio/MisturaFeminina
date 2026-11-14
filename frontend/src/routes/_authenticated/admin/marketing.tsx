import { createFileRoute } from "@tanstack/solid-router";
import Check from "lucide-solid/icons/check";
import Copy from "lucide-solid/icons/copy";
import Download from "lucide-solid/icons/download";
import Percent from "lucide-solid/icons/percent";
import Sparkles from "lucide-solid/icons/sparkles";
import Ticket from "lucide-solid/icons/ticket";
import Trash2 from "lucide-solid/icons/trash";
import X from "lucide-solid/icons/x";
import { For, Show, createResource, createSignal } from "solid-js";
import { AdminLayout } from "../../../features/admin/AdminLayout";
import { ApiError, api } from "../../../lib/api";
import { formatCents, formatDate } from "../../../lib/format";
import { seoHead } from "../../../lib/seo";

export const Route = createFileRoute("/_authenticated/admin/marketing")({
  head: () =>
    seoHead({
      title: "Cupons, Promoções e Descontos — Admin Mistura Feminina",
      description:
        "Crie cupons de desconto, regras promocionais automáticas e gerencie assinantes.",
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
  min_subtotal_cents?: number;
  max_discount_cents?: number | null;
  max_uses?: number | null;
  used_count: number;
  first_purchase_only?: boolean;
  ends_at?: string | null;
  is_active: boolean;
}

interface AdminPromotion {
  id: number;
  name: string;
  rule_type: string;
  discount_type: string;
  value: number;
  min_subtotal_cents?: number;
  min_qty?: number;
  is_active: boolean;
}

interface Subscriber {
  id: number;
  email: string;
  name: string | null;
  confirmed_at: string | null;
  created_at?: string;
}

function AdminMarketingPage() {
  const [tab, setTab] = createSignal<"cupons" | "promocoes" | "newsletter">(
    "cupons",
  );
  const [feedback, setFeedback] = createSignal<string | null>(null);
  const [copiedCode, setCopiedCode] = createSignal<string | null>(null);

  // Coupon form
  const [cCode, setCCode] = createSignal("");
  const [cName, setCName] = createSignal("");
  const [cType, setCType] = createSignal<"percent" | "fixed" | "free_shipping">(
    "percent",
  );
  const [cVal, setCVal] = createSignal(10);
  const [cMinSubtotal, setCMinSubtotal] = createSignal(0);
  const [cMaxUses, setCMaxUses] = createSignal<number | "">("");
  const [cFirstOnly, setCFirstOnly] = createSignal(false);
  const [cExpiresAt, setCExpiresAt] = createSignal("");

  // Promotion form
  const [pName, setPName] = createSignal("");
  const [pRule, setPRule] = createSignal<
    "category_discount" | "brand_discount" | "cart_threshold" | "quantity_tier"
  >("cart_threshold");
  const [pType, setPType] = createSignal<"percent" | "fixed">("percent");
  const [pVal, setPVal] = createSignal(10);
  const [pMinSub, setPMinSub] = createSignal(199);
  const [pMinQty, setPMinQty] = createSignal(3);

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

  function generateCouponCode() {
    const prefixes = [
      "MISTURA",
      "BELEZA",
      "VIP",
      "OFF",
      "NAILS",
      "GLAM",
      "BEMVINDA",
    ];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const num = Math.floor(10 + Math.random() * 40);
    setCCode(`${prefix}${num}`);
  }

  async function copyToClipboard(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      // ignore
    }
  }

  async function saveCoupon(e: Event) {
    e.preventDefault();
    setFeedback(null);
    try {
      const payload: Record<string, unknown> = {
        code: cCode().trim().toUpperCase(),
        name: cName().trim(),
        type: cType(),
        value:
          cType() === "fixed" ? Math.round(cVal() * 100) : Math.round(cVal()),
        min_subtotal_cents: Math.round(cMinSubtotal() * 100),
        first_purchase_only: cFirstOnly(),
        scope_type: "all",
        is_active: true,
      };
      if (cMaxUses() !== "") {
        payload.max_uses = Number(cMaxUses());
      }
      if (cExpiresAt().trim()) {
        payload.ends_at = cExpiresAt().trim();
      }

      await api("/admin/coupons", {
        method: "POST",
        body: payload,
      });

      setCCode("");
      setCName("");
      setCVal(10);
      setCMinSubtotal(0);
      setCMaxUses("");
      setCExpiresAt("");
      await refetchCoupons();
      setFeedback("Cupom de desconto criado e ativo na loja virtual.");
    } catch (err) {
      setFeedback(
        err instanceof ApiError ? err.message : "Erro ao criar cupom.",
      );
    }
  }

  async function removeCoupon(id: number, code: string) {
    if (!confirm(`Deseja remover o cupom "${code}"?`)) return;
    try {
      await api(`/admin/coupons/${id}`, { method: "DELETE" });
      await refetchCoupons();
      setFeedback(`Cupom "${code}" removido.`);
    } catch (err) {
      setFeedback(
        err instanceof ApiError ? err.message : "Erro ao remover cupom.",
      );
    }
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
          min_qty: pRule() === "quantity_tier" ? Number(pMinQty()) : undefined,
          is_active: true,
        },
      });
      setPName("");
      await refetchPromos();
      setFeedback("Regra promocional criada e ativa no carrinho.");
    } catch (err) {
      setFeedback(
        err instanceof ApiError ? err.message : "Erro ao salvar promoção.",
      );
    }
  }

  async function removePromo(id: number, name: string) {
    if (!confirm(`Deseja remover a promoção "${name}"?`)) return;
    try {
      await api(`/admin/promotions/${id}`, { method: "DELETE" });
      await refetchPromos();
      setFeedback(`Promoção "${name}" removida.`);
    } catch (err) {
      setFeedback(
        err instanceof ApiError ? err.message : "Erro ao remover promoção.",
      );
    }
  }

  return (
    <AdminLayout
      title="Marketing: Cupons, Promoções e Descontos"
      subtitle="Crie regras promocionais, cupons com limites de uso e campanhas sem precisar de desenvolvedor"
      permission="marketing.view"
    >
      {/* Navigation Tabs */}
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div class="flex gap-2">
          <button
            type="button"
            onClick={() => setTab("cupons")}
            class={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition ${
              tab() === "cupons"
                ? "bg-[var(--mf-primary)] text-white shadow-sm"
                : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            <Ticket class="size-3.5" aria-hidden="true" />
            <span>Cupons de Desconto ({coupons()?.length ?? 0})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("promocoes")}
            class={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition ${
              tab() === "promocoes"
                ? "bg-[var(--mf-primary)] text-white shadow-sm"
                : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            <Percent class="size-3.5" aria-hidden="true" />
            <span>Promoções & Descontos ({promos()?.length ?? 0})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("newsletter")}
            class={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition ${
              tab() === "newsletter"
                ? "bg-[var(--mf-primary)] text-white shadow-sm"
                : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            <Download class="size-3.5" aria-hidden="true" />
            <span>Assinantes ({subscribers()?.length ?? 0})</span>
          </button>
        </div>
      </div>

      <Show when={feedback()}>
        <div
          role="status"
          class="mb-4 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800"
        >
          <span>{feedback()}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            class="text-emerald-700 hover:text-emerald-900"
          >
            <X class="size-4" aria-hidden="true" />
          </button>
        </div>
      </Show>

      {/* TAB 1: CUPONS */}
      <Show when={tab() === "cupons"}>
        <div class="grid gap-6 lg:grid-cols-12">
          {/* New Coupon Form */}
          <form
            onSubmit={saveCoupon}
            class="space-y-3.5 rounded-xl border border-zinc-200 bg-white p-5 lg:col-span-5"
          >
            <div class="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h2 class="text-base font-bold text-zinc-900">
                Criar Novo Cupom
              </h2>
              <button
                type="button"
                onClick={generateCouponCode}
                class="inline-flex items-center gap-1 rounded-md border border-fuchsia-200 bg-fuchsia-50 px-2 py-1 text-xs font-bold text-fuchsia-800 hover:bg-fuchsia-100"
              >
                <Sparkles class="size-3" aria-hidden="true" />
                <span>Gerar Código</span>
              </button>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="block text-xs font-semibold text-zinc-700">
                  Código do Cupom *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex.: CLIENTEVIP15"
                  value={cCode()}
                  onInput={(e) => setCCode(e.currentTarget.value.toUpperCase())}
                  class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 font-mono text-sm uppercase font-bold"
                />
              </div>
              <div>
                <label class="block text-xs font-semibold text-zinc-700">
                  Nome da Campanha *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex.: 15% OFF Primeira Compra"
                  value={cName()}
                  onInput={(e) => setCName(e.currentTarget.value)}
                  class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-sm"
                />
              </div>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="block text-xs font-semibold text-zinc-700">
                  Tipo de Desconto
                </label>
                <select
                  value={cType()}
                  onChange={(e) =>
                    setCType(
                      e.currentTarget.value as
                        "percent" | "fixed" | "free_shipping",
                    )
                  }
                  class="mt-1 h-9 w-full rounded-md border border-zinc-300 bg-white px-2.5 text-xs"
                >
                  <option value="percent">Porcentagem (%)</option>
                  <option value="fixed">Valor Fixo (R$)</option>
                  <option value="free_shipping">Frete Grátis</option>
                </select>
              </div>
              <Show when={cType() !== "free_shipping"}>
                <div>
                  <label class="block text-xs font-semibold text-zinc-700">
                    Valor {cType() === "percent" ? "(%)" : "(R$)"}
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={cVal()}
                    onInput={(e) => setCVal(Number(e.currentTarget.value))}
                    class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-sm"
                  />
                </div>
              </Show>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="block text-xs font-semibold text-zinc-700">
                  Subtotal Mínimo (R$)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0 para sem mínimo"
                  value={cMinSubtotal()}
                  onInput={(e) =>
                    setCMinSubtotal(Number(e.currentTarget.value))
                  }
                  class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-sm"
                />
              </div>
              <div>
                <label class="block text-xs font-semibold text-zinc-700">
                  Limite de Usos (Total)
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="Ilimitado"
                  value={cMaxUses()}
                  onInput={(e) =>
                    setCMaxUses(
                      e.currentTarget.value
                        ? Number(e.currentTarget.value)
                        : "",
                    )
                  }
                  class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-sm"
                />
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-zinc-700">
                Data de Expiração (Opcional)
              </label>
              <input
                type="date"
                value={cExpiresAt()}
                onInput={(e) => setCExpiresAt(e.currentTarget.value)}
                class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-xs"
              />
            </div>

            <div class="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="coupon-first-only"
                checked={cFirstOnly()}
                onChange={(e) => setCFirstOnly(e.currentTarget.checked)}
                class="rounded border-zinc-300 text-[var(--mf-primary)]"
              />
              <label
                for="coupon-first-only"
                class="text-xs font-semibold text-zinc-800"
              >
                Apenas para primeira compra do cliente
              </label>
            </div>

            <button
              type="submit"
              class="mt-2 h-10 w-full rounded-lg bg-[var(--mf-primary)] text-xs font-bold text-white shadow-sm hover:bg-[var(--mf-primary-hover)]"
            >
              Criar e Publicar Cupom
            </button>
          </form>

          {/* Coupons List */}
          <section class="space-y-3 rounded-xl border border-zinc-200 bg-white p-5 lg:col-span-7">
            <h2 class="text-base font-bold text-zinc-900">
              Cupons Ativos na Loja
            </h2>
            <div class="space-y-2.5">
              <For
                each={coupons() ?? []}
                fallback={
                  <p class="py-8 text-center text-sm text-zinc-500">
                    Nenhum cupom cadastrado ainda.
                  </p>
                }
              >
                {(c) => (
                  <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 p-3 text-sm shadow-2xs hover:border-[var(--mf-primary)]/40 transition">
                    <div class="min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="rounded bg-[#FAF5FB] px-2.5 py-1 font-mono font-bold text-[#93509e] border border-fuchsia-200">
                          {c.code}
                        </span>
                        <button
                          type="button"
                          onClick={() => void copyToClipboard(c.code)}
                          class="rounded p-1 text-zinc-400 hover:text-zinc-700"
                          title="Copiar código"
                        >
                          <Show
                            when={copiedCode() === c.code}
                            fallback={
                              <Copy class="size-3.5" aria-hidden="true" />
                            }
                          >
                            <Check
                              class="size-3.5 text-emerald-600"
                              aria-hidden="true"
                            />
                          </Show>
                        </button>
                        <span class="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                          {c.type === "percent"
                            ? `${c.value}% OFF`
                            : c.type === "fixed"
                              ? `${formatCents(c.value)} OFF`
                              : "Frete Grátis"}
                        </span>
                      </div>
                      <p class="mt-1 font-medium text-zinc-800 text-xs">
                        {c.name}
                      </p>
                      <p class="text-[11px] text-zinc-500">
                        Usos: <strong>{c.used_count}</strong>
                        {c.max_uses ? ` de ${c.max_uses}` : " (ilimitado)"}
                        {c.min_subtotal_cents
                          ? ` · Mínimo: ${formatCents(c.min_subtotal_cents)}`
                          : ""}
                        {c.first_purchase_only ? " · 1ª compra" : ""}
                        {c.ends_at ? ` · Vence: ${formatDate(c.ends_at)}` : ""}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => void removeCoupon(c.id, c.code)}
                      class="rounded p-1.5 text-red-600 hover:bg-red-50"
                      title="Excluir cupom"
                    >
                      <Trash2 class="size-4" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </For>
            </div>
          </section>
        </div>
      </Show>

      {/* TAB 2: PROMOÇÕES AUTOMÁTICAS */}
      <Show when={tab() === "promocoes"}>
        <div class="grid gap-6 lg:grid-cols-12">
          {/* New Promotion Form */}
          <form
            onSubmit={savePromotion}
            class="space-y-3.5 rounded-xl border border-zinc-200 bg-white p-5 lg:col-span-5"
          >
            <div class="border-b border-zinc-100 pb-3">
              <h2 class="text-base font-bold text-zinc-900">
                Nova Regra de Promoção Automática
              </h2>
              <p class="text-xs text-zinc-500">
                Aplicada diretamente no carrinho e vitrines sem precisar de
                cupom
              </p>
            </div>

            <div>
              <label class="block text-xs font-semibold text-zinc-700">
                Nome da Promoção *
              </label>
              <input
                type="text"
                required
                placeholder="ex.: Desconto Progressivo - Compre 3 ganhe 10%"
                value={pName()}
                onInput={(e) => setPName(e.currentTarget.value)}
                class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-sm"
              />
            </div>

            <div>
              <label class="block text-xs font-semibold text-zinc-700">
                Regra de Gatilho
              </label>
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
                class="mt-1 h-9 w-full rounded-md border border-zinc-300 bg-white px-2.5 text-xs font-medium"
              >
                <option value="cart_threshold">
                  Valor mínimo no carrinho (ex.: Acima de R$ 200 ganhe 10%)
                </option>
                <option value="quantity_tier">
                  Desconto Progressivo por Quantidade (ex.: A partir de 3 itens)
                </option>
                <option value="category_discount">
                  Desconto Global em Categoria
                </option>
                <option value="brand_discount">Desconto Global em Marca</option>
              </select>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="block text-xs font-semibold text-zinc-700">
                  Tipo de Desconto
                </label>
                <select
                  value={pType()}
                  onChange={(e) =>
                    setPType(e.currentTarget.value as "percent" | "fixed")
                  }
                  class="mt-1 h-9 w-full rounded-md border border-zinc-300 bg-white px-2.5 text-xs"
                >
                  <option value="percent">Porcentagem (%)</option>
                  <option value="fixed">Valor Fixo (R$)</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-semibold text-zinc-700">
                  Valor {pType() === "percent" ? "(%)" : "(R$)"} *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={pVal()}
                  onInput={(e) => setPVal(Number(e.currentTarget.value))}
                  class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-sm"
                />
              </div>
            </div>

            <Show when={pRule() === "quantity_tier"}>
              <div>
                <label class="block text-xs font-semibold text-zinc-700">
                  Quantidade Mínima de Itens
                </label>
                <input
                  type="number"
                  min="2"
                  value={pMinQty()}
                  onInput={(e) => setPMinQty(Number(e.currentTarget.value))}
                  class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-sm"
                />
              </div>
            </Show>

            <Show when={pRule() === "cart_threshold"}>
              <div>
                <label class="block text-xs font-semibold text-zinc-700">
                  Subtotal Mínimo (R$)
                </label>
                <input
                  type="number"
                  min="0"
                  value={pMinSub()}
                  onInput={(e) => setPMinSub(Number(e.currentTarget.value))}
                  class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-sm"
                />
              </div>
            </Show>

            <button
              type="submit"
              class="mt-2 h-10 w-full rounded-lg bg-[var(--mf-primary)] text-xs font-bold text-white shadow-sm hover:bg-[var(--mf-primary-hover)]"
            >
              Ativar Promoção
            </button>
          </form>

          {/* Promotions List */}
          <section class="space-y-3 rounded-xl border border-zinc-200 bg-white p-5 lg:col-span-7">
            <h2 class="text-base font-bold text-zinc-900">
              Promoções em Vigor
            </h2>
            <div class="space-y-2.5">
              <For
                each={promos() ?? []}
                fallback={
                  <p class="py-8 text-center text-sm text-zinc-500">
                    Nenhuma promoção ativa no momento.
                  </p>
                }
              >
                {(p) => (
                  <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 p-3 text-sm shadow-2xs hover:border-[var(--mf-primary)]/40 transition">
                    <div>
                      <p class="font-bold text-zinc-900">{p.name}</p>
                      <p class="text-xs text-zinc-500">
                        Regra:{" "}
                        <span class="font-semibold text-zinc-700">
                          {p.rule_type}
                        </span>{" "}
                        · Desconto:{" "}
                        <strong class="text-fuchsia-700">
                          {p.discount_type === "percent"
                            ? `${p.value}% OFF`
                            : formatCents(p.value)}
                        </strong>
                        {p.min_subtotal_cents
                          ? ` · Mínimo: ${formatCents(p.min_subtotal_cents)}`
                          : ""}
                        {p.min_qty ? ` · A partir de ${p.min_qty} itens` : ""}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => void removePromo(p.id, p.name)}
                      class="rounded p-1.5 text-red-600 hover:bg-red-50"
                      title="Excluir promoção"
                    >
                      <Trash2 class="size-4" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </For>
            </div>
          </section>
        </div>
      </Show>

      {/* TAB 3: NEWSLETTER */}
      <Show when={tab() === "newsletter"}>
        <section class="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
          <div class="flex items-center justify-between border-b border-zinc-100 pb-3">
            <div>
              <h2 class="text-base font-bold text-zinc-900">
                Lista de Assinantes da Newsletter
              </h2>
              <p class="text-xs text-zinc-500">
                Clientes que aceitaram receber novidades e cupons
              </p>
            </div>
            <a
              href="/api/v1/admin/newsletter/export"
              target="_blank"
              class="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 shadow-2xs hover:bg-zinc-50"
            >
              <Download class="size-3.5" aria-hidden="true" />
              <span>Exportar CSV</span>
            </a>
          </div>

          <ul class="divide-y divide-zinc-100 text-xs">
            <For
              each={subscribers() ?? []}
              fallback={
                <li class="py-6 text-center text-zinc-500">
                  Nenhum assinante cadastrado ainda.
                </li>
              }
            >
              {(s) => (
                <li class="flex items-center justify-between py-2.5">
                  <div>
                    <p class="font-bold text-zinc-900">{s.email}</p>
                    <p class="text-zinc-500">
                      {s.name || "Assinante Loja Virtual"}
                    </p>
                  </div>
                  <span class="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                    Confirmado
                  </span>
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>
    </AdminLayout>
  );
}
