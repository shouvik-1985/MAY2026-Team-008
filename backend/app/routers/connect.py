from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import re
import shutil
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, selectinload

from app.attendance_flow import get_campus_attendance_setting
from app.avatar import avatar_initials, user_avatar_url
from app.db import get_db
from app.dependencies import get_current_user
from app.intake_flow import resolve_student_semester
from app.models import (
    ConnectAttachment,
    ConnectMessage,
    ConnectMessageHidden,
    ConnectRelationship,
    Role,
    User,
)
from app.schemas import ConnectMessageDelete, ConnectMessageEdit
from app.storage import CONNECT_UPLOAD_DIR, ensure_upload_dirs

router = APIRouter(prefix="/connect", tags=["connect"])

CONNECT_ROLES = (Role.student, Role.faculty)
ONLINE_WINDOW_SECONDS = 45


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _touch_presence(db: Session, user: User) -> bool:
    if user.last_seen_at and (_now() - _aware_datetime(user.last_seen_at)).total_seconds() < 15:
        return False
    user.last_seen_at = _now()
    db.flush()
    return True


def _is_online(user: User) -> bool:
    if not user.last_seen_at:
        return False
    return (_now() - _aware_datetime(user.last_seen_at)).total_seconds() <= ONLINE_WINDOW_SECONDS


def _avatar(name: str) -> str:
    return avatar_initials(name, "CV")


def _public_role(role: Role) -> str:
    return "professor" if role == Role.faculty else role.value


def _pair_ids(first_id: int, second_id: int) -> tuple[int, int]:
    return (first_id, second_id) if first_id < second_id else (second_id, first_id)


