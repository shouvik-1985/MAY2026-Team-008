"""Direct database-layer tests: model constraints and column defaults, exercised
against a throwaway in-memory SQLite database via SQLAlchemy directly -- no HTTP
client and no FastAPI app involved. These catch schema regressions (a dropped
unique constraint, a changed default) that API-level tests wouldn't necessarily
surface.
"""
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.models import (
    Announcement,
    AnnouncementNotification,
    Assignment,
    AssignmentSubmission,
    AuthProvider,
    Base,
    IntakeSlotBatch,
    Role,
    SemesterFeeSetting,
    StudentFeeInvoice,
    StudentProfile,
    User,
)


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()
    engine.dispose()


def _make_user(session, role=Role.student):
    user = User(
        email=f"user-{uuid.uuid4().hex[:10]}@example.com",
        full_name="Test User",
        role=role,
        auth_provider=AuthProvider.password,
        hashed_password="hashed",
    )
    session.add(user)
    session.flush()
    return user


# ---------------------------------------------------------------------------
# StudentFeeInvoice
# ---------------------------------------------------------------------------

def test_student_fee_invoice_unique_per_student_and_semester(db_session):
    user = _make_user(db_session)
    db_session.add(StudentFeeInvoice(student_id=user.id, semester=1, invoice_code="INV-A", amount=1000))
    db_session.flush()

    db_session.add(StudentFeeInvoice(student_id=user.id, semester=1, invoice_code="INV-B", amount=1000))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_student_fee_invoice_same_student_different_semester_allowed(db_session):
    user = _make_user(db_session)
    db_session.add(StudentFeeInvoice(student_id=user.id, semester=1, invoice_code="INV-F1", amount=1000))
    db_session.add(StudentFeeInvoice(student_id=user.id, semester=2, invoice_code="INV-F2", amount=1000))
    db_session.flush()  # should not raise


def test_student_fee_invoice_invoice_code_globally_unique(db_session):
    user_a = _make_user(db_session)
    user_b = _make_user(db_session)
    db_session.add(StudentFeeInvoice(student_id=user_a.id, semester=1, invoice_code="INV-SAME", amount=1000))
    db_session.flush()

    db_session.add(StudentFeeInvoice(student_id=user_b.id, semester=1, invoice_code="INV-SAME", amount=1000))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_student_fee_invoice_defaults(db_session):
    user = _make_user(db_session)
    invoice = StudentFeeInvoice(student_id=user.id, semester=1, invoice_code="INV-C", amount=1000)
    db_session.add(invoice)
    db_session.flush()
    assert invoice.status == "pending"
    assert invoice.currency == "INR"
    assert invoice.razorpay_order_id is None
    assert invoice.paid_at is None


