import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Pin, Search, Bell, X } from "lucide-react";
import { useMemo, useState } from "react";
import { GlassCard, PageTransition, SectionHeading } from "@/components/app/cinematic";
import { type StudentDashboard } from "@/lib/api";
import { useStudentDashboard } from "@/lib/student-session";

export const Route = createFileRoute("/app/announcements")({ component: AnnouncementsPage });

type Announcement = StudentDashboard["announcements"][number];

function AnnouncementsPage() {
  const { dashboard } = useStudentDashboard();
  const announcements = dashboard?.announcements ?? [];
  const categories = useMemo(
    () => ["All", ...Array.from(new Set(announcements.map((a) => a.category)))],
    [announcements],
  );
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [active, setActive] = useState<Announcement | null>(null);
  const items = announcements.filter(
    (a) => (cat === "All" || a.category === cat) && a.title.toLowerCase().includes(q.toLowerCase()),
  );
  const pinned = items.filter((a) => a.pinned);
  const rest = items.filter((a) => !a.pinned);

  return (
    <PageTransition>
      <SectionHeading
        eyebrow="Signal"
        title="Announcements"
        sub="Curated, prioritized, and quiet when it should be."
      />

      <div className="flex flex-col md:flex-row gap-3 mb-8">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-white/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search announcements..."
            className="w-full glass rounded-full pl-11 pr-4 py-3 text-sm placeholder-white/30 focus:outline-none focus:border-white/30"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`px-4 py-2 rounded-full text-xs uppercase tracking-[0.2em] transition whitespace-nowrap ${cat === c ? "text-white" : "text-white/50 hover:text-white"}`}
              style={cat === c ? { background: "var(--grad-aurora)" } : undefined}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {pinned.length > 0 && (
        <div className="mb-8">
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/40 mb-3 flex items-center gap-2">
            <Pin className="size-3" /> Pinned
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {pinned.map((a) => (
              <Card key={a.id} a={a} onClick={() => setActive(a)} />
            ))}
          </div>
        </div>
      )}

      <div className="relative pl-6">
        <div className="absolute left-2 top-0 bottom-0 w-px bg-gradient-to-b from-white/30 via-white/10 to-transparent" />
        <div className="space-y-4">
          {rest.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="relative"
            >
              <span
                className="absolute -left-[18px] top-6 size-2.5 rounded-full"
                style={{ background: a.unread ? "var(--grad-aurora)" : "oklch(0.4 0 0)" }}
              />
              <Card a={a} onClick={() => setActive(a)} />
            </motion.div>
          ))}
          {items.length === 0 && (
            <GlassCard>
              <div className="text-sm text-white/50">No announcements match this filter yet.</div>
            </GlassCard>
          )}
        </div>
      </div>

      {active && (
        <div onClick={() => setActive(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#111] p-7 text-white relative">
            <button onClick={() => setActive(null)} className="absolute top-7 right-7 text-white/50 hover:text-white transition">
              <X className="size-6" />
            </button>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] uppercase tracking-[0.3em] font-medium text-white/40">{active.category}</span>
              <span className="text-[10px] text-white/30">/</span>
              <span className="text-[10px] text-white/45">{active.time}</span>
            </div>
            <h3 className="font-display text-3xl mb-4">{active.title}</h3>
            <p className="text-white/70 leading-relaxed whitespace-pre-wrap">{active.body}</p>
          </div>
        </div>
      )}
    </PageTransition>
  );
}

function Card({ a, onClick }: { a: Announcement; onClick?: () => void }) {
  return (
    <GlassCard hover onClick={onClick} className="cursor-pointer group transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-white/20">
      <div className="flex items-start gap-4">
        <div className="size-10 rounded-xl glass flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300">
          <Bell className="size-4 text-white/60 group-hover:text-white transition-colors" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-[0.3em] font-medium text-white/40 group-hover:text-white/60 transition-colors">
              {a.category}
            </span>
            <span className="text-[10px] text-white/30">/</span>
            <span className="text-[10px] text-white/45">{a.time}</span>
            {a.unread && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-semibold shadow-sm"
                style={{ background: "oklch(0.72 0.27 350 / 0.2)", color: "oklch(0.85 0.18 350)" }}
              >
                New
              </span>
            )}
          </div>
          <div className="font-display text-lg mt-1 group-hover:text-fuchsia-100 transition-colors">
            {a.title}
          </div>
          <p className="text-sm text-white/55 mt-1 group-hover:text-white/70 transition-colors">{a.body}</p>
        </div>
      </div>
    </GlassCard>
  );
}
