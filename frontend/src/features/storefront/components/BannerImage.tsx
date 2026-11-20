import { Show, createEffect, createSignal } from "solid-js";
import { assetUrl } from "../../../lib/format";

const FALLBACK_SRC = "/banners/fallback.svg";

export function BannerImage(props: {
  src?: string | null;
  mobileSrc?: string | null;
  alt: string;
  eager?: boolean;
  class?: string;
  imageClass?: string;
}) {
  const [failed, setFailed] = createSignal(false);

  createEffect(() => {
    // A different banner should try its configured images again.
    void props.src;
    void props.mobileSrc;
    setFailed(false);
  });

  const useFallback = () => !props.src?.trim() || failed();

  return (
    <picture class={props.class ?? "block w-full"}>
      <Show when={!useFallback() && props.mobileSrc}>
        <source media="(max-width: 767px)" srcset={assetUrl(props.mobileSrc)} />
      </Show>
      <img
        src={useFallback() ? FALLBACK_SRC : assetUrl(props.src)}
        alt={
          useFallback()
            ? "Mistura Feminina — Beleza e cuidado para você"
            : props.alt
        }
        onError={() => {
          if (!useFallback()) setFailed(true);
        }}
        loading={props.eager ? "eager" : "lazy"}
        fetchpriority={props.eager ? "high" : "auto"}
        decoding="async"
        width="1600"
        height="480"
        class={
          props.imageClass ??
          "block h-[200px] sm:h-[260px] md:h-[320px] lg:h-[360px] xl:h-[380px] w-full object-cover object-center"
        }
      />
    </picture>
  );
}
