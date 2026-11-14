import { createFileRoute } from "@tanstack/solid-router";
import { LoginPage } from "../features/auth/components/login-page";
import { safeRedirect } from "../security/safe-redirect";
import { seoHead } from "../lib/seo";
export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: safeRedirect(search.redirect),
  }),
  head: () =>
    seoHead({
      title: "Entrar",
      description: "Acesse sua conta.",
      path: "/login",
      noindex: true,
    }),
  component: LoginRoute,
});

function LoginRoute() {
  const search = Route.useSearch();
  return <LoginPage redirect={search().redirect} />;
}
