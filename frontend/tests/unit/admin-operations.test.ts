import { describe, expect, it } from "vitest";
import {
  buildAssistedOrderWhatsappUrl,
  formatCentsToBrInput,
  parseBrazilianPriceToCents,
  parseBulkExcelPaste,
} from "../../src/features/admin/admin-helpers";

describe("admin operational helpers", () => {
  it("converte preços no padrão brasileiro com vírgula e prefixo R$", () => {
    expect(parseBrazilianPriceToCents("R$ 19,90")).toBe(1990);
    expect(parseBrazilianPriceToCents("1.249,50")).toBe(124950);
    expect(parseBrazilianPriceToCents("29.90")).toBe(2990);
    expect(parseBrazilianPriceToCents("0")).toBe(-1);
    expect(parseBrazilianPriceToCents("-15,00")).toBe(-1);
    expect(formatCentsToBrInput(1990)).toBe("19,90");
    expect(formatCentsToBrInput(null)).toBe("");
  });

  it("interpreta colagem tabular de 30 tonalidades vinda do Excel", () => {
    const header =
      "Nome\tSKU\tPreço\tEstoque\tCódigo Cor\tPreço Promo\tFamília";
    const rows = Array.from({ length: 30 }, (_, idx) => {
      const code = String(idx + 1).padStart(2, "0");
      return `Esmalte Cor ${code}\tESM-${code}\tR$ 14,90\t25\tC${code}\tR$ 11,90\tVermelho`;
    });

    const parsed = parseBulkExcelPaste([header, ...rows].join("\n"), 42);
    expect(parsed).toHaveLength(30);
    expect(parsed[0]).toMatchObject({
      name: "Esmalte Cor 01",
      sku: "ESM-01",
      price_cents: 1490,
      promo_price_cents: 1190,
      stock_qty: 25,
      shade_code: "C01",
      color_family: "Vermelho",
      product_id: 42,
    });
    expect(parsed[29].sku).toBe("ESM-30");
  });

  it("interpreta linhas separadas por ponto e vírgula sem cabeçalho", () => {
    const parsed = parseBulkExcelPaste("Nude Rosé;SKU-NUDE;19,90;10;N01;");
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe("Nude Rosé");
    expect(parsed[0].sku).toBe("SKU-NUDE");
    expect(parsed[0].price_cents).toBe(1990);
    expect(parsed[0].stock_qty).toBe(10);
    expect(parsed[0].shade_code).toBe("N01");
    expect(parsed[0].promo_price_cents).toBeNull();
  });

  it("gera link WhatsApp padronizado para envio de pedido assistido", () => {
    const url = buildAssistedOrderWhatsappUrl(
      "(11) 98765-4321",
      "https://misturafeminina.com.br/checkout/assistido/tok123",
    );
    expect(url.startsWith("https://wa.me/5511987654321?text=")).toBe(true);
    expect(decodeURIComponent(url)).toContain(
      "https://misturafeminina.com.br/checkout/assistido/tok123",
    );

    const noPhone = buildAssistedOrderWhatsappUrl(
      null,
      "https://misturafeminina.com.br/checkout/assistido/tok123",
    );
    expect(noPhone.startsWith("https://wa.me/?text=")).toBe(true);
  });
});
