/** Only explicit private routes can be used as post-login destinations. */
export function safeRedirect(value: unknown): "/app" {
  return value === "/app" ? value : "/app";
}
