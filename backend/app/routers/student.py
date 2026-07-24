from datetime import date, datetime, timedelta, timezone
from typing import Annotated
from urllib.parse import quote
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import desc
from sqlalchemy.orm import Session, selectinload

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
from app.intake_flow import resolve_student_semester
from app.models import (
    Announcement,
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
from app.resource_files import public_resource_url
from app.schemas import (
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
LOCAL_TIMEZONE = ZoneInfo("Asia/Kolkata")
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
    {"key": "bonafide", "name": "Bonafide Certificate", "eta": "24 hours"},
    {"key": "transcript", "name": "Transcript", "eta": "3 days"},
    {"key": "fee-clearance", "name": "Fee Clearance Letter", "eta": "48 hours"},
]


def _certificate_request_rows(db: Session, student_id: int) -> list[StudentCertificateRequest]:
    return (
        db.query(StudentCertificateRequest)
        .filter(StudentCertificateRequest.student_id == student_id)
        .order_by(desc(StudentCertificateRequest.updated_at))
        .all()
    )


def _certificate_items(db: Session, user: User, due_amount: int, first_name: str) -> list[dict]:
    requests = {item.certificate_key: item for item in _certificate_request_rows(db, user.id)}
    descriptions = {
        "bonafide": f"Enrollment proof for {first_name}.",
        "transcript": "Verified academic record.",
        "fee-clearance": "Pending clearance" if due_amount else "Ready to request",
    }
    items: list[dict] = []
    for index, item in enumerate(CERTIFICATE_DEFINITIONS, start=1):
        request = requests.get(item["key"])
        if request:
            status = request.status
        else:
            status = "available"
        items.append(
            {
                "id": user.id * 10 + index,
                "key": item["key"],
                "name": item["name"],
                "desc": descriptions[item["key"]],
                "eta": item["eta"],
                "status": status,
                "requestedAt": request.requested_at.isoformat() if request else None,
                "readyAt": request.ready_at.isoformat() if request and request.ready_at else None,
                "downloadedAt": request.downloaded_at.isoformat() if request and request.downloaded_at else None,
            }
        )
    return items


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


def _marketplace_items(user: User, semester: int) -> list[dict]:
    first_name = user.full_name.split()[0] if user.full_name else "Student"
    return [
        {
            "id": user.id * 10 + 1,
            "key": "notes-bundle",
            "name": f"Sem {semester} Notes Bundle",
            "category": "Notes",
            "price": "\u20b9 120",
            "seller": f"{first_name} / Sem {semester}",
            "tag": "Verified",
            "description": "Curated lecture notes, summaries, and previous practice sheets.",
        },
        {
            "id": user.id * 10 + 2,
            "key": "engineering-calculator",
            "name": "Engineering Calculator",
            "category": "Hostel",
            "price": "\u20b9 650",
            "seller": "Campus verified",
            "tag": "Like new",
            "description": "Exam-ready calculator with cover and fresh batteries.",
        },
        {
            "id": user.id * 10 + 3,
            "key": "reference-book-set",
            "name": "Reference Book Set",
            "category": "Books",
            "price": "\u20b9 480",
            "seller": "Library circle",
            "tag": "",
            "description": "Useful core textbooks for the current semester.",
        },
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
                "professorName": professor_name or "Campus faculty",
                "createdAt": resource.created_at.isoformat(),
                "createdDate": resource.created_at.date().isoformat(),
                "time": resource.created_at.strftime("%d %b %Y, %I:%M %p"),
            }
        )
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
        .limit(10)
        .all()
    )
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
    fee_base = 78000 + (semester * 1200)
    due_amount = fee_base if semester % 2 == 0 else 0
    first_name = user.full_name.split()[0] if user.full_name else "Student"
    resource_rows = _resource_rows(db)
    resource_status = f"{len(resource_rows)} uploaded" if resource_rows else "0 uploaded"
    resource_detail = "Notes, slides, previous papers" if resource_rows else "No study resources uploaded yet"
    certificate_items = _certificate_items(db, user, due_amount, first_name)
    fee_history = _fee_history(user.id, semester, fee_base, due_amount)
    event_items = _event_rows(db, user, semester, seed)
    marketplace_items = _marketplace_items(user, semester)
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
        "fee_summary": {
            "outstanding": due_amount,
            "semester": f"Sem {semester}",
            "dueDate": "Jul 25, 2026" if due_amount else "Cleared",
            "clearance": "Pending" if due_amount else "Cleared",
            "trend": [fee_base - 5200, fee_base - 3000, fee_base - 1200, fee_base, fee_base, fee_base + 900],
        },
        "fee_history": fee_history,
        "module_health": [
            {"module": "Announcements", "status": f"{1 + seed % 3} unread", "detail": f"Updates for {first_name}'s semester"},
            {"module": "Assignments", "status": f"{2 + seed % 2} pending", "detail": "Submission and grading status"},
            {"module": "Complaints", "status": f"{user.id % 3} open", "detail": "Live request tracking"},
            {
                "module": "Certificates",
                "status": latest_certificate["status"].replace("_", " ").title() if latest_certificate else "Available",
                "detail": "Bonafide and transcript requests",
            },
            {"module": "Fees", "status": "Pending" if due_amount else "Cleared", "detail": "Payment verification and receipts"},
            {"module": "Resources", "status": resource_status, "detail": resource_detail},
        ],
        "upcoming_deadlines": [
            {"title": f"{first_name}'s assignment checkpoint", "module": "Assignments", "due": "Tomorrow", "risk": "high"},
            {"title": "Semester fee clearance", "module": "Fees", "due": "Jul 25", "risk": "medium" if due_amount else "low"},
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
            {
                "title": latest_certificate["name"] if latest_certificate else "Bonafide Certificate",
                "kind": "Certificate",
                "stage": latest_certificate["status"].replace("_", " ").title() if latest_certificate else "Ready",
                "updated": "Today" if latest_certificate else "Yesterday",
            },
            {"title": f"Sem {semester} Fee Receipt", "kind": "Fees", "stage": "Pending" if due_amount else "Cleared", "updated": "2 days ago"},
        ],
        "announcements": [
            *_placement_notification_rows(db, user.id),
            *_student_announcement_rows(db, user),
        ],
        "assignment_items": [
            {"id": user.id * 10 + 1, "title": f"{first_name}'s Research Brief", "subject": "Research", "due": "tomorrow", "progress": min(98, 55 + seed * 5), "status": "ongoing"},
            {"id": user.id * 10 + 2, "title": "Distributed Systems Lab", "subject": "Systems", "due": "in 5 days", "progress": min(90, 25 + seed * 8), "status": "ongoing"},
            {"id": user.id * 10 + 3, "title": "Academic Writing Checkpoint", "subject": "Communication", "due": "in 9 days", "progress": seed * 6, "status": "pending"},
            {"id": user.id * 10 + 4, "title": "Semester Portfolio Review", "subject": department.split()[0], "due": "completed", "progress": 100, "status": "graded", "grade": "A" if cgpa >= 8.8 else "B+"},
        ],
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

    request_row = (
        db.query(StudentCertificateRequest)
        .filter(
            StudentCertificateRequest.student_id == current_user.id,
            StudentCertificateRequest.certificate_key == certificate_key,
        )
        .first()
    )
    moment = datetime.now(timezone.utc)
    if request_row is None:
        request_row = StudentCertificateRequest(
            student_id=current_user.id,
            certificate_key=certificate_key,
            certificate_name=definition["name"],
            status="requested",
            requested_at=moment,
            ready_at=moment + timedelta(hours=24 if certificate_key == "bonafide" else 48),
        )
        db.add(request_row)
        message = f"{definition['name']} requested successfully"
    else:
        request_row.status = "ready" if request_row.ready_at and request_row.ready_at <= moment else "requested"
        request_row.updated_at = moment
        message = f"{definition['name']} is already in progress"

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

    request_row = (
        db.query(StudentCertificateRequest)
        .filter(
            StudentCertificateRequest.student_id == current_user.id,
            StudentCertificateRequest.certificate_key == certificate_key,
        )
        .first()
    )
    if request_row is None:
        raise HTTPException(status_code=409, detail="Request this certificate before downloading it")

    moment = datetime.now(timezone.utc)
    if request_row.ready_at and request_row.ready_at <= moment:
        request_row.status = "ready"
    if request_row.status not in {"ready", "downloaded"}:
        raise HTTPException(status_code=409, detail="This certificate is still being processed")

    request_row.status = "downloaded"
    request_row.downloaded_at = moment
    request_row.updated_at = moment
    db.commit()

    profile = _ensure_student_profile(db, current_user)
    content = (
        f"CampusVerse\n"
        f"{definition['name']}\n\n"
        f"Student: {current_user.full_name}\n"
        f"Student Code: {profile.student_code}\n"
        f"Department: {profile.department}\n"
        f"Issued On: {moment.astimezone(LOCAL_TIMEZONE).strftime('%d %b %Y, %I:%M %p')}\n\n"
        f"This document was generated from CampusVerse for academic workflow purposes."
    )
    filename = f"{definition['name'].lower().replace(' ', '-')}-{profile.student_code}.txt"
    return _plain_document(filename, content, download=download)


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


@router.post("/marketplace/{item_key}/inquire")
def inquire_marketplace_item(
    item_key: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    note: str | None = Query(default=None, max_length=240),
) -> dict:
    _require_student(current_user)
    profile = _ensure_student_profile(db, current_user)
    items = _marketplace_items(current_user, profile.semester or 1)
    item = next((row for row in items if row["key"] == item_key), None)
    if not item:
        raise HTTPException(status_code=404, detail="Marketplace item not found")

    db.add(
        StudentMarketplaceInquiry(
            student_id=current_user.id,
            item_key=item_key,
            item_name=item["name"],
            seller_label=item["seller"],
            note=(note or "").strip() or None,
        )
    )
    db.commit()
    return {
        "ok": True,
        "message": f"Inquiry saved for {item['name']}. Reach out via Campus Connect or student support to coordinate the exchange.",
    }


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
