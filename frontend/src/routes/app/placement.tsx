import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Building2,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  GraduationCap,
  Github,
  Linkedin,
  Loader2,
  MapPin,
  Phone,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  User,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { GlassCard, PageTransition } from "@/components/app/cinematic";
import {
  applyToPlacementRole,
  dismissPlacementRoleApplication,
  getPlacementStudentPortal,
  openProtectedResource,
  submitPlacementApplication,
  type PlacementApplication,
  type PlacementRole,
  type PlacementStudentPortal,
} from "@/lib/api";
import { refreshStudentDashboard, setStoredDashboard } from "@/lib/student-session";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/app/placement")({ component: PlacementPortalPage });

function PlacementPortalPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [portal, setPortal] = useState<PlacementStudentPortal | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applyingRoleId, setApplyingRoleId] = useState<number | null>(null);
  const [clearingRoleId, setClearingRoleId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [skills, setSkills] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [github, setGithub] = useState("");
  const [phone, setPhone] = useState("");
  const [resume, setResume] = useState<File | null>(null);
  const application = portal?.application ?? null;

  async function refreshPortal(successMessage?: string) {
    const data = await getPlacementStudentPortal();
    setPortal(data);
    setSkills(data.application?.skills ?? "");
    setLinkedin(data.application?.linkedinProfile ?? "");
    setGithub(data.application?.githubProfile ?? "");
    setPhone(data.application?.phoneNumber ?? "");
    setSelectedRoleId((current) => (current && data.jobs.some((role) => role.id === current) ? current : null));
    if (successMessage) setStatus(successMessage);
    try {
      setStoredDashboard(await refreshStudentDashboard({ force: true }));
    } catch {
      // Placement portal data is already loaded; dashboard cache can retry from the shell.
    }
  }

  useEffect(() => {
    let live = true;
    setLoading(true);
    refreshPortal()
      .catch((error) => {
        if (live) setStatus(error instanceof Error ? error.message : "Placement portal failed to load");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!portal || saving) return;
    if (!application && !resume) {
      setStatus("Upload your resume before submitting the placement form");
      return;
    }

    const formData = new FormData();
    formData.append("skills", skills);
    formData.append("linkedin_profile", linkedin);
    formData.append("github_profile", github);
    formData.append("phone_number", phone);
    if (resume) formData.append("resume", resume);

    setSaving(true);
    setStatus(null);
    try {
      const result = await submitPlacementApplication(formData);
      await refreshPortal(result.message);
      setResume(null);
      setEditing(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not submit placement form");
    } finally {
      setSaving(false);
    }
  }

  const roleOpenings = portal?.jobs ?? [];
  const selectedRole = roleOpenings.find((role) => role.id === selectedRoleId) ?? null;

  useEffect(() => {
    if (selectedRoleId !== null && !roleOpenings.some((role) => role.id === selectedRoleId)) {
      setSelectedRoleId(null);
    }
  }, [roleOpenings, selectedRoleId]);

  async function applyForRole(role: PlacementRole) {
    if (applyingRoleId) return;
    setApplyingRoleId(role.id);
    setStatus(null);
    try {
      const result = await applyToPlacementRole(role.id);
      setPortal((current) =>
        current
          ? {
              ...current,
              jobs: current.jobs.map((item) => (item.id === result.role.id ? result.role : item)),
            }
          : current,
      );
      setSelectedRoleId(result.role.id);
      setStatus(result.message);
      try {
        setStoredDashboard(await refreshStudentDashboard({ force: true }));
      } catch {
        // The placement portal state is already updated.
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not apply for this role");
    } finally {
      setApplyingRoleId(null);
    }
  }

  async function removePastRole(role: PlacementRole) {
    if (clearingRoleId) return;
    if (role.applicationStatus !== "accepted" && role.applicationStatus !== "rejected") {
      setStatus("Only accepted or rejected role history can be removed");
      return;
    }

    setClearingRoleId(role.id);
    setStatus(null);
    try {
      const result = await dismissPlacementRoleApplication(role.id);
      setPortal((current) =>
        current
          ? {
              ...current,
              jobs: current.jobs.filter((item) => item.id !== role.id),
            }
          : current,
      );
      setSelectedRoleId((current) => (current === role.id ? null : current));
      setStatus(result.message);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not remove this role history");
    } finally {
      setClearingRoleId(null);
    }
  }

  if (loading && !portal) {
    return <div className="glass rounded-3xl p-8 text-white/60">Loading placement portal...</div>;
  }

  if (!portal) {
    return (
      <PageTransition>
        <GlassCard>
          <EmptyState text={status ?? "Placement portal is unavailable right now."} />
        </GlassCard>
      </PageTransition>
    );
  }

  function handleAutoFill() {
    const user = portal?.student;
    setPhone("+91 98765 43210");
    setLinkedin("https://linkedin.com/in/" + (user?.name ? user.name.toLowerCase().replace(/\s+/g, "") : "student"));
    setGithub("https://github.com/" + (user?.name ? user.name.toLowerCase().replace(/\s+/g, "") : "student"));
    setSkills("React, Python, FastAPI, SQL, Machine Learning, Git, System Design");
    setStatus("⚡ Prefilled from your verified Campus Profile!");
  }

  const showForm = portal.eligible && (!application || editing);
  const selected = application?.status === "selected";

  return (
    <PageTransition>
      <div className="cv-placement-page space-y-6 pb-10">
        <section className="grid gap-5 xl:grid-cols-[1fr_360px] xl:items-end">
          <div>
            <div className={`mb-4 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[10px] uppercase tracking-[0.32em] font-bold ${
              isDark ? "border-white/10 bg-white/[0.04] text-white/45" : "border-slate-300 bg-white text-slate-600 shadow-2xs"
            }`}>
              <BriefcaseBusiness className="size-3.5" />
              Placement portal
            </div>
            <h1 className={`max-w-4xl font-display text-5xl font-extrabold tracking-tight md:text-7xl ${
              isDark ? "bg-gradient-to-br from-white via-white to-cyan-400 bg-clip-text text-transparent drop-shadow-sm" : "text-slate-950"
            }`}>
              Career readiness for {portal.student.name.split(" ")[0]}
            </h1>
            <p className={`mt-4 max-w-2xl text-sm leading-6 font-medium ${isDark ? "text-white/58" : "text-slate-700"}`}>
              Submit your placement profile, keep your resume ready, and track selection updates from
              placement partners.
            </p>
          </div>

          <GlassCard className={`p-5 ${!isDark ? "bg-white/95 border-slate-200 shadow-sm" : ""}`}>
            <div className={`text-[10px] uppercase tracking-[0.28em] font-bold ${isDark ? "text-white/35" : "text-slate-500"}`}>Minimum criteria</div>
            <div className="mt-4 space-y-3">
              <CriteriaRow
                label={`Sem ${portal.criteria.minimumSemester}+`}
                value={`Current Sem ${portal.student.semester}`}
                ok={portal.student.semester >= portal.criteria.minimumSemester}
              />
              <CriteriaRow
                label={`CGPA ${portal.criteria.minimumCgpa}+`}
                value={portal.student.cgpa.toFixed(1)}
                ok={portal.student.cgpa >= portal.criteria.minimumCgpa}
              />
            </div>
          </GlassCard>
        </section>

        {status ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold ${
              isDark ? "border-white/10 bg-white/[0.06] text-white/70" : "border-emerald-300 bg-emerald-50 text-emerald-950 shadow-2xs"
            }`}
          >
            <ShieldCheck className="size-4 text-emerald-500" />
            {status}
          </motion.div>
        ) : null}

        {selected && application?.selectionMessage ? (
          <GlassCard glow className={!isDark ? "bg-white/95 border-emerald-300 shadow-sm" : ""}>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-4">
                <span className="grid size-12 place-items-center rounded-2xl bg-emerald-400/12 text-emerald-600">
                  <CheckCircle2 className="size-5" />
                </span>
                <div>
                  <div className={`text-[10px] uppercase tracking-[0.3em] font-bold ${isDark ? "text-white/40" : "text-slate-500"}`}>Selection update</div>
                  <h2 className={`mt-2 font-display text-3xl font-extrabold ${isDark ? "text-white" : "text-slate-950"}`}>You're selected</h2>
                  <p className={`mt-3 text-sm leading-6 font-medium ${isDark ? "text-white/70" : "text-slate-700"}`}>{application.selectionMessage}</p>
                </div>
              </div>
              <StatusPill status="selected" />
            </div>
          </GlassCard>
        ) : null}

        <section className="grid gap-5 xl:grid-cols-[0.75fr_1.25fr]">
          <GlassCard className={!isDark ? "bg-white/95 border-slate-200 shadow-sm" : ""}>
            <PanelTitle icon={User} eyebrow="Student details" title="Prefilled placement profile" />
            <div className="mt-6 grid gap-3">
              <ReadonlyField label="Student name" value={portal.student.name} />
              <ReadonlyField label="Email" value={portal.student.email} />
              <ReadonlyField label="Semester" value={`Sem ${portal.student.semester}`} />
              <ReadonlyField label="CGPA" value={portal.student.cgpa.toFixed(1)} />
            </div>

            {!portal.eligible ? (
              <div className="mt-6 rounded-3xl border border-amber-300/30 bg-amber-500/10 p-5">
                <div className="flex items-start gap-3">
                  <XCircle className="mt-0.5 size-5 text-amber-500" />
                  <div>
                    <div className={`font-bold ${isDark ? "text-amber-100" : "text-amber-950"}`}>Criteria not met yet</div>
                    <p className={`mt-2 text-sm leading-6 font-medium ${isDark ? "text-white/55" : "text-slate-700"}`}>
                      Placement form unlocks from Sem {portal.criteria.minimumSemester} with CGPA{" "}
                      {portal.criteria.minimumCgpa} or higher.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {application && !editing ? (
              <ApplicationDetails
                application={application}
                onEdit={() => setEditing(true)}
                onOpenResume={(download) =>
                  void openProtectedResource(download ? `${application.resumeUrl}?download=true` : application.resumeUrl, {
                    download,
                    fallbackName: application.resumeFilename,
                  }).catch((error) => setStatus(error instanceof Error ? error.message : "Could not open resume"))
                }
              />
            ) : null}

            {showForm ? (
              <form onSubmit={submit} className="mt-6 space-y-4">
                <div className="flex items-center justify-between gap-2 pb-1">
                  <span className={`text-[10px] uppercase tracking-[0.25em] font-extrabold ${isDark ? "text-white/40" : "text-slate-500"}`}>Placement details</span>
                  <button
                    type="button"
                    onClick={handleAutoFill}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition ${
                      isDark ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20" : "border-indigo-300 bg-indigo-50 text-indigo-800 hover:bg-indigo-100 shadow-2xs"
                    }`}
                  >
                    ⚡ Auto-Fill from Profile
                  </button>
                </div>
                <div className="grid gap-4">
                  <FormField icon={Phone} label="Phone number">
                    <input
                      required
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="+91 98765 43210"
                      className={`w-full border rounded-2xl px-4 py-3 text-sm font-semibold outline-none transition-all duration-300 ${
                        isDark ? "bg-white/5 border-white/10 text-white placeholder-white/30 focus:border-white/30" : "bg-white border-slate-300 text-slate-950 placeholder:text-slate-400 focus:border-indigo-600 shadow-2xs"
                      }`}
                    />
                  </FormField>
                  <FormField icon={Linkedin} label="LinkedIn profile">
                    <input
                      value={linkedin}
                      onChange={(event) => setLinkedin(event.target.value)}
                      placeholder="https://linkedin.com/in/..."
                      className={`w-full border rounded-2xl px-4 py-3 text-sm font-semibold outline-none transition-all duration-300 ${
                        isDark ? "bg-white/5 border-white/10 text-white placeholder-white/30 focus:border-white/30" : "bg-white border-slate-300 text-slate-950 placeholder:text-slate-400 focus:border-indigo-600 shadow-2xs"
                      }`}
                    />
                  </FormField>
                  <FormField icon={Github} label="GitHub profile">
                    <input
                      value={github}
                      onChange={(event) => setGithub(event.target.value)}
                      placeholder="https://github.com/..."
                      className={`w-full border rounded-2xl px-4 py-3 text-sm font-semibold outline-none transition-all duration-300 ${
                        isDark ? "bg-white/5 border-white/10 text-white placeholder-white/30 focus:border-white/30" : "bg-white border-slate-300 text-slate-950 placeholder:text-slate-400 focus:border-indigo-600 shadow-2xs"
                      }`}
                    />
                  </FormField>
                  <FormField icon={Upload} label="Resume">
                    <label className={`relative flex min-h-[46px] cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold transition-all duration-300 ${
                      isDark ? "border-white/10 bg-white/5 text-white/70 hover:border-white/30 hover:bg-white/10" : "border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100 shadow-2xs"
                    }`}>
                      <FileText className={`size-4 shrink-0 ${isDark ? "text-white/45" : "text-slate-500"}`} />
                      <span className="min-w-0 flex-1 truncate">
                        {resume?.name ?? application?.resumeFilename ?? "Upload PDF, DOC, or DOCX"}
                      </span>
                      <span className={`text-[10px] uppercase tracking-[0.18em] font-bold ${isDark ? "text-white/40" : "text-slate-500"}`}>Choose</span>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx"
                        required={!application}
                        onChange={(event) => setResume(event.target.files?.[0] ?? null)}
                        className="absolute inset-0 cursor-pointer opacity-0"
                      />
                    </label>
                  </FormField>
                </div>

                <FormField icon={BriefcaseBusiness} label="Skills">
                  <textarea
                    required
                    value={skills}
                    onChange={(event) => setSkills(event.target.value)}
                    rows={4}
                    placeholder="React, Python, SQL, machine learning, communication..."
                    className={`w-full border rounded-2xl px-4 py-3 text-sm font-semibold outline-none transition-all duration-300 resize-none ${
                      isDark ? "bg-white/5 border-white/10 text-white placeholder-white/30 focus:border-white/30" : "bg-white border-slate-300 text-slate-950 placeholder:text-slate-400 focus:border-indigo-600 shadow-2xs"
                    }`}
                  />
                </FormField>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-600 px-6 py-3.5 text-[11px] font-extrabold uppercase tracking-[0.2em] text-white shadow-md transition-all duration-300 hover:scale-105 disabled:cursor-wait disabled:opacity-60 disabled:hover:scale-100"
                  >
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    {application ? "Save profile" : "Submit profile"}
                  </button>
                  {application ? (
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      className={`rounded-full border px-5 py-3 text-xs font-bold uppercase tracking-[0.2em] transition ${
                        isDark ? "border-white/10 bg-white/[0.04] text-white/60 hover:text-white" : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 shadow-2xs"
                      }`}
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </form>
            ) : null}
          </GlassCard>

          <div className="min-h-0">
            <GlassCard className={`flex h-full min-h-[620px] flex-col overflow-hidden ${!isDark ? "bg-white/95 border-slate-200 shadow-sm" : ""}`}>
              <PanelTitle icon={BriefcaseBusiness} eyebrow="Job availability" title="Open roles" />
              <div className="mt-6 min-h-0 flex-1">
                {roleOpenings.length ? (
                  <div className="flex h-full min-h-0 flex-col gap-4">
                    <div className="max-h-[220px] shrink-0 space-y-3 overflow-y-auto pr-1">
                      {roleOpenings.map((role) => {
                        const isSelected = selectedRoleId === role.id;
                        const canRemove = role.applicationStatus === "accepted" || role.applicationStatus === "rejected";
                        return (
                          <div
                            key={role.id}
                            className={`w-full rounded-2xl border p-4 text-left transition-all duration-300 ${
                              isSelected
                                ? isDark
                                  ? "border-emerald-300/40 bg-emerald-400/10 shadow-[0_0_30px_rgba(52,211,153,0.15)] scale-[1.02]"
                                  : "border-emerald-500 bg-emerald-50/90 shadow-2xs scale-[1.01]"
                                : isDark
                                  ? "border-white/10 bg-white/[0.03] hover:border-white/30 hover:bg-white/10 hover:-translate-y-0.5"
                                  : "border-slate-200 bg-slate-50 hover:bg-slate-100 hover:-translate-y-0.5 shadow-2xs"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <button
                                type="button"
                                onClick={() => setSelectedRoleId((current) => (current === role.id ? null : role.id))}
                                className="min-w-0 flex-1 text-left"
                              >
                                <div className={`truncate font-extrabold ${isDark ? "text-white" : "text-slate-950"}`} title={role.title}>
                                  {role.title}
                                </div>
                                <div className={`mt-1 truncate text-xs font-medium ${isDark ? "text-white/45" : "text-slate-600"}`} title={role.companyName}>
                                  {role.companyName}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                  <RoleMini icon={BriefcaseBusiness}>{titleCase(role.workMode)}</RoleMini>
                                </div>
                              </button>
                              <div className="flex shrink-0 items-center gap-2">
                                <StudentRoleStatus status={role.applicationStatus} canApply={role.canApply} />
                                {canRemove ? (
                                  <button
                                    type="button"
                                    disabled={clearingRoleId === role.id}
                                    onClick={() => void removePastRole(role)}
                                    aria-label={`Remove ${role.title} history`}
                                    className="grid size-8 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/45 transition hover:border-rose-300/25 hover:text-rose-100 disabled:cursor-wait disabled:opacity-50"
                                    title="Remove from Open roles"
                                  >
                                    {clearingRoleId === role.id ? (
                                      <Loader2 className="size-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="size-3.5" />
                                    )}
                                  </button>
                                ) : null}
                                <ChevronRight className={`size-4 text-white/35 transition ${isSelected ? "rotate-90" : ""}`} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {selectedRole ? (
                      <motion.div
                        key={selectedRole.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]"
                      >
                        <div className="min-h-0 flex-1 overflow-y-auto p-4 pr-2">
                          <div className="pr-2">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-[10px] uppercase tracking-[0.25em] text-white/35">
                                {titleCase(selectedRole.roleType)}
                              </div>
                              <h3 className="mt-1 font-display text-2xl">{selectedRole.title}</h3>
                            </div>
                            <StudentRoleStatus status={selectedRole.applicationStatus} canApply={selectedRole.canApply} />
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <RoleDetail icon={Building2} label="Company" value={selectedRole.companyName} />
                            <RoleDetail icon={MapPin} label="Location" value={`${titleCase(selectedRole.workMode)} - ${selectedRole.location}`} />
                            <RoleDetail icon={CalendarClock} label="Deadline" value={selectedRole.deadline} />
                            <RoleDetail icon={ShieldCheck} label="Pay" value={selectedRole.compensation} />
                            <RoleDetail icon={GraduationCap} label="Min sem" value={`Sem ${selectedRole.minimumSemester}+`} />
                            <RoleDetail icon={CheckCircle2} label="Min CGPA" value={selectedRole.minimumCgpa.toFixed(1)} />
                          </div>

                          <div className="mt-4 rounded-2xl border border-white/10 bg-black/15 p-4">
                            <div className="text-[10px] uppercase tracking-[0.25em] text-white/35">Criteria</div>
                            <p className="mt-2 text-sm leading-6 text-white/62">{selectedRole.description}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {splitSkills(selectedRole.requiredSkills).map((skill) => (
                                <span key={skill} className="rounded-full border border-emerald-300/18 bg-emerald-400/[0.09] px-3 py-1.5 text-sm text-emerald-50/90">
                                  {skill}
                                </span>
                              ))}
                            </div>
                            {selectedRole.missingSkills?.length ? (
                              <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-300/18 bg-amber-400/8 px-3 py-2 text-sm text-amber-50/78">
                                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                                Missing: {selectedRole.missingSkills.join(", ")}
                              </div>
                            ) : null}
                          </div>

                          {selectedRole.decisionMessage ? (
                            <div className="mt-4 border-l-2 border-emerald-400/55 pl-3 text-sm italic leading-6 text-white/58">
                              {selectedRole.decisionMessage}
                            </div>
                          ) : null}
                          </div>
                        </div>

                        <div className="shrink-0 border-t border-white/8 bg-black/20 p-4">
                          <button
                            type="button"
                            disabled={!selectedRole.canApply || applyingRoleId === selectedRole.id}
                            onClick={() => void applyForRole(selectedRole)}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/12 px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-55"
                          >
                            {applyingRoleId === selectedRole.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <BriefcaseBusiness className="size-4" />
                            )}
                            {selectedRole.applicationStatus ? titleCase(selectedRole.applicationStatus) : "Apply for role"}
                          </button>

                          {selectedRole.applicationStatus === "accepted" || selectedRole.applicationStatus === "rejected" ? (
                            <button
                              type="button"
                              disabled={clearingRoleId === selectedRole.id}
                              onClick={() => void removePastRole(selectedRole)}
                              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/58 transition hover:border-rose-300/25 hover:text-rose-100 disabled:cursor-wait disabled:opacity-50"
                            >
                              {clearingRoleId === selectedRole.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Trash2 className="size-4" />
                              )}
                              Remove past role
                            </button>
                          ) : null}
                        </div>
                      </motion.div>
                    ) : null}
                  </div>
                ) : (
                  <EmptyState text="No jobs right now." />
                )}
              </div>
            </GlassCard>
          </div>
        </section>
      </div>
    </PageTransition>
  );
}

function ApplicationDetails({
  application,
  onEdit,
  onOpenResume,
}: {
  application: PlacementApplication;
  onEdit: () => void;
  onOpenResume: (download: boolean) => void;
}) {
  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/10 bg-white/[0.035] p-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-white/35">Submitted profile</div>
          <div className="mt-2 text-sm text-white/55">Updated {formatDateTime(application.updatedAt)}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={application.status} />
          <button
            type="button"
            onClick={onEdit}
            className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-white/65 transition hover:text-white"
          >
            Edit
          </button>
        </div>
      </div>

      <div className="grid gap-3">
        <Detail label="Phone" value={application.phoneNumber} />
        <Detail label="Resume" value={application.resumeFilename} />
        <Detail label="LinkedIn" value={application.linkedinProfile || "Not added"} />
        <Detail label="GitHub" value={application.githubProfile || "Not added"} />
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
        <div className="text-[10px] uppercase tracking-[0.25em] text-white/35">Skills</div>
        <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-white/72">{application.skills}</div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => onOpenResume(false)}
          className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-xs uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-400/18"
        >
          <FileText className="size-4" />
          Open resume
        </button>
        <button
          type="button"
          onClick={() => onOpenResume(true)}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs uppercase tracking-[0.18em] text-white/65 transition hover:text-white"
        >
          <Upload className="size-4" />
          Save resume
        </button>
      </div>
    </div>
  );
}

function CriteriaRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <div className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${
      isDark ? "border-white/10 bg-white/[0.035]" : "border-slate-200 bg-slate-50 shadow-2xs"
    }`}>
      <span className={`text-sm font-semibold ${isDark ? "text-white/70" : "text-slate-700"}`}>{label}</span>
      <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${
        ok ? (isDark ? "text-emerald-200" : "text-emerald-700") : (isDark ? "text-amber-100" : "text-amber-700")
      }`}>
        {ok ? <CheckCircle2 className="size-3.5" /> : <Clock className="size-3.5" />}
        {value}
      </span>
    </div>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <div className={`rounded-2xl border p-4 ${isDark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-slate-50 shadow-2xs"}`}>
      <div className={`text-[10px] uppercase tracking-[0.24em] font-bold ${isDark ? "text-white/35" : "text-slate-500"}`}>{label}</div>
      <div className={`mt-2 break-words font-extrabold ${isDark ? "text-white/82" : "text-slate-950"}`}>{value}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <div className={`rounded-2xl border p-4 ${isDark ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-slate-50 shadow-2xs"}`}>
      <div className={`text-[10px] uppercase tracking-[0.24em] font-bold ${isDark ? "text-white/35" : "text-slate-500"}`}>{label}</div>
      <div className={`mt-2 break-words text-sm font-semibold ${isDark ? "text-white/70" : "text-slate-800"}`}>{value}</div>
    </div>
  );
}

function FormField({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <label className="block">
      <div className={`mb-2 inline-flex items-center gap-2 text-xs font-bold ${isDark ? "text-white/60" : "text-slate-700"}`}>
        <Icon className="size-3.5" />
        {label}
      </div>
      {children}
    </label>
  );
}

function PanelTitle({ icon: Icon, eyebrow, title }: { icon: LucideIcon; eyebrow: string; title: string }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <div className="flex items-start gap-3">
      <span className={`grid size-10 shrink-0 place-items-center rounded-2xl ${isDark ? "bg-white/10 text-white/70" : "bg-indigo-50 border border-indigo-200 text-indigo-600 shadow-2xs"}`}>
        <Icon className="size-4" />
      </span>
      <div>
        <div className={`text-[10px] uppercase tracking-[0.28em] font-extrabold ${isDark ? "text-white/38" : "text-slate-500"}`}>{eyebrow}</div>
        <h2 className={`font-display text-2xl font-extrabold ${isDark ? "text-white" : "text-slate-950"}`}>{title}</h2>
      </div>
    </div>
  );
}

function RoleMini({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold ${
      isDark ? "border-white/10 bg-white/[0.04] text-white/52" : "border-slate-300 bg-white text-slate-700 shadow-2xs"
    }`}>
      <Icon className={`size-3 ${isDark ? "text-white/48" : "text-slate-500"}`} />
      <span>{children}</span>
    </span>
  );
}

function RoleDetail({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
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

function StudentRoleStatus({
  status,
  canApply,
}: {
  status?: PlacementRole["applicationStatus"] | null;
  canApply?: boolean;
}) {
  const label = status ? titleCase(status) : canApply ? "Open" : "Locked";
  const styles =
    status === "accepted"
      ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-200"
      : status === "rejected"
        ? "border-rose-300/20 bg-rose-400/10 text-rose-100"
        : status === "applied"
          ? "border-cyan-300/20 bg-cyan-400/10 text-cyan-100"
          : canApply
            ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-200"
            : "border-white/10 bg-white/[0.04] text-white/48";
  const Icon = status === "accepted" ? CheckCircle2 : status === "rejected" ? XCircle : status === "applied" ? Clock : canApply ? CheckCircle2 : Clock;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.16em] ${styles}`}>
      <Icon className="size-3.5" />
      {label}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const selected = status === "selected";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] ${
        selected
          ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-200"
          : "border-cyan-300/20 bg-cyan-400/10 text-cyan-100"
      }`}
    >
      {selected ? <CheckCircle2 className="size-3.5" /> : <Clock className="size-3.5" />}
      {selected ? "Selected" : "Submitted"}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.02] px-5 py-10 text-center text-sm text-white/45">
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

function formatDateTime(value: string) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
