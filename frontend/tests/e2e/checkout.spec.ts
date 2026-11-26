import { test, expect, type Page } from "@playwright/test";
const token = "019a8490-8222-7333-a444-123456789abc";
async function setup(page: Page, provider = "mercadopago", enabled = true) {
  await page.addInitScript(() =>
    localStorage.setItem("mf:analytics-consent:v1", "denied"),
  );
  const quote = {
    quote_id: 1,
    cep: "01310100",
    provider: "correios",
    service_code: "03220",
    service_name: "Correios SEDEX",
    carrier: "Correios",
    price_cents: 2300,
    estimated_days: 4,
    expires_at: new Date(Date.now() + 900000).toISOString(),
    is_fallback: false,
  };
  const cart = {
    token,
    items: [
      {
        id: 1,
        product_id: 1,
        variant_id: 1,
        product_name: "Batom Mistura",
        variant_name: "Rosa",
        quantity: 1,
        sku: "BATOM",
        unit_price_cents: 2500,
        line_total_cents: 2500,
      },
    ],
    items_count: 1,
    subtotal_cents: 2500,
    discount_cents: 0,
    shipping_cents: 2300,
    shipping_cep: "01310100",
    shipping_quote: quote,
    total_cents: 4800,
    free_shipping_remaining_cents: 25000,
  };
  const order = {
    public_token: token,
    order_number: "MF-TESTE",
    payment_provider: provider,
    payment_environment: "sandbox",
    payment_method: "pix",
    status: "pending_payment",
    customer_first_name: "Ana",
    subtotal_cents: 2500,
    discount_cents: 0,
    shipping_cents: 2300,
    total_cents: 4800,
    shipping_service: { service_name: "Correios SEDEX" },
    items: [
      {
        id: 1,
        product_name: "Batom Mistura",
        variant_name: "Rosa",
        sku: "BATOM",
        quantity: 1,
        unit_price_cents: 2500,
        total_cents: 2500,
      },
    ],
  };
  const state = {
    order,
    orders: [] as Record<string, unknown>[],
    charges: [] as Record<string, unknown>[],
    payment: null as null | Record<string, unknown>,
  };
  await page.route("**/api/v1/me", (r) => r.fulfill({ status: 401 }));
  await page.route("**/api/v1/storefront/bootstrap", (r) =>
    r.fulfill({ status: 503 }),
  );
  await page.route("**/api/v1/cart", (r) =>
    r.fulfill({ json: { data: cart } }),
  );
  await page.route("**/api/v1/checkout/config", (r) =>
    r.fulfill({
      json: {
        data: {
          enabled,
          provider,
          environment: "sandbox",
          public_key: provider === "mercadopago" ? "TEST-pub" : null,
        },
      },
    }),
  );
  await page.route("**/viacep.com.br/**", (r) =>
    r.fulfill({
      json: {
        logradouro: "Av Paulista",
        bairro: "Bela Vista",
        localidade: "São Paulo",
        uf: "SP",
      },
    }),
  );
  await page.route("**/sanctum/csrf-cookie", async (r) => {
    await page
      .context()
      .addCookies([
        { name: "XSRF-TOKEN", value: "test", url: "http://127.0.0.1:3100" },
      ]);
    await r.fulfill({ status: 204 });
  });
  await page.route("**/api/v1/checkout", (r) => {
    const body = r.request().postDataJSON();
    state.orders.push(body);
    order.payment_method = body.payment_method;
    if (provider === "asaas")
      state.payment = {
        id: 1,
        provider,
        method: body.payment_method,
        status: "pending",
        checkout_url: "https://sandbox.asaas.com/i/mistura-test",
      };
    if (provider === "mercadopago" && !body.defer_payment) {
      state.charges.push(body);
      state.payment = {
        id: 1,
        provider,
        method: body.payment_method,
        status: body.payment_method === "credit_card" ? "approved" : "pending",
        pix_copy_paste:
          body.payment_method === "pix" ? "000201-pix-test" : null,
      };
    }
    return r.fulfill({ json: { data: { order, payment: state.payment } } });
  });
  await page.route(`**/api/v1/orders/track/${token}`, (r) =>
    r.fulfill({ json: { data: { order, payment: state.payment } } }),
  );
  await page.route(`**/api/v1/orders/${token}/retry-payment`, (r) => {
    state.charges.push(r.request().postDataJSON());
    state.payment = {
      id: 1,
      provider,
      environment: "sandbox",
      method: "pix",
      status: "pending",
      pix_copy_paste: "000201-pix-test",
    };
    return r.fulfill({ json: { data: { order, payment: state.payment } } });
  });
  return state;
}
async function fill(page: Page) {
  await page.goto("/checkout");
  await page.getByLabel("Nome completo", { exact: false }).fill("Ana Teste");
  await page.locator("#co-email").fill("ana@example.com");
  await page.getByLabel("WhatsApp / Telefone").fill("11999999999");
  await page.getByLabel("CPF ou CNPJ").fill("52998224725");
  await page.locator("#co-cep").fill("01310100");
  await page.locator("#co-street").fill("Av Paulista");
  await page.locator("#co-number").fill("123");
  await page.locator("#co-neigh").fill("Bela Vista");
  await page.locator("#co-city").fill("São Paulo");
  await page.locator("#co-uf").fill("SP");
}

