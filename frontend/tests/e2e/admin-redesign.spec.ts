import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const SCREENSHOT_DIR = path.resolve(process.cwd(), "../docs/screenshots");

const FULL_ADMIN_USER = {
  id: 1,
  name: "Mariana Ferreira",
  email: "mariana@misturafeminina.com.br",
  roles: ["superadmin"],
  permissions: [
    "dashboard.view",
    "catalog.view",
    "catalog.write",
    "catalog.pricing",
    "catalog.cost.view",
    "catalog.cost.write",
    "catalog.bulk_edit",
    "inventory.manage",
    "inventory.receive",
    "orders.view",
    "orders.manage",
    "orders.refund",
    "orders.cost.backfill",
    "reports.view",
    "reports.profit.view",
    "reports.profit.export",
    "ai.view",
    "ai.catalog",
    "ai.catalog.approve",
    "content.view",
    "marketing.view",
    "shipping.view",
    "settings.view",
    "customers.view",
    "wholesale.view",
  ],
  workspace_id: null,
};

async function setupRedesignMocks(page: Page) {
  let categories: Array<{
    id: number;
    name: string;
    slug: string;
    description?: string | null;
    seo_title?: string | null;
    seo_description?: string | null;
    parent_id: number | null;
    image_path: string | null;
    sort_order: number;
    show_in_menu: boolean;
    is_active: boolean;
  }> = [
    {
      id: 10,
      name: "Esmaltes em Gel",
      slug: "esmaltes-em-gel",
      description: "Esmaltes profissionais UV/LED de longa duração.",
      seo_title: "Esmaltes em Gel | Mistura Feminina",
      seo_description: "Compre esmaltes em gel com alta pigmentação.",
      parent_id: null,
      image_path: "/logo-mf.png",
      sort_order: 1,
      show_in_menu: true,
      is_active: true,
    },
    {
      id: 11,
      name: "Top Coats & Bases",
      slug: "top-coats-bases",
      parent_id: 10,
      image_path: null,
      sort_order: 2,
      show_in_menu: true,
      is_active: true,
    },
    {
      id: 12,
      name: "Cabines & Luminárias Elétricas de Alta Potência",
      slug: "cabines-luminarias",
      parent_id: null,
      image_path: null,
      sort_order: 3,
      show_in_menu: true,
      is_active: true,
    },
  ];

  let brands = [
    {
      id: 1,
      name: "Mistura Studio Profissional",
      slug: "mistura-studio",
      logo_path: "/logo-mf.png",
      is_featured: true,
      is_active: true,
    },
    {
      id: 2,
      name: "Bella Gel Cosmetics",
      slug: "bella-gel",
      logo_path: null,
      is_featured: false,
      is_active: true,
    },
  ];

  const products = [
    {
      id: 1,
      name: "Esmalte Gel Studio 15ml — Coleção Clássica Outono Inverno Edição Limitada",
      slug: "esmalte-gel-studio-15ml",
      sku: "MF-ESM-001",
      brand_id: 1,
      brand: { id: 1, name: "Mistura Studio Profissional" },
      categories: [{ id: 10, name: "Esmaltes em Gel" }],
      price_cents: 2990,
      promo_price_cents: null,
      cost_cents: 1200,
      weight_grams: 120,
      is_active: true,
      is_archived: false,
      images: [{ id: 1, path: "/logo-mf.png", alt_text: "Esmalte", is_primary: true }],
      variants: [
        {
          id: 101,
          sku: "MF-ESM-001-ROS",
          name: "Rosa Quartzo 042",
          shade_code: "042",
          color_hex: "#e11d48",
          price_cents: 2990,
          promo_price_cents: null,
          cost_cents: 1200,
          stock_qty: 14,
          reserved_qty: 0,
          is_default: true,
          is_active: true,
          updated_at: "2026-11-25T01:00:00Z",
        },
        {
          id: 102,
          sku: "MF-ESM-001-NUD",
          name: "Nude Clássico 017",
          shade_code: "017",
          color_hex: "#d6b89c",
          price_cents: 2990,
          promo_price_cents: 2490,
          cost_cents: 1200,
          stock_qty: 2,
          reserved_qty: 0,
          is_default: false,
          is_active: true,
          updated_at: "2026-11-25T01:00:00Z",
        },
      ],
      variants_summary: {
        count: 2,
        is_multi_variant: true,
        price_min_cents: 2990,
        price_max_cents: 2990,
        effective_min_cents: 2490,
        effective_max_cents: 2990,
        total_stock: 16,
        total_reserved: 0,
        total_available: 16,
        out_of_stock_count: 0,
        has_promo: true,
      },
      updated_at: "2026-11-25T01:00:00Z",
    },
    {
      id: 2,
      name: "Cabine Sun 8 Pro Bivolt Display Digital LED UV 48W",
      slug: "cabine-sun-8-pro",
      sku: "MF-CAB-008",
      brand_id: 2,
      brand: { id: 2, name: "Bella Gel Cosmetics" },
      categories: [{ id: 12, name: "Cabines & Luminárias Elétricas de Alta Potência" }],
      price_cents: 18990,
      promo_price_cents: null,
      cost_cents: 8500,
      weight_grams: 850,
      power_watts: 48,
      is_active: true,
      is_archived: false,
      images: [],
      variants: [
        {
          id: 201,
          sku: "MF-CAB-008",
          name: "Branca Bivolt",
          price_cents: 18990,
          promo_price_cents: null,
          cost_cents: 8500,
          stock_qty: 10,
          reserved_qty: 0,
          is_default: true,
          is_active: true,
          updated_at: "2026-11-25T01:00:00Z",
        },
      ],
      variants_summary: {
        count: 1,
        is_multi_variant: false,
        price_min_cents: 18990,
        price_max_cents: 18990,
        effective_min_cents: 18990,
        effective_max_cents: 18990,
        total_stock: 10,
        total_reserved: 0,
        total_available: 10,
        out_of_stock_count: 0,
        has_promo: false,
      },
      updated_at: "2026-11-25T01:00:00Z",
    },
  ];

  await page.addInitScript(() => {
    localStorage.setItem("devstep:analytics-consent:v1", "denied");
  });

  await page.route("**/api/v1/**", (r) => r.fulfill({ json: { data: [] } }));
  await page.route("https://www.googletagmanager.com/**", (r) =>
    r.fulfill({ contentType: "application/javascript", body: "/* stub */" }),
  );
  await page.route("**/sanctum/csrf-cookie", async (r) => {
    await page.context().addCookies([
      { name: "XSRF-TOKEN", value: "test%3Dcsrf", url: "http://127.0.0.1:3100" },
    ]);
    await r.fulfill({ status: 204 });
  });
  await page.route("**/api/v1/me", (r) =>
    r.fulfill({ json: { data: FULL_ADMIN_USER } }),
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

  let brandValidationAttempted = false;
  await page.route("**/api/v1/admin/media/upload", (r) =>
    r.fulfill({
      status: 201,
      json: { data: { path: "/logo-mf.png" } },
    }),
  );

  await page.route("**/api/v1/admin/categories**", async (r) => {
    const req = r.request();
    if (req.method() === "GET") {
      return r.fulfill({ json: { data: categories } });
    }
    if (req.method() === "POST") {
      const body = req.postDataJSON() as Record<string, unknown>;
      const created = {
        id: categories.length + 100,
        name: String(body.name || "Nova Categoria"),
        slug: String(body.slug || "nova-categoria"),
        parent_id: body.parent_id ? Number(body.parent_id) : null,
        image_path: (body.image_path as string) ?? null,
        sort_order: 10,
        show_in_menu: Boolean(body.show_in_menu ?? true),
        is_active: Boolean(body.is_active ?? true),
      };
      categories = [...categories, created];
      return r.fulfill({ status: 201, json: { data: created } });
    }
    if (req.method() === "DELETE") {
      const id = Number(new URL(req.url()).pathname.split("/").pop());
      categories = categories.filter((c) => c.id !== id);
      return r.fulfill({ json: { message: "Removida" } });
    }
    return r.fulfill({ json: { data: categories[0] } });
  });

  await page.route("**/api/v1/admin/brands**", async (r) => {
    const req = r.request();
    if (req.method() === "GET") {
      return r.fulfill({ json: { data: brands } });
    }
    if (req.method() === "POST") {
      const body = req.postDataJSON() as Record<string, unknown>;
      if (!brandValidationAttempted && body.slug === "slug-duplicado") {
        brandValidationAttempted = true;
        return r.fulfill({
          status: 422,
          json: {
            message: "Revise os campos informados.",
            errors: {
              slug: ["Este slug já está sendo usado por outra marca."],
            },
          },
        });
      }
      // Small artificial delay to verify "Salvando…" lock & disabled anti-double-submit
      await new Promise((res) => setTimeout(res, 180));
      const created = {
        id: brands.length + 50,
        name: String(body.name || "Nova Marca"),
        slug: String(body.slug || "nova-marca"),
        logo_path: (body.logo_path as string) ?? null,
        is_featured: Boolean(body.is_featured ?? true),
        is_active: Boolean(body.is_active ?? true),
      };
      brands = [...brands, created];
      return r.fulfill({ status: 201, json: { data: created } });
    }
    return r.fulfill({ json: { data: brands[0] } });
  });

  await page.route("**/api/v1/admin/attributes", (r) =>
    r.fulfill({ json: { data: [] } }),
  );
  await page.route("**/api/v1/admin/today-work**", (r) =>
    r.fulfill({
      json: {
        data: {
          cards: {
            ship_today_count: 4,
            order_issues_count: 1,
            products_review_count: 0,
            out_of_stock_variants_count: 2,
          },
          tasks: [],
          out_of_stock_variants: [],
          generated_at: "2026-11-25T01:00:00Z",
        },
      },
    }),
  );

  await page.route("**/api/v1/admin/dashboard**", (r) => {
    const url = new URL(r.request().url());
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    const isTodayOnly = from === to && from !== "";
    return r.fulfill({
      json: {
        data: {
          kpis: {
            sales_today_cents: 29900,
            sales_7d_cents: 185400,
            sales_30d_cents: 1245890,
            growth_7d_pct: 12.4,
            paid_orders_30d: 42,
            avg_ticket_cents: 29664,
            pending_payment_count: 3,
            to_pack_count: 4,
            low_stock_count: 2,
            pending_reviews_count: 2,
            pending_restock_count: 5,
          },
          daily_sales_30d: [
            { date: "2026-11-23", label: "23/11", sales_cents: 224000, orders_count: 8 },
            { date: "2026-11-24", label: "24/11", sales_cents: 312000, orders_count: 11 },
            { date: "2026-11-25", label: "25/11", sales_cents: 29900, orders_count: 2 },
          ],
          daily_sales_period: isTodayOnly
            ? [{ date: from, label: "Hoje", sales_cents: 29900, orders_count: 2 }]
            : [
                { date: "2026-11-23", label: "23/11", sales_cents: 224000, orders_count: 8 },
                { date: "2026-11-24", label: "24/11", sales_cents: 312000, orders_count: 11 },
                { date: "2026-11-25", label: "25/11", sales_cents: 29900, orders_count: 2 },
              ],
          top_products: [
            { name: "Cabine Sun 8 Pro", total_qty: 19, total_cents: 360810 },
          ],
          orders_by_status: { paid: { count: 4, total_cents: 84000 } },
          low_stock_variants: [
            {
              id: 102,
              sku: "MF-ESM-001-NUD",
              name: "Nude Clássico 017",
              product_name: "Esmalte Gel Studio 15ml",
              stock_qty: 2,
              reserved_qty: 0,
              available_stock: 2,
            },
          ],
          recent_orders: [
            {
              id: 1,
              order_number: "MF-2026-0912",
              customer_name: "Camila Souza — Studio Beauty",
              total_cents: 123456789,
              status: "paid",
              created_at: "2026-11-25T01:00:00Z",
            },
          ],
          financial_summary: isTodayOnly
            ? {
                period: {
                  from,
                  to,
                  sale_recognition_rule: "Confirmação do pagamento",
                  adjustment_date_rule: "Data do evento",
                },
                kpis: {
                  products_revenue_cents: 29900,
                  cmv_cents: 12000,
                  gross_profit_cents: 17900,
                  gross_margin_pct: 59.87,
                  covered_revenue_cents: 29900,
                  uncovered_revenue_cents: 0,
                  total_units_sold: 10,
                  covered_units_sold: 10,
                  missing_cost_units: 0,
                },
                coverage: {
                  is_partial: false,
                  covered_items_count: 1,
                  missing_cost_items_count: 0,
                  missing_cost_units_count: 0,
                  label: "Cobertura de custo: 100%",
                },
                comparison: {
                  previous_from: "2026-11-24",
                  previous_to: "2026-11-24",
                  has_prior_data: false,
                  previous_products_revenue_cents: 0,
                  previous_cmv_cents: 0,
                  previous_gross_profit_cents: 0,
                  revenue_delta_pct: null,
                  cmv_delta_pct: null,
                  profit_delta_pct: null,
                },
              }
            : {
                period: {
                  from: from || "2026-10-27",
                  to: to || "2026-11-25",
                  sale_recognition_rule: "Confirmação do pagamento",
                  adjustment_date_rule: "Data do evento",
                },
                kpis: {
                  products_revenue_cents: 1245890,
                  cmv_cents: 582000,
                  gross_profit_cents: 663890,
                  gross_margin_pct: 53.29,
                  covered_revenue_cents: 1245890,
                  uncovered_revenue_cents: 0,
                  total_units_sold: 218,
                  covered_units_sold: 218,
                  missing_cost_units: 0,
                },
                coverage: {
                  is_partial: false,
                  covered_items_count: 42,
                  missing_cost_items_count: 0,
                  missing_cost_units_count: 0,
                  label: "Cobertura de custo: 100%",
                },
                comparison: {
                  previous_from: "2026-09-27",
                  previous_to: "2026-10-26",
                  has_prior_data: true,
                  previous_products_revenue_cents: 1100000,
                  previous_cmv_cents: 520000,
                  previous_gross_profit_cents: 580000,
                  revenue_delta_pct: 13.3,
                  cmv_delta_pct: 11.9,
                  profit_delta_pct: 14.5,
                },
              },
          inventory_valuation: {
            label: "Posição atual",
            total_cost_cents: 104200,
            total_units: 26,
            valued_units: 26,
            missing_cost_units: 0,
            total_skus: 3,
            valued_skus: 3,
            missing_cost_skus_count: 0,
            is_partial: false,
            coverage_label: "100% do estoque com custo cadastrado",
          },
        },
      },
    });
  });

  await page.route("**/api/v1/admin/variants/*/stock", async (r) => {
    const req = r.request();
    const id = Number(new URL(req.url()).pathname.split("/").slice(-2, -1)[0]);
    const body = req.postDataJSON() as { operation: string; quantity: number };
    await new Promise((res) => setTimeout(res, 120));
    for (const p of products) {
      const v = p.variants.find((x) => x.id === id);
      if (v) {
        if (body.operation === "add") v.stock_qty += body.quantity;
        else if (body.operation === "subtract") v.stock_qty = Math.max(0, v.stock_qty - body.quantity);
        else v.stock_qty = body.quantity;
        p.variants_summary.total_stock = p.variants.reduce((s, x) => s + x.stock_qty, 0);
        p.variants_summary.total_available = p.variants_summary.total_stock;
      }
    }
    return r.fulfill({ json: { data: { id, stock_qty: body.quantity } } });
  });

  await page.route("**/api/v1/admin/products**", (r) => {
    const req = r.request();
    const url = new URL(req.url());
    if (url.pathname.includes("bulk-lifecycle")) {
      return r.fallback();
    }
    if (/\/admin\/products\/\d+$/.test(url.pathname)) {
      const id = Number(url.pathname.split("/").pop());
      const found = products.find((p) => p.id === id) ?? products[0];
      return r.fulfill({ json: { data: found } });
    }
    const q = (url.searchParams.get("search") || "").toLowerCase();
    const filtered = q
      ? products.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q),
        )
      : products;
    return r.fulfill({
      json: {
        data: filtered,
        current_page: 1,
        last_page: 1,
        per_page: 25,
        total: filtered.length,
      },
    });
  });

  await page.route("**/api/v1/admin/products/bulk-lifecycle/preview", (r) =>
    r.fulfill({
      json: {
        data: {
          scope_label: "2 produtos selecionados",
          total_products: 2,
          total_variants_affected: 3,
          has_multi_variant_products: true,
          blocked_count: 0,
          deletable_count: 2,
          sample: [
            { name: products[0].name, sku: products[0].sku, variants_count: 2 },
            { name: products[1].name, sku: products[1].sku, variants_count: 1 },
          ],
          items: [],
        },
      },
    }),
  );

  return { products };
}

