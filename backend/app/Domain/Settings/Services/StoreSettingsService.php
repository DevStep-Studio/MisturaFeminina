<?php

declare(strict_types=1);

namespace App\Domain\Settings\Services;

use App\Models\IntegrationSetting;
use App\Models\StoreSetting;
use Illuminate\Support\Facades\Cache;

class StoreSettingsService
{
    public const CACHE_KEY = 'storefront.settings.public.v1';

    /** @return array<string, mixed> */
    public static function defaults(): array
    {
        return [
            'store_name' => 'Mistura Feminina Cosméticos',
            'tagline' => 'Beleza, autocuidado e alta performance para você e seu estúdio',
            'logo_light_url' => '/storage/brand/logo-mf.png',
            'logo_dark_url' => '/storage/brand/logo-mf-dark.png',
            'favicon_url' => '/storage/brand/favicon.png',
            'primary_color' => '#C22583',
            'primary_hover_color' => '#9E1A69',
            'secondary_color' => '#62298D',
            'accent_color' => '#EF4EEB',
            'font_family' => 'Plus Jakarta Sans',
            'cnpj' => '00.000.000/0001-00 (A definir antes da publicação)',
            'company_legal_name' => 'Mistura Feminina Cosméticos Ltda.',
            'address' => 'Endereço comercial a definir no backoffice',
            'origin_cep' => '01001000',
            'email' => 'atendimento@misturafeminina.local',
            'phone' => '(11) 0000-0000',
            'whatsapp_number' => '5511900000000',
            'whatsapp_default_message' => 'Olá! Gostaria de atendimento sobre um produto da Mistura Feminina Cosméticos.',
            'social_instagram' => '',
            'social_tiktok' => '',
            'social_youtube' => '',
            'free_shipping_threshold_cents' => 29900,
            'max_installments' => 6,
            'installment_min_value_cents' => 2000,
            'wholesale_enabled' => false,
            'maintenance_mode' => false,
            'benefits_ticker' => [
                'Parcelamento em até 6x sem juros*',
                'Frete grátis acima de R$ 299,00*',
                'Envio rápido para todo o Brasil',
                'Compra 100% protegida com Pix e Cartão',
            ],
            'benefits_row' => [
                ['icon' => 'credit-card', 'title' => 'Parcelamento', 'subtitle' => 'Em até 6x sem juros'],
                ['icon' => 'truck', 'title' => 'Envios', 'subtitle' => 'Enviamos para todo Brasil'],
                ['icon' => 'message-circle', 'title' => 'Atendimento', 'subtitle' => 'via WhatsApp'],
                ['icon' => 'shield-check', 'title' => 'Site 100% Seguro', 'subtitle' => 'Selo de segurança'],
                ['icon' => 'tag', 'title' => 'Desconto de 10%', 'subtitle' => 'cupom: BEMVINDA10'],
            ],
            'popup_enabled' => false,
            'popup_title' => 'Boas-vindas à Mistura Feminina Cosméticos',
            'popup_subtitle' => 'Aproveite 10% OFF na sua primeira compra com o cupom:',
            'popup_coupon_code' => 'BEMVINDA10',
            'ga4_id' => '',
            'meta_pixel_id' => '',
            'seo_default_title' => 'Mistura Feminina Cosméticos | Loja Oficial',
            'seo_default_description' => 'Cosméticos, esmaltes, cuidados faciais, cabelos e acessórios profissionais na Mistura Feminina Cosméticos.',
        ];
    }

    /** @return array<string, mixed> */
    public function getPublicConfig(): array
    {
        return Cache::remember(self::CACHE_KEY, 300, function (): array {
            $merged = self::defaults();
            $rows = StoreSetting::query()->where('is_public', true)->get();
            foreach ($rows as $row) {
                $val = $row->value;
                if (is_array($val) && array_key_exists('val', $val)) {
                    $merged[$row->key] = $val['val'];
                } else {
                    $merged[$row->key] = $val;
                }
            }

            $mp = IntegrationSetting::query()->where('provider', 'mercadopago')->first();
            $merged['payment_environment'] = $mp ? $mp->environment : 'sandbox';
            $merged['mercadopago_public_key'] = $mp?->public_config['public_key'] ?? '';
            $merged['payment_sandbox_mode'] = ($mp ? $mp->environment : 'sandbox') !== 'production';

            return $merged;
        });
    }

    /** @param array<string, mixed> $values */
    public function setMany(array $values, string $group = 'general', bool $isPublic = true): void
    {
        foreach ($values as $key => $value) {
            StoreSetting::query()->updateOrCreate(
                ['key' => $key],
                [
                    'group' => $group,
                    'value' => ['val' => $value],
                    'is_public' => $isPublic,
                ]
            );
        }
        $this->clearCache();
    }

    public function clearCache(): void
    {
        Cache::forget(self::CACHE_KEY);
    }

    public function forgetCache(): void
    {
        $this->clearCache();
    }
}
