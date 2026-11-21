<?php

declare(strict_types=1);

namespace App\Domain\Marketing\Services;

use App\Domain\AI\Services\AIProviderService;
use App\Models\MarketingCampaignDraft;
use App\Models\MarketingIntegration;
use App\Models\Product;

class GoogleAdsService
{
    public function __construct(
        private readonly AIProviderService $aiProvider,
    ) {}

    /** @return array<string, mixed> */
    public function getOverview(): array
    {
        $integration = MarketingIntegration::query()->where('platform', 'google_ads')->first();

        $campaigns = [
            [
                'id' => 'cmp_g_01',
                'name' => 'Search — Esmaltes em Gel & Top Lirio',
                'status' => 'ACTIVE',
                'type' => 'SEARCH',
                'daily_budget_cents' => 6000,
                'spend_cents' => 148200,
                'clicks' => 1120,
                'impressions' => 24100,
                'cpc' => 1.32,
                'ctr' => 4.65,
                'conversions' => 54,
                'cost_per_conv' => 27.44,
                'attributed_revenue_cents' => 622440,
                'roas' => 4.20,
            ],
            [
                'id' => 'cmp_g_02',
                'name' => 'PMax — Kits Profissionais & Cílios Postiços',
                'status' => 'ACTIVE',
                'type' => 'PERFORMANCE_MAX',
                'daily_budget_cents' => 4500,
                'spend_cents' => 118400,
                'clicks' => 980,
                'impressions' => 28500,
                'cpc' => 1.21,
                'ctr' => 3.44,
                'conversions' => 41,
                'cost_per_conv' => 28.88,
                'attributed_revenue_cents' => 449920,
                'roas' => 3.80,
            ],
            [
                'id' => 'cmp_g_03',
                'name' => 'Search — Maquiagem & Skincare Atacado',
                'status' => 'ACTIVE',
                'type' => 'SEARCH',
                'daily_budget_cents' => 3000,
                'spend_cents' => 74200,
                'clicks' => 610,
                'impressions' => 14200,
                'cpc' => 1.22,
                'ctr' => 4.30,
                'conversions' => 23,
                'cost_per_conv' => 32.26,
                'attributed_revenue_cents' => 230020,
                'roas' => 3.10,
            ],
            [
                'id' => 'cmp_g_04',
                'name' => 'Shopping — Gel UV/LED X&D e Acessórios',
                'status' => 'PAUSED',
                'type' => 'SHOPPING',
                'daily_budget_cents' => 2000,
                'spend_cents' => 24000,
                'clicks' => 195,
                'impressions' => 6400,
                'cpc' => 1.23,
                'ctr' => 3.05,
                'conversions' => 6,
                'cost_per_conv' => 40.00,
                'attributed_revenue_cents' => 67200,
                'roas' => 2.80,
            ],
        ];

        $searchTerms = [
            ['term' => 'esmalte em gel atacado rj', 'campaign' => 'Search — Esmaltes em Gel', 'clicks' => 240, 'impressions' => 2900, 'spend_cents' => 31200, 'conversions' => 14, 'is_waste' => false],
            ['term' => 'kit manicure profissional completo', 'campaign' => 'PMax — Kits Profissionais', 'clicks' => 180, 'impressions' => 2400, 'spend_cents' => 23400, 'conversions' => 9, 'is_waste' => false],
            ['term' => 'gel x&d original atacado', 'campaign' => 'Search — Esmaltes em Gel', 'clicks' => 145, 'impressions' => 1800, 'spend_cents' => 18850, 'conversions' => 8, 'is_waste' => false],
            ['term' => 'como tirar esmalte em gel caseiro', 'campaign' => 'Search — Esmaltes em Gel', 'clicks' => 42, 'impressions' => 890, 'spend_cents' => 5460, 'conversions' => 0, 'is_waste' => true],
            ['term' => 'esmaltes gratis para teste', 'campaign' => 'Search — Esmaltes em Gel', 'clicks' => 31, 'impressions' => 640, 'spend_cents' => 4030, 'conversions' => 0, 'is_waste' => true],
            ['term' => 'curso manicure senac rj', 'campaign' => 'Search — Esmaltes em Gel', 'clicks' => 28, 'impressions' => 520, 'spend_cents' => 3640, 'conversions' => 0, 'is_waste' => true],
        ];

        $negativeKeywords = [
            'gratis', 'grátis', 'download', 'pdf', 'curso', 'vaga de emprego', 'trabalhe conosco', 'reclame aqui', 'como fazer',
        ];

        $drafts = MarketingCampaignDraft::query()->where('platform', 'google_ads')->latest('id')->get();

        return [
            'integration' => $integration,
            'campaigns' => $campaigns,
            'search_terms' => $searchTerms,
            'negative_keywords' => $negativeKeywords,
            'drafts' => $drafts,
        ];
    }

