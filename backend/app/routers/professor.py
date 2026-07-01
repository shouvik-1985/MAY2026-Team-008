from datetime import date, datetime, timedelta, timezone
from math import ceil
from pathlib import Path
import re
import shutil
from typing import Annotated
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_user
from app.models import (
    Announcement,
    AssignmentReview,
    Role,
    StudentAttendance,
    StudentProfile,
    StudyResource,
    User,
)
from app.schemas import (
    AnnouncementCreate,
    AssignmentReviewCreate,
    ProfessorDashboard,
    StudentAcademicUpdate,
    StudentAttendanceMark,
    StudentBlockUpdate,
    StudyResourceCreate,
)
from app.storage import STUDY_RESOURCE_UPLOAD_DIR, ensure_upload_dirs

router = APIRouter(prefix="/professor", tags=["professor"])
LOCAL_TIMEZONE = ZoneInfo("Asia/Kolkata")


PROFESSOR_NAV = [
    {"label": "Dashboard", "path": "/professor", "feature": "College command center"},
    {"label": "Students", "path": "/professor", "feature": "Search, block, and unblock students"},
    {"label": "CGPA & Attendance", "path": "/professor", "feature": "Academic controls"},
    {"label": "Announcements", "path": "/professor", "feature": "Publish student updates"},
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
    return "".join(part[0] for part in name.split()[:2]).upper() or "CV"


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
        return user.student_profile

    seed = user.id % 7
    profile = StudentProfile(
        user_id=user.id,
        student_code=_student_code(user.id),
        address="Campus Residence",
        department="Computer Science & AI",
        semester=1 + (user.id % 8),
        cgpa=round(8.1 + (seed * 0.13), 1),
        attendance=float(84 + seed),
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
    rows: list[dict] = []
    for student in students:
        profile = _ensure_student_profile(db, student)
        attendance = _attendance_percentage(db, student.id, profile.attendance)
        total_marked, present_count, absent_count = _attendance_counts(db, student.id)
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
                "semester": profile.semester,
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


def _fallback_announcements(professor: User) -> list[dict]:
    first_name = professor.full_name.split()[0] if professor.full_name else "Professor"
    return [
        {
            "id": 0,
            "title": "Mid-Sem academic checkpoint",
            "category": "Academic",
            "audience": "All students",
            "body": f"{first_name} can publish semester notices from this panel.",
            "pinned": True,
            "createdBy": professor.full_name,
            "time": "Draft",
        }
    ]


def _announcement_rows(db: Session, professor: User) -> list[dict]:
    rows = db.query(Announcement).order_by(desc(Announcement.created_at)).limit(8).all()
    if not rows:
        return _fallback_announcements(professor)

    return [
        {
            "id": item.id,
            "title": item.title,
            "category": item.category,
            "audience": item.audience,
            "body": item.body,
            "pinned": item.pinned,
            "createdBy": professor.full_name if item.created_by_id == professor.id else "Campus faculty",
            "time": item.created_at.strftime("%d %b %Y"),
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
        "url": item.url or "",
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


def _review_rows(db: Session) -> list[dict]:
    rows = db.query(AssignmentReview).order_by(desc(AssignmentReview.updated_at)).limit(10).all()
    return [
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


def _review_queue(students: list[dict]) -> list[dict]:
    subjects = ["Research Methods", "Distributed Systems", "AI Studio", "Data Structures"]
    return [
        {
            "id": idx + 1,
            "studentId": student["id"],
            "student": student["name"],
            "title": f"{student['name'].split()[0]}'s {subjects[idx % len(subjects)]} submission",
            "subject": subjects[idx % len(subjects)],
            "submitted": f"{idx + 1} day ago" if idx == 0 else f"{idx + 1} days ago",
            "priority": "high" if student["attendance"] < 80 else "normal",
        }
        for idx, student in enumerate(students[:6])
    ]


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
    queue = _review_queue(students)

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
        resources=_resource_rows(db, current_user),
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

    profile = _ensure_student_profile(db, student)
    today = _today()
    record = (
        db.query(StudentAttendance)
        .filter(StudentAttendance.student_id == student.id, StudentAttendance.attendance_date == today)
        .first()
    )
    if record:
        record.status = payload.status
        record.marked_by_id = current_user.id
        record.marked_at = _now()
    else:
        record = StudentAttendance(
            student_id=student.id,
            marked_by_id=current_user.id,
            attendance_date=today,
            status=payload.status,
            marked_at=_now(),
        )
        db.add(record)

    db.flush()
    profile.attendance = _attendance_percentage(db, student.id, profile.attendance)
    db.commit()
    return {
        "ok": True,
        "student_id": student.id,
        "status": payload.status,
        "attendance": profile.attendance,
        "date": today.isoformat(),
    }


@router.post("/announcements")
def create_announcement(
    payload: AnnouncementCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_professor(current_user)
    item = Announcement(
        created_by_id=current_user.id,
        title=payload.title.strip(),
        category=payload.category.strip(),
        audience=payload.audience.strip(),
        body=payload.body.strip(),
        pinned=payload.pinned,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"ok": True, "id": item.id}


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

    ensure_upload_dirs()
    original_name = Path(file.filename).name
    safe_name = _safe_filename(original_name)
    stored_name = f"{_now().strftime('%Y%m%d%H%M%S')}_{uuid4().hex[:10]}_{safe_name}"
    target_path = STUDY_RESOURCE_UPLOAD_DIR / stored_name
    with target_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    title = Path(original_name).stem.strip() or safe_name
    item = StudyResource(
        created_by_id=current_user.id,
        title=title[:180],
        subject=subject_name[:120],
        resource_type=_resource_type_from_file(original_name, file.content_type),
        url=f"/uploads/study_resources/{stored_name}",
        tag="new",
    )
    db.add(item)
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
