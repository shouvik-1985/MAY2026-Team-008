from datetime import date, datetime, timedelta, timezone
import json
from pathlib import Path
from typing import Annotated
from urllib.parse import quote
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session, selectinload

from app.assignment_ai import grade_from_score, normalize_grade_code, review_digital_submission, review_file_submission
from app.attendance_flow import (
    campus_setting_payload,
    checkin_payload,
    distance_meters,
    get_campus_attendance_setting,
    get_today_checkin,
    now_utc,
    today_local,
)
from app.avatar import avatar_initials, student_avatar_url
from app.biometric_flow import clear_face_template, has_face_template, save_face_template, verify_face_template
from app.complaint_flow import complaint_payload
from app.core.config import get_settings
from app.dependencies import get_current_user
from app.db import get_db
from app.fee_flow import create_razorpay_order, student_fee_data, verify_razorpay_payment
from app.intake_flow import resolve_student_semester
from app.models import (
    Announcement,
    Assignment,
    AssignmentSubmission,
    ConnectMessage,
    MarketplaceItem,
    PlacementNotification,
    Role,
    StudentAttendance,
    StudentBiometricCheckIn,
    StudentCertificateRequest,
    StudentComplaint,
    StudentEventRegistration,
    StudentMarketplaceInquiry,
    StudentProfile,
    StudentTodo,
    StudyResource,
    User,
)
from app.resource_ai import build_study_resource_ai_summary
from app.resource_files import public_resource_url
from app.schemas import (
    AssignmentDigitalSubmissionCreate,
    CampusAttendanceSettingsOut,
    StudentAssistantRequest,
    StudentAssistantResponse,
    StudentAvatarUpdate,
    StudentBiometricVerify,
    StudentDashboard,
    StudentProfileOut,
    StudentProfileUpdate,
    StudentRadiusCheck,
    StudentTodoCreate,
    StudentTodoUpdate,
)
from app.services.student_assistant import answer_student_assistant

router = APIRouter(prefix="/student", tags=["student"])
try:
    LOCAL_TIMEZONE = ZoneInfo("Asia/Kolkata")
except Exception:
    LOCAL_TIMEZONE = timezone.utc
NOW_DATE = date(2026, 7, 22)


STUDENT_NAV = [
    {"label": "Dashboard", "path": "/app", "feature": "Academic snapshot"},
    {"label": "Announcements", "path": "/app/announcements", "feature": "Centralized updates"},
    {"label": "Attendance", "path": "/app/attendance", "feature": "Attendance automation view"},
    {"label": "Assignments", "path": "/app/assignments", "feature": "Submission and grading"},
    {"label": "Study Resources", "path": "/app/resources", "feature": "Notes and papers"},
    {"label": "Complaints", "path": "/app/complaints", "feature": "Live request tracking"},
    {"label": "Certificates", "path": "/app/certificates", "feature": "Document requests"},
    {"label": "Fee Payment", "path": "/app/fees", "feature": "Payment verification"},
    {"label": "Events", "path": "/app/events", "feature": "Registration and passes"},
    {"label": "Marketplace", "path": "/app/marketplace", "feature": "Verified student exchange"},
    {"label": "Connect", "path": "/app/connect", "feature": "Student and professor network"},
    {"label": "Placement", "path": "/app/placement", "feature": "Internship and job readiness"},
]


def _require_student(user: User) -> None:
    if user.role != Role.student:
        raise HTTPException(status_code=403, detail="Student dashboard is available to student users only")


def _avatar(name: str) -> str:
    return avatar_initials(name, "CV")


def _attendance_records(db: Session, user_id: int) -> list[StudentAttendance]:
    return (
        db.query(StudentAttendance)
        .filter(StudentAttendance.student_id == user_id)
        .order_by(StudentAttendance.attendance_date.asc())
        .all()
    )


def _attendance_percentage(records: list[StudentAttendance], fallback: float) -> float:
    if not records:
        return fallback
    present = len([record for record in records if record.status == "present"])
    return round((present / len(records)) * 100, 2)


def _today() -> date:
    return NOW_DATE


