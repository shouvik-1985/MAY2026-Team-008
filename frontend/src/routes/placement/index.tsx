import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  BadgeCheck,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  Download,
  Eye,
  FileText,
  GraduationCap,
  Link2,
  Loader2,
  Phone,
  Search,
  Send,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  getPlacementManagerDashboard,
  openProtectedResource,
  selectPlacementApplication,
  type PlacementApplication,
  type PlacementManagerDashboard,
} from "@/lib/api";

export const Route = createFileRoute("/placement/")({ component: PlacementManagerPage });

function PlacementManagerPage() {
  const [dashboard, setDashboard] = useState<PlacementManagerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [opportunityTitle, setOpportunityTitle] = useState("");

  async function refresh(successMessage?: string) {
    const data = await getPlacementManagerDashboard();
    setDashboard(data);
    setSelectedId((current) => current ?? data.applications[0]?.id ?? null);
    if (successMessage) setStatus(successMessage);
  }

  useEffect(() => {
    let live = true;
    setLoading(true);
    refresh()
      .catch((error) => {
        if (live) setStatus(error instanceof Error ? error.message : "Placement desk failed to load");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  const filteredApplications = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (dashboard?.applications ?? []).filter((application) => {
      if (!normalized) return true;
      return [
        application.studentName,
        application.studentEmail,
        `sem ${application.semester}`,
        application.cgpa.toFixed(1),
        application.skills,
        application.phoneNumber,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [dashboard?.applications, query]);

  const selected =
    filteredApplications.find((application) => application.id === selectedId) ??
    filteredApplications[0] ??
    null;

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
    if (!selected && selectedId !== null) setSelectedId(null);
  }, [selected, selectedId]);

  async function sendSelection(event: FormEvent) {
    event.preventDefault();
    if (!selected || saving) return;
    setSaving(true);
    setStatus(null);
    try {
      const result = await selectPlacementApplication(selected.id, {
        opportunity_title: opportunityTitle.trim() || undefined,
      });
      setDashboard((current) =>
        current
          ? {
              ...current,
              metrics: {
                ...current.metrics,
                selectedStudents:
                  selected.status === "selected"
                    ? current.metrics.selectedStudents
                    : current.metrics.selectedStudents + 1,
                pendingStudents:
                  selected.status === "selected"
                    ? current.metrics.pendingStudents
                    : Math.max(0, current.metrics.pendingStudents - 1),
              },
              applications: current.applications.map((application) =>
                application.id === result.application.id ? result.application : application,
              ),
            }
          : current,
      );
      setOpportunityTitle("");
      setStatus(result.notification);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not send selection message");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !dashboard) {
    return (
      <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.06),rgba(255,255,255,0.015))] p-8 text-white/60 shadow-2xl backdrop-blur-2xl">
        Loading placement desk...
      </div>
    );
  }

  const metrics = dashboard?.metrics ?? {
    eligibleStudents: 0,
    selectedStudents: 0,
    pendingStudents: 0,
  };
  const criteria = dashboard?.criteria ?? { minimumSemester: 3, minimumCgpa: 7.5 };
  const totalPipeline = Math.max(
    metrics.eligibleStudents + metrics.selectedStudents + metrics.pendingStudents,
    1,
  );

  return (
    <div className="mx-auto max-w-[1480px] space-y-6 pb-10">
      <section id="dashboard" className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-400/[0.06] px-3.5 py-1.5 text-[10px] uppercase tracking-[0.3em] text-cyan-100/70">
              <BriefcaseBusiness className="size-3.5 text-cyan-200" />
              Eligible students · Sem {criteria.minimumSemester}+ · CGPA {criteria.minimumCgpa}+
            </div>
            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight md:text-4xl">
              <span className="bg-gradient-to-r from-white via-white to-cyan-200 bg-clip-text text-transparent">
                Placement applicants
              </span>
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-white/55">
              Review submitted profiles, compare readiness, and send selection decisions.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.3)]">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-cyan-400/10">
              <BriefcaseBusiness className="size-4 text-cyan-200" />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Signed in as</div>
              <div className="truncate text-sm text-white/78" title={dashboard?.manager.email}>
                {dashboard?.manager.email ?? "placementpartner@gmail.com"}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard
            icon={Users}
            label="Eligible students"
            value={metrics.eligibleStudents}
            hint="Submitted and criteria-ready"
            total={totalPipeline}
            tone="cyan"
          />
          <MetricCard
            icon={BadgeCheck}
            label="Selected"
            value={metrics.selectedStudents}
            hint="Notified through email and portal"
            total={totalPipeline}
            tone="emerald"
          />
          <MetricCard
            icon={UserCheck}
            label="Pending review"
            value={metrics.pendingStudents}
            hint="Awaiting placement decision"
            total={totalPipeline}
            tone="amber"
          />
        </div>
      </section>

      {status ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-2xl border border-emerald-300/20 bg-[linear-gradient(135deg,rgba(52,211,153,0.1),rgba(52,211,153,0.02))] px-4 py-3 text-sm text-white/80 shadow-[0_10px_30px_rgba(16,185,129,0.08)]"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-emerald-300/15">
            <CheckCircle2 className="size-4 text-emerald-200" />
          </span>
          {status}
        </motion.div>
      ) : null}

      <section id="applicants" className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Panel className="overflow-hidden p-0" accent="cyan">
          <div className="border-b border-white/8 px-5 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <SectionTitle icon={Search} eyebrow="Talent pool" title="Placement applicants" />
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 transition focus-within:border-cyan-300/40 focus-within:bg-black/35 lg:w-[300px]">
                <Search className="size-4 shrink-0 text-white/35" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search name, email, skills"
                  className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/28"
                />
              </label>
            </div>
          </div>

          <div className="max-h-[640px] space-y-3 overflow-y-auto px-4 py-4">
            {filteredApplications.length ? (
              filteredApplications.map((application, index) => {
                const isSelected = selected?.id === application.id;
                return (
                  <motion.button
                    key={application.id}
                    type="button"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    onClick={() => setSelectedId(application.id)}
                    className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                      isSelected
                        ? "border-cyan-300/30 bg-[linear-gradient(135deg,rgba(34,211,238,0.12),rgba(34,211,238,0.02))] shadow-[0_10px_30px_rgba(34,211,238,0.08)]"
                        : "border-white/8 bg-white/[0.02] hover:border-white/16 hover:bg-white/[0.045]"
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <Avatar value={avatarFromName(application.studentName)} />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-white" title={application.studentName}>
                            {application.studentName}
                          </div>
                          <div className="truncate text-xs text-white/45" title={application.studentEmail}>
                            {application.studentEmail}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/52">
                            <MiniTag icon={GraduationCap}>{`Sem ${application.semester}`}</MiniTag>
                            <MiniTag icon={BadgeCheck}>{`${application.cgpa.toFixed(1)} CGPA`}</MiniTag>
                            <MiniTag icon={Phone}>{application.phoneNumber}</MiniTag>
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
                        <StatusPill status={application.status} />
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-white/62">
                          <Eye className="size-3.5" />
                          View
                          <ChevronRight className="size-3.5" />
                        </span>
                      </div>
                    </div>
                  </motion.button>
                );
              })
            ) : (
              <EmptyState text="No eligible placement profiles match this search yet." />
            )}
          </div>
        </Panel>

        <Panel className="sticky top-6 self-start p-0" accent="fuchsia">
          {selected ? (
            <div>
              <div className="relative overflow-hidden border-b border-white/8 px-5 py-5">
                <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-fuchsia-400/10 blur-3xl" />
                <div className="relative flex items-start gap-4">
                  <Avatar value={avatarFromName(selected.studentName)} large />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] uppercase tracking-[0.28em] text-white/38">Candidate profile</div>
                    <div className="mt-1 truncate font-display text-2xl text-white" title={selected.studentName}>
                      {selected.studentName}
                    </div>
                    <div className="mt-1 truncate text-sm text-white/48" title={selected.studentEmail}>
                      {selected.studentEmail}
                    </div>
                  </div>
                  <StatusPill status={selected.status} />
                </div>
              </div>

              <div className="space-y-4 px-5 py-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailCard label="Email" value={selected.studentEmail} />
                  <DetailCard label="Phone" value={selected.phoneNumber} />
                  <DetailCard label="Semester" value={`Sem ${selected.semester}`} />
                  <DetailCard label="CGPA" value={selected.cgpa.toFixed(1)} />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <LinkCard label="LinkedIn" value={selected.linkedinProfile || "Not added"} />
                  <LinkCard label="GitHub" value={selected.githubProfile || "Not added"} />
                </div>

                <div className="rounded-2xl border border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.045),rgba(255,255,255,0.01))] p-4">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-white/35">Skills snapshot</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {splitSkills(selected.skills).map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full border border-cyan-300/18 bg-cyan-400/[0.09] px-3 py-1.5 text-sm text-cyan-50/90"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <ActionButton
                    icon={FileText}
                    tone="cyan"
                    onClick={() =>
                      void openProtectedResource(selected.resumeUrl, {
                        fallbackName: selected.resumeFilename,
                      }).catch((error) =>
                        setStatus(error instanceof Error ? error.message : "Could not open resume"),
                      )
                    }
                  >
                    Open resume
                  </ActionButton>
                  <ActionButton
                    icon={Download}
                    onClick={() =>
                      void openProtectedResource(`${selected.resumeUrl}?download=true`, {
                        download: true,
                        fallbackName: selected.resumeFilename,
                      }).catch((error) =>
                        setStatus(error instanceof Error ? error.message : "Could not save resume"),
                      )
                    }
                  >
                    Save resume
                  </ActionButton>
                </div>

                <form
                  id="messages"
                  onSubmit={sendSelection}
                  className="rounded-2xl border border-cyan-300/15 bg-[linear-gradient(160deg,rgba(34,211,238,0.08),rgba(34,211,238,0.015))] p-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cyan-400/12">
                      <Send className="size-4 text-cyan-100" />
                    </span>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.28em] text-white/38">Selection note</div>
                      <div className="mt-0.5 text-sm text-white/78">
                        {selected.status === "selected" ? "Resend selection message" : "Notify this candidate"}
                      </div>
                    </div>
                  </div>
                  <input
                    value={opportunityTitle}
                    onChange={(event) => setOpportunityTitle(event.target.value)}
                    placeholder="Summer internship, frontend role, analyst track"
                    className="mt-4 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-cyan-300/40"
                  />
                  <button
                    type="submit"
                    disabled={saving}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-cyan-300/25 bg-[linear-gradient(135deg,rgba(34,211,238,0.55),rgba(6,182,212,0.35))] px-5 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-white shadow-[0_10px_30px_rgba(34,211,238,0.15)] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    {selected.status === "selected" ? "Resend selection" : "Send selection"}
                  </button>
                  {selected.selectionMessage ? (
                    <div className="mt-3 min-h-[60px] border-l-2 border-cyan-500/60 pl-3 text-sm italic leading-7 text-white/55">
                      {selected.selectionMessage}
                    </div>
                  ) : null}
                </form>
              </div>
            </div>
          ) : (
            <div className="p-5">
              <EmptyState text="Select an eligible student to review the submitted placement form." />
            </div>
          )}
        </Panel>
      </section>
    </div>
  );
}

