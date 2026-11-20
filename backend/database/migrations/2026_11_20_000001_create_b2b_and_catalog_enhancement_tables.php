<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table): void {
            $table->boolean('wholesale_group_variants')->default(true)->after('wholesale_enabled');
        });

        Schema::table('product_variants', function (Blueprint $table): void {
            $table->string('shade_code', 40)->nullable()->after('name');
            $table->string('color_family', 60)->nullable()->index()->after('shade_code');
            $table->string('color_hex', 16)->nullable()->after('color_family');
            $table->string('swatch_image_path', 500)->nullable()->after('color_hex');
            $table->unsignedInteger('sort_order')->default(0)->after('is_active');
        });

        Schema::table('attributes', function (Blueprint $table): void {
            $table->boolean('is_filterable')->default(true)->after('display_type');
            $table->boolean('is_comparable')->default(true)->after('is_filterable');
            $table->string('unit', 30)->nullable()->after('is_comparable');
            $table->unsignedInteger('sort_order')->default(0)->after('unit');
        });

        Schema::create('category_attributes', function (Blueprint $table): void {
            $table->foreignId('category_id')->constrained()->cascadeOnDelete();
            $table->foreignId('attribute_id')->constrained()->cascadeOnDelete();
            $table->boolean('is_filterable')->default(true);
            $table->boolean('is_comparable')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->primary(['category_id', 'attribute_id']);
        });

        Schema::create('product_attribute_values', function (Blueprint $table): void {
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('attribute_value_id')->constrained()->cascadeOnDelete();
            $table->primary(['product_id', 'attribute_value_id']);
        });

        Schema::create('replenishment_lists', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            $table->boolean('is_default')->default(false);
            $table->timestamps();
            $table->index(['user_id', 'is_default']);
        });

        Schema::create('replenishment_list_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('replenishment_list_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_variant_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('desired_quantity')->default(1);
            $table->timestamps();
            $table->unique(['replenishment_list_id', 'product_variant_id'], 'rep_list_variant_unique');
        });

        Schema::create('shared_carts', function (Blueprint $table): void {
            $table->id();
            $table->string('token', 64)->unique();
            $table->string('token_hash', 64)->unique();
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('title', 140)->nullable();
            $table->json('cart_snapshot');
            $table->unsignedInteger('views_count')->default(0);
            $table->unsignedInteger('imports_count')->default(0);
            $table->timestamp('expires_at')->index();
            $table->timestamps();
        });

        Schema::table('restock_requests', function (Blueprint $table): void {
            $table->foreignId('user_id')->nullable()->after('product_variant_id')->constrained('users')->nullOnDelete();
            $table->string('channel', 20)->default('email')->after('name');
            $table->string('phone', 30)->nullable()->after('channel');
            $table->boolean('consent_given')->default(true)->after('phone');
            $table->timestamp('consented_at')->nullable()->after('consent_given');
            $table->string('unsubscribe_token', 64)->nullable()->unique()->after('consented_at');
            $table->unsignedTinyInteger('attempts_count')->default(0)->after('notified_at');
            $table->string('last_error', 500)->nullable()->after('attempts_count');
            $table->timestamp('cancelled_at')->nullable()->after('last_error');
            $table->index(['product_variant_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::table('restock_requests', function (Blueprint $table): void {
            $table->dropIndex(['product_variant_id', 'status']);
            $table->dropUnique(['unsubscribe_token']);
            $table->dropConstrainedForeignId('user_id');
            $table->dropColumn([
                'channel',
                'phone',
                'consent_given',
                'consented_at',
                'unsubscribe_token',
                'attempts_count',
                'last_error',
                'cancelled_at',
            ]);
        });

        Schema::dropIfExists('shared_carts');
        Schema::dropIfExists('replenishment_list_items');
        Schema::dropIfExists('replenishment_lists');
        Schema::dropIfExists('product_attribute_values');
        Schema::dropIfExists('category_attributes');

        Schema::table('attributes', function (Blueprint $table): void {
            $table->dropColumn(['is_filterable', 'is_comparable', 'unit', 'sort_order']);
        });

        Schema::table('product_variants', function (Blueprint $table): void {
            $table->dropIndex(['color_family']);
            $table->dropColumn(['shade_code', 'color_family', 'color_hex', 'swatch_image_path', 'sort_order']);
        });

        Schema::table('products', function (Blueprint $table): void {
            $table->dropColumn('wholesale_group_variants');
        });
    }
};
