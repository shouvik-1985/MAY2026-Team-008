import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { GlassCard, PageTransition } from "@/components/app/cinematic";
import { useStudentDashboard } from "@/lib/student-session";

export const Route = createFileRoute("/app/complaints")({ component: ComplaintsPage });

const COMPLAINT_STAGES = ["Submitted", "Acknowledged", "Assigned", "In Progress", "Resolved"];

const STAGE_COLORS = [
  "oklch(0.7 0.25 310)",
  "oklch(0.82 0.18 200)",
  "oklch(0.85 0.12 60)",
  "oklch(0.72 0.27 350)",
  "oklch(0.7 0.22 150)",
];

function ComplaintsPage() {
  const { dashboard } = useStudentDashboard();
  const complaints = dashboard?.complaint_items ?? [];

  return (
    <PageTransition>
      <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
        <div>
          <div className="text-[10px] uppercase tracking-[0.4em] text-white/40 mb-3">
            Resolution
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight">Complaints</h1>
          <p className="mt-3 text-white/55 max-w-xl">
            Raise it once. Watch the entire campus respond.
          </p>
        </div>
        <button className="relative inline-flex items-center gap-2 px-6 py-3 rounded-full text-xs uppercase tracking-[0.2em] overflow-hidden">
          <span
            className="absolute inset-0 rounded-full"
            style={{ background: "var(--grad-aurora)" }}
          />
          <span className="absolute inset-px rounded-full bg-[#0a0a0a]/30" />
          <Plus className="relative z-10 size-4" />
          <span className="relative z-10">New complaint</span>
        </button>
      </div>

      <div className="space-y-5">
        {complaints.length === 0 && (
          <GlassCard>
            <div className="text-sm text-white/50">Complaint data is syncing from the backend.</div>
          </GlassCard>
        )}
        {complaints.map((c, i) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <GlassCard>
              <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">
                    {c.id} / {c.category}
                  </div>
                  <div className="font-display text-xl mt-1">{c.title}</div>
                </div>
                <div className="text-xs text-white/50">Created {c.created}</div>
              </div>

              <div className="relative">
                <div className="absolute top-3 left-0 right-0 h-px bg-white/10" />
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(c.stage / (COMPLAINT_STAGES.length - 1)) * 100}%` }}
                  transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute top-3 left-0 h-px"
                  style={{ background: "var(--grad-aurora)" }}
                />
                <div className="relative grid grid-cols-5 gap-2">
                  {COMPLAINT_STAGES.map((stage, idx) => {
                    const done = idx <= c.stage;
                    return (
                      <div key={stage} className="flex flex-col items-center text-center">
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: 0.1 + idx * 0.1 }}
                          className="size-6 rounded-full border-2 mb-2"
                          style={{
                            background: done ? STAGE_COLORS[idx] : "#050505",
                            borderColor: done ? STAGE_COLORS[idx] : "oklch(1 0 0 / 0.15)",
                            boxShadow: done ? `0 0 20px ${STAGE_COLORS[idx]}` : "none",
                          }}
                        />
                        <div
                          className={`text-[10px] uppercase tracking-[0.2em] ${done ? "text-white" : "text-white/35"}`}
                        >
                          {stage}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </GlassCard>
          </motion.div>
        ))}
      </div>
    </PageTransition>
  );
}
