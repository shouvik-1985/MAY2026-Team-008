import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Award, Clock, Download } from "lucide-react";
import { useState } from "react";
import { GlassCard, PageTransition, SectionHeading } from "@/components/app/cinematic";
import { useStudentDashboard } from "@/lib/student-session";

export const Route = createFileRoute("/app/certificates")({ component: CertificatesPage });

function CertificatesPage() {
  const [processing, setProcessing] = useState<number | null>(null);
  const { dashboard } = useStudentDashboard();
  const certificates = dashboard?.certificate_items ?? [];
  const history = dashboard?.request_timeline.filter((item) => item.kind === "Certificate") ?? [];

  return (
    <PageTransition>
      <SectionHeading
        eyebrow="Verified"
        title="Certificates"
        sub="Request, track, and download - paperwork without the paper."
      />

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
        {certificates.map((c, i) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <GlassCard hover className="h-full flex flex-col">
              <motion.div
                whileHover={{ rotateY: 8 }}
                style={{ transformStyle: "preserve-3d" }}
                className="relative h-32 rounded-2xl mb-5 overflow-hidden flex items-center justify-center"
              >
                <div
                  className="absolute inset-0"
                  style={{ background: "var(--grad-aurora)", opacity: 0.7 }}
                />
                <div className="absolute inset-px rounded-2xl bg-[#0a0a0a]/50" />
                <Award className="relative size-10 text-white" />
              </motion.div>
              <div className="font-display text-lg">{c.name}</div>
              <div className="text-sm text-white/55 mt-1 flex-1">{c.desc}</div>
              <div className="text-xs text-white/45 mt-3 flex items-center gap-1.5">
                <Clock className="size-3" /> ETA {c.eta}
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => {
                    setProcessing(c.id);
                    setTimeout(() => setProcessing(null), 2400);
                  }}
                  className="flex-1 relative overflow-hidden rounded-full py-2.5 text-xs uppercase tracking-[0.2em]"
                >
                  <span
                    className="absolute inset-0 rounded-full"
                    style={{ background: "var(--grad-aurora)" }}
                  />
                  <span className="absolute inset-px rounded-full bg-[#0a0a0a]/30" />
                  <span className="relative">
                    {processing === c.id ? "Processing..." : "Request"}
                  </span>
                </button>
                <button className="size-10 glass rounded-full flex items-center justify-center text-white/60 hover:text-white">
                  <Download className="size-4" />
                </button>
              </div>
              {processing === c.id && (
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 2.4 }}
                  className="mt-3 h-0.5"
                  style={{ background: "var(--grad-aurora)" }}
                />
              )}
            </GlassCard>
          </motion.div>
        ))}
      </div>

      <GlassCard>
        <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Request history</div>
        <div className="font-display text-xl mt-1 mb-5">Past 6 months</div>
        <div className="space-y-3">
          {(history.length ? history : [{ title: "Certificate history syncing", updated: "Now", stage: "Pending" }]).map((r, i) => (
            <motion.div
              key={`${r.title}-${i}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center justify-between p-3 rounded-2xl hover:bg-white/5 transition"
            >
              <div>
                <div className="font-medium text-sm">{r.title}</div>
                <div className="text-xs text-white/45">{r.updated}</div>
              </div>
              <span
                className="text-[10px] uppercase tracking-[0.2em] px-3 py-1.5 rounded-full"
                style={{ background: "oklch(0.6 0.2 150 / 0.2)", color: "oklch(0.85 0.18 150)" }}
              >
                {r.stage}
              </span>
            </motion.div>
          ))}
        </div>
      </GlassCard>
    </PageTransition>
  );
}
