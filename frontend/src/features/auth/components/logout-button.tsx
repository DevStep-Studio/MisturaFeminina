import { createSignal, Show } from "solid-js";
import { useNavigate } from "@tanstack/solid-router";
import { logout } from "../../../security/auth";
import { buttonClass } from "./auth-frame";
const [busy, setBusy] = createSignal(false);
const [error, setError] = createSignal("");
export function LogoutButton() {
  const navigate = useNavigate();
  const exit = async () => {
    if (busy()) return;
    setBusy(true);
    setError("");
    try {
      await logout();
      await navigate({
        to: "/login",
        search: { redirect: "/app" },
        replace: true,
      });
    } catch {
      setError(
        "Não foi possível encerrar a sessão no servidor. Tente sair novamente.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="space-y-4">
      <Show when={error()}>
        <p role="alert" class="text-sm leading-6 text-red-700">
          {error()}
        </p>
      </Show>
      <button
        type="button"
        class={buttonClass}
        onClick={() => void exit()}
        disabled={busy()}
      >
        {busy() ? "Saindo…" : "Sair"}
      </button>
    </div>
  );
}
