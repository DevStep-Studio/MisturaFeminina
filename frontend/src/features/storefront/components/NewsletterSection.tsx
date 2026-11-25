import { Link } from "@tanstack/solid-router";
import CircleCheck from "lucide-solid/icons/circle-check";
import CircleX from "lucide-solid/icons/circle-x";
import Mail from "lucide-solid/icons/mail";
import Send from "lucide-solid/icons/send";
import User from "lucide-solid/icons/user";
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
      class="mf-scroll-reveal border-t border-[#EBD4EC] bg-[#FAF5FB] py-10 sm:py-12"
    >
      <div class="mx-auto max-w-7xl px-4 sm:px-6">
        <div class="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          {/* Header */}
          <div class="max-w-xl">
            <h2
              id="newsletter-heading"
              class="text-xl font-bold tracking-tight text-[#2E1049] sm:text-2xl"
            >
              Cadastre-se em nossa newsletter
            </h2>
            <p class="mt-1 text-xs text-[#523B66] sm:text-sm">
              Receba novidades, reposições e ofertas exclusivas em primeira mão.
            </p>
          </div>

          {/* Form with Icons in Inputs */}
          <form
            onSubmit={handleSubmit}
            class="w-full max-w-xl space-y-3"
            novalidate
          >
            <div class="flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <div class="relative flex-1">
                <label for="nl-name" class="sr-only">
                  Nome
                </label>
                <User
                  class="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#93509e]/70"
                  aria-hidden="true"
                />
                <input
                  id="nl-name"
                  type="text"
                  value={name()}
                  onInput={(e) => setName(e.currentTarget.value)}
                  placeholder="Digite o seu nome"
                  class="h-11 w-full rounded-xl border border-[#E2D2E6] bg-white pl-10 pr-4 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-2xs transition focus:border-[#93509e] focus:outline-none focus:ring-2 focus:ring-[#93509e]/20"
                />
              </div>

              <div class="relative flex-[1.15]">
                <label for="nl-email" class="sr-only">
                  E-mail
                </label>
                <Mail
                  class="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#93509e]/70"
                  aria-hidden="true"
                />
                <input
                  id="nl-email"
                  type="email"
                  required
                  value={email()}
                  onInput={(e) => setEmail(e.currentTarget.value)}
                  placeholder="Digite seu e-mail"
                  class="h-11 w-full rounded-xl border border-[#E2D2E6] bg-white pl-10 pr-4 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-2xs transition focus:border-[#93509e] focus:outline-none focus:ring-2 focus:ring-[#93509e]/20"
                />
              </div>

              <button
                type="submit"
                disabled={busy()}
                class="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#93509e] px-6 text-xs font-bold uppercase tracking-wider text-white shadow-2xs transition hover:bg-[#7c3f87] active:scale-[0.99] disabled:opacity-60"
              >
                <span>{busy() ? "ENVIANDO..." : "CADASTRAR"}</span>
                <Send class="size-3.5" aria-hidden="true" />
              </button>
            </div>

            <label class="flex cursor-pointer items-start gap-2 pt-0.5 text-xs text-[#523B66]">
              <input
                type="checkbox"
                checked={consent()}
                onChange={(e) => setConsent(e.currentTarget.checked)}
                class="mt-0.5 size-4 rounded border-[#93509e] text-[#93509e] accent-[#93509e] focus:ring-2 focus:ring-[#93509e]/30"
              />
              <span>
                Concordo em receber novidades e ofertas da Mistura Feminina conforme a{" "}
                <Link
                  to="/$slug"
                  params={{ slug: "privacidade" }}
                  class="font-semibold text-[#2E1049] underline decoration-[#93509e]/40 underline-offset-2 hover:text-[#93509e]"
                >
                  Política de Privacidade
                </Link>
                .
              </span>
            </label>

            <Show when={feedback()}>
              {(fb) => (
                <div
                  role={fb().type === "err" ? "alert" : "status"}
                  class={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-medium ${
                    fb().type === "ok"
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border border-red-200 bg-red-50 text-red-800"
                  }`}
                >
                  <Show
                    when={fb().type === "ok"}
                    fallback={<CircleX class="size-4 shrink-0 text-red-600" aria-hidden="true" />}
                  >
                    <CircleCheck class="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  </Show>
                  <span>{fb().text}</span>
                </div>
              )}
            </Show>
          </form>
        </div>
      </div>
    </section>
  );
}
