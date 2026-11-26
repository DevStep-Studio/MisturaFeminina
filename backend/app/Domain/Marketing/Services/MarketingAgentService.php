<?php

declare(strict_types=1);

namespace App\Domain\Marketing\Services;

use App\Domain\AI\Services\AIProviderService;
use App\Models\MarketingChatMessage;
use App\Models\MarketingRecommendation;
use App\Models\Product;
use App\Models\User;
use Illuminate\Support\Str;

class MarketingAgentService
{
    public function __construct(
        private readonly AIProviderService $aiProvider,
        private readonly MarketingIntelligenceService $intelligence,
        private readonly GoogleAnalyticsService $ga4Service,
        private readonly GoogleAdsService $googleAds,
        private readonly GoogleMerchantFeedService $merchantFeed,
    ) {}

    /** @return list<MarketingRecommendation> */
    public function getRecommendations(): array
    {
        // Remove any legacy fake demo recommendations if present
        MarketingRecommendation::query()
            ->whereIn('title', [
                'Otimização de Metadados: Top 5 Esmaltes em Gel',
                'Adicionar 4 Termos Informativos à Lista Negativa',
                'Atualizar Criativo de Remarketing no Instagram (Fadiga)',
            ])
            ->delete();

        $existing = MarketingRecommendation::query()->latest('id')->get();
        if ($existing->isNotEmpty()) {
            return $existing->all();
        }

        // Build strictly real recommendations based on actual catalog/feed diagnostics
        $diag = $this->merchantFeed->getAdminDiagnostics(false);
        $incompleteCount = (int) ($diag['feed']['incomplete_products_count'] ?? 0);

        if ($incompleteCount > 0) {
            MarketingRecommendation::query()->create([
                'channel' => 'store',
                'type' => 'metadata_fix',
                'title' => "Regularizar {$incompleteCount} produto(s) incompleto(s) para o Google Shopping",
                'description' => 'Foram identificados produtos ativos sem foto real em JPG/PNG/WebP ou sem preço válido, impedindo sua inclusão no feed do Merchant Center.',
                'evidence_payload' => [
                    'source' => 'Diagnóstico Real do Catálogo / Feed Merchant Center',
                    'incomplete_products_count' => $incompleteCount,
                    'ready_products_count' => (int) ($diag['feed']['ready_products_count'] ?? 0),
                ],
                'proposed_action' => [
                    'action_type' => 'review_shopping_incomplete_products',
                    'items_count' => $incompleteCount,
                ],
                'before_state' => ['incomplete_count' => $incompleteCount],
                'after_state' => ['target_incomplete_count' => 0],
                'status' => 'pending_review',
            ]);
        }

        $ga4 = $this->ga4Service->getInsights(['range' => 'last_30_days']);
        if (empty($ga4['kpis']['tag_configured_on_storefront'])) {
            MarketingRecommendation::query()->create([
                'channel' => 'store',
                'type' => 'metadata_fix',
                'title' => 'Configurar Measurement ID real do Google Analytics 4 (G-...)',
                'description' => 'A tag GA4 da vitrine ainda não possui um Measurement ID ativo configurado em Marketing e Google.',
                'evidence_payload' => [
                    'source' => 'Auditoria Real de Integrações',
                    'tag_configured' => false,
                ],
                'proposed_action' => [
                    'action_type' => 'configure_ga4_measurement_id',
                ],
                'before_state' => ['tag_configured' => false],
                'after_state' => ['tag_configured' => true],
                'status' => 'pending_review',
            ]);
        }

        return MarketingRecommendation::query()->latest('id')->get()->all();
    }

    public function applyRecommendation(int $id, ?User $actor = null): MarketingRecommendation
    {
        $rec = MarketingRecommendation::query()->findOrFail($id);

        if ($rec->channel === 'google_ads' && $rec->type === 'negative_keyword') {
            $keywords = (array) ($rec->proposed_action['keywords'] ?? []);
            foreach ($keywords as $kw) {
                $this->googleAds->addNegativeKeyword((string) $kw);
            }
        } elseif ($rec->channel === 'seo' && $rec->type === 'metadata_fix' && ! empty($rec->proposed_action['product_id'])) {
            $prod = Product::query()->find((int) $rec->proposed_action['product_id']);
            if ($prod && ! empty($rec->after_state['seo_title'])) {
                $prod->update([
                    'seo_title' => (string) $rec->after_state['seo_title'],
                    'seo_description' => (string) ($rec->after_state['seo_description'] ?? $prod->seo_description),
                ]);
            }
        }

        $rec->update([
            'status' => 'applied',
            'applied_at' => now(),
            'approved_by_user_id' => $actor?->id,
        ]);

        return $rec->fresh();
    }

