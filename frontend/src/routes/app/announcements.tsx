import { createFileRoute } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  Pin,
  Search,
  Bell,
  X,
  CheckCircle2,
  Share2,
  Calendar,
  Briefcase,
  AlertTriangle,
  BookOpen,
  Sparkles,
  Megaphone,
  Star,
  Eye,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { GlassCard, PageTransition, SectionHeading } from "@/components/app/cinematic";
import { type StudentDashboard } from "@/lib/api";
import { useStudentDashboard } from "@/lib/student-session";
import { getStoredUser } from "@/lib/auth";
import { useTheme } from "@/lib/theme";


export const Route = createFileRoute("/app/announcements")({ component: AnnouncementsPage });

type Announcement = StudentDashboard["announcements"][number] & {
  audience?: string;
  reads?: number;
};

const categoryIcons: Record<string, any> = {
  Exam: AlertTriangle,
  Placement: Briefcase,
  Academic: BookOpen,
  Events: Sparkles,
  Default: Bell,
};

const getCategoryColors = (category: string, isDark: boolean) => {
  if (isDark) {
    const darkMap: Record<string, { bg: string; text: string; border: string }> = {
      Exam: { bg: "rgba(239, 68, 68, 0.15)", text: "#f87171", border: "rgba(239, 68, 68, 0.3)" },
      Placement: { bg: "rgba(76, 175, 80, 0.15)", text: "#d8efbc", border: "rgba(216, 239, 188, 0.3)" },
      Events: { bg: "rgba(251, 191, 36, 0.15)", text: "#fbbf24", border: "rgba(251, 191, 36, 0.3)" },
      Academic: { bg: "rgba(143, 186, 124, 0.15)", text: "#bfe6a8", border: "rgba(216, 239, 188, 0.28)" },
      Default: { bg: "rgba(52, 211, 153, 0.15)", text: "#34d399", border: "rgba(52, 211, 153, 0.3)" },
    };
    return darkMap[category] || darkMap.Default;
  } else {
    const lightMap: Record<string, { bg: string; text: string; border: string }> = {
      Exam: { bg: "#fee2e2", text: "#991b1b", border: "#fca5a5" },
      Placement: { bg: "#ecf8e6", text: "#1f7a32", border: "#a5d6a7" },
      Events: { bg: "#fef3c7", text: "#92400e", border: "#fde68a" },
      Academic: { bg: "#f0f8e9", text: "#2f8f46", border: "#bde0aa" },
      Default: { bg: "#dcfce7", text: "#166534", border: "#86efac" },
    };
    return lightMap[category] || lightMap.Default;
  }
};

