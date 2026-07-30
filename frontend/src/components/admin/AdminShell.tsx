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
  const [dark, setDark] = useState(true);
  const [time, setTime] = useState(() => new Date());
  const [activeHash, setActiveHash] = useState(() =>
    typeof window === "undefined" ? "dashboard" : window.location.hash.replace("#", "") || "dashboard",
  );
  const user = getStoredUser();
  const navigate = useNavigate();
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
    <div className="relative min-h-screen text-white">
      <motion.aside
        animate={{ width: collapsed ? 84 : 276 }}
        transition={{ type: "spring", stiffness: 220, damping: 28 }}
        className="fixed inset-y-0 left-0 z-40 hidden md:flex flex-col p-3"
      >
        <div className="relative flex h-full flex-col overflow-hidden rounded-3xl glass-strong">
          <div className="flex items-center justify-between px-4 py-5">
            <Link to="/admin" className="flex min-w-0 items-center gap-2.5">
              <span
                className="flex size-7 shrink-0 items-center justify-center rounded-xl"
                style={{ background: "var(--grad-aurora)" }}
              >
                <Sparkles className="size-3.5 text-white" />
              </span>
              {!collapsed && <span className="truncate font-display text-sm uppercase tracking-[0.25em]">CampusVerse</span>}
            </Link>
            <button onClick={() => setCollapsed((value) => !value)} className="text-white/40 hover:text-white">
              <motion.span animate={{ rotate: collapsed ? 180 : 0 }}>
                <ChevronLeft className="size-4" />
              </motion.span>
            </button>
          </div>

          <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
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
                  className={`group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition ${
                    isActive ? "text-white" : "text-white/55 hover:text-white"
                  }`}
                >
                  {isActive && (
                    <span
                      className="absolute inset-0 rounded-2xl"
                      style={{
                        background:
                          "linear-gradient(135deg, oklch(0.72 0.27 350 / 0.25), oklch(0.82 0.18 200 / 0.1))",
                        border: "1px solid oklch(0.72 0.27 350 / 0.35)",
                      }}
                    />
                  )}
                  <Icon className="relative z-10 size-4 shrink-0" />
                  {!collapsed && <span className="relative z-10 truncate">{item.label}</span>}
                </a>
              );
            })}

            <div className="mt-2 border-t border-white/10 pt-2">
              <button
                onClick={logout}
                disabled={loggingOut}
                className="group relative flex w-full items-center gap-3 rounded-2xl border border-rose-300/20 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-100 transition hover:border-rose-200/40 hover:bg-rose-500/20 disabled:cursor-wait disabled:opacity-60"
              >
                <LogOut className="relative z-10 size-4 shrink-0" />
                {!collapsed && <span className="relative z-10 truncate">{loggingOut ? "Logging out" : "Logout"}</span>}
              </button>
            </div>
          </nav>
        </div>
      </motion.aside>

      <div className={`min-h-screen transition-[padding] duration-300 ${collapsed ? "md:pl-[100px]" : "md:pl-[292px]"}`}>
        <header className="sticky top-0 z-30 bg-[#050505]/60 px-5 pb-3 pt-4 backdrop-blur-xl md:px-10">
          <div className="flex items-center gap-3">
            <div className="hidden min-w-0 md:block">
              <div className="text-xs uppercase tracking-[0.3em] text-white/40">Admin command</div>
              <div className="truncate font-display text-lg">{displayName}</div>
            </div>
            <button className="flex max-w-xl flex-1 items-center gap-3 rounded-full glass px-4 py-2.5 text-sm text-white/50 transition hover:border-white/20 hover:text-white">
              <Search className="size-4" />
              <span className="flex-1 text-left">Search student, professor, account details...</span>
            </button>
            <div className="hidden items-center gap-2 px-3 text-xs text-white/45 lg:flex">
              <span className="size-1.5 rounded-full bg-emerald-400 pulse-glow" />
              {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
            <button
              onClick={() => setDark((value) => !value)}
              className="relative flex size-10 items-center justify-center rounded-full glass text-white/70 transition hover:border-white/20 hover:text-white"
              aria-label="Theme"
            >
              {dark ? <Moon className="size-4" /> : <Sun className="size-4" />}
            </button>
            <button className="relative flex size-10 items-center justify-center rounded-full glass text-white/70 transition hover:border-white/20 hover:text-white">
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
          <div className="mt-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-white/40">
            <Shield className="size-3.5" />
            Full-campus administration
          </div>
        </header>
        <main className="mx-auto max-w-[1520px] px-5 py-6 pb-32 md:px-10">{children}</main>
      </div>
    </div>
  );
}
