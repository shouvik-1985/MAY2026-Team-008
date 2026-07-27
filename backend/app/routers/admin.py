from datetime import date, datetime, timedelta, timezone
from statistics import mean
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.attendance_flow import campus_setting_payload, get_campus_attendance_setting, now_utc
from app.avatar import avatar_initials, student_avatar_url
from app.db import get_db
from app.dependencies import get_current_user
from app.fee_flow import admin_fee_management_payload, update_semester_fee_amount
from app.intake_flow import resolve_student_semester, slot_batches_payload
from app.models import (
    Announcement,
    AssignmentReview,
    CampusAttendanceSetting,
    ConnectAttachment,
    ConnectMessage,
    ConnectMessageHidden,
    ConnectRelationship,
    IntakeSlotBatch,
    PlacementApplication,
    PlacementNotification,
    ProfessorProfile,
    RevokedToken,
    Role,
    StudentAttendance,
    StudentBiometricCheckIn,
    StudentCertificateRequest,
    StudentComplaint,
    StudentComplaintAttachment,
    StudentFeeInvoice,
    StudentProfile,
    StudentTodo,
    StudyResource,
    User,
)
from app.schemas import (
    AdminDashboard,
    CampusAttendanceSettingsOut,
    CampusAttendanceSettingsUpdate,
    SemesterDurationUpdate,
    SlotBatchCreate,
    SlotBatchUpdate,
    StudentBlockUpdate,
)

router = APIRouter(prefix="/admin", tags=["admin"])
LOCAL_TIMEZONE = ZoneInfo("Asia/Kolkata")


def _require_admin(user: User) -> None:
    if user.role != Role.admin:
        raise HTTPException(status_code=403, detail="Admin management is available to admin users only")


def _avatar(name: str) -> str:
    return avatar_initials(name, "CA")


def _today() -> date:
    return datetime.now(LOCAL_TIMEZONE).date()


def _student_code(user_id: int) -> str:
    return f"CV-2026-{1000 + user_id:04d}"


def _attendance_counts(db: Session) -> dict[int, dict[str, int]]:
    counts: dict[int, dict[str, int]] = {}
    records = db.query(StudentAttendance.student_id, StudentAttendance.status).all()
    for student_id, status in records:
        bucket = counts.setdefault(student_id, {"present": 0, "absent": 0, "total": 0})
        bucket["total"] += 1
        if status == "present":
            bucket["present"] += 1
        elif status == "absent":
            bucket["absent"] += 1
    return counts


def _student_rows(db: Session) -> list[dict]:
    students = db.query(User).filter(User.role == Role.student).order_by(User.created_at.desc()).all()
    setting = get_campus_attendance_setting(db)
    slot_batches = {
        batch.id: batch.batch_name
        for batch in db.query(IntakeSlotBatch).all()
    }
    profiles = {
        profile.user_id: profile
        for profile in db.query(StudentProfile).all()
    }
    attendance_counts = _attendance_counts(db)
    rows: list[dict] = []
    for student in students:
        profile = profiles.get(student.id)
        semester = resolve_student_semester(
            profile,
            student,
            setting.semester_duration_months,
            setting.semester_duration_unit,
            setting.semester_duration_days,
        )
        counts = attendance_counts.get(student.id, {"present": 0, "absent": 0, "total": 0})
        attendance = (
            round((counts["present"] / counts["total"]) * 100, 1)
            if counts["total"]
            else round(profile.attendance if profile else 0, 1)
        )
        rows.append(
            {
                "id": student.id,
                "name": student.full_name,
                "email": student.email,
                "studentCode": profile.student_code if profile else _student_code(student.id),
                "address": profile.address if profile else "Campus Residence",
                "department": profile.department if profile else "Computer Science & AI",
                "semester": semester,
                "cgpa": round(profile.cgpa if profile else 0, 2),
                "attendance": attendance,
                "attendanceMarked": counts["total"],
                "presentCount": counts["present"],
                "absentCount": counts["absent"],
                "status": "blocked" if student.is_blocked else "active" if attendance >= 75 else "watch",
                "isBlocked": student.is_blocked,
                "blockReason": student.block_reason or "Active account",
                "blockedAt": student.blocked_at.astimezone(LOCAL_TIMEZONE).isoformat() if student.blocked_at else "",
                "createdAt": student.created_at.astimezone(LOCAL_TIMEZONE).isoformat() if student.created_at else "",
                "lastSeenAt": student.last_seen_at.astimezone(LOCAL_TIMEZONE).isoformat() if student.last_seen_at else "",
                "avatar": _avatar(student.full_name),
                "avatarUrl": student_avatar_url(profile),
                "authProvider": student.auth_provider.value,
                "slotBatchName": slot_batches.get(profile.slot_batch_id) if profile and profile.slot_batch_id else "",
                "enrollmentDate": profile.enrollment_date.isoformat() if profile and profile.enrollment_date else "",
            }
        )
    return rows


