import type * as SentryTypes from "@sentry/browser";
import { config } from "../app/config";
import { safeRoute, sanitizeContext } from "./sanitize";
let sentry: typeof SentryTypes | undefined;
const seen = new WeakSet<object>();

export async function initializeMonitoring() {
  if (!config.monitoringEnabled || !config.sentryDsn || import.meta.env.DEV)
    return;
  try {
    sentry = await import("@sentry/browser");
    sentry.init({
      dsn: config.sentryDsn,
      environment: import.meta.env.MODE,
      release: config.version,
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
        stackFrameVariables: false,
        databaseQueryData: false,
        queues: false,
        graphQL: { document: false, variables: false },
        genAI: { inputs: false, outputs: false },
        mcp: { inputs: false, outputs: false },
      },
      defaultIntegrations: false,
      sendClientReports: false,
      beforeSend(event) {
        // Deliberately keep only technical frames and allowlisted diagnostic tags.
        return {
          type: event.type,
          event_id: event.event_id,
          timestamp: event.timestamp,
          platform: "javascript",
          environment: import.meta.env.MODE,
          release: config.version,
          level: event.level,
          message: "Falha na aplicação frontend",
          exception: event.exception
            ? {
                values: event.exception.values?.map((value) => ({
                  type: value.type,
                  value: "Detalhes da falha removidos por privacidade",
                  stacktrace: value.stacktrace
                    ? {
                        frames: value.stacktrace.frames?.map((frame) => ({
                          filename: frame.filename?.split(/[?#]/)[0],
                          function: frame.function,
                          lineno: frame.lineno,
                          colno: frame.colno,
                          in_app: frame.in_app,
                        })),
                      }
                    : undefined,
                })),
              }
            : undefined,
          tags: sanitizeContext(event.tags || {}),
          extra: sanitizeContext(event.extra || {}),
        };
      },
    });
  } catch {
    sentry = undefined; /* Monitoring failure must not prevent startup. */
  }
}
export function captureError(
  error: unknown,
  context: Record<string, unknown> = {},
) {
  if (error && typeof error === "object") {
    if (seen.has(error)) return;
    seen.add(error);
  }
  sentry?.captureException(
    error instanceof Error ? error : new Error("Falha não identificada"),
    {
      extra: sanitizeContext({
        ...context,
        route: safeRoute(window.location.pathname),
      }),
    },
  );
}
