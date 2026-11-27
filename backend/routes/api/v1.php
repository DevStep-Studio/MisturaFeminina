<?php

use App\Http\Controllers\Api\V1\AccountController;
use App\Http\Controllers\Api\V1\Admin\AdminAiAgentController;
use App\Http\Controllers\Api\V1\Admin\AdminAiMarketingAgentController;
use App\Http\Controllers\Api\V1\Admin\AdminCatalogController;
use App\Http\Controllers\Api\V1\Admin\AdminContentController;
use App\Http\Controllers\Api\V1\Admin\AdminMarketingController;
use App\Http\Controllers\Api\V1\Admin\AdminOperationsController;
use App\Http\Controllers\Api\V1\Admin\AdminOrderController;
use App\Http\Controllers\Api\V1\Admin\AdminPaymentsController;
use App\Http\Controllers\Api\V1\Admin\AdminReportsController;
use App\Http\Controllers\Api\V1\Admin\AdminSettingsController;
use App\Http\Controllers\Api\V1\Admin\AdminShippingController;
use App\Http\Controllers\Api\V1\Admin\AdminUsersController;
use App\Http\Controllers\Api\V1\Admin\AdminWholesaleController;
use App\Http\Controllers\Api\V1\Admin\DashboardController;
use App\Http\Controllers\Api\V1\CartController;
use App\Http\Controllers\Api\V1\CatalogController;
use App\Http\Controllers\Api\V1\CheckoutController;
use App\Http\Controllers\Api\V1\ProjectController;
use App\Http\Controllers\Api\V1\StorefrontController;
use App\Http\Controllers\Api\V1\WebhookController;
use App\Http\Controllers\SeoController;
use App\Http\Resources\Api\V1\UserResource;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// Public Storefront & Catalog
Route::prefix('storefront')->group(function (): void {
    Route::get('bootstrap', [StorefrontController::class, 'bootstrap']);
    Route::get('home', [StorefrontController::class, 'home']);
    Route::get('pages/{slug}', [StorefrontController::class, 'page']);
    Route::get('sitemap.xml', [SeoController::class, 'sitemap']);
    Route::get('robots.txt', [SeoController::class, 'robots']);
    Route::get('llms.txt', [SeoController::class, 'llms']);
    Route::get('merchant-feed.xml', [SeoController::class, 'merchantFeed']);
    Route::get('feed/google-merchant.xml', [SeoController::class, 'merchantFeed']);
    Route::post('newsletter/subscribe', [StorefrontController::class, 'subscribeNewsletter'])->middleware('throttle:10,1');
    Route::get('newsletter/unsubscribe/{token}', [StorefrontController::class, 'unsubscribeNewsletter']);
    Route::post('contact', [StorefrontController::class, 'contact'])->middleware('throttle:10,1');
    Route::post('events', [StorefrontController::class, 'trackEvent'])->middleware('throttle:60,1');
});

Route::prefix('catalog')->group(function (): void {
    Route::get('categories', [CatalogController::class, 'categories']);
    Route::get('categories/{slug}', [CatalogController::class, 'categoryShow']);
    Route::get('brands', [CatalogController::class, 'brands']);
    Route::get('brands/{slug}', [CatalogController::class, 'brandShow']);
    Route::get('products', [CatalogController::class, 'products']);
    Route::get('search', [CatalogController::class, 'search']);
    Route::get('compare', [CatalogController::class, 'compare']);
    Route::get('products/{slug}', [CatalogController::class, 'show']);
    Route::post('products/{slug}/shipping-quote', [CatalogController::class, 'quoteProductShipping'])->middleware('throttle:30,1');
    Route::post('products/{slug}/restock-alert', [CatalogController::class, 'restockAlert'])->middleware('throttle:15,1');
    Route::post('restock-alerts/{token}/cancel', [CatalogController::class, 'cancelRestockAlert'])->middleware('throttle:20,1');
    Route::post('products/{slug}/reviews', [CatalogController::class, 'storeReview'])->middleware('throttle:10,1');
    Route::post('reviews/upload-photo', [CatalogController::class, 'uploadReviewPhoto'])->middleware('throttle:15,1');
});

// Wholesale Public Endpoints
Route::prefix('wholesale')->group(function (): void {
    Route::get('catalog', [CatalogController::class, 'wholesaleCatalog']);
    Route::post('reseller-request', [CatalogController::class, 'requestWholesaleAccount'])->middleware('throttle:10,1');
});

// Cart (Guest X-Cart-Token / Cookie or Authenticated User)
Route::prefix('cart')->group(function (): void {
    Route::get('/', [CartController::class, 'show']);
    Route::post('items', [CartController::class, 'addItem']);
    Route::post('items/bulk', [CartController::class, 'addBulkItems']);
    Route::patch('items/{itemId}', [CartController::class, 'updateItem']);
    Route::delete('items/{itemId}', [CartController::class, 'removeItem']);
    Route::post('coupon', [CartController::class, 'applyCoupon']);
    Route::delete('coupon', [CartController::class, 'removeCoupon']);
    Route::post('shipping/quote', [CartController::class, 'quoteShipping']);
    Route::post('shipping/select', [CartController::class, 'selectShipping']);
    Route::post('share', [CartController::class, 'shareCart'])->middleware('throttle:15,1');
    Route::get('shared/{token}', [CartController::class, 'showSharedCart'])->middleware('throttle:60,1');
    Route::post('shared/{token}/import', [CartController::class, 'importSharedCart'])->middleware('throttle:20,1');
});

