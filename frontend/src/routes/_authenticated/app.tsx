import { createFileRoute } from "@tanstack/solid-router";
import { SessionPage } from "../../features/auth/components/session-page";
import { seoHead } from "../../lib/seo";
export const Route = createFileRoute("/_authenticated/app")({
  head: () =>
    seoHead({
      title: "Aplicação",
      description: "Área autenticada.",
      path: "/app",
      noindex: true,
    }),
  component: SessionPage,
});
