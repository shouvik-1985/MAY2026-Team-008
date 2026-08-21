import { motion } from "framer-motion";
import { ArrowDown } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";

type AuthSceneMood = "idle" | "hover" | "typing" | "peek" | "busy" | "success" | "error";
type ScenePointer = { x: number; y: number };

type LampTone = {
  shade: string;
  shadeDark: string;
  accent: string;
  accentDark: string;
  glow: string;
  softGlow: string;
  label: string;
};

const lampTones: Record<AuthSceneMood, LampTone> = {
  idle: {
    shade: "#829171",
    shadeDark: "#455139",
    accent: "#4caf50",
    accentDark: "#2d6f34",
    glow: "rgba(76, 175, 80, 0.22)",
    softGlow: "rgba(255, 234, 173, 0.08)",
    label: "sleep",
  },
  hover: {
    shade: "#8da37c",
    shadeDark: "#516240",
    accent: "#54b95b",
    accentDark: "#32813b",
    glow: "rgba(82, 190, 90, 0.34)",
    softGlow: "rgba(255, 235, 181, 0.16)",
    label: "awake",
  },
  typing: {
    shade: "#91aa80",
    shadeDark: "#526943",
    accent: "#58bc60",
    accentDark: "#317c39",
    glow: "rgba(88, 188, 96, 0.42)",
    softGlow: "rgba(255, 236, 181, 0.2)",
    label: "typing",
  },
  peek: {
    shade: "#b7a07d",
    shadeDark: "#765f46",
    accent: "#d6a15d",
    accentDark: "#9b6837",
    glow: "rgba(214, 161, 93, 0.4)",
    softGlow: "rgba(255, 226, 157, 0.24)",
    label: "peek",
  },
  busy: {
    shade: "#8fb77e",
    shadeDark: "#4f6f42",
    accent: "#64c76b",
    accentDark: "#347e3c",
    glow: "rgba(100, 199, 107, 0.48)",
    softGlow: "rgba(255, 242, 181, 0.24)",
    label: "scan",
  },
  success: {
    shade: "#9bcf87",
    shadeDark: "#4f7e43",
    accent: "#72d979",
    accentDark: "#338f40",
    glow: "rgba(114, 217, 121, 0.52)",
    softGlow: "rgba(255, 246, 190, 0.28)",
    label: "clear",
  },
  error: {
    shade: "#aa7d74",
    shadeDark: "#71473f",
    accent: "#bf604b",
    accentDark: "#8a3f33",
    glow: "rgba(191, 96, 75, 0.44)",
    softGlow: "rgba(255, 195, 157, 0.2)",
    label: "retry",
  },
};

const preserve3d: CSSProperties = { transformStyle: "preserve-3d" };
const ropeUnlockDistance = 32;
const maxRopePull = 72;

