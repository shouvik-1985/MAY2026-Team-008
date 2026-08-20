import { useEffect } from "react";
import Lenis from "lenis";
import { getLowPerformancePreference } from "@/lib/performance";

const LENIS_CLASSES = ["lenis", "lenis-smooth", "lenis-scrolling", "lenis-stopped", "lenis-locked"];

export function SmoothScroll() {
  useEffect(() => {
    if (typeof window === "undefined" || getLowPerformancePreference()) return;

    const lenis = new Lenis({
      duration: 0.8,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      // If this instance outlives the landing route, leave dashboard wheel input native.
      virtualScroll: () => window.location.pathname === "/",
    });
    let raf = 0;
    const tick = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      document.documentElement.classList.remove(...LENIS_CLASSES);
      document.body.classList.remove(...LENIS_CLASSES);
    };
  }, []);
  return null;
}
