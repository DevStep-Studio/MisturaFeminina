<?php

declare(strict_types=1);

namespace App\Domain\AI\Services;

use App\Models\AiExecution;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * Orchestrates single-product lookup by name:
 * 1) Checks local catalog first (distinguishing internal store SKU vs manufacturer code)
 * 2) Runs documented Google web + image search via GoogleProductSearchService
 * 3) Discriminates model, wattage, volume, and shade vs collection pages
 * 4) Generates grounded PT-BR commercial copy without inventing specs or competitor prices
 */
class ProductWebLookupService
{
    private const CACHE_TTL_SECONDS = 900;

    /** @var list<string> */
    private const GENERIC_FILLER_PHRASES = [
        'descubra a combinação perfeita de qualidade e inovação',
        'combinação perfeita de qualidade e inovação',
        'ideal para quem busca qualidade e praticidade',
    ];

    public function __construct(
        private readonly AIProviderService $provider,
        private readonly AIUsageTracker $tracker,
        private readonly AIToolRegistry $tools,
        private readonly GoogleProductSearchService $googleSearch,
        private readonly PromptInjectionGuard $guard,
    ) {}

    /**
     * Searches local catalog + Google web/images and builds an editable product draft.
     *
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function lookup(User $actor, array $input): array
    {
        $rawQuery = trim((string) ($input['query'] ?? ''));
        $brandInput = trim((string) ($input['brand'] ?? ''));
        $sourceUrl = trim((string) ($input['source_url'] ?? ''));
        $barcode = trim((string) ($input['barcode'] ?? ''));
        $manufacturerCode = trim((string) ($input['manufacturer_code'] ?? ''));
        $internalSku = trim((string) ($input['internal_sku'] ?? ''));
        $refresh = ! empty($input['refresh']);

        $guardQuery = $this->guard->inspect($rawQuery, 'lookup_query');
        $cleanQuery = trim($guardQuery['cleaned_text']);

        $agent = $this->tracker->resolveAgent('product_catalog');
        $execution = $this->tracker->startExecution(
            $agent,
            $actor,
            [
                'query' => $cleanQuery,
                'brand' => $brandInput !== '' ? $brandInput : null,
                'has_source_url' => $sourceUrl !== '',
                'has_barcode' => $barcode !== '',
                'manufacturer_code' => $manufacturerCode !== '' ? $manufacturerCode : null,
                'internal_sku_omitted_externally' => $internalSku !== '' && $manufacturerCode === '',
            ],
            'product_lookup',
            null,
            mb_substr($cleanQuery ?: ($barcode ?: $sourceUrl), 0, 140)
        );

        $attrs = $this->parseQueryAttributes($cleanQuery, $brandInput);
        $canViewCost = $actor->hasPermission('catalog.cost.view');

        // 1. Always consult fresh local catalog first to avoid duplicates
        $this->tools->callTool('search_existing_products', ['query' => $cleanQuery], $actor, $execution);
        $this->tools->callTool('get_product_categories', [], $actor, $execution);
        $this->tools->callTool('get_registered_brands', [], $actor, $execution);

        $localMatches = $this->findLocalCatalogMatches(
            $cleanQuery,
            $barcode,
            $internalSku,
            $manufacturerCode,
            $attrs,
            $canViewCost
        );

        $brands = Brand::query()->where('is_active', true)->orderBy('name')->get(['id', 'name', 'slug']);
        $categories = Category::query()->where('is_active', true)->orderBy('name')->get(['id', 'name', 'slug']);

        // Exact local identifier hit: highlight "Abrir produto existente" while optionally letting user review
        $exactLocal = collect($localMatches)->first(fn (array $m): bool => ! empty($m['is_exact_identifier']));
        if ($exactLocal !== null && $sourceUrl === '' && empty($input['force_web_search'])) {
            $out = [
                'state' => 'duplicate_found',
                'execution_id' => $execution->id,
                'search_status' => $this->googleSearch->connectionStatus(),
                'query' => $cleanQuery,
                'cached' => false,
                'credentials_missing' => false,
                'message' => 'Encontramos este item já cadastrado no catálogo oficial. Abra o produto existente para atualizar sem gerar duplicidade.',
                'local_matches' => $localMatches,
                'candidates' => [],
                'draft' => null,
                'image_status' => 'unavailable',
                'requires_image_review' => false,
                'image_warning' => null,
                'image_candidates' => [],
                'source' => null,
                'registered_brands' => $brands->values()->all(),
                'registered_categories' => $categories->values()->all(),
            ];

            $this->tracker->finishExecution($execution, 'completed', ['state' => 'duplicate_found', 'product_id' => $exactLocal['id']], [['tool' => 'search_existing_products']], [], $exactLocal['sku']);

            return $out;
        }

        // Build clean external query (NEVER leak internal store SKU unless explicitly flagged as manufacturer code)
        $externalQuery = $this->buildExternalSearchQuery($cleanQuery, $brandInput, $barcode, $manufacturerCode);
        $cacheKey = 'mf:ai:lookup:'.sha1(json_encode([
            $externalQuery,
            mb_strtolower($sourceUrl),
            mb_strtolower($brandInput),
        ]) ?: $externalQuery);

        $cachedExternal = ! $refresh ? Cache::get($cacheKey) : null;
        $wasCached = is_array($cachedExternal);

        if (! $wasCached) {
            $searchResult = null;
            if ($externalQuery !== '') {
                $searchResult = $this->googleSearch->searchWebAndImages($externalQuery);
                $this->tracker->logEvent($execution, 'tool_called', 'google_web_search', 'Pesquisa Google executada.', [
                    'driver' => $searchResult['driver'],
                    'ok' => $searchResult['ok'],
                    'web_count' => count($searchResult['web_results']),
                    'image_count' => count($searchResult['image_results']),
                ]);
            }

            $pageFacts = null;
            if ($sourceUrl !== '') {
                $pageFacts = $this->googleSearch->fetchPageStructuredFacts($sourceUrl);
            } elseif (is_array($searchResult) && $searchResult['ok'] && $searchResult['web_results'] !== []) {
                $topUrl = (string) $searchResult['web_results'][0]['url'];
                $pageFacts = $this->googleSearch->fetchPageStructuredFacts($topUrl);
            }

            // Fail cleanly when Google search is unavailable & no direct link succeeded
            if (($searchResult === null || ! $searchResult['ok']) && ($pageFacts === null || ! $pageFacts['ok'])) {
                $credMissing = (bool) ($searchResult['credentials_missing'] ?? false);
                $errMessage = $credMissing
                    ? 'Serviço de busca indisponível — credenciais do Google/Serper não configuradas. Preencha manualmente abaixo ou configure em Central de IA -> Configurações.'
                    : ((string) ($searchResult['error'] ?? $pageFacts['error'] ?? 'Serviço de busca externa indisponível no momento. Você pode preencher o produto manualmente abaixo.'));

                $manualDraft = $this->buildManualFallbackDraft($cleanQuery, $attrs, $brandInput, $barcode, $manufacturerCode, $brands, $categories);

                $this->tracker->finishExecution(
                    $execution,
                    'failed',
                    ['state' => 'search_unavailable', 'credentials_missing' => $credMissing],
                    [],
                    [],
                    null,
                    $credMissing ? 'missing_search_credentials' : 'search_unavailable',
                    $errMessage
                );

                return [
                    'state' => 'search_unavailable',
                    'execution_id' => $execution->id,
                    'search_status' => $this->googleSearch->connectionStatus(),
                    'query' => $cleanQuery,
                    'cached' => false,
                    'credentials_missing' => $credMissing,
                    'message' => $errMessage,
                    'local_matches' => $localMatches,
                    'candidates' => [],
                    'draft' => $manualDraft,
                    'image_status' => 'unavailable',
                    'requires_image_review' => true,
                    'image_warning' => 'Adicione uma foto manualmente ou tente buscar novamente após conectar o provedor.',
                    'image_candidates' => [],
                    'source' => null,
                    'registered_brands' => $brands->values()->all(),
                    'registered_categories' => $categories->values()->all(),
                ];
            }

            $cachedExternal = [
                'driver' => (string) ($searchResult['driver'] ?? 'direct_url'),
                'web_results' => is_array($searchResult) ? $searchResult['web_results'] : [],
                'image_results' => is_array($searchResult) ? $searchResult['image_results'] : [],
                'page_facts' => $pageFacts,
            ];

            if (($cachedExternal['web_results'] !== [] || ($pageFacts && $pageFacts['ok']))) {
                Cache::put($cacheKey, $cachedExternal, self::CACHE_TTL_SECONDS);
            }
        }

        $analyzed = $this->analyzeSearchResults(
            $cleanQuery,
            $attrs,
            $brandInput,
            $barcode,
            $manufacturerCode,
            $cachedExternal['web_results'] ?? [],
            $cachedExternal['image_results'] ?? [],
            is_array($cachedExternal['page_facts'] ?? null) ? $cachedExternal['page_facts'] : null,
            $brands,
            $categories,
            $execution
        );

        $analyzed['execution_id'] = $execution->id;
        $analyzed['search_status'] = $this->googleSearch->connectionStatus();
        $analyzed['query'] = $cleanQuery;
        $analyzed['cached'] = $wasCached;
        $analyzed['credentials_missing'] = false;
        $analyzed['local_matches'] = $localMatches;
        $analyzed['registered_brands'] = $brands->values()->all();
        $analyzed['registered_categories'] = $categories->values()->all();

        $this->tracker->finishExecution(
            $execution,
            'completed',
            [
                'state' => $analyzed['state'],
                'candidates_count' => count($analyzed['candidates']),
                'image_status' => $analyzed['image_status'],
            ],
            [['tool' => 'google_web_search'], ['tool' => 'google_image_search']],
            [],
            $analyzed['draft']['name'] ?? $cleanQuery
        );

        return $analyzed;
    }

    /**
     * Checks catalog right before saving for duplicate SKU, GTIN/barcode, or same name+model.
     *
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function checkDuplicates(array $input): array
    {
        $sku = strtoupper(trim((string) ($input['sku'] ?? '')));
        $gtin = trim((string) ($input['gtin'] ?? ''));
        $name = trim((string) ($input['name'] ?? ''));

        $matches = [];
        $exactBlockers = [];

        if ($sku !== '') {
            $skuProd = Product::withTrashed()->whereRaw('UPPER(sku) = ?', [$sku])->first(['id', 'name', 'sku', 'gtin', 'price_cents', 'deleted_at']);
            $skuVar = ProductVariant::query()->with('product:id,name,sku,gtin,price_cents,deleted_at')->whereRaw('UPPER(sku) = ?', [$sku])->first();
            $foundProd = $skuProd ?? $skuVar?->product;
            if ($foundProd) {
                $exactBlockers[] = [
                    'id' => $foundProd->id,
                    'name' => $foundProd->name,
                    'sku' => $foundProd->sku,
                    'gtin' => $foundProd->gtin,
                    'price_cents' => $foundProd->price_cents,
                    'reason' => "SKU {$sku} já está cadastrado neste produto.",
                ];
            }
        }

        if ($gtin !== '') {
            $gtinProd = Product::withTrashed()->where('gtin', $gtin)->first(['id', 'name', 'sku', 'gtin', 'price_cents']);
            $gtinVar = ProductVariant::query()->with('product:id,name,sku,gtin,price_cents')->where('gtin', $gtin)->first();
            $foundProd = $gtinProd ?? $gtinVar?->product;
            if ($foundProd) {
                $exactBlockers[] = [
                    'id' => $foundProd->id,
                    'name' => $foundProd->name,
                    'sku' => $foundProd->sku,
                    'gtin' => $foundProd->gtin,
                    'price_cents' => $foundProd->price_cents,
                    'reason' => "Código de barras {$gtin} já pertence a este produto.",
                ];
            }
        }

        if ($name !== '') {
            $attrs = $this->parseQueryAttributes($name, '');
            $matches = $this->findLocalCatalogMatches($name, '', '', '', $attrs, false);
        }

        // Deduplicate blockers by product id
        $uniqueBlockers = [];
        foreach ($exactBlockers as $b) {
            $uniqueBlockers[$b['id']] = $b;
        }

        return [
            'has_exact_conflict' => $uniqueBlockers !== [],
            'exact_conflicts' => array_values($uniqueBlockers),
            'similar_products' => $matches,
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $webResults
     * @param  list<array<string, mixed>>  $imageResults
     * @param  array<string, mixed>|null  $pageFacts
     * @param  Collection<int, Brand>  $brands
     * @param  Collection<int, Category>  $categories
     * @return array<string, mixed>
     */
    private function analyzeSearchResults(
        string $cleanQuery,
        array $attrs,
        string $brandInput,
        string $barcode,
        string $manufacturerCode,
        array $webResults,
        array $imageResults,
        ?array $pageFacts,
        Collection $brands,
        Collection $categories,
        AiExecution $execution,
    ): array {
        // Synthetic web candidate if user supplied direct source_url only
        if ($webResults === [] && is_array($pageFacts) && ! empty($pageFacts['ok'])) {
            $webResults[] = [
                'title' => (string) ($pageFacts['title'] ?? $cleanQuery),
                'url' => (string) $pageFacts['final_url'],
                'snippet' => (string) ($pageFacts['description'] ?? ''),
                'domain' => (string) preg_replace('/^www\./i', '', strtolower((string) (parse_url((string) $pageFacts['final_url'], PHP_URL_HOST) ?? ''))),
                'position' => 1,
            ];
        }

        if ($webResults === [] && $imageResults === []) {
            return [
                'state' => 'not_found',
                'message' => 'Nenhum produto encontrado nas referências externas para o termo informado. Você pode continuar o cadastro manualmente abaixo.',
                'candidates' => [],
                'draft' => $this->buildManualFallbackDraft($cleanQuery, $attrs, $brandInput, $barcode, $manufacturerCode, $brands, $categories),
                'image_status' => 'unavailable',
                'requires_image_review' => true,
                'image_warning' => 'Nenhuma foto encontrada. Envie uma imagem do produto se desejar.',
                'image_candidates' => [],
                'source' => null,
            ];
        }

        // Score & build structured candidates aligned to query specs (model, wattage, volume, brand)
        $scoredCandidates = [];
        foreach (array_slice($webResults, 0, 6) as $idx => $web) {
            $candAttrs = $this->parseQueryAttributes(
                trim($web['title'].' '.$web['snippet']),
                $idx === 0 && is_array($pageFacts) ? (string) ($pageFacts['brand'] ?? '') : ''
            );

            $compatibility = $this->evaluateAttributeCompatibility($attrs, $candAttrs, $brandInput, $web);
            if ($compatibility['hard_mismatch']) {
                continue;
            }

            $matchedBrand = $this->matchBrand($brandInput !== '' ? $brandInput : ($candAttrs['inferred_brand'] ?? $web['title']), $brands);
            $suggestedBrandName = $matchedBrand === null
                ? ($brandInput !== '' ? $brandInput : ($candAttrs['inferred_brand'] ?? null))
                : null;

            $matchedCategory = $this->matchCategory($web['title'].' '.$web['snippet'], $categories);

            // Find best aligned image candidates for this web candidate
            $candDomain = (string) ($web['domain'] ?? '');
            $candImages = $this->rankImageCandidatesForProduct(
                $cleanQuery,
                $attrs,
                $imageResults,
                $idx === 0 && is_array($pageFacts) ? ($pageFacts['images'] ?? []) : [],
                $candDomain,
                (string) ($web['url'] ?? ''),
                trim((string) ($web['title'] ?? '').' '.(string) ($pageFacts['title'] ?? ''))
            );

            $scoredCandidates[] = [
                'id' => 'cand_'.$idx,
                'score' => $compatibility['score'],
                'title' => (string) $web['title'],
                'snippet' => (string) $web['snippet'],
                'source_url' => (string) $web['url'],
                'source_domain' => $candDomain,
                'brand_id' => $matchedBrand?->id,
                'brand_name' => $matchedBrand !== null ? $matchedBrand->name : $suggestedBrandName,
                'is_registered_brand' => $matchedBrand !== null,
                'suggested_new_brand_name' => $suggestedBrandName,
                'category_id' => $matchedCategory?->id,
                'category_name' => $matchedCategory?->name,
                'power_watts' => $candAttrs['power_watts'] ?? $attrs['power_watts'],
                'volume_label' => $candAttrs['volume_label'] ?? $attrs['volume_label'],
                'diff_badge' => $this->buildDiffBadge($matchedBrand !== null ? $matchedBrand->name : $suggestedBrandName, $candAttrs, $candDomain),
                'image_candidates' => $candImages['images'],
                'image_status' => $candImages['status'],
                'requires_image_review' => $candImages['requires_review'],
                'image_warning' => $candImages['warning'],
                'page_facts' => $idx === 0 ? $pageFacts : null,
            ];
        }

        // If every web candidate conflicted sharply (e.g. searching Sun 5 48W but top hits were only Sun 8 268W)
        if ($scoredCandidates === []) {
            return [
                'state' => 'not_found',
                'message' => 'Os resultados externos encontrados divergem das especificações informadas (ex.: modelo, potência ou volume distintos). Confira os dados abaixo e complete manualmente se preferir.',
                'candidates' => [],
                'draft' => $this->buildManualFallbackDraft($cleanQuery, $attrs, $brandInput, $barcode, $manufacturerCode, $brands, $categories),
                'image_status' => 'unavailable',
                'requires_image_review' => true,
                'image_warning' => 'Nenhuma foto compatível confirmada para este modelo específico.',
                'image_candidates' => [],
                'source' => null,
            ];
        }

        usort($scoredCandidates, fn (array $a, array $b): int => $b['score'] <=> $a['score']);

        // Detect generic ambiguity ("top coat 15 ml") or competing equally-ranked brands/wattages
        $needsUserChoice = $this->shouldShowMultipleCandidates($attrs, $brandInput, $scoredCandidates);

        $builtChoices = array_map(
            fn (array $c): array => $this->materializeCandidatePayload(
                $c,
                $cleanQuery,
                $attrs,
                $barcode,
                $manufacturerCode,
                $brands,
                $categories,
                $execution
            ),
            array_slice($scoredCandidates, 0, 5)
        );

        if ($needsUserChoice && count($builtChoices) > 1) {
            return [
                'state' => 'multiple_candidates',
                'message' => 'Mais de um produto ou marca possível foi encontrado para este termo. Selecione com 1 clique qual deseja preencher na ficha.',
                'candidates' => $builtChoices,
                'draft' => null,
                'image_status' => 'multiple',
                'requires_image_review' => true,
                'image_warning' => null,
                'image_candidates' => [],
                'source' => null,
            ];
        }

        $primary = $builtChoices[0];

        return [
            'state' => 'draft_ready',
            'message' => $primary['requires_image_review']
                ? ($primary['image_warning'] ?? 'Texto preenchido com base na fonte encontrada. Confira ou troque a foto antes de salvar.')
                : 'Ficha preenchida com dados reais da pesquisa. Confira os campos, informe preço, custo e estoque e salve no catálogo.',
            'candidates' => $builtChoices,
            'draft' => $primary['draft'],
            'image_status' => $primary['image_status'],
            'requires_image_review' => $primary['requires_image_review'],
            'image_warning' => $primary['image_warning'],
            'image_candidates' => $primary['image_candidates'],
            'source' => $primary['source'],
        ];
    }

