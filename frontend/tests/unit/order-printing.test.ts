import { describe, expect, it } from "vitest";
import {
  detectCarrier,
  formatCep,
  validateShippingAddress,
} from "../../src/features/admin/orders/order-print-helpers";

describe("Order Shipping Carrier Detection", () => {
  it("detects SEDEX when carrier or service names contains sedex", () => {
    const res1 = detectCarrier({ carrier: "Correios / Sedex" }, null);
    expect(res1.type).toBe("SEDEX");
    expect(res1.label).toBe("SEDEX");
    expect(res1.logoUrl).toBe("/carriers/sedex.svg");

    const res2 = detectCarrier(null, { service_name: "Sedex 10" });
    expect(res2.type).toBe("SEDEX");
    expect(res2.logoUrl).toBe("/carriers/sedex.svg");
  });

  it("detects PAC when carrier or service names contains pac", () => {
    const res = detectCarrier({ carrier: "Correios / PAC" }, null);
    expect(res.type).toBe("PAC");
    expect(res.label).toBe("PAC");
    expect(res.logoUrl).toBe("/carriers/pac.svg");
  });

  it("identifies Correios brand without assuming PAC or SEDEX when only Correios is provided", () => {
    const res = detectCarrier({ carrier: "Correios" }, null);
    expect(res.type).toBe("CORREIOS");
    expect(res.label).toBe("Correios");
    expect(res.logoUrl).toBe("/carriers/correios.svg");
  });

  it("detects pickup in store and other carriers cleanly", () => {
    const resPickup = detectCarrier({ service_name: "Retirada na Loja" }, null);
    expect(resPickup.type).toBe("OTHER");
    expect(resPickup.label).toBe("Retirada na Loja");

    const resJadlog = detectCarrier({ carrier: "Jadlog .Package" }, null);
    expect(resJadlog.type).toBe("OTHER");
    expect(resJadlog.label).toBe("Jadlog .Package");
  });
});

describe("CEP Formatting and Leading Zeros", () => {
  it("formats 8-digit CEP preserving leading zeros", () => {
    expect(formatCep("01001000")).toBe("01001-000");
    expect(formatCep("02040002")).toBe("02040-002");
    expect(formatCep("20000-000")).toBe("20000-000");
  });

  it("handles null or undefined safely", () => {
    expect(formatCep(null)).toBe("");
    expect(formatCep(undefined)).toBe("");
  });
});

describe("Shipping Address Validation", () => {
  it("detects missing CEP or invalid length", () => {
    const resultNoCep = validateShippingAddress({
      street: "Rua das Flores",
      number: "123",
      city: "São Paulo",
      state: "SP",
      cep: "",
    });
    expect(resultNoCep.valid).toBe(false);
    expect(resultNoCep.message).toContain("sem CEP válido");

    const resultShortCep = validateShippingAddress({
      street: "Rua das Flores",
      number: "123",
      city: "São Paulo",
      state: "SP",
      cep: "1234",
    });
    expect(resultShortCep.valid).toBe(false);
  });

  it("detects missing street or number", () => {
    const resultNoStreet = validateShippingAddress({
      street: "",
      number: "123",
      city: "São Paulo",
      state: "SP",
      cep: "01001-000",
    });
    expect(resultNoStreet.valid).toBe(false);
    expect(resultNoStreet.message).toContain("campos essenciais ausentes");
  });

  it("validates complete address successfully", () => {
    const result = validateShippingAddress({
      street: "Praça da Sé",
      number: "10",
      city: "São Paulo",
      state: "SP",
      cep: "01001-000",
    });
    expect(result.valid).toBe(true);
  });
});