def _professor_rows(db: Session) -> list[dict]:
    professors = db.query(User).filter(User.role == Role.faculty).order_by(User.created_at.desc()).all()
    students_managed = db.query(User).filter(User.role == Role.student).count()
    profiles = {
        profile.user_id: profile
        for profile in db.query(ProfessorProfile).all()
    }
    rows: list[dict] = []
    for professor in professors:
        profile = profiles.get(professor.id)
        rows.append(
            {
                "id": professor.id,
                "name": professor.full_name,
                "email": professor.email,
                "address": profile.address if profile else "Campus Residence",
                "department": profile.department if profile else "Computer Science & AI",
                "designation": profile.designation if profile else "Professor",
                "gender": profile.gender if profile else "",
                "expertiseField": profile.expertise_field if profile else "Academic operations",
                "highestEducation": profile.highest_education if profile else "N/A",
                "verificationStatus": profile.verification_status if profile else "pending",
                "licenseDocumentName": profile.license_document_name if profile else "Not submitted",
                "studentsManaged": students_managed,
                "status": "blocked" if professor.is_blocked else "active",
                "blockReason": professor.block_reason or "Active account",
                "blockedAt": professor.blocked_at.astimezone(LOCAL_TIMEZONE).isoformat() if professor.blocked_at else "",
                "createdAt": professor.created_at.astimezone(LOCAL_TIMEZONE).isoformat() if professor.created_at else "",
                "lastSeenAt": professor.last_seen_at.astimezone(LOCAL_TIMEZONE).isoformat() if professor.last_seen_at else "",
                "avatar": _avatar(professor.full_name),
                "authProvider": professor.auth_provider.value,
                "isBlocked": professor.is_blocked,
            }
        )
    return rows


def _attendance_overview(db: Session, total_students: int) -> list[dict]:
    end = _today()
    start = end - timedelta(days=4)
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
    for offset in range(5):
        current_day = start + timedelta(days=offset)
        bucket = by_day.get(current_day, {"present": 0, "absent": 0})
        marked = bucket["present"] + bucket["absent"]
        attendance = round((bucket["present"] / marked) * 100, 1) if marked else 0.0
        rows.append(
            {
                "date": current_day.isoformat(),
                "label": current_day.strftime("%d %b").upper(),
                "present": bucket["present"],
                "absent": bucket["absent"],
                "total": total_students,
                "attendance": attendance,
            }
        )
    return rows


def _metric_rows(students: list[dict], professors: list[dict], attendance: list[dict]) -> list[dict]:
    verified_professors = len([item for item in professors if item["verificationStatus"] == "verified"])
    blocked_students = len([item for item in students if item["isBlocked"]])
    blocked_professors = len([item for item in professors if item["isBlocked"]])
    avg_student_cgpa = round(mean([item["cgpa"] for item in students]), 2) if students else 0.0
    avg_attendance = round(mean([item["attendance"] for item in students]), 1) if students else 0.0
    return [
        {
            "label": "Enrolled student accounts",
            "value": str(len(students)),
            "hint": "Live registered student count",
        },
        {
            "label": "Verified faculty accounts",
            "value": str(verified_professors),
            "hint": f"{len(professors)} total professor accounts",
        },
        {
            "label": "Campus-wide student attendance",
            "value": f"{avg_attendance:.0f}%",
            "hint": "Average attendance across student records",
        },
        {
            "label": f"{blocked_students} students, {blocked_professors} professors blocked",
            "value": str(blocked_students + blocked_professors),
            "hint": "Current restricted accounts",
        },
        {
            "label": "Active student average",
            "value": f"{avg_student_cgpa:.2f}",
            "hint": "Average CGPA across student profiles",
        },
    ]


