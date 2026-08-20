import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { FileText, Loader2, Paperclip, Plus, Send, Upload, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ComplaintStageStrip } from "@/components/app/ComplaintStageStrip";
import { GlassCard, PageTransition } from "@/components/app/cinematic";
import {
  createStudentComplaint,
  getStudentComplaints,
  openProtectedResource,
  type ComplaintItem,
} from "@/lib/api";
import { getStoredDashboard, setStoredDashboard } from "@/lib/student-session";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/app/complaints")({ component: ComplaintsPage });

const COMPLAINT_CATEGORIES = [
  "Student Services",
  "Academic",
  "Hostel",
  "Library",
  "Fees",
  "Transport",
  "Technical",
  "Safety",
  "Other",
];

function formatDateTime(value: string | null) {
  if (!value) return "Pending";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString([], {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function proofLabel(size: number) {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

function ComplaintProofLinks({
  complaint,
  onError,
}: {
  complaint: ComplaintItem;
  onError: (message: string) => void;
}) {
  if (!complaint.attachments.length) return null;
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      {complaint.attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs text-white/70"
        >
          <Paperclip className="size-3.5 text-cyan-200" />
          <span className="max-w-[220px] truncate">{attachment.filename}</span>
          <span className="text-white/35">{proofLabel(attachment.size)}</span>
          <button
            type="button"
            onClick={() =>
              void openProtectedResource(attachment.url, { fallbackName: attachment.filename }).catch((proofError) =>
                onError(proofError instanceof Error ? proofError.message : "Could not open complaint proof"),
              )
            }
            className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 uppercase tracking-[0.16em] text-[10px] text-white/70 transition hover:text-white"
          >
            Open
          </button>
          <button
            type="button"
            onClick={() =>
              void openProtectedResource(`${attachment.url}?download=true`, {
                download: true,
                fallbackName: attachment.filename,
              }).catch((proofError) =>
                onError(proofError instanceof Error ? proofError.message : "Could not save complaint proof"),
              )
            }
            className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 uppercase tracking-[0.16em] text-[10px] text-white/70 transition hover:text-white"
          >
            Save
          </button>
        </div>
      ))}
    </div>
  );
}

function ComplaintsPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [complaints, setComplaints] = useState<ComplaintItem[]>(() => getStoredDashboard()?.complaint_items ?? []);
  const [loading, setLoading] = useState(() => !(getStoredDashboard()?.complaint_items?.length));
  const [openForm, setOpenForm] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(COMPLAINT_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [proofs, setProofs] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function syncDashboardComplaintSnapshot(nextComplaints: ComplaintItem[]) {
    const cachedDashboard = getStoredDashboard();
    if (!cachedDashboard) return;

    const latestComplaint = nextComplaints[0];
    const openComplaints = nextComplaints.filter((complaint) => complaint.status !== "resolved").length;
    const nonComplaintTimeline = cachedDashboard.request_timeline.filter((item) => item.kind !== "Complaint");

    const nextTimeline = latestComplaint
      ? [
          {
            title: latestComplaint.title,
            kind: "Complaint",
            stage: latestComplaint.statusLabel,
            updated: latestComplaint.created,
          },
          ...nonComplaintTimeline,
        ].slice(0, 3)
      : nonComplaintTimeline.slice(0, 3);

    const nextModuleHealth = cachedDashboard.module_health.map((item) =>
      item.module === "Complaints"
        ? {
            ...item,
            status: `${openComplaints} open`,
            detail: "Live request tracking",
          }
        : item,
    );

    setStoredDashboard({
      ...cachedDashboard,
      complaint_items: nextComplaints,
      request_timeline: nextTimeline,
      module_health: nextModuleHealth,
    });
  }

  async function loadComplaints() {
    const response = await getStudentComplaints();
    setComplaints(response.complaints);
    syncDashboardComplaintSnapshot(response.complaints);
  }

  useEffect(() => {
    let live = true;
    setLoading(true);
    loadComplaints()
      .catch((loadError) => {
        if (live) setError(loadError instanceof Error ? loadError.message : "Complaints could not be loaded");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  const openCount = useMemo(
    () => complaints.filter((complaint) => complaint.status !== "resolved").length,
    [complaints],
  );

  async function submitComplaint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setStatus(null);
    try {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("category", category);
      formData.append("description", description);
      for (const proof of proofs) formData.append("files", proof);
      const response = await createStudentComplaint(formData);
      setComplaints((current) => {
        const nextComplaints = [response.complaint, ...current];
        syncDashboardComplaintSnapshot(nextComplaints);
        return nextComplaints;
      });
      setTitle("");
      setCategory(COMPLAINT_CATEGORIES[0]);
      setDescription("");
      setProofs([]);
      setOpenForm(false);
      setStatus("Complaint submitted. Admin can now acknowledge and track it.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Complaint submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageTransition>
      <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
        <div>
          <div className={`text-[10px] uppercase tracking-[0.4em] font-bold mb-3 ${isDark ? "text-white/40" : "text-slate-500"}`}>Resolution</div>
          <h1 className={`font-display text-4xl md:text-5xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-950"}`}>Complaints</h1>
          <p className={`mt-3 max-w-2xl font-medium ${isDark ? "text-white/55" : "text-slate-700"}`}>
            Raise it once. Watch the full complaint timeline update from submitted to resolved.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`rounded-full border px-4 py-3 text-xs uppercase tracking-[0.18em] font-bold ${
            isDark
              ? "border-white/10 bg-white/[0.04] text-white/60"
              : "border-slate-300 bg-white text-slate-800 shadow-xs"
          }`}>
            {complaints.length} filed / {openCount} open
          </div>
          <button
            type="button"
            onClick={() => setOpenForm((current) => !current)}
            className="relative inline-flex items-center gap-2 px-6 py-3 rounded-full text-xs uppercase tracking-[0.2em] overflow-hidden text-white font-bold shadow-md"
          >
            <span className="absolute inset-0 rounded-full" style={{ background: "var(--grad-aurora)" }} />
            <span className={`absolute inset-px rounded-full ${isDark ? "bg-[#0a0a0a]/30" : "bg-emerald-950/20"}`} />
            {openForm ? <X className="relative z-10 size-4" /> : <Plus className="relative z-10 size-4" />}
            <span className="relative z-10">{openForm ? "Close form" : "New complaint"}</span>
          </button>
        </div>
      </div>

      {openForm ? (
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <GlassCard className={!isDark ? "bg-white/95 border-slate-200 shadow-sm" : ""}>
            <div className="flex items-start gap-4 mb-6">
              <div className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${isDark ? "bg-white/10" : "bg-indigo-50 border border-indigo-200"}`}>
                <FileText className={`size-5 ${isDark ? "text-cyan-200" : "text-indigo-600"}`} />
              </div>
              <div className="min-w-0">
                <div className={`text-[10px] uppercase tracking-[0.35em] font-bold ${isDark ? "text-white/40" : "text-slate-500"}`}>New complaint</div>
                <h2 className={`font-display text-[2rem] leading-none font-bold ${isDark ? "text-white" : "text-slate-950"}`}>Raise a complaint</h2>
                <p className={`mt-3 max-w-2xl text-sm font-medium ${isDark ? "text-white/55" : "text-slate-700"}`}>
                  Share the issue clearly, then attach proof files if you need to support it with image, video, PDF,
                  doc, audio, or any other format.
                </p>
              </div>
            </div>

            <form onSubmit={submitComplaint} className="grid gap-4">
              <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <label className="grid gap-2">
                  <span className={`text-[10px] uppercase tracking-[0.28em] font-bold ${isDark ? "text-white/40" : "text-slate-600"}`}>Complaint title</span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Library access, hostel issue, fee desk response..."
                    className={`rounded-2xl border px-4 py-3 text-sm outline-none transition ${
                      isDark
                        ? "border-white/10 bg-white/[0.06] text-white focus:border-cyan-200/40"
                        : "border-slate-300 bg-white text-slate-950 font-semibold focus:border-indigo-600 shadow-2xs"
                    }`}
                    required
                    minLength={3}
                    maxLength={180}
                  />
                </label>

                <label className="grid gap-2">
                  <span className={`text-[10px] uppercase tracking-[0.28em] font-bold ${isDark ? "text-white/40" : "text-slate-600"}`}>Category</span>
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    className={`rounded-2xl border px-4 py-3 text-sm outline-none transition ${
                      isDark
                        ? "border-white/10 bg-white/[0.06] text-white focus:border-fuchsia-200/40"
                        : "border-slate-300 bg-white text-slate-950 font-semibold focus:border-indigo-600 shadow-2xs"
                    }`}
                  >
                    {COMPLAINT_CATEGORIES.map((item) => (
                      <option key={item} value={item} style={{ backgroundColor: isDark ? "#101010" : "#ffffff", color: isDark ? "#ffffff" : "#0f172a" }}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="grid gap-2">
                <span className={`text-[10px] uppercase tracking-[0.28em] font-bold ${isDark ? "text-white/40" : "text-slate-600"}`}>Complaint details</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Write the full issue, what happened, and what outcome you need."
                  className={`min-h-[150px] rounded-[24px] border px-4 py-3 text-sm outline-none transition ${
                    isDark
                      ? "border-white/10 bg-white/[0.06] text-white focus:border-cyan-200/40"
                      : "border-slate-300 bg-white text-slate-950 font-semibold focus:border-indigo-600 shadow-2xs"
                  }`}
                  required
                  minLength={10}
                  maxLength={4000}
                />
              </label>

              <label className={`rounded-[24px] border border-dashed p-4 ${
                isDark ? "border-white/15 bg-white/[0.03]" : "border-slate-300 bg-slate-50/70"
              }`}>
                <input
                  type="file"
                  multiple
                  onChange={(event) => setProofs(Array.from(event.target.files ?? []))}
                  className="hidden"
                />
                <div className="flex flex-wrap items-center gap-4">
                  <div className={`flex size-12 items-center justify-center rounded-2xl ${isDark ? "bg-white/10" : "bg-indigo-50 border border-indigo-200"}`}>
                    <Upload className={`size-5 ${isDark ? "text-cyan-200" : "text-indigo-600"}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-950"}`}>Upload proofs</div>
                    <div className={`mt-1 text-xs font-medium ${isDark ? "text-white/45" : "text-slate-600"}`}>
                      Image, PDF, document, video, audio, or any supporting file.
                    </div>
                  </div>
                  <div className={`rounded-full border px-3 py-2 text-xs uppercase tracking-[0.18em] font-bold ${
                    isDark ? "border-white/10 bg-white/[0.04] text-white/65" : "border-slate-300 bg-white text-slate-800 shadow-2xs"
                  }`}>
                    {proofs.length ? `${proofs.length} selected` : "Choose files"}
                  </div>
                </div>
                {proofs.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {proofs.map((proof) => (
                      <div
                        key={`${proof.name}-${proof.size}`}
                        className={`rounded-full border px-3 py-2 text-xs font-semibold ${
                          isDark ? "border-white/10 bg-white/[0.05] text-white/70" : "border-slate-300 bg-white text-slate-800 shadow-2xs"
                        }`}
                      >
                        {proof.name}
                      </div>
                    ))}
                  </div>
                ) : null}
              </label>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className={`text-xs font-medium ${isDark ? "text-white/45" : "text-slate-600"}`}>
                  Submitted time is recorded automatically. Admin updates the next three stages.
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-xs uppercase tracking-[0.18em] text-white font-bold shadow-md disabled:cursor-wait disabled:opacity-60"
                  style={{ background: "var(--grad-aurora)" }}
                >
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  {submitting ? "Submitting..." : "Submit complaint"}
                </button>
              </div>
            </form>
          </GlassCard>
        </motion.div>
      ) : null}

      {status ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mb-5 inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold ${
            isDark ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100" : "border-emerald-300 bg-emerald-50 text-emerald-900 font-bold"
          }`}
        >
          {status}
        </motion.div>
      ) : null}

      {error ? (
        <div className={`mb-5 rounded-2xl border px-4 py-3 text-sm font-semibold ${
          isDark ? "border-rose-300/20 bg-rose-500/10 text-rose-100" : "border-rose-300 bg-rose-50 text-rose-900 font-bold"
        }`}>
          {error}
        </div>
      ) : null}

      <div className="space-y-5">
        {loading ? (
          <GlassCard className={!isDark ? "bg-white/95 border-slate-200 shadow-sm" : ""}>
            <div className={`flex items-center gap-3 text-sm font-medium ${isDark ? "text-white/55" : "text-slate-700"}`}>
              <Loader2 className="size-4 animate-spin text-cyan-600" />
              Complaint records are loading...
            </div>
          </GlassCard>
        ) : null}

        {!loading && complaints.length === 0 ? (
          <GlassCard className={!isDark ? "bg-white/95 border-slate-200 shadow-sm" : ""}>
            <div className={`rounded-[24px] border border-dashed px-5 py-10 text-center ${
              isDark ? "border-white/15 bg-white/[0.02]" : "border-slate-300 bg-slate-50/70"
            }`}>
              <div className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-950"}`}>No complaints submitted yet</div>
              <div className={`mt-2 text-sm font-medium ${isDark ? "text-white/45" : "text-slate-600"}`}>
                Open the form and file the first complaint whenever you need campus support.
              </div>
            </div>
          </GlassCard>
        ) : null}

        {complaints.map((complaint, index) => (
          <motion.div
            key={complaint.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
          >
            <GlassCard className={!isDark ? "bg-white/95 border-slate-200 shadow-sm" : ""}>
              <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
                <div>
                  <div className={`text-[10px] uppercase tracking-[0.3em] font-bold ${isDark ? "text-white/40" : "text-slate-500"}`}>
                    {complaint.complaintCode} / {complaint.category}
                  </div>
                  <div className={`font-display text-xl font-extrabold mt-1 ${isDark ? "text-white" : "text-slate-950"}`}>{complaint.title}</div>
                  <div className={`mt-3 max-w-3xl text-sm leading-6 font-medium ${isDark ? "text-white/55" : "text-slate-700"}`}>{complaint.description}</div>
                </div>
                <div className="text-right">
                  <div className={`rounded-full border px-3 py-2 text-[10px] uppercase tracking-[0.2em] font-bold ${
                    isDark ? "border-white/10 bg-white/[0.04] text-white/60" : "border-slate-300 bg-slate-100 text-slate-800"
                  }`}>
                    {complaint.statusLabel}
                  </div>
                  <div className={`mt-3 text-xs font-semibold ${isDark ? "text-white/45" : "text-slate-500"}`}>Submitted {formatDateTime(complaint.submittedAt)}</div>
                </div>
              </div>

              <ComplaintStageStrip complaint={complaint} />
              <ComplaintProofLinks complaint={complaint} onError={(message) => setError(message)} />
            </GlassCard>
          </motion.div>
        ))}
      </div>
    </PageTransition>
  );
}
