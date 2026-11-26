const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
  aacute: "á",
  Aacute: "Á",
  acirc: "â",
  Acirc: "Â",
  atilde: "ã",
  Atilde: "Ã",
  agrave: "à",
  Agrave: "À",
  eacute: "é",
  Eacute: "É",
  ecirc: "ê",
  Ecirc: "Ê",
  iacute: "í",
  Iacute: "Í",
  oacute: "ó",
  Oacute: "Ó",
  ocirc: "ô",
  Ocirc: "Ô",
  otilde: "õ",
  Otilde: "Õ",
  uacute: "ú",
  Uacute: "Ú",
  ccedil: "ç",
  Ccedil: "Ç",
  ordm: "º",
  ordf: "ª",
  deg: "°",
  ndash: "–",
  mdash: "—",
};

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "ul",
  "ol",
  "li",
  "h3",
  "h4",
  "blockquote",
]);

function decodeHtmlEntities(text: string): string {
  return text.replace(
    /&(#x?[0-9a-fA-F]+|[a-zA-Z0-9]+);/g,
    (full, code: string) => {
      if (code.startsWith("#x") || code.startsWith("#X")) {
        const cp = Number.parseInt(code.slice(2), 16);
        return Number.isFinite(cp) && cp > 0 ? String.fromCodePoint(cp) : full;
      }
      if (code.startsWith("#")) {
        const cp = Number.parseInt(code.slice(1), 10);
        return Number.isFinite(cp) && cp > 0 ? String.fromCodePoint(cp) : full;
      }
      return NAMED_ENTITIES[code] ?? full;
    },
  );
}

export function escapeHtmlEntities(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeEscapedFormattingTags(raw: string): string {
  return raw.replace(
    /&lt;(\/?)(p|br|strong|b|em|i|ul|ol|li|h3|h4|blockquote)(\s*\/?)&gt;/gi,
    (_m, slash: string, tag: string, selfClose: string) =>
      `<${slash}${tag.toLowerCase()}${selfClose}>`,
  );
}

/**
 * Converts HTML or plain text into clean single-space plain text for SEO/cards/feeds.
 */
export function stripHtmlToPlainText(raw?: string | null): string {
  if (!raw) return "";
  const unescaped = normalizeEscapedFormattingTags(String(raw));
  const withBreaks = unescaped
    .replace(
      /<(script|style|iframe|object|embed|svg)[^>]*>[\s\S]*?<\/\1>/gi,
      " ",
    )
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6]|blockquote|tr)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(withBreaks)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Sanitizes product descriptions (HTML or plain text) into safe, clean semantic HTML.
 * Strips scripts, styles, event handlers, inline styles, and unknown tags while
 * preserving paragraphs, lists, bold/italic emphasis, and plain-text line breaks.
 */
export function sanitizeProductDescriptionHtml(raw?: string | null): string {
  const input = normalizeEscapedFormattingTags(String(raw ?? "")).trim();
  if (!input) return "";

  const withoutDangerousBlocks = input.replace(
    /<(script|style|iframe|object|embed|form|svg|math|noscript|template)[^>]*>[\s\S]*?<\/\1>/gi,
    "",
  );

  const hasHtmlTags = /<\/?[a-zA-Z][^>]*>/.test(withoutDangerousBlocks);

  if (!hasHtmlTags) {
    const decoded = decodeHtmlEntities(withoutDangerousBlocks)
      .replace(/\r\n?/g, "\n")
      .trim();
    if (!decoded) return "";
    const paragraphs = decoded
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    return paragraphs
      .map((p) => `<p>${escapeHtmlEntities(p).replace(/\n/g, "<br />")}</p>`)
      .join("");
  }

  const normalizedTags = withoutDangerousBlocks
    .replace(/<\s*(\/?)h[12]\b[^>]*>/gi, "<$1h3>")
    .replace(/<\s*(\/?)h[56]\b[^>]*>/gi, "<$1h4>")
    .replace(/<\s*(\/?)div\b[^>]*>/gi, "<$1p>");

  const parts = normalizedTags.split(/(<[^>]+>)/g);
  const out: string[] = [];

  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("<") && part.endsWith(">")) {
      const m = part.match(/^<\s*(\/?)\s*([a-zA-Z0-9]+)\b[^>]*(\/?)\s*>$/);
      if (!m) continue;
      const isClosing = m[1] === "/";
      const tag = m[2]!.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        continue;
      }
      if (tag === "br") {
        if (!isClosing) out.push("<br />");
        continue;
      }
      out.push(isClosing ? `</${tag}>` : `<${tag}>`);
    } else {
      const decodedText = decodeHtmlEntities(part);
      out.push(escapeHtmlEntities(decodedText));
    }
  }

  const joined = out
    .join("")
    .replace(/<p>(?:\s|&nbsp;|<br\s*\/>)*<\/p>/gi, "")
    .trim();

  if (!joined) return "";

  if (!/<(p|ul|ol|h3|h4|blockquote)\b/i.test(joined)) {
    return `<p>${joined.replace(/\r?\n/g, "<br />")}</p>`;
  }

  return joined;
}