def _ratio_overview(student_count: int, professor_count: int) -> list[dict]:
    admin_count = 1
    total_accounts = max(student_count + professor_count + admin_count, 1)
    return [
        {
            "label": "Students",
            "count": student_count,
            "share": round((student_count / total_accounts) * 100, 1),
            "accent": "oklch(0.82 0.18 200)",
        },
        {
            "label": "Professors",
            "count": professor_count,
            "share": round((professor_count / total_accounts) * 100, 1),
            "accent": "oklch(0.72 0.27 350)",
        },
    ]


def _management_out(db: Session, setting: CampusAttendanceSetting) -> CampusAttendanceSettingsOut:
    slot_batches, active_slot_batch = slot_batches_payload(db)
    payload = campus_setting_payload(setting)
    payload["slot_batches"] = slot_batches
    payload["active_slot_batch"] = active_slot_batch
    return CampusAttendanceSettingsOut(**payload)


def _require_manageable_user(actor: User, target: User | None) -> User:
    if not target:
        raise HTTPException(status_code=404, detail="Account not found")
    if target.role == Role.admin:
        raise HTTPException(status_code=400, detail="Admin accounts cannot be changed here")
    if target.id == actor.id:
        raise HTTPException(status_code=400, detail="You cannot modify your own admin account here")
    return target


def _apply_block_state(target: User, actor: User, blocked: bool, reason: str | None) -> None:
    target.is_blocked = blocked
    target.block_reason = (reason or "Blocked by admin").strip() if blocked else None
    target.blocked_at = now_utc() if blocked else None
    target.blocked_by_id = actor.id if blocked else None


def _delete_connect_data(db: Session, user_id: int) -> None:
    message_ids = [
        row[0]
        for row in db.query(ConnectMessage.id)
        .filter(or_(ConnectMessage.sender_id == user_id, ConnectMessage.receiver_id == user_id))
        .all()
    ]
    if message_ids:
        db.query(ConnectAttachment).filter(ConnectAttachment.message_id.in_(message_ids)).delete(synchronize_session=False)
        db.query(ConnectMessageHidden).filter(ConnectMessageHidden.message_id.in_(message_ids)).delete(synchronize_session=False)
    db.query(ConnectMessageHidden).filter(ConnectMessageHidden.user_id == user_id).delete(synchronize_session=False)
    db.query(ConnectMessage).filter(
        or_(ConnectMessage.sender_id == user_id, ConnectMessage.receiver_id == user_id)
    ).delete(synchronize_session=False)
    db.query(ConnectRelationship).filter(
        or_(
            ConnectRelationship.user_low_id == user_id,
            ConnectRelationship.user_high_id == user_id,
            ConnectRelationship.requester_id == user_id,
            ConnectRelationship.receiver_id == user_id,
            ConnectRelationship.blocked_by_id == user_id,
        )
    ).delete(synchronize_session=False)


class SemesterFeeUpdate(BaseModel):
    amount: int = Field(ge=1, le=10_000_000)


ACTIVE_CERTIFICATE_KEYS = {"bonafide", "conduct", "graduation"}


class CertificateApprovalPayload(BaseModel):
    purpose: str | None = Field(default=None, max_length=180)
    certificate_body: str | None = Field(default=None, max_length=1200)
    signatory_name: str | None = Field(default=None, max_length=120)
    signatory_title: str | None = Field(default=None, max_length=160)
    admin_note: str | None = Field(default=None, max_length=800)


