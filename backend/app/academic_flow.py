from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from math import ceil
import re
from typing import Any

from sqlalchemy.orm import Session

from app.intake_flow import (
    local_today,
    resolve_student_semester,
    semester_duration_days,
    semester_duration_months,
    semester_duration_unit,
    student_enrollment_date,
)
from app.models import (
    Assignment,
    AssignmentSubmission,
    CampusAttendanceSetting,
    StudentFeeInvoice,
    StudentProfile,
    StudentSubjectMark,
    StudentSubjectSelection,
    User,
)


ALL_SUBJECTS: list[str] = [
    "Mathematics for Data Science I",
    "Statistics for Data Science I",
    "Computational Thinking",
    "English I",
    "Mathematics for Data Science II",
    "Statistics for Data Science II",
    "Programming in Python",
    "English II",
    "Database Management Systems",
    "Programming, Data Structures and Algorithms using Python",
    "Modern Application Development I",
    "Programming Concepts using Java",
    "Modern Application Development II",
    "System Commands",
    "Machine Learning Foundations",
    "Business Data Management",
    "Machine Learning Techniques",
    "Machine Learning Practice",
    "Tools in Data Science",
    "Business Analytics",
    "Introduction to Deep Learning and Generative AI",
]

SUBJECT_CATALOG: dict[int, dict[str, list[str]]] = {
    1: {
        "fixed": [
            "Statistics for Data Science I",
            "Statistics for Data Science II",
            "Programming in Python",
        ],
    },
    2: {
        "fixed": [
            "Database Management Systems",
            "Programming, Data Structures and Algorithms using Python",
            "Programming Concepts using Java",
        ],
    },
    3: {
        "fixed": [
            "Machine Learning Foundations",
            "Machine Learning Practice",
            "Business Data Management",
        ],
    },
    4: {
        "fixed": [
            "Introduction to Deep Learning and Generative AI",
            "System Commands",
            "Business Analytics",
        ],
    },
}

ASSIGNMENT_WEIGHT = 0.10
UNIT_TEST_1_WEIGHT = 0.20
UNIT_TEST_2_WEIGHT = 0.20
FINAL_EXAM_WEIGHT = 0.50
PASS_PERCENTAGE = 50.0


def _key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


_FIXED_SUBJECT_KEYS = {
    _key(subject)
    for semester in SUBJECT_CATALOG.values()
    for subject in semester["fixed"]
}
OPTIONAL_SUBJECT_POOL = [
    subject
    for subject in ALL_SUBJECTS
    if _key(subject) not in _FIXED_SUBJECT_KEYS
]
_CANONICAL_SUBJECTS = {_key(subject): subject for subject in ALL_SUBJECTS}
_SUBJECT_ALIASES = {
    "statisticsfordatascience1": "Statistics for Data Science I",
    "statisticsfordatasciencei": "Statistics for Data Science I",
    "statisticsfordatascienceone": "Statistics for Data Science I",
    "statisticsfordatascience": "Statistics for Data Science I",
    "statisticsfordatascience2": "Statistics for Data Science II",
    "statisticsfordatascienceii": "Statistics for Data Science II",
    "statisticsfordatasciencetwo": "Statistics for Data Science II",
    "databasemanagementsystem": "Database Management Systems",
    "databasemanagementsystems": "Database Management Systems",
    "programmingdatastructuresandalgorithmsusingpython": "Programming, Data Structures and Algorithms using Python",
}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def normalize_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def normalize_subject_name(value: str | None) -> str:
    cleaned = re.sub(r"\s+", " ", (value or "").strip())
    if not cleaned:
        return ""
    subject_key = _key(cleaned)
    return _SUBJECT_ALIASES.get(subject_key) or _CANONICAL_SUBJECTS.get(subject_key) or cleaned


def subject_catalog_payload() -> list[dict[str, Any]]:
    return [
        {
            "semester": semester,
            "fixedSubjects": list(groups["fixed"]),
            "optionalSubjects": list(OPTIONAL_SUBJECT_POOL),
        }
        for semester, groups in sorted(SUBJECT_CATALOG.items())
    ]


def subjects_for_semester(semester: int) -> dict[str, list[str]]:
    normalized = min(4, max(1, int(semester or 1)))
    groups = SUBJECT_CATALOG.get(normalized, SUBJECT_CATALOG[1])
    return {"fixed": list(groups["fixed"]), "optional": list(OPTIONAL_SUBJECT_POOL)}


