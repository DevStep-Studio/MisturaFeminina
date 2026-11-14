<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Domain\Security\Services\RbacSeederService;
use App\Domain\Settings\Services\StoreSettingsService;
use App\Domain\Shared\Enums\ProductType;
use App\Domain\Shared\Enums\RoleSlug;
use App\Models\Attribute;
use App\Models\AttributeValue;
use App\Models\Banner;
use App\Models\Brand;
use App\Models\Category;
use App\Models\ContentPage;
use App\Models\Coupon;
use App\Models\CustomerProfile;
use App\Models\HomeSection;
use App\Models\IntegrationSetting;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\ProductKitItem;
use App\Models\ProductVariant;
use App\Models\Promotion;
use App\Models\Role;
use App\Models\ShippingRule;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\File;

class DemoStoreSeeder extends Seeder
{
    public function run(): void
    {
        app(RbacSeederService::class)->syncRolesAndPermissions();

        if (app()->isProduction()) {
            return;
        }

        $this->generateSeedAssets();
        $this->seedSettings();
        $this->seedUsers();
        $brands = $this->seedBrands();
        $categories = $this->seedCategories();
        $attrs = $this->seedAttributes();
        $this->seedProducts($brands, $categories, $attrs);
        $this->seedMarketingAndShipping();
        $this->seedContent();
    }

    private function generateSeedAssets(): void
    {
        $dir = storage_path('app/public/seed');
        File::ensureDirectoryExists($dir);

        File::put($dir.'/logo-light.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 56" width="280" height="56"><rect width="44" height="44" x="4" y="6" rx="10" fill="#8B2252"/><path d="M16 36V20l10 10 10-10v16" stroke="#FFFFFF" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><text x="60" y="29" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="700" fill="#231F20">Mistura Feminina</text><text x="60" y="45" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="600" letter-spacing="2" fill="#8B2252">COSMÉTICOS</text></svg>');

        File::put($dir.'/logo-dark.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 56" width="280" height="56"><rect width="44" height="44" x="4" y="6" rx="10" fill="#FFFFFF"/><path d="M16 36V20l10 10 10-10v16" stroke="#8B2252" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><text x="60" y="29" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="700" fill="#FFFFFF">Mistura Feminina</text><text x="60" y="45" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="600" letter-spacing="2" fill="#F3D5E2">COSMÉTICOS</text></svg>');

        File::put($dir.'/favicon.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#8B2252"/><path d="M16 45V19l16 15 16-15v26" stroke="#FFFFFF" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>');

        $banners = [
            'hero-1-desktop.svg' => [1440, 440, '#231F20', '#8B2252', 'SEMANA DA BELEZA', 'Até 35% OFF em Esmaltes, Skincare e Cabelos', 'BEMVINDA10: 10% OFF NA 1ª COMPRA'],
            'hero-1-mobile.svg' => [768, 420, '#231F20', '#8B2252', 'SEMANA DA BELEZA', 'Até 35% OFF no catálogo selecionado', 'CUPOM BEMVINDA10'],
            'hero-2-desktop.svg' => [1440, 440, '#8B2252', '#C44577', 'CUIDADOS DIÁRIOS', 'Sérum, hidratação intensa e proteção solar', 'FRETE GRÁTIS ACIMA DE R$ 299'],
            'hero-2-mobile.svg' => [768, 420, '#8B2252', '#C44577', 'CUIDADOS DIÁRIOS', 'Sérum e hidratação de alta performance', 'PARCELE EM 6X SEM JUROS'],
            'promo-1.svg' => [700, 260, '#5E1537', '#FFFFFF', 'UNHAS & GEL', 'Esmaltes e preparação profissional', 'VER LINHA'],
            'promo-2.svg' => [700, 260, '#231F20', '#F7E9EF', 'KITS COM DESCONTO', 'Monte sua rotina completa economizando', 'VER KITS'],
        ];

        foreach ($banners as $filename => [$w, $h, $bg, $accent, $eyebrow, $title, $sub]) {
            $svg = sprintf(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d"><rect width="%d" height="%d" fill="%s"/><rect x="%d" y="%d" width="%d" height="%d" rx="18" fill="%s"/><text x="%d" y="%d" font-family="system-ui,sans-serif" font-size="%d" font-weight="700" letter-spacing="2" fill="#FFFFFF">%s</text><text x="%d" y="%d" font-family="system-ui,sans-serif" font-size="%d" font-weight="800" fill="#FFFFFF">%s</text><text x="%d" y="%d" font-family="system-ui,sans-serif" font-size="%d" font-weight="600" fill="#FCE7F0">%s</text></svg>',
                $w, $h, $w, $h, $w, $h, $bg,
                (int) round($w * 0.68), (int) round($h * 0.16), (int) round($w * 0.25), (int) round($h * 0.68), $accent,
                (int) round($w * 0.06), (int) round($h * 0.34), $h > 300 ? 18 : 14, htmlspecialchars($eyebrow, ENT_XML1),
                (int) round($w * 0.06), (int) round($h * 0.54), $h > 300 ? 36 : 24, htmlspecialchars($title, ENT_XML1),
                (int) round($w * 0.06), (int) round($h * 0.72), $h > 300 ? 20 : 15, htmlspecialchars($sub, ENT_XML1),
            );
            File::put($dir.'/'.$filename, $svg);
        }

        $productPalette = [
            'prod-esmalte' => ['#8B2252', 'Esmalte Gel', '15ml'],
            'prod-serum' => ['#A8436A', 'Sérum Facial', '30ml'],
            'prod-batom' => ['#9E1C42', 'Batom Velvet', '4g'],
            'prod-mascara' => ['#4A1F38', 'Máscara Capilar', '300g'],
            'prod-hidratante' => ['#6B385B', 'Loção Hidratante', '200ml'],
            'prod-cabine' => ['#2B2628', 'Cabine LED UV', '48W'],
            'prod-oleo' => ['#7E425D', 'Óleo Reparador', '60ml'],
            'prod-kit' => ['#8B2252', 'Kit Cronograma', '3 Itens'],
            'prod-base' => ['#A06278', 'Base Soft Matte', '30ml'],
            'prod-primer' => ['#60374A', 'Primer Preparador', '15ml'],
            'prod-bruma' => ['#7D4E66', 'Bruma Fixadora', '120ml'],
            'prod-pincel' => ['#3B2F34', 'Kit Pincéis', '8 Peças'],
        ];

        foreach ($productPalette as $file => [$tone, $label, $vol]) {
            $svg = sprintf(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600"><rect width="600" height="600" fill="#FAF7F8"/><rect x="195" y="130" width="210" height="310" rx="28" fill="%s"/><rect x="235" y="88" width="130" height="54" rx="10" fill="#231F20"/><rect x="220" y="210" width="160" height="150" rx="14" fill="#FFFFFF"/><text x="300" y="268" text-anchor="middle" font-family="system-ui,sans-serif" font-size="22" font-weight="700" fill="#231F20">%s</text><text x="300" y="302" text-anchor="middle" font-family="system-ui,sans-serif" font-size="16" font-weight="600" fill="#8B2252">Mistura Feminina</text><text x="300" y="335" text-anchor="middle" font-family="system-ui,sans-serif" font-size="15" fill="#666666">%s</text></svg>',
                $tone,
                htmlspecialchars($label, ENT_XML1),
                htmlspecialchars($vol, ENT_XML1),
            );
            File::put($dir.'/'.$file.'.svg', $svg);
        }
    }

