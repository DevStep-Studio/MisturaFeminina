import Check from "lucide-solid/icons/check";
import Copy from "lucide-solid/icons/copy";
import ExternalLink from "lucide-solid/icons/external-link";
import Link2 from "lucide-solid/icons/link-2";
import MessageCircle from "lucide-solid/icons/message-circle";
import Minus from "lucide-solid/icons/minus";
import Plus from "lucide-solid/icons/plus";
import Search from "lucide-solid/icons/search";
import Trash2 from "lucide-solid/icons/trash";
import UserPlus from "lucide-solid/icons/user-plus";
import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { ApiError, api } from "../../lib/api";
import { assetUrl, formatCents } from "../../lib/format";
import { buildAssistedOrderWhatsappUrl } from "./admin-helpers";

interface CatalogProductResult {
  id: number;
  name: string;
  sku: string;
  brand_name: string | null;
  image_url: string | null;
  variants: Array<{
    id: number;
    sku: string;
    name: string;
    shade_code: string | null;
    color_hex: string | null;
    effective_price_cents: number;
    available_stock: number;
    in_stock: boolean;
  }>;
}

interface DraftLine {
  variant_id: number;
  product_name: string;
  variant_name: string;
  shade_code: string | null;
  color_hex: string | null;
  sku: string;
  image_url: string | null;
  unit_price_cents: number;
  available_stock: number;
  quantity: number;
}

interface AssistedOrderSummary {
  id: number;
  order_code: string;
  token: string;
  status: string;
  customer_user_id: number | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  coupon_code: string | null;
  notes: string | null;
  estimated_total_cents: number;
  checkout_url: string;
  checkout_path: string;
  converted_order: { id: number; order_number: string; status: string } | null;
  created_by: { id: number; name: string } | null;
  items: Array<{
    id: number;
    variant_id: number;
    product_name: string;
    variant_name: string;
    shade_code: string | null;
    color_hex: string | null;
    sku: string;
    image_url: string | null;
    quantity: number;
    unit_price_cents: number;
    available_stock: number;
  }>;
  created_at: string | null;
}

const ASSISTED_STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  link_generated: "Link gerado",
  awaiting_checkout: "Aguardando cliente",
  converted: "Convertido em pedido",
  expired: "Expirado",
  cancelled: "Cancelado",
};

