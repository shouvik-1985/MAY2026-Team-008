import { clearAuthSession, getAuthToken, type AuthResponse } from "./auth";
import type { RoleId } from "./campus-data";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000/api";
const API_ORIGIN = API_BASE.replace(/\/api\/?$/, "");

export function resolveResourceUrl(url?: string) {
  if (!url) return "";
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  return `${API_ORIGIN}${url.startsWith("/") ? "" : "/"}${url}`;
}

export type StudentDashboard = {
  user: {
    name: string;
    email: string;
    studentCode: string;
    department: string;
    semester: number;
    cgpa: number;
    attendance: number;
    avatar: string;
  };
  metrics: { label: string; value: string; hint: string; tone: string }[];
  cgpa_trend: { term: string; cgpa: number }[];
  attendance_weekly: {
    day: string;
    label?: string;
    date?: string;
    attendance: number;
    status?: string;
    marked?: boolean;
    isToday?: boolean;
  }[];
  attendance_timeline?: {
    date: string;
    label: string;
    month: string;
    attendance: number;
    status: string;
    present: number;
    absent: number;
    marked: number;
  }[];
  attendance_by_subject: { subject: string; attendance: number; status: string }[];
  attendance_monthly: {
    month: string;
    label?: string;
    attendance: number;
    present?: number;
    absent?: number;
    marked?: number;
  }[];
  fee_summary: {
    outstanding: number;
    semester: string;
    dueDate: string;
    clearance: string;
    trend: number[];
  };
  fee_history: { id: string; semester: string; amount: number; status: string; date: string }[];
  module_health: { module: string; status: string; detail: string }[];
  upcoming_deadlines: { title: string; module: string; due: string; risk: string }[];
  request_timeline: { title: string; kind: string; stage: string; updated: string }[];
  announcements: {
    id: number;
    pinned: boolean;
    title: string;
    category: string;
    time: string;
    unread: boolean;
    body: string;
  }[];
  assignment_items: {
    id: number;
    title: string;
    subject: string;
    due: string;
    progress: number;
    status: string;
    grade?: string;
  }[];
  resource_items: {
    id: number;
    title: string;
    subject: string;
    type: string;
    tag: string;
    url: string;
    professorName: string;
    createdAt: string;
    createdDate: string;
    time: string;
  }[];
  complaint_items: { id: string; title: string; category: string; stage: number; created: string }[];
  certificate_items: {
    id: number;
    name: string;
    desc: string;
    eta: string;
    status: string;
  }[];
  event_items: {
    id: number;
    title: string;
    date: string;
    venue: string;
    spots: number;
    accent: string;
    attended: boolean;
  }[];
  marketplace_items: {
    id: number;
    name: string;
    category: string;
    price: string;
    seller: string;
    tag: string;
  }[];
  scholarship_items: {
    id: number;
    name: string;
    amount: string;
    status: string;
    progress: number;
  }[];
  ai_context: {
    chat_history: { role: "user" | "ai"; text: string }[];
    suggested_prompts: string[];
  };
  achievements: { name: string; year: string }[];
  skills: string[];
  activity: { t: string; l: string }[];
  nav_modules: { label: string; path: string; feature: string }[];
  student_todos: StudentTodo[];
};

export type StudentTodo = {
  id: number;
  title: string;
  dueAt: string | null;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
};



export type CampusAttendanceSettings = {
  campus_name: string;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number;
  campus_configured: boolean;
  updated_at: string | null;
};

export type ProfessorDashboard = {
  professor: {
    name: string;
    email: string;
    department: string;
    designation: string;
    expertiseField: string;
    highestEducation: string;
    licenseDocumentName: string;
    verificationStatus: string;
    avatar: string;
  };
  metrics: { label: string; value: string; hint: string; tone: string }[];
  students: {
    id: number;
    name: string;
    email: string;
    studentCode: string;
    address: string;
    department: string;
    semester: number;
    cgpa: number;
    attendance: number;
    attendanceMarked: number;
    presentCount: number;
    absentCount: number;
    status: string;
    isBlocked: boolean;
    blockReason: string;
    blockedAt: string;
    avatar: string;
  }[];
  attendance_today: {
    date: string;
    label: string;
    present: number;
    absent: number;
    unmarked: number;
    marked: number;
    totalStudents: number;
    presentRatio: number;
    absentRatio: number;
    liveAt: string;
  };
  attendance_summary: {
    date: string;
    label: string;
    present: number;
    absent: number;
    unmarked: number;
    marked: number;
    totalStudents: number;
    presentRatio: number;
    absentRatio: number;
  }[];
  attendance_history: {
    id: number;
    studentId: number;
    student: string;
    studentCode: string;
    date: string;
    status: "present" | "absent";
    markedBy: string;
    markedAt: string;
  }[];
  cgpa_years: {
    year: string;
    averageCgpa: number;
    students: number;
  }[];
  announcements: {
    id: number;
    title: string;
    category: string;
    audience: string;
    body: string;
    pinned: boolean;
    createdBy: string;
    time: string;
  }[];
  resources: {
    id: number;
    title: string;
    subject: string;
    resourceType: string;
    tag: string;
    url: string;
    professorName: string;
    createdAt: string;
    createdDate: string;
    time: string;
  }[];
  assignment_reviews: {
    id: number;
    studentId: number;
    title: string;
    subject: string;
    status: string;
    grade: string;
    feedback: string;
    updated: string;
  }[];
  review_queue: {
    id: number;
    studentId: number;
    student: string;
    title: string;
    subject: string;
    submitted: string;
    priority: string;
  }[];
  academic_controls: { label: string; detail: string }[];
  nav_modules: { label: string; path: string; feature: string }[];
};

