<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reviews', function (Blueprint $table): void {
            if (! Schema::hasColumn('reviews', 'photos')) {
                $table->json('photos')->nullable()->after('body');
            }
            if (! Schema::hasColumn('reviews', 'is_external')) {
                $table->boolean('is_external')->default(false)->after('is_verified_purchase');
            }
            if (! Schema::hasColumn('reviews', 'source_name')) {
                $table->string('source_name', 120)->nullable()->after('is_external');
            }
            if (! Schema::hasColumn('reviews', 'source_url')) {
                $table->string('source_url', 500)->nullable()->after('source_name');
            }
            if (! Schema::hasColumn('reviews', 'variant_name')) {
                $table->string('variant_name', 120)->nullable()->after('source_url');
            }
            if (! Schema::hasColumn('reviews', 'author_email')) {
                $table->string('author_email', 190)->nullable()->after('author_name');
            }
        });
    }

    public function down(): void
    {
        Schema::table('reviews', function (Blueprint $table): void {
            $table->dropColumn(['photos', 'is_external', 'source_name', 'source_url', 'variant_name', 'author_email']);
        });
    }
};
