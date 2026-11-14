import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import { Show, createSignal } from "solid-js";
import { StoreShell } from "../features/storefront/components/StoreShell";
import { refreshCart } from "../features/storefront/store";
import { ApiError } from "../lib/api";
import { formatCpfCnpj, formatPhone } from "../lib/format";
import { seoHead } from "../lib/seo";
import { registerCustomer } from "../security/auth";

export const Route = createFileRoute("/cadastro")({
  head: () =>
    seoHead({
      title: "Criar Conta — Mistura Feminina Cosméticos",
      description: "Cadastre-se na Mistura Feminina Cosméticos.",
      path: "/cadastro",
      noindex: true,
    }),
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [phone, setPhone] = createSignal("");
  const [cpf, setCpf] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [confirmPassword, setConfirmPassword] = createSignal("");
  const [acceptLgpd, setAcceptLgpd] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setError(null);
    if (!acceptLgpd()) {
      setError("Aceite os termos de privacidade para criar sua conta.");
      return;
    }
    if (password() !== confirmPassword()) {
      setError("As senhas digitadas não conferem.");
      return;
    }
    setBusy(true);
    try {
      await registerCustomer({
        name: name().trim(),
        email: email().trim(),
        password: password(),
        password_confirmation: confirmPassword(),
        phone: phone().trim() || undefined,
        cpf_cnpj: cpf().trim() || undefined,
      });
      await refreshCart();
      await navigate({ to: "/minha-conta" });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível concluir seu cadastro. Verifique os campos.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <StoreShell>
      <div class="mx-auto max-w-lg px-4 py-10">
        <div class="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8">
          <h1 class="text-2xl font-bold text-zinc-900">Criar Conta</h1>
          <p class="mt-1 text-sm text-zinc-600">
            Compre mais rápido e acompanhe todos os seus pedidos em um só lugar.
          </p>

          <form onSubmit={handleSubmit} class="mt-6 space-y-4">
            <div>
              <label
                for="reg-name"
                class="block text-xs font-semibold text-zinc-700"
              >
                Nome completo *
              </label>
              <input
                id="reg-name"
                type="text"
                required
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
                class="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm"
              />
            </div>

            <div>
              <label
                for="reg-email"
                class="block text-xs font-semibold text-zinc-700"
              >
                E-mail *
              </label>
              <input
                id="reg-email"
                type="email"
                required
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                class="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm"
              />
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  for="reg-phone"
                  class="block text-xs font-semibold text-zinc-700"
                >
                  WhatsApp
                </label>
                <input
                  id="reg-phone"
                  type="tel"
                  value={phone()}
                  onInput={(e) => setPhone(formatPhone(e.currentTarget.value))}
                  placeholder="(11) 99999-9999"
                  class="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm"
                />
              </div>
              <div>
                <label
                  for="reg-cpf"
                  class="block text-xs font-semibold text-zinc-700"
                >
                  CPF ou CNPJ
                </label>
                <input
                  id="reg-cpf"
                  type="text"
                  value={cpf()}
                  onInput={(e) => setCpf(formatCpfCnpj(e.currentTarget.value))}
                  placeholder="000.000.000-00"
                  class="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm"
                />
              </div>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  for="reg-pass"
                  class="block text-xs font-semibold text-zinc-700"
                >
                  Senha (mín. 8 caracteres) *
                </label>
                <input
                  id="reg-pass"
                  type="password"
                  required
                  minLength={8}
                  value={password()}
                  onInput={(e) => setPassword(e.currentTarget.value)}
                  class="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm"
                />
              </div>
              <div>
                <label
                  for="reg-pass2"
                  class="block text-xs font-semibold text-zinc-700"
                >
                  Confirmar senha *
                </label>
                <input
                  id="reg-pass2"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword()}
                  onInput={(e) => setConfirmPassword(e.currentTarget.value)}
                  class="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm"
                />
              </div>
            </div>

            <label class="flex cursor-pointer items-start gap-2 text-xs text-zinc-700">
              <input
                type="checkbox"
                checked={acceptLgpd()}
                onChange={(e) => setAcceptLgpd(e.currentTarget.checked)}
                class="mt-0.5 h-4 w-4 accent-[var(--mf-primary)]"
              />
              <span>
                Li e concordo com os{" "}
                <Link
                  to="/$slug"
                  params={{ slug: "termos" }}
                  class="font-semibold underline"
                >
                  Termos de Uso
                </Link>{" "}
                e a{" "}
                <Link
                  to="/$slug"
                  params={{ slug: "privacidade" }}
                  class="font-semibold underline"
                >
                  Política de Privacidade (LGPD)
                </Link>
                .
              </span>
            </label>

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
              class="h-11 w-full rounded-lg bg-[var(--mf-primary)] text-sm font-bold text-white hover:bg-[var(--mf-primary-hover)] disabled:opacity-60"
            >
              {busy() ? "Criando conta..." : "Cadastrar e entrar"}
            </button>
          </form>

          <p class="mt-5 text-center text-sm text-zinc-600">
            Já possui conta?{" "}
            <Link
              to="/entrar"
              search={{ redirect: "/minha-conta" }}
              class="font-bold text-[var(--mf-primary)] hover:underline"
            >
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </StoreShell>
  );
}