test("checkout receives a restored session without overwriting manually entered contact data", async ({
  page,
}) => {
  await setup(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/me", async (r) => {
    await gate;
    return r.fulfill({
      json: {
        data: {
          id: 1,
          name: "Ana",
          email: "ana@example.com",
          roles: [],
          permissions: [],
        },
      },
    });
  });
  await page.route("**/api/v1/account/addresses", (r) =>
    r.fulfill({ json: { data: [] } }),
  );
  await page.goto("/checkout");
  await page
    .getByLabel("Nome completo", { exact: false })
    .fill("Contato informado manualmente");
  release();
  await expect(page.locator("#co-email")).toHaveValue("ana@example.com");
  await expect(page.getByLabel("Nome completo", { exact: false })).toHaveValue(
    "Contato informado manualmente",
  );
  await expect(
    page.getByRole("button", { name: "Conta de Ana", exact: true }),
  ).toBeVisible();
});

async function cardFormMock(page: Page) {
  await page.addInitScript(() => {
    const metrics = { mounts: 0, unmounts: 0 };
    Object.assign(window, { cardFormMetrics: metrics });
    window.MercadoPago = class {
      cardForm(settings: unknown) {
        const options = settings as {
          iframe: boolean;
          form: Record<string, { id: string }> & { id: string };
          callbacks: { onReady: () => void; onSubmit: (event: Event) => void };
        };
        if (!options.iframe) throw new Error("Hosted fields required");
        metrics.mounts++;
        const generation = metrics.mounts;
        const frames = ["cardNumber", "expirationDate", "securityCode"].map(
          (field) => {
            const iframe = document.createElement("iframe");
            iframe.style.cssText = "width:100%;height:100%;border:0";
            iframe.title = `Campo seguro ${field}`;
            document.getElementById(options.form[field].id)?.append(iframe);
            return iframe;
          },
        );
        for (const [field, value] of [
          ["issuer", "123"],
          ["installments", "1"],
          ["identificationType", "CPF"],
        ]) {
          const select = document.getElementById(
            options.form[field].id,
          ) as HTMLSelectElement;
          select.replaceChildren(new Option(value, value));
        }
        const form = document.getElementById(options.form.id)!;
        const listener = (event: Event) => options.callbacks.onSubmit(event);
        form.addEventListener("submit", listener);
        options.callbacks.onReady();
        return {
          getCardFormData: () => ({
            token: `test-card-token-${generation}`,
            paymentMethodId: "master",
            issuerId: "123",
          }),
          unmount: () => {
            metrics.unmounts++;
            frames.forEach((frame) => frame.remove());
            form.removeEventListener("submit", listener);
          },
        };
      }
    };
  });
}

async function fillRetryCard(page: Page) {
  await page
    .getByLabel("E-mail do pagador", { exact: true })
    .fill("buyer@example.com");
  await page
    .getByLabel("CPF ou CNPJ do pagador", { exact: true })
    .fill("52998224725");
  await page
    .getByLabel("Nome no cartão", { exact: true })
    .fill("Cliente de teste");
}

