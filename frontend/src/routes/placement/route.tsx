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
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[276px] flex-col p-3 md:flex">
        <div className="glass-strong relative flex h-full flex-col overflow-hidden rounded-3xl">
          <div className="flex items-center gap-2.5 px-4 py-5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--grad-aurora)" }}>
              <Sparkles className="size-3.5 text-white" />
            </span>
            <span className="font-display text-sm uppercase tracking-[0.25em]">CampusVerse</span>
          </div>

          <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
            {PLACEMENT_NAV.map((item) => {
              const Icon = item.icon;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className="group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-white/55 transition hover:text-white"
                >
                  <Icon className="relative z-10 size-4 shrink-0" />
                  <span className="relative z-10 truncate">{item.label}</span>
                </a>
              );
            })}
          </nav>

          <div className="border-t border-white/10 px-2 py-2">
            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center gap-3 rounded-2xl border border-rose-300/20 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-100 transition hover:bg-rose-500/20"
            >
              <LogOut className="size-4" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      <main className="min-h-screen px-5 py-6 md:pl-[316px] md:pr-10">
        <header className="sticky top-0 z-30 -mx-5 mb-8 bg-[#050505]/65 px-5 py-3 backdrop-blur-xl md:-mx-10 md:px-10">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
              <BriefcaseBusiness className="size-5 text-cyan-200" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-white/40">Placement partner desk</div>
              <div className="font-display text-lg">{user?.full_name ?? "Placement manager"}</div>
            </div>
            <div className="ml-auto hidden rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs uppercase tracking-[0.18em] text-white/45 md:block">
              {user?.email ?? "placementpartner@gmail.com"}
            </div>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
