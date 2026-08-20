import { useEffect, useState } from "react";
import { getStudentDashboard, type StudentDashboard } from "./api";

const DASHBOARD_KEY = "cv-student-dashboard";
const DASHBOARD_SYNC_KEY = "cv-student-dashboard-synced-at";
const DASHBOARD_STALE_MS = 45_000;
const STORAGE_RECOVERY_KEYS = [
  DASHBOARD_KEY,
  DASHBOARD_SYNC_KEY,
  "cv-user-avatar",
  "cv-student-assistant-chat",
  "profileDraft",
];

let dashboardMemory: StudentDashboard | null = null;
let dashboardSyncedAt = 0;
let dashboardRequest: Promise<StudentDashboard> | null = null;

function isInlineDataUrl(value?: string | null) {
  return Boolean(value && /^data:/i.test(value));
}

function serializeDashboardForStorage(dashboard: StudentDashboard) {
  return JSON.stringify(dashboard, (_key, value) => (isInlineDataUrl(value) ? null : value));
}

function isQuotaExceededError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: number; name?: string };
  return (
    candidate.name === "QuotaExceededError" ||
    candidate.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    candidate.code === 22 ||
    candidate.code === 1014
  );
}

function removeStorageRecoveryKeys() {
  for (const key of STORAGE_RECOVERY_KEYS) {
    window.localStorage.removeItem(key);
  }
}

function writeDashboardCache(payload: string) {
  window.localStorage.setItem(DASHBOARD_KEY, payload);
  window.localStorage.setItem(DASHBOARD_SYNC_KEY, String(dashboardSyncedAt));
}

export function getStoredDashboard(): StudentDashboard | null {
  if (dashboardMemory) return dashboardMemory;
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(DASHBOARD_KEY);
  if (!raw) return null;
  try {
    dashboardMemory = JSON.parse(raw) as StudentDashboard;
    dashboardSyncedAt = Number(window.localStorage.getItem(DASHBOARD_SYNC_KEY) ?? 0);
    return dashboardMemory;
  } catch {
    return null;
  }
}

export function setStoredDashboard(dashboard: StudentDashboard) {
  dashboardMemory = dashboard;
  dashboardSyncedAt = Date.now();
  if (typeof window !== "undefined") {
    const payload = serializeDashboardForStorage(dashboard);
    try {
      writeDashboardCache(payload);
    } catch (error) {
      if (isQuotaExceededError(error)) {
        removeStorageRecoveryKeys();
        try {
          writeDashboardCache(payload);
        } catch {
          window.localStorage.removeItem(DASHBOARD_KEY);
          window.localStorage.removeItem(DASHBOARD_SYNC_KEY);
        }
      }
    }
    window.dispatchEvent(new CustomEvent("cv-student-dashboard-updated", { detail: dashboard }));
  }
}

export function clearStoredDashboard() {
  dashboardMemory = null;
  dashboardSyncedAt = 0;
  dashboardRequest = null;
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(DASHBOARD_KEY);
  window.localStorage.removeItem(DASHBOARD_SYNC_KEY);
}

function shouldRefreshDashboard() {
  if (!dashboardMemory) return true;
  return Date.now() - dashboardSyncedAt > DASHBOARD_STALE_MS;
}

export function refreshStudentDashboard({ force = false }: { force?: boolean } = {}) {
  getStoredDashboard();
  if (!force && !shouldRefreshDashboard()) {
    return Promise.resolve(dashboardMemory as StudentDashboard);
  }
  if (!dashboardRequest) {
    dashboardRequest = getStudentDashboard()
      .then((data) => {
        setStoredDashboard(data);
        return data;
      })
      .finally(() => {
        dashboardRequest = null;
      });
  }
  return dashboardRequest;
}

export function useStudentDashboard() {
  const [dashboard, setDashboard] = useState<StudentDashboard | null>(() => getStoredDashboard());
  const [loading, setLoading] = useState(!dashboard);

  useEffect(() => {
    let mounted = true;

    refreshStudentDashboard()
      .then((data) => {
        if (!mounted) return;
        setDashboard(data);
      })
      .catch(() => {
        // Keep the cached dashboard visible; the next mounted shell/page can retry.
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<StudentDashboard>).detail;
      if (detail) setDashboard(detail);
    };

    window.addEventListener("cv-student-dashboard-updated", onUpdate);
    return () => {
      mounted = false;
      window.removeEventListener("cv-student-dashboard-updated", onUpdate);
    };
  }, []);

  return { dashboard, loading };
}
