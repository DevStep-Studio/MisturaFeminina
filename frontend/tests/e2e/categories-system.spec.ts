import { expect, test, type Page } from "@playwright/test";

interface MockCategory {
  id: number;
  parent_id: number | null;
  name: string;
  slug: string;
  description: string | null;
  image_path: string | null;
  banner_desktop_path: string | null;
  banner_mobile_path: string | null;
  icon: string | null;
  sort_order: number;
  show_in_menu: boolean;
  is_active: boolean;
  seo_title: string | null;
  seo_description: string | null;
  products_count: number;
  direct_products_count: number;
  subtree_products_count: number;
  children_count: number;
  depth: number;
  full_path: string;
  ancestors: Array<{ id: number; name: string; slug: string }>;
}

const INITIAL_CATEGORIES: MockCategory[] = [
  {
    id: 1,
    parent_id: null,
    name: "Alongamento Unhas",
    slug: "alongamento-unhas",
    description: "Linha profissional de alongamento",
    image_path: null,
    banner_desktop_path: null,
    banner_mobile_path: null,
    icon: "sparkles",
    sort_order: 1,
    show_in_menu: true,
    is_active: true,
    seo_title: null,
    seo_description: null,
    products_count: 1,
    direct_products_count: 1,
    subtree_products_count: 1,
    children_count: 1,
    depth: 0,
    full_path: "Alongamento Unhas",
    ancestors: [{ id: 1, name: "Alongamento Unhas", slug: "alongamento-unhas" }],
  },
  {
    id: 2,
    parent_id: null,
    name: "Acessórios",
    slug: "acessorios",
    description: "Acessórios para nail designers",
    image_path: null,
    banner_desktop_path: null,
    banner_mobile_path: null,
    icon: "layers",
    sort_order: 2,
    show_in_menu: true,
    is_active: true,
    seo_title: null,
    seo_description: null,
    products_count: 1,
    direct_products_count: 0,
    subtree_products_count: 1,
    children_count: 1,
    depth: 0,
    full_path: "Acessórios",
    ancestors: [{ id: 2, name: "Acessórios", slug: "acessorios" }],
  },
  {
    id: 3,
    parent_id: 2,
    name: "Brocas",
    slug: "brocas",
    description: null,
    image_path: null,
    banner_desktop_path: null,
    banner_mobile_path: null,
    icon: null,
    sort_order: 1,
    show_in_menu: true,
    is_active: true,
    seo_title: null,
    seo_description: null,
    products_count: 1,
    direct_products_count: 0,
    subtree_products_count: 1,
    children_count: 1,
    depth: 1,
    full_path: "Acessórios > Brocas",
    ancestors: [
      { id: 2, name: "Acessórios", slug: "acessorios" },
      { id: 3, name: "Brocas", slug: "brocas" },
    ],
  },
  {
    id: 4,
    parent_id: 3,
    name: "Brocas Diamantadas",
    slug: "brocas-diamantadas",
    description: "Brocas de alta precisão",
    image_path: null,
    banner_desktop_path: null,
    banner_mobile_path: null,
    icon: null,
    sort_order: 1,
    show_in_menu: true,
    is_active: true,
    seo_title: null,
    seo_description: null,
    products_count: 1,
    direct_products_count: 1,
    subtree_products_count: 1,
    children_count: 0,
    depth: 2,
    full_path: "Acessórios > Brocas > Brocas Diamantadas",
    ancestors: [
      { id: 2, name: "Acessórios", slug: "acessorios" },
      { id: 3, name: "Brocas", slug: "brocas" },
      { id: 4, name: "Brocas Diamantadas", slug: "brocas-diamantadas" },
    ],
  },
];

const SAMPLE_PRODUCT = {
  id: 99,
  name: "Broca Diamantada Flame Gold PM718",
  slug: "broca-diamantada-flame-gold-pm718",
  sku: "BRC-718",
  product_type: "simple",
  brand: { id: 1, name: "D&Z", slug: "dz" },
  primary_image: null,
  primary_image_alt: "Broca Diamantada Flame Gold PM718",
  price_cents: 1990,
  effective_price_cents: 1990,
  discount_percent: 0,
  installments_count: 3,
  installment_cents: 663,
  is_new_arrival: true,
  is_featured: true,
  in_stock: true,
  available_stock: 10,
  default_variant_id: 990,
  has_multiple_variants: false,
  categories: [
    { id: 4, name: "Brocas Diamantadas", slug: "brocas-diamantadas" },
  ],
  category_ancestors: [
    { id: 2, name: "Acessórios", slug: "acessorios" },
    { id: 3, name: "Brocas", slug: "brocas" },
    { id: 4, name: "Brocas Diamantadas", slug: "brocas-diamantadas" },
  ],
  images: [],
  variants: [],
  kit_items: [],
  reviews: [],
  rating_avg: 5,
  rating_count: 1,
  seo_title: "Broca Diamantada Flame Gold",
  seo_description: null,
  related_products: [],
  gtin: null,
  manufacturer: null,
  short_description: "Broca diamantada para cutícula",
  description: null,
  ingredients: null,
  usage_instructions: null,
  unit_label: null,
  unit_quantity: null,
  weight_grams: 50,
  video_url: null,
  tags: [],
  wholesale_enabled: false,
  wholesale_tiers: [],
};

