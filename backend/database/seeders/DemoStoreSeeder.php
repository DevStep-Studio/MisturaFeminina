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

        File::put($dir.'/logo-light.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 56" width="280" height="56"><rect width="44" height="44" x="4" y="6" rx="10" fill="#8B2252"/><path d="M16 36V20l10 10 10-10v16" stroke="#FFFFFF" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><text x="60" y="29" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="700" fill="#231F20">Mistura Feminina</text><text x="60" y="45" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="600" letter-spacing="2" fill="#8B2252">COSMÉTICOS</text></svg>');

        File::put($dir.'/logo-dark.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 56" width="280" height="56"><rect width="44" height="44" x="4" y="6" rx="10" fill="#FFFFFF"/><path d="M16 36V20l10 10 10-10v16" stroke="#8B2252" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><text x="60" y="29" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="700" fill="#FFFFFF">Mistura Feminina</text><text x="60" y="45" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="600" letter-spacing="2" fill="#F3D5E2">COSMÉTICOS</text></svg>');

        File::put($dir.'/favicon.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#8B2252"/><path d="M16 45V19l16 15 16-15v26" stroke="#FFFFFF" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>');

        $heroSlides = [
            'hero-1-desktop.svg' => [1440, 440, 'MISTURA FEMININA', 'SEMANA', 'DA BELEZA', 'TUDO O QUE VOCÊ PRECISA', 'PARA BELEZA EM', 'UM SÓ LUGAR!'],
            'hero-1-mobile.svg' => [768, 420, 'MISTURA FEMININA', 'SEMANA', 'DA BELEZA', 'TUDO PARA BELEZA', 'EM UM SÓ', 'LUGAR!'],
            'hero-2-desktop.svg' => [1440, 440, 'MISTURA FEMININA', 'SKINCARE', '& UNHAS', 'ATÉ 35% OFF NO CATÁLOGO', 'FRETE GRÁTIS', 'R$ 299+'],
            'hero-2-mobile.svg' => [768, 420, 'MISTURA FEMININA', 'SKINCARE', '& UNHAS', 'ATÉ 35% OFF', 'PARCELE EM', '6X S/ JUROS'],
        ];

        foreach ($heroSlides as $filename => [$w, $h, $brand, $big1, $big2, $line1, $line2, $pillText]) {
            $isMob = $w < 1000;
            if ($isMob) {
                $svg = sprintf(
                    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 768 420" width="%d" height="%d" preserveAspectRatio="xMidYMid slice">'
                        .'<rect width="768" height="420" fill="#130410"/>'
                        .'<path d="M0,0 C75,85 80,240 12,420 L0,420 Z" fill="#A61072"/>'
                        .'<path d="M0,34 C55,110 60,230 0,375 Z" fill="#EC1B9B"/>'
                        .'<path d="M768,0 C705,90 710,240 768,405 Z" fill="#A61072"/>'
                        .'<path d="M768,30 C725,110 730,230 768,350 Z" fill="#EC1B9B"/>'
                        .'<rect x="0" y="368" width="768" height="52" fill="#2A0823"/>'
                        .'<rect x="44" y="370" width="680" height="6" rx="3" fill="#EC1B9B"/>'
                        .'<text x="384" y="48" text-anchor="middle" font-family="system-ui,sans-serif" font-size="18" font-weight="800" letter-spacing="3" fill="#FFFFFF">%s</text>'
                        .'<text x="86" y="106" font-family="system-ui,sans-serif" font-size="44" font-weight="900" font-style="italic" fill="#1E0518" stroke="#EC1B9B" stroke-width="2.5">%s</text>'
                        .'<text x="86" y="156" font-family="system-ui,sans-serif" font-size="44" font-weight="900" font-style="italic" fill="#EC1B9B" stroke="#FFFFFF" stroke-width="1">%s</text>'
                        .'<rect x="330" y="110" width="40" height="48" rx="8" transform="rotate(-8 350 134)" fill="#1D0618" stroke="#EC1B9B" stroke-width="2.5"/>'
                        .'<text x="350" y="145" text-anchor="middle" font-family="system-ui,sans-serif" font-size="25" font-weight="900" fill="#FFFFFF">%%</text>'
                        .'<rect x="392" y="66" width="3" height="106" rx="1.5" fill="#EC1B9B"/>'
                        .'<text x="414" y="96" font-family="system-ui,sans-serif" font-size="24" font-weight="900" font-style="italic" fill="#FFFFFF">%s</text>'
                        .'<text x="414" y="128" font-family="system-ui,sans-serif" font-size="22" font-weight="900" font-style="italic" fill="#FFFFFF">%s</text>'
                        .'<rect x="414" y="138" width="246" height="42" rx="10" fill="#EC1B9B" stroke="#FFFFFF" stroke-width="2"/>'
                        .'<text x="537" y="167" text-anchor="middle" font-family="system-ui,sans-serif" font-size="24" font-weight="900" font-style="italic" fill="#FFFFFF">%s</text>'
                        /* Compact cosmetics showcase inside safe horizontal bounds */
                        .'<rect x="92" y="238" width="144" height="130" rx="12" fill="#F4F4F5" stroke="#D4D4D8" stroke-width="2"/>'
                        .'<rect x="104" y="252" width="96" height="28" rx="6" fill="#2E1049"/>'
                        .'<text x="152" y="271" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" font-weight="800" fill="#FFFFFF">MF STUDIO</text>'
                        .'<rect x="122" y="308" width="84" height="58" rx="12" fill="#FFFFFF" stroke="#A1A1AA" stroke-width="2"/><circle cx="164" cy="337" r="14" fill="#C22583"/>'
                        .'<ellipse cx="288" cy="346" rx="44" ry="18" fill="#18181B"/><rect x="244" y="310" width="88" height="36" fill="#27272A"/><ellipse cx="288" cy="310" rx="44" ry="16" fill="#EAB308"/>'
                        .'<circle cx="358" cy="322" r="36" fill="#18181B" stroke="#C22583" stroke-width="2.5"/><text x="358" y="327" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" font-weight="800" fill="#FFFFFF">MF GEL</text>'
                        .'<rect x="416" y="246" width="128" height="122" rx="14" fill="#FFFFFF" stroke="#E4E4E7" stroke-width="2"/>'
                        .'<circle cx="446" cy="282" r="18" fill="#F43F5E"/><circle cx="480" cy="282" r="18" fill="#A855F7"/><circle cx="514" cy="282" r="18" fill="#3B82F6"/>'
                        .'<circle cx="446" cy="330" r="18" fill="#EC4899"/><circle cx="480" cy="330" r="18" fill="#D946EF"/><circle cx="514" cy="330" r="18" fill="#FB7185"/>'
                        .'<rect x="568" y="220" width="18" height="48" rx="4" fill="#FFFFFF"/><rect x="558" y="268" width="38" height="100" rx="8" fill="#EF4444"/>'
                        .'<rect x="618" y="212" width="18" height="52" rx="4" fill="#FFFFFF"/><rect x="608" y="264" width="38" height="104" rx="8" fill="#A855F7"/>'
                        .'<rect x="668" y="220" width="18" height="48" rx="4" fill="#FFFFFF"/><rect x="658" y="268" width="38" height="100" rx="8" fill="#EC1B9B"/>'
                        .'</svg>',
                    $w,
                    $h,
                    htmlspecialchars($brand, ENT_XML1),
                    htmlspecialchars($big1, ENT_XML1),
                    htmlspecialchars($big2, ENT_XML1),
                    htmlspecialchars($line1, ENT_XML1),
                    htmlspecialchars($line2, ENT_XML1),
                    htmlspecialchars($pillText, ENT_XML1),
                );
            } else {
                $svg = sprintf(
                    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 440" width="%d" height="%d" preserveAspectRatio="xMidYMid slice">'
                        .'<rect width="1440" height="440" fill="#130410"/>'
                        .'<path d="M0,0 C110,90 120,250 18,440 L0,440 Z" fill="#A61072"/>'
                        .'<path d="M0,38 C82,115 88,240 0,385 Z" fill="#EC1B9B"/>'
                        .'<path d="M1440,0 C1345,100 1350,245 1440,415 Z" fill="#A61072"/>'
                        .'<path d="M1440,30 C1375,115 1380,235 1440,360 Z" fill="#EC1B9B"/>'
                        .'<rect x="0" y="388" width="1440" height="52" fill="#2A0823"/>'
                        .'<rect x="75" y="390" width="1290" height="6" rx="3" fill="#EC1B9B"/>'
                        .'<rect x="536" y="40" width="3" height="175" rx="1.5" fill="#EC1B9B"/>'
                        .'<text x="155" y="64" font-family="system-ui,sans-serif" font-size="22" font-weight="800" letter-spacing="3" fill="#FFFFFF">%s</text>'
                        .'<text x="112" y="132" font-family="system-ui,sans-serif" font-size="66" font-weight="900" font-style="italic" fill="#1E0518" stroke="#EC1B9B" stroke-width="3">%s</text>'
                        .'<text x="112" y="200" font-family="system-ui,sans-serif" font-size="66" font-weight="900" font-style="italic" fill="#EC1B9B" stroke="#FFFFFF" stroke-width="1.5">%s</text>'
                        .'<rect x="464" y="128" width="52" height="64" rx="10" transform="rotate(-10 490 160)" fill="#1D0618" stroke="#EC1B9B" stroke-width="3"/>'
                        .'<text x="490" y="172" text-anchor="middle" font-family="system-ui,sans-serif" font-size="33" font-weight="900" fill="#FFFFFF">%%</text>'
                        .'<text x="580" y="114" font-family="system-ui,sans-serif" font-size="38" font-weight="900" font-style="italic" fill="#FFFFFF">%s</text>'
                        .'<text x="565" y="172" font-family="system-ui,sans-serif" font-size="36" font-weight="900" font-style="italic" fill="#FFFFFF">%s</text>'
                        .'<rect x="945" y="130" width="350" height="56" rx="12" fill="#EC1B9B" stroke="#FFFFFF" stroke-width="2"/>'
                        .'<text x="1120" y="170" text-anchor="middle" font-family="system-ui,sans-serif" font-size="34" font-weight="900" font-style="italic" fill="#FFFFFF">%s</text>'
                        /* Illustrative Mistura Feminina cosmetic product showcase along the base */
                        .'<rect x="118" y="246" width="215" height="148" rx="14" fill="#F4F4F5" stroke="#D4D4D8" stroke-width="2"/>'
                        .'<rect x="136" y="264" width="128" height="36" rx="6" fill="#2E1049"/>'
                        .'<text x="200" y="287" text-anchor="middle" font-family="system-ui,sans-serif" font-size="14" font-weight="800" fill="#FFFFFF">MF PRO STUDIO</text>'
                        .'<rect x="165" y="328" width="120" height="66" rx="14" fill="#FFFFFF" stroke="#A1A1AA" stroke-width="2"/>'
                        .'<circle cx="225" cy="360" r="18" fill="#C22583"/>'
                        /* Brocas / Pincéis */
                        .'<rect x="372" y="254" width="14" height="138" rx="7" fill="#E4E4E7"/><ellipse cx="379" cy="242" rx="15" ry="24" fill="#FFFFFF"/>'
                        .'<rect x="412" y="254" width="14" height="138" rx="7" fill="#E4E4E7"/><ellipse cx="419" cy="242" rx="15" ry="24" fill="#FFFFFF"/>'
                        /* Pote Gel / Creme aberto */
                        .'<ellipse cx="535" cy="370" rx="58" ry="24" fill="#18181B"/><rect x="477" y="325" width="116" height="45" fill="#27272A"/>'
                        .'<ellipse cx="535" cy="325" rx="58" ry="22" fill="#EAB308"/>'
                        .'<circle cx="628" cy="340" r="46" fill="#18181B" stroke="#C22583" stroke-width="3"/><text x="628" y="346" text-anchor="middle" font-family="system-ui,sans-serif" font-size="14" font-weight="800" fill="#FFFFFF">MF GEL</text>'
                        /* Pote Skincare / Gel Construtor */
                        .'<rect x="708" y="318" width="120" height="76" rx="14" fill="#FFFFFF" stroke="#E4E4E7" stroke-width="2"/>'
                        .'<circle cx="768" cy="272" r="46" fill="#FFFFFF" stroke="#E4E4E7" stroke-width="2"/><circle cx="768" cy="272" r="34" fill="#E89DB1"/>'
                        .'<rect x="726" y="338" width="84" height="36" rx="6" fill="#FFF3FF"/><text x="768" y="361" text-anchor="middle" font-family="system-ui,sans-serif" font-size="14" font-weight="800" fill="#62298D">MISTURA</text>'
                        /* Paleta de cores / Glitter box */
                        .'<rect x="890" y="246" width="190" height="148" rx="16" fill="#FFFFFF" stroke="#E4E4E7" stroke-width="2"/>'
                        .'<circle cx="928" cy="288" r="24" fill="#F43F5E"/><circle cx="985" cy="288" r="24" fill="#A855F7"/><circle cx="1042" cy="288" r="24" fill="#3B82F6"/>'
                        .'<circle cx="928" cy="350" r="24" fill="#EC4899"/><circle cx="985" cy="350" r="24" fill="#D946EF"/><circle cx="1042" cy="350" r="24" fill="#FB7185"/>'
                        /* Fileira de 5 Esmaltes Mistura Feminina */
                        .'<rect x="1116" y="220" width="22" height="58" rx="4" fill="#FFFFFF"/><rect x="1104" y="278" width="46" height="116" rx="10" fill="#EF4444"/>'
                        .'<rect x="1174" y="220" width="22" height="58" rx="4" fill="#FFFFFF"/><rect x="1162" y="278" width="46" height="116" rx="10" fill="#18181B"/>'
                        .'<rect x="1232" y="210" width="24" height="62" rx="4" fill="#FFFFFF"/><rect x="1220" y="272" width="48" height="122" rx="10" fill="#A855F7"/>'
                        .'<rect x="1290" y="220" width="22" height="58" rx="4" fill="#FFFFFF"/><rect x="1278" y="278" width="46" height="116" rx="10" fill="#38BDF8"/>'
                        .'<rect x="1348" y="220" width="22" height="58" rx="4" fill="#FFFFFF"/><rect x="1336" y="278" width="46" height="116" rx="10" fill="#EC1B9B"/>'
                        .'</svg>',
                    $w,
                    $h,
                    htmlspecialchars($brand, ENT_XML1),
                    htmlspecialchars($big1, ENT_XML1),
                    htmlspecialchars($big2, ENT_XML1),
                    htmlspecialchars($line1, ENT_XML1),
                    htmlspecialchars($line2, ENT_XML1),
                    htmlspecialchars($pillText, ENT_XML1),
                );
            }
            File::put($dir.'/'.$filename, $svg);
        }

        $banners = [
            'promo-1.svg' => [700, 260, '#9E1A69', '#FFFFFF', 'UNHAS & GEL', 'Esmaltes e preparação profissional', 'VER LINHA'],
            'promo-2.svg' => [700, 260, '#62298D', '#FFF3FF', 'KITS COM DESCONTO', 'Monte sua rotina completa economizando', 'VER KITS'],
        ];

        foreach ($banners as $filename => [$w, $h, $bg, $accent, $eyebrow, $title, $sub]) {
            $svg = sprintf(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d"><rect width="%d" height="%d" fill="%s"/><rect x="%d" y="%d" width="%d" height="%d" rx="18" fill="%s"/><text x="%d" y="%d" font-family="system-ui,sans-serif" font-size="%d" font-weight="700" letter-spacing="2" fill="#FFFFFF">%s</text><text x="%d" y="%d" font-family="system-ui,sans-serif" font-size="%d" font-weight="800" fill="#FFFFFF">%s</text><text x="%d" y="%d" font-family="system-ui,sans-serif" font-size="%d" font-weight="600" fill="#FCE7F0">%s</text></svg>',
                $w,
                $h,
                $w,
                $h,
                $w,
                $h,
                $bg,
                (int) round($w * 0.68),
                (int) round($h * 0.16),
                (int) round($w * 0.25),
                (int) round($h * 0.68),
                $accent,
                (int) round($w * 0.06),
                (int) round($h * 0.34),
                $h > 300 ? 18 : 14,
                htmlspecialchars($eyebrow, ENT_XML1),
                (int) round($w * 0.06),
                (int) round($h * 0.54),
                $h > 300 ? 36 : 24,
                htmlspecialchars($title, ENT_XML1),
                (int) round($w * 0.06),
                (int) round($h * 0.72),
                $h > 300 ? 20 : 15,
                htmlspecialchars($sub, ENT_XML1),
            );
            File::put($dir.'/'.$filename, $svg);
        }

        $productPalette = [
            'prod-esmalte' => ['#C22583', 'Esmalte Gel', '15ml'],
            'prod-esmalte-perola' => ['#8B1A5D', 'Esmalte Pérola', '10ml'],
            'prod-esmalte-glitter' => ['#62298D', 'Esmalte Glitter', '10ml'],
            'prod-esmalte-noir' => ['#27272A', 'Esmalte Noir', '10ml'],
            'prod-serum' => ['#94509F', 'Sérum Facial', '30ml'],
            'prod-batom' => ['#9E1A69', 'Batom Velvet', '4g'],
            'prod-mascara' => ['#62298D', 'Máscara Capilar', '300g'],
            'prod-hidratante' => ['#B8428E', 'Loção Hidratante', '200ml'],
            'prod-cabine' => ['#2E1049', 'Cabine LED UV', '48W'],
            'prod-oleo' => ['#A83D82', 'Óleo Reparador', '60ml'],
            'prod-kit' => ['#C22583', 'Kit Cronograma', '3 Itens'],
            'prod-base' => ['#C968A3', 'Base Soft Matte', '30ml'],
            'prod-primer' => ['#7B357A', 'Primer Preparador', '15ml'],
            'prod-bruma' => ['#94509F', 'Bruma Fixadora', '120ml'],
            'prod-pincel' => ['#4A2068', 'Kit Pincéis', '8 Peças'],
        ];

        foreach ($productPalette as $file => [$tone, $label, $vol]) {
            $svg = sprintf(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600"><rect width="600" height="600" fill="#FFFFFF"/><rect x="195" y="130" width="210" height="310" rx="28" fill="%s"/><rect x="235" y="88" width="130" height="54" rx="10" fill="#2E1049"/><rect x="220" y="210" width="160" height="150" rx="14" fill="#FFFFFF"/><text x="300" y="268" text-anchor="middle" font-family="system-ui,sans-serif" font-size="22" font-weight="700" fill="#2E1049">%s</text><text x="300" y="302" text-anchor="middle" font-family="system-ui,sans-serif" font-size="16" font-weight="600" fill="#C22583">Mistura Feminina</text><text x="300" y="335" text-anchor="middle" font-family="system-ui,sans-serif" font-size="15" fill="#666666">%s</text></svg>',
                $tone,
                htmlspecialchars($label, ENT_XML1),
                htmlspecialchars($vol, ENT_XML1),
            );
            File::put($dir.'/'.$file.'.svg', $svg);
        }

        /* Crisp isolated studio-style SVGs on pure white background for category circles */
        $categoryIllustrations = [
            'cat-unhas.svg' => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220" width="220" height="220">'
                .'<rect x="44" y="42" width="18" height="36" rx="4" fill="#F4C2D7"/><rect x="34" y="78" width="38" height="92" rx="9" fill="#EC4899" stroke="#BE185D" stroke-width="2"/>'
                .'<rect x="42" y="102" width="22" height="36" rx="4" fill="#FFFFFF"/><text x="53" y="124" text-anchor="middle" font-family="system-ui,sans-serif" font-size="8" font-weight="800" fill="#62298D">GEL</text>'
                .'<rect x="100" y="28" width="20" height="44" rx="4" fill="#3D1260"/><rect x="88" y="72" width="44" height="106" rx="10" fill="#62298D" stroke="#3D1260" stroke-width="2"/>'
                .'<rect x="96" y="102" width="28" height="40" rx="5" fill="#FFFFFF"/><text x="110" y="126" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" font-weight="800" fill="#3D1260">MF</text>'
                .'<rect x="156" y="46" width="18" height="34" rx="4" fill="#E4E4E7"/><rect x="146" y="80" width="38" height="90" rx="9" fill="#FFF1F7" stroke="#D4D4D8" stroke-width="2"/>'
                .'<rect x="154" y="104" width="22" height="34" rx="4" fill="#C22583"/><text x="165" y="125" text-anchor="middle" font-family="system-ui,sans-serif" font-size="7" font-weight="800" fill="#FFFFFF">TOP</text>'
                .'</svg>',
            'cat-maquiagem.svg' => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220" width="220" height="220">'
                .'<rect x="34" y="72" width="102" height="84" rx="12" fill="#27272A" stroke="#18181B" stroke-width="2"/>'
                .'<circle cx="62" cy="98" r="14" fill="#F43F5E"/><circle cx="96" cy="98" r="14" fill="#D946EF"/>'
                .'<circle cx="62" cy="130" r="14" fill="#FB7185"/><circle cx="96" cy="130" r="14" fill="#A855F7"/>'
                .'<rect x="148" y="92" width="32" height="72" rx="6" fill="#2E1049"/>'
                .'<rect x="152" y="66" width="24" height="28" rx="3" fill="#D4AF37"/>'
                .'<path d="M154,66 L154,44 C154,36 174,34 174,48 L174,66 Z" fill="#C22583"/>'
                .'</svg>',
            'cat-facial.svg' => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220" width="220" height="220">'
                .'<rect x="64" y="34" width="16" height="26" rx="6" fill="#18181B"/><rect x="54" y="56" width="36" height="16" rx="4" fill="#D4D4D8"/>'
                .'<rect x="46" y="72" width="52" height="98" rx="12" fill="#FBCFE8" stroke="#C22583" stroke-width="2"/>'
                .'<rect x="54" y="98" width="36" height="44" rx="6" fill="#FFFFFF"/><text x="72" y="124" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" font-weight="800" fill="#62298D">SERUM</text>'
                .'<ellipse cx="144" cy="156" rx="38" ry="12" fill="#E4E4E7"/><rect x="110" y="106" width="68" height="50" rx="12" fill="#FFFFFF" stroke="#D4D4D8" stroke-width="2"/>'
                .'<rect x="116" y="90" width="56" height="18" rx="6" fill="#62298D"/><text x="144" y="136" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" font-weight="800" fill="#C22583">FACIAL</text>'
                .'</svg>',
            'cat-cabelos.svg' => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220" width="220" height="220">'
                .'<rect x="38" y="88" width="76" height="82" rx="14" fill="#F3E8FF" stroke="#62298D" stroke-width="2"/>'
                .'<rect x="44" y="68" width="64" height="22" rx="6" fill="#3D1260"/>'
                .'<rect x="50" y="110" width="52" height="38" rx="6" fill="#FFFFFF"/><text x="76" y="133" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" font-weight="800" fill="#62298D">MASK</text>'
                .'<path d="M148,42 L156,42 L156,58 L148,58 Z" fill="#18181B"/><rect x="132" y="66" width="40" height="104" rx="10" fill="#FDE047" stroke="#CA8A04" stroke-width="2"/>'
                .'<rect x="140" y="56" width="24" height="12" rx="3" fill="#27272A"/><rect x="138" y="96" width="28" height="40" rx="4" fill="#FFFFFF"/><text x="152" y="120" text-anchor="middle" font-family="system-ui,sans-serif" font-size="8" font-weight="800" fill="#3D1260">OLEO</text>'
                .'</svg>',
            'cat-corpo.svg' => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220" width="220" height="220">'
                .'<path d="M98,42 L126,42 M110,42 L110,60" stroke="#27272A" stroke-width="5" stroke-linecap="round"/>'
                .'<rect x="96" y="58" width="28" height="14" rx="4" fill="#3D1260"/>'
                .'<rect x="78" y="72" width="64" height="106" rx="18" fill="#FCE7F3" stroke="#C22583" stroke-width="2"/>'
                .'<rect x="90" y="102" width="40" height="44" rx="8" fill="#FFFFFF"/><text x="110" y="128" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" font-weight="800" fill="#62298D">CORPO</text>'
                .'<circle cx="152" cy="152" r="24" fill="#F472B6" stroke="#FFFFFF" stroke-width="3"/><text x="152" y="155" text-anchor="middle" font-family="system-ui,sans-serif" font-size="8" font-weight="800" fill="#FFFFFF">CREME</text>'
                .'</svg>',
            'cat-acessorios.svg' => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220" width="220" height="220">'
                .'<rect x="44" y="88" width="96" height="68" rx="16" fill="#F9A8D4" stroke="#C22583" stroke-width="2"/>'
                .'<circle cx="88" cy="122" r="18" fill="#18181B" stroke="#FFFFFF" stroke-width="3"/>'
                .'<circle cx="122" cy="110" r="6" fill="#3D1260"/>'
                .'<rect x="152" y="56" width="18" height="86" rx="8" fill="#EC4899" stroke="#9D174D" stroke-width="2"/>'
                .'<rect x="158" y="34" width="6" height="24" rx="3" fill="#71717A"/>'
                .'<path d="M40,156 C40,174 176,174 176,156" stroke="#3D1260" stroke-width="4" fill="none" stroke-linecap="round"/>'
                .'</svg>',
        ];

        foreach ($categoryIllustrations as $file => $svg) {
            File::put($dir.'/'.$file, $svg);
        }

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
            ['slug' => 'unhas-e-esmalteria', 'name' => 'Unhas e Esmalteria', 'icon' => 'sparkles', 'image_path' => '/storage/seed/cat-unhas.jpg', 'order' => 1],
            ['slug' => 'maquiagem', 'name' => 'Maquiagem', 'icon' => 'heart', 'image_path' => '/storage/seed/cat-maquiagem.jpg', 'order' => 2],
            ['slug' => 'skincare', 'name' => 'Cuidados Faciais', 'icon' => 'droplet', 'image_path' => '/storage/seed/cat-facial.jpg', 'order' => 3],
            ['slug' => 'cabelos', 'name' => 'Cabelos', 'icon' => 'sun', 'image_path' => '/storage/seed/cat-cabelos.jpg', 'order' => 4],
            ['slug' => 'corpo-e-banho', 'name' => 'Corpo e Banho', 'icon' => 'flower', 'image_path' => '/storage/seed/cat-corpo.jpg', 'order' => 5],
            ['slug' => 'acessorios-pro', 'name' => 'Acessórios Profissionais', 'icon' => 'briefcase', 'image_path' => '/storage/seed/cat-acessorios.jpg', 'order' => 6],
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
            ['parent' => 'unhas-e-esmalteria', 'slug' => 'esmaltes-em-gel', 'name' => 'Esmaltes em Gel', 'order' => 1],
            ['parent' => 'unhas-e-esmalteria', 'slug' => 'preparadores-e-primers', 'name' => 'Preparadores e Primers', 'order' => 2],
            ['parent' => 'unhas-e-esmalteria', 'slug' => 'alongamento-e-geis', 'name' => 'Alongamento e Géis', 'order' => 3],
            ['parent' => 'unhas-e-esmalteria', 'slug' => 'top-coat-e-finalizadores', 'name' => 'Top Coat e Finalizadores', 'order' => 4],
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
                'brand' => 'lumiere-nails', 'cats' => ['unhas-e-esmalteria', 'esmaltes-em-gel', 'alongamento-e-geis'], 'img' => '/storage/seed/prod-esmalte.jpg',
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
                'brand' => 'studio-pro', 'cats' => ['acessorios-pro', 'cabines-e-estufas', 'unhas-e-esmalteria', 'alongamento-e-geis'], 'img' => '/storage/seed/prod-cabine.jpg',
                'type' => ProductType::Simple, 'price' => 16990, 'promo' => 13490, 'featured' => true, 'new' => false, 'best' => true, 'stock' => 9, 'weight' => 650,
                'short' => '36 LEDs duplos para secagem uniforme de gel, acrygel e blindagem.',
            ],
            [
                'sku' => 'MF-PRM-008', 'slug' => 'primer-acido-preparador-unhas-15ml', 'name' => 'Primer Preparador Adesivador de Unhas 15ml',
                'brand' => 'lumiere-nails', 'cats' => ['unhas-e-esmalteria', 'preparadores-e-primers', 'top-coat-e-finalizadores'], 'img' => '/storage/seed/prod-primer.jpg',
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
                'brand' => 'studio-pro', 'cats' => ['acessorios-pro', 'pinceis-profissionais', 'brocas-e-lixas', 'brocas-ceramica', 'lixas-profissionais', 'maquiagem'], 'img' => '/storage/seed/prod-pincel.jpg',
                'type' => ProductType::Simple, 'price' => 11990, 'promo' => 8990, 'featured' => false, 'new' => true, 'best' => false, 'stock' => 0,
                'short' => 'Cerdas sintéticas de alta densidade para acabamento polido (item para testar Avise-me quando esgotado).',
            ],
            [
                'sku' => 'MF-KIT-012', 'slug' => 'kit-cronograma-capilar-reconstrucao-brilho', 'name' => 'Kit Capilar Reconstrução + Óleo Reparador',
                'brand' => 'mistura-lab', 'cats' => ['cabelos', 'kits-capilares'], 'img' => '/storage/seed/prod-kit.jpg',
                'type' => ProductType::Kit, 'price' => 13480, 'promo' => 9990, 'featured' => true, 'new' => true, 'best' => true, 'stock' => 10,
                'short' => 'Combo completo com Máscara Reconstrução 300g + Óleo Reparador 60ml com desconto especial.',
            ],
            [
                'sku' => 'MF-ESM-013', 'slug' => 'esmalte-em-gel-cintilante-perola-10ml', 'name' => 'Esmalte em Gel Cintilante Pérola 10ml',
                'brand' => 'lumiere-nails', 'cats' => ['unhas-e-esmalteria', 'esmaltes-em-gel'], 'img' => '/storage/seed/prod-esmalte-perola.jpg',
                'type' => ProductType::Simple, 'price' => 1990, 'promo' => 1490, 'featured' => false, 'new' => false, 'best' => true, 'stock' => 35,
                'short' => 'Acabamento perolado de longa duração com secagem rápida em cabine LED/UV.',
            ],
            [
                'sku' => 'MF-ESM-014', 'slug' => 'esmalte-em-gel-reflexivo-glitter-10ml', 'name' => 'Esmalte em Gel Reflexivo Glitter 10ml',
                'brand' => 'lumiere-nails', 'cats' => ['unhas-e-esmalteria', 'esmaltes-em-gel'], 'img' => '/storage/seed/prod-esmalte-glitter.jpg',
                'type' => ProductType::Simple, 'price' => 2290, 'promo' => null, 'featured' => false, 'new' => false, 'best' => false, 'stock' => 28,
                'short' => 'Partículas refletivas de brilho intenso para encapsulamento e esmaltação.',
            ],
            [
                'sku' => 'MF-ESM-015', 'slug' => 'esmalte-em-gel-quadrado-noir-10ml', 'name' => 'Esmalte em Gel Quadrado Noir 10ml',
                'brand' => 'lumiere-nails', 'cats' => ['unhas-e-esmalteria', 'esmaltes-em-gel'], 'img' => '/storage/seed/prod-esmalte-noir.jpg',
                'type' => ProductType::Simple, 'price' => 1890, 'promo' => null, 'featured' => false, 'new' => false, 'best' => false, 'stock' => 0,
                'short' => 'Preto pigmentado cobertura única (disponível para aviso de reposição).',
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
            ['title' => 'Semana da Beleza Mistura Feminina', 'placement' => 'hero', 'desktop' => '/storage/seed/hero-1-desktop.jpg', 'mobile' => '/storage/seed/hero-1-mobile.jpg', 'alt' => 'Semana da Beleza Mistura Feminina', 'cta' => 'Ver ofertas', 'url' => '/promocoes', 'order' => 1],
            ['title' => 'Cuidados Faciais e Corporais', 'placement' => 'hero', 'desktop' => '/storage/seed/hero-2-desktop.jpg', 'mobile' => '/storage/seed/hero-2-mobile.jpg', 'alt' => 'Cuidados Faciais e Corporais Mistura Feminina', 'cta' => 'Explorar Skincare', 'url' => '/categoria/skincare', 'order' => 2],
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

        $sections = [
            ['key' => 'hero_main', 'type' => 'hero_carousel', 'title' => null, 'subtitle' => null, 'config' => [], 'order' => 1],
            ['key' => 'coupon_banner', 'type' => 'coupon_strip', 'title' => 'Aproveite um Desconto Especial!', 'subtitle' => 'Na sua primeira compra, use o cupom BEMVINDA10 e ganhe 10% OFF!', 'config' => [], 'order' => 2],
            ['key' => 'benefits_strip', 'type' => 'benefits_row', 'title' => null, 'subtitle' => null, 'config' => [], 'order' => 3],
            ['key' => 'categories_row', 'type' => 'category_circles', 'title' => 'Navegue por Categorias', 'subtitle' => 'Encontre exatamente o que sua rotina precisa', 'config' => ['limit' => 8], 'order' => 4],
            ['key' => 'offers_week', 'type' => 'product_showcase', 'title' => 'Confira nossas ofertas da semana', 'subtitle' => 'Descontos válidos enquanto durarem os estoques', 'config' => ['filter' => 'offers', 'limit' => 8, 'cta_url' => '/promocoes'], 'order' => 5],
            ['key' => 'promo_banners', 'type' => 'banner_grid', 'title' => null, 'subtitle' => null, 'config' => [], 'order' => 6],
            ['key' => 'new_arrivals', 'type' => 'product_showcase', 'title' => 'Novidades', 'subtitle' => null, 'config' => ['filter' => 'new_arrivals', 'limit' => 8, 'borderless' => true, 'show_view_all' => false, 'show_featured_badge' => true, 'cta_url' => '/novidades'], 'order' => 7],
            ['key' => 'brands_row', 'type' => 'product_showcase', 'title' => 'Mistura Lab', 'subtitle' => null, 'config' => ['filter' => 'brand', 'brand_slug' => 'mistura-lab', 'limit' => 8, 'borderless' => true, 'show_view_all' => false, 'cta_url' => '/marca/mistura-lab'], 'order' => 8],
            ['key' => 'niche_esmaltes', 'type' => 'product_showcase', 'title' => 'Esmaltes em Gel', 'subtitle' => null, 'config' => ['filter' => 'category', 'category_slug' => 'esmaltes-em-gel', 'limit' => 8, 'borderless' => true, 'show_view_all' => false, 'cta_url' => '/categoria/esmaltes-em-gel'], 'order' => 9],
            ['key' => 'best_sellers', 'type' => 'product_showcase', 'title' => 'Produtos mais Vendidos da semana', 'subtitle' => null, 'config' => ['filter' => 'best_sellers', 'limit' => 8, 'borderless' => true, 'show_view_all' => false, 'cta_url' => '/categorias'], 'order' => 10],
            ['key' => 'best_brands', 'type' => 'brand_showcase', 'title' => 'As melhores marcas', 'subtitle' => null, 'config' => ['limit' => 12, 'autoplay' => true, 'show_view_all' => false], 'order' => 11],
            ['key' => 'featured_showcase', 'type' => 'product_showcase', 'title' => 'Destaques', 'subtitle' => null, 'config' => ['filter' => 'featured', 'limit' => 8, 'borderless' => true, 'show_view_all' => false, 'show_featured_badge' => true, 'cta_url' => '/categorias'], 'order' => 12],
            ['key' => 'quem_compra_indica', 'type' => 'testimonials', 'title' => 'Quem compra indica!', 'subtitle' => null, 'config' => ['limit' => 8], 'order' => 13],
            ['key' => 'newsletter_box', 'type' => 'newsletter', 'title' => 'Receba lançamentos e cupons exclusivos', 'subtitle' => 'Cadastre seu e-mail para novidades da Mistura Feminina Cosméticos', 'config' => [], 'order' => 14],
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
