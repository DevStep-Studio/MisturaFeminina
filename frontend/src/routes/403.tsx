import { createFileRoute } from "@tanstack/solid-router";
import { StatusPage } from "../components/errors/status-page";
import { seoHead } from "../lib/seo";
export const Route = createFileRoute("/403")({
  head: () =>
    seoHead({
      title: "Acesso negado",
      description: "Sua conta não pode acessar esta página.",
      path: "/403",
      noindex: true,
    }),
  component: () => <StatusPage status={403} />,
});
