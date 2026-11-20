import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { Dynamic } from "solid-js/web";

export interface SectionHeadingProps {
  title: string;
  subtitle?: string | null;
  align?: "center" | "left";
  as?: "h1" | "h2";
  action?: JSX.Element;
  class?: string;
}

/**
 * Shared minimalist editorial section heading for storefront blocks and catalog pages.
 */
export function SectionHeading(props: SectionHeadingProps) {
  const isLeft = () => props.align === "left";
  const isPageTitle = () => props.as === "h1";
  const tag = () => (isPageTitle() ? "h1" : "h2");

  const headingClass = () =>
    `font-extrabold tracking-[-0.02em] leading-tight text-[#2E0C49] ${
      isPageTitle()
        ? "text-[23px] sm:text-[28px]"
        : "text-[21px] sm:text-[26px]"
    }`;

  return (
    <Show
      when={isLeft()}
      fallback={
        <div class={`relative mb-7 text-center sm:mb-8 ${props.class ?? ""}`}>
          <div class="inline-flex items-center justify-center gap-3 sm:gap-4">
            <span class="inline-flex items-center gap-2" aria-hidden="true">
              <span class="h-px w-6 bg-[#E5CCE8] sm:w-14" />
              <span class="size-1.5 rotate-45 rounded-[1px] bg-[#93509e]" />
            </span>
            <Dynamic component={tag()} class={headingClass()}>
              {props.title}
            </Dynamic>
            <span class="inline-flex items-center gap-2" aria-hidden="true">
              <span class="size-1.5 rotate-45 rounded-[1px] bg-[#93509e]" />
              <span class="h-px w-6 bg-[#E5CCE8] sm:w-14" />
            </span>
          </div>

          <Show when={props.subtitle}>
            <p class="mx-auto mt-1.5 max-w-xl text-[13px] font-medium leading-relaxed text-[#5B486B] sm:text-[13.5px]">
              {props.subtitle}
            </p>
          </Show>

          <Show when={props.action}>
            <div class="mt-3 sm:absolute sm:right-0 sm:top-1/2 sm:mt-0 sm:-translate-y-1/2">
              {props.action}
            </div>
          </Show>
        </div>
      }
    >
      <div
        class={`mb-6 flex flex-col items-center justify-between gap-4 text-center sm:mb-7 sm:flex-row sm:items-end sm:text-left ${props.class ?? ""}`}
      >
        <div>
          <div class="inline-flex items-center justify-center gap-2.5 sm:justify-start">
            <span
              class="h-6 w-1 shrink-0 rounded-xs bg-[#93509e] sm:h-7"
              aria-hidden="true"
            />
            <Dynamic component={tag()} class={headingClass()}>
              {props.title}
            </Dynamic>
          </div>

          <Show when={props.subtitle}>
            <p class="mt-2 max-w-2xl text-[13px] font-medium leading-relaxed text-[#5B486B] sm:text-[13.5px]">
              {props.subtitle}
            </p>
          </Show>
        </div>

        <Show when={props.action}>
          <div class="shrink-0">{props.action}</div>
        </Show>
      </div>
    </Show>
  );
}
