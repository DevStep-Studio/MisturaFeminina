<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Domain\Catalog\Services\CategoryHierarchyService;
use App\Models\Category;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class OfficialCategoriesSeeder extends Seeder
{
    /**
     * Official category hierarchy for Mistura Feminina (Sections 1 & 2).
     *
     * @return list<array{name: string, slug: string, children?: list<array<string, mixed>>}>
     */
    public static function officialTree(): array
    {
        return [
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
                ],
            ],
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
                'name' => 'Esmalte em Gel',
                'slug' => 'esmalte-em-gel',
                'children' => [
                    ['name' => 'D&Z', 'slug' => 'esmalte-em-gel-dz'],
                    ['name' => 'K&S', 'slug' => 'esmalte-em-gel-ks'],
                    ['name' => 'Lirió', 'slug' => 'esmalte-em-gel-lirio'],
                    ['name' => 'Siôux', 'slug' => 'esmalte-em-gel-sioux'],
                    ['name' => 'X&D', 'slug' => 'esmalte-em-gel-xd'],
                    ['name' => 'Zem', 'slug' => 'esmalte-em-gel-zem'],
                    ['name' => 'AnyLovy', 'slug' => 'esmalte-em-gel-anylovi'],
                    ['name' => 'Bella Rosa', 'slug' => 'esmalte-em-gel-bella-rosa'],
                    ['name' => 'Top Lirio', 'slug' => 'esmalte-em-gel-top-lirio'],
                    ['name' => 'Vênus', 'slug' => 'esmalte-em-gel-venus'],
                    ['name' => 'Real Love', 'slug' => 'esmalte-em-gel-real-love'],
                ],
            ],
            [
                'name' => 'Esmalte',
                'slug' => 'esmalte',
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
                    ['name' => 'Cabines e Estufas', 'slug' => 'maquinarios-cabines-e-estufas'],
                    ['name' => 'Motores/Lixadeiras', 'slug' => 'motores-lixadeiras'],
                    ['name' => 'Luminárias e Lâmpadas', 'slug' => 'luminarias-e-lampadas'],
                ],
            ],
            // Complementary categories (Section 2)
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
     * Runs idempotently: creates missing official categories in exact hierarchy/order
     * without duplicating siblings or overwriting existing admin customizations.
     *
     * @return array{created: int, reused: int, total_official: int}
     */
    public function seedOfficialCategories(): array
    {
        $stats = ['created' => 0, 'reused' => 0, 'total_official' => 0];

        DB::transaction(function () use (&$stats): void {
            $tree = self::officialTree();
            $this->seedNodes($tree, null, $stats);
        });

        app(CategoryHierarchyService::class)->clearCaches();

        return $stats;
    }

    public function run(): void
    {
        $stats = $this->seedOfficialCategories();
        if ($this->command) {
            $this->command->info(
                "OfficialCategoriesSeeder: {$stats['created']} criada(s), {$stats['reused']} reaproveitada(s) (total oficial: {$stats['total_official']})."
            );
        }
    }

    /**
     * @param  list<array<string, mixed>>  $nodes
     * @param  array{created: int, reused: int, total_official: int}  $stats
     */
    private function seedNodes(array $nodes, ?int $parentId, array &$stats): void
    {
        foreach ($nodes as $index => $node) {
            $stats['total_official']++;
            $name = (string) $node['name'];
            $preferredSlug = (string) $node['slug'];
            $sortOrder = $index + 1;

            $existing = $this->findExistingSibling($name, $preferredSlug, $parentId);

            if ($existing) {
                $stats['reused']++;
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
                $stats['created']++;
            }

            if (! empty($node['children']) && is_array($node['children'])) {
                $this->seedNodes($node['children'], (int) $category->id, $stats);
            }
        }
    }

    private function findExistingSibling(string $name, string $preferredSlug, ?int $parentId): ?Category
    {
        $normTarget = CategoryHierarchyService::normalizeName($name);
        $siblings = Category::query()
            ->when(
                $parentId === null,
                fn ($q) => $q->whereNull('parent_id'),
                fn ($q) => $q->where('parent_id', $parentId)
            )
            ->get();

        foreach ($siblings as $sib) {
            if (CategoryHierarchyService::normalizeName($sib->name) === $normTarget) {
                return $sib;
            }
        }

        // Also match if canonical slug was already created under this exact parent_id (e.g. admin renamed display name)
        $bySlug = Category::query()->where('slug', $preferredSlug)->first();
        if ($bySlug && ($bySlug->parent_id === $parentId || ($bySlug->parent_id === null && $parentId === null))) {
            return $bySlug;
        }

        return null;
    }

    private function resolveAvailableSlug(string $preferredSlug, ?int $parentId): string
    {
        $base = Str::slug($preferredSlug) ?: 'categoria';
        if (! Category::query()->where('slug', $base)->exists()) {
            return $base;
        }

        if ($parentId !== null) {
            $parentSlug = Category::query()->where('id', $parentId)->value('slug');
            if (is_string($parentSlug) && $parentSlug !== '') {
                $scoped = Str::slug("{$parentSlug}-{$base}");
                if ($scoped !== '' && ! Category::query()->where('slug', $scoped)->exists()) {
                    return $scoped;
                }
                $base = $scoped ?: $base;
            }
        }

        $suffix = 2;
        while (Category::query()->where('slug', "{$base}-{$suffix}")->exists()) {
            $suffix++;
        }

        return "{$base}-{$suffix}";
    }
}
