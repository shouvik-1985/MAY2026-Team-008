from datetime import date, datetime, timezone
from enum import Enum

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum as SqlEnum,
    Float,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Role(str, Enum):
    student = "student"
    faculty = "faculty"
    admin = "admin"
    scholarship = "scholarship"
    placement = "placement"


class AuthProvider(str, Enum):
    password = "password"
    google = "google"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[Role] = mapped_column(SqlEnum(Role), default=Role.student, nullable=False)
    auth_provider: Mapped[AuthProvider] = mapped_column(
        SqlEnum(AuthProvider), default=AuthProvider.password, nullable=False
    )
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    block_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    blocked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    blocked_by_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    student_profile: Mapped["StudentProfile | None"] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    professor_profile: Mapped["ProfessorProfile | None"] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class StudentProfile(Base):
    __tablename__ = "student_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)
    student_code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    address: Mapped[str] = mapped_column(String(255), default="Campus Residence", nullable=False)
    department: Mapped[str] = mapped_column(String(120), default="Computer Science & AI")
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    focus_area: Mapped[str | None] = mapped_column(String(180), nullable=True)
    skills_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    guardian_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    guardian_phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    state: Mapped[str | None] = mapped_column(String(120), nullable=True)
    linkedin_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    github_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_credits: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_credits: Mapped[int] = mapped_column(Integer, default=180, nullable=False)
    semester: Mapped[int] = mapped_column(Integer, default=1)
    cgpa: Mapped[float] = mapped_column(Float, default=9.2)
    attendance: Mapped[float] = mapped_column(Float, default=92.0)
    enrollment_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    slot_batch_id: Mapped[int | None] = mapped_column(ForeignKey("intake_slot_batches.id"), nullable=True, index=True)
    biometric_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    biometric_template_version: Mapped[str | None] = mapped_column(String(40), nullable=True)
    biometric_enrolled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship(back_populates="student_profile")


