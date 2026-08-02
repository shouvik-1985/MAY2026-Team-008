import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { GlassCard, PageTransition, SectionHeading, Counter } from "@/components/app/cinematic";
import { useStudentDashboard } from "@/lib/student-session";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/app/attendance")({ component: AttendancePage });

function AttendancePage() {
  const { theme } = useTheme();
  const { dashboard } = useStudentDashboard();
  const isDark = theme === "dark";
  const overall = Math.round(dashboard?.user.attendance ?? 0);
  const weekly = dashboard?.attendance_weekly ?? [];
  const timeline = dashboard?.attendance_timeline ?? [];
  const monthly = dashboard?.attendance_monthly ?? [];
  const markedWeekly = weekly.filter((item) => item.marked ?? true);
  const weeklyAverage = markedWeekly.length
    ? Math.round(markedWeekly.reduce((sum, item) => sum + item.attendance, 0) / markedWeekly.length)
    : overall;
  const predicted = Math.min(100, overall + 1.4).toFixed(1);

  let monthlyChangeText = "Current semester";
  if (monthly.length >= 2) {
    const lastMonth = monthly[monthly.length - 1].attendance;
    const prevMonth = monthly[monthly.length - 2].attendance;
    const diff = Math.round(lastMonth - prevMonth);
    monthlyChangeText = diff > 0 ? `+${diff}% vs last month` : `${diff}% vs last month`;
  }
  return (
    <PageTransition>
      <SectionHeading
        eyebrow="Presence"
        title="Attendance"
        sub="Every class, captured. Every trend, visualized."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
        <GlassCard className="lg:col-span-1 flex flex-col items-center text-center">
          <div className={`text-[10px] uppercase tracking-[0.3em] ${isDark ? "text-white/40" : "text-slate-500"}`}>Overall</div>
          <Ring pct={overall} />
          <div className={`mt-2 flex items-center gap-1 text-xs ${isDark ? "text-white/55" : "text-slate-600"}`}>
            <TrendingUp className="size-3" /> {monthlyChangeText}
          </div>
          <div className={`mt-1 text-xs ${isDark ? "text-white/55" : "text-slate-600"}`}>
            Prediction at semester end: <span className={`font-medium ${isDark ? "text-white" : "text-slate-900"}`}>{predicted}%</span>
          </div>
        </GlassCard>

        <GlassCard className="lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className={`text-[10px] uppercase tracking-[0.3em] ${isDark ? "text-white/40" : "text-slate-500"}`}>Weekly</div>
              <div className={`font-display text-xl ${isDark ? "text-white" : "text-slate-900"}`}>Last 7 days</div>
            </div>
            <div className={`text-sm ${isDark ? "text-white/55" : "text-slate-600"}`}>
              Avg <span className={`font-medium ${isDark ? "text-white" : "text-slate-900"}`}>{weeklyAverage}%</span>
            </div>
          </div>
          <div className="flex items-end gap-3 h-48">
            {weekly.map((item, i) => {
              const marked = item.marked ?? true;
              const isPresent = item.status === "present" || item.attendance > 0;
              const height = marked ? Math.max(item.attendance, 4) : 4;
              return (
              <motion.div
                key={item.date ?? `${item.day}-${i}`}
                initial={{ height: 0 }}
                animate={{ height: `${height}%` }}
                transition={{ delay: i * 0.06, duration: 0.7 }}
                className={`flex-1 rounded-t-xl relative ${marked ? "" : "opacity-35"}`}
                style={{
                  background: marked
                    ? isPresent
                      ? "linear-gradient(180deg, oklch(0.7 0.25 310), oklch(0.65 0.25 260 / 0.3))"
                      : "linear-gradient(180deg, oklch(0.68 0.22 20), oklch(0.48 0.18 20 / 0.28))"
                    : isDark
                      ? "linear-gradient(180deg, oklch(1 0 0 / 0.20), oklch(1 0 0 / 0.04))"
                      : "linear-gradient(180deg, rgba(148,163,184,0.32), rgba(148,163,184,0.08))",
                }}
                title={`${item.day}${item.label ? `, ${item.label}` : ""}: ${
                  marked ? `${item.attendance}% ${item.status ?? ""}` : "Not marked"
                }`}
              >
                <div
                  className={`absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] ${
                    marked ? (isDark ? "text-white/50" : "text-slate-500") : isDark ? "text-white/28" : "text-slate-300"
                  }`}
                >
                  {marked ? `${item.attendance}%` : "-"}
                </div>
              </motion.div>
              );
            })}
          </div>
          <div className={`mt-2 flex justify-between text-[10px] uppercase tracking-widest ${isDark ? "text-white/40" : "text-slate-500"}`}>
            {weekly.map((item, index) => (
              <span
                key={item.date ?? `${item.day}-${index}`}
                className={`flex min-w-0 flex-1 flex-col items-center gap-1 ${
                  item.isToday ? (isDark ? "text-white/80" : "text-slate-800") : ""
                }`}
              >
                <span>{item.day}</span>
                {item.label && <span className={`text-[9px] normal-case tracking-normal ${isDark ? "text-white/30" : "text-slate-400"}`}>{item.label}</span>}
              </span>
            ))}
          </div>
        </GlassCard>
      </div>

      <GlassCard className="mb-8">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className={`text-[10px] uppercase tracking-[0.3em] ${isDark ? "text-white/40" : "text-slate-500"}`}>Monthly</div>
            <div className={`font-display text-xl ${isDark ? "text-white" : "text-slate-900"}`}>Last 12 months</div>
          </div>
        </div>
        <svg viewBox="0 0 600 160" className="w-full h-40">
          <defs>
            <linearGradient id="a-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={isDark ? "oklch(0.7 0.25 310)" : "#4f46e5"} stopOpacity="0.45" />
              <stop offset="100%" stopColor={isDark ? "oklch(0.7 0.25 310)" : "#4f46e5"} stopOpacity="0" />
            </linearGradient>
          </defs>
          <motion.path
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 2 }}
            d={`M ${monthly.map((item, i) => `${(i / Math.max(monthly.length - 1, 1)) * 580 + 10},${150 - item.attendance * 1.2}`).join(" L ")}`}
            fill="none"
            stroke={isDark ? "oklch(0.82 0.18 200)" : "#2563eb"}
            strokeWidth="3.5"
          />
          <path
            d={`M 10,150 L ${monthly.map((item, i) => `${(i / Math.max(monthly.length - 1, 1)) * 580 + 10},${150 - item.attendance * 1.2}`).join(" L ")} L 590,150 Z`}
            fill="url(#a-fill)"
          />
        </svg>
      </GlassCard>

      <div>
        <div className={`mb-3 text-[10px] uppercase tracking-[0.3em] font-bold ${isDark ? "text-white/50" : "text-slate-600"}`}>Daily records</div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {timeline.slice(-9).reverse().map((item, i) => (
            <motion.div
              key={item.date}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <GlassCard hover>
                <div className="flex items-center justify-between">
                  <div className="font-medium">{item.label}</div>
                  <div className={`text-sm ${isDark ? "text-white/80" : "text-slate-700"}`}>
                    {item.attendance}%
                  </div>
                </div>
                <div className={`mt-3 h-1.5 overflow-hidden rounded-full ${isDark ? "bg-white/10" : "bg-slate-200"}`}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${item.attendance}%` }}
                    transition={{ duration: 1.2 }}
                    className="h-full rounded-full"
                    style={{
                      background: "linear-gradient(90deg, oklch(0.82 0.18 200), oklch(0.65 0.25 260))",
                    }}
                  />
                </div>
                <div className={`mt-2 text-xs ${isDark ? "text-white/45" : "text-slate-500"}`}>
                  {item.status === "present" ? "Marked present" : "Marked absent"}
                </div>
              </GlassCard>
            </motion.div>
          ))}
          {!timeline.length && (
            <GlassCard>
              <div className={`text-sm ${isDark ? "text-white/55" : "text-slate-600"}`}>No attendance records marked yet.</div>
            </GlassCard>
          )}
        </div>
      </div>
    </PageTransition>
  );
}

function Ring({ pct }: { pct: number }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const r = 70,
    c = 2 * Math.PI * r;
  return (
    <div className="relative size-48 my-4">
      <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
        <circle cx="100" cy="100" r={r} fill="none" stroke={isDark ? "oklch(1 0 0 / 0.08)" : "rgba(148,163,184,0.22)"} strokeWidth="12" />
        <motion.circle
          cx="100"
          cy="100"
          r={r}
          fill="none"
          stroke="url(#ring-grad)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (c * pct) / 100 }}
          transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
        />
        <defs>
          <linearGradient id="ring-grad" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.65 0.28 305)" />
            <stop offset="100%" stopColor="oklch(0.82 0.18 200)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-display text-5xl font-bold">
          <Counter value={pct} suffix="%" />
        </div>
        <div className={`mt-1 text-[10px] uppercase tracking-[0.3em] ${isDark ? "text-white/40" : "text-slate-500"}`}>attendance</div>
      </div>
    </div>
  );
}
