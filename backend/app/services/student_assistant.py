from __future__ import annotations

import json
import re
from typing import Any

import requests
from sqlalchemy import desc, or_
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models import (
    AssignmentReview,
    ConnectMessage,
    ConnectRelationship,
    PlacementApplication,
    PlacementRole,
    PlacementRoleApplication,
    StudentBiometricCheckIn,
    User,
)
from app.routers.placement import (
    MIN_PLACEMENT_CGPA,
    MIN_PLACEMENT_SEMESTER,
    _application_payload,
    _is_eligible,
    _notifications_for_student,
    _student_role_payload,
    _student_snapshot,
)

OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"

TAB_DEFINITIONS = [
    {"path": "/app/announcements", "label": "Announcements", "feature": "campus notices and updates"},
    {"path": "/app/attendance", "label": "Attendance", "feature": "attendance records, biometric status, and trends"},
    {"path": "/app/assignments", "label": "Assignments", "feature": "assignments, grading, and deadlines"},
    {"path": "/app/resources", "label": "Study Resources", "feature": "notes, files, papers, and faculty resources"},
    {"path": "/app/complaints", "label": "Complaints", "feature": "complaint filing, status, and proofs"},
    {"path": "/app/certificates", "label": "Certificates", "feature": "certificate requests and readiness"},
    {"path": "/app/fees", "label": "Fee Payment", "feature": "fee dues, invoices, and clearance"},
    {"path": "/app/marketplace", "label": "Marketplace", "feature": "student exchange listings"},
    {"path": "/app/events", "label": "Events", "feature": "campus events and registrations"},
    {"path": "/app/connect", "label": "Connect", "feature": "student and professor network"},
    {"path": "/app/placement", "label": "Placement", "feature": "placement profile, jobs, and eligibility"},
    {"path": "/app/profile", "label": "Profile", "feature": "student identity and academic profile"},
    {"path": "/app/settings", "label": "Settings", "feature": "preferences and biometric controls"},
    {"path": "/app/scholarships", "label": "Scholarships", "feature": "grants and aid status"},
    {"path": "/app/ai", "label": "AI Assistant", "feature": "student assistant chat"},
    {"path": "/app", "label": "Dashboard", "feature": "overall student dashboard"},
]

TAB_PROMPTS = {
    "Announcements": ["What announcements did I miss?", "Summarise pinned updates", "What should I act on today?"],
    "Attendance": ["Explain my attendance risk", "What happened this week?", "How do I stay above 75%?"],
    "Assignments": ["Which assignment is urgent?", "Plan my pending work", "Summarise graded feedback"],
    "Study Resources": ["Find useful resources", "Which notes match my focus?", "What should I study next?"],
    "Complaints": ["Track my complaints", "Draft a new complaint", "What proof should I attach?"],
    "Certificates": ["Which certificate can I request?", "Show certificate status", "What documents are ready?"],
    "Fee Payment": ["Show my fee status", "Explain pending dues", "Summarise fee history"],
    "Marketplace": ["Find relevant listings", "Summarise marketplace items", "What can I list?"],
    "Events": ["Which events are upcoming?", "Suggest events for me", "What is happening soon?"],
    "Connect": ["Summarise my network", "Show recent conversations", "Who can help me?"],
    "Placement": ["Am I placement eligible?", "Which jobs match me?", "Improve my placement profile"],
    "Profile": ["Improve my profile", "Summarise my academic identity", "What details are missing?"],
    "Settings": ["Explain biometric status", "What settings matter?", "Help with attendance setup"],
    "Scholarships": ["Which scholarships fit me?", "Show scholarship progress", "How can I improve eligibility?"],
    "AI Assistant": ["Summarise my portal", "What should I focus on?", "Where am I weak?"],
    "Dashboard": ["Summarise my day", "What needs attention?", "Give me an academic plan"],
}


def resolve_student_tab(current_path: str | None) -> dict:
    raw_path = (current_path or "/app").split("?", 1)[0].split("#", 1)[0].rstrip("/") or "/app"
    for tab in sorted(TAB_DEFINITIONS, key=lambda item: len(item["path"]), reverse=True):
        path = tab["path"]
        if path == "/app":
            if raw_path == "/app":
                return tab
        elif raw_path == path or raw_path.startswith(f"{path}/"):
            return tab
    return {"path": raw_path, "label": "Student Portal", "feature": "current student workspace"}


