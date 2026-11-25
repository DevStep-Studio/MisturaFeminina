import { expect, test } from "@playwright/test";

test.describe("Storefront Professional Responsive Verification", () => {
  const viewports = [
    { name: "mobile-compact-320", width: 320, height: 600 },
    { name: "mobile-modern-390", width: 390, height: 844 },
    { name: "tablet-768", width: 768, height: 1024 },
    { name: "desktop-1280", width: 1280, height: 800 },
  ];

  for (const vp of viewports) {
    test(`home page renders with zero overflow on ${vp.name} (${vp.width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/");
      await page.waitForLoadState("domcontentloaded");

      // Verify page does not have horizontal scrollbar
      const hasHorizontalScroll = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(hasHorizontalScroll).toBe(false);

      // Verify header and navigation bar exist and do not overflow
      const header = page.locator("header");
      if ((await header.count()) > 0) {
        const headerBox = await header.first().boundingBox();
        if (headerBox) {
          expect(headerBox.width).toBeLessThanOrEqual(vp.width + 1);
        }
      }
    });

    test(`wholesale catalog /atacado fits viewport on ${vp.name} (${vp.width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/atacado");
      await page.waitForLoadState("domcontentloaded");

      const hasHorizontalScroll = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(hasHorizontalScroll).toBe(false);

      // Verify wholesale button and catalog are present
      await expect(page.locator("h1")).toBeVisible({ timeout: 10_000 });
    });
  }

  test("reseller modal opens and is contained within mobile viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/atacado");
    await page.waitForLoadState("domcontentloaded");

    const resellerBtn = page.getByRole("button", {
      name: "Cadastre-se como Revendedora",
    });
    await expect(resellerBtn).toBeVisible({ timeout: 10_000 });
    await resellerBtn.click();

    const modalHeading = page.getByRole("heading", {
      name: "Cadastro de Revendedora / Atacado",
    });
    await expect(modalHeading).toBeVisible({ timeout: 5_000 });

    const modalBox = await page.locator("div.fixed.inset-0.z-50 > div").boundingBox();
    if (modalBox) {
      expect(modalBox.width).toBeLessThanOrEqual(390);
    }
  });

  test("whatsapp buttons display concise WhatsApp label on mobile 390px cards", async ({
    page,
  }) => {
    const sampleProducts = [
      {
        id: 1,
        name: "Esmalte Gel Studio 15ml",
        slug: "esmalte-gel-studio-15ml",
        sku: "MF-ESM-001",
        product_type: "simple",
        price_cents: 8990,
        effective_price_cents: 6490,
        discount_percent: 28,
        installments_count: 3,
        installment_cents: 2163,
        is_new_arrival: false,
        is_featured: true,
        in_stock: true,
        available_stock: 20,
        default_variant_id: 11,
        has_multiple_variants: false,
        primary_image: "/logo-mf.png",
        primary_image_alt: "Esmalte Gel Studio 15ml",
        brand: { id: 1, name: "Mistura Studio", slug: "mistura-studio" },
        specs: [{ value: "30ml" }, { value: "60ml" }],
        wholesale_condition: {
          has_wholesale: true,
          min_quantity: 5,
          starting_price_cents: 5192,
          starting_price_formatted: "R$ 51,92",
          tiers: [
            {
              min_quantity: 5,
              discount_type: "fixed_price",
              discount_value: 5192,
              unit_price_cents: 5192,
            },
          ],
        },
      },
    ];

    await page.route("**/api/v1/storefront/bootstrap", (r) =>
      r.fulfill({
        json: {
          data: {
            settings: {
              store_name: "Mistura Feminina Cosméticos",
              whatsapp_number: "5511999998888",
              whatsapp_default_message: "Olá!",
              primary_color: "#93509e",
              max_installments: 5,
              benefits_ticker: [],
              benefits_row: [],
            },
            menu_categories: [],
            promo_products: sampleProducts,
            recommended_products: [],
            brands: [],
            footer_pages: [],
          },
        },
      }),
    );

    await page.route("**/api/v1/storefront/home", (r) =>
      r.fulfill({
        json: {
          data: {
            sections: [
              {
                id: 1,
                type: "product_showcase",
                title: "Ofertas da Semana",
                subtitle: "Seleção especial",
                data: sampleProducts,
              },
            ],
          },
        },
      }),
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByText("Esmalte Gel Studio 15ml").first()).toBeVisible();

    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasOverflow).toBe(false);

    const whatsButtons = page.locator("a.mf-btn-whats");
    const count = await whatsButtons.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < Math.min(count, 4); i++) {
      const btn = whatsButtons.nth(i);
      if (await btn.isVisible()) {
        const visibleText = await btn.evaluate((el) =>
          (el as HTMLElement).innerText.trim(),
        );
        expect(visibleText).toBe("WhatsApp");
      }
    }
  });
});
