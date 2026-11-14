/** Only internal relative application routes are allowed as post-login destinations. */
export function safeRedirect(value: unknown): string {
  if (typeof value !== "string") return "/app";
  if (value.includes("\n") || value.includes("\r") || value.includes("\0")) {
    return "/app";
  }
  const trimmed = value.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\") ||
    trimmed.toLowerCase().includes("%2f%2f") ||
    trimmed.toLowerCase().includes("javascript:") ||
    trimmed.toLowerCase().includes("http:") ||
    trimmed.toLowerCase().includes("https:") ||
    trimmed === "/login" ||
    trimmed === "/entrar" ||
    trimmed.startsWith("/login?") ||
    trimmed.startsWith("/entrar?")
  ) {
    return "/app";
  }
  return trimmed;
}
