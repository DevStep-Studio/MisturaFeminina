import { createFileRoute, Link } from "@tanstack/solid-router";
import ArrowRight from "lucide-solid/icons/arrow-right";
import BookOpen from "lucide-solid/icons/book-open";
import ChevronRight from "lucide-solid/icons/chevron-right";
import CircleCheck from "lucide-solid/icons/circle-check";
import Clock from "lucide-solid/icons/clock";
import Sparkles from "lucide-solid/icons/sparkles";
import { For } from "solid-js";
import { StoreShell } from "../../features/storefront/components/StoreShell";
import { NAIL_GUIDES_SUMMARY } from "../../features/storefront/data/nailGuidesSummary";
import { buildBreadcrumbSchema, buildCollectionPageSchema, seoHead } from "../../lib/seo";

export const Route = createFileRoute("/guia/")({
  head: () =>
    seoHead({
      title: "Guia da Manicure & Dicas de Unhas | Mistura Feminina",
      description:
        "Conteúdos práticos e confiáveis sobre alongamento em gel, esmaltação duradoura, escolha de lixas e brocas e conservação de alicates de cutícula.",
      path: "/guia",
      jsonLd: [
        buildBreadcrumbSchema([
          { name: "Início", path: "/" },
          { name: "Guia de Unhas", path: "/guia" },
        ]),
        buildCollectionPageSchema({
          name: "Guia da Manicure & Dicas de Unhas",
          description:
            "Guias práticos e confiáveis sobre técnicas de unhas, materiais profissionais e cuidados responsáveis.",
          path: "/guia",
          items: NAIL_GUIDES_SUMMARY.map((g) => ({
            name: g.title,
            path: `/guia/${g.slug}`,
          })),
        }),
      ],
    }),
  component: GuidesHubPage,
});

function GuidesHubPage() {
  return (
    <StoreShell>
      <div class="bg-gradient-to-b from-[#FAF4FB] to-white py-10 sm:py-14 border-b border-[#F0E4F2]">
        <div class="mx-auto max-w-7xl px-4 sm:px-6">
          <nav
            aria-label="Navegação estrutural"
            class="mb-4 flex items-center gap-1.5 text-xs font-medium text-[#6B4F75]"
          >
            <Link to="/" class="hover:text-[#93509e]">
              Início
            </Link>
            <ChevronRight class="size-3.5" aria-hidden="true" />
            <span class="font-semibold text-[#2E0C49]">Guia & Dicas de Unhas</span>
          </nav>

          <div class="max-w-3xl">
            <span class="inline-flex items-center gap-1.5 rounded-full bg-[#EBDDF0] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#7C3F87]">
              <Sparkles class="size-3.5" />
              Conteúdo Educativo Oficial
            </span>
            <h1 class="mt-3 text-3xl font-extrabold tracking-tight text-[#2E0C49] sm:text-4xl">
              Guia da Manicure & Cuidados com as Unhas
            </h1>
            <p class="mt-3 text-base leading-relaxed text-[#5B486B]">
              Aprenda técnicas seguras de alongamento em gel, esmaltação profissional e escolha correta de ferramentas com orientações alinhadas ao catálogo da Mistura Feminina.
            </p>
          </div>
        </div>
      </div>

      <div class="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div class="grid grid-cols-1 gap-8 md:grid-cols-2">
          <For each={NAIL_GUIDES_SUMMARY}>
            {(guide) => (
              <article class="flex flex-col rounded-2xl border border-[#F0E4F2] bg-white p-6 shadow-xs transition hover:border-[#93509e] hover:shadow-md sm:p-8">
                <div class="flex items-center justify-between text-xs font-semibold text-[#7C3F87]">
                  <span class="inline-flex items-center gap-1 rounded-md bg-[#FAF4FB] px-2.5 py-1">
                    <BookOpen class="size-3.5" />
                    {guide.category}
                  </span>
                  <span class="inline-flex items-center gap-1 text-[#8C7A92]">
                    <Clock class="size-3.5" />
                    {guide.readTimeMinutes} min de leitura
                  </span>
                </div>

                <h2 class="mt-4 text-xl font-bold leading-snug text-[#2E0C49] hover:text-[#93509e]">
                  <Link to="/guia/$slug" params={{ slug: guide.slug }}>
                    {guide.title}
                  </Link>
                </h2>

                <p class="mt-3 flex-1 text-sm leading-relaxed text-[#5B486B]">
                  {guide.summary}
                </p>

                <div class="mt-6 flex flex-wrap gap-1.5">
                  <For each={guide.tags}>
                    {(tag) => (
                      <span class="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                        #{tag}
                      </span>
                    )}
                  </For>
                </div>

                <div class="mt-6 pt-5 border-t border-[#F5EDF7] flex items-center justify-between">
                  <Link
                    to="/categoria/$slug"
                    params={{ slug: guide.categorySlug }}
                    class="text-xs font-medium text-[#7C3F87] hover:underline"
                  >
                    Ver produtos da categoria
                  </Link>
                  <Link
                    to="/guia/$slug"
                    params={{ slug: guide.slug }}
                    class="inline-flex items-center gap-1.5 text-sm font-bold text-[#93509e] hover:text-[#7C3F87]"
                  >
                    <span>Ler guia completo</span>
                    <ArrowRight class="size-4" />
                  </Link>
                </div>
              </article>
            )}
          </For>
        </div>

        {/* Informative Assurance Box */}
        <section class="mt-14 rounded-2xl border border-[#E5D4EC] bg-[#FAF6FC] p-6 sm:p-8">
          <div class="flex flex-col sm:flex-row gap-5 items-start">
            <div class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#93509e] text-white">
              <CircleCheck class="size-6" />
            </div>
            <div>
              <h3 class="text-lg font-bold text-[#2E0C49]">
                Compromisso com Informação Responsável
              </h3>
              <p class="mt-2 text-sm leading-relaxed text-[#5B486B]">
                Nossos guias técnicos têm finalidade estritamente informativa e de orientação profissional. Não fazemos promessas terapêuticas nem incentivamos práticas agressivas à lâmina ungueal. Priorize sempre a biossegurança, a esterilização de materiais e o respeito à fisiologia natural da unha.
              </p>
              <div class="mt-4 flex flex-wrap gap-4 text-xs font-semibold text-[#7C3F87]">
                <Link
                  to="/categoria/$slug"
                  params={{ slug: "alongamento-unhas" }}
                  class="hover:underline"
                >
                  • Ver Alongamento de Unhas
                </Link>
                <Link
                  to="/categoria/$slug"
                  params={{ slug: "esmalte-em-gel" }}
                  class="hover:underline"
                >
                  • Ver Esmaltes em Gel
                </Link>
                <Link
                  to="/categoria/$slug"
                  params={{ slug: "lixas" }}
                  class="hover:underline"
                >
                  • Ver Lixas e Niveladores
                </Link>
                <Link
                  to="/categoria/$slug"
                  params={{ slug: "alicates-e-cortadores" }}
                  class="hover:underline"
                >
                  • Ver Alicates Profissionais
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </StoreShell>
  );
}
