import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const SCREENSHOT_DIR = path.resolve(process.cwd(), "../docs/screenshots");

const ADMIN_USER = {
  id: 1,
  name: "Operadora Catálogo",
  email: "catalogo@misturafeminina.com.br",
  roles: ["catalog"],
  permissions: [
    "dashboard.view",
    "catalog.view",
    "catalog.write",
    "catalog.pricing",
    "catalog.bulk_edit",
    "inventory.manage",
    "inventory.receive",
    "ai.view",
    "ai.catalog",
    "ai.catalog.approve",
  ],
  workspace_id: null,
};

interface MockProduct {
  id: number;
  name: string;
  slug: string;
  sku: string;
  gtin?: string | null;
  power_watts?: number | null;
  brand_id: number | null;
  brand: { id: number; name: string } | null;
  categories: Array<{ id: number; name: string }>;
  price_cents: number;
  promo_price_cents: number | null;
  weight_grams: number;
  short_description: string | null;
  description: string | null;
  is_active: boolean;
  is_archived: boolean;
  is_featured: boolean;
  is_new_arrival: boolean;
  images: Array<{ id: number; path: string; alt_text: string; is_primary: boolean }>;
  variants: Array<{
    id: number;
    sku: string;
    name: string;
    shade_code?: string;
    color_hex?: string;
    price_cents: number;
    promo_price_cents: number | null;
    stock_qty: number;
    reserved_qty: number;
    is_default: boolean;
    is_active: boolean;
    updated_at: string;
  }>;
  variants_summary: {
    count: number;
    is_multi_variant: boolean;
    price_min_cents: number;
    price_max_cents: number;
    effective_min_cents: number;
    effective_max_cents: number;
    total_stock: number;
    total_reserved: number;
    total_available: number;
    out_of_stock_count: number;
    has_promo: boolean;
  };
  updated_at: string;
}

function makeSeedProducts(): MockProduct[] {
  const list: MockProduct[] = [];
  for (let i = 1; i <= 30; i++) {
    const pad = String(i).padStart(2, "0");
    const isMulti = i === 1;
    const basePrice = 1990 + i * 100;
    list.push({
      id: i,
      name:
        i === 1
          ? "Esmalte Gel Studio 15 ml (Coleção Clássica)"
          : `Produto Cosmético ${pad}`,
      slug: `produto-${pad}`,
      sku: `MF-CAT-${pad}`,
      gtin: `007891000000${pad}`,
      power_watts: i === 2 ? 48 : null,
      brand_id: i % 2 === 0 ? 1 : 2,
      brand:
        i % 2 === 0
          ? { id: 1, name: "Mistura Studio" }
          : { id: 2, name: "Bella Gel" },
      categories: [{ id: 10, name: "Esmaltes em Gel" }],
      price_cents: basePrice,
      promo_price_cents: null,
      weight_grams: 180,
      short_description: "Produto selecionado do catálogo Mistura Feminina",
      description: "Descrição completa para testes.",
      is_active: i !== 3,
      is_archived: false,
      is_featured: false,
      is_new_arrival: true,
      images: [],
      variants: isMulti
        ? [
            {
              id: 101,
              sku: "MF-CAT-01-ROS",
              name: "Rosa 042",
              shade_code: "042",
              color_hex: "#e11d48",
              price_cents: 1990,
              promo_price_cents: null,
              stock_qty: 14,
              reserved_qty: 2,
              is_default: true,
              is_active: true,
              updated_at: "2026-11-25T01:00:00Z",
            },
            {
              id: 102,
              sku: "MF-CAT-01-NUD",
              name: "Nude 017",
              shade_code: "017",
              color_hex: "#d6b89c",
              price_cents: 2290,
              promo_price_cents: 1890,
              stock_qty: 0,
              reserved_qty: 0,
              is_default: false,
              is_active: true,
              updated_at: "2026-11-25T01:00:00Z",
            },
          ]
        : [
            {
              id: 1000 + i,
              sku: `MF-CAT-${pad}`,
              name: "Padrão",
              price_cents: basePrice,
              promo_price_cents: null,
              stock_qty: i === 4 ? 0 : 12 + i,
              reserved_qty: 0,
              is_default: true,
              is_active: true,
              updated_at: "2026-11-25T01:00:00Z",
            },
          ],
      variants_summary: isMulti
        ? {
            count: 2,
            is_multi_variant: true,
            price_min_cents: 1990,
            price_max_cents: 2290,
            effective_min_cents: 1890,
            effective_max_cents: 1990,
            total_stock: 14,
            total_reserved: 2,
            total_available: 12,
            out_of_stock_count: 1,
            has_promo: true,
          }
        : {
            count: 1,
            is_multi_variant: false,
            price_min_cents: basePrice,
            price_max_cents: basePrice,
            effective_min_cents: basePrice,
            effective_max_cents: basePrice,
            total_stock: i === 4 ? 0 : 12 + i,
            total_reserved: 0,
            total_available: i === 4 ? 0 : 12 + i,
            out_of_stock_count: i === 4 ? 1 : 0,
            has_promo: false,
          },
      updated_at: "2026-11-25T01:00:00Z",
    });
  }
  return list;
}

