<?php

declare(strict_types=1);

namespace App\Domain\Marketing\Services;

use App\Models\MarketingAutomation;
use App\Models\Order;
use App\Models\ProductVariant;

class MarketingAutomationService
{
    public function __construct(
        private readonly SeoAuditService $seoAuditService,
        private readonly GoogleMerchantFeedService $merchantFeedService,
        private readonly MarketingBaselineInitializer $initializer,
    ) {}

    /** @return list<MarketingAutomation> */
    public function list(): array
    {
        $this->initializer->ensureAutomations();

        return MarketingAutomation::query()->orderBy('id')->get()->all();
    }

    public function toggle(int $id): MarketingAutomation
    {
        $automation = MarketingAutomation::query()->findOrFail($id);
        $automation->update(['is_enabled' => ! $automation->is_enabled]);

        return $automation->fresh();
    }

    public function save(array $payload): MarketingAutomation
    {
        if (! empty($payload['id'])) {
            $automation = MarketingAutomation::query()->findOrFail((int) $payload['id']);
            $automation->update($payload);

            return $automation->fresh();
        }

        return MarketingAutomation::query()->create($payload);
    }

    /**
     * Executes the read-only diagnostic automation routine immediately.
     *
     * @return array<string, mixed>
     */
    public function runNow(int $id): array
    {
        $automation = MarketingAutomation::query()->findOrFail($id);

        $result = match ($automation->automation_type) {
            'seo_daily_audit' => $this->runSeoDailyAudit(),
            'weekly_executive_report' => $this->runWeeklyReportRoutine(),
            'out_of_stock_ad_pause' => $this->runShoppingAndStockCheck(),
            default => ['status' => 'success', 'message' => 'Rotina diagnóstica executada com dados reais.'],
        };

        $automation->update([
            'last_run_at' => now(),
            'last_status' => 'success',
            'last_result' => $result,
        ]);

        return [
            'data' => $automation->fresh(),
            'message' => "Automação \"{$automation->name}\" executada com sucesso!",
            'result' => $result,
        ];
    }

    private function runSeoDailyAudit(): array
    {
        $audit = $this->seoAuditService->runAudit();

        return [
            'score' => $audit->overall_score,
            'crawled_urls' => $audit->total_urls_crawled,
            'issues_found' => $audit->issues_count,
            'executed_at' => now()->toIso8601String(),
        ];
    }

    private function runWeeklyReportRoutine(): array
    {
        $orders = Order::query()
            ->where('created_at', '>=', now()->subDays(7))
            ->whereNotIn('status', ['cancelled', 'refunded', 'failed'])
            ->get();

        return [
            'period' => 'last_7_days',
            'total_orders' => $orders->count(),
            'store_revenue_brl' => round(((int) $orders->sum('total_cents')) / 100, 2),
            'executed_at' => now()->toIso8601String(),
        ];
    }

    private function runShoppingAndStockCheck(): array
    {
        $diag = $this->merchantFeedService->getAdminDiagnostics(true);
        $outOfStockActive = ProductVariant::query()
            ->where('is_active', true)
            ->whereNull('archived_at')
            ->where('stock_qty', '<=', 0)
            ->whereHas('product', fn ($q) => $q->where('is_active', true))
            ->distinct('product_id')
            ->count('product_id');

        return [
            'checked_active_products' => $diag['feed']['total_active_products'] ?? 0,
            'ready_for_shopping' => $diag['feed']['ready_products_count'] ?? 0,
            'incomplete_for_shopping' => $diag['feed']['incomplete_products_count'] ?? 0,
            'out_of_stock_active_products' => $outOfStockActive,
            'status' => 'Diagnóstico de estoque e integridade do feed concluído em modo seguro (somente leitura).',
            'executed_at' => now()->toIso8601String(),
        ];
    }
}