def test_student_fee_invoice_razorpay_order_id_globally_unique(db_session):
    user_a = _make_user(db_session)
    user_b = _make_user(db_session)
    db_session.add(
        StudentFeeInvoice(
            student_id=user_a.id, semester=1, invoice_code="INV-D", amount=1000, razorpay_order_id="order_1"
        )
    )
    db_session.flush()

    db_session.add(
        StudentFeeInvoice(
            student_id=user_b.id, semester=1, invoice_code="INV-E", amount=1000, razorpay_order_id="order_1"
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


# ---------------------------------------------------------------------------
# SemesterFeeSetting
# ---------------------------------------------------------------------------

def test_semester_fee_setting_unique_semester(db_session):
    db_session.add(SemesterFeeSetting(semester=1, amount=80000))
    db_session.flush()
    db_session.add(SemesterFeeSetting(semester=1, amount=90000))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_semester_fee_setting_defaults_currency_to_inr(db_session):
    setting = SemesterFeeSetting(semester=1, amount=80000)
    db_session.add(setting)
    db_session.flush()
    assert setting.currency == "INR"


# ---------------------------------------------------------------------------
# Assignment / AssignmentSubmission
# ---------------------------------------------------------------------------

def test_assignment_submission_unique_per_student(db_session):
    professor = _make_user(db_session, role=Role.faculty)
    student = _make_user(db_session, role=Role.student)
    assignment = Assignment(created_by_id=professor.id, title="Quiz 1", subject="Math")
    db_session.add(assignment)
    db_session.flush()

    db_session.add(AssignmentSubmission(assignment_id=assignment.id, student_id=student.id, submission_type="mcq"))
    db_session.flush()

    db_session.add(AssignmentSubmission(assignment_id=assignment.id, student_id=student.id, submission_type="mcq"))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_assignment_submission_different_students_allowed(db_session):
    professor = _make_user(db_session, role=Role.faculty)
    student_a = _make_user(db_session, role=Role.student)
    student_b = _make_user(db_session, role=Role.student)
    assignment = Assignment(created_by_id=professor.id, title="Quiz 1", subject="Math")
    db_session.add(assignment)
    db_session.flush()

    db_session.add(AssignmentSubmission(assignment_id=assignment.id, student_id=student_a.id, submission_type="mcq"))
    db_session.add(AssignmentSubmission(assignment_id=assignment.id, student_id=student_b.id, submission_type="mcq"))
    db_session.flush()  # should not raise


def test_assignment_defaults(db_session):
    professor = _make_user(db_session, role=Role.faculty)
    assignment = Assignment(created_by_id=professor.id, title="Quiz 1", subject="Math")
    db_session.add(assignment)
    db_session.flush()
    assert assignment.assignment_type == "mcq"
    assert assignment.status == "published"
    assert assignment.total_points == 100
    assert assignment.question_count == 5
    assert assignment.source_kind == "content"


def test_assignment_submission_defaults(db_session):
    professor = _make_user(db_session, role=Role.faculty)
    student = _make_user(db_session, role=Role.student)
    assignment = Assignment(created_by_id=professor.id, title="Quiz 1", subject="Math")
    db_session.add(assignment)
    db_session.flush()

    submission = AssignmentSubmission(assignment_id=assignment.id, student_id=student.id, submission_type="mcq")
    db_session.add(submission)
    db_session.flush()
    assert submission.status == "ai_reviewed"
    assert submission.professor_score is None
    assert submission.professor_grade is None


# ---------------------------------------------------------------------------
# IntakeSlotBatch
# ---------------------------------------------------------------------------

def test_intake_slot_batch_name_globally_unique(db_session):
    db_session.add(IntakeSlotBatch(batch_name="Batch X", total_slots=100))
    db_session.flush()
    db_session.add(IntakeSlotBatch(batch_name="Batch X", total_slots=50))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_intake_slot_batch_defaults_closed(db_session):
    batch = IntakeSlotBatch(batch_name="Batch Y", total_slots=100)
    db_session.add(batch)
    db_session.flush()
    assert batch.open_for_intake is False


# ---------------------------------------------------------------------------
# StudentProfile
# ---------------------------------------------------------------------------

def test_student_profile_one_per_user(db_session):
    user = _make_user(db_session)
    db_session.add(StudentProfile(user_id=user.id, student_code="SC-1"))
    db_session.flush()

    db_session.add(StudentProfile(user_id=user.id, student_code="SC-2"))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_student_profile_student_code_globally_unique(db_session):
    user_a = _make_user(db_session)
    user_b = _make_user(db_session)
    db_session.add(StudentProfile(user_id=user_a.id, student_code="SC-SAME"))
    db_session.flush()

    db_session.add(StudentProfile(user_id=user_b.id, student_code="SC-SAME"))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_student_profile_defaults(db_session):
    user = _make_user(db_session)
    profile = StudentProfile(user_id=user.id, student_code="SC-3")
    db_session.add(profile)
    db_session.flush()
    assert profile.department == "Computer Science & AI"
    assert profile.total_credits == 180
    assert profile.semester == 1
    assert profile.cgpa == 9.2
    assert profile.attendance == 92.0
    assert profile.completed_credits is None


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------

def test_user_email_globally_unique(db_session):
    db_session.add(User(email="dup@example.com", full_name="A", role=Role.student, auth_provider=AuthProvider.password))
    db_session.flush()
    db_session.add(User(email="dup@example.com", full_name="B", role=Role.student, auth_provider=AuthProvider.password))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_user_defaults(db_session):
    user = User(email="defaults@example.com", full_name="Default User")
    db_session.add(user)
    db_session.flush()
    assert user.role == Role.student
    assert user.auth_provider == AuthProvider.password
    assert user.is_blocked is False


# ---------------------------------------------------------------------------
# Announcement / AnnouncementNotification (new)
# ---------------------------------------------------------------------------

def test_announcement_notification_unique_per_user(db_session):
    admin = _make_user(db_session, role=Role.admin)
    student = _make_user(db_session, role=Role.student)
    announcement = Announcement(created_by_id=admin.id, title="Notice", body="Details go here.")
    db_session.add(announcement)
    db_session.flush()

    db_session.add(AnnouncementNotification(announcement_id=announcement.id, user_id=student.id))
    db_session.flush()

    db_session.add(AnnouncementNotification(announcement_id=announcement.id, user_id=student.id))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_announcement_notification_defaults_unread(db_session):
    admin = _make_user(db_session, role=Role.admin)
    student = _make_user(db_session, role=Role.student)
    announcement = Announcement(created_by_id=admin.id, title="Notice", body="Details go here.")
    db_session.add(announcement)
    db_session.flush()

    notification = AnnouncementNotification(announcement_id=announcement.id, user_id=student.id)
    db_session.add(notification)
    db_session.flush()
    assert notification.read is False
