<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('wholesale_customer_groups', function (Blueprint $table): void {
            $table->id();
            $table->string('slug', 60)->unique();
            $table->string('name', 120);
            $table->text('description')->nullable();
            $table->string('status', 24)->default('active'); // active, inactive
            $table->timestamps();
        });

        Schema::create('wholesale_customer_group_members', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('customer_group_id')->constrained('wholesale_customer_groups')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('status', 24)->default('pending')->index(); // pending, approved, rejected, suspended
            $table->string('company_name', 160)->nullable();
            $table->string('trade_name', 160)->nullable();
            $table->string('cnpj_cpf', 30)->nullable();
            $table->string('state_registration', 40)->nullable();
            $table->string('phone', 30)->nullable();
            $table->timestamp('requested_at')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->foreignId('approved_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('rejection_reason', 255)->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['customer_group_id', 'user_id'], 'wh_member_group_user_unique');
        });

        Schema::create('wholesale_groups', function (Blueprint $table): void {
            $table->id();
            $table->string('name', 120);
            $table->string('slug', 120)->unique();
            $table->text('description')->nullable();
            $table->string('status', 24)->default('active'); // active, inactive
            $table->timestamps();
        });

        Schema::create('wholesale_group_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('wholesale_group_id')->constrained('wholesale_groups')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('product_variant_id')->nullable()->constrained('product_variants')->cascadeOnDelete();
            $table->timestamps();

            $table->index(['wholesale_group_id', 'product_id'], 'wh_group_item_idx');
        });

        Schema::create('wholesale_rules', function (Blueprint $table): void {
            $table->id();
            $table->string('name', 140);
            $table->string('slug', 140)->unique();
            $table->text('description')->nullable();
            $table->string('status', 24)->default('active')->index(); // draft, scheduled, active, paused, ended
            $table->string('access_mode', 24)->default('open'); // open, exclusive, mixed
            $table->string('quantity_scope', 32)->default('commercial_line'); // sku, product, commercial_line, wholesale_group, category, order
            $table->string('discount_policy', 32)->default('tier_pricing'); // tier_pricing, fixed_discount, percentage_discount
            $table->string('stacking_policy', 32)->default('no_stacking'); // no_stacking, allow_coupons, allow_promotions, best_discount_only
            $table->unsignedInteger('min_quantity')->default(1);
            $table->integer('priority')->default(0);
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['status', 'starts_at', 'ends_at'], 'wh_rule_status_dates_idx');
        });

        Schema::create('wholesale_rule_tiers', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('wholesale_rule_id')->constrained('wholesale_rules')->cascadeOnDelete();
            $table->unsignedInteger('min_quantity');
            $table->unsignedInteger('max_quantity')->nullable();
            $table->string('discount_type', 24); // fixed_price, percent, fixed_discount
            $table->decimal('discount_value', 10, 2);
            $table->timestamps();

            $table->index(['wholesale_rule_id', 'min_quantity'], 'wh_tier_rule_qty_idx');
        });

        Schema::create('wholesale_rule_products', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('wholesale_rule_id')->constrained('wholesale_rules')->cascadeOnDelete();
            $table->foreignId('product_id')->nullable()->constrained('products')->cascadeOnDelete();
            $table->foreignId('product_variant_id')->nullable()->constrained('product_variants')->cascadeOnDelete();
            $table->foreignId('category_id')->nullable()->constrained('categories')->cascadeOnDelete();
            $table->foreignId('wholesale_group_id')->nullable()->constrained('wholesale_groups')->cascadeOnDelete();
            $table->boolean('is_excluded')->default(false);
            $table->timestamps();

            $table->index(['wholesale_rule_id', 'product_id'], 'wh_rule_prod_idx');
        });

        Schema::create('wholesale_rule_customer_groups', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('wholesale_rule_id')->constrained('wholesale_rules')->cascadeOnDelete();
            $table->foreignId('customer_group_id')->constrained('wholesale_customer_groups')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['wholesale_rule_id', 'customer_group_id'], 'wh_rule_cust_group_unique');
        });

        Schema::create('wholesale_rule_audits', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('wholesale_rule_id')->constrained('wholesale_rules')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action', 40);
            $table->json('old_values')->nullable();
            $table->json('new_values')->nullable();
            $table->string('description', 255)->nullable();
            $table->timestamps();
        });

        if (! Schema::hasColumns('order_items', ['wholesale_rule_id', 'wholesale_rule_name'])) {
            Schema::table('order_items', function (Blueprint $table): void {
                $table->unsignedBigInteger('wholesale_rule_id')->nullable()->after('weight_grams_snapshot');
                $table->string('wholesale_rule_name', 140)->nullable()->after('wholesale_rule_id');
                $table->unsignedInteger('wholesale_tier_min_qty')->nullable()->after('wholesale_rule_name');
                $table->unsignedInteger('wholesale_discount_cents')->default(0)->after('wholesale_tier_min_qty');
                $table->unsignedInteger('wholesale_unit_price_cents')->nullable()->after('wholesale_discount_cents');
                $table->unsignedInteger('original_unit_price_cents')->nullable()->after('wholesale_unit_price_cents');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumns('order_items', ['wholesale_rule_id', 'wholesale_rule_name'])) {
            Schema::table('order_items', function (Blueprint $table): void {
                $table->dropColumn([
                    'wholesale_rule_id',
                    'wholesale_rule_name',
                    'wholesale_tier_min_qty',
                    'wholesale_discount_cents',
                    'wholesale_unit_price_cents',
                    'original_unit_price_cents',
                ]);
            });
        }

        Schema::dropIfExists('wholesale_rule_audits');
        Schema::dropIfExists('wholesale_rule_customer_groups');
        Schema::dropIfExists('wholesale_rule_products');
        Schema::dropIfExists('wholesale_rule_tiers');
        Schema::dropIfExists('wholesale_rules');
        Schema::dropIfExists('wholesale_group_items');
        Schema::dropIfExists('wholesale_groups');
        Schema::dropIfExists('wholesale_customer_group_members');
        Schema::dropIfExists('wholesale_customer_groups');
    }
};