    private function seedSettings(): void
    {
        app(StoreSettingsService::class)->setMany(StoreSettingsService::defaults(), 'storefront', true);

        IntegrationSetting::query()->updateOrCreate(
            ['provider' => 'mercadopago'],
            [
                'environment' => (string) env('MERCADOPAGO_ENV', 'sandbox'),
                'public_config' => ['public_key' => (string) env('MERCADOPAGO_PUBLIC_KEY', '')],
                'is_active' => true,
                'last_healthcheck_status' => 'sandbox_ready',
            ]
        );

        IntegrationSetting::query()->updateOrCreate(
            ['provider' => 'melhorenvio'],
            [
                'environment' => (string) env('MELHOR_ENVIO_ENV', 'sandbox'),
                'public_config' => ['origin_cep' => (string) env('STORE_ORIGIN_CEP', '01001000')],
                'is_active' => true,
                'last_healthcheck_status' => 'fallback_table_active',
            ]
        );
    }

    private function seedUsers(): void
    {
        $admin = User::query()->updateOrCreate(
            ['email' => 'admin@misturafeminina.local'],
            [
                'name' => 'Administrador Mistura Feminina',
                'phone' => '(11) 99999-0001',
                'password' => 'Mistura@Admin2026!',
                'is_active' => true,
                'email_verified_at' => now(),
            ]
        );
        $superRole = Role::query()->where('slug', RoleSlug::Superadmin->value)->first();
        if ($superRole) {
            $admin->roles()->sync([$superRole->id]);
        }

        $marketing = User::query()->updateOrCreate(
            ['email' => 'marketing@misturafeminina.local'],
            [
                'name' => 'Equipe Marketing',
                'password' => 'Mistura@Mkt2026!',
                'is_active' => true,
                'email_verified_at' => now(),
            ]
        );
        $mktRole = Role::query()->where('slug', RoleSlug::Marketing->value)->first();
        if ($mktRole) {
            $marketing->roles()->sync([$mktRole->id]);
        }

        $customer = User::query()->updateOrCreate(
            ['email' => 'cliente@misturafeminina.local'],
            [
                'name' => 'Marina Almeida',
                'phone' => '(11) 98888-1234',
                'cpf_cnpj' => '12345678909',
                'password' => 'Cliente@2026!',
                'is_active' => true,
                'email_verified_at' => now(),
            ]
        );
        $custRole = Role::query()->where('slug', RoleSlug::Customer->value)->first();
        if ($custRole) {
            $customer->roles()->sync([$custRole->id]);
        }
        CustomerProfile::query()->updateOrCreate(
            ['user_id' => $customer->id],
            ['newsletter_opt_in' => true, 'newsletter_opt_in_at' => now()]
        );
        $customer->addresses()->firstOrCreate(
            ['cep' => '01310-100', 'number' => '1500'],
            [
                'label' => 'Casa',
                'recipient_name' => 'Marina Almeida',
                'phone' => '(11) 98888-1234',
                'street' => 'Avenida Paulista',
                'complement' => 'Apto 42',
                'neighborhood' => 'Bela Vista',
                'city' => 'São Paulo',
                'state' => 'SP',
                'is_default' => true,
            ]
        );
    }

