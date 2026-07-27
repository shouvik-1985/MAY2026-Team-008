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
  Loader2,
  ExternalLink,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { GlassCard, PageTransition, SectionHeading } from "@/components/app/cinematic";
import {
  fetchProtectedResourceBlob,
  generateStudentResourceAiSummary,
  openProtectedResource,
  type StudentDashboard,
  type StudentResourceAiSummary,
} from "@/lib/api";
import { useStudentDashboard } from "@/lib/student-session";
import { STUDY_SUBJECTS } from "@/lib/subjects";

export const Route = createFileRoute("/app/resources")({ component: ResourcesPage });

type ResourceItem = StudentDashboard["resource_items"][number];
type PreviewFileState = {
  status: "idle" | "loading" | "ready" | "error";
  objectUrl: string;
  contentType: string;
  fileName: string;
  message: string;
};
type AiSummaryState = {
  status: "idle" | "loading" | "ready" | "error";
  data: StudentResourceAiSummary | null;
  message: string;
};

const EMPTY_PREVIEW_FILE: PreviewFileState = {
  status: "idle",
  objectUrl: "",
  contentType: "",
  fileName: "",
  message: "",
};
const EMPTY_AI_SUMMARY: AiSummaryState = {
  status: "idle",
  data: null,
  message: "",
};

function hasUploadedMaterial(item: ResourceItem) {
  return Boolean(item.url?.trim() && item.url !== "#");
}

function withDownloadFlag(url: string) {
  return `${url}${url.includes("?") ? "&" : "?"}download=true`;
}

function resourceFallbackName(item: ResourceItem) {
  return item.title?.trim() || "study-resource";
}

function pdfFileName(title: string) {
  const base =
    title
      .trim()
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "study-resource";

  return `${base}-ai-explanation.pdf`;
}

const PDF_TEXT_REPLACEMENTS: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201c": '"',
  "\u201d": '"',
  "\u2013": "-",
  "\u2014": "-",
  "\u2022": "-",
  "\u00b7": "-",
  "\u2192": "->",
  "\u2190": "<-",
  "\u2194": "<->",
  "\u2264": "<=",
  "\u2265": ">=",
  "\u00d7": "x",
  "\u00f7": "/",
};

function normalizePdfText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, (char) => PDF_TEXT_REPLACEMENTS[char] ?? " ");
}

function escapePdfText(value: string) {
  return normalizePdfText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r/g, "");
}

