import { Link } from "@tanstack/solid-router";
import Mail from "lucide-solid/icons/mail";
import { Show, createSignal } from "solid-js";
import { ApiError, api } from "../../../lib/api";

export function NewsletterSection() {
  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [consent, setConsent] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [feedback, setFeedback] = createSignal<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setFeedback(null);
    if (!email().trim()) {
      setFeedback({ type: "err", text: "Informe seu melhor e-mail." });
      return;
    }
    if (!consent()) {
      setFeedback({
        type: "err",
        text: "Confirme o aceite para receber novidades e ofertas.",
      });
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ message: string }>(
        "/storefront/newsletter/subscribe",
        {
          method: "POST",
          authenticated: false,
          body: {
            email: email().trim(),
            name: name().trim() || undefined,
            consent: true,
          },
        },
      );
      setFeedback({
        type: "ok",
        text: res.message || "Cadastro realizado com sucesso!",
      });
      setEmail("");
      setName("");
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Não foi possível concluir seu cadastro agora.";
      setFeedback({ type: "err", text: msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="newsletter-heading"
      class="border-y border-zinc-200 bg-zinc-100 py-10"
    >
      <div class="mx-auto flex max-w-7xl flex-col gap-6 px-4 lg:flex-row lg:items-center lg:justify-between">
        <div class="max-w-lg space-y-1.5">
          <div class="inline-flex items-center gap-2 text-sm font-semibold text-[var(--mf-primary)]">
            <Mail class="h-4 w-4" />
            <span>Clube de Ofertas Mistura Feminina</span>
          </div>
          <h2
            id="newsletter-heading"
            class="text-xl font-bold text-zinc-900 sm:text-2xl"
          >
            Receba lançamentos, cupons e promoções em primeira mão
          </h2>
          <p class="text-sm text-zinc-600">
            Respeitamos sua privacidade conforme a LGPD. Você pode cancelar o
            envio quando quiser.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          class="w-full max-w-xl space-y-3"
          novalidate
        >
          <div class="grid gap-2.5 sm:grid-cols-3">
            <div>
              <label for="nl-name" class="sr-only">
                Nome
              </label>
              <input
                id="nl-name"
                type="text"
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
                placeholder="Seu nome (opcional)"
                class="h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 focus:border-[var(--mf-primary)] focus:outline-none"
              />
            </div>
            <div class="sm:col-span-2 flex flex-col gap-2.5 sm:flex-row">
              <label for="nl-email" class="sr-only">
                E-mail
              </label>
              <input
                id="nl-email"
                type="email"
                required
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                placeholder="seuemail@exemplo.com"
                class="h-11 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 focus:border-[var(--mf-primary)] focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy()}
                class="h-11 shrink-0 rounded-lg bg-[var(--mf-primary)] px-5 text-sm font-semibold text-white transition hover:bg-[var(--mf-primary-hover)] disabled:opacity-60"
              >
                {busy() ? "Enviando..." : "Quero receber"}
              </button>
            </div>
          </div>

          <label class="flex cursor-pointer items-start gap-2 text-xs text-zinc-700">
            <input
              type="checkbox"
              checked={consent()}
              onChange={(e) => setConsent(e.currentTarget.checked)}
              class="mt-0.5 h-4 w-4 rounded border-zinc-300 accent-[var(--mf-primary)]"
            />
            <span>
              Concordo em receber e-mails promocionais da Mistura Feminina
              Cosméticos conforme a{" "}
              <Link
                to="/$slug"
                params={{ slug: "privacidade" }}
                class="font-medium underline"
              >
                Política de Privacidade
              </Link>
              .
            </span>
          </label>

          <Show when={feedback()}>
            {(fb) => (
              <p
                role={fb().type === "err" ? "alert" : "status"}
                class={`rounded-md px-3 py-2 text-xs font-medium ${
                  fb().type === "ok"
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border border-red-200 bg-red-50 text-red-800"
                }`}
              >
                {fb().text}
              </p>
            )}
          </Show>
        </form>
      </div>
    </section>
  );
}
