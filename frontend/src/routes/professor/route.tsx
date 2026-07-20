import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { AnimatePresence } from "framer-motion";
import { CinematicBackdrop } from "@/components/app/cinematic";
import { ProfessorShell } from "@/components/professor/ProfessorShell";
import { getStoredUser, hasAuthSession } from "@/lib/auth";
import { useLowPerformanceMode } from "@/lib/performance";
import { resolveRoleHome } from "@/lib/role-home";

export const Route = createFileRoute("/professor")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && !hasAuthSession()) {
      throw redirect({ to: "/login" });
    }
    const user = typeof window !== "undefined" ? getStoredUser() : null;
    if (user && user.role !== "faculty") {
      throw redirect({ to: resolveRoleHome(user.role) });
    }
  },
  component: ProfessorLayout,
});

function ProfessorLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const lowPerformance = useLowPerformanceMode();
  return (
    <>
      <CinematicBackdrop intensity={0.65} />
      <ProfessorShell>
        <AnimatePresence mode={lowPerformance ? "sync" : "wait"} initial={!lowPerformance}>
          <div key={pathname}>
            <Outlet />
          </div>
        </AnimatePresence>
      </ProfessorShell>
    </>
  );
}
