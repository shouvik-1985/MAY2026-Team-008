import { useEffect, useState } from "react";
import type { RoleId } from "./campus-data";

const KEY = "cv-role";

export function getStoredRole(): RoleId | null {
  if (typeof window === "undefined") return null;
  return (window.localStorage.getItem(KEY) as RoleId | null) ?? null;
}

export function setStoredRole(role: RoleId) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, role);
}

export function clearStoredRole() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

export function useRole() {
  const [role, setRole] = useState<RoleId | null>(null);
  useEffect(() => setRole(getStoredRole()), []);
  return role;
}