def answer_student_assistant(
    *,
    settings: Settings,
    db: Session,
    current_user: User,
    dashboard: dict,
    message: str,
    current_path: str,
    history: list[dict],
) -> dict:
    tab = resolve_student_tab(current_path)
    context = _assistant_light_context(dashboard, tab)
    prompts = TAB_PROMPTS.get(tab["label"], TAB_PROMPTS["Dashboard"])
    model = settings.openai_model
    api_key = settings.openai_api_key.get_secret_value() if settings.openai_api_key else ""

    if _is_small_talk(message):
        return {
            "answer": _small_talk_answer(message, context),
            "tab": tab,
            "model": model,
            "fallback": False,
            "suggestedPrompts": prompts,
        }

    if _is_resource_query(message, tab):
        return {
            "answer": _resource_answer(context),
            "tab": tab,
            "model": model,
            "fallback": False,
            "suggestedPrompts": prompts,
        }

    context = _assistant_context(db, current_user, dashboard, tab)

    if not api_key:
        return {
            "answer": _fallback_answer(message, context, tab, reason="OpenAI key is not configured."),
            "tab": tab,
            "model": model,
            "fallback": True,
            "suggestedPrompts": prompts,
        }

    try:
        answer = _clean_model_answer(
            _call_openai(api_key=api_key, model=model, message=message, history=history, context=context)
        )
        return {
            "answer": answer,
            "tab": tab,
            "model": model,
            "fallback": False,
            "suggestedPrompts": prompts,
        }
    except Exception as exc:
        return {
            "answer": _fallback_answer(message, context, tab, reason=f"Live AI service was unavailable: {exc}"),
            "tab": tab,
            "model": model,
            "fallback": True,
            "suggestedPrompts": prompts,
        }


def _assistant_light_context(dashboard: dict, tab: dict) -> dict:
    return {
        "active_tab": tab,
        "student": dashboard["user"],
        "dashboard": _compact_dashboard(dashboard),
        "deep_records": {},
        "privacy_boundary": _privacy_boundary(),
    }


def _assistant_context(db: Session, current_user: User, dashboard: dict, tab: dict) -> dict:
    return {
        "active_tab": tab,
        "student": dashboard["user"],
        "dashboard": _compact_dashboard(dashboard),
        "deep_records": {
            "placement": _placement_context(db, current_user),
            "assignment_reviews": _assignment_reviews(db, current_user.id),
            "biometric_checkins": _biometric_checkins(db, current_user.id),
            "connect": _connect_context(db, current_user),
        },
        "privacy_boundary": _privacy_boundary(),
    }


def _privacy_boundary() -> str:
    return (
        "This context belongs to the authenticated student. Do not reveal private records for "
        "other students or staff. Public campus announcements/resources may be discussed."
    )


def _compact_dashboard(dashboard: dict) -> dict:
    return {
        "metrics": dashboard.get("metrics", []),
        "cgpa_trend": dashboard.get("cgpa_trend", []),
        "attendance_weekly": dashboard.get("attendance_weekly", []),
        "attendance_timeline": dashboard.get("attendance_timeline", [])[-30:],
        "attendance_by_subject": dashboard.get("attendance_by_subject", []),
        "attendance_monthly": dashboard.get("attendance_monthly", []),
        "fee_summary": dashboard.get("fee_summary", {}),
        "fee_history": dashboard.get("fee_history", []),
        "module_health": dashboard.get("module_health", []),
        "upcoming_deadlines": dashboard.get("upcoming_deadlines", []),
        "request_timeline": dashboard.get("request_timeline", []),
        "announcements": _limit_items(dashboard.get("announcements", []), 20),
        "assignment_items": dashboard.get("assignment_items", []),
        "resource_items": _limit_items(dashboard.get("resource_items", []), 30),
        "complaint_items": dashboard.get("complaint_items", []),
        "certificate_items": dashboard.get("certificate_items", []),
        "event_items": dashboard.get("event_items", []),
        "marketplace_items": dashboard.get("marketplace_items", []),
        "scholarship_items": dashboard.get("scholarship_items", []),
        "achievements": dashboard.get("achievements", []),
        "skills": dashboard.get("skills", []),
        "activity": dashboard.get("activity", []),
        "nav_modules": dashboard.get("nav_modules", TAB_DEFINITIONS),
        "student_todos": dashboard.get("student_todos", []),
    }


