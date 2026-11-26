<?php

declare(strict_types=1);

namespace App\Domain\Marketing\Services;

use App\Domain\AI\Services\AIProviderService;
use App\Models\MarketingCampaignDraft;
use App\Models\MarketingIntegration;
use Illuminate\Support\Facades\Http;

class GoogleAdsService
{
    public function __construct(
        private readonly AIProviderService $aiProvider,
        private readonly MarketingBaselineInitializer $initializer,
        private readonly GoogleOAuthTokenHelper $oauth,
        private readonly GoogleMerchantFeedService $merchantFeed,
        private readonly GoogleAnalyticsService $ga4Service,
    ) {}

    /**
     * Strictly READ-ONLY Google Ads campaign & search-term overview.
     * Never modifies budgets, publishes campaigns, or triggers spend.
     *
     * @param  array{range?: string, start_date?: string, end_date?: string}  $params
     * @return array<string, mixed>
     */
    public function getOverview(array $params = []): array
    {
        $this->initializer->ensureIntegrations();

        [$start, $end, $rangeLabel, $daysCount] = $this->ga4Service->resolvePeriod($params);
        $startStr = $start->toDateString();
        $endStr = $end->toDateString();

        $integration = MarketingIntegration::query()->where('platform', 'google_ads')->first();
        $creds = $this->merchantFeed->decryptCredentials($integration?->encrypted_credentials);

        $customerId = preg_replace('/\D+/', '', (string) ($integration?->account_id ?? '')) ?? '';
        $devToken = trim((string) ($creds['developer_token'] ?? config('services.google_ads.developer_token', '')));
        $clientId = trim((string) ($creds['client_id'] ?? config('services.google_ads.client_id', '')));
        $clientSecret = trim((string) ($creds['client_secret'] ?? config('services.google_ads.client_secret', '')));
        $refreshToken = trim((string) ($creds['refresh_token'] ?? config('services.google_ads.refresh_token', '')));
        $loginCustomerId = preg_replace('/\D+/', '', (string) ($integration?->settings['login_customer_id'] ?? '')) ?? '';

        $negativeKeywords = array_values(array_filter(
            (array) ($integration?->settings['negative_keywords'] ?? []),
            fn ($kw): bool => is_string($kw) && trim($kw) !== ''
        ));

        $drafts = MarketingCampaignDraft::query()->where('platform', 'google_ads')->latest('id')->get();

        $missing = [];
        if ($customerId === '') {
            $missing[] = 'Customer ID (ex.: 123-456-7890)';
        }
        if ($devToken === '') {
            $missing[] = 'Developer Token da Google Ads API';
        }
        if ($clientId === '' || $clientSecret === '' || $refreshToken === '') {
            $missing[] = 'Client ID, Client Secret e Refresh Token OAuth2';
        }

        if ($missing !== []) {
            return [
                'period' => [
                    'range' => $params['range'] ?? 'last_30_days',
                    'label' => $rangeLabel,
                    'start_date' => $startStr,
                    'end_date' => $endStr,
                    'days_count' => $daysCount,
                ],
                'integration' => $this->merchantFeed->sanitizeIntegrationForClient($integration),
                'connected' => false,
                'data_available' => false,
                'read_only_protection' => true,
                'missing_credentials' => $missing,
                'availability_notice' => 'Conta Google Ads pendente de configuração. Nenhuma campanha ou métrica fictícia é exibida. Conecte as credenciais de leitura para importar investimento, cliques, impressões, conversões e receita atribuída.',
                'limitations' => [
                    'Sem conexão ativa com a Google Ads API no momento.',
                    'Por segurança, o sistema opera exclusivamente em modo leitura nas contas conectadas — nenhum orçamento ou campanha é publicado ou alterado automaticamente.',
                ],
                'totals' => null,
                'campaigns' => [],
                'search_terms' => [],
                'suggestions' => [],
                'negative_keywords' => $negativeKeywords,
                'drafts' => $drafts,
            ];
        }

        try {
            $live = $this->fetchLiveCampaigns(
                $customerId,
                $devToken,
                $clientId,
                $clientSecret,
                $refreshToken,
                $loginCustomerId,
                $startStr,
                $endStr
            );

            $suggestions = $this->buildDataDrivenSuggestions($live['campaigns'], $rangeLabel);

            return [
                'period' => [
                    'range' => $params['range'] ?? 'last_30_days',
                    'label' => $rangeLabel,
                    'start_date' => $startStr,
                    'end_date' => $endStr,
                    'days_count' => $daysCount,
                ],
                'integration' => $this->merchantFeed->sanitizeIntegrationForClient($integration),
                'connected' => true,
                'data_available' => true,
                'read_only_protection' => true,
                'missing_credentials' => [],
                'availability_notice' => count($live['campaigns']) === 0
                    ? "Conta Google Ads conectada, porém nenhuma campanha teve atividade registrada entre {$startStr} e {$endStr}."
                    : null,
                'limitations' => [
                    "Período analisado: {$rangeLabel} ({$startStr} a {$endStr}).",
                    'Receita atribuída reflete a janela de atribuição configurada na conta Google Ads e pode diferir do caixa líquido da loja.',
                    'Modo seguro ativo: alterações de orçamento ou publicação de campanhas exigem ação manual autorizada no painel do Google Ads.',
                ],
                'totals' => $live['totals'],
                'campaigns' => $live['campaigns'],
                'search_terms' => $live['search_terms'],
                'suggestions' => $suggestions,
                'negative_keywords' => $negativeKeywords,
                'drafts' => $drafts,
            ];
        } catch (\Throwable $e) {
            return [
                'period' => [
                    'range' => $params['range'] ?? 'last_30_days',
                    'label' => $rangeLabel,
                    'start_date' => $startStr,
                    'end_date' => $endStr,
                    'days_count' => $daysCount,
                ],
                'integration' => $this->merchantFeed->sanitizeIntegrationForClient($integration),
                'connected' => false,
                'data_available' => false,
                'read_only_protection' => true,
                'error' => $e->getMessage(),
                'missing_credentials' => [],
                'availability_notice' => 'Não foi possível ler os dados da Google Ads API: '.$e->getMessage(),
                'limitations' => [
                    'Falha na comunicação com a Google Ads API. Verifique permissões do Developer Token e validade do Refresh Token OAuth2.',
                ],
                'totals' => null,
                'campaigns' => [],
                'search_terms' => [],
                'suggestions' => [],
                'negative_keywords' => $negativeKeywords,
                'drafts' => $drafts,
            ];
        }
    }

