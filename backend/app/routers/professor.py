from datetime import date, datetime, timedelta, timezone
from io import BytesIO
import json
from math import ceil
from pathlib import Path
import re
import zipfile
import zlib
from typing import Annotated
from xml.etree import ElementTree
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.announcement_flow import announcement_notifications_for_user, announcement_rows_for_user
from app.assignment_ai import build_assignment_blueprint, grade_from_score, normalize_grade_code
from app.attendance_flow import checkin_payload, get_campus_attendance_setting, get_today_checkin, today_local
from app.avatar import avatar_initials, student_avatar_url, user_avatar_url
from app.core.config import get_settings
from app.db import get_db
from app.dependencies import get_current_user
from app.intake_flow import local_today, resolve_student_semester
from app.models import (
    Assignment,
    AssignmentReview,
    AssignmentSubmission,
    ProfessorProfile,
    Role,
    StudentAttendance,
    StudentBiometricCheckIn,
    StudentProfile,
    StudyResource,
    User,
)
from app.schemas import (
    AssignmentGenerateCreate,
    AssignmentReviewCreate,
    AssignmentSubmissionReviewUpdate,
    ProfessorDashboard,
    ProfessorAttendanceConfirm,
    ProfessorAvatarUpdate,
    ProfessorProfileUpdate,
    StudentAcademicUpdate,
    StudentAttendanceMark,
    StudentBlockUpdate,
    StudyResourceCreate,
)
from app.resource_files import public_resource_url, resource_file_url
from app.storage import STUDY_RESOURCE_UPLOAD_DIR

router = APIRouter(prefix="/professor", tags=["professor"])
LOCAL_TIMEZONE = ZoneInfo("Asia/Kolkata")


PROFESSOR_NAV = [
    {"label": "Dashboard", "path": "/professor", "feature": "College command center"},
    {"label": "Students", "path": "/professor", "feature": "Search, block, and unblock students"},
    {"label": "CGPA & Attendance", "path": "/professor", "feature": "Academic controls"},
    {"label": "Announcements", "path": "/professor", "feature": "View admin updates"},
    {"label": "Study Resources", "path": "/professor", "feature": "Upload notes and links"},
    {"label": "Assignment Reviews", "path": "/professor", "feature": "Grade submitted work"},
    {"label": "Profile", "path": "/professor", "feature": "Verification and expertise"},
    {"label": "Connect", "path": "/professor", "feature": "Campus social network"},
]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _today() -> date:
    return datetime.now(LOCAL_TIMEZONE).date()


def _require_professor(user: User) -> None:
    if user.role != Role.faculty:
        raise HTTPException(status_code=403, detail="Professor dashboard is available to professor users only")


def _student_code(user_id: int) -> str:
    return f"CV-2026-{1000 + user_id:04d}"


def _avatar(name: str) -> str:
    return avatar_initials(name, "CV")


