import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, AreaChart, Area } from "recharts";
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Download,
  Eye,
  FileText,
  GraduationCap,
  Link2,
  Loader2,
  MapPin,
  Phone,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  XCircle,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  createPlacementRole,
  decidePlacementRoleApplication,
  deletePlacementRole,
  dismissPlacementRoleApplicant,
  getPlacementManagerDashboard,
  openProtectedResource,
  selectPlacementApplication,
  type PlacementApplication,
  type PlacementManagerDashboard,
  type PlacementManagerRole,
  type PlacementRoleApplicant,
} from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/placement/")({ component: PlacementManagerPage });

type ManagerTab = "dashboard" | "roles" | "applicants" | "messages";

type RoleFormState = {
  title: string;
  companyName: string;
  roleType: "internship" | "job";
  location: string;
  workMode: "onsite" | "hybrid" | "remote";
  compensation: string;
  deadline: string;
  minimumSemester: string;
  minimumCgpa: string;
  requiredSkills: string;
  description: string;
};

const DEFAULT_ROLE_FORM: RoleFormState = {
  title: "",
  companyName: "",
  roleType: "internship",
  location: "",
  workMode: "onsite",
  compensation: "",
  deadline: "",
  minimumSemester: "3",
  minimumCgpa: "7.5",
  requiredSkills: "",
  description: "",
};

function currentManagerTab(): ManagerTab {
  if (typeof window === "undefined") return "dashboard";
  const hash = window.location.hash.replace("#", "");
  return hash === "roles" || hash === "applicants" || hash === "messages" ? hash : "dashboard";
}

