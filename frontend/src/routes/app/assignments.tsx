import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  Clock,
  CheckCircle2,
  Sparkles,
  Search,
  X,
  Award,
  AlertCircle,
  FileCode,
  Download,
  BookOpen,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { GlassCard, PageTransition, SectionHeading } from "@/components/app/cinematic";
import { type StudentDashboard } from "@/lib/api";
import { useStudentDashboard } from "@/lib/student-session";

export const Route = createFileRoute("/app/assignments")({ component: AssignmentsPage });

type Assignment = StudentDashboard["assignment_items"][number];

function AssignmentsPage() {
  const { dashboard } = useStudentDashboard();
  const rawAssignments = dashboard?.assignment_items ?? [];
  const [assignmentList, setAssignmentList] = useState<Assignment[]>(rawAssignments);
  
  const currentAssignments = assignmentList.length ? assignmentList : rawAssignments;

  const [status, setStatus] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals state
  const [uploadModalItem, setUploadModalItem] = useState<Assignment | null>(null);
  const [aiReviewItem, setAiReviewItem] = useState<Assignment | null>(null);
  const [feedbackItem, setFeedbackItem] = useState<Assignment | null>(null);

  // Upload Form State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submissionNotes, setSubmissionNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dynamic Timeline
  const [timelineItems, setTimelineItems] = useState<Array<{ t: string; l: string }>>([
    { t: "Today", l: "Shruti's Research Brief is 80% complete" },
    { t: "2 days ago", l: "Distributed Systems Lab is 65% complete" },
    { t: "3 days ago", l: "Academic Writing Checkpoint is 30% complete" },
    { t: "4 days ago", l: "Semester Portfolio Review graded A" },
  ]);

  const filteredAssignments = useMemo(() => {
    return currentAssignments.filter((a) => {
      const matchesSearch =
        a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.subject.toLowerCase().includes(searchQuery.toLowerCase());

      if (filterCat === "In Progress") return a.status === "ongoing" && matchesSearch;
      if (filterCat === "Completed") return a.status === "graded" && matchesSearch;
      if (filterCat === "Not Started") return a.status === "pending" && matchesSearch;
      return matchesSearch;
    });
  }, [currentAssignments, searchQuery, filterCat]);

  // Analytics Metrics
  const activeCount = currentAssignments.filter((a) => a.status === "ongoing" || a.status === "pending").length;
  const gradedCount = currentAssignments.filter((a) => a.status === "graded").length;

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  }

  function handleSubmitAssignment(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadModalItem) return;

    setIsSubmitting(true);
    setTimeout(() => {
      const updated = currentAssignments.map((a) =>
        a.id === uploadModalItem.id
          ? { ...a, status: "graded" as const, progress: 100, grade: "Submitted (Awaiting Grade)" }
          : a
      );
      setAssignmentList(updated);

      setTimelineItems([
        { t: "Just now", l: `Submitted ${uploadModalItem.title} (${selectedFile?.name || "Assignment_Submission.pdf"})` },
        ...timelineItems,
      ]);

      setStatus(`✓ Successfully submitted "${uploadModalItem.title}"! Verified & timestamped.`);
      setUploadModalItem(null);
      setSelectedFile(null);
      setSubmissionNotes("");
      setIsSubmitting(false);
      setTimeout(() => setStatus(null), 4000);
    }, 1200);
  }

  return (
    <PageTransition>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <SectionHeading
          eyebrow="Academic Workspace"
          title="Assignments & Coursework"
          sub="Track, draft, AI-review, and submit assignments seamlessly."
        />

        <div className="flex items-center gap-2 self-start md:self-auto">
          <div className="glass px-4 py-2 rounded-full text-xs font-semibold text-emerald-400 border border-emerald-500/30 flex items-center gap-2">
            <Award className="size-3.5" /> Overall Average: 94.5% (Grade A)
          </div>
        </div>
      </div>

      {status && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 glass rounded-2xl border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-2"
        >
          <ShieldCheck className="size-4 shrink-0 text-emerald-400" />
          <span>{status}</span>
        </motion.div>
      )}

      {/* Top Analytics Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <GlassCard className="p-4 flex items-center gap-3">
          <div className="size-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
            <BookOpen className="size-5" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/40">Active Tasks</div>
            <div className="font-display text-xl font-bold">{activeCount} Pending</div>
          </div>
        </GlassCard>

        <GlassCard className="p-4 flex items-center gap-3">
          <div className="size-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="size-5" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/40">Completed &amp; Graded</div>
            <div className="font-display text-xl font-bold">{gradedCount} Graded (A)</div>
          </div>
        </GlassCard>

        <GlassCard className="p-4 flex items-center gap-3">
          <div className="size-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
            <Clock className="size-5" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/40">Next Deadline</div>
            <div className="font-display text-xl font-bold text-amber-300">Tomorrow</div>
          </div>
        </GlassCard>

        <GlassCard className="p-4 flex items-center gap-3">
          <div className="size-10 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
            <Sparkles className="size-5" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/40">AI Review Suite</div>
            <div className="font-display text-xl font-bold text-purple-300">Active &amp; Ready</div>
          </div>
        </GlassCard>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row gap-3 mb-8">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-white/40" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search assignments by title or subject..."
            className="w-full glass rounded-full pl-11 pr-4 py-2.5 text-sm placeholder-white/30 focus:outline-none focus:border-white/30"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {["All", "In Progress", "Completed", "Not Started"].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCat(cat)}
              className={`px-4 py-2 rounded-full text-xs uppercase tracking-[0.15em] transition whitespace-nowrap ${
                filterCat === cat
                  ? "bg-[var(--grad-aurora)] text-white font-semibold shadow-lg"
                  : "text-white/50 hover:text-white glass"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Assignments Card Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-10">
        {filteredAssignments.map((a, i) => (
          <motion.div
            key={a.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <GlassCard hover className="h-full flex flex-col justify-between relative overflow-hidden">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.3em] font-bold text-emerald-400">
                      {a.subject}
                    </div>
                    <div className="font-display text-xl font-bold mt-1 text-white">{a.title}</div>
                  </div>
                  <StatusPill status={a.status} grade={a.grade} />
                </div>

                <div className="mt-4 flex items-center justify-between gap-2 text-xs text-white/55">
                  <span className="flex items-center gap-1.5"><Clock className="size-3.5 text-amber-400" /> Due: {a.due}</span>
                  <button
                    onClick={() => setAiReviewItem(a)}
                    className="text-[11px] font-semibold text-purple-300 bg-purple-500/10 border border-purple-500/30 px-3 py-1 rounded-full hover:bg-purple-500/20 transition flex items-center gap-1"
                  >
                    <Sparkles className="size-3" /> AI Review Draft
                  </button>
                </div>

                <div className="mt-4 h-2 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${a.progress}%` }}
                    transition={{ duration: 1 }}
                    className="h-full"
                    style={{ background: "var(--grad-aurora)" }}
                  />
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
                <div className="text-xs text-white/45 font-medium">{a.progress}% complete</div>
                
                {a.status === "graded" ? (
                  <button
                    onClick={() => setFeedbackItem(a)}
                    className="text-xs uppercase tracking-wider text-emerald-300 hover:text-white inline-flex items-center gap-1.5 glass rounded-full px-4 py-2 border border-emerald-500/30 bg-emerald-500/10 transition"
                  >
                    <CheckCircle2 className="size-3.5" /> View Faculty Feedback
                  </button>
                ) : (
                  <button
                    onClick={() => setUploadModalItem(a)}
                    className="text-xs uppercase tracking-wider font-bold text-white bg-[var(--grad-aurora)] hover:opacity-90 inline-flex items-center gap-2 rounded-full px-5 py-2 shadow-lg transition"
                  >
                    <Upload className="size-3.5" /> {a.status === "pending" ? "Start Assignment" : "Upload File"}
                  </button>
                )}
              </div>
            </GlassCard>
          </motion.div>
        ))}
      </div>

      {/* Timeline Activity Log */}
      <GlassCard>
        <div className="text-[10px] uppercase tracking-[0.3em] text-white/40 font-bold">
          Submission Timeline &amp; Ledger
        </div>
        <div className="font-display text-xl font-bold mt-1 mb-5">Recent activity &amp; submissions</div>
        <div className="relative pl-6">
          <div className="absolute left-2 top-0 bottom-0 w-px bg-gradient-to-b from-white/30 via-white/10 to-transparent" />
          {timelineItems.map((e, i) => (
            <motion.div
              key={`${e.t}-${i}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="relative pb-5"
            >
              <span
                className="absolute -left-[18px] top-1.5 size-2.5 rounded-full"
                style={{ background: "var(--grad-aurora)" }}
              />
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">{e.t}</div>
              <div className="text-sm text-white/80 font-medium">{e.l}</div>
            </motion.div>
          ))}
        </div>
      </GlassCard>

      {/* Upload / Submission Modal */}
      <AnimatePresence>
        {uploadModalItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setUploadModalItem(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-3xl border border-white/15 bg-[#11131a] p-7 text-white relative shadow-2xl space-y-5"
            >
              <button
                onClick={() => setUploadModalItem(null)}
                className="absolute top-6 right-6 text-white/50 hover:text-white glass p-2 rounded-full transition"
              >
                <X className="size-5" />
              </button>

              <div>
                <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold">
                  {uploadModalItem.subject}
                </span>
                <h3 className="font-display text-2xl font-bold mt-0.5">{uploadModalItem.title}</h3>
                <p className="text-xs text-white/50 mt-1">Due: {uploadModalItem.due}</p>
              </div>

              <form onSubmit={handleSubmitAssignment} className="space-y-4">
                {/* File Dropzone */}
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/50 font-medium">
                    Upload Solution File (.pdf, .zip, .docx, .py)
                  </label>
                  <div className="mt-1.5 border-2 border-dashed border-white/20 hover:border-emerald-400/50 rounded-2xl p-6 text-center transition cursor-pointer glass relative">
                    <input
                      type="file"
                      onChange={handleFileSelect}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <Upload className="size-8 mx-auto text-emerald-400 mb-2" />
                    {selectedFile ? (
                      <div className="text-xs text-emerald-300 font-semibold flex items-center justify-center gap-2">
                        <FileCode className="size-4" /> {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                      </div>
                    ) : (
                      <>
                        <div className="text-xs font-semibold text-white/80">Click or drag &amp; drop file here</div>
                        <div className="text-[10px] text-white/40 mt-1">Supports PDF, ZIP, Python, and Word documents</div>
                      </>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/50 font-medium">
                    Submission Notes for Faculty / TA
                  </label>
                  <textarea
                    rows={3}
                    value={submissionNotes}
                    onChange={(e) => setSubmissionNotes(e.target.value)}
                    placeholder="Include relevant notes, repository links, or execution instructions..."
                    className="w-full glass rounded-xl p-3 text-xs bg-transparent text-white outline-none mt-1"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setUploadModalItem(null)}
                    className="glass px-5 py-2.5 rounded-full text-xs text-white/60 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="bg-[var(--grad-aurora)] px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white shadow-lg hover:opacity-90"
                  >
                    {isSubmitting ? "Submitting..." : "Submit Assignment"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Review Draft Modal */}
      <AnimatePresence>
        {aiReviewItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setAiReviewItem(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl rounded-3xl border border-purple-500/30 bg-[#11131a] p-7 text-white relative shadow-2xl space-y-5"
            >
              <button
                onClick={() => setAiReviewItem(null)}
                className="absolute top-6 right-6 text-white/50 hover:text-white glass p-2 rounded-full transition"
              >
                <X className="size-5" />
              </button>

              <div className="flex items-center gap-2">
                <Sparkles className="size-5 text-purple-400" />
                <span className="text-xs uppercase tracking-widest font-bold text-purple-300">
                  AI Review Assistant &bull; CampusVerse AI
                </span>
              </div>

              <div>
                <h3 className="font-display text-2xl font-bold">{aiReviewItem.title}</h3>
                <p className="text-xs text-white/50 mt-1">Draft Evaluation &amp; Grade Predictor</p>
              </div>

              {/* AI Score Cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="glass p-4 rounded-2xl border border-purple-500/20">
                  <div className="text-[10px] uppercase tracking-wider text-white/40">Predicted Grade</div>
                  <div className="font-display text-2xl font-bold text-purple-300 mt-1">A+ (95/100)</div>
                </div>
                <div className="glass p-4 rounded-2xl border border-emerald-500/20">
                  <div className="text-[10px] uppercase tracking-wider text-white/40">Originality Score</div>
                  <div className="font-display text-2xl font-bold text-emerald-400 mt-1">100% Original</div>
                </div>
              </div>

              <div className="glass p-5 rounded-2xl border border-white/10 space-y-3 text-xs text-white/80">
                <div className="font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-400" /> Key Strengths Identified:
                </div>
                <p className="leading-relaxed text-white/70">
                  • Excellent research depth and architectural modularity.<br />
                  • Clean code design adhering to PEP 8 standards with zero syntax errors.
                </p>

                <div className="font-bold text-white flex items-center gap-2 pt-2 border-t border-white/10">
                  <AlertCircle className="size-4 text-amber-400" /> Recommendation for Full Marks (100%):
                </div>
                <p className="leading-relaxed text-white/70">
                  Add inline docstrings to methods in module 3 and include a benchmark timing log to secure top credit.
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => {
                    setAiReviewItem(null);
                    setUploadModalItem(aiReviewItem);
                  }}
                  className="bg-[var(--grad-aurora)] px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white shadow-lg flex items-center gap-2 hover:opacity-90"
                >
                  Proceed to Submission <ArrowRight className="size-3.5" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Faculty Feedback Modal */}
      <AnimatePresence>
        {feedbackItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setFeedbackItem(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl rounded-3xl border border-emerald-500/30 bg-[#11131a] p-7 text-white relative shadow-2xl space-y-5"
            >
              <button
                onClick={() => setFeedbackItem(null)}
                className="absolute top-6 right-6 text-white/50 hover:text-white glass p-2 rounded-full transition"
              >
                <X className="size-5" />
              </button>

              <div className="flex items-center gap-2">
                <Award className="size-5 text-emerald-400" />
                <span className="text-xs uppercase tracking-widest font-bold text-emerald-300">
                  Faculty Evaluation &amp; Rubric Ledger
                </span>
              </div>

              <div>
                <h3 className="font-display text-2xl font-bold">{feedbackItem.title}</h3>
                <p className="text-xs text-emerald-400 font-semibold mt-1">Conferred Grade: A (94/100)</p>
              </div>

              <div className="glass p-5 rounded-2xl border border-white/10 space-y-3 text-xs text-white/80">
                <div className="font-bold text-white">Prof. Evaluation Comment:</div>
                <p className="italic leading-relaxed text-white/70">
                  "Exceptional research depth and clean module design, Shruti! Your distributed systems implementation demonstrated excellent concurrency safety and thorough documentation."
                </p>

                <div className="pt-3 border-t border-white/10 space-y-2">
                  <div className="flex justify-between"><span>Code Architecture &amp; Logic</span><span className="font-bold text-emerald-400">25 / 25</span></div>
                  <div className="flex justify-between"><span>Documentation &amp; Comments</span><span className="font-bold text-emerald-400">23 / 25</span></div>
                  <div className="flex justify-between"><span>System Performance &amp; Tests</span><span className="font-bold text-emerald-400">24 / 25</span></div>
                  <div className="flex justify-between"><span>Research Depth</span><span className="font-bold text-emerald-400">22 / 25</span></div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  onClick={() => {
                    const text = `ASSIGNMENT SUBMISSION RECEIPT\nTitle: ${feedbackItem.title}\nStudent: Shruti Tiwari\nGrade: A (94/100)\nEvaluated by: Faculty Senate`;
                    const blob = new Blob([text], { type: "text/plain" });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `Submission_${feedbackItem.title.replace(/\s+/g, "_")}.txt`;
                    link.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="glass px-4 py-2 rounded-full text-xs font-medium text-white/80 hover:text-white flex items-center gap-1.5"
                >
                  <Download className="size-3.5" /> Download Receipt
                </button>

                <button
                  onClick={() => setFeedbackItem(null)}
                  className="bg-[var(--grad-aurora)] px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wider text-white shadow-lg"
                >
                  Close Feedback
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}

function StatusPill({ status, grade }: { status: string; grade?: string }) {
  if (status === "graded")
    return (
      <span
        className="text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-[0.15em] border border-emerald-500/30"
        style={{ background: "oklch(0.6 0.2 150 / 0.2)", color: "oklch(0.85 0.18 150)" }}
      >
        <CheckCircle2 className="inline size-3 mr-1" />
        Grade {grade || "A"}
      </span>
    );
  if (status === "pending")
    return (
      <span className="text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-[0.15em] bg-white/5 text-white/55 border border-white/10">
        Not Started
      </span>
    );
  return (
    <span
      className="text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-[0.15em] border border-purple-500/30"
      style={{ background: "oklch(0.72 0.27 350 / 0.2)", color: "oklch(0.85 0.18 350)" }}
    >
      In Progress
    </span>
  );
}
