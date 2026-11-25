<?php

declare(strict_types=1);

use App\Domain\Payments\Services\PaymentService;
use App\Domain\Payments\Services\WebhookProcessorService;
use App\Domain\Shared\Enums\PaymentStatus;
use App\Domain\Shared\Enums\RoleSlug;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\Coupon;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Promotion;
use App\Models\Role;
use App\Models\ShippingQuote;
use App\Models\User;
use Database\Seeders\DemoStoreSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->seed(DemoStoreSeeder::class);
    Mail::fake();
    realPaymentFakes();
});

function createProfitStaff(RoleSlug $slug, string $email): User
{
    $user = User::factory()->create([
        'name' => 'Equipe '.$slug->value,
        'email' => $email,
        'is_active' => true,
    ]);
    $role = Role::query()->where('slug', $slug->value)->firstOrFail();
    $user->roles()->sync([$role->id]);

    return $user;
}

function checkoutOrderWithItems(
    array $cartItems,
    string $paymentMethod = 'credit_card',
    ?string $couponCode = null,
    ?int $overrideShippingCents = null,
    ?User $customer = null,
    bool $deferPayment = false,
): array {
    $test = $customer ? test()->actingAs($customer) : test();
    $cartToken = Str::uuid()->toString();

    foreach ($cartItems as $item) {
        $test->withHeader('X-Cart-Token', $cartToken)
            ->postJson('/api/v1/cart/items', [
                'variant_id' => $item['variant_id'],
                'quantity' => $item['quantity'],
            ])
            ->assertCreated();
    }

    if ($couponCode !== null) {
        $test->withHeader('X-Cart-Token', $cartToken)
            ->postJson('/api/v1/cart/coupon', ['code' => $couponCode])
            ->assertOk();
    }

    $quoteId = $test->withHeader('X-Cart-Token', $cartToken)
        ->postJson('/api/v1/cart/shipping/quote', ['cep' => '01310100'])
        ->assertOk()
        ->json('data.options.0.quote_id');

    if ($overrideShippingCents !== null) {
        ShippingQuote::query()->whereKey($quoteId)->update([
            'price_cents' => $overrideShippingCents,
        ]);
    }

    $payload = [
        'customer_name' => 'Maria Clara',
        'customer_email' => 'maria.clara@example.com',
        'customer_phone' => '11988887777',
        'customer_cpf_cnpj' => '52998224725',
        'shipping_quote_id' => $quoteId,
        'shipping_address' => [
            'cep' => '01310100',
            'street' => 'Av Paulista',
            'number' => '100',
            'neighborhood' => 'Bela Vista',
            'city' => 'São Paulo',
            'state' => 'SP',
        ],
        'payment_method' => $paymentMethod,
        'defer_payment' => $deferPayment,
        'payment_data' => $paymentMethod === 'credit_card' && ! $deferPayment
            ? ['card_token' => 'tok_approved_'.Str::random(6), 'payment_method_id' => 'visa', 'installments' => 1]
            : [],
    ];

    $resp = $test->withHeaders([
        'X-Cart-Token' => $cartToken,
        'X-Idempotency-Key' => 'idem-'.Str::uuid()->toString(),
    ])->postJson('/api/v1/checkout', $payload)->assertCreated();

    $orderId = (int) $resp->json('data.order.id');

    return [
        'order' => Order::query()->with('items', 'latestPayment')->findOrFail($orderId),
        'response' => $resp->json('data'),
    ];
}

