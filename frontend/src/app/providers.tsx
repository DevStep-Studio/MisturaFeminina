import { ErrorBoundary } from "solid-js";
import type { ParentProps } from "solid-js";
import { QueryClientProvider } from "@tanstack/solid-query";
import { queryClient } from "../lib/query-client";
import { ErrorState } from "../components/errors/error-state";
import { reportError } from "../monitoring/error-handler";
export function AppProviders(props: ParentProps) {
  return (
    <ErrorBoundary
      fallback={(error, reset) => {
        reportError(error, "solid");
        return (
          <ErrorState title="Algo deu errado" error={error} retry={reset} />
        );
      }}
    >
      <QueryClientProvider client={queryClient}>
        {props.children}
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