def _safe_filename(filename: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", Path(filename).name).strip(".-")
    return cleaned or "study-resource"


def _resource_type_from_file(filename: str, content_type: str | None) -> str:
    extension = Path(filename).suffix.lower().lstrip(".")
    if extension in {"pdf"}:
        return "PDF"
    if extension in {"doc", "docx", "rtf", "txt"}:
        return "Document"
    if extension in {"mp3", "wav", "m4a", "aac", "ogg"}:
        return "Audio"
    if extension in {"mp4", "mov", "avi", "mkv", "webm"}:
        return "Video"
    if extension in {"csv"}:
        return "CSV"
    if extension in {"xls", "xlsx"}:
        return "Excel"
    if extension in {"ppt", "pptx"}:
        return "Slides"
    if content_type:
        if content_type.startswith("audio/"):
            return "Audio"
        if content_type.startswith("video/"):
            return "Video"
        if content_type.startswith("image/"):
            return "Image"
    return extension.upper() if extension else "File"


def _delete_uploaded_resource_file(url: str | None) -> None:
    if not url or not url.startswith("/uploads/study_resources/"):
        return
    target_path = STUDY_RESOURCE_UPLOAD_DIR / Path(url).name
    try:
        if target_path.exists() and target_path.is_file():
            target_path.unlink()
    except OSError:
        pass


def _ensure_student_profile(db: Session, user: User) -> StudentProfile:
    if user.student_profile:
        if not user.student_profile.address:
            user.student_profile.address = "Campus Residence"
        if user.student_profile.enrollment_date is None:
            user.student_profile.enrollment_date = local_today()
        return user.student_profile

    seed = user.id % 7
    profile = StudentProfile(
        user_id=user.id,
        student_code=_student_code(user.id),
        address="Campus Residence",
        department="Computer Science & AI",
        semester=1,
        cgpa=round(8.1 + (seed * 0.13), 1),
        attendance=float(84 + seed),
        enrollment_date=local_today(),
    )
    db.add(profile)
    db.flush()
    db.refresh(user)
    return profile


def _attendance_counts(db: Session, student_id: int) -> tuple[int, int, int]:
    records = db.query(StudentAttendance.status).filter(StudentAttendance.student_id == student_id).all()
    present = len([record for record in records if record.status == "present"])
    absent = len([record for record in records if record.status == "absent"])
    return len(records), present, absent


def _attendance_percentage(db: Session, student_id: int, fallback: float) -> float:
    total, present, _absent = _attendance_counts(db, student_id)
    if total == 0:
        return round(fallback, 2)
    return round((present / total) * 100, 2)


def _student_rows(db: Session) -> list[dict]:
    students = db.query(User).filter(User.role == Role.student).order_by(User.full_name.asc()).all()
    setting = get_campus_attendance_setting(db)
    today = _today()
    checkins = {
        checkin.student_id: checkin
        for checkin in db.query(StudentBiometricCheckIn)
        .filter(StudentBiometricCheckIn.checkin_date == today)
        .all()
    }
    rows: list[dict] = []
    for student in students:
        profile = _ensure_student_profile(db, student)
        semester = resolve_student_semester(
            profile,
            student,
            setting.semester_duration_months,
            setting.semester_duration_unit,
            setting.semester_duration_days,
        )
        attendance = _attendance_percentage(db, student.id, profile.attendance)
        total_marked, present_count, absent_count = _attendance_counts(db, student.id)
        checkin = checkins.get(student.id)
        if total_marked:
            profile.attendance = attendance
        rows.append(
            {
                "id": student.id,
                "name": student.full_name,
                "email": student.email,
                "studentCode": profile.student_code,
                "address": profile.address,
                "department": profile.department,
                "semester": semester,
                "cgpa": profile.cgpa,
                "attendance": attendance,
                "attendanceMarked": total_marked,
                "presentCount": present_count,
                "absentCount": absent_count,
                "status": "blocked" if student.is_blocked else "safe" if attendance >= 75 else "watch",
                "isBlocked": student.is_blocked,
                "blockReason": student.block_reason or "",
                "blockedAt": student.blocked_at.isoformat() if student.blocked_at else "",
                "avatar": _avatar(student.full_name),
                "avatarUrl": student_avatar_url(profile),
                "biometricCheckIn": checkin_payload(checkin),
                "biometricVerified": bool(checkin and checkin.biometric_verified),
                "withinRadius": bool(checkin and checkin.within_radius),
                "professorConfirmed": bool(checkin and checkin.professor_confirmed),
                "attendanceWarning": bool(checkin and checkin.warning_flag),
                "biometricStatus": checkin.status if checkin else "not_checked_in",
                "biometricVerifiedAt": checkin.verified_at.isoformat() if checkin and checkin.verified_at else "",
                "radiusDistance": round(checkin.distance_meters, 1) if checkin and checkin.distance_meters is not None else None,
            }
        )
    return rows


def _attendance_summary(db: Session, student_count: int) -> list[dict]:
    end = _today()
    start = end - timedelta(days=6)
    records = (
        db.query(StudentAttendance)
        .filter(StudentAttendance.attendance_date >= start)
        .order_by(StudentAttendance.attendance_date.asc())
        .all()
    )
    by_day: dict[date, dict[str, int]] = {}
    for record in records:
        bucket = by_day.setdefault(record.attendance_date, {"present": 0, "absent": 0})
        if record.status == "present":
            bucket["present"] += 1
        elif record.status == "absent":
            bucket["absent"] += 1

    rows: list[dict] = []
    for offset in range(7):
        day = start + timedelta(days=offset)
        counts = by_day.get(day, {"present": 0, "absent": 0})
        marked = counts["present"] + counts["absent"]
        rows.append(
            {
                "date": day.isoformat(),
                "label": day.strftime("%d %b"),
                "present": counts["present"],
                "absent": counts["absent"],
                "unmarked": max(student_count - marked, 0),
                "marked": marked,
                "totalStudents": student_count,
                "presentRatio": round((counts["present"] / marked) * 100, 1) if marked else 0,
                "absentRatio": round((counts["absent"] / marked) * 100, 1) if marked else 0,
            }
        )
    return rows


def _attendance_today(summary: list[dict]) -> dict:
    today = _today().isoformat()
    row = next((item for item in summary if item["date"] == today), None)
    if row is None:
        row = {
            "date": today,
            "label": _today().strftime("%d %b"),
            "present": 0,
            "absent": 0,
            "unmarked": 0,
            "marked": 0,
            "totalStudents": 0,
            "presentRatio": 0,
            "absentRatio": 0,
        }
    return {**row, "liveAt": _now().isoformat()}


def _attendance_history(db: Session) -> list[dict]:
    records = db.query(StudentAttendance).order_by(desc(StudentAttendance.marked_at)).limit(60).all()
    rows: list[dict] = []
    for record in records:
        student = db.get(User, record.student_id)
        marker = db.get(User, record.marked_by_id) if record.marked_by_id else None
        rows.append(
            {
                "id": record.id,
                "studentId": record.student_id,
                "student": student.full_name if student else "Student",
                "studentCode": student.student_profile.student_code if student and student.student_profile else "",
                "date": record.attendance_date.isoformat(),
                "status": record.status,
                "markedBy": marker.full_name if marker else "Professor",
                "markedAt": record.marked_at.isoformat(),
                "warning": False,
            }
        )
    warnings = (
        db.query(StudentBiometricCheckIn)
        .filter(StudentBiometricCheckIn.warning_flag.is_(True))
        .order_by(desc(StudentBiometricCheckIn.verified_at), desc(StudentBiometricCheckIn.detected_at))
        .limit(30)
        .all()
    )
    for checkin in warnings:
        student = db.get(User, checkin.student_id)
        rows.append(
            {
                "id": -checkin.id,
                "studentId": checkin.student_id,
                "student": student.full_name if student else "Student",
                "studentCode": student.student_profile.student_code if student and student.student_profile else "",
                "date": checkin.checkin_date.isoformat(),
                "status": "warning",
                "markedBy": "Needs professor confirmation",
                "markedAt": (checkin.verified_at or checkin.detected_at).isoformat(),
                "warning": True,
            }
        )
    return rows


def _cgpa_years(students: list[dict]) -> list[dict]:
    buckets: dict[int, list[float]] = {}
    for student in students:
        year = max(1, ceil(student["semester"] / 2))
        buckets.setdefault(year, []).append(float(student["cgpa"]))

    return [
        {
            "year": f"Year {year}",
            "averageCgpa": round(sum(values) / len(values), 2),
            "students": len(values),
        }
        for year, values in sorted(buckets.items())
    ]


def _announcement_rows(db: Session, professor: User) -> list[dict]:
    rows = announcement_rows_for_user(db, professor, limit=12)
    return [
        {
            **item,
            "createdBy": "Campus administration",
        }
        for item in rows
    ]


def _resource_payload(db: Session, item: StudyResource) -> dict:
    professor = db.get(User, item.created_by_id) if item.created_by_id else None
    return {
        "id": item.id,
        "title": item.title,
        "subject": item.subject,
        "resourceType": item.resource_type,
        "tag": item.tag,
        "url": public_resource_url(item),
        "professorName": professor.full_name if professor else "Campus faculty",
        "createdAt": item.created_at.isoformat(),
        "createdDate": item.created_at.date().isoformat(),
        "time": item.created_at.strftime("%d %b %Y, %I:%M %p"),
    }


def _resource_rows(db: Session, professor: User | None = None, limit: int = 60) -> list[dict]:
    query = db.query(StudyResource)
    if professor:
        query = query.filter(StudyResource.created_by_id == professor.id)
    rows = query.order_by(desc(StudyResource.created_at)).limit(limit).all()
    return [_resource_payload(db, item) for item in rows]


def _json_loads(value: str | None, fallback):
    if not value:
        return fallback
    try:
        loaded = json.loads(value)
    except (TypeError, ValueError):
        return fallback
    return loaded


def _time_ago(value: datetime | None) -> str:
    if value is None:
        return "recently"
    moment = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    delta = _now() - moment
    if delta.days >= 1:
        return f"{delta.days} day ago" if delta.days == 1 else f"{delta.days} days ago"
    hours = max(0, delta.seconds // 3600)
    if hours:
        return f"{hours} hour ago" if hours == 1 else f"{hours} hours ago"
    minutes = max(1, delta.seconds // 60)
    return f"{minutes} min ago"


def _assignment_payload(item: Assignment) -> dict:
    content = _json_loads(item.content_json, {})
    rubric = _json_loads(item.rubric_json, [])
    questions = content.get("questions", []) if isinstance(content, dict) else []
    return {
        "id": item.id,
        "title": item.title,
        "subject": item.subject,
        "assignmentType": item.assignment_type,
        "sourceKind": item.source_kind,
        "sourceTitle": item.source_title,
        "instructions": content.get("instructions", "") if isinstance(content, dict) else "",
        "questions": questions if isinstance(questions, list) else [],
        "rubric": rubric if isinstance(rubric, list) else [],
        "allowedFileTypes": content.get("allowedFileTypes", []) if isinstance(content, dict) else [],
        "questionCount": item.question_count,
        "totalPoints": item.total_points,
        "due": item.due_label,
        "status": item.status,
        "createdAt": item.created_at.isoformat(),
        "updatedAt": item.updated_at.isoformat(),
    }


def _assignment_rows(db: Session, professor: User | None = None, limit: int = 20) -> list[dict]:
    query = db.query(Assignment)
    if professor:
        query = query.filter(Assignment.created_by_id == professor.id)
    return [_assignment_payload(item) for item in query.order_by(desc(Assignment.created_at)).limit(limit).all()]


def _submission_payload(db: Session, item: AssignmentSubmission) -> dict:
    assignment = db.get(Assignment, item.assignment_id)
    student = db.get(User, item.student_id)
    ai_review = _json_loads(item.ai_review_json, {})
    answers = _json_loads(item.answers_json, {})
    total_points = assignment.total_points if assignment else 100
    ai_grade = (
        grade_from_score((item.ai_score / max(1, total_points)) * 100)
        if item.ai_score is not None
        else item.ai_grade
    )
    stored_professor_grade = normalize_grade_code(item.professor_grade)
    professor_grade = (
        stored_professor_grade
        if stored_professor_grade
        else grade_from_score((item.professor_score / max(1, total_points)) * 100)
        if item.professor_score is not None
        else None
    )
    final_grade = professor_grade or ai_grade or "Pending"
    final_feedback = item.professor_feedback or item.ai_feedback or ""
    priority = "high" if item.ai_score is not None and item.ai_score < 75 else "normal"
    return {
        "id": item.id,
        "submissionId": item.id,
        "assignmentId": item.assignment_id,
        "studentId": item.student_id,
        "student": student.full_name if student else "Student",
        "title": assignment.title if assignment else "Assignment submission",
        "subject": assignment.subject if assignment else item.submission_type,
        "assignmentType": assignment.assignment_type if assignment else item.submission_type,
        "submitted": _time_ago(item.submitted_at),
        "submittedAt": item.submitted_at.isoformat(),
        "priority": priority,
        "status": item.status,
        "aiGrade": ai_grade or "Pending",
        "aiScore": item.ai_score,
        "aiFeedback": item.ai_feedback or "",
        "aiReview": ai_review,
        "professorScore": item.professor_score,
        "professorGrade": professor_grade or "",
        "professorFeedback": item.professor_feedback or "",
        "grade": final_grade,
        "feedback": final_feedback,
        "fileName": item.filename or "",
        "fileSize": item.file_size or 0,
        "fileUrl": f"/api/professor/assignments/submissions/{item.id}/file" if item.filename else "",
        "answerCount": len(answers) if isinstance(answers, dict) else 0,
        "answers": answers if isinstance(answers, dict) else {},
    }


def _submission_rows(db: Session, limit: int = 40) -> list[dict]:
    rows = db.query(AssignmentSubmission).order_by(desc(AssignmentSubmission.updated_at)).limit(limit).all()
    return [_submission_payload(db, item) for item in rows]


def _review_rows(db: Session) -> list[dict]:
    submission_rows = _submission_rows(db, limit=10)
    rows = db.query(AssignmentReview).order_by(desc(AssignmentReview.updated_at)).limit(10).all()
    legacy_rows = [
        {
            "id": item.id,
            "studentId": item.student_id,
            "title": item.assignment_title,
            "subject": item.subject,
            "status": item.status,
            "grade": item.grade or "Pending",
            "feedback": item.feedback or "",
            "updated": item.updated_at.strftime("%d %b %Y"),
        }
        for item in rows
    ]
    return [*submission_rows, *legacy_rows][:10]


def _review_queue(db: Session, students: list[dict]) -> list[dict]:
    return _submission_rows(db, limit=30)


def _compact_source_text(value: str, limit: int = 12000) -> str:
    cleaned = re.sub(r"\s+", " ", value or "").strip()
    return cleaned[:limit]


def _raw_text_from_bytes(data: bytes, limit: int = 6000) -> str:
    decoded = ""
    for encoding in ("utf-8", "utf-16", "latin-1"):
        try:
            decoded = data.decode(encoding, errors="ignore")
        except (LookupError, UnicodeDecodeError):
            continue
        if decoded.strip():
            break
    decoded = re.sub(r"[^\x09\x0A\x0D\x20-\x7E]+", " ", decoded)
    chunks = re.findall(r"[A-Za-z0-9][A-Za-z0-9\s.,;:()/%+\-]{18,}", decoded)
    return _compact_source_text(" ".join(chunks) or decoded, limit)


PDF_ARTIFACT_PATTERNS = (
    "/ObjStm",
    "/FlateDecode",
    "/Subtype",
    "/Filter",
    "/Length",
    "endobj",
    "endstream",
    "xref",
    "startxref",
)


def _looks_like_extraction_artifact(value: str) -> bool:
    if not value:
        return True
    artifact_hits = sum(value.count(pattern) for pattern in PDF_ARTIFACT_PATTERNS)
    words = re.findall(r"[A-Za-z]{3,}", value)
    readable_words = [
        word
        for word in words
        if not re.fullmatch(r"[A-Fa-f0-9]{6,}", word)
        and not word.startswith("Obj")
        and word.lower() not in {"stream", "endstream", "obj", "endobj", "filter", "length"}
    ]
    if artifact_hits >= 2:
        return True
    return len(readable_words) < 35


def _docx_text_from_bytes(data: bytes, limit: int = 9000) -> str:
    try:
        with zipfile.ZipFile(BytesIO(data)) as archive:
            xml_bytes = archive.read("word/document.xml")
    except (KeyError, zipfile.BadZipFile):
        return ""
    try:
        root = ElementTree.fromstring(xml_bytes)
    except ElementTree.ParseError:
        return ""
    parts = [
        node.text or ""
        for node in root.iter()
        if node.tag.endswith("}t") or node.tag == "t"
    ]
    return _compact_source_text(" ".join(parts), limit)


def _pdf_text_from_bytes(data: bytes, limit: int = 9000) -> str:
    try:
        from pypdf import PdfReader  # type: ignore
    except Exception:
        pypdf_text = ""
    else:
        try:
            reader = PdfReader(BytesIO(data))
            pages = [(page.extract_text() or "") for page in reader.pages[:12]]
            pypdf_text = _compact_source_text(" ".join(pages), limit)
        except Exception:
            pypdf_text = ""
        if pypdf_text and not _looks_like_extraction_artifact(pypdf_text):
            return pypdf_text

    stream_text = _pdf_stream_text_from_bytes(data, limit)
    return stream_text if stream_text and not _looks_like_extraction_artifact(stream_text) else ""


def _decode_pdf_literal(raw: bytes) -> str:
    try:
        value = raw[1:-1].decode("latin-1", errors="ignore")
    except Exception:
        return ""
    value = re.sub(r"\\([nrtbf()\\])", lambda match: {"n": "\n", "r": "\r", "t": "\t", "b": "", "f": "", "(": "(", ")": ")", "\\": "\\"}.get(match.group(1), match.group(1)), value)
    value = re.sub(r"\\[0-7]{1,3}", " ", value)
    return value


def _decode_pdf_hex(raw: bytes) -> str:
    cleaned = re.sub(rb"\s+", b"", raw)
    if len(cleaned) % 2:
        cleaned += b"0"
    try:
        data = bytes.fromhex(cleaned.decode("ascii"))
    except Exception:
        return ""
    for encoding in ("utf-16-be", "utf-8", "latin-1"):
        try:
            text = data.decode(encoding, errors="ignore")
        except Exception:
            continue
        if re.search(r"[A-Za-z]{3,}", text):
            return text
    return ""


def _pdf_stream_text_from_bytes(data: bytes, limit: int = 9000) -> str:
    chunks: list[str] = []
    for match in re.finditer(rb"<<(?P<dict>.*?)>>\s*stream\r?\n(?P<body>.*?)\r?\nendstream", data, re.DOTALL):
        dictionary = match.group("dict")
        body = match.group("body").strip(b"\r\n")
        if b"/FlateDecode" in dictionary:
            try:
                body = zlib.decompress(body)
            except Exception:
                continue
        elif b"/Filter" in dictionary:
            continue

        for literal in re.findall(rb"\((?:\\.|[^\\()])*\)", body):
            text = _decode_pdf_literal(literal)
            if text:
                chunks.append(text)
        for hex_string in re.findall(rb"(?<!<)<([0-9A-Fa-f\s]{6,})>(?!>)", body):
            text = _decode_pdf_hex(hex_string)
            if text:
                chunks.append(text)
        if len(" ".join(chunks)) >= limit:
            break
    return _compact_source_text(" ".join(chunks), limit)


def _resource_source_text(item: StudyResource, limit: int = 10000) -> str:
    metadata = (
        f"Resource title: {item.title}. Subject: {item.subject}. "
        f"Type: {item.resource_type}. Tag: {item.tag}. "
    )
    if not item.file_data:
        return metadata

    filename = (item.filename or item.title or "").lower()
    content_type = (item.content_type or "").lower()
    extracted = ""
    is_pdf = filename.endswith(".pdf") or "pdf" in content_type
    is_docx = filename.endswith(".docx") or "wordprocessingml" in content_type
    is_text = filename.endswith(".txt") or "text/" in content_type
    is_legacy_doc = filename.endswith(".doc") and not is_docx

    if is_docx:
        extracted = _docx_text_from_bytes(item.file_data, limit)
    elif is_pdf:
        extracted = _pdf_text_from_bytes(item.file_data, limit)
    if not extracted and is_text:
        extracted = _raw_text_from_bytes(item.file_data, limit)

    if extracted and _looks_like_extraction_artifact(extracted):
        extracted = ""

    if not extracted and not (is_pdf or is_docx or is_legacy_doc):
        extracted = _raw_text_from_bytes(item.file_data, limit)
        if _looks_like_extraction_artifact(extracted):
            extracted = ""

    if not extracted:
        return _compact_source_text(metadata, limit)
    return _compact_source_text(f"{metadata} Study content: {extracted}", limit)


def _write_attendance_record(
    db: Session,
    student: User,
    professor: User,
    attendance_status: str,
) -> tuple[StudentAttendance, float]:
    profile = _ensure_student_profile(db, student)
    today = _today()
    record = (
        db.query(StudentAttendance)
        .filter(StudentAttendance.student_id == student.id, StudentAttendance.attendance_date == today)
        .first()
    )
    if record:
        record.status = attendance_status
        record.marked_by_id = professor.id
        record.marked_at = _now()
    else:
        record = StudentAttendance(
            student_id=student.id,
            marked_by_id=professor.id,
            attendance_date=today,
            status=attendance_status,
            marked_at=_now(),
        )
        db.add(record)

    db.flush()
    profile.attendance = _attendance_percentage(db, student.id, profile.attendance)
    return record, profile.attendance


@router.get("/dashboard", response_model=ProfessorDashboard)
def dashboard(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ProfessorDashboard:
    _require_professor(current_user)
    profile = current_user.professor_profile
    students = _student_rows(db)
    db.commit()

    avg_cgpa = round(sum(student["cgpa"] for student in students) / len(students), 2) if students else 0
    avg_attendance = round(sum(student["attendance"] for student in students) / len(students), 1) if students else 0
    summary = _attendance_summary(db, len(students))
    today = _attendance_today(summary)
    today_checkins = (
        db.query(StudentBiometricCheckIn)
        .filter(StudentBiometricCheckIn.checkin_date == _today())
        .all()
    )
    today["biometricVerified"] = len([item for item in today_checkins if item.biometric_verified])
    today["pendingConfirmation"] = len(
        [item for item in today_checkins if item.biometric_verified and not item.professor_confirmed]
    )
    today["warnings"] = len([item for item in today_checkins if item.warning_flag])
    queue = _review_queue(db, students)

    return ProfessorDashboard(
        professor={
            "name": current_user.full_name,
            "email": current_user.email,
            "department": profile.department if profile else "Computer Science & AI",
            "designation": profile.designation if profile else "Professor",
            "expertiseField": profile.expertise_field if profile else "Academic Operations",
            "highestEducation": profile.highest_education if profile else "Verified Faculty",
            "licenseDocumentName": profile.license_document_name if profile else "Not submitted",
            "verificationStatus": profile.verification_status if profile else "pending",
            "avatar": _avatar(current_user.full_name),
            "avatarUrl": user_avatar_url(current_user),
        },
        metrics=[
            {"label": "Students", "value": str(len(students)), "hint": "Assigned student records", "tone": "cyan"},
            {"label": "Average CGPA", "value": f"{avg_cgpa:.2f}", "hint": "Live from student profiles", "tone": "green"},
            {"label": "Attendance Avg", "value": f"{avg_attendance:.0f}%", "hint": "Across assigned students", "tone": "pink"},
            {
                "label": "Today P/A",
                "value": f"{today['present']}/{today['absent']}",
                "hint": f"{today['unmarked']} unmarked students",
                "tone": "amber",
            },
        ],
        students=students,
        attendance_today=today,
        attendance_summary=summary,
        attendance_history=_attendance_history(db),
        cgpa_years=_cgpa_years(students),
        announcements=_announcement_rows(db, current_user),
        notifications=announcement_notifications_for_user(db, current_user, limit=20),
        resources=_resource_rows(db, current_user),
        assignments=_assignment_rows(db, current_user),
        assignment_submissions=_submission_rows(db, limit=120),
        assignment_reviews=_review_rows(db),
        review_queue=queue,
        academic_controls=[
            {"label": "CGPA", "detail": "Semester performance criteria"},
            {"label": "Attendance", "detail": "Daily present and absent records"},
            {"label": "Assignments", "detail": "Review submissions and add feedback"},
            {"label": "Resources", "detail": "Publish lecture packs and links"},
        ],
        nav_modules=PROFESSOR_NAV,
    )


@router.post("/students/{student_id}/academics")
def update_student_academics(
    student_id: int,
    payload: StudentAcademicUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_professor(current_user)
    student = db.get(User, student_id)
    if not student or student.role != Role.student:
        raise HTTPException(status_code=404, detail="Student not found")

    profile = _ensure_student_profile(db, student)
    profile.cgpa = round(payload.cgpa, 2)
    profile.attendance = round(payload.attendance, 2)
    db.commit()
    return {"ok": True, "student_id": student.id, "cgpa": profile.cgpa, "attendance": profile.attendance}


@router.post("/students/{student_id}/block")
def update_student_block(
    student_id: int,
    payload: StudentBlockUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_professor(current_user)
    student = db.get(User, student_id)
    if not student or student.role != Role.student:
        raise HTTPException(status_code=404, detail="Student not found")

    student.is_blocked = payload.blocked
    if payload.blocked:
        student.block_reason = (payload.reason or "Blocked by professor").strip()
        student.blocked_at = _now()
        student.blocked_by_id = current_user.id
    else:
        student.block_reason = None
        student.blocked_at = None
        student.blocked_by_id = None

    db.commit()
    return {
        "ok": True,
        "student_id": student.id,
        "is_blocked": student.is_blocked,
        "message": "Student blocked" if student.is_blocked else "Student unblocked",
    }


@router.post("/attendance/mark")
def mark_attendance(
    payload: StudentAttendanceMark,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_professor(current_user)
    student = db.get(User, payload.student_id)
    if not student or student.role != Role.student:
        raise HTTPException(status_code=404, detail="Student not found")

    today = _today()
    _record, attendance = _write_attendance_record(db, student, current_user, payload.status)
    checkin = get_today_checkin(db, student.id)
    if checkin:
        checkin.warning_flag = False
        checkin.confirmed_by_id = current_user.id
        checkin.confirmed_at = _now()
        checkin.professor_confirmed = payload.status == "present"
        checkin.status = "present_confirmed" if payload.status == "present" else "absent_marked"
    db.commit()
    return {
        "ok": True,
        "student_id": student.id,
        "status": payload.status,
        "attendance": attendance,
        "date": today.isoformat(),
    }


@router.post("/attendance/confirm")
def confirm_biometric_attendance(
    payload: ProfessorAttendanceConfirm,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_professor(current_user)
    student = db.get(User, payload.student_id)
    if not student or student.role != Role.student:
        raise HTTPException(status_code=404, detail="Student not found")

    checkin = get_today_checkin(db, student.id)
    if payload.present and (not checkin or not checkin.biometric_verified):
        raise HTTPException(
            status_code=409,
            detail="Student must complete radius and biometric verification before professor confirmation",
        )

    attendance_status = "present" if payload.present else "absent"
    _record, attendance = _write_attendance_record(db, student, current_user, attendance_status)

    if checkin:
        checkin.professor_confirmed = payload.present
        checkin.warning_flag = False
        checkin.confirmed_by_id = current_user.id
        checkin.confirmed_at = _now()
        checkin.status = "present_confirmed" if payload.present else "absent_marked"

    db.commit()
    return {
        "ok": True,
        "student_id": student.id,
        "status": attendance_status,
        "attendance": attendance,
        "date": _today().isoformat(),
        "checkIn": checkin_payload(checkin),
    }


@router.post("/attendance/finalize")
def finalize_biometric_attendance(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_professor(current_user)
    today = today_local()
    students = db.query(User).filter(User.role == Role.student).all()
    existing_records = {
        record.student_id
        for record in db.query(StudentAttendance)
        .filter(StudentAttendance.attendance_date == today)
        .all()
    }
    checkins = {
        checkin.student_id: checkin
        for checkin in db.query(StudentBiometricCheckIn)
        .filter(StudentBiometricCheckIn.checkin_date == today)
        .all()
    }

    marked_absent = 0
    warnings = 0
    for student in students:
        checkin = checkins.get(student.id)
        if student.id in existing_records:
            if checkin:
                checkin.warning_flag = False
            continue

        if checkin and checkin.biometric_verified and not checkin.professor_confirmed:
            checkin.warning_flag = True
            checkin.status = "awaiting_professor_confirmation"
            warnings += 1
            continue

        _write_attendance_record(db, student, current_user, "absent")
        marked_absent += 1
        if checkin:
            checkin.warning_flag = False
            checkin.status = "absent_auto"
        else:
            db.add(
                StudentBiometricCheckIn(
                    student_id=student.id,
                    checkin_date=today,
                    status="absent_auto",
                    within_radius=False,
                    biometric_verified=False,
                    professor_confirmed=False,
                    detected_at=_now(),
                )
            )

    db.commit()
    return {
        "ok": True,
        "date": today.isoformat(),
        "markedAbsent": marked_absent,
        "warnings": warnings,
        "message": f"{marked_absent} absent records finalized, {warnings} verified students still need confirmation",
    }


@router.post("/resources")
def create_resource(
    payload: StudyResourceCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_professor(current_user)
    item = StudyResource(
        created_by_id=current_user.id,
        title=payload.title.strip(),
        subject=payload.subject.strip(),
        resource_type=payload.resource_type.strip(),
        url=payload.url.strip() if payload.url else None,
        tag=payload.tag.strip() or "new",
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"ok": True, "id": item.id}


@router.post("/resources/upload")
def upload_resource(
    subject: Annotated[str, Form(...)],
    file: Annotated[UploadFile, File(...)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_professor(current_user)
    if not file.filename:
        raise HTTPException(status_code=400, detail="Please choose a resource file to upload")

    subject_name = subject.strip()
    if len(subject_name) < 2:
        raise HTTPException(status_code=422, detail="Subject name is required")

    original_name = Path(file.filename).name
    safe_name = _safe_filename(original_name)
    file_bytes = file.file.read()

    title = Path(original_name).stem.strip() or safe_name
    item = StudyResource(
        created_by_id=current_user.id,
        title=title[:180],
        subject=subject_name[:120],
        resource_type=_resource_type_from_file(original_name, file.content_type),
        url=None,
        filename=original_name[:255],
        content_type=(file.content_type or "application/octet-stream")[:120],
        file_size=len(file_bytes),
        file_data=file_bytes,
        tag="new",
    )
    db.add(item)
    db.flush()
    item.url = resource_file_url(item.id)
    db.commit()
    db.refresh(item)
    return {"ok": True, "id": item.id, "resource": _resource_payload(db, item)}


@router.delete("/resources/{resource_id}")
def delete_resource(
    resource_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_professor(current_user)
    item = db.get(StudyResource, resource_id)
    if not item:
        raise HTTPException(status_code=404, detail="Study resource not found")
    if item.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can delete only your own study resources")

    file_url = item.url
    db.delete(item)
    db.commit()
    _delete_uploaded_resource_file(file_url)
    return {"ok": True, "id": resource_id}


def _assignment_source_from_payload(
    db: Session,
    payload: AssignmentGenerateCreate,
    professor: User,
) -> tuple[str, str]:
    if payload.source_kind == "resources":
        query = db.query(StudyResource).filter(StudyResource.created_by_id == professor.id)
        if payload.resource_ids:
            query = query.filter(StudyResource.id.in_(payload.resource_ids))
        resources = query.order_by(desc(StudyResource.created_at)).limit(12).all()
        if resources:
            titles = [item.title for item in resources]
            source_text = "\n\n".join(
                [
                    f"RESOURCE {index + 1}: {_resource_source_text(item)}"
                    for index, item in enumerate(resources)
                ]
            )
            return ", ".join(titles[:3]), _compact_source_text(source_text, 12000)
        return "Professor resource bank", payload.subject

    if payload.source_kind == "syllabus":
        return "Selected syllabus", _compact_source_text(payload.syllabus or payload.subject, 12000)

    return "Custom professor content", _compact_source_text(payload.custom_content or payload.subject, 12000)


@router.post("/assignments/generate")
def generate_assignment(
    payload: AssignmentGenerateCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_professor(current_user)
    source_title, source_text = _assignment_source_from_payload(db, payload, current_user)
    clean_subject = payload.subject.strip()
    title = payload.title or f"{clean_subject} {payload.assignment_type.upper()} Assignment"
    settings = get_settings()
    openai_api_key = settings.openai_api_key.get_secret_value() if settings.openai_api_key else None
    content, rubric = build_assignment_blueprint(
        assignment_type=payload.assignment_type,
        subject=clean_subject,
        title=title,
        source_title=source_title,
        source_text=source_text,
        question_count=payload.question_count,
        total_points=payload.total_points,
        api_key=openai_api_key,
        model=settings.openai_model,
    )
    item = Assignment(
        created_by_id=current_user.id,
        title=title.strip()[:180],
        subject=clean_subject[:120],
        assignment_type=payload.assignment_type,
        source_kind=payload.source_kind,
        source_title=source_title[:255],
        source_text=source_text[:12000],
        total_points=payload.total_points,
        question_count=payload.question_count,
        due_label=payload.due_label.strip()[:80],
        content_json=json.dumps(content),
        rubric_json=json.dumps(rubric),
        status="published",
        updated_at=_now(),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    generation_mode = content.get("generationMode") if isinstance(content, dict) else None
    source_warning = content.get("sourceWarning") if isinstance(content, dict) else None
    message = (
        "OpenAI assignment generated from the selected material and published to students"
        if generation_mode == "openai"
        else "Assignment generated from the selected material with the local fallback and published to students"
    )
    if source_warning:
        message = f"{message}. {source_warning}"
    return {"ok": True, "assignment": _assignment_payload(item), "message": message}


@router.get("/assignments/submissions/{submission_id}/file")
def open_assignment_submission_file(
    submission_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    download: bool = Query(False),
) -> Response:
    _require_professor(current_user)
    item = db.get(AssignmentSubmission, submission_id)
    if not item or not item.file_data or not item.filename:
        raise HTTPException(status_code=404, detail="Submission file not found")
    disposition = "attachment" if download else "inline"
    filename = Path(item.filename).name.replace('"', "")
    return Response(
        content=item.file_data,
        media_type=item.content_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'{disposition}; filename="{filename}"',
            "Content-Length": str(len(item.file_data)),
        },
    )


@router.patch("/assignments/submissions/{submission_id}/review")
def update_assignment_submission_review(
    submission_id: int,
    payload: AssignmentSubmissionReviewUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_professor(current_user)
    item = db.get(AssignmentSubmission, submission_id)
    if not item:
        raise HTTPException(status_code=404, detail="Assignment submission not found")

    assignment = db.get(Assignment, item.assignment_id)
    total_points = assignment.total_points if assignment else 100
    professor_score = None
    professor_grade = normalize_grade_code(payload.grade)
    if payload.score is not None:
        professor_score = max(0.0, min(float(total_points), float(payload.score)))
        professor_grade = professor_grade or grade_from_score((professor_score / max(1, total_points)) * 100)

    item.professor_score = professor_score
    item.professor_grade = professor_grade
    item.professor_feedback = payload.feedback
    item.reviewed_by_id = current_user.id
    item.reviewed_at = _now()
    item.status = "professor_reviewed"
    item.updated_at = _now()

    review = AssignmentReview(
        student_id=item.student_id,
        reviewed_by_id=current_user.id,
        assignment_title=assignment.title if assignment else "Assignment submission",
        subject=assignment.subject if assignment else item.submission_type,
        grade=professor_grade,
        feedback=payload.feedback,
        status="reviewed",
        updated_at=_now(),
    )
    db.add(review)
    db.commit()
    db.refresh(item)
    return {"ok": True, "submission": _submission_payload(db, item)}


@router.post("/assignments/review")
def review_assignment(
    payload: AssignmentReviewCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_professor(current_user)
    student = db.get(User, payload.student_id)
    if not student or student.role != Role.student:
        raise HTTPException(status_code=404, detail="Student not found")

    review = AssignmentReview(
        student_id=student.id,
        reviewed_by_id=current_user.id,
        assignment_title=payload.assignment_title.strip(),
        subject=payload.subject.strip(),
        grade=payload.grade.strip() if payload.grade else None,
        feedback=payload.feedback.strip() if payload.feedback else None,
        status="reviewed",
        updated_at=_now(),
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return {"ok": True, "id": review.id}


@router.put("/profile")
def update_professor_profile(
    payload: ProfessorProfileUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_professor(current_user)
    if payload.name:
        current_user.full_name = payload.name.strip()
    if payload.email:
        current_user.email = payload.email.strip().lower()

    profile = current_user.professor_profile
    if not profile:
        profile = ProfessorProfile(user_id=current_user.id)
        db.add(profile)

    if payload.designation:
        profile.designation = payload.designation.strip()
    if payload.department:
        profile.department = payload.department.strip()
    if payload.expertiseField:
        profile.expertise_field = payload.expertiseField.strip()
    if payload.highestEducation:
        profile.highest_education = payload.highestEducation.strip()
    if payload.licenseDocumentName:
        profile.license_document_name = payload.licenseDocumentName.strip()
    if "avatarUrl" in payload.model_fields_set or payload.avatarUrl is not None:
        profile.avatar_url = payload.avatarUrl.strip() if (payload.avatarUrl and payload.avatarUrl.strip()) else None

    db.commit()
    db.refresh(current_user)
    return {
        "ok": True,
        "professor": {
            "name": current_user.full_name,
            "email": current_user.email,
            "department": profile.department if profile else "Computer Science & AI",
            "designation": profile.designation if profile else "Professor",
            "expertiseField": profile.expertise_field if profile else "Academic Operations",
            "highestEducation": profile.highest_education if profile else "Verified Faculty",
            "licenseDocumentName": profile.license_document_name if profile else "Not submitted",
            "verificationStatus": profile.verification_status if profile else "pending",
            "avatar": _avatar(current_user.full_name),
            "avatarUrl": user_avatar_url(current_user),
        },
    }


@router.put("/profile/avatar")
def update_professor_avatar(
    payload: ProfessorAvatarUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_professor(current_user)
    profile = current_user.professor_profile
    if not profile:
        profile = ProfessorProfile(user_id=current_user.id)
        db.add(profile)
    profile.avatar_url = payload.avatar_url.strip() if (payload.avatar_url and payload.avatar_url.strip()) else None
    db.commit()
    db.refresh(profile)
    return {
        "ok": True,
        "avatarUrl": user_avatar_url(current_user),
    }
