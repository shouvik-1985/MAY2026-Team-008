import { useEffect, useState, useMemo } from "react";
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
import {
  getStudentDashboard,
  submitStudentDigitalAssignment,
  submitStudentFileAssignment,
  type StudentDashboard,
} from "@/lib/api";
import { setStoredDashboard, useStudentDashboard } from "@/lib/student-session";

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
  const [digitalModalItem, setDigitalModalItem] = useState<Assignment | null>(null);
  const [aiReviewItem, setAiReviewItem] = useState<Assignment | null>(null);
  const [feedbackItem, setFeedbackItem] = useState<Assignment | null>(null);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [digitalAnswers, setDigitalAnswers] = useState<Record<string, string>>({});
  const [digitalNotes, setDigitalNotes] = useState("");

  // Upload Form State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submissionNotes, setSubmissionNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dynamic Timeline
  const [timelineItems, setTimelineItems] = useState<Array<{ t: string; l: string }>>([]);

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
  const hasFacultyFinalReview = (assignment: Assignment) =>
    Boolean(assignment.reviewFinalized || assignment.professorGrade || assignment.professorFeedback);
  const facultyGradedCount = currentAssignments.filter((a) => a.status === "graded" && hasFacultyFinalReview(a)).length;
  const aiReviewedCount = Math.max(0, gradedCount - facultyGradedCount);
  const nextDeadline = currentAssignments.find((a) => a.status !== "graded")?.due ?? "No deadline";
  const overallSummary = gradedCount
    ? facultyGradedCount
      ? `${facultyGradedCount} faculty graded`
      : `${aiReviewedCount} AI-reviewed, faculty pending`
    : "No graded assignments yet";

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  }

  const isBackendAssignment = (assignment: Assignment) => Boolean(assignment.sourceKind);
  const assignmentType = (assignment: Assignment) => assignment.assignmentType ?? "file";
  const reviewActionLabel = (assignment: Assignment) =>
    hasFacultyFinalReview(assignment) ? "View Faculty Feedback" : "View AI Review";
  const formatMarks = (score?: number | null, totalPoints?: number | null) =>
    typeof score === "number" ? `${score}/${totalPoints ?? 100}` : "Not published";

  useEffect(() => {
    void refreshAssignmentsFromDashboard();
  }, []);

  function openAssignment(assignment: Assignment) {
    if (assignmentType(assignment) === "file") {
      setUploadModalItem(assignment);
      return;
    }
    const answers = Object.fromEntries(
      (assignment.questions ?? []).map((question) => [question.id, ""]),
    );
    setDigitalAnswers(answers);
    setDigitalNotes("");
    setActiveQuestionIndex(0);
    setDigitalModalItem(assignment);
  }

  async function refreshAssignmentsFromDashboard() {
    const fresh = await getStudentDashboard();
    setStoredDashboard(fresh);
    setAssignmentList(fresh.assignment_items);
    return fresh.assignment_items;
  }

  async function openFeedback(assignment: Assignment) {
    setFeedbackItem(assignment);
    try {
      const latestAssignments = await refreshAssignmentsFromDashboard();
      setFeedbackItem(latestAssignments.find((item) => item.id === assignment.id) ?? assignment);
    } catch {
      setFeedbackItem(assignment);
    }
  }

  async function handleSubmitDigitalAssignment(e: React.FormEvent) {
    e.preventDefault();
    if (!digitalModalItem) return;

    setIsSubmitting(true);
    try {
      if (isBackendAssignment(digitalModalItem)) {
        const result = await submitStudentDigitalAssignment(digitalModalItem.id, {
          answers: digitalAnswers,
          notes: digitalNotes || undefined,
        });
        await refreshAssignmentsFromDashboard();
        setStatus(
          `AI reviewed "${digitalModalItem.title}" and assigned ${result.review.grade ?? "a grade"}. Professor can still correct it.`,
        );
      } else {
        const updated = currentAssignments.map((a) =>
          a.id === digitalModalItem.id
            ? { ...a, status: "graded" as const, progress: 100, grade: "AI Reviewed" }
            : a,
        );
        setAssignmentList(updated);
        setStatus(`AI reviewed "${digitalModalItem.title}" and saved your digital answers.`);
      }
      setTimelineItems([
        { t: "Just now", l: `Completed digital assignment: ${digitalModalItem.title}` },
        ...timelineItems,
      ]);
      setDigitalModalItem(null);
      setDigitalAnswers({});
      setDigitalNotes("");
      setTimeout(() => setStatus(null), 4500);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Digital assignment submission failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmitAssignment(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadModalItem) return;
    if (!selectedFile) {
      setStatus("Choose a PDF, DOC, or DOCX file before submitting.");
      return;
    }

    setIsSubmitting(true);
    if (isBackendAssignment(uploadModalItem)) {
      try {
        const formData = new FormData();
        formData.append("notes", submissionNotes);
        formData.append("file", selectedFile);
        const result = await submitStudentFileAssignment(uploadModalItem.id, formData);
        await refreshAssignmentsFromDashboard();
        setTimelineItems([
          { t: "Just now", l: `Submitted ${uploadModalItem.title} (${selectedFile.name})` },
          ...timelineItems,
        ]);
        setStatus(
          `AI reviewed "${uploadModalItem.title}" and assigned ${result.review.grade ?? "a grade"}. Professor can still correct it.`,
        );
        setUploadModalItem(null);
        setSelectedFile(null);
        setSubmissionNotes("");
        setTimeout(() => setStatus(null), 4500);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "File submission failed");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

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
            <Award className="size-3.5" /> {overallSummary}
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
            <div className="text-[10px] uppercase tracking-wider text-white/40">Submitted &amp; Reviewed</div>
            <div className="font-display text-xl font-bold">
              {facultyGradedCount
                ? `${facultyGradedCount} Faculty Graded`
                : `${aiReviewedCount} AI Reviewed`}
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-4 flex items-center gap-3">
          <div className="size-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
            <Clock className="size-5" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/40">Next Deadline</div>
            <div className="font-display text-xl font-bold text-amber-300">{nextDeadline}</div>
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
                  <StatusPill
                    status={a.status}
                    grade={
                      hasFacultyFinalReview(a)
                        ? a.professorGrade || a.grade
                        : a.aiGrade || a.grade
                    }
                    marks={
                      hasFacultyFinalReview(a)
                        ? formatMarks(a.professorScore, a.totalPoints)
                        : formatMarks(a.aiScore, a.totalPoints)
                    }
                    finalized={hasFacultyFinalReview(a)}
                  />
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
                    onClick={() => void openFeedback(a)}
                    className="text-xs uppercase tracking-wider text-emerald-300 hover:text-white inline-flex items-center gap-1.5 glass rounded-full px-4 py-2 border border-emerald-500/30 bg-emerald-500/10 transition"
                  >
                    <CheckCircle2 className="size-3.5" /> {reviewActionLabel(a)}
                  </button>
                ) : (
                  <button
                    onClick={() => openAssignment(a)}
                    className="text-xs uppercase tracking-wider font-bold text-white bg-[var(--grad-aurora)] hover:opacity-90 inline-flex items-center gap-2 rounded-full px-5 py-2 shadow-lg transition"
                  >
                    <Upload className="size-3.5" /> {assignmentType(a) === "file" ? "Upload Assignment" : "Start Assignment"}
                  </button>
                )}
              </div>
            </GlassCard>
          </motion.div>
        ))}
        {filteredAssignments.length === 0 && (
          <GlassCard className="lg:col-span-2 py-12 text-center">
            <div className="mx-auto mb-4 size-12 rounded-2xl border border-white/10 bg-white/5 text-white/45 flex items-center justify-center">
              <BookOpen className="size-5" />
            </div>
            <div className="font-display text-xl font-bold text-white">No assignments yet</div>
            <div className="mt-2 text-sm text-white/45">
              New AI-created assignments from your professor will appear here.
            </div>
          </GlassCard>
        )}
      </div>

      {/* Timeline Activity Log */}
      <GlassCard>
        <div className="text-[10px] uppercase tracking-[0.3em] text-white/40 font-bold">
          Submission Timeline &amp; Ledger
        </div>
        <div className="font-display text-xl font-bold mt-1 mb-5">Recent activity &amp; submissions</div>
        <div className="relative pl-6">
          <div className="absolute left-2 top-0 bottom-0 w-px bg-gradient-to-b from-white/30 via-white/10 to-transparent" />
          {timelineItems.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.03] px-5 py-8 text-center text-sm text-white/45">
              No assignment activity yet.
            </div>
          ) : (
            timelineItems.map((e, i) => (
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
            ))
          )}
        </div>
      </GlassCard>

      {/* Digital MCQ / Question Answer Modal */}
      <AnimatePresence>
        {digitalModalItem &&
          (() => {
            const questions = digitalModalItem.questions ?? [];
            const activeQuestion = questions[activeQuestionIndex];
            return (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setDigitalModalItem(null)}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
              >
                <motion.div
                  initial={{ scale: 0.95, y: 15 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.95, y: 15 }}
                  onClick={(event) => event.stopPropagation()}
                  className="flex h-[min(860px,calc(100vh-32px))] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-white/15 bg-[#090b10] text-white shadow-2xl"
                >
                  <div className="flex flex-col gap-3 border-b border-white/10 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.3em] text-emerald-400">
                        {digitalModalItem.assignmentType === "mcq" ? "MCQ assessment" : "Question answer assessment"}
                      </div>
                      <h3 className="mt-1 truncate font-display text-2xl font-bold">{digitalModalItem.title}</h3>
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto">
                      {questions.map((question, index) => (
                        <button
                          key={question.id}
                          type="button"
                          onClick={() => setActiveQuestionIndex(index)}
                          className={`grid size-9 shrink-0 place-items-center rounded-full border text-sm transition ${
                            activeQuestionIndex === index
                              ? "border-white/60 bg-white text-black"
                              : digitalAnswers[question.id]
                                ? "border-emerald-300/35 bg-emerald-400/10 text-emerald-100"
                                : "border-white/10 bg-white/[0.04] text-white/55"
                          }`}
                        >
                          {index + 1}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setDigitalModalItem(null)}
                        className="ml-1 grid size-9 shrink-0 place-items-center rounded-full bg-white/5 text-white/55 hover:text-white"
                        aria-label="Close assessment"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  </div>

                  <form onSubmit={handleSubmitDigitalAssignment} className="grid min-h-0 flex-1 lg:grid-cols-[0.82fr_1.18fr]">
                    <div className="min-h-0 overflow-y-auto border-b border-white/10 p-5 lg:border-b-0 lg:border-r">
                      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">
                          Source and criteria
                        </div>
                        <p className="mt-3 text-sm leading-6 text-white/70">
                          {digitalModalItem.instructions || "Complete the assignment inside CampusVerse."}
                        </p>
                        {digitalModalItem.sourceTitle && (
                          <div className="mt-4 rounded-2xl bg-black/20 p-3 text-xs text-white/50">
                            {digitalModalItem.sourceTitle}
                          </div>
                        )}
                      </div>

                      <div className="mt-4 space-y-2">
                        {(digitalModalItem.rubric ?? []).map((item) => (
                          <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-medium">{item.label}</div>
                              {typeof item.points === "number" && (
                                <div className="text-xs text-emerald-300">{item.points} pts</div>
                              )}
                            </div>
                            <div className="mt-1 text-xs text-white/45">{item.detail}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex min-h-0 flex-col">
                      <div className="min-h-0 flex-1 overflow-y-auto p-5">
                        {activeQuestion ? (
                          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
                              <div className="font-display text-xl">Question {activeQuestionIndex + 1}</div>
                              <div className="text-xs font-semibold text-white/50">
                                {activeQuestion.points ?? 0} marks
                              </div>
                            </div>
                            <p className="mt-5 text-sm leading-7 text-white/80">{activeQuestion.prompt}</p>

                            {digitalModalItem.assignmentType === "mcq" ? (
                              <div className="mt-6 space-y-3">
                                {(activeQuestion.options ?? []).map((option) => {
                                  const selected = digitalAnswers[activeQuestion.id] === option.id;
                                  return (
                                    <button
                                      key={option.id}
                                      type="button"
                                      onClick={() =>
                                        setDigitalAnswers((current) => ({
                                          ...current,
                                          [activeQuestion.id]: option.id,
                                        }))
                                      }
                                      className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition ${
                                        selected
                                          ? "border-cyan-300/40 bg-cyan-300/10 text-white"
                                          : "border-white/10 bg-black/20 text-white/65 hover:border-white/20 hover:text-white"
                                      }`}
                                    >
                                      <span className="grid size-7 shrink-0 place-items-center rounded-full border border-white/15 text-xs">
                                        {option.id}
                                      </span>
                                      <span className="text-sm leading-6">{option.text}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <textarea
                                value={digitalAnswers[activeQuestion.id] ?? ""}
                                onChange={(event) =>
                                  setDigitalAnswers((current) => ({
                                    ...current,
                                    [activeQuestion.id]: event.target.value,
                                  }))
                                }
                                rows={10}
                                placeholder="Write your answer here..."
                                className="mt-6 w-full resize-none rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white outline-none placeholder:text-white/30 focus:border-white/25"
                              />
                            )}
                          </div>
                        ) : (
                          <div className="grid min-h-[320px] place-items-center rounded-3xl border border-dashed border-white/15 text-sm text-white/45">
                            No generated questions found for this assignment.
                          </div>
                        )}

                        <textarea
                          value={digitalNotes}
                          onChange={(event) => setDigitalNotes(event.target.value)}
                          rows={3}
                          placeholder="Optional submission note..."
                          className="mt-4 w-full resize-none rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/25"
                        />
                      </div>

                      <div className="grid gap-3 border-t border-white/10 p-4 sm:grid-cols-3">
                        <button
                          type="button"
                          onClick={() => setActiveQuestionIndex((index) => Math.max(0, index - 1))}
                          disabled={activeQuestionIndex === 0}
                          className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/60 transition hover:text-white disabled:opacity-40"
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setActiveQuestionIndex((index) => Math.min(questions.length - 1, index + 1))
                          }
                          disabled={activeQuestionIndex >= questions.length - 1}
                          className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/60 transition hover:text-white disabled:opacity-40"
                        >
                          Next
                        </button>
                        <button
                          type="submit"
                          disabled={isSubmitting || questions.length === 0}
                          className="rounded-2xl px-4 py-3 text-sm font-bold uppercase tracking-[0.16em] text-white disabled:opacity-50"
                          style={{ background: "var(--grad-aurora)" }}
                        >
                          {isSubmitting ? "Submitting..." : "Submit assessment"}
                        </button>
                      </div>
                    </div>
                  </form>
                </motion.div>
              </motion.div>
            );
          })()}
      </AnimatePresence>

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

              {(uploadModalItem.instructions || (uploadModalItem.rubric ?? []).length > 0) && (
                <div className="glass rounded-2xl border border-white/10 p-4 text-xs text-white/70">
                  {uploadModalItem.instructions && (
                    <p className="leading-6">{uploadModalItem.instructions}</p>
                  )}
                  {(uploadModalItem.rubric ?? []).length > 0 && (
                    <div className="mt-3 grid gap-2">
                      {(uploadModalItem.rubric ?? []).map((item) => (
                        <div key={item.label} className="flex items-start justify-between gap-3 border-t border-white/10 pt-2 first:border-t-0 first:pt-0">
                          <span>{item.label}</span>
                          <span className="text-emerald-300">{item.points ?? 0} pts</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <form onSubmit={handleSubmitAssignment} className="space-y-4">
                {/* File Dropzone */}
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/50 font-medium">
                    Upload Solution File (.pdf, .doc, .docx)
                  </label>
                  <div className="mt-1.5 border-2 border-dashed border-white/20 hover:border-emerald-400/50 rounded-2xl p-6 text-center transition cursor-pointer glass relative">
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx"
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
                        <div className="text-[10px] text-white/40 mt-1">Supports PDF and Word documents</div>
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
                  <div className="text-[10px] uppercase tracking-wider text-white/40">
                    {aiReviewItem.status === "graded"
                      ? hasFacultyFinalReview(aiReviewItem)
                        ? "Final Grade"
                        : "AI Grade"
                      : "Assignment Type"}
                  </div>
                  <div className="font-display text-2xl font-bold text-purple-300 mt-1">
                    {aiReviewItem.status === "graded"
                      ? aiReviewItem.professorGrade || aiReviewItem.aiGrade || aiReviewItem.grade || "Pending"
                      : assignmentType(aiReviewItem) === "qa"
                        ? "Q&A"
                        : assignmentType(aiReviewItem).toUpperCase()}
                  </div>
                </div>
                <div className="glass p-4 rounded-2xl border border-emerald-500/20">
                  <div className="text-[10px] uppercase tracking-wider text-white/40">
                    {hasFacultyFinalReview(aiReviewItem) ? "Final Marks" : "AI Score"}
                  </div>
                  <div className="font-display text-2xl font-bold text-emerald-400 mt-1">
                    {hasFacultyFinalReview(aiReviewItem)
                      ? formatMarks(aiReviewItem.professorScore, aiReviewItem.totalPoints)
                      : typeof aiReviewItem.aiScore === "number"
                        ? formatMarks(aiReviewItem.aiScore, aiReviewItem.totalPoints)
                        : `${aiReviewItem.totalPoints ?? 100} pts`}
                  </div>
                </div>
              </div>

              <div className="glass p-5 rounded-2xl border border-white/10 space-y-3 text-xs text-white/80">
                <div className="font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-400" /> AI guidance:
                </div>
                <p className="leading-relaxed text-white/70">
                  {aiReviewItem.aiFeedback ||
                    aiReviewItem.instructions ||
                    "CampusVerse AI generated this task from the selected professor material and will review your submission automatically."}
                </p>

                <div className="font-bold text-white flex items-center gap-2 pt-2 border-t border-white/10">
                  <AlertCircle className="size-4 text-amber-400" /> Rubric focus:
                </div>
                <div className="grid gap-2">
                  {(aiReviewItem.rubric ?? []).map((item) => (
                    <div key={item.label} className="flex items-start justify-between gap-3">
                      <span>{item.label}</span>
                      <span className="text-amber-200">{item.points ?? 0} pts</span>
                    </div>
                  ))}
                  {(aiReviewItem.rubric ?? []).length === 0 && (
                    <p className="leading-relaxed text-white/70">
                      Follow the professor criteria and submit complete work before the deadline.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => {
                    setAiReviewItem(null);
                    openAssignment(aiReviewItem);
                  }}
                  className="bg-[var(--grad-aurora)] px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white shadow-lg flex items-center gap-2 hover:opacity-90"
                >
                  {aiReviewItem.status === "graded" ? "Open Assignment" : "Proceed to Submission"} <ArrowRight className="size-3.5" />
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
              className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-emerald-500/30 bg-[#11131a] p-7 text-white relative shadow-2xl space-y-5"
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
                  {hasFacultyFinalReview(feedbackItem)
                    ? "Faculty Evaluation & Rubric Ledger"
                    : "AI Review - Faculty Final Grade Pending"}
                </span>
              </div>

              <div>
                <h3 className="font-display text-2xl font-bold">{feedbackItem.title}</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-purple-400/20 bg-purple-400/10 p-3">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-white/40">AI marks / grade</div>
                    <div className="mt-1 font-display text-xl text-white">
                      {formatMarks(feedbackItem.aiScore, feedbackItem.totalPoints)} / {feedbackItem.aiGrade || "Pending"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-white/40">Professor marks / grade</div>
                    <div className="mt-1 font-display text-xl text-white">
                      {hasFacultyFinalReview(feedbackItem)
                        ? `${formatMarks(feedbackItem.professorScore, feedbackItem.totalPoints)} / ${feedbackItem.professorGrade || feedbackItem.grade || "Pending"}`
                        : "Final review pending"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="glass p-5 rounded-2xl border border-white/10 space-y-3 text-xs text-white/80">
                <div className="font-bold text-white">
                  {hasFacultyFinalReview(feedbackItem) ? "Professor Comment:" : "AI Review Comment:"}
                </div>
                <p className="italic leading-relaxed text-white/70">
                  "{hasFacultyFinalReview(feedbackItem)
                    ? feedbackItem.professorFeedback || "No professor feedback was added."
                    : feedbackItem.aiFeedback || "AI review completed. Professor can update the final grade if needed."}"
                </p>
                {hasFacultyFinalReview(feedbackItem) && feedbackItem.aiFeedback && (
                  <div className="rounded-2xl border border-purple-300/20 bg-purple-300/10 p-3">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-purple-100/70">Original AI feedback</div>
                    <p className="mt-2 leading-5 text-white/65">{feedbackItem.aiFeedback}</p>
                  </div>
                )}
                {!hasFacultyFinalReview(feedbackItem) && (
                  <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3 text-amber-100">
                    This is an automatic AI review. Your professor can still correct the grade and publish final feedback.
                  </div>
                )}

                <div className="pt-3 border-t border-white/10 space-y-2">
                  <div className="flex justify-between gap-3">
                    <span>AI score</span>
                    <span className="font-bold text-emerald-400">
                      {formatMarks(feedbackItem.aiScore, feedbackItem.totalPoints)}
                    </span>
                  </div>
                  {hasFacultyFinalReview(feedbackItem) && (
                    <div className="flex justify-between gap-3">
                      <span>Professor score</span>
                      <span className="font-bold text-emerald-400">
                        {formatMarks(feedbackItem.professorScore, feedbackItem.totalPoints)}
                      </span>
                    </div>
                  )}
                  {(feedbackItem.aiReview?.criteria ?? []).map((criterion) => (
                    <div key={`${criterion.label}-${criterion.detail}`} className="flex justify-between gap-3">
                      <span>{criterion.label}</span>
                      <span className="text-right font-bold text-emerald-400">{criterion.detail}</span>
                    </div>
                  ))}
                  {(feedbackItem.rubric ?? []).map((item) => (
                    <div key={item.label} className="flex justify-between gap-3">
                      <span>{item.label}</span>
                      <span className="font-bold text-emerald-400">{item.points ?? 0} pts</span>
                    </div>
                  ))}
                  {(feedbackItem.rubric ?? []).length === 0 && (
                    <div className="flex justify-between gap-3">
                      <span>AI score</span>
                      <span className="font-bold text-emerald-400">
                        {typeof feedbackItem.aiScore === "number"
                          ? formatMarks(feedbackItem.aiScore, feedbackItem.totalPoints)
                          : "Reviewed"}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  onClick={() => {
                    const gradeSource = hasFacultyFinalReview(feedbackItem) ? "Faculty Final Grade" : "AI Suggested Grade";
                    const marks =
                      hasFacultyFinalReview(feedbackItem) && typeof feedbackItem.professorScore === "number"
                        ? formatMarks(feedbackItem.professorScore, feedbackItem.totalPoints)
                        : typeof feedbackItem.aiScore === "number"
                          ? formatMarks(feedbackItem.aiScore, feedbackItem.totalPoints)
                          : "Pending";
                    const professorFeedback = hasFacultyFinalReview(feedbackItem)
                      ? feedbackItem.professorFeedback || "No professor feedback was added."
                      : "Faculty final review pending.";
                    const text = `ASSIGNMENT SUBMISSION RECEIPT\nTitle: ${feedbackItem.title}\nMarks: ${marks}\n${gradeSource}: ${feedbackItem.professorGrade || feedbackItem.aiGrade || feedbackItem.grade || "Pending"}\nProfessor Feedback: ${professorFeedback}\nAI Feedback: ${feedbackItem.aiFeedback || "Reviewed by CampusVerse AI"}`;
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

function StatusPill({
  status,
  grade,
  marks,
  finalized = false,
}: {
  status: string;
  grade?: string | null;
  marks?: string;
  finalized?: boolean;
}) {
  if (status === "graded")
    return (
      <span
        className="text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-[0.15em] border border-emerald-500/30"
        style={{ background: "oklch(0.6 0.2 150 / 0.2)", color: "oklch(0.85 0.18 150)" }}
      >
        <CheckCircle2 className="inline size-3 mr-1" />
        {finalized ? "Faculty" : "AI"} {grade || "Submitted"}
        {marks && marks !== "Not published" ? ` (${marks})` : ""}
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
