import { createEffect, createSignal, splitProps, type JSX } from "solid-js";
import { assetUrl } from "../../../lib/format";

type ProductImageProps = Omit<
  JSX.ImgHTMLAttributes<HTMLImageElement>,
  "src" | "onError"
> & {
  src?: string | null;
};

export function ProductImage(props: ProductImageProps) {
  const [local, rest] = splitProps(props, ["src"]);
  const [failed, setFailed] = createSignal(false);
  createEffect(() => {
    void local.src;
    setFailed(false);
  });

  const imageSrc = () => assetUrl(local.src?.trim());
  const fallback = "/placeholder-product.svg";

  return (
    <img
      {...rest}
      src={failed() ? fallback : imageSrc()}
      onError={() => {
        if (!failed() && imageSrc() !== fallback) setFailed(true);
      }}
    />
  );
}
