import { AuthFrame, inputClass, buttonClass, linkClass } from "./auth-frame";
import { createSignal, Show } from "solid-js";
import { api } from "../../../lib/api";
export function PasswordPage(props: { token?: string; email?: string }) {
  const [message, setMessage] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ message: string }>(
        props.token ? "/reset-password" : "/forgot-password",
        {
          scope: "auth",
          method: "POST",
          authenticated: false,
          body: {
            email: data.get("email"),
            token: props.token,
            password: data.get("password"),
            password_confirmation: data.get("password_confirmation"),
          },
        },
      );
      setMessage(result.message);
    } catch {
      setMessage(
        "Não foi possível concluir. Confira os dados e tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthFrame
      presentation
      title={props.token ? "Redefinir senha" : "Recuperar senha"}
      description="Informe seu e-mail para continuar."
    >
      <form class="space-y-5" onSubmit={(event) => void submit(event)}>
        <label class="block space-y-2 text-sm font-medium text-zinc-900">
          <span>E-mail</span>
          <input
            class={inputClass}
            name="email"
            type="email"
            autocomplete="email"
            required
            value={props.email ?? ""}
          />
        </label>
        <Show when={props.token}>
          <label class="block space-y-2 text-sm font-medium text-zinc-900">
            <span>Nova senha</span>
            <input
              class={inputClass}
              name="password"
              type="password"
              autocomplete="new-password"
              required
              minlength={12}
            />
          </label>
          <label class="block space-y-2 text-sm font-medium text-zinc-900">
            <span>Confirme a senha</span>
            <input
              class={inputClass}
              name="password_confirmation"
              type="password"
              autocomplete="new-password"
              required
              minlength={12}
            />
          </label>
          <p class="text-sm leading-6 text-zinc-600">
            Use pelo menos 12 caracteres, maiúscula, minúscula e número.
          </p>
        </Show>
        <button class={`${buttonClass} w-full`} disabled={busy()}>
          {busy() ? "Enviando…" : "Enviar"}
        </button>
      </form>
      <p class="mt-4 text-sm leading-6 text-zinc-600" role="status">
        {message()}
      </p>
      <a class={`${linkClass} mt-5 inline-block`} href="/login">
        Voltar ao login
      </a>
    </AuthFrame>
  );
}
