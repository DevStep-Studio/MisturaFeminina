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
      class="border-t border-zinc-200/80 bg-[#F7F3FA] py-8 sm:py-10"
    >
      <div class="mx-auto flex max-w-7xl flex-col gap-6 px-4 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex items-start gap-3.5">
          <div class="flex size-11 shrink-0 items-center justify-center rounded-full border border-[#E5D8EE] bg-white shadow-2xs">
            <Mail
              class="h-5 w-5 text-[#3D1260]"
              stroke-width={1.75}
              aria-hidden="true"
            />
          </div>
          <div>
            <h2
              id="newsletter-heading"
              class="text-base font-bold tracking-tight text-[#2E0C49] sm:text-lg"
            >
              Cadastre-se em nossa newsletter
            </h2>
            <p class="mt-0.5 text-xs text-[#4E3B63] sm:text-[13px]">
              Receba novidades, reposições e ofertas exclusivas em primeira mão.
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
                class="h-10 w-full rounded-full border border-zinc-200/90 bg-white px-4 text-sm text-zinc-900 placeholder:text-zinc-500 shadow-2xs transition focus:border-[#62298D] focus:outline-none focus:ring-2 focus:ring-[#3D1260]/20"
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
                class="h-10 w-full rounded-full border border-zinc-200/90 bg-white px-4 text-sm text-zinc-900 placeholder:text-zinc-500 shadow-2xs transition focus:border-[#62298D] focus:outline-none focus:ring-2 focus:ring-[#3D1260]/20"
              />
            </div>
            <button
              type="submit"
              disabled={busy()}
              class="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#3D1260] px-6 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-[#2E0C49] disabled:opacity-60"
            >
              <span>{busy() ? "ENVIANDO..." : "CADASTRAR"}</span>
              <ChevronRight class="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <label class="flex cursor-pointer items-start gap-2 pl-2 text-xs text-[#4E3B63]">
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
                class="font-semibold text-[#3D1260] underline"
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