function PlacementManagerPage() {
  const [dashboard, setDashboard] = useState<PlacementManagerDashboard | null>(null);
  const [activeTab, setActiveTab] = useState<ManagerTab>(() => currentManagerTab());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roleSaving, setRoleSaving] = useState(false);
  const [decisionSavingId, setDecisionSavingId] = useState<number | null>(null);
  const [roleDeletingId, setRoleDeletingId] = useState<number | null>(null);
  const [applicantClearingId, setApplicantClearingId] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [opportunityTitle, setOpportunityTitle] = useState("");
  const [roleForm, setRoleForm] = useState<RoleFormState>(DEFAULT_ROLE_FORM);
  const [roleDecisionNotes, setRoleDecisionNotes] = useState<Record<number, string>>({});

  async function refresh(successMessage?: string) {
    const data = await getPlacementManagerDashboard();
    setDashboard(data);
    setSelectedId((current) => current ?? data.applications[0]?.id ?? null);
    setSelectedRoleId((current) => current ?? data.roles?.[0]?.id ?? null);
    if (successMessage) setStatus(successMessage);
  }

  useEffect(() => {
    const syncTab = () => setActiveTab(currentManagerTab());
    syncTab();
    window.addEventListener("hashchange", syncTab);
    return () => window.removeEventListener("hashchange", syncTab);
  }, []);

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

  const roleApplicationsData = useMemo(() => {
    if (!dashboard?.roles) return [];
    return dashboard.roles.slice(0, 5).map(role => {
      let accepted = 0, rejected = 0, pending = 0;
      role.applicants.forEach(app => {
        if (app.status === "accepted") accepted++;
        else if (app.status === "rejected") rejected++;
        else pending++;
      });
      return {
        name: role.title.length > 15 ? role.title.slice(0, 15) + "..." : role.title,
        accepted,
        rejected,
        pending,
        total: role.applicants.length,
        fullTitle: role.title
      };
    });
  }, [dashboard?.roles]);

  const cgpaData = useMemo(() => {
    if (!dashboard?.applications) return [];
    const bins = {
      "7.0-7.5": 0,
      "7.5-8.0": 0,
      "8.0-8.5": 0,
      "8.5-9.0": 0,
      "9.0-9.5": 0,
      "9.5-10.0": 0,
    };
    dashboard.applications.forEach(app => {
      const c = app.cgpa;
      if (c >= 9.5) bins["9.5-10.0"]++;
      else if (c >= 9.0) bins["9.0-9.5"]++;
      else if (c >= 8.5) bins["8.5-9.0"]++;
      else if (c >= 8.0) bins["8.0-8.5"]++;
      else if (c >= 7.5) bins["7.5-8.0"]++;
      else bins["7.0-7.5"]++;
    });
    return Object.entries(bins).map(([name, count]) => ({ name, count }));
  }, [dashboard?.applications]);

  const topSkillsData = useMemo(() => {
    if (!dashboard?.applications) return [];
    const skillCounts: Record<string, number> = {};
    dashboard.applications.forEach(app => {
      const skills = app.skills.split(",").map(s => s.trim()).filter(Boolean);
      skills.forEach(skill => {
        skillCounts[skill] = (skillCounts[skill] || 0) + 1;
      });
    });
    
    return Object.entries(skillCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }));
  }, [dashboard?.applications]);

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
  const roles = dashboard?.roles ?? [];
  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? roles[0] ?? null;

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
    if (!selected && selectedId !== null) setSelectedId(null);
  }, [selected, selectedId]);

  useEffect(() => {
    if (selectedRole && selectedRole.id !== selectedRoleId) setSelectedRoleId(selectedRole.id);
    if (!selectedRole && selectedRoleId !== null) setSelectedRoleId(null);
  }, [selectedRole, selectedRoleId]);

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

  async function submitRole(event: FormEvent) {
    event.preventDefault();
    if (roleSaving) return;
    setRoleSaving(true);
    setStatus(null);
    try {
      const result = await createPlacementRole({
        title: roleForm.title,
        company_name: roleForm.companyName,
        role_type: roleForm.roleType,
        location: roleForm.location,
        work_mode: roleForm.workMode,
        compensation: roleForm.compensation,
        deadline: roleForm.deadline,
        minimum_semester: Number(roleForm.minimumSemester) || 1,
        minimum_cgpa: Number(roleForm.minimumCgpa) || 0,
        required_skills: roleForm.requiredSkills,
        description: roleForm.description,
      });
      setDashboard((current) =>
        current
          ? {
              ...current,
              roles: [result.role, ...(current.roles ?? [])],
            }
          : current,
      );
      setSelectedRoleId(result.role.id);
      setRoleForm(DEFAULT_ROLE_FORM);
      setStatus(result.message);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create placement role");
    } finally {
      setRoleSaving(false);
    }
  }

  async function decideApplicant(applicant: PlacementRoleApplicant, nextStatus: "accepted" | "rejected") {
    if (!selectedRole || decisionSavingId) return;
    setDecisionSavingId(applicant.id);
    setStatus(null);
    try {
      const note = roleDecisionNotes[applicant.id]?.trim();
      const result = await decidePlacementRoleApplication(selectedRole.id, applicant.id, {
        status: nextStatus,
        message: note || undefined,
      });
      setDashboard((current) =>
        current
          ? {
              ...current,
              roles: current.roles.map((role) =>
                role.id === selectedRole.id
                  ? {
                      ...role,
                      applicants: role.applicants.map((item) =>
                        item.id === result.roleApplication.id ? result.roleApplication : item,
                      ),
                    }
                  : role,
              ),
            }
          : current,
      );
      setRoleDecisionNotes((current) => ({ ...current, [applicant.id]: "" }));
      setStatus(result.notification);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update role applicant");
    } finally {
      setDecisionSavingId(null);
    }
  }

  async function removeExpiredRole(role: PlacementManagerRole) {
    if (roleDeletingId) return;
    if (!roleCanBeDeleted(role)) {
      setStatus("Role can be deleted after its deadline has passed");
      return;
    }

    const nextRoleId = roles.filter((item) => item.id !== role.id)[0]?.id ?? null;
    setRoleDeletingId(role.id);
    setStatus(null);
    try {
      const result = await deletePlacementRole(role.id);
      setDashboard((current) =>
        current
          ? {
              ...current,
              roles: current.roles.filter((item) => item.id !== role.id),
            }
          : current,
      );
      setSelectedRoleId((current) => (current === role.id ? nextRoleId : current));
      setStatus(result.message);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not remove this role");
    } finally {
      setRoleDeletingId(null);
    }
  }

  async function removeRoleApplicant(applicant: PlacementRoleApplicant) {
    if (!selectedRole || applicantClearingId) return;
    if (!isDecidedApplicant(applicant)) {
      setStatus("Only accepted or rejected applicants can be removed");
      return;
    }

    setApplicantClearingId(applicant.id);
    setStatus(null);
    try {
      const result = await dismissPlacementRoleApplicant(selectedRole.id, applicant.id);
      setDashboard((current) =>
        current
          ? {
              ...current,
              roles: current.roles.map((role) =>
                role.id === selectedRole.id
                  ? {
                      ...role,
                      applicants: role.applicants.filter((item) => item.id !== applicant.id),
                    }
                  : role,
              ),
            }
          : current,
      );
      setRoleDecisionNotes((current) => {
        const next = { ...current };
        delete next[applicant.id];
        return next;
      });
      setStatus(result.message);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not remove this applicant");
    } finally {
      setApplicantClearingId(null);
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
      {activeTab === "dashboard" ? (
      <section id="dashboard" className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-400/[0.06] px-3.5 py-1.5 text-[10px] uppercase tracking-[0.3em] text-cyan-100/70">
              <BriefcaseBusiness className="size-3.5 text-cyan-200" />
              Eligible students - Sem {criteria.minimumSemester}+ - CGPA {criteria.minimumCgpa}+
            </div>
            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight md:text-4xl">
              <span className="bg-gradient-to-r from-white via-white to-cyan-200 bg-clip-text text-transparent">
                Placement dashboard
              </span>
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-white/55">
              Track submitted profiles, selected students, and pending reviews.
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

        {/* Analytics Charts */}
        <div className="grid gap-4 lg:grid-cols-2 pt-4">
          {/* Chart 1: Role Popularity */}
          <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-6 shadow-xl backdrop-blur-md">
            <h3 className="mb-6 text-sm font-semibold uppercase tracking-widest text-white/80">Role Conversion Pipeline</h3>
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={roleApplicationsData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <XAxis dataKey="name" stroke="rgba(255,255,255,0.4)" fontSize={10} tickLine={false} axisLine={false} angle={-35} textAnchor="end" height={50} />
                  <YAxis stroke="rgba(255,255,255,0.3)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip 
                    cursor={{ fill: "rgba(255,255,255,0.05)" }} 
                    contentStyle={{ backgroundColor: "rgba(15,20,30,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", color: "#fff", fontSize: "12px" }}
                  />
                  <Bar dataKey="accepted" stackId="a" fill="#10b981" />
                  <Bar dataKey="pending" stackId="a" fill="#f59e0b" />
                  <Bar dataKey="rejected" stackId="a" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="flex flex-col rounded-[24px] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-6 shadow-xl backdrop-blur-md">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-widest text-white/80">Top Talent Pool Skills</h3>
            <div className="relative min-h-[240px] w-full flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={topSkillsData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={90}
                    paddingAngle={6}
                    dataKey="value"
                    stroke="none"
                  >
                    {topSkillsData.map((entry, index) => {
                      const colors = ["#34d399", "#059669", "#22d3ee", "#0891b2", "#818cf8"];
                      return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />;
                    })}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: "rgba(15,20,30,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", color: "#fff", fontSize: "12px" }}
                    itemStyle={{ color: "#34d399" }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap justify-center gap-x-4 gap-y-2">
                {topSkillsData.map((entry, index) => {
                  const colors = ["#34d399", "#059669", "#22d3ee", "#0891b2", "#818cf8"];
                  return (
                    <div key={entry.name} className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                      <span className="text-[11px] font-medium uppercase tracking-wider text-white/60">{entry.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          
          {/* Chart 3: CGPA Distribution (Full Width) */}
          <div className="lg:col-span-2 rounded-[24px] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-6 shadow-xl backdrop-blur-md">
            <h3 className="mb-6 text-sm font-semibold uppercase tracking-widest text-white/80">Talent Pool Academic Strength (CGPA)</h3>
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cgpaData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCgpa" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgba(255,255,255,0.3)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "rgba(15,20,30,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", color: "#fff", fontSize: "12px" }}
                    itemStyle={{ color: "#22d3ee" }}
                  />
                  <Area type="monotone" dataKey="count" stroke="#22d3ee" strokeWidth={2} fillOpacity={1} fill="url(#colorCgpa)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>
      ) : null}

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

      {activeTab === "roles" ? (
      <section id="roles" className="grid items-start gap-6 xl:grid-cols-[430px_minmax(0,1fr)]">
        <Panel accent="cyan" className="p-5">
          <SectionTitle icon={ClipboardList} eyebrow="Role studio" title="Create role" />
          <form onSubmit={submitRole} className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <RoleField icon={BriefcaseBusiness} label="Role title">
                <input
                  required
                  value={roleForm.title}
                  onChange={(event) => setRoleForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Frontend engineer intern"
                  className="form-input"
                />
              </RoleField>
              <RoleField icon={Building2} label="Company">
                <input
                  required
                  value={roleForm.companyName}
                  onChange={(event) => setRoleForm((current) => ({ ...current, companyName: event.target.value }))}
                  placeholder="CampusVerse Labs"
                  className="form-input"
                />
              </RoleField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <RoleField icon={Sparkles} label="Role type">
                <Select
                  value={roleForm.roleType}
                  onValueChange={(value) =>
                    setRoleForm((current) => ({
                      ...current,
                      roleType: value as RoleFormState["roleType"],
                    }))
                  }
                >
                  <SelectTrigger className="form-input">
                    <SelectValue placeholder="Select role type" />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-[rgba(15,20,30,0.95)] text-white backdrop-blur-xl">
                    <SelectItem value="internship" className="focus:bg-white/10 focus:text-white">Internship</SelectItem>
                    <SelectItem value="job" className="focus:bg-white/10 focus:text-white">Job</SelectItem>
                  </SelectContent>
                </Select>
              </RoleField>
              <RoleField icon={SlidersHorizontal} label="Work mode">
                <Select
                  value={roleForm.workMode}
                  onValueChange={(value) =>
                    setRoleForm((current) => ({
                      ...current,
                      workMode: value as RoleFormState["workMode"],
                    }))
                  }
                >
                  <SelectTrigger className="form-input">
                    <SelectValue placeholder="Select work mode" />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-[rgba(15,20,30,0.95)] text-white backdrop-blur-xl">
                    <SelectItem value="onsite" className="focus:bg-white/10 focus:text-white">Onsite</SelectItem>
                    <SelectItem value="hybrid" className="focus:bg-white/10 focus:text-white">Hybrid</SelectItem>
                    <SelectItem value="remote" className="focus:bg-white/10 focus:text-white">Remote</SelectItem>
                  </SelectContent>
                </Select>
              </RoleField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <RoleField icon={MapPin} label="Location">
                <input
                  required
                  value={roleForm.location}
                  onChange={(event) => setRoleForm((current) => ({ ...current, location: event.target.value }))}
                  placeholder="Bengaluru"
                  className="form-input"
                />
              </RoleField>
              <RoleField icon={BadgeCheck} label="Compensation">
                <input
                  required
                  value={roleForm.compensation}
                  onChange={(event) => setRoleForm((current) => ({ ...current, compensation: event.target.value }))}
                  placeholder="Rs 25k/month"
                  className="form-input"
                />
              </RoleField>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <RoleField icon={GraduationCap} label="Min sem">
                <input
                  required
                  min={1}
                  max={14}
                  type="number"
                  value={roleForm.minimumSemester}
                  onChange={(event) => setRoleForm((current) => ({ ...current, minimumSemester: event.target.value }))}
                  className="form-input"
                />
              </RoleField>
              <RoleField icon={BadgeCheck} label="Min CGPA">
                <input
                  required
                  min={0}
                  max={10}
                  step={0.1}
                  type="number"
                  value={roleForm.minimumCgpa}
                  onChange={(event) => setRoleForm((current) => ({ ...current, minimumCgpa: event.target.value }))}
                  className="form-input"
                />
              </RoleField>
              <RoleField icon={CalendarClock} label="Deadline">
                <input
                  required
                  value={roleForm.deadline}
                  onChange={(event) => setRoleForm((current) => ({ ...current, deadline: event.target.value }))}
                  placeholder="Aug 30"
                  className="form-input"
                />
              </RoleField>
            </div>

            <RoleField icon={ClipboardList} label="Required skills">
              <textarea
                required
                maxLength={3000}
                value={roleForm.requiredSkills}
                onChange={(event) => setRoleForm((current) => ({ ...current, requiredSkills: event.target.value }))}
                rows={3}
                placeholder="React, TypeScript, REST APIs"
                className="form-input resize-none"
              />
            </RoleField>

            <RoleField icon={FileText} label="Role criteria and description">
              <textarea
                required
                maxLength={12000}
                value={roleForm.description}
                onChange={(event) => setRoleForm((current) => ({ ...current, description: event.target.value }))}
                rows={5}
                placeholder="Responsibilities, interview rounds, portfolio expectations, and joining details."
                className="form-input resize-none"
              />
            </RoleField>

            <button
              type="submit"
              disabled={roleSaving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-cyan-300/25 bg-[linear-gradient(135deg,rgba(34,211,238,0.52),rgba(6,182,212,0.32))] px-5 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-white shadow-[0_10px_30px_rgba(34,211,238,0.15)] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
            >
              {roleSaving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Create role
            </button>
          </form>
        </Panel>

        <div className="space-y-6">
          <Panel className="flex h-[430px] flex-col overflow-hidden p-0" accent="neutral">
            <div className="shrink-0 border-b border-white/8 px-5 py-5">
              <SectionTitle icon={BriefcaseBusiness} eyebrow="Open roles" title="Created roles" />
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {roles.length ? (
                roles.map((role, index) => {
                  const isSelected = selectedRole?.id === role.id;
                  const canDeleteRole = roleCanBeDeleted(role);
                  return (
                    <motion.div
                      key={role.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                        isSelected
                          ? "border-cyan-300/30 bg-[linear-gradient(135deg,rgba(34,211,238,0.12),rgba(34,211,238,0.02))]"
                          : "border-white/8 bg-white/[0.025] hover:border-white/16 hover:bg-white/[0.045]"
                      }`}
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <button type="button" onClick={() => setSelectedRoleId(role.id)} className="min-w-0 flex-1 text-left">
                          <div className="truncate font-display text-xl text-white" title={role.title}>
                            {role.title}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/50">
                            <MiniTag icon={Building2}>{role.companyName}</MiniTag>
                            <MiniTag icon={GraduationCap}>{`Sem ${role.minimumSemester}+`}</MiniTag>
                            <MiniTag icon={BadgeCheck}>{`${role.minimumCgpa.toFixed(1)} CGPA`}</MiniTag>
                          </div>
                        </button>
                        <div className="flex shrink-0 items-center gap-2">
                          <RoleStatusPill status={role.status} />
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-white/55">
                            {role.applicants.length} applicants
                          </span>
                          {canDeleteRole ? (
                            <button
                              type="button"
                              disabled={roleDeletingId === role.id}
                              onClick={() => void removeExpiredRole(role)}
                              className="inline-flex items-center gap-1.5 rounded-full border border-rose-300/20 bg-rose-400/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-100 transition hover:bg-rose-400/18 disabled:cursor-wait disabled:opacity-55"
                            >
                              {roleDeletingId === role.id ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="size-3.5" />
                              )}
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              ) : (
                <EmptyState text="Create a role to start receiving student applications." />
              )}
            </div>
          </Panel>

          <Panel className="overflow-hidden p-0" accent="fuchsia">
            {selectedRole ? (
              <div>
                <div className="border-b border-white/8 px-5 py-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.28em] text-white/38">Role criteria</div>
                      <h2 className="mt-1 font-display text-3xl text-white">{selectedRole.title}</h2>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/58">{selectedRole.description}</p>
                    </div>
                    <RoleStatusPill status={selectedRole.status} />
                  </div>
                  <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <RoleMeta icon={Building2} label="Company" value={selectedRole.companyName} />
                    <RoleMeta icon={MapPin} label="Location" value={`${titleCase(selectedRole.workMode)} - ${selectedRole.location}`} />
                    <RoleMeta icon={BadgeCheck} label="Criteria" value={`Sem ${selectedRole.minimumSemester}+ / ${selectedRole.minimumCgpa.toFixed(1)} CGPA`} />
                    <RoleMeta icon={CalendarClock} label="Deadline" value={selectedRole.deadline} />
                  </div>
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Required skills</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {splitSkills(selectedRole.requiredSkills).map((skill) => (
                        <span key={skill} className="rounded-full border border-cyan-300/18 bg-cyan-400/[0.09] px-3 py-1.5 text-sm text-cyan-50/90">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="px-5 py-5">
                  <div className="flex items-center justify-between gap-3">
                    <SectionTitle icon={Users} eyebrow="Applied students" title="Eligible applicants" />
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-white/55">
                      {selectedRole.applicants.length} total
                    </span>
                  </div>

                  {selectedRole.applicants.length ? (
                    <div className="mt-4 max-h-[620px] space-y-4 overflow-y-auto pr-1">
                      {selectedRole.applicants.map((applicant) => {
                        const application = applicant.application;
                        const canClearApplicant = isDecidedApplicant(applicant);
                        return (
                          <div key={applicant.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                              <div className="flex min-w-0 flex-1 gap-3">
                                <Avatar value={avatarFromName(application.studentName)} imageUrl={application.avatarUrl} />
                                <div className="min-w-0">
                                  <div className="truncate font-semibold text-white" title={application.studentName}>
                                    {application.studentName}
                                  </div>
                                  <div className="truncate text-xs text-white/45" title={application.studentEmail}>
                                    {application.studentEmail}
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/52">
                                    <MiniTag icon={GraduationCap}>{`Sem ${application.semester}`}</MiniTag>
                                    <MiniTag icon={BadgeCheck}>{`${application.cgpa.toFixed(1)} CGPA`}</MiniTag>
                                    <MiniTag icon={Phone}>{application.phoneNumber}</MiniTag>
                                  </div>
                                </div>
                              </div>
                              <RoleApplicantStatusPill status={applicant.status} />
                            </div>

                            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
                              <div className="rounded-2xl border border-white/8 bg-black/15 p-4">
                                <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Student skills</div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {splitSkills(application.skills).map((skill) => (
                                    <span key={skill} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-white/70">
                                      {skill}
                                    </span>
                                  ))}
                                </div>
                                {applicant.missingSkills.length ? (
                                  <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-300/18 bg-amber-400/8 px-3 py-2 text-sm text-amber-50/78">
                                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                                    Missing: {applicant.missingSkills.join(", ")}
                                  </div>
                                ) : null}
                              </div>
                              <div className="space-y-3">
                                <ActionButton
                                  icon={FileText}
                                  tone="cyan"
                                  onClick={() =>
                                    void openProtectedResource(application.resumeUrl, {
                                      fallbackName: application.resumeFilename,
                                    }).catch((error) =>
                                      setStatus(error instanceof Error ? error.message : "Could not open resume"),
                                    )
                                  }
                                >
                                  Open resume
                                </ActionButton>
                                <textarea
                                  value={roleDecisionNotes[applicant.id] ?? ""}
                                  onChange={(event) =>
                                    setRoleDecisionNotes((current) => ({ ...current, [applicant.id]: event.target.value }))
                                  }
                                  placeholder="Optional decision note"
                                  rows={3}
                                  className="form-input resize-none text-sm"
                                />
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                                  <button
                                    type="button"
                                    disabled={decisionSavingId === applicant.id}
                                    onClick={() => void decideApplicant(applicant, "accepted")}
                                    className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/12 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-wait disabled:opacity-60"
                                  >
                                    {decisionSavingId === applicant.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                                    Accept
                                  </button>
                                  <button
                                    type="button"
                                    disabled={decisionSavingId === applicant.id}
                                    onClick={() => void decideApplicant(applicant, "rejected")}
                                    className="inline-flex items-center justify-center gap-2 rounded-full border border-rose-300/20 bg-rose-400/12 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-rose-100 transition hover:bg-rose-400/20 disabled:cursor-wait disabled:opacity-60"
                                  >
                                    {decisionSavingId === applicant.id ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
                                    Reject
                                  </button>
                                  {canClearApplicant ? (
                                    <button
                                      type="button"
                                      disabled={applicantClearingId === applicant.id}
                                      onClick={() => void removeRoleApplicant(applicant)}
                                      className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-white/58 transition hover:border-rose-300/25 hover:text-rose-100 disabled:cursor-wait disabled:opacity-55 sm:col-span-2 lg:col-span-1"
                                    >
                                      {applicantClearingId === applicant.id ? (
                                        <Loader2 className="size-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="size-4" />
                                      )}
                                      Delete past data
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                            {applicant.decisionMessage ? (
                              <div className="mt-3 border-l-2 border-cyan-400/50 pl-3 text-sm italic leading-6 text-white/55">
                                {applicant.decisionMessage}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyState text="No student has applied for this role yet." />
                  )}
                </div>
              </div>
            ) : (
              <div className="p-5">
                <EmptyState text="Create and select a role to review eligible applicants." />
              </div>
            )}
          </Panel>
        </div>
      </section>
      ) : null}

      {activeTab === "applicants" ? (
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
                        <Avatar value={avatarFromName(application.studentName)} imageUrl={application.avatarUrl} />
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
                  <Avatar value={avatarFromName(selected.studentName)} imageUrl={selected.avatarUrl} large />
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

                <a
                  href="#messages"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100 transition hover:bg-cyan-400/18"
                >
                  <Send className="size-4" />
                  Message candidate
                </a>
              </div>
            </div>
          ) : (
            <div className="p-5">
              <EmptyState text="Select an eligible student to review the submitted placement form." />
            </div>
          )}
        </Panel>
      </section>
      ) : null}

      {activeTab === "messages" ? (
      <section id="messages" className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Panel className="overflow-hidden p-0" accent="neutral">
          <div className="border-b border-white/8 px-5 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <SectionTitle icon={Send} eyebrow="Selection desk" title="Messages" />
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 transition focus-within:border-cyan-300/40 focus-within:bg-black/35 lg:w-[300px]">
                <Search className="size-4 shrink-0 text-white/35" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search candidate"
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
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    onClick={() => setSelectedId(application.id)}
                    className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                      isSelected
                        ? "border-cyan-300/30 bg-[linear-gradient(135deg,rgba(34,211,238,0.12),rgba(34,211,238,0.02))]"
                        : "border-white/8 bg-white/[0.025] hover:border-white/16 hover:bg-white/[0.045]"
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar value={avatarFromName(application.studentName)} imageUrl={application.avatarUrl} />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-white" title={application.studentName}>
                            {application.studentName}
                          </div>
                          <div className="truncate text-xs text-white/45" title={application.studentEmail}>
                            {application.studentEmail}
                          </div>
                        </div>
                      </div>
                      <StatusPill status={application.status} />
                    </div>
                  </motion.button>
                );
              })
            ) : (
              <EmptyState text="No eligible placement profiles match this search yet." />
            )}
          </div>
        </Panel>

        <Panel className="sticky top-6 self-start p-0" accent="cyan">
          {selected ? (
            <div className="p-5">
              <div className="flex items-start gap-4">
                <Avatar value={avatarFromName(selected.studentName)} imageUrl={selected.avatarUrl} large />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-white/38">Selected candidate</div>
                  <div className="mt-1 truncate font-display text-2xl text-white" title={selected.studentName}>
                    {selected.studentName}
                  </div>
                  <div className="mt-1 truncate text-sm text-white/48" title={selected.studentEmail}>
                    {selected.studentEmail}
                  </div>
                </div>
                <StatusPill status={selected.status} />
              </div>

              <form
                onSubmit={sendSelection}
                className="mt-5 rounded-2xl border border-cyan-300/15 bg-[linear-gradient(160deg,rgba(34,211,238,0.08),rgba(34,211,238,0.015))] p-4"
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
          ) : (
            <div className="p-5">
              <EmptyState text="Select an eligible student before sending a placement message." />
            </div>
          )}
        </Panel>
      </section>
      ) : null}
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

function RoleField({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-2 inline-flex items-center gap-2 text-xs font-medium text-white/60">
        <Icon className="size-3.5" />
        {label}
      </div>
      {children}
    </label>
  );
}

function RoleMeta({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-white/35">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="mt-2 break-words text-sm text-white/72">{value}</div>
    </div>
  );
}

function RoleStatusPill({ status }: { status: string }) {
  const open = status === "open";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] ${
        open
          ? "border-emerald-300/25 bg-emerald-400/12 text-emerald-200"
          : "border-white/10 bg-white/[0.05] text-white/55"
      }`}
    >
      {open ? <CheckCircle2 className="size-3.5" /> : <ClockIcon />}
      {open ? "Open" : titleCase(status)}
    </span>
  );
}

function RoleApplicantStatusPill({ status }: { status: string }) {
  const styles =
    status === "accepted"
      ? "border-emerald-300/25 bg-emerald-400/12 text-emerald-200"
      : status === "rejected"
        ? "border-rose-300/25 bg-rose-400/12 text-rose-100"
        : "border-cyan-300/25 bg-cyan-400/12 text-cyan-100";
  const Icon = status === "accepted" ? CheckCircle2 : status === "rejected" ? XCircle : ClockIcon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] ${styles}`}>
      <Icon className="size-3.5" />
      {titleCase(status)}
    </span>
  );
}

function ClockIcon({ className = "size-3.5" }: { className?: string }) {
  return <CalendarClock className={className} />;
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

function Avatar({ value, imageUrl, large = false }: { value: string; imageUrl?: string | null; large?: boolean }) {
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-2xl text-sm font-semibold text-white shadow-[0_10px_25px_rgba(0,0,0,0.4)] ${
        large ? "size-14 text-base" : "size-11"
      }`}
      style={{ background: "var(--grad-aurora)" }}
    >
      {imageUrl ? <img src={imageUrl} alt={value} className="size-full object-cover" /> : value}
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

function titleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function isDecidedApplicant(applicant: PlacementRoleApplicant) {
  return applicant.status === "accepted" || applicant.status === "rejected";
}

function roleCanBeDeleted(role: PlacementManagerRole) {
  return Boolean(role.deadlineExpired) || isDeadlineExpired(role.deadline);
}

function isDeadlineExpired(value: string) {
  const deadline = parseRoleDeadline(value);
  if (!deadline) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return deadline.getTime() < today.getTime();
}

function parseRoleDeadline(value: string) {
  const cleaned = value.trim();
  if (!cleaned) return null;

  const monthLookup: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };

  const buildDate = (year: number, month: number, day: number) => {
    const parsed = new Date(year, month, day);
    if (parsed.getFullYear() !== year || parsed.getMonth() !== month || parsed.getDate() !== day) return null;
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  };

  const isoMatch = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    return buildDate(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }

  const monthFirst = cleaned.match(/^([a-z]{3,9})\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?$/i);
  if (monthFirst) {
    const month = monthLookup[monthFirst[1].slice(0, 3).toLowerCase()];
    if (month !== undefined) {
      return buildDate(Number(monthFirst[3]) || new Date().getFullYear(), month, Number(monthFirst[2]));
    }
  }

  const dayFirst = cleaned.match(/^(\d{1,2})\s+([a-z]{3,9})\.?(?:\s+(\d{4}))?$/i);
  if (dayFirst) {
    const month = monthLookup[dayFirst[2].slice(0, 3).toLowerCase()];
    if (month !== undefined) {
      return buildDate(Number(dayFirst[3]) || new Date().getFullYear(), month, Number(dayFirst[1]));
    }
  }

  return null;
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