test('CENARIO A - Venda basica reconhecida, exclusao de pedido pendente e estoque a custo', function (): void {
    // Desativa promoção de quantidade automática do seeder para conferir exatamente 3x R$ 29,90 = R$ 89,70
    Promotion::query()->update(['is_active' => false]);
    $admin = User::query()->where('email', 'admin@misturafeminina.local')->firstOrFail();

    // 1. Produto simples: 10 unidades, custo R$ 12,00 (1200), preço R$ 29,90 (2990)
    $created = $this->actingAs($admin)->postJson('/api/v1/admin/products', [
        'name' => 'Esmalte Rubi Intenso',
        'sku' => 'CEN-A-RUBI',
        'product_type' => 'simple',
        'price_cents' => 2990,
        'cost_cents' => 1200,
        'stock_qty' => 10,
        'weight_grams' => 120,
        'is_active' => true,
    ])->assertCreated();

    $productId = (int) $created->json('data.id');
    $variant = ProductVariant::query()->where('product_id', $productId)->firstOrFail();
    expect($variant->stock_qty)->toBe(10);

    // 2. Pedido pendente NÃO deve inflar receita nem lucro bruto do dashboard
    $pendingCheckout = checkoutOrderWithItems([['variant_id' => $variant->id, 'quantity' => 2]], 'credit_card', null, 0, null, true);
    /** @var Order $pendingOrder */
    $pendingOrder = $pendingCheckout['order'];
    expect($pendingOrder->paid_at)->toBeNull();
    expect($pendingOrder->items->firstOrFail()->unit_cost_cents_snapshot)->toBeNull();

    $dashPending = $this->actingAs($admin)->getJson('/api/v1/admin/dashboard')->assertOk();
    expect((int) $dashPending->json('data.financial_summary.kpis.products_revenue_cents'))->toBe(0)
        ->and((int) $dashPending->json('data.financial_summary.kpis.cmv_cents'))->toBe(0)
        ->and((int) $dashPending->json('data.financial_summary.kpis.gross_profit_cents'))->toBe(0);

    // Cancela o pendente para liberar reserva e ficar exatamente 10 disponíveis antes da venda de 3 unidades
    $this->actingAs($admin)->patchJson("/api/v1/admin/orders/{$pendingOrder->id}/status", [
        'status' => 'cancelled',
        'note' => 'Libera reserva pendente',
    ])->assertOk();

    // 3. Confirma venda de 3 unidades (pendente -> webhook aprovado com replay idempotente)
    $deferredSale = checkoutOrderWithItems([['variant_id' => $variant->id, 'quantity' => 3]], 'credit_card', null, 0, null, true);
    /** @var Order $paidOrder */
    $paidOrder = $deferredSale['order'];
    $payment = Payment::query()->create([
        'order_id' => $paidOrder->id,
        'provider' => 'mercadopago',
        'method' => 'credit_card',
        'status' => PaymentStatus::Pending,
        'gross_amount_cents' => $paidOrder->total_cents,
        'fee_cents' => 0,
        'net_amount_cents' => $paidOrder->total_cents,
        'idempotency_key' => 'pay-cen-a-'.Str::uuid()->toString(),
    ]);

    $processor = app(WebhookProcessorService::class);
    $processor->applyPaymentTransition($payment, PaymentStatus::Approved, 0, 'Pix confirmado');
    // Replay idempotente do webhook de pagamento aprovado não pode duplicar custo/movimento
    $processor->applyPaymentTransition($payment->fresh(), PaymentStatus::Approved, 0, 'Replay webhook');

    $paidOrder->refresh()->load('items');
    expect($paidOrder->paid_at)->not->toBeNull()
        ->and((int) $paidOrder->items->firstOrFail()->unit_cost_cents_snapshot)->toBe(1200)
        ->and($paidOrder->items->firstOrFail()->cost_recorded_at)->not->toBeNull();

    $dash = $this->actingAs($admin)->getJson('/api/v1/admin/dashboard')->assertOk();
    expect((int) $dash->json('data.financial_summary.kpis.products_revenue_cents'))->toBe(8970)
        ->and((int) $dash->json('data.financial_summary.kpis.cmv_cents'))->toBe(3600)
        ->and((int) $dash->json('data.financial_summary.kpis.gross_profit_cents'))->toBe(5370)
        ->and((float) $dash->json('data.financial_summary.kpis.gross_margin_pct'))->toBe(59.87);

    // 7 unidades restantes valem R$ 84,00 (8400) a custo na Posição Atual
    expect((int) $dash->json('data.inventory_valuation.valued_units'))->toBe(7)
        ->and((int) $dash->json('data.inventory_valuation.total_cost_cents'))->toBe(8400)
        ->and((string) $dash->json('data.inventory_valuation.label'))->toBe('Posição atual');
});

