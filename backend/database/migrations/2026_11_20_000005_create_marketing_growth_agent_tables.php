<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Integrations credentials and status (GSC, GA4, Google Ads, GMC, Meta Ads, Meta CAPI)
        Schema::create('marketing_integrations', function (Blueprint $table): void {
            $table->id();
            $table->string('platform', 60)->unique(); // google_search_console, google_analytics_4, google_ads, google_merchant_center, meta_ads, meta_capi
            $table->string('name', 120);
            $table->string('status', 40)->default('not_configured'); // connected, not_configured, error
            $table->string('account_id', 120)->nullable();
            $table->string('account_name', 160)->nullable();
            $table->string('property_id', 120)->nullable();
            $table->string('pixel_id', 120)->nullable();
            $table->json('encrypted_credentials')->nullable();
            $table->json('settings')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->timestamp('last_healthcheck_at')->nullable();
            $table->string('last_healthcheck_status', 60)->nullable();
            $table->text('last_healthcheck_message')->nullable();
            $table->timestamps();
        });

        // 2. Metrics snapshots (Multi-channel aggregated and daily breakdowns)
        Schema::create('marketing_metrics_snapshots', function (Blueprint $table): void {
            $table->id();
            $table->string('platform', 40)->index(); // blended, google_ads, meta_ads, ga4, search_console
            $table->date('period_date')->index();
            $table->unsignedBigInteger('impressions')->default(0);
            $table->unsignedBigInteger('clicks')->default(0);
            $table->unsignedBigInteger('spend_cents')->default(0);
            $table->unsignedBigInteger('attributed_revenue_cents')->default(0);
            $table->unsignedInteger('conversions_count')->default(0);
            $table->decimal('cpc', 10, 2)->default(0);
            $table->decimal('ctr', 6, 2)->default(0);
            $table->decimal('roas', 8, 2)->default(0);
            $table->unsignedInteger('store_orders_count')->default(0);
            $table->unsignedBigInteger('store_revenue_cents')->default(0);
            $table->json('breakdown_payload')->nullable();
            $table->timestamps();

            $table->unique(['platform', 'period_date']);
        });

        // 3. Technical SEO Audits
        Schema::create('seo_audits', function (Blueprint $table): void {
            $table->id();
            $table->string('status', 40)->default('completed'); // pending, running, completed, failed
            $table->unsignedSmallInteger('overall_score')->default(85);
            $table->unsignedInteger('total_urls_crawled')->default(0);
            $table->unsignedInteger('healthy_urls_count')->default(0);
            $table->unsignedInteger('issues_count')->default(0);
            $table->unsignedInteger('warnings_count')->default(0);
            $table->json('summary_payload')->nullable();
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // 4. Detailed SEO URL inspections & metadata proposals
        Schema::create('seo_url_inspections', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('audit_id')->nullable()->constrained('seo_audits')->cascadeOnDelete();
            $table->string('url', 255)->index();
            $table->string('entity_type', 40)->default('page'); // home, product, category, page
            $table->unsignedBigInteger('entity_id')->nullable();
            $table->unsignedSmallInteger('http_status')->default(200);
            $table->string('title', 255)->nullable();
            $table->text('meta_description')->nullable();
            $table->string('canonical_url', 255)->nullable();
            $table->boolean('has_schema')->default(false);
            $table->json('schema_types')->nullable();
            $table->unsignedSmallInteger('score')->default(80);
            $table->json('issues')->nullable();
            $table->string('suggested_title', 255)->nullable();
            $table->text('suggested_description')->nullable();
            $table->text('optimization_reason')->nullable();
            $table->string('status', 40)->default('needs_review'); // needs_review, optimized, applied, ignored
            $table->timestamp('applied_at')->nullable();
            $table->timestamps();

            $table->index(['entity_type', 'entity_id']);
        });

        // 5. Marketing Opportunities Pipeline
        Schema::create('marketing_opportunities', function (Blueprint $table): void {
            $table->id();
            $table->string('title', 255);
            $table->string('category', 60); // seo, google_ads, meta_ads, catalog, cro
            $table->string('priority', 30)->default('media'); // alta, media, baixa
            $table->string('effort_level', 30)->default('medio'); // baixo, medio, alto
            $table->string('estimated_lift', 120)->nullable();
            $table->text('impact_description');
            $table->string('status', 40)->default('nova'); // nova, em_analise, aprovada, implementada, descartada
            $table->json('details')->nullable();
            $table->timestamps();
        });

        // 6. AI Structured Recommendations (Human-in-the-Loop approval)
        Schema::create('marketing_recommendations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('execution_id')->nullable()->constrained('ai_executions')->nullOnDelete();
            $table->string('channel', 40); // seo, google_ads, meta_ads, ga4, store
            $table->string('type', 60); // metadata_fix, budget_reallocation, negative_keyword, creative_refresh, bidding_adjustment
            $table->string('title', 255);
            $table->text('description');
            $table->json('evidence_payload')->nullable();
            $table->json('proposed_action')->nullable();
            $table->json('before_state')->nullable();
            $table->json('after_state')->nullable();
            $table->string('status', 40)->default('pending_review'); // pending_review, approved, applied, discarded
            $table->foreignId('approved_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('applied_at')->nullable();
            $table->timestamps();
        });

        // 7. Campaign drafts (Google Ads / Meta Ads)
        Schema::create('marketing_campaign_drafts', function (Blueprint $table): void {
            $table->id();
            $table->string('platform', 40); // google_ads, meta_ads
            $table->string('campaign_name', 200);
            $table->string('campaign_type', 60); // search, pmax, conversions, catalog_sales
            $table->unsignedBigInteger('daily_budget_cents')->default(3000);
            $table->decimal('target_roas', 6, 2)->nullable();
            $table->json('targeting')->nullable();
            $table->json('ad_groups')->nullable();
            $table->json('creative_assets')->nullable();
            $table->string('status', 40)->default('draft'); // draft, awaiting_approval, approved, ready_to_export
            $table->text('approval_notes')->nullable();
            $table->timestamps();
        });

        // 8. Marketing Automations
        Schema::create('marketing_automations', function (Blueprint $table): void {
            $table->id();
            $table->string('name', 160);
            $table->string('automation_type', 60); // seo_daily_audit, weekly_executive_report, budget_guardrail, out_of_stock_ad_pause, negative_keyword_monitor
            $table->string('schedule', 40)->default('daily'); // hourly, daily, weekly
            $table->boolean('is_enabled')->default(true);
            $table->json('parameters')->nullable();
            $table->timestamp('last_run_at')->nullable();
            $table->string('last_status', 40)->nullable();
            $table->json('last_result')->nullable();
            $table->timestamps();
        });

        // 9. Marketing Reports
        Schema::create('marketing_reports', function (Blueprint $table): void {
            $table->id();
            $table->string('title', 200);
            $table->string('period_range', 40)->default('last_30_days');
            $table->date('period_start');
            $table->date('period_end');
            $table->text('summary_text')->nullable();
            $table->json('metrics_payload')->nullable();
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // 10. Marketing Chat Messages (Marketing Copilot)
        Schema::create('marketing_chat_messages', function (Blueprint $table): void {
            $table->id();
            $table->string('session_id', 64)->index();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('role', 30); // user, assistant, system
            $table->text('content');
            $table->json('context_payload')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketing_chat_messages');
        Schema::dropIfExists('marketing_reports');
        Schema::dropIfExists('marketing_automations');
        Schema::dropIfExists('marketing_campaign_drafts');
        Schema::dropIfExists('marketing_recommendations');
        Schema::dropIfExists('marketing_opportunities');
        Schema::dropIfExists('seo_url_inspections');
        Schema::dropIfExists('seo_audits');
        Schema::dropIfExists('marketing_metrics_snapshots');
        Schema::dropIfExists('marketing_integrations');
    }
};