// Checkout & Order Tracking
Route::post('checkout', [CheckoutController::class, 'store'])->middleware('throttle:10,1');
Route::get('checkout/assisted/{token}', [AdminOperationsController::class, 'resolvePublicAssistedOrder'])->middleware('throttle:60,1');
Route::post('checkout/assisted/{token}/load-cart', [AdminOperationsController::class, 'loadAssistedOrderIntoCart'])->middleware('throttle:30,1');
Route::get('orders/track/{publicToken}', [CheckoutController::class, 'trackByToken']);
Route::post('orders/track-lookup', [CheckoutController::class, 'trackLookup'])->middleware('throttle:20,1');
Route::post('orders/{publicToken}/retry-payment', [CheckoutController::class, 'retryPayment'])->middleware('throttle:10,1');
Route::post('orders/{publicToken}/cancel', [CheckoutController::class, 'cancelByToken'])->middleware('throttle:10,1');

// Payment Webhooks & Sandbox Simulator
Route::post('webhooks/mercadopago', [WebhookController::class, 'mercadoPago'])->middleware('throttle:120,1');
Route::post('webhooks/asaas', [WebhookController::class, 'asaas'])->middleware('throttle:120,1');
Route::post('webhooks/plupag', [WebhookController::class, 'plupag'])->middleware('throttle:120,1');
Route::get('checkout/config', [CheckoutController::class, 'config']);
Route::get('checkout/plupag/installments', [CheckoutController::class, 'plupagInstallments'])->middleware('throttle:30,1');
Route::post('orders/{publicToken}/refresh-payment', [CheckoutController::class, 'refreshPayment'])->middleware('throttle:6,1');
Route::post('sandbox/orders/{publicToken}/simulate-payment', [WebhookController::class, 'simulateSandboxPayment']);

