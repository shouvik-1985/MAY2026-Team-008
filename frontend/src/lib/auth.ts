import type { RoleId } from "./campus-data";

const TOKEN_KEY = "cv-access-token";
const USER_KEY = "cv-auth-user";
const DASHBOARD_KEY = "cv-student-dashboard";
const ATTENDANCE_SESSION_PREFIX = "cv-attendance-";

export type AuthUser = {
  id: number;
  email: string;
  full_name: string;
  role: RoleId;
};

export type AuthResponse = {
  access_token: string;
  token_type: "bearer";
  expires_at: string;
  user: AuthUser;
};

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function hasAuthSession(): boolean {
  return Boolean(getAuthToken());
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setAuthSession(auth: AuthResponse) {
  if (typeof window === "undefined") return;
  clearAttendancePresenceSession();
  window.localStorage.setItem(TOKEN_KEY, auth.access_token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(auth.user));
}

export function clearAttendancePresenceSession() {
  if (typeof window === "undefined") return;
  const keysToRemove: string[] = [];
  for (let index = 0; index < window.sessionStorage.length; index += 1) {
    const key = window.sessionStorage.key(index);
    if (key?.startsWith(ATTENDANCE_SESSION_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => window.sessionStorage.removeItem(key));
}

export function clearAuthSession() {
  if (typeof window === "undefined") return;
  clearAttendancePresenceSession();
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(DASHBOARD_KEY);
}
