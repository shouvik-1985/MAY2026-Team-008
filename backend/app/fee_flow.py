from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import hashlib
import hmac
from zoneinfo import ZoneInfo

from fastapi import HTTPException
import requests
from sqlalchemy.orm import Session, selectinload

from app.attendance_flow import get_campus_attendance_setting
from app.avatar import student_avatar_url
from app.core.config import get_settings
from app.intake_flow import resolve_student_semester, student_enrollment_date
from app.models import Role, SemesterFeeSetting, StudentFeeInvoice, StudentProfile, User

try:
    LOCAL_TIMEZONE = ZoneInfo("Asia/Kolkata")
except Exception:
    LOCAL_TIMEZONE = timezone.utc

RAZORPAY_ORDERS_URL = "https://api.razorpay.com/v1/orders"
FEE_SEMESTER_LIMIT = 4
MIN_FEE_AMOUNT = 1


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def local_today() -> date:
    return datetime.now(LOCAL_TIMEZONE).date()


def default_fee_amount(semester: int) -> int:
    return 78000 + (semester * 1200)


def normalize_fee_amount(semester: int, amount: int | None) -> int:
    if amount is None or amount < MIN_FEE_AMOUNT:
        return default_fee_amount(semester)
    return amount


def invoice_code(student_id: int, semester: int) -> str:
    return f"INV-{student_id:03d}{semester + 2}"


def _date_label(value: date | datetime | None) -> str:
    if value is None:
        return "N/A"
    if isinstance(value, datetime):
        local_value = value.astimezone(LOCAL_TIMEZONE) if value.tzinfo else value
        return local_value.strftime("%b %d, %Y")
    return value.strftime("%b %d, %Y")


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


def get_or_create_fee_setting(db: Session, semester: int) -> SemesterFeeSetting:
    normalized_semester = min(FEE_SEMESTER_LIMIT, max(1, semester))
    setting = db.query(SemesterFeeSetting).filter(SemesterFeeSetting.semester == normalized_semester).first()
    if setting:
        normalized_amount = normalize_fee_amount(normalized_semester, setting.amount)
        if normalized_amount != setting.amount:
            setting.amount = normalized_amount
            setting.updated_at = now_utc()
            db.flush()
        return setting

    setting = SemesterFeeSetting(
        semester=normalized_semester,
        amount=default_fee_amount(normalized_semester),
        currency="INR",
    )
    db.add(setting)
    db.flush()
    return setting


def fee_settings_payload(db: Session) -> list[dict]:
    return [
        {
            "semester": semester,
            "amount": get_or_create_fee_setting(db, semester).amount,
            "currency": "INR",
        }
        for semester in range(1, FEE_SEMESTER_LIMIT + 1)
    ]


def resolve_current_fee_semester(
    db: Session,
    user: User,
    profile: StudentProfile | None = None,
    campus_setting=None,
) -> int:
    profile = profile or _ensure_student_profile(db, user)
    setting = campus_setting or get_campus_attendance_setting(db)
    semester = resolve_student_semester(
        profile,
        user,
        setting.semester_duration_months,
        setting.semester_duration_unit,
        setting.semester_duration_days,
    )
    if profile.enrollment_date is None:
        profile.enrollment_date = student_enrollment_date(profile, user)
    if profile.semester != semester:
        profile.semester = semester
    db.flush()
    return semester


def ensure_student_fee_ledger(
    db: Session,
    user: User,
    current_semester: int,
) -> list[StudentFeeInvoice]:
    invoices = (
        db.query(StudentFeeInvoice)
        .filter(StudentFeeInvoice.student_id == user.id)
        .order_by(StudentFeeInvoice.semester.asc())
        .all()
    )
    for invoice in list(invoices):
        if invoice.status == "paid" and not invoice.razorpay_payment_id:
            db.delete(invoice)
            invoices.remove(invoice)

    current_semester = min(FEE_SEMESTER_LIMIT, max(1, current_semester))
    invoices_by_semester = {invoice.semester: invoice for invoice in invoices}
    moment = now_utc()

    for invoice in invoices:
        if invoice.status == "paid":
            continue
        fee_setting = get_or_create_fee_setting(db, invoice.semester)
        invoice.amount = fee_setting.amount
        invoice.currency = fee_setting.currency
        if invoice.amount < MIN_FEE_AMOUNT:
            invoice.amount = default_fee_amount(invoice.semester)
        if invoice.due_date is None:
            invoice.due_date = local_today() + timedelta(days=30)
        invoice.updated_at = moment

    current_invoice = invoices_by_semester.get(current_semester)
    if current_invoice is None:
        fee_setting = get_or_create_fee_setting(db, current_semester)
        current_invoice = StudentFeeInvoice(
            student_id=user.id,
            semester=current_semester,
            invoice_code=invoice_code(user.id, current_semester),
            amount=fee_setting.amount,
            currency=fee_setting.currency,
            status="pending",
            due_date=local_today() + timedelta(days=30),
        )
        db.add(current_invoice)
    elif current_invoice.status != "paid":
        fee_setting = get_or_create_fee_setting(db, current_semester)
        current_invoice.amount = fee_setting.amount
        current_invoice.currency = fee_setting.currency
        current_invoice.updated_at = moment

    db.flush()
    return (
        db.query(StudentFeeInvoice)
        .filter(StudentFeeInvoice.student_id == user.id)
        .order_by(StudentFeeInvoice.semester.desc())
        .all()
    )


