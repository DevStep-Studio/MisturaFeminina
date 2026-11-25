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
            if (! Schema::hasColumn('products', 'supplier_code')) {
                $table->string('supplier_code', 80)->nullable()->index()->after('gtin');
            }
            if (! Schema::hasColumn('products', 'power_watts')) {
                $table->string('power_watts', 40)->nullable()->after('unit_quantity');
            }
        });

        Schema::table('product_variants', function (Blueprint $table): void {
            if (! Schema::hasColumn('product_variants', 'supplier_code')) {
                $table->string('supplier_code', 80)->nullable()->index()->after('gtin');
            }
        });

        Schema::table('bulk_edit_batches', function (Blueprint $table): void {
            if (! Schema::hasColumn('bulk_edit_batches', 'operation_type')) {
                $table->string('operation_type', 40)->nullable()->after('source');
            }
            if (! Schema::hasColumn('bulk_edit_batches', 'skipped_count')) {
                $table->unsignedInteger('skipped_count')->default(0)->after('updated_count');
            }
            if (! Schema::hasColumn('bulk_edit_batches', 'pending_count')) {
                $table->unsignedInteger('pending_count')->default(0)->after('skipped_count');
            }
            if (! Schema::hasColumn('bulk_edit_batches', 'error_message')) {
                $table->text('error_message')->nullable()->after('summary');
            }
        });
    }

    public function down(): void
    {
        Schema::table('bulk_edit_batches', function (Blueprint $table): void {
            $cols = array_values(array_filter([
                Schema::hasColumn('bulk_edit_batches', 'error_message') ? 'error_message' : null,
                Schema::hasColumn('bulk_edit_batches', 'pending_count') ? 'pending_count' : null,
                Schema::hasColumn('bulk_edit_batches', 'skipped_count') ? 'skipped_count' : null,
                Schema::hasColumn('bulk_edit_batches', 'operation_type') ? 'operation_type' : null,
            ]));
            if ($cols !== []) {
                $table->dropColumn($cols);
            }
        });

        Schema::table('product_variants', function (Blueprint $table): void {
            if (Schema::hasColumn('product_variants', 'supplier_code')) {
                $table->dropColumn('supplier_code');
            }
        });

        Schema::table('products', function (Blueprint $table): void {
            $cols = array_values(array_filter([
                Schema::hasColumn('products', 'power_watts') ? 'power_watts' : null,
                Schema::hasColumn('products', 'supplier_code') ? 'supplier_code' : null,
            ]));
            if ($cols !== []) {
                $table->dropColumn($cols);
            }
        });
    }
};