def _limit_items(items: list[dict], limit: int) -> list[dict]:
    return items[:limit]


def _placement_context(db: Session, current_user: User) -> dict:
    snapshot = _student_snapshot(db, current_user)
    application = (
        db.query(PlacementApplication)
        .filter(PlacementApplication.student_id == current_user.id)
        .first()
    )
    all_role_applications = (
        db.query(PlacementRoleApplication)
        .filter(PlacementRoleApplication.student_id == current_user.id)
        .all()
    )
    dismissed_role_ids = {
        item.role_id
        for item in all_role_applications
        if item.dismissed_by_student and item.status in {"accepted", "rejected"}
    }
    role_applications = {
        item.role_id: item
        for item in all_role_applications
        if not item.dismissed_by_student
    }
    roles = (
        db.query(PlacementRole)
        .filter(PlacementRole.status == "open", PlacementRole.active.is_(True))
        .order_by(desc(PlacementRole.updated_at))
        .limit(20)
        .all()
    )
    return {
        "student": snapshot,
        "criteria": {"minimumSemester": MIN_PLACEMENT_SEMESTER, "minimumCgpa": MIN_PLACEMENT_CGPA},
        "eligible": _is_eligible(snapshot),
        "application": _application_payload(application) if application else None,
        "notifications": _notifications_for_student(db, current_user.id),
        "jobs": [
            _student_role_payload(
                role,
                snapshot=snapshot,
                application=application,
                role_application=role_applications.get(role.id),
            )
            for role in roles
            if role.id not in dismissed_role_ids
        ],
    }


def _assignment_reviews(db: Session, student_id: int) -> list[dict]:
    rows = (
        db.query(AssignmentReview)
        .filter(AssignmentReview.student_id == student_id)
        .order_by(desc(AssignmentReview.updated_at))
        .limit(25)
        .all()
    )
    return [
        {
            "id": row.id,
            "assignmentTitle": row.assignment_title,
            "subject": row.subject,
            "status": row.status,
            "grade": row.grade,
            "feedback": row.feedback,
            "updatedAt": row.updated_at.isoformat(),
        }
        for row in rows
    ]


def _biometric_checkins(db: Session, student_id: int) -> list[dict]:
    rows = (
        db.query(StudentBiometricCheckIn)
        .filter(StudentBiometricCheckIn.student_id == student_id)
        .order_by(desc(StudentBiometricCheckIn.checkin_date))
        .limit(20)
        .all()
    )
    return [
        {
            "id": row.id,
            "date": row.checkin_date.isoformat(),
            "status": row.status,
            "withinRadius": row.within_radius,
            "biometricVerified": row.biometric_verified,
            "professorConfirmed": row.professor_confirmed,
            "warningFlag": row.warning_flag,
            "distanceMeters": row.distance_meters,
            "detectedAt": row.detected_at.isoformat() if row.detected_at else None,
            "verifiedAt": row.verified_at.isoformat() if row.verified_at else None,
            "confirmedAt": row.confirmed_at.isoformat() if row.confirmed_at else None,
        }
        for row in rows
    ]


def _connect_context(db: Session, current_user: User) -> dict:
    relationships = (
        db.query(ConnectRelationship)
        .filter(
            or_(
                ConnectRelationship.user_low_id == current_user.id,
                ConnectRelationship.user_high_id == current_user.id,
                ConnectRelationship.requester_id == current_user.id,
                ConnectRelationship.receiver_id == current_user.id,
            )
        )
        .all()
    )
    counts = {
        "friends": 0,
        "incomingRequests": 0,
        "sentRequests": 0,
        "blocked": 0,
    }
    for relationship in relationships:
        if relationship.status == "accepted":
            counts["friends"] += 1
        elif relationship.status == "pending" and relationship.receiver_id == current_user.id:
            counts["incomingRequests"] += 1
        elif relationship.status == "pending" and relationship.requester_id == current_user.id:
            counts["sentRequests"] += 1
        elif relationship.status == "blocked":
            counts["blocked"] += 1

    messages = (
        db.query(ConnectMessage)
        .filter(or_(ConnectMessage.sender_id == current_user.id, ConnectMessage.receiver_id == current_user.id))
        .order_by(desc(ConnectMessage.created_at))
        .limit(20)
        .all()
    )
    user_ids = {
        message.receiver_id if message.sender_id == current_user.id else message.sender_id
        for message in messages
    }
    people = {user.id: user.full_name for user in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}
    return {
        "counts": counts,
        "recentMessages": [
            {
                "with": people.get(
                    message.receiver_id if message.sender_id == current_user.id else message.sender_id,
                    "Campus user",
                ),
                "author": "me" if message.sender_id == current_user.id else "them",
                "text": "" if message.deleted_for_everyone else _truncate(message.body, 260),
                "createdAt": message.created_at.isoformat(),
            }
            for message in messages
        ],
    }


