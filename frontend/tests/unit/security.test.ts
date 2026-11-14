import { describe, expect, it } from "vitest";
import { safeRedirect } from "../../src/security/safe-redirect";
import { hasPermission, hasRole } from "../../src/security/permissions";
import {
  loginSchema,
  mfaSchema,
  sessionSchema,
} from "../../src/features/auth/schemas/auth.schema";
import { sanitizeContext, safeRoute } from "../../src/monitoring/sanitize";
import { siteSettings } from "../../src/lib/site";
import { parseConfig } from "../../src/app/config";

describe("safe return paths", () => {
  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "/projects?redirect=https://evil.example",
    "/%2f%2fevil",
    "/login",
    "\n/projects",
    null,
    {},
  ])("rejects unsafe value %s", (value) =>
    expect(safeRedirect(value)).toBe("/app"),
  );
  it.each(["/app", "/admin", "/admin/pedidos", "/minha-conta"])(
    "allows %s",
    (path) => expect(safeRedirect(path)).toBe(path),
  );
});
it("permission and role checks are explicit and fail closed", () => {
  expect(hasPermission([], "projects.view")).toBe(false);
  expect(hasPermission(["*", "admin"], "projects.view")).toBe(false);
  expect(hasPermission(["projects.view"], "projects.view")).toBe(true);
  expect(hasRole(["admin"], "admin")).toBe(true);
});
it("validates credentials, MFA and backend identities without persisting credentials", () => {
  expect(loginSchema.safeParse({ email: "bad", password: "" }).success).toBe(
    false,
  );
  expect(mfaSchema.safeParse({ code: "123456" }).success).toBe(true);
  expect(mfaSchema.safeParse({ code: "123" }).success).toBe(false);
  expect(
    sessionSchema.parse({ data: { id: 1, name: "Ana" } }).permissions,
  ).toEqual([]);
  expect(sessionSchema.safeParse({ name: "Ana" }).success).toBe(false);
});
it("removes sensitive logging data and normalizes unknown routes", () => {
  expect(
    sanitizeContext({
      password: "secret",
      token: "secret",
      email: "ana@example.com",
      requestId: "id-1",
      status: 500,
    }),
  ).toEqual({ requestId: "id-1", status: 500 });
  expect(
    sanitizeContext({
      source: "ana@example.com https://site.example/?token=secret",
    }).source,
  ).toBe("[email] [url]");
  expect(safeRoute("/users/ana@example.com")).toBe("/404");
});
it("rejects invalid configuration and keeps staging unindexed", () => {
  expect(
    siteSettings(
      { VITE_SITE_URL: "https://site.example", VITE_SITE_INDEXABLE: "true" },
      true,
    ).indexable,
  ).toBe(false);
  expect(() =>
    parseConfig({
      VITE_API_URL: "https://api.example/api",
      VITE_AUTH_URL: "https://other.example",
    }),
  ).toThrow();
  expect(() =>
    siteSettings({ VITE_SITE_URL: "https://user:secret@site.example" }),
  ).toThrow();
});
