<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table): void {
            $table->unsignedBigInteger('cost_cents')->nullable()->default(null)->change();
        });

        // Legacy rows where cost_cents was automatically populated with the old default(0)
        // represent "cost not informed" rather than an explicit R$ 0,00 acquisition cost.
        DB::table('products')->where('cost_cents', 0)->update(['cost_cents' => null]);

        Schema::table('product_variants', function (Blueprint $table): void {
            $table->unsignedBigInteger('cost_cents')->nullable()->default(null)->after('promo_price_cents');
        });

        Schema::table('order_items', function (Blueprint $table): void {
            $table->unsignedInteger('returned_qty')->default(0)->after('quantity');
            $table->unsignedInteger('restocked_qty')->default(0)->after('returned_qty');
            $table->unsignedBigInteger('order_discount_allocated_cents')->default(0)->after('discount_cents');
            $table->unsignedBigInteger('net_revenue_cents')->nullable()->default(null)->after('total_cents');
            $table->unsignedBigInteger('returned_revenue_cents')->default(0)->after('net_revenue_cents');
            $table->unsignedBigInteger('unit_cost_cents_snapshot')->nullable()->default(null)->after('returned_revenue_cents');
            $table->string('cost_source', 40)->nullable()->after('unit_cost_cents_snapshot');
            $table->timestamp('cost_recorded_at')->nullable()->after('cost_source');
            $table->timestamp('cost_backfilled_at')->nullable()->after('cost_recorded_at');
            $table->foreignId('cost_backfilled_by')->nullable()->after('cost_backfilled_at')->constrained('users')->nullOnDelete();
        });

        Schema::table('goods_receipt_items', function (Blueprint $table): void {
            $table->boolean('apply_cost_to_sku')->default(true)->after('unit_cost_cents');
        });

        Schema::create('order_returns', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('refund_id')->nullable()->constrained('refunds')->nullOnDelete();
            $table->foreignId('order_occurrence_id')->nullable()->constrained('order_occurrences')->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('idempotency_key', 120)->nullable()->unique();
            $table->string('return_type', 40)->default('partial_return');
            $table->boolean('restock_items')->default(false);
            $table->unsignedBigInteger('financial_refund_cents')->default(0);
            $table->string('reason', 255);
            $table->timestamp('occurred_at');
            $table->timestamps();

            $table->index(['order_id', 'occurred_at']);
            $table->index('occurred_at');
        });

        Schema::create('order_return_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('order_return_id')->constrained('order_returns')->cascadeOnDelete();
            $table->foreignId('order_item_id')->constrained('order_items')->cascadeOnDelete();
            $table->foreignId('product_variant_id')->nullable()->constrained('product_variants')->nullOnDelete();
            $table->unsignedInteger('returned_qty');
            $table->unsignedInteger('restocked_qty')->default(0);
            $table->unsignedBigInteger('unit_cost_cents_snapshot')->nullable();
            $table->unsignedBigInteger('revenue_reversed_cents')->default(0);
            $table->unsignedBigInteger('cogs_reversed_cents')->nullable();
            $table->timestamps();

            $table->unique(['order_return_id', 'order_item_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_return_items');
        Schema::dropIfExists('order_returns');

        Schema::table('goods_receipt_items', function (Blueprint $table): void {
            $table->dropColumn('apply_cost_to_sku');
        });

        Schema::table('order_items', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('cost_backfilled_by');
            $table->dropColumn([
                'returned_qty',
                'restocked_qty',
                'order_discount_allocated_cents',
                'net_revenue_cents',
                'returned_revenue_cents',
                'unit_cost_cents_snapshot',
                'cost_source',
                'cost_recorded_at',
                'cost_backfilled_at',
            ]);
        });

        Schema::table('product_variants', function (Blueprint $table): void {
            $table->dropColumn('cost_cents');
        });

        Schema::table('products', function (Blueprint $table): void {
            $table->unsignedBigInteger('cost_cents')->default(0)->change();
        });
    }
};
