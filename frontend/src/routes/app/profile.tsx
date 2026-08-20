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
import { useTheme } from "@/lib/theme";

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
  const { theme } = useTheme();
  const isDark = theme === "dark";
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

      <section
        className={`relative mb-6 overflow-hidden rounded-[32px] transition-all ${
          isDark ? "border border-white/12 bg-[#08080b] text-white shadow-xl" : ""
        }`}
        style={
          !isDark
            ? {
                background: "linear-gradient(135deg, #FFFFFF 0%, #F8FFF3 30%, #F1FAEA 65%, #EAF7E6 100%)",
                border: "1px solid rgba(100,116,139,0.10)",
                boxShadow: "0 20px 60px rgba(15,23,42,0.08), 0 6px 18px rgba(15,23,42,0.05)",
              }
            : undefined
        }
      >
        <div
          className={`absolute inset-0 ${
            isDark
              ? "bg-[radial-gradient(circle_at_top_left,rgba(76,175,80,0.26),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(216,239,188,0.18),transparent_32%),linear-gradient(135deg,rgba(20,32,22,0.86),rgba(7,16,10,0.94))]"
              : ""
          }`}
          style={
            !isDark
              ? {
                  backgroundImage:
                    "radial-gradient(circle at 15% 20%, rgba(76,175,80,0.12), transparent 35%)",
                }
              : undefined
          }
        />
        {!isDark && (
          <>
            <div className="absolute top-[-40px] right-[10%] size-72 rounded-full bg-[#4caf50]/5 blur-3xl pointer-events-none" />
            <div className="absolute inset-0 opacity-[0.04] pointer-events-none [background-image:linear-gradient(rgba(76,175,80,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(76,175,80,0.18)_1px,transparent_1px)] [background-size:24px_24px]" />
          </>
        )}
        <div className="relative grid gap-8 p-6 md:p-8 xl:grid-cols-[1.35fr_0.95fr]">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-start">
              <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                className="group relative flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-[28px] text-4xl font-bold text-white shadow-md border border-white/20"
              >
                <span className={`absolute inset-0 ${
                  isDark
                    ? "bg-[linear-gradient(135deg,#4caf50_0%,#68c56d_48%,#d8efbc_100%)]"
                    : "bg-gradient-to-br from-[#4caf50] to-[#d8efbc]"
                }`} />
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
                <div className={`text-[11px] uppercase tracking-[0.42em] font-bold ${isDark ? "text-white/80" : "text-[#64748B]"}`}>
                  {view.studentCode}
                </div>
                <h1 className={`mt-2 font-display text-4xl font-extrabold leading-tight md:text-5xl ${isDark ? "text-white" : "text-[#1F2937]"}`}>
                  {view.name}
                </h1>
                <p className={`mt-2 text-lg font-bold ${isDark ? "text-white/90" : "text-[#64748B]"}`}>
                  {view.department} / Semester {view.semester}
                </p>
                <p className={`mt-4 max-w-3xl text-sm leading-7 font-medium ${isDark ? "text-white/80" : "text-[#64748B]"}`}>
                  {view.bio ||
                    "Build a strong campus identity here with your profile story, contact details, focus area, and personal academic context."}
                </p>
                <div className="mt-5 flex flex-wrap gap-3 text-sm font-medium">
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
                className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs uppercase tracking-[0.22em] font-extrabold transition-all duration-200 ${
                  isDark
                    ? "border border-white/20 bg-white/15 text-white hover:bg-white/25"
                    : "border border-[#a5d6a7] bg-white text-[#2f8f46] hover:bg-[#4caf50] hover:text-white shadow-2xs"
                }`}
              >
                <Edit3 className="size-3.5" />
                Edit Profile
              </button>
            </div>

            <div
              className={`rounded-[28px] p-5 backdrop-blur transition-all ${
                isDark ? "border border-white/15 bg-[#071425]/90 text-white shadow-md" : "text-[#1F2937]"
              }`}
              style={
                !isDark
                  ? {
                      background: "linear-gradient(180deg, #FCFCFF, #F5F8FF)",
                      border: "1px solid rgba(76,175,80,0.14)",
                      boxShadow: "0 8px 30px rgba(15,23,42,0.05)",
                    }
                  : undefined
              }
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className={`text-[10px] uppercase tracking-[0.34em] font-extrabold ${isDark ? "text-white/70" : "text-[#64748B]"}`}>
                    Completion
                  </div>
                  <div className={`mt-3 font-display text-4xl font-extrabold ${isDark ? "text-white" : "text-[#1F2937]"}`}>{view.profileCompletion}%</div>
                </div>
                <div className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.25em] font-bold ${
                  isDark
                    ? "border-white/20 bg-white/10 text-white/80"
                    : "border-[#a5d6a7] bg-white text-[#2f8f46] shadow-2xs"
                }`}>
                  {view.profileCompletion >= 85 ? "Verified-ready" : "Improve details"}
                </div>
              </div>
              <div className={`mt-4 h-2 overflow-hidden rounded-full ${isDark ? "bg-white/20" : "bg-slate-200/80"}`}>
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isDark
                      ? "bg-[linear-gradient(90deg,#4caf50_0%,#68c56d_48%,#d8efbc_100%)]"
                      : "bg-gradient-to-r from-[#4caf50] to-[#d8efbc]"
                  }`}
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
              <GlassCard className={`h-full overflow-hidden ${!isDark ? "bg-white/95 border-slate-200 shadow-sm" : ""}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className={`text-[10px] uppercase tracking-[0.3em] font-bold ${isDark ? "text-white/40" : "text-slate-500"}`}>{item.label}</div>
                    <div className={`mt-2 font-display text-2xl leading-tight font-extrabold ${isDark ? "text-white" : "text-slate-950"}`}>{item.value}</div>
                    <div className={`mt-2 text-sm font-medium ${isDark ? "text-white/48" : "text-slate-600"}`}>{item.detail}</div>
                  </div>
                  <div className={`flex size-12 items-center justify-center rounded-2xl ${
                    isDark ? "bg-[linear-gradient(135deg,rgba(76,175,80,0.22),rgba(216,239,188,0.12))]" : "bg-emerald-50 border border-emerald-200 text-emerald-700 shadow-2xs"
                  }`}>
                    <Icon className={`size-5 ${isDark ? "text-white/80" : "text-emerald-700"}`} />
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.18fr_0.82fr]">
        <GlassCard className={`overflow-hidden ${!isDark ? "bg-white/95 border-slate-200 shadow-sm" : ""}`}>
          <div className={`text-[10px] uppercase tracking-[0.3em] font-bold ${isDark ? "text-white/40" : "text-slate-500"}`}>Live Overview</div>
          <div className={`mb-5 mt-1 font-display text-2xl font-extrabold ${isDark ? "text-white" : "text-slate-950"}`}>Academic Snapshot</div>
          <div className="grid gap-3">
            {snapshot.map((item) => (
              <div key={item.label} className={`rounded-2xl border px-4 py-4 ${
                isDark ? "border-white/8 bg-white/[0.02]" : "border-slate-200 bg-slate-50/80 shadow-2xs"
              }`}>
                <div className={`text-[10px] uppercase tracking-[0.3em] font-bold ${isDark ? "text-white/35" : "text-slate-500"}`}>{item.label}</div>
                <div className={`mt-2 text-2xl font-extrabold ${isDark ? "text-white/90" : "text-slate-950"}`}>{item.value}</div>
                <div className={`mt-1 text-sm font-medium ${isDark ? "text-white/48" : "text-slate-600"}`}>{item.detail}</div>
              </div>
            ))}
          </div>

          <div className={`my-6 h-px ${isDark ? "bg-white/8" : "bg-slate-200"}`} />

          <div className={`text-[10px] uppercase tracking-[0.3em] font-bold ${isDark ? "text-white/40" : "text-slate-500"}`}>Identity</div>
          <div className={`mb-5 mt-1 font-display text-2xl font-extrabold ${isDark ? "text-white" : "text-slate-950"}`}>Student Card</div>
          <div className="grid gap-3">
            <MiniRow label="Roll number" value={view.studentCode} />
            <MiniRow label="Department" value={view.department} />
            <MiniRow label="Semester" value={`Semester ${view.semester}`} />
            <MiniRow label="City / State" value={joinParts([view.city, view.state]) || "Not added yet"} />
            <MiniRow label="Guardian contact" value={joinParts([view.guardianName, view.guardianPhone], " / ") || "Not added yet"} />
          </div>
        </GlassCard>

        <div className="space-y-5">
          <GlassCard className={!isDark ? "bg-white/95 border-slate-200 shadow-sm" : ""}>
            <div className={`text-[10px] uppercase tracking-[0.3em] font-bold ${isDark ? "text-white/40" : "text-slate-500"}`}>Skills</div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(view.skills.length ? view.skills : ["Communication", "Research", "Teamwork"]).map((skill) => (
                <span
                  key={skill}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                    view.skills.length
                      ? isDark
                        ? "glass-strong text-white/90"
                        : "bg-emerald-50 border border-emerald-200 text-emerald-950 shadow-2xs"
                      : isDark
                        ? "border border-dashed border-white/10 text-white/42"
                        : "border border-dashed border-slate-300 text-slate-500"
                  }`}
                >
                  {skill}
                </span>
              ))}
            </div>
          </GlassCard>

          <GlassCard className={!isDark ? "bg-white/95 border-slate-200 shadow-sm" : ""}>
            <div className={`text-[10px] uppercase tracking-[0.3em] font-bold ${isDark ? "text-white/40" : "text-slate-500"}`}>Links</div>
            <div className="mt-4 grid gap-3">
              <LinkRow icon={Linkedin} label="LinkedIn" value={view.linkedinUrl} />
              <LinkRow icon={Github} label="GitHub" value={view.githubUrl} />
              <LinkRow icon={UserRound} label="Email identity" value={view.email} />
            </div>
          </GlassCard>

          <GlassCard className={`xl:min-h-[320px] ${!isDark ? "bg-white/95 border-slate-200 shadow-sm" : ""}`}>
            <div className={`text-[10px] uppercase tracking-[0.3em] font-bold ${isDark ? "text-white/40" : "text-slate-500"}`}>Milestones</div>
            <div className="mt-4 grid gap-3">
              {buildBadges(view).map((badge, index) => (
                <div
                  key={badge.name}
                  className={`relative overflow-hidden rounded-2xl border p-4 ${
                    badge.earned
                      ? isDark
                        ? "border-white/12 bg-white/[0.04]"
                        : "border-slate-200 bg-slate-50 shadow-2xs"
                      : isDark
                        ? "border-white/8 bg-black/20"
                        : "border-slate-200 bg-slate-100/70 opacity-75 shadow-2xs"
                  }`}
                >
                  <div
                    className="absolute inset-x-0 top-0 h-1"
                    style={{
                      opacity: badge.earned ? 1 : 0.35,
                      background: `linear-gradient(90deg,#4caf50,${
                        index % 2 === 0 ? "#d8efbc" : "#ffc84b"
                      })`,
                    }}
                  />
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className={`font-bold ${isDark ? "text-white" : "text-slate-950"}`}>{badge.name}</div>
                      <div className={`mt-1 text-xs font-medium ${isDark ? "text-white/46" : "text-slate-600"}`}>{badge.detail}</div>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] font-bold ${
                        badge.earned
                          ? isDark
                            ? "bg-white/10 text-white/75"
                            : "bg-emerald-100 text-emerald-900"
                          : isDark
                            ? "bg-black/25 text-white/35"
                            : "bg-slate-200 text-slate-700"
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

        <GlassCard className={`min-h-[420px] ${!isDark ? "bg-white/95 border-slate-200 shadow-sm" : ""}`}>
          <div className={`text-[10px] uppercase tracking-[0.3em] font-bold ${isDark ? "text-white/40" : "text-slate-500"}`}>Activity</div>
          <div className={`mb-5 mt-1 font-display text-2xl font-extrabold ${isDark ? "text-white" : "text-slate-950"}`}>Recent Timeline</div>
          <div className="relative pl-6">
            <div className={`absolute bottom-0 left-2 top-0 w-px ${isDark ? "bg-gradient-to-b from-white/30 via-white/10 to-transparent" : "bg-slate-300"}`} />
            {activity.map((entry, index) => (
              <motion.div
                key={`${entry.t}-${entry.l}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="relative pb-6"
              >
                <span className="absolute -left-[18px] top-1.5 size-2.5 rounded-full bg-[linear-gradient(135deg,#4caf50,#d8efbc)] shadow-xs" />
                <div className={`text-[10px] uppercase tracking-[0.3em] font-bold ${isDark ? "text-white/40" : "text-slate-500"}`}>{entry.t}</div>
                <div className={`mt-1 text-sm font-semibold ${isDark ? "text-white/84" : "text-slate-900"}`}>{entry.l}</div>
              </motion.div>
            ))}
          </div>
        </GlassCard>

        <GlassCard className={!isDark ? "bg-white/95 border-slate-200 shadow-sm" : ""}>
          <div className={`text-[10px] uppercase tracking-[0.3em] font-bold ${isDark ? "text-white/40" : "text-slate-500"}`}>Achievements</div>
          <div className={`mb-5 mt-1 font-display text-2xl font-extrabold ${isDark ? "text-white" : "text-slate-950"}`}>Highlights</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {achievements.map((item, index) => (
              <motion.div
                key={item.name}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                className={`rounded-2xl border p-4 ${
                  isDark ? "border-white/8 bg-white/[0.02]" : "border-slate-200 bg-slate-50 shadow-2xs"
                }`}
              >
                <Award className={`size-4 ${isDark ? "text-white/60" : "text-emerald-700"}`} />
                <div className={`mt-3 text-lg font-bold ${isDark ? "text-white/90" : "text-slate-950"}`}>{item.name}</div>
                <div className={`text-sm font-semibold ${isDark ? "text-white/45" : "text-slate-500"}`}>{item.year}</div>
              </motion.div>
            ))}
          </div>
        </GlassCard>
      </div>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className={`max-h-[88vh] overflow-y-auto sm:max-w-3xl transition-all ${
          isDark ? "border-white/10 bg-[#0b0b0f] text-white" : "border-slate-200 bg-white text-slate-900 shadow-2xl"
        }`}>
          <DialogHeader>
            <DialogTitle className={`font-display text-2xl ${isDark ? "text-white" : "text-slate-950 font-extrabold"}`}>Edit Student Profile</DialogTitle>
            <DialogDescription className={isDark ? "text-white/50" : "text-slate-500 font-medium"}>
              These changes save to the backend and immediately refresh your live student identity.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-5">
            {error && (
              <div className={`flex items-start gap-3 rounded-2xl border p-4 ${
                isDark ? "border-rose-500/20 bg-rose-500/10 text-rose-300" : "border-rose-200 bg-rose-50 text-rose-800"
              }`}>
                <AlertCircle className="mt-0.5 size-5 shrink-0 text-rose-500" />
                <div>
                  <div className="font-semibold">{error}</div>
                </div>
              </div>
            )}
            
            <div className={`rounded-2xl border p-4 space-y-3 ${
              isDark ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-slate-50/80"
            }`}>
              <label className={`text-[10px] uppercase tracking-[0.28em] font-bold ${isDark ? "text-white/40" : "text-slate-700"}`}>Profile Photo</label>
              <div className="flex items-center gap-4">
                <div className={`size-16 rounded-2xl overflow-hidden flex items-center justify-center text-xl font-bold border shrink-0 ${
                  isDark ? "bg-white/10 border-white/15 text-white" : "bg-white border-slate-300 text-slate-800 shadow-2xs"
                }`}>
                  {avatarUrl || view.avatarUrl ? <img src={avatarUrl || view.avatarUrl || ""} alt="Avatar" className="size-full object-cover" /> : view.avatar || initialsFromName(view.name)}
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className={`cursor-pointer inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-wider transition ${
                    isDark
                      ? "border-white/15 bg-white/10 text-white hover:bg-white/20"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 shadow-2xs"
                  }`}>
                    <Camera className="size-3.5 text-[#2f8f46]" /> Upload Photo
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                  </label>
                  {(avatarUrl || view.avatarUrl) && (
                    <button
                      type="button"
                      onClick={() => void handleAvatarRemove()}
                      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-wider transition ${
                        isDark
                          ? "border-rose-500/20 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
                          : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 shadow-2xs"
                      }`}
                    >
                      <Trash2 className="size-3.5" /> Remove Photo
                    </button>
                  )}
                </div>
              </div>
              {avatarError && <div className="text-xs text-rose-500 font-semibold">{avatarError}</div>}
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

            <DialogFooter className="gap-3 sm:justify-between sm:space-x-0 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsEditOpen(false)}
                className={`rounded-full border px-4 py-2 text-sm font-bold transition ${
                  isDark
                    ? "border-white/10 text-white/65 hover:border-white/20 hover:text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-2xs"
                }`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || Object.keys(fieldErrors).length > 0}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold text-white shadow-md disabled:cursor-not-allowed disabled:opacity-50 transition ${
                  isDark
                    ? "bg-[linear-gradient(90deg,#4caf50,#d8efbc)] hover:opacity-95"
                    : "bg-[#2f8f46] hover:bg-[#267a38]"
                }`}
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
  const { theme } = useTheme();
  const isDark = theme === "dark";
  
  const accentColor =
    label === "CGPA"
      ? "#4caf50"
      : label === "Attendance"
        ? "#68c56d"
        : label === "Credits"
          ? "#8fba7c"
          : "#10B981";

  return (
    <div
      className={`relative overflow-hidden rounded-[22px] px-4 py-3.5 transition-all duration-200 ${
        isDark
          ? "border border-white/10 bg-white/8 backdrop-blur"
          : "border border-[#E2E8F0] bg-white hover:-translate-y-0.5"
      }`}
      style={!isDark ? { boxShadow: "0 2px 8px rgba(15,23,42,0.04)" } : undefined}
    >
      {!isDark && (
        <span
          className="absolute top-0 left-0 right-0 h-[3px]"
          style={{ background: accentColor }}
        />
      )}
      <div className={`text-[9px] uppercase tracking-[0.32em] font-bold ${isDark ? "text-white/55" : "text-[#64748B]"}`}>{label}</div>
      <div className={`mt-1 font-display text-xl font-extrabold ${isDark ? "text-white" : "text-[#1F2937]"}`}>{value}</div>
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
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-medium text-xs transition ${
        isDark
          ? muted ? "border-dashed border-white/12 text-white/35" : "border-white/10 bg-white/6 text-white/80"
          : muted ? "border-dashed border-slate-300 text-slate-400 bg-white" : "border-[#D7DDF3] bg-white text-[#475569] shadow-2xs"
      }`}
    >
      <Icon className={`size-4 ${isDark ? "" : "text-[#2f8f46]"}`} />
      {value || "Not added yet"}
    </span>
  );
}

function InlineMeta({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <div>
      <div className={`text-[10px] uppercase tracking-[0.25em] font-bold ${isDark ? "text-white/38" : "text-[#64748B]"}`}>{label}</div>
      <div className={`mt-1 text-sm font-semibold ${isDark ? "text-white/78" : "text-[#1F2937]"}`}>{value}</div>
    </div>
  );
}

function MiniRow({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <div className={`flex items-start justify-between gap-4 rounded-2xl border px-4 py-3 ${
      isDark ? "border-white/8 bg-white/[0.02]" : "border-slate-200 bg-slate-50 shadow-2xs"
    }`}>
      <div className={`text-[10px] uppercase tracking-[0.25em] font-bold ${isDark ? "text-white/35" : "text-slate-500"}`}>{label}</div>
      <div className={`max-w-[60%] text-right text-sm font-bold ${isDark ? "text-white/78" : "text-slate-950"}`}>{value}</div>
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
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <div className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${
      isDark ? "border-white/8 bg-white/[0.02]" : "border-slate-200 bg-slate-50 shadow-2xs"
    }`}>
      <div className={`inline-flex items-center gap-2 text-sm font-bold ${isDark ? "text-white/72" : "text-slate-950"}`}>
        <Icon className={`size-4 ${isDark ? "text-white/55" : "text-emerald-700"}`} />
        {label}
      </div>
      <div className={`max-w-[65%] truncate text-sm font-medium ${isDark ? "text-white/50" : "text-slate-600"}`}>{value || "Not added yet"}</div>
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
  const { theme } = useTheme();
  const isDark = theme === "dark";
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className={`text-[10px] uppercase tracking-[0.28em] font-bold ${isDark ? "text-white/40" : "text-slate-700"}`}>{label}</label>
        <div className={`text-[9px] font-semibold ${isDark ? "text-white/30" : "text-slate-500"}`}>
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
        className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${
          isDark
            ? "bg-white/[0.03] text-white placeholder:text-white/25 focus:border-white/25 " + (error ? "border-rose-500/50 focus:border-rose-400/60" : "border-white/10")
            : "bg-slate-50 text-slate-900 border-slate-300 placeholder:text-slate-400 focus:border-[#4caf50] focus:bg-white " + (error ? "border-rose-500/50" : "")
        }`}
      />
      {error && (
        <div id={`${label}-error`} className={`flex items-center gap-2 text-xs font-semibold ${isDark ? "text-rose-400" : "text-rose-600"}`}>
          <AlertCircle className="size-3" />
          {error}
        </div>
      )}
      {isValid && value && (
        <div className={`flex items-center gap-2 text-xs font-semibold ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>
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
  const { theme } = useTheme();
  const isDark = theme === "dark";
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className={`text-[10px] uppercase tracking-[0.28em] font-bold ${isDark ? "text-white/40" : "text-slate-700"}`}>{label}</label>
        <div className={`text-[9px] font-semibold ${isDark ? "text-white/30" : "text-slate-500"}`}>
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
        className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${
          isDark
            ? "bg-white/[0.03] text-white placeholder:text-white/25 focus:border-white/25 " + (error ? "border-rose-500/50 focus:border-rose-400/60" : "border-white/10")
            : "bg-slate-50 text-slate-900 border-slate-300 placeholder:text-slate-400 focus:border-[#4caf50] focus:bg-white " + (error ? "border-rose-500/50" : "")
        }`}
      />
      {error && (
        <div id={`${label}-error`} className={`flex items-center gap-2 text-xs font-semibold ${isDark ? "text-rose-400" : "text-rose-600"}`}>
          <AlertCircle className="size-3" />
          {error}
        </div>
      )}
      {isValid && value && (
        <div className={`flex items-center gap-2 text-xs font-semibold ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>
          <CheckCircle2 className="size-3" />
          Valid
        </div>
      )}
      {hint && <div className={`text-xs ${isDark ? "text-white/35" : "text-slate-500"}`}>{hint}</div>}
    </div>
  );
}
