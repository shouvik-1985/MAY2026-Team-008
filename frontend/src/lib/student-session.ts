import { useEffect, useState } from "react";
import { getStudentDashboard, type StudentDashboard } from "./api";

const DASHBOARD_KEY = "cv-student-dashboard";

export function getStoredDashboard(): StudentDashboard | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(DASHBOARD_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StudentDashboard;
  } catch {
    return null;
  }
}

export function setStoredDashboard(dashboard: StudentDashboard) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DASHBOARD_KEY, JSON.stringify(dashboard));
  window.dispatchEvent(new CustomEvent("cv-student-dashboard-updated", { detail: dashboard }));
}

export function clearStoredDashboard() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(DASHBOARD_KEY);
}

export function useStudentDashboard() {
  const [dashboard, setDashboard] = useState<StudentDashboard | null>(() => getStoredDashboard());
  const [loading, setLoading] = useState(!dashboard);

  useEffect(() => {
    let mounted = true;

    getStudentDashboard()
      .then((data) => {
        if (!mounted) return;
        setDashboard(data);
        setStoredDashboard(data);
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