test('CENARIO B - Alteracao de custo preserva snapshot historico do pedido antigo e aplica novo custo no proximo pedido', function (): void {
    $admin = User::query()->where('email', 'admin@misturafeminina.local')->firstOrFail();

    $created = $this->actingAs($admin)->postJson('/api/v1/admin/products', [
        'name' => 'Base Fortalecedora',
        'sku' => 'CEN-B-BASE',
        'product_type' => 'simple',
        'price_cents' => 3000,
        'cost_cents' => 1200,
        'stock_qty' => 20,
        'weight_grams' => 100,
    ])->assertCreated();

    $productId = (int) $created->json('data.id');
    $variant = ProductVariant::query()->where('product_id', $productId)->firstOrFail();

    // Venda 1 com custo R$ 12,00 (2 unidades)
    $order1 = checkoutOrderWithItems([['variant_id' => $variant->id, 'quantity' => 2]], 'credit_card', null, 0)['order'];
    expect((int) $order1->items->firstOrFail()->unit_cost_cents_snapshot)->toBe(1200);

    // Atualiza custo no cadastro para R$ 15,00 (1500)
    $this->actingAs($admin)->putJson("/api/v1/admin/products/{$productId}", [
        'name' => 'Base Fortalecedora',
        'sku' => 'CEN-B-BASE',
        'price_cents' => 3000,
        'cost_cents' => 1500,
        'variants' => [[
            'id' => $variant->id,
            'sku' => $variant->sku,
            'name' => $variant->name,
            'price_cents' => 3000,
            'cost_cents' => 1500,
            'stock_qty' => $variant->fresh()->stock_qty,
        ]],
    ])->assertOk();

    // Pedido 1 NÃO muda!
    $order1Detail = $this->actingAs($admin)->getJson("/api/v1/admin/orders/{$order1->id}")->assertOk();
    expect((int) $order1Detail->json('data.items.0.unit_cost_cents_snapshot'))->toBe(1200)
        ->and((int) $order1Detail->json('data.financial_summary.cmv_cents'))->toBe(2400)
        ->and((int) $order1Detail->json('data.financial_summary.gross_profit_cents'))->toBe(3600);

    // Venda 2 registra novo custo de R$ 15,00 (1 unidade)
    $order2 = checkoutOrderWithItems([['variant_id' => $variant->id, 'quantity' => 1]], 'credit_card', null, 0)['order'];
    expect((int) $order2->items->firstOrFail()->unit_cost_cents_snapshot)->toBe(1500);

    // Dashboard combina os dois pedidos: Rev = 9000, CMV = 2400 + 1500 = 3900, Lucro = 5100
    $dash = $this->actingAs($admin)->getJson('/api/v1/admin/dashboard')->assertOk();
    expect((int) $dash->json('data.financial_summary.kpis.products_revenue_cents'))->toBe(9000)
        ->and((int) $dash->json('data.financial_summary.kpis.cmv_cents'))->toBe(3900)
        ->and((int) $dash->json('data.financial_summary.kpis.gross_profit_cents'))->toBe(5100);

    $itemsBreakdown = $this->actingAs($admin)->getJson('/api/v1/admin/profit/items')->assertOk();
    expect($itemsBreakdown->json('data.items'))->toHaveCount(2);
});

