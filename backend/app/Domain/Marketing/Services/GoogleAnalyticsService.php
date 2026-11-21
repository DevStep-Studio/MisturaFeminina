<?php

declare(strict_types=1);

namespace App\Domain\Marketing\Services;

use App\Models\MarketingIntegration;

class GoogleAnalyticsService
{
    /** @return array<string, mixed> */
    public function getInsights(): array
    {
        $integration = MarketingIntegration::query()->where('platform', 'google_analytics_4')->first();

        $acquisitionChannels = [
            [
                'channel' => 'Google Orgânico',
                'source_medium' => 'google / organic',
                'sessions' => 4520,
                'users' => 3890,
                'engaged_rate_pct' => 68.4,
                'conversions' => 108,
                'cvr_pct' => 2.39,
                'revenue_cents' => 1134000,
            ],
            [
                'channel' => 'Google Ads (Pesquisa & PMax)',
                'source_medium' => 'google / cpc',
                'sessions' => 2890,
                'users' => 2410,
                'engaged_rate_pct' => 74.2,
                'conversions' => 118,
                'cvr_pct' => 4.08,
                'revenue_cents' => 1357000,
            ],
            [
                'channel' => 'Instagram (Ads & Reels)',
                'source_medium' => 'instagram / cpc',
                'sessions' => 2410,
                'users' => 2180,
                'engaged_rate_pct' => 71.5,
                'conversions' => 84,
                'cvr_pct' => 3.49,
                'revenue_cents' => 823200,
            ],
            [
                'channel' => 'Direto / Navegador',
                'source_medium' => '(direct) / (none)',
                'sessions' => 1850,
                'users' => 1420,
                'engaged_rate_pct' => 78.1,
                'conversions' => 62,
                'cvr_pct' => 3.35,
                'revenue_cents' => 744000,
            ],
            [
                'channel' => 'Facebook Ads',
                'source_medium' => 'facebook / cpc',
                'sessions' => 980,
                'users' => 890,
                'engaged_rate_pct' => 62.3,
                'conversions' => 28,
                'cvr_pct' => 2.86,
                'revenue_cents' => 274400,
            ],
        ];

        $funnelSteps = [
            [
                'step_number' => 1,
                'name' => 'Visualização de Produto',
                'event_name' => 'view_item',
                'users_count' => 12650,
                'drop_off_pct' => 0.0,
                'step_conversion_pct' => 100.0,
            ],
            [
                'step_number' => 2,
                'name' => 'Adição ao Carrinho',
                'event_name' => 'add_to_cart',
                'users_count' => 2910,
                'drop_off_pct' => 77.0,
                'step_conversion_pct' => 23.0,
            ],
            [
                'step_number' => 3,
                'name' => 'Início do Checkout',
                'event_name' => 'begin_checkout',
                'users_count' => 1280,
                'drop_off_pct' => 56.0,
                'step_conversion_pct' => 44.0,
            ],
            [
                'step_number' => 4,
                'name' => 'Informações de Frete / Pagamento',
                'event_name' => 'add_payment_info',
                'users_count' => 720,
                'drop_off_pct' => 43.8,
                'step_conversion_pct' => 56.2,
            ],
            [
                'step_number' => 5,
                'name' => 'Compra Concluída',
                'event_name' => 'purchase',
                'users_count' => 400,
                'drop_off_pct' => 44.4,
                'step_conversion_pct' => 55.6,
            ],
        ];

        $funnelSummary = [
            'overall_cvr_pct' => 3.16,
            'biggest_leak' => 'Etapa 2: Visualização de Produto -> Adição ao Carrinho (77.0% de abandono)',
            'ai_diagnosis' => 'O maior vazamento de tráfego ocorre na transição de view_item para add_to_cart. A exibição transparente da régua de frete grátis (R$ 149 RJ / R$ 299 Sudeste) e o novo card simplificado de cálculo de atacado diminuem a hesitação no momento de colocar o produto no carrinho.',
        ];

        $eventsAudit = [
            ['event' => 'page_view', 'status' => 'valid', 'last_detected' => 'há 2 minutos', 'details' => 'Disparado na navegação SPA'],
            ['event' => 'view_item', 'status' => 'valid', 'last_detected' => 'há 5 minutos', 'details' => 'Enviando id, name, price e category'],
            ['event' => 'add_to_cart', 'status' => 'valid', 'last_detected' => 'há 8 minutos', 'details' => 'Valor em BRL e quantidade corretos'],
            ['event' => 'begin_checkout', 'status' => 'valid', 'last_detected' => 'há 12 minutos', 'details' => 'Contém array completo de itens'],
            ['event' => 'purchase', 'status' => 'valid', 'last_detected' => 'há 25 minutos', 'details' => 'transaction_id exclusivo e desduplicação CAPI ativa'],
        ];

        return [
            'integration' => $integration,
            'acquisition_channels' => $acquisitionChannels,
            'funnel_steps' => $funnelSteps,
            'funnel_summary' => $funnelSummary,
            'events_audit' => $eventsAudit,
        ];
    }
}