function Panel({
  children,
  className = "",
  accent = "neutral",
}: {
  children: ReactNode;
  className?: string;
  accent?: "cyan" | "fuchsia" | "neutral";
}) {
  const accentGlow =
    accent === "cyan"
      ? "before:bg-cyan-400/[0.05]"
      : accent === "fuchsia"
        ? "before:bg-fuchsia-400/[0.05]"
        : "before:bg-transparent";

  return (
    <div
      className={`relative overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.06),rgba(255,255,255,0.015))] shadow-[0_20px_60px_rgba(0,0,0,0.4)] backdrop-blur-2xl before:pointer-events-none before:absolute before:-right-16 before:-top-16 before:h-48 before:w-48 before:rounded-full before:blur-3xl ${accentGlow} ${className}`}
    >
      {children}
    </div>
  );
}

function SectionTitle({ icon: Icon, eyebrow, title }: { icon: LucideIcon; eyebrow: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl border border-white/10 bg-cyan-400/[0.08]">
        <Icon className="size-4 text-cyan-200" />
      </span>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">{eyebrow}</div>
        <h2 className="truncate font-display text-2xl">{title}</h2>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  total,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  hint: string;
  total: number;
  tone: "cyan" | "emerald" | "amber";
}) {
  const styles = {
    cyan: {
      chip: "bg-cyan-400/12 text-cyan-100",
      bar: "from-cyan-300 to-sky-500",
      glow: "before:bg-cyan-400/[0.08]",
      border: "hover:border-cyan-300/25",
    },
    emerald: {
      chip: "bg-emerald-400/12 text-emerald-100",
      bar: "from-emerald-300 to-emerald-600",
      glow: "before:bg-emerald-400/[0.08]",
      border: "hover:border-emerald-300/25",
    },
    amber: {
      chip: "bg-amber-400/12 text-amber-100",
      bar: "from-amber-200 to-orange-500",
      glow: "before:bg-amber-400/[0.08]",
      border: "hover:border-amber-300/25",
    },
  }[tone];

  const pct = Math.round((value / total) * 100);

  return (
    <div
      className={`group relative overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.06),rgba(255,255,255,0.015))] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.4)] backdrop-blur-2xl transition before:pointer-events-none before:absolute before:-right-14 before:-top-14 before:h-40 before:w-40 before:rounded-full before:blur-3xl ${styles.glow} ${styles.border}`}
    >
      <div className="relative flex items-start justify-between gap-3">
        <div className="text-[10px] uppercase tracking-[0.28em] text-white/40">{label}</div>
        <span className={`grid size-10 place-items-center rounded-2xl ${styles.chip}`}>
          <Icon className="size-4" />
        </span>
      </div>
      <div className="relative mt-4 font-display text-4xl font-bold text-white">{value}</div>
      <div className="relative mt-1.5 text-sm text-white/45">{hint}</div>
      <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-white/7">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${styles.bar} shadow-[0_0_10px_rgba(255,255,255,0.15)]`}
          style={{ width: `${Math.max(pct, value > 0 ? 6 : 0)}%` }}
        />
      </div>
    </div>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">{label}</div>
      <div className="mt-2 break-words text-sm text-white/72">{value}</div>
    </div>
  );
}

function LinkCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-white/35">
        <Link2 className="size-3.5" />
        {label}
      </div>
      <div className="mt-2 break-words text-sm text-white/72">{value}</div>
    </div>
  );
}

function MiniTag({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
      <Icon className="size-3 text-white/48" />
      <span>{children}</span>
    </span>
  );
}

function ActionButton({
  icon: Icon,
  children,
  onClick,
  tone = "neutral",
}: {
  icon: LucideIcon;
  children: ReactNode;
  onClick: () => void;
  tone?: "cyan" | "neutral";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-full border px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] transition ${
        tone === "cyan"
          ? "border-cyan-300/25 bg-cyan-400/12 text-cyan-100 hover:bg-cyan-400/20"
          : "border-white/10 bg-white/[0.05] text-white/68 hover:text-white"
      }`}
    >
      <Icon className="size-4" />
      {children}
    </button>
  );
}

function StatusPill({ status }: { status: PlacementApplication["status"] }) {
  const selected = status === "selected";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] ${
        selected
          ? "border-emerald-300/25 bg-emerald-400/12 text-emerald-200 shadow-[0_0_12px_rgba(52,211,153,0.15)]"
          : "border-cyan-300/25 bg-cyan-400/12 text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,0.12)]"
      }`}
    >
      <CheckCircle2 className="size-3.5" />
      {selected ? "Selected" : "Submitted"}
    </span>
  );
}

function Avatar({ value, large = false }: { value: string; large?: boolean }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-2xl text-sm font-semibold text-white shadow-[0_10px_25px_rgba(0,0,0,0.4)] ${
        large ? "size-14 text-base" : "size-11"
      }`}
      style={{ background: "var(--grad-aurora)" }}
    >
      {value}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-5 py-10 text-center text-sm text-white/45">
      {text}
    </div>
  );
}

function splitSkills(value: string) {
  const parts = value
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts : [value];
}

function avatarFromName(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "CV"
  );
}