def _safe_filename(filename: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", filename.strip())
    return cleaned.strip(".-") or "attachment"


def _format_bytes(size: int) -> str:
    if size < 1024:
        return f"{size} B"
    if size < 1024 * 1024:
        return f"{size / 1024:.1f} KB"
    return f"{size / (1024 * 1024):.1f} MB"


def _require_connect_user(user: User) -> None:
    if user.role not in CONNECT_ROLES:
        raise HTTPException(status_code=403, detail="Campus Connect is available to students and professors only")


def _target_user(db: Session, target_id: int, current_user: User) -> User:
    if target_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot connect with yourself")
    user = db.get(User, target_id)
    if not user or user.role not in CONNECT_ROLES:
        raise HTTPException(status_code=404, detail="Campus Connect user not found")
    return user


def _relationship(db: Session, first_id: int, second_id: int) -> ConnectRelationship | None:
    low_id, high_id = _pair_ids(first_id, second_id)
    return (
        db.query(ConnectRelationship)
        .filter(ConnectRelationship.user_low_id == low_id, ConnectRelationship.user_high_id == high_id)
        .first()
    )


def _relationship_status(relationship: ConnectRelationship | None, viewer_id: int) -> str:
    if not relationship:
        return "none"
    if relationship.status == "accepted":
        return "friend"
    if relationship.status == "pending":
        return "sent" if relationship.requester_id == viewer_id else "received"
    if relationship.status == "blocked":
        return "blocked" if relationship.blocked_by_id == viewer_id else "blocked_by_them"
    return "none"


def _require_friendship(db: Session, current_user: User, target_id: int) -> ConnectRelationship:
    relationship = _relationship(db, current_user.id, target_id)
    if not relationship or relationship.status != "accepted":
        raise HTTPException(status_code=403, detail="You must be friends before chatting")
    return relationship


def _person_profile(db: Session, user: User, setting=None) -> dict:
    if user.role == Role.student:
        profile = user.student_profile
        setting = setting or get_campus_attendance_setting(db)
        semester = resolve_student_semester(
            profile,
            user,
            setting.semester_duration_months,
            setting.semester_duration_unit,
            setting.semester_duration_days,
        )
        department = profile.department if profile else "Computer Science & AI"
        student_code = profile.student_code if profile else f"CV-2026-{1000 + user.id}"
        cgpa = profile.cgpa if profile else 0
        attendance = profile.attendance if profile else 0
        return {
            "headline": f"{department} / Sem {semester}",
            "department": department,
            "meta": f"Roll {student_code} / CGPA {cgpa:.1f} / Attendance {attendance:.0f}%",
            "details": {
                "rollNumber": student_code,
                "semester": str(semester),
                "address": profile.address if profile else "Campus Residence",
                "cgpa": f"{cgpa:.1f}",
                "attendance": f"{attendance:.0f}%",
            },
        }

    profile = user.professor_profile
    designation = profile.designation if profile else "Professor"
    department = profile.department if profile else "Academic Department"
    expertise = profile.expertise_field if profile else "Campus academics"
    return {
        "headline": designation,
        "department": department,
        "meta": expertise,
        "details": {
            "address": profile.address if profile else "Campus Office",
            "highestEducation": profile.highest_education if profile else "Verified faculty",
            "expertise": expertise,
            "designation": designation,
            "document": profile.license_document_name if profile else "Faculty profile",
            "verification": profile.verification_status if profile else "verified",
        },
    }


def _person_out(
    db: Session,
    user: User,
    viewer_id: int,
    relationship: ConnectRelationship | None = None,
    setting=None,
) -> dict:
    profile = _person_profile(db, user, setting)
    return {
        "id": user.id,
        "name": user.full_name,
        "role": _public_role(user.role),
        "headline": profile["headline"],
        "department": profile["department"],
        "meta": profile["meta"],
        "email": user.email,
        "status": _relationship_status(relationship, viewer_id),
        "relationshipId": relationship.id if relationship else None,
        "avatar": _avatar(user.full_name),
        "avatarUrl": user_avatar_url(user),
        "online": _is_online(user),
        "lastSeenAt": user.last_seen_at.isoformat() if user.last_seen_at else None,
        "details": profile["details"],
    }


def _attachment_out(attachment: ConnectAttachment) -> dict:
    return {
        "id": attachment.id,
        "name": attachment.filename,
        "type": attachment.content_type,
        "size": _format_bytes(attachment.size),
        "url": attachment.url,
    }


def _message_out(db: Session, viewer_id: int, message: ConnectMessage) -> dict:
    return _message_out_with_attachments(db, viewer_id, message, None)


def _message_out_with_attachments(
    db: Session,
    viewer_id: int,
    message: ConnectMessage,
    attachments: list[ConnectAttachment] | None,
) -> dict:
    if attachments is None and not message.deleted_for_everyone:
        attachments = (
            db.query(ConnectAttachment)
            .filter(ConnectAttachment.message_id == message.id)
            .order_by(ConnectAttachment.id.asc())
            .all()
        )
    visible_attachments = [] if message.deleted_for_everyone else attachments or []

    return {
        "id": message.id,
        "userId": message.receiver_id if message.sender_id == viewer_id else message.sender_id,
        "senderId": message.sender_id,
        "receiverId": message.receiver_id,
        "author": "me" if message.sender_id == viewer_id else "them",
        "text": "" if message.deleted_for_everyone else message.body,
        "time": message.created_at.strftime("%I:%M %p"),
        "createdAt": message.created_at.isoformat(),
        "edited": bool(message.edited_at),
        "deletedForEveryone": message.deleted_for_everyone,
        "files": [_attachment_out(attachment) for attachment in visible_attachments],
    }


def _delete_attachment_file(url: str) -> None:
    if not url.startswith("/uploads/connect/"):
        return
    target_path = CONNECT_UPLOAD_DIR / Path(url).name
    try:
        if target_path.exists() and target_path.is_file():
            target_path.unlink()
    except OSError:
        pass


@router.get("/hub")
def connect_hub(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_connect_user(current_user)
    touched = _touch_presence(db, current_user)
    if touched:
        db.commit()
    setting = get_campus_attendance_setting(db)
    users = (
        db.query(User)
        .options(selectinload(User.student_profile), selectinload(User.professor_profile))
        .filter(User.role.in_(CONNECT_ROLES), User.id != current_user.id)
        .order_by(User.full_name.asc())
        .all()
    )
    relationships = (
        db.query(ConnectRelationship)
        .filter(
            or_(
                ConnectRelationship.user_low_id == current_user.id,
                ConnectRelationship.user_high_id == current_user.id,
            )
        )
        .all()
    )
    relationships_by_user = {
        relationship.user_high_id if relationship.user_low_id == current_user.id else relationship.user_low_id: relationship
        for relationship in relationships
    }
    people = [
        _person_out(db, user, current_user.id, relationships_by_user.get(user.id), setting)
        for user in users
    ]
    return {
        "viewer": {
            "id": current_user.id,
            "name": current_user.full_name,
            "email": current_user.email,
            "role": _public_role(current_user.role),
            "avatar": _avatar(current_user.full_name),
            "avatarUrl": user_avatar_url(current_user),
        },
        "people": people,
        "counts": {
            "friends": sum(1 for person in people if person["status"] == "friend"),
            "requests": sum(1 for person in people if person["status"] == "received"),
            "sent": sum(1 for person in people if person["status"] == "sent"),
            "blocked": sum(1 for person in people if person["status"] in {"blocked", "blocked_by_them"}),
        },
        "syncedAt": _now().isoformat(),
    }


@router.post("/requests/{target_id}")
def send_request(
    target_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_connect_user(current_user)
    _touch_presence(db, current_user)
    target = _target_user(db, target_id, current_user)
    relationship = _relationship(db, current_user.id, target.id)
    if relationship:
        if relationship.status == "accepted":
            return {"ok": True, "status": "friend"}
        if relationship.status == "pending":
            return {"ok": True, "status": _relationship_status(relationship, current_user.id)}
        if relationship.status == "blocked":
            if relationship.blocked_by_id == current_user.id:
                raise HTTPException(status_code=409, detail="Unblock this user before sending a request")
            raise HTTPException(status_code=403, detail="This user is not available for requests")

    low_id, high_id = _pair_ids(current_user.id, target.id)
    relationship = ConnectRelationship(
        user_low_id=low_id,
        user_high_id=high_id,
        requester_id=current_user.id,
        receiver_id=target.id,
        status="pending",
    )
    db.add(relationship)
    db.commit()
    return {"ok": True, "status": "sent"}


@router.post("/requests/{target_id}/accept")
def accept_request(
    target_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_connect_user(current_user)
    _touch_presence(db, current_user)
    target = _target_user(db, target_id, current_user)
    relationship = _relationship(db, current_user.id, target.id)
    if not relationship or relationship.status != "pending" or relationship.receiver_id != current_user.id:
        raise HTTPException(status_code=404, detail="Incoming request not found")
    relationship.status = "accepted"
    relationship.updated_at = _now()
    db.commit()
    return {"ok": True, "status": "friend"}


@router.delete("/requests/{target_id}")
def remove_request(
    target_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_connect_user(current_user)
    _touch_presence(db, current_user)
    target = _target_user(db, target_id, current_user)
    relationship = _relationship(db, current_user.id, target.id)
    if not relationship or relationship.status != "pending":
        return {"ok": True, "status": "none"}
    db.delete(relationship)
    db.commit()
    return {"ok": True, "status": "none"}


@router.post("/users/{target_id}/block")
def block_user(
    target_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_connect_user(current_user)
    _touch_presence(db, current_user)
    target = _target_user(db, target_id, current_user)
    relationship = _relationship(db, current_user.id, target.id)
    low_id, high_id = _pair_ids(current_user.id, target.id)
    if not relationship:
        relationship = ConnectRelationship(
            user_low_id=low_id,
            user_high_id=high_id,
            requester_id=current_user.id,
            receiver_id=target.id,
        )
        db.add(relationship)
    relationship.status = "blocked"
    relationship.blocked_by_id = current_user.id
    relationship.updated_at = _now()
    db.commit()
    return {"ok": True, "status": "blocked"}


@router.post("/users/{target_id}/unblock")
def unblock_user(
    target_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_connect_user(current_user)
    _touch_presence(db, current_user)
    target = _target_user(db, target_id, current_user)
    relationship = _relationship(db, current_user.id, target.id)
    if not relationship or relationship.status != "blocked":
        return {"ok": True, "status": "none"}
    if relationship.blocked_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the blocker can unblock this connection")
    db.delete(relationship)
    db.commit()
    return {"ok": True, "status": "none"}


@router.get("/conversations/{target_id}/messages")
def conversation_messages(
    target_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_connect_user(current_user)
    _touch_presence(db, current_user)
    target = _target_user(db, target_id, current_user)
    _require_friendship(db, current_user, target.id)
    db.commit()
    hidden_ids = {
        row[0]
        for row in db.query(ConnectMessageHidden.message_id)
        .filter(ConnectMessageHidden.user_id == current_user.id)
        .all()
    }
    rows = (
        db.query(ConnectMessage)
        .filter(
            or_(
                and_(ConnectMessage.sender_id == current_user.id, ConnectMessage.receiver_id == target.id),
                and_(ConnectMessage.sender_id == target.id, ConnectMessage.receiver_id == current_user.id),
            )
        )
        .order_by(ConnectMessage.created_at.asc(), ConnectMessage.id.asc())
        .limit(300)
        .all()
    )
    visible_rows = [row for row in rows if row.id not in hidden_ids]
    attachments_by_message: dict[int, list[ConnectAttachment]] = {row.id: [] for row in visible_rows}
    if attachments_by_message:
        attachments = (
            db.query(ConnectAttachment)
            .filter(ConnectAttachment.message_id.in_(list(attachments_by_message)))
            .order_by(ConnectAttachment.message_id.asc(), ConnectAttachment.id.asc())
            .all()
        )
        for attachment in attachments:
            attachments_by_message.setdefault(attachment.message_id, []).append(attachment)
    messages = [
        _message_out_with_attachments(db, current_user.id, row, attachments_by_message.get(row.id, []))
        for row in visible_rows
    ]
    return {"ok": True, "messages": messages}


@router.post("/messages")
def create_message(
    receiver_id: Annotated[int, Form(...)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    body: Annotated[str, Form()] = "",
    files: Annotated[list[UploadFile] | None, File()] = None,
) -> dict:
    _require_connect_user(current_user)
    _touch_presence(db, current_user)
    receiver = _target_user(db, receiver_id, current_user)
    _require_friendship(db, current_user, receiver.id)
    clean_body = body.strip()
    uploads = [file for file in (files or []) if file.filename]
    if not clean_body and not uploads:
        raise HTTPException(status_code=422, detail="Write a message or attach a file")

    ensure_upload_dirs()
    message = ConnectMessage(sender_id=current_user.id, receiver_id=receiver.id, body=clean_body)
    db.add(message)
    db.flush()

    for upload in uploads:
        original_name = Path(upload.filename or "attachment").name
        safe_name = _safe_filename(original_name)
        stored_name = f"{_now().strftime('%Y%m%d%H%M%S')}_{uuid4().hex[:10]}_{safe_name}"
        target_path = CONNECT_UPLOAD_DIR / stored_name
        with target_path.open("wb") as buffer:
            shutil.copyfileobj(upload.file, buffer)
        db.add(
            ConnectAttachment(
                message_id=message.id,
                filename=original_name,
                content_type=upload.content_type or "application/octet-stream",
                url=f"/uploads/connect/{stored_name}",
                size=target_path.stat().st_size,
            )
        )

    db.commit()
    db.refresh(message)
    return {"ok": True, "message": _message_out(db, current_user.id, message)}


@router.patch("/messages/{message_id}")
def edit_message(
    message_id: int,
    payload: ConnectMessageEdit,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_connect_user(current_user)
    _touch_presence(db, current_user)
    message = db.get(ConnectMessage, message_id)
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    if message.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can edit only your own message")
    if message.deleted_for_everyone:
        raise HTTPException(status_code=409, detail="Deleted messages cannot be edited")
    _require_friendship(db, current_user, message.receiver_id)
    message.body = payload.body
    message.edited_at = _now()
    message.updated_at = _now()
    db.commit()
    db.refresh(message)
    return {"ok": True, "message": _message_out(db, current_user.id, message)}


@router.delete("/messages/{message_id}")
def delete_message(
    message_id: int,
    payload: ConnectMessageDelete,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    _require_connect_user(current_user)
    _touch_presence(db, current_user)
    message = db.get(ConnectMessage, message_id)
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    other_id = message.receiver_id if message.sender_id == current_user.id else message.sender_id
    _require_friendship(db, current_user, other_id)

    if payload.mode == "everyone":
        if message.sender_id != current_user.id:
            raise HTTPException(status_code=403, detail="You can delete everyone only for your own messages")
        for attachment in db.query(ConnectAttachment).filter(ConnectAttachment.message_id == message.id).all():
            _delete_attachment_file(attachment.url)
            db.delete(attachment)
        message.body = ""
        message.deleted_for_everyone = True
        message.updated_at = _now()
        db.commit()
        db.refresh(message)
        return {"ok": True, "message": _message_out(db, current_user.id, message)}

    hidden = (
        db.query(ConnectMessageHidden)
        .filter(ConnectMessageHidden.message_id == message.id, ConnectMessageHidden.user_id == current_user.id)
        .first()
    )
    if not hidden:
        db.add(ConnectMessageHidden(message_id=message.id, user_id=current_user.id))
        db.commit()
    return {"ok": True, "id": message.id}
