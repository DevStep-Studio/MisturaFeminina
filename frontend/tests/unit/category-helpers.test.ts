import { describe, expect, it } from "vitest";
import {
  type AdminCategoryNode,
  buildCategoryHierarchyOptions,
  buildCategoryTree,
  collectCategoryDescendantIds,
  normalizeCategoryText,
  slugifyCategoryName,
} from "../../src/features/admin/categories/category-helpers";

const SAMPLE_NODES: AdminCategoryNode[] = [
  {
    id: 1,
    parent_id: null,
    name: "Acessórios",
    slug: "acessorios",
    sort_order: 2,
    show_in_menu: true,
    is_active: true,
  },
  {
    id: 2,
    parent_id: 1,
    name: "Brocas",
    slug: "brocas",
    sort_order: 2,
    show_in_menu: true,
    is_active: true,
  },
  {
    id: 3,
    parent_id: 2,
    name: "Brocas Diamantadas",
    slug: "brocas-diamantadas",
    sort_order: 2,
    show_in_menu: true,
    is_active: true,
  },
  {
    id: 4,
    parent_id: null,
    name: "Alongamento Unhas",
    slug: "alongamento-unhas",
    sort_order: 1,
    show_in_menu: true,
    is_active: true,
  },
];

describe("category-helpers", () => {
  it("normalizes accents, case and whitespace consistently", () => {
    expect(normalizeCategoryText("  Acessórios  >  Brocas  Diamantadas ")).toBe(
      "acessorios > brocas diamantadas",
    );
    expect(slugifyCategoryName("Higiene & Esterilização")).toBe(
      "higiene-esterilizacao",
    );
  });

  it("collects all descendant ids without looping", () => {
    const ids = collectCategoryDescendantIds(SAMPLE_NODES, 1);
    expect(Array.from(ids).sort()).toEqual([1, 2, 3]);
  });

  it("builds sorted 3-level tree and excludes subtree when requested", () => {
    const tree = buildCategoryTree(SAMPLE_NODES);
    expect(tree.map((b) => b.node.name)).toEqual([
      "Alongamento Unhas",
      "Acessórios",
    ]);
    expect(tree[1]?.children[0]?.children[0]?.fullPath).toBe(
      "Acessórios → Brocas → Brocas Diamantadas",
    );

    const optionsExcludingBrocas = buildCategoryHierarchyOptions(
      SAMPLE_NODES,
      2,
    );
    expect(optionsExcludingBrocas.map((o) => o.value)).toEqual(["4", "1"]);
  });
});
