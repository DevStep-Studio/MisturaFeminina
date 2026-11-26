<?php

declare(strict_types=1);

namespace App\Domain\Marketing\Services;

use App\Models\MarketingOpportunity;
use App\Models\ProductVariant;

class MarketingOpportunitiesService
{
    public function __construct(
        private readonly GoogleMerchantFeedService $merchantFeedService,
    ) {}

    /**
     * @param  array{category?: string, status?: string, priority?: string}  $filters
     * @return array<string, mixed>
     */
    public function list(array $filters = []): array
    {
        if (MarketingOpportunity::query()->count() === 0) {
            $this->scanCatalogOpportunities();
        }

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
     * Scans real catalog and Shopping feed readiness to find genuine opportunities.
     *
     * @return array<string, mixed>
     */
    public function scanCatalogOpportunities(): array
    {
        $created = 0;

        $feedDiag = $this->merchantFeedService->getAdminDiagnostics();
        $incompleteCount = (int) ($feedDiag['feed']['incomplete_products_count'] ?? 0);

        if ($incompleteCount > 0) {
            $existingFeedOpp = MarketingOpportunity::query()
                ->where('details->opportunity_key', 'shopping_feed_incomplete')
                ->first();

            if (! $existingFeedOpp) {
                MarketingOpportunity::query()->create([
                    'title' => "Completar {$incompleteCount} produto(s) pendente(s) para o Google Shopping",
                    'category' => 'google_shopping',
                    'priority' => 'alta',
                    'effort_level' => 'medio',
                    'estimated_lift' => 'Habilitação de catálogo real no Merchant Center',
                    'impact_description' => "Há {$incompleteCount} produto(s) ativo(s) fora do feed XML por falta de imagem válida ou preço maior que zero.",
                    'status' => 'nova',
                    'details' => [
                        'opportunity_key' => 'shopping_feed_incomplete',
                        'incomplete_products_count' => $incompleteCount,
                    ],
                ]);
                $created++;
            }
        }

        $heroVariants = ProductVariant::query()
            ->where('is_active', true)
            ->whereNull('archived_at')
            ->where('stock_qty', '>=', 10)
            ->where('price_cents', '>', 0)
            ->whereHas('product', fn ($q) => $q->where('is_active', true))
            ->with('product:id,name,sku')
            ->orderByDesc('stock_qty')
            ->take(3)
            ->get();

        foreach ($heroVariants as $hv) {
            $hp = $hv->product;
            if (! $hp) {
                continue;
            }
            $existing = MarketingOpportunity::query()
                ->where('details->product_id', $hp->id)
                ->first();

            if (! $existing) {
                MarketingOpportunity::query()->create([
                    'title' => "Produto com estoque disponível para destaque: {$hp->name}",
                    'category' => 'catalogo',
                    'priority' => 'media',
                    'effort_level' => 'baixo',
                    'estimated_lift' => 'Aproveitamento de estoque pronto para venda',
                    'impact_description' => "O produto {$hp->name} (SKU {$hp->sku}) está ativo com {$hv->stock_qty} unidade(s) em estoque no catálogo real.",
                    'status' => 'nova',
                    'details' => ['product_id' => $hp->id, 'stock_qty' => $hv->stock_qty],
                ]);
                $created++;
            }
        }

        return ['message' => "Varredura concluída com dados reais do catálogo. {$created} nova(s) oportunidade(s) registrada(s)."];
    }
}