def infer_subject_semester(subject: str | None) -> int | None:
    normalized = normalize_subject_name(subject)
    if not normalized:
        return None
    for semester, groups in SUBJECT_CATALOG.items():
        if normalized in groups["fixed"]:
            return semester
    return None


def semester_total_days(setting: CampusAttendanceSetting) -> int:
    if semester_duration_unit(setting.semester_duration_unit) == "days":
        return semester_duration_days(setting.semester_duration_days)
    return semester_duration_months(setting.semester_duration_months) * 30


def optional_selection_days(setting: CampusAttendanceSetting) -> int:
    return max(1, ceil(semester_total_days(setting) * 0.01))


def _add_months(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    month_lengths = [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return date(year, month, min(value.day, month_lengths[month - 1]))


def semester_start_date(
    profile: StudentProfile,
    user: User,
    semester: int,
    setting: CampusAttendanceSetting,
) -> date:
    enrolled_on = student_enrollment_date(profile, user)
    offset = max(0, min(4, semester) - 1)
    if semester_duration_unit(setting.semester_duration_unit) == "days":
        return enrolled_on + timedelta(days=semester_duration_days(setting.semester_duration_days) * offset)
    return _add_months(enrolled_on, semester_duration_months(setting.semester_duration_months) * offset)


def optional_selection_deadline(
    profile: StudentProfile,
    user: User,
    semester: int,
    setting: CampusAttendanceSetting,
) -> date:
    return semester_start_date(profile, user, semester, setting) + timedelta(days=optional_selection_days(setting))


def _selection_for(db: Session, student_id: int, semester: int) -> StudentSubjectSelection | None:
    return (
        db.query(StudentSubjectSelection)
        .filter(
            StudentSubjectSelection.student_id == student_id,
            StudentSubjectSelection.semester == semester,
        )
        .first()
    )


def _selected_optional_subjects_before(db: Session, student_id: int, semester: int) -> set[str]:
    selections = (
        db.query(StudentSubjectSelection.optional_subject)
        .filter(
            StudentSubjectSelection.student_id == student_id,
            StudentSubjectSelection.semester < semester,
        )
        .all()
    )
    return {normalize_subject_name(item[0]) for item in selections if item[0]}


def _available_optional_subjects(
    db: Session,
    student_id: int,
    semester: int,
    current_selection: str | None = None,
) -> list[str]:
    used_subjects = _selected_optional_subjects_before(db, student_id, semester)
    current_subject = normalize_subject_name(current_selection) if current_selection else None
    return [
        subject
        for subject in OPTIONAL_SUBJECT_POOL
        if subject == current_subject or normalize_subject_name(subject) not in used_subjects
    ]


def optional_selection_payload(
    db: Session,
    user: User,
    profile: StudentProfile,
    setting: CampusAttendanceSetting,
    semester: int | None = None,
) -> dict[str, Any]:
    current_semester = min(4, max(1, semester or profile.semester or 1))
    groups = subjects_for_semester(current_semester)
    selection = _selection_for(db, user.id, current_semester)
    deadline = optional_selection_deadline(profile, user, current_semester, setting)
    expired = local_today() > deadline
    selected_subject = selection.optional_subject if selection else None
    optional_subjects = _available_optional_subjects(db, user.id, current_semester, selected_subject)
    return {
        "semester": current_semester,
        "fixedSubjects": groups["fixed"],
        "optionalSubjects": optional_subjects,
        "selectedSubject": selected_subject,
        "selectedAt": selection.selected_at.isoformat() if selection else None,
        "deadline": deadline.isoformat(),
        "deadlineExpired": expired,
        "canSelect": (not expired) and bool(optional_subjects),
        "selectionWindowDays": optional_selection_days(setting),
        "semesterStart": semester_start_date(profile, user, current_semester, setting).isoformat(),
    }


def choose_optional_subject(
    db: Session,
    user: User,
    profile: StudentProfile,
    setting: CampusAttendanceSetting,
    optional_subject: str,
) -> StudentSubjectSelection:
    semester = min(4, max(1, profile.semester or 1))
    groups = subjects_for_semester(semester)
    subject = normalize_subject_name(optional_subject)
    if subject not in groups["optional"]:
        raise ValueError("Optional subject is not available for the current semester")
    if subject in _selected_optional_subjects_before(db, user.id, semester):
        raise ValueError("This optional subject was already completed in an earlier semester")

    deadline = optional_selection_deadline(profile, user, semester, setting)
    if local_today() > deadline:
        raise TimeoutError("Optional subject selection deadline has passed")

    selection = _selection_for(db, user.id, semester)
    moment = now_utc()
    if selection:
        selection.optional_subject = subject
        selection.updated_at = moment
        return selection

    selection = StudentSubjectSelection(
        student_id=user.id,
        semester=semester,
        optional_subject=subject,
        selected_at=moment,
        updated_at=moment,
    )
    db.add(selection)
    db.flush()
    return selection


def student_enrolled_subjects(db: Session, student_id: int, semester: int) -> list[str]:
    groups = subjects_for_semester(semester)
    subjects = list(groups["fixed"])
    selection = _selection_for(db, student_id, semester)
    if selection and selection.optional_subject not in subjects:
        subjects.append(selection.optional_subject)
    return subjects


def assignment_due_label(assignment: Assignment, moment: datetime | None = None) -> str:
    if not assignment.due_at:
        return assignment.due_label or "Rolling"
    now = moment or now_utc()
    due_at = normalize_datetime(assignment.due_at) or assignment.due_at
    delta = due_at - now
    if delta.total_seconds() < 0:
        return f"Closed {due_at.strftime('%d %b, %I:%M %p')}"
    days = delta.days
    if days >= 1:
        return f"in {days} day" if days == 1 else f"in {days} days"
    hours = int(delta.total_seconds() // 3600)
    if hours >= 1:
        return f"in {hours} hour" if hours == 1 else f"in {hours} hours"
    minutes = max(1, int(delta.total_seconds() // 60))
    return f"in {minutes} min"


def assignment_is_available(assignment: Assignment, moment: datetime | None = None) -> bool:
    if not assignment.start_at:
        return True
    return (normalize_datetime(assignment.start_at) or assignment.start_at) <= (moment or now_utc())


def assignment_is_late(assignment: Assignment, moment: datetime | None = None) -> bool:
    if not assignment.due_at:
        return False
    return (normalize_datetime(assignment.due_at) or assignment.due_at) < (moment or now_utc())


def assignment_matches_student_semester(
    assignment: Assignment,
    semester: int,
    enrolled_subjects: list[str],
) -> bool:
    subject = normalize_subject_name(assignment.subject)
    enrolled_subject_keys = {normalize_subject_name(item) for item in enrolled_subjects}
    if subject not in enrolled_subject_keys:
        return False
    if assignment.semester is not None and assignment.semester != semester:
        return False
    return True


def score_percent_from_submission(
    submission: AssignmentSubmission | None,
    assignment: Assignment,
) -> float | None:
    if submission is None:
        return None
    score = submission.professor_score if submission.professor_score is not None else submission.ai_score
    if score is None:
        return None
    return round((max(0.0, min(float(score), float(assignment.total_points))) / max(1, assignment.total_points)) * 100, 2)


def assignment_average_for_subject(
    db: Session,
    student_id: int,
    semester: int,
    subject: str,
    moment: datetime | None = None,
) -> dict[str, Any]:
    now = moment or now_utc()
    normalized_subject = normalize_subject_name(subject)
    assignments = (
        db.query(Assignment)
        .filter(Assignment.status == "published")
        .all()
    )
    submissions = {
        submission.assignment_id: submission
        for submission in (
            db.query(AssignmentSubmission)
            .filter(AssignmentSubmission.student_id == student_id)
            .all()
        )
    }

    scores: list[float] = []
    total = 0
    submitted = 0
    late_zeros = 0
    for assignment in assignments:
        if normalize_subject_name(assignment.subject) != normalized_subject:
            continue
        assignment_semester = assignment.semester or infer_subject_semester(assignment.subject)
        if assignment_semester is not None and assignment_semester != semester:
            continue
        if not assignment_is_available(assignment, now):
            continue
        total += 1
        submission = submissions.get(assignment.id)
        score = score_percent_from_submission(submission, assignment)
        if score is not None:
            scores.append(score)
            submitted += 1
        elif assignment_is_late(assignment, now):
            scores.append(0.0)
            late_zeros += 1

    average = round(sum(scores) / len(scores), 2) if scores else 0.0
    return {
        "score": average,
        "assignmentCount": total,
        "gradedCount": len(scores),
        "submittedCount": submitted,
        "lateZeroCount": late_zeros,
    }


def _mark_for(db: Session, student_id: int, semester: int, subject: str) -> StudentSubjectMark | None:
    return (
        db.query(StudentSubjectMark)
        .filter(
            StudentSubjectMark.student_id == student_id,
            StudentSubjectMark.semester == semester,
            StudentSubjectMark.subject == normalize_subject_name(subject),
        )
        .first()
    )


def calculate_overall_percentage(
    assignment_score: float,
    unit_test_1: float | None,
    unit_test_2: float | None,
    final_exam: float | None,
) -> float:
    return round(
        (assignment_score * ASSIGNMENT_WEIGHT)
        + ((unit_test_1 or 0.0) * UNIT_TEST_1_WEIGHT)
        + ((unit_test_2 or 0.0) * UNIT_TEST_2_WEIGHT)
        + ((final_exam or 0.0) * FINAL_EXAM_WEIGHT),
        2,
    )


def subject_mark_payload(
    db: Session,
    student: User,
    profile: StudentProfile,
    semester: int,
    subject: str,
) -> dict[str, Any]:
    normalized_subject = normalize_subject_name(subject)
    mark = _mark_for(db, student.id, semester, normalized_subject)
    assignment = assignment_average_for_subject(db, student.id, semester, normalized_subject)
    unit_test_1 = mark.unit_test_1 if mark else None
    unit_test_2 = mark.unit_test_2 if mark else None
    final_exam = mark.final_exam if mark else None
    overall = calculate_overall_percentage(assignment["score"], unit_test_1, unit_test_2, final_exam)
    offline_complete = unit_test_1 is not None and unit_test_2 is not None and final_exam is not None
    status = "pass" if offline_complete and overall >= PASS_PERCENTAGE else "reattempt" if offline_complete else "incomplete"
    return {
        "studentId": student.id,
        "student": student.full_name,
        "studentCode": profile.student_code,
        "semester": semester,
        "subject": normalized_subject,
        "assignmentScore": assignment["score"],
        "assignmentCount": assignment["assignmentCount"],
        "gradedAssignmentCount": assignment["gradedCount"],
        "lateZeroCount": assignment["lateZeroCount"],
        "unitTest1": unit_test_1,
        "unitTest2": unit_test_2,
        "finalExam": final_exam,
        "overallPercentage": overall,
        "cgpa": round(overall / 10, 2),
        "offlineComplete": offline_complete,
        "status": status,
        "updatedAt": mark.updated_at.isoformat() if mark else None,
    }


def semester_result_summary(
    db: Session,
    student: User,
    profile: StudentProfile,
    semester: int,
) -> dict[str, Any]:
    subjects = student_enrolled_subjects(db, student.id, semester)
    rows = [subject_mark_payload(db, student, profile, semester, subject) for subject in subjects]
    has_optional = bool(_selection_for(db, student.id, semester))
    has_any_data = any(
        row["offlineComplete"] or row["assignmentCount"] or row["gradedAssignmentCount"]
        for row in rows
    )
    percentage = round(sum(row["overallPercentage"] for row in rows) / len(rows), 2) if rows else 0.0
    complete = bool(rows) and all(row["offlineComplete"] for row in rows) and has_optional
    passed = complete and percentage >= PASS_PERCENTAGE
    return {
        "semester": semester,
        "subjects": rows,
        "percentage": percentage,
        "cgpa": round(percentage / 10, 2),
        "complete": complete,
        "passed": passed,
        "hasAcademicData": has_any_data,
        "optionalSelected": has_optional,
        "status": "pass" if passed else "reattempt" if complete else "incomplete",
    }


def real_cgpa_for_student(
    db: Session,
    student: User,
    profile: StudentProfile,
    semester: int,
) -> dict[str, Any]:
    summaries = [semester_result_summary(db, student, profile, sem) for sem in range(1, semester + 1)]
    available = [item for item in summaries if item["hasAcademicData"]]
    if not available:
        return {
            "cgpa": 0.0,
            "percentage": 0.0,
            "trend": [{"term": f"Sem {idx}", "cgpa": 0.0} for idx in range(1, semester + 1)],
            "current": summaries[-1] if summaries else None,
            "hasAcademicData": False,
        }
    cgpa = round(sum(item["cgpa"] for item in available) / len(available), 2)
    trend = [{"term": f"Sem {item['semester']}", "cgpa": item["cgpa"]} for item in summaries]
    return {
        "cgpa": cgpa,
        "percentage": available[-1]["percentage"],
        "trend": trend,
        "current": summaries[-1],
        "hasAcademicData": True,
    }


def save_offline_marks(
    db: Session,
    professor: User,
    student: User,
    profile: StudentProfile,
    semester: int,
    subject: str,
    unit_test_1: float | None,
    unit_test_2: float | None,
    final_exam: float | None,
) -> dict[str, Any]:
    normalized_semester = min(4, max(1, semester))
    normalized_subject = normalize_subject_name(subject)
    allowed_subjects = set(subjects_for_semester(normalized_semester)["fixed"])
    allowed_subjects.update(subjects_for_semester(normalized_semester)["optional"])
    if normalized_subject not in allowed_subjects:
        raise ValueError("Subject is not configured for the selected semester")
    enrolled_subjects = {normalize_subject_name(item) for item in student_enrolled_subjects(db, student.id, normalized_semester)}
    if normalized_subject not in enrolled_subjects:
        raise ValueError("Student is not enrolled in the selected subject")

    mark = _mark_for(db, student.id, normalized_semester, normalized_subject)
    moment = now_utc()
    if mark is None:
        mark = StudentSubjectMark(
            student_id=student.id,
            semester=normalized_semester,
            subject=normalized_subject,
            updated_by_id=professor.id,
            created_at=moment,
            updated_at=moment,
        )
        db.add(mark)
    mark.unit_test_1 = unit_test_1
    mark.unit_test_2 = unit_test_2
    mark.final_exam = final_exam
    mark.updated_by_id = professor.id
    mark.updated_at = moment
    db.flush()

    academic = real_cgpa_for_student(db, student, profile, max(profile.semester or normalized_semester, normalized_semester))
    profile.cgpa = academic["cgpa"]
    db.flush()
    return subject_mark_payload(db, student, profile, normalized_semester, normalized_subject)


def _has_promotion_evidence(db: Session, student_id: int) -> bool:
    if db.query(StudentFeeInvoice.id).filter(StudentFeeInvoice.student_id == student_id).first():
        return True
    if db.query(StudentSubjectMark.id).filter(StudentSubjectMark.student_id == student_id).first():
        return True
    if db.query(StudentSubjectSelection.id).filter(StudentSubjectSelection.student_id == student_id).first():
        return True
    if db.query(AssignmentSubmission.id).filter(AssignmentSubmission.student_id == student_id).first():
        return True
    return False


def semester_fee_paid(db: Session, student_id: int, semester: int) -> bool:
    invoice = (
        db.query(StudentFeeInvoice)
        .filter(
            StudentFeeInvoice.student_id == student_id,
            StudentFeeInvoice.semester == semester,
        )
        .first()
    )
    return bool(invoice and invoice.status == "paid")


def promotion_check(db: Session, student: User, profile: StudentProfile, semester: int) -> dict[str, Any]:
    result = semester_result_summary(db, student, profile, semester)
    fee_paid = semester_fee_paid(db, student.id, semester)
    can_promote = fee_paid and result["passed"]
    return {
        "semester": semester,
        "canPromote": can_promote,
        "feePaid": fee_paid,
        "percentage": result["percentage"],
        "academicPassed": result["passed"],
        "status": "promote" if can_promote else "reattempt",
        "reason": "Eligible for promotion"
        if can_promote
        else "Fee pending" if not fee_paid
        else "Academic percentage below 50% or incomplete marks",
    }


def resolve_student_semester_with_rules(
    db: Session,
    profile: StudentProfile | None,
    user: User,
    setting: CampusAttendanceSetting,
) -> int:
    if not profile:
        return 1
    base_semester = resolve_student_semester(
        profile,
        user,
        setting.semester_duration_months,
        setting.semester_duration_unit,
        setting.semester_duration_days,
    )
    stored_semester = min(4, max(1, profile.semester or 1))
    if not _has_promotion_evidence(db, user.id) and stored_semester > base_semester:
        return stored_semester

    current = 1
    for semester in range(1, base_semester):
        check = promotion_check(db, user, profile, semester)
        if check["canPromote"]:
            current = semester + 1
            continue
        break
    return min(4, max(1, current))