def _clean_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _certificate_default_body(
    req: StudentCertificateRequest,
    student: User,
    profile: StudentProfile | None,
    semester: int,
) -> str:
    student_code = profile.student_code if profile else _student_code(student.id)
    department = profile.department if profile else "Computer Science & AI"
    cgpa = profile.cgpa if profile else 0
    attendance = profile.attendance if profile else 0
    if req.certificate_key == "graduation":
        return (
            f"{student.full_name} ({student_code}) has successfully completed Semester 4 of the "
            f"{department} program and has fulfilled all prescribed academic requirements for graduation."
        )
    if req.certificate_key == "conduct":
        return (
            f"This is to certify that {student.full_name} ({student_code}) of the {department} program "
            f"has maintained good conduct, academic discipline, CGPA {cgpa:.2f}, and verified attendance "
            f"of {attendance:.1f}% during the enrolled academic term."
        )
    return (
        f"This is to certify that {student.full_name} ({student_code}) is a bona fide student of the "
        f"{department} program, currently enrolled in Semester {semester}, as verified by CampusVerse records."
    )


def _certificate_request_payload(
    db: Session,
    req: StudentCertificateRequest,
    student: User,
    profile: StudentProfile | None,
) -> dict:
    setting = get_campus_attendance_setting(db)
    semester = resolve_student_semester(
        profile,
        student,
        setting.semester_duration_months,
        setting.semester_duration_unit,
        setting.semester_duration_days,
    )
    status_labels = {
        "requested": "Requested",
        "ready": "Approved",
        "downloaded": "Downloaded",
        "rejected": "Rejected",
    }
    return {
        "id": req.id,
        "student_id": student.id,
        "student_name": student.full_name,
        "student_email": student.email,
        "student_code": profile.student_code if profile else _student_code(student.id),
        "department": profile.department if profile else "Computer Science & AI",
        "semester": semester,
        "cgpa": round(profile.cgpa if profile else 0, 2),
        "attendance": round(profile.attendance if profile else 0, 1),
        "avatar_url": student_avatar_url(profile),
        "certificate_key": req.certificate_key,
        "certificate_name": req.certificate_name,
        "status": req.status,
        "status_label": status_labels.get(req.status, req.status.replace("_", " ").title()),
        "purpose": req.purpose,
        "certificate_body": req.certificate_body,
        "signatory_name": req.signatory_name,
        "signatory_title": req.signatory_title,
        "admin_note": req.admin_note,
        "requested_at": req.requested_at.isoformat() if req.requested_at else None,
        "ready_at": req.ready_at.isoformat() if req.ready_at else None,
        "downloaded_at": req.downloaded_at.isoformat() if req.downloaded_at else None,
    }


def _ensure_graduation_certificate_requests(db: Session) -> None:
    setting = get_campus_attendance_setting(db)
    profiles = {
        profile.user_id: profile
        for profile in db.query(StudentProfile).all()
    }
    existing_requests = {
        req.student_id: req
        for req in (
            db.query(StudentCertificateRequest)
            .filter(StudentCertificateRequest.certificate_key == "graduation")
            .all()
        )
    }
    changed = False
    for student in db.query(User).filter(User.role == Role.student).all():
        profile = profiles.get(student.id)
        semester = resolve_student_semester(
            profile,
            student,
            setting.semester_duration_months,
            setting.semester_duration_unit,
            setting.semester_duration_days,
        )
        if semester < 4:
            continue

        request = existing_requests.get(student.id)
        moment = datetime.now(ZoneInfo("UTC"))
        department = profile.department if profile else "Computer Science & AI"
        student_code = profile.student_code if profile else _student_code(student.id)
        if request is None:
            db.add(
                StudentCertificateRequest(
                    student_id=student.id,
                    certificate_key="graduation",
                    certificate_name="Graduation Degree Certificate",
                    status="ready",
                    purpose="Degree completion",
                    certificate_body=(
                        f"{student.full_name} ({student_code}) has successfully completed Semester 4 of the "
                        f"{department} program and has fulfilled all prescribed academic requirements for graduation."
                    ),
                    signatory_name="Dr. A. R. Sharma",
                    signatory_title="Registrar & Academic Senate",
                    requested_at=moment,
                    ready_at=moment,
                )
            )
            changed = True
        elif request.status not in {"ready", "downloaded"}:
            request.status = "ready"
            request.ready_at = request.ready_at or moment
            request.updated_at = moment
            changed = True

    if changed:
        db.commit()


