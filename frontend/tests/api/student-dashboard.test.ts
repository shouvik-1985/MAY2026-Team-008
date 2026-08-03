import { afterEach, describe, expect, it, vi } from "vitest";
import { getStudentDashboard, type StudentDashboard } from "../../src/lib/api";

const dashboard = {
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
  metrics: [{ label: "CGPA", value: "9.1", hint: "Current CGPA", tone: "cyan" }],
  student_todos: [],
} as unknown as StudentDashboard;

function mockJsonResponse(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
    key: vi.fn((index: number) => [...values.keys()][index] ?? null),
  };
}

function stubBrowser(token: string | null = "student-token") {
  const localStorage = createStorage(
    token
      ? {
          "cv-access-token": token,
          "cv-access-token-expires": "2030-01-01T00:00:00Z",
          "cv-auth-user": JSON.stringify({ id: 42 }),
        }
      : {},
  );
  const sessionStorage = createStorage();
  vi.stubGlobal("window", { localStorage, sessionStorage });
  return { localStorage, sessionStorage };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("student dashboard API", () => {
  it("loads the dashboard with the student access token", async () => {
    stubBrowser();
    const fetchMock = mockJsonResponse(dashboard);
    vi.stubGlobal("fetch", fetchMock);

    await expect(getStudentDashboard()).resolves.toEqual(dashboard);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/student/dashboard");
    expect((options.headers as Headers).get("Authorization")).toBe("Bearer student-token");
  });

  it("does not call the backend when the student is not signed in", async () => {
    stubBrowser(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(getStudentDashboard()).rejects.toThrow(
      "Your login session expired. Please sign in again.",
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears the stored session when the backend rejects an invalid token", async () => {
    const { localStorage } = stubBrowser();
    vi.stubGlobal("fetch", mockJsonResponse({ detail: "Could not validate credentials" }, 401));

    await expect(getStudentDashboard()).rejects.toThrow("Could not validate credentials");

    expect(localStorage.removeItem).toHaveBeenCalledWith("cv-access-token");
    expect(localStorage.removeItem).toHaveBeenCalledWith("cv-auth-user");
    expect(localStorage.getItem("cv-access-token")).toBeNull();
  });

  it("keeps the session for a server error that is unrelated to authentication", async () => {
    const { localStorage } = stubBrowser();
    vi.stubGlobal("fetch", mockJsonResponse({ detail: "Dashboard service unavailable" }, 503));

    await expect(getStudentDashboard()).rejects.toThrow("Dashboard service unavailable");

    expect(localStorage.getItem("cv-access-token")).toBe("student-token");
  });

  it("uses a default error message when the dashboard response has no detail", async () => {
    stubBrowser();
    vi.stubGlobal("fetch", mockJsonResponse({}, 500));

    await expect(getStudentDashboard()).rejects.toThrow("Request failed with 500");
  });

  it("passes through a network failure", async () => {
    stubBrowser();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network unavailable")));

    await expect(getStudentDashboard()).rejects.toThrow("Network unavailable");
  });
});