export function AdminAssistedOrderBuilder(props: {
  onClose?: () => void;
  onConverted?: () => void;
}) {
  const [catalogSearch, setCatalogSearch] = createSignal("");
  const [customerSearch, setCustomerSearch] = createSignal("");
  const [editingId, setEditingId] = createSignal<number | null>(null);
  const [customerUserId, setCustomerUserId] = createSignal<number | null>(null);
  const [customerName, setCustomerName] = createSignal("");
  const [customerEmail, setCustomerEmail] = createSignal("");
  const [customerPhone, setCustomerPhone] = createSignal("");
  const [couponCode, setCouponCode] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [lines, setLines] = createSignal<DraftLine[]>([]);

  const [generatedLink, setGeneratedLink] = createSignal<string | null>(null);
  const [copied, setCopied] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [feedback, setFeedback] = createSignal<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const [catalog] = createResource(catalogSearch, async (q) => {
    const res = await api<{ data: CatalogProductResult[] }>(
      `/admin/assisted-orders/catalog-search?q=${encodeURIComponent(q)}`,
    );
    return res.data ?? [];
  });

  const [customers] = createResource(customerSearch, async (q) => {
    if (q.trim().length < 2) return [];
    const res = await api<{
      data: Array<{
        id: number;
        name: string;
        email: string;
        phone: string | null;
      }>;
    }>(`/admin/assisted-orders/customer-search?q=${encodeURIComponent(q)}`);
    return res.data ?? [];
  });

  const [history, { refetch: refetchHistory }] = createResource(async () => {
    const res = await api<{ data: AssistedOrderSummary[] }>(
      "/admin/assisted-orders",
    );
    return res.data ?? [];
  });

  const estimatedTotalCents = createMemo(() =>
    lines().reduce((sum, l) => sum + l.unit_price_cents * l.quantity, 0),
  );

  function addVariant(
    prod: CatalogProductResult,
    v: CatalogProductResult["variants"][number],
  ) {
    if (!v.in_stock) return;
    setFeedback(null);
    setLines((prev) => {
      const idx = prev.findIndex((item) => item.variant_id === v.id);
      if (idx >= 0) {
        const next = [...prev];
        const qty = Math.min(v.available_stock, next[idx].quantity + 1);
        next[idx] = { ...next[idx], quantity: qty };
        return next;
      }
      return [
        ...prev,
        {
          variant_id: v.id,
          product_name: prod.name,
          variant_name: v.name,
          shade_code: v.shade_code,
          color_hex: v.color_hex,
          sku: v.sku,
          image_url: prod.image_url,
          unit_price_cents: v.effective_price_cents,
          available_stock: v.available_stock,
          quantity: 1,
        },
      ];
    });
  }

  function updateLineQty(variantId: number, qty: number) {
    setLines((prev) =>
      prev
        .map((l) =>
          l.variant_id === variantId
            ? { ...l, quantity: Math.min(l.available_stock, Math.max(0, qty)) }
            : l,
        )
        .filter((l) => l.quantity > 0),
    );
  }

  function selectCustomer(c: {
    id: number;
    name: string;
    email: string;
    phone: string | null;
  }) {
    setCustomerUserId(c.id);
    setCustomerName(c.name);
    setCustomerEmail(c.email);
    setCustomerPhone(c.phone || "");
    setCustomerSearch("");
  }

  function loadDraft(a: AssistedOrderSummary) {
    setEditingId(a.id);
    setCustomerUserId(a.customer_user_id);
    setCustomerName(a.customer_name || "");
    setCustomerEmail(a.customer_email || "");
    setCustomerPhone(a.customer_phone || "");
    setCouponCode(a.coupon_code || "");
    setNotes(a.notes || "");
    setLines(
      a.items.map((i) => ({
        variant_id: i.variant_id,
        product_name: i.product_name,
        variant_name: i.variant_name,
        shade_code: i.shade_code,
        color_hex: i.color_hex,
        sku: i.sku,
        image_url: i.image_url,
        unit_price_cents: i.unit_price_cents,
        available_stock: Math.max(i.quantity, i.available_stock),
        quantity: i.quantity,
      })),
    );
    setGeneratedLink(
      typeof window !== "undefined" && a.status !== "draft"
        ? `${window.location.origin}${a.checkout_path}`
        : null,
    );
    setFeedback(null);
  }

  function resetDraft() {
    setEditingId(null);
    setCustomerUserId(null);
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setCouponCode("");
    setNotes("");
    setLines([]);
    setGeneratedLink(null);
    setFeedback(null);
  }

  async function persistDraft(): Promise<AssistedOrderSummary> {
    const payload = {
      customer_user_id: customerUserId(),
      customer_name: customerName().trim() || undefined,
      customer_email: customerEmail().trim() || undefined,
      customer_phone: customerPhone().trim() || undefined,
      coupon_code: couponCode().trim() || undefined,
      notes: notes().trim() || undefined,
      items: lines().map((l) => ({
        variant_id: l.variant_id,
        quantity: l.quantity,
      })),
    };
    if (editingId()) {
      const res = await api<{ data: AssistedOrderSummary }>(
        `/admin/assisted-orders/${editingId()}`,
        { method: "PUT", body: payload },
      );
      return res.data;
    }
    const res = await api<{ data: AssistedOrderSummary }>(
      "/admin/assisted-orders",
      { method: "POST", body: payload },
    );
    setEditingId(res.data.id);
    return res.data;
  }

  async function handleSaveDraft() {
    if (lines().length === 0) return;
    setBusy(true);
    setFeedback(null);
    try {
      const saved = await persistDraft();
      setFeedback({
        type: "ok",
        text: `Rascunho ${saved.order_code} salvo com sucesso!`,
      });
      await refetchHistory();
    } catch (err) {
      setFeedback({
        type: "err",
        text:
          err instanceof ApiError ? err.message : "Erro ao salvar rascunho.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateLink() {
    if (lines().length === 0) return;
    setBusy(true);
    setFeedback(null);
    try {
      const saved = await persistDraft();
      const res = await api<{
        data: {
          token: string;
          checkout_path: string;
          checkout_url: string;
        };
      }>(`/admin/assisted-orders/${saved.id}/generate-link`, {
        method: "POST",
        body: { expires_in_hours: 72 },
      });
      const absUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}${res.data.checkout_path}`
          : res.data.checkout_url;
      setGeneratedLink(absUrl);
      setFeedback({
        type: "ok",
        text: "Link de pagamento pronto para enviar à cliente!",
      });
      await refetchHistory();
    } catch (err) {
      setFeedback({
        type: "err",
        text: err instanceof ApiError ? err.message : "Erro ao gerar link.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    const link = generatedLink();
    if (!link || typeof navigator === "undefined") return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div class="space-y-6">
      <div class="grid gap-6 lg:grid-cols-12">
        {/* Esquerda: Catalogo com multi-variantes */}
        <section class="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 lg:col-span-6">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-extrabold text-[#2E0C49]">
              Catálogo Rápido (Multi-Cores &amp; SKUs)
            </h2>
            <Show when={props.onClose}>
              <button
                type="button"
                onClick={() => props.onClose?.()}
                class="text-xs font-semibold text-zinc-500 hover:underline"
              >
                Voltar à fila de pedidos
              </button>
            </Show>
          </div>

          <div class="relative">
            <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              value={catalogSearch()}
              onInput={(e) => setCatalogSearch(e.currentTarget.value)}
              placeholder="Buscar produto, SKU, cor ou marca..."
              class="h-10 w-full rounded-lg border border-zinc-300 pl-9 pr-3 text-xs focus:border-[#93509e] focus:outline-none"
            />
          </div>

          <div class="max-h-[540px] space-y-2.5 overflow-y-auto pr-1">
            <For each={catalog() ?? []}>
              {(prod) => (
                <div class="rounded-lg border border-zinc-200 p-3">
                  <div class="flex items-center gap-2.5">
                    <img
                      src={assetUrl(prod.image_url)}
                      alt={prod.name}
                      class="size-10 shrink-0 rounded border border-zinc-100 object-contain"
                    />
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-xs font-bold text-zinc-900">
                        {prod.name}
                      </p>
                      <p class="text-[11px] text-zinc-500">
                        {prod.brand_name || "Mistura Feminina"} • {prod.sku}
                      </p>
                    </div>
                  </div>
                  <div class="mt-2.5 grid gap-1.5 sm:grid-cols-2">
                    <For each={prod.variants}>
                      {(v) => (
                        <button
                          type="button"
                          disabled={!v.in_stock}
                          onClick={() => addVariant(prod, v)}
                          class={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors ${
                            v.in_stock
                              ? "border-zinc-200 bg-zinc-50 hover:border-[#93509e] hover:bg-[#FCF8FD]"
                              : "border-zinc-100 bg-zinc-50/50 opacity-50"
                          }`}
                        >
                          <div class="flex min-w-0 items-center gap-1.5">
                            <Show when={v.color_hex}>
                              <span
                                class="size-3 shrink-0 rounded-full border border-black/15"
                                style={{ "background-color": v.color_hex! }}
                              />
                            </Show>
                            <div class="min-w-0">
                              <p class="truncate font-semibold text-zinc-800">
                                {v.name}
                              </p>
                              <p class="text-[10px] text-zinc-500">
                                {v.sku} •{" "}
                                {v.in_stock
                                  ? `${v.available_stock} disp.`
                                  : "Esgotado"}
                              </p>
                            </div>
                          </div>
                          <span class="shrink-0 font-bold text-[#93509e]">
                            + {formatCents(v.effective_price_cents)}
                          </span>
                        </button>
                      )}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </div>
        </section>

        {/* Direita: Cliente + Resumo + Link de Checkout */}
        <section class="space-y-4 rounded-xl border border-[#DFC2E3] bg-[#FCF8FD] p-4 lg:col-span-6">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-extrabold text-[#2E0C49]">
              Resumo do Pedido Assistido
            </h2>
            <button
              type="button"
              onClick={resetDraft}
              class="text-xs font-semibold text-zinc-600 hover:underline"
            >
              Limpar rascunho
            </button>
          </div>

          {/* Cliente */}
          <div class="space-y-2 rounded-lg border border-zinc-200 bg-white p-3">
            <div class="relative">
              <UserPlus class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" />
              <input
                type="search"
                value={customerSearch()}
                onInput={(e) => setCustomerSearch(e.currentTarget.value)}
                placeholder="Buscar cliente cadastrado (nome, WhatsApp ou e-mail)..."
                class="h-8 w-full rounded border border-zinc-300 pl-8 pr-3 text-xs focus:border-[#93509e] focus:outline-none"
              />
            </div>

            <Show when={(customers()?.length ?? 0) > 0}>
              <div class="max-h-32 divide-y divide-zinc-100 overflow-y-auto rounded border border-[#DFC2E3] bg-white text-xs">
                <For each={customers() ?? []}>
                  {(c) => (
                    <button
                      type="button"
                      onClick={() => selectCustomer(c)}
                      class="flex w-full items-center justify-between px-2.5 py-1.5 text-left hover:bg-[#FCF8FD]"
                    >
                      <span class="font-bold text-zinc-900">{c.name}</span>
                      <span class="text-zinc-500">{c.phone || c.email}</span>
                    </button>
                  )}
                </For>
              </div>
            </Show>

            <div class="grid gap-2 sm:grid-cols-3 text-xs">
              <input
                type="text"
                placeholder="Nome da cliente"
                value={customerName()}
                onInput={(e) => setCustomerName(e.currentTarget.value)}
                class="h-8 rounded border border-zinc-300 px-2.5"
              />
              <input
                type="tel"
                placeholder="WhatsApp"
                value={customerPhone()}
                onInput={(e) => setCustomerPhone(e.currentTarget.value)}
                class="h-8 rounded border border-zinc-300 px-2.5"
              />
              <input
                type="email"
                placeholder="E-mail (opcional)"
                value={customerEmail()}
                onInput={(e) => setCustomerEmail(e.currentTarget.value)}
                class="h-8 rounded border border-zinc-300 px-2.5"
              />
            </div>
          </div>

          {/* Itens */}
          <div class="space-y-2 rounded-lg border border-zinc-200 bg-white p-3">
            <Show
              when={lines().length > 0}
              fallback={
                <p class="py-6 text-center text-xs text-zinc-500">
                  Clique nos produtos à esquerda para adicionar tonalidades ao
                  atendimento.
                </p>
              }
            >
              <ul class="divide-y divide-zinc-100 text-xs">
                <For each={lines()}>
                  {(item) => (
                    <li class="flex items-center justify-between gap-2 py-2">
                      <div class="min-w-0 flex-1">
                        <p class="truncate font-bold text-zinc-900">
                          {item.product_name}
                        </p>
                        <p class="text-[11px] text-zinc-500">
                          {item.variant_name} ({item.sku}) •{" "}
                          {formatCents(item.unit_price_cents)}
                        </p>
                      </div>
                      <div class="flex items-center gap-2">
                        <div class="inline-flex h-7 items-center rounded border border-zinc-200 bg-zinc-50">
                          <button
                            type="button"
                            onClick={() =>
                              updateLineQty(item.variant_id, item.quantity - 1)
                            }
                            aria-label="Diminuir"
                            class="px-1.5 text-zinc-600 hover:text-zinc-900"
                          >
                            <Minus class="size-3" />
                          </button>
                          <span class="w-7 text-center font-bold">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              updateLineQty(item.variant_id, item.quantity + 1)
                            }
                            aria-label="Aumentar"
                            class="px-1.5 text-zinc-600 hover:text-zinc-900"
                          >
                            <Plus class="size-3" />
                          </button>
                        </div>
                        <span class="w-16 text-right font-bold text-zinc-900">
                          {formatCents(item.unit_price_cents * item.quantity)}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateLineQty(item.variant_id, 0)}
                          aria-label="Remover item"
                          class="text-zinc-400 hover:text-red-600"
                        >
                          <Trash2 class="size-3.5" />
                        </button>
                      </div>
                    </li>
                  )}
                </For>
              </ul>
            </Show>

            <div class="mt-2 grid gap-2 border-t border-zinc-100 pt-2.5 sm:grid-cols-2 text-xs">
              <input
                type="text"
                placeholder="Cupom (opcional)"
                value={couponCode()}
                onInput={(e) => setCouponCode(e.currentTarget.value)}
                class="h-8 rounded border border-zinc-300 px-2.5 uppercase"
              />
              <input
                type="text"
                placeholder="Observação do atendente..."
                value={notes()}
                onInput={(e) => setNotes(e.currentTarget.value)}
                class="h-8 rounded border border-zinc-300 px-2.5"
              />
            </div>

            <div class="flex items-center justify-between border-t border-zinc-200 pt-3">
              <span class="text-xs font-semibold text-zinc-600">
                Total estimado (sem frete)
              </span>
              <span class="text-lg font-black text-[#93509e]">
                {formatCents(estimatedTotalCents())}
              </span>
            </div>
          </div>

          <div class="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={lines().length === 0 || busy()}
              onClick={() => void handleSaveDraft()}
              class="h-10 rounded-lg border border-[#93509e] bg-white text-xs font-bold text-[#93509e] hover:bg-[#FAF6FC] disabled:opacity-50"
            >
              Salvar rascunho
            </button>
            <button
              type="button"
              disabled={lines().length === 0 || busy()}
              onClick={() => void handleGenerateLink()}
              class="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[#93509e] text-xs font-bold text-white hover:bg-[#7c3f87] disabled:opacity-50"
            >
              <Link2 class="size-4" />
              Gerar link de pagamento
            </button>
          </div>

          <Show when={generatedLink()}>
            {(url) => (
              <div class="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs">
                <p class="font-bold text-emerald-900">
                  Link pronto para checkout oficial (estoque validado no
                  pagamento):
                </p>
                <div class="flex items-center gap-1.5">
                  <input
                    type="text"
                    readOnly
                    value={url()}
                    class="h-8 min-w-0 flex-1 rounded border border-emerald-200 bg-white px-2 font-mono text-[11px]"
                  />
                  <button
                    type="button"
                    onClick={() => void copyLink()}
                    class="inline-flex h-8 items-center gap-1 rounded bg-emerald-700 px-3 text-[11px] font-bold text-white"
                  >
                    <Show when={copied()} fallback={<Copy class="size-3" />}>
                      <Check class="size-3" />
                    </Show>
                    {copied() ? "Copiado" : "Copiar"}
                  </button>
                </div>
                <a
                  href={buildAssistedOrderWhatsappUrl(customerPhone(), url())}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="mf-btn-whats inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg text-xs font-bold"
                >
                  <MessageCircle class="size-4" />
                  Enviar pelo WhatsApp
                </a>
              </div>
            )}
          </Show>

          <Show when={feedback()}>
            {(fb) => (
              <p
                role="status"
                class={`rounded-lg px-3 py-2 text-xs font-semibold ${
                  fb().type === "ok"
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {fb().text}
              </p>
            )}
          </Show>
        </section>
      </div>

      {/* Historico de Pedidos Assistidos */}
      <section class="rounded-xl border border-zinc-200 bg-white p-5">
        <h3 class="mb-3 text-sm font-extrabold text-zinc-900">
          Histórico de Pedidos Assistidos ({history()?.length ?? 0})
        </h3>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="border-b border-zinc-100 text-zinc-400">
              <tr>
                <th class="py-2 pr-3">Código</th>
                <th class="py-2 pr-3">Cliente</th>
                <th class="py-2 pr-3">Status</th>
                <th class="py-2 pr-3">Atendente</th>
                <th class="py-2 pr-3 text-right">Valor Est.</th>
                <th class="py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-100">
              <For each={history() ?? []}>
                {(row) => (
                  <tr>
                    <td class="py-2.5 pr-3 font-bold text-zinc-900">
                      {row.order_code}
                    </td>
                    <td class="py-2.5 pr-3">
                      <p class="font-medium text-zinc-800">
                        {row.customer_name || "Cliente WhatsApp"}
                      </p>
                      <p class="text-[11px] text-zinc-500">
                        {row.customer_phone || row.customer_email || ""}
                      </p>
                    </td>
                    <td class="py-2.5 pr-3">
                      <span
                        class={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          row.status === "converted"
                            ? "bg-emerald-50 text-emerald-700"
                            : row.status === "link_generated"
                              ? "bg-purple-50 text-[#93509e]"
                              : "bg-zinc-100 text-zinc-700"
                        }`}
                      >
                        {ASSISTED_STATUS_LABEL[row.status] ?? row.status}
                      </span>
                      <Show when={row.converted_order}>
                        {(co) => (
                          <span class="ml-1.5 font-mono text-[10px] font-bold text-emerald-800">
                            ({co().order_number})
                          </span>
                        )}
                      </Show>
                    </td>
                    <td class="py-2.5 pr-3 text-zinc-600">
                      {row.created_by?.name || "-"}
                    </td>
                    <td class="py-2.5 pr-3 text-right font-bold">
                      {formatCents(row.estimated_total_cents)}
                    </td>
                    <td class="py-2.5 text-right">
                      <Show
                        when={
                          row.status !== "converted" &&
                          row.status !== "cancelled"
                        }
                      >
                        <button
                          type="button"
                          onClick={() => loadDraft(row)}
                          class="mr-2 font-bold text-[#93509e] hover:underline"
                        >
                          Retomar
                        </button>
                      </Show>
                      <Show
                        when={
                          row.status === "link_generated" ||
                          row.status === "awaiting_checkout"
                        }
                      >
                        <a
                          href={row.checkout_path}
                          target="_blank"
                          rel="noreferrer"
                          class="inline-flex items-center gap-0.5 text-zinc-500 hover:text-zinc-900"
                        >
                          Link <ExternalLink class="size-3" />
                        </a>
                      </Show>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
