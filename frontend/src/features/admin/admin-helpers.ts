export interface ParsedBulkVariantRow {
  row_index: number;
  name: string;
  sku: string;
  shade_code: string | null;
  color_family: string | null;
  color_hex: string | null;
  price_cents: number;
  promo_price_cents: number | null;
  stock_qty: number;
  product_id: number | null;
}

export function parseBrazilianPriceToCents(raw: string | number): number {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? Math.round(raw * 100) : -1;
  }
  const clean = raw
    .trim()
    .replace(/R\$/gi, "")
    .replace(/\s+/g, "")
    .replace(/[^0-9,.-]/g, "");
  if (!clean || clean.startsWith("-")) {
    return -1;
  }
  const normalized = clean.includes(",")
    ? clean.replace(/\./g, "").replace(",", ".")
    : clean;
  const num = Number(normalized);
  if (!Number.isFinite(num) || num <= 0) {
    return -1;
  }
  return Math.round(num * 100);
}

export function formatCentsToBrInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || cents <= 0) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

function stripAccents(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function parseBulkExcelPaste(
  rawText: string,
  defaultProductId: number | null = null,
): ParsedBulkVariantRow[] {
  const lines = rawText
    .split(/\r\n|\r|\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const first = lines[0];
  const sep = first.includes("\t") ? "\t" : first.includes(";") ? ";" : ",";
  let cols = ["name", "sku", "price", "stock", "shade_code", "promo_price"];
  let startIdx = 0;

  const firstCells = first.split(sep).map(stripAccents);
  const looksLikePriceCell = firstCells.some(
    (c) => /^r\$\s*\d/.test(c) || /^\d+[.,]\d{2}$/.test(c),
  );
  const hasHeaderToken = firstCells.some(
    (c) =>
      c === "sku" ||
      c === "preco" ||
      c === "estoque" ||
      c === "nome" ||
      /\b(preco|valor|estoque|quantidade|tonalidade|codigo cor)\b/.test(c),
  );

  if (hasHeaderToken && !looksLikePriceCell) {
    startIdx = 1;
    let nameClaimed = false;
    cols = firstCells.map((h) => {
      if (h === "sku" || h.includes("sku")) return "sku";
      if (h.includes("promo")) return "promo_price";
      if (h.includes("preco") || h.includes("valor")) return "price";
      if (h.includes("estoq") || h.includes("qtd")) return "stock";
      if (
        (h.includes("cod") && h.includes("cor")) ||
        h.includes("num") ||
        h.includes("shade")
      ) {
        return "shade_code";
      }
      if (h.includes("famil")) return "color_family";
      if (h.includes("hex")) return "color_hex";
      if (!nameClaimed) {
        nameClaimed = true;
        return "name";
      }
      return "ignore";
    });
  }

  const out: ParsedBulkVariantRow[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const cells = lines[i].split(sep).map((c) => c.trim());
    const row: ParsedBulkVariantRow = {
      row_index: out.length,
      name: "",
      sku: "",
      shade_code: null,
      color_family: null,
      color_hex: null,
      price_cents: 0,
      promo_price_cents: null,
      stock_qty: 0,
      product_id: defaultProductId,
    };

    cells.forEach((cell, cIdx) => {
      const key = cols[cIdx];
      if (!key) return;
      if (key === "name") row.name = cell;
      else if (key === "sku") row.sku = cell.toUpperCase();
      else if (key === "shade_code") row.shade_code = cell || null;
      else if (key === "color_family") row.color_family = cell || null;
      else if (key === "color_hex") row.color_hex = cell || null;
      else if (key === "price") {
        row.price_cents = parseBrazilianPriceToCents(cell);
      } else if (key === "promo_price") {
        row.promo_price_cents =
          cell !== "" ? parseBrazilianPriceToCents(cell) : null;
      } else if (key === "stock") {
        const cleaned = cell.replace(/\./g, "").replace(/\s+/g, "");
        row.stock_qty = /^-?\d+$/.test(cleaned) ? Number(cleaned) : -1;
      }
    });

    out.push(row);
  }
  return out;
}

export function buildAssistedOrderWhatsappUrl(
  phone: string | null | undefined,
  checkoutUrl: string,
): string {
  const msg = `Olá! Preparamos sua seleção de produtos na Mistura Feminina. Você pode conferir os itens, calcular o frete e finalizar o pagamento com segurança pelo link: ${checkoutUrl}`;
  const digits = (phone ?? "").replace(/\D/g, "");
  const normalized =
    digits.length >= 10 && digits.length <= 11
      ? `55${digits}`
      : digits.length >= 12
        ? digits
        : "";
  if (normalized) {
    return `https://wa.me/${normalized}?text=${encodeURIComponent(msg)}`;
  }
  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}
