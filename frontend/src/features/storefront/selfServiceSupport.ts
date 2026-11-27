import { createSignal } from "solid-js";
import {
  SELF_SERVICE_TOPICS,
  type SupportQuestion,
  type SupportTopic,
} from "./data/selfServiceFaq";

export type SupportViewMode = "home" | "topic" | "question";

interface NavigationStep {
  view: SupportViewMode;
  topicId: string | null;
  questionId: string | null;
}

const [isSupportOpen, setIsSupportOpen] = createSignal(false);
const [currentView, setCurrentView] = createSignal<SupportViewMode>("home");
const [activeTopicId, setActiveTopicId] = createSignal<string | null>(null);
const [activeQuestionId, setActiveQuestionId] = createSignal<string | null>(null);
const [searchQuery, setSearchQuery] = createSignal("");
const [navHistory, setNavHistory] = createSignal<NavigationStep[]>([]);

export function openSupport(topicId?: string, questionId?: string) {
  setSearchQuery("");
  if (questionId && topicId) {
    setActiveTopicId(topicId);
    setActiveQuestionId(questionId);
    setCurrentView("question");
    setNavHistory([{ view: "home", topicId: null, questionId: null }, { view: "topic", topicId, questionId: null }]);
  } else if (topicId) {
    setActiveTopicId(topicId);
    setActiveQuestionId(null);
    setCurrentView("topic");
    setNavHistory([{ view: "home", topicId: null, questionId: null }]);
  } else {
    setActiveTopicId(null);
    setActiveQuestionId(null);
    setCurrentView("home");
    setNavHistory([]);
  }
  setIsSupportOpen(true);
}

export function closeSupport() {
  setIsSupportOpen(false);
}

export function selectTopic(topicId: string) {
  setNavHistory((prev) => [
    ...prev,
    {
      view: currentView(),
      topicId: activeTopicId(),
      questionId: activeQuestionId(),
    },
  ]);
  setActiveTopicId(topicId);
  setActiveQuestionId(null);
  setCurrentView("topic");
}

export function selectQuestion(questionId: string, topicId?: string) {
  const targetTopicId = topicId || activeTopicId();
  setNavHistory((prev) => [
    ...prev,
    {
      view: currentView(),
      topicId: activeTopicId(),
      questionId: activeQuestionId(),
    },
  ]);
  if (targetTopicId) {
    setActiveTopicId(targetTopicId);
  }
  setActiveQuestionId(questionId);
  setCurrentView("question");
}

export function goBack() {
  const history = navHistory();
  if (history.length === 0) {
    goHome();
    return;
  }

  const prevStep = history[history.length - 1];
  setNavHistory((prev) => prev.slice(0, prev.length - 1));

  setCurrentView(prevStep.view);
  setActiveTopicId(prevStep.topicId);
  setActiveQuestionId(prevStep.questionId);
}

export function goHome() {
  setNavHistory([]);
  setSearchQuery("");
  setActiveTopicId(null);
  setActiveQuestionId(null);
  setCurrentView("home");
}

export function getActiveTopic(): SupportTopic | null {
  const tid = activeTopicId();
  if (!tid) return null;
  return SELF_SERVICE_TOPICS.find((t) => t.id === tid) ?? null;
}

export function getActiveQuestion(): SupportQuestion | null {
  const qid = activeQuestionId();
  if (!qid) return null;
  const topic = getActiveTopic();
  if (topic) {
    const q = topic.questions.find((item) => item.id === qid);
    if (q) return q;
  }
  // Se não achou no tópico ativo, busca em todos os tópicos
  for (const t of SELF_SERVICE_TOPICS) {
    const q = t.questions.find((item) => item.id === qid);
    if (q) return q;
  }
  return null;
}

export const selfServiceStore = {
  isOpen: isSupportOpen,
  view: currentView,
  activeTopicId,
  activeQuestionId,
  searchQuery,
  navHistory,
  setSearchQuery,
  open: openSupport,
  close: closeSupport,
  selectTopic,
  selectQuestion,
  goBack,
  goHome,
  getActiveTopic,
  getActiveQuestion,
};
