<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumns('suppliers', ['lead_time_days', 'min_order_qty'])) {
            Schema::table('suppliers', function (Blueprint $table): void {
                $table->unsignedInteger('lead_time_days')->nullable()->after('notes');
                $table->unsignedInteger('min_order_qty')->nullable()->after('lead_time_days');
            });
        }

        Schema::create('ai_agents', function (Blueprint $table): void {
            $table->id();
            $table->string('slug', 60)->unique();
            $table->string('name', 120);
            $table->string('type', 40);
            $table->text('description')->nullable();
            $table->boolean('enabled')->default(true);
            $table->string('model_name', 80)->default('gpt-4o-mini');
            $table->text('system_prompt')->nullable();
            $table->json('configuration')->nullable();
            $table->unsignedInteger('version')->default(1);
            $table->timestamp('last_executed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('ai_executions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('agent_id')->constrained('ai_agents')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status', 32)->index();
            $table->string('execution_mode', 40)->default('deterministic_tools_only');
            $table->string('provider', 40)->default('openai');
            $table->string('model_name', 80)->nullable();
            $table->string('context_type', 60)->nullable();
            $table->unsignedBigInteger('context_id')->nullable();
            $table->string('input_reference', 190)->nullable();
            $table->string('result_reference', 190)->nullable();
            $table->json('input_payload')->nullable();
            $table->json('output_payload')->nullable();
            $table->json('tool_calls')->nullable();
            $table->unsignedInteger('prompt_tokens')->default(0);
            $table->unsignedInteger('completion_tokens')->default(0);
            $table->unsignedInteger('total_tokens')->default(0);
            $table->decimal('estimated_cost_usd', 10, 6)->default(0);
            $table->unsignedInteger('duration_ms')->nullable();
            $table->string('error_code', 60)->nullable();
            $table->text('error_message')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();

            $table->index(['context_type', 'context_id']);
            $table->index(['agent_id', 'status']);
        });

        Schema::create('ai_execution_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('execution_id')->constrained('ai_executions')->cascadeOnDelete();
            $table->string('event_type', 50)->index();
            $table->string('tool_name', 80)->nullable();
            $table->string('message', 255)->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('ai_product_imports', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('execution_id')->nullable()->constrained('ai_executions')->nullOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('source_type', 40);
            $table->string('file_hash', 64)->nullable()->index();
            $table->json('original_filenames')->nullable();
            $table->json('conversation_messages')->nullable();
            $table->json('context_parameters')->nullable();
            $table->string('status', 32)->index();
            $table->unsignedInteger('total_records')->default(0);
            $table->unsignedInteger('grouped_products_count')->default(0);
            $table->unsignedInteger('grouped_variants_count')->default(0);
            $table->unsignedInteger('new_count')->default(0);
            $table->unsignedInteger('update_count')->default(0);
            $table->unsignedInteger('duplicate_count')->default(0);
            $table->unsignedInteger('incomplete_count')->default(0);
            $table->unsignedInteger('error_count')->default(0);
            $table->unsignedBigInteger('committed_batch_id')->nullable();
            $table->foreignId('approved_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();
        });

        Schema::create('ai_product_import_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('import_id')->constrained('ai_product_imports')->cascadeOnDelete();
            $table->unsignedInteger('row_index')->default(0);
            $table->string('group_key', 120)->index();
            $table->string('product_reference', 190);
            $table->string('sku', 80)->nullable()->index();
            $table->string('gtin', 40)->nullable();
            $table->string('action_type', 40);
            $table->foreignId('matched_product_id')->nullable()->constrained('products')->nullOnDelete();
            $table->foreignId('matched_variant_id')->nullable()->constrained('product_variants')->nullOnDelete();
            $table->json('proposed_data');
            $table->json('source_evidence')->nullable();
            $table->json('validation_result')->nullable();
            $table->json('duplicate_comparison')->nullable();
            $table->string('resolution_choice', 32)->default('create_new');
            $table->string('approval_status', 32)->default('pending')->index();
            $table->timestamps();
        });

        Schema::create('ai_replenishment_analyses', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('execution_id')->nullable()->constrained('ai_executions')->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('trigger_type', 24)->default('manual');
            $table->unsignedInteger('analysis_period')->default(30);
            $table->unsignedInteger('default_lead_time_days')->default(7);
            $table->unsignedInteger('safety_stock_days')->default(3);
            $table->unsignedInteger('target_coverage_days')->default(21);
            $table->string('status', 24)->default('completed');
            $table->json('summary_kpis')->nullable();
            $table->timestamps();
        });

        Schema::create('ai_replenishment_suggestions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('analysis_id')->constrained('ai_replenishment_analyses')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('variant_id')->constrained('product_variants')->cascadeOnDelete();
            $table->foreignId('supplier_id')->nullable()->constrained('suppliers')->nullOnDelete();
            $table->string('sku_snapshot', 80);
            $table->string('product_name_snapshot', 190);
            $table->string('variant_name_snapshot', 120);
            $table->string('shade_code_snapshot', 40)->nullable();
            $table->integer('available_stock')->default(0);
            $table->integer('reserved_stock')->default(0);
            $table->integer('pending_inbound_qty')->default(0);
            $table->integer('sales_7d')->default(0);
            $table->integer('sales_30d')->default(0);
            $table->integer('sales_90d')->default(0);
            $table->integer('returns_30d')->default(0);
            $table->decimal('average_demand', 10, 4)->default(0);
            $table->decimal('coverage_days', 10, 2)->nullable();
            $table->unsignedInteger('lead_time_days')->default(7);
            $table->integer('safety_stock_qty')->default(0);
            $table->integer('reorder_point_qty')->default(0);
            $table->integer('target_stock_qty')->default(0);
            $table->integer('suggested_quantity')->default(0);
            $table->integer('adjusted_quantity')->nullable();
            $table->integer('unit_cost_cents')->default(0);
            $table->integer('estimated_total_cents')->default(0);
            $table->unsignedInteger('restock_waitlist_count')->default(0);
            $table->unsignedInteger('customer_lists_count')->default(0);
            $table->string('forecast_quality', 40)->default('high_confidence');
            $table->string('priority', 24)->index();
            $table->text('explanation');
            $table->text('ai_explanation')->nullable();
            $table->string('plan_status', 24)->default('pending')->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_replenishment_suggestions');
        Schema::dropIfExists('ai_replenishment_analyses');
        Schema::dropIfExists('ai_product_import_items');
        Schema::dropIfExists('ai_product_imports');
        Schema::dropIfExists('ai_execution_events');
        Schema::dropIfExists('ai_executions');
        Schema::dropIfExists('ai_agents');

        if (Schema::hasColumns('suppliers', ['lead_time_days', 'min_order_qty'])) {
            Schema::table('suppliers', function (Blueprint $table): void {
                $table->dropColumn(['lead_time_days', 'min_order_qty']);
            });
        }
    }
};
