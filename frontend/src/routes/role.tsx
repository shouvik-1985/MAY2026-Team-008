import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState } from "react";
import { BriefcaseBusiness, GraduationCap, Users, Shield, HandCoins, ArrowRight } from "lucide-react";
import { CinematicBackdrop } from "@/components/app/cinematic";
import { ROLES, type RoleId } from "@/lib/campus-data";
import { resolveRoleHome } from "@/lib/role-home";
import { setStoredRole } from "@/lib/use-role";

export const Route = createFileRoute("/role")({
  head: () => ({ meta: [{ title: "Choose your role — CampusVerse" }] }),
  component: RolePage,
});

const ICONS: Record<RoleId, React.ComponentType<{ className?: string }>> = {
  student: GraduationCap,
  faculty: Users,
  admin: Shield,
  scholarship: HandCoins,
  placement: BriefcaseBusiness,
};

function RolePage() {
  const navigate = useNavigate();
  const [picked, setPicked] = useState<RoleId | null>(null);

  function pick(id: RoleId) {
    setPicked(id);
    setStoredRole(id);
    setTimeout(() => navigate({ to: resolveRoleHome(id) }), 850);
  }

  return (
    <div className="min-h-screen relative px-6 py-20 overflow-hidden">
      <CinematicBackdrop />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="max-w-6xl mx-auto text-center"
      >
        <div className="text-[10px] uppercase tracking-[0.5em] text-white/40 mb-4">
          Welcome to CampusVerse
        </div>
        <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tight">
          Choose your <span className="text-aurora">role</span>
        </h1>
        <p className="mt-5 text-white/55 max-w-xl mx-auto">
          Every door inside the Verse opens differently. Pick the one that's yours.
        </p>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5">
          {ROLES.map((r, i) => {
            const Icon = ICONS[r.id];
            const isPicked = picked === r.id;
            return (
              <motion.button
                key={r.id}
                onClick={() => pick(r.id)}
                disabled={!!picked}
                initial={{ opacity: 0, y: 30 }}
                animate={{
                  opacity: picked && !isPicked ? 0.2 : 1,
                  y: 0,
                  scale: isPicked ? 1.05 : 1,
                }}
                transition={{ delay: i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ y: -6 }}
                className="group relative text-left overflow-hidden rounded-3xl"
              >
                <motion.span
                  className="absolute -inset-px rounded-3xl opacity-40 group-hover:opacity-100 transition"
                  style={{
                    background: `linear-gradient(135deg, ${r.accent}, transparent 80%)`,
                    filter: "blur(10px)",
                  }}
                  animate={isPicked ? { opacity: [0.5, 1, 0.5] } : undefined}
                  transition={{ duration: 1.2, repeat: Infinity }}
                />
                <div className="relative glass-strong rounded-3xl p-7 h-72 flex flex-col">
                  <div
                    className="size-14 rounded-2xl flex items-center justify-center mb-6"
                    style={{ background: `linear-gradient(135deg, ${r.accent}, transparent)` }}
                  >
                    <Icon className="size-7 text-white" />
                  </div>
                  <h3 className="font-display text-2xl font-semibold">{r.title}</h3>
                  <p className="mt-2 text-sm text-white/55 flex-1">{r.tagline}</p>
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-white/60 group-hover:text-white transition">
                    Enter{" "}
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
