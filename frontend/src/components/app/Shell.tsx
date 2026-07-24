import { useUserAvatar } from "@/lib/avatar";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  LayoutDashboard,
  Megaphone,
  ClipboardCheck,
  FileText,
  Library,
  MessageSquare,
  Award,
  Wallet,
  ShoppingBag,
  Calendar,
  User,
  Settings,
  LogOut,
  Search,
  Bell,
  Sun,
  Moon,
  ChevronLeft,
  X,
  Send,
  Sparkles,
  Mic,
  Users,
  BriefcaseBusiness,
  GraduationCap,
  Copy,
  Check,
  PencilLine,
  Trash2,
} from "lucide-react";
import { clearStoredRole } from "@/lib/use-role";
import { clearAuthSession, getStoredUser } from "@/lib/auth";
import {
  logoutAccount,
  sendStudentAssistantMessage,
  type StudentAssistantMessage,
} from "@/lib/api";
import { clearStoredDashboard, useStudentDashboard } from "@/lib/student-session";
import {
  getStoredStudentProfile,
  initialsFromName,
  studentProfileEventName,
  type EditableStudentProfile,
} from "@/lib/student-profile";
import {
  clearStoredStudentAssistantMessages,
  defaultStudentAssistantMessages,
  getStoredStudentAssistantMessages,
  setStoredStudentAssistantMessages,
} from "@/lib/student-assistant-session";
import { copyTextToClipboard } from "@/lib/clipboard";
import { startVoiceCommand, type VoiceCommandController } from "@/lib/voice-command";

type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
};
const NAV: NavItem[] = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/app/announcements", label: "Announcements", icon: Megaphone },
  { to: "/app/attendance", label: "Attendance", icon: ClipboardCheck },
  { to: "/app/assignments", label: "Assignments", icon: FileText },
  { to: "/app/resources", label: "Study Resources", icon: Library },
  { to: "/app/complaints", label: "Complaints", icon: MessageSquare },
  { to: "/app/certificates", label: "Certificates", icon: Award },
  { to: "/app/fees", label: "Fee Payment", icon: Wallet },
  { to: "/app/marketplace", label: "Marketplace", icon: ShoppingBag },
  { to: "/app/events", label: "Events", icon: Calendar },
  { to: "/app/connect", label: "Connect", icon: Users },
  { to: "/app/placement", label: "Placement", icon: BriefcaseBusiness },
  { to: "/app/profile", label: "Profile", icon: User },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

