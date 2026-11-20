import { createFileRoute, Outlet, useRouter } from "@tanstack/solid-router";
import { Show, createEffect } from "solid-js";
import { requireUser } from "../security/guards";
import { AuthFrame } from "../features/auth/components/auth-frame";
import { LogoutButton } from "../features/auth/components/logout-button";
import { session } from "../security/session";
import { LoadingState } from "../components/feedback/loading-state";
import { ErrorState } from "../components/errors/error-state";
import { reportError } from "../monitoring/error-handler";
import { seoHead } from "../lib/seo";
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ location }) => requireUser(location.pathname),
  head: () => ({
    ...seoHead({
      title: "Aplicação",
      description: "Área autenticada.",
      path: "/app",
      noindex: true,
    }),
    links: [],
  }),
  pendingComponent: () => <LoadingState fullScreen message="Validando sua sessão…" />,
  errorComponent: (props) => {
    const router = useRouter();
    createEffect(() => reportError(props.error, "session"));
    return (
      <ErrorState
        title="Não foi possível validar sua sessão"
        error={props.error}
        retry={() => void router.invalidate()}
      />
    );
  },
  component: () => (
    <Show
      when={session.status() === "authenticated"}
      fallback={
        <Show
          when={session.status() === "locked"}
          fallback={<LoadingState fullScreen message="Validando sua sessão…" />}
        >
          <AuthFrame
            title="Sessão bloqueada"
            description="Conclua a saída para continuar."
          >
            <LogoutButton />
          </AuthFrame>
        </Show>
      }
    >
      <Outlet />
    </Show>
  ),
});
