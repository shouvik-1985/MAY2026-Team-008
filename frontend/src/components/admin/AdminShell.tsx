import { Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
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

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  pill: string;
};

const NAV: NavItem[] = [
  { href: "#dashboard", label: "Dashboard", icon: LayoutDashboard, pill: "bg-violet-500/30 text-violet-300" },
  { href: "#students", label: "Students", icon: Users, pill: "bg-cyan-500/30 text-cyan-300" },
  { href: "#professors", label: "Professors", icon: University, pill: "bg-purple-500/30 text-purple-300" },
  { href: "#announcements", label: "Announcements", icon: Megaphone, pill: "bg-orange-500/30 text-orange-300" },
  { href: "#management", label: "Management", icon: Gauge, pill: "bg-blue-500/30 text-blue-300" },
  { href: "#complaints", label: "Complaints", icon: AlertCircle, pill: "bg-rose-500/30 text-rose-300" },
  { href: "#fees", label: "Fee Payment", icon: Wallet, pill: "bg-lime-500/30 text-lime-300" },
  { href: "#certificates", label: "Certificates", icon: Award, pill: "bg-amber-500/30 text-amber-300" },
];

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
    <div className={`relative min-h-screen overflow-x-hidden ${isDark ? "text-white bg-[#050505]" : "text-slate-900 bg-slate-50"}`}>
      {/* Sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 80 : 268 }}
        transition={{ type: "spring", stiffness: 220, damping: 28 }}
        className="fixed inset-y-0 left-0 z-40 hidden md:flex flex-col p-3"
      >
        <div
          className="relative h-full rounded-3xl flex flex-col overflow-hidden shadow-2xl shadow-black/30"
          style={{ background: "linear-gradient(160deg, #13112b 0%, #1a1744 30%, #111d3e 65%, #0a1628 100%)" }}
        >
          {/* Radial Top Glow */}
          <div
            className="pointer-events-none absolute top-0 left-0 w-full h-52 rounded-t-3xl"
            style={{ background: "radial-gradient(ellipse at 50% -10%, rgba(139,92,246,0.45), transparent 65%)" }}
          />

          {/* Logo / Header */}
          <div className="relative flex items-center justify-between px-4 py-4 shrink-0 border-b border-white/[0.07]">
            <Link to="/admin" className="flex min-w-0 items-center gap-2.5">
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-xl shadow-lg shadow-violet-500/40"
                style={{ background: "var(--grad-aurora)" }}
              >
                <Sparkles className="size-4 text-white" />
              </span>
              {!collapsed && (
                <span className="font-display text-sm tracking-[0.22em] uppercase truncate font-black text-white/90">
                  CampusVerse
                </span>
              )}
            </Link>
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Theme Toggle — always visible */}
              <button
                onClick={toggleTheme}
                title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
                className="flex size-7 items-center justify-center rounded-lg transition-all hover:scale-110"
                style={{
                  background: isDark
                    ? "rgba(251,191,36,0.18)"
                    : "rgba(99,102,241,0.22)",
                }}
              >
                {isDark
                  ? <Sun className="size-3.5 text-amber-300" />
                  : <Moon className="size-3.5 text-indigo-300" />
                }
              </button>
              {/* Collapse toggle */}
              <button
                onClick={() => setCollapsed((value) => !value)}
                className="p-1.5 rounded-lg text-white/30 hover:text-white/80 hover:bg-white/10 transition"
              >
                <motion.span animate={{ rotate: collapsed ? 180 : 0 }}>
                  <ChevronLeft className="size-4" />
                </motion.span>
              </button>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="relative flex-1 min-h-0 overflow-y-auto px-2.5 py-3 space-y-0.5
            [ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                  className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "text-white bg-white/[0.10] shadow-sm"
                      : "text-white/45 hover:text-white/80 hover:bg-white/[0.06]"
                  }`}
                >
                  {/* Active Left Indicator Bar */}
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-full bg-gradient-to-b from-violet-400 to-blue-400 shadow-[0_0_8px_rgba(139,92,246,0.8)]" />
                  )}

                  {/* Icon Pill */}
                  <div className={`size-7 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                    isActive
                      ? "bg-white/20 text-white scale-110"
                      : `${item.pill} group-hover:scale-105`
                  }`}>
                    <Icon className="size-3.5" />
                  </div>

                  {!collapsed && (
                    <span className={`truncate tracking-wide ${isActive ? "font-semibold" : ""}`}>
                      {item.label}
                    </span>
                  )}
                </a>
              );
            })}
          </nav>

          {/* ── Fixed Bottom: Theme Toggle + Logout ── */}
          <div className="relative shrink-0 px-2.5 pb-3 pt-2 border-t border-white/[0.07] space-y-1">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/60 hover:text-white hover:bg-white/[0.08] transition-all"
            >
              <div className={`size-7 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-110 ${
                isDark ? "bg-amber-500/20 text-amber-300" : "bg-indigo-400/20 text-indigo-300"
              }`}>
                {isDark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
              </div>
              {!collapsed && (
                <span className="truncate font-medium">
                  {isDark ? "Light Mode" : "Dark Mode"}
                </span>
              )}
            </button>

            {/* Logout */}
            <button
              onClick={logout}
              disabled={loggingOut}
              className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-rose-400/80 hover:text-rose-300 hover:bg-rose-500/[0.08] transition-all disabled:cursor-wait disabled:opacity-50"
            >
              <div className="size-7 rounded-lg flex items-center justify-center shrink-0 bg-rose-500/20 text-rose-400 group-hover:scale-105 transition-transform">
                <LogOut className="size-3.5" />
              </div>
              {!collapsed && (
                <span className="truncate">
                  {loggingOut ? "Logging out…" : "Logout"}
                </span>
              )}
            </button>
          </div>
        </div>
      </motion.aside>

      <div className={`min-h-screen transition-[padding] duration-300 ${collapsed ? "md:pl-[100px]" : "md:pl-[292px]"}`}>
        <header className={`sticky top-0 z-30 px-5 pb-3 pt-4 backdrop-blur-xl md:px-10 transition-colors ${
          isDark ? "bg-[#0c0e17]/85 border-b border-white/10" : "bg-white/85 border-b border-slate-200/80 shadow-2xs text-slate-900"
        }`}>
          <div className="flex items-center gap-3">
            <div className="hidden min-w-0 md:block">
              <div className={`text-xs uppercase tracking-[0.3em] font-semibold ${isDark ? "text-white/40" : "text-slate-500"}`}>Admin command</div>
              <div className={`truncate font-display text-lg font-bold ${isDark ? "text-white" : "text-slate-950"}`}>{displayName}</div>
            </div>
            <button className={`flex max-w-xl flex-1 items-center gap-3 rounded-full px-4 py-2.5 text-sm transition border ${
              isDark
                ? "glass text-white/50 hover:border-white/20 hover:text-white"
                : "border-slate-200 bg-white/90 text-slate-700 hover:border-slate-300 hover:text-slate-950 shadow-2xs font-medium"
            }`}>
              <Search className="size-4" />
              <span className="flex-1 text-left">Search student, professor, account details...</span>
            </button>
            <div className={`hidden items-center gap-2 px-3 text-xs lg:flex font-semibold ${isDark ? "text-white/45" : "text-slate-600"}`}>
              <span className="size-1.5 rounded-full bg-emerald-400 pulse-glow" />
              {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.12em] border transition-all shadow-xs ${
                isDark
                  ? "bg-white/10 border-white/20 text-white hover:bg-white/15"
                  : "bg-indigo-50 border-indigo-200 text-indigo-950 hover:bg-indigo-100 hover:border-indigo-300"
              }`}
            >
              {isDark
                ? <><Sun className="size-3.5 text-amber-300 fill-amber-300/20" /><span className="text-white">Light Mode</span></>
                : <><Moon className="size-3.5 text-indigo-600 fill-indigo-600/20" /><span className="text-indigo-950 font-bold">Dark Mode</span></>
              }
            </button>
            <button className={`relative flex size-10 items-center justify-center rounded-full border transition ${
              isDark
                ? "glass text-white/70 hover:border-white/20 hover:text-white"
                : "border-slate-200 bg-white/90 text-slate-700 hover:text-slate-950 hover:border-slate-300 shadow-2xs"
            }`}>
              <Bell className="size-4" />
              <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[oklch(0.72_0.27_350)]" />
            </button>
            <span
              className="ml-1 flex size-10 items-center justify-center rounded-full text-xs font-semibold text-white shadow-md"
              style={{ background: "var(--grad-aurora)" }}
            >
              {avatar}
            </span>
          </div>
          <div className={`mt-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] font-bold ${isDark ? "text-white/40" : "text-slate-500"}`}>
            <Shield className="size-3.5" />
            Full-campus administration
          </div>
        </header>
<main className="mx-auto w-full max-w-[1520px] px-5 py-6 pb-32 md:px-10">{children}</main>
      </div>
    </div>
  );
}
