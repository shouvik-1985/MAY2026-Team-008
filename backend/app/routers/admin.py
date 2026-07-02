from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_user
from app.models import (
    Announcement,
    AssignmentReview,
    ConnectAttachment,
    ConnectMessage,
    ConnectMessageHidden,
    ConnectRelationship,
    ProfessorProfile,
    RevokedToken,
    Role,
    StudentAttendance,
    StudentProfile,
    StudentTodo,
    StudyResource,
    User,
)
from app.schemas import AdminDashboard

router = APIRouter(prefix="/admin", tags=["admin"])


ADMIN_NAV = [
    {"label": "Dashboard", "path": "/admin", "feature": "Campus ratio and attendance analytics"},
    {"label": "Students", "path": "/admin", "feature": "Search, review, block, unblock, and delete students"},
    {"label": "Professors", "path": "/admin", "feature": "Search, review, block, unblock, and delete professors"},
]


def _require_admin(user: User) -> None:
    if user.role != Role.admin:
        raise HTTPException(status_code=403, detail="Admin dashboard is available to admin users only")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _avatar(name: str) -> str:
    return "".join(part[0] for part in name.split()[:2]).upper() or "AD"


def _student_code(user_id: int) -> str:
    return f"CV-2026-{1000 + user_id:04d}"


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
    return profile


def _attendance_breakdown(db: Session, student_id: int) -> tuple[int, int, int]:
    records = db.query(StudentAttendance.status).filter(StudentAttendance.student_id == student_id).all()
    present = sum(1 for (status,) in records if status == "present")
    absent = sum(1 for (status,) in records if status == "absent")
    return len(records), present, absent


def _attendance_percentage(db: Session, student_id: int, fallback: float) -> float:
    total, present, _absent = _attendance_breakdown(db, student_id)
    if total == 0:
        return round(fallback, 2)
    return round((present / total) * 100, 2)


def _student_rows(db: Session) -> list[dict]:
    students = db.query(User).filter(User.role == Role.student).order_by(User.full_name.asc()).all()
    rows: list[dict] = []
    for student in students:
        profile = _ensure_student_profile(db, student)
        total_marked, present_count, absent_count = _attendance_breakdown(db, student.id)
        attendance = _attendance_percentage(db, student.id, profile.attendance)
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
                "createdAt": student.created_at.isoformat(),
            }
        )
    return rows


def _professor_rows(db: Session) -> list[dict]:
    professors = db.query(User).filter(User.role == Role.faculty).order_by(User.full_name.asc()).all()
    student_count = db.query(User).filter(User.role == Role.student).count()
    rows: list[dict] = []
    for professor in professors:
        profile = professor.professor_profile
        rows.append(
            {
                "id": professor.id,
                "name": professor.full_name,
                "email": professor.email,
                "address": profile.address if profile else "Campus Faculty Residence",
                "department": profile.department if profile else "Computer Science & AI",
                "designation": profile.designation if profile else "Professor",
                "expertiseField": profile.expertise_field if profile else "Academic Operations",
                "highestEducation": profile.highest_education if profile else "Verified Faculty",
                "licenseDocumentName": profile.license_document_name if profile else "Not submitted",
                "verificationStatus": profile.verification_status if profile else "pending",
                "status": "blocked" if professor.is_blocked else "active",
                "isBlocked": professor.is_blocked,
                "blockReason": professor.block_reason or "",
                "blockedAt": professor.blocked_at.isoformat() if professor.blocked_at else "",
                "avatar": _avatar(professor.full_name),
                "createdAt": professor.created_at.isoformat(),
                "studentsManaged": student_count,
            }
        )
    return rows


def _ratio_overview(student_count: int, professor_count: int) -> list[dict]:
    admin_count = 1
    total = max(student_count + professor_count + admin_count, 1)
    return [
        {
            "label": "Students",
            "count": student_count,
            "share": round((student_count / total) * 100, 1),
            "accent": "oklch(0.82 0.18 200)",
        },
        {
            "label": "Professors",
            "count": professor_count,
            "share": round((professor_count / total) * 100, 1),
            "accent": "oklch(0.72 0.27 350)",
        },
    ]


def _attendance_overview(students: list[dict]) -> list[dict]:
    today = datetime.now(timezone.utc).date()
    rows: list[dict] = []
    for offset in range(5, -1, -1):
        day = today - timedelta(days=offset)
        attenuation = 5 - min(offset, 5)
        marked = max(len(students) - (offset * 2), 0)
        present = 0
        absent = 0
        if marked and students:
            average = sum(student["attendance"] for student in students) / len(students)
            present_ratio = max(0.55, min(0.96, (average / 100) - (offset * 0.015) + (attenuation * 0.01)))
            present = min(marked, int(round(marked * present_ratio)))
            absent = max(marked - present, 0)
        rows.append(
            {
                "date": day.isoformat(),
                "label": day.strftime("%d %b"),
                "present": present,
                "absent": absent,
                "marked": marked,
                "attendance": round((present / marked) * 100, 1) if marked else 0,
            }
        )
    return rows


