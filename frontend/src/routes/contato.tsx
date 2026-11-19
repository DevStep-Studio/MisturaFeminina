import { createFileRoute } from "@tanstack/solid-router";
import MessageCircle from "lucide-solid/icons/message-circle";
import { Show, createSignal } from "solid-js";
import { StoreShell } from "../features/storefront/components/StoreShell";
import { storefrontStore } from "../features/storefront/store";
import { ApiError, api } from "../lib/api";
import { whatsappUrl } from "../lib/format";
import { buildBreadcrumbSchema, seoHead } from "../lib/seo";
import { trackContactClick } from "../monitoring/analytics";

export const Route = createFileRoute("/contato")({
  head: () =>
    seoHead({
      title: "Fale Conosco e Atendimento | Mistura Feminina",
      description:
        "Entre em contato com a equipe da Mistura Feminina Cosméticos. Atendimento rápido via WhatsApp e e-mail para todo o Brasil.",
      path: "/contato",
      jsonLd: buildBreadcrumbSchema([
        { name: "Início", path: "/" },
        { name: "Contato", path: "/contato" },
      ]),
    }),
  component: ContactPage,
});

function ContactPage() {
  const settings = () => storefrontStore.settings();
  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [phone, setPhone] = createSignal("");
  const [subject, setSubject] = createSignal("");
  const [message, setMessage] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [feedback, setFeedback] = createSignal<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const res = await api<{ message: string }>("/storefront/contact", {
        method: "POST",
        authenticated: false,
        body: {
          name: name().trim(),
          email: email().trim(),
          phone: phone().trim() || undefined,
          subject: subject().trim(),
          message: message().trim(),
        },
      });
      setFeedback({
        type: "ok",
        text: res.message || "Mensagem enviada com sucesso!",
      });
      trackContactClick("form");
      setName("");
      setEmail("");
      setPhone("");
      setSubject("");
      setMessage("");
    } catch (err) {
      setFeedback({
        type: "err",
        text:
          err instanceof ApiError
            ? err.message
            : "Não foi possível enviar sua mensagem.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <StoreShell>
      <div class="mx-auto grid max-w-5xl gap-8 px-4 py-10 md:grid-cols-12">
        <div class="space-y-4 md:col-span-5">
          <h1 class="text-2xl font-bold text-zinc-900">
            Atendimento ao Cliente
          </h1>
          <p class="text-sm text-zinc-600">
            Dúvidas sobre pedidos, prazos, pagamentos ou parcerias comerciais?
            Fale conosco pelo formulário ou diretamente via WhatsApp.
          </p>
          <div class="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
            <p>
              <strong>E-mail:</strong> {settings().email}
            </p>
            <p>
              <strong>Telefone:</strong> {settings().phone}
            </p>
            <p>
              <strong>Endereço:</strong> {settings().address}
            </p>
          </div>
          <Show when={settings().whatsapp_number}>
            <a
              href={whatsappUrl(
                settings().whatsapp_number,
                settings().whatsapp_default_message,
              )}
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              <MessageCircle class="h-4 w-4" />
              Atendimento via WhatsApp
            </a>
          </Show>
        </div>

        <form
          onSubmit={handleSubmit}
          class="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 md:col-span-7"
        >
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                for="ct-name"
                class="block text-xs font-semibold text-zinc-700"
              >
                Nome *
              </label>
              <input
                id="ct-name"
                type="text"
                required
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
                class="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm"
              />
            </div>
            <div>
              <label
                for="ct-email"
                class="block text-xs font-semibold text-zinc-700"
              >
                E-mail *
              </label>
              <input
                id="ct-email"
                type="email"
                required
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                class="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm"
              />
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                for="ct-phone"
                class="block text-xs font-semibold text-zinc-700"
              >
                WhatsApp / Telefone
              </label>
              <input
                id="ct-phone"
                type="text"
                value={phone()}
                onInput={(e) => setPhone(e.currentTarget.value)}
                class="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm"
              />
            </div>
            <div>
              <label
                for="ct-subj"
                class="block text-xs font-semibold text-zinc-700"
              >
                Assunto *
              </label>
              <input
                id="ct-subj"
                type="text"
                required
                value={subject()}
                onInput={(e) => setSubject(e.currentTarget.value)}
                class="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm"
              />
            </div>
          </div>

          <div>
            <label
              for="ct-msg"
              class="block text-xs font-semibold text-zinc-700"
            >
              Mensagem *
            </label>
            <textarea
              id="ct-msg"
              rows={4}
              required
              value={message()}
              onInput={(e) => setMessage(e.currentTarget.value)}
              class="mt-1 w-full rounded-md border border-zinc-300 p-3 text-sm"
            />
          </div>

          <Show when={feedback()}>
            {(fb) => (
              <p
                role={fb().type === "err" ? "alert" : "status"}
                class={`rounded-md p-3 text-xs font-medium ${
                  fb().type === "ok"
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border border-red-200 bg-red-50 text-red-800"
                }`}
              >
                {fb().text}
              </p>
            )}
          </Show>

          <button
            type="submit"
            disabled={busy()}
            class="h-11 rounded-lg bg-[var(--mf-primary)] px-6 text-sm font-bold text-white hover:bg-[var(--mf-primary-hover)] disabled:opacity-60"
          >
            {busy() ? "Enviando..." : "Enviar mensagem"}
          </button>
        </form>
      </div>
    </StoreShell>
  );
}