    /** @return array<string, Brand> */
    private function seedBrands(): array
    {
        $defs = [
            ['name' => 'Mistura Lab', 'slug' => 'mistura-lab', 'is_featured' => true],
            ['name' => 'Essência Floral', 'slug' => 'essencia-floral', 'is_featured' => true],
            ['name' => 'Lumière Nails', 'slug' => 'lumiere-nails', 'is_featured' => true],
            ['name' => 'Studio Pro', 'slug' => 'studio-pro', 'is_featured' => true],
        ];
        $map = [];
        foreach ($defs as $d) {
            $map[$d['slug']] = Brand::query()->updateOrCreate(
                ['slug' => $d['slug']],
                [
                    'name' => $d['name'],
                    'description' => 'Linha exclusiva selecionada pela Mistura Feminina Cosméticos.',
                    'is_featured' => $d['is_featured'],
                    'is_active' => true,
                ]
            );
        }

        return $map;
    }

    /** @return array<string, Category> */
    private function seedCategories(): array
    {
        $roots = [
            ['slug' => 'unhas-e-esmalteria', 'name' => 'Unhas e Esmalteria', 'icon' => 'sparkles', 'image_path' => '/storage/seed/prod-esmalte.svg', 'order' => 1],
            ['slug' => 'maquiagem', 'name' => 'Maquiagem', 'icon' => 'heart', 'image_path' => '/storage/seed/prod-batom.svg', 'order' => 2],
            ['slug' => 'skincare', 'name' => 'Cuidados Faciais', 'icon' => 'droplet', 'image_path' => '/storage/seed/prod-serum.svg', 'order' => 3],
            ['slug' => 'cabelos', 'name' => 'Cabelos', 'icon' => 'sun', 'image_path' => '/storage/seed/prod-mascara.svg', 'order' => 4],
            ['slug' => 'corpo-e-banho', 'name' => 'Corpo e Banho', 'icon' => 'flower', 'image_path' => '/storage/seed/prod-hidratante.svg', 'order' => 5],
            ['slug' => 'acessorios-pro', 'name' => 'Acessórios Profissionais', 'icon' => 'briefcase', 'image_path' => '/storage/seed/prod-cabine.svg', 'order' => 6],
        ];

        $map = [];
        foreach ($roots as $r) {
            $map[$r['slug']] = Category::query()->updateOrCreate(
                ['slug' => $r['slug']],
                [
                    'name' => $r['name'],
                    'image_path' => $r['image_path'],
                    'icon' => $r['icon'],
                    'sort_order' => $r['order'],
                    'show_in_menu' => true,
                    'is_active' => true,
                ]
            );
        }

        $children = [
            ['parent' => 'unhas-e-esmalteria', 'slug' => 'esmaltes-em-gel', 'name' => 'Esmaltes em Gel', 'order' => 1],
            ['parent' => 'unhas-e-esmalteria', 'slug' => 'preparadores-e-primers', 'name' => 'Preparadores e Primers', 'order' => 2],
            ['parent' => 'maquiagem', 'slug' => 'labios', 'name' => 'Lábios e Batons', 'order' => 1],
            ['parent' => 'maquiagem', 'slug' => 'pele-e-bases', 'name' => 'Pele, Bases e Brumas', 'order' => 2],
            ['parent' => 'cabelos', 'slug' => 'kits-capilares', 'name' => 'Kits e Cronograma', 'order' => 1],
        ];
        foreach ($children as $c) {
            $map[$c['slug']] = Category::query()->updateOrCreate(
                ['slug' => $c['slug']],
                [
                    'parent_id' => $map[$c['parent']]->id,
                    'name' => $c['name'],
                    'sort_order' => $c['order'],
                    'show_in_menu' => true,
                    'is_active' => true,
                ]
            );
        }

        return $map;
    }

