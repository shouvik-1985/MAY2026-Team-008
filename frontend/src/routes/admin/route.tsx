import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  AlertCircle,
  Award,
  Building2,
  CreditCard,
  Gauge,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  MapPin,
  Megaphone,
  Moon,
  ShoppingBag,
  Shield,
  Sparkles,
  Sun,
} from "lucide-react";
import { type ComponentType, type ReactNode, useEffect, useRef, useState } from "react";
import { CinematicBackdrop } from "@/components/app/cinematic";
import { logoutAccount } from "@/lib/api";
import { clearAuthSession, getStoredUser, hasAuthSession } from "@/lib/auth";
import { resolveRoleHome } from "@/lib/role-home";
import { clearStoredDashboard } from "@/lib/student-session";
import { clearStoredRole } from "@/lib/use-role";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/admin")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && !hasAuthSession()) {
      throw redirect({ to: "/login" });
    }
    const user = typeof window !== "undefined" ? getStoredUser() : null;
    if (user && user.role !== "admin") {
      throw redirect({ to: resolveRoleHome(user.role) });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <>
      <CinematicBackdrop intensity={0.65} />
      <AdminShell>
        <Outlet />
      </AdminShell>
    </>
  );
}

const ADMIN_NAV: { href: string; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { href: "#dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "#student", label: "Students", icon: GraduationCap },
  { href: "#professor", label: "Professors", icon: Building2 },
  { href: "#announcements", label: "Announcements", icon: Megaphone },
  { href: "#management", label: "Management", icon: Gauge },
  { href: "#complaints", label: "Complaints", icon: AlertCircle },
  { href: "#fees", label: "Fee Management", icon: CreditCard },
  { href: "#certificate", label: "Certificate", icon: Award },
  { href: "#marketplace", label: "Marketplace", icon: ShoppingBag },
];

function normalizeAdminHash(hash: string) {
  const raw = hash.replace("#", "") || "dashboard";
  const aliases: Record<string, string> = {
    overview: "dashboard",
    students: "student",
    professors: "professor",
    announcements: "announcements",
    announcement: "announcements",
    notices: "announcements",
    complaint: "complaints",
    fees: "fees",
    "fee-management": "fees",
    certificates: "certificate",
    marketplace: "marketplace",
  };
  return aliases[raw] ?? raw;
}

function resetAdminScroll() {
  const scrollElement = document.scrollingElement;
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  scrollElement?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

function AdminShell({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const [loggingOut, setLoggingOut] = useState(false);
  const [activeHash, setActiveHash] = useState(() =>
    typeof window === "undefined" ? "dashboard" : normalizeAdminHash(window.location.hash),
  );
  const previousHash = useRef<string | null>(null);
  const navigate = useNavigate();
  const user = getStoredUser();

  useEffect(() => {
    function syncHash() {
      setActiveHash(normalizeAdminHash(window.location.hash));
    }

    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  useEffect(() => {
    if (previousHash.current && previousHash.current !== activeHash) {
      // The section content changes after the link handler runs. A second
      // reset in the next frame prevents browser/hash restoration from leaving
      // the newly selected panel halfway down the document.
      requestAnimationFrame(resetAdminScroll);
    }
    previousHash.current = activeHash;
  }, [activeHash]);

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
    <div className={`relative min-h-screen w-full overflow-x-hidden overflow-y-visible box-border cv-admin-content ${isDark ? "text-white" : "text-slate-900"} bg-[var(--page-bg)]`}>
      <aside className={`fixed inset-y-0 left-0 z-40 hidden w-[276px] flex-col p-3 md:flex ${isDark ? "" : "shadow-sm"}`}>
        <div className={`relative flex h-full flex-col overflow-hidden rounded-3xl ${
          isDark
            ? "glass-strong"
            : "border border-[#dcebd7] bg-[linear-gradient(180deg,#ffffff_0%,#fbfef9_62%,#f1f8ed_100%)] shadow-[0_18px_45px_rgba(56,100,55,0.13)]"
        }`}>
          <div className={`flex items-center gap-3 border-b px-5 py-5 ${isDark ? "border-white/10" : "border-[#e2eee0] text-slate-900"}`}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl shadow-[0_8px_16px_rgba(76,175,80,0.22)]" style={{ background: "var(--grad-aurora)" }}>
              <Sparkles className={`size-4 ${isDark ? "text-white" : "text-[#123725]"}`} />
            </span>
            <span className="font-display text-sm font-semibold uppercase tracking-[0.24em]">CampusVerse</span>
          </div>

          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4 [ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {ADMIN_NAV.map((item) => {
              const Icon = item.icon;
              const targetHash = item.href.replace("#", "");
              const isActive = activeHash === targetHash;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={(event) => {
                    event.preventDefault();
                    setActiveHash(targetHash);
                    window.history.replaceState(null, "", item.href);
                    window.dispatchEvent(new HashChangeEvent("hashchange"));
                    resetAdminScroll();
                    requestAnimationFrame(resetAdminScroll);
                  }}
                  className={`group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? isDark
                        ? "text-white shadow-sm"
                        : "text-[#183c2a] shadow-[0_7px_16px_rgba(73,127,72,0.09)]"
                      : isDark
                        ? "text-white/65 hover:text-white"
                        : "text-slate-600 hover:text-[#1d5133] hover:bg-[#edf6e9]"
                  }`}
                >
                  {isActive && (
                    <span
                      className="absolute inset-0 rounded-2xl"
                      style={{
                        background:
                          isDark
                            ? "linear-gradient(135deg, rgba(76, 175, 80, 0.24), rgba(216, 239, 188, 0.1))"
                            : "linear-gradient(100deg, rgba(205,235,195,0.96), rgba(241,249,237,0.96) 56%, rgba(223,239,232,0.9))",
                        border: isDark ? "1px solid rgba(216, 239, 188, 0.38)" : "1px solid rgba(151,190,140,0.52)",
                      }}
                    />
                  )}
                  <span className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-xl transition-colors ${
                    isActive
                      ? isDark ? "bg-white/10 text-[#d8efbc]" : "bg-white/75 text-[#2f8f46]"
                      : isDark ? "text-white/60 group-hover:bg-white/[0.07]" : "bg-[#f4f8f2] text-[#557065] group-hover:bg-white group-hover:text-[#2f8f46]"
                  }`}>
                    <Icon className="size-4" />
                  </span>
                  <span className="relative z-10 truncate">{item.label}</span>
                </a>
              );
            })}
          </nav>

          <div className={`mt-auto px-3 py-4 ${isDark ? "border-t border-white/10" : "border-t border-[#e2eee0] bg-white/45"}`}>
            <button
              onClick={logout}
              disabled={loggingOut}
              className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-sm font-medium transition-all duration-200 ${
                isDark
                  ? "border-rose-300/20 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
                  : "border-rose-200 bg-[linear-gradient(135deg,#fff5f5,#fff0f2)] text-rose-600 shadow-[0_6px_14px_rgba(225,91,110,0.08)] hover:bg-rose-100"
              } disabled:cursor-wait disabled:opacity-60`}
            >
              <LogOut className="size-4" />
              {loggingOut ? "Logging out" : "Logout"}
            </button>
          </div>
        </div>
      </aside>

      <main className="min-h-screen overflow-x-hidden overflow-y-visible box-border min-w-0 px-4 py-6 md:pl-[296px] md:pr-6">
        <header className={`sticky top-0 z-30 mb-8 rounded-[24px] border px-5 py-3 backdrop-blur-xl md:px-10 ${
          isDark
            ? "border-[#89b77b]/30 bg-[linear-gradient(110deg,rgba(22,50,36,0.96),rgba(31,72,49,0.96)_52%,rgba(25,58,42,0.96))] shadow-[0_14px_34px_rgba(3,12,8,0.28)]"
            : "border-slate-200/80 bg-white/95 shadow-sm"
        }`}>
          <div className="flex items-center gap-3">
            <div className={`flex size-11 items-center justify-center rounded-2xl ${isDark ? "border border-[#a9d795]/35 bg-[#d8efbc]/10" : "border border-slate-200 bg-slate-100"}`}>
              <Shield className={`size-5 ${isDark ? "text-[#d8efbc]" : "text-[#2f8f46]"}`} />
            </div>
            <div>
              <div className={`${isDark ? "text-white/40" : "text-slate-500"} text-xs uppercase tracking-[0.3em]`}>Admin desk</div>
              <div className={`${isDark ? "text-white" : "text-slate-900"} font-display text-lg`}>{user?.full_name ?? "Admin"}</div>
            </div>
            <motion.div
              className={`ml-auto hidden items-center gap-2 rounded-full px-4 py-2 text-xs md:flex ${isDark ? "border border-[#b9dcae]/20 bg-[#102a1d]/55 text-[#d9e8d4]" : "border border-slate-200 bg-slate-100 text-slate-500"}`}
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <MapPin className="size-3.5 text-[#d8efbc]" />
              Attendance radius control
            </motion.div>
            <button
              onClick={toggleTheme}
              className={`ml-3 hidden items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] transition-all md:inline-flex ${
                isDark
                  ? "border border-[#b9dcae]/35 bg-[#d8efbc]/15 text-[#f5fff0] hover:bg-[#d8efbc]/25"
                  : "border border-[#a5d6a7] bg-[#ecf8e6] text-[#1f7a32] hover:bg-[#d8efbc]"
              }`}
            >
              {isDark ? <Sun className="size-4 text-amber-300" /> : <Moon className="size-4 text-[#2f8f46]" />}
              {isDark ? "Light Mode" : "Dark Mode"}
            </button>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