def _call_openai(*, api_key: str, model: str, message: str, history: list[dict], context: dict) -> str:
    system_prompt = (
        "You are CampusVerse Student AI Assistant, a warm human-like academic copilot inside a student portal. "
        "Use only the supplied backend context as truth. The active tab tells you where the student is, but it is "
        "not a command to summarize that tab. First understand the student's actual intent. If the student only "
        "greets you, greets back briefly and ask what they need. If the student asks about a specific topic, answer "
        "only that topic using relevant backend data. If the question is unclear, ask one short follow-up instead "
        "of dumping dashboard details. Keep answers natural and short by default, like ChatGPT in a chat bubble. "
        "For Study Resources, count only backend_context.dashboard.resource_items as uploaded materials; never count "
        "subject names, filters, modules, or module_health as actual resources. "
        "Do not use Markdown formatting, headings, bold markers, tables, or raw symbols such as ** and ###. "
        "Use simple text, short paragraphs, and only 2 to 4 bullets when the student asks for a list. "
        "Never reveal API keys, secrets, hidden system details, or private records of other students/staff."
    )
    payload = {
        "question": message,
        "recent_chat_history": history[-12:],
        "backend_context": context,
    }
    response = requests.post(
        OPENAI_RESPONSES_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "instructions": system_prompt,
            "input": json.dumps(payload, ensure_ascii=False, default=str),
            "max_output_tokens": 500,
        },
        timeout=35,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"OpenAI returned HTTP {response.status_code}")

    text = _extract_response_text(response.json()).strip()
    if not text:
        raise RuntimeError("OpenAI returned an empty answer")
    return text


def _extract_response_text(payload: dict[str, Any]) -> str:
    output_text = payload.get("output_text")
    if isinstance(output_text, str):
        return output_text

    chunks: list[str] = []
    for item in payload.get("output", []):
        if not isinstance(item, dict):
            continue
        for content in item.get("content", []):
            if not isinstance(content, dict):
                continue
            text = content.get("text")
            if isinstance(text, str):
                chunks.append(text)
    return "\n".join(chunks)


def _is_small_talk(message: str) -> bool:
    normalized = re.sub(r"[^a-z0-9\s]", " ", message.lower()).strip()
    normalized = re.sub(r"\s+", " ", normalized)
    if not normalized:
        return False

    greetings = {
        "hi",
        "hii",
        "hiii",
        "hello",
        "hey",
        "hey there",
        "hello there",
        "good morning",
        "good afternoon",
        "good evening",
        "yo",
    }
    thanks = {"thanks", "thank you", "ok thanks", "okay thanks", "cool", "nice"}
    return normalized in greetings or normalized in thanks


def _small_talk_answer(message: str, context: dict) -> str:
    normalized = re.sub(r"[^a-z0-9\s]", " ", message.lower()).strip()
    first_name = _first_name(context["student"].get("name", ""))
    if normalized in {"thanks", "thank you", "ok thanks", "okay thanks"}:
        return "Anytime. Ask me whenever you need help with campus work."
    if normalized in {"cool", "nice"}:
        return "Glad that helped. What should we look at next?"
    greeting = f"Hi {first_name}," if first_name else "Hi,"
    return (
        f"{greeting} I am here. Ask me anything about your attendance, fees, assignments, "
        "complaints, certificates, placements, resources, or any campus task."
    )


def _is_resource_query(message: str, tab: dict) -> bool:
    normalized = message.lower()
    resource_terms = ("resource", "resources", "study material", "study materials", "notes", "slides", "papers")
    availability_terms = ("any", "present", "available", "uploaded", "there", "have", "show", "list", "find")
    if any(term in normalized for term in resource_terms):
        return True
    return tab["label"] == "Study Resources" and any(term in normalized for term in availability_terms)


