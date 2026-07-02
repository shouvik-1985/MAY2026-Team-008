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
            "blob": "BLOB",
            "timestamp": "TIMESTAMP",
            "student_address": "VARCHAR(255) NOT NULL DEFAULT 'Campus Residence'",
        }[sql_type]
    return {
        "bool": "BOOLEAN NOT NULL DEFAULT FALSE",
        "blob": "BYTEA",
        "timestamp": "TIMESTAMP WITH TIME ZONE",
        "student_address": "VARCHAR(255) NOT NULL DEFAULT 'Campus Residence'",
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

    resource_columns = set()
    if "study_resources" in tables:
        resource_columns = {column["name"] for column in inspector.get_columns("study_resources")}

    resource_additions = {
        "filename": "VARCHAR(255)",
        "content_type": "VARCHAR(120)",
        "file_size": "INTEGER",
        "file_data": _column_sql("blob"),
    }

    with engine.begin() as connection:
        for name, definition in user_additions.items():
            if name not in user_columns:
                connection.execute(text(f"ALTER TABLE users ADD COLUMN {name} {definition}"))

        if "student_profiles" in tables and "address" not in profile_columns:
            connection.execute(
                text(f"ALTER TABLE student_profiles ADD COLUMN address {_column_sql('student_address')}")
            )

        if "study_resources" in tables:
            for name, definition in resource_additions.items():
                if name not in resource_columns:
                    connection.execute(text(f"ALTER TABLE study_resources ADD COLUMN {name} {definition}"))


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