    /**
     * Records a suggested negative keyword in local integration notes (does NOT mutate live Ads without explicit request).
     *
     * @return array<string, mixed>
     */
    public function addNegativeKeyword(string $keyword): array
    {
        $this->initializer->ensureIntegrations();
        $clean = trim($keyword);
        $integration = MarketingIntegration::query()->where('platform', 'google_ads')->first();
        if ($integration && $clean !== '') {
            $settings = $integration->settings ?? [];
            $negatives = array_values(array_filter((array) ($settings['negative_keywords'] ?? []), 'is_string'));
            if (! in_array($clean, $negatives, true)) {
                $negatives[] = $clean;
            }
            $settings['negative_keywords'] = $negatives;
            $integration->update(['settings' => $settings]);
        }

        return [
            'message' => "Termo negativo \"{$clean}\" salvo na lista de revisão local (nenhuma alteração automática enviada ao Google Ads).",
        ];
    }

    /**
     * Creates a local-only campaign draft (never published to Google Ads).
     *
     * @param  array{topic?: string, target_audience?: string, daily_budget_brl?: float}  $params
     * @return array<string, mixed>
     */
    public function draftCampaignWithAi(array $params): array
    {
        $topic = trim((string) ($params['topic'] ?? 'Cosméticos e Esmaltaria'));
        $dailyBudget = (int) round(((float) ($params['daily_budget_brl'] ?? 40.0)) * 100);

        $systemPrompt = 'Você é um especialista em Google Ads para e-commerce brasileiro de beleza. Gere um RASCUNHO LOCAL de campanha de pesquisa com 5 títulos (até 30 caracteres), 4 descrições (até 90 caracteres), 8 palavras-chave e 5 palavras negativas. Não invente dados de desempenho. Responda em JSON.';
        $userPrompt = "Tema solicitado: {$topic}\nLoja: Mistura Feminina Cosméticos.";

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
            $campaignName = (string) ($data['campaign_name'] ?? "Rascunho Search — {$topic}");
            $headlines = (array) ($data['headlines'] ?? []);
            $descriptions = (array) ($data['descriptions'] ?? []);
            $keywords = (array) ($data['keywords'] ?? []);
            $negatives = (array) ($data['negative_keywords'] ?? []);
            $targetRoas = (float) ($data['target_roas'] ?? 3.5);
        } else {
            $campaignName = "Rascunho Local — {$topic}";
            $headlines = [
                mb_substr($topic, 0, 30),
                'Mistura Feminina Oficial',
                'Envio para Todo o Brasil',
                'Compre Online com Segurança',
                'Linha Profissional Unhas',
            ];
            $descriptions = [
                "Confira {$topic} na Mistura Feminina Cosméticos. Veja preços e estoque reais no site.",
                'Produtos selecionados para manicures, nail designers e cuidados diários.',
            ];
            $keywords = ["\"{$topic}\"", "[comprar {$topic}]"];
            $negatives = ['gratis', 'curso', 'como fazer', 'pdf'];
            $targetRoas = 3.5;
        }

