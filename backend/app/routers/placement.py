from datetime import date, datetime, timezone
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from sqlalchemy import desc
from sqlalchemy.orm import Session, load_only, selectinload

from app.attendance_flow import get_campus_attendance_setting
from app.avatar import student_avatar_url
from app.db import get_db
from app.dependencies import get_current_user
from app.intake_flow import resolve_student_semester
from app.models import PlacementApplication, PlacementNotification, PlacementRole, PlacementRoleApplication, Role, User
from app.schemas import PlacementRoleCreate, PlacementRoleDecisionRequest, PlacementSelectionRequest
from app.workers.tasks import send_placement_selection_email

router = APIRouter(prefix="/placement", tags=["placement"])

MIN_PLACEMENT_SEMESTER = 3
MIN_PLACEMENT_CGPA = 7.5
MAX_RESUME_BYTES = 8 * 1024 * 1024
RESUME_EXTENSIONS = {".pdf", ".doc", ".docx"}

PLACEMENT_APPLICATION_SUMMARY_COLUMNS = (
    PlacementApplication.id,
    PlacementApplication.student_id,
    PlacementApplication.student_name,
    PlacementApplication.student_email,
    PlacementApplication.semester,
    PlacementApplication.cgpa,
    PlacementApplication.skills,
    PlacementApplication.linkedin_profile,
    PlacementApplication.github_profile,
    PlacementApplication.phone_number,
    PlacementApplication.resume_filename,
    PlacementApplication.resume_content_type,
    PlacementApplication.resume_file_size,
    PlacementApplication.status,
    PlacementApplication.selection_message,
    PlacementApplication.selected_at,
    PlacementApplication.created_at,
    PlacementApplication.updated_at,
)


def _application_summary_options():
    return (
        load_only(*PLACEMENT_APPLICATION_SUMMARY_COLUMNS),
        selectinload(PlacementApplication.student).selectinload(User.student_profile),
    )


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


