import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState } from "react";
import { Bell, Camera, Globe, Eye, Loader2, Lock, Palette, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { GlassCard, PageTransition, SectionHeading } from "@/components/app/cinematic";
import { resetStudentBiometric } from "@/lib/api";
import { getStoredDashboard, setStoredDashboard, useStudentDashboard } from "@/lib/student-session";

export const Route = createFileRoute("/app/settings")({ component: SettingsPage });

const GROUPS = [
  {
    icon: Palette,
    title: "Theme",
    items: ["Dark", "System sync", "Reduce motion", "High contrast"],
  },
  {
    icon: Bell,
    title: "Notifications",
    items: ["Push notifications", "Email digest", "Assignment alerts", "Event reminders"],
  },
  {
    icon: Lock,
    title: "Privacy",
    items: ["Profile visibility", "Show CGPA publicly", "Allow mentions", "Marketplace visibility"],
  },
  { icon: Globe, title: "Language", items: ["English", "Hindi", "Tamil", "French"] },
  {
    icon: Eye,
    title: "Accessibility",
    items: ["Screen reader hints", "Large text", "Focus rings", "Captions"],
  },
  {
    icon: Smartphone,
    title: "Connected devices",
    items: ["iPhone 15 Pro", "Macbook Air", "iPad Studio", "Campus tablet"],
  },
];

const DEFAULT_ON = new Set([
  "Theme:Dark",
  "Notifications:Assignment alerts",
  "Notifications:Event reminders",
  "Privacy:Profile visibility",
  "Accessibility:Focus rings",
]);

function SettingsPage() {
  const { dashboard } = useStudentDashboard();
  const [state, setState] = useState<Record<string, boolean>>({});
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [biometricStatus, setBiometricStatus] = useState<string | null>(null);

  function toggle(k: string) {
    setState((s) => ({ ...s, [k]: !s[k] }));
  }

  const biometricEnrolled = Boolean(dashboard?.user.biometricEnrolled);
  const biometricEnrolledAt = dashboard?.user.biometricEnrolledAt;

  function syncStoredBiometric(enrolled: boolean, enrolledAt: string | null) {
    const stored = getStoredDashboard();
    if (!stored) return;
    setStoredDashboard({
      ...stored,
      user: {
        ...stored.user,
        biometricEnrolled: enrolled,
        biometricEnrolledAt: enrolledAt,
      },
    });
  }

  async function handleBiometricReset() {
    setBiometricBusy(true);
    setBiometricStatus(null);
    try {
      await resetStudentBiometric();
      syncStoredBiometric(false, null);
      window.dispatchEvent(new Event("cv-biometric-template-reset"));
      setBiometricStatus("Face template cleared. The scanner will enroll a fresh face on the next biometric verification.");
    } catch (error) {
      setBiometricStatus(error instanceof Error ? error.message : "Could not clear the enrolled face template");
    } finally {
      setBiometricBusy(false);
    }
  }

  function handleOpenScanner() {
    window.dispatchEvent(new Event("cv-biometric-check-now"));
    setBiometricStatus("Scanner check requested. If you are inside the campus radius, the biometric modal will open.");
  }

  return (
    <PageTransition>
      <SectionHeading
        eyebrow="Preferences"
        title="Settings"
        sub="Tune the Verse exactly how you like it."
      />
      <div className="mb-5">
        <GlassCard>
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <span className="size-10 rounded-2xl glass flex items-center justify-center">
                  <ShieldCheck className="size-4 text-white/80" />
                </span>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Biometric</div>
                  <div className="font-display text-xl">Face template</div>
                </div>
              </div>
              <div className="mt-4 text-sm text-white/65">
                {biometricEnrolled
                  ? "This account already has an enrolled webcam face template for attendance verification."
                  : "No face template is enrolled yet. The first successful campus scan will create it for this student account."}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-white/50">
                <span className={`rounded-full border px-3 py-1 uppercase tracking-[0.18em] ${
                  biometricEnrolled
                    ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-200"
                    : "border-amber-300/20 bg-amber-400/10 text-amber-100"
                }`}>
                  {biometricEnrolled ? "Enrolled" : "Pending"}
                </span>
                {biometricEnrolledAt ? <span>Last enrolled: {new Date(biometricEnrolledAt).toLocaleString()}</span> : null}
              </div>
            </div>
            <div className="flex w-full flex-col gap-3 md:w-auto md:min-w-[260px]">
              <button
                type="button"
                onClick={handleOpenScanner}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/80 transition hover:text-white"
              >
                <Camera className="size-4" />
                Check campus and open scanner
              </button>
              <button
                type="button"
                onClick={() => void handleBiometricReset()}
                disabled={biometricBusy}
                className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-white transition disabled:cursor-wait disabled:opacity-70"
                style={{ background: "var(--grad-aurora)" }}
              >
                {biometricBusy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                Reset enrolled face
              </button>
            </div>
          </div>
          {biometricStatus ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/70">
              {biometricStatus}
            </div>
          ) : null}
        </GlassCard>
      </div>
      <div className="grid md:grid-cols-2 gap-5">
        {GROUPS.map((g, i) => (
          <motion.div
            key={g.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <GlassCard>
              <div className="flex items-center gap-3 mb-5">
                <span className="size-10 rounded-2xl glass flex items-center justify-center">
                  <g.icon className="size-4 text-white/80" />
                </span>
                <div className="font-display text-xl">{g.title}</div>
              </div>
              <div className="space-y-2.5">
                {g.items.map((item) => {
                  const key = g.title + ":" + item;
                  const on = state[key] ?? DEFAULT_ON.has(key);
                  return (
                    <div
                      key={item}
                      className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-white/5"
                    >
                      <span className="text-sm">{item}</span>
                      <Toggle on={on} onClick={() => toggle(key)} />
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          </motion.div>
        ))}
      </div>
    </PageTransition>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative w-11 h-6 rounded-full transition-all"
      style={{ background: on ? "var(--grad-aurora)" : "oklch(1 0 0 / 0.1)" }}
    >
      <motion.span
        className="absolute top-0.5 size-5 rounded-full bg-white"
        animate={{ left: on ? 22 : 2 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    </button>
  );
}
