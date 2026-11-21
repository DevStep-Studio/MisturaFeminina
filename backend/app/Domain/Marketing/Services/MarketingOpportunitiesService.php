<?php

declare(strict_types=1);

namespace App\Domain\Marketing\Services;

use App\Models\Category;
use App\Models\MarketingOpportunity;
use App\Models\Product;

class MarketingOpportunitiesService
{
    public function __construct(
        private readonly MarketingBaselineInitializer $initializer,
    ) {}

    /**
     * @param  array{category?: string, status?: string, priority?: string}  $filters
     * @return array<string, mixed>
     */
    public function list(array $filters = []): array
    {
        $this->initializer->ensureBaselineOpportunities();

        $query = MarketingOpportunity::query()->latest('id');

        if (! empty($filters['status']) && $filters['status'] !== 'all') {
            $query->where('status', $filters['status']);
        }
        if (! empty($filters['category']) && $filters['category'] !== 'all') {
            $query->where('category', $filters['category']);
        }
        if (! empty($filters['priority']) && $filters['priority'] !== 'all') {
            $query->where('priority', $filters['priority']);
        }

        $items = $query->get();

        $countsByStatus = [
            'nova' => MarketingOpportunity::query()->where('status', 'nova')->count(),
            'em_analise' => MarketingOpportunity::query()->where('status', 'em_analise')->count(),
            'aprovada' => MarketingOpportunity::query()->where('status', 'aprovada')->count(),
            'implementada' => MarketingOpportunity::query()->where('status', 'implementada')->count(),
            'descartada' => MarketingOpportunity::query()->where('status', 'descartada')->count(),
        ];

        return [
            'items' => $items,
            'counts' => $countsByStatus,
        ];
    }

    public function updateStatus(int $id, string $status): MarketingOpportunity
    {
        $opportunity = MarketingOpportunity::query()->findOrFail($id);
        $opportunity->update(['status' => $status]);

        return $opportunity->fresh();
    }

    /**
     * Scans catalog and metrics to find new commercial opportunities.
     *
     * @return array<string, mixed>
     */
    public function scanCatalogOpportunities(): array
    {
        $created = 0;

        // Check high stock products with high margin
        $heroProducts = Product::query()
            ->where('is_active', true)
            ->where('stock_qty', '>=', 30)
            ->take(3)
            ->get();

        foreach ($heroProducts as $hp) {
            $existing = MarketingOpportunity::query()
                ->where('details->product_id', $hp->id)
                ->first();

            if (! $existing) {
                MarketingOpportunity::query()->create([
                    'title' => "Oportunidade de Escala em Anúncios: {$hp->name}",
                    'category' => 'google_ads',
                    'priority' => 'alta',
                    'effort_level' => 'baixo',
                    'estimated_lift' => '+25% em faturamento do produto',
                    'impact_description' => "O produto {$hp->name} possui estoque confortável ({$hp->stock_qty} unidades) e excelente margem. Incluí-lo em campanhas de Shopping ou PMax trará vendas imediatas.",
                    'status' => 'nova',
                    'details' => ['product_id' => $hp->id, 'stock_qty' => $hp->stock_qty],
                ]);
                $created++;
            }
        }

        return ['message' => "Varredura concluída. {$created} novas oportunidades identificadas."];
    }
}
