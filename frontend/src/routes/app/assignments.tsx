import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Upload, Clock, CheckCircle2 } from "lucide-react";
import { GlassCard, PageTransition, SectionHeading } from "@/components/app/cinematic";
import { type StudentDashboard } from "@/lib/api";
import { useStudentDashboard } from "@/lib/student-session";

export const Route = createFileRoute("/app/assignments")({ component: AssignmentsPage });

type Assignment = StudentDashboard["assignment_items"][number];

function AssignmentsPage() {
  const { dashboard } = useStudentDashboard();
  const assignments = dashboard?.assignment_items ?? [];

  return (
    <PageTransition>
      <SectionHeading
        eyebrow="Workspace"
        title="Assignments"
        sub="Track, draft, submit - without losing momentum."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-10">
        {assignments.map((a, i) => (
          <motion.div
            key={a.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <GlassCard hover>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">
                    {a.subject}
                  </div>
                  <div className="font-display text-xl mt-1">{a.title}</div>
                </div>
                <StatusPill status={a.status} grade={a.grade} />
              </div>

              <div className="mt-5 flex items-center gap-2 text-xs text-white/55">
                <Clock className="size-3.5" /> {a.due}
              </div>

              <div className="mt-4 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${a.progress}%` }}
                  transition={{ duration: 1 }}
                  className="h-full"
                  style={{ background: "var(--grad-aurora)" }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="text-xs text-white/45">{a.progress}% complete</div>
                <button className="text-xs uppercase tracking-[0.2em] text-white/70 hover:text-white inline-flex items-center gap-2 glass rounded-full px-3 py-1.5">
                  <Upload className="size-3.5" /> Upload
                </button>
              </div>
            </GlassCard>
          </motion.div>
        ))}
      </div>

      <GlassCard>
        <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">
          Submission timeline
        </div>
        <div className="font-display text-xl mt-1 mb-5">Recent activity</div>
        <div className="relative pl-6">
          <div className="absolute left-2 top-0 bottom-0 w-px bg-gradient-to-b from-white/30 via-white/10 to-transparent" />
          {timeline(assignments).map((e, i) => (
            <motion.div
              key={`${e.t}-${e.l}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
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
    </PageTransition>
  );
}

function timeline(assignments: Assignment[]) {
  if (!assignments.length) {
    return [{ t: "Now", l: "Assignment data is syncing from the backend" }];
  }
  return assignments.slice(0, 4).map((item, index) => ({
    t: index === 0 ? "Today" : `${index + 1} days ago`,
    l:
      item.status === "graded"
        ? `${item.title} graded ${item.grade ?? ""}`.trim()
        : `${item.title} is ${item.progress}% complete`,
  }));
}

function StatusPill({ status, grade }: { status: string; grade?: string }) {
  if (status === "graded")
    return (
      <span
        className="text-[10px] px-3 py-1.5 rounded-full uppercase tracking-[0.2em]"
        style={{ background: "oklch(0.6 0.2 150 / 0.2)", color: "oklch(0.85 0.18 150)" }}
      >
        <CheckCircle2 className="inline size-3 mr-1" />
        Grade {grade}
      </span>
    );
  if (status === "pending")
    return (
      <span className="text-[10px] px-3 py-1.5 rounded-full uppercase tracking-[0.2em] bg-white/5 text-white/55">
        Not started
      </span>
    );
  return (
    <span
      className="text-[10px] px-3 py-1.5 rounded-full uppercase tracking-[0.2em]"
      style={{ background: "oklch(0.72 0.27 350 / 0.2)", color: "oklch(0.85 0.18 350)" }}
    >
      In progress
    </span>
  );
}
