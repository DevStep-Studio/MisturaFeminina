<?php

use App\Http\Controllers\Api\V1\AccountController;
use App\Http\Controllers\Api\V1\Admin\AdminCatalogController;
use App\Http\Controllers\Api\V1\Admin\AdminContentController;
use App\Http\Controllers\Api\V1\Admin\AdminMarketingController;
use App\Http\Controllers\Api\V1\Admin\AdminOrderController;
use App\Http\Controllers\Api\V1\Admin\AdminPaymentsController;
use App\Http\Controllers\Api\V1\Admin\AdminReportsController;
use App\Http\Controllers\Api\V1\Admin\AdminSettingsController;
use App\Http\Controllers\Api\V1\Admin\AdminShippingController;
use App\Http\Controllers\Api\V1\Admin\AdminUsersController;
use App\Http\Controllers\Api\V1\Admin\DashboardController;
use App\Http\Controllers\Api\V1\CartController;
use App\Http\Controllers\Api\V1\CatalogController;
use App\Http\Controllers\Api\V1\CheckoutController;
use App\Http\Controllers\Api\V1\ProjectController;
use App\Http\Controllers\Api\V1\StorefrontController;
use App\Http\Controllers\Api\V1\WebhookController;
use App\Http\Resources\Api\V1\UserResource;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// Public Storefront & Catalog
Route::prefix('storefront')->group(function (): void {
    Route::get('bootstrap', [StorefrontController::class, 'bootstrap']);
    Route::get('home', [StorefrontController::class, 'home']);
    Route::get('pages/{slug}', [StorefrontController::class, 'page']);
    Route::post('newsletter/subscribe', [StorefrontController::class, 'subscribeNewsletter']);
    Route::get('newsletter/unsubscribe/{token}', [StorefrontController::class, 'unsubscribeNewsletter']);
    Route::post('contact', [StorefrontController::class, 'contact']);
    Route::post('events', [StorefrontController::class, 'trackEvent']);
});

Route::prefix('catalog')->group(function (): void {
    Route::get('categories', [CatalogController::class, 'categories']);
    Route::get('categories/{slug}', [CatalogController::class, 'categoryShow']);
    Route::get('brands', [CatalogController::class, 'brands']);
    Route::get('brands/{slug}', [CatalogController::class, 'brandShow']);
    Route::get('products', [CatalogController::class, 'products']);
    Route::get('search', [CatalogController::class, 'search']);
    Route::get('products/{slug}', [CatalogController::class, 'show']);
    Route::post('products/{slug}/shipping-quote', [CatalogController::class, 'quoteProductShipping']);
    Route::post('products/{slug}/restock-alert', [CatalogController::class, 'restockAlert']);
    Route::post('products/{slug}/reviews', [CatalogController::class, 'storeReview']);
});

// Cart (Guest X-Cart-Token / Cookie or Authenticated User)
Route::prefix('cart')->group(function (): void {
    Route::get('/', [CartController::class, 'show']);
    Route::post('items', [CartController::class, 'addItem']);
    Route::patch('items/{itemId}', [CartController::class, 'updateItem']);
    Route::delete('items/{itemId}', [CartController::class, 'removeItem']);
    Route::post('coupon', [CartController::class, 'applyCoupon']);
    Route::delete('coupon', [CartController::class, 'removeCoupon']);
    Route::post('shipping/quote', [CartController::class, 'quoteShipping']);
    Route::post('shipping/select', [CartController::class, 'selectShipping']);
});

// Checkout & Order Tracking
Route::post('checkout', [CheckoutController::class, 'store']);
Route::get('orders/track/{publicToken}', [CheckoutController::class, 'trackByToken']);
Route::post('orders/track-lookup', [CheckoutController::class, 'trackLookup']);
Route::post('orders/{publicToken}/retry-payment', [CheckoutController::class, 'retryPayment']);

