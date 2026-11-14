/** Permission identifiers come from the backend and can be extended by each application. */
export type Permission = string;
export function hasPermission(
  granted: readonly string[],
  required: Permission,
) {
  return granted.includes(required);
}
export function hasRole(roles: readonly string[], role: string) {
  return roles.includes(role);
}
