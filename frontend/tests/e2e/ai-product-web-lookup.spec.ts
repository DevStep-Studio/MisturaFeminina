import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const SCREENSHOT_DIR = path.resolve(process.cwd(), "../docs/screenshots");

// Valid 1x1 purple PNG bytes returned locally to Playwright image routes so previews render deterministically
const SAMPLE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAWklEQVR4nO3PQQ0AIAwEsOkf2dSAh4I2Q1dK8N2ZsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB4swB/7QAB0i5xkwAAAABJRU5ErkJggg==";

async function setupLookupMocks(page: Page) {
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
    r.fulfill({
      json: {
        data: {
          id: 1,
          name: "Mariana Ferreira",
          email: "admin@misturafeminina.com.br",
          roles: ["admin"],
          permissions: [
            "dashboard.view",
            "catalog.view",
            "catalog.write",
            "catalog.pricing",
            "catalog.cost.view",
            "catalog.cost.write",
            "inventory.manage",
            "ai.view",
            "ai.catalog",
            "ai.catalog.approve",
            "ai.settings",
            "banners.write",
          ],
        },
      },
    }),
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

  await page.route("https://cdn.fabricante.com.br/**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(SAMPLE_PNG_BASE64, "base64"),
    }),
  );

  await page.route("**/storage/catalog/**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(SAMPLE_PNG_BASE64, "base64"),
    }),
  );

  await page.route("**/api/v1/admin/brands**", (r) =>
    r.fulfill({
      json: {
        data: [
          { id: 1, name: "SunUV", slug: "sunuv" },
          { id: 2, name: "Bella Gel", slug: "bella-gel" },
          { id: 3, name: "D&Z", slug: "dez" },
        ],
      },
    }),
  );

  await page.route("**/api/v1/admin/categories**", (r) =>
    r.fulfill({
      json: {
        data: [
          { id: 10, name: "Cabines & Luminárias", slug: "cabines-luminarias" },
          { id: 11, name: "Esmaltes em Gel", slug: "esmaltes-em-gel" },
          { id: 12, name: "Preparadores & Top Coats", slug: "top-coats" },
        ],
      },
    }),
  );

  await page.route("**/api/v1/admin/attributes**", (r) =>
    r.fulfill({ json: { data: [] } }),
  );

  await page.route("**/api/v1/admin/ai/catalog/imports", (r) =>
    r.fulfill({ json: { data: [] } }),
  );

  await page.route("**/api/v1/admin/ai/overview", (r) =>
    r.fulfill({
      json: {
        data: {
          provider: {
            provider: "openai",
            status: "not_configured",
            label: "Configuração necessária",
            has_api_key: false,
            masked_key: null,
            base_url: "https://api.openai.com/v1",
            models: {
              support: "gpt-4o-mini",
              catalog: "gpt-4o-mini",
              replenishment: "gpt-4o-mini",
            },
            last_healthcheck_at: null,
            last_healthcheck_status: null,
          },
          agents: [
            {
              id: 1,
              slug: "customer_support",
              name: "Agente de Atendimento",
              enabled: true,
              version: 1,
              executions_count: 0,
              last_executed_at: null,
            },
            {
              id: 2,
              slug: "product_catalog",
              name: "Agente de Cadastro",
              enabled: true,
              version: 1,
              executions_count: 3,
              last_executed_at: null,
            },
            {
              id: 3,
              slug: "inventory_replenishment",
              name: "Agente de Reposição",
              enabled: true,
              version: 1,
              executions_count: 0,
              last_executed_at: null,
            },
            {
              id: 4,
              slug: "marketing_growth",
              name: "Marketing & Growth",
              enabled: true,
              version: 1,
              executions_count: 0,
              last_executed_at: null,
            },
          ],
          kpis: {
            catalog_imports_prepared: 0,
            catalog_imports_awaiting_review: 0,
            support_replies_prepared: 0,
            replenishment_recommendations_generated: 0,
            failed_executions: 0,
            tokens_today: 0,
            cost_today_usd: 0,
          },
          recent_executions: [],
          pending_imports: [],
        },
      },
    }),
  );

  let savedProducts: Array<Record<string, unknown>> = [
    {
      id: 901,
      name: "Cabine Sun 5 - Bivolt - 48w com Temporizador",
      slug: "cabine-sun-5-48w",
      sku: "JK-DST-001",
      gtin: "7890001112223",
      power_watts: 48,
      brand_id: 1,
      brand: { id: 1, name: "SunUV" },
      categories: [{ id: 10, name: "Cabines & Luminárias" }],
      price_cents: 16990,
      promo_price_cents: null,
      cost_cents: 7500,
      weight_grams: 650,
      is_active: true,
      is_archived: false,
      images: [{ id: 1, path: "/logo-mf.png", alt_text: "Cabine Sun 5", is_primary: true }],
      variants: [
        {
          id: 9011,
          sku: "JK-DST-001",
          name: "Padrão",
          price_cents: 16990,
          cost_cents: 7500,
          stock_qty: 12,
          reserved_qty: 0,
          is_default: true,
          is_active: true,
        },
      ],
      variants_summary: {
        count: 1,
        is_multi_variant: false,
        price_min_cents: 16990,
        price_max_cents: 16990,
        effective_min_cents: 16990,
        effective_max_cents: 16990,
        total_stock: 12,
        total_reserved: 0,
        total_available: 12,
        out_of_stock_count: 0,
        has_promo: false,
      },
    },
  ];

  const savedCreatePayloads: Array<Record<string, unknown>> = [];
  let blockImageDownload = false;
  let forceSearchOutage = false;

  await page.route("**/api/v1/admin/products**", async (r) => {
    const req = r.request();
    const url = new URL(req.url());
    if (/\/admin\/products\/\d+$/.test(url.pathname)) {
      const id = Number(url.pathname.split("/").pop());
      const found = savedProducts.find((p) => p.id === id) ?? savedProducts[0];
      return r.fulfill({ json: { data: found } });
    }
    if (req.method() === "POST") {
      const body = req.postDataJSON() as Record<string, unknown>;
      savedCreatePayloads.push(body);
      const nextId = 1000 + savedCreatePayloads.length;
      const created = {
        id: nextId,
        ...body,
        brand: { id: 1, name: "SunUV" },
        categories: [{ id: 10, name: "Cabines & Luminárias" }],
        images: (body.images as Array<Record<string, unknown>>) ?? [],
        variants_summary: {
          count: 1,
          is_multi_variant: false,
          price_min_cents: body.price_cents,
          price_max_cents: body.price_cents,
          effective_min_cents: body.price_cents,
          effective_max_cents: body.price_cents,
          total_stock: body.stock_qty ?? 0,
          total_reserved: 0,
          total_available: body.stock_qty ?? 0,
          out_of_stock_count: 0,
          has_promo: false,
        },
      };
      savedProducts = [created, ...savedProducts];
      return r.fulfill({ status: 201, json: { data: created } });
    }
    return r.fulfill({
      json: {
        data: savedProducts,
        current_page: 1,
        last_page: 1,
        per_page: 25,
        total: savedProducts.length,
      },
    });
  });

  await page.route("**/api/v1/admin/ai/catalog/import-image", async (r) => {
    const body = r.request().postDataJSON() as { url: string; title?: string };
    if (blockImageDownload || body.url.includes("blocked")) {
      return r.fulfill({
        status: 422,
        json: {
          message:
            "O site de origem bloqueou o acesso automático a este endereço (HTTP 403). Escolha outra candidata ou envie sua foto manualmente.",
        },
      });
    }
    const slugName = (body.title || "produto").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return r.fulfill({
      status: 201,
      json: {
        data: {
          id: 50,
          path: `/storage/catalog/2026/11/${slugName}.webp`,
          thumb_path: `/storage/catalog/2026/11/${slugName}-thumb.webp`,
          width: 800,
          height: 800,
          mime_type: "image/webp",
          size_bytes: 24100,
          source_url: body.url,
        },
      },
    });
  });

  await page.route("**/api/v1/admin/ai/catalog/upload-image", (r) =>
    r.fulfill({
      status: 201,
      json: {
        data: {
          id: 51,
          path: "/storage/catalog/2026/11/manual-upload.webp",
        },
      },
    }),
  );

  await page.route("**/api/v1/admin/ai/catalog/check-duplicates", (r) => {
    const body = r.request().postDataJSON() as { sku?: string; gtin?: string };
    const found = savedProducts.find(
      (p) =>
        (body.sku && String(p.sku).toUpperCase() === body.sku.toUpperCase()) ||
        (body.gtin && p.gtin === body.gtin),
    );
    return r.fulfill({
      json: {
        data: {
          has_exact_conflict: Boolean(found),
          exact_conflicts: found
            ? [
                {
                  id: found.id,
                  name: found.name,
                  sku: found.sku,
                  gtin: found.gtin,
                  price_cents: found.price_cents,
                  reason: `SKU ${found.sku} já cadastrado neste produto.`,
                },
              ]
            : [],
          similar_products: [],
        },
      },
    });
  });

  await page.route("**/api/v1/admin/ai/catalog/lookup", async (r) => {
    const body = r.request().postDataJSON() as {
      query?: string;
      brand?: string;
    };
    const q = (body.query || "").toLowerCase();

    if (forceSearchOutage || q.includes("indisponivel")) {
      return r.fulfill({
        json: {
          data: {
            state: "search_unavailable",
            credentials_missing: true,
            query: body.query || "",
            message:
              "Serviço de busca indisponível — credenciais do Google/Serper não configuradas. Preencha manualmente abaixo.",
            local_matches: [],
            candidates: [],
            draft: {
              name: body.query || "Produto Manual",
              sku: "MF-MAN-001",
              gtin: "",
              supplier_code: "",
              power_watts: null,
              brand_id: null,
              category_ids: [],
              short_description: "",
              description: "",
              image_url: null,
              image_path: "",
              price_cents: null,
              cost_cents: null,
              stock_qty: null,
            },
            image_status: "unavailable",
            requires_image_review: true,
            image_warning: "Adicione uma foto manualmente.",
            image_candidates: [],
            source: null,
          },
        },
      });
    }

    if (q.includes("jk-dst-001")) {
      const existing =
        savedProducts.find((p) => String(p.sku) === "JK-DST-001") ??
        savedProducts[0];
      return r.fulfill({
        json: {
          data: {
            state: "duplicate_found",
            query: body.query || "",
            message:
              "Encontramos este item já cadastrado no catálogo oficial. Abra o produto existente para atualizar sem gerar duplicidade.",
            local_matches: [
              {
                id: existing.id,
                name: existing.name,
                sku: existing.sku,
                gtin: existing.gtin,
                price_cents: existing.price_cents,
                stock_qty: 12,
                primary_image_path: "/logo-mf.png",
                reason: "SKU interno JK-DST-001 localizado no catálogo da loja.",
                is_exact_identifier: true,
              },
            ],
            candidates: [],
            draft: null,
            image_status: "unavailable",
            requires_image_review: false,
            image_warning: null,
            image_candidates: [],
            source: null,
          },
        },
      });
    }

    if (q.includes("cabine") && q.includes("8 pro")) {
      return r.fulfill({
        json: {
          data: {
            state: "draft_ready",
            query: body.query || "",
            message: "Ficha preenchida para Cabine Sun 8 Pro 268W.",
            local_matches: [],
            candidates: [],
            image_status: "candidate_ready",
            requires_image_review: false,
            image_warning: null,
            source: {
              title: "Cabine Sun 8 Pro 268W Bivolt — SunUV",
              url: "https://fabricante.com.br/sun-8-pro-268w",
              domain: "fabricante.com.br",
            },
            image_candidates: [
              {
                image_url: "https://cdn.fabricante.com.br/sun-8-pro-268w.png",
                thumb_url: "https://cdn.fabricante.com.br/sun-8-pro-268w.png",
                title: "Cabine Sun 8 Pro 268W",
              },
            ],
            draft: {
              name: "Cabine Sun 8 Pro 268W LED UV Bivolt",
              sku: "MF-SUN8-268",
              gtin: "7890002680008",
              power_watts: 268,
              brand_id: 1,
              category_ids: [10],
              short_description: "Cabine de alta potência 268W LED UV para secagem acelerada.",
              description: "Cabine LED UV Sun 8 Pro 268W com sensor automático e base removível.",
              image_url: "https://cdn.fabricante.com.br/sun-8-pro-268w.png",
              image_path: "",
              price_cents: null,
              cost_cents: null,
              stock_qty: null,
            },
          },
        },
      });
    }

    if (q.includes("esmalte") && q.includes("rosé")) {
      return r.fulfill({
        json: {
          data: {
            state: "draft_ready",
            query: body.query || "",
            message:
              "A página encontrada apresenta uma coleção sem associação comprovada para a tonalidade \"Rosé\". Confira a foto antes de salvar.",
            local_matches: [],
            candidates: [],
            image_status: "uncertain_collection",
            requires_image_review: true,
            image_warning:
              "A fonte exibe a coleção de 10 cores sem comprovar a foto específica da tonalidade Rosé.",
            source: {
              title: "Coleção Esmaltes em Gel D&Z 15 ml — 10 Cores",
              url: "https://fabricante.com.br/colecao-esmaltes-dz",
              domain: "fabricante.com.br",
            },
            image_candidates: [
              {
                image_url: "https://cdn.fabricante.com.br/colecao-10-cores.png",
                thumb_url: "https://cdn.fabricante.com.br/colecao-10-cores.png",
                title: "Coleção 10 Cores D&Z 15 ml",
                is_collection_context: true,
              },
              {
                image_url: "https://cdn.fabricante.com.br/blocked-image.png",
                thumb_url: "https://cdn.fabricante.com.br/blocked-image.png",
                title: "Bloqueada pelo servidor",
              },
            ],
            draft: {
              name: "Esmalte em Gel D&Z Rosé 15 ml",
              sku: "MF-DZ-ROS-15",
              gtin: "",
              power_watts: null,
              brand_id: 3,
              category_ids: [11],
              short_description: "Esmalte em gel UV LED tonalidade Rosé com 15 ml.",
              description: "Esmalte em gel D&Z Rosé 15 ml para esmaltação profissional UV/LED.",
              image_url: "https://cdn.fabricante.com.br/colecao-10-cores.png",
              image_path: "",
              price_cents: null,
              cost_cents: null,
              stock_qty: null,
            },
          },
        },
      });
    }

    if (q.includes("top coat")) {
      return r.fulfill({
        json: {
          data: {
            state: "multiple_candidates",
            query: body.query || "",
            message:
              "Mais de um produto possível foi encontrado. Escolha com 1 clique qual deseja cadastrar.",
            local_matches: [],
            image_status: "multiple",
            requires_image_review: true,
            image_warning: null,
            image_candidates: [],
            source: null,
            draft: null,
            candidates: [
              {
                id: "cand_1",
                title: "Top Coat em Gel 15 ml — D&Z Sem Goma",
                diff_badge: "D&Z · 15 ml · fabricante.com.br",
                source_domain: "fabricante.com.br",
                thumbnail_url: "https://cdn.fabricante.com.br/top-coat-dz.png",
                image_status: "candidate_ready",
                requires_image_review: false,
                image_warning: null,
                image_candidates: [
                  {
                    image_url: "https://cdn.fabricante.com.br/top-coat-dz.png",
                    thumb_url: "https://cdn.fabricante.com.br/top-coat-dz.png",
                    title: "Top Coat D&Z 15 ml",
                  },
                ],
                source: {
                  title: "Top Coat Sem Goma 15 ml D&Z",
                  url: "https://fabricante.com.br/top-coat-dz-15ml",
                  domain: "fabricante.com.br",
                },
                draft: {
                  name: "Top Coat em Gel D&Z 15 ml",
                  sku: "MF-TC-DZ15",
                  gtin: "",
                  power_watts: null,
                  brand_id: 3,
                  category_ids: [12],
                  short_description: "Top coat sem goma D&Z 15 ml para brilho intenso.",
                  description: "Finalizador em gel UV/LED sem goma D&Z frasco 15 ml.",
                  image_url: "https://cdn.fabricante.com.br/top-coat-dz.png",
                  image_path: "",
                  price_cents: null,
                  cost_cents: null,
                  stock_qty: null,
                },
              },
              {
                id: "cand_2",
                title: "Top Coat 15 ml Selante — Bella Gel",
                diff_badge: "Bella Gel · 15 ml · bellagel.com.br",
                source_domain: "bellagel.com.br",
                thumbnail_url: "https://cdn.fabricante.com.br/top-coat-bella.png",
                image_status: "candidate_ready",
                requires_image_review: false,
                image_warning: null,
                image_candidates: [
                  {
                    image_url: "https://cdn.fabricante.com.br/top-coat-bella.png",
                    thumb_url: "https://cdn.fabricante.com.br/top-coat-bella.png",
                    title: "Top Coat Bella Gel 15 ml",
                  },
                ],
                source: {
                  title: "Top Coat 15 ml Bella Gel",
                  url: "https://bellagel.com.br/top-coat-15ml",
                  domain: "bellagel.com.br",
                },
                draft: {
                  name: "Top Coat Selante Bella Gel 15 ml",
                  sku: "MF-TC-BG15",
                  gtin: "",
                  power_watts: null,
                  brand_id: 2,
                  category_ids: [12],
                  short_description: "Selante finalizador em gel 15 ml Bella Gel.",
                  description: "Top coat selante UV/LED 15 ml da marca Bella Gel.",
                  image_url: "https://cdn.fabricante.com.br/top-coat-bella.png",
                  image_path: "",
                  price_cents: null,
                  cost_cents: null,
                  stock_qty: null,
                },
              },
            ],
          },
        },
      });
    }

    // Default: Cabine Sun 5 48W
    return r.fulfill({
      json: {
        data: {
          state: "draft_ready",
          query: body.query || "",
          message: "Ficha preenchida com referências reais. Informe preço, custo e estoque para salvar.",
          local_matches: [],
          candidates: [],
          search_status: {
            provider: "google_search",
            driver: "serper",
            driver_label: "Serper (Google Busca Web e Imagens)",
            status: "connected",
            label: "Conectado",
            has_credentials: true,
            has_api_key: true,
            masked_key: "serpe...mock",
            last_healthcheck_at: "2026-11-25T02:00:00Z",
            last_healthcheck_status: "connected",
          },
          image_status: "candidate_ready",
          requires_image_review: false,
          image_warning: null,
          source: {
            title: "Cabine LED UV Sun 5 48W Bivolt com Temporizador — SunUV",
            url: "https://fabricante.com.br/cabine-sun-5-48w",
            domain: "fabricante.com.br",
          },
          image_candidates: [
            {
              image_url: "https://cdn.fabricante.com.br/cabine-sun5-48w.png",
              thumb_url: "https://cdn.fabricante.com.br/cabine-sun5-48w.png",
              title: "Cabine Sun 5 48W Bivolt",
            },
          ],
          draft: {
            name: "Cabine Sun 5 48W Bivolt com Temporizador",
            sku: "MF-SUN5-48",
            gtin: "7891234560012",
            supplier_code: "SUN5-48B",
            power_watts: 48,
            brand_id: 1,
            category_ids: [10],
            short_description: "Cabine profissional LED UV 48W bivolt com temporizador 10s/30s/60s/99s.",
            description:
              "Cabine Sun 5 LED UV 48W bivolt com sensor automático e temporizador digital de 10s, 30s, 60s e 99s.",
            image_url: "https://cdn.fabricante.com.br/cabine-sun5-48w.png",
            image_path: "",
            price_cents: null,
            cost_cents: null,
            stock_qty: null,
          },
        },
      },
    });
  });

  await page.route("**/api/v1/admin/ai/settings", (r) =>
    r.fulfill({
      json: {
        data: {
          config: {
            support_model: "gpt-4o-mini",
            catalog_model: "gpt-4o-mini",
            replenishment_model: "gpt-4o-mini",
            daily_execution_limit: 500,
            daily_budget_usd: 15,
            default_margin_pct: 100,
            auto_replenishment_schedule: "daily",
          },
          connection: {
            provider: "openai",
            status: "not_configured",
            label: "Configuração necessária",
            has_api_key: false,
            masked_key: null,
            base_url: "https://api.openai.com/v1",
            models: { support: "gpt-4o-mini", catalog: "gpt-4o-mini", replenishment: "gpt-4o-mini" },
            last_healthcheck_at: null,
            last_healthcheck_status: null,
          },
          search_connection: {
            provider: "google_search",
            driver: "serper",
            driver_label: "Serper (Google Busca Web e Imagens)",
            status: "not_configured",
            label: "Configuração necessária",
            has_credentials: false,
            has_api_key: false,
            masked_key: null,
            engine_id: null,
            last_healthcheck_at: null,
            last_healthcheck_status: null,
          },
          agents: [
            { id: 2, slug: "product_catalog", name: "Agente de Cadastro", enabled: true, version: 1 },
          ],
        },
      },
    }),
  );

  return {
    savedCreatePayloads,
    setBlockImageDownload: (val: boolean) => {
      blockImageDownload = val;
    },
    setForceSearchOutage: (val: boolean) => {
      forceSearchOutage = val;
    },
  };
}

