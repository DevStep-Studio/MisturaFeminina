<?php

return [
    'webhook_base_url' => env('PAYMENTS_WEBHOOK_BASE_URL', env('APP_URL')),
    'provider' => env('PAYMENTS_DEFAULT_PROVIDER', 'mercadopago'),
    'mercadopago' => ['enabled' => (bool) env('MERCADO_PAGO_ENABLED', false), 'environment' => env('MERCADO_PAGO_ENVIRONMENT', 'sandbox'), 'access_token' => env('MERCADO_PAGO_ACCESS_TOKEN'), 'public_key' => env('MERCADO_PAGO_PUBLIC_KEY'), 'webhook_secret' => env('MERCADO_PAGO_WEBHOOK_SECRET')],
    'asaas' => ['enabled' => (bool) env('ASAAS_ENABLED', false), 'environment' => env('ASAAS_ENVIRONMENT', 'sandbox'), 'api_key' => env('ASAAS_API_KEY'), 'webhook_token' => env('ASAAS_WEBHOOK_TOKEN')],
    'plupag' => ['enabled' => (bool) env('PLUPAG_ENABLED', false), 'environment' => env('PLUPAG_ENVIRONMENT', 'sandbox'), 'api_key' => env('PLUPAG_API_KEY'), 'api_secret' => env('PLUPAG_API_SECRET'), 'public_key' => env('PLUPAG_PUBLIC_KEY'), 'webhook_secret' => env('PLUPAG_WEBHOOK_SECRET')],
    'correios' => ['enabled' => (bool) env('CORREIOS_ENABLED', false), 'environment' => env('CORREIOS_ENVIRONMENT', 'sandbox'), 'username' => env('CORREIOS_USERNAME'), 'password' => env('CORREIOS_API_PASSWORD'), 'card' => env('CORREIOS_POSTING_CARD'), 'contract' => env('CORREIOS_CONTRACT'), 'regional' => env('CORREIOS_REGIONAL'), 'origin_zip' => env('CORREIOS_ORIGIN_ZIP'), 'services' => array_filter(explode(',', env('CORREIOS_SERVICES', '')))],
    'quote_minutes' => 15,
    'boleto_days' => 3,
];
