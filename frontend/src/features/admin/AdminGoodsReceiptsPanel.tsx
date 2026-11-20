import AlertTriangle from "lucide-solid/icons/triangle-exclamation-point";
import CheckCircle2 from "lucide-solid/icons/circle-check";
import PackageCheck from "lucide-solid/icons/package-check";
import Plus from "lucide-solid/icons/plus";
import Search from "lucide-solid/icons/search";
import Trash2 from "lucide-solid/icons/trash";
import { For, Show, createResource, createSignal, onMount } from "solid-js";
import { ApiError, api } from "../../lib/api";

interface ReceiptItemDraft {
  product_variant_id: number;
  product_name: string;
  variant_name: string;
  sku: string;
  expected_qty: number | null;
  received_qty: number;
  accepted_qty: number;
  discrepancy_reason: string;
  discrepancy_notes: string;
  lot_code: string;
  expires_at: string;
}

interface ReceiptRow {
  id: number;
  receipt_number: string;
  invoice_number: string | null;
  purchase_reference: string | null;
  status: string;
  has_discrepancy: boolean;
  received_at: string;
  confirmed_at: string | null;
  supplier: { id: number; name: string } | null;
  received_by: { id: number; name: string } | null;
  confirmed_by: { id: number; name: string } | null;
  items: Array<{
    id: number;
    sku_snapshot: string;
    expected_qty: number | null;
    received_qty: number;
    accepted_qty: number;
    rejected_qty: number;
    discrepancy_reason: string | null;
    lot_code: string | null;
    expires_at: string | null;
    product: { name: string } | null;
    variant: { name: string; sku: string } | null;
  }>;
}

const DISCREPANCY_REASONS = [
  ["", "Sem divergência"],
  ["lower_qty", "Quantidade inferior"],
  ["higher_qty", "Quantidade superior"],
  ["wrong_product", "Produto incorreto"],
  ["damaged_product", "Produto danificado / avariado"],
  ["divergent_lot", "Lote divergente"],
  ["invalid_expiry", "Validade inadequada"],
  ["other", "Outro motivo"],
] as const;