    /**
     * @param  array<string, mixed>  $candidate
     * @param  array<string, mixed>  $attrs
     * @param  Collection<int, Brand>  $brands
     * @param  Collection<int, Category>  $categories
     * @return array<string, mixed>
     */
    private function materializeCandidatePayload(
        array $candidate,
        string $cleanQuery,
        array $attrs,
        string $barcode,
        string $manufacturerCode,
        Collection $brands,
        Collection $categories,
        AiExecution $execution,
    ): array {
        $facts = is_array($candidate['page_facts'] ?? null) ? $candidate['page_facts'] : null;
        $copy = $this->buildGroundedCopy(
            $cleanQuery,
            $candidate,
            $facts,
            $attrs,
            $execution
        );

        $firstImage = $candidate['image_candidates'][0] ?? null;
        $primaryImageUrl = is_array($firstImage) ? (string) ($firstImage['image_url'] ?? '') : '';

        $resolvedSku = $manufacturerCode !== ''
            ? strtoupper($manufacturerCode)
            : $this->suggestInternalSku($copy['name'], $candidate['brand_name'] ?? '');

        // Never prefill price_cents, cost_cents or stock_qty from external competitor prices!
        $draft = [
            'name' => $copy['name'],
            'sku' => $resolvedSku,
            'gtin' => $barcode !== '' ? $barcode : ($facts['gtin'] ?? ''),
            'supplier_code' => $manufacturerCode !== '' ? $manufacturerCode : ($facts['mpn'] ?? ''),
            'power_watts' => $candidate['power_watts'],
            'brand_id' => $candidate['brand_id'],
            'suggested_new_brand_name' => $candidate['suggested_new_brand_name'],
            'category_ids' => $candidate['category_id'] ? [$candidate['category_id']] : [],
            'suggested_new_category_name' => $candidate['category_id'] ? null : ($copy['suggested_category'] ?? null),
            'short_description' => $copy['short_description'],
            'description' => $copy['description'],
            'seo_title' => mb_substr($copy['name'].' | Mistura Feminina Cosméticos', 0, 180),
            'seo_description' => mb_substr($copy['short_description'], 0, 160),
            'image_url' => $primaryImageUrl !== '' ? $primaryImageUrl : null,
            'image_path' => '',
            'price_cents' => null,
            'cost_cents' => null,
            'stock_qty' => null,
        ];

        return [
            'id' => $candidate['id'],
            'title' => $candidate['title'],
            'diff_badge' => $candidate['diff_badge'],
            'source_domain' => $candidate['source_domain'],
            'thumbnail_url' => is_array($firstImage) ? ($firstImage['thumb_url'] ?: $primaryImageUrl) : null,
            'image_status' => $candidate['image_status'],
            'requires_image_review' => $candidate['requires_image_review'],
            'image_warning' => $candidate['image_warning'],
            'image_candidates' => $candidate['image_candidates'],
            'source' => [
                'title' => (string) ($facts['title'] ?? $candidate['title']),
                'url' => $candidate['source_url'],
                'domain' => $candidate['source_domain'],
                'snippet' => $candidate['snippet'],
            ],
            'draft' => $draft,
        ];
    }

