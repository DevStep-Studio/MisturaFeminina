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
    `font-bold tracking-[-0.02em] leading-tight text-[#26093D] ${
      isPageTitle()
        ? "text-[22px] sm:text-[26px]"
        : "text-[20px] sm:text-[24px]"
    }`;

  return (
    <Show
      when={isLeft()}
      fallback={
        <div class={`relative mb-7 text-center sm:mb-8 ${props.class ?? ""}`}>
          <Dynamic component={tag()} class={headingClass()}>
            {props.title}
          </Dynamic>

          <Show when={props.subtitle}>
            <p class="mx-auto mt-1.5 max-w-xl text-[13px] font-normal leading-relaxed text-zinc-500 sm:text-[13.5px]">
              {props.subtitle}
            </p>
          </Show>

          <div
            class="mt-2.5 flex items-center justify-center gap-2"
            aria-hidden="true"
          >
            <span class="h-px w-8 bg-gradient-to-r from-transparent to-[#DFC5EC] sm:w-10" />
            <span class="h-[3px] w-7 rounded-full bg-gradient-to-r from-[#3D1260] via-[#7E22CE] to-[#C22583]" />
            <span class="h-px w-8 bg-gradient-to-l from-transparent to-[#DFC5EC] sm:w-10" />
          </div>

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
          <Dynamic component={tag()} class={headingClass()}>
            {props.title}
          </Dynamic>

          <div
            class="mt-2 flex items-center justify-center gap-2 sm:justify-start"
            aria-hidden="true"
          >
            <span class="h-[3px] w-7 rounded-full bg-gradient-to-r from-[#3D1260] via-[#7E22CE] to-[#C22583]" />
            <span class="h-px w-10 bg-gradient-to-r from-[#DFC5EC] to-transparent sm:w-14" />
          </div>

          <Show when={props.subtitle}>
            <p class="mt-2 max-w-2xl text-[13px] font-normal leading-relaxed text-zinc-600 sm:text-[13.5px]">
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