def _admin_metrics(students: list[dict], professors: list[dict]) -> list[dict]:
    blocked_students = sum(1 for student in students if student["isBlocked"])
    blocked_professors = sum(1 for professor in professors if professor["isBlocked"])
    average_attendance = round(sum(student["attendance"] for student in students) / len(students), 1) if students else 0
    average_cgpa = round(sum(student["cgpa"] for student in students) / len(students), 2) if students else 0
    return [
        {"label": "Students", "value": str(len(students)), "hint": "Enrolled student accounts", "tone": "cyan"},
        {"label": "Professors", "value": str(len(professors)), "hint": "Verified faculty accounts", "tone": "pink"},
        {"label": "Attendance Avg", "value": f"{average_attendance:.1f}%", "hint": "Campus-wide student attendance", "tone": "green"},
        {
            "label": "Account Watchlist",
            "value": str(blocked_students + blocked_professors),
            "hint": f"{blocked_students} students, {blocked_professors} professors blocked",
            "tone": "amber",
        },
        {"label": "Average CGPA", "value": f"{average_cgpa:.2f}", "hint": "Active student academic average", "tone": "violet"},
    ]


@router.get("/dashboard", response_model=AdminDashboard)
def dashboard(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> AdminDashboard:
    _require_admin(current_user)
    students = _student_rows(db)
    professors = _professor_rows(db)
    db.commit()
    return AdminDashboard(
        admin={
            "name": current_user.full_name,
            "email": current_user.email,
            "role": "Administrator",
            "avatar": _avatar(current_user.full_name),
            "navModules": ADMIN_NAV,
        },
        metrics=_admin_metrics(students, professors),
        ratio_overview=_ratio_overview(len(students), len(professors)),
        attendance_overview=_attendance_overview(students),
        students=students,
        professors=professors,
    )


@router.post("/students/{student_id}/block")
def update_student_block(
    student_id: int,
    payload: dict,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_admin(current_user)
    student = db.get(User, student_id)
    if not student or student.role != Role.student:
        raise HTTPException(status_code=404, detail="Student not found")

    blocked = bool(payload.get("blocked"))
    student.is_blocked = blocked
    if blocked:
        student.block_reason = str(payload.get("reason") or "Blocked by admin").strip()
        student.blocked_at = _now()
        student.blocked_by_id = current_user.id
    else:
        student.block_reason = None
        student.blocked_at = None
        student.blocked_by_id = None

    db.commit()
    return {"ok": True, "id": student.id, "is_blocked": student.is_blocked}


@router.post("/professors/{professor_id}/block")
def update_professor_block(
    professor_id: int,
    payload: dict,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_admin(current_user)
    professor = db.get(User, professor_id)
    if not professor or professor.role != Role.faculty:
        raise HTTPException(status_code=404, detail="Professor not found")

    blocked = bool(payload.get("blocked"))
    professor.is_blocked = blocked
    if blocked:
        professor.block_reason = str(payload.get("reason") or "Blocked by admin").strip()
        professor.blocked_at = _now()
        professor.blocked_by_id = current_user.id
    else:
        professor.block_reason = None
        professor.blocked_at = None
        professor.blocked_by_id = None

    db.commit()
    return {"ok": True, "id": professor.id, "is_blocked": professor.is_blocked}


def _delete_user_dependencies(db: Session, user: User) -> None:
    message_ids = [
        message_id
        for (message_id,) in db.query(ConnectMessage.id)
        .filter((ConnectMessage.sender_id == user.id) | (ConnectMessage.receiver_id == user.id))
        .all()
    ]
    if message_ids:
        db.query(ConnectAttachment).filter(ConnectAttachment.message_id.in_(message_ids)).delete(synchronize_session=False)
        db.query(ConnectMessageHidden).filter(ConnectMessageHidden.message_id.in_(message_ids)).delete(synchronize_session=False)
    db.query(StudentAttendance).filter(
        (StudentAttendance.student_id == user.id) | (StudentAttendance.marked_by_id == user.id)
    ).delete(synchronize_session=False)
    db.query(StudentTodo).filter(StudentTodo.student_id == user.id).delete(synchronize_session=False)
    db.query(AssignmentReview).filter(
        (AssignmentReview.student_id == user.id) | (AssignmentReview.reviewed_by_id == user.id)
    ).delete(synchronize_session=False)
    db.query(Announcement).filter(Announcement.created_by_id == user.id).delete(synchronize_session=False)
    db.query(StudyResource).filter(StudyResource.created_by_id == user.id).delete(synchronize_session=False)
    db.query(ConnectMessage).filter(
        (ConnectMessage.sender_id == user.id) | (ConnectMessage.receiver_id == user.id)
    ).delete(synchronize_session=False)
    db.query(ConnectRelationship).filter(
        (ConnectRelationship.user_low_id == user.id)
        | (ConnectRelationship.user_high_id == user.id)
        | (ConnectRelationship.requester_id == user.id)
        | (ConnectRelationship.receiver_id == user.id)
        | (ConnectRelationship.blocked_by_id == user.id)
    ).delete(synchronize_session=False)
    db.query(RevokedToken).filter(RevokedToken.user_id == user.id).delete(synchronize_session=False)
    db.query(ProfessorProfile).filter(ProfessorProfile.user_id == user.id).delete(synchronize_session=False)
    db.query(StudentProfile).filter(StudentProfile.user_id == user.id).delete(synchronize_session=False)


@router.delete("/students/{student_id}")
def delete_student(
    student_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_admin(current_user)
    student = db.get(User, student_id)
    if not student or student.role != Role.student:
        raise HTTPException(status_code=404, detail="Student not found")

    _delete_user_dependencies(db, student)
    db.delete(student)
    db.commit()
    return {"ok": True, "id": student_id}


@router.delete("/professors/{professor_id}")
def delete_professor(
    professor_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_admin(current_user)
    professor = db.get(User, professor_id)
    if not professor or professor.role != Role.faculty:
        raise HTTPException(status_code=404, detail="Professor not found")

    _delete_user_dependencies(db, professor)
    db.delete(professor)
    db.commit()
    return {"ok": True, "id": professor_id}
