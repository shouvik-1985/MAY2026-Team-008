import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState } from "react";
import { Bell, Lock, Globe, Eye, Smartphone, Palette } from "lucide-react";
import { GlassCard, PageTransition, SectionHeading } from "@/components/app/cinematic";

export const Route = createFileRoute("/app/settings")({ component: SettingsPage });

const GROUPS = [
  {
    icon: Palette,
    title: "Theme",
    items: ["Dark", "System sync", "Reduce motion", "High contrast"],
  },
  {
    icon: Bell,
    title: "Notifications",
    items: ["Push notifications", "Email digest", "Assignment alerts", "Event reminders"],
  },
  {
    icon: Lock,
    title: "Privacy",
    items: ["Profile visibility", "Show CGPA publicly", "Allow mentions", "Marketplace visibility"],
  },
  { icon: Globe, title: "Language", items: ["English", "Hindi", "Tamil", "French"] },
  {
    icon: Eye,
    title: "Accessibility",
    items: ["Screen reader hints", "Large text", "Focus rings", "Captions"],
  },
  {
    icon: Smartphone,
    title: "Connected devices",
    items: ["iPhone 15 Pro", "Macbook Air", "iPad Studio", "Campus tablet"],
  },
];

const DEFAULT_ON = new Set([
  "Theme:Dark",
  "Notifications:Assignment alerts",
  "Notifications:Event reminders",
  "Privacy:Profile visibility",
  "Accessibility:Focus rings",
]);

function SettingsPage() {
  const [state, setState] = useState<Record<string, boolean>>({});
  function toggle(k: string) {
    setState((s) => ({ ...s, [k]: !s[k] }));
  }
  return (
    <PageTransition>
      <SectionHeading
        eyebrow="Preferences"
        title="Settings"
        sub="Tune the Verse exactly how you like it."
      />
      <div className="grid md:grid-cols-2 gap-5">
        {GROUPS.map((g, i) => (
          <motion.div
            key={g.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <GlassCard>
              <div className="flex items-center gap-3 mb-5">
                <span className="size-10 rounded-2xl glass flex items-center justify-center">
                  <g.icon className="size-4 text-white/80" />
                </span>
                <div className="font-display text-xl">{g.title}</div>
              </div>
              <div className="space-y-2.5">
                {g.items.map((item) => {
                  const key = g.title + ":" + item;
                  const on = state[key] ?? DEFAULT_ON.has(key);
                  return (
                    <div
                      key={item}
                      className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-white/5"
                    >
                      <span className="text-sm">{item}</span>
                      <Toggle on={on} onClick={() => toggle(key)} />
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          </motion.div>
        ))}
      </div>
    </PageTransition>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative w-11 h-6 rounded-full transition-all"
      style={{ background: on ? "var(--grad-aurora)" : "oklch(1 0 0 / 0.1)" }}
    >
      <motion.span
        className="absolute top-0.5 size-5 rounded-full bg-white"
        animate={{ left: on ? 22 : 2 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    </button>
  );
}
