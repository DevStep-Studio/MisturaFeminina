<?php

declare(strict_types=1);

namespace App\Domain\Shipping\Services;

use App\Domain\Settings\Services\StoreSettingsService;
use App\Models\StoreSetting;

class RegionalFreeShippingService
{
    public const SETTING_KEY = 'regional_free_shipping_rules';

    /**
     * Regras padrão conforme especificação de negócio da Mistura Feminina:
     * - RJ: R$ 150,00 (15000 centavos) - Tratado antes dos demais estados do Sudeste
     * - Sudeste (SP, MG, ES): R$ 299,90 (29990 centavos)
     * - Sul e Centro-Oeste: R$ 499,90 (49990 centavos)
     * - Norte e Nordeste: R$ 799,90 (79990 centavos)
     *
     * @return list<array{
     *   id: string,
     *   name: string,
     *   ufs: list<string>,
     *   min_subtotal_cents: int,
     *   eligible_service_codes: list<string>,
     *   is_active: bool
     * }>
     */
    public static function defaultRules(): array
    {
        return [
            [
                'id' => 'rj',
                'name' => 'Rio de Janeiro (RJ)',
                'ufs' => ['RJ'],
                'min_subtotal_cents' => 15000, // R$ 150,00
                'eligible_service_codes' => ['PAC-BRASIL', 'pac', '04510'],
                'is_active' => true,
            ],
            [
                'id' => 'sudeste',
                'name' => 'Demais estados do Sudeste (SP, MG, ES)',
                'ufs' => ['SP', 'MG', 'ES'],
                'min_subtotal_cents' => 29990, // R$ 299,90
                'eligible_service_codes' => ['PAC-BRASIL', 'pac', '04510'],
                'is_active' => true,
            ],
            [
                'id' => 'sul_centro_oeste',
                'name' => 'Sul e Centro-Oeste (PR, SC, RS, GO, MT, MS, DF)',
                'ufs' => ['PR', 'SC', 'RS', 'GO', 'MT', 'MS', 'DF'],
                'min_subtotal_cents' => 49990, // R$ 499,90
                'eligible_service_codes' => ['PAC-BRASIL', 'pac', '04510'],
                'is_active' => true,
            ],
            [
                'id' => 'norte_nordeste',
                'name' => 'Norte e Nordeste (AC, AP, AM, PA, RO, RR, TO, AL, BA, CE, MA, PB, PE, PI, RN, SE)',
                'ufs' => ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO', 'AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
                'min_subtotal_cents' => 79990, // R$ 799,90
                'eligible_service_codes' => ['PAC-BRASIL', 'pac', '04510'],
                'is_active' => true,
            ],
        ];
    }

    /**
     * Retorna as regras ativas configuradas no banco ou as padrão.
     *
     * @return list<array{
     *   id: string,
     *   name: string,
     *   ufs: list<string>,
     *   min_subtotal_cents: int,
     *   eligible_service_codes: list<string>,
     *   is_active: bool
     * }>
     */
    public function getRules(): array
    {
        $setting = StoreSetting::query()->where('key', self::SETTING_KEY)->first();
        if ($setting && is_array($setting->value) && isset($setting->value['rules'])) {
            return $setting->value['rules'];
        }

        return self::defaultRules();
    }

    /**
     * Salva ou atualiza as regras no banco de dados.
     *
     * @param list<array<string, mixed>> $rules
     */
    public function saveRules(array $rules): array
    {
        StoreSetting::query()->updateOrCreate(
            ['key' => self::SETTING_KEY],
            [
                'group' => 'shipping',
                'value' => ['rules' => $rules],
                'is_public' => true,
            ]
        );

        app(StoreSettingsService::class)->clearCache();

        return $this->getRules();
    }

