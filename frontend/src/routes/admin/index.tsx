import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import {
  BarChart3,
  Ban,
  CheckCircle2,
  Eye,
  GraduationCap,
  Search,
  Shield,
  Trash2,
  University,
  UserRound,
  Users,
} from "lucide-react";
import {
  deleteAdminProfessor,
  deleteAdminStudent,
  getAdminDashboard,
  updateAdminProfessorBlock,
  updateAdminStudentBlock,
  type AdminDashboard,
} from "@/lib/api";

export const Route = createFileRoute("/admin/")({
  component: AdminPage,
});

type AdminStudent = AdminDashboard["students"][number];
type AdminProfessor = AdminDashboard["professors"][number];
type AdminSection = "dashboard" | "students" | "professors";

function AdminPage() {
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<AdminSection>(() => normalizeSection(typeof window === "undefined" ? "" : window.location.hash));
  const [studentQuery, setStudentQuery] = useState("");
  const [professorQuery, setProfessorQuery] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [selectedProfessorId, setSelectedProfessorId] = useState<number | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const data = await getAdminDashboard();
      setDashboard(data);
      setSelectedStudentId((current) => current ?? data.students[0]?.id ?? null);
      setSelectedProfessorId((current) => current ?? data.professors[0]?.id ?? null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Admin dashboard failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    function syncHash() {
      setActiveSection(normalizeSection(window.location.hash));
    }

    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(null), 2800);
    return () => window.clearTimeout(timer);
  }, [status]);

  const filteredStudents = useMemo(() => {
    const query = studentQuery.trim().toLowerCase();
    const rows = dashboard?.students ?? [];
    if (!query) return rows;
    return rows.filter((student) =>
      [student.name, student.studentCode, student.address, student.department, student.email]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [dashboard?.students, studentQuery]);

  const filteredProfessors = useMemo(() => {
    const query = professorQuery.trim().toLowerCase();
    const rows = dashboard?.professors ?? [];
    if (!query) return rows;
    return rows.filter((professor) =>
      [professor.name, professor.designation, professor.address, professor.department, professor.email]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [dashboard?.professors, professorQuery]);

  const selectedStudent = useMemo(
    () => filteredStudents.find((student) => student.id === selectedStudentId) ?? filteredStudents[0] ?? null,
    [filteredStudents, selectedStudentId],
  );
  const selectedProfessor = useMemo(
    () => filteredProfessors.find((professor) => professor.id === selectedProfessorId) ?? filteredProfessors[0] ?? null,
    [filteredProfessors, selectedProfessorId],
  );

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    setBusy(true);
    setStatus(null);
    try {
      await action();
      await refresh();
      setStatus(successMessage);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleStudentBlock(student: AdminStudent) {
    const next = !student.isBlocked;
    await runAction(
      () => updateAdminStudentBlock(student.id, { blocked: next, reason: next ? "Blocked by admin" : undefined }),
      `${student.name} ${next ? "blocked" : "unblocked"}`,
    );
  }

  async function toggleProfessorBlock(professor: AdminProfessor) {
    const next = !professor.isBlocked;
    await runAction(
      () =>
        updateAdminProfessorBlock(professor.id, {
          blocked: next,
          reason: next ? "Blocked by admin" : undefined,
        }),
      `${professor.name} ${next ? "blocked" : "unblocked"}`,
    );
  }

  async function removeStudent(student: AdminStudent) {
    if (!window.confirm(`Delete ${student.name}'s student account?`)) return;
    await runAction(() => deleteAdminStudent(student.id), `${student.name} deleted`);
  }

  async function removeProfessor(professor: AdminProfessor) {
    if (!window.confirm(`Delete ${professor.name}'s professor account?`)) return;
    await runAction(() => deleteAdminProfessor(professor.id), `${professor.name} deleted`);
  }

  if (loading && !dashboard) {
    return <div className="rounded-3xl glass p-8 text-white/65">Loading admin command center...</div>;
  }

  return (
    <div className="space-y-8">
      {status && (
        <div className="inline-flex items-center gap-2 rounded-2xl glass px-4 py-3 text-sm text-white/75">
          <CheckCircle2 className="size-4 text-emerald-300" />
          {status}
        </div>
      )}

      <section className={activeSection === "dashboard" ? "" : "hidden"}>
        <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-[10px] uppercase tracking-[0.35em] text-white/45">
              <Shield className="size-3.5" />
              Administrator command center
            </div>
            <h1 className="max-w-5xl font-display text-5xl font-bold tracking-tight md:text-7xl">
              Full-campus control with the same CampusVerse feel
            </h1>
            <p className="mt-5 max-w-3xl text-white/55">
              Monitor student versus professor ratio, track attendance health, and manage student and professor accounts from one unified admin desk.
            </p>
          </div>
          <Panel className="p-5">
            <div className="text-[10px] uppercase tracking-[0.28em] text-white/35">Default admin login</div>
            <div className="mt-4 space-y-3 text-sm text-white/75">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 font-mono">admin@gmail.com</div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 font-mono">admin#123</div>
            </div>
          </Panel>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {(dashboard?.metrics ?? []).map((metric) => (
            <MetricCard key={metric.label} metric={metric} />
          ))}
        </div>

        <div className="mt-8 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <Panel className="p-5">
            <SectionTitle icon={Users} eyebrow="Student vs professor" title="Campus account ratio" />
            <RatioChart items={dashboard?.ratio_overview ?? []} />
          </Panel>
          <Panel className="p-5">
            <SectionTitle icon={BarChart3} eyebrow="Attendance" title="Student attendance overview" />
            <AttendanceOverviewChart items={dashboard?.attendance_overview ?? []} />
          </Panel>
        </div>
      </section>

      <section className={activeSection === "students" ? "" : "hidden"}>
        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <Panel className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <SectionTitle icon={GraduationCap} eyebrow="Student tab" title="All students" />
              <SearchField
                value={studentQuery}
                onChange={setStudentQuery}
                placeholder="Search by name, roll, address, department"
              />
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[10px] uppercase tracking-[0.25em] text-white/40">
                  <tr>
                    <th className="py-3 pr-4">Student</th>
                    <th className="py-3 pr-4">Roll</th>
                    <th className="py-3 pr-4">Address</th>
                    <th className="py-3 pr-4">Attendance</th>
                    <th className="py-3 pr-4">Status</th>
                    <th className="py-3 pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((student) => (
                    <tr
                      key={student.id}
                      className={`border-t border-white/10 transition ${selectedStudent?.id === student.id ? "bg-white/[0.04]" : "hover:bg-white/[0.02]"}`}
                    >
                      <td className="py-4 pr-4">
                        <button
                          type="button"
                          onClick={() => setSelectedStudentId(student.id)}
                          className="flex items-center gap-3 text-left"
                        >
                          <AvatarChip value={student.avatar} />
                          <div>
                            <div className="font-medium text-white">{student.name}</div>
                            <div className="text-xs text-white/45">{student.email}</div>
                          </div>
                        </button>
                      </td>
                      <td className="py-4 pr-4 text-white/65">{student.studentCode}</td>
                      <td className="py-4 pr-4 text-white/65">{student.address}</td>
                      <td className="py-4 pr-4 text-white/65">{student.attendance.toFixed(1)}%</td>
                      <td className="py-4 pr-4">
                        <StatusPill blocked={student.isBlocked} variant={student.attendance < 75 ? "watch" : "safe"} />
                      </td>
                      <td className="py-4 pr-0">
                        <div className="flex flex-wrap gap-2">
                          <ActionPill onClick={() => setSelectedStudentId(student.id)} icon={Eye}>
                            View
                          </ActionPill>
                          <ActionPill onClick={() => toggleStudentBlock(student)} icon={Ban} disabled={busy}>
                            {student.isBlocked ? "Unblock" : "Block"}
                          </ActionPill>
                          <ActionPill onClick={() => removeStudent(student)} icon={Trash2} tone="danger" disabled={busy}>
                            Delete
                          </ActionPill>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredStudents.length === 0 && <EmptyState label="No students matched your search." />}
            </div>
          </Panel>

          <Panel className="p-5">
            <SectionTitle icon={UserRound} eyebrow="Student details" title={selectedStudent?.name ?? "Select a student"} />
            {selectedStudent ? (
              <div className="mt-5 space-y-4">
                <ProfileGrid
                  rows={[
                    { label: "Email", value: selectedStudent.email },
                    { label: "Roll", value: selectedStudent.studentCode },
                    { label: "Department", value: selectedStudent.department },
                    { label: "Semester", value: String(selectedStudent.semester) },
                    { label: "CGPA", value: selectedStudent.cgpa.toFixed(2) },
                    { label: "Attendance", value: `${selectedStudent.attendance.toFixed(1)}%` },
                    { label: "Address", value: selectedStudent.address },
                    { label: "Attendance marked", value: String(selectedStudent.attendanceMarked) },
                    { label: "Present", value: String(selectedStudent.presentCount) },
                    { label: "Absent", value: String(selectedStudent.absentCount) },
                    { label: "Blocked reason", value: selectedStudent.blockReason || "Active account" },
                    { label: "Created", value: formatDateTime(selectedStudent.createdAt) },
                  ]}
                />
              </div>
            ) : (
              <EmptyState label="Select a student to view details." />
            )}
          </Panel>
        </div>
      </section>

      <section className={activeSection === "professors" ? "" : "hidden"}>
        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <Panel className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <SectionTitle icon={University} eyebrow="Professor tab" title="All professors" />
              <SearchField
                value={professorQuery}
                onChange={setProfessorQuery}
                placeholder="Search by name, designation, address, department"
              />
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[10px] uppercase tracking-[0.25em] text-white/40">
                  <tr>
                    <th className="py-3 pr-4">Professor</th>
                    <th className="py-3 pr-4">Designation</th>
                    <th className="py-3 pr-4">Address</th>
                    <th className="py-3 pr-4">Department</th>
                    <th className="py-3 pr-4">Status</th>
                    <th className="py-3 pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProfessors.map((professor) => (
                    <tr
                      key={professor.id}
                      className={`border-t border-white/10 transition ${selectedProfessor?.id === professor.id ? "bg-white/[0.04]" : "hover:bg-white/[0.02]"}`}
                    >
                      <td className="py-4 pr-4">
                        <button
                          type="button"
                          onClick={() => setSelectedProfessorId(professor.id)}
                          className="flex items-center gap-3 text-left"
                        >
                          <AvatarChip value={professor.avatar} />
                          <div>
                            <div className="font-medium text-white">{professor.name}</div>
                            <div className="text-xs text-white/45">{professor.email}</div>
                          </div>
                        </button>
                      </td>
                      <td className="py-4 pr-4 text-white/65">{professor.designation}</td>
                      <td className="py-4 pr-4 text-white/65">{professor.address}</td>
                      <td className="py-4 pr-4 text-white/65">{professor.department}</td>
                      <td className="py-4 pr-4">
                        <StatusPill blocked={professor.isBlocked} variant="safe" />
                      </td>
                      <td className="py-4 pr-0">
                        <div className="flex flex-wrap gap-2">
                          <ActionPill onClick={() => setSelectedProfessorId(professor.id)} icon={Eye}>
                            View
                          </ActionPill>
                          <ActionPill onClick={() => toggleProfessorBlock(professor)} icon={Ban} disabled={busy}>
                            {professor.isBlocked ? "Unblock" : "Block"}
                          </ActionPill>
                          <ActionPill onClick={() => removeProfessor(professor)} icon={Trash2} tone="danger" disabled={busy}>
                            Delete
                          </ActionPill>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredProfessors.length === 0 && <EmptyState label="No professors matched your search." />}
            </div>
          </Panel>

          <Panel className="p-5">
            <SectionTitle icon={Shield} eyebrow="Professor details" title={selectedProfessor?.name ?? "Select a professor"} />
            {selectedProfessor ? (
              <div className="mt-5 space-y-4">
                <ProfileGrid
                  rows={[
                    { label: "Email", value: selectedProfessor.email },
                    { label: "Designation", value: selectedProfessor.designation },
                    { label: "Department", value: selectedProfessor.department },
                    { label: "Expertise", value: selectedProfessor.expertiseField },
                    { label: "Highest education", value: selectedProfessor.highestEducation },
                    { label: "Address", value: selectedProfessor.address },
                    { label: "Verification", value: selectedProfessor.verificationStatus },
                    { label: "License document", value: selectedProfessor.licenseDocumentName },
                    { label: "Students managed", value: String(selectedProfessor.studentsManaged) },
                    { label: "Blocked reason", value: selectedProfessor.blockReason || "Active account" },
                    { label: "Created", value: formatDateTime(selectedProfessor.createdAt) },
                  ]}
                />
              </div>
            ) : (
              <EmptyState label="Select a professor to view details." />
            )}
          </Panel>
        </div>
      </section>
    </div>
  );
}

function normalizeSection(hash: string): AdminSection {
  const value = hash.replace("#", "");
  if (value === "students" || value === "professors") return value;
  return "dashboard";
}

function RatioChart({ items }: { items: AdminDashboard["ratio_overview"] }) {
  const max = Math.max(...items.map((item) => item.count), 1);
  return (
    <div className="mt-6 space-y-5">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-white/70">{item.label}</span>
            <span className="text-white/55">
              {item.count} accounts / {item.share}%
            </span>
          </div>
          <div className="h-4 rounded-full bg-white/6">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(item.count / max) * 100}%` }}
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${item.accent}, rgba(255,255,255,0.16))` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function AttendanceOverviewChart({ items }: { items: AdminDashboard["attendance_overview"] }) {
  const max = Math.max(...items.flatMap((item) => [item.present, item.absent]), 1);
  return (
    <div className="mt-6 flex h-64 items-end gap-3">
      {items.map((item) => (
        <div key={item.date} className="flex min-w-0 flex-1 flex-col items-center">
          <div className="flex h-48 w-full items-end gap-1">
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: `${Math.max(8, (item.present / max) * 100)}%` }}
              className="w-1/2 rounded-t-2xl bg-gradient-to-t from-emerald-600 via-emerald-400 to-emerald-200"
              title={`Present: ${item.present}`}
            />
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: `${Math.max(8, (item.absent / max) * 100)}%` }}
              className="w-1/2 rounded-t-2xl bg-gradient-to-t from-rose-700 via-rose-500 to-amber-200"
              title={`Absent: ${item.absent}`}
            />
          </div>
          <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-white/35">{item.label}</div>
          <div className="mt-1 text-xs text-white/65">{item.attendance}%</div>
        </div>
      ))}
    </div>
  );
}

