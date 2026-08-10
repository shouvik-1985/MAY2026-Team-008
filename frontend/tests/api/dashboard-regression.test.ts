import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  approveAdminCertificateRequest,
  createAdminSlotBatch,
  createPlacementRole,
  createProfessorAssignment,
  createProfessorResource,
  deleteAdminAnnouncement,
  deleteAdminUserAccount,
  deletePlacementRole,
  deleteProfessorResource,
  decidePlacementRoleApplication,
  dismissPlacementRoleApplicant,
  dismissPlacementRoleApplication,
  finalizeProfessorAttendance,
  getAdminAnnouncements,
  getAdminCertificateRequests,
  getAdminComplaints,
  getAdminFees,
  getAdminManagement,
  getPlacementManagerDashboard,
  getPlacementStudentPortal,
  getProfessorDashboard,
  markProfessorAttendance,
  rejectAdminCertificateRequest,
  resetAdminStudentBiometric,
  reviewProfessorAssignment,
  selectPlacementApplication,
  submitPlacementApplication,
  updateAdminComplaintStatus,
  updateAdminSemesterDuration,
  updateAdminSlotBatch,
  updateProfessorAvatar,
  updateProfessorProfile,
  updateProfessorAssignmentSubmissionReview,
  updateStudentAcademics,
  updateStudentBlock,
  applyToPlacementRole,
} from "../../src/lib/api";

type EndpointCase = { name: string; path: string; method?: string; call: () => Promise<unknown> };

