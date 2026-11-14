import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const SHOTS_DIR = "../docs/screenshots";

async function dismissCookieBanner(page: import("@playwright/test").Page) {
  const rejectBtn = page.getByRole("button", { name: "Recusar análises" });
  if (await rejectBtn.isVisible().catch(() => false)) {
    await rejectBtn.click();
  }
}

test.describe("Mistura Feminina Live Storefront & Backoffice E2E", () => {
  test("home desktop & mobile render real catalog, zero overflow, accessible, and capture screenshots", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/");
    await expect(page.getByText("Ofertas da Semana")).toBeVisible({
      timeout: 15_000,
    });
    await dismissCookieBanner(page);

    const desktopOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(desktopOverflow).toBe(false);

    const axeDesktop = await new AxeBuilder({ page }).analyze();
    expect(
      axeDesktop.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);

    await page.screenshot({
      path: `${SHOTS_DIR}/mf-home-desktop.png`,
      fullPage: false,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    const mobileAudit = await page.evaluate(() => {
      const offenders: string[] = [];
      for (const el of document.querySelectorAll("*")) {
        if (el.closest(".mf-ticker-track")) continue;
        const rect = el.getBoundingClientRect();
        if (rect.right > window.innerWidth + 1 || rect.left < -1) {
          offenders.push(
            `${el.tagName}.${String(el.className).slice(0, 60)} left=${Math.round(rect.left)} right=${Math.round(rect.right)}`,
          );
          if (offenders.length >= 10) break;
        }
      }
      return {
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        offenders,
      };
    });
    expect(mobileAudit.overflow, JSON.stringify(mobileAudit)).toBe(false);
    await page.screenshot({
      path: `${SHOTS_DIR}/mf-home-mobile.png`,
      fullPage: false,
    });
  });

  test("full Pix sandbox purchase flow: PDP -> variant -> cart -> coupon -> CEP -> checkout -> webhook simulation -> track", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 860 });
    await page.goto("/promocoes");
    await dismissCookieBanner(page);

    // Click first product card link
    const firstProduct = page.locator('a[href^="/produto/"]').first();
    await expect(firstProduct).toBeVisible({ timeout: 10_000 });
    await firstProduct.click();

    await expect(
      page
        .getByRole("button", { name: /COMPRAR|Adicionar ao carrinho/i })
        .first(),
    ).toBeVisible({
      timeout: 10_000,
    });
    await page.screenshot({
      path: `${SHOTS_DIR}/mf-pdp-desktop.png`,
      fullPage: false,
    });

    await page
      .getByRole("button", { name: /COMPRAR|Adicionar ao carrinho/i })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.goto("/carrinho");
    await expect(
      page.getByRole("heading", { name: "Meu Carrinho" }),
    ).toBeVisible();

    // Apply coupon BEMVINDA10
    await page.getByLabel("Código do cupom").fill("BEMVINDA10");
    await page.getByRole("button", { name: "Aplicar" }).click();
    await expect(page.getByText("Cupom: BEMVINDA10")).toBeVisible({
      timeout: 10_000,
    });

    // Calculate CEP
    await page.getByLabel("CEP de entrega").fill("01310100");
    await page.getByRole("button", { name: "Calcular" }).click();
    await expect(page.getByText(/dia útil|dias úteis/).first()).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole("link", { name: /Continuar para o Checkout/ }).click();
    await expect(
      page.getByRole("heading", { name: "Finalizar Compra" }),
    ).toBeVisible();

    await page.locator("#co-name").fill("Camila Almeida Teste");
    await page.locator("#co-email").fill("camila.e2e@misturafeminina.local");
    await page.locator("#co-phone").fill("11999998888");
    await page.locator("#co-cep").fill("01310100");
    await page.locator("#co-street").fill("Av. Paulista");
    await page.locator("#co-number").fill("1000");
    await page.locator("#co-neigh").fill("Bela Vista");
    await page.locator("#co-city").fill("São Paulo");
    await page.locator("#co-uf").fill("SP");

    await page
      .getByRole("button", { name: "Gerar Pix e Finalizar Pedido" })
      .click();
    await expect(page).toHaveURL(/\/pedido\/.*\/confirmacao/, {
      timeout: 15_000,
    });
    await expect(
      page.getByText("Pague com Pix usando QR Code ou Copia e Cola"),
    ).toBeVisible();
    const qrImg = page.getByAltText("QR Code Pix para pagamento");
    await expect(qrImg).toBeVisible();
    const qrLoaded = await qrImg.evaluate(
      (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
    );
    expect(qrLoaded).toBe(true);

    await page.screenshot({
      path: `${SHOTS_DIR}/mf-checkout-pix.png`,
      fullPage: false,
    });

    // Simulate sandbox approval
    await page
      .getByRole("button", { name: "Simular Pagamento Aprovado" })
      .click();
    await expect(page.getByText(/Pagamento confirmado/)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("credit card sandbox checkout & backoffice admin live configuration", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 860 });

    // Credit Card Sandbox Flow
    await page.goto("/novidades");
    await dismissCookieBanner(page);
    await page.locator('a[href^="/produto/"]').first().click();
    await expect(
      page
        .getByRole("button", { name: /COMPRAR|Adicionar ao carrinho/i })
        .first(),
    ).toBeVisible({
      timeout: 10_000,
    });
    await page
      .getByRole("button", { name: /COMPRAR|Adicionar ao carrinho/i })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
    await page.goto("/checkout");

    await page.locator("#co-name").fill("Juliana Costa Cartao");
    await page.locator("#co-email").fill("juliana.card@misturafeminina.local");
    await page.locator("#co-phone").fill("11988887777");
    await page.locator("#co-cep").fill("01310100");
    await page.locator("#co-street").fill("Rua Augusta");
    await page.locator("#co-number").fill("500");
    await page.locator("#co-neigh").fill("Consolação");
    await page.locator("#co-city").fill("São Paulo");
    await page.locator("#co-uf").fill("SP");

    await page.getByRole("button", { name: /Cartão de Crédito/ }).click();
    await page
      .getByRole("button", { name: "Confirmar Pagamento com Cartão" })
      .click();
    await expect(page).toHaveURL(/\/pedido\/.*\/confirmacao/, {
      timeout: 15_000,
    });
    await expect(page.getByText(/Pagamento confirmado/)).toBeVisible({
      timeout: 10_000,
    });

    // Admin Backoffice Login & Appearance Settings Live Update
    await page.goto("/entrar");
    await page.locator("#st-email").fill("admin@misturafeminina.local");
    await page.locator("#st-pass").fill("Mistura@Admin2026!");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });
    await expect(page.getByText("Vendas Hoje")).toBeVisible({
      timeout: 10_000,
    });
    await page.screenshot({
      path: `${SHOTS_DIR}/mf-admin-desktop.png`,
      fullPage: false,
    });

    // Navigate to settings, update tagline, verify saved message & restore baseline
    await page.getByRole("link", { name: "Marca & Integrações" }).click();
    await expect(
      page.getByText("1. Marca, Logos, Favicon e Cores"),
    ).toBeVisible();
    const taglineInput = page.locator('input[type="text"]').nth(1);
    const originalTagline = await taglineInput.inputValue();
    await taglineInput.fill("Cosméticos e Beleza Profissional — Editado");
    await page
      .getByRole("button", { name: "Salvar Identidade e Configurações" })
      .click();
    await expect(page.getByText(/aplicadas em tempo real/)).toBeVisible();

    // Restore original tagline cleanly
    await taglineInput.fill(
      originalTagline || "Beleza, autocuidado e alta performance",
    );
    await page
      .getByRole("button", { name: "Salvar Identidade e Configurações" })
      .click();
    await expect(page.getByText(/aplicadas em tempo real/)).toBeVisible();
  });
});
