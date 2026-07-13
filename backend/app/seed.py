from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models import AuthProvider, Role, User


def _ensure_demo_admin(db: Session) -> None:
    admin = db.query(User).filter(User.email == "admin@campusverse.edu").first()
    if admin:
        if not admin.hashed_password or not admin.hashed_password.startswith("pbkdf2_sha256$"):
            admin.hashed_password = hash_password("admin123")
            admin.auth_provider = AuthProvider.password
        if admin.role != Role.admin:
            admin.role = Role.admin
        return

    db.add(
        User(
            email="admin@campusverse.edu",
            full_name="CampusVerse Admin",
            role=Role.admin,
            auth_provider=AuthProvider.password,
            hashed_password=hash_password("admin123"),
        )
    )


def _ensure_placement_manager(db: Session) -> None:
    manager = db.query(User).filter(User.email == "placementpartner@gmail.com").first()
    if manager:
        manager.full_name = manager.full_name or "Placement Partner Manager"
        manager.role = Role.placement
        manager.auth_provider = AuthProvider.password
        manager.hashed_password = hash_password("manager#123")
        return

    db.add(
        User(
            email="placementpartner@gmail.com",
            full_name="Placement Partner Manager",
            role=Role.placement,
            auth_provider=AuthProvider.password,
            hashed_password=hash_password("manager#123"),
        )
    )


def seed_demo_data(db: Session) -> None:
    _ensure_demo_admin(db)
    _ensure_placement_manager(db)
    db.commit()