class StudentSubjectSelection(Base):
    __tablename__ = "student_subject_selections"
    __table_args__ = (UniqueConstraint("student_id", "semester", name="uq_student_optional_subject_semester"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    semester: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    optional_subject: Mapped[str] = mapped_column(String(120), nullable=False)
    selected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    student: Mapped[User] = relationship(foreign_keys=[student_id])


class StudentSubjectMark(Base):
    __tablename__ = "student_subject_marks"
    __table_args__ = (UniqueConstraint("student_id", "semester", "subject", name="uq_student_subject_marks"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    semester: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    subject: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    unit_test_1: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit_test_2: Mapped[float | None] = mapped_column(Float, nullable=True)
    final_exam: Mapped[float | None] = mapped_column(Float, nullable=True)
    updated_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    student: Mapped[User] = relationship(foreign_keys=[student_id])
    updated_by: Mapped[User | None] = relationship(foreign_keys=[updated_by_id])


class IntakeSlotBatch(Base):
    __tablename__ = "intake_slot_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    batch_name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    total_slots: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    duration_days: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    open_for_intake: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class StudentAttendance(Base):
    __tablename__ = "student_attendance"
    __table_args__ = (UniqueConstraint("student_id", "attendance_date", name="uq_student_attendance_day"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    marked_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    attendance_date: Mapped[date] = mapped_column(
        Date, default=lambda: datetime.now(timezone.utc).date(), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    marked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )


class CampusAttendanceSetting(Base):
    __tablename__ = "campus_attendance_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    campus_name: Mapped[str] = mapped_column(String(120), default="CampusVerse College", nullable=False)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    radius_meters: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    semester_duration_months: Mapped[int] = mapped_column(Integer, default=6, nullable=False)
    semester_duration_unit: Mapped[str] = mapped_column(String(10), default="months", nullable=False)
    semester_duration_days: Mapped[int] = mapped_column(Integer, default=180, nullable=False)
    updated_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class SemesterFeeSetting(Base):
    __tablename__ = "semester_fee_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    semester: Mapped[int] = mapped_column(Integer, unique=True, nullable=False, index=True)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    updated_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class StudentFeeInvoice(Base):
    __tablename__ = "student_fee_invoices"
    __table_args__ = (UniqueConstraint("student_id", "semester", name="uq_student_fee_invoice_semester"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    semester: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    invoice_code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="pending", nullable=False, index=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    razorpay_order_id: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True, index=True)
    razorpay_payment_id: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True, index=True)
    razorpay_signature: Mapped[str | None] = mapped_column(String(255), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    student: Mapped[User] = relationship(foreign_keys=[student_id])


class StudentBiometricCheckIn(Base):
    __tablename__ = "student_biometric_checkins"
    __table_args__ = (UniqueConstraint("student_id", "checkin_date", name="uq_student_biometric_checkin_day"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    checkin_date: Mapped[date] = mapped_column(
        Date, default=lambda: datetime.now(timezone.utc).date(), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(40), default="radius_detected", nullable=False)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    distance_meters: Mapped[float | None] = mapped_column(Float, nullable=True)
    within_radius: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    biometric_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    professor_confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    warning_flag: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    confirmed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class StudentTodo(Base):
    __tablename__ = "student_todos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class StudentCertificateRequest(Base):
    __tablename__ = "student_certificate_requests"
    __table_args__ = (UniqueConstraint("student_id", "certificate_key", name="uq_student_certificate_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    certificate_key: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    certificate_name: Mapped[str] = mapped_column(String(180), nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="requested", nullable=False, index=True)
    purpose: Mapped[str | None] = mapped_column(String(180), nullable=True)
    certificate_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    signatory_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    signatory_title: Mapped[str | None] = mapped_column(String(160), nullable=True)
    admin_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    ready_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    downloaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class StudentEventRegistration(Base):
    __tablename__ = "student_event_registrations"
    __table_args__ = (UniqueConstraint("student_id", "event_key", name="uq_student_event_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    event_key: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    event_title: Mapped[str] = mapped_column(String(180), nullable=False)
    registered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    attended: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class StudentMarketplaceInquiry(Base):
    __tablename__ = "student_marketplace_inquiries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    item_key: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    item_name: Mapped[str] = mapped_column(String(180), nullable=False)
    seller_label: Mapped[str] = mapped_column(String(180), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )


class StudentComplaint(Base):
    __tablename__ = "student_complaints"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    complaint_code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    category: Mapped[str] = mapped_column(String(120), default="Student Services", nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="submitted", nullable=False, index=True)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True
    )
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    in_progress_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    student: Mapped[User] = relationship(foreign_keys=[student_id])
    attachments: Mapped[list["StudentComplaintAttachment"]] = relationship(
        back_populates="complaint",
        cascade="all, delete-orphan",
    )


class StudentComplaintAttachment(Base):
    __tablename__ = "student_complaint_attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    complaint_id: Mapped[int] = mapped_column(ForeignKey("student_complaints.id"), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), default="application/octet-stream", nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    file_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    complaint: Mapped[StudentComplaint] = relationship(back_populates="attachments")


class PlacementApplication(Base):
    __tablename__ = "placement_applications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False, index=True)
    student_name: Mapped[str] = mapped_column(String(120), nullable=False)
    student_email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    semester: Mapped[int] = mapped_column(Integer, nullable=False)
    cgpa: Mapped[float] = mapped_column(Float, nullable=False)
    skills: Mapped[str] = mapped_column(Text, nullable=False)
    linkedin_profile: Mapped[str] = mapped_column(String(500), nullable=False)
    github_profile: Mapped[str] = mapped_column(String(500), nullable=False)
    phone_number: Mapped[str] = mapped_column(String(40), nullable=False)
    resume_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    resume_content_type: Mapped[str] = mapped_column(String(120), default="application/octet-stream", nullable=False)
    resume_file_size: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    resume_file_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="submitted", nullable=False, index=True)
    selection_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    selected_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    selected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    student: Mapped[User] = relationship(foreign_keys=[student_id])
    selected_by: Mapped[User | None] = relationship(foreign_keys=[selected_by_id])


class PlacementRole(Base):
    __tablename__ = "placement_roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    manager_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    company_name: Mapped[str] = mapped_column(String(160), nullable=False)
    role_type: Mapped[str] = mapped_column(String(40), nullable=False)
    location: Mapped[str] = mapped_column(String(160), nullable=False)
    work_mode: Mapped[str] = mapped_column(String(40), nullable=False)
    compensation: Mapped[str] = mapped_column(String(120), nullable=False)
    deadline: Mapped[str] = mapped_column(String(80), nullable=False)
    minimum_semester: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    minimum_cgpa: Mapped[float] = mapped_column(Float, default=7.5, nullable=False)
    required_skills: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="open", nullable=False, index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    manager: Mapped[User] = relationship(foreign_keys=[manager_id])
    applications: Mapped[list["PlacementRoleApplication"]] = relationship(
        back_populates="role",
        cascade="all, delete-orphan",
    )


class PlacementRoleApplication(Base):
    __tablename__ = "placement_role_applications"
    __table_args__ = (UniqueConstraint("role_id", "student_id", name="uq_placement_role_student"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    role_id: Mapped[int] = mapped_column(ForeignKey("placement_roles.id"), nullable=False, index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    placement_application_id: Mapped[int] = mapped_column(
        ForeignKey("placement_applications.id"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(40), default="applied", nullable=False, index=True)
    decision_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    dismissed_by_student: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    dismissed_by_manager: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    role: Mapped[PlacementRole] = relationship(back_populates="applications")
    student: Mapped[User] = relationship(foreign_keys=[student_id])
    placement_application: Mapped[PlacementApplication] = relationship(foreign_keys=[placement_application_id])
    decided_by: Mapped[User | None] = relationship(foreign_keys=[decided_by_id])


class PlacementNotification(Base):
    __tablename__ = "placement_notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    application_id: Mapped[int | None] = mapped_column(ForeignKey("placement_applications.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    channel: Mapped[str] = mapped_column(String(40), default="placement", nullable=False)
    read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True
    )

    student: Mapped[User] = relationship(foreign_keys=[student_id])
    application: Mapped[PlacementApplication | None] = relationship(foreign_keys=[application_id])


class ProfessorProfile(Base):
    __tablename__ = "professor_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)
    address: Mapped[str] = mapped_column(String(255), nullable=False)
    gender: Mapped[str] = mapped_column(String(40), nullable=False)
    highest_education: Mapped[str] = mapped_column(String(120), nullable=False)
    expertise_field: Mapped[str] = mapped_column(String(160), nullable=False)
    department: Mapped[str] = mapped_column(String(120), default="Computer Science & AI", nullable=False)
    designation: Mapped[str] = mapped_column(String(120), default="Assistant Professor", nullable=False)
    license_document_name: Mapped[str] = mapped_column(String(255), nullable=False)
    verification_status: Mapped[str] = mapped_column(String(40), default="pending", nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped[User] = relationship(back_populates="professor_profile")


class Announcement(Base):
    __tablename__ = "announcements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    category: Mapped[str] = mapped_column(String(80), default="Academic", nullable=False)
    audience: Mapped[str] = mapped_column(String(80), default="All students", nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )


class AnnouncementNotification(Base):
    __tablename__ = "announcement_notifications"
    __table_args__ = (UniqueConstraint("announcement_id", "user_id", name="uq_announcement_notification_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    announcement_id: Mapped[int] = mapped_column(ForeignKey("announcements.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )


class StudyResource(Base):
    __tablename__ = "study_resources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    subject: Mapped[str] = mapped_column(String(120), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(80), default="Notes", nullable=False)
    url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    content_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    file_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    tag: Mapped[str] = mapped_column(String(80), default="new", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )


class Assignment(Base):
    __tablename__ = "assignments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    subject: Mapped[str] = mapped_column(String(120), nullable=False)
    assignment_type: Mapped[str] = mapped_column(String(24), default="mcq", nullable=False, index=True)
    source_kind: Mapped[str] = mapped_column(String(40), default="content", nullable=False)
    source_title: Mapped[str] = mapped_column(String(255), default="Selected course material", nullable=False)
    source_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_points: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    question_count: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    semester: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    due_label: Mapped[str] = mapped_column(String(80), default="in 7 days", nullable=False)
    start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    content_json: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    rubric_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="published", nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class AssignmentSubmission(Base):
    __tablename__ = "assignment_submissions"
    __table_args__ = (UniqueConstraint("assignment_id", "student_id", name="uq_assignment_submission_student"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    assignment_id: Mapped[int] = mapped_column(ForeignKey("assignments.id"), nullable=False, index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    reviewed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    submission_type: Mapped[str] = mapped_column(String(24), nullable=False)
    answers_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    content_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    file_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    ai_grade: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ai_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    ai_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_review_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    professor_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    professor_grade: Mapped[str | None] = mapped_column(String(20), nullable=True)
    professor_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="ai_reviewed", nullable=False, index=True)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class AssignmentDraft(Base):
    __tablename__ = "assignment_drafts"
    __table_args__ = (UniqueConstraint("assignment_id", "student_id", name="uq_assignment_draft_student"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    assignment_id: Mapped[int] = mapped_column(ForeignKey("assignments.id"), nullable=False, index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    answers_json: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    active_question_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class AssignmentReview(Base):
    __tablename__ = "assignment_reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    reviewed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    assignment_title: Mapped[str] = mapped_column(String(180), nullable=False)
    subject: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="reviewed", nullable=False)
    grade: Mapped[str | None] = mapped_column(String(20), nullable=True)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )


class ConnectRelationship(Base):
    __tablename__ = "connect_relationships"
    __table_args__ = (
        UniqueConstraint("user_low_id", "user_high_id", name="uq_connect_relationship_pair"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_low_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    user_high_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    requester_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    receiver_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(24), default="pending", nullable=False, index=True)
    blocked_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class ConnectMessage(Base):
    __tablename__ = "connect_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    receiver_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    body: Mapped[str] = mapped_column(Text, default="", nullable=False)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_for_everyone: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class ConnectMessageHidden(Base):
    __tablename__ = "connect_message_hidden"
    __table_args__ = (UniqueConstraint("message_id", "user_id", name="uq_connect_message_hidden_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    message_id: Mapped[int] = mapped_column(ForeignKey("connect_messages.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )


class ConnectAttachment(Base):
    __tablename__ = "connect_attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    message_id: Mapped[int] = mapped_column(ForeignKey("connect_messages.id"), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), default="application/octet-stream", nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    size: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )


class RevokedToken(Base):
    __tablename__ = "revoked_tokens"

    jti: Mapped[str] = mapped_column(String(80), primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )


class MarketplaceItem(Base):
    __tablename__ = "marketplace_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    seller_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    item_key: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    category: Mapped[str] = mapped_column(String(80), default="Notes", nullable=False)
    subcategory: Mapped[str | None] = mapped_column(String(80), nullable=True)
    price: Mapped[str] = mapped_column(String(40), nullable=False)
    seller_name: Mapped[str] = mapped_column(String(120), nullable=False)
    tag: Mapped[str] = mapped_column(String(80), default="Verified", nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    thumbnail_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    image_urls_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    preview_image_urls_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="Available", nullable=False)  # Available, Reserved, Sold
    visibility: Mapped[str] = mapped_column(String(20), default="visible", nullable=False)
    approval_status: Mapped[str] = mapped_column(String(20), default="approved", nullable=False)
    availability: Mapped[str] = mapped_column(String(20), default="in_stock", nullable=False)
    condition: Mapped[str | None] = mapped_column(String(80), nullable=True)
    semester: Mapped[str | None] = mapped_column(String(40), nullable=True)
    subject: Mapped[str | None] = mapped_column(String(120), nullable=True)
    notes_preview_mode: Mapped[str | None] = mapped_column(String(40), nullable=True)
    preview_pages: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pdf_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pdf_content_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    pdf_file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pdf_file_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_by_role: Mapped[str | None] = mapped_column(String(40), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )


class MarketplaceAsset(Base):
    __tablename__ = "marketplace_assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    asset_key: Mapped[str] = mapped_column(String(120), unique=True, nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), default="application/octet-stream", nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    file_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )


class MarketplacePurchase(Base):
    __tablename__ = "marketplace_purchases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("marketplace_items.id"), nullable=False, index=True)
    item_key: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    item_name: Mapped[str] = mapped_column(String(180), nullable=False)
    item_category: Mapped[str] = mapped_column(String(80), default="Notes", nullable=False)
    buyer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    buyer_name: Mapped[str] = mapped_column(String(120), nullable=False)
    buyer_email: Mapped[str] = mapped_column(String(255), nullable=False)
    buyer_student_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    seller_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    seller_label: Mapped[str] = mapped_column(String(180), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="created", nullable=False, index=True)
    razorpay_order_id: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True, index=True)
    razorpay_payment_id: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True, index=True)
    razorpay_signature: Mapped[str | None] = mapped_column(String(255), nullable=True)
    purchased_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
