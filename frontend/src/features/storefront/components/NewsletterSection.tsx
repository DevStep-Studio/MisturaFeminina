import { Link } from "@tanstack/solid-router";
import ChevronRight from "lucide-solid/icons/chevron-right";
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
      class="bg-gradient-to-r from-[#FA74F8] via-[#FB84F8] to-[#F86CF5] py-7 sm:py-8"
    >
      <div class="mx-auto flex max-w-7xl flex-col gap-5 px-4 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex items-start gap-3.5">
          <Mail
            class="mt-0.5 h-9 w-9 shrink-0 text-[#2E0C49]"
            stroke-width={1.6}
            aria-hidden="true"
          />
          <div>
            <h2
              id="newsletter-heading"
              class="text-lg font-extrabold leading-tight text-[#2E0C49] sm:text-xl"
            >
              Cadastre-se em nossa newsletter
            </h2>
            <p class="mt-0.5 text-xs font-medium text-[#2E0C49] sm:text-sm">
              e receba novidades e promoções
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          class="w-full max-w-2xl space-y-2.5"
          novalidate
        >
          <div class="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div class="flex-1">
              <label for="nl-name" class="sr-only">
                Nome
              </label>
              <input
                id="nl-name"
                type="text"
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
                placeholder="Digite o seu nome"
                class="h-11 w-full rounded-full bg-white px-5 text-sm text-zinc-900 placeholder:text-zinc-500 shadow-xs focus:outline-none focus:ring-2 focus:ring-[#3D1260]"
              />
            </div>
            <div class="flex-[1.15]">
              <label for="nl-email" class="sr-only">
                E-mail
              </label>
              <input
                id="nl-email"
                type="email"
                required
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                placeholder="Digite seu e-mail"
                class="h-11 w-full rounded-full bg-white px-5 text-sm text-zinc-900 placeholder:text-zinc-500 shadow-xs focus:outline-none focus:ring-2 focus:ring-[#3D1260]"
              />
            </div>
            <button
              type="submit"
              disabled={busy()}
              class="inline-flex h-11 shrink-0 items-center justify-center gap-1 rounded-full bg-[#3D1260] px-7 text-xs font-extrabold uppercase tracking-wider text-white shadow-xs transition hover:bg-[#2E0C49] disabled:opacity-60"
            >
              <span>{busy() ? "ENVIANDO..." : "CADASTRAR"}</span>
              <ChevronRight class="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <label class="flex cursor-pointer items-start gap-2 pl-2 text-xs font-medium text-[#2E0C49]">
            <input
              type="checkbox"
              checked={consent()}
              onChange={(e) => setConsent(e.currentTarget.checked)}
              class="mt-0.5 h-4 w-4 rounded border-[#3D1260] accent-[#3D1260]"
            />
            <span>
              Concordo em receber e-mails promocionais da Mistura Feminina
              Cosméticos conforme a{" "}
              <Link
                to="/$slug"
                params={{ slug: "privacidade" }}
                class="font-bold underline"
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