export function AdminGoodsReceiptsPanel(props: {
  initialSku?: string;
  onConfirmed?: () => Promise<void> | void;
}) {
  const [filterTab, setFilterTab] = createSignal("all");
  const [formOpen, setFormOpen] = createSignal(false);
  const [supplierId, setSupplierId] = createSignal<string>("");
  const [newSupplierName, setNewSupplierName] = createSignal("");
  const [invoiceNumber, setInvoiceNumber] = createSignal("");
  const [purchaseRef, setPurchaseRef] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [skuSearch, setSkuSearch] = createSignal(props.initialSku ?? "");
  const [items, setItems] = createSignal<ReceiptItemDraft[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [feedback, setFeedback] = createSignal<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const [suppliers, { refetch: refetchSuppliers }] = createResource(
    async () => {
      const res = await api<{ data: Array<{ id: number; name: string }> }>(
        "/admin/suppliers",
      );
      return res.data ?? [];
    },
  );

  const [receipts, { refetch: refetchReceipts }] = createResource(
    filterTab,
    async (tab) => {
      if (tab === "lots") return [];
      const qs = new URLSearchParams();
      if (tab === "checking") qs.set("status", "checking");
      if (tab === "discrepancy") qs.set("discrepancy_only", "1");
      if (tab === "completed") qs.set("status", "completed");
      const res = await api<{ data: ReceiptRow[] }>(
        `/admin/goods-receipts?${qs.toString()}`,
      );
      return res.data ?? [];
    },
  );

  const [lotSummary, { refetch: refetchLots }] = createResource(
    filterTab,
    async (tab) => {
      if (tab !== "lots") return null;
      const res = await api<{
        data: {
          counts: {
            expired: number;
            expiring_30d: number;
            expiring_60d: number;
            expiring_90d: number;
          };
          lots: Array<{
            id: number;
            lot_code: string;
            product_name: string;
            variant_name: string;
            sku: string;
            remaining_qty: number;
            expires_at: string | null;
            expiry_status: string;
          }>;
        };
      }>("/admin/inventory/lots");
      return res.data;
    },
  );

  const [variantResults] = createResource(skuSearch, async (q) => {
    if (!q.trim()) return [];
    const res = await api<{
      data: Array<{
        variant_id: number;
        product_name: string;
        name: string;
        sku: string;
      }>;
    }>(`/admin/variants/bulk?search=${encodeURIComponent(q.trim())}`);
    return res.data ?? [];
  });

  onMount(() => {
    if (props.initialSku && props.initialSku.trim() !== "") {
      setFormOpen(true);
      void api<{
        data: Array<{
          variant_id: number;
          product_name: string;
          name: string;
          sku: string;
        }>;
      }>(`/admin/variants/bulk?search=${encodeURIComponent(props.initialSku)}`)
        .then((res) => {
          const match = (res.data ?? [])[0];
          if (match) addVariantLine(match);
        })
        .catch(() => {});
    }
  });

  function addVariantLine(v: {
    variant_id: number;
    product_name: string;
    name: string;
    sku: string;
  }) {
    setItems((prev) => {
      if (prev.some((i) => i.product_variant_id === v.variant_id)) return prev;
      return [
        ...prev,
        {
          product_variant_id: v.variant_id,
          product_name: v.product_name,
          variant_name: v.name,
          sku: v.sku,
          expected_qty: 10,
          received_qty: 10,
          accepted_qty: 10,
          discrepancy_reason: "",
          discrepancy_notes: "",
          lot_code: "",
          expires_at: "",
        },
      ];
    });
    setSkuSearch("");
  }

  function updateItem<K extends keyof ReceiptItemDraft>(
    idx: number,
    key: K,
    value: ReceiptItemDraft[K],
  ) {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [key]: value } : item)),
    );
  }

  async function saveReceipt(confirmNow: boolean) {
    if (items().length === 0) return;
    setBusy(true);
    setFeedback(null);
    try {
      const created = await api<{ data: ReceiptRow }>("/admin/goods-receipts", {
        method: "POST",
        body: {
          supplier_id: supplierId() ? Number(supplierId()) : null,
          new_supplier_name: newSupplierName().trim() || undefined,
          invoice_number: invoiceNumber().trim() || undefined,
          purchase_reference: purchaseRef().trim() || undefined,
          notes: notes().trim() || undefined,
          items: items().map((i) => ({
            product_variant_id: i.product_variant_id,
            expected_qty: i.expected_qty,
            received_qty: i.received_qty,
            accepted_qty: i.accepted_qty,
            discrepancy_reason: i.discrepancy_reason || undefined,
            discrepancy_notes: i.discrepancy_notes || undefined,
            lot_code: i.lot_code || undefined,
            expires_at: i.expires_at || undefined,
          })),
        },
      });

      if (confirmNow) {
        await api(`/admin/goods-receipts/${created.data.id}/confirm`, {
          method: "POST",
        });
        setFeedback({
          type: "ok",
          text: `Recebimento ${created.data.receipt_number} confirmado! Estoque e rastreabilidade atualizados.`,
        });
      } else {
        setFeedback({
          type: "ok",
          text: `Recebimento ${created.data.receipt_number} salvo em conferência.`,
        });
      }

      setFormOpen(false);
      setItems([]);
      setInvoiceNumber("");
      setPurchaseRef("");
      setNewSupplierName("");
      setNotes("");
      await Promise.all([refetchReceipts(), refetchSuppliers()]);
      if (props.onConfirmed) await props.onConfirmed();
    } catch (err) {
      setFeedback({
        type: "err",
        text:
          err instanceof ApiError
            ? err.message
            : "Erro ao registrar recebimento.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function confirmExisting(receiptId: number) {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await api<{ data: ReceiptRow }>(
        `/admin/goods-receipts/${receiptId}/confirm`,
        { method: "POST" },
      );
      setFeedback({
        type: "ok",
        text: `Entrada ${res.data.receipt_number} confirmada no estoque e avisos de reposição acionados quando aplicável.`,
      });
      await Promise.all([refetchReceipts(), refetchLots()]);
      if (props.onConfirmed) await props.onConfirmed();
    } catch (err) {
      setFeedback({
        type: "err",
        text:
          err instanceof ApiError
            ? err.message
            : "Não foi possível confirmar recebimento.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4">
        <div class="flex flex-wrap gap-1.5">
          <For
            each={
              [
                ["all", "Recentes"],
                ["checking", "Pendentes / Conferência"],
                ["discrepancy", "Com divergência"],
                ["completed", "Concluídos"],
                ["lots", "Lotes & Vencimentos"],
              ] as const
            }
          >
            {([key, label]) => (
              <button
                type="button"
                onClick={() => setFilterTab(key)}
                class={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                  filterTab() === key
                    ? "bg-[#93509e] text-white"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                }`}
              >
                {label}
              </button>
            )}
          </For>
        </div>

        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          class="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#93509e] px-4 text-xs font-bold text-white hover:bg-[#7c3f87]"
        >
          <Plus class="size-4" />
          Registrar recebimento
        </button>
      </div>

      <Show when={feedback()}>
        {(fb) => (
          <p
            role="status"
            class={`rounded-xl px-4 py-2.5 text-xs font-bold ${
              fb().type === "ok"
                ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {fb().text}
          </p>
        )}
      </Show>

      <Show when={formOpen()}>
        <div class="space-y-4 rounded-xl border border-[#DFC2E3] bg-[#FCF8FD] p-5">
          <h3 class="text-sm font-extrabold text-[#2E0C49]">
            Nova Conferência / Entrada de Mercadorias
          </h3>

          <div class="grid gap-3 sm:grid-cols-4 text-xs">
            <div>
              <label class="font-bold text-zinc-700">Fornecedor</label>
              <select
                value={supplierId()}
                onChange={(e) => setSupplierId(e.currentTarget.value)}
                class="mt-1 h-9 w-full rounded border border-zinc-300 bg-white px-2.5"
              >
                <option value="">Selecionar ou cadastrar novo...</option>
                <For each={suppliers() ?? []}>
                  {(s) => <option value={s.id}>{s.name}</option>}
                </For>
              </select>
            </div>
            <div>
              <label class="font-bold text-zinc-700">Ou novo fornecedor</label>
              <input
                type="text"
                placeholder="Nome do fornecedor"
                value={newSupplierName()}
                onInput={(e) => setNewSupplierName(e.currentTarget.value)}
                class="mt-1 h-9 w-full rounded border border-zinc-300 bg-white px-2.5"
              />
            </div>
            <div>
              <label class="font-bold text-zinc-700">Nota Fiscal</label>
              <input
                type="text"
                placeholder="Ex.: NF-001234"
                value={invoiceNumber()}
                onInput={(e) => setInvoiceNumber(e.currentTarget.value)}
                class="mt-1 h-9 w-full rounded border border-zinc-300 bg-white px-2.5"
              />
            </div>
            <div>
              <label class="font-bold text-zinc-700">Pedido / Referência</label>
              <input
                type="text"
                placeholder="Ex.: PO-2026-11"
                value={purchaseRef()}
                onInput={(e) => setPurchaseRef(e.currentTarget.value)}
                class="mt-1 h-9 w-full rounded border border-zinc-300 bg-white px-2.5"
              />
            </div>
          </div>

          {/* Search SKU */}
          <div class="relative">
            <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              placeholder="Adicionar item por SKU, produto ou tonalidade..."
              value={skuSearch()}
              onInput={(e) => setSkuSearch(e.currentTarget.value)}
              class="h-10 w-full rounded-lg border border-zinc-300 bg-white pl-9 pr-3 text-xs"
            />
            <Show when={(variantResults()?.length ?? 0) > 0}>
              <div class="mt-1 max-h-40 divide-y divide-zinc-100 overflow-y-auto rounded-lg border border-[#DFC2E3] bg-white shadow-md text-xs">
                <For each={variantResults() ?? []}>
                  {(v) => (
                    <button
                      type="button"
                      onClick={() => addVariantLine(v)}
                      class="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-[#FCF8FD]"
                    >
                      <span>
                        <strong>{v.product_name}</strong> — {v.name}
                      </span>
                      <span class="font-mono font-bold text-[#93509e]">
                        + {v.sku}
                      </span>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>

          <Show when={items().length > 0}>
            <div class="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
              <table class="w-full min-w-[760px] text-left text-xs">
                <thead class="border-b border-zinc-200 bg-zinc-50 text-[11px] text-zinc-500">
                  <tr>
                    <th class="p-2">SKU / Produto</th>
                    <th class="p-2">Esperado</th>
                    <th class="p-2">Chegou</th>
                    <th class="p-2">Aceito (Vendável)</th>
                    <th class="p-2">Motivo divergência</th>
                    <th class="p-2">Lote</th>
                    <th class="p-2">Validade</th>
                    <th class="p-2" aria-label="Remover item" />
                  </tr>
                </thead>
                <tbody class="divide-y divide-zinc-100">
                  <For each={items()}>
                    {(item, idx) => (
                      <tr>
                        <td class="p-2">
                          <p class="font-bold text-zinc-900">
                            {item.product_name}
                          </p>
                          <p class="text-[11px] text-zinc-500">
                            {item.variant_name} ({item.sku})
                          </p>
                        </td>
                        <td class="p-2 w-20">
                          <input
                            type="number"
                            min={0}
                            value={item.expected_qty ?? 0}
                            onInput={(e) =>
                              updateItem(
                                idx(),
                                "expected_qty",
                                Number(e.currentTarget.value || 0),
                              )
                            }
                            class="h-8 w-full rounded border border-zinc-300 px-1.5 text-center"
                          />
                        </td>
                        <td class="p-2 w-20">
                          <input
                            type="number"
                            min={0}
                            value={item.received_qty}
                            onInput={(e) => {
                              const val = Number(e.currentTarget.value || 0);
                              updateItem(idx(), "received_qty", val);
                              if (item.accepted_qty > val) {
                                updateItem(idx(), "accepted_qty", val);
                              }
                            }}
                            class="h-8 w-full rounded border border-zinc-300 px-1.5 text-center"
                          />
                        </td>
                        <td class="p-2 w-24">
                          <input
                            type="number"
                            min={0}
                            max={item.received_qty}
                            value={item.accepted_qty}
                            onInput={(e) =>
                              updateItem(
                                idx(),
                                "accepted_qty",
                                Number(e.currentTarget.value || 0),
                              )
                            }
                            class="h-8 w-full rounded border border-zinc-300 px-1.5 text-center font-bold text-emerald-700"
                          />
                        </td>
                        <td class="p-2">
                          <select
                            value={item.discrepancy_reason}
                            onChange={(e) =>
                              updateItem(
                                idx(),
                                "discrepancy_reason",
                                e.currentTarget.value,
                              )
                            }
                            class="h-8 rounded border border-zinc-300 bg-white px-2 text-[11px]"
                          >
                            <For each={DISCREPANCY_REASONS}>
                              {([val, label]) => (
                                <option value={val}>{label}</option>
                              )}
                            </For>
                          </select>
                        </td>
                        <td class="p-2 w-28">
                          <input
                            type="text"
                            placeholder="Ex.: LT26"
                            value={item.lot_code}
                            onInput={(e) =>
                              updateItem(
                                idx(),
                                "lot_code",
                                e.currentTarget.value,
                              )
                            }
                            class="h-8 w-full rounded border border-zinc-300 px-2"
                          />
                        </td>
                        <td class="p-2 w-32">
                          <input
                            type="date"
                            value={item.expires_at}
                            onInput={(e) =>
                              updateItem(
                                idx(),
                                "expires_at",
                                e.currentTarget.value,
                              )
                            }
                            class="h-8 w-full rounded border border-zinc-300 px-1.5 text-[11px]"
                          />
                        </td>
                        <td class="p-2 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setItems((prev) =>
                                prev.filter((_, i) => i !== idx()),
                              )
                            }
                            class="text-zinc-400 hover:text-red-600"
                          >
                            <Trash2 class="size-3.5" />
                          </button>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>

          <textarea
            rows={2}
            placeholder="Observações da conferência..."
            value={notes()}
            onInput={(e) => setNotes(e.currentTarget.value)}
            class="w-full rounded-lg border border-zinc-300 bg-white p-2.5 text-xs"
          />

          <div class="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              class="h-9 rounded-lg border border-zinc-300 bg-white px-4 text-xs font-semibold"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={items().length === 0 || busy()}
              onClick={() => void saveReceipt(false)}
              class="h-9 rounded-lg border border-[#93509e] bg-white px-4 text-xs font-bold text-[#93509e]"
            >
              Salvar rascunho/conferência
            </button>
            <button
              type="button"
              disabled={items().length === 0 || busy()}
              onClick={() => void saveReceipt(true)}
              class="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#93509e] px-5 text-xs font-bold text-white hover:bg-[#7c3f87]"
            >
              <PackageCheck class="size-4" />
              Confirmar entrada no estoque
            </button>
          </div>
        </div>
      </Show>

      {/* Lots & Expiry View */}
      <Show when={filterTab() === "lots" && lotSummary()}>
        {(lotsData) => (
          <div class="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
            <div class="grid gap-3 sm:grid-cols-4">
              <div class="rounded-lg border border-red-200 bg-red-50 p-3">
                <p class="text-[11px] font-bold text-red-700">Vencidos</p>
                <p class="text-xl font-black text-red-900">
                  {lotsData().counts.expired}
                </p>
              </div>
              <div class="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p class="text-[11px] font-bold text-amber-800">
                  Vencem em 30d
                </p>
                <p class="text-xl font-black text-amber-900">
                  {lotsData().counts.expiring_30d}
                </p>
              </div>
              <div class="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                <p class="text-[11px] font-bold text-yellow-800">
                  Vencem em 60d
                </p>
                <p class="text-xl font-black text-yellow-900">
                  {lotsData().counts.expiring_60d}
                </p>
              </div>
              <div class="rounded-lg border border-purple-200 bg-purple-50 p-3">
                <p class="text-[11px] font-bold text-[#93509e]">
                  Vencem em 90d
                </p>
                <p class="text-xl font-black text-[#2E0C49]">
                  {lotsData().counts.expiring_90d}
                </p>
              </div>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="border-b border-zinc-100 text-zinc-400">
                  <tr>
                    <th class="py-2 pr-3">Lote</th>
                    <th class="py-2 pr-3">Produto / Cor</th>
                    <th class="py-2 pr-3">SKU</th>
                    <th class="py-2 pr-3 text-right">Saldo Lote</th>
                    <th class="py-2 text-right">Validade</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-zinc-100">
                  <For each={lotsData().lots}>
                    {(lot) => (
                      <tr>
                        <td class="py-2 pr-3 font-mono font-bold text-zinc-900">
                          {lot.lot_code}
                        </td>
                        <td class="py-2 pr-3">
                          {lot.product_name} — {lot.variant_name}
                        </td>
                        <td class="py-2 pr-3 font-mono">{lot.sku}</td>
                        <td class="py-2 pr-3 text-right font-bold">
                          {lot.remaining_qty} un.
                        </td>
                        <td class="py-2 text-right">
                          <span
                            class={`rounded px-2 py-0.5 text-[10px] font-bold ${
                              lot.expiry_status === "expired"
                                ? "bg-red-100 text-red-800"
                                : lot.expiry_status === "expiring_30"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-zinc-100 text-zinc-700"
                            }`}
                          >
                            {lot.expires_at || "Sem validade"}
                          </span>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Show>

      {/* Receipts List */}
      <Show when={filterTab() !== "lots"}>
        <div class="space-y-3">
          <For each={receipts() ?? []}>
            {(rec) => (
              <div class="rounded-xl border border-zinc-200 bg-white p-4">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="font-bold text-zinc-900">
                        {rec.receipt_number}
                      </span>
                      <span
                        class={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                          rec.status === "completed"
                            ? "bg-emerald-50 text-emerald-700"
                            : rec.has_discrepancy
                              ? "bg-amber-50 text-amber-800"
                              : "bg-zinc-100 text-zinc-700"
                        }`}
                      >
                        <Show
                          when={rec.status === "completed"}
                          fallback={<AlertTriangle class="size-3" />}
                        >
                          <CheckCircle2 class="size-3" />
                        </Show>
                        {rec.status === "completed"
                          ? "Finalizado"
                          : rec.has_discrepancy
                            ? "Com divergência"
                            : "Em conferência"}
                      </span>
                    </div>
                    <p class="mt-0.5 text-xs text-zinc-500">
                      Fornecedor: {rec.supplier?.name || "N/I"}{" "}
                      <Show when={rec.invoice_number}>
                        • NF {rec.invoice_number}
                      </Show>{" "}
                      • Por {rec.received_by?.name || "Equipe"}
                    </p>
                  </div>

                  <Show
                    when={
                      rec.status !== "completed" && rec.status !== "cancelled"
                    }
                  >
                    <button
                      type="button"
                      disabled={busy()}
                      onClick={() => void confirmExisting(rec.id)}
                      class="h-8 rounded-lg bg-[#93509e] px-3.5 text-xs font-bold text-white hover:bg-[#7c3f87]"
                    >
                      Confirmar entrada no estoque
                    </button>
                  </Show>
                </div>

                <ul class="mt-3 divide-y divide-zinc-100 border-t border-zinc-100 pt-2 text-xs">
                  <For each={rec.items}>
                    {(item) => (
                      <li class="flex flex-wrap items-center justify-between gap-2 py-1.5">
                        <span>
                          <strong>{item.product?.name}</strong> —{" "}
                          {item.variant?.name} ({item.sku_snapshot})
                          <Show when={item.lot_code}>
                            {" "}
                            • Lote {item.lot_code}
                          </Show>
                        </span>
                        <span class="text-zinc-600">
                          Aceito:{" "}
                          <strong class="text-emerald-700">
                            +{item.accepted_qty}
                          </strong>
                          <Show when={item.rejected_qty > 0}>
                            {" "}
                            • Avariado/Recusado:{" "}
                            <strong class="text-red-700">
                              {item.rejected_qty}
                            </strong>
                          </Show>
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
