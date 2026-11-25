import ChevronRight from "lucide-solid/icons/chevron-right";
import { type JSX, Show } from "solid-js";

/**
 * Clean flat surface panel without nested decorative borders or gradients.
 */
export function AdminCard(props: {
  children: JSX.Element;
  class?: string;
  padding?: "sm" | "md" | "lg" | "none";
}) {
  const padClass = () =>
    props.padding === "none"
      ? ""
      : props.padding === "sm"
        ? "p-3.5"
        : props.padding === "lg"
          ? "p-6"
          : "p-4 sm:p-5";

  return (
    <section
      class={`rounded-[12px] border border-zinc-200/90 bg-white ${padClass()} ${props.class ?? ""}`}
    >
      {props.children}
    </section>
  );
}

/**
 * Consistent metric card: stable when purely informative; subtle hover/focus + keyboard hint when clickable.
 */
export function AdminMetricCard(props: {
  label: string;
  value: string;
  secondary?: JSX.Element;
  badge?: JSX.Element;
  footer?: JSX.Element;
  highlightTone?: "default" | "brand" | "danger" | "warning";
  onClick?: () => void;
  actionLabel?: string;
  class?: string;
}) {
  const valueToneClass = () => {
    switch (props.highlightTone) {
      case "brand":
        return "text-[#62298d]";
      case "danger":
        return "text-red-700";
      case "warning":
        return "text-amber-800";
      default:
        return "text-zinc-900";
    }
  };

  const renderBody = () => (
    <>
      <div class="flex items-start justify-between gap-2">
        <p class="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          {props.label}
        </p>
        <Show when={props.badge}>{props.badge}</Show>
      </div>

      <div class="mt-2 flex items-baseline justify-between gap-2">
        <p
          class={`adm-tabular text-2xl font-bold tracking-tight ${valueToneClass()}`}
        >
          {props.value}
        </p>
        <Show when={props.secondary}>{props.secondary}</Show>
      </div>

      <Show when={props.footer || props.actionLabel}>
        <div class="mt-2.5 flex items-center justify-between gap-2 border-t border-zinc-100 pt-2 text-xs text-zinc-500">
          <div class="min-w-0 truncate">{props.footer}</div>
          <Show when={props.onClick}>
            <span class="inline-flex shrink-0 items-center gap-0.5 font-medium text-[#62298d]">
              {props.actionLabel ?? "Ver detalhes"}
              <ChevronRight class="h-3.5 w-3.5" />
            </span>
          </Show>
        </div>
      </Show>
    </>
  );

  return (
    <Show
      when={props.onClick}
      fallback={
        <div
          class={`flex flex-col justify-between rounded-[12px] border border-zinc-200/90 bg-white p-4 sm:p-5 ${props.class ?? ""}`}
        >
          {renderBody()}
        </div>
      }
    >
      <button
        type="button"
        onClick={() => props.onClick?.()}
        class={`adm-card-interactive flex w-full flex-col justify-between rounded-[12px] border border-zinc-200/90 bg-white p-4 text-left hover:border-[#e4c6ea] hover:bg-[#fcfafd] sm:p-5 ${props.class ?? ""}`}
      >
        {renderBody()}
      </button>
    </Show>
  );
}
