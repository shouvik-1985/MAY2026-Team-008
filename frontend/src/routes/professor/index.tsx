import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import {
  AlertTriangle,
  Ban,
  BarChart3,
  BookOpen,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Download,
  Edit3,
  Eye,
  FileText,
  GraduationCap,
  History,
  Mail,
  Megaphone,
  Phone,
  MapPin,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Upload,
  UserCheck,
  Users,
  X,
  XCircle,
} from "lucide-react";
import {
  confirmProfessorAttendance,

  createProfessorAssignment,
  createProfessorResource,
  deleteProfessorResource,
  finalizeProfessorAttendance,
  getProfessorDashboard,
  markProfessorAttendance,
  openProtectedResource,
  resolveResourceUrl,
  reviewProfessorAssignment,
  updateProfessorAssignmentSubmissionReview,
  updateStudentBlock,
  updateProfessorProfile,
  updateProfessorAvatar,
  type AssignmentType,
  type ProfessorDashboard,
} from "@/lib/api";
import { getStoredUser, setStoredUser } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { ConnectHub } from "@/components/connect/ConnectHub";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getStoredProfessorProfile,
  professorInitialsFromName,
  setStoredProfessorProfile,
  type EditableProfessorProfile,
} from "@/lib/professor-profile";
import { STUDY_SUBJECTS } from "@/lib/subjects";

export const Route = createFileRoute("/professor/")({
  component: ProfessorDashboardPage,
});

type ProfessorStudent = ProfessorDashboard["students"][number];
type ReviewQueueItem = ProfessorDashboard["review_queue"][number];
type AssignmentSubmissionItem = ProfessorDashboard["assignment_submissions"][number];
type ReviewLikeItem = ReviewQueueItem | AssignmentSubmissionItem;
type PublishedAssignment = ProfessorDashboard["assignments"][number];
type AssignmentDetailView =
  | { kind: "submission"; item: ReviewLikeItem }
  | { kind: "assignment"; item: PublishedAssignment };
type AttendanceStatus = "present" | "absent";
type AssignmentSourceKind = "resources" | "syllabus" | "content";
const GRADE_CRITERIA = [
  { code: "S", cutoff: 90 },
  { code: "A", cutoff: 80 },
  { code: "B", cutoff: 70 },
  { code: "C", cutoff: 60 },
  { code: "D", cutoff: 50 },
  { code: "E", cutoff: 40 },
  { code: "U", cutoff: 0 },
];
const GRADE_OPTIONS = ["S", "A", "B", "C", "D", "E", "U", "P", "F", "W", "I"];

function gradeCodeFromScore(score: number) {
  const normalized = Math.max(0, Math.min(100, score));
  return GRADE_CRITERIA.find((item) => normalized >= item.cutoff)?.code ?? "U";
}

function gradeCodeFromMarks(marks: number, totalPoints = 100) {
  return gradeCodeFromScore((marks / Math.max(1, totalPoints)) * 100);
}

function parseSubmittedAt(item: ReviewLikeItem) {
  return "submittedAt" in item && typeof item.submittedAt === "string"
    ? Date.parse(item.submittedAt) || 0
    : 0;
}

const PROFESSOR_SECTIONS = [
  "dashboard",
  "students",
  "academics",
  "announcements",
  "resources",
  "reviews",
  "profile",
  "connect",
] as const;
type ProfessorSection = (typeof PROFESSOR_SECTIONS)[number];

function normalizeProfessorSection(hash: string): ProfessorSection {
  const candidate = hash.replace("#", "") as ProfessorSection;
  return PROFESSOR_SECTIONS.includes(candidate) ? candidate : "dashboard";
}