test.describe("Agente de Cadastro por Nome com Busca Web & Imagem", () => {
  test("Critérios 1, 2, 3, 4 e 5: Busca com foco direto, discriminação de modelos/coleção, duplicata local, falha de imagem/busca e salvamento em /storage/", async ({
    page,
  }) => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    const ctx = await setupLookupMocks(page);

    // Critério 1: Clicar em "Cadastrar com IA" abre campo focado direto
    await page.goto("/admin/produtos");
    await page.getByRole("button", { name: "Cadastrar com IA" }).first().click();

    const lookupInput = page.getByLabel("Qual produto você quer cadastrar?");
    await expect(lookupInput).toBeVisible();
    await expect(lookupInput).toBeFocused();

    // Buscar Cabine Sun 5 48W com Enter
    await lookupInput.fill("Cabine Sun 5 48W bivolt com temporizador");
    await lookupInput.press("Enter");

    await expect(page.getByLabel(/Nome comercial/i)).toHaveValue(
      "Cabine Sun 5 48W Bivolt com Temporizador",
    );
    await expect(page.getByRole("link", { name: /Cabine LED UV Sun 5 48W/i })).toBeVisible();
    await expect(page.getByLabel("Preço de venda (R$)")).toHaveValue("");

    await page.getByLabel("Preço de venda (R$)").fill("149,90");
    await page.getByLabel("Custo unitário (R$)").fill("68,00");
    await page.getByLabel("Estoque inicial (un.)").fill("10");
    await expect(page.getByText("R$ 81,90")).toBeVisible();
    await expect(page.getByText("54,64%")).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "ai-lookup-cabine-desktop.png"),
      fullPage: false,
    });

    // Salva importando imagem para /storage/catalog/... antes de persistir produto
    await page.getByRole("button", { name: "Salvar produto", exact: true }).click();
    await expect(page.getByText(/cadastrado com sucesso/i)).toBeVisible();
    expect(ctx.savedCreatePayloads.length).toBe(1);
    const savedImgs = ctx.savedCreatePayloads[0].images as Array<{ path: string }>;
    expect(savedImgs[0].path).toContain("/storage/catalog/");

    // Voltar para Cadastrar com IA: buscar modelo diferente (Cabine Sun 8 Pro 268W)
    await page.getByRole("button", { name: "Cadastrar com IA" }).first().click();
    await page.getByLabel("Qual produto você quer cadastrar?").fill("Cabine Sun 8 Pro 268W");
    await page.getByRole("button", { name: "Buscar produto" }).click();
    await expect(page.getByLabel(/Nome comercial/i)).toHaveValue(
      "Cabine Sun 8 Pro 268W LED UV Bivolt",
    );
    await expect(page.getByLabel("Potência (W)")).toHaveValue("268");

    // Critério 3a: Esmalte com tonalidade específica em fonte de coleção -> dúvida explícita na foto
    await page.getByLabel("Qual produto você quer cadastrar?").fill("Esmalte em Gel Rosé 15 ml");
    await page.getByRole("button", { name: "Buscar produto" }).click();
    await expect(page.getByText(/Revisar foto \(coleção\)/)).toBeVisible();
    await expect(page.getByText(/coleção de 10 cores/i)).toBeVisible();

    // Testar falha de download em candidata bloqueada preservando campos preenchidos + upload manual
    await page.getByRole("button", { name: /Bloqueada pelo servidor/i }).click();
    await expect(page.getByText(/bloqueou o acesso automático/i)).toBeVisible();
    await expect(page.getByLabel(/Nome comercial/i)).toHaveValue("Esmalte em Gel D&Z Rosé 15 ml");

    await page.locator("input[aria-label='Enviar arquivo de foto manual']").setInputFiles({
      name: "rose-manual.png",
      mimeType: "image/png",
      buffer: Buffer.from(SAMPLE_PNG_BASE64, "base64"),
    });
    await expect(page.getByText("Foto salva na loja")).toBeVisible();

    // Termo genérico "top coat 15 ml" -> escolha em 1 clique
    await page.getByLabel("Qual produto você quer cadastrar?").fill("top coat 15 ml");
    await page.getByRole("button", { name: "Buscar produto" }).click();
    await expect(page.getByText(/Escolha a referência correta/i)).toBeVisible();
    await page.getByRole("button", { name: "Selecionar produto" }).first().click();
    await expect(page.getByLabel(/Nome comercial/i)).toHaveValue("Top Coat em Gel D&Z 15 ml");

    // Critério 4: Item já cadastrado (SKU JK-DST-001) -> abre existente sem criar duplicata
    await page.getByLabel("Qual produto você quer cadastrar?").fill("JK-DST-001");
    await page.getByRole("button", { name: "Buscar produto" }).click();
    await expect(page.getByRole("button", { name: "Abrir produto existente" })).toBeVisible();
    await page.getByRole("button", { name: "Abrir produto existente" }).click();
    await expect(page.getByText(/Editar produto — JK-DST-001/)).toBeVisible();

    // Critério 5: Falha na busca externa permite conclusão manual mantendo o nome digitado
    await page.getByRole("button", { name: "Cadastrar com IA" }).first().click();
    ctx.setForceSearchOutage(true);
    await page.getByLabel("Qual produto você quer cadastrar?").fill("Lixa Bloco Indisponivel Manual");
    await page.getByRole("button", { name: "Buscar produto" }).click();
    await expect(page.getByText(/Serviço de busca indisponível/i).first()).toBeVisible();
    await expect(page.getByLabel(/Nome comercial/i)).toHaveValue("Lixa Bloco Indisponivel Manual");
    ctx.setForceSearchOutage(false);
  });

  test("Critério 6 + Responsividade Mobile 390px + Settings de Busca Google: 3 cadastros consecutivos sem vazamento", async ({
    page,
  }) => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await page.setViewportSize({ width: 390, height: 844 });
    const ctx = await setupLookupMocks(page);

    await page.goto("/admin/produtos?view=ia");
    await expect(page.getByLabel("Qual produto você quer cadastrar?")).toBeVisible();

    const consecutiveTerms = [
      { query: "Cabine Sun 5 48W", price: "149,90", cost: "65,00", stock: "5", expectedName: "Cabine Sun 5 48W Bivolt com Temporizador" },
      { query: "Cabine Sun 8 Pro 268W", price: "229,90", cost: "110,00", stock: "8", expectedName: "Cabine Sun 8 Pro 268W LED UV Bivolt" },
      { query: "Esmalte em Gel Rosé 15 ml", price: "19,90", cost: "7,50", stock: "24", expectedName: "Esmalte em Gel D&Z Rosé 15 ml" },
    ];

    for (let i = 0; i < consecutiveTerms.length; i++) {
      const item = consecutiveTerms[i];
      await page.getByLabel("Qual produto você quer cadastrar?").fill(item.query);
      await page.getByRole("button", { name: "Buscar produto" }).click();
      await expect(page.getByLabel(/Nome comercial/i)).toHaveValue(item.expectedName);

      if (i === 0) {
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        );
        expect(overflow).toBe(false);
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, "ai-lookup-mobile-390.png"),
          fullPage: false,
        });
      }

      // Ensure NO previous price/cost/stock leaked into the fresh draft
      await expect(page.getByLabel("Preço de venda (R$)")).toHaveValue("");
      await expect(page.getByLabel("Estoque inicial (un.)")).toHaveValue("");

      await page.getByLabel("Preço de venda (R$)").fill(item.price);
      await page.getByLabel("Custo unitário (R$)").fill(item.cost);
      await page.getByLabel("Estoque inicial (un.)").fill(item.stock);

      await page.getByRole("button", { name: "Salvar e cadastrar próximo" }).click();

      // After saving & continuing: query cleared, focus returned, previous item cleared
      await expect(page.getByLabel("Qual produto você quer cadastrar?")).toHaveValue("");
      await expect(page.getByLabel("Qual produto você quer cadastrar?")).toBeFocused();
      await expect(page.getByLabel(/Nome comercial/i)).toHaveCount(0);
    }

    expect(ctx.savedCreatePayloads.length).toBe(3);

    // Check administrator Google Search configuration visibility in Central de IA -> Configurações
    await page.goto("/admin/ia?tab=configuracoes");
    await expect(page.getByText(/Busca Google Web e Imagens/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Testar busca Google" })).toBeVisible();
  });
});
