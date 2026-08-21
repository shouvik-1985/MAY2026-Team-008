import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  AlertCircle,
  Award,
  BadgeCheck,
  Ban,
  BarChart3,
  Building2,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Eye,
  FileText,
  Gauge,
  GraduationCap,
  Loader2,
  LocateFixed,
  Mail,
  Paperclip,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Sun,
  Megaphone,
  Moon,
  ShoppingBag,
  Send,
  Sparkles,
  Trash2,
  UserCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useTheme } from "@/lib/theme";
import { ComplaintStageStrip } from "@/components/app/ComplaintStageStrip";
import { MarketplaceExperience } from "@/components/marketplace/MarketplaceExperience";
import {
  approveAdminCertificateRequest,
  createAdminAnnouncement,
  createAdminSlotBatch,
  deleteAdminAnnouncement,
  deleteAdminSlotBatch,
  deleteAdminUserAccount,
  getAdminAnnouncements,
  getAdminCertificateRequests,
  getAdminComplaints,
  getAdminDashboard,
  getAdminFees,
  getAdminManagement,
  openProtectedResource,
  rejectAdminCertificateRequest,
  resetAdminStudentBiometric,
  updateAdminComplaintStatus,
  updateAdminSemesterFee,
  updateAdminSemesterDuration,
  updateAdminSlotBatch,
  updateAdminAttendanceRadius,
  updateAdminUserBlock,
  type AdminAnnouncement,
  type AdminDashboard,
  type AdminCertificateRequest,
  type AdminFeeManagement,
  type AdminFeeStudent,
  type CampusAttendanceSettings,
  type ComplaintItem,
} from "@/lib/api";

export const Route = createFileRoute("/admin/")({
  component: AdminDeskPage,
});

const ADMIN_SECTIONS = ["dashboard", "student", "professor", "announcements", "management", "complaints", "fees", "certificate", "marketplace"] as const;

type AdminSection = (typeof ADMIN_SECTIONS)[number];
type AdminComplaint = ComplaintItem;
type AdminCertificate = AdminCertificateRequest;
type CertificateStatusFilter = "all" | "requested" | "ready" | "downloaded" | "rejected";
type AdminAccountAction = "block" | "unblock" | "delete";
type AdminCertificateAction = "approve" | "reject";
type AdminActionToastState = {
  id: number;
  message: string;
  tone: "danger" | "success" | "error";
  busy?: boolean;
  title?: string;
};

