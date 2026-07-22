import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Send, Sparkles, Trash2, Copy, Check, PencilLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GlassCard, PageTransition } from "@/components/app/cinematic";
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

function AIPage() {
  const { dashboard } = useStudentDashboard();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const prompts = dashboard?.ai_context.suggested_prompts ?? [];
  const [msgs, setMsgs] = useState<StudentAssistantMessage[]>(
    () => getStoredStudentAssistantMessages() ?? defaultStudentAssistantMessages(),
  );
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [copiedMessageKey, setCopiedMessageKey] = useState<string | null>(null);
  const [promptOptions, setPromptOptions] = useState<string[]>(prompts);
  const scrollRef = useRef<HTMLDivElement>(null);
  const voiceRef = useRef<VoiceCommandController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (dashboard) {
      setPromptOptions(dashboard.ai_context.suggested_prompts);
    }
  }, [dashboard]);

  useEffect(() => {
    setStoredStudentAssistantMessages(msgs);
  }, [msgs]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, typing]);

  useEffect(() => {
    return () => voiceRef.current?.stop();
  }, []);

  async function send(text: string, replaceFromIndex: number | null = editingIndex) {
    const cleanText = text.trim();
    if (!cleanText || typing) return;
    voiceRef.current?.stop();
    const baseMessages = replaceFromIndex === null ? msgs : msgs.slice(0, replaceFromIndex);
    const history = baseMessages.slice(-10);
    setMsgs([...baseMessages, { role: "user", text: cleanText }]);
    setInput("");
    setEditingIndex(null);
    setTyping(true);
    try {
      const response = await sendStudentAssistantMessage({
        message: cleanText,
        current_path: pathname,
        history,
      });
      setMsgs((m) => [...m, { role: "ai", text: response.answer }]);
      if (response.suggestedPrompts.length) setPromptOptions(response.suggestedPrompts);
    } catch (error) {
      setMsgs((m) => [
        ...m,
        {
          role: "ai",
          text: error instanceof Error ? error.message : "The assistant could not respond right now.",
        },
      ]);
    } finally {
      setTyping(false);
    }
  }

  function editMessage(index: number) {
    const message = msgs[index];
    if (!message || message.role !== "user" || typing) return;
    voiceRef.current?.stop();
    setEditingIndex(index);
    setInput(message.text);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function copyMessage(key: string, text: string) {
    try {
      await copyTextToClipboard(text);
      setCopiedMessageKey(key);
      window.setTimeout(() => {
        setCopiedMessageKey((current) => (current === key ? null : current));
      }, 1400);
    } catch {
      setMsgs((m) => [...m, { role: "ai", text: "I could not copy that message in this browser." }]);
    }
  }

  function cancelEdit() {
    setEditingIndex(null);
    setInput("");
  }

  function clearChat() {
    voiceRef.current?.stop();
    clearStoredStudentAssistantMessages();
    setMsgs(defaultStudentAssistantMessages());
    setInput("");
    setEditingIndex(null);
    setCopiedMessageKey(null);
  }

  function toggleVoice() {
    if (listening) {
      voiceRef.current?.stop();
      return;
    }
    const controller = startVoiceCommand({
      onTranscript: (transcript) => {
        setInput(transcript);
      },
      onStart: () => {
        setVoiceSupported(true);
        setListening(true);
      },
      onEnd: () => {
        setListening(false);
        voiceRef.current = null;
      },
      onUnsupported: () => {
        setVoiceSupported(false);
        setMsgs((m) => [
          ...m,
          {
            role: "ai",
            text: "Voice input is not available in this browser. You can still type your question here.",
          },
        ]);
      },
    });
    voiceRef.current = controller;
  }

  return (
    <PageTransition>
      <div className="grid lg:grid-cols-[260px_1fr] gap-5 h-[calc(100vh-180px)]">
        <div className="hidden lg:flex flex-col gap-3">
          <button
            onClick={clearChat}
            className="relative overflow-hidden rounded-2xl py-3 text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2"
          >
            <span
              className="absolute inset-0 rounded-2xl"
              style={{ background: "var(--grad-aurora)" }}
            />
            <span className="absolute inset-px rounded-2xl bg-[#0a0a0a]/30" />
            <Trash2 className="relative size-3.5" />
            <span className="relative">Clear chat</span>
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

          <div
            ref={scrollRef}
            data-lenis-prevent
            onWheelCapture={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
            onTouchMoveCapture={(event) => event.stopPropagation()}
            onTouchMove={(event) => event.stopPropagation()}
            className="flex-1 overflow-y-auto overscroll-contain px-6 py-6 space-y-5"
          >
            {msgs.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`group flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}
              >
                {m.role === "ai" && (
                  <span className="size-8 rounded-full shrink-0 mt-1 relative overflow-hidden">
                    <span
                      className="absolute inset-0 rounded-full"
                      style={{ background: "var(--grad-aurora)" }}
                    />
                  </span>
                )}
                <div className={`flex max-w-[80%] flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                  <div
                    className={`w-fit max-w-full whitespace-pre-wrap break-words rounded-3xl px-5 py-3 text-sm leading-6 ${m.role === "user" ? "bg-white text-black" : "glass-strong text-white"}`}
                  >
                    {m.text}
                  </div>
                  <div
                    className={`mt-1 flex items-center gap-1 px-1 text-white/45 transition group-hover:text-white/70 ${
                      m.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => void copyMessage(`${m.role}-${i}`, m.text)}
                      className="rounded-full p-1.5 hover:bg-white/10 hover:text-white"
                      aria-label="Copy message"
                      title="Copy"
                    >
                      {copiedMessageKey === `${m.role}-${i}` ? (
                        <Check className="size-3.5" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </button>
                    {m.role === "user" && (
                      <button
                        type="button"
                        onClick={() => editMessage(i)}
                        className="rounded-full p-1.5 hover:bg-white/10 hover:text-white"
                        aria-label="Edit and send again"
                        title="Edit and send again"
                      >
                        <PencilLine className="size-3.5" />
                      </button>
                    )}
                  </div>
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

          {msgs.length <= 1 && (
            <div className="px-6 pb-3 flex gap-2 flex-wrap">
              {(promptOptions.length ? promptOptions : prompts).map((p) => (
                <button
                  key={p}
                  onClick={() => void send(p, null)}
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
              void send(input);
            }}
            className="m-4 mt-2 relative"
          >
            {editingIndex !== null && (
              <div className="mb-2 flex items-center justify-between rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs text-cyan-50">
                <span>Editing prompt. Update it, then send again.</span>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="rounded-full px-2 py-1 text-white/60 hover:bg-white/10 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            )}
            <div className="glass-strong rounded-2xl flex items-center gap-2 px-3 py-2.5">
              <button
                type="button"
                onClick={toggleVoice}
                disabled={!voiceSupported}
                className={`size-9 rounded-xl flex items-center justify-center transition ${
                  listening ? "bg-cyan-400/15 text-cyan-100" : "text-white/60 hover:text-white"
                }`}
                aria-label={listening ? "Stop voice input" : "Start voice input"}
              >
                <Mic className="size-4" />
              </button>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={listening ? "Listening..." : "Ask anything about your campus..."}
                className="flex-1 bg-transparent focus:outline-none text-sm"
              />
              <button
                type="submit"
                disabled={typing || !input.trim()}
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
