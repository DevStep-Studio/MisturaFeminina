import { render } from "solid-js/web";
import { RouterProvider } from "@tanstack/solid-router";
import { AppProviders } from "./providers";
import { router, initializeNavigation } from "./router";
import { initializeMonitoring } from "../monitoring/sentry";
import { initializeErrorHandlers } from "../monitoring/error-handler";

export async function bootstrap() {
  const disposeErrors = initializeErrorHandlers();
  const disposeNavigation = initializeNavigation();
  if (import.meta.hot)
    import.meta.hot.dispose(() => {
      disposeErrors();
      disposeNavigation();
    });
  const root = document.getElementById("root");
  if (!root) throw new Error("Elemento raiz não encontrado.");
  void initializeMonitoring();
  render(
    () => (
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    ),
    root,
  );
}