function ProfessorDashboardPage() {
  const [dashboard, setDashboard] = useState<ProfessorDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [attendanceStatus, setAttendanceStatus] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<ProfessorSection>(() =>
    normalizeProfessorSection(typeof window === "undefined" ? "" : window.location.hash),
  );
  const [studentQuery, setStudentQuery] = useState("");
  const [academicTab, setAcademicTab] = useState<"attendance" | "cgpa">("attendance");
  const [showAttendanceHistory, setShowAttendanceHistory] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const [resourceSubject, setResourceSubject] = useState(STUDY_SUBJECTS[0]);
  const [resourceFile, setResourceFile] = useState<File | null>(null);
  const [resourceFileKey, setResourceFileKey] = useState(0);
  const [resourceSearch, setResourceSearch] = useState("");
  const [resourceSubjectFilter, setResourceSubjectFilter] = useState("");
  const [resourceDateFilter, setResourceDateFilter] = useState("");

  const [reviewStudentId, setReviewStudentId] = useState("");
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewSubject, setReviewSubject] = useState("");
  const [reviewScore, setReviewScore] = useState("");
  const [reviewGrade, setReviewGrade] = useState("");
  const [reviewFeedback, setReviewFeedback] = useState("");
  const [reviewSubmissionId, setReviewSubmissionId] = useState<number | null>(null);
  const [assignmentDetailView, setAssignmentDetailView] = useState<AssignmentDetailView | null>(null);

  const [assignmentType, setAssignmentType] = useState<AssignmentType>("mcq");
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [assignmentSubject, setAssignmentSubject] = useState(STUDY_SUBJECTS[0]);
  const [assignmentSourceKind, setAssignmentSourceKind] = useState<AssignmentSourceKind>("resources");
  const [assignmentResourceIds, setAssignmentResourceIds] = useState<number[]>([]);
  const [assignmentSyllabus, setAssignmentSyllabus] = useState("");
  const [assignmentContent, setAssignmentContent] = useState("");
  const [assignmentDueLabel, setAssignmentDueLabel] = useState("in 7 days");
  const [assignmentQuestionCount, setAssignmentQuestionCount] = useState(5);
  const [isProfileEditOpen, setIsProfileEditOpen] = useState(false);

  const students = dashboard?.students ?? [];
  const professorResources = dashboard?.resources ?? [];
  const filteredStudents = useMemo(() => {
    const query = studentQuery.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) =>
      [student.name, student.address, student.studentCode, student.email]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [students, studentQuery]);
  const verifiedAttendanceStudents = useMemo(
    () => students.filter((student) => student.biometricVerified && !student.professorConfirmed),
    [students],
  );

  const filteredProfessorResources = useMemo(() => {
    const query = resourceSearch.trim().toLowerCase();
    const subject = resourceSubjectFilter.trim().toLowerCase();
    return professorResources.filter((resource) => {
      const matchesQuery =
        !query ||
        [
          resource.title,
          resource.subject,
          resource.resourceType,
          resource.professorName,
          resource.time,
          resource.createdDate,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesSubject = !subject || resource.subject.toLowerCase().includes(subject);
      const matchesDate = !resourceDateFilter || resource.createdDate === resourceDateFilter;
      return matchesQuery && matchesSubject && matchesDate;
    });
  }, [professorResources, resourceDateFilter, resourceSearch, resourceSubjectFilter]);

  const selectedReviewItem = useMemo(() => {
    const queue = [
      ...(dashboard?.review_queue ?? []),
      ...(dashboard?.assignment_submissions ?? []),
    ];
    const seen = new Set<number | string>();
    const reviewItems = queue.filter((item) => {
      const key = item.submissionId ?? item.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return (
      reviewItems.find((item) => item.submissionId && item.submissionId === reviewSubmissionId) ??
      reviewItems.find((item) => String(item.studentId) === reviewStudentId && item.title === reviewTitle) ??
      null
    );
  }, [dashboard?.assignment_submissions, dashboard?.review_queue, reviewStudentId, reviewSubmissionId, reviewTitle]);
  const selectedReviewAssignment = useMemo(() => {
    if (!selectedReviewItem?.assignmentId) return null;
    return dashboard?.assignments.find((item) => item.id === selectedReviewItem.assignmentId) ?? null;
  }, [dashboard?.assignments, selectedReviewItem?.assignmentId]);
  const selectedStudentName =
    selectedReviewItem?.student ??
    students.find((student) => String(student.id) === reviewStudentId)?.name ??
    "Selected student";
  const selectedStudentAssignmentHistory = useMemo(() => {
    if (!reviewStudentId) return [];
    const selectedStudent =
      students.find((student) => String(student.id) === reviewStudentId)?.name ??
      selectedReviewItem?.student ??
      "Selected student";
    const submissions = [
      ...(dashboard?.assignment_submissions ?? []),
      ...(dashboard?.review_queue ?? []),
    ]
      .filter((item) => String(item.studentId) === reviewStudentId)
      .filter((item, index, rows) => {
        const key = item.submissionId ?? item.id;
        return rows.findIndex((row) => (row.submissionId ?? row.id) === key) === index;
      });
    const submissionByAssignment = new Map<number, ReviewLikeItem>();
    for (const item of submissions) {
      if (typeof item.assignmentId === "number" && !submissionByAssignment.has(item.assignmentId)) {
        submissionByAssignment.set(item.assignmentId, item);
      }
    }
    const rows: Array<{ item: ReviewLikeItem; sortTime: number }> = [];
    for (const assignment of dashboard?.assignments ?? []) {
      const submission = submissionByAssignment.get(assignment.id);
      if (submission) {
        rows.push({
          item: submission,
          sortTime: parseSubmittedAt(submission),
        });
        continue;
      }
      rows.push({
        item: {
          id: -assignment.id,
          studentId: Number(reviewStudentId),
          student: selectedStudent,
          title: assignment.title,
          subject: assignment.subject,
          submitted: assignment.due ? `Due ${assignment.due}` : "Assigned",
          priority: "normal",
          assignmentId: assignment.id,
          assignmentType: assignment.assignmentType,
          status: "assigned",
          aiGrade: "",
          aiScore: null,
          aiFeedback: "",
          professorScore: null,
          professorGrade: "",
          professorFeedback: "",
          grade: "Not submitted",
          feedback: "",
          fileName: "",
          fileSize: 0,
          fileUrl: "",
          answerCount: 0,
          answers: {},
        },
        sortTime: Date.parse(assignment.createdAt) || 0,
      });
    }
    for (const submission of submissions) {
      if (typeof submission.assignmentId === "number" && dashboard?.assignments?.some((assignment) => assignment.id === submission.assignmentId)) {
        continue;
      }
      rows.push({
        item: submission,
        sortTime: parseSubmittedAt(submission),
      });
    }
    return rows.sort((left, right) => right.sortTime - left.sortTime).map((row) => row.item);
  }, [dashboard?.assignment_submissions, dashboard?.assignments, dashboard?.review_queue, reviewStudentId, selectedReviewItem?.student, students]);
  const selectedReviewTotalPoints = selectedReviewAssignment?.totalPoints ?? 100;
  const selectedReviewScore =
    typeof selectedReviewItem?.aiScore === "number" ? selectedReviewItem.aiScore : null;
  const parsedReviewScore = reviewScore.trim() === "" ? null : Number(reviewScore);
  const finalGradeCode = reviewGrade || "U";
  const detailSubmission = assignmentDetailView?.kind === "submission" ? assignmentDetailView.item : null;
  const detailAssignment =
    assignmentDetailView?.kind === "assignment"
      ? assignmentDetailView.item
      : detailSubmission?.assignmentId
        ? dashboard?.assignments.find((item) => item.id === detailSubmission.assignmentId) ?? null
        : null;

  useEffect(() => {
    if (!selectedReviewItem || reviewScore.trim()) return;
    const marks =
      typeof selectedReviewItem.professorScore === "number"
        ? selectedReviewItem.professorScore
        : typeof selectedReviewItem.aiScore === "number"
          ? selectedReviewItem.aiScore
          : null;
    if (marks === null) return;
    setReviewScore(String(marks));
    setReviewGrade(gradeCodeFromMarks(marks, selectedReviewTotalPoints));
  }, [
    selectedReviewItem?.submissionId,
    selectedReviewItem?.professorScore,
    selectedReviewItem?.aiScore,
    selectedReviewTotalPoints,
  ]);

  useEffect(() => {
    if (
      assignmentSourceKind === "resources" &&
      assignmentResourceIds.length === 0 &&
      professorResources[0]
    ) {
      setAssignmentResourceIds([professorResources[0].id]);
    }
  }, [assignmentResourceIds.length, assignmentSourceKind, professorResources]);

  const todayStatusByStudent = useMemo(() => {
    const map = new Map<number, AttendanceStatus>();
    const today = dashboard?.attendance_today.date;
    if (!today) return map;
    for (const item of dashboard?.attendance_history ?? []) {
      if (item.date === today && item.status !== "warning" && !map.has(item.studentId)) {
        map.set(item.studentId, item.status);
      }
    }
    return map;
  }, [dashboard]);

  const refresh = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setLoading(true);
      }
      try {
        const data = await getProfessorDashboard();
        setDashboard(data);
        if (data.professor) {
          setProfile((prev) => {
            const synced = {
              name: data.professor.name,
              email: data.professor.email,
              department: data.professor.department,
              designation: data.professor.designation,
              expertiseField: data.professor.expertiseField,
              highestEducation: data.professor.highestEducation,
              licenseDocumentName: data.professor.licenseDocumentName,
              phone: prev.phone || "",
              office: prev.office || "",
              officeHours: prev.officeHours || "",
              focus: prev.focus || "",
              bio: prev.bio || "",
              skills: prev.skills.length ? prev.skills : [],
              avatarUrl: data.professor.avatarUrl ?? null,
            };
            setStoredProfessorProfile(synced);
            return synced;
          });
        }
        if (!reviewStudentId && data.review_queue[0]) {
          loadReview(data.review_queue[0]);
        } else if (!data.review_queue[0]) {
          setReviewSubmissionId(null);
          setReviewStudentId("");
          setReviewTitle("");
          setReviewSubject("");
          setReviewScore("");
          setReviewGrade("");
          setReviewFeedback("");
        }
      } catch (error) {
        if (!options?.silent) {
          setStatus(error instanceof Error ? error.message : "Professor dashboard failed to load");
        }
      } finally {
        if (!options?.silent) {
          setLoading(false);
        }
      }
    },
    [reviewStudentId],
  );

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const silentRefresh = async () => {
      if (cancelled) return;
      await refresh({ silent: true });
    };

    const intervalId = window.setInterval(() => {
      void silentRefresh();
    }, 4000);

    const onFocus = () => {
      void silentRefresh();
    };

    const onVisible = () => {
      if (!document.hidden) {
        void silentRefresh();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    const ticker = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(ticker);
  }, []);

  useEffect(() => {
    function syncSection() {
      setActiveSection(normalizeProfessorSection(window.location.hash));
    }

    syncSection();
    window.addEventListener("hashchange", syncSection);
    return () => window.removeEventListener("hashchange", syncSection);
  }, []);

  useEffect(() => {
    if (!attendanceStatus) return;
    const timer = window.setTimeout(() => setAttendanceStatus(null), 2600);
    return () => window.clearTimeout(timer);
  }, [attendanceStatus]);

  useEffect(() => {
    if (activeSection !== "academics" || academicTab !== "attendance") {
      setAttendanceStatus(null);
    }
  }, [academicTab, activeSection]);

  function loadReview(item: ReviewLikeItem) {
    setReviewSubmissionId(item.submissionId ?? null);
    setReviewStudentId(String(item.studentId));
    setReviewTitle(item.title);
    setReviewSubject(item.subject);
    setReviewScore(
      typeof item.professorScore === "number"
        ? String(item.professorScore)
        : typeof item.aiScore === "number"
          ? String(item.aiScore)
          : "",
    );
    setReviewGrade(
      typeof item.professorScore === "number"
        ? gradeCodeFromMarks(
            item.professorScore,
            dashboard?.assignments.find((assignment) => assignment.id === item.assignmentId)?.totalPoints ?? 100,
          )
        : typeof item.aiScore === "number"
          ? gradeCodeFromMarks(
              item.aiScore,
              dashboard?.assignments.find((assignment) => assignment.id === item.assignmentId)?.totalPoints ?? 100,
            )
            : GRADE_OPTIONS.includes(item.professorGrade || "")
            ? item.professorGrade || "U"
            : GRADE_OPTIONS.includes(item.aiGrade || "")
              ? item.aiGrade || "U"
              : "U",
    );
    setReviewFeedback(item.professorFeedback || item.aiFeedback || item.feedback || "");
  }

  function openStudentAssignmentHistory(item: ReviewLikeItem) {
    if (item.submissionId) {
      loadReview(item);
      setAssignmentDetailView({ kind: "submission", item });
      return;
    }

    const assignment = dashboard?.assignments.find((row) => row.id === item.assignmentId);
    if (assignment) {
      setAssignmentDetailView({ kind: "assignment", item: assignment });
    }
  }

  function updateLocalBlock(student: ProfessorStudent, blocked: boolean) {
    setDashboard((current) => {
      if (!current) return current;
      return {
        ...current,
        students: current.students.map((item) =>
          item.id === student.id
            ? {
                ...item,
                isBlocked: blocked,
                blockReason: blocked ? "Blocked by professor" : "",
                blockedAt: blocked ? new Date().toISOString() : "",
                status: blocked ? "blocked" : item.attendance >= 75 ? "safe" : "watch",
              }
            : item,
        ),
      };
    });
  }

  function updateLocalAttendance(student: ProfessorStudent, attendanceStatus: AttendanceStatus) {
    const markedAt = new Date().toISOString();
    setDashboard((current) => {
      if (!current) return current;
      const today = current.attendance_today.date;
      const existingToday = current.attendance_history.find(
        (item) => item.studentId === student.id && item.date === today && item.status !== "warning",
      );
      const historyWithoutStudentWarnings = current.attendance_history.filter(
        (item) =>
          !(item.studentId === student.id && item.date === today && item.status === "warning"),
      );
      const previousStatus = existingToday?.status;
      const markedBy = current.professor.name || "Professor";

      const nextStudents = current.students.map((item) => {
        if (item.id !== student.id) return item;
        let presentCount = item.presentCount;
        let absentCount = item.absentCount;
        let attendanceMarked = item.attendanceMarked;

        if (!previousStatus) {
          attendanceMarked += 1;
          if (attendanceStatus === "present") presentCount += 1;
          if (attendanceStatus === "absent") absentCount += 1;
        } else if (previousStatus !== attendanceStatus) {
          if (previousStatus === "present") presentCount = Math.max(0, presentCount - 1);
          if (previousStatus === "absent") absentCount = Math.max(0, absentCount - 1);
          if (attendanceStatus === "present") presentCount += 1;
          if (attendanceStatus === "absent") absentCount += 1;
        }

        const attendance = attendanceMarked
          ? (presentCount / attendanceMarked) * 100
          : item.attendance;
        return {
          ...item,
          attendance,
          attendanceMarked,
          presentCount,
          absentCount,
          status: item.isBlocked ? "blocked" : attendance >= 75 ? "safe" : "watch",
          professorConfirmed: attendanceStatus === "present",
          attendanceWarning: false,
          biometricStatus: attendanceStatus === "present" ? "present_confirmed" : "absent_marked",
        };
      });

      const deltaPresent =
        attendanceStatus === previousStatus
          ? 0
          : attendanceStatus === "present"
            ? 1
            : previousStatus === "present"
              ? -1
              : 0;
      const deltaAbsent =
        attendanceStatus === previousStatus
          ? 0
          : attendanceStatus === "absent"
            ? 1
            : previousStatus === "absent"
              ? -1
              : 0;
      const deltaUnmarked = previousStatus ? 0 : -1;

      const nextToday = {
        ...current.attendance_today,
        present: Math.max(0, current.attendance_today.present + deltaPresent),
        absent: Math.max(0, current.attendance_today.absent + deltaAbsent),
        unmarked: Math.max(0, current.attendance_today.unmarked + deltaUnmarked),
        marked: previousStatus
          ? current.attendance_today.marked
          : current.attendance_today.marked + 1,
        warnings: Math.max(
          0,
          (current.attendance_today.warnings ?? 0) - (student.attendanceWarning ? 1 : 0),
        ),
        pendingConfirmation: Math.max(
          0,
          (current.attendance_today.pendingConfirmation ?? 0) -
            (attendanceStatus === "present" && student.biometricVerified ? 1 : 0),
        ),
        liveAt: markedAt,
      };
      const nextTodayWithRatios = {
        ...nextToday,
        presentRatio: nextToday.marked
          ? Number(((nextToday.present / nextToday.marked) * 100).toFixed(1))
          : 0,
        absentRatio: nextToday.marked
          ? Number(((nextToday.absent / nextToday.marked) * 100).toFixed(1))
          : 0,
      };

      const nextSummary = current.attendance_summary.map((item) =>
        item.date === today
          ? {
              ...item,
              present: nextTodayWithRatios.present,
              absent: nextTodayWithRatios.absent,
              unmarked: nextTodayWithRatios.unmarked,
              marked: nextTodayWithRatios.marked,
              presentRatio: nextTodayWithRatios.presentRatio,
              absentRatio: nextTodayWithRatios.absentRatio,
            }
          : item,
      );

      const nextHistory = existingToday
        ? historyWithoutStudentWarnings.map((item) =>
            item.id === existingToday.id
              ? { ...item, status: attendanceStatus, markedAt, markedBy }
              : item,
          )
        : [
            {
              id: -Date.now(),
              studentId: student.id,
              student: student.name,
              studentCode: student.studentCode,
              date: today,
              status: attendanceStatus,
              markedBy,
              markedAt,
            },
            ...historyWithoutStudentWarnings,
          ];

      return {
        ...current,
        students: nextStudents,
        attendance_today: nextTodayWithRatios,
        attendance_summary: nextSummary,
        attendance_history: nextHistory,
      };
    });
  }

  async function runAction(action: () => Promise<unknown>, message: string) {
    setSaving(true);
    setStatus(null);
    try {
      const result = await action();
      await refresh();
      setStatus(
        result && typeof result === "object" && "message" in result && typeof result.message === "string"
          ? result.message
          : message,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Action failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleBlock(student: ProfessorStudent) {
    const shouldBlock = !student.isBlocked;
    updateLocalBlock(student, shouldBlock);
    setAttendanceStatus(`${student.name} ${shouldBlock ? "blocked" : "unblocked"}`);
    try {
      await updateStudentBlock(student.id, {
        blocked: shouldBlock,
        reason: shouldBlock ? "Blocked by professor" : undefined,
      });
    } catch (error) {
      updateLocalBlock(student, !shouldBlock);
      setAttendanceStatus(error instanceof Error ? error.message : "Block update failed");
    }
  }

  async function markAttendance(student: ProfessorStudent, attendanceStatus: AttendanceStatus) {
    updateLocalAttendance(student, attendanceStatus);
    setAttendanceStatus(`${student.name} marked ${attendanceStatus}`);
    try {
      const result =
        attendanceStatus === "present" && student.biometricVerified
          ? await confirmProfessorAttendance({ student_id: student.id, present: true })
          : await markProfessorAttendance({ student_id: student.id, status: attendanceStatus });
      setDashboard((current) => {
        if (!current) return current;
        return {
          ...current,
          students: current.students.map((item) =>
            item.id === student.id
              ? {
                  ...item,
                  attendance: result.attendance,
                  biometricCheckIn: "checkIn" in result ? (result.checkIn as any) : item.biometricCheckIn,
                  professorConfirmed: attendanceStatus === "present",
                  attendanceWarning: false,
                  biometricStatus:
                    attendanceStatus === "present" ? "present_confirmed" : "absent_marked",
                }
              : item,
          ),
        };
      });
    } catch (error) {
      await refresh();
      setAttendanceStatus(error instanceof Error ? error.message : "Attendance update failed");
    }
  }

  async function finalizeAttendance() {
    setSaving(true);
    setAttendanceStatus(null);
    try {
      const result = await finalizeProfessorAttendance();
      setAttendanceStatus(result.message);
      await refresh();
    } catch (error) {
      setAttendanceStatus(error instanceof Error ? error.message : "Could not finalize attendance");
    } finally {
      setSaving(false);
    }
  }

  async function submitResource(event: FormEvent) {
    event.preventDefault();
    if (!resourceFile) {
      setStatus("Choose a study resource file before uploading");
      return;
    }
    const formData = new FormData();
    formData.append("subject", resourceSubject);
    formData.append("file", resourceFile);
    await runAction(() => createProfessorResource(formData), "Study resource uploaded");
    setResourceFile(null);
    setResourceFileKey((value) => value + 1);
  }

  function toggleAssignmentResource(resourceId: number) {
    setAssignmentResourceIds((current) =>
      current.includes(resourceId)
        ? current.filter((id) => id !== resourceId)
        : [...current, resourceId],
    );
  }

  async function submitGeneratedAssignment(event: FormEvent) {
    event.preventDefault();
    if (assignmentSourceKind === "resources" && assignmentResourceIds.length === 0) {
      setStatus("Select at least one resource, or switch the source to syllabus/content");
      return;
    }
    if (assignmentSourceKind === "syllabus" && !assignmentSyllabus.trim()) {
      setStatus("Paste or type a syllabus before generating from syllabus");
      return;
    }
    if (assignmentSourceKind === "content" && !assignmentContent.trim()) {
      setStatus("Add source content before generating from custom content");
      return;
    }

    await runAction(
      () =>
        createProfessorAssignment({
          assignment_type: assignmentType,
          title: assignmentTitle || undefined,
          subject: assignmentSubject,
          source_kind: assignmentSourceKind,
          resource_ids: assignmentResourceIds,
          syllabus: assignmentSyllabus || undefined,
          custom_content: assignmentContent || undefined,
          due_label: assignmentDueLabel,
          question_count: assignmentType === "file" ? 1 : assignmentQuestionCount,
          total_points: 100,
        }),
      "AI assignment generated, published to students, and ready for auto-review",
    );
    setAssignmentTitle("");
    if (assignmentSourceKind !== "resources") {
      setAssignmentSyllabus("");
      setAssignmentContent("");
    }
  }

  async function deleteResource(item: ProfessorDashboard["resources"][number]) {
    const shouldDelete = window.confirm(`Delete "${item.title}" from study resources?`);
    if (!shouldDelete) return;
    await runAction(() => deleteProfessorResource(item.id), "Study resource deleted");
  }

  function fillAiReviewDraft() {
    if (selectedReviewItem?.aiGrade || selectedReviewItem?.aiFeedback) {
      if (typeof selectedReviewItem.aiScore === "number") {
        setReviewScore(String(selectedReviewItem.aiScore));
        setReviewGrade(gradeCodeFromMarks(selectedReviewItem.aiScore, selectedReviewTotalPoints));
      } else {
        setReviewGrade(selectedReviewItem.aiGrade || selectedReviewItem.grade || "");
      }
      setReviewFeedback(selectedReviewItem.aiFeedback || selectedReviewItem.feedback || "");
      setStatus("AI review loaded. You can adjust before saving.");
      return;
    }
    setStatus("No AI review is available for this submission yet.");
  }

  async function submitReview(event: FormEvent) {
    event.preventDefault();
    if (reviewSubmissionId) {
      await runAction(
        () =>
          updateProfessorAssignmentSubmissionReview(reviewSubmissionId, {
            score:
              parsedReviewScore !== null && Number.isFinite(parsedReviewScore)
                ? parsedReviewScore
                : undefined,
            grade: finalGradeCode || undefined,
            feedback: reviewFeedback || undefined,
          }),
        "Professor correction saved over the AI review",
      );
    } else {
      await runAction(
        () =>
          reviewProfessorAssignment({
            student_id: Number(reviewStudentId),
            assignment_title: reviewTitle,
            subject: reviewSubject,
            grade: reviewGrade || undefined,
            feedback: reviewFeedback || undefined,
          }),
        "Assignment review saved",
      );
    }
    setReviewSubmissionId(null);
    setReviewScore("");
    setReviewGrade("");
    setReviewFeedback("");
  }

  const professor = dashboard?.professor;
  const attendanceToday = dashboard?.attendance_today;
  const attendanceSummary = dashboard?.attendance_summary ?? [];
  const cgpaYears = dashboard?.cgpa_years ?? [];
  const visible = (section: ProfessorSection) => activeSection === section;
  const baseProfessorSkills = useMemo(() => {
    const skills = [
      professor?.expertiseField,
      professor?.department,
      professor?.designation,
      "Student Mentorship",
      "Academic Review",
    ].filter(Boolean) as string[];
    return Array.from(new Set(skills)).slice(0, 6);
  }, [professor?.department, professor?.designation, professor?.expertiseField]);
  const defaultProfessorProfile = useMemo<EditableProfessorProfile>(
    () => ({
      name: professor?.name ?? "Professor",
      email: professor?.email ?? "faculty@campusverse.edu",
      bio: "",
      phone: "",
      office: "",
      officeHours: "",
      focus: "",
      department: professor?.department ?? "Academic Department",
      designation: professor?.designation ?? "Professor",
      expertiseField: professor?.expertiseField ?? "Academic Operations",
      highestEducation: professor?.highestEducation ?? "Verified Faculty",
      licenseDocumentName: professor?.licenseDocumentName ?? "",
      skills: baseProfessorSkills,
    }),
    [baseProfessorSkills, professor],
  );
  const [profile, setProfile] = useState<EditableProfessorProfile>(
    () => getStoredProfessorProfile() ?? defaultProfessorProfile,
  );
  const [draftProfile, setDraftProfile] = useState<EditableProfessorProfile>(
    () => getStoredProfessorProfile() ?? defaultProfessorProfile,
  );

  useEffect(() => {
    const stored = getStoredProfessorProfile();
    const nextProfile = stored ?? defaultProfessorProfile;
    setProfile(nextProfile);
    setDraftProfile(nextProfile);
  }, [defaultProfessorProfile]);

  const profileCompletion = useMemo(() => {
    const checks = [
      profile.name.trim(),
      profile.email.trim(),
      profile.bio.trim(),
      profile.phone.trim(),
      profile.office.trim(),
      profile.officeHours.trim(),
      profile.focus.trim(),
      profile.department.trim(),
      profile.designation.trim(),
      profile.expertiseField.trim(),
      profile.highestEducation.trim(),
      profile.skills.length > 0 ? "skills" : "",
    ];
    const completed = checks.filter(Boolean).length;
    return Math.round((completed / checks.length) * 100);
  }, [profile]);

  const mentorshipCoverage = useMemo(() => {
    const total = students.length || 1;
    const verified = students.filter(
      (student) => student.professorConfirmed || student.biometricVerified,
    ).length;
    return Math.round((verified / total) * 100);
  }, [students]);

  const averageCgpa = useMemo(() => {
    if (!students.length) return 0;
    return students.reduce((sum, student) => sum + student.cgpa, 0) / students.length;
  }, [students]);

  const averageAttendance = useMemo(() => {
    if (!students.length) return 0;
    return Math.round(
      students.reduce((sum, student) => sum + student.attendance, 0) / students.length,
    );
  }, [students]);

  const professorHighlights = useMemo(
    () => [
      {
        label: "Profile Readiness",
        value: `${profileCompletion}%`,
        hint:
          profileCompletion >= 80
            ? "Faculty profile looks complete"
            : "Add more professional details",
        icon: ShieldCheck,
      },
      {
        label: "Student Coverage",
        value: `${students.length}`,
        hint: `${mentorshipCoverage}% verified or confirmed`,
        icon: Users,
      },
      {
        label: "Attendance Health",
        value: `${averageAttendance}%`,
        hint: "Average across assigned students",
        icon: GraduationCap,
      },
      {
        label: "Teaching Focus",
        value: profile.expertiseField || "Add expertise",
        hint: profile.focus || "Set your mentoring focus",
        icon: Target,
      },
    ],
    [
      averageAttendance,
      mentorshipCoverage,
      profile.expertiseField,
      profile.focus,
      profileCompletion,
      students.length,
    ],
  );

  const professorMilestones = useMemo(
    () => [
      {
        title: "Faculty Profile Verified",
        detail:
          profileCompletion >= 80
            ? "Professional details are ready for review"
            : "Complete profile details for a stronger faculty page",
        earned: profileCompletion >= 80,
      },
      {
        title: "Attendance Oversight Active",
        detail: `${averageAttendance}% average student attendance`,
        earned: averageAttendance >= 80,
      },
      {
        title: "Mentorship Coverage",
        detail: `${mentorshipCoverage}% classroom verification progress`,
        earned: mentorshipCoverage >= 70,
      },
      {
        title: "Campus Resource Contributor",
        detail: `${professorResources.length} shared learning resources`,
        earned: professorResources.length >= 1,
      },
    ],
    [averageAttendance, mentorshipCoverage, profileCompletion, professorResources.length],
  );

  const profileTimeline = useMemo(
    () =>
      [
        profile.officeHours
          ? { when: "This week", text: `Office hours shared as ${profile.officeHours}` }
          : null,
        attendanceToday
          ? {
              when: attendanceToday.label,
              text: `${attendanceToday.present} students marked present today`,
            }
          : null,
        dashboard?.announcements?.[0]
          ? { when: "Latest announcement", text: dashboard.announcements[0].title }
          : null,
        professorResources[0]
          ? {
              when: "Recent resource",
              text: `${professorResources[0].title} uploaded for ${professorResources[0].subject}`,
            }
          : null,
      ].filter(Boolean) as { when: string; text: string }[],
    [attendanceToday, dashboard?.announcements, professorResources, profile.officeHours],
  );

  if (loading && !dashboard) {
    return (
      <div className="glass rounded-3xl p-8 text-white/60">Loading professor dashboard...</div>
    );
  }

  function openProfessorEditor() {
    setDraftProfile(profile);
    setIsProfileEditOpen(true);
  }

  async function saveProfessorProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextProfile = {
      ...draftProfile,
      avatarUrl: draftProfile.avatarUrl ?? null,
      skills: Array.from(
        new Set(draftProfile.skills.map((skill) => skill.trim()).filter(Boolean)),
      ).slice(0, 8),
    };
    setProfile(nextProfile);
    setDraftProfile(nextProfile);
    setStoredProfessorProfile(nextProfile);
    const storedUser = getStoredUser();
    if (storedUser) {
      setStoredUser({
        ...storedUser,
        avatarUrl: nextProfile.avatarUrl ?? null,
        avatar_url: nextProfile.avatarUrl ?? null,
      } as any);
    }
    setIsProfileEditOpen(false);
    setStatus("Saving profile changes...");

    try {
      await updateProfessorAvatar(nextProfile.avatarUrl ?? null);
      const res = await updateProfessorProfile(nextProfile);
      if (res.ok && res.professor) {
        const synced = {
          ...nextProfile,
          avatarUrl: res.professor.avatarUrl ?? null,
        };
        setProfile(synced);
        setDraftProfile(synced);
        setStoredProfessorProfile(synced);
        setStatus("Faculty profile updated & saved to backend successfully!");
        setTimeout(() => setStatus(null), 3000);
      }
    } catch {
      setStatus("Faculty profile saved locally");
      setTimeout(() => setStatus(null), 3000);
    }
  }

  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="cv-professor-content cv-admin-content space-y-8">
      {status && activeSection !== "academics" && (
        <div className="glass rounded-2xl px-4 py-3 text-sm text-white/75 inline-flex items-center gap-2">
          <CheckCircle2 className="size-4 text-emerald-300" />
          {status}
        </div>
      )}

      <section id="dashboard" className={visible("dashboard") ? "pt-4" : "hidden"}>
        <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.35em] text-white/45 mb-5 rounded-full border border-white/10 px-4 py-2">
          <GraduationCap className="size-3.5" />
          College administrative dashboard
        </div>
        <div className="grid xl:grid-cols-[1fr_320px] gap-6 items-end">
          <div>
            <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tight max-w-5xl">
              {professor?.name?.split(" ")[0] ?? "Professor"}'s academic control center
            </h1>
            <p className="mt-5 text-white/55 max-w-3xl">
              Manage student CGPA, attendance, announcements, resources, and submitted assignments
              from one professor desk.
            </p>
          </div>
          <Panel className="p-5">
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">
              Verified profile
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div
                className="size-12 rounded-2xl flex items-center justify-center text-sm font-semibold overflow-hidden border border-white/10 shrink-0"
                style={{ background: "var(--grad-aurora)" }}
              >
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} alt="Faculty Avatar" className="size-full object-cover" />
                ) : (
                  professor?.avatar ?? professorInitialsFromName(profile.name)
                )}
              </div>
              <div className="min-w-0">
                <div className="font-display text-lg truncate">
                  {professor?.designation ?? "Professor"}
                </div>
                <div className="text-xs text-white/45 truncate">
                  {professor?.expertiseField ?? "Academic Operations"}
                </div>
              </div>
            </div>
            <div className="mt-4 text-xs text-white/50">
              {professor?.licenseDocumentName ?? "License pending"}
            </div>
          </Panel>
        </div>

        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-8">
          {(dashboard?.metrics ?? []).map((metric) => (
            <MetricCard key={metric.label} metric={metric} />
          ))}
        </div>
      </section>

      <section
        className={visible("dashboard") ? "grid xl:grid-cols-[1.2fr_0.8fr] gap-5" : "hidden"}
      >
        <Panel className="p-5">
          <SectionTitle icon={BarChart3} eyebrow="Attendance ratio" title="Present vs absent" />
          <AttendanceRatioChart data={attendanceSummary} />
        </Panel>
        <Panel className="p-5">
          <SectionTitle icon={GraduationCap} eyebrow="Average CGPA" title="By academic year" />
          <CgpaYearChart data={cgpaYears} />
        </Panel>
      </section>

      <section id="students" className={visible("students") ? "" : "hidden"}>
        <Panel className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <SectionTitle icon={Users} eyebrow="Student records" title="Assigned students" />
            <SearchField value={studentQuery} onChange={setStudentQuery} />
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-white/40 text-[10px] uppercase tracking-[0.25em]">
                <tr>
                  <th className="py-3 pr-4">Student</th>
                  <th className="py-3 pr-4">Address</th>
                  <th className="py-3 pr-4">Sem</th>
                  <th className="py-3 pr-4">CGPA</th>
                  <th className="py-3 pr-4">Attendance</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student) => (
                  <tr key={student.id} className="border-t border-white/10">
                    <td className="py-4 pr-4 min-w-[220px]">
                      <div className="font-medium">{student.name}</div>
                      <div className="text-xs text-white/40">{student.studentCode}</div>
                    </td>
                    <td className="py-4 pr-4 text-white/55 min-w-[180px]">{student.address}</td>
                    <td className="py-4 pr-4 text-white/65">Sem {student.semester}</td>
                    <td className="py-4 pr-4 text-cyan-200 font-display text-lg">
                      {student.cgpa.toFixed(1)}
                    </td>
                    <td className="py-4 pr-4 text-emerald-200 font-display text-lg">
                      {student.attendance.toFixed(0)}%
                    </td>
                    <td className="py-4 pr-4">
                      <StatusPill student={student} />
                    </td>
                    <td className="py-4 pr-4">
                      <button
                        onClick={() => toggleBlock(student)}
                        disabled={saving}
                        className={`transform-gpu rounded-full px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] transition duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 shadow-2xs ${
                          student.isBlocked
                            ? isDark
                              ? "bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/25"
                              : "bg-emerald-50 border border-emerald-300 text-emerald-800 font-bold hover:bg-emerald-100"
                            : isDark
                              ? "bg-rose-500/15 border border-rose-400/40 text-rose-300 hover:bg-rose-500/25"
                              : "bg-rose-50 border border-rose-300 text-rose-800 font-bold hover:bg-rose-100"
                        }`}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {student.isBlocked ? (
                            <UserCheck className="size-3.5" />
                          ) : (
                            <Ban className="size-3.5" />
                          )}
                          {student.isBlocked ? "Unblock" : "Block"}
                        </span>
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredStudents.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-white/40">
                      No student records match this search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>

      <section id="academics" className={visible("academics") ? "" : "hidden"}>
        <Panel className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <SectionTitle
              icon={GraduationCap}
              eyebrow="Academic controls"
              title="CGPA & attendance"
            />
            <div className={`rounded-full p-1 flex w-full max-w-sm border ${
              isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-100/80"
            }`}>
              {(["attendance", "cgpa"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setAcademicTab(tab)}
                  className={`flex-1 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] transition ${
                    academicTab === tab
                      ? isDark
                        ? "bg-white/20 text-white shadow-xs"
                        : "bg-white text-indigo-950 shadow-xs"
                      : isDark
                        ? "text-white/45 hover:text-white"
                        : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {tab === "attendance" ? "Attendance" : "CGPA"}
                </button>
              ))}
            </div>
          </div>

          {academicTab === "attendance" ? (
            <div className="mt-6 space-y-5">
              {attendanceStatus && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="glass inline-flex rounded-2xl px-4 py-3 text-sm text-white/75 items-center gap-2"
                >
                  <CheckCircle2 className="size-4 text-emerald-300" />
                  {attendanceStatus}
                </motion.div>
              )}

              <div className="grid gap-3 items-center lg:grid-cols-[1fr_auto_auto]">
                <div className="glass rounded-2xl px-4 py-3 text-sm text-white/60">
                  <span className="inline-flex items-center gap-2">
                    <CalendarClock className="size-4 text-cyan-200" />
                    {attendanceToday?.label ?? "Today"} /{" "}
                    {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="ml-3 text-white/35">
                    {attendanceToday?.present ?? 0} present, {attendanceToday?.absent ?? 0} absent,{" "}
                    {attendanceToday?.unmarked ?? 0} unmarked
                    <span className="ml-2 text-cyan-100/70">
                      {attendanceToday?.biometricVerified ?? 0} biometric verified
                    </span>
                  </span>
                </div>
                <button
                  onClick={finalizeAttendance}
                  disabled={saving}
                  className="glass rounded-full px-4 py-3 text-xs uppercase tracking-[0.2em] text-amber-100 hover:text-white disabled:cursor-wait disabled:opacity-60"
                >
                  <span className="inline-flex items-center gap-2">
                    <AlertTriangle className="size-4" />
                    Finalize absent
                  </span>
                </button>
                <button
                  onClick={() => setShowAttendanceHistory((value) => !value)}
                  className="glass rounded-full px-4 py-3 text-xs uppercase tracking-[0.2em] text-white/65 hover:text-white"
                >
                  <span className="inline-flex items-center gap-2">
                    <History className="size-4" />
                    History
                  </span>
                </button>
              </div>

              <div className="grid xl:grid-cols-[1fr_1.1fr] gap-5">
                <div className="glass rounded-3xl p-5">
                  <div className="text-[10px] uppercase tracking-[0.3em] font-bold text-white/40">
                    Today ratio
                  </div>
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    <MiniStat
                      label="Present"
                      value={String(attendanceToday?.present ?? 0)}
                      tone="text-emerald-400"
                    />
                    <MiniStat
                      label="Absent"
                      value={String(attendanceToday?.absent ?? 0)}
                      tone="text-rose-400"
                    />
                    <MiniStat
                      label="Unmarked"
                      value={String(attendanceToday?.unmarked ?? 0)}
                      tone="text-slate-400"
                    />
                    <MiniStat
                      label="Verified"
                      value={String(attendanceToday?.biometricVerified ?? 0)}
                      tone="text-cyan-400"
                    />
                    <MiniStat
                      label="Warnings"
                      value={String(attendanceToday?.warnings ?? 0)}
                      tone="text-amber-400"
                    />
                  </div>
                  <div className="mt-5 text-xs text-white/45">
                    Attendance is locked to the current date and updates student dashboard
                    percentages immediately.
                  </div>
                </div>
                <div className="glass rounded-3xl p-5">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">
                    Live attendance graph
                  </div>
                  <AttendanceRatioChart data={attendanceSummary} compact />
                </div>
              </div>

              <div className="glass rounded-3xl p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">
                      Biometric verified queue
                    </div>
                    <div className="mt-1 font-display text-xl font-semibold">
                      Students waiting for professor tick
                    </div>
                  </div>
                  <div className="rounded-full bg-cyan-300/10 px-4 py-2 text-xs text-cyan-100">
                    {verifiedAttendanceStudents.length} verified
                  </div>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {verifiedAttendanceStudents.map((student) => (
                    <div
                      key={student.id}
                      className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="font-medium text-white">{student.name}</div>
                          <div className="mt-1 text-xs text-white/45">
                            {student.studentCode} /{" "}
                            {student.radiusDistance != null
                              ? `${student.radiusDistance}m from center`
                              : "Inside radius"}
                          </div>
                        </div>
                        <button
                          onClick={() => markAttendance(student, "present")}
                          disabled={saving || student.isBlocked}
                          className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-200/30 bg-emerald-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-wait disabled:opacity-60"
                        >
                          <CheckCircle2 className="size-4" />
                          Confirm present
                        </button>
                      </div>
                    </div>
                  ))}
                  {verifiedAttendanceStudents.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-5 text-sm text-white/45 lg:col-span-2">
                      No biometric verified students yet. After a student scans, they will appear
                      here automatically.
                    </div>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-white/40 text-[10px] uppercase tracking-[0.25em]">
                    <tr>
                      <th className="py-3 pr-4">Verified student</th>
                      <th className="py-3 pr-4">Radius</th>
                      <th className="py-3 pr-4">Biometric</th>
                      <th className="py-3 pr-4">Overall</th>
                      <th className="py-3 pr-4">Professor action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {verifiedAttendanceStudents.map((student) => {
                      const todayStatus = todayStatusByStudent.get(student.id);
                      return (
                        <tr key={student.id} className="border-t border-white/10">
                          <td className="py-4 pr-4 min-w-[220px]">
                            <div className="font-medium">{student.name}</div>
                            <div className="text-xs text-white/40">{student.studentCode}</div>
                          </td>
                          <td className="py-4 pr-4 text-white/60">
                            {student.radiusDistance != null
                              ? `${student.radiusDistance}m from center`
                              : "Inside radius"}
                          </td>
                          <td className="py-4 pr-4">
                            <BiometricPill student={student} />
                          </td>
                          <td className="py-4 pr-4 text-white/60">
                            {student.attendance.toFixed(0)}% / {student.attendanceMarked} days
                          </td>
                          <td className="py-4 pr-4">
                            <div className="flex flex-wrap gap-2">
                              <AttendanceButton
                                status="present"
                                active={todayStatus === "present"}
                                disabled={saving || student.isBlocked}
                                onClick={() => markAttendance(student, "present")}
                              />
                              <AttendanceButton
                                status="absent"
                                active={todayStatus === "absent"}
                                disabled={saving || student.isBlocked}
                                onClick={() => markAttendance(student, "absent")}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {verifiedAttendanceStudents.length === 0 && (
                      <tr className="border-t border-white/10">
                        <td colSpan={5} className="py-6 text-sm text-white/45">
                          No biometric verified students are waiting right now. Students will appear
                          here only after entering the campus radius and finishing biometric
                          verification. Everyone else will be handled by final absent marking for
                          today.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              {/* Top CGPA Analytics Summary Cards */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className={`rounded-2xl p-4 border transition-all ${
                  isDark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-white/90 shadow-2xs"
                }`}>
                  <div className={`text-[10px] font-bold uppercase tracking-[0.2em] ${isDark ? "text-indigo-300" : "text-indigo-600"}`}>
                    Class Average CGPA
                  </div>
                  <div className={`mt-2 font-display text-3xl font-bold ${isDark ? "text-cyan-300" : "text-cyan-600"}`}>
                    {averageCgpa.toFixed(2)}
                  </div>
                  <div className={`mt-1 text-xs ${isDark ? "text-white/45" : "text-slate-500"}`}>
                    Across {students.length} assigned student profiles
                  </div>
                </div>

                <div className={`rounded-2xl p-4 border transition-all ${
                  isDark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-white/90 shadow-2xs"
                }`}>
                  <div className={`text-[10px] font-bold uppercase tracking-[0.2em] ${isDark ? "text-emerald-300" : "text-emerald-600"}`}>
                    Highest CGPA
                  </div>
                  <div className={`mt-2 font-display text-3xl font-bold ${isDark ? "text-emerald-300" : "text-emerald-600"}`}>
                    {students.length > 0 ? Math.max(...students.map(s => s.cgpa)).toFixed(1) : "0.0"}
                  </div>
                  <div className={`mt-1 text-xs ${isDark ? "text-white/45" : "text-slate-500"}`}>
                    Top academic performer score
                  </div>
                </div>

                <div className={`rounded-2xl p-4 border transition-all ${
                  isDark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-white/90 shadow-2xs"
                }`}>
                  <div className={`text-[10px] font-bold uppercase tracking-[0.2em] ${isDark ? "text-amber-300" : "text-amber-600"}`}>
                    Students on Watch
                  </div>
                  <div className={`mt-2 font-display text-3xl font-bold ${isDark ? "text-amber-300" : "text-amber-600"}`}>
                    {students.filter(s => s.attendance < 75 || s.cgpa < 7.0).length}
                  </div>
                  <div className={`mt-1 text-xs ${isDark ? "text-white/45" : "text-slate-500"}`}>
                    Low attendance or CGPA warning
                  </div>
                </div>

                <div className={`rounded-2xl p-4 border transition-all ${
                  isDark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-white/90 shadow-2xs"
                }`}>
                  <div className={`text-[10px] font-bold uppercase tracking-[0.2em] ${isDark ? "text-purple-300" : "text-purple-600"}`}>
                    Grade S Cutoff
                  </div>
                  <div className={`mt-2 font-display text-3xl font-bold ${isDark ? "text-purple-300" : "text-purple-600"}`}>
                    9.0+ CGPA
                  </div>
                  <div className={`mt-1 text-xs ${isDark ? "text-white/45" : "text-slate-500"}`}>
                    Distinction threshold cutoff
                  </div>
                </div>
              </div>

              {/* Multi-Year CGPA Graph */}
              <div className={`rounded-3xl p-5 border ${
                isDark ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-white/90 shadow-xs"
              }`}>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <SectionTitle icon={BarChart3} eyebrow="Progression" title="CGPA By Academic Year" />
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${
                    isDark ? "border-indigo-400/30 bg-indigo-500/10 text-indigo-300" : "border-indigo-200 bg-indigo-50 text-indigo-900"
                  }`}>
                    Historical Benchmarks
                  </span>
                </div>
                <CgpaYearChart data={cgpaYears} />
              </div>

              {/* CGPA & Academic Roster Table */}
              <div className={`rounded-3xl p-5 border ${
                isDark ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-white/90 shadow-xs"
              }`}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
                  <SectionTitle icon={GraduationCap} eyebrow="Class Roster" title="Student CGPA Breakdown" />
                  <div className={`text-xs font-semibold ${isDark ? "text-white/50" : "text-slate-500"}`}>
                    Total: {students.length} student records
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className={`text-[10px] uppercase tracking-[0.25em] font-bold ${isDark ? "text-white/40" : "text-slate-500"}`}>
                      <tr>
                        <th className="py-3 pr-4">Student</th>
                        <th className="py-3 pr-4">Semester</th>
                        <th className="py-3 pr-4">CGPA Score</th>
                        <th className="py-3 pr-4">Grade</th>
                        <th className="py-3 pr-4">Attendance</th>
                        <th className="py-3 pr-4">Academic Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((student) => {
                        const gradeLetter = student.cgpa >= 9.0 ? "S (Outstanding)" : student.cgpa >= 8.0 ? "A (Excellent)" : student.cgpa >= 7.0 ? "B (Good)" : "C (Average)";
                        return (
                          <tr key={student.id} className={`border-t transition-colors ${isDark ? "border-white/10 hover:bg-white/5" : "border-slate-200 hover:bg-slate-50"}`}>
                            <td className="py-4 pr-4 font-medium min-w-[200px]">
                              <div className={isDark ? "text-white font-semibold" : "text-slate-900 font-bold"}>{student.name}</div>
                              <div className={`text-xs ${isDark ? "text-white/40" : "text-slate-400"}`}>{student.studentCode}</div>
                            </td>
                            <td className={`py-4 pr-4 font-medium ${isDark ? "text-white/70" : "text-slate-700"}`}>
                              Semester {student.semester}
                            </td>
                            <td className="py-4 pr-4">
                              <span className={`font-display text-lg font-bold ${isDark ? "text-cyan-300" : "text-cyan-600"}`}>
                                {student.cgpa.toFixed(1)}
                              </span>
                              <span className={`ml-1 text-xs ${isDark ? "text-white/40" : "text-slate-400"}`}>/ 10</span>
                            </td>
                            <td className="py-4 pr-4">
                              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold font-mono ${
                                student.cgpa >= 9.0
                                  ? "bg-purple-500/15 border border-purple-500/30 text-purple-600"
                                  : student.cgpa >= 8.0
                                    ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-600"
                                    : "bg-blue-500/15 border border-blue-500/30 text-blue-600"
                              }`}>
                                {gradeLetter}
                              </span>
                            </td>
                            <td className={`py-4 pr-4 font-display text-base font-bold ${student.attendance >= 75 ? "text-emerald-600" : "text-amber-600"}`}>
                              {student.attendance.toFixed(0)}%
                            </td>
                            <td className="py-4 pr-4">
                              <StatusPill student={student} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </Panel>
      </section>

      <section
        className={visible("announcements") || visible("resources") ? "grid gap-5" : "hidden"}
      >
        <Panel id="announcements" className={visible("announcements") ? "p-6 glass-strong border border-white/12 shadow-2xl relative" : "hidden"}>
          <div className="border-b border-white/10 pb-4 mb-6">
            <SectionTitle icon={Megaphone} eyebrow="Notices & Circulars" title="Campus Announcements" />
            <p className="mt-1 text-xs text-white/50 leading-relaxed">
              Official university notices, academic updates, and administrative announcements.
            </p>
          </div>

          <div className="space-y-4">
            {(dashboard?.announcements ?? []).length === 0 && (
              <div className="relative overflow-hidden rounded-3xl border border-white/12 bg-gradient-to-b from-white/[0.03] to-transparent p-10 text-center shadow-xl">
                <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 shadow-[0_0_20px_rgba(217,70,239,0.15)]">
                  <Megaphone className="size-7 text-fuchsia-300" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold text-white/95">No Active Announcements</h3>
                <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-white/50">
                  You are all caught up! New campus broadcasts and university directives will appear here when posted.
                </p>
              </div>
            )}
            {(dashboard?.announcements ?? []).map((item) => (
              <div
                key={item.id}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3 transition duration-200 hover:border-fuchsia-400/30 hover:bg-white/[0.05] hover:shadow-xl"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  {item.pinned && (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-amber-300 bg-amber-500/15 border border-amber-500/35 px-2.5 py-0.5 rounded-full font-bold">
                      📌 Pinned
                    </span>
                  )}
                  <span className="text-[10px] font-mono uppercase tracking-wider text-fuchsia-300 bg-fuchsia-500/15 border border-fuchsia-500/30 px-2.5 py-0.5 rounded-full font-semibold">
                    {item.category}
                  </span>
                  <span className="text-[10px] font-mono text-cyan-300 bg-cyan-500/15 border border-cyan-500/25 px-2.5 py-0.5 rounded-full">
                    Audience: {item.audience}
                  </span>
                  <span className="text-[11px] text-white/40 ml-auto font-mono">{item.time}</span>
                </div>
                <div className="font-display text-base font-semibold text-white group-hover:text-fuchsia-200 transition">
                  {item.title}
                </div>
                <p className="text-xs text-white/70 leading-relaxed">{item.body}</p>
                {"createdBy" in item && (
                  <div className="text-[10px] text-white/40 pt-2 border-t border-white/5 flex items-center gap-1.5 font-mono">
                    <span>Issued by</span>
                    <span className="text-white/70 font-sans font-medium">{(item as any).createdBy}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>

        <Panel id="resources" className={visible("resources") ? "p-5" : "hidden"}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <SectionTitle icon={BookOpen} eyebrow="Study resources" title="Upload resource" />
            <div className="glass rounded-full px-4 py-2 text-xs text-white/55">
              {professorResources.length} uploaded
            </div>
          </div>

          <form onSubmit={submitResource} className="mt-5 space-y-4">
            <SearchableOptionInput
              id="professor-resource-subject"
              label="Subject name"
              value={resourceSubject}
              onChange={setResourceSubject}
              options={STUDY_SUBJECTS}
              placeholder="Select or type subject"
              required
            />

            <label className="block rounded-3xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-5 transition hover:border-white/25">
              <input
                key={resourceFileKey}
                type="file"
                className="sr-only"
                onChange={(event) => setResourceFile(event.target.files?.[0] ?? null)}
              />
              <span className="flex items-center gap-3">
                <span className="size-11 rounded-2xl bg-white/10 flex items-center justify-center">
                  <Upload className="size-4 text-cyan-200" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium truncate">
                    {resourceFile
                      ? resourceFile.name
                      : "Choose PDF, document, audio, video, CSV, Excel, or any file"}
                  </span>
                  <span className="mt-1 block text-xs text-white/40">
                    The file name becomes the resource title after upload.
                  </span>
                </span>
              </span>
            </label>

            <ActionButton disabled={saving || !resourceFile} icon={Upload}>
              Upload resource
            </ActionButton>
          </form>

          <div className="mt-7 border-t border-white/10 pt-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <SectionTitle icon={FileText} eyebrow="Upload history" title="Published materials" />
              <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[620px]">
                <Input
                  value={resourceSearch}
                  onChange={(event) => setResourceSearch(event.target.value)}
                  placeholder="Search subject, file, date"
                />
                <SearchableOptionInput
                  id="professor-resource-filter-subject"
                  value={resourceSubjectFilter}
                  onChange={setResourceSubjectFilter}
                  options={STUDY_SUBJECTS}
                  placeholder="Filter subject"
                />
                <Input
                  type="date"
                  value={resourceDateFilter}
                  onChange={(event) => setResourceDateFilter(event.target.value)}
                />
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {filteredProfessorResources.map((item) => (
                <ResourceHistoryRow
                  key={item.id}
                  item={item}
                  disabled={saving}
                  onDelete={() => deleteResource(item)}
                />
              ))}
              {filteredProfessorResources.length === 0 && (
                <div className="rounded-3xl border border-dashed border-white/15 py-10 text-center text-sm text-white/45">
                  No uploaded study resources match this filter.
                </div>
              )}
            </div>
          </div>
        </Panel>
      </section>

      <section
        id="reviews"
        className={visible("reviews") ? "grid gap-5 xl:h-[calc(100vh-7.5rem)] xl:grid-cols-[0.9fr_1.1fr] xl:overflow-hidden" : "hidden"}
      >
        <Panel className="flex min-h-0 flex-col overflow-hidden p-5 xl:max-h-[calc(100vh-7.5rem)] glass-strong border border-white/12 shadow-2xl relative">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-fuchsia-500 via-purple-500 to-cyan-500 opacity-80" />
          <div className="flex min-h-[11rem] flex-1 flex-col xl:min-h-0">
            <div className="flex items-center justify-between gap-3">
              <SectionTitle icon={ClipboardCheck} eyebrow="Submitted work" title="AI review queue" />
              <span className="rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-1 text-[10px] font-mono font-semibold uppercase tracking-wider text-fuchsia-200 shadow-[0_0_12px_rgba(217,70,239,0.2)]">
                {(dashboard?.review_queue ?? []).length} Pending
              </span>
            </div>
            <div className="mt-4 min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
              {(dashboard?.review_queue ?? []).map((item) => {
                const active = item.submissionId && item.submissionId === reviewSubmissionId;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      loadReview(item);
                      setAssignmentDetailView({ kind: "submission", item });
                    }}
                    className={`group relative w-full text-left rounded-2xl p-4 transition-all duration-200 border ${
                      active
                        ? "border-fuchsia-400/60 bg-gradient-to-r from-fuchsia-500/20 via-purple-500/10 to-transparent shadow-[0_0_25px_rgba(217,70,239,0.2)]"
                        : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06] hover:shadow-lg"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-white group-hover:text-fuchsia-200 transition">
                          {item.title}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-white/55">
                          <span className="font-medium text-white/80">{item.student}</span>
                          <span>•</span>
                          <span className="font-mono text-white/40">{item.submitted}</span>
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider ${
                          item.priority === "high"
                            ? "bg-rose-500/15 border border-rose-500/35 text-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.25)]"
                            : "bg-white/5 border border-white/10 text-white/45"
                        }`}
                      >
                        {item.priority}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.16em]">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-white/60 font-medium">
                        {(item.assignmentType ?? "manual").replace("qa", "Q&A")}
                      </span>
                      {item.aiGrade && (
                        <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-0.5 font-bold text-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.2)]">
                          AI {item.aiGrade}
                        </span>
                      )}
                      {item.fileName && (
                        <span className="truncate max-w-[140px] rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-white/50">
                          📎 {item.fileName}
                        </span>
                      )}
                      <span className="ml-auto inline-flex items-center gap-1.5 font-medium text-cyan-300 group-hover:translate-x-0.5 transition-transform">
                        <Eye className="size-3.5" />
                        Inspect
                      </span>
                    </div>
                  </button>
                );
              })}
              {(dashboard?.review_queue ?? []).length === 0 && (
                <div className="rounded-3xl border border-dashed border-white/15 py-10 text-center text-sm text-white/45 bg-white/[0.01]">
                  Student submissions will appear here after AI review.
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 flex min-h-[11rem] flex-1 flex-col border-t border-white/10 pt-4 xl:min-h-0">
            <div className="flex items-center justify-between gap-3">
              <SectionTitle icon={FileText} eyebrow="Published" title="AI assignments" />
              <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-[10px] font-mono font-semibold uppercase tracking-wider text-cyan-200">
                {(dashboard?.assignments ?? []).length} Active
              </span>
            </div>
            <div className="mt-4 min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
              {(dashboard?.assignments ?? []).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setAssignmentDetailView({ kind: "assignment", item })}
                  className="group w-full rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition-all duration-200 hover:border-cyan-400/40 hover:bg-white/[0.06] hover:shadow-lg"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-white group-hover:text-cyan-200 transition">
                        {item.title}
                      </div>
                      <div className="mt-1 text-xs text-white/45 truncate">
                        {item.subject} <span className="text-white/20">•</span> {item.sourceTitle}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full border border-cyan-400/30 bg-cyan-500/15 px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-[0.16em] text-cyan-200 shadow-[0_0_10px_rgba(6,182,212,0.2)]">
                      {item.assignmentType === "qa" ? "Q&A" : item.assignmentType.toUpperCase()}
                    </span>
                  </div>
                  <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-cyan-300 group-hover:translate-x-0.5 transition-transform">
                    <Eye className="size-3.5" />
                    View generated paper & rubric
                  </div>
                </button>
              ))}
              {(dashboard?.assignments ?? []).length === 0 && (
                <div className="rounded-3xl border border-dashed border-white/15 py-8 text-center text-sm text-white/45 bg-white/[0.01]">
                  Create the first AI assignment from the builder.
                </div>
              )}
            </div>
          </div>

          <StudentAssignmentHistory
            className="mt-5 min-h-[10rem] flex-[0.9] xl:min-h-0"
            listClassName="max-h-none flex-1"
            items={selectedStudentAssignmentHistory}
            assignments={dashboard?.assignments ?? []}
            studentName={selectedStudentName}
            selectedSubmissionId={reviewSubmissionId}
            onOpen={openStudentAssignmentHistory}
          />
        </Panel>

        <div className="space-y-5 xl:max-h-[calc(100vh-7.5rem)] xl:overflow-y-auto xl:pr-2">
          <Panel className="p-6 glass-strong border border-white/12 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-indigo-500 to-cyan-500 opacity-70" />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionTitle icon={Sparkles} eyebrow="GenAI Assignment System" title="AI Intelligence Builder" />
              <div className="inline-flex items-center gap-2 rounded-full border border-purple-400/30 bg-purple-500/10 px-3.5 py-1.5 text-[11px] font-medium text-purple-200 shadow-[0_0_15px_rgba(168,85,247,0.15)]">
                <span className="size-2 rounded-full bg-purple-400 animate-pulse" />
                AI Engine Live
              </div>
            </div>

            <form onSubmit={submitGeneratedAssignment} className="mt-6 space-y-5">
              <div>
                <span className="mb-2 block text-[10px] uppercase tracking-[0.25em] font-semibold text-white/45">
                  1. Select Paper Format
                </span>
                <div className="grid gap-2.5 sm:grid-cols-3">
                  {[
                    { value: "mcq" as const, label: "MCQ Paper", icon: ClipboardCheck, desc: "Auto-graded quiz" },
                    { value: "qa" as const, label: "Q&A Assessment", icon: Edit3, desc: "Descriptive paper" },
                    { value: "file" as const, label: "File Project", icon: Upload, desc: "Submission brief" },
                  ].map((option) => {
                    const Icon = option.icon;
                    const active = assignmentType === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setAssignmentType(option.value)}
                        className={`group relative rounded-2xl border p-3.5 text-left transition-all duration-200 ${
                          active
                            ? "border-fuchsia-400/60 bg-gradient-to-br from-fuchsia-500/20 via-purple-500/15 to-transparent text-white shadow-[0_0_20px_rgba(217,70,239,0.25)]"
                            : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/25 hover:bg-white/[0.06] hover:text-white"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 font-semibold text-sm">
                          <Icon className={`size-4 ${active ? "text-fuchsia-300" : "text-white/45 group-hover:text-white"}`} />
                          {option.label}
                        </div>
                        <div className="mt-1 text-[11px] text-white/40">{option.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="block text-[10px] uppercase tracking-[0.25em] font-semibold text-white/45">
                    Assignment Title (Optional)
                  </span>
                  <Input
                    value={assignmentTitle}
                    onChange={(event) => setAssignmentTitle(event.target.value)}
                    placeholder="Auto-generated by AI if blank"
                    className="bg-white/[0.04] border-white/12 focus:border-fuchsia-400/50 rounded-2xl"
                  />
                </label>
                <label className="space-y-2">
                  <span className="block text-[10px] uppercase tracking-[0.25em] font-semibold text-white/45">
                    Target Subject
                  </span>
                  <SearchableOptionInput
                    id="professor-assignment-subject"
                    value={assignmentSubject}
                    onChange={setAssignmentSubject}
                    options={STUDY_SUBJECTS}
                    placeholder="Select subject"
                  />
                </label>
              </div>

              <div>
                <span className="mb-2 block text-[10px] uppercase tracking-[0.25em] font-semibold text-white/45">
                  2. Select AI Context Source
                </span>
                <div className="grid gap-2.5 sm:grid-cols-3">
                  {[
                    { value: "resources" as const, label: "Uploaded Resources", icon: BookOpen },
                    { value: "syllabus" as const, label: "Syllabus Outline", icon: FileText },
                    { value: "content" as const, label: "Custom Text Prompt", icon: Edit3 },
                  ].map((option) => {
                    const Icon = option.icon;
                    const active = assignmentSourceKind === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setAssignmentSourceKind(option.value)}
                        className={`rounded-2xl border px-4 py-3 text-left text-xs font-medium transition-all duration-200 ${
                          active
                            ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-100 shadow-[0_0_15px_rgba(6,182,212,0.25)]"
                            : "border-white/10 bg-white/[0.03] text-white/55 hover:border-white/20 hover:text-white"
                        }`}
                      >
                        <span className="inline-flex items-center gap-2">
                          <Icon className="size-4" />
                          {option.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {assignmentSourceKind === "resources" && (
                <div className="rounded-3xl border border-white/12 bg-white/[0.03] p-4.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.25em] font-semibold text-white/45">
                      Select Study Material (Max 6)
                    </span>
                    <span className="text-xs text-cyan-300 font-mono">
                      {assignmentResourceIds.length} selected
                    </span>
                  </div>
                  <div className="grid gap-2.5 lg:grid-cols-2">
                    {professorResources.slice(0, 6).map((resource) => {
                      const checked = assignmentResourceIds.includes(resource.id);
                      return (
                        <button
                          key={resource.id}
                          type="button"
                          onClick={() => toggleAssignmentResource(resource.id)}
                          className={`rounded-2xl border p-3.5 text-left transition-all duration-200 ${
                            checked
                              ? "border-emerald-400/60 bg-emerald-500/15 text-white shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                              : "border-white/10 bg-black/20 text-white/70 hover:border-white/25 hover:bg-black/30"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="block truncate text-sm font-semibold">{resource.title}</span>
                            {checked && (
                              <span className="size-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                            )}
                          </div>
                          <span className="mt-1 block text-xs text-white/45">
                            {resource.subject} • {resource.resourceType}
                          </span>
                        </button>
                      );
                    })}
                    {professorResources.length === 0 && (
                      <div className="col-span-2 rounded-2xl border border-dashed border-white/15 p-5 text-center text-sm text-white/45 bg-white/[0.01]">
                        Upload resources in Study Resources first, or switch to syllabus/content mode above.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {assignmentSourceKind === "syllabus" && (
                <Textarea
                  value={assignmentSyllabus}
                  onChange={(event) => setAssignmentSyllabus(event.target.value)}
                  placeholder="Paste syllabus modules, topics, learning objectives, or unit summaries here..."
                  className="bg-white/[0.04] border-white/12 focus:border-cyan-400/50 rounded-2xl min-h-[100px]"
                />
              )}

              {assignmentSourceKind === "content" && (
                <Textarea
                  value={assignmentContent}
                  onChange={(event) => setAssignmentContent(event.target.value)}
                  placeholder="Paste any custom textbook excerpt, lecture notes, or reference text for GenAI..."
                  className="bg-white/[0.04] border-white/12 focus:border-cyan-400/50 rounded-2xl min-h-[100px]"
                />
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="block text-[10px] uppercase tracking-[0.25em] font-semibold text-white/45">
                    Assignment Duration
                  </span>
                  <Input
                    value={assignmentDueLabel}
                    onChange={(event) => setAssignmentDueLabel(event.target.value)}
                    placeholder="e.g. in 7 days"
                    required
                    className="bg-white/[0.04] border-white/12 focus:border-fuchsia-400/50 rounded-2xl"
                  />
                </label>
                <label className="space-y-2">
                  <span className="block text-[10px] uppercase tracking-[0.25em] font-semibold text-white/45">
                    Question Count
                  </span>
                  <Input
                    type="number"
                    min={1}
                    max={assignmentType === "file" ? 1 : 12}
                    value={assignmentType === "file" ? 1 : assignmentQuestionCount}
                    onChange={(event) => setAssignmentQuestionCount(Number(event.target.value) || 1)}
                    disabled={assignmentType === "file"}
                    placeholder="Number of questions"
                    className="bg-white/[0.04] border-white/12 focus:border-fuchsia-400/50 rounded-2xl"
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full py-3.5 px-6 rounded-2xl border border-purple-400/30 bg-purple-500/15 hover:bg-purple-500/25 text-purple-100 font-semibold text-xs tracking-[0.2em] uppercase shadow-[0_0_20px_rgba(168,85,247,0.2)] active:scale-[0.99] transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 cursor-pointer"
              >
                <Sparkles className="size-4 text-purple-300" />
                <span>{saving ? "Generating Paper via AI..." : "Create AI Assignment Paper"}</span>
              </button>
            </form>
          </Panel>

          <Panel className="p-6 glass-strong border border-white/12 shadow-2xl relative overflow-hidden">
            <div className="flex items-center justify-between gap-3">
              <SectionTitle icon={CheckCircle2} eyebrow="Submission Assessment" title="Grade submission" />
              {selectedReviewItem && (
                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-mono font-semibold uppercase tracking-wider text-emerald-200">
                  Ready to Review
                </span>
              )}
            </div>

            {selectedReviewItem && (
              <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-xl backdrop-blur-2xl">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-[0.25em] text-purple-300">
                      <Sparkles className="size-3.5" />
                      AI Review Snapshot
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-black/40 p-3.5">
                        <div className="text-[10px] uppercase tracking-[0.2em] font-semibold text-white/40">
                          AI Score
                        </div>
                        <div className="mt-1 font-display text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-300 to-purple-200">
                          {selectedReviewScore !== null
                            ? `${selectedReviewScore} / ${selectedReviewTotalPoints}`
                            : "Pending"}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/40 p-3.5">
                        <div className="text-[10px] uppercase tracking-[0.2em] font-semibold text-white/40">
                          AI Grade
                        </div>
                        <div className="mt-1 font-display text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-teal-200">
                          {selectedReviewItem.aiGrade || selectedReviewItem.grade || "Pending"}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/40 p-3.5">
                        <div className="text-[10px] uppercase tracking-[0.2em] font-semibold text-white/40">
                          Submission
                        </div>
                        <div className="mt-1 font-display text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-blue-200">
                          {selectedReviewItem.answerCount
                            ? `${selectedReviewItem.answerCount} answers`
                            : selectedReviewItem.fileName
                              ? "File uploaded"
                              : "Manual"}
                        </div>
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-white/80 font-medium">
                      {selectedReviewItem.aiFeedback || selectedReviewItem.feedback || "No AI feedback available yet."}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-white/45">
                      AI score is an automated evaluation baseline. Professor grade and feedback below will form the final grade.
                    </p>
                  </div>
                  {selectedReviewItem.fileUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        void openProtectedResource(selectedReviewItem.fileUrl || "", {
                          openAndDownload: true,
                          fallbackName: selectedReviewItem.fileName || "assignment-submission",
                        })
                      }
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-500/15 px-4 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/20 shadow-[0_0_12px_rgba(6,182,212,0.2)]"
                    >
                      <Download className="size-3.5" />
                      Download File
                    </button>
                  )}
                </div>

                <div className="mt-4 grid max-h-52 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                  {(selectedReviewItem.aiReview?.criteria ?? []).map((criterion) => (
                    <div key={criterion.label} className="rounded-2xl border border-white/10 bg-black/30 p-3">
                      <div className="text-xs font-semibold text-white">{criterion.label}</div>
                      <div className="mt-1 text-xs text-white/50">{criterion.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={submitReview} className="mt-6 space-y-5">
              <label className="block space-y-2">
                <span className="text-[10px] uppercase tracking-[0.25em] font-semibold text-white/45">
                  Select Student
                </span>
                <Select
                  value={reviewStudentId}
                  onChange={(event) => {
                    setReviewStudentId(event.target.value);
                    setReviewSubmissionId(null);
                    setReviewTitle("");
                    setReviewSubject("");
                    setReviewScore("");
                    setReviewGrade("");
                    setReviewFeedback("");
                  }}
                  required
                  className="bg-white/[0.04] border-white/12 focus:border-fuchsia-400/50 rounded-2xl text-white"
                >
                  <option value="" className="bg-neutral-950 text-white py-2">
                    Select student to evaluate
                  </option>
                  {students.map((student) => (
                    <option key={student.id} value={student.id} className="bg-neutral-950 text-white py-2 font-medium">
                      {student.name} ({student.studentCode})
                    </option>
                  ))}
                </Select>
              </label>

              <div className="grid sm:grid-cols-2 gap-4">
                <label className="space-y-2">
                  <span className="block text-[10px] uppercase tracking-[0.25em] font-semibold text-white/45">
                    Assignment Title
                  </span>
                  <Input
                    value={reviewTitle}
                    onChange={(event) => setReviewTitle(event.target.value)}
                    placeholder="Assignment title"
                    required
                    className="bg-white/[0.04] border-white/12 focus:border-fuchsia-400/50 rounded-2xl"
                  />
                </label>
                <label className="space-y-2">
                  <span className="block text-[10px] uppercase tracking-[0.25em] font-semibold text-white/45">
                    Subject
                  </span>
                  <Input
                    value={reviewSubject}
                    onChange={(event) => setReviewSubject(event.target.value)}
                    placeholder="Subject"
                    required
                    className="bg-white/[0.04] border-white/12 focus:border-fuchsia-400/50 rounded-2xl"
                  />
                </label>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[10px] uppercase tracking-[0.25em] font-semibold text-white/45">
                  Evaluation & Final Grade
                </span>
                <button
                  type="button"
                  onClick={fillAiReviewDraft}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full border border-fuchsia-400/40 bg-fuchsia-500/15 px-3.5 py-1.5 text-xs font-semibold text-fuchsia-200 transition hover:bg-fuchsia-500/25 shadow-[0_0_15px_rgba(217,70,239,0.2)]"
                >
                  <Sparkles className="size-3.5" />
                  Load AI Suggestion
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-[1fr_0.65fr]">
                <label className="block space-y-2">
                  <span className="text-[10px] uppercase tracking-[0.25em] font-semibold text-white/45">
                    Professor Final Marks
                  </span>
                  <Input
                    type="number"
                    min={0}
                    max={selectedReviewTotalPoints}
                    step="1"
                    value={reviewScore}
                    onChange={(event) => {
                      setReviewScore(event.target.value);
                      const score = Number(event.target.value);
                      if (Number.isFinite(score)) {
                        setReviewGrade(gradeCodeFromMarks(score, selectedReviewTotalPoints));
                      }
                    }}
                    placeholder={`Marks out of ${selectedReviewTotalPoints}`}
                    className="bg-white/[0.04] border-white/12 focus:border-fuchsia-400/50 rounded-2xl"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-[10px] uppercase tracking-[0.25em] font-semibold text-white/45">
                    Grade Code
                  </span>
                  <Select
                    value={finalGradeCode}
                    onChange={(event) => setReviewGrade(event.target.value)}
                    aria-label="Professor final grade code"
                    className="bg-white/[0.04] border-white/12 focus:border-fuchsia-400/50 rounded-2xl"
                  >
                    {GRADE_OPTIONS.map((code) => (
                      <option key={code} value={code} className="bg-neutral-950 text-white">
                        {code}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3.5 text-xs leading-5 text-white/50 font-mono">
                Grade Scale: S (90+), A (80+), B (70+), C (60+), D (50+), E (40+), U (&lt;40). Special: P (Pass), F (Fail), W (Withdrawn), I (Incomplete).
              </div>

              <label className="block space-y-2">
                <span className="text-[10px] uppercase tracking-[0.25em] font-semibold text-white/45">
                  Professor Feedback to Student
                </span>
                <Textarea
                  value={reviewFeedback}
                  onChange={(event) => setReviewFeedback(event.target.value)}
                  placeholder="Provide constructive feedback for the student..."
                  className="bg-white/[0.04] border-white/12 focus:border-fuchsia-400/50 rounded-2xl min-h-[90px]"
                />
              </label>

              <button
                type="submit"
                disabled={
                  saving ||
                  !reviewStudentId ||
                  Boolean(reviewSubmissionId && (parsedReviewScore === null || !Number.isFinite(parsedReviewScore)))
                }
                className="w-full py-3.5 px-6 rounded-2xl border border-emerald-400/30 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-100 font-semibold text-xs tracking-[0.2em] uppercase shadow-[0_0_20px_rgba(16,185,129,0.2)] active:scale-[0.99] transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 cursor-pointer"
              >
                <Save className="size-4 text-emerald-300" />
                <span>{saving ? "Publishing Review..." : "Publish Final Review & Save Grade"}</span>
              </button>
            </form>
          </Panel>
        </div>
      </section>

      <section id="profile" className={visible("profile") ? "space-y-5 pt-2" : "hidden"}>
        <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.35em] text-white/45 rounded-full border border-white/10 px-4 py-2">
          <Briefcase className="size-3.5" />
          Faculty identity
        </div>

        <Panel className={isDark ? "relative overflow-hidden p-0" : "cv-profile-card relative overflow-hidden p-0 rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-[#0c0a20] via-[#120e30] to-[#0a1628] shadow-2xl text-white"}>
          {isDark ? (
            <>
              <div className="absolute inset-0" style={{ background: "var(--grad-aurora)" }} />
              <div className="absolute inset-0 opacity-30 grid-bg" />
              <div className="absolute inset-px rounded-[calc(1.5rem-1px)] bg-[#07070a]/75" />
            </>
          ) : (
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-500 via-purple-500 to-transparent" />
          )}
          <div className="relative grid gap-8 p-6 lg:grid-cols-[1.25fr_0.75fr] lg:p-8">
            <div className="flex flex-col sm:flex-row gap-5">
              <div
                className="flex size-24 shrink-0 items-center justify-center rounded-3xl text-2xl font-bold overflow-hidden border border-white/20 shadow-lg shadow-indigo-500/30 text-white"
                style={{ background: "var(--grad-aurora)" }}
              >
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} alt="Faculty Avatar" className="size-full object-cover" />
                ) : (
                  professorInitialsFromName(profile.name)
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className={isDark ? "text-[10px] uppercase tracking-[0.35em] text-white/45" : "text-[10px] font-bold uppercase tracking-[0.35em] text-indigo-300"}>
                  {professor?.verificationStatus ?? "VERIFIED FACULTY"}
                </div>
                <h2 className="mt-1 font-display text-3xl sm:text-4xl font-bold tracking-tight">
                  {profile.name}
                </h2>
                <div className={isDark ? "mt-1.5 text-base text-white/68" : "mt-1.5 text-base font-medium text-indigo-200"}>
                  {profile.designation} / {profile.department}
                </div>
                <p className={isDark ? "mt-3 max-w-2xl text-xs sm:text-sm leading-6 text-white/58" : "mt-3 max-w-2xl text-xs sm:text-sm leading-6 text-indigo-100"}>
                  {profile.bio.trim() ||
                    "Add a short faculty bio to introduce teaching style, academic background, and mentoring focus."}
                </p>
                <div className={isDark ? "mt-4 flex flex-wrap gap-4 text-xs text-white/50" : "mt-4 flex flex-wrap gap-4 text-xs font-medium text-indigo-200"}>
                  <InlineProfileValue
                    icon={Mail}
                    value={profile.email}
                    fallback="Add faculty email"
                  />
                  <InlineProfileValue
                    icon={Phone}
                    value={profile.phone}
                    fallback="Add phone number"
                  />
                  <InlineProfileValue
                    icon={MapPin}
                    value={profile.office}
                    fallback="Add office location"
                  />
                </div>
                <div className="mt-5 flex flex-wrap gap-2.5">
                  <SnapshotStat
                    label="Expertise"
                    value={profile.expertiseField || "Add expertise"}
                  />
                  <SnapshotStat
                    label="Education"
                    value={profile.highestEducation || "Add education"}
                  />
                  <SnapshotStat
                    label="Office Hours"
                    value={profile.officeHours || "Set schedule"}
                  />
                  <SnapshotStat label="Resources" value={String(professorResources.length)} />
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-between gap-4">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={openProfessorEditor}
                  className="glass-strong inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold uppercase tracking-[0.18em] text-white shadow-md backdrop-blur-md transition-all hover:bg-white/25 hover:scale-105 active:scale-95"
                >
                  <Edit3 className="size-3.5 text-amber-300" />
                  <span>Edit Profile</span>
                </button>
              </div>
              <div className={isDark ? "rounded-3xl border border-white/10 bg-black/25 p-5" : "rounded-3xl border border-white/20 bg-white/10 backdrop-blur-md p-5 text-white"}>
                <div className={isDark ? "text-[10px] uppercase tracking-[0.3em] text-white/40" : "text-[10px] font-bold uppercase tracking-[0.3em] text-indigo-200"}>
                  Faculty Completion
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div className="font-display text-4xl font-bold">{profileCompletion}%</div>
                  <div className={isDark ? "max-w-[180px] text-right text-xs text-white/45" : "max-w-[180px] text-right text-xs font-medium text-indigo-200"}>
                    {profileCompletion >= 80
                      ? "Ready for milestone demo"
                      : "Add more faculty details"}
                  </div>
                </div>
                <div className={isDark ? "mt-4 h-2 overflow-hidden rounded-full bg-white/10" : "mt-4 h-2.5 overflow-hidden rounded-full bg-white/20 p-0.5"}>
                  <div
                    className="h-full rounded-full shadow-sm"
                    style={{ width: `${profileCompletion}%`, background: "var(--grad-aurora)" }}
                  />
                </div>
                <div className={isDark ? "mt-4 inline-flex items-start gap-2 text-xs text-white/50" : "mt-4 inline-flex items-start gap-2 text-xs font-medium text-indigo-100"}>
                  <Target className="mt-0.5 size-3.5 shrink-0 text-amber-300" />
                  <span>
                    {profile.focus.trim() ||
                      "Set your academic focus, mentoring goal, or teaching direction."}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Panel>

        <div className="grid gap-4 lg:grid-cols-4">
          {professorHighlights.map((item) => {
            const Icon = item.icon;
            return (
              <Panel key={item.label} className={isDark ? "p-5" : "p-5 border border-slate-200 bg-white shadow-md shadow-slate-200/50 text-slate-900"}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className={`text-[10px] uppercase tracking-[0.3em] ${isDark ? "text-white/35" : "text-slate-500 font-bold"}`}>
                      {item.label}
                    </div>
                    <div className="mt-4 font-display text-3xl font-bold">
                      {item.value}
                    </div>
                    <div className={`mt-2 text-sm ${isDark ? "text-white/45" : "text-slate-500"}`}>{item.hint}</div>
                  </div>
                  <div className={isDark ? "rounded-2xl bg-white/[0.06] p-3" : "rounded-2xl bg-indigo-50 p-3 text-indigo-700 border border-indigo-200"}>
                    <Icon className="size-4" />
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <Panel className={isDark ? "p-5" : "p-6 rounded-3xl border border-slate-200 bg-white shadow-md shadow-slate-200/50 text-slate-900"}>
            <SectionTitle icon={History} eyebrow="Activity" title="Faculty timeline" />
            <div className="mt-6 relative pl-6">
              <div className="absolute bottom-0 left-2 top-0 w-px bg-gradient-to-b from-white/30 via-white/10 to-transparent" />
              {profileTimeline.map((entry, index) => (
                <motion.div
                  key={`${entry.when}-${entry.text}`}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="relative pb-5"
                >
                  <span
                    className="absolute -left-[18px] top-1.5 size-2.5 rounded-full"
                    style={{ background: "var(--grad-aurora)" }}
                  />
                  <div className={`text-[10px] uppercase tracking-[0.3em] ${isDark ? "text-white/40" : "text-slate-500 font-bold"}`}>
                    {entry.when}
                  </div>
                  <div className={`text-sm ${isDark ? "text-white/78" : "text-slate-800 font-semibold"}`}>{entry.text}</div>
                </motion.div>
              ))}
              {profileTimeline.length === 0 && (
                <div className={`text-sm ${isDark ? "text-white/45" : "text-slate-500"}`}>
                  Timeline items will appear here as professor activity grows.
                </div>
              )}
            </div>
          </Panel>

          <div className="space-y-5">
            <Panel className={isDark ? "p-5" : "p-6 rounded-3xl border border-slate-200 bg-white shadow-md shadow-slate-200/50 text-slate-900"}>
              <SectionTitle icon={Sparkles} eyebrow="Teaching stack" title="Skills & strengths" />
              <div className="mt-4 flex flex-wrap gap-2">
                {profile.skills.map((skill) => (
                  <span
                    key={skill}
                    className={isDark ? "glass rounded-full px-3 py-1.5 text-xs text-white/78" : "rounded-full px-3.5 py-1.5 text-xs font-bold bg-indigo-50 text-indigo-900 border border-indigo-200"}
                  >
                    {skill}
                  </span>
                ))}
                {profile.skills.length === 0 && (
                  <div className={`text-sm ${isDark ? "text-white/45" : "text-slate-500"}`}>
                    Add expertise keywords to make the faculty profile richer.
                  </div>
                )}
              </div>
            </Panel>

            <Panel className={isDark ? "p-5" : "p-6 rounded-3xl border border-slate-200 bg-white shadow-md shadow-slate-200/50 text-slate-900"}>
              <SectionTitle
                icon={ShieldCheck}
                eyebrow="Milestones"
                title="Verification & progress"
              />
              <div className="mt-4 grid gap-3">
                {professorMilestones.map((item, index) => (
                  <div
                    key={item.title}
                    className={isDark
                      ? `relative overflow-hidden rounded-2xl border p-4 ${item.earned ? "border-white/15 bg-white/[0.04]" : "border-white/8 bg-black/20"}`
                      : `relative overflow-hidden rounded-2xl border p-4 ${item.earned ? "border-emerald-200 bg-emerald-50/70" : "border-slate-200 bg-slate-50/80"}`
                    }
                  >
                    <div
                      className={`absolute inset-x-0 top-0 h-1 ${item.earned ? "opacity-100" : "opacity-35"}`}
                      style={{
                        background: `linear-gradient(90deg, oklch(0.7 0.25 310), ${
                          index % 2 === 0 ? "oklch(0.82 0.18 200)" : "oklch(0.85 0.12 60)"
                        })`,
                      }}
                    />
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className={`font-medium ${isDark ? "text-white" : "text-slate-900 font-bold"}`}>{item.title}</div>
                        <div className={`mt-1 text-xs ${isDark ? "text-white/45" : "text-slate-500"}`}>{item.detail}</div>
                      </div>
                      <span
                        className={isDark
                          ? `rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] ${item.earned ? "bg-white/10 text-white/70" : "bg-black/25 text-white/35"}`
                          : `rounded-full px-2.5 py-1 text-[10px] uppercase font-bold tracking-[0.22em] ${item.earned ? "bg-emerald-100 text-emerald-800 border border-emerald-300" : "bg-amber-50 text-amber-800 border border-amber-200"}`
                        }
                      >
                        {item.earned ? "Active" : "Pending"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <Panel className={isDark ? "p-5" : "p-6 rounded-3xl border border-slate-200 bg-white shadow-md shadow-slate-200/50 text-slate-900"}>
            <SectionTitle icon={UserCheck} eyebrow="Faculty card" title="Professional overview" />
            <div className="mt-5 grid gap-3">
              <ProfileField label="Designation" value={profile.designation} />
              <ProfileField label="Department" value={profile.department} />
              <ProfileField
                label="Expertise"
                value={profile.expertiseField || "Add faculty expertise"}
              />
              <ProfileField
                label="Education"
                value={profile.highestEducation || "Add highest education"}
              />
              <ProfileField
                label="Office Hours"
                value={profile.officeHours || "Add office hours"}
              />
              <ProfileField
                label="License"
                value={profile.licenseDocumentName || "Not added yet"}
              />
            </div>
          </Panel>

          <Panel className={isDark ? "p-5" : "p-6 rounded-3xl border border-slate-200 bg-white shadow-md shadow-slate-200/50 text-slate-900"}>
            <SectionTitle icon={Briefcase} eyebrow="Milestone-ready" title="Presentation summary" />
            <div className="mt-5 space-y-4">
              <ProfileField
                label="Verification Status"
                value={professor?.verificationStatus ?? "pending"}
              />
              <ProfileField
                label="Assigned Students"
                value={`${students.length} active student records`}
              />
              <ProfileField
                label="Recent Announcements"
                value={`${dashboard?.announcements?.length ?? 0} published notice(s)`}
              />
              <ProfileField
                label="Resource Contribution"
                value={`${professorResources.length} study resource(s) uploaded`}
              />
              <div className={isDark ? "rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-white/58" : "rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm leading-6 text-indigo-950 font-medium"}>
                This faculty profile combines verified identity, mentoring focus, classroom
                oversight, and contribution signals in one polished professor-facing view.
              </div>
            </div>
          </Panel>
        </div>
      </section>

      <section id="connect" className={visible("connect") ? "" : "hidden"}>
        <ConnectHub viewerRole="professor" viewerName={professor?.name ?? "Professor"} />
      </section>

      {showAttendanceHistory && (
        <AttendanceHistoryOverlay
          items={dashboard?.attendance_history ?? []}
          todayDate={attendanceToday?.date}
          onClose={() => setShowAttendanceHistory(false)}
        />
      )}

      <AssignmentDetailDialog
        view={assignmentDetailView}
        assignment={detailAssignment}
        submission={detailSubmission}
        onClose={() => setAssignmentDetailView(null)}
      />

      <Dialog open={isProfileEditOpen} onOpenChange={setIsProfileEditOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto border-white/10 bg-[#0b0b0f] text-white sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Edit Professor Profile</DialogTitle>
            <DialogDescription className="text-white/50">
              This milestone saves faculty profile updates locally so the professor view stays
              polished in the demo.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={saveProfessorProfile} className="space-y-4">
            <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="relative size-16 shrink-0 overflow-hidden rounded-2xl bg-white/10 flex items-center justify-center text-xl font-bold border border-white/10">
                {draftProfile.avatarUrl ? (
                  <img src={draftProfile.avatarUrl} alt="Professor Avatar" className="size-full object-cover" />
                ) : (
                  professorInitialsFromName(draftProfile.name)
                )}
              </div>
              <div className="space-y-2">
                <div className="text-xs font-medium text-white/70">Faculty Profile Photo</div>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200 cursor-pointer transition hover:bg-cyan-400/20">
                    <Upload className="size-3.5" />
                    Upload Photo
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          const url = event.target?.result as string;
                          setDraftProfile((current) => ({ ...current, avatarUrl: url }));
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                  {draftProfile.avatarUrl && (
                    <button
                      type="button"
                      onClick={() => setDraftProfile((current) => ({ ...current, avatarUrl: null }))}
                      className="inline-flex items-center gap-1 rounded-full border border-rose-300/30 bg-rose-400/10 px-3 py-1 text-xs text-rose-200 transition hover:bg-rose-400/20"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                label="Full Name"
                value={draftProfile.name}
                onChange={(value) => setDraftProfile((current) => ({ ...current, name: value }))}
              />
              <FormField
                label="Phone"
                value={draftProfile.phone}
                onChange={(value) => setDraftProfile((current) => ({ ...current, phone: value }))}
              />
              <FormField
                label="Email"
                value={draftProfile.email}
                onChange={(value) => setDraftProfile((current) => ({ ...current, email: value }))}
              />
              <FormField
                label="Office"
                value={draftProfile.office}
                onChange={(value) => setDraftProfile((current) => ({ ...current, office: value }))}
              />
              <FormField
                label="Designation"
                value={draftProfile.designation}
                onChange={(value) =>
                  setDraftProfile((current) => ({ ...current, designation: value }))
                }
              />
              <FormField
                label="Department"
                value={draftProfile.department}
                onChange={(value) =>
                  setDraftProfile((current) => ({ ...current, department: value }))
                }
              />
              <FormField
                label="Expertise"
                value={draftProfile.expertiseField}
                onChange={(value) =>
                  setDraftProfile((current) => ({ ...current, expertiseField: value }))
                }
              />
              <FormField
                label="Office Hours"
                value={draftProfile.officeHours}
                onChange={(value) =>
                  setDraftProfile((current) => ({ ...current, officeHours: value }))
                }
              />
              <FormField
                label="Highest Education"
                value={draftProfile.highestEducation}
                onChange={(value) =>
                  setDraftProfile((current) => ({ ...current, highestEducation: value }))
                }
              />
              <FormField
                label="License Document"
                value={draftProfile.licenseDocumentName}
                onChange={(value) =>
                  setDraftProfile((current) => ({ ...current, licenseDocumentName: value }))
                }
              />
            </div>

            <FormField
              label="Mentoring Focus"
              value={draftProfile.focus}
              onChange={(value) => setDraftProfile((current) => ({ ...current, focus: value }))}
            />

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.28em] text-white/40">Bio</label>
              <textarea
                value={draftProfile.bio}
                onChange={(event) =>
                  setDraftProfile((current) => ({ ...current, bio: event.target.value }))
                }
                rows={4}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/25"
                placeholder="Summarize teaching style, academic background, and faculty role."
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.28em] text-white/40">
                Skills
              </label>
              <input
                value={draftProfile.skills.join(", ")}
                onChange={(event) =>
                  setDraftProfile((current) => ({
                    ...current,
                    skills: event.target.value.split(","),
                  }))
                }
                className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/25"
                placeholder="AI, Mentorship, Research, Classroom Management"
              />
              <div className="text-xs text-white/35">Separate skills with commas.</div>
            </div>

            <DialogFooter className="gap-3 sm:justify-between sm:space-x-0">
              <button
                type="button"
                onClick={() => setIsProfileEditOpen(false)}
                className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/65 transition hover:border-white/20 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-full px-5 py-2 text-sm font-medium text-white"
                style={{ background: "var(--grad-aurora)" }}
              >
                Save Changes
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StudentAssignmentHistory({
  items,
  assignments,
  studentName,
  selectedSubmissionId,
  onOpen,
  className = "",
  listClassName = "max-h-56",
}: {
  items: ReviewLikeItem[];
  assignments?: PublishedAssignment[];
  studentName: string;
  selectedSubmissionId: number | null;
  onOpen: (item: ReviewLikeItem) => void;
  className?: string;
  listClassName?: string;
}) {
  return (
    <div className={`flex min-h-0 flex-col rounded-3xl border border-white/12 bg-white/[0.03] p-4.5 backdrop-blur-xl ${className}`}>
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] font-semibold text-white/40">
            Selected Student Assignments
          </div>
          <div className="mt-1 text-sm font-semibold text-white">{studentName}</div>
        </div>
        <span className="rounded-full border border-cyan-400/30 bg-cyan-500/15 px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-200 shadow-[0_0_10px_rgba(6,182,212,0.2)]">
          {items.length} {items.length === 1 ? "Record" : "Records"}
        </span>
      </div>

      <div className={`mt-3 min-h-0 space-y-2.5 overflow-y-auto pr-1 ${listClassName}`}>
        {items.map((item) => {
          const selected = item.submissionId === selectedSubmissionId;
          const assignment = assignments?.find((row) => row.id === item.assignmentId);
          const totalPoints = assignment?.totalPoints ?? 100;
          const submitted = Boolean(item.submissionId);
          const score =
            typeof item.professorScore === "number"
              ? item.professorScore
              : typeof item.aiScore === "number"
                ? item.aiScore
                : null;
          const grade = submitted ? item.professorGrade || item.aiGrade || item.grade || "Pending" : "Assigned";
          const statusLabel =
            !submitted
              ? "Not submitted"
              : item.status === "professor_reviewed"
              ? "Professor reviewed"
              : item.status === "ai_reviewed"
                ? "AI reviewed"
                : item.status || "Submitted";

          return (
            <button
              key={item.submissionId ?? item.id}
              type="button"
              onClick={() => onOpen(item)}
              className={`group w-full rounded-2xl border p-3.5 text-left transition-all duration-200 ${
                selected
                  ? "border-emerald-400/60 bg-gradient-to-r from-emerald-500/20 via-teal-500/10 to-transparent shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                  : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-white group-hover:text-cyan-200 transition">
                    {item.title}
                  </div>
                  <div className="mt-1 text-xs text-white/40 truncate">
                    {item.subject} • {item.submitted}
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-mono font-medium uppercase tracking-[0.16em] text-white/60">
                  {item.assignmentType === "qa" ? "Q&A" : (item.assignmentType ?? "manual").toUpperCase()}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase tracking-[0.16em]">
                <span
                  className={`rounded-full border px-2.5 py-0.5 font-bold ${
                    submitted
                      ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-200"
                      : "border-white/10 bg-white/5 text-white/45"
                  }`}
                >
                  {score !== null ? `${score}/${totalPoints}` : submitted ? "Marks pending" : "Assigned"}
                </span>
                <span
                  className={`rounded-full border px-2.5 py-0.5 font-bold ${
                    submitted
                      ? "border-fuchsia-400/30 bg-fuchsia-500/15 text-fuchsia-200"
                      : "border-cyan-400/30 bg-cyan-500/15 text-cyan-200"
                  }`}
                >
                  Grade {grade}
                </span>
                <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-white/40">{statusLabel}</span>
                <span className="ml-auto inline-flex items-center gap-1 font-sans text-xs font-medium text-cyan-300 group-hover:translate-x-0.5 transition-transform">
                  <Eye className="size-3.5" />
                  {submitted ? "Open" : "View"}
                </span>
              </div>
            </button>
          );
        })}

        {items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-white/45 bg-white/[0.01]">
            Select a student to view their submitted and assigned coursework here.
          </div>
        )}
      </div>
    </div>
  );
}

function AssignmentDetailDialog({
  view,
  assignment,
  submission,
  onClose,
}: {
  view: AssignmentDetailView | null;
  assignment: PublishedAssignment | null;
  submission: ReviewLikeItem | null;
  onClose: () => void;
}) {
  const answers = submission?.answers ?? {};
  const title = assignment?.title ?? submission?.title ?? "Assignment detail";
  const totalPoints = assignment?.totalPoints ?? 100;
  const aiScore = typeof submission?.aiScore === "number" ? submission.aiScore : null;
  const professorScore = typeof submission?.professorScore === "number" ? submission.professorScore : null;
  const professorGrade = submission?.professorGrade || submission?.grade || "";

  return (
    <Dialog open={Boolean(view)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto border-white/10 bg-[#0b0b0f] text-white sm:max-w-5xl">
        {view && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">{title}</DialogTitle>
              <DialogDescription className="text-white/50">
                {view.kind === "submission"
                  ? "Submitted work, AI review, generated questions, and professor grading context."
                  : "Published AI assignment questions, answer keys, requirements, and rubric."}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 md:grid-cols-4">
              <DetailMetric label="Type" value={assignment?.assignmentType === "qa" ? "Q&A" : (assignment?.assignmentType ?? submission?.assignmentType ?? "manual").toUpperCase()} />
              <DetailMetric label="Subject" value={assignment?.subject ?? submission?.subject ?? "Assignment"} />
              <DetailMetric label="Due" value={assignment?.due ?? "Published"} />
              <DetailMetric label="Total points" value={`${totalPoints}`} />
              {submission && (
                <>
                  <DetailMetric label="Student" value={submission.student} />
                  <DetailMetric label="AI score" value={aiScore !== null ? `${aiScore} / ${totalPoints}` : "Pending"} />
                  <DetailMetric label="AI grade" value={submission.aiGrade || submission.grade || "Pending"} />
                  <DetailMetric
                    label="Faculty marks"
                    value={professorScore !== null ? `${professorScore} / ${totalPoints}` : "Not finalized"}
                  />
                  <DetailMetric label="Faculty grade" value={professorGrade || "Not finalized"} />
                  <DetailMetric
                    label="Submission"
                    value={
                      submission.answerCount
                        ? `${submission.answerCount} answer${submission.answerCount === 1 ? "" : "s"}`
                        : submission.fileName || "Submitted"
                    }
                  />
                </>
              )}
            </div>

            {assignment?.instructions && (
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Instructions</div>
                <p className="mt-2 text-sm leading-6 text-white/70">{assignment.instructions}</p>
              </div>
            )}

            {submission?.aiFeedback && (
              <div className="rounded-3xl border border-fuchsia-300/20 bg-fuchsia-400/10 p-4">
                <div className="text-[10px] uppercase tracking-[0.25em] text-fuchsia-100/70">AI review</div>
                <p className="mt-2 text-sm leading-6 text-white/70">{submission.aiFeedback}</p>
                {(submission.aiReview?.criteria ?? []).length > 0 && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {(submission.aiReview?.criteria ?? []).map((criterion) => (
                      <div key={`${criterion.label}-${criterion.detail}`} className="rounded-2xl bg-black/20 p-3">
                        <div className="text-xs font-medium text-white">{criterion.label}</div>
                        <div className="mt-1 text-xs capitalize text-white/35">{criterion.status.replace("_", " ")}</div>
                        <div className="mt-1 text-xs text-white/55">{criterion.detail}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {submission?.fileUrl && (
              <button
                type="button"
                onClick={() =>
                  void openProtectedResource(submission.fileUrl || "", {
                    openAndDownload: true,
                    fallbackName: submission.fileName || "assignment-submission",
                  })
                }
                className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-white/70 transition hover:text-white"
              >
                <Download className="size-4" />
                Open submitted file
              </button>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Generated questions</div>
                  <div className="mt-1 text-sm text-white/55">
                    {assignment?.questions.length ?? 0} question{assignment?.questions.length === 1 ? "" : "s"}
                  </div>
                </div>
              </div>

              {assignment?.questions.length ? (
                assignment.questions.map((question, index) => {
                  const submittedAnswer = answers[question.id] ?? "";
                  const answerKey = question.answerKey ?? "";
                  return (
                    <div key={question.id} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                        <div className="font-display text-lg">Question {index + 1}</div>
                        <div className="text-xs font-semibold text-white/45">{question.points ?? 0} points</div>
                      </div>
                      <p className="mt-4 text-sm leading-6 text-white/80">{question.prompt}</p>

                      {(question.options ?? []).length > 0 && (
                        <div className="mt-4 grid gap-2">
                          {(question.options ?? []).map((option) => {
                            const selected = submittedAnswer === option.id;
                            const correct = answerKey === option.id;
                            return (
                              <div
                                key={option.id}
                                className={`rounded-2xl border p-3 text-sm ${
                                  selected
                                    ? "border-cyan-300/35 bg-cyan-300/10 text-white"
                                    : correct
                                      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-50"
                                      : "border-white/10 bg-black/15 text-white/60"
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <span className="grid size-7 shrink-0 place-items-center rounded-full border border-white/15 text-xs">
                                    {option.id}
                                  </span>
                                  <span className="leading-6">{option.text}</span>
                                </div>
                                {(selected || correct) && (
                                  <div className="mt-2 text-xs uppercase tracking-[0.18em] text-white/40">
                                    {selected ? "Student selected" : ""}
                                    {selected && correct ? " / " : ""}
                                    {correct ? "Answer key" : ""}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {question.kind === "qa" && submission && (
                        <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-3">
                          <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-100/70">
                            Student answer
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/75">
                            {submittedAnswer || "No answer submitted."}
                          </p>
                        </div>
                      )}

                      {(question.requirements ?? []).length > 0 && (
                        <div className="mt-4 grid gap-2">
                          {(question.requirements ?? []).map((requirement) => (
                            <div key={requirement} className="rounded-2xl bg-black/20 px-3 py-2 text-sm text-white/65">
                              {requirement}
                            </div>
                          ))}
                        </div>
                      )}

                      {answerKey && (
                        <div className="mt-3 text-xs text-emerald-200">Answer key: {answerKey}</div>
                      )}
                      {question.explanation && (
                        <div className="mt-2 text-xs leading-5 text-white/45">{question.explanation}</div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="rounded-3xl border border-dashed border-white/15 py-8 text-center text-sm text-white/45">
                  Generated question details were not found for this item.
                </div>
              )}
            </div>

            {(assignment?.rubric ?? []).length > 0 && (
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Rubric</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {(assignment?.rubric ?? []).map((item) => (
                    <div key={item.label} className="rounded-2xl bg-black/20 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-white">{item.label}</div>
                        <div className="text-xs text-emerald-200">{item.points ?? 0} pts</div>
                      </div>
                      <div className="mt-1 text-xs leading-5 text-white/45">{item.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">{label}</div>
      <div className="mt-1 truncate text-sm font-medium text-white">{value}</div>
    </div>
  );
}

function MetricCard({ metric }: { metric: ProfessorDashboard["metrics"][number] }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const textColor =
    metric.tone === "green"
      ? isDark ? "text-emerald-300" : "text-emerald-700"
      : metric.tone === "pink"
        ? isDark ? "text-fuchsia-300" : "text-purple-700"
        : metric.tone === "amber"
          ? isDark ? "text-amber-200" : "text-amber-700"
          : isDark ? "text-cyan-300" : "text-sky-700";

  const lightBoxStyle =
    metric.tone === "green"
      ? "bg-emerald-50/95 border-2 border-emerald-400/90 shadow-md shadow-emerald-200/50 text-slate-900"
      : metric.tone === "pink"
        ? "bg-purple-50/95 border-2 border-purple-400/90 shadow-md shadow-purple-200/50 text-slate-900"
        : metric.tone === "amber"
          ? "bg-amber-50/95 border-2 border-amber-400/90 shadow-md shadow-amber-200/50 text-slate-900"
          : "bg-sky-50/95 border-2 border-sky-400/90 shadow-md shadow-sky-200/50 text-slate-900";

  return (
    <Panel className={isDark ? "p-5" : `p-5 rounded-3xl transition-all ${lightBoxStyle}`}>
      <div className={`text-[10px] font-bold uppercase tracking-[0.3em] ${
        isDark ? "text-white/40" : "text-slate-600"
      }`}>{metric.label}</div>
      <div className={`mt-5 font-display text-4xl font-extrabold ${textColor}`}>{metric.value}</div>
      <div className={`mt-2 text-xs font-medium ${
        isDark ? "text-white/45" : "text-slate-600"
      }`}>{metric.hint}</div>
    </Panel>
  );
}

function AttendanceRatioChart({
  data,
  compact = false,
}: {
  data: ProfessorDashboard["attendance_summary"];
  compact?: boolean;
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const maxStudents = Math.max(
    ...data.map((item) => item.totalStudents),
    ...data.map((item) => item.marked),
    1,
  );
  return (
    <div className={compact ? "mt-4" : "mt-6"}>
      <div className="flex items-center gap-4 text-xs font-semibold">
        <span className="inline-flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-cyan-400" />
          <span className={isDark ? "text-white/60" : "text-slate-700"}>Present</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-rose-400" />
          <span className={isDark ? "text-white/60" : "text-slate-700"}>Absent</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span className={`size-2.5 rounded-full ${isDark ? "bg-white/30" : "bg-slate-300"}`} />
          <span className={isDark ? "text-white/60" : "text-slate-700"}>Unmarked</span>
        </span>
      </div>
      <div className={`${compact ? "mt-4 h-44" : "mt-5 h-56"} flex items-end gap-3 sm:gap-5`}>
        {data.map((item) => (
          <div
            key={item.date}
            className="group/date relative flex-1 min-w-0 outline-none"
            tabIndex={0}
            aria-label={`${item.label}: ${item.present} present, ${item.absent} absent, ${item.unmarked} unmarked`}
          >
            <div className={`pointer-events-none absolute left-1/2 top-0 z-20 w-44 -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-2xl p-3 text-xs opacity-0 shadow-2xl backdrop-blur-xl transition duration-150 group-hover/date:opacity-100 group-focus/date:opacity-100 ${
              isDark ? "border border-white/12 bg-[#080808]/95 text-white" : "border border-slate-200 bg-white/98 text-slate-900 shadow-slate-300/40"
            }`}>
              <div className={`mb-2 truncate font-display text-sm font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{item.label}</div>
              <div className="space-y-1.5">
                <ChartTooltipRow color="bg-cyan-400" label="Present" value={item.present} />
                <ChartTooltipRow color="bg-rose-400" label="Absent" value={item.absent} />
                <ChartTooltipRow color={isDark ? "bg-white/30" : "bg-slate-300"} label="Unmarked" value={item.unmarked} />
              </div>
            </div>
            <div
              className={`${compact ? "h-32" : "h-44"} flex transform-gpu items-end justify-center gap-1.5 border-b transition duration-200 ease-out group-hover/date:-translate-y-1 group-focus/date:-translate-y-1 ${
                isDark ? "border-white/10" : "border-slate-200"
              }`}
            >
              <div
                className="w-full max-w-8 origin-bottom transform-gpu rounded-t-xl bg-gradient-to-t from-cyan-600 via-cyan-500 to-emerald-400 transition-transform duration-200 ease-out group-hover/date:scale-y-105 group-focus/date:scale-y-105 shadow-xs"
                style={{
                  height: item.present
                    ? `${Math.max(8, (item.present / maxStudents) * 100)}%`
                    : "0%",
                }}
              />
              <div
                className="w-full max-w-8 origin-bottom transform-gpu rounded-t-xl bg-gradient-to-t from-rose-600 via-rose-500 to-amber-400 transition-transform duration-200 ease-out group-hover/date:scale-y-105 group-focus/date:scale-y-105 shadow-xs"
                style={{
                  height: item.absent ? `${Math.max(8, (item.absent / maxStudents) * 100)}%` : "0%",
                }}
              />
              <div
                className={`w-full max-w-8 origin-bottom transform-gpu rounded-t-xl transition-transform duration-200 ease-out group-hover/date:scale-y-105 group-focus/date:scale-y-105 ${
                  isDark ? "bg-white/15" : "bg-slate-200/90 border border-slate-300/40"
                }`}
                style={{ height: `${Math.max(10, (item.unmarked / maxStudents) * 100)}%` }}
              />
            </div>
            <div className={`mt-2 text-center text-[10px] font-semibold uppercase tracking-[0.16em] truncate ${
              isDark ? "text-white/40" : "text-slate-500"
            }`}>
              {item.label}
            </div>
            <div className={`mt-1 text-center text-xs font-bold ${
              isDark ? "text-white/65" : "text-slate-900"
            }`}>
              {item.present}/{item.absent}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartTooltipRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-2">
        <span className={`size-2 rounded-full ${color}`} />
        {label}
      </span>
      <span className="font-display text-white">{value}</span>
    </div>
  );
}

function ResourceHistoryRow({
  item,
  disabled,
  onDelete,
}: {
  item: ProfessorDashboard["resources"][number];
  disabled?: boolean;
  onDelete: () => void;
}) {
  const href = resolveResourceUrl(item.url);
  const downloadHref = href ? `${href}${href.includes("?") ? "&" : "?"}download=true` : "";
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <button
          type="button"
          onClick={() => href && window.open(href, "_blank", "noopener,noreferrer")}
          disabled={!href}
          className="min-w-0 text-left disabled:cursor-not-allowed"
        >
          <div className="flex items-center gap-3">
            <span className="size-11 shrink-0 rounded-2xl bg-white/10 flex items-center justify-center">
              <FileText className="size-4 text-cyan-200" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{item.title}</span>
              <span className="mt-1 block text-xs text-white/45">
                {item.subject} / {item.resourceType} / {item.time}
              </span>
            </span>
          </div>
        </button>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={onDelete}
            disabled={disabled}
            className="rounded-full border border-rose-300/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-100 inline-flex items-center gap-1.5 transition hover:border-rose-200/40 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="size-3.5" />
            Delete
          </button>
          <a
            href={href || undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!href}
            className={`glass rounded-full px-3 py-2 text-xs inline-flex items-center gap-1.5 transition hover:border-white/25 ${
              href ? "text-white/70 hover:text-white" : "pointer-events-none text-white/30"
            }`}
          >
            <Eye className="size-3.5" />
            Open
          </a>
          <a
            href={downloadHref || undefined}
            download
            aria-disabled={!href}
            className={`glass rounded-full px-3 py-2 text-xs inline-flex items-center gap-1.5 transition hover:border-white/25 ${
              href ? "text-white/70 hover:text-white" : "pointer-events-none text-white/30"
            }`}
          >
            <Download className="size-3.5" />
            Download
          </a>
        </div>
      </div>
    </div>
  );
}

function SearchableOptionInput({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  required = false,
}: {
  id: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const normalizedValue = value.trim().toLowerCase();
  const filteredOptions = useMemo(() => {
    const exactSelection = options.some((option) => option.toLowerCase() === normalizedValue);
    if (!normalizedValue || exactSelection) return options;
    return options.filter((option) => option.toLowerCase().includes(normalizedValue));
  }, [normalizedValue, options]);

  return (
    <div className="relative">
      {label && (
        <span className="mb-2 block text-[10px] uppercase tracking-[0.28em] text-white/35">
          {label}
        </span>
      )}
      <div className="relative">
        <input
          id={id}
          value={value}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
          placeholder={placeholder}
          required={required}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-menu`}
          autoComplete="off"
          className="w-full rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 pr-11 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-white/25"
        />
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpen((value) => !value)}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-white/45 transition hover:text-white"
          aria-label="Open options"
        >
          <ChevronDown className={`size-4 transition ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <div
          id={`${id}-menu`}
          className="absolute left-0 right-0 top-[calc(100%+8px)] z-[80] max-h-72 overflow-y-auto rounded-2xl border border-white/12 bg-[#101010]/98 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl"
          role="listbox"
        >
          {filteredOptions.map((option) => (
            <button
              key={option}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
              className={`block w-full rounded-xl px-3 py-2.5 text-left text-sm transition ${
                option === value
                  ? "bg-white/12 text-white"
                  : "text-white/65 hover:bg-white/8 hover:text-white"
              }`}
              role="option"
              aria-selected={option === value}
            >
              {option}
            </button>
          ))}
          {filteredOptions.length === 0 && (
            <div className="px-3 py-4 text-sm text-white/40">No matching option.</div>
          )}
        </div>
      )}
    </div>
  );
}

function CgpaYearChart({ data }: { data: ProfessorDashboard["cgpa_years"] }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const fullYearsData = useMemo(() => {
    const yearMap = new Map(data.map((item) => [item.year.toLowerCase(), item.averageCgpa]));
    return [
      { year: "Year 1", averageCgpa: yearMap.get("year 1") ?? 8.2 },
      { year: "Year 2", averageCgpa: yearMap.get("year 2") ?? (data[0]?.averageCgpa ?? 8.67) },
      { year: "Year 3", averageCgpa: yearMap.get("year 3") ?? 8.45 },
      { year: "Year 4", averageCgpa: yearMap.get("year 4") ?? 8.8 },
    ];
  }, [data]);

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between text-xs font-semibold">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500" />
          <span className={isDark ? "text-white/70" : "text-slate-700"}>Average CGPA per Batch</span>
        </div>
        <span className={`text-[11px] font-mono font-bold ${isDark ? "text-indigo-300" : "text-indigo-600"}`}>
          Scale: 10.0 CGPA
        </span>
      </div>

      <div className={`relative rounded-2xl p-4 border ${
        isDark ? "border-white/10 bg-black/20" : "border-slate-200/80 bg-slate-50/70"
      }`}>
        <div className="pointer-events-none absolute inset-x-4 top-4 bottom-10 flex flex-col justify-between text-[9px] font-mono text-slate-400 opacity-30">
          <div className="border-b border-dashed border-current pb-0.5">10.0</div>
          <div className="border-b border-dashed border-current pb-0.5">7.5</div>
          <div className="border-b border-dashed border-current pb-0.5">5.0</div>
          <div className="border-b border-dashed border-current pb-0.5">2.5</div>
        </div>

        <div className="relative z-10 h-48 flex items-end justify-around gap-3 pt-6">
          {fullYearsData.map((item) => {
            const heightPercent = Math.min(100, Math.max(10, (item.averageCgpa / 10) * 100));
            return (
              <div key={item.year} className="group flex flex-col items-center flex-1 max-w-[72px] min-w-0">
                <div className={`mb-2 rounded-full px-2 py-0.5 text-[10px] font-bold font-mono transition-transform duration-200 group-hover:-translate-y-1 shadow-2xs ${
                  isDark
                    ? "bg-indigo-500/20 text-indigo-200 border border-indigo-500/30"
                    : "bg-indigo-100 text-indigo-900 border border-indigo-200"
                }`}>
                  {item.averageCgpa.toFixed(2)}
                </div>

                <div className={`w-full h-36 flex items-end rounded-xl p-1 border ${
                  isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white/80"
                }`}>
                  <div
                    className="w-full origin-bottom transform-gpu rounded-lg bg-gradient-to-t from-indigo-600 via-purple-500 to-pink-500 shadow-md shadow-indigo-500/20 transition-all duration-300 ease-out group-hover:brightness-110 group-hover:scale-y-[1.02]"
                    style={{ height: `${heightPercent}%` }}
                    title={`${item.year}: ${item.averageCgpa} CGPA`}
                  />
                </div>

                <div className={`mt-2 text-center text-[10px] font-bold uppercase tracking-[0.14em] truncate ${
                  isDark ? "text-white/60" : "text-slate-700"
                }`}>
                  {item.year}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AttendanceHistoryOverlay({
  items,
  todayDate,
  onClose,
}: {
  items: ProfessorDashboard["attendance_history"];
  todayDate?: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState(todayDate ?? "");
  const [statusFilter, setStatusFilter] = useState<"all" | AttendanceStatus | "warning">("all");

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesDate = !dateFilter || item.date === dateFilter;
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const matchesQuery =
        !normalizedQuery ||
        [item.student, item.studentCode, item.markedBy, item.status, item.date]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      return matchesDate && matchesStatus && matchesQuery;
    });
  }, [dateFilter, items, query, statusFilter]);

  const presentCount = filteredItems.filter((item) => item.status === "present").length;
  const absentCount = filteredItems.filter((item) => item.status === "absent").length;
  const warningCount = filteredItems.filter((item) => item.status === "warning").length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-xl px-4 py-5 md:px-8 md:py-8"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        onMouseDown={(event) => event.stopPropagation()}
        className="mx-auto flex h-[calc(100vh-40px)] max-w-7xl flex-col overflow-hidden rounded-[28px] border border-white/12 bg-[#070707]/95 shadow-2xl md:h-[calc(100vh-64px)]"
      >
        <div className="border-b border-white/10 p-5 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <SectionTitle
              icon={History}
              eyebrow="Attendance history"
              title="Marked present & absent"
            />
            <button
              onClick={onClose}
              className="glass inline-flex size-11 items-center justify-center rounded-full text-white/65 transition hover:text-white lg:ml-auto"
              aria-label="Close attendance history"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_180px_240px]">
            <label className="glass rounded-2xl px-4 py-3 flex items-center gap-3">
              <Search className="size-4 text-white/45" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search student, roll number, professor"
                className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-white/35 focus:outline-none"
              />
            </label>
            <input
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              className="glass rounded-2xl px-4 py-3 text-sm text-white [color-scheme:dark] focus:outline-none focus:border-white/30"
            />
            <label className="glass rounded-2xl px-4 py-3">
              <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-white/35">
                Status filter
              </div>
              <div className="relative">
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as "all" | AttendanceStatus | "warning")
                  }
                  className="w-full appearance-none bg-transparent pr-10 text-sm text-white focus:outline-none"
                >
                  <option value="all" className="bg-[#101010] text-white">
                    All statuses
                  </option>
                  <option value="present" className="bg-[#101010] text-white">
                    Present only
                  </option>
                  <option value="absent" className="bg-[#101010] text-white">
                    Absent only
                  </option>
                  <option value="warning" className="bg-[#101010] text-white">
                    Warning only
                  </option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-0 top-1/2 size-4 -translate-y-1/2 text-white/45" />
              </div>
            </label>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <MiniStat label="Records" value={String(filteredItems.length)} tone="text-cyan-200" />
            <MiniStat label="Present" value={String(presentCount)} tone="text-emerald-200" />
            <MiniStat label="Absent" value={String(absentCount)} tone="text-rose-100" />
            <MiniStat label="Warnings" value={String(warningCount)} tone="text-amber-100" />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-5 md:p-6">
          <div className="hidden overflow-hidden rounded-3xl border border-white/10 lg:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.03] text-[10px] uppercase tracking-[0.25em] text-white/40">
                <tr>
                  <th className="px-5 py-4">Student</th>
                  <th className="px-5 py-4">Roll number</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Date</th>
                  <th className="px-5 py-4">Time</th>
                  <th className="px-5 py-4">Marked by</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.id} className="border-t border-white/10">
                    <td className="px-5 py-4 font-medium">{item.student}</td>
                    <td className="px-5 py-4 text-white/50">{item.studentCode || "CV-2026"}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs capitalize ${
                          item.status === "present"
                            ? "bg-emerald-400/10 text-emerald-200"
                            : item.status === "absent"
                              ? "bg-rose-500/10 text-rose-100"
                              : "bg-amber-400/10 text-amber-100"
                        }`}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {item.status === "warning" && <AlertTriangle className="size-3.5" />}
                          {item.status === "warning" ? "Needs tick" : item.status}
                        </span>
                      </span>
                    </td>
                    <td className="px-5 py-4 text-white/60">{formatDateOnly(item.date)}</td>
                    <td className="px-5 py-4 text-white/60">{formatTimeOnly(item.markedAt)}</td>
                    <td className="px-5 py-4 text-white/50">{item.markedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 lg:hidden">
            {filteredItems.map((item) => (
              <div key={item.id} className="glass rounded-2xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{item.student}</div>
                    <div className="mt-1 text-xs text-white/40">
                      {item.studentCode || item.date}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs capitalize ${
                      item.status === "present"
                        ? "bg-emerald-400/10 text-emerald-200"
                        : item.status === "absent"
                          ? "bg-rose-500/10 text-rose-100"
                          : "bg-amber-400/10 text-amber-100"
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {item.status === "warning" && <AlertTriangle className="size-3.5" />}
                      {item.status === "warning" ? "Needs tick" : item.status}
                    </span>
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-white/55">
                  <div>{formatDateOnly(item.date)}</div>
                  <div className="text-right">{formatTimeOnly(item.markedAt)}</div>
                  <div className="col-span-2 text-white/40">{item.markedBy}</div>
                </div>
              </div>
            ))}
          </div>

          {filteredItems.length === 0 && (
            <div className="grid min-h-[260px] place-items-center rounded-3xl border border-dashed border-white/15 text-sm text-white/45">
              No attendance records found.
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function StatusPill({ student }: { student: ProfessorStudent }) {
  if (student.isBlocked) {
    return (
      <span className="rounded-full bg-rose-500/10 px-3 py-1 text-xs text-rose-100">Blocked</span>
    );
  }
  if (student.attendance < 75) {
    return (
      <span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs text-amber-100">Watch</span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">Safe</span>
  );
}

function BiometricPill({ student }: { student: ProfessorStudent }) {
  if (student.attendanceWarning) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/10 px-3 py-1 text-xs text-amber-100">
        <AlertTriangle className="size-3.5" />
        Needs tick
      </span>
    );
  }
  if (student.professorConfirmed) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
        <CheckCircle2 className="size-3.5" />
        Confirmed
      </span>
    );
  }
  if (student.biometricVerified) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">
        <CheckCircle2 className="size-3.5" />
        Verified
      </span>
    );
  }
  if (student.withinRadius) {
    return (
      <span className="rounded-full bg-fuchsia-300/10 px-3 py-1 text-xs text-fuchsia-100">
        Inside radius
      </span>
    );
  }
  return (
    <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/45">
      Needs biometric
    </span>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <div className={`rounded-2xl border p-3.5 transition-all ${
      isDark ? "border-white/10 bg-white/[0.04]" : "border-slate-200/90 bg-white/95 shadow-2xs text-slate-900"
    }`}>
      <div className={`text-[10px] font-bold uppercase tracking-[0.18em] truncate ${isDark ? "text-white/40" : "text-slate-500"}`}>{label}</div>
      <div className={`mt-2 font-display text-2xl font-bold truncate ${tone}`}>{value}</div>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <div className={isDark ? "glass rounded-2xl p-4" : "rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs text-slate-900"}>
      <div className={`text-[10px] uppercase tracking-[0.25em] ${isDark ? "text-white/35" : "text-indigo-600 font-bold"}`}>{label}</div>
      <div className={`mt-2 text-sm break-words ${isDark ? "text-white/75" : "text-slate-900 font-semibold"}`}>{value}</div>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] uppercase tracking-[0.28em] text-white/40">{label}</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/25"
      />
    </div>
  );
}

function InlineProfileValue({
  icon: Icon,
  value,
  fallback,
}: {
  icon: ComponentType<{ className?: string }>;
  value: string;
  fallback: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-indigo-100 font-medium">
      <Icon className="size-4 text-indigo-300 shrink-0" />
      {value.trim() || <span className="text-indigo-200/70 font-normal">{fallback}</span>}
    </span>
  );
}

function SnapshotStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 backdrop-blur-md">
      <div className="text-[9px] font-bold uppercase tracking-[0.25em] text-indigo-200">{label}</div>
      <div className="mt-0.5 font-display text-sm font-bold text-white truncate">{value}</div>
    </div>
  );
}

function AttendanceButton({
  status,
  active,
  disabled,
  onClick,
}: {
  status: AttendanceStatus;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const isPresent = status === "present";
  const Icon = isPresent ? CheckCircle2 : XCircle;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`transform-gpu rounded-full px-3 py-2 text-[10px] uppercase tracking-[0.16em] transition duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 ${
        active
          ? isPresent
            ? "bg-emerald-400/20 border border-emerald-200/40 text-emerald-100"
            : "bg-rose-500/20 border border-rose-200/40 text-rose-100"
          : "glass text-white/60 hover:text-white"
      }`}
    >
      <span className="inline-flex items-center gap-1.5">
        <Icon className="size-3.5" />
        {status}
      </span>
    </button>
  );
}

function SearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="glass rounded-full px-4 py-3 flex items-center gap-3 w-full lg:max-w-md">
      <Search className="size-4 text-white/45" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search by name, address, roll number"
        className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-white/35 focus:outline-none"
      />
    </label>
  );
}

function Panel({
  id,
  className = "",
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      id={id}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass-strong rounded-3xl ${className}`}
    >
      {children}
    </motion.div>
  );
}

function SectionTitle({
  icon: Icon,
  eyebrow,
  title,
}: {
  icon: ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="size-10 rounded-2xl bg-white/10 flex items-center justify-center">
        <Icon className="size-4 text-white/70" />
      </span>
      <div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">{eyebrow}</div>
        <h2 className="font-display text-2xl">{title}</h2>
      </div>
    </div>
  );
}

function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full glass rounded-2xl px-4 py-3 text-sm text-white placeholder-white/35 focus:outline-none focus:border-white/30 transition"
    />
  );
}

function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      rows={4}
      className="w-full glass rounded-2xl px-4 py-3 text-sm text-white placeholder-white/35 focus:outline-none focus:border-white/30 transition resize-none"
    />
  );
}

function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="w-full rounded-2xl border border-white/10 bg-neutral-950 px-4 py-3 text-sm text-white focus:border-white/30 focus:outline-none transition"
    />
  );
}

function ActionButton({
  disabled,
  icon: Icon,
  children,
}: {
  disabled?: boolean;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="relative w-full rounded-full px-5 py-3.5 text-xs uppercase tracking-[0.2em] font-bold text-white overflow-hidden transition-all duration-200 hover:opacity-95 shadow-lg shadow-indigo-500/25 disabled:opacity-60 disabled:cursor-wait"
      style={{ background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #d946ef 100%)" }}
    >
      <span className="relative z-10 inline-flex items-center justify-center gap-2 text-white font-bold">
        <Icon className="size-4 text-white" />
        <span className="text-white font-bold">{children}</span>
      </span>
    </button>
  );
}

function MiniItem({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-1 text-xs text-white/40">{meta}</div>
    </div>
  );
}

function formatDateTime(value: string) {
  if (!value) return "";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateOnly(value: string) {
  if (!value) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeOnly(value: string) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
