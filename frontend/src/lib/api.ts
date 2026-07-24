import { clearAuthSession, getAuthToken, type AuthResponse } from "./auth";
import type { RoleId } from "./campus-data";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000/api";
const API_ORIGIN = API_BASE.replace(/\/api\/?$/, "");

export function resolveResourceUrl(url?: string) {
  if (!url) return "";
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  return `${API_ORIGIN}${url.startsWith("/") ? "" : "/"}${url}`;
}

function inferDownloadName(disposition: string | null, fallback: string) {
  if (!disposition) return fallback;
  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) return decodeURIComponent(utfMatch[1]);
  const simpleMatch = disposition.match(/filename="([^"]+)"/i);
  if (simpleMatch?.[1]) return simpleMatch[1];
  return fallback;
}

export async function openProtectedResource(
  url: string,
  options: { download?: boolean; fallbackName?: string } = {},
) {
  const token = getAuthToken();
  if (!token) {
    clearAuthSession();
    throw new Error("Your login session expired");
  }

  const response = await fetch(resolveResourceUrl(url), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401 || response.status === 423) {
    clearAuthSession();
  }

  if (!response.ok) {
    let message = `File request failed with ${response.status}`;
    try {
      const body = await response.json();
      message = body.detail ?? message;
    } catch {
      // Keep the default message.
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const name = inferDownloadName(
    response.headers.get("Content-Disposition"),
    options.fallbackName ?? "download",
  );

  if (options.download) {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = name;
    link.click();
  } else {
    const nextWindow = window.open(objectUrl, "_blank", "noopener,noreferrer");
    if (!nextWindow) {
      window.location.assign(objectUrl);
    }
  }

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
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
    completedCredits?: number;
    totalCredits?: number;
    avatar: string;
    address?: string;
    phone?: string;
    bio?: string;
    focus?: string;
    skills?: string[];
    guardianName?: string;
    guardianPhone?: string;
    city?: string;
    state?: string;
    linkedinUrl?: string;
    githubUrl?: string;
    biometricEnrolled?: boolean;
    biometricEnrolledAt?: string | null;
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
  complaint_items: ComplaintItem[];
  certificate_items: {
    id: number;
    key?: string;
    name: string;
    desc: string;
    eta: string;
    status: string;
    requestedAt?: string | null;
    readyAt?: string | null;
    downloadedAt?: string | null;
  }[];
  event_items: {
    id: number;
    key?: string;
    title: string;
    date: string;
    isoDate?: string;
    venue: string;
    spots: number;
    accent: string;
    attended: boolean;
    registered?: boolean;
    registeredAt?: string | null;
    details?: string;
  }[];
  marketplace_items: {
    id: number;
    key?: string;
    name: string;
    category: string;
    price: string;
    seller: string;
    tag: string;
    description?: string;
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

export type StudentAssistantMessage = {
  role: "user" | "ai";
  text: string;
};

export type StudentAssistantResponse = {
  answer: string;
  tab: {
    label: string;
    path: string;
    feature: string;
  };
  model: string;
  fallback: boolean;
  suggestedPrompts: string[];
};

export type StudentProfile = {
  id: number;
  name: string;
  email: string;
  studentCode: string;
  department: string;
  semester: number;
  cgpa: number;
  attendance: number;
  completedCredits: number;
  totalCredits: number;
  address: string;
  phone: string;
  bio: string;
  focus: string;
  skills: string[];
  guardianName: string;
  guardianPhone: string;
  city: string;
  state: string;
  linkedinUrl: string;
  githubUrl: string;
  avatar: string;
  academicStanding: string;
  profileCompletion: number;
  enrollmentDate?: string | null;
  biometricEnrolled?: boolean;
  biometricEnrolledAt?: string | null;
};

export type PlacementApplication = {
  id: number;
  studentId: number;
  studentName: string;
  studentEmail: string;
  semester: number;
  cgpa: number;
  skills: string;
  linkedinProfile: string;
  githubProfile: string;
  phoneNumber: string;
  resumeFilename: string;
  resumeContentType: string;
  resumeFileSize: number;
  resumeUrl: string;
  status: "submitted" | "selected" | string;
  selectionMessage: string | null;
  selectedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlacementNotification = {
  id: number;
  applicationId: number | null;
  title: string;
  body: string;
  channel: string;
  read: boolean;
  createdAt: string;
};

export type PlacementRoleStatus = "open" | "closed" | string;
export type PlacementRoleApplicationStatus = "applied" | "accepted" | "rejected" | string;

export type PlacementRole = {
  id: number;
  title: string;
  companyName: string;
  roleType: "internship" | "job" | string;
  location: string;
  workMode: "onsite" | "hybrid" | "remote" | string;
  compensation: string;
  deadline: string;
  minimumSemester: number;
  minimumCgpa: number;
  requiredSkills: string;
  description: string;
  status: PlacementRoleStatus;
  active?: boolean;
  deadlineExpired?: boolean;
  createdAt: string;
  updatedAt: string;
  semesterReady?: boolean;
  cgpaReady?: boolean;
  skillsReady?: boolean;
  criteriaReady?: boolean;
  missingSkills?: string[];
  profileSubmitted?: boolean;
  canApply?: boolean;
  applicationStatus?: PlacementRoleApplicationStatus | null;
  roleApplicationId?: number | null;
  dismissedByStudent?: boolean;
  decisionMessage?: string | null;
  appliedAt?: string | null;
  decidedAt?: string | null;
};

export type PlacementRoleApplicant = {
  id: number;
  roleId: number;
  studentId: number;
  status: PlacementRoleApplicationStatus;
  decisionMessage: string | null;
  dismissedByStudent?: boolean;
  dismissedByManager?: boolean;
  decidedAt: string | null;
  appliedAt: string;
  updatedAt: string;
  semesterReady: boolean;
  cgpaReady: boolean;
  skillsReady: boolean;
  criteriaReady: boolean;
  missingSkills: string[];
  application: PlacementApplication;
};

export type PlacementManagerRole = PlacementRole & {
  applicants: PlacementRoleApplicant[];
};

export type PlacementStudentPortal = {
  student: {
    id: number;
    name: string;
    email: string;
    studentCode: string;
    department: string;
    semester: number;
    cgpa: number;
  };
  criteria: {
    minimumSemester: number;
    minimumCgpa: number;
  };
  eligible: boolean;
  application: PlacementApplication | null;
  notifications: PlacementNotification[];
  jobs: PlacementRole[];
};

export type PlacementManagerDashboard = {
  manager: {
    id: number;
    name: string;
    email: string;
  };
  criteria: {
    minimumSemester: number;
    minimumCgpa: number;
  };
  metrics: {
    eligibleStudents: number;
    selectedStudents: number;
    pendingStudents: number;
  };
  applications: PlacementApplication[];
  roles: PlacementManagerRole[];
};

export type ComplaintStatus = "submitted" | "acknowledged" | "in_progress" | "resolved";

export type ComplaintAttachment = {
  id: number;
  filename: string;
  contentType: string;
  size: number;
  url: string;
};

export type ComplaintItem = {
  id: number;
  complaintCode: string;
  title: string;
  category: string;
  description: string;
  status: ComplaintStatus;
  statusLabel: string;
  stage: number;
  created: string;
  submittedAt: string;
  acknowledgedAt: string | null;
  inProgressAt: string | null;
  resolvedAt: string | null;
  updatedAt: string;
  studentId: number | null;
  studentName: string;
  studentEmail: string;
  studentCode: string;
  department: string;
  semester: number | null;
  attachments: ComplaintAttachment[];
};

export type IntakeSlotBatch = {
  id: number;
  batch_name: string;
  total_slots: number;
  filled_slots: number;
  slots_left: number;
  intake_open: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type CampusAttendanceSettings = {
  campus_name: string;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number;
  semester_duration_months: number;
  semester_duration_unit: "months" | "days";
  semester_duration_days: number;
  campus_configured: boolean;
  updated_at: string | null;
  active_slot_batch: IntakeSlotBatch | null;
  slot_batches: IntakeSlotBatch[];
};

export type AdminDashboard = {
  admin: {
    name: string;
    email: string;
    avatar: string;
  };
  metrics: {
    label: string;
    value: string;
    hint: string;
  }[];
  account_ratio: {
    students: number;
    professors: number;
    studentShare: number;
    professorShare: number;
  };
  attendance_overview: {
    date: string;
    label: string;
    present: number;
    absent: number;
    total: number;
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
    createdAt: string;
    lastSeenAt: string;
    avatar: string;
    authProvider: string;
    slotBatchName?: string;
    enrollmentDate?: string;
    biometricEnrolled?: boolean;
    biometricEnrolledAt?: string;
  }[];
  professors: {
    id: number;
    name: string;
    email: string;
    address: string;
    department: string;
    designation: string;
    gender: string;
    expertiseField: string;
    highestEducation: string;
    verificationStatus: string;
    licenseDocumentName: string;
    studentsManaged: number;
    status: string;
    blockReason: string;
    blockedAt: string;
    createdAt: string;
    lastSeenAt: string;
    avatar: string;
    authProvider: string;
    isBlocked: boolean;
  }[];
};

export type StudentBiometricCheckIn = {
  id: number;
  studentId: number;
  date: string;
  status: string;
  withinRadius: boolean;
  biometricVerified: boolean;
  professorConfirmed: boolean;
  warningFlag: boolean;
  distanceMeters: number | null;
  detectedAt: string | null;
  verifiedAt: string | null;
  confirmedAt: string | null;
};

export type StudentRadiusCheckResponse = {
  ok: boolean;
  withinRadius: boolean;
  campusConfigured: boolean;
  radiusMeters: number;
  distanceMeters: number | null;
  biometricEnrolled: boolean;
  message: string;
  checkIn: StudentBiometricCheckIn | null;
};

export type StudentBiometricVerifyResponse = {
  ok: boolean;
  message: string;
  verificationMode: "enrolled" | "matched";
  matchScore: number;
  biometricEnrolled: boolean;
  checkIn: StudentBiometricCheckIn;
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
    biometricCheckIn: StudentBiometricCheckIn | null;
    biometricVerified: boolean;
    withinRadius: boolean;
    professorConfirmed: boolean;
    attendanceWarning: boolean;
    biometricStatus: string;
    biometricVerifiedAt: string;
    radiusDistance: number | null;
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
    biometricVerified?: number;
    pendingConfirmation?: number;
    warnings?: number;
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
    status: "present" | "absent" | "warning";
    markedBy: string;
    markedAt: string;
    warning?: boolean;
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

function shouldClearAuthSession(status: number, message: string) {
  if (status === 423) return true;
  if (status !== 401) return false;
  const normalized = message.toLowerCase();
  return (
    normalized === "not authenticated" ||
    normalized === "could not validate credentials" ||
    normalized.includes("token") ||
    normalized.includes("login session")
  );
}

function labelFromValidationLocation(location: unknown) {
  if (!Array.isArray(location)) return "Request";
  const field = location.filter((part) => part !== "body").at(-1);
  if (typeof field !== "string" && typeof field !== "number") return "Request";
  return String(field)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatErrorDetail(detail: unknown, fallback: string) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const record = item as { loc?: unknown; msg?: unknown };
        const msg = typeof record.msg === "string" ? record.msg : "";
        if (!msg) return "";
        return `${labelFromValidationLocation(record.loc)}: ${msg}`;
      })
      .filter(Boolean);
    return messages.length ? messages.join("\n") : fallback;
  }
  return fallback;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const token = getAuthToken();
  const requiresAuth = options.auth !== false;

  if (requiresAuth && !token) {
    clearAuthSession();
    throw new Error("Your login session expired. Please sign in again.");
  }

  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (!headers.has("Content-Type") && options.body && !isFormData) {
    headers.set("Content-Type", "application/json");
  }
  if (requiresAuth && token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let message = `Request failed with ${res.status}`;
    try {
      const body = await res.json();
      message = formatErrorDetail(body.detail, message);
    } catch {
      // Keep the default message.
    }
    if (requiresAuth && shouldClearAuthSession(res.status, message)) {
      clearAuthSession();
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

export function requestStudentCertificate(certificateKey: string) {
  return request<{ ok: boolean; message: string }>(`/student/certificates/${certificateKey}/request`, {
    method: "POST",
  });
}

export function registerStudentEvent(eventKey: string) {
  return request<{ ok: boolean; message: string }>(`/student/events/${eventKey}/register`, {
    method: "POST",
  });
}

export function inquireMarketplaceItem(itemKey: string, payload?: { note?: string }) {
  const query = payload?.note ? `?note=${encodeURIComponent(payload.note)}` : "";
  return request<{ ok: boolean; message: string }>(`/student/marketplace/${itemKey}/inquire${query}`, {
    method: "POST",
  });
}

export function sendStudentAssistantMessage(payload: {
  message: string;
  current_path: string;
  history?: StudentAssistantMessage[];
}) {
  return request<StudentAssistantResponse>("/student/assistant/chat", {
    method: "POST",
    body: JSON.stringify({
      message: payload.message,
      current_path: payload.current_path,
      history: payload.history ?? [],
    }),
  });
}

export function getStudentProfile() {
  return request<StudentProfile>("/student/profile");
}

export function updateStudentProfile(payload: {
  name: string;
  email: string;
  address: string;
  phone?: string;
  bio?: string;
  focus?: string;
  skills: string[];
  guardian_name?: string;
  guardian_phone?: string;
  city?: string;
  state?: string;
  linkedin_url?: string;
  github_url?: string;
  completed_credits?: number;
  total_credits?: number;
}) {
  return request<StudentProfile>("/student/profile", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function getPlacementStudentPortal() {
  return request<PlacementStudentPortal>("/placement/student");
}

export function submitPlacementApplication(payload: FormData) {
  return request<{ ok: boolean; application: PlacementApplication; message: string }>(
    "/placement/student/application",
    {
      method: "POST",
      body: payload,
    },
  );
}

export function getPlacementManagerDashboard() {
  return request<PlacementManagerDashboard>("/placement/manager/dashboard");
}

export function createPlacementRole(payload: {
  title: string;
  company_name: string;
  role_type: "internship" | "job";
  location: string;
  work_mode: "onsite" | "hybrid" | "remote";
  compensation: string;
  deadline: string;
  minimum_semester: number;
  minimum_cgpa: number;
  required_skills: string;
  description: string;
}) {
  return request<{ ok: boolean; role: PlacementManagerRole; message: string }>("/placement/manager/roles", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deletePlacementRole(roleId: number) {
  return request<{ ok: boolean; roleId: number; message: string }>(`/placement/manager/roles/${roleId}`, {
    method: "DELETE",
  });
}

export function applyToPlacementRole(roleId: number) {
  return request<{ ok: boolean; role: PlacementRole; message: string }>(`/placement/student/roles/${roleId}/apply`, {
    method: "POST",
  });
}

export function dismissPlacementRoleApplication(roleId: number) {
  return request<{ ok: boolean; roleId: number; message: string }>(`/placement/student/roles/${roleId}/application`, {
    method: "DELETE",
  });
}

export function decidePlacementRoleApplication(
  roleId: number,
  roleApplicationId: number,
  payload: { status: "accepted" | "rejected"; message?: string },
) {
  return request<{
    ok: boolean;
    roleApplication: PlacementRoleApplicant;
    notification: string;
  }>(`/placement/manager/roles/${roleId}/applications/${roleApplicationId}/decision`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function dismissPlacementRoleApplicant(roleId: number, roleApplicationId: number) {
  return request<{ ok: boolean; roleId: number; roleApplicationId: number; message: string }>(
    `/placement/manager/roles/${roleId}/applications/${roleApplicationId}`,
    {
      method: "DELETE",
    },
  );
}

export function selectPlacementApplication(applicationId: number, payload: { opportunity_title?: string }) {
  return request<{
    ok: boolean;
    application: PlacementApplication;
    notification: string;
    emailQueued: boolean;
  }>(`/placement/manager/applications/${applicationId}/select`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getStudentComplaints() {
  return request<{ ok: boolean; complaints: ComplaintItem[] }>("/complaints/me");
}

export function createStudentComplaint(payload: FormData) {
  return request<{ ok: boolean; complaint: ComplaintItem }>("/complaints", {
    method: "POST",
    body: payload,
  });
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

export function getStudentAttendanceSettings() {
  return request<CampusAttendanceSettings>("/student/attendance/settings");
}

export function checkStudentAttendanceRadius(payload: { latitude: number; longitude: number }) {
  return request<StudentRadiusCheckResponse>("/student/attendance/radius-check", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function verifyStudentBiometric(payload: {
  latitude?: number;
  longitude?: number;
  method?: string;
  face_template?: number[];
}) {
  return request<StudentBiometricVerifyResponse>("/student/attendance/biometric-verify", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function resetStudentBiometric() {
  return request<{
    ok: boolean;
    message: string;
    biometricEnrolled: boolean;
    checkIn: StudentBiometricCheckIn | null;
  }>("/student/attendance/biometric-reset", {
    method: "POST",
  });
}

export function getAdminManagement() {
  return request<CampusAttendanceSettings>("/admin/management");
}

export function getAdminDashboard() {
  return request<AdminDashboard>("/admin/dashboard");
}

export function getAdminComplaints() {
  return request<{ ok: boolean; complaints: ComplaintItem[] }>("/complaints/admin");
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

export function updateAdminSemesterDuration(payload: {
  semester_duration_months?: number;
  semester_duration_unit?: "months" | "days";
  semester_duration_days?: number;
}) {
  return request<CampusAttendanceSettings>("/admin/management/semester-duration", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function createAdminSlotBatch(payload: {
  batch_name: string;
  total_slots: number;
  open_for_intake?: boolean;
}) {
  return request<CampusAttendanceSettings>("/admin/management/slot-batches", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAdminSlotBatch(
  batchId: number,
  payload: {
    batch_name?: string;
    total_slots?: number;
    open_for_intake?: boolean;
  },
) {
  return request<CampusAttendanceSettings>(`/admin/management/slot-batches/${batchId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function updateAdminUserBlock(
  userId: number,
  payload: { blocked: boolean; reason?: string },
) {
  return request<{ ok: boolean; user_id: number; role: string; is_blocked: boolean; message: string }>(
    `/admin/users/${userId}/block`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function deleteAdminUserAccount(userId: number) {
  return request<{ ok: boolean; user_id: number; role: string; message: string }>(`/admin/users/${userId}`, {
    method: "DELETE",
  });
}

export function resetAdminStudentBiometric(studentId: number) {
  return request<{ ok: boolean; student_id: number; message: string }>(`/admin/students/${studentId}/biometric-reset`, {
    method: "POST",
  });
}

export function updateAdminComplaintStatus(
  complaintId: number,
  payload: { status: Exclude<ComplaintStatus, "submitted"> },
) {
  return request<{ ok: boolean; complaint: ComplaintItem }>(`/complaints/${complaintId}/status`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function getProfessorDashboard() {
  return request<ProfessorDashboard>("/professor/dashboard");
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

export function confirmProfessorAttendance(payload: { student_id: number; present?: boolean }) {
  return request<{
    ok: boolean;
    student_id: number;
    status: "present" | "absent";
    attendance: number;
    date: string;
    checkIn: StudentBiometricCheckIn | null;
  }>("/professor/attendance/confirm", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function finalizeProfessorAttendance() {
  return request<{ ok: boolean; date: string; markedAbsent: number; warnings: number; message: string }>(
    "/professor/attendance/finalize",
    {
      method: "POST",
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