test.describe("Admin Redesign Mistura Feminina — Critérios de Aceite Completos", () => {
  test("Cenários 1, 2, 3 e 5 (Desktop 1440px): Dashboard, Período, Ajuste de Estoque, Edição em Massa e Combobox por Teclado + Capturas", async ({
    page,
  }) => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupRedesignMocks(page);

    // Scenario 1: Dashboard + period filter + Posição atual + pendency route
    await page.goto("/admin");
    await expect(page.getByText("Receita de produtos", { exact: true })).toBeVisible();
    await expect(page.getByText("Custo da mercadoria vendida", { exact: true })).toBeVisible();
    await expect(page.getByText("Lucro bruto", { exact: true })).toBeVisible();
    await expect(page.getByText("Posição atual", { exact: true })).toBeVisible();
    await expect(page.getByText("+13,3% vs ant.")).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "admin-redesign-dashboard-1440.png"),
      fullPage: false,
    });

    // Switch to "Hoje" where prior period has no baseline -> delta must not appear
    await page.getByRole("button", { name: "Hoje", exact: true }).click();
    await expect(
      page.getByRole("button", { name: /Receita de produtos/i }),
    ).toContainText("R$ 299,00");
    await expect(page.getByText("+13,3% vs ant.")).toHaveCount(0);

    // Pendencies link opens orders screen with filter applied
    await expect(page.getByText("Pedidos pagos aguardando envio")).toBeVisible();

    // Scenario 2: Search SKU, open stock adjust dialog (focus trapped), save with updated balance
    await page.goto("/admin/produtos");
    await expect(page.getByRole("heading", { name: "Produtos", exact: true })).toBeVisible();
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "admin-redesign-catalogo-1440.png"),
      fullPage: false,
    });

    await page
      .getByPlaceholder("Buscar por nome, SKU ou código de barras...")
      .fill("MF-CAB-008");
    const stockBtn = page.getByRole("button", { name: "10 un.", exact: true });
    await expect(stockBtn).toBeVisible();
    await stockBtn.click();

    await expect(
      page.getByRole("heading", {
        name: /Ajustar estoque de Cabine Sun 8 Pro/i,
      }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Adicionar (+)" }).click();
    await expect(page.getByText("15 un.")).toBeVisible();
    await page.getByRole("button", { name: "Confirmar ajuste" }).click();
    await expect(page.getByRole("button", { name: "15 un.", exact: true })).toBeVisible();

    // Scenario 3: Multi-selection + "Editar em massa" + specific deletion count button
    await page.getByPlaceholder("Buscar por nome, SKU ou código de barras...").fill("");
    await page.getByRole("checkbox", { name: /Selecionar os 2 desta página/i }).check();
    await expect(page.getByText("2 selecionado(s)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Editar em massa" })).toBeVisible();
    await page.getByRole("button", { name: "Excluir", exact: true }).click();
    await expect(page.getByRole("button", { name: "Excluir 2 produtos" })).toBeVisible();
    await page.keyboard.press("Escape");

    // Scenario 5: Open product edit form and select category exclusively via keyboard
    await page.getByRole("button", { name: /Cabine Sun 8 Pro/i }).first().click();
    await expect(page.getByText(/Editar produto — MF-CAB-008/)).toBeVisible();
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "admin-redesign-produto-edit-1440.png"),
      fullPage: false,
    });

    const catCombo = page.getByRole("combobox", { name: /Categorias/i });
    await catCombo.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByPlaceholder("Filtrar por nome...")).toBeFocused();
    await page.keyboard.type("Esmaltes");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await expect(page.getByText("(2 selecionada(s))")).toBeVisible();
  });

  test("Cenário 4: Categorias e Marcas com abas, upload em português, erro de validação preservando dados e foco no drawer", async ({
    page,
  }) => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupRedesignMocks(page);

    await page.goto("/admin/categorias-marcas");
    await expect(page.getByRole("tab", { name: /Categorias/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Marcas/i })).toBeVisible();

    // Verify zero native browser file input visible ("Choose File")
    await expect(page.locator("input[type='file']:visible")).toHaveCount(0);

    // Switch to Brands tab and open "Nova marca" drawer
    await page.getByRole("tab", { name: /Marcas/i }).click();
    await page.getByRole("button", { name: "Nova marca" }).click();

    await expect(page.getByRole("heading", { name: "Nova marca" })).toBeVisible();
    await expect(page.getByLabel("Nome da marca")).toBeFocused();

    // Fill Brand Name & upload image via Portuguese AdminImageUpload
    await page.getByLabel("Nome da marca").fill("Nails Atelier Gold");
    const fileInput = page.locator("input[type='file']").first();
    await fileInput.setInputFiles({
      name: "marca-gold.png",
      mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgo=", "base64"),
    });
    await expect(page.getByRole("button", { name: "Substituir" })).toBeVisible();

    // Expand SEO and trigger server validation error on duplicate slug
    await page.getByRole("button", { name: "SEO e opções avançadas" }).click();
    await page.getByLabel("Slug da URL").fill("slug-duplicado");
    await page.getByRole("button", { name: "Salvar marca" }).click();

    // Drawer remains open with error below field and typed data intact
    await expect(
      page.getByText("Este slug já está sendo usado por outra marca."),
    ).toBeVisible();
    await expect(page.getByLabel("Nome da marca")).toHaveValue(
      "Nails Atelier Gold",
    );

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "admin-redesign-marcas-drawer-1280.png"),
      fullPage: false,
    });

    // Fix slug, submit cleanly, and verify saved row highlight + list update
    await page.getByLabel("Slug da URL").fill("nails-atelier-gold");
    await page.getByRole("button", { name: "Salvar marca" }).click();
    await expect(page.getByRole("heading", { name: "Nova marca" })).toHaveCount(0);
    await expect(page.getByText("Nails Atelier Gold", { exact: true })).toBeVisible();
  });

  for (const vp of [
    { name: "mobile-360", width: 360, height: 740 },
    { name: "mobile-390", width: 390, height: 844 },
    { name: "tablet-768", width: 768, height: 1024 },
  ]) {
    test(`Responsividade e sem rolagem horizontal em ${vp.name} (${vp.width}px) com modais/drawers`, async ({
      page,
    }) => {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await setupRedesignMocks(page);

      // Dashboard mobile/tablet: indicators and pendencies visible cleanly, zero horizontal overflow
      await page.goto("/admin");
      await expect(page.getByText("Receita de produtos", { exact: true })).toBeVisible();
      await expect(page.getByText("Pedidos pagos aguardando envio")).toBeVisible();
      const dashOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(dashOverflow).toBe(false);
      const headerRightClips = await page.evaluate(() => {
        const vw = window.innerWidth;
        return [...document.querySelectorAll("header button, header a, header input")]
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.right > vw + 1).length;
      });
      expect(headerRightClips).toBe(0);

      if (vp.width === 390) {
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, "admin-redesign-dashboard-mobile-390.png"),
          fullPage: false,
        });
      }

      // Catalog + quick stock + contextual bulk bar + mobile menu auto-close
      await page.goto("/admin/produtos");
      await expect(page.getByRole("heading", { name: "Produtos", exact: true })).toBeVisible();
      const catOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(catOverflow).toBe(false);
      const catHeaderClips = await page.evaluate(() => {
        const vw = window.innerWidth;
        return [...document.querySelectorAll("header button, header a, header input")]
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.right > vw + 1).length;
      });
      expect(catHeaderClips).toBe(0);

      if (vp.width === 390) {
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, "admin-redesign-catalogo-mobile-390.png"),
          fullPage: false,
        });
      }

      // Open Categories & Brands drawer in full screen on mobile
      await page.getByRole("button", { name: "Abrir menu administrativo" }).click();
      await page.getByRole("link", { name: "Categorias & Marcas" }).click();
      await expect(page.getByRole("tab", { name: /Categorias/i })).toBeVisible();
      const catBrandsOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(catBrandsOverflow).toBe(false);

      await page.getByRole("button", { name: "Nova categoria" }).click();
      await expect(page.getByRole("heading", { name: "Nova categoria" })).toBeVisible();
      if (vp.width === 390) {
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, "admin-redesign-drawer-mobile-390.png"),
          fullPage: false,
        });
      }
    });
  }
});
