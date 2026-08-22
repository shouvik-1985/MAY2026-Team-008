// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StudentDashboard } from "../../src/lib/api";
import {
  clearStoredDashboard,
  getStoredDashboard,
  setStoredDashboard,
} from "../../src/lib/student-session";

function makeDashboard(overrides: Partial<StudentDashboard> = {}): StudentDashboard {
  return {
    user: {
      name: "Test Student",
      email: "student@university.edu",
      studentCode: "CV2026001",
      department: "Computer Science",
      semester: 6,
      cgpa: 9.1,
      attendance: 92,
      avatar: "TS",
    },
    metrics: [],
    cgpa_trend: [],
    attendance_weekly: [],
    attendance_timeline: [],
    attendance_by_subject: [],
    attendance_monthly: [],
    fee_summary: {
      outstanding: 0,
      semester: "Sem 6",
      dueDate: "Cleared",
      clearance: "Cleared",
      trend: [],
    },
    fee_history: [],
    module_health: [],
    upcoming_deadlines: [],
    request_timeline: [],
    announcements: [],
    notifications: [],
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
    nav_modules: [],
    student_todos: [],
    ...overrides,
  };
}

afterEach(() => {
  clearStoredDashboard();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("student dashboard cache", () => {
  it("keeps inline avatar data in memory but strips it from persistent dashboard storage", () => {
    const avatarUrl = `data:image/png;base64,${"a".repeat(120)}`;
    const dashboard = makeDashboard({
      user: {
        ...makeDashboard().user,
        avatarUrl,
      },
    });

    setStoredDashboard(dashboard);

    expect(getStoredDashboard()?.user.avatarUrl).toBe(avatarUrl);
    const stored = JSON.parse(
      window.localStorage.getItem("cv-student-dashboard") ?? "{}",
    ) as StudentDashboard;
    expect(stored.user.avatarUrl).toBeNull();
  });

  it("recovers from a quota error without blocking dashboard updates", () => {
    const originalSetItem = Storage.prototype.setItem;
    const dashboard = makeDashboard();
    const updates: StudentDashboard[] = [];
    let dashboardWriteAttempts = 0;

    window.localStorage.setItem("cv-user-avatar", "legacy-avatar-cache");
    window.addEventListener("cv-student-dashboard-updated", (event) => {
      updates.push((event as CustomEvent<StudentDashboard>).detail);
    });

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function setItem(this: Storage,
      key: string,
      value: string,
    ) {
      if (key === "cv-student-dashboard") {
        dashboardWriteAttempts += 1;
        if (dashboardWriteAttempts === 1) {
          throw Object.assign(new Error("quota exceeded"), {
            name: "QuotaExceededError",
            code: 22,
          });
        }
      }
      return originalSetItem.call(this, key, value);
    });

    expect(() => setStoredDashboard(dashboard)).not.toThrow();

    expect(updates).toEqual([dashboard]);
    expect(getStoredDashboard()).toEqual(dashboard);
    expect(window.localStorage.getItem("cv-user-avatar")).toBeNull();
    expect(window.localStorage.getItem("cv-student-dashboard")).toContain("Test Student");
  });
});
