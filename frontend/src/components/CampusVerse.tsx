import {
  motion,
  useScroll,
  useTransform,
  useMotionValue,
  useSpring,
  animate,
  useInView,
  AnimatePresence,
  type MotionValue,
} from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowDown,
  Sparkles,
  Mic,
  Send,
  GraduationCap,
  Building2,
  BookOpen,
  Calendar,
  Wallet,
  Award,
  ShoppingBag,
  MessageSquare,
  Brain,
  Bell,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Library,
  FlaskConical,
  Home,
  Users,
  ChevronRight,
  Plus,
  Play,
} from "lucide-react";

/* ---------- shared ---------- */

function Magnetic({ children, strength = 0.3 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useSpring(useMotionValue(0), { stiffness: 150, damping: 15 });
  const y = useSpring(useMotionValue(0), { stiffness: 150, damping: 15 });
  return (
    <motion.div
      ref={ref}
      style={{ x, y }}
      onMouseMove={(e) => {
        const r = ref.current!.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

function GradientButton({
  children,
  variant = "primary",
  icon: Icon,
  to,
}: {
  children: ReactNode;
  variant?: "primary" | "ghost" | "outline";
  icon?: typeof ArrowRight;
  to?: string;
}) {
  const base =
    "group relative inline-flex items-center gap-3 px-7 py-4 rounded-full text-sm font-medium tracking-wide uppercase transition-all overflow-hidden";
  const Inner = ({ className, children: c }: { className: string; children: ReactNode }) =>
    to ? (
      <Link to={to} data-cursor="hover" className={className}>
        {c}
      </Link>
    ) : (
      <button data-cursor="hover" className={className}>
        {c}
      </button>
    );
  if (variant === "primary") {
    return (
      <Magnetic>
        <Inner className={`${base} text-white`}>
          <span
            className="absolute inset-0 rounded-full"
            style={{
              background: "var(--grad-aurora)",
              backgroundSize: "200% 200%",
              animation: "aurora-shift 6s ease-in-out infinite",
            }}
          />
          <span className="absolute inset-px rounded-full bg-[#0a0a0a]/40" />
          <span
            className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition"
            style={{ boxShadow: "0 0 60px oklch(0.7 0.27 320 / 0.8)" }}
          />
          <span className="relative z-10">{children}</span>
          {Icon && (
            <Icon className="relative z-10 size-4 transition-transform group-hover:translate-x-1" />
          )}
        </Inner>
      </Magnetic>
    );
  }
  if (variant === "outline") {
    return (
      <Magnetic>
        <Inner className={`${base} glass text-white hover:border-white/30`}>
          <span className="relative z-10">{children}</span>
          {Icon && (
            <Icon className="relative z-10 size-4 transition-transform group-hover:translate-x-1" />
          )}
        </Inner>
      </Magnetic>
    );
  }
  return (
    <Inner className={`${base} text-white/70 hover:text-white`}>
      <span>{children}</span>
      {Icon && <Icon className="size-4" />}
    </Inner>
  );
}

function SectionLabel({ index, children }: { index: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-white/40 mb-6">
      <span className="font-mono text-white/30">{index}</span>
      <span className="h-px w-12 bg-gradient-to-r from-white/30 to-transparent" />
      <span>{children}</span>
    </div>
  );
}

const heroTitleClass =
  "font-display uppercase font-bold leading-[0.85] tracking-tight text-balance min-w-0 text-[clamp(3.25rem,7.5vw,7.5rem)] md:text-[clamp(4.25rem,8.5vw,8.75rem)]";
const sectionTitleClass =
  "font-display uppercase font-bold leading-[0.9] tracking-tight text-balance min-w-0 text-[clamp(2.5rem,4.6vw,4.6rem)] md:text-[clamp(3rem,5.4vw,6rem)]";
const featureTitleClass =
  "font-display uppercase font-bold leading-[0.92] tracking-[-0.04em] whitespace-nowrap min-w-max text-[clamp(3rem,5vw,5.5rem)] md:text-[clamp(4rem,6.5vw,7.5rem)]";
const finalTitleClass =
  "font-display uppercase font-bold leading-[0.85] tracking-tight text-balance min-w-0 text-[clamp(3.25rem,6.5vw,7rem)] md:text-[clamp(4.25rem,8vw,8.5rem)]";

/* ---------- background layers ---------- */

function AuroraBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-40" />
      <div
        className="absolute -top-40 -left-40 w-[700px] h-[700px] rounded-full blur-[120px] opacity-30 float-slow"
        style={{
          background: "radial-gradient(circle, oklch(0.65 0.28 305 / 0.8), transparent 70%)",
        }}
      />
      <div
        className="absolute top-1/3 -right-40 w-[600px] h-[600px] rounded-full blur-[120px] opacity-25 float-slow"
        style={{
          background: "radial-gradient(circle, oklch(0.65 0.25 260 / 0.8), transparent 70%)",
          animationDelay: "-4s",
        }}
      />
      <div
        className="absolute bottom-0 left-1/3 w-[800px] h-[800px] rounded-full blur-[140px] opacity-20 float-slow"
        style={{
          background: "radial-gradient(circle, oklch(0.78 0.18 50 / 0.6), transparent 70%)",
          animationDelay: "-8s",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>\")",
        }}
      />
    </div>
  );
}

function Particles({ count = 40 }: { count?: number }) {
  const items = Array.from({ length: count }, (_, i) => i);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {items.map((i) => {
        const left = (i * 53.7) % 100;
        const top = (i * 31.3) % 100;
        const size = (i % 4) + 1;
        const dur = 8 + (i % 7);
        const delay = -(i % 10);
        return (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: size,
              height: size,
              background:
                i % 3 === 0
                  ? "oklch(0.82 0.18 200)"
                  : i % 3 === 1
                    ? "oklch(0.7 0.27 320)"
                    : "oklch(0.78 0.18 50)",
              boxShadow: "0 0 10px currentColor",
              color:
                i % 3 === 0
                  ? "oklch(0.82 0.18 200)"
                  : i % 3 === 1
                    ? "oklch(0.7 0.27 320)"
                    : "oklch(0.78 0.18 50)",
              animation: `breathe ${dur}s ease-in-out ${delay}s infinite`,
              opacity: 0.6,
            }}
          />
        );
      })}
    </div>
  );
}

/* ---------- NAV ---------- */

