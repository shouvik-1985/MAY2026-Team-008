import os
import uuid
from datetime import date, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


TEST_DB_PATH = Path(__file__).resolve().parent / "test_auth.db"

os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH}"
os.environ["JWT_SECRET"] = "test-secret"
os.environ["ALLOW_DEMO_GOOGLE"] = "true"

from app.core.config import get_settings

get_settings.cache_clear()

from app.db import engine, SessionLocal
from app.main import app
from app.models import StudentProfile


@pytest.fixture(scope="session")
def client():
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()

    with TestClient(app) as test_client:
        yield test_client

    engine.dispose()
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()


def unique_email(prefix: str) -> str:
    """Generate a collision-free email for tests that create new accounts."""
    return f"{prefix}-{uuid.uuid4().hex[:10]}@example.com"


@pytest.fixture
def admin_headers(client):
    """Authorization headers for the seeded demo admin account."""
    response = client.post(
        "/api/auth/login",
        json={"email": "admin@campusverse.edu", "password": "admin123"},
    )
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def make_student(client):
    """Factory fixture: register a brand-new student and return their token/user/email."""

    def _make(**overrides):
        email = overrides.pop("email", unique_email("student"))
        payload = {
            "full_name": "Test Student",
            "email": email,
            "password": "strongpass123",
            "role": "student",
        }
        payload.update(overrides)
        response = client.post("/api/auth/register", json=payload)
        assert response.status_code == 201, response.text
        data = response.json()
        headers = {"Authorization": f"Bearer {data['access_token']}"}
        return {"headers": headers, "user": data["user"], "email": email, "token": data["access_token"]}

    return _make


@pytest.fixture
def make_professor(client):
    """Factory fixture: register a brand-new professor (faculty) and return their token/user/email."""

    def _make(**overrides):
        email = overrides.pop("email", unique_email("professor"))
        payload = {
            "full_name": "Dr. Test Professor",
            "email": email,
            "password": "strongpass123",
            "role": "faculty",
            "address": "Campus Block B",
            "gender": "female",
            "highest_education": "PhD",
            "expertise_field": "Computer Science",
            "department": "Computer Science & AI",
            "designation": "Assistant Professor",
            "license_document_name": "license.pdf",
        }
        payload.update(overrides)
        response = client.post("/api/auth/register", json=payload)
        assert response.status_code == 201, response.text
        data = response.json()
        headers = {"Authorization": f"Bearer {data['access_token']}"}
        return {"headers": headers, "user": data["user"], "email": email, "token": data["access_token"]}

    return _make


@pytest.fixture
def placement_manager_headers(client):
    """Authorization headers for the seeded demo placement manager account."""
    response = client.post(
        "/api/auth/login",
        json={"email": "placementpartner@gmail.com", "password": "manager#123"},
    )
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def make_eligible_student(client, make_student):
    """Register a student and directly backdate their enrollment + raise CGPA so they
    satisfy the placement portal's minimum-semester (3) / minimum-CGPA (7.5) criteria,
    regardless of whatever semester-duration settings other tests may have left behind.
    There is no public API to set enrollment date, so this reaches into the DB directly
    (a common, pragmatic pattern for arranging otherwise-unreachable test state).
    """

    def _make(**overrides):
        student = make_student(**overrides)
        db = SessionLocal()
        try:
            profile = (
                db.query(StudentProfile)
                .filter(StudentProfile.user_id == student["user"]["id"])
                .first()
            )
            profile.enrollment_date = date.today() - timedelta(days=3650)
            profile.cgpa = 9.0
            db.commit()
        finally:
            db.close()
        return student

    return _make
