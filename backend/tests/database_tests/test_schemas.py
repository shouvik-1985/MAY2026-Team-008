"""Direct schema-validation tests: instantiate the Pydantic request models
themselves and check both the valid and invalid paths -- no HTTP client, no
database. These pin down field constraints (bounds, literals, custom validators)
independently of any particular route wiring them up.
"""
import pytest
from pydantic import ValidationError

from app.schemas import (
    AssignmentDigitalSubmissionCreate,
    AssignmentGenerateCreate,
    AssignmentSubmissionReviewUpdate,
    SlotBatchCreate,
    StudentProfileUpdate,
)
from app.routers.admin import CertificateApprovalPayload, SemesterFeeUpdate
from app.routers.student import RazorpayPaymentVerify


# ---------------------------------------------------------------------------
# AssignmentGenerateCreate
# ---------------------------------------------------------------------------

def test_assignment_generate_create_valid_defaults():
    payload = AssignmentGenerateCreate(subject="Data Structures")
    assert payload.assignment_type == "mcq"
    assert payload.source_kind == "resources"
    assert payload.question_count == 5
    assert payload.total_points == 100


def test_assignment_generate_create_rejects_invalid_assignment_type():
    with pytest.raises(ValidationError):
        AssignmentGenerateCreate(subject="Math", assignment_type="essay")


def test_assignment_generate_create_rejects_invalid_source_kind():
    with pytest.raises(ValidationError):
        AssignmentGenerateCreate(subject="Math", source_kind="textbook")


def test_assignment_generate_create_question_count_bounds():
    with pytest.raises(ValidationError):
        AssignmentGenerateCreate(subject="Math", question_count=0)
    with pytest.raises(ValidationError):
        AssignmentGenerateCreate(subject="Math", question_count=13)
    AssignmentGenerateCreate(subject="Math", question_count=12)  # upper bound is inclusive


def test_assignment_generate_create_total_points_bounds():
    with pytest.raises(ValidationError):
        AssignmentGenerateCreate(subject="Math", total_points=9)
    with pytest.raises(ValidationError):
        AssignmentGenerateCreate(subject="Math", total_points=101)
    AssignmentGenerateCreate(subject="Math", total_points=10)  # lower bound is inclusive


def test_assignment_generate_create_subject_too_short_rejected():
    with pytest.raises(ValidationError):
        AssignmentGenerateCreate(subject="A")


def test_assignment_generate_create_blank_optional_text_becomes_none():
    payload = AssignmentGenerateCreate(subject="Math", title="   ", syllabus="   ")
    assert payload.title is None
    assert payload.syllabus is None


def test_assignment_generate_create_strips_whitespace():
    payload = AssignmentGenerateCreate(subject="  Math  ", title="  Midterm  ")
    assert payload.subject == "Math"
    assert payload.title == "Midterm"


# ---------------------------------------------------------------------------
# AssignmentDigitalSubmissionCreate
# ---------------------------------------------------------------------------

def test_digital_submission_cleans_answer_keys_and_values():
    payload = AssignmentDigitalSubmissionCreate(answers={" q1 ": " a ", "q2": "b"})
    assert payload.answers == {"q1": "a", "q2": "b"}


def test_digital_submission_drops_blank_keys():
    payload = AssignmentDigitalSubmissionCreate(answers={"  ": "a", "q1": "b"})
    assert payload.answers == {"q1": "b"}


def test_digital_submission_defaults_to_empty_answers():
    payload = AssignmentDigitalSubmissionCreate()
    assert payload.answers == {}
    assert payload.notes is None


def test_digital_submission_notes_too_long_rejected():
    with pytest.raises(ValidationError):
        AssignmentDigitalSubmissionCreate(notes="x" * 2001)


# ---------------------------------------------------------------------------
# AssignmentSubmissionReviewUpdate
# ---------------------------------------------------------------------------

def test_review_update_score_bounds():
    AssignmentSubmissionReviewUpdate(score=0)
    AssignmentSubmissionReviewUpdate(score=100)
    with pytest.raises(ValidationError):
        AssignmentSubmissionReviewUpdate(score=-1)
    with pytest.raises(ValidationError):
        AssignmentSubmissionReviewUpdate(score=100.1)


