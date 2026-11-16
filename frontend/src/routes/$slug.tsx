import { createFileRoute, notFound } from "@tanstack/solid-router";
import { StoreShell } from "../features/storefront/components/StoreShell";
import { api } from "../lib/api";
import { seoHead } from "../lib/seo";

const RESERVED_NON_CMS_SLUGS = new Set([
  "dashboard",
  "projects",
  "users",
  "settings",
  "invalid-address",
  "app",
  "login",
  "forgot-password",
  "reset-password",
  "admin",
  "403",
  "404",
]);

interface ContentPageData {
  slug: string;
  title: string;
  content_html: string;
  seo_title: string | null;
  seo_description: string | null;
}

export const Route = createFileRoute("/$slug")({
  beforeLoad: ({ params }) => {
    if (RESERVED_NON_CMS_SLUGS.has(params.slug.toLowerCase())) {
      throw notFound();
    }
  },
  loader: async ({ params }) => {
    try {
      const res = await api<{ data: ContentPageData }>(
        `/storefront/pages/${params.slug}`,
        {
          authenticated: false,
        },
      );
      if (!res?.data?.slug) {
        throw notFound();
      }
      return res.data;
    } catch {
      throw notFound();
    }
  },
  head: ({ loaderData, params }) =>
    seoHead({
      title:
        loaderData?.seo_title ||
        `${loaderData?.title || params.slug} | Mistura Feminina`,
      description:
        loaderData?.seo_description ||
        "Informações institucionais, políticas comerciais e atendimento da Mistura Feminina Cosméticos.",
      path: `/${params.slug}`,
    }),
  component: DynamicContentPage,
});

function DynamicContentPage() {
  const data = Route.useLoaderData();

  return (
    <StoreShell>
      <article class="mx-auto max-w-4xl px-4 py-10">
        <h1 class="text-2xl font-bold text-zinc-900 sm:text-3xl">
          {data()?.title || ""}
        </h1>
        <div
          class="prose prose-zinc mt-6 max-w-none text-sm leading-relaxed text-zinc-700 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5"
          // eslint-disable-next-line solid/no-innerhtml
          innerHTML={data()?.content_html || ""}
        />
      </article>
    </StoreShell>
  );
}
