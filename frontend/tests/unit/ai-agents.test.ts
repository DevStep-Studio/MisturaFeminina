import { describe, expect, it } from "vitest";
import {
  aiActionTypeLabel,
  aiEvidenceOriginLabel,
  aiExecutionStatusLabel,
  aiPriorityBadge,
} from "../../src/features/admin/ai/ai-types";

describe("ai central helpers", () => {
  it("traduz corretamente status de execução e ações de cadastro", () => {
    expect(aiExecutionStatusLabel("awaiting_review")).toBe(
      "Aguardando revisão",
    );
    expect(aiExecutionStatusLabel("completed")).toBe("Concluído");
    expect(aiExecutionStatusLabel("failed")).toBe("Falhou");

    expect(aiActionTypeLabel("new_product")).toBe("Novo produto");
    expect(aiActionTypeLabel("possible_duplicate")).toBe(
      "Possível duplicidade",
    );
  });

  it("classifica prioridades de reposição e origens de evidência", () => {
    expect(aiPriorityBadge("critical")).toEqual({
      label: "Crítica",
      cls: "bg-red-100 text-red-800",
    });
    expect(aiPriorityBadge("high").label).toBe("Alta");

    expect(aiEvidenceOriginLabel("provided_document")).toBe("Dado fornecido");
    expect(aiEvidenceOriginLabel("existing")).toBe("Existente no sistema");
    expect(aiEvidenceOriginLabel("ai_suggestion_from_cost")).toBe(
      "Sugestão da IA",
    );
    expect(aiEvidenceOriginLabel(undefined)).toBe("Dado ausente");
  });
});
