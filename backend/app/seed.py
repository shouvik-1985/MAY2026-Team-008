from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models import AuthProvider, Role, StudentProfile, User


def seed_demo_data(db: Session) -> None:
    admin = db.query(User).filter(User.email == "admin@gmail.com").first()
    if admin:
        if not admin.hashed_password or not admin.hashed_password.startswith("pbkdf2_sha256$"):
            admin.hashed_password = hash_password("admin#123")
            admin.auth_provider = AuthProvider.password
        admin.role = Role.admin
        admin.full_name = admin.full_name or "Campus Admin"
    else:
        db.add(
            User(
                email="admin@gmail.com",
                full_name="Campus Admin",
                role=Role.admin,
                auth_provider=AuthProvider.password,
                hashed_password=hash_password("admin#123"),
            )
        )

    existing = db.query(User).filter(User.email == "student@campusverse.edu").first()
    if existing:
        if not existing.hashed_password or not existing.hashed_password.startswith("pbkdf2_sha256$"):
            existing.hashed_password = hash_password("student123")
            existing.auth_provider = AuthProvider.password
        if existing.role == Role.student and not existing.student_profile:
            db.add(
                StudentProfile(
                    user_id=existing.id,
                    student_code="CV-2026-1187",
                    department="Computer Science & AI",
                    semester=6,
                    cgpa=9.2,
                    attendance=92.0,
                )
            )
        db.commit()
        return

    user = User(
        email="student@campusverse.edu",
        full_name="Girish Kumar",
        role=Role.student,
        auth_provider=AuthProvider.password,
        hashed_password=hash_password("student123"),
    )
    db.add(user)
    db.flush()
    db.add(
        StudentProfile(
            user_id=user.id,
            student_code="CV-2026-1187",
            department="Computer Science & AI",
            semester=6,
            cgpa=9.2,
            attendance=92.0,
        )
    )
    db.commit()