        $draft = MarketingCampaignDraft::query()->create([
            'platform' => 'google_ads',
            'campaign_name' => $campaignName,
            'campaign_type' => 'search',
            'daily_budget_cents' => $dailyBudget,
            'target_roas' => $targetRoas,
            'targeting' => [
                'locations' => ['Brasil'],
                'languages' => ['Português'],
            ],
            'ad_groups' => [
                [
                    'name' => "Grupo — {$topic}",
                    'headlines' => $headlines,
                    'descriptions' => $descriptions,
                    'keywords' => $keywords,
                    'negative_keywords' => $negatives,
                ],
            ],
            'status' => 'draft',
            'approval_notes' => 'Rascunho salvo apenas localmente no painel. Nenhuma campanha ou orçamento foi enviado ao Google Ads.',
        ]);

        return [
            'data' => $draft,
            'message' => 'Rascunho local salvo com sucesso (nenhum gasto ou publicação no Google Ads).',
        ];
    }

    /**
     * @return array{totals: array<string, mixed>, campaigns: list<array<string, mixed>>, search_terms: list<array<string, mixed>>}
     */
    private function fetchLiveCampaigns(
        string $customerId,
        string $devToken,
        string $clientId,
        string $clientSecret,
        string $refreshToken,
        string $loginCustomerId,
        string $startDate,
        string $endDate
    ): array {
        $accessToken = $this->oauth->tokenFromRefreshToken($clientId, $clientSecret, $refreshToken);
        $headers = ['developer-token' => $devToken];
        if ($loginCustomerId !== '') {
            $headers['login-customer-id'] = $loginCustomerId;
        }

        $gaql = "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, "
            ."campaign_budget.amount_micros, metrics.impressions, metrics.clicks, metrics.cost_micros, "
            ."metrics.conversions, metrics.conversions_value "
            ."FROM campaign "
            ."WHERE segments.date BETWEEN '{$startDate}' AND '{$endDate}' "
            ."AND campaign.status != 'REMOVED' "
            ."ORDER BY metrics.cost_micros DESC LIMIT 50";

        $res = Http::withToken($accessToken)
            ->withHeaders($headers)
            ->timeout(20)
            ->acceptJson()
            ->post("https://googleads.googleapis.com/v17/customers/{$customerId}/googleAds:searchStream", [
                'query' => $gaql,
            ]);

        if (! $res->successful()) {
            $err = (string) ($res->json('0.error.message') ?? $res->json('error.message') ?? 'HTTP '.$res->status());
            throw new \RuntimeException($err);
        }

        $batches = (array) $res->json();
        $byCampaign = [];
        foreach ($batches as $batch) {
            foreach (($batch['results'] ?? []) as $row) {
                $cid = (string) ($row['campaign']['id'] ?? '');
                if ($cid === '') {
                    continue;
                }
                if (! isset($byCampaign[$cid])) {
                    $budgetMicros = (int) ($row['campaignBudget']['amountMicros'] ?? 0);
                    $byCampaign[$cid] = [
                        'id' => $cid,
                        'name' => (string) ($row['campaign']['name'] ?? "Campanha {$cid}"),
                        'status' => (string) ($row['campaign']['status'] ?? 'UNKNOWN'),
                        'type' => (string) ($row['campaign']['advertisingChannelType'] ?? 'UNKNOWN'),
                        'daily_budget_cents' => (int) round($budgetMicros / 10000),
                        'spend_cents' => 0,
                        'clicks' => 0,
                        'impressions' => 0,
                        'conversions' => 0.0,
                        'attributed_revenue_cents' => 0,
                    ];
                }
                $byCampaign[$cid]['impressions'] += (int) ($row['metrics']['impressions'] ?? 0);
                $byCampaign[$cid]['clicks'] += (int) ($row['metrics']['clicks'] ?? 0);
                $byCampaign[$cid]['spend_cents'] += (int) round(((int) ($row['metrics']['costMicros'] ?? 0)) / 10000);
                $byCampaign[$cid]['conversions'] += (float) ($row['metrics']['conversions'] ?? 0);
                $byCampaign[$cid]['attributed_revenue_cents'] += (int) round(((float) ($row['metrics']['conversionsValue'] ?? 0)) * 100);
            }
        }

        $campaigns = [];
        $totSpend = 0;
        $totClicks = 0;
        $totImpr = 0;
        $totConv = 0.0;
        $totRev = 0;

        foreach ($byCampaign as $c) {
            $spend = $c['spend_cents'];
            $clicks = $c['clicks'];
            $impr = $c['impressions'];
            $conv = round($c['conversions'], 2);
            $rev = $c['attributed_revenue_cents'];

            $totSpend += $spend;
            $totClicks += $clicks;
            $totImpr += $impr;
            $totConv += $conv;
            $totRev += $rev;

            $c['conversions'] = $conv;
            $c['cpc'] = $clicks > 0 ? round(($spend / 100) / $clicks, 2) : 0.0;
            $c['ctr'] = $impr > 0 ? round(($clicks / $impr) * 100, 2) : 0.0;
            $c['cost_per_conv'] = $conv > 0 ? round(($spend / 100) / $conv, 2) : null;
            $c['roas'] = $spend > 0 ? round($rev / $spend, 2) : 0.0;
            $campaigns[] = $c;
        }

        $totals = [
            'spend_cents' => $totSpend,
            'clicks' => $totClicks,
            'impressions' => $totImpr,
            'conversions' => round($totConv, 2),
            'attributed_revenue_cents' => $totRev,
            'cpc' => $totClicks > 0 ? round(($totSpend / 100) / $totClicks, 2) : 0.0,
            'ctr' => $totImpr > 0 ? round(($totClicks / $totImpr) * 100, 2) : 0.0,
            'roas' => $totSpend > 0 ? round($totRev / $totSpend, 2) : 0.0,
        ];

        return [
            'totals' => $totals,
            'campaigns' => $campaigns,
            'search_terms' => [],
        ];
    }

    /**
     * Produces concrete suggestions grounded strictly in real fetched campaigns.
     *
     * @param  list<array<string, mixed>>  $campaigns
     * @return list<array<string, mixed>>
     */
    private function buildDataDrivenSuggestions(array $campaigns, string $rangeLabel): array
    {
        $suggestions = [];
        foreach ($campaigns as $c) {
            if ($c['spend_cents'] >= 5000 && $c['conversions'] <= 0) {
                $spendBrl = number_format($c['spend_cents'] / 100, 2, ',', '.');
                $suggestions[] = [
                    'campaign_id' => $c['id'],
                    'campaign_name' => $c['name'],
                    'severity' => 'high',
                    'title' => "Campanha \"{$c['name']}\" investiu R$ {$spendBrl} sem conversões em {$rangeLabel}",
                    'suggestion' => 'Revisar termos de pesquisa, páginas de destino (estoque disponível) e rastreamento de conversão antes de manter o investimento.',
                ];
            } elseif ($c['impressions'] >= 500 && $c['ctr'] < 1.5) {
                $suggestions[] = [
                    'campaign_id' => $c['id'],
                    'campaign_name' => $c['name'],
                    'severity' => 'medium',
                    'title' => "CTR baixo ({$c['ctr']}%) na campanha \"{$c['name']}\"",
                    'suggestion' => 'Refinar títulos dos anúncios e negativar pesquisas informativas que geram impressões sem clique qualificado.',
                ];
            } elseif ($c['spend_cents'] > 0 && $c['roas'] >= 3.5 && $c['conversions'] >= 3) {
                $suggestions[] = [
                    'campaign_id' => $c['id'],
                    'campaign_name' => $c['name'],
                    'severity' => 'opportunity',
                    'title' => "Campanha \"{$c['name']}\" com ROAS de {$c['roas']}x em {$rangeLabel}",
                    'suggestion' => 'Verificar se os produtos anunciados possuem estoque confortável antes de avaliar aumento gradual de orçamento.',
                ];
            }
        }

        return $suggestions;
    }
}
