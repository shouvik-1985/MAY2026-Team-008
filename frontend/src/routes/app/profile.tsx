import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Award,
  BookOpen,
  Camera,
  Edit3,
  Github,
  GraduationCap,
  Link as LinkIcon,
  Linkedin,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  UserRound,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { GlassCard, PageTransition, SectionHeading } from "@/components/app/cinematic";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getStudentProfile, updateStudentAvatar, updateStudentProfile, type StudentProfile } from "@/lib/api";
import { setCustomAvatar, useUserAvatar } from "@/lib/avatar";
import { getStoredUser, setStoredUser } from "@/lib/auth";
import { getStoredDashboard, setStoredDashboard, useStudentDashboard } from "@/lib/student-session";

export const Route = createFileRoute("/app/profile")({ component: ProfilePage });

type DraftProfile = {
  name: string;
  email: string;
  address: string;
  phone: string;
  completedCredits: string;
  totalCredits: string;
  bio: string;
  focus: string;
  skills: string;
  guardianName: string;
  guardianPhone: string;
  city: string;
  state: string;
  linkedinUrl: string;
  githubUrl: string;
};

type FieldValidationError = {
  field: string;
  message: string;
};

const FIELD_MAX_LENGTHS: Record<string, number> = {
  name: 120,
  email: 255,
  address: 255,
  phone: 40,
  bio: 600,
  focus: 180,
  guardianName: 120,
  guardianPhone: 40,
  city: 120,
  state: 120,
  linkedinUrl: 255,
  githubUrl: 255,
};

function validateEmail(email: string): string | null {
  const pattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return email && !pattern.test(email) ? "Invalid email format" : null;
}

function validatePhone(phone: string): string | null {
  if (!phone) return null;
  const pattern = /^[0-9]{10}$/;
  return !pattern.test(phone) ? "Phone must be exactly 10 digits" : null;
}

