import { describe, expect, it, beforeEach } from "vitest";
import {
  SELF_SERVICE_TOPICS,
  searchSupportFaq,
} from "../../src/features/storefront/data/selfServiceFaq";
import {
  selfServiceStore,
  openSupport,
  closeSupport,
  selectTopic,
  selectQuestion,
  goBack,
  goHome,
} from "../../src/features/storefront/selfServiceSupport";

describe("Central de Autoatendimento da Mistura Feminina", () => {
  beforeEach(() => {
    goHome();
    closeSupport();
  });

  describe("Base de dados de Autoatendimento (FAQ)", () => {
    it("deve conter tópicos estruturados com perguntas e identificadores únicos", () => {
      expect(SELF_SERVICE_TOPICS.length).toBeGreaterThanOrEqual(8);

      const topicIds = new Set<string>();
      const questionIds = new Set<string>();

      for (const topic of SELF_SERVICE_TOPICS) {
        expect(topic.id).toBeTruthy();
        expect(topic.title).toBeTruthy();
        expect(topic.questions.length).toBeGreaterThan(0);
        expect(topicIds.has(topic.id)).toBe(false);
        topicIds.add(topic.id);

        for (const q of topic.questions) {
          expect(q.id).toBeTruthy();
          expect(q.question).toBeTruthy();
          expect(q.shortAnswer).toBeTruthy();
          expect(q.fullAnswer).toBeTruthy();
          expect(q.keywords.length).toBeGreaterThan(0);
          expect(questionIds.has(q.id)).toBe(false);
          questionIds.add(q.id);
        }
      }
    });

    it("deve incluir tópicos essenciais da Mistura Feminina", () => {
      const topicIds = SELF_SERVICE_TOPICS.map((t) => t.id);
      expect(topicIds).toContain("como-comprar");
      expect(topicIds).toContain("pedidos-rastreio");
      expect(topicIds).toContain("pagamentos");
      expect(topicIds).toContain("entrega-frete");
      expect(topicIds).toContain("trocas-devolucoes");
      expect(topicIds).toContain("atacado");
      expect(topicIds).toContain("minha-reposicao");
      expect(topicIds).toContain("cadastro-acesso");
      expect(topicIds).toContain("falar-atendimento");
    });

    it("deve encontrar resultados na pesquisa por termos relevantes", () => {
      const rastreioResults = searchSupportFaq("rastreio");
      expect(rastreioResults.length).toBeGreaterThan(0);
      expect(rastreioResults.some((r) => r.topic.id === "pedidos-rastreio")).toBe(true);

      const pixResults = searchSupportFaq("pix");
      expect(pixResults.length).toBeGreaterThan(0);
      expect(pixResults.some((r) => r.topic.id === "pagamentos")).toBe(true);

      const freteResults = searchSupportFaq("frete grátis");
      expect(freteResults.length).toBeGreaterThan(0);
      expect(freteResults.some((r) => r.topic.id === "entrega-frete")).toBe(true);

      const atacadoResults = searchSupportFaq("atacado");
      expect(atacadoResults.length).toBeGreaterThan(0);
      expect(atacadoResults.some((r) => r.topic.id === "atacado")).toBe(true);

      const reposicaoResults = searchSupportFaq("reposição");
      expect(reposicaoResults.length).toBeGreaterThan(0);
      expect(reposicaoResults.some((r) => r.topic.id === "minha-reposicao")).toBe(true);
    });

    it("deve retornar vazio para buscas curtas ou irrelevantes", () => {
      expect(searchSupportFaq("a")).toEqual([]);
      expect(searchSupportFaq("   ")).toEqual([]);
      expect(searchSupportFaq("xyz123nonsensequery456")).toEqual([]);
    });
  });

  describe("Navegação e Estado do Autoatendimento", () => {
    it("deve abrir e fechar corretamente", () => {
      expect(selfServiceStore.isOpen()).toBe(false);

      openSupport();
      expect(selfServiceStore.isOpen()).toBe(true);
      expect(selfServiceStore.view()).toBe("home");

      closeSupport();
      expect(selfServiceStore.isOpen()).toBe(false);
    });

    it("deve permitir navegar até um tópico e voltar ao início", () => {
      openSupport();
      expect(selfServiceStore.view()).toBe("home");

      selectTopic("pagamentos");
      expect(selfServiceStore.view()).toBe("topic");
      expect(selfServiceStore.activeTopicId()).toBe("pagamentos");
      expect(selfServiceStore.getActiveTopic()?.title).toContain("Pagamento");

      goBack();
      expect(selfServiceStore.view()).toBe("home");
      expect(selfServiceStore.activeTopicId()).toBeNull();
    });

    it("deve permitir selecionar uma pergunta, ver resposta e voltar", () => {
      openSupport();
      selectTopic("pagamentos");
      selectQuestion("como-pagar-com-pix");

      expect(selfServiceStore.view()).toBe("question");
      expect(selfServiceStore.activeQuestionId()).toBe("como-pagar-com-pix");
      expect(selfServiceStore.getActiveQuestion()?.question).toContain("Pix");

      // Voltar deve ir para a lista de perguntas do tópico
      goBack();
      expect(selfServiceStore.view()).toBe("topic");
      expect(selfServiceStore.activeTopicId()).toBe("pagamentos");

      // Voltar novamente deve ir para a home
      goBack();
      expect(selfServiceStore.view()).toBe("home");
    });

    it("deve resetar estado com goHome()", () => {
      openSupport("atacado", "como-funciona-atacado");
      expect(selfServiceStore.view()).toBe("question");

      goHome();
      expect(selfServiceStore.view()).toBe("home");
      expect(selfServiceStore.activeTopicId()).toBeNull();
      expect(selfServiceStore.activeQuestionId()).toBeNull();
    });
  });
});
