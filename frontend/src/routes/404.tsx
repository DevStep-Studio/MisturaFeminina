import { createFileRoute } from "@tanstack/solid-router";
import { StatusPage } from "../components/errors/status-page";
import { seoHead } from "../lib/seo";
export const Route = createFileRoute("/404")({
  head: () =>
    seoHead({
      title: "Página não encontrada",
      description: "O endereço solicitado não está disponível.",
      path: "/404",
      noindex: true,
    }),
  component: () => <StatusPage status={404} />,
});
