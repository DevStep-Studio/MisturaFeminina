import { Show, createMemo, createSignal, onMount } from "solid-js";
import ExternalLink from "lucide-solid/icons/external-link";
import FileText from "lucide-solid/icons/file-text";
import Printer from "lucide-solid/icons/printer";
import SquareCheck from "lucide-solid/icons/square-check";
import SquarePen from "lucide-solid/icons/square-pen";
import Tag from "lucide-solid/icons/tag";
import TriangleAlert from "lucide-solid/icons/triangle-exclamation-point";
import X from "lucide-solid/icons/x";
import { api, ApiError } from "../../../lib/api";
import {
  type CarrierDetectionResult,
  detectCarrier,
  formatCep,
  validateShippingAddress,
} from "./order-print-helpers";

export type { CarrierDetectionResult };
export { detectCarrier, formatCep, validateShippingAddress };

export interface PackingListItem {
  id: number;
  sku: string;
  sku_snapshot?: string | null;
  product_name: string;
  product_name_snapshot?: string | null;
  variant_name: string;
  variant_name_snapshot?: string | null;
  quantity: number | null;
  weight_grams?: number | null;
}

export interface PackingListAddress {
  recipient_name: string;
  street: string;
  number: string;
  complement?: string | null;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
}

export interface PackingListSender {
  store_name: string;
  address: string;
  city: string;
  state: string;
  cep: string;
}

export interface PackingListShipment {
  carrier?: string | null;
  service_name?: string | null;
  service_code?: string | null;
  tracking_code?: string | null;
  label_url?: string | null;
  label_status?: string | null;
}

export interface PackingListPayload {
  id: number;
  order_number: string;
  status: string;
  created_at: string;
  customer_name: string;
  customer_phone?: string | null;
  shipping_address: PackingListAddress;
  sender: PackingListSender;
  shipping_service?: {
    carrier?: string;
    service_name?: string;
    service_code?: string;
    provider?: string;
    price_cents?: number;
  } | null;
  shipment?: PackingListShipment | null;
  items: PackingListItem[];
  total_units: number;
  notes_customer?: string | null;
}

interface OrderPrintModalProps {
  orderId: number;
  initialMode?: "label" | "packing_slip";
  onClose: () => void;
}

