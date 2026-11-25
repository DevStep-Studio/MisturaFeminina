import { config } from "../app/config";
import { ApiError } from "./api-error";
export { ApiError };

export interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  scope?: "api" | "auth";
  authenticated?: boolean;
  timeoutMs?: number;
  csrf?: boolean;
}

export function requestUrl(path: string, scope: "api" | "auth" = "api") {
  if (
    /^[a-z][a-z\d+.-]*:/i.test(path) ||
    path.startsWith("//") ||
    path.includes("\\")
  )
    throw new Error("Use somente caminhos relativos do backend configurado.");
  const base = new URL(`${scope === "api" ? config.apiUrl : config.authUrl}/`);
  const url = new URL(path.replace(/^\/+/, ""), base);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname))
    throw new Error("Caminho fora da API configurada.");
  return url.href;
}

function csrfToken() {
  const cookie = document.cookie
    .split("; ")
    .find((value) => value.startsWith("XSRF-TOKEN="));
  try {
    return cookie
      ? decodeURIComponent(cookie.slice("XSRF-TOKEN=".length))
      : undefined;
  } catch {
    return undefined;
  }
}
let csrfPending: Promise<void> | undefined;
export function ensureCsrf() {
  return (csrfPending ??= baseApi<void>("/sanctum/csrf-cookie", {
    scope: "auth",
    authenticated: false,
    csrf: false,
  }).finally(() => {
    csrfPending = undefined;
  }));
}

