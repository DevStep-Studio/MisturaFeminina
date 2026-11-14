import LoaderCircle from "lucide-solid/icons/loader-circle";
import { StatePanel } from "./state-panel";
export function LoadingState(props: { message?: string }) {
  return (
    <StatePanel
      role="status"
      icon={
        <LoaderCircle
          size={28}
          strokeWidth={1.75}
          class="motion-safe:animate-spin"
        />
      }
      title={props.message || "Carregando…"}
      description="Só um instante. Estamos preparando tudo para você."
    >
      <div
        class="w-56 space-y-3 rounded-2xl border border-line bg-surface p-5 motion-safe:animate-pulse sm:w-72"
        aria-hidden="true"
      >
        <div class="h-2.5 w-full rounded-full bg-brand-100" />
        <div class="h-2.5 w-4/5 rounded-full bg-brand-50" />
        <div class="h-2.5 w-3/5 rounded-full bg-brand-50" />
      </div>
    </StatePanel>
  );
}
