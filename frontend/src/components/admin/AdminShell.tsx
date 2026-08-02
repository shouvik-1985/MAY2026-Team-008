import { Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import {
  Bell,
  ChevronLeft,
  LayoutDashboard,
  LogOut,
  Moon,
  Search,
  Shield,
  Gauge,
  Sparkles,
  Sun,
  University,
  Users,
  Megaphone,
  AlertCircle,
  Wallet,
  Award,
} from "lucide-react";
import { logoutAccount } from "@/lib/api";
import { clearAuthSession, getStoredUser } from "@/lib/auth";
import { clearStoredDashboard } from "@/lib/student-session";
import { clearStoredRole } from "@/lib/use-role";
import { useTheme } from "@/lib/theme";

const NAV = [
  { href: "#dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "#students", label: "Students", icon: Users },
  { href: "#professors", label: "Professors", icon: University },
  { href: "#announcements", label: "Announcements", icon: Megaphone },
  { href: "#management", label: "Management", icon: Gauge },
  { href: "#complaints", label: "Complaints", icon: AlertCircle },
  { href: "#fees", label: "Fee Payment", icon: Wallet },
  { href: "#certificates", label: "Certificates", icon: Award },
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [time, setTime] = useState(() => new Date());
  const [activeHash, setActiveHash] = useState(() =>
    typeof window === "undefined" ? "dashboard" : window.location.hash.replace("#", "") || "dashboard",
  );
  const user = getStoredUser();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const isDark = theme === "dark";
  const displayName = user?.full_name ?? "Admin";
  const avatar =
    displayName
      .split(" ")
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "AD";

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
      // The local browser session still needs to close.
    } finally {
      clearAuthSession();
      clearStoredDashboard();
      clearStoredRole();
      navigate({ to: "/login", replace: true });
    }
  }

  return (
    <div className={`relative min-h-screen ${isDark ? "text-white" : "text-slate-900 bg-slate-50"}`}>
      <motion.aside
        animate={{ width: collapsed ? 84 : 276 }}
        transition={{ type: "spring", stiffness: 220, damping: 28 }}
        className="fixed inset-y-0 left-0 z-40 hidden md:flex flex-col p-3"
      >
        <div
          className={`relative flex h-full flex-col overflow-hidden rounded-3xl transition-all duration-300 ${
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
            <Link to="/admin" className="flex min-w-0 items-center gap-2.5">
              <span
                className="flex size-7.5 shrink-0 items-center justify-center rounded-xl shadow-md shadow-indigo-500/20"
                style={{ background: "var(--grad-aurora)" }}
              >
                <Sparkles className="size-4 text-white" />
              </span>
              {!collapsed && <span className={`truncate font-display text-sm uppercase tracking-[0.25em] font-black ${isDark ? "text-white" : "text-slate-950"}`}>CampusVerse</span>}
            </Link>
            <button onClick={() => setCollapsed((value) => !value)} className={isDark ? "text-slate-400 hover:text-white p-1 rounded-lg transition" : "text-slate-400 hover:text-slate-900 hover:bg-[#EEF2FF] p-1 rounded-lg transition"}>
              <motion.span animate={{ rotate: collapsed ? 180 : 0 }}>
                <ChevronLeft className="size-4" />
              </motion.span>
            </button>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-2.5 py-3">
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
                  className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200 ${
                    isActive
                      ? isDark
                        ? "text-white font-bold bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 shadow-lg shadow-indigo-600/30 border border-indigo-400/40"
                        : "text-[#3730A3] font-extrabold shadow-2xs"
                      : isDark
                        ? "text-slate-300/80 font-medium hover:text-white hover:bg-white/10"
                        : "text-slate-700 font-semibold hover:text-[#3730A3]"
                  }`}
                  style={
                    !isDark
                      ? {
                          backgroundColor: isActive ? "#EEF2FF" : undefined,
                          borderLeft: isActive ? "4px solid #6D5DF6" : "4px solid transparent",
                        }
                      : undefined
                  }
                  onMouseEnter={(e) => {
                    if (!isDark && !isActive) {
                      e.currentTarget.style.backgroundColor = "#EEF2FF";
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
                      ? isDark ? "text-white" : "text-[#6D5DF6]"
                      : isDark ? "text-slate-400 group-hover:text-white" : "text-slate-500 group-hover:text-[#6D5DF6]"
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
                {!collapsed && <span className="relative z-10 truncate">{loggingOut ? "Logging out" : "Logout"}</span>}
              </button>
            </div>
          </nav>
        </div>
      </motion.aside>

      <div className={`min-h-screen transition-[padding] duration-300 ${collapsed ? "md:pl-[100px]" : "md:pl-[292px]"}`}>
        <header className="sticky top-0 z-30 bg-[color:var(--glass-nav-bg)] px-5 pb-3 pt-4 backdrop-blur-xl md:px-10">
          <div className="flex items-center gap-3">
            <div className="hidden min-w-0 md:block">
              <div className={`text-xs uppercase tracking-[0.3em] ${isDark ? "text-white/40" : "text-slate-500"}`}>Admin command</div>
              <div className="truncate font-display text-lg">{displayName}</div>
            </div>
            <button className={`flex max-w-xl flex-1 items-center gap-3 rounded-full glass px-4 py-2.5 text-sm transition ${
              isDark
                ? "text-white/50 hover:border-white/20 hover:text-white"
                : "text-slate-500 hover:border-slate-300/60 hover:text-slate-900"
            }`}>
              <Search className="size-4" />
              <span className="flex-1 text-left">Search student, professor, account details...</span>
            </button>
            <div className={`hidden items-center gap-2 px-3 text-xs lg:flex ${isDark ? "text-white/45" : "text-slate-500"}`}>
              <span className="size-1.5 rounded-full bg-emerald-400 pulse-glow" />
              {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
            <button
              onClick={toggleTheme}
              className={`relative flex size-10 items-center justify-center rounded-full glass transition ${
                isDark
                  ? "text-white/70 hover:border-white/20 hover:text-white"
                  : "text-slate-500 hover:border-slate-300/60 hover:text-slate-900"
              }`}
              aria-label="Theme"
            >
              {isDark ? <Moon className="size-4" /> : <Sun className="size-4" />}
            </button>
            <button className={`relative flex size-10 items-center justify-center rounded-full glass transition ${
              isDark
                ? "text-white/70 hover:border-white/20 hover:text-white"
                : "text-slate-500 hover:border-slate-300/60 hover:text-slate-900"
            }`}>
              <Bell className="size-4" />
              <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[oklch(0.72_0.27_350)]" />
            </button>
            <span
              className="ml-1 flex size-10 items-center justify-center rounded-full text-xs font-semibold"
              style={{ background: "var(--grad-aurora)" }}
            >
              {avatar}
            </span>
          </div>
          <div className={`mt-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] ${isDark ? "text-white/40" : "text-slate-500"}`}>
            <Shield className="size-3.5" />
            Full-campus administration
          </div>
        </header>
        <main className="mx-auto max-w-[1520px] px-5 py-6 pb-32 md:px-10">{children}</main>
      </div>
    </div>
  );
}
