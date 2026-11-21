<?php

declare(strict_types=1);

namespace App\Domain\Marketing\Services;

use App\Models\MarketingReport;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Response;

class MarketingReportService
{
    public function __construct(
        private readonly MarketingIntelligenceService $intelligence,
    ) {}

    /** @return list<MarketingReport> */
    public function list(): array
    {
        $existing = MarketingReport::query()->latest('id')->get();
        if ($existing->isNotEmpty()) {
            return $existing->all();
        }

        // Initialize baseline report
        $report = $this->generate([
            'title' => 'Relatório Mensal Consolidado de Marketing — Mês Vigente',
            'period_range' => 'last_30_days',
            'period_start' => now()->subDays(29)->toDateString(),
            'period_end' => now()->toDateString(),
        ]);

        return [$report];
    }

    /**
     * @param  array{title?: string, period_range?: string, period_start?: string, period_end?: string}  $params
     */
    public function generate(array $params, ?User $actor = null): MarketingReport
    {
        $range = $params['period_range'] ?? 'last_30_days';
        $overview = $this->intelligence->getOverview([
            'range' => $range,
            'start_date' => $params['period_start'] ?? null,
            'end_date' => $params['period_end'] ?? null,
        ]);

        $title = $params['title'] ?? ('Relatório de Marketing — '.$overview['period']['label']);
        $start = Carbon::parse($overview['period']['start_date']);
        $end = Carbon::parse($overview['period']['end_date']);

        $summary = $overview['ai_period_summary'];

        return MarketingReport::query()->create([
            'title' => $title,
            'period_range' => $range,
            'period_start' => $start,
            'period_end' => $end,
            'summary_text' => $summary,
            'metrics_payload' => [
                'kpis' => $overview['kpis'],
                'sales_by_channel' => $overview['sales_by_channel'],
                'traffic_sources' => $overview['traffic_sources'],
                'attribution' => $overview['attribution_transparency'],
            ],
            'created_by_user_id' => $actor?->id,
        ]);
    }

    public function exportCsv(int $id): Response
    {
        $report = MarketingReport::query()->findOrFail($id);
        $payload = $report->metrics_payload ?? [];
        $channels = $payload['sales_by_channel'] ?? [];

        $lines = [
            'Canal;Pedidos;Receita (R$);ROAS',
        ];

        foreach ($channels as $ch) {
            $revBrl = number_format(($ch['revenue_cents'] ?? 0) / 100, 2, ',', '.');
            $roasStr = isset($ch['roas']) ? number_format((float) $ch['roas'], 2, ',', '.') : 'N/A (Orgânico)';
            $lines[] = implode(';', [
                $ch['channel'] ?? '',
                $ch['orders'] ?? 0,
                $revBrl,
                $roasStr,
            ]);
        }

        $content = implode("\n", $lines);
        $filename = 'relatorio-marketing-mistura-feminina-'.now()->format('Y-m-d').'.csv';

        return response($content, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }
}
