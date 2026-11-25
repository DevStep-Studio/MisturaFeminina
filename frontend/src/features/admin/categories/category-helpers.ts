export interface AdminCategoryAncestor {
  id: number;
  name: string;
  slug: string;
}

export interface AdminCategoryNode {
  id: number;
  parent_id: number | null;
  name: string;
  slug: string;
  description?: string | null;
  image_path?: string | null;
  banner_desktop_path?: string | null;
  banner_mobile_path?: string | null;
  icon?: string | null;
  sort_order: number;
  show_in_menu: boolean;
  is_active: boolean;
  seo_title?: string | null;
  seo_description?: string | null;
  products_count?: number;
  direct_products_count?: number;
  subtree_products_count?: number;
  children_count?: number;
  depth?: number;
  full_path?: string;
  ancestors?: AdminCategoryAncestor[];
}

export interface CategoryTreeBranch {
  node: AdminCategoryNode;
  children: CategoryTreeBranch[];
  depth: number;
  fullPath: string;
}

export interface CategoryHierarchyOption {
  value: string;
  label: string;
  shortName: string;
  slug: string;
  depth: number;
  hint: string;
}

export function normalizeCategoryText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function slugifyCategoryName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function collectCategoryDescendantIds(
  categories: Array<{ id: number; parent_id?: number | null }>,
  rootId: number,
): Set<number> {
  const childrenByParent = new Map<number, number[]>();
  for (const cat of categories) {
    if (cat.parent_id) {
      const arr = childrenByParent.get(cat.parent_id) ?? [];
      arr.push(cat.id);
      childrenByParent.set(cat.parent_id, arr);
    }
  }
  const result = new Set<number>();
  const queue = [rootId];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (result.has(curr)) continue;
    result.add(curr);
    for (const childId of childrenByParent.get(curr) ?? []) {
      if (!result.has(childId)) queue.push(childId);
    }
  }
  return result;
}

export function buildCategoryHierarchyOptions(
  categories: Array<{
    id: number;
    parent_id?: number | null;
    name: string;
    slug: string;
    sort_order?: number;
    full_path?: string;
  }>,
  excludeSubtreeOfId?: number | null,
): CategoryHierarchyOption[] {
  const excluded =
    excludeSubtreeOfId != null
      ? collectCategoryDescendantIds(categories, excludeSubtreeOfId)
      : new Set<number>();

  const byParent = new Map<number, typeof categories>();
  for (const cat of categories) {
    if (excluded.has(cat.id)) continue;
    const pKey = cat.parent_id ?? 0;
    const arr = byParent.get(pKey) ?? [];
    arr.push(cat);
    byParent.set(pKey, arr);
  }

  for (const list of byParent.values()) {
    list.sort((a, b) => {
      const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
      return orderDiff !== 0 ? orderDiff : a.name.localeCompare(b.name, "pt-BR");
    });
  }

  const out: CategoryHierarchyOption[] = [];
  const visited = new Set<number>();

  function walk(parentId: number, pathPrefix: string[], depth: number) {
    for (const item of byParent.get(parentId) ?? []) {
      if (visited.has(item.id)) continue;
      visited.add(item.id);
      const chain = [...pathPrefix, item.name];
      const label = chain.join(" → ");
      out.push({
        value: String(item.id),
        label,
        shortName: item.name,
        slug: item.slug,
        depth,
        hint: `/${item.slug}`,
      });
      walk(item.id, chain, depth + 1);
    }
  }

  walk(0, [], 0);

  // Include any orphan nodes safely
  for (const item of categories) {
    if (!excluded.has(item.id) && !visited.has(item.id)) {
      out.push({
        value: String(item.id),
        label: item.full_path || item.name,
        shortName: item.name,
        slug: item.slug,
        depth: 0,
        hint: `/${item.slug}`,
      });
    }
  }

  return out;
}

export function buildCategoryTree(
  categories: AdminCategoryNode[],
): CategoryTreeBranch[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const byParent = new Map<number, AdminCategoryNode[]>();

  for (const cat of categories) {
    const pKey = cat.parent_id && byId.has(cat.parent_id) ? cat.parent_id : 0;
    const arr = byParent.get(pKey) ?? [];
    arr.push(cat);
    byParent.set(pKey, arr);
  }

  for (const list of byParent.values()) {
    list.sort((a, b) => {
      const diff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
      return diff !== 0 ? diff : a.name.localeCompare(b.name, "pt-BR");
    });
  }

  const visited = new Set<number>();

  function makeBranches(
    parentId: number,
    prefix: string[],
    depth: number,
  ): CategoryTreeBranch[] {
    const branches: CategoryTreeBranch[] = [];
    for (const node of byParent.get(parentId) ?? []) {
      if (visited.has(node.id)) continue;
      visited.add(node.id);
      const chain = [...prefix, node.name];
      branches.push({
        node,
        depth,
        fullPath: chain.join(" → "),
        children: makeBranches(node.id, chain, depth + 1),
      });
    }
    return branches;
  }

  return makeBranches(0, [], 0);
}