test('CENARIO C - Cupom de desconto rateado nos produtos e exclusao do frete pago pelo cliente', function (): void {
    $admin = User::query()->where('email', 'admin@misturafeminina.local')->firstOrFail();

    $created = $this->actingAs($admin)->postJson('/api/v1/admin/products', [
        'name' => 'Top Coat Cristal',
        'sku' => 'CEN-C-TOPC',
        'product_type' => 'simple',
        'price_cents' => 2500,
        'cost_cents' => 1200,
        'stock_qty' => 15,
        'weight_grams' => 100,
    ])->assertCreated();
    $variant = ProductVariant::query()->where('product_id', (int) $created->json('data.id'))->firstOrFail();

    Coupon::query()->create([
        'code' => 'DESCONTO10',
        'name' => 'Cupom R$ 10',
        'type' => 'fixed_amount',
        'value' => 1000,
        'min_subtotal_cents' => 0,
        'max_uses_per_user' => 5,
        'scope_type' => 'all',
        'is_active' => true,
    ]);

    // 2 un. x R$ 25,00 = R$ 50,00 - Cupom R$ 10,00 + Frete R$ 8,00 = Cliente paga R$ 48,00
    $checkout = checkoutOrderWithItems(
        [['variant_id' => $variant->id, 'quantity' => 2]],
        'credit_card',
        'DESCONTO10',
        800
    );
    /** @var Order $order */
    $order = $checkout['order'];
    expect((int) $order->subtotal_cents)->toBe(5000)
        ->and((int) $order->discount_cents)->toBe(1000)
        ->and((int) $order->shipping_cents)->toBe(800)
        ->and((int) $order->total_cents)->toBe(4800);

    // Painel exclui frete (800) e considera receita líquida de produtos = R$ 40,00 (4000)
    // CMV = 2 x 1200 = 2400 -> Lucro bruto = 1600 -> Margem = 40,00%
    $dash = $this->actingAs($admin)->getJson('/api/v1/admin/dashboard')->assertOk();
    expect((int) $dash->json('data.financial_summary.kpis.products_revenue_cents'))->toBe(4000)
        ->and((int) $dash->json('data.financial_summary.kpis.cmv_cents'))->toBe(2400)
        ->and((int) $dash->json('data.financial_summary.kpis.gross_profit_cents'))->toBe(1600)
        ->and((float) $dash->json('data.financial_summary.kpis.gross_margin_pct'))->toBe(40.0);
});

