<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Domain\Catalog\Services\CategoryHierarchyService;
use App\Models\Category;
use App\Models\SlugRedirect;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class OfficialCategoriesSeeder extends Seeder
{
    /**
     * Legacy slugs from initial DemoStoreSeeder / manual transitions whose slug or name
     * diverged from the official Jack Cosméticos + Mistura Feminina catalog.
     *
     * @var array<string, list<string>>
     */
    private const LEGACY_NODE_SLUGS = [
        'acessorios' => ['unhas-e-esmalteria'],
        'alicates-e-cortadores' => ['esmaltes-em-gel'],
        'maquinarios' => ['acessorios-pro'],
        'aspiradores-sugadores' => ['aspiradores'],
        'cabines-e-estufas' => ['cabines', 'maquinarios-cabines-e-estufas'],
        'cabines-uv-led' => ['cabines', 'cabines-e-estufas', 'maquinarios-cabines-e-estufas'],
        'motores-lixadeiras' => ['motores'],
        'luminarias-e-lampadas' => ['luminarias'],
        'esmalte-em-gel-anylovy' => ['esmalte-em-gel-anylovi'],
    ];

    /**
     * Slugs where a legacy DemoStoreSeeder placeholder name should be updated to the official name.
     *
     * @var list<string>
     */
    private const LEGACY_RENAME_SLUGS = [
        'acessorios-pro',
        'aspiradores',
        'cabines',
        'motores',
        'luminarias',
    ];

    /**
     * Untouched DemoStoreSeeder categories outside Mistura Feminina's catalog that should be
     * deactivated when empty (0 products and 0 subcategories), preserving IDs without cluttering menus.
     *
     * @var list<string>
     */
    private const UNUSED_DEMO_SLUGS = [
        'maquiagem',
        'skincare',
        'cabelos',
        'corpo-e-banho',
        'cilios-e-design',
    ];

    /**
     * Official category hierarchy for Mistura Feminina aligned with Jack Cosméticos public menu
     * (names, order and up to 3 levels, including Magic Remover, Soft Gel and Base Coat)
     * plus complementary Mistura Feminina departments.
     *
     * @return list<array{name: string, slug: string, children?: list<array<string, mixed>>}>
     */
    public static function officialTree(): array
    {
        return [
            [
                'name' => 'Acessórios',
                'slug' => 'acessorios',
                'children' => [
                    ['name' => 'Alicates e Cortadores', 'slug' => 'alicates-e-cortadores'],
                    [
                        'name' => 'Brocas',
                        'slug' => 'brocas',
                        'children' => [
                            ['name' => 'Broca de Cerâmica', 'slug' => 'broca-de-ceramica'],
                            ['name' => 'Brocas Diamantadas', 'slug' => 'brocas-diamantadas'],
                            ['name' => 'Brocas Tungstênio', 'slug' => 'brocas-tungstenio'],
                            ['name' => 'Refil para lixadeiras', 'slug' => 'refil-para-lixadeiras'],
                            ['name' => 'Broca de Limpeza', 'slug' => 'broca-de-limpeza'],
                        ],
                    ],
                    ['name' => 'Bisturi / Espátulas', 'slug' => 'bisturi-espatulas'],
                    ['name' => 'Expositores e Mostruários', 'slug' => 'expositores-e-mostruarios'],
                    ['name' => 'Lixas', 'slug' => 'lixas'],
                    ['name' => 'Pincéis', 'slug' => 'pinceis'],
                    ['name' => 'Pinças e Presilhas', 'slug' => 'pincas-e-presilhas'],
                    ['name' => 'Outros', 'slug' => 'acessorios-outros'],
                ],
            ],
            [
                'name' => 'Alongamento Unhas',
                'slug' => 'alongamento-unhas',
                'children' => [
                    ['name' => 'Base Bomba', 'slug' => 'base-bomba'],
                    ['name' => 'Base Gel', 'slug' => 'base-gel'],
                    ['name' => 'Bond Aid', 'slug' => 'bond-aid'],
                    ['name' => 'Colas', 'slug' => 'colas'],
                    ['name' => 'Fiber Gel', 'slug' => 'fiber-gel'],
                    ['name' => 'Fibra de Vidro', 'slug' => 'fibra-de-vidro'],
                    ['name' => 'Gel', 'slug' => 'gel'],
                    ['name' => 'Moldes Para Unha', 'slug' => 'moldes-para-unha'],
                    ['name' => 'Monomer', 'slug' => 'monomer'],
                    ['name' => 'Óleo para Lixamento', 'slug' => 'oleo-para-lixamento'],
                    ['name' => 'Polygel', 'slug' => 'polygel'],
                    ['name' => 'Prep', 'slug' => 'prep'],
                    ['name' => 'Primer', 'slug' => 'primer'],
                    ['name' => 'Pó Acrílico', 'slug' => 'po-acrilico'],
                    ['name' => 'Regulador de Ph', 'slug' => 'regulador-de-ph'],
                    ['name' => 'Removedor de Gel', 'slug' => 'removedor-de-gel'],
                    ['name' => 'Tip Blender', 'slug' => 'tip-blender'],
                    ['name' => 'Top Coat', 'slug' => 'top-coat'],
                    ['name' => 'Ultra Bond', 'slug' => 'ultra-bond'],
                    ['name' => 'Unhas', 'slug' => 'unhas'],
                    ['name' => 'Magic Remover', 'slug' => 'magic-remover'],
                    ['name' => 'Soft Gel', 'slug' => 'soft-gel'],
                    ['name' => 'Base Coat', 'slug' => 'base-coat'],
                ],
            ],
            [
                'name' => 'Cuidados Unhas',
                'slug' => 'cuidados-unhas',
                'children' => [
                    ['name' => 'Acetona', 'slug' => 'acetona'],
                    ['name' => 'Algodão', 'slug' => 'algodao'],
                    [
                        'name' => 'Cuidados Unhas e Cutículas',
                        'slug' => 'cuidados-unhas-e-cuticulas',
                        'children' => [
                            ['name' => 'Óleo para Cutículas', 'slug' => 'oleo-para-cuticulas'],
                        ],
                    ],
                ],
            ],
            [
                'name' => 'Decoração',
                'slug' => 'decoracao',
                'children' => [
                    ['name' => 'Adesivos', 'slug' => 'adesivos'],
                    ['name' => 'Demais Decorações', 'slug' => 'demais-decoracoes'],
                    ['name' => 'Glitters', 'slug' => 'glitters'],
                    ['name' => 'Kits Para Encapsular', 'slug' => 'kits-para-encapsular'],
                    ['name' => 'Pedrarias e Joias', 'slug' => 'pedrarias-e-joias'],
                    ['name' => 'Pó borboleta', 'slug' => 'po-borboleta'],
                ],
            ],
            [
                'name' => 'Esmalte',
                'slug' => 'esmalte',
            ],
            [
                'name' => 'Esmalte em Gel',
                'slug' => 'esmalte-em-gel',
                'children' => [
                    ['name' => 'D&Z', 'slug' => 'esmalte-em-gel-dz'],
                    ['name' => 'K&S', 'slug' => 'esmalte-em-gel-ks'],
                    ['name' => 'Lirió', 'slug' => 'esmalte-em-gel-lirio'],
                    ['name' => 'Siôux', 'slug' => 'esmalte-em-gel-sioux'],
                    ['name' => 'X&D', 'slug' => 'esmalte-em-gel-xd'],
                    ['name' => 'Zem', 'slug' => 'esmalte-em-gel-zem'],
                    ['name' => 'AnyLovy', 'slug' => 'esmalte-em-gel-anylovy'],
                    ['name' => 'Bella Rosa', 'slug' => 'esmalte-em-gel-bella-rosa'],
                    ['name' => 'Top Lirio', 'slug' => 'esmalte-em-gel-top-lirio'],
                    ['name' => 'Vênus', 'slug' => 'esmalte-em-gel-venus'],
                    ['name' => 'Real Love', 'slug' => 'esmalte-em-gel-real-love'],
                ],
            ],
            [
                'name' => 'Kits',
                'slug' => 'kits',
                'children' => [
                    ['name' => 'Esmalte', 'slug' => 'kits-esmalte'],
                    ['name' => 'Preparadores', 'slug' => 'kits-preparadores'],
                    ['name' => 'Iniciante', 'slug' => 'kits-iniciante'],
                ],
            ],
            [
                'name' => 'Maquinários',
                'slug' => 'maquinarios',
                'children' => [
                    ['name' => 'Aspiradores / Sugadores', 'slug' => 'aspiradores-sugadores'],
                    ['name' => 'Cabines e Estufas', 'slug' => 'cabines-e-estufas'],
                    ['name' => 'Motores/Lixadeiras', 'slug' => 'motores-lixadeiras'],
                    ['name' => 'Luminárias e Lâmpadas', 'slug' => 'luminarias-e-lampadas'],
                ],
            ],
            // Categorias complementares da Mistura Feminina
            [
                'name' => 'Cílios e Sobrancelhas',
                'slug' => 'cilios-e-sobrancelhas',
                'children' => [
                    ['name' => 'Cílios', 'slug' => 'cilios-e-sobrancelhas-cilios'],
                    ['name' => 'Colas para Cílios', 'slug' => 'colas-para-cilios'],
                    ['name' => 'Pinças', 'slug' => 'cilios-e-sobrancelhas-pincas'],
                    ['name' => 'Removedores', 'slug' => 'cilios-e-sobrancelhas-removedores'],
                    ['name' => 'Preparadores', 'slug' => 'cilios-e-sobrancelhas-preparadores'],
                    ['name' => 'Acessórios', 'slug' => 'cilios-e-sobrancelhas-acessorios'],
                    ['name' => 'Escovinhas', 'slug' => 'escovinhas'],
                    ['name' => 'Kits', 'slug' => 'cilios-e-sobrancelhas-kits'],
                ],
            ],
            [
                'name' => 'Depilação',
                'slug' => 'depilacao',
                'children' => [
                    ['name' => 'Ceras Depilatórias', 'slug' => 'ceras-depilatorias'],
                    ['name' => 'Roll-on', 'slug' => 'roll-on'],
                    ['name' => 'Lenços Depilatórios', 'slug' => 'lencos-depilatorios'],
                    ['name' => 'Pré-depilação', 'slug' => 'pre-depilacao'],
                    ['name' => 'Pós-depilação', 'slug' => 'pos-depilacao'],
                    ['name' => 'Aparelhos para Depilação', 'slug' => 'aparelhos-para-depilacao'],
                    ['name' => 'Acessórios', 'slug' => 'depilacao-acessorios'],
                ],
            ],
            [
                'name' => 'Descartáveis',
                'slug' => 'descartaveis',
                'children' => [
                    ['name' => 'Luvas', 'slug' => 'luvas'],
                    ['name' => 'Máscaras', 'slug' => 'mascaras'],
                    ['name' => 'Palitos', 'slug' => 'palitos'],
                    ['name' => 'Espátulas Descartáveis', 'slug' => 'espatulas-descartaveis'],
                    ['name' => 'Toalhas Descartáveis', 'slug' => 'toalhas-descartaveis'],
                    ['name' => 'Outros Descartáveis', 'slug' => 'outros-descartaveis'],
                ],
            ],
            [
                'name' => 'Higiene e Esterilização',
                'slug' => 'higiene-e-esterilizacao',
                'children' => [
                    ['name' => 'Antissépticos', 'slug' => 'antissepticos'],
                    ['name' => 'Higienizadores', 'slug' => 'higienizadores'],
                    ['name' => 'Materiais para Esterilização', 'slug' => 'materiais-para-esterilizacao'],
                    ['name' => 'Acessórios de Limpeza', 'slug' => 'acessorios-de-limpeza'],
                ],
            ],
        ];
    }

    /**
     * Runs idempotently: reconciles divergent/misplaced categories while preserving IDs and
     * category_product links, creates missing official categories in exact hierarchy/order,
     * registers 301 SlugRedirects for updated legacy slugs, and preserves admin customizations.
     *
     * @return array{created: int, reused: int, reconciled: int, deactivated_legacy: int, total_official: int}
     */
    public function seedOfficialCategories(): array
    {
        $stats = [
            'created' => 0,
            'reused' => 0,
            'reconciled' => 0,
            'deactivated_legacy' => 0,
            'total_official' => 0,
        ];

        DB::transaction(function () use (&$stats): void {
            $tree = self::officialTree();
            $nameFrequency = [];
            $this->collectNameFrequency($tree, $nameFrequency);
            $claimedIds = [];

            $this->seedNodes($tree, null, $stats, $claimedIds, $nameFrequency);
            $this->deactivateEmptyLegacyDemoCategories($claimedIds, $stats);
        });

        app(CategoryHierarchyService::class)->clearCaches();

        return $stats;
    }

    public function run(): void
    {
        $stats = $this->seedOfficialCategories();
        if ($this->command) {
            $this->command->info(
                "OfficialCategoriesSeeder: {$stats['created']} criada(s), {$stats['reused']} reaproveitada(s), {$stats['reconciled']} reconciliada(s) (total oficial: {$stats['total_official']})."
            );
        }
    }

    /**
     * @param  list<array<string, mixed>>  $nodes
     * @param  array<string, int>  $freq
     */
    private function collectNameFrequency(array $nodes, array &$freq): void
    {
        foreach ($nodes as $node) {
            $norm = CategoryHierarchyService::normalizeName((string) $node['name']);
            $freq[$norm] = ($freq[$norm] ?? 0) + 1;
            if (! empty($node['children']) && is_array($node['children'])) {
                $this->collectNameFrequency($node['children'], $freq);
            }
        }
    }

    /**
     * @param  list<array<string, mixed>>  $nodes
     * @param  array{created: int, reused: int, reconciled: int, deactivated_legacy: int, total_official: int}  $stats
     * @param  array<int, bool>  $claimedIds
     * @param  array<string, int>  $nameFrequency
     */
    private function seedNodes(
        array $nodes,
        ?int $parentId,
        array &$stats,
        array &$claimedIds,
        array $nameFrequency,
    ): void {
        $branchOrderedIds = [];
        $branchChangedStructure = false;

        foreach ($nodes as $index => $node) {
            $stats['total_official']++;
            $name = (string) $node['name'];
            $preferredSlug = (string) $node['slug'];
            $sortOrder = $index + 1;
            $legacySlugs = self::LEGACY_NODE_SLUGS[$preferredSlug] ?? [];

            $existing = $this->findExistingCategory(
                $name,
                $preferredSlug,
                $parentId,
                $legacySlugs,
                $claimedIds,
                $nameFrequency,
            );

            if ($existing) {
                $stats['reused']++;
                $claimedIds[(int) $existing->id] = true;
                $wasReconciled = $this->reconcileExistingCategory(
                    $existing,
                    $name,
                    $preferredSlug,
                    $parentId,
                    $sortOrder,
                    $legacySlugs,
                );
                if ($wasReconciled) {
                    $stats['reconciled']++;
                    $branchChangedStructure = true;
                }
                $category = $existing;
            } else {
                $slug = $this->resolveAvailableSlug($preferredSlug, $parentId);
                $category = Category::query()->create([
                    'parent_id' => $parentId,
                    'name' => $name,
                    'slug' => $slug,
                    'sort_order' => $sortOrder,
                    'show_in_menu' => true,
                    'is_active' => true,
                ]);
                $claimedIds[(int) $category->id] = true;
                $stats['created']++;
                $branchChangedStructure = true;
            }

            $branchOrderedIds[] = (int) $category->id;

            if (! empty($node['children']) && is_array($node['children'])) {
                $this->seedNodes($node['children'], (int) $category->id, $stats, $claimedIds, $nameFrequency);
            }
        }

        // Align sibling sort_order to reference sequence whenever new/reconciled items entered this level
        // or if duplicate sort_order values exist among the official siblings; otherwise preserve manual admin order.
        if ($branchOrderedIds !== []) {
            $currentOrders = Category::query()
                ->whereIn('id', $branchOrderedIds)
                ->pluck('sort_order', 'id')
                ->map(fn ($v): int => (int) $v)
                ->all();

            $hasOrderCollision = count(array_unique(array_values($currentOrders))) < count($currentOrders);
            if ($branchChangedStructure || $hasOrderCollision) {
                foreach ($branchOrderedIds as $idx => $catId) {
                    $desired = $idx + 1;
                    if (($currentOrders[$catId] ?? null) !== $desired) {
                        Category::query()->where('id', $catId)->update(['sort_order' => $desired]);
                    }
                }
            }
        }
    }

    /**
     * @param  list<string>  $legacySlugs
     * @param  array<int, bool>  $claimedIds
     * @param  array<string, int>  $nameFrequency
     */
    private function findExistingCategory(
        string $name,
        string $preferredSlug,
        ?int $parentId,
        array $legacySlugs,
        array $claimedIds,
        array $nameFrequency,
    ): ?Category {
        $normTarget = CategoryHierarchyService::normalizeName($name);
        $excludedIds = array_keys($claimedIds);

        $siblings = Category::query()
            ->when($excludedIds !== [], fn ($q) => $q->whereNotIn('id', $excludedIds))
            ->when(
                $parentId === null,
                fn ($q) => $q->whereNull('parent_id'),
                fn ($q) => $q->where('parent_id', $parentId)
            )
            ->get();

        // 1. Exact normalized name match at target parent
        foreach ($siblings as $sib) {
            if (CategoryHierarchyService::normalizeName($sib->name) === $normTarget) {
                return $sib;
            }
        }

        // 2. Canonical or legacy slug already sitting at target parent (e.g. admin customized display name)
        $slugCandidates = array_values(array_unique(array_merge([$preferredSlug], $legacySlugs)));
        foreach ($siblings as $sib) {
            if (in_array($sib->slug, $slugCandidates, true)) {
                return $sib;
            }
        }

        // 3. Globally unique canonical or legacy slug sitting under a misplaced parent (preserves ID + product links)
        $bySlugAnywhere = Category::query()
            ->when($excludedIds !== [], fn ($q) => $q->whereNotIn('id', $excludedIds))
            ->whereIn('slug', $slugCandidates)
            ->orderByRaw('CASE WHEN slug = ? THEN 0 ELSE 1 END', [$preferredSlug])
            ->first();
        if ($bySlugAnywhere) {
            return $bySlugAnywhere;
        }

        // 4. Globally unique official name sitting under a misplaced parent (e.g. Brocas, Top Coat, Gel)
        if (($nameFrequency[$normTarget] ?? 0) === 1) {
            $allUnclaimed = Category::query()
                ->when($excludedIds !== [], fn ($q) => $q->whereNotIn('id', $excludedIds))
                ->get();
            foreach ($allUnclaimed as $candidate) {
                if (CategoryHierarchyService::normalizeName($candidate->name) === $normTarget) {
                    return $candidate;
                }
            }
        }

        return null;
    }

    /**
     * Reconciles misplaced parent_id and legacy DemoStoreSeeder slugs/names while preserving
     * category ID, product links (category_product), images, descriptions, and SEO fields.
     *
     * @param  list<string>  $legacySlugs
     */
    private function reconcileExistingCategory(
        Category $category,
        string $officialName,
        string $preferredSlug,
        ?int $targetParentId,
        int $targetSortOrder,
        array $legacySlugs,
    ): bool {
        $changed = false;
        $oldSlug = (string) $category->slug;
        $currentParentId = $category->parent_id !== null ? (int) $category->parent_id : null;

        if ($currentParentId !== $targetParentId) {
            // Guard against circular hierarchy before moving
            if ($targetParentId === null || ! app(CategoryHierarchyService::class)->wouldCreateCycle((int) $category->id, $targetParentId)) {
                $category->parent_id = $targetParentId;
                $category->sort_order = $targetSortOrder;
                $changed = true;
            }
        }

        if (in_array($oldSlug, self::LEGACY_RENAME_SLUGS, true) && $category->name !== $officialName) {
            $category->name = $officialName;
            $changed = true;
        }

        // Fix divergent legacy slug (e.g. Acessórios -> /unhas-e-esmalteria, Alicates e Cortadores -> /esmaltes-em-gel)
        if ($oldSlug !== $preferredSlug && in_array($oldSlug, $legacySlugs, true)) {
            $newSlug = $this->resolveAvailableSlug($preferredSlug, $targetParentId, (int) $category->id);
            if ($newSlug !== $oldSlug) {
                $category->slug = $newSlug;
                $changed = true;
            }
        }

        if ($changed) {
            $category->save();

            if ($category->slug !== $oldSlug) {
                SlugRedirect::query()->updateOrCreate(
                    ['entity_type' => 'category', 'old_slug' => $oldSlug],
                    ['new_slug' => (string) $category->slug],
                );
            }
        }

        return $changed;
    }

    /**
     * Deactivates untouched DemoStoreSeeder categories outside Mistura Feminina's catalog ONLY
     * when they have 0 linked products and 0 child categories (preserving IDs in database).
     *
     * @param  array<int, bool>  $claimedIds
     * @param  array{created: int, reused: int, reconciled: int, deactivated_legacy: int, total_official: int}  $stats
     */
    private function deactivateEmptyLegacyDemoCategories(array $claimedIds, array &$stats): void
    {
        $excludedIds = array_keys($claimedIds);
        $candidates = Category::query()
            ->when($excludedIds !== [], fn ($q) => $q->whereNotIn('id', $excludedIds))
            ->whereIn('slug', self::UNUSED_DEMO_SLUGS)
            ->where('is_active', true)
            ->get();

        foreach ($candidates as $legacy) {
            $hasProducts = DB::table('category_product')->where('category_id', $legacy->id)->exists();
            $hasChildren = Category::query()->where('parent_id', $legacy->id)->exists();
            if (! $hasProducts && ! $hasChildren) {
                $legacy->update([
                    'is_active' => false,
                    'show_in_menu' => false,
                    'sort_order' => 900 + (int) $legacy->id,
                ]);
                $stats['deactivated_legacy']++;
            }
        }
    }

    private function resolveAvailableSlug(string $preferredSlug, ?int $parentId, ?int $ignoreId = null): string
    {
        $base = Str::slug($preferredSlug) ?: 'categoria';
        $existsQuery = fn (string $candidate): bool => Category::query()
            ->where('slug', $candidate)
            ->when($ignoreId !== null, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->exists();

        if (! $existsQuery($base)) {
            return $base;
        }

        if ($parentId !== null) {
            $parentSlug = Category::query()->where('id', $parentId)->value('slug');
            if (is_string($parentSlug) && $parentSlug !== '') {
                $scoped = Str::slug("{$parentSlug}-{$base}");
                if ($scoped !== '' && ! $existsQuery($scoped)) {
                    return $scoped;
                }
                $base = $scoped ?: $base;
            }
        }

        $suffix = 2;
        while ($existsQuery("{$base}-{$suffix}")) {
            $suffix++;
        }

        return "{$base}-{$suffix}";
    }
}
