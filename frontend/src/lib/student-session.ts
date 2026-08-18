import { useEffect, useState } from "react";
import { getStudentDashboard, type StudentDashboard } from "./api";

const DASHBOARD_KEY = "cv-student-dashboard";
const DASHBOARD_SYNC_KEY = "cv-student-dashboard-synced-at";
const DASHBOARD_STALE_MS = 45_000;

let dashboardMemory: StudentDashboard | null = null;
let dashboardSyncedAt = 0;
let dashboardRequest: Promise<StudentDashboard> | null = null;

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
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DASHBOARD_KEY, JSON.stringify(dashboard));
  window.localStorage.setItem(DASHBOARD_SYNC_KEY, String(dashboardSyncedAt));
  window.dispatchEvent(new CustomEvent("cv-student-dashboard-updated", { detail: dashboard }));
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