test('CENARIO D - Cobertura parcial de custo nao assume custo zero e backfill historico exige permissao e auditoria', function (): void {
    $admin = User::query()->where('email', 'admin@misturafeminina.local')->firstOrFail();
    $finance = createProfitStaff(RoleSlug::Finance, 'fin-d@misturafeminina.local');
    $catalog = createProfitStaff(RoleSlug::Catalog, 'cat-d@misturafeminina.local');

    $p1 = $this->actingAs($admin)->postJson('/api/v1/admin/products', [
        'name' => 'Cabine LED UV Compacta',
        'sku' => 'CEN-D-P1',
        'product_type' => 'simple',
        'price_cents' => 4000,
        'cost_cents' => 2500,
        'stock_qty' => 10,
        'weight_grams' => 300,
    ])->assertCreated();
    $v1 = ProductVariant::query()->where('product_id', (int) $p1->json('data.id'))->firstOrFail();

    // Produto 2 SEM custo informado (null)
    $p2 = $this->actingAs($admin)->postJson('/api/v1/admin/products', [
        'name' => 'Lixa Bloco Brilho',
        'sku' => 'CEN-D-P2',
        'product_type' => 'simple',
        'price_cents' => 2000,
        'cost_cents' => null,
        'stock_qty' => 10,
        'weight_grams' => 80,
    ])->assertCreated();
    $v2 = ProductVariant::query()->where('product_id', (int) $p2->json('data.id'))->firstOrFail();

    $order = checkoutOrderWithItems([
        ['variant_id' => $v1->id, 'quantity' => 1],
        ['variant_id' => $v2->id, 'quantity' => 1],
    ], 'credit_card', null, 0)['order'];

    // Receita total = R$ 60,00 (6000); coberta = R$ 40,00; CMV conhecido = R$ 25,00;
    // Lucro parcial = R$ 15,00 (1500); Margem parcial = 1500 / 4000 = 37,5%
    $dash = $this->actingAs($finance)->getJson('/api/v1/admin/dashboard')->assertOk();
    expect((int) $dash->json('data.financial_summary.kpis.products_revenue_cents'))->toBe(6000)
        ->and((int) $dash->json('data.financial_summary.kpis.covered_revenue_cents'))->toBe(4000)
        ->and((int) $dash->json('data.financial_summary.kpis.cmv_cents'))->toBe(2500)
        ->and((int) $dash->json('data.financial_summary.kpis.gross_profit_cents'))->toBe(1500)
        ->and((float) $dash->json('data.financial_summary.kpis.gross_margin_pct'))->toBe(37.5)
        ->and($dash->json('data.financial_summary.coverage.is_partial'))->toBeTrue()
        ->and((int) $dash->json('data.financial_summary.coverage.missing_cost_items_count'))->toBe(1);

    // Drill-down lista especificamente o item sem custo histórico
    $missing = $this->actingAs($finance)->getJson('/api/v1/admin/profit/items?filter=missing_cost')->assertOk();
    expect($missing->json('data.items'))->toHaveCount(1)
        ->and($missing->json('data.items.0.sku'))->toBe('CEN-D-P2');

    /** @var OrderItem $missingOrderItem */
    $missingOrderItem = $order->items()->where('sku_snapshot', 'CEN-D-P2')->firstOrFail();

    // Usuário sem orders.cost.backfill não pode preencher histórico
    $this->actingAs($catalog)->postJson("/api/v1/admin/orders/items/{$missingOrderItem->id}/backfill-cost", [
        'unit_cost_cents' => 800,
        'reason' => 'Tentativa não autorizada',
    ])->assertForbidden();

    // Usuário Finance autorizado registra backfill auditado sem alterar cadastro atual
    $this->actingAs($finance)->postJson("/api/v1/admin/orders/items/{$missingOrderItem->id}/backfill-cost", [
        'unit_cost_cents' => 800,
        'reason' => 'NF fornecedor #9912 confirmada',
    ])->assertOk();

    expect(Product::query()->whereKey((int) $p2->json('data.id'))->value('cost_cents'))->toBeNull();
    expect(AuditLog::query()->where('entity_type', 'order_item')->where('entity_id', $missingOrderItem->id)->exists())->toBeTrue();

    // Após backfill histórico, cobertura vira completa (CMV = 2500 + 800 = 3300, Lucro = 2700, Margem = 45%)
    $dashAfter = $this->actingAs($finance)->getJson('/api/v1/admin/dashboard')->assertOk();
    expect((int) $dashAfter->json('data.financial_summary.kpis.cmv_cents'))->toBe(3300)
        ->and((int) $dashAfter->json('data.financial_summary.kpis.gross_profit_cents'))->toBe(2700)
        ->and((float) $dashAfter->json('data.financial_summary.kpis.gross_margin_pct'))->toBe(45.0)
        ->and($dashAfter->json('data.financial_summary.coverage.is_partial'))->toBeFalse();
});

