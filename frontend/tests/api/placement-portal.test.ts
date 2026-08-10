import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPlacementRole,
  decidePlacementRoleApplication,
  deletePlacementRole,
  getPlacementManagerDashboard,
  selectPlacementApplication,
} from "../../src/lib/api";

function response(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function signInAsPlacementManager() {
  const values = new Map([
    ["cv-access-token", "placement-token"],
    ["cv-access-token-expires", "2030-01-01T00:00:00Z"],
    ["cv-auth-user", JSON.stringify({ id: 8, role: "placement" })],
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

describe("placement portal API", () => {
  it("loads the placement manager pipeline with authorization", async () => {
    signInAsPlacementManager();
    const fetchMock = response({ metrics: {}, applications: [], roles: [] });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPlacementManagerDashboard()).resolves.toMatchObject({
      applications: [],
      roles: [],
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://localhost:8000/api/placement/manager/dashboard",
    );
    expect((fetchMock.mock.calls[0][1].headers as Headers).get("Authorization")).toBe(
      "Bearer placement-token",
    );
  });

  it("creates a role with the eligibility requirements selected in the portal", async () => {
    signInAsPlacementManager();
    const fetchMock = response({ ok: true, role: { id: 30 }, message: "Role created" });
    vi.stubGlobal("fetch", fetchMock);
    const payload = {
      title: "Frontend Intern",
      company_name: "Acme",
      role_type: "internship" as const,
      location: "Remote",
      work_mode: "remote" as const,
      compensation: "₹20,000/month",
      deadline: "2030-06-01",
      minimum_semester: 5,
      minimum_cgpa: 8,
      required_skills: "React, TypeScript",
      description: "Build UI features",
    };

    await createPlacementRole(payload);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/placement/manager/roles");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual(payload);
  });

  it("records an accepted applicant decision and the manager's message", async () => {
    signInAsPlacementManager();
    const fetchMock = response({ ok: true, roleApplication: {}, notification: "Sent" });
    vi.stubGlobal("fetch", fetchMock);

    await decidePlacementRoleApplication(30, 9, {
      status: "accepted",
      message: "Interview on Monday",
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "http://localhost:8000/api/placement/manager/roles/30/applications/9/decision",
    );
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({
      status: "accepted",
      message: "Interview on Monday",
    });
  });

  it("selects a general placement applicant with an optional opportunity title", async () => {
    signInAsPlacementManager();
    const fetchMock = response({
      ok: true,
      application: {},
      notification: "Sent",
      emailQueued: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    await selectPlacementApplication(44, { opportunity_title: "Summer engineering internship" });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://localhost:8000/api/placement/manager/applications/44/select",
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      opportunity_title: "Summer engineering internship",
    });
  });

  it("removes an expired role with a DELETE request", async () => {
    signInAsPlacementManager();
    const fetchMock = response({ ok: true, roleId: 30, message: "Removed" });
    vi.stubGlobal("fetch", fetchMock);

    await deletePlacementRole(30);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/placement/manager/roles/30",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
