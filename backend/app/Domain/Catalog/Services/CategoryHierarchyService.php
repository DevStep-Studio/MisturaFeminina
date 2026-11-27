<?php

declare(strict_types=1);

namespace App\Domain\Catalog\Services;

use App\Http\Controllers\SeoController;
use App\Models\Category;
use App\Models\Product;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class CategoryHierarchyService
{
    public const CACHE_DIRECTORY_KEY = 'catalog:categories:directory:v1';

    public const CACHE_BOOTSTRAP_MENU_KEY = 'catalog:categories:bootstrap_menu:v1';

    private static ?bool $primaryPivotSupported = null;

    public static function hasPrimaryPivotColumn(): bool
    {
        if (self::$primaryPivotSupported === null) {
            self::$primaryPivotSupported = Schema::hasTable('category_product')
                && Schema::hasColumn('category_product', 'is_primary');
        }

        return self::$primaryPivotSupported;
    }

    public static function resetSchemaCache(): void
    {
        self::$primaryPivotSupported = null;
    }

    public function clearCaches(): void
    {
        Cache::forget(self::CACHE_DIRECTORY_KEY);
        Cache::forget(self::CACHE_BOOTSTRAP_MENU_KEY);
        SeoController::clearCaches();
    }

    public static function normalizeName(string $value): string
    {
        $collapsed = preg_replace('/\s+/u', ' ', trim($value)) ?? trim($value);

        return Str::ascii(mb_strtolower($collapsed));
    }

    /**
     * Loads all categories in 2 flat queries (categories + direct product counts) and enriches
     * each item with depth, full_path, ancestors, direct_products_count and subtree_products_count.
     *
     * @return list<array<string, mixed>>
     */
    public function listAdminCategories(): array
    {
        $all = Category::query()
            ->with(['parent:id,name,slug', 'attributes:id,name,slug'])
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        $directCounts = DB::table('category_product')
            ->select('category_id', DB::raw('COUNT(DISTINCT product_id) as total'))
            ->groupBy('category_id')
            ->pluck('total', 'category_id')
            ->map(fn ($v): int => (int) $v)
            ->all();

        $byId = $all->keyBy('id');
        $childrenByParent = [];
        foreach ($all as $cat) {
            $pKey = $cat->parent_id ? (int) $cat->parent_id : 0;
            $childrenByParent[$pKey][] = (int) $cat->id;
        }

        // Compute unique product counts across each subtree using 1 flat pivot read
        $pivotRows = DB::table('category_product')->get(['category_id', 'product_id']);
        $productsByCat = [];
        foreach ($pivotRows as $row) {
            $productsByCat[(int) $row->category_id][(int) $row->product_id] = true;
        }

        $subtreeMemo = [];
        $resolveSubtreeProducts = function (int $catId) use (&$resolveSubtreeProducts, &$subtreeMemo, $childrenByParent, $productsByCat): array {
            if (isset($subtreeMemo[$catId])) {
                return $subtreeMemo[$catId];
            }
            $set = $productsByCat[$catId] ?? [];
            foreach ($childrenByParent[$catId] ?? [] as $childId) {
                $set += $resolveSubtreeProducts($childId);
            }

            return $subtreeMemo[$catId] = $set;
        };

        $rows = [];
        foreach ($all as $cat) {
            $ancestors = $this->resolveAncestorsFromMap($cat->id, $byId);
            $fullPath = implode(' → ', array_map(fn (array $a): string => $a['name'], $ancestors));
            $directCount = $directCounts[$cat->id] ?? 0;
            $subtreeCount = count($resolveSubtreeProducts($cat->id));
            $childrenCount = count($childrenByParent[$cat->id] ?? []);

            $arr = $cat->toArray();
            $arr['products_count'] = $directCount;
            $arr['direct_products_count'] = $directCount;
            $arr['subtree_products_count'] = $subtreeCount;
            $arr['children_count'] = $childrenCount;
            $arr['depth'] = max(0, count($ancestors) - 1);
            $arr['full_path'] = $fullPath;
            $arr['ancestors'] = $ancestors;
            $rows[] = $arr;
        }

        return $rows;
    }

    /**
     * Returns full active tree with visible products (unlimited depth) cached cleanly without N+1 queries.
     * Prunes categories and subcategories that have no active and visible products in themselves or their subtrees.
     *
     * @return list<array<string, mixed>>
     */
    public function getPublicDirectoryTree(bool $menuOnly = false): array
    {
        $cacheKey = $menuOnly ? self::CACHE_BOOTSTRAP_MENU_KEY : self::CACHE_DIRECTORY_KEY;

        return Cache::remember($cacheKey, 600, function () use ($menuOnly): array {
            $all = Category::query()
                ->where('is_active', true)
                ->orderBy('sort_order')
                ->orderBy('name')
                ->get();

            $pivotRows = DB::table('category_product')
                ->join('products', 'category_product.product_id', '=', 'products.id')
                ->where('products.is_active', true)
                ->whereNull('products.deleted_at')
                ->select('category_product.category_id', 'category_product.product_id')
                ->get();

            $productsByCat = [];
            foreach ($pivotRows as $row) {
                $productsByCat[(int) $row->category_id][(int) $row->product_id] = true;
            }

            $byParent = [];
            foreach ($all as $cat) {
                $byParent[$cat->parent_id ? (int) $cat->parent_id : 0][] = $cat;
            }

            $buildBranch = function (int $parentId) use (&$buildBranch, $byParent, $menuOnly, $productsByCat): array {
                $nodes = [];
                foreach ($byParent[$parentId] ?? [] as $cat) {
                    if ($menuOnly && ! $cat->show_in_menu) {
                        continue;
                    }

                    $visibleChildren = $buildBranch((int) $cat->id);
                    $directCount = count($productsByCat[(int) $cat->id] ?? []);
                    $hasVisibleChildren = ! empty($visibleChildren);

                    // A category or subcategory is only included if it has direct active products OR visible children with active products
                    if ($directCount === 0 && ! $hasVisibleChildren) {
                        continue;
                    }

                    $node = $cat->toArray();
                    $node['children'] = $visibleChildren;
                    $node['direct_products_count'] = $directCount;
                    $nodes[] = $node;
                }

                return $nodes;
            };

            return $buildBranch(0);
        });
    }

    /**
     * Recursively searches for a category node in a tree.
     *
     * @param list<array<string, mixed>> $tree
     * @return array<string, mixed>|null
     */
    public function findNodeInTree(array $tree, int $categoryId): ?array
    {
        foreach ($tree as $node) {
            if ((int) ($node['id'] ?? 0) === $categoryId) {
                return $node;
            }
            if (! empty($node['children']) && is_array($node['children'])) {
                $found = $this->findNodeInTree($node['children'], $categoryId);
                if ($found !== null) {
                    return $found;
                }
            }
        }

        return null;
    }

    /**
     * Returns slugs of all categories currently visible to the public.
     *
     * @return list<string>
     */
    public function getVisibleCategorySlugs(): array
    {
        $tree = $this->getPublicDirectoryTree(menuOnly: false);
        $slugs = [];
        $extract = function (array $nodes) use (&$extract, &$slugs): void {
            foreach ($nodes as $n) {
                if (! empty($n['slug'])) {
                    $slugs[] = (string) $n['slug'];
                }
                if (! empty($n['children']) && is_array($n['children'])) {
                    $extract($n['children']);
                }
            }
        };
        $extract($tree);

        return array_values(array_unique($slugs));
    }

    /**
     * Returns category ID plus all descendant IDs at any hierarchy depth.
     *
     * @return list<int>
     */
    public function getDescendantIds(int $rootId, bool $activeOnly = false): array
    {
        $all = Category::query()
            ->when($activeOnly, fn ($q) => $q->where('is_active', true))
            ->get(['id', 'parent_id']);

        $childrenByParent = [];
        foreach ($all as $cat) {
            if ($cat->parent_id !== null) {
                $childrenByParent[(int) $cat->parent_id][] = (int) $cat->id;
            }
        }

        $result = [];
        $queue = [$rootId];
        $visited = [];
        while ($queue !== []) {
            $curr = array_shift($queue);
            if (isset($visited[$curr])) {
                continue;
            }
            $visited[$curr] = true;
            $result[] = $curr;
            foreach ($childrenByParent[$curr] ?? [] as $childId) {
                if (! isset($visited[$childId])) {
                    $queue[] = $childId;
                }
            }
        }

        return $result;
    }

    /**
     * Resolves ordered ancestor chain (root -> ... -> category) for breadcrumbs.
     *
     * @return list<array{id: int, name: string, slug: string}>
     */
    public function getAncestors(int $categoryId): array
    {
        $all = Category::query()->get(['id', 'parent_id', 'name', 'slug'])->keyBy('id');

        return $this->resolveAncestorsFromMap($categoryId, $all);
    }

    public function wouldCreateCycle(int $categoryId, ?int $newParentId): bool
    {
        if ($newParentId === null) {
            return false;
        }
        if ($newParentId === $categoryId) {
            return true;
        }

        $all = Category::query()->pluck('parent_id', 'id')->all();
        $cursor = $newParentId;
        $steps = 0;
        while ($cursor !== null && $steps <= count($all) + 2) {
            if ((int) $cursor === $categoryId) {
                return true;
            }
            $cursor = $all[$cursor] ?? null;
            $steps++;
        }

        return false;
    }

    public function hasDuplicateSiblingName(string $name, ?int $parentId, ?int $ignoreId = null): bool
    {
        $normalizedTarget = self::normalizeName($name);
        $siblings = Category::query()
            ->when(
                $parentId === null,
                fn ($q) => $q->whereNull('parent_id'),
                fn ($q) => $q->where('parent_id', $parentId)
            )
            ->when($ignoreId !== null, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->get(['id', 'name']);

        foreach ($siblings as $sib) {
            if (self::normalizeName($sib->name) === $normalizedTarget) {
                return true;
            }
        }

        return false;
    }

    public function assertSafeCreate(string $name, ?int $parentId): void
    {
        if ($this->hasDuplicateSiblingName($name, $parentId)) {
            throw ValidationException::withMessages([
                'name' => ['Já existe uma categoria com este nome dentro da mesma categoria pai.'],
            ]);
        }
    }

    public function assertSafeUpdate(int $categoryId, string $name, ?int $newParentId): void
    {
        if ($this->wouldCreateCycle($categoryId, $newParentId)) {
            throw ValidationException::withMessages([
                'parent_id' => ['Referência circular detectada: uma categoria não pode ser filha dela mesma ou de suas subcategorias.'],
            ]);
        }

        if ($this->hasDuplicateSiblingName($name, $newParentId, $categoryId)) {
            throw ValidationException::withMessages([
                'name' => ['Já existe outra categoria com este nome dentro da mesma categoria pai.'],
            ]);
        }
    }

    /**
     * Reorders and/or reparents categories atomically while preventing cycles and duplicate siblings.
     *
     * @param  list<array{id: int, parent_id: int|null, sort_order: int}>  $items
     */
    public function reorder(array $items): void
    {
        DB::transaction(function () use ($items): void {
            $all = Category::query()->lockForUpdate()->get()->keyBy('id');

            foreach ($items as $entry) {
                $id = (int) $entry['id'];
                if (! $all->has($id)) {
                    throw ValidationException::withMessages(['items' => ["Categoria #{$id} não encontrada."]]);
                }
                $newParent = $entry['parent_id'] !== null ? (int) $entry['parent_id'] : null;
                if ($newParent !== null && ! $all->has($newParent)) {
                    throw ValidationException::withMessages(['items' => ["Categoria pai #{$newParent} não encontrada."]]);
                }
                $cat = $all->get($id);
                $cat->parent_id = $newParent;
                $cat->sort_order = max(0, (int) $entry['sort_order']);
            }

            // Validate cycles on the resulting in-memory parent map
            foreach ($all as $cat) {
                $cursor = $cat->parent_id;
                $visited = [$cat->id => true];
                while ($cursor !== null) {
                    if (isset($visited[$cursor])) {
                        throw ValidationException::withMessages([
                            'items' => ['A reorganização solicitada cria uma referência circular na hierarquia.'],
                        ]);
                    }
                    $visited[$cursor] = true;
                    $cursor = $all->get($cursor)?->parent_id;
                }
            }

            // Validate duplicate sibling names per parent
            $seenNames = [];
            foreach ($all as $cat) {
                $pKey = $cat->parent_id ?? 0;
                $norm = self::normalizeName($cat->name);
                if (isset($seenNames[$pKey][$norm])) {
                    throw ValidationException::withMessages([
                        'items' => ["Já existe uma categoria chamada \"{$cat->name}\" no mesmo nível de destino."],
                    ]);
                }
                $seenNames[$pKey][$norm] = true;
            }

            foreach ($all as $cat) {
                if ($cat->isDirty(['parent_id', 'sort_order'])) {
                    $cat->save();
                }
            }
        });

        $this->clearCaches();
    }

    /**
     * @param  list<int>  $categoryIds
     */
    public function syncProductCategories(Product $product, array $categoryIds, ?int $primaryCategoryId = null): void
    {
        $cleanIds = array_values(array_unique(array_filter(array_map('intval', $categoryIds), fn (int $id): bool => $id > 0)));
        if ($primaryCategoryId !== null && $primaryCategoryId > 0 && ! in_array($primaryCategoryId, $cleanIds, true)) {
            array_unshift($cleanIds, $primaryCategoryId);
        }

        if ($cleanIds === []) {
            $product->categories()->sync([]);
            $this->clearCaches();

            return;
        }

        $effectivePrimary = $primaryCategoryId !== null && in_array($primaryCategoryId, $cleanIds, true)
            ? $primaryCategoryId
            : $cleanIds[0];

        if (Schema::hasColumn('category_product', 'is_primary')) {
            $syncData = [];
            foreach ($cleanIds as $cid) {
                $syncData[$cid] = ['is_primary' => $cid === $effectivePrimary];
            }
            $product->categories()->sync($syncData);
        } else {
            $product->categories()->sync($cleanIds);
        }

        $this->clearCaches();
    }

    /** @return array<string, mixed> */
    public function inspectDependencies(Category $category): array
    {
        $directProductsCount = (int) DB::table('category_product')
            ->where('category_id', $category->id)
            ->count();

        $descendantIds = $this->getDescendantIds($category->id);
        $subtreeProductsCount = (int) DB::table('category_product')
            ->whereIn('category_id', $descendantIds)
            ->distinct('product_id')
            ->count('product_id');

        $children = Category::query()
            ->where('parent_id', $category->id)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get(['id', 'name', 'slug', 'is_active'])
            ->map(fn (Category $c): array => [
                'id' => $c->id,
                'name' => $c->name,
                'slug' => $c->slug,
                'is_active' => $c->is_active,
            ])
            ->values()
            ->all();

        $childrenCount = count($children);

        return [
            'category_id' => $category->id,
            'category_name' => $category->name,
            'direct_products_count' => $directProductsCount,
            'subtree_products_count' => $subtreeProductsCount,
            'children_count' => $childrenCount,
            'children' => $children,
            'can_delete_directly' => $directProductsCount === 0 && $childrenCount === 0,
        ];
    }

    /** @return array<string, mixed> */
    public function deleteWithStrategy(
        Category $category,
        string $strategy = 'block',
        ?int $transferCategoryId = null,
        string $subcategoryStrategy = 'promote_to_parent',
    ): array {
        $deps = $this->inspectDependencies($category);

        if ($deps['can_delete_directly'] && $strategy !== 'deactivate') {
            DB::transaction(function () use ($category): void {
                $category->delete();
            });
            $this->clearCaches();

            return [
                'action' => 'deleted',
                'message' => "Categoria \"{$category->name}\" excluída com sucesso.",
                'dependencies' => $deps,
            ];
        }

        if ($strategy === 'deactivate') {
            DB::transaction(function () use ($category): void {
                $category->update([
                    'is_active' => false,
                    'show_in_menu' => false,
                ]);
            });
            $this->clearCaches();

            return [
                'action' => 'deactivated',
                'message' => "Categoria \"{$category->name}\" desativada. Os produtos vinculados foram preservados.",
                'dependencies' => $deps,
            ];
        }

        if ($strategy === 'transfer') {
            if ($deps['direct_products_count'] > 0 && ($transferCategoryId === null || $transferCategoryId === $category->id)) {
                throw ValidationException::withMessages([
                    'transfer_category_id' => ['Selecione uma categoria de destino diferente para transferir os produtos vinculados.'],
                ]);
            }

            if ($transferCategoryId !== null) {
                $target = Category::query()->find($transferCategoryId);
                if (! $target) {
                    throw ValidationException::withMessages([
                        'transfer_category_id' => ['Categoria de destino não encontrada.'],
                    ]);
                }
                if ($transferCategoryId === $category->id) {
                    throw ValidationException::withMessages([
                        'transfer_category_id' => ['A categoria de destino não pode ser a própria categoria excluída.'],
                    ]);
                }
                if ($subcategoryStrategy === 'move_to_target' && in_array($transferCategoryId, $this->getDescendantIds($category->id), true)) {
                    throw ValidationException::withMessages([
                        'transfer_category_id' => ['Não é possível mover subcategorias para dentro de uma categoria descendente.'],
                    ]);
                }
            }

            DB::transaction(function () use ($category, $transferCategoryId, $subcategoryStrategy, $deps): void {
                if ($deps['direct_products_count'] > 0 && $transferCategoryId !== null) {
                    $links = DB::table('category_product')->where('category_id', $category->id)->get();
                    $hasPrimaryCol = Schema::hasColumn('category_product', 'is_primary');
                    foreach ($links as $link) {
                        $existsTarget = DB::table('category_product')
                            ->where('category_id', $transferCategoryId)
                            ->where('product_id', $link->product_id)
                            ->exists();
                        if (! $existsTarget) {
                            $insert = [
                                'category_id' => $transferCategoryId,
                                'product_id' => $link->product_id,
                            ];
                            if ($hasPrimaryCol) {
                                $hasOtherPrimary = DB::table('category_product')
                                    ->where('product_id', $link->product_id)
                                    ->where('category_id', '!=', $category->id)
                                    ->where('is_primary', true)
                                    ->exists();
                                $insert['is_primary'] = (bool) ($link->is_primary ?? false) && ! $hasOtherPrimary;
                            }
                            DB::table('category_product')->insert($insert);
                        }
                    }
                    DB::table('category_product')->where('category_id', $category->id)->delete();
                }

                if ($deps['children_count'] > 0) {
                    $newParentId = $subcategoryStrategy === 'move_to_target' && $transferCategoryId !== null
                        ? $transferCategoryId
                        : $category->parent_id;

                    $children = Category::query()->where('parent_id', $category->id)->get();
                    foreach ($children as $child) {
                        if ($this->hasDuplicateSiblingName($child->name, $newParentId, $child->id)) {
                            throw ValidationException::withMessages([
                                'subcategory_strategy' => ["Já existe uma categoria chamada \"{$child->name}\" no nível de destino das subcategorias."],
                            ]);
                        }
                        $child->update(['parent_id' => $newParentId]);
                    }
                }

                $category->delete();
            });

            $this->clearCaches();

            return [
                'action' => 'transferred_and_deleted',
                'message' => "Dependências reorganizadas e categoria \"{$category->name}\" excluída com segurança.",
                'dependencies' => $deps,
            ];
        }

        throw ValidationException::withMessages([
            'dependencies' => [
                "A categoria \"{$category->name}\" possui {$deps['direct_products_count']} produto(s) vinculado(s) e {$deps['children_count']} subcategoria(s). Transfira, reorganize ou desative antes de excluir.",
            ],
        ]);
    }

    /**
     * @param  Collection<int, Category>  $byId
     * @return list<array{id: int, name: string, slug: string}>
     */
    private function resolveAncestorsFromMap(int $categoryId, Collection $byId): array
    {
        $chain = [];
        $cursor = $byId->get($categoryId);
        $guard = 0;
        while ($cursor && $guard < 20) {
            array_unshift($chain, [
                'id' => (int) $cursor->id,
                'name' => (string) $cursor->name,
                'slug' => (string) $cursor->slug,
            ]);
            $cursor = $cursor->parent_id ? $byId->get((int) $cursor->parent_id) : null;
            $guard++;
        }

        return $chain;
    }
}
