import { beforeEach, expect, it, vi } from "vitest";
import {
  acceptSession,
  clearPrivateCache,
  privateQueryKey,
  resetSession,
  session,
} from "../../src/security/session";
import { queryClient } from "../../src/lib/query-client";
import { getCurrentUser } from "../../src/security/auth";

const user = {
  id: 1,
  name: "Ana",
  permissions: ["projects.view"],
  roles: ["member"],
  workspace_id: "team-a",
};
beforeEach(() => {
  resetSession();
  queryClient.clear();
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("navigator", { onLine: true });
});
it("isolates private query keys and clears private data on identity, workspace or permission changes", () => {
  acceptSession(user);
  const key = privateQueryKey("projects");
  queryClient.setQueryDefaults(key, { meta: { private: true } });
  queryClient.setQueryData(key, [{ private: "team-a" }]);
  queryClient.setQueryData(["public"], "keep");
  acceptSession({ ...user, workspace_id: "team-b" });
  expect(queryClient.getQueryData(key)).toBeUndefined();
  expect(privateQueryKey("projects")).not.toEqual(key);
  expect(queryClient.getQueryData(["public"])).toBe("keep");
  clearPrivateCache();
  resetSession();
  expect(() => privateQueryKey("projects")).toThrow();
});
it("deduplicates session validation and accepts only a backend response", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(user)));
  vi.stubGlobal("fetch", fetchMock);
  const [a, b] = await Promise.all([getCurrentUser(), getCurrentUser()]);
  expect(a).toEqual(b);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(session.status()).toBe("authenticated");
});
it("invalid sessions become anonymous and unavailability is kept separate", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
  );
  expect(await getCurrentUser()).toBeNull();
  expect(session.status()).toBe("anonymous");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
  );
  await expect(getCurrentUser()).rejects.toMatchObject({ status: 503 });
  expect(session.status()).toBe("unavailable");
});

it("keeps a validated session available during background checks and clears it on failure", async () => {
  acceptSession(user);
  let resolveResponse!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    ),
  );
  const check = getCurrentUser();
  expect(session.status()).toBe("authenticated");
  expect(privateQueryKey("projects")[1]).toBe(String(user.id));
  resolveResponse(new Response(null, { status: 401 }));
  await expect(check).resolves.toBeNull();
  expect(session.user()).toBeNull();
  expect(session.status()).toBe("anonymous");
  expect(() => privateQueryKey("projects")).toThrow();
});
