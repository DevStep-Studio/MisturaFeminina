import { expect, test, type Page } from "@playwright/test";

function makeStaffUser(withFinancialPerms: boolean) {
  return {
    id: withFinancialPerms ? 1 : 2,
    name: withFinancialPerms ? "Gestora Financeira" : "Operadora Suporte",
    email: withFinancialPerms
      ? "admin@misturafeminina.com.br"
      : "suporte@misturafeminina.com.br",
    roles: [withFinancialPerms ? "superadmin" : "support"],
    permissions: [
      "dashboard.view",
      "catalog.view",
      "catalog.write",
      "catalog.pricing",
      "catalog.bulk_edit",
      "orders.view",
      "orders.manage",
      "orders.refund",
      ...(withFinancialPerms
        ? [
            "catalog.cost.view",
            "catalog.cost.write",
            "reports.profit.view",
            "reports.profit.export",
            "orders.cost.backfill",
          ]
        : []),
    ],
    workspace_id: null,
  };
}

async function setupProfitMocks(page: Page, withFinancialPerms = true) {
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
  await page.route("**/api/v1/admin/today-work**", (r) =>
    r.fulfill({
      json: {
        data: {
          cards: {
            ship_today_count: 1,
            order_issues_count: 0,
            products_review_count: 0,
            out_of_stock_variants_count: 0,
          },
          tasks: [],
          out_of_stock_variants: [],
          generated_at: "2026-11-25T01:00:00Z",
        },
      },
    }),
  );
  await page.route("**/api/v1/me", (r) =>
    r.fulfill({ json: { data: makeStaffUser(withFinancialPerms) } }),
  );
  await page.route("**/api/v1/storefront/bootstrap", (r) =>
    r.fulfill({
      json: {
        data: {
          settings: {
            store_name: "Mistura Feminina Cosméticos",
            primary_color: "#93509E",
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

  await page.route("**/api/v1/admin/brands", (r) =>
    r.fulfill({ json: { data: [{ id: 1, name: "Mistura Studio" }] } }),
  );
  await page.route("**/api/v1/admin/categories", (r) =>
    r.fulfill({ json: { data: [{ id: 10, name: "Esmaltes em Gel" }] } }),
  );
  await page.route("**/api/v1/admin/attributes", (r) =>
    r.fulfill({ json: { data: [] } }),
  );

  await page.route("**/api/v1/admin/products**", (r) => {
    const url = new URL(r.request().url());
    const missingOnly = url.searchParams.get("filter") === "missing_cost";
    const items = [
      {
        id: 1,
        name: "Esmalte Sem Custo Cadastrado",
        slug: "esmalte-sem-custo",
        sku: "MF-NOCOST-01",
        brand_id: 1,
        brand: { id: 1, name: "Mistura Studio" },
        categories: [{ id: 10, name: "Esmaltes em Gel" }],
        price_cents: 5000,
        promo_price_cents: null,
        cost_cents: null,
        weight_grams: 120,
        is_active: true,
        is_archived: false,
        images: [],
        variants: [
          {
            id: 11,
            sku: "MF-NOCOST-01",
            name: "Padrão",
            price_cents: 5000,
            promo_price_cents: null,
            cost_cents: null,
            stock_qty: 10,
            reserved_qty: 0,
            is_default: true,
            is_active: true,
          },
        ],
        variants_summary: {
          count: 1,
          is_multi_variant: false,
          price_min_cents: 5000,
          price_max_cents: 5000,
          effective_min_cents: 5000,
          effective_max_cents: 5000,
          cost_min_cents: null,
          cost_max_cents: null,
          has_cost: false,
          missing_cost_count: 1,
          total_stock: 10,
          total_reserved: 0,
          total_available: 10,
          out_of_stock_count: 0,
          has_promo: false,
        },
        updated_at: "2026-11-25T01:00:00Z",
      },
      {
        id: 2,
        name: "Esmalte Com Custo Zero",
        slug: "esmalte-custo-zero",
        sku: "MF-ZERO-02",
        brand_id: 1,
        brand: { id: 1, name: "Mistura Studio" },
        categories: [{ id: 10, name: "Esmaltes em Gel" }],
        price_cents: 2990,
        promo_price_cents: null,
        cost_cents: 0,
        weight_grams: 120,
        is_active: true,
        is_archived: false,
        images: [],
        variants: [
          {
            id: 12,
            sku: "MF-ZERO-02",
            name: "Padrão",
            price_cents: 2990,
            promo_price_cents: null,
            cost_cents: 0,
            stock_qty: 7,
            reserved_qty: 0,
            is_default: true,
            is_active: true,
          },
        ],
        variants_summary: {
          count: 1,
          is_multi_variant: false,
          price_min_cents: 2990,
          price_max_cents: 2990,
          effective_min_cents: 2990,
          effective_max_cents: 2990,
          cost_min_cents: 0,
          cost_max_cents: 0,
          has_cost: true,
          missing_cost_count: 0,
          total_stock: 7,
          total_reserved: 0,
          total_available: 7,
          out_of_stock_count: 0,
          has_promo: false,
        },
        updated_at: "2026-11-25T01:00:00Z",
      },
    ];
    const filtered = missingOnly ? items.filter((p) => p.cost_cents === null) : items;
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

  await page.route("**/api/v1/admin/dashboard**", (r) =>
    r.fulfill({
      json: {
        data: {
          kpis: {
            sales_today_cents: 6000,
            sales_7d_cents: 6000,
            sales_30d_cents: 6000,
            paid_orders_30d: 1,
            avg_ticket_cents: 6000,
            pending_payment_count: 0,
            to_pack_count: 1,
            low_stock_count: 0,
            pending_reviews_count: 0,
            pending_restock_count: 0,
          },
          orders_by_status: { paid: { count: 1, total_cents: 6000 } },
          low_stock_variants: [],
          recent_orders: [],
          funnel_30d: {
            page_view: 100,
            add_to_cart: 20,
            begin_checkout: 10,
            purchase_created: 2,
            purchase_paid: 1,
          },
          ...(withFinancialPerms
            ? {
                financial_summary: {
                  period: {
                    from: "2026-10-27",
                    to: "2026-11-25",
                    sale_recognition_rule: "payment_confirmed",
                    adjustment_date_rule: "event_date",
                  },
                  kpis: {
                    products_revenue_cents: 6000,
                    cmv_cents: 2500,
                    gross_profit_cents: 1500,
                    gross_margin_pct: 37.5,
                    covered_revenue_cents: 4000,
                    uncovered_revenue_cents: 2000,
                    total_units_sold: 2,
                    covered_units_sold: 1,
                    missing_cost_units: 1,
                  },
                  coverage: {
                    is_partial: true,
                    covered_items_count: 1,
                    missing_cost_items_count: 1,
                    missing_cost_units_count: 1,
                    label: "Lucro parcial (1 item sem custo)",
                  },
                },
                inventory_valuation: {
                  label: "Posição atual",
                  total_cost_cents: 8400,
                  total_units: 17,
                  valued_units: 7,
                  missing_cost_units: 10,
                  total_skus: 2,
                  valued_skus: 1,
                  missing_cost_skus_count: 1,
                  is_partial: true,
                  coverage_label: "1 SKU avaliado · 1 SKU sem custo",
                },
              }
            : {}),
        },
      },
    }),
  );

  await page.route("**/api/v1/admin/profit/items**", (r) => {
    const url = new URL(r.request().url());
    const missingOnly = url.searchParams.get("filter") === "missing_cost";
    const rows = [
      {
        entry_type: "sale",
        order_id: 901,
        order_number: "MF-2026-0901",
        order_item_id: 5001,
        product_name: "Cabine LED UV",
        variant_name: "Branca",
        sku: "CEN-D-P1",
        event_date: "2026-11-25T01:00:00Z",
        sold_qty: 1,
        returned_qty: 0,
        quantity: 1,
        net_revenue_cents: 4000,
        unit_cost_cents_snapshot: 2500,
        has_cost: true,
        cost_source: "historical",
        cmv_cents: 2500,
        gross_profit_cents: 1500,
        margin_pct: 37.5,
      },
      {
        entry_type: "sale",
        order_id: 901,
        order_number: "MF-2026-0901",
        order_item_id: 5002,
        product_name: "Lixa Bloco Brilho",
        variant_name: "Padrão",
        sku: "CEN-D-P2",
        event_date: "2026-11-25T01:00:00Z",
        sold_qty: 1,
        returned_qty: 0,
        quantity: 1,
        net_revenue_cents: 2000,
        unit_cost_cents_snapshot: null,
        has_cost: false,
        cost_source: "missing",
        cmv_cents: null,
        gross_profit_cents: null,
        margin_pct: null,
      },
    ];
    const items = missingOnly ? rows.filter((x) => !x.has_cost) : rows;
    return r.fulfill({
      json: {
        data: {
          period: { from: "2026-10-27", to: "2026-11-25" },
          totals: {
            quantity: items.length,
            products_revenue_cents: items.reduce((s, x) => s + x.net_revenue_cents, 0),
            covered_revenue_cents: items.filter((x) => x.has_cost).reduce((s, x) => s + x.net_revenue_cents, 0),
            cmv_cents: items.reduce((s, x) => s + (x.cmv_cents ?? 0), 0),
            gross_profit_cents: items.reduce((s, x) => s + (x.gross_profit_cents ?? 0), 0),
            gross_margin_pct: missingOnly ? null : 37.5,
          },
          items,
        },
      },
    });
  });

  await page.route("**/api/v1/admin/orders**", (r) => {
    const url = new URL(r.request().url());
    if (/\/admin\/orders\/\d+$/.test(url.pathname)) {
      return r.fulfill({
        json: {
          data: {
            id: 901,
            order_number: "MF-2026-0901",
            customer_name: "Clara Beauty",
            customer_email: "clara@example.com",
            customer_phone: "11999999999",
            status: "paid",
            subtotal_cents: 6000,
            discount_cents: 0,
            shipping_cents: 0,
            total_cents: 6000,
            shipping_address_snapshot: {
              street: "Av Paulista",
              number: "100",
              city: "São Paulo",
              state: "SP",
            },
            items: [
              {
                id: 5001,
                product_name_snapshot: "Cabine LED UV",
                variant_name_snapshot: "Branca",
                sku_snapshot: "CEN-D-P1",
                quantity: 1,
                returned_qty: 0,
                restocked_qty: 0,
                remaining_qty: 1,
                total_cents: 4000,
                net_revenue_cents: 4000,
                unit_cost_cents_snapshot: 2500,
                has_cost: true,
                cmv_cents: 2500,
                gross_profit_cents: 1500,
                gross_margin_pct: 37.5,
              },
              {
                id: 5002,
                product_name_snapshot: "Lixa Bloco Brilho",
                variant_name_snapshot: "Padrão",
                sku_snapshot: "CEN-D-P2",
                quantity: 1,
                returned_qty: 0,
                restocked_qty: 0,
                remaining_qty: 1,
                total_cents: 2000,
                net_revenue_cents: 2000,
                unit_cost_cents_snapshot: null,
                has_cost: false,
                cmv_cents: null,
                gross_profit_cents: null,
                gross_margin_pct: null,
              },
            ],
            ...(withFinancialPerms
              ? {
                  financial_summary: {
                    is_recognized_sale: true,
                    products_revenue_cents: 6000,
                    covered_revenue_cents: 4000,
                    cmv_cents: 2500,
                    gross_profit_cents: 1500,
                    gross_margin_pct: 37.5,
                    is_partial: true,
                    missing_cost_items_count: 1,
                    coverage_label: "Lucro parcial · 1 item sem custo histórico",
                  },
                }
              : {}),
            returns: [],
            payments: [],
            timeline: [],
            occurrences: [],
          },
        },
      });
    }
    return r.fulfill({
      json: {
        data: [
          {
            id: 901,
            order_number: "MF-2026-0901",
            customer_name: "Clara Beauty",
            customer_email: "clara@example.com",
            status: "paid",
            total_cents: 6000,
            created_at: "2026-11-25T01:00:00Z",
          },
        ],
      },
    });
  });
}

test.describe("Custo Unitário, Lucro Bruto, Dashboard e Responsividade Admin", () => {
  test("Cadastro de produto calcula lucro R$ 20,00 e margem 40% ao vivo e filtro 'Sem custo cadastrado' exclui custo 0,00", async ({
    page,
  }) => {
    await setupProfitMocks(page, true);
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.goto("/admin/produtos");
    await expect(
      page.getByRole("heading", { name: "Produtos", exact: true }),
    ).toBeVisible();

    // Filter "Sem custo cadastrado" hides the item with explicit cost = 0,00
    await page.getByRole("button", { name: "Sem custo cadastrado", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Esmalte Sem Custo Cadastrado", exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText("Esmalte Com Custo Zero")).toHaveCount(0);

    // Open New Product form and validate live profit & margin math
    await page.getByRole("button", { name: "Novo produto" }).first().click();
    await expect(page.getByText("2. Preços e custos")).toBeVisible();

    const priceInput = page.locator("input[inputmode='decimal']").nth(0);
    const costInput = page.locator("input[inputmode='decimal']").nth(1);
    await priceInput.fill("50,00");
    await costInput.fill("30,00");

    await expect(page.getByText("R$ 20,00")).toBeVisible();
    await expect(page.getByText("40%")).toBeVisible();

    // Negative profit when selling below cost
    await priceInput.fill("20,00");
    await expect(page.getByText("-R$ 10,00")).toBeVisible();
  });

  test("Dashboard exibe Lucro bruto e Posicao atual apenas para perfil autorizado e oculta para perfil sem permissao", async ({
    page,
  }) => {
    await setupProfitMocks(page, true);
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.goto("/admin");
    await expect(page.getByText("Receita de produtos", { exact: true })).toBeVisible();
    await expect(page.getByText("Custo da mercadoria vendida", { exact: true })).toBeVisible();
    await expect(page.getByText("Lucro bruto", { exact: true })).toBeVisible();
    await expect(page.getByText("Margem: 37,50%", { exact: true })).toBeVisible();
    await expect(page.getByText("Posição atual", { exact: true })).toBeVisible();

    // Click missing cost link to open drill-down drawer
    await page.getByText(/Lucro parcial/i).first().click();
    await expect(page.getByText("Lixa Bloco Brilho").first()).toBeVisible();

    // Now test unauthorized support user — zero profit widgets displayed
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await setupProfitMocks(page, false);
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "Visão Geral da Operação" }),
    ).toBeVisible();
    await expect(page.getByText("Lucro bruto", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Valor do estoque a custo")).toHaveCount(0);
  });

  for (const vp of [
    { name: "mobile-360", width: 360, height: 740 },
    { name: "mobile-390", width: 390, height: 844 },
  ]) {
    test(`Responsividade ${vp.name} (${vp.width}px) em /admin e /admin/pedidos sem rolagem horizontal global`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await setupProfitMocks(page, true);

      await page.goto("/admin");
      await expect(page.getByText("Lucro bruto", { exact: true })).toBeVisible();
      const dashOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(dashOverflow).toBe(false);

      await page.goto("/admin/pedidos?order=901");
      await expect(page.getByText("Apuração de lucro bruto (pedido)")).toBeVisible();
      await expect(page.getByText("Custo histórico: Custo não informado")).toBeVisible();
      const orderOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(orderOverflow).toBe(false);
    });
  }
});