function jsonResponse(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function signIn() {
  const values = new Map([
    ["cv-access-token", "dashboard-test-token"],
    ["cv-access-token-expires", "2030-01-01T00:00:00Z"],
    ["cv-auth-user", JSON.stringify({ id: 1 })],
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

beforeEach(signIn);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function runEndpointContracts(area: string, cases: EndpointCase[]) {
  describe(`${area} endpoint contracts`, () => {
    it.each(cases)(
      "sends $name to the correct protected endpoint",
      async ({ path, method, call }) => {
        const fetchMock = jsonResponse({ ok: true });
        vi.stubGlobal("fetch", fetchMock);

        await call();

        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe(`http://localhost:8000/api${path}`);
        expect(options.method).toBe(method);
        expect((options.headers as Headers).get("Authorization")).toBe(
          "Bearer dashboard-test-token",
        );
      },
    );

    it.each(cases)("surfaces a server rejection for $name", async ({ call }) => {
      vi.stubGlobal("fetch", jsonResponse({ detail: "Permission denied" }, 403));
      await expect(call()).rejects.toThrow("Permission denied");
    });
  });
}

const adminCases: EndpointCase[] = [
  { name: "attendance settings", path: "/admin/management", call: getAdminManagement },
  { name: "announcements", path: "/admin/announcements", call: getAdminAnnouncements },
  { name: "fee management", path: "/admin/fees", call: getAdminFees },
  {
    name: "certificate queue",
    path: "/admin/certificates/requests",
    call: getAdminCertificateRequests,
  },
  { name: "complaint queue", path: "/complaints/admin", call: getAdminComplaints },
  {
    name: "announcement deletion",
    path: "/admin/announcements/11",
    method: "DELETE",
    call: () => deleteAdminAnnouncement(11),
  },
  {
    name: "certificate approval",
    path: "/admin/certificates/12/approve",
    method: "POST",
    call: () => approveAdminCertificateRequest(12, { purpose: "Visa", admin_note: "Approved" }),
  },
  {
    name: "certificate rejection",
    path: "/admin/certificates/12/reject",
    method: "POST",
    call: () => rejectAdminCertificateRequest(12),
  },
  {
    name: "semester duration update",
    path: "/admin/management/semester-duration",
    method: "PATCH",
    call: () =>
      updateAdminSemesterDuration({ semester_duration_unit: "days", semester_duration_days: 170 }),
  },
  {
    name: "slot batch creation",
    path: "/admin/management/slot-batches",
    method: "POST",
    call: () =>
      createAdminSlotBatch({ batch_name: "2027 intake", total_slots: 120, open_for_intake: true }),
  },
  {
    name: "slot batch update",
    path: "/admin/management/slot-batches/4",
    method: "PATCH",
    call: () => updateAdminSlotBatch(4, { total_slots: 140, open_for_intake: false }),
  },
  {
    name: "user account deletion",
    path: "/admin/users/18",
    method: "DELETE",
    call: () => deleteAdminUserAccount(18),
  },
  {
    name: "biometric reset",
    path: "/admin/students/18/biometric-reset",
    method: "POST",
    call: () => resetAdminStudentBiometric(18),
  },
  {
    name: "complaint status update",
    path: "/complaints/8/status",
    method: "PATCH",
    call: () => updateAdminComplaintStatus(8, { status: "resolved" }),
  },
  {
    name: "student unblocking",
    path: "/admin/users/18/block",
    method: "POST",
    call: () =>
      import("../../src/lib/api").then(({ updateAdminUserBlock }) =>
        updateAdminUserBlock(18, { blocked: false }),
      ),
  },
];

const professorCases: EndpointCase[] = [
  { name: "dashboard", path: "/professor/dashboard", call: getProfessorDashboard },
  {
    name: "student academic update",
    path: "/professor/students/22/academics",
    method: "POST",
    call: () => updateStudentAcademics(22, { cgpa: 8.4, attendance: 91 }),
  },
  {
    name: "student block removal",
    path: "/professor/students/22/block",
    method: "POST",
    call: () => updateStudentBlock(22, { blocked: false }),
  },
  {
    name: "present attendance mark",
    path: "/professor/attendance/mark",
    method: "POST",
    call: () => markProfessorAttendance({ student_id: 22, status: "present" }),
  },
  {
    name: "absent attendance mark",
    path: "/professor/attendance/mark",
    method: "POST",
    call: () => markProfessorAttendance({ student_id: 22, status: "absent" }),
  },
  {
    name: "attendance finalization",
    path: "/professor/attendance/finalize",
    method: "POST",
    call: finalizeProfessorAttendance,
  },
  {
    name: "resource upload",
    path: "/professor/resources/upload",
    method: "POST",
    call: () => {
      const form = new FormData();
      form.set("subject", "Algorithms");
      return createProfessorResource(form);
    },
  },
  {
    name: "resource deletion",
    path: "/professor/resources/6",
    method: "DELETE",
    call: () => deleteProfessorResource(6),
  },
  {
    name: "resource-based assignment generation",
    path: "/professor/assignments/generate",
    method: "POST",
    call: () =>
      createProfessorAssignment({
        assignment_type: "mcq",
        subject: "Algorithms",
        source_kind: "resources",
        resource_ids: [1],
      }),
  },
  {
    name: "syllabus assignment generation",
    path: "/professor/assignments/generate",
    method: "POST",
    call: () =>
      createProfessorAssignment({
        assignment_type: "subjective",
        subject: "Databases",
        source_kind: "syllabus",
        syllabus: "Normalization",
      }),
  },
  {
    name: "custom-content assignment generation",
    path: "/professor/assignments/generate",
    method: "POST",
    call: () =>
      createProfessorAssignment({
        assignment_type: "coding",
        subject: "Programming",
        source_kind: "content",
        custom_content: "Implement a stack",
      }),
  },
  {
    name: "submission score review",
    path: "/professor/assignments/submissions/9/review",
    method: "PATCH",
    call: () => updateProfessorAssignmentSubmissionReview(9, { score: 76 }),
  },
  {
    name: "submission feedback review",
    path: "/professor/assignments/submissions/9/review",
    method: "PATCH",
    call: () =>
      updateProfessorAssignmentSubmissionReview(9, { grade: "B", feedback: "Add test cases" }),
  },
  {
    name: "legacy assignment review",
    path: "/professor/assignments/review",
    method: "POST",
    call: () =>
      reviewProfessorAssignment({
        student_id: 22,
        assignment_title: "Quiz",
        subject: "Algorithms",
        grade: "A",
      }),
  },
  {
    name: "profile update",
    path: "/professor/profile",
    method: "PUT",
    call: () =>
      updateProfessorProfile({
        name: "Dr. Ada",
        email: "ada@example.edu",
        department: "Computer Science",
        skills: ["AI"],
      }),
  },
  {
    name: "avatar removal",
    path: "/professor/profile/avatar",
    method: "PUT",
    call: () => updateProfessorAvatar(null),
  },
];

const placementCases: EndpointCase[] = [
  { name: "student portal", path: "/placement/student", call: getPlacementStudentPortal },
  {
    name: "student application submission",
    path: "/placement/student/application",
    method: "POST",
    call: () => {
      const form = new FormData();
      form.set("phone_number", "5550100");
      return submitPlacementApplication(form);
    },
  },
  {
    name: "manager dashboard",
    path: "/placement/manager/dashboard",
    call: getPlacementManagerDashboard,
  },
  {
    name: "internship role creation",
    path: "/placement/manager/roles",
    method: "POST",
    call: () =>
      createPlacementRole({
        title: "UI Intern",
        company_name: "Acme",
        role_type: "internship",
        location: "Remote",
        work_mode: "remote",
        compensation: "Paid",
        deadline: "2030-01-01",
        minimum_semester: 4,
        minimum_cgpa: 7,
        required_skills: "React",
        description: "Build UI",
      }),
  },
  {
    name: "job role creation",
    path: "/placement/manager/roles",
    method: "POST",
    call: () =>
      createPlacementRole({
        title: "Engineer",
        company_name: "Acme",
        role_type: "job",
        location: "Bengaluru",
        work_mode: "hybrid",
        compensation: "12 LPA",
        deadline: "2030-01-01",
        minimum_semester: 8,
        minimum_cgpa: 8,
        required_skills: "TypeScript",
        description: "Build products",
      }),
  },
  {
    name: "expired role deletion",
    path: "/placement/manager/roles/31",
    method: "DELETE",
    call: () => deletePlacementRole(31),
  },
  {
    name: "student role application",
    path: "/placement/student/roles/31/apply",
    method: "POST",
    call: () => applyToPlacementRole(31),
  },
  {
    name: "student application withdrawal",
    path: "/placement/student/roles/31/application",
    method: "DELETE",
    call: () => dismissPlacementRoleApplication(31),
  },
  {
    name: "applicant rejection",
    path: "/placement/manager/roles/31/applications/4/decision",
    method: "POST",
    call: () =>
      decidePlacementRoleApplication(31, 4, {
        status: "rejected",
        message: "CGPA requirement not met",
      }),
  },
  {
    name: "decided applicant clearing",
    path: "/placement/manager/roles/31/applications/4",
    method: "DELETE",
    call: () => dismissPlacementRoleApplicant(31, 4),
  },
  {
    name: "selection without an opportunity title",
    path: "/placement/manager/applications/15/select",
    method: "POST",
    call: () => selectPlacementApplication(15, {}),
  },
];

runEndpointContracts("admin dashboard", adminCases);
runEndpointContracts("professor dashboard", professorCases);
runEndpointContracts("placement portal", placementCases);