    /** @return array<string, AttributeValue> */
    private function seedAttributes(): array
    {
        $color = Attribute::query()->updateOrCreate(['slug' => 'cor'], ['name' => 'Cor', 'display_type' => 'color_swatch']);
        $vol = Attribute::query()->updateOrCreate(['slug' => 'volume'], ['name' => 'Volume / Tamanho', 'display_type' => 'pill']);

        $values = [
            'rose-antigo' => [$color->id, 'Rosé Antigo', '#B85D78', 1],
            'vermelho-rubi' => [$color->id, 'Vermelho Rubi', '#8F1D36', 2],
            'nude-classico' => [$color->id, 'Nude Clássico', '#D3A398', 3],
            'vinho-intenso' => [$color->id, 'Vinho Intenso', '#5E1537', 4],
            '30ml' => [$vol->id, '30ml', null, 1],
            '60ml' => [$vol->id, '60ml', null, 2],
        ];

        $map = [];
        foreach ($values as $slug => [$attrId, $val, $hex, $order]) {
            $map[$slug] = AttributeValue::query()->updateOrCreate(
                ['attribute_id' => $attrId, 'slug' => $slug],
                ['value' => $val, 'color_hex' => $hex, 'sort_order' => $order]
            );
        }

        return $map;
    }

    /**
     * @param  array<string, Brand>  $brands
     * @param  array<string, Category>  $cats
     * @param  array<string, AttributeValue>  $attrs
     */
    private function seedProducts(array $brands, array $cats, array $attrs): void
    {
        $items = [
            [
                'sku' => 'MF-ESM-001', 'slug' => 'esmalte-gel-alta-duracao-15ml', 'name' => 'Esmalte em Gel Alta Duração 15ml',
                'brand' => 'lumiere-nails', 'cats' => ['unhas-e-esmalteria', 'esmaltes-em-gel'], 'img' => '/storage/seed/prod-esmalte.svg',
                'type' => ProductType::Variable, 'price' => 2490, 'promo' => 1690, 'featured' => true, 'new' => true, 'best' => true,
                'short' => 'Cobertura intensa desde a primeira camada com brilho espelhado até 21 dias.',
                'variants' => [
                    ['sku' => 'MF-ESM-001-ROS', 'name' => 'Rosé Antigo', 'price' => 2490, 'promo' => 1690, 'stock' => 25, 'attr' => 'rose-antigo'],
                    ['sku' => 'MF-ESM-001-RUB', 'name' => 'Vermelho Rubi', 'price' => 2490, 'promo' => 1690, 'stock' => 18, 'attr' => 'vermelho-rubi'],
                    ['sku' => 'MF-ESM-001-NUD', 'name' => 'Nude Clássico', 'price' => 2490, 'promo' => 1690, 'stock' => 30, 'attr' => 'nude-classico'],
                ],
            ],
            [
                'sku' => 'MF-SRM-002', 'slug' => 'serum-facial-niacinamida-acido-hialuronico', 'name' => 'Sérum Facial Niacinamida 10% + Hialurônico',
                'brand' => 'mistura-lab', 'cats' => ['skincare'], 'img' => '/storage/seed/prod-serum.svg',
                'type' => ProductType::Variable, 'price' => 8990, 'promo' => 6490, 'featured' => true, 'new' => true, 'best' => true,
                'short' => 'Controla oleosidade, suaviza poros e hidrata profundamente sem pesar.',
                'wholesale' => true,
                'variants' => [
                    ['sku' => 'MF-SRM-002-30', 'name' => '30ml', 'price' => 8990, 'promo' => 6490, 'stock' => 22, 'attr' => '30ml'],
                    ['sku' => 'MF-SRM-002-60', 'name' => '60ml (Econômico)', 'price' => 13990, 'promo' => 10990, 'stock' => 12, 'attr' => '60ml'],
                ],
            ],
            [
                'sku' => 'MF-BTM-003', 'slug' => 'batom-liquido-velvet-matte-4g', 'name' => 'Batom Líquido Velvet Matte Longa Duração',
                'brand' => 'essencia-floral', 'cats' => ['maquiagem', 'labios'], 'img' => '/storage/seed/prod-batom.svg',
                'type' => ProductType::Variable, 'price' => 3990, 'promo' => 2990, 'featured' => true, 'new' => false, 'best' => true,
                'short' => 'Acabamento aveludado confortável com manteiga de karité e vitamina E.',
                'variants' => [
                    ['sku' => 'MF-BTM-003-VIN', 'name' => 'Vinho Intenso', 'price' => 3990, 'promo' => 2990, 'stock' => 20, 'attr' => 'vinho-intenso'],
                    ['sku' => 'MF-BTM-003-NUD', 'name' => 'Nude Clássico', 'price' => 3990, 'promo' => 2990, 'stock' => 28, 'attr' => 'nude-classico'],
                ],
            ],
            [
                'sku' => 'MF-MSC-004', 'slug' => 'mascara-reconstrucao-capilar-queratina-300g', 'name' => 'Máscara Reconstrução Capilar Queratina Vegetal 300g',
                'brand' => 'mistura-lab', 'cats' => ['cabelos'], 'img' => '/storage/seed/prod-mascara.svg',
                'type' => ProductType::Simple, 'price' => 7490, 'promo' => 5490, 'featured' => true, 'new' => false, 'best' => true, 'stock' => 32,
                'short' => 'Reposição de massa para fios quimicamente tratados com brilho imediato.',
            ],
            [
                'sku' => 'MF-OLE-005', 'slug' => 'oleo-reparador-pontas-argan-marula-60ml', 'name' => 'Óleo Reparador de Pontas Argan & Marula 60ml',
                'brand' => 'essencia-floral', 'cats' => ['cabelos'], 'img' => '/storage/seed/prod-oleo.svg',
                'type' => ProductType::Simple, 'price' => 5990, 'promo' => null, 'featured' => true, 'new' => true, 'best' => false, 'stock' => 24,
                'short' => 'Sela cutículas, reduz frizz e oferece proteção térmica até 230°C.',
            ],
            [
                'sku' => 'MF-HID-006', 'slug' => 'locao-hidratante-corporal-rosas-200ml', 'name' => 'Loção Hidratante Corporal Pétalas & Karité 200ml',
                'brand' => 'essencia-floral', 'cats' => ['corpo-e-banho'], 'img' => '/storage/seed/prod-hidratante.svg',
                'type' => ProductType::Simple, 'price' => 4890, 'promo' => 3690, 'featured' => false, 'new' => true, 'best' => true, 'stock' => 19,
                'short' => 'Toque seco com absorção rápida e fragrância floral sofisticada.',
            ],
            [
                'sku' => 'MF-CAB-007', 'slug' => 'cabine-led-uv-profissional-48w-bivolt', 'name' => 'Cabine LED/UV Profissional 48W Bivolt Sensor Automático',
                'brand' => 'studio-pro', 'cats' => ['acessorios-pro', 'unhas-e-esmalteria'], 'img' => '/storage/seed/prod-cabine.svg',
                'type' => ProductType::Simple, 'price' => 16990, 'promo' => 13490, 'featured' => true, 'new' => false, 'best' => true, 'stock' => 9, 'weight' => 650,
                'short' => '36 LEDs duplos para secagem uniforme de gel, acrygel e blindagem.',
            ],
            [
                'sku' => 'MF-PRM-008', 'slug' => 'primer-acido-preparador-unhas-15ml', 'name' => 'Primer Preparador Adesivador de Unhas 15ml',
                'brand' => 'lumiere-nails', 'cats' => ['unhas-e-esmalteria', 'preparadores-e-primers'], 'img' => '/storage/seed/prod-primer.svg',
                'type' => ProductType::Simple, 'price' => 2790, 'promo' => 1990, 'featured' => false, 'new' => false, 'best' => true, 'stock' => 45,
                'short' => 'Garante aderência superior sem descolamentos em alongamentos.',
            ],
            [
                'sku' => 'MF-BAS-009', 'slug' => 'base-fluida-soft-matte-efeito-segunda-pele', 'name' => 'Base Fluida Soft Matte Média Cobertura 30ml',
                'brand' => 'mistura-lab', 'cats' => ['maquiagem', 'pele-e-bases'], 'img' => '/storage/seed/prod-base.svg',
                'type' => ProductType::Simple, 'price' => 6990, 'promo' => 4990, 'featured' => true, 'new' => true, 'best' => false, 'stock' => 16,
                'short' => 'Resistente à transferência e à umidade com vitamina E.',
            ],
            [
                'sku' => 'MF-BRM-010', 'slug' => 'bruma-fixadora-glow-agua-termal-120ml', 'name' => 'Bruma Fixadora Hidratante Água Termal 120ml',
                'brand' => 'essencia-floral', 'cats' => ['maquiagem', 'skincare', 'pele-e-bases'], 'img' => '/storage/seed/prod-bruma.svg',
                'type' => ProductType::Simple, 'price' => 4590, 'promo' => null, 'featured' => false, 'new' => true, 'best' => false, 'stock' => 14,
                'short' => 'Prolonga a maquiagem e revitaliza o viço ao longo do dia.',
            ],
            [
                'sku' => 'MF-PIN-011', 'slug' => 'kit-pinceis-maquiagem-profissional-8-pecas', 'name' => 'Kit Pincéis Profissionais Cerdas Macias 8 Peças',
                'brand' => 'studio-pro', 'cats' => ['acessorios-pro', 'maquiagem'], 'img' => '/storage/seed/prod-pincel.svg',
                'type' => ProductType::Simple, 'price' => 11990, 'promo' => 8990, 'featured' => false, 'new' => false, 'best' => false, 'stock' => 0,
                'short' => 'Cerdas sintéticas de alta densidade para acabamento polido (item para testar Avise-me quando esgotado).',
            ],
            [
                'sku' => 'MF-KIT-012', 'slug' => 'kit-cronograma-capilar-reconstrucao-brilho', 'name' => 'Kit Capilar Reconstrução + Óleo Reparador',
                'brand' => 'mistura-lab', 'cats' => ['cabelos', 'kits-capilares'], 'img' => '/storage/seed/prod-kit.svg',
                'type' => ProductType::Kit, 'price' => 13480, 'promo' => 9990, 'featured' => true, 'new' => true, 'best' => true, 'stock' => 10,
                'short' => 'Combo completo com Máscara Reconstrução 300g + Óleo Reparador 60ml com desconto especial.',
            ],
        ];

        $savedSimpleVariants = [];

        foreach ($items as $data) {
            $product = Product::query()->updateOrCreate(
                ['slug' => $data['slug']],
                [
                    'brand_id' => $brands[$data['brand']]->id,
                    'name' => $data['name'],
                    'sku' => $data['sku'],
                    'short_description' => $data['short'],
                    'description' => '<p>'.$data['short'].'</p><p>Desenvolvido com controle rigoroso de qualidade para rotinas pessoais e atendimentos profissionais.</p>',
                    'usage_instructions' => 'Aplicar conforme orientação na embalagem. Conservar em local seco e ao abrigo da luz.',
                    'product_type' => $data['type'],
                    'price_cents' => $data['price'],
                    'promo_price_cents' => $data['promo'],
                    'weight_grams' => $data['weight'] ?? 220,
                    'is_active' => true,
                    'is_featured' => $data['featured'],
                    'is_new_arrival' => $data['new'],
                    'is_best_seller' => $data['best'],
                    'wholesale_enabled' => ! empty($data['wholesale']),
                    'wholesale_tiers' => ! empty($data['wholesale']) ? [['min_qty' => 6, 'discount_percent' => 15], ['min_qty' => 12, 'discount_percent' => 25]] : null,
                    'sales_count' => $data['best'] ? 45 : 12,
                ]
            );

            $catIds = array_map(fn (string $s): int => $cats[$s]->id, $data['cats']);
            $product->categories()->sync($catIds);

            ProductImage::query()->updateOrCreate(
                ['product_id' => $product->id, 'sort_order' => 0],
                ['disk' => 'public', 'path' => $data['img'], 'alt_text' => $product->name, 'is_primary' => true]
            );

            if (! empty($data['variants'])) {
                foreach ($data['variants'] as $idx => $v) {
                    $variant = ProductVariant::query()->updateOrCreate(
                        ['sku' => $v['sku']],
                        [
                            'product_id' => $product->id,
                            'name' => $v['name'],
                            'price_cents' => $v['price'],
                            'promo_price_cents' => $v['promo'],
                            'stock_qty' => $v['stock'],
                            'min_stock_alert' => 5,
                            'weight_grams' => $product->weight_grams,
                            'is_default' => $idx === 0,
                            'is_active' => true,
                        ]
                    );
                    if (isset($attrs[$v['attr']])) {
                        $variant->attributeValues()->sync([$attrs[$v['attr']]->id]);
                    }
                }
            } else {
                $variant = ProductVariant::query()->updateOrCreate(
                    ['sku' => $data['sku']],
                    [
                        'product_id' => $product->id,
                        'name' => 'Padrão',
                        'price_cents' => $data['price'],
                        'promo_price_cents' => $data['promo'],
                        'stock_qty' => (int) ($data['stock'] ?? 15),
                        'min_stock_alert' => 5,
                        'weight_grams' => $product->weight_grams,
                        'is_default' => true,
                        'is_active' => true,
                    ]
                );
                $savedSimpleVariants[$data['sku']] = $variant;
            }
        }

        // Link Kit components for Kit Cronograma
        $kitProduct = Product::query()->where('sku', 'MF-KIT-012')->first();
        if ($kitProduct && isset($savedSimpleVariants['MF-MSC-004'], $savedSimpleVariants['MF-OLE-005'])) {
            ProductKitItem::query()->where('kit_product_id', $kitProduct->id)->delete();
            foreach (['MF-MSC-004', 'MF-OLE-005'] as $compSku) {
                $cv = $savedSimpleVariants[$compSku];
                ProductKitItem::query()->create([
                    'kit_product_id' => $kitProduct->id,
                    'component_product_id' => $cv->product_id,
                    'component_variant_id' => $cv->id,
                    'quantity' => 1,
                ]);
            }
        }
    }

