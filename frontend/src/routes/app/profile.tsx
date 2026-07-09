import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Award as AwardIcon,
  BookOpen,
  Edit3,
  Mail,
  MapPin,
  Phone,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { GlassCard, PageTransition, SectionHeading } from "@/components/app/cinematic";
import { getStoredUser } from "@/lib/auth";
import {
  getStoredStudentProfile,
  initialsFromName,
  setStoredStudentProfile,
  type EditableStudentProfile,
} from "@/lib/student-profile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useStudentDashboard } from "@/lib/student-session";

export const Route = createFileRoute("/app/profile")({ component: ProfilePage });

type Badge = {
  name: string;
  detail: string;
  earned: boolean;
};

type Spotlight = {
  label: string;
  value: string;
  detail: string;
  icon: typeof BookOpen;
};

type SnapshotItem = {
  label: string;
  value: string;
  detail: string;
};

function ProfilePage() {
  const { dashboard } = useStudentDashboard();
  const authUser = getStoredUser();
  const user = dashboard?.user ?? {
    name: authUser?.full_name ?? "Student",
    email: authUser?.email ?? "",
    studentCode: "CV-2026-0000",
    department: "CampusVerse",
    semester: 1,
    cgpa: 0,
    attendance: 0,
    avatar:
      authUser?.full_name
        .split(" ")
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase() || "CV",
  };

  const achievements = dashboard?.achievements ?? [];
  const fallbackSkills = ["Campus Collaboration", "Research", "Communication"];
  const baseSkills = dashboard?.skills?.length ? dashboard.skills : fallbackSkills;
  const activity = dashboard?.activity?.length
    ? dashboard.activity
    : [
        { t: "Today", l: "Signed in to CampusVerse" },
        { t: "2 days ago", l: "Dashboard and profile details reviewed" },
        { t: "1 week ago", l: "Academic records verified for the semester" },
      ];

  const defaultProfile = useMemo<EditableStudentProfile>(
    () => ({
      name: user.name,
      email: user.email,
      bio: "",
      phone: "",
      address: "",
      focus: "",
      skills: dashboard?.skills?.length ? dashboard.skills : [],
    }),
    [dashboard?.skills, user.email, user.name],
  );

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [profile, setProfile] = useState<EditableStudentProfile>(() => {
    const stored = getStoredStudentProfile();
    return stored ? { ...defaultProfile, ...stored } : defaultProfile;
  });
  const [draft, setDraft] = useState<EditableStudentProfile>(profile);

  useEffect(() => {
    const stored = getStoredStudentProfile();
    const nextProfile = stored ? { ...defaultProfile, ...stored } : defaultProfile;
    setProfile(nextProfile);
    setDraft(nextProfile);
  }, [defaultProfile]);

  const creditsCompleted = useMemo(() => {
    const semesterBase = Math.max(18, (user.semester - 1) * 20 + 20);
    return Math.min(180, semesterBase + Math.min(achievements.length, 5) * 2);
  }, [achievements.length, user.semester]);

  const academicStanding = useMemo(() => {
    if (user.cgpa >= 9 && user.attendance >= 90) return "Dean's List";
    if (user.cgpa >= 8.5 && user.attendance >= 85) return "Top 20%";
    if (user.cgpa >= 7.5) return "On Track";
    return "In Progress";
  }, [user.attendance, user.cgpa]);

  const profileCompletion = useMemo(() => {
    const checks = [
      profile.name.trim(),
      profile.email.trim(),
      profile.bio.trim(),
      profile.phone.trim(),
      profile.address.trim(),
      profile.focus.trim(),
      profile.skills.length > 0 ? "skills" : "",
    ];
    const completed = checks.filter(Boolean).length;
    return Math.round((completed / checks.length) * 100);
  }, [profile]);

  const profileAvatar = useMemo(
    () => initialsFromName(profile.name || user.name),
    [profile.name, user.name],
  );

  const badges = useMemo<Badge[]>(
    () => [
      {
        name: "Profile Verified",
        detail:
          profileCompletion >= 85
            ? "Key details were added by the student"
            : "Add bio, phone, address, and focus",
        earned: profileCompletion >= 85,
      },
      {
        name: "Attendance Safe Zone",
        detail: `${Math.round(user.attendance)}% attendance`,
        earned: user.attendance >= 85,
      },
      {
        name: "Semester Progress",
        detail: `${creditsCompleted}/180 credits tracked`,
        earned: creditsCompleted >= 20,
      },
      {
        name: "Academic Momentum",
        detail: academicStanding,
        earned: user.cgpa >= 8.5,
      },
    ],
    [academicStanding, creditsCompleted, profileCompletion, user.attendance, user.cgpa],
  );

  const spotlight = useMemo<Spotlight[]>(
    () => [
      {
        label: "Academic focus",
        value: profile.focus || "Set your current focus",
        detail: profile.focus ? "Current growth direction" : "Add a focus area from edit profile",
        icon: Target,
      },
      {
        label: "Credits on track",
        value: `${creditsCompleted}/180`,
        detail: `Semester ${user.semester} progress snapshot`,
        icon: BookOpen,
      },
      {
        label: "Current standing",
        value: academicStanding,
        detail: `${Math.max(74, Math.round(user.attendance || 89))}% attendance health`,
        icon: TrendingUp,
      },
    ],
    [academicStanding, creditsCompleted, profile.focus, user.attendance, user.semester],
  );

  const visibleAchievements = achievements.length
    ? achievements
    : [
        { name: "Active CampusVerse Student", year: "2026" },
        { name: "Semester 1 Progress", year: "2026" },
        { name: "Attendance Safe Zone", year: "2026" },
        { name: "Digital Profile Verified", year: "2026" },
      ];

  const snapshot = useMemo<SnapshotItem[]>(() => {
    const unreadAnnouncements = (dashboard?.announcements ?? []).filter(
      (item) => item.unread,
    ).length;
    const pendingAssignments = (dashboard?.assignment_items ?? []).filter(
      (item) => item.status !== "graded",
    ).length;
    const openRequests = (dashboard?.request_timeline ?? []).length;
    const nextDeadline = dashboard?.upcoming_deadlines?.[0];

    return [
      {
        label: "Unread updates",
        value: unreadAnnouncements ? `${unreadAnnouncements} announcements` : "Inbox clear",
        detail: "Latest academic and campus notices",
      },
      {
        label: "Pending work",
        value: pendingAssignments ? `${pendingAssignments} active items` : "On top of tasks",
        detail: "Assignments and deliverables in motion",
      },
      {
        label: "Open requests",
        value: openRequests ? `${openRequests} tracked requests` : "No pending requests",
        detail: "Certificates, complaints, and support flow",
      },
      {
        label: "Next checkpoint",
        value: nextDeadline ? nextDeadline.title : "Nothing urgent right now",
        detail: nextDeadline
          ? `${nextDeadline.module} / ${nextDeadline.due}`
          : "Schedule looks stable",
      },
    ];
  }, [dashboard]);

  function openEditor() {
    setDraft(profile);
    setIsEditOpen(true);
  }

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextProfile = {
      ...draft,
      name: draft.name.trim() || user.name,
      email: draft.email.trim() || user.email,
      bio: draft.bio.trim(),
      phone: draft.phone.trim(),
      address: draft.address.trim(),
      focus: draft.focus.trim(),
      skills: draft.skills
        .map((skill) => skill.trim())
        .filter(Boolean)
        .filter((skill, index, all) => all.indexOf(skill) === index)
        .slice(0, 8),
    };
    setProfile(nextProfile);
    setStoredStudentProfile(nextProfile);
    setIsEditOpen(false);
  }

  return (
    <PageTransition>
      <SectionHeading
        eyebrow="Identity"
        title="Student Profile"
        sub="Your academic snapshot, profile story, and earned milestones in one place."
      />

      <div className="relative mb-8 overflow-hidden rounded-3xl">
        <div className="absolute inset-0" style={{ background: "var(--grad-aurora)" }} />
        <div className="absolute inset-0 grid-bg opacity-30" />
        <div className="absolute inset-px rounded-3xl bg-[#050505]/70" />
        <div className="relative flex flex-col gap-8 p-8 md:p-10 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex flex-col gap-6 md:flex-row md:items-start">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative flex size-28 items-center justify-center overflow-hidden rounded-3xl font-display text-4xl font-bold"
            >
              <span className="absolute inset-0" style={{ background: "var(--grad-aurora)" }} />
              <span className="relative">{profileAvatar}</span>
            </motion.div>

            <div className="flex-1">
              <div className="text-[10px] uppercase tracking-[0.4em] text-white/60">
                {user.studentCode}
              </div>
              <h1 className="mt-2 font-display text-4xl font-bold md:text-5xl">{profile.name}</h1>
              <div className="mt-2 text-white/70">
                {user.department} / Semester {user.semester}
              </div>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
                {profile.bio || "Add a short bio from the Edit button to personalize this profile."}
              </p>
              <div className="mt-4 flex flex-wrap gap-4 text-sm text-white/50">
                {profile.email && (
                  <span className="inline-flex items-center gap-2">
                    <Mail className="size-4 text-white/55" />
                    {profile.email}
                  </span>
                )}
                {profile.phone && (
                  <span className="inline-flex items-center gap-2">
                    <Phone className="size-4 text-white/55" />
                    {profile.phone}
                  </span>
                )}
                {profile.address && (
                  <span className="inline-flex items-center gap-2">
                    <MapPin className="size-4 text-white/55" />
                    {profile.address}
                  </span>
                )}
                {!profile.phone && !profile.address && (
                  <span className="inline-flex items-center gap-2 rounded-full border border-dashed border-white/10 px-3 py-1.5 text-xs text-white/35">
                    Add contact details to improve profile completion
                  </span>
                )}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Stat label="CGPA" value={user.cgpa ? user.cgpa.toFixed(1) : "8.4"} />
                <Stat
                  label="Attendance"
                  value={`${Math.max(74, Math.round(user.attendance || 89))}%`}
                />
                <Stat label="Credits" value={`${creditsCompleted}/180`} />
                <Stat label="Standing" value={academicStanding} />
              </div>
            </div>
          </div>

          <div className="flex w-full max-w-xs flex-col gap-3 xl:items-end">
            <button
              onClick={openEditor}
              className="glass-strong inline-flex w-fit items-center gap-2 rounded-full px-5 py-2.5 text-xs uppercase tracking-[0.2em]"
            >
              <Edit3 className="size-3.5" />
              Edit
            </button>
            <div className="w-full rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">
                Profile Completion
              </div>
              <div className="mt-3 flex items-end justify-between">
                <div className="font-display text-3xl">{profileCompletion}%</div>
                <div className="text-xs text-white/45">
                  {profileCompletion >= 85 ? "Ready for review" : "Add more details"}
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${profileCompletion}%`, background: "var(--grad-aurora)" }}
                />
              </div>
              <div className="mt-4 inline-flex items-start gap-2 text-xs text-white/50">
                <Target className="mt-0.5 size-3.5 shrink-0 text-white/55" />
                <span>{profile.focus}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-3">
        {spotlight.map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <GlassCard className="h-full">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">
                      {item.label}
                    </div>
                    <div className="mt-2 font-display text-2xl leading-tight">{item.value}</div>
                    <div className="mt-2 text-sm text-white/45">{item.detail}</div>
                  </div>
                  <div
                    className="flex size-11 shrink-0 items-center justify-center rounded-2xl"
                    style={{
                      background:
                        "linear-gradient(135deg, oklch(0.7 0.25 310 / 0.2), oklch(0.82 0.18 200 / 0.16))",
                    }}
                  >
                    <Icon className="size-5 text-white/80" />
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.45fr_0.95fr]">
        <GlassCard className="min-h-[460px]">
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Activity</div>
          <div className="mb-5 mt-1 font-display text-xl">Last 30 days</div>
          <div className="relative pl-6">
            <div className="absolute bottom-0 left-2 top-0 w-px bg-gradient-to-b from-white/30 via-white/10 to-transparent" />
            {activity.map((entry, index) => (
              <motion.div
                key={`${entry.t}-${entry.l}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="relative pb-5"
              >
                <span
                  className="absolute -left-[18px] top-1.5 size-2.5 rounded-full"
                  style={{ background: "var(--grad-aurora)" }}
                />
                <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">
                  {entry.t}
                </div>
                <div className="text-sm">{entry.l}</div>
              </motion.div>
            ))}
          </div>
        </GlassCard>

        <div className="space-y-5">
          <GlassCard>
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Skills</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(profile.skills.length ? profile.skills : baseSkills).map((skill) => (
                <span
                  key={skill}
                  className={`rounded-full px-3 py-1.5 text-xs ${profile.skills.length ? "glass" : "border border-dashed border-white/10 text-white/45"}`}
                >
                  {skill}
                </span>
              ))}
            </div>
            {!profile.skills.length && (
              <div className="mt-3 text-xs text-white/35">
                Suggested starter skills are shown until the student adds their own.
              </div>
            )}
          </GlassCard>

          <GlassCard className="xl:min-h-[320px]">
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Badges</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {badges.map((badge, index) => (
                <div
                  key={badge.name}
                  className={`relative overflow-hidden rounded-2xl border p-4 ${
                    badge.earned ? "border-white/15 bg-white/[0.04]" : "border-white/8 bg-black/20"
                  }`}
                >
                  <div
                    className={`absolute inset-x-0 top-0 h-1 ${
                      badge.earned ? "opacity-100" : "opacity-35"
                    }`}
                    style={{
                      background: `linear-gradient(90deg, oklch(0.7 0.25 310), ${
                        index % 2 === 0 ? "oklch(0.82 0.18 200)" : "oklch(0.85 0.12 60)"
                      })`,
                    }}
                  />
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-white">{badge.name}</div>
                      <div className="mt-1 text-xs text-white/45">{badge.detail}</div>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] ${
                        badge.earned ? "bg-white/10 text-white/70" : "bg-black/25 text-white/35"
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

        <GlassCard className="xl:col-span-2">
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Achievements</div>
          <div className="mb-5 mt-1 font-display text-xl">Highlights</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {visibleAchievements.map((achievement, index) => (
              <motion.div
                key={achievement.name}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="glass rounded-2xl p-4"
              >
                <AwardIcon className="size-4 text-white/60" />
                <div className="mt-2 font-medium">{achievement.name}</div>
                <div className="text-xs text-white/45">{achievement.year}</div>
              </motion.div>
            ))}
          </div>
        </GlassCard>

        <GlassCard>
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Snapshot</div>
          <div className="mb-5 mt-1 font-display text-xl">Live Overview</div>
          <div className="grid gap-3">
            {snapshot.map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3"
              >
                <div className="text-[10px] uppercase tracking-[0.25em] text-white/35">
                  {item.label}
                </div>
                <div className="mt-2 text-lg font-medium text-white/85">{item.value}</div>
                <div className="mt-1 text-sm text-white/45">{item.detail}</div>
              </div>
            ))}
          </div>

          <div className="my-6 h-px bg-white/8" />

          <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Student Card</div>
          <div className="mb-5 mt-1 font-display text-xl">Identity</div>
          <div className="space-y-4">
            <MiniRow label="Roll number" value={user.studentCode} />
            <MiniRow label="Department" value={user.department} />
            <MiniRow label="Semester" value={`Semester ${user.semester}`} />
            <MiniRow label="Academic standing" value={academicStanding} />
            <MiniRow label="Profile readiness" value={`${profileCompletion}% complete`} />
            <MiniRow
              label="Campus focus"
              value={
                profile.focus
                  ? profile.focus.length > 36
                    ? `${profile.focus.slice(0, 36)}...`
                    : profile.focus
                  : "Not added yet"
              }
            />
          </div>
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.26em] text-white/40">
              <Sparkles className="size-3.5 text-white/60" />
              Milestone-ready
            </div>
            <p className="mt-3 text-sm leading-6 text-white/55">
              This profile is structured to present identity, academic progress, activity, and
              achievements in one polished student-facing view.
            </p>
          </div>
        </GlassCard>
      </div>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="border-white/10 bg-[#0b0b0f] text-white sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Edit Profile</DialogTitle>
            <DialogDescription className="text-white/50">
              This milestone saves changes locally so the profile feels complete in the demo.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={saveProfile} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Full Name"
                value={draft.name}
                onChange={(value) => setDraft((current) => ({ ...current, name: value }))}
              />
              <Field
                label="Phone"
                value={draft.phone}
                onChange={(value) => setDraft((current) => ({ ...current, phone: value }))}
              />
              <Field
                label="Email"
                value={draft.email}
                onChange={(value) => setDraft((current) => ({ ...current, email: value }))}
              />
              <Field
                label="Address"
                value={draft.address}
                onChange={(value) => setDraft((current) => ({ ...current, address: value }))}
              />
            </div>

            <Field
              label="Academic Focus"
              value={draft.focus}
              onChange={(value) => setDraft((current) => ({ ...current, focus: value }))}
            />

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.28em] text-white/40">Bio</label>
              <textarea
                value={draft.bio}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, bio: event.target.value }))
                }
                rows={4}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/25"
                placeholder="Tell your campus story in one line."
              />
              <div className="text-xs text-white/35">
                Completion only increases when you enter real details here.
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.28em] text-white/40">
                Skills
              </label>
              <input
                value={draft.skills.join(", ")}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    skills: event.target.value.split(","),
                  }))
                }
                className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/25"
                placeholder="React, Research, Teamwork"
              />
              <div className="text-xs text-white/35">Separate skills with commas.</div>
            </div>

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
                className="rounded-full px-5 py-2 text-sm font-medium text-white"
                style={{ background: "var(--grad-aurora)" }}
              >
                Save Changes
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageTransition>
  );
}

function MiniRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.25em] text-white/35">{label}</div>
      <div className="text-right text-sm text-white/72">{value}</div>
    </div>
  );
}

function Field({
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-strong rounded-2xl px-4 py-2.5">
      <div className="text-[9px] uppercase tracking-[0.3em] text-white/50">{label}</div>
      <div className="mt-0.5 font-display text-lg">{value}</div>
    </div>
  );
}
