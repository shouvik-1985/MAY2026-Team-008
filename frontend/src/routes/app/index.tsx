import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState, type ComponentType, type FormEvent } from "react";
import {
  AlertCircle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  GraduationCap,
  LineChart as LineIcon,
  ListTodo,
  MessageSquare,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { GlassCard, PageTransition } from "@/components/app/cinematic";
import {
  createStudentTodo,
  deleteStudentTodo,
  getStudentDashboard,
  updateStudentTodo,
  type StudentDashboard,
  type StudentTodo,
} from "@/lib/api";
import { getStoredDashboard, setStoredDashboard } from "@/lib/student-session";

export const Route = createFileRoute("/app/")({ component: Dashboard });

const FALLBACK_DASHBOARD: StudentDashboard = {
  user: {
    name: "Student",
    email: "",
    studentCode: "Syncing",
    department: "Computer Science & AI",
    semester: 1,
    cgpa: 0,
    attendance: 0,
    avatar: "CV",
  },
  metrics: [
    { label: "CGPA", value: "9.2", hint: "+0.3 this semester", tone: "cyan" },
    { label: "Attendance", value: "92%", hint: "17% above safe zone", tone: "green" },
    { label: "Open Requests", value: "4", hint: "2 moved today", tone: "pink" },
    { label: "Due This Week", value: "5", hint: "1 assignment tomorrow", tone: "amber" },
  ],
  cgpa_trend: [
    { term: "Sem 1", cgpa: 8.1 },
    { term: "Sem 2", cgpa: 8.4 },
    { term: "Sem 3", cgpa: 8.7 },
    { term: "Sem 4", cgpa: 8.9 },
    { term: "Sem 5", cgpa: 9.0 },
    { term: "Sem 6", cgpa: 9.2 },
  ],
  attendance_weekly: [
    { day: "Mon", attendance: 82 },
    { day: "Tue", attendance: 88 },
    { day: "Wed", attendance: 95 },
    { day: "Thu", attendance: 90 },
    { day: "Fri", attendance: 92 },
    { day: "Sat", attendance: 100 },
    { day: "Sun", attendance: 85 },
  ],
  attendance_timeline: [],
  attendance_by_subject: [
    { subject: "Advanced ML", attendance: 96, status: "excellent" },
    { subject: "Distributed Systems", attendance: 88, status: "healthy" },
    { subject: "HCI Studio", attendance: 94, status: "excellent" },
    { subject: "Robotics", attendance: 81, status: "watch" },
    { subject: "Mathematics", attendance: 90, status: "healthy" },
  ],
  attendance_monthly: [
    { month: "Jan", attendance: 78 },
    { month: "Feb", attendance: 82 },
    { month: "Mar", attendance: 84 },
  ],
  fee_summary: {
    outstanding: 0,
    semester: "Sem 1",
    dueDate: "Syncing",
    clearance: "Syncing",
    trend: [0, 0, 0],
  },
  fee_history: [],
  module_health: [
    { module: "Announcements", status: "3 unread", detail: "Mid-sem schedule, fee deadline" },
    { module: "Assignments", status: "0 pending", detail: "No assignments published yet" },
    { module: "Complaints", status: "1 in progress", detail: "Hostel Wi-Fi assigned" },
    { module: "Certificates", status: "1 ready", detail: "Bonafide certificate available" },
    { module: "Fees", status: "Due Apr 05", detail: "Semester 6 invoice generated" },
    { module: "Resources", status: "12 new", detail: "Slides, notes, previous papers" },
  ],
  upcoming_deadlines: [
    { title: "Semester 6 fee payment", module: "Fees", due: "Apr 05", risk: "medium" },
    { title: "Mid-Sem examination", module: "Academics", due: "Apr 14", risk: "medium" },
    { title: "TEDxCampusVerse registration", module: "Events", due: "Apr 18", risk: "low" },
  ],
  request_timeline: [
    { title: "Hostel B Wi-Fi outage", kind: "Complaint", stage: "In Progress", updated: "Today" },
    { title: "Bonafide Certificate", kind: "Certificate", stage: "Ready", updated: "Yesterday" },
    { title: "Sem 6 Fee Receipt", kind: "Fees", stage: "Awaiting Payment", updated: "2 days ago" },
  ],
  announcements: [
    {
      id: 1,
      pinned: true,
      title: "Mid-Sem Schedule Released",
      category: "Academic",
      time: "12 min ago",
      unread: true,
      body: "Exam schedule is syncing from the backend.",
    },
    {
      id: 2,
      pinned: false,
      title: "Fee status syncing",
      category: "Fees",
      time: "Yesterday",
      unread: true,
      body: "Fee status will update after backend sync.",
    },
    {
      id: 3,
      pinned: false,
      title: "New resources syncing",
      category: "Library",
      time: "3 days ago",
      unread: false,
      body: "Study resources will update after backend sync.",
    },
  ],
  assignment_items: [],
  resource_items: [],
  complaint_items: [],
  certificate_items: [],
  event_items: [],
  marketplace_items: [],
  scholarship_items: [],
  ai_context: {
    chat_history: [],
    suggested_prompts: [],
  },
  achievements: [],
  skills: [],
  activity: [],
  nav_modules: [
    { label: "Announcements", path: "/app/announcements", feature: "Centralized updates" },
    { label: "Assignments", path: "/app/assignments", feature: "Submission and grading" },
    { label: "Complaints", path: "/app/complaints", feature: "Live request tracking" },
    { label: "Fees", path: "/app/fees", feature: "Payment verification" },
    { label: "Placement", path: "/app/placement", feature: "Internship and job readiness" },
  ],
  student_todos: [],
};

const TONE: Record<string, { bg: string; border: string; text: string }> = {
  cyan: {
    bg: "oklch(0.82 0.18 200 / 0.16)",
    border: "oklch(0.82 0.18 200 / 0.35)",
    text: "oklch(0.86 0.14 200)",
  },
  green: {
    bg: "oklch(0.72 0.18 150 / 0.16)",
    border: "oklch(0.72 0.18 150 / 0.35)",
    text: "oklch(0.82 0.16 150)",
  },
  pink: {
    bg: "oklch(0.72 0.27 350 / 0.16)",
    border: "oklch(0.72 0.27 350 / 0.35)",
    text: "oklch(0.82 0.2 350)",
  },
  amber: {
    bg: "oklch(0.85 0.12 60 / 0.16)",
    border: "oklch(0.85 0.12 60 / 0.35)",
    text: "oklch(0.9 0.1 70)",
  },
};

export function Dashboard() {
  const [dashboard, setDashboard] = useState<StudentDashboard>(
    () => getStoredDashboard() ?? FALLBACK_DASHBOARD,
  );
  const [apiState, setApiState] = useState<"loading" | "live" | "offline">("loading");
  const [attendanceGraphMode, setAttendanceGraphMode] = useState<"days" | "months">("days");
  const [todoTitle, setTodoTitle] = useState("");
  const [todoDueAt, setTodoDueAt] = useState("");
  const [todoBusy, setTodoBusy] = useState<"create" | number | null>(null);

  useEffect(() => {
    let mounted = true;
    getStudentDashboard()
      .then((data) => {
        if (!mounted) return;
        setDashboard(data);
        setStoredDashboard(data);
        setApiState("live");
      })
      .catch(() => {
        if (!mounted) return;
        setDashboard(getStoredDashboard() ?? FALLBACK_DASHBOARD);
        setApiState("offline");
      });
    return () => {
      mounted = false;
    };
  }, []);

  const attendanceEligible = dashboard.user.attendance >= 75;
  const feesCleared = dashboard.fee_summary.clearance.toLowerCase() === "cleared";
  const todos = dashboard.student_todos ?? [];
  const attendanceTrend = useMemo(() => {
    if (attendanceGraphMode === "months") {
      return dashboard.attendance_monthly.map((item) => ({
        ...item,
        label: item.label ?? item.month,
        status: `${item.present ?? 0} present / ${item.absent ?? 0} absent`,
      }));
    }
    return dashboard.attendance_timeline ?? [];
  }, [attendanceGraphMode, dashboard.attendance_monthly, dashboard.attendance_timeline]);
  const attendancePreviewTrend = useMemo(() => {
    if (attendanceGraphMode === "months") {
      const source = dashboard.attendance_monthly.length
        ? dashboard.attendance_monthly
        : FALLBACK_DASHBOARD.attendance_monthly;
      return source.map((item) => ({
        ...item,
        label: item.label ?? item.month,
        status: `${item.present ?? 0} present / ${item.absent ?? 0} absent`,
      }));
    }
    const source = dashboard.attendance_weekly.length
      ? dashboard.attendance_weekly
      : FALLBACK_DASHBOARD.attendance_weekly;
    return source.map((item) => ({
      label: item.label ?? item.day,
      attendance: item.attendance,
      status:
        item.status ??
        (item.marked === false ? "unmarked" : item.attendance >= 75 ? "present" : "absent"),
    }));
  }, [attendanceGraphMode, dashboard.attendance_monthly, dashboard.attendance_weekly]);
  const attendanceTrendPreviewing =
    apiState === "loading" && attendanceTrend.length === 0 && attendancePreviewTrend.length > 0;
  const displayAttendanceTrend = attendanceTrend.length ? attendanceTrend : attendancePreviewTrend;

  function syncTodos(nextTodos: StudentTodo[]) {
    setDashboard((current) => {
      const nextDashboard = { ...current, student_todos: nextTodos };
      setStoredDashboard(nextDashboard);
      return nextDashboard;
    });
  }

  async function addTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = todoTitle.trim();
    if (!title || todoBusy) return;
    setTodoBusy("create");
    try {
      const due_at = todoDueAt ? new Date(todoDueAt).toISOString() : null;
      const result = await createStudentTodo({ title, due_at });
      syncTodos(result.todos);
      setTodoTitle("");
      setTodoDueAt("");
      setApiState("live");
    } catch {
      setApiState("offline");
    } finally {
      setTodoBusy(null);
    }
  }

  async function toggleTodo(todo: StudentTodo) {
    if (todoBusy) return;
    setTodoBusy(todo.id);
    try {
      const result = await updateStudentTodo(todo.id, { completed: !todo.completed });
      syncTodos(result.todos);
      setApiState("live");
    } catch {
      setApiState("offline");
    } finally {
      setTodoBusy(null);
    }
  }

  async function removeTodo(todo: StudentTodo) {
    if (todoBusy) return;
    setTodoBusy(todo.id);
    try {
      const result = await deleteStudentTodo(todo.id);
      syncTodos(result.todos);
      setApiState("live");
    } catch {
      setApiState("offline");
    } finally {
      setTodoBusy(null);
    }
  }

  return (
    <PageTransition>
      <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-white/45">
            <GraduationCap className="size-3.5" />
            Student dashboard
          </div>
          <h1 className="font-display text-4xl font-bold leading-tight md:text-6xl bg-gradient-to-br from-white via-white to-fuchsia-400 bg-clip-text text-transparent drop-shadow-sm">
            {dashboard.user.name.split(" ")[0]}'s academic command center
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-white/58">
            One place for CGPA, attendance, deadlines, fee status, complaints, certificates,
            assignments, resources, events, and campus updates.
          </p>
        </div>

        <div className="glass rounded-2xl px-4 py-3 text-sm text-white/65">
          <div className="text-[10px] uppercase tracking-[0.25em] text-white/35">
            {apiState === "live" ? "Backend live" : apiState === "loading" ? "Syncing" : "Demo data"}
          </div>
          <div className="mt-1 font-medium text-white">
            {dashboard.user.studentCode} / Sem {dashboard.user.semester}
          </div>
          <div className="text-xs text-white/45">{dashboard.user.department}</div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {dashboard.metrics.map((metric, index) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <MetricCard metric={metric} />
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <GlassCard className="xl:col-span-2">
          <PanelHeader
            icon={LineIcon}
            eyebrow="Academic performance"
            title="CGPA trend"
            action="/app/profile"
          />
          <div className="mt-5 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dashboard.cgpa_trend} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="cgpaFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.82 0.18 200)" stopOpacity={0.48} />
                    <stop offset="100%" stopColor="oklch(0.82 0.18 200)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="oklch(1 0 0 / 0.08)" vertical={false} />
                <XAxis dataKey="term" stroke="oklch(1 0 0 / 0.35)" tickLine={false} axisLine={false} />
                <YAxis domain={[7.5, 10]} stroke="oklch(1 0 0 / 0.35)" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "white" }} />
                <Area
                  type="monotone"
                  dataKey="cgpa"
                  stroke="oklch(0.82 0.18 200)"
                  strokeWidth={3}
                  fill="url(#cgpaFill)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <TodoPlannerCard
          todos={todos}
          title={todoTitle}
          dueAt={todoDueAt}
          busy={todoBusy}
          onTitle={setTodoTitle}
          onDueAt={setTodoDueAt}
          onAdd={addTodo}
          onToggle={toggleTodo}
          onDelete={removeTodo}
        />

        <GlassCard className="xl:col-span-3">
          <PanelHeader
            icon={BarChart3}
            eyebrow={attendanceGraphMode === "days" ? "Daily attendance" : "Monthly attendance"}
            title={attendanceGraphMode === "days" ? "Attendance by days" : "Attendance by month"}
            action="/app/attendance"
          />
          <div className="mt-4 flex justify-end">
            <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1 text-[10px] uppercase tracking-[0.18em] text-white/45">
              {(["days", "months"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setAttendanceGraphMode(mode)}
                  className={`rounded-full px-3 py-1.5 transition ${
                    attendanceGraphMode === mode
                      ? "bg-white/14 text-white shadow-[0_0_20px_oklch(0.72_0.27_350_/_0.25)]"
                      : "hover:text-white"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 h-72">
            {displayAttendanceTrend.length ? (
              <div className="relative h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={displayAttendanceTrend} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
                    <CartesianGrid stroke="oklch(1 0 0 / 0.08)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      stroke="oklch(1 0 0 / 0.35)"
                      tickLine={false}
                      axisLine={false}
                      interval={0}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis domain={[0, 100]} stroke="oklch(1 0 0 / 0.35)" tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelStyle={{ color: "white" }}
                      formatter={(value) => [`${value}%`, "Attendance"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="attendance"
                      stroke="oklch(0.85 0.12 60)"
                      strokeWidth={3}
                      dot={{ r: 4, fill: "oklch(0.85 0.12 60)" }}
                      activeDot={{ r: 6, fill: "oklch(0.85 0.12 60)" }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
                {attendanceTrendPreviewing ? (
                  <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-start px-2">
                    <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-white/45">
                      Syncing live attendance...
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.025] text-sm text-white/45">
                No attendance records marked yet.
              </div>
            )}
          </div>
        </GlassCard>

      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <GlassCard className="xl:col-span-2">
          <PanelHeader icon={CheckCircle2} eyebrow="Single source of truth" title="Module status" />
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
            {dashboard.module_health.map((item) => (
              <div key={item.module} className="group rounded-2xl border border-white/8 bg-white/[0.02] p-4 transition duration-300 hover:border-white/20 hover:bg-white/[0.05] hover:shadow-lg">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-white/90 group-hover:text-white transition-colors">{item.module}</div>
                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-white/60 shadow-sm transition group-hover:bg-white/10 group-hover:text-white">
                    {item.status}
                  </div>
                </div>
                <div className="mt-2 text-sm text-white/48">{item.detail}</div>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard>
          <PanelHeader icon={CalendarClock} eyebrow="Deadlines" title="Next actions" />
          <div className="mt-5 space-y-3">
            {dashboard.upcoming_deadlines.map((item) => (
              <div key={item.title} className="flex gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <RiskDot risk={item.risk} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{item.title}</div>
                  <div className="mt-1 text-xs text-white/45">
                    {item.module} / {item.due}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard>
          <PanelHeader icon={MessageSquare} eyebrow="Status visibility" title="Requests" action="/app/complaints" />
          <div className="mt-5 space-y-4">
            {dashboard.request_timeline.map((item, index) => (
              <div key={item.title} className="group relative pl-7 transition-all duration-300 hover:translate-x-1">
                <span className="absolute left-1 top-1.5 size-3 rounded-full bg-[oklch(0.82_0.18_200)] shadow-[0_0_12px_oklch(0.82_0.18_200_/_0.8)] group-hover:scale-125 transition-transform" />
                {index < dashboard.request_timeline.length - 1 && (
                  <span className="absolute bottom-[-18px] left-[9px] top-5 w-px bg-white/10" />
                )}
                <div className="text-sm font-medium text-white/90 group-hover:text-white">{item.title}</div>
                <div className="mt-1 text-xs text-white/45 group-hover:text-white/60 transition-colors">
                  {item.kind} / {item.stage} / {item.updated}
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard>
          <PanelHeader icon={Wallet} eyebrow="Readiness" title="Exam eligibility" action="/app/fees" />
          <div className="mt-5 space-y-3">
            <EligibilityRow
              label="Attendance"
              value={attendanceEligible ? "Eligible" : "Needs classes"}
              ok={attendanceEligible}
            />
            <EligibilityRow
              label="Fee clearance"
              value={feesCleared ? "Cleared" : dashboard.fee_summary.clearance}
              ok={feesCleared}
            />
            <EligibilityRow label="Documents" value="Verified" ok />
            <EligibilityRow label="Assignments" value={dashboard.metrics[3]?.value ?? "0"} />
          </div>
        </GlassCard>
      </div>
    </PageTransition>
  );
}

const tooltipStyle = {
  background: "oklch(0.08 0.01 280 / 0.95)",
  border: "1px solid oklch(1 0 0 / 0.12)",
  borderRadius: 12,
  color: "white",
};

function TodoPlannerCard({
  todos,
  title,
  dueAt,
  busy,
  onTitle,
  onDueAt,
  onAdd,
  onToggle,
  onDelete,
}: {
  todos: StudentTodo[];
  title: string;
  dueAt: string;
  busy: "create" | number | null;
  onTitle: (value: string) => void;
  onDueAt: (value: string) => void;
  onAdd: (event: FormEvent<HTMLFormElement>) => void;
  onToggle: (todo: StudentTodo) => void;
  onDelete: (todo: StudentTodo) => void;
}) {
  const openCount = todos.filter((todo) => !todo.completed).length;

  return (
    <GlassCard className="flex min-h-[390px] flex-col">
      <PanelHeader icon={ListTodo} eyebrow="Personal planner" title="Todo list" />
      <form onSubmit={onAdd} className="mt-5 space-y-3">
        <input
          value={title}
          onChange={(event) => onTitle(event.target.value)}
          maxLength={180}
          placeholder="Write today's plan or future task..."
          className="w-full rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-fuchsia-400/50 focus:bg-white/[0.075] focus:shadow-[0_0_20px_rgba(232,121,249,0.15)]"
        />
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input
            value={dueAt}
            onChange={(event) => onDueAt(event.target.value)}
            type="datetime-local"
            className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white outline-none transition [color-scheme:dark] focus:border-fuchsia-400/50 focus:bg-white/[0.075] focus:shadow-[0_0_20px_rgba(232,121,249,0.15)]"
          />
          <button
            type="submit"
            disabled={!title.trim() || busy === "create"}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-fuchsia-300/25 bg-fuchsia-400/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-fuchsia-400/18 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Plus className="size-4" />
            Add
          </button>
        </div>
      </form>

      <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
        <div className="text-xs text-white/48">Open plans</div>
        <div className="font-display text-2xl">{openCount}</div>
      </div>

      <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {todos.length ? (
          todos.map((todo) => (
            <div
              key={todo.id}
              className="group flex items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-3 transition hover:border-white/16 hover:bg-white/[0.055]"
            >
              <button
                type="button"
                disabled={busy === todo.id}
                onClick={() => onToggle(todo)}
                className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border transition ${
                  todo.completed
                    ? "border-emerald-300/35 bg-emerald-400/15 text-emerald-100"
                    : "border-white/12 bg-white/[0.04] text-white/40 hover:text-white"
                }`}
                aria-label={todo.completed ? "Mark todo incomplete" : "Mark todo complete"}
              >
                <CheckCircle2 className="size-4" />
              </button>
              <div className="min-w-0 flex-1">
                <div className={`break-words text-sm font-medium ${todo.completed ? "text-white/45 line-through" : ""}`}>
                  {todo.title}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-white/40">
                  <CalendarClock className="size-3.5" />
                  {formatTodoDue(todo.dueAt)}
                </div>
              </div>
              <button
                type="button"
                disabled={busy === todo.id}
                onClick={() => onDelete(todo)}
                className="grid size-8 shrink-0 place-items-center rounded-full border border-white/8 bg-white/[0.035] text-white/35 opacity-100 transition hover:border-rose-300/25 hover:bg-rose-500/10 hover:text-rose-100 sm:opacity-0 sm:group-hover:opacity-100"
                aria-label="Delete todo"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-5 text-sm leading-6 text-white/45">
            Add a plan for today, a deadline reminder, or anything future-you should not have to remember alone.
          </div>
        )}
      </div>
    </GlassCard>
  );
}

