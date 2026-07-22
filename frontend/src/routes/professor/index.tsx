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
  createProfessorAnnouncement,
  createProfessorResource,
  deleteProfessorResource,
  finalizeProfessorAttendance,
  getProfessorDashboard,
  markProfessorAttendance,
  resolveResourceUrl,
  reviewProfessorAssignment,
  updateStudentBlock,
  type ProfessorDashboard,
} from "@/lib/api";
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
type AttendanceStatus = "present" | "absent";
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

  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementCategory, setAnnouncementCategory] = useState("Academic");
  const [announcementAudience, setAnnouncementAudience] = useState("All students");
  const [announcementBody, setAnnouncementBody] = useState("");
  const [announcementPinned, setAnnouncementPinned] = useState(true);

  const [resourceSubject, setResourceSubject] = useState(STUDY_SUBJECTS[0]);
  const [resourceFile, setResourceFile] = useState<File | null>(null);
  const [resourceFileKey, setResourceFileKey] = useState(0);
  const [resourceSearch, setResourceSearch] = useState("");
  const [resourceSubjectFilter, setResourceSubjectFilter] = useState("");
  const [resourceDateFilter, setResourceDateFilter] = useState("");

  const [reviewStudentId, setReviewStudentId] = useState("");
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewSubject, setReviewSubject] = useState("");
  const [reviewGrade, setReviewGrade] = useState("");
  const [reviewFeedback, setReviewFeedback] = useState("");
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
        if (!reviewStudentId && data.review_queue[0]) {
          loadReview(data.review_queue[0]);
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
    if (activeSection !== "academics" || academicTab !== "attendance") {
      return;
    }

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
  }, [activeSection, academicTab, refresh]);

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

  function loadReview(item: ProfessorDashboard["review_queue"][number]) {
    setReviewStudentId(String(item.studentId));
    setReviewTitle(item.title);
    setReviewSubject(item.subject);
    setReviewGrade("");
    setReviewFeedback("");
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
      await action();
      await refresh();
      setStatus(message);
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
                  biometricCheckIn: "checkIn" in result ? result.checkIn : item.biometricCheckIn,
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

  async function submitAnnouncement(event: FormEvent) {
    event.preventDefault();
    await runAction(
      () =>
        createProfessorAnnouncement({
          title: announcementTitle,
          category: announcementCategory,
          audience: announcementAudience,
          body: announcementBody,
          pinned: announcementPinned,
        }),
      "Announcement published",
    );
    setAnnouncementTitle("");
    setAnnouncementBody("");
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

  async function deleteResource(item: ProfessorDashboard["resources"][number]) {
    const shouldDelete = window.confirm(`Delete "${item.title}" from study resources?`);
    if (!shouldDelete) return;
    await runAction(() => deleteProfessorResource(item.id), "Study resource deleted");
  }

  async function submitReview(event: FormEvent) {
    event.preventDefault();
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

  function saveProfessorProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextProfile = {
      ...draftProfile,
      skills: Array.from(
        new Set(draftProfile.skills.map((skill) => skill.trim()).filter(Boolean)),
      ).slice(0, 8),
    };
    setProfile(nextProfile);
    setDraftProfile(nextProfile);
    setStoredProfessorProfile(nextProfile);
    setIsProfileEditOpen(false);
    setStatus("Professor profile updated locally for the demo");
  }

  return (
    <div className="space-y-8">
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
                className="size-12 rounded-2xl flex items-center justify-center text-sm font-semibold"
                style={{ background: "var(--grad-aurora)" }}
              >
                {professor?.avatar ?? "PR"}
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
                        className={`transform-gpu rounded-full px-3 py-2 text-[10px] uppercase tracking-[0.18em] transition duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 ${
                          student.isBlocked
                            ? "bg-emerald-400/10 border border-emerald-200/30 text-emerald-100 hover:bg-emerald-400/20"
                            : "bg-rose-500/10 border border-rose-200/25 text-rose-100 hover:bg-rose-500/20"
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
            <div className="glass rounded-full p-1 flex w-full max-w-sm">
              {(["attendance", "cgpa"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setAcademicTab(tab)}
                  className={`flex-1 rounded-full px-4 py-2 text-xs uppercase tracking-[0.2em] transition ${
                    academicTab === tab
                      ? "bg-white/15 text-white"
                      : "text-white/45 hover:text-white"
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

              <div className="grid xl:grid-cols-[0.8fr_1.2fr] gap-4">
                <div className="glass rounded-3xl p-5">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">
                    Today ratio
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <MiniStat
                      label="Present"
                      value={String(attendanceToday?.present ?? 0)}
                      tone="text-emerald-200"
                    />
                    <MiniStat
                      label="Absent"
                      value={String(attendanceToday?.absent ?? 0)}
                      tone="text-rose-100"
                    />
                    <MiniStat
                      label="Unmarked"
                      value={String(attendanceToday?.unmarked ?? 0)}
                      tone="text-white/65"
                    />
                    <MiniStat
                      label="Verified"
                      value={String(attendanceToday?.biometricVerified ?? 0)}
                      tone="text-cyan-200"
                    />
                    <MiniStat
                      label="Warnings"
                      value={String(attendanceToday?.warnings ?? 0)}
                      tone="text-amber-100"
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
            <div className="mt-6 min-h-[240px] rounded-3xl border border-white/10 bg-white/[0.02]" />
          )}
        </Panel>
      </section>

      <section
        className={visible("announcements") || visible("resources") ? "grid gap-5" : "hidden"}
      >
        <Panel id="announcements" className={visible("announcements") ? "p-5" : "hidden"}>
          <SectionTitle icon={Megaphone} eyebrow="Announcements" title="Publish campus update" />
          <form onSubmit={submitAnnouncement} className="mt-5 space-y-4">
            <Input
              value={announcementTitle}
              onChange={(event) => setAnnouncementTitle(event.target.value)}
              placeholder="Announcement title"
              required
            />
            <div className="grid sm:grid-cols-2 gap-3">
              <Input
                value={announcementCategory}
                onChange={(event) => setAnnouncementCategory(event.target.value)}
                placeholder="Category"
                required
              />
              <Input
                value={announcementAudience}
                onChange={(event) => setAnnouncementAudience(event.target.value)}
                placeholder="Audience"
                required
              />
            </div>
            <Textarea
              value={announcementBody}
              onChange={(event) => setAnnouncementBody(event.target.value)}
              placeholder="Write the announcement body"
              required
            />
            <label className="flex items-center gap-3 text-sm text-white/60">
              <input
                type="checkbox"
                checked={announcementPinned}
                onChange={(event) => setAnnouncementPinned(event.target.checked)}
                className="size-4 accent-fuchsia-400"
              />
              Pin for students
            </label>
            <ActionButton disabled={saving} icon={Send}>
              Publish announcement
            </ActionButton>
          </form>
          <div className="mt-6 space-y-3">
            {(dashboard?.announcements ?? []).slice(0, 3).map((item) => (
              <MiniItem
                key={item.id}
                title={item.title}
                meta={`${item.category} / ${item.audience}`}
              />
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
        className={visible("reviews") ? "grid xl:grid-cols-[0.9fr_1.1fr] gap-5" : "hidden"}
      >
        <Panel className="p-5">
          <SectionTitle icon={ClipboardCheck} eyebrow="Submitted work" title="Review queue" />
          <div className="mt-5 space-y-3">
            {(dashboard?.review_queue ?? []).map((item) => (
              <button
                key={item.id}
                onClick={() => loadReview(item)}
                className="w-full text-left glass rounded-2xl p-4 hover:border-white/20 transition"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-sm">{item.title}</div>
                  <span
                    className={`text-[10px] uppercase tracking-[0.2em] ${item.priority === "high" ? "text-rose-200" : "text-white/40"}`}
                  >
                    {item.priority}
                  </span>
                </div>
                <div className="mt-1 text-xs text-white/45">
                  {item.student} / {item.submitted}
                </div>
              </button>
            ))}
          </div>
        </Panel>

        <Panel className="p-5">
          <SectionTitle icon={CheckCircle2} eyebrow="Assignment review" title="Grade submission" />
          <form onSubmit={submitReview} className="mt-5 space-y-4">
            <Select
              value={reviewStudentId}
              onChange={(event) => setReviewStudentId(event.target.value)}
              required
            >
              <option value="">Select student</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}
                </option>
              ))}
            </Select>
            <div className="grid sm:grid-cols-2 gap-3">
              <Input
                value={reviewTitle}
                onChange={(event) => setReviewTitle(event.target.value)}
                placeholder="Assignment title"
                required
              />
              <Input
                value={reviewSubject}
                onChange={(event) => setReviewSubject(event.target.value)}
                placeholder="Subject"
                required
              />
            </div>
            <Input
              value={reviewGrade}
              onChange={(event) => setReviewGrade(event.target.value)}
              placeholder="Grade: A, B+, 18/20"
            />
            <Textarea
              value={reviewFeedback}
              onChange={(event) => setReviewFeedback(event.target.value)}
              placeholder="Feedback for the student"
            />
            <ActionButton disabled={saving || !reviewStudentId} icon={Save}>
              Save review
            </ActionButton>
          </form>
          <div className="mt-6 space-y-3">
            {(dashboard?.assignment_reviews ?? []).slice(0, 3).map((item) => (
              <MiniItem key={item.id} title={item.title} meta={`${item.subject} / ${item.grade}`} />
            ))}
          </div>
        </Panel>
      </section>

      <section id="profile" className={visible("profile") ? "space-y-5 pt-2" : "hidden"}>
        <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.35em] text-white/45 rounded-full border border-white/10 px-4 py-2">
          <Briefcase className="size-3.5" />
          Faculty identity
        </div>

        <Panel className="relative overflow-hidden p-0">
          <div className="absolute inset-0" style={{ background: "var(--grad-aurora)" }} />
          <div className="absolute inset-0 opacity-30 grid-bg" />
          <div className="absolute inset-px rounded-[calc(1.5rem-1px)] bg-[#07070a]/75" />
          <div className="relative grid gap-8 p-6 lg:grid-cols-[1.25fr_0.75fr] lg:p-8">
            <div className="flex gap-5">
              <div
                className="flex size-24 shrink-0 items-center justify-center rounded-3xl text-2xl font-semibold"
                style={{ background: "var(--grad-aurora)" }}
              >
                {professorInitialsFromName(profile.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-[0.35em] text-white/45">
                  {professor?.verificationStatus ?? "verified faculty"}
                </div>
                <h2 className="mt-2 font-display text-4xl font-bold tracking-tight">
                  {profile.name}
                </h2>
                <div className="mt-2 text-lg text-white/68">
                  {profile.designation} / {profile.department}
                </div>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-white/58">
                  {profile.bio.trim() ||
                    "Add a short faculty bio to introduce teaching style, academic background, and mentoring focus."}
                </p>
                <div className="mt-5 flex flex-wrap gap-4 text-sm text-white/50">
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
                <div className="mt-6 flex flex-wrap gap-3">
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

            <div className="flex flex-col gap-4">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={openProfessorEditor}
                  className="glass-strong inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs uppercase tracking-[0.2em]"
                >
                  <Edit3 className="size-3.5" />
                  Edit
                </button>
              </div>
              <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
                <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">
                  Faculty Completion
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div className="font-display text-4xl">{profileCompletion}%</div>
                  <div className="max-w-[180px] text-right text-xs text-white/45">
                    {profileCompletion >= 80
                      ? "Ready for milestone demo"
                      : "Add more faculty details"}
                  </div>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${profileCompletion}%`, background: "var(--grad-aurora)" }}
                  />
                </div>
                <div className="mt-4 inline-flex items-start gap-2 text-xs text-white/50">
                  <Target className="mt-0.5 size-3.5 shrink-0 text-white/55" />
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
              <Panel key={item.label} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.3em] text-white/35">
                      {item.label}
                    </div>
                    <div className="mt-4 font-display text-3xl font-bold text-white">
                      {item.value}
                    </div>
                    <div className="mt-2 text-sm text-white/45">{item.hint}</div>
                  </div>
                  <div className="rounded-2xl bg-white/[0.06] p-3">
                    <Icon className="size-4 text-cyan-200" />
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <Panel className="p-5">
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
                  <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">
                    {entry.when}
                  </div>
                  <div className="text-sm text-white/78">{entry.text}</div>
                </motion.div>
              ))}
              {profileTimeline.length === 0 && (
                <div className="text-sm text-white/45">
                  Timeline items will appear here as professor activity grows.
                </div>
              )}
            </div>
          </Panel>

          <div className="space-y-5">
            <Panel className="p-5">
              <SectionTitle icon={Sparkles} eyebrow="Teaching stack" title="Skills & strengths" />
              <div className="mt-4 flex flex-wrap gap-2">
                {profile.skills.map((skill) => (
                  <span
                    key={skill}
                    className="glass rounded-full px-3 py-1.5 text-xs text-white/78"
                  >
                    {skill}
                  </span>
                ))}
                {profile.skills.length === 0 && (
                  <div className="text-sm text-white/45">
                    Add expertise keywords to make the faculty profile richer.
                  </div>
                )}
              </div>
            </Panel>

            <Panel className="p-5">
              <SectionTitle
                icon={ShieldCheck}
                eyebrow="Milestones"
                title="Verification & progress"
              />
              <div className="mt-4 grid gap-3">
                {professorMilestones.map((item, index) => (
                  <div
                    key={item.title}
                    className={`relative overflow-hidden rounded-2xl border p-4 ${
                      item.earned ? "border-white/15 bg-white/[0.04]" : "border-white/8 bg-black/20"
                    }`}
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
                        <div className="font-medium text-white">{item.title}</div>
                        <div className="mt-1 text-xs text-white/45">{item.detail}</div>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] ${
                          item.earned ? "bg-white/10 text-white/70" : "bg-black/25 text-white/35"
                        }`}
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
          <Panel className="p-5">
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

          <Panel className="p-5">
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
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-white/58">
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

      <Dialog open={isProfileEditOpen} onOpenChange={setIsProfileEditOpen}>
        <DialogContent className="border-white/10 bg-[#0b0b0f] text-white sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Edit Professor Profile</DialogTitle>
            <DialogDescription className="text-white/50">
              This milestone saves faculty profile updates locally so the professor view stays
              polished in the demo.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={saveProfessorProfile} className="space-y-4">
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

function MetricCard({ metric }: { metric: ProfessorDashboard["metrics"][number] }) {
  const color =
    metric.tone === "green"
      ? "text-emerald-300"
      : metric.tone === "pink"
        ? "text-fuchsia-300"
        : metric.tone === "amber"
          ? "text-amber-200"
          : "text-cyan-300";
  return (
    <Panel className="p-5">
      <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">{metric.label}</div>
      <div className={`mt-7 font-display text-4xl font-bold ${color}`}>{metric.value}</div>
      <div className="mt-2 text-xs text-white/45">{metric.hint}</div>
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
  const maxStudents = Math.max(
    ...data.map((item) => item.totalStudents),
    ...data.map((item) => item.marked),
    1,
  );
  return (
    <div className={compact ? "mt-4" : "mt-6"}>
      <div className="flex items-center gap-4 text-xs text-white/45">
        <span className="inline-flex items-center gap-2">
          <span className="size-2 rounded-full bg-cyan-300" />
          Present
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-2 rounded-full bg-rose-300" />
          Absent
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-2 rounded-full bg-white/25" />
          Unmarked
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
            <div className="pointer-events-none absolute left-1/2 top-0 z-20 w-44 -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-2xl border border-white/12 bg-[#080808]/95 p-3 text-xs opacity-0 shadow-2xl shadow-black/40 backdrop-blur-xl transition duration-150 group-hover/date:opacity-100 group-focus/date:opacity-100">
              <div className="mb-2 truncate font-display text-sm text-white">{item.label}</div>
              <div className="space-y-1.5 text-white/65">
                <ChartTooltipRow color="bg-cyan-300" label="Present" value={item.present} />
                <ChartTooltipRow color="bg-rose-300" label="Absent" value={item.absent} />
                <ChartTooltipRow color="bg-white/30" label="Unmarked" value={item.unmarked} />
              </div>
            </div>
            <div
              className={`${compact ? "h-32" : "h-44"} flex transform-gpu items-end justify-center gap-1.5 border-b border-white/10 transition duration-200 ease-out group-hover/date:-translate-y-1 group-focus/date:-translate-y-1`}
            >
              <div
                className="w-full max-w-8 origin-bottom transform-gpu rounded-t-xl bg-gradient-to-t from-cyan-950 to-cyan-300 transition-transform duration-200 ease-out group-hover/date:scale-y-105 group-focus/date:scale-y-105"
                style={{
                  height: item.present
                    ? `${Math.max(8, (item.present / maxStudents) * 100)}%`
                    : "0%",
                }}
              />
              <div
                className="w-full max-w-8 origin-bottom transform-gpu rounded-t-xl bg-gradient-to-t from-rose-950 to-rose-300 transition-transform duration-200 ease-out group-hover/date:scale-y-105 group-focus/date:scale-y-105"
                style={{
                  height: item.absent ? `${Math.max(8, (item.absent / maxStudents) * 100)}%` : "0%",
                }}
              />
              <div
                className="w-full max-w-8 origin-bottom transform-gpu rounded-t-xl bg-white/15 transition-transform duration-200 ease-out group-hover/date:scale-y-105 group-focus/date:scale-y-105"
                style={{ height: `${Math.max(10, (item.unmarked / maxStudents) * 100)}%` }}
              />
            </div>
            <div className="mt-2 text-center text-[10px] uppercase tracking-[0.16em] text-white/35 truncate">
              {item.label}
            </div>
            <div className="mt-1 text-center text-xs text-white/55">
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
  return (
    <div className="mt-6 h-56 flex items-end gap-4">
      {data.length === 0 && (
        <div className="self-center text-sm text-white/45">No student CGPA records yet.</div>
      )}
      {data.map((item) => (
        <div key={item.year} className="group flex-1 min-w-0">
          <div className="h-44 flex items-end border-b border-white/10">
            <div
              className="w-full origin-bottom transform-gpu rounded-t-2xl bg-gradient-to-t from-fuchsia-950 via-violet-700 to-amber-200 transition-transform duration-200 ease-out group-hover:scale-y-105"
              style={{ height: `${Math.max(8, (item.averageCgpa / 10) * 100)}%` }}
              title={`${item.averageCgpa} CGPA`}
            />
          </div>
          <div className="mt-2 text-center text-[10px] uppercase tracking-[0.16em] text-white/35 truncate">
            {item.year}
          </div>
          <div className="mt-1 text-center text-xs text-white/65">
            {item.averageCgpa.toFixed(2)}
          </div>
        </div>
      ))}
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
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">{label}</div>
      <div className={`mt-3 font-display text-3xl font-bold ${tone}`}>{value}</div>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="text-[10px] uppercase tracking-[0.25em] text-white/35">{label}</div>
      <div className="mt-2 text-sm text-white/75 break-words">{value}</div>
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
    <span className="inline-flex items-center gap-2">
      <Icon className="size-4 text-white/55" />
      {value.trim() || <span className="text-white/35">{fallback}</span>}
    </span>
  );
}

function SnapshotStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-strong rounded-2xl px-4 py-2.5">
      <div className="text-[9px] uppercase tracking-[0.3em] text-white/50">{label}</div>
      <div className="mt-0.5 font-display text-lg">{value}</div>
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
      className="w-full glass rounded-2xl px-4 py-3 text-sm text-white bg-[#101010] focus:outline-none focus:border-white/30 transition"
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
      className="relative w-full rounded-full px-5 py-3 text-xs uppercase tracking-[0.2em] text-white overflow-hidden disabled:opacity-60 disabled:cursor-wait"
    >
      <span
        className="absolute inset-0"
        style={{ background: "var(--grad-aurora)", backgroundSize: "200% 200%" }}
      />
      <span className="absolute inset-px rounded-full bg-[#0a0a0a]/35" />
      <span className="relative z-10 inline-flex items-center justify-center gap-2">
        <Icon className="size-4" />
        {children}
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