def _resource_answer(context: dict) -> str:
    resources = context["dashboard"].get("resource_items", [])
    if not resources:
        return (
            "No study materials are uploaded in Study Resources right now. "
            "I am counting only real uploaded resource records, not subject names or filter options."
        )

    visible = resources[:5]
    lines = [f"I found {len(resources)} uploaded study material{'s' if len(resources) != 1 else ''}."]
    lines.extend(
        f"- {item.get('title', 'Untitled resource')} ({item.get('subject', 'Subject not set')})"
        for item in visible
    )
    if len(resources) > len(visible):
        lines.append(f"Plus {len(resources) - len(visible)} more in Study Resources.")
    return "\n".join(lines)


def _first_name(name: str) -> str:
    return name.strip().split(" ")[0] if name and name.strip() else ""


def _clean_model_answer(answer: str) -> str:
    cleaned = answer.strip()
    cleaned = re.sub(r"^#{1,6}\s*", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"\*\*(.*?)\*\*", r"\1", cleaned)
    cleaned = re.sub(r"__(.*?)__", r"\1", cleaned)
    cleaned = re.sub(r"`([^`]*)`", r"\1", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _fallback_answer(message: str, context: dict, tab: dict, *, reason: str) -> str:
    student = context["student"]
    dashboard = context["dashboard"]
    lower = message.lower()
    prefix = f"I am looking at your {tab['label']} tab. "

    if "attendance" in lower or tab["label"] == "Attendance":
        attendance = round(student.get("attendance", 0))
        weekly = dashboard.get("attendance_weekly", [])
        latest = weekly[-1] if weekly else {}
        return (
            f"{prefix}Your overall attendance is {attendance}%. "
            f"Latest visible day: {latest.get('day', 'N/A')} is {latest.get('status', 'not marked')}. "
            f"Keep at least 75%; you are {max(0, attendance - 75)}% above that threshold. "
            f"{reason}"
        )

    if "cgpa" in lower or "grade" in lower:
        cgpa = float(student.get("cgpa", 0))
        return (
            f"{prefix}Your current CGPA is {cgpa:.2f}. "
            f"A practical next target is {min(10, cgpa + 0.1):.2f}; focus first on pending assignments "
            f"and subjects with lower recent performance. {reason}"
        )

    if "fee" in lower or tab["label"] == "Fee Payment":
        fee = dashboard.get("fee_summary", {})
        return (
            f"{prefix}Fee clearance is {fee.get('clearance', 'unknown')} for {fee.get('semester', 'this semester')}. "
            f"Outstanding amount: {fee.get('outstanding', 0)}. Due date: {fee.get('dueDate', 'N/A')}. {reason}"
        )

    if "complaint" in lower or tab["label"] == "Complaints":
        complaints = dashboard.get("complaint_items", [])
        if not complaints:
            return f"{prefix}You do not have a recorded complaint yet. {reason}"
        latest = complaints[0]
        return (
            f"{prefix}Latest complaint {latest.get('complaintCode')}: {latest.get('title')} is "
            f"{latest.get('statusLabel')}. {reason}"
        )

    if "placement" in lower or "job" in lower or tab["label"] == "Placement":
        placement = context["deep_records"]["placement"]
        jobs = placement.get("jobs", [])
        return (
            f"{prefix}Placement eligibility is {'ready' if placement.get('eligible') else 'not ready yet'}. "
            f"Open matching roles visible: {len(jobs)}. "
            f"Criteria: Sem {placement['criteria']['minimumSemester']}+ and CGPA "
            f"{placement['criteria']['minimumCgpa']}+. {reason}"
        )

    deadlines = dashboard.get("upcoming_deadlines", [])
    first_deadline = deadlines[0] if deadlines else None
    if first_deadline:
        return (
            f"{prefix}Top priority: {first_deadline.get('title')} in {first_deadline.get('module')} "
            f"due {first_deadline.get('due')}. {reason}"
        )
    return f"{prefix}I can read your backend student context, but live AI is unavailable right now. {reason}"


def _truncate(value: str, limit: int) -> str:
    cleaned = value.strip()
    if len(cleaned) <= limit:
        return cleaned
    return f"{cleaned[: limit - 3]}..."
