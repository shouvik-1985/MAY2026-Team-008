import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { AnimatePresence } from "framer-motion";
import { CinematicBackdrop } from "@/components/app/cinematic";
import { AdminShell } from "@/components/admin/AdminShell";
import { getStoredUser, hasAuthSession } from "@/lib/auth";
import { useLowPerformanceMode } from "@/lib/performance";
import { resolveRoleHome } from "@/lib/role-home";

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
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const lowPerformance = useLowPerformanceMode();

  return (
    <>
      <CinematicBackdrop intensity={0.72} />
      <AdminShell>
        <AnimatePresence mode={lowPerformance ? "sync" : "wait"} initial={!lowPerformance}>
          <div key={pathname}>
            <Outlet />
          </div>
        </AnimatePresence>
      </AdminShell>
    </>
  );
}
