// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { HTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudentDashboard, StudentTodo } from "../../src/lib/api";

const api = vi.hoisted(() => ({
  getStudentDashboard: vi.fn(),
  createStudentTodo: vi.fn(),
  updateStudentTodo: vi.fn(),
  deleteStudentTodo: vi.fn(),
}));

const session = vi.hoisted(() => ({
  getStoredDashboard: vi.fn(),
  setStoredDashboard: vi.fn(),
}));

vi.mock("../../src/lib/api", () => api);
vi.mock("../../src/lib/student-session", () => session);
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  lazyRouteComponent: () => () => null,
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock("framer-motion", () => ({
  motion: { div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div> },
}));
vi.mock("recharts", () => {
  const Box = () => null;
  return {
    Area: Box,
    AreaChart: Box,
    CartesianGrid: Box,
    Line: Box,
    LineChart: Box,
    ResponsiveContainer: Box,
    Tooltip: Box,
    XAxis: Box,
    YAxis: Box,
  };
});
vi.mock("../../src/components/app/cinematic", () => ({
  PageTransition: ({ children }: { children: ReactNode }) => <>{children}</>,
  GlassCard: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));

import { Dashboard } from "../../src/routes/app/index";

const todo: StudentTodo = {
  id: 1,
  title: "Finish assignment",
  completed: false,
  dueAt: "2030-05-20T10:00:00Z",
};

function makeDashboard(overrides: Partial<StudentDashboard> = {}): StudentDashboard {
  return {
    user: {
      name: "Ava Student",
      email: "ava@university.edu",
      studentCode: "CV2026001",
      department: "Computer Science",
      semester: 6,
      cgpa: 9.1,
      attendance: 92,
      avatar: "AS",
    },
    metrics: [
      { label: "CGPA", value: "9.1", hint: "Strong performance", tone: "cyan" },
      { label: "Attendance", value: "92%", hint: "Above safe zone", tone: "green" },
      { label: "Open Requests", value: "2", hint: "One updated today", tone: "pink" },
      { label: "Due This Week", value: "3", hint: "Plan ahead", tone: "amber" },
    ],
    cgpa_trend: [{ term: "Sem 6", cgpa: 9.1 }],
    attendance_weekly: [{ day: "Mon", attendance: 92 }],
    attendance_timeline: [
      { date: "2030-05-20", label: "May 20", month: "May", attendance: 92, status: "present", present: 5, absent: 0, marked: 5 },
    ],
    attendance_by_subject: [],
    attendance_monthly: [{ month: "May", attendance: 92, present: 20, absent: 2 }],
    fee_summary: { outstanding: 0, semester: "Sem 6", dueDate: "May 31", clearance: "Cleared", trend: [] },
    fee_history: [],
    module_health: [{ module: "Assignments", status: "1 pending", detail: "Submit by Friday" }],
    upcoming_deadlines: [{ title: "Algorithms assignment", module: "Academics", due: "May 24", risk: "high" }],
    request_timeline: [{ title: "Bonafide certificate", kind: "Certificate", stage: "Ready", updated: "Today" }],
    announcements: [],
    assignment_items: [],
    resource_items: [],
    complaint_items: [],
    certificate_items: [],
    event_items: [],
    marketplace_items: [],
    scholarship_items: [],
    ai_context: { chat_history: [], suggested_prompts: [] },
    achievements: [],
    skills: [],
    activity: [],
    nav_modules: [],
    student_todos: [],
    ...overrides,
  };
}

function renderDashboard(data = makeDashboard()) {
  api.getStudentDashboard.mockResolvedValue(data);
  return render(<Dashboard />);
}

async function renderLoadedDashboard(data = makeDashboard()) {
  renderDashboard(data);
  await screen.findByText("Backend live");
}

beforeEach(() => {
  vi.clearAllMocks();
  session.getStoredDashboard.mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("student dashboard", () => {
  it("shows the student dashboard heading", async () => {
    await renderLoadedDashboard();
    expect(screen.getByText("Ava's academic command center")).toBeInTheDocument();
  });

  it("shows the student code, semester, and department", async () => {
    await renderLoadedDashboard();
    expect(screen.getByText("CV2026001 / Sem 6")).toBeInTheDocument();
    expect(screen.getByText("Computer Science")).toBeInTheDocument();
  });

  it("shows that the dashboard is syncing before the request completes", () => {
    api.getStudentDashboard.mockReturnValue(new Promise(() => {}));
    render(<Dashboard />);
    expect(screen.getAllByText("Syncing").length).toBeGreaterThan(0);
  });

  it("marks the backend as live after loading dashboard data", async () => {
    renderDashboard();
    expect(await screen.findByText("Backend live")).toBeInTheDocument();
  });

  it("stores freshly loaded dashboard data for later use", async () => {
    const data = makeDashboard();
    renderDashboard(data);
    await waitFor(() => expect(session.setStoredDashboard).toHaveBeenCalledWith(data));
  });

  it("uses cached dashboard data while a fresh request is loading", () => {
    const cached = makeDashboard({ user: { ...makeDashboard().user, name: "Cached Student" } });
    session.getStoredDashboard.mockReturnValue(cached);
    api.getStudentDashboard.mockReturnValue(new Promise(() => {}));
    render(<Dashboard />);
    expect(screen.getByText("Cached's academic command center")).toBeInTheDocument();
  });

  it("shows demo data when loading fails without a cache", async () => {
    api.getStudentDashboard.mockRejectedValue(new Error("Offline"));
    render(<Dashboard />);
    expect(await screen.findByText("Demo data")).toBeInTheDocument();
    expect(screen.getByText("Student's academic command center")).toBeInTheDocument();
  });

  it("falls back to cached data when loading fails", async () => {
    const cached = makeDashboard({ user: { ...makeDashboard().user, name: "Cached Student" } });
    session.getStoredDashboard.mockReturnValue(cached);
    api.getStudentDashboard.mockRejectedValue(new Error("Offline"));
    render(<Dashboard />);
    expect(await screen.findByText("Demo data")).toBeInTheDocument();
    expect(screen.getByText("Cached's academic command center")).toBeInTheDocument();
  });

  it("shows all dashboard metrics", async () => {
    await renderLoadedDashboard();
    ["CGPA", "Attendance", "Open Requests", "Due This Week"].forEach((label) => {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    });
  });

  it("shows module health, deadlines, and request status", async () => {
    await renderLoadedDashboard();
    expect(screen.getByText("Submit by Friday")).toBeInTheDocument();
    expect(screen.getByText("Algorithms assignment")).toBeInTheDocument();
    expect(screen.getByText("Bonafide certificate")).toBeInTheDocument();
  });

  it("shows eligible attendance when attendance is at least 75 percent", async () => {
    await renderLoadedDashboard();
    expect(screen.getByText("Eligible")).toBeInTheDocument();
  });

  it("shows that more classes are needed when attendance is below 75 percent", async () => {
    await renderLoadedDashboard(makeDashboard({ user: { ...makeDashboard().user, attendance: 74 } }));
    expect(screen.getByText("Needs classes")).toBeInTheDocument();
  });

  it("shows cleared fee eligibility", async () => {
    await renderLoadedDashboard();
    expect(screen.getAllByText("Cleared").length).toBeGreaterThan(0);
  });

  it("shows the current fee-clearance status when fees are not cleared", async () => {
    await renderLoadedDashboard(makeDashboard({ fee_summary: { ...makeDashboard().fee_summary, clearance: "Payment due" } }));
    expect(screen.getByText("Payment due")).toBeInTheDocument();
  });

  it("starts in daily-attendance mode", async () => {
    await renderLoadedDashboard();
    expect(screen.getByText("Attendance by days")).toBeInTheDocument();
  });

  it("switches to monthly attendance mode", async () => {
    const user = userEvent.setup();
    await renderLoadedDashboard();
    await user.click(screen.getByRole("button", { name: "months" }));
    expect(screen.getByText("Attendance by month")).toBeInTheDocument();
  });

  it("keeps the attendance panel available when current records are empty", async () => {
    const data = makeDashboard({ attendance_weekly: [], attendance_timeline: [], attendance_monthly: [] });
    renderDashboard(data);
    await screen.findByText("Backend live");
    expect(screen.getByText("Attendance by days")).toBeInTheDocument();
  });

  it("shows the empty todo state", async () => {
    await renderLoadedDashboard();
    expect(screen.getByText(/Add a plan for today/)).toBeInTheDocument();
  });

  it("shows open todo count and todo details", async () => {
    await renderLoadedDashboard(makeDashboard({ student_todos: [todo] }));
    expect(screen.getByText("Finish assignment")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("disables adding an empty todo", async () => {
    await renderLoadedDashboard();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it("creates a todo with a trimmed title", async () => {
    const user = userEvent.setup();
    api.createStudentTodo.mockResolvedValue({ todos: [todo] });
    await renderLoadedDashboard();
    await user.type(screen.getByPlaceholderText("Write today's plan or future task..."), "  Finish assignment  ");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(api.createStudentTodo).toHaveBeenCalledWith({ title: "Finish assignment", due_at: null }));
  });

  it("creates a todo with the selected due date", async () => {
    const user = userEvent.setup();
    api.createStudentTodo.mockResolvedValue({ todos: [todo] });
    await renderLoadedDashboard();
    await user.type(screen.getByPlaceholderText("Write today's plan or future task..."), "Finish assignment");
    fireEvent.change(screen.getByDisplayValue(""), { target: { value: "2030-05-20T10:00" } });
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(api.createStudentTodo).toHaveBeenCalledWith({ title: "Finish assignment", due_at: "2030-05-20T10:00:00.000Z" }));
  });

  it("clears the todo form after creating a todo", async () => {
    const user = userEvent.setup();
    api.createStudentTodo.mockResolvedValue({ todos: [todo] });
    await renderLoadedDashboard();
    const input = screen.getByPlaceholderText("Write today's plan or future task...");
    await user.type(input, "Finish assignment");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("shows demo data if todo creation fails", async () => {
    const user = userEvent.setup();
    api.createStudentTodo.mockRejectedValue(new Error("Offline"));
    await renderLoadedDashboard();
    await user.type(screen.getByPlaceholderText("Write today's plan or future task..."), "Finish assignment");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Demo data")).toBeInTheDocument();
  });

  it("marks an open todo as complete", async () => {
    const user = userEvent.setup();
    api.updateStudentTodo.mockResolvedValue({ todos: [{ ...todo, completed: true }] });
    await renderLoadedDashboard(makeDashboard({ student_todos: [todo] }));
    await user.click(screen.getByRole("button", { name: "Mark todo complete" }));
    await waitFor(() => expect(api.updateStudentTodo).toHaveBeenCalledWith(1, { completed: true }));
  });

  it("marks a completed todo as incomplete", async () => {
    const user = userEvent.setup();
    const completed = { ...todo, completed: true };
    api.updateStudentTodo.mockResolvedValue({ todos: [todo] });
    await renderLoadedDashboard(makeDashboard({ student_todos: [completed] }));
    await user.click(screen.getByRole("button", { name: "Mark todo incomplete" }));
    await waitFor(() => expect(api.updateStudentTodo).toHaveBeenCalledWith(1, { completed: false }));
  });

  it("deletes a todo", async () => {
    const user = userEvent.setup();
    api.deleteStudentTodo.mockResolvedValue({ todos: [] });
    await renderLoadedDashboard(makeDashboard({ student_todos: [todo] }));
    await user.click(screen.getByRole("button", { name: "Delete todo" }));
    await waitFor(() => expect(api.deleteStudentTodo).toHaveBeenCalledWith(1));
    expect(await screen.findByText(/Add a plan for today/)).toBeInTheDocument();
  });

  it("stores todo updates in the cached dashboard", async () => {
    const user = userEvent.setup();
    api.updateStudentTodo.mockResolvedValue({ todos: [{ ...todo, completed: true }] });
    await renderLoadedDashboard(makeDashboard({ student_todos: [todo] }));
    await user.click(screen.getByRole("button", { name: "Mark todo complete" }));
    await waitFor(() => expect(session.setStoredDashboard).toHaveBeenCalledWith(expect.objectContaining({ student_todos: [{ ...todo, completed: true }] })));
  });
});
