import { createFileRoute } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Send, Sparkles, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GlassCard, PageTransition } from "@/components/app/cinematic";
import { type StudentDashboard } from "@/lib/api";
import { useStudentDashboard } from "@/lib/student-session";

export const Route = createFileRoute("/app/ai")({ component: AIPage });

type ChatMessage = StudentDashboard["ai_context"]["chat_history"][number];

function AIPage() {
  const { dashboard } = useStudentDashboard();
  const initialHistory = dashboard?.ai_context.chat_history ?? [
    { role: "ai", text: "Your student context is syncing from the backend." } as ChatMessage,
  ];
  const prompts = dashboard?.ai_context.suggested_prompts ?? [];
  const [msgs, setMsgs] = useState<ChatMessage[]>(initialHistory);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (dashboard) setMsgs(dashboard.ai_context.chat_history);
  }, [dashboard]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, typing]);

  function send(text: string) {
    if (!text.trim()) return;
    setMsgs((m) => [...m, { role: "user", text }]);
    setInput("");
    setTyping(true);
    setTimeout(() => {
      setMsgs((m) => [...m, { role: "ai", text: simulate(text, dashboard) }]);
      setTyping(false);
    }, 1100);
  }

  return (
    <PageTransition>
      <div className="grid lg:grid-cols-[260px_1fr] gap-5 h-[calc(100vh-180px)]">
        <div className="hidden lg:flex flex-col gap-3">
          <button className="relative overflow-hidden rounded-2xl py-3 text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2">
            <span
              className="absolute inset-0 rounded-2xl"
              style={{ background: "var(--grad-aurora)" }}
            />
            <span className="absolute inset-px rounded-2xl bg-[#0a0a0a]/30" />
            <Plus className="relative size-3.5" />
            <span className="relative">New chat</span>
          </button>
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/40 px-1">Today</div>
          {historyLabels(dashboard).map((c) => (
            <button
              key={c}
              className="text-left px-3 py-2.5 rounded-2xl text-sm text-white/70 hover:bg-white/5 hover:text-white transition truncate"
            >
              {c}
            </button>
          ))}
        </div>

        <GlassCard className="flex flex-col !p-0 overflow-hidden">
          <div className="px-6 py-5 border-b border-white/10 flex items-center gap-3">
            <span className="size-9 rounded-full flex items-center justify-center relative overflow-hidden">
              <span
                className="absolute inset-0 rounded-full"
                style={{ background: "var(--grad-aurora)" }}
              />
              <Sparkles className="relative size-4 text-white" />
            </span>
            <div>
              <div className="font-display text-lg leading-none">CampusVerse Intelligence</div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/40 mt-1">
                Synced to your student profile
              </div>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
            {msgs.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}
              >
                {m.role === "ai" && (
                  <span className="size-8 rounded-full shrink-0 mt-1 relative overflow-hidden">
                    <span
                      className="absolute inset-0 rounded-full"
                      style={{ background: "var(--grad-aurora)" }}
                    />
                  </span>
                )}
                <div
                  className={`max-w-[80%] rounded-3xl px-5 py-3 text-sm ${m.role === "user" ? "bg-white text-black" : "glass-strong text-white"}`}
                >
                  {m.text}
                </div>
              </motion.div>
            ))}
            <AnimatePresence>
              {typing && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex gap-3"
                >
                  <span className="size-8 rounded-full shrink-0 mt-1 relative overflow-hidden">
                    <span
                      className="absolute inset-0 rounded-full"
                      style={{ background: "var(--grad-aurora)" }}
                    />
                  </span>
                  <div className="glass-strong rounded-3xl px-5 py-3 text-sm flex items-center gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="size-1.5 rounded-full bg-white/70"
                        animate={{ y: [0, -4, 0] }}
                        transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.12 }}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {msgs.length <= initialHistory.length && (
            <div className="px-6 pb-3 flex gap-2 flex-wrap">
              {prompts.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="glass rounded-full px-3 py-1.5 text-xs text-white/70 hover:text-white hover:border-white/30"
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="m-4 mt-2 relative"
          >
            <div className="glass-strong rounded-2xl flex items-center gap-2 px-3 py-2.5">
              <button
                type="button"
                className="size-9 rounded-xl flex items-center justify-center text-white/60 hover:text-white"
              >
                <Mic className="size-4" />
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything about your campus..."
                className="flex-1 bg-transparent focus:outline-none text-sm"
              />
              <button
                type="submit"
                className="size-9 rounded-xl relative overflow-hidden flex items-center justify-center"
              >
                <span
                  className="absolute inset-0 rounded-xl"
                  style={{ background: "var(--grad-aurora)" }}
                />
                <Send className="relative size-4 text-white" />
              </button>
            </div>
          </form>
        </GlassCard>
      </div>
    </PageTransition>
  );
}

function historyLabels(dashboard: StudentDashboard | null | undefined) {
  if (!dashboard) return ["Backend sync"];
  return [
    `${Math.round(dashboard.user.attendance)}% attendance`,
    `${dashboard.user.cgpa.toFixed(1)} CGPA forecast`,
    `${dashboard.fee_summary.clearance} fee status`,
  ];
}

function simulate(q: string, dashboard: StudentDashboard | null | undefined) {
  if (!dashboard) return "Your backend profile is still syncing. Try again in a moment.";
  const lower = q.toLowerCase();
  const attendance = Math.round(dashboard.user.attendance);
  if (lower.includes("attendance")) {
    return `You are currently at ${attendance}% overall, ${Math.max(0, attendance - 75)}% above the 75% policy threshold.`;
  }
  if (lower.includes("cgpa") || lower.includes("predict")) {
    return `Based on your current ${dashboard.user.cgpa.toFixed(1)} CGPA trend, your next semester target is ${(dashboard.user.cgpa + 0.08).toFixed(2)}.`;
  }
  if (lower.includes("fee") || lower.includes("certificate")) {
    return `Fee status: ${dashboard.fee_summary.clearance}. Certificate requests available: ${dashboard.certificate_items.length}.`;
  }
  return `I checked ${dashboard.user.name}'s live student context and queued this in your dashboard insights.`;
}
