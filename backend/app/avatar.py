from app.models import ProfessorProfile, StudentProfile, User


def avatar_initials(name: str, fallback: str = "CV") -> str:
    initials = "".join(part[0] for part in name.split()[:2]).upper()
    return initials or fallback


def student_avatar_url(profile: StudentProfile | None) -> str | None:
    if not profile or not profile.avatar_url:
        return None
    return profile.avatar_url


def professor_avatar_url(profile: ProfessorProfile | None) -> str | None:
    if not profile or not profile.avatar_url:
        return None
    return profile.avatar_url


def user_avatar_url(user: User | None) -> str | None:
    if not user:
        return None
    if user.student_profile:
        return student_avatar_url(user.student_profile)
    if user.professor_profile:
        return professor_avatar_url(user.professor_profile)
    return None