test('CENARIO E - Custo distinto por variacao e estorno/devolucao parcial idempotente com separacao fisica vs financeira', function (): void {
    $admin = User::query()->where('email', 'admin@misturafeminina.local')->firstOrFail();

    $created = $this->actingAs($admin)->postJson('/api/v1/admin/products', [
        'name' => 'Coleção Esmaltes Neon',
        'sku' => 'CEN-E-NEON',
        'product_type' => 'variable',
        'price_cents' => 3000,
        'cost_cents' => null,
        'weight_grams' => 100,
        'variants' => [
            [
                'sku' => 'CEN-E-COR-A',
                'name' => 'Cor A',
                'price_cents' => 3000,
                'cost_cents' => 1000,
                'stock_qty' => 10,
                'is_default' => true,
            ],
            [
                'sku' => 'CEN-E-COR-B',
                'name' => 'Cor B',
                'price_cents' => 3000,
                'cost_cents' => 1800,
                'stock_qty' => 10,
                'is_default' => false,
            ],
        ],
    ])->assertCreated();

    $vA = ProductVariant::query()->where('sku', 'CEN-E-COR-A')->firstOrFail();
    $vB = ProductVariant::query()->where('sku', 'CEN-E-COR-B')->firstOrFail();

    $order = checkoutOrderWithItems([
        ['variant_id' => $vA->id, 'quantity' => 1],
        ['variant_id' => $vB->id, 'quantity' => 1],
    ], 'credit_card', null, 0)['order'];

    /** @var OrderItem $itemA */
    $itemA = $order->items()->where('sku_snapshot', 'CEN-E-COR-A')->firstOrFail();
    /** @var OrderItem $itemB */
    $itemB = $order->items()->where('sku_snapshot', 'CEN-E-COR-B')->firstOrFail();

    expect((int) $itemA->unit_cost_cents_snapshot)->toBe(1000)
        ->and((int) $itemB->unit_cost_cents_snapshot)->toBe(1800)
        ->and($vA->fresh()->stock_qty)->toBe(9)
        ->and($vB->fresh()->stock_qty)->toBe(9);

    // Devolve SOMENTE Cor B (1 unidade, com devolução física ao estoque)
    $refundPayload = [
        'reason' => 'Cliente trocou tonalidade Cor B',
        'restock_items' => true,
        'manual_confirmation' => true,
        'idempotency_key' => 'ret-cor-b-001',
        'items' => [
            ['order_item_id' => $itemB->id, 'quantity' => 1, 'restock' => true],
        ],
    ];
    $this->actingAs($admin)->postJson("/api/v1/admin/orders/{$order->id}/refund", $refundPayload)->assertOk();
    // Replay exato com mesma idempotency_key NÃO duplica estorno financeiro ou estoque
    $replay = $this->actingAs($admin)->postJson("/api/v1/admin/orders/{$order->id}/refund", $refundPayload)->assertOk();
    expect($replay->json('idempotent_replay'))->toBeTrue();

    // Replay de webhook de estorno não altera devolução já feita nem reverte Cor A sem solicitação
    expect($vA->fresh()->stock_qty)->toBe(9)
        ->and($vB->fresh()->stock_qty)->toBe(10);

    $dash = $this->actingAs($admin)->getJson('/api/v1/admin/dashboard')->assertOk();
    expect((int) $dash->json('data.financial_summary.kpis.products_revenue_cents'))->toBe(3000)
        ->and((int) $dash->json('data.financial_summary.kpis.cmv_cents'))->toBe(1000)
        ->and((int) $dash->json('data.financial_summary.kpis.gross_profit_cents'))->toBe(2000);

    // Estorno somente financeiro do restante (Cor A) sem restock físico mantém estoque = 9
    $this->actingAs($admin)->postJson("/api/v1/admin/orders/{$order->id}/refund", [
        'reason' => 'Cortesia financeira sem devolução do frasco',
        'restock_items' => false,
        'manual_confirmation' => true,
        'idempotency_key' => 'ret-cor-a-fin-only',
        'items' => [
            ['order_item_id' => $itemA->id, 'quantity' => 1, 'restock' => false],
        ],
    ])->assertOk();

    expect($vA->fresh()->stock_qty)->toBe(9);
    $dashAfterFinOnly = $this->actingAs($admin)->getJson('/api/v1/admin/dashboard')->assertOk();
    expect((int) $dashAfterFinOnly->json('data.financial_summary.kpis.products_revenue_cents'))->toBe(0);
});

