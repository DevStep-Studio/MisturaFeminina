import Loader2 from "lucide-solid/icons/loader-circle";
import { type JSX, Show, splitProps } from "solid-js";

export type AdminButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type AdminButtonSize = "sm" | "md" | "icon";

export interface AdminButtonProps
  extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: AdminButtonVariant;
  size?: AdminButtonSize;
  loading?: boolean;
  loadingLabel?: string;
  children?: JSX.Element;
}

const VARIANT_CLASSES: Record<AdminButtonVariant, string> = {
  primary:
    "border border-[#93509e] bg-[#93509e] text-white hover:border-[#7c3f87] hover:bg-[#7c3f87]",
  secondary:
    "border border-zinc-300 bg-white text-zinc-800 hover:border-zinc-400 hover:bg-zinc-50",
  ghost:
    "border border-transparent bg-transparent text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900",
  danger:
    "border border-red-700 bg-red-700 text-white hover:border-red-800 hover:bg-red-800",
};

const SIZE_CLASSES: Record<AdminButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-9 px-3.5 text-xs sm:text-[13px] gap-1.5",
  icon: "h-9 w-9 p-0 justify-center",
};

/**
 * Standardized Mistura Feminina admin button with saving lock and stable dimensions.
 */
export function AdminButton(props: AdminButtonProps) {
  const [local, rest] = splitProps(props, [
    "variant",
    "size",
    "loading",
    "loadingLabel",
    "class",
    "children",
    "disabled",
    "type",
  ]);

  const variant = () => local.variant ?? "secondary";
  const size = () => local.size ?? "md";
  const isDisabled = () => Boolean(local.disabled || local.loading);

  return (
    <button
      {...rest}
      type={local.type ?? "button"}
      disabled={isDisabled()}
      aria-busy={local.loading ? "true" : undefined}
      class={`adm-btn relative inline-flex shrink-0 items-center justify-center rounded-[8px] font-semibold select-none disabled:cursor-not-allowed disabled:opacity-55 ${VARIANT_CLASSES[variant()]} ${SIZE_CLASSES[size()]} ${local.class ?? ""}`}
    >
      <Show when={local.loading} fallback={local.children}>
        <span class="inline-flex items-center justify-center gap-1.5">
          <Loader2 class="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
          <span>{local.loadingLabel ?? "Salvando…"}</span>
        </span>
      </Show>
    </button>
  );
}
