import { createEffect } from "solid-js";
import {
  createRootRoute,
  HeadContent,
  Outlet,
  useRouter,
} from "@tanstack/solid-router";
import { ConsentBanner } from "../components/privacy/consent-banner";
import { NetworkStatus } from "../components/feedback/network-status";
import { ErrorState } from "../components/errors/error-state";
import { StatusPage } from "../components/errors/status-page";
import { LoadingState } from "../components/feedback/loading-state";
import { reportError } from "../monitoring/error-handler";
import { seoHead } from "../lib/seo";
export const Route = createRootRoute({
  head: () => ({
    ...seoHead({
      title: "Página não encontrada",
      description: "O endereço solicitado não está disponível.",
      path: "/404",
      noindex: true,
    }),
    links: [],
  }),
  component: () => (
    <>
      <HeadContent />
      <NetworkStatus />
      <main class="min-h-svh bg-white font-sans text-zinc-900">
        <Outlet />
      </main>
      <ConsentBanner />
    </>
  ),
  pendingComponent: LoadingState,
  notFoundComponent: () => <StatusPage status={404} />,
  errorComponent: (props) => {
    const router = useRouter();
    createEffect(() => reportError(props.error, "router"));
    return (
      <ErrorState
        title="Algo deu errado"
        error={props.error}
        retry={() => void router.invalidate()}
      />
    );
  },
});