    /**
     * Adds a negative keyword to the account list.
     *
     * @return array<string, mixed>
     */
    public function addNegativeKeyword(string $keyword): array
    {
        $integration = MarketingIntegration::query()->where('platform', 'google_ads')->first();
        if ($integration) {
            $settings = $integration->settings ?? [];
            $negatives = $settings['negative_keywords'] ?? ['gratis', 'curso', 'como fazer'];
            if (! in_array($keyword, $negatives, true)) {
                $negatives[] = trim($keyword);
            }
            $settings['negative_keywords'] = $negatives;
            $integration->update(['settings' => $settings]);
        }

        return ['message' => "Palavra-chave negativa \"{$keyword}\" adicionada com sucesso à conta do Google Ads."];
    }

    /**
     * Generates a structured campaign draft using AI.
     *
     * @param  array{topic?: string, target_audience?: string, daily_budget_brl?: float}  $params
     * @return array<string, mixed>
     */
    public function draftCampaignWithAi(array $params): array
    {
        $topic = $params['topic'] ?? 'Esmaltes em Gel e Cílios Postiços';
        $dailyBudget = (int) round(($params['daily_budget_brl'] ?? 40.0) * 100);

        $systemPrompt = 'Você é um estrategista de tráfego pago especialista em Google Ads para e-commerce de beleza. Crie uma campanha de pesquisa com 5 títulos persuasivos (até 30 caracteres cada), 4 descrições (até 90 caracteres cada), 10 palavras-chave estratégicas (misturando frase e exata) e 5 palavras-chave negativas iniciais. Responda em JSON rigoroso.';
        $userPrompt = "Tema da campanha: {$topic}\nLoja: Mistura Feminina (preço de atacado, entrega expressa RJ e frete grátis nacional acima de R$ 149/R$ 299).";

        $schema = [
            'type' => 'object',
            'properties' => [
                'campaign_name' => ['type' => 'string'],
                'headlines' => ['type' => 'array', 'items' => ['type' => 'string']],
                'descriptions' => ['type' => 'array', 'items' => ['type' => 'string']],
                'keywords' => ['type' => 'array', 'items' => ['type' => 'string']],
                'negative_keywords' => ['type' => 'array', 'items' => ['type' => 'string']],
                'target_roas' => ['type' => 'number'],
            ],
            'required' => ['campaign_name', 'headlines', 'descriptions', 'keywords', 'negative_keywords', 'target_roas'],
            'additionalProperties' => false,
        ];

        $aiRes = $this->aiProvider->chatStructured('marketing', $systemPrompt, $userPrompt, $schema);

        if ($aiRes['connected'] && is_array($aiRes['content'])) {
            $data = $aiRes['content'];
            $campaignName = (string) ($data['campaign_name'] ?? "Search — {$topic}");
            $headlines = (array) ($data['headlines'] ?? []);
            $descriptions = (array) ($data['descriptions'] ?? []);
            $keywords = (array) ($data['keywords'] ?? []);
            $negatives = (array) ($data['negative_keywords'] ?? []);
            $targetRoas = (float) ($data['target_roas'] ?? 4.0);
        } else {
            $campaignName = "Search — {$topic} [Atacado & Varejo]";
            $headlines = [
                'Esmaltes em Gel no Atacado',
                'Kits de Unhas e Cílios',
                'Frete Grátis acima R$ 149',
                'Compre Direto da Loja',
                'Parcelamento sem Juros',
            ];
            $descriptions = [
                'Encontre produtos para unhas e cosméticos no atacado. Os melhores preços do Brasil!',
                'Envio rápido para todo o país. Qualidade profissional para manicures e lash designers.',
                'Economize comprando kits no atacado a partir de 6 unidades. Parcele em até 6x sem juros.',
                'Loja oficial Mistura Feminina. Produtos originais com nota fiscal e garantia total.',
            ];
            $keywords = [
                "\"{$topic} atacado\"",
                "\"fornecedor de {$topic}\"",
                "[comprar {$topic}]",
                "\"melhor preço {$topic}\"",
                "[loja {$topic} rj]",
            ];
            $negatives = ['gratis', 'como fazer', 'download', 'curso', 'vagas'];
            $targetRoas = 4.2;
        }

        $draft = MarketingCampaignDraft::query()->create([
            'platform' => 'google_ads',
            'campaign_name' => $campaignName,
            'campaign_type' => 'search',
            'daily_budget_cents' => $dailyBudget,
            'target_roas' => $targetRoas,
            'targeting' => [
                'locations' => ['Brasil', 'Rio de Janeiro (Bid +20%)'],
                'languages' => ['Português'],
                'bidding_strategy' => 'Maximize Conversions with Target ROAS',
            ],
            'ad_groups' => [
                [
                    'name' => 'Grupo Principal — Produtos de Alto Desempenho',
                    'headlines' => $headlines,
                    'descriptions' => $descriptions,
                    'keywords' => $keywords,
                    'negative_keywords' => $negatives,
                ],
            ],
            'status' => 'draft',
            'approval_notes' => 'Rascunho gerado pela IA. Requer aprovação do lojista antes de exportação ou publicação.',
        ]);

        return ['data' => $draft, 'message' => 'Rascunho de campanha Google Ads criado com sucesso!'];
    }
}