function MetricCard({ metric }: { metric: StudentDashboard["metrics"][number] }) {
  const tone = TONE[metric.tone] ?? TONE.cyan;
  return (
    <GlassCard hover className="group relative overflow-hidden">
      <div 
        className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-10 pointer-events-none" 
        style={{ background: `linear-gradient(135deg, transparent, ${tone.text})` }} 
      />
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="text-[10px] uppercase tracking-[0.25em] text-white/40 group-hover:text-white/60 transition-colors">{metric.label}</div>
        <span
          className="size-8 rounded-full border shadow-[0_0_15px_rgba(255,255,255,0.03)] transition-all duration-300 group-hover:scale-110 group-hover:shadow-[0_0_20px_rgba(255,255,255,0.12)]"
          style={{ background: tone.bg, borderColor: tone.border }}
        />
      </div>
      <div className="relative z-10 mt-3 font-display text-4xl font-bold transition-transform duration-300 group-hover:translate-x-1" style={{ color: tone.text }}>
        {metric.value}
      </div>
      <div className="relative z-10 mt-2 text-xs text-white/48 group-hover:text-white/60 transition-colors">{metric.hint}</div>
    </GlassCard>
  );
}

function PanelHeader({
  icon: Icon,
  eyebrow,
  title,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  action?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className="glass flex size-10 shrink-0 items-center justify-center rounded-2xl">
          <Icon className="size-4 text-white/70" />
        </span>
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-white/38">{eyebrow}</div>
          <div className="font-display text-xl">{title}</div>
        </div>
      </div>
      {action && (
        <Link to={action} className="text-xs text-white/45 transition hover:text-white">
          View
        </Link>
      )}
    </div>
  );
}

function formatTodoDue(value: string | null) {
  if (!value) return "Anytime";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Planned";
  return date.toLocaleString([], {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RiskDot({ risk }: { risk: string }) {
  const color =
    risk === "high"
      ? "bg-red-300"
      : risk === "medium"
        ? "bg-[oklch(0.85_0.12_60)]"
        : "bg-emerald-300";
  return <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${color}`} />;
}

function EligibilityRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="group flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3 transition hover:border-white/20 hover:bg-white/[0.04]">
      <span className="text-sm text-white/70 group-hover:text-white transition-colors">{label}</span>
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border ${
          ok ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200/90" : "border-amber-500/20 bg-amber-500/10 text-amber-200/90"
        } transition-all duration-300 group-hover:scale-105`}
      >
        {ok ? <CheckCircle2 className="size-3.5" /> : <AlertCircle className="size-3.5" />}
        {value}
      </span>
    </div>
  );
}
