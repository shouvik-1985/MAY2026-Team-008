import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  AlertCircle,
  BadgeCheck,
  Ban,
  BarChart3,
  Building2,
  CalendarClock,
  CheckCircle2,
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
  Trash2,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ComplaintStageStrip } from "@/components/app/ComplaintStageStrip";
import {
  createAdminSlotBatch,
  deleteAdminUserAccount,
  getAdminComplaints,
  getAdminDashboard,
  getAdminManagement,
  openProtectedResource,
  resetAdminStudentBiometric,
  updateAdminComplaintStatus,
  updateAdminSemesterDuration,
  updateAdminSlotBatch,
  updateAdminAttendanceRadius,
  updateAdminUserBlock,
  type AdminDashboard,
  type CampusAttendanceSettings,
  type ComplaintItem,
} from "@/lib/api";

export const Route = createFileRoute("/admin/")({
  component: AdminDeskPage,
});

const ADMIN_SECTIONS = ["dashboard", "student", "professor", "management", "complaints"] as const;

type AdminSection = (typeof ADMIN_SECTIONS)[number];
type AdminComplaint = ComplaintItem;

function normalizeAdminSection(hash: string): AdminSection {
  const raw = hash.replace("#", "");
  const aliases: Record<string, AdminSection> = {
    overview: "dashboard",
    students: "student",
    professors: "professor",
    complaint: "complaints",
  };
  const candidate = (aliases[raw] ?? raw) as AdminSection;
  return ADMIN_SECTIONS.includes(candidate) ? candidate : "dashboard";
}

