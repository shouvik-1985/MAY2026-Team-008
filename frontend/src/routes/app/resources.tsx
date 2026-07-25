import { createFileRoute } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bookmark,
  ChevronDown,
  Download,
  Eye,
  FileText,
  Search,
  TrendingUp,
  User,
  Sparkles,
  BookOpen,
  X,
  ShieldCheck,
  HelpCircle,
  Star,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { GlassCard, PageTransition, SectionHeading } from "@/components/app/cinematic";
import { type StudentDashboard } from "@/lib/api";
import { useStudentDashboard } from "@/lib/student-session";
import { STUDY_SUBJECTS } from "@/lib/subjects";

export const Route = createFileRoute("/app/resources")({ component: ResourcesPage });

type ResourceItem = StudentDashboard["resource_items"][number];

function ResourcesPage() {
  const { dashboard } = useStudentDashboard();

  const defaultResources: ResourceItem[] = [
    {
      id: 101,
      title: "Distributed Systems & Consensus Protocols (Raft & Paxos)",
      subject: "Distributed Systems",
      type: "Lecture Notes",
      tag: "trending",
      url: "#",
      professorName: "Prof. V. K. Mehta",
      createdAt: new Date().toISOString(),
      createdDate: new Date().toISOString().split("T")[0],
      time: "Today, 10:30 AM",
    },
    {
      id: 102,
      title: "Deep Learning & Transformer Architectures Guide",
      subject: "Machine Learning & AI",
      type: "Study Guide",
      tag: "new",
      url: "#",
      professorName: "Dr. A. R. Sharma",
      createdAt: new Date().toISOString(),
      createdDate: new Date().toISOString().split("T")[0],
      time: "Yesterday, 04:15 PM",
    },
    {
      id: 103,
      title: "Operating Systems Kernel & Virtual Memory Mechanics",
      subject: "Operating Systems",
      type: "Lecture Slides",
      tag: "trending",
      url: "#",
      professorName: "Dr. S. K. Gupta",
      createdAt: new Date().toISOString(),
      createdDate: new Date().toISOString().split("T")[0],
      time: "2 days ago",
    },
    {
      id: 104,
      title: "Data Structures & Advanced Graph Algorithms Sheet",
      subject: "Algorithms",
      type: "Cheat Sheet",
      tag: "exam_ready",
      url: "#",
      professorName: "Prof. R. N. Iyer",
      createdAt: new Date().toISOString(),
      createdDate: new Date().toISOString().split("T")[0],
      time: "3 days ago",
    },
    {
      id: 105,
      title: "Full-Stack Web Architectures & Fast-API REST Specs",
      subject: "Software Engineering",
      type: "Reference",
      tag: "new",
      url: "#",
      professorName: "Prof. V. K. Mehta",
      createdAt: new Date().toISOString(),
      createdDate: new Date().toISOString().split("T")[0],
      time: "4 days ago",
    },
    {
      id: 106,
      title: "Database Systems Indexing & B-Tree Performance Guide",
      subject: "Database Systems",
      type: "Exam Papers",
      tag: "trending",
      url: "#",
      professorName: "Dr. A. R. Sharma",
      createdAt: new Date().toISOString(),
      createdDate: new Date().toISOString().split("T")[0],
      time: "5 days ago",
    },
  ];

  const rawResources: ResourceItem[] =
    dashboard?.resource_items && dashboard.resource_items.length ? dashboard.resource_items : defaultResources;

  const [bookmarks, setBookmarks] = useState<number[]>(() => {
    try {
      const stored = localStorage.getItem("cv-resource-bookmarks");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [activePreview, setActivePreview] = useState<ResourceItem | null>(null);
  const [aiSummaryModal, setAiSummaryModal] = useState<ResourceItem | null>(null);
  const [activeTab, setActiveTab] = useState("All");

  useEffect(() => {
    localStorage.setItem("cv-resource-bookmarks", JSON.stringify(bookmarks));
  }, [bookmarks]);

  const toggleBookmark = (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (bookmarks.includes(id)) {
      setBookmarks((prev) => prev.filter((b) => b !== id));
      setStatusMsg("Resource removed from bookmarks");
    } else {
      setBookmarks((prev) => [...prev, id]);
      setStatusMsg("Resource saved to ⭐ Bookmarked");
    }
    setTimeout(() => setStatusMsg(null), 2500);
  };

  const professorOptions = useMemo(
    () => [
      "All professors",
      ...(Array.from(new Set(rawResources.map((r: ResourceItem) => r.professorName).filter(Boolean))) as string[]),
    ],
    [rawResources],
  );

  const [subjectFilter, setSubjectFilter] = useState("All subjects");
  const [professorFilter, setProfessorFilter] = useState("All professors");
  const [q, setQ] = useState("");

  const filteredItems = useMemo(() => {
    return rawResources.filter((resource: ResourceItem) => {
      const query = q.trim().toLowerCase();
      const matchesQuery =
        !query ||
        [resource.title, resource.subject, resource.type, resource.professorName, resource.time]
          .join(" ")
          .toLowerCase()
          .includes(query);

      const matchesSubject =
        subjectFilter === "All subjects" || resource.subject?.toLowerCase().includes(subjectFilter.toLowerCase());
      const matchesProfessor =
        professorFilter === "All professors" ||
        resource.professorName?.toLowerCase().includes(professorFilter.toLowerCase());

      if (activeTab === "⭐ Bookmarked") return bookmarks.includes(resource.id) && matchesQuery;
      if (activeTab === "Trending") return (resource.tag === "trending" || resource.tag === "new") && matchesQuery;

      return matchesQuery && matchesSubject && matchesProfessor;
    });
  }, [rawResources, q, subjectFilter, professorFilter, activeTab, bookmarks]);

  const trending = rawResources.filter((r: ResourceItem) => r.tag === "trending" || r.tag === "new").slice(0, 4);

  function handleDownloadResource(item: ResourceItem) {
    const text = `OFFICIAL CAMPUSVERSE STUDY RESOURCE\n\nTitle: ${item.title}\nSubject: ${item.subject}\nFaculty Author: ${item.professorName}\nType: ${item.type}\nPublished: ${item.time}\n\n1. COURSE SUMMARY & OVERVIEW\nThis document covers comprehensive lecture notes, problem sets, and architectural diagrams for ${item.subject}.\n\n2. KEY CONCEPTS & THEOREMS\n- Core System Design & State Transitions\n- Algorithmic Complexity & Optimization\n- Practical Case Studies & Examination Questions\n\nVerified Digital Copy &bull; CampusVerse Library Registry`;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${item.title.replace(/\s+/g, "_")}_Notes.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setStatusMsg(`✓ Downloaded "${item.title}" successfully!`);
    setTimeout(() => setStatusMsg(null), 3000);
  }

  return (
    <PageTransition>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <SectionHeading
          eyebrow="Digital Academic Library"
          title="Study Resources & Notes"
          sub="Lecture notes, slides, previous exam papers - instant search & AI revision."
        />

        <div className="flex items-center gap-2 self-start md:self-auto">
          <div className="glass px-4 py-2 rounded-full text-xs font-semibold text-emerald-400 border border-emerald-500/30 flex items-center gap-2">
            <BookOpen className="size-3.5" /> {rawResources.length} Library Items Available
          </div>
        </div>
      </div>

      {statusMsg && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 glass rounded-2xl border border-emerald-400/30 text-emerald-300 text-xs font-medium flex items-center gap-2"
        >
          <ShieldCheck className="size-4 shrink-0 text-emerald-400" />
          <span>{statusMsg}</span>
        </motion.div>
      )}

      {/* Top Library Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <GlassCard className="p-4 flex items-center gap-3">
          <div className="size-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
            <FileText className="size-5" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/40">Total Notes</div>
            <div className="font-display text-xl font-bold">{rawResources.length} Resources</div>
          </div>
        </GlassCard>

        <GlassCard className="p-4 flex items-center gap-3">
          <div className="size-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
            <TrendingUp className="size-5" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/40">Trending Material</div>
            <div className="font-display text-xl font-bold text-amber-300">{trending.length} Featured Notes</div>
          </div>
        </GlassCard>

        <GlassCard className="p-4 flex items-center gap-3">
          <div className="size-10 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
            <Sparkles className="size-5" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/40">AI Quiz Generator</div>
            <div className="font-display text-xl font-bold text-purple-300">Ready</div>
          </div>
        </GlassCard>

        <GlassCard className="p-4 flex items-center gap-3">
          <div className="size-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Star className="size-5" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/40">Saved Bookmarks</div>
            <div className="font-display text-xl font-bold text-emerald-400">{bookmarks.length} Saved</div>
          </div>
        </GlassCard>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="grid gap-3 mb-6 xl:grid-cols-[1fr_260px_260px]">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-white/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search notes, topics, or faculty..."
            className="w-full glass rounded-full pl-11 pr-4 py-3 text-sm placeholder-white/30 focus:outline-none focus:border-white/30"
          />
        </div>
        <SearchableFilterInput
          id="student-resource-subject"
          icon={FileText}
          value={subjectFilter}
          onChange={setSubjectFilter}
          options={["All subjects", ...STUDY_SUBJECTS]}
          placeholder="Filter by subject"
        />
        <SearchableFilterInput
          id="student-resource-professor"
          icon={User}
          value={professorFilter}
          onChange={setProfessorFilter}
          options={professorOptions}
          placeholder="Filter by professor"
        />
      </div>

      {/* Quick Filter Pills */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-1">
        {["All", "Trending", "⭐ Bookmarked"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-full text-xs uppercase tracking-[0.15em] transition whitespace-nowrap ${
              activeTab === tab
                ? "bg-[var(--grad-aurora)] text-white font-semibold shadow-lg"
                : "text-white/50 hover:text-white glass"
            }`}
          >
            {tab === "⭐ Bookmarked" ? `⭐ Bookmarked (${bookmarks.length})` : tab}
          </button>
        ))}
      </div>

      {/* Trending Horizontal Carousel */}
      {activeTab === "All" && trending.length > 0 && (
        <GlassCard className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-amber-300 font-bold">
              <TrendingUp className="size-3.5" /> Trending Study Material This Week
            </div>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {trending.map((r: ResourceItem) => (
              <div
                key={r.id}
                onClick={() => setActivePreview(r)}
                className="glass rounded-2xl p-4 cursor-pointer hover:border-amber-400/50 hover:-translate-y-1 transition duration-300 group"
              >
                <div className="h-24 rounded-xl mb-3 bg-gradient-to-br from-indigo-500/20 via-purple-500/10 to-amber-500/20 p-3 flex flex-col justify-between border border-white/10 group-hover:border-amber-400/40">
                  <span className="text-[10px] uppercase tracking-wider text-amber-300 font-bold bg-amber-500/10 px-2 py-0.5 rounded-full self-start border border-amber-500/30">
                    {r.tag === "new" ? "NEW" : "TRENDING"}
                  </span>
                  <div className="text-xs font-bold text-white line-clamp-1">{r.subject}</div>
                </div>
                <div className="text-sm font-semibold text-white group-hover:text-amber-200 line-clamp-1">
                  {r.title}
                </div>
                <div className="text-[11px] text-white/50 mt-1 flex items-center justify-between">
                  <span>{r.professorName}</span>
                  <button
                    onClick={(e) => toggleBookmark(r.id, e)}
                    className="text-white/40 hover:text-amber-300 transition"
                  >
                    <Bookmark className={`size-4 ${bookmarks.includes(r.id) ? "fill-amber-400 text-amber-400" : ""}`} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Main Study Resources Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
        {filteredItems.map((item: ResourceItem, idx: number) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.04 }}
          >
            <GlassCard hover className="h-full flex flex-col justify-between relative overflow-hidden group">
              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <span className="text-[10px] uppercase tracking-widest font-bold px-2.5 py-0.5 rounded-full border bg-indigo-500/10 text-indigo-300 border-indigo-500/30">
                    {item.type || "Lecture Notes"}
                  </span>
                  <button
                    onClick={(e) => toggleBookmark(item.id, e)}
                    className="text-white/40 hover:text-amber-300 transition"
                  >
                    <Bookmark className={`size-4.5 ${bookmarks.includes(item.id) ? "fill-amber-400 text-amber-400" : ""}`} />
                  </button>
                </div>

                <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">{item.subject}</div>
                <h3 className="font-display text-lg font-bold text-white mt-1 group-hover:text-amber-200 transition-colors leading-snug">
                  {item.title}
                </h3>
              </div>

              <div className="mt-5 pt-3 border-t border-white/10">
                <div className="flex items-center justify-between text-xs text-white/50 mb-3">
                  <span className="flex items-center gap-1"><User className="size-3.5 text-white/40" /> {item.professorName}</span>
                  <span>{item.time}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActivePreview(item)}
                    className="flex-1 glass py-2 rounded-xl text-xs font-semibold text-white/90 hover:text-white border border-white/10 hover:border-white/20 transition flex items-center justify-center gap-1.5"
                  >
                    <Eye className="size-3.5 text-emerald-400" /> Preview Notes
                  </button>
                  <button
                    onClick={() => setAiSummaryModal(item)}
                    title="Generate AI Summary & Revision Quiz"
                    className="glass p-2 rounded-xl text-purple-300 hover:text-white border border-purple-500/30 hover:bg-purple-500/10 transition"
                  >
                    <Sparkles className="size-4" />
                  </button>
                  <button
                    onClick={() => handleDownloadResource(item)}
                    title="Download Material"
                    className="glass p-2 rounded-xl text-sky-300 hover:text-white border border-sky-500/30 hover:bg-sky-500/10 transition"
                  >
                    <Download className="size-4" />
                  </button>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        ))}

        {filteredItems.length === 0 && (
          <div className="col-span-full">
            <GlassCard className="text-center py-12">
              <FileText className="size-10 mx-auto text-white/30 mb-3" />
              <div className="text-base font-semibold text-white/80">No study resources match your search filter.</div>
              <p className="text-xs text-white/40 mt-1">Try searching another subject or clearing your professor filter.</p>
            </GlassCard>
          </div>
        )}
      </div>

      {/* Resource Reader & Preview Modal */}
      <AnimatePresence>
        {activePreview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActivePreview(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl rounded-3xl border border-white/15 bg-[#11131a] p-7 text-white relative shadow-2xl space-y-5"
            >
              <button
                onClick={() => setActivePreview(null)}
                className="absolute top-6 right-6 text-white/50 hover:text-white glass p-2 rounded-full transition"
              >
                <X className="size-5" />
              </button>

              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest font-bold px-3 py-1 rounded-full border bg-emerald-500/10 text-emerald-300 border-emerald-500/30">
                  {activePreview.subject}
                </span>
                <span className="text-xs text-white/40">&bull; Published by {activePreview.professorName}</span>
              </div>

              <div>
                <h3 className="font-display text-2xl md:text-3xl font-bold leading-snug">{activePreview.title}</h3>
                <p className="text-xs text-white/50 mt-1">Document Format: PDF / Verified Course Note &bull; {activePreview.time}</p>
              </div>

              <div className="glass p-5 rounded-2xl border border-white/10 space-y-3 text-xs text-white/80 leading-relaxed max-h-60 overflow-y-auto">
                <div className="font-bold text-amber-300 uppercase tracking-wider text-[11px]">CHAPTER 1: COURSE OVERVIEW &amp; CORE PRINCIPLES</div>
                <p>
                  This official academic reference module covers state transitions, algorithmic complexity, and high-level architectural patterns for {activePreview.subject}.
                </p>
                <div className="font-bold text-amber-300 uppercase tracking-wider text-[11px] pt-2">CHAPTER 2: EXPERIMENTAL &amp; EXAM SPECIFICATIONS</div>
                <p>
                  Key problem sets include memory hierarchy benchmarks, concurrency synchronization primitives, and distributed ledger state machines.
                </p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-white/10">
                <button
                  onClick={() => {
                    const target = activePreview;
                    setActivePreview(null);
                    setAiSummaryModal(target);
                  }}
                  className="glass px-4 py-2 rounded-full text-xs font-semibold text-purple-300 border border-purple-500/30 hover:bg-purple-500/10 flex items-center gap-1.5 transition"
                >
                  <Sparkles className="size-3.5" /> AI Summary &amp; Quiz
                </button>

                <button
                  onClick={() => handleDownloadResource(activePreview)}
                  className="bg-[var(--grad-aurora)] px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white shadow-lg flex items-center gap-2 hover:opacity-90 transition"
                >
                  <Download className="size-3.5" /> Download Full Material
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Summary & Quiz Generator Modal */}
      <AnimatePresence>
        {aiSummaryModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setAiSummaryModal(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl rounded-3xl border border-purple-500/30 bg-[#11131a] p-7 text-white relative shadow-2xl space-y-5"
            >
              <button
                onClick={() => setAiSummaryModal(null)}
                className="absolute top-6 right-6 text-white/50 hover:text-white glass p-2 rounded-full transition"
              >
                <X className="size-5" />
              </button>

              <div className="flex items-center gap-2">
                <Sparkles className="size-5 text-purple-400" />
                <span className="text-xs uppercase tracking-widest font-bold text-purple-300">
                  AI Revision Suite &bull; 30-Sec Summary &amp; Exam Quiz
                </span>
              </div>

              <div>
                <h3 className="font-display text-2xl font-bold">{aiSummaryModal.title}</h3>
                <p className="text-xs text-white/50 mt-1">Generated for {aiSummaryModal.subject}</p>
              </div>

              <div className="glass p-4 rounded-2xl border border-purple-500/20 space-y-2 text-xs text-white/80">
                <div className="font-bold text-purple-300 uppercase tracking-wider text-[10px]">⚡ 30-Second AI Key Takeaway</div>
                <p className="leading-relaxed">
                  Focuses on core architectural invariants, synchronization locks, and algorithm state complexity. Master Raft leader election and log replication for full exam credit.
                </p>
              </div>

              <div className="glass p-4 rounded-2xl border border-white/10 space-y-3 text-xs text-white/80">
                <div className="font-bold text-amber-300 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                  <HelpCircle className="size-3.5" /> Practice Exam Quiz (3 Questions)
                </div>
                <div className="space-y-2">
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                    <div className="font-semibold text-white">Q1. What guarantees safety in log replication?</div>
                    <div className="text-emerald-400 mt-1 text-[11px]">Answer: Majority consensus quorum (N/2 + 1 votes).</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                    <div className="font-semibold text-white">Q2. What is the time complexity of B-Tree lookup?</div>
                    <div className="text-emerald-400 mt-1 text-[11px]">Answer: O(log_m N) where m is the B-Tree order.</div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setAiSummaryModal(null)}
                  className="bg-[var(--grad-aurora)] px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wider text-white shadow-lg"
                >
                  Got It, Ready for Exams
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}

function SearchableFilterInput({
  id,
  icon: Icon,
  value,
  onChange,
  options,
  placeholder,
}: {
  id: string;
  icon: any;
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredOptions = useMemo(
    () => options.filter((opt) => opt.toLowerCase().includes(search.toLowerCase())),
    [options, search],
  );

  return (
    <div className="relative">
      <button
        id={id}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full glass rounded-full px-4 py-3 text-sm text-left flex items-center justify-between text-white/80 hover:text-white transition"
      >
        <div className="flex items-center gap-2 truncate">
          <Icon className="size-4 text-white/40 shrink-0" />
          <span className="truncate">{value}</span>
        </div>
        <ChevronDown className="size-4 text-white/40 shrink-0" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="absolute top-full left-0 right-0 mt-2 z-30 bg-[#11131a] border border-white/15 rounded-2xl p-2 shadow-2xl max-h-60 overflow-y-auto"
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={placeholder}
              className="w-full glass rounded-xl px-3 py-2 text-xs bg-transparent text-white outline-none mb-2"
            />
            <div className="space-y-1">
              {filteredOptions.map((opt) => (
                <button
                  key={opt}
                  onClick={() => {
                    onChange(opt);
                    setIsOpen(false);
                    setSearch("");
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs transition ${
                    value === opt ? "bg-emerald-500/20 text-emerald-300 font-semibold" : "text-white/70 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
