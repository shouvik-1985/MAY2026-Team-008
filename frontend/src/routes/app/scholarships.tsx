import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, FileText, XCircle, Sparkles } from "lucide-react";
import { GlassCard, PageTransition, SectionHeading } from "@/components/app/cinematic";
import { useStudentDashboard } from "@/lib/student-session";

export const Route = createFileRoute("/app/scholarships")({ component: ScholarshipsPage });

const STATUS_META: Record<
  string,
  { color: string; label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  approved: { color: "oklch(0.72 0.22 150)", label: "Approved", icon: CheckCircle2 },
  applied: { color: "oklch(0.82 0.18 150)", label: "Applied", icon: Clock },
  eligible: { color: "oklch(0.85 0.12 60)", label: "Eligible", icon: Sparkles },
  rejected: { color: "oklch(0.65 0.25 25)", label: "Rejected", icon: XCircle },
};

function ScholarshipsPage() {
  const { dashboard } = useStudentDashboard();
  const scholarships = dashboard?.scholarship_items ?? [];
  const [status, setStatus] = useState<string | null>(null);
  const [activeScholarship, setActiveScholarship] = useState<any>(null);

  return (
    <PageTransition>
      {status && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 p-4 glass rounded-xl border border-white/10 text-sm text-white/80"
        >
          {status}
        </motion.div>
      )}

      {activeScholarship && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setActiveScholarship(null)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-full max-w-lg glass-strong rounded-2xl p-6 border border-white/10"
          >
            <button
              onClick={() => setActiveScholarship(null)}
              className="absolute right-4 top-4 text-white/50 hover:text-white"
            >
              <XCircle className="size-5" />
            </button>
            <div className="font-display text-2xl mb-2">{activeScholarship.name}</div>
            <div className="text-xl text-white/80 mb-4">{activeScholarship.amount}</div>
            
            <div className="flex items-center gap-2 mb-6">
              <span className="text-[10px] uppercase tracking-[0.2em] px-2.5 py-1 rounded-full bg-white/10">
                {activeScholarship.status}
              </span>
            </div>

            <div className="mb-6 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${activeScholarship.progress}%` }}
                className="h-full bg-white/40"
              />
            </div>
            
            <p className="text-sm text-white/70 leading-relaxed">
              This scholarship is administered by the university's financial aid office. Contact student services for documentation requirements.
            </p>
          </motion.div>
        </div>
      )}

      <SectionHeading
        eyebrow="Funding"
        title="Scholarships"
        sub="Every opportunity, surfaced. Every dream, supported."
      />

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
        {scholarships.map((s, i) => {
          const meta = STATUS_META[s.status] ?? STATUS_META.eligible;
          return (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <GlassCard hover className="h-full flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-display text-lg">{s.name}</div>
                  <span
                    className="text-[10px] uppercase tracking-[0.2em] px-2.5 py-1 rounded-full flex items-center gap-1"
                    style={{
                      background: `${meta.color.replace(")", " / 0.2)")}`,
                      color: meta.color,
                    }}
                  >
                    <meta.icon className="size-3" /> {meta.label}
                  </span>
                </div>
                <div className="font-display text-3xl mt-4">{s.amount}</div>
                <div className="text-xs text-white/45 mt-1">per semester</div>
                <div className="mt-4 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${s.progress}%` }}
                    transition={{ duration: 1.2 }}
                    className="h-full"
                    style={{
                      background: `linear-gradient(90deg, ${meta.color}, oklch(0.82 0.18 150))`,
                    }}
                  />
                </div>
                <div className="mt-5 flex gap-2">
                  <button 
                    onClick={() => setStatus("Scholarship documentation is managed through the financial aid office. Visit the student services desk for submission.")}
                    className="flex-1 glass rounded-full py-2 text-xs uppercase tracking-[0.2em] text-white/70 hover:text-white"
                  >
                    Documents
                  </button>
                  <button 
                    onClick={() => setActiveScholarship(s)}
                    className="flex-1 relative overflow-hidden rounded-full py-2 text-xs uppercase tracking-[0.2em]"
                  >
                    <span
                      className="absolute inset-0 rounded-full"
                      style={{ background: "var(--grad-aurora)" }}
                    />
                    <span className="absolute inset-px rounded-full bg-[#0a0a0a]/30" />
                    <span className="relative">View</span>
                  </button>
                </div>
              </GlassCard>
            </motion.div>
          );
        })}
      </div>

      <GlassCard>
        <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Funding timeline</div>
        <div className="font-display text-xl mt-1 mb-5">Recent disbursals</div>
        <div className="relative pl-6">
          <div className="absolute left-2 top-0 bottom-0 w-px bg-gradient-to-b from-white/30 via-white/10 to-transparent" />
          {scholarships.map((e, i) => (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              className="relative pb-5"
            >
              <span
                className="absolute -left-[18px] top-1.5 size-2.5 rounded-full"
                style={{ background: "var(--grad-aurora)" }}
              />
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">
                {e.status}
              </div>
              <div className="text-sm flex items-center gap-2">
                <FileText className="size-3.5 text-white/40" />
                {e.name} / {e.amount}
              </div>
            </motion.div>
          ))}
        </div>
      </GlassCard>
    </PageTransition>
  );
}
