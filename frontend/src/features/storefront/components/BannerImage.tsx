import { Show, createEffect, createSignal } from "solid-js";
import { assetUrl } from "../../../lib/format";

const FALLBACK_SRC = "/banners/fallback.svg";

export function BannerImage(props: {
  src?: string | null;
  mobileSrc?: string | null;
  alt: string;
  eager?: boolean;
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
    <picture class="block w-full">
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
        height="686"
        class="block h-auto w-full"
      />
    </picture>
  );
}
