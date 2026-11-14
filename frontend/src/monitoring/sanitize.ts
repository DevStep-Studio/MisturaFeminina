const allowedContext = new Set([
  "requestId",
  "status",
  "kind",
  "source",
  "level",
  "route",
  "version",
  "environment",
]);
export function sanitizeContext(
  context: Record<string, unknown> = {},
): Record<string, string | number | boolean> {
  const clean: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(context)) {
    if (!allowedContext.has(key)) continue;
    if (typeof value === "string")
      clean[key] = value
        .replace(/https?:\/\/[^\s]+/g, "[url]")
        .replace(/[\w.+-]+@[\w.-]+/g, "[email]")
        .slice(0, 200);
    else if (typeof value === "number" || typeof value === "boolean")
      clean[key] = value;
  }
  return clean;
}
export function safeRoute(pathname: string) {
  return [
    "/",
    "/login",
    "/app",
    "/forgot-password",
    "/reset-password",
    "/403",
    "/404",
  ].includes(pathname)
    ? pathname
    : "/404";
}