const ACCOUNT_TOAST_TIMEOUT_MS = 5_000;
const CERTIFICATE_TOAST_TIMEOUT_MS = 5_000;
const ADMIN_STATUS_TOAST_TIMEOUT_MS = 5_000;
const ADMIN_PRIMARY_ACTION_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-2xl border border-[#d8efbc]/80 bg-[#d8efbc] px-5 py-3 text-xs font-extrabold uppercase tracking-[0.2em] text-[#101417] shadow-[0_10px_24px_rgba(76,175,80,0.22)] transition hover:bg-[#c8e9a8] hover:shadow-[0_14px_30px_rgba(76,175,80,0.28)] disabled:cursor-wait disabled:opacity-60";

function normalizeAdminSection(hash: string): AdminSection {
  const raw = hash.replace("#", "");
  const aliases: Record<string, AdminSection> = {
    overview: "dashboard",
    students: "student",
    professors: "professor",
    announcement: "announcements",
    announcements: "announcements",
    notices: "announcements",
    complaint: "complaints",
    "fee-management": "fees",
    certificates: "certificate",
    marketplace: "marketplace",
  };
  const candidate = (aliases[raw] ?? raw) as AdminSection;
  return ADMIN_SECTIONS.includes(candidate) ? candidate : "dashboard";
}

function AdminDeskPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [settings, setSettings] = useState<CampusAttendanceSettings | null>(null);
  const [activeSection, setActiveSection] = useState(() =>
    normalizeAdminSection(typeof window === "undefined" ? "" : window.location.hash),
  );
  const [managementView, setManagementView] = useState<"tracker" | "slots">("tracker");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [selectedProfessorId, setSelectedProfessorId] = useState<number | null>(null);
  const [complaints, setComplaints] = useState<AdminComplaint[]>([]);
  const [selectedComplaintId, setSelectedComplaintId] = useState<number | null>(null);
  const [feeData, setFeeData] = useState<AdminFeeManagement | null>(null);
  const [feeAmountEdits, setFeeAmountEdits] = useState<Record<number, number>>({});
  const [certificateRequests, setCertificateRequests] = useState<AdminCertificate[]>([]);
  const [selectedCertificateRequestId, setSelectedCertificateRequestId] = useState<number | null>(null);
  const [certificateStatusFilter, setCertificateStatusFilter] = useState<CertificateStatusFilter>("all");
  const [certificatePurpose, setCertificatePurpose] = useState("");
  const [certificateBody, setCertificateBody] = useState("");
  const [certificateSignatoryName, setCertificateSignatoryName] = useState("Dr. A. R. Sharma");
  const [certificateSignatoryTitle, setCertificateSignatoryTitle] = useState("Registrar & Academic Senate");
  const [certificateAdminNote, setCertificateAdminNote] = useState("");
  const [complaintStatusFilter, setComplaintStatusFilter] = useState<
    "all" | "open" | AdminComplaint["status"]
  >("all");
  const [complaintCategoryFilter, setComplaintCategoryFilter] = useState("all");
  const [complaintDateFilter, setComplaintDateFilter] = useState("");
  const [radius, setRadius] = useState(100);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [campusName, setCampusName] = useState("CampusVerse College");
  const [semesterDurationMonths, setSemesterDurationMonths] = useState(6);
  const [semesterDurationUnit, setSemesterDurationUnit] = useState<"months" | "days">("months");
  const [semesterDurationDays, setSemesterDurationDays] = useState(180);
  const [slotBatchName, setSlotBatchName] = useState("");
  const [slotCount, setSlotCount] = useState(60);
  const [slotDurationDays, setSlotDurationDays] = useState(30);
  const [openNewBatch, setOpenNewBatch] = useState(true);
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [annTitle, setAnnTitle] = useState("");
  const [annCategory, setAnnCategory] = useState("Academic");
  const [annAudience, setAnnAudience] = useState<"Students" | "Professors" | "Both">("Both");
  const [annBody, setAnnBody] = useState("");
  const [annPinned, setAnnPinned] = useState(false);
  const [annPosting, setAnnPosting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accountActions, setAccountActions] = useState<Record<number, AdminAccountAction>>({});
  const [accountToast, setAccountToast] = useState<AdminActionToastState | null>(null);
  const [certificateActions, setCertificateActions] = useState<Record<number, AdminCertificateAction>>({});
  const [certificateToast, setCertificateToast] = useState<AdminActionToastState | null>(null);
  const [statusToast, setStatusToast] = useState<AdminActionToastState | null>(null);

  useEffect(() => {
    function syncSection() {
      setActiveSection(normalizeAdminSection(window.location.hash));
    }

    syncSection();
    window.addEventListener("hashchange", syncSection);
    return () => window.removeEventListener("hashchange", syncSection);
  }, []);

  function showStatusToast(message: string, tone: AdminActionToastState["tone"] = "success", title = "Admin update") {
    setStatusToast({
      id: Date.now(),
      message,
      tone,
      title,
    });
  }

  function clearStatusToast() {
    setStatusToast(null);
  }

  async function refreshData(successMessage?: string, successTone: AdminActionToastState["tone"] = "success") {
    const [dashboardData, managementData, complaintsData, feesData, certificateData, announcementsData] = await Promise.all([
      getAdminDashboard(),
      getAdminManagement(),
      getAdminComplaints(),
      getAdminFees(),
      getAdminCertificateRequests(),
      getAdminAnnouncements().catch(() => ({ ok: false, announcements: [] })),
    ]);
    setDashboard(dashboardData);
    setSettings(managementData);
    setComplaints(complaintsData.complaints);
    setFeeData(feesData);
    setCertificateRequests(certificateData.requests);
    if ("announcements" in announcementsData && Array.isArray(announcementsData.announcements)) {
      setAnnouncements(announcementsData.announcements);
    }
    setFeeAmountEdits(
      Object.fromEntries(feesData.settings.map((setting) => [setting.semester, setting.amount])),
    );
    setRadius(managementData.radius_meters);
    setLatitude(managementData.latitude?.toString() ?? "");
    setLongitude(managementData.longitude?.toString() ?? "");
    setCampusName(managementData.campus_name);
    setSemesterDurationMonths(managementData.semester_duration_months ?? 6);
    setSemesterDurationUnit(managementData.semester_duration_unit ?? "months");
    setSemesterDurationDays(managementData.semester_duration_days ?? 180);
    setSelectedStudentId((current) => current ?? dashboardData.students[0]?.id ?? null);
    setSelectedProfessorId((current) => current ?? dashboardData.professors[0]?.id ?? null);
    setSelectedComplaintId((current) => current ?? complaintsData.complaints[0]?.id ?? null);
    setSelectedCertificateRequestId((current) => current ?? certificateData.requests[0]?.id ?? null);
    if (successMessage) showStatusToast(successMessage, successTone);
  }

  async function refreshDashboardQuietly() {
    const dashboardData = await getAdminDashboard();
    setDashboard(dashboardData);
    setSelectedStudentId((current) => current ?? dashboardData.students[0]?.id ?? null);
    setSelectedProfessorId((current) => current ?? dashboardData.professors[0]?.id ?? null);
  }

  async function refreshCertificatesQuietly() {
    const certificateData = await getAdminCertificateRequests();
    setCertificateRequests(certificateData.requests);
    setSelectedCertificateRequestId((current) => current ?? certificateData.requests[0]?.id ?? null);
  }

  function runBackgroundRefresh(mode: "dashboard" | "certificates" | "all" = "dashboard") {
    const refresh =
      mode === "all" ? refreshData : mode === "certificates" ? refreshCertificatesQuietly : refreshDashboardQuietly;
    void refresh().catch(() => undefined);
  }

  function updateAccountAction(userId: number, action: AdminAccountAction | null) {
    setAccountActions((current) => {
      const next = { ...current };
      if (action) {
        next[userId] = action;
      } else {
        delete next[userId];
      }
      return next;
    });
  }

  function showAccountToast(message: string, tone: AdminActionToastState["tone"], busy = false) {
    setAccountToast({
      id: Date.now(),
      message,
      tone,
      busy,
      title: "Account updated",
    });
  }

  function updateCertificateAction(requestId: number, action: AdminCertificateAction | null) {
    setCertificateActions((current) => {
      const next = { ...current };
      if (action) {
        next[requestId] = action;
      } else {
        delete next[requestId];
      }
      return next;
    });
  }

  function showCertificateToast(message: string, tone: AdminActionToastState["tone"], busy = false) {
    setCertificateToast({
      id: Date.now(),
      message,
      tone,
      busy,
      title: "Certificate updated",
    });
  }

  useEffect(() => {
    if (!accountToast) return;
    const timer = window.setTimeout(() => {
      setAccountToast((current) => (current?.id === accountToast.id ? null : current));
    }, ACCOUNT_TOAST_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [accountToast]);

  useEffect(() => {
    if (!certificateToast) return;
    const timer = window.setTimeout(() => {
      setCertificateToast((current) => (current?.id === certificateToast.id ? null : current));
    }, CERTIFICATE_TOAST_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [certificateToast]);

  useEffect(() => {
    if (!statusToast) return;
    const timer = window.setTimeout(() => {
      setStatusToast((current) => (current?.id === statusToast.id ? null : current));
    }, ADMIN_STATUS_TOAST_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [statusToast]);

  function patchAccountBlockState(userId: number, role: string, blocked: boolean) {
    const blockedAt = blocked ? new Date().toISOString() : "";
    const blockReason = blocked ? "Blocked by admin" : "Active account";
    setDashboard((current) => {
      if (!current) return current;
      return {
        ...current,
        students:
          role === "student"
            ? current.students.map((student) =>
                student.id === userId
                  ? {
                      ...student,
                      isBlocked: blocked,
                      blockReason,
                      blockedAt,
                      status: blocked ? "blocked" : student.attendance >= 75 ? "active" : "watch",
                    }
                  : student,
              )
            : current.students,
        professors:
          role === "faculty"
            ? current.professors.map((professor) =>
                professor.id === userId
                  ? {
                      ...professor,
                      isBlocked: blocked,
                      blockReason,
                      blockedAt,
                      status: blocked ? "blocked" : "active",
                    }
                  : professor,
              )
            : current.professors,
      };
    });
  }

  function removeAccountFromLocalData(userId: number, role: string) {
    setDashboard((current) => {
      if (!current) return current;
      const students = role === "student" ? current.students.filter((student) => student.id !== userId) : current.students;
      const professors =
        role === "faculty" ? current.professors.filter((professor) => professor.id !== userId) : current.professors;
      const totalAccounts = Math.max(students.length + professors.length, 1);
      return {
        ...current,
        account_ratio: {
          students: students.length,
          professors: professors.length,
          studentShare: Number(((students.length / totalAccounts) * 100).toFixed(1)),
          professorShare: Number(((professors.length / totalAccounts) * 100).toFixed(1)),
        },
        students,
        professors,
      };
    });
    if (role === "student") {
      setComplaints((current) => current.filter((complaint) => complaint.studentId !== userId));
      setCertificateRequests((current) => current.filter((request) => request.student_id !== userId));
      setFeeData((current) => {
        if (!current) return current;
        const students = current.students.filter((student) => student.studentId !== userId);
        return {
          ...current,
          students,
          metrics: {
            ...current.metrics,
            studentCount: students.length,
            paidStudents: students.filter((student) => student.status === "paid").length,
            pendingStudents: students.filter((student) => student.status !== "paid").length,
            totalCollected: students.reduce((sum, student) => sum + student.collected, 0),
            totalPending: students.reduce((sum, student) => sum + student.outstanding, 0),
          },
        };
      });
    }
  }

  useEffect(() => {
    let live = true;
    setLoading(true);
    refreshData()
      .catch((error) => {
        if (live) showStatusToast(error instanceof Error ? error.message : "Admin dashboard failed to load", "error");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  const [studentFilter, setStudentFilter] = useState<"all" | "watchlist" | "risk" | "blocked">("all");

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const query = deferredSearchQuery.trim().toLowerCase();
  const filteredStudents = useMemo(() => {
    return (dashboard?.students ?? []).filter((student) => {
      if (studentFilter === "watchlist" && student.attendance >= 75) return false;
      if (studentFilter === "risk" && student.cgpa >= 7.5) return false;
      if (studentFilter === "blocked" && !student.isBlocked) return false;
      if (!query) return true;
      return [student.name, student.email, student.studentCode, student.address, student.department, `sem ${student.semester}`]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [dashboard?.students, query, studentFilter]);

  const filteredProfessors = useMemo(() => {
    return (dashboard?.professors ?? []).filter((professor) => {
      if (!query) return true;
      return [
        professor.name,
        professor.email,
        professor.designation,
        professor.address,
        professor.department,
        professor.expertiseField,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [dashboard?.professors, query]);

  const complaintCategories = useMemo(
    () => Array.from(new Set(complaints.map((complaint) => complaint.category).filter(Boolean))).sort(),
    [complaints],
  );

  const filteredComplaints = useMemo(() => {
    return complaints.filter((complaint) => {
      const matchesQuery =
        !query ||
        [
          complaint.complaintCode,
          complaint.title,
          complaint.category,
          complaint.statusLabel,
          complaint.studentName,
          complaint.studentEmail,
          complaint.studentCode,
          complaint.department,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesStatus =
        complaintStatusFilter === "all"
          ? true
          : complaintStatusFilter === "open"
            ? complaint.status !== "resolved"
            : complaint.status === complaintStatusFilter;
      const matchesCategory =
        complaintCategoryFilter === "all" ? true : complaint.category === complaintCategoryFilter;
      const matchesDate =
        !complaintDateFilter || formatDateInputValue(complaint.submittedAt) === complaintDateFilter;

      return matchesQuery && matchesStatus && matchesCategory && matchesDate;
    });
  }, [complaints, query, complaintStatusFilter, complaintCategoryFilter, complaintDateFilter]);

  const filteredFeeStudents = useMemo(() => {
    return (feeData?.students ?? []).filter((student) => {
      if (!query) return true;
      return [
        student.name,
        student.email,
        student.studentCode,
        student.department,
        `sem ${student.semester}`,
        student.status,
        student.currentInvoiceId ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [feeData?.students, query]);

  const filteredCertificateRequests = useMemo(() => {
    return certificateRequests.filter((request) => {
      const matchesStatus = certificateStatusFilter === "all" ? true : request.status === certificateStatusFilter;
      if (!matchesStatus) return false;
      if (!query) return true;
      return [
        request.student_name,
        request.student_email,
        request.student_code,
        request.department,
        `sem ${request.semester}`,
        request.certificate_name,
        request.status_label,
        request.purpose ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [certificateRequests, certificateStatusFilter, query]);

  const selectedStudent = filteredStudents.find((student) => student.id === selectedStudentId) ?? filteredStudents[0] ?? null;
  const selectedProfessor =
    filteredProfessors.find((professor) => professor.id === selectedProfessorId) ?? filteredProfessors[0] ?? null;
  const selectedComplaint =
    filteredComplaints.find((complaint) => complaint.id === selectedComplaintId) ?? filteredComplaints[0] ?? null;
  const selectedCertificateRequest =
    filteredCertificateRequests.find((request) => request.id === selectedCertificateRequestId) ??
    filteredCertificateRequests[0] ??
    null;
  const selectedCertificateAction = selectedCertificateRequest
    ? certificateActions[selectedCertificateRequest.id]
    : undefined;

  useEffect(() => {
    if (selectedStudent && selectedStudent.id !== selectedStudentId) {
      setSelectedStudentId(selectedStudent.id);
    }
    if (!selectedStudent && selectedStudentId !== null) {
      setSelectedStudentId(null);
    }
  }, [selectedStudent, selectedStudentId]);

  useEffect(() => {
    if (selectedProfessor && selectedProfessor.id !== selectedProfessorId) {
      setSelectedProfessorId(selectedProfessor.id);
    }
    if (!selectedProfessor && selectedProfessorId !== null) {
      setSelectedProfessorId(null);
    }
  }, [selectedProfessor, selectedProfessorId]);

  useEffect(() => {
    if (selectedComplaint && selectedComplaint.id !== selectedComplaintId) {
      setSelectedComplaintId(selectedComplaint.id);
    }
    if (!selectedComplaint && selectedComplaintId !== null) {
      setSelectedComplaintId(null);
    }
  }, [selectedComplaint, selectedComplaintId]);

  useEffect(() => {
    if (selectedCertificateRequest && selectedCertificateRequest.id !== selectedCertificateRequestId) {
      setSelectedCertificateRequestId(selectedCertificateRequest.id);
    }
    if (!selectedCertificateRequest && selectedCertificateRequestId !== null) {
      setSelectedCertificateRequestId(null);
    }
  }, [selectedCertificateRequest, selectedCertificateRequestId]);

  useEffect(() => {
    if (!selectedCertificateRequest) {
      setCertificatePurpose("");
      setCertificateBody("");
      setCertificateSignatoryName("Dr. A. R. Sharma");
      setCertificateSignatoryTitle("Registrar & Academic Senate");
      setCertificateAdminNote("");
      return;
    }

    setCertificatePurpose(selectedCertificateRequest.purpose ?? defaultCertificatePurpose(selectedCertificateRequest));
    setCertificateBody(selectedCertificateRequest.certificate_body ?? defaultCertificateBody(selectedCertificateRequest));
    setCertificateSignatoryName(selectedCertificateRequest.signatory_name ?? "Dr. A. R. Sharma");
    setCertificateSignatoryTitle(selectedCertificateRequest.signatory_title ?? "Registrar & Academic Senate");
    setCertificateAdminNote(selectedCertificateRequest.admin_note ?? "");
  }, [
    selectedCertificateRequest?.id,
    selectedCertificateRequest?.purpose,
    selectedCertificateRequest?.certificate_body,
    selectedCertificateRequest?.signatory_name,
    selectedCertificateRequest?.signatory_title,
    selectedCertificateRequest?.admin_note,
  ]);

  function clearComplaintFilters() {
    setSearchQuery("");
    setComplaintStatusFilter("all");
    setComplaintCategoryFilter("all");
    setComplaintDateFilter("");
  }

  function clearCertificateFilters() {
    setSearchQuery("");
    setCertificateStatusFilter("all");
  }

  async function save(event?: FormEvent) {
    event?.preventDefault();
    setSaving(true);
    clearStatusToast();
    try {
      const managementData = await updateAdminAttendanceRadius({
        radius_meters: radius,
        latitude: latitude.trim() ? Number(latitude) : null,
        longitude: longitude.trim() ? Number(longitude) : null,
        campus_name: campusName,
      });
      setSettings(managementData);
      await refreshData("Attendance radius updated");
    } catch (error) {
      showStatusToast(error instanceof Error ? error.message : "Could not update management settings", "error");
    } finally {
      setSaving(false);
    }
  }

  async function saveSemesterDuration(event?: FormEvent) {
    event?.preventDefault();
    setSaving(true);
    clearStatusToast();
    try {
      const managementData = await updateAdminSemesterDuration({
        semester_duration_unit: semesterDurationUnit,
        semester_duration_months: semesterDurationMonths,
        semester_duration_days: semesterDurationDays,
      });
      setSettings(managementData);
      await refreshData("Semester duration updated");
    } catch (error) {
      showStatusToast(error instanceof Error ? error.message : "Could not update semester duration", "error");
    } finally {
      setSaving(false);
    }
  }

  async function createSlotRelease(event?: FormEvent) {
    event?.preventDefault();
    setSaving(true);
    clearStatusToast();
    try {
      const normalizedName = slotBatchName.trim() || `Batch ${new Date().getFullYear()}`;
      const managementData = await createAdminSlotBatch({
        batch_name: normalizedName,
        total_slots: slotCount,
        duration_days: slotDurationDays,
        open_for_intake: openNewBatch,
      });
      setSettings(managementData);
      setSlotBatchName("");
      setSlotCount(60);
      setSlotDurationDays(30);
      setOpenNewBatch(true);
      await refreshData(`${normalizedName} slot release created`);
    } catch (error) {
      showStatusToast(error instanceof Error ? error.message : "Could not create slot release", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleSlotRelease(batchId: number, nextState: boolean, batchName: string) {
    setSaving(true);
    clearStatusToast();
    try {
      const managementData = await updateAdminSlotBatch(batchId, {
        open_for_intake: nextState,
      });
      setSettings(managementData);
      await refreshData(`${batchName} intake ${nextState ? "opened" : "paused"}`, nextState ? "success" : "danger");
    } catch (error) {
      showStatusToast(error instanceof Error ? error.message : "Could not update slot release", "error");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSlotRelease(batchId: number, batchName: string) {
    const okay = window.confirm(`Delete slot batch "${batchName}" and stop its intake? Existing students will stay registered.`);
    if (!okay) return;

    setSaving(true);
    clearStatusToast();
    try {
      const managementData = await deleteAdminSlotBatch(batchId);
      setSettings(managementData);
      await refreshData(`${batchName} slot release removed`, "danger");
    } catch (error) {
      showStatusToast(error instanceof Error ? error.message : "Could not delete slot release", "error");
    } finally {
      setSaving(false);
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      showStatusToast("This browser does not support location services", "error");
      return;
    }
    showStatusToast("Reading this device location...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(7));
        setLongitude(position.coords.longitude.toFixed(7));
        showStatusToast("Campus center filled from this device. Save to apply it.");
      },
      () => showStatusToast("Location permission was blocked or unavailable", "error"),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 15_000 },
    );
  }

  async function toggleUserBlock(userId: number, blocked: boolean, label: string) {
    const action = blocked ? "block" : "unblock";
    updateAccountAction(userId, action);
    clearStatusToast();
    showAccountToast(`${blocked ? "Blocking" : "Unblocking"} ${label}...`, blocked ? "danger" : "success", true);
    try {
      const result = await updateAdminUserBlock(userId, {
        blocked,
        reason: blocked ? "Blocked by admin" : undefined,
      });
      patchAccountBlockState(userId, result.role, result.is_blocked);
      showAccountToast(result.message || `${label} ${blocked ? "blocked" : "unblocked"}`, blocked ? "danger" : "success");
      runBackgroundRefresh("dashboard");
    } catch (error) {
      showAccountToast(error instanceof Error ? error.message : "Could not update account status", "error");
    } finally {
      updateAccountAction(userId, null);
    }
  }

  async function deleteUser(userId: number, label: string) {
    const okay = window.confirm(`Delete ${label} from CampusVerse? This also removes related account records.`);
    if (!okay) return;
    updateAccountAction(userId, "delete");
    clearStatusToast();
    showAccountToast(`Deleting ${label}...`, "danger", true);
    try {
      const result = await deleteAdminUserAccount(userId);
      if (selectedStudentId === userId) setSelectedStudentId(null);
      if (selectedProfessorId === userId) setSelectedProfessorId(null);
      removeAccountFromLocalData(userId, result.role);
      showAccountToast(result.message || `${label} deleted`, "danger");
      runBackgroundRefresh("all");
    } catch (error) {
      showAccountToast(error instanceof Error ? error.message : "Could not delete account", "error");
    } finally {
      updateAccountAction(userId, null);
    }
  }

  async function resetStudentBiometric(studentId: number, label: string) {
    const okay = window.confirm(`Reset the enrolled face template for ${label}? The student will need to re-enroll from the webcam scanner.`);
    if (!okay) return;
    setSaving(true);
    clearStatusToast();
    try {
      const result = await resetAdminStudentBiometric(studentId);
      await refreshData(result.message || `${label}'s face template was reset`, "danger");
    } catch (error) {
      showStatusToast(error instanceof Error ? error.message : "Could not reset the student biometric template", "error");
    } finally {
      setSaving(false);
    }
  }

  async function setComplaintStatus(
    complaintId: number,
    nextStatus: "acknowledged" | "in_progress" | "resolved",
  ) {
    setSaving(true);
    clearStatusToast();
    try {
      const response = await updateAdminComplaintStatus(complaintId, { status: nextStatus });
      setComplaints((current) =>
        current.map((complaint) => (complaint.id === complaintId ? response.complaint : complaint)),
      );
      showStatusToast(`Complaint moved to ${response.complaint.statusLabel}`);
    } catch (error) {
      showStatusToast(error instanceof Error ? error.message : "Complaint status could not be updated", "error");
    } finally {
      setSaving(false);
    }
  }

  async function saveSemesterFee(semester: number) {
    const amount = Math.max(1, Math.round(Number(feeAmountEdits[semester]) || 0));
    setSaving(true);
    clearStatusToast();
    try {
      const response = await updateAdminSemesterFee(semester, { amount });
      setFeeData(response);
      setFeeAmountEdits(
        Object.fromEntries(response.settings.map((setting) => [setting.semester, setting.amount])),
      );
      showStatusToast(`Semester ${semester} fee updated to ${formatCurrency(amount)}`);
    } catch (error) {
      showStatusToast(error instanceof Error ? error.message : "Could not update semester fee", "error");
    } finally {
      setSaving(false);
    }
  }

  async function approveCertificateRequest() {
    if (!selectedCertificateRequest) return;
    const requestId = selectedCertificateRequest.id;
    const certificateName = selectedCertificateRequest.certificate_name;
    updateCertificateAction(requestId, "approve");
    clearStatusToast();
    showCertificateToast(`Approving ${certificateName}...`, "success", true);
    try {
      const response = await approveAdminCertificateRequest(requestId, {
        purpose: certificatePurpose,
        certificate_body: certificateBody,
        signatory_name: certificateSignatoryName,
        signatory_title: certificateSignatoryTitle,
        admin_note: certificateAdminNote,
      });
      setCertificateRequests((current) =>
        current.map((request) => (request.id === response.request.id ? response.request : request)),
      );
      showCertificateToast(response.message || `${certificateName} approved`, "success");
      runBackgroundRefresh("certificates");
    } catch (error) {
      showCertificateToast(error instanceof Error ? error.message : "Could not approve certificate request", "error");
    } finally {
      updateCertificateAction(requestId, null);
    }
  }

  async function rejectCertificateRequest(request: AdminCertificate) {
    const okay = window.confirm(`Reject ${request.certificate_name} for ${request.student_name}?`);
    if (!okay) return;
    updateCertificateAction(request.id, "reject");
    clearStatusToast();
    showCertificateToast(`Rejecting ${request.certificate_name}...`, "danger", true);
    try {
      const response = await rejectAdminCertificateRequest(request.id);
      setCertificateRequests((current) =>
        current.map((item) => (item.id === response.request.id ? response.request : item)),
      );
      showCertificateToast(response.message || `${request.certificate_name} rejected`, "danger");
      runBackgroundRefresh("certificates");
    } catch (error) {
      showCertificateToast(error instanceof Error ? error.message : "Could not reject certificate request", "error");
    } finally {
      updateCertificateAction(request.id, null);
    }
  }

  async function handleCreateAdminAnnouncement(event: FormEvent) {
    event.preventDefault();
    if (!annTitle.trim() || !annBody.trim()) return;
    setAnnPosting(true);
    clearStatusToast();
    try {
      const response = await createAdminAnnouncement({
        title: annTitle.trim(),
        category: annCategory,
        audience: annAudience,
        body: annBody.trim(),
        pinned: annPinned,
      });
      setAnnTitle("");
      setAnnBody("");
      setAnnPinned(false);
      await refreshData(response.message || "Announcement published & notifications generated!");
    } catch (error) {
      showStatusToast(error instanceof Error ? error.message : "Could not publish announcement", "error");
    } finally {
      setAnnPosting(false);
    }
  }

  async function handleDeleteAdminAnnouncement(id: number, title: string) {
    const okay = window.confirm(`Delete announcement "${title}"? This also removes it from student & professor feeds.`);
    if (!okay) return;
    setSaving(true);
    clearStatusToast();
    try {
      const response = await deleteAdminAnnouncement(id);
      await refreshData(response.message || "Announcement deleted", "danger");
    } catch (error) {
      showStatusToast(error instanceof Error ? error.message : "Could not delete announcement", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !dashboard) {
    return <div className={`rounded-[28px] border p-8 ${
      isDark ? "border-white/10 bg-white/[0.04] text-white/60" : "border-slate-200 bg-white/90 text-slate-500 shadow-sm"
    }`}>Loading admin desk...</div>;
  }

  const visible = (section: AdminSection) => activeSection === section;
  const studentAverageCgpa = filteredStudents.length
    ? (filteredStudents.reduce((sum, student) => sum + student.cgpa, 0) / filteredStudents.length).toFixed(2)
    : "0.00";
  const studentAverageAttendance = filteredStudents.length
    ? (filteredStudents.reduce((sum, student) => sum + student.attendance, 0) / filteredStudents.length).toFixed(0)
    : "0";
  const blockedStudents = filteredStudents.filter((student) => student.isBlocked).length;
  const blockedProfessors = filteredProfessors.filter((professor) => professor.isBlocked).length;
  const verifiedProfessors = filteredProfessors.filter((professor) => professor.verificationStatus === "verified").length;
  const pendingProfessors = filteredProfessors.filter((professor) => professor.verificationStatus !== "verified").length;
  const submittedComplaints = filteredComplaints.filter((complaint) => complaint.status === "submitted").length;
  const acknowledgedComplaints = filteredComplaints.filter((complaint) => complaint.status === "acknowledged").length;
  const inProgressComplaints = filteredComplaints.filter((complaint) => complaint.status === "in_progress").length;
  const resolvedComplaints = filteredComplaints.filter((complaint) => complaint.status === "resolved").length;
  const campusCenter =
    settings?.campus_configured && settings.latitude != null && settings.longitude != null
      ? `${settings.latitude.toFixed(4)}, ${settings.longitude.toFixed(4)}`
      : "Not set";
  const slotBatches = settings?.slot_batches ?? [];
  const activeSlotBatch = settings?.active_slot_batch ?? null;
  const totalSlotCapacity = slotBatches.reduce((sum, batch) => sum + batch.total_slots, 0);
  const totalSlotFilled = slotBatches.reduce((sum, batch) => sum + batch.filled_slots, 0);
  const totalSlotLeft = slotBatches.reduce((sum, batch) => sum + batch.slots_left, 0);
  const semesterDurationLabel =
    semesterDurationUnit === "days"
      ? `${semesterDurationDays} ${semesterDurationDays === 1 ? "day" : "days"}`
      : `${semesterDurationMonths} ${semesterDurationMonths === 1 ? "month" : "months"}`;
  const semesterDurationInputValue =
    semesterDurationUnit === "days" ? semesterDurationDays : semesterDurationMonths;
  const feeMetrics = feeData?.metrics ?? {
    totalCollected: 0,
    totalPending: 0,
    paidStudents: 0,
    pendingStudents: 0,
    studentCount: 0,
  };
  const filteredFeePending = filteredFeeStudents.filter((student) => student.outstanding > 0).length;
  const filteredFeeCollected = filteredFeeStudents.reduce((sum, student) => sum + student.collected, 0);
  const filteredFeeOutstanding = filteredFeeStudents.reduce((sum, student) => sum + student.outstanding, 0);
  const pendingCertificateRequests = filteredCertificateRequests.filter((request) => request.status === "requested").length;
  const approvedCertificateRequests = filteredCertificateRequests.filter((request) => request.status === "ready").length;
  const downloadedCertificateRequests = filteredCertificateRequests.filter((request) => request.status === "downloaded").length;
  const rejectedCertificateRequests = filteredCertificateRequests.filter((request) => request.status === "rejected").length;

  return (
    <div className="cv-admin-content w-full mx-auto max-w-[1480px] space-y-6 pb-10">
      <section className="grid gap-4 xl:grid-cols-[1fr_auto]">
        <div className={`rounded-[28px] border p-4 backdrop-blur-2xl ${
          isDark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-white/95 shadow-sm"
        }`}>
          <div className="flex items-center gap-3">
            <div className={`flex size-11 items-center justify-center rounded-2xl ${
              isDark ? "bg-white/10" : "bg-indigo-50 border border-indigo-100"
            }`}>
              <Search className={`size-4 ${isDark ? "text-cyan-200" : "text-indigo-500"}`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className={`text-[10px] uppercase tracking-[0.32em] font-bold ${
                isDark ? "text-white/40" : "text-slate-400"
              }`}>Full-campus administration</div>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search student, professor, account details..."
                className={`mt-2 w-full bg-transparent text-sm outline-none ${
                  isDark ? "text-white placeholder:text-white/28" : "text-slate-900 placeholder:text-slate-400"
                }`}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className={`flex items-center justify-between gap-3 rounded-full border px-4 py-2 text-xs uppercase tracking-[0.18em] ${
            isDark ? "border-white/10 bg-white/[0.04] text-white/50" : "border-slate-200 bg-white/95 text-slate-700 shadow-sm"
          }`}>
            <div className="flex flex-wrap items-center gap-2">
              {activeSection === "management" ? (
                <>
                  <button
                    type="button"
                    onClick={() => setManagementView("tracker")}
                    className={`rounded-full border px-4 py-2 font-bold transition ${
                      managementView === "tracker"
                        ? "border-[#d8efbc]/70 bg-[#d8efbc] text-[#101417] shadow-[0_8px_18px_rgba(76,175,80,0.22)]"
                        : isDark
                          ? "border-transparent text-white/60 hover:text-[#d8efbc]"
                          : "border-transparent text-slate-600 hover:text-[#1f7a32]"
                    }`}
                  >
                    Tracker
                  </button>
                  <button
                    type="button"
                    onClick={() => setManagementView("slots")}
                    className={`rounded-full border px-4 py-2 font-bold transition ${
                      managementView === "slots"
                        ? "border-[#d8efbc]/70 bg-[#d8efbc] text-[#101417] shadow-[0_8px_18px_rgba(76,175,80,0.22)]"
                        : isDark
                          ? "border-transparent text-white/60 hover:text-[#d8efbc]"
                          : "border-transparent text-slate-600 hover:text-[#1f7a32]"
                    }`}
                  >
                    Slots
                  </button>
                </>
              ) : activeSection === "announcements" ? (
                <span>{announcements.length} announcements broadcasted</span>
              ) : activeSection === "fees" ? (
                <span>{filteredFeeStudents.length} students / {filteredFeePending} pending</span>
              ) : activeSection === "certificate" ? (
                <span>{filteredCertificateRequests.length} certificates / {pendingCertificateRequests} pending</span>
              ) : activeSection === "complaints" ? (
                <span>{filteredComplaints.length} complaints / {resolvedComplaints} resolved</span>
              ) : activeSection === "marketplace" ? (
                <span>Shared marketplace inventory</span>
              ) : (
                <span>{dashboard?.students.length ?? 0} students / {dashboard?.professors.length ?? 0} professors</span>
              )}
            </div>

          </div>
        </div>
      </section>

      <section id="marketplace" className={visible("marketplace") ? "space-y-6" : "hidden"}>
        <Panel icon={ShoppingBag} eyebrow="Marketplace" title="Shared Campus Marketplace">
          <MarketplaceExperience mode="admin" embedded />
        </Panel>
      </section>

      <section id="dashboard" className={visible("dashboard") ? "space-y-6" : "hidden"}>
        <div className="grid gap-6 xl:grid-cols-[1fr_320px] xl:items-end">
          <div>
            <div className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[10px] uppercase tracking-[0.35em] font-bold ${
              isDark ? "border-white/10 text-white/45" : "border-slate-300 bg-white/80 text-slate-600 shadow-2xs"
            }`}>
              <ShieldCheck className="size-3.5" />
              Administrator command center
            </div>
            <h1 className={`mt-5 max-w-5xl font-display text-5xl font-bold tracking-tight md:text-7xl ${
              isDark ? "text-white" : "text-slate-900"
            }`}>
              Full-campus control with the same CampusVerse feel
            </h1>
            <p className={`mt-5 max-w-3xl font-medium ${
              isDark ? "text-white/55" : "text-slate-600"
            }`}>
              Monitor student versus professor ratio, track attendance health, and manage student and professor accounts from one unified admin desk.
            </p>
          </div>
          <Panel icon={Mail} eyebrow="Default admin login" title="">
            <div className="space-y-3">
              <ReadonlyField value={dashboard?.admin.email ?? "admin@gmail.com"} />
              <ReadonlyField value="admin#123" />
            </div>
          </Panel>
        </div>

        <div className="grid gap-4 xl:grid-cols-5">
          {(dashboard?.metrics ?? []).map((metric) => (
            <MetricCard key={metric.label} label={metric.label} value={metric.value} hint={metric.hint} />
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <Panel icon={GraduationCap} eyebrow="Student vs professor" title="Campus account ratio">
            <div className="space-y-6">
              <RatioRow
                label="Students"
                value={`${dashboard?.account_ratio.students ?? 0} accounts / ${dashboard?.account_ratio.studentShare ?? 0}%`}
                percent={dashboard?.account_ratio.studentShare ?? 0}
                tone="cyan"
              />
              <RatioRow
                label="Professors"
                value={`${dashboard?.account_ratio.professors ?? 0} accounts / ${dashboard?.account_ratio.professorShare ?? 0}%`}
                percent={dashboard?.account_ratio.professorShare ?? 0}
                tone="pink"
              />
            </div>
          </Panel>

          <Panel icon={BarChart3} eyebrow="Attendance" title="Student attendance overview">
            <AttendanceOverviewChart data={dashboard?.attendance_overview ?? []} />
          </Panel>
        </div>
      </section>

      <section id="student" className={visible("student") ? "space-y-6" : "hidden"}>
        {accountToast ? <AdminActionToast toast={accountToast} /> : null}

        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard label="Student accounts" value={String(filteredStudents.length)} hint="Visible student records" />
          <MetricCard label="Average CGPA" value={studentAverageCgpa} hint="Across visible students" />
          <MetricCard label="Average attendance" value={`${studentAverageAttendance}%`} hint="Across visible students" />
          <MetricCard label="Blocked students" value={String(blockedStudents)} hint="Admin restricted accounts" />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.35fr_0.95fr]">
          <Panel icon={GraduationCap} eyebrow="Student tab" title="All students">
            <div className="mb-5 space-y-3">
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "all", label: `All (${dashboard?.students.length ?? 0})` },
                  { key: "watchlist", label: `⚠️ Attendance Watchlist (<75%)` },
                  { key: "risk", label: `📉 Academic Risk (<7.5 CGPA)` },
                  { key: "blocked", label: `🚫 Blocked (${blockedStudents})` },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setStudentFilter(tab.key as any)}
                    className={`rounded-full px-3 py-1.5 text-xs uppercase tracking-[0.16em] transition ${
                      studentFilter === tab.key
                        ? "border border-cyan-400/40 bg-cyan-400/15 text-cyan-200"
                        : "border border-white/10 bg-white/[0.04] text-white/50 hover:text-white"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <InlineSearch
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search by name, roll, address, department"
              />
            </div>
            <div className={`overflow-hidden rounded-[24px] border ${isDark ? "border-white/10 bg-black/10" : "border-slate-200 bg-white"}`}>
              <div className={`grid grid-cols-[2fr_1.1fr_1fr_0.6fr_auto] gap-3 border-b px-4 py-3 text-[10px] uppercase tracking-[0.28em] ${isDark ? "border-white/10 text-white/35" : "border-slate-100 text-slate-400 bg-slate-50/80"}`}>
                <div className="min-w-0">Student</div>
                <div className="min-w-0">Roll</div>
                <div className="min-w-0">Address</div>
                <div className="min-w-0">Att.</div>
                <div className="pr-1">Actions</div>
              </div>
              <div className="max-h-[480px] overflow-y-auto divide-y divide-transparent">
                {filteredStudents.map((student) => {
                  const selected = selectedStudent?.id === student.id;
                  const accountAction = accountActions[student.id];
                  return (
                    <div
                      key={student.id}
                      className={`grid grid-cols-[2fr_1.1fr_1fr_0.5fr_auto] gap-3 items-center border-b px-4 py-2 text-sm last:border-b-0 cursor-pointer transition-colors ${
                        isDark
                          ? `border-white/5 text-white/80 ${selected ? "bg-white/[0.06]" : "hover:bg-white/[0.025]"}`
                          : `border-slate-100 text-slate-700 ${selected ? "bg-indigo-50" : "hover:bg-slate-50/80"}`
                      }`}
                      onClick={() => setSelectedStudentId(student.id)}
                    >
                      <div className="min-w-0 flex items-center gap-2.5">
                        <AvatarBadge value={student.avatar} imageUrl={student.avatarUrl} small />
                        <div className="min-w-0">
                          <div className={`truncate text-sm font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>{student.name}</div>
                          <div className={`truncate text-xs ${isDark ? "text-white/45" : "text-slate-500"}`}>{student.email}</div>
                        </div>
                      </div>
                      <div className={`min-w-0 text-[11px] font-mono whitespace-nowrap ${isDark ? "text-white/65" : "text-slate-600"}`}>{student.studentCode}</div>
                      <div className={`min-w-0 text-xs truncate ${isDark ? "text-white/65" : "text-slate-600"}`}>{student.address}</div>
                      <div className={`min-w-0 text-right pr-3 text-xs font-bold tabular-nums ${isDark ? "text-emerald-300" : "text-emerald-600"}`}>{student.attendance.toFixed(0)}%</div>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <CompactActionButton
                          onClick={() => setSelectedStudentId(student.id)}
                          icon={Eye}
                          title="View details"
                          isDark={isDark}
                        />
                        <CompactActionButton
                          onClick={() => toggleUserBlock(student.id, !student.isBlocked, student.name)}
                          icon={student.isBlocked ? UserCheck : Ban}
                          tone={student.isBlocked ? "emerald" : "rose"}
                          title={student.isBlocked ? "Unblock" : "Block"}
                          disabled={Boolean(accountAction)}
                          busy={accountAction === "block" || accountAction === "unblock"}
                          isDark={isDark}
                        />
                        <CompactActionButton
                          onClick={() => deleteUser(student.id, student.name)}
                          icon={Trash2}
                          tone="rose"
                          title="Delete"
                          disabled={Boolean(accountAction)}
                          busy={accountAction === "delete"}
                          isDark={isDark}
                        />
                      </div>
                    </div>
                  );
                })}
                {filteredStudents.length === 0 && (
                  <div className={`px-5 py-10 text-center text-sm ${isDark ? "text-white/45" : "text-slate-400"}`}>No student accounts match this search.</div>
                )}
              </div>
            </div>
          </Panel>

          <DetailPanel
            icon={GraduationCap}
            eyebrow="Student details"
            title={selectedStudent?.name ?? "No student selected"}
            avatar={selectedStudent?.avatar}
            avatarUrl={selectedStudent?.avatarUrl}
            status={
              selectedStudent ? (
                <StatusPill status={selectedStudent.status} blocked={selectedStudent.isBlocked} />
              ) : null
            }
          >
            {selectedStudent ? (
              <div className="space-y-4">
                <DetailGrid>
                  <DetailCard label="Email" value={selectedStudent.email} compact />
                  <DetailCard label="Roll" value={selectedStudent.studentCode} compact />
                  <DetailCard label="Department" value={selectedStudent.department} compact />
                  <DetailCard label="Semester" value={String(selectedStudent.semester)} compact />
                  <DetailCard label="CGPA" value={selectedStudent.cgpa.toFixed(2)} compact />
                  <DetailCard label="Attendance" value={`${selectedStudent.attendance.toFixed(1)}%`} compact />
                  <DetailCard label="Address" value={selectedStudent.address} compact />
                  <DetailCard label="Attendance marked" value={String(selectedStudent.attendanceMarked)} compact />
                  <DetailCard label="Present" value={String(selectedStudent.presentCount)} compact />
                  <DetailCard label="Absent" value={String(selectedStudent.absentCount)} compact />
                  <DetailCard
                    label="Biometric"
                    value={selectedStudent.biometricEnrolled ? "Face template enrolled" : "No face template"}
                    compact
                  />
                  <DetailCard
                    label="Enrolled at"
                    value={selectedStudent.biometricEnrolledAt ? formatDateTime(selectedStudent.biometricEnrolledAt) : "Not enrolled"}
                    compact
                  />
                  <DetailCard label="Blocked reason" value={selectedStudent.blockReason} compact />
                  <DetailCard label="Created" value={formatDateTime(selectedStudent.createdAt)} compact />
                </DetailGrid>
                <div className="flex flex-wrap gap-3">
                  <ListActionButton
                    onClick={() => resetStudentBiometric(selectedStudent.id, selectedStudent.name)}
                    icon={RefreshCw}
                    disabled={saving}
                  >
                    Reset face template
                  </ListActionButton>
                </div>
              </div>
            ) : (
              <EmptyState text="Choose a student record to inspect account details." />
            )}
          </DetailPanel>
        </div>
      </section>

      <section id="professor" className={visible("professor") ? "space-y-6" : "hidden"}>
        {accountToast ? <AdminActionToast toast={accountToast} /> : null}

        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard label="Faculty accounts" value={String(filteredProfessors.length)} hint="Visible professor records" />
          <MetricCard label="Verified faculty" value={String(verifiedProfessors)} hint="Approved faculty accounts" />
          <MetricCard label="Pending verification" value={String(pendingProfessors)} hint="Need admin review" />
          <MetricCard label="Blocked professors" value={String(blockedProfessors)} hint="Admin restricted faculty" />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.35fr_0.95fr]">
          <Panel icon={Building2} eyebrow="Professor tab" title="All professors">
            <div className="mb-5">
              <InlineSearch
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search by name, designation, address, department"
              />
            </div>
            <div className={`overflow-hidden rounded-[24px] border ${isDark ? "border-white/10 bg-black/10" : "border-slate-200 bg-white"}`}>
              <div className="max-h-[480px] overflow-y-auto divide-y divide-slate-100 dark:divide-white/5">
                {filteredProfessors.map((professor) => {
                  const selected = selectedProfessor?.id === professor.id;
                  const accountAction = accountActions[professor.id];
                  return (
                    <div
                      key={professor.id}
                      className={`flex flex-row items-start justify-between gap-4 p-4 cursor-pointer transition-colors ${
                        isDark
                          ? `${selected ? "bg-white/[0.06]" : "hover:bg-white/[0.025]"}`
                          : `${selected ? "bg-indigo-50/80" : "hover:bg-slate-50/80"}`
                      }`}
                      onClick={() => setSelectedProfessorId(professor.id)}
                    >
                      <div className="min-w-0 flex-1">
                        {/* Profile Info */}
                        <div className="flex items-center gap-2.5">
                          <AvatarBadge value={professor.avatar} imageUrl={professor.avatarUrl} small />
                          <div className="min-w-0">
                            <div className={`truncate text-sm font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>{professor.name}</div>
                            <div className={`truncate text-xs ${isDark ? "text-white/45" : "text-slate-500"}`}>{professor.email}</div>
                          </div>
                        </div>
                        
                        {/* Job & Address details */}
                        <div className="mt-2.5 space-y-0.5">
                          <div className={`text-sm font-semibold ${isDark ? "text-white/90" : "text-slate-800"}`}>{professor.designation}</div>
                          <div className={`text-xs ${isDark ? "text-white/45" : "text-slate-500"}`}>
                            {professor.address || "No address listed"}
                          </div>
                        </div>
                      </div>

                      {/* Status and Action controls */}
                      <div className="flex flex-col items-end gap-3 shrink-0">
                        <div>
                          <VerificationPill status={professor.isBlocked ? "blocked" : professor.verificationStatus} />
                        </div>
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <CompactActionButton
                            onClick={() => setSelectedProfessorId(professor.id)}
                            icon={Eye}
                            title="View details"
                            isDark={isDark}
                          />
                          <CompactActionButton
                            onClick={() => toggleUserBlock(professor.id, !professor.isBlocked, professor.name)}
                            icon={professor.isBlocked ? UserCheck : Ban}
                            tone={professor.isBlocked ? "emerald" : "rose"}
                            title={professor.isBlocked ? "Unblock" : "Block"}
                            disabled={Boolean(accountAction)}
                            busy={accountAction === "block" || accountAction === "unblock"}
                            isDark={isDark}
                          />
                          <CompactActionButton
                            onClick={() => deleteUser(professor.id, professor.name)}
                            icon={Trash2}
                            tone="rose"
                            title="Delete"
                            disabled={Boolean(accountAction)}
                            busy={accountAction === "delete"}
                            isDark={isDark}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filteredProfessors.length === 0 && (
                  <div className={`px-5 py-12 text-center text-sm ${isDark ? "text-white/45" : "text-slate-400"}`}>
                    No professor accounts match this search.
                  </div>
                )}
              </div>
            </div>
          </Panel>

          <DetailPanel
            icon={Building2}
            eyebrow="Professor details"
            title={selectedProfessor?.name ?? "No professor selected"}
            avatar={selectedProfessor?.avatar}
            avatarUrl={selectedProfessor?.avatarUrl}
            status={
              selectedProfessor ? (
                <VerificationPill status={selectedProfessor.isBlocked ? "blocked" : selectedProfessor.verificationStatus} />
              ) : null
            }
          >
            {selectedProfessor ? (
              <DetailGrid>
                <DetailCard label="Email" value={selectedProfessor.email} compact />
                <DetailCard label="Designation" value={selectedProfessor.designation} compact />
                <DetailCard label="Department" value={selectedProfessor.department} compact />
                <DetailCard label="Expertise" value={selectedProfessor.expertiseField} compact />
                <DetailCard label="Highest education" value={selectedProfessor.highestEducation} compact />
                <DetailCard label="Address" value={selectedProfessor.address} compact />
                <DetailCard label="Verification" value={selectedProfessor.verificationStatus} compact />
                <DetailCard label="License document" value={selectedProfessor.licenseDocumentName} compact />
                <DetailCard label="Students managed" value={String(selectedProfessor.studentsManaged)} compact />
                <DetailCard label="Blocked reason" value={selectedProfessor.blockReason} compact />
                <DetailCard label="Created" value={formatDateTime(selectedProfessor.createdAt)} compact />
              </DetailGrid>
            ) : (
              <EmptyState text="Choose a professor record to inspect account details." />
            )}
          </DetailPanel>
        </div>
      </section>

      <section id="announcements" className={visible("announcements") ? "space-y-6" : "hidden"}>
        <div className="grid gap-5 xl:grid-cols-[1.1fr_1.3fr]">
          <Panel icon={Megaphone} eyebrow="Publish Notice" title="Create campus announcement">
            <form onSubmit={handleCreateAdminAnnouncement} className="space-y-4">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/50 font-medium">Announcement Title</label>
                <input
                  value={annTitle}
                  onChange={(e) => setAnnTitle(e.target.value)}
                  placeholder="e.g. Mid-Semester Exam Schedule & Guidelines"
                  className="mt-1.5 w-full rounded-[24px] border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
                  required
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/50 font-medium">Category</label>
                  <select
                    value={annCategory}
                    onChange={(e) => setAnnCategory(e.target.value)}
                    className="mt-1.5 w-full truncate rounded-[24px] border border-white/10 bg-white/[0.06] px-3.5 py-3 text-xs text-white outline-none"
                  >
                    <option value="Academic" className="bg-[#0d0d12] text-white">Academic</option>
                    <option value="Exam" className="bg-[#0d0d12] text-white">Exam</option>
                    <option value="Placement" className="bg-[#0d0d12] text-white">Placement</option>
                    <option value="Events" className="bg-[#0d0d12] text-white">Events</option>
                    <option value="Urgent" className="bg-[#0d0d12] text-white">Urgent</option>
                    <option value="Sports" className="bg-[#0d0d12] text-white">Sports</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/50 font-medium">Target Audience</label>
                  <select
                    value={annAudience}
                    onChange={(e) => setAnnAudience(e.target.value as "Students" | "Professors" | "Both")}
                    className="mt-1.5 w-full truncate rounded-[24px] border border-white/10 bg-white/[0.06] px-3.5 py-3 text-xs text-white outline-none"
                  >
                    <option value="Both" className="bg-[#0d0d12] text-white">Both (All Users)</option>
                    <option value="Students" className="bg-[#0d0d12] text-white">Students Only</option>
                    <option value="Professors" className="bg-[#0d0d12] text-white">Professors Only</option>
                  </select>
                </div>
              </div>

              <label className="inline-flex items-center gap-3 text-xs text-white/70 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={annPinned}
                  onChange={(e) => setAnnPinned(e.target.checked)}
                  className="size-4 accent-fuchsia-400 rounded cursor-pointer"
                />
                <span className="flex items-center gap-1.5">
                  📌 Pin this notice to the top of student and professor feeds
                </span>
              </label>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/50 font-medium">Notice Content</label>
                <textarea
                  rows={4}
                  value={annBody}
                  onChange={(e) => setAnnBody(e.target.value)}
                  placeholder="Write full announcement description..."
                  className="mt-1.5 w-full rounded-[24px] border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={annPosting}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-2xl border border-[#d8efbc]/70 bg-[#d8efbc] px-7 py-3.5 text-xs font-extrabold uppercase tracking-[0.2em] text-[#101417] shadow-[0_0_25px_rgba(76,175,80,0.25)] transition-all duration-200 hover:bg-[#c8e9a8] hover:shadow-[0_0_35px_rgba(216,239,188,0.28)] hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 cursor-pointer"
              >
                {annPosting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4 text-[#101417]" />
                )}
                {annPosting ? "Broadcasting Announcement..." : "Broadcast Announcement & Generate Notifications"}
              </button>
            </form>
          </Panel>

          <Panel icon={Megaphone} eyebrow="Announcement History" title="Live broadcasts">
            <div className="space-y-3 max-h-[700px] overflow-y-auto pr-1">
              {announcements.length === 0 && (
                <div className="py-16 text-center text-sm text-white/40 space-y-3">
                  <div className="size-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto">
                    <Megaphone className="size-6 text-white/30" />
                  </div>
                  <div className="font-semibold text-white/70">No announcements published yet</div>
                  <div className="text-xs text-white/40 max-w-sm mx-auto leading-relaxed">
                    Fill out the form on the left to broadcast a campus update. Target notifications will be instantly generated for selected users.
                  </div>
                </div>
              )}
              {announcements.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2 hover:border-white/20 transition"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      {item.pinned && (
                        <span className="text-[10px] uppercase tracking-wider text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full font-semibold">
                          📌 Pinned
                        </span>
                      )}
                      <span className="text-[10px] uppercase tracking-wider text-fuchsia-300 bg-fuchsia-500/10 border border-fuchsia-500/30 px-2 py-0.5 rounded-full font-semibold">
                        {item.category}
                      </span>
                      <span className="text-[10px] text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-0.5 rounded-full font-medium">
                        Target: {item.audience}
                      </span>
                    </div>

                    <ListActionButton
                      onClick={() => handleDeleteAdminAnnouncement(item.id, item.title)}
                      icon={Trash2}
                      tone="rose"
                      disabled={saving}
                    >
                      Delete
                    </ListActionButton>
                  </div>

                  <div className="font-semibold text-sm text-white">{item.title}</div>
                  <p className="text-xs text-white/60 leading-relaxed line-clamp-3 whitespace-pre-wrap">{item.body}</p>
                  <div className="text-[10px] text-white/35 pt-1 border-t border-white/5 flex items-center justify-between">
                    <span>Issued: {item.time}</span>
                    <span>ID: #{item.id}</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </section>

      <section id="management" className={visible("management") ? "space-y-6" : "hidden"}>
        {managementView === "tracker" ? (
          <>
            <div className="grid gap-4 xl:grid-cols-3">
              <MetricCard label="Radius" value={`${radius}m`} hint="Default is 100m" />
              <MetricCard
                label="Campus center"
                value={campusCenter}
                hint={settings?.campus_configured ? "Configured and live" : "Set latitude and longitude first"}
              />
              <MetricCard label="Management" value="Live" hint="Radius tracker is active for biometric attendance" />
            </div>

            <Panel icon={Gauge} eyebrow="Management" title="Attendance radius">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <p className="max-w-2xl text-sm text-white/55">
                  Students inside this campus circle can complete biometric verification. Professors still confirm the final classroom attendance.
                </p>
                <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-white/55">
                  {settings?.updated_at ? `Updated ${new Date(settings.updated_at).toLocaleString()}` : "Waiting for first setup"}
                </div>
              </div>

              <form onSubmit={save} className="mt-6 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-[10px] uppercase tracking-[0.28em] text-white/40">Campus name</span>
                  <input
                    value={campusName}
                    onChange={(event) => setCampusName(event.target.value)}
                    className={`rounded-2xl border px-4 py-3 text-sm outline-none transition ${
                      isDark
                        ? "border-white/10 bg-white/[0.06] text-white focus:border-cyan-200/40"
                        : "border-slate-200 bg-white text-slate-900 focus:border-indigo-500 shadow-sm font-semibold"
                    }`}
                    placeholder="CampusVerse College"
                  />
                </label>

                <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
                  <label className="grid gap-2">
                    <span className="text-[10px] uppercase tracking-[0.28em] text-white/40">Radius meters</span>
                    <input
                      type="number"
                      min={25}
                      max={2000}
                      value={radius}
                      onChange={(event) => setRadius(Number(event.target.value))}
                      className={`rounded-2xl border px-4 py-3 text-sm outline-none transition ${
                        isDark
                          ? "border-white/10 bg-white/[0.06] text-white focus:border-fuchsia-200/40"
                          : "border-slate-200 bg-white text-slate-900 focus:border-indigo-500 shadow-sm font-semibold"
                      }`}
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-[10px] uppercase tracking-[0.28em] text-white/40">Latitude</span>
                    <input
                      value={latitude}
                      onChange={(event) => setLatitude(event.target.value)}
                      className={`rounded-2xl border px-4 py-3 text-sm outline-none transition ${
                        isDark
                          ? "border-white/10 bg-white/[0.06] text-white focus:border-cyan-200/40"
                          : "border-slate-200 bg-white text-slate-900 focus:border-indigo-500 shadow-sm font-semibold"
                      }`}
                      placeholder="28.5355000"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-[10px] uppercase tracking-[0.28em] text-white/40">Longitude</span>
                    <input
                      value={longitude}
                      onChange={(event) => setLongitude(event.target.value)}
                      className={`rounded-2xl border px-4 py-3 text-sm outline-none transition ${
                        isDark
                          ? "border-white/10 bg-white/[0.06] text-white focus:border-cyan-200/40"
                          : "border-slate-200 bg-white text-slate-900 focus:border-indigo-500 shadow-sm font-semibold"
                      }`}
                      placeholder="77.3910000"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={useCurrentLocation}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-200/20 bg-cyan-300/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-300/20"
                  >
                    <LocateFixed className="size-4" />
                    Use current
                  </button>
                </div>

                <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-3 text-sm text-white/60">
                      {settings?.campus_configured ? (
                        <CheckCircle2 className="size-5 text-emerald-300" />
                      ) : (
                        <AlertCircle className="size-5 text-amber-200" />
                      )}
                      <span>
                        {settings?.campus_configured
                          ? "Students can now be detected inside the configured campus radius."
                          : "Set campus latitude and longitude to activate student radius popups."}
                      </span>
                    </div>
                    <button
                      disabled={saving || loading}
                      className={ADMIN_PRIMARY_ACTION_CLASS}
                    >
                      <Save className="size-4" />
                      {saving ? "Saving" : "Save radius"}
                    </button>
                  </div>
                </div>
              </form>
            </Panel>
          </>
        ) : (
          <>
            <div className="grid gap-4 xl:grid-cols-4">
              <MetricCard
                label="Active batch"
                value={activeSlotBatch?.batch_name ?? "No batch open"}
                hint={
                  activeSlotBatch
                    ? `${activeSlotBatch.filled_slots}/${activeSlotBatch.total_slots} filled`
                    : "Open the next Sem 1 intake when you are ready"
                }
              />
              <MetricCard label="Slot capacity" value={String(totalSlotCapacity)} hint={`${totalSlotFilled} filled across all released batches`} />
              <MetricCard label="Slots left" value={String(totalSlotLeft)} hint="Remaining seats for future student onboarding" />
              <MetricCard label="Semester duration" value={semesterDurationLabel} hint="Students auto-advance after this duration" />
            </div>

            <div className="grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
              <Panel icon={GraduationCap} eyebrow="Slots" title="Sem 1 intake release">
                <div className="space-y-6">
                  <div className="rounded-3xl border border-white/10 bg-black/20 p-4 text-sm text-white/58">
                    Every new student starts in <span className="font-medium text-white">Sem 1</span>. Admin-released slots decide how many students can register or use Google login before the batch closes.
                  </div>

                  <form onSubmit={saveSemesterDuration} className="grid gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-start gap-3">
                      <CalendarClock className="mt-0.5 size-5 text-cyan-200" />
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.28em] text-white/40">Semester duration</div>
                        <div className="mt-2 text-sm text-white/58">
                          After this duration, a student automatically moves to the next semester.
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-4">
                      <div className={`inline-flex w-fit rounded-full border p-1 text-xs uppercase tracking-[0.18em] ${
                        isDark ? "border-white/10 bg-white/[0.04] text-white/55" : "border-slate-200 bg-white text-slate-600 shadow-sm"
                      }`}>
                        {(["months", "days"] as const).map((unit) => (
                          <button
                            key={unit}
                            type="button"
                            onClick={() => setSemesterDurationUnit(unit)}
                            className={`rounded-full border px-4 py-2 font-bold transition ${
                              semesterDurationUnit === unit
                                ? "border-[#d8efbc]/70 bg-[#d8efbc] text-[#101417] shadow-[0_8px_18px_rgba(76,175,80,0.18)]"
                                : isDark
                                  ? "border-transparent text-white/60 hover:text-[#d8efbc]"
                                  : "border-transparent text-slate-600 hover:text-[#1f7a32]"
                            }`}
                          >
                            {unit}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                      <label className="grid gap-2">
                        <span className="text-[10px] uppercase tracking-[0.28em] text-white/40">
                          Duration in {semesterDurationUnit}
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={semesterDurationUnit === "days" ? 730 : 24}
                          value={semesterDurationInputValue}
                          onChange={(event) => {
                            const maxDuration = semesterDurationUnit === "days" ? 730 : 24;
                            const nextValue = Math.min(maxDuration, Math.max(1, Number(event.target.value) || 1));
                            if (semesterDurationUnit === "days") {
                              setSemesterDurationDays(nextValue);
                            } else {
                              setSemesterDurationMonths(nextValue);
                            }
                          }}
                          className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-200/40"
                        />
                      </label>
                      <button
                        disabled={saving || loading}
                        className={ADMIN_PRIMARY_ACTION_CLASS}
                      >
                        <Save className="size-4" />
                        Save duration
                      </button>
                    </div>
                  </form>

                  <form onSubmit={createSlotRelease} className="grid gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="text-[10px] uppercase tracking-[0.28em] text-white/40">Create slot batch</div>
                    <label className="grid gap-2">
                      <span className="text-[10px] uppercase tracking-[0.28em] text-white/40">Batch name</span>
                      <input
                        value={slotBatchName}
                        onChange={(event) => setSlotBatchName(event.target.value)}
                        className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none transition focus:border-fuchsia-200/40"
                        placeholder="Batch 2026"
                      />
                    </label>
                    <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
                      <label className="grid gap-2">
                        <span className="text-[10px] uppercase tracking-[0.28em] text-white/40">Total slots</span>
                        <input
                          type="number"
                          min={1}
                          max={5000}
                          value={slotCount}
                          onChange={(event) => {
                            const nextValue = Math.min(5000, Math.max(1, Number(event.target.value) || 1));
                            setSlotCount(nextValue);
                          }}
                          className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-200/40"
                        />
                      </label>
                      <label className="grid gap-2">
                        <span className="text-[10px] uppercase tracking-[0.28em] text-white/40">Slot duration</span>
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={slotDurationDays}
                          onChange={(event) => {
                            const nextValue = Math.min(365, Math.max(1, Number(event.target.value) || 1));
                            setSlotDurationDays(nextValue);
                          }}
                          className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-200/40"
                        />
                      </label>
                      <label className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/75">
                        <input
                          type="checkbox"
                          checked={openNewBatch}
                          onChange={(event) => setOpenNewBatch(event.target.checked)}
                          className="size-4 rounded border-white/20 bg-transparent"
                        />
                        Open immediately
                      </label>
                    </div>
                    <button
                      disabled={saving || loading}
                      className={`${ADMIN_PRIMARY_ACTION_CLASS} w-full`}
                    >
                      <Save className="size-4" />
                      Release slots
                    </button>
                  </form>
                </div>
              </Panel>

              <Panel icon={BadgeCheck} eyebrow="Slots" title="Batch availability">
                <div className="space-y-4">
                  {slotBatches.length === 0 ? (
                    <EmptyState text="No slot batches released yet. Create the first Sem 1 intake from the left panel." />
                  ) : (
                    slotBatches.map((batch) => {
                      const batchIsFull = Boolean(batch.is_full ?? batch.slots_left <= 0);
                      const batchIsOpen = Boolean(batch.registration_open ?? (batch.intake_open && !batchIsFull));
                      const statusLabel = batchIsFull ? "Full" : batchIsOpen ? "Open intake" : "Closed";

                      return (
                        <div key={batch.id} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <div className="text-[10px] uppercase tracking-[0.28em] text-white/40">Sem 1 batch</div>
                              <div className="mt-2 font-display text-2xl text-white">{batch.batch_name}</div>
                              <div className="mt-2 text-sm text-white/52">
                                Created {batch.created_at ? formatDateTime(batch.created_at) : "recently"}
                              </div>
                              <div className="mt-1 text-xs text-white/42">
                                {batch.expires_at ? `Closes ${formatDateTime(batch.expires_at)}` : "No closing date set"}
                              </div>
                            </div>
                            <div
                              className={`inline-flex items-center rounded-full px-3 py-1 text-xs uppercase tracking-[0.18em] ${
                                batchIsFull
                                  ? "border border-amber-300/20 bg-amber-400/10 text-amber-100"
                                  : batchIsOpen
                                    ? "border border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
                                    : "border border-white/10 bg-white/[0.04] text-white/50"
                              }`}
                            >
                              {statusLabel}
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 md:grid-cols-4">
                            <DetailCard label="Total slots" value={String(batch.total_slots)} compact />
                            <DetailCard label="Filled" value={String(batch.filled_slots)} compact />
                            <DetailCard label="Left" value={String(batch.slots_left)} compact />
                            <DetailCard label="Duration" value={`${batch.duration_days} ${batch.duration_days === 1 ? "day" : "days"}`} compact />
                          </div>

                          <div className="mt-4 h-3 rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${batch.total_slots ? Math.max((batch.filled_slots / batch.total_slots) * 100, batch.filled_slots ? 6 : 0) : 0}%`,
                                background: "var(--grad-aurora)",
                              }}
                            />
                          </div>

                          <div className="mt-4 flex flex-wrap gap-3">
                            <button
                              type="button"
                              disabled={saving || loading || (batchIsFull && !batch.intake_open)}
                              onClick={() => toggleSlotRelease(batch.id, !batch.intake_open, batch.batch_name)}
                              className={`rounded-2xl px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition disabled:cursor-wait disabled:opacity-60 ${
                                batch.intake_open
                                  ? "border border-white/10 bg-white/[0.04] text-white/70 hover:text-white"
                                  : "border border-cyan-200/20 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20"
                              }`}
                            >
                              {batchIsFull && !batch.intake_open ? "Full" : batch.intake_open ? "Pause intake" : "Open intake"}
                            </button>
                            <button
                              type="button"
                              disabled={saving || loading}
                              onClick={() => deleteSlotRelease(batch.id, batch.batch_name)}
                              className="inline-flex items-center gap-2 rounded-2xl border border-rose-300/20 bg-rose-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-wait disabled:opacity-60"
                            >
                              <Trash2 className="size-4" />
                              Delete slot
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </Panel>
            </div>
          </>
        )}
      </section>

      <section id="fees" className={visible("fees") ? "space-y-6" : "hidden"}>
        <div className="grid gap-4 xl:grid-cols-5">
          <MetricCard label="Collected" value={formatCurrency(feeMetrics.totalCollected)} hint="Verified Razorpay payments and imported paid dues" />
          <MetricCard label="Pending" value={formatCurrency(feeMetrics.totalPending)} hint="Outstanding across student ledgers" />
          <MetricCard label="Students cleared" value={String(feeMetrics.paidStudents)} hint="No outstanding balance" />
          <MetricCard label="Students pending" value={String(feeMetrics.pendingStudents)} hint="Need fee payment" />
          <MetricCard label="Razorpay" value={feeData?.razorpayEnabled ? "Live" : "Setup"} hint="Backend key status" />
        </div>

        <div className="grid gap-5 xl:grid-cols-[0.92fr_1.38fr]">
          <Panel icon={CreditCard} eyebrow="Fee management" title="Semester fee editor">
            <div className="space-y-4">
              {feeData?.razorpayEnabled ? (
                <div className="rounded-3xl border border-emerald-300/15 bg-emerald-400/10 p-4 text-sm text-emerald-100">
                  Razorpay checkout is connected for student payments.
                </div>
              ) : (
                <div className="rounded-3xl border border-amber-300/15 bg-amber-400/10 p-4 text-sm text-amber-100">
                  Add Razorpay keys in the backend environment to activate checkout.
                </div>
              )}

              {(feeData?.settings ?? []).map((setting) => (
                <div key={setting.semester} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <label className="grid flex-1 gap-2">
                      <span className="text-[10px] uppercase tracking-[0.28em] text-white/40">
                        Semester {setting.semester}
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={10_000_000}
                        value={feeAmountEdits[setting.semester] ?? setting.amount}
                        onChange={(event) =>
                          setFeeAmountEdits((current) => ({
                            ...current,
                            [setting.semester]: Number(event.target.value),
                          }))
                        }
                        className={`rounded-2xl border px-4 py-3 text-sm outline-none transition ${
                          isDark
                            ? "border-white/10 bg-white/[0.06] text-white focus:border-cyan-200/40"
                            : "border-slate-200 bg-white text-slate-900 focus:border-indigo-500 shadow-sm font-semibold"
                        }`}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={saving || loading}
                      onClick={() => saveSemesterFee(setting.semester)}
                      className={ADMIN_PRIMARY_ACTION_CLASS}
                    >
                      {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                      Save fee
                    </button>
                  </div>
                  <div className="mt-3 text-xs uppercase tracking-[0.18em] text-white/35">
                    Current amount {formatCurrency(setting.amount)}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel icon={Wallet} eyebrow="Student fee ledger" title="Paid and pending">
            <div className="mb-5 grid gap-3 xl:grid-cols-[1fr_auto_auto] xl:items-center">
              <InlineSearch
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search by student, roll, department, invoice"
              />
              <div className="rounded-[24px] border border-white/10 bg-white/[0.05] px-4 py-3 text-xs uppercase tracking-[0.18em] text-white/50">
                Visible collected {formatCurrency(filteredFeeCollected)}
              </div>
              <div className="rounded-[24px] border border-white/10 bg-white/[0.05] px-4 py-3 text-xs uppercase tracking-[0.18em] text-white/50">
                Visible pending {formatCurrency(filteredFeeOutstanding)}
              </div>
            </div>

            <div className={`overflow-hidden rounded-[24px] border ${isDark ? "border-white/10 bg-black/10" : "border-slate-200 bg-white"}`}>
              <div className={`grid grid-cols-[1.5fr_0.45fr_0.7fr_0.7fr_0.62fr_1.1fr] gap-3 border-b px-4 py-3 text-[10px] uppercase tracking-[0.28em] ${isDark ? "border-white/10 text-white/35" : "border-slate-100 text-slate-400 bg-slate-50/80"}`}>
                <div>Student</div>
                <div>Sem</div>
                <div>Pending</div>
                <div>Paid</div>
                <div>Status</div>
                <div>Invoices</div>
              </div>
              <div className="max-h-[440px] overflow-y-auto divide-y divide-transparent">
                {filteredFeeStudents.map((student) => (
                  <div
                    key={student.studentId}
                    className={`grid grid-cols-[1.5fr_0.45fr_0.7fr_0.7fr_0.62fr_1.1fr] gap-3 items-center border-b px-4 py-2.5 text-sm last:border-b-0 ${isDark ? "border-white/5 text-white/80" : "border-slate-100 text-slate-700 bg-white"}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5">
                        <AvatarBadge value={avatarFromName(student.name)} imageUrl={student.avatarUrl} small />
                        <div className="min-w-0">
                          <div className={`truncate text-sm font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>{student.name}</div>
                          <div className={`truncate text-xs ${isDark ? "text-white/45" : "text-slate-500"}`}>{student.studentCode}</div>
                        </div>
                      </div>
                    </div>
                    <div className={`text-xs ${isDark ? "text-white/65" : "text-slate-600"}`}>Sem {student.semester}</div>
                    <div className={`text-xs font-semibold tabular-nums ${isDark ? "text-amber-200" : "text-amber-600"}`}>{formatCurrency(student.outstanding)}</div>
                    <div className={`text-xs font-semibold tabular-nums ${isDark ? "text-emerald-200" : "text-emerald-600"}`}>{formatCurrency(student.collected)}</div>
                    <div>
                      <FeeStatusPill status={student.status} />
                    </div>
                    <FeeInvoiceStack student={student} />
                  </div>
                ))}
                {filteredFeeStudents.length === 0 && (
                  <div className={`px-5 py-10 text-center text-sm ${isDark ? "text-white/45" : "text-slate-550"}`}>
                    No fee ledger records match this search.
                  </div>
                )}
              </div>
            </div>
          </Panel>
        </div>
      </section>

      <section id="certificate" className={visible("certificate") ? "space-y-6" : "hidden"}>
        {certificateToast ? <AdminActionToast toast={certificateToast} /> : null}

        <div className="grid gap-4 xl:grid-cols-5">
          <MetricCard label="Certificate requests" value={String(filteredCertificateRequests.length)} hint="Visible certification queue" />
          <MetricCard label="Pending review" value={String(pendingCertificateRequests)} hint="Waiting for admin approval" />
          <MetricCard label="Approved" value={String(approvedCertificateRequests)} hint="Ready for student download" />
          <MetricCard label="Downloaded" value={String(downloadedCertificateRequests)} hint="Already collected by students" />
          <MetricCard label="Rejected" value={String(rejectedCertificateRequests)} hint="Declined certificate requests" />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.12fr_1fr]">
          <Panel icon={Award} eyebrow="Certificate" title="Student certificate requests">
            <div className="mb-5 space-y-3">
              <InlineSearch
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search by student, roll, department, certificate"
              />
              <div className="grid gap-2.5 grid-cols-[1fr_auto]">
                <select
                  value={certificateStatusFilter}
                  onChange={(event) => setCertificateStatusFilter(event.target.value as CertificateStatusFilter)}
                  className={`rounded-[24px] border px-4 py-3 text-sm outline-none w-full ${isDark ? "border-white/10 bg-white/[0.06] text-white" : "border-slate-200 bg-white text-slate-900"}`}
                >
                  <option value="all" className="bg-[#0d0d12] text-white">All status</option>
                  <option value="requested" className="bg-[#0d0d12] text-white">Requested</option>
                  <option value="ready" className="bg-[#0d0d12] text-white">Approved</option>
                  <option value="downloaded" className="bg-[#0d0d12] text-white">Downloaded</option>
                  <option value="rejected" className="bg-[#0d0d12] text-white">Rejected</option>
                </select>
                <button
                  type="button"
                  onClick={clearCertificateFilters}
                  className={`rounded-[24px] border px-6 py-3 text-xs font-semibold uppercase tracking-[0.18em] transition ${isDark ? "border-white/10 bg-white/[0.05] text-white/65 hover:text-white" : "border-slate-200 bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200"}`}
                >
                  Clear
                </button>
              </div>
            </div>

            <div className={`overflow-hidden rounded-[24px] border ${isDark ? "border-white/10 bg-black/10" : "border-slate-200 bg-white"}`}>
              <div className="max-h-[440px] overflow-y-auto divide-y divide-slate-100 dark:divide-white/5">
                {filteredCertificateRequests.map((request) => {
                  const selected = selectedCertificateRequest?.id === request.id;
                  const certificateAction = certificateActions[request.id];
                  const showRejectAction = request.status !== "downloaded";
                  return (
                    <div
                      key={request.id}
                      className={`flex flex-row items-start justify-between gap-4 p-4 cursor-pointer transition-colors ${
                        isDark
                          ? `${selected ? "bg-white/[0.06]" : "hover:bg-white/[0.025]"}`
                          : `${selected ? "bg-indigo-50/80" : "hover:bg-slate-50/80"}`
                      }`}
                      onClick={() => setSelectedCertificateRequestId(request.id)}
                    >
                      <div className="min-w-0 flex-1">
                        {/* Student info */}
                        <div className="flex items-center gap-2.5">
                          <AvatarBadge value={avatarFromName(request.student_name)} imageUrl={request.avatar_url} small />
                          <div className="min-w-0">
                            <div className={`truncate text-sm font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>{request.student_name}</div>
                            <div className={`truncate text-xs ${isDark ? "text-white/45" : "text-slate-500"}`}>{request.student_code}</div>
                          </div>
                        </div>
                        
                        {/* Certificate details */}
                        <div className="mt-2.5">
                          <div className={`text-sm font-semibold ${isDark ? "text-white/90" : "text-slate-800"}`}>{request.certificate_name}</div>
                          <div className={`text-xs mt-0.5 ${isDark ? "text-white/45" : "text-slate-500"}`}>
                            Sem {request.semester} / CGPA {request.cgpa.toFixed(2)}
                          </div>
                          <div className={`text-[10px] tracking-wide mt-1.5 ${isDark ? "text-white/35" : "text-slate-400 font-medium"}`}>
                            Requested: {formatDateTime(request.requested_at ?? "")}
                          </div>
                        </div>
                      </div>

                      {/* Status and Action controls */}
                      <div className="flex flex-col items-end gap-3 shrink-0">
                        <div>
                          <CertificateStatusPill status={request.status} label={request.status_label} />
                        </div>
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <CompactActionButton
                            onClick={() => setSelectedCertificateRequestId(request.id)}
                            icon={Eye}
                            title="View details"
                            isDark={isDark}
                          />
                          {showRejectAction ? (
                            <CompactActionButton
                              onClick={() => rejectCertificateRequest(request)}
                              icon={Ban}
                              tone="rose"
                              title="Reject"
                              disabled={Boolean(certificateAction) || request.status === "rejected"}
                              busy={certificateAction === "reject"}
                              isDark={isDark}
                            />
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filteredCertificateRequests.length === 0 && (
                  <div className={`px-5 py-12 text-center text-sm ${isDark ? "text-white/45" : "text-slate-400"}`}>
                    No certificate requests match this search yet.
                  </div>
                )}
              </div>
            </div>
          </Panel>

          <DetailPanel
            icon={FileText}
            eyebrow="Certificate builder"
            title={selectedCertificateRequest?.certificate_name ?? "No certificate selected"}
            avatar={selectedCertificateRequest ? avatarFromName(selectedCertificateRequest.student_name) : undefined}
            avatarUrl={selectedCertificateRequest?.avatar_url}
            status={
              selectedCertificateRequest ? (
                <CertificateStatusPill
                  status={selectedCertificateRequest.status}
                  label={selectedCertificateRequest.status_label}
                />
              ) : null
            }
          >
            {selectedCertificateRequest ? (
              <div className="space-y-4">
                <DetailGrid>
                  <DetailCard label="Student" value={selectedCertificateRequest.student_name} compact />
                  <DetailCard label="Roll" value={selectedCertificateRequest.student_code || "Not assigned"} compact />
                  <DetailCard label="Department" value={selectedCertificateRequest.department || "N/A"} compact />
                  <DetailCard label="Semester" value={`Sem ${selectedCertificateRequest.semester}`} compact />
                  <DetailCard label="CGPA" value={selectedCertificateRequest.cgpa.toFixed(2)} compact />
                  <DetailCard label="Attendance" value={`${selectedCertificateRequest.attendance.toFixed(1)}%`} compact />
                  <DetailCard label="Requested" value={formatDateTime(selectedCertificateRequest.requested_at ?? "")} compact />
                  <DetailCard label="Ready" value={formatDateTime(selectedCertificateRequest.ready_at ?? "")} compact />
                </DetailGrid>

                <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-white/35">Issuance details</div>
                  <div className="mt-4 grid gap-4">
                    <label className="grid gap-2">
                      <span className="text-[10px] uppercase tracking-[0.22em] text-white/40">Certificate purpose</span>
                      <input
                        value={certificatePurpose}
                        onChange={(event) => setCertificatePurpose(event.target.value)}
                        className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${
                          isDark
                            ? "border-white/10 bg-white/[0.06] text-white focus:border-cyan-200/40"
                            : "border-slate-200 bg-white text-slate-900 focus:border-indigo-500 shadow-sm font-semibold"
                        }`}
                      />
                    </label>
                     <label className="grid gap-2">
                      <span className="text-[10px] uppercase tracking-[0.22em] text-white/40">Certificate body</span>
                      <textarea
                        rows={4}
                        value={certificateBody}
                        onChange={(event) => setCertificateBody(event.target.value)}
                        className={`w-full resize-none rounded-2xl border px-4 py-3 text-sm leading-6 outline-none transition ${
                          isDark
                            ? "border-white/10 bg-white/[0.06] text-white focus:border-cyan-200/40"
                            : "border-slate-200 bg-white text-slate-900 focus:border-indigo-500 shadow-sm font-semibold"
                        }`}
                      />
                    </label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="grid gap-2">
                        <span className="text-[10px] uppercase tracking-[0.22em] text-white/40">Signatory name</span>
                        <input
                          value={certificateSignatoryName}
                          onChange={(event) => setCertificateSignatoryName(event.target.value)}
                          className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${
                            isDark
                              ? "border-white/10 bg-white/[0.06] text-white focus:border-cyan-200/40"
                              : "border-slate-200 bg-white text-slate-900 focus:border-indigo-500 shadow-sm font-semibold"
                          }`}
                        />
                      </label>
                      <label className="grid gap-2">
                        <span className="text-[10px] uppercase tracking-[0.22em] text-white/40">Signatory title</span>
                        <input
                          value={certificateSignatoryTitle}
                          onChange={(event) => setCertificateSignatoryTitle(event.target.value)}
                          className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${
                            isDark
                              ? "border-white/10 bg-white/[0.06] text-white focus:border-cyan-200/40"
                              : "border-slate-200 bg-white text-slate-900 focus:border-indigo-500 shadow-sm font-semibold"
                          }`}
                        />
                      </label>
                    </div>
                    <label className="grid gap-2">
                      <span className="text-[10px] uppercase tracking-[0.22em] text-white/40">Admin note</span>
                      <textarea
                        rows={3}
                        value={certificateAdminNote}
                        onChange={(event) => setCertificateAdminNote(event.target.value)}
                        className={`w-full resize-none rounded-2xl border px-4 py-3 text-sm leading-6 outline-none transition ${
                          isDark
                            ? "border-white/10 bg-white/[0.06] text-white focus:border-cyan-200/40"
                            : "border-slate-200 bg-white text-slate-900 focus:border-indigo-500 shadow-sm font-semibold"
                        }`}
                      />
                    </label>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={Boolean(selectedCertificateAction)}
                    onClick={approveCertificateRequest}
                    className={ADMIN_PRIMARY_ACTION_CLASS}
                  >
                    {selectedCertificateAction === "approve" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                    {selectedCertificateAction === "approve" ? "Approving" : "Approve & Send"}
                  </button>
                  {selectedCertificateRequest.status !== "downloaded" ? (
                    <button
                      type="button"
                      disabled={Boolean(selectedCertificateAction) || selectedCertificateRequest.status === "rejected"}
                      onClick={() => rejectCertificateRequest(selectedCertificateRequest)}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-300/20 bg-rose-500/10 px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-wait disabled:opacity-60"
                    >
                      {selectedCertificateAction === "reject" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Ban className="size-4" />
                      )}
                      {selectedCertificateAction === "reject" ? "Rejecting" : "Reject"}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <EmptyState text="Select a certificate request to review student details and issue a certificate." />
            )}
          </DetailPanel>
        </div>
      </section>

      <section id="complaints" className={visible("complaints") ? "space-y-6" : "hidden"}>
        <div className="grid gap-4 xl:grid-cols-5">
          <MetricCard label="Complaint inbox" value={String(filteredComplaints.length)} hint="Visible student complaints" />
          <MetricCard label="Submitted" value={String(submittedComplaints)} hint="Waiting for first admin response" />
          <MetricCard label="Acknowledged" value={String(acknowledgedComplaints)} hint="Seen by admin and queued" />
          <MetricCard label="In progress" value={String(inProgressComplaints)} hint="Being actively handled" />
          <MetricCard label="Resolved" value={String(resolvedComplaints)} hint="Closed complaints" />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.18fr_1.02fr]">
          <Panel icon={AlertCircle} eyebrow="Complaints" title="Student complaints">
            <div className="mb-5 space-y-3">
              <InlineSearch
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search by student name, code, category..."
              />
              <div className="grid gap-2.5 grid-cols-2">
                <select
                  value={complaintStatusFilter}
                  onChange={(event) =>
                    setComplaintStatusFilter(event.target.value as "all" | "open" | AdminComplaint["status"])
                  }
                  className={`rounded-[24px] border px-4 py-3 text-sm outline-none ${isDark ? "border-white/10 bg-white/[0.06] text-white" : "border-slate-200 bg-white text-slate-900"}`}
                >
                  <option value="all" className="bg-[#0d0d12] text-white">All status</option>
                  <option value="open" className="bg-[#0d0d12] text-white">Open</option>
                  <option value="submitted" className="bg-[#0d0d12] text-white">Submitted</option>
                  <option value="acknowledged" className="bg-[#0d0d12] text-white">Acknowledged</option>
                  <option value="in_progress" className="bg-[#0d0d12] text-white">In Progress</option>
                  <option value="resolved" className="bg-[#0d0d12] text-white">Resolved</option>
                </select>
                <select
                  value={complaintCategoryFilter}
                  onChange={(event) => setComplaintCategoryFilter(event.target.value)}
                  className={`rounded-[24px] border px-4 py-3 text-sm outline-none ${isDark ? "border-white/10 bg-white/[0.06] text-white" : "border-slate-200 bg-white text-slate-900"}`}
                >
                  <option value="all" className="bg-[#0d0d12] text-white">All categories</option>
                  {complaintCategories.map((category) => (
                    <option key={category} value={category} className="bg-[#0d0d12] text-white">
                      {category}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={complaintDateFilter}
                  onChange={(event) => setComplaintDateFilter(event.target.value)}
                  className={`rounded-[24px] border px-4 py-3 text-sm outline-none ${isDark ? "border-white/10 bg-white/[0.06] text-white" : "border-slate-200 bg-white text-slate-900"}`}
                />
                <button
                  type="button"
                  onClick={clearComplaintFilters}
                  className={`rounded-[24px] border px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] transition ${isDark ? "border-white/10 bg-white/[0.05] text-white/65 hover:text-white" : "border-slate-200 bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200"}`}
                >
                  Clear
                </button>
              </div>
            </div>

            <div className={`overflow-hidden rounded-[24px] border ${isDark ? "border-white/10 bg-black/10" : "border-slate-200 bg-white"}`}>
              <div className="max-h-[440px] overflow-y-auto divide-y divide-slate-100 dark:divide-white/5">
                {filteredComplaints.map((complaint) => {
                  const selected = selectedComplaint?.id === complaint.id;
                  return (
                    <div
                      key={complaint.id}
                      className={`flex flex-row items-start justify-between gap-4 p-4 cursor-pointer transition-colors ${
                        isDark
                          ? `${selected ? "bg-white/[0.06]" : "hover:bg-white/[0.025]"}`
                          : `${selected ? "bg-indigo-50/80" : "hover:bg-slate-50/80"}`
                      }`}
                      onClick={() => setSelectedComplaintId(complaint.id)}
                    >
                      <div className="min-w-0 flex-1">
                        {/* Student profile info */}
                        <div className="flex items-center gap-2.5">
                          <AvatarBadge value={avatarFromName(complaint.studentName)} imageUrl={complaint.avatarUrl} small />
                          <div className="min-w-0">
                            <div className={`truncate text-sm font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>{complaint.studentName}</div>
                            <div className={`truncate text-xs ${isDark ? "text-white/45" : "text-slate-500"}`}>
                              {complaint.studentCode || complaint.studentEmail}
                            </div>
                          </div>
                        </div>

                        {/* Complaint details */}
                        <div className="mt-2.5 space-y-0.5">
                          <div className={`text-sm font-semibold ${isDark ? "text-white/90" : "text-slate-800"}`}>{complaint.complaintCode}</div>
                          <div className={`text-xs ${isDark ? "text-white/45" : "text-slate-500"}`}>{complaint.category}</div>
                        </div>
                      </div>

                      {/* Status and Action controls */}
                      <div className="flex flex-col items-end gap-3 shrink-0">
                        <div>
                          <ComplaintStatusPill status={complaint.status} />
                        </div>
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <span className={`text-[10px] ${isDark ? "text-white/35" : "text-slate-400 font-medium"}`}>
                            {formatDateTime(complaint.submittedAt)}
                          </span>
                          <CompactActionButton
                            onClick={() => setSelectedComplaintId(complaint.id)}
                            icon={Eye}
                            title="View details"
                            isDark={isDark}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filteredComplaints.length === 0 && (
                  <div className={`px-5 py-12 text-center text-sm ${isDark ? "text-white/45" : "text-slate-400"}`}>
                    No student complaints match this search yet.
                  </div>
                )}
              </div>
            </div>
          </Panel>

          <DetailPanel
            icon={FileText}
            eyebrow="Complaint details"
            title={selectedComplaint?.title ?? "No complaint selected"}
            avatar={selectedComplaint ? avatarFromName(selectedComplaint.studentName) : undefined}
            avatarUrl={selectedComplaint?.avatarUrl}
            status={selectedComplaint ? <ComplaintStatusPill status={selectedComplaint.status} /> : null}
          >
            {selectedComplaint ? (
              <div className="space-y-4">
                <DetailGrid>
                  <DetailCard label="Complaint code" value={selectedComplaint.complaintCode} compact />
                  <DetailCard label="Category" value={selectedComplaint.category} compact />
                  <DetailCard label="Student" value={selectedComplaint.studentName} compact />
                  <DetailCard label="Roll" value={selectedComplaint.studentCode || "Not assigned"} compact />
                  <DetailCard label="Department" value={selectedComplaint.department || "N/A"} compact />
                  <DetailCard label="Semester" value={selectedComplaint.semester ? `Sem ${selectedComplaint.semester}` : "N/A"} compact />
                  <DetailCard label="Submitted" value={formatDateTime(selectedComplaint.submittedAt)} compact />
                  <DetailCard label="Last updated" value={formatDateTime(selectedComplaint.updatedAt)} compact />
                </DetailGrid>

                <div className={`rounded-[24px] border p-4 ${isDark ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-slate-50"}`}>
                  <div className={`text-[10px] uppercase tracking-[0.28em] ${isDark ? "text-white/35" : "text-slate-400"}`}>Complaint details</div>
                  <div className={`mt-3 text-sm leading-6 ${isDark ? "text-white/75" : "text-slate-650"}`}>{selectedComplaint.description}</div>
                </div>

                <div className={`rounded-[24px] border p-4 ${isDark ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-slate-50"}`}>
                  <div className={`text-[10px] uppercase tracking-[0.28em] ${isDark ? "text-white/35" : "text-slate-400"}`}>Status timeline</div>
                  <div className="mt-4">
                    <ComplaintStageStrip complaint={selectedComplaint} compact />
                  </div>
                </div>

                <div className={`rounded-[24px] border p-4 ${isDark ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-slate-50"}`}>
                  <div className={`text-[10px] uppercase tracking-[0.28em] ${isDark ? "text-white/35" : "text-slate-400"}`}>Proof files</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedComplaint.attachments.length ? (
                      selectedComplaint.attachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${isDark ? "border-white/10 bg-white/[0.05] text-white/70" : "border-slate-200 bg-white text-slate-700 shadow-2xs"}`}
                        >
                          <Paperclip className={`size-3.5 ${isDark ? "text-cyan-200" : "text-indigo-500"}`} />
                          <span className="max-w-[180px] truncate">{attachment.filename}</span>
                          <button
                            type="button"
                            onClick={() =>
                              void openProtectedResource(attachment.url, {
                                fallbackName: attachment.filename,
                              }).catch((fileError) =>
                                showStatusToast(fileError instanceof Error ? fileError.message : "Could not open proof file", "error"),
                              )
                            }
                            className={`rounded-full border px-2 py-1 uppercase tracking-[0.16em] text-[10px] transition ${isDark ? "border-white/10 bg-white/[0.05] text-white/70 hover:text-white" : "border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100"}`}
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void openProtectedResource(`${attachment.url}?download=true`, {
                                download: true,
                                fallbackName: attachment.filename,
                              }).catch((fileError) =>
                                showStatusToast(fileError instanceof Error ? fileError.message : "Could not save proof file", "error"),
                              )
                            }
                            className={`rounded-full border px-2 py-1 uppercase tracking-[0.16em] text-[10px] transition ${isDark ? "border-white/10 bg-white/[0.05] text-white/70 hover:text-white" : "border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100"}`}
                          >
                            Save
                          </button>
                        </div>
                      ))
                    ) : (
                      <EmptyState text="No proof files were attached." />
                    )}
                  </div>
                </div>

                <div className={`rounded-[24px] border p-4 ${isDark ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-slate-50"}`}>
                  <div className={`text-[10px] uppercase tracking-[0.28em] ${isDark ? "text-white/35" : "text-slate-400"}`}>Admin action</div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <ComplaintStatusAction
                      label="Acknowledge"
                      disabled={saving || selectedComplaint.status !== "submitted"}
                      active={selectedComplaint.status === "acknowledged" || selectedComplaint.status === "in_progress" || selectedComplaint.status === "resolved"}
                      onClick={() => setComplaintStatus(selectedComplaint.id, "acknowledged")}
                    />
                    <ComplaintStatusAction
                      label="In Progress"
                      disabled={saving || selectedComplaint.status !== "acknowledged"}
                      active={selectedComplaint.status === "in_progress" || selectedComplaint.status === "resolved"}
                      onClick={() => setComplaintStatus(selectedComplaint.id, "in_progress")}
                    />
                    <ComplaintStatusAction
                      label="Resolved"
                      disabled={saving || selectedComplaint.status !== "in_progress"}
                      active={selectedComplaint.status === "resolved"}
                      onClick={() => setComplaintStatus(selectedComplaint.id, "resolved")}
                    />
                  </div>
                  {saving ? (
                    <div className="mt-4 inline-flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-white/45">
                      <Loader2 className="size-3.5 animate-spin text-cyan-200" />
                      Updating complaint status
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <EmptyState text="Select a complaint to view its full timeline, proof files, and admin controls." />
            )}
          </DetailPanel>
        </div>
      </section>

      {statusToast ? <AdminActionToast toast={statusToast} /> : null}
    </div>
  );
}

function AdminActionToast({ toast }: { toast: AdminActionToastState }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const isNegative = toast.tone === "error" || toast.tone === "danger";
  const Icon = toast.busy ? Loader2 : isNegative ? AlertCircle : ShieldCheck;
  const label = toast.busy ? "Working" : toast.tone === "error" ? "Action failed" : toast.title ?? "Action complete";
  const toneClass =
    isNegative
      ? isDark
        ? "border-rose-300/25 bg-rose-950/80 text-rose-50 shadow-rose-950/30"
        : "border-rose-200 bg-rose-50 text-rose-950 shadow-rose-200/60"
      : isDark
        ? "border-emerald-300/25 bg-slate-950/85 text-emerald-50 shadow-emerald-950/30"
        : "border-emerald-200 bg-emerald-50 text-emerald-950 shadow-emerald-200/60";
  const iconClass = isNegative ? "text-rose-300" : "text-emerald-300";

  return (
    <motion.div
      key={toast.id}
      initial={{ opacity: 0, y: -12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      role={isNegative ? "alert" : "status"}
      aria-live="polite"
      className={`fixed right-5 top-5 z-[80] flex w-[min(92vw,430px)] items-center gap-3 rounded-[22px] border px-4 py-3 shadow-2xl backdrop-blur-2xl ${toneClass}`}
    >
      <div className={`flex size-10 shrink-0 items-center justify-center rounded-2xl ${isDark ? "bg-white/10" : "bg-white/70"}`}>
        <Icon className={`size-4 ${iconClass} ${toast.busy ? "animate-spin" : ""}`} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-[0.28em] opacity-60">{label}</div>
        <div className="mt-1 truncate text-sm font-semibold">{toast.message}</div>
      </div>
    </motion.div>
  );
}

function Panel({
  icon: Icon,
  eyebrow,
  title,
  children,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <div className={`rounded-[30px] border p-5 shadow-2xl backdrop-blur-2xl transition min-w-0 ${
      isDark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-white/95 shadow-slate-200/50 text-slate-900"
    }`}>
      <div className="flex items-start gap-4">
        <div className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${
          isDark ? "bg-white/10" : "bg-indigo-50 text-indigo-600 border border-indigo-100"
        }`}>
          <Icon className={`size-5 ${isDark ? "text-cyan-200" : "text-indigo-600"}`} />
        </div>
        <div className="min-w-0">
          <div className={`text-[10px] uppercase tracking-[0.35em] font-bold ${isDark ? "text-white/40" : "text-slate-400"}`}>{eyebrow}</div>
          {title ? <h2 className={`font-display text-[2rem] leading-none font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{title}</h2> : null}
        </div>
      </div>
      <div className={title ? "mt-6" : "mt-4"}>{children}</div>
    </div>
  );
}

function DetailPanel({
  icon: Icon,
  eyebrow,
  title,
  avatar,
  avatarUrl,
  status,
  children,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  avatar?: string;
  avatarUrl?: string | null;
  status?: ReactNode;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <div className={`rounded-[30px] border p-5 shadow-2xl backdrop-blur-2xl transition min-w-0 ${
      isDark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-white/95 shadow-slate-200/50 text-slate-900"
    }`}>
      <div className="flex items-start gap-4">
        <div className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${
          isDark ? "bg-white/10" : "bg-indigo-50 text-indigo-600 border border-indigo-100"
        }`}>
          <Icon className={`size-5 ${isDark ? "text-cyan-200" : "text-indigo-600"}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className={`text-[10px] uppercase tracking-[0.35em] font-bold ${isDark ? "text-white/40" : "text-slate-400"}`}>{eyebrow}</div>
          <div className="mt-2 flex items-start gap-3 min-w-0">
            {avatar ? <AvatarBadge value={avatar} imageUrl={avatarUrl} large /> : null}
            <div className="min-w-0 flex-1">
              <h2 className={`truncate font-display text-[2rem] leading-none font-bold ${isDark ? "text-white" : "text-slate-900"}`} title={title}>{title}</h2>
            </div>
            {status && <div className="shrink-0">{status}</div>}
          </div>
        </div>
      </div>
      <div className="mt-6 max-h-[580px] overflow-y-auto pr-2">{children}</div>
    </div>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <div className={`rounded-[24px] border p-4 backdrop-blur-xl transition min-w-0 ${
      isDark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-white/95 shadow-sm"
    }`}>
      <div className={`text-[10px] uppercase tracking-[0.2em] font-bold truncate ${isDark ? "text-white/40" : "text-slate-400"}`} title={label}>{label}</div>
      <div className={`mt-3 font-display text-2xl font-bold truncate ${isDark ? "text-white" : "text-slate-900"}`}>{value}</div>
      <div className={`mt-1.5 text-xs font-medium truncate ${isDark ? "text-white/45" : "text-slate-500"}`} title={hint}>{hint}</div>
    </div>
  );
}

function RatioRow({
  label,
  value,
  percent,
  tone,
}: {
  label: string;
  value: string;
  percent: number;
  tone: "cyan" | "pink";
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const gradient =
    tone === "cyan"
      ? "linear-gradient(90deg, #4caf50 0%, #68c56d 62%, #d8efbc 100%)"
      : "linear-gradient(90deg, #8fba7c 0%, #4caf50 100%)";
  return (
    <div>
      <div className={`flex items-center justify-between gap-3 text-sm font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>
        <span>{label}</span>
        <span className={isDark ? "text-white/60" : "text-slate-500"}>{value}</span>
      </div>
      <div className={`mt-3 h-3 rounded-full ${isDark ? "bg-white/10" : "bg-slate-100"}`}>
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(percent, 6)}%`, background: gradient }} />
      </div>
    </div>
  );
}

function AttendanceOverviewChart({ data }: { data: AdminDashboard["attendance_overview"] }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <div className="grid min-h-[320px] grid-cols-5 items-end gap-4">
      {data.map((item) => {
        const attendancePercent = Math.max(0, Math.min(100, Number.isFinite(item.attendance) ? item.attendance : 0));
        const absentPercent = Math.max(0, 100 - attendancePercent);
        const presentHeight = attendancePercent > 0 ? Math.max(16, attendancePercent) : 0;
        const absentHeight = absentPercent > 0 ? Math.max(16, absentPercent) : 0;

        return (
          <div key={item.date} className="flex h-full flex-col justify-end">
            <div className={`mb-3 flex h-[220px] items-end justify-center gap-2 rounded-b-2xl border-b ${
              isDark ? "border-white/10" : "border-slate-200"
            }`}>
              <div
                className="w-10 rounded-t-[18px] bg-gradient-to-t from-[#4caf50]/50 via-[#68c56d]/85 to-[#d8efbc] shadow-[0_10px_30px_rgba(76,175,80,0.22)]"
                style={{ height: `${presentHeight}%` }}
              />
              <div
                className="w-10 rounded-t-[18px] bg-gradient-to-t from-amber-500/30 via-amber-300/65 to-[#f3e7ae]"
                style={{ height: `${absentHeight}%` }}
              />
            </div>
            <div className={`text-center text-[11px] uppercase tracking-[0.18em] ${
              isDark ? "text-white/35" : "text-slate-500"
            }`}>
              {item.label}
            </div>
            <div className={`mt-1 text-center text-xs font-semibold ${
              isDark ? "text-white/60" : "text-slate-700"
            }`}>
              {attendancePercent.toFixed(0)}%
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InlineSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <div className={`rounded-[24px] border px-4 py-3 ${
      isDark ? "border-white/10 bg-white/[0.06]" : "border-slate-200 bg-white shadow-2xs"
    }`}>
      <div className="flex items-center gap-3">
        <Search className={`size-4 ${isDark ? "text-white/35" : "text-slate-400"}`} />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={`w-full bg-transparent text-sm outline-none ${
            isDark ? "text-white placeholder:text-white/28" : "text-slate-900 placeholder:text-slate-400"
          }`}
        />
      </div>
    </div>
  );
}

function ReadonlyField({ value }: { value: string }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return <div className={`rounded-[22px] border px-4 py-3 font-mono text-sm ${
    isDark ? "border-white/10 bg-white/[0.06] text-white/75" : "border-slate-200 bg-slate-100 text-slate-800"
  }`}>{value}</div>;
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

function AvatarBadge({ value, imageUrl, large = false, small = false }: { value: string; imageUrl?: string | null; large?: boolean; small?: boolean }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-2xl font-semibold text-white ${large ? "size-14 text-base" : small ? "size-8 text-xs" : "size-11 text-sm"}`}
      style={{ background: "var(--grad-aurora)" }}
    >
      {imageUrl ? <img src={imageUrl} alt={value} className="size-full rounded-2xl object-cover" /> : value}
    </div>
  );
}

function CompactActionButton({
  onClick,
  icon: Icon,
  tone = "neutral",
  title,
  disabled,
  busy = false,
  isDark,
}: {
  onClick: () => void;
  icon: LucideIcon;
  tone?: "neutral" | "rose" | "emerald";
  title?: string;
  disabled?: boolean;
  busy?: boolean;
  isDark: boolean;
}) {
  const className =
    tone === "rose"
      ? isDark
        ? "border-rose-300/15 bg-rose-500/8 text-rose-300 hover:bg-rose-500/20 hover:text-rose-200"
        : "border-rose-200 bg-rose-50 text-rose-500 hover:bg-rose-100 hover:text-rose-700"
      : tone === "emerald"
        ? isDark
          ? "border-emerald-300/15 bg-emerald-400/8 text-emerald-300 hover:bg-emerald-400/20 hover:text-emerald-200"
          : "border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700"
        : isDark
          ? "border-white/10 bg-white/[0.04] text-white/50 hover:text-white hover:bg-white/[0.08]"
          : "border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-700";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center rounded-xl border p-1.5 transition disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
    </button>
  );
}

function ListActionButton({
  children,
  onClick,
  icon: Icon,
  tone = "neutral",
  disabled,
  busy = false,
}: {
  children: ReactNode;
  onClick: () => void;
  icon: LucideIcon;
  tone?: "neutral" | "rose" | "emerald";
  disabled?: boolean;
  busy?: boolean;
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const className =
    tone === "rose"
      ? isDark
        ? "border-rose-300/20 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20 disabled:border-rose-300/20 disabled:bg-rose-500/10 disabled:text-rose-100"
        : "border-rose-300/60 bg-rose-100 text-rose-700 hover:bg-rose-200 disabled:border-rose-300/60 disabled:bg-rose-100/90 disabled:text-rose-700"
      : tone === "emerald"
        ? isDark
          ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/20 disabled:border-emerald-300/20 disabled:bg-emerald-400/10 disabled:text-emerald-100"
          : "border-emerald-300/60 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:border-emerald-300/60 disabled:bg-emerald-100/90 disabled:text-emerald-700"
        : isDark
          ? "border-white/10 bg-white/[0.06] text-white/70 hover:text-white disabled:border-white/10 disabled:bg-white/[0.06] disabled:text-white/70"
          : "border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200 hover:text-slate-950 disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-800";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[10px] uppercase tracking-[0.18em] transition disabled:cursor-wait disabled:opacity-95 ${className}`}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
      {children}
    </button>
  );
}

function DetailGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2">{children}</div>;
}

function DetailCard({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <div className={`rounded-[24px] border ${compact ? "p-3" : "p-4"} ${
      isDark ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-slate-50"
    }`}>
      <div className={`text-[10px] uppercase tracking-[0.28em] font-bold ${isDark ? "text-white/35" : "text-slate-400"}`}>{label}</div>
      <div className={`${compact ? "mt-2 text-base" : "mt-3 text-lg"} font-medium break-words ${isDark ? "text-white/85" : "text-slate-900"}`}>{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <div className={`rounded-[24px] border border-dashed px-5 py-10 text-center text-sm ${
      isDark ? "border-white/15 bg-white/[0.02] text-white/45" : "border-slate-300 bg-slate-50 text-slate-500"
    }`}>
      {text}
    </div>
  );
}

function defaultCertificatePurpose(request: AdminCertificate) {
  if (request.certificate_key === "graduation") return "Degree completion";
  if (request.certificate_key === "conduct") return "Merit and conduct verification";
  return "Enrollment verification";
}

function defaultCertificateBody(request: AdminCertificate) {
  if (request.certificate_key === "graduation") {
    return `${request.student_name} (${request.student_code}) has successfully completed Semester 4 of the ${request.department} program and has fulfilled all prescribed academic requirements for graduation.`;
  }
  if (request.certificate_key === "conduct") {
    return `${request.student_name} (${request.student_code}) of the ${request.department} program has maintained good conduct, academic discipline, CGPA ${request.cgpa.toFixed(2)}, and verified attendance of ${request.attendance.toFixed(1)}%.`;
  }
  return `${request.student_name} (${request.student_code}) is a bona fide student of the ${request.department} program, currently enrolled in Semester ${request.semester}, as verified by CampusVerse records.`;
}

function FeeStatusPill({ status }: { status: string }) {
  const paid = status === "paid";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] ${
        paid
          ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-200"
          : "border-amber-300/20 bg-amber-400/10 text-amber-100"
      }`}
    >
      <BadgeCheck className="size-3.5" />
      {paid ? "Paid" : "Pending"}
    </span>
  );
}

function CertificateStatusPill({ status, label }: { status: string; label?: string }) {
  const normalized = status.toLowerCase();
  const className =
    normalized === "downloaded"
      ? "border-cyan-300/20 bg-cyan-400/10 text-cyan-100"
      : normalized === "ready"
        ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-200"
        : normalized === "rejected"
          ? "border-rose-300/20 bg-rose-500/10 text-rose-100"
          : "border-amber-300/20 bg-amber-400/10 text-amber-100";
  const display = label || (normalized === "ready" ? "Approved" : status.replace("_", " "));
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] ${className}`}>
      <BadgeCheck className="size-3.5" />
      {display}
    </span>
  );
}

function FeeInvoiceStack({ student }: { student: AdminFeeStudent }) {
  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      {student.invoices.map((invoice) => {
        const paid = invoice.status === "paid";
        return (
          <span
            key={invoice.id}
            className={`max-w-full truncate rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.16em] ${
              paid
                ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-200"
                : "border-amber-300/20 bg-amber-400/10 text-amber-100"
            }`}
            title={`${invoice.semester} / ${invoice.id} / ${formatCurrency(invoice.amount)} / ${paid ? "Paid" : "Pending"}`}
          >
            {invoice.semester} {formatCurrency(invoice.amount)} {paid ? "Paid" : "Due"}
          </span>
        );
      })}
    </div>
  );
}

function StatusPill({ status, blocked }: { status: string; blocked: boolean }) {
  if (blocked) {
    return <span className="rounded-full border border-rose-300/20 bg-rose-500/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-rose-100">Blocked</span>;
  }
  if (status === "watch") {
    return <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-amber-100">Watch</span>;
  }
  return <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-emerald-200">Active</span>;
}

function VerificationPill({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const className =
    normalized === "verified" || normalized === "active"
      ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-200"
      : normalized === "blocked" || normalized === "rejected"
        ? "border-rose-400/20 bg-rose-500/10 text-rose-200"
        : "border-amber-300/20 bg-amber-400/10 text-amber-100";
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] ${className}`}>
      <BadgeCheck className="size-3.5" />
      {status}
    </span>
  );
}

function ComplaintStatusPill({ status }: { status: AdminComplaint["status"] }) {
  const label =
    status === "in_progress"
      ? "In Progress"
      : status === "acknowledged"
        ? "Acknowledged"
        : status === "resolved"
          ? "Resolved"
          : "Submitted";
  const className =
    status === "resolved"
      ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-200"
      : status === "in_progress"
        ? "border-fuchsia-300/20 bg-fuchsia-500/10 text-fuchsia-100"
        : status === "acknowledged"
          ? "border-cyan-300/20 bg-cyan-400/10 text-cyan-100"
          : "border-amber-300/20 bg-amber-400/10 text-amber-100";
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] ${className}`}>
      <BadgeCheck className="size-3.5" />
      {label}
    </span>
  );
}

function ComplaintStatusAction({
  label,
  onClick,
  active,
  disabled,
}: {
  label: string;
  onClick: () => void;
  active: boolean;
  disabled: boolean;
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const activeClass = isDark
    ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100 disabled:opacity-60"
    : "border-emerald-400 bg-emerald-100 text-emerald-950 font-bold disabled:opacity-100";

  const inactiveClass = isDark
    ? "border-white/10 bg-white/[0.05] text-white/70 hover:text-white disabled:opacity-40"
    : "border-slate-300 bg-slate-50 text-slate-500 disabled:opacity-50";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs uppercase tracking-[0.18em] transition disabled:cursor-wait ${
        active ? activeClass : inactiveClass
      }`}
    >
      <CheckCircle2 className="size-4" />
      {label}
    </button>
  );
}

function formatDateInputValue(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTime(value: string) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatCurrency(value: number) {
  return `₹ ${Math.round(value || 0).toLocaleString("en-IN")}`;
}
