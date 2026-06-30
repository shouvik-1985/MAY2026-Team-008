import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { AnimatePresence } from "framer-motion";
import { CinematicBackdrop } from "@/components/app/cinematic";
import { ProfessorShell } from "@/components/professor/ProfessorShell";
import { getStoredUser, hasAuthSession } from "@/lib/auth";

export const Route = createFileRoute("/professor")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && !hasAuthSession()) {
      throw redirect({ to: "/login" });
    }
    const user = typeof window !== "undefined" ? getStoredUser() : null;
    if (user && user.role !== "faculty") {
      throw redirect({ to: "/app" });
    }
  },
  component: ProfessorLayout,
});

function ProfessorLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <>
      <CinematicBackdrop intensity={0.65} />
      <ProfessorShell>
        <AnimatePresence mode="wait">
          <div key={pathname}>
            <Outlet />
          </div>
        </AnimatePresence>
      </ProfessorShell>
    </>
  );
}
