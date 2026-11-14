<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('coupons', function (Blueprint $table): void {
            $table->id();
            $table->string('code', 60)->unique();
            $table->string('name', 150);
            $table->string('type', 30); // percent, fixed, free_shipping
            $table->unsignedBigInteger('value'); // percentage (e.g. 10 = 10%) or cents
            $table->unsignedBigInteger('min_subtotal_cents')->default(0);
            $table->unsignedBigInteger('max_discount_cents')->nullable();
            $table->unsignedInteger('max_uses')->nullable();
            $table->unsignedInteger('max_uses_per_user')->default(1);
            $table->unsignedInteger('uses_count')->default(0);
            $table->boolean('first_purchase_only')->default(false);
            $table->boolean('is_cumulative')->default(false);
            $table->json('allowed_states')->nullable();
            $table->string('scope_type', 30)->default('all'); // all, category, brand, product
            $table->json('scope_ids')->nullable();
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();
            $table->boolean('is_active')->default(true)->index();
            $table->timestamps();
        });

        Schema::create('promotions', function (Blueprint $table): void {
            $table->id();
            $table->string('name', 150);
            $table->string('rule_type', 40); // category_discount, brand_discount, cart_threshold, quantity_tier
            $table->string('discount_type', 20); // percent, fixed
            $table->unsignedBigInteger('value');
            $table->string('scope_type', 30)->default('all');
            $table->json('scope_ids')->nullable();
            $table->unsignedInteger('min_qty')->default(1);
            $table->unsignedBigInteger('min_subtotal_cents')->default(0);
            $table->unsignedInteger('priority')->default(10);
            $table->boolean('is_cumulative')->default(false);
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();
            $table->boolean('is_active')->default(true)->index();
            $table->timestamps();
        });

        Schema::create('shipping_rules', function (Blueprint $table): void {
            $table->id();
            $table->string('name', 120);
            $table->string('code', 60)->unique();
            $table->string('carrier', 80);
            $table->string('mode', 30); // table, pickup, motoboy, free_rule
            $table->unsignedBigInteger('min_subtotal_cents')->default(0);
            $table->unsignedInteger('max_weight_grams')->nullable();
            $table->json('regions_ufs')->nullable();
            $table->string('cep_prefix_start', 8)->nullable();
            $table->string('cep_prefix_end', 8)->nullable();
            $table->unsignedBigInteger('base_price_cents')->default(0);
            $table->unsignedBigInteger('price_per_kg_cents')->default(0);
            $table->unsignedInteger('estimated_days')->default(5);
            $table->unsignedInteger('extra_prep_days')->default(1);
            $table->unsignedBigInteger('free_shipping_above_cents')->nullable();
            $table->boolean('is_active')->default(true)->index();
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();
            $table->timestamps();
        });

        Schema::create('carts', function (Blueprint $table): void {
            $table->id();
            $table->uuid('token')->unique();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('coupon_code', 60)->nullable();
            $table->string('shipping_cep', 9)->nullable();
            $table->string('shipping_service_code', 60)->nullable();
            $table->unsignedBigInteger('shipping_quote_id')->nullable();
            $table->timestamp('expires_at')->nullable()->index();
            $table->timestamps();
        });

        Schema::create('cart_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('cart_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_variant_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('quantity');
            $table->unsignedBigInteger('unit_price_snapshot_cents');
            $table->timestamps();
            $table->unique(['cart_id', 'product_variant_id']);
        });

        Schema::create('shipping_quotes', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('cart_id')->nullable()->constrained()->nullOnDelete();
            $table->string('cep', 9)->index();
            $table->string('provider', 50);
            $table->string('service_code', 60);
            $table->string('service_name', 120);
            $table->string('carrier', 80);
            $table->unsignedBigInteger('price_cents');
            $table->unsignedInteger('estimated_days');
            $table->boolean('is_fallback')->default(false);
            $table->json('raw_response')->nullable();
            $table->timestamp('expires_at')->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shipping_quotes');
        Schema::dropIfExists('cart_items');
        Schema::dropIfExists('carts');
        Schema::dropIfExists('shipping_rules');
        Schema::dropIfExists('promotions');
        Schema::dropIfExists('coupons');
    }
};