function AdminDeskPage() {
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
  const [openNewBatch, setOpenNewBatch] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    function syncSection() {
      setActiveSection(normalizeAdminSection(window.location.hash));
    }

    syncSection();
    window.addEventListener("hashchange", syncSection);
    return () => window.removeEventListener("hashchange", syncSection);
  }, []);

  async function refreshData(successMessage?: string) {
    const [dashboardData, managementData, complaintsData] = await Promise.all([
      getAdminDashboard(),
      getAdminManagement(),
      getAdminComplaints(),
    ]);
    setDashboard(dashboardData);
    setSettings(managementData);
    setComplaints(complaintsData.complaints);
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
    if (successMessage) setStatus(successMessage);
  }

  useEffect(() => {
    let live = true;
    setLoading(true);
    refreshData()
      .catch((error) => {
        if (live) setStatus(error instanceof Error ? error.message : "Admin dashboard failed to load");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  const [studentFilter, setStudentFilter] = useState<"all" | "watchlist" | "risk" | "blocked">("all");

  const query = searchQuery.trim().toLowerCase();
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

  const selectedStudent = filteredStudents.find((student) => student.id === selectedStudentId) ?? filteredStudents[0] ?? null;
  const selectedProfessor =
    filteredProfessors.find((professor) => professor.id === selectedProfessorId) ?? filteredProfessors[0] ?? null;
  const selectedComplaint =
    filteredComplaints.find((complaint) => complaint.id === selectedComplaintId) ?? filteredComplaints[0] ?? null;

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

  function clearComplaintFilters() {
    setSearchQuery("");
    setComplaintStatusFilter("all");
    setComplaintCategoryFilter("all");
    setComplaintDateFilter("");
  }

  async function save(event?: FormEvent) {
    event?.preventDefault();
    setSaving(true);
    setStatus(null);
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
      setStatus(error instanceof Error ? error.message : "Could not update management settings");
    } finally {
      setSaving(false);
    }
  }

  async function saveSemesterDuration(event?: FormEvent) {
    event?.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const managementData = await updateAdminSemesterDuration({
        semester_duration_unit: semesterDurationUnit,
        semester_duration_months: semesterDurationMonths,
        semester_duration_days: semesterDurationDays,
      });
      setSettings(managementData);
      await refreshData("Semester duration updated");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update semester duration");
    } finally {
      setSaving(false);
    }
  }

  async function createSlotRelease(event?: FormEvent) {
    event?.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const normalizedName = slotBatchName.trim() || `Batch ${new Date().getFullYear()}`;
      const managementData = await createAdminSlotBatch({
        batch_name: normalizedName,
        total_slots: slotCount,
        open_for_intake: openNewBatch,
      });
      setSettings(managementData);
      setSlotBatchName("");
      setSlotCount(60);
      setOpenNewBatch(true);
      await refreshData(`${normalizedName} slot release created`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create slot release");
    } finally {
      setSaving(false);
    }
  }

  async function toggleSlotRelease(batchId: number, nextState: boolean, batchName: string) {
    setSaving(true);
    setStatus(null);
    try {
      const managementData = await updateAdminSlotBatch(batchId, {
        open_for_intake: nextState,
      });
      setSettings(managementData);
      await refreshData(`${batchName} intake ${nextState ? "opened" : "paused"}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update slot release");
    } finally {
      setSaving(false);
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setStatus("This browser does not support location services");
      return;
    }
    setStatus("Reading this device location...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(7));
        setLongitude(position.coords.longitude.toFixed(7));
        setStatus("Campus center filled from this device. Save to apply it.");
      },
      () => setStatus("Location permission was blocked or unavailable"),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 15_000 },
    );
  }

  async function toggleUserBlock(userId: number, blocked: boolean, label: string) {
    setSaving(true);
    setStatus(null);
    try {
      const result = await updateAdminUserBlock(userId, {
        blocked,
        reason: blocked ? "Blocked by admin" : undefined,
      });
      await refreshData(result.message || `${label} ${blocked ? "blocked" : "unblocked"}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update account status");
    } finally {
      setSaving(false);
    }
  }

  async function deleteUser(userId: number, label: string) {
    const okay = window.confirm(`Delete ${label} from CampusVerse? This also removes related account records.`);
    if (!okay) return;
    setSaving(true);
    setStatus(null);
    try {
      const result = await deleteAdminUserAccount(userId);
      if (selectedStudentId === userId) setSelectedStudentId(null);
      if (selectedProfessorId === userId) setSelectedProfessorId(null);
      await refreshData(result.message || `${label} deleted`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not delete account");
    } finally {
      setSaving(false);
    }
  }

  async function resetStudentBiometric(studentId: number, label: string) {
    const okay = window.confirm(`Reset the enrolled face template for ${label}? The student will need to re-enroll from the webcam scanner.`);
    if (!okay) return;
    setSaving(true);
    setStatus(null);
    try {
      const result = await resetAdminStudentBiometric(studentId);
      await refreshData(result.message || `${label}'s face template was reset`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not reset the student biometric template");
    } finally {
      setSaving(false);
    }
  }

  async function setComplaintStatus(
    complaintId: number,
    nextStatus: "acknowledged" | "in_progress" | "resolved",
  ) {
    setSaving(true);
    setStatus(null);
    try {
      const response = await updateAdminComplaintStatus(complaintId, { status: nextStatus });
      setComplaints((current) =>
        current.map((complaint) => (complaint.id === complaintId ? response.complaint : complaint)),
      );
      setStatus(`Complaint moved to ${response.complaint.statusLabel}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Complaint status could not be updated");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !dashboard) {
    return <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-8 text-white/60">Loading admin desk...</div>;
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

  return (
    <div className="mx-auto max-w-[1480px] space-y-6 pb-10">
      <section className="grid gap-4 xl:grid-cols-[1fr_auto]">
        <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 backdrop-blur-2xl">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-white/10">
              <Search className="size-4 text-cyan-200" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-[0.32em] text-white/40">Full-campus administration</div>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search student, professor, account details..."
                className="mt-2 w-full bg-transparent text-sm text-white outline-none placeholder:text-white/28"
              />
            </div>
          </div>
        </div>
        {activeSection === "management" ? (
          <div className="flex items-center rounded-full border border-white/10 bg-white/[0.04] p-1 text-xs uppercase tracking-[0.18em]">
            <button
              type="button"
              onClick={() => setManagementView("tracker")}
              className={`rounded-full px-4 py-2 transition ${
                managementView === "tracker" ? "bg-white/12 text-white" : "text-white/45 hover:text-white"
              }`}
            >
              Tracker
            </button>
            <button
              type="button"
              onClick={() => setManagementView("slots")}
              className={`rounded-full px-4 py-2 transition ${
                managementView === "slots" ? "bg-white/12 text-white" : "text-white/45 hover:text-white"
              }`}
            >
              Slots
            </button>
          </div>
        ) : activeSection === "complaints" ? (
          <div className="flex items-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs uppercase tracking-[0.18em] text-white/50">
            {filteredComplaints.length} complaints / {resolvedComplaints} resolved
          </div>
        ) : (
          <div className="flex items-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs uppercase tracking-[0.18em] text-white/50">
            {dashboard?.students.length ?? 0} students / {dashboard?.professors.length ?? 0} professors
          </div>
        )}
      </section>

      <section id="dashboard" className={visible("dashboard") ? "space-y-6" : "hidden"}>
        <div className="grid gap-6 xl:grid-cols-[1fr_320px] xl:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-[10px] uppercase tracking-[0.35em] text-white/45">
              <ShieldCheck className="size-3.5" />
              Administrator command center
            </div>
            <h1 className="mt-5 max-w-5xl font-display text-5xl font-bold tracking-tight md:text-7xl">
              Full-campus control with the same CampusVerse feel
            </h1>
            <p className="mt-5 max-w-3xl text-white/55">
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
            <div className="overflow-hidden rounded-[24px] border border-white/10 bg-black/10">
              <div className="grid grid-cols-[1.8fr_0.9fr_1fr_0.8fr_1fr] gap-4 border-b border-white/10 px-5 py-4 text-[10px] uppercase tracking-[0.28em] text-white/35">
                <div>Student</div>
                <div>Roll</div>
                <div>Address</div>
                <div>Attendance</div>
                <div>Actions</div>
              </div>
              <div className="max-h-[720px] overflow-y-auto">
                {filteredStudents.map((student) => {
                  const selected = selectedStudent?.id === student.id;
                  return (
                    <div
                      key={student.id}
                      className={`grid grid-cols-[1.8fr_0.9fr_1fr_0.8fr_1fr] gap-4 border-b border-white/5 px-5 py-4 text-sm text-white/80 last:border-b-0 ${
                        selected ? "bg-white/[0.045]" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <AvatarBadge value={student.avatar} imageUrl={student.avatarUrl} />
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-white">{student.name}</div>
                            <div className="truncate text-white/45">{student.email}</div>
                          </div>
                        </div>
                      </div>
                      <div className="text-white/65">{student.studentCode}</div>
                      <div className="text-white/65">{student.address}</div>
                      <div className="font-semibold text-emerald-300">{student.attendance.toFixed(1)}%</div>
                      <div className="flex flex-wrap items-center gap-2">
                        <ListActionButton onClick={() => setSelectedStudentId(student.id)} icon={Eye}>
                          View
                        </ListActionButton>
                        <ListActionButton
                          onClick={() => toggleUserBlock(student.id, !student.isBlocked, student.name)}
                          icon={student.isBlocked ? UserCheck : Ban}
                          tone={student.isBlocked ? "emerald" : "rose"}
                          disabled={saving}
                        >
                          {student.isBlocked ? "Unblock" : "Block"}
                        </ListActionButton>
                        <ListActionButton
                          onClick={() => deleteUser(student.id, student.name)}
                          icon={Trash2}
                          tone="rose"
                          disabled={saving}
                        >
                          Delete
                        </ListActionButton>
                      </div>
                    </div>
                  );
                })}
                {filteredStudents.length === 0 && (
                  <div className="px-5 py-12 text-center text-sm text-white/45">No student accounts match this search.</div>
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
                  <DetailCard label="Email" value={selectedStudent.email} />
                  <DetailCard label="Roll" value={selectedStudent.studentCode} />
                  <DetailCard label="Department" value={selectedStudent.department} />
                  <DetailCard label="Semester" value={String(selectedStudent.semester)} />
                  <DetailCard label="CGPA" value={selectedStudent.cgpa.toFixed(2)} />
                  <DetailCard label="Attendance" value={`${selectedStudent.attendance.toFixed(1)}%`} />
                  <DetailCard label="Address" value={selectedStudent.address} />
                  <DetailCard label="Attendance marked" value={String(selectedStudent.attendanceMarked)} />
                  <DetailCard label="Present" value={String(selectedStudent.presentCount)} />
                  <DetailCard label="Absent" value={String(selectedStudent.absentCount)} />
                  <DetailCard
                    label="Biometric"
                    value={selectedStudent.biometricEnrolled ? "Face template enrolled" : "No face template"}
                  />
                  <DetailCard
                    label="Enrolled at"
                    value={selectedStudent.biometricEnrolledAt ? formatDateTime(selectedStudent.biometricEnrolledAt) : "Not enrolled"}
                  />
                  <DetailCard label="Blocked reason" value={selectedStudent.blockReason} />
                  <DetailCard label="Created" value={formatDateTime(selectedStudent.createdAt)} />
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
            <div className="overflow-hidden rounded-[24px] border border-white/10 bg-black/10">
              <div className="grid grid-cols-[1.6fr_0.8fr_0.9fr_0.8fr_1fr] gap-4 border-b border-white/10 px-5 py-4 text-[10px] uppercase tracking-[0.28em] text-white/35">
                <div>Professor</div>
                <div>Designation</div>
                <div>Address</div>
                <div>Status</div>
                <div>Actions</div>
              </div>
              <div className="max-h-[720px] overflow-y-auto">
                {filteredProfessors.map((professor) => {
                  const selected = selectedProfessor?.id === professor.id;
                  return (
                    <div
                      key={professor.id}
                      className={`grid grid-cols-[1.6fr_0.8fr_0.9fr_0.8fr_1fr] gap-4 border-b border-white/5 px-5 py-4 text-sm text-white/80 last:border-b-0 ${
                        selected ? "bg-white/[0.045]" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <AvatarBadge value={professor.avatar} />
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-white">{professor.name}</div>
                            <div className="truncate text-white/45">{professor.email}</div>
                          </div>
                        </div>
                      </div>
                      <div className="text-white/65">{professor.designation}</div>
                      <div className="text-white/65">{professor.address}</div>
                      <div>
                        <VerificationPill status={professor.isBlocked ? "blocked" : professor.verificationStatus} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <ListActionButton onClick={() => setSelectedProfessorId(professor.id)} icon={Eye}>
                          View
                        </ListActionButton>
                        <ListActionButton
                          onClick={() => toggleUserBlock(professor.id, !professor.isBlocked, professor.name)}
                          icon={professor.isBlocked ? UserCheck : Ban}
                          tone={professor.isBlocked ? "emerald" : "rose"}
                          disabled={saving}
                        >
                          {professor.isBlocked ? "Unblock" : "Block"}
                        </ListActionButton>
                        <ListActionButton
                          onClick={() => deleteUser(professor.id, professor.name)}
                          icon={Trash2}
                          tone="rose"
                          disabled={saving}
                        >
                          Delete
                        </ListActionButton>
                      </div>
                    </div>
                  );
                })}
                {filteredProfessors.length === 0 && (
                  <div className="px-5 py-12 text-center text-sm text-white/45">No professor accounts match this search.</div>
                )}
              </div>
            </div>
          </Panel>

          <DetailPanel
            icon={Building2}
            eyebrow="Professor details"
            title={selectedProfessor?.name ?? "No professor selected"}
            avatar={selectedProfessor?.avatar}
            status={
              selectedProfessor ? (
                <VerificationPill status={selectedProfessor.isBlocked ? "blocked" : selectedProfessor.verificationStatus} />
              ) : null
            }
          >
            {selectedProfessor ? (
              <DetailGrid>
                <DetailCard label="Email" value={selectedProfessor.email} />
                <DetailCard label="Designation" value={selectedProfessor.designation} />
                <DetailCard label="Department" value={selectedProfessor.department} />
                <DetailCard label="Expertise" value={selectedProfessor.expertiseField} />
                <DetailCard label="Highest education" value={selectedProfessor.highestEducation} />
                <DetailCard label="Address" value={selectedProfessor.address} />
                <DetailCard label="Verification" value={selectedProfessor.verificationStatus} />
                <DetailCard label="License document" value={selectedProfessor.licenseDocumentName} />
                <DetailCard label="Students managed" value={String(selectedProfessor.studentsManaged)} />
                <DetailCard label="Blocked reason" value={selectedProfessor.blockReason} />
                <DetailCard label="Created" value={formatDateTime(selectedProfessor.createdAt)} />
              </DetailGrid>
            ) : (
              <EmptyState text="Choose a professor record to inspect account details." />
            )}
          </DetailPanel>
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
                    className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-200/40"
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
                      className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none transition focus:border-fuchsia-200/40"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-[10px] uppercase tracking-[0.28em] text-white/40">Latitude</span>
                    <input
                      value={latitude}
                      onChange={(event) => setLatitude(event.target.value)}
                      className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-200/40"
                      placeholder="28.5355000"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-[10px] uppercase tracking-[0.28em] text-white/40">Longitude</span>
                    <input
                      value={longitude}
                      onChange={(event) => setLongitude(event.target.value)}
                      className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-200/40"
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
                      className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-white transition disabled:cursor-wait disabled:opacity-60"
                      style={{ background: "var(--grad-aurora)" }}
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
                      <div className="inline-flex w-fit rounded-full border border-white/10 bg-white/[0.04] p-1 text-xs uppercase tracking-[0.18em] text-white/45">
                        {(["months", "days"] as const).map((unit) => (
                          <button
                            key={unit}
                            type="button"
                            onClick={() => setSemesterDurationUnit(unit)}
                            className={`rounded-full px-4 py-2 transition ${
                              semesterDurationUnit === unit ? "bg-white/12 text-white" : "hover:text-white"
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
                        className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-white transition disabled:cursor-wait disabled:opacity-60"
                        style={{ background: "var(--grad-aurora)" }}
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
                    <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                      <label className="grid gap-2">
                        <span className="text-[10px] uppercase tracking-[0.28em] text-white/40">Total slots</span>
                        <input
                          type="number"
                          min={1}
                          max={5000}
                          value={slotCount}
                          onChange={(event) => setSlotCount(Number(event.target.value))}
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
                      className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-white transition disabled:cursor-wait disabled:opacity-60"
                      style={{ background: "var(--grad-aurora)" }}
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
                    slotBatches.map((batch) => (
                      <div key={batch.id} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="text-[10px] uppercase tracking-[0.28em] text-white/40">Sem 1 batch</div>
                            <div className="mt-2 font-display text-2xl text-white">{batch.batch_name}</div>
                            <div className="mt-2 text-sm text-white/52">
                              Created {batch.created_at ? formatDateTime(batch.created_at) : "recently"}
                            </div>
                          </div>
                          <div
                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs uppercase tracking-[0.18em] ${
                              batch.intake_open
                                ? "border border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
                                : "border border-white/10 bg-white/[0.04] text-white/50"
                            }`}
                          >
                            {batch.intake_open ? "Open intake" : "Closed"}
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                          <DetailCard label="Total slots" value={String(batch.total_slots)} compact />
                          <DetailCard label="Filled" value={String(batch.filled_slots)} compact />
                          <DetailCard label="Left" value={String(batch.slots_left)} compact />
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
                            disabled={saving || loading}
                            onClick={() => toggleSlotRelease(batch.id, !batch.intake_open, batch.batch_name)}
                            className={`rounded-2xl px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition disabled:cursor-wait disabled:opacity-60 ${
                              batch.intake_open
                                ? "border border-white/10 bg-white/[0.04] text-white/70 hover:text-white"
                                : "border border-cyan-200/20 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20"
                            }`}
                          >
                            {batch.intake_open ? "Pause intake" : "Open intake"}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Panel>
            </div>
          </>
        )}
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
              <div className="grid gap-3 xl:grid-cols-[1.35fr_0.85fr_0.85fr_0.8fr_auto]">
                <InlineSearch
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Search by student name, complaint code, category, title"
                />
                <select
                  value={complaintStatusFilter}
                  onChange={(event) =>
                    setComplaintStatusFilter(event.target.value as "all" | "open" | AdminComplaint["status"])
                  }
                  className="rounded-[24px] border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none"
                >
                  <option value="all" className="bg-neutral-950 text-white">
                    All status
                  </option>
                  <option value="open" className="bg-neutral-950 text-white">
                    Open
                  </option>
                  <option value="submitted" className="bg-neutral-950 text-white">
                    Submitted
                  </option>
                  <option value="acknowledged" className="bg-neutral-950 text-white">
                    Acknowledged
                  </option>
                  <option value="in_progress" className="bg-neutral-950 text-white">
                    In Progress
                  </option>
                  <option value="resolved" className="bg-neutral-950 text-white">
                    Resolved
                  </option>
                </select>
                <select
                  value={complaintCategoryFilter}
                  onChange={(event) => setComplaintCategoryFilter(event.target.value)}
                  className="rounded-[24px] border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none"
                >
                  <option value="all" className="bg-neutral-950 text-white">
                    All categories
                  </option>
                  {complaintCategories.map((category) => (
                    <option key={category} value={category} className="bg-neutral-950 text-white">
                      {category}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={complaintDateFilter}
                  onChange={(event) => setComplaintDateFilter(event.target.value)}
                  className="rounded-[24px] border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none"
                />
                <button
                  type="button"
                  onClick={clearComplaintFilters}
                  className="rounded-[24px] border border-white/10 bg-white/[0.05] px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/65 transition hover:text-white"
                >
                  Clear
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/35">
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                  Search by student name
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                  Filter by category
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                  Filter by submitted date
                </span>
              </div>
            </div>
            <div className="overflow-hidden rounded-[24px] border border-white/10 bg-black/10">
              <div className="grid grid-cols-[1.4fr_0.9fr_0.8fr_0.9fr_0.7fr] gap-4 border-b border-white/10 px-5 py-4 text-[10px] uppercase tracking-[0.28em] text-white/35">
                <div>Student</div>
                <div>Complaint</div>
                <div>Status</div>
                <div>Submitted</div>
                <div>Actions</div>
              </div>
              <div className="max-h-[720px] overflow-y-auto">
                {filteredComplaints.map((complaint) => {
                  const selected = selectedComplaint?.id === complaint.id;
                  return (
                    <div
                      key={complaint.id}
                      className={`grid grid-cols-[1.4fr_0.9fr_0.8fr_0.9fr_0.7fr] gap-4 border-b border-white/5 px-5 py-4 text-sm text-white/80 last:border-b-0 ${
                        selected ? "bg-white/[0.045]" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <AvatarBadge value={avatarFromName(complaint.studentName)} imageUrl={complaint.avatarUrl} />
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-white">{complaint.studentName}</div>
                            <div className="truncate text-white/45">
                              {complaint.studentCode || complaint.studentEmail}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-white">{complaint.complaintCode}</div>
                        <div className="truncate text-white/45">{complaint.category}</div>
                      </div>
                      <div>
                        <ComplaintStatusPill status={complaint.status} />
                      </div>
                      <div className="text-white/55">{formatDateTime(complaint.submittedAt)}</div>
                      <div className="flex justify-start">
                        <ListActionButton onClick={() => setSelectedComplaintId(complaint.id)} icon={Eye}>
                          View
                        </ListActionButton>
                      </div>
                    </div>
                  );
                })}
                {filteredComplaints.length === 0 && (
                  <div className="px-5 py-12 text-center text-sm text-white/45">
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
              <div className="space-y-5">
                <DetailGrid>
                  <DetailCard label="Complaint code" value={selectedComplaint.complaintCode} />
                  <DetailCard label="Category" value={selectedComplaint.category} />
                  <DetailCard label="Student" value={selectedComplaint.studentName} />
                  <DetailCard label="Roll" value={selectedComplaint.studentCode || "Not assigned"} />
                  <DetailCard label="Department" value={selectedComplaint.department || "N/A"} />
                  <DetailCard label="Semester" value={selectedComplaint.semester ? `Sem ${selectedComplaint.semester}` : "N/A"} />
                  <DetailCard label="Submitted" value={formatDateTime(selectedComplaint.submittedAt)} />
                  <DetailCard label="Last updated" value={formatDateTime(selectedComplaint.updatedAt)} />
                </DetailGrid>

                <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-white/35">Complaint details</div>
                  <div className="mt-3 text-sm leading-7 text-white/75">{selectedComplaint.description}</div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-white/35">Status timeline</div>
                  <div className="mt-5">
                    <ComplaintStageStrip complaint={selectedComplaint} compact />
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-white/35">Proof files</div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedComplaint.attachments.length ? (
                      selectedComplaint.attachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs text-white/70"
                        >
                          <Paperclip className="size-3.5 text-cyan-200" />
                          <span className="max-w-[220px] truncate">{attachment.filename}</span>
                          <button
                            type="button"
                            onClick={() =>
                              void openProtectedResource(attachment.url, {
                                fallbackName: attachment.filename,
                              }).catch((fileError) =>
                                setStatus(fileError instanceof Error ? fileError.message : "Could not open proof file"),
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
                              }).catch((fileError) =>
                                setStatus(fileError instanceof Error ? fileError.message : "Could not save proof file"),
                              )
                            }
                            className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 uppercase tracking-[0.16em] text-[10px] text-white/70 transition hover:text-white"
                          >
                            Save
                          </button>
                        </div>
                      ))
                    ) : (
                      <EmptyState text="No proof files were attached with this complaint." />
                    )}
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-white/35">Admin action</div>
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

      {status && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white/70"
        >
          <ShieldCheck className="size-4 text-emerald-300" />
          {status}
        </motion.div>
      )}
    </div>
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
  return (
    <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5 shadow-2xl backdrop-blur-2xl">
      <div className="flex items-start gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/10">
          <Icon className="size-5 text-cyan-200" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.35em] text-white/40">{eyebrow}</div>
          {title ? <h2 className="font-display text-[2rem] leading-none text-white">{title}</h2> : null}
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
  return (
    <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5 shadow-2xl backdrop-blur-2xl">
      <div className="flex items-start gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/10">
          <Icon className="size-5 text-cyan-200" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.35em] text-white/40">{eyebrow}</div>
          <div className="mt-2 flex items-start gap-3">
            {avatar ? <AvatarBadge value={avatar} imageUrl={avatarUrl} large /> : null}
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-display text-[2rem] leading-none text-white">{title}</h2>
            </div>
            {status}
          </div>
        </div>
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
      <div className="text-[10px] uppercase tracking-[0.28em] text-white/40">{label}</div>
      <div className="mt-4 font-display text-3xl font-bold text-white break-words">{value}</div>
      <div className="mt-2 text-sm text-white/45">{hint}</div>
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
  const gradient =
    tone === "cyan"
      ? "linear-gradient(90deg, #16d5ff 0%, #00b9ff 100%)"
      : "linear-gradient(90deg, #ff5ec7 0%, #f139a7 100%)";
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm text-white">
        <span>{label}</span>
        <span className="text-white/60">{value}</span>
      </div>
      <div className="mt-3 h-3 rounded-full bg-white/10">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(percent, 6)}%`, background: gradient }} />
      </div>
    </div>
  );
}

function AttendanceOverviewChart({ data }: { data: AdminDashboard["attendance_overview"] }) {
  const peak = Math.max(1, ...data.map((item) => Math.max(item.present, item.absent)));
  return (
    <div className="grid min-h-[320px] grid-cols-5 items-end gap-4">
      {data.map((item) => (
        <div key={item.date} className="flex h-full flex-col justify-end">
          <div className="mb-3 flex h-[220px] items-end justify-center gap-2">
            <div
              className="w-10 rounded-t-[18px] bg-gradient-to-t from-cyan-500/25 via-cyan-400/70 to-emerald-300"
              style={{ height: `${Math.max(10, (item.present / peak) * 100)}%` }}
            />
            <div
              className="w-10 rounded-t-[18px] bg-gradient-to-t from-rose-500/30 via-rose-400/80 to-orange-300"
              style={{ height: `${Math.max(10, (item.absent / peak) * 100)}%` }}
            />
          </div>
          <div className="text-center text-[11px] uppercase tracking-[0.18em] text-white/35">{item.label}</div>
          <div className="mt-1 text-center text-xs text-white/55">{item.attendance.toFixed(0)}%</div>
        </div>
      ))}
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
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.06] px-4 py-3">
      <div className="flex items-center gap-3">
        <Search className="size-4 text-white/35" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/28"
        />
      </div>
    </div>
  );
}

function ReadonlyField({ value }: { value: string }) {
  return <div className="rounded-[22px] border border-white/10 bg-white/[0.06] px-4 py-3 text-white/75">{value}</div>;
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

function AvatarBadge({ value, imageUrl, large = false }: { value: string; imageUrl?: string | null; large?: boolean }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-2xl font-semibold text-white ${large ? "size-14 text-base" : "size-11 text-sm"}`}
      style={{ background: "var(--grad-aurora)" }}
    >
      {imageUrl ? <img src={imageUrl} alt={value} className="size-full rounded-2xl object-cover" /> : value}
    </div>
  );
}

function ListActionButton({
  children,
  onClick,
  icon: Icon,
  tone = "neutral",
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  icon: LucideIcon;
  tone?: "neutral" | "rose" | "emerald";
  disabled?: boolean;
}) {
  const className =
    tone === "rose"
      ? "border-rose-300/20 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
      : tone === "emerald"
        ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/20"
        : "border-white/10 bg-white/[0.06] text-white/70 hover:text-white";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[10px] uppercase tracking-[0.18em] transition disabled:cursor-wait disabled:opacity-60 ${className}`}
    >
      <Icon className="size-3.5" />
      {children}
    </button>
  );
}

function DetailGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2">{children}</div>;
}

function DetailCard({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={`rounded-[24px] border border-white/10 bg-white/[0.03] ${compact ? "p-3" : "p-4"}`}>
      <div className="text-[10px] uppercase tracking-[0.28em] text-white/35">{label}</div>
      <div className={`${compact ? "mt-2 text-base" : "mt-3 text-lg"} text-white/85 break-words`}>{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[24px] border border-dashed border-white/15 bg-white/[0.02] px-5 py-10 text-center text-sm text-white/45">
      {text}
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
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs uppercase tracking-[0.18em] transition disabled:cursor-wait disabled:opacity-45 ${
        active
          ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
          : "border-white/10 bg-white/[0.05] text-white/70 hover:text-white"
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