    /**
     * Infere a UF a partir dos dígitos do CEP brasileiro de 8 dígitos.
     */
    public function inferUfFromCep(string $cepDigits): ?string
    {
        $digits = preg_replace('/\D/', '', $cepDigits);
        if (strlen($digits) !== 8) {
            return null;
        }

        $prefix2 = (int) substr($digits, 0, 2);
        $prefix3 = (int) substr($digits, 0, 3);

        return match (true) {
            // SP: 01000 a 19999
            $prefix2 >= 1 && $prefix2 <= 19 => 'SP',

            // RJ: 20000 a 28999
            $prefix2 >= 20 && $prefix2 <= 28 => 'RJ',

            // ES: 29000 a 29999
            $prefix2 === 29 => 'ES',

            // MG: 30000 a 39999
            $prefix2 >= 30 && $prefix2 <= 39 => 'MG',

            // BA: 40000 a 48999
            $prefix2 >= 40 && $prefix2 <= 48 => 'BA',

            // SE: 49000 a 49999
            $prefix2 === 49 => 'SE',

            // PE: 50000 a 56999
            $prefix2 >= 50 && $prefix2 <= 56 => 'PE',

            // AL: 57000 a 57999
            $prefix2 === 57 => 'AL',

            // PB: 58000 a 58999
            $prefix2 === 58 => 'PB',

            // RN: 59000 a 59999
            $prefix2 === 59 => 'RN',

            // CE: 60000 a 63999
            $prefix2 >= 60 && $prefix2 <= 63 => 'CE',

            // PI: 64000 a 64999
            $prefix2 === 64 => 'PI',

            // MA: 65000 a 65999
            $prefix2 === 65 => 'MA',

            // AP: 68900 a 68999
            $prefix3 === 689 => 'AP',

            // PA: 66000 a 68899
            $prefix2 >= 66 && $prefix2 <= 68 => 'PA',

            // RR: 69300 a 69399
            $prefix3 === 693 => 'RR',

            // AC: 69900 a 69999
            $prefix3 === 699 => 'AC',

            // AM: 69000 a 69299 e 69400 a 69899
            $prefix2 === 69 => 'AM',

            // RO: 76800 a 76999 e 78900 a 78999
            ($prefix3 >= 768 && $prefix3 <= 769) || $prefix3 === 789 => 'RO',

            // DF: 70000 a 72799 e 73000 a 73699
            ($prefix3 >= 700 && $prefix3 <= 727) || ($prefix3 >= 730 && $prefix3 <= 736) => 'DF',

            // GO: 72800 a 72999 e 73700 a 76799
            ($prefix3 >= 728 && $prefix3 <= 729) || ($prefix3 >= 737 && $prefix3 <= 767) => 'GO',

            // TO: 77000 a 77999
            $prefix2 === 77 => 'TO',

            // MT: 78000 a 78899
            $prefix2 === 78 => 'MT',

            // MS: 79000 a 79999
            $prefix2 === 79 => 'MS',

            // PR: 80000 a 87999
            $prefix2 >= 80 && $prefix2 <= 87 => 'PR',

            // SC: 88000 a 89999
            $prefix2 >= 88 && $prefix2 <= 89 => 'SC',

            // RS: 90000 a 99999
            $prefix2 >= 90 && $prefix2 <= 99 => 'RS',

            default => null,
        };
    }

    /**
     * Resolve a regra regional para uma determinada UF, respeitando a ordem de precedência:
     * RJ é avaliado antes do Sudeste geral.
     *
     * @return array{
     *   id: string,
     *   name: string,
     *   ufs: list<string>,
     *   min_subtotal_cents: int,
     *   eligible_service_codes: list<string>,
     *   is_active: bool
     * }|null
     */
    public function resolveRuleForUf(string $uf): ?array
    {
        $normalizedUf = strtoupper(trim($uf));
        $rules = $this->getRules();

        foreach ($rules as $rule) {
            if (! ($rule['is_active'] ?? true)) {
                continue;
            }
            if (in_array($normalizedUf, $rule['ufs'], true)) {
                return $rule;
            }
        }

        return null;
    }

    /**
     * Avalia a elegibilidade de frete grátis com base no CEP e no subtotal líquido de produtos.
     *
     * @return array{
     *   uf: string|null,
     *   region_id: string|null,
     *   region_name: string|null,
     *   min_subtotal_cents: int|null,
     *   remaining_cents: int|null,
     *   is_unlocked: bool,
     *   message: string,
     *   eligible_service_codes: list<string>
     * }
     */
    public function evaluate(string $rawCep, int $netSubtotalCents): array
    {
        $uf = $this->inferUfFromCep($rawCep);
        if ($uf === null) {
            return [
                'uf' => null,
                'region_id' => null,
                'region_name' => null,
                'min_subtotal_cents' => null,
                'remaining_cents' => null,
                'is_unlocked' => false,
                'message' => 'Informe seu CEP para consultar as condições de frete grátis.',
                'eligible_service_codes' => [],
            ];
        }

        $rule = $this->resolveRuleForUf($uf);
        if ($rule === null) {
            return [
                'uf' => $uf,
                'region_id' => null,
                'region_name' => null,
                'min_subtotal_cents' => null,
                'remaining_cents' => null,
                'is_unlocked' => false,
                'message' => "Condições de frete grátis não disponíveis para a região ({$uf}).",
                'eligible_service_codes' => [],
            ];
        }

        $minCents = (int) $rule['min_subtotal_cents'];
        $isUnlocked = $netSubtotalCents >= $minCents;
        $remainingCents = max(0, $minCents - $netSubtotalCents);

        if ($isUnlocked) {
            $msg = "Você ganhou frete grátis para o {$uf} nas opções elegíveis!";
        } else {
            $formattedRemaining = 'R$ ' . number_format($remainingCents / 100, 2, ',', '.');
            $msg = "Faltam {$formattedRemaining} para você ganhar frete grátis no {$uf}.";
        }

        return [
            'uf' => $uf,
            'region_id' => $rule['id'],
            'region_name' => $rule['name'],
            'min_subtotal_cents' => $minCents,
            'remaining_cents' => $remainingCents,
            'is_unlocked' => $isUnlocked,
            'message' => $msg,
            'eligible_service_codes' => $rule['eligible_service_codes'] ?? ['PAC-BRASIL'],
        ];
    }
}
