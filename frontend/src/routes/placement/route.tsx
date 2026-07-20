import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { BriefcaseBusiness, LayoutDashboard, LogOut, Mail, Sparkles, UserCheck } from "lucide-react";
import { type ComponentType, type ReactNode } from "react";
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

function PlacementShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const user = getStoredUser();

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
    <div className="relative min-h-screen text-white">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[272px] flex-col p-4 md:flex">
        <div className="glass-strong relative flex h-full flex-col overflow-hidden rounded-[34px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))]">
          <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/28 to-transparent" />
          <div className="min-w-0 px-5 py-6">
            <div className="flex min-w-0 items-start gap-3 overflow-hidden">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.28)]" style={{ background: "var(--grad-aurora)" }}>
                <Sparkles className="size-3.5 text-white" />
              </span>
              <div className="min-w-0 flex-1 overflow-hidden pt-0.5">
                <div className="truncate font-display text-[0.9rem] uppercase tracking-[0.22em] text-white/95">
                  CampusVerse
                </div>
                <div className="mt-1 text-[9px] uppercase tracking-[0.24em] text-white/34">
                  Placement Console
                </div>
              </div>
            </div>
          </div>

          <nav className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {PLACEMENT_NAV.map((item) => {
              const Icon = item.icon;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className="group relative flex items-center gap-4 rounded-[22px] border border-transparent px-4 py-3.5 text-[15px] text-white/60 transition hover:border-white/8 hover:bg-white/[0.045] hover:text-white"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl border border-white/8 bg-white/[0.03]">
                    <Icon className="relative z-10 size-4 shrink-0" />
                  </span>
                  <span className="relative z-10 truncate">{item.label}</span>
                </a>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-white/8 px-4 py-4">
            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center gap-3 rounded-[20px] border border-rose-300/18 bg-rose-500/[0.09] px-4 py-3.5 text-[15px] text-rose-100 transition hover:bg-rose-500/[0.16]"
            >
              <LogOut className="size-4" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      <main className="min-h-screen px-5 py-6 md:pl-[316px] md:pr-10">
        <header className="sticky top-0 z-30 -mx-5 mb-8 bg-[linear-gradient(180deg,rgba(5,5,5,0.92),rgba(5,5,5,0.72))] px-5 py-3 backdrop-blur-xl md:-mx-10 md:px-10">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-[20px] border border-cyan-300/15 bg-cyan-400/[0.06]">
              <BriefcaseBusiness className="size-5 text-cyan-200" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.34em] text-white/36">Placement partner desk</div>
              <div className="font-display text-[1.7rem] leading-none">{user?.full_name ?? "Placement manager"}</div>
            </div>
            <div className="ml-auto hidden rounded-full border border-white/10 bg-white/[0.035] px-5 py-2.5 text-[11px] uppercase tracking-[0.24em] text-white/42 md:block">
              {user?.email ?? "placementpartner@gmail.com"}
            </div>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
