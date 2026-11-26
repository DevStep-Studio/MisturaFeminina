import { createFileRoute } from "@tanstack/solid-router";
import { AdminLayout } from "../../../features/admin/AdminLayout";
import { AdminAiMarketingAgentPanel } from "../../../features/admin/ai/AdminAiMarketingAgentPanel";
import { seoHead } from "../../../lib/seo";

export const Route = createFileRoute("/_authenticated/admin/marketing-google")({
  head: () =>
    seoHead({
      title: "Marketing e Google — Admin Mistura Feminina",
      description:
        "Acompanhamento de Google Analytics 4, Google Ads, Google Shopping / Merchant Center e Agente de Marketing.",
      path: "/admin/marketing-google",
      noindex: true,
    }),
  component: AdminMarketingGooglePage,
});

function AdminMarketingGooglePage() {
  return (
    <AdminLayout
      title="Marketing e Google"
      subtitle="Acompanhamento integrado de Google Analytics 4, Google Ads, Google Shopping / Merchant Center e Agente de Marketing com dados reais."
      permission="marketing.view"
    >
      <AdminAiMarketingAgentPanel />
    </AdminLayout>
  );
}
