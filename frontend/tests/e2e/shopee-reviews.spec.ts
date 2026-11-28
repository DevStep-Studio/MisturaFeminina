import { expect, test } from "@playwright/test";

test.describe("Shopee-style Reviews Verification", () => {
  const sampleProductWithReviews = {
    id: 32,
    name: "Coletor de Pó SC808-1 Bivolt",
    slug: "coletor-de-po-aspirador-unhas-mesa-manicure-oval-sc808-1-bivolt",
    sku: "MF-COL-001",
    product_type: "simple",
    price_cents: 18990,
    effective_price_cents: 14990,
    discount_percent: 21,
    installments_count: 5,
    installment_cents: 2998,
    is_new_arrival: false,
    is_featured: true,
    in_stock: true,
    available_stock: 15,
    primary_image: "/logo-mf.png",
    images: [{ url: "/logo-mf.png", alt: "Coletor" }],
    description: "Excelente aspirador de pó para mesa de manicure profissional.",
    brand: { id: 1, name: "Mistura Studio", slug: "mistura-studio" },
    categories: [{ id: 1, name: "Maquinários", slug: "maquinarios" }],
    variants: [
      {
        id: 101,
        name: "Bivolt",
        sku: "MF-COL-001-BIV",
        price_cents: 18990,
        effective_price_cents: 14990,
        discount_percent: 21,
        in_stock: true,
        available_stock: 15,
        is_default: true,
        attributes: [],
      },
    ],
    specs: [],
    reviews: [
      {
        id: 7,
        author_name: "Valéria M.",
        rating: 5,
        title: "Sucção excelente e baixíssimo ruído na bancada",
        body: "O aspirador suga muito bem o pó do lixamento da fibra e do gel. Excelente acabamento.",
        is_verified_purchase: false,
        is_external: true,
        source_name: "Jack Cosméticos",
        source_url: "https://jackcosmeticos.com.br/produtos/coletor-de-po-sc808-1",
        variant_name: "Bivolt",
        photos: ["https://misturafeminina.com.br/logo-mf.png"],
        created_at: "2026-10-14T12:00:00Z",
      },
      {
        id: 9,
        author_name: "Carla S.",
        rating: 5,
        title: "Comprei na Mistura e amei",
        body: "Chegou super rápido, muito bem embalado. Uso todos os dias no atendimento.",
        is_verified_purchase: true,
        is_external: false,
        photos: [],
        created_at: "2026-11-20T10:00:00Z",
      },
      {
        id: 10,
        author_name: "Aline F.",
        rating: 4,
        title: "Muito prático",
        body: "Fácil de limpar a almofada e o saco coletor.",
        is_verified_purchase: false,
        is_external: false,
        photos: [],
        created_at: "2026-11-22T14:00:00Z",
      },
    ],
    related_products: [],
  };

  const setupMockRoutes = async (page: any) => {
    await page.addInitScript(() => {
      sessionStorage.setItem("mf:promo-popup-dismissed:v2", "1");
    });

    await page.route("**/api/v1/storefront/bootstrap", (r: any) =>
      r.fulfill({
        json: {
          data: {
            settings: {
              store_name: "Mistura Feminina Cosméticos",
              whatsapp_number: "5511999998888",
              primary_color: "#93509e",
              max_installments: 5,
              popup_enabled: false,
              popup_title: "",
              popup_subtitle: "",
              popup_coupon_code: "",
              benefits_ticker: [],
              benefits_row: [],
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

    await page.route(
      `**/api/v1/catalog/products/${sampleProductWithReviews.slug}`,
      (r: any) =>
        r.fulfill({
          json: {
            data: sampleProductWithReviews,
          },
        }),
    );

    await page.route("**/api/v1/catalog/search*", (r: any) =>
      r.fulfill({
        json: {
          data: {
            products: [],
          },
        },
      }),
    );
  };

  test("renders shopee-style reviews summary and chips on desktop (1440x900)", async ({
    page,
  }) => {
    await setupMockRoutes(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/produto/${sampleProductWithReviews.slug}`);
    await page.waitForLoadState("domcontentloaded");

    // Abrir o accordion de avaliações
    const accordionBtn = page.getByRole("button", { name: /Avaliações/i });
    await expect(accordionBtn).toBeVisible({ timeout: 10_000 });
    await accordionBtn.click();

    // Validar nota geral e estrelas do resumo
    await expect(page.getByText("4.7")).toBeVisible();
    await expect(page.getByText("3 avaliações")).toBeVisible();

    // Validar chips de filtro
    await expect(page.getByRole("button", { name: /Todas \(3\)/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /5 Estrelas \(2\)/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /4 Estrelas \(1\)/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Com fotos \(1\)/i })).toBeVisible();

    // Validar que o disclaimer antigo poluído NÃO existe
    const oldDisclaimer = page.getByText(/Não representa compra realizada na Mistura/i);
    await expect(oldDisclaimer).toHaveCount(0);

    // Validar badges discretos
    await expect(page.getByText("Avaliação de outra loja").first()).toBeVisible();
    await expect(page.getByText("Compra verificada").first()).toBeVisible();

    // Testar filtro "Com fotos"
    await page.getByRole("button", { name: /Com fotos \(1\)/i }).click();
    await expect(page.getByText("Valéria M.")).toBeVisible();
    await expect(page.getByText("Carla S.")).toHaveCount(0);

    // Testar abertura de lightbox ao clicar na miniatura da foto
    const reviewPhoto = page.locator("button[title='Clique para ampliar a foto em alta resolução']").first();
    await expect(reviewPhoto).toBeVisible();
    await reviewPhoto.click();

    // Lightbox aberto
    const lightboxDialog = page.getByRole("dialog", { name: /Foto da avaliação em tamanho real/i });
    await expect(lightboxDialog).toBeVisible();

    // Fechar lightbox no botão X
    await page.locator("button[title='Fechar (Esc)']").click();
    await expect(lightboxDialog).toHaveCount(0);
  });

  test("renders perfectly on mobile 390x844 without horizontal overflow", async ({
    page,
  }) => {
    await setupMockRoutes(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/produto/${sampleProductWithReviews.slug}`);
    await page.waitForLoadState("domcontentloaded");

    // Abrir o accordion de avaliações
    const accordionBtn = page.getByRole("button", { name: /Avaliações/i });
    await expect(accordionBtn).toBeVisible({ timeout: 10_000 });
    await accordionBtn.click();

    // Conferir que não há overflow horizontal
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasOverflow).toBe(false);

    // Barra de chips com scroll horizontal sem estourar a tela
    const filterBar = page.locator("div.overflow-x-auto");
    await expect(filterBar.first()).toBeVisible();

    // Botão de avaliar produto
    const writeReviewBtn = page.getByRole("button", { name: /Avaliar este produto/i });
    await expect(writeReviewBtn).toBeVisible();
    await writeReviewBtn.click();

    // Formulário de avaliação expandido
    await expect(page.getByPlaceholder("Ex.: Valéria Moreira")).toBeVisible();
    await expect(page.getByPlaceholder(/Conte como foi sua experiência/i)).toBeVisible();
  });
});
