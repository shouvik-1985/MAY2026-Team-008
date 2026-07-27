from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def _column_sql(sql_type: str) -> str:
    if engine.dialect.name == "sqlite":
        return {
            "bool": "BOOLEAN NOT NULL DEFAULT 0",
            "bool_true": "BOOLEAN NOT NULL DEFAULT 1",
            "blob": "BLOB",
            "timestamp": "TIMESTAMP",
            "timestamp_now": "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP",
            "date": "DATE",
            "text": "TEXT",
            "text_required": "TEXT NOT NULL DEFAULT ''",
            "float_default_7_5": "FLOAT NOT NULL DEFAULT 7.5",
            "student_address": "VARCHAR(255) NOT NULL DEFAULT 'Campus Residence'",
            "semester_duration": "INTEGER NOT NULL DEFAULT 6",
            "semester_duration_days": "INTEGER NOT NULL DEFAULT 180",
            "semester_duration_unit": "VARCHAR(10) NOT NULL DEFAULT 'months'",
        }[sql_type]
    return {
        "bool": "BOOLEAN NOT NULL DEFAULT FALSE",
        "bool_true": "BOOLEAN NOT NULL DEFAULT TRUE",
        "blob": "BYTEA",
        "timestamp": "TIMESTAMP WITH TIME ZONE",
        "timestamp_now": "TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP",
        "date": "DATE",
        "text": "TEXT",
        "text_required": "TEXT NOT NULL DEFAULT ''",
        "float_default_7_5": "DOUBLE PRECISION NOT NULL DEFAULT 7.5",
        "student_address": "VARCHAR(255) NOT NULL DEFAULT 'Campus Residence'",
        "semester_duration": "INTEGER NOT NULL DEFAULT 6",
        "semester_duration_days": "INTEGER NOT NULL DEFAULT 180",
        "semester_duration_unit": "VARCHAR(10) NOT NULL DEFAULT 'months'",
    }[sql_type]


