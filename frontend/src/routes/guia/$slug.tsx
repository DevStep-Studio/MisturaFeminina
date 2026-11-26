import { createFileRoute, Link, notFound } from "@tanstack/solid-router";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import BookOpen from "lucide-solid/icons/book-open";
import Calendar from "lucide-solid/icons/calendar";
import ChevronDown from "lucide-solid/icons/chevron-down";
import ChevronRight from "lucide-solid/icons/chevron-right";
import CircleCheck from "lucide-solid/icons/circle-check";
import CircleQuestionMark from "lucide-solid/icons/circle-question-mark";
import Clock from "lucide-solid/icons/clock";
import Package from "lucide-solid/icons/package";
import Sparkles from "lucide-solid/icons/sparkles";
import { For, Show, createSignal } from "solid-js";
import { StoreShell } from "../../features/storefront/components/StoreShell";
import {
  getNailGuideBySlug,
  type NailGuideArticle,
} from "../../features/storefront/data/nailGuidesData";
import {
  buildArticleSchema,
  buildBreadcrumbSchema,
  buildFaqSchema,
  seoHead,
} from "../../lib/seo";

export const Route = createFileRoute("/guia/$slug")({
  loader: ({ params }) => {
    const guide = getNailGuideBySlug(params.slug);
    if (!guide) {
      throw notFound();
    }
    return guide;
  },
  head: ({ loaderData, params }) => {
    const guide = loaderData as NailGuideArticle | null;
    if (!guide) {
      return seoHead({
        title: "Artigo não encontrado | Mistura Feminina",
        description: "O guia solicitado não foi encontrado.",
        path: `/guia/${params.slug}`,
        noindex: true,
      });
    }

    const schemas: Array<Record<string, unknown>> = [
      buildBreadcrumbSchema([
        { name: "Início", path: "/" },
        { name: "Guia de Unhas", path: "/guia" },
        { name: guide.title, path: `/guia/${guide.slug}` },
      ]),
      buildArticleSchema({
        title: guide.title,
        description: guide.summary,
        path: `/guia/${guide.slug}`,
        datePublished: guide.datePublished,
        dateModified: guide.dateModified,
      }),
    ];

    if (guide.faqs.length > 0) {
      schemas.push(buildFaqSchema(guide.faqs));
    }

    return seoHead({
      title: `${guide.title} | Mistura Feminina`,
      description: guide.summary,
      path: `/guia/${guide.slug}`,
      type: "article",
      jsonLd: schemas,
    });
  },
  component: GuideArticlePage,
});

