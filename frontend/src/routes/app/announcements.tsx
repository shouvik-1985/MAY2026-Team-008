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

const categoryColors: Record<string, { bg: string; text: string; border: string }> = {
  Exam: { bg: "rgba(239, 68, 68, 0.15)", text: "#f87171", border: "rgba(239, 68, 68, 0.3)" },
  Placement: { bg: "rgba(56, 189, 248, 0.15)", text: "#38bdf8", border: "rgba(56, 189, 248, 0.3)" },
  Events: { bg: "rgba(251, 191, 36, 0.15)", text: "#fbbf24", border: "rgba(251, 191, 36, 0.3)" },
  Academic: { bg: "rgba(168, 85, 247, 0.15)", text: "#c084fc", border: "rgba(168, 85, 247, 0.3)" },
  Default: { bg: "rgba(52, 211, 153, 0.15)", text: "#34d399", border: "rgba(52, 211, 153, 0.3)" },
};

function AnnouncementsPage() {
  const { dashboard } = useStudentDashboard();
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

  const pinned = filteredItems.filter((a) => a.pinned);
  const rest = filteredItems.filter((a) => !a.pinned);
  const unreadCount = currentList.filter((a) => a.unread).length;
  const urgentItem = currentList.find((a) => a.category === "Exam" || a.category === "Urgent");

  function toggleBookmark(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (bookmarkedIds.includes(id)) {
      setBookmarkedIds(bookmarkedIds.filter((x) => x !== id));
      setStatusMsg("Notice removed from saved items");
    } else {
      setBookmarkedIds([...bookmarkedIds, id]);
      setStatusMsg("Notice saved to ⭐ Bookmarked");
    }
    setTimeout(() => setStatusMsg(null), 2500);
  }

  function toggleAcknowledge(id: number) {
    if (acknowledgedIds.includes(id)) {
      setAcknowledgedIds(acknowledgedIds.filter((x) => x !== id));
      setStatusMsg("Acknowledgment removed");
    } else {
      setAcknowledgedIds([...acknowledgedIds, id]);
      setStatusMsg("✓ You have acknowledged reading this notice!");
    }
    setTimeout(() => setStatusMsg(null), 3000);
  }

  function toggleReaction(id: number, type: "useful" | "helpful") {
    setReactions((prev) => {
      const current = prev[id] || { useful: 12, helpful: 8 };
      return {
        ...prev,
        [id]: {
          ...current,
          [type]: current[type] + 1,
        },
      };
    });
    setStatusMsg(`Thanks for your feedback! 👍`);
    setTimeout(() => setStatusMsg(null), 2000);
  }

  function handleDownloadCircular(a: Announcement) {
    const text = `OFFICIAL UNIVERSITY NOTICE / CIRCULAR\n\nTitle: ${a.title}\nCategory: ${a.category}\nAudience: ${a.audience || "All Students"}\nTime: ${a.time}\n\n${a.body}\n\nIssued by: Office of Academic Registrar\nCampusVerse Digital Governance Registry`;
    const blob = new Blob([text], { type: "text/plain" });
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
              className="glass px-4 py-2 rounded-full text-xs font-mono font-medium uppercase tracking-wider text-emerald-300 border border-emerald-400/30 hover:bg-emerald-500/15 transition flex items-center gap-1.5 shadow-[0_0_10px_rgba(52,211,153,0.15)]"
            >
              <CheckCircle2 className="size-3.5" /> Mark All Read ({unreadCount})
            </button>
          )}
        </div>
      </div>

      {/* High-Alert Urgent Marquee Banner */}
      {urgentItem && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-red-500/20 via-amber-500/10 to-transparent border border-red-500/30 flex items-center justify-between flex-wrap gap-3 shadow-lg"
        >
          <div className="flex items-center gap-3">
            <span className="size-3 rounded-full bg-red-500 animate-ping" />
            <span className="text-xs font-bold uppercase tracking-wider text-red-400">URGENT NOTICE:</span>
            <span className="text-xs text-white/90 font-medium line-clamp-1">{urgentItem.title}</span>
          </div>
          <button
            onClick={() => handleOpenDetail(urgentItem)}
            className="glass px-3.5 py-1.5 rounded-full text-[11px] font-bold text-red-300 hover:text-white border border-red-500/30 transition shrink-0"
          >
            View Urgent Notice &rarr;
          </button>
        </motion.div>
      )}

      {statusMsg && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 px-4 py-3 rounded-2xl glass border border-emerald-400/30 text-emerald-300 text-xs font-medium flex items-center gap-2"
        >
          <Sparkles className="size-4 shrink-0" />
          <span>{statusMsg}</span>
        </motion.div>
      )}

      {/* Search & Category Filtering Bar */}
      <div className="flex flex-col md:flex-row gap-3 mb-8">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-white/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search announcements by title or content..."
            className="w-full glass rounded-full pl-11 pr-4 py-3 text-sm placeholder-white/30 focus:outline-none focus:border-white/30"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 [ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`px-4 py-2 rounded-full text-xs font-mono uppercase tracking-wider transition whitespace-nowrap flex items-center gap-1.5 ${
                cat === c ? "text-white font-semibold shadow-lg bg-gradient-to-r from-fuchsia-600 via-purple-600 to-cyan-600" : "text-white/50 hover:text-white bg-white/[0.04] border border-white/10"
              }`}
            >
              <span>{c}</span>
              <span className="text-[10px] opacity-75 font-bold">({categoryCounts[c] || 0})</span>
            </button>
          ))}

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="glass rounded-full px-3.5 py-2 text-xs font-mono text-white/80 outline-none bg-[#0d0d12] border border-white/10 cursor-pointer shrink-0"
          >
            <option value="newest" className="bg-[#0d0d12] text-white">Newest First</option>
            <option value="popular" className="bg-[#0d0d12] text-white">Most Read</option>
            <option value="pinned" className="bg-[#0d0d12] text-white">Pinned First</option>
          </select>
        </div>
      </div>

      {/* Pinned Announcements Hero Grid */}
      {pinned.length > 0 && (
        <div className="mb-8">
          <div className="text-[10px] uppercase tracking-[0.3em] text-amber-300 font-bold mb-4 flex items-center gap-2">
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
        <div className="absolute left-2 top-0 bottom-0 w-px bg-gradient-to-b from-white/30 via-white/10 to-transparent" />
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
                className="absolute -left-[18px] top-6 size-3 rounded-full border-2 border-[#0a0a0a]"
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
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
                <Megaphone className="size-6 text-fuchsia-300/60" />
              </div>
              <div className="text-sm font-semibold text-white/90">No Announcements Found</div>
              <div className="text-xs text-white/40 max-w-sm mx-auto">
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
                <span
                  className="text-[10px] uppercase tracking-widest px-3 py-1 rounded-full font-bold border"
                  style={{
                    backgroundColor: categoryColors[active.category]?.bg || categoryColors.Default.bg,
                    color: categoryColors[active.category]?.text || categoryColors.Default.text,
                    borderColor: categoryColors[active.category]?.border || categoryColors.Default.border,
                  }}
                >
                  {active.category}
                </span>
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
  const IconComponent = categoryIcons[a.category] || categoryIcons.Default;
  const colors = categoryColors[a.category] || categoryColors.Default;

  return (
    <GlassCard
      hover
      onClick={onClick}
      className={`cursor-pointer group transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
        isPinned ? "border-amber-400/40 bg-gradient-to-r from-amber-500/5 to-transparent" : "hover:border-white/20"
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
                className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border"
                style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }}
              >
                {a.category}
              </span>
              <span className="text-[10px] text-white/30">•</span>
              <span className="text-[10px] text-white/45">{a.time}</span>
              {a.unread && (
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm animate-pulse"
                  style={{ background: "oklch(0.72 0.27 350 / 0.25)", color: "oklch(0.85 0.18 350)" }}
                >
                  NEW
                </span>
              )}
            </div>

            <button
              onClick={onBookmark}
              title={isBookmarked ? "Remove Bookmark" : "Save Notice"}
              className="text-white/40 hover:text-amber-300 transition"
            >
              <Star className={`size-4 ${isBookmarked ? "fill-amber-400 text-amber-400" : ""}`} />
            </button>
          </div>

          <div className="font-display font-semibold text-base group-hover:text-amber-200 transition-colors leading-snug">
            {a.title}
          </div>

          <p className="text-xs text-white/60 mt-1.5 line-clamp-2 leading-relaxed group-hover:text-white/80 transition-colors">
            {a.body}
          </p>

          <div className="mt-3 flex items-center gap-3 text-[10px] text-white/40 border-t border-white/5 pt-2 font-mono">
            <span className="flex items-center gap-1"><Users className="size-3 text-white/50" /> {a.audience || "All Students"}</span>
            <span>•</span>
            <span className="flex items-center gap-1"><Eye className="size-3 text-white/50" /> {typeof a.reads === "number" && a.reads > 0 ? `${a.reads} Reads` : "Official Circular"}</span>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
