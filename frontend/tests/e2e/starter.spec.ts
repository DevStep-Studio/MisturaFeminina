import { expect, test } from "@playwright/test";
const consentKey = "devstep:analytics-consent:v1";
test.beforeEach(async ({ page }) => {
  await page.route("https://www.googletagmanager.com/**", (r) =>
    r.fulfill({ contentType: "application/javascript", body: "/* stub */" }),
  );
});
test("auth metadata and unknown routes stay unindexed", async ({ page }) => {
  for (const path of ["/login", "/forgot-password", "/invalid-address"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex, nofollow",
    );
    await expect(page.locator('head meta[name="description"]')).toHaveCount(1);
    await expect(page.locator('head link[rel="canonical"]')).toHaveCount(
      path === "/invalid-address" ? 0 : 1,
    );
  }
  await expect(
    page.getByRole("heading", { name: "Página não encontrada" }),
  ).toBeVisible();
});
test("removed example routes return not found", async ({ page }) => {
  for (const path of ["/dashboard", "/projects", "/users", "/settings"]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: "Página não encontrada" }),
    ).toBeVisible();
    await expect(page.locator("aside")).toHaveCount(0);
  }
});
test("sitemap contains no authentication or demonstration routes", async ({
  request,
}) => {
  const xml = await (await request.get("/sitemap.xml")).text();
  for (const path of ["/app", "/login", "/projects", "/dashboard"]) {
    expect(xml).not.toContain(`<loc>https://devstep.example${path}</loc>`);
  }
  expect((await request.get("/health.json")).ok()).toBe(true);
});
test("auth fits a mobile viewport cleanly without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Entrar", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page.getByLabel("E-mail", { exact: true })).toBeVisible();
});
