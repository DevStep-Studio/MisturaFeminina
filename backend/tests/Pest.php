<?php

use App\Models\IntegrationSetting;
use App\Models\Payment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

pest()->extend(TestCase::class)->use(RefreshDatabase::class)->in('Feature');

function realPaymentFakes(): void
{
    IntegrationSetting::firstOrCreate(['provider' => 'mercadopago'])->update(['is_active' => true, 'environment' => 'sandbox', 'public_config' => ['public_key' => 'TEST-public'], 'encrypted_credentials' => ['access_token' => 'TEST-token', 'webhook_secret' => 'sbx-secret-key-123']]);
    Http::preventStrayRequests();
    Http::fake(function (Request $request) {
        if ($request->method() === 'POST' && str_ends_with($request->url(), '/v1/payments')) {
            $rejected = str_contains((string) ($request['token'] ?? ''), 'rejected');

            return Http::response(['id' => 'pay_'.Str::random(8), 'status' => $rejected ? 'rejected' : (($request['payment_method_id'] ?? '') === 'pix' ? 'pending' : 'approved'), 'external_reference' => $request['external_reference'], 'transaction_amount' => $request['transaction_amount'], 'currency_id' => 'BRL', 'point_of_interaction' => ['transaction_data' => ['qr_code' => '000201-test-pix']]]);
        }
        if ($request->method() === 'GET' && str_contains($request->url(), '/v1/payments/')) {
            $id = basename(parse_url($request->url(), PHP_URL_PATH));
            $payment = Payment::where('external_payment_id', $id)->firstOrFail();

            return Http::response(['id' => $id, 'status' => 'approved', 'external_reference' => $payment->idempotency_key, 'transaction_amount' => $payment->gross_amount_cents / 100, 'currency_id' => 'BRL']);
        }
        throw new RuntimeException('Unexpected external request in test');
    });
}
