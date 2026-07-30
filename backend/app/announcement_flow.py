from datetime import datetime, timezone

from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.models import Announcement, AnnouncementNotification, Role, User

ANNOUNCEMENT_AUDIENCE_STUDENTS = "students"
ANNOUNCEMENT_AUDIENCE_PROFESSORS = "professors"
ANNOUNCEMENT_AUDIENCE_ALL = "all"
ANNOUNCEMENT_AUDIENCES = {
    ANNOUNCEMENT_AUDIENCE_STUDENTS,
    ANNOUNCEMENT_AUDIENCE_PROFESSORS,
    ANNOUNCEMENT_AUDIENCE_ALL,
}


def normalize_announcement_audience(value: str | None) -> str:
    normalized = (value or "").strip().lower()
    if normalized in {"student", "students", "all students"}:
        return ANNOUNCEMENT_AUDIENCE_STUDENTS
    if normalized in {"professor", "professors", "faculty", "all professors"}:
        return ANNOUNCEMENT_AUDIENCE_PROFESSORS
    if normalized in {"all", "both", "everyone", "all users", "students and professors"}:
        return ANNOUNCEMENT_AUDIENCE_ALL
    return ANNOUNCEMENT_AUDIENCE_ALL


def announcement_audience_label(audience: str) -> str:
    normalized = normalize_announcement_audience(audience)
    if normalized == ANNOUNCEMENT_AUDIENCE_STUDENTS:
        return "Students"
    if normalized == ANNOUNCEMENT_AUDIENCE_PROFESSORS:
        return "Professors"
    return "Both"


def announcement_targets_role(audience: str, role: Role) -> bool:
    normalized = normalize_announcement_audience(audience)
    if normalized == ANNOUNCEMENT_AUDIENCE_ALL:
        return role in {Role.student, Role.faculty}
    if normalized == ANNOUNCEMENT_AUDIENCE_STUDENTS:
        return role == Role.student
    if normalized == ANNOUNCEMENT_AUDIENCE_PROFESSORS:
        return role == Role.faculty
    return False


def announcement_payload(item: Announcement) -> dict:
    created_at = item.created_at or datetime.now(timezone.utc)
    return {
        "id": item.id,
        "title": item.title,
        "category": item.category,
        "audience": announcement_audience_label(item.audience),
        "body": item.body,
        "pinned": item.pinned,
        "created_at": created_at.isoformat(),
        "time": created_at.strftime("%d %b, %I:%M %p"),
    }


def create_announcement_notifications(db: Session, item: Announcement) -> None:
    recipients = (
        db.query(User)
        .filter(User.role.in_([Role.student, Role.faculty]))
        .order_by(User.id.asc())
        .all()
    )
    rows = [
        AnnouncementNotification(announcement_id=item.id, user_id=user.id)
        for user in recipients
        if announcement_targets_role(item.audience, user.role)
    ]
    if rows:
        db.add_all(rows)


def announcement_notifications_for_user(db: Session, user: User, limit: int = 20) -> list[dict]:
    notifications = (
        db.query(AnnouncementNotification, Announcement)
        .join(Announcement, Announcement.id == AnnouncementNotification.announcement_id)
        .filter(AnnouncementNotification.user_id == user.id)
        .order_by(desc(AnnouncementNotification.created_at), desc(Announcement.id))
        .limit(limit)
        .all()
    )
    rows: list[dict] = []
    seen_announcement_ids: set[int] = set()
    for notification, announcement in notifications:
        seen_announcement_ids.add(announcement.id)
        payload = announcement_payload(announcement)
        rows.append(
            {
                "id": notification.id,
                "announcementId": announcement.id,
                "title": announcement.title,
                "body": announcement.body,
                "category": announcement.category,
                "audience": payload["audience"],
                "time": payload["time"],
                "createdAt": notification.created_at.isoformat(),
                "read": notification.read,
            }
        )

    # Fallback: Include any targeted active announcements missing explicit notification rows
    all_announcements = (
        db.query(Announcement)
        .order_by(desc(Announcement.pinned), desc(Announcement.created_at), desc(Announcement.id))
        .limit(limit)
        .all()
    )
    for ann in all_announcements:
        if ann.id not in seen_announcement_ids and announcement_targets_role(ann.audience, user.role):
            payload = announcement_payload(ann)
            rows.append(
                {
                    "id": ann.id,
                    "announcementId": ann.id,
                    "title": ann.title,
                    "body": ann.body,
                    "category": ann.category,
                    "audience": payload["audience"],
                    "time": payload["time"],
                    "createdAt": payload["created_at"],
                    "read": False,
                }
            )
    return rows[:limit]


def announcement_rows_for_user(db: Session, user: User, limit: int = 20) -> list[dict]:
    notifications = announcement_notifications_for_user(db, user, limit=limit)
    return [
        {
            "id": item["announcementId"],
            "pinned": False,
            "title": item["title"],
            "category": item["category"],
            "time": item["time"],
            "unread": not item["read"],
            "body": item["body"],
            "audience": item["audience"],
        }
        for item in notifications
    ]

