from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.models import Role


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: Role

    model_config = {"from_attributes": True}


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    role: Role = Role.student
    address: str | None = Field(default=None, max_length=255)
    gender: str | None = Field(default=None, max_length=40)
    highest_education: str | None = Field(default=None, max_length=120)
    expertise_field: str | None = Field(default=None, max_length=160)
    department: str | None = Field(default=None, max_length=120)
    designation: str | None = Field(default=None, max_length=120)
    license_document_name: str | None = Field(default=None, max_length=255)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class GoogleLoginRequest(BaseModel):
    credential: str | None = None
    email: str | None = None
    full_name: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: str
    user: UserOut


class StudentMetric(BaseModel):
    label: str
    value: str
    hint: str
    tone: str


class StudentDashboard(BaseModel):
    user: dict
    metrics: list[StudentMetric]
    cgpa_trend: list[dict]
    attendance_weekly: list[dict]
    attendance_timeline: list[dict]
    attendance_by_subject: list[dict]
    attendance_monthly: list[dict]
    fee_summary: dict
    fee_history: list[dict]
    module_health: list[dict]
    upcoming_deadlines: list[dict]
    request_timeline: list[dict]
    announcements: list[dict]
    assignment_items: list[dict]
    resource_items: list[dict]
    complaint_items: list[dict]
    certificate_items: list[dict]
    event_items: list[dict]
    marketplace_items: list[dict]
    scholarship_items: list[dict]
    ai_context: dict
    achievements: list[dict]
    skills: list[str]
    activity: list[dict]
    nav_modules: list[dict]
    student_todos: list[dict]


class StudentTodoCreate(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    due_at: datetime | None = None

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str) -> str:
        return value.strip()


class StudentTodoUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=180)
    due_at: datetime | None = None
    completed: bool | None = None

    @field_validator("title")
    @classmethod
    def clean_optional_title(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value


class ProfessorDashboard(BaseModel):
    professor: dict
    metrics: list[dict]
    students: list[dict]
    attendance_today: dict
    attendance_summary: list[dict]
    attendance_history: list[dict]
    cgpa_years: list[dict]
    announcements: list[dict]
    resources: list[dict]
    assignment_reviews: list[dict]
    review_queue: list[dict]
    academic_controls: list[dict]
    nav_modules: list[dict]


class StudentAcademicUpdate(BaseModel):
    cgpa: float = Field(ge=0, le=10)
    attendance: float = Field(ge=0, le=100)


class StudentBlockUpdate(BaseModel):
    blocked: bool
    reason: str | None = Field(default=None, max_length=255)


class StudentAttendanceMark(BaseModel):
    student_id: int
    status: str = Field(min_length=6, max_length=7)

    @field_validator("status")
    @classmethod
    def normalize_status(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in {"present", "absent"}:
            raise ValueError("Attendance status must be present or absent")
        return normalized


class CampusAttendanceSettingsOut(BaseModel):
    campus_name: str
    latitude: float | None
    longitude: float | None
    radius_meters: int
    semester_duration_months: int = 6
    semester_duration_unit: Literal["months", "days"] = "months"
    semester_duration_days: int = 180
    campus_configured: bool
    updated_at: str | None = None
    active_slot_batch: dict | None = None
    slot_batches: list[dict] = []


class CampusAttendanceSettingsUpdate(BaseModel):
    radius_meters: int = Field(ge=25, le=2000)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    campus_name: str | None = Field(default=None, max_length=120)


class SemesterDurationUpdate(BaseModel):
    semester_duration_months: int | None = Field(default=None, ge=1, le=24)
    semester_duration_unit: Literal["months", "days"] = "months"
    semester_duration_days: int | None = Field(default=None, ge=1, le=730)


class SlotBatchCreate(BaseModel):
    batch_name: str = Field(min_length=2, max_length=120)
    total_slots: int = Field(ge=1, le=5000)
    open_for_intake: bool = True

    @field_validator("batch_name")
    @classmethod
    def clean_batch_name(cls, value: str) -> str:
        return value.strip()


class SlotBatchUpdate(BaseModel):
    batch_name: str | None = Field(default=None, min_length=2, max_length=120)
    total_slots: int | None = Field(default=None, ge=1, le=5000)
    open_for_intake: bool | None = None

    @field_validator("batch_name")
    @classmethod
    def clean_optional_batch_name(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value


class AdminDashboard(BaseModel):
    admin: dict
    metrics: list[dict]
    account_ratio: dict
    ratio_overview: list[dict] | None = None
    attendance_overview: list[dict]
    students: list[dict]
    professors: list[dict]


class StudentRadiusCheck(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class StudentBiometricVerify(BaseModel):
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    method: str = Field(default="face-recognition", max_length=40)
    face_template: list[float] | None = None


class AdminComplaintStatusUpdate(BaseModel):
    status: Literal["acknowledged", "in_progress", "resolved"]


class ProfessorAttendanceConfirm(BaseModel):
    student_id: int
    present: bool = True


class AnnouncementCreate(BaseModel):
    title: str = Field(min_length=3, max_length=180)
    category: str = Field(default="Academic", min_length=2, max_length=80)
    audience: str = Field(default="All students", min_length=2, max_length=80)
    body: str = Field(min_length=5, max_length=2000)
    pinned: bool = False


class StudyResourceCreate(BaseModel):
    title: str = Field(min_length=3, max_length=180)
    subject: str = Field(min_length=2, max_length=120)
    resource_type: str = Field(default="Notes", min_length=2, max_length=80)
    url: str | None = Field(default=None, max_length=500)
    tag: str = Field(default="new", max_length=80)


class AssignmentReviewCreate(BaseModel):
    student_id: int
    assignment_title: str = Field(min_length=3, max_length=180)
    subject: str = Field(min_length=2, max_length=120)
    grade: str | None = Field(default=None, max_length=20)
    feedback: str | None = Field(default=None, max_length=2000)


class ConnectMessageEdit(BaseModel):
    body: str = Field(min_length=1, max_length=4000)

    @field_validator("body")
    @classmethod
    def clean_body(cls, value: str) -> str:
        return value.strip()


class ConnectMessageDelete(BaseModel):
    mode: Literal["me", "everyone"] = "me"


class PlacementSelectionRequest(BaseModel):
    opportunity_title: str | None = Field(default=None, max_length=120)

    @field_validator("opportunity_title")
    @classmethod
    def clean_opportunity_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None
