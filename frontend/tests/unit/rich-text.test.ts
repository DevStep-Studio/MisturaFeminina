import { describe, expect, it } from "vitest";
import {
  sanitizeProductDescriptionHtml,
  stripHtmlToPlainText,
} from "../../src/lib/rich-text";

describe("rich-text product description sanitizer", () => {
  it("renderiza parágrafos e listas HTML sem exibir tags <p> literais e remove atributos/scripts inseguros", () => {
    const raw =
      '<p style="font-family:Georgia">Caixa com <strong>100 unidades</strong> de unhas postiças.</p><script>alert(1)</script><p onclick="evil()">Acabamento natural &amp; prático.</p>';

    const html = sanitizeProductDescriptionHtml(raw);
    expect(html).toBe(
      "<p>Caixa com <strong>100 unidades</strong> de unhas postiças.</p><p>Acabamento natural &amp; prático.</p>",
    );
    expect(html).not.toContain("script");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("Georgia");

    expect(stripHtmlToPlainText(raw)).toBe(
      "Caixa com 100 unidades de unhas postiças.\nAcabamento natural & prático.",
    );
  });

  it("preserva compatibilidade total com descrições em texto puro e quebras de linha", () => {
    const plain =
      "Regulador de pH 10 ml da marca Any Lovy.\n\nDados confirmados: Apresentação 10 ml · Linha Preparadores.";
    const html = sanitizeProductDescriptionHtml(plain);

    expect(html).toBe(
      "<p>Regulador de pH 10 ml da marca Any Lovy.</p><p>Dados confirmados: Apresentação 10 ml · Linha Preparadores.</p>",
    );
  });

  it("corrige tags <p> escapadas acidentalmente (&lt;p&gt;) sem desescapar tags perigosas", () => {
    const escaped =
      "&lt;p&gt;Esmalte em gel 15 ml.&lt;/p&gt;&lt;script&gt;xss()&lt;/script&gt;";
    const html = sanitizeProductDescriptionHtml(escaped);

    expect(html).toContain("<p>Esmalte em gel 15 ml.</p>");
    expect(html).not.toContain("<script>");
  });
});
