from datetime import datetime, timezone

from app.workers.celery_app import celery_app


@celery_app.task(name="campusverse.send_welcome_email")
def send_welcome_email(email: str, full_name: str) -> dict:
    return {
        "email": email,
        "full_name": full_name,
        "status": "queued",
        "queued_at": datetime.now(timezone.utc).isoformat(),
    }


@celery_app.task(name="campusverse.audit_login")
def audit_login(user_id: int, provider: str) -> dict:
    return {
        "user_id": user_id,
        "provider": provider,
        "event": "login",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


@celery_app.task(name="campusverse.send_placement_selection_email")
def send_placement_selection_email(email: str, full_name: str, message: str) -> dict:
    return {
        "email": email,
        "full_name": full_name,
        "subject": "CampusVerse placement selection",
        "message": message,
        "status": "queued",
        "queued_at": datetime.now(timezone.utc).isoformat(),
    }