// Authenticated Routes
Route::middleware(['auth:sanctum'])->group(function (): void {
    Route::get('me', fn (Request $request) => new UserResource($request->user()->load('roles')));
    Route::apiResource('projects', ProjectController::class);

    // Customer Account & LGPD & 2FA
    Route::prefix('account')->group(function (): void {
        Route::get('overview', [AccountController::class, 'overview']);
        Route::put('profile', [AccountController::class, 'updateProfile']);
        Route::put('password', [AccountController::class, 'updatePassword']);
        Route::get('addresses', [AccountController::class, 'listAddresses']);
        Route::post('addresses', [AccountController::class, 'storeAddress']);
        Route::put('addresses/{id}', [AccountController::class, 'updateAddress']);
        Route::delete('addresses/{id}', [AccountController::class, 'destroyAddress']);
        Route::get('orders', [AccountController::class, 'orders']);
        Route::get('orders/{orderNumber}', [AccountController::class, 'showOrder']);
        Route::post('orders/{orderNumber}/cancel', [AccountController::class, 'cancelOrder'])->middleware('throttle:10,1');
        Route::get('wishlist', [AccountController::class, 'listWishlist']);
        Route::post('wishlist/toggle', [AccountController::class, 'toggleWishlist']);
        Route::get('replenishment-lists', [AccountController::class, 'listReplenishmentLists']);
        Route::post('replenishment-lists', [AccountController::class, 'storeReplenishmentList']);
        Route::post('replenishment-lists/from-cart', [AccountController::class, 'createReplenishmentListFromCart']);
        Route::post('replenishment-lists/sync', [AccountController::class, 'syncReplenishmentList']);
        Route::post('replenishment-lists/items', [AccountController::class, 'addReplenishmentItem']);
        Route::put('replenishment-lists/{id}', [AccountController::class, 'updateReplenishmentList']);
        Route::delete('replenishment-lists/{id}', [AccountController::class, 'destroyReplenishmentList']);
        Route::patch('replenishment-lists/{listId}/items/{itemId}', [AccountController::class, 'updateReplenishmentItem']);
        Route::delete('replenishment-lists/{listId}/items/{itemId}', [AccountController::class, 'removeReplenishmentItem']);
        Route::post('replenishment-lists/{listId}/add-to-cart', [AccountController::class, 'addReplenishmentListToCart']);
        Route::get('restock-alerts', [AccountController::class, 'listRestockAlerts']);
        Route::delete('restock-alerts/{id}', [AccountController::class, 'cancelRestockAlert']);
        Route::get('lgpd/export', [AccountController::class, 'lgpdExport']);
        Route::post('lgpd/request', [AccountController::class, 'lgpdRequest']);
        Route::post('2fa/setup', [AccountController::class, 'setupTwoFactor']);
        Route::post('2fa/confirm', [AccountController::class, 'confirmTwoFactor']);
        Route::post('2fa/disable', [AccountController::class, 'disableTwoFactor']);
    });

    // Admin Backoffice (RBAC Permission Middleware)
    Route::prefix('admin')->group(function (): void {
        Route::get('dashboard', [DashboardController::class, 'summary'])->middleware('permission:dashboard.view');
        Route::get('profit/items', [DashboardController::class, 'profitItems'])->middleware('permission:reports.profit.view');
        Route::get('inventory/valuation', [DashboardController::class, 'inventoryValuation'])->middleware('permission:reports.profit.view');

        // Orders & Fulfillment & Refunds
        Route::get('orders', [AdminOrderController::class, 'index'])->middleware('permission:orders.view');
        Route::get('orders/{id}', [AdminOrderController::class, 'show'])->middleware('permission:orders.view');
        Route::get('orders/{id}/packing-list', [AdminOrderController::class, 'packingList'])->middleware('permission:orders.view');
        Route::patch('orders/{id}/shipping-address', [AdminOrderController::class, 'updateShippingAddress'])->middleware('permission:orders.manage');
        Route::patch('orders/{id}/status', [AdminOrderController::class, 'updateStatus'])->middleware('permission:orders.manage');
        Route::patch('orders/{id}/shipment', [AdminOrderController::class, 'updateShipment'])->middleware('permission:orders.manage');
        Route::post('orders/{id}/refund', [AdminOrderController::class, 'refund'])->middleware('permission:orders.refund');
        Route::post('orders/items/{orderItemId}/backfill-cost', [AdminOrderController::class, 'backfillItemCost'])->middleware('permission:orders.cost.backfill');

        // Catalog & Inventory & CSV & Reviews & Restock
        Route::get('products', [AdminCatalogController::class, 'indexProducts'])->middleware('permission:catalog.view');
        Route::post('products/bulk-rules/preview', [AdminCatalogController::class, 'bulkRulesPreview'])->middleware('permission:catalog.view');
        Route::post('products/bulk-rules/commit', [AdminCatalogController::class, 'bulkRulesCommit'])->middleware('permission:catalog.bulk_edit');
        Route::post('products/bulk-lifecycle/preview', [AdminCatalogController::class, 'bulkLifecyclePreview'])->middleware('permission:catalog.view');
        Route::post('products/bulk-lifecycle/commit', [AdminCatalogController::class, 'bulkLifecycleCommit'])->middleware('permission:catalog.write');
        Route::get('products/bulk-batches/{id}', [AdminCatalogController::class, 'bulkBatchStatus'])->middleware('permission:catalog.view');
        Route::get('products/{id}', [AdminCatalogController::class, 'showProduct'])->middleware('permission:catalog.view');
        Route::get('products/{id}/links', [AdminCatalogController::class, 'productLinks'])->middleware('permission:catalog.view');
        Route::post('products', [AdminCatalogController::class, 'storeProduct'])->middleware('permission:catalog.write');
        Route::post('products/generate-description', [AdminAiAgentController::class, 'generateProductDescription'])->middleware('permission:catalog.write');
        Route::put('products/{id}', [AdminCatalogController::class, 'updateProduct'])->middleware('permission:catalog.write');
        Route::patch('products/{id}/quick-price', [AdminCatalogController::class, 'quickUpdatePrice'])->middleware('permission:catalog.view');
        Route::post('products/{id}/archive', [AdminCatalogController::class, 'archiveProduct'])->middleware('permission:catalog.write');
        Route::post('products/{id}/restore', [AdminCatalogController::class, 'restoreProduct'])->middleware('permission:catalog.write');
        Route::delete('products/{id}', [AdminCatalogController::class, 'destroyProduct'])->middleware('permission:catalog.write');
        Route::delete('products/{id}/force', [AdminCatalogController::class, 'forceDestroyProduct'])->middleware('permission:catalog.write');
        Route::post('variants/{variantId}/stock', [AdminCatalogController::class, 'adjustStock'])->middleware('permission:inventory.manage');
        Route::patch('variants/{variantId}/quick-price', [AdminCatalogController::class, 'quickUpdateVariantPrice'])->middleware('permission:catalog.view');
        Route::post('products/{id}/variants/{variantId}/archive', [AdminCatalogController::class, 'archiveVariant'])->middleware('permission:catalog.write');
        Route::post('products/{id}/variants/{variantId}/restore', [AdminCatalogController::class, 'restoreVariant'])->middleware('permission:catalog.write');
        Route::get('inventory/movements', [AdminCatalogController::class, 'stockMovements'])->middleware('permission:catalog.view');
        Route::get('categories', [AdminCatalogController::class, 'listCategories'])->middleware('permission:catalog.view');
        Route::post('categories', [AdminCatalogController::class, 'storeCategory'])->middleware('permission:catalog.write');
        Route::post('categories/seed-official', [AdminCatalogController::class, 'seedOfficialCategories'])->middleware('permission:catalog.write');
        Route::post('categories/reorder', [AdminCatalogController::class, 'reorderCategories'])->middleware('permission:catalog.write');
        Route::post('categories/bulk', [AdminCatalogController::class, 'bulkCategories'])->middleware('permission:catalog.write');
        Route::get('categories/{id}/dependencies', [AdminCatalogController::class, 'categoryDependencies'])->middleware('permission:catalog.view');
        Route::put('categories/{id}', [AdminCatalogController::class, 'updateCategory'])->middleware('permission:catalog.write');
        Route::put('categories/{id}/attributes', [AdminCatalogController::class, 'syncCategoryAttributes'])->middleware('permission:catalog.write');
        Route::delete('categories/{id}', [AdminCatalogController::class, 'destroyCategory'])->middleware('permission:catalog.write');
        Route::get('brands', [AdminCatalogController::class, 'listBrands'])->middleware('permission:catalog.view');
        Route::post('brands', [AdminCatalogController::class, 'storeBrand'])->middleware('permission:catalog.write');
        Route::put('brands/{id}', [AdminCatalogController::class, 'updateBrand'])->middleware('permission:catalog.write');
        Route::delete('brands/{id}', [AdminCatalogController::class, 'destroyBrand'])->middleware('permission:catalog.write');
        Route::get('attributes', [AdminCatalogController::class, 'listAttributes'])->middleware('permission:catalog.view');
        Route::post('attributes', [AdminCatalogController::class, 'storeAttribute'])->middleware('permission:catalog.write');
        Route::put('attributes/{id}', [AdminCatalogController::class, 'updateAttribute'])->middleware('permission:catalog.write');
        Route::delete('attributes/{id}', [AdminCatalogController::class, 'destroyAttribute'])->middleware('permission:catalog.write');
        Route::get('catalog/export-csv', [AdminCatalogController::class, 'exportCsv'])->middleware('permission:catalog.view');
        Route::post('catalog/import-csv', [AdminCatalogController::class, 'importCsv'])->middleware('permission:catalog.write');
        Route::get('reviews', [AdminCatalogController::class, 'listReviews'])->middleware('permission:marketing.view');
        Route::post('reviews/external', [AdminCatalogController::class, 'storeExternalReview'])->middleware('permission:catalog.write');
        Route::patch('reviews/{id}', [AdminCatalogController::class, 'moderateReview'])->middleware('permission:reviews.moderate');
        Route::get('restock-requests', [AdminCatalogController::class, 'listRestockRequests'])->middleware('permission:catalog.view');
        Route::get('restock-alerts/summary', [AdminCatalogController::class, 'restockSummary'])->middleware('permission:catalog.view');
        Route::get('replenishment/insights', [AdminCatalogController::class, 'replenishmentInsights'])->middleware('permission:catalog.view');

        // Content, Media, Banners, Home Builder, CMS Pages
        Route::get('media', [AdminContentController::class, 'listMedia'])->middleware('permission:content.view');
        Route::post('media/upload', [AdminContentController::class, 'uploadMedia'])->middleware('permission:banners.write|catalog.write');
        Route::get('banners', [AdminContentController::class, 'listBanners'])->middleware('permission:content.view');
        Route::post('banners', [AdminContentController::class, 'storeBanner'])->middleware('permission:banners.write');
        Route::put('banners/{id}', [AdminContentController::class, 'updateBanner'])->middleware('permission:banners.write');
        Route::delete('banners/{id}', [AdminContentController::class, 'destroyBanner'])->middleware('permission:banners.write');
        Route::post('banners/reorder', [AdminContentController::class, 'reorderBanners'])->middleware('permission:banners.write');
        Route::get('home-sections', [AdminContentController::class, 'listHomeSections'])->middleware('permission:content.view');
        Route::post('home-sections', [AdminContentController::class, 'storeHomeSection'])->middleware('permission:content.write');
        Route::put('home-sections', [AdminContentController::class, 'updateHomeSections'])->middleware('permission:content.write');
        Route::delete('home-sections/{id}', [AdminContentController::class, 'destroyHomeSection'])->middleware('permission:content.write');
        Route::get('pages', [AdminContentController::class, 'listPages'])->middleware('permission:content.view');
        Route::post('pages', [AdminContentController::class, 'storePage'])->middleware('permission:content.write');
        Route::put('pages/{id}', [AdminContentController::class, 'updatePage'])->middleware('permission:content.write');

        // Marketing: Coupons, Promotions, Newsletter
        Route::get('coupons', [AdminMarketingController::class, 'listCoupons'])->middleware('permission:marketing.view');
        Route::post('coupons', [AdminMarketingController::class, 'storeCoupon'])->middleware('permission:marketing.write');
        Route::put('coupons/{id}', [AdminMarketingController::class, 'updateCoupon'])->middleware('permission:marketing.write');
        Route::delete('coupons/{id}', [AdminMarketingController::class, 'destroyCoupon'])->middleware('permission:marketing.write');
        Route::get('promotions', [AdminMarketingController::class, 'listPromotions'])->middleware('permission:marketing.view');
        Route::post('promotions', [AdminMarketingController::class, 'storePromotion'])->middleware('permission:marketing.write');
        Route::put('promotions/{id}', [AdminMarketingController::class, 'updatePromotion'])->middleware('permission:marketing.write');
        Route::delete('promotions/{id}', [AdminMarketingController::class, 'destroyPromotion'])->middleware('permission:marketing.write');
        Route::get('newsletter', [AdminMarketingController::class, 'listNewsletter'])->middleware('permission:marketing.view');
        Route::get('newsletter/export', [AdminMarketingController::class, 'exportNewsletter'])->middleware('permission:marketing.view');

        // Shipping
        Route::get('shipping/rules', [AdminShippingController::class, 'listRules'])->middleware('permission:shipping.view');
        Route::get('shipping/regional-free-rules', [AdminShippingController::class, 'getRegionalRules'])->middleware('permission:shipping.view');
        Route::put('shipping/regional-free-rules', [AdminShippingController::class, 'updateRegionalRules'])->middleware('permission:shipping.write');
        Route::post('shipping/rules', [AdminShippingController::class, 'storeRule'])->middleware('permission:shipping.write');
        Route::put('shipping/rules/{id}', [AdminShippingController::class, 'updateRule'])->middleware('permission:shipping.write');
        Route::delete('shipping/rules/{id}', [AdminShippingController::class, 'destroyRule'])->middleware('permission:shipping.write');
        Route::get('shipping/quotes', [AdminShippingController::class, 'recentQuotes'])->middleware('permission:shipping.view');

        // Payments & Webhooks & Reconciliation
        Route::get('payments', [AdminPaymentsController::class, 'index'])->middleware('permission:payments.view');
        Route::get('payments/events', [AdminPaymentsController::class, 'events'])->middleware('permission:payments.view');
        Route::post('payments/{id}/reconcile', [AdminPaymentsController::class, 'reconcile'])->middleware('permission:payments.reconcile');

        // Reports
        Route::get('reports', [AdminReportsController::class, 'index'])->middleware('permission:reports.view');
        Route::get('reports/export-csv', [AdminReportsController::class, 'exportCsv'])->middleware('permission:reports.export');
        Route::get('reports/profit-export-csv', [AdminReportsController::class, 'exportProfitCsv'])->middleware('permission:reports.profit.export');

        // Store Settings & Integrations
        Route::get('settings/store', [AdminSettingsController::class, 'showStore'])->middleware('permission:settings.view');
        Route::put('settings/store', [AdminSettingsController::class, 'updateStore'])->middleware('permission:settings.write');
        Route::get('settings/integrations', [AdminSettingsController::class, 'listIntegrations'])->middleware('permission:integrations.view');
        Route::put('settings/integrations/{provider}', [AdminSettingsController::class, 'updateIntegration'])->middleware('permission:integrations.write');
        Route::post('settings/integrations/{provider}/healthcheck', [AdminSettingsController::class, 'healthcheckIntegration'])->middleware('permission:integrations.view');

        // Customers, LGPD, Team, Audit, System Health & Backups
        Route::get('customers', [AdminUsersController::class, 'listCustomers'])->middleware('permission:customers.view');
        Route::get('customers/{id}', [AdminUsersController::class, 'showCustomer'])->middleware('permission:customers.view');
        Route::post('users', [AdminUsersController::class, 'storeUser'])->middleware('permission:customers.manage');
        Route::put('users/{id}', [AdminUsersController::class, 'updateUser'])->middleware('permission:customers.manage');
        Route::delete('users/{id}', [AdminUsersController::class, 'destroyUser'])->middleware('permission:customers.manage');
        Route::get('lgpd-requests', [AdminUsersController::class, 'listLgpdRequests'])->middleware('permission:customers.view');
        Route::patch('lgpd-requests/{id}', [AdminUsersController::class, 'processLgpdRequest'])->middleware('permission:lgpd.manage');
        Route::get('team', [AdminUsersController::class, 'listTeam'])->middleware('permission:team.view');
        Route::patch('team/{userId}/role', [AdminUsersController::class, 'assignRole'])->middleware('permission:team.manage');
        Route::get('audit-logs', [AdminUsersController::class, 'listAuditLogs'])->middleware('permission:audit.view');
        Route::get('system/health', [AdminUsersController::class, 'systemHealth'])->middleware('permission:monitoring.view');
        Route::post('system/backup', [AdminUsersController::class, 'triggerBackup'])->middleware('permission:monitoring.view');

        // Modulo 01: Trabalho de Hoje & Tarefas Operacionais
        Route::get('today-work', [AdminOperationsController::class, 'todayWork'])->middleware('permission:dashboard.view');
        Route::post('operational-tasks', [AdminOperationsController::class, 'storeTask'])->middleware('permission:dashboard.view');
        Route::patch('operational-tasks/{id}', [AdminOperationsController::class, 'updateTask'])->middleware('permission:dashboard.view');
        Route::get('team-members', [AdminOperationsController::class, 'teamMembers'])->middleware('permission:dashboard.view');

        // Modulo 02: Pedidos Assistidos
        Route::get('assisted-orders', [AdminOperationsController::class, 'listAssistedOrders'])->middleware('permission:orders.view');
        Route::get('assisted-orders/catalog-search', [AdminOperationsController::class, 'catalogSearchAssisted'])->middleware('permission:orders.view');
        Route::get('assisted-orders/customer-search', [AdminOperationsController::class, 'customerSearchAssisted'])->middleware('permission:customers.view');
        Route::post('assisted-orders', [AdminOperationsController::class, 'storeAssistedOrder'])->middleware('permission:orders.assisted');
        Route::get('assisted-orders/{id}', [AdminOperationsController::class, 'showAssistedOrder'])->middleware('permission:orders.view');
        Route::put('assisted-orders/{id}', [AdminOperationsController::class, 'updateAssistedOrder'])->middleware('permission:orders.assisted');
        Route::post('assisted-orders/{id}/generate-link', [AdminOperationsController::class, 'generateAssistedOrderLink'])->middleware('permission:orders.assisted');
        Route::post('assisted-orders/{id}/cancel', [AdminOperationsController::class, 'cancelAssistedOrder'])->middleware('permission:orders.assisted');

        // Modulo 03: Edicao em Massa de Produtos & Variacoes
        Route::get('variants/bulk', [AdminOperationsController::class, 'listBulkVariants'])->middleware('permission:catalog.view');
        Route::post('variants/bulk-parse', [AdminOperationsController::class, 'parseBulkVariants'])->middleware('permission:catalog.view');
        Route::post('variants/bulk-preview', [AdminOperationsController::class, 'previewBulkVariants'])->middleware('permission:catalog.view');
        Route::post('variants/bulk-commit', [AdminOperationsController::class, 'commitBulkVariants'])->middleware('permission:catalog.bulk_edit');
        Route::get('variants/bulk-batches', [AdminOperationsController::class, 'bulkEditBatches'])->middleware('permission:catalog.view');

        // Modulo 04: Fornecedores, Recebimentos & Lotes
        Route::get('suppliers', [AdminOperationsController::class, 'listSuppliers'])->middleware('permission:catalog.view');
        Route::post('suppliers', [AdminOperationsController::class, 'storeSupplier'])->middleware('permission:inventory.receive');
        Route::get('goods-receipts', [AdminOperationsController::class, 'listGoodsReceipts'])->middleware('permission:catalog.view');
        Route::post('goods-receipts', [AdminOperationsController::class, 'storeGoodsReceipt'])->middleware('permission:inventory.receive');
        Route::get('goods-receipts/{id}', [AdminOperationsController::class, 'showGoodsReceipt'])->middleware('permission:catalog.view');
        Route::put('goods-receipts/{id}', [AdminOperationsController::class, 'updateGoodsReceipt'])->middleware('permission:inventory.receive');
        Route::post('goods-receipts/{id}/confirm', [AdminOperationsController::class, 'confirmGoodsReceipt'])->middleware('permission:inventory.manage');
        Route::get('inventory/lots', [AdminOperationsController::class, 'lotExpirySummary'])->middleware('permission:catalog.view');

        // Modulo 05: Ocorrencias & Pos-Venda em Pedidos
        Route::post('orders/{id}/flag-issue', [AdminOperationsController::class, 'flagOrderIssue'])->middleware('permission:orders.occurrences');
        Route::post('orders/{id}/occurrences', [AdminOperationsController::class, 'createOccurrence'])->middleware('permission:orders.occurrences');
        Route::patch('occurrences/{occurrenceId}', [AdminOperationsController::class, 'updateOccurrence'])->middleware('permission:orders.occurrences');
        Route::post('orders/{id}/notes', [AdminOperationsController::class, 'addOrderNote'])->middleware('permission:orders.view');

        // Modulo 06: Relatorios Inteligentes & Sinonimos
        Route::get('reports/zero-result-searches', [AdminOperationsController::class, 'zeroResultSearches'])->middleware('permission:reports.view');
        Route::get('reports/demanded-shades', [AdminOperationsController::class, 'demandedShadesReport'])->middleware('permission:reports.view');
        Route::get('reports/bought-together', [AdminOperationsController::class, 'boughtTogetherReport'])->middleware('permission:reports.view');
        Route::get('reports/export-intelligent-csv', [AdminOperationsController::class, 'exportIntelligentReportCsv'])->middleware('permission:reports.export');
        Route::get('search-synonyms', [AdminOperationsController::class, 'listSearchSynonyms'])->middleware('permission:reports.view');
        Route::post('search-synonyms', [AdminOperationsController::class, 'storeSearchSynonym'])->middleware('permission:reports.view');
        Route::delete('search-synonyms/{id}', [AdminOperationsController::class, 'destroySearchSynonym'])->middleware('permission:reports.view');

        // Central de Agentes de Inteligencia Artificial
        Route::prefix('ai')->group(function (): void {
            Route::get('overview', [AdminAiAgentController::class, 'overview'])->middleware('permission:ai.view');
            Route::get('executions', [AdminAiAgentController::class, 'executions'])->middleware('permission:ai.view');
            Route::get('executions/{id}', [AdminAiAgentController::class, 'showExecution'])->middleware('permission:ai.view');
            Route::get('logs', [AdminAiAgentController::class, 'logs'])->middleware('permission:ai.logs');

            Route::get('settings', [AdminAiAgentController::class, 'getSettings'])->middleware('permission:ai.settings');
            Route::put('settings', [AdminAiAgentController::class, 'updateSettings'])->middleware('permission:ai.settings');
            Route::post('settings/test-connection', [AdminAiAgentController::class, 'testConnection'])->middleware('permission:ai.settings');
            Route::post('settings/test-search-connection', [AdminAiAgentController::class, 'testSearchConnection'])->middleware('permission:ai.settings');

            // Agente 01: Atendimento em Pedidos
            Route::post('support/orders/{orderId}/reply', [AdminAiAgentController::class, 'prepareOrderReply'])->middleware('permission:ai.support');
            Route::post('support/orders/{orderId}/summarize', [AdminAiAgentController::class, 'summarizeOrderHistory'])->middleware('permission:ai.support');
            Route::post('support/orders/{orderId}/analyze-occurrences', [AdminAiAgentController::class, 'analyzeOrderOccurrences'])->middleware('permission:ai.support');

            // Agente 02: Cadastro Inteligente de Produtos
            Route::post('catalog/lookup', [AdminAiAgentController::class, 'lookupProductByName'])->middleware('permission:ai.catalog');
            Route::post('catalog/import-image', [AdminAiAgentController::class, 'importCatalogImageFromUrl'])->middleware('permission:ai.catalog');
            Route::post('catalog/upload-image', [AdminAiAgentController::class, 'uploadCatalogImageFile'])->middleware('permission:ai.catalog');
            Route::post('catalog/check-duplicates', [AdminAiAgentController::class, 'checkCatalogDuplicates'])->middleware('permission:ai.catalog');
            Route::get('catalog/imports', [AdminAiAgentController::class, 'listCatalogImports'])->middleware('permission:ai.catalog');
            Route::post('catalog/imports', [AdminAiAgentController::class, 'createCatalogImport'])->middleware('permission:ai.catalog');
            Route::get('catalog/imports/{id}', [AdminAiAgentController::class, 'showCatalogImport'])->middleware('permission:ai.catalog');
            Route::patch('catalog/imports/{id}/items/bulk', [AdminAiAgentController::class, 'bulkUpdateCatalogImportItems'])->middleware('permission:ai.catalog');
            Route::patch('catalog/imports/{id}/items/{itemId}', [AdminAiAgentController::class, 'updateCatalogImportItem'])->middleware('permission:ai.catalog');
            Route::post('catalog/imports/{id}/approve', [AdminAiAgentController::class, 'approveCatalogImport'])->middleware('permission:ai.catalog.approve');
            Route::post('catalog/imports/{id}/discard', [AdminAiAgentController::class, 'discardCatalogImport'])->middleware('permission:ai.catalog');
            Route::post('catalog/products/{productId}/assist', [AdminAiAgentController::class, 'assistSingleProduct'])->middleware('permission:ai.catalog');
            Route::post('catalog/generate-description', [AdminAiAgentController::class, 'generateProductDescription'])->middleware('permission:ai.catalog');

            // Agente 03: Reposicao Inteligente
            Route::get('replenishment/latest', [AdminAiAgentController::class, 'latestReplenishment'])->middleware('permission:ai.replenishment');
            Route::post('replenishment/analyze', [AdminAiAgentController::class, 'analyzeReplenishment'])->middleware('permission:ai.replenishment');
            Route::get('replenishment/suggestions/{suggestionId}/explain', [AdminAiAgentController::class, 'explainReplenishmentSuggestion'])->middleware('permission:ai.replenishment');
            Route::post('replenishment/analyses/{analysisId}/save-plan', [AdminAiAgentController::class, 'saveReplenishmentPlan'])->middleware('permission:ai.replenishment');
            Route::get('replenishment/analyses/{analysisId}/export-csv', [AdminAiAgentController::class, 'exportReplenishmentCsv'])->middleware('permission:ai.replenishment');

            // Agente 04: Marketing & Growth
            Route::prefix('marketing')->group(function (): void {
                Route::get('overview', [AdminAiMarketingAgentController::class, 'overview'])->middleware('permission:ai.view');
                Route::get('chat', [AdminAiMarketingAgentController::class, 'getChatHistory'])->middleware('permission:ai.view');
                Route::post('chat', [AdminAiMarketingAgentController::class, 'chat'])->middleware('permission:ai.view');
                Route::get('seo/audit', [AdminAiMarketingAgentController::class, 'seoAudit'])->middleware('permission:ai.view');
                Route::post('seo/audit/run', [AdminAiMarketingAgentController::class, 'runSeoAudit'])->middleware('permission:ai.view');
                Route::post('seo/optimize-metadata', [AdminAiMarketingAgentController::class, 'optimizeMetadata'])->middleware('permission:ai.view');
                Route::post('seo/apply-metadata', [AdminAiMarketingAgentController::class, 'applyMetadata'])->middleware('permission:ai.view');
                Route::post('seo/batch-apply-metadata', [AdminAiMarketingAgentController::class, 'batchApplyMetadata'])->middleware('permission:ai.view');
                Route::get('google-ads/campaigns', [AdminAiMarketingAgentController::class, 'googleAdsCampaigns'])->middleware('permission:ai.view');
                Route::post('google-ads/negative-keyword', [AdminAiMarketingAgentController::class, 'addNegativeKeyword'])->middleware('permission:ai.view');
                Route::post('google-ads/draft-campaign', [AdminAiMarketingAgentController::class, 'draftGoogleAdsCampaign'])->middleware('permission:ai.view');
                Route::get('ga4/insights', [AdminAiMarketingAgentController::class, 'ga4Insights'])->middleware('permission:ai.view');
                Route::get('shopping/feed', [AdminAiMarketingAgentController::class, 'shoppingFeed'])->middleware('permission:ai.view');
                Route::post('shopping/feed/refresh', [AdminAiMarketingAgentController::class, 'refreshShoppingFeed'])->middleware('permission:ai.view');
                Route::get('meta-ads/campaigns', [AdminAiMarketingAgentController::class, 'metaAdsCampaigns'])->middleware('permission:ai.view');
                Route::get('opportunities', [AdminAiMarketingAgentController::class, 'opportunities'])->middleware('permission:ai.view');
                Route::patch('opportunities/{id}/status', [AdminAiMarketingAgentController::class, 'updateOpportunityStatus'])->middleware('permission:ai.view');
                Route::post('opportunities/scan', [AdminAiMarketingAgentController::class, 'scanOpportunities'])->middleware('permission:ai.view');
                Route::get('recommendations', [AdminAiMarketingAgentController::class, 'recommendations'])->middleware('permission:ai.view');
                Route::post('recommendations/{id}/apply', [AdminAiMarketingAgentController::class, 'applyRecommendation'])->middleware('permission:ai.view');
                Route::post('recommendations/{id}/discard', [AdminAiMarketingAgentController::class, 'discardRecommendation'])->middleware('permission:ai.view');
                Route::get('automations', [AdminAiMarketingAgentController::class, 'automations'])->middleware('permission:ai.view');
                Route::post('automations', [AdminAiMarketingAgentController::class, 'saveAutomation'])->middleware('permission:ai.view');
                Route::patch('automations/{id}/toggle', [AdminAiMarketingAgentController::class, 'toggleAutomation'])->middleware('permission:ai.view');
                Route::post('automations/{id}/run', [AdminAiMarketingAgentController::class, 'runAutomationNow'])->middleware('permission:ai.view');
                Route::get('reports', [AdminAiMarketingAgentController::class, 'reports'])->middleware('permission:ai.view');
                Route::post('reports/generate', [AdminAiMarketingAgentController::class, 'generateReport'])->middleware('permission:ai.view');
                Route::get('reports/{id}/export', [AdminAiMarketingAgentController::class, 'exportReport'])->middleware('permission:ai.view');
                Route::get('integrations', [AdminAiMarketingAgentController::class, 'integrations'])->middleware('permission:ai.view');
                Route::post('integrations/connect', [AdminAiMarketingAgentController::class, 'saveIntegration'])->middleware('permission:ai.view');
                Route::post('integrations/test', [AdminAiMarketingAgentController::class, 'testIntegration'])->middleware('permission:ai.view');
            });
        });

        // Área "Marketing e Google" (restrita a usuários autorizados com marketing.view)
        Route::prefix('marketing-google')->middleware('permission:marketing.view')->group(function (): void {
            Route::get('overview', [AdminAiMarketingAgentController::class, 'overview']);
            Route::get('chat', [AdminAiMarketingAgentController::class, 'getChatHistory']);
            Route::post('chat', [AdminAiMarketingAgentController::class, 'chat']);
            Route::get('ga4/insights', [AdminAiMarketingAgentController::class, 'ga4Insights']);
            Route::get('google-ads/campaigns', [AdminAiMarketingAgentController::class, 'googleAdsCampaigns']);
            Route::post('google-ads/negative-keyword', [AdminAiMarketingAgentController::class, 'addNegativeKeyword'])->middleware('permission:marketing.write');
            Route::post('google-ads/draft-campaign', [AdminAiMarketingAgentController::class, 'draftGoogleAdsCampaign'])->middleware('permission:marketing.write');
            Route::get('shopping/feed', [AdminAiMarketingAgentController::class, 'shoppingFeed']);
            Route::post('shopping/feed/refresh', [AdminAiMarketingAgentController::class, 'refreshShoppingFeed']);
            Route::get('integrations', [AdminAiMarketingAgentController::class, 'integrations']);
            Route::post('integrations/connect', [AdminAiMarketingAgentController::class, 'saveIntegration'])->middleware('permission:marketing.write');
            Route::post('integrations/test', [AdminAiMarketingAgentController::class, 'testIntegration']);
        });

        // Central de Atacado (Wholesale System)
        Route::prefix('wholesale')->group(function (): void {
            Route::get('overview', [AdminWholesaleController::class, 'overview'])->middleware('permission:wholesale.view');
            Route::get('rules', [AdminWholesaleController::class, 'rules'])->middleware('permission:wholesale.view');
            Route::post('rules', [AdminWholesaleController::class, 'storeRule'])->middleware('permission:wholesale.manage');
            Route::put('rules/{rule}', [AdminWholesaleController::class, 'updateRule'])->middleware('permission:wholesale.manage');
            Route::patch('rules/{rule}/status', [AdminWholesaleController::class, 'updateRuleStatus'])->middleware('permission:wholesale.manage');
            Route::delete('rules/{rule}', [AdminWholesaleController::class, 'destroyRule'])->middleware('permission:wholesale.manage');

            Route::get('bulk-grid', [AdminWholesaleController::class, 'bulkGrid'])->middleware('permission:wholesale.pricing');
            Route::post('bulk-parse', [AdminWholesaleController::class, 'parseExcelPaste'])->middleware('permission:wholesale.pricing');
            Route::post('bulk-preview', [AdminWholesaleController::class, 'previewBulk'])->middleware('permission:wholesale.pricing');
            Route::post('bulk-apply', [AdminWholesaleController::class, 'applyBulk'])->middleware('permission:wholesale.pricing');

            Route::get('groups', [AdminWholesaleController::class, 'groups'])->middleware('permission:wholesale.view');
            Route::post('groups', [AdminWholesaleController::class, 'storeGroup'])->middleware('permission:wholesale.manage');
            Route::put('groups/{group}', [AdminWholesaleController::class, 'updateGroup'])->middleware('permission:wholesale.manage');
            Route::delete('groups/{group}', [AdminWholesaleController::class, 'destroyGroup'])->middleware('permission:wholesale.manage');

            Route::get('resellers', [AdminWholesaleController::class, 'resellers'])->middleware('permission:wholesale.resellers');
            Route::get('customer-groups', [AdminWholesaleController::class, 'customerGroups'])->middleware('permission:wholesale.resellers');
            Route::post('resellers/{member}/approve', [AdminWholesaleController::class, 'approveReseller'])->middleware('permission:wholesale.resellers');
            Route::post('resellers/{member}/reject', [AdminWholesaleController::class, 'rejectReseller'])->middleware('permission:wholesale.resellers');
            Route::post('resellers/{member}/suspend', [AdminWholesaleController::class, 'suspendReseller'])->middleware('permission:wholesale.resellers');
            Route::post('resellers/{member}/reactivate', [AdminWholesaleController::class, 'reactivateReseller'])->middleware('permission:wholesale.resellers');

            Route::post('simulate', [AdminWholesaleController::class, 'simulate'])->middleware('permission:wholesale.view');
            Route::get('reports', [AdminWholesaleController::class, 'reports'])->middleware('permission:wholesale.reports');
            Route::get('reports/export-csv', [AdminWholesaleController::class, 'exportCsv'])->middleware('permission:wholesale.reports');
        });
    });
});
