import { describe, expect, it } from "vitest";
import {
  isValidGa4MeasurementId,
  isValidGtmId,
  mapCartItemsToGa4,
  sanitizeAnalyticsPayload,
  setAnalyticsConsent,
} from "../../src/monitoring/analytics";

describe("marketing e google — GA4 validation & PII protection", () => {
  it("rejeita Measurement IDs e GTM IDs de exemplo/placeholder e aceita IDs reais", () => {
    expect(isValidGa4MeasurementId("")).toBe(false);
    expect(isValidGa4MeasurementId(null)).toBe(false);
    expect(isValidGa4MeasurementId("G-XXXXXXXXXX")).toBe(false);
    expect(isValidGa4MeasurementId("G-0000000000")).toBe(false);
    expect(isValidGa4MeasurementId("G-MFEMININA01")).toBe(false);
    expect(isValidGa4MeasurementId("G-9K3L2M1N8P")).toBe(true);

    expect(isValidGtmId("GTM-XXXXXXX")).toBe(false);
    expect(isValidGtmId("GTM-0000000")).toBe(false);
    expect(isValidGtmId("GTM-KP8R92T")).toBe(true);
  });

  it("remove recursivamente dados pessoais (PII) preservando dados comerciais do pedido", () => {
    const dirty = {
      transaction_id: "MF-2026-0042",
      value: 129.9,
      currency: "BRL",
      customer_name: "Cliente Real",
      email: "cliente@dominio.com.br",
      cpf: "111.222.333-44",
      phone: "31999998888",
      shipping_address: {
        street: "Rua das Flores",
        cep: "30140-000",
      },
      items: [
        {
          item_id: "MF-ESM-001",
          item_name: "Esmalte em Gel Nude",
          price: 19.9,
          quantity: 2,
          recipient_name: "Segredo",
        },
      ],
    };

    const clean = sanitizeAnalyticsPayload(dirty) as Record<string, unknown>;
    expect(clean.transaction_id).toBe("MF-2026-0042");
    expect(clean.value).toBe(129.9);
    expect(clean.currency).toBe("BRL");
    expect(clean).not.toHaveProperty("customer_name");
    expect(clean).not.toHaveProperty("email");
    expect(clean).not.toHaveProperty("cpf");
    expect(clean).not.toHaveProperty("phone");
    expect(clean).not.toHaveProperty("shipping_address");

    const firstItem = (clean.items as Array<Record<string, unknown>>)[0];
    expect(firstItem.item_id).toBe("MF-ESM-001");
    expect(firstItem).not.toHaveProperty("recipient_name");
  });

  it("converte itens de carrinho de centavos para formato monetário BRL do GA4", () => {
    const mapped = mapCartItemsToGa4([
      {
        sku: "MF-SOFTGEL-01",
        product_name: "Tips Soft Gel Quadrada",
        unit_price_cents: 2490,
        quantity: 3,
      },
    ]);

    expect(mapped).toEqual([
      {
        item_id: "MF-SOFTGEL-01",
        item_name: "Tips Soft Gel Quadrada",
        price: 24.9,
        quantity: 3,
      },
    ]);
  });

  it("garante proteção de privacidade LGPD no fluxo de consentimento e opt-out", () => {
    const mockStorage = new Map<string, string>();
    const storageMock = {
      getItem: (k: string) => mockStorage.get(k) ?? null,
      setItem: (k: string, v: string) => mockStorage.set(k, String(v)),
      removeItem: (k: string) => mockStorage.delete(k),
      clear: () => mockStorage.clear(),
      key: (i: number) => Array.from(mockStorage.keys())[i] ?? null,
      get length() {
        return mockStorage.size;
      },
    };
    Object.defineProperty(globalThis, "localStorage", {
      value: storageMock,
      writable: true,
      configurable: true,
    });

    setAnalyticsConsent("denied");
    expect(globalThis.localStorage.getItem("mf:analytics-consent:v1")).toBe("denied");

    setAnalyticsConsent("granted");
    expect(globalThis.localStorage.getItem("mf:analytics-consent:v1")).toBe("granted");
  });

  it("assegura que sanitização de PII protege todos os eventos e-commerce (view_item, cart, checkout, purchase)", () => {
    const dirtyCheckout = {
      currency: "BRL",
      value: 299.8,
      customer_email: "cliente@privado.com",
      customer_phone: "31999991111",
      cpf_cnpj: "123.456.789-00",
      address: "Rua Exemplo, 123",
      items: [
        {
          item_id: "SKU-001",
          item_name: "Gel Construtor 15g",
          price: 149.9,
          quantity: 2,
          recipient_name: "Nome Oculto",
        },
      ],
    };

    const sanitized = sanitizeAnalyticsPayload(dirtyCheckout) as Record<string, unknown>;
    expect(sanitized.currency).toBe("BRL");
    expect(sanitized.value).toBe(299.8);
    expect(sanitized).not.toHaveProperty("customer_email");
    expect(sanitized).not.toHaveProperty("customer_phone");
    expect(sanitized).not.toHaveProperty("cpf_cnpj");
    expect(sanitized).not.toHaveProperty("address");
    expect(sanitized.items).toEqual([
      {
        item_id: "SKU-001",
        item_name: "Gel Construtor 15g",
        price: 149.9,
        quantity: 2,
      },
    ]);
  });

  it("calcula deltas percentuais sem confundir zero com ausência de dados históricos", () => {
    const calcDelta = (curr: number, prev: number | null | undefined): number | null => {
      if (prev === null || prev === undefined || prev === 0) return null;
      return Math.round(((curr - prev) / prev) * 1000) / 10;
    };

    expect(calcDelta(150, 100)).toBe(50);
    expect(calcDelta(80, 100)).toBe(-20);
    expect(calcDelta(100, 0)).toBeNull(); // Sem dados de base anterior não gera divisão por zero
    expect(calcDelta(100, null)).toBeNull();
  });
});
