import { motion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";

/** Shared cinematic background — aurora gradient + particles + grid + blur orbs. */
export function CinematicBackdrop({ intensity = 1 }: { intensity?: number }) {
  const [orbs] = useState(() =>
    Array.from({ length: 6 }).map((_, i) => ({
      id: i,
      top: `${10 + Math.random() * 70}%`,
      left: `${10 + Math.random() * 80}%`,
      size: 280 + Math.random() * 360,
      hue: [
        "oklch(0.65 0.28 305 / 0.35)",
        "oklch(0.72 0.27 350 / 0.30)",
        "oklch(0.82 0.18 200 / 0.25)",
        "oklch(0.85 0.12 60 / 0.25)",
      ][i % 4],
      delay: Math.random() * 6,
    })),
  );
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#050505]">
      <div className="absolute inset-0 grid-bg opacity-30" />
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
            filter: "blur(60px)",
            opacity: intensity,
          }}
          animate={{ x: [0, 30, -20, 0], y: [0, -40, 20, 0] }}
          transition={{
            duration: 18 + o.id * 3,
            repeat: Infinity,
            delay: o.delay,
            ease: "easeInOut",
          }}
        />
      ))}
      <Particles count={40} />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#050505]" />
    </div>
  );
}

export function Particles({ count = 40 }: { count?: number }) {
  const [pts] = useState(() =>
    Array.from({ length: count }).map(() => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      d: 6 + Math.random() * 14,
      s: Math.random() * 1.5 + 0.5,
    })),
  );
  return (
    <div className="absolute inset-0">
      {pts.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full bg-white"
          style={{ top: `${p.y}%`, left: `${p.x}%`, width: p.s, height: p.s, opacity: 0.5 }}
          animate={{ y: [0, -40, 0], opacity: [0.2, 0.9, 0.2] }}
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
  return (
    <motion.div
      whileHover={hover ? { y: -3, scale: 1.005 } : undefined}
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
        <div className="text-[10px] uppercase tracking-[0.4em] text-white/40 mb-3">{eyebrow}</div>
      )}
      <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight">{title}</h1>
      {sub && <p className="mt-3 text-white/55 max-w-2xl">{sub}</p>}
    </div>
  );
}

export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, filter: "blur(10px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -10, filter: "blur(8px)" }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
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
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / (duration * 1000));
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return (
    <span>
      {n}
      {suffix}
    </span>
  );
}