test("card rejection survives status refresh and requires an explicit new attempt", async ({
  page,
}) => {
  const state = await setup(page);
  state.order.payment_method = "credit_card";
  await cardFormMock(page);
  const keys: string[] = [];
  let releaseCharge!: () => void;
  const chargeGate = new Promise<void>((resolve) => {
    releaseCharge = resolve;
  });
  await page.route(`**/api/v1/orders/${token}/refresh-payment`, (r) =>
    r.fulfill({ json: {} }),
  );
  await page.route(`**/api/v1/orders/${token}/retry-payment`, async (r) => {
    keys.push(r.request().headers()["x-idempotency-key"]);
    state.charges.push(r.request().postDataJSON());
    if (keys.length === 1) await chargeGate;
    state.payment = {
      id: keys.length,
      provider: "mercadopago",
      method: "credit_card",
      status: keys.length === 1 ? "rejected" : "approved",
      failure_reason:
        keys.length === 1 ? "O cartão não possui limite suficiente." : null,
    };
    return r.fulfill({
      json: { data: { order: state.order, payment: state.payment } },
    });
  });
  await page.goto(`/pedido/${token}/confirmacao`);
  const holder = page.getByLabel("Nome no cartão");
  await fillRetryCard(page);
  await page
    .getByRole("button", { name: "Atualizar status", exact: true })
    .click();
  await expect(holder).toHaveValue("Cliente de teste");
  await page
    .getByRole("button", { name: "Pagar com cartão" })
    .evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
  await expect.poll(() => state.charges.length).toBe(1);
  releaseCharge();
  await expect(
    page.getByRole("button", { name: "Tentar novamente", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "limite suficiente" }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Atualizar status", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "limite suficiente" }).first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { cardFormMetrics: { mounts: number } })
          .cardFormMetrics.mounts,
    ),
  ).toBe(1);
  await page
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .click();
  await expect(holder).toHaveValue("");
  await holder.fill("Cliente de teste");
  await page.getByRole("button", { name: "Pagar com cartão" }).click();
  await expect(
    page.getByRole("heading", { name: "Pagamento confirmado, Ana!" }),
  ).toBeVisible();
  expect(state.charges).toHaveLength(2);
  expect(keys[0]).not.toBe(keys[1]);
});

for (const outcome of [
  "failed",
  "unknown",
  "processing",
  "pending",
  "validation",
  "network",
] as const) {
  test(`card ${outcome} does not treat HTTP success as approval or reset the form`, async ({
    page,
  }) => {
    const state = await setup(page);
    state.order.payment_method = "credit_card";
    await cardFormMock(page);
    await page.route(`**/api/v1/orders/${token}/retry-payment`, (r) => {
      state.charges.push(r.request().postDataJSON());
      if (outcome === "network") return r.abort();
      if (outcome === "validation")
        return r.fulfill({
          status: 422,
          json: { errors: { payment_data: ["Dados inválidos"] } },
        });
      state.payment = {
        id: 1,
        provider: "mercadopago",
        method: "credit_card",
        status: outcome,
        failure_reason:
          outcome === "failed"
            ? "Os dados do pagamento não foram aceitos pelo provedor."
            : null,
      };
      return r.fulfill({
        json: { data: { order: state.order, payment: state.payment } },
      });
    });
    await page.goto(`/pedido/${token}/confirmacao`);
    await fillRetryCard(page);
    await page.getByRole("button", { name: "Pagar com cartão" }).click();
    await expect(
      page.getByRole("heading", { name: "Pagamento confirmado, Ana!" }),
    ).toHaveCount(0);
    if (outcome === "failed" || outcome === "validation") {
      await expect(
        page.getByRole("button", { name: "Tentar novamente", exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("alert").first()).toBeVisible();
      expect(
        await page.evaluate(
          () =>
            (window as unknown as { cardFormMetrics: { mounts: number } })
              .cardFormMetrics.mounts,
        ),
      ).toBe(1);
    } else {
      await expect(
        page
          .getByText(
            "Estamos confirmando o pagamento com o provedor. Atualize o status antes de tentar novamente.",
            { exact: false },
          )
          .first(),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Tentar novamente", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Pagar com cartão" }),
      ).toBeHidden();
    }
    expect(state.charges).toHaveLength(1);
  });
}

test("Pix is generated directly by checkout without loading card SDK or Bricks", async ({
  page,
}) => {
  const state = await setup(page);
  await fill(page);
  await page
    .getByRole("button", { name: "Confirmar pedido", exact: true })
    .click();
  await expect(page.getByLabel("Código Pix copia e cola")).toHaveValue(
    "000201-pix-test",
  );
  expect(state.orders[0]?.defer_payment).toBe(false);
  expect(state.charges).toHaveLength(1);
  await expect(
    page.locator('script[src="https://sdk.mercadopago.com/js/v2"]'),
  ).toHaveCount(0);
});