    /**
     * Generates factual Portuguese catalog title + descriptions strictly from verified search evidence.
     *
     * @param  array<string, mixed>  $candidate
     * @param  array<string, mixed>|null  $pageFacts
     * @param  array<string, mixed>  $attrs
     * @return array{name: string, short_description: string, description: string, suggested_category: ?string}
     */
    private function buildGroundedCopy(
        string $cleanQuery,
        array $candidate,
        ?array $pageFacts,
        array $attrs,
        AiExecution $execution,
    ): array {
        $verifiedFacts = [
            'operator_query' => $cleanQuery,
            'source_title' => (string) ($pageFacts['title'] ?? $candidate['title']),
            'source_snippet' => (string) ($pageFacts['description'] ?? $candidate['snippet']),
            'brand_from_source' => $candidate['brand_name'],
            'verified_power_watts' => $candidate['power_watts'],
            'verified_volume' => $candidate['volume_label'],
            'is_collection_page' => (bool) ($candidate['image_status'] === 'uncertain_collection'),
            'additional_facts' => array_slice((array) ($pageFacts['raw_facts'] ?? []), 0, 4),
        ];

        if ($this->provider->connectionStatus()['has_api_key']) {
            $resp = $this->provider->chatStructured(
                'catalog',
                'Você é o redator técnico de catálogo da Mistura Feminina Cosméticos (nail design e beleza profissional). '
                .'Reorganize os fatos em português do Brasil claro, direto e útil para quem escolhe o produto. '
                .'REGRAS INVIOLÁVEIS: '
                .'1) Use SOMENTE fatos explícitos nos dados enviados. Nunca deduza potência elétrica, peso, voltagem, composição química ou registro Anvisa sem fonte explícita. '
                .'2) NUNCA use frases genéricas vazias como "Descubra a combinação perfeita de qualidade e inovação". '
                .'3) NUNCA mencione preços de concorrentes ou valores em R$. '
                .'4) Responda com nome comercial limpo (sem excesso de SEO/spam), descrição curta (1 frase objetiva, até 180 caracteres) e descrição estruturada.',
                json_encode($verifiedFacts, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                [
                    'type' => 'object',
                    'additionalProperties' => false,
                    'required' => ['commercial_name', 'short_description', 'description', 'suggested_category'],
                    'properties' => [
                        'commercial_name' => ['type' => 'string'],
                        'short_description' => ['type' => 'string'],
                        'description' => ['type' => 'string'],
                        'suggested_category' => ['type' => ['string', 'null']],
                    ],
                ]
            );

            $this->tracker->logEvent($execution, 'tool_called', 'llm_copy_grounding', 'Redação assistida aplicada.', [
                'connected' => $resp['connected'],
                'model' => $resp['model'],
                'tokens' => $resp['total_tokens'],
            ]);

            if (is_array($resp['content']) && ! empty($resp['content']['commercial_name'])) {
                $name = $this->stripBoilerplate((string) $resp['content']['commercial_name']);
                $short = $this->stripBoilerplate((string) $resp['content']['short_description']);
                $desc = $this->stripBoilerplate((string) $resp['content']['description']);

                if ($name !== '' && $desc !== '') {
                    return [
                        'name' => mb_substr($name, 0, 190),
                        'short_description' => mb_substr($short, 0, 450),
                        'description' => $desc,
                        'suggested_category' => ! empty($resp['content']['suggested_category'])
                            ? (string) $resp['content']['suggested_category']
                            : null,
                    ];
                }
            }
        }

        // Deterministic grounded rewrite when OpenAI key is omitted or fails
        return $this->buildDeterministicGroundedCopy($cleanQuery, $candidate, $pageFacts, $attrs);
    }

    /**
     * @param  array<string, mixed>  $candidate
     * @param  array<string, mixed>|null  $pageFacts
     * @param  array<string, mixed>  $attrs
     * @return array{name: string, short_description: string, description: string, suggested_category: ?string}
     */
    private function buildDeterministicGroundedCopy(
        string $cleanQuery,
        array $candidate,
        ?array $pageFacts,
        array $attrs,
    ): array {
        $rawSourceTitle = (string) ($pageFacts['title'] ?? $candidate['title']);
        $cleanTitle = $this->cleanSourceTitle($rawSourceTitle, $cleanQuery);
        $brand = (string) ($candidate['brand_name'] ?? '');
        if ($brand !== '' && ! str_contains(mb_strtolower($cleanTitle), mb_strtolower($brand))) {
            $cleanTitle = "{$cleanTitle} — {$brand}";
        }

        $factsText = trim((string) ($pageFacts['description'] ?? $candidate['snippet'] ?? ''));
        $factsText = $this->stripPricesAndBoilerplate($factsText);

        $highlights = [];
        if (! empty($candidate['power_watts'])) {
            $highlights[] = "Potência informada: {$candidate['power_watts']}W";
        }
        if (! empty($candidate['volume_label'])) {
            $highlights[] = "Conteúdo/Apresentação: {$candidate['volume_label']}";
        }
        if (! empty($attrs['is_bivolt']) && preg_match('/bivolt/i', $cleanQuery.' '.$factsText.' '.$rawSourceTitle) === 1) {
            $highlights[] = 'Alimentação: Bivolt';
        }
        if (! empty($attrs['has_timer']) && preg_match('/temporizador|timer/i', $cleanQuery.' '.$factsText.' '.$rawSourceTitle) === 1) {
            $highlights[] = 'Recurso: Temporizador integrado';
        }

        $shortBase = $factsText !== ''
            ? mb_substr(rtrim($factsText, ". \t\n\r"), 0, 175)
            : $cleanTitle.($highlights !== [] ? ' · '.implode(' · ', $highlights) : '');

        $paragraphs = [];
        if ($factsText !== '') {
            $paragraphs[] = $factsText;
        }
        if ($highlights !== []) {
            $paragraphs[] = "Especificações confirmadas na referência:\n- ".implode("\n- ", $highlights);
        }
        if ($paragraphs === []) {
            $paragraphs[] = $cleanTitle.'. Complete as especificações técnicas caso necessário antes de publicar.';
        }

        return [
            'name' => mb_substr($cleanTitle !== '' ? $cleanTitle : $cleanQuery, 0, 190),
            'short_description' => mb_substr($shortBase, 0, 450),
            'description' => implode("\n\n", $paragraphs),
            'suggested_category' => null,
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $searchImages
     * @param  list<array<string, string>>  $pageImages
     * @return array{images: list<array<string, mixed>>, status: string, requires_review: bool, warning: ?string}
     */
    private function rankImageCandidatesForProduct(
        string $query,
        array $attrs,
        array $searchImages,
        array $pageImages,
        string $preferredDomain,
        string $sourcePageUrl,
        string $pageContextTitle = '',
    ): array {
        $pool = [];
        $seenUrls = [];
        $pageIsCollection = preg_match('/\b(cole[cç][aã]o|todas\s+as\s+cores|cartela|paleta|kit\s+\d+|mostru[aá]rio|sortid)/iu', $pageContextTitle) === 1;

        foreach ($pageImages as $pi) {
            $u = trim((string) ($pi['url'] ?? ''));
            if ($u === '' || isset($seenUrls[$u])) {
                continue;
            }
            $seenUrls[$u] = true;
            $pool[] = [
                'image_url' => $u,
                'thumb_url' => $u,
                'source_page_url' => $sourcePageUrl,
                'domain' => $preferredDomain,
                'title' => trim((string) ($pi['alt'] ?? '')),
                'width' => null,
                'height' => null,
                'from_selected_page' => true,
            ];
        }

        foreach ($searchImages as $si) {
            $u = trim((string) ($si['image_url'] ?? ''));
            if ($u === '' || isset($seenUrls[$u])) {
                continue;
            }
            $seenUrls[$u] = true;
            $pool[] = [
                'image_url' => $u,
                'thumb_url' => (string) ($si['thumb_url'] ?: $u),
                'source_page_url' => (string) ($si['source_page_url'] ?? ''),
                'domain' => (string) ($si['domain'] ?? ''),
                'title' => trim((string) ($si['title'] ?? '')),
                'width' => $si['width'] ?? null,
                'height' => $si['height'] ?? null,
                'from_selected_page' => $preferredDomain !== '' && ($si['domain'] ?? '') === $preferredDomain,
            ];
        }

        if ($pool === []) {
            return [
                'images' => [],
                'status' => 'unavailable',
                'requires_review' => true,
                'warning' => 'Nenhuma foto disponível para este item nas fontes encontradas. Envie sua própria foto ou tente buscar com marca.',
            ];
        }

        $requestedShade = (string) ($attrs['shade_hint'] ?? '');
        $scored = [];

        foreach ($pool as $img) {
            $score = $img['from_selected_page'] ? 40 : 10;
            $titleLower = mb_strtolower($img['title']);

            // Reject glaring model/wattage conflict inside image alt/title
            $imgAttrs = $this->parseQueryAttributes($img['title'], '');
            if ($attrs['power_watts'] !== null && $imgAttrs['power_watts'] !== null && $attrs['power_watts'] !== $imgAttrs['power_watts']) {
                continue;
            }
            if ($attrs['model_code'] !== null && $imgAttrs['model_code'] !== null && $attrs['model_code'] !== $imgAttrs['model_code']) {
                continue;
            }

            $titleIsCollection = preg_match('/\b(cole[cç][aã]o|todas\s+as\s+cores|cartela|paleta|kit\s+\d+|mostru[aá]rio|sortid)/iu', $titleLower) === 1;
            $shadeConfirmedByMeta = $requestedShade !== '' && str_contains($titleLower, mb_strtolower($requestedShade));
            $isCollectionContext = $titleIsCollection || ($pageIsCollection && ! $shadeConfirmedByMeta);

            if ($shadeConfirmedByMeta && ! $isCollectionContext) {
                $score += 35;
            }
            if ($isCollectionContext) {
                $score -= 20;
            }
            if (! empty($img['width']) && (int) $img['width'] >= 400) {
                $score += 15;
            }

            $img['is_collection_context'] = $isCollectionContext;
            $img['shade_verified'] = $requestedShade === '' || ($shadeConfirmedByMeta && ! $isCollectionContext);
            $img['_score'] = $score;
            $scored[] = $img;
        }

        if ($scored === []) {
            return [
                'images' => [],
                'status' => 'unavailable',
                'requires_review' => true,
                'warning' => 'As imagens retornadas pertencem a outra potência/modelo. Envie ou escolha manualmente uma foto compatível.',
            ];
        }

        usort($scored, fn (array $a, array $b): int => $b['_score'] <=> $a['_score']);
        $top = $scored[0];

        $uncertainCollection = $requestedShade !== '' && (! $top['shade_verified'] || $top['is_collection_context']);

        $cleanImages = array_map(function (array $item): array {
            unset($item['_score'], $item['from_selected_page']);

            return $item;
        }, array_slice($scored, 0, 6));

        return [
            'images' => $cleanImages,
            'status' => $uncertainCollection ? 'uncertain_collection' : 'candidate_ready',
            'requires_review' => $uncertainCollection,
            'warning' => $uncertainCollection
                ? "A página encontrada apresenta uma coleção ou não comprova na legenda a tonalidade \"{$requestedShade}\". Confira a imagem ou selecione outra foto antes de salvar."
                : null,
        ];
    }

    /**
     * @param  array<string, mixed>  $requested
     * @param  array<string, mixed>  $found
     * @param  array<string, mixed>  $web
     * @return array{hard_mismatch: bool, score: int}
     */
    private function evaluateAttributeCompatibility(array $requested, array $found, string $brandInput, array $web): array
    {
        $score = 50 - ((int) ($web['position'] ?? 1) * 3);
        $titleLower = mb_strtolower($web['title'].' '.$web['snippet']);

        // Strict wattage verification (e.g. Sun 5 48W vs Sun 8 Pro 268W)
        if ($requested['power_watts'] !== null && $found['power_watts'] !== null) {
            if ($requested['power_watts'] !== $found['power_watts']) {
                return ['hard_mismatch' => true, 'score' => -100];
            }
            $score += 35;
        }

        // Strict model token verification (e.g. Sun 5 vs Sun 8)
        if ($requested['model_code'] !== null && $found['model_code'] !== null) {
            if ($requested['model_code'] !== $found['model_code']) {
                return ['hard_mismatch' => true, 'score' => -100];
            }
            $score += 35;
        }

        // Strict volume / presentation comparison (15 ml vs 8 ml)
        if ($requested['volume_number'] !== null && $found['volume_number'] !== null) {
            if (abs((float) $requested['volume_number'] - (float) $found['volume_number']) > 0.05) {
                return ['hard_mismatch' => true, 'score' => -100];
            }
            $score += 25;
        }

        if ($brandInput !== '') {
            if (str_contains($titleLower, mb_strtolower($brandInput)) || str_contains((string) $web['domain'], Str::slug($brandInput))) {
                $score += 25;
            }
        }

        // Prioritize manufacturer / official store domains over generic marketplaces
        $domain = (string) ($web['domain'] ?? '');
        if (! preg_match('/\b(mercadolivre|shopee|amazon|americanas|magazineluiza|casasbahia|aliexpress)\b/i', $domain)) {
            $score += 18;
        }

        foreach ($requested['keywords'] as $kw) {
            if (str_contains($titleLower, $kw)) {
                $score += 6;
            }
        }

        return ['hard_mismatch' => false, 'score' => $score];
    }

    /**
     * @param  array<string, mixed>  $attrs
     * @param  list<array<string, mixed>>  $candidates
     */
    private function shouldShowMultipleCandidates(array $attrs, string $brandInput, array $candidates): bool
    {
        if (count($candidates) < 2) {
            return false;
        }

        $distinctBrands = count(array_unique(array_filter(array_map(
            fn (array $c): string => mb_strtolower((string) ($c['brand_name'] ?? '')),
            array_slice($candidates, 0, 4)
        ))));

        $distinctSpecs = count(array_unique(array_filter(array_map(
            fn (array $c): string => (string) ($c['power_watts'] ?? '').'|'.(string) ($c['volume_label'] ?? ''),
            array_slice($candidates, 0, 4)
        ), fn (string $s): bool => $s !== '|')));

        $lacksBrand = $brandInput === '' && ($attrs['inferred_brand'] ?? null) === null;
        if ($lacksBrand && $attrs['is_generic_query'] && ($distinctBrands >= 2 || $distinctSpecs >= 2)) {
            return true;
        }

        // Also if top 2 candidates are tied closely while referring to different brands or wattages
        $topDiff = $candidates[0]['score'] - $candidates[1]['score'];

        return $topDiff <= 8 && ($distinctBrands >= 2 || $distinctSpecs >= 2);
    }

    /**
     * @param  array<string, mixed>  $attrs
     * @return list<array<string, mixed>>
     */
    private function findLocalCatalogMatches(
        string $query,
        string $barcode,
        string $internalSku,
        string $manufacturerCode,
        array $attrs,
        bool $canViewCost,
    ): array {
        $matches = [];
        $seenIds = [];

        $appendMatch = function (Product $p, string $reason, bool $isExactIdentifier) use (&$matches, &$seenIds, $canViewCost): void {
            if (isset($seenIds[$p->id])) {
                return;
            }
            $seenIds[$p->id] = true;
            $p->loadMissing(['brand:id,name', 'images', 'variants']);
            $primaryImg = $p->images->firstWhere('is_primary', true) ?? $p->images->first();
            $matches[] = [
                'id' => $p->id,
                'name' => $p->name,
                'sku' => $p->sku,
                'gtin' => $p->gtin,
                'supplier_code' => $p->supplier_code,
                'power_watts' => $p->power_watts,
                'brand_name' => $p->brand?->name,
                'price_cents' => $p->price_cents,
                'cost_cents' => $canViewCost ? $p->cost_cents : null,
                'stock_qty' => (int) $p->variants->sum('stock_qty'),
                'primary_image_path' => $primaryImg?->path,
                'reason' => $reason,
                'is_exact_identifier' => $isExactIdentifier,
            ];
        };

        if ($barcode !== '') {
            $p = Product::withTrashed()->where('gtin', $barcode)->first();
            if ($p) {
                $appendMatch($p, "Código de barras {$barcode} encontrado no catálogo.", true);
            }
            $v = ProductVariant::query()->with('product')->where('gtin', $barcode)->first();
            if ($v?->product) {
                $appendMatch($v->product, "Código de barras {$barcode} encontrado na variação {$v->sku}.", true);
            }
        }

        foreach (array_filter([$internalSku, $manufacturerCode]) as $code) {
            $upper = strtoupper($code);
            $p = Product::withTrashed()->whereRaw('UPPER(sku) = ?', [$upper])->orWhereRaw('UPPER(supplier_code) = ?', [$upper])->first();
            if ($p) {
                $appendMatch($p, "Código {$upper} já vinculado a este produto.", true);
            }
            $v = ProductVariant::query()->with('product')->whereRaw('UPPER(sku) = ?', [$upper])->orWhereRaw('UPPER(supplier_code) = ?', [$upper])->first();
            if ($v?->product) {
                $appendMatch($v->product, "Código {$upper} encontrado na variação {$v->name}.", true);
            }
        }

        // Also check if user typed an internal store SKU inside main search query (e.g. "JK-DST-001" or "MF-CAB-008")
        if (preg_match('/\b([A-Z]{2,5}-[A-Z0-9-]{2,12})\b/', strtoupper($query), $codeMatch)) {
            $token = $codeMatch[1];
            $p = Product::withTrashed()->whereRaw('UPPER(sku) = ?', [$token])->first();
            if ($p) {
                $appendMatch($p, "SKU interno {$token} localizado no catálogo da loja.", true);
            }
            $v = ProductVariant::query()->with('product')->whereRaw('UPPER(sku) = ?', [$token])->first();
            if ($v?->product) {
                $appendMatch($v->product, "SKU interno {$token} localizado na variação {$v->name}.", true);
            }
        }

        // Name similarity check respecting power_watts and model differences
        if (count($attrs['keywords']) >= 2) {
            $likeTerm = '%'.$attrs['keywords'][0].'%';
            $candidates = Product::query()
                ->where('name', 'like', $likeTerm)
                ->with(['brand:id,name', 'images', 'variants'])
                ->limit(12)
                ->get();

            foreach ($candidates as $cand) {
                $candBrandName = $cand->brand !== null ? $cand->brand->name : '';
                $candAttrs = $this->parseQueryAttributes($cand->name, $candBrandName);
                if ($attrs['power_watts'] !== null && $cand->power_watts !== null && $attrs['power_watts'] !== (int) $cand->power_watts) {
                    continue;
                }
                if ($attrs['model_code'] !== null && $candAttrs['model_code'] !== null && $attrs['model_code'] !== $candAttrs['model_code']) {
                    continue;
                }
                $hits = 0;
                $candLower = mb_strtolower($cand->name);
                foreach ($attrs['keywords'] as $kw) {
                    if (str_contains($candLower, $kw)) {
                        $hits++;
                    }
                }
                if ($hits >= min(2, count($attrs['keywords']))) {
                    $exactName = mb_strtolower(trim($cand->name)) === mb_strtolower(trim($query));
                    $appendMatch(
                        $cand,
                        $exactName ? 'Produto com mesmo nome cadastrado na loja.' : 'Produto semelhante já cadastrado na loja.',
                        $exactName
                    );
                }
            }
        }

        return array_slice($matches, 0, 5);
    }

    /**
     * Parses query/title technical tokens deterministically without guessing hidden values.
     *
     * @return array{
     *   power_watts: ?int,
     *   volume_number: ?float,
     *   volume_label: ?string,
     *   model_code: ?string,
     *   shade_hint: ?string,
     *   inferred_brand: ?string,
     *   is_bivolt: bool,
     *   has_timer: bool,
     *   is_generic_query: bool,
     *   keywords: list<string>
     * }
     */
    private function parseQueryAttributes(string $text, string $brandHint = ''): array
    {
        $power = null;
        if (preg_match('/\b(\d{1,4})\s*w(?:atts?)?\b/iu', $text, $wm)) {
            $power = (int) $wm[1];
        }

        $volNum = null;
        $volLabel = null;
        if (preg_match('/\b(\d+(?:[.,]\d+)?)\s*(ml|g|l|un)\b/iu', $text, $vm)) {
            $volNum = (float) str_replace(',', '.', $vm[1]);
            $volLabel = trim($vm[1].' '.mb_strtolower($vm[2]));
        }

        $textWithoutMeasure = preg_replace('/\b\d+(?:[.,]\d+)?\s*(?:ml|g|l|kg|un|w|watts?)\b/iu', ' ', $text) ?? $text;
        $modelCode = null;
        if (preg_match('/\b(sun\s*\d+(?:\s*pro|\s*max|\s*plus)?|[a-z]{2,5}\s*-\s*\d{2,4})\b/iu', $textWithoutMeasure, $mm)) {
            $modelCode = mb_strtolower((string) preg_replace('/\s+/', ' ', trim($mm[1])));
        }

        $shadeHint = null;
        if (preg_match('/(?:^|[^\p{L}])(ros[eé]|rosa|nude|vermelho|vinho|renda|branco\s*leitoso|branco|pink|lil[aá]s|lavanda|marsala|coral|terracota|azul(?:\s+[a-zçãõ]+)?|preto|glitter(?:\s+[a-zçãõ]+)?|\d{3})(?:$|[^\p{L}])/iu', $text, $sm)) {
            $shadeHint = trim($sm[1]);
        }

        $stopwords = ['de', 'do', 'da', 'em', 'com', 'para', 'por', 'na', 'no', 'e', 'ou', 'um', 'uma'];
        $tokens = preg_split('/[^\p{L}\p{N}]+/u', mb_strtolower($text), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $keywords = array_values(array_filter(
            $tokens,
            fn (string $t): bool => mb_strlen($t) >= 2 && ! in_array($t, $stopwords, true)
        ));

        $inferredBrand = $brandHint !== '' ? $brandHint : null;
        if ($inferredBrand === null && preg_match('/\b(v[oò]lia|d&z|real\s*love|bella\s*gel|anita|risqu[eé]|impala|dailus|bl[uú]e\s*sky|pi[uù]\s*bella|cuccio|sun)\b/iu', $text, $bm)) {
            $knownBrand = trim($bm[1]);
            if (mb_strtolower($knownBrand) !== 'sun') {
                $inferredBrand = ucwords(mb_strtolower($knownBrand));
            }
        }

        $isGeneric = count($keywords) <= 4 && $brandHint === '' && $inferredBrand === null && $modelCode === null;

        return [
            'power_watts' => $power,
            'volume_number' => $volNum,
            'volume_label' => $volLabel,
            'model_code' => $modelCode,
            'shade_hint' => $shadeHint,
            'inferred_brand' => $inferredBrand,
            'is_bivolt' => preg_match('/bivolt/i', $text) === 1,
            'has_timer' => preg_match('/temporizador|timer/i', $text) === 1,
            'is_generic_query' => $isGeneric,
            'keywords' => $keywords,
        ];
    }

    private function buildExternalSearchQuery(string $query, string $brand, string $barcode, string $manufacturerCode): string
    {
        // Strip internal shop SKUs like "MF-..." unless explicitly identified as manufacturer code
        $clean = preg_replace('/\bMF-[A-Z0-9-]+\b/i', '', $query) ?? $query;
        $parts = array_filter([
            trim($clean),
            $brand !== '' && ! str_contains(mb_strtolower($clean), mb_strtolower($brand)) ? $brand : '',
            $manufacturerCode,
            $barcode,
        ]);

        return trim(implode(' ', $parts));
    }

    /**
     * @param  Collection<int, Brand>  $brands
     * @param  Collection<int, Category>  $categories
     * @param  array<string, mixed>  $attrs
     * @return array<string, mixed>
     */
    private function buildManualFallbackDraft(
        string $cleanQuery,
        array $attrs,
        string $brandInput,
        string $barcode,
        string $manufacturerCode,
        Collection $brands,
        Collection $categories,
    ): array {
        $matchedBrand = $this->matchBrand($brandInput !== '' ? $brandInput : ($attrs['inferred_brand'] ?? $cleanQuery), $brands);
        $matchedCat = $this->matchCategory($cleanQuery, $categories);
        $name = $cleanQuery !== '' ? $cleanQuery : 'Novo produto';

        return [
            'name' => mb_substr($name, 0, 190),
            'sku' => $manufacturerCode !== '' ? strtoupper($manufacturerCode) : $this->suggestInternalSku($name, $matchedBrand !== null ? $matchedBrand->name : $brandInput),
            'gtin' => $barcode,
            'supplier_code' => $manufacturerCode,
            'power_watts' => $attrs['power_watts'],
            'brand_id' => $matchedBrand?->id,
            'suggested_new_brand_name' => $matchedBrand === null && $brandInput !== '' ? $brandInput : null,
            'category_ids' => $matchedCat ? [$matchedCat->id] : [],
            'suggested_new_category_name' => null,
            'short_description' => '',
            'description' => '',
            'seo_title' => mb_substr($name.' | Mistura Feminina Cosméticos', 0, 180),
            'seo_description' => '',
            'image_url' => null,
            'image_path' => '',
            'price_cents' => null,
            'cost_cents' => null,
            'stock_qty' => null,
        ];
    }

    /** @param Collection<int, Brand> $brands */
    private function matchBrand(string $text, Collection $brands): ?Brand
    {
        if (trim($text) === '') {
            return null;
        }
        $lower = mb_strtolower(trim($text));
        foreach ($brands as $b) {
            if (mb_strtolower($b->name) === $lower || str_contains($lower, mb_strtolower($b->name))) {
                return $b;
            }
        }

        return null;
    }

    /** @param Collection<int, Category> $categories */
    private function matchCategory(string $text, Collection $categories): ?Category
    {
        $lower = mb_strtolower($text);
        $keywordsMap = [
            'cabine' => ['cabine', 'luminaria', 'luminária', 'motor', 'micromotor'],
            'esmalte' => ['esmalte', 'top coat', 'base em gel', 'gel construtor', 'gel uv'],
            'alongamento' => ['fibra', 'tips', 'acrigel', 'polygel', 'molde'],
            'maquiagem' => ['batom', 'base', 'paleta', 'blush', 'rímel'],
        ];

        foreach ($categories as $cat) {
            $catLower = mb_strtolower($cat->name);
            if (str_contains($lower, $catLower)) {
                return $cat;
            }
            foreach ($keywordsMap as $catKey => $terms) {
                if (str_contains($catLower, $catKey)) {
                    foreach ($terms as $t) {
                        if (str_contains($lower, $t)) {
                            return $cat;
                        }
                    }
                }
            }
        }

        return null;
    }

    /** @param array<string, mixed> $candAttrs */
    private function buildDiffBadge(?string $brandName, array $candAttrs, string $domain): string
    {
        $parts = array_filter([
            $brandName,
            ! empty($candAttrs['power_watts']) ? $candAttrs['power_watts'].'W' : null,
            $candAttrs['volume_label'] ?? null,
            $domain,
        ]);

        return implode(' · ', $parts);
    }

    private function suggestInternalSku(string $name, string $brandName): string
    {
        $words = preg_split('/\s+/', strtoupper(Str::ascii(trim($name.' '.$brandName))), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $prefix = implode('', array_map(fn (string $w): string => substr(preg_replace('/[^A-Z0-9]/', '', $w) ?? '', 0, 3), array_slice($words, 0, 2)));
        $prefix = $prefix !== '' ? substr($prefix, 0, 6) : 'PROD';

        return 'MF-'.$prefix.'-'.str_pad((string) random_int(100, 999), 3, '0', STR_PAD_LEFT);
    }

    private function cleanSourceTitle(string $title, string $fallback): string
    {
        // Remove storefront suffixes like "| Mercado Livre", "- Shopee Brasil", "Compre agora..."
        $parts = preg_split('/\s+[|\-–—]\s+(mercado\s*livre|shopee|amazon|magalu|americanas|compre|loja).*$/iu', $title);
        $clean = trim((string) ($parts[0] ?? $title));

        return $clean !== '' ? $clean : $fallback;
    }

    private function stripPricesAndBoilerplate(string $text): string
    {
        $stripped = preg_replace('/R\$\s*\d{1,6}(?:\.\d{3})*(?:,\d{2})?/u', '', $text) ?? $text;
        $stripped = preg_replace('/\bem\s+at[eé]\s+\d+x\s+sem\s+juros\b/iu', '', $stripped) ?? $stripped;
        $stripped = $this->stripBoilerplate($stripped);

        return trim((string) preg_replace('/\s{2,}/', ' ', $stripped));
    }

    private function stripBoilerplate(string $text): string
    {
        $out = $text;
        foreach (self::GENERIC_FILLER_PHRASES as $phrase) {
            $out = str_ireplace($phrase, '', $out);
        }

        return trim($out);
    }
}
