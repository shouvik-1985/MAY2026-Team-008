import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Bell, Camera, Globe, Eye, Loader2, Lock, Palette, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { GlassCard, PageTransition, SectionHeading } from "@/components/app/cinematic";
import { resetStudentBiometric } from "@/lib/api";
import { getStoredDashboard, setStoredDashboard, useStudentDashboard } from "@/lib/student-session";
import { useTheme } from "@/lib/theme";

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
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";
  const { dashboard } = useStudentDashboard();
  const [state, setState] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem("cv-settings-preferences");
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });

  useEffect(() => {
    localStorage.setItem("cv-settings-preferences", JSON.stringify(state));
  }, [state]);

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
        <GlassCard className={!isDark ? "bg-white/95 border-slate-200 shadow-sm" : ""}>
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <span className={`size-10 rounded-2xl flex items-center justify-center ${
                  isDark ? "glass text-white/80" : "bg-indigo-50 border border-indigo-200 text-indigo-600 shadow-2xs"
                }`}>
                  <ShieldCheck className="size-4" />
                </span>
                <div>
                  <div className={`text-[10px] uppercase tracking-[0.3em] font-bold ${isDark ? "text-white/40" : "text-slate-500"}`}>Biometric</div>
                  <div className={`font-display text-xl font-extrabold ${isDark ? "text-white" : "text-slate-950"}`}>Face template</div>
                </div>
              </div>
              <div className={`mt-4 text-sm font-medium ${isDark ? "text-white/65" : "text-slate-700"}`}>
                {biometricEnrolled
                  ? "This account already has an enrolled webcam face template for attendance verification."
                  : "No face template is enrolled yet. The first successful campus scan will create it for this student account."}
              </div>
              <div className={`mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold ${isDark ? "text-white/50" : "text-slate-600"}`}>
                <span className={`rounded-full border px-3 py-1 uppercase tracking-[0.18em] font-bold ${
                  biometricEnrolled
                    ? isDark
                      ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-200"
                      : "border-emerald-300 bg-emerald-50 text-emerald-950 shadow-2xs"
                    : isDark
                      ? "border-amber-300/20 bg-amber-400/10 text-amber-100"
                      : "border-amber-400 bg-amber-50 text-amber-950 shadow-2xs"
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
                className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] transition ${
                  isDark ? "border-white/12 bg-white/[0.05] text-white/80 hover:text-white" : "border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200 shadow-2xs"
                }`}
              >
                <Camera className="size-4" />
                Check campus and open scanner
              </button>
              <button
                type="button"
                onClick={() => void handleBiometricReset()}
                disabled={biometricBusy}
                className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs font-extrabold uppercase tracking-[0.18em] text-white shadow-md transition disabled:cursor-wait disabled:opacity-70"
                style={{ background: "var(--grad-aurora)" }}
              >
                {biometricBusy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                Reset enrolled face
              </button>
            </div>
          </div>
          {biometricStatus ? (
            <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${
              isDark ? "border-white/10 bg-white/[0.04] text-white/70" : "border-slate-300 bg-slate-100 text-slate-800 shadow-2xs"
            }`}>
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
            <GlassCard className={!isDark ? "bg-white/95 border-slate-200 shadow-sm" : ""}>
              <div className="flex items-center gap-3 mb-5">
                <span className={`size-10 rounded-2xl flex items-center justify-center ${
                  isDark ? "glass text-white/80" : "bg-indigo-50 border border-indigo-200 text-indigo-600 shadow-2xs"
                }`}>
                  <g.icon className="size-4" />
                </span>
                <div className={`font-display text-xl font-extrabold ${isDark ? "text-white" : "text-slate-950"}`}>{g.title}</div>
              </div>
              <div className="space-y-2.5">
                {g.items.map((item) => {
                  const key = g.title + ":" + item;
                  const isThemeDark = key === "Theme:Dark";
                  const on = isThemeDark ? isDark : (state[key] ?? DEFAULT_ON.has(key));
                  return (
                    <div
                      key={item}
                      className={`flex items-center justify-between p-2.5 rounded-2xl transition ${
                        isDark ? "hover:bg-white/5 text-white" : "hover:bg-slate-100/80 text-slate-950 font-bold"
                      }`}
                    >
                      <span className="text-sm font-bold">{item}</span>
                      <Toggle
                        on={on}
                        isDark={isDark}
                        onClick={() => {
                          if (isThemeDark) {
                            setTheme(isDark ? "light" : "dark");
                          } else {
                            toggle(key);
                          }
                        }}
                      />
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

function Toggle({ on, isDark = true, onClick }: { on: boolean; isDark?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative w-11 h-6 rounded-full transition-all ${
        on
          ? ""
          : isDark
            ? "bg-white/15"
            : "bg-slate-300 border border-slate-400/50 shadow-inner"
      }`}
      style={{ background: on ? "var(--grad-aurora)" : undefined }}
    >
      <motion.span
        className={`absolute top-0.5 size-5 rounded-full ${
          on ? "bg-white shadow-md" : isDark ? "bg-white" : "bg-slate-700 shadow-sm"
        }`}
        animate={{ left: on ? 22 : 2 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    </button>
  );
}
