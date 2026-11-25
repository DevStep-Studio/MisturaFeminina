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
        $parts = preg_split('/\s*(?:>|→|»|\||\/)\s*/u', trim($raw)) ?: [];

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
    public function resolve(?string $rawCategory, ?Collection $categories = null): array
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
}