async function waitForCsrf(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  let onAbort: () => void = () => {};
  try {
    await Promise.race([
      ensureCsrf(),
      new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(new DOMException("Aborted", "AbortError"));
        signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

const pendingGets = new Map<string, Promise<unknown>>();
function baseApi<T = unknown>(
  path: string,
  signalOrOptions: AbortSignal | ApiOptions = {},
): Promise<T> {
  const options: ApiOptions =
    signalOrOptions instanceof AbortSignal
      ? { signal: signalOrOptions }
      : signalOrOptions;
  const url = requestUrl(path, options.scope);
  const method = options.method || "GET";
  // TanStack Query deduplicates cancellable reads by key. Only share transport reads without a caller signal.
  const key = JSON.stringify([
    url,
    options.authenticated !== false,
    options.timeoutMs,
    options.headers,
  ]);
  if (method === "GET" && !options.signal) {
    const existing = pendingGets.get(key);
    if (existing) return existing as Promise<T>;
    const promise = performRequest<T>(url, options).finally(() =>
      pendingGets.delete(key),
    );
    pendingGets.set(key, promise);
    return promise;
  }
  return performRequest<T>(url, options);
}

async function performRequest<T>(url: string, options: ApiOptions): Promise<T> {
  const controller = new AbortController();
  const requestId = crypto.randomUUID();
  let timedOut = false;
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? config.timeoutMs);
  try {
    const method = options.method || "GET";
    const isFormData =
      typeof FormData !== "undefined" && options.body instanceof FormData;
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "X-Request-ID": requestId,
      ...(options.headers || {}),
    };
    if (method !== "GET") {
      if (options.csrf !== false) await waitForCsrf(controller.signal);
      if (controller.signal.aborted)
        throw new DOMException("Aborted", "AbortError");
      const token = csrfToken();
      if (!token && options.csrf !== false)
        throw new ApiError("http", 419, requestId);
      if (token) headers["X-XSRF-TOKEN"] = token;
      if (options.body !== undefined && !isFormData)
        headers["Content-Type"] = "application/json";
    }
    const response = await fetch(url, {
      method,
      headers,
      credentials: "include",
      signal: controller.signal,
      body:
        options.body === undefined
          ? undefined
          : isFormData
            ? (options.body as FormData)
            : JSON.stringify(options.body),
      redirect: "error",
    });
    if (!response.ok) {
      let validation: Record<string, string[]> = {};
      let redirectTo: string | undefined;
      if (response.status === 301 || response.status === 302) {
        const payload: unknown = await response.json().catch(() => undefined);
        if (
          payload &&
          typeof payload === "object" &&
          "redirect_to" in payload &&
          typeof payload.redirect_to === "string" &&
          payload.redirect_to.startsWith("/") &&
          !payload.redirect_to.startsWith("//")
        ) {
          redirectTo = payload.redirect_to;
        }
      }
      let parsedPayload: Record<string, unknown> | undefined;
      let serverMessage: string | undefined;
      if ([409, 422].includes(response.status)) {
        const raw: unknown = await response.json().catch(() => undefined);
        if (raw && typeof raw === "object") {
          parsedPayload = raw as Record<string, unknown>;
          if (
            response.status === 409 &&
            "message" in raw &&
            typeof raw.message === "string"
          ) {
            serverMessage = raw.message;
          }
          if (
            response.status === 422 &&
            "errors" in raw &&
            raw.errors &&
            typeof raw.errors === "object"
          ) {
            validation = Object.fromEntries(
              Object.entries(raw.errors).filter(
                (entry): entry is [string, string[]] =>
                  Array.isArray(entry[1]) &&
                  entry[1].every((value) => typeof value === "string"),
              ),
            );
          }
        }
      }
      const error = new ApiError(
        "http",
        response.status,
        response.headers.get("X-Request-ID") || requestId,
        validation,
        redirectTo,
        parsedPayload,
        serverMessage,
      );
      if (
        options.authenticated !== false &&
        [401, 403].includes(response.status)
      )
        window.dispatchEvent(
          new CustomEvent(
            response.status === 401 ? "session:invalid" : "session:forbidden",
          ),
        );
      throw error;
    }
    if (response.status === 204 || response.status === 205)
      return undefined as T;
    const text = await response.text();
    if (!text.trim()) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError("invalid-response", 0, requestId);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (timedOut) throw new ApiError("timeout", 0, requestId);
    if (controller.signal.aborted)
      throw new ApiError("cancelled", 0, requestId);
    throw new ApiError(
      navigator.onLine === false ? "offline" : "network",
      0,
      requestId,
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

export interface ApiClient {
  <T = unknown>(
    path: string,
    signalOrOptions?: AbortSignal | ApiOptions,
  ): Promise<T>;
  get<T = unknown>(
    path: string,
    queryOrOptions?: Record<string, unknown> | ApiOptions,
  ): Promise<T>;
  post<T = unknown>(
    path: string,
    body?: unknown,
    options?: ApiOptions,
  ): Promise<T>;
  put<T = unknown>(
    path: string,
    body?: unknown,
    options?: ApiOptions,
  ): Promise<T>;
  patch<T = unknown>(
    path: string,
    body?: unknown,
    options?: ApiOptions,
  ): Promise<T>;
  delete<T = unknown>(path: string, options?: ApiOptions): Promise<T>;
}

export const api: ApiClient = Object.assign(baseApi, {
  get<T = unknown>(
    path: string,
    queryOrOptions?: Record<string, unknown> | ApiOptions,
  ): Promise<T> {
    if (
      queryOrOptions &&
      !("method" in queryOrOptions) &&
      !(queryOrOptions instanceof AbortSignal)
    ) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(queryOrOptions)) {
        if (v !== undefined && v !== null && v !== "")
          params.append(k, String(v));
      }
      const q = params.toString();
      const fullPath = q
        ? `${path}${path.includes("?") ? "&" : "?"}${q}`
        : path;
      return baseApi<T>(fullPath, { method: "GET" });
    }
    return baseApi<T>(path, {
      ...(queryOrOptions as ApiOptions),
      method: "GET",
    });
  },
  post<T = unknown>(
    path: string,
    body?: unknown,
    options?: ApiOptions,
  ): Promise<T> {
    return baseApi<T>(path, { ...options, method: "POST", body });
  },
  put<T = unknown>(
    path: string,
    body?: unknown,
    options?: ApiOptions,
  ): Promise<T> {
    return baseApi<T>(path, { ...options, method: "PUT", body });
  },
  patch<T = unknown>(
    path: string,
    body?: unknown,
    options?: ApiOptions,
  ): Promise<T> {
    return baseApi<T>(path, { ...options, method: "PATCH", body });
  },
  delete<T = unknown>(path: string, options?: ApiOptions): Promise<T> {
    return baseApi<T>(path, { ...options, method: "DELETE" });
  },
});