export function Shell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [openNotif, setOpenNotif] = useState(false);
  const [openSearch, setOpenSearch] = useState(false);
  const [openFab, setOpenFab] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpenSearch(true);
      }
      if (e.key === "Escape") {
        setOpenSearch(false);
        setOpenNotif(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logoutAccount();
    } catch {
      // Still clear the browser session if the token is already expired or the API is restarting.
    } finally {
      clearAuthSession();
      clearStoredDashboard();
      clearStoredRole();
      navigate({ to: "/login", replace: true });
    }
  }

  return (
    <div className="relative min-h-screen text-white">
      {/* Sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 84 : 264 }}
        transition={{ type: "spring", stiffness: 220, damping: 28 }}
        className="fixed inset-y-0 left-0 z-40 hidden md:flex flex-col p-3"
      >
        <div className="relative h-full glass-strong rounded-3xl flex flex-col overflow-hidden">
          {/* logo */}
          <div className="flex items-center justify-between px-4 py-5">
            <Link to="/app" className="flex items-center gap-2.5 min-w-0">
              <span
                className="size-7 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "var(--grad-aurora)" }}
              >
                <Sparkles className="size-3.5 text-white" />
              </span>
              {!collapsed && (
                <span className="font-display text-sm tracking-[0.25em] uppercase truncate">
                  CampusVerse
                </span>
              )}
            </Link>
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="text-white/40 hover:text-white"
            >
              <motion.span animate={{ rotate: collapsed ? 180 : 0 }}>
                <ChevronLeft className="size-4" />
              </motion.span>
            </button>
          </div>

          <nav className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-0.5">
            {NAV.map((item) => {
              const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm transition ${active ? "text-white" : "text-white/55 hover:text-white"}`}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-2xl"
                      style={{
                        background:
                          "linear-gradient(135deg, oklch(0.65 0.28 305 / 0.25), oklch(0.65 0.25 260 / 0.1))",
                        border: "1px solid oklch(0.7 0.25 310 / 0.4)",
                      }}
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <Icon className="relative z-10 size-4 shrink-0" />
                  {!collapsed && <span className="relative z-10 truncate">{item.label}</span>}
                </Link>
              );
            })}

            <div className="mt-2 pt-2 border-t border-white/10">
              <button
                onClick={logout}
                disabled={loggingOut}
                className="group relative flex w-full items-center gap-3 px-3 py-2.5 rounded-2xl text-sm text-rose-100 bg-rose-500/10 border border-rose-300/20 hover:bg-rose-500/20 hover:border-rose-200/40 transition disabled:opacity-60 disabled:cursor-wait"
              >
                <LogOut className="relative z-10 size-4 shrink-0" />
                {!collapsed && (
                  <span className="relative z-10 truncate">
                    {loggingOut ? "Logging out" : "Logout"}
                  </span>
                )}
              </button>
            </div>
          </nav>
        </div>
      </motion.aside>

      {/* Main */}
      <div
        className={`min-h-screen transition-[padding] duration-300 ${collapsed ? "md:pl-[100px]" : "md:pl-[280px]"}`}
      >
        <TopBar
          onSearch={() => setOpenSearch(true)}
          onNotif={() => setOpenNotif(true)}
          onAssistant={() => setOpenFab((open) => !open)}
          assistantOpen={openFab}
        />
        <main className="px-5 md:px-10 py-6 pb-32 max-w-[1400px] mx-auto">{children}</main>
      </div>

      {/* Floating Action */}
      <Fab open={openFab} setOpen={setOpenFab} currentPath={pathname} />

      {/* Notifications drawer */}
      <NotifDrawer open={openNotif} onClose={() => setOpenNotif(false)} />

      {/* Global search */}
      <SearchPalette open={openSearch} onClose={() => setOpenSearch(false)} />
    </div>
  );
}

function TopBar({
  onSearch,
  onNotif,
  onAssistant,
  assistantOpen,
}: {
  onSearch: () => void;
  onNotif: () => void;
  onAssistant: () => void;
  assistantOpen: boolean;
}) {
  const [dark, setDark] = useState(true);
  const [hasViewedNotifs, setHasViewedNotifs] = useState(false);
  const [authUser, setAuthUser] = useState(() => getStoredUser());
  const [studentProfile, setStudentProfile] = useState<EditableStudentProfile | null>(() =>
    getStoredStudentProfile(),
  );
  const { dashboard } = useStudentDashboard();
  useEffect(() => setAuthUser(getStoredUser()), []);
  useEffect(() => {
    const onProfileUpdate = (event: Event) => {
      const detail = (event as CustomEvent<EditableStudentProfile>).detail;
      setStudentProfile(detail ?? getStoredStudentProfile());
    };
    window.addEventListener(studentProfileEventName(), onProfileUpdate);
    return () => window.removeEventListener(studentProfileEventName(), onProfileUpdate);
  }, []);
  const { avatarUrl } = useUserAvatar();
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const displayName =
    studentProfile?.name.trim() || dashboard?.user.name || authUser?.full_name || "Student";
  const semester = dashboard?.user.semester;
  const avatar =
    (studentProfile?.name.trim()
      ? initialsFromName(studentProfile.name)
      : dashboard?.user.avatar) ?? initialsFromName(displayName);
  const resolvedAvatarUrl = avatarUrl || dashboard?.user.avatarUrl || null;

  return (
    <div className="sticky top-0 z-30 px-5 md:px-10 pt-4 pb-3 backdrop-blur-xl bg-[#050505]/60">
      <div className="flex items-center gap-3">
        <div className="hidden md:block min-w-0">
          <motion.div
            key={greet}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs uppercase tracking-[0.3em] text-white/40"
          >
            {greet}
          </motion.div>
          <div className="font-display text-lg truncate">
            {displayName.split(" ")[0]} {semester ? `/ Sem ${semester}` : ""}
          </div>
        </div>
        <button
          onClick={onSearch}
          className="flex-1 max-w-xl flex items-center gap-3 glass rounded-full px-4 py-2.5 text-sm text-white/50 hover:text-white hover:border-white/20 transition"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Search assignments, faculty, events...</span>
          <kbd className="hidden md:inline text-[10px] px-1.5 py-0.5 rounded bg-white/10">
            Ctrl K
          </kbd>
        </button>
        <button
          type="button"
          onClick={onAssistant}
          className={`group flex shrink-0 items-center gap-2 rounded-full border px-2 py-1.5 pr-2.5 text-left transition ${
            assistantOpen
              ? "border-cyan-300/35 bg-cyan-300/10 text-white shadow-[0_0_24px_oklch(0.82_0.18_200_/_0.16)]"
              : "glass text-white/70 hover:text-white hover:border-white/20"
          }`}
          aria-label="Open AI mentor"
          aria-pressed={assistantOpen}
        >
          <span
            className="size-8 rounded-full flex items-center justify-center relative overflow-hidden"
            style={{ background: "var(--grad-aurora)" }}
          >
            <GraduationCap className="relative size-4 text-white" />
          </span>
          <span className="hidden lg:flex flex-col leading-none">
            <span className="font-display text-xs tracking-wide">AI Mentor</span>
            <span className="mt-1 text-[9px] uppercase tracking-[0.22em] text-white/38">
              Tutor synced
            </span>
          </span>
        </button>
        <IconBtn onClick={() => setDark((d) => !d)} aria-label="Theme">
          {dark ? <Moon className="size-4" /> : <Sun className="size-4" />}
        </IconBtn>
        <IconBtn 
          onClick={() => {
            setHasViewedNotifs(true);
            onNotif();
          }} 
          aria-label="Notifications"
        >
          <Bell className="size-4" />
          {!hasViewedNotifs && <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-[oklch(0.72_0.27_350)]" />}
        </IconBtn>
        <Link
          to="/app/profile"
          className="size-10 rounded-full flex items-center justify-center text-xs font-semibold ml-1 overflow-hidden shrink-0 border border-white/20"
          style={{ background: "var(--grad-aurora)" }}
        >
          {resolvedAvatarUrl ? <img src={resolvedAvatarUrl} alt="User Avatar" className="size-full object-cover" /> : avatar}
        </Link>
      </div>
    </div>
  );
}

function IconBtn({ children, ...p }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...p}
      className="relative size-10 rounded-full glass flex items-center justify-center text-white/70 hover:text-white hover:border-white/20 transition"
    >
      {children}
    </button>
  );
}

function Fab({
  open,
  setOpen,
  currentPath,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  currentPath: string;
}) {
  const { dashboard } = useStudentDashboard();
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [copiedMessageKey, setCopiedMessageKey] = useState<string | null>(null);
  const voiceRef = useRef<VoiceCommandController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useState<StudentAssistantMessage[]>(
    () => getStoredStudentAssistantMessages() ?? defaultStudentAssistantMessages(),
  );
  const [promptOptions, setPromptOptions] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prompts = dashboard?.ai_context.suggested_prompts ?? [
    "Summarise my deadlines",
    "Show my attendance",
    "Predict my CGPA",
  ];

  useEffect(() => {
    setPromptOptions(dashboard?.ai_context.suggested_prompts ?? prompts);
  }, [dashboard]);

  useEffect(() => {
    setStoredStudentAssistantMessages(messages);
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing, open]);

  useEffect(() => {
    return () => voiceRef.current?.stop();
  }, []);

  async function sendAi(text: string, replaceFromIndex: number | null = editingIndex) {
    const cleanText = text.trim();
    if (!cleanText || typing) return;
    voiceRef.current?.stop();
    const baseMessages = replaceFromIndex === null ? messages : messages.slice(0, replaceFromIndex);
    const history = baseMessages.slice(-10);
    setMessages([...baseMessages, { role: "user", text: cleanText }]);
    setInput("");
    setEditingIndex(null);
    setTyping(true);
    try {
      const response = await sendStudentAssistantMessage({
        message: cleanText,
        current_path: currentPath,
        history,
      });
      setMessages((current) => [...current, { role: "ai", text: response.answer }]);
      if (response.suggestedPrompts.length) setPromptOptions(response.suggestedPrompts);
    } catch (error) {
      setMessages((current) => [
        ...current,
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
    const message = messages[index];
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
      setMessages((current) => [
        ...current,
        { role: "ai", text: "I could not copy that message in this browser." },
      ]);
    }
  }

  function cancelEdit() {
    setEditingIndex(null);
    setInput("");
  }

  function clearChat() {
    voiceRef.current?.stop();
    clearStoredStudentAssistantMessages();
    setMessages(defaultStudentAssistantMessages());
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
        setMessages((current) => [
          ...current,
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
    <>
      <AnimatePresence>
        {open && (
          <motion.button
            type="button"
            aria-label="Close assistant"
            onClick={() => setOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30 cursor-default bg-transparent"
          />
        )}
      </AnimatePresence>
      <div className="pointer-events-none fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
        <AnimatePresence>
          {open && (
          <motion.div
            data-lenis-prevent
            onWheelCapture={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
            onTouchMoveCapture={(event) => event.stopPropagation()}
            onTouchMove={(event) => event.stopPropagation()}
            initial={{ opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.94 }}
            className="pointer-events-auto w-[min(calc(100vw-32px),430px)] overflow-hidden rounded-3xl border border-white/12 bg-[#080808]/95 shadow-2xl shadow-black/50 backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
              <div className="flex items-center gap-3">
                <span
                  className="size-10 rounded-2xl flex items-center justify-center"
                  style={{ background: "var(--grad-aurora)" }}
                >
                  <Sparkles className="size-4" />
                </span>
                <div>
                  <div className="font-display text-lg leading-none">Student AI Assistant</div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.24em] text-white/40">
                    Backend synced
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearChat}
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-white/5 px-3 text-xs text-white/55 hover:bg-white/10 hover:text-white"
                  aria-label="Clear assistant chat"
                  title="Clear chat"
                >
                  <Trash2 className="size-3.5" />
                  <span className="hidden sm:inline">Clear</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="size-9 rounded-full bg-white/5 text-white/55 hover:text-white"
                  aria-label="Close assistant"
                >
                  <X className="mx-auto size-4" />
                </button>
              </div>
            </div>

            <div
              ref={scrollRef}
              data-lenis-prevent
              onWheelCapture={(event) => event.stopPropagation()}
              onWheel={(event) => event.stopPropagation()}
              onTouchMoveCapture={(event) => event.stopPropagation()}
              onTouchMove={(event) => event.stopPropagation()}
              className="max-h-[380px] overflow-y-auto overscroll-contain px-4 py-4 space-y-3"
            >
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`group flex flex-col ${
                    message.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`max-w-[82%] whitespace-pre-wrap break-words rounded-3xl px-4 py-2.5 text-sm leading-6 ${
                      message.role === "user" ? "bg-white text-black" : "glass text-white"
                    }`}
                  >
                    {message.text}
                  </div>
                  <div
                    className={`mt-1 flex items-center gap-1 px-1 text-white/45 transition group-hover:text-white/70 ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => void copyMessage(`${message.role}-${index}`, message.text)}
                      className="rounded-full p-1.5 hover:bg-white/10 hover:text-white"
                      aria-label="Copy message"
                      title="Copy"
                    >
                      {copiedMessageKey === `${message.role}-${index}` ? (
                        <Check className="size-3.5" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </button>
                    {message.role === "user" && (
                      <button
                        type="button"
                        onClick={() => editMessage(index)}
                        className="rounded-full p-1.5 hover:bg-white/10 hover:text-white"
                        aria-label="Edit and send again"
                        title="Edit and send again"
                      >
                        <PencilLine className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {typing && (
                <div className="inline-flex rounded-3xl glass px-4 py-2 text-sm text-white/55">
                  Thinking...
                </div>
              )}
            </div>

            <div className="px-4 pb-3 flex gap-2 overflow-x-auto">
              {(promptOptions.length ? promptOptions : prompts).slice(0, 4).map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void sendAi(prompt, null)}
                  className="shrink-0 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-white/65 hover:text-white"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void sendAi(input);
              }}
              className="border-t border-white/10 p-3"
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
              <div className="glass flex items-center gap-2 rounded-2xl px-3 py-2">
                <button
                  type="button"
                  onClick={toggleVoice}
                  disabled={!voiceSupported}
                  className={`size-9 rounded-xl transition ${
                    listening ? "bg-cyan-400/15 text-cyan-100" : "text-white/55 hover:text-white"
                  }`}
                  aria-label={listening ? "Stop voice input" : "Start voice input"}
                >
                  <Mic className="mx-auto size-4" />
                </button>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={listening ? "Listening..." : "Ask your student assistant..."}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/35"
                />
                <button
                  type="submit"
                  disabled={typing || !input.trim()}
                  className="size-9 rounded-xl text-white"
                  style={{ background: "var(--grad-aurora)" }}
                >
                  <Send className="mx-auto size-4" />
                </button>
              </div>
            </form>
          </motion.div>
        )}
        </AnimatePresence>
      </div>
    </>
  );
}

function NotifDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { dashboard } = useStudentDashboard();
  const groups = dashboard
    ? Object.values(
        dashboard.announcements.reduce<
          Record<
            string,
            { group: string; items: { id: number; title: string; body: string; time: string }[] }
          >
        >((acc, item) => {
          acc[item.category] ??= { group: item.category, items: [] };
          acc[item.category].items.push({
            id: item.id,
            title: item.title,
            body: item.body,
            time: item.time,
          });
          return acc;
        }, {}),
      )
    : [
        {
          group: "Syncing",
          items: [
            {
              id: 0,
              title: "Notifications syncing",
              body: "Backend data is loading.",
              time: "now",
            },
          ],
        },
      ];
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[420px] p-4"
          >
            <div className="h-full glass-strong rounded-3xl flex flex-col overflow-hidden">
              <div className="flex items-center justify-between p-5 border-b border-white/10">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Inbox</div>
                  <div className="font-display text-xl">Notifications</div>
                </div>
                <button
                  onClick={onClose}
                  className="size-9 rounded-full glass flex items-center justify-center"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
                {groups.map((group) => (
                  <div key={group.group}>
                    <div className="px-2 mb-2 text-[10px] uppercase tracking-[0.3em] text-white/40">
                      {group.group}
                    </div>
                    <div className="space-y-2">
                      {group.items.map((n) => (
                        <motion.div
                          key={n.id}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="glass rounded-2xl p-4 hover:border-white/20 transition cursor-pointer"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="font-medium text-sm">{n.title}</div>
                            <div className="text-[10px] text-white/40 shrink-0">{n.time}</div>
                          </div>
                          <p className="mt-1 text-xs text-white/55">{n.body}</p>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const all = [
    ...NAV.map((n) => ({ kind: "Page", label: n.label, to: n.to })),
    { kind: "Assignment", label: "Transformer Architecture Report", to: "/app/assignments" },
    { kind: "Faculty", label: "Dr. Anaya Krishnan / Adv. ML", to: "/app/profile" },
    { kind: "Event", label: "TEDxCampusVerse 2026", to: "/app/events" },
    { kind: "Resource", label: "Deep Learning / Goodfellow", to: "/app/resources" },
    { kind: "Complaint", label: "Hostel B Wi-Fi outage", to: "/app/complaints" },
  ];
  const results = q
    ? all.filter((a) => a.label.toLowerCase().includes(q.toLowerCase()))
    : all.slice(0, 8);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-start justify-center pt-32 px-4"
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ y: -20, scale: 0.96 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: -20, scale: 0.96 }}
            className="w-full max-w-2xl glass-strong rounded-3xl overflow-hidden"
          >
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
              <Search className="size-4 text-white/50" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search anything across CampusVerse..."
                className="flex-1 bg-transparent focus:outline-none text-sm"
              />
              <button
                onClick={onClose}
                className="text-[10px] uppercase tracking-widest text-white/40"
              >
                esc
              </button>
            </div>
            <div className="max-h-[50vh] overflow-y-auto py-2">
              {results.map((r) => (
                <Link
                  key={r.kind + r.label}
                  to={r.to}
                  onClick={onClose}
                  className="flex items-center justify-between px-5 py-3 hover:bg-white/5 transition"
                >
                  <span className="text-sm">{r.label}</span>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                    {r.kind}
                  </span>
                </Link>
              ))}
              {results.length === 0 && (
                <div className="px-5 py-10 text-center text-white/40 text-sm">No results.</div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { Send };
