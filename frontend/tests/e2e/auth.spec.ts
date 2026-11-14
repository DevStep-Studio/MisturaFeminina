import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const user = {
  id: 1,
  name: "Ana",
  email: "ana@example.com",
  roles: [],
  permissions: [],
  workspace_id: null,
};
async function backend(
  page: import("@playwright/test").Page,
  initial: Partial<{
    authenticated: boolean;
    available: boolean;
    loginValid: boolean;
    mfa: boolean;
    logoutStatus: number;
  }> = {},
) {
  await page.addInitScript(() =>
    localStorage.setItem("devstep:analytics-consent:v1", "denied"),
  );
  const state = {
    authenticated: false,
    available: true,
    loginValid: true,
    mfa: false,
    logoutStatus: 204,
    csrf: 0,
    ...initial,
  };
  await page.route("https://www.googletagmanager.com/**", (r) =>
    r.fulfill({ contentType: "application/javascript", body: "/* stub */" }),
  );
  await page.route("**/api/v1/me", (r) =>
    r.fulfill(
      !state.available
        ? { status: 503 }
        : state.authenticated
          ? { json: { data: user } }
          : { status: 401 },
    ),
  );
  await page.route("**/sanctum/csrf-cookie", async (r) => {
    state.csrf++;
    await page.context().addCookies([
      {
        name: "XSRF-TOKEN",
        value: "test%3Dcsrf",
        url: "http://127.0.0.1:3100",
      },
    ]);
    await r.fulfill({ status: 204 });
  });
  await page.route("**/login", (r) => {
    if (r.request().method() !== "POST") return r.fallback();
    expect(r.request().headers()["x-xsrf-token"]).toBe("test=csrf");
    if (!state.loginValid)
      return r.fulfill({
        status: 422,
        json: { errors: { email: ["Credenciais inválidas."] } },
      });
    if (state.mfa) return r.fulfill({ json: { two_factor: true } });
    state.authenticated = true;
    return r.fulfill({ status: 204 });
  });
  await page.route("**/two-factor-challenge", (r) => {
    state.authenticated = true;
    return r.fulfill({ status: 204 });
  });
  await page.route("**/logout", (r) => {
    if (state.logoutStatus === 204) state.authenticated = false;
    return r.fulfill({ status: state.logoutStatus });
  });
  return state;
}
async function enter(page: import("@playwright/test").Page) {
  await page.getByLabel("E-mail", { exact: true }).fill("ana@example.com");
  await page.getByLabel("Senha", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

test("private entry validates the session, logs in with CSRF and survives refresh", async ({
  page,
}) => {
  const state = await backend(page);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?redirect=%2Fapp/);
  await enter(page);
  await expect(
    page.getByRole("heading", { name: "Sessão autenticada" }),
  ).toBeVisible();
  expect(state.csrf).toBeGreaterThan(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Sessão autenticada" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((k) =>
        /token|password|session/i.test(k),
      ),
    ),
  ).toEqual([]);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.locator("aside")).toHaveCount(0);
});
test("invalid credentials clear the password and show field feedback", async ({
  page,
}) => {
  await backend(page, { loginValid: false });
  await page.goto("/login");
  await enter(page);
  await expect(page.getByRole("alert")).toContainText(
    "E-mail ou senha inválidos",
  );
  await expect(page.getByLabel("Senha", { exact: true })).toHaveValue("");
});
test("optional MFA verifies identity before private access", async ({
  page,
}) => {
  const state = await backend(page, { mfa: true });
  await page.goto("/login");
  await enter(page);
  await expect(
    page.getByRole("heading", { name: "Verifique sua identidade" }),
  ).toBeVisible();
  expect(state.authenticated).toBe(false);
  await page.getByLabel("Código de verificação").fill("123456");
  await page.getByRole("button", { name: "Verificar código" }).click();
  await expect(page).toHaveURL(/\/app$/);
});
test("unsafe redirects stay in the application", async ({ page }) => {
  await backend(page);
  await page.goto("/login?redirect=https://evil.example");
  await enter(page);
  await expect(page).toHaveURL("http://127.0.0.1:3100/app");
});
test("session expiry removes private content", async ({ page }) => {
  const state = await backend(page, { authenticated: true });
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Sessão autenticada" }),
  ).toBeVisible();
  state.authenticated = false;
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByText("Sua sessão expirou. Entre novamente para continuar."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Sessão autenticada" }),
  ).toHaveCount(0);
});
test("API failure offers retry without pretending the session is invalid", async ({
  page,
}) => {
  const state = await backend(page, { available: false });
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Não foi possível validar sua sessão" }),
  ).toBeVisible();
  state.available = true;
  state.authenticated = true;
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(
    page.getByRole("heading", { name: "Sessão autenticada" }),
  ).toBeVisible();
});
test("failed logout stays locked with a working retry", async ({ page }) => {
  const state = await backend(page, { authenticated: true, logoutStatus: 503 });
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Sessão autenticada" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Não foi possível encerrar a sessão",
  );
  await expect(
    page.getByRole("heading", { name: "Sessão autenticada" }),
  ).toHaveCount(0);
  state.logoutStatus = 204;
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login/);
});
test("auth, private and error screens remain accessible", async ({ page }) => {
  await backend(page, { authenticated: true });
  for (const path of ["/login", "/app", "/forgot-password", "/403", "/404"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const result = await new AxeBuilder({ page }).analyze();
    expect(
      result.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
  }
});
test("initial loading is visible before JavaScript and during slow session validation", async ({
  page,
}) => {
  await backend(page, { authenticated: true });
  let releaseBootstrap!: () => void;
  let releaseSession!: () => void;
  const boot = new Promise<void>((r) => {
    releaseBootstrap = r;
  });
  const session = new Promise<void>((r) => {
    releaseSession = r;
  });
  await page.route("**/assets/bootstrap-*.js", async (r) => {
    await boot;
    await r.continue();
  });
  await page.route("**/api/v1/me", async (r) => {
    await session;
    await r.fallback();
  });
  await page.goto("/app", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Carregando aplicação…")).toBeVisible();
  const request = page.waitForRequest("**/api/v1/me");
  releaseBootstrap();
  await request;
  await expect(
    page
      .getByText(/Carregando aplicação…|Validando sua sessão…|Carregando…/)
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Sessão autenticada" }),
  ).toHaveCount(0);
  releaseSession();
  await expect(
    page.getByRole("heading", { name: "Sessão autenticada" }),
  ).toBeVisible();
  await expect(page.locator("#startup")).toHaveCount(0);
});
test("background validation keeps the screen steady", async ({ page }) => {
  await backend(page, { authenticated: true });
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Sessão autenticada" }),
  ).toBeVisible();
  let release!: () => void;
  const ready = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/api/v1/me", async (r) => {
    await ready;
    await r.fallback();
  });
  const request = page.waitForRequest("**/api/v1/me");
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await request;
  await page.waitForTimeout(300);
  await expect(
    page.getByRole("heading", { name: "Sessão autenticada" }),
  ).toBeVisible();
  release();
});
test("failed startup offers a reload action", async ({ page }) => {
  await backend(page, { authenticated: true });
  await page.route("**/assets/bootstrap-*.js", (r) => r.abort());
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Não foi possível iniciar a aplicação" }),
  ).toBeVisible();
  await page.unroute("**/assets/bootstrap-*.js");
  await page.getByRole("button", { name: "Atualizar página" }).click();
  await expect(
    page.getByRole("heading", { name: "Sessão autenticada" }),
  ).toBeVisible();
});
test("password recovery and reset send CSRF-protected requests", async ({
  page,
}) => {
  await backend(page);
  await page.route("**/forgot-password", (r) =>
    r.request().method() === "POST"
      ? r.fulfill({ json: { message: "Confira seu e-mail." } })
      : r.fallback(),
  );
  await page.goto("/forgot-password");
  await page.getByLabel("E-mail", { exact: true }).fill("ana@example.com");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Confira seu e-mail.");
  await page.route("**/reset-password", (r) => {
    if (r.request().method() !== "POST") return r.fallback();
    expect(r.request().headers()["x-xsrf-token"]).toBe("test=csrf");
    expect(r.request().postDataJSON().token).toBe("example-token");
    return r.fulfill({ json: { message: "Senha redefinida." } });
  });
  await page.goto(
    "/reset-password?token=example-token&email=ana%40example.com",
  );
  await page
    .getByLabel("Nova senha", { exact: true })
    .fill("ExamplePassword123");
  await page
    .getByLabel("Confirme a senha", { exact: true })
    .fill("ExamplePassword123");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Senha redefinida.");
});

test("password visibility is explicit and preserves the entered value", async ({
  page,
}) => {
  await backend(page);
  await page.goto("/login");
  const password = page.getByLabel("Senha", { exact: true });
  await password.fill("example-only");
  await expect(password).toHaveAttribute("type", "password");
  await page
    .getByRole("button", { name: "Mostrar senha", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(password).toHaveValue("example-only");
  await page
    .getByRole("button", { name: "Ocultar senha", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "password");
});
test("reduced motion keeps auth usable without downloading GSAP", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const gsapRequests: string[] = [];
  page.on("request", (r) => {
    if (/\/assets\/gsap-/.test(r.url())) gsapRequests.push(r.url());
  });
  await backend(page);
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("ana@example.com");
  await expect(
    page.getByRole("button", { name: "Entrar", exact: true }),
  ).toBeEnabled();
  await expect(page.locator("[data-auth-reveal]").first()).not.toHaveAttribute(
    "style",
    /transform/,
  );
  expect(gsapRequests).toEqual([]);
});