export function Auth3DScene({
  mood,
  pointer,
  open,
  onLampPull,
}: {
  mood: AuthSceneMood;
  pointer: ScenePointer;
  open: boolean;
  onLampPull: () => void;
}) {
  const sceneMood = open ? mood : "idle";
  const tone = lampTones[sceneMood];
  const isOn = open && sceneMood !== "idle";
  const [ropePulled, setRopePulled] = useState(false);
  const [manualPull, setManualPull] = useState(0);
  const [draggingRope, setDraggingRope] = useState(false);
  const startYRef = useRef(0);
  const releaseTimerRef = useRef<number | null>(null);
  const unlockTimerRef = useRef<number | null>(null);
  const unlockStartedRef = useRef(false);
  const pullDistance = ropePulled ? Math.max(manualPull, 56) : manualPull;

  useEffect(() => {
    return () => {
      if (releaseTimerRef.current) window.clearTimeout(releaseTimerRef.current);
      if (unlockTimerRef.current) window.clearTimeout(unlockTimerRef.current);
    };
  }, []);

  function playRopePull(distance = 64) {
    if (open || unlockStartedRef.current) return;

    setRopePulled(true);
    setManualPull(Math.min(maxRopePull, Math.max(distance, 58)));

    if (releaseTimerRef.current) window.clearTimeout(releaseTimerRef.current);
    releaseTimerRef.current = window.setTimeout(() => {
      setRopePulled(false);
      setManualPull(0);
    }, 840);

    unlockStartedRef.current = true;
    unlockTimerRef.current = window.setTimeout(() => {
      onLampPull();
    }, 460);
  }

  function startRopeDrag(event: PointerEvent<HTMLButtonElement>) {
    if (open || unlockStartedRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    startYRef.current = event.clientY;
    setDraggingRope(true);
    setManualPull(3);
  }

  function moveRopeDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!draggingRope || open) return;
    const nextPull = Math.max(3, Math.min(maxRopePull, event.clientY - startYRef.current + 3));
    setManualPull(nextPull);
  }

  function endRopeDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!draggingRope || open) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDraggingRope(false);
    const finalPull = Math.max(0, Math.min(maxRopePull, event.clientY - startYRef.current + 3));

    if (event.type === "pointercancel" || finalPull < ropeUnlockDistance) {
      setRopePulled(false);
      setManualPull(0);
      return;
    }

    playRopePull(finalPull);
  }

  return (
    <motion.div
      className={`relative flex min-h-full w-full overflow-hidden bg-[#121417] ${
        open ? "border-r border-white/8" : ""
      }`}
      animate={{ x: open ? pointer.x * 3 : 0, y: open ? pointer.y * 3 : 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#101215_0%,#15181d_52%,#0d0f12_100%)]" />
      <motion.div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 47% 45%, ${tone.glow}, transparent 58%)`,
        }}
        animate={{ opacity: isOn ? [0.72, 1, 0.72] : 0.34 }}
        transition={
          isOn
            ? { duration: 3.4, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.2, ease: "easeOut" }
        }
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_12%,rgba(255,255,255,0.05),transparent_26%),radial-gradient(circle_at_80%_84%,rgba(255,255,255,0.035),transparent_30%)]" />
      <FallingDust tone={tone} active={isOn} />

      <div className="relative z-10 flex flex-1 flex-col justify-center px-10 py-12">
        {open && (
          <motion.div
            className="mb-10 text-center"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
          >
            <div className="font-display text-4xl font-bold tracking-normal text-[#ffc84b]">
              CampusVerse Login
            </div>
            <div className="mt-2 text-xs font-medium uppercase tracking-[0.22em] text-white/32">
              cute lamp access
            </div>
          </motion.div>
        )}

        <div className="mx-auto flex w-full max-w-[660px] items-center justify-center">
          <div className="relative h-[420px] w-[260px]" style={{ perspective: "900px" }}>
            <motion.div
              className="relative h-full w-full"
              animate={{
                rotateX: open ? 6 - pointer.y * 5 : 6,
                rotateY: open ? -8 + pointer.x * 9 : -8,
                y: isOn ? [0, -6, 0] : 0,
              }}
              transition={
                isOn
                  ? { duration: 4.5, repeat: Infinity, ease: "easeInOut" }
                  : { duration: 0.28, ease: "easeOut" }
              }
              style={preserve3d}
            >
              <LampCharacter
                mood={sceneMood}
                tone={tone}
                isOn={isOn}
                open={open}
                pullDistance={pullDistance}
              />
            </motion.div>
            {!open && <PullLampHint tone={tone} active={draggingRope} />}
            <button
              type="button"
              onPointerDown={(event) => {
                event.preventDefault();
                startRopeDrag(event);
              }}
              onPointerMove={moveRopeDrag}
              onPointerUp={endRopeDrag}
              onPointerCancel={endRopeDrag}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  playRopePull();
                }
              }}
              disabled={open}
              tabIndex={open ? -1 : 0}
              className="absolute left-[140px] top-[130px] z-20 h-36 w-16 cursor-grab touch-none rounded-full bg-transparent active:cursor-grabbing"
              aria-label="Pull lamp cord"
            />
          </div>
        </div>

        {open && (
          <div className="mx-auto mt-10 flex w-full max-w-[660px] items-center justify-center gap-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/30">
            <span className="h-px flex-1 bg-white/10" />
            <span style={{ color: tone.accent }}>{tone.label}</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>
        )}
      </div>
    </motion.div>
  );
}

function LampCharacter({
  mood,
  tone,
  isOn,
  open,
  pullDistance,
}: {
  mood: AuthSceneMood;
  tone: LampTone;
  isOn: boolean;
  open: boolean;
  pullDistance: number;
}) {
  const activePull = Math.max(0, Math.min(maxRopePull, pullDistance));
  const cordPath =
    activePull > 0
      ? `M156 128 C${164 + activePull * 0.06} ${146 + activePull * 0.2} ${144 + activePull * 0.07} ${158 + activePull * 0.54} 151 ${178 + activePull}`
      : "M156 128 C164 146 144 158 151 178";
  const shadeY =
    activePull > 0
      ? Math.min(8, activePull * 0.11)
      : open && mood === "success"
        ? [0, -4, 0]
        : isOn
          ? [0, -1, 0]
          : 0;
  const shadeRotate =
    activePull > 0
      ? Math.min(2.4, activePull * 0.035)
      : open && mood === "success"
        ? [0, -1.5, 0]
        : 0;
  const shadeTransition =
    activePull > 0
      ? { type: "spring" as const, stiffness: 260, damping: 18 }
      : isOn
        ? { duration: 2.5, repeat: Infinity, ease: "easeInOut" as const }
        : { duration: 0.2, ease: "easeOut" as const };
  const stickY = isOn ? [0, -1, 0] : 0;
  const stickTransition = isOn
    ? { duration: 3.2, repeat: Infinity, ease: "easeInOut" as const }
    : { duration: 0.2, ease: "easeOut" as const };
  const lightTransition = isOn
    ? { duration: 2.6, repeat: Infinity, ease: "easeInOut" as const }
    : { duration: 0.2, ease: "easeOut" as const };
  const glowTransition = isOn
    ? { duration: 2.8, repeat: Infinity, ease: "easeInOut" as const }
    : { duration: 0.2, ease: "easeOut" as const };
  const shadowTransition = isOn
    ? { duration: 3.2, repeat: Infinity, ease: "easeInOut" as const }
    : { duration: 0.2, ease: "easeOut" as const };
  const eyeY = isOn ? 0 : 3;
  const eyeHeight = isOn ? 3.5 : 1;

  return (
    <>
      <motion.div
        className="absolute left-1/2 top-[108px] h-28 w-44 -translate-x-1/2 rounded-full blur-2xl"
        style={{ background: tone.softGlow, transform: "translateZ(5px)" }}
        animate={{
          opacity: isOn ? [0.55, 0.92, 0.55] : 0.18,
          scale: isOn ? [0.96, 1.08, 0.96] : 0.9,
        }}
        transition={glowTransition}
      />
      <motion.svg
        className="absolute inset-0 h-full w-full overflow-visible drop-shadow-[0_24px_26px_rgba(0,0,0,0.35)]"
        viewBox="0 0 220 340"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="lampBaseGradient" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#f7f3eb" />
            <stop offset="54%" stopColor="#d8d5ce" />
            <stop offset="100%" stopColor="#989994" />
          </linearGradient>
          <linearGradient id="lampShadeGradient" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor={tone.shade} />
            <stop offset="100%" stopColor={tone.shadeDark} />
          </linearGradient>
          <linearGradient id="lampShadeUnderGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={tone.shadeDark} stopOpacity="0.55" />
            <stop offset="100%" stopColor="#161a17" stopOpacity="0.28" />
          </linearGradient>
          <radialGradient id="lampLightGradient" cx="50%" cy="0%" r="78%">
            <stop offset="0%" stopColor="rgba(255,245,190,0.78)" />
            <stop offset="52%" stopColor="rgba(255,226,133,0.22)" />
            <stop offset="100%" stopColor="rgba(255,226,133,0)" />
          </radialGradient>
          <filter id="lampSoftBlur">
            <feGaussianBlur stdDeviation="9" />
          </filter>
        </defs>

        <motion.ellipse
          cx="110"
          cy="136"
          rx="72"
          ry="30"
          fill="rgba(255,228,146,0.62)"
          filter="url(#lampSoftBlur)"
          animate={{ opacity: isOn ? [0.42, 0.72, 0.42] : 0.06 }}
          transition={lightTransition}
        />
        <motion.path
          d="M52 132 L168 132 L184 318 L36 318 Z"
          fill="url(#lampLightGradient)"
          animate={{ opacity: isOn ? [0.28, 0.48, 0.28] : 0.03 }}
          transition={lightTransition}
        />

        <motion.rect
          x="101"
          y="132"
          width="18"
          height="154"
          rx="9"
          fill="url(#lampBaseGradient)"
          animate={{ y: stickY }}
          transition={stickTransition}
        />
        <motion.rect
          x="92"
          y="124"
          width="36"
          height="14"
          rx="7"
          fill="url(#lampBaseGradient)"
          animate={{ y: stickY }}
          transition={stickTransition}
        />
        <ellipse cx="110" cy="294" rx="54" ry="10" fill="rgba(0,0,0,0.3)" />
        <rect x="62" y="282" width="96" height="16" rx="8" fill="url(#lampBaseGradient)" />

        <motion.g>
          <motion.path
            d="M150 115 C156 138 142 152 151 178"
            fill="none"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="3"
            strokeLinecap="round"
            animate={{ d: cordPath }}
            transition={
              activePull > 0
                ? { type: "spring", stiffness: 190, damping: 15 }
                : { duration: 0.24, ease: "easeOut" }
            }
          />
          {!open && (
            <motion.circle
              cx="151"
              cy="188"
              r="15"
              fill="none"
              stroke={tone.accent}
              strokeWidth="2"
              animate={{
                cy: 188 + activePull,
                r: activePull > 0 ? 13 : [12, 20, 12],
                opacity: activePull > 0 ? 0.12 : [0.18, 0.52, 0.18],
              }}
              transition={
                activePull > 0
                  ? { duration: 0.2, ease: "easeOut" }
                  : { duration: 2.3, repeat: Infinity, ease: "easeInOut" }
              }
            />
          )}
          <motion.circle
            cx="151"
            cy="188"
            r="8"
            fill={tone.accent}
            animate={{ cy: 188 + activePull }}
            transition={
              activePull > 0
                ? { type: "spring", stiffness: 220, damping: 16 }
                : { duration: 0.24, ease: "easeOut" }
            }
          />
          <motion.circle
            cx="151"
            cy="188"
            r="13"
            fill={tone.accent}
            opacity="0.13"
            animate={{ cy: 188 + activePull }}
            transition={
              activePull > 0
                ? { type: "spring", stiffness: 220, damping: 16 }
                : { duration: 0.24, ease: "easeOut" }
            }
          />
        </motion.g>

        <motion.g
          animate={{
            y: shadeY,
            rotate: shadeRotate,
          }}
          transition={shadeTransition}
          style={{ transformOrigin: "110px 126px" }}
        >
          <rect x="106" y="57" width="8" height="14" rx="4" fill="url(#lampBaseGradient)" />
          <ellipse cx="110" cy="69" rx="17" ry="5" fill="rgba(255,255,255,0.28)" />
          <motion.path
            d="M72 72 C83 64 137 64 148 72 L174 124 C177 130 171 134 160 136 C132 140 88 140 60 136 C49 134 43 130 46 124 Z"
            fill="url(#lampShadeGradient)"
            animate={{
              filter: isOn
                ? `drop-shadow(0 0 26px ${tone.glow})`
                : "drop-shadow(0 12px 18px rgba(0,0,0,0.24))",
            }}
            transition={shadeTransition}
          />
          <path
            d="M48 125 C69 135 151 135 172 125 C166 137 54 137 48 125 Z"
            fill="url(#lampShadeUnderGradient)"
          />
          <path
            d="M48 125 C69 135 151 135 172 125"
            fill="none"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M61 122 C64 99 77 81 96 73"
            fill="none"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <motion.g animate={{ y: mood === "success" ? [0, -2, 0] : 0 }}>
            <rect x="82" y={102 + eyeY} width="14" height={eyeHeight} rx="2" fill="#1d211f" />
            <rect x="124" y={102 + eyeY} width="14" height={eyeHeight} rx="2" fill="#1d211f" />
            <motion.path
              d={mood === "error" ? "M99 120 Q110 113 121 120" : "M98 117 Q110 126 122 117"}
              fill="none"
              stroke="#1d211f"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </motion.g>
        </motion.g>
      </motion.svg>

      <motion.div
        className="absolute left-1/2 bottom-7 h-4 w-36 -translate-x-1/2 rounded-full bg-black/45 blur-md"
        animate={{
          scaleX: isOn ? [0.82, 1, 0.82] : 0.74,
          opacity: isOn ? [0.38, 0.56, 0.38] : 0.3,
        }}
        transition={shadowTransition}
      />
    </>
  );
}

function PullLampHint({ tone, active }: { tone: LampTone; active: boolean }) {
  return (
    <motion.div
      className="pointer-events-none absolute left-[184px] top-[158px] z-30 flex items-center gap-3"
      initial={{ opacity: 0, x: -10, y: 8, scale: 0.96 }}
      animate={{
        opacity: active ? 0 : [0.74, 1, 0.74],
        x: 0,
        y: active ? 10 : [0, -6, 0],
        scale: active ? 0.97 : 1,
      }}
      transition={
        active
          ? { duration: 0.18, ease: "easeOut" }
          : { duration: 3.2, repeat: Infinity, ease: "easeInOut" }
      }
    >
      <span
        className="h-px w-10 rounded-full"
        style={{
          background: `linear-gradient(90deg, ${tone.accent}, rgba(255,255,255,0.08))`,
          boxShadow: `0 0 14px ${tone.glow}`,
        }}
      />
      <div className="flex items-center gap-2 rounded-full border border-[#4caf50]/25 bg-[linear-gradient(135deg,rgba(18,20,23,0.9),rgba(255,255,255,0.075))] px-3 py-2 shadow-[0_14px_34px_rgba(0,0,0,0.3),0_0_24px_rgba(76,175,80,0.13)] backdrop-blur-xl">
        <motion.span
          className="grid size-6 place-items-center rounded-full text-[#101417]"
          style={{ background: `linear-gradient(135deg, ${tone.accent}, #d8efbc)` }}
          animate={{ y: [0, 3, 0] }}
          transition={{ duration: 1.25, repeat: Infinity, ease: "easeInOut" }}
        >
          <ArrowDown className="size-3.5" strokeWidth={2.8} />
        </motion.span>
        <span className="whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.18em] text-white/78">
          Pull to enter
        </span>
      </div>
    </motion.div>
  );
}

function FallingDust({ tone, active }: { tone: LampTone; active: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {Array.from({ length: 16 }).map((_, index) => (
        <motion.span
          key={index}
          className="absolute rounded-full"
          style={{
            left: `${8 + index * 5.8}%`,
            top: `${12 + (index % 5) * 15}%`,
            width: index % 4 === 0 ? 3 : 2,
            height: index % 4 === 0 ? 3 : 2,
            background: index % 3 === 0 ? tone.accent : "rgba(255,255,255,0.6)",
            boxShadow: `0 0 10px ${tone.glow}`,
            opacity: active ? 1 : 0.14,
          }}
          animate={active ? { y: [0, -18, 0], opacity: [0.18, 0.72, 0.18] } : undefined}
          transition={
            active
              ? {
                  duration: 4 + (index % 4),
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: index * 0.18,
                }
              : undefined
          }
        />
      ))}
    </div>
  );
}
