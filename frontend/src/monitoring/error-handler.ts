import { ApiError } from "../lib/api-error";
import { logger } from "./logger";
export function reportError(error: unknown, source: string) {
  if (
    error instanceof ApiError &&
    (error.kind === "cancelled" ||
      [400, 401, 403, 404, 419, 422, 429].includes(error.status))
  )
    return;
  logger.error(
    "Falha na aplicação",
    {
      source,
      ...(error instanceof ApiError
        ? { requestId: error.requestId, status: error.status, kind: error.kind }
        : {}),
    },
    error,
  );
}
export function initializeErrorHandlers() {
  const onError = (event: ErrorEvent) =>
    reportError(event.error || new Error("Erro global"), "window");
  const onRejection = (event: PromiseRejectionEvent) =>
    reportError(event.reason, "promise");
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
