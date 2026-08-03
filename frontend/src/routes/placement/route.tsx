import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { BriefcaseBusiness, LayoutDashboard, LogOut, Mail, Sparkles, UserCheck } from "lucide-react";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { CinematicBackdrop } from "@/components/app/cinematic";
import { logoutAccount } from "@/lib/api";
import { clearAuthSession, getStoredUser, hasAuthSession } from "@/lib/auth";
import { resolveRoleHome } from "@/lib/role-home";
import { clearStoredDashboard } from "@/lib/student-session";
import { clearStoredRole } from "@/lib/use-role";

export const Route = createFileRoute("/placement")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && !hasAuthSession()) {
      throw redirect({ to: "/login" });
    }
    const user = typeof window !== "undefined" ? getStoredUser() : null;
    if (user && user.role !== "placement") {
      throw redirect({ to: resolveRoleHome(user.role) });
    }
  },
  component: PlacementLayout,
});

function PlacementLayout() {
  return (
    <>
      <CinematicBackdrop intensity={0.65} />
      <PlacementShell>
        <Outlet />
      </PlacementShell>
    </>
  );
}

const PLACEMENT_NAV: { href: string; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { href: "#dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "#roles", label: "Roles", icon: BriefcaseBusiness },
  { href: "#applicants", label: "Applicants", icon: UserCheck },
  { href: "#messages", label: "Messages", icon: Mail },
];

import { useTheme } from "@/lib/theme";
import { Moon, Sun } from "lucide-react";

function PlacementShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const user = getStoredUser();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  const [activeHash, setActiveHash] = useState(() =>
    typeof window !== "undefined" ? window.location.hash || "#dashboard" : "#dashboard"
  );

  useEffect(() => {
    const handleHash = () => {
      setActiveHash(window.location.hash || "#dashboard");
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  async function logout() {
    try {
      await logoutAccount();
    } catch {
      // Close the browser session even if the API is restarting.
    } finally {
      clearAuthSession();
      clearStoredDashboard();
      clearStoredRole();
      navigate({ to: "/login", replace: true });
    }
  }

  return (
    <div className={`relative min-h-screen ${isDark ? "text-white" : "text-slate-900"}`}>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[272px] flex-col p-4 md:flex">
        <div className={`relative flex h-full flex-col overflow-hidden rounded-[34px] border transition-all ${
          isDark
            ? "glass-strong border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] text-white"
            : "border-slate-200/90 bg-white/95 shadow-md shadow-slate-200/60 text-slate-900"
        }`}>
          <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />
          <div className="min-w-0 px-5 py-6">
            <div className="flex min-w-0 items-start gap-3 overflow-hidden">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-2xl shadow-md" style={{ background: "var(--grad-aurora)" }}>
                <Sparkles className="size-3.5 text-white" />
              </span>
              <div className="min-w-0 flex-1 overflow-hidden pt-0.5">
                <div className={`truncate font-display text-[0.9rem] uppercase tracking-[0.22em] font-bold ${
                  isDark ? "text-white/95" : "text-slate-900"
                }`}>
                  CampusVerse
                </div>
                <div className={`mt-1 text-[9px] uppercase tracking-[0.24em] font-bold ${
                  isDark ? "text-white/40" : "text-slate-500"
                }`}>
                  Placement Console
                </div>
              </div>
            </div>
          </div>

          <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
            {PLACEMENT_NAV.map((item) => {
              const Icon = item.icon;
              const isActive = activeHash === item.href || (activeHash === "" && item.href === "#dashboard");
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={`group relative flex items-center gap-4 rounded-[22px] border px-4 py-3.5 text-[15px] transition ${
                    isActive
                      ? isDark
                        ? "border-white/20 bg-white/12 text-white font-bold shadow-sm"
                        : "border-indigo-200 bg-indigo-50/90 text-indigo-900 font-extrabold shadow-2xs"
                      : isDark
                        ? "border-transparent text-white/70 hover:border-white/10 hover:bg-white/[0.06] hover:text-white"
                        : "border-transparent text-slate-700 font-bold hover:border-indigo-100 hover:bg-indigo-50/50 hover:text-indigo-900"
                  }`}
                >
                  <span className={`grid size-10 shrink-0 place-items-center rounded-2xl border ${
                    isActive
                      ? isDark
                        ? "border-white/25 bg-white/20 text-white"
                        : "border-indigo-300 bg-indigo-100/80 text-indigo-700"
                      : isDark
                        ? "border-white/10 bg-white/[0.04]"
                        : "border-slate-200 bg-white shadow-2xs text-indigo-600"
                  }`}>
                    <Icon className="relative z-10 size-4 shrink-0" />
                  </span>
                  <span className="relative z-10 truncate">{item.label}</span>
                </a>
              );
            })}
          </nav>

          <div className={`mt-auto border-t px-4 py-4 ${isDark ? "border-white/8" : "border-slate-200"}`}>
            <button
              type="button"
              onClick={logout}
              className={`flex w-full items-center gap-3 rounded-[20px] border px-4 py-3.5 text-[15px] font-bold transition ${
                isDark
                  ? "border-rose-300/18 bg-rose-500/[0.09] text-rose-100 hover:bg-rose-500/[0.16]"
                  : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 shadow-2xs"
              }`}
            >
              <LogOut className="size-4" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      <main className="min-h-screen px-5 py-6 md:pl-[316px] md:pr-10">
        <header className={`sticky top-0 z-30 -mx-5 mb-8 border-b px-5 py-3.5 backdrop-blur-xl transition-all md:-mx-10 md:px-10 ${
          isDark
            ? "border-white/10 bg-[linear-gradient(180deg,rgba(5,5,5,0.92),rgba(5,5,5,0.72))] text-white"
            : "border-slate-200/90 bg-white/90 text-slate-900 shadow-xs"
        }`}>
          <div className="flex items-center gap-3">
            <div className={`flex size-12 items-center justify-center rounded-[20px] border ${
              isDark ? "border-cyan-300/15 bg-cyan-400/[0.06]" : "border-indigo-200 bg-indigo-50 text-indigo-700"
            }`}>
              <BriefcaseBusiness className={`size-5 ${isDark ? "text-cyan-200" : "text-indigo-600"}`} />
            </div>
            <div>
              <div className={`text-[11px] font-bold uppercase tracking-[0.34em] ${
                isDark ? "text-white/40" : "text-slate-500"
              }`}>Placement partner desk</div>
              <div className={`font-display text-[1.7rem] font-bold leading-none ${
                isDark ? "text-white" : "text-slate-900"
              }`}>{user?.full_name ?? "Placement manager"}</div>
            </div>

            <div className="ml-auto flex items-center gap-3">
              <button
                type="button"
                onClick={toggleTheme}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-wider transition ${
                  isDark
                    ? "border-white/15 bg-white/10 text-white hover:bg-white/20"
                    : "border-slate-300 bg-white text-slate-800 shadow-2xs hover:bg-slate-50"
                }`}
              >
                {isDark ? <Sun className="size-3.5 text-amber-300" /> : <Moon className="size-3.5 text-indigo-600" />}
                <span>{isDark ? "Light Mode" : "Dark Mode"}</span>
              </button>

              <div className={`hidden rounded-full border px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.24em] md:block ${
                isDark ? "border-white/10 bg-white/[0.035] text-white/50" : "border-slate-200 bg-slate-100/80 text-slate-600"
              }`}>
                {user?.email ?? "placementpartner@gmail.com"}
              </div>
            </div>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
