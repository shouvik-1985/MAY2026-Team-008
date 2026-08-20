import { Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import {
  Bell,
  BookOpen,
  ChevronLeft,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MessageCircle,
  Moon,
  Search,
  Sparkles,
  Sun,
  User,
  Users,
} from "lucide-react";
import { getProfessorDashboard, logoutAccount } from "@/lib/api";
import { clearAuthSession, getStoredUser } from "@/lib/auth";
import {
  getStoredProfessorProfile,
  professorInitialsFromName,
  professorProfileEventName,
  type EditableProfessorProfile,
} from "@/lib/professor-profile";
import { clearStoredDashboard } from "@/lib/student-session";
import { NotificationCenter, type BackendNotification } from "@/components/app/NotificationCenter";
import { clearStoredRole } from "@/lib/use-role";
import { useTheme } from "@/lib/theme";

const NAV = [
  { href: "#dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "#students", label: "Students", icon: Users },
  { href: "#academics", label: "CGPA & Attendance", icon: GraduationCap },
  { href: "#announcements", label: "Announcements", icon: Megaphone },
  { href: "#resources", label: "Study Resources", icon: BookOpen },
  { href: "#reviews", label: "Assignment Reviews", icon: ClipboardCheck },
  { href: "#profile", label: "Profile", icon: User },
  { href: "#connect", label: "Connect", icon: MessageCircle },
];
const PROFESSOR_NOTIFICATION_SYNC_MS = 30_000;

export function ProfessorShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [time, setTime] = useState(() => new Date());
  const [activeHash, setActiveHash] = useState(() =>
    typeof window === "undefined"
      ? "dashboard"
      : window.location.hash.replace("#", "") || "dashboard",
  );
  const user = getStoredUser();
  const [profile, setProfile] = useState<EditableProfessorProfile | null>(() =>
    getStoredProfessorProfile(),
  );
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const isDark = theme === "dark";
  const displayName = profile?.name.trim() || user?.full_name || "Professor";
  const avatar = professorInitialsFromName(displayName);
  const currentAvatarUrl =
    profile && profile.avatarUrl !== undefined
      ? profile.avatarUrl ?? null
      : (user as any)?.avatarUrl || (user as any)?.avatar_url || null;

  useEffect(() => {
    const ticker = setInterval(() => setTime(new Date()), 30_000);
    return () => clearInterval(ticker);
  }, []);

  useEffect(() => {
    function syncHash() {
      setActiveHash(window.location.hash.replace("#", "") || "dashboard");
    }

    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  useEffect(() => {
    const eventName = professorProfileEventName();
    function syncProfile(event?: Event) {
      const detail =
        event instanceof CustomEvent ? (event.detail as EditableProfessorProfile | null) : null;
      setProfile(detail ?? getStoredProfessorProfile());
    }

    syncProfile();
    window.addEventListener(eventName, syncProfile as EventListener);
    return () => window.removeEventListener(eventName, syncProfile as EventListener);
  }, []);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logoutAccount();
    } catch {
      // The browser session still needs to close even if the API is restarting.
    } finally {
      clearAuthSession();
      clearStoredDashboard();
      clearStoredRole();
      navigate({ to: "/login", replace: true });
    }
  }

  const [openNotif, setOpenNotif] = useState(false);
  const [professorNotifications, setProfessorNotifications] = useState<BackendNotification[]>(() => {
    try {
      const cached = localStorage.getItem("cv-prof-notifs-cache");
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [unreadCountOverride, setUnreadCountOverride] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const fetchNotifs = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      getProfessorDashboard()
        .then((data) => {
          if (!active || !data) return;
          const dismissedRaw = localStorage.getItem("campus_dismissed_notif_ids");
          const readRaw = localStorage.getItem("campus_read_notif_ids");
          const dismissedSet = new Set(dismissedRaw ? JSON.parse(dismissedRaw) : []);
          const readSet = new Set(readRaw ? JSON.parse(readRaw) : []);

          const notifSource = (data.notifications && data.notifications.length > 0) ? data.notifications : (data.announcements ?? []);
          const formatted = notifSource
            .filter((n: any) => !dismissedSet.has(String(n.id)))
            .map((n: any) => ({
              id: String(n.id),
              title: n.title,
              body: n.body,
              category: (n.category || "announcement").toLowerCase(),
              time: n.time || "Recently",
              createdAt: n.createdAt || n.time || new Date().toISOString(),
              read: readSet.has(String(n.id)) || (typeof n.read === "boolean" ? n.read : typeof n.unread === "boolean" ? !n.unread : false),
            })) as unknown as BackendNotification[];
          setProfessorNotifications(formatted);
          try {
            localStorage.setItem("cv-prof-notifs-cache", JSON.stringify(formatted));
          } catch {}
        })
        .catch(() => {});
    };

    fetchNotifs();
    const interval = setInterval(fetchNotifs, PROFESSOR_NOTIFICATION_SYNC_MS);
    window.addEventListener("focus", fetchNotifs);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener("focus", fetchNotifs);
    };
  }, [openNotif, activeHash]);

  const rawUnreadCount = professorNotifications.filter((n) => !n.read).length;
  const unreadNotifCount = unreadCountOverride !== null ? unreadCountOverride : rawUnreadCount;


  return (
    <div className={`cv-professor-content cv-admin-content relative min-h-screen ${isDark ? "text-white" : "text-slate-900"}`}>
      <motion.aside
        animate={{ width: collapsed ? 84 : 276 }}
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
          <div
            className="flex items-center justify-between px-4 py-5"
            style={{ borderBottom: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid #E5E7EB" }}
          >
            <Link to="/professor" className="flex items-center gap-2.5 min-w-0">
              <span
                className="size-7.5 rounded-xl flex items-center justify-center shrink-0 shadow-md shadow-green-500/20"
                style={{ background: "var(--grad-aurora)" }}
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
              onClick={() => setCollapsed((value) => !value)}
              className={isDark ? "text-slate-400 hover:text-white p-1 rounded-lg transition" : "text-slate-400 hover:text-slate-900 hover:bg-[#ecf8e6] p-1 rounded-lg transition"}
              aria-label="Collapse sidebar"
            >
              <motion.span animate={{ rotate: collapsed ? 180 : 0 }}>
                <ChevronLeft className="size-4" />
              </motion.span>
            </button>
          </div>

          <nav className="flex-1 min-h-0 overflow-y-auto px-2.5 py-3 space-y-1">
            {NAV.map((item, index) => {
              const Icon = item.icon;
              const isActive = item.href === `#${activeHash}` || (activeHash === "" && index === 0);
              return (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={(event) => {
                    event.preventDefault();
                    const nextHash = item.href.replace("#", "");
                    setActiveHash(nextHash);
                    window.history.replaceState(null, "", item.href);
                    window.dispatchEvent(new HashChangeEvent("hashchange"));
                  }}
                  className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${
                    isActive
                      ? isDark
                        ? "text-[#101417] font-bold bg-[#d8efbc] shadow-lg shadow-green-600/25 border border-[#d8efbc]/70"
                        : "text-[#1f7a32] font-extrabold shadow-2xs"
                      : isDark
                        ? "text-slate-300/80 font-medium hover:text-white hover:bg-white/10"
                        : "text-slate-700 font-semibold hover:text-[#1f7a32]"
                  }`}
                  style={
                    !isDark
                      ? {
                          backgroundColor: isActive ? "#ecf8e6" : undefined,
                          borderLeft: isActive ? "4px solid #4caf50" : "4px solid transparent",
                        }
                      : undefined
                  }
                  onMouseEnter={(e) => {
                    if (!isDark && !isActive) {
                      e.currentTarget.style.backgroundColor = "#ecf8e6";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isDark && !isActive) {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }
                  }}
                >
                  <Icon className={`size-4 shrink-0 transition-colors ${
                    isActive
                      ? isDark ? "text-[#101417]" : "text-[#2f8f46]"
                      : isDark ? "text-slate-400 group-hover:text-white" : "text-slate-500 group-hover:text-[#2f8f46]"
                  }`} />
                  {!collapsed && <span className="relative z-10 truncate">{item.label}</span>}
                </a>
              );
            })}

            <div
              className="mt-3 pt-3"
              style={{ borderTop: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid #E5E7EB" }}
            >
              <button
                onClick={logout}
                disabled={loggingOut}
                className={`group relative flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-sm font-bold transition disabled:cursor-wait disabled:opacity-60 ${
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
          </nav>
        </div>
      </motion.aside>

      <div
        className={`min-h-screen transition-[padding] duration-300 ${collapsed ? "md:pl-[100px]" : "md:pl-[292px]"}`}
      >
        <header className={`sticky top-0 z-30 px-5 pb-3 pt-4 backdrop-blur-xl md:px-10 transition-colors ${
          isDark ? "bg-[#0c0e17]/85 border-b border-white/10" : "bg-white/85 border-b border-slate-200/80 shadow-2xs text-slate-900"
        }`}>
          <div className="flex items-center gap-3">
            <div className="hidden md:block min-w-0">
              <div className={`text-xs uppercase tracking-[0.3em] font-semibold ${isDark ? "text-white/40" : "text-slate-500"}`}>Professor desk</div>
              <div className={`font-display text-lg truncate font-bold ${isDark ? "text-white" : "text-slate-950"}`}>{displayName}</div>
            </div>
            <button className={`flex max-w-xl flex-1 items-center gap-3 rounded-full px-4 py-2.5 text-sm transition border ${
              isDark
                ? "glass text-white/50 hover:text-white hover:border-white/20"
                : "border-slate-200 bg-white/90 text-slate-700 hover:border-slate-300 hover:text-slate-950 shadow-2xs font-medium"
            }`}>
              <Search className="size-4" />
              <span className="flex-1 text-left">Search students, submissions, resources...</span>
              <kbd className={`hidden md:inline text-[10px] px-1.5 py-0.5 rounded ${isDark ? "bg-white/10 text-white/70" : "bg-slate-100 text-slate-600 border border-slate-200"}`}>
                Ctrl K
              </kbd>
            </button>
            <div className={`hidden lg:flex items-center gap-2 px-3 text-xs font-semibold ${isDark ? "text-white/45" : "text-slate-600"}`}>
              <span className="size-1.5 rounded-full bg-emerald-400 pulse-glow" />
              {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.12em] border transition-all shadow-xs ${
                isDark
                  ? "bg-white/10 border-white/20 text-white hover:bg-white/15"
                  : "bg-[#ecf8e6] border-[#a5d6a7] text-[#1f7a32] hover:bg-[#d8efbc] hover:border-[#8fba7c]"
              }`}
            >
              {isDark
                ? <><Sun className="size-3.5 text-amber-300 fill-amber-300/20" /><span className="text-white">Light Mode</span></>
                : <><Moon className="size-3.5 text-[#2f8f46] fill-green-600/20" /><span className="text-[#1f7a32] font-bold">Dark Mode</span></>
              }
            </button>
            <button
              onClick={() => setOpenNotif(true)}
              className={`relative flex size-10 items-center justify-center rounded-full border transition ${
                isDark
                  ? "glass text-white/70 hover:text-white hover:border-white/20"
                  : "border-slate-200 bg-white/90 text-slate-700 hover:text-slate-950 hover:border-slate-300 shadow-2xs"
              }`}
              aria-label="Campus Notifications"
            >
              <Bell className="size-4" />
              {unreadNotifCount > 0 && (
                <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-rose-500 pulse-glow" />
              )}
            </button>
            <span
              className="size-10 rounded-full flex items-center justify-center text-xs font-semibold ml-1 overflow-hidden border border-white/20 shrink-0 shadow-md"
              style={{ background: "var(--grad-aurora)" }}
            >
              {currentAvatarUrl ? (
                <img src={currentAvatarUrl} alt="Professor Avatar" className="size-full object-cover" />
              ) : (
                avatar
              )}
            </span>
          </div>
        </header>
        <main className="px-5 md:px-10 py-6 pb-32 max-w-[1500px] mx-auto">{children}</main>
      </div>

      <NotificationCenter
        open={openNotif}
        onClose={() => setOpenNotif(false)}
        onUnreadCountChange={(count) => setUnreadCountOverride(count)}
        externalNotifications={professorNotifications}
      />
    </div>
  );
}
