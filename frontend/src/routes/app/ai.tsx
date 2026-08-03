import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, MicOff, Send, Sparkles, Trash2, Copy, Check, PencilLine, X,
  Brain, BookOpen, GraduationCap, Wallet, ClipboardCheck, MessageSquare,
  Zap, ChevronRight, Bot, User, TrendingUp, AlertCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PageTransition } from "@/components/app/cinematic";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
  sendStudentAssistantMessage,
  type StudentAssistantMessage,
  type StudentDashboard,
} from "@/lib/api";
import {
  clearStoredStudentAssistantMessages,
  defaultStudentAssistantMessages,
  getStoredStudentAssistantMessages,
  setStoredStudentAssistantMessages,
} from "@/lib/student-assistant-session";
import { useStudentDashboard } from "@/lib/student-session";
import { startVoiceCommand, type VoiceCommandController } from "@/lib/voice-command";

export const Route = createFileRoute("/app/ai")({ component: AIPage });

const CAPS = [
  { icon: GraduationCap,  label: "Academic Advisor",   desc: "CGPA trends, attendance risk & study plans",      from: "#7c3aed", to: "#4f46e5", prompt: "Analyze my academic performance and suggest improvements" },
  { icon: ClipboardCheck, label: "Assignment Help",    desc: "Deadlines, submission status & grade insights",   from: "#0891b2", to: "#0369a1", prompt: "What assignments are due soon and how can I prioritize them?" },
  { icon: Wallet,         label: "Fee Assistant",      desc: "Payment schedules, dues & clearance status",      from: "#d97706", to: "#b45309", prompt: "Summarize my current fee status and upcoming payments" },
  { icon: BookOpen,       label: "Study Resources",    desc: "Notes, papers & curated learning materials",      from: "#059669", to: "#047857", prompt: "Find relevant study resources for my current semester" },
  { icon: MessageSquare,  label: "Complaint Tracker",  desc: "Live status of grievances & resolutions",         from: "#db2777", to: "#be185d", prompt: "What is the status of my recent complaints?" },
  { icon: Zap,            label: "Smart Insights",     desc: "Personalised analytics & campus updates",         from: "#6366f1", to: "#4f46e5", prompt: "Give me a personalised summary of my campus life this week" },
];

// Inline scrollbar-hiding style injected once
const SCROLL_HIDE = `
  .ai-scroll::-webkit-scrollbar { display: none; }
  .ai-scroll { scrollbar-width: none; -ms-overflow-style: none; }
  .msg-actions { opacity: 0; transition: opacity .15s; }
  .msg-group:hover .msg-actions { opacity: 1; }
`;

