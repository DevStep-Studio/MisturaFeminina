<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Domain\Catalog\Services\CategoryHierarchyService;
use App\Domain\Security\Services\AuditLogger;
use App\Domain\Settings\Services\StoreSettingsService;
use App\Http\Controllers\Controller;
use App\Models\AnalyticsEvent;
use App\Models\Banner;
use App\Models\Brand;
use App\Models\Category;
use App\Models\ContentPage;
use App\Models\Coupon;
use App\Models\HomeSection;
use App\Models\MarketingIntegration;
use App\Models\NewsletterSubscription;
use App\Models\Product;
use App\Models\Review;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class StorefrontController extends Controller
{
    public function __construct(
        private readonly StoreSettingsService $settings,
        private readonly AuditLogger $audit,
        private readonly CategoryHierarchyService $categoryHierarchy,
    ) {}

    public function bootstrap(): JsonResponse
    {
        $config = $this->settings->getPublicConfig();

        try {
            $ga4Integration = MarketingIntegration::query()->where('platform', 'google_analytics_4')->first();
            $ga4Id = strtoupper(trim((string) ($ga4Integration?->pixel_id ?? '')));
            $gtmId = strtoupper(trim((string) ($ga4Integration?->settings['gtm_id'] ?? '')));
            $config['ga4_measurement_id'] = ($ga4Id !== '' && preg_match('/^G-[A-Z0-9]{4,}$/', $ga4Id) === 1 && preg_match('/^G-X+$/', $ga4Id) !== 1 && $ga4Id !== 'G-MFEMININA01')
                ? $ga4Id
                : null;
            $config['gtm_id'] = ($gtmId !== '' && preg_match('/^GTM-[A-Z0-9]{4,}$/', $gtmId) === 1 && preg_match('/^GTM-X+$/', $gtmId) !== 1)
                ? $gtmId
                : null;
        } catch (\Throwable) {
            $config['ga4_measurement_id'] = null;
            $config['gtm_id'] = null;
        }

        $maxInstallments = 3;

        $menuTree = $this->categoryHierarchy->getPublicDirectoryTree(menuOnly: true);
        $categories = collect($menuTree)
            ->map(function (array $node) use ($maxInstallments): array {
                $catIds = $this->categoryHierarchy->getDescendantIds((int) $node['id'], activeOnly: true);
                $featured = Product::query()
                    ->where('is_active', true)
                    ->whereHas('categories', fn ($q) => $q->whereIn('categories.id', $catIds))
                    ->with(['brand:id,name,slug', 'images', 'variants' => fn ($q) => $q->where('is_active', true)->whereNull('archived_at')])
                    ->orderByRaw("CASE WHEN sku LIKE 'JK-%' THEN 0 ELSE 1 END ASC")
                    ->orderByDesc('is_featured')
                    ->orderByDesc('sales_count')
                    ->orderBy('id')
                    ->first();
                $node['featured_product'] = $featured
                    ? CatalogController::serializeProductCard($featured, $maxInstallments)
                    : null;

                return $node;
            })
            ->values();

        $promoProducts = Product::query()
            ->where('is_active', true)
            ->whereNotNull('promo_price_cents')
            ->whereColumn('promo_price_cents', '<', 'price_cents')
            ->with(['brand:id,name,slug', 'images', 'variants' => fn ($q) => $q->where('is_active', true)->whereNull('archived_at')])
            ->orderByRaw("CASE WHEN sku LIKE 'JK-%' THEN 0 ELSE 1 END ASC")
            ->orderByDesc('is_featured')
            ->orderByDesc('sales_count')
            ->limit(8)
            ->get()
            ->map(fn (Product $p): array => CatalogController::serializeProductCard($p, $maxInstallments))
            ->values();

        $recommendedProducts = Product::query()
            ->where('is_active', true)
            ->whereHas('variants', fn ($vq) => $vq->where('is_active', true)->whereNull('archived_at')->whereRaw('(stock_qty - reserved_qty) > 0'))
            ->with(['brand:id,name,slug', 'images', 'variants' => fn ($q) => $q->where('is_active', true)->whereNull('archived_at')])
            ->orderByRaw("CASE WHEN sku LIKE 'JK-%' THEN 0 ELSE 1 END ASC")
            ->orderByDesc('is_best_seller')
            ->orderByDesc('is_featured')
            ->limit(4)
            ->get()
            ->map(fn (Product $p): array => CatalogController::serializeProductCard($p, $maxInstallments))
            ->values();

        $brands = Brand::query()
            ->where('is_active', true)
            ->orderByDesc('is_featured')
            ->orderBy('name')
            ->limit(20)
            ->get(['id', 'name', 'slug', 'logo_path', 'is_featured']);

        $footerPages = ContentPage::query()
            ->where('is_published', true)
            ->where('show_in_footer', true)
            ->orderBy('sort_order')
            ->get(['slug', 'title', 'footer_group']);

        $now = now();
        $featuredCoupon = Coupon::query()
            ->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', $now))
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', $now))
            ->orderBy('id')
            ->first(['code', 'name', 'type', 'value']);

        $activeBanners = Banner::query()
            ->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', $now))
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', $now))
            ->orderBy('sort_order')
            ->get();

        return response()->json([
            'data' => [
                'settings' => $config,
                'menu_categories' => $categories,
                'promo_products' => $promoProducts,
                'recommended_products' => $recommendedProducts,
                'brands' => $brands,
                'footer_pages' => $footerPages,
                'featured_coupon' => $featuredCoupon,
                'banners' => $activeBanners,
            ],
        ]);
    }

    public function home(): JsonResponse
    {
        $now = now();
        $activeBanners = Banner::query()
            ->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', $now))
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', $now))
            ->orderBy('sort_order')
            ->get();

        $sections = HomeSection::query()
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->get();

        $resolved = $sections->map(function (HomeSection $section) use ($activeBanners, $now): array {
            $cfg = $section->config ?? [];
            $payload = null;

            switch ($section->type) {
                case 'hero_carousel':
                    $payload = $activeBanners->where('placement', 'hero')->values();
                    break;
                case 'banner_grid':
                    $payload = $activeBanners->where('placement', 'promo_grid')->values();
                    break;
                case 'category_circles':
                    $slugs = isset($cfg['slugs']) && is_array($cfg['slugs'])
                        ? array_values(array_filter(array_map('strval', $cfg['slugs'])))
                        : [];
                    if ($slugs !== []) {
                        $bySlug = Category::query()
                            ->where('is_active', true)
                            ->whereIn('slug', $slugs)
                            ->get(['id', 'name', 'slug', 'image_path', 'icon'])
                            ->keyBy('slug');
                        $payload = collect($slugs)
                            ->map(fn (string $s) => $bySlug->get($s))
                            ->filter()
                            ->values();
                    } else {
                        $payload = Category::query()
                            ->where('is_active', true)
                            ->whereNull('parent_id')
                            ->orderBy('sort_order')
                            ->limit((int) ($cfg['limit'] ?? 10))
                            ->get(['id', 'name', 'slug', 'image_path', 'icon']);
                    }
                    $visibleSlugs = $this->categoryHierarchy->getVisibleCategorySlugs();
                    $payload = $payload->filter(fn ($cat) => in_array($cat->slug, $visibleSlugs, true))->values();
                    break;
                case 'product_showcase':
                    $maxInstallments = (int) ($cfg['max_installments'] ?? 3);
                    $limit = (int) ($cfg['limit'] ?? 8);
                    $products = collect();

                    if (! empty($cfg['product_skus']) && is_array($cfg['product_skus'])) {
                        $skus = array_values(array_filter(array_map('strval', $cfg['product_skus'])));
                        $bySku = Product::query()
                            ->where('is_active', true)
                            ->whereIn('sku', $skus)
                            ->with(['brand:id,name,slug', 'images', 'variants' => fn ($q) => $q->where('is_active', true)->whereNull('archived_at')->with('attributeValues.attribute')])
                            ->get()
                            ->keyBy('sku');
                        $products = collect($skus)
                            ->map(fn (string $sku) => $bySku->get($sku))
                            ->filter();
                    }

                    // Se não houver SKUs específicos ou se retornou menos de 4 itens, consulta dinamicamente pelo catálogo real
                    if ($products->count() < 4) {
                        $query = Product::query()
                            ->where('is_active', true)
                            ->with(['brand:id,name,slug', 'images', 'variants' => fn ($q) => $q->where('is_active', true)->whereNull('archived_at')->with('attributeValues.attribute')]);

                        // Exclui produtos já carregados via SKU para não duplicar
                        if ($products->isNotEmpty()) {
                            $query->whereNotIn('id', $products->pluck('id')->all());
                        }

                        $filter = (string) ($cfg['filter'] ?? 'featured');
                        match ($filter) {
                            'offers' => $query->whereNotNull('promo_price_cents')->whereColumn('promo_price_cents', '<', 'price_cents'),
                            'new_arrivals' => $query->where('is_new_arrival', true),
                            'best_sellers' => $query->orderByDesc('sales_count')->orderByDesc('is_best_seller'),
                            'category' => (function () use ($query, $cfg): void {
                                $catSlug = (string) ($cfg['category_slug'] ?? '');
                                $cat = Category::query()->where('is_active', true)->where('slug', $catSlug)->first();
                                if ($cat) {
                                    $catIds = $this->categoryHierarchy->getDescendantIds((int) $cat->id, activeOnly: true);
                                    $query->whereHas('categories', fn ($q) => $q->whereIn('categories.id', $catIds));
                                } else {
                                    $query->whereHas('categories', fn ($q) => $q->where('slug', $catSlug));
                                }
                            })(),
                            'brand' => $query->whereHas('brand', fn ($q) => $q->where('slug', (string) ($cfg['brand_slug'] ?? ''))),
                            default => $query->orderByDesc('is_featured'),
                        };

                        $additionalProducts = $query
                            ->orderByRaw('CASE WHEN EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = products.id AND pi.is_primary = 1) THEN 0 ELSE 1 END ASC')
                            ->orderByRaw('CASE WHEN EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = products.id AND pv.is_active = 1 AND pv.archived_at IS NULL AND (pv.stock_qty - pv.reserved_qty) > 0) THEN 0 ELSE 1 END ASC')
                            ->orderByDesc('is_featured')
                            ->orderByDesc('sales_count')
                            ->orderByDesc('id')
                            ->limit($limit - $products->count())
                            ->get();

                        $products = $products->concat($additionalProducts);
                    }

                    $payload = $products
                        ->map(fn (Product $p): array => CatalogController::serializeProductCard($p, $maxInstallments))
                        ->values();
                    break;
                case 'brand_showcase':
                    $payload = Brand::query()
                        ->where('is_active', true)
                        ->orderByDesc('is_featured')
                        ->orderBy('id')
                        ->limit((int) ($cfg['limit'] ?? 12))
                        ->get();
                    break;
                case 'coupon_strip':
                    $payload = Coupon::query()
                        ->where('is_active', true)
                        ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', $now))
                        ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', $now))
                        ->first(['code', 'name', 'type', 'value']);
                    break;
                case 'testimonials':
                    $payload = Review::query()
                        ->where('status', 'approved')
                        ->with('product:id,name,slug')
                        ->latest('id')
                        ->limit((int) ($cfg['limit'] ?? 6))
                        ->get();
                    break;
            }

            return [
                'id' => $section->id,
                'key' => $section->key,
                'type' => $section->type,
                'title' => $section->title,
                'subtitle' => $section->subtitle,
                'config' => $cfg,
                'data' => $payload,
            ];
        })->values();

        return response()->json(['data' => ['sections' => $resolved]]);
    }

    public function page(string $slug): JsonResponse
    {
        $page = ContentPage::query()
            ->where('slug', $slug)
            ->where('is_published', true)
            ->firstOrFail();

        return response()->json(['data' => $page]);
    }

    public function subscribeNewsletter(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'string', 'email:rfc', 'max:190'],
            'name' => ['nullable', 'string', 'max:120'],
            'consent' => ['required', 'accepted'],
        ], [
            'consent.accepted' => 'É necessário aceitar receber comunicações conforme a Política de Privacidade.',
        ]);

        $email = strtolower(trim($validated['email']));
        $sub = NewsletterSubscription::query()->updateOrCreate(
            ['email' => $email],
            [
                'name' => $validated['name'] ?? null,
                'consent_ip' => $request->ip(),
                'consented_at' => now(),
                'confirmed_at' => now(),
                'unsubscribe_token' => Str::random(40),
                'unsubscribed_at' => null,
            ]
        );

        return response()->json([
            'message' => 'Inscrição na newsletter confirmada com sucesso!',
            'data' => ['email' => $sub->email],
        ], 201);
    }

    public function unsubscribeNewsletter(string $token): JsonResponse
    {
        $sub = NewsletterSubscription::query()->where('unsubscribe_token', $token)->firstOrFail();
        $sub->update(['unsubscribed_at' => now()]);

        return response()->json(['message' => 'Você foi descadastrado da nossa newsletter.']);
    }

    public function contact(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:150'],
            'email' => ['required', 'string', 'email:rfc', 'max:190'],
            'phone' => ['nullable', 'string', 'max:30'],
            'subject' => ['required', 'string', 'max:160'],
            'message' => ['required', 'string', 'min:10', 'max:2000'],
        ]);

        $this->audit->record('storefront.contact_submitted', $request->user(), 'contact', null, null, [
            'name' => $validated['name'],
            'email' => $validated['email'],
            'subject' => $validated['subject'],
        ], $request);

        return response()->json(['message' => 'Mensagem recebida! Nossa equipe responderá em breve.'], 201);
    }

    public function trackEvent(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'session_id' => ['required', 'string', 'max:100'],
            'event_name' => ['required', 'string', 'in:page_view,view_item,add_to_cart,remove_from_cart,view_cart,begin_checkout,add_shipping_info,add_payment_info,purchase,refund,search,contact_click,wholesale_inquiry,restock_alert'],
            'path' => ['nullable', 'string', 'max:300'],
            'order_id' => ['nullable', 'integer'],
            'utm_source' => ['nullable', 'string', 'max:100'],
            'utm_medium' => ['nullable', 'string', 'max:100'],
            'utm_campaign' => ['nullable', 'string', 'max:120'],
            'payload' => ['nullable', 'array'],
        ]);

        $cleanPayload = isset($validated['payload']) && is_array($validated['payload'])
            ? $this->stripAnalyticsPii($validated['payload'])
            : null;

        // Prevent duplicate purchase counting on refresh (by order_id or transaction_id)
        if ($validated['event_name'] === 'purchase') {
            $txId = is_array($cleanPayload) ? trim((string) ($cleanPayload['transaction_id'] ?? '')) : '';
            if (! empty($validated['order_id'])) {
                $exists = AnalyticsEvent::query()
                    ->where('event_name', 'purchase')
                    ->where('order_id', (int) $validated['order_id'])
                    ->exists();
                if ($exists) {
                    return response()->json(['recorded' => false]);
                }
            }
            if ($txId !== '') {
                $existsByTx = AnalyticsEvent::query()
                    ->where('event_name', 'purchase')
                    ->where('created_at', '>=', now()->subDays(30))
                    ->get(['payload'])
                    ->contains(fn (AnalyticsEvent $ev): bool => (string) ($ev->payload['transaction_id'] ?? '') === $txId);
                if ($existsByTx) {
                    return response()->json(['recorded' => false]);
                }
            }
        }

        AnalyticsEvent::query()->create([
            'session_id' => $validated['session_id'],
            'user_id' => $request->user()?->id,
            'order_id' => $validated['order_id'] ?? null,
            'event_name' => $validated['event_name'],
            'path' => $validated['path'] ?? null,
            'utm_source' => $validated['utm_source'] ?? null,
            'utm_medium' => $validated['utm_medium'] ?? null,
            'utm_campaign' => $validated['utm_campaign'] ?? null,
            'payload' => $cleanPayload,
        ]);

        return response()->json(['recorded' => true], 201);
    }

    /**
     * Strips any personal customer fields from analytics event payloads (LGPD & GA4 policy).
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function stripAnalyticsPii(array $data): array
    {
        $forbiddenKeys = [
            'name', 'customer_name', 'recipient_name', 'first_name', 'last_name',
            'email', 'customer_email', 'phone', 'customer_phone', 'whatsapp',
            'cpf', 'cnpj', 'cpf_cnpj', 'document',
            'address', 'street', 'complement', 'neighborhood', 'cep', 'zipcode',
        ];

        $out = [];
        foreach ($data as $k => $v) {
            $keyLower = strtolower((string) $k);
            if (in_array($keyLower, $forbiddenKeys, true)) {
                continue;
            }
            $out[$k] = is_array($v) ? $this->stripAnalyticsPii($v) : $v;
        }

        return $out;
    }
}