def _parse_role_deadline(value: str) -> date | None:
    cleaned = value.strip()
    if not cleaned:
        return None
    for fmt in ("%Y-%m-%d", "%b %d, %Y", "%B %d, %Y", "%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(cleaned, fmt).date()
        except ValueError:
            pass
    for fmt in ("%b %d", "%B %d", "%d %b", "%d %B"):
        try:
            parsed = datetime.strptime(cleaned, fmt)
            return date(_now().year, parsed.month, parsed.day)
        except ValueError:
            pass
    return None


def _role_deadline_expired(role: PlacementRole) -> bool:
    deadline = _parse_role_deadline(role.deadline)
    return deadline is not None and deadline < _now().date()


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
    avatar_url = student_avatar_url(application.student.student_profile if application.student else None)
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
        "avatarUrl": avatar_url,
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


def _split_criteria_skills(value: str) -> list[str]:
    return [
        item.strip()
        for item in value.replace("\n", ",").split(",")
        if item.strip()
    ]


def _missing_role_skills(role: PlacementRole, application: PlacementApplication | None) -> list[str]:
    if not application:
        return _split_criteria_skills(role.required_skills)
    skill_text = application.skills.lower()
    return [
        skill
        for skill in _split_criteria_skills(role.required_skills)
        if skill.lower() not in skill_text
    ]


def _role_readiness(
    role: PlacementRole,
    *,
    semester: int,
    cgpa: float,
    application: PlacementApplication | None,
) -> dict:
    missing_skills = _missing_role_skills(role, application)
    semester_ready = semester >= role.minimum_semester
    cgpa_ready = cgpa >= role.minimum_cgpa
    return {
        "semesterReady": semester_ready,
        "cgpaReady": cgpa_ready,
        "skillsReady": not missing_skills,
        "criteriaReady": semester_ready and cgpa_ready and not missing_skills,
        "missingSkills": missing_skills,
    }


def _role_base_payload(role: PlacementRole) -> dict:
    return {
        "id": role.id,
        "title": role.title,
        "companyName": role.company_name,
        "roleType": role.role_type,
        "location": role.location,
        "workMode": role.work_mode,
        "compensation": role.compensation,
        "deadline": role.deadline,
        "minimumSemester": role.minimum_semester,
        "minimumCgpa": role.minimum_cgpa,
        "requiredSkills": role.required_skills,
        "description": role.description,
        "status": role.status,
        "active": role.active,
        "deadlineExpired": _role_deadline_expired(role),
        "createdAt": role.created_at.isoformat(),
        "updatedAt": role.updated_at.isoformat(),
    }


def _student_role_payload(
    role: PlacementRole,
    *,
    snapshot: dict,
    application: PlacementApplication | None,
    role_application: PlacementRoleApplication | None,
) -> dict:
    readiness = _role_readiness(
        role,
        semester=snapshot["semester"],
        cgpa=snapshot["cgpa"],
        application=application,
    )
    sem_cgpa_ready = readiness["semesterReady"] and readiness["cgpaReady"]
    return {
        **_role_base_payload(role),
        **readiness,
        "profileSubmitted": application is not None,
        "canApply": application is not None and sem_cgpa_ready and role_application is None and role.status == "open",
        "applicationStatus": role_application.status if role_application else None,
        "roleApplicationId": role_application.id if role_application else None,
        "dismissedByStudent": role_application.dismissed_by_student if role_application else False,
        "decisionMessage": role_application.decision_message if role_application else None,
        "appliedAt": role_application.created_at.isoformat() if role_application else None,
        "decidedAt": role_application.decided_at.isoformat() if role_application and role_application.decided_at else None,
    }


def _role_application_payload(role_application: PlacementRoleApplication) -> dict:
    application = role_application.placement_application
    role = role_application.role
    readiness = _role_readiness(
        role,
        semester=application.semester,
        cgpa=application.cgpa,
        application=application,
    )
    return {
        "id": role_application.id,
        "roleId": role_application.role_id,
        "studentId": role_application.student_id,
        "status": role_application.status,
        "decisionMessage": role_application.decision_message,
        "dismissedByStudent": role_application.dismissed_by_student,
        "dismissedByManager": role_application.dismissed_by_manager,
        "decidedAt": role_application.decided_at.isoformat() if role_application.decided_at else None,
        "appliedAt": role_application.created_at.isoformat(),
        "updatedAt": role_application.updated_at.isoformat(),
        **readiness,
        "application": _application_payload(application),
    }


def _manager_role_payload(role: PlacementRole) -> dict:
    applicants = sorted(
        [item for item in role.applications if not item.dismissed_by_manager],
        key=lambda item: item.created_at,
        reverse=True,
    )
    return {
        **_role_base_payload(role),
        "applicants": [_role_application_payload(application) for application in applicants],
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
        .options(*_application_summary_options())
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
        .all()
    )
    if not roles:
        manager = db.query(User).filter(User.role == Role.placement).first() or current_user
        defaults = [
            PlacementRole(
                manager_id=manager.id,
                title="Full Stack & AI Systems Engineer",
                company_name="TechVerse Solutions",
                role_type="Full-time",
                location="Bengaluru / Hybrid",
                work_mode="Hybrid",
                compensation="₹ 14.5 LPA",
                deadline="30 Aug 2026",
                minimum_semester=3,
                minimum_cgpa=7.5,
                required_skills="React, Python, Fast API, SQL, AI Tools",
                description="Join TechVerse Solutions as a Full Stack & AI Engineer. Responsible for building scalable web platforms, AI service integrations, and high-performance APIs.",
                status="open",
                active=True,
            ),
            PlacementRole(
                manager_id=manager.id,
                title="Backend Systems Developer",
                company_name="Infosys",
                role_type="Full-time",
                location="Pune / Onsite",
                work_mode="Onsite",
                compensation="₹ 9.2 LPA",
                deadline="15 Aug 2026",
                minimum_semester=3,
                minimum_cgpa=7.5,
                required_skills="Python, SQL, Microservices, Git",
                description="Develop backend services, database schemas, and microservice architectures for enterprise web applications.",
                status="open",
                active=True,
            ),
            PlacementRole(
                manager_id=manager.id,
                title="Data Science & ML Associate",
                company_name="AI Tech Labs",
                role_type="Full-time",
                location="Remote",
                work_mode="Remote",
                compensation="₹ 16.0 LPA",
                deadline="25 Aug 2026",
                minimum_semester=3,
                minimum_cgpa=8.0,
                required_skills="Python, Machine Learning, PyTorch, Data Analysis",
                description="Build predictive models, NLP pipelines, and machine learning models for high-throughput enterprise systems.",
                status="open",
                active=True,
            ),
        ]
        db.add_all(defaults)
        db.commit()
        roles = (
            db.query(PlacementRole)
            .filter(PlacementRole.status == "open", PlacementRole.active.is_(True))
            .order_by(desc(PlacementRole.updated_at))
            .all()
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
        .options(*_application_summary_options())
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


@router.post("/student/roles/{role_id}/apply")
def apply_to_role(
    role_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_student(current_user)
    role = db.get(PlacementRole, role_id)
    if not role or role.status != "open" or not role.active:
        raise HTTPException(status_code=404, detail="Placement role is not available")

    snapshot = _student_snapshot(db, current_user)
    application = (
        db.query(PlacementApplication)
        .options(*_application_summary_options())
        .filter(PlacementApplication.student_id == current_user.id)
        .first()
    )
    if not application:
        raise HTTPException(status_code=409, detail="Submit your placement profile before applying for roles")
    if snapshot["semester"] < role.minimum_semester or snapshot["cgpa"] < role.minimum_cgpa:
        raise HTTPException(status_code=409, detail="You do not meet this role's semester or CGPA criteria")

    role_application = (
        db.query(PlacementRoleApplication)
        .filter(
            PlacementRoleApplication.role_id == role.id,
            PlacementRoleApplication.student_id == current_user.id,
        )
        .first()
    )
    if role_application:
        return {
            "ok": True,
            "role": _student_role_payload(
                role,
                snapshot=snapshot,
                application=application,
                role_application=role_application,
            ),
            "message": f"You already applied for {role.title}",
        }

    role_application = PlacementRoleApplication(
        role_id=role.id,
        student_id=current_user.id,
        placement_application_id=application.id,
        status="applied",
    )
    db.add(role_application)
    db.commit()
    db.refresh(role_application)
    return {
        "ok": True,
        "role": _student_role_payload(
            role,
            snapshot=snapshot,
            application=application,
            role_application=role_application,
        ),
        "message": f"Applied for {role.title}",
    }


@router.delete("/student/roles/{role_id}/application")
def dismiss_role_application(
    role_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_student(current_user)
    role_application = (
        db.query(PlacementRoleApplication)
        .filter(
            PlacementRoleApplication.role_id == role_id,
            PlacementRoleApplication.student_id == current_user.id,
        )
        .first()
    )
    if not role_application:
        raise HTTPException(status_code=404, detail="Role application not found")
    if role_application.status not in {"accepted", "rejected"}:
        raise HTTPException(status_code=409, detail="Only accepted or rejected role history can be removed")

    role_application.dismissed_by_student = True
    role_application.updated_at = _now()
    db.commit()
    return {
        "ok": True,
        "roleId": role_id,
        "message": "Role history removed from Open roles",
    }


@router.get("/manager/dashboard")
def manager_dashboard(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_placement_manager(current_user)
    applications = (
        db.query(PlacementApplication)
        .options(*_application_summary_options())
        .filter(
            PlacementApplication.semester >= MIN_PLACEMENT_SEMESTER,
            PlacementApplication.cgpa >= MIN_PLACEMENT_CGPA,
        )
        .order_by(desc(PlacementApplication.updated_at))
        .all()
    )
    roles = (
        db.query(PlacementRole)
        .options(
            selectinload(PlacementRole.applications)
            .selectinload(PlacementRoleApplication.placement_application)
            .options(*_application_summary_options())
        )
        .filter(PlacementRole.manager_id == current_user.id, PlacementRole.active.is_(True))
        .order_by(desc(PlacementRole.updated_at))
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
        "roles": [_manager_role_payload(role) for role in roles],
    }


@router.post("/manager/roles")
def create_role(
    payload: PlacementRoleCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_placement_manager(current_user)
    role = PlacementRole(
        manager_id=current_user.id,
        title=payload.title,
        company_name=payload.company_name,
        role_type=payload.role_type,
        location=payload.location,
        work_mode=payload.work_mode,
        compensation=payload.compensation,
        deadline=payload.deadline,
        minimum_semester=payload.minimum_semester,
        minimum_cgpa=payload.minimum_cgpa,
        required_skills=payload.required_skills,
        description=payload.description,
        status="open",
        active=True,
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    return {
        "ok": True,
        "role": _manager_role_payload(role),
        "message": f"{role.title} role created",
    }


@router.delete("/manager/roles/{role_id}")
def delete_expired_role(
    role_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_placement_manager(current_user)
    role = db.get(PlacementRole, role_id)
    if not role or role.manager_id != current_user.id or not role.active:
        raise HTTPException(status_code=404, detail="Placement role not found")
    if not _role_deadline_expired(role):
        raise HTTPException(status_code=409, detail="Role can be deleted after its deadline has passed")

    role.active = False
    role.status = "closed"
    role.updated_at = _now()
    db.commit()
    return {
        "ok": True,
        "roleId": role_id,
        "message": f"{role.title} role removed",
    }


@router.post("/manager/roles/{role_id}/applications/{role_application_id}/decision")
def decide_role_application(
    role_id: int,
    role_application_id: int,
    payload: PlacementRoleDecisionRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_placement_manager(current_user)
    role = db.get(PlacementRole, role_id)
    if not role or role.manager_id != current_user.id:
        raise HTTPException(status_code=404, detail="Placement role not found")
    role_application = (
        db.query(PlacementRoleApplication)
        .options(
            selectinload(PlacementRoleApplication.placement_application).options(*_application_summary_options())
        )
        .filter(
            PlacementRoleApplication.id == role_application_id,
            PlacementRoleApplication.role_id == role.id,
        )
        .first()
    )
    if not role_application:
        raise HTTPException(status_code=404, detail="Role application not found")

    application = role_application.placement_application
    moment = _now()
    if payload.status == "accepted":
        message = payload.message or f"Dear {application.student_name}, You're accepted for {role.title} at {role.company_name}."
        title = "Placement role accepted"
    else:
        message = payload.message or (
            f"Dear {application.student_name}, your application for {role.title} at {role.company_name} was rejected."
        )
        title = "Placement role rejected"

    role_application.status = payload.status
    role_application.decision_message = message
    role_application.decided_by_id = current_user.id
    role_application.decided_at = moment
    role_application.dismissed_by_student = False
    role_application.dismissed_by_manager = False
    role_application.updated_at = moment
    db.add(
        PlacementNotification(
            student_id=role_application.student_id,
            application_id=application.id,
            title=title,
            body=message,
            channel="placement",
            created_at=moment,
        )
    )
    db.commit()
    db.refresh(role_application)
    role_application.role = role
    return {
        "ok": True,
        "roleApplication": _role_application_payload(role_application),
        "notification": message,
    }


@router.delete("/manager/roles/{role_id}/applications/{role_application_id}")
def dismiss_role_applicant(
    role_id: int,
    role_application_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_placement_manager(current_user)
    role = db.get(PlacementRole, role_id)
    if not role or role.manager_id != current_user.id:
        raise HTTPException(status_code=404, detail="Placement role not found")
    role_application = (
        db.query(PlacementRoleApplication)
        .filter(
            PlacementRoleApplication.id == role_application_id,
            PlacementRoleApplication.role_id == role.id,
        )
        .first()
    )
    if not role_application:
        raise HTTPException(status_code=404, detail="Role application not found")
    if role_application.status not in {"accepted", "rejected"}:
        raise HTTPException(status_code=409, detail="Only accepted or rejected applicants can be removed")

    role_application.dismissed_by_manager = True
    role_application.updated_at = _now()
    db.commit()
    return {
        "ok": True,
        "roleId": role_id,
        "roleApplicationId": role_application_id,
        "message": "Applicant removed from Eligible applicants",
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