    public function discardRecommendation(int $id): MarketingRecommendation
    {
        $rec = MarketingRecommendation::query()->findOrFail($id);
        $rec->update(['status' => 'discarded']);

        return $rec->fresh();
    }

    /**
     * Analyzes real data across Store Orders, GA4, Google Ads, and Google Shopping,
     * strictly separating verified Facts from Agent Suggestions and Data Limitations.
     *
     * @param  array{range?: string, start_date?: string, end_date?: string}  $periodParams
     * @return array<string, mixed>
     */
    public function chat(string $message, ?string $sessionId = null, ?User $user = null, array $periodParams = []): array
    {
        $sessionId = $sessionId ?: Str::uuid()->toString();
        $range = $periodParams['range'] ?? 'last_30_days';

        MarketingChatMessage::query()->create([
            'session_id' => $sessionId,
            'user_id' => $user?->id,
            'role' => 'user',
            'content' => $message,
        ]);

        $overview = $this->intelligence->getOverview(['range' => $range] + $periodParams);
        $ga4 = $this->ga4Service->getInsights(['range' => $range] + $periodParams);
        $ads = $this->googleAds->getOverview(['range' => $range] + $periodParams);
        $shopping = $this->merchantFeed->getAdminDiagnostics(false);
        $aiStatus = $this->aiProvider->connectionStatus();

        $analysis = $this->buildStructuredAnalysis($message, $overview, $ga4, $ads, $shopping, $aiStatus);

        $replyMarkdown = $analysis['markdown'];
        $usedLlm = false;
        $llmError = null;

        if ($aiStatus['has_api_key']) {
            $systemPrompt = "Você é o Agente de Marketing e Google da Mistura Feminina Cosméticos.\n"
                ."REGRAS INEGOCIÁVEIS:\n"
                ."1. Separe SEMPRE a resposta em três blocos exatos com títulos Markdown:\n"
                ."   ### Fatos Confirmados\n"
                ."   ### Limitações dos Dados Disponíveis\n"
                ."   ### Sugestões do Agente\n"
                ."2. Use EXCLUSIVAMENTE os fatos reais fornecidos no JSON abaixo. NUNCA invente visitas, cliques, campanhas, ROAS, GTINs ou produtos.\n"
                ."3. Quando uma integração (GA4 Data API, Google Ads ou Merchant Center API) estiver 'not_configured' ou sem dados, declare isso claramente sem estimar números.\n"
                ."4. Nunca sugira alterações automáticas de orçamento; toda ação paga exige revisão humana.";

            $contextJson = (string) json_encode([
                'period' => $overview['period'],
                'facts' => $analysis['facts'],
                'limitations' => $analysis['limitations'],
                'deterministic_suggestions' => $analysis['suggestions'],
                'shopping_summary' => $shopping['feed'],
                'incomplete_examples' => array_slice($shopping['incomplete_products'], 0, 8),
                'views_without_purchases' => array_slice($ga4['products_views_without_purchases'], 0, 8),
                'ads_campaigns' => array_slice($ads['campaigns'], 0, 8),
            ], JSON_UNESCAPED_UNICODE);

            $aiRes = $this->aiProvider->chatStructured(
                'marketing',
                $systemPrompt,
                "DADOS VERIFICADOS:\n{$contextJson}\n\nPERGUNTA DA EQUIPE:\n{$message}"
            );

            if ($aiRes['connected'] && ! empty($aiRes['raw_text']) && $aiRes['error'] === null) {
                $replyMarkdown = $aiRes['raw_text'];
                $usedLlm = true;
            } else {
                $llmError = $aiRes['error'];
            }
        }

        $contextPayload = [
            'period' => $overview['period'],
            'ai_used' => $usedLlm,
            'ai_provider_connected' => (bool) $aiStatus['has_api_key'],
            'ai_missing_requirement' => $aiStatus['has_api_key']
                ? ($llmError ? "Falha ao consultar modelo de IA ({$llmError}); exibindo diagnóstico determinístico real." : null)
                : 'Credencial OPENAI_API_KEY não configurada. Exibindo diagnóstico determinístico baseado nos dados reais do sistema.',
            'facts' => $analysis['facts'],
            'limitations' => $analysis['limitations'],
            'suggestions' => $analysis['suggestions'],
        ];

        MarketingChatMessage::query()->create([
            'session_id' => $sessionId,
            'user_id' => $user?->id,
            'role' => 'assistant',
            'content' => $replyMarkdown,
            'context_payload' => $contextPayload,
        ]);

        return [
            'session_id' => $sessionId,
            'role' => 'assistant',
            'content' => $replyMarkdown,
            'facts' => $analysis['facts'],
            'limitations' => $analysis['limitations'],
            'suggestions' => $analysis['suggestions'],
            'ai_status' => [
                'used_llm' => $usedLlm,
                'has_api_key' => (bool) $aiStatus['has_api_key'],
                'missing_requirement' => $contextPayload['ai_missing_requirement'],
            ],
            'period' => $overview['period'],
            'created_at' => now()->toIso8601String(),
        ];
    }

