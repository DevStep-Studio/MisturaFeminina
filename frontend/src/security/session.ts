import { createSignal, batch } from "solid-js";
import type { User } from "../features/auth/types/auth";
import { queryClient } from "../lib/query-client";

export type SessionStatus =
  | "unknown"
  | "checking"
  | "authenticated"
  | "anonymous"
  | "unavailable"
  | "locked";
const [user, setUser] = createSignal<User | null>(null);
const [status, setStatus] = createSignal<SessionStatus>("unknown");
const [error, setError] = createSignal<unknown>();
const [expired, setExpired] = createSignal(false);
export const session = { user, status, error, expired };
let revision = 0;
export const sessionRevision = () => revision;

function identity(value: User | null) {
  return value
    ? JSON.stringify([
        value.id,
        value.workspace_id,
        [...value.roles].sort(),
        [...value.permissions].sort(),
      ])
    : "anonymous";
}
export function clearPrivateCache() {
  void queryClient.cancelQueries({
    predicate: (query) => query.meta?.private === true,
  });
  queryClient.removeQueries({
    predicate: (query) => query.meta?.private === true,
  });
}
export function beginSessionCheck() {
  if (!user() || status() !== "authenticated") setStatus("checking");
  setError(undefined);
}
export function acceptSession(next: User | null) {
  if (!next && user()) setExpired(true);
  if (next) setExpired(false);
  if (identity(user()) !== identity(next)) clearPrivateCache();
  batch(() => {
    setUser(next);
    setStatus(next ? "authenticated" : "anonymous");
    setError(undefined);
  });
}
export function failSession(reason: unknown) {
  clearPrivateCache();
  batch(() => {
    setUser(null);
    setStatus("unavailable");
    setError(reason);
  });
}
export function resetSession(locked = false, wasExpired = false) {
  setExpired(wasExpired);
  revision++;
  clearPrivateCache();
  batch(() => {
    setUser(null);
    setStatus(locked ? "locked" : "anonymous");
    setError(undefined);
  });
}
export function privateQueryKey(feature: string) {
  const current = user();
  if (!current || status() !== "authenticated")
    throw new Error("Uma sessão validada é necessária.");
  return [
    "private",
    String(current.id),
    current.workspace_id === null ? null : String(current.workspace_id),
    feature,
  ] as const;
}