def _delete_user_records(db: Session, target: User) -> None:
    db.query(User).filter(User.blocked_by_id == target.id).update(
        {"blocked_by_id": None},
        synchronize_session=False,
    )
    db.query(CampusAttendanceSetting).filter(CampusAttendanceSetting.updated_by_id == target.id).update(
        {"updated_by_id": None},
        synchronize_session=False,
    )
    db.query(RevokedToken).filter(RevokedToken.user_id == target.id).delete(synchronize_session=False)
    db.query(PlacementApplication).filter(PlacementApplication.selected_by_id == target.id).update(
        {"selected_by_id": None},
        synchronize_session=False,
    )
    _delete_connect_data(db, target.id)

    if target.role == Role.student:
        placement_application_ids = [
            row[0]
            for row in (
                db.query(PlacementApplication.id)
                .filter(PlacementApplication.student_id == target.id)
                .all()
            )
        ]
        if placement_application_ids:
            db.query(PlacementNotification).filter(
                PlacementNotification.application_id.in_(placement_application_ids)
            ).delete(synchronize_session=False)
        db.query(PlacementNotification).filter(PlacementNotification.student_id == target.id).delete(
            synchronize_session=False
        )
        db.query(PlacementApplication).filter(PlacementApplication.student_id == target.id).delete(
            synchronize_session=False
        )
        complaint_ids = [
            row[0]
            for row in db.query(StudentComplaint.id).filter(StudentComplaint.student_id == target.id).all()
        ]
        if complaint_ids:
            db.query(StudentComplaintAttachment).filter(
                StudentComplaintAttachment.complaint_id.in_(complaint_ids)
            ).delete(synchronize_session=False)
        db.query(StudentComplaint).filter(StudentComplaint.student_id == target.id).delete(synchronize_session=False)
        db.query(StudentFeeInvoice).filter(StudentFeeInvoice.student_id == target.id).delete(synchronize_session=False)
        db.query(StudentCertificateRequest).filter(StudentCertificateRequest.student_id == target.id).delete(synchronize_session=False)
        db.query(AssignmentReview).filter(AssignmentReview.student_id == target.id).delete(synchronize_session=False)
        db.query(StudentTodo).filter(StudentTodo.student_id == target.id).delete(synchronize_session=False)
        db.query(StudentAttendance).filter(StudentAttendance.student_id == target.id).delete(synchronize_session=False)
        db.query(StudentBiometricCheckIn).filter(StudentBiometricCheckIn.student_id == target.id).delete(synchronize_session=False)
        db.query(StudentProfile).filter(StudentProfile.user_id == target.id).delete(synchronize_session=False)
    elif target.role == Role.faculty:
        db.query(StudentAttendance).filter(StudentAttendance.marked_by_id == target.id).update(
            {"marked_by_id": None},
            synchronize_session=False,
        )
        db.query(StudentBiometricCheckIn).filter(StudentBiometricCheckIn.confirmed_by_id == target.id).update(
            {"confirmed_by_id": None},
            synchronize_session=False,
        )
        db.query(AssignmentReview).filter(AssignmentReview.reviewed_by_id == target.id).delete(synchronize_session=False)
        db.query(StudyResource).filter(StudyResource.created_by_id == target.id).delete(synchronize_session=False)
        db.query(Announcement).filter(Announcement.created_by_id == target.id).delete(synchronize_session=False)
        db.query(ProfessorProfile).filter(ProfessorProfile.user_id == target.id).delete(synchronize_session=False)

    db.delete(target)


