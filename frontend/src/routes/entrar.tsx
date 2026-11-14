import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import { Show, createSignal } from "solid-js";
import { StoreShell } from "../features/storefront/components/StoreShell";
import { refreshCart } from "../features/storefront/store";
import { ApiError } from "../lib/api";
import { seoHead } from "../lib/seo";
import { completeMfa, login } from "../security/auth";
import { hasPermission } from "../security/permissions";
import { safeRedirect } from "../security/safe-redirect";
import { session } from "../security/session";

export const Route = createFileRoute("/entrar")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect:
      typeof search.redirect === "string" ? safeRedirect(search.redirect) : "",
  }),
  head: () =>
    seoHead({
      title: "Entrar na Conta — Mistura Feminina Cosméticos",
      description: "Acesse seus pedidos, favoritos e endereços.",
      path: "/entrar",
      noindex: true,
    }),
  component: StoreLoginPage,
});

function StoreLoginPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [mfaStep, setMfaStep] = createSignal(false);
  const [code, setCode] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  async function goNext() {
    await refreshCart();
    const target = search().redirect;
    if (target && target !== "/app") {
      await navigate({ to: target });
      return;
    }
    if (hasPermission(session.user()?.permissions ?? [], "dashboard.view")) {
      await navigate({ to: "/admin" });
      return;
    }
    await navigate({ to: "/minha-conta" });
  }

  async function submitLogin(e: Event) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const outcome = await login({
        email: email().trim(),
        password: password(),
      });
      if (outcome === "mfa") {
        setMfaStep(true);
      } else {
        await goNext();
      }
    } catch (err) {
      setPassword("");
      setError(
        err instanceof ApiError ? err.message : "E-mail ou senha inválidos.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitMfa(e: Event) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await completeMfa(code().trim());
      await goNext();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Código inválido.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <StoreShell>
      <div class="mx-auto max-w-md px-4 py-12">
        <div class="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8">
          <div class="mb-5 flex justify-center">
            <img
              src="/logo-mf.png"
              alt="Mistura Feminina Cosméticos"
              class="h-12 w-auto object-contain"
            />
          </div>
          <Show
            when={!mfaStep()}
            fallback={
              <form onSubmit={submitMfa} class="space-y-4">
                <h1 class="text-xl font-bold text-zinc-900">
                  Verificação em duas etapas
                </h1>
                <p class="text-sm text-zinc-600">
                  Informe o código de 6 dígitos do seu aplicativo autenticador
                  ou código de recuperação.
                </p>
                <div>
                  <label
                    for="st-mfa"
                    class="block text-xs font-semibold text-zinc-700"
                  >
                    Código de verificação
                  </label>
                  <input
                    id="st-mfa"
                    type="text"
                    required
                    value={code()}
                    onInput={(e) => setCode(e.currentTarget.value)}
                    class="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm"
                  />
                </div>
                <Show when={error()}>
                  <p
                    role="alert"
                    class="rounded-md bg-red-50 p-2.5 text-xs font-medium text-red-700"
                  >
                    {error()}
                  </p>
                </Show>
                <button
                  type="submit"
                  disabled={busy()}
                  class="h-11 w-full rounded-lg bg-[var(--mf-primary)] text-sm font-bold text-white hover:bg-[var(--mf-primary-hover)]"
                >
                  {busy() ? "Verificando..." : "Confirmar código"}
                </button>
              </form>
            }
          >
            <h1 class="text-center text-2xl font-bold text-zinc-900">
              Entrar na sua conta
            </h1>
            <p class="mt-1 text-center text-sm text-zinc-600">
              Acompanhe seus pedidos, favoritos e endereços salvos.
            </p>

            <form onSubmit={submitLogin} class="mt-6 space-y-4">
              <div>
                <label
                  for="st-email"
                  class="block text-xs font-semibold text-zinc-700"
                >
                  E-mail
                </label>
                <input
                  id="st-email"
                  type="email"
                  required
                  value={email()}
                  onInput={(e) => setEmail(e.currentTarget.value)}
                  class="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm"
                />
              </div>

              <div>
                <div class="flex items-center justify-between">
                  <label
                    for="st-pass"
                    class="block text-xs font-semibold text-zinc-700"
                  >
                    Senha
                  </label>
                  <Link
                    to="/forgot-password"
                    class="text-xs font-medium text-[var(--mf-primary)] hover:underline"
                  >
                    Esqueci minha senha
                  </Link>
                </div>
                <input
                  id="st-pass"
                  type="password"
                  required
                  value={password()}
                  onInput={(e) => setPassword(e.currentTarget.value)}
                  class="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm"
                />
              </div>

              <Show when={error()}>
                <p
                  role="alert"
                  class="rounded-md border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-800"
                >
                  {error()}
                </p>
              </Show>

              <button
                type="submit"
                disabled={busy()}
                class="h-11 w-full rounded-lg bg-[var(--mf-primary)] text-sm font-bold text-white transition hover:bg-[var(--mf-primary-hover)] disabled:opacity-60"
              >
                {busy() ? "Entrando..." : "Entrar"}
              </button>
            </form>

            <div class="mt-6 border-t border-zinc-200 pt-4 text-center text-sm text-zinc-600">
              Ainda não tem cadastro?{" "}
              <Link
                to="/cadastro"
                class="font-bold text-[var(--mf-primary)] hover:underline"
              >
                Criar conta grátis
              </Link>
            </div>
          </Show>
        </div>
      </div>
    </StoreShell>
  );
}