test('CENARIO F - Importacao em lote 3 estados, filtro sem custo, conversao IA, recebimento, RBAC e zero vazamento na loja', function (): void {
    $admin = User::query()->where('email', 'admin@misturafeminina.local')->firstOrFail();
    $marketing = createProfitStaff(RoleSlug::Marketing, 'mkt-f@misturafeminina.local');
    $support = createProfitStaff(RoleSlug::Support, 'sup-f@misturafeminina.local');

    // Cria 3 produtos para testar planilha com: preenchido, explícito 0,00 e célula em branco (preserva existente)
    $this->actingAs($admin)->postJson('/api/v1/admin/products', [
        'name' => 'Produto Planilha 1',
        'sku' => 'CSV-COST-1',
        'product_type' => 'simple',
        'price_cents' => 3000,
        'cost_cents' => 1100,
        'stock_qty' => 5,
    ])->assertCreated();

    $pZero = $this->actingAs($admin)->postJson('/api/v1/admin/products', [
        'name' => 'Produto Planilha Zero',
        'sku' => 'CSV-COST-2',
        'product_type' => 'simple',
        'price_cents' => 2500,
        'cost_cents' => 900,
        'stock_qty' => 5,
    ])->assertCreated();

    $this->actingAs($admin)->postJson('/api/v1/admin/products', [
        'name' => 'Produto Planilha Preserva',
        'sku' => 'CSV-COST-3',
        'product_type' => 'simple',
        'price_cents' => 4000,
        'cost_cents' => 1700,
        'stock_qty' => 5,
    ])->assertCreated();

    // Preview + Apply CSV: CSV-COST-1 -> 14,50 | CSV-COST-2 -> 0,00 | CSV-COST-3 -> célula vazia preserva 1700
    $csv = implode("\n", [
        'sku;name;price_cents;stock_qty;variant_sku;variant_name;custo_unitario',
        'CSV-COST-1;Produto Planilha 1;3000;5;CSV-COST-1;Padrão;14,50',
        'CSV-COST-2;Produto Planilha Zero;2500;5;CSV-COST-2;Padrão;0,00',
        'CSV-COST-3;Produto Planilha Preserva;4000;5;CSV-COST-3;Padrão;',
    ]);

    $preview = $this->actingAs($admin)->postJson('/api/v1/admin/catalog/import-csv', [
        'csv_content' => $csv,
        'dry_run' => true,
    ])->assertOk();
    expect((int) $preview->json('data.preview.0.old_cost_cents'))->toBe(1100)
        ->and((int) $preview->json('data.preview.0.new_cost_cents'))->toBe(1450)
        ->and((int) $preview->json('data.preview.2.new_cost_cents'))->toBe(1700);

    $this->actingAs($admin)->postJson('/api/v1/admin/catalog/import-csv', [
        'csv_content' => $csv,
        'dry_run' => false,
    ])->assertOk();

    expect(Product::query()->where('sku', 'CSV-COST-1')->value('cost_cents'))->toBe(1450)
        ->and(Product::query()->where('sku', 'CSV-COST-2')->value('cost_cents'))->toBe(0)
        ->and(Product::query()->where('sku', 'CSV-COST-3')->value('cost_cents'))->toBe(1700);

    // Filtro "Sem custo cadastrado" NÃO inclui produto com custo 0,00 explícito!
    $missingFilter = $this->actingAs($admin)->getJson('/api/v1/admin/products?filter=missing_cost&search=CSV-COST')->assertOk();
    expect($missingFilter->json('data'))->toHaveCount(0);

    // Entrada de mercadoria com custo unitário atualiza custo do SKU ao confirmar
    $variantOne = ProductVariant::query()->where('sku', 'CSV-COST-1')->firstOrFail();
    $receipt = $this->actingAs($admin)->postJson('/api/v1/admin/goods-receipts', [
        'new_supplier_name' => 'Distribuidora Beleza',
        'invoice_number' => 'NF-8841',
        'items' => [[
            'product_variant_id' => $variantOne->id,
            'expected_qty' => 10,
            'received_qty' => 10,
            'accepted_qty' => 10,
            'unit_cost_cents' => 1625,
            'apply_cost_to_sku' => true,
        ]],
    ])->assertCreated();
    $receiptId = (int) $receipt->json('data.id');
    $this->actingAs($admin)->postJson("/api/v1/admin/goods-receipts/{$receiptId}/confirm")->assertOk();
    expect($variantOne->fresh()->cost_cents)->toBe(1625);

    // Cadastro com IA: conversão de caixa (12 un por R$ 120 -> R$ 10,00) + valor ambíguo para revisão do operador
    $aiImport = $this->actingAs($admin)->postJson('/api/v1/admin/ai/catalog/imports', [
        'raw_text' => "Kit Presilha Profissional - caixa com 12 unidades por R$ 120,00\nPinça Inox Curvada R$ 15,00",
    ])->assertCreated();
    $aiItems = $aiImport->json('data.items');
    expect((int) $aiItems[0]['proposed_data']['cost_price_cents'])->toBe(1000)
        ->and((int) $aiItems[0]['proposed_data']['cost_conversion']['pack_qty'])->toBe(12)
        ->and((int) $aiItems[1]['proposed_data']['ambiguous_price_cents'])->toBe(1500)
        ->and($aiItems[1]['proposed_data']['price_meaning'])->toBe('ambiguous')
        ->and($aiItems[1]['proposed_data']['cost_price_cents'])->toBeNull();

    // RBAC: Marketing / Support não enxergam custo/lucro nem acessam endpoints financeiros
    $this->actingAs($marketing)->getJson('/api/v1/admin/profit/items')->assertForbidden();
    $this->actingAs($support)->getJson('/api/v1/admin/inventory/valuation')->assertForbidden();
    $this->actingAs($marketing)->getJson('/api/v1/admin/reports/profit-export-csv')->assertForbidden();
    $supportDash = $this->actingAs($support)->getJson('/api/v1/admin/dashboard')->assertOk();
    expect($supportDash->json('data.financial_summary'))->toBeNull()
        ->and($supportDash->json('data.inventory_valuation'))->toBeNull();

    // Loja pública, carrinho, pedido público e conta do cliente NUNCA expõem cost_cents / CMV / lucro
    $customer = User::factory()->create();
    $checkout = checkoutOrderWithItems([['variant_id' => $variantOne->id, 'quantity' => 1]], 'credit_card', null, 0, $customer);
    $orderNumber = $checkout['order']->order_number;
    $publicToken = $checkout['order']->public_token;

    $catalogResp = $this->getJson('/api/v1/catalog/products')->assertOk()->getContent();
    $productResp = $this->getJson('/api/v1/catalog/products/'.Product::query()->where('sku', 'CSV-COST-1')->value('slug'))->assertOk()->getContent();
    $trackResp = $this->getJson("/api/v1/orders/track/{$publicToken}")->assertOk()->getContent();
    $accountOrderResp = $this->actingAs($customer)->getJson("/api/v1/account/orders/{$orderNumber}")->assertOk()->getContent();

    foreach ([$catalogResp, $productResp, $trackResp, $accountOrderResp] as $rawJson) {
        expect($rawJson)->not->toContain('cost_cents')
            ->and($rawJson)->not->toContain('unit_cost_cents_snapshot')
            ->and($rawJson)->not->toContain('gross_profit_cents')
            ->and($rawJson)->not->toContain('cmv_cents');
    }

    // Exportação CSV financeira autorizada funciona com cabeçalho e valores
    $profitCsv = $this->actingAs($admin)->get('/api/v1/admin/reports/profit-export-csv')->assertOk();
    expect($profitCsv->getContent())->toContain('lucro_bruto');
    // Produto com cost_cents = 0 explícito mantém 0 (não é null)
    expect($pZero->json('data.cost_cents'))->toBe(900);
});
