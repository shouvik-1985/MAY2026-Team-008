from datetime import date, datetime, timedelta, timezone
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.dependencies import get_current_user
from app.db import get_db
from app.models import Role, StudentAttendance, StudentTodo, StudyResource, User
from app.resource_files import public_resource_url
from app.schemas import StudentDashboard, StudentTodoCreate, StudentTodoUpdate

router = APIRouter(prefix="/student", tags=["student"])
LOCAL_TIMEZONE = ZoneInfo("Asia/Kolkata")


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
]


def _require_student(user: User) -> None:
    if user.role != Role.student:
        raise HTTPException(status_code=403, detail="Student dashboard is available to student users only")


def _avatar(name: str) -> str:
    return "".join(part[0] for part in name.split()[:2]).upper() or "CV"


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
    return datetime.now(LOCAL_TIMEZONE).date()


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
    rows = db.query(StudyResource).order_by(desc(StudyResource.created_at)).limit(120).all()
    items: list[dict] = []
    for resource in rows:
        professor = db.get(User, resource.created_by_id) if resource.created_by_id else None
        items.append(
            {
                "id": resource.id,
                "title": resource.title,
                "subject": resource.subject,
                "type": resource.resource_type,
                "tag": resource.tag,
                "url": public_resource_url(resource),
                "professorName": professor.full_name if professor else "Campus faculty",
                "createdAt": resource.created_at.isoformat(),
                "createdDate": resource.created_at.date().isoformat(),
                "time": resource.created_at.strftime("%d %b %Y, %I:%M %p"),
            }
        )
    return items


