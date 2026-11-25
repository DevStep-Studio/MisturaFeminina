import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const SCREENSHOT_DIR = path.resolve(process.cwd(), "../docs/screenshots");

const SAMPLE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAWklEQVR4nO3PQQ0AIAwEsOkf2dSAh4I2Q1dK8N2ZsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB4swB/7QAB0i5xkwAAAABJRU5ErkJggg==";

async function setupCommonMocks(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("devstep:analytics-consent:v1", "denied");
  });

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

  await page.route("**/api/v1/me", (r) =>
    r.fulfill({
      json: {
        data: {
          id: 1,
          name: "Mariana Ferreira",
          email: "admin@misturafeminina.com.br",
          roles: ["admin"],
          permissions: [
            "dashboard.view",
            "catalog.view",
            "catalog.write",
            "catalog.pricing",
            "catalog.cost.view",
            "catalog.cost.write",
            "inventory.manage",
            "ai.view",
            "ai.catalog",
            "ai.catalog.approve",
            "ai.settings",
            "banners.write",
          ],
        },
      },
    }),
  );

  await page.route("**/api/v1/storefront/bootstrap", (r) =>
    r.fulfill({
      json: {
        data: {
          settings: {
            store_name: "Mistura Feminina Cosméticos",
            logo_light_url: "/logo-mf.png",
            logo_dark_url: "/logo-mf-dark.png",
            primary_color: "#93509e",
            whatsapp_number: "11999990000",
            whatsapp_default_message: "Olá!",
            max_installments: 6,
            installment_min_value_cents: 2000,
          },
          menu_categories: [],
          promo_products: [],
          recommended_products: [],
          brands: [],
          footer_pages: [],
        },
      },
    }),
  );

  await page.route("**/storage/**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(SAMPLE_PNG_BASE64, "base64"),
    }),
  );

  await page.route("**/api/v1/admin/brands**", (r) =>
    r.fulfill({
      json: {
        data: [
          { id: 1, name: "SunUV", slug: "sunuv" },
          { id: 2, name: "Vòlia", slug: "volia" },
        ],
      },
    }),
  );

  await page.route("**/api/v1/admin/categories**", (r) =>
    r.fulfill({
      json: {
        data: [
          { id: 10, name: "Esmaltes em Gel", slug: "esmaltes-em-gel" },
          { id: 11, name: "Cabines e Luminárias", slug: "cabines" },
        ],
      },
    }),
  );

  await page.route("**/api/v1/admin/attributes**", async (r) => {
    if (r.request().method() === "POST") {
      const body = r.request().postDataJSON() as { name: string };
      return r.fulfill({
        status: 201,
        json: {
          data: {
            id: 99,
            name: body.name,
            slug: body.name
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-"),
            display_type: "pill",
            values: [],
          },
        },
      });
    }
    return r.fulfill({
      json: {
        data: [
          {
            id: 1,
            name: "Cor",
            slug: "cor",
            display_type: "color_swatch",
            values: [
              { id: 101, value: "Nude", slug: "nude", color_hex: "#d9b3a0" },
              { id: 102, value: "Rosé", slug: "rose", color_hex: "#c97b96" },
            ],
          },
          {
            id: 2,
            name: "Volume",
            slug: "volume",
            display_type: "pill",
            values: [
              { id: 201, value: "8 ml", slug: "8-ml" },
              { id: 202, value: "15 ml", slug: "15-ml" },
            ],
          },
        ],
      },
    });
  });

  await page.route("**/api/v1/admin/products?**", (r) =>
    r.fulfill({
      json: {
        data: [],
        current_page: 1,
        last_page: 1,
        per_page: 25,
        total: 0,
      },
    }),
  );
}

