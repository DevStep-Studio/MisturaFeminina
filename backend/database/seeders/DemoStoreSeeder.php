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
use App\Models\Review;
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
        $this->seedReviews();
        $this->seedMarketingAndShipping();
        $this->seedContent();
    }

    private function generateSeedAssets(): void
    {
        $dir = storage_path('app/public/seed');
        File::ensureDirectoryExists($dir);

        File::delete(File::glob($dir.'/*.svg'));

        File::put($dir.'/logo-light.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 56" width="280" height="56"><rect width="44" height="44" x="4" y="6" rx="10" fill="#8B2252"/><path d="M16 36V20l10 10 10-10v16" stroke="#FFFFFF" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><text x="60" y="29" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="700" fill="#231F20">Mistura Feminina</text><text x="60" y="45" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="600" letter-spacing="2" fill="#8B2252">COSMÉTICOS</text></svg>');

        File::put($dir.'/logo-dark.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 56" width="280" height="56"><rect width="44" height="44" x="4" y="6" rx="10" fill="#FFFFFF"/><path d="M16 36V20l10 10 10-10v16" stroke="#8B2252" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><text x="60" y="29" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="700" fill="#FFFFFF">Mistura Feminina</text><text x="60" y="45" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="600" letter-spacing="2" fill="#F3D5E2">COSMÉTICOS</text></svg>');

        File::put($dir.'/favicon.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#8B2252"/><path d="M16 45V19l16 15 16-15v26" stroke="#FFFFFF" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>');

        $brandLogos = [
            'brand-mistura-lab.svg' => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 90" width="200" height="90">'
                .'<path d="M84,18 L100,18 L116,44 L110,44 L100,26 L90,44 L84,44 Z" fill="none" stroke="#8B1E4F" stroke-width="2.6" stroke-linejoin="round"/>'
                .'<path d="M100,32 C104,28 109,31 106,36 C103,40 100,42 100,42 C100,42 97,40 94,36 C91,31 96,28 100,32 Z" fill="#C22583"/>'
                .'<text x="100" y="68" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-size="16" font-weight="300" letter-spacing="3.5" fill="#7D2948">MISTURA<tspan font-weight="800" fill="#5A1734">LAB</tspan></text>'
                .'</svg>',
            'brand-essencia-floral.svg' => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 90" width="200" height="90">'
                .'<text x="100" y="54" text-anchor="middle" font-family="Georgia,serif" font-size="30" font-weight="700" letter-spacing="-0.5" fill="#5E238D">essência</text>'
                .'<circle cx="106" cy="24" r="3" fill="#C22583"/>'
                .'<text x="100" y="70" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" font-weight="700" letter-spacing="4" fill="#9D4EDD">FLORAL</text>'
                .'</svg>',
            'brand-lumiere-nails.svg' => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 90" width="200" height="90">'
                .'<path d="M92,24 C86,16 96,12 100,22 C104,12 114,16 108,24" fill="none" stroke="#18181B" stroke-width="2" stroke-linecap="round"/>'
                .'<text x="100" y="56" text-anchor="middle" font-family="Georgia,serif" font-size="26" font-weight="700" letter-spacing="1" fill="#18181B">L&amp;N</text>'
                .'<text x="100" y="72" text-anchor="middle" font-family="system-ui,sans-serif" font-size="8.5" font-weight="600" letter-spacing="3" fill="#52525B">LUMIÈRE NAILS</text>'
                .'</svg>',
            'brand-studio-pro.svg' => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 90" width="200" height="90">'
                .'<text x="100" y="55" text-anchor="middle" font-family="Georgia,serif" font-size="30" font-weight="900" letter-spacing="-1.5" fill="#18181B">S<tspan font-size="22" font-style="italic" fill="#3D1260">&amp;</tspan>P</text>'
                .'<text x="100" y="72" text-anchor="middle" font-family="system-ui,sans-serif" font-size="8" font-weight="700" letter-spacing="3.5" fill="#71717A">STUDIO PRO</text>'
                .'</svg>',
            'brand-bella-unha.svg' => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 90" width="200" height="90">'
                .'<circle cx="100" cy="30" r="14" fill="none" stroke="#C97387" stroke-width="1.8"/>'
                .'<text x="100" y="34" text-anchor="middle" font-family="Georgia,serif" font-size="14" font-weight="700" fill="#B85D74">B</text>'
                .'<text x="100" y="61" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-size="19" fill="#B85D74">Bella Unha</text>'
                .'<line x1="60" y1="67" x2="140" y2="67" stroke="#E5A9B7" stroke-width="1.2"/>'
                .'</svg>',
            'brand-rose-atelier.svg' => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 90" width="200" height="90">'
                .'<rect x="44" y="29" width="112" height="32" rx="4" fill="#9D4EDD"/>'
                .'<text x="100" y="51" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-size="18" font-weight="700" letter-spacing="0.5" fill="#FFFFFF">Rosé</text>'
                .'<circle cx="129" cy="35" r="2.2" fill="#FDE68A"/>'
                .'</svg>',
            'brand-viva-pele.svg' => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 90" width="200" height="90">'
                .'<text x="100" y="52" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-size="22" font-weight="900" letter-spacing="2" fill="#3D1260">VIVA<tspan fill="#C22583">PELE</tspan></text>'
                .'<rect x="64" y="60" width="72" height="2.5" rx="1.25" fill="#EC4899"/>'
                .'</svg>',
            'brand-flora-gloss.svg' => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 90" width="200" height="90">'
                .'<rect x="38" y="27" width="124" height="36" rx="18" fill="none" stroke="#62298D" stroke-width="2"/>'
                .'<text x="100" y="50" text-anchor="middle" font-family="Georgia,serif" font-size="16" font-weight="700" letter-spacing="1.5" fill="#3D1260">FLORA GLOSS</text>'
                .'</svg>',
        ];

        foreach ($brandLogos as $file => $svg) {
            File::put($dir.'/'.$file, $svg);
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
            ['name' => 'Mistura Lab', 'slug' => 'mistura-lab', 'logo_path' => '/storage/seed/brand-mistura-lab.svg', 'is_featured' => true],
            ['name' => 'Essência Floral', 'slug' => 'essencia-floral', 'logo_path' => '/storage/seed/brand-essencia-floral.svg', 'is_featured' => true],
            ['name' => 'Lumière Nails', 'slug' => 'lumiere-nails', 'logo_path' => '/storage/seed/brand-lumiere-nails.svg', 'is_featured' => true],
            ['name' => 'Studio Pro', 'slug' => 'studio-pro', 'logo_path' => '/storage/seed/brand-studio-pro.svg', 'is_featured' => true],
            ['name' => 'Bella Unha', 'slug' => 'bella-unha', 'logo_path' => '/storage/seed/brand-bella-unha.svg', 'is_featured' => true],
            ['name' => 'Rosé Atelier', 'slug' => 'rose-atelier', 'logo_path' => '/storage/seed/brand-rose-atelier.svg', 'is_featured' => true],
            ['name' => 'Viva Pele', 'slug' => 'viva-pele', 'logo_path' => '/storage/seed/brand-viva-pele.svg', 'is_featured' => true],
            ['name' => 'Flora Gloss', 'slug' => 'flora-gloss', 'logo_path' => '/storage/seed/brand-flora-gloss.svg', 'is_featured' => true],
            ['name' => 'Vênus', 'slug' => 'venus', 'logo_path' => '/storage/seed/brand-mistura-lab.svg', 'is_featured' => false],
        ];
        $map = [];
        foreach ($defs as $d) {
            $map[$d['slug']] = Brand::query()->updateOrCreate(
                ['slug' => $d['slug']],
                [
                    'name' => $d['name'],
                    'description' => 'Linha exclusiva selecionada pela Mistura Feminina Cosméticos.',
                    'logo_path' => $d['logo_path'],
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
            ['slug' => 'unhas-e-esmalteria', 'name' => 'Unhas e Esmalteria', 'icon' => 'sparkles', 'image_path' => '/categories/esmaltes-em-gel.png', 'order' => 1],
            ['slug' => 'maquiagem', 'name' => 'Maquiagem', 'icon' => 'heart', 'image_path' => '/categories/kits.png', 'order' => 2],
            ['slug' => 'skincare', 'name' => 'Cuidados Faciais', 'icon' => 'droplet', 'image_path' => '/categories/gel.png', 'order' => 3],
            ['slug' => 'cabelos', 'name' => 'Cabelos', 'icon' => 'sun', 'image_path' => '/categories/top-coat.png', 'order' => 4],
            ['slug' => 'corpo-e-banho', 'name' => 'Corpo e Banho', 'icon' => 'flower', 'image_path' => '/categories/aspiradores.png', 'order' => 5],
            ['slug' => 'acessorios-pro', 'name' => 'Acessórios Profissionais', 'icon' => 'briefcase', 'image_path' => '/categories/cabines.png', 'order' => 6],
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
            // Unhas e Esmalteria
            ['parent' => 'unhas-e-esmalteria', 'slug' => 'esmaltes-em-gel', 'name' => 'Esmaltes em Gel', 'image_path' => '/categories/esmaltes-em-gel.png', 'order' => 1],
            ['parent' => 'unhas-e-esmalteria', 'slug' => 'preparadores-e-primers', 'name' => 'Preparadores e Primers', 'order' => 2],
            ['parent' => 'unhas-e-esmalteria', 'slug' => 'alongamento-e-geis', 'name' => 'Alongamento e Géis', 'order' => 3],
            ['parent' => 'unhas-e-esmalteria', 'slug' => 'top-coat-e-finalizadores', 'name' => 'Top Coat e Finalizadores', 'order' => 4],
            ['parent' => 'unhas-e-esmalteria', 'slug' => 'top-coat', 'name' => 'Top Coat', 'image_path' => '/categories/top-coat.png', 'order' => 5],
            ['parent' => 'unhas-e-esmalteria', 'slug' => 'kits', 'name' => 'Kits', 'image_path' => '/categories/kits.png', 'order' => 6],
            ['parent' => 'unhas-e-esmalteria', 'slug' => 'gel', 'name' => 'Gel', 'image_path' => '/categories/gel.png', 'order' => 7],
            // Maquiagem
            ['parent' => 'maquiagem', 'slug' => 'labios', 'name' => 'Lábios e Batons', 'order' => 1],
            ['parent' => 'maquiagem', 'slug' => 'pele-e-bases', 'name' => 'Pele, Bases e Brumas', 'order' => 2],
            ['parent' => 'maquiagem', 'slug' => 'brumas-e-fixadores', 'name' => 'Brumas e Fixadores', 'order' => 3],
            // Cuidados Faciais (skincare)
            ['parent' => 'skincare', 'slug' => 'seruns-e-tratamentos', 'name' => 'Séruns e Tratamentos', 'order' => 1],
            ['parent' => 'skincare', 'slug' => 'hidratantes-faciais', 'name' => 'Hidratantes e Brumas', 'order' => 2],
            // Cabelos
            ['parent' => 'cabelos', 'slug' => 'kits-capilares', 'name' => 'Kits e Cronograma', 'order' => 1],
            ['parent' => 'cabelos', 'slug' => 'mascaras-de-tratamento', 'name' => 'Máscaras de Reconstrução', 'order' => 2],
            ['parent' => 'cabelos', 'slug' => 'oleos-e-reparadores', 'name' => 'Óleos e Finalizadores', 'order' => 3],
            // Corpo e Banho
            ['parent' => 'corpo-e-banho', 'slug' => 'hidratantes-corporais', 'name' => 'Hidratantes Corporais', 'order' => 1],
            ['parent' => 'corpo-e-banho', 'slug' => 'autocuidado-diario', 'name' => 'Autocuidado Diário', 'order' => 2],
            // Acessórios Profissionais
            ['parent' => 'acessorios-pro', 'slug' => 'cabines-e-estufas', 'name' => 'Cabines e Equipamentos', 'order' => 1],
            ['parent' => 'acessorios-pro', 'slug' => 'pinceis-profissionais', 'name' => 'Pincéis e Kits', 'order' => 2],
            ['parent' => 'acessorios-pro', 'slug' => 'brocas-e-lixas', 'name' => 'Brocas e Lixas', 'order' => 3],
            ['parent' => 'acessorios-pro', 'slug' => 'brocas', 'name' => 'Brocas', 'image_path' => '/categories/brocas.png', 'order' => 4],
            ['parent' => 'acessorios-pro', 'slug' => 'cabines', 'name' => 'Cabines', 'image_path' => '/categories/cabines.png', 'order' => 5],
            ['parent' => 'acessorios-pro', 'slug' => 'motores', 'name' => 'Motores', 'image_path' => '/categories/motores.png', 'order' => 6],
            ['parent' => 'acessorios-pro', 'slug' => 'aspiradores', 'name' => 'Aspiradores', 'image_path' => '/categories/aspiradores.png', 'order' => 7],
            ['parent' => 'acessorios-pro', 'slug' => 'luminarias', 'name' => 'Luminárias', 'image_path' => '/categories/luminarias.png', 'order' => 8],
            // Nível 3 sob Brocas e Lixas
            ['parent' => 'brocas-e-lixas', 'slug' => 'brocas-ceramica', 'name' => 'Brocas de Cerâmica', 'order' => 1],
            ['parent' => 'brocas-e-lixas', 'slug' => 'lixas-profissionais', 'name' => 'Lixas e Polidoras', 'order' => 2],
        ];
        foreach ($children as $c) {
            $map[$c['slug']] = Category::query()->updateOrCreate(
                ['slug' => $c['slug']],
                [
                    'parent_id' => $map[$c['parent']]->id,
                    'name' => $c['name'],
                    'image_path' => $c['image_path'] ?? null,
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
                'brand' => 'lumiere-nails', 'cats' => ['unhas-e-esmalteria', 'esmaltes-em-gel', 'alongamento-e-geis', 'gel', 'top-coat'], 'img' => '/storage/seed/prod-esmalte.jpg',
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
                'brand' => 'mistura-lab', 'cats' => ['skincare', 'seruns-e-tratamentos'], 'img' => '/storage/seed/prod-serum.jpg',
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
                'brand' => 'essencia-floral', 'cats' => ['maquiagem', 'labios'], 'img' => '/storage/seed/prod-batom.jpg',
                'type' => ProductType::Variable, 'price' => 3990, 'promo' => 2990, 'featured' => true, 'new' => false, 'best' => true,
                'short' => 'Acabamento aveludado confortável com manteiga de karité e vitamina E.',
                'variants' => [
                    ['sku' => 'MF-BTM-003-VIN', 'name' => 'Vinho Intenso', 'price' => 3990, 'promo' => 2990, 'stock' => 20, 'attr' => 'vinho-intenso'],
                    ['sku' => 'MF-BTM-003-NUD', 'name' => 'Nude Clássico', 'price' => 3990, 'promo' => 2990, 'stock' => 28, 'attr' => 'nude-classico'],
                ],
            ],
            [
                'sku' => 'MF-MSC-004', 'slug' => 'mascara-reconstrucao-capilar-queratina-300g', 'name' => 'Máscara Reconstrução Capilar Queratina Vegetal 300g',
                'brand' => 'mistura-lab', 'cats' => ['cabelos', 'mascaras-de-tratamento'], 'img' => '/storage/seed/prod-mascara.jpg',
                'type' => ProductType::Simple, 'price' => 7490, 'promo' => 5490, 'featured' => true, 'new' => false, 'best' => true, 'stock' => 32,
                'short' => 'Reposição de massa para fios quimicamente tratados com brilho imediato.',
            ],
            [
                'sku' => 'MF-OLE-005', 'slug' => 'oleo-reparador-pontas-argan-marula-60ml', 'name' => 'Óleo Reparador de Pontas Argan & Marula 60ml',
                'brand' => 'essencia-floral', 'cats' => ['cabelos', 'oleos-e-reparadores'], 'img' => '/storage/seed/prod-oleo.jpg',
                'type' => ProductType::Simple, 'price' => 5990, 'promo' => null, 'featured' => true, 'new' => true, 'best' => false, 'stock' => 24,
                'short' => 'Sela cutículas, reduz frizz e oferece proteção térmica até 230°C.',
            ],
            [
                'sku' => 'MF-HID-006', 'slug' => 'locao-hidratante-corporal-rosas-200ml', 'name' => 'Loção Hidratante Corporal Pétalas & Karité 200ml',
                'brand' => 'essencia-floral', 'cats' => ['corpo-e-banho', 'hidratantes-corporais', 'autocuidado-diario'], 'img' => '/storage/seed/prod-hidratante.jpg',
                'type' => ProductType::Simple, 'price' => 4890, 'promo' => 3690, 'featured' => false, 'new' => true, 'best' => true, 'stock' => 19,
                'short' => 'Toque seco com absorção rápida e fragrância floral sofisticada.',
            ],
            [
                'sku' => 'MF-CAB-007', 'slug' => 'cabine-led-uv-profissional-48w-bivolt', 'name' => 'Cabine LED/UV Profissional 48W Bivolt Sensor Automático',
                'brand' => 'studio-pro', 'cats' => ['acessorios-pro', 'cabines-e-estufas', 'unhas-e-esmalteria', 'alongamento-e-geis', 'cabines', 'motores', 'aspiradores', 'luminarias'], 'img' => '/storage/seed/prod-cabine.jpg',
                'type' => ProductType::Simple, 'price' => 16990, 'promo' => 13490, 'featured' => true, 'new' => false, 'best' => true, 'stock' => 9, 'weight' => 650,
                'short' => '36 LEDs duplos para secagem uniforme de gel, acrygel e blindagem.',
            ],
            [
                'sku' => 'MF-PRM-008', 'slug' => 'primer-acido-preparador-unhas-15ml', 'name' => 'Primer Preparador Adesivador de Unhas 15ml',
                'brand' => 'lumiere-nails', 'cats' => ['unhas-e-esmalteria', 'preparadores-e-primers', 'top-coat-e-finalizadores', 'top-coat', 'gel'], 'img' => '/storage/seed/prod-primer.jpg',
                'type' => ProductType::Simple, 'price' => 2790, 'promo' => 1990, 'featured' => false, 'new' => false, 'best' => true, 'stock' => 45,
                'short' => 'Garante aderência superior sem descolamentos em alongamentos.',
            ],
            [
                'sku' => 'MF-BAS-009', 'slug' => 'base-fluida-soft-matte-efeito-segunda-pele', 'name' => 'Base Fluida Soft Matte Média Cobertura 30ml',
                'brand' => 'mistura-lab', 'cats' => ['maquiagem', 'pele-e-bases'], 'img' => '/storage/seed/prod-base.jpg',
                'type' => ProductType::Simple, 'price' => 6990, 'promo' => 4990, 'featured' => true, 'new' => true, 'best' => false, 'stock' => 16,
                'short' => 'Resistente à transferência e à umidade com vitamina E.',
            ],
            [
                'sku' => 'MF-BRM-010', 'slug' => 'bruma-fixadora-glow-agua-termal-120ml', 'name' => 'Bruma Fixadora Hidratante Água Termal 120ml',
                'brand' => 'essencia-floral', 'cats' => ['maquiagem', 'skincare', 'pele-e-bases', 'brumas-e-fixadores', 'hidratantes-faciais'], 'img' => '/storage/seed/prod-bruma.jpg',
                'type' => ProductType::Simple, 'price' => 4590, 'promo' => null, 'featured' => false, 'new' => true, 'best' => false, 'stock' => 14,
                'short' => 'Prolonga a maquiagem e revitaliza o viço ao longo do dia.',
            ],
            [
                'sku' => 'MF-PIN-011', 'slug' => 'kit-pinceis-maquiagem-profissional-8-pecas', 'name' => 'Kit Pincéis Profissionais Cerdas Macias 8 Peças',
                'brand' => 'studio-pro', 'cats' => ['acessorios-pro', 'pinceis-profissionais', 'brocas-e-lixas', 'brocas-ceramica', 'lixas-profissionais', 'maquiagem', 'brocas', 'motores', 'aspiradores', 'luminarias'], 'img' => '/storage/seed/prod-pincel.jpg',
                'type' => ProductType::Simple, 'price' => 11990, 'promo' => 8990, 'featured' => false, 'new' => true, 'best' => false, 'stock' => 0,
                'short' => 'Cerdas sintéticas de alta densidade para acabamento polido (item para testar Avise-me quando esgotado).',
            ],
            [
                'sku' => 'MF-KIT-012', 'slug' => 'kit-cronograma-capilar-reconstrucao-brilho', 'name' => 'Kit Capilar Reconstrução + Óleo Reparador',
                'brand' => 'mistura-lab', 'cats' => ['cabelos', 'kits-capilares', 'kits'], 'img' => '/storage/seed/prod-kit.jpg',
                'type' => ProductType::Kit, 'price' => 13480, 'promo' => 9990, 'featured' => true, 'new' => true, 'best' => true, 'stock' => 10,
                'short' => 'Combo completo com Máscara Reconstrução 300g + Óleo Reparador 60ml com desconto especial.',
            ],
            [
                'sku' => 'MF-ESM-013', 'slug' => 'esmalte-em-gel-cintilante-perola-10ml', 'name' => 'Esmalte em Gel Cintilante Pérola 10ml',
                'brand' => 'lumiere-nails', 'cats' => ['unhas-e-esmalteria', 'esmaltes-em-gel', 'gel'], 'img' => '/storage/seed/prod-esmalte-perola.jpg',
                'type' => ProductType::Simple, 'price' => 1990, 'promo' => 1490, 'featured' => false, 'new' => false, 'best' => true, 'stock' => 35,
                'short' => 'Acabamento perolado de longa duração com secagem rápida em cabine LED/UV.',
            ],
            [
                'sku' => 'MF-ESM-014', 'slug' => 'esmalte-em-gel-reflexivo-glitter-10ml', 'name' => 'Esmalte em Gel Reflexivo Glitter 10ml',
                'brand' => 'lumiere-nails', 'cats' => ['unhas-e-esmalteria', 'esmaltes-em-gel', 'gel'], 'img' => '/storage/seed/prod-esmalte-glitter.jpg',
                'type' => ProductType::Simple, 'price' => 2290, 'promo' => null, 'featured' => false, 'new' => false, 'best' => false, 'stock' => 28,
                'short' => 'Partículas refletivas de brilho intenso para encapsulamento e esmaltação.',
            ],
            [
                'sku' => 'MF-ESM-015', 'slug' => 'esmalte-em-gel-quadrado-noir-10ml', 'name' => 'Esmalte em Gel Quadrado Noir 10ml',
                'brand' => 'lumiere-nails', 'cats' => ['unhas-e-esmalteria', 'esmaltes-em-gel', 'gel'], 'img' => '/storage/seed/prod-esmalte-noir.jpg',
                'type' => ProductType::Simple, 'price' => 1890, 'promo' => null, 'featured' => false, 'new' => false, 'best' => false, 'stock' => 0,
                'short' => 'Preto pigmentado cobertura única (disponível para aviso de reposição).',
            ],
            // Ofertas da Semana
            [
                'sku' => 'JK-OFE-001', 'slug' => 'kit-2-esmaltes-em-gel-efeito-magnetico-olho-de-gato-top-lirio', 'name' => 'Kit 2 Esmaltes em Gel - Efeito Magnético Olho de Gato - Top Lírio',
                'brand' => 'lumiere-nails', 'cats' => ['unhas-e-esmalteria', 'esmaltes-em-gel', 'kits'], 'img' => '/products/jack-oferta-1.png',
                'type' => ProductType::Simple, 'price' => 2990, 'promo' => 1990, 'featured' => false, 'new' => false, 'best' => false, 'stock' => 25,
                'short' => 'Kit com 2 esmaltes em gel efeito magnético olho de gato e imã aplicador.',
            ],
            [
                'sku' => 'JK-OFE-002', 'slug' => 'gel-xd-uv-led-56ml', 'name' => 'Gel X&D - Uv / Led - 56ml',
                'brand' => 'lumiere-nails', 'cats' => ['unhas-e-esmalteria', 'alongamento-e-geis', 'gel'], 'img' => '/products/jack-oferta-2.png',
                'type' => ProductType::Simple, 'price' => 1490, 'promo' => 990, 'featured' => false, 'new' => false, 'best' => false, 'stock' => 30,
                'short' => 'Gel construtor UV/LED transparent 56ml de alta resistência para alongamento.',
            ],
            [
                'sku' => 'JK-OFE-003', 'slug' => 'unha-postica-almond-100-unidade', 'name' => 'Unha Postiça Almond- 100 Unidade',
                'brand' => 'bella-unha', 'cats' => ['unhas-e-esmalteria', 'alongamento-e-geis'], 'img' => '/products/jack-oferta-3.png',
                'type' => ProductType::Simple, 'price' => 390, 'promo' => 150, 'featured' => false, 'new' => false, 'best' => false, 'stock' => 40,
                'short' => 'Caixa com 100 unidades de unhas postiças formato Almond.',
            ],
            [
                'sku' => 'JK-OFE-004', 'slug' => 'kit-pedraria-com-1440-pecas', 'name' => 'Kit Pedraria com 1440 Peças',
                'brand' => 'bella-unha', 'cats' => ['unhas-e-esmalteria'], 'img' => '/products/jack-oferta-4.png',
                'type' => ProductType::Simple, 'price' => 590, 'promo' => 490, 'featured' => false, 'new' => false, 'best' => false, 'stock' => 35,
                'short' => 'Kit completo de strass cristal para decoração e nail art com 1440 peças.',
            ],
            // Novidades
            [
                'sku' => 'JK-NOV-001', 'slug' => 'postica-realista-bailarina-100-unidades-dz', 'name' => 'Postiça Realista Bailarina 100 Unidades - D&Z',
                'brand' => 'bella-unha', 'cats' => ['unhas-e-esmalteria', 'alongamento-e-geis'], 'img' => '/products/jack-novidade-1.png',
                'type' => ProductType::Simple, 'price' => 1290, 'promo' => null, 'featured' => false, 'new' => false, 'best' => false, 'stock' => 0,
                'short' => 'Tips postiças realistas formato bailarina D&Z (disponível para aviso de reposição).',
            ],
            [
                'sku' => 'JK-NOV-002', 'slug' => 'esmalte-em-gel-premium-15ml-xd', 'name' => 'Esmalte em Gel Premium 15ml - X&D',
                'brand' => 'lumiere-nails', 'cats' => ['unhas-e-esmalteria', 'esmaltes-em-gel', 'gel'], 'img' => '/products/jack-novidade-2.png',
                'type' => ProductType::Simple, 'price' => 1090, 'promo' => 890, 'featured' => true, 'new' => true, 'best' => false, 'stock' => 25,
                'short' => 'Esmalte em gel linha premium 15ml de secagem rápida e brilho intenso.',
            ],
            [
                'sku' => 'JK-NOV-003', 'slug' => 'gel-paint-metallic-zem-10g', 'name' => 'Gel Paint Metallic - Zem - 10g',
                'brand' => 'lumiere-nails', 'cats' => ['unhas-e-esmalteria', 'gel'], 'img' => '/products/jack-novidade-3.png',
                'type' => ProductType::Simple, 'price' => 1490, 'promo' => 990, 'featured' => true, 'new' => true, 'best' => false, 'stock' => 20,
                'short' => 'Gel paint metálico pigmentado 10g ideal para traços finos e decoração.',
            ],
            [
                'sku' => 'JK-NOV-004', 'slug' => 'esmalte-gel-nude-n-17-top-lirio-18ml', 'name' => 'Esmalte Gel Nude nº 17 - Top Lírio - 18ml',
                'brand' => 'lumiere-nails', 'cats' => ['unhas-e-esmalteria', 'esmaltes-em-gel', 'gel'], 'img' => '/products/jack-novidade-4.png',
                'type' => ProductType::Simple, 'price' => 1890, 'promo' => 1090, 'featured' => true, 'new' => true, 'best' => false, 'stock' => 18,
                'short' => 'Esmalte em gel nude nº 17 de alta cobertura 18ml.',
            ],
            // Vênus
            [
                'sku' => 'JK-VEN-001', 'slug' => 'linha-de-tratamento-venus', 'name' => 'Linha de Tratamento Vênus',
                'brand' => 'venus', 'cats' => ['unhas-e-esmalteria', 'preparadores-e-primers'], 'img' => '/products/jack-venus-1.png',
                'type' => ProductType::Simple, 'price' => 390, 'promo' => null, 'featured' => false, 'new' => false, 'best' => false, 'stock' => 30,
                'short' => 'Tratamentos fortalecedores e bases nutritivas linha Vênus 8ml.',
            ],
            [
                'sku' => 'JK-VEN-002', 'slug' => 'base-aceleradora-de-crescimento-8ml', 'name' => 'Base Aceleradora de Crescimento - 8ml',
                'brand' => 'venus', 'cats' => ['unhas-e-esmalteria', 'preparadores-e-primers'], 'img' => '/products/jack-venus-2.png',
                'type' => ProductType::Simple, 'price' => 390, 'promo' => null, 'featured' => false, 'new' => false, 'best' => false, 'stock' => 30,
                'short' => 'Base fortalecedora que estimula o crescimento saudável das unhas.',
            ],
            [
                'sku' => 'JK-VEN-003', 'slug' => 'esmaltes-tradicional-venus', 'name' => 'Esmaltes Tradicional Vênus',
                'brand' => 'venus', 'cats' => ['unhas-e-esmalteria'], 'img' => '/products/jack-venus-3.png',
                'type' => ProductType::Simple, 'price' => 390, 'promo' => null, 'featured' => false, 'new' => false, 'best' => false, 'stock' => 30,
                'short' => 'Esmalte tradicional Vênus de secagem rápida e longa duração.',
            ],
            [
                'sku' => 'JK-VEN-004', 'slug' => 'kit-esmaltes-tradicionais-venus-8ml-branco-e-renda', 'name' => 'Kit Esmaltes Tradicionais - Vênus 8ml - Branco e Renda',
                'brand' => 'venus', 'cats' => ['unhas-e-esmalteria', 'kits'], 'img' => '/products/jack-venus-4.png',
                'type' => ProductType::Simple, 'price' => 750, 'promo' => null, 'featured' => false, 'new' => false, 'best' => false, 'stock' => 20,
                'short' => 'Kit clássico francesinha com esmaltes Branco e Renda 8ml.',
            ],
            // Esmaltes em Gel
            [
                'sku' => 'JK-GEL-001', 'slug' => 'esmalte-em-gel-color-gel-shellac-10ml-ks', 'name' => 'Esmalte em Gel Color Gel Shellac 10ml - K&S',
                'brand' => 'lumiere-nails', 'cats' => ['unhas-e-esmalteria', 'esmaltes-em-gel', 'gel'], 'img' => '/products/jack-gel-1.png',
                'type' => ProductType::Simple, 'price' => 490, 'promo' => null, 'featured' => false, 'new' => false, 'best' => false, 'stock' => 25,
                'short' => 'Esmalte em gel Color Gel Shellac 10ml com pigmentação intensa.',
            ],
            [
                'sku' => 'JK-GEL-002', 'slug' => 'esmalte-em-gel-marrom-18ml-top-lirio', 'name' => 'Esmalte Em Gel Marrom 18ml- Top Lirio',
                'brand' => 'lumiere-nails', 'cats' => ['unhas-e-esmalteria', 'esmaltes-em-gel', 'gel'], 'img' => '/products/jack-gel-2.png',
                'type' => ProductType::Simple, 'price' => 1090, 'promo' => 590, 'featured' => false, 'new' => false, 'best' => false, 'stock' => 20,
                'short' => 'Esmalte em gel tons terrosos e marrom 18ml.',
            ],
            [
                'sku' => 'JK-GEL-003', 'slug' => 'esmalte-em-gel-reflexivo-10ml-ks', 'name' => 'Esmalte em Gel Reflexivo 10ml - K&S',
                'brand' => 'lumiere-nails', 'cats' => ['unhas-e-esmalteria', 'esmaltes-em-gel', 'gel'], 'img' => '/products/jack-gel-3.png',
                'type' => ProductType::Simple, 'price' => 690, 'promo' => null, 'featured' => false, 'new' => false, 'best' => false, 'stock' => 25,
                'short' => 'Esmalte em gel reflexivo com partículas de brilho diamante.',
            ],
            [
                'sku' => 'JK-GEL-004', 'slug' => 'esmalte-em-gel-ks-quadrado-10ml', 'name' => 'Esmalte em Gel - K&S - Quadrado - 10ml',
                'brand' => 'lumiere-nails', 'cats' => ['unhas-e-esmalteria', 'esmaltes-em-gel', 'gel'], 'img' => '/products/jack-gel-4.png',
                'type' => ProductType::Simple, 'price' => 890, 'promo' => null, 'featured' => false, 'new' => false, 'best' => false, 'stock' => 0,
                'short' => 'Esmalte em gel frasco quadrado 10ml (disponível para aviso de reposição).',
            ],
            // Mais Vendidos da Semana
            [
                'sku' => 'JK-BST-001', 'slug' => 'coletor-de-po-oval-para-unhas-sc808-1', 'name' => 'Coletor de Pó Oval para Unhas SC808-1',
                'brand' => 'studio-pro', 'cats' => ['acessorios-pro', 'aspiradores'], 'img' => '/products/jack-vendidos-1.png',
                'type' => ProductType::Simple, 'price' => 9990, 'promo' => null, 'featured' => false, 'new' => false, 'best' => true, 'stock' => 12, 'weight' => 900,
                'short' => 'Coletor de pó portátil silencioso e ergonômico para mesa de manicure.',
            ],
            [
                'sku' => 'JK-BST-002', 'slug' => 'aspirador-sugador-de-po-1-helice-bivolt', 'name' => 'Aspirador Sugador de Pó - 1 Hélice - Bivolt',
                'brand' => 'studio-pro', 'cats' => ['acessorios-pro', 'aspiradores'], 'img' => '/products/jack-vendidos-2.png',
                'type' => ProductType::Simple, 'price' => 6990, 'promo' => null, 'featured' => false, 'new' => false, 'best' => true, 'stock' => 0, 'weight' => 800,
                'short' => 'Aspirador sugador de pó bivolt para mesa de atendimento.',
            ],
            [
                'sku' => 'JK-BST-003', 'slug' => 'luminaria-uv-de-mesa-com-garra', 'name' => 'Luminária Uv de Mesa Com Garra',
                'brand' => 'studio-pro', 'cats' => ['acessorios-pro', 'luminarias'], 'img' => '/products/jack-vendidos-3.png',
                'type' => ProductType::Simple, 'price' => 4990, 'promo' => null, 'featured' => false, 'new' => false, 'best' => true, 'stock' => 0, 'weight' => 500,
                'short' => 'Luminária flexível UV com garra de fixação em bancada.',
            ],
            [
                'sku' => 'JK-BST-004', 'slug' => 'luminaria-articulada-de-mesa-pixar', 'name' => 'Luminária Articulada de Mesa - Pixar',
                'brand' => 'studio-pro', 'cats' => ['acessorios-pro', 'luminarias'], 'img' => '/products/jack-vendidos-4.png',
                'type' => ProductType::Simple, 'price' => 6990, 'promo' => 5990, 'featured' => false, 'new' => false, 'best' => true, 'stock' => 15, 'weight' => 850,
                'short' => 'Luminária articulada de mesa profissional com braço ajustável.',
            ],
            // Destaques
            [
                'sku' => 'JK-DST-001', 'slug' => 'cabine-sun-5-bivolt-48w-com-temporizador', 'name' => 'Cabine Sun 5 - Bivolt - 48w com Temporizador',
                'brand' => 'studio-pro', 'cats' => ['acessorios-pro', 'cabines', 'cabines-e-estufas'], 'img' => '/products/jack-destaque-1.png',
                'type' => ProductType::Simple, 'price' => 3490, 'promo' => 2290, 'featured' => true, 'new' => false, 'best' => false, 'stock' => 15, 'weight' => 650,
                'short' => 'Cabine LED/UV Sun 5 48W bivolt com display digital e temporizador.',
            ],
            [
                'sku' => 'JK-DST-002', 'slug' => 'cabine-sun-8-pro-bivolt-268w-uv-led', 'name' => 'Cabine Sun 8 Pro - Bivolt - 268w - Uv / Led',
                'brand' => 'studio-pro', 'cats' => ['acessorios-pro', 'cabines', 'cabines-e-estufas'], 'img' => '/products/jack-destaque-2.png',
                'type' => ProductType::Simple, 'price' => 8990, 'promo' => 5990, 'featured' => true, 'new' => false, 'best' => false, 'stock' => 10, 'weight' => 750,
                'short' => 'Cabine profissional Sun 8 Pro 268W UV/LED com sensor automático.',
            ],
            [
                'sku' => 'JK-DST-003', 'slug' => 'kit-basic-anylovy', 'name' => 'Kit Basic - AnyLovy',
                'brand' => 'bella-unha', 'cats' => ['unhas-e-esmalteria', 'kits'], 'img' => '/products/jack-destaque-3.png',
                'type' => ProductType::Simple, 'price' => 19997, 'promo' => null, 'featured' => true, 'new' => false, 'best' => false, 'stock' => 8, 'weight' => 600,
                'short' => 'Kit completo de preparação e construção em fibra de vidro AnyLovy.',
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
            ['code' => 'PRIMEIRACOMPRA'],
            [
                'name' => 'Desconto de 10% Primeira Compra',
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
            ['code' => 'PRIMEIRACOMPRA'],
            [
                'name' => '10% OFF Primeira Compra',
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
            ['code' => 'PRIMEIRACOMPRA'],
            [
                'name' => '10% OFF Primeira Compra',
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
        Banner::query()->where('placement', 'hero')->delete();

        $banners = [
            ['title' => 'Black Friday Ofertas Mistura Feminina', 'placement' => 'hero', 'desktop' => '/storage/seed/hero-1-desktop.jpg', 'mobile' => null, 'alt' => 'Black Friday — Aproveite as ofertas, produtos a partir de R$ 1,90', 'cta' => 'Compre agora', 'url' => '/promocoes', 'order' => 1],
            ['title' => 'Especial Black Friday Cosméticos', 'placement' => 'hero', 'desktop' => '/storage/seed/hero-2-desktop.jpg', 'mobile' => null, 'alt' => 'Black Friday — Aproveite as ofertas com produtos a partir de R$ 1,90', 'cta' => 'Compre agora', 'url' => '/promocoes', 'order' => 2],
            ['title' => 'Frete Grátis para todo Brasil', 'placement' => 'hero', 'desktop' => '/storage/seed/hero-3-desktop.jpg', 'mobile' => null, 'alt' => 'Frete Grátis para todo Brasil — Envios para todo o país', 'cta' => 'Compre agora', 'url' => '/categorias', 'order' => 3],
            ['title' => 'Unhas em Gel Profissionais', 'placement' => 'promo_grid', 'desktop' => '/storage/seed/promo-1.jpg', 'mobile' => '/storage/seed/promo-1.jpg', 'alt' => 'Linha Unhas e Gel Mistura Feminina', 'cta' => 'Conferir', 'url' => '/categoria/unhas-e-esmalteria', 'order' => 1],
            ['title' => 'Kits com Economia Garantida', 'placement' => 'promo_grid', 'desktop' => '/storage/seed/promo-2.jpg', 'mobile' => '/storage/seed/promo-2.jpg', 'alt' => 'Kits com Desconto Mistura Feminina', 'cta' => 'Ver kits', 'url' => '/categoria/kits-capilares', 'order' => 2],
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

        HomeSection::query()->where('key', 'promo_banners')->delete();

        $sections = [
            ['key' => 'hero_main', 'type' => 'hero_carousel', 'title' => null, 'subtitle' => null, 'config' => [], 'order' => 1],
            ['key' => 'coupon_banner', 'type' => 'coupon_strip', 'title' => 'Aproveite um Desconto Especial!', 'subtitle' => 'Na sua primeira compra, use o cupom BEMVINDA10 e ganhe 10% OFF!', 'config' => [], 'order' => 2],
            ['key' => 'benefits_strip', 'type' => 'benefits_row', 'title' => null, 'subtitle' => null, 'config' => [], 'order' => 3],
            [
                'key' => 'categories_row',
                'type' => 'category_circles',
                'title' => 'Navegue por Categorias',
                'subtitle' => null,
                'config' => [
                    'limit' => 9,
                    'slugs' => [
                        'brocas',
                        'cabines',
                        'motores',
                        'aspiradores',
                        'luminarias',
                        'top-coat',
                        'kits',
                        'esmaltes-em-gel',
                        'gel',
                    ],
                ],
                'order' => 4,
            ],
            [
                'key' => 'offers_week',
                'type' => 'product_showcase',
                'title' => 'Confira nossas ofertas da semana',
                'subtitle' => 'Produtos com os melhores preços do mercado, confira já!',
                'config' => [
                    'filter' => 'offers',
                    'limit' => 4,
                    'show_view_all' => true,
                    'cta_url' => '/promocoes',
                    'product_skus' => ['JK-OFE-001', 'JK-OFE-002', 'JK-OFE-003', 'JK-OFE-004'],
                ],
                'order' => 5,
            ],
            [
                'key' => 'brands_row',
                'type' => 'product_showcase',
                'title' => 'Vênus',
                'subtitle' => null,
                'config' => [
                    'filter' => 'brand',
                    'brand_slug' => 'venus',
                    'limit' => 4,
                    'borderless' => true,
                    'show_view_all' => false,
                    'cta_url' => '/marca/venus',
                    'product_skus' => ['JK-VEN-001', 'JK-VEN-002', 'JK-VEN-003', 'JK-VEN-004'],
                ],
                'order' => 6,
            ],
            [
                'key' => 'niche_esmaltes',
                'type' => 'product_showcase',
                'title' => 'Esmaltes em Gel',
                'subtitle' => null,
                'config' => [
                    'filter' => 'category',
                    'category_slug' => 'esmaltes-em-gel',
                    'limit' => 4,
                    'borderless' => true,
                    'show_view_all' => false,
                    'cta_url' => '/categoria/esmaltes-em-gel',
                    'product_skus' => ['JK-GEL-001', 'JK-GEL-002', 'JK-GEL-003', 'JK-GEL-004'],
                ],
                'order' => 7,
            ],
            [
                'key' => 'best_sellers',
                'type' => 'product_showcase',
                'title' => 'Produtos mais Vendidos da semana',
                'subtitle' => null,
                'config' => [
                    'filter' => 'best_sellers',
                    'limit' => 4,
                    'borderless' => true,
                    'show_view_all' => false,
                    'cta_url' => '/categorias',
                    'product_skus' => ['JK-BST-001', 'JK-BST-002', 'JK-BST-003', 'JK-BST-004'],
                ],
                'order' => 8,
            ],
            [
                'key' => 'new_arrivals',
                'type' => 'product_showcase',
                'title' => 'Novidades',
                'subtitle' => null,
                'config' => [
                    'filter' => 'new_arrivals',
                    'limit' => 4,
                    'borderless' => true,
                    'show_view_all' => false,
                    'show_featured_badge' => true,
                    'cta_url' => '/novidades',
                    'product_skus' => ['JK-NOV-001', 'JK-NOV-002', 'JK-NOV-003', 'JK-NOV-004'],
                ],
                'order' => 9,
            ],
            ['key' => 'best_brands', 'type' => 'brand_showcase', 'title' => 'As melhores marcas', 'subtitle' => null, 'config' => ['limit' => 12, 'autoplay' => true, 'show_view_all' => false], 'order' => 10],
            [
                'key' => 'featured_showcase',
                'type' => 'product_showcase',
                'title' => 'Destaques',
                'subtitle' => null,
                'config' => [
                    'filter' => 'featured',
                    'limit' => 4,
                    'borderless' => true,
                    'show_view_all' => false,
                    'show_featured_badge' => true,
                    'cta_url' => '/categorias',
                    'product_skus' => ['JK-DST-001', 'JK-DST-002', 'JK-DST-003', 'JK-NOV-002'],
                ],
                'order' => 11,
            ],
            ['key' => 'quem_compra_indica', 'type' => 'testimonials', 'title' => 'Quem compra indica!', 'subtitle' => null, 'config' => ['limit' => 8], 'order' => 12],
            ['key' => 'newsletter_box', 'type' => 'newsletter', 'title' => 'Receba lançamentos e cupons exclusivos', 'subtitle' => 'Cadastre seu e-mail para novidades da Mistura Feminina Cosméticos', 'config' => [], 'order' => 13],
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

    private function seedReviews(): void
    {
        $samples = [
            [
                'slug' => 'esmalte-gel-alta-duracao-15ml',
                'author' => 'Camila Ferreira',
                'title' => 'Brilho incrível e envio super caprichado',
                'body' => 'Meus produtos chegaram super embalados e os esmaltes em gel têm pigmentação absurda! Com certeza vou comprar sempre na Mistura Feminina.',
            ],
            [
                'slug' => 'kit-cronograma-capilar-reconstrucao-brilho',
                'author' => 'Juliana Mendes',
                'title' => 'Atendimento e qualidade nota 10',
                'body' => 'Amei o kit capilar, o cabelo ficou macio já na primeira aplicação. Entrega super rápida e já virei cliente fiel!',
            ],
            [
                'slug' => 'esmalte-em-gel-cintilante-perola-10ml',
                'author' => 'Studio Aline Unhas',
                'title' => 'Minhas clientes elogiaram muito',
                'body' => 'Comprei os esmaltes perolados e a durabilidade no salão foi excelente. Minhas clientes amaram o acabamento!',
            ],
            [
                'slug' => 'cabine-led-uv-profissional-48w-bivolt',
                'author' => 'Beatriz Nogueira',
                'title' => 'Potente e seca por igual',
                'body' => 'Cabine 48W muito bem acabada, sensor responde rápido e o brilho final das unhas ficou surreal. Recomendo demais!',
            ],
            [
                'slug' => 'serum-facial-niacinamida-acido-hialuronico',
                'author' => 'Larissa Costa',
                'title' => 'Textura leve e resultado rápido',
                'body' => 'Uso todos os dias antes da maquiagem e já notei a pele muito mais hidratada e sequinha ao longo do dia.',
            ],
            [
                'slug' => 'base-fluida-soft-matte-efeito-segunda-pele',
                'author' => 'Mariana Rocha',
                'title' => 'Efeito segunda pele maravilhoso',
                'body' => 'Não craquela, segura o dia todo e o tom combinou certinho. Chegou antes do prazo previsto!',
            ],
        ];

        foreach ($samples as $item) {
            $productId = Product::query()->where('slug', $item['slug'])->value('id');
            if ($productId === null) {
                continue;
            }

            Review::query()->firstOrCreate(
                [
                    'product_id' => $productId,
                    'author_name' => $item['author'],
                ],
                [
                    'rating' => 5,
                    'title' => $item['title'],
                    'body' => $item['body'],
                    'is_verified_purchase' => true,
                    'status' => 'approved',
                ]
            );
        }
    }
}
