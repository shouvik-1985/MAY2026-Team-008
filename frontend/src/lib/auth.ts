import type { RoleId } from "./campus-data";

const TOKEN_KEY = "cv-access-token";
const USER_KEY = "cv-auth-user";
const DASHBOARD_KEY = "cv-student-dashboard";
const PROFILE_KEY = "cv-student-profile";
const PROFESSOR_PROFILE_KEY = "cv-professor-profile";
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

export function getTokenExpiry(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(`${TOKEN_KEY}-expires`);
}

export function isTokenExpired(): boolean {
  const expiry = getTokenExpiry();
  if (!expiry) return true;
  return new Date().getTime() > new Date(expiry).getTime();
}

export function shouldRefreshToken(): boolean {
  const expiry = getTokenExpiry();
  if (!expiry) return false;
  // Refresh if less than 5 minutes left
  const expiryTime = new Date(expiry).getTime();
  const fiveMinutesMs = 5 * 60 * 1000;
  return new Date().getTime() > expiryTime - fiveMinutesMs;
}

export function hasAuthSession(): boolean {
  const hasToken = Boolean(getAuthToken());
  return hasToken && !isTokenExpired();
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

export function setStoredUser(user: AuthUser) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function setAuthSession(auth: AuthResponse) {
  if (typeof window === "undefined") return;
  clearAttendancePresenceSession();
  window.localStorage.setItem(TOKEN_KEY, auth.access_token);
  window.localStorage.setItem(`${TOKEN_KEY}-expires`, auth.expires_at);
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
  window.localStorage.removeItem(`${TOKEN_KEY}-expires`);
  window.localStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(DASHBOARD_KEY);
  window.localStorage.removeItem(PROFILE_KEY);
  window.localStorage.removeItem(PROFESSOR_PROFILE_KEY);
}
