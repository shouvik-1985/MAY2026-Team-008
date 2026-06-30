import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { MapPin, Ticket, Users } from "lucide-react";
import { GlassCard, PageTransition, SectionHeading } from "@/components/app/cinematic";
import { type StudentDashboard } from "@/lib/api";
import { useStudentDashboard } from "@/lib/student-session";

export const Route = createFileRoute("/app/events")({ component: EventsPage });

type EventItem = StudentDashboard["event_items"][number];

function EventsPage() {
  const { dashboard } = useStudentDashboard();
  const events = dashboard?.event_items ?? [];
  const completed = events.filter((event) => event.attended);
  const upcoming = events.filter((event) => !event.attended);

  return (
    <PageTransition>
      <SectionHeading
        eyebrow="Calendar"
        title="Events"
        sub="The pulse of campus, live and upcoming."
      />

      <div className="grid lg:grid-cols-2 gap-5 mb-10">
        {upcoming.map((ev, i) => (
          <motion.div
            key={ev.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <EventCard ev={ev} />
          </motion.div>
        ))}
      </div>

      <GlassCard>
        <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Recent</div>
        <div className="font-display text-xl mt-1 mb-5">Completed events</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(completed.length ? completed : upcoming.slice(0, 3)).map((e, i) => (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass rounded-2xl p-4"
            >
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">{e.date}</div>
              <div className="font-medium mt-1">{e.title}</div>
              <div className="text-xs text-white/45 mt-1">
                {e.attended ? "Attended / ticket archived" : "Registration open"}
              </div>
            </motion.div>
          ))}
        </div>
      </GlassCard>
    </PageTransition>
  );
}

function EventCard({ ev }: { ev: EventItem }) {
  return (
    <div className="relative rounded-3xl overflow-hidden h-72">
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, ${ev.accent}, transparent 70%), #0a0a0a`,
        }}
      />
      <div className="absolute inset-0 grid-bg opacity-20" />
      <div className="absolute inset-0 p-7 flex flex-col justify-between text-white">
        <div className="flex items-start justify-between">
          <div className="text-[10px] uppercase tracking-[0.4em] text-white/80">
            {ev.date}
          </div>
          <Countdown date={ev.date} />
        </div>
        <div>
          <div className="font-display text-3xl md:text-4xl font-bold leading-tight">
            {ev.title}
          </div>
          <div className="mt-4 flex items-center gap-5 text-xs text-white/80">
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5" />
              {ev.venue}
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="size-3.5" />
              {ev.spots} attending
            </span>
          </div>
          <div className="mt-5 flex gap-2">
            <button className="glass-strong rounded-full px-5 py-2.5 text-xs uppercase tracking-[0.2em] flex items-center gap-2">
              <Ticket className="size-3.5" /> Register
            </button>
            <button className="text-xs uppercase tracking-[0.2em] text-white/70 hover:text-white px-5 py-2.5">
              Details
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Countdown({ date }: { date: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const target = new Date(`${date} 2026 09:00`).getTime();
  const diff = Math.max(0, target - now);
  const days = Math.floor(diff / 86400000);
  const hrs = Math.floor((diff / 3600000) % 24);
  const mins = Math.floor((diff / 60000) % 60);
  return (
    <div className="glass-strong rounded-2xl px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] tabular-nums">
      {days}d {hrs}h {mins}m
    </div>
  );
}
