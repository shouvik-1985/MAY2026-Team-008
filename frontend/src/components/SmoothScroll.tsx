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
    const getLandingNavOffset = () => {
      const nav = document.querySelector<HTMLElement>("[data-landing-nav]");
      return (nav?.getBoundingClientRect().height ?? 80) + 12;
    };
    const handleLandingNavClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        window.location.pathname !== "/"
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLAnchorElement>("a[data-landing-nav-target]");
      const targetId = link?.dataset.landingNavTarget;
      if (!targetId) return;

      const section = document.getElementById(targetId);
      if (!section) return;

      event.preventDefault();
      lenis.scrollTo(targetId === "top" ? 0 : section, {
        offset: targetId === "top" ? 0 : -getLandingNavOffset(),
        duration: 0.85,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      });
    };
    let raf = 0;
    const tick = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    document.addEventListener("click", handleLandingNavClick, true);
    return () => {
      document.removeEventListener("click", handleLandingNavClick, true);
      cancelAnimationFrame(raf);
      lenis.destroy();
      document.documentElement.classList.remove(...LENIS_CLASSES);
      document.body.classList.remove(...LENIS_CLASSES);
    };
  }, []);
  return null;
}