function MetricCard({ metric }: { metric: AdminDashboard["metrics"][number] }) {
  return (
    <Panel className="p-5">
      <div className="text-[10px] uppercase tracking-[0.28em] text-white/35">{metric.label}</div>
      <div className="mt-4 font-display text-4xl">{metric.value}</div>
      <p className="mt-2 text-sm text-white/45">{metric.hint}</p>
    </Panel>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex w-full items-center gap-3 rounded-full glass px-4 py-3 lg:max-w-md">
      <Search className="size-4 text-white/45" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-white/35 focus:outline-none"
      />
    </label>
  );
}

function ActionPill({
  children,
  icon: Icon,
  onClick,
  tone = "default",
  disabled,
}: {
  children: ReactNode;
  icon: ComponentType<{ className?: string }>;
  onClick: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs transition disabled:opacity-50 ${
        tone === "danger"
          ? "border border-rose-300/20 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
          : "glass text-white/70 hover:border-white/25 hover:text-white"
      }`}
    >
      <Icon className="size-3.5" />
      {children}
    </button>
  );
}

function ProfileGrid({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">{row.label}</div>
          <div className="mt-2 break-words text-sm text-white/75">{row.value}</div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="grid min-h-40 place-items-center rounded-3xl border border-dashed border-white/15 text-sm text-white/45">{label}</div>;
}

function AvatarChip({ value }: { value: string }) {
  return (
    <span className="flex size-10 items-center justify-center rounded-2xl text-xs font-semibold" style={{ background: "var(--grad-aurora)" }}>
      {value}
    </span>
  );
}

function StatusPill({ blocked, variant }: { blocked: boolean; variant: "safe" | "watch" }) {
  if (blocked) {
    return <span className="rounded-full bg-rose-500/10 px-3 py-1 text-xs text-rose-100">Blocked</span>;
  }
  if (variant === "watch") {
    return <span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs text-amber-100">Watch</span>;
  }
  return <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">Active</span>;
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className={`rounded-3xl glass-strong ${className}`}>
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
      <span className="flex size-10 items-center justify-center rounded-2xl bg-white/10">
        <Icon className="size-4 text-white/70" />
      </span>
      <div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">{eyebrow}</div>
        <h2 className="font-display text-2xl">{title}</h2>
      </div>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
