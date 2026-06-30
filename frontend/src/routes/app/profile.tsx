import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Edit3, Award as AwardIcon } from "lucide-react";
import { GlassCard, PageTransition } from "@/components/app/cinematic";
import { getStoredUser } from "@/lib/auth";
import { useStudentDashboard } from "@/lib/student-session";

export const Route = createFileRoute("/app/profile")({ component: ProfilePage });

function ProfilePage() {
  const { dashboard } = useStudentDashboard();
  const authUser = getStoredUser();
  const user = dashboard?.user ?? {
    name: authUser?.full_name ?? "Student",
    email: authUser?.email ?? "",
    studentCode: "Syncing",
    department: "CampusVerse",
    semester: 1,
    cgpa: 0,
    attendance: 0,
    avatar:
      authUser?.full_name
        .split(" ")
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase() || "CV",
  };
  const achievements = dashboard?.achievements ?? [];
  const skills = dashboard?.skills ?? [];
  const activity = dashboard?.activity ?? [];
  const credits = `${Math.min(180, user.semester * 22)} / 180`;
  const rank = user.cgpa >= 9 ? "Top 8%" : user.cgpa >= 8.5 ? "Top 15%" : "Active";
  const badgeCount = Math.max(3, Math.min(6, achievements.length || 3));

  return (
    <PageTransition>
      <div className="relative rounded-3xl overflow-hidden mb-8">
        <div className="absolute inset-0" style={{ background: "var(--grad-aurora)" }} />
        <div className="absolute inset-0 grid-bg opacity-30" />
        <div className="absolute inset-px rounded-3xl bg-[#050505]/70" />
        <div className="relative p-8 md:p-12 flex flex-col md:flex-row items-start gap-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="size-28 rounded-3xl flex items-center justify-center font-display text-4xl font-bold relative overflow-hidden"
          >
            <span className="absolute inset-0" style={{ background: "var(--grad-aurora)" }} />
            <span className="relative">{user.avatar}</span>
          </motion.div>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-[0.4em] text-white/60">
              {user.studentCode}
            </div>
            <h1 className="font-display text-4xl md:text-5xl font-bold mt-2">{user.name}</h1>
            <div className="mt-2 text-white/70">
              {user.department} / Semester {user.semester}
            </div>
            {user.email && <div className="mt-1 text-sm text-white/45">{user.email}</div>}
            <div className="mt-6 flex flex-wrap gap-3">
              <Stat label="CGPA" value={user.cgpa ? user.cgpa.toFixed(1) : "Syncing"} />
              <Stat label="Attendance" value={`${Math.round(user.attendance)}%`} />
              <Stat label="Credits" value={credits} />
              <Stat label="Rank" value={rank} />
            </div>
          </div>
          <button className="glass-strong rounded-full px-5 py-2.5 text-xs uppercase tracking-[0.2em] flex items-center gap-2">
            <Edit3 className="size-3.5" /> Edit
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <GlassCard className="lg:col-span-2">
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Activity</div>
          <div className="font-display text-xl mt-1 mb-5">Last 30 days</div>
          <div className="relative pl-6">
            <div className="absolute left-2 top-0 bottom-0 w-px bg-gradient-to-b from-white/30 via-white/10 to-transparent" />
            {(activity.length ? activity : [{ t: "Now", l: "Profile syncing with backend" }]).map((e, i) => (
              <motion.div
                key={`${e.t}-${e.l}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="relative pb-5"
              >
                <span
                  className="absolute -left-[18px] top-1.5 size-2.5 rounded-full"
                  style={{ background: "var(--grad-aurora)" }}
                />
                <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">{e.t}</div>
                <div className="text-sm">{e.l}</div>
              </motion.div>
            ))}
          </div>
        </GlassCard>

        <div className="space-y-5">
          <GlassCard>
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Skills</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(skills.length ? skills : ["Backend sync"]).map((s) => (
                <span key={s} className="text-xs px-3 py-1.5 rounded-full glass">
                  {s}
                </span>
              ))}
            </div>
          </GlassCard>

          <GlassCard>
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Badges</div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {Array.from({ length: badgeCount }, (_, i) => i + 1).map((i) => (
                <div
                  key={i}
                  className="aspect-square rounded-2xl flex items-center justify-center relative overflow-hidden"
                >
                  <div
                    className="absolute inset-0"
                    style={{
                      background: `conic-gradient(from ${i * 60}deg, oklch(0.7 0.25 310), oklch(0.82 0.18 200), oklch(0.85 0.12 60))`,
                    }}
                  />
                  <div className="absolute inset-1 rounded-2xl bg-[#0a0a0a]" />
                  <AwardIcon className="relative size-5 text-white" />
                </div>
              ))}
            </div>
          </GlassCard>
        </div>

        <GlassCard className="lg:col-span-3">
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Achievements</div>
          <div className="font-display text-xl mt-1 mb-5">Highlights</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {(achievements.length
              ? achievements
              : [{ name: "Backend profile sync", year: "Pending" }]
            ).map((a, i) => (
              <motion.div
                key={a.name}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass rounded-2xl p-4"
              >
                <AwardIcon className="size-4 text-white/60" />
                <div className="font-medium mt-2">{a.name}</div>
                <div className="text-xs text-white/45">{a.year}</div>
              </motion.div>
            ))}
          </div>
        </GlassCard>
      </div>
    </PageTransition>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-strong rounded-2xl px-4 py-2.5">
      <div className="text-[9px] uppercase tracking-[0.3em] text-white/50">{label}</div>
      <div className="font-display text-lg mt-0.5">{value}</div>
    </div>
  );
}
