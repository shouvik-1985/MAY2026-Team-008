import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Award,
  Clock,
  Download,
  Loader2,
  Linkedin,
  ShieldCheck,
  FileText,
  Sparkles,
  CheckCircle2,
  Edit3,
  Eye,
  Plus,
  Trash2,
  GraduationCap,
  Briefcase,
  Code,
  UserCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { GlassCard, PageTransition, SectionHeading } from "@/components/app/cinematic";
import { openProtectedResource, requestStudentCertificate, resolveResourceUrl } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import { refreshStudentDashboard, setStoredDashboard, useStudentDashboard } from "@/lib/student-session";
import { getStoredUser } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/app/certificates")({ component: CertificatesPage });

type Tab = "certificates" | "resume-builder";
type ResumeTemplate = "modern-tech" | "classic-academic" | "creative-minimal" | "executive-ats";

type ProjectItem = {
  id: string;
  title: string;
  role: string;
  tech: string;
  description: string;
};

type ExperienceItem = {
  id: string;
  company: string;
  role: string;
  duration: string;
  bullets: string;
};

function shareToLinkedin(name: string) {
  const url = `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(
    name,
  )}&organizationName=${encodeURIComponent("CampusVerse University")}&issueYear=2026&issueMonth=7`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function inferResumeDownloadName(disposition: string | null, fallback: string) {
  if (!disposition) return fallback;
  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) return decodeURIComponent(utfMatch[1]);
  const simpleMatch = disposition.match(/filename="([^"]+)"/i);
  return simpleMatch?.[1] ?? fallback;
}

function resumeDownloadName(name: string) {
  const safeName = name.trim().replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "_") || "Student";
  return `${safeName}_Resume.pdf`;
}

function CertificatesPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [activeTab, setActiveTab] = useState<Tab>("certificates");
  const [processing, setProcessing] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const { dashboard } = useStudentDashboard();
  const certificates = dashboard?.certificate_items ?? [];
  const history = dashboard?.request_timeline.filter((item) => item.kind === "Certificate") ?? [];
  const user = dashboard?.user ?? {
    name: "Student",
    email: "student@campusverse.edu",
    studentCode: "CV-2026-1001",
    department: "Computer Science & AI",
    semester: 4,
    cgpa: 9.2,
    completedCredits: 80,
    totalCredits: 180,
    phone: "+91 98765 43210",
    city: "Mumbai",
    state: "Maharashtra",
    address: "Campus Residence, Block A",
    bio: "Enthusiastic Computer Science & AI student focused on full-stack web applications and machine learning systems.",
    focus: "Full Stack & Applied AI",
    skills: ["Python", "React", "TypeScript", "FastAPI", "SQLAlchemy", "Machine Learning"],
    linkedinUrl: "https://linkedin.com/in/student",
    githubUrl: "https://github.com/student",
  };

  // Resume Builder state pre-filled from database user record
  const [selectedTemplate, setSelectedTemplate] = useState<ResumeTemplate>("modern-tech");
  const [resumeData, setResumeData] = useState({
    name: user.name,
    email: user.email,
    phone: user.phone || "+91 98765 43210",
    location: `${user.city || "Campus"}, ${user.state || "India"}`,
    cgpa: `${user.cgpa} / 10.0`,
    department: user.department,
    semester: `Semester ${user.semester}`,
    linkedin: user.linkedinUrl || "https://linkedin.com/in/student",
    github: user.githubUrl || "https://github.com/student",
    summary:
      user.bio ||
      "Dedicated computer science student with a strong academic track record and expertise in software development.",
    skills: (user.skills && user.skills.length ? user.skills : ["Python", "React", "TypeScript", "FastAPI"]).join(", "),
  });

  const [projects, setProjects] = useState<ProjectItem[]>([
    {
      id: "p1",
      title: "CampusVerse Student Management Platform",
      role: "Lead Full Stack Developer",
      tech: "React, FastAPI, SQLite, TailwindCSS",
      description:
        "Built an end-to-end academic portal with biometric attendance verification, dynamic fee invoice streaming, and real-time chat.",
    },
    {
      id: "p2",
      title: "AI Attendance & Facial Verification Engine",
      role: "AI Engineer",
      tech: "Python, OpenCV, NumPy",
      description:
        "Implemented face template enrollment and real-time radius-based geo-fencing for attendance automation.",
    },
  ]);

  const [experiences, setExperiences] = useState<ExperienceItem[]>([
    {
      id: "e1",
      company: "TechVerse Solutions",
      role: "Software Engineering Intern",
      duration: "May 2025 - Jul 2025",
      bullets:
        "Developed responsive dashboard UI components and optimized FastAPI database queries, reducing response times by 35%.",
    },
  ]);

  const [achievements, setAchievements] = useState<string>(
    "Dean's List Academic Honor (2025-2026)\nWinner - Campus Innovation Hackathon 2025\nCertifications in Applied AI & System Architecture",
  );

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  async function refreshDashboard() {
    const next = await refreshStudentDashboard({ force: true });
    setStoredDashboard(next);
  }

  async function handlePrintPDF() {
    try {
      setStatus(null);
      const token = getAuthToken();
      if (!token) throw new Error("Your login session expired. Please log in again.");

      const payload = {
        name: resumeData.name,
        email: resumeData.email,
        phone: resumeData.phone,
        location: resumeData.location,
        cgpa: resumeData.cgpa,
        department: resumeData.department,
        summary: resumeData.summary,
        skillsText: resumeData.skills,
        projects: projects.map((p) => ({ title: p.title, tech: p.tech, description: p.description })),
        achievements,
        template: selectedTemplate,
      };

      const res = await fetch(resolveResourceUrl("/api/student/resume/pdf"), {
        method: "POST",
        headers: {
          Accept: "application/pdf",
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let message = "Could not generate resume PDF";
        try {
          const body = await res.json();
          message = body.detail ?? message;
        } catch {
          // Keep the fallback message when the server returns a non-JSON error.
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      const contentType = res.headers.get("Content-Type") ?? blob.type;
      if (!contentType.includes("application/pdf")) {
        throw new Error("Resume PDF response was not a PDF");
      }

      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = inferResumeDownloadName(res.headers.get("Content-Disposition"), resumeDownloadName(resumeData.name));
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
      setStatus("Resume PDF downloaded successfully");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to download resume PDF");
    }
  }

  return (
    <PageTransition>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <SectionHeading
          eyebrow="Academic & Career Suite"
          title="Certificates & Resume Builder"
          sub="Verified academic credentials and ATS-optimized resume builder."
        />

        <div className={`flex rounded-full p-1 gap-1 self-start md:self-auto border ${isDark ? "glass border-white/10" : "bg-slate-100 border-slate-300 shadow-2xs"}`}>
          <button
            onClick={() => setActiveTab("certificates")}
            className={`flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition ${
              activeTab === "certificates"
                ? isDark
                  ? "bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-600 text-white shadow-md"
                  : "bg-[#ecf8e6] text-slate-950 shadow-sm shadow-emerald-900/10"
                : isDark
                  ? "text-white/60 hover:text-white"
                  : "text-slate-700 hover:text-slate-950 hover:bg-slate-200"
            }`}
          >
            <Award className="size-3.5" />
            Certificates
          </button>
          <button
            onClick={() => setActiveTab("resume-builder")}
            className={`flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition ${
              activeTab === "resume-builder"
                ? isDark
                  ? "bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-600 text-white shadow-md"
                  : "bg-[#ecf8e6] text-slate-950 shadow-sm shadow-emerald-900/10"
                : isDark
                  ? "text-white/60 hover:text-white"
                  : "text-slate-700 hover:text-slate-950 hover:bg-slate-200"
            }`}
          >
            <FileText className="size-3.5" />
            Resume Builder
          </button>
        </div>
      </div>

      {status ? (
        <div className={`mb-5 rounded-2xl border px-4 py-3 text-sm font-medium flex items-center gap-2 ${
          isDark ? "border-white/10 bg-white/[0.05] text-white/80" : "border-emerald-300 bg-emerald-50 text-emerald-950 font-bold"
        }`}>
          <ShieldCheck className="size-4 text-emerald-500 shrink-0" />
          <span>{status}</span>
        </div>
      ) : null}

      {activeTab === "certificates" ? (
        <>
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5 mb-10">
            {certificates.map((c, i) => {
              const isGrad = c.key === "graduation";
              const isReady = c.status === "ready" || c.status === "downloaded";
              const isPending = c.status === "requested";
              const isRejected = c.status === "rejected";
              const isMeritRejected = c.key === "conduct" && isRejected;
              const isLocked = c.status === "locked";
              const canRequest = c.status === "available" || (isRejected && !isMeritRejected);
              const canDownload = isReady;
              return (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <GlassCard hover className={`h-full flex flex-col relative overflow-hidden ${isGrad ? "border-amber-400/40" : ""} ${!isDark ? "bg-white/95 border-slate-200 shadow-sm" : ""}`}>
                    {isGrad && (
                      <div className="absolute top-0 right-0 bg-amber-500 text-black font-bold text-[9px] uppercase tracking-widest px-3 py-1 rounded-bl-xl shadow-md flex items-center gap-1">
                        <GraduationCap className="size-3" /> Auto Degree
                      </div>
                    )}
                    <motion.div
                      whileHover={{ rotateY: 8 }}
                      style={{ transformStyle: "preserve-3d" }}
                      className="relative h-32 rounded-2xl mb-5 overflow-hidden flex items-center justify-center"
                    >
                      <div
                        className="absolute inset-0"
                        style={{
                          background: isGrad
                            ? "linear-gradient(135deg, oklch(0.75 0.22 65), oklch(0.85 0.18 80))"
                            : "var(--grad-aurora)",
                          opacity: 0.85,
                        }}
                      />
                      <div className={`absolute inset-px rounded-2xl ${isDark ? "bg-[#0a0a0a]/50" : "bg-slate-950/25"}`} />
                      {isGrad ? (
                        <GraduationCap className="relative size-11 text-amber-300" />
                      ) : (
                        <Award className="relative size-10 text-white" />
                      )}
                    </motion.div>

                    <div className={`font-display text-lg font-extrabold leading-snug ${isDark ? "text-white" : "text-slate-950"}`}>{c.name}</div>
                    <div className={`text-xs mt-1.5 flex-1 leading-relaxed ${isDark ? "text-white/55" : "text-slate-600 font-medium"}`}>{c.desc}</div>

                    <div className={`mt-3 flex items-center justify-between text-[10px] uppercase tracking-wider ${isDark ? "text-white/45" : "text-slate-500 font-semibold"}`}>
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" /> {c.eta || "Instant"}
                      </span>
                      {c.req && (
                        <span
                          className={`px-2 py-0.5 rounded-full border font-bold ${
                            isDark
                              ? (isGrad ? "border-white/10 bg-white/5 text-amber-300" : "border-white/10 bg-white/5 text-emerald-400/90")
                              : (isGrad ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-300 bg-emerald-50 text-emerald-900")
                          }`}
                        >
                          {c.req}
                        </span>
                      )}
                    </div>

                    <div className="mt-4 space-y-2">
                      <button
                        onClick={() => {
                          if (!c.key || processing === c.id || !canRequest) return;
                          setProcessing(c.id);
                          setStatus(null);
                          void requestStudentCertificate(c.key)
                            .then(async (response) => {
                              setStatus(response.message);
                              await refreshDashboard();
                            })
                            .catch((error) =>
                              setStatus(error instanceof Error ? error.message : "Could not request certificate"),
                            )
                            .finally(() => setProcessing(null));
                        }}
                        data-certificate-action
                        data-locked={isLocked}
                        data-pending={isPending || processing === c.id}
                        className={`w-full py-2.5 px-4 rounded-full text-xs font-bold uppercase tracking-wider text-white shadow-md transition flex items-center justify-center gap-2 ${
                          isGrad
                            ? "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700"
                            : "bg-[var(--grad-aurora)] hover:opacity-90"
                        } disabled:cursor-not-allowed disabled:opacity-70`}
                        disabled={processing === c.id || isPending || isReady || isLocked || isMeritRejected}
                      >
                        {processing === c.id ? (
                          <>
                            <Loader2 className="size-3.5 animate-spin" /> Processing...
                          </>
                        ) : isLocked ? (
                          <>
                            <Clock className="size-3.5" /> Locked Until Sem 4
                          </>
                        ) : isPending ? (
                          <>
                            <Clock className="size-3.5" /> Pending Admin Review
                          </>
                        ) : isMeritRejected ? (
                          <>
                            <Clock className="size-3.5" /> Rejected
                          </>
                        ) : isRejected ? (
                          <>
                            <ShieldCheck className="size-3.5" /> Resubmit Request
                          </>
                        ) : canRequest ? (
                          <>
                            <ShieldCheck className="size-3.5" /> Request Certificate
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="size-3.5 text-emerald-300" /> Ready / Conferred
                          </>
                        )}
                      </button>

                      <div className="flex items-center justify-between gap-1.5 pt-1 text-xs">
                        <button
                          title="View & Download PDF Certificate"
                          onClick={() => {
                            if (!c.key || processing === c.id || !canDownload) return;
                            setProcessing(c.id);
                            setStatus(null);
                            void openProtectedResource(`/api/student/certificates/${c.key}/file?download=true`, {
                              download: true,
                              fallbackName: `${c.name}.pdf`,
                            })
                              .then(async () => {
                                setStatus(`${c.name} downloaded successfully`);
                                await refreshDashboard();
                              })
                              .catch((error) =>
                                setStatus(error instanceof Error ? error.message : "Could not open certificate"),
                              )
                              .finally(() => setProcessing(null));
                          }}
                          className={`flex-1 py-1.5 px-2 rounded-xl flex items-center justify-center gap-1 text-[11px] font-bold border transition ${
                            canDownload
                              ? isDark
                                ? "glass border-white/10 text-white/80 hover:text-white"
                                : "bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200 shadow-2xs"
                              : "cursor-not-allowed opacity-50 " + (isDark ? "text-white/35" : "text-slate-400 bg-slate-100 border-slate-200")
                          }`}
                          disabled={processing === c.id || !canDownload}
                        >
                          <Download className="size-3 text-emerald-500" /> PDF
                        </button>

                        <button
                          title="Add Credential to LinkedIn"
                          onClick={() => shareToLinkedin(c.name)}
                          className={`flex-1 py-1.5 px-2 rounded-xl flex items-center justify-center gap-1 text-[11px] font-bold border transition ${
                            isDark
                              ? "glass border-white/10 text-sky-300/90 hover:text-sky-200"
                              : "bg-sky-50 border-sky-300 text-sky-900 hover:bg-sky-100 shadow-2xs"
                          }`}
                        >
                          <Linkedin className="size-3" /> LinkedIn
                        </button>

                        <a
                          title="Scan QR & Public Verify"
                          href={`/verify/CV-${(c.key || 'CERT').toUpperCase()}-2026`}
                          target="_blank"
                          rel="noreferrer"
                          className={`flex-1 py-1.5 px-2 rounded-xl flex items-center justify-center gap-1 text-[11px] font-bold border transition ${
                            isDark
                              ? "glass border-white/10 text-amber-300/90 hover:text-amber-200"
                              : "bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100 shadow-2xs"
                          }`}
                        >
                          <span className="text-[10px] font-bold">QR</span> Verify
                        </a>
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>
              );
            })}
          </div>

          <GlassCard className={`overflow-hidden ${!isDark ? "bg-white/95 border-slate-200 shadow-sm" : ""}`}>
            <div className={`text-[10px] uppercase tracking-[0.3em] font-bold ${isDark ? "text-white/40" : "text-slate-500"}`}>Request & Verification History</div>
            <div className={`font-display text-xl font-extrabold mt-1 mb-5 ${isDark ? "text-white" : "text-slate-950"}`}>Certificate request updates</div>
            <div className="max-h-[280px] space-y-3 overflow-y-auto pr-2" data-lenis-prevent>
              {history.length ? (
                history.map((r, i) => (
                  <motion.div
                    key={`${r.title}-${i}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={`flex items-center justify-between p-3 rounded-2xl transition ${
                      isDark ? "hover:bg-white/5" : "hover:bg-slate-100/80 border-b border-slate-100"
                    }`}
                  >
                    <div>
                      <div className={`font-bold text-sm ${isDark ? "text-white" : "text-slate-950"}`}>{r.title}</div>
                      <div className={`text-xs ${isDark ? "text-white/45" : "text-slate-600 font-medium"}`}>{r.updated}</div>
                    </div>
                    <span
                      className="text-[10px] uppercase tracking-[0.2em] px-3 py-1.5 rounded-full font-bold"
                      style={{
                        background: isDark ? "oklch(0.6 0.2 150 / 0.2)" : "#dcfce7",
                        color: isDark ? "oklch(0.85 0.18 150)" : "#14532d",
                        border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid #bbf7d0"
                      }}
                    >
                      {r.stage}
                    </span>
                  </motion.div>
                ))
              ) : (
                <div className={`rounded-2xl border border-dashed px-5 py-8 text-center text-sm font-medium ${
                  isDark ? "border-white/10 bg-white/[0.02] text-white/45" : "border-slate-300 bg-slate-50 text-slate-600"
                }`}>
                  No certificate request updates yet.
                </div>
              )}
            </div>
          </GlassCard>
        </>
      ) : (
        /* RESUME BUILDER SUB-TAB */
        <div className="space-y-8">
          {/* Template Selection Cards */}
          <div>
            <div className={`text-xs uppercase tracking-widest mb-3 font-bold ${isDark ? "text-white/50" : "text-slate-600"}`}>Choose Resume Template (3-4 Professional Designs)</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { id: "modern-tech", title: "Modern Tech", desc: "Gradient accent header, 2-column layout" },
                { id: "classic-academic", title: "Classic Academic", desc: "Formal serif, structured borders" },
                { id: "creative-minimal", title: "Creative Minimal", desc: "Sidebar contact info & timeline" },
                { id: "executive-ats", title: "Executive ATS", desc: "Single-column ATS parser ready" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplate(t.id as ResumeTemplate)}
                  className={`text-left p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                    selectedTemplate === t.id
                      ? isDark
                        ? "border-emerald-400 bg-emerald-500/10 shadow-[0_0_20px_rgba(52,211,153,0.2)]"
                        : "border-emerald-500 bg-emerald-50 text-emerald-950 font-extrabold shadow-xs"
                      : isDark
                        ? "border-white/10 glass hover:border-white/20 text-white"
                        : "border-slate-300 bg-white text-slate-950 hover:bg-slate-50 shadow-2xs"
                  }`}
                >
                  <div>
                    <div className={`font-display font-extrabold text-sm flex items-center justify-between ${isDark ? "text-white" : "text-slate-950"}`}>
                      {t.title}
                      {selectedTemplate === t.id && <CheckCircle2 className="size-4 text-emerald-500" />}
                    </div>
                    <div className={`text-xs mt-1 font-medium ${isDark ? "text-white/50" : "text-slate-600"}`}>{t.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Resume Form & Live Preview Grid */}
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Form Editor */}
            <GlassCard className={`space-y-6 ${!isDark ? "bg-white/95 border-slate-200 shadow-sm" : ""}`}>
              <div className={`flex items-center justify-between border-b pb-4 ${isDark ? "border-white/10" : "border-slate-200"}`}>
                <div className={`font-display text-lg font-extrabold flex items-center gap-2 ${isDark ? "text-white" : "text-slate-950"}`}>
                  <Edit3 className="size-4 text-indigo-600" /> Auto-Filled Student Data & Custom Editor
                </div>
                <button
                  onClick={() => setIsPreviewOpen(true)}
                  className={`px-4 py-2 rounded-full text-xs uppercase tracking-wider font-bold flex items-center gap-2 transition ${
                    isDark ? "glass text-white/80 hover:text-white" : "border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200 shadow-2xs"
                  }`}
                >
                  <Eye className="size-3.5" /> Full Screen Preview
                </button>
              </div>

              {/* Personal Details */}
              <div className="space-y-4">
                <div className={`text-xs uppercase tracking-wider font-bold ${isDark ? "text-white/40" : "text-slate-500"}`}>Auto-Filled Personal Info</div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className={`text-[10px] uppercase font-bold ${isDark ? "text-white/50" : "text-slate-600"}`}>Full Name</label>
                    <input
                      value={resumeData.name}
                      onChange={(e) => setResumeData({ ...resumeData, name: e.target.value })}
                      className={`w-full rounded-xl px-3 py-2 text-xs font-semibold outline-none ${
                        isDark ? "glass bg-transparent text-white" : "bg-slate-50 border border-slate-300 text-slate-950 focus:border-indigo-600"
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`text-[10px] uppercase font-bold ${isDark ? "text-white/50" : "text-slate-600"}`}>Email</label>
                    <input
                      value={resumeData.email}
                      onChange={(e) => setResumeData({ ...resumeData, email: e.target.value })}
                      className={`w-full rounded-xl px-3 py-2 text-xs font-semibold outline-none ${
                        isDark ? "glass bg-transparent text-white" : "bg-slate-50 border border-slate-300 text-slate-950 focus:border-indigo-600"
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`text-[10px] uppercase font-bold ${isDark ? "text-white/50" : "text-slate-600"}`}>Phone Number</label>
                    <input
                      value={resumeData.phone}
                      onChange={(e) => setResumeData({ ...resumeData, phone: e.target.value })}
                      className={`w-full rounded-xl px-3 py-2 text-xs font-semibold outline-none ${
                        isDark ? "glass bg-transparent text-white" : "bg-slate-50 border border-slate-300 text-slate-950 focus:border-indigo-600"
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`text-[10px] uppercase font-bold ${isDark ? "text-white/50" : "text-slate-600"}`}>Location</label>
                    <input
                      value={resumeData.location}
                      onChange={(e) => setResumeData({ ...resumeData, location: e.target.value })}
                      className={`w-full rounded-xl px-3 py-2 text-xs font-semibold outline-none ${
                        isDark ? "glass bg-transparent text-white" : "bg-slate-50 border border-slate-300 text-slate-950 focus:border-indigo-600"
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`text-[10px] uppercase font-bold ${isDark ? "text-white/50" : "text-slate-600"}`}>CGPA</label>
                    <input
                      value={resumeData.cgpa}
                      onChange={(e) => setResumeData({ ...resumeData, cgpa: e.target.value })}
                      className={`w-full rounded-xl px-3 py-2 text-xs font-semibold outline-none ${
                        isDark ? "glass bg-transparent text-white" : "bg-slate-50 border border-slate-300 text-slate-950 focus:border-indigo-600"
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`text-[10px] uppercase font-bold ${isDark ? "text-white/50" : "text-slate-600"}`}>Department</label>
                    <input
                      value={resumeData.department}
                      onChange={(e) => setResumeData({ ...resumeData, department: e.target.value })}
                      className={`w-full rounded-xl px-3 py-2 text-xs font-semibold outline-none ${
                        isDark ? "glass bg-transparent text-white" : "bg-slate-50 border border-slate-300 text-slate-950 focus:border-indigo-600"
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div>
                <label className={`text-[10px] uppercase font-bold ${isDark ? "text-white/50" : "text-slate-600"}`}>About Me / Summary</label>
                <textarea
                  rows={3}
                  value={resumeData.summary}
                  onChange={(e) => setResumeData({ ...resumeData, summary: e.target.value })}
                  className={`w-full rounded-xl p-3 text-xs font-semibold outline-none mt-1 ${
                    isDark ? "glass bg-transparent text-white" : "bg-slate-50 border border-slate-300 text-slate-950 focus:border-indigo-600"
                  }`}
                />
              </div>

              {/* Skills */}
              <div>
                <label className={`text-[10px] uppercase font-bold ${isDark ? "text-white/50" : "text-slate-600"}`}>Skills (Comma Separated)</label>
                <input
                  value={resumeData.skills}
                  onChange={(e) => setResumeData({ ...resumeData, skills: e.target.value })}
                  className={`w-full rounded-xl px-3 py-2 text-xs font-semibold outline-none mt-1 ${
                    isDark ? "glass bg-transparent text-white" : "bg-slate-50 border border-slate-300 text-slate-950 focus:border-indigo-600"
                  }`}
                />
              </div>

              {/* Projects List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`text-xs uppercase tracking-wider font-bold ${isDark ? "text-white/40" : "text-slate-500"}`}>Projects ({projects.length})</span>
                  <button
                    onClick={() =>
                      setProjects((current) => [
                        ...current,
                        { id: `p${Date.now()}`, title: "New Project", role: "Developer", tech: "React, Python", description: "Project description..." },
                      ])
                    }
                    type="button"
                    className="text-xs text-indigo-600 font-extrabold hover:underline flex items-center gap-1"
                  >
                    <Plus className="size-3" /> Add Project
                  </button>
                </div>
                {projects.map((p, idx) => (
                  <div key={p.id} className={`p-3 rounded-xl border space-y-2 relative ${
                    isDark ? "border-white/10 glass" : "border-slate-200 bg-slate-50 shadow-2xs"
                  }`}>
                    <button
                      type="button"
                      aria-label={`Delete ${p.title || "project"}`}
                      onClick={() => setProjects((current) => current.filter((x) => x.id !== p.id))}
                      className="absolute top-2 right-2 z-10 grid size-7 place-items-center rounded-lg text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-600"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                    <input
                      value={p.title}
                      onChange={(e) => {
                        const next = [...projects];
                        next[idx].title = e.target.value;
                        setProjects(next);
                      }}
                      placeholder="Project Title"
                      className={`w-full rounded-lg px-2 py-1 pr-9 text-xs font-bold outline-none ${
                        isDark ? "glass bg-transparent text-white" : "bg-white border border-slate-300 text-slate-950"
                      }`}
                    />
                    <input
                      value={p.tech}
                      onChange={(e) => {
                        const next = [...projects];
                        next[idx].tech = e.target.value;
                        setProjects(next);
                      }}
                      placeholder="Tech Stack"
                      className={`w-full rounded-lg px-2 py-1 text-xs font-medium outline-none ${
                        isDark ? "glass bg-transparent text-white/70" : "bg-white border border-slate-300 text-slate-800"
                      }`}
                    />
                    <textarea
                      rows={2}
                      value={p.description}
                      onChange={(e) => {
                        const next = [...projects];
                        next[idx].description = e.target.value;
                        setProjects(next);
                      }}
                      placeholder="Description"
                      className={`w-full rounded-lg p-2 text-xs font-medium outline-none ${
                        isDark ? "glass bg-transparent text-white/70" : "bg-white border border-slate-300 text-slate-800"
                      }`}
                    />
                  </div>
                ))}
              </div>

              {/* Achievements */}
              <div>
                <label className={`text-[10px] uppercase font-bold ${isDark ? "text-white/50" : "text-slate-600"}`}>Certifications & Achievements</label>
                <textarea
                  rows={3}
                  value={achievements}
                  onChange={(e) => setAchievements(e.target.value)}
                  className={`w-full rounded-xl p-3 text-xs font-semibold outline-none mt-1 ${
                    isDark ? "glass bg-transparent text-white" : "bg-slate-50 border border-slate-300 text-slate-950 focus:border-indigo-600"
                  }`}
                />
              </div>
            </GlassCard>

            {/* Live Template Preview Container */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className={`text-xs uppercase tracking-wider font-extrabold ${isDark ? "text-white/50" : "text-slate-700"}`}>Live Resume Render</span>
                <button
                  onClick={handlePrintPDF}
                  className="px-6 py-2.5 rounded-full bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-600 text-white text-xs uppercase tracking-widest font-extrabold flex items-center gap-2 shadow-md hover:opacity-90 transition"
                >
                  <Download className="size-3.5" /> Download Resume PDF
                </button>
              </div>

              {/* Resume Render Frame */}
              <div className="rounded-2xl bg-white text-gray-900 p-8 shadow-2xl overflow-hidden min-h-[600px] text-sm leading-relaxed" id="printable-resume">
                {selectedTemplate === "modern-tech" && (
                  <div className="space-y-6">
                    <div className="border-b-2 border-indigo-600 pb-4">
                      <h1 className="text-3xl font-bold text-gray-900">{resumeData.name}</h1>
                      <div className="text-indigo-600 font-semibold mt-1">{resumeData.department} | CGPA: {resumeData.cgpa}</div>
                      <div className="text-xs text-gray-600 mt-2 flex flex-wrap gap-3">
                        <span>📧 {resumeData.email}</span>
                        <span>📞 {resumeData.phone}</span>
                        <span>📍 {resumeData.location}</span>
                      </div>
                    </div>

                    <div>
                      <h2 className="text-xs font-bold uppercase tracking-widest text-indigo-600 mb-2">Summary</h2>
                      <p className="text-xs text-gray-700">{resumeData.summary}</p>
                    </div>

                    <div>
                      <h2 className="text-xs font-bold uppercase tracking-widest text-indigo-600 mb-2">Technical Skills</h2>
                      <p className="text-xs text-gray-800 font-medium">{resumeData.skills}</p>
                    </div>

                    <div>
                      <h2 className="text-xs font-bold uppercase tracking-widest text-indigo-600 mb-3">Key Projects</h2>
                      <div className="space-y-3">
                        {projects.map((p) => (
                          <div key={p.id}>
                            <div className="font-bold text-sm text-gray-900">{p.title}</div>
                            <div className="text-[11px] text-indigo-600 font-medium">{p.tech}</div>
                            <p className="text-xs text-gray-700 mt-1">{p.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h2 className="text-xs font-bold uppercase tracking-widest text-indigo-600 mb-2">Honors & Certifications</h2>
                      <p className="text-xs text-gray-700 whitespace-pre-line">{achievements}</p>
                    </div>
                  </div>
                )}

                {selectedTemplate === "classic-academic" && (
                  <div className="space-y-6 font-serif">
                    <div className="text-center border-b border-gray-400 pb-4">
                      <h1 className="text-3xl font-bold uppercase tracking-wide">{resumeData.name}</h1>
                      <div className="text-xs italic text-gray-700 mt-1">
                        {resumeData.department} • CGPA: {resumeData.cgpa}
                      </div>
                      <div className="text-xs text-gray-600 mt-2">
                        {resumeData.email} | {resumeData.phone} | {resumeData.location}
                      </div>
                    </div>

                    <div>
                      <h2 className="text-xs font-bold uppercase tracking-widest border-b border-gray-300 pb-1 mb-2">Academic Profile</h2>
                      <p className="text-xs text-gray-800">{resumeData.summary}</p>
                    </div>

                    <div>
                      <h2 className="text-xs font-bold uppercase tracking-widest border-b border-gray-300 pb-1 mb-2">Core Competencies</h2>
                      <p className="text-xs text-gray-800">{resumeData.skills}</p>
                    </div>

                    <div>
                      <h2 className="text-xs font-bold uppercase tracking-widest border-b border-gray-300 pb-1 mb-2">Projects & Research</h2>
                      <div className="space-y-3">
                        {projects.map((p) => (
                          <div key={p.id}>
                            <div className="font-bold text-sm">{p.title}</div>
                            <div className="text-xs italic text-gray-600">{p.tech}</div>
                            <p className="text-xs text-gray-800 mt-1">{p.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {selectedTemplate === "creative-minimal" && (
                  <div className="grid grid-cols-3 gap-6">
                    <div className="col-span-1 bg-gray-100 p-4 rounded-xl space-y-4">
                      <div>
                        <h1 className="text-xl font-bold">{resumeData.name}</h1>
                        <div className="text-xs text-emerald-600 font-semibold mt-1">{resumeData.department}</div>
                      </div>
                      <div className="text-xs space-y-1 text-gray-600">
                        <div>📧 {resumeData.email}</div>
                        <div>📞 {resumeData.phone}</div>
                        <div>📍 {resumeData.location}</div>
                        <div className="font-bold text-gray-900 mt-2">CGPA: {resumeData.cgpa}</div>
                      </div>
                      <div>
                        <div className="text-xs font-bold text-gray-900 uppercase">Skills</div>
                        <div className="text-xs text-gray-700 mt-1">{resumeData.skills}</div>
                      </div>
                    </div>

                    <div className="col-span-2 space-y-5">
                      <div>
                        <h2 className="text-xs font-bold text-emerald-600 uppercase tracking-widest">About Me</h2>
                        <p className="text-xs text-gray-700 mt-1">{resumeData.summary}</p>
                      </div>
                      <div>
                        <h2 className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Projects</h2>
                        <div className="space-y-3 mt-2">
                          {projects.map((p) => (
                            <div key={p.id} className="border-l-2 border-emerald-500 pl-3">
                              <div className="font-bold text-xs">{p.title}</div>
                              <div className="text-[10px] text-gray-500">{p.tech}</div>
                              <p className="text-xs text-gray-700 mt-1">{p.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {selectedTemplate === "executive-ats" && (
                  <div className="space-y-5">
                    <div className="border-b pb-3">
                      <h1 className="text-2xl font-bold uppercase">{resumeData.name}</h1>
                      <div className="text-xs text-gray-600 font-medium">
                        {resumeData.email} | {resumeData.phone} | {resumeData.location} | CGPA: {resumeData.cgpa}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-gray-900 border-b mb-2">Professional Summary</div>
                      <p className="text-xs text-gray-800">{resumeData.summary}</p>
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-gray-900 border-b mb-2">Skills & Technologies</div>
                      <p className="text-xs text-gray-800">{resumeData.skills}</p>
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-gray-900 border-b mb-2">Key Projects</div>
                      {projects.map((p) => (
                        <div key={p.id} className="mb-2">
                          <div className="font-semibold text-xs">{p.title} — <span className="font-normal italic">{p.tech}</span></div>
                          <p className="text-xs text-gray-700">{p.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {isPreviewOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 md:p-8">
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-8 shadow-2xl relative text-gray-900">
            <div className="flex items-center justify-between border-b pb-4 mb-6">
              <span className="text-xs uppercase tracking-widest text-indigo-600 font-bold">Full Screen Resume Preview</span>
              <button
                onClick={() => setIsPreviewOpen(false)}
                className="px-4 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold transition"
              >
                ✕ Close Preview
              </button>
            </div>

            <div className="p-2">
              {selectedTemplate === "modern-tech" && (
                <div className="space-y-6 bg-white p-6 rounded-2xl border">
                  <div className="bg-indigo-600 -mx-6 -mt-6 p-6 text-white rounded-t-2xl shadow-sm">
                    <h1 className="text-3xl font-bold">{resumeData.name}</h1>
                    <div className="text-indigo-200 font-semibold text-sm mt-1">{resumeData.department} &nbsp;|&nbsp; CGPA: {resumeData.cgpa}</div>
                    <div className="text-xs text-indigo-100 mt-2 flex flex-wrap gap-4">
                      <span>📧 {resumeData.email}</span>
                      <span>📞 {resumeData.phone}</span>
                      <span>📍 {resumeData.location}</span>
                    </div>
                  </div>
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-600 border-b border-indigo-200 pb-1 mb-2">Summary</h2>
                    <p className="text-xs text-gray-700 leading-relaxed">{resumeData.summary}</p>
                  </div>
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-600 border-b border-indigo-200 pb-1 mb-2">Technical Skills &amp; Tools</h2>
                    <p className="text-xs text-gray-700 leading-relaxed">{resumeData.skills}</p>
                  </div>
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-600 border-b border-indigo-200 pb-1 mb-2">Featured Projects</h2>
                    <div className="space-y-3">
                      {projects.map((p) => (
                        <div key={p.id} className="border-l-2 border-indigo-500 pl-3">
                          <div className="font-bold text-xs text-gray-900">{p.title} <span className="text-indigo-600 font-normal italic">({p.tech})</span></div>
                          <p className="text-xs text-gray-700 mt-1">{p.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  {achievements && (
                    <div>
                      <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-600 border-b border-indigo-200 pb-1 mb-2">Honors &amp; Certifications</h2>
                      <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">{achievements}</p>
                    </div>
                  )}
                </div>
              )}

              {selectedTemplate === "creative-minimal" && (
                <div className="grid grid-cols-3 gap-6 bg-white p-2">
                  <div className="col-span-1 bg-emerald-50/80 p-5 rounded-2xl border border-emerald-100 space-y-5">
                    <div>
                      <h1 className="text-xl font-bold text-emerald-950">{resumeData.name}</h1>
                      <div className="text-xs text-emerald-700 font-semibold mt-1">{resumeData.department}</div>
                      <div className="text-xs text-emerald-600 font-bold mt-1">CGPA: {resumeData.cgpa}</div>
                    </div>
                    <div className="text-xs space-y-2 text-emerald-900">
                      <div className="text-[10px] uppercase font-bold text-emerald-700 tracking-wider">Contact</div>
                      <div className="break-all">📧 {resumeData.email}</div>
                      <div>📞 {resumeData.phone}</div>
                      <div>📍 {resumeData.location}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-bold text-emerald-700 tracking-wider mb-2">Skills &amp; Tech</div>
                      <div className="text-xs text-emerald-900 space-y-1">
                        {resumeData.skills.split(',').map((s, idx) => (
                          <div key={idx} className="bg-emerald-100/60 px-2 py-0.5 rounded text-[11px] font-medium text-emerald-800 inline-block mr-1 mb-1">
                            • {s.trim()}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="col-span-2 space-y-5 p-2">
                    <div>
                      <h2 className="text-xs font-bold text-emerald-700 uppercase tracking-widest border-b border-emerald-200 pb-1">About Me</h2>
                      <p className="text-xs text-gray-700 mt-2 leading-relaxed">{resumeData.summary}</p>
                    </div>
                    <div>
                      <h2 className="text-xs font-bold text-emerald-700 uppercase tracking-widest border-b border-emerald-200 pb-1">Key Projects</h2>
                      <div className="space-y-3 mt-3">
                        {projects.map((p) => (
                          <div key={p.id} className="border-l-2 border-emerald-500 pl-3">
                            <div className="font-bold text-xs text-gray-900">{p.title}</div>
                            <div className="text-[10px] text-emerald-600 font-medium italic">{p.tech}</div>
                            <p className="text-xs text-gray-700 mt-1">{p.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    {achievements && (
                      <div>
                        <h2 className="text-xs font-bold text-emerald-700 uppercase tracking-widest border-b border-emerald-200 pb-1">Honors &amp; Certifications</h2>
                        <p className="text-xs text-gray-700 mt-2 whitespace-pre-line leading-relaxed">{achievements}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedTemplate === "classic-academic" && (
                <div className="space-y-6 font-serif bg-white p-6 rounded-2xl border">
                  <div className="text-center border-b-2 border-slate-900 pb-4">
                    <h1 className="text-3xl font-bold text-slate-900 tracking-wide uppercase">{resumeData.name}</h1>
                    <div className="text-sm font-semibold text-slate-800 mt-1">{resumeData.department} &nbsp;&bull;&nbsp; Cumulative CGPA: {resumeData.cgpa}</div>
                    <div className="text-xs text-slate-600 mt-1">
                      {resumeData.email} &nbsp;|&nbsp; {resumeData.phone} &nbsp;|&nbsp; {resumeData.location}
                    </div>
                  </div>
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1 mb-2 font-sans">Academic Profile &amp; Summary</h2>
                    <p className="text-xs text-slate-800 leading-relaxed">{resumeData.summary}</p>
                  </div>
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1 mb-2 font-sans">Areas of Expertise &amp; Technical Skills</h2>
                    <p className="text-xs text-slate-800 leading-relaxed">{resumeData.skills}</p>
                  </div>
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1 mb-2 font-sans">Research &amp; Academic Projects</h2>
                    <div className="space-y-3">
                      {projects.map((p) => (
                        <div key={p.id}>
                          <div className="font-bold text-xs text-slate-900">• {p.title} &mdash; <span className="font-normal italic text-slate-700">({p.tech})</span></div>
                          <p className="text-xs text-slate-700 mt-0.5 pl-3">{p.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  {achievements && (
                    <div>
                      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1 mb-2 font-sans">Honors, Scholarships &amp; Certifications</h2>
                      <p className="text-xs text-slate-800 whitespace-pre-line leading-relaxed">{achievements}</p>
                    </div>
                  )}
                </div>
              )}

              {selectedTemplate === "executive-ats" && (
                <div className="space-y-5 bg-white p-6 rounded-2xl border">
                  <div className="h-1.5 bg-slate-900 -mx-6 -mt-6 rounded-t-2xl mb-4" />
                  <div className="border-b border-slate-300 pb-3">
                    <h1 className="text-2xl font-bold uppercase text-slate-900 tracking-tight">{resumeData.name}</h1>
                    <div className="text-xs text-slate-800 font-bold mt-1">{resumeData.department} &nbsp;|&nbsp; CGPA: {resumeData.cgpa}</div>
                    <div className="text-xs text-slate-600 mt-1 font-mono">
                      Email: {resumeData.email} | Phone: {resumeData.phone} | Location: {resumeData.location}
                    </div>
                  </div>
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1 mb-2">Professional Summary</h2>
                    <p className="text-xs text-slate-800 leading-relaxed">{resumeData.summary}</p>
                  </div>
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1 mb-2">Core Competencies &amp; Skills</h2>
                    <p className="text-xs text-slate-800 leading-relaxed">{resumeData.skills}</p>
                  </div>
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1 mb-2">Key Projects &amp; Implementations</h2>
                    <div className="space-y-3">
                      {projects.map((p) => (
                        <div key={p.id}>
                          <div className="font-bold text-xs text-slate-900">{p.title} &nbsp;&bull;&nbsp; <span className="font-normal italic text-slate-600">{p.tech}</span></div>
                          <p className="text-xs text-slate-700 mt-0.5">{p.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  {achievements && (
                    <div>
                      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1 mb-2">Honors &amp; Certifications</h2>
                      <p className="text-xs text-slate-800 whitespace-pre-line leading-relaxed">{achievements}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </PageTransition>
  );
}
