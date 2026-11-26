<?php

declare(strict_types=1);

namespace App\Domain\Catalog\Services;

use App\Models\Category;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

class CategoryPathResolver
{
    /**
     * Normalizes names for comparison: trims, collapses whitespace, strips accents and lowercases.
     */
    public static function normalizeSegment(string $text): string
    {
        $clean = preg_replace('/\s+/u', ' ', trim($text)) ?? trim($text);

        return Str::ascii(mb_strtolower($clean));
    }

    /**
     * Splits hierarchical category input such as:
     * - "Acessórios > Brocas > Brocas Diamantadas"
     * - "Alongamento Unhas → Gel"
     * - "Cuidados Unhas / Acetona"
     *
     * @return list<string>
     */
    public static function splitPath(string $raw): array
    {
        $trimmed = trim($raw);
        $pattern = preg_match('/[>→»]/u', $trimmed)
            ? '/\s*(?:>|→|»)\s*/u'
            : '/\s*(?:>|→|»|\||\/)\s*/u';
        $parts = preg_split($pattern, $trimmed) ?: [];

        return array_values(array_filter(array_map(fn (string $p): string => trim($p), $parts), fn (string $p): bool => $p !== ''));
    }

    /**
     * Resolves a raw category string (hierarchical path, leaf name, or slug) against existing categories
     * WITHOUT auto-creating duplicates. Returns closest suggestions when not matched.
     *
     * @param  Collection<int, Category>|null  $categories
     * @return array{
     *   status: 'empty'|'matched'|'ambiguous'|'unmatched',
     *   raw: string,
     *   matched_category: array{id: int, name: string, slug: string, full_path: string}|null,
     *   suggestions: list<array{id: int, name: string, slug: string, full_path: string, score: float}>
     * }
     */
    public function resolve(?string $rawCategory, ?Collection $categories = null, ?string $productName = null): array
    {
        $raw = trim((string) $rawCategory);
        if ($raw === '') {
            return [
                'status' => 'empty',
                'raw' => '',
                'matched_category' => null,
                'suggestions' => [],
            ];
        }

        $all = $categories ?? Category::query()->orderBy('sort_order')->orderBy('name')->get();
        $byId = $all->keyBy('id');

        $indexed = [];
        foreach ($all as $cat) {
            $ancestors = $this->buildAncestors($cat, $byId);
            $fullPath = implode(' > ', array_map(fn (array $a): string => $a['name'], $ancestors));
            $normSegments = array_map(fn (array $a): string => self::normalizeSegment($a['name']), $ancestors);
            $indexed[] = [
                'model' => $cat,
                'id' => (int) $cat->id,
                'parent_id' => $cat->parent_id ? (int) $cat->parent_id : null,
                'name' => (string) $cat->name,
                'slug' => (string) $cat->slug,
                'norm_name' => self::normalizeSegment($cat->name),
                'full_path' => $fullPath,
                'norm_full_path' => implode(' > ', $normSegments),
                'segments' => $normSegments,
            ];
        }

        // Contextual spreadsheet group / product refinement against existing official categories (never creates duplicates)
        $aliasPath = $this->resolveContextualAliasPath(
            self::normalizeSegment($raw),
            self::normalizeSegment((string) $productName),
        );
        if ($aliasPath !== null) {
            $aliasNorm = implode(' > ', array_map([self::class, 'normalizeSegment'], explode(' > ', $aliasPath)));
            foreach ($indexed as $item) {
                if ($item['norm_full_path'] === $aliasNorm) {
                    return $this->matchedResult($raw, $item);
                }
            }
        }

        $inputSegments = array_map([self::class, 'normalizeSegment'], self::splitPath($raw));
        if ($inputSegments === []) {
            return [
                'status' => 'empty',
                'raw' => $raw,
                'matched_category' => null,
                'suggestions' => [],
            ];
        }

        // 1. Multi-segment hierarchical path match (exact from root or suffix match)
        if (count($inputSegments) > 1) {
            $targetJoined = implode(' > ', $inputSegments);
            foreach ($indexed as $item) {
                if ($item['norm_full_path'] === $targetJoined) {
                    return $this->matchedResult($raw, $item);
                }
            }

            // Suffix chain match (e.g. "Brocas > Brocas Diamantadas")
            $suffixMatches = [];
            $segLen = count($inputSegments);
            foreach ($indexed as $item) {
                if (count($item['segments']) >= $segLen && array_slice($item['segments'], -$segLen) === $inputSegments) {
                    $suffixMatches[] = $item;
                }
            }
            if (count($suffixMatches) === 1) {
                return $this->matchedResult($raw, $suffixMatches[0]);
            }
            if (count($suffixMatches) > 1) {
                return [
                    'status' => 'ambiguous',
                    'raw' => $raw,
                    'matched_category' => null,
                    'suggestions' => array_map(fn (array $m): array => $this->toSuggestion($m, 0.92), array_slice($suffixMatches, 0, 5)),
                ];
            }

            // Also try matching normalized path with slight singular/plural difference per segment
            foreach ($indexed as $item) {
                if (count($item['segments']) === $segLen) {
                    $allSegsClose = true;
                    foreach ($inputSegments as $idx => $seg) {
                        if (! $this->segmentsClose($seg, $item['segments'][$idx])) {
                            $allSegsClose = false;
                            break;
                        }
                    }
                    if ($allSegsClose) {
                        return $this->matchedResult($raw, $item);
                    }
                }
            }

            return [
                'status' => 'unmatched',
                'raw' => $raw,
                'matched_category' => null,
                'suggestions' => $this->suggestClosest($targetJoined, $indexed),
            ];
        }

        // 2. Single segment: exact slug match, exact root name, or unique leaf name
        $single = $inputSegments[0];
        $slugAttempt = Str::slug($raw);

        foreach ($indexed as $item) {
            if ($item['slug'] === $raw || ($slugAttempt !== '' && $item['slug'] === $slugAttempt && $item['parent_id'] === null)) {
                return $this->matchedResult($raw, $item);
            }
        }

        $exactRoot = null;
        $exactNonRoots = [];
        foreach ($indexed as $item) {
            if ($item['norm_name'] === $single) {
                if ($item['parent_id'] === null) {
                    $exactRoot = $item;
                } else {
                    $exactNonRoots[] = $item;
                }
            }
        }

        if ($exactRoot !== null && $exactNonRoots === []) {
            return $this->matchedResult($raw, $exactRoot);
        }
        // If root exists with exact name (e.g. "Esmalte", "Kits", "Acessórios") without parent path, prefer root cleanly
        if ($exactRoot !== null) {
            return $this->matchedResult($raw, $exactRoot);
        }
        if (count($exactNonRoots) === 1) {
            return $this->matchedResult($raw, $exactNonRoots[0]);
        }
        if (count($exactNonRoots) > 1) {
            return [
                'status' => 'ambiguous',
                'raw' => $raw,
                'matched_category' => null,
                'suggestions' => array_map(fn (array $m): array => $this->toSuggestion($m, 0.90), array_slice($exactNonRoots, 0, 5)),
            ];
        }

        // Slug match on child if unique
        foreach ($indexed as $item) {
            if ($slugAttempt !== '' && $item['slug'] === $slugAttempt) {
                return $this->matchedResult($raw, $item);
            }
        }

        return [
            'status' => 'unmatched',
            'raw' => $raw,
            'matched_category' => null,
            'suggestions' => $this->suggestClosest($single, $indexed),
        ];
    }

