import { useEffect, useState } from "react";

type NavigatorWithHints = Navigator & {
  deviceMemory?: number;
  connection?: {
    saveData?: boolean;
    effectiveType?: string;
    addEventListener?: (type: "change", listener: () => void) => void;
    removeEventListener?: (type: "change", listener: () => void) => void;
  };
};

function envPerformanceOverride() {
  const mode = (import.meta.env.VITE_PERFORMANCE_MODE as string | undefined)?.toLowerCase();
  if (mode === "low") return true;
  if (mode === "high") return false;
  return undefined;
}

export function getLowPerformancePreference() {
  const forced = envPerformanceOverride();
  if (forced !== undefined) return forced;
  if (typeof window === "undefined") return false;

  const nav = window.navigator as NavigatorWithHints;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = Boolean(nav.connection?.saveData);
  const slowNetwork = ["slow-2g", "2g"].includes(nav.connection?.effectiveType ?? "");
  const lowMemory = typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4;
  const lowCpu = typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 4;

  return reducedMotion || saveData || slowNetwork || lowMemory || lowCpu;
}

export function useLowPerformanceMode() {
  const [lowPerformance, setLowPerformance] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const nav = window.navigator as NavigatorWithHints;
    const motionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setLowPerformance(getLowPerformancePreference());

    sync();
    motionMedia.addEventListener("change", sync);
    nav.connection?.addEventListener?.("change", sync);

    return () => {
      motionMedia.removeEventListener("change", sync);
      nav.connection?.removeEventListener?.("change", sync);
    };
  }, []);

  return lowPerformance;
}

export function PerformanceModeClass() {
  const lowPerformance = useLowPerformanceMode();

  useEffect(() => {
    if (typeof document === "undefined") return;

    document.documentElement.classList.toggle("cv-low-performance", lowPerformance);
    document.body.classList.toggle("cv-low-performance", lowPerformance);

    return () => {
      document.documentElement.classList.remove("cv-low-performance");
      document.body.classList.remove("cv-low-performance");
    };
  }, [lowPerformance]);

  return null;
}
