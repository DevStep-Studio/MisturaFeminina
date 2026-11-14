<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('brands', function (Blueprint $table): void {
            $table->id();
            $table->string('name', 150);
            $table->string('slug', 160)->unique();
            $table->text('description')->nullable();
            $table->string('logo_path', 500)->nullable();
            $table->boolean('is_featured')->default(false);
            $table->boolean('is_active')->default(true)->index();
            $table->string('seo_title', 180)->nullable();
            $table->string('seo_description', 320)->nullable();
            $table->timestamps();
        });

        Schema::create('categories', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('parent_id')->nullable()->constrained('categories')->nullOnDelete();
            $table->string('name', 150);
            $table->string('slug', 160)->unique();
            $table->text('description')->nullable();
            $table->string('image_path', 500)->nullable();
            $table->string('banner_desktop_path', 500)->nullable();
            $table->string('banner_mobile_path', 500)->nullable();
            $table->string('icon', 60)->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('show_in_menu')->default(true);
            $table->boolean('is_active')->default(true)->index();
            $table->string('seo_title', 180)->nullable();
            $table->string('seo_description', 320)->nullable();
            $table->timestamps();
            $table->index(['parent_id', 'sort_order']);
        });

        Schema::create('attributes', function (Blueprint $table): void {
            $table->id();
            $table->string('name', 100);
            $table->string('slug', 110)->unique();
            $table->string('display_type', 30)->default('pill');
            $table->timestamps();
        });

        Schema::create('attribute_values', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('attribute_id')->constrained()->cascadeOnDelete();
            $table->string('value', 100);
            $table->string('slug', 110);
            $table->string('color_hex', 16)->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
            $table->unique(['attribute_id', 'slug']);
        });

        Schema::create('products', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('brand_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name', 200);
            $table->string('slug', 220)->unique();
            $table->string('sku', 80)->unique();
            $table->string('gtin', 40)->nullable()->index();
            $table->string('manufacturer', 150)->nullable();
            $table->string('short_description', 500)->nullable();
            $table->longText('description')->nullable();
            $table->text('ingredients')->nullable();
            $table->text('usage_instructions')->nullable();
            $table->string('product_type', 20)->default('simple')->index();
            $table->unsignedBigInteger('cost_cents')->default(0);
            $table->unsignedBigInteger('price_cents');
            $table->unsignedBigInteger('promo_price_cents')->nullable();
            $table->timestamp('promo_starts_at')->nullable();
            $table->timestamp('promo_ends_at')->nullable();
            $table->string('unit_label', 40)->nullable();
            $table->unsignedInteger('unit_quantity')->nullable();
            $table->unsignedInteger('weight_grams')->default(200);
            $table->unsignedInteger('width_cm')->default(11);
            $table->unsignedInteger('height_cm')->default(6);
            $table->unsignedInteger('length_cm')->default(16);
            $table->string('video_url', 500)->nullable();
            $table->json('tags')->nullable();
            $table->boolean('is_active')->default(true)->index();
            $table->boolean('is_featured')->default(false)->index();
            $table->boolean('is_new_arrival')->default(false)->index();
            $table->boolean('is_best_seller')->default(false)->index();
            $table->boolean('wholesale_enabled')->default(false);
            $table->json('wholesale_tiers')->nullable();
            $table->unsignedInteger('sales_count')->default(0);
            $table->string('seo_title', 180)->nullable();
            $table->string('seo_description', 320)->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->index('name');
        });

        Schema::create('category_product', function (Blueprint $table): void {
            $table->foreignId('category_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->primary(['category_id', 'product_id']);
        });

        Schema::create('product_images', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->string('disk', 40)->default('public');
            $table->string('path', 500);
            $table->string('alt_text', 255)->nullable();
            $table->string('focal_point', 30)->default('center');
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_primary')->default(false);
            $table->timestamps();
            $table->index(['product_id', 'sort_order']);
        });

        Schema::create('product_variants', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->string('sku', 80)->unique();
            $table->string('gtin', 40)->nullable();
            $table->string('name', 160);
            $table->unsignedBigInteger('price_cents');
            $table->unsignedBigInteger('promo_price_cents')->nullable();
            $table->integer('stock_qty')->default(0);
            $table->integer('reserved_qty')->default(0);
            $table->integer('min_stock_alert')->default(5);
            $table->unsignedInteger('weight_grams')->nullable();
            $table->unsignedInteger('width_cm')->nullable();
            $table->unsignedInteger('height_cm')->nullable();
            $table->unsignedInteger('length_cm')->nullable();
            $table->foreignId('image_id')->nullable()->constrained('product_images')->nullOnDelete();
            $table->boolean('is_default')->default(false);
            $table->boolean('is_active')->default(true)->index();
            $table->timestamps();
            $table->index(['product_id', 'is_active']);
        });

        Schema::create('variant_attribute_values', function (Blueprint $table): void {
            $table->foreignId('product_variant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('attribute_value_id')->constrained()->cascadeOnDelete();
            $table->primary(['product_variant_id', 'attribute_value_id']);
        });

        Schema::create('product_kit_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('kit_product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('component_product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('component_variant_id')->constrained('product_variants')->cascadeOnDelete();
            $table->unsignedInteger('quantity')->default(1);
            $table->timestamps();
        });

        Schema::create('inventory_movements', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('product_variant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedBigInteger('order_id')->nullable()->index();
            $table->string('type', 30)->index();
            $table->integer('qty_delta');
            $table->integer('physical_after');
            $table->integer('reserved_after');
            $table->string('reason', 255)->nullable();
            $table->string('reference', 120)->nullable();
            $table->timestamps();
            $table->index(['product_variant_id', 'created_at']);
        });

        Schema::create('stock_reservations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('product_variant_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('order_id')->nullable()->index();
            $table->string('cart_token', 64)->nullable()->index();
            $table->unsignedInteger('quantity');
            $table->string('status', 30)->default('active')->index();
            $table->timestamp('expires_at')->index();
            $table->timestamps();
        });

        Schema::create('slug_redirects', function (Blueprint $table): void {
            $table->id();
            $table->string('entity_type', 40);
            $table->string('old_slug', 220);
            $table->string('new_slug', 220);
            $table->timestamps();
            $table->unique(['entity_type', 'old_slug']);
        });

        Schema::create('collections', function (Blueprint $table): void {
            $table->id();
            $table->string('name', 150);
            $table->string('slug', 160)->unique();
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('collection_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('collection_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('sort_order')->default(0);
            $table->unique(['collection_id', 'product_id']);
        });

        Schema::create('reviews', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('author_name', 120);
            $table->unsignedTinyInteger('rating');
            $table->string('title', 160)->nullable();
            $table->text('body');
            $table->boolean('is_verified_purchase')->default(false);
            $table->string('status', 20)->default('pending')->index();
            $table->timestamps();
        });

        Schema::create('restock_requests', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_variant_id')->nullable()->constrained()->nullOnDelete();
            $table->string('email', 190)->index();
            $table->string('name', 120)->nullable();
            $table->string('status', 20)->default('pending')->index();
            $table->timestamp('notified_at')->nullable();
            $table->timestamps();
        });

        Schema::create('newsletter_subscriptions', function (Blueprint $table): void {
            $table->id();
            $table->string('email', 190)->unique();
            $table->string('name', 120)->nullable();
            $table->string('consent_ip', 45)->nullable();
            $table->timestamp('consented_at')->nullable();
            $table->string('double_opt_in_token', 80)->nullable();
            $table->timestamp('confirmed_at')->nullable();
            $table->string('unsubscribe_token', 80)->unique();
            $table->timestamp('unsubscribed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('wishlists', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['user_id', 'product_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wishlists');
        Schema::dropIfExists('newsletter_subscriptions');
        Schema::dropIfExists('restock_requests');
        Schema::dropIfExists('reviews');
        Schema::dropIfExists('collection_items');
        Schema::dropIfExists('collections');
        Schema::dropIfExists('slug_redirects');
        Schema::dropIfExists('stock_reservations');
        Schema::dropIfExists('inventory_movements');
        Schema::dropIfExists('product_kit_items');
        Schema::dropIfExists('variant_attribute_values');
        Schema::dropIfExists('product_variants');
        Schema::dropIfExists('product_images');
        Schema::dropIfExists('category_product');
        Schema::dropIfExists('products');
        Schema::dropIfExists('attribute_values');
        Schema::dropIfExists('attributes');
        Schema::dropIfExists('categories');
        Schema::dropIfExists('brands');
    }
};