test("transparent card checkout sends a token and creates one order with no raw card data", async ({
  page,
}) => {
  const state = await setup(page);
  await cardFormMock(page);
  await fill(page);
  await page
    .getByRole("button", { name: "Cartão de Crédito", exact: false })
    .click();
  await expect(
    page.locator('[aria-label="Dados do cartão"] iframe'),
  ).toHaveCount(3);
  await expect(page.getByLabel("Nome no cartão", { exact: true })).toHaveValue(
    "Ana Teste",
  );
  await expect(page.locator("form form")).toHaveCount(0);
  await page.screenshot({
    path: "/tmp/mf-transparent-checkout-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const checkoutBounds = await page.locator("#store-checkout").boundingBox();
  expect(checkoutBounds!.x + checkoutBounds!.width).toBeLessThanOrEqual(390);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/mf-transparent-checkout-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Confirmar e pagar", exact: true })
    .evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
  await expect(
    page.getByRole("heading", { name: "Pagamento confirmado, Ana!" }),
  ).toBeVisible();
  expect(state.orders).toHaveLength(1);
  expect(state.charges).toHaveLength(1);
  expect(state.orders[0].defer_payment).toBe(false);
  expect(state.orders[0].payment_data).toMatchObject({
    card_token: "test-card-token-1",
    payment_method_id: "master",
    installments: 1,
  });
  const request = JSON.stringify(state.orders[0]);
  for (const field of [
    "card_number",
    "security_code",
    "expiration_date",
    "transaction_amount",
  ])
    expect(request).not.toContain(field);
});

test("Asaas boleto only redirects after order confirmation", async ({
  page,
}) => {
  const state = await setup(page, "asaas");
  await page.route("https://sandbox.asaas.com/i/mistura-test", (r) =>
    r.fulfill({ body: "Fatura oficial de teste" }),
  );
  await fill(page);
  await page.getByRole("button", { name: "Boleto bancário" }).click();
  expect(state.orders).toHaveLength(0);
  await page
    .getByRole("button", { name: /Finalizar|Confirmar|Concluir/, exact: false })
    .last()
    .click();
  await expect(page).toHaveURL("https://sandbox.asaas.com/i/mistura-test");
  expect(state.orders[0]?.payment_method).toBe("boleto");
});
test("disabled checkout has no SDK and fits mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, "mercadopago", false);
  const scripts: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("sdk.mercadopago.com")) scripts.push(r.url());
  });
  await fill(page);
  await expect(page.getByRole("alert")).toContainText(
    "Pagamentos indisponíveis",
  );
  await expect(
    page
      .getByRole("button", {
        name: /Finalizar|Confirmar|Concluir/,
        exact: false,
      })
      .last(),
  ).toBeDisabled();
  expect(scripts).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/mf-checkout-mobile.png",
    fullPage: true,
  });
});

test("admin configures the three real integrations without receiving stored secrets", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/v1/me", (r) =>
    r.fulfill({
      json: {
        id: 1,
        name: "Admin",
        email: "admin@example.com",
        roles: ["superadmin"],
        permissions: [
          "shipping.view",
          "shipping.write",
          "payments.view",
          "payments.reconcile",
          "integrations.view",
          "integrations.write",
          "settings.view",
          "settings.write",
        ],
        workspace_id: null,
      },
    }),
  );
  const rows = [
    {
      provider: "mercadopago",
      environment: "sandbox",
      is_active: false,
      public_config: {},
      credential_keys: [],
    },
    {
      provider: "asaas",
      environment: "sandbox",
      is_active: false,
      public_config: {},
      credential_keys: [],
    },
    {
      provider: "correios",
      environment: "sandbox",
      is_active: false,
      public_config: {},
      credential_keys: [],
    },
  ];
  await page.route("**/api/v1/admin/settings/integrations", (r) =>
    r.fulfill({ json: { data: rows } }),
  );
  await page.route("**/api/v1/admin/settings/store", (r) =>
    r.fulfill({ json: { data: { payment_provider: "mercadopago" } } }),
  );
  await page.route("**/api/v1/admin/shipping/rules", (r) =>
    r.fulfill({ json: { data: [] } }),
  );
  await page.route("**/api/v1/admin/payments", (r) =>
    r.fulfill({ json: { data: [] } }),
  );
  await page.route("**/api/v1/admin/settings/integrations/asaas", (r) =>
    r.fulfill({ json: { data: { provider: "asaas", has_credentials: true } } }),
  );
  await page.goto("/admin/frete-pagamentos");
  await expect(
    page.getByRole("heading", { name: "Checkout e integrações reais" }),
  ).toBeVisible();
  const panel = page
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: "Asaas", exact: true }) });
  await panel.getByLabel("API Key").fill("test-secret");
  await panel.getByLabel("Token do webhook").fill("test-webhook");
  await panel.getByLabel("Integração ativa").check();
  const sent = page.waitForRequest(
    (r) => r.method() === "PUT" && r.url().endsWith("/integrations/asaas"),
  );
  await panel.getByRole("button", { name: "Salvar integração" }).click();
  expect((await sent).postDataJSON().credentials).toEqual({
    api_key: "test-secret",
    webhook_token: "test-webhook",
  });
  await expect(page.getByRole("status")).toContainText(
    "Asaas: configuração salva.",
  );
  await expect(panel.getByLabel("API Key")).toHaveValue("");
  await page.screenshot({ path: "/tmp/mf-checkout-admin.png", fullPage: true });
});
