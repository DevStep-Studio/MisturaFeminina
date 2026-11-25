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
            $table->boolean('has_variants')->default(false)->after('product_type');
            $table->json('variation_attributes')->nullable()->after('has_variants');
        });

        // Mark already seeded/existing variable products honestly based on existing data.
        DB::table('products')
            ->where('product_type', 'variable')
            ->update(['has_variants' => true]);

        $multiVariantProductIds = DB::table('product_variants')
            ->select('product_id')
            ->groupBy('product_id')
            ->havingRaw('COUNT(*) > 1')
            ->pluck('product_id')
            ->all();
        if ($multiVariantProductIds !== []) {
            DB::table('products')
                ->whereIn('id', $multiVariantProductIds)
                ->update(['has_variants' => true]);
        }

        $namedSingleVariantProductIds = DB::table('product_variants')
            ->where('name', '!=', 'Padrão')
            ->pluck('product_id')
            ->unique()
            ->values()
            ->all();
        if ($namedSingleVariantProductIds !== []) {
            DB::table('products')
                ->whereIn('id', $namedSingleVariantProductIds)
                ->update(['has_variants' => true]);
        }

        Schema::table('product_variants', function (Blueprint $table): void {
            $table->json('option_values')->nullable()->after('name');
            $table->string('variant_signature', 240)->nullable()->index()->after('option_values');
            $table->string('image_path', 500)->nullable()->after('swatch_image_path');
            $table->boolean('inherits_price')->default(true)->after('promo_price_cents');
            $table->boolean('inherits_promo_price')->default(true)->after('inherits_price');
            $table->boolean('inherits_weight')->default(true)->after('weight_grams');
            $table->boolean('inherits_image')->default(true)->after('image_path');
            $table->timestamp('archived_at')->nullable()->index()->after('is_active');
        });

        // Existing explicitly priced or custom-weight variants retain explicit inheritance flags.
        DB::table('product_variants')->whereNotNull('weight_grams')->update(['inherits_weight' => false]);
        DB::table('product_variants')->whereNotNull('image_id')->update(['inherits_image' => false]);
    }

    public function down(): void
    {
        Schema::table('product_variants', function (Blueprint $table): void {
            $table->dropIndex(['variant_signature']);
            $table->dropIndex(['archived_at']);
            $table->dropColumn([
                'option_values',
                'variant_signature',
                'image_path',
                'inherits_price',
                'inherits_promo_price',
                'inherits_weight',
                'inherits_image',
                'archived_at',
            ]);
        });

        Schema::table('products', function (Blueprint $table): void {
            $table->dropColumn(['has_variants', 'variation_attributes']);
        });
    }
};
