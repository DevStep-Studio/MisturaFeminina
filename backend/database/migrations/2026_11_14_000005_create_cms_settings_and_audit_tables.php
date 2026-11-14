<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('store_settings', function (Blueprint $table): void {
            $table->id();
            $table->string('key', 100)->unique();
            $table->string('group', 60)->index();
            $table->json('value')->nullable();
            $table->boolean('is_public')->default(false);
            $table->timestamps();
        });

        Schema::create('integration_settings', function (Blueprint $table): void {
            $table->id();
            $table->string('provider', 60)->unique();
            $table->string('environment', 20)->default('sandbox');
            $table->text('encrypted_credentials')->nullable();
            $table->json('public_config')->nullable();
            $table->boolean('is_active')->default(false);
            $table->timestamp('last_healthcheck_at')->nullable();
            $table->string('last_healthcheck_status', 40)->nullable();
            $table->timestamps();
        });

        Schema::create('media_assets', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('title', 180)->nullable();
            $table->string('disk', 40)->default('public');
            $table->string('path', 500);
            $table->string('mime_type', 100);
            $table->unsignedBigInteger('size_bytes');
            $table->unsignedInteger('width')->nullable();
            $table->unsignedInteger('height')->nullable();
            $table->string('alt_text', 255)->nullable();
            $table->string('focal_point', 30)->default('center');
            $table->timestamps();
        });

        Schema::create('banners', function (Blueprint $table): void {
            $table->id();
            $table->string('title', 150);
            $table->string('placement', 40)->default('hero')->index(); // hero, promo_grid, category_top, popup
            $table->string('desktop_image_path', 500);
            $table->string('mobile_image_path', 500)->nullable();
            $table->string('alt_text', 255);
            $table->string('cta_label', 80)->nullable();
            $table->string('cta_url', 500)->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true)->index();
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();
            $table->timestamps();
        });

        Schema::create('home_sections', function (Blueprint $table): void {
            $table->id();
            $table->string('key', 80)->unique();
            $table->string('type', 60); // hero_carousel, coupon_strip, benefits_row, category_circles, product_showcase, banner_grid, brand_showcase, testimonials, newsletter
            $table->string('title', 180)->nullable();
            $table->string('subtitle', 255)->nullable();
            $table->json('config')->nullable();
            $table->unsignedInteger('sort_order')->default(0)->index();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('content_pages', function (Blueprint $table): void {
            $table->id();
            $table->string('slug', 160)->unique();
            $table->string('title', 180);
            $table->longText('content_html');
            $table->string('seo_title', 180)->nullable();
            $table->string('seo_description', 320)->nullable();
            $table->boolean('is_published')->default(true);
            $table->boolean('show_in_footer')->default(true);
            $table->string('footer_group', 60)->default('institucional');
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('analytics_events', function (Blueprint $table): void {
            $table->id();
            $table->string('session_id', 100)->index();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedBigInteger('order_id')->nullable()->index();
            $table->string('event_name', 60)->index();
            $table->string('path', 300)->nullable();
            $table->string('utm_source', 100)->nullable();
            $table->string('utm_medium', 100)->nullable();
            $table->string('utm_campaign', 120)->nullable();
            $table->json('payload')->nullable();
            $table->timestamps();
            $table->index(['event_name', 'created_at']);
        });

        Schema::create('audit_logs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('action', 100)->index();
            $table->string('entity_type', 100)->nullable()->index();
            $table->string('entity_id', 80)->nullable();
            $table->json('old_values')->nullable();
            $table->json('new_values')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 300)->nullable();
            $table->string('request_id', 80)->nullable();
            $table->timestamps();
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('analytics_events');
        Schema::dropIfExists('content_pages');
        Schema::dropIfExists('home_sections');
        Schema::dropIfExists('banners');
        Schema::dropIfExists('media_assets');
        Schema::dropIfExists('integration_settings');
        Schema::dropIfExists('store_settings');
    }
};
