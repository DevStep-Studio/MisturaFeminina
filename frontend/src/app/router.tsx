import { LoadingState } from "../components/feedback/loading-state";
import { createRouter } from "@tanstack/solid-router";
import { routeTree } from "../routeTree.gen";
import { initializeAnalytics, trackPageView } from "../monitoring/analytics";
import { getCurrentUser } from "../security/auth";
import { resetSession, session } from "../security/session";

export const router = createRouter({
  routeTree,
  defaultPreload: false,
  scrollRestoration: true,
  defaultPendingMs: 0,
  defaultPendingMinMs: 150,
  defaultPendingComponent: LoadingState,
});
declare module "@tanstack/solid-router" {
  interface Register {
    router: typeof router;
  }
}

export function initializeNavigation() {
  const disposeAnalytics = initializeAnalytics();
  const unsubscribe = router.subscribe("onResolved", ({ toLocation }) =>
    trackPageView(toLocation.pathname),
  );
  let revalidating: Promise<void> | undefined;
  const revalidate = () => {
    if (session.status() === "locked") return;
    if (revalidating) return;
    revalidating = router
      .invalidate()
      .catch(() => {})
      .finally(() => {
        revalidating = undefined;
      });
  };
  const invalid = () => {
    resetSession(false, true);
    revalidate();
  };
  const forbidden = () => {
    void getCurrentUser()
      .catch(() => {})
      .finally(() => router.navigate({ to: "/403", replace: true }));
  };
  const visible = () => {
    if (document.visibilityState === "visible" && session.user()) revalidate();
  };
  window.addEventListener("session:invalid", invalid);
  window.addEventListener("session:forbidden", forbidden);
  document.addEventListener("visibilitychange", visible);
  const interval = setInterval(() => {
    if (session.user() && document.visibilityState === "visible") revalidate();
  }, 60_000);
  return () => {
    disposeAnalytics();
    unsubscribe();
    clearInterval(interval);
    window.removeEventListener("session:invalid", invalid);
    window.removeEventListener("session:forbidden", forbidden);
    document.removeEventListener("visibilitychange", visible);
  };
}