function buildTree(list: MockCategory[]) {
  const byParent = new Map<number | null, MockCategory[]>();
  for (const c of list) {
    if (!c.is_active || !c.show_in_menu) continue;
    const arr = byParent.get(c.parent_id) ?? [];
    arr.push(c);
    byParent.set(c.parent_id, arr);
  }
  const mapNode = (cat: MockCategory): unknown => ({
    ...cat,
    children: (byParent.get(cat.id) ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(mapNode),
  });
  return (byParent.get(null) ?? [])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(mapNode);
}

async function setupStatefulMocks(page: Page) {
  const categories: MockCategory[] = INITIAL_CATEGORIES.map((c) => ({ ...c }));
  let nextId = 10;

  await page.context().addCookies([
    {
      name: "XSRF-TOKEN",
      value: "mock-xsrf",
      url: "http://127.0.0.1:3100",
    },
  ]);

  await page.route("https://www.googletagmanager.com/**", (r) =>
    r.fulfill({ contentType: "application/javascript", body: "/* stub */" }),
  );

  await page.route("**/sanctum/csrf-cookie", (r) =>
    r.fulfill({ status: 204, body: "" }),
  );

  await page.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();

    if (path.endsWith("/me") || path.endsWith("/auth/me") || path.endsWith("/auth/user")) {
      return route.fulfill({
        json: {
          data: {
            id: 1,
            name: "Admin Mistura",
            email: "admin@misturafeminina.com.br",
            permissions: [
              "dashboard.view",
              "catalog.view",
              "catalog.write",
              "catalog.cost.view",
              "catalog.cost.write",
            ],
            roles: ["admin"],
            workspace_id: null,
          },
        },
      });
    }

    if (path.endsWith("/storefront/bootstrap")) {
      return route.fulfill({
        json: {
          data: {
            settings: {
              store_name: "Mistura Feminina",
              tagline: "Beleza Profissional",
              logo_light_url: "",
              logo_dark_url: "",
              favicon_url: "",
              primary_color: "#93509e",
              primary_hover_color: "#7c3f87",
              secondary_color: "#2E1049",
              accent_color: "#C22583",
              font_family: "Inter",
              cnpj: "",
              company_legal_name: "Mistura Feminina",
              address: "",
              origin_cep: "01001000",
              email: "contato@misturafeminina.com.br",
              phone: "(11) 99999-9999",
              whatsapp_number: "5511999999999",
              whatsapp_default_message: "Olá",
              social_instagram: "",
              social_tiktok: "",
              social_youtube: "",
              free_shipping_threshold_cents: 19900,
              max_installments: 3,
              installment_min_value_cents: 1000,
              wholesale_enabled: true,
              maintenance_mode: false,
              benefits_ticker: [],
              benefits_row: [],
              popup_enabled: false,
              popup_title: "",
              popup_subtitle: "",
              popup_coupon_code: "",
              seo_default_title: "Mistura Feminina",
              seo_default_description: "",
            },
            menu_categories: buildTree(categories),
            brands: [{ id: 1, name: "D&Z", slug: "dz", logo_path: null, is_featured: true }],
            footer_pages: [],
            promo_products: [],
          },
        },
      });
    }

    if (path.endsWith("/storefront/cart")) {
      return route.fulfill({ json: { data: { items: [], items_count: 0 } } });
    }

    if (path.endsWith("/catalog/categories") && method === "GET") {
      return route.fulfill({ json: { data: buildTree(categories) } });
    }

    if (path.includes("/catalog/categories/") && method === "GET") {
      const slug = path.split("/").pop() ?? "";
      const cat = categories.find((c) => c.slug === slug);
      if (!cat) return route.fulfill({ status: 404, json: { message: "Not found" } });
      const children = categories.filter((c) => c.parent_id === cat.id && c.is_active);
      return route.fulfill({
        json: {
          data: {
            category: { ...cat, children },
            products: {
              data: [SAMPLE_PRODUCT],
              current_page: 1,
              last_page: 1,
              total: 1,
            },
            facets: { brands: [], categories: [], attributes: [] },
          },
        },
      });
    }

    if (path.endsWith(`/catalog/products/${SAMPLE_PRODUCT.slug}`)) {
      return route.fulfill({ json: { data: SAMPLE_PRODUCT } });
    }

    if (path.endsWith("/admin/categories") && method === "GET") {
      return route.fulfill({ json: { data: categories } });
    }

    if (path.endsWith("/admin/categories") && method === "POST") {
      const body = req.postDataJSON() as { name: string; parent_id?: number | null };
      const parentId = body.parent_id ?? null;
      const dup = categories.some(
        (c) =>
          (c.parent_id ?? null) === parentId &&
          c.name.trim().toLowerCase() === body.name.trim().toLowerCase(),
      );
      if (dup) {
        return route.fulfill({
          status: 422,
          json: {
            message: "Já existe uma categoria com este nome no mesmo nível.",
            errors: {
              name: ["Já existe uma categoria com este nome no mesmo nível."],
            },
          },
        });
      }
      const parent = categories.find((c) => c.id === parentId);
      const id = nextId++;
      const slug = body.name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const created: MockCategory = {
        id,
        parent_id: parentId,
        name: body.name,
        slug,
        description: null,
        image_path: null,
        banner_desktop_path: null,
        banner_mobile_path: null,
        icon: null,
        sort_order: categories.length + 1,
        show_in_menu: true,
        is_active: true,
        seo_title: null,
        seo_description: null,
        products_count: 0,
        direct_products_count: 0,
        subtree_products_count: 0,
        children_count: 0,
        depth: parent ? parent.depth + 1 : 0,
        full_path: parent ? `${parent.full_path} > ${body.name}` : body.name,
        ancestors: parent
          ? [...parent.ancestors, { id, name: body.name, slug }]
          : [{ id, name: body.name, slug }],
      };
      categories.push(created);
      return route.fulfill({ status: 201, json: { data: created } });
    }

    if (path.endsWith("/admin/brands") || path.endsWith("/admin/attributes")) {
      return route.fulfill({ json: { data: [] } });
    }

    if (path.endsWith("/admin/products") && method === "GET") {
      return route.fulfill({
        json: {
          data: [SAMPLE_PRODUCT],
          total: 1,
          current_page: 1,
          last_page: 1,
        },
      });
    }

    if (path.endsWith("/admin/catalog/import-csv") && method === "POST") {
      return route.fulfill({
        json: {
          data: {
            dry_run: true,
            total_rows: 1,
            created: 1,
            updated: 0,
            errors: [],
            preview: [
              {
                row: 2,
                sku: "IMP-E2E-1",
                name: "Broca Teste Planilha",
                price_cents: 2590,
                raw_category: "Acessórios > Brocas > Brocas Diamantadas",
                category_status: "matched",
                matched_categories: ["Acessórios > Brocas > Brocas Diamantadas"],
                category_ids: [4],
                category_suggestions: [],
                row_errors: [],
              },
            ],
          },
        },
      });
    }

    return route.fulfill({ json: { data: [] } });
  });
}