def student_fee_invoice_payload(invoice: StudentFeeInvoice, student_status: bool = True) -> dict:
    paid = invoice.status == "paid"
    status = "paid" if paid else "due" if student_status else "pending"
    display_date = invoice.paid_at or invoice.due_date or invoice.created_at
    return {
        "id": invoice.invoice_code,
        "semester": f"Sem {invoice.semester}",
        "semesterNumber": invoice.semester,
        "amount": invoice.amount,
        "currency": invoice.currency,
        "status": status,
        "date": _date_label(display_date),
        "dueDate": invoice.due_date.isoformat() if invoice.due_date else None,
        "paidAt": invoice.paid_at.isoformat() if invoice.paid_at else None,
        "razorpayOrderId": invoice.razorpay_order_id,
        "razorpayPaymentId": invoice.razorpay_payment_id,
    }


def student_fee_data(db: Session, user: User, current_semester: int) -> dict:
    invoices = ensure_student_fee_ledger(db, user, current_semester)
    pending_invoices = [invoice for invoice in invoices if invoice.status != "paid"]
    outstanding = sum(invoice.amount for invoice in pending_invoices)
    current_invoice = next((invoice for invoice in invoices if invoice.semester == current_semester), None)
    current_pending = current_invoice if current_invoice and current_invoice.status != "paid" else pending_invoices[0] if pending_invoices else None
    settings_by_semester = {item["semester"]: item["amount"] for item in fee_settings_payload(db)}
    trend = [
        settings_by_semester.get(semester, default_fee_amount(semester))
        for semester in range(1, FEE_SEMESTER_LIMIT + 1)
    ]
    settings = get_settings()
    razorpay_enabled = bool(settings.razorpay_key_id and settings.razorpay_secret_key)

    return {
        "summary": {
            "outstanding": outstanding,
            "semester": f"Sem {current_semester}",
            "dueDate": _date_label(current_pending.due_date) if current_pending else "Cleared",
            "clearance": "Pending" if outstanding else "Cleared",
            "trend": trend,
            "currentInvoiceId": current_pending.invoice_code if current_pending else None,
            "pendingInvoices": len(pending_invoices),
            "razorpayEnabled": razorpay_enabled,
        },
        "history": [student_fee_invoice_payload(invoice) for invoice in invoices],
    }


def update_semester_fee_amount(db: Session, semester: int, amount: int, admin_id: int | None) -> None:
    normalized_semester = min(FEE_SEMESTER_LIMIT, max(1, semester))
    if amount < MIN_FEE_AMOUNT:
        raise HTTPException(status_code=400, detail=f"Semester fee must be at least INR {MIN_FEE_AMOUNT:,}")
    fee_setting = get_or_create_fee_setting(db, normalized_semester)
    fee_setting.amount = amount
    fee_setting.currency = "INR"
    fee_setting.updated_by_id = admin_id
    fee_setting.updated_at = now_utc()
    db.query(StudentFeeInvoice).filter(
        StudentFeeInvoice.semester == normalized_semester,
        StudentFeeInvoice.status != "paid",
    ).update(
        {
            "amount": amount,
            "currency": "INR",
            "razorpay_order_id": None,
            "razorpay_payment_id": None,
            "razorpay_signature": None,
            "updated_at": now_utc(),
        },
        synchronize_session=False,
    )
    db.flush()


def admin_fee_management_payload(db: Session) -> dict:
    students = (
        db.query(User)
        .options(selectinload(User.student_profile))
        .filter(User.role == Role.student)
        .order_by(User.created_at.desc())
        .all()
    )
    campus_setting = get_campus_attendance_setting(db)
    student_rows: list[dict] = []
    total_collected = 0
    total_pending = 0
    paid_students = 0
    pending_students = 0

    for student in students:
        profile = _ensure_student_profile(db, student)
        semester = resolve_current_fee_semester(db, student, profile, campus_setting)
        invoices = ensure_student_fee_ledger(db, student, semester)
        outstanding = sum(invoice.amount for invoice in invoices if invoice.status != "paid")
        collected = sum(invoice.amount for invoice in invoices if invoice.status == "paid")
        total_collected += collected
        total_pending += outstanding
        if outstanding:
            pending_students += 1
        else:
            paid_students += 1

        current_invoice = next((invoice for invoice in invoices if invoice.semester == semester), None)
        student_rows.append(
            {
                "studentId": student.id,
                "name": student.full_name,
                "email": student.email,
                "studentCode": profile.student_code,
                "department": profile.department,
                "semester": semester,
                "avatarUrl": student_avatar_url(profile),
                "status": "pending" if outstanding else "paid",
                "outstanding": outstanding,
                "collected": collected,
                "currentInvoiceId": current_invoice.invoice_code if current_invoice else None,
                "invoices": [student_fee_invoice_payload(invoice, student_status=False) for invoice in invoices],
            }
        )

    settings = get_settings()
    return {
        "ok": True,
        "settings": fee_settings_payload(db),
        "students": student_rows,
        "metrics": {
            "totalCollected": total_collected,
            "totalPending": total_pending,
            "paidStudents": paid_students,
            "pendingStudents": pending_students,
            "studentCount": len(students),
        },
        "razorpayEnabled": bool(settings.razorpay_key_id and settings.razorpay_secret_key),
    }


