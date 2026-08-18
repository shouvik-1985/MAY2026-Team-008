import { motion } from "framer-motion";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useLowPerformanceMode } from "@/lib/performance";
import { useTheme } from "@/lib/theme";

/** Shared cinematic background - aurora gradient + particles + grid + blur orbs. */
export function CinematicBackdrop({ intensity = 1 }: { intensity?: number }) {
  const lowPerformance = useLowPerformanceMode();
  const orbCount = lowPerformance ? 2 : 4;
  const particleCount = lowPerformance ? 6 : 24;
  const orbs = useMemo(
    () =>
      Array.from({ length: orbCount }).map((_, i) => ({
        id: i,
        top: `${10 + Math.random() * 70}%`,
        left: `${10 + Math.random() * 80}%`,
        size: lowPerformance ? 220 + Math.random() * 180 : 260 + Math.random() * 300,
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
            filter: `blur(${lowPerformance ? 34 : 48}px)`,
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
  style,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
  hover?: boolean;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  const lowPerformance = useLowPerformanceMode();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <motion.div
      whileHover={!lowPerformance && hover ? { y: -3, scale: 1.005 } : undefined}
      transition={{ type: "spring", stiffness: 280, damping: 24 }}
      onClick={onClick}
      style={style}
      className={`rounded-3xl p-6 ${isDark ? "glass-strong" : "border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.9),rgba(246,249,255,0.76))] shadow-[0_18px_50px_rgba(148,163,184,0.12)] backdrop-blur-[24px]"} ${glow ? "glow-purple" : ""} ${className}`}
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
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <div className="mb-8">
      {eyebrow && (
        <div className={`mb-3 text-[10px] uppercase tracking-[0.4em] ${isDark ? "text-white/40" : "text-slate-500"}`}>{eyebrow}</div>
      )}
      <h1 className={`bg-clip-text pb-1 font-display text-4xl font-bold tracking-tight text-transparent drop-shadow-sm md:text-5xl ${
        isDark
          ? "bg-gradient-to-br from-white via-white to-white/40"
          : "bg-gradient-to-br from-slate-900 via-indigo-700 to-fuchsia-500"
      }`}>{title}</h1>
      {sub && <p className={`mt-3 max-w-2xl ${isDark ? "text-white/55" : "text-slate-600"}`}>{sub}</p>}
    </div>
  );
}

export function PageTransition({ children }: { children: ReactNode }) {
  useLowPerformanceMode();
  return <>{children}</>;
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