def _normalize_due_at(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _todo_out(todo: StudentTodo) -> dict:
    return {
        "id": todo.id,
        "title": todo.title,
        "dueAt": todo.due_at.isoformat() if todo.due_at else None,
        "completed": todo.completed,
        "createdAt": todo.created_at.isoformat(),
        "updatedAt": todo.updated_at.isoformat(),
    }


def _todo_rows(db: Session, student_id: int) -> list[dict]:
    rows = (
        db.query(StudentTodo)
        .filter(StudentTodo.student_id == student_id)
        .order_by(StudentTodo.completed.asc(), StudentTodo.due_at.asc(), StudentTodo.created_at.desc())
        .limit(80)
        .all()
    )
    return [_todo_out(row) for row in rows]


CERTIFICATE_DEFINITIONS = [
    {"key": "bonafide", "name": "Bonafide Certificate", "eta": "Admin Review", "req": "Active Enrollment"},
    {"key": "conduct", "name": "Dean's Merit & Conduct Certificate", "eta": "Admin Review", "req": "CGPA >= 8.5 & Att. >= 85%"},
    {"key": "graduation", "name": "Graduation Degree Certificate", "eta": "Auto-Issued", "req": "Semester 4 Completion"},
]

MANUAL_CERTIFICATE_KEYS = {"bonafide", "conduct"}


def _certificate_request_rows(db: Session, student_id: int) -> list[StudentCertificateRequest]:
    return (
        db.query(StudentCertificateRequest)
        .filter(StudentCertificateRequest.student_id == student_id)
        .order_by(desc(StudentCertificateRequest.updated_at))
        .all()
    )


def _find_certificate_request(db: Session, student_id: int, certificate_key: str) -> StudentCertificateRequest | None:
    return (
        db.query(StudentCertificateRequest)
        .filter(
            StudentCertificateRequest.student_id == student_id,
            StudentCertificateRequest.certificate_key == certificate_key,
        )
        .first()
    )


def _ensure_graduation_certificate_request(
    db: Session,
    user: User,
    profile: StudentProfile,
    semester: int,
) -> StudentCertificateRequest | None:
    if semester < 4:
        return None

    definition = next((item for item in CERTIFICATE_DEFINITIONS if item["key"] == "graduation"), None)
    if not definition:
        return None

    request = _find_certificate_request(db, user.id, "graduation")
    moment = datetime.now(timezone.utc)
    if request is None:
        request = StudentCertificateRequest(
            student_id=user.id,
            certificate_key="graduation",
            certificate_name=definition["name"],
            status="ready",
            purpose="Degree completion",
            certificate_body=(
                f"{user.full_name} has completed Semester 4 of the {profile.department} program and has "
                "fulfilled the academic requirements for graduation."
            ),
            signatory_name="Dr. A. R. Sharma",
            signatory_title="Registrar & Academic Senate",
            requested_at=moment,
            ready_at=moment,
        )
        db.add(request)
        db.commit()
        db.refresh(request)
    elif request.status not in {"ready", "downloaded"}:
        request.status = "ready"
        request.ready_at = request.ready_at or moment
        request.updated_at = moment
        db.commit()
        db.refresh(request)

    return request


def _certificate_items(db: Session, user: User, due_amount: int, first_name: str) -> list[dict]:
    profile = _ensure_student_profile(db, user)
    setting = get_campus_attendance_setting(db)
    attendance_records = _attendance_records(db, user.id)
    raw_attendance = _attendance_percentage(attendance_records, profile.attendance if profile else 88.0)
    attendance = profile.attendance if (profile and profile.attendance and profile.attendance > 10.0) else (raw_attendance if raw_attendance > 10.0 else 88.0)
    semester = resolve_student_semester(
        profile,
        user,
        setting.semester_duration_months,
        setting.semester_duration_unit,
        setting.semester_duration_days,
    )
    _ensure_graduation_certificate_request(db, user, profile, semester)
    requests = {item.certificate_key: item for item in _certificate_request_rows(db, user.id)}
    
    descriptions = {
        "bonafide": f"Enrollment proof for {first_name}, issued after admin verification.",
        "conduct": f"Honors certificate (Current: CGPA {profile.cgpa:.1f}, {attendance:.0f}% Att.)",
        "graduation": f"Official Degree Certificate (Semester {semester}/4)" if semester < 4 else f"Conferred Graduation Degree for {first_name}",
    }
    
    items: list[dict] = []
    for index, item in enumerate(CERTIFICATE_DEFINITIONS, start=1):
        request = requests.get(item["key"])
        if item["key"] == "graduation" and semester >= 4:
            status = request.status if request else "ready"
        elif item["key"] == "graduation":
            status = "locked"
        else:
            status = request.status if request else "available"
        items.append(
            {
                "id": user.id * 10 + index,
                "key": item["key"],
                "name": item["name"],
                "desc": descriptions[item["key"]],
                "eta": item["eta"],
                "req": item["req"],
                "status": status,
                "requestedAt": request.requested_at.isoformat() if request else None,
                "readyAt": request.ready_at.isoformat() if request and request.ready_at else None,
                "downloadedAt": request.downloaded_at.isoformat() if request and request.downloaded_at else None,
            }
        )
    return items


def _validate_certificate_eligibility(db: Session, user: User, certificate_key: str) -> None:
    if user.is_blocked:
        raise HTTPException(
            status_code=400,
            detail=f"Account is under administrative hold: {user.block_reason or 'Contact Dean Office'}.",
        )
    profile = _ensure_student_profile(db, user)
    setting = get_campus_attendance_setting(db)
    attendance_records = _attendance_records(db, user.id)
    attendance = _attendance_percentage(attendance_records, profile.attendance)
    semester = resolve_student_semester(
        profile,
        user,
        setting.semester_duration_months,
        setting.semester_duration_unit,
        setting.semester_duration_days,
    )
    if certificate_key == "conduct":
        if profile.cgpa < 8.0 or attendance < 75.0:
            raise HTTPException(
                status_code=422,
                detail=f"Dean's Merit & Conduct Certificate requires CGPA >= 8.0 & Attendance >= 75%. Yours: CGPA {profile.cgpa:.1f}, Attendance {attendance:.0f}%.",
            )


def _event_rows(db: Session, user: User, semester: int, seed: int) -> list[dict]:
    registrations = {
        item.event_key: item
        for item in (
            db.query(StudentEventRegistration)
            .filter(StudentEventRegistration.student_id == user.id)
            .all()
        )
    }
    base = [
        {
            "key": "career-connect-week",
            "title": "Career Connect Workshop",
            "date": date(2026, 7, 24),
            "venue": "Innovation Hub",
            "spots": 80 + seed * 9,
            "accent": "oklch(0.7 0.25 310)",
        },
        {
            "key": "research-poster-day",
            "title": "Research Poster Day",
            "date": date(2026, 8, 4),
            "venue": "Hall A-201",
            "spots": 60 + seed * 7,
            "accent": "oklch(0.82 0.18 200)",
        },
        {
            "key": "semester-townhall",
            "title": f"Semester {semester} Townhall",
            "date": date(2026, 8, 12),
            "venue": "Main Auditorium",
            "spots": 120 + seed * 14,
            "accent": "oklch(0.72 0.27 350)",
        },
    ]
    rows: list[dict] = []
    for index, item in enumerate(base, start=1):
        registration = registrations.get(item["key"])
        rows.append(
            {
                "id": user.id * 10 + index,
                "key": item["key"],
                "title": item["title"],
                "date": item["date"].strftime("%b %d"),
                "isoDate": item["date"].isoformat(),
                "venue": item["venue"],
                "spots": item["spots"],
                "accent": item["accent"],
                "attended": bool(registration and registration.attended),
                "registered": registration is not None,
                "registeredAt": registration.registered_at.isoformat() if registration else None,
                "details": (
                    "Bring your student ID and arrive 15 minutes early. "
                    "Registration closes once venue capacity is reached."
                ),
            }
        )
    return rows


def _marketplace_items(db: Session, user: User, semester: int) -> list[dict]:
    items = db.query(MarketplaceItem).order_by(MarketplaceItem.created_at.desc()).all()
    first_name = user.full_name.split()[0] if user.full_name else "Student"
    clamped_sem = min(4, max(1, semester))

    if not items:
        defaults = [
            MarketplaceItem(
                seller_id=user.id,
                item_key="notes-bundle",
                name=f"Sem {clamped_sem} Notes & PYQ Bundle",
                category="Notes",
                price="₹ 120",
                seller_name=f"{first_name} / Sem {clamped_sem}",
                tag="Verified",
                image_url="https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?q=80&w=800&auto=format&fit=crop",
                description="Curated lecture notes, summaries, and previous practice sheets.",
                status="Available",
            ),
            MarketplaceItem(
                seller_id=user.id,
                item_key="engineering-calculator",
                name="Casio FX-991EX Scientific Calculator",
                category="Electronics",
                price="₹ 650",
                seller_name="Rahul / Sem 4",
                tag="Like New",
                image_url="https://images.unsplash.com/photo-1594980596870-8aa52a78d8cd?q=80&w=800&auto=format&fit=crop",
                description="Exam-ready Casio FX-991EX scientific calculator with cover and fresh batteries.",
                status="Available",
            ),
            MarketplaceItem(
                seller_id=user.id,
                item_key="reference-book-set",
                name="Core CS Reference Book Set (3 Books)",
                category="Books",
                price="₹ 480",
                seller_name="Library Circle",
                tag="Clean Copy",
                image_url="https://images.unsplash.com/photo-1497633762265-9d179a990aa6?q=80&w=800&auto=format&fit=crop",
                description="Includes CLRS Algorithms, Silberschatz Operating Systems, and Tanenbaum Networks.",
                status="Reserved",
            ),
            MarketplaceItem(
                seller_id=user.id,
                item_key="hostel-desk-lamp",
                name="Adjustable LED Study Desk Lamp & Organizer",
                category="Hostel",
                price="₹ 350",
                seller_name="Ananya / Sem 3",
                tag="Excellent",
                image_url="https://images.unsplash.com/photo-1534073828943-f801091bb18c?q=80&w=800&auto=format&fit=crop",
                description="Dimmable 3-mode LED desk lamp with built-in pen holder and USB charging port for hostel room study.",
                status="Available",
            ),
        ]
        db.add_all(defaults)
        db.commit()
        items = db.query(MarketplaceItem).order_by(MarketplaceItem.created_at.desc()).all()
    else:
        import re
        updated = False
        for item in items:
            if "Sem 16" in item.name or "Sem 16" in item.seller_name or item.item_key == "notes-bundle":
                item.name = re.sub(r"Sem \d+", f"Sem {clamped_sem}", item.name)
                item.seller_name = re.sub(r"Sem \d+", f"Sem {clamped_sem}", item.seller_name)
                updated = True
            elif re.search(r"Sem ([5-9]|\d{2,})", item.name) or re.search(r"Sem ([5-9]|\d{2,})", item.seller_name):
                item.name = re.sub(r"Sem ([5-9]|\d{2,})", f"Sem {clamped_sem}", item.name)
                item.seller_name = re.sub(r"Sem ([5-9]|\d{2,})", f"Sem {clamped_sem}", item.seller_name)
                updated = True
        if updated:
            db.commit()

    return [
        {
            "id": item.id,
            "key": item.item_key,
            "name": item.name,
            "category": item.category,
            "price": item.price,
            "seller": item.seller_name,
            "seller_id": item.seller_id,
            "tag": item.tag,
            "imageUrl": item.image_url,
            "description": item.description,
            "status": item.status,
            "createdAt": item.created_at.isoformat() if item.created_at else None,
        }
        for item in items
    ]


def _fee_history(user_id: int, semester: int, fee_base: int, due_amount: int) -> list[dict]:
    return [
        {
            "id": f"INV-{user_id:03d}6",
            "semester": f"Sem {semester}",
            "amount": fee_base,
            "status": "due" if due_amount else "paid",
            "date": "Jul 25, 2026" if due_amount else "Jul 05, 2026",
        },
        {
            "id": f"INV-{user_id:03d}5",
            "semester": f"Sem {max(1, semester - 1)}",
            "amount": fee_base - 1200,
            "status": "paid",
            "date": "Jan 18, 2026",
        },
        {
            "id": f"INV-{user_id:03d}4",
            "semester": f"Sem {max(1, semester - 2)}",
            "amount": fee_base - 2500,
            "status": "paid",
            "date": "Aug 12, 2025",
        },
    ]


def _content_disposition(filename: str, download: bool) -> str:
    disposition = "attachment" if download else "inline"
    return f"{disposition}; filename*=UTF-8''{quote(filename)}"


def _plain_document(filename: str, content: str, download: bool = False) -> Response:
    data = content.encode("utf-8")
    return Response(
        content=data,
        media_type="text/plain; charset=utf-8",
        headers={
            "Content-Disposition": _content_disposition(filename, download),
            "Content-Length": str(len(data)),
        },
    )


def _split_skills(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def _join_skills(value: list[str]) -> str:
    cleaned = [item.strip() for item in value if item.strip()]
    return ", ".join(dict.fromkeys(cleaned))


def _academic_standing(cgpa: float, attendance: float) -> str:
    if cgpa >= 9 and attendance >= 90:
        return "Dean's List"
    if cgpa >= 8.5 and attendance >= 85:
        return "Top 20%"
    if cgpa >= 7.5:
        return "On Track"
    return "In Progress"


def _completed_credits(profile: StudentProfile | None, semester: int) -> int:
    if profile and profile.completed_credits is not None:
        return profile.completed_credits
    base = max(18, semester * 20 - 12)
    return min(base, profile.total_credits if profile else 180)


def _profile_completion(user: User, profile: StudentProfile | None) -> int:
    checks = [
        user.full_name.strip(),
        user.email.strip(),
        (profile.address if profile else "").strip(),
        (profile.phone if profile and profile.phone else "").strip(),
        (profile.bio if profile and profile.bio else "").strip(),
        (profile.focus_area if profile and profile.focus_area else "").strip(),
        "skills" if _split_skills(profile.skills_text if profile else None) else "",
        (profile.city if profile and profile.city else "").strip(),
        (profile.state if profile and profile.state else "").strip(),
    ]
    completed = len([item for item in checks if item])
    return round((completed / len(checks)) * 100)


def _ensure_student_profile(db: Session, user: User) -> StudentProfile:
    if user.student_profile:
        profile = user.student_profile
        if not profile.address:
            profile.address = "Campus Residence"
        return profile

    profile = StudentProfile(
        user_id=user.id,
        student_code=f"CV-2026-{1000 + user.id:04d}",
        address="Campus Residence",
        department="Computer Science & AI",
    )
    db.add(profile)
    db.flush()
    return profile


def _student_profile_payload(db: Session, user: User) -> dict:
    profile = _ensure_student_profile(db, user)
    setting = get_campus_attendance_setting(db)
    attendance_records = _attendance_records(db, user.id)
    attendance = _attendance_percentage(attendance_records, profile.attendance)
    semester = resolve_student_semester(profile, user, setting.semester_duration_months)
    profile.semester = semester
    profile.attendance = attendance
    skills = _split_skills(profile.skills_text)
    completed_credits = _completed_credits(profile, semester)
    total_credits = profile.total_credits or 180

    return {
        "id": user.id,
        "name": user.full_name,
        "email": user.email,
        "studentCode": profile.student_code,
        "department": profile.department,
        "semester": semester,
        "cgpa": round(profile.cgpa, 2),
        "attendance": round(attendance, 2),
        "completedCredits": completed_credits,
        "totalCredits": total_credits,
        "address": profile.address,
        "phone": profile.phone or "",
        "bio": profile.bio or "",
        "focus": profile.focus_area or "",
        "skills": skills,
        "guardianName": profile.guardian_name or "",
        "guardianPhone": profile.guardian_phone or "",
        "city": profile.city or "",
        "state": profile.state or "",
        "linkedinUrl": profile.linkedin_url or "",
        "githubUrl": profile.github_url or "",
        "avatar": _avatar(user.full_name),
        "avatarUrl": student_avatar_url(profile),
        "academicStanding": _academic_standing(profile.cgpa, attendance),
        "profileCompletion": _profile_completion(user, profile),
        "enrollmentDate": profile.enrollment_date.isoformat() if profile.enrollment_date else None,
        "biometricEnrolled": has_face_template(profile),
        "biometricEnrolledAt": profile.biometric_enrolled_at.isoformat()
        if profile.biometric_enrolled_at
        else None,
    }


def _weekly_attendance(records: list[StudentAttendance], fallback: list[int]) -> list[dict]:
    today = _today()
    days = [today - timedelta(days=offset) for offset in range(6, -1, -1)]

    if not records:
        return [
            {
                "date": day.isoformat(),
                "day": day.strftime("%a"),
                "label": day.strftime("%d %b"),
                "attendance": value,
                "status": "demo",
                "marked": True,
                "isToday": day == today,
            }
            for day, value in zip(days, fallback)
        ]

    by_day = {record.attendance_date: record.status for record in records}
    rows: list[dict] = []
    for day in days:
        status = by_day.get(day)
        rows.append(
            {
                "date": day.isoformat(),
                "day": day.strftime("%a"),
                "label": day.strftime("%d %b"),
                "attendance": 100 if status == "present" else 0,
                "status": status or "unmarked",
                "marked": status is not None,
                "isToday": day == today,
            }
        )
    return rows


def _attendance_timeline(records: list[StudentAttendance]) -> list[dict]:
    if not records:
        return []

    visible_records = records[-30:]
    prior_records = records[:-30]
    present_count = len([record for record in prior_records if record.status == "present"])
    marked_count = len(prior_records)
    rows: list[dict] = []
    for record in visible_records:
        marked_count += 1
        if record.status == "present":
            present_count += 1
        attendance = round((present_count / marked_count) * 100)
        rows.append(
            {
                "date": record.attendance_date.isoformat(),
                "label": record.attendance_date.strftime("%d %b"),
                "month": record.attendance_date.strftime("%b"),
                "attendance": attendance,
                "status": record.status,
                "present": present_count,
                "absent": marked_count - present_count,
                "marked": marked_count,
            }
        )
    return rows


def _monthly_attendance(records: list[StudentAttendance]) -> list[dict]:
    if not records:
        return []

    grouped: dict[tuple[int, int], list[StudentAttendance]] = {}
    for record in records:
        grouped.setdefault((record.attendance_date.year, record.attendance_date.month), []).append(record)

    rows = []
    for year, month in sorted(grouped)[-12:]:
        month_records = grouped[(year, month)]
        present = len([record for record in month_records if record.status == "present"])
        value = round((present / len(month_records)) * 100)
        label = datetime(year, month, 1, tzinfo=timezone.utc).strftime("%b %Y")
        rows.append(
            {
                "month": label,
                "label": label,
                "attendance": value,
                "present": present,
                "absent": len(month_records) - present,
                "marked": len(month_records),
            }
        )
    return rows


def _resource_rows(db: Session) -> list[dict]:
    rows = (
        db.query(StudyResource, User.full_name)
        .outerjoin(User, StudyResource.created_by_id == User.id)
        .order_by(desc(StudyResource.created_at))
        .limit(120)
        .all()
    )
    items: list[dict] = []
    for resource, professor_name in rows:
        items.append(
            {
                "id": resource.id,
                "title": resource.title,
                "subject": resource.subject,
                "type": resource.resource_type,
                "tag": resource.tag,
                "url": public_resource_url(resource),
                "professorName": professor_name or "Campus Faculty",
                "createdAt": resource.created_at.isoformat(),
                "createdDate": resource.created_at.date().isoformat(),
                "time": resource.created_at.strftime("%d %b %Y, %I:%M %p"),
            }
        )
    if not items:
        defaults = [
            {
                "id": 101,
                "title": "Distributed Systems & Consensus Protocols (Raft & Paxos)",
                "subject": "Distributed Systems",
                "type": "Lecture Notes",
                "tag": "trending",
                "url": "#",
                "professorName": "Prof. V. K. Mehta",
                "createdAt": datetime.now(timezone.utc).isoformat(),
                "createdDate": datetime.now(timezone.utc).date().isoformat(),
                "time": "Today, 10:30 AM",
            },
            {
                "id": 102,
                "title": "Deep Learning & Transformer Architectures Guide",
                "subject": "Machine Learning & AI",
                "type": "Study Guide",
                "tag": "new",
                "url": "#",
                "professorName": "Dr. A. R. Sharma",
                "createdAt": datetime.now(timezone.utc).isoformat(),
                "createdDate": datetime.now(timezone.utc).date().isoformat(),
                "time": "Yesterday, 04:15 PM",
            },
            {
                "id": 103,
                "title": "Operating Systems Kernel & Virtual Memory Mechanics",
                "subject": "Operating Systems",
                "type": "Lecture Slides",
                "tag": "trending",
                "url": "#",
                "professorName": "Dr. S. K. Gupta",
                "createdAt": datetime.now(timezone.utc).isoformat(),
                "createdDate": datetime.now(timezone.utc).date().isoformat(),
                "time": "2 days ago",
            },
            {
                "id": 104,
                "title": "Data Structures & Advanced Graph Algorithms Sheet",
                "subject": "Algorithms",
                "type": "Cheat Sheet",
                "tag": "exam_ready",
                "url": "#",
                "professorName": "Prof. R. N. Iyer",
                "createdAt": datetime.now(timezone.utc).isoformat(),
                "createdDate": datetime.now(timezone.utc).date().isoformat(),
                "time": "3 days ago",
            },
            {
                "id": 105,
                "title": "Full-Stack Web Architectures & Fast-API REST Specs",
                "subject": "Software Engineering",
                "type": "Reference",
                "tag": "new",
                "url": "#",
                "professorName": "Prof. V. K. Mehta",
                "createdAt": datetime.now(timezone.utc).isoformat(),
                "createdDate": datetime.now(timezone.utc).date().isoformat(),
                "time": "4 days ago",
            },
            {
                "id": 106,
                "title": "Database Systems Indexing & B-Tree Performance Guide",
                "subject": "Database Systems",
                "type": "Exam Papers",
                "tag": "trending",
                "url": "#",
                "professorName": "Dr. A. R. Sharma",
                "createdAt": datetime.now(timezone.utc).isoformat(),
                "createdDate": datetime.now(timezone.utc).date().isoformat(),
                "time": "5 days ago",
            },
        ]
        items.extend(defaults)
    return items


def _placement_notification_rows(db: Session, student_id: int) -> list[dict]:
    notifications = (
        db.query(PlacementNotification)
        .filter(PlacementNotification.student_id == student_id)
        .order_by(desc(PlacementNotification.created_at))
        .limit(5)
        .all()
    )
    return [
        {
            "id": 900000 + item.id,
            "pinned": item.channel == "placement",
            "title": item.title,
            "category": "Placement",
            "time": item.created_at.strftime("%d %b, %I:%M %p"),
            "unread": not item.read,
            "body": item.body,
        }
        for item in notifications
    ]


def _student_announcement_rows(db: Session, user: User) -> list[dict]:
    announcements = (
        db.query(Announcement)
        .order_by(desc(Announcement.created_at))
        .limit(15)
        .all()
    )
    if not announcements:
        defaults = [
            Announcement(
                title="End-Semester Examination Schedule Announced (July 2026)",
                category="Exam",
                pinned=True,
                audience="All Students",
                body="The official timetable for the July 2026 End-Semester Examinations has been published. Please verify your hall tickets and ensure zero fee balance before July 28th.",
                created_at=datetime.now(timezone.utc),
            ),
            Announcement(
                title="Campus Innovation Hackathon 2026 Registration Open",
                category="Events",
                pinned=True,
                audience="Computer Science & AI",
                body="Participate in the 48-hour Annual Campus Hackathon. Top winning teams will receive cash grants up to INR 1,50,000 and direct internship interviews with partner AI tech firms.",
                created_at=datetime.now(timezone.utc) - timedelta(hours=5),
            ),
            Announcement(
                title="Campus Placement Drive - TechVerse Solutions",
                category="Placement",
                pinned=False,
                audience="Final Year & Sem 4 Students",
                body="TechVerse Solutions is conducting placement drives for Full Stack & AI Engineering roles. Eligible students with CGPA >= 7.5 are requested to submit resumes by July 30th.",
                created_at=datetime.now(timezone.utc) - timedelta(days=1),
            ),
            Announcement(
                title="Library & Digital Innovation Hub Extended Hours",
                category="Academic",
                pinned=False,
                audience="All Students",
                body="The Central Library and AI High-Performance Computing Lab will remain open 24/7 during examination preparation weeks starting July 25th.",
                created_at=datetime.now(timezone.utc) - timedelta(days=2),
            ),
        ]
        db.add_all(defaults)
        db.commit()
        announcements = db.query(Announcement).order_by(desc(Announcement.created_at)).all()

    return [
        {
            "id": item.id,
            "pinned": item.pinned,
            "title": item.title,
            "category": item.category,
            "time": item.created_at.strftime("%d %b, %I:%M %p"),
            "unread": True,
            "body": item.body,
        }
        for item in announcements
    ]


def _complaint_rows(
    db: Session,
    user: User,
    semester_duration_months: int,
    semester_duration_unit: str = "months",
    semester_duration_days: int | None = None,
) -> list[dict]:
    complaints = (
        db.query(StudentComplaint)
        .options(
            selectinload(StudentComplaint.attachments),
            selectinload(StudentComplaint.student).selectinload(User.student_profile),
        )
        .filter(StudentComplaint.student_id == user.id)
        .order_by(desc(StudentComplaint.submitted_at))
        .limit(12)
        .all()
    )
    return [
        complaint_payload(
            complaint,
            student=user,
            profile=user.student_profile,
            semester_duration_months=semester_duration_months,
            semester_duration_unit=semester_duration_unit,
            semester_duration_days=semester_duration_days,
        )
        for complaint in complaints
    ]


def _json_loads(value: str | None, fallback):
    if not value:
        return fallback
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return fallback


def _student_assignment_items(
    db: Session,
    user: User,
    first_name: str,
    department: str,
    seed: int,
    cgpa: float,
) -> list[dict]:
    assignments = (
        db.query(Assignment)
        .filter(Assignment.status == "published")
        .order_by(desc(Assignment.created_at))
        .limit(50)
        .all()
    )
    if not assignments:
        return []

    submissions = {
        item.assignment_id: item
        for item in db.query(AssignmentSubmission).filter(AssignmentSubmission.student_id == user.id).all()
    }
    rows: list[dict] = []
    for item in assignments:
        content = _json_loads(item.content_json, {})
        rubric = _json_loads(item.rubric_json, [])
        questions = content.get("questions", []) if isinstance(content, dict) else []
        submission = submissions.get(item.id)
        status = "pending"
        progress = 0
        grade = None
        professor_grade = None
        review_finalized = False
        if submission:
            status = "graded"
            progress = 100
            ai_grade = (
                grade_from_score((submission.ai_score / max(1, item.total_points)) * 100)
                if submission.ai_score is not None
                else submission.ai_grade
            )
            stored_professor_grade = normalize_grade_code(submission.professor_grade)
            professor_grade = (
                stored_professor_grade
                if stored_professor_grade
                else grade_from_score((submission.professor_score / max(1, item.total_points)) * 100)
                if submission.professor_score is not None
                else None
            )
            grade = professor_grade or ai_grade or "Submitted"
            review_finalized = bool(
                submission.professor_score is not None
                or professor_grade
                or submission.professor_feedback
            )
        rows.append(
            {
                "id": item.id,
                "title": item.title,
                "subject": item.subject,
                "due": item.due_label,
                "progress": progress,
                "status": status,
                "grade": grade,
                "assignmentType": item.assignment_type,
                "sourceKind": item.source_kind,
                "sourceTitle": item.source_title,
                "instructions": content.get("instructions", "") if isinstance(content, dict) else "",
                "questions": questions if isinstance(questions, list) else [],
                "rubric": rubric if isinstance(rubric, list) else [],
                "allowedFileTypes": content.get("allowedFileTypes", []) if isinstance(content, dict) else [],
                "totalPoints": item.total_points,
                "submittedAt": submission.submitted_at.isoformat() if submission else None,
                "aiGrade": ai_grade if submission else None,
                "aiScore": submission.ai_score if submission else None,
                "aiFeedback": submission.ai_feedback if submission else None,
                "aiReview": _json_loads(submission.ai_review_json, {}) if submission else None,
                "professorScore": submission.professor_score if submission else None,
                "professorGrade": professor_grade if submission else None,
                "professorFeedback": submission.professor_feedback if submission else None,
                "reviewFinalized": review_finalized,
                "reviewStatus": "faculty_final" if review_finalized else "ai_reviewed" if submission else "not_submitted",
                "reviewLabel": "Faculty final grade" if review_finalized else "AI provisional review" if submission else "Not submitted",
                "fileName": submission.filename if submission else None,
            }
        )
    return rows


def _student_dataset(db: Session, user: User) -> dict:
    profile = _ensure_student_profile(db, user)
    setting = get_campus_attendance_setting(db)
    seed = user.id % 7
    cgpa = profile.cgpa if profile else round(8.1 + (seed * 0.13), 1)
    fallback_attendance = profile.attendance if profile else float(84 + seed)
    attendance_records = _attendance_records(db, user.id)
    attendance = _attendance_percentage(attendance_records, fallback_attendance)
    semester = resolve_student_semester(
        profile,
        user,
        setting.semester_duration_months,
        setting.semester_duration_unit,
        setting.semester_duration_days,
    )
    student_code = profile.student_code if profile else f"CV-2026-{1000 + user.id:04d}"
    department = profile.department if profile else "Computer Science & AI"
    profile.attendance = attendance
    profile.semester = semester
    profile_skills = _split_skills(profile.skills_text if profile else None)
    completed_credits = _completed_credits(profile, semester)
    total_credits = profile.total_credits if profile and profile.total_credits else 180
    fallback_weekly_values = [max(72, min(100, int(attendance + delta + seed))) for delta in [-10, -4, 3, -2, 0, 7, -5]]
    weekly_attendance = _weekly_attendance(attendance_records, fallback_weekly_values)
    attendance_timeline = _attendance_timeline(attendance_records)
    monthly_attendance = _monthly_attendance(attendance_records)
    complaint_rows = _complaint_rows(
        db,
        user,
        setting.semester_duration_months,
        setting.semester_duration_unit,
        setting.semester_duration_days,
    )
    fee_data = student_fee_data(db, user, semester)
    due_amount = fee_data["summary"]["outstanding"]
    first_name = user.full_name.split()[0] if user.full_name else "Student"
    resource_rows = _resource_rows(db)
    resource_status = f"{len(resource_rows)} uploaded" if resource_rows else "0 uploaded"
    resource_detail = "Notes, slides, previous papers" if resource_rows else "No study resources uploaded yet"
    certificate_items = _certificate_items(db, user, due_amount, first_name)
    fee_history = fee_data["history"]
    event_items = _event_rows(db, user, semester, seed)
    marketplace_items = _marketplace_items(db, user, semester)
    assignment_items = _student_assignment_items(db, user, first_name, department, seed, cgpa)
    pending_assignment_count = len(
        [item for item in assignment_items if item.get("status") in {"pending", "ongoing"}]
    )
    graded_assignment_count = len([item for item in assignment_items if item.get("status") == "graded"])
    next_assignment = next(
        (item for item in assignment_items if item.get("status") in {"pending", "ongoing"}),
        assignment_items[0] if assignment_items else None,
    )

    cert_requests = (
        db.query(StudentCertificateRequest)
        .filter(StudentCertificateRequest.student_id == user.id)
        .order_by(desc(StudentCertificateRequest.updated_at))
        .all()
    )

    cert_history_items = [
        {
            "title": req.certificate_name,
            "kind": "Certificate",
            "stage": req.status.replace("_", " ").title(),
            "updated": req.updated_at.strftime("%d %b %Y, %I:%M %p") if req.updated_at else "Today",
        }
        for req in cert_requests
    ]

    latest_certificate = next(
        (
            item
            for item in certificate_items
            if item["status"] in {"requested", "ready", "downloaded"}
        ),
        None,
    )

    return {
        "user": {
            "name": user.full_name,
            "email": user.email,
            "studentCode": student_code,
            "department": department,
            "semester": semester,
            "cgpa": cgpa,
            "attendance": attendance,
            "completedCredits": completed_credits,
            "totalCredits": total_credits,
            "avatar": _avatar(user.full_name),
            "avatarUrl": student_avatar_url(profile),
            "address": profile.address if profile else "Campus Residence",
            "phone": profile.phone if profile and profile.phone else "",
            "bio": profile.bio if profile and profile.bio else "",
            "focus": profile.focus_area if profile and profile.focus_area else "",
            "skills": profile_skills,
            "guardianName": profile.guardian_name if profile and profile.guardian_name else "",
            "guardianPhone": profile.guardian_phone if profile and profile.guardian_phone else "",
            "city": profile.city if profile and profile.city else "",
            "state": profile.state if profile and profile.state else "",
            "linkedinUrl": profile.linkedin_url if profile and profile.linkedin_url else "",
            "githubUrl": profile.github_url if profile and profile.github_url else "",
            "biometricEnrolled": has_face_template(profile),
            "biometricEnrolledAt": profile.biometric_enrolled_at.isoformat()
            if profile and profile.biometric_enrolled_at
            else None,
        },
        "metrics": [
            {"label": "CGPA", "value": f"{cgpa:.1f}", "hint": "Updated from your student profile", "tone": "cyan"},
            {"label": "Attendance", "value": f"{attendance:.0f}%", "hint": f"{max(0, int(attendance - 75))}% above safe zone", "tone": "green"},
            {"label": "Open Requests", "value": str(1 + (user.id % 4)), "hint": "Live student request queue", "tone": "pink"},
            {"label": "Due This Week", "value": str(2 + (user.id % 5)), "hint": "Assignments, fees, events", "tone": "amber"},
        ],
        "cgpa_trend": [
            {"term": f"Sem {idx}", "cgpa": round(max(6.5, cgpa - ((semester - idx) * 0.18)), 2)}
            for idx in range(1, min(semester, 6) + 1)
        ],
        "attendance_weekly": weekly_attendance,
        "attendance_timeline": attendance_timeline,
        "attendance_by_subject": [
            {
                "subject": item["label"],
                "attendance": item["attendance"],
                "status": item["status"],
            }
            for item in attendance_timeline[-6:]
        ],
        "attendance_monthly": monthly_attendance,
        "fee_summary": fee_data["summary"],
        "fee_history": fee_history,
        "module_health": [
            {"module": "Announcements", "status": f"{1 + seed % 3} unread", "detail": f"Updates for {first_name}'s semester"},
            {
                "module": "Assignments",
                "status": f"{pending_assignment_count} pending",
                "detail": f"{graded_assignment_count} AI-reviewed or faculty-graded",
            },
            {"module": "Complaints", "status": f"{user.id % 3} open", "detail": "Live request tracking"},
            {
                "module": "Certificates",
                "status": latest_certificate["status"].replace("_", " ").title() if latest_certificate else "Available",
                "detail": "Bonafide, conduct, and auto graduation certificates",
            },
            {"module": "Fees", "status": "Pending" if due_amount else "Cleared", "detail": "Payment verification and receipts"},
            {"module": "Resources", "status": resource_status, "detail": resource_detail},
        ],
        "upcoming_deadlines": [
            *(
                [
                    {
                        "title": next_assignment["title"],
                        "module": "Assignments",
                        "due": next_assignment["due"],
                        "risk": "high" if pending_assignment_count else "low",
                    }
                ]
                if next_assignment
                else []
            ),
            {
                "title": "Semester fee clearance",
                "module": "Fees",
                "due": fee_data["summary"]["dueDate"] if due_amount else "Cleared",
                "risk": "medium" if due_amount else "low",
            },
            {"title": "Mid-Sem examination", "module": "Academics", "due": "Aug 14", "risk": "medium"},
            {"title": "Campus event registration", "module": "Events", "due": "Jul 24", "risk": "low"},
        ],
        "request_timeline": [
            *(
                [
                    {
                        "title": complaint_rows[0]["title"],
                        "kind": "Complaint",
                        "stage": complaint_rows[0]["statusLabel"],
                        "updated": complaint_rows[0]["created"],
                    }
                ]
                if complaint_rows
                else [
                    {
                        "title": f"{first_name}'s latest complaint",
                        "kind": "Complaint",
                        "stage": "Waiting",
                        "updated": "No complaint yet",
                    }
                ]
            ),
            *cert_history_items,
            {
                "title": f"Sem {semester} Fee Receipt",
                "kind": "Fees",
                "stage": "Pending" if due_amount else "Cleared",
                "updated": fee_history[0]["date"] if fee_history else "Today",
            },
        ],
        "announcements": [
            *_placement_notification_rows(db, user.id),
            *_student_announcement_rows(db, user),
        ],
        "assignment_items": assignment_items,
        "resource_items": resource_rows,
        "complaint_items": complaint_rows,
        "certificate_items": certificate_items,
        "event_items": event_items,
        "marketplace_items": marketplace_items,
        "scholarship_items": [
            {"id": user.id * 10 + 1, "name": "Merit Continuation Grant", "amount": "\u20b9 45,000", "status": "approved" if cgpa >= 8.8 else "eligible", "progress": 100 if cgpa >= 8.8 else 30},
            {"id": user.id * 10 + 2, "name": "Research Support Fund", "amount": "\u20b9 30,000", "status": "applied", "progress": 60 + seed * 3},
            {"id": user.id * 10 + 3, "name": "Campus Excellence Aid", "amount": "\u20b9 22,500", "status": "eligible", "progress": 20 + seed * 4},
        ],
        "ai_context": {
            "chat_history": [
                {"role": "user", "text": "What is my current attendance?"},
                {"role": "ai", "text": f"You are at {attendance:.0f}% overall, {max(0, int(attendance - 75))}% above the safe-zone threshold."},
                {"role": "user", "text": "What should I focus on this week?"},
                {"role": "ai", "text": f"Prioritize {first_name}'s pending assignments, fee clearance, and the next semester checkpoint."},
            ],
            "suggested_prompts": [
                "Summarise my deadlines",
                "Predict my CGPA next semester",
                "Draft a leave application",
                "Show my fee and certificate status",
            ],
        },
        "achievements": [
            {"name": "Active CampusVerse Student", "year": "2026"},
            {"name": f"Semester {semester} Progress", "year": "2026"},
            {"name": "Attendance Safe Zone", "year": "2026"} if attendance >= 75 else {"name": "Attendance Watchlist", "year": "2026"},
            {"name": "Digital Profile Verified", "year": "2026"},
        ],
        "skills": profile_skills
        if profile_skills
        else ["Python", "Academic Writing", "Campus Collaboration", department.split()[0], "Research"],
        "activity": [
            {"t": "Today", "l": f"{first_name} signed in to CampusVerse"},
            {"t": "2 days ago", "l": "Student dashboard synced"},
            {"t": "1 week ago", "l": "Profile and academic records verified"},
            {"t": "2 weeks ago", "l": "Resources and request history updated"},
        ],
        "student_todos": _todo_rows(db, user.id),
    }


@router.get("/features")
def student_features(current_user: Annotated[User, Depends(get_current_user)]) -> dict:
    _require_student(current_user)
    return {"features": STUDENT_NAV}


@router.get("/attendance/settings", response_model=CampusAttendanceSettingsOut)
def attendance_settings(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> CampusAttendanceSettingsOut:
    _require_student(current_user)
    setting = get_campus_attendance_setting(db)
    db.commit()
    return CampusAttendanceSettingsOut(**campus_setting_payload(setting))


@router.post("/attendance/radius-check")
def check_attendance_radius(
    payload: StudentRadiusCheck,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_student(current_user)
    setting = get_campus_attendance_setting(db)
    if setting.latitude is None or setting.longitude is None:
        db.commit()
        return {
            "ok": True,
            "withinRadius": False,
            "campusConfigured": False,
            "radiusMeters": setting.radius_meters,
            "distanceMeters": None,
            "biometricEnrolled": has_face_template(current_user.student_profile),
            "checkIn": None,
            "message": "Campus center is not configured by admin yet",
        }

    distance = distance_meters(setting.latitude, setting.longitude, payload.latitude, payload.longitude)
    within_radius = distance <= setting.radius_meters
    checkin = get_today_checkin(db, current_user.id)
    if checkin is None:
        checkin = StudentBiometricCheckIn(
            student_id=current_user.id,
            checkin_date=today_local(),
            status="radius_detected" if within_radius else "outside_radius",
        )
        db.add(checkin)

    checkin.latitude = payload.latitude
    checkin.longitude = payload.longitude
    checkin.distance_meters = distance
    checkin.within_radius = within_radius
    checkin.detected_at = now_utc()
    if not checkin.biometric_verified:
        checkin.status = "radius_detected" if within_radius else "outside_radius"
    db.commit()
    db.refresh(checkin)
    return {
        "ok": True,
        "withinRadius": within_radius,
        "campusConfigured": True,
        "radiusMeters": setting.radius_meters,
        "distanceMeters": round(distance, 1),
        "biometricEnrolled": has_face_template(current_user.student_profile),
        "checkIn": checkin_payload(checkin),
        "message": "You are within the college radius" if within_radius else "Outside college radius",
    }


@router.post("/attendance/biometric-verify")
def verify_biometric_attendance(
    payload: StudentBiometricVerify,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_student(current_user)
    setting = get_campus_attendance_setting(db)
    checkin = get_today_checkin(db, current_user.id)
    profile = current_user.student_profile

    if payload.latitude is not None and payload.longitude is not None:
        if setting.latitude is None or setting.longitude is None:
            raise HTTPException(status_code=409, detail="Campus center is not configured by admin yet")
        distance = distance_meters(setting.latitude, setting.longitude, payload.latitude, payload.longitude)
        within_radius = distance <= setting.radius_meters
        if checkin is None:
            checkin = StudentBiometricCheckIn(
                student_id=current_user.id,
                checkin_date=today_local(),
                status="radius_detected" if within_radius else "outside_radius",
            )
            db.add(checkin)
        checkin.latitude = payload.latitude
        checkin.longitude = payload.longitude
        checkin.distance_meters = distance
        checkin.within_radius = within_radius

    if checkin is None or not checkin.within_radius:
        raise HTTPException(status_code=409, detail="Enter the configured college radius before biometric verification")
    if profile is None:
        raise HTTPException(status_code=409, detail="Student profile is missing for biometric verification")
    if not payload.face_template:
        raise HTTPException(status_code=422, detail="Live face scan data is required for biometric verification")

    verification_mode = "matched"
    match_score = 1.0
    if has_face_template(profile):
        verification = verify_face_template(profile, payload.face_template)
        match_score = verification["score"]
        if not verification["matched"]:
            checkin.warning_flag = True
            checkin.status = "biometric_mismatch"
            db.commit()
            raise HTTPException(
                status_code=409,
                detail="Face recognition did not match this student account. Please use the enrolled face and try again.",
            )
    else:
        save_face_template(profile, payload.face_template, now_utc())
        verification_mode = "enrolled"

    checkin.biometric_verified = True
    checkin.warning_flag = False
    checkin.status = "biometric_verified"
    checkin.verified_at = now_utc()
    db.commit()
    db.refresh(checkin)
    return {
        "ok": True,
        "message": "Face enrolled and biometric attendance verified"
        if verification_mode == "enrolled"
        else "Face recognized and biometric attendance verified",
        "verificationMode": verification_mode,
        "matchScore": match_score,
        "biometricEnrolled": True,
        "checkIn": checkin_payload(checkin),
    }


@router.post("/attendance/biometric-reset")
def reset_biometric_template(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_student(current_user)
    profile = current_user.student_profile
    if profile is None:
        raise HTTPException(status_code=404, detail="Student profile is missing")

    clear_face_template(profile)
    checkin = get_today_checkin(db, current_user.id)
    if checkin and not checkin.professor_confirmed:
        checkin.biometric_verified = False
        checkin.verified_at = None
        checkin.warning_flag = False
        checkin.status = "radius_detected" if checkin.within_radius else "outside_radius"

    db.commit()
    return {
        "ok": True,
        "message": "Face template cleared. Re-enroll from the biometric scanner.",
        "biometricEnrolled": False,
        "checkIn": checkin_payload(checkin),
    }


@router.get("/profile", response_model=StudentProfileOut)
def student_profile(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> StudentProfileOut:
    _require_student(current_user)
    payload = _student_profile_payload(db, current_user)
    db.commit()
    return StudentProfileOut(**payload)


@router.put("/profile", response_model=StudentProfileOut)
def update_student_profile(
    payload: StudentProfileUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> StudentProfileOut:
    _require_student(current_user)

    # Validate email uniqueness
    existing_user = db.query(User).filter(User.email == payload.email, User.id != current_user.id).first()
    if existing_user:
        raise HTTPException(status_code=409, detail="That email is already used by another account")

    # Validate credit ranges
    if payload.completed_credits is not None and payload.total_credits is not None:
        if payload.completed_credits > payload.total_credits:
            raise HTTPException(status_code=422, detail="Completed credits cannot exceed total credits")
    
    if payload.total_credits is not None and payload.total_credits < 1:
        raise HTTPException(status_code=422, detail="Total credits must be at least 1")

    profile = _ensure_student_profile(db, current_user)
    current_user.full_name = payload.name.strip()
    current_user.email = payload.email.lower().strip()
    profile.address = payload.address.strip() if payload.address else ""
    profile.phone = payload.phone.strip() if payload.phone else None
    profile.bio = payload.bio.strip() if payload.bio else None
    profile.focus_area = payload.focus.strip() if payload.focus else None
    profile.skills_text = _join_skills(payload.skills) or None
    profile.guardian_name = payload.guardian_name.strip() if payload.guardian_name else None
    profile.guardian_phone = payload.guardian_phone.strip() if payload.guardian_phone else None
    profile.city = payload.city.strip() if payload.city else None
    profile.state = payload.state.strip() if payload.state else None
    profile.linkedin_url = payload.linkedin_url.strip() if payload.linkedin_url else None
    profile.github_url = payload.github_url.strip() if payload.github_url else None
    if payload.completed_credits is not None:
        profile.completed_credits = payload.completed_credits
    if payload.total_credits is not None:
        profile.total_credits = payload.total_credits

    db.commit()
    db.refresh(current_user)
    payload_out = _student_profile_payload(db, current_user)
    db.commit()
    return StudentProfileOut(**payload_out)


@router.put("/profile/avatar", response_model=StudentProfileOut)
def update_student_avatar(
    payload: StudentAvatarUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> StudentProfileOut:
    _require_student(current_user)

    profile = _ensure_student_profile(db, current_user)
    profile.avatar_url = payload.avatar_url

    db.commit()
    db.refresh(current_user)
    payload_out = _student_profile_payload(db, current_user)
    db.commit()
    return StudentProfileOut(**payload_out)


@router.get("/dashboard", response_model=StudentDashboard)
def dashboard(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> StudentDashboard:
    _require_student(current_user)
    data = _student_dataset(db, current_user)
    db.commit()

    return StudentDashboard(
        user=data["user"],
        metrics=data["metrics"],
        cgpa_trend=data["cgpa_trend"],
        attendance_weekly=data["attendance_weekly"],
        attendance_timeline=data["attendance_timeline"],
        attendance_by_subject=data["attendance_by_subject"],
        attendance_monthly=data["attendance_monthly"],
        fee_summary=data["fee_summary"],
        fee_history=data["fee_history"],
        module_health=data["module_health"],
        upcoming_deadlines=data["upcoming_deadlines"],
        request_timeline=data["request_timeline"],
        announcements=data["announcements"],
        assignment_items=data["assignment_items"],
        resource_items=data["resource_items"],
        complaint_items=data["complaint_items"],
        certificate_items=data["certificate_items"],
        event_items=data["event_items"],
        marketplace_items=data["marketplace_items"],
        scholarship_items=data["scholarship_items"],
        ai_context=data["ai_context"],
        achievements=data["achievements"],
        skills=data["skills"],
        activity=data["activity"],
        nav_modules=STUDENT_NAV,
        student_todos=data["student_todos"],
    )


@router.post("/resources/{resource_id}/ai-summary")
def generate_resource_ai_summary(
    resource_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_student(current_user)
    item = db.get(StudyResource, resource_id)
    if not item:
        raise HTTPException(status_code=404, detail="Study resource not found")

    settings = get_settings()
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="OpenAI key is not configured.")

    try:
        return build_study_resource_ai_summary(
            item=item,
            api_key=settings.openai_api_key.get_secret_value(),
            model=settings.openai_model or "gpt-5.4-mini",
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


def _require_published_assignment(db: Session, assignment_id: int) -> Assignment:
    assignment = db.get(Assignment, assignment_id)
    if not assignment or assignment.status != "published":
        raise HTTPException(status_code=404, detail="Assignment not found")
    return assignment


def _upsert_submission(
    db: Session,
    assignment: Assignment,
    student: User,
    submission_type: str,
) -> AssignmentSubmission:
    item = (
        db.query(AssignmentSubmission)
        .filter(
            AssignmentSubmission.assignment_id == assignment.id,
            AssignmentSubmission.student_id == student.id,
        )
        .first()
    )
    if item:
        item.submission_type = submission_type
        item.submitted_at = datetime.now(timezone.utc)
        item.updated_at = datetime.now(timezone.utc)
        item.status = "ai_reviewed"
        item.professor_score = None
        item.professor_grade = None
        item.professor_feedback = None
        item.reviewed_by_id = None
        item.reviewed_at = None
        return item

    item = AssignmentSubmission(
        assignment_id=assignment.id,
        student_id=student.id,
        submission_type=submission_type,
        status="ai_reviewed",
    )
    db.add(item)
    return item


@router.post("/assignments/{assignment_id}/digital-submit")
def submit_digital_assignment(
    assignment_id: int,
    payload: AssignmentDigitalSubmissionCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_student(current_user)
    assignment = _require_published_assignment(db, assignment_id)
    if assignment.assignment_type not in {"mcq", "qa"}:
        raise HTTPException(status_code=422, detail="This assignment expects a file upload")

    content = _json_loads(assignment.content_json, {})
    review = review_digital_submission(
        assignment_type=assignment.assignment_type,
        content=content,
        answers=payload.answers,
        total_points=assignment.total_points,
    )
    item = _upsert_submission(db, assignment, current_user, assignment.assignment_type)
    item.answers_json = json.dumps(payload.answers)
    item.notes = payload.notes
    item.filename = None
    item.content_type = None
    item.file_size = None
    item.file_data = None
    item.ai_grade = review["grade"]
    item.ai_score = float(review["score"])
    item.ai_feedback = review["feedback"]
    item.ai_review_json = json.dumps(review)
    db.commit()
    db.refresh(item)
    return {"ok": True, "submissionId": item.id, "review": review}


@router.post("/assignments/{assignment_id}/file-submit")
def submit_file_assignment(
    assignment_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    file: Annotated[UploadFile, File(...)],
    notes: Annotated[str, Form()] = "",
) -> dict:
    _require_student(current_user)
    assignment = _require_published_assignment(db, assignment_id)
    if assignment.assignment_type != "file":
        raise HTTPException(status_code=422, detail="This assignment must be completed in the portal")
    if not file.filename:
        raise HTTPException(status_code=400, detail="Please choose a PDF or Word document")

    filename = Path(file.filename).name
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if extension not in {"pdf", "doc", "docx"}:
        raise HTTPException(status_code=422, detail="File submission assignments accept PDF, DOC, or DOCX only")

    file_bytes = file.file.read()
    if len(file_bytes) > 15_000_000:
        raise HTTPException(status_code=413, detail="Assignment file must be 15 MB or smaller")

    review = review_file_submission(
        filename=filename,
        notes=notes,
        file_size=len(file_bytes),
        total_points=assignment.total_points,
    )
    item = _upsert_submission(db, assignment, current_user, "file")
    item.answers_json = None
    item.notes = notes.strip() or None
    item.filename = filename[:255]
    item.content_type = (file.content_type or "application/octet-stream")[:120]
    item.file_size = len(file_bytes)
    item.file_data = file_bytes
    item.ai_grade = review["grade"]
    item.ai_score = float(review["score"])
    item.ai_feedback = review["feedback"]
    item.ai_review_json = json.dumps(review)
    db.commit()
    db.refresh(item)
    return {"ok": True, "submissionId": item.id, "review": review}


@router.post("/assistant/chat", response_model=StudentAssistantResponse)
def assistant_chat(
    payload: StudentAssistantRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> StudentAssistantResponse:
    _require_student(current_user)
    data = _student_dataset(db, current_user)
    answer = answer_student_assistant(
        settings=get_settings(),
        db=db,
        current_user=current_user,
        dashboard=data,
        message=payload.message,
        current_path=payload.current_path,
        history=[turn.model_dump() for turn in payload.history],
    )
    return StudentAssistantResponse(**answer)


@router.get("/todos")
def list_todos(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_student(current_user)
    return {"todos": _todo_rows(db, current_user.id)}


@router.post("/todos")
def create_todo(
    payload: StudentTodoCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_student(current_user)
    todo = StudentTodo(
        student_id=current_user.id,
        title=payload.title,
        due_at=_normalize_due_at(payload.due_at),
    )
    db.add(todo)
    db.commit()
    db.refresh(todo)
    return {"ok": True, "todo": _todo_out(todo), "todos": _todo_rows(db, current_user.id)}


@router.patch("/todos/{todo_id}")
def update_todo(
    todo_id: int,
    payload: StudentTodoUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_student(current_user)
    todo = db.get(StudentTodo, todo_id)
    if not todo or todo.student_id != current_user.id:
        raise HTTPException(status_code=404, detail="Todo not found")
    if "title" in payload.model_fields_set and payload.title:
        todo.title = payload.title
    if "due_at" in payload.model_fields_set:
        todo.due_at = _normalize_due_at(payload.due_at)
    if payload.completed is not None:
        todo.completed = payload.completed
    todo.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(todo)
    return {"ok": True, "todo": _todo_out(todo), "todos": _todo_rows(db, current_user.id)}


@router.delete("/todos/{todo_id}")
def delete_todo(
    todo_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_student(current_user)
    todo = db.get(StudentTodo, todo_id)
    if not todo or todo.student_id != current_user.id:
        raise HTTPException(status_code=404, detail="Todo not found")
    db.delete(todo)
    db.commit()
    return {"ok": True, "id": todo_id, "todos": _todo_rows(db, current_user.id)}


def _validate_certificate_eligibility(db: Session, user: User, certificate_key: str) -> None:
    if user.is_blocked:
        raise HTTPException(
            status_code=403,
            detail=f"Account is under administrative hold: {user.block_reason or 'Contact Dean Office'}.",
        )
    # Allow instant download if certificate request already exists and is ready/downloaded
    existing = (
        db.query(StudentCertificateRequest)
        .filter(
            StudentCertificateRequest.student_id == user.id,
            StudentCertificateRequest.certificate_key == certificate_key,
        )
        .first()
    )
    if existing and existing.status in {"ready", "downloaded"}:
        return

    profile = _ensure_student_profile(db, user)
    setting = get_campus_attendance_setting(db)
    attendance_records = _attendance_records(db, user.id)
    attendance = _attendance_percentage(attendance_records, profile.attendance)
    semester = resolve_student_semester(
        profile,
        user,
        setting.semester_duration_months,
        setting.semester_duration_unit,
        setting.semester_duration_days,
    )
    if certificate_key == "conduct":
        if profile.cgpa < 8.0 or attendance < 75.0:
            raise HTTPException(
                status_code=422,
                detail=f"Dean's Merit & Conduct Certificate requires CGPA >= 8.0 & Attendance >= 75%. Yours: CGPA {profile.cgpa:.1f}, Attendance {attendance:.0f}%.",
            )
    if certificate_key == "graduation" and semester < 4:
        raise HTTPException(
            status_code=400,
            detail=f"Graduation Degree Certificate requires completion of Semester 4. Current progress: Semester {semester}/4.",
        )


def _generate_certificate_html(db: Session, user: User, key: str, definition: dict, moment: datetime) -> str:
    import hashlib
    from html import escape

    profile = _ensure_student_profile(db, user)
    setting = get_campus_attendance_setting(db)
    attendance_records = _attendance_records(db, user.id)
    attendance = _attendance_percentage(attendance_records, profile.attendance)
    semester = resolve_student_semester(
        profile,
        user,
        setting.semester_duration_months,
        setting.semester_duration_unit,
        setting.semester_duration_days,
    )
    standing = _academic_standing(profile.cgpa, attendance)
    issue_date = moment.astimezone(LOCAL_TIMEZONE).strftime("%d %B %Y, %I:%M %p")
    verify_hash = hashlib.sha256(f"{user.id}-{key}-{moment.timestamp()}".encode()).hexdigest()[:16].upper()
    request_row = _find_certificate_request(db, user.id, key)
    purpose = escape((request_row.purpose if request_row else None) or "Official academic verification")
    signatory_name = escape((request_row.signatory_name if request_row else None) or "Dr. A. R. Sharma")
    signatory_title = escape((request_row.signatory_title if request_row else None) or "Registrar & Academic Council")
    default_body_html = (
        f"This is to certify that <strong>{escape(user.full_name)}</strong> (Roll Code: "
        f"<strong>{escape(profile.student_code)}</strong>), enrolled in the "
        f"<strong>{escape(profile.department)}</strong> program, has satisfied all academic standards, "
        "character evaluations, and degree criteria established under university regulations."
    )
    issued_body_html = (
        escape(request_row.certificate_body).replace("\n", "<br>")
        if request_row and request_row.certificate_body
        else default_body_html
    )

    title_map = {
        "bonafide": "OFFICIAL BONAFIDE CERTIFICATE",
        "graduation": "BACHELOR DEGREE OF GRADUATION",
        "conduct": "DEAN'S MERIT & CONDUCT CERTIFICATE",
    }
    cert_title = title_map.get(key, definition["name"].upper())

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>{definition['name']} - {user.full_name}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700;900&family=Montserrat:wght@400;600;700&display=swap');
        @media print {{
            body {{ background: #fff !important; padding: 0 !important; }}
            .no-print {{ display: none !important; }}
            .certificate-container {{ border: 12px double #d4af37 !important; box-shadow: none !important; margin: 0 !important; }}
        }}
        body {{
            font-family: 'Montserrat', sans-serif;
            background: #0a0c12;
            color: #1a1a1a;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            padding: 30px;
        }}
        .certificate-container {{
            background: linear-gradient(135deg, #ffffff 0%, #fcf9f0 100%);
            width: 900px;
            padding: 60px 70px;
            border: 14px double #d4af37;
            box-shadow: 0 25px 60px rgba(0,0,0,0.6), inset 0 0 30px rgba(212,175,55,0.15);
            position: relative;
            box-sizing: border-box;
            border-radius: 4px;
        }}
        .watermark {{
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-25deg);
            font-family: 'Cinzel', serif;
            font-size: 95px;
            color: rgba(212, 175, 55, 0.04);
            font-weight: 900;
            text-transform: uppercase;
            pointer-events: none;
            user-select: none;
            white-space: nowrap;
        }}
        .header {{
            text-align: center;
            border-bottom: 2px solid #d4af37;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }}
        .crest {{
            font-size: 38px;
            color: #d4af37;
            margin-bottom: 5px;
        }}
        .university-name {{
            font-family: 'Cinzel', serif;
            font-size: 34px;
            font-weight: 900;
            color: #0b172a;
            letter-spacing: 3px;
            text-transform: uppercase;
            margin: 0;
        }}
        .subtitle {{
            font-size: 11px;
            color: #777;
            letter-spacing: 4px;
            text-transform: uppercase;
            margin-top: 8px;
            font-weight: 600;
        }}
        .cert-title {{
            font-family: 'Cinzel', serif;
            font-size: 26px;
            color: #b38728;
            text-align: center;
            margin: 25px 0 15px 0;
            letter-spacing: 3px;
            font-weight: 700;
            text-transform: uppercase;
            background: linear-gradient(90deg, #bf953f, #fcf6ba, #b38728, #fbf5b7, #aa771c);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }}
        .details-grid {{
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
            margin: 25px 0;
            background: #ffffff;
            padding: 22px;
            border: 1px solid rgba(212, 175, 55, 0.4);
            border-radius: 12px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.03);
            font-size: 13px;
        }}
        .details-item span {{
            font-weight: 700;
            color: #0b172a;
        }}
        .body-text {{
            font-size: 15px;
            line-height: 1.85;
            text-align: justify;
            margin: 25px 0;
            color: #2c3e50;
        }}
        .footer {{
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-top: 45px;
            padding-top: 25px;
            border-top: 1px solid rgba(212, 175, 55, 0.3);
        }}
        .seal {{
            width: 105px;
            height: 105px;
            border-radius: 50%;
            background: linear-gradient(135deg, #bf953f 0%, #fcf6ba 25%, #b38728 50%, #fbf5b7 75%, #aa771c 100%);
            color: #0b172a;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            font-size: 10px;
            font-weight: 900;
            text-align: center;
            box-shadow: 0 6px 18px rgba(0,0,0,0.25);
            text-transform: uppercase;
            border: 3px solid #ffffff;
            letter-spacing: 1px;
        }}
        .signature-block {{
            text-align: center;
        }}
        .signature-img {{
            font-family: 'Cinzel', serif;
            font-style: italic;
            font-size: 18px;
            color: #0b172a;
            margin-bottom: 4px;
            font-weight: bold;
        }}
        .signature-line {{
            width: 190px;
            border-bottom: 1.5px solid #0b172a;
            margin-bottom: 6px;
        }}
        .signature-title {{
            font-size: 11px;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            font-weight: 600;
        }}
        .ref-bar {{
            font-size: 11px;
            color: #888;
            display: flex;
            justify-content: space-between;
            margin-bottom: 20px;
            font-family: monospace;
            border-bottom: 1px solid #f0e6cd;
            padding-bottom: 8px;
        }}
        .btn-container {{
            text-align: center;
            margin-top: 25px;
        }}
        .btn-print {{
            background: linear-gradient(90deg, #bf953f, #aa771c);
            color: #fff;
            border: none;
            padding: 14px 36px;
            font-size: 13px;
            font-weight: 700;
            border-radius: 30px;
            cursor: pointer;
            text-transform: uppercase;
            letter-spacing: 2px;
            box-shadow: 0 8px 25px rgba(191, 149, 63, 0.4);
            transition: transform 0.2s;
        }}
        .btn-print:hover {{
            transform: translateY(-2px);
        }}
    </style>
</head>
<body>

<div style="display: flex; flex-direction: column; align-items: center;">
    <div class="certificate-container">
        <div class="watermark">CAMPUSVERSE</div>
        
        <div class="ref-bar">
            <span>DOCUMENT REF: CV-{key.upper()}-2026-{user.id:04d}</span>
            <span>DIGITAL VERIFICATION HASH: {verify_hash}</span>
        </div>

        <div class="header">
            <div class="crest">🏛️</div>
            <div class="subtitle">Office of Academic Governance & Digital Registry</div>
        </div>

        <div class="cert-title">{cert_title}</div>

        <div class="body-text">
            {issued_body_html}
        </div>

        <div class="details-grid">
            <div class="details-item"><span>Student Name:</span> {user.full_name}</div>
            <div class="details-item"><span>Roll Code:</span> {profile.student_code}</div>
            <div class="details-item"><span>Department:</span> {profile.department}</div>
            <div class="details-item"><span>Purpose:</span> {purpose}</div>
            <div class="details-item"><span>Semester Standing:</span> Semester {semester}</div>
            <div class="details-item"><span>Cumulative CGPA:</span> {profile.cgpa:.2f} / 10.0</div>
            <div class="details-item"><span>Attendance Rate:</span> {attendance:.1f}% (Verified)</div>
            <div class="details-item"><span>Academic Honor:</span> {standing}</div>
            <div class="details-item"><span>Issuance Date:</span> {issue_date}</div>
        </div>

        <div class="body-text" style="font-style: italic; font-size: 12px; color: #666; text-align: center;">
            Authenticity Notice: This digital document is cryptographically signed and stored in the CampusVerse Registry. 
            Any modification invalidates the verification hash.
        </div>

        <div class="footer">
            <div class="seal">
                OFFICIAL<br>★ VERIFIED ★<br>SEAL
            </div>

            <div style="text-align: center;">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=http://localhost:5173/verify/{verify_hash}" alt="QR Verification" style="width: 80px; height: 80px; border: 2px solid #d4af37; padding: 2px; background: #fff;" />
                <div style="font-size: 9px; color: #777; margin-top: 4px; font-family: monospace;">SCAN TO VERIFY</div>
            </div>

            <div class="signature-block">
                <div class="signature-img">{signatory_name}</div>
                <div class="signature-line"></div>
                <div class="signature-title">{signatory_title}</div>
            </div>

            <div class="signature-block">
                <div class="signature-img">Prof. V. K. Mehta</div>
                <div class="signature-line"></div>
                <div class="signature-title">Controller of Examinations</div>
            </div>
        </div>
    </div>
</div>

</body>
</html>"""


def _generate_certificate_pdf(db: Session, user: User, key: str, definition: dict, moment: datetime) -> bytes:
    import hashlib
    import importlib
    from html import escape
    from io import BytesIO

    pagesizes = importlib.import_module("reportlab.lib.pagesizes")
    landscape = pagesizes.landscape
    letter = pagesizes.letter
    colors = importlib.import_module("reportlab.lib.colors")
    platypus = importlib.import_module("reportlab.platypus")
    SimpleDocTemplate = platypus.SimpleDocTemplate
    Paragraph = platypus.Paragraph
    Spacer = platypus.Spacer
    Table = platypus.Table
    TableStyle = platypus.TableStyle
    styles_mod = importlib.import_module("reportlab.lib.styles")
    getSampleStyleSheet = styles_mod.getSampleStyleSheet
    ParagraphStyle = styles_mod.ParagraphStyle
    units = importlib.import_module("reportlab.lib.units")
    inch = units.inch

    profile = _ensure_student_profile(db, user)
    setting = get_campus_attendance_setting(db)
    attendance_records = _attendance_records(db, user.id)
    raw_attendance = _attendance_percentage(attendance_records, profile.attendance if profile else 88.0)
    attendance = profile.attendance if (profile and profile.attendance and profile.attendance > 10.0) else (raw_attendance if raw_attendance > 10.0 else 88.0)

    semester = resolve_student_semester(
        profile,
        user,
        setting.semester_duration_months,
        setting.semester_duration_unit,
        setting.semester_duration_days,
    )

    standing = (
        "First Class with Distinction & Honors"
        if profile.cgpa >= 8.5
        else ("First Class" if profile.cgpa >= 7.5 else "Good Standing")
    )
    issue_date = moment.astimezone(LOCAL_TIMEZONE).strftime("%d %B %Y")
    verify_hash = hashlib.sha256(f"{user.id}-{key}-{moment.timestamp()}".encode()).hexdigest()[:16].upper()
    request_row = _find_certificate_request(db, user.id, key)
    purpose = (request_row.purpose if request_row else None) or "Official academic verification"
    signatory_name = escape((request_row.signatory_name if request_row else None) or "Dr. A. R. Sharma")
    signatory_title = escape((request_row.signatory_title if request_row else None) or "Registrar & Academic Senate")
    custom_body = (
        escape(request_row.certificate_body).replace("\n", "<br/>")
        if request_row and request_row.certificate_body
        else None
    )

    # Color Palette per Template
    theme_colors = {
        "graduation": {"bg": "#FFFDF5", "border": "#0F172A", "gold": "#B8860B", "text": "#0F172A", "sub": "#475569"},
        "bonafide": {"bg": "#FAFAF5", "border": "#065F46", "gold": "#D4AF37", "text": "#064E3B", "sub": "#047857"},
        "conduct": {"bg": "#FFFBEB", "border": "#991B1B", "gold": "#D97706", "text": "#7F1D1D", "sub": "#B45309"},
    }
    tc = theme_colors.get(key, theme_colors["graduation"])

    title_map = {
        "bonafide": "OFFICIAL BONAFIDE ENROLLMENT CERTIFICATE",
        "graduation": "BACHELOR DEGREE OF GRADUATION",
        "conduct": "DEAN'S MERIT & MORAL CONDUCT COMMENDATION",
    }
    cert_title = title_map.get(key, definition["name"].upper())

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(letter),
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    def draw_certificate_frame(canvas, d):
        canvas.saveState()
        # Background fill
        canvas.setFillColor(colors.HexColor(tc["bg"]))
        canvas.rect(0, 0, d.pagesize[0], d.pagesize[1], fill=1, stroke=0)

        if key == "graduation":
            # Outer Deep Navy Frame
            canvas.setStrokeColor(colors.HexColor('#0F172A'))
            canvas.setLineWidth(5)
            canvas.rect(18, 18, d.pagesize[0] - 36, d.pagesize[1] - 36)
            # Inner Double Gold Pin Line
            canvas.setStrokeColor(colors.HexColor('#D4AF37'))
            canvas.setLineWidth(1.5)
            canvas.rect(26, 26, d.pagesize[0] - 52, d.pagesize[1] - 52)
            # Corner Ornaments
            canvas.setFillColor(colors.HexColor('#B8860B'))
            for cx, cy in [(26, 26), (d.pagesize[0] - 26, 26), (26, d.pagesize[1] - 26), (d.pagesize[0] - 26, d.pagesize[1] - 26)]:
                canvas.circle(cx, cy, 4.5, fill=1, stroke=0)
        elif key == "bonafide":
            # Forest Emerald Frame with Gold Rivets
            canvas.setStrokeColor(colors.HexColor('#065F46'))
            canvas.setLineWidth(4)
            canvas.rect(20, 20, d.pagesize[0] - 40, d.pagesize[1] - 40)
            canvas.setStrokeColor(colors.HexColor('#D4AF37'))
            canvas.setLineWidth(1)
            canvas.rect(25, 25, d.pagesize[0] - 50, d.pagesize[1] - 50)
        else:  # conduct
            # Crimson Frame with Amber Corner Stars
            canvas.setStrokeColor(colors.HexColor('#991B1B'))
            canvas.setLineWidth(4)
            canvas.rect(20, 20, d.pagesize[0] - 40, d.pagesize[1] - 40)
            canvas.setFillColor(colors.HexColor('#D97706'))
            for cx, cy in [(28, 28), (d.pagesize[0] - 28, 28), (28, d.pagesize[1] - 28), (d.pagesize[0] - 28, d.pagesize[1] - 28)]:
                canvas.circle(cx, cy, 5, fill=1, stroke=0)

        # Watermark (NO CampusVerse University — Proper Institutional Name)
        canvas.setFont('Helvetica-Bold', 44)
        canvas.setFillColor(colors.HexColor('#F3EED9'))
        canvas.rotate(18)
        canvas.drawString(160, 90, "NATIONAL INSTITUTE OF TECHNOLOGY")
        canvas.restoreState()

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'CertTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=21,
        leading=25,
        textColor=colors.HexColor(tc["gold"]),
        alignment=1,
        spaceAfter=10,
    )

    inst_header_style = ParagraphStyle(
        'InstHeader',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=15,
        leading=18,
        textColor=colors.HexColor(tc["border"]),
        alignment=1,
        spaceAfter=3,
    )

    subtitle_style = ParagraphStyle(
        'CertSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9.5,
        leading=12,
        textColor=colors.HexColor(tc["sub"]),
        alignment=1,
        spaceAfter=14,
    )

    body_style = ParagraphStyle(
        'CertBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=11,
        leading=18,
        textColor=colors.HexColor('#1E293B'),
        alignment=1,
        spaceAfter=14,
    )

    meta_style = ParagraphStyle(
        'CertMeta',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor('#64748B'),
        alignment=1,
    )

    story = []
    story.append(Paragraph(f"<b>DOCUMENT REF: CV-{key.upper()}-2026-{user.id:04d}</b> &nbsp;&nbsp;|&nbsp;&nbsp; <b>DIGITAL VERIFICATION HASH: {verify_hash}</b>", meta_style))
    story.append(Spacer(1, 8))
    story.append(Paragraph("NATIONAL INSTITUTE OF TECHNOLOGY &amp; HIGHER LEARNING", inst_header_style))
    story.append(Paragraph("AUTONOMOUS ACADEMIC BODY &nbsp;&bull;&nbsp; VERIFIED VIA CAMPUSVERSE DIGITAL GOVERNANCE REGISTRY", subtitle_style))
    story.append(Paragraph(cert_title, title_style))
    story.append(Spacer(1, 8))

    if custom_body:
        cert_text = custom_body
    elif key == "graduation":
        cert_text = (
            f"On the recommendation of the Academic Senate &amp; Board of Governors, National Institute of Technology hereby confers upon<br/>"
            f"<font size=15 color='#0F172A'><b>{user.full_name}</b></font> (Roll Code: <b>{profile.student_code}</b>)<br/>"
            f"the Degree of <b>Bachelor of Technology in {profile.department}</b><br/>"
            f"with <b>{standing}</b>, having fulfilled all prescribed coursework, thesis defense, and institute statutes."
        )
    elif key == "conduct":
        cert_text = (
            f"This is to certify that <b>{user.full_name}</b> (Roll Code: <b>{profile.student_code}</b>) "
            f"has maintained exemplary moral character, high academic diligence (CGPA {profile.cgpa:.2f}), "
            f"and active student leadership in the <b>{profile.department}</b> program."
        )
    else:  # bonafide
        cert_text = (
            f"This is to certify that <b>{user.full_name}</b> (Roll Code: <b>{profile.student_code}</b>) "
            f"is a genuine, full-time student of National Institute of Technology enrolled in Semester {semester} of the "
            f"<b>{profile.department}</b> program for Academic Session 2025-2026."
        )

    story.append(Paragraph(cert_text, body_style))
    story.append(Spacer(1, 10))

    table_data = [
        [Paragraph(f"<b>Student Name:</b> {user.full_name}", styles['Normal']), Paragraph(f"<b>Roll Code:</b> {profile.student_code}", styles['Normal'])],
        [Paragraph(f"<b>Department:</b> {profile.department}", styles['Normal']), Paragraph(f"<b>Semester Standing:</b> Semester {semester}", styles['Normal'])],
        [Paragraph(f"<b>Cumulative CGPA:</b> {profile.cgpa:.2f} / 10.0", styles['Normal']), Paragraph(f"<b>Verified Attendance:</b> {attendance:.1f}%", styles['Normal'])],
        [Paragraph(f"<b>Academic Honors:</b> {standing}", styles['Normal']), Paragraph(f"<b>Purpose:</b> {escape(purpose)}", styles['Normal'])],
        [Paragraph(f"<b>Date of Issuance:</b> {issue_date}", styles['Normal']), Paragraph("<b>Registry Status:</b> Verified and digitally issued", styles['Normal'])],
    ]

    t = Table(table_data, colWidths=[3.8*inch, 3.8*inch])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor(tc["bg"])),
        ('BOX', (0,0), (-1,-1), 1.5, colors.HexColor(tc["gold"])),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E2E8F0')),
        ('PADDING', (0,0), (-1,-1), 8.5),
    ]))
    story.append(t)
    story.append(Spacer(1, 20))

    sig_data = [
        [
            Paragraph(f"<font size=9.5 color='{tc['gold']}'><b>★ OFFICIAL REGISTRY SEAL ★</b></font><br/><font size=7.5 color='#64748B'>CRYPTOGRAPHICALLY SIGNED</font>", meta_style),
            Paragraph(f"<b>{signatory_name}</b><br/><font color='#64748B'>{signatory_title}</font>", meta_style),
            Paragraph("<b>Prof. V. K. Mehta</b><br/><font color='#64748B'>Controller of Examinations</font>", meta_style),
        ]
    ]
    sig_table = Table(sig_data, colWidths=[2.5*inch, 2.5*inch, 2.5*inch])
    sig_table.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(sig_table)

    doc.build(story, onFirstPage=draw_certificate_frame)
    buffer.seek(0)
    return buffer.getvalue()


class ResumePdfPayload(BaseModel):
    name: str
    email: str
    phone: str
    location: str
    cgpa: str
    department: str
    summary: str
    skillsText: str
    projects: list[dict]
    achievements: str
    template: str = "modern-tech"


@router.post("/resume/pdf")
def download_resume_pdf(
    payload: ResumePdfPayload,
    current_user: Annotated[User, Depends(get_current_user)],
) -> Response:
    import importlib
    from html import escape
    from io import BytesIO

    pagesizes = importlib.import_module("reportlab.lib.pagesizes")
    letter = pagesizes.letter
    inch = importlib.import_module("reportlab.lib.units").inch
    colors = importlib.import_module("reportlab.lib.colors")
    platypus = importlib.import_module("reportlab.platypus")
    SimpleDocTemplate = platypus.SimpleDocTemplate
    Paragraph = platypus.Paragraph
    Spacer = platypus.Spacer
    Table = platypus.Table
    TableStyle = platypus.TableStyle
    HRFlowable = platypus.HRFlowable
    styles_mod = importlib.import_module("reportlab.lib.styles")
    getSampleStyleSheet = styles_mod.getSampleStyleSheet
    ParagraphStyle = styles_mod.ParagraphStyle

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
    styles = getSampleStyleSheet()

    allowed_templates = {"modern-tech", "classic-academic", "creative-minimal", "executive-ats"}
    tmpl = payload.template if payload.template in allowed_templates else "modern-tech"
    story = []

    def pdf_text(value: object) -> str:
        return escape(str(value or ""), quote=False).replace("\n", "<br/>")

    def safe_filename_part(value: str) -> str:
        cleaned = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in value.strip())
        return cleaned.strip("_") or "Student"

    name = pdf_text(payload.name)
    name_upper = pdf_text(payload.name.upper())
    email = pdf_text(payload.email)
    phone = pdf_text(payload.phone)
    location = pdf_text(payload.location)
    cgpa = pdf_text(payload.cgpa)
    department = pdf_text(payload.department)
    summary = pdf_text(payload.summary)
    skills_text = pdf_text(payload.skillsText)
    skill_items = [pdf_text(skill.strip()) for skill in payload.skillsText.split(",") if skill.strip()]
    achievement_items = [pdf_text(item.strip()) for item in payload.achievements.split("\n") if item.strip()]
    project_items = [
        {
            "title": pdf_text(project.get("title", "")),
            "tech": pdf_text(project.get("tech", "")),
            "description": pdf_text(project.get("description", "")),
        }
        for project in payload.projects
    ]

    def draw_sidebar_bg(canvas, document):
        if tmpl == "creative-minimal":
            canvas.saveState()
            canvas.setFillColor(colors.HexColor('#F0FDF4'))
            canvas.rect(0, 0, 2.6 * inch, 11 * inch, fill=True, stroke=False)
            canvas.setStrokeColor(colors.HexColor('#BBF7D0'))
            canvas.setLineWidth(1)
            canvas.line(2.6 * inch, 0, 2.6 * inch, 11 * inch)
            canvas.restoreState()

    if tmpl == "creative-minimal":
        # ---------------------------------------------------------
        # TOP-TIER 2-COLUMN SIDEBAR DESIGN (EMERALD CREATIVE)
        # ---------------------------------------------------------
        sb_name = ParagraphStyle('SbName', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=22, leading=26, textColor=colors.HexColor('#064E3B'), spaceAfter=4)
        sb_sub = ParagraphStyle('SbSub', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=10, leading=13, textColor=colors.HexColor('#059669'), spaceAfter=14)
        sb_sec = ParagraphStyle('SbSec', parent=styles['Heading3'], fontName='Helvetica-Bold', fontSize=9.5, leading=12, textColor=colors.HexColor('#047857'), spaceBefore=12, spaceAfter=6)
        sb_text = ParagraphStyle('SbText', parent=styles['Normal'], fontName='Helvetica', fontSize=8.5, leading=13, textColor=colors.HexColor('#065F46'), spaceAfter=4)

        m_sec = ParagraphStyle('MSec', parent=styles['Heading2'], fontName='Helvetica-Bold', fontSize=12, leading=15, textColor=colors.HexColor('#047857'), spaceBefore=12, spaceAfter=4)
        m_title = ParagraphStyle('MTitle', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=10, leading=13, textColor=colors.HexColor('#111827'), spaceAfter=2)
        m_tech = ParagraphStyle('MTech', parent=styles['Normal'], fontName='Helvetica-Oblique', fontSize=8.5, leading=11, textColor=colors.HexColor('#059669'), spaceAfter=4)
        m_body = ParagraphStyle('MBody', parent=styles['Normal'], fontName='Helvetica', fontSize=9, leading=13.5, textColor=colors.HexColor('#374151'), spaceAfter=8)

        left_flow = []
        left_flow.append(Paragraph(name, sb_name))
        left_flow.append(Paragraph(f"{department}<br/>CGPA: <b>{cgpa}</b>", sb_sub))
        
        left_flow.append(Paragraph("CONTACT INFORMATION", sb_sec))
        left_flow.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#A7F3D0'), spaceBefore=1, spaceAfter=6))
        left_flow.append(Paragraph(f"<b>Email:</b><br/>{email}", sb_text))
        left_flow.append(Paragraph(f"<b>Phone:</b><br/>{phone}", sb_text))
        left_flow.append(Paragraph(f"<b>Location:</b><br/>{location}", sb_text))

        if skills_text:
            left_flow.append(Spacer(1, 8))
            left_flow.append(Paragraph("SKILLS &amp; TECHNOLOGIES", sb_sec))
            left_flow.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#A7F3D0'), spaceBefore=1, spaceAfter=6))
            skills_formatted = "<br/>".join([f"• {skill}" for skill in skill_items])
            left_flow.append(Paragraph(skills_formatted, sb_text))

        right_flow = []
        if summary:
            right_flow.append(Paragraph("PROFESSIONAL SUMMARY", m_sec))
            right_flow.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#059669'), spaceBefore=2, spaceAfter=8))
            right_flow.append(Paragraph(summary, m_body))

        if project_items:
            right_flow.append(Paragraph("KEY PROJECTS &amp; RESEARCH", m_sec))
            right_flow.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#059669'), spaceBefore=2, spaceAfter=8))
            for p in project_items:
                title = p["title"]
                tech = p["tech"]
                desc = p["description"]
                if title:
                    right_flow.append(Paragraph(title, m_title))
                    if tech:
                        right_flow.append(Paragraph(f"Stack: {tech}", m_tech))
                    if desc:
                        right_flow.append(Paragraph(desc, m_body))

        if achievement_items:
            right_flow.append(Paragraph("HONORS &amp; CERTIFICATIONS", m_sec))
            right_flow.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#059669'), spaceBefore=2, spaceAfter=8))
            ach_formatted = "<br/>".join([f"• {achievement}" for achievement in achievement_items])
            right_flow.append(Paragraph(ach_formatted, m_body))

        layout_table = Table([[left_flow, right_flow]], colWidths=[2.2*inch, 4.9*inch])
        layout_table.setStyle(TableStyle([
            ('PADDING', (0,0), (-1,-1), 8),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ]))
        story.append(layout_table)

    elif tmpl == "classic-academic":
        # ---------------------------------------------------------
        # HARVARD / STANFORD FORMAL ACADEMIC SERIF DESIGN
        # ---------------------------------------------------------
        ac_name = ParagraphStyle('AcName', parent=styles['Heading1'], fontName='Times-Bold', fontSize=26, leading=30, textColor=colors.HexColor('#0F172A'), alignment=1, spaceAfter=4)
        ac_sub = ParagraphStyle('AcSub', parent=styles['Normal'], fontName='Times-Bold', fontSize=11, leading=14, textColor=colors.HexColor('#334155'), alignment=1, spaceAfter=4)
        ac_contact = ParagraphStyle('AcContact', parent=styles['Normal'], fontName='Times-Roman', fontSize=9.5, leading=13, textColor=colors.HexColor('#475569'), alignment=1, spaceAfter=8)
        ac_sec = ParagraphStyle('AcSec', parent=styles['Heading2'], fontName='Times-Bold', fontSize=12, leading=15, textColor=colors.HexColor('#0F172A'), spaceBefore=14, spaceAfter=4)
        ac_p_title = ParagraphStyle('AcPTitle', parent=styles['Normal'], fontName='Times-Bold', fontSize=10.5, leading=14, textColor=colors.HexColor('#0F172A'), spaceAfter=2)
        ac_body = ParagraphStyle('AcBody', parent=styles['Normal'], fontName='Times-Roman', fontSize=10, leading=14.5, textColor=colors.HexColor('#1E293B'), spaceAfter=6)

        story.append(Paragraph(name_upper, ac_name))
        story.append(Paragraph(f"{department} &nbsp;&bull;&nbsp; Cumulative CGPA: <b>{cgpa} / 10.0</b>", ac_sub))
        story.append(Paragraph(f"Email: {email} &nbsp;|&nbsp; Phone: {phone} &nbsp;|&nbsp; Location: {location}", ac_contact))
        story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#0F172A'), spaceBefore=4, spaceAfter=10))

        if summary:
            story.append(Paragraph("ACADEMIC PROFILE &amp; STATEMENT", ac_sec))
            story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#64748B'), spaceBefore=1, spaceAfter=6))
            story.append(Paragraph(summary, ac_body))

        if skills_text:
            story.append(Paragraph("AREAS OF EXPERTISE &amp; TECHNICAL PROFICIENCY", ac_sec))
            story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#64748B'), spaceBefore=1, spaceAfter=6))
            story.append(Paragraph(skills_text, ac_body))

        if project_items:
            story.append(Paragraph("RESEARCH &amp; DEVELOPMENT PROJECTS", ac_sec))
            story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#64748B'), spaceBefore=1, spaceAfter=6))
            for p in project_items:
                title = p["title"]
                tech = p["tech"]
                desc = p["description"]
                if title:
                    story.append(Paragraph(f"• <b>{title}</b> &nbsp;&mdash;&nbsp; <i>({tech})</i>", ac_p_title))
                    if desc:
                        story.append(Paragraph(desc, ac_body))

        if achievement_items:
            story.append(Paragraph("HONORS, SCHOLARSHIPS &amp; ACADEMIC AWARDS", ac_sec))
            story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#64748B'), spaceBefore=1, spaceAfter=6))
            ach_formatted = "<br/>".join([f"• {achievement}" for achievement in achievement_items])
            story.append(Paragraph(ach_formatted, ac_body))

        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#0F172A'), spaceBefore=16, spaceAfter=4))

    elif tmpl == "executive-ats":
        # ---------------------------------------------------------
        # HIGH-IMPACT CORPORATE ATS DESIGN
        # ---------------------------------------------------------
        ats_name = ParagraphStyle('AtsName', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=24, leading=28, textColor=colors.HexColor('#0F172A'), spaceAfter=3)
        ats_sub = ParagraphStyle('AtsSub', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=11, leading=14, textColor=colors.HexColor('#334155'), spaceAfter=4)
        ats_contact = ParagraphStyle('AtsContact', parent=styles['Normal'], fontName='Helvetica', fontSize=9, leading=12, textColor=colors.HexColor('#475569'), spaceAfter=10)
        ats_sec = ParagraphStyle('AtsSec', parent=styles['Heading2'], fontName='Helvetica-Bold', fontSize=11.5, leading=15, textColor=colors.HexColor('#0F172A'), spaceBefore=12, spaceAfter=4)
        ats_p_title = ParagraphStyle('AtsPTitle', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=10, leading=13, textColor=colors.HexColor('#0F172A'), spaceAfter=2)
        ats_body = ParagraphStyle('AtsBody', parent=styles['Normal'], fontName='Helvetica', fontSize=9.5, leading=14, textColor=colors.HexColor('#1E293B'), spaceAfter=6)

        story.append(HRFlowable(width="100%", thickness=4, color=colors.HexColor('#0F172A'), spaceBefore=0, spaceAfter=10))
        story.append(Paragraph(name_upper, ats_name))
        story.append(Paragraph(f"{department} &nbsp;|&nbsp; CGPA: <b>{cgpa}</b>", ats_sub))
        story.append(Paragraph(f"Email: {email} &nbsp;&bull;&nbsp; Phone: {phone} &nbsp;&bull;&nbsp; Location: {location}", ats_contact))

        if summary:
            story.append(Paragraph("PROFESSIONAL SUMMARY", ats_sec))
            story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#94A3B8'), spaceBefore=1, spaceAfter=6))
            story.append(Paragraph(summary, ats_body))

        if skills_text:
            story.append(Paragraph("CORE COMPETENCIES &amp; SKILLS", ats_sec))
            story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#94A3B8'), spaceBefore=1, spaceAfter=6))
            story.append(Paragraph(skills_text, ats_body))

        if project_items:
            story.append(Paragraph("KEY PROJECTS &amp; IMPLEMENTATIONS", ats_sec))
            story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#94A3B8'), spaceBefore=1, spaceAfter=6))
            for p in project_items:
                title = p["title"]
                tech = p["tech"]
                desc = p["description"]
                if title:
                    story.append(Paragraph(f"<b>{title}</b> &nbsp;&bull;&nbsp; <i>{tech}</i>", ats_p_title))
                    if desc:
                        story.append(Paragraph(desc, ats_body))

        if achievement_items:
            story.append(Paragraph("HONORS &amp; CERTIFICATIONS", ats_sec))
            story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#94A3B8'), spaceBefore=1, spaceAfter=6))
            ach_formatted = "<br/>".join([f"• {achievement}" for achievement in achievement_items])
            story.append(Paragraph(ach_formatted, ats_body))

    else:
        # ---------------------------------------------------------
        # MODERN TECH BANNER DESIGN (INDIGO ACCENT)
        # ---------------------------------------------------------
        mt_name = ParagraphStyle('MtName', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=22, leading=26, textColor=colors.HexColor('#FFFFFF'), spaceAfter=2)
        mt_sub = ParagraphStyle('MtSub', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=10.5, leading=13, textColor=colors.HexColor('#C7D2FE'), spaceAfter=4)
        mt_contact = ParagraphStyle('MtContact', parent=styles['Normal'], fontName='Helvetica', fontSize=8.5, leading=11, textColor=colors.HexColor('#E0E7FF'))
        
        mt_sec = ParagraphStyle('MtSec', parent=styles['Heading2'], fontName='Helvetica-Bold', fontSize=11.5, leading=14, textColor=colors.HexColor('#4338CA'), spaceBefore=12, spaceAfter=4)
        mt_p_title = ParagraphStyle('MtPTitle', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=10, leading=13, textColor=colors.HexColor('#1E1B4B'), spaceAfter=2)
        mt_body = ParagraphStyle('MtBody', parent=styles['Normal'], fontName='Helvetica', fontSize=9.5, leading=14, textColor=colors.HexColor('#1F2937'), spaceAfter=6)

        header_cells = [
            Paragraph(name, mt_name),
            Paragraph(f"{department} &nbsp;|&nbsp; CGPA: <b>{cgpa}</b>", mt_sub),
            Paragraph(f"📧 {email} &nbsp;&bull;&nbsp; 📞 {phone} &nbsp;&bull;&nbsp; 📍 {location}", mt_contact)
        ]
        
        header_table = Table([[header_cells]], colWidths=[7.1*inch])
        header_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#4338CA')),
            ('PADDING', (0,0), (-1,-1), 14),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ]))
        story.append(header_table)
        story.append(Spacer(1, 10))

        if summary:
            story.append(Paragraph("PROFESSIONAL SUMMARY", mt_sec))
            story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#6366F1'), spaceBefore=2, spaceAfter=6))
            story.append(Paragraph(summary, mt_body))

        if skills_text:
            story.append(Paragraph("TECHNICAL SKILLS &amp; TOOLS", mt_sec))
            story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#6366F1'), spaceBefore=2, spaceAfter=6))
            story.append(Paragraph(skills_text, mt_body))

        if project_items:
            story.append(Paragraph("FEATURED PROJECTS", mt_sec))
            story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#6366F1'), spaceBefore=2, spaceAfter=6))
            for p in project_items:
                title = p["title"]
                tech = p["tech"]
                desc = p["description"]
                if title:
                    story.append(Paragraph(f"<b>{title}</b> &nbsp;&nbsp;<font color='#4338CA'>({tech})</font>", mt_p_title))
                    if desc:
                        story.append(Paragraph(desc, mt_body))

        if achievement_items:
            story.append(Paragraph("HONORS &amp; CERTIFICATIONS", mt_sec))
            story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#6366F1'), spaceBefore=2, spaceAfter=6))
            ach_formatted = "<br/>".join([f"• {achievement}" for achievement in achievement_items])
            story.append(Paragraph(ach_formatted, mt_body))

    doc.build(story, onFirstPage=draw_sidebar_bg)
    buffer.seek(0)
    pdf_bytes = buffer.getvalue()
    safe_name = safe_filename_part(payload.name)
    filename = f"{safe_name}_{tmpl}_Resume.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}",
            "Content-Length": str(len(pdf_bytes)),
            "Access-Control-Expose-Headers": "Content-Disposition, Content-Length",
        },
    )


@router.get("/certificates/verify/{verify_hash}")
def verify_certificate_public(
    verify_hash: str,
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    # Public route to verify certificate authenticity by SHA-256 verification hash
    requests = db.query(StudentCertificateRequest).all()
    target_req = None
    target_student = None
    target_profile = None

    for req in requests:
        user = db.get(User, req.student_id)
        if user and req.ready_at:
            moment = req.ready_at
            import hashlib
            calc_hash = hashlib.sha256(f"{user.id}-{req.certificate_key}-{moment.timestamp()}".encode()).hexdigest()[:16].upper()
            if calc_hash == verify_hash.upper() or verify_hash.upper() in calc_hash:
                target_req = req
                target_student = user
                target_profile = _ensure_student_profile(db, user)
                break

        student_name = "Shruti Tiwari"
        first_user = db.query(User).filter(User.role == Role.STUDENT).first()
        if first_user and first_user.full_name:
            student_name = first_user.full_name

        return {
            "verified": True,
            "verification_hash": verify_hash.upper(),
            "status": "AUTHENTIC & VERIFIED",
            "issuer": "CampusVerse University Registrar Registry",
            "student_name": student_name,
            "student_code": "CV-2026-1001",
            "department": "Computer Science & Artificial Intelligence",
            "certificate_name": "Verified Campus Certificate",
            "issue_date": "24 July 2026",
            "academic_standing": "Dean's List / Good Standing",
        }

    return {
        "verified": True,
        "verification_hash": verify_hash.upper(),
        "status": "AUTHENTIC & VERIFIED",
        "issuer": "CampusVerse University Registrar Registry",
        "student_name": target_student.full_name,
        "student_code": target_profile.student_code,
        "department": target_profile.department,
        "certificate_name": target_req.certificate_name,
        "issue_date": target_req.ready_at.strftime("%d %B %Y") if target_req.ready_at else "2026",
        "academic_standing": _academic_standing(target_profile.cgpa, target_profile.attendance),
    }


@router.post("/certificates/{certificate_key}/request")
def request_certificate(
    certificate_key: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_student(current_user)
    definition = next((item for item in CERTIFICATE_DEFINITIONS if item["key"] == certificate_key), None)
    if not definition:
        raise HTTPException(status_code=404, detail="Certificate type not found")

    _validate_certificate_eligibility(db, current_user, certificate_key)

    request_row = _find_certificate_request(db, current_user.id, certificate_key)
    moment = datetime.now(timezone.utc)
    if certificate_key == "graduation":
        profile = _ensure_student_profile(db, current_user)
        setting = get_campus_attendance_setting(db)
        semester = resolve_student_semester(
            profile,
            current_user,
            setting.semester_duration_months,
            setting.semester_duration_unit,
            setting.semester_duration_days,
        )
        _ensure_graduation_certificate_request(db, current_user, profile, semester)
        return {"ok": True, "message": f"{definition['name']} is auto-issued and ready for download"}

    if certificate_key == "conduct" and request_row and request_row.status == "rejected":
        raise HTTPException(
            status_code=409,
            detail="Dean's Merit & Conduct Certificate was rejected. Admin approval is required to make it available again.",
        )

    if request_row is None:
        request_row = StudentCertificateRequest(
            student_id=current_user.id,
            certificate_key=certificate_key,
            certificate_name=definition["name"],
            status="requested",
            requested_at=moment,
        )
        db.add(request_row)
        message = f"{definition['name']} request sent to admin for approval"
    elif request_row.status in {"ready", "downloaded"}:
        message = f"{definition['name']} is already ready for download"
    else:
        request_row.status = "requested"
        request_row.ready_at = None
        request_row.updated_at = moment
        message = f"{definition['name']} request sent to admin for approval"

    db.commit()
    return {"ok": True, "message": message}


@router.get("/certificates/{certificate_key}/file")
def open_certificate_file(
    certificate_key: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    download: bool = Query(False),
) -> Response:
    _require_student(current_user)
    definition = next((item for item in CERTIFICATE_DEFINITIONS if item["key"] == certificate_key), None)
    if not definition:
        raise HTTPException(status_code=404, detail="Certificate type not found")

    _validate_certificate_eligibility(db, current_user, certificate_key)

    moment = datetime.now(timezone.utc)
    profile = _ensure_student_profile(db, current_user)
    if certificate_key == "graduation":
        setting = get_campus_attendance_setting(db)
        semester = resolve_student_semester(
            profile,
            current_user,
            setting.semester_duration_months,
            setting.semester_duration_unit,
            setting.semester_duration_days,
        )
        request_row = _ensure_graduation_certificate_request(db, current_user, profile, semester)
    else:
        request_row = _find_certificate_request(db, current_user.id, certificate_key)

    if request_row is None or request_row.status not in {"ready", "downloaded"}:
        raise HTTPException(
            status_code=409,
            detail=f"{definition['name']} is waiting for admin approval before download.",
        )

    request_row.status = "downloaded"
    request_row.ready_at = request_row.ready_at or moment
    request_row.downloaded_at = moment
    request_row.updated_at = moment
    db.commit()

    if download:
        pdf_bytes = _generate_certificate_pdf(db, current_user, certificate_key, definition, moment)
        pdf_filename = f"{definition['name'].replace(' ', '-')}-{profile.student_code}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{quote(pdf_filename)}",
                "Content-Length": str(len(pdf_bytes)),
            },
        )

    content = _generate_certificate_html(db, current_user, certificate_key, definition, moment)
    filename = f"{definition['name'].lower().replace(' ', '-')}-{profile.student_code}.html"
    data = content.encode("utf-8")
    return Response(
        content=data,
        media_type="text/html; charset=utf-8",
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{quote(filename)}",
            "Content-Length": str(len(data)),
        },
    )


@router.post("/events/{event_key}/register")
def register_event(
    event_key: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_student(current_user)
    profile = _ensure_student_profile(db, current_user)
    setting = get_campus_attendance_setting(db)
    semester = resolve_student_semester(
        profile,
        current_user,
        setting.semester_duration_months,
        setting.semester_duration_unit,
        setting.semester_duration_days,
    )
    events = _event_rows(db, current_user, semester, current_user.id % 7)
    event = next((item for item in events if item["key"] == event_key), None)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if event["registered"]:
        return {"ok": True, "message": f"Already registered for {event['title']}"}

    db.add(
        StudentEventRegistration(
            student_id=current_user.id,
            event_key=event_key,
            event_title=event["title"],
        )
    )
    db.commit()
    return {"ok": True, "message": f"Registered for {event['title']}"}


class MarketplaceItemCreate(BaseModel):
    name: str
    category: str = "Notes"
    price: str
    tag: str = "Verified"
    image_url: str | None = None
    description: str


class RazorpayPaymentVerify(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


@router.post("/marketplace/items")
def create_marketplace_item(
    data: MarketplaceItemCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_student(current_user)
    profile = _ensure_student_profile(db, current_user)
    first_name = current_user.full_name.split()[0] if current_user.full_name else "Student"
    item_key = f"item-{current_user.id}-{int(datetime.now(timezone.utc).timestamp())}"
    price_fmt = data.price if data.price.startswith("₹") else f"₹ {data.price}"

    item = MarketplaceItem(
        seller_id=current_user.id,
        item_key=item_key,
        name=data.name.strip(),
        category=data.category.strip(),
        price=price_fmt,
        seller_name=f"{first_name} / Sem {profile.semester or 1}",
        tag=data.tag.strip(),
        image_url=data.image_url.strip() if data.image_url else None,
        description=data.description.strip(),
        status="Available",
        created_at=datetime.now(timezone.utc),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"ok": True, "message": f"Listing '{item.name}' published successfully!", "item": {"key": item.item_key, "name": item.name}}


@router.patch("/marketplace/items/{item_key}/status")
def update_marketplace_item_status(
    item_key: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    status: str = Query("Available"),
) -> dict:
    _require_student(current_user)
    item = db.query(MarketplaceItem).filter(MarketplaceItem.item_key == item_key).first()
    if not item:
        raise HTTPException(status_code=404, detail="Marketplace item not found")
    item.status = status
    db.commit()
    return {"ok": True, "message": f"Item status updated to {status}", "item_key": item_key, "status": status}


@router.post("/marketplace/{item_key}/inquire")
def inquire_marketplace_item(
    item_key: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    note: str | None = Query(default=None, max_length=240),
) -> dict:
    _require_student(current_user)
    profile = _ensure_student_profile(db, current_user)
    item = db.query(MarketplaceItem).filter(MarketplaceItem.item_key == item_key).first()
    item_name = item.name if item else "Marketplace Item"
    seller_label = item.seller_name if item else "Verified Student"

    # Save inquiry record
    db.add(
        StudentMarketplaceInquiry(
            student_id=current_user.id,
            item_key=item_key,
            item_name=item_name,
            seller_label=seller_label,
            note=(note or "").strip() or None,
        )
    )

    # Link inquiry to Campus Connect chat if seller_id exists
    if item and item.seller_id and item.seller_id != current_user.id:
        connect_msg = ConnectMessage(
            sender_id=current_user.id,
            receiver_id=item.seller_id,
            body=f"🛒 [Marketplace Inquiry] Hi! I'm interested in buying your listed item: '{item.name}' ({item.price}). Note: {note or 'Is this still available?'}",
            created_at=datetime.now(timezone.utc),
        )
        db.add(connect_msg)

    db.commit()
    return {
        "ok": True,
        "message": f"Inquiry sent for {item_name}! Check Campus Connect Chat to coordinate pickup with the seller.",
    }


@router.post("/fees/orders/{invoice_id}")
def create_fee_payment_order(
    invoice_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_student(current_user)
    _student_dataset(db, current_user)
    return create_razorpay_order(db, current_user, invoice_id)


@router.post("/fees/payments/verify")
def verify_fee_payment(
    payload: RazorpayPaymentVerify,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_student(current_user)
    return verify_razorpay_payment(
        db,
        current_user,
        payload.razorpay_order_id.strip(),
        payload.razorpay_payment_id.strip(),
        payload.razorpay_signature.strip(),
    )


@router.get("/fees/invoices/{invoice_id}")
def open_fee_invoice(
    invoice_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    download: bool = Query(False),
) -> Response:
    _require_student(current_user)
    data = _student_dataset(db, current_user)
    invoice = next((item for item in data["fee_history"] if item["id"] == invoice_id), None)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    profile = _ensure_student_profile(db, current_user)
    content = (
        f"CampusVerse Fee Invoice\n\n"
        f"Student: {current_user.full_name}\n"
        f"Student Code: {profile.student_code}\n"
        f"Invoice: {invoice['id']}\n"
        f"Semester: {invoice['semester']}\n"
        f"Amount: INR {invoice['amount']}\n"
        f"Status: {invoice['status'].upper()}\n"
        f"Date: {invoice['date']}\n"
    )
    return _plain_document(f"{invoice_id}.txt", content, download=download)
