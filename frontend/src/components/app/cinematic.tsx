import { motion } from "framer-motion";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLowPerformanceMode } from "@/lib/performance";

/** Shared cinematic background - aurora gradient + particles + grid + blur orbs. */
export function CinematicBackdrop({ intensity = 1 }: { intensity?: number }) {
  const lowPerformance = useLowPerformanceMode();
  const orbCount = lowPerformance ? 3 : 6;
  const particleCount = lowPerformance ? 10 : 40;
  const orbs = useMemo(
    () =>
      Array.from({ length: orbCount }).map((_, i) => ({
        id: i,
        top: `${10 + Math.random() * 70}%`,
        left: `${10 + Math.random() * 80}%`,
        size: lowPerformance ? 240 + Math.random() * 220 : 280 + Math.random() * 360,
        hue: [
          "oklch(0.65 0.28 305 / 0.35)",
          "oklch(0.72 0.27 350 / 0.30)",
          "oklch(0.82 0.18 200 / 0.25)",
          "oklch(0.85 0.12 60 / 0.25)",
        ][i % 4],
        delay: Math.random() * 6,
      })),
    [lowPerformance, orbCount],
  );

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#050505]">
      <div className={`absolute inset-0 grid-bg ${lowPerformance ? "opacity-20" : "opacity-30"}`} />
      {orbs.map((o) => (
        <motion.div
          key={o.id}
          className="absolute rounded-full"
          style={{
            top: o.top,
            left: o.left,
            width: o.size,
            height: o.size,
            background: `radial-gradient(circle, ${o.hue}, transparent 65%)`,
            filter: `blur(${lowPerformance ? 38 : 60}px)`,
            opacity: lowPerformance ? intensity * 0.7 : intensity,
          }}
          animate={lowPerformance ? undefined : { x: [0, 30, -20, 0], y: [0, -40, 20, 0] }}
          transition={{
            duration: 18 + o.id * 3,
            repeat: Infinity,
            delay: o.delay,
            ease: "easeInOut",
          }}
        />
      ))}
      <Particles count={particleCount} staticMode={lowPerformance} />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#050505]" />
    </div>
  );
}

export function Particles({
  count = 40,
  staticMode = false,
}: {
  count?: number;
  staticMode?: boolean;
}) {
  const pts = useMemo(
    () =>
      Array.from({ length: count }).map(() => ({
        x: Math.random() * 100,
        y: Math.random() * 100,
        d: 6 + Math.random() * 14,
        s: Math.random() * 1.5 + 0.5,
      })),
    [count],
  );

  return (
    <div className="absolute inset-0">
      {pts.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full bg-white"
          style={{ top: `${p.y}%`, left: `${p.x}%`, width: p.s, height: p.s, opacity: 0.5 }}
          animate={staticMode ? undefined : { y: [0, -40, 0], opacity: [0.2, 0.9, 0.2] }}
          transition={{ duration: p.d, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

export function GlassCard({
  children,
  className = "",
  glow = false,
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
  hover?: boolean;
}) {
  const lowPerformance = useLowPerformanceMode();

  return (
    <motion.div
      whileHover={!lowPerformance && hover ? { y: -3, scale: 1.005 } : undefined}
      transition={{ type: "spring", stiffness: 280, damping: 24 }}
      className={`glass-strong rounded-3xl p-6 ${glow ? "glow-purple" : ""} ${className}`}
    >
      {children}
    </motion.div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  sub,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="mb-8">
      {eyebrow && (
        <div className="mb-3 text-[10px] uppercase tracking-[0.4em] text-white/40">{eyebrow}</div>
      )}
      <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl">{title}</h1>
      {sub && <p className="mt-3 max-w-2xl text-white/55">{sub}</p>}
    </div>
  );
}

export function PageTransition({ children }: { children: ReactNode }) {
  const lowPerformance = useLowPerformanceMode();

  return (
    <motion.div
      initial={lowPerformance ? { opacity: 0 } : { opacity: 0, y: 18, filter: "blur(10px)" }}
      animate={lowPerformance ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={lowPerformance ? { opacity: 0 } : { opacity: 0, y: -10, filter: "blur(8px)" }}
      transition={{ duration: lowPerformance ? 0.16 : 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function Counter({
  value,
  suffix = "",
  duration = 1.2,
}: {
  value: number;
  suffix?: string;
  duration?: number;
}) {
  const [n, setN] = useState(0);
  const lowPerformance = useLowPerformanceMode();

  useEffect(() => {
    if (lowPerformance) {
      setN(Math.round(value));
      return;
    }

    let raf = 0;
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / (duration * 1000));
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, lowPerformance]);

  return (
    <span>
      {n}
      {suffix}
    </span>
  );
}
