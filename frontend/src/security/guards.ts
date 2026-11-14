import { redirect } from "@tanstack/solid-router";
import { getCurrentUser } from "./auth";
import { hasPermission } from "./permissions";
import type { Permission } from "./permissions";
import { safeRedirect } from "./safe-redirect";
import type { User } from "../features/auth/types/auth";

export async function requireUser(path: string) {
  const user = await getCurrentUser();
  if (!user)
    throw redirect({
      to: "/login",
      search: { redirect: safeRedirect(path) },
      replace: true,
    });
  return { user };
}
export function requirePermission(user: User, permission: Permission) {
  if (!hasPermission(user.permissions, permission))
    throw redirect({ to: "/403", replace: true });
}