function validateURL(url: string, type: "linkedin" | "github"): string | null {
  if (!url) return null;
  if (type === "linkedin") {
    return !url.match(/^https:\/\/(www\.)?linkedin\.com\//) ? "LinkedIn URL must start with https://linkedin.com/" : null;
  }
  if (type === "github") {
    return !url.startsWith("https://github.com/") ? "GitHub URL must start with https://github.com/" : null;
  }
  return null;
}

function ProfilePage() {
  const { dashboard, loading: dashboardLoading } = useStudentDashboard();
  const { avatarUrl, updateAvatar, removeAvatar } = useUserAvatar();
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftProfile>(emptyDraft());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [autoSaveDraft, setAutoSaveDraft] = useState<DraftProfile | null>(null);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const previousAvatar = avatarUrl;
    try {
      setAvatarError(null);
      const nextAvatar = await updateAvatar(file);
      const updated = await updateStudentAvatar({ avatar_url: nextAvatar });
      setProfile(updated);
      setDraft(toDraft(updated));
      syncCachedStudentState(updated);
      setStatus("Profile photo updated successfully! Your latest avatar is now synced across the app.");
    } catch (err) {
      setCustomAvatar(previousAvatar ?? null);
      setAvatarError(err instanceof Error ? err.message : "Failed to update profile photo");
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoadingProfile(true);
      setError(null);
      try {
        const data = await getStudentProfile();
        if (cancelled) return;
        setProfile(data);
        setDraft(toDraft(data));
        setCustomAvatar(data.avatarUrl ?? null);
        syncCachedStudentState(data);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Could not load student profile");
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    }

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(null), 2800);
    return () => window.clearTimeout(timer);
  }, [status]);

  async function handleAvatarRemove() {
    const previousAvatar = avatarUrl;
    try {
      setAvatarError(null);
      removeAvatar();
      const updated = await updateStudentAvatar({ avatar_url: null });
      setProfile(updated);
      setDraft(toDraft(updated));
      syncCachedStudentState(updated);
      setStatus("Profile photo removed successfully.");
    } catch (err) {
      setCustomAvatar(previousAvatar ?? null);
      setAvatarError(err instanceof Error ? err.message : "Failed to remove profile photo");
    }
  }

  // Auto-save draft to localStorage
  useEffect(() => {
    const timer = setTimeout(() => {
      setAutoSaveDraft(draft);
      localStorage.setItem("profileDraft", JSON.stringify(draft));
    }, 1000);
    return () => clearTimeout(timer);
  }, [draft]);

  // Validate fields in real-time
  useEffect(() => {
    const errors: Record<string, string> = {};
    
    if (draft.name && draft.name.length < 2) {
      errors.name = "Name must be at least 2 characters";
    }
    if (draft.email) {
      errors.email = validateEmail(draft.email) || "";
    }
    if (draft.phone) {
      errors.phone = validatePhone(draft.phone) || "";
    }
    if (draft.linkedinUrl) {
      errors.linkedinUrl = validateURL(draft.linkedinUrl, "linkedin") || "";
    }
    if (draft.githubUrl) {
      errors.githubUrl = validateURL(draft.githubUrl, "github") || "";
    }
    
    const completedNum = parseInt(draft.completedCredits) || 0;
    const totalNum = parseInt(draft.totalCredits) || 0;
    if (completedNum > totalNum && draft.totalCredits) {
      errors.completedCredits = "Cannot exceed total credits";
    }

    setFieldErrors(Object.fromEntries(Object.entries(errors).filter(([, v]) => v)));
  }, [draft]);

  const view = useMemo(() => {
    if (profile) return profile;

    const authUser = getStoredUser();
    const cached = getStoredDashboard();
    return {
      id: authUser?.id ?? 0,
      name: cached?.user.name ?? authUser?.full_name ?? "Student",
      email: cached?.user.email ?? authUser?.email ?? "",
      studentCode: cached?.user.studentCode ?? "CV-2026-0000",
      department: cached?.user.department ?? "CampusVerse",
      semester: cached?.user.semester ?? 1,
      cgpa: cached?.user.cgpa ?? 0,
      attendance: cached?.user.attendance ?? 0,
      completedCredits: cached?.user.completedCredits ?? Math.max(18, (cached?.user.semester ?? 1) * 20 - 12),
      totalCredits: cached?.user.totalCredits ?? 180,
      address: cached?.user.address ?? "Campus Residence",
      phone: cached?.user.phone ?? "",
      bio: cached?.user.bio ?? "",
      focus: cached?.user.focus ?? "",
      skills: cached?.user.skills ?? [],
      guardianName: cached?.user.guardianName ?? "",
      guardianPhone: cached?.user.guardianPhone ?? "",
      city: cached?.user.city ?? "",
      state: cached?.user.state ?? "",
      linkedinUrl: cached?.user.linkedinUrl ?? "",
      githubUrl: cached?.user.githubUrl ?? "",
      avatar: cached?.user.avatar ?? initialsFromName(authUser?.full_name ?? "Student"),
      avatarUrl: cached?.user.avatarUrl ?? null,
      academicStanding: deriveAcademicStanding(cached?.user.cgpa ?? 0, cached?.user.attendance ?? 0),
      profileCompletion: 20,
      enrollmentDate: null,
      biometricEnrolled: cached?.user.biometricEnrolled ?? false,
      biometricEnrolledAt: cached?.user.biometricEnrolledAt ?? null,
    } satisfies StudentProfile;
  }, [profile]);

  const achievements = dashboard?.achievements?.length
    ? dashboard.achievements
    : [
        { name: "Active CampusVerse Student", year: "2026" },
        { name: `Semester ${view.semester} Progress`, year: "2026" },
        { name: "Attendance Safe Zone", year: "2026" },
      ];
  const activity = dashboard?.activity?.length
    ? dashboard.activity
    : [
        { t: "Today", l: "Campus profile opened" },
        { t: "2 days ago", l: "Dashboard synced with academic records" },
        { t: "1 week ago", l: "Progress data refreshed" },
      ];

  const spotlight = [
    {
      label: "Academic focus",
      value: view.focus || "Add your growth focus",
      detail: view.focus ? "Current learning direction" : "Set a focus to personalize your profile",
      icon: Target,
    },
    {
      label: "Credits on track",
      value: `${view.completedCredits}/${view.totalCredits}`,
      detail: `Semester ${view.semester} progression toward graduation`,
      icon: BookOpen,
    },
    {
      label: "Current standing",
      value: view.academicStanding,
      detail: `${Math.round(view.attendance)}% attendance and ${view.cgpa.toFixed(1)} CGPA`,
      icon: TrendingUp,
    },
  ];

  const snapshot = [
    {
      label: "Unread updates",
      value: dashboard?.announcements?.filter((item) => item.unread).length
        ? `${dashboard.announcements.filter((item) => item.unread).length} notices`
        : "Inbox clear",
      detail: "Academic and campus updates",
    },
    {
      label: "Pending work",
      value: dashboard?.assignment_items?.filter((item) => item.status !== "graded").length
        ? `${dashboard.assignment_items.filter((item) => item.status !== "graded").length} active items`
        : "No pending items",
      detail: "Assignments and checkpoints",
    },
    {
      label: "Open requests",
      value: dashboard?.request_timeline?.length
        ? `${dashboard.request_timeline.length} tracked requests`
        : "No live requests",
      detail: "Complaints, certificates, and support",
    },
    {
      label: "Biometric status",
      value: view.biometricEnrolled ? "Enrolled" : "Pending setup",
      detail: view.biometricEnrolledAt
        ? `Enrolled ${formatDate(view.biometricEnrolledAt)}`
        : "Attendance face verification not completed yet",
    },
  ];

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    
    // Validate all fields before submission
    if (Object.keys(fieldErrors).length > 0) {
      setError("Please fix the errors before saving");
      return;
    }

    if (!draft.name.trim() || !draft.email.trim() || !draft.address.trim()) {
      setError("Please fill in all required fields (Name, Email, Address)");
      return;
    }

    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const updated = await updateStudentProfile({
        name: draft.name.trim(),
        email: draft.email.trim(),
        address: draft.address.trim(),
        phone: draft.phone.trim(),
        bio: draft.bio.trim(),
        focus: draft.focus.trim(),
        completed_credits: clampNumber(draft.completedCredits, 0, 400),
        total_credits: clampNumber(draft.totalCredits, 1, 400),
        skills: draft.skills
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        guardian_name: draft.guardianName.trim(),
        guardian_phone: draft.guardianPhone.trim(),
        city: draft.city.trim(),
        state: draft.state.trim(),
        linkedin_url: draft.linkedinUrl.trim(),
        github_url: draft.githubUrl.trim(),
      });
      setProfile(updated);
      setDraft(toDraft(updated));
      syncCachedStudentState(updated);
      setIsEditOpen(false);
      setStatus("✓ Profile saved successfully! Changes synced to backend.");
      // Clear draft from localStorage
      localStorage.removeItem("profileDraft");
    } catch (saveError) {
      const errorMsg = saveError instanceof Error ? saveError.message : "Failed to save profile. Please try again.";
      setError(errorMsg);
    } finally {
      setSaving(false);
    }
  }

  if (dashboardLoading && loadingProfile && !profile) {
    return (
      <PageTransition>
        <SectionHeading eyebrow="Identity" title="Student Profile" sub="Loading your live profile..." />
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <SectionHeading
        eyebrow="Identity"
        title="Student Profile"
        sub="A live academic identity space powered by your backend profile, campus data, and recent activity."
      />

      {error && (
        <div className="mb-5 rounded-2xl border border-rose-300/15 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}
      {status && (
        <div className="mb-5 rounded-2xl border border-emerald-300/15 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {status}
        </div>
      )}

      <section className="relative mb-6 overflow-hidden rounded-[32px] border border-white/12 bg-[#08080b]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.23),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(6,182,212,0.24),transparent_32%),linear-gradient(135deg,rgba(125,31,98,0.72),rgba(7,16,37,0.9))]" />
        <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:28px_28px]" />
        <div className="relative grid gap-8 p-6 md:p-8 xl:grid-cols-[1.35fr_0.95fr]">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-start">
              <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                className="group relative flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-[28px] text-4xl font-bold text-white shadow-[0_20px_60px_rgba(0,0,0,0.28)] border border-white/20"
              >
                <span className="absolute inset-0 bg-[linear-gradient(135deg,#ff41c4_0%,#f11ab9_35%,#6c6cff_72%,#00d4ff_100%)]" />
                {avatarUrl || view.avatarUrl ? (
                  <img src={avatarUrl || view.avatarUrl || ""} alt={view.name} className="relative size-full object-cover" />
                ) : (
                  <span className="relative">{view.avatar || initialsFromName(view.name)}</span>
                )}
                <label className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center bg-black/65 opacity-0 transition-opacity group-hover:opacity-100 backdrop-blur-sm">
                  <Camera className="size-6 text-white" />
                  <span className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-white">Upload</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                </label>
              </motion.div>

              <div className="min-w-0 flex-1">
                <div className="text-[11px] uppercase tracking-[0.42em] text-white/60">
                  {view.studentCode}
                </div>
                <h1 className="mt-2 font-display text-4xl font-semibold leading-tight md:text-5xl">
                  {view.name}
                </h1>
                <p className="mt-2 text-lg text-white/70">
                  {view.department} / Semester {view.semester}
                </p>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-white/64">
                  {view.bio ||
                    "Build a strong campus identity here with your profile story, contact details, focus area, and personal academic context."}
                </p>
                <div className="mt-5 flex flex-wrap gap-3 text-sm text-white/58">
                  <InfoChip icon={Mail} value={view.email} />
                  <InfoChip icon={Phone} value={view.phone || "Add phone"} muted={!view.phone} />
                  <InfoChip icon={MapPin} value={joinParts([view.address, view.city, view.state])} />
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <HeroStat label="CGPA" value={view.cgpa.toFixed(2)} />
              <HeroStat label="Attendance" value={`${Math.round(view.attendance)}%`} />
              <HeroStat label="Credits" value={`${view.completedCredits}/${view.totalCredits}`} />
              <HeroStat label="Standing" value={view.academicStanding} />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex justify-start xl:justify-end">
              <button
                type="button"
                onClick={() => {
                  setDraft(toDraft(view));
                  setIsEditOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/10 px-5 py-2.5 text-xs uppercase tracking-[0.22em] text-white transition hover:border-white/25 hover:bg-white/14"
              >
                <Edit3 className="size-3.5" />
                Edit Profile
              </button>
            </div>

            <div className="rounded-[28px] border border-white/12 bg-[#071425]/70 p-5 backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.34em] text-white/42">
                    Completion
                  </div>
                  <div className="mt-3 font-display text-4xl">{view.profileCompletion}%</div>
                </div>
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-white/52">
                  {view.profileCompletion >= 85 ? "Verified-ready" : "Improve details"}
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#d946ef_0%,#f472b6_30%,#818cf8_62%,#22d3ee_100%)]"
                  style={{ width: `${view.profileCompletion}%` }}
                />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <InlineMeta label="Enrollment" value={view.enrollmentDate ? formatDate(view.enrollmentDate) : "Recently active"} />
                <InlineMeta label="Biometric" value={view.biometricEnrolled ? "Configured" : "Pending"} />
                <InlineMeta label="Profile score" value={`${view.profileCompletion}%`} />
                <InlineMeta label="Guardian" value={view.guardianName || "Not added yet"} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mb-6 grid gap-5 xl:grid-cols-3">
        {spotlight.map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06 }}
            >
              <GlassCard className="h-full overflow-hidden">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">{item.label}</div>
                    <div className="mt-2 font-display text-2xl leading-tight">{item.value}</div>
                    <div className="mt-2 text-sm text-white/48">{item.detail}</div>
                  </div>
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(217,70,239,0.22),rgba(34,211,238,0.18))]">
                    <Icon className="size-5 text-white/80" />
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.18fr_0.82fr]">
        <GlassCard className="overflow-hidden">
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Live Overview</div>
          <div className="mb-5 mt-1 font-display text-2xl">Academic Snapshot</div>
          <div className="grid gap-3">
            {snapshot.map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-4">
                <div className="text-[10px] uppercase tracking-[0.3em] text-white/35">{item.label}</div>
                <div className="mt-2 text-2xl font-medium text-white/90">{item.value}</div>
                <div className="mt-1 text-sm text-white/48">{item.detail}</div>
              </div>
            ))}
          </div>

          <div className="my-6 h-px bg-white/8" />

          <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Identity</div>
          <div className="mb-5 mt-1 font-display text-2xl">Student Card</div>
          <div className="grid gap-3">
            <MiniRow label="Roll number" value={view.studentCode} />
            <MiniRow label="Department" value={view.department} />
            <MiniRow label="Semester" value={`Semester ${view.semester}`} />
            <MiniRow label="City / State" value={joinParts([view.city, view.state]) || "Not added yet"} />
            <MiniRow label="Guardian contact" value={joinParts([view.guardianName, view.guardianPhone], " / ") || "Not added yet"} />
          </div>
        </GlassCard>

        <div className="space-y-5">
          <GlassCard>
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Skills</div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(view.skills.length ? view.skills : ["Communication", "Research", "Teamwork"]).map((skill) => (
                <span
                  key={skill}
                  className={`rounded-full px-3 py-1.5 text-xs ${
                    view.skills.length ? "glass-strong text-white/90" : "border border-dashed border-white/10 text-white/42"
                  }`}
                >
                  {skill}
                </span>
              ))}
            </div>
          </GlassCard>

          <GlassCard>
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Links</div>
            <div className="mt-4 grid gap-3">
              <LinkRow icon={Linkedin} label="LinkedIn" value={view.linkedinUrl} />
              <LinkRow icon={Github} label="GitHub" value={view.githubUrl} />
              <LinkRow icon={UserRound} label="Email identity" value={view.email} />
            </div>
          </GlassCard>

          <GlassCard className="xl:min-h-[320px]">
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Milestones</div>
            <div className="mt-4 grid gap-3">
              {buildBadges(view).map((badge, index) => (
                <div
                  key={badge.name}
                  className={`relative overflow-hidden rounded-2xl border p-4 ${
                    badge.earned ? "border-white/12 bg-white/[0.04]" : "border-white/8 bg-black/20"
                  }`}
                >
                  <div
                    className="absolute inset-x-0 top-0 h-1"
                    style={{
                      opacity: badge.earned ? 1 : 0.35,
                      background: `linear-gradient(90deg,#d946ef,${
                        index % 2 === 0 ? "#22d3ee" : "#fdba74"
                      })`,
                    }}
                  />
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-white">{badge.name}</div>
                      <div className="mt-1 text-xs text-white/46">{badge.detail}</div>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] ${
                        badge.earned ? "bg-white/10 text-white/75" : "bg-black/25 text-white/35"
                      }`}
                    >
                      {badge.earned ? "Earned" : "Locked"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>

        <GlassCard className="min-h-[420px]">
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Activity</div>
          <div className="mb-5 mt-1 font-display text-2xl">Recent Timeline</div>
          <div className="relative pl-6">
            <div className="absolute bottom-0 left-2 top-0 w-px bg-gradient-to-b from-white/30 via-white/10 to-transparent" />
            {activity.map((entry, index) => (
              <motion.div
                key={`${entry.t}-${entry.l}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="relative pb-6"
              >
                <span className="absolute -left-[18px] top-1.5 size-2.5 rounded-full bg-[linear-gradient(135deg,#f0abfc,#22d3ee)]" />
                <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">{entry.t}</div>
                <div className="mt-1 text-sm text-white/84">{entry.l}</div>
              </motion.div>
            ))}
          </div>
        </GlassCard>

        <GlassCard>
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Achievements</div>
          <div className="mb-5 mt-1 font-display text-2xl">Highlights</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {achievements.map((item, index) => (
              <motion.div
                key={item.name}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                className="rounded-2xl border border-white/8 bg-white/[0.02] p-4"
              >
                <Award className="size-4 text-white/60" />
                <div className="mt-3 text-lg font-medium text-white/90">{item.name}</div>
                <div className="text-sm text-white/45">{item.year}</div>
              </motion.div>
            ))}
          </div>
        </GlassCard>
      </div>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto border-white/10 bg-[#0b0b0f] text-white sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Edit Student Profile</DialogTitle>
            <DialogDescription className="text-white/50">
              These changes save to the backend and immediately refresh your live student identity.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-5">
            {error && (
              <div className="flex items-start gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4">
                <AlertCircle className="mt-0.5 size-5 shrink-0 text-rose-400" />
                <div>
                  <div className="font-medium text-rose-300">{error}</div>
                </div>
              </div>
            )}
            
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
              <label className="text-[10px] uppercase tracking-[0.28em] text-white/40">Profile Photo</label>
              <div className="flex items-center gap-4">
                <div className="size-16 rounded-2xl overflow-hidden bg-white/10 flex items-center justify-center text-xl font-bold border border-white/15 shrink-0">
                  {avatarUrl || view.avatarUrl ? <img src={avatarUrl || view.avatarUrl || ""} alt="Avatar" className="size-full object-cover" /> : view.avatar || initialsFromName(view.name)}
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white transition hover:bg-white/20">
                    <Camera className="size-3.5" /> Upload Photo
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                  </label>
                  {(avatarUrl || view.avatarUrl) && (
                    <button type="button" onClick={() => void handleAvatarRemove()} className="inline-flex items-center gap-2 rounded-full border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-rose-200 transition hover:bg-rose-500/20">
                      <Trash2 className="size-3.5" /> Remove Photo
                    </button>
                  )}
                </div>
              </div>
              {avatarError && <div className="text-xs text-rose-400">{avatarError}</div>}
            </div>
            
            <div className="grid gap-4 md:grid-cols-2">
              <Field 
                label="Full name" 
                value={draft.name} 
                error={fieldErrors.name}
                onChange={(value) => setDraft((current) => ({ ...current, name: value }))} 
              />
              <Field 
                label="Email" 
                type="email"
                value={draft.email} 
                error={fieldErrors.email}
                onChange={(value) => setDraft((current) => ({ ...current, email: value }))} 
              />
              <Field 
                label="Phone" 
                type="tel"
                value={draft.phone} 
                error={fieldErrors.phone}
                onChange={(value) => setDraft((current) => ({ ...current, phone: value }))} 
              />
              <Field 
                label="Address" 
                value={draft.address} 
                onChange={(value) => setDraft((current) => ({ ...current, address: value }))} 
              />
              <Field 
                label="Completed credits" 
                type="number"
                value={draft.completedCredits} 
                error={fieldErrors.completedCredits}
                onChange={(value) => setDraft((current) => ({ ...current, completedCredits: value }))} 
              />
              <Field 
                label="Total credits" 
                type="number"
                value={draft.totalCredits} 
                onChange={(value) => setDraft((current) => ({ ...current, totalCredits: value }))} 
              />
              <Field label="City" value={draft.city} onChange={(value) => setDraft((current) => ({ ...current, city: value }))} />
              <Field label="State" value={draft.state} onChange={(value) => setDraft((current) => ({ ...current, state: value }))} />
              <Field label="Guardian name" value={draft.guardianName} onChange={(value) => setDraft((current) => ({ ...current, guardianName: value }))} />
              <Field label="Guardian phone" value={draft.guardianPhone} onChange={(value) => setDraft((current) => ({ ...current, guardianPhone: value }))} />
              <Field 
                label="LinkedIn URL" 
                value={draft.linkedinUrl} 
                error={fieldErrors.linkedinUrl}
                placeholder="https://linkedin.com/in/yourprofile"
                onChange={(value) => setDraft((current) => ({ ...current, linkedinUrl: value }))} 
              />
              <Field 
                label="GitHub URL" 
                value={draft.githubUrl} 
                error={fieldErrors.githubUrl}
                placeholder="https://github.com/yourprofile"
                onChange={(value) => setDraft((current) => ({ ...current, githubUrl: value }))} 
              />
            </div>

            <Field 
              label="Academic focus" 
              value={draft.focus} 
              onChange={(value) => setDraft((current) => ({ ...current, focus: value }))} 
            />

            <TextArea
              label="Bio"
              rows={4}
              value={draft.bio}
              placeholder="Write a sharp one-paragraph student introduction."
              onChange={(value) => setDraft((current) => ({ ...current, bio: value }))}
            />

            <TextArea
              label="Skills"
              rows={3}
              value={draft.skills}
              placeholder="React, Python, Research, Public Speaking"
              hint="Separate skills with commas. Max 12 skills."
              onChange={(value) => setDraft((current) => ({ ...current, skills: value }))}
            />

            <DialogFooter className="gap-3 sm:justify-between sm:space-x-0">
              <button
                type="button"
                onClick={() => setIsEditOpen(false)}
                className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/65 transition hover:border-white/20 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || Object.keys(fieldErrors).length > 0}
                className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(90deg,#d946ef,#22d3ee)] px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <div className="size-3.5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="size-4" />
                    Save Changes
                  </>
                )}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageTransition>
  );
}

