from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from sqlalchemy.orm import Session, load_only, selectinload

from app.attendance_flow import get_campus_attendance_setting, now_utc
from app.complaint_flow import complaint_code_for_id, complaint_payload, normalize_complaint_status
from app.db import get_db
from app.dependencies import get_current_user
from app.models import Role, StudentComplaint, StudentComplaintAttachment, User
from app.schemas import AdminComplaintStatusUpdate

router = APIRouter(prefix="/complaints", tags=["complaints"])


def _complaint_attachment_metadata():
    return selectinload(StudentComplaint.attachments).load_only(
        StudentComplaintAttachment.id,
        StudentComplaintAttachment.complaint_id,
        StudentComplaintAttachment.filename,
        StudentComplaintAttachment.content_type,
        StudentComplaintAttachment.file_size,
    )


def _require_student(user: User) -> None:
    if user.role != Role.student:
        raise HTTPException(status_code=403, detail="This action is available to student users only")


def _require_admin(user: User) -> None:
    if user.role != Role.admin:
        raise HTTPException(status_code=403, detail="This action is available to admin users only")


def _clean_text(value: str, *, field: str, min_length: int, max_length: int) -> str:
    cleaned = value.strip()
    if len(cleaned) < min_length:
        raise HTTPException(status_code=422, detail=f"{field} is too short")
    if len(cleaned) > max_length:
        raise HTTPException(status_code=422, detail=f"{field} is too long")
    return cleaned


def _content_disposition(filename: str, download: bool) -> str:
    disposition = "attachment" if download else "inline"
    safe_name = Path(filename).name or "complaint-proof"
    return f'{disposition}; filename="{safe_name}"'


@router.get("/me")
def list_student_complaints(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_student(current_user)
    setting = get_campus_attendance_setting(db)
    complaints = (
        db.query(StudentComplaint)
        .options(
            _complaint_attachment_metadata(),
            selectinload(StudentComplaint.student).selectinload(User.student_profile),
        )
        .filter(StudentComplaint.student_id == current_user.id)
        .order_by(StudentComplaint.submitted_at.desc())
        .all()
    )
    return {
        "ok": True,
        "complaints": [
            complaint_payload(
                complaint,
                student=current_user,
                profile=current_user.student_profile,
                semester_duration_months=setting.semester_duration_months,
                semester_duration_unit=setting.semester_duration_unit,
                semester_duration_days=setting.semester_duration_days,
            )
            for complaint in complaints
        ],
    }


@router.post("")
async def create_student_complaint(
    title: Annotated[str, Form()],
    description: Annotated[str, Form()],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    category: Annotated[str, Form()] = "Student Services",
    files: Annotated[list[UploadFile] | None, File()] = None,
) -> dict:
    _require_student(current_user)
    cleaned_title = _clean_text(title, field="Complaint title", min_length=3, max_length=180)
    cleaned_description = _clean_text(description, field="Complaint details", min_length=10, max_length=4000)
    cleaned_category = category.strip()[:120] or "Student Services"

    complaint = StudentComplaint(
        student_id=current_user.id,
        complaint_code=f"TMP-{current_user.id}-{int(now_utc().timestamp() * 1000000)}",
        title=cleaned_title,
        category=cleaned_category,
        description=cleaned_description,
        status="submitted",
        submitted_at=now_utc(),
    )
    db.add(complaint)
    db.flush()
    complaint.complaint_code = complaint_code_for_id(complaint.id)

    for upload in files or []:
        filename = Path(upload.filename or "").name
        if not filename:
            continue
        payload = await upload.read()
        db.add(
            StudentComplaintAttachment(
                complaint_id=complaint.id,
                filename=filename,
                content_type=upload.content_type or "application/octet-stream",
                file_size=len(payload),
                file_data=payload,
            )
        )

    db.commit()
    db.refresh(complaint)
    complaint = (
        db.query(StudentComplaint)
        .options(
            _complaint_attachment_metadata(),
            selectinload(StudentComplaint.student).selectinload(User.student_profile),
        )
        .filter(StudentComplaint.id == complaint.id)
        .first()
    )
    setting = get_campus_attendance_setting(db)
    return {
        "ok": True,
        "complaint": complaint_payload(
            complaint,
            student=current_user,
            profile=current_user.student_profile,
            semester_duration_months=setting.semester_duration_months,
            semester_duration_unit=setting.semester_duration_unit,
            semester_duration_days=setting.semester_duration_days,
        ),
    }


@router.get("/admin")
def list_admin_complaints(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_admin(current_user)
    setting = get_campus_attendance_setting(db)
    complaints = (
        db.query(StudentComplaint)
        .options(
            _complaint_attachment_metadata(),
            selectinload(StudentComplaint.student).selectinload(User.student_profile),
        )
        .order_by(StudentComplaint.submitted_at.desc())
        .all()
    )
    return {
        "ok": True,
        "complaints": [
            complaint_payload(
                complaint,
                semester_duration_months=setting.semester_duration_months,
                semester_duration_unit=setting.semester_duration_unit,
                semester_duration_days=setting.semester_duration_days,
            )
            for complaint in complaints
        ],
    }


@router.patch("/{complaint_id}/status")
def update_admin_complaint_status(
    complaint_id: int,
    payload: AdminComplaintStatusUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_admin(current_user)
    complaint = db.get(StudentComplaint, complaint_id)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    current_status = normalize_complaint_status(complaint.status)
    target_status = normalize_complaint_status(payload.status)
    order = ["submitted", "acknowledged", "in_progress", "resolved"]
    current_index = order.index(current_status)
    target_index = order.index(target_status)

    if target_index < current_index:
        raise HTTPException(status_code=400, detail="Complaint status cannot move backwards")
    if target_index > current_index + 1:
        raise HTTPException(status_code=400, detail="Move the complaint through the status steps in order")

    moment = now_utc()
    if target_status == "acknowledged" and complaint.acknowledged_at is None:
        complaint.acknowledged_at = moment
    elif target_status == "in_progress" and complaint.in_progress_at is None:
        complaint.in_progress_at = moment
    elif target_status == "resolved" and complaint.resolved_at is None:
        complaint.resolved_at = moment

    complaint.status = target_status
    complaint.updated_at = moment
    db.commit()

    setting = get_campus_attendance_setting(db)
    refreshed = (
        db.query(StudentComplaint)
        .options(
            _complaint_attachment_metadata(),
            selectinload(StudentComplaint.student).selectinload(User.student_profile),
        )
        .filter(StudentComplaint.id == complaint_id)
        .first()
    )
    return {
        "ok": True,
        "complaint": complaint_payload(
            refreshed,
            semester_duration_months=setting.semester_duration_months,
            semester_duration_unit=setting.semester_duration_unit,
            semester_duration_days=setting.semester_duration_days,
        ),
    }


@router.get("/attachments/{attachment_id}")
def open_complaint_attachment(
    attachment_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    download: bool = Query(False),
):
    attachment = db.get(StudentComplaintAttachment, attachment_id)
    if not attachment:
        raise HTTPException(status_code=404, detail="Complaint proof not found")

    complaint = db.get(StudentComplaint, attachment.complaint_id)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    if current_user.role != Role.admin and not (
        current_user.role == Role.student and complaint.student_id == current_user.id
    ):
        raise HTTPException(status_code=403, detail="You do not have access to this complaint proof")

    return Response(
        content=attachment.file_data,
        media_type=attachment.content_type,
        headers={
            "Content-Disposition": _content_disposition(attachment.filename, download),
            "Content-Length": str(attachment.file_size or len(attachment.file_data)),
        },
    )
