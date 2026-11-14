import { captureError } from "./sentry";
import { sanitizeContext } from "./sanitize";
type Level = "debug" | "info" | "warn" | "error" | "fatal";
function log(
  level: Level,
  message: string,
  context: Record<string, unknown> = {},
  error?: unknown,
) {
  const clean = sanitizeContext(context);
  if (import.meta.env.DEV) {
    const method = level === "fatal" ? "error" : level;
    console[method]({ level, message, ...clean });
  }
  if (["warn", "error", "fatal"].includes(level))
    captureError(error || new Error("Evento de diagnóstico"), {
      ...clean,
      level,
    });
}
export const logger = {
  debug: (message: string, context?: Record<string, unknown>) =>
    log("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) =>
    log("info", message, context),
  warn: (message: string, context?: Record<string, unknown>, error?: unknown) =>
    log("warn", message, context, error),
  error: (
    message: string,
    context?: Record<string, unknown>,
    error?: unknown,
  ) => log("error", message, context, error),
  fatal: (
    message: string,
    context?: Record<string, unknown>,
    error?: unknown,
  ) => log("fatal", message, context, error),
};
