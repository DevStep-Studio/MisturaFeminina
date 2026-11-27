<?php

declare(strict_types=1);

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Review;
use App\Models\User;
use Database\Seeders\DemoStoreSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->seed(DemoStoreSeeder::class);
});

it('allows customer to submit review with photos, variant and privacy formatting', function (): void {
    $product = Product::query()->where('is_active', true)->firstOrFail();
    $variant = $product->variants()->first();

    $res = $this->postJson("/api/v1/catalog/products/{$product->slug}/reviews", [
        'rating' => 5,
        'title' => 'Excelente cobertura e durabilidade',
        'body' => 'Usei no salão nas minhas clientes e o brilho durou mais de 20 dias intacto.',
        'author_name' => 'Mariana Fernandes Silva',
        'author_email' => 'mariana.silva@teste.local',
        'variant_id' => $variant?->id,
        'photos' => ['/storage/reviews/unha-cliente-1.webp', '/storage/reviews/unha-cliente-2.webp'],
    ]);

    $res->assertStatus(201);
    $res->assertJsonPath('message', 'Obrigada! Sua avaliação foi enviada para moderação.');

    $review = Review::query()->where('product_id', $product->id)->latest('id')->first();
    expect($review)->not->toBeNull();
    // Privacy check: Mariana Silva -> Mariana S.
    expect($review->author_name)->toBe('Mariana S.');
    expect($review->rating)->toBe(5);
    expect($review->photos)->toHaveCount(2);
    expect($review->status)->toBe('pending');
    expect($review->is_external)->toBeFalse();
});

it('marks review as verified purchase if user has paid order with the product', function (): void {
    $user = User::query()->where('is_active', true)->firstOrFail();
    $variant = ProductVariant::query()->where('is_active', true)->firstOrFail();
    $product = $variant->product;

    $order = Order::query()->create([
        'user_id' => $user->id,
        'order_number' => 'MF-' . date('Ymd') . '-' . strtoupper(Str::random(6)),
        'public_token' => Str::random(40),
        'idempotency_key' => Str::uuid()->toString(),
        'customer_name' => $user->name,
        'customer_email' => $user->email,
        'customer_phone' => '11999998888',
        'customer_cpf_cnpj' => '52998224725',
        'status' => 'paid',
        'payment_provider' => 'mercadopago',
        'payment_environment' => 'sandbox',
        'payment_method' => 'pix',
        'subtotal_cents' => 3500,
        'discount_cents' => 0,
        'shipping_cents' => 0,
        'total_cents' => 3500,
        'items_count' => 1,
        'shipping_address_snapshot' => [
            'cep' => '01310100',
            'street' => 'Av Paulista',
            'number' => '1000',
            'city' => 'São Paulo',
            'state' => 'SP',
        ],
        'shipping_service_snapshot' => 'PAC',
    ]);

    OrderItem::query()->create([
        'order_id' => $order->id,
        'product_id' => $product->id,
        'product_variant_id' => $variant->id,
        'product_name_snapshot' => $product->name,
        'variant_name_snapshot' => $variant->name,
        'sku_snapshot' => $variant->sku,
        'unit_price_cents' => 3500,
        'quantity' => 1,
        'subtotal_cents' => 3500,
        'discount_cents' => 0,
        'total_cents' => 3500,
    ]);

    $res = $this->actingAs($user)->postJson("/api/v1/catalog/products/{$product->slug}/reviews", [
        'rating' => 5,
        'body' => 'Produto original e entrega super rápida!',
    ]);

    $res->assertStatus(201);
    $review = Review::query()->where('product_id', $product->id)->latest('id')->first();
    expect($review->is_verified_purchase)->toBeTrue();
});

it('allows uploading review photo with validation', function (): void {
    $file = UploadedFile::fake()->image('review-nails.png', 800, 800);

    $res = $this->postJson('/api/v1/catalog/reviews/upload-photo', [
        'file' => $file,
    ]);

    $res->assertStatus(201);
    $res->assertJsonStructure(['data' => ['path']]);
    expect($res->json('data.path'))->toContain('reviews/');
});
