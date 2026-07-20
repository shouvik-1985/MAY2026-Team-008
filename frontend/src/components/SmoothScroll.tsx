import { useEffect } from "react";
import Lenis from "lenis";
import { getLowPerformancePreference } from "@/lib/performance";

export function SmoothScroll() {
  useEffect(() => {
    if (typeof window === "undefined" || getLowPerformancePreference()) return;

    const lenis = new Lenis({
      duration: 0.8,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
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
    };
  }, []);
  return null;
}
