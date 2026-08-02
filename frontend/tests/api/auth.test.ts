import { afterEach, describe, expect, it, vi } from "vitest";
import { loginAccount, registerAccount } from "../../src/lib/api";

const authResponse = {
  access_token: "test-access-token",
  token_type: "bearer" as const,
  expires_at: "2030-01-01T00:00:00Z",
  user: {
    id: 42,
    email: "student@university.edu",
    full_name: "Test Student",
    role: "student" as const,
  },
};

function mockJsonResponse(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("authentication API", () => {
  it("logs in with the supplied credentials and returns the auth session", async () => {
    const fetchMock = mockJsonResponse(authResponse);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      loginAccount({ email: "student@university.edu", password: "correct-password" }),
    ).resolves.toEqual(authResponse);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/auth/login");
    expect(options).toMatchObject({
      method: "POST",
      body: JSON.stringify({ email: "student@university.edu", password: "correct-password" }),
    });
    expect((options.headers as Headers).get("Content-Type")).toBe("application/json");
  });

  it("surfaces an invalid-login error from the API", async () => {
    vi.stubGlobal("fetch", mockJsonResponse({ detail: "Incorrect email or password" }, 401));

    await expect(
      loginAccount({ email: "student@university.edu", password: "wrong-password" }),
    ).rejects.toThrow("Incorrect email or password");
  });

  it("shows validation errors returned for an incomplete login", async () => {
    vi.stubGlobal(
      "fetch",
      mockJsonResponse({ detail: [{ loc: ["body", "email"], msg: "Invalid email address" }] }, 422),
    );

    await expect(loginAccount({ email: "not-an-email", password: "" })).rejects.toThrow(
      "Email: Invalid email address",
    );
  });

  it("passes through a login network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network unavailable")));

    await expect(
      loginAccount({ email: "student@university.edu", password: "correct-password" }),
    ).rejects.toThrow("Network unavailable");
  });

  it("uses a fallback message when the login server returns no error detail", async () => {
    vi.stubGlobal("fetch", mockJsonResponse({}, 500));

    await expect(
      loginAccount({ email: "student@university.edu", password: "correct-password" }),
    ).rejects.toThrow("Request failed with 500");
  });

  it("registers a student account and defaults its role to student", async () => {
    const fetchMock = mockJsonResponse(authResponse);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      registerAccount({
        full_name: "Test Student",
        email: "student@university.edu",
        password: "new-password",
      }),
    ).resolves.toEqual(authResponse);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/auth/register");
    expect(options).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        full_name: "Test Student",
        email: "student@university.edu",
        password: "new-password",
        role: "student",
      }),
    });
  });

  it("keeps the selected professor role and profile fields during registration", async () => {
    const fetchMock = mockJsonResponse({
      ...authResponse,
      user: { ...authResponse.user, role: "faculty" },
    });
    vi.stubGlobal("fetch", fetchMock);

    await registerAccount({
      full_name: "Dr. Ada Lovelace",
      email: "ada@university.edu",
      password: "new-password",
      role: "faculty",
      address: "12 University Road",
      gender: "female",
      highest_education: "PhD",
      expertise_field: "Artificial Intelligence",
      department: "Computer Science & AI",
      designation: "Assistant Professor",
      license_document_name: "teaching-license.pdf",
    });

    const [, options] = fetchMock.mock.calls[0];
    expect(JSON.parse(options.body as string)).toMatchObject({
      role: "faculty",
      address: "12 University Road",
      gender: "female",
      highest_education: "PhD",
      expertise_field: "Artificial Intelligence",
      department: "Computer Science & AI",
      designation: "Assistant Professor",
      license_document_name: "teaching-license.pdf",
    });
  });

  it("shows the duplicate-email error during registration", async () => {
    vi.stubGlobal("fetch", mockJsonResponse({ detail: "Email already registered" }, 409));

    await expect(
      registerAccount({
        full_name: "Test Student",
        email: "student@university.edu",
        password: "new-password",
      }),
    ).rejects.toThrow("Email already registered");
  });

  it("shows registration validation errors", async () => {
    vi.stubGlobal(
      "fetch",
      mockJsonResponse(
        { detail: [{ loc: ["body", "password"], msg: "Password is too short" }] },
        422,
      ),
    );

    await expect(
      registerAccount({
        full_name: "Test Student",
        email: "student@university.edu",
        password: "short",
      }),
    ).rejects.toThrow("Password: Password is too short");
  });

  it("passes through a registration network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network unavailable")));

    await expect(
      registerAccount({
        full_name: "Test Student",
        email: "student@university.edu",
        password: "new-password",
      }),
    ).rejects.toThrow("Network unavailable");
  });
});

it("sends JSON headers during registration", async () => {
  const fetchMock = mockJsonResponse(authResponse);
  vi.stubGlobal("fetch", fetchMock);

  await registerAccount({
    full_name: "Test Student",
    email: "student@university.edu",
    password: "new-password",
  });

  const [, options] = fetchMock.mock.calls[0];

  expect((options.headers as Headers).get("Content-Type")).toBe(
    "application/json",
  );
});

it("falls back when the server returns an empty error detail", async () => {
  vi.stubGlobal("fetch", mockJsonResponse({ detail: "" }, 500));

  await expect(
    registerAccount({
      full_name: "Test Student",
      email: "student@university.edu",
      password: "new-password",
    }),
  ).rejects.toThrow("Request failed with 500");
});


it("makes exactly one registration request", async () => {
  const fetchMock = mockJsonResponse(authResponse);
  vi.stubGlobal("fetch", fetchMock);

  await registerAccount({
    full_name: "Test Student",
    email: "student@university.edu",
    password: "new-password",
  });

  expect(fetchMock).toHaveBeenCalledTimes(1);
});