function AnnouncementsPage() {
  const { theme } = useTheme();
  const { dashboard } = useStudentDashboard();
  const isDark = theme === "dark";
  const rawAnnouncements = dashboard?.announcements ?? [];
  const user = getStoredUser();

  const [announcements, setAnnouncements] = useState<Announcement[]>(rawAnnouncements);
  const [bookmarkedIds, setBookmarkedIds] = useState<number[]>([]);
  const [acknowledgedIds, setAcknowledgedIds] = useState<number[]>([]);
  const [reactions, setReactions] = useState<Record<number, { useful: number; helpful: number }>>({});
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [active, setActive] = useState<Announcement | null>(null);
  const [copied, setCopied] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"newest" | "popular" | "pinned">("newest");

  const currentList = announcements.length ? announcements : rawAnnouncements;

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: currentList.length, "⭐ Saved": bookmarkedIds.length };
    currentList.forEach((a) => {
      counts[a.category] = (counts[a.category] || 0) + 1;
    });
    return counts;
  }, [currentList, bookmarkedIds]);

  const categories = useMemo(() => {
    const list = Array.from(new Set(currentList.map((a) => a.category)));
    return ["All", "⭐ Saved", ...list];
  }, [currentList]);

  const filteredItems = useMemo(() => {
    let list = currentList.filter((a) => {
      const matchesSearch =
        a.title.toLowerCase().includes(q.toLowerCase()) || a.body.toLowerCase().includes(q.toLowerCase());
      if (cat.startsWith("⭐ Saved")) return bookmarkedIds.includes(a.id) && matchesSearch;
      if (cat === "All") return matchesSearch;
      return a.category === cat && matchesSearch;
    });

    if (sortBy === "popular") {
      list = [...list].sort((a, b) => ((b as any).reads || 0) - ((a as any).reads || 0));
    } else if (sortBy === "pinned") {
      list = [...list].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    }
    return list;
  }, [currentList, q, cat, bookmarkedIds, sortBy]);

  const pinned = useMemo(() => filteredItems.filter((a) => a.pinned), [filteredItems]);
  const rest = useMemo(() => filteredItems.filter((a) => !a.pinned), [filteredItems]);
  const unreadCount = useMemo(() => currentList.filter((a) => a.unread).length, [currentList]);

  function toggleBookmark(id: number, e?: React.MouseEvent) {
    e?.stopPropagation();
    setBookmarkedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function toggleAcknowledge(id: number) {
    setAcknowledgedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function toggleReaction(id: number, type: "useful" | "helpful") {
    setReactions((prev) => {
      const current = prev[id] || { useful: 14, helpful: 8 };
      return {
        ...prev,
        [id]: { ...current, [type]: current[type] + 1 },
      };
    });
  }

  function handleDownloadCircular(a: Announcement) {
    const text = `=========================================================\nCAMPUSVERSE OFFICIAL CIRCULAR\n=========================================================\n\nNotice Title: ${a.title}\nCategory: ${a.category}\nDate: ${a.time}\nTarget Audience: ${a.audience || "All Students"}\nIssued By: Office of Academic Registrar\n\n---------------------------------------------------------\nCONTENT / DIRECTIVE:\n---------------------------------------------------------\n${a.body}\n\n=========================================================\nVerify authentic status at campusverse.edu/verify\n=========================================================`;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Official_Circular_${a.title.replace(/\s+/g, "_")}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setStatusMsg("Circular downloaded successfully!");
    setTimeout(() => setStatusMsg(null), 3000);
  }

  function markAllAsRead() {
    setAnnouncements(announcements.map((a) => ({ ...a, unread: false })));
    setStatusMsg("All announcements marked as read");
    setTimeout(() => setStatusMsg(null), 3000);
  }

  function handleOpenDetail(a: Announcement) {
    setActive(a);
    const current = announcements.length ? announcements : rawAnnouncements;
    const updated: Announcement[] = current.map((item: Announcement) =>
      item.id === a.id ? { ...item, unread: false, reads: ((item.reads || 184) + 1) } : item
    );
    setAnnouncements(updated);
  }

  function handleShare(a: Announcement) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(`${a.title}\n\n${a.body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <PageTransition>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <SectionHeading
          eyebrow="Notices & Directives"
          title="Announcements"
          sub="Official campus notices, academic schedules, and department circulars."
        />

        <div className="flex items-center gap-3 self-start md:self-auto">
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className={`glass flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-wider transition shadow-sm ${
                isDark
                  ? "border-emerald-400/30 text-emerald-300 hover:bg-emerald-500/15"
                  : "border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-50 font-bold"
              }`}
            >
              <CheckCircle2 className="size-3.5" /> Mark All Read ({unreadCount})
            </button>
          )}
        </div>
      </div>

      {statusMsg && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mb-4 rounded-2xl border px-4 py-3 text-xs font-semibold flex items-center justify-between ${
            isDark ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-emerald-300 bg-emerald-50 text-emerald-900 font-bold"
          }`}
        >
          <span>✓ {statusMsg}</span>
          <button onClick={() => setStatusMsg(null)} className="opacity-60 hover:opacity-100">✕</button>
        </motion.div>
      )}

      {/* Toolbar & Filter Bar */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className={`absolute left-4 top-1/2 size-4 -translate-y-1/2 ${isDark ? "text-white/40" : "text-slate-500"}`} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search announcements by title or content..."
            className={`w-full rounded-full py-3 pl-11 pr-4 text-sm focus:outline-none transition ${
              isDark
                ? "glass placeholder-white/30 focus:border-white/30 text-white"
                : "border border-slate-300 bg-white text-slate-950 placeholder:text-slate-500 font-semibold focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 shadow-sm"
            }`}
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 [ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider transition whitespace-nowrap flex items-center gap-1.5 ${
                cat === c
                  ? "border border-[#d8efbc]/70 bg-[#d8efbc] font-extrabold text-[#101417] shadow-[0_0_18px_rgba(76,175,80,0.28)]"
                  : isDark
                    ? "border border-white/10 bg-white/[0.04] text-white/70 hover:border-[#d8efbc]/40 hover:bg-white/[0.08] hover:text-[#d8efbc]"
                    : "border border-[#a5d6a7] bg-white text-slate-700 hover:bg-[#ecf8e6] hover:text-[#1f7a32] font-bold shadow-sm"
              }`}
            >
              <span>{c}</span>
              <span className={`text-[10px] font-extrabold ${cat === c ? "text-[#101417]/85" : isDark ? "text-white/50" : "text-slate-600"}`}>({categoryCounts[c] || 0})</span>
            </button>
          ))}

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className={`shrink-0 cursor-pointer rounded-full border px-3.5 py-2 text-xs font-semibold outline-none transition ${
              isDark
                ? "border-white/10 bg-[#0d0d12] text-white/90"
                : "border-slate-300 bg-white text-slate-900 shadow-sm font-bold hover:border-indigo-500"
            }`}
          >
            <option value="newest" style={{ backgroundColor: isDark ? "#0d0d12" : "#ffffff", color: isDark ? "#ffffff" : "#0f172a" }}>Newest First</option>
            <option value="popular" style={{ backgroundColor: isDark ? "#0d0d12" : "#ffffff", color: isDark ? "#ffffff" : "#0f172a" }}>Most Read</option>
            <option value="pinned" style={{ backgroundColor: isDark ? "#0d0d12" : "#ffffff", color: isDark ? "#ffffff" : "#0f172a" }}>Pinned First</option>
          </select>
        </div>
      </div>

      {/* Pinned Announcements Hero Grid */}
      {pinned.length > 0 && (
        <div className="mb-8">
          <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.3em] text-amber-400">
            <Pin className="size-3.5" /> Pinned Official Announcements
          </div>
          <div className="grid md:grid-cols-2 gap-5">
            {pinned.map((a) => (
              <AnnouncementCard
                key={a.id}
                a={a}
                isPinned
                isBookmarked={bookmarkedIds.includes(a.id)}
                onBookmark={(e) => toggleBookmark(a.id, e)}
                onClick={() => handleOpenDetail(a)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Timeline List of Announcements */}
      <div className="relative pl-6">
        <div className={`absolute bottom-0 left-2 top-0 w-px ${isDark ? "bg-gradient-to-b from-white/30 via-white/10 to-transparent" : "bg-gradient-to-b from-slate-300 via-slate-200 to-transparent"}`} />
        <div className="space-y-4">
          {rest.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="relative"
            >
              <span
                className={`absolute -left-[18px] top-6 size-3 rounded-full border-2 ${isDark ? "border-[#0a0a0a]" : "border-white"}`}
                style={{ background: a.unread ? "oklch(0.75 0.22 150)" : "oklch(0.4 0 0)" }}
              />
              <AnnouncementCard
                a={a}
                isBookmarked={bookmarkedIds.includes(a.id)}
                onBookmark={(e) => toggleBookmark(a.id, e)}
                onClick={() => handleOpenDetail(a)}
              />
            </motion.div>
          ))}
          {filteredItems.length === 0 && (
            <GlassCard className="text-center py-12 space-y-3">
              <div className={`mx-auto flex size-14 items-center justify-center rounded-2xl border ${isDark ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-white/80"}`}>
                <Megaphone className="size-6 text-fuchsia-300/60" />
              </div>
              <div className={`text-sm font-semibold ${isDark ? "text-white/90" : "text-slate-900"}`}>No Announcements Found</div>
              <div className={`mx-auto max-w-sm text-xs ${isDark ? "text-white/40" : "text-slate-500"}`}>
                No campus notices match your search query or selected category filter.
              </div>
            </GlassCard>
          )}
        </div>
      </div>

      {/* Announcement Full Detail Modal */}
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActive(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl rounded-3xl border border-white/15 bg-[#11131a] p-8 text-white relative shadow-2xl space-y-5"
            >
              <button
                onClick={() => setActive(null)}
                className="absolute top-6 right-6 text-white/50 hover:text-white glass p-2 rounded-full transition"
              >
                <X className="size-5" />
              </button>

              <div className="flex items-center gap-3 flex-wrap">
                {(() => {
                  const activeColors = getCategoryColors(active.category, isDark);
                  return (
                    <span
                      className="text-[10px] uppercase tracking-widest px-3 py-1 rounded-full font-bold border"
                      style={{
                        backgroundColor: activeColors.bg,
                        color: activeColors.text,
                        borderColor: activeColors.border,
                      }}
                    >
                      {active.category}
                    </span>
                  );
                })()}
                <span className="text-xs text-white/40">• {active.time}</span>
                {active.pinned && (
                  <span className="text-[10px] uppercase tracking-wider text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 rounded-full flex items-center gap-1 font-semibold">
                    <Pin className="size-3" /> Pinned
                  </span>
                )}
                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <Users className="size-3" /> {active.audience || "All Students"}
                </span>
              </div>

              <h3 className="font-display text-2xl md:text-3xl leading-snug font-bold">{active.title}</h3>

              <div className="glass rounded-2xl p-5 text-sm text-white/80 leading-relaxed whitespace-pre-wrap border border-white/10">
                {active.body}
              </div>

              {/* Notice Action Bar & Attachments */}
              <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleAcknowledge(active.id)}
                    className={`px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider transition flex items-center gap-1.5 ${
                      acknowledgedIds.includes(active.id)
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : "glass text-white/80 hover:text-white border border-white/10"
                    }`}
                  >
                    <CheckCircle2 className="size-3.5" />
                    {acknowledgedIds.includes(active.id) ? "Acknowledged ✓" : "Mark Acknowledged"}
                  </button>

                  <button
                    onClick={() => handleDownloadCircular(active)}
                    className="glass px-4 py-2 rounded-full text-xs font-medium text-amber-300 border border-amber-500/30 hover:bg-amber-500/10 flex items-center gap-1.5 transition"
                  >
                    📄 Download Circular
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleReaction(active.id, "useful")}
                    className="glass px-3 py-1.5 rounded-full text-xs text-white/70 hover:text-white flex items-center gap-1 transition"
                  >
                    👍 Helpful ({reactions[active.id]?.useful || 14})
                  </button>
                  <button
                    onClick={() => handleShare(active)}
                    className="glass px-4 py-2 rounded-full text-xs font-medium text-white/80 hover:text-white flex items-center gap-2 transition"
                  >
                    <Share2 className="size-3.5" /> {copied ? "Copied!" : "Share"}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-white/10 text-xs text-white/40 font-mono">
                <span>Issued by: Office of Academic Registrar</span>
                <span className="flex items-center gap-1 text-white/50"><Eye className="size-3" /> {typeof active.reads === "number" && active.reads > 0 ? `${active.reads} Reads` : "Official Circular"}</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}