export type AdminDashboard = {
  admin: {
    name: string;
    email: string;
    role: string;
    avatar: string;
    navModules: { label: string; path: string; feature: string }[];
  };
  metrics: { label: string; value: string; hint: string; tone: string }[];
  ratio_overview: { label: string; count: number; share: number; accent: string }[];
  attendance_overview: {
    date: string;
    label: string;
    present: number;
    absent: number;
    marked: number;
    attendance: number;
  }[];
  students: {
    id: number;
    name: string;
    email: string;
    studentCode: string;
    address: string;
    department: string;
    semester: number;
    cgpa: number;
    attendance: number;
    attendanceMarked: number;
    presentCount: number;
    absentCount: number;
    status: string;
    isBlocked: boolean;
    blockReason: string;
    blockedAt: string;
    avatar: string;
    createdAt: string;
  }[];
  professors: {
    id: number;
    name: string;
    email: string;
    address: string;
    department: string;
    designation: string;
    expertiseField: string;
    highestEducation: string;
    licenseDocumentName: string;
    verificationStatus: string;
    status: string;
    isBlocked: boolean;
    blockReason: string;
    blockedAt: string;
    avatar: string;
    createdAt: string;
    studentsManaged: number;
  }[];
};

export type ConnectRole = "student" | "professor";
export type ConnectStatus = "none" | "sent" | "received" | "friend" | "blocked" | "blocked_by_them";

export type ConnectPerson = {
  id: number;
  name: string;
  role: ConnectRole;
  headline: string;
  department: string;
  meta: string;
  email: string;
  status: ConnectStatus;
  relationshipId: number | null;
  avatar: string;
  online: boolean;
  lastSeenAt: string | null;
  details: Record<string, string>;
};

export type ConnectAttachment = {
  id: number;
  name: string;
  type: string;
  size: string;
  url: string;
};

export type ConnectMessage = {
  id: number;
  userId: number;
  senderId: number;
  receiverId: number;
  author: "me" | "them";
  text: string;
  time: string;
  createdAt: string;
  edited: boolean;
  deletedForEveryone: boolean;
  files: ConnectAttachment[];
};

export type ConnectHubData = {
  viewer: {
    id: number;
    name: string;
    email: string;
    role: ConnectRole;
    avatar: string;
  };
  people: ConnectPerson[];
  counts: {
    friends: number;
    requests: number;
    sent: number;
    blocked: number;
  };
  syncedAt: string;
};

type RequestOptions = RequestInit & { auth?: boolean };

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const token = getAuthToken();

  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (!headers.has("Content-Type") && options.body && !isFormData) {
    headers.set("Content-Type", "application/json");
  }
  if (options.auth !== false && token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401 || res.status === 423) {
    clearAuthSession();
  }

  if (!res.ok) {
    let message = `Request failed with ${res.status}`;
    try {
      const body = await res.json();
      message = body.detail ?? message;
    } catch {
      // Keep the default message.
    }
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function registerAccount(payload: {
  full_name: string;
  email: string;
  password: string;
  role?: RoleId;
  address?: string;
  gender?: string;
  highest_education?: string;
  expertise_field?: string;
  department?: string;
  designation?: string;
  license_document_name?: string;
}) {
  return request<AuthResponse>("/auth/register", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ ...payload, role: payload.role ?? "student" }),
  });
}

export function loginAccount(payload: { email: string; password: string }) {
  return request<AuthResponse>("/auth/login", {
    method: "POST",
    auth: false,
    body: JSON.stringify(payload),
  });
}

export function googleLogin(payload: { credential?: string; email?: string; full_name?: string }) {
  return request<AuthResponse>("/auth/google", {
    method: "POST",
    auth: false,
    body: JSON.stringify(payload),
  });
}

export function logoutAccount() {
  return request<{ ok: boolean }>("/auth/logout", { method: "POST" });
}

export function getStudentDashboard() {
  return request<StudentDashboard>("/student/dashboard");
}

