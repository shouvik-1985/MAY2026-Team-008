import { NotificationCenter } from "@/components/app/NotificationCenter";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ComponentType,
  type MouseEvent,
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
  Brain,
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
  getStoredProfessorProfile,
  professorInitialsFromName,
  professorProfileEventName,
  type EditableProfessorProfile,
} from "@/lib/professor-profile";
import {
  clearStoredStudentAssistantMessages,
  defaultStudentAssistantMessages,
  getStoredStudentAssistantMessages,
  setStoredStudentAssistantMessages,
} from "@/lib/student-assistant-session";
import { copyTextToClipboard } from "@/lib/clipboard";
import { startVoiceCommand, type VoiceCommandController } from "@/lib/voice-command";
import { useTheme } from "@/lib/theme";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
};
const NAV: NavItem[] = [
  { href: "/professor", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/professor#students", label: "Students", icon: Users },
  { href: "/professor#academics", label: "Attendance & Academics", icon: ClipboardCheck },
  { href: "/professor#announcements", label: "Announcements", icon: Megaphone },
  { href: "/professor#resources", label: "Study Resources", icon: Library },
  { href: "/professor#reviews", label: "Assignment Reviews", icon: FileText },
  { href: "/professor#connect", label: "Connect", icon: MessageSquare },
  { href: "/professor#profile", label: "Profile", icon: User },
];
const PROFILE_NAV_ITEM = NAV.find((item) => item.href === "/professor#profile") ?? NAV[NAV.length - 1];

export function ProfessorShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [openNotif, setOpenNotif] = useState(false);
  const [openSearch, setOpenSearch] = useState(false);
  const [openFab, setOpenFab] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [notifUnread, setNotifUnread] = useState(0);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [hash, setHash] = useState(() => (typeof window === "undefined" ? "" : window.location.hash));
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDark = theme === "dark";

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

  useEffect(() => {
    const syncHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", syncHash);
    window.addEventListener("popstate", syncHash);
    return () => {
      window.removeEventListener("hashchange", syncHash);
      window.removeEventListener("popstate", syncHash);
    };
  }, []);

  function selectSection(event: MouseEvent<HTMLAnchorElement>, item: NavItem) {
    event.preventDefault();
    const nextHash = item.exact ? "" : item.href.slice(item.href.indexOf("#"));
    if (pathname !== "/professor") {
      void navigate({ to: "/professor" });
      return;
    }
    if (hash === nextHash) return;
    window.history.pushState(null, "", `/professor${nextHash}`);
    setHash(nextHash);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

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
    <div className={`cv-student-shell relative min-h-screen ${isDark ? "text-white" : "text-slate-900"}`}>
      {/* Sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 84 : 264 }}
        transition={{ type: "spring", stiffness: 220, damping: 28 }}
        className="fixed inset-y-0 left-0 z-40 hidden md:flex flex-col p-3"
      >
        <div
          className={`relative h-full rounded-3xl flex flex-col overflow-hidden transition-all duration-300 ${
            isDark
              ? "bg-[#0b0e17]/95 border border-white/10 shadow-2xl text-white"
              : "text-slate-900 shadow-lg shadow-slate-900/5"
          }`}
          style={
            !isDark
              ? {
                  backgroundColor: "#F8FAFC",
                  borderColor: "#E5E7EB",
                  borderWidth: "1px",
                  borderStyle: "solid",
                }
              : undefined
          }
        >
          {/* logo */}
          <div
            className={`flex ${collapsed ? "flex-col items-center gap-3 px-2 py-4" : "items-center justify-between px-4 py-5"} transition-all duration-300`}
            style={{ borderBottom: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid #E5E7EB" }}
          >
            <Link to="/professor" className="flex items-center gap-2.5 min-w-0">
              <span
                className="size-7.5 rounded-xl flex items-center justify-center shrink-0 shadow-md"
                style={{ background: "var(--grad-aurora)", boxShadow: "0 0 18px rgba(76, 175, 80, 0.26)" }}
              >
                <Sparkles className="size-4 text-white" />
              </span>
              {!collapsed && (
                <span className={`font-display text-sm tracking-[0.25em] uppercase truncate font-black ${isDark ? "text-white" : "text-slate-950"}`}>
                  CampusVerse
                </span>
              )}
            </Link>
            <button
              onClick={() => setCollapsed((c) => !c)}
              className={isDark ? "text-slate-400 hover:text-white p-1 rounded-lg transition" : "text-slate-400 hover:text-slate-900 hover:bg-[#ecf8e6] p-1 rounded-lg transition"}
            >
              <motion.span animate={{ rotate: collapsed ? 180 : 0 }}>
                <ChevronLeft className="size-4" />
              </motion.span>
            </button>
          </div>

          <nav className="flex-1 min-h-0 overflow-y-auto px-2.5 py-3 space-y-1 [ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {NAV.map((item) => {
              const targetHash = item.href.includes("#") ? item.href.slice(item.href.indexOf("#")) : "";
              const active = item.exact
                ? pathname === "/professor" && !hash
                : pathname === "/professor" && hash === targetHash;
              const Icon = item.icon;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={(event) => selectSection(event, item)}
                  title={collapsed ? item.label : undefined}
                  className={`group relative flex items-center rounded-xl text-sm transition-all duration-200 ${
                    collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"
                  } ${
                    active
                      ? isDark
                        ? "text-slate-950 font-bold bg-gradient-to-r from-green-600 via-emerald-500 to-lime-300 shadow-lg shadow-green-600/30 border border-emerald-300/40"
                        : "text-[#1f7a32] font-extrabold shadow-2xs"
                      : isDark
                        ? "text-slate-300/80 font-medium hover:text-white hover:bg-white/10"
                        : "text-slate-700 font-semibold hover:text-[#1f7a32]"
                  }`}
                  style={
                    !isDark
                      ? {
                          backgroundColor: active ? "#ecf8e6" : undefined,
                          borderLeft: active ? "4px solid #4caf50" : "4px solid transparent",
                        }
                      : undefined
                  }
                  onMouseEnter={(e) => {
                    if (!isDark && !active) {
                      e.currentTarget.style.backgroundColor = "#ecf8e6";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isDark && !active) {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }
                  }}
                >
                  <Icon className={`size-4 shrink-0 transition-colors ${
                    active
                      ? isDark ? "text-white" : "text-[#2f8f46]"
                      : isDark ? "text-slate-400 group-hover:text-white" : "text-slate-500 group-hover:text-[#2f8f46]"
                  }`} />
                  {!collapsed && <span className="relative z-10 truncate">{item.label}</span>}
                </a>
              );
            })}

          </nav>

          <div className="mt-auto px-2.5 pb-3">
            <div
              className="border-t pt-3"
              style={{ borderColor: isDark ? "rgba(255,255,255,0.1)" : "#E5E7EB" }}
            >
              <button
                onClick={logout}
                disabled={loggingOut}
                title={collapsed ? "Logout" : undefined}
                className={`group relative flex w-full items-center rounded-2xl border text-sm font-bold transition disabled:cursor-wait disabled:opacity-60 ${
                  collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5"
                } ${
                  isDark
                    ? "border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 hover:border-rose-400/50"
                    : "border-rose-200/80 bg-rose-50/80 text-rose-600 hover:bg-rose-100/90 hover:text-rose-700 hover:border-rose-300 shadow-2xs"
                }`}
              >
                <div className={`size-7 rounded-xl flex items-center justify-center shrink-0 ${isDark ? "bg-rose-500/20 text-rose-300" : "bg-rose-100 text-rose-600"}`}>
                  <LogOut className="size-4" />
                </div>
                {!collapsed && (
                  <span className="relative z-10 truncate">
                    {loggingOut ? "Logging out" : "Logout"}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </motion.aside>

      {/* Main */}
      <div
        className={`min-h-screen transition-[padding] duration-300 ${collapsed ? "md:pl-[100px]" : "md:pl-[280px]"}`}
      >
        <TopBar
          onSearch={() => setOpenSearch(true)}
          onNotif={() => setOpenNotif(true)}
          onProfile={(event) => selectSection(event, PROFILE_NAV_ITEM)}
          onAssistant={() => setOpenFab((open) => !open)}
          assistantOpen={openFab}
          notifUnread={notifUnread}
        />
        <main className="cv-app-content px-5 md:px-10 py-6 pb-32 max-w-[1400px] mx-auto">{children}</main>
      </div>

      {/* Floating Action */}
      <Fab open={openFab} setOpen={setOpenFab} currentPath={pathname} />

      {/* Notifications drawer */}
      <NotificationCenter open={openNotif} onClose={() => setOpenNotif(false)} onUnreadCountChange={(c) => setNotifUnread(c)} />

      {/* Global search */}
      <SearchPalette open={openSearch} onClose={() => setOpenSearch(false)} />
    </div>
  );
}

