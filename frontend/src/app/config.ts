import { z } from "zod";

const bool = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");
const originUrl = z
  .url()
  .refine(
    (value) => ["http:", "https:"].includes(new URL(value).protocol),
    "Use HTTP(S).",
  );
const schema = z.object({
  VITE_APP_NAME: z.string().default("DevStep Starter"),
  VITE_APP_VERSION: z.string().default("0.1.0"),
  VITE_API_URL: originUrl.default("http://localhost:8000/api/v1"),
  VITE_AUTH_URL: originUrl.optional(),
  VITE_AUTH_ME_PATH: z.string().default("/me"),
  VITE_AUTH_LOGIN_PATH: z.string().default("/login"),
  VITE_AUTH_LOGOUT_PATH: z.string().default("/logout"),
  VITE_AUTH_MFA_PATH: z.string().default("/two-factor-challenge"),
  VITE_ENABLE_MFA: bool,
  VITE_ENABLE_ANALYTICS: bool,
  VITE_ENABLE_MONITORING: bool,
  VITE_SENTRY_DSN: z.string().default(""),
  VITE_API_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(120_000)
    .default(15_000),
});

export function parseConfig(env: Record<string, unknown>) {
  const values = schema.parse(env);
  const apiUrl = new URL(values.VITE_API_URL);
  const authUrl = new URL(values.VITE_AUTH_URL || apiUrl.origin);
  for (const url of [apiUrl, authUrl]) {
    if (url.username || url.password || url.search || url.hash)
      throw new Error(
        "URLs da API não podem conter credenciais ou parâmetros.",
      );
  }
  if (apiUrl.origin !== authUrl.origin)
    throw new Error(
      "API e autenticação Sanctum devem usar a mesma origem de backend.",
    );
  return {
    name: values.VITE_APP_NAME,
    version: values.VITE_APP_VERSION,
    apiUrl: apiUrl.href.replace(/\/+$/, ""),
    authUrl: authUrl.href.replace(/\/+$/, ""),
    mePath: values.VITE_AUTH_ME_PATH,
    loginPath: values.VITE_AUTH_LOGIN_PATH,
    logoutPath: values.VITE_AUTH_LOGOUT_PATH,
    mfaPath: values.VITE_AUTH_MFA_PATH,
    mfaEnabled: values.VITE_ENABLE_MFA,
    analyticsEnabled: values.VITE_ENABLE_ANALYTICS,
    monitoringEnabled: values.VITE_ENABLE_MONITORING,
    sentryDsn: values.VITE_SENTRY_DSN,
    timeoutMs: values.VITE_API_TIMEOUT_MS,
  };
}
export const config = parseConfig(import.meta.env);
