from datetime import datetime
from zoneinfo import ZoneInfo

from app.intake_flow import resolve_student_semester
from app.models import StudentComplaint, StudentComplaintAttachment, StudentProfile, User

LOCAL_TIMEZONE = ZoneInfo("Asia/Kolkata")
COMPLAINT_STATUS_ORDER = ["submitted", "acknowledged", "in_progress", "resolved"]
COMPLAINT_STATUS_LABELS = {
    "submitted": "Submitted",
    "acknowledged": "Acknowledged",
    "in_progress": "In Progress",
    "resolved": "Resolved",
}


def complaint_attachment_url(attachment_id: int) -> str:
    return f"/api/complaints/attachments/{attachment_id}"


def complaint_code_for_id(complaint_id: int) -> str:
    return f"CV-{2200 + complaint_id}"


def normalize_complaint_status(value: str) -> str:
    normalized = value.strip().lower()
    if normalized not in COMPLAINT_STATUS_ORDER:
        raise ValueError("Invalid complaint status")
    return normalized


def complaint_stage_index(status: str) -> int:
    normalized = normalize_complaint_status(status)
    return COMPLAINT_STATUS_ORDER.index(normalized)


def complaint_status_label(status: str) -> str:
    return COMPLAINT_STATUS_LABELS[normalize_complaint_status(status)]


def complaint_relative_label(value: datetime | None) -> str:
    if value is None:
        return "Pending"
    local_value = value.astimezone(LOCAL_TIMEZONE)
    now = datetime.now(LOCAL_TIMEZONE)
    delta_days = (now.date() - local_value.date()).days
    if delta_days <= 0:
        return "Today"
    if delta_days == 1:
        return "Yesterday"
    return f"{delta_days} days ago"


def complaint_attachment_payload(attachment: StudentComplaintAttachment) -> dict:
    return {
        "id": attachment.id,
        "filename": attachment.filename,
        "contentType": attachment.content_type,
        "size": attachment.file_size,
        "url": complaint_attachment_url(attachment.id),
    }


def complaint_payload(
    complaint: StudentComplaint,
    *,
    student: User | None = None,
    profile: StudentProfile | None = None,
    semester_duration_months: int = 6,
) -> dict:
    student_user = student or complaint.student
    resolved_profile = profile or (student_user.student_profile if student_user else None)
    semester = (
        resolve_student_semester(resolved_profile, student_user, semester_duration_months)
        if student_user
        else None
    )
    return {
        "id": complaint.id,
        "complaintCode": complaint.complaint_code,
        "title": complaint.title,
        "category": complaint.category,
        "description": complaint.description,
        "status": normalize_complaint_status(complaint.status),
        "statusLabel": complaint_status_label(complaint.status),
        "stage": complaint_stage_index(complaint.status),
        "created": complaint_relative_label(complaint.submitted_at),
        "submittedAt": complaint.submitted_at.isoformat(),
        "acknowledgedAt": complaint.acknowledged_at.isoformat() if complaint.acknowledged_at else None,
        "inProgressAt": complaint.in_progress_at.isoformat() if complaint.in_progress_at else None,
        "resolvedAt": complaint.resolved_at.isoformat() if complaint.resolved_at else None,
        "updatedAt": complaint.updated_at.isoformat(),
        "studentId": student_user.id if student_user else None,
        "studentName": student_user.full_name if student_user else "",
        "studentEmail": student_user.email if student_user else "",
        "studentCode": resolved_profile.student_code if resolved_profile else "",
        "department": resolved_profile.department if resolved_profile else "",
        "semester": semester,
        "attachments": [complaint_attachment_payload(attachment) for attachment in complaint.attachments],
    }