def _student_dataset(db: Session, user: User) -> dict:
    profile = user.student_profile
    seed = user.id % 7
    cgpa = profile.cgpa if profile else round(8.1 + (seed * 0.13), 1)
    fallback_attendance = profile.attendance if profile else float(84 + seed)
    attendance_records = _attendance_records(db, user.id)
    attendance = _attendance_percentage(attendance_records, fallback_attendance)
    semester = profile.semester if profile else 1 + (user.id % 8)
    student_code = profile.student_code if profile else f"CV-2026-{1000 + user.id:04d}"
    department = profile.department if profile else "Computer Science & AI"
    fallback_weekly_values = [max(72, min(100, int(attendance + delta + seed))) for delta in [-10, -4, 3, -2, 0, 7, -5]]
    weekly_attendance = _weekly_attendance(attendance_records, fallback_weekly_values)
    attendance_timeline = _attendance_timeline(attendance_records)
    monthly_attendance = _monthly_attendance(attendance_records)
    fee_base = 78000 + (semester * 1200)
    due_amount = fee_base if semester % 2 == 0 else 0
    first_name = user.full_name.split()[0] if user.full_name else "Student"

    return {
        "user": {
            "name": user.full_name,
            "email": user.email,
            "studentCode": student_code,
            "department": department,
            "semester": semester,
            "cgpa": cgpa,
            "attendance": attendance,
            "avatar": _avatar(user.full_name),
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
            "dueDate": "Jul 05, 2026" if due_amount else "Cleared",
            "clearance": "Pending" if due_amount else "Cleared",
            "trend": [fee_base - 5200, fee_base - 3000, fee_base - 1200, fee_base, fee_base, fee_base + 900],
        },
        "fee_history": [
            {"id": f"INV-{user.id:03d}6", "semester": f"Sem {semester}", "amount": fee_base, "status": "due" if due_amount else "paid", "date": "Jul 05, 2026"},
            {"id": f"INV-{user.id:03d}5", "semester": f"Sem {max(1, semester - 1)}", "amount": fee_base - 1200, "status": "paid", "date": "Aug 12, 2025"},
            {"id": f"INV-{user.id:03d}4", "semester": f"Sem {max(1, semester - 2)}", "amount": fee_base - 2500, "status": "paid", "date": "Jan 18, 2025"},
        ],
        "module_health": [
            {"module": "Announcements", "status": f"{1 + seed % 3} unread", "detail": f"Updates for {first_name}'s semester"},
            {"module": "Assignments", "status": f"{2 + seed % 2} pending", "detail": "Submission and grading status"},
            {"module": "Complaints", "status": f"{user.id % 3} open", "detail": "Live request tracking"},
            {"module": "Certificates", "status": "Available", "detail": "Bonafide and transcript requests"},
            {"module": "Fees", "status": "Pending" if due_amount else "Cleared", "detail": "Payment verification and receipts"},
            {"module": "Resources", "status": f"{8 + seed} new", "detail": "Notes, slides, previous papers"},
        ],
        "upcoming_deadlines": [
            {"title": f"{first_name}'s assignment checkpoint", "module": "Assignments", "due": "Tomorrow", "risk": "high"},
            {"title": "Semester fee clearance", "module": "Fees", "due": "Jul 05", "risk": "medium" if due_amount else "low"},
            {"title": "Mid-Sem examination", "module": "Academics", "due": "Jul 14", "risk": "medium"},
            {"title": "Campus event registration", "module": "Events", "due": "Jul 18", "risk": "low"},
        ],
        "request_timeline": [
            {"title": f"{first_name}'s latest complaint", "kind": "Complaint", "stage": "In Progress", "updated": "Today"},
            {"title": "Bonafide Certificate", "kind": "Certificate", "stage": "Ready", "updated": "Yesterday"},
            {"title": f"Sem {semester} Fee Receipt", "kind": "Fees", "stage": "Pending" if due_amount else "Cleared", "updated": "2 days ago"},
        ],
        "announcements": [
            {
                "id": user.id * 10 + 1,
                "pinned": True,
                "title": "Mid-Sem Schedule Released",
                "category": "Academic",
                "time": "12 min ago",
                "unread": True,
                "body": f"Semester {semester} examination updates are available for {first_name}.",
            },
            {
                "id": user.id * 10 + 2,
                "pinned": bool(due_amount),
                "title": f"Semester {semester} fee status updated",
                "category": "Fees",
                "time": "Yesterday",
                "unread": bool(due_amount),
                "body": "Your fee clearance is pending." if due_amount else "Your current fee status is cleared.",
            },
            {
                "id": user.id * 10 + 3,
                "pinned": False,
                "title": "New study resources added",
                "category": "Library",
                "time": "3 days ago",
                "unread": False,
                "body": f"Fresh resources for {department} students are ready in the library module.",
            },
        ],
        "assignment_items": [
            {"id": user.id * 10 + 1, "title": f"{first_name}'s Research Brief", "subject": "Research", "due": "tomorrow", "progress": min(98, 55 + seed * 5), "status": "ongoing"},
            {"id": user.id * 10 + 2, "title": "Distributed Systems Lab", "subject": "Systems", "due": "in 5 days", "progress": min(90, 25 + seed * 8), "status": "ongoing"},
            {"id": user.id * 10 + 3, "title": "Academic Writing Checkpoint", "subject": "Communication", "due": "in 9 days", "progress": seed * 6, "status": "pending"},
            {"id": user.id * 10 + 4, "title": "Semester Portfolio Review", "subject": department.split()[0], "due": "completed", "progress": 100, "status": "graded", "grade": "A" if cgpa >= 8.8 else "B+"},
        ],
        "resource_items": _resource_rows(db),
        "complaint_items": [
            {"id": f"CV-{2200 + user.id}", "title": f"{first_name}'s latest service request", "category": "Student Services", "stage": 2 + (seed % 3), "created": "Today"},
            {"id": f"CV-{2210 + user.id}", "title": "Library resource access", "category": "Library", "stage": 4, "created": "5 days ago"},
        ],
        "certificate_items": [
            {"id": user.id * 10 + 1, "name": "Bonafide Certificate", "desc": f"Enrollment proof for {first_name}.", "eta": "24 hours", "status": "available"},
            {"id": user.id * 10 + 2, "name": "Transcript", "desc": "Verified academic record.", "eta": "3 days", "status": "available"},
            {"id": user.id * 10 + 3, "name": "Fee Clearance Letter", "desc": summary if (summary := ("Pending clearance" if due_amount else "Ready to request")) else "Ready", "eta": "48 hours", "status": "available"},
        ],
        "event_items": [
            {"id": user.id * 10 + 1, "title": f"Semester {semester} Townhall", "date": "Jul 18", "venue": "Main Auditorium", "spots": 120 + seed * 14, "accent": "oklch(0.72 0.27 350)", "attended": False},
            {"id": user.id * 10 + 2, "title": "Career Connect Workshop", "date": "Jul 22", "venue": "Innovation Hub", "spots": 80 + seed * 9, "accent": "oklch(0.7 0.25 310)", "attended": False},
            {"id": user.id * 10 + 3, "title": "Research Poster Day", "date": "Aug 04", "venue": "Hall A-201", "spots": 60 + seed * 7, "accent": "oklch(0.82 0.18 200)", "attended": False},
        ],
        "marketplace_items": [
            {"id": user.id * 10 + 1, "name": f"Sem {semester} Notes Bundle", "category": "Notes", "price": "\u20b9 120", "seller": f"{first_name} / Sem {semester}", "tag": "Verified"},
            {"id": user.id * 10 + 2, "name": "Engineering Calculator", "category": "Hostel", "price": "\u20b9 650", "seller": "Campus verified", "tag": "Like new"},
            {"id": user.id * 10 + 3, "name": "Reference Book Set", "category": "Books", "price": "\u20b9 480", "seller": "Library circle", "tag": ""},
        ],
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
        "skills": ["Python", "Academic Writing", "Campus Collaboration", department.split()[0], "Research"],
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