def ensure_database_shape() -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "users" not in tables:
        return

    user_columns = {column["name"] for column in inspector.get_columns("users")}
    user_additions = {
        "is_blocked": _column_sql("bool"),
        "block_reason": "VARCHAR(255)",
        "blocked_at": _column_sql("timestamp"),
        "blocked_by_id": "INTEGER",
        "last_seen_at": _column_sql("timestamp"),
    }

    profile_columns = set()
    if "student_profiles" in tables:
        profile_columns = {column["name"] for column in inspector.get_columns("student_profiles")}
    profile_additions = {
        "biometric_template": _column_sql("text"),
        "biometric_template_version": "VARCHAR(40)",
        "biometric_enrolled_at": _column_sql("timestamp"),
        "phone": "VARCHAR(40)",
        "bio": _column_sql("text"),
        "focus_area": "VARCHAR(180)",
        "skills_text": _column_sql("text"),
        "guardian_name": "VARCHAR(120)",
        "guardian_phone": "VARCHAR(40)",
        "city": "VARCHAR(120)",
        "state": "VARCHAR(120)",
        "linkedin_url": "VARCHAR(255)",
        "github_url": "VARCHAR(255)",
        "avatar_url": _column_sql("text"),
        "completed_credits": "INTEGER",
        "total_credits": "INTEGER NOT NULL DEFAULT 180",
    }
    campus_setting_columns = set()
    if "campus_attendance_settings" in tables:
        campus_setting_columns = {column["name"] for column in inspector.get_columns("campus_attendance_settings")}

    resource_columns = set()
    if "study_resources" in tables:
        resource_columns = {column["name"] for column in inspector.get_columns("study_resources")}

    assignment_submission_columns = set()
    if "assignment_submissions" in tables:
        assignment_submission_columns = {
            column["name"] for column in inspector.get_columns("assignment_submissions")
        }

    certificate_request_columns = set()
    if "student_certificate_requests" in tables:
        certificate_request_columns = {
            column["name"] for column in inspector.get_columns("student_certificate_requests")
        }
    certificate_request_additions = {
        "purpose": "VARCHAR(180)",
        "certificate_body": _column_sql("text"),
        "signatory_name": "VARCHAR(120)",
        "signatory_title": "VARCHAR(160)",
        "admin_note": _column_sql("text"),
    }

    resource_additions = {
        "filename": "VARCHAR(255)",
        "content_type": "VARCHAR(120)",
        "file_size": "INTEGER",
        "file_data": _column_sql("blob"),
    }

    placement_role_columns = set()
    if "placement_roles" in tables:
        placement_role_columns = {column["name"] for column in inspector.get_columns("placement_roles")}
    placement_role_additions = {
        "manager_id": "INTEGER",
        "title": "VARCHAR(160) NOT NULL DEFAULT 'Placement role'",
        "company_name": "VARCHAR(160) NOT NULL DEFAULT 'Campus partner'",
        "role_type": "VARCHAR(40) NOT NULL DEFAULT 'internship'",
        "location": "VARCHAR(160) NOT NULL DEFAULT 'Campus'",
        "work_mode": "VARCHAR(40) NOT NULL DEFAULT 'onsite'",
        "compensation": "VARCHAR(120) NOT NULL DEFAULT 'Not disclosed'",
        "deadline": "VARCHAR(80) NOT NULL DEFAULT 'Rolling'",
        "minimum_semester": "INTEGER NOT NULL DEFAULT 3",
        "minimum_cgpa": _column_sql("float_default_7_5"),
        "required_skills": _column_sql("text_required"),
        "description": "TEXT NOT NULL DEFAULT 'Role criteria will be updated.'",
        "status": "VARCHAR(40) NOT NULL DEFAULT 'open'",
        "active": _column_sql("bool_true"),
        "created_at": _column_sql("timestamp_now"),
        "updated_at": _column_sql("timestamp_now"),
    }

    placement_role_application_columns = set()
    if "placement_role_applications" in tables:
        placement_role_application_columns = {
            column["name"] for column in inspector.get_columns("placement_role_applications")
        }
    placement_role_application_additions = {
        "role_id": "INTEGER",
        "student_id": "INTEGER",
        "placement_application_id": "INTEGER",
        "status": "VARCHAR(40) NOT NULL DEFAULT 'applied'",
        "decision_message": _column_sql("text"),
        "decided_by_id": "INTEGER",
        "decided_at": _column_sql("timestamp"),
        "dismissed_by_student": _column_sql("bool"),
        "dismissed_by_manager": _column_sql("bool"),
        "created_at": _column_sql("timestamp_now"),
        "updated_at": _column_sql("timestamp_now"),
    }

    with engine.begin() as connection:
        if engine.dialect.name == "postgresql":
            connection.execute(text("ALTER TYPE role ADD VALUE IF NOT EXISTS 'placement'"))

        for name, definition in user_additions.items():
            if name not in user_columns:
                connection.execute(text(f"ALTER TABLE users ADD COLUMN {name} {definition}"))

        if "student_profiles" in tables and "address" not in profile_columns:
            connection.execute(
                text(f"ALTER TABLE student_profiles ADD COLUMN address {_column_sql('student_address')}")
            )

        if "student_profiles" in tables:
            if "enrollment_date" not in profile_columns:
                connection.execute(text(f"ALTER TABLE student_profiles ADD COLUMN enrollment_date {_column_sql('date')}"))
            if "slot_batch_id" not in profile_columns:
                connection.execute(text("ALTER TABLE student_profiles ADD COLUMN slot_batch_id INTEGER"))
            for name, definition in profile_additions.items():
                if name not in profile_columns:
                    connection.execute(text(f"ALTER TABLE student_profiles ADD COLUMN {name} {definition}"))

        if "study_resources" in tables:
            for name, definition in resource_additions.items():
                if name not in resource_columns:
                    connection.execute(text(f"ALTER TABLE study_resources ADD COLUMN {name} {definition}"))

        if "assignment_submissions" in tables and "professor_score" not in assignment_submission_columns:
            connection.execute(text("ALTER TABLE assignment_submissions ADD COLUMN professor_score FLOAT"))

        if "student_certificate_requests" in tables:
            for name, definition in certificate_request_additions.items():
                if name not in certificate_request_columns:
                    connection.execute(text(f"ALTER TABLE student_certificate_requests ADD COLUMN {name} {definition}"))

        if "placement_roles" in tables:
            for name, definition in placement_role_additions.items():
                if name not in placement_role_columns:
                    connection.execute(text(f"ALTER TABLE placement_roles ADD COLUMN {name} {definition}"))
            connection.execute(
                text(
                    "UPDATE placement_roles "
                    "SET manager_id = (SELECT id FROM users WHERE role = 'placement' LIMIT 1) "
                    "WHERE manager_id IS NULL"
                )
            )
            if "active" in placement_role_columns:
                connection.execute(text("UPDATE placement_roles SET active = TRUE WHERE active IS NULL"))
                if engine.dialect.name == "postgresql":
                    connection.execute(text("ALTER TABLE placement_roles ALTER COLUMN active SET DEFAULT TRUE"))

        if "placement_role_applications" in tables:
            for name, definition in placement_role_application_additions.items():
                if name not in placement_role_application_columns:
                    connection.execute(text(f"ALTER TABLE placement_role_applications ADD COLUMN {name} {definition}"))

        if "campus_attendance_settings" in tables and "semester_duration_months" not in campus_setting_columns:
            connection.execute(
                text(
                    f"ALTER TABLE campus_attendance_settings ADD COLUMN semester_duration_months {_column_sql('semester_duration')}"
                )
            )
        if "campus_attendance_settings" in tables and "semester_duration_unit" not in campus_setting_columns:
            connection.execute(
                text(
                    f"ALTER TABLE campus_attendance_settings ADD COLUMN semester_duration_unit {_column_sql('semester_duration_unit')}"
                )
            )
        if "campus_attendance_settings" in tables and "semester_duration_days" not in campus_setting_columns:
            connection.execute(
                text(
                    f"ALTER TABLE campus_attendance_settings ADD COLUMN semester_duration_days {_column_sql('semester_duration_days')}"
                )
            )


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