function AIPage() {
  const { dashboard } = useStudentDashboard();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const backendPrompts = dashboard?.ai_context.suggested_prompts ?? [];

  const [msgs, setMsgs]         = useState<StudentAssistantMessage[]>(() => getStoredStudentAssistantMessages() ?? defaultStudentAssistantMessages());
  const [input, setInput]        = useState("");
  const [typing, setTyping]      = useState(false);
  const [listening, setListening]= useState(false);
  const [voiceOk, setVoiceOk]    = useState(true);
  const [editIdx, setEditIdx]    = useState<number | null>(null);
  const [copiedKey, setCopiedKey]= useState<string | null>(null);
  const [chips, setChips]        = useState<string[]>(backendPrompts);

  const scrollRef = useRef<HTMLDivElement>(null);
  const voiceRef  = useRef<VoiceCommandController | null>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => { if (dashboard) setChips(dashboard.ai_context.suggested_prompts); }, [dashboard]);
  useEffect(() => { setStoredStudentAssistantMessages(msgs); }, [msgs]);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [msgs, typing]);
  useEffect(() => () => voiceRef.current?.stop(), []);

  async function send(text: string, fromIdx: number | null = editIdx) {
    const t = text.trim(); if (!t || typing) return;
    voiceRef.current?.stop();
    const base = fromIdx === null ? msgs : msgs.slice(0, fromIdx);
    setMsgs([...base, { role: "user", text: t }]);
    setInput(""); setEditIdx(null); setTyping(true);
    try {
      const r = await sendStudentAssistantMessage({ message: t, current_path: pathname, history: base.slice(-10) });
      setMsgs(m => [...m, { role: "ai", text: r.answer }]);
      if (r.suggestedPrompts.length) setChips(r.suggestedPrompts);
    } catch (e) {
      setMsgs(m => [...m, { role: "ai", text: e instanceof Error ? e.message : "The assistant could not respond right now." }]);
    } finally { setTyping(false); }
  }

  function editMsg(i: number) {
    const m = msgs[i]; if (!m || m.role !== "user" || typing) return;
    voiceRef.current?.stop(); setEditIdx(i); setInput(m.text);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function copyMsg(key: string, text: string) {
    try {
      await copyTextToClipboard(text); setCopiedKey(key);
      setTimeout(() => setCopiedKey(c => c === key ? null : c), 1400);
    } catch { setMsgs(m => [...m, { role: "ai", text: "Could not copy in this browser." }]); }
  }

  function clearChat() {
    voiceRef.current?.stop(); clearStoredStudentAssistantMessages();
    setMsgs(defaultStudentAssistantMessages()); setInput(""); setEditIdx(null); setCopiedKey(null);
  }

  function toggleVoice() {
    if (listening) { voiceRef.current?.stop(); return; }
    const c = startVoiceCommand({
      onTranscript: t => setInput(t),
      onStart: () => { setVoiceOk(true); setListening(true); },
      onEnd: () => { setListening(false); voiceRef.current = null; },
      onUnsupported: () => {
        setVoiceOk(false);
        setMsgs(m => [...m, { role: "ai", text: "Voice input is not supported in this browser." }]);
      },
    });
    voiceRef.current = c;
  }

  const stats = buildStats(dashboard);
  const isEmpty = msgs.length <= 1;

  return (
    <PageTransition>
      <style>{SCROLL_HIDE}</style>

      {/* Root: fixed viewport height, no outer scroll */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "calc(100vh - 150px)", minHeight: 540 }}>

        {/* ══════ HEADER ══════════════════════════════════════════════ */}
        <div style={{ position: "relative", borderRadius: 14, flexShrink: 0 }}>
          {/* Deep bg */}
          <div style={{ position: "absolute", inset: 0, borderRadius: 14, background: "linear-gradient(115deg,#0c0122 0%,#07070f 45%,#011018 100%)" }} />
          {/* Aurora orbs */}
          {[{ cx: "5%",  cy: "50%", c: "#7c3aed", d: 0   },
            { cx: "42%", cy: "50%", c: "#ec4899", d: 1.2 },
            { cx: "75%", cy: "50%", c: "#06b6d4", d: 2.4 }].map((o, i) => (
            <motion.div key={i} style={{ position: "absolute", left: o.cx, top: "50%", transform: "translate(-50%,-50%)", width: 180, height: 120, borderRadius: "50%", background: `radial-gradient(circle,${o.c}99,transparent 65%)`, filter: "blur(36px)", pointerEvents: "none" }}
              animate={{ opacity: [0.5, 0.85, 0.5] }} transition={{ duration: 4 + i, repeat: Infinity, delay: o.d }} />
          ))}
          {/* Grid */}
          <div style={{ position: "absolute", inset: 0, borderRadius: 14, backgroundImage: "linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px)", backgroundSize: "28px 28px", pointerEvents: "none" }} />
          {/* Border */}
          <div style={{ position: "absolute", inset: 0, borderRadius: 14, boxShadow: "inset 0 0 0 1px rgba(124,58,237,.4)", pointerEvents: "none" }} />

          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", gap: 10, flexWrap: "wrap" }}>
            {/* Branding */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ position: "relative" }}>
                <motion.div style={{ width: 42, height: 42, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#7c3aed,#ec4899,#06b6d4)", flexShrink: 0 }}
                  animate={{ boxShadow: ["0 0 12px #7c3aed55","0 0 26px #ec489966","0 0 12px #06b6d455","0 0 12px #7c3aed55"] }}
                  transition={{ duration: 4, repeat: Infinity }}>
                  <Brain size={17} color="#fff" />
                </motion.div>
                <motion.span style={{ position: "absolute", bottom: -2, right: -2, width: 10, height: 10, borderRadius: "50%", background: "#34d399", border: "2px solid #050505", display: "block" }}
                  animate={{ opacity: [1, .3, 1], scale: [1, 1.25, 1] }} transition={{ duration: 2, repeat: Infinity }} />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 17, fontWeight: 700, color: "#fff" }}>CampusVerse Intelligence</span>
                  <span style={{ fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", padding: "2px 8px", borderRadius: 99, fontWeight: 700, background: "rgba(124,58,237,.22)", border: "1px solid rgba(124,58,237,.5)", color: "#c4b5fd" }}>GenAI</span>
                </div>
                <p style={{ fontSize: 10, marginTop: 2, fontFamily: "monospace", color: "rgba(255,255,255,.38)" }}>Synced to your profile · Powered by Gemini</p>
              </div>
            </div>
            {/* Stat pills */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {stats.map(s => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 99, fontSize: 11, fontFamily: "monospace", fontWeight: 700, background: s.bg, border: `1px solid ${s.border}`, color: s.color }}>
                  <s.icon size={11} />
                  <span>{s.value}</span>
                  <span style={{ fontWeight: 400, color: "rgba(255,255,255,.38)" }}>{s.label}</span>
                </div>
              ))}
              <button onClick={clearChat} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 99, fontSize: 11, fontFamily: "monospace", fontWeight: 700, background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.4)", color: "#fca5a5", cursor: "pointer" }}>
                <Trash2 size={11} />Clear
              </button>
            </div>
          </div>
        </div>

        {/* ══════ BODY ════════════════════════════════════════════════ */}
        <div style={{ flex: 1, display: "flex", gap: 10, minHeight: 0 }}>

          {/* ── CHAT PANEL ───────────────────────────────────────────── */}
          {/* NOTE: no overflow:hidden on outer — only on the scroll child */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, borderRadius: 14, background: "rgba(7,7,16,.97)", border: "1px solid rgba(255,255,255,.07)" }}>

            {/* Scrollable messages area */}
            <div ref={scrollRef} className="ai-scroll"
              style={{ flex: 1, overflowY: "auto", padding: "18px 18px 6px" }}
              onWheelCapture={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}
              onTouchMoveCapture={e => e.stopPropagation()} onTouchMove={e => e.stopPropagation()}
              data-lenis-prevent>

              {/* ── Welcome state ── */}
              <AnimatePresence>
                {isEmpty && (
                  <motion.div key="welcome" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                    style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    {/* Greeting */}
                    <div style={{ textAlign: "center", marginBottom: 20 }}>
                      <motion.p style={{ fontSize: 21, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, background: "linear-gradient(135deg,#c4b5fd,#f9a8d4,#67e8f9)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 5 }}>
                        Hello, {dashboard?.user.name?.split(" ")[0] ?? "Student"} 👋
                      </motion.p>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,.33)", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.28em" }}>
                        What can I help you with?
                      </p>
                    </div>

                    {/* Capability grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                      {CAPS.map((c, i) => (
                        <motion.button key={c.label}
                          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * .07, type: "spring", stiffness: 260, damping: 22 }}
                          onClick={() => void send(c.prompt, null)}
                          style={{ textAlign: "left", padding: "14px", borderRadius: 12, border: `1px solid ${c.from}40`, background: `linear-gradient(135deg,${c.from}20,${c.to}10)`, cursor: "pointer", position: "relative", overflow: "hidden" }}
                          whileHover={{ y: -3, boxShadow: `0 8px 28px ${c.from}44`, borderColor: `${c.from}77` }}>
                          <div style={{ position: "absolute", top: -14, right: -10, width: 56, height: 56, borderRadius: "50%", background: `radial-gradient(circle,${c.from},transparent)`, filter: "blur(16px)", opacity: .4, pointerEvents: "none" }} />
                          <div style={{ width: 30, height: 30, borderRadius: 9, background: `linear-gradient(135deg,${c.from},${c.to})`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 9 }}>
                            <c.icon size={14} color="#fff" />
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", lineHeight: 1.3 }}>{c.label}</span>
                            <ChevronRight size={11} color={c.from} style={{ marginTop: 2, flexShrink: 0, opacity: .65 }} />
                          </div>
                          <p style={{ fontSize: 10, color: "rgba(255,255,255,.4)", marginTop: 4, lineHeight: 1.5 }}>{c.desc}</p>
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Messages ── */}
              {!isEmpty && (
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  {msgs.map((m, i) => {
                    const key = `${m.role}-${i}`, isUser = m.role === "user";
                    return (
                      <div key={key} className="msg-group" style={{ display: "flex", gap: 10, justifyContent: isUser ? "flex-end" : "flex-start" }}>
                        {!isUser && (
                          <div style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, marginTop: 2, background: "linear-gradient(135deg,#7c3aed,#06b6d4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Bot size={13} color="#fff" />
                          </div>
                        )}
                        <div style={{ display: "flex", flexDirection: "column", maxWidth: "76%", alignItems: isUser ? "flex-end" : "flex-start" }}>
                          <div style={{ padding: "11px 15px", fontSize: 13.5, lineHeight: 1.75, whiteSpace: "pre-wrap", wordBreak: "break-word", borderRadius: 14, ...(isUser
                            ? { background: "linear-gradient(135deg,#fff,#e0e7ff)", color: "#0a0a16", fontWeight: 500, borderBottomRightRadius: 3, boxShadow: "0 4px 18px rgba(124,58,237,.18)" }
                            : { background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.08)", color: "rgba(255,255,255,.88)", borderBottomLeftRadius: 3 }) }}>
                            {m.text}
                          </div>
                          <div className="msg-actions" style={{ display: "flex", gap: 2, marginTop: 3 }}>
                            <button onClick={() => void copyMsg(key, m.text)} style={{ padding: 5, borderRadius: 7, background: "transparent", border: "none", color: "rgba(255,255,255,.35)", cursor: "pointer" }}>
                              {copiedKey === key ? <Check size={10} /> : <Copy size={10} />}
                            </button>
                            {isUser && !typing && (
                              <button onClick={() => editMsg(i)} style={{ padding: 5, borderRadius: 7, background: "transparent", border: "none", color: "rgba(255,255,255,.35)", cursor: "pointer" }}>
                                <PencilLine size={10} />
                              </button>
                            )}
                          </div>
                        </div>
                        {isUser && (
                          <div style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, marginTop: 2, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <User size={13} color="rgba(255,255,255,.6)" />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Typing indicator */}
                  <AnimatePresence>
                    {typing && (
                      <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(135deg,#7c3aed,#06b6d4)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Bot size={13} color="#fff" />
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "11px 15px", borderRadius: 14, borderBottomLeftRadius: 3, background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.08)" }}>
                          {[0, 1, 2].map(j => (
                            <motion.span key={j} style={{ width: 7, height: 7, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#06b6d4)", display: "block" }}
                              animate={{ y: [0, -6, 0], opacity: [.35, 1, .35] }} transition={{ duration: .75, repeat: Infinity, delay: j * .16 }} />
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Suggested chips */}
            <AnimatePresence>
              {isEmpty && (chips.length > 0 || backendPrompts.length > 0) && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  style={{ padding: "0 18px 10px", display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {(chips.length ? chips : backendPrompts).slice(0, 4).map(p => (
                    <button key={p} onClick={() => void send(p, null)}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 13px", borderRadius: 99, fontSize: 11, background: "rgba(124,58,237,.12)", border: "1px solid rgba(124,58,237,.35)", color: "#c4b5fd", cursor: "pointer" }}>
                      <Sparkles size={10} color="#a78bfa" />{p}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Input bar ─────────────────────────────────────────── */}
            <div style={{ padding: "8px 14px 13px", borderTop: "1px solid rgba(255,255,255,.055)" }}>
              <AnimatePresence>
                {editIdx !== null && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                    style={{ marginBottom: 7, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 13px", borderRadius: 9, fontSize: 11, background: "rgba(6,182,212,.08)", border: "1px solid rgba(6,182,212,.3)", color: "#67e8f9", overflow: "hidden" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}><PencilLine size={10} /> Editing — update and resend</span>
                    <button onClick={() => { setEditIdx(null); setInput(""); }} style={{ background: "none", border: "none", color: "#67e8f9", cursor: "pointer" }}><X size={12} /></button>
                  </motion.div>
                )}
              </AnimatePresence>

              <form onSubmit={e => { e.preventDefault(); void send(input); }}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", borderRadius: 11, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.09)" }}>
                <button type="button" onClick={toggleVoice} disabled={!voiceOk}
                  style={{ width: 32, height: 32, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer", position: "relative", background: listening ? "rgba(236,72,153,.15)" : "transparent", border: listening ? "1px solid rgba(236,72,153,.5)" : "1px solid transparent" }}>
                  {listening && <motion.span style={{ position: "absolute", inset: 0, borderRadius: 9, border: "1px solid rgba(236,72,153,.5)" }} animate={{ scale: [1, 1.55, 1], opacity: [.6, 0, .6] }} transition={{ duration: 1.4, repeat: Infinity }} />}
                  {listening ? <MicOff size={14} color="#f9a8d4" /> : <Mic size={14} color="rgba(255,255,255,.35)" />}
                </button>

                <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                  placeholder={listening ? "Listening… speak now" : "Ask about your attendance, CGPA, fees, assignments…"}
                  style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 13, color: "#fff", minWidth: 0 }} />

                <motion.button type="submit" disabled={typing || !input.trim()}
                  style={{ width: 32, height: 32, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: typing || !input.trim() ? "not-allowed" : "pointer", opacity: typing || !input.trim() ? .35 : 1, position: "relative", overflow: "hidden", border: "none", background: "transparent" }}
                  whileHover={!typing && !!input.trim() ? { scale: 1.1 } : undefined}
                  whileTap={!typing && !!input.trim() ? { scale: .9 } : undefined}>
                  <span style={{ position: "absolute", inset: 0, borderRadius: 9, background: "linear-gradient(135deg,#7c3aed,#ec4899,#06b6d4)" }} />
                  {typing
                    ? <motion.span style={{ width: 13, height: 13, borderRadius: "50%", border: "2px solid rgba(255,255,255,.4)", borderTopColor: "#fff", display: "block", position: "relative" }} animate={{ rotate: 360 }} transition={{ duration: .8, repeat: Infinity, ease: "linear" }} />
                    : <Send size={13} color="#fff" style={{ position: "relative" }} />}
                </motion.button>
              </form>

              <p style={{ textAlign: "center", fontSize: 9, marginTop: 5, fontFamily: "monospace", color: "rgba(255,255,255,.16)", letterSpacing: "0.05em" }}>
                AI responses may be inaccurate · Always verify critical information
              </p>
            </div>
          </div>

          {/* ── RIGHT SIDEBAR ─────────────────────────────────────────── */}
          {/* Key fix: NO overflow hidden on this container, children size to fit */}
          <div className="hidden xl:flex" style={{ width: 200, flexShrink: 0, flexDirection: "column", gap: 8 }}>

            {/* ① Gemini AI + Context merged card */}
            <div style={{ borderRadius: 14, background: "rgba(7,7,16,.97)", border: "1px solid rgba(124,58,237,.28)", padding: "13px 14px", position: "relative" }}>
              {/* subtle top glow — doesn't overflow because no overflow:hidden */}
              <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 120, height: 40, background: "radial-gradient(circle,rgba(124,58,237,.25),transparent 65%)", filter: "blur(14px)", pointerEvents: "none" }} />

              {/* AI badge row */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, position: "relative" }}>
                <motion.div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: "linear-gradient(135deg,#7c3aed,#ec4899,#06b6d4)", display: "flex", alignItems: "center", justifyContent: "center" }}
                  animate={{ boxShadow: ["0 0 8px #7c3aed44","0 0 18px #ec489944","0 0 8px #06b6d444","0 0 8px #7c3aed44"] }}
                  transition={{ duration: 4, repeat: Infinity }}>
                  <Sparkles size={15} color="#fff" />
                </motion.div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>Gemini AI</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                    <motion.span style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", display: "block" }} animate={{ opacity: [1, .3, 1] }} transition={{ duration: 2, repeat: Infinity }} />
                    <span style={{ fontSize: 9, fontFamily: "monospace", color: "#34d399" }}>Online · Campus-aware</span>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: "rgba(255,255,255,.07)", marginBottom: 12 }} />

              {/* Your Context */}
              <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.28em", fontFamily: "monospace", color: "rgba(255,255,255,.65)", marginBottom: 10 }}>Your Context</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {stats.map(s => (
                  <div key={s.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: "rgba(255,255,255,.78)" }}>
                      <s.icon size={11} color={s.color} />{s.label}
                    </div>
                    <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: s.color }}>{s.value}</span>
                  </div>
                ))}
              </div>

              {/* Attendance warning */}
              {dashboard?.user.attendance != null && dashboard.user.attendance < 75 && (
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 9, background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)" }}>
                  <AlertCircle size={10} color="#f87171" />
                  <span style={{ fontSize: 9, color: "#fca5a5", fontFamily: "monospace" }}>Attendance below 75%</span>
                </div>
              )}
              {dashboard?.user.attendance != null && dashboard.user.attendance >= 75 && dashboard.user.attendance < 85 && (
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 9, background: "rgba(234,179,8,.1)", border: "1px solid rgba(234,179,8,.3)" }}>
                  <TrendingUp size={10} color="#fbbf24" />
                  <span style={{ fontSize: 9, color: "#fde68a", fontFamily: "monospace" }}>Attendance borderline</span>
                </div>
              )}
            </div>

            {/* ② Quick Actions */}
            <div style={{ borderRadius: 14, background: "rgba(7,7,16,.97)", border: "1px solid rgba(255,255,255,.07)", padding: "13px 14px", flex: 1, minHeight: 0 }}>
              <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.28em", fontFamily: "monospace", color: "rgba(255,255,255,.65)", marginBottom: 9 }}>Quick Actions</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {CAPS.map(c => (
                  <button key={c.label} onClick={() => void send(c.prompt, null)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 9, border: "none", background: "transparent", cursor: "pointer", textAlign: "left", width: "100%", transition: "background .15s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,.08)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <div style={{ width: 22, height: 22, borderRadius: 7, background: `linear-gradient(135deg,${c.from},${c.to})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <c.icon size={11} color="#fff" />
                    </div>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,.82)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ③ Session counter */}
            {msgs.length > 1 && (
              <div style={{ borderRadius: 14, background: "rgba(124,58,237,.08)", border: "1px solid rgba(124,58,237,.25)", padding: "10px", textAlign: "center", flexShrink: 0 }}>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Space Grotesk',sans-serif", color: "#c4b5fd" }}>{msgs.length - 1}</div>
                <div style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,.6)", marginTop: 1 }}>messages this session</div>
              </div>
            )}
          </div>

        </div>
      </div>
    </PageTransition>
  );
}

function buildStats(dashboard: StudentDashboard | null | undefined) {
  return [
    { icon: GraduationCap,  label: "CGPA",       value: dashboard?.user.cgpa       != null ? dashboard.user.cgpa.toFixed(1)              : "—", color: "#c4b5fd", bg: "rgba(124,58,237,.13)", border: "rgba(124,58,237,.4)" },
    { icon: ClipboardCheck, label: "Attendance",  value: dashboard?.user.attendance != null ? `${Math.round(dashboard.user.attendance)}%` : "—", color: "#6ee7b7", bg: "rgba(5,150,105,.13)",  border: "rgba(5,150,105,.4)"  },
    { icon: Wallet,         label: "Fees",        value: dashboard?.fee_summary?.clearance ?? "—",                                               color: "#fcd34d", bg: "rgba(217,119,6,.13)",  border: "rgba(217,119,6,.4)"  },
  ];
}
