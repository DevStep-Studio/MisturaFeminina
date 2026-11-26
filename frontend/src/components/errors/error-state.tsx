import CircleAlert from "lucide-solid/icons/circle-exclamation-point";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import WifiOff from "lucide-solid/icons/wifi-off";
import { Show } from "solid-js";
import { ApiError } from "../../lib/api-error";
import { StatePanel, stateActionClass } from "../feedback/state-panel";
export function ErrorState(props: {
  error?: unknown;
  title?: string;
  message?: string;
  retry?: () => void;
  busy?: boolean;
}) {
  const offline = () =>
    props.error instanceof ApiError && props.error.kind === "offline";
  const message = () =>
    props.message ??
    (props.error instanceof ApiError
      ? props.error.message
      : "Não foi possível concluir esta operação. Tente novamente.");
  return (
    <StatePanel
      role="alert"
      tone={offline() ? "warning" : "danger"}
      eyebrow={offline() ? "Conexão interrompida" : "Vamos tentar de novo"}
      icon={
        offline() ? (
          <WifiOff size={28} strokeWidth={1.75} />
        ) : (
          <CircleAlert size={28} strokeWidth={1.75} />
        )
      }
      title={props.title || "Não foi possível carregar esta página"}
      description={message()}
    >
      <Show when={props.retry}>
        <button
          type="button"
          class={stateActionClass}
          disabled={props.busy}
          aria-busy={props.busy}
          onClick={() => props.retry?.()}
        >
          <RefreshCw
            size={16}
            aria-hidden="true"
            class={props.busy ? "motion-safe:animate-spin" : ""}
          />
          {props.busy ? "Tentando…" : "Tentar novamente"}
        </button>
      </Show>
      <a
        href="/"
        class="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50"
      >
        Ir para a página inicial
      </a>
    </StatePanel>
  );
}
