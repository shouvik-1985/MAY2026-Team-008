import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createProfessorAssignment,
  finalizeProfessorAttendance,
  getProfessorDashboard,
  markProfessorAttendance,
  updateProfessorAssignmentSubmissionReview,
  updateStudentBlock,
} from "../../src/lib/api";

function response(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function signInAsProfessor() {
  const values = new Map([
    ["cv-access-token", "professor-token"],
    ["cv-access-token-expires", "2030-01-01T00:00:00Z"],
    ["cv-auth-user", JSON.stringify({ id: 7, role: "faculty" })],
  ]);
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: vi.fn(),
      removeItem: vi.fn(),
    },
    sessionStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("professor dashboard API", () => {
  it("loads the professor dashboard with the current session", async () => {
    signInAsProfessor();
    const fetchMock = response({ professor: { name: "Dr. Ada" }, students: [], review_queue: [] });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getProfessorDashboard()).resolves.toMatchObject({
      professor: { name: "Dr. Ada" },
    });
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8000/api/professor/dashboard");
    expect((fetchMock.mock.calls[0][1].headers as Headers).get("Authorization")).toBe(
      "Bearer professor-token",
    );
  });

  it("marks a student's attendance with the chosen status", async () => {
    signInAsProfessor();
    const fetchMock = response({ ok: true, status: "present" });
    vi.stubGlobal("fetch", fetchMock);

    await markProfessorAttendance({ student_id: 12, status: "present" });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/professor/attendance/mark");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ student_id: 12, status: "present" });
  });

  it("finalizes attendance without sending an unnecessary request body", async () => {
    signInAsProfessor();
    const fetchMock = response({ ok: true, markedAbsent: 2 });
    vi.stubGlobal("fetch", fetchMock);

    await finalizeProfessorAttendance();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/professor/attendance/finalize",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });

  it("creates an assignment from selected resource IDs", async () => {
    signInAsProfessor();
    const fetchMock = response({ ok: true, assignment: {}, message: "Created" });
    vi.stubGlobal("fetch", fetchMock);

    await createProfessorAssignment({
      assignment_type: "mcq",
      title: "Quiz 1",
      subject: "Algorithms",
      source_kind: "resources",
      resource_ids: [3, 4],
      question_count: 5,
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/professor/assignments/generate");
    expect(JSON.parse(options.body)).toMatchObject({
      title: "Quiz 1",
      resource_ids: [3, 4],
      question_count: 5,
    });
  });

  it("saves a reviewed submission's score, grade, and feedback", async () => {
    signInAsProfessor();
    const fetchMock = response({ ok: true, submission: {} });
    vi.stubGlobal("fetch", fetchMock);

    await updateProfessorAssignmentSubmissionReview(90, {
      score: 88,
      grade: "A",
      feedback: "Clear reasoning",
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/professor/assignments/submissions/90/review");
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body)).toEqual({
      score: 88,
      grade: "A",
      feedback: "Clear reasoning",
    });
  });

  it("sends the reason when a professor blocks a student", async () => {
    signInAsProfessor();
    const fetchMock = response({ ok: true, is_blocked: true });
    vi.stubGlobal("fetch", fetchMock);

    await updateStudentBlock(12, { blocked: true, reason: "Repeated misconduct" });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://localhost:8000/api/professor/students/12/block",
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      blocked: true,
      reason: "Repeated misconduct",
    });
  });
});