function wrapPdfLine(text: string, maxChars: number) {
  const words = normalizePdfText(text).replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";

  words.forEach((word) => {
    if (word.length > maxChars) {
      if (line) {
        lines.push(line);
        line = "";
      }
      for (let index = 0; index < word.length; index += maxChars) {
        lines.push(word.slice(index, index + maxChars));
      }
      return;
    }

    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });

  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function buildAiExplanationPdf(item: ResourceItem, data: StudentResourceAiSummary) {
  const encoder = new TextEncoder();
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 44;
  const contentWidth = pageWidth - margin * 2;
  const pdfTextColor = "0 0 0 rg";
  const pages: string[][] = [[]];
  let y = pageHeight - margin;

  const byteLength = (value: string) => encoder.encode(value).length;
  const currentPage = () => pages[pages.length - 1];
  const addPage = () => {
    pages.push([]);
    y = pageHeight - margin;
  };
  const addGap = (amount: number) => {
    y -= amount;
  };
  const addLine = (
    text: string,
    options: { font?: "F1" | "F2"; size?: number; color?: string; indent?: number; gapAfter?: number } = {},
  ) => {
    const size = options.size ?? 11;
    const indent = options.indent ?? 0;
    const lineHeight = size * 1.42;

    if (y < margin + lineHeight) addPage();

    currentPage().push(
      `${options.color ?? pdfTextColor} BT /${options.font ?? "F1"} ${size} Tf ${(margin + indent).toFixed(
        2,
      )} ${y.toFixed(2)} Td (${escapePdfText(text)}) Tj ET`,
    );
    y -= lineHeight + (options.gapAfter ?? 0);
  };
  const addWrapped = (
    text: string,
    options: { font?: "F1" | "F2"; size?: number; color?: string; indent?: number; gapAfter?: number } = {},
  ) => {
    const size = options.size ?? 11;
    const indent = options.indent ?? 0;
    const maxChars = Math.max(32, Math.floor((contentWidth - indent) / (size * 0.52)));
    const paragraphs = normalizePdfText(text).split(/\n+/).map((part) => part.trim()).filter(Boolean);

    if (!paragraphs.length) {
      addLine("", options);
      return;
    }

    paragraphs.forEach((paragraph, paragraphIndex) => {
      wrapPdfLine(paragraph, maxChars).forEach((line) => addLine(line, { ...options, gapAfter: 0 }));
      if (paragraphIndex < paragraphs.length - 1) addGap(size * 0.7);
    });
    addGap(options.gapAfter ?? 7);
  };
  const addSection = (title: string) => {
    addGap(6);
    addWrapped(title.toUpperCase(), {
      font: "F2",
      size: 10,
      color: pdfTextColor,
      gapAfter: 5,
    });
  };
  const conceptSections = data.conceptExplanations?.length ? data.conceptExplanations : data.detailedExplanation;
  const importantPoints = data.importantPoints?.length ? data.importantPoints : data.keyTakeaways;
  const practiceGuidance = data.practiceGuidance?.length ? data.practiceGuidance : data.revisionFocus;

  addWrapped(data.title || item.title, { font: "F2", size: 22, color: pdfTextColor, gapAfter: 4 });
  addWrapped(`Subject: ${data.subject || item.subject}`, { size: 10, color: pdfTextColor, gapAfter: 0 });
  addWrapped(`Generated by CampusVerse AI Tutor | Model: ${data.model || "gpt-5.4-mini"}`, {
    size: 9,
    color: pdfTextColor,
    gapAfter: 12,
  });

  addSection("Full AI Explanation");
  addWrapped(data.fullExplanation || data.summary, { size: 11, color: pdfTextColor, gapAfter: 12 });

  if (conceptSections.length) {
    addSection("Concept-by-Concept Explanation");
    conceptSections.forEach((section, index) => {
      addWrapped(`${index + 1}. ${section.heading}`, { font: "F2", size: 12, color: pdfTextColor, gapAfter: 2 });
      addWrapped(section.explanation, { size: 10.5, color: pdfTextColor, indent: 12, gapAfter: 3 });
      if (section.example) {
        addWrapped(`Example: ${section.example}`, { size: 10, color: pdfTextColor, indent: 12, gapAfter: 8 });
      }
    });
  }

  if (importantPoints.length) {
    addSection("Important Points");
    importantPoints.forEach((point) => addWrapped(`- ${point}`, { size: 10.5, indent: 10, gapAfter: 3 }));
  }

  if (practiceGuidance.length) {
    addSection("Practice With This");
    practiceGuidance.forEach((guidance) => addWrapped(`- ${guidance}`, { size: 10.5, indent: 10, gapAfter: 3 }));
  }

  if (data.quiz.length) {
    addSection("Practice Exam Quiz");
    data.quiz.forEach((item, index) => {
      addWrapped(`Q${index + 1}. ${item.question}`, { font: "F2", size: 10.5, color: pdfTextColor, gapAfter: 2 });
      addWrapped(`Answer: ${item.answer}`, { size: 10, color: pdfTextColor, indent: 12, gapAfter: 7 });
    });
  }

  if (data.sourceNote && data.sourceStatus !== "extracted") {
    addSection("Source Note");
    addWrapped(data.sourceNote, { size: 9.5, color: pdfTextColor, gapAfter: 6 });
  }

  pages.forEach((page, index) => {
    page.unshift(`1 1 1 rg 0 0 ${pageWidth} ${pageHeight} re f`);
    page.push(`${pdfTextColor} BT /F1 8 Tf ${margin.toFixed(2)} 24 Td (CampusVerse AI Tutor) Tj ET`);
    page.push(
      `${pdfTextColor} BT /F1 8 Tf ${(pageWidth - margin - 54).toFixed(2)} 24 Td (Page ${index + 1} of ${
        pages.length
      }) Tj ET`,
    );
  });

  const pageIds = pages.map((_, index) => 5 + index * 2);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];

  pages.forEach((page, index) => {
    const pageId = 5 + index * 2;
    const contentId = pageId + 1;
    const stream = `${page.join("\n")}\n`;

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    objects.push(`<< /Length ${byteLength(stream)} >>\nstream\n${stream}endstream`);
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets[index + 1] = byteLength(pdf);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}

function previewKind(file: PreviewFileState, item: ResourceItem) {
  const contentType = file.contentType.toLowerCase();
  const fileName = file.fileName.toLowerCase();
  const label = `${item.type} ${item.url} ${fileName}`.toLowerCase();

  if (contentType.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(label)) return "image";
  if (contentType.startsWith("video/") || /\.(mp4|webm|ogg|mov|m4v)$/i.test(label)) return "video";
  if (contentType.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(label)) return "audio";
  if (
    contentType.includes("pdf") ||
    contentType.startsWith("text/") ||
    contentType.includes("json") ||
    contentType.includes("xml") ||
    /\.(pdf|txt|csv|md|json|xml|log)$/i.test(label)
  ) {
    return "frame";
  }
  return "file";
}

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
  const [previewFile, setPreviewFile] = useState<PreviewFileState>(EMPTY_PREVIEW_FILE);
  const [aiSummaryModal, setAiSummaryModal] = useState<ResourceItem | null>(null);
  const [aiSummaryState, setAiSummaryState] = useState<AiSummaryState>(EMPTY_AI_SUMMARY);
  const [activeTab, setActiveTab] = useState("All");

  useEffect(() => {
    localStorage.setItem("cv-resource-bookmarks", JSON.stringify(bookmarks));
  }, [bookmarks]);

  useEffect(() => {
    let canceled = false;
    let objectUrl = "";

    if (!activePreview) {
      setPreviewFile(EMPTY_PREVIEW_FILE);
      return;
    }

    if (!hasUploadedMaterial(activePreview)) {
      setPreviewFile({
        ...EMPTY_PREVIEW_FILE,
        status: "error",
        message: "No uploaded material is attached to this resource.",
      });
      return;
    }

    setPreviewFile({ ...EMPTY_PREVIEW_FILE, status: "loading" });

    fetchProtectedResourceBlob(activePreview.url, resourceFallbackName(activePreview))
      .then((file) => {
        objectUrl = file.objectUrl;
        if (canceled) {
          URL.revokeObjectURL(file.objectUrl);
          return;
        }
        setPreviewFile({
          status: "ready",
          objectUrl: file.objectUrl,
          contentType: file.contentType,
          fileName: file.name,
          message: "",
        });
      })
      .catch((error) => {
        if (canceled) return;
        setPreviewFile({
          ...EMPTY_PREVIEW_FILE,
          status: "error",
          message: error instanceof Error ? error.message : "Could not load the uploaded material.",
        });
      });

    return () => {
      canceled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [activePreview]);

  useEffect(() => {
    let canceled = false;

    if (!aiSummaryModal) {
      setAiSummaryState(EMPTY_AI_SUMMARY);
      return;
    }

    if (!hasUploadedMaterial(aiSummaryModal)) {
      setAiSummaryState({
        status: "error",
        data: null,
        message: "No uploaded material is attached to this resource.",
      });
      return;
    }

    setAiSummaryState({ status: "loading", data: null, message: "" });

    generateStudentResourceAiSummary(aiSummaryModal.id)
      .then((data) => {
        if (canceled) return;
        setAiSummaryState({ status: "ready", data, message: "" });
      })
      .catch((error) => {
        if (canceled) return;
        setAiSummaryState({
          status: "error",
          data: null,
          message: error instanceof Error ? error.message : "Could not generate the AI summary.",
        });
      });

    return () => {
      canceled = true;
    };
  }, [aiSummaryModal]);

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

  async function handleDownloadResource(item: ResourceItem) {
    if (!hasUploadedMaterial(item)) {
      setStatusMsg("No uploaded material is attached to this resource.");
      setTimeout(() => setStatusMsg(null), 3000);
      return;
    }

    try {
      await openProtectedResource(withDownloadFlag(item.url), {
        download: true,
        fallbackName: resourceFallbackName(item),
      });
      setStatusMsg(`Downloading "${item.title}" from the uploaded material.`);
    } catch (error) {
      setStatusMsg(error instanceof Error ? error.message : "Could not download the uploaded material.");
    }
    setTimeout(() => setStatusMsg(null), 3000);
  }

  function handleDownloadAiExplanationPdf() {
    if (!aiSummaryModal || aiSummaryState.status !== "ready" || !aiSummaryState.data) {
      setStatusMsg("AI explanation is still being prepared.");
      setTimeout(() => setStatusMsg(null), 3000);
      return;
    }

    const pdf = buildAiExplanationPdf(aiSummaryModal, aiSummaryState.data);
    const objectUrl = URL.createObjectURL(pdf);
    const anchor = document.createElement("a");

    anchor.href = objectUrl;
    anchor.download = pdfFileName(aiSummaryModal.title);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    setStatusMsg(`Downloading AI explanation for "${aiSummaryModal.title}".`);
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
                    onClick={() => void handleDownloadResource(item)}
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
              className="w-full max-w-5xl max-h-[90vh] rounded-3xl border border-white/15 bg-[#11131a] p-5 md:p-7 text-white relative shadow-2xl space-y-5 overflow-hidden flex flex-col"
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
                <p className="text-xs text-white/50 mt-1">
                  Document Format: {activePreview.type || "Uploaded File"} &bull; {activePreview.time}
                </p>
              </div>

              <ResourcePreviewPanel item={activePreview} previewFile={previewFile} onDownload={handleDownloadResource} />

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
                  onClick={() => void handleDownloadResource(activePreview)}
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
              className="relative flex max-h-[92vh] w-full max-w-5xl flex-col gap-5 overflow-hidden rounded-3xl border border-purple-500/30 bg-[#11131a] p-5 text-white shadow-2xl md:p-7"
            >
              <button
                onClick={() => setAiSummaryModal(null)}
                className="absolute top-6 right-6 text-white/50 hover:text-white glass p-2 rounded-full transition"
              >
                <X className="size-5" />
              </button>

              <div className="flex items-center gap-2 pr-12">
                <Sparkles className="size-5 text-purple-400" />
                <span className="text-xs uppercase tracking-widest font-bold text-purple-300">
                  AI Tutor &bull; Full Explanation, Examples &amp; Quiz
                </span>
              </div>

              <div className="pr-12">
                <h3 className="font-display text-2xl font-bold md:text-3xl">{aiSummaryModal.title}</h3>
                <p className="text-xs text-white/50 mt-1">Generated for {aiSummaryModal.subject}</p>
              </div>

              <AiSummaryContent state={aiSummaryState} />

              <div className="flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                {aiSummaryState.status === "ready" && aiSummaryState.data ? (
                  <button
                    onClick={handleDownloadAiExplanationPdf}
                    className="glass inline-flex items-center justify-center gap-2 rounded-full border border-purple-400/25 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-purple-100 transition hover:border-purple-300/50 hover:text-white"
                  >
                    <Download className="size-3.5" />
                    Download PDF
                  </button>
                ) : (
                  <div />
                )}
                <button
                  onClick={() => setAiSummaryModal(null)}
                  className="bg-[var(--grad-aurora)] px-7 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white shadow-lg"
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

function AiSummaryContent({ state }: { state: AiSummaryState }) {
  if (state.status === "loading") {
    return (
      <div className="glass min-h-[360px] rounded-2xl border border-purple-500/20 flex flex-col items-center justify-center gap-3 text-sm text-white/60">
        <Loader2 className="size-7 animate-spin text-purple-300" />
        <span>Explaining the uploaded study material in detail...</span>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="glass min-h-[320px] rounded-2xl border border-rose-400/20 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <Sparkles className="size-9 text-white/30" />
        <div>
          <div className="text-sm font-semibold text-white/80">AI explanation unavailable</div>
          <p className="mt-2 max-w-md text-xs leading-5 text-white/50">{state.message}</p>
        </div>
      </div>
    );
  }

  if (state.status !== "ready" || !state.data) {
    return null;
  }

  const data = state.data;
  const conceptSections = data.conceptExplanations?.length ? data.conceptExplanations : data.detailedExplanation;
  const importantPoints = data.importantPoints?.length ? data.importantPoints : data.keyTakeaways;
  const practiceGuidance = data.practiceGuidance?.length ? data.practiceGuidance : data.revisionFocus;

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1 md:pr-2">
      <div className="glass p-4 md:p-5 rounded-2xl border border-purple-500/20 space-y-2 text-xs text-white/80">
        <div className="font-bold text-purple-300 uppercase tracking-wider text-[10px]">
          Full AI Explanation
        </div>
        <p className="leading-relaxed md:text-[13px]">{data.fullExplanation || data.summary}</p>
        <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">
          Model: {data.model || "gpt-5.4-mini"}
        </div>
      </div>

      {conceptSections.length > 0 && (
        <div className="glass p-4 md:p-5 rounded-2xl border border-white/10 space-y-3 text-xs text-white/80">
          <div className="font-bold text-purple-300 uppercase tracking-wider text-[10px]">
            Concept-by-Concept Explanation
          </div>
          <div className="space-y-3">
            {conceptSections.map((section, index) => (
              <div key={`${section.heading}-${index}`} className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
                <div className="text-sm font-semibold text-white">{section.heading}</div>
                <p className="mt-1.5 leading-relaxed text-white/75 md:text-[13px]">{section.explanation}</p>
                {section.example && (
                  <div className="mt-3 rounded-xl border border-emerald-400/15 bg-emerald-400/8 p-2.5 md:p-3">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">
                      Example
                    </div>
                    <p className="mt-1 leading-relaxed text-emerald-50/80 md:text-[13px]">{section.example}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {importantPoints.length > 0 && (
        <div className="glass p-4 md:p-5 rounded-2xl border border-white/10 space-y-3 text-xs text-white/80">
          <div className="font-bold text-emerald-300 uppercase tracking-wider text-[10px]">
            Important Points
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            {importantPoints.map((point, index) => (
              <div key={`${point}-${index}`} className="rounded-xl border border-white/10 bg-white/5 p-2.5 md:p-3 leading-relaxed md:text-[13px]">
                {point}
              </div>
            ))}
          </div>
        </div>
      )}

      {practiceGuidance.length > 0 && (
        <div className="glass p-4 md:p-5 rounded-2xl border border-white/10 space-y-3 text-xs text-white/80">
          <div className="font-bold text-sky-300 uppercase tracking-wider text-[10px]">
            Practice With This
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {practiceGuidance.map((guidance, index) => (
              <div key={`${guidance}-${index}`} className="rounded-xl border border-white/10 bg-white/5 p-2.5 md:p-3 leading-relaxed md:text-[13px]">
                {guidance}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass p-4 md:p-5 rounded-2xl border border-white/10 space-y-3 text-xs text-white/80">
        <div className="font-bold text-amber-300 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
          <HelpCircle className="size-3.5" /> Practice Exam Quiz ({data.quiz.length} Questions)
        </div>
        <div className="space-y-2">
          {data.quiz.map((item, index) => (
            <div key={`${item.question}-${index}`} className="p-2.5 md:p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="font-semibold text-white">Q{index + 1}. {item.question}</div>
              <div className="text-emerald-400 mt-1 text-[11px]">Answer: {item.answer}</div>
            </div>
          ))}
        </div>
      </div>

      {data.sourceNote && data.sourceStatus !== "extracted" && (
        <div className="rounded-2xl border border-amber-300/20 bg-amber-400/8 p-3 text-[11px] leading-5 text-amber-100/80">
          {data.sourceNote}
        </div>
      )}
    </div>
  );
}

function ResourcePreviewPanel({
  item,
  previewFile,
  onDownload,
}: {
  item: ResourceItem;
  previewFile: PreviewFileState;
  onDownload: (item: ResourceItem) => void | Promise<void>;
}) {
  if (previewFile.status === "loading") {
    return (
      <div className="glass min-h-[360px] flex-1 rounded-2xl border border-white/10 flex flex-col items-center justify-center gap-3 text-sm text-white/60">
        <Loader2 className="size-7 animate-spin text-emerald-300" />
        <span>Loading uploaded material...</span>
      </div>
    );
  }

  if (previewFile.status === "error") {
    return (
      <div className="glass min-h-[320px] flex-1 rounded-2xl border border-white/10 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <FileText className="size-10 text-white/30" />
        <div>
          <div className="text-sm font-semibold text-white/80">Preview unavailable</div>
          <p className="mt-2 max-w-md text-xs leading-5 text-white/50">{previewFile.message}</p>
        </div>
      </div>
    );
  }

  if (previewFile.status !== "ready") {
    return null;
  }

  const kind = previewKind(previewFile, item);
  const fileName = previewFile.fileName || resourceFallbackName(item);

  if (kind === "image") {
    return (
      <div className="glass min-h-[360px] flex-1 rounded-2xl border border-white/10 overflow-hidden bg-black/30 flex items-center justify-center">
        <img src={previewFile.objectUrl} alt={item.title} className="max-h-[58vh] w-full object-contain" />
      </div>
    );
  }

  if (kind === "video") {
    return (
      <div className="glass min-h-[360px] flex-1 rounded-2xl border border-white/10 overflow-hidden bg-black/30 flex items-center justify-center">
        <video src={previewFile.objectUrl} controls className="max-h-[58vh] w-full" />
      </div>
    );
  }

  if (kind === "audio") {
    return (
      <div className="glass min-h-[260px] flex-1 rounded-2xl border border-white/10 flex flex-col items-center justify-center gap-5 p-6">
        <FileText className="size-10 text-sky-200" />
        <div className="max-w-full truncate text-sm font-semibold text-white/85">{fileName}</div>
        <audio src={previewFile.objectUrl} controls className="w-full max-w-xl" />
      </div>
    );
  }

  if (kind === "frame") {
    return (
      <div className="glass min-h-[420px] flex-1 rounded-2xl border border-white/10 overflow-hidden bg-black/30">
        <iframe src={previewFile.objectUrl} title={fileName} className="h-[58vh] min-h-[420px] w-full bg-white" />
      </div>
    );
  }

  return (
    <div className="glass min-h-[320px] flex-1 rounded-2xl border border-white/10 flex flex-col items-center justify-center gap-5 p-6 text-center">
      <FileText className="size-12 text-cyan-200" />
      <div className="max-w-full">
        <div className="truncate text-base font-semibold text-white">{fileName}</div>
        <p className="mt-2 max-w-md text-xs leading-5 text-white/50">
          This uploaded file type may not render inside the browser preview.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() =>
            void openProtectedResource(item.url, { fallbackName: fileName }).catch(() => {
              window.open(previewFile.objectUrl, "_blank", "noopener,noreferrer");
            })
          }
          className="glass rounded-full px-4 py-2 text-xs font-semibold text-white/80 border border-white/10 hover:text-white hover:border-white/25 transition inline-flex items-center gap-1.5"
        >
          <ExternalLink className="size-3.5" />
          Open File
        </button>
        <button
          type="button"
          onClick={() => void onDownload(item)}
          className="bg-[var(--grad-aurora)] rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-lg inline-flex items-center gap-1.5 hover:opacity-90 transition"
        >
          <Download className="size-3.5" />
          Download
        </button>
      </div>
    </div>
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
