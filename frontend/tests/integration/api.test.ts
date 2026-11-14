import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, requestUrl } from "../../src/lib/api";
import { ApiError } from "../../src/lib/api-error";
import { shouldRetry } from "../../src/lib/query-client";

beforeEach(() => {
  vi.stubGlobal("document", { cookie: "XSRF-TOKEN=test%3Dtoken" });
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("window", new EventTarget());
});
afterEach(() => vi.useRealTimers());

describe("HTTP origin boundaries", () => {
  it.each(["https://evil.example", "//evil.example", "../login", "/\\evil"])(
    "rejects %s",
    (value) => expect(() => requestUrl(value)).toThrow(),
  );
  it("sends cookies only to configured origin, adds correlation and deduplicates reads", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);
    const [a, b] = await Promise.all([api("/projects"), api("/projects")]);
    expect(a).toEqual(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://localhost:8000/api/v1/projects",
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      credentials: "include",
      redirect: "error",
      headers: { "X-Request-ID": expect.any(String) },
    });
  });
});
it.each([400, 401, 403, 404, 419, 422, 429, 500, 503])(
  "normalizes HTTP %s without exposing server messages",
  async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: "secret",
            errors: { email: ["Inválido"] },
          }),
          { status },
        ),
      ),
    );
    const error = await api("/test", { authenticated: false }).catch(
      (error) => error,
    );
    expect(error).toBeInstanceOf(ApiError);
    if (!(error instanceof ApiError)) throw error;
    expect(error.status).toBe(status);
    expect(error.message).not.toContain("secret");
    if (status === 422)
      expect(error.validation).toEqual({ email: ["Inválido"] });
  },
);
it("obtains Sanctum CSRF before a write, decodes its cookie and never retries the write", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  await api("/login", {
    scope: "auth",
    method: "POST",
    body: { email: "ana@example.com", password: "not-a-real-password" },
    authenticated: false,
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[0][0]).toBe(
    "http://localhost:8000/sanctum/csrf-cookie",
  );
  expect(fetchMock.mock.calls[1][1].headers["X-XSRF-TOKEN"]).toBe("test=token");
});
it("separates timeout from caller cancellation", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url, options) =>
        new Promise((_resolve, reject) =>
          options.signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          ),
        ),
    ),
  );
  vi.useFakeTimers();
  const timeout = api("/slow", { timeoutMs: 100 }).catch((error) => error);
  await vi.advanceTimersByTimeAsync(101);
  expect(await timeout).toMatchObject({ kind: "timeout" });
  const controller = new AbortController();
  const cancelled = api("/slow", { signal: controller.signal }).catch(
    (error) => error,
  );
  controller.abort();
  expect(await cancelled).toMatchObject({ kind: "cancelled" });
});
it("distinguishes offline and malformed responses and does not retry authorization errors", async () => {
  vi.stubGlobal("navigator", { onLine: false });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
  );
  await expect(api("/offline")).rejects.toMatchObject({ kind: "offline" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json")));
  await expect(api("/malformed")).rejects.toMatchObject({
    kind: "invalid-response",
  });
  expect(shouldRetry(0, new ApiError("http", 401))).toBe(false);
  expect(shouldRetry(0, new ApiError("http", 503))).toBe(true);
  expect(shouldRetry(1, new ApiError("http", 503))).toBe(false);
});
