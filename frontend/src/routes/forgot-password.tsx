import { seoHead } from "../lib/seo";
import { createFileRoute } from "@tanstack/solid-router";
import { PasswordPage } from "../features/auth/components/password-page";
export const Route = createFileRoute("/forgot-password")({
  head: () =>
    seoHead({
      title: "Recuperar senha",
      description: "Recuperação de acesso à conta.",
      path: "/forgot-password",
      noindex: true,
    }),
  component: PasswordPage,
});