export function createStudentTodo(payload: { title: string; due_at?: string | null }) {
  return request<{ ok: boolean; todo: StudentTodo; todos: StudentTodo[] }>("/student/todos", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateStudentTodo(
  todoId: number,
  payload: { title?: string; due_at?: string | null; completed?: boolean },
) {
  return request<{ ok: boolean; todo: StudentTodo; todos: StudentTodo[] }>(`/student/todos/${todoId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteStudentTodo(todoId: number) {
  return request<{ ok: boolean; id: number; todos: StudentTodo[] }>(`/student/todos/${todoId}`, {
    method: "DELETE",
  });
}

export function getProfessorDashboard() {
  return request<ProfessorDashboard>("/professor/dashboard");
}

export function getAdminDashboard() {
  return request<AdminDashboard>("/admin/dashboard");
}

export function getAdminManagement() {
  return request<CampusAttendanceSettings>("/admin/management");
}

export function updateAdminAttendanceRadius(payload: {
  radius_meters: number;
  latitude?: number | null;
  longitude?: number | null;
  campus_name?: string;
}) {
  return request<CampusAttendanceSettings>("/admin/management/attendance-radius", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function updateAdminStudentBlock(studentId: number, payload: { blocked: boolean; reason?: string }) {
  return request<{ ok: boolean; id: number; is_blocked: boolean }>(`/admin/students/${studentId}/block`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAdminProfessorBlock(professorId: number, payload: { blocked: boolean; reason?: string }) {
  return request<{ ok: boolean; id: number; is_blocked: boolean }>(`/admin/professors/${professorId}/block`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteAdminStudent(studentId: number) {
  return request<{ ok: boolean; id: number }>(`/admin/students/${studentId}`, {
    method: "DELETE",
  });
}

export function deleteAdminProfessor(professorId: number) {
  return request<{ ok: boolean; id: number }>(`/admin/professors/${professorId}`, {
    method: "DELETE",
  });
}

export function updateStudentAcademics(
  studentId: number,
  payload: { cgpa: number; attendance: number },
) {
  return request<{ ok: boolean; student_id: number; cgpa: number; attendance: number }>(
    `/professor/students/${studentId}/academics`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function updateStudentBlock(
  studentId: number,
  payload: { blocked: boolean; reason?: string },
) {
  return request<{ ok: boolean; student_id: number; is_blocked: boolean; message: string }>(
    `/professor/students/${studentId}/block`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function markProfessorAttendance(payload: { student_id: number; status: "present" | "absent" }) {
  return request<{ ok: boolean; student_id: number; status: string; attendance: number; date: string }>(
    "/professor/attendance/mark",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function createProfessorAnnouncement(payload: {
  title: string;
  category: string;
  audience: string;
  body: string;
  pinned: boolean;
}) {
  return request<{ ok: boolean; id: number }>("/professor/announcements", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createProfessorResource(payload: FormData) {
  return request<{ ok: boolean; id: number; resource: ProfessorDashboard["resources"][number] }>(
    "/professor/resources/upload",
    {
      method: "POST",
      body: payload,
    },
  );
}

export function deleteProfessorResource(resourceId: number) {
  return request<{ ok: boolean; id: number }>(`/professor/resources/${resourceId}`, {
    method: "DELETE",
  });
}

export function reviewProfessorAssignment(payload: {
  student_id: number;
  assignment_title: string;
  subject: string;
  grade?: string;
  feedback?: string;
}) {
  return request<{ ok: boolean; id: number }>("/professor/assignments/review", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getConnectHub() {
  return request<ConnectHubData>("/connect/hub");
}

export function sendConnectRequest(userId: number) {
  return request<{ ok: boolean; status: ConnectStatus }>(`/connect/requests/${userId}`, {
    method: "POST",
  });
}

export function acceptConnectRequest(userId: number) {
  return request<{ ok: boolean; status: ConnectStatus }>(`/connect/requests/${userId}/accept`, {
    method: "POST",
  });
}

export function removeConnectRequest(userId: number) {
  return request<{ ok: boolean; status: ConnectStatus }>(`/connect/requests/${userId}`, {
    method: "DELETE",
  });
}

export function blockConnectUser(userId: number) {
  return request<{ ok: boolean; status: ConnectStatus }>(`/connect/users/${userId}/block`, {
    method: "POST",
  });
}

export function unblockConnectUser(userId: number) {
  return request<{ ok: boolean; status: ConnectStatus }>(`/connect/users/${userId}/unblock`, {
    method: "POST",
  });
}

export function getConnectMessages(userId: number) {
  return request<{ ok: boolean; messages: ConnectMessage[] }>(`/connect/conversations/${userId}/messages`);
}

export function sendConnectMessage(payload: FormData) {
  return request<{ ok: boolean; message: ConnectMessage }>("/connect/messages", {
    method: "POST",
    body: payload,
  });
}

export function editConnectMessage(messageId: number, body: string) {
  return request<{ ok: boolean; message: ConnectMessage }>(`/connect/messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify({ body }),
  });
}

export function deleteConnectMessage(messageId: number, mode: "me" | "everyone") {
  return request<{ ok: boolean; id?: number; message?: ConnectMessage }>(`/connect/messages/${messageId}`, {
    method: "DELETE",
    body: JSON.stringify({ mode }),
  });
}
