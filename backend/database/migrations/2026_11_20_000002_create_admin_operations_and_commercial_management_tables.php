<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            if (! Schema::hasColumn('orders', 'has_issue')) {
                $table->boolean('has_issue')->default(false)->after('status');
            }
            if (! Schema::hasColumn('orders', 'issue_reason')) {
                $table->string('issue_reason', 255)->nullable()->after('has_issue');
            }
            if (! Schema::hasColumn('orders', 'shipping_deadline_at')) {
                $table->timestamp('shipping_deadline_at')->nullable()->after('stock_reserved_until');
            }
            if (! Schema::hasColumn('orders', 'assisted_order_id')) {
                $table->unsignedBigInteger('assisted_order_id')->nullable()->index()->after('user_id');
            }
        });

        Schema::create('operational_tasks', function (Blueprint $table): void {
            $table->id();
            $table->string('task_key', 120)->nullable()->unique();
            $table->string('title', 200);
            $table->text('description')->nullable();
            $table->string('task_type', 50)->index();
            $table->string('priority', 20)->default('normal')->index();
            $table->string('status', 30)->default('pending')->index();
            $table->string('entity_type', 50)->nullable();
            $table->unsignedBigInteger('entity_id')->nullable();
            $table->string('action_url', 255)->nullable();
            $table->string('required_permission', 60)->default('dashboard.view');
            $table->foreignId('assigned_to_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('due_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->index(['entity_type', 'entity_id']);
        });

        Schema::create('assisted_orders', function (Blueprint $table): void {
            $table->id();
            $table->string('order_code', 40)->unique();
            $table->string('token', 64)->unique();
            $table->string('token_hash', 64)->index();
            $table->string('status', 30)->default('draft')->index();
            $table->foreignId('created_by_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('customer_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('customer_name', 150)->nullable();
            $table->string('customer_email', 190)->nullable();
            $table->string('customer_phone', 40)->nullable();
            $table->string('coupon_code', 60)->nullable();
            $table->text('notes')->nullable();
            $table->unsignedInteger('subtotal_cents')->default(0);
            $table->unsignedInteger('discount_cents')->default(0);
            $table->unsignedInteger('estimated_total_cents')->default(0);
            $table->foreignId('converted_order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->timestamp('link_generated_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('converted_at')->nullable();
            $table->timestamps();
        });

        Schema::create('assisted_order_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('assisted_order_id')->constrained('assisted_orders')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('product_variant_id')->constrained('product_variants')->cascadeOnDelete();
            $table->unsignedInteger('quantity');
            $table->unsignedInteger('unit_price_cents');
            $table->timestamps();
            $table->unique(['assisted_order_id', 'product_variant_id']);
        });

        Schema::create('assisted_order_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('assisted_order_id')->constrained('assisted_orders')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('event_type', 60);
            $table->string('description', 255);
            $table->json('payload')->nullable();
            $table->timestamps();
        });

        Schema::create('bulk_edit_batches', function (Blueprint $table): void {
            $table->id();
            $table->string('batch_code', 40)->unique();
            $table->string('idempotency_key', 100)->unique();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('source', 30)->default('grid');
            $table->string('status', 30)->default('completed');
            $table->unsignedInteger('total_rows')->default(0);
            $table->unsignedInteger('created_count')->default(0);
            $table->unsignedInteger('updated_count')->default(0);
            $table->unsignedInteger('failed_count')->default(0);
            $table->json('summary')->nullable();
            $table->timestamps();
        });

        Schema::create('bulk_edit_batch_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('bulk_edit_batch_id')->constrained('bulk_edit_batches')->cascadeOnDelete();
            $table->foreignId('product_id')->nullable()->constrained('products')->nullOnDelete();
            $table->foreignId('product_variant_id')->nullable()->constrained('product_variants')->nullOnDelete();
            $table->string('sku', 80);
            $table->string('action', 20);
            $table->json('old_values')->nullable();
            $table->json('new_values')->nullable();
            $table->string('error_message', 255)->nullable();
            $table->timestamps();
        });

        Schema::create('suppliers', function (Blueprint $table): void {
            $table->id();
            $table->string('name', 160);
            $table->string('document', 40)->nullable();
            $table->string('contact_name', 120)->nullable();
            $table->string('email', 190)->nullable();
            $table->string('phone', 40)->nullable();
            $table->text('notes')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('goods_receipts', function (Blueprint $table): void {
            $table->id();
            $table->string('receipt_number', 40)->unique();
            $table->foreignId('supplier_id')->nullable()->constrained('suppliers')->nullOnDelete();
            $table->string('invoice_number', 60)->nullable();
            $table->string('purchase_reference', 80)->nullable();
            $table->string('status', 30)->default('draft')->index();
            $table->timestamp('received_at');
            $table->foreignId('received_by_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('confirmed_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('confirmed_at')->nullable();
            $table->boolean('has_discrepancy')->default(false);
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('goods_receipt_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('goods_receipt_id')->constrained('goods_receipts')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('product_variant_id')->constrained('product_variants')->cascadeOnDelete();
            $table->string('sku_snapshot', 80);
            $table->unsignedInteger('expected_qty')->nullable();
            $table->unsignedInteger('received_qty');
            $table->unsignedInteger('accepted_qty');
            $table->unsignedInteger('rejected_qty')->default(0);
            $table->string('discrepancy_reason', 40)->nullable();
            $table->string('discrepancy_notes', 255)->nullable();
            $table->unsignedInteger('unit_cost_cents')->nullable();
            $table->string('lot_code', 80)->nullable();
            $table->date('manufactured_at')->nullable();
            $table->date('expires_at')->nullable();
            $table->timestamps();
        });

        Schema::create('inventory_lots', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('product_variant_id')->constrained('product_variants')->cascadeOnDelete();
            $table->foreignId('supplier_id')->nullable()->constrained('suppliers')->nullOnDelete();
            $table->foreignId('goods_receipt_id')->nullable()->constrained('goods_receipts')->nullOnDelete();
            $table->string('lot_code', 80);
            $table->date('manufactured_at')->nullable();
            $table->date('expires_at')->nullable()->index();
            $table->unsignedInteger('initial_qty');
            $table->unsignedInteger('remaining_qty');
            $table->timestamp('received_at');
            $table->timestamps();
            $table->index(['product_variant_id', 'lot_code']);
        });

        Schema::create('order_timeline_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('category', 30)->index();
            $table->string('event_type', 60);
            $table->string('title', 180);
            $table->text('description')->nullable();
            $table->string('origin', 30)->default('system');
            $table->string('actor_name', 120)->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('occurred_at')->index();
            $table->timestamps();
        });

        Schema::create('order_occurrences', function (Blueprint $table): void {
            $table->id();
            $table->string('occurrence_number', 40)->unique();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->foreignId('order_item_id')->nullable()->constrained('order_items')->nullOnDelete();
            $table->string('type', 40)->index();
            $table->string('priority', 20)->default('normal');
            $table->string('status', 30)->default('open')->index();
            $table->unsignedInteger('affected_qty')->default(1);
            $table->text('description');
            $table->string('resolution_type', 40)->nullable();
            $table->text('resolution_notes')->nullable();
            $table->string('reverse_tracking_code', 80)->nullable();
            $table->foreignId('assigned_to_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('due_at')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->json('product_snapshot')->nullable();
            $table->json('history_log')->nullable();
            $table->timestamps();
        });

        Schema::create('order_occurrence_notes', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->foreignId('order_occurrence_id')->nullable()->constrained('order_occurrences')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('note_type', 40)->default('internal');
            $table->text('body');
            $table->string('next_action', 255)->nullable();
            $table->timestamps();
        });

        Schema::create('search_query_logs', function (Blueprint $table): void {
            $table->id();
            $table->string('raw_term', 160);
            $table->string('normalized_term', 160)->index();
            $table->unsignedInteger('results_count')->default(0)->index();
            $table->string('category_slug', 120)->nullable();
            $table->string('session_id', 100)->nullable();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->timestamps();
        });

        Schema::create('search_synonyms', function (Blueprint $table): void {
            $table->id();
            $table->string('term', 120)->unique();
            $table->json('synonyms');
            $table->boolean('is_active')->default(true);
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('search_synonyms');
        Schema::dropIfExists('search_query_logs');
        Schema::dropIfExists('order_occurrence_notes');
        Schema::dropIfExists('order_occurrences');
        Schema::dropIfExists('order_timeline_events');
        Schema::dropIfExists('inventory_lots');
        Schema::dropIfExists('goods_receipt_items');
        Schema::dropIfExists('goods_receipts');
        Schema::dropIfExists('suppliers');
        Schema::dropIfExists('bulk_edit_batch_items');
        Schema::dropIfExists('bulk_edit_batches');
        Schema::dropIfExists('assisted_order_events');
        Schema::dropIfExists('assisted_order_items');
        Schema::dropIfExists('assisted_orders');
        Schema::dropIfExists('operational_tasks');

        Schema::table('orders', function (Blueprint $table): void {
            $cols = array_values(array_filter([
                Schema::hasColumn('orders', 'assisted_order_id') ? 'assisted_order_id' : null,
                Schema::hasColumn('orders', 'shipping_deadline_at') ? 'shipping_deadline_at' : null,
                Schema::hasColumn('orders', 'issue_reason') ? 'issue_reason' : null,
                Schema::hasColumn('orders', 'has_issue') ? 'has_issue' : null,
            ]));
            if ($cols !== []) {
                $table->dropColumn($cols);
            }
        });
    }
};