@router.get("/dashboard", response_model=AdminDashboard)
def dashboard(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> AdminDashboard:
    _require_admin(current_user)
    students = _student_rows(db)
    professors = _professor_rows(db)
    attendance = _attendance_overview(db, len(students))
    total_accounts = max(len(students) + len(professors), 1)
    student_share = round((len(students) / total_accounts) * 100, 1)
    professor_share = round((len(professors) / total_accounts) * 100, 1)
    return AdminDashboard(
        admin={
            "name": current_user.full_name,
            "email": current_user.email,
            "avatar": _avatar(current_user.full_name),
        },
        metrics=_metric_rows(students, professors, attendance),
        account_ratio={
            "students": len(students),
            "professors": len(professors),
            "studentShare": student_share,
            "professorShare": professor_share,
        },
        ratio_overview=_ratio_overview(len(students), len(professors)),
        attendance_overview=attendance,
        students=students,
        professors=professors,
    )


@router.get("/management", response_model=CampusAttendanceSettingsOut)
def management(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> CampusAttendanceSettingsOut:
    _require_admin(current_user)
    setting = get_campus_attendance_setting(db)
    db.commit()
    return _management_out(db, setting)


@router.get("/fees")
def fee_management(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_admin(current_user)
    payload = admin_fee_management_payload(db)
    db.commit()
    return payload


@router.patch("/fees/settings/{semester}")
def update_semester_fee(
    semester: int,
    payload: SemesterFeeUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_admin(current_user)
    if semester < 1 or semester > 4:
        raise HTTPException(status_code=400, detail="Semester fee can be edited for semesters 1 to 4")
    update_semester_fee_amount(db, semester, payload.amount, current_user.id)
    response = admin_fee_management_payload(db)
    db.commit()
    return response


@router.patch("/management/attendance-radius", response_model=CampusAttendanceSettingsOut)
def update_attendance_radius(
    payload: CampusAttendanceSettingsUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> CampusAttendanceSettingsOut:
    _require_admin(current_user)
    setting = get_campus_attendance_setting(db)
    setting.radius_meters = payload.radius_meters
    if payload.latitude is not None:
        setting.latitude = payload.latitude
    if payload.longitude is not None:
        setting.longitude = payload.longitude
    if payload.campus_name and payload.campus_name.strip():
        setting.campus_name = payload.campus_name.strip()
    setting.updated_by_id = current_user.id
    setting.updated_at = now_utc()
    db.commit()
    db.refresh(setting)
    return _management_out(db, setting)


@router.patch("/management/semester-duration", response_model=CampusAttendanceSettingsOut)
def update_semester_duration(
    payload: SemesterDurationUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> CampusAttendanceSettingsOut:
    _require_admin(current_user)
    setting = get_campus_attendance_setting(db)
    setting.semester_duration_unit = payload.semester_duration_unit
    if payload.semester_duration_months is not None:
        setting.semester_duration_months = payload.semester_duration_months
    if payload.semester_duration_days is not None:
        setting.semester_duration_days = payload.semester_duration_days
    setting.updated_by_id = current_user.id
    setting.updated_at = now_utc()
    db.commit()
    db.refresh(setting)
    return _management_out(db, setting)


@router.post("/management/slot-batches", response_model=CampusAttendanceSettingsOut)
def create_slot_batch(
    payload: SlotBatchCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> CampusAttendanceSettingsOut:
    _require_admin(current_user)
    existing = db.query(IntakeSlotBatch).filter(IntakeSlotBatch.batch_name == payload.batch_name).first()
    if existing:
        raise HTTPException(status_code=409, detail="That batch name already exists")

    batch = IntakeSlotBatch(
        batch_name=payload.batch_name,
        total_slots=payload.total_slots,
        open_for_intake=payload.open_for_intake,
        created_by_id=current_user.id,
    )
    if payload.open_for_intake:
        for row in db.query(IntakeSlotBatch).all():
            row.open_for_intake = False
    db.add(batch)
    setting = get_campus_attendance_setting(db)
    setting.updated_by_id = current_user.id
    setting.updated_at = now_utc()
    db.commit()
    db.refresh(setting)
    return _management_out(db, setting)


@router.patch("/management/slot-batches/{batch_id}", response_model=CampusAttendanceSettingsOut)
def update_slot_batch(
    batch_id: int,
    payload: SlotBatchUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> CampusAttendanceSettingsOut:
    _require_admin(current_user)
    batch = db.get(IntakeSlotBatch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Slot batch not found")

    if payload.batch_name:
        duplicate = (
            db.query(IntakeSlotBatch)
            .filter(IntakeSlotBatch.batch_name == payload.batch_name, IntakeSlotBatch.id != batch_id)
            .first()
        )
        if duplicate:
            raise HTTPException(status_code=409, detail="That batch name already exists")
        batch.batch_name = payload.batch_name

    if payload.total_slots is not None:
        filled_slots = len(
            db.query(StudentProfile.id).filter(StudentProfile.slot_batch_id == batch.id).all()
        )
        if payload.total_slots < filled_slots:
            raise HTTPException(
                status_code=400,
                detail=f"Total slots cannot be lower than the {filled_slots} students already filled",
            )
        batch.total_slots = payload.total_slots

    if payload.open_for_intake is not None:
        if payload.open_for_intake:
            for row in db.query(IntakeSlotBatch).all():
                row.open_for_intake = row.id == batch.id
        else:
            batch.open_for_intake = False

    setting = get_campus_attendance_setting(db)
    setting.updated_by_id = current_user.id
    setting.updated_at = now_utc()
    db.commit()
    db.refresh(setting)
    return _management_out(db, setting)


@router.post("/users/{user_id}/block")
def update_user_block_state(
    user_id: int,
    payload: StudentBlockUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_admin(current_user)
    target = _require_manageable_user(current_user, db.get(User, user_id))
    _apply_block_state(target, current_user, payload.blocked, payload.reason)
    db.commit()
    return {
        "ok": True,
        "user_id": target.id,
        "role": target.role.value,
        "is_blocked": target.is_blocked,
        "message": f"{target.full_name} {'blocked' if target.is_blocked else 'unblocked'}",
    }


@router.post("/students/{student_id}/block")
def update_student_block_state_legacy(
    student_id: int,
    payload: StudentBlockUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_admin(current_user)
    target = _require_manageable_user(current_user, db.get(User, student_id))
    if target.role != Role.student:
        raise HTTPException(status_code=404, detail="Student not found")
    _apply_block_state(target, current_user, payload.blocked, payload.reason)
    db.commit()
    return {"ok": True, "id": target.id, "is_blocked": target.is_blocked}


@router.post("/professors/{professor_id}/block")
def update_professor_block_state_legacy(
    professor_id: int,
    payload: StudentBlockUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_admin(current_user)
    target = _require_manageable_user(current_user, db.get(User, professor_id))
    if target.role != Role.faculty:
        raise HTTPException(status_code=404, detail="Professor not found")
    _apply_block_state(target, current_user, payload.blocked, payload.reason)
    db.commit()
    return {"ok": True, "id": target.id, "is_blocked": target.is_blocked}


@router.delete("/users/{user_id}")
def delete_user_account(
    user_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_admin(current_user)
    target = _require_manageable_user(current_user, db.get(User, user_id))
    target_name = target.full_name
    target_role = target.role.value
    _delete_user_records(db, target)
    db.commit()
    return {
        "ok": True,
        "user_id": user_id,
        "role": target_role,
        "message": f"{target_name} deleted",
    }


@router.delete("/students/{student_id}")
def delete_student_account_legacy(
    student_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_admin(current_user)
    target = _require_manageable_user(current_user, db.get(User, student_id))
    if target.role != Role.student:
        raise HTTPException(status_code=404, detail="Student not found")
    _delete_user_records(db, target)
    db.commit()
    return {"ok": True, "id": student_id}


@router.delete("/professors/{professor_id}")
def delete_professor_account_legacy(
    professor_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_admin(current_user)
    target = _require_manageable_user(current_user, db.get(User, professor_id))
    if target.role != Role.faculty:
        raise HTTPException(status_code=404, detail="Professor not found")
    _delete_user_records(db, target)
    db.commit()
    return {"ok": True, "id": professor_id}


@router.get("/certificates/requests")
def list_certificate_requests(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_admin(current_user)
    _ensure_graduation_certificate_requests(db)
    requests = (
        db.query(StudentCertificateRequest, User, StudentProfile)
        .join(User, StudentCertificateRequest.student_id == User.id)
        .outerjoin(StudentProfile, StudentProfile.user_id == User.id)
        .filter(StudentCertificateRequest.certificate_key.in_(ACTIVE_CERTIFICATE_KEYS))
        .order_by(StudentCertificateRequest.requested_at.desc())
        .all()
    )
    rows = [_certificate_request_payload(db, req, student, profile) for req, student, profile in requests]
    return {"ok": True, "requests": rows}


@router.post("/certificates/{request_id}/approve")
def approve_certificate_request(
    request_id: int,
    payload: CertificateApprovalPayload | None,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_admin(current_user)
    req = db.get(StudentCertificateRequest, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Certificate request not found")
    if req.certificate_key not in ACTIVE_CERTIFICATE_KEYS:
        raise HTTPException(status_code=404, detail="Certificate type is no longer available")

    student = db.get(User, req.student_id)
    if not student or student.role != Role.student:
        raise HTTPException(status_code=404, detail="Student not found")
    profile = db.query(StudentProfile).filter(StudentProfile.user_id == student.id).first()
    setting = get_campus_attendance_setting(db)
    semester = resolve_student_semester(
        profile,
        student,
        setting.semester_duration_months,
        setting.semester_duration_unit,
        setting.semester_duration_days,
    )
    clean_payload = payload or CertificateApprovalPayload()
    moment = datetime.now(ZoneInfo("UTC"))
    req.purpose = _clean_optional_text(clean_payload.purpose) or req.purpose or (
        "Degree completion" if req.certificate_key == "graduation" else "Student certificate issuance"
    )
    req.certificate_body = (
        _clean_optional_text(clean_payload.certificate_body)
        or req.certificate_body
        or _certificate_default_body(req, student, profile, semester)
    )
    req.signatory_name = _clean_optional_text(clean_payload.signatory_name) or req.signatory_name or "Dr. A. R. Sharma"
    req.signatory_title = _clean_optional_text(clean_payload.signatory_title) or req.signatory_title or "Registrar & Academic Senate"
    req.admin_note = _clean_optional_text(clean_payload.admin_note) or req.admin_note
    req.status = "ready"
    req.ready_at = moment
    req.updated_at = moment
    db.commit()
    db.refresh(req)
    return {
        "ok": True,
        "message": f"{req.certificate_name} approved for student",
        "request_id": request_id,
        "request": _certificate_request_payload(db, req, student, profile),
    }


@router.post("/certificates/{request_id}/reject")
def reject_certificate_request(
    request_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_admin(current_user)
    req = db.get(StudentCertificateRequest, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Certificate request not found")
    if req.certificate_key not in ACTIVE_CERTIFICATE_KEYS:
        raise HTTPException(status_code=404, detail="Certificate type is no longer available")
    student = db.get(User, req.student_id)
    if not student or student.role != Role.student:
        raise HTTPException(status_code=404, detail="Student not found")
    profile = db.query(StudentProfile).filter(StudentProfile.user_id == student.id).first()
    req.status = "rejected"
    req.admin_note = req.admin_note or "Rejected by admin"
    req.updated_at = datetime.now(ZoneInfo("UTC"))
    db.commit()
    db.refresh(req)
    return {
        "ok": True,
        "message": f"{req.certificate_name} request rejected",
        "request_id": request_id,
        "request": _certificate_request_payload(db, req, student, profile),
    }


class AnnouncementCreate(BaseModel):
    title: str
    body: str
    category: str = "Academic"
    audience: str = "All students"
    pinned: bool = False


@router.get("/announcements")
def list_admin_announcements(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_admin(current_user)
    items = db.query(Announcement).order_by(Announcement.created_at.desc()).all()
    rows = [
        {
            "id": item.id,
            "title": item.title,
            "body": item.body,
            "category": item.category,
            "audience": item.audience,
            "pinned": item.pinned,
            "created_at": item.created_at.isoformat() if item.created_at else None,
        }
        for item in items
    ]
    return {"ok": True, "announcements": rows}


@router.post("/announcements")
def create_announcement(
    data: AnnouncementCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_admin(current_user)
    item = Announcement(
        title=data.title.strip(),
        body=data.body.strip(),
        category=data.category.strip(),
        audience=data.audience.strip(),
        pinned=data.pinned,
        created_by_id=current_user.id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"ok": True, "message": "Campus announcement published successfully", "announcement": {"id": item.id, "title": item.title}}


@router.delete("/announcements/{announcement_id}")
def delete_announcement(
    announcement_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_admin(current_user)
    item = db.get(Announcement, announcement_id)
    if not item:
        raise HTTPException(status_code=404, detail="Announcement not found")
    db.delete(item)
    db.commit()
    return {"ok": True, "message": "Announcement deleted successfully", "id": announcement_id}
