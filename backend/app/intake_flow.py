from __future__ import annotations

from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.attendance_flow import get_campus_attendance_setting
from app.models import IntakeSlotBatch, StudentProfile, User

try:
    LOCAL_TIMEZONE = ZoneInfo("Asia/Kolkata")
except Exception:
    LOCAL_TIMEZONE = timezone.utc
DEFAULT_SEMESTER_DURATION_MONTHS = 6
DEFAULT_SEMESTER_DURATION_DAYS = 180


def local_today() -> date:
    return datetime.now(LOCAL_TIMEZONE).date()


def semester_duration_months(value: int | None) -> int:
    return max(1, value or DEFAULT_SEMESTER_DURATION_MONTHS)


def semester_duration_days(value: int | None) -> int:
    return max(1, value or DEFAULT_SEMESTER_DURATION_DAYS)


def semester_duration_unit(value: str | None) -> str:
    return "days" if value == "days" else "months"


def student_enrollment_date(profile: StudentProfile | None, user: User) -> date:
    if profile and profile.enrollment_date:
        return profile.enrollment_date
    created = user.created_at.astimezone(LOCAL_TIMEZONE) if user.created_at.tzinfo else user.created_at
    return created.date()


def _elapsed_months(start: date, end: date) -> int:
    months = (end.year - start.year) * 12 + (end.month - start.month)
    if end.day < start.day:
        months -= 1
    return max(0, months)


def resolve_student_semester(
    profile: StudentProfile | None,
    user: User,
    duration_months: int,
    duration_unit: str = "months",
    duration_days: int | None = None,
    as_of: date | None = None,
) -> int:
    if not profile:
        return 1
    target_date = as_of or local_today()
    enrolled_on = student_enrollment_date(profile, user)
    if semester_duration_unit(duration_unit) == "days":
        elapsed_days = max(0, (target_date - enrolled_on).days)
        calculated = max(1, 1 + (elapsed_days // semester_duration_days(duration_days)))
        return min(4, calculated)
    months = _elapsed_months(enrolled_on, target_date)
    calculated = max(1, 1 + (months // semester_duration_months(duration_months)))
    return min(4, calculated)


def ensure_current_student_semester(
    db: Session,
    profile: StudentProfile | None,
    user: User,
) -> int:
    if not profile:
        return 1
    setting = get_campus_attendance_setting(db)
    effective_semester = resolve_student_semester(
        profile,
        user,
        setting.semester_duration_months,
        setting.semester_duration_unit,
        setting.semester_duration_days,
    )
    if profile.enrollment_date is None:
        profile.enrollment_date = student_enrollment_date(profile, user)
    if profile.semester != effective_semester:
        profile.semester = effective_semester
    db.flush()
    return effective_semester


def sync_all_student_semesters(db: Session) -> None:
    setting = get_campus_attendance_setting(db)
    duration = setting.semester_duration_months
    duration_unit = setting.semester_duration_unit
    duration_days = setting.semester_duration_days
    today = local_today()
    students = (
        db.query(StudentProfile, User)
        .join(User, User.id == StudentProfile.user_id)
        .all()
    )
    for profile, user in students:
        if profile.enrollment_date is None:
            profile.enrollment_date = student_enrollment_date(profile, user)
        profile.semester = resolve_student_semester(
            profile,
            user,
            duration,
            duration_unit=duration_unit,
            duration_days=duration_days,
            as_of=today,
        )
    db.flush()


def slot_batch_usage_map(db: Session) -> dict[int, int]:
    usage: dict[int, int] = {}
    rows = db.query(StudentProfile.slot_batch_id).all()
    for slot_batch_id, in rows:
        if slot_batch_id is None:
            continue
        usage[slot_batch_id] = usage.get(slot_batch_id, 0) + 1
    return usage


def slot_batch_payload(batch: IntakeSlotBatch, filled_slots: int) -> dict:
    total_slots = max(0, batch.total_slots)
    slots_left = max(total_slots - filled_slots, 0)
    return {
        "id": batch.id,
        "batch_name": batch.batch_name,
        "total_slots": total_slots,
        "filled_slots": filled_slots,
        "slots_left": slots_left,
        "intake_open": batch.open_for_intake,
        "created_at": batch.created_at.isoformat() if batch.created_at else None,
        "updated_at": batch.updated_at.isoformat() if batch.updated_at else None,
    }


def slot_batches_payload(db: Session) -> tuple[list[dict], dict | None]:
    batches = db.query(IntakeSlotBatch).order_by(IntakeSlotBatch.created_at.desc(), IntakeSlotBatch.id.desc()).all()
    usage = slot_batch_usage_map(db)
    payload = [slot_batch_payload(batch, usage.get(batch.id, 0)) for batch in batches]
    active = next((item for item in payload if item["intake_open"]), None)
    return payload, active


def close_other_slot_batches(db: Session, keep_batch_id: int | None = None) -> None:
    rows = db.query(IntakeSlotBatch).all()
    for row in rows:
        row.open_for_intake = row.id == keep_batch_id if keep_batch_id is not None else False
    db.flush()


def available_slot_batch_for_intake(db: Session) -> IntakeSlotBatch:
    batches = (
        db.query(IntakeSlotBatch)
        .filter(IntakeSlotBatch.open_for_intake.is_(True))
        .order_by(IntakeSlotBatch.created_at.desc(), IntakeSlotBatch.id.desc())
        .all()
    )
    if not batches:
        raise HTTPException(
            status_code=409,
            detail="No Sem 1 intake slots are open right now. Kindly wait for next opening.",
        )

    usage = slot_batch_usage_map(db)
    for batch in batches:
        if usage.get(batch.id, 0) < batch.total_slots:
            return batch

    latest = batches[0]
    raise HTTPException(
        status_code=409,
        detail=f"{latest.batch_name} is full. Kindly wait for next opening.",
    )