def test_review_update_blank_feedback_becomes_none():
    payload = AssignmentSubmissionReviewUpdate(feedback="   ")
    assert payload.feedback is None


def test_review_update_all_fields_optional():
    payload = AssignmentSubmissionReviewUpdate()
    assert payload.score is None
    assert payload.grade is None
    assert payload.feedback is None


# ---------------------------------------------------------------------------
# RazorpayPaymentVerify
# ---------------------------------------------------------------------------

def test_razorpay_payment_verify_requires_all_three_fields():
    RazorpayPaymentVerify(
        razorpay_order_id="order_1", razorpay_payment_id="pay_1", razorpay_signature="sig_1"
    )
    with pytest.raises(ValidationError):
        RazorpayPaymentVerify(razorpay_order_id="order_1", razorpay_payment_id="pay_1")
    with pytest.raises(ValidationError):
        RazorpayPaymentVerify(razorpay_payment_id="pay_1", razorpay_signature="sig_1")


# ---------------------------------------------------------------------------
# SemesterFeeUpdate
# ---------------------------------------------------------------------------

def test_semester_fee_update_amount_bounds():
    SemesterFeeUpdate(amount=1)
    SemesterFeeUpdate(amount=10_000_000)
    with pytest.raises(ValidationError):
        SemesterFeeUpdate(amount=0)
    with pytest.raises(ValidationError):
        SemesterFeeUpdate(amount=10_000_001)


# ---------------------------------------------------------------------------
# CertificateApprovalPayload
# ---------------------------------------------------------------------------

def test_certificate_approval_payload_all_fields_optional():
    payload = CertificateApprovalPayload()
    assert payload.purpose is None
    assert payload.certificate_body is None
    assert payload.signatory_name is None
    assert payload.signatory_title is None
    assert payload.admin_note is None


def test_certificate_approval_payload_field_length_limits():
    CertificateApprovalPayload(purpose="x" * 180)
    with pytest.raises(ValidationError):
        CertificateApprovalPayload(purpose="x" * 181)
    with pytest.raises(ValidationError):
        CertificateApprovalPayload(certificate_body="x" * 1201)
    with pytest.raises(ValidationError):
        CertificateApprovalPayload(admin_note="x" * 801)


# ---------------------------------------------------------------------------
# SlotBatchCreate (regression coverage for the intake-batch bootstrap in conftest)
# ---------------------------------------------------------------------------

def test_slot_batch_create_total_slots_bounds():
    SlotBatchCreate(batch_name="Batch A", total_slots=1)
    SlotBatchCreate(batch_name="Batch A", total_slots=5000)
    with pytest.raises(ValidationError):
        SlotBatchCreate(batch_name="Batch A", total_slots=0)
    with pytest.raises(ValidationError):
        SlotBatchCreate(batch_name="Batch A", total_slots=5001)


def test_slot_batch_create_strips_batch_name():
    payload = SlotBatchCreate(batch_name="  Batch A  ", total_slots=10)
    assert payload.batch_name == "Batch A"


# ---------------------------------------------------------------------------
# StudentProfileUpdate (spot-checking a couple of the validators already
# exercised indirectly via the API tests, but pinned here at the schema level)
# ---------------------------------------------------------------------------

def test_student_profile_update_rejects_short_phone():
    with pytest.raises(ValidationError):
        StudentProfileUpdate(name="Test", email="test@example.com", address="Campus", phone="12345")


def test_student_profile_update_rejects_non_linkedin_domain():
    with pytest.raises(ValidationError):
        StudentProfileUpdate(
            name="Test", email="test@example.com", address="Campus", linkedin_url="https://notlinkedin.com/x"
        )


def test_student_profile_update_dedupes_skills_preserving_order():
    payload = StudentProfileUpdate(
        name="Test", email="test@example.com", address="Campus", skills=["Python", "SQL", "Python"]
    )
    assert payload.skills == ["Python", "SQL"]