    /**
     * @param  array<string, mixed>  $item
     * @return array<string, mixed>
     */
    private function matchedResult(string $raw, array $item): array
    {
        return [
            'status' => 'matched',
            'raw' => $raw,
            'matched_category' => [
                'id' => $item['id'],
                'name' => $item['name'],
                'slug' => $item['slug'],
                'full_path' => $item['full_path'],
            ],
            'suggestions' => [],
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $indexed
     * @return list<array{id: int, name: string, slug: string, full_path: string, score: float}>
     */
    private function suggestClosest(string $targetNorm, array $indexed): array
    {
        $scored = [];
        $targetTokens = array_values(array_filter(preg_split('/[\s>]+/', $targetNorm) ?: []));
        $lastToken = $targetTokens !== [] ? $targetTokens[count($targetTokens) - 1] : $targetNorm;

        foreach ($indexed as $item) {
            $pctFull = 0.0;
            similar_text($targetNorm, $item['norm_full_path'], $pctFull);
            $pctName = 0.0;
            similar_text($lastToken, $item['norm_name'], $pctName);

            $containsBoost = (str_contains($item['norm_name'], $lastToken) || str_contains($lastToken, $item['norm_name'])) ? 25.0 : 0.0;
            $score = max($pctFull, $pctName + $containsBoost * 0.5) / 100.0;

            if ($score >= 0.35) {
                $scored[] = $this->toSuggestion($item, round(min(0.99, $score), 3));
            }
        }

        usort($scored, fn (array $a, array $b): int => $b['score'] <=> $a['score']);

        return array_slice($scored, 0, 5);
    }

    private function segmentsClose(string $a, string $b): bool
    {
        if ($a === $b) {
            return true;
        }
        $pct = 0.0;
        similar_text($a, $b, $pct);

        return $pct >= 88.0;
    }

    /**
     * @param  array<string, mixed>  $item
     * @return array{id: int, name: string, slug: string, full_path: string, score: float}
     */
    private function toSuggestion(array $item, float $score): array
    {
        return [
            'id' => $item['id'],
            'name' => $item['name'],
            'slug' => $item['slug'],
            'full_path' => $item['full_path'],
            'score' => $score,
        ];
    }

    /**
     * @param  Collection<int, Category>  $byId
     * @return list<array{id: int, name: string}>
     */
    private function buildAncestors(Category $category, Collection $byId): array
    {
        $chain = [];
        $cursor = $category;
        $guard = 0;
        while ($cursor && $guard < 20) {
            array_unshift($chain, ['id' => (int) $cursor->id, 'name' => (string) $cursor->name]);
            $cursor = $cursor->parent_id ? $byId->get((int) $cursor->parent_id) : null;
            $guard++;
        }

        return $chain;
    }

    /**
     * Maps common supplier/spreadsheet category labels and product context to the exact official
     * Mistura Feminina / Jack Cosméticos path without auto-creating duplicate categories.
     */
    private function resolveContextualAliasPath(string $normCategory, string $normProductName): ?string
    {
        return match ($normCategory) {
            'lixas e polidores' => 'Acessórios > Lixas',
            'acetonas e removedores' => 'Cuidados Unhas > Acetona',
            'pinceis para unhas' => 'Acessórios > Pincéis',
            'unhas posticas' => 'Alongamento Unhas > Unhas',
            'moldes e tips' => str_contains($normProductName, 'molde')
                ? 'Alongamento Unhas > Moldes Para Unha'
                : 'Alongamento Unhas > Unhas',
            'alicates e instrumentos' => (
                str_contains($normProductName, 'bisturi')
                || str_contains($normProductName, 'espatula')
                || str_contains($normProductName, 'palito de inox')
            )
                ? 'Acessórios > Bisturi / Espátulas'
                : 'Acessórios > Alicates e Cortadores',
            'preparadores e finalizadores' => $this->resolvePreparadorPath($normProductName),
            'geis para unhas' => $this->resolveGelPath($normProductName),
            'colas e adesivos' => str_contains($normProductName, 'cilios')
                ? 'Cílios e Sobrancelhas > Colas para Cílios'
                : 'Alongamento Unhas > Colas',
            'algodao e descartaveis' => $this->resolveAlgodaoDescartaveisPath($normProductName),
            'cuidados com as unhas' => (
                str_contains($normProductName, 'oleo') && str_contains($normProductName, 'cuticula')
            )
                ? 'Cuidados Unhas > Cuidados Unhas e Cutículas > Óleo para Cutículas'
                : ((
                    str_contains($normProductName, 'hidratante')
                    || str_contains($normProductName, 'cuticula')
                    || str_contains($normProductName, 'amolecedor')
                )
                    ? 'Cuidados Unhas > Cuidados Unhas e Cutículas'
                    : 'Cuidados Unhas'),
            'acessorios de beleza' => (
                str_contains($normProductName, 'mostruario')
                || str_contains($normProductName, 'expositor')
            )
                ? 'Acessórios > Expositores e Mostruários'
                : 'Acessórios > Outros',
            'cilios' => $this->resolveCiliosPath($normProductName),
            default => null,
        };
    }

    private function resolvePreparadorPath(string $normProductName): string
    {
        if (str_contains($normProductName, 'regulador de ph') || str_contains($normProductName, 'regulador ph')) {
            return 'Alongamento Unhas > Regulador de Ph';
        }
        if (str_contains($normProductName, 'primer')) {
            return 'Alongamento Unhas > Primer';
        }
        if (str_contains($normProductName, 'oleo para lixamento')) {
            return 'Alongamento Unhas > Óleo para Lixamento';
        }
        if (str_contains($normProductName, 'ultra bond')) {
            return 'Alongamento Unhas > Ultra Bond';
        }
        if (str_contains($normProductName, 'tip blender') || str_contains($normProductName, 'tips blender')) {
            return 'Alongamento Unhas > Tip Blender';
        }
        if (str_contains($normProductName, 'top coat')) {
            return 'Alongamento Unhas > Top Coat';
        }
        if (str_contains($normProductName, 'magic remover')) {
            return 'Alongamento Unhas > Magic Remover';
        }
        if (str_contains($normProductName, 'base coat')) {
            return 'Alongamento Unhas > Base Coat';
        }
        if (str_contains($normProductName, 'bond aid')) {
            return 'Alongamento Unhas > Bond Aid';
        }

        return 'Alongamento Unhas > Prep';
    }

    private function resolveGelPath(string $normProductName): string
    {
        if (str_contains($normProductName, 'fiber')) {
            return 'Alongamento Unhas > Fiber Gel';
        }
        if (str_contains($normProductName, 'soft gel')) {
            return 'Alongamento Unhas > Soft Gel';
        }
        if (str_contains($normProductName, 'polygel')) {
            return 'Alongamento Unhas > Polygel';
        }
        if (str_contains($normProductName, 'base bomba')) {
            return 'Alongamento Unhas > Base Bomba';
        }
        if (str_contains($normProductName, 'base em gel') || str_contains($normProductName, 'base gel')) {
            return 'Alongamento Unhas > Base Gel';
        }

        return 'Alongamento Unhas > Gel';
    }

    private function resolveAlgodaoDescartaveisPath(string $normProductName): string
    {
        if (str_contains($normProductName, 'algodao') && ! str_contains($normProductName, 'palito')) {
            return 'Cuidados Unhas > Algodão';
        }
        if (str_contains($normProductName, 'palito')) {
            return 'Descartáveis > Palitos';
        }
        if (str_contains($normProductName, 'pano') || str_contains($normProductName, 'toalha')) {
            return 'Descartáveis > Toalhas Descartáveis';
        }
        if (str_contains($normProductName, 'abaixador') || str_contains($normProductName, 'espatula')) {
            return 'Descartáveis > Espátulas Descartáveis';
        }
        if (str_contains($normProductName, 'luva')) {
            return 'Descartáveis > Luvas';
        }
        if (str_contains($normProductName, 'mascara')) {
            return 'Descartáveis > Máscaras';
        }

        return 'Descartáveis > Outros Descartáveis';
    }

    private function resolveCiliosPath(string $normProductName): string
    {
        if (str_contains($normProductName, 'escovinha')) {
            return 'Cílios e Sobrancelhas > Escovinhas';
        }
        if (str_contains($normProductName, 'pinca')) {
            return 'Cílios e Sobrancelhas > Pinças';
        }
        if (str_contains($normProductName, 'cola')) {
            return 'Cílios e Sobrancelhas > Colas para Cílios';
        }
        if (str_contains($normProductName, 'fita') || str_contains($normProductName, 'pad')) {
            return 'Cílios e Sobrancelhas > Acessórios';
        }

        return 'Cílios e Sobrancelhas > Cílios';
    }
}