// Payment Webhooks & Sandbox Simulator
Route::post('webhooks/mercadopago', [WebhookController::class, 'mercadoPago']);
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
        Route::get('wishlist', [AccountController::class, 'listWishlist']);
        Route::post('wishlist/toggle', [AccountController::class, 'toggleWishlist']);
        Route::get('lgpd/export', [AccountController::class, 'lgpdExport']);
        Route::post('lgpd/request', [AccountController::class, 'lgpdRequest']);
        Route::post('2fa/setup', [AccountController::class, 'setupTwoFactor']);
        Route::post('2fa/confirm', [AccountController::class, 'confirmTwoFactor']);
        Route::post('2fa/disable', [AccountController::class, 'disableTwoFactor']);
    });

    // Admin Backoffice (RBAC Permission Middleware)
    Route::prefix('admin')->group(function (): void {
        Route::get('dashboard', [DashboardController::class, 'summary'])->middleware('permission:dashboard.view');

        // Orders & Fulfillment & Refunds
        Route::get('orders', [AdminOrderController::class, 'index'])->middleware('permission:orders.view');
        Route::get('orders/{id}', [AdminOrderController::class, 'show'])->middleware('permission:orders.view');
        Route::get('orders/{id}/packing-list', [AdminOrderController::class, 'packingList'])->middleware('permission:orders.view');
        Route::patch('orders/{id}/status', [AdminOrderController::class, 'updateStatus'])->middleware('permission:orders.manage');
        Route::patch('orders/{id}/shipment', [AdminOrderController::class, 'updateShipment'])->middleware('permission:orders.manage');
        Route::post('orders/{id}/refund', [AdminOrderController::class, 'refund'])->middleware('permission:orders.refund');

        // Catalog & Inventory & CSV & Reviews & Restock
        Route::get('products', [AdminCatalogController::class, 'indexProducts'])->middleware('permission:catalog.view');
        Route::get('products/{id}', [AdminCatalogController::class, 'showProduct'])->middleware('permission:catalog.view');
        Route::post('products', [AdminCatalogController::class, 'storeProduct'])->middleware('permission:catalog.write');
        Route::put('products/{id}', [AdminCatalogController::class, 'updateProduct'])->middleware('permission:catalog.write');
        Route::delete('products/{id}', [AdminCatalogController::class, 'destroyProduct'])->middleware('permission:catalog.write');
        Route::post('variants/{variantId}/stock', [AdminCatalogController::class, 'adjustStock'])->middleware('permission:inventory.manage');
        Route::get('inventory/movements', [AdminCatalogController::class, 'stockMovements'])->middleware('permission:catalog.view');
        Route::get('categories', [AdminCatalogController::class, 'listCategories'])->middleware('permission:catalog.view');
        Route::post('categories', [AdminCatalogController::class, 'storeCategory'])->middleware('permission:catalog.write');
        Route::put('categories/{id}', [AdminCatalogController::class, 'updateCategory'])->middleware('permission:catalog.write');
        Route::delete('categories/{id}', [AdminCatalogController::class, 'destroyCategory'])->middleware('permission:catalog.write');
        Route::get('brands', [AdminCatalogController::class, 'listBrands'])->middleware('permission:catalog.view');
        Route::post('brands', [AdminCatalogController::class, 'storeBrand'])->middleware('permission:catalog.write');
        Route::put('brands/{id}', [AdminCatalogController::class, 'updateBrand'])->middleware('permission:catalog.write');
        Route::get('attributes', [AdminCatalogController::class, 'listAttributes'])->middleware('permission:catalog.view');
        Route::get('catalog/export-csv', [AdminCatalogController::class, 'exportCsv'])->middleware('permission:catalog.view');
        Route::post('catalog/import-csv', [AdminCatalogController::class, 'importCsv'])->middleware('permission:catalog.write');
        Route::get('reviews', [AdminCatalogController::class, 'listReviews'])->middleware('permission:marketing.view');
        Route::patch('reviews/{id}', [AdminCatalogController::class, 'moderateReview'])->middleware('permission:reviews.moderate');
        Route::get('restock-requests', [AdminCatalogController::class, 'listRestockRequests'])->middleware('permission:catalog.view');

        // Content, Media, Banners, Home Builder, CMS Pages
        Route::get('media', [AdminContentController::class, 'listMedia'])->middleware('permission:content.view');
        Route::post('media/upload', [AdminContentController::class, 'uploadMedia'])->middleware('permission:banners.write');
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
    });
});