async function setupAdminMocks(page: import("@playwright/test").Page) {
  const products = makeSeedProducts();

  await page.addInitScript(() => {
    localStorage.setItem("devstep:analytics-consent:v1", "denied");
  });

  // Catch-all API fallback registered first (Playwright evaluates handlers in reverse registration order)
  await page.route("**/api/v1/**", (r) => r.fulfill({ json: { data: [] } }));

  await page.route("https://www.googletagmanager.com/**", (r) =>
    r.fulfill({ contentType: "application/javascript", body: "/* stub */" }),
  );
  await page.route("**/sanctum/csrf-cookie", async (r) => {
    await page.context().addCookies([
      {
        name: "XSRF-TOKEN",
        value: "test%3Dcsrf",
        url: "http://127.0.0.1:3100",
      },
    ]);
    await r.fulfill({ status: 204 });
  });
  await page.route("**/api/v1/me", (r) => r.fulfill({ json: { data: ADMIN_USER } }));
  await page.route("**/api/v1/storefront/bootstrap", (r) =>
    r.fulfill({
      json: {
        data: {
          settings: {
            store_name: "Mistura Feminina Cosméticos",
            tagline: "Beleza e alta performance",
            logo_light_url: "/logo-mf.png",
            logo_dark_url: "/logo-mf-dark.png",
            favicon_url: "/favicon.ico",
            primary_color: "#93509E",
            primary_hover_color: "#7C3F87",
            secondary_color: "#62298D",
            accent_color: "#93509E",
          },
          menu_categories: [],
          promo_products: [],
          recommended_products: [],
          brands: [],
          footer_pages: [],
          featured_coupon: null,
        },
      },
    }),
  );
  await page.route("**/api/v1/admin/dashboard", (r) =>
    r.fulfill({ json: { data: { kpis: { to_pack_count: 0, low_stock_count: 1 } } } }),
  );
  await page.route("**/api/v1/admin/brands", (r) =>
    r.fulfill({
      json: {
        data: [
          { id: 1, name: "Mistura Studio" },
          { id: 2, name: "Bella Gel" },
        ],
      },
    }),
  );
  await page.route("**/api/v1/admin/categories", (r) =>
    r.fulfill({
      json: {
        data: [
          { id: 10, name: "Esmaltes em Gel" },
          { id: 11, name: "Cabines & Luminárias" },
        ],
      },
    }),
  );
  await page.route("**/api/v1/admin/attributes", (r) =>
    r.fulfill({ json: { data: [] } }),
  );

  await page.route("**/api/v1/admin/products**", (r) => {
    const req = r.request();
    const url = new URL(req.url());
    const pathname = url.pathname;
    if (pathname.endsWith("/bulk-rules/preview") || pathname.endsWith("/bulk-rules/commit")) {
      return r.fallback();
    }
    if (req.method() === "GET" && /\/admin\/products\/\d+$/.test(pathname)) {
      const idNum = Number(pathname.split("/").pop());
      const found = products.find((p) => p.id === idNum) ?? products[0];
      return r.fulfill({ json: { data: found } });
    }
    if (req.method() !== "GET") {
      return r.fulfill({ json: { data: products[0] } });
    }

    const pageNum = Number(url.searchParams.get("page") || "1");
    const search = (url.searchParams.get("search") || "").toLowerCase();
    const brandId = url.searchParams.get("brand_id");
    const perPage = Number(url.searchParams.get("per_page") || "25");

    let filtered = [...products];
    if (search) {
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(search) ||
          p.sku.toLowerCase().includes(search) ||
          (p.gtin ?? "").includes(search),
      );
    }
    if (brandId) {
      filtered = filtered.filter((p) => String(p.brand_id) === brandId);
    }

    const start = (pageNum - 1) * perPage;
    const pageItems = filtered.slice(start, start + perPage);
    return r.fulfill({
      json: {
        data: pageItems,
        current_page: pageNum,
        last_page: Math.max(1, Math.ceil(filtered.length / perPage)),
        per_page: perPage,
        total: filtered.length,
      },
    });
  });

  await page.route("**/api/v1/admin/variants/*/stock", (r) => {
    const body = r.request().postDataJSON() as { operation?: string; quantity?: number };
    const prod = products[1];
    prod.variants[0].stock_qty = body.quantity ?? 25;
    prod.variants_summary.total_available = body.quantity ?? 25;
    return r.fulfill({ json: { data: prod.variants[0] } });
  });

  await page.route("**/api/v1/admin/products/bulk-rules/preview", (r) =>
    r.fulfill({
      json: {
        data: {
          summary: {
            total_products: 2,
            total_items: 2,
            valid_count: 2,
            invalid_count: 0,
            impacted_wholesale_count: 1,
            impacted_promo_count: 0,
            requires_async: false,
            operation_label: "preço",
          },
          rows: [
            {
              row_key: "variant:101",
              level: "variant",
              product_id: 1,
              product_name: "Esmalte Gel Studio 15 ml (Coleção Clássica)",
              variant_id: 101,
              sku: "MF-CAT-01-ROS",
              variant_name: "Rosa 042",
              valid: true,
              errors: [],
              impacts: [
                "Atacado (Regra Salão +10 un.): preços de atacado percentuais serão recalculados.",
              ],
              changes: [
                {
                  field: "price",
                  label: "Preço de venda",
                  old_display: "R$ 19,90",
                  new_display: "R$ 21,89",
                },
              ],
            },
          ],
          preview_snapshot: {
            selection_hash: "snap-hash-1",
            items: {},
            generated_at: "2026-11-25T01:00:00Z",
          },
        },
      },
    }),
  );

  await page.route("**/api/v1/admin/products/bulk-rules/commit", (r) =>
    r.fulfill({
      json: {
        data: {
          status: "completed",
          queued: false,
          batch: { id: 901, batch_code: "REGRA-01" },
          counts: { completed: 2, skipped: 0, pending: 0 },
        },
      },
    }),
  );

  await page.route("**/api/v1/admin/variants/bulk?**", (r) =>
    r.fulfill({
      json: {
        data: [
          {
            variant_id: 101,
            product_id: 1,
            product_name: "Esmalte Gel Studio 15 ml",
            name: "Rosa 042",
            shade_code: "042",
            color_family: "Rosa",
            color_hex: "#e11d48",
            sku: "MF-CAT-01-ROS",
            price_cents: 1990,
            promo_price_cents: null,
            stock_qty: 14,
            sort_order: 0,
            is_active: true,
          },
          {
            variant_id: 102,
            product_id: 1,
            product_name: "Esmalte Gel Studio 15 ml",
            name: "Nude 017",
            shade_code: "017",
            color_family: "Nude",
            color_hex: "#d6b89c",
            sku: "MF-CAT-01-NUD",
            price_cents: 2290,
            promo_price_cents: 1890,
            stock_qty: 8,
            sort_order: 1,
            is_active: true,
          },
        ],
      },
    }),
  );

  await page.route("**/api/v1/admin/variants/bulk-parse", (r) =>
    r.fulfill({
      json: {
        data: {
          summary: {
            total_rows: 2,
            new_count: 0,
            update_count: 1,
            invalid_count: 1,
            duplicate_skus: [],
            unknown_skus: ["SKU-INEXISTENTE"],
          },
          rows: [
            {
              row_index: 0,
              variant_id: 102,
              product_id: 1,
              product_name: "Esmalte Gel Studio 15 ml",
              name: "Nude 017",
              sku: "MF-CAT-01-NUD",
              price_cents: 2490,
              promo_price_cents: 1890,
              stock_qty: 20,
              action: "update",
              errors: [],
              impacts: ["Promoção mantida em R$ 18,90"],
              changes: [
                {
                  field: "price",
                  label: "Preço de venda",
                  old_display: "R$ 22,90",
                  new_display: "R$ 24,90",
                },
              ],
            },
            {
              row_index: 1,
              variant_id: null,
              product_id: null,
              product_name: "Desconhecido",
              name: "",
              sku: "SKU-INEXISTENTE",
              price_cents: 1500,
              promo_price_cents: null,
              stock_qty: 5,
              action: "unknown_sku",
              errors: ["SKU SKU-INEXISTENTE não encontrado no catálogo."],
              impacts: [],
              changes: [],
            },
          ],
        },
      },
    }),
  );

  await page.route("**/api/v1/admin/variants/bulk-preview", (r) =>
    r.fulfill({
      json: {
        data: {
          summary: {
            total_rows: 2,
            new_count: 0,
            update_count: 1,
            invalid_count: 1,
            duplicate_skus: [],
            unknown_skus: ["SKU-INEXISTENTE"],
          },
          rows: [
            {
              row_index: 0,
              variant_id: 102,
              product_id: 1,
              sku: "MF-CAT-01-NUD",
              name: "Nude 017",
              action: "update",
              errors: [],
              changes: [],
            },
            {
              row_index: 1,
              variant_id: null,
              product_id: null,
              sku: "SKU-INEXISTENTE",
              name: "",
              action: "unknown_sku",
              errors: ["SKU SKU-INEXISTENTE não encontrado."],
              changes: [],
            },
          ],
        },
      },
    }),
  );

  const mockAiImport = {
    id: 77,
    source_type: "image",
    status: "awaiting_review",
    original_filenames: ["cabine-sun-uv.png"],
    conversation_messages: [],
    total_records: 2,
    grouped_products_count: 2,
    grouped_variants_count: 2,
    new_count: 1,
    update_count: 0,
    duplicate_count: 1,
    incomplete_count: 0,
    error_count: 1,
    created_at: "2026-11-25T01:00:00Z",
    items: [
      {
        id: 771,
        import_id: 77,
        row_index: 0,
        group_key: "cabine-led",
        product_reference: "Cabine UV LED Sun Profissional",
        sku: "CAB-SUN-01",
        gtin: "00789000112233",
        action_type: "insufficient_info",
        matched_product_id: null,
        matched_variant_id: null,
        resolution_choice: "manual_review",
        approval_status: "pending",
        proposed_data: {
          product_name: "Cabine UV LED Sun Profissional",
          variant_name: "Branca Bivolt",
          sku: "CAB-SUN-01",
          gtin: "00789000112233",
          is_equipment: true,
          power_watts: null,
          shipping_weight_grams: null,
          volume: null,
          price_cents: 0,
          cost_price_cents: 8900,
          stock_qty: 6,
        },
        source_evidence: {
          origin_file: "cabine-sun-uv.png",
          origin_detail: "Imagem enviada para conferência",
          raw_snippet: "Cabine Sun - Etiqueta sem leitura segura da potência em Watts",
          fields: {
            power_watts: "missing_illegible",
            price: "supplier_cost_requires_retail_confirmation",
          },
        },
        validation_result: {
          is_valid: false,
          errors: [
            "Equipamento elétrico sem potência (W) legível — informe manualmente antes de cadastrar.",
          ],
          warnings: [
            "Valor (R$ 89,00) identificado como custo/lista de fornecedor — confirme o preço de venda antes de publicar.",
          ],
        },
        duplicate_comparison: null,
      },
      {
        id: 772,
        import_id: 77,
        row_index: 1,
        group_key: "gel-15g",
        product_reference: "Gel Construtor Hard — 15 g",
        sku: "GEL-HARD-15",
        gtin: null,
        action_type: "possible_duplicate",
        matched_product_id: 1,
        matched_variant_id: null,
        resolution_choice: "manual_review",
        approval_status: "pending",
        proposed_data: {
          product_name: "Gel Construtor Hard — 15 g",
          variant_name: "Clear",
          sku: "GEL-HARD-15",
          volume: "15 g",
          shipping_weight_grams: null,
          is_equipment: false,
          price_cents: 2990,
          stock_qty: 12,
        },
        source_evidence: {
          origin_file: "lista-fornecedor.csv",
          origin_detail: "Linha 2",
          fields: { volume: "provided", shipping_weight: "missing" },
        },
        validation_result: {
          is_valid: true,
          errors: [],
          warnings: [
            "Possível duplicidade detectada por nome/marca semelhantes.",
          ],
        },
        duplicate_comparison: {
          reason: "Nome comercial semelhante no catálogo oficial",
          existing: {
            product_id: 1,
            product_name: "Esmalte Gel Studio 15 ml (Coleção Clássica)",
            sku: "MF-CAT-01",
            price_cents: 1990,
          },
        },
      },
    ],
  };

  await page.route("**/api/v1/admin/ai/catalog/imports", (r) => {
    if (r.request().method() === "POST") {
      return r.fulfill({ status: 201, json: { data: mockAiImport } });
    }
    return r.fulfill({ json: { data: [mockAiImport] } });
  });

  await page.route("**/api/v1/admin/ai/catalog/imports/*", (r) =>
    r.fulfill({ json: { data: mockAiImport } }),
  );
}

