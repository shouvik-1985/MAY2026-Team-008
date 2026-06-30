import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Bookmark, ChevronDown, Download, Eye, FileText, Search, TrendingUp, User } from "lucide-react";
import { useMemo, useState } from "react";
import { GlassCard, PageTransition, SectionHeading } from "@/components/app/cinematic";
import { resolveResourceUrl } from "@/lib/api";
import { useStudentDashboard } from "@/lib/student-session";
import { STUDY_SUBJECTS } from "@/lib/subjects";

export const Route = createFileRoute("/app/resources")({ component: ResourcesPage });

function ResourcesPage() {
  const { dashboard } = useStudentDashboard();
  const resources = dashboard?.resource_items ?? [];
  const professorOptions = useMemo(
    () => ["All professors", ...Array.from(new Set(resources.map((r) => r.professorName).filter(Boolean)))],
    [resources],
  );
  const [subjectFilter, setSubjectFilter] = useState("All subjects");
  const [professorFilter, setProfessorFilter] = useState("All professors");
  const [q, setQ] = useState("");
  const items = resources.filter((resource) => {
    const query = q.trim().toLowerCase();
    const matchesQuery =
      !query ||
      [resource.title, resource.subject, resource.type, resource.professorName, resource.time]
        .join(" ")
        .toLowerCase()
        .includes(query);
    const matchesSubject = matchesTypedFilter(resource.subject, subjectFilter, "All subjects");
    const matchesProfessor = matchesTypedFilter(resource.professorName, professorFilter, "All professors");
    return matchesQuery && matchesSubject && matchesProfessor;
  });
  const trending = resources.filter((r) => r.tag === "trending" || r.tag === "new").slice(0, 4);

  return (
    <PageTransition>
      <SectionHeading
        eyebrow="Library"
        title="Study Resources"
        sub="Books, notes, lectures - searchable, instantly."
      />

      <div className="grid gap-3 mb-6 xl:grid-cols-[1fr_320px_320px]">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-white/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the library..."
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

      <GlassCard className="mb-8">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-white/40 mb-4">
          <TrendingUp className="size-3" /> Trending this week
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {(trending.length ? trending : resources).slice(0, 6).map((r) => (
            <div key={r.id} className="min-w-[240px] glass rounded-2xl p-4">
              <div
                className="h-24 rounded-xl mb-3"
                style={{
                  background:
                    "linear-gradient(135deg, oklch(0.7 0.25 310 / 0.5), oklch(0.65 0.25 260 / 0.2))",
                }}
              />
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">
                {r.subject}
              </div>
              <div className="font-medium mt-0.5 truncate">{r.title}</div>
              <div className="mt-1 text-xs text-white/40 truncate">{r.professorName}</div>
            </div>
          ))}
          {resources.length === 0 && (
            <div className="text-sm text-white/45">No study resources uploaded yet.</div>
          )}
        </div>
      </GlassCard>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((r, i) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <GlassCard hover className="h-full flex flex-col">
              <div
                className="h-32 rounded-2xl mb-4 relative overflow-hidden"
                style={{
                  background:
                    "linear-gradient(135deg, oklch(0.65 0.28 305 / 0.45), oklch(0.82 0.18 200 / 0.2))",
                }}
              >
                <div className="absolute inset-0 grid-bg opacity-30" />
                <span className="absolute top-3 right-3 text-[10px] uppercase tracking-widest px-2 py-1 rounded-full bg-black/40 text-white/80">
                  {r.type}
                </span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">
                {r.subject}
              </div>
              <div className="font-medium mt-1 flex-1">{r.title}</div>
              <div className="mt-2 text-xs text-white/45">
                {r.professorName} / {r.time}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <IconAction icon={Eye} label="Open" href={resolveResourceUrl(r.url)} />
                <IconAction icon={Download} label="Download" href={resolveResourceUrl(r.url)} download />
                <IconAction icon={Bookmark} label="Save" active={r.tag === "bookmarked"} />
              </div>
            </GlassCard>
          </motion.div>
        ))}
        {items.length === 0 && (
          <div className="md:col-span-2 lg:col-span-3 rounded-3xl border border-dashed border-white/15 py-14 text-center text-sm text-white/45">
            No study resources match these filters.
          </div>
        )}
      </div>
    </PageTransition>
  );
}

function matchesTypedFilter(value: string, filter: string, allLabel: string) {
  const normalized = filter.trim().toLowerCase();
  if (!normalized || normalized === allLabel.toLowerCase()) return true;
  return value.toLowerCase().includes(normalized);
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
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const normalizedValue = value.trim().toLowerCase();
  const filteredOptions = useMemo(() => {
    const exactSelection = options.some((option) => option.toLowerCase() === normalizedValue);
    if (!normalizedValue || exactSelection) return options;
    return options.filter((option) => option.toLowerCase().includes(normalizedValue));
  }, [normalizedValue, options]);

  return (
    <div className="relative">
      <label className="glass rounded-full px-4 py-3 flex items-center gap-3">
      <Icon className="size-4 text-white/40" />
      <input
        id={id}
        value={value}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        autoComplete="off"
        className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-white/30 focus:outline-none"
      />
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((value) => !value)}
        className="rounded-full p-1 text-white/45 transition hover:text-white"
        aria-label="Open options"
      >
        <ChevronDown className={`size-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      </label>

      {open && (
        <div
          id={`${id}-menu`}
          className="absolute left-0 right-0 top-[calc(100%+8px)] z-[80] max-h-72 overflow-y-auto rounded-2xl border border-white/12 bg-[#101010]/98 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl"
          role="listbox"
        >
          {filteredOptions.map((option) => (
            <button
              key={option}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
              className={`block w-full rounded-xl px-3 py-2.5 text-left text-sm transition ${
                option === value ? "bg-white/12 text-white" : "text-white/65 hover:bg-white/8 hover:text-white"
              }`}
              role="option"
              aria-selected={option === value}
            >
              {option}
            </button>
          ))}
          {filteredOptions.length === 0 && (
            <div className="px-3 py-4 text-sm text-white/40">No matching option.</div>
          )}
        </div>
      )}
    </div>
  );
}

function IconAction({
  icon: Icon,
  label,
  active,
  href,
  download,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  href?: string;
  download?: boolean;
}) {
  const className = `flex-1 glass rounded-full py-2 text-xs flex items-center justify-center gap-1.5 hover:border-white/30 transition ${
    active ? "text-white" : href === "" ? "text-white/30 pointer-events-none" : "text-white/60"
  }`;

  if (href !== undefined) {
    return (
      <a href={href || undefined} target="_blank" rel="noreferrer" download={download} className={className}>
        <Icon className="size-3.5" /> {label}
      </a>
    );
  }

  return (
    <button className={className}>
      <Icon className="size-3.5" /> {label}
    </button>
  );
}
