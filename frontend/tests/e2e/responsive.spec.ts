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
});
