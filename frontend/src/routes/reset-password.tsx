import { seoHead } from "../lib/seo";
import { createFileRoute } from "@tanstack/solid-router";
import { PasswordPage } from "../features/auth/components/password-page";
export const Route = createFileRoute("/reset-password")({
  head: () =>
    seoHead({
      title: "Redefinir senha",
      description: "Recuperação de acesso à conta.",
      path: "/reset-password",
      noindex: true,
    }),
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
    email: typeof search.email === "string" ? search.email : "",
  }),
  component: Page,
});
function Page() {
  const search = Route.useSearch();
  return <PasswordPage token={search().token} email={search().email} />;
}
