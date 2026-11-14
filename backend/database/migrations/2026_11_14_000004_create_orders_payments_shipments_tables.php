<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('orders', function (Blueprint $table): void {
            $table->id();
            $table->string('order_number', 40)->unique();
            $table->uuid('public_token')->unique();
            $table->string('idempotency_key', 100)->unique();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->boolean('is_guest')->default(false);
            $table->string('customer_name', 150);
            $table->string('customer_email', 190)->index();
            $table->string('customer_phone', 30);
            $table->string('customer_cpf_cnpj', 20)->nullable();
            $table->json('shipping_address_snapshot');
            $table->json('shipping_service_snapshot');
            $table->unsignedBigInteger('subtotal_cents');
            $table->unsignedBigInteger('discount_cents')->default(0);
            $table->string('coupon_code', 60)->nullable();
            $table->unsignedBigInteger('shipping_cents')->default(0);
            $table->unsignedBigInteger('tax_cents')->default(0);
            $table->unsignedBigInteger('total_cents');
            $table->string('status', 40)->default('pending_payment')->index();
            $table->text('notes_customer')->nullable();
            $table->text('notes_internal')->nullable();
            $table->timestamp('stock_reserved_until')->nullable()->index();
            $table->timestamp('paid_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamps();
            $table->index(['created_at', 'status']);
        });

        Schema::create('order_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('product_variant_id')->nullable()->constrained()->nullOnDelete();
            $table->string('product_name_snapshot', 200);
            $table->string('variant_name_snapshot', 160);
            $table->string('sku_snapshot', 80);
            $table->unsignedInteger('quantity');
            $table->unsignedBigInteger('unit_price_cents');
            $table->unsignedBigInteger('discount_cents')->default(0);
            $table->unsignedBigInteger('total_cents');
            $table->unsignedInteger('weight_grams_snapshot')->default(200);
            $table->timestamps();
        });

        Schema::create('order_status_histories', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('from_status', 40)->nullable();
            $table->string('to_status', 40);
            $table->string('note', 500)->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
        });

        Schema::create('coupon_redemptions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('coupon_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('customer_email', 190)->index();
            $table->unsignedBigInteger('discount_cents');
            $table->timestamps();
            $table->unique(['coupon_id', 'order_id']);
        });

        Schema::create('payments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->string('provider', 40); // mercadopago
            $table->string('environment', 20)->default('sandbox');
            $table->string('external_order_id', 120)->nullable()->index();
            $table->string('external_payment_id', 120)->nullable()->index();
            $table->string('idempotency_key', 100)->unique();
            $table->string('method', 30); // pix, credit_card, debit_card
            $table->unsignedTinyInteger('installments')->default(1);
            $table->unsignedBigInteger('gross_amount_cents');
            $table->unsignedBigInteger('fee_cents')->default(0);
            $table->unsignedBigInteger('net_amount_cents')->default(0);
            $table->string('status', 40)->default('pending')->index();
            $table->longText('pix_qr_code_base64')->nullable();
            $table->text('pix_copy_paste')->nullable();
            $table->timestamp('pix_expires_at')->nullable();
            $table->string('card_last_four', 4)->nullable();
            $table->string('card_brand', 40)->nullable();
            $table->string('failure_reason', 255)->nullable();
            $table->json('raw_sanitized_response')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();
        });

        Schema::create('payment_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('payment_id')->nullable()->constrained()->nullOnDelete();
            $table->string('provider', 40);
            $table->string('external_event_id', 120)->nullable();
            $table->string('topic', 80)->nullable();
            $table->string('action', 80)->nullable();
            $table->string('deduplication_key', 160)->unique();
            $table->boolean('signature_valid')->default(false);
            $table->json('payload');
            $table->string('status', 30)->default('received')->index();
            $table->string('error_message', 500)->nullable();
            $table->timestamp('processed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('refunds', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('payment_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('external_refund_id', 120)->nullable();
            $table->unsignedBigInteger('amount_cents');
            $table->string('reason', 255);
            $table->string('status', 30)->default('pending');
            $table->boolean('restock_items')->default(false);
            $table->timestamps();
        });

        Schema::create('shipments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->string('carrier', 80);
            $table->string('service_code', 60);
            $table->string('service_name', 120);
            $table->string('tracking_code', 120)->nullable()->index();
            $table->string('tracking_url', 500)->nullable();
            $table->string('label_url', 500)->nullable();
            $table->string('label_status', 30)->default('pending');
            $table->unsignedInteger('weight_grams')->default(200);
            $table->json('dimensions')->nullable();
            $table->timestamp('shipped_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamps();
        });

        Schema::create('tracking_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('shipment_id')->constrained()->cascadeOnDelete();
            $table->timestamp('occurred_at');
            $table->string('status', 80);
            $table->string('location', 160)->nullable();
            $table->string('description', 500);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tracking_events');
        Schema::dropIfExists('shipments');
        Schema::dropIfExists('refunds');
        Schema::dropIfExists('payment_events');
        Schema::dropIfExists('payments');
        Schema::dropIfExists('coupon_redemptions');
        Schema::dropIfExists('order_status_histories');
        Schema::dropIfExists('order_items');
        Schema::dropIfExists('orders');
    }
};
