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
  Shield,
  Sparkles,
} from "lucide-react";
import { type ComponentType, type ReactNode, useEffect, useState } from "react";
import { CinematicBackdrop } from "@/components/app/cinematic";
import { logoutAccount } from "@/lib/api";
import { clearAuthSession, getStoredUser, hasAuthSession } from "@/lib/auth";
import { resolveRoleHome } from "@/lib/role-home";
import { clearStoredDashboard } from "@/lib/student-session";
import { clearStoredRole } from "@/lib/use-role";

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
  { href: "#management", label: "Management", icon: Gauge },
  { href: "#complaints", label: "Complaints", icon: AlertCircle },
  { href: "#fees", label: "Fee Management", icon: CreditCard },
  { href: "#certificate", label: "Certificate", icon: Award },
];

function normalizeAdminHash(hash: string) {
  const raw = hash.replace("#", "") || "dashboard";
  const aliases: Record<string, string> = {
    overview: "dashboard",
    students: "student",
    professors: "professor",
    complaint: "complaints",
    fees: "fees",
    "fee-management": "fees",
    certificates: "certificate",
  };
  return aliases[raw] ?? raw;
}

function AdminShell({ children }: { children: ReactNode }) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [activeHash, setActiveHash] = useState(() =>
    typeof window === "undefined" ? "dashboard" : normalizeAdminHash(window.location.hash),
  );
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
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[276px] flex-col p-3 md:flex">
        <div className="glass-strong relative flex h-full flex-col overflow-hidden rounded-3xl">
          <div className="flex items-center gap-2.5 px-4 py-5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--grad-aurora)" }}>
              <Sparkles className="size-3.5 text-white" />
            </span>
            <span className="font-display text-sm uppercase tracking-[0.25em]">CampusVerse</span>
          </div>

          <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
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
                          "linear-gradient(135deg, oklch(0.65 0.28 305 / 0.25), oklch(0.82 0.18 200 / 0.1))",
                        border: "1px solid oklch(0.7 0.25 310 / 0.4)",
                      }}
                    />
                  )}
                  <Icon className="relative z-10 size-4 shrink-0" />
                  <span className="relative z-10 truncate">{item.label}</span>
                </a>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-white/10 px-2 py-2">
            <button
              onClick={logout}
              disabled={loggingOut}
              className="flex w-full items-center gap-3 rounded-2xl border border-rose-300/20 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-wait disabled:opacity-60"
            >
              <LogOut className="size-4" />
              {loggingOut ? "Logging out" : "Logout"}
            </button>
          </div>
        </div>
      </aside>

      <main className="min-h-screen px-5 py-6 md:pl-[316px] md:pr-10">
        <header className="sticky top-0 z-30 -mx-5 mb-8 bg-[#050505]/65 px-5 py-3 backdrop-blur-xl md:-mx-10 md:px-10">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
              <Shield className="size-5 text-cyan-200" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-white/40">Admin desk</div>
              <div className="font-display text-lg">{user?.full_name ?? "Admin"}</div>
            </div>
            <motion.div
              className="ml-auto hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-white/50 md:flex"
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <MapPin className="size-3.5 text-cyan-200" />
              Attendance radius control
            </motion.div>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