    private function seedMarketingAndShipping(): void
    {
        Coupon::query()->updateOrCreate(
            ['code' => 'BEMVINDA10'],
            [
                'name' => '10% OFF na Primeira Compra',
                'type' => 'percent',
                'value' => 10,
                'min_subtotal_cents' => 5000,
                'max_uses_per_user' => 3,
                'first_purchase_only' => false,
                'scope_type' => 'all',
                'is_active' => true,
            ]
        );

        Coupon::query()->updateOrCreate(
            ['code' => 'FRETEGRATIS'],
            [
                'name' => 'Frete Grátis acima de R$ 150',
                'type' => 'free_shipping',
                'value' => 0,
                'min_subtotal_cents' => 15000,
                'max_uses_per_user' => 5,
                'scope_type' => 'all',
                'is_active' => true,
            ]
        );

        Promotion::query()->updateOrCreate(
            ['name' => 'Leve 3+ Itens de Esmalteria com 10% OFF'],
            [
                'rule_type' => 'quantity_tier',
                'discount_type' => 'percent',
                'value' => 10,
                'scope_type' => 'all',
                'min_qty' => 3,
                'min_subtotal_cents' => 0,
                'priority' => 10,
                'is_cumulative' => true,
                'is_active' => true,
            ]
        );

        ShippingRule::query()->updateOrCreate(
            ['code' => 'PAC-BRASIL'],
            [
                'name' => 'Entrega Econômica Nacional',
                'carrier' => 'Correios / Transportadora',
                'mode' => 'table',
                'base_price_cents' => 1890,
                'price_per_kg_cents' => 450,
                'estimated_days' => 6,
                'extra_prep_days' => 1,
                'free_shipping_above_cents' => 29900,
                'is_active' => true,
            ]
        );

        ShippingRule::query()->updateOrCreate(
            ['code' => 'SEDEX-EXPRESSO'],
            [
                'name' => 'Entrega Expressa',
                'carrier' => 'Correios Expresso',
                'mode' => 'table',
                'base_price_cents' => 3190,
                'price_per_kg_cents' => 750,
                'estimated_days' => 2,
                'extra_prep_days' => 1,
                'is_active' => true,
            ]
        );

        ShippingRule::query()->updateOrCreate(
            ['code' => 'RETIRADA-LOJA'],
            [
                'name' => 'Retirada no Balcão (Agendar)',
                'carrier' => 'Mistura Feminina',
                'mode' => 'pickup',
                'base_price_cents' => 0,
                'price_per_kg_cents' => 0,
                'estimated_days' => 1,
                'extra_prep_days' => 0,
                'is_active' => true,
            ]
        );
    }