function syncCachedStudentState(profile: StudentProfile) {
  const storedUser = getStoredUser();
  if (storedUser) {
    setStoredUser({
      ...storedUser,
      full_name: profile.name,
      email: profile.email,
    });
  }

  const cachedDashboard = getStoredDashboard();
  if (cachedDashboard) {
    setStoredDashboard({
      ...cachedDashboard,
      user: {
        ...cachedDashboard.user,
        name: profile.name,
        email: profile.email,
        studentCode: profile.studentCode,
        department: profile.department,
        semester: profile.semester,
        cgpa: profile.cgpa,
        attendance: profile.attendance,
        completedCredits: profile.completedCredits,
        totalCredits: profile.totalCredits,
        avatar: profile.avatar,
        avatarUrl: profile.avatarUrl,
        address: profile.address,
        phone: profile.phone,
        bio: profile.bio,
        focus: profile.focus,
        skills: profile.skills,
        guardianName: profile.guardianName,
        guardianPhone: profile.guardianPhone,
        city: profile.city,
        state: profile.state,
        linkedinUrl: profile.linkedinUrl,
        githubUrl: profile.githubUrl,
        biometricEnrolled: profile.biometricEnrolled,
        biometricEnrolledAt: profile.biometricEnrolledAt,
      },
      skills: profile.skills.length ? profile.skills : cachedDashboard.skills,
    });
  }
}

