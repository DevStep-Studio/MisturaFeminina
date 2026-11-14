import Eye from "lucide-solid/icons/eye";
import EyeOff from "lucide-solid/icons/eye-off";
import ArrowRight from "lucide-solid/icons/arrow-right";
import { AuthFrame, inputClass, buttonClass, linkClass } from "./auth-frame";
import { session } from "../../../security/session";
import { createForm } from "@tanstack/solid-form";
import { useNavigate } from "@tanstack/solid-router";
import { createSignal, Show, For, onCleanup } from "solid-js";
import { loginSchema, mfaSchema } from "../schemas/auth.schema";
import { completeMfa, login } from "../api/mutations";
import { safeRedirect } from "../../../security/safe-redirect";
import { ApiError } from "../../../lib/api-error";
import { reportError } from "../../../monitoring/error-handler";
import { trackEvent } from "../../../monitoring/analytics";

export function LoginPage(props: { redirect?: string }) {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = createSignal(false);
  const [error, setError] = createSignal("");
  const [fieldErrors, setFieldErrors] = createSignal<Record<string, string[]>>(
    {},
  );
  const [mfa, setMfa] = createSignal(false);
  const [code, setCode] = createSignal("");
  const [verifying, setVerifying] = createSignal(false);
  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });
  const finish = async () => {
    trackEvent("login", { method: "password" });
    await navigate({ to: safeRedirect(props.redirect), replace: true });
  };
  const handleError = (reason: unknown) => {
    reportError(reason, "login");
    setFieldErrors(reason instanceof ApiError ? reason.validation : {});
    setError(
      reason instanceof ApiError
        ? reason.status === 422
          ? mfa()
            ? "Código inválido. Tente novamente."
            : "E-mail ou senha inválidos. Revise os dados informados."
          : reason.message
        : "Não foi possível entrar. Tente novamente.",
    );
  };
  const form = createForm(() => ({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: loginSchema },
    onSubmit: async ({ value }) => {
      setError("");
      setFieldErrors({});
      try {
        const result = await login(value);
        form.setFieldValue("password", "");
        if (disposed) return;
        if (result === "mfa") setMfa(true);
        else await finish();
      } catch (reason) {
        form.setFieldValue("password", "");
        if (!disposed) handleError(reason);
      }
    },
  }));
  const verify = async (event: SubmitEvent) => {
    event.preventDefault();
    const parsed = mfaSchema.safeParse({ code: code() });
    if (!parsed.success) {
      setError("Informe o código de seis dígitos.");
      return;
    }
    if (verifying()) return;
    setVerifying(true);
    setError("");
    try {
      await completeMfa(parsed.data.code);
      setCode("");
      await finish();
    } catch (reason) {
      handleError(reason);
    } finally {
      setVerifying(false);
    }
  };
  return (
    <AuthFrame
      presentation
      title={mfa() ? "Verifique sua identidade" : "Entrar"}
      description={
        mfa()
          ? "Informe o código do seu aplicativo autenticador."
          : "Use seu e-mail e senha para continuar."
      }
    >
      <Show when={session.expired()}>
        <p class="mb-5 text-sm text-zinc-600" role="status">
          Sua sessão expirou. Entre novamente para continuar.
        </p>
      </Show>
      <Show when={error()}>
        <p class="mb-5 text-sm leading-6 text-red-700" role="alert">
          {error()}
        </p>
      </Show>
      <Show
        when={!mfa()}
        fallback={
          <form class="space-y-4" onSubmit={verify}>
            <div class="space-y-2">
              <label
                class="block text-sm font-medium text-zinc-900"
                for="mfa-code"
              >
                Código de verificação
              </label>
              <input
                class={inputClass}
                id="mfa-code"
                name="code"
                inputmode="numeric"
                autocomplete="one-time-code"
                maxlength={6}
                value={code()}
                onInput={(event) => setCode(event.currentTarget.value)}
                required
              />
            </div>
            <button
              class={`${buttonClass} w-full`}
              type="submit"
              disabled={verifying()}
            >
              {verifying() ? "Verificando…" : "Verificar código"}
            </button>
            <button
              class={linkClass}
              type="button"
              onClick={() => {
                setMfa(false);
                setCode("");
                setError("");
              }}
            >
              Voltar ao login
            </button>
          </form>
        }
      >
        <form
          class="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <For each={["email", "password"] as const}>
            {(name) => (
              <form.Field name={name}>
                {(field) => (
                  <div class="space-y-2">
                    <label
                      class="block text-sm font-medium text-zinc-900"
                      for={`login-${name}`}
                    >
                      {name === "email" ? "E-mail" : "Senha"}
                    </label>
                    <div class="relative">
                      <input
                        class={`${inputClass} ${name === "password" ? "pr-12" : ""}`}
                        id={`login-${name}`}
                        name={name}
                        type={
                          name === "email"
                            ? "email"
                            : showPassword()
                              ? "text"
                              : "password"
                        }
                        autocomplete={
                          name === "email" ? "username" : "current-password"
                        }
                        value={field().state.value}
                        onBlur={field().handleBlur}
                        onInput={(event) =>
                          field().handleChange(event.currentTarget.value)
                        }
                        aria-invalid={
                          field().state.meta.errors.length > 0 ||
                          !!fieldErrors()[name]
                        }
                        aria-describedby={`${name}-errors`}
                        required
                      />
                      <Show when={name === "password"}>
                        <button
                          type="button"
                          class="absolute inset-y-0 right-0.5 my-0.5 grid w-11 place-items-center rounded-md text-zinc-400 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-zinc-900"
                          aria-label={
                            showPassword() ? "Ocultar senha" : "Mostrar senha"
                          }
                          aria-pressed={showPassword()}
                          onClick={() => setShowPassword(!showPassword())}
                        >
                          {showPassword() ? (
                            <EyeOff size={18} aria-hidden="true" />
                          ) : (
                            <Eye size={18} aria-hidden="true" />
                          )}
                        </button>
                      </Show>
                    </div>
                    <div
                      id={`${name}-errors`}
                      class="space-y-1 text-sm text-red-700"
                    >
                      <For each={field().state.meta.errors}>
                        {(issue) => (
                          <p>
                            {typeof issue === "string" ? issue : issue?.message}
                          </p>
                        )}
                      </For>
                      <For each={fieldErrors()[name]}>
                        {(message) => <p>{message}</p>}
                      </For>
                    </div>
                  </div>
                )}
              </form.Field>
            )}
          </For>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(busy) => (
              <button
                class={`${buttonClass} w-full`}
                type="submit"
                disabled={busy()}
              >
                {busy() ? "Entrando…" : "Entrar"}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            )}
          </form.Subscribe>
          <a class={`${linkClass} inline-block`} href="/forgot-password">
            Esqueci minha senha
          </a>
        </form>
      </Show>
    </AuthFrame>
  );
}
