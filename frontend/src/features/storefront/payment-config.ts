import { api } from "../../lib/api";
export interface AvailableProvider {
  id: "mercadopago" | "plupag" | "asaas";
  name: string;
  environment: string;
  public_key: string | null;
  methods: ("pix" | "credit_card" | "boleto")[];
}

export interface PaymentConfig {
  enabled: boolean;
  provider: "mercadopago" | "plupag" | "asaas";
  environment: string;
  public_key: string | null;
  plupag_public_key?: string | null;
  available_providers?: AvailableProvider[];
}
export async function paymentConfig() {
  return (
    await api<{ data: PaymentConfig }>("/checkout/config", {
      authenticated: false,
    })
  ).data;
}
export function invoiceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      ["asaas.com", "www.asaas.com", "sandbox.asaas.com"].includes(url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}