function GuideArticlePage() {
  const guide = Route.useLoaderData();
  const [openFaqIndex, setOpenFaqIndex] = createSignal<number | null>(0);

  const toggleFaq = (idx: number) => {
    setOpenFaqIndex((prev) => (prev === idx ? null : idx));
  };

  return (
    <StoreShell>
      <div class="bg-gradient-to-b from-[#FAF4FB] to-white py-8 sm:py-12 border-b border-[#F0E4F2]">
        <div class="mx-auto max-w-4xl px-4 sm:px-6">
          <nav
            aria-label="Navegação estrutural"
            class="mb-5 flex flex-wrap items-center gap-1.5 text-xs font-medium text-[#6B4F75]"
          >
            <Link to="/" class="hover:text-[#93509e]">
              Início
            </Link>
            <ChevronRight class="size-3.5" aria-hidden="true" />
            <Link to="/guia" class="hover:text-[#93509e]">
              Guia de Unhas
            </Link>
            <ChevronRight class="size-3.5" aria-hidden="true" />
            <span class="font-semibold text-[#2E0C49] truncate max-w-[280px] sm:max-w-md">
              {guide().title}
            </span>
          </nav>

          <div class="flex flex-wrap items-center gap-3 text-xs font-semibold text-[#7C3F87]">
            <span class="inline-flex items-center gap-1.5 rounded-full bg-[#EBDDF0] px-3 py-1">
              <BookOpen class="size-3.5" />
              {guide().category}
            </span>
            <span class="inline-flex items-center gap-1 text-[#8C7A92]">
              <Clock class="size-3.5" />
              {guide().readTimeMinutes} min de leitura
            </span>
            <span class="inline-flex items-center gap-1 text-[#8C7A92]">
              <Calendar class="size-3.5" />
              Atualizado em {guide().dateModified}
            </span>
          </div>

          <h1 class="mt-4 text-2xl font-extrabold tracking-tight text-[#2E0C49] sm:text-4xl sm:leading-tight">
            {guide().title}
          </h1>

          <p class="mt-4 text-base font-medium leading-relaxed text-[#5B486B] sm:text-lg">
            {guide().subtitle}
          </p>
        </div>
      </div>

      <div class="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <article class="prose prose-zinc max-w-none text-zinc-800 leading-relaxed [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-[#2E0C49] [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-zinc-900 [&_p]:mt-4 [&_p]:text-[15px] [&_p]:leading-relaxed [&_p.lead]:text-base [&_p.lead]:font-medium [&_p.lead]:text-[#5B486B] [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mt-2 [&_li]:text-[15px] [&_strong]:font-semibold [&_strong]:text-[#2E0C49] [&_.guide-table]:w-full [&_.guide-table]:mt-6 [&_.guide-table]:border-collapse [&_.guide-table_th]:border-b [&_.guide-table_th]:border-[#E5D4EC] [&_.guide-table_th]:bg-[#FAF6FC] [&_.guide-table_th]:px-4 [&_.guide-table_th]:py-3 [&_.guide-table_th]:text-left [&_.guide-table_th]:text-xs [&_.guide-table_th]:font-bold [&_.guide-table_th]:text-[#2E0C49] [&_.guide-table_td]:border-b [&_.guide-table_td]:border-zinc-200 [&_.guide-table_td]:px-4 [&_.guide-table_td]:py-3 [&_.guide-table_td]:text-xs [&_.guide-table_td]:text-zinc-700">
          <div innerHTML={guide().contentHtml} />
        </article>

        {/* Perguntas Frequentes (FAQ) */}
        <Show when={guide().faqs.length > 0}>
          <section class="mt-14 pt-10 border-t border-[#F0E4F2]">
            <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#7C3F87]">
              <CircleQuestionMark class="size-4" />
              Dúvidas Frequentes
            </div>
            <h2 class="mt-2 text-2xl font-extrabold text-[#2E0C49]">
              Perguntas e Respostas sobre o Conteúdo
            </h2>

            <div class="mt-6 space-y-3">
              <For each={guide().faqs}>
                {(faq, idx) => {
                  const isOpen = () => openFaqIndex() === idx();
                  return (
                    <div class="rounded-xl border border-[#E5D4EC] bg-white transition hover:border-[#93509e]">
                      <button
                        type="button"
                        onClick={() => toggleFaq(idx())}
                        class="flex w-full items-center justify-between gap-4 p-4 text-left font-bold text-[#2E0C49]"
                        aria-expanded={isOpen()}
                      >
                        <span class="text-sm sm:text-base">{faq.question}</span>
                        <ChevronDown
                          class="size-4 shrink-0 text-[#93509e] transition-transform duration-200"
                          classList={{ "rotate-180": isOpen() }}
                        />
                      </button>
                      <Show when={isOpen()}>
                        <div class="px-4 pb-4 pt-1 text-sm leading-relaxed text-[#5B486B] border-t border-[#FAF4FB]">
                          {faq.answer}
                        </div>
                      </Show>
                    </div>
                  );
                }}
              </For>
            </div>
          </section>
        </Show>

        {/* Produtos Relacionados do Catálogo */}
        <Show when={guide().relatedProducts.length > 0}>
          <section class="mt-14 rounded-2xl border border-[#E5D4EC] bg-[#FAF6FC] p-6 sm:p-8">
            <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#7C3F87]">
              <Package class="size-4" />
              Produtos Recomendados
            </div>
            <h2 class="mt-1 text-xl font-bold text-[#2E0C49]">
              Encontre no Catálogo da Mistura Feminina
            </h2>
            <p class="mt-1 text-xs text-[#6B4F75]">
              Itens originais e com pronta entrega para você executar este protocolo com segurança:
            </p>

            <div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              <For each={guide().relatedProducts}>
                {(item) => (
                  <div class="flex flex-col rounded-xl border border-[#E5D4EC] bg-white p-4 shadow-2xs">
                    <span class="inline-block self-start rounded-full bg-[#FAF4FB] px-2 py-0.5 text-[10px] font-bold text-[#7C3F87]">
                      {item.badge}
                    </span>
                    <h3 class="mt-2 text-sm font-bold text-[#2E0C49]">
                      {item.name}
                    </h3>
                    <p class="mt-1 flex-1 text-xs text-[#5B486B] leading-relaxed">
                      {item.description}
                    </p>
                    <Link
                      to="/produto/$slug"
                      params={{ slug: item.slug }}
                      class="mt-4 inline-flex items-center justify-center rounded-lg bg-[#93509e] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#7C3F87]"
                    >
                      Ver detalhes
                    </Link>
                  </div>
                )}
              </For>
            </div>
          </section>
        </Show>

        {/* Categorias Relacionadas */}
        <Show when={guide().relatedCategories.length > 0}>
          <div class="mt-10 flex flex-wrap items-center gap-2 text-xs text-[#5B486B]">
            <span class="font-bold text-[#2E0C49]">Departamentos relacionados:</span>
            <For each={guide().relatedCategories}>
              {(cat) => (
                <Link
                  to="/categoria/$slug"
                  params={{ slug: cat.slug }}
                  class="rounded-full border border-[#E5D4EC] bg-[#FAF6FC] px-3 py-1 font-semibold text-[#7C3F87] transition hover:border-[#93509e] hover:bg-[#93509e] hover:text-white"
                >
                  {cat.name}
                </Link>
              )}
            </For>
          </div>
        </Show>

        {/* Footer Navigation */}
        <div class="mt-12 flex items-center justify-between border-t border-[#F0E4F2] pt-6">
          <Link
            to="/guia"
            class="inline-flex items-center gap-2 text-sm font-bold text-[#93509e] hover:text-[#7C3F87]"
          >
            <ArrowLeft class="size-4" />
            <span>Voltar a todos os guias</span>
          </Link>
          <Link
            to="/categorias"
            class="text-xs font-semibold text-[#6B4F75] hover:text-[#93509e]"
          >
            Explorar todas as categorias →
          </Link>
        </div>
      </div>
    </StoreShell>
  );
}
