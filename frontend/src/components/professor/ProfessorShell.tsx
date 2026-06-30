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
import { logoutAccount } from "@/lib/api";
import { clearAuthSession, getStoredUser } from "@/lib/auth";
import { clearStoredDashboard } from "@/lib/student-session";
import { clearStoredRole } from "@/lib/use-role";

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

export function ProfessorShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [dark, setDark] = useState(true);
  const [time, setTime] = useState(() => new Date());
  const [activeHash, setActiveHash] = useState(() =>
    typeof window === "undefined" ? "dashboard" : window.location.hash.replace("#", "") || "dashboard",
  );
  const user = getStoredUser();
  const navigate = useNavigate();
  const displayName = user?.full_name ?? "Professor";
  const avatar =
    displayName
      .split(" ")
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "PR";

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

  return (
    <div className="relative min-h-screen text-white">
      <motion.aside
        animate={{ width: collapsed ? 84 : 276 }}
        transition={{ type: "spring", stiffness: 220, damping: 28 }}
        className="fixed inset-y-0 left-0 z-40 hidden md:flex flex-col p-3"
      >
        <div className="relative h-full glass-strong rounded-3xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-5">
            <Link to="/professor" className="flex items-center gap-2.5 min-w-0">
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
              onClick={() => setCollapsed((value) => !value)}
              className="text-white/40 hover:text-white"
              aria-label="Collapse sidebar"
            >
              <motion.span animate={{ rotate: collapsed ? 180 : 0 }}>
                <ChevronLeft className="size-4" />
              </motion.span>
            </button>
          </div>

          <nav className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-0.5">
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
                  className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm transition ${
                    isActive ? "text-white" : "text-white/55 hover:text-white"
                  }`}
                >
                  {isActive && (
                    <span
                      className="absolute inset-0 rounded-2xl"
                      style={{
                        background:
                          "linear-gradient(135deg, oklch(0.65 0.28 305 / 0.25), oklch(0.82 0.18 200 / 0.1))",
                        border: "1px solid oklch(0.7 0.25 310 / 0.4)",
                      }}
                    />
                  )}
                  <Icon className="relative z-10 size-4 shrink-0" />
                  {!collapsed && <span className="relative z-10 truncate">{item.label}</span>}
                </a>
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

      <div
        className={`min-h-screen transition-[padding] duration-300 ${collapsed ? "md:pl-[100px]" : "md:pl-[292px]"}`}
      >
        <header className="sticky top-0 z-30 px-5 md:px-10 pt-4 pb-3 backdrop-blur-xl bg-[#050505]/60">
          <div className="flex items-center gap-3">
            <div className="hidden md:block min-w-0">
              <div className="text-xs uppercase tracking-[0.3em] text-white/40">Professor desk</div>
              <div className="font-display text-lg truncate">{displayName}</div>
            </div>
            <button className="flex-1 max-w-xl flex items-center gap-3 glass rounded-full px-4 py-2.5 text-sm text-white/50 hover:text-white hover:border-white/20 transition">
              <Search className="size-4" />
              <span className="flex-1 text-left">Search students, submissions, resources...</span>
              <kbd className="hidden md:inline text-[10px] px-1.5 py-0.5 rounded bg-white/10">Ctrl K</kbd>
            </button>
            <div className="hidden lg:flex items-center gap-2 text-xs text-white/45 px-3">
              <span className="size-1.5 rounded-full bg-emerald-400 pulse-glow" />
              {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
            <button
              onClick={() => setDark((value) => !value)}
              className="relative size-10 rounded-full glass flex items-center justify-center text-white/70 hover:text-white hover:border-white/20 transition"
              aria-label="Theme"
            >
              {dark ? <Moon className="size-4" /> : <Sun className="size-4" />}
            </button>
            <button className="relative size-10 rounded-full glass flex items-center justify-center text-white/70 hover:text-white hover:border-white/20 transition">
              <Bell className="size-4" />
              <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-[oklch(0.72_0.27_350)]" />
            </button>
            <span
              className="size-10 rounded-full flex items-center justify-center text-xs font-semibold ml-1"
              style={{ background: "var(--grad-aurora)" }}
            >
              {avatar}
            </span>
          </div>
        </header>
        <main className="px-5 md:px-10 py-6 pb-32 max-w-[1500px] mx-auto">{children}</main>
      </div>
    </div>
  );
}
