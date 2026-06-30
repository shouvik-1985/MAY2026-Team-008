import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { AnimatePresence } from "framer-motion";
import { Shell } from "@/components/app/Shell";
import { CinematicBackdrop } from "@/components/app/cinematic";
import { getStoredUser, hasAuthSession } from "@/lib/auth";

export const Route = createFileRoute("/app")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && !hasAuthSession()) {
      throw redirect({ to: "/login" });
    }
    const user = typeof window !== "undefined" ? getStoredUser() : null;
    if (user?.role === "faculty") {
      throw redirect({ to: "/professor" });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <>
      <CinematicBackdrop intensity={0.7} />
      <Shell>
        <AnimatePresence mode="wait">
          <div key={pathname}>
            <Outlet />
          </div>
        </AnimatePresence>
      </Shell>
    </>
  );
}