    private function seedContent(): void
    {
        $banners = [
            ['title' => 'Semana da Beleza Mistura Feminina', 'placement' => 'hero', 'desktop' => '/storage/seed/hero-1-desktop.svg', 'mobile' => '/storage/seed/hero-1-mobile.svg', 'alt' => 'Semana da Beleza Mistura Feminina', 'cta' => 'Ver ofertas', 'url' => '/promocoes', 'order' => 1],
            ['title' => 'Cuidados Faciais e Corporais', 'placement' => 'hero', 'desktop' => '/storage/seed/hero-2-desktop.svg', 'mobile' => '/storage/seed/hero-2-mobile.svg', 'alt' => 'Cuidados Faciais e Corporais Mistura Feminina', 'cta' => 'Explorar Skincare', 'url' => '/categoria/skincare', 'order' => 2],
            ['title' => 'Unhas em Gel Profissionais', 'placement' => 'promo_grid', 'desktop' => '/storage/seed/promo-1.svg', 'mobile' => '/storage/seed/promo-1.svg', 'alt' => 'Linha Unhas e Gel Mistura Feminina', 'cta' => 'Conferir', 'url' => '/categoria/unhas-e-esmalteria', 'order' => 1],
            ['title' => 'Kits com Economia Garantida', 'placement' => 'promo_grid', 'desktop' => '/storage/seed/promo-2.svg', 'mobile' => '/storage/seed/promo-2.svg', 'alt' => 'Kits com Desconto Mistura Feminina', 'cta' => 'Ver kits', 'url' => '/categoria/kits-capilares', 'order' => 2],
        ];
        foreach ($banners as $b) {
            Banner::query()->updateOrCreate(
                ['title' => $b['title'], 'placement' => $b['placement']],
                [
                    'desktop_image_path' => $b['desktop'],
                    'mobile_image_path' => $b['mobile'],
                    'alt_text' => $b['alt'],
                    'cta_label' => $b['cta'],
                    'cta_url' => $b['url'],
                    'sort_order' => $b['order'],
                    'is_active' => true,
                ]
            );
        }

        $sections = [
            ['key' => 'hero_main', 'type' => 'hero_carousel', 'title' => null, 'subtitle' => null, 'config' => [], 'order' => 1],
            ['key' => 'coupon_banner', 'type' => 'coupon_strip', 'title' => 'Aproveite um desconto especial na sua compra', 'subtitle' => 'Use o cupom abaixo no carrinho ou checkout:', 'config' => [], 'order' => 2],
            ['key' => 'benefits_strip', 'type' => 'benefits_row', 'title' => null, 'subtitle' => null, 'config' => [], 'order' => 3],
            ['key' => 'categories_row', 'type' => 'category_circles', 'title' => 'Navegue por Categorias', 'subtitle' => 'Encontre exatamente o que sua rotina precisa', 'config' => ['limit' => 8], 'order' => 4],
            ['key' => 'offers_week', 'type' => 'product_showcase', 'title' => 'Ofertas da Semana', 'subtitle' => 'Descontos válidos enquanto durarem os estoques', 'config' => ['filter' => 'offers', 'limit' => 8, 'cta_url' => '/promocoes'], 'order' => 5],
            ['key' => 'promo_banners', 'type' => 'banner_grid', 'title' => null, 'subtitle' => null, 'config' => [], 'order' => 6],
            ['key' => 'new_arrivals', 'type' => 'product_showcase', 'title' => 'Novidades na Loja', 'subtitle' => 'Lançamentos recém-chegados ao catálogo', 'config' => ['filter' => 'new_arrivals', 'limit' => 8, 'cta_url' => '/novidades'], 'order' => 7],
            ['key' => 'brands_row', 'type' => 'brand_showcase', 'title' => 'Marcas em Destaque', 'subtitle' => 'Qualidade selecionada pela Mistura Feminina Cosméticos', 'config' => ['limit' => 8], 'order' => 8],
            ['key' => 'best_sellers', 'type' => 'product_showcase', 'title' => 'Mais Vendidos', 'subtitle' => 'Os queridinhos das nossas clientes', 'config' => ['filter' => 'best_sellers', 'limit' => 8, 'cta_url' => '/categorias'], 'order' => 9],
            ['key' => 'newsletter_box', 'type' => 'newsletter', 'title' => 'Receba lançamentos e cupons exclusivos', 'subtitle' => 'Cadastre seu e-mail para novidades da Mistura Feminina Cosméticos', 'config' => [], 'order' => 10],
        ];
        foreach ($sections as $s) {
            HomeSection::query()->updateOrCreate(
                ['key' => $s['key']],
                [
                    'type' => $s['type'],
                    'title' => $s['title'],
                    'subtitle' => $s['subtitle'],
                    'config' => $s['config'],
                    'sort_order' => $s['order'],
                    'is_active' => true,
                ]
            );
        }

        $pages = [
            ['slug' => 'sobre', 'title' => 'Sobre a Mistura Feminina Cosméticos', 'group' => 'institucional', 'order' => 1, 'html' => '<p>A <strong>Mistura Feminina Cosméticos</strong> nasceu com o propósito de levar produtos de beleza, cuidados pessoais e insumos profissionais com curadoria rigorosa, transparência de preços e envio rápido para todo o Brasil.</p>'],
            ['slug' => 'duvidas', 'title' => 'Dúvidas Frequentes', 'group' => 'ajuda', 'order' => 2, 'html' => '<h3>Como acompanho meu pedido?</h3><p>Acesse a página <strong>Rastrear Pedido</strong> com o número do pedido e seu e-mail ou CPF, ou entre em Minha Conta.</p><h3>Qual o prazo para aprovação do Pix?</h3><p>Pagamentos via Pix são confirmados automaticamente em poucos segundos após a compensação bancária.</p>'],
            ['slug' => 'pagamento', 'title' => 'Formas de Pagamento', 'group' => 'ajuda', 'order' => 3, 'html' => '<p>Aceitamos <strong>Pix</strong> com aprovação imediata e <strong>Cartão de Crédito</strong> em até 6x sem juros, processados em ambiente seguro.</p>'],
            ['slug' => 'entrega', 'title' => 'Política de Entrega e Frete', 'group' => 'ajuda', 'order' => 4, 'html' => '<p>O prazo de entrega e o valor do frete são calculados dinamicamente na página do produto, carrinho e checkout a partir do seu CEP.</p>'],
            ['slug' => 'trocas-e-devolucoes', 'title' => 'Trocas e Devoluções', 'group' => 'institucional', 'order' => 5, 'html' => '<p>Conforme o Código de Defesa do Consumidor, você pode solicitar arrependimento ou troca em até 7 dias corridos após o recebimento, desde que o produto esteja lacrado e sem sinais de uso.</p>'],
            ['slug' => 'privacidade', 'title' => 'Política de Privacidade (LGPD)', 'group' => 'institucional', 'order' => 6, 'html' => '<p>Tratamos seus dados pessoais estritamente para processamento de pedidos, entrega, suporte e comunicações autorizadas, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018). Você pode exportar ou solicitar exclusão/anonimização em Minha Conta.</p>'],
            ['slug' => 'termos', 'title' => 'Termos de Uso', 'group' => 'institucional', 'order' => 7, 'html' => '<p>Ao realizar compras na Mistura Feminina Cosméticos, o cliente concorda com nossas políticas vigentes de preço, disponibilidade de estoque e entrega.</p>'],
            ['slug' => 'contato', 'title' => 'Fale Conosco', 'group' => 'ajuda', 'order' => 8, 'html' => '<p>Entre em contato pelo formulário abaixo ou diretamente pelo nosso canal oficial de WhatsApp informado no cabeçalho.</p>'],
        ];
        foreach ($pages as $p) {
            ContentPage::query()->updateOrCreate(
                ['slug' => $p['slug']],
                [
                    'title' => $p['title'],
                    'content_html' => $p['html'],
                    'seo_title' => $p['title'].' | Mistura Feminina Cosméticos',
                    'seo_description' => strip_tags($p['html']),
                    'is_published' => true,
                    'show_in_footer' => true,
                    'footer_group' => $p['group'],
                    'sort_order' => $p['order'],
                ]
            );
        }
    }
}
