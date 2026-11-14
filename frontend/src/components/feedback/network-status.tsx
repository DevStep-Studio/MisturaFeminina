import { createSignal, onCleanup, onMount, Show } from "solid-js";
import WifiOff from "lucide-solid/icons/wifi-off";
export function NetworkStatus() {
  const [offline, setOffline] = createSignal(!navigator.onLine);
  onMount(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    onCleanup(() => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    });
  });
  return (
    <Show when={offline()}>
      <div
        role="status"
        aria-live="polite"
        class="flex items-center justify-center gap-3 border-b border-warning/20 bg-warning-soft px-4 py-3 text-sm leading-6 text-warning"
      >
        <WifiOff size={18} class="shrink-0" aria-hidden="true" />
        <p class="m-0">
          Você está sem conexão. Os dados podem estar desatualizados.
        </p>
      </div>
    </Show>
  );
}
