from __future__ import annotations

from app.models import StudentProfile, User


def avatar_initials(name: str, fallback: str = "CV") -> str:
    initials = "".join(part[0] for part in name.split()[:2]).upper()
    return initials or fallback


def student_avatar_url(profile: StudentProfile | None) -> str | None:
    if not profile or not profile.avatar_url:
        return None
    return profile.avatar_url


def user_avatar_url(user: User | None) -> str | None:
    if not user:
        return None
    return student_avatar_url(user.student_profile)
