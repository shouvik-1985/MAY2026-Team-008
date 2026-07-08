import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { AnimatePresence } from "framer-motion";
import { Shell } from "@/components/app/Shell";
import { CinematicBackdrop } from "@/components/app/cinematic";
import { getStoredUser, hasAuthSession } from "@/lib/auth";
import { useLowPerformanceMode } from "@/lib/performance";
import { resolveRoleHome } from "@/lib/role-home";

export const Route = createFileRoute("/app")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && !hasAuthSession()) {
      throw redirect({ to: "/login" });
    }
    const user = typeof window !== "undefined" ? getStoredUser() : null;
    if (user?.role && user.role !== "student") {
      throw redirect({ to: resolveRoleHome(user.role) });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const lowPerformance = useLowPerformanceMode();
  return (
    <>
      <CinematicBackdrop intensity={0.7} />
      <Shell>
        <AnimatePresence mode={lowPerformance ? "sync" : "wait"} initial={!lowPerformance}>
          <div key={pathname}>
            <Outlet />
          </div>
        </AnimatePresence>
      </Shell>
    </>
  );
}