test.describe("Admin Produtos Redesign E2E & Responsividade", () => {
  test("Desktop 1280px: catalogo compacto, expansao de variacoes, ajuste de saldo com resultado, regra em massa e captura de screenshots", async ({
    page,
  }) => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupAdminMocks(page);

    await page.goto("/admin/produtos");
    await expect(page.getByRole("heading", { name: "Produtos", exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("30 resultados")).toBeVisible();

    // Expand variations on multi-variant product
    await page.getByRole("button", { name: /2 variações/i }).click();
    await expect(page.getByRole("table").getByText("MF-CAT-01-ROS")).toBeVisible();
    await expect(page.getByRole("table").getByText("MF-CAT-01-NUD")).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "admin-produtos-desktop.png"),
      fullPage: false,
    });

    // Cross-page selection & "Selecionar todos os 30 resultados" banner
    await page
      .getByRole("checkbox", { name: /Selecionar os 25 desta página/i })
      .check();
    await expect(
      page.getByRole("button", { name: /Selecionar todos os 30 resultados/i }),
    ).toBeVisible();

    // Quick stock popover showing Saldo atual -> Operação -> Saldo resultante
    await page
      .getByRole("checkbox", { name: /Selecionar os 25 desta página/i })
      .uncheck();
    await page
      .getByRole("button", { name: "14 un.", exact: true })
      .first()
      .click();
    await expect(page.getByText("Saldo atual")).toBeVisible();
    await expect(page.getByText("Saldo resultante")).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();

    // Open Mode A Bulk Rule modal & capture screenshot
    await page.getByRole("checkbox", { name: /Selecionar Esmalte Gel Studio/i }).check();
    await page.getByRole("button", { name: "Editar em massa" }).click();
    await page.getByRole("button", { name: "Visualizar prévia" }).click();
    await expect(page.getByText(/Atacado \(Regra Salão/)).toBeVisible();
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "admin-produtos-regras-lote.png"),
      fullPage: false,
    });
    await page.getByRole("button", { name: /Confirmar 2 alterações/i }).click();
    await expect(page.getByText(/2 alterações aplicadas/)).toBeVisible();

    // Search + Edit + Return preserves filters
    await page
      .getByPlaceholder("Buscar por nome, SKU ou código de barras...")
      .fill("Produto Cosmético 02");
    await expect(page.getByText("Produto Cosmético 02").first()).toBeVisible();
    await page.getByRole("button", { name: "Produto Cosmético 02" }).first().click();
    await expect(page.getByText(/Editar produto — MF-CAT-02/)).toBeVisible();
    await page.getByRole("button", { name: "Voltar ao catálogo" }).click();
    await expect(
      page.getByPlaceholder("Buscar por nome, SKU ou código de barras..."),
    ).toHaveValue("Produto Cosmético 02");
  });

  test("Modo B Grade Individual e Cadastro com IA: teclado Tab/Enter/Esc, colagem fora de ordem e revisao de cabine sem watts", async ({
    page,
  }) => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupAdminMocks(page);

    await page.goto("/admin/produtos?view=massa");
    await page.getByRole("button", { name: "Carregar grade" }).click();
    await expect(page.locator('[data-grid-cell="0:price_brl"]')).toBeVisible();

    // Esc restores cell value
    const cell0 = page.locator('[data-grid-cell="0:price_brl"]');
    await cell0.focus();
    await cell0.fill("99,90");
    await page.keyboard.press("Escape");
    await expect(cell0).toHaveValue("19,90");

    // Paste Excel out-of-order with invalid SKU
    await page
      .getByRole("button", { name: "Colar Excel / Google Sheets" })
      .click();
    await page
      .locator("textarea")
      .fill("SKU\tPreço\tEstoque\nMF-CAT-01-NUD\t24,90\t20\nSKU-INEXISTENTE\t15,00\t5");
    await page.getByRole("button", { name: "Processar planilha" }).click();
    await expect(page.getByText(/SKUs desconhecidos: SKU-INEXISTENTE/)).toBeVisible();
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "admin-produtos-grade-massa.png"),
      fullPage: false,
    });

    // Unified AI flow ("Cadastrar com IA")
    await page.getByRole("button", { name: "Cadastrar com IA" }).first().click();
    await page.getByRole("button", { name: /Retomar rascunho #77/i }).click();
    await expect(page.getByText("Revisão do Lote #77")).toBeVisible();
    await expect(
      page.getByText(/Equipamento elétrico sem potência \(W\) legível/).first(),
    ).toBeVisible();
    await expect(
      page.getByText(/Potência elétrica \(W\)/).first(),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "admin-produtos-ia-revisao.png"),
      fullPage: false,
    });
  });

  for (const vp of [
    { name: "mobile-360", width: 360, height: 740 },
    { name: "mobile-390", width: 390, height: 844 },
  ]) {
    test(`Responsividade ${vp.name} (${vp.width}px): zero rolagem horizontal global e edicao acessivel`, async ({
      page,
    }) => {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await setupAdminMocks(page);

      await page.goto("/admin/produtos");
      await expect(page.getByRole("heading", { name: "Produtos", exact: true })).toBeVisible({
        timeout: 15_000,
      });

      const hasOverflowList = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(hasOverflowList).toBe(false);

      if (vp.width === 360) {
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, "admin-produtos-mobile-360.png"),
          fullPage: false,
        });
      }

      // Open mobile filters sheet with badge count
      await page.getByRole("button", { name: /Filtros/i }).click();
      await page
        .getByRole("dialog", { name: "Filtrar catálogo" })
        .locator("select")
        .first()
        .selectOption("1");
      await page.getByRole("button", { name: /Ver .* produtos/i }).click();
      await expect(page.getByRole("button", { name: /Filtros\s*1/i })).toBeVisible();

      // Navigate to Mode B grid & confirm zero global page horizontal overflow even with sticky left column
      await page.goto("/admin/produtos?view=massa");
      await page.getByRole("button", { name: "Carregar grade" }).click();
      await expect(page.locator('[data-grid-cell="0:sku"]')).toBeVisible();

      const hasOverflowGrid = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(hasOverflowGrid).toBe(false);
    });
  }
});