function Nav() {
  const { scrollY } = useScroll();
  const op = useTransform(scrollY, [0, 200], [0, 1]);
  return (
    <motion.nav style={{ opacity: op }} className="fixed top-0 inset-x-0 z-[100] px-6 lg:px-10 pt-5">
      <div className="glass-nav mx-auto max-w-7xl rounded-full px-5 py-3 flex items-center justify-between">
        <a
          href="#top"
          data-cursor="hover"
          className="flex items-center gap-2 text-sm font-display tracking-[0.25em] uppercase"
        >
          <span
            className="inline-block size-2 rounded-full"
            style={{ background: "var(--grad-aurora)", boxShadow: "0 0 12px oklch(0.7 0.27 320)" }}
          />
          CampusVerse
        </a>
        <div className="hidden md:flex items-center gap-7 text-xs uppercase tracking-[0.25em] text-white/90 font-medium">
          {["Ecosystem", "AI", "Features", "Twin", "Journey"].map((l) => (
            <a
              key={l}
              href={`#${l.toLowerCase()}`}
              data-cursor="hover"
              className="hover:text-white transition"
            >
              {l}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <GradientButton variant="primary" icon={ArrowRight} to="/login">
            Get Started
          </GradientButton>
        </div>
      </div>
    </motion.nav>
  );
}

function ProblemTile({
  label,
  xOffset,
  yOffset,
  index,
  progress,
}: {
  label: string;
  xOffset: number;
  yOffset: number;
  index: number;
  progress: MotionValue<number>;
}) {
  const x = useTransform(progress, [0, 1], [`${xOffset * 0.2}vw`, `${xOffset * 1.6}vw`]);
  const y = useTransform(progress, [0, 1], [`${yOffset * 0.2}vh`, `${yOffset * 1.4}vh`]);
  const rotate = useTransform(progress, [0, 1], [0, (index % 2 ? 1 : -1) * 25]);

  return (
    <motion.div
      style={{ x, y, rotate, left: "50%", top: "50%" }}
      className="absolute -translate-x-1/2 -translate-y-1/2 glass rounded-xl px-4 py-2 text-xs uppercase tracking-widest text-white/70 whitespace-nowrap"
    >
      {label}
    </motion.div>
  );
}

/* ---------- HERO ---------- */

function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const logoScale = useTransform(scrollYProgress, [0, 0.3, 0.6], [1, 6, 14]);
  const logoOpacity = useTransform(scrollYProgress, [0, 0.35, 0.55], [1, 0.6, 0]);
  const headlineY = useTransform(scrollYProgress, [0, 0.5], [60, -40]);
  const headlineOpacity = useTransform(scrollYProgress, [0.05, 0.25, 0.7, 0.95], [0, 1, 1, 0]);
  const bgScale = useTransform(scrollYProgress, [0, 1], [1, 1.3]);
  const bgOpacity = useTransform(scrollYProgress, [0, 0.15, 0.8], [0, 1, 0.6]);

  const [phase, setPhase] = useState<"black" | "logo" | "reveal">("black");
  useEffect(() => {
    const t1 = setTimeout(() => setPhase("logo"), 250);
    const t2 = setTimeout(() => setPhase("reveal"), 1700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const title = ["WELCOME", "TO THE", "DIGITAL", "UNIVERSITY"];

  return (
    <section id="top" ref={ref} className="relative h-[220vh]">
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        {/* Cinematic background */}
        <motion.div style={{ scale: bgScale, opacity: bgOpacity }} className="absolute inset-0">
          <HeroBackdrop />
        </motion.div>

        {/* Black overlay during initial phase */}
        <AnimatePresence>
          {phase === "black" && (
            <motion.div
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
              className="absolute inset-0 bg-black z-30"
            />
          )}
        </AnimatePresence>

        {/* Logo */}
        <motion.div
          style={{ scale: logoScale, opacity: logoOpacity }}
          className="absolute inset-0 z-20 flex items-center justify-center"
        >
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={phase !== "black" ? { scale: 1, opacity: 1 } : {}}
            transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-4"
          >
            <div className="relative">
              <div
                className="size-16 md:size-20 rounded-2xl"
                style={{ background: "var(--grad-aurora)", boxShadow: "var(--shadow-glow)" }}
              />
              <div className="absolute inset-0 rounded-2xl glass" />
            </div>
            <span className="font-display text-3xl md:text-5xl tracking-[0.15em] uppercase">
              Campus<span className="text-aurora">Verse</span>
            </span>
          </motion.div>
        </motion.div>

        {/* Headline */}
        <motion.div
          style={{ y: headlineY, opacity: headlineOpacity }}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center"
        >
          <div className="mb-8 text-xs uppercase tracking-[0.4em] text-white/50">
            An AI-Powered University Operating System
          </div>
          <h1 className={heroTitleClass}>
            {title.map((line, li) => (
              <div key={li} className="overflow-hidden">
                <motion.div
                  initial={{ y: "110%" }}
                  animate={phase === "reveal" ? { y: 0 } : {}}
                  transition={{ duration: 1, delay: 0.1 * li, ease: [0.16, 1, 0.3, 1] }}
                  className={li === 2 ? "text-aurora" : li === 3 ? "text-fade" : ""}
                >
                  {line}
                </motion.div>
              </div>
            ))}
          </h1>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={phase === "reveal" ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.8, duration: 0.8 }}
            className="mt-10 flex flex-wrap items-center justify-center gap-4"
          >
            <GradientButton variant="primary" icon={ArrowRight} to="/login">
              Get Started
            </GradientButton>
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          style={{ opacity: useTransform(scrollYProgress, [0, 0.1], [1, 0]) }}
          className="absolute bottom-10 inset-x-0 z-20 flex flex-col items-center gap-3 text-white/50"
        >
          <span className="text-[10px] uppercase tracking-[0.4em]">Scroll</span>
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          >
            <ArrowDown className="size-4" />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function HeroBackdrop() {
  return (
    <div className="absolute inset-0">
      {/* Sky / gradient */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 30%, oklch(0.2 0.1 300 / 0.9) 0%, #050505 60%)",
        }}
      />
      {/* Grid */}
      <div className="absolute inset-0 grid-bg radial-fade opacity-60" />
      {/* Horizon glow */}
      <div
        className="absolute left-0 right-0 bottom-0 h-[60%]"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, oklch(0.18 0.18 320 / 0.4) 50%, oklch(0.25 0.2 280 / 0.7) 100%)",
        }}
      />
      {/* Sun / orb */}
      <div
        className="absolute left-1/2 bottom-[20%] -translate-x-1/2 size-[420px] rounded-full blur-[60px] pulse-glow"
        style={{
          background:
            "radial-gradient(circle, oklch(0.82 0.2 50 / 0.9), oklch(0.72 0.27 350 / 0.5) 40%, transparent 70%)",
        }}
      />
      {/* Skyline silhouette */}
      <svg
        viewBox="0 0 1600 400"
        preserveAspectRatio="none"
        className="absolute bottom-0 inset-x-0 w-full h-[40vh]"
      >
        <defs>
          <linearGradient id="bld" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#0a0a0a" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#050505" />
          </linearGradient>
        </defs>
        <g fill="url(#bld)">
          {Array.from({ length: 28 }).map((_, i) => {
            const x = i * 60;
            const h = 100 + ((i * 73) % 240);
            return <rect key={i} x={x} y={400 - h} width="50" height={h} />;
          })}
        </g>
        {/* lit windows */}
        {Array.from({ length: 120 }).map((_, i) => {
          const cx = (i * 47) % 1600;
          const cy = 160 + ((i * 31) % 200);
          return (
            <rect
              key={i}
              x={cx}
              y={cy}
              width="3"
              height="3"
              fill="oklch(0.82 0.18 200)"
              opacity={0.6}
            />
          );
        })}
      </svg>
      <Particles count={50} />
      {/* Fog */}
      <div
        className="absolute bottom-0 inset-x-0 h-[30vh]"
        style={{
          background: "linear-gradient(180deg, transparent, oklch(0.04 0 0) 90%)",
        }}
      />
    </div>
  );
}

/* ---------- PROBLEM ---------- */

function Problem() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const explode = useTransform(scrollYProgress, [0.2, 0.55], [0, 1]);
  const mergeOpacity = useTransform(scrollYProgress, [0.55, 0.8], [0, 1]);
  const tilesOpacity = useTransform(scrollYProgress, [0.4, 0.7], [1, 0]);

  const tiles = [
    { label: "WhatsApp", x: -42, y: -28 },
    { label: "Email", x: 38, y: -32 },
    { label: "Notice Board", x: -36, y: 30 },
    { label: "ERP", x: 32, y: 26 },
    { label: "Classroom", x: -50, y: 4 },
    { label: "Assignments", x: 48, y: 0 },
    { label: "Fees", x: 0, y: -40 },
    { label: "Complaints", x: 4, y: 38 },
    { label: "Certificates", x: -22, y: -10 },
    { label: "Attendance", x: 22, y: 12 },
  ];

  return (
    <section ref={ref} className="relative h-[200vh]">
      <div className="sticky top-0 h-screen overflow-hidden flex flex-col items-center justify-center">
        <SectionLabel index="01">The Problem</SectionLabel>
        <h2 className={sectionTitleClass + " text-center max-w-[18ch]"}>
          University <span className="text-warm">systems</span>
          <br />
          are <span className="text-aurora">broken.</span>
        </h2>

        {/* Floating fragmented tiles */}
        <motion.div
          style={{ opacity: tilesOpacity }}
          className="absolute inset-0 pointer-events-none"
        >
          {tiles.map((t, i) => {
            return (
              <ProblemTile
                key={i}
                label={t.label}
                xOffset={t.x}
                yOffset={t.y}
                index={i}
                progress={explode}
              />
            );
          })}
        </motion.div>

        {/* Merged logo */}
        <motion.div
          style={{ opacity: mergeOpacity, scale: useTransform(mergeOpacity, [0, 1], [0.6, 1]) }}
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
        >
          <div className="relative">
            <div
              className="size-40 md:size-56 rounded-3xl"
              style={{ background: "var(--grad-aurora)", boxShadow: "var(--shadow-glow)" }}
            />
            <div className="absolute inset-0 rounded-3xl glass" />
            <div className="absolute inset-0 flex items-center justify-center font-display text-4xl md:text-6xl font-bold">
              CV
            </div>
          </div>
          <div className="mt-8 font-display text-2xl md:text-4xl uppercase tracking-[0.2em]">
            One <span className="text-aurora">CampusVerse</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ---------- ECOSYSTEM ---------- */

function Ecosystem() {
  const buildings = [
    { name: "Library", icon: Library, x: 18, y: 25 },
    { name: "Hostel", icon: Home, x: 70, y: 18 },
    { name: "Admin", icon: Building2, x: 50, y: 12 },
    { name: "Labs", icon: FlaskConical, x: 82, y: 48 },
    { name: "Departments", icon: GraduationCap, x: 30, y: 55 },
    { name: "Events", icon: Calendar, x: 62, y: 64 },
    { name: "Scholarships", icon: Award, x: 14, y: 72 },
    { name: "Fees", icon: Wallet, x: 46, y: 80 },
    { name: "Attendance", icon: ClipboardCheck, x: 78, y: 78 },
    { name: "AI", icon: Brain, x: 50, y: 42 },
  ];
  const ref = useRef<HTMLDivElement>(null);
  return (
    <section id="ecosystem" ref={ref} className="relative py-32 px-6 lg:px-10">
      <div className="max-w-7xl mx-auto">
        <SectionLabel index="02">Ecosystem</SectionLabel>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-end mb-16">
          <h2 className={sectionTitleClass + " max-w-[14ch]"}>
            A <span className="text-aurora">digital city</span>
            <br /> for every campus.
          </h2>
          <p className="max-w-md text-white/60 text-lg">
            Every building, department, and service — wired into one living, breathing operating
            system.
          </p>
        </div>

        <div className="relative aspect-[16/10] rounded-3xl glass overflow-hidden">
          {/* SVG connections */}
          <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="line" x1="0" x2="1">
                <stop offset="0%" stopColor="oklch(0.7 0.27 320)" stopOpacity="0.7" />
                <stop offset="100%" stopColor="oklch(0.82 0.18 200)" stopOpacity="0.4" />
              </linearGradient>
            </defs>
            {buildings.slice(0, -1).map((b, i) => (
              <line
                key={i}
                x1={`${b.x}%`}
                y1={`${b.y}%`}
                x2={`${buildings[9].x}%`}
                y2={`${buildings[9].y}%`}
                stroke="url(#line)"
                strokeWidth="1"
                strokeDasharray="2 6"
              >
                <animate
                  attributeName="stroke-dashoffset"
                  from="0"
                  to="-16"
                  dur="2s"
                  repeatCount="indefinite"
                />
              </line>
            ))}
          </svg>
          {/* Grid bg */}
          <div className="absolute inset-0 grid-bg opacity-30" />
          <Particles count={30} />

          {buildings.map((b, i) => {
            const Icon = b.icon;
            const isAI = b.name === "AI";
            return (
              <motion.div
                key={b.name}
                whileHover={{ scale: 1.15, rotate: 6 }}
                transition={{ type: "spring", stiffness: 200 }}
                data-cursor="hover"
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `${b.x}%`,
                  top: `${b.y}%`,
                  animation: `breathe ${5 + (i % 4)}s ease-in-out ${-i * 0.5}s infinite`,
                }}
              >
                <div
                  className={`relative glass-strong rounded-2xl p-4 flex flex-col items-center gap-2 w-24 md:w-32 ${isAI ? "glow-purple" : ""}`}
                >
                  <div
                    className={`size-10 rounded-xl flex items-center justify-center ${isAI ? "" : "bg-white/5"}`}
                    style={isAI ? { background: "var(--grad-aurora)" } : {}}
                  >
                    <Icon className="size-5 text-white" />
                  </div>
                  <span className="text-[10px] md:text-xs uppercase tracking-widest text-white/80 text-center">
                    {b.name}
                  </span>
                  <span className="absolute -top-1 -right-1 size-2 rounded-full bg-emerald-400 shadow-[0_0_10px_currentColor] text-emerald-400" />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---------- AI COMMAND CENTER ---------- */

function AICommand() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20%" });
  const [typed, setTyped] = useState("");
  const full = "Show my assignment workspace";
  useEffect(() => {
    if (!inView) return;
    let i = 0;
    const id = setInterval(() => {
      i++;
      setTyped(full.slice(0, i));
      if (i >= full.length) clearInterval(id);
    }, 55);
    return () => clearInterval(id);
  }, [inView]);

  const bars = Array.from({ length: 28 });

  return (
    <section id="ai" ref={ref} className="relative py-32 px-6 lg:px-10">
      <div className="max-w-7xl mx-auto">
        <SectionLabel index="03">AI Command Center</SectionLabel>
        <h2 className={sectionTitleClass + " max-w-[18ch] mb-16"}>
          Talk to your <span className="text-aurora">campus.</span>
        </h2>

        <div className="relative glass-strong rounded-3xl p-6 md:p-10 overflow-hidden">
          <div className="absolute inset-0 grid-bg opacity-20 pointer-events-none" />
          <div
            className="absolute -top-40 -right-20 size-[500px] rounded-full blur-[100px] opacity-40"
            style={{ background: "radial-gradient(circle, oklch(0.7 0.27 320), transparent 70%)" }}
          />

          <div className="relative grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chat */}
            <div className="lg:col-span-2 glass rounded-2xl p-6 flex flex-col gap-4 min-h-[420px]">
              <div className="flex items-center justify-between text-xs uppercase tracking-widest text-white/40">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-emerald-400 pulse-glow" /> Live
                </div>
                <span>CV.AI · v2.4</span>
              </div>

              <div className="self-end max-w-[80%] glass rounded-2xl rounded-tr-sm px-4 py-3 text-sm">
                {typed}
                <span className="inline-block w-px h-4 bg-white/70 ml-0.5 animate-pulse" />
              </div>

              {typed.length >= full.length && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="self-start max-w-[85%] flex flex-col gap-3"
                >
                  <div className="flex items-center gap-2 text-xs text-white/50">
                    <Sparkles className="size-3" /> Assignment workspace
                  </div>
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="glass rounded-xl p-4 flex items-center gap-3"
                  >
                    <span className="size-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/45">
                      <ClipboardList className="size-4" />
                    </span>
                    <div className="flex-1">
                      <div className="text-sm">No published assignments yet</div>
                      <div className="text-xs text-white/40">Professor-created AI assignments will appear here.</div>
                    </div>
                    <ChevronRight className="size-4 text-white/40" />
                  </motion.div>
                </motion.div>
              )}

              <div className="mt-auto glass rounded-2xl p-3 flex items-center gap-3">
                <button
                  data-cursor="hover"
                  className="size-10 rounded-xl flex items-center justify-center"
                  style={{ background: "var(--grad-aurora)" }}
                >
                  <Mic className="size-4 text-white" />
                </button>
                <input
                  placeholder="Ask anything about your campus..."
                  className="bg-transparent flex-1 outline-none text-sm placeholder:text-white/30"
                />
                <button
                  data-cursor="hover"
                  className="size-10 rounded-xl glass flex items-center justify-center hover:bg-white/10"
                >
                  <Send className="size-4" />
                </button>
              </div>
            </div>

            {/* Side: voice + stats */}
            <div className="flex flex-col gap-6">
              <div className="glass rounded-2xl p-6">
                <div className="text-xs uppercase tracking-widest text-white/40 mb-4">
                  Voice Engine
                </div>
                <div className="flex items-end justify-between h-24 gap-1">
                  {bars.map((_, i) => (
                    <motion.span
                      key={i}
                      animate={{
                        height: [
                          `${10 + ((i * 13) % 60)}%`,
                          `${20 + ((i * 27) % 80)}%`,
                          `${10 + ((i * 13) % 60)}%`,
                        ],
                      }}
                      transition={{
                        duration: 1.2 + (i % 5) * 0.1,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                      className="w-1 rounded-full"
                      style={{ background: "var(--grad-aurora)" }}
                    />
                  ))}
                </div>
                <div className="mt-4 text-xs text-white/50 font-mono">
                  listening · 96.4% confidence
                </div>
              </div>

              <div className="glass rounded-2xl p-6">
                <div className="text-xs uppercase tracking-widest text-white/40 mb-4">Today</div>
                <div className="space-y-3">
                  {[
                    { l: "Classes attended", v: "5/6", c: "oklch(0.82 0.18 200)" },
                    { l: "Pending tasks", v: "3", c: "oklch(0.78 0.18 50)" },
                    { l: "Notifications", v: "12", c: "oklch(0.7 0.27 320)" },
                  ].map((s) => (
                    <div key={s.l} className="flex items-center justify-between text-sm">
                      <span className="text-white/60">{s.l}</span>
                      <span className="font-display text-xl" style={{ color: s.c }}>
                        {s.v}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- FEATURE PANELS ---------- */

type Feature = {
  index: string;
  title: string;
  kicker: string;
  body: string;
  icon: typeof Brain;
  accent: string;
  demo: ReactNode;
};

function AttendanceDemo() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-30%" });
  const pct = 92;
  const c = 2 * Math.PI * 80;
  return (
    <div ref={ref} className="relative size-[280px]">
      <svg viewBox="0 0 200 200" className="size-full -rotate-90">
        <circle
          cx="100"
          cy="100"
          r="80"
          stroke="oklch(1 0 0 / 0.08)"
          strokeWidth="14"
          fill="none"
        />
        <motion.circle
          cx="100"
          cy="100"
          r="80"
          stroke="url(#att)"
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={inView ? { strokeDashoffset: c * (1 - pct / 100) } : {}}
          transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1] }}
        />
        <defs>
          <linearGradient id="att" x1="0" x2="1">
            <stop offset="0%" stopColor="oklch(0.82 0.18 200)" />
            <stop offset="100%" stopColor="oklch(0.7 0.27 320)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <Counter to={pct} className="font-display text-7xl text-aurora" suffix="%" />
        <span className="text-xs uppercase tracking-widest text-white/40 mt-2">
          Semester Attendance
        </span>
      </div>
    </div>
  );
}

function ComplaintDemo() {
  const steps = ["Submitted", "Acknowledged", "In Progress", "Resolved"];
  return (
    <div className="w-full max-w-[38rem]">
      <div className="relative pl-6">
        <span className="absolute left-2 top-2 bottom-2 w-px bg-white/10" />
        <motion.span
          initial={{ height: 0 }}
          whileInView={{ height: "100%" }}
          viewport={{ once: true }}
          transition={{ duration: 1.6, ease: "easeInOut" }}
          className="absolute left-2 top-2 w-px"
          style={{ background: "var(--grad-aurora)" }}
        />
        {steps.map((s, i) => (
          <motion.div
            key={s}
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 + i * 0.35 }}
            className="relative py-4 flex items-center gap-4"
          >
            <span
              className="absolute -left-4 size-3 rounded-full"
              style={{
                background: "var(--grad-aurora)",
                boxShadow: "0 0 12px oklch(0.7 0.27 320)",
              }}
            />
            <div className="glass rounded-xl px-4 py-3 flex-1 flex items-center justify-between">
              <span className="text-sm uppercase tracking-widest">{s}</span>
              <span className="text-xs font-mono text-white/40">#CV-2049</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function CertificateDemo() {
  return (
    <motion.div
      initial={{ rotateX: 90, opacity: 0 }}
      whileInView={{ rotateX: 0, opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      style={{ transformPerspective: 1000 }}
      className="w-full max-w-[42rem] aspect-[4/3] glass-strong rounded-[32px] p-9 md:p-10 relative overflow-hidden"
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, oklch(0.7 0.27 320 / 0.15), oklch(0.82 0.18 200 / 0.05))",
        }}
      />
      <div className="relative h-full flex flex-col">
        <div className="flex justify-between items-start text-xs uppercase tracking-widest text-white/40">
          <span>2026</span>
        </div>
        <div className="my-auto text-center">
          <div className="text-xs uppercase tracking-[0.4em] text-white/50">Certificate of</div>
          <div className="font-display text-[2.7rem] md:text-[3.15rem] uppercase mt-3 text-aurora">
            Excellence
          </div>
          <div className="text-[1.1rem] mt-3 text-white/75">Shouvik Roy</div>
        </div>
        <div className="flex justify-between items-end text-[10px] font-mono text-white/40">
          <span>0x9F·a4·22·EE</span>
          <span>CampusVerse Registrar</span>
        </div>
      </div>
    </motion.div>
  );
}

function AssignmentDemo() {
  return (
    <div className="w-full max-w-[42rem]">
      <motion.div
        whileHover={{ scale: 1.02 }}
        className="glass-strong rounded-[32px] p-10 md:p-11 border-dashed border-white/15 text-center"
      >
        <motion.div
          animate={{ y: [-4, 4, -4] }}
          transition={{ duration: 3, repeat: Infinity }}
          className="mx-auto size-[5rem] rounded-[24px] flex items-center justify-center mb-6"
          style={{ background: "var(--grad-aurora)" }}
        >
          <FileText className="text-white" />
        </motion.div>
        <div className="text-sm uppercase tracking-widest text-white/60">Drop your file</div>
        <div className="font-display text-[1.6rem] md:text-[1.85rem] mt-2">CS401 · Lab Report</div>
        <div className="mt-5 h-1 rounded-full bg-white/10 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            whileInView={{ width: "78%" }}
            viewport={{ once: true }}
            transition={{ duration: 1.5 }}
            className="h-full"
            style={{ background: "var(--grad-aurora)" }}
          />
        </div>
        <div className="mt-2 text-xs text-white/50 font-mono">uploading · 78%</div>
      </motion.div>
    </div>
  );
}

function FeePanelDemo() {
  return (
    <div className="w-full max-w-sm font-mono text-xs">
      <div className="glass-strong rounded-t-2xl rounded-b-none p-5 border-b border-dashed border-white/15">
        <div className="text-center uppercase tracking-widest text-white/40">
          CampusVerse · Receipt
        </div>
        <div className="text-center font-display text-3xl text-aurora mt-1">₹ 84,500</div>
      </div>
      <div className="glass p-5 space-y-2 text-white/70">
        {[
          ["Tuition", "₹ 72,000"],
          ["Hostel", "₹ 9,500"],
          ["Library", "₹ 1,200"],
          ["Insurance", "₹ 1,800"],
        ].map(([l, v]) => (
          <div key={l} className="flex justify-between">
            <span>{l}</span>
            <span>{v}</span>
          </div>
        ))}
        <div className="border-t border-white/10 pt-2 flex justify-between text-white">
          <span>Paid</span>
          <span className="text-emerald-400">✓ Settled</span>
        </div>
      </div>
      <div className="h-3 bg-[repeating-linear-gradient(90deg,transparent_0_8px,#0a0a0a_8px_16px)]" />
    </div>
  );
}

const features: Feature[] = [
  {
    index: "01",
    title: "Attendance",
    kicker: "Live · Biometric · Wifi-aware",
    body: "Auto-mark presence from class wifi, RFID and geofence. Daily, weekly and semester summaries — at a glance.",
    icon: ClipboardCheck,
    accent: "oklch(0.82 0.18 200)",
    demo: <AttendanceDemo />,
  },
  {
    index: "02",
    title: "Assignments",
    kicker: "Drag · Submit · Track",
    body: "Submit any format. Plagiarism flags, AI-feedback, instructor review and grade history — in one stream.",
    icon: FileText,
    accent: "oklch(0.7 0.27 320)",
    demo: <AssignmentDemo />,
  },
  {
    index: "03",
    title: "Complaints",
    kicker: "Transparent · Tracked · Resolved",
    body: "From submission to resolution — every step is timestamped, accountable and visible to you.",
    icon: MessageSquare,
    accent: "oklch(0.72 0.27 350)",
    demo: <ComplaintDemo />,
  },
  {
    index: "04",
    title: "Certificates",
    kicker: "Verified · On-chain",
    body: "Tamper-proof certificates with verifiable credentials. Share, download, embed — instantly.",
    icon: Award,
    accent: "oklch(0.78 0.18 50)",
    demo: <CertificateDemo />,
  },
  {
    index: "05",
    title: "Fee Payment",
    kicker: "Secure · Instant · Itemised",
    body: "Pay tuition, hostel, library and insurance in one tap. Receipts, statements and dues — clear and complete.",
    icon: Wallet,
    accent: "oklch(0.85 0.12 60)",
    demo: <FeePanelDemo />,
  },
];

function FeatureShowcase() {
  return (
    <section id="features" className="relative">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-14 lg:py-16">
        <SectionLabel index="04">Feature Showcase</SectionLabel>
        <h2 className={sectionTitleClass + " max-w-[18ch]"}>
          Everything <span className="text-aurora">a student</span> needs.
          <br />
          <span className="text-fade">In one platform.</span>
        </h2>
      </div>
      {features.map((f, i) => (
        <FeaturePanel key={f.index} feature={f} reverse={i % 2 === 1} />
      ))}
    </section>
  );
}

function FeatureWordmark({ title, accent }: { title: string; accent: string }) {
  return (
    <div className="relative w-full overflow-hidden px-4 md:px-5 py-3">
      <div
        aria-hidden
        className="absolute inset-x-3 top-1/2 h-[62%] -translate-y-1/2 rounded-full blur-3xl opacity-20"
        style={{
          background: `linear-gradient(90deg, ${accent} 0%, transparent 85%)`,
        }}
      />
      <div
        aria-hidden
        className="absolute -left-4 top-[14%] hidden h-[72%] w-px rounded-full md:block opacity-60"
        style={{
          background: `linear-gradient(180deg, transparent 0%, ${accent} 18%, transparent 100%)`,
          boxShadow: `0 0 24px ${accent}`,
        }}
      />
      <h3 className="sr-only">{title}</h3>
      <div className="relative inline-block">
        <span className="inline-block pr-4" style={{ filter: `drop-shadow(0 0 20px ${accent})` }}>
          <span
            className={featureTitleClass + " inline-block align-top"}
            style={{
              background: `linear-gradient(180deg, white 0%, ${accent} 100%)`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {title}
          </span>
        </span>
      </div>
    </div>
  );
}

function FeaturePanel({ feature, reverse }: { feature: Feature; reverse: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [56, -56]);
  const titleY = useTransform(scrollYProgress, [0, 1], [0, -56]);
  const Icon = feature.icon;
  return (
    <section
      ref={ref}
      className="relative min-h-[70svh] lg:min-h-[76svh] flex items-center px-6 lg:px-10 py-14 lg:py-16 overflow-hidden"
    >
      <div className="absolute inset-0 -z-10">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] rounded-full blur-[160px] opacity-30"
          style={{ background: `radial-gradient(circle, ${feature.accent} 0%, transparent 60%)` }}
        />
        <div className="absolute inset-0 grid-bg opacity-20" />
      </div>
      <div
        className={`max-w-7xl mx-auto w-full grid ${reverse ? "lg:grid-cols-[minmax(380px,0.62fr)_minmax(0,1.38fr)]" : "lg:grid-cols-[minmax(0,1.4fr)_minmax(430px,0.6fr)]"} gap-8 lg:gap-10 items-center min-w-0 ${reverse ? "lg:[&>*:first-child]:order-2" : ""}`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-white/40 mb-5">
            <span className="font-mono">{feature.index}</span>
            <Icon className="size-3" style={{ color: feature.accent }} />
            <span>{feature.kicker}</span>
          </div>
          <FeatureWordmark title={feature.title} accent={feature.accent} />
          <p className="mt-6 max-w-md text-white/60 text-lg leading-relaxed">{feature.body}</p>
          <motion.div
            initial={{ scaleX: 0, opacity: 0.5 }}
            whileInView={{ scaleX: 1, opacity: 1 }}
            viewport={{ once: true, margin: "-20%" }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="mt-8 h-px w-32 origin-left"
            style={{
              background: `linear-gradient(90deg, ${feature.accent} 0%, transparent 100%)`,
            }}
          />
        </div>
        <motion.div
          style={{ y }}
          className={`flex items-center min-w-0 ${reverse ? "justify-center lg:justify-end" : "justify-center"}`}
        >
          {feature.demo}
        </motion.div>
      </div>
    </section>
  );
}

/* ---------- DIGITAL TWIN ---------- */

function DigitalTwin() {
  const nodes = [
    { x: 20, y: 70 },
    { x: 35, y: 55 },
    { x: 50, y: 70 },
    { x: 65, y: 55 },
    { x: 80, y: 70 },
    { x: 28, y: 40 },
    { x: 50, y: 28 },
    { x: 72, y: 40 },
  ];
  return (
    <section id="twin" className="relative py-32 px-6 lg:px-10">
      <div className="max-w-7xl mx-auto">
        <SectionLabel index="05">Campus Digital Twin</SectionLabel>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-end mb-12">
          <h2 className={sectionTitleClass + " max-w-[16ch]"}>
            A live mirror of <span className="text-aurora">your campus.</span>
          </h2>
          <p className="max-w-sm text-white/60 text-lg">
            Every student, every event, every signal — visualised in real time.
          </p>
        </div>

        <div className="relative aspect-[16/9] rounded-3xl glass-strong overflow-hidden">
          <div className="absolute inset-0 grid-bg opacity-30" />
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(180deg, transparent, oklch(0.05 0.04 280 / 0.6))",
            }}
          />
          {/* Iso skyline */}
          <svg
            viewBox="0 0 1000 500"
            className="absolute inset-0 w-full h-full"
            preserveAspectRatio="xMidYMid slice"
          >
            <defs>
              <linearGradient id="bldg" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.7 0.27 320 / 0.6)" />
                <stop offset="100%" stopColor="oklch(0.65 0.25 260 / 0.2)" />
              </linearGradient>
            </defs>
            {/* connection lines */}
            {nodes.map((n, i) =>
              nodes.slice(i + 1).map((m, j) => {
                const dx = n.x - m.x,
                  dy = n.y - m.y;
                if (Math.hypot(dx, dy) > 25) return null;
                return (
                  <line
                    key={`${i}-${j}`}
                    x1={n.x * 10}
                    y1={n.y * 5}
                    x2={m.x * 10}
                    y2={m.y * 5}
                    stroke="oklch(0.82 0.18 200 / 0.3)"
                    strokeWidth="1"
                    strokeDasharray="3 4"
                  >
                    <animate
                      attributeName="stroke-dashoffset"
                      from="0"
                      to="-14"
                      dur="3s"
                      repeatCount="indefinite"
                    />
                  </line>
                );
              }),
            )}
            {/* buildings as iso boxes */}
            {nodes.map((n, i) => (
              <g key={i} transform={`translate(${n.x * 10}, ${n.y * 5})`}>
                <rect
                  x="-22"
                  y={-30 - (i % 3) * 12}
                  width="44"
                  height={50 + (i % 3) * 12}
                  fill="url(#bldg)"
                  stroke="oklch(0.7 0.27 320 / 0.6)"
                />
                {Array.from({ length: 6 }).map((_, k) => (
                  <rect
                    key={k}
                    x={-18 + (k % 2) * 16}
                    y={-22 - (i % 3) * 12 + Math.floor(k / 2) * 10}
                    width="3"
                    height="3"
                    fill="oklch(0.82 0.18 200)"
                    opacity={0.8}
                  />
                ))}
              </g>
            ))}
            {/* moving dots (students) */}
            {Array.from({ length: 18 }).map((_, i) => {
              const r = 3 + (i % 30) * 5;
              return (
                <circle key={i} r="2" fill="oklch(0.82 0.18 200)">
                  <animateMotion
                    dur={`${6 + (i % 5)}s`}
                    repeatCount="indefinite"
                    path={`M ${50 + i * 50} 400 Q ${500} ${100 + ((i * 23) % 300)} ${950 - i * 40} 380`}
                  />
                  <animate
                    attributeName="opacity"
                    values="0;1;0"
                    dur={`${6 + (i % 5)}s`}
                    repeatCount="indefinite"
                  />
                </circle>
              );
            })}
          </svg>
          {/* HUD */}
          <div className="absolute top-6 left-6 text-xs font-mono uppercase tracking-widest text-white/60 space-y-1">
            <div className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-emerald-400 pulse-glow" />
              Live · 12,408 students online
            </div>
            <div className="text-white/40">Notifications/min · 1,204</div>
          </div>
          <div className="absolute bottom-6 right-6 glass rounded-xl px-4 py-3 text-xs font-mono">
            <div className="text-white/40 uppercase tracking-widest">Now</div>
            <div className="text-aurora">28 events · 6 alerts</div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- NUMBERS ---------- */

function Counter({
  to,
  suffix = "",
  className = "",
}: {
  to: number;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20%" });
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, to, {
      duration: 2.2,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setVal(v),
    });
    return () => controls.stop();
  }, [inView, to]);
  return (
    <span ref={ref} className={className}>
      {Math.floor(val).toLocaleString()}
      {suffix}
    </span>
  );
}

function Numbers() {
  const stats = [
    { v: 248000, s: "+", l: "Students" },
    { v: 12400, s: "+", l: "Faculty" },
    { v: 4800, s: "", l: "Courses" },
    { v: 38000, s: "+", l: "Events" },
    { v: 1240000, s: "+", l: "Assignments" },
    { v: 96, s: "%", l: "Complaints Resolved" },
  ];
  return (
    <section className="relative py-32 px-6 lg:px-10">
      <div className="max-w-7xl mx-auto">
        <SectionLabel index="06">Scale</SectionLabel>
        <h2 className={sectionTitleClass + " max-w-[18ch] mb-16"}>
          A new <span className="text-aurora">operating system</span> for higher education.
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-px bg-white/5 rounded-3xl overflow-hidden">
          {stats.map((s) => (
            <div key={s.l} className="bg-[#070707] p-8 md:p-10">
              <div className="font-display text-5xl md:text-7xl">
                <Counter to={s.v} suffix={s.s} className="text-aurora" />
              </div>
              <div className="mt-3 text-xs uppercase tracking-[0.3em] text-white/40">{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- TIMELINE ---------- */

function Timeline() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const steps = [
    "Admission",
    "Classes",
    "Assignments",
    "Attendance",
    "Events",
    "Scholarships",
    "Placement",
  ];
  return (
    <section id="journey" ref={ref} className="relative py-32 px-6 lg:px-10">
      <div className="max-w-7xl mx-auto">
        <SectionLabel index="07">Student Journey</SectionLabel>
        <h2 className={sectionTitleClass + " max-w-[18ch] mb-20"}>
          Four years.
          <br />
          <span className="text-aurora">One continuous</span> story.
        </h2>
        <div className="relative">
          <div className="absolute left-6 md:left-1/2 top-0 bottom-0 w-px bg-white/10" />
          <motion.div
            style={{
              scaleY: scrollYProgress,
              transformOrigin: "top",
              background: "var(--grad-aurora)",
            }}
            className="absolute left-6 md:left-1/2 top-0 bottom-0 w-px"
          />
          <div className="space-y-16">
            {steps.map((s, i) => (
              <motion.div
                key={s}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-20%" }}
                transition={{ duration: 0.8 }}
                className={`relative pl-16 md:pl-0 md:grid md:grid-cols-2 md:gap-16 ${i % 2 === 0 ? "md:[&>*]:text-left" : "md:[&>*]:text-right md:[&>*:first-child]:order-2 md:[&>*:first-child]:text-left"}`}
              >
                <span
                  className="absolute left-5 md:left-1/2 -translate-x-1/2 size-4 rounded-full"
                  style={{
                    background: "var(--grad-aurora)",
                    boxShadow: "0 0 20px oklch(0.7 0.27 320)",
                  }}
                />
                <div className="md:px-12">
                  <div className="font-mono text-xs uppercase tracking-widest text-white/40">
                    Stage {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="font-display text-4xl md:text-6xl uppercase mt-2">{s}</div>
                </div>
                <div className="md:px-12 mt-3 md:mt-0 text-white/50 max-w-sm">
                  {
                    [
                      "Apply, enroll and onboard digitally — paperwork-free.",
                      "Smart timetables, live classes, recordings and notes synced.",
                      "Submit, get feedback and track grades in a single stream.",
                      "Auto-marked attendance from every signal on campus.",
                      "Discover, register and re-live every event in one place.",
                      "Match, apply and track scholarships tailored to you.",
                      "AI-curated placements, interviews and offer pipelines.",
                    ][i]
                  }
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- COMMUNITY ---------- */

function Community() {
  const items = [
    { icon: ShoppingBag, t: "Marketplace", d: "Books · gadgets · rentals" },
    { icon: Calendar, t: "Events", d: "Fests · meetups · talks" },
    { icon: Users, t: "Study Groups", d: "Find your tribe, ace exams" },
    { icon: MessageSquare, t: "Discussions", d: "Anonymous Q&A, doubts, polls" },
    { icon: BookOpen, t: "Resources", d: "Notes, PYQs, lecture archives" },
    { icon: Bell, t: "Announcements", d: "Targeted, never spammy" },
  ];
  return (
    <section className="relative py-32 px-6 lg:px-10">
      <div className="max-w-7xl mx-auto">
        <SectionLabel index="08">Community</SectionLabel>
        <h2 className={sectionTitleClass + " max-w-[18ch] mb-16"}>
          Campus life, <span className="text-warm">amplified.</span>
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {items.map(({ icon: Icon, t, d }, i) => (
            <motion.div
              key={t}
              whileHover={{ y: -8, rotateX: 4, rotateY: -4 }}
              transition={{ type: "spring", stiffness: 200 }}
              style={{ transformPerspective: 1000 }}
              data-cursor="hover"
              className="glass-strong rounded-3xl p-8 relative overflow-hidden group"
            >
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition"
                style={{
                  background: `radial-gradient(circle at 30% 0%, oklch(0.7 0.27 320 / 0.2), transparent 70%)`,
                }}
              />
              <div className="relative">
                <div
                  className="size-12 rounded-2xl flex items-center justify-center mb-6"
                  style={{ background: "var(--grad-aurora)" }}
                >
                  <Icon className="size-5 text-white" />
                </div>
                <div className="font-display text-2xl uppercase">{t}</div>
                <div className="mt-2 text-white/50 text-sm">{d}</div>
                <div className="mt-6 text-xs font-mono uppercase tracking-widest text-white/30 flex items-center gap-2">
                  Open <ArrowRight className="size-3" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- TESTIMONIALS ---------- */

function Testimonials() {
  const quotes = [
    {
      q: "It feels like the university itself was rebuilt around the student.",
      n: "Aanya K.",
      r: "Final-year, CS",
    },
    {
      q: "Replaced six different apps and three group chats. Overnight.",
      n: "Prof. R. Menon",
      r: "Dean, Engineering",
    },
    {
      q: "Admissions to placements — all in one screen. We saved months.",
      n: "S. Iyer",
      r: "Registrar",
    },
    { q: "The AI actually knows my timetable. Wild.", n: "Dev P.", r: "Second-year, AI" },
    { q: "Complaints don't disappear into a black hole anymore.", n: "Meher A.", r: "Hostel rep" },
  ];
  return (
    <section className="relative py-32 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <SectionLabel index="09">Signal</SectionLabel>
        <h2 className={sectionTitleClass + " max-w-[18ch] mb-16"}>
          Heard from <span className="text-aurora">the campus.</span>
        </h2>
      </div>
      <div className="relative flex gap-6 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
        <div className="flex gap-6 shrink-0" style={{ animation: "drift 50s linear infinite" }}>
          {[...quotes, ...quotes].map((q, i) => (
            <motion.div
              key={i}
              whileHover={{ y: -10 }}
              className="glass-strong rounded-3xl p-8 w-[360px] shrink-0 relative"
            >
              <div
                className="absolute inset-0 rounded-3xl pointer-events-none"
                style={{
                  background:
                    "linear-gradient(135deg, oklch(0.7 0.27 320 / 0.15), transparent 60%)",
                }}
              />
              <div className="relative">
                <Sparkles className="size-4 text-white/40" />
                <p className="font-display text-2xl leading-snug mt-4">"{q.q}"</p>
                <div className="mt-6 flex items-center gap-3">
                  <div
                    className="size-10 rounded-full"
                    style={{ background: "var(--grad-aurora)" }}
                  />
                  <div>
                    <div className="text-sm">{q.n}</div>
                    <div className="text-xs text-white/40 uppercase tracking-widest">{q.r}</div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- FINAL CTA ---------- */

function FinalCTA() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 grid-bg opacity-30" />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[120vw] rounded-full blur-[160px] opacity-40 float-slow"
          style={{
            background: "radial-gradient(circle, oklch(0.7 0.27 320 / 0.6), transparent 60%)",
          }}
        />
        <Particles count={60} />
      </div>
      <div className="text-center max-w-5xl">
        <div className="text-xs uppercase tracking-[0.5em] text-white/50 mb-8">
          The Future of Campus Life
        </div>
        <h2 className={finalTitleClass}>
          Starts <span className="text-aurora">here.</span>
        </h2>
        <p className="mt-10 text-white/60 text-lg max-w-xl mx-auto">
          One platform. Every student. Every department. Every possibility.
        </p>
        <motion.div
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 3, repeat: Infinity }}
          className="mt-12 flex flex-wrap justify-center gap-4"
        >
          <GradientButton variant="primary" icon={ArrowRight} to="/login">
            Get Started
          </GradientButton>
        </motion.div>
      </div>
    </section>
  );
}

/* ---------- FOOTER ---------- */

function Footer() {
  return (
    <footer className="relative px-6 lg:px-10 pb-12 pt-20">
      <div className="absolute top-0 inset-x-0 h-px" style={{ background: "var(--grad-aurora)" }} />
      <div className="max-w-7xl mx-auto glass rounded-3xl p-8 md:p-12 grid md:grid-cols-4 gap-10">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2 text-sm font-display tracking-[0.25em] uppercase">
            <span className="size-2 rounded-full" style={{ background: "var(--grad-aurora)" }} />
            CampusVerse
          </div>
          <p className="mt-6 text-white/50 max-w-sm">
            The AI-powered operating system for the universities of tomorrow.
          </p>
          <div className="mt-8 text-xs font-mono uppercase tracking-widest text-white/30">
            © 2026 CampusVerse Labs
          </div>
        </div>
        {[
          { t: "Platform", l: ["Ecosystem", "AI", "Digital Twin", "Features"] },
          { t: "Company", l: ["About", "Press", "Careers", "Contact"] },
        ].map((c) => (
          <div key={c.t}>
            <div className="text-xs uppercase tracking-[0.3em] text-white/40 mb-4">{c.t}</div>
            <ul className="space-y-2">
              {c.l.map((x) => (
                <li key={x}>
                  <a
                    href="#"
                    data-cursor="hover"
                    className="text-white/70 hover:text-white transition"
                  >
                    {x}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </footer>
  );
}

/* ---------- ROOT ---------- */

export function CampusVerse() {
  return (
    <main className="relative bg-[#050505] text-white overflow-x-hidden">
      <AuroraBackdrop />
      <Nav />
      <Hero />
      <Problem />
      <Ecosystem />
      <AICommand />
      <FeatureShowcase />
      <DigitalTwin />
      <Numbers />
      <Timeline />
      <Community />
      <Testimonials />
      <FinalCTA />
      <Footer />
    </main>
  );
}
