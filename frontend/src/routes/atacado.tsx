import { createFileRoute } from "@tanstack/solid-router";
import Boxes from "lucide-solid/icons/boxes";
import CheckCircle2 from "lucide-solid/icons/circle-check";
import Palette from "lucide-solid/icons/palette";
import Percent from "lucide-solid/icons/percent";
import Sparkles from "lucide-solid/icons/sparkles";
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
    <div class="min-h-screen bg-[#FCF8FD]">
      {/* Commercial Wholesale Hero Banner */}
      <section class="relative overflow-hidden bg-gradient-to-r from-[#2E0C49] via-[#4A156D] to-[#7C2784] px-4 py-12 text-white sm:px-6 lg:px-8">
        <div class="relative mx-auto max-w-7xl">
          <div class="grid items-center gap-8 lg:grid-cols-12">
            <div class="lg:col-span-8">
              <div class="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-pink-200 backdrop-blur-sm">
                <Boxes class="size-4" />
                <span>Vendas no Atacado & Varejo</span>
              </div>
              <h1 class="mt-4 text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
                Compre Mais. Aproveite Mais.
              </h1>
              <p class="mt-3 max-w-2xl text-base text-pink-100 sm:text-lg">
                Preços especiais por quantidade para manicures, nail designers,
                salões de beleza e revendedoras. Misture tonalidades livremente
                da mesma coleção para atingir as faixas de desconto!
              </p>

              <div class="mt-6 flex flex-wrap items-center gap-3">
                <a
                  href="#catalogo-atacado"
                  class="inline-flex items-center justify-center rounded-lg bg-[#93509e] px-6 py-3 text-sm font-extrabold text-white shadow-lg transition hover:bg-[#7c3f87]"
                >
                  Ver Produtos Participantes
                </a>
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  class="inline-flex items-center justify-center rounded-lg border-2 border-white/80 bg-white/10 px-6 py-3 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white hover:text-[#2E0C49]"
                >
                  <UserCheck class="mr-2 size-4" />
                  Cadastre-se como Revendedora
                </button>
              </div>
            </div>

            <div class="rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur-md lg:col-span-4">
              <h2 class="flex items-center gap-2 text-base font-bold text-pink-200">
                <Sparkles class="size-5 text-amber-300" />
                <span>Como funciona o Atacado:</span>
              </h2>
              <ul class="mt-4 space-y-3 text-xs sm:text-sm">
                <li class="flex items-start gap-2.5">
                  <CheckCircle2 class="size-4 shrink-0 text-emerald-400 mt-0.5" />
                  <span>
                    <strong>Desconto automático:</strong> Ao atingir a
                    quantidade mínima, o preço cai no carrinho.
                  </span>
                </li>
                <li class="flex items-start gap-2.5">
                  <Palette class="size-4 shrink-0 text-pink-300 mt-0.5" />
                  <span>
                    <strong>Misture cores:</strong> Selecione 2 de uma cor, 3 de
                    outra e 1 de outra — soma tudo para o atacado!
                  </span>
                </li>
                <li class="flex items-start gap-2.5">
                  <Percent class="size-4 shrink-0 text-amber-300 mt-0.5" />
                  <span>
                    <strong>Faixas progressivas:</strong> Descontos maiores a
                    partir de 6, 12 e 24 unidades.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Catalog Grid Section with Filters */}
      <section
        id="catalogo-atacado"
        class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
      >
        <CatalogListingView
          title="Catálogo de Atacado"
          subtitle="Escolha os produtos abaixo e aproveite os preços de atacado direto no carrinho."
          breadcrumbs={[{ label: "Atacado" }]}
          endpoint="/wholesale/catalog"
          brands={storefrontStore.bootstrap().brands}
          showFilters={true}
        />
      </section>

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

            <form onSubmit={handleSubmit} class="mt-4 space-y-3 text-xs">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block font-semibold text-zinc-700">
                    Seu Nome *
                  </label>
                  <input
                    type="text"
                    required
                    value={form().name}
                    onInput={(e) =>
                      setForm((f) => ({ ...f, name: e.currentTarget.value }))
                    }
                    class="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-xs focus:border-[#93509e] focus:outline-none"
                    placeholder="Nome completo"
                  />
                </div>
                <div>
                  <label class="block font-semibold text-zinc-700">
                    E-mail *
                  </label>
                  <input
                    type="email"
                    required
                    value={form().email}
                    onInput={(e) =>
                      setForm((f) => ({ ...f, email: e.currentTarget.value }))
                    }
                    class="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-xs focus:border-[#93509e] focus:outline-none"
                    placeholder="seuemail@exemplo.com"
                  />
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block font-semibold text-zinc-700">
                    WhatsApp / Telefone *
                  </label>
                  <input
                    type="text"
                    required
                    value={form().phone}
                    onInput={(e) =>
                      setForm((f) => ({ ...f, phone: e.currentTarget.value }))
                    }
                    class="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-xs focus:border-[#93509e] focus:outline-none"
                    placeholder="(XX) 99999-9999"
                  />
                </div>
                <div>
                  <label class="block font-semibold text-zinc-700">
                    CPF ou CNPJ
                  </label>
                  <input
                    type="text"
                    value={form().cnpj_cpf}
                    onInput={(e) =>
                      setForm((f) => ({
                        ...f,
                        cnpj_cpf: e.currentTarget.value,
                      }))
                    }
                    class="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-xs focus:border-[#93509e] focus:outline-none"
                    placeholder="000.000.000-00"
                  />
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block font-semibold text-zinc-700">
                    Nome do Salão / Loja
                  </label>
                  <input
                    type="text"
                    value={form().trade_name}
                    onInput={(e) =>
                      setForm((f) => ({
                        ...f,
                        trade_name: e.currentTarget.value,
                      }))
                    }
                    class="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-xs focus:border-[#93509e] focus:outline-none"
                    placeholder="Ex: Studio Bella Unha"
                  />
                </div>
                <div>
                  <label class="block font-semibold text-zinc-700">
                    Inscrição Estadual (se houver)
                  </label>
                  <input
                    type="text"
                    value={form().state_registration}
                    onInput={(e) =>
                      setForm((f) => ({
                        ...f,
                        state_registration: e.currentTarget.value,
                      }))
                    }
                    class="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-xs focus:border-[#93509e] focus:outline-none"
                    placeholder="Isento ou número"
                  />
                </div>
              </div>

              <div>
                <label class="block font-semibold text-zinc-700">
                  Observações ou Produtos de Interesse
                </label>
                <textarea
                  rows={2}
                  value={form().notes}
                  onInput={(e) =>
                    setForm((f) => ({ ...f, notes: e.currentTarget.value }))
                  }
                  class="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-xs focus:border-[#93509e] focus:outline-none"
                  placeholder="Conte um pouco sobre suas compras habituais..."
                />
              </div>

              <div class="mt-4 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  class="rounded-lg border border-zinc-300 px-4 py-2 font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={busy()}
                  class="rounded-lg bg-[#93509e] px-5 py-2 font-bold text-white transition hover:bg-[#7c3f87] disabled:opacity-60"
                >
                  {busy() ? "Enviando..." : "Enviar Solicitação"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Show>
    </div>
  );
}
