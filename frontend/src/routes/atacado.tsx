import { createFileRoute } from "@tanstack/solid-router";
import Boxes from "lucide-solid/icons/boxes";
import UserCheck from "lucide-solid/icons/user-check";
import X from "lucide-solid/icons/x";
import { Show, createSignal } from "solid-js";
import { api } from "../lib/api";
import { buildBreadcrumbSchema, seoHead } from "../lib/seo";
import { CatalogListingView } from "../features/storefront/components/CatalogListingView";
import { storefrontStore } from "../features/storefront/store";

export const Route = createFileRoute("/atacado")({
  head: () =>
    seoHead({
      title: "Atacado e Preços por Quantidade | Mistura Feminina Cosméticos",
      description:
        "Compre no atacado na Mistura Feminina: descontos progressivos por quantidade, liberdade para misturar cores e tonalidades na mesma linha e condições para revendedoras e salões.",
      path: "/atacado",
      jsonLd: buildBreadcrumbSchema([
        { name: "Início", path: "/" },
        { name: "Atacado", path: "/atacado" },
      ]),
    }),
  component: WholesaleStorefrontPage,
});

function WholesaleStorefrontPage() {
  const [modalOpen, setModalOpen] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [feedback, setFeedback] = createSignal<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const [form, setForm] = createSignal({
    name: "",
    email: "",
    phone: "",
    cnpj_cpf: "",
    company_name: "",
    trade_name: "",
    state_registration: "",
    notes: "",
  });

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);

    try {
      await api.post("/wholesale/reseller-request", form());
      setFeedback({
        type: "ok",
        text: "Solicitação enviada com sucesso! Nossa equipe entrará em contato para liberar suas condições exclusivas.",
      });
      setForm({
        name: "",
        email: "",
        phone: "",
        cnpj_cpf: "",
        company_name: "",
        trade_name: "",
        state_registration: "",
        notes: "",
      });
      setTimeout(() => {
        setModalOpen(false);
        setFeedback(null);
      }, 4000);
    } catch {
      setFeedback({
        type: "err",
        text: "Ocorreu um erro ao enviar sua solicitação. Verifique os dados ou entre em contato pelo WhatsApp.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <CatalogListingView
        title="Atacado"
        subtitle="Descontos progressivos automáticos por quantidade. Misture cores e tonalidades livremente da mesma linha para atingir as faixas de atacado."
        breadcrumbs={[
          { label: "Início", to: "/" },
          { label: "Atacado" },
        ]}
        endpoint="/wholesale/catalog"
        brands={storefrontStore.bootstrap().brands}
        showFilters={true}
        headerAction={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            class="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#93509e] bg-white px-3.5 text-xs font-bold text-[#93509e] shadow-xs transition-colors hover:bg-[#93509e] hover:text-white"
          >
            <UserCheck class="size-3.5" />
            <span>Cadastre-se como Revendedora</span>
          </button>
        }
      />

      {/* Reseller Registration Modal */}
      <Show when={modalOpen()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div class="relative w-full max-w-lg rounded-2xl border border-[#E5C2EA] bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              aria-label="Fechar"
              class="absolute right-4 top-4 text-zinc-400 hover:text-zinc-600"
            >
              <X class="size-5" />
            </button>

            <div class="flex items-center gap-2 text-[#2E0C49]">
              <Boxes class="size-6 text-[#93509e]" />
              <h3 class="text-lg font-bold">
                Cadastro de Revendedora / Atacado
              </h3>
            </div>
            <p class="mt-1 text-xs text-[#5B486B]">
              Cadastre sua empresa ou salão para ter acesso a tabelas
              exclusivas, compras em grande volume e atendimento personalizado.
            </p>

            <Show when={feedback()}>
              {(fb) => (
                <div
                  class={`mt-4 rounded-lg p-3 text-xs font-semibold ${
                    fb().type === "ok"
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border border-red-200 bg-red-50 text-red-800"
                  }`}
                >
                  {fb().text}
                </div>
              )}
            </Show>

            <form onSubmit={handleSubmit} class="mt-4 space-y-3">
              <div>
                <label
                  for="reseller-name"
                  class="block text-xs font-bold text-[#3D1260]"
                >
                  Nome do Responsável *
                </label>
                <input
                  id="reseller-name"
                  type="text"
                  required
                  value={form().name}
                  onInput={(e) =>
                    setForm({ ...form(), name: e.currentTarget.value })
                  }
                  class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs focus:border-[#93509e] focus:outline-hidden"
                  placeholder="Seu nome completo"
                />
              </div>

              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    for="reseller-email"
                    class="block text-xs font-bold text-[#3D1260]"
                  >
                    E-mail *
                  </label>
                  <input
                    id="reseller-email"
                    type="email"
                    required
                    value={form().email}
                    onInput={(e) =>
                      setForm({ ...form(), email: e.currentTarget.value })
                    }
                    class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs focus:border-[#93509e] focus:outline-hidden"
                    placeholder="email@exemplo.com"
                  />
                </div>
                <div>
                  <label
                    for="reseller-phone"
                    class="block text-xs font-bold text-[#3D1260]"
                  >
                    WhatsApp / Telefone *
                  </label>
                  <input
                    id="reseller-phone"
                    type="tel"
                    required
                    value={form().phone}
                    onInput={(e) =>
                      setForm({ ...form(), phone: e.currentTarget.value })
                    }
                    class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs focus:border-[#93509e] focus:outline-hidden"
                    placeholder="(11) 99999-9999"
                  />
                </div>
              </div>

              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    for="reseller-doc"
                    class="block text-xs font-bold text-[#3D1260]"
                  >
                    CNPJ ou CPF *
                  </label>
                  <input
                    id="reseller-doc"
                    type="text"
                    required
                    value={form().cnpj_cpf}
                    onInput={(e) =>
                      setForm({ ...form(), cnpj_cpf: e.currentTarget.value })
                    }
                    class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs focus:border-[#93509e] focus:outline-hidden"
                    placeholder="00.000.000/0001-00"
                  />
                </div>
                <div>
                  <label
                    for="reseller-company"
                    class="block text-xs font-bold text-[#3D1260]"
                  >
                    Razão Social / Salão
                  </label>
                  <input
                    id="reseller-company"
                    type="text"
                    value={form().company_name}
                    onInput={(e) =>
                      setForm({
                        ...form(),
                        company_name: e.currentTarget.value,
                      })
                    }
                    class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs focus:border-[#93509e] focus:outline-hidden"
                    placeholder="Nome do seu negócio"
                  />
                </div>
              </div>

              <div>
                <label
                  for="reseller-notes"
                  class="block text-xs font-bold text-[#3D1260]"
                >
                  Marcas de interesse ou Observações
                </label>
                <textarea
                  id="reseller-notes"
                  rows={2}
                  value={form().notes}
                  onInput={(e) =>
                    setForm({ ...form(), notes: e.currentTarget.value })
                  }
                  class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs focus:border-[#93509e] focus:outline-hidden"
                  placeholder="Ex: Gostaria de revender esmaltes e géis da linha Lumière..."
                />
              </div>

              <div class="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  class="rounded-lg border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={busy()}
                  class="inline-flex items-center rounded-lg bg-[#93509e] px-5 py-2 text-xs font-bold text-white transition hover:bg-[#7c3f87] disabled:opacity-50"
                >
                  <Show when={busy()} fallback={<span>Enviar Solicitação</span>}>
                    <span>Enviando...</span>
                  </Show>
                </button>
              </div>
            </form>
          </div>
        </div>
      </Show>
    </>
  );
}