function TopBar({
  onSearch,
  onNotif,
  onProfile,
  onAssistant,
  assistantOpen,
  notifUnread,
}: {
  onSearch: () => void;
  onNotif: () => void;
  onProfile: (event: MouseEvent<HTMLAnchorElement>) => void;
  onAssistant: () => void;
  assistantOpen: boolean;
  notifUnread: number;
}) {
  const { theme, toggleTheme } = useTheme();
  const [authUser, setAuthUser] = useState(() => getStoredUser());
  const [professorProfile, setProfessorProfile] = useState<EditableProfessorProfile | null>(() =>
    getStoredProfessorProfile(),
  );
  useEffect(() => setAuthUser(getStoredUser()), []);
  useEffect(() => {
    const onProfileUpdate = (event: Event) => {
      const detail = (event as CustomEvent<EditableProfessorProfile>).detail;
      setProfessorProfile(detail ?? getStoredProfessorProfile());
    };
    const eventName = professorProfileEventName();
    window.addEventListener(eventName, onProfileUpdate);
    return () => window.removeEventListener(eventName, onProfileUpdate);
  }, []);
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const displayName = professorProfile?.name.trim() || authUser?.full_name || "Professor";
  const avatar = professorInitialsFromName(displayName);
  const resolvedAvatarUrl = professorProfile?.avatarUrl ?? null;
  const isDark = theme === "dark";

  return (
    <div className={`sticky top-0 z-30 px-5 pb-3 pt-4 backdrop-blur-xl md:px-10 ${
      isDark
        ? "bg-[color:var(--glass-nav-bg)]"
        : "bg-white/90 border-b border-slate-200/80 shadow-sm"
    }`}>
      <div className="flex items-center gap-3">
        <div className="hidden md:block min-w-0">
          <motion.div
            key={greet}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`text-xs uppercase tracking-[0.3em] font-semibold ${isDark ? "text-white/50" : "text-slate-700"}`}
          >
            {greet}
          </motion.div>
          <div className={`font-display text-lg font-bold truncate ${isDark ? "text-white" : "text-slate-900"}`}>
            {displayName.split(" ")[0]}
          </div>
        </div>
        <button
          onClick={onSearch}
          className={`flex max-w-xl flex-1 items-center gap-3 rounded-full px-4 py-2.5 text-sm transition ${
            isDark
              ? "glass text-white/60 hover:text-white hover:border-white/20"
              : "bg-white/90 border border-slate-200 text-slate-600 hover:text-slate-950 hover:border-[#4caf50] hover:bg-white shadow-sm font-medium"
          }`}
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Search assignments, faculty, events...</span>
          <kbd className={`hidden md:inline text-[10px] px-1.5 py-0.5 rounded font-mono ${isDark ? "bg-white/10 text-white/70" : "bg-slate-100 text-slate-600 border border-slate-200 font-semibold"}`}>
            Ctrl K
          </kbd>
        </button>
        <button
          type="button"
          onClick={onAssistant}
          className={`group flex shrink-0 items-center gap-2 rounded-full border px-2 py-1.5 pr-2.5 text-left transition ${
            assistantOpen
              ? isDark
                ? "border-emerald-300/35 bg-emerald-300/10 text-white shadow-[0_0_24px_rgba(76,175,80,0.16)]"
                : "border-[#4caf50] bg-[#ecf8e6] text-[#1f7a32] shadow-[0_0_18px_rgba(76,175,80,0.18)]"
              : isDark
                ? "glass text-white/80 hover:text-white hover:border-white/20"
                : "bg-white/90 border-slate-200 text-slate-800 hover:text-slate-950 hover:border-[#4caf50] hover:bg-[#ecf8e6] shadow-sm font-medium"
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
            <span className="font-display text-xs tracking-wide font-semibold">AI Mentor</span>
            <span className={`mt-1 text-[9px] uppercase tracking-[0.22em] font-medium ${isDark ? "text-white/45" : "text-slate-600"}`}>
              Tutor synced
            </span>
          </span>
        </button>
        <IconBtn
          onClick={toggleTheme}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          dark={isDark}
        >
          {isDark ? (
            <Sun className="size-4 text-amber-400 fill-amber-400/20" />
          ) : (
            <Moon className="size-4 text-emerald-700 fill-emerald-600/20" />
          )}
        </IconBtn>
        <IconBtn
          onClick={onNotif}
          aria-label="Notifications"
          title="Notifications"
          dark={isDark}
        >
          <Bell className="size-4" />
          {notifUnread > 0 && (
            <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(239,68,68,0.8)] ring-1 ring-white/40" />
          )}
        </IconBtn>
        <a
          href="/professor#profile"
          onClick={onProfile}
          aria-label="Open professor profile"
          title="Profile"
          className="size-10 rounded-full flex items-center justify-center text-xs font-semibold ml-1 overflow-hidden shrink-0 border border-white/20"
          style={{ background: "var(--grad-aurora)" }}
        >
          {resolvedAvatarUrl ? <img src={resolvedAvatarUrl} alt="User Avatar" className="size-full object-cover" /> : avatar}
        </a>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  dark = true,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { dark?: boolean }) {
  return (
    <button
      {...p}
      className={`relative flex size-10 items-center justify-center rounded-full transition ${
        dark
          ? "glass text-white/70 hover:text-white hover:border-white/20"
          : "bg-white/80 border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-[#4caf50] hover:bg-[#ecf8e6] shadow-sm"
      }`}
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
  const { theme } = useTheme();
  const isDark = theme === "dark";
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
            className={`pointer-events-auto w-[min(calc(100vw-32px),430px)] overflow-hidden rounded-3xl border shadow-2xl backdrop-blur-xl ${
              isDark
                ? "border-white/12 bg-[#080808]/95 shadow-black/50"
                : "border-[#b9dfad] shadow-green-100/80"
            }`}
            style={isDark ? {} : { background: "linear-gradient(160deg, #f4fbef 0%, #ecf8e6 50%, #f7fff2 100%)" }}
          >
            <div className={`flex items-center justify-between border-b px-4 py-4 ${isDark ? "border-white/10" : "border-slate-100"}`}>
              <div className="flex items-center gap-3">
                <span
                  className="size-10 rounded-2xl flex items-center justify-center"
                  style={{ background: "var(--grad-aurora)" }}
                >
                  <Sparkles className="size-4" />
                </span>
                <div>
                  <div className={`font-display text-lg leading-none ${isDark ? "text-white" : "text-slate-900"}`}>Student AI Assistant</div>
                  <div className={`mt-1 text-[10px] uppercase tracking-[0.24em] ${isDark ? "text-white/40" : "text-slate-400"}`}>
                    Backend synced
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearChat}
                  className={`inline-flex h-9 items-center gap-2 rounded-full px-3 text-xs transition ${isDark ? "bg-white/5 text-white/55 hover:bg-white/10 hover:text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900"}`}
                  aria-label="Clear assistant chat"
                  title="Clear chat"
                >
                  <Trash2 className="size-3.5" />
                  <span className="hidden sm:inline">Clear</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className={`size-9 rounded-full transition ${isDark ? "bg-white/5 text-white/55 hover:text-white" : "bg-slate-100 text-slate-500 hover:text-slate-900"}`}
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
                      message.role === "user"
                        ? isDark ? "bg-white text-black" : "bg-[#2f8f46] text-white"
                        : isDark ? "glass text-white" : "bg-white/90 text-slate-800 border border-[#b9dfad]"
                    }`}
                  >
                    {message.text}
                  </div>
                  <div
                    className={`mt-1 flex items-center gap-1 px-1 transition ${isDark ? "text-white/45 group-hover:text-white/70" : "text-slate-300 group-hover:text-slate-500"} ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => void copyMessage(`${message.role}-${index}`, message.text)}
                      className={`rounded-full p-1.5 transition ${isDark ? "hover:bg-white/10 hover:text-white" : "hover:bg-slate-100 hover:text-slate-700"}`}
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
                        className={`rounded-full p-1.5 transition ${isDark ? "hover:bg-white/10 hover:text-white" : "hover:bg-slate-100 hover:text-slate-700"}`}
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
                <div className={`inline-flex rounded-3xl px-4 py-2 text-sm ${isDark ? "glass text-white/55" : "bg-slate-100 text-slate-500 border border-slate-200"}`}>
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
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition ${isDark ? "border-white/10 bg-white/[0.05] text-white/65 hover:text-white" : "border-[#b9dfad] bg-white/70 text-[#2f8f46] hover:bg-[#ecf8e6] hover:text-[#1f7a32]"}`}
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
              className={`border-t p-3 ${isDark ? "border-white/10" : "border-slate-100"}`}
            >
              {editingIndex !== null && (
                <div className="mb-2 flex items-center justify-between rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs text-emerald-50">
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
              <div className={`flex items-center gap-2 rounded-2xl px-3 py-2 ${isDark ? "glass" : "bg-white/80 border border-[#b9dfad]"}`}>
                <button
                  type="button"
                  onClick={toggleVoice}
                  disabled={!voiceSupported}
                  className={`size-9 rounded-xl transition ${
                    listening
                      ? "bg-emerald-400/15 text-emerald-700"
                      : isDark ? "text-white/55 hover:text-white" : "text-slate-400 hover:text-slate-700"
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
                  className={`min-w-0 flex-1 bg-transparent text-sm outline-none ${isDark ? "text-white placeholder:text-white/35" : "text-slate-900 placeholder:text-slate-400"}`}
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
  const { theme } = useTheme();
  const isDark = theme === "dark";
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
            <div
              className={`h-full rounded-3xl flex flex-col overflow-hidden ${isDark ? "glass-strong" : "border border-[#b9dfad] shadow-2xl shadow-green-100/60"}`}
              style={isDark ? {} : { background: "linear-gradient(160deg, #f4fbef 0%, #ecf8e6 50%, #f7fff2 100%)" }}
            >
              <div className={`flex items-center justify-between p-5 border-b ${isDark ? "border-white/10" : "border-slate-100"}`}>
                <div>
                  <div className={`text-[10px] uppercase tracking-[0.3em] font-bold ${isDark ? "text-white/40" : "text-slate-400"}`}>Inbox</div>
                  <div className={`font-display text-xl ${isDark ? "text-white" : "text-slate-900"}`}>Notifications</div>
                </div>
                <button
                  onClick={onClose}
                  className={`size-9 rounded-full flex items-center justify-center transition ${isDark ? "glass text-white/60 hover:text-white" : "bg-slate-100 text-slate-500 hover:text-slate-900"}`}
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
                {groups.map((group) => (
                  <div key={group.group}>
                    <div className={`px-2 mb-2 text-[10px] uppercase tracking-[0.3em] font-bold ${isDark ? "text-white/40" : "text-slate-400"}`}>
                      {group.group}
                    </div>
                    <div className="space-y-2">
                      {group.items.map((n) => (
                        <motion.div
                          key={n.id}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className={`rounded-2xl p-4 transition cursor-pointer ${isDark ? "glass hover:border-white/20" : "bg-white/80 border border-[#b9dfad] hover:border-[#8fca83] hover:bg-[#ecf8e6]"}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className={`font-medium text-sm ${isDark ? "text-white" : "text-slate-900"}`}>{n.title}</div>
                            <div className={`text-[10px] shrink-0 ${isDark ? "text-white/40" : "text-slate-400"}`}>{n.time}</div>
                          </div>
                          <p className={`mt-1 text-xs ${isDark ? "text-white/55" : "text-slate-500"}`}>{n.body}</p>
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
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const all = [
    ...NAV.map((n) => ({ kind: "Page", label: n.label, href: n.href })),
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
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-start justify-center pt-32 px-4"
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ y: -20, scale: 0.96 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: -20, scale: 0.96 }}
            className={`w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl border ${
              isDark
                ? "glass-strong border-white/10"
                : "bg-white border-slate-200"
            }`}
          >
            {/* Search input */}
            <div className={`flex items-center gap-3 px-5 py-4 border-b ${
              isDark ? "border-white/10" : "border-slate-200"
            }`}>
              <Search className={`size-4 ${isDark ? "text-white/50" : "text-slate-400"}`} />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search anything across CampusVerse..."
                className={`flex-1 bg-transparent focus:outline-none text-sm font-medium ${
                  isDark ? "text-white placeholder:text-white/40" : "text-slate-900 placeholder:text-slate-400"
                }`}
              />
              <button
                onClick={onClose}
                className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md border transition ${
                  isDark
                    ? "text-white/40 border-white/10 hover:border-white/20"
                    : "text-slate-500 border-slate-300 bg-slate-100 hover:bg-slate-200"
                }`}
              >
                ESC
              </button>
            </div>

            {/* Results */}
            <div className="max-h-[50vh] overflow-y-auto py-2">
              {results.map((r) => (
                <a
                  key={r.kind + r.label}
                  href={r.href}
                  onClick={onClose}
                  className={`flex items-center justify-between px-5 py-3 transition ${
                    isDark
                      ? "hover:bg-white/5 text-white/80 hover:text-white"
                      : "hover:bg-green-50 text-slate-800 hover:text-slate-950"
                  }`}
                >
                  <span className="text-sm font-medium">{r.label}</span>
                  <span className={`text-[10px] uppercase tracking-[0.2em] font-bold px-2 py-0.5 rounded-full ${
                    isDark
                      ? "text-white/40 bg-white/5"
                      : "text-[#2f8f46] bg-green-50 border border-green-200"
                  }`}>
                    {r.kind}
                  </span>
                </a>
              ))}
              {results.length === 0 && (
                <div className={`px-5 py-10 text-center text-sm ${isDark ? "text-white/40" : "text-slate-500"}`}>
                  No results.
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { Send };
