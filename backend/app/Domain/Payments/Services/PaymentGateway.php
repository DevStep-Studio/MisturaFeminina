<?php

namespace App\Domain\Payments\Services;

use App\Models\Payment;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;

class PaymentGateway
{
    public function __construct(private PaymentSettings $settings) {}

    private function client(string $provider, string $environment): PendingRequest
    {
        abort_unless($this->settings->get($provider, 'environment') === $environment, 503, 'Configure as credenciais do ambiente original do pagamento para conciliá-lo.');
        if ($provider === 'mercadopago') {
            abort_unless($this->settings->get('mercadopago', 'access_token'), 503, 'Credenciais Mercado Pago ausentes.');

            return Http::baseUrl('https://api.mercadopago.com')->withToken($this->settings->get('mercadopago', 'access_token'))->acceptJson()->connectTimeout(5)->timeout(25)->withoutRedirecting();
        }
        abort_unless($this->settings->get('asaas', 'api_key'), 503, 'Credenciais Asaas ausentes.');

        return Http::baseUrl($environment === 'production' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3')->withHeaders(['access_token' => $this->settings->get('asaas', 'api_key'), 'User-Agent' => 'DevStep-Checkout/1.0'])->acceptJson()->connectTimeout(5)->timeout(25)->withoutRedirecting();
    }

    private function request(string $provider, string $environment, string $method, string $path, array $data = [], ?string $idempotency = null): array
    {
        try {
            $client = $this->client($provider, $environment);
            if ($idempotency) {
                $client = $client->withHeaders(['X-Idempotency-Key' => $idempotency]);
            }
            $response = $method === 'GET' ? $client->get($path, $data) : $client->post($path, $data);
        } catch (ConnectionException) {
            throw new GatewayFailure(true);
        }
        if (! $response->successful() || ! is_array($response->json())) {
            $body = $response->json();
            $codes = [];
            if (is_array($body)) {
                $codes[] = GatewayFailure::safeCode($body['error'] ?? null);
                foreach (is_array($body['cause'] ?? null) ? array_slice($body['cause'], 0, 10) : [] as $cause) {
                    $codes[] = GatewayFailure::safeCode(is_array($cause) ? ($cause['code'] ?? null) : null);
                }
            }
            throw new GatewayFailure(
                $response->successful() || $response->status() >= 500 || in_array($response->status(), [408, 429], true),
                $response->status(),
                array_values(array_unique(array_filter($codes))),
            );
        }

        return $response->json();
    }

    public function create(Payment $attempt, array $input): array
    {
        $order = $attempt->order;
        $buyer = ['name' => $order->customer_name, 'email' => $order->customer_email, 'document' => preg_replace('/\D/', '', $order->customer_cpf_cnpj ?? ''), 'phone' => preg_replace('/\D/', '', $order->customer_phone)];
        $address = $order->shipping_address_snapshot;
        $address['zip'] = $address['cep'];
        $address['district'] = $address['neighborhood'];
        if ($attempt->provider === 'mercadopago') {
            $names = preg_split('/\s+/', trim($buyer['name']));
            $firstName = array_shift($names);
            $lastName = implode(' ', $names) ?: $firstName;
            $method = $attempt->method->value;
            $payload = ['transaction_amount' => $order->total_cents / 100, 'description' => ('Pedido '.$order->order_number), 'external_reference' => $attempt->idempotency_key,  'payment_method_id' => match ($method) {
                'pix' => 'pix','boleto' => 'bolbradesco',default => $input['payment_method_id']
            }, 'payer' => ['email' => $buyer['email'], 'first_name' => $firstName, 'last_name' => $lastName, 'identification' => ['type' => strlen($buyer['document']) === 11 ? 'CPF' : 'CNPJ', 'number' => $buyer['document']], 'address' => ['zip_code' => $address['zip'], 'street_name' => $address['street'], 'street_number' => $address['number'], 'neighborhood' => $address['district'], 'city' => $address['city'], 'federal_unit' => $address['state']]], 'additional_info' => ['items' => $order->items->map(fn ($item) => ['id' => (string) $item->product_variant_id, 'title' => $item->product_name_snapshot, 'quantity' => $item->quantity, 'unit_price' => $item->unit_price_cents / 100])->all()]];
            $notification = rtrim((string) config('checkout.webhook_base_url'), '/').'/api/v1/webhooks/mercadopago';
            if (parse_url($notification, PHP_URL_SCHEME) === 'https') {
                $payload['notification_url'] = $notification;
            }
            if ($method === 'credit_card') {
                $payload['token'] = $input['card_token'];
                $payload['installments'] = 1;
                if (! empty($input['issuer_id'])) {
                    $payload['issuer_id'] = $input['issuer_id'];
                }
            }
            if ($method === 'boleto') {
                $payload['date_of_expiration'] = now()->addDays(config('checkout.boleto_days'))->format('Y-m-d\\TH:i:s.000P');
            }

            return $this->request($attempt->provider, $attempt->environment, 'POST', '/v1/payments', $payload, $attempt->idempotency_key);
        }
        // Search by a stable customer reference; a timeout never causes a blind payment retry.
        $reference = 'user-'.$order->user_id.'-'.substr(hash('sha256', json_encode([$buyer, $address], JSON_THROW_ON_ERROR)), 0, 24);
        try {
            $customers = $this->request('asaas', $attempt->environment, 'GET', '/customers', ['externalReference' => $reference, 'limit' => 1]);
            $customer = $customers['data'][0] ?? null;
            if (! $customer) {
                $customer = $this->request('asaas', $attempt->environment, 'POST', '/customers', ['name' => $buyer['name'], 'cpfCnpj' => $buyer['document'], 'email' => $buyer['email'], 'mobilePhone' => $buyer['phone'], 'postalCode' => $address['zip'], 'address' => $address['street'], 'addressNumber' => $address['number'], 'complement' => $address['complement'] ?? null, 'province' => $address['district'], 'externalReference' => $reference, 'notificationDisabled' => true]);
            }
            if (! isset($customer['id'])) {
                throw new GatewayFailure(false);
            }

        } catch (GatewayFailure $e) {
            throw new GatewayFailure(false, $e->httpStatus, $e->providerCodes);
        }

        return $this->request('asaas', $attempt->environment, 'POST', '/payments', ['customer' => $customer['id'], 'billingType' => match ($attempt->method->value) {
            'pix' => 'PIX','boleto' => 'BOLETO',default => 'CREDIT_CARD'
        }, 'value' => $order->total_cents / 100, 'dueDate' => now()->addDays(config('checkout.boleto_days'))->toDateString(), 'description' => ('Pedido '.$order->order_number), 'externalReference' => $attempt->idempotency_key, 'callback' => ['successUrl' => rtrim(config('app.frontend_url'), '/').'/pedido/'.$order->public_token.'/confirmacao', 'autoRedirect' => false]]);
    }

    public function find(Payment $attempt): ?array
    {
        if ($attempt->external_payment_id) {
            return $this->request($attempt->provider, $attempt->environment, 'GET', $attempt->provider === 'mercadopago' ? '/v1/payments/'.$attempt->external_payment_id : '/payments/'.$attempt->external_payment_id);
        }
        $response = $this->request($attempt->provider, $attempt->environment, 'GET', $attempt->provider === 'mercadopago' ? '/v1/payments/search' : '/payments', [$attempt->provider === 'mercadopago' ? 'external_reference' : 'externalReference' => $attempt->idempotency_key, 'limit' => 2]);
        $rows = $response[$attempt->provider === 'mercadopago' ? 'results' : 'data'] ?? [];
        if (count($rows) > 1) {
            throw new GatewayFailure(true);
        }

        return $rows[0] ?? null;
    }

    public function get(string $provider, string $environment, string $id): array
    {
        return $this->request($provider, $environment, 'GET', $provider === 'mercadopago' ? '/v1/payments/'.$id : '/payments/'.$id);
    }

    public static function safeUrl(mixed $url, string $provider): ?string
    {
        if (! is_string($url) || strlen($url) > 2048) {
            return null;
        }
        $parts = parse_url($url);
        $host = strtolower($parts['host'] ?? '');
        $hosts = $provider === 'asaas' ? ['asaas.com', 'www.asaas.com', 'sandbox.asaas.com'] : ['mercadopago.com.br', 'www.mercadopago.com.br', 'www.mercadopago.com', 'mercadopago.com', 'www.mercadopago.com.ar'];

        return ($parts['scheme'] ?? '') === 'https' && ! isset($parts['user']) && ! isset($parts['pass']) && ! isset($parts['port']) && in_array($host, $hosts, true) ? $url : null;
    }
}
