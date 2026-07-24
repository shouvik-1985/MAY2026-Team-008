import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Download } from "lucide-react";
import { useState } from "react";
import { GlassCard, PageTransition, SectionHeading, Counter } from "@/components/app/cinematic";
import { openProtectedResource } from "@/lib/api";
import { useStudentDashboard } from "@/lib/student-session";

export const Route = createFileRoute("/app/fees")({ component: FeesPage });

function FeesPage() {
  const { dashboard } = useStudentDashboard();
  const [status, setStatus] = useState<string | null>(null);
  const summary = dashboard?.fee_summary ?? {
    outstanding: 0,
    semester: "Syncing",
    dueDate: "Syncing",
    clearance: "Syncing",
    trend: [0, 0, 0, 0, 0, 0],
  };
  const history = dashboard?.fee_history ?? [];
  const series = summary.trend.length ? summary.trend : [0];
  const max = Math.max(...series, 1);
  const hasDue = summary.outstanding > 0;

  return (
    <PageTransition>
      <SectionHeading
        eyebrow="Treasury"
        title="Fee Payment"
        sub="Clear, secure, and beautifully transparent."
      />

      {status ? (
        <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white/70">
          {status}
        </div>
      ) : null}

      <div className="grid lg:grid-cols-3 gap-5 mb-8">
        <GlassCard glow className="lg:col-span-2 relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-30"
            style={{ background: "var(--grad-aurora)" }}
          />
          <div className="absolute inset-px rounded-3xl bg-[#0a0a0a]/60" />
          <div className="relative">
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/60">
              Outstanding balance
            </div>
            <div className="font-display text-6xl md:text-7xl font-bold mt-3">
              {"\u20B9"} <Counter value={summary.outstanding} />
            </div>
            <div className="mt-2 text-sm text-white/60">
              {summary.semester} / {hasDue ? `Due ${summary.dueDate}` : summary.clearance}
            </div>
            <div className="mt-6 flex gap-3">
              <button
                disabled={!hasDue}
                onClick={() => {
                  if (!history[0]) return;
                  setStatus("CampusVerse has generated the current invoice. Complete payment through your finance desk or linked payment flow.");
                  void openProtectedResource(`/api/student/fees/invoices/${history[0].id}?download=true`, {
                    download: true,
                    fallbackName: `${history[0].id}.txt`,
                  }).catch((error) =>
                    setStatus(error instanceof Error ? error.message : "Could not open payment invoice"),
                  );
                }}
                className="relative overflow-hidden px-7 py-3 rounded-full text-xs uppercase tracking-[0.25em] disabled:opacity-55"
              >
                <span className="absolute inset-0 rounded-full bg-white text-black" />
                <span className="relative text-black">{hasDue ? "Pay now" : "Cleared"}</span>
              </button>
              <button
                onClick={() => {
                  if (!history[0]) return;
                  void openProtectedResource(`/api/student/fees/invoices/${history[0].id}`, {
                    fallbackName: `${history[0].id}.txt`,
                  }).catch((error) =>
                    setStatus(error instanceof Error ? error.message : "Could not view invoice"),
                  );
                }}
                className="glass rounded-full px-7 py-3 text-xs uppercase tracking-[0.25em] text-white/80"
              >
                View invoice
              </button>
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">
            Last 6 semesters
          </div>
          <div className="font-display text-xl mt-1 mb-5">Fee trend</div>
          <div className="flex items-end gap-2 h-32">
            {series.map((v, i) => (
              <motion.div
                key={`${v}-${i}`}
                initial={{ height: 0 }}
                animate={{ height: `${(v / max) * 100}%` }}
                transition={{ delay: i * 0.06, duration: 0.8 }}
                className="flex-1 rounded-t-lg"
                style={{
                  background:
                    "linear-gradient(180deg, oklch(0.85 0.12 60), oklch(0.72 0.27 350 / 0.3))",
                }}
              />
            ))}
          </div>
        </GlassCard>
      </div>

      <GlassCard>
        <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">History</div>
        <div className="font-display text-xl mt-1 mb-5">Payments & receipts</div>
        <div className="space-y-3">
          {history.length === 0 && (
            <div className="rounded-2xl glass p-4 text-sm text-white/50">
              Receipts will appear here after your backend fee sync completes.
            </div>
          )}
          {history.map((f, i) => (
            <motion.div
              key={f.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center justify-between gap-3 p-4 rounded-2xl glass"
            >
              <div>
                <div className="font-medium">
                  {f.semester} / {f.id}
                </div>
                <div className="text-xs text-white/45 mt-0.5">{f.date}</div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="font-display text-lg">{"\u20B9"} {f.amount.toLocaleString()}</div>
                  <div
                    className={`text-[10px] uppercase tracking-[0.2em] ${f.status === "paid" ? "text-emerald-300" : "text-amber-300"}`}
                  >
                    {f.status}
                  </div>
                </div>
                <button
                  onClick={() =>
                    void openProtectedResource(`/api/student/fees/invoices/${f.id}?download=true`, {
                      download: true,
                      fallbackName: `${f.id}.txt`,
                    }).catch((error) =>
                      setStatus(error instanceof Error ? error.message : "Could not download receipt"),
                    )
                  }
                  className="size-9 glass rounded-full flex items-center justify-center text-white/60 hover:text-white"
                >
                  <Download className="size-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </GlassCard>
    </PageTransition>
  );
}
