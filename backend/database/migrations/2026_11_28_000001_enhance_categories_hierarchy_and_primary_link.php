<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('category_product') && ! Schema::hasColumn('category_product', 'is_primary')) {
            Schema::table('category_product', function (Blueprint $table): void {
                $table->boolean('is_primary')->default(false)->index();
            });
        }

        if (Schema::hasTable('categories') && ! Schema::hasIndex('categories', 'categories_menu_tree_idx')) {
            Schema::table('categories', function (Blueprint $table): void {
                $table->index(['is_active', 'show_in_menu', 'parent_id', 'sort_order'], 'categories_menu_tree_idx');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('categories') && Schema::hasIndex('categories', 'categories_menu_tree_idx')) {
            Schema::table('categories', function (Blueprint $table): void {
                $table->dropIndex('categories_menu_tree_idx');
            });
        }

        if (Schema::hasTable('category_product') && Schema::hasColumn('category_product', 'is_primary')) {
            Schema::table('category_product', function (Blueprint $table): void {
                $table->dropIndex(['is_primary']);
                $table->dropColumn('is_primary');
            });
        }
    }
};
