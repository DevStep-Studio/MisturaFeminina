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

it('allows admin to store authorized external review without verified purchase flag', function (): void {
    $admin = User::query()->where('email', 'admin@misturafeminina.local')->firstOrFail();
    $product = Product::query()->where('is_active', true)->firstOrFail();

    $res = $this->actingAs($admin)->postJson('/api/v1/admin/reviews/external', [
        'product_id' => $product->id,
        'author_name' => 'Renata Calheiros',
        'rating' => 4,
        'title' => 'Excelente sucção e acabamento',
        'body' => 'Muito bom para a mesa de manicure. Remove toda a poeira com eficiência.',
        'source_name' => 'Jack Cosméticos',
        'source_url' => 'https://jackcosmeticos.com.br/produtos/coletor-de-po-sc808-1',
        'variant_name' => 'Bivolt',
        'photos' => ['/storage/reviews/coletor-mesa.webp'],
        'status' => 'approved',
    ]);

    $res->assertStatus(201);
    $review = Review::query()->where('product_id', $product->id)->latest('id')->first();
    expect($review)->not->toBeNull();
    expect($review->is_external)->toBeTrue();
    expect($review->is_verified_purchase)->toBeFalse();
    expect($review->author_name)->toBe('Renata C.');
    expect($review->source_name)->toBe('Jack Cosméticos');
    expect($review->source_url)->toBe('https://jackcosmeticos.com.br/produtos/coletor-de-po-sc808-1');
    expect($review->status)->toBe('approved');
});

it('allows admin to hide a review with administrative justification notes', function (): void {
    $admin = User::query()->where('email', 'admin@misturafeminina.local')->firstOrFail();
    $product = Product::query()->where('is_active', true)->firstOrFail();

    $review = Review::query()->create([
        'product_id' => $product->id,
        'user_id' => null,
        'author_name' => 'Renata C.',
        'rating' => 4,
        'title' => 'Avaliação externa de teste',
        'body' => 'Produto muito bom, porém importado de outra loja sem termo assinado.',
        'is_external' => true,
        'source_name' => 'Jack Cosméticos',
        'status' => 'approved',
    ]);

    $res = $this->actingAs($admin)->patchJson("/api/v1/admin/reviews/{$review->id}", [
        'status' => 'hidden',
        'admin_notes' => 'Ocultada da vitrine: avaliação externa sem comprovação formal de autorização.',
    ]);

    $res->assertStatus(200);
    $res->assertJsonPath('data.status', 'hidden');
    $res->assertJsonPath('data.admin_notes', 'Ocultada da vitrine: avaliação externa sem comprovação formal de autorização.');

    $fresh = $review->fresh();
    expect($fresh->status)->toBe('hidden');
    expect($fresh->admin_notes)->toBe('Ocultada da vitrine: avaliação externa sem comprovação formal de autorização.');
});

it('does not display hidden, pending or rejected reviews in public product detail', function (): void {
    $product = Product::query()->where('is_active', true)->firstOrFail();

    $approved = Review::query()->create([
        'product_id' => $product->id,
        'author_name' => 'Cliente Aprovada M.',
        'rating' => 5,
        'body' => 'Esta avaliação deve aparecer no site normalmente.',
        'status' => 'approved',
    ]);

    $hidden = Review::query()->create([
        'product_id' => $product->id,
        'author_name' => 'Cliente Ocultada X.',
        'rating' => 4,
        'body' => 'Esta avaliação NÃO deve aparecer na vitrine pública.',
        'status' => 'hidden',
        'admin_notes' => 'Ocultada para moderação preventiva.',
    ]);

    $rejected = Review::query()->create([
        'product_id' => $product->id,
        'author_name' => 'Cliente Rejeitado Y.',
        'rating' => 1,
        'body' => 'Comentário impróprio rejeitado.',
        'status' => 'rejected',
    ]);

    $res = $this->getJson("/api/v1/catalog/products/{$product->slug}");
    $res->assertStatus(200);

    $reviews = $res->json('data.reviews');
    $reviewIds = array_column($reviews, 'id');

    expect($reviewIds)->toContain($approved->id);
    expect($reviewIds)->not->toContain($hidden->id);
    expect($reviewIds)->not->toContain($rejected->id);
});

it('filters reviews by status and origin in admin reviews list', function (): void {
    $admin = User::query()->where('email', 'admin@misturafeminina.local')->firstOrFail();
    $product = Product::query()->where('is_active', true)->firstOrFail();

    Review::query()->create([
        'product_id' => $product->id,
        'author_name' => 'Cliente Interno',
        'rating' => 5,
        'body' => 'Comentário interno aprovado',
        'is_external' => false,
        'status' => 'approved',
    ]);

    Review::query()->create([
        'product_id' => $product->id,
        'author_name' => 'Externo Ocultado',
        'rating' => 4,
        'body' => 'Comentário externo ocultado',
        'is_external' => true,
        'source_name' => 'Jack Cosméticos',
        'status' => 'hidden',
        'admin_notes' => 'Ocultada sem documento formal.',
    ]);

    // Filtro por status=hidden
    $resHidden = $this->actingAs($admin)->getJson('/api/v1/admin/reviews?status=hidden');
    $resHidden->assertStatus(200);
    $hiddenData = $resHidden->json('data');
    foreach ($hiddenData as $item) {
        expect($item['status'])->toBe('hidden');
    }

    // Filtro por is_external=true
    $resExt = $this->actingAs($admin)->getJson('/api/v1/admin/reviews?is_external=true');
    $resExt->assertStatus(200);
    $extData = $resExt->json('data');
    foreach ($extData as $item) {
        expect((bool) $item['is_external'])->toBeTrue();
    }
});