    /** @return list<MarketingChatMessage> */
    public function getChatHistory(?string $sessionId = null): array
    {
        $query = MarketingChatMessage::query()->latest('id')->limit(30);
        if ($sessionId) {
            $query->where('session_id', $sessionId);
        }

        return $query->get()->reverse()->values()->all();
    }

    /**
     * Builds deterministic, 100% honest answers separating Facts, Limitations, and Suggestions.
     *
     * @param  array<string, mixed>  $overview
     * @param  array<string, mixed>  $ga4
     * @param  array<string, mixed>  $ads
     * @param  array<string, mixed>  $shopping
     * @param  array<string, mixed>  $aiStatus
     * @return array{facts: list<array{source: string, text: string}>, limitations: list<string>, suggestions: list<string>, markdown: string}
     */
    private function buildStructuredAnalysis(
        string $message,
        array $overview,
        array $ga4,
        array $ads,
        array $shopping,
        array $aiStatus
    ): array {
        $q = mb_strtolower($message);
        $period = $overview['period'];
        $kpis = $overview['kpis'];
        $periodDesc = "{$period['label']} ({$period['start_date']} a {$period['end_date']})";

        $facts = [];
        $limitations = [];
        $suggestions = [];

        $askShopping = str_contains($q, 'shopping') || str_contains($q, 'merchant') || str_contains($q, 'incompleto') || str_contains($q, 'feed');
        $askViewsNoBuy = str_contains($q, 'visita') || str_contains($q, 'visualiz') || str_contains($q, 'não geram compra') || str_contains($q, 'nao geram compra') || str_contains($q, 'convers');
        $askAds = str_contains($q, 'campanha') || str_contains($q, 'ads') || str_contains($q, 'anúncio') || str_contains($q, 'anuncio') || str_contains($q, 'orçamento');
        $askEvolution = str_contains($q, 'evolu') || str_contains($q, 'venda') || str_contains($q, 'acesso') || str_contains($q, 'período') || str_contains($q, 'periodo');

        if (! $askShopping && ! $askViewsNoBuy && ! $askAds && ! $askEvolution) {
            $askShopping = true;
            $askViewsNoBuy = true;
            $askAds = true;
            $askEvolution = true;
        }

        // 1. Evolution of Sales & Visits
        if ($askEvolution) {
            $revBrl = number_format(((int) $kpis['store_revenue_cents']) / 100, 2, ',', '.');
            $prevRevBrl = number_format(((int) $kpis['previous_revenue_cents']) / 100, 2, ',', '.');
            $ticketBrl = number_format(((int) $kpis['ticket_medio_cents']) / 100, 2, ',', '.');

            $facts[] = [
                'source' => 'Pedidos da Loja',
                'text' => "Em {$periodDesc}, a loja registrou {$kpis['store_orders_count']} pedido(s) válido(s) totalizando R$ {$revBrl} (ticket médio de R$ {$ticketBrl}), frente a {$kpis['previous_orders_count']} pedido(s) e R$ {$prevRevBrl} no período anterior equivalente ({$period['previous_start_date']} a {$period['previous_end_date']}).",
            ];

            if ((int) $kpis['refunds_count'] > 0) {
                $refBrl = number_format(((int) $kpis['refunded_cents']) / 100, 2, ',', '.');
                $facts[] = [
                    'source' => 'Pedidos da Loja',
                    'text' => "Houve {$kpis['refunds_count']} reembolso(s) concluído(s) no período somando R$ {$refBrl}.",
                ];
            }

            if ($ga4['ga4_api_connected']) {
                $facts[] = [
                    'source' => 'Google Analytics 4',
                    'text' => "Acessos na propriedade GA4 conectada: {$ga4['kpis']['sessions']} sessão(ões), {$ga4['kpis']['products_viewed']} visualização(ões) de produto e {$ga4['kpis']['carts_started']} adição(ões) ao carrinho.",
                ];
            } elseif ($ga4['kpis']['sessions'] !== null) {
                $facts[] = [
                    'source' => 'Telemetria Consentida da Loja',
                    'text' => "Foram registradas {$ga4['kpis']['sessions']} sessão(ões) com consentimento na loja no período.",
                ];
                $limitations[] = 'A GA4 Data API externa ainda não está conectada; os acessos exibidos refletem apenas eventos locais após aceite de consentimento.';
            } else {
                $limitations[] = 'Dados históricos de acessos/visitas do Google Analytics 4 ainda não estão disponíveis porque a propriedade GA4 não foi conectada.';
                $suggestions[] = 'Conecte o Measurement ID (G-...) e o Service Account JSON na aba Analytics para acompanhar sessões, origem de tráfego e taxa de conversão por canal.';
            }
        }

        // 2. Products with visits and zero purchases
        if ($askViewsNoBuy) {
            $viewsNoBuy = (array) ($ga4['products_views_without_purchases'] ?? []);
            if ($viewsNoBuy !== []) {
                $topList = array_map(
                    fn (array $it): string => "{$it['name']} (SKU {$it['sku']}: {$it['views']} visita(s), 0 compras)",
                    array_slice($viewsNoBuy, 0, 6)
                );
                $srcLabel = $ga4['ga4_api_connected'] ? 'Google Analytics 4' : 'Eventos Consentidos da Loja';
                $facts[] = [
                    'source' => $srcLabel,
                    'text' => count($viewsNoBuy).' produto(s) receberam visualizações sem gerar compra no período: '.implode('; ', $topList).'.',
                ];
                $suggestions[] = 'Revise nos itens visitados sem compra se há saldo de estoque disponível, foto nítida, descrição completa e competitividade de frete/preço.';
            } else {
                if (! $ga4['ga4_api_connected']) {
                    $limitations[] = 'Ainda não há dados de visualizações por produto vindos do GA4 (integração pendente) nem volume de eventos view_item consentidos no período.';
                    $suggestions[] = 'Ative a conexão com o GA4 na seção Analytics para identificar automaticamente os SKUs com alto tráfego e baixa conversão.';
                } else {
                    $facts[] = [
                        'source' => 'Google Analytics 4',
                        'text' => "Nenhum produto com visitas e zero compras foi encontrado no intervalo {$periodDesc}.",
                    ];
                }
            }
        }

        // 3. Shopping / Merchant Center feed readiness
        if ($askShopping) {
            $feed = $shopping['feed'];
            $facts[] = [
                'source' => 'Google Shopping / Catálogo',
                'text' => "Dos {$feed['total_active_products']} produtos ativos no catálogo, {$feed['ready_products_count']} estão prontos e publicados no XML ({$feed['emitted_items_count']} item/variações, sendo {$feed['ready_in_stock_count']} em estoque e {$feed['ready_out_of_stock_count']} sem estoque) e {$feed['incomplete_products_count']} estão bloqueados por dados obrigatórios ausentes.",
            ];

            foreach (($feed['reason_breakdown'] ?? []) as $reason) {
                $facts[] = [
                    'source' => 'Diagnóstico do Feed',
                    'text' => "{$reason['label']}: {$reason['count']} produto(s).",
                ];
            }

            $incSample = array_slice((array) ($shopping['incomplete_products'] ?? []), 0, 5);
            if ($incSample !== []) {
                $names = array_map(function (array $p): string {
                    $reasons = implode(', ', array_column($p['blocking_issues'], 'reason'));

                    return "{$p['name']} ({$p['sku']} — {$reasons})";
                }, $incSample);
                $facts[] = [
                    'source' => 'Exemplos Pendentes no Catálogo',
                    'text' => implode(' | ', $names),
                ];
                $suggestions[] = 'Priorize o envio de fotos reais (JPG/PNG/WebP) e atualização de estoque nos produtos listados na aba Google Shopping para destravar sua entrada automática no feed XML.';
            }

            if (($shopping['merchant_center_api']['status'] ?? '') !== 'connected') {
                $limitations[] = 'A conta do Google Merchant Center ainda não está conectada via Content API — não há confirmação externa de aprovação pelo Google até que o Merchant ID e Service Account sejam vinculados.';
            }
        }

        // 4. Google Ads campaigns
        if ($askAds) {
            if ($ads['connected']) {
                $camps = (array) ($ads['campaigns'] ?? []);
                if ($camps === []) {
                    $facts[] = [
                        'source' => 'Google Ads',
                        'text' => "Conta Google Ads conectada, com 0 campanhas ativas/com gasto entre {$period['start_date']} e {$period['end_date']}.",
                    ];
                } else {
                    $totSpend = number_format(((int) ($ads['totals']['spend_cents'] ?? 0)) / 100, 2, ',', '.');
                    $totRev = number_format(((int) ($ads['totals']['attributed_revenue_cents'] ?? 0)) / 100, 2, ',', '.');
                    $facts[] = [
                        'source' => 'Google Ads',
                        'text' => count($camps)." campanha(s) analisada(s) em {$periodDesc}: investimento de R$ {$totSpend}, {$ads['totals']['clicks']} cliques, {$ads['totals']['conversions']} conversões e R$ {$totRev} em receita atribuída (ROAS {$ads['totals']['roas']}x).",
                    ];
                    foreach (($ads['suggestions'] ?? []) as $sug) {
                        $suggestions[] = "{$sug['title']}: {$sug['suggestion']}";
                    }
                }
            } else {
                $facts[] = [
                    'source' => 'Google Ads',
                    'text' => 'Integração com Google Ads encontra-se pendente de configuração (nenhuma campanha foi lida).',
                ];
                $limitations[] = 'Sem credenciais de leitura do Google Ads (Customer ID, Developer Token e OAuth2), não é possível auditar investimento, CPC ou termos de pesquisa das campanhas.';
                $suggestions[] = 'Antes de ativar campanhas de Shopping/Performance Max no Google Ads, regularize as fotos e o estoque dos produtos pendentes na aba Google Shopping e vincule a conta em modo leitura.';
            }
        }

        if (! $aiStatus['has_api_key']) {
            $limitations[] = 'Respostas generativas por IA desativadas no momento (falta configurar OPENAI_API_KEY); este relatório foi gerado de forma determinística diretamente sobre os dados reais do banco.';
        }

        $md = ["### Fatos Confirmados (*{$periodDesc}*)"];
        foreach ($facts as $f) {
            $md[] = "- **[{$f['source']}]** {$f['text']}";
        }

        if ($limitations !== []) {
            $md[] = "\n### Limitações dos Dados Disponíveis";
            foreach (array_values(array_unique($limitations)) as $lim) {
                $md[] = "- {$lim}";
            }
        }

        $md[] = "\n### Sugestões do Agente";
        if ($suggestions !== []) {
            foreach (array_values(array_unique($suggestions)) as $s) {
                $md[] = "- {$s}";
            }
        } else {
            $md[] = '- Mantenha o acompanhamento periódico do feed e das conversões; nenhuma anomalia crítica identificada nos dados conectados.';
        }

        return [
            'facts' => $facts,
            'limitations' => array_values(array_unique($limitations)),
            'suggestions' => array_values(array_unique($suggestions)),
            'markdown' => implode("\n", $md),
        ];
    }
}