function AnnouncementCard({
  a,
  isPinned,
  isBookmarked,
  onBookmark,
  onClick,
}: {
  a: Announcement;
  isPinned?: boolean;
  isBookmarked?: boolean;
  onBookmark?: (e: React.MouseEvent) => void;
  onClick?: () => void;
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const IconComponent = categoryIcons[a.category] || categoryIcons.Default;
  const colors = getCategoryColors(a.category, isDark);

  return (
    <GlassCard
      hover
      onClick={onClick}
      className={`cursor-pointer group transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
        isPinned
          ? isDark
            ? "border-amber-400/50 bg-gradient-to-r from-amber-500/10 to-transparent"
            : "border-amber-400 bg-amber-50/70 shadow-sm"
          : isDark
            ? "hover:border-white/20"
            : "border-slate-200 bg-white/95 hover:border-indigo-400 shadow-sm"
      }`}
    >
      <div className="flex items-start gap-4">
        <div
          className="size-11 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300 border shadow-md"
          style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }}
        >
          <IconComponent className="size-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-[10px] uppercase tracking-wider font-bold px-2.5 py-0.5 rounded-full border shadow-xs"
                style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }}
              >
                {a.category}
              </span>
              <span className={`text-[10px] ${isDark ? "text-white/30" : "text-slate-400"}`}>•</span>
              <span className={`text-[10px] font-bold ${isDark ? "text-white/60" : "text-slate-700"}`}>{a.time}</span>
              {a.unread && (
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-extrabold shadow-sm animate-pulse"
                  style={{
                    background: isDark ? "rgba(76, 175, 80, 0.22)" : "#ecf8e6",
                    color: isDark ? "#d8efbc" : "#1f7a32",
                  }}
                >
                  NEW
                </span>
              )}
            </div>

            <button
              onClick={onBookmark}
              title={isBookmarked ? "Remove Bookmark" : "Save Notice"}
              className={`transition ${isDark ? "text-white/40 hover:text-amber-300" : "text-slate-500 hover:text-amber-600"}`}
            >
              <Star className={`size-4 ${isBookmarked ? "fill-amber-400 text-amber-400" : ""}`} />
            </button>
          </div>

          <div className={`font-display font-bold text-base transition-colors leading-snug ${
            isDark ? "text-white group-hover:text-amber-200" : "text-slate-950 group-hover:text-indigo-700 font-extrabold"
          }`}>
            {a.title}
          </div>

          <p className={`text-xs mt-1.5 line-clamp-2 leading-relaxed font-semibold transition-colors ${
            isDark ? "text-white/70 group-hover:text-white/90" : "text-slate-800 group-hover:text-slate-950"
          }`}>
            {a.body}
          </p>

          <div className={`mt-3 flex items-center gap-3 text-[10px] border-t pt-2 font-mono ${
            isDark ? "border-white/10 text-white/50" : "border-slate-200 text-slate-700 font-bold"
          }`}>
            <span className="flex items-center gap-1"><Users className={`size-3 ${isDark ? "text-white/50" : "text-slate-600"}`} /> {a.audience || "All Students"}</span>
            <span>•</span>
            <span className="flex items-center gap-1"><Eye className={`size-3 ${isDark ? "text-white/50" : "text-slate-600"}`} /> {typeof a.reads === "number" && a.reads > 0 ? `${a.reads} Reads` : "Official Circular"}</span>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