export function OrderPrintModal(props: OrderPrintModalProps) {
  const [activeTab, setActiveTab] = createSignal<"label" | "packing_slip">(
    props.initialMode || "label",
  );
  const [paperFormat, setPaperFormat] = createSignal<"thermal" | "a4">(
    "thermal",
  );
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [orderData, setOrderData] = createSignal<PackingListPayload | null>(
    null,
  );

  // Address edit state
  const [isEditingAddress, setIsEditingAddress] = createSignal(false);
  const [editRecipient, setEditRecipient] = createSignal("");
  const [editStreet, setEditStreet] = createSignal("");
  const [editNumber, setEditNumber] = createSignal("");
  const [editComplement, setEditComplement] = createSignal("");
  const [editNeighborhood, setEditNeighborhood] = createSignal("");
  const [editCity, setEditCity] = createSignal("");
  const [editState, setEditState] = createSignal("");
  const [editCep, setEditCep] = createSignal("");
  const [saveAddressBusy, setSaveAddressBusy] = createSignal(false);
  const [saveAddressError, setSaveAddressError] = createSignal<string | null>(
    null,
  );

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ data: PackingListPayload }>(
        `/admin/orders/${props.orderId}/packing-list`,
      );
      setOrderData(res.data);
      // populate edit form
      const addr = res.data.shipping_address;
      setEditRecipient(addr?.recipient_name || res.data.customer_name || "");
      setEditStreet(addr?.street || "");
      setEditNumber(addr?.number || "");
      setEditComplement(addr?.complement || "");
      setEditNeighborhood(addr?.neighborhood || "");
      setEditCity(addr?.city || "");
      setEditState(addr?.state || "");
      setEditCep(addr?.cep || "");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Erro ao carregar dados do pedido para impressão.",
      );
    } finally {
      setLoading(false);
    }
  }

  onMount(() => {
    loadData();
  });

  const carrierInfo = createMemo<CarrierDetectionResult>(() => {
    const d = orderData();
    if (!d) return { type: "OTHER", label: "Transportadora", logoUrl: undefined };
    return detectCarrier(d.shipping_service, d.shipment);
  });

  const addressValidation = createMemo(() => {
    return validateShippingAddress(orderData()?.shipping_address);
  });

  async function handleSaveAddress(e: Event) {
    e.preventDefault();
    setSaveAddressBusy(true);
    setSaveAddressError(null);
    try {
      await api(`/admin/orders/${props.orderId}/shipping-address`, {
        method: "PATCH",
        body: JSON.stringify({
          recipient_name: editRecipient().trim(),
          street: editStreet().trim(),
          number: editNumber().trim(),
          complement: editComplement().trim() || null,
          neighborhood: editNeighborhood().trim(),
          city: editCity().trim(),
          state: editState().trim().toUpperCase(),
          cep: editCep().trim(),
        }),
      });
      setIsEditingAddress(false);
      await loadData();
    } catch (err) {
      setSaveAddressError(
        err instanceof ApiError ? err.message : "Erro ao atualizar endereço.",
      );
    } finally {
      setSaveAddressBusy(false);
    }
  }

  function handlePrint() {
    const d = orderData();
    if (!d) return;

    if (activeTab() === "label") {
      printLabelDocument(d, paperFormat(), carrierInfo());
    } else {
      printPackingSlipDocument(d);
    }
  }

  function printLabelDocument(
    data: PackingListPayload,
    format: "thermal" | "a4",
    carrier: { type: string; label: string; logoUrl?: string },
  ) {
    const w = window.open("", "_blank", "width=850,height=900");
    if (!w) return;

    const addr = data.shipping_address;
    const sender = data.sender;
    const recipientName = addr.recipient_name || data.customer_name;
    const lineAddress = `${addr.street}, ${addr.number}`;
    const lineComplementAndNeighborhood = [addr.complement, addr.neighborhood]
      .filter(Boolean)
      .join(" - ");
    const lineCityState = `${addr.city} / ${addr.state}`;
    const formattedCep = formatCep(addr.cep);
    const tracking = data.shipment?.tracking_code;

    const carrierLogoHtml = carrier.logoUrl
      ? `<img src="${carrier.logoUrl}" alt="${carrier.label}" class="carrier-logo" />`
      : `<div class="carrier-badge">${carrier.label}</div>`;

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Etiqueta ${data.order_number}</title>
  <style>
    @page {
      ${
        format === "thermal"
          ? "size: 100mm 150mm; margin: 0;"
          : "size: A4 portrait; margin: 15mm;"
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: ${format === "a4" ? "#f4f4f5" : "#ffffff"};
      color: #000000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page-container {
      ${
        format === "a4"
          ? "display: flex; justify-content: center; align-items: flex-start; padding-top: 10mm;"
          : "width: 100mm; height: 150mm; padding: 5mm;"
      }
    }
    .label-box {
      width: 100mm;
      height: 150mm;
      background: #ffffff;
      border: ${format === "a4" ? "1.5px dashed #71717a" : "1.5px solid #000000"};
      padding: 5mm 6mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
    }
    ${
      format === "a4"
        ? `
    .cut-guide {
      position: absolute;
      top: -18px;
      left: 0;
      font-size: 10px;
      color: #71717a;
      letter-spacing: 0.5px;
    }
    `
        : ""
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #000000;
      padding-bottom: 3.5mm;
      margin-bottom: 3.5mm;
    }
    .brand-logo {
      height: 28px;
      max-width: 130px;
      object-fit: contain;
    }
    .carrier-logo {
      height: 28px;
      max-width: 100px;
      object-fit: contain;
    }
    .carrier-badge {
      border: 1.5px solid #000000;
      padding: 3px 8px;
      font-size: 13px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .section-title {
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 1.5px;
      color: #000000;
      margin-bottom: 2mm;
      text-transform: uppercase;
    }
    .recipient-section {
      border-bottom: 1.5px solid #000000;
      padding-bottom: 4mm;
      margin-bottom: 4mm;
      flex: 1;
    }
    .recipient-name {
      font-size: 15px;
      font-weight: 900;
      line-height: 1.25;
      margin-bottom: 2.5mm;
      word-break: break-word;
    }
    .address-line {
      font-size: 13px;
      line-height: 1.35;
      font-weight: 600;
      color: #111111;
      word-break: break-word;
    }
    .cep-box {
      margin-top: 3.5mm;
      display: inline-block;
      border: 1.5px solid #000000;
      padding: 3px 8px;
      font-size: 16px;
      font-weight: 900;
      letter-spacing: 1px;
    }
    .sender-section {
      border-bottom: 1px solid #71717a;
      padding-bottom: 3mm;
      margin-bottom: 3mm;
    }
    .sender-text {
      font-size: 10px;
      line-height: 1.35;
      color: #27272a;
    }
    .sender-name {
      font-weight: 700;
      color: #000000;
    }
    .footer-ref {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      font-weight: 600;
      color: #3f3f46;
    }
    @media print {
      body { background: transparent; }
      .page-container { padding: 0; }
      ${
        format === "thermal"
          ? ".label-box { border: none; padding: 4mm; width: 100mm; height: 150mm; }"
          : ""
      }
    }
  </style>
</head>
<body>
  <div class="page-container">
    <div class="label-box">
      ${format === "a4" ? '<div class="cut-guide">✂ Linha de corte da etiqueta (100 × 150 mm)</div>' : ""}
      
      <!-- Cabeçalho com Logos -->
      <div class="header">
        <img src="/logo-mf-dark.png" alt="Mistura Feminina" class="brand-logo" />
        ${carrierLogoHtml}
      </div>

      <!-- Destinatário -->
      <div class="recipient-section">
        <div class="section-title">DESTINATÁRIO</div>
        <div class="recipient-name">${recipientName}</div>
        <div class="address-line">${lineAddress}</div>
        ${lineComplementAndNeighborhood ? `<div class="address-line">${lineComplementAndNeighborhood}</div>` : ""}
        <div class="address-line">${lineCityState}</div>
        <div class="cep-box">CEP: ${formattedCep}</div>
      </div>

      <!-- Remetente -->
      <div class="sender-section">
        <div class="section-title">REMETENTE</div>
        <div class="sender-text"><span class="sender-name">${sender.store_name}</span></div>
        <div class="sender-text">${sender.address}</div>
        <div class="sender-text">${sender.city} / ${sender.state} — CEP: ${formatCep(sender.cep)}</div>
      </div>

      <!-- Referência do Pedido e Rastreio -->
      <div class="footer-ref">
        <span>Pedido: <strong>${data.order_number}</strong></span>
        ${tracking ? `<span>Rastreio: <strong>${tracking}</strong></span>` : `<span>Remessa Concluída</span>`}
      </div>
    </div>
  </div>
  <script>
    window.addEventListener('load', () => {
      setTimeout(() => {
        window.print();
      }, 300);
    });
  </script>
</body>
</html>`;

    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  function printPackingSlipDocument(data: PackingListPayload) {
    const w = window.open("", "_blank", "width=850,height=900");
    if (!w) return;

    const formattedDate = new Date(data.created_at).toLocaleDateString(
      "pt-BR",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      },
    );

    const rows = data.items
      .map((item, index) => {
        const skuText = item.sku || "SKU não informado";
        const isQtyMissing = item.quantity === null || item.quantity === 0;
        const qtyDisplay = isQtyMissing
          ? '<span style="color:#b91c1c; font-weight:bold;">Atenção: Qtd não informada</span>'
          : `<strong>${item.quantity} un.</strong>`;

        return `
        <tr>
          <td style="text-align: center; width: 50px;">
            <div style="width: 18px; height: 18px; border: 1.5px solid #52525b; border-radius: 3px; margin: 0 auto;"></div>
          </td>
          <td style="font-family: monospace; font-size: 12px; font-weight: 700; color: #18181b;">
            ${skuText}
          </td>
          <td>
            <div style="font-weight: 600; color: #18181b; font-size: 13px;">${item.product_name}</div>
            <div style="font-size: 12px; color: #52525b; margin-top: 2px;">Variação: ${item.variant_name || "Padrão"}</div>
          </td>
          <td style="text-align: right; font-size: 13px;">
            ${qtyDisplay}
          </td>
        </tr>
      `;
      })
      .join("");

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Romaneio de Separação - ${data.order_number}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 15mm;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #ffffff;
      color: #000000;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .header-box {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #000000;
      padding-bottom: 4mm;
      margin-bottom: 5mm;
    }
    .brand-logo {
      height: 34px;
      object-fit: contain;
    }
    .title-block {
      text-align: right;
    }
    .main-title {
      font-size: 18px;
      font-weight: 900;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: #000000;
    }
    .order-sub {
      font-size: 12px;
      color: #52525b;
      margin-top: 2px;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      background: #fafafa;
      border: 1px solid #e4e4e7;
      border-radius: 6px;
      padding: 10px 14px;
      margin-bottom: 6mm;
      font-size: 12px;
    }
    .meta-label {
      font-weight: 700;
      color: #52525b;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .meta-value {
      font-size: 13px;
      font-weight: 600;
      color: #18181b;
      margin-top: 2px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 6mm;
    }
    thead {
      display: table-header-group;
    }
    th {
      background: #f4f4f5;
      border-top: 1.5px solid #000000;
      border-bottom: 1.5px solid #000000;
      padding: 8px 10px;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #000000;
      text-align: left;
    }
    td {
      border-bottom: 1px solid #e4e4e7;
      padding: 10px;
      vertical-align: middle;
    }
    tr {
      page-break-inside: avoid;
    }
    .footer-summary {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-top: 4mm;
      border-top: 2px solid #000000;
      padding-top: 4mm;
    }
    .signature-box {
      font-size: 11px;
      color: #3f3f46;
      width: 60%;
    }
    .signature-line {
      border-bottom: 1px solid #71717a;
      width: 250px;
      margin-top: 20px;
      margin-bottom: 4px;
    }
    .total-box {
      text-align: right;
      font-size: 14px;
      font-weight: 800;
      color: #000000;
    }
    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="header-box">
    <img src="/logo-mf-dark.png" alt="Mistura Feminina" class="brand-logo" />
    <div class="title-block">
      <div class="main-title">Romaneio de Separação</div>
      <div class="order-sub">Pedido: <strong>${data.order_number}</strong> • Emissão: ${formattedDate}</div>
    </div>
  </div>

  <div class="meta-grid">
    <div>
      <div class="meta-label">Destinatário</div>
      <div class="meta-value">${data.shipping_address?.recipient_name || data.customer_name}</div>
      <div style="font-size: 11px; color: #52525b; margin-top: 1px;">
        ${data.shipping_address?.city} / ${data.shipping_address?.state} — CEP: ${formatCep(data.shipping_address?.cep)}
      </div>
    </div>
    <div>
      <div class="meta-label">Frete / Modalidade</div>
      <div class="meta-value">${data.shipping_service?.service_name || data.shipping_service?.carrier || "Envio Padrão"}</div>
      ${data.shipment?.tracking_code ? `<div style="font-size: 11px; color: #52525b; margin-top: 1px;">Rastreio: ${data.shipment.tracking_code}</div>` : ""}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="text-align: center; width: 50px;">Conferido</th>
        <th style="width: 140px;">SKU</th>
        <th>Produto e Variação</th>
        <th style="text-align: right; width: 100px;">Quantidade</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="footer-summary">
    <div class="signature-box">
      ${data.notes_customer ? `<div style="margin-bottom: 8px;"><strong>Obs. do Cliente:</strong> ${data.notes_customer}</div>` : ""}
      <div class="signature-line"></div>
      <div>Conferido por: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Data: ____/____/________</div>
    </div>
    <div class="total-box">
      Total de unidades: <span>${data.total_units} un.</span>
    </div>
  </div>

  <script>
    window.addEventListener('load', () => {
      setTimeout(() => {
        window.print();
      }, 300);
    });
  </script>
</body>
</html>`;

    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div class="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl">
        {/* Modal Header */}
        <div class="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <div class="flex items-center gap-3">
            <div class="flex size-10 items-center justify-center rounded-xl bg-purple-100 text-[#93509e]">
              <Printer class="size-5" />
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-lg font-bold text-zinc-900">
                  Impressão de Pedido
                </h3>
                <Show when={orderData()}>
                  <span class="rounded-md bg-purple-50 px-2 py-0.5 text-xs font-semibold text-[#93509e]">
                    {orderData()?.order_number}
                  </span>
                </Show>
              </div>
              <p class="text-xs text-zinc-500">
                Prévia exata para identificação de embalagem e separação
                logística
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            class="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X class="size-5" />
          </button>
        </div>

        {/* Action Tabs & Controls Bar */}
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 bg-zinc-50 px-6 py-2.5">
          <div class="flex items-center gap-1.5 rounded-xl bg-zinc-200/70 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("label")}
              class={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeTab() === "label"
                  ? "bg-white text-zinc-900 shadow-2xs"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              <Tag class="size-3.5" />
              Etiqueta de Endereço
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("packing_slip")}
              class={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeTab() === "packing_slip"
                  ? "bg-white text-zinc-900 shadow-2xs"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              <FileText class="size-3.5" />
              Romaneio de Separação
            </button>
          </div>

          <div class="flex items-center gap-2">
            {/* Format selector for label */}
            <Show when={activeTab() === "label"}>
              <div class="flex items-center gap-1 text-xs">
                <span class="text-zinc-500">Folha:</span>
                <select
                  value={paperFormat()}
                  onChange={(e) =>
                    setPaperFormat(e.currentTarget.value as "thermal" | "a4")
                  }
                  class="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 focus:outline-none focus:ring-1 focus:ring-[#93509e]"
                >
                  <option value="thermal">Térmica (100 × 150 mm)</option>
                  <option value="a4">Folha A4 (com guias)</option>
                </select>
              </div>
            </Show>

            {/* Official Carrier Label Link */}
            <Show when={orderData()?.shipment?.label_url}>
              <a
                href={orderData()?.shipment?.label_url!}
                target="_blank"
                rel="noreferrer"
                class="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-2xs hover:bg-zinc-50"
              >
                <ExternalLink class="size-3.5" />
                Imprimir etiqueta oficial
              </a>
            </Show>

            {/* Main Print Trigger */}
            <button
              type="button"
              onClick={handlePrint}
              disabled={loading() || !addressValidation().valid}
              class="inline-flex items-center gap-2 rounded-lg bg-[#93509e] px-4 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-[#7d3b88] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer class="size-3.5" />
              Imprimir agora
            </button>
          </div>
        </div>

        {/* Validation Warning if incomplete */}
        <Show when={!loading() && !addressValidation().valid}>
          <div class="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-6 py-2.5 text-xs text-amber-800">
            <div class="flex items-center gap-2 font-medium">
              <TriangleAlert class="size-4 shrink-0 text-amber-600" />
              <span>{addressValidation().message}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsEditingAddress(true)}
              class="inline-flex items-center gap-1.5 font-bold text-amber-900 underline hover:text-amber-950"
            >
              <SquarePen class="size-3" />
              Corrigir endereço do pedido
            </button>
          </div>
        </Show>

        {/* Modal Body / Preview Canvas */}
        <div class="flex-1 overflow-y-auto bg-zinc-100 p-6">
          <Show
            when={!loading()}
            fallback={
              <div class="flex h-64 flex-col items-center justify-center gap-3">
                <div class="size-8 animate-spin rounded-full border-2 border-[#93509e] border-t-transparent" />
                <p class="text-sm text-zinc-500">
                  Carregando dados da remessa e itens...
                </p>
              </div>
            }
          >
            <Show
              when={!error()}
              fallback={
                <div class="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
                  {error()}
                </div>
              }
            >
              {/* Tab 1: Etiqueta de Endereço */}
              <Show when={activeTab() === "label" && orderData()}>
                <div class="flex flex-col items-center">
                  <div class="mb-3 flex items-center justify-between w-[380px] text-xs text-zinc-500">
                    <span>Prévia em alta fidelidade (100 × 150 mm)</span>
                    <button
                      type="button"
                      onClick={() => setIsEditingAddress(true)}
                      class="flex items-center gap-1 font-semibold text-[#93509e] hover:underline"
                    >
                      <SquarePen class="size-3" />
                      Editar endereço
                    </button>
                  </div>

                  {/* 100x150 Label Simulated Container */}
                  <div class="relative flex h-[570px] w-[380px] flex-col justify-between rounded-sm border-2 border-zinc-900 bg-white p-5 shadow-lg select-none">
                    {/* Header */}
                    <div class="flex items-center justify-between border-b-2 border-zinc-900 pb-3">
                      <img
                        src="/logo-mf-dark.png"
                        alt="Mistura Feminina"
                        class="h-7 max-w-[130px] object-contain"
                      />
                      <Show
                        when={carrierInfo().logoUrl}
                        fallback={
                          <div class="rounded border-2 border-zinc-900 px-2.5 py-1 text-xs font-black uppercase tracking-wider text-zinc-900">
                            {carrierInfo().label}
                          </div>
                        }
                      >
                        {(logo) => (
                          <img
                            src={logo()}
                            alt={carrierInfo().label}
                            class="h-7 max-w-[100px] object-contain"
                          />
                        )}
                      </Show>
                    </div>

                    {/* Destinatário */}
                    <div class="flex-1 border-b-2 border-zinc-900 py-3.5">
                      <div class="text-[10px] font-black uppercase tracking-widest text-zinc-900">
                        DESTINATÁRIO
                      </div>
                      <div class="mt-1 text-base font-black leading-tight text-zinc-950 break-words">
                        {orderData()?.shipping_address?.recipient_name ||
                          orderData()?.customer_name}
                      </div>
                      <div class="mt-2 text-xs font-semibold leading-snug text-zinc-900">
                        {orderData()?.shipping_address?.street},{" "}
                        {orderData()?.shipping_address?.number}
                      </div>
                      <Show when={orderData()?.shipping_address?.complement}>
                        <div class="text-xs font-semibold leading-snug text-zinc-900">
                          {orderData()?.shipping_address?.complement}
                        </div>
                      </Show>
                      <div class="text-xs font-semibold leading-snug text-zinc-900">
                        {orderData()?.shipping_address?.neighborhood}
                      </div>
                      <div class="text-xs font-semibold leading-snug text-zinc-900">
                        {orderData()?.shipping_address?.city} /{" "}
                        {orderData()?.shipping_address?.state}
                      </div>
                      <div class="mt-3 inline-block rounded border-2 border-zinc-900 px-2.5 py-1 text-sm font-black tracking-wider text-zinc-950">
                        CEP: {formatCep(orderData()?.shipping_address?.cep)}
                      </div>
                    </div>

                    {/* Remetente */}
                    <div class="border-b border-zinc-400 py-2.5 text-[11px] leading-tight text-zinc-800">
                      <div class="text-[9px] font-black uppercase tracking-wider text-zinc-900">
                        REMETENTE
                      </div>
                      <div class="mt-0.5 font-bold text-zinc-950">
                        {orderData()?.sender.store_name}
                      </div>
                      <div>{orderData()?.sender.address}</div>
                      <div>
                        {orderData()?.sender.city} / {orderData()?.sender.state}{" "}
                        — CEP: {formatCep(orderData()?.sender.cep)}
                      </div>
                    </div>

                    {/* Discreet Order Ref */}
                    <div class="flex items-center justify-between pt-2 text-[10px] font-semibold text-zinc-600">
                      <span>
                        Pedido: <strong>{orderData()?.order_number}</strong>
                      </span>
                      <Show
                        when={orderData()?.shipment?.tracking_code}
                        fallback={<span>Remessa Concluída</span>}
                      >
                        <span>
                          Rastreio:{" "}
                          <strong>
                            {orderData()?.shipment?.tracking_code}
                          </strong>
                        </span>
                      </Show>
                    </div>
                  </div>
                </div>
              </Show>

              {/* Tab 2: Romaneio de Separação */}
              <Show when={activeTab() === "packing_slip" && orderData()}>
                <div class="mx-auto max-w-3xl rounded-xl border border-zinc-300 bg-white p-8 shadow-sm">
                  {/* Romaneio Header */}
                  <div class="flex items-center justify-between border-b-2 border-zinc-900 pb-4">
                    <img
                      src="/logo-mf-dark.png"
                      alt="Mistura Feminina"
                      class="h-8 object-contain"
                    />
                    <div class="text-right">
                      <h4 class="text-base font-black uppercase tracking-wide text-zinc-950">
                        Romaneio de Separação
                      </h4>
                      <p class="text-xs text-zinc-500">
                        Pedido:{" "}
                        <strong class="text-zinc-800">
                          {orderData()?.order_number}
                        </strong>{" "}
                        • Emissão:{" "}
                        {new Date(
                          orderData()?.created_at || "",
                        ).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  </div>

                  {/* Destinatário & Frete info */}
                  <div class="mt-4 grid grid-cols-2 gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs">
                    <div>
                      <span class="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                        Destinatário
                      </span>
                      <p class="mt-0.5 font-bold text-zinc-900">
                        {orderData()?.shipping_address?.recipient_name ||
                          orderData()?.customer_name}
                      </p>
                      <p class="text-zinc-600">
                        {orderData()?.shipping_address?.city} /{" "}
                        {orderData()?.shipping_address?.state} — CEP:{" "}
                        {formatCep(orderData()?.shipping_address?.cep)}
                      </p>
                    </div>
                    <div>
                      <span class="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                        Modalidade de Envio
                      </span>
                      <p class="mt-0.5 font-bold text-zinc-900">
                        {orderData()?.shipping_service?.service_name ||
                          orderData()?.shipping_service?.carrier ||
                          "Envio Padrão"}
                      </p>
                      <Show when={orderData()?.shipment?.tracking_code}>
                        <p class="text-zinc-600">
                          Rastreio: {orderData()?.shipment?.tracking_code}
                        </p>
                      </Show>
                    </div>
                  </div>

                  {/* Products Table */}
                  <div class="mt-6 overflow-hidden rounded-lg border border-zinc-200">
                    <table class="w-full text-left text-xs">
                      <thead class="border-b border-zinc-200 bg-zinc-100 font-bold uppercase tracking-wider text-zinc-700">
                        <tr>
                          <th class="w-16 px-4 py-2.5 text-center">
                            Conferido
                          </th>
                          <th class="w-36 px-4 py-2.5">SKU</th>
                          <th class="px-4 py-2.5">Produto e Variação</th>
                          <th class="w-28 px-4 py-2.5 text-right">Qtd</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-zinc-200">
                        {orderData()?.items.map((item) => (
                          <tr class="hover:bg-zinc-50/50">
                            <td class="px-4 py-3 text-center">
                              <div class="mx-auto size-4.5 rounded border border-zinc-400" />
                            </td>
                            <td class="px-4 py-3 font-mono font-semibold text-zinc-800">
                              {item.sku || "SKU não informado"}
                            </td>
                            <td class="px-4 py-3">
                              <div class="font-bold text-zinc-900">
                                {item.product_name}
                              </div>
                              <div class="text-[11px] text-zinc-500">
                                Variação: {item.variant_name || "Padrão"}
                              </div>
                            </td>
                            <td class="px-4 py-3 text-right">
                              <Show
                                when={
                                  item.quantity !== null && item.quantity !== 0
                                }
                                fallback={
                                  <span class="font-bold text-red-600">
                                    Atenção: Qtd não informada
                                  </span>
                                }
                              >
                                <span class="font-bold text-zinc-900">
                                  {item.quantity} un.
                                </span>
                              </Show>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary & Sign-off Footer */}
                  <div class="mt-6 flex items-start justify-between border-t-2 border-zinc-900 pt-4 text-xs">
                    <div class="w-2/3">
                      <Show when={orderData()?.notes_customer}>
                        <p class="mb-3 text-zinc-600">
                          <strong>Observações do cliente:</strong>{" "}
                          {orderData()?.notes_customer}
                        </p>
                      </Show>
                      <div class="mt-6 w-64 border-b border-zinc-400 pb-1 text-zinc-500">
                        Conferido por:
                      </div>
                    </div>
                    <div class="text-right">
                      <span class="text-xs text-zinc-500">
                        Total de unidades:
                      </span>
                      <div class="text-lg font-black text-zinc-900">
                        {orderData()?.total_units} un.
                      </div>
                    </div>
                  </div>
                </div>
              </Show>
            </Show>
          </Show>
        </div>

        {/* Inline Address Edit Drawer / Overlay */}
        <Show when={isEditingAddress()}>
          <div class="absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
            <div class="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
              <div class="flex items-center justify-between border-b border-zinc-200 pb-3">
                <h4 class="text-base font-bold text-zinc-900">
                  Corrigir Endereço de Entrega
                </h4>
                <button
                  type="button"
                  onClick={() => setIsEditingAddress(false)}
                  class="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                >
                  <X class="size-4" />
                </button>
              </div>

              <Show when={saveAddressError()}>
                <div class="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                  {saveAddressError()}
                </div>
              </Show>

              <form onSubmit={handleSaveAddress} class="mt-4 space-y-3 text-xs">
                <div>
                  <label class="block font-semibold text-zinc-700">
                    Destinatário (Nome Completo)
                  </label>
                  <input
                    type="text"
                    value={editRecipient()}
                    onInput={(e) => setEditRecipient(e.currentTarget.value)}
                    required
                    class="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-1.5 focus:border-[#93509e] focus:outline-none"
                  />
                </div>

                <div class="grid grid-cols-3 gap-2">
                  <div class="col-span-2">
                    <label class="block font-semibold text-zinc-700">
                      Logradouro
                    </label>
                    <input
                      type="text"
                      value={editStreet()}
                      onInput={(e) => setEditStreet(e.currentTarget.value)}
                      required
                      class="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-1.5 focus:border-[#93509e] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label class="block font-semibold text-zinc-700">
                      Número
                    </label>
                    <input
                      type="text"
                      value={editNumber()}
                      onInput={(e) => setEditNumber(e.currentTarget.value)}
                      required
                      class="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-1.5 focus:border-[#93509e] focus:outline-none"
                    />
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="block font-semibold text-zinc-700">
                      Complemento (opcional)
                    </label>
                    <input
                      type="text"
                      value={editComplement()}
                      onInput={(e) => setEditComplement(e.currentTarget.value)}
                      placeholder="Apto, Sala, Bloco..."
                      class="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-1.5 focus:border-[#93509e] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label class="block font-semibold text-zinc-700">
                      Bairro
                    </label>
                    <input
                      type="text"
                      value={editNeighborhood()}
                      onInput={(e) =>
                        setEditNeighborhood(e.currentTarget.value)
                      }
                      class="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-1.5 focus:border-[#93509e] focus:outline-none"
                    />
                  </div>
                </div>

                <div class="grid grid-cols-3 gap-2">
                  <div class="col-span-1">
                    <label class="block font-semibold text-zinc-700">
                      CEP (00000-000)
                    </label>
                    <input
                      type="text"
                      value={editCep()}
                      onInput={(e) => setEditCep(e.currentTarget.value)}
                      required
                      placeholder="00000-000"
                      class="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-1.5 font-mono focus:border-[#93509e] focus:outline-none"
                    />
                  </div>
                  <div class="col-span-1">
                    <label class="block font-semibold text-zinc-700">
                      Cidade
                    </label>
                    <input
                      type="text"
                      value={editCity()}
                      onInput={(e) => setEditCity(e.currentTarget.value)}
                      required
                      class="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-1.5 focus:border-[#93509e] focus:outline-none"
                    />
                  </div>
                  <div class="col-span-1">
                    <label class="block font-semibold text-zinc-700">UF</label>
                    <input
                      type="text"
                      maxLength={2}
                      value={editState()}
                      onInput={(e) =>
                        setEditState(e.currentTarget.value.toUpperCase())
                      }
                      required
                      placeholder="SP"
                      class="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-1.5 uppercase focus:border-[#93509e] focus:outline-none"
                    />
                  </div>
                </div>

                <div class="mt-4 flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingAddress(false)}
                    class="rounded-lg border border-zinc-300 px-3 py-1.5 text-zinc-700 hover:bg-zinc-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saveAddressBusy()}
                    class="rounded-lg bg-[#93509e] px-4 py-1.5 font-semibold text-white hover:bg-[#7d3b88] disabled:opacity-50"
                  >
                    {saveAddressBusy() ? "Salvando..." : "Salvar e Atualizar"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}