def _razorpay_credentials() -> tuple[str, str]:
    settings = get_settings()
    key_id = (settings.razorpay_key_id or "").strip()
    secret = settings.razorpay_secret_key.get_secret_value().strip() if settings.razorpay_secret_key else ""
    if not key_id or not secret:
        raise HTTPException(status_code=503, detail="Razorpay keys are not configured on the backend")
    return key_id, secret


def create_razorpay_order(db: Session, user: User, invoice_id: str) -> dict:
    key_id, secret = _razorpay_credentials()
    invoice = (
        db.query(StudentFeeInvoice)
        .filter(StudentFeeInvoice.student_id == user.id, StudentFeeInvoice.invoice_code == invoice_id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Fee invoice not found")
    if invoice.status == "paid":
        raise HTTPException(status_code=400, detail="This invoice is already paid")
    if invoice.amount <= 0:
        raise HTTPException(status_code=400, detail="Invoice amount is invalid")
    if invoice.razorpay_order_id and invoice.status == "pending":
        return {
            "ok": True,
            "keyId": key_id,
            "orderId": invoice.razorpay_order_id,
            "amount": invoice.amount * 100,
            "currency": invoice.currency,
            "invoice": student_fee_invoice_payload(invoice),
        }

    receipt = invoice.invoice_code if invoice.status == "pending" else f"{invoice.invoice_code}-{int(now_utc().timestamp()) % 100000}"
    payload = {
        "amount": invoice.amount * 100,
        "currency": invoice.currency,
        "receipt": receipt[:40],
        "notes": {
            "invoice": invoice.invoice_code,
            "student_id": str(user.id),
            "semester": str(invoice.semester),
        },
    }
    try:
        response = requests.post(RAZORPAY_ORDERS_URL, json=payload, auth=(key_id, secret), timeout=15)
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach Razorpay: {exc}") from exc

    if response.status_code >= 400:
        try:
            detail = response.json().get("error", {}).get("description") or response.text
        except ValueError:
            detail = response.text
        raise HTTPException(status_code=502, detail=f"Razorpay order creation failed: {detail}")

    data = response.json()
    order_id = data.get("id")
    if not order_id:
        raise HTTPException(status_code=502, detail="Razorpay did not return an order id")

    invoice.razorpay_order_id = order_id
    invoice.status = "pending"
    invoice.updated_at = now_utc()
    db.commit()
    db.refresh(invoice)
    return {
        "ok": True,
        "keyId": key_id,
        "orderId": order_id,
        "amount": data.get("amount", invoice.amount * 100),
        "currency": data.get("currency", invoice.currency),
        "invoice": student_fee_invoice_payload(invoice),
    }


def verify_razorpay_payment(
    db: Session,
    user: User,
    razorpay_order_id: str,
    razorpay_payment_id: str,
    razorpay_signature: str,
) -> dict:
    _, secret = _razorpay_credentials()
    invoice = (
        db.query(StudentFeeInvoice)
        .filter(
            StudentFeeInvoice.student_id == user.id,
            StudentFeeInvoice.razorpay_order_id == razorpay_order_id,
        )
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Matching fee invoice was not found")
    if invoice.status == "paid":
        return {"ok": True, "message": "Fee payment already verified", "invoice": student_fee_invoice_payload(invoice)}

    signed_payload = f"{invoice.razorpay_order_id}|{razorpay_payment_id}".encode("utf-8")
    expected = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, razorpay_signature):
        invoice.status = "failed"
        invoice.updated_at = now_utc()
        db.commit()
        raise HTTPException(status_code=400, detail="Razorpay payment signature verification failed")

    invoice.status = "paid"
    invoice.razorpay_payment_id = razorpay_payment_id
    invoice.razorpay_signature = razorpay_signature
    invoice.paid_at = now_utc()
    invoice.updated_at = invoice.paid_at
    db.commit()
    db.refresh(invoice)
    return {
        "ok": True,
        "message": f"{invoice.invoice_code} verified successfully",
        "invoice": student_fee_invoice_payload(invoice),
    }
