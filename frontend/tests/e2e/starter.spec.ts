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
test("analytics waits for consent and rejection persists", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "Recusar análises" }),
  ).toBeVisible();
  await expect(page.locator("#devstep-gtm")).toHaveCount(0);
  await page.getByRole("button", { name: "Recusar análises" }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Entrar", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#devstep-gtm")).toHaveCount(0);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), consentKey),
  ).toBe("denied");
});
test("consent loads GTM once and revocation stops it", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Aceitar análises" }).click();
  await expect(page.locator("#devstep-gtm")).toHaveCount(1);
  await page.getByRole("link", { name: "Esqueci minha senha" }).click();
  await expect(page.locator("#devstep-gtm")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Preferências de privacidade" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Recuperar senha" }),
  ).toBeVisible();
  await expect(page.locator("#devstep-gtm")).toHaveCount(0);
});
test("auth and consent fit a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Entrar", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Recusar análises" }).click();
  await expect(page.getByLabel("E-mail", { exact: true })).toBeVisible();
});
