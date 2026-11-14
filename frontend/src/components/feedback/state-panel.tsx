import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { Dynamic } from "solid-js/web";

export const stateActionClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none";

export function StatePanel(props: {
  icon: JSX.Element;
  title: string;
  description: string;
  eyebrow?: string;
  heading?: "h1" | "h2";
  tone?: "brand" | "warning" | "danger";
  role?: "status" | "alert";
  children?: JSX.Element;
}) {
  return (
    <section
      class="flex min-h-90 w-full flex-col items-center justify-center px-6 py-12 text-center sm:px-10 sm:py-16"
      role={props.role}
      aria-live={props.role === "status" ? "polite" : undefined}
    >
      <div
        class="mb-6 grid size-16 place-items-center rounded-2xl ring-8 ring-surface shadow-sm"
        classList={{
          "bg-brand-50 text-brand-600": !props.tone || props.tone === "brand",
          "bg-warning-soft text-warning": props.tone === "warning",
          "bg-danger-soft text-danger": props.tone === "danger",
        }}
        aria-hidden="true"
      >
        {props.icon}
      </div>
      <Show when={props.eyebrow}>
        <p class="mb-3 text-xs font-semibold tracking-[0.18em] text-muted uppercase">
          {props.eyebrow}
        </p>
      </Show>
      <Dynamic
        component={props.heading ?? "h2"}
        class="m-0 max-w-lg text-2xl leading-tight font-semibold tracking-tight text-ink sm:text-3xl"
      >
        {props.title}
      </Dynamic>
      <p class="mt-3 mb-0 max-w-md text-sm leading-7 text-muted sm:text-base">
        {props.description}
      </p>
      <Show when={props.children}>
        <div class="mt-7 flex w-full max-w-xs flex-col items-stretch justify-center gap-3 sm:w-auto sm:max-w-none sm:flex-row">
          {props.children}
        </div>
      </Show>
    </section>
  );
}
