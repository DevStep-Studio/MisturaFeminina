<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->unsignedBigInteger('checkout_cart_id')->nullable()->index();
            $table->string('checkout_fingerprint', 64)->nullable();
            $table->string('payment_provider')->nullable();
            $table->string('payment_environment')->nullable();
            $table->string('payment_method')->nullable();
        });
        Schema::table('payments', function (Blueprint $table): void {
            $table->string('request_fingerprint', 64)->nullable();
            $table->text('checkout_url')->nullable();
            $table->text('boleto_url')->nullable();
            $table->text('barcode')->nullable();
            $table->timestamp('provider_updated_at')->nullable();
        });
        Schema::table('shipping_quotes', function (Blueprint $table): void {
            $table->string('items_fingerprint', 64)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('orders', fn (Blueprint $table) => $table->dropColumn(['checkout_cart_id', 'checkout_fingerprint', 'payment_provider', 'payment_environment', 'payment_method']));
        Schema::table('payments', fn (Blueprint $table) => $table->dropColumn(['request_fingerprint', 'checkout_url', 'boleto_url', 'barcode', 'provider_updated_at']));
        Schema::table('shipping_quotes', fn (Blueprint $table) => $table->dropColumn('items_fingerprint'));
    }
};