function buildBadges(profile: StudentProfile) {
  return [
    {
      name: "Profile Verified",
      detail: profile.profileCompletion >= 85 ? "Student identity is fully filled" : "Add bio, focus, and contact depth",
      earned: profile.profileCompletion >= 85,
    },
    {
      name: "Attendance Safe Zone",
      detail: `${Math.round(profile.attendance)}% attendance`,
      earned: profile.attendance >= 85,
    },
    {
      name: "Academic Momentum",
      detail: profile.academicStanding,
      earned: profile.cgpa >= 8.5,
    },
    {
      name: "Biometric Ready",
      detail: profile.biometricEnrolled ? "Attendance identity verified" : "Complete biometric setup",
      earned: Boolean(profile.biometricEnrolled),
    },
  ];
}

function emptyDraft(): DraftProfile {
  return {
    name: "",
    email: "",
    address: "",
    phone: "",
    completedCredits: "",
    totalCredits: "180",
    bio: "",
    focus: "",
    skills: "",
    guardianName: "",
    guardianPhone: "",
    city: "",
    state: "",
    linkedinUrl: "",
    githubUrl: "",
  };
}

function toDraft(profile: StudentProfile): DraftProfile {
  return {
    name: profile.name,
    email: profile.email,
    address: profile.address,
    phone: profile.phone,
    completedCredits: String(profile.completedCredits),
    totalCredits: String(profile.totalCredits),
    bio: profile.bio,
    focus: profile.focus,
    skills: profile.skills.join(", "),
    guardianName: profile.guardianName,
    guardianPhone: profile.guardianPhone,
    city: profile.city,
    state: profile.state,
    linkedinUrl: profile.linkedinUrl,
    githubUrl: profile.githubUrl,
  };
}

