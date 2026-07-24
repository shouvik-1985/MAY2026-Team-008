import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { MapPin, Ticket, Users, X } from "lucide-react";
import { GlassCard, PageTransition, SectionHeading } from "@/components/app/cinematic";
import { getStudentDashboard, registerStudentEvent, type StudentDashboard } from "@/lib/api";
import { setStoredDashboard, useStudentDashboard } from "@/lib/student-session";

export const Route = createFileRoute("/app/events")({ component: EventsPage });

type EventItem = StudentDashboard["event_items"][number];

function EventsPage() {
  const { dashboard } = useStudentDashboard();
  const events = dashboard?.event_items ?? [];
  const completed = events.filter((event) => event.attended);
  const upcoming = events.filter((event) => !event.attended);
  const [active, setActive] = useState<EventItem | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function refreshDashboard() {
    const next = await getStudentDashboard();
    setStoredDashboard(next);
  }

  return (
    <PageTransition>
      <SectionHeading
        eyebrow="Calendar"
        title="Events"
        sub="The pulse of campus, live and upcoming."
      />

      {status ? (
        <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white/70">
          {status}
        </div>
      ) : null}

      <div className="grid lg:grid-cols-2 gap-5 mb-10">
        {upcoming.map((ev, i) => (
          <motion.div
            key={ev.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <EventCard
              ev={ev}
              onRegister={() => {
                if (!ev.key || busyKey === ev.key) return;
                setBusyKey(ev.key);
                setStatus(null);
                void registerStudentEvent(ev.key)
                  .then(async (response) => {
                    setStatus(response.message);
                    await refreshDashboard();
                  })
                  .catch((error) => setStatus(error instanceof Error ? error.message : "Could not register for event"))
                  .finally(() => setBusyKey(null));
              }}
              onDetails={() => setActive(ev)}
              busy={busyKey === ev.key}
            />
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

      {active ? (
        <div
          onClick={() => setActive(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#111] p-7 text-white"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">{active.date}</div>
                <div className="mt-2 font-display text-3xl">{active.title}</div>
              </div>
              <button onClick={() => setActive(null)} className="rounded-full border border-white/10 p-2 text-white/70">
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/70">
                Venue: {active.venue}
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/70">
                Registered crowd: {active.spots}
              </div>
            </div>
            <p className="mt-5 text-sm leading-6 text-white/65">
              {active.details ?? "Campus event details will appear here."}
            </p>
          </div>
        </div>
      ) : null}
    </PageTransition>
  );
}

function EventCard({
  ev,
  onRegister,
  onDetails,
  busy,
}: {
  ev: EventItem;
  onRegister: () => void;
  onDetails: () => void;
  busy: boolean;
}) {
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
          <Countdown isoDate={ev.isoDate} label={ev.date} />
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
            <button
              onClick={onRegister}
              disabled={ev.registered || busy}
              className="glass-strong rounded-full px-5 py-2.5 text-xs uppercase tracking-[0.2em] flex items-center gap-2 disabled:opacity-55"
            >
              <Ticket className="size-3.5" /> {ev.registered ? "Registered ✓" : busy ? "Registering…" : "Register"}
            </button>
            <button onClick={onDetails} className="text-xs uppercase tracking-[0.2em] text-white/70 hover:text-white px-5 py-2.5">
              Details
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Countdown({ isoDate, label }: { isoDate?: string; label: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Use backend-provided ISO date (e.g. "2026-08-04") if available, otherwise
  // fall back to parsing the short label (e.g. "Jul 24") relative to the current year.
  let target: number;
  if (isoDate) {
    target = new Date(`${isoDate}T09:00:00`).getTime();
  } else {
    const currentYear = new Date().getFullYear();
    target = new Date(`${label}, ${currentYear} 09:00`).getTime();
    // If the parsed date is more than 6 months in the past, assume next year
    if (target < Date.now() - 180 * 86400000) {
      target = new Date(`${label}, ${currentYear + 1} 09:00`).getTime();
    }
  }

  const diff = Math.max(0, target - now);
  if (diff === 0) {
    return (
      <div className="glass-strong rounded-2xl px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] tabular-nums text-emerald-300">
        Live / Past
      </div>
    );
  }
  const days = Math.floor(diff / 86400000);
  const hrs = Math.floor((diff / 3600000) % 24);
  const mins = Math.floor((diff / 60000) % 60);
  return (
    <div className="glass-strong rounded-2xl px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] tabular-nums">
      {days}d {hrs}h {mins}m
    </div>
  );
}
