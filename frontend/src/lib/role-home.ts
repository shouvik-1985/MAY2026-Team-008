import type { RoleId } from "./campus-data";

export function resolveRoleHome(role: RoleId | null | undefined) {
  if (role === "faculty") return "/professor" as const;
  if (role === "admin") return "/admin" as const;
  if (role === "placement") return "/placement" as const;
  return "/app" as const;
}
