"""Pure unit tests for business-logic helper functions -- no HTTP client and no
database session involved. These exercise the deterministic local-fallback grading
logic and the semester/fee arithmetic directly, in isolation from the API layer.
"""
from datetime import date

from app.assignment_ai import (
    grade_from_score,
    normalize_grade_code,
    review_digital_submission,
    review_file_submission,
)
from app.fee_flow import default_fee_amount, invoice_code, normalize_fee_amount
from app.intake_flow import (
    _elapsed_months,
    resolve_student_semester,
    semester_duration_days,
    semester_duration_months,
    semester_duration_unit,
)


# ---------------------------------------------------------------------------
# assignment_ai: grading
# ---------------------------------------------------------------------------

def test_grade_from_score_boundaries():
    assert grade_from_score(90) == "S"
    assert grade_from_score(89.9) == "A"
    assert grade_from_score(80) == "A"
    assert grade_from_score(70) == "B"
    assert grade_from_score(60) == "C"
    assert grade_from_score(50) == "D"
    assert grade_from_score(40) == "E"
    assert grade_from_score(39.9) == "U"
    assert grade_from_score(0) == "U"


def test_normalize_grade_code_accepts_known_codes_case_insensitively():
    assert normalize_grade_code("a") == "A"
    assert normalize_grade_code("S") == "S"
    assert normalize_grade_code(" b ") == "B"


def test_normalize_grade_code_rejects_unknown_or_empty():
    assert normalize_grade_code("Z") is None
    assert normalize_grade_code(None) is None
    assert normalize_grade_code("") is None


def test_review_digital_submission_mcq_all_correct():
    content = {
        "questions": [
            {"id": "q1", "answerKey": "A"},
            {"id": "q2", "answerKey": "B"},
        ]
    }
    review = review_digital_submission(
        assignment_type="mcq", content=content, answers={"q1": "A", "q2": "B"}, total_points=100
    )
    assert review["score"] == 100
    assert review["grade"] == "S"


def test_review_digital_submission_mcq_partial_credit():
    content = {"questions": [{"id": "q1", "answerKey": "A"}, {"id": "q2", "answerKey": "B"}]}
    review = review_digital_submission(
        assignment_type="mcq", content=content, answers={"q1": "A", "q2": "C"}, total_points=100
    )
    assert review["score"] == 50


def test_review_digital_submission_mcq_answers_are_case_insensitive():
    content = {"questions": [{"id": "q1", "answerKey": "A"}]}
    review = review_digital_submission(
        assignment_type="mcq", content=content, answers={"q1": "a"}, total_points=100
    )
    assert review["score"] == 100


def test_review_digital_submission_no_questions_returns_zero():
    review = review_digital_submission(assignment_type="mcq", content={}, answers={}, total_points=100)
    assert review["score"] == 0
    assert review["grade"] == "Needs Revision"


def test_review_digital_submission_qa_rewards_longer_relevant_answers():
    content = {
        "questions": [
            {"id": "q1", "expectedKeywords": ["scheduling", "deadlock", "memory"]},
        ]
    }
    thorough = review_digital_submission(
        assignment_type="qa",
        content=content,
        answers={
            "q1": (
                "Process scheduling, deadlock avoidance, and memory management are core "
                "operating system responsibilities that require careful coordination "
                "across the kernel to keep the system responsive and correct."
            )
        },
        total_points=100,
    )
    thin = review_digital_submission(
        assignment_type="qa", content=content, answers={"q1": "not sure"}, total_points=100
    )
    assert thorough["score"] > thin["score"]


def test_review_file_submission_rewards_correct_type_and_notes():
    good = review_file_submission(
        filename="report.pdf", notes="A detailed summary of my findings.", file_size=30_000, total_points=100
    )
    bad = review_file_submission(filename="report.exe", notes="", file_size=100, total_points=100)
    assert good["score"] > bad["score"]


def test_review_file_submission_scales_with_total_points():
    review = review_file_submission(
        filename="report.pdf", notes="Some notes here.", file_size=30_000, total_points=50
    )
    assert review["score"] <= 50


# ---------------------------------------------------------------------------
# fee_flow: fee arithmetic
# ---------------------------------------------------------------------------

def test_default_fee_amount_scales_with_semester():
    assert default_fee_amount(1) == 79200
    assert default_fee_amount(4) == 82800
    assert default_fee_amount(4) > default_fee_amount(1)


def test_normalize_fee_amount_falls_back_to_default_when_invalid():
    assert normalize_fee_amount(2, None) == default_fee_amount(2)
    assert normalize_fee_amount(2, 0) == default_fee_amount(2)
    assert normalize_fee_amount(2, -5) == default_fee_amount(2)


def test_normalize_fee_amount_keeps_valid_amount():
    assert normalize_fee_amount(2, 50000) == 50000


def test_invoice_code_format():
    assert invoice_code(student_id=7, semester=1) == "INV-0073"
    assert invoice_code(student_id=123, semester=2) == "INV-1234"


# ---------------------------------------------------------------------------
# intake_flow: semester resolution
# ---------------------------------------------------------------------------

def test_semester_duration_helpers_apply_defaults():
    assert semester_duration_months(None) == 6
    assert semester_duration_months(0) == 6
    assert semester_duration_days(None) == 180
    assert semester_duration_unit("days") == "days"
    assert semester_duration_unit("anything-else") == "months"


def test_elapsed_months_same_day_is_zero():
    assert _elapsed_months(date(2026, 1, 1), date(2026, 1, 1)) == 0


def test_elapsed_months_full_year():
    assert _elapsed_months(date(2025, 1, 15), date(2026, 1, 15)) == 12


def test_elapsed_months_partial_month_not_yet_reached():
    assert _elapsed_months(date(2026, 1, 15), date(2026, 2, 14)) == 0
    assert _elapsed_months(date(2026, 1, 15), date(2026, 2, 15)) == 1


class _FakeProfile:
    def __init__(self, enrollment_date):
        self.enrollment_date = enrollment_date


class _FakeUser:
    created_at = None


def test_resolve_student_semester_caps_at_four_even_after_many_years():
    profile = _FakeProfile(date(2015, 1, 1))
    semester = resolve_student_semester(
        profile, _FakeUser(), duration_months=6, duration_unit="months", as_of=date(2026, 1, 1)
    )
    assert semester == 4


def test_resolve_student_semester_no_profile_defaults_to_one():
    assert resolve_student_semester(None, _FakeUser(), duration_months=6) == 1


def test_resolve_student_semester_on_enrollment_day_is_one():
    profile = _FakeProfile(date(2026, 1, 1))
    semester = resolve_student_semester(profile, _FakeUser(), duration_months=6, as_of=date(2026, 1, 1))
    assert semester == 1


def test_resolve_student_semester_days_unit():
    profile = _FakeProfile(date(2026, 1, 1))
    semester = resolve_student_semester(
        profile,
        _FakeUser(),
        duration_months=6,
        duration_unit="days",
        duration_days=30,
        as_of=date(2026, 4, 1),  # 90 days later -> 3 full 30-day periods
    )
    assert semester == 4  # 1 + 90 // 30 = 4