test("desktop: vitrine renderiza 3 niveis, breadcrumbs e persiste apos reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setupStatefulMocks(page);

  await page.goto("/categoria/brocas-diamantadas");
  await expect(
    page.getByRole("heading", { name: "Brocas Diamantadas" }),
  ).toBeVisible();
  await expect(page.getByText("Broca Diamantada Flame Gold PM718")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Navegação estrutural" }),
  ).toContainText("Acessórios");
  await expect(
    page.getByRole("navigation", { name: "Navegação estrutural" }),
  ).toContainText("Brocas");

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Brocas Diamantadas" }),
  ).toBeVisible();

  await page.goto("/produto/broca-diamantada-flame-gold-pm718");
  await expect(
    page.getByRole("navigation", { name: "Navegação estrutural" }),
  ).toContainText("Brocas Diamantadas");
});

test("celular 390x844: drawer de menu abre 3 niveis sem overflow horizontal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupStatefulMocks(page);

  await page.goto("/");
  await page.getByRole("button", { name: "Abrir menu de categorias" }).click();
  await page.getByRole("button", { name: "Expandir subcategorias de Acessórios" }).click();

  await expect(page.getByRole("link", { name: "Brocas", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Brocas Diamantadas", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver tudo em Acessórios" })).toBeVisible();

  const noOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(noOverflow).toBe(true);
});

test("admin: gerencia hierarquia em 3 niveis, bloqueia duplicata e persiste categoria criada apos reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setupStatefulMocks(page);

  await page.goto("/admin/categorias");
  await expect(page.getByText("Acessórios")).toBeVisible();

  // Create level-3 sub under Brocas
  await page.getByRole("button", { name: "Expandir tudo" }).click();
  await expect(page.getByText("Brocas Diamantadas")).toBeVisible();

  await page
    .getByRole("button", { name: "Nova subcategoria em Brocas", exact: true })
    .click();
  await page.locator("#cat-name-input").fill("Broca Teste E2E");
  await page.getByRole("button", { name: "Salvar categoria" }).click();

  await expect(page.getByText("Broca Teste E2E")).toBeVisible();

  // Attempt duplicate sibling creation under Brocas -> expect 422 validation error
  await page
    .getByRole("button", { name: "Nova subcategoria em Brocas", exact: true })
    .click();
  await page.locator("#cat-name-input").fill("Brocas Diamantadas");
  await page.getByRole("button", { name: "Salvar categoria" }).click();
  await expect(
    page.getByText(/Já existe uma categoria com este nome/i),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancelar" }).click();
  const discardBtn = page.getByRole("button", { name: "Descartar" });
  if (await discardBtn.isVisible().catch(() => false)) {
    await discardBtn.click();
  }

  // Reload and confirm newly persisted category remains visible
  await page.reload();
  await page.getByRole("button", { name: "Expandir tudo" }).click();
  await expect(page.getByText("Broca Teste E2E")).toBeVisible();
});
