from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.intake_flow import local_today
from app.models import AuthProvider, IntakeSlotBatch, ProfessorProfile, Role, StudentProfile, User


def _ensure_default_intake_batch(db: Session) -> IntakeSlotBatch:
    batch = db.query(IntakeSlotBatch).filter(IntakeSlotBatch.batch_name == "Sem 1 Open Intake").first()
    if batch:
        batch.total_slots = max(batch.total_slots, 5000)
        batch.open_for_intake = True
        return batch

    batch = IntakeSlotBatch(
        batch_name="Sem 1 Open Intake",
        total_slots=5000,
        open_for_intake=True,
    )
    db.add(batch)
    db.flush()
    return batch


def _ensure_demo_student(db: Session, batch: IntakeSlotBatch) -> None:
    student = db.query(User).filter(User.email == "student@campusverse.edu").first()
    if student:
        student.full_name = student.full_name or "Cristiano Ronaldo"
        student.role = Role.student
        student.auth_provider = AuthProvider.password
        student.hashed_password = hash_password("student123")
    else:
        student = User(
            email="student@campusverse.edu",
            full_name="Cristiano Ronaldo",
            role=Role.student,
            auth_provider=AuthProvider.password,
            hashed_password=hash_password("student123"),
        )
        db.add(student)
        db.flush()

    if not student.student_profile:
        db.add(
            StudentProfile(
                user_id=student.id,
                student_code=f"CV-2026-{1000 + student.id:04d}",
                address="Campus Residence",
                department="Computer Science & AI",
                semester=4,
                cgpa=9.3,
                attendance=94.5,
                enrollment_date=local_today(),
                slot_batch_id=batch.id,
            )
        )
    else:
        student.student_profile.slot_batch_id = student.student_profile.slot_batch_id or batch.id
        student.student_profile.enrollment_date = student.student_profile.enrollment_date or local_today()


def _ensure_demo_professor(db: Session) -> None:
    professor = db.query(User).filter(User.email == "professor@campusverse.edu").first()
    if professor:
        professor.full_name = professor.full_name or "Shruti Tiwari"
        professor.role = Role.faculty
        professor.auth_provider = AuthProvider.password
        professor.hashed_password = hash_password("professor123")
    else:
        professor = User(
            email="professor@campusverse.edu",
            full_name="Shruti Tiwari",
            role=Role.faculty,
            auth_provider=AuthProvider.password,
            hashed_password=hash_password("professor123"),
        )
        db.add(professor)
        db.flush()

    if not professor.professor_profile:
        db.add(
            ProfessorProfile(
                user_id=professor.id,
                address="Faculty Block A",
                gender="female",
                highest_education="PhD",
                expertise_field="Distributed Systems",
                department="Computer Science & AI",
                designation="Assistant Professor",
                license_document_name="faculty-license.pdf",
                verification_status="verified",
            )
        )


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
    intake_batch = _ensure_default_intake_batch(db)
    _ensure_demo_student(db, intake_batch)
    _ensure_demo_professor(db)
    _ensure_demo_admin(db)
    _ensure_placement_manager(db)
    db.commit()
