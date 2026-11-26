import {
  escapeHtmlEntities,
  sanitizeProductDescriptionHtml,
} from "../../../lib/rich-text";

export function RichProductText(props: {
  text?: string | null;
  fallback?: string;
  class?: string;
}) {
  const html = () => {
    const clean = sanitizeProductDescriptionHtml(props.text);
    if (clean) return clean;
    return props.fallback ? `<p>${escapeHtmlEntities(props.fallback)}</p>` : "";
  };

  /* eslint-disable solid/no-innerhtml */
  return (
    <div
      class={
        props.class ??
        "space-y-2.5 leading-relaxed [&_blockquote]:border-l-2 [&_blockquote]:border-[#93509e] [&_blockquote]:pl-3 [&_h3]:mt-2 [&_h3]:font-bold [&_h3]:text-[#2E0C49] [&_h4]:mt-2 [&_h4]:font-bold [&_h4]:text-[#2E0C49] [&_li+li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2.5 [&_strong]:font-semibold [&_strong]:text-zinc-900 [&_ul]:list-disc [&_ul]:pl-5"
      }
      innerHTML={html()}
    />
  );
}
