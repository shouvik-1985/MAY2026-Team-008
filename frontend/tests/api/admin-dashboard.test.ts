import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAdminAnnouncement,
  getAdminDashboard,
  updateAdminAttendanceRadius,
  updateAdminSemesterFee,
  updateAdminUserBlock,
} from "../../src/lib/api";

function response(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function signInAsAdmin() {
  const values = new Map([
    ["cv-access-token", "admin-token"],
    ["cv-access-token-expires", "2030-01-01T00:00:00Z"],
    ["cv-auth-user", JSON.stringify({ id: 1, role: "admin" })],
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

describe("admin dashboard API", () => {
  it("loads the dashboard using the signed-in admin token", async () => {
    signInAsAdmin();
    const fetchMock = response({ admin: { name: "Admin" }, students: [], professors: [] });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAdminDashboard()).resolves.toMatchObject({ admin: { name: "Admin" } });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/admin/dashboard",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect((fetchMock.mock.calls[0][1].headers as Headers).get("Authorization")).toBe(
      "Bearer admin-token",
    );
  });

  it("posts an announcement with its audience and pinned state", async () => {
    signInAsAdmin();
    const fetchMock = response({ ok: true, message: "Published" });
    vi.stubGlobal("fetch", fetchMock);

    await createAdminAnnouncement({
      title: "Exam timetable",
      category: "Academic",
      audience: "Students",
      body: "Check the portal.",
      pinned: true,
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/admin/announcements");
    expect(options).toMatchObject({ method: "POST" });
    expect(JSON.parse(options.body)).toEqual({
      title: "Exam timetable",
      category: "Academic",
      audience: "Students",
      body: "Check the portal.",
      pinned: true,
    });
  });

  it("updates the attendance radius and campus coordinates", async () => {
    signInAsAdmin();
    const fetchMock = response({ radius_meters: 150 });
    vi.stubGlobal("fetch", fetchMock);

    await updateAdminAttendanceRadius({
      radius_meters: 150,
      latitude: 12.9716,
      longitude: 77.5946,
      campus_name: "North Campus",
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/admin/management/attendance-radius");
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body)).toEqual({
      radius_meters: 150,
      latitude: 12.9716,
      longitude: 77.5946,
      campus_name: "North Campus",
    });
  });

  it("blocks a user with an audit reason", async () => {
    signInAsAdmin();
    const fetchMock = response({ ok: true, is_blocked: true });
    vi.stubGlobal("fetch", fetchMock);

    await updateAdminUserBlock(42, { blocked: true, reason: "Account verification required" });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/admin/users/42/block");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({
      blocked: true,
      reason: "Account verification required",
    });
  });

  it("persists an edited semester fee", async () => {
    signInAsAdmin();
    const fetchMock = response({ settings: [] });
    vi.stubGlobal("fetch", fetchMock);

    await updateAdminSemesterFee(6, { amount: 72500 });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/admin/fees/settings/6");
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body)).toEqual({ amount: 72500 });
  });
});
