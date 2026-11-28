import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { Link } from "@tanstack/solid-router";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import ChevronRight from "lucide-solid/icons/chevron-right";
import Headset from "lucide-solid/icons/headset";
import House from "lucide-solid/icons/house";
import MessageCircle from "lucide-solid/icons/message-circle";
import Search from "lucide-solid/icons/search";
import ShoppingBag from "lucide-solid/icons/shopping-bag";
import Sparkles from "lucide-solid/icons/sparkles";
import ThumbsUp from "lucide-solid/icons/thumbs-up";
import Truck from "lucide-solid/icons/truck";
import X from "lucide-solid/icons/x";
import CreditCard from "lucide-solid/icons/credit-card";
import MapPin from "lucide-solid/icons/map-pin";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import Boxes from "lucide-solid/icons/boxes";
import UserIcon from "lucide-solid/icons/user";
import ExternalLink from "lucide-solid/icons/external-link";
import { whatsappUrl } from "../../../lib/format";
import { trackContactClick } from "../../../monitoring/analytics";
import { storefrontStore } from "../store";
import {
  SELF_SERVICE_TOPICS,
  searchSupportFaq,
  type SupportTopic,
} from "../data/selfServiceFaq";
import { selfServiceStore } from "../selfServiceSupport";

export function SelfServiceSupportModal() {
  const settings = () => storefrontStore.settings();
  const isOpen = () => selfServiceStore.isOpen();
  const currentView = () => selfServiceStore.view();
  const activeTopic = () => selfServiceStore.getActiveTopic();
  const activeQuestion = () => selfServiceStore.getActiveQuestion();
  const searchQuery = () => selfServiceStore.searchQuery();

  const [feedbackGiven, setFeedbackGiven] = createSignal<"yes" | "no" | null>(null);

  // Limpa feedback quando a pergunta mudar
  createEffect(() => {
    selfServiceStore.activeQuestionId();
    setFeedbackGiven(null);
  });

  // Fechar no Escape
  createEffect(() => {
    if (!isOpen()) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        selfServiceStore.close();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
  });

  // Bloqueio de scroll suave no body quando aberto em mobile
  createEffect(() => {
    if (typeof document === "undefined") return;
    if (isOpen()) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      onCleanup(() => {
        document.body.style.overflow = prevOverflow;
      });
    }
  });

  const searchResults = createMemo(() => {
    const q = searchQuery().trim();
    if (q.length < 2) return [];
    return searchSupportFaq(q);
  });

  const whatsHelpUrl = createMemo(() => {
    const phone = settings().whatsapp_number;
    const q = activeQuestion();
    const t = activeTopic();
    let msg = "Olá! Estava navegando na Central de Autoatendimento da Mistura Feminina e gostaria de ajuda com uma dúvida.";
    if (q) {
      msg = `Olá! Gostaria de ajuda sobre a seguinte dúvida da Mistura Feminina: "${q.question}"`;
    } else if (t) {
      msg = `Olá! Gostaria de falar com uma atendente sobre o assunto "${t.title}".`;
    }
    return whatsappUrl(phone, msg);
  });

  const getTopicIcon = (iconName: string) => {
    switch (iconName) {
      case "shopping-bag":
        return ShoppingBag;
      case "truck":
        return Truck;
      case "credit-card":
        return CreditCard;
      case "map-pin":
        return MapPin;
      case "refresh-cw":
        return RefreshCw;
      case "boxes":
        return Boxes;
      case "sparkles":
        return Sparkles;
      case "user":
        return UserIcon;
      case "message-circle":
      default:
        return MessageCircle;
    }
  };

  return (
    <Show when={isOpen()}>
      <div
        class="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs transition-opacity duration-200"
        aria-modal="true"
        role="dialog"
        aria-labelledby="support-modal-title"
      >
        {/* Backdrop click to close */}
        <div
          class="flex-1 cursor-pointer"
          onClick={() => selfServiceStore.close()}
          aria-label="Fechar painel clicando fora"
        />

        {/* Sliding Panel */}
        <div class="relative flex h-full w-full max-w-[540px] flex-col bg-white shadow-2xl transition-transform duration-300 animate-in slide-in-from-right">
          {/* Header */}
          <div class="border-b border-zinc-200 bg-white px-4 py-3.5 sm:px-6">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                {/* Back button */}
                <Show when={currentView() !== "home" || searchQuery().trim().length > 0}>
                  <button
                    type="button"
                    onClick={() => {
                      if (searchQuery().trim().length > 0) {
                        selfServiceStore.setSearchQuery("");
                      } else {
                        selfServiceStore.goBack();
                      }
                    }}
                    class="inline-flex size-8 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-800 transition hover:bg-zinc-50 active:scale-95"
                    aria-label="Voltar para a etapa anterior"
                    title="Voltar"
                  >
                    <ArrowLeft class="size-4" aria-hidden="true" />
                  </button>
                </Show>

                {/* Home button */}
                <Show when={currentView() !== "home"}>
                  <button
                    type="button"
                    onClick={() => selfServiceStore.goHome()}
                    class="inline-flex size-8 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-800 transition hover:bg-zinc-50 active:scale-95"
                    aria-label="Voltar ao início da central de ajuda"
                    title="Início"
                  >
                    <House class="size-4" aria-hidden="true" />
                  </button>
                </Show>

                <div class="flex items-center gap-2.5">
                  <div class="flex size-7 items-center justify-center rounded-lg bg-[#93509e] text-white">
                    <Headset class="size-4" aria-hidden="true" />
                  </div>
                  <h2
                    id="support-modal-title"
                    class="text-sm font-bold text-zinc-900 sm:text-base whitespace-nowrap"
                  >
                    Central de Autoatendimento
                  </h2>
                </div>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => selfServiceStore.close()}
                class="inline-flex size-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 active:scale-95"
                aria-label="Fechar autoatendimento"
              >
                <X class="size-5" aria-hidden="true" />
              </button>
            </div>

            {/* Quick Search Bar */}
            <div class="mt-3">
              <div class="relative flex items-center">
                <Search
                  class="pointer-events-none absolute left-3 size-4 text-zinc-400"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={searchQuery()}
                  onInput={(e) => selfServiceStore.setSearchQuery(e.currentTarget.value)}
                  placeholder="Pesquisar por frete, pix, rastreio, atacado..."
                  aria-label="Buscar dúvida no autoatendimento"
                  class="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-9 pr-8 text-xs font-medium text-zinc-900 placeholder:text-zinc-400 focus:border-[#93509e] focus:outline-hidden focus:ring-1 focus:ring-[#93509e] sm:text-sm"
                />
                <Show when={searchQuery().trim().length > 0}>
                  <button
                    type="button"
                    onClick={() => selfServiceStore.setSearchQuery("")}
                    class="absolute right-2.5 inline-flex size-5 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                    aria-label="Limpar pesquisa"
                  >
                    <X class="size-3.5" aria-hidden="true" />
                  </button>
                </Show>
              </div>
            </div>
          </div>

          {/* Body Content (Scrollable) */}
          <div class="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            {/* VIEW A: Search Results */}
            <Show when={searchQuery().trim().length >= 2}>
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <p class="text-xs font-bold uppercase tracking-wider text-[#7C3F87]">
                    Resultados da busca ({searchResults().length})
                  </p>
                  <button
                    type="button"
                    onClick={() => selfServiceStore.setSearchQuery("")}
                    class="text-xs font-semibold text-[#93509e] hover:underline"
                  >
                    Limpar busca
                  </button>
                </div>

                <Show
                  when={searchResults().length > 0}
                  fallback={
                    <div class="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/70 p-6 text-center">
                      <p class="text-sm font-semibold text-zinc-700">
                        Nenhuma resposta encontrada para "{searchQuery()}".
                      </p>
                      <p class="mt-1 text-xs text-zinc-500">
                        Tente outras palavras-chave ou fale diretamente com a nossa equipe no botão abaixo.
                      </p>
                    </div>
                  }
                >
                  <div class="space-y-1.5">
                    <For each={searchResults()}>
                      {({ topic, question }) => (
                        <button
                          type="button"
                          onClick={() => {
                            selfServiceStore.setSearchQuery("");
                            selfServiceStore.selectQuestion(question.id, topic.id);
                          }}
                          class="group flex w-full items-center justify-between gap-3 rounded-md border border-zinc-200 bg-white px-3 py-2.5 text-left transition hover:border-[#93509e] hover:bg-zinc-50 active:scale-[0.99] cursor-pointer"
                        >
                          <div class="flex items-center gap-2 min-w-0">
                            <span class="text-[11px] font-bold text-[#93509e] shrink-0 whitespace-nowrap">
                              [{topic.title}]
                            </span>
                            <span class="text-xs sm:text-sm font-medium text-zinc-900 group-hover:text-[#93509e] truncate whitespace-nowrap">
                              {question.question}
                            </span>
                          </div>
                          <ChevronRight class="size-4 shrink-0 text-zinc-400 transition-transform group-hover:translate-x-0.5 group-hover:text-[#93509e]" aria-hidden="true" />
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            </Show>

            {/* VIEW B: Specific Question (Answer View) */}
            <Show
              when={searchQuery().trim().length < 2 && currentView() === "question" && activeQuestion()}
            >
              {(() => {
                const q = activeQuestion()!;
                const t = activeTopic();
                return (
                  <div class="space-y-5 animate-in fade-in duration-200">
                    {/* Topic badge and Breadcrumb */}
                    <div class="flex items-center gap-2">
                      <span class="inline-flex items-center gap-1.5 rounded-full bg-[#FAF0FA] px-2.5 py-0.5 text-xs font-bold text-[#93509e] border border-[#F2D7F3]">
                        {t ? t.title : "Autoatendimento"}
                      </span>
                    </div>

                    {/* Question Title */}
                    <h3 class="text-base font-extrabold text-[#2E1049] sm:text-lg">
                      {q.question}
                    </h3>

                    {/* Short Answer Highlight Box */}
                    <div class="rounded-xl border border-[#EAC2EB] bg-[#FDF7FD] p-3.5 text-xs font-semibold leading-relaxed text-[#561B61] sm:text-sm">
                      {q.shortAnswer}
                    </div>

                    {/* Full Answer Prose */}
                    <div class="space-y-3 text-xs leading-relaxed text-zinc-700 sm:text-sm">
                      <p>{q.fullAnswer}</p>

                      <Show when={q.bullets && q.bullets.length > 0}>
                        <ul class="space-y-2 rounded-xl bg-zinc-50 p-3.5 text-xs text-zinc-800 border border-zinc-100 sm:text-[13px]">
                          <For each={q.bullets}>
                            {(bullet) => (
                              <li class="flex items-start gap-2">
                                <span class="mt-1 size-1.5 shrink-0 rounded-full bg-[#93509e]" />
                                <span>{bullet}</span>
                              </li>
                            )}
                          </For>
                        </ul>
                      </Show>
                    </div>

                    {/* Action CTAs */}
                    <Show when={q.actionLinks && q.actionLinks.length > 0}>
                      <div class="pt-2">
                        <p class="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">
                          Atalhos Rápidos:
                        </p>
                        <div class="flex flex-wrap gap-2">
                          <For each={q.actionLinks}>
                            {(link) => (
                              <Link
                                to={link.href as any}
                                onClick={() => selfServiceStore.close()}
                                class="inline-flex items-center gap-1.5 rounded-lg border border-[#93509e] bg-white px-3 py-1.5 text-xs font-bold text-[#93509e] shadow-2xs transition hover:bg-[#93509e] hover:text-white"
                              >
                                <span>{link.label}</span>
                                <ExternalLink class="size-3" aria-hidden="true" />
                              </Link>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>

                    {/* Feedback Rating Box */}
                    <div class="rounded-xl border border-zinc-200/90 bg-zinc-50/60 p-4">
                      <Show
                        when={feedbackGiven() === null}
                        fallback={
                          <p class="text-center text-xs font-semibold text-emerald-700">
                            Obrigado pelo seu feedback! Isso nos ajuda a melhorar nosso autoatendimento.
                          </p>
                        }
                      >
                        <div class="flex flex-col items-center justify-between gap-3 sm:flex-row">
                          <span class="text-xs font-medium text-zinc-700">
                            Essa resposta esclareceu sua dúvida?
                          </span>
                          <div class="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setFeedbackGiven("yes")}
                              class="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1 text-xs font-bold text-zinc-700 transition hover:border-emerald-500 hover:text-emerald-700"
                            >
                              <ThumbsUp class="size-3.5" aria-hidden="true" />
                              <span>Sim</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setFeedbackGiven("no")}
                              class="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1 text-xs font-bold text-zinc-700 transition hover:border-amber-500 hover:text-amber-700"
                            >
                              <span>Não</span>
                            </button>
                          </div>
                        </div>
                      </Show>
                    </div>

                    {/* Back to topic questions button */}
                    <Show when={t}>
                      <button
                        type="button"
                        onClick={() => selfServiceStore.goBack()}
                        class="inline-flex items-center gap-1.5 text-xs font-bold text-[#93509e] hover:underline"
                      >
                        <ArrowLeft class="size-3.5" aria-hidden="true" />
                        <span>Ver outras dúvidas sobre {t!.title}</span>
                      </button>
                    </Show>
                  </div>
                );
              })()}
            </Show>

            {/* VIEW C: Topic Questions List */}
            <Show
              when={searchQuery().trim().length < 2 && currentView() === "topic" && activeTopic()}
            >
              {(() => {
                const t = activeTopic()!;
                const IconComponent = getTopicIcon(t.icon);
                return (
                  <div class="space-y-4 animate-in fade-in duration-200">
                    {/* Topic Header Card (Simple Text Box Model) */}
                    <div class="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2.5">
                      <div class="flex items-center gap-2.5 min-w-0">
                        <IconComponent class="size-4 shrink-0 text-[#93509e]" aria-hidden="true" />
                        <h3 class="text-sm font-semibold text-zinc-900 truncate whitespace-nowrap">
                          {t.title}
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => selfServiceStore.goBack()}
                        class="text-xs font-medium text-[#93509e] hover:underline cursor-pointer shrink-0"
                      >
                        Trocar assunto
                      </button>
                    </div>

                    {/* List of Questions in Topic (Clean Text Box Model - Single Line, No Line Breaks) */}
                    <div class="space-y-1.5">
                      <p class="text-xs font-bold uppercase tracking-wider text-zinc-500 whitespace-nowrap">
                        Dúvidas Frequentes ({t.questions.length}):
                      </p>
                      <For each={t.questions}>
                        {(q) => (
                          <button
                            type="button"
                            onClick={() => selfServiceStore.selectQuestion(q.id)}
                            class="group flex w-full items-center justify-between gap-3 rounded-md border border-zinc-200 bg-white px-3 py-2.5 text-left transition hover:border-[#93509e] hover:bg-zinc-50 active:scale-[0.99] cursor-pointer"
                          >
                            <span class="text-xs sm:text-sm font-medium text-zinc-900 group-hover:text-[#93509e] truncate whitespace-nowrap">
                              {q.question}
                            </span>
                            <ChevronRight
                              class="size-4 shrink-0 text-zinc-400 transition-transform group-hover:translate-x-0.5 group-hover:text-[#93509e]"
                              aria-hidden="true"
                            />
                          </button>
                        )}
                      </For>
                    </div>
                  </div>
                );
              })()}
            </Show>

            {/* VIEW D: Home - Topics Catalog and Quick Shortcuts */}
            <Show
              when={searchQuery().trim().length < 2 && currentView() === "home"}
            >
              <div class="space-y-4 animate-in fade-in duration-200">
                {/* Quick Shortcuts Bar (Clean Text Box Model) */}
                <div class="grid grid-cols-3 gap-2">
                  <Link
                    to="/rastrear-pedido"
                    onClick={() => selfServiceStore.close()}
                    class="flex items-center justify-center gap-1.5 rounded-md border border-zinc-200 bg-white py-2 px-2 text-center text-xs font-medium text-zinc-800 transition hover:border-[#93509e] hover:text-[#93509e] whitespace-nowrap cursor-pointer"
                  >
                    <Truck class="size-3.5 shrink-0 text-[#93509e]" aria-hidden="true" />
                    <span class="truncate">Rastrear</span>
                  </Link>

                  <button
                    type="button"
                    onClick={() => selfServiceStore.selectTopic("pagamentos")}
                    class="flex items-center justify-center gap-1.5 rounded-md border border-zinc-200 bg-white py-2 px-2 text-center text-xs font-medium text-zinc-800 transition hover:border-[#93509e] hover:text-[#93509e] whitespace-nowrap cursor-pointer"
                  >
                    <CreditCard class="size-3.5 shrink-0 text-[#93509e]" aria-hidden="true" />
                    <span class="truncate">Pix & Cartão</span>
                  </button>

                  <Link
                    to="/atacado"
                    onClick={() => selfServiceStore.close()}
                    class="flex items-center justify-center gap-1.5 rounded-md border border-zinc-200 bg-white py-2 px-2 text-center text-xs font-medium text-zinc-800 transition hover:border-[#93509e] hover:text-[#93509e] whitespace-nowrap cursor-pointer"
                  >
                    <Boxes class="size-3.5 shrink-0 text-[#93509e]" aria-hidden="true" />
                    <span class="truncate">Atacado</span>
                  </Link>
                </div>

                {/* Topics List (Clean Text Box Model - Single Line, No Line Breaks) */}
                <div class="space-y-1.5">
                  <p class="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2 whitespace-nowrap">
                    Principais Assuntos ({SELF_SERVICE_TOPICS.length})
                  </p>

                  <div class="grid gap-1.5">
                    <For each={SELF_SERVICE_TOPICS}>
                      {(topic) => {
                        const IconComponent = getTopicIcon(topic.icon);
                        return (
                          <button
                            type="button"
                            onClick={() => selfServiceStore.selectTopic(topic.id)}
                            class="group flex w-full items-center justify-between gap-3 rounded-md border border-zinc-200 bg-white px-3 py-2.5 text-left transition hover:border-[#93509e] hover:bg-zinc-50 active:scale-[0.99] cursor-pointer"
                          >
                            <div class="flex items-center gap-2.5 min-w-0">
                              <IconComponent class="size-4 shrink-0 text-[#93509e]" aria-hidden="true" />
                              <span class="text-xs sm:text-sm font-medium text-zinc-800 group-hover:text-[#93509e] truncate whitespace-nowrap">
                                {topic.title}
                              </span>
                            </div>

                            <ChevronRight
                              class="size-4 shrink-0 text-zinc-400 transition-transform group-hover:translate-x-0.5 group-hover:text-[#93509e]"
                              aria-hidden="true"
                            />
                          </button>
                        );
                      }}
                    </For>
                  </div>
                </div>
              </div>
            </Show>
          </div>

          {/* Footer Bar (Fixed Bottom WhatsApp Help) */}
          <div class="border-t border-zinc-200 bg-white px-4 py-3 sm:px-5">
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0 flex-1">
                <p class="text-xs font-semibold text-zinc-900 truncate">
                  Ainda com dúvidas?
                </p>
                <p class="text-[11px] text-zinc-500 truncate">
                  Fale com a equipe no WhatsApp
                </p>
              </div>

              <a
                href={whatsHelpUrl()}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackContactClick("whatsapp")}
                class="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#25D366] px-3.5 py-2 text-xs font-bold text-white shadow-2xs transition hover:bg-[#1da851] active:scale-95 cursor-pointer whitespace-nowrap"
              >
                <MessageCircle class="size-4 shrink-0" aria-hidden="true" />
                <span>Chamar no WhatsApp</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
}