test.describe("Mistura Feminina | Optional Product Variations E2E", () => {
  test("desktop admin creates simple product with toggle off, builds 3x2 partial matrix, catches duplicate SKU and converts simple/variable safely", async ({
    page,
  }) => {
    await setupCommonMocks(page);
    await page.setViewportSize({ width: 1440, height: 900 });

    const submittedPayloads: Array<{ method: string; url: string; body: Record<string, unknown> }> = [];
    await page.route("**/api/v1/admin/products", async (r) => {
      if (r.request().method() === "POST") {
        const body = r.request().postDataJSON() as Record<string, unknown>;
        submittedPayloads.push({ method: "POST", url: r.request().url(), body });
        return r.fulfill({
          status: 201,
          json: { data: { id: 501, name: body.name } },
        });
      }
      return r.fallback();
    });

    // 1) Scenario 1: New simple product with variations toggle OFF
    await page.goto("/admin/produtos?view=novo");
    const varSwitch = page.getByRole("switch", { name: "Este produto tem variações" });
    await expect(varSwitch).toHaveAttribute("aria-checked", "false");
    await expect(page.getByText("Adicionar atributo")).toBeHidden();

    await page.locator("#pf-name-input").fill("Luminária Articulada LED");
    await page.locator("#pf-sku-input").fill("LUM-ART-01");
    await page.locator("#pf-unit-label-input").fill("48W Bivolt");

    // Commercial section inputs
    await page.locator("section").filter({ hasText: "2. Preços e custos" }).locator("input").nth(0).fill("159,90");
    await page.locator("section").filter({ hasText: "2. Preços e custos" }).locator("input").nth(1).fill("82,00");
    await page.locator("section").filter({ hasText: "2. Preços e custos" }).locator("input[type='number']").nth(1).fill("12");

    await page.getByRole("button", { name: "Salvar e cadastrar próximo" }).click();

    await expect.poll(() => submittedPayloads.length).toBe(1);
    expect(submittedPayloads[0]?.body.has_variants).toBe(false);
    expect(submittedPayloads[0]?.body.product_type).toBe("simple");
    expect(submittedPayloads[0]?.body.unit_label).toBe("48W Bivolt");
    expect(submittedPayloads[0]?.body.stock_qty).toBe(12);
    expect(submittedPayloads[0]?.body.variants).toBeUndefined();

    // 2) Scenario 2: Multi-axis 3 Cor x 2 Volume = 6 combinations, disable 1 -> save 5 with inline duplicate SKU error test
    await page.locator("#pf-name-input").fill("Esmalte Gel Paris Premium");
    await page.locator("#pf-sku-input").fill("EGP");
    await page.locator("section").filter({ hasText: "2. Preços e custos" }).locator("input").nth(0).fill("29,90");

    await varSwitch.click();
    await expect(varSwitch).toHaveAttribute("aria-checked", "true");

    // Add Cor with pasted list + duplicate removal
    await page.getByRole("button", { name: "Cor", exact: true }).click();
    await page.getByRole("button", { name: "Colar lista em linhas" }).click();
    await page.getByLabel("Lista de valores para Cor").fill("Nude\nRosé\nVermelho\nrose");
    await page.getByRole("button", { name: "Adicionar valores colados" }).click();
    await expect(page.getByText("3 valor(es) adicionado(s), 1 duplicado(s) removido(s).")).toBeVisible();

    // Add Volume with single input
    await page.getByRole("button", { name: "Volume", exact: true }).click();
    const volInput = page.getByLabel("Novo valor para Volume");
    await volInput.fill("8 ml");
    await volInput.press("Enter");
    await volInput.fill("15 ml");
    await volInput.press("Enter");

    await expect(page.getByText("3 Cor × 2 Volume = 6 combinação(ões) possível(is)")).toBeVisible();

    // Generate 6 combinations
    await page.getByRole("button", { name: "Gerar grade (6)" }).click();
    await expect(page.getByText("2. Grade de combinações (6 habilitada(s) de 6)")).toBeVisible();

    // Verify parent stock is NOT multiplied onto generated variations
    await expect(page.locator("[data-var-cell='0:stock']")).toHaveValue("0");

    // Keyboard navigation between desktop table rows (ArrowDown moves from row 0 stock to row 1 stock)
    await page.locator("[data-var-cell='0:stock']").focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("[data-var-cell='1:stock']")).toBeFocused();

    // Disable "Vermelho · 15 ml" (6th row, index 5) so only 5 are active
    await page.locator("table tbody tr").nth(5).locator("input[type='checkbox']").nth(1).uncheck();
    await expect(page.getByText("2. Grade de combinações (5 habilitada(s) de 6)")).toBeVisible();

    // Force duplicate SKU between row 0 and row 2 to test non-destructive inline row validation
    const firstSku = await page.locator("[data-var-cell='0:sku']").inputValue();
    await page.locator("[data-var-cell='2:sku']").fill(firstSku);
    await page.locator("[data-var-cell='0:stock']").fill("10");

    await page.getByRole("button", { name: "Salvar produto" }).click();
    await expect(page.getByText(/SKU .* duplicado/).first()).toBeVisible();
    // Inputs remain intact!
    await expect(page.locator("[data-var-cell='0:stock']")).toHaveValue("10");

    // Capture desktop screenshot with live matrix + error highlight cleared after fixing SKU
    await page.locator("[data-var-cell='2:sku']").fill("EGP-ROSE-8ML");
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "variations-desktop.png"),
      fullPage: true,
    });

    await page.getByRole("button", { name: "Salvar produto" }).click();
    await expect.poll(() => submittedPayloads.length).toBe(2);
    expect(submittedPayloads[1]?.body.has_variants).toBe(true);
    expect(Array.isArray(submittedPayloads[1]?.body.variants)).toBe(true);
    expect((submittedPayloads[1]?.body.variants as unknown[]).length).toBe(5);
  });

  test("mobile 360px supports custom attribute creation and compact matrix cards with zero overflow", async ({
    page,
  }) => {
    await setupCommonMocks(page);
    await page.setViewportSize({ width: 360, height: 800 });

    await page.goto("/admin/produtos?view=novo");
    await page.locator("#pf-name-input").fill("Body Splash Coleção Verão");
    await page.locator("#pf-sku-input").fill("BS-01");

    await page.getByRole("switch", { name: "Este produto tem variações" }).click();
    await page.getByRole("button", { name: "Criar atributo" }).click();
    await page.getByLabel("Nome do novo atributo").fill("Fragrância");
    await page.getByRole("button", { name: "Adicionar atributo" }).click();

    const fragInput = page.getByLabel("Novo valor para Fragrância");
    await fragInput.fill("Baunilha");
    await fragInput.press("Enter");
    await fragInput.fill("Morango");
    await fragInput.press("Enter");

    await page.getByRole("button", { name: "Gerar grade (2)" }).click();
    await page.getByRole("button", { name: "Detalhes" }).first().click();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "variations-mobile-360.png"),
      fullPage: true,
    });
  });

  test("scenario 5 conversion and disable-impact warning guard work in edit screen", async ({
    page,
  }) => {
    await setupCommonMocks(page);
    await page.setViewportSize({ width: 1440, height: 900 });

    const editProduct = {
      id: 77,
      name: "Cabine Sun 5",
      slug: "cabine-sun-5",
      sku: "CAB-77",
      price_cents: 14990,
      promo_price_cents: null,
      cost_cents: 8000,
      weight_grams: 550,
      short_description: "Cabine profissional 48W",
      description: "Cabine profissional",
      brand_id: 1,
      product_type: "simple",
      has_variants: false,
      is_active: true,
      is_featured: false,
      is_new_arrival: true,
      categories: [{ id: 11, name: "Cabines e Luminárias" }],
      images: [],
      variants: [
        {
          id: 701,
          sku: "CAB-77",
          name: "Padrão",
          price_cents: 14990,
          stock_qty: 20,
          reserved_qty: 0,
          links: { orders_count: 1, movements_count: 1, can_delete: false },
        },
      ],
    };

    const putPayloads: Array<Record<string, unknown>> = [];
    await page.route("**/api/v1/admin/products/77", async (r) => {
      if (r.request().method() === "GET") {
        return r.fulfill({ json: { data: editProduct } });
      }
      if (r.request().method() === "PUT") {
        putPayloads.push(r.request().postDataJSON() as Record<string, unknown>);
        return r.fulfill({ json: { data: { id: 77 } } });
      }
      return r.fallback();
    });

    await page.route("**/api/v1/admin/products?**", (r) =>
      r.fulfill({
        json: {
          data: [editProduct],
          current_page: 1,
          last_page: 1,
          per_page: 25,
          total: 1,
        },
      }),
    );

    await page.goto("/admin/produtos?view=editar&editId=77");
    const varSwitch = page.getByRole("switch", { name: "Este produto tem variações" });
    await expect(varSwitch).toHaveAttribute("aria-checked", "false");

    await varSwitch.click();
    await page.getByRole("button", { name: "Cor", exact: true }).click();
    const corInput = page.getByLabel("Novo valor para Cor");
    await corInput.fill("Branco");
    await corInput.press("Enter");
    await corInput.fill("Rosa");
    await corInput.press("Enter");

    await page.getByRole("button", { name: "Gerar grade (2)" }).click();
    await expect(page.getByText("Conversão de estoque simples (20 un. existentes)")).toBeVisible();

    await page.locator("[data-var-cell='0:stock']").fill("12");
    await page.locator("[data-var-cell='1:stock']").fill("8");
    await expect(page.getByText("20 de 20 un. (equivalência exata mantida)")).toBeVisible();

    await page.getByRole("button", { name: "Salvar produto" }).click();
    await expect.poll(() => putPayloads.length).toBe(1);
    expect(putPayloads[0]?.has_variants).toBe(true);
    expect((putPayloads[0]?.variants as Array<{ stock_qty: number }>).map((v) => v.stock_qty)).toEqual([12, 8]);
  });

  test("storefront PDP distinguishes not-sold combination from registered out-of-stock and AI suggests fixed vs variable", async ({
    page,
  }) => {
    await setupCommonMocks(page);
    await page.setViewportSize({ width: 1280, height: 850 });

    const esmaltePdp = {
      id: 300,
      name: "Esmalte em Gel Coleção Luxo",
      slug: "esmalte-luxo",
      sku: "ESL-01",
      gtin: null,
      product_type: "variable",
      has_variants: true,
      has_multiple_variants: true,
      unit_label: null,
      unit_quantity: null,
      weight_grams: 50,
      brand: { id: 2, name: "Vòlia", slug: "volia" },
      categories: [{ id: 10, name: "Esmaltes em Gel", slug: "esmaltes-em-gel" }],
      primary_image: "/storage/catalog/main.png",
      primary_image_alt: "Esmalte Luxo",
      images: [{ id: 1, path: "/storage/catalog/main.png", alt_text: "Esmalte", focal_point: "center", is_primary: true }],
      price_cents: 2490,
      effective_price_cents: 2490,
      discount_percent: 0,
      installments_count: 1,
      installment_cents: 2490,
      is_new_arrival: true,
      is_featured: false,
      in_stock: true,
      available_stock: 30,
      default_variant_id: 301,
      short_description: "Esmalte em gel profissional",
      description: "Descrição completa.",
      ingredients: null,
      usage_instructions: null,
      manufacturer: "Vòlia",
      video_url: null,
      tags: [],
      wholesale_enabled: false,
      wholesale_tiers: [],
      wholesale_group_variants: true,
      kit_items: [],
      reviews: [],
      rating_avg: 5,
      rating_count: 1,
      seo_title: "Esmalte Luxo",
      seo_description: null,
      related_products: [],
      variation_axes: [
        {
          slug: "cor",
          name: "Cor",
          display_type: "color_swatch",
          values: [
            { slug: "nude", value: "Nude", color_hex: "#d9b3a0" },
            { slug: "rose", value: "Rosé", color_hex: "#c97b96" },
            { slug: "vermelho", value: "Vermelho", color_hex: "#b31b2c" },
          ],
        },
        {
          slug: "volume",
          name: "Volume",
          display_type: "pill",
          values: [
            { slug: "8-ml", value: "8 ml" },
            { slug: "15-ml", value: "15 ml" },
          ],
        },
      ],
      variants: [
        {
          id: 301,
          sku: "ESL-NUDE-8",
          gtin: null,
          name: "Nude · 8 ml",
          option_values: [
            { attribute_slug: "cor", attribute_name: "Cor", value: "Nude", value_slug: "nude" },
            { attribute_slug: "volume", attribute_name: "Volume", value: "8 ml", value_slug: "8-ml" },
          ],
          price_cents: 2490,
          effective_price_cents: 2490,
          stock_qty: 10,
          available_stock: 10,
          in_stock: true,
          is_default: true,
          image_path: "/storage/catalog/main.png",
          attributes: [],
        },
        {
          id: 302,
          sku: "ESL-NUDE-15",
          gtin: null,
          name: "Nude · 15 ml",
          option_values: [
            { attribute_slug: "cor", attribute_name: "Cor", value: "Nude", value_slug: "nude" },
            { attribute_slug: "volume", attribute_name: "Volume", value: "15 ml", value_slug: "15-ml" },
          ],
          price_cents: 3990,
          effective_price_cents: 3990,
          stock_qty: 0,
          available_stock: 0,
          in_stock: false,
          is_default: false,
          image_path: "/storage/catalog/main.png",
          attributes: [],
        },
        {
          id: 303,
          sku: "ESL-ROSE-15",
          gtin: null,
          name: "Rosé · 15 ml",
          option_values: [
            { attribute_slug: "cor", attribute_name: "Cor", value: "Rosé", value_slug: "rose" },
            { attribute_slug: "volume", attribute_name: "Volume", value: "15 ml", value_slug: "15-ml" },
          ],
          price_cents: 3990,
          promo_price_cents: 3490,
          effective_price_cents: 3490,
          stock_qty: 8,
          available_stock: 8,
          in_stock: true,
          is_default: false,
          image_path: "/storage/catalog/rose-15.png",
          attributes: [],
        },
        {
          id: 304,
          sku: "ESL-VERM-8",
          gtin: null,
          name: "Vermelho · 8 ml",
          option_values: [
            { attribute_slug: "cor", attribute_name: "Cor", value: "Vermelho", value_slug: "vermelho" },
            { attribute_slug: "volume", attribute_name: "Volume", value: "8 ml", value_slug: "8-ml" },
          ],
          price_cents: 2490,
          effective_price_cents: 2490,
          stock_qty: 5,
          available_stock: 5,
          in_stock: true,
          is_default: false,
          image_path: "/storage/catalog/main.png",
          attributes: [],
        },
      ],
    };

    await page.route("**/api/v1/catalog/products/esmalte-luxo", (r) =>
      r.fulfill({ json: { data: esmaltePdp } }),
    );

    await page.goto("/produto/esmalte-luxo");
    await expect(page.getByTestId("pdp-variation-axes")).toBeVisible();
    await expect(page.locator("strong", { hasText: "ESL-NUDE-8" })).toBeVisible();

    // Select Rosé + 15 ml -> switches SKU & promo price & shows screenshot
    await page.locator('[data-axis-slug="cor"][data-option-slug="rose"]').click();
    await page.locator('[data-axis-slug="volume"][data-option-slug="15-ml"]').click();
    await expect(page.locator("strong", { hasText: "ESL-ROSE-15" })).toBeVisible();
    await expect(page.getByText("R$ 34,90").first()).toBeVisible();

    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "variations-pdp-desktop.png"),
      fullPage: false,
    });

    // Registered combination with 0 stock -> shows restock alert
    await page.locator('[data-axis-slug="cor"][data-option-slug="nude"]').click();
    await expect(page.getByTestId("pdp-out-of-stock-restock")).toBeVisible();
    await expect(
      page.getByTestId("pdp-out-of-stock-restock").getByRole("button", { name: "Avise-me quando voltar" }),
    ).toBeVisible();

    // Unlisted combination ("Vermelho · 15 ml") -> shows not_sold notice WITHOUT restock form!
    await page.locator('[data-axis-slug="cor"][data-option-slug="vermelho"]').click();
    await expect(page.getByTestId("pdp-not-sold-notice")).toBeVisible();
    await expect(page.getByTestId("pdp-out-of-stock-restock")).toHaveCount(0);

    // Scenario 7 UI: AI lookup distinguishes fixed spec (15 ml) from multi-option product
    await page.route("**/api/v1/admin/ai/catalog/lookup", async (r) => {
      const { query } = r.request().postDataJSON() as { query: string };
      if (query.includes("15ml")) {
        return r.fulfill({
          json: {
            data: {
              state: "draft_ready",
              query,
              message: "Ficha pronta.",
              local_matches: [],
              candidates: [],
              draft: {
                name: "Top Coat Gel Vòlia 15ml",
                sku: "VOL-15ML",
                gtin: "",
                unit_label: "15 ml",
                brand_id: 2,
                category_ids: [10],
                short_description: "Top coat 15 ml.",
                description: "Top coat 15 ml sem goma.",
                image_url: null,
                image_path: "",
                price_cents: null,
                cost_cents: null,
                stock_qty: null,
                suggested_has_variants: false,
                suggested_fixed_specs: [{ attribute_slug: "volume", attribute_name: "Volume", value: "15 ml" }],
                suggested_variation_attributes: [],
              },
              image_status: "unavailable",
              requires_image_review: false,
              image_warning: null,
              image_candidates: [],
              source: null,
            },
          },
        });
      }
      return r.fulfill({
        json: {
          data: {
            state: "draft_ready",
            query,
            message: "Coleção detectada.",
            local_matches: [],
            candidates: [],
            draft: {
              name: "Esmalte Gel Linha Completa",
              sku: "EGL-COMP",
              gtin: "",
              unit_label: "8 ml",
              brand_id: 2,
              category_ids: [10],
              short_description: "Coleção em múltiplas cores.",
              description: "Disponível em Nude e Rosé.",
              image_url: null,
              image_path: "",
              price_cents: null,
              cost_cents: null,
              stock_qty: null,
              suggested_has_variants: true,
              suggested_fixed_specs: [{ attribute_slug: "volume", attribute_name: "Volume", value: "8 ml" }],
              suggested_variation_attributes: [{ slug: "cor", name: "Cor", values: ["Nude", "Rosé"] }],
            },
            image_status: "unavailable",
            requires_image_review: false,
            image_warning: null,
            image_candidates: [],
            source: null,
          },
        },
      });
    });

    await page.goto("/admin/produtos?view=ia");
    await page.getByLabel("Qual produto você quer cadastrar?").fill("Top Coat Vòlia 15ml");
    await page.getByRole("button", { name: "Buscar produto" }).click();

    await expect(page.locator("#adm-ai-prod-unitlabel")).toHaveValue("15 ml");
    await expect(page.getByRole("switch", { name: "Este produto tem variações" })).toHaveAttribute(
      "aria-checked",
      "false",
    );

    await page.getByLabel("Qual produto você quer cadastrar?").fill("Esmalte Gel Coleção Nude Rosé");
    await page.getByRole("button", { name: "Buscar produto" }).click();

    await expect(page.getByRole("switch", { name: "Este produto tem variações" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.getByText("2. Grade de combinações (2 habilitada(s) de 2)")).toBeVisible();
  });
});
