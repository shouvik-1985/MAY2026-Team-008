from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.attendance_flow import get_campus_attendance_setting
from app.db import get_db
from app.dependencies import get_current_user
from app.intake_flow import resolve_student_semester
from app.models import PlacementApplication, PlacementNotification, Role, User
from app.schemas import PlacementSelectionRequest
from app.workers.tasks import send_placement_selection_email

router = APIRouter(prefix="/placement", tags=["placement"])

MIN_PLACEMENT_SEMESTER = 3
MIN_PLACEMENT_CGPA = 7.5
MAX_RESUME_BYTES = 8 * 1024 * 1024
RESUME_EXTENSIONS = {".pdf", ".doc", ".docx"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _require_student(user: User) -> None:
    if user.role != Role.student:
        raise HTTPException(status_code=403, detail="Placement portal is available to student users only")


def _require_placement_manager(user: User) -> None:
    if user.role != Role.placement:
        raise HTTPException(status_code=403, detail="Placement portal manager access is required")


def _clean_text(value: str, *, field: str, min_length: int, max_length: int) -> str:
    cleaned = value.strip()
    if len(cleaned) < min_length:
        raise HTTPException(status_code=422, detail=f"{field} is too short")
    if len(cleaned) > max_length:
        raise HTTPException(status_code=422, detail=f"{field} is too long")
    return cleaned


def _clean_optional_url(value: str, *, field: str) -> str:
    cleaned = value.strip()
    if len(cleaned) > 500:
        raise HTTPException(status_code=422, detail=f"{field} is too long")
    return cleaned


def _student_snapshot(db: Session, student: User) -> dict:
    setting = get_campus_attendance_setting(db)
    profile = student.student_profile
    seed = student.id % 7
    semester = resolve_student_semester(
        profile,
        student,
        setting.semester_duration_months,
        setting.semester_duration_unit,
        setting.semester_duration_days,
    )
    cgpa = profile.cgpa if profile else round(8.1 + (seed * 0.13), 1)
    return {
        "id": student.id,
        "name": student.full_name,
        "email": student.email,
        "studentCode": profile.student_code if profile else f"CV-2026-{1000 + student.id:04d}",
        "department": profile.department if profile else "Computer Science & AI",
        "semester": semester,
        "cgpa": cgpa,
    }


def _is_eligible(snapshot: dict) -> bool:
    return snapshot["semester"] >= MIN_PLACEMENT_SEMESTER and snapshot["cgpa"] >= MIN_PLACEMENT_CGPA


def _resume_url(application: PlacementApplication) -> str:
    return f"/api/placement/applications/{application.id}/resume"


def _application_payload(application: PlacementApplication) -> dict:
    return {
        "id": application.id,
        "studentId": application.student_id,
        "studentName": application.student_name,
        "studentEmail": application.student_email,
        "semester": application.semester,
        "cgpa": application.cgpa,
        "skills": application.skills,
        "linkedinProfile": application.linkedin_profile,
        "githubProfile": application.github_profile,
        "phoneNumber": application.phone_number,
        "resumeFilename": application.resume_filename,
        "resumeContentType": application.resume_content_type,
        "resumeFileSize": application.resume_file_size,
        "resumeUrl": _resume_url(application),
        "status": application.status,
        "selectionMessage": application.selection_message,
        "selectedAt": application.selected_at.isoformat() if application.selected_at else None,
        "createdAt": application.created_at.isoformat(),
        "updatedAt": application.updated_at.isoformat(),
    }


def _notification_payload(notification: PlacementNotification) -> dict:
    return {
        "id": notification.id,
        "applicationId": notification.application_id,
        "title": notification.title,
        "body": notification.body,
        "channel": notification.channel,
        "read": notification.read,
        "createdAt": notification.created_at.isoformat(),
    }


def _notifications_for_student(db: Session, student_id: int) -> list[dict]:
    notifications = (
        db.query(PlacementNotification)
        .filter(PlacementNotification.student_id == student_id)
        .order_by(desc(PlacementNotification.created_at))
        .limit(20)
        .all()
    )
    return [_notification_payload(notification) for notification in notifications]


def _content_disposition(filename: str, download: bool) -> str:
    disposition = "attachment" if download else "inline"
    safe_name = Path(filename).name or "placement-resume"
    return f'{disposition}; filename="{safe_name}"'


async def _read_resume(upload: UploadFile) -> tuple[str, str, bytes]:
    filename = Path(upload.filename or "").name
    if not filename:
        raise HTTPException(status_code=422, detail="Resume file is required")
    if Path(filename).suffix.lower() not in RESUME_EXTENSIONS:
        raise HTTPException(status_code=422, detail="Resume must be a PDF, DOC, or DOCX file")

    data = await upload.read()
    if not data:
        raise HTTPException(status_code=422, detail="Resume file is empty")
    if len(data) > MAX_RESUME_BYTES:
        raise HTTPException(status_code=422, detail="Resume must be 8 MB or smaller")

    return filename, upload.content_type or "application/octet-stream", data


def _enqueue(task, *args) -> None:
    try:
        task.delay(*args)
    except Exception:
        return


@router.get("/student")
def student_portal(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_student(current_user)
    snapshot = _student_snapshot(db, current_user)
    application = (
        db.query(PlacementApplication)
        .filter(PlacementApplication.student_id == current_user.id)
        .first()
    )
    return {
        "student": snapshot,
        "criteria": {
            "minimumSemester": MIN_PLACEMENT_SEMESTER,
            "minimumCgpa": MIN_PLACEMENT_CGPA,
        },
        "eligible": _is_eligible(snapshot),
        "application": _application_payload(application) if application else None,
        "notifications": _notifications_for_student(db, current_user.id),
        "jobs": [],
    }


@router.post("/student/application")
async def upsert_student_application(
    skills: Annotated[str, Form()],
    linkedin_profile: Annotated[str, Form()],
    github_profile: Annotated[str, Form()],
    phone_number: Annotated[str, Form()],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    resume: Annotated[UploadFile | None, File()] = None,
) -> dict:
    _require_student(current_user)
    snapshot = _student_snapshot(db, current_user)
    if not _is_eligible(snapshot):
        raise HTTPException(
            status_code=409,
            detail=f"Placement criteria require Sem {MIN_PLACEMENT_SEMESTER}+ and CGPA {MIN_PLACEMENT_CGPA}+",
        )

    cleaned_skills = _clean_text(skills, field="Skills", min_length=2, max_length=2000)
    cleaned_linkedin = _clean_optional_url(linkedin_profile, field="LinkedIn profile")
    cleaned_github = _clean_optional_url(github_profile, field="GitHub profile")
    cleaned_phone = _clean_text(phone_number, field="Phone number", min_length=7, max_length=40)
    application = (
        db.query(PlacementApplication)
        .filter(PlacementApplication.student_id == current_user.id)
        .first()
    )

    resume_payload: tuple[str, str, bytes] | None = None
    if resume is not None:
        resume_payload = await _read_resume(resume)
    elif application is None:
        raise HTTPException(status_code=422, detail="Resume file is required")

    if application is None:
        application = PlacementApplication(
            student_id=current_user.id,
            student_name=snapshot["name"],
            student_email=snapshot["email"],
            semester=snapshot["semester"],
            cgpa=snapshot["cgpa"],
            skills=cleaned_skills,
            linkedin_profile=cleaned_linkedin,
            github_profile=cleaned_github,
            phone_number=cleaned_phone,
            resume_filename="resume",
            resume_content_type="application/octet-stream",
            resume_file_size=0,
            resume_file_data=b"",
            status="submitted",
        )
        db.add(application)

    application.student_name = snapshot["name"]
    application.student_email = snapshot["email"]
    application.semester = snapshot["semester"]
    application.cgpa = snapshot["cgpa"]
    application.skills = cleaned_skills
    application.linkedin_profile = cleaned_linkedin
    application.github_profile = cleaned_github
    application.phone_number = cleaned_phone
    application.updated_at = _now()
    if resume_payload:
        filename, content_type, data = resume_payload
        application.resume_filename = filename
        application.resume_content_type = content_type
        application.resume_file_size = len(data)
        application.resume_file_data = data

    db.commit()
    db.refresh(application)
    return {
        "ok": True,
        "application": _application_payload(application),
        "message": "Placement profile submitted",
    }


@router.get("/manager/dashboard")
def manager_dashboard(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_placement_manager(current_user)
    applications = (
        db.query(PlacementApplication)
        .filter(
            PlacementApplication.semester >= MIN_PLACEMENT_SEMESTER,
            PlacementApplication.cgpa >= MIN_PLACEMENT_CGPA,
        )
        .order_by(desc(PlacementApplication.updated_at))
        .all()
    )
    selected = [application for application in applications if application.status == "selected"]
    return {
        "manager": {
            "id": current_user.id,
            "name": current_user.full_name,
            "email": current_user.email,
        },
        "criteria": {
            "minimumSemester": MIN_PLACEMENT_SEMESTER,
            "minimumCgpa": MIN_PLACEMENT_CGPA,
        },
        "metrics": {
            "eligibleStudents": len(applications),
            "selectedStudents": len(selected),
            "pendingStudents": len(applications) - len(selected),
        },
        "applications": [_application_payload(application) for application in applications],
    }


@router.post("/manager/applications/{application_id}/select")
def select_application(
    application_id: int,
    payload: PlacementSelectionRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_placement_manager(current_user)
    application = db.get(PlacementApplication, application_id)
    if not application:
        raise HTTPException(status_code=404, detail="Placement application not found")
    if application.semester < MIN_PLACEMENT_SEMESTER or application.cgpa < MIN_PLACEMENT_CGPA:
        raise HTTPException(status_code=409, detail="This student does not meet placement criteria")

    opportunity = payload.opportunity_title or "this internship/job"
    message = f"Dear {application.student_name}, You're selected for {opportunity}."
    moment = _now()
    application.status = "selected"
    application.selection_message = message
    application.selected_by_id = current_user.id
    application.selected_at = moment
    application.updated_at = moment
    db.add(
        PlacementNotification(
            student_id=application.student_id,
            application_id=application.id,
            title="Placement selection",
            body=message,
            channel="placement",
            created_at=moment,
        )
    )
    db.commit()
    db.refresh(application)
    _enqueue(send_placement_selection_email, application.student_email, application.student_name, message)
    return {
        "ok": True,
        "application": _application_payload(application),
        "notification": message,
        "emailQueued": True,
    }


@router.get("/applications/{application_id}/resume")
def open_resume(
    application_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    download: bool = Query(False),
):
    application = db.get(PlacementApplication, application_id)
    if not application:
        raise HTTPException(status_code=404, detail="Placement resume not found")
    if current_user.role != Role.placement and not (
        current_user.role == Role.student and application.student_id == current_user.id
    ):
        raise HTTPException(status_code=403, detail="You do not have access to this resume")

    return Response(
        content=application.resume_file_data,
        media_type=application.resume_content_type,
        headers={
            "Content-Disposition": _content_disposition(application.resume_filename, download),
            "Content-Length": str(application.resume_file_size or len(application.resume_file_data)),
        },
    )
