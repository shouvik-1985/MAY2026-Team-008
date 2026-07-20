import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { getLowPerformancePreference } from "@/lib/performance";

const CINEMATIC_CURSOR_ROUTES = new Set(["/", "/login"]);

export function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [isDesktop, setIsDesktop] = useState(false);
  const enabled = isDesktop && CINEMATIC_CURSOR_ROUTES.has(pathname);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(min-width: 769px) and (hover: hover) and (pointer: fine)");
    const motionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncDesktop = () => setIsDesktop(media.matches && !getLowPerformancePreference());
    syncDesktop();

    media.addEventListener("change", syncDesktop);
    motionMedia.addEventListener("change", syncDesktop);
    return () => {
      media.removeEventListener("change", syncDesktop);
      motionMedia.removeEventListener("change", syncDesktop);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle("cv-cursor-enabled", enabled);

    return () => {
      document.body.classList.remove("cv-cursor-enabled");
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;
    let rx = mx;
    let ry = my;

    const syncDot = () => {
      if (dotRef.current) {
        dotRef.current.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
      }
    };

    const syncRing = () => {
      if (ringRef.current) {
        ringRef.current.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
      }
    };

    syncDot();
    syncRing();

    const onMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
      syncDot();

      const target = e.target;
      const interactive =
        target instanceof HTMLElement
          ? target.closest(
              "a, button, input, textarea, select, label, [role='button'], [data-cursor='hover']",
            )
          : null;

      dotRef.current?.classList.toggle("hover", !!interactive);
      ringRef.current?.classList.toggle("hover", !!interactive);
    };

    let raf = 0;
    const tick = () => {
      rx += (mx - rx) * 0.18;
      ry += (my - ry) * 0.18;
      syncRing();
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    window.addEventListener("mousemove", onMove);

    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <>
      <div ref={ringRef} className="cv-cursor-ring" />
      <div ref={dotRef} className="cv-cursor" />
    </>
  );
}
