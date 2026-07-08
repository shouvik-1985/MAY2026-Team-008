import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  BadgeCheck,
  BriefcaseBusiness,
  CheckCircle2,
  Eye,
  FileText,
  Loader2,
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
    return <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-8 text-white/60">Loading placement desk...</div>;
  }

  const metrics = dashboard?.metrics ?? {
    eligibleStudents: 0,
    selectedStudents: 0,
    pendingStudents: 0,
  };
  const criteria = dashboard?.criteria ?? { minimumSemester: 3, minimumCgpa: 7.5 };

  return (
    <div className="mx-auto max-w-[1480px] space-y-6 pb-10">
      <section id="dashboard" className="grid gap-6 xl:grid-cols-[1fr_340px] xl:items-end">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[10px] uppercase tracking-[0.35em] text-white/45">
            <BriefcaseBusiness className="size-3.5" />
            Placement partner command center
          </div>
          <h1 className="mt-5 max-w-5xl font-display text-5xl font-bold tracking-tight md:text-7xl">
            Eligible student profiles for internship and job selection
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-white/58">
            Review students who meet Sem {criteria.minimumSemester}+ and CGPA {criteria.minimumCgpa}+
            after they submit their placement form.
          </p>
        </div>

        <Panel>
          <div className="text-[10px] uppercase tracking-[0.28em] text-white/35">Manager login</div>
          <div className="mt-4 space-y-3">
            <ReadonlyLine label="Email" value={dashboard?.manager.email ?? "placementpartner@gmail.com"} />
            <ReadonlyLine label="Password" value="manager#123" />
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={Users} label="Eligible students" value={String(metrics.eligibleStudents)} hint="Submitted and criteria-ready" />
        <MetricCard icon={BadgeCheck} label="Selected" value={String(metrics.selectedStudents)} hint="Notified through email and portal" />
        <MetricCard icon={UserCheck} label="Pending review" value={String(metrics.pendingStudents)} hint="Awaiting placement decision" />
      </section>

      {status ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white/72"
        >
          <CheckCircle2 className="size-4 text-emerald-300" />
          {status}
        </motion.div>
      ) : null}

      <section id="applicants" className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        <Panel>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <SectionTitle icon={Search} eyebrow="Eligible students" title="Placement applicants" />
            <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 lg:w-[360px]">
              <Search className="size-4 text-white/35" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, email, skills..."
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/28"
              />
            </label>
          </div>

          <div className="mt-6 overflow-hidden rounded-3xl border border-white/10">
            <div className="hidden grid-cols-[1.2fr_0.7fr_0.7fr_0.8fr_110px] gap-4 bg-white/[0.035] px-5 py-4 text-[10px] uppercase tracking-[0.25em] text-white/40 lg:grid">
              <div>Student</div>
              <div>Semester</div>
              <div>CGPA</div>
              <div>Status</div>
              <div>Action</div>
            </div>
            <div className="divide-y divide-white/10">
              {filteredApplications.map((application) => (
                <div
                  key={application.id}
                  className={`grid gap-4 px-5 py-4 text-sm transition lg:grid-cols-[1.2fr_0.7fr_0.7fr_0.8fr_110px] lg:items-center ${
                    selected?.id === application.id ? "bg-cyan-300/8" : "hover:bg-white/[0.025]"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar value={avatarFromName(application.studentName)} />
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-white">{application.studentName}</div>
                      <div className="truncate text-xs text-white/45">{application.studentEmail}</div>
                    </div>
                  </div>
                  <div className="text-white/65">Sem {application.semester}</div>
                  <div className="text-white/65">{application.cgpa.toFixed(1)}</div>
                  <div>
                    <StatusPill status={application.status} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedId(application.id)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-white/70 transition hover:text-white"
                  >
                    <Eye className="size-3.5" />
                    View
                  </button>
                </div>
              ))}
              {filteredApplications.length === 0 ? (
                <div className="px-5 py-12 text-center text-sm text-white/45">
                  No eligible placement profiles match this search yet.
                </div>
              ) : null}
            </div>
          </div>
        </Panel>

        <Panel>
          <SectionTitle icon={FileText} eyebrow="Student details" title={selected?.studentName ?? "No applicant selected"} />
          {selected ? (
            <div className="mt-6 space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailCard label="Email" value={selected.studentEmail} />
                <DetailCard label="Phone" value={selected.phoneNumber} />
                <DetailCard label="Semester" value={`Sem ${selected.semester}`} />
                <DetailCard label="CGPA" value={selected.cgpa.toFixed(1)} />
                <DetailCard label="LinkedIn" value={selected.linkedinProfile || "Not added"} />
                <DetailCard label="GitHub" value={selected.githubProfile || "Not added"} />
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-[10px] uppercase tracking-[0.28em] text-white/35">Skills</div>
                <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-white/72">{selected.skills}</div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() =>
                    void openProtectedResource(selected.resumeUrl, {
                      fallbackName: selected.resumeFilename,
                    }).catch((error) => setStatus(error instanceof Error ? error.message : "Could not open resume"))
                  }
                  className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-xs uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-400/18"
                >
                  <FileText className="size-4" />
                  Open resume
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void openProtectedResource(`${selected.resumeUrl}?download=true`, {
                      download: true,
                      fallbackName: selected.resumeFilename,
                    }).catch((error) => setStatus(error instanceof Error ? error.message : "Could not save resume"))
                  }
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs uppercase tracking-[0.18em] text-white/65 transition hover:text-white"
                >
                  <FileText className="size-4" />
                  Save resume
                </button>
              </div>

              <form id="messages" onSubmit={sendSelection} className="rounded-3xl border border-white/10 bg-white/[0.035] p-4">
                <div className="text-[10px] uppercase tracking-[0.28em] text-white/35">Selection message</div>
                <input
                  value={opportunityTitle}
                  onChange={(event) => setOpportunityTitle(event.target.value)}
                  placeholder="this internship/job"
                  className="mt-4 w-full rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-fuchsia-300/35"
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-fuchsia-300/25 bg-fuchsia-400/12 px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-fuchsia-400/20 disabled:cursor-wait disabled:opacity-60"
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  {selected.status === "selected" ? "Resend selection" : "Send selection"}
                </button>
                {selected.selectionMessage ? (
                  <p className="mt-4 text-sm leading-6 text-white/55">{selected.selectionMessage}</p>
                ) : null}
              </form>
            </div>
          ) : (
            <EmptyState text="Select an eligible student to review the submitted placement form." />
          )}
        </Panel>
      </section>
    </div>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5 shadow-2xl backdrop-blur-2xl">{children}</div>;
}

function SectionTitle({ icon: Icon, eyebrow, title }: { icon: LucideIcon; eyebrow: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/10">
        <Icon className="size-4 text-white/70" />
      </span>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">{eyebrow}</div>
        <h2 className="truncate font-display text-2xl">{title}</h2>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint: string }) {
  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div className="text-[10px] uppercase tracking-[0.28em] text-white/40">{label}</div>
        <span className="grid size-10 place-items-center rounded-2xl bg-white/8">
          <Icon className="size-4 text-cyan-200" />
        </span>
      </div>
      <div className="mt-4 font-display text-4xl font-bold text-white">{value}</div>
      <div className="mt-2 text-sm text-white/45">{hint}</div>
    </Panel>
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

function ReadonlyLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">{label}</div>
      <div className="mt-1 break-words text-sm text-white/75">{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: PlacementApplication["status"] }) {
  const selected = status === "selected";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] ${
        selected
          ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-200"
          : "border-cyan-300/20 bg-cyan-400/10 text-cyan-100"
      }`}
    >
      <CheckCircle2 className="size-3.5" />
      {selected ? "Selected" : "Submitted"}
    </span>
  );
}

function Avatar({ value }: { value: string }) {
  return (
    <span className="grid size-11 shrink-0 place-items-center rounded-2xl text-sm font-semibold" style={{ background: "var(--grad-aurora)" }}>
      {value}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="mt-6 rounded-3xl border border-dashed border-white/15 bg-white/[0.02] px-5 py-10 text-center text-sm text-white/45">
      {text}
    </div>
  );
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
