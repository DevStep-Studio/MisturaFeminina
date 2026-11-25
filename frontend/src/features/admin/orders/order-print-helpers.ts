export interface CarrierDetectionResult {
  type: "SEDEX" | "PAC" | "CORREIOS" | "OTHER";
  label: string;
  logoUrl?: string;
}

export function detectCarrier(
  service?: {
    carrier?: string | null;
    service_name?: string | null;
    service_code?: string | null;
    provider?: string | null;
  } | null,
  shipment?: {
    carrier?: string | null;
    service_name?: string | null;
    service_code?: string | null;
  } | null,
): CarrierDetectionResult {
  const text = [
    shipment?.service_name,
    shipment?.carrier,
    service?.service_name,
    service?.carrier,
    service?.service_code,
    service?.provider,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\bsedex\b/i.test(text)) {
    return { type: "SEDEX", label: "SEDEX", logoUrl: "/carriers/sedex.svg" };
  }
  if (/\bpac\b/i.test(text)) {
    return { type: "PAC", label: "PAC", logoUrl: "/carriers/pac.svg" };
  }
  if (/\bcorreios\b/i.test(text)) {
    return {
      type: "CORREIOS",
      label: "Correios",
      logoUrl: "/carriers/correios.svg",
    };
  }
  if (text.includes("retirada") || text.includes("pickup")) {
    return { type: "OTHER", label: "Retirada na Loja" };
  }
  const fallback =
    shipment?.service_name ||
    service?.service_name ||
    shipment?.carrier ||
    service?.carrier ||
    "Transportadora";
  return { type: "OTHER", label: fallback };
}

export function formatCep(raw?: string | null): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 8) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }
  return raw;
}

export function validateShippingAddress(address?: {
  street?: string | null;
  number?: string | null;
  city?: string | null;
  state?: string | null;
  cep?: string | null;
} | null): { valid: boolean; message: string } {
  if (!address) {
    return { valid: false, message: "Endereço de entrega não disponível." };
  }
  const cleanCep = (address.cep || "").replace(/\D/g, "");
  if (!cleanCep || cleanCep.length !== 8) {
    return {
      valid: false,
      message: "O endereço de entrega deste pedido está sem CEP válido.",
    };
  }
  if (!address.street || !address.number || !address.city || !address.state) {
    return {
      valid: false,
      message: "O endereço de entrega possui campos essenciais ausentes.",
    };
  }
  return { valid: true, message: "" };
}
