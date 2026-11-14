<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

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
    ) {}

    public function bootstrap(): JsonResponse
    {
        $config = $this->settings->getPublicConfig();

        $maxInstallments = 3;

        $categories = Category::query()
            ->where('is_active', true)
            ->where('show_in_menu', true)
            ->whereNull('parent_id')
            ->with(['children' => fn ($q) => $q->where('is_active', true)->orderBy('sort_order')->with(['children' => fn ($q2) => $q2->where('is_active', true)->orderBy('sort_order')])])
            ->orderBy('sort_order')
            ->get()
            ->map(function (Category $cat) use ($maxInstallments): array {
                $node = $this->formatCategoryNode($cat);
                $catIds = $this->collectCategoryIds($cat);
                $featured = Product::query()
                    ->where('is_active', true)
                    ->whereHas('categories', fn ($q) => $q->whereIn('categories.id', $catIds))
                    ->with(['brand:id,name,slug', 'images', 'variants' => fn ($q) => $q->where('is_active', true)])
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
            ->with(['brand:id,name,slug', 'images', 'variants' => fn ($q) => $q->where('is_active', true)])
            ->orderByRaw("CASE WHEN sku LIKE 'JK-%' THEN 0 ELSE 1 END ASC")
            ->orderByDesc('is_featured')
            ->orderByDesc('sales_count')
            ->limit(8)
            ->get()
            ->map(fn (Product $p): array => CatalogController::serializeProductCard($p, $maxInstallments))
            ->values();

        $recommendedProducts = Product::query()
            ->where('is_active', true)
            ->whereHas('variants', fn ($vq) => $vq->where('is_active', true)->whereRaw('(stock_qty - reserved_qty) > 0'))
            ->with(['brand:id,name,slug', 'images', 'variants' => fn ($q) => $q->where('is_active', true)])
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

        return response()->json([
            'data' => [
                'settings' => $config,
                'menu_categories' => $categories,
                'promo_products' => $promoProducts,
                'recommended_products' => $recommendedProducts,
                'brands' => $brands,
                'footer_pages' => $footerPages,
                'featured_coupon' => $featuredCoupon,
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
                    break;
                case 'product_showcase':
                    $maxInstallments = (int) ($cfg['max_installments'] ?? 3);
                    if (! empty($cfg['product_skus']) && is_array($cfg['product_skus'])) {
                        $skus = array_values(array_filter(array_map('strval', $cfg['product_skus'])));
                        $bySku = Product::query()
                            ->where('is_active', true)
                            ->whereIn('sku', $skus)
                            ->with(['brand:id,name,slug', 'images', 'variants' => fn ($q) => $q->where('is_active', true)->with('attributeValues.attribute')])
                            ->get()
                            ->keyBy('sku');
                        $payload = collect($skus)
                            ->map(fn (string $sku) => $bySku->get($sku))
                            ->filter()
                            ->map(fn (Product $p): array => CatalogController::serializeProductCard($p, $maxInstallments))
                            ->values();
                    } else {
                        $query = Product::query()
                            ->where('is_active', true)
                            ->with(['brand:id,name,slug', 'images', 'variants' => fn ($q) => $q->where('is_active', true)->with('attributeValues.attribute')]);

                        $filter = (string) ($cfg['filter'] ?? 'featured');
                        match ($filter) {
                            'offers' => $query->whereNotNull('promo_price_cents')->whereColumn('promo_price_cents', '<', 'price_cents'),
                            'new_arrivals' => $query->where('is_new_arrival', true),
                            'best_sellers' => $query->where('is_best_seller', true)->orderByDesc('sales_count'),
                            'category' => $query->whereHas('categories', fn ($q) => $q->where('slug', (string) ($cfg['category_slug'] ?? ''))),
                            'brand' => $query->whereHas('brand', fn ($q) => $q->where('slug', (string) ($cfg['brand_slug'] ?? ''))),
                            default => $query->where('is_featured', true),
                        };

                        $payload = $query
                            ->orderByRaw('CASE WHEN EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = products.id AND pv.is_active = 1 AND (pv.stock_qty - pv.reserved_qty) > 0) THEN 0 ELSE 1 END ASC')
                            ->orderByDesc('id')
                            ->limit((int) ($cfg['limit'] ?? 8))
                            ->get()
                            ->map(fn (Product $p): array => CatalogController::serializeProductCard($p, $maxInstallments))
                            ->values();
                    }
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
            'event_name' => ['required', 'string', 'in:page_view,view_item,add_to_cart,begin_checkout,purchase,search'],
            'path' => ['nullable', 'string', 'max:300'],
            'order_id' => ['nullable', 'integer'],
            'utm_source' => ['nullable', 'string', 'max:100'],
            'utm_medium' => ['nullable', 'string', 'max:100'],
            'utm_campaign' => ['nullable', 'string', 'max:120'],
            'payload' => ['nullable', 'array'],
        ]);

        // Prevent duplicate purchase counting on refresh
        if ($validated['event_name'] === 'purchase' && ! empty($validated['order_id'])) {
            $exists = AnalyticsEvent::query()
                ->where('event_name', 'purchase')
                ->where('order_id', (int) $validated['order_id'])
                ->exists();
            if ($exists) {
                return response()->json(['recorded' => false]);
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
            'payload' => $validated['payload'] ?? null,
        ]);

        return response()->json(['recorded' => true], 201);
    }

    /** @return array<string, mixed> */
    private function formatCategoryNode(Category $category): array
    {
        return [
            'id' => $category->id,
            'name' => $category->name,
            'slug' => $category->slug,
            'image_path' => $category->image_path,
            'icon' => $category->icon,
            'children' => $category->children->map(fn (Category $c): array => $this->formatCategoryNode($c))->values()->all(),
        ];
    }

    /** @return list<int> */
    private function collectCategoryIds(Category $category): array
    {
        $ids = [$category->id];
        foreach ($category->children as $child) {
            $ids = array_merge($ids, $this->collectCategoryIds($child));
        }

        return $ids;
    }
}
