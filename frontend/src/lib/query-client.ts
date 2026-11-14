import { MutationCache, QueryCache, QueryClient } from "@tanstack/solid-query";
import { ApiError } from "./api-error";
import { reportError } from "../monitoring/error-handler";
export function shouldRetry(failureCount: number, error: unknown) {
  return (
    failureCount < 1 &&
    (!(error instanceof ApiError) ||
      (error.kind !== "cancelled" &&
        (error.status === 0 || error.status >= 500)))
  );
}
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => reportError(error, "query"),
  }),
  mutationCache: new MutationCache({
    onError: (error) => reportError(error, "mutation"),
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: shouldRetry,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
});