function deriveAcademicStanding(cgpa: number, attendance: number) {
  if (cgpa >= 9 && attendance >= 90) return "Dean's List";
  if (cgpa >= 8.5 && attendance >= 85) return "Top 20%";
  if (cgpa >= 7.5) return "On Track";
  return "In Progress";
}

function initialsFromName(name: string) {
  return (
    name
      .split(" ")
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "CV"
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function joinParts(parts: Array<string | undefined | null>, separator = ", ") {
  return parts.map((item) => item?.trim()).filter(Boolean).join(separator);
}

function clampNumber(value: string, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/8 px-4 py-3 backdrop-blur">
      <div className="text-[9px] uppercase tracking-[0.32em] text-white/55">{label}</div>
      <div className="mt-1 font-display text-xl text-white">{value}</div>
    </div>
  );
}

function InfoChip({
  icon: Icon,
  value,
  muted,
}: {
  icon: typeof Mail;
  value: string;
  muted?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 ${
        muted ? "border-dashed border-white/12 text-white/35" : "border-white/10 bg-white/6 text-white/62"
      }`}
    >
      <Icon className="size-4" />
      {value || "Not added yet"}
    </span>
  );
}

function InlineMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.25em] text-white/38">{label}</div>
      <div className="mt-1 text-sm text-white/78">{value}</div>
    </div>
  );
}

function MiniRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.25em] text-white/35">{label}</div>
      <div className="max-w-[60%] text-right text-sm text-white/78">{value}</div>
    </div>
  );
}

function LinkRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof LinkIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
      <div className="inline-flex items-center gap-2 text-sm text-white/72">
        <Icon className="size-4 text-white/55" />
        {label}
      </div>
      <div className="max-w-[65%] truncate text-sm text-white/50">{value || "Not added yet"}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
  maxLength,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  maxLength?: number;
  placeholder?: string;
  type?: string;
}) {
  const max = maxLength || FIELD_MAX_LENGTHS[label.toLowerCase().replace(/ /g, "")] || 255;
  const isValid = !error;
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] uppercase tracking-[0.28em] text-white/40">{label}</label>
        <div className="text-[9px] text-white/30">
          {value.length}/{max}
        </div>
      </div>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value.slice(0, max))}
        maxLength={max}
        placeholder={placeholder}
        aria-label={label}
        aria-invalid={!!error}
        aria-describedby={error ? `${label}-error` : undefined}
        className={`w-full rounded-2xl border bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/25 ${
          error
            ? "border-rose-500/50 focus:border-rose-400/60"
            : "border-white/10"
        }`}
      />
      {error && (
        <div id={`${label}-error`} className="flex items-center gap-2 text-xs text-rose-400">
          <AlertCircle className="size-3" />
          {error}
        </div>
      )}
      {isValid && value && (
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <CheckCircle2 className="size-3" />
          Valid
        </div>
      )}
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
  hint,
  rows,
  error,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  rows: number;
  error?: string;
  maxLength?: number;
}) {
  const max = maxLength || FIELD_MAX_LENGTHS[label.toLowerCase().replace(/ /g, "")] || 2000;
  const isValid = !error;
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] uppercase tracking-[0.28em] text-white/40">{label}</label>
        <div className="text-[9px] text-white/30">
          {value.length}/{max}
        </div>
      </div>
      <textarea
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value.slice(0, max))}
        maxLength={max}
        aria-label={label}
        aria-invalid={!!error}
        aria-describedby={error ? `${label}-error` : undefined}
        className={`w-full rounded-2xl border bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/25 ${
          error
            ? "border-rose-500/50 focus:border-rose-400/60"
            : "border-white/10"
        }`}
      />
      {error && (
        <div id={`${label}-error`} className="flex items-center gap-2 text-xs text-rose-400">
          <AlertCircle className="size-3" />
          {error}
        </div>
      )}
      {isValid && value && (
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <CheckCircle2 className="size-3" />
          Valid
        </div>
      )}
      {hint && <div className="text-xs text-white/35">{hint}</div>}
    </div>
  );
}
